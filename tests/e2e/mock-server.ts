/**
 * Local stand-ins for Auth0 and the Cairn API, for the use case tests.
 *
 * The real Worker (wrangler dev) talks to this server exactly as it would
 * talk to Auth0 and the API in production: /authorize, /oauth/token, the
 * JWKS, /v2/logout, and the Cairn API's /v1 endpoints (tests/e2e/mock-api.ts,
 * shaped like contract/openapi.json). /stripe/checkout stands in for Stripe.
 *
 * Tests steer it through POST /__control (reset, cancel the next sign-in,
 * mark an email as unverified, pretend an email already has an account, or
 * preset the next new account: setup finished, read-only, subscribed, or
 * with a started journey).
 *
 * Run: node tests/e2e/mock-server.ts   (port 8799, or MOCK_PORT)
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { handleApi, type Identity, type MockState } from './mock-api.ts';

const PORT = Number(process.env.MOCK_PORT ?? 8799);
const BASE = `http://localhost:${PORT}`;
const CLIENT_ID = 'e2e-client';
const CLIENT_SECRET = 'e2e-not-a-secret';

// ---- State ------------------------------------------------------------------------

interface Control {
  cancelNext: boolean;
  unverified: Set<string>;
}

let control: Control;
let state: MockState;
let codes: Map<string, { identity: Identity; nonce: string; redirectUri: string }>;
let tokens: Map<string, Identity>;
let lastIdentity: Identity | null;
/** Every request the Worker sent to the API, for assertions (method, path, body, auth). */
let apiLog: { method: string; path: string; body: unknown; authorized: boolean }[];

function reset(): void {
  control = { cancelNext: false, unverified: new Set() };
  state = {
    users: new Map(),
    existing: new Map(),
    appOrigin: 'http://localhost:8787',
    base: BASE,
    preset: {},
  };
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
    };
  }
  if (connection === 'apple') {
    return {
      sub: 'apple|dana',
      email: 'dana@privaterelay.appleid.com',
      email_verified: true,
    };
  }
  const email = loginHint ?? 'dana@example.com';
  return { sub: `email|${email}`, email, email_verified: !control.unverified.has(email) };
}

function methodOf(sub: string): 'google' | 'apple' | 'email' {
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

// ---- Routes ----------------------------------------------------------------------------

async function handleAuth0(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/.well-known/jwks.json') {
    send(res, 200, { keys: [jwk] });
    return true;
  }
  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    const redirectUri = q.get('redirect_uri') ?? '';
    const safeRedirectUri = safeLocalRedirectTarget(redirectUri);
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
      redirect(res, `${safeRedirectUri}?error=access_denied&state=${state}`);
      return true;
    }
    let identity: Identity;
    if (q.get('prompt') === 'none') {
      if (!lastIdentity) {
        redirect(res, `${safeRedirectUri}?error=login_required&state=${state}`);
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

async function routeApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET';
  const raw = method === 'GET' || method === 'DELETE' ? '' : await readBody(req);
  const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  const auth = req.headers.authorization ?? '';
  const identity = auth.startsWith('Bearer ') ? tokens.get(auth.slice(7)) : undefined;
  apiLog.push({ method, path: url.pathname, body, authorized: Boolean(identity) });

  // UC-REG-05: the request is signed in the original way, the body carries the second sign-in.
  if (url.pathname === '/v1/me/sign-in-methods' && method === 'POST' && identity) {
    const second = tokens.get(String(body.access_token ?? ''));
    const user = [...state.users.values()].find((u) => u.sub === identity.sub && !u.deleted);
    if (!second || !user) {
      send(res, 401, { code: 'invalid_token', detail: 'Please sign in again.' });
      return;
    }
    const added = methodOf(second.sub);
    const already = added === user.method || user.linked.includes(added);
    if (!already) user.linked.push(added);
    send(res, 200, {
      result: already ? 'already_linked' : 'linked',
      message: 'Done.',
      account: {},
    });
    return;
  }
  await handleApi(state, req, res, url, identity, body);
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
          existing?: Record<string, 'google' | 'apple' | 'email'>;
          preset?: MockState['preset'];
          appOrigin?: string;
        };
        if (body.reset) reset();
        if (body.cancelNext) control.cancelNext = true;
        for (const email of body.unverified ?? []) control.unverified.add(email);
        for (const email of body.verified ?? []) control.unverified.delete(email);
        for (const [email, method] of Object.entries(body.existing ?? {}))
          state.existing.set(email, method);
        if (body.preset) state.preset = body.preset;
        if (body.appOrigin) state.appOrigin = body.appOrigin;
        send(res, 200, { ok: true });
        return;
      }
      if (url.pathname === '/__log') {
        send(res, 200, {
          api: apiLog,
          users: [...state.users.values()].map((u) => ({
            ...u,
            cases: [...u.cases.values()].map((c) => ({
              ...c,
              answers: Object.fromEntries(c.answers),
            })),
          })),
        });
        return;
      }
      if (await handleAuth0(req, res, url)) return;
      // Stripe Checkout and the customer portal, as far as the app can tell.
      if (url.pathname === '/stripe/checkout') {
        const user = state.users.get(url.searchParams.get('sub') ?? '');
        if (user) user.subscription = 'active';
        redirect(res, `${state.appOrigin}/subscription/return?outcome=success`);
        return;
      }
      if (url.pathname.startsWith('/v1/')) {
        await routeApi(req, res, url);
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
