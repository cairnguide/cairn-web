/**
 * Local stand-ins for Auth0 and the Cairn API, for the use case tests.
 *
 * The real Worker (wrangler dev) talks to this server exactly as it would
 * talk to Auth0 and the API in production: /authorize, /oauth/token, the
 * JWKS, /v2/logout, and the /v1 endpoints the setup screens use. Response
 * shapes and copy follow cairnguide/cairn-core api/openapi.json and
 * api/cairn_api/content/registration-copy.json.
 *
 * Tests steer it through POST /__control (reset, cancel the next sign-in,
 * mark an email as unverified, or pretend an email already has an account).
 *
 * Run: node tests/e2e/mock-server.ts   (port 8799, or MOCK_PORT)
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const PORT = Number(process.env.MOCK_PORT ?? 8799);
const BASE = `http://localhost:${PORT}`;
const CLIENT_ID = 'e2e-client';
const CLIENT_SECRET = 'e2e-not-a-secret';

// ---- Copy (from cairn-core registration-copy.json and voices/manifest.yaml) ----------

const COPY = {
  welcome_acknowledgment: "We're sorry you're here. Cairn will walk with you one step at a time.",
  oauth_cancelled: "No problem. You can choose another way whenever you're ready.",
  email_check_inbox: 'Check your inbox for a link from Cairn. It may take a minute.',
  account_exists:
    'It looks like you already have a Cairn account. Last time you signed in with {provider}.',
  privacy_terms_summary:
    'Your privacy matters, especially right now. Cairn never uses your information, or information about the person who died, for marketing or advertising. We do not sell it or share it for ads. We use it only to help you with the steps in front of you. You can delete your account and your information at any time from Settings.',
  privacy_terms_checkbox: 'I have read and agree to the Privacy Policy and Terms of Use.',
  trial_summary:
    'Cairn is free for 28 days, and we will not ask for a card. Your 28 days begin when you start your first journey, so nothing counts down while you get settled. Once they begin, they keep counting even if you pause.',
  trial_checkbox:
    'I understand that 28 days after I start my first case, I will need a subscription to keep using Cairn fully.',
  ai_notice:
    'Before we begin, an important notice. Cairn is an artificial intelligence (AI) guide. It is not a human. It is not an attorney and cannot give legal advice. It is not a therapist, counselor, or medical professional.',
  ai_notice_legal:
    'This notice is provided consistent with the disclosure requirements of California Senate Bill 243 (2025), which requires that you be told clearly that you are interacting with an artificially generated assistant and not a human.',
  ai_checkbox:
    'I understand Cairn is an AI guide, not a human, attorney, or therapist, and is not a substitute for professional advice.',
  decline_acknowledgment:
    "That's okay. You can't use Cairn without agreeing, but you're not stuck.",
  preferred_name_question: 'What would you like me to call you?',
  pronunciation_link: 'Add how to say it',
  pronunciation_question: 'How do you say it?',
  personality_question: 'How would you like me to talk with you? You can change this anytime.',
  personality_default_button: 'Choose for me',
  resume_onboarding: "Welcome back. You were almost done. Let's pick up where you left off.",
  need_a_moment_control: 'I need a moment',
  crisis_resource: 'You can call or text 988, or chat at 988lifeline.org, any time.',
  need_a_moment_acknowledgment:
    "Take all the time you need. Everything you've done is saved, and nothing here is going anywhere.",
  distress_acknowledgment:
    "Thank you for telling me. What you're going through matters more than any of this.",
  ready_to_continue: "I'm ready to continue",
  continue: 'Continue',
  not_sure: "I'm not sure",
};

const VOICES = [
  {
    value: 'steady_direct',
    label: 'Steady and Direct',
    tagline: 'Just the next step, clearly stated',
    confirm: "Thanks, {name}. We'll take this one step at a time.",
  },
  {
    value: 'warm_patient',
    label: 'Warm & Patient',
    tagline: 'Room to process before moving on',
    confirm: "Thank you, {name}. I'll go gently, one small step at a time.",
  },
  {
    value: 'brisk_businesslike',
    label: 'Brisk and Businesslike',
    tagline: 'Treat it like a project to close out',
    confirm: "Got it, {name}. I'll keep us organized and moving.",
  },
  {
    value: 'plain_practical',
    label: 'Plain and Practical',
    tagline: "No euphemisms, just what's true and what's next",
    confirm: "Got it, {name}. I'll tell you plainly what's true and what's next.",
  },
];

const VERSIONS = {
  privacy_terms: 'privacy-v1',
  trial_terms: 'trial-v2',
  ai_notice: 'ai-v1',
} as const;
type Consent = keyof typeof VERSIONS;

// ---- State ------------------------------------------------------------------------

interface Identity {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
}

const STEPS = [
  'account_created',
  'privacy_terms_accepted',
  'trial_terms_accepted',
  'ai_notice_accepted',
  'preferred_name_saved',
  'complete',
] as const;
type Step = (typeof STEPS)[number];

interface User {
  id: string;
  sub: string;
  email: string;
  method: 'google' | 'apple' | 'email';
  step: Step;
  preferred_name: string | null;
  name_pronunciation: string | null;
  name_prefill: string | null;
  voice: string;
  consents: { purpose: Consent; version: string; client: string }[];
}

interface Control {
  cancelNext: boolean;
  unverified: Set<string>;
  existing: Map<string, User['method']>;
}

let control: Control;
let users: Map<string, User>;
let codes: Map<string, { identity: Identity; nonce: string; redirectUri: string }>;
let tokens: Map<string, Identity>;
let lastIdentity: Identity | null;
/** Every request the Worker sent to the API, for assertions (method, path, body, auth). */
let apiLog: { method: string; path: string; body: unknown; authorized: boolean }[];

function reset(): void {
  control = { cancelNext: false, unverified: new Set(), existing: new Map() };
  users = new Map();
  codes = new Map();
  tokens = new Map();
  lastIdentity = null;
  apiLog = [];
}
reset();

const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...(await exportJWK(publicKey)), kid: 'mock', alg: 'RS256', use: 'sig' };

// ---- Helpers ------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function problem(
  res: ServerResponse,
  status: number,
  code: string,
  detail: string,
  extra: object = {},
): void {
  send(
    res,
    status,
    { type: `https://cairn.invalid/problems/${code}`, title: code, status, code, detail, ...extra },
    'application/problem+json',
  );
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function safeLocalRedirectTarget(target: string | null): string {
  if (!target) return '/';
  try {
    const base = new URL(BASE);
    const parsed = new URL(target, BASE);
    if (parsed.origin !== base.origin) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return '/';
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function identityFor(connection: string | null, loginHint: string | null): Identity {
  if (connection === 'google-oauth2') {
    return {
      sub: 'google-oauth2|dana',
      email: 'dana@example.com',
      email_verified: true,
      given_name: 'Dana',
    };
  }
  if (connection === 'apple') {
    return {
      sub: 'apple|dana',
      email: 'dana@privaterelay.appleid.com',
      email_verified: true,
      given_name: 'Dana',
    };
  }
  const email = loginHint ?? 'dana@example.com';
  return { sub: `email|${email}`, email, email_verified: !control.unverified.has(email) };
}

function methodOf(sub: string): User['method'] {
  if (sub.startsWith('google-oauth2|')) return 'google';
  if (sub.startsWith('apple|')) return 'apple';
  return 'email';
}

async function issueTokens(identity: Identity, nonce?: string) {
  const accessToken = `at_${randomUUID()}`;
  tokens.set(accessToken, identity);
  const refreshToken = `rt_${randomUUID()}`;
  tokens.set(refreshToken, identity);
  const idToken = await new SignJWT({
    ...identity,
    ...(nonce ? { nonce } : {}),
    name: identity.given_name ?? identity.email,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'mock' })
    .setIssuer(`${BASE}/`)
    .setAudience(CLIENT_ID)
    .setSubject(identity.sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: idToken,
    expires_in: 3600,
    token_type: 'Bearer',
  };
}

// ---- Onboarding responses (same shapes as the API) -----------------------------------

const NEXT_SCREEN: Record<Step, string> = {
  account_created: 'privacy_terms',
  privacy_terms_accepted: 'trial_terms',
  trial_terms_accepted: 'ai_notice',
  ai_notice_accepted: 'preferred_name',
  preferred_name_saved: 'personality',
  complete: 'case_handoff',
};

const agreeOptions = [
  { value: 'agree', label: COPY.continue },
  { value: 'not_sure', label: COPY.not_sure },
];

function screenFor(id: string, user: User) {
  const links = [
    { label: 'Privacy Policy', url: `${BASE}/legal/privacy` },
    { label: 'Terms of Use', url: `${BASE}/legal/terms` },
  ];
  switch (id) {
    case 'privacy_terms':
      return {
        screen: {
          id,
          body: [COPY.privacy_terms_summary],
          links,
          ai_provider: '[AI PROVIDER]',
          legal_review_required: true,
          checkbox: {
            label: COPY.privacy_terms_checkbox,
            checked: false,
            document_version: VERSIONS.privacy_terms,
          },
        },
        next_step: {
          action: 'acknowledge_privacy_terms',
          prompt: COPY.privacy_terms_checkbox,
          options: agreeOptions,
        },
      };
    case 'trial_terms':
      return {
        screen: {
          id,
          body: [COPY.trial_summary],
          checkbox: {
            label: COPY.trial_checkbox,
            checked: false,
            document_version: VERSIONS.trial_terms,
          },
        },
        next_step: {
          action: 'acknowledge_trial_terms',
          prompt: COPY.trial_checkbox,
          options: agreeOptions,
        },
      };
    case 'ai_notice':
      return {
        screen: {
          id,
          body: [COPY.ai_notice],
          legal_notice: [COPY.ai_notice_legal],
          legal_review_required: true,
          checkbox: {
            label: COPY.ai_checkbox,
            checked: false,
            document_version: VERSIONS.ai_notice,
          },
        },
        next_step: {
          action: 'acknowledge_ai_notice',
          prompt: COPY.ai_checkbox,
          options: agreeOptions,
        },
      };
    case 'preferred_name':
      return {
        screen: {
          id,
          input: {
            prefill: user.name_prefill,
            optional_link_label: COPY.pronunciation_link,
            optional_prompt: COPY.pronunciation_question,
          },
        },
        next_step: { action: 'provide_preferred_name', prompt: COPY.preferred_name_question },
      };
    case 'personality':
      return {
        screen: {
          id,
          sample_situation: 'I just found out I need to order death certificates.',
          choices: VOICES.map(({ value, label, tagline }) => ({
            value,
            label,
            tagline,
            sample: `[${label} sample reply]`,
          })),
          legal_review_required: true,
        },
        next_step: {
          action: 'choose_personality',
          prompt: COPY.personality_question,
          options: [
            ...VOICES.map(({ value, label }) => ({ value, label })),
            { value: 'choose_for_me', label: COPY.personality_default_button },
          ],
        },
      };
    default:
      return {
        screen: { id: 'case_handoff' },
        next_step: {
          action: 'choose_relationship',
          prompt: "When you're ready, we'll start with a few details about the person who died.",
        },
      };
  }
}

function account(user: User) {
  return {
    id: user.id,
    email: user.email,
    sign_in_method: user.method,
    preferred_name: user.preferred_name,
    name_pronunciation: user.name_pronunciation,
    voice: user.voice,
    status: user.step === 'complete' ? 'active_no_case' : 'pending_onboarding',
    onboarding_step: user.step,
    trial_started_at: null,
    trial_ends_at: null,
    trial_end_date: null,
    time_zone: 'America/New_York',
    ai_label: 'AI guide',
  };
}

const support = {
  need_a_moment_label: COPY.need_a_moment_control,
  crisis_resource: COPY.crisis_resource,
};

function onboarding(
  user: User,
  options: { resumed?: boolean; screen?: object; next_step?: object } = {},
) {
  const base = screenFor(NEXT_SCREEN[user.step], user);
  const notes =
    options.resumed && user.step !== 'account_created'
      ? [{ kind: 'acknowledgment', text: COPY.resume_onboarding }]
      : [];
  return {
    account: account(user),
    screen: options.screen ?? base.screen,
    notes,
    support,
    next_step: options.next_step ?? base.next_step,
  };
}

const CONSENT_STEP: Record<Consent, Step> = {
  privacy_terms: 'privacy_terms_accepted',
  trial_terms: 'trial_terms_accepted',
  ai_notice: 'ai_notice_accepted',
};
const REQUIRED_BEFORE: Record<Consent, Step> = {
  privacy_terms: 'account_created',
  trial_terms: 'privacy_terms_accepted',
  ai_notice: 'trial_terms_accepted',
};
const DISTRESS =
  /\b(suicid\w*|kill (my ?self|me)|end (it all|my life)|want(ed)? to die|can'?t go on)\b/i;

// ---- Routes ----------------------------------------------------------------------------

async function handleAuth0(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/.well-known/jwks.json') {
    send(res, 200, { keys: [jwk] });
    return true;
  }
  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    const redirectUri = q.get('redirect_uri') ?? '';
    const state = q.get('state') ?? '';
    if (
      q.get('client_id') !== CLIENT_ID ||
      q.get('code_challenge_method') !== 'S256' ||
      !q.get('code_challenge')
    ) {
      send(res, 400, 'bad authorize request', 'text/plain');
      return true;
    }
    if (control.cancelNext) {
      control.cancelNext = false;
      redirect(res, `${redirectUri}?error=access_denied&state=${state}`);
      return true;
    }
    let identity: Identity;
    if (q.get('prompt') === 'none') {
      if (!lastIdentity) {
        redirect(res, `${redirectUri}?error=login_required&state=${state}`);
        return true;
      }
      identity = { ...lastIdentity, email_verified: !control.unverified.has(lastIdentity.email) };
    } else {
      identity = identityFor(q.get('connection'), q.get('login_hint'));
    }
    lastIdentity = identity;
    const code = randomUUID();
    codes.set(code, { identity, nonce: q.get('nonce') ?? '', redirectUri });
    redirect(res, `${redirectUri}?code=${code}&state=${state}`);
    return true;
  }
  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) {
      send(res, 401, { error: 'invalid_client' });
      return true;
    }
    if (form.get('grant_type') === 'authorization_code') {
      const entry = codes.get(form.get('code') ?? '');
      codes.delete(form.get('code') ?? '');
      if (!entry || entry.redirectUri !== form.get('redirect_uri') || !form.get('code_verifier')) {
        send(res, 403, { error: 'invalid_grant' });
        return true;
      }
      send(res, 200, await issueTokens(entry.identity, entry.nonce));
      return true;
    }
    if (form.get('grant_type') === 'refresh_token') {
      const identity = tokens.get(form.get('refresh_token') ?? '');
      if (!identity) {
        send(res, 403, { error: 'invalid_grant' });
        return true;
      }
      send(res, 200, await issueTokens(identity));
      return true;
    }
    send(res, 400, { error: 'unsupported_grant_type' });
    return true;
  }
  if (url.pathname === '/oauth/revoke') {
    send(res, 200, {});
    return true;
  }
  if (url.pathname === '/v2/logout') {
    lastIdentity = null;
    redirect(res, safeLocalRedirectTarget(url.searchParams.get('returnTo')));
    return true;
  }
  return false;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET';
  const raw = method === 'GET' ? '' : await readBody(req);
  const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  const auth = req.headers.authorization ?? '';
  const identity = auth.startsWith('Bearer ') ? tokens.get(auth.slice(7)) : undefined;
  apiLog.push({ method, path: url.pathname, body, authorized: Boolean(identity) });
  const path = url.pathname;

  if (path === '/v1/welcome' && method === 'GET') {
    const cancelled = url.searchParams.get('oauth_cancelled') === 'true';
    send(res, 200, {
      acknowledgment: COPY.welcome_acknowledgment,
      methods: [
        { method: 'google', label: 'Continue with Google', auth0_connection: 'google-oauth2' },
        { method: 'apple', label: 'Continue with Apple', auth0_connection: 'apple' },
        { method: 'email', label: 'Continue with email', auth0_connection: 'email' },
      ],
      sign_in_label: 'Already have an account? Sign in.',
      not_ready: {
        label: 'Not ready to sign up? See what the first weeks look like.',
        url: `${BASE}/site/journey`,
      },
      notes: cancelled ? [{ kind: 'info', text: COPY.oauth_cancelled }] : [],
      support,
    });
    return;
  }
  if (path === '/v1/onboarding/need-a-moment' && method === 'GET') {
    send(res, 200, {
      screen: {
        id: 'paused',
        acknowledgment: COPY.need_a_moment_acknowledgment,
        body: [COPY.crisis_resource],
      },
      support,
      next_step: {
        action: 'paused',
        prompt: COPY.crisis_resource,
        options: [{ value: 'continue', label: COPY.ready_to_continue }],
      },
    });
    return;
  }

  if (!identity) {
    problem(res, 401, 'not_signed_in', 'Please sign in to continue.');
    return;
  }

  if (path === '/v1/registrations' && method === 'POST') {
    if (!identity.email_verified) {
      problem(res, 403, 'email_not_verified', COPY.email_check_inbox);
      return;
    }
    let user = users.get(identity.sub);
    const existingMethod = control.existing.get(identity.email);
    if (!user && existingMethod && existingMethod !== methodOf(identity.sub)) {
      const provider =
        existingMethod === 'email' ? 'email' : existingMethod === 'google' ? 'Google' : 'Apple';
      const label = `Sign in with ${provider}`;
      problem(res, 409, 'account_exists', COPY.account_exists.replace('{provider}', provider), {
        sign_in_method: existingMethod,
        next_step: {
          action: 'sign_in_with_existing_method',
          prompt: label,
          options: [{ value: existingMethod, label }],
        },
      });
      return;
    }
    const resumed = Boolean(user);
    if (!user) {
      user = {
        id: randomUUID(),
        sub: identity.sub,
        email: identity.email,
        method: methodOf(identity.sub),
        step: 'account_created',
        preferred_name: null,
        name_pronunciation: null,
        name_prefill: typeof body.name_from_provider === 'string' ? body.name_from_provider : null,
        voice: 'steady_direct',
        consents: [],
      };
      users.set(identity.sub, user);
    }
    send(res, resumed ? 200 : 201, onboarding(user, { resumed }));
    return;
  }

  const user = users.get(identity.sub);
  if (!user) {
    problem(res, 403, 'not_registered', 'Please finish signing up first.');
    return;
  }

  if (path === '/v1/onboarding' && method === 'GET') {
    send(res, 200, onboarding(user));
    return;
  }

  const ack = /^\/v1\/onboarding\/acknowledgments\/(privacy_terms|trial_terms|ai_notice)$/.exec(
    path,
  );
  if (ack && method === 'POST') {
    const consent = ack[1] as Consent;
    if (STEPS.indexOf(user.step) > STEPS.indexOf(REQUIRED_BEFORE[consent])) {
      send(res, 200, onboarding(user));
      return;
    }
    if (user.step !== REQUIRED_BEFORE[consent]) {
      problem(res, 409, 'out_of_order', 'There are a few steps left before you can start a case.');
      return;
    }
    if (body.agreed !== true) {
      send(
        res,
        200,
        onboarding(user, {
          screen: {
            id: 'declined',
            links: [
              { label: 'See what the first weeks look like', url: `${BASE}/site/journey` },
              { label: 'Contact support', url: `${BASE}/support` },
            ],
          },
          next_step: {
            action: 'acknowledgment_declined',
            prompt: COPY.decline_acknowledgment,
            options: [
              { value: `read_again:${consent}`, label: 'Read it again' },
              { value: 'journey_map', label: 'See what the first weeks look like' },
              { value: 'contact_support', label: 'Contact support' },
            ],
          },
        }),
      );
      return;
    }
    if (body.document_version !== VERSIONS[consent]) {
      problem(res, 422, 'acknowledgment_outdated', "We've updated this since you last saw it.", {
        document_version: VERSIONS[consent],
      });
      return;
    }
    user.consents.push({
      purpose: consent,
      version: String(body.document_version),
      client: String(body.client),
    });
    user.step = CONSENT_STEP[consent];
    send(res, 200, onboarding(user));
    return;
  }

  if (path === '/v1/onboarding/preferred-name' && method === 'PUT') {
    if (user.step !== 'ai_notice_accepted') {
      problem(res, 409, 'out_of_order', 'There are a few steps left before you can start a case.');
      return;
    }
    const name = String(body.preferred_name ?? '').trim();
    if (DISTRESS.test(name)) {
      send(
        res,
        200,
        onboarding(user, {
          screen: {
            id: 'paused',
            acknowledgment: COPY.distress_acknowledgment,
            body: [COPY.crisis_resource],
          },
          next_step: {
            action: 'paused',
            prompt: COPY.crisis_resource,
            options: [{ value: 'continue', label: COPY.ready_to_continue }],
          },
        }),
      );
      return;
    }
    user.preferred_name = name;
    user.name_pronunciation =
      typeof body.name_pronunciation === 'string' ? body.name_pronunciation : null;
    user.step = 'preferred_name_saved';
    send(res, 200, onboarding(user));
    return;
  }

  if (path === '/v1/onboarding/personality' && method === 'PUT') {
    if (user.step !== 'preferred_name_saved') {
      problem(res, 409, 'out_of_order', 'There are a few steps left before you can start a case.');
      return;
    }
    const choice = body.choice === 'choose_for_me' ? 'steady_direct' : String(body.choice);
    const voice = VOICES.find((v) => v.value === choice);
    if (!voice) {
      problem(res, 422, 'invalid_value', 'Please choose one of the options.');
      return;
    }
    user.voice = voice.value;
    user.step = 'complete';
    const base = onboarding(user);
    send(res, 200, {
      ...base,
      screen: {
        id: 'case_handoff',
        acknowledgment: voice.confirm.replace('{name}', user.preferred_name ?? ''),
      },
    });
    return;
  }

  if (path === '/v1/me' && method === 'GET') {
    send(res, 200, { account: account(user), notes: [] });
    return;
  }
  if (path === '/v1/me' && method === 'PATCH') {
    if (typeof body.preferred_name === 'string') user.preferred_name = body.preferred_name;
    if (typeof body.voice === 'string') user.voice = body.voice;
    send(res, 200, { account: account(user), notes: [] });
    return;
  }

  problem(res, 404, 'not_found', 'Not in the mock.');
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', BASE);
    try {
      if (url.pathname === '/__control' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          reset?: boolean;
          cancelNext?: boolean;
          unverified?: string[];
          verified?: string[];
          existing?: Record<string, User['method']>;
        };
        if (body.reset) reset();
        if (body.cancelNext) control.cancelNext = true;
        for (const email of body.unverified ?? []) control.unverified.add(email);
        for (const email of body.verified ?? []) control.unverified.delete(email);
        for (const [email, method] of Object.entries(body.existing ?? {}))
          control.existing.set(email, method);
        send(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/__log') {
        send(res, 200, { api: apiLog, users: [...users.values()] });
        return;
      }
      if (await handleAuth0(req, res, url)) return;
      if (url.pathname.startsWith('/v1/')) {
        await handleApi(req, res, url);
        return;
      }
      // Public pages the app links to (Privacy Policy, Terms, support, the site).
      send(
        res,
        200,
        `<!doctype html><title>${url.pathname}</title><h1>${url.pathname}</h1>`,
        'text/html',
      );
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : 'error' });
    }
  })();
});

server.listen(PORT, () => {
  console.log(`Mock Auth0 and Cairn API on ${BASE}`);
});
