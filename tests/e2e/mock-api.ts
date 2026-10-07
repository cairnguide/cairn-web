/**
 * A small in-memory stand-in for the Cairn API (cairnguide/cairn-core), for
 * the use case tests. Response shapes follow contract/openapi.json. The copy
 * is short and close to cairn-core's content files, not a verbatim copy.
 *
 * It follows the API's rules where the screens depend on them: the setup
 * order, one question at a time, Skip and I'm not sure, three skips in a row
 * start level 2, distress words start level 3 and ask nothing, free text is
 * masked and read back before anything is saved, the free days start only at
 * Start journey, and break, subscription, and deletion flows.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { JURISDICTIONS, questionFor } from '../../src/client/intake-fields.ts';
import type { FieldKey } from '../../src/client/api-types.ts';

export interface Identity {
  sub: string;
  email: string;
  email_verified: boolean;
}

type Method = 'google' | 'apple' | 'email';
type Body = Record<string, unknown>;

const STEPS = [
  'account_created',
  'adult_confirmed',
  'privacy_terms_accepted',
  'trial_terms_accepted',
  'ai_notice_accepted',
  'preferred_name_saved',
  'voice_saved',
  'complete',
] as const;
type Step = (typeof STEPS)[number];

const VERSIONS = {
  privacy_terms: 'privacy-v1',
  trial_terms: 'trial-v2',
  ai_notice: 'ai-v1',
} as const;
type Consent = keyof typeof VERSIONS;
const CONSENT_STEP: Record<Consent, { before: Step; after: Step }> = {
  privacy_terms: { before: 'adult_confirmed', after: 'privacy_terms_accepted' },
  trial_terms: { before: 'privacy_terms_accepted', after: 'trial_terms_accepted' },
  ai_notice: { before: 'trial_terms_accepted', after: 'ai_notice_accepted' },
};

export const COPY = {
  welcome_acknowledgment: "We're sorry you're here. Cairn will walk with you one step at a time.",
  oauth_cancelled: "No problem. You can choose another way whenever you're ready.",
  email_check_inbox: 'Check your inbox for a link from Cairn. It may take a minute.',
  account_exists:
    'It looks like you already have a Cairn account. Last time you signed in with {provider}.',
  age_question: 'Are you 18 or older?',
  age_under_18: "Cairn is for adults, so we can't set up an account for you.",
  age_under_18_support:
    "If you're going through a loss, you don't have to do it alone. You can call or text 988 any time.",
  privacy_terms_summary:
    'Your privacy matters, especially right now. Cairn never uses your information, or information about the person who died, for marketing or advertising.',
  privacy_terms_checkbox: 'I have read and agree to the Privacy Policy and Terms of Use.',
  trial_summary:
    'Cairn is free for 28 days, and we will not ask for a card. Your 28 days begin when you start your first journey. A care rest pauses them. Breaks never pause or change a subscription.',
  trial_checkbox:
    'I understand that 28 days after I start my first journey, I will need a subscription to keep using Cairn fully.',
  ai_notice:
    'Before we begin, an important notice. Cairn is an artificial intelligence (AI) guide. It is not a human. If you are in crisis, call or text 988.',
  ai_notice_legal: 'This notice is provided consistent with California Senate Bill 243 (2025).',
  ai_checkbox: 'I understand Cairn is an AI guide, not a human, attorney, or therapist.',
  decline_acknowledgment:
    "That's okay. You can't use Cairn without agreeing, but you're not stuck.",
  preferred_name_question: 'What would you like me to call you?',
  preferred_name_helper: 'A first name, a nickname, or anything you like is fine.',
  preferred_name_invalid: 'Please use a name without long numbers.',
  voice_question: 'How would you like me to talk with you? You can change this anytime.',
  voice_sample_intro: 'Each one answers the same message, so you can compare.',
  voice_default_button: 'Choose for me',
  voice_confirm: "Thanks, {name}. We'll take this one step at a time.",
  notify_intro: "I'll only reach out the ways you choose.",
  notify_channel_question: 'How should I let you know when something needs you?',
  notify_browser_permission_pre:
    "If you choose browser notifications, your browser will ask if that's okay.",
  notify_browser_denied:
    "Your browser said no to notifications, so I won't use them. You can change this in Settings.",
  notify_frequency_question: 'How often would you like to hear from me?',
  notify_quiet_hours_note: "I won't send anything between 9 PM and 8 AM your time.",
  notify_service_notice: 'Confirmations of things you do always go to {email}.',
  setup_complete: "You're all set, {name}.",
  setup_complete_summary:
    'I will talk with you in the {voice} voice, let you know by {channels}, {frequency}. Confirmations go to {email}.',
  setup_complete_next: 'Whenever you feel ready, we can start a case. There is no rush.',
  signout_shared_device_tip: 'If you share this device, sign out when you are done.',
  resume_onboarding: "Welcome back. Let's pick up where you left off.",
  crisis_resource: 'You can call or text 988, or chat at 988lifeline.org, any time.',
  distress_acknowledgment:
    "Thank you for telling me. What you're going through matters more than any of this.",
  checkin_email_ask_setup:
    'Would it be okay if I checked in with you tomorrow? I can email you, or just show it here.',
  check_in_yes: 'Yes, please',
  check_in_only_here: 'Only here in Cairn',
  check_in_no: 'No, thank you',
  check_in_yes_saved: "Okay. I'll check in tomorrow.",
  ready_to_continue: "I'm ready to continue",
  continue: 'Continue',
  not_sure: "I'm not sure",
  take_a_break: 'Take a break',
  support_resources: 'Support resources',
  read_this_to_me: 'Read this to me',
  settings_saved: 'Saved. A confirmation went to {email}.',
};

const VOICES = [
  {
    value: 'steady_direct',
    label: 'Steady and Direct',
    tagline: 'Just the next step, clearly stated',
  },
  { value: 'warm_patient', label: 'Warm and Patient', tagline: 'Room to process before moving on' },
  {
    value: 'brisk_businesslike',
    label: 'Brisk and Businesslike',
    tagline: 'Treat it like a project to close out',
  },
  {
    value: 'plain_practical',
    label: 'Plain and Practical',
    tagline: "No euphemisms, just what's true and what's next",
  },
];

const SESSION_POLICY = {
  inactivity_timeout_seconds: 300,
  warning_before_timeout_seconds: 20,
  overall_session_days: 30,
  timeout_warning:
    "Are you still there? For your privacy, you'll be signed out soon. Everything is saved.",
  timeout_warning_button: 'Stay signed in',
  session_timed_out:
    'You were signed out because there was no activity for a while. Everything you did is saved.',
  signed_out: "You're signed out. Everything is saved.",
};

const DISTRESS =
  /\b(suicid\w*|kill (my ?self|me)|end (it all|my life)|want(ed)? to die|can'?t go on)\b/i;

// ---- State ---------------------------------------------------------------------------

interface Answer {
  state: 'answered' | 'skipped' | 'unsure';
  value: unknown;
  own_words: string | null;
}

interface Task {
  id: string;
  task_key: string;
  title: string;
  plain_summary: string;
  journey_week: number;
  sort_order: number;
  category: 'certificates' | 'agencies' | 'financial_institutions' | 'funeral';
  kind: 'certificate_order' | 'institution_notice' | 'general';
  status: string;
  completed_at: string | null;
  snoozed_until: string | null;
  certificate_order: Record<string, unknown> | null;
  institution_notices: Record<string, unknown>[];
}

interface Case {
  id: string;
  status: 'draft' | 'active';
  answers: Map<FieldKey, Answer>;
  askResidence: boolean;
  skipExplainers: boolean;
  notificationsChosen: boolean;
  deathNotYet: boolean;
  attorneyTriggers: string[];
  deletionScheduledFor: string | null;
  lastStep: FieldKey | null;
  createdAt: string;
  journeyStartedAt: string | null;
  tasks: Task[];
  deceased: Record<string, string | null>;
}

export interface User {
  id: string;
  sub: string;
  email: string;
  method: Method;
  linked: Method[];
  step: Step;
  adult: boolean | null;
  preferred_name: string | null;
  name_pronunciation: string | null;
  voice: string;
  consents: { purpose: Consent; version: string; client: string }[];
  prefs: {
    stored: boolean;
    channels: string[];
    frequency: string;
    quiet_hours_start: string;
    quiet_hours_end: string;
    due_date_lead: string;
    inactivity_after: string;
    browser_endpoint: string | null;
  };
  onBreak: boolean;
  breakUntil: string | null;
  trialStartedAt: string | null;
  readOnly: boolean;
  subscription: 'none' | 'active' | 'lapsed';
  cancelAtPeriodEnd: boolean;
  cases: Map<string, Case>;
  checkIn: boolean;
  deleted: boolean;
}

export interface MockState {
  users: Map<string, User>;
  existing: Map<string, Method>;
  appOrigin: string;
  base: string;
  /** Applied to the next account created, so a test can start after setup. */
  preset: { complete?: boolean; readOnly?: boolean; subscribed?: boolean; activeCase?: boolean };
}

export function newUser(identity: Identity, method: Method): User {
  return {
    id: randomUUID(),
    sub: identity.sub,
    email: identity.email,
    method,
    linked: [],
    step: 'account_created',
    adult: null,
    preferred_name: null,
    name_pronunciation: null,
    voice: 'steady_direct',
    consents: [],
    prefs: {
      stored: false,
      channels: ['in_app'],
      frequency: 'none',
      quiet_hours_start: '21:00:00',
      quiet_hours_end: '08:00:00',
      due_date_lead: 'three_days',
      inactivity_after: 'off',
      browser_endpoint: null,
    },
    onBreak: false,
    breakUntil: null,
    trialStartedAt: null,
    readOnly: false,
    subscription: 'none',
    cancelAtPeriodEnd: false,
    cases: new Map(),
    checkIn: false,
    deleted: false,
  };
}

/** Moves a user straight to finished setup, for tests that start after it. */
export function finishSetup(user: User): void {
  user.step = 'complete';
  user.adult = true;
  user.preferred_name = 'Dana';
  user.prefs = {
    ...user.prefs,
    stored: true,
    channels: ['email', 'in_app'],
    frequency: 'due_only',
  };
}

// ---- Helpers -------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function problem(
  res: ServerResponse,
  status: number,
  code: string,
  detail: string,
  extra: object = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/problem+json' });
  res.end(
    JSON.stringify({
      type: `https://cairn.invalid/problems/${code}`,
      title: code,
      status,
      code,
      detail,
      ...extra,
    }),
  );
}

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

const support = {
  take_a_break_label: COPY.take_a_break,
  support_resources_label: COPY.support_resources,
  read_this_to_me: COPY.read_this_to_me,
  crisis_resource: COPY.crisis_resource,
};

const controls = {
  take_a_break: 'Take a break',
  read_this_to_me: 'Read this to me',
  speak: 'Speak your answer',
  speak_first_use: 'Your voice is turned into text on this device. The recording is never kept.',
  speak_permission_denied: "That's okay. You can type instead.",
  free_text: 'Or type your answer',
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const methodName = (m: Method) => (m === 'email' ? 'email' : m === 'google' ? 'Google' : 'Apple');

function masked(email: string): string {
  const at = email.indexOf('@');
  return `${email[0] ?? ''}•••${email.slice(at)}`;
}

function onFreeDays(user: User): boolean {
  return Boolean(user.trialStartedAt) && !user.readOnly;
}

function trialEndDate(user: User): string | null {
  return user.trialStartedAt
    ? new Date(Date.parse(user.trialStartedAt) + 28 * 86_400_000).toISOString().slice(0, 10)
    : null;
}

function account(user: User) {
  return {
    id: user.id,
    email: user.email,
    sign_in_method: user.method,
    linked_sign_in_methods: user.linked,
    preferred_name: user.preferred_name,
    name_pronunciation: user.name_pronunciation,
    voice: user.voice,
    status: user.step === 'complete' ? 'setup_complete' : 'pending_onboarding',
    access: user.readOnly ? 'read_only' : 'full',
    subscription_status: user.subscription,
    adult_attested: user.adult,
    onboarding_step: user.step,
    trial_started_at: user.trialStartedAt,
    trial_ends_at: user.trialStartedAt ? inDays(28) : null,
    trial_end_date: trialEndDate(user),
    free_days_running: onFreeDays(user),
    on_break: user.onBreak,
    time_zone: 'America/New_York',
    ai_label:
      STEPS.indexOf(user.step) >= STEPS.indexOf('ai_notice_accepted')
        ? 'Cairn is an AI guide, not a person.'
        : null,
  };
}

function accountNotes(user: User) {
  return user.readOnly
    ? [
        {
          kind: 'account',
          text: 'Your free days have ended. Everything is still here to read. Subscribe to keep going.',
        },
      ]
    : [];
}

// ---- Onboarding -----------------------------------------------------------------------

function currentScreen(user: User): string {
  if (user.adult === false) return 'under_18';
  switch (user.step) {
    case 'account_created':
      return 'adult';
    case 'adult_confirmed':
      return 'privacy_terms';
    case 'privacy_terms_accepted':
      return 'trial_terms';
    case 'trial_terms_accepted':
      return 'ai_notice';
    case 'ai_notice_accepted':
      return 'preferred_name';
    case 'preferred_name_saved':
      return 'personality';
    case 'voice_saved':
      return user.prefs.stored ? 'notification_frequency' : 'notification_channels';
    default:
      return [...user.cases.values()].length > 0 ? 'ready' : 'setup_complete';
  }
}

const agree = [
  { value: 'agree', label: COPY.continue },
  { value: 'not_sure', label: COPY.not_sure },
];

function screenFor(id: string, user: User, base: string) {
  const links = [
    { label: 'Privacy Policy', url: `${base}/legal/privacy` },
    { label: 'Terms of Use', url: `${base}/legal/terms` },
  ];
  switch (id) {
    case 'adult':
      return {
        screen: { id, legal_review_required: true },
        next_step: {
          action: 'confirm_adult',
          prompt: COPY.age_question,
          options: [
            { value: 'yes', label: "Yes, I'm 18 or older" },
            { value: 'no', label: 'No' },
          ],
        },
      };
    case 'under_18':
      return {
        screen: {
          id,
          body: [COPY.age_under_18, COPY.age_under_18_support],
          links: [{ label: 'See what the first weeks look like', url: `${base}/site/journey` }],
        },
        next_step: {
          action: 'stopped_under_18',
          prompt: COPY.age_under_18_support,
          options: [{ value: 'support_resources', label: COPY.support_resources }],
        },
      };
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
          options: agree,
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
          options: agree,
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
        next_step: { action: 'acknowledge_ai_notice', prompt: COPY.ai_checkbox, options: agree },
      };
    case 'preferred_name':
      return {
        screen: {
          id,
          body: [COPY.preferred_name_helper],
          input: {
            prefill: null,
            optional_link_label: 'Add how to say it',
            optional_prompt: 'How do you say it?',
          },
        },
        next_step: { action: 'provide_preferred_name', prompt: COPY.preferred_name_question },
      };
    case 'personality':
      return {
        screen: {
          id,
          body: [COPY.voice_sample_intro],
          choices: VOICES.map((v) => ({ ...v, sample: `[${v.label} sample reply]` })),
          legal_review_required: true,
        },
        next_step: {
          action: 'choose_personality',
          prompt: COPY.voice_question,
          options: [
            ...VOICES.map(({ value, label }) => ({ value, label })),
            { value: 'choose_for_me', label: COPY.voice_default_button },
          ],
        },
      };
    case 'notification_channels':
      return {
        screen: {
          id,
          acknowledgment: COPY.notify_intro,
          choices: [
            { value: 'email', label: `Email to ${user.email}`, tagline: 'selected' },
            { value: 'in_app', label: 'Inside Cairn', tagline: 'always_on' },
            { value: 'browser', label: 'Browser notifications' },
          ],
          push_public_key:
            'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
          body: [COPY.notify_browser_permission_pre],
        },
        next_step: {
          action: 'choose_notification_channels',
          prompt: COPY.notify_channel_question,
          options: [
            { value: 'email', label: `Email to ${user.email}` },
            { value: 'browser', label: 'Browser notifications' },
          ],
        },
      };
    case 'notification_frequency':
      return {
        screen: {
          id,
          body: [
            COPY.notify_quiet_hours_note,
            fill(COPY.notify_service_notice, { email: user.email }),
          ],
        },
        next_step: {
          action: 'choose_notification_frequency',
          prompt: COPY.notify_frequency_question,
          options: [
            { value: 'due_only', label: 'Only when something is due' },
            { value: 'daily', label: 'Once a day' },
            { value: 'weekly', label: 'Once a week' },
            { value: 'none', label: 'No reminders' },
          ],
        },
      };
    case 'setup_complete': {
      const voice = VOICES.find((v) => v.value === user.voice)?.label ?? user.voice;
      const channels = user.prefs.channels
        .map((c) => (c === 'in_app' ? 'in Cairn' : c))
        .join(' and ');
      return {
        screen: {
          id,
          acknowledgment: fill(COPY.setup_complete, { name: user.preferred_name ?? '' }),
          body: [
            fill(COPY.setup_complete_summary, {
              voice,
              channels,
              frequency: user.prefs.frequency,
              email: user.email,
            }),
            COPY.setup_complete_next,
          ],
        },
        next_step: {
          action: 'setup_complete',
          prompt: COPY.setup_complete_next,
          options: [
            { value: 'start_case', label: 'Start a case' },
            { value: 'home', label: 'Go to my home screen' },
          ],
        },
      };
    }
    default:
      return { screen: { id: 'ready' }, next_step: { action: 'open_home', prompt: COPY.continue } };
  }
}

function onboarding(
  user: User,
  base: string,
  extra: { notes?: object[]; screen?: object; next_step?: object; resumed?: boolean } = {},
) {
  const s = screenFor(currentScreen(user), user, base);
  const notes = [
    ...(extra.resumed && user.step !== 'complete'
      ? [{ kind: 'acknowledgment', text: COPY.resume_onboarding }]
      : []),
    ...(extra.notes ?? []),
  ];
  return {
    account: account(user),
    screen: extra.screen ?? s.screen,
    notes,
    support,
    next_step: extra.next_step ?? s.next_step,
  };
}

function pausedSetup(user: User, base: string, offer: boolean) {
  const askEmail = !user.prefs.stored;
  const next_step = offer
    ? {
        action: 'check_in_offer',
        prompt: askEmail ? COPY.checkin_email_ask_setup : COPY.crisis_resource,
        options: [
          { value: askEmail ? 'yes_email' : 'yes', label: COPY.check_in_yes },
          ...(askEmail ? [{ value: 'yes_in_cairn', label: COPY.check_in_only_here }] : []),
          { value: 'no', label: COPY.check_in_no },
          { value: 'continue', label: COPY.ready_to_continue },
        ],
      }
    : {
        action: 'paused',
        prompt: COPY.crisis_resource,
        options: [{ value: 'continue', label: COPY.ready_to_continue }],
      };
  return onboarding(user, base, {
    screen: {
      id: 'paused',
      acknowledgment: COPY.distress_acknowledgment,
      body: [COPY.crisis_resource],
    },
    next_step,
  });
}

// ---- Breaks (Take a break spec, S-01 to S-07) ---------------------------------------

const REST_CHOICES = [
  { value: 'today', label: 'The rest of today' },
  { value: 'three_days', label: 'A few days' },
  { value: 'week', label: 'A week' },
  { value: 'until_back', label: 'Until I come back' },
];

function breakScreen(screen: string, text: string, next_step: object, extra: object = {}) {
  return {
    screen,
    text,
    support_resources_label: COPY.support_resources,
    quiet_988_line:
      screen === 'S-01' ? null : 'If you need to talk with someone, you can call or text 988.',
    next_step,
    ...extra,
  };
}

function hasActive(user: User): boolean {
  return [...user.cases.values()].some((c) => c.status === 'active');
}

function resting(user: User) {
  const end = user.breakUntil ? user.breakUntil.slice(0, 10) : null;
  const text = end
    ? `Rest well. Everything will be here when you're back on ${end}.`
    : 'Rest as long as you need. Everything will be here when you come back.';
  return breakScreen(
    'S-06',
    text,
    {
      action: 'resting',
      prompt: text,
      options: [
        { value: 'keep_resting', label: 'Keep resting' },
        { value: 'back', label: "I'm back" },
        { value: 'change', label: 'Change how long' },
      ],
    },
    {
      choices: REST_CHOICES,
      state: {
        on_break: true,
        started_at: null,
        until: user.breakUntil,
        end_date: end,
        notice_at: null,
      },
    },
  );
}

function breakFor(user: User) {
  if (user.onBreak) return resting(user);
  if (user.step !== 'complete') {
    return breakScreen('S-02', 'Your progress is saved. Come back whenever you are ready.', {
      action: 'resume_setup',
      prompt: 'Your progress is saved.',
      options: [{ value: 'resume', label: 'Pick up where I left off' }],
    });
  }
  if (!hasActive(user)) {
    return breakScreen(
      'S-02b',
      "There's nothing to pause. Everything is saved, and nothing is counting down.",
      {
        action: 'resume',
        prompt: 'Everything is saved.',
        options: [{ value: 'resume', label: 'Pick up where I left off' }],
      },
    );
  }
  return breakScreen(
    'S-04',
    'How long would you like to rest?',
    {
      action: 'choose_rest',
      prompt: 'How long would you like to rest?',
      options: [...REST_CHOICES, { value: 'keep_going', label: 'Keep going instead' }],
    },
    { choices: REST_CHOICES, body: ['Your free days keep counting during a break you choose.'] },
  );
}

function untilFor(choice: string): string | null {
  return choice === 'until_back'
    ? null
    : inDays(choice === 'today' ? 0.5 : choice === 'three_days' ? 3 : 7);
}

// ---- Cases and intake ---------------------------------------------------------------

const FIELD_ORDER: FieldKey[] = [
  'user_role',
  'display_name',
  'date_of_death',
  'place_of_death',
  'residence_jurisdiction',
  'circumstance',
  'veteran_status',
  'estate_plan_status',
  'completed_items',
];

interface Session {
  safety_mode: string;
  consecutive_skips: number;
  overwhelm_signals: number;
  ask_residence: boolean;
  check_in_asked: boolean;
  [key: string]: unknown;
}

function freshSession(): Session {
  return {
    safety_mode: 'normal',
    sensitivity: 'normal',
    consecutive_skips: 0,
    overwhelm_signals: 0,
    offered: [],
    ask_residence: false,
    started_at: null,
    last_turn_at: null,
    active_seconds: 0,
    rest_offered: [],
    check_in_asked: false,
    intake_stopped: false,
  };
}

function sessionFrom(body: Body): Session {
  return { ...freshSession(), ...((body.session as Session | null) ?? {}) };
}

function careLevel(session: Session): number {
  return session.safety_mode === 'risk_of_harm'
    ? 4
    : session.safety_mode === 'acute_distress'
      ? 3
      : session.safety_mode === 'overwhelm'
        ? 2
        : 1;
}

function displayName(c: Case): string {
  const a = c.answers.get('display_name');
  return a?.state === 'answered' ? String(a.value) : 'your loved one';
}

function caseOut(c: Case, user: User) {
  return {
    id: c.id,
    status: c.deletionScheduledFor ? 'pending_deletion' : c.status,
    account_access: user.readOnly ? 'read_only' : 'full',
    display_name: displayName(c),
    journey_template_key: c.status === 'active' ? 'J-EXPECTED-FACILITY' : null,
    journey_template_version: c.status === 'active' ? 1 : null,
    journey_started_at: c.journeyStartedAt,
    journey_started_on: c.journeyStartedAt?.slice(0, 10) ?? null,
    last_intake_step: c.lastStep,
    last_activity_at: new Date().toISOString(),
    draft_expires_at: c.status === 'draft' ? inDays(28) : null,
    death_not_yet_occurred: c.deathNotYet,
    skip_explainers: c.skipExplainers,
    tasks_paused_until: user.onBreak ? user.breakUntil : null,
    deletion_scheduled_for: c.deletionScheduledFor,
    created_at: c.createdAt,
  };
}

function nextField(c: Case, session: Session): FieldKey | null {
  if ((session.ask_residence || c.askResidence) && !c.answers.has('residence_jurisdiction'))
    return 'residence_jurisdiction';
  for (const f of FIELD_ORDER) {
    if (f === 'residence_jurisdiction' && !c.askResidence) continue;
    if (!c.answers.has(f)) return f;
  }
  return null;
}

function questionStep(field: FieldKey) {
  const q = questionFor(field);
  return {
    q,
    step: {
      action: 'answer_question',
      prompt: q.prompt,
      options: [...q.options, q.skip, q.not_sure],
    },
  };
}

interface TurnParts {
  acknowledgment?: string | null;
  body?: string[];
  notes?: object[];
  next_step?: { action: string; prompt: string; options?: object[] } | null;
  proposals?: object[] | null;
  support?: object[];
  redactions?: string[];
  masked_text?: string | null;
  announcements?: object[];
}

const SUPPORT_988 = [{ id: '988', text: 'Call or text 988, any time.', url: 'tel:988' }];

function turn(c: Case, user: User, session: Session, parts: TurnParts = {}) {
  let question = null;
  let next = parts.next_step ?? null;
  const level = careLevel(session);
  if (!next) {
    if (level >= 3) {
      next = {
        action: 'stay_with_user',
        prompt: "I'm here. There's no rush to do anything.",
        options: [
          { value: 'continue', label: COPY.ready_to_continue },
          { value: 'stay', label: 'Not right now' },
        ],
      };
    } else if (level === 2) {
      next = {
        action: 'overwhelm_choice',
        prompt: "Let's stop the questions for now. What would help?",
        options: [
          { value: 'rest', label: 'Rest for now' },
          { value: 'small_thing', label: 'One small thing' },
          { value: 'talk', label: 'Just talk' },
        ],
      };
    } else {
      const field = nextField(c, session);
      if (field) {
        const qs = questionStep(field);
        question = qs.q;
        next = qs.step;
      } else {
        next = {
          action: 'review',
          prompt: "That's everything I need for now.",
          options: [{ value: 'review', label: 'Does this look right?' }],
        };
      }
    }
  }
  const text = [parts.acknowledgment, ...(parts.body ?? []), next.prompt].filter(Boolean).join(' ');
  return {
    case: caseOut(c, user),
    voice: level >= 3 ? 'steady_care' : user.voice,
    safety_mode: session.safety_mode,
    acknowledgment: parts.acknowledgment ?? null,
    body: parts.body ?? [],
    notes: parts.notes ?? [],
    question,
    proposals: parts.proposals ?? null,
    support: parts.support ?? (level >= 3 ? SUPPORT_988 : []),
    redactions: parts.redactions ?? [],
    masked_text: parts.masked_text ?? null,
    next_step: next,
    session,
    care_level: level,
    announcements: parts.announcements ?? [],
    controls,
    read_aloud: { label: COPY.read_this_to_me, text },
  };
}

function label(field: FieldKey, value: unknown): string {
  const q = questionFor(field);
  if (field === 'display_name') return String(value);
  if (field === 'date_of_death') {
    const v = value as { precision: string; date: string | null };
    return v.precision === 'exact' && v.date
      ? v.date
      : (q.options.find((o) => o.value === v.precision)?.label ?? v.precision);
  }
  if (field === 'place_of_death') {
    const v = value as { jurisdiction: string | null; outside_us: boolean };
    return v.outside_us
      ? 'Outside the United States'
      : (JURISDICTIONS.find((j) => j.value === v.jurisdiction)?.label ?? 'Not sure');
  }
  if (field === 'residence_jurisdiction') {
    const v = value as { choice: string; jurisdiction?: string };
    return q.options.find((o) => o.value === v.choice)?.label ?? v.choice;
  }
  if (field === 'completed_items') {
    return (value as (string | { item: string })[])
      .map(
        (e) => q.options.find((o) => o.value === (typeof e === 'string' ? e : e.item))?.label ?? '',
      )
      .join(', ');
  }
  return q.options.find((o) => o.value === value)?.label ?? String(value);
}

/** Sensitive numbers removed, as the API does before anything else reads the text. */
function redact(text: string): { text: string; redactions: string[] } {
  const out = text.replace(/\d[\d\s-]{4,}\d/g, '[number removed]');
  return { text: out, redactions: out === text ? [] : ['number'] };
}

/** A tiny stand-in for extraction.py: only clear, simple facts. */
function extract(text: string): { field: FieldKey; value: unknown; own_words: string | null }[] {
  const out: { field: FieldKey; value: unknown; own_words: string | null }[] = [];
  const name = /\b(?:called|named|call (?:her|him|them))\s+([A-Z][a-z]+)/.exec(text);
  if (name?.[1]) out.push({ field: 'display_name', value: name[1], own_words: name[1] });
  if (/\btoday\b/i.test(text))
    out.push({
      field: 'date_of_death',
      value: { precision: 'today', date: today() },
      own_words: null,
    });
  const place = JURISDICTIONS.find((j) => text.includes(j.label));
  if (place)
    out.push({
      field: 'place_of_death',
      value: { jurisdiction: place.value, county_or_city: null, outside_us: false },
      own_words: null,
    });
  if (/\b(veteran|served in the (army|navy|military))\b/i.test(text))
    out.push({ field: 'veteran_status', value: 'yes', own_words: null });
  return out;
}

const TASK_TEMPLATES: Omit<
  Task,
  'id' | 'status' | 'completed_at' | 'snoozed_until' | 'certificate_order' | 'institution_notices'
>[] = [
  {
    task_key: 'order_death_certificates',
    title: 'Order certified death certificates',
    plain_summary: 'Most offices need a certified copy. Ordering a few at once saves time.',
    journey_week: 1,
    sort_order: 1,
    category: 'certificates',
    kind: 'certificate_order',
  },
  {
    task_key: 'notify_social_security',
    title: 'Tell Social Security',
    plain_summary: 'The funeral home often does this. Check that it was done.',
    journey_week: 1,
    sort_order: 2,
    category: 'agencies',
    kind: 'general',
  },
  {
    task_key: 'notify_banks',
    title: 'Tell their bank',
    plain_summary: 'Call the bank and say you are reporting the death of an account holder.',
    journey_week: 2,
    sort_order: 1,
    category: 'financial_institutions',
    kind: 'institution_notice',
  },
  {
    task_key: 'choose_funeral_provider',
    title: 'Compare funeral providers and prices',
    plain_summary: 'You have a right to see prices before you choose.',
    journey_week: 1,
    sort_order: 3,
    category: 'funeral',
    kind: 'general',
  },
];

function summary(t: Task) {
  const done = t.status === 'done' || t.status === 'handled_elsewhere';
  return {
    id: t.id,
    task_key: t.task_key,
    template_version: 1,
    title: t.title,
    plain_summary: t.plain_summary,
    journey_week: t.journey_week,
    sort_order: t.sort_order,
    category: t.category,
    kind: t.kind,
    status: t.status,
    due_on: null,
    snoozed_until: t.snoozed_until,
    completed_at: t.completed_at,
    attorney_referral: false,
    attorney_line: null,
    why_now:
      t.journey_week === 1 ? 'Many other steps need a certificate, so this comes early.' : null,
    waypoint: null,
    journey_status: done
      ? 'done'
      : ['skipped', 'not_applicable'].includes(t.status)
        ? 'not_needed'
        : 'open',
    needs_check: false,
    probably_not_applicable: false,
    recommended: t.journey_week === 1,
    handled_by: null,
    notes: [],
  };
}

function detail(t: Task) {
  return {
    ...summary(t),
    attorney_referral_note: null,
    content_reviewed_by_counsel: false,
    jurisdiction: 'US-NH',
    death_state: 'NH',
    citations: [
      {
        authority_name: 'New Hampshire Division of Vital Records',
        url: 'https://www.sos.nh.gov/vital-records',
        jurisdiction: 'NH',
        last_verified_on: '2026-09-01',
      },
    ],
    certificate_order: t.certificate_order,
    institution_notices: t.institution_notices,
  };
}

function nextAction(c: Case) {
  const open = c.tasks.filter((t) =>
    ['not_started', 'in_progress', 'check_on_this', 'not_today'].includes(t.status),
  );
  open.sort((a, b) => a.journey_week - b.journey_week || a.sort_order - b.sort_order);
  return open[0] ? summary(open[0]) : null;
}

function weeks(c: Case) {
  const byWeek = new Map<number, Task[]>();
  for (const t of c.tasks) byWeek.set(t.journey_week, [...(byWeek.get(t.journey_week) ?? []), t]);
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, tasks]) => ({
      week,
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      tasks: tasks.map(summary),
    }));
}

function taskResponse(c: Case, t: Task, notes: object[] = []) {
  return { task: detail(t), next_action: nextAction(c), notes };
}

// ---- The router ---------------------------------------------------------------------

export async function handleApi(
  state: MockState,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  identity: Identity | undefined,
  body: Body,
): Promise<void> {
  const method = req.method ?? 'GET';
  const path = url.pathname;
  const q = url.searchParams;
  const base = state.base;

  // -- Public
  if (path === '/v1/welcome' && method === 'GET') {
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
        url: `${base}/site/journey`,
      },
      email_sign_in: {
        check_inbox: COPY.email_check_inbox,
        link_lifetime_minutes: 15,
        link_expired: 'That link has expired.',
        send_new_link: 'Send a new link',
        resend_after_seconds: 60,
        check_spelling: 'Check the spelling of your email.',
        resend: 'Send it again',
      },
      magic_link: {
        landing: 'Welcome back. Select Continue to sign in.',
        landing_button: 'Continue',
        other_device: 'You signed in somewhere else.',
        send_new_link_here: 'Send a new link here',
      },
      cant_get_into_email: "I can't get into my email",
      notes:
        q.get('oauth_cancelled') === 'true' ? [{ kind: 'info', text: COPY.oauth_cancelled }] : [],
      support,
      session: SESSION_POLICY,
    });
    return;
  }
  if (path === '/v1/support-resources' && method === 'GET') {
    send(res, 200, {
      intro: "If you're struggling, you don't have to wait. These are free and open any time.",
      resources: [
        { id: '988', text: 'Call or text 988, the Suicide and Crisis Lifeline.', url: 'tel:988' },
        {
          id: '988_chat',
          text: 'Chat with the 988 Lifeline.',
          url: 'https://988lifeline.org/chat',
        },
        {
          id: 'veterans',
          text: 'Veterans Crisis Line: call 988 and press 1.',
          url: 'https://www.veteranscrisisline.net',
        },
        {
          id: 'crisis_text_line',
          text: 'Text HOME to 741741 to reach the Crisis Text Line.',
          url: 'sms:741741',
        },
        {
          id: '911',
          text: 'If you or someone else is in immediate danger, call 911.',
          url: 'tel:911',
        },
      ],
    });
    return;
  }
  if (path === '/v1/sign-in-help' && method === 'GET') {
    const m = q.get('method');
    if (m === 'google' || m === 'apple') {
      send(res, 200, {
        intro: `Your Cairn account follows your ${methodName(m)} account. ${methodName(m)} can help you get back in.`,
        provider_recovery: {
          label: `${methodName(m)} account recovery`,
          url: `${base}/recovery/${m}`,
        },
        next_step: {
          action: 'contact_support',
          prompt: 'Contact support',
          options: [{ value: 'contact_support', label: 'Contact support' }],
        },
      });
    } else {
      send(res, 200, {
        intro:
          "If you can't get into the email you used for Cairn, support can help. They will check it's really you before changing anything.",
        provider_recovery: null,
        next_step: {
          action: 'contact_support',
          prompt: 'Contact support',
          options: [{ value: 'contact_support', label: 'Contact support' }],
        },
      });
    }
    return;
  }
  if (path === '/v1/break' && method === 'GET') {
    send(
      res,
      200,
      breakScreen(
        'S-01',
        "Take all the time you need. Nothing has been saved, and nothing is sent. Come back whenever you're ready.",
        {
          action: 'go_back',
          prompt: 'Come back whenever you are ready.',
          options: [{ value: 'go_back', label: 'Go back' }],
        },
      ),
    );
    return;
  }
  if (path === '/v1/policies' && method === 'GET') {
    send(res, 200, {
      terms_version: 'terms-1',
      privacy_version: 'privacy-1',
      acknowledgments: VERSIONS,
    });
    return;
  }

  if (!identity) {
    problem(res, 401, 'not_signed_in', 'Please sign in to continue.');
    return;
  }

  // -- Registration
  if (path === '/v1/registrations' && method === 'POST') {
    const unknown = Object.keys(body).filter((k) => k !== 'time_zone');
    if (unknown.length > 0) {
      problem(res, 422, 'validation_failed', 'Some answers need another look.');
      return;
    }
    if (!identity.email_verified) {
      problem(res, 403, 'email_not_verified', COPY.email_check_inbox);
      return;
    }
    const methodOf: Method = identity.sub.startsWith('google')
      ? 'google'
      : identity.sub.startsWith('apple')
        ? 'apple'
        : 'email';
    let user = [...state.users.values()].find(
      (u) =>
        !u.deleted &&
        (u.sub === identity.sub ||
          u.linked.some((m) => m === methodOf && u.email === identity.email)),
    );
    const existing = state.existing.get(identity.email);
    if (!user && existing && existing !== methodOf) {
      const provider = methodName(existing);
      problem(res, 409, 'account_exists', fill(COPY.account_exists, { provider }), {
        sign_in_method: existing,
        next_step: {
          action: 'sign_in_with_existing_method',
          prompt: `Sign in with ${provider}`,
          options: [
            { value: existing, label: `Sign in with ${provider}` },
            {
              value: 'link_after_sign_in',
              label: `Sign in with ${provider}, then add ${methodName(methodOf)}`,
            },
          ],
        },
      });
      return;
    }
    const resumed = Boolean(user);
    if (!user) {
      user = newUser(identity, methodOf);
      if (state.preset.complete) finishSetup(user);
      if (state.preset.readOnly) {
        user.readOnly = true;
        user.trialStartedAt = inDays(-30);
      }
      if (state.preset.subscribed) {
        user.subscription = 'active';
        user.trialStartedAt = inDays(-3);
      }
      if (state.preset.activeCase) startedCase(user);
      state.users.set(identity.sub, user);
    }
    send(res, resumed ? 200 : 201, onboarding(user, base, { resumed }));
    return;
  }

  const user = [...state.users.values()].find((u) => !u.deleted && u.sub === identity.sub);
  if (!user) {
    problem(res, 403, 'not_registered', 'Please finish signing up first.');
    return;
  }
  const ready = user.step === 'complete';
  const outOfOrder = () =>
    problem(res, 409, 'out_of_order', 'There are a few steps left first.', {
      next_step: onboarding(user, base).next_step,
    });

  // -- Onboarding
  if (path === '/v1/onboarding' && method === 'GET') {
    send(
      res,
      200,
      q.get('offer_check_in') === 'true' ? pausedSetup(user, base, true) : onboarding(user, base),
    );
    return;
  }
  if (path === '/v1/onboarding/adult' && method === 'POST') {
    if (user.adult === null) {
      user.adult = body.answer === 'yes';
      if (user.adult) user.step = 'adult_confirmed';
    }
    send(res, 200, onboarding(user, base));
    return;
  }
  const ack = /^\/v1\/onboarding\/acknowledgments\/(privacy_terms|trial_terms|ai_notice)$/.exec(
    path,
  );
  if (ack && method === 'POST') {
    const consent = ack[1] as Consent;
    const rule = CONSENT_STEP[consent];
    if (STEPS.indexOf(user.step) > STEPS.indexOf(rule.before)) {
      send(res, 200, onboarding(user, base));
      return;
    }
    if (user.step !== rule.before) {
      outOfOrder();
      return;
    }
    if (body.agreed !== true) {
      send(
        res,
        200,
        onboarding(user, base, {
          screen: {
            id: 'declined',
            links: [
              { label: 'See what the first weeks look like', url: `${base}/site/journey` },
              { label: 'Contact support', url: `${base}/support` },
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
    user.step = rule.after;
    send(res, 200, onboarding(user, base));
    return;
  }
  if (path === '/v1/onboarding/preferred-name' && method === 'PUT') {
    if (user.step !== 'ai_notice_accepted') {
      if (STEPS.indexOf(user.step) > STEPS.indexOf('ai_notice_accepted'))
        send(res, 200, onboarding(user, base));
      else outOfOrder();
      return;
    }
    const name = String(body.preferred_name ?? '').trim();
    if (DISTRESS.test(name)) {
      send(res, 200, pausedSetup(user, base, true));
      return;
    }
    if ((name.match(/\d/g) ?? []).length >= 5 || name.length > 50) {
      problem(res, 422, 'preferred_name_invalid', COPY.preferred_name_invalid);
      return;
    }
    user.preferred_name = name;
    user.name_pronunciation =
      typeof body.name_pronunciation === 'string' ? body.name_pronunciation : null;
    user.step = 'preferred_name_saved';
    send(res, 200, onboarding(user, base));
    return;
  }
  if (path === '/v1/onboarding/check-in' && method === 'POST') {
    if (body.answer !== 'no') user.checkIn = true;
    send(
      res,
      200,
      onboarding(user, base, {
        notes: [
          {
            kind: 'acknowledgment',
            text: body.answer === 'no' ? "That's okay." : COPY.check_in_yes_saved,
          },
        ],
      }),
    );
    return;
  }
  if (path === '/v1/onboarding/personality' && method === 'PUT') {
    if (user.step !== 'preferred_name_saved') {
      outOfOrder();
      return;
    }
    const choice = body.choice === 'choose_for_me' ? 'steady_direct' : String(body.choice);
    if (!VOICES.some((v) => v.value === choice)) {
      problem(res, 422, 'validation_failed', 'Please choose one of the options.');
      return;
    }
    user.voice = choice;
    user.step = 'voice_saved';
    send(
      res,
      200,
      onboarding(user, base, {
        notes: [
          {
            kind: 'acknowledgment',
            text: fill(COPY.voice_confirm, { name: user.preferred_name ?? '' }),
          },
        ],
      }),
    );
    return;
  }
  if (path === '/v1/onboarding/notification-channels' && method === 'PUT') {
    if (user.step !== 'voice_saved') {
      outOfOrder();
      return;
    }
    const browser = body.browser === true && body.browser_permission === 'granted';
    user.prefs.stored = true;
    user.prefs.channels = [
      ...(body.email === true ? ['email'] : []),
      'in_app',
      ...(browser ? ['browser'] : []),
    ];
    user.prefs.browser_endpoint = browser ? String(body.browser_push_endpoint ?? '') : null;
    const notes =
      body.browser === true && body.browser_permission !== 'granted'
        ? [{ kind: 'info', text: COPY.notify_browser_denied }]
        : [];
    send(res, 200, onboarding(user, base, { notes }));
    return;
  }
  if (path === '/v1/onboarding/notification-frequency' && method === 'PUT') {
    if (user.step !== 'voice_saved' || !user.prefs.stored) {
      outOfOrder();
      return;
    }
    user.prefs.frequency = String(body.frequency);
    user.step = 'complete';
    send(
      res,
      200,
      onboarding(user, base, { notes: [{ kind: 'info', text: COPY.signout_shared_device_tip }] }),
    );
    return;
  }
  if (path === '/v1/onboarding/case-handoff' && method === 'POST') {
    if (!ready) {
      outOfOrder();
      return;
    }
    const rel = String(body.relationship);
    const roles: Record<string, string> = {
      spouse: 'spouse_partner',
      child: 'child',
      sibling: 'other_family',
      other_family: 'other_family',
      power_of_attorney: 'power_of_attorney',
      fiduciary: 'professional_fiduciary',
    };
    const steps: Record<string, object> = {
      child: {
        action: 'choose_case_start',
        prompt: "Are you starting something new, or picking up a case that's already in progress?",
        options: [
          { value: 'start_new_case', label: 'Start a new case', available: true },
          {
            value: 'join_existing_case',
            label: 'Pick up an existing case',
            available: false,
            unavailable_reason:
              "Joining a case someone else started needs an invitation. That's coming soon.",
          },
        ],
      },
      power_of_attorney: {
        action: 'confirm_current_role',
        prompt: 'Before we go on, what is your role now?',
        options: [
          { value: 'named_executor', label: "I'm named as executor in the will" },
          { value: 'next_of_kin', label: "I'm their next of kin" },
          { value: 'not_sure', label: "I'm not sure yet" },
        ],
      },
      fiduciary: {
        action: 'confirm_fiduciary',
        prompt: "Please confirm you're acting as a professional fiduciary for this estate.",
        options: [
          { value: 'confirm', label: "Yes, I'm the fiduciary" },
          { value: 'change', label: "No, I'm family" },
        ],
      },
    };
    const notes =
      rel === 'power_of_attorney'
        ? [
            {
              kind: 'legal',
              text: 'A power of attorney generally ends when the person dies.',
              legal_review_required: true,
            },
          ]
        : [];
    send(res, 200, {
      language_profile: rel === 'fiduciary' ? 'professional' : 'family',
      user_role: roles[rel] ?? 'other',
      notes,
      next_step: steps[rel] ?? {
        action: 'start_case',
        prompt: "When you're ready, we'll start a new case together.",
      },
    });
    return;
  }

  // -- Account
  if (path === '/v1/me' && method === 'GET') {
    send(res, 200, { account: account(user), notes: accountNotes(user), session: SESSION_POLICY });
    return;
  }
  if (path === '/v1/me' && method === 'PATCH') {
    if (Number(body.care_level ?? 1) === 4) {
      problem(
        res,
        409,
        'not_now',
        "Let's leave that for now. It will be here whenever you want it.",
      );
      return;
    }
    if (typeof body.preferred_name === 'string') {
      if (DISTRESS.test(body.preferred_name)) {
        problem(res, 422, 'preferred_name_invalid', COPY.preferred_name_invalid);
        return;
      }
      user.preferred_name = body.preferred_name;
    }
    if (typeof body.name_pronunciation === 'string')
      user.name_pronunciation = body.name_pronunciation;
    if (typeof body.voice === 'string') user.voice = body.voice;
    send(res, 200, {
      account: account(user),
      notes: [
        { kind: 'acknowledgment', text: fill(COPY.settings_saved, { email: masked(user.email) }) },
      ],
      session: SESSION_POLICY,
    });
    return;
  }
  if (path === '/v1/me/sign-out' && method === 'POST') {
    send(res, 200, { message: SESSION_POLICY.signed_out, support: [] });
    return;
  }
  const unlink = /^\/v1\/me\/sign-in-methods\/(google|apple|email)$/.exec(path);
  if (unlink && method === 'DELETE') {
    user.linked = user.linked.filter((m) => m !== unlink[1]);
    send(res, 200, {
      result: 'unlinked',
      message: `Done. You can no longer sign in with ${methodName(unlink[1] as Method)}.`,
      account: account(user),
    });
    return;
  }
  if (path === '/v1/me/deletion' && method === 'GET') {
    send(res, 200, {
      explanation:
        'This deletes your account, every case, every task, all conversation text, and your notification settings. It cannot be undone.',
      subscription_note:
        user.subscription === 'active'
          ? { kind: 'account', text: 'Your subscription is cancelled right away, with no refund.' }
          : null,
      masked_email: masked(user.email),
      confirmation_destination: `One confirmation goes to ${masked(user.email)}.`,
      next_step: {
        action: 'confirm_account_deletion',
        prompt: `One confirmation goes to ${masked(user.email)}.`,
        options: [{ value: 'confirm', label: 'Delete my account and everything in it' }],
      },
    });
    return;
  }
  if (path === '/v1/me/deletion' && method === 'POST') {
    if (Number(body.care_level ?? 1) === 4) {
      problem(
        res,
        409,
        'not_now',
        "Let's leave that for now. It will be here whenever you want it.",
      );
      return;
    }
    user.deleted = true;
    send(res, 200, {
      notes: [{ kind: 'acknowledgment', text: 'Your account has been deleted.' }],
      signed_out: true,
      next_step: { action: 'signed_out', prompt: 'Your account has been deleted.' },
    });
    return;
  }
  if (path === '/v1/me/data-export' && method === 'GET') {
    send(res, 200, {
      explanation:
        'The download has your profile, acknowledgments, every case with its answers and tasks, and your notification settings.',
      format: 'json',
      next_step: {
        action: 'download_data',
        prompt: 'Download',
        options: [{ value: 'download', label: 'Download my data' }],
      },
    });
    return;
  }
  if (path === '/v1/me/data-export/file' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="cairn-data.json"',
    });
    res.end(
      JSON.stringify({
        format: 'cairn-data-export',
        format_version: 1,
        generated_at: new Date().toISOString(),
        profile: { email: user.email },
        acknowledgments: [],
        trial_reminders: [],
        notification_preferences: {},
        subscription: {},
        cases: [],
      }),
    );
    return;
  }
  if (path === '/v1/me/messages' && method === 'POST') {
    const text = String(body.text ?? '');
    const r = redact(text);
    const reply = (intent: string, prompt: string, options: object[] = []) =>
      send(res, 200, {
        intent,
        acknowledgment: null,
        body: [],
        support: [],
        proposal: null,
        redactions: r.redactions,
        masked_text: r.text,
        next_step: { action: 'choose_account_request', prompt, options },
        session: { safety_first_shown: false },
        read_aloud: { label: COPY.read_this_to_me, text: prompt },
      });
    if (/delete/i.test(text))
      reply('delete_account', 'I can help with that. Deleting needs one button in Settings.', [
        { value: 'delete_account', label: 'Delete my account' },
      ]);
    else if (/download|data/i.test(text))
      reply('download_data', 'Here is where you can download everything.', [
        { value: 'download_data', label: 'Download my data' },
      ]);
    else
      reply(
        'help',
        'I can help you delete your account, download your data, or change how I keep in touch.',
        [
          { value: 'delete_account', label: 'Delete my account' },
          { value: 'download_data', label: 'Download my data' },
          { value: 'change_notifications', label: 'Change how I keep in touch' },
        ],
      );
    return;
  }
  if (path === '/v1/me/notification-preferences' && (method === 'GET' || method === 'PATCH')) {
    let ack: string | null = null;
    if (method === 'PATCH') {
      if (Number(body.care_level ?? 1) === 4) {
        send(res, 200, {
          preferences: prefsOut(user),
          acknowledgment: null,
          next_step: { action: 'not_now', prompt: "Let's leave that for now." },
        });
        return;
      }
      if (body.stop_all_reminders === true) user.prefs.frequency = 'none';
      if (typeof body.frequency === 'string') user.prefs.frequency = body.frequency;
      if (typeof body.due_date_lead === 'string') user.prefs.due_date_lead = body.due_date_lead;
      if (typeof body.inactivity_after === 'string')
        user.prefs.inactivity_after = body.inactivity_after;
      if (typeof body.quiet_hours_start === 'string')
        user.prefs.quiet_hours_start = `${body.quiet_hours_start}:00`.slice(0, 8);
      if (typeof body.quiet_hours_end === 'string')
        user.prefs.quiet_hours_end = `${body.quiet_hours_end}:00`.slice(0, 8);
      const ch = body.channels as Body | undefined;
      if (ch) {
        const browser = ch.browser === true && ch.browser_permission === 'granted';
        user.prefs.channels = [
          ...(ch.email === true ? ['email'] : []),
          'in_app',
          ...(browser ? ['browser'] : []),
        ];
      }
      ack = fill(COPY.settings_saved, { email: masked(user.email) });
    }
    const p = prefsOut(user);
    send(res, 200, {
      preferences: p,
      acknowledgment: ack,
      next_step: ack
        ? { action: 'done', prompt: `${p.readback} ${ack}` }
        : {
            action: 'change_notifications',
            prompt: p.readback,
            options: [{ value: 'stop_all_reminders', label: 'Stop all reminders' }],
          },
      push_public_key: null,
    });
    return;
  }

  // -- Home
  if (path === '/v1/home' && method === 'GET') {
    const base2 = {
      greeting: user.preferred_name ? `Hello, ${user.preferred_name}.` : 'Hello.',
      page_title: 'Home',
      ai_reminder:
        q.get('session_start') === 'true'
          ? "A quick reminder: I'm Cairn, an AI guide. I'm a computer program, not a person."
          : null,
      always_visible: [],
      support,
      notes: accountNotes(user),
    };
    if (!ready) {
      send(res, 200, {
        ...base2,
        route: 'resume_setup',
        cases: [],
        next_step: { action: 'resume_onboarding', prompt: COPY.resume_onboarding },
      });
      return;
    }
    if (user.onBreak) {
      send(res, 200, {
        ...base2,
        route: 'resting',
        resting: resting(user),
        cases: [],
        next_step: { action: 'resting', prompt: 'Resting' },
      });
      return;
    }
    const cards = [...user.cases.values()].map((c) =>
      c.status === 'draft'
        ? {
            id: c.id,
            status: 'draft',
            display_name: displayName(c),
            where_left_off: c.lastStep ? `You stopped at: ${questionFor(c.lastStep).prompt}` : null,
            draft_notice: 'Drafts no one opens for 28 days are deleted.',
            draft_expires_at: inDays(28),
            actions: [
              { value: 'keep_going', label: 'Keep going' },
              { value: 'delete', label: 'Delete this draft' },
            ],
          }
        : {
            id: c.id,
            status: 'active',
            display_name: displayName(c),
            next_task: nextAction(c) ? `Next: ${nextAction(c)?.title ?? ''}` : null,
            trial_line: onFreeDays(user)
              ? `Your free days end on ${trialEndDate(user) ?? ''}.`
              : null,
            actions: [{ value: 'open_journey', label: 'Open the journey' }],
          },
    );
    const prompt =
      user.readOnly && q.get('subscribe_prompt_seen') !== 'true'
        ? {
            title: 'Keep going with Cairn',
            body: 'Everything is still here to read. A subscription lets you keep working on it.',
            options: [
              { value: 'subscribe', label: 'See the subscription' },
              { value: 'not_now', label: 'Not now' },
            ],
          }
        : null;
    if (cards.length === 0) {
      send(res, 200, {
        ...base2,
        route: 'home',
        cases: [],
        subscribe_prompt: prompt,
        next_step: {
          action: 'start_case',
          prompt: "Whenever you're ready, we can start a case.",
          options: [{ value: 'start_case', label: 'Start a case' }],
        },
      });
      return;
    }
    const draftsOnly = cards.every((c) => c.status === 'draft');
    send(res, 200, {
      ...base2,
      route: draftsOnly && q.get('session_start') === 'true' ? 'resume_draft' : 'home',
      cases: cards,
      subscribe_prompt: prompt,
      next_step: {
        action: 'open_case',
        prompt: cards[0]?.display_name ?? '',
        options: cards[0]?.actions ?? [],
      },
    });
    return;
  }

  // -- Take a break
  if (path === '/v1/me/break') {
    if (method === 'GET') {
      send(res, 200, breakFor(user));
      return;
    }
    if (method === 'POST' || method === 'PUT') {
      const choice = typeof body.choice === 'string' ? body.choice : null;
      if (!choice) {
        send(res, 200, breakFor(user));
        return;
      }
      user.onBreak = true;
      user.breakUntil = untilFor(choice);
      const end = user.breakUntil?.slice(0, 10) ?? null;
      const text = end
        ? `Rest well. Your tasks are set aside until ${end}.`
        : 'Rest as long as you need. Your tasks are set aside until you come back.';
      send(
        res,
        200,
        method === 'PUT'
          ? resting(user)
          : breakScreen(
              'S-05',
              text,
              {
                action: 'resting',
                prompt: text,
                options: [
                  { value: 'keep_resting', label: 'Keep resting' },
                  { value: 'back', label: "I'm back" },
                ],
              },
              {
                state: {
                  on_break: true,
                  started_at: new Date().toISOString(),
                  until: user.breakUntil,
                  end_date: end,
                  notice_at: null,
                },
              },
            ),
      );
      return;
    }
    if (method === 'DELETE') {
      user.onBreak = false;
      user.breakUntil = null;
      const text = `Welcome back, ${user.preferred_name ?? ''}. You were looking at your journey.`;
      send(
        res,
        200,
        breakScreen('S-07', text, {
          action: 'continue',
          prompt: text,
          options: [{ value: 'continue', label: "Let's look at the next thing" }],
        }),
      );
      return;
    }
  }

  // -- Subscription
  if (path === '/v1/me/subscription' && method === 'GET') {
    send(res, 200, subscriptionOut(user));
    return;
  }
  if (path === '/v1/me/subscription/terms' && method === 'GET') {
    send(res, 200, {
      title: 'Subscribe to Cairn',
      price: '$14.99 a month, tax included',
      lines: [
        'Renews every month until you cancel.',
        'Cancel any time in Settings. You keep access until the end of the month you paid for.',
        'No refunds for a month already started.',
        'Covers every case on your account.',
        'Breaks never pause or change a subscription.',
        'Stripe takes your payment details. Cairn never sees your card.',
      ],
      checkbox: {
        label: 'I agree to these subscription terms.',
        checked: false,
        document_version: 'sub-terms-1',
      },
      button: 'Continue to payment',
      links: [{ label: 'Terms of Use', url: `${base}/legal/terms` }],
      legal_review_required: true,
    });
    return;
  }
  if (path === '/v1/me/subscription/checkout' && method === 'POST') {
    if (body.agreed !== true || body.document_version !== 'sub-terms-1') {
      problem(res, 422, 'validation_failed', 'Please agree to the terms first.');
      return;
    }
    send(res, 200, { checkout_url: `${base}/stripe/checkout?sub=${encodeURIComponent(user.sub)}` });
    return;
  }
  if (path === '/v1/me/subscription/checkout-result' && method === 'GET') {
    if (q.get('outcome') === 'cancelled') {
      send(res, 200, {
        state: 'left',
        message: 'Nothing was charged. You can subscribe any time from Settings.',
        next_step: { action: 'open_home', prompt: 'Nothing was charged.' },
      });
    } else if (user.subscription === 'active') {
      send(res, 200, {
        state: 'success',
        message: `You're subscribed. A confirmation went to ${masked(user.email)}.`,
        next_step: { action: 'open_home', prompt: "You're subscribed." },
      });
    } else {
      send(res, 200, {
        state: 'finishing',
        message: 'Finishing up. This takes a moment.',
        next_step: { action: 'keep_checking', prompt: 'Finishing up.' },
      });
    }
    return;
  }
  if (
    (path === '/v1/me/subscription/portal' || path === '/v1/me/subscription/confirm-payment') &&
    method === 'POST'
  ) {
    send(res, 200, { portal_url: `${base}/stripe/portal` });
    return;
  }
  if (path === '/v1/me/subscription/cancel' && method === 'POST') {
    if (user.subscription !== 'active' || user.cancelAtPeriodEnd) {
      problem(res, 409, 'no_subscription_to_cancel', "There's no subscription to cancel.");
      return;
    }
    if (body.confirm !== true) {
      const text =
        'If you cancel, you keep full access until the end of this month. Nothing more is charged, and there is no refund.';
      send(res, 200, {
        canceled: false,
        message: text,
        subscription: subscriptionOut(user),
        next_step: {
          action: 'confirm_cancel',
          prompt: text,
          options: [
            { value: 'confirm', label: 'Cancel my subscription' },
            { value: 'keep', label: 'Keep my subscription' },
          ],
        },
      });
      return;
    }
    user.cancelAtPeriodEnd = true;
    send(res, 200, {
      canceled: true,
      message: 'Your subscription is cancelled. You keep access until the end of the month.',
      subscription: subscriptionOut(user),
      next_step: { action: 'done', prompt: 'Cancelled.' },
    });
    return;
  }
  if (path === '/v1/me/subscription/undo-cancel' && method === 'POST') {
    user.cancelAtPeriodEnd = false;
    send(res, 200, {
      canceled: false,
      message: 'Your subscription will keep going as before.',
      subscription: subscriptionOut(user),
      next_step: { action: 'done', prompt: 'Kept.' },
    });
    return;
  }

  // -- Cases
  if (!ready && path.startsWith('/v1/cases')) {
    problem(
      res,
      409,
      'onboarding_incomplete',
      'There are a few steps left before you can start a case.',
      { next_step: { action: 'resume_onboarding', prompt: COPY.resume_onboarding } },
    );
    return;
  }
  if (path === '/v1/cases' && method === 'GET') {
    send(res, 200, {
      cases: [...user.cases.values()].map((c) => ({
        id: c.id,
        status: c.status,
        display_name: displayName(c),
        last_activity_at: new Date().toISOString(),
        draft_expires_at: c.status === 'draft' ? inDays(28) : null,
        draft_notice: c.status === 'draft' ? 'Drafts no one opens for 28 days are deleted.' : null,
        deletion_scheduled_for: c.deletionScheduledFor,
      })),
    });
    return;
  }
  if (path === '/v1/cases' && method === 'POST') {
    const c: Case = {
      id: randomUUID(),
      status: 'draft',
      answers: new Map(),
      askResidence: false,
      skipExplainers: false,
      notificationsChosen: false,
      deathNotYet: false,
      attorneyTriggers: [],
      deletionScheduledFor: null,
      lastStep: null,
      createdAt: new Date().toISOString(),
      journeyStartedAt: null,
      tasks: [],
      deceased: {},
    };
    if (typeof body.user_role === 'string')
      c.answers.set('user_role', { state: 'answered', value: body.user_role, own_words: null });
    const another = user.cases.size > 0;
    user.cases.set(c.id, c);
    send(
      res,
      201,
      turn(c, user, freshSession(), {
        acknowledgment: another
          ? "Let's start another case. I'm sorry for this loss too."
          : "I'm so sorry for your loss. We'll go one step at a time.",
        body: ['I will ask a few questions about what happened. You can skip any of them.'],
        notes:
          body.user_role === 'power_of_attorney'
            ? [
                {
                  kind: 'legal',
                  text: 'A power of attorney generally ends when the person dies.',
                  legal_review_required: true,
                },
              ]
            : [],
        next_step: {
          action: 'choose_intake_mode',
          prompt: 'How would you like to do this?',
          options: [
            { value: 'one_question_at_a_time', label: 'One question at a time' },
            { value: 'own_words', label: 'In my own words' },
          ],
        },
      }),
    );
    return;
  }

  // eslint-disable-next-line security/detect-unsafe-regex -- test code, fixed paths
  const m = /^\/v1\/cases\/([^/]+)(\/.*)?$/.exec(path);
  const c = m?.[1] ? user.cases.get(m[1]) : undefined;
  if (!m || !c) {
    problem(res, 403, 'case_denied', "You don't have access to that case.");
    return;
  }
  const rest = m[2] ?? '';
  const session = sessionFrom(body);

  if (rest === '' && method === 'GET') {
    if (c.status === 'draft') {
      const where = c.lastStep
        ? `Last time you were on: ${questionFor(c.lastStep).prompt}`
        : c.answers.size > 0
          ? "You've answered a few questions."
          : "We haven't started the questions yet.";
      send(res, 200, {
        case: caseOut(c, user),
        deceased: null,
        acknowledgment: 'Welcome back.',
        body: [where],
        notes: [],
        announcements: [],
        next_step: {
          action: 'resume',
          prompt: 'Would you like to keep going?',
          options: [
            { value: 'keep_going', label: 'Keep going' },
            { value: 'something_else', label: 'Look at something else' },
          ],
        },
        controls,
        read_aloud: { label: COPY.read_this_to_me, text: 'Welcome back.' },
      });
    } else {
      send(res, 200, {
        case: caseOut(c, user),
        deceased: {
          id: c.id,
          legal_first_name: c.deceased.legal_first_name ?? null,
          legal_middle_name: c.deceased.legal_middle_name ?? null,
          legal_last_name: c.deceased.legal_last_name ?? null,
          date_of_birth: c.deceased.date_of_birth ?? null,
        },
        notes: [],
        next_step: { action: 'view_journey', prompt: 'Here is the journey.' },
        controls,
        read_aloud: { label: COPY.read_this_to_me, text: '' },
      });
    }
    return;
  }
  if (rest === '/deceased' && method === 'PATCH') {
    if (c.status === 'draft') {
      problem(res, 409, 'not_yet', 'This is asked only inside a task.');
      return;
    }
    for (const k of ['legal_first_name', 'legal_middle_name', 'legal_last_name', 'date_of_birth'])
      if (k in body) c.deceased[k] = (body[k] as string | null) ?? null;
    send(res, 200, {
      case: caseOut(c, user),
      deceased: { id: c.id, ...c.deceased },
      notes: [],
      next_step: { action: 'view_journey', prompt: 'Saved.' },
      controls,
      read_aloud: { label: COPY.read_this_to_me, text: 'Saved.' },
    });
    return;
  }
  if (rest === '/deletion') {
    if (method === 'GET') {
      const options = [
        { value: 'now', label: 'Delete it now' },
        c.deletionScheduledFor
          ? { value: 'keep', label: 'Keep this case' }
          : { value: 'hold', label: 'Delete it in 7 days' },
      ];
      send(res, 200, {
        explanation: 'This deletes the case, its answers, tasks, and conversation text.',
        masked_email: masked(user.email),
        confirmation_destination: `One confirmation goes to ${masked(user.email)}.`,
        deletion_scheduled_for: c.deletionScheduledFor,
        next_step: {
          action: 'confirm_case_deletion',
          prompt: 'How would you like to delete it?',
          options,
        },
      });
      return;
    }
    if (method === 'POST') {
      if (body.mode === 'now') {
        user.cases.delete(c.id);
        send(res, 200, {
          deleted: true,
          deletion_scheduled_for: null,
          acknowledgment: 'The case has been deleted.',
          next_step: { action: 'view_cases', prompt: 'The case has been deleted.' },
        });
      } else {
        c.deletionScheduledFor = inDays(7);
        send(res, 200, {
          deleted: false,
          deletion_scheduled_for: c.deletionScheduledFor,
          acknowledgment: `This case will be deleted on ${c.deletionScheduledFor.slice(0, 10)}.`,
          next_step: {
            action: 'case_deletion_scheduled',
            prompt: 'Scheduled.',
            options: [{ value: 'keep', label: 'Keep this case' }],
          },
        });
      }
      return;
    }
    if (method === 'DELETE') {
      c.deletionScheduledFor = null;
      send(res, 200, {
        deleted: false,
        deletion_scheduled_for: null,
        acknowledgment: 'The case is kept. Nothing was deleted.',
        next_step: { action: 'view_case', prompt: 'Kept.' },
      });
      return;
    }
  }

  const field = /^\/intake\/answers\/(\w+)$/.exec(rest)?.[1] as FieldKey | undefined;
  if (field && method === 'PUT') {
    const state2 = String(body.state) as Answer['state'];
    const edited = c.answers.has(field);
    if (state2 === 'answered' && field === 'date_of_death') {
      const v = body.value as { precision: string; date: string | null };
      if (v.precision === 'exact' && v.date && v.date > today()) {
        problem(res, 422, 'validation_failed', 'Some answers need another look.');
        return;
      }
    }
    c.answers.set(field, {
      state: state2,
      value: state2 === 'answered' ? body.value : null,
      own_words: typeof body.own_words === 'string' ? body.own_words : null,
    });
    c.lastStep = field;
    if (field === 'place_of_death' && body.away_from_home === true) {
      c.askResidence = true;
      session.ask_residence = true;
    }
    session.consecutive_skips = state2 === 'skipped' ? session.consecutive_skips + 1 : 0;
    if (session.consecutive_skips >= 3) session.safety_mode = 'overwhelm';
    const ack = edited
      ? `Got it. I changed ${questionFor(field).prompt.toLowerCase()}`
      : state2 === 'answered'
        ? 'Thank you.'
        : "That's okay. We can come back to it.";
    if (field === 'user_role' && body.value === 'professional_fiduciary') {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: ack,
          next_step: {
            action: 'choose_pace',
            prompt: 'Would you like a shorter pace, without the explanations?',
            options: [
              { value: 'skip_explainers', label: 'Yes, keep it short' },
              { value: 'keep_explainers', label: 'No, keep the explanations' },
            ],
          },
        }),
      );
      return;
    }
    send(res, 200, turn(c, user, session, { acknowledgment: ack }));
    return;
  }
  if (rest === '/intake/messages' && method === 'POST') {
    const text = String(body.text ?? '');
    const r = redact(text);
    if (DISTRESS.test(text)) {
      session.safety_mode = 'acute_distress';
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment:
            "I'm really glad you told me. You don't have to do any of this right now.",
          body: [COPY.crisis_resource],
          masked_text: r.text,
          redactions: r.redactions,
        }),
      );
      return;
    }
    if (/\b(still alive|hasn'?t died|not died yet|in hospice now)\b/i.test(text)) {
      c.deathNotYet = true;
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: "Thank you for telling me. I'm so sorry you're going through this.",
          next_step: {
            action: 'death_not_yet',
            prompt:
              "Cairn's journeys start after a death. You can save what you've shared now, or come back whenever you need to.",
            options: [
              { value: 'save_draft', label: 'Save it for now' },
              { value: 'come_back_later', label: "I'll come back later" },
            ],
          },
          masked_text: r.text,
        }),
      );
      return;
    }
    const found = extract(r.text);
    if (found.length === 0) {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: 'Thank you for sharing that.',
          masked_text: r.text,
          redactions: r.redactions,
        }),
      );
      return;
    }
    send(
      res,
      200,
      turn(c, user, session, {
        acknowledgment: 'Thank you for telling me.',
        body: [
          'Here is what I understood.',
          ...(r.redactions.length ? ['I removed a number to keep it private.'] : []),
        ],
        proposals: found.map((f) => ({ ...f, label: label(f.field, f.value) })),
        next_step: {
          action: 'confirm_readback',
          prompt: 'Did I get that right?',
          options: [
            { value: 'yes', label: "Yes, that's right" },
            { value: 'fix', label: 'Let me fix it' },
          ],
        },
        masked_text: r.text,
        redactions: r.redactions,
      }),
    );
    return;
  }
  if (rest === '/intake/transcripts' && method === 'POST') {
    if (body.unclear === true || !body.transcript) {
      send(
        res,
        200,
        turn(c, user, session, {
          next_step: {
            action: 'speak_again',
            prompt: "I didn't quite catch that. Would you like to try again, or type it?",
            options: [
              { value: 'speak', label: 'Speak your answer' },
              { value: 'type', label: 'Or type your answer' },
            ],
          },
        }),
      );
      return;
    }
    const r = redact(String(body.transcript));
    send(
      res,
      200,
      turn(c, user, session, {
        masked_text: r.text,
        redactions: r.redactions,
        next_step: {
          action: 'confirm_transcript',
          prompt: 'Did I hear that right?',
          options: [
            { value: 'yes', label: "Yes, that's right" },
            { value: 'edit', label: 'Edit' },
          ],
        },
      }),
    );
    return;
  }
  if (rest === '/intake/confirmations' && method === 'POST') {
    for (const a of (body.answers as
      { field: FieldKey; value: unknown; own_words?: string | null }[] | undefined) ?? []) {
      c.answers.set(a.field, { state: 'answered', value: a.value, own_words: a.own_words ?? null });
      c.lastStep = a.field;
    }
    send(res, 200, turn(c, user, session, { acknowledgment: "Thank you. I've saved that." }));
    return;
  }
  if (rest === '/intake/continue' && method === 'POST') {
    const wasHigh = careLevel(session) >= 3;
    session.safety_mode = 'normal';
    session.consecutive_skips = 0;
    const announcements =
      wasHigh && !session.check_in_asked
        ? [
            {
              kind: 'check_in',
              text: 'Would it be okay if I checked in with you tomorrow?',
              options: [
                { value: 'yes', label: COPY.check_in_yes },
                { value: 'no', label: COPY.check_in_no },
              ],
            },
          ]
        : [];
    if (announcements.length) session.check_in_asked = true;
    send(
      res,
      200,
      turn(c, user, session, {
        acknowledgment: wasHigh ? "Okay. We'll go gently." : null,
        announcements,
      }),
    );
    return;
  }
  if (rest === '/intake/level-2-choice' && method === 'POST') {
    if (body.choice === 'rest') {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: 'Everything is saved.',
          next_step: {
            action: 'paused',
            prompt: 'Your draft is saved. Drafts no one opens for 28 days are deleted.',
            options: [{ value: 'keep_going', label: 'Keep going' }],
          },
        }),
      );
    } else if (body.choice === 'small_thing') {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: "Here's one small thing.",
          next_step: {
            action: 'small_task',
            prompt: 'Find a folder to keep papers in, one place for everything.',
          },
        }),
      );
    } else {
      send(
        res,
        200,
        turn(c, user, session, {
          next_step: {
            action: 'just_talk',
            prompt: "I'm here. Say whatever you like.",
            options: [{ value: 'continue', label: COPY.ready_to_continue }],
          },
        }),
      );
    }
    return;
  }
  if (rest === '/intake/check-in' && method === 'POST') {
    if (body.answer === 'yes') user.checkIn = true;
    send(
      res,
      200,
      turn(c, user, session, {
        acknowledgment:
          body.answer === 'yes'
            ? COPY.check_in_yes_saved
            : "That's okay. I'm here whenever you want to come back.",
      }),
    );
    return;
  }
  if (rest === '/intake/pause' && method === 'POST') {
    send(
      res,
      200,
      turn(c, user, session, {
        acknowledgment: 'Everything is saved.',
        next_step: {
          action: 'paused',
          prompt: 'Your draft is saved. Drafts no one opens for 28 days are deleted.',
          options: [{ value: 'keep_going', label: 'Keep going' }],
        },
      }),
    );
    return;
  }
  if (rest === '/intake/preferences' && method === 'PUT') {
    if (typeof body.skip_explainers === 'boolean') c.skipExplainers = body.skip_explainers;
    send(res, 200, turn(c, user, session, { acknowledgment: 'Okay.' }));
    return;
  }
  if (rest === '/intake/death-not-yet' && method === 'POST') {
    if (body.choice === 'has_happened') {
      c.deathNotYet = false;
      send(res, 200, turn(c, user, session, { acknowledgment: "I'm so sorry." }));
      return;
    }
    c.deathNotYet = true;
    if (body.choice === 'not_yet') {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: "Thank you for telling me. I'm so sorry you're going through this.",
          next_step: {
            action: 'death_not_yet',
            prompt:
              "Cairn's journeys start after a death. You can save what you've shared now, or come back whenever you need to.",
            options: [
              { value: 'save_draft', label: 'Save it for now' },
              { value: 'come_back_later', label: "I'll come back later" },
            ],
          },
        }),
      );
      return;
    }
    send(
      res,
      200,
      turn(c, user, session, {
        next_step: {
          action: 'draft_saved',
          prompt: 'Your draft is saved. Drafts no one opens for 28 days are deleted.',
          options: [{ value: 'has_happened', label: 'The death has happened' }],
        },
      }),
    );
    return;
  }
  if (rest === '/intake/attorney-referrals' && method === 'POST') {
    c.attorneyTriggers.push(String(body.trigger));
    send(
      res,
      200,
      turn(c, user, session, {
        acknowledgment:
          "This is a time to talk to an estate attorney. I've added that as a step, and I'll keep showing you everything else I can help with.",
        notes: [
          {
            kind: 'legal',
            text: "Cairn can't give legal advice.",
            attorney_line: 'An estate attorney can tell you what applies in your state.',
          },
        ],
      }),
    );
    return;
  }
  if (rest === '/take-a-break' && method === 'POST') {
    if (c.status === 'draft') {
      send(
        res,
        200,
        turn(c, user, session, {
          acknowledgment: 'Everything is saved.',
          next_step: {
            action: 'paused',
            prompt: 'Your draft is saved. Drafts no one opens for 28 days are deleted.',
            options: [{ value: 'keep_going', label: 'Keep going' }],
          },
        }),
      );
      return;
    }
    if (!body.rest_choice) {
      send(
        res,
        200,
        turn(c, user, session, {
          body: ['Your free days keep counting during a break you choose.'],
          next_step: {
            action: 'choose_rest',
            prompt: 'How long would you like to rest?',
            options: REST_CHOICES,
          },
        }),
      );
      return;
    }
    user.onBreak = true;
    user.breakUntil = untilFor(String(body.rest_choice));
    send(
      res,
      200,
      turn(c, user, session, {
        next_step: {
          action: 'resting',
          prompt: 'Rest well. Everything will be here.',
          options: [{ value: 'resume', label: "I'm back" }],
        },
      }),
    );
    return;
  }
  if (rest === '/review' && method === 'GET') {
    const lines = FIELD_ORDER.filter((f) => f !== 'residence_jurisdiction' || c.askResidence).map(
      (f) => {
        const a = c.answers.get(f);
        return {
          field: f,
          label: questionFor(f).prompt,
          answer: !a
            ? 'Not answered yet'
            : a.state === 'skipped'
              ? 'Skipped for now'
              : a.state === 'unsure'
                ? 'Not sure yet'
                : a.own_words && f !== 'circumstance'
                  ? a.own_words
                  : label(f, a.value),
          answer_state: a?.state ?? null,
          edit: {
            action: 'edit_answer',
            prompt: questionFor(f).prompt,
            options: [{ value: f, label: 'Edit' }],
          },
        };
      },
    );
    send(res, 200, {
      case: caseOut(c, user),
      acknowledgment: "Here's what you've shared so far.",
      told_me: lines.filter((l) => l.answer_state === 'answered'),
      told_me_heading: 'What you told me',
      later: lines.filter((l) => l.answer_state !== 'answered'),
      later_heading: 'What we can figure out later',
      next_step: {
        action: 'confirm_review',
        prompt: 'Does this look right?',
        options: [
          { value: 'yes', label: 'Yes, show me the journey' },
          { value: 'change', label: 'I want to change something' },
        ],
      },
      controls,
      read_aloud: { label: COPY.read_this_to_me, text: "Here's what you've shared so far." },
    });
    return;
  }
  if (rest === '/journey/preview' && method === 'GET') {
    const notice = {
      text: 'When you select Start journey, your 28 free days begin. No card is needed.',
      version: 'notice-1',
    };
    let next_step: object;
    if (c.deathNotYet)
      next_step = {
        action: 'death_not_yet',
        prompt: "Cairn's journeys start after a death.",
        options: [
          { value: 'save_draft', label: 'Save it for now' },
          { value: 'has_happened', label: 'The death has happened' },
        ],
      };
    else if (user.readOnly)
      next_step = {
        action: 'choose_subscription',
        prompt: 'A new journey needs a subscription.',
        options: [
          { value: 'subscribe', label: 'See the subscription' },
          { value: 'not_now', label: 'Not now' },
        ],
      };
    else if (!c.notificationsChosen)
      next_step = {
        action: 'confirm_keep_in_touch',
        prompt: 'Here is the journey that fits.',
        options: [{ value: 'keep_in_touch', label: 'Confirm how I keep in touch' }],
      };
    else
      next_step = {
        action: 'start_journey',
        prompt: notice.text,
        options: [
          { value: 'start_journey', label: 'Start journey' },
          { value: 'not_yet', label: 'Not yet' },
        ],
      };
    send(res, 200, {
      case: caseOut(c, user),
      journey_template_key: 'J-EXPECTED-FACILITY',
      journey_template_version: 1,
      explanation:
        'This journey fits a death in a hospital or care facility. It starts with the most time-sensitive steps.',
      weeks: [1, 2].map((w) => ({
        week: w,
        label: `Week ${w}`,
        tasks: TASK_TEMPLATES.filter((t) => t.journey_week === w).map((t) => ({
          task_key: t.task_key,
          title: t.title,
          plain_summary: t.plain_summary,
          journey_week: w,
          waypoint: null,
          status: 'not_started',
          journey_status: 'open',
          needs_check: false,
          probably_not_applicable: false,
          recommended: w === 1,
          status_label: "When you're ready",
          attorney_referral: false,
          attorney_line: null,
          citations: [],
          notes: [],
        })),
      })),
      notes: [],
      support: [],
      pre_button_notice: c.deathNotYet ? null : notice,
      start_available: !c.deathNotYet,
      care_level: 1,
      controls,
      notifications_chosen: c.notificationsChosen,
      next_step,
      read_aloud: { label: COPY.read_this_to_me, text: 'Here is the journey that fits.' },
    });
    return;
  }
  if (rest === '/keep-in-touch') {
    if (method === 'GET') {
      const p = prefsOut(user);
      const questions =
        user.prefs.frequency === 'none'
          ? []
          : [
              {
                id: 'due_date_lead',
                prompt: 'How early should I tell you a date is coming up?',
                options: [
                  { value: 'day_before', label: 'The day before' },
                  { value: 'three_days', label: '3 days before' },
                  { value: 'one_week', label: 'A week before' },
                ],
              },
              {
                id: 'inactivity_after',
                prompt: 'Should I check in if things go quiet for a while?',
                options: [
                  { value: 'off', label: "Don't check in" },
                  { value: 'one_week', label: 'After a quiet week' },
                  { value: 'two_weeks', label: 'After 2 quiet weeks' },
                ],
              },
            ];
      send(res, 200, {
        opening: `Right now: ${p.readback}`,
        preferences: p,
        questions,
        change_link: { value: 'settings', label: 'Change how you hear from me' },
        next_step: {
          action: 'confirm_keep_in_touch',
          prompt: questions[0]?.prompt ?? 'Nothing is sent outside Cairn except confirmations.',
          options: questions[0]?.options ?? [{ value: 'ok', label: COPY.continue }],
        },
        read_aloud: { label: COPY.read_this_to_me, text: p.readback },
      });
      return;
    }
    if (method === 'PUT') {
      if (typeof body.due_date_lead === 'string') user.prefs.due_date_lead = body.due_date_lead;
      if (typeof body.inactivity_after === 'string')
        user.prefs.inactivity_after = body.inactivity_after;
      c.notificationsChosen = true;
      send(res, 200, {
        preferences: prefsOut(user),
        acknowledgment: 'Saved.',
        next_step:
          c.status === 'draft'
            ? { action: 'preview_journey', prompt: 'Here is the journey.' }
            : { action: 'done', prompt: 'Saved.' },
      });
      return;
    }
  }
  if (rest === '/journey/start' && method === 'POST') {
    if (body.pre_button_notice_version !== 'notice-1' || !c.notificationsChosen) {
      problem(res, 409, 'not_ready', 'Please look over the journey first.');
      return;
    }
    c.status = 'active';
    c.journeyStartedAt = new Date().toISOString();
    c.tasks = TASK_TEMPLATES.map((t) => ({
      ...t,
      id: randomUUID(),
      status: 'not_started',
      completed_at: null,
      snoozed_until: null,
      certificate_order: null,
      institution_notices: [],
    }));
    const startedNow = !user.trialStartedAt;
    user.trialStartedAt ??= new Date().toISOString();
    const first = c.tasks[0];
    send(res, 200, {
      case: caseOut(c, user),
      confirmation: `Your journey has started. Your free days end on ${trialEndDate(user) ?? ''}.`,
      legal_review_required: true,
      trial_started_now: startedNow,
      trial_end_date: trialEndDate(user),
      recommended: first
        ? [{ task: summary(first), why_now: 'Many other steps need a certificate.' }]
        : [],
      small_task: 'Find a folder for papers.',
      next_step: {
        action: 'choose_first_task',
        prompt: 'What feels doable right now?',
        options: [
          ...(first ? [{ value: first.id, label: first.title }] : []),
          { value: 'small_task', label: 'Find a folder for papers' },
          { value: 'not_today', label: 'Not today' },
        ],
      },
      controls,
      read_aloud: { label: COPY.read_this_to_me, text: 'Your journey has started.' },
    });
    return;
  }
  if (rest === '/journey/not-yet' && method === 'POST') {
    send(res, 200, {
      case: caseOut(c, user),
      acknowledgment: null,
      task: null,
      next_step: {
        action: 'paused',
        prompt: "That's okay. Everything is saved, and nothing is counting down.",
      },
    });
    return;
  }
  if (rest === '/journey/first-task' && method === 'POST') {
    const t = c.tasks.find((x) => x.id === body.choice);
    if (t) {
      if (t.status === 'not_started') t.status = 'in_progress';
      send(res, 200, {
        case: caseOut(c, user),
        acknowledgment: null,
        task: summary(t),
        next_step: { action: 'open_task', prompt: t.title },
      });
      return;
    }
    send(res, 200, {
      case: caseOut(c, user),
      acknowledgment: body.choice === 'small_task' ? "Here's one small thing." : "That's okay.",
      task: null,
      next_step: {
        action: body.choice === 'small_task' ? 'small_task' : 'paused',
        prompt:
          body.choice === 'small_task'
            ? 'Find a folder for papers.'
            : "Nothing is started. It's all here when you're ready.",
      },
    });
    return;
  }
  if (rest === '/journey' && method === 'GET') {
    if (c.status === 'draft') {
      send(res, 200, {
        case_id: c.id,
        mode: 'not_started',
        journey_started_on: null,
        current_week: 1,
        weeks: [],
        notes: [],
        next_step: { action: 'preview_journey', prompt: 'See the journey first.' },
      });
      return;
    }
    if (user.onBreak) {
      send(res, 200, {
        case_id: c.id,
        mode: 'paused',
        journey_started_on: c.journeyStartedAt?.slice(0, 10),
        current_week: 1,
        paused_until: user.breakUntil,
        check_in: {
          message: "We've set the tasks aside. Nothing is lost.",
          options: [
            { value: 'resume', label: "I'm ready to pick things back up" },
            { value: 'stay_paused', label: 'Not yet' },
          ],
        },
        weeks: [],
        notes: [],
        next_step: { action: 'check_in', prompt: "We've set the tasks aside." },
      });
      return;
    }
    const next = nextAction(c);
    send(res, 200, {
      case_id: c.id,
      mode: 'tasks',
      journey_started_on: c.journeyStartedAt?.slice(0, 10),
      current_week: 1,
      next_action: next,
      weeks: weeks(c),
      notes: [],
      support: [],
      next_step: next
        ? { action: 'open_task', prompt: "Here's the one thing to look at next." }
        : { action: 'journey_complete', prompt: "You've worked through the first weeks." },
    });
    return;
  }
  if (rest === '/journey/resume' && method === 'POST') {
    user.onBreak = false;
    user.breakUntil = null;
    send(res, 200, {
      case_id: c.id,
      mode: 'tasks',
      journey_started_on: c.journeyStartedAt?.slice(0, 10),
      current_week: 1,
      next_action: nextAction(c),
      weeks: weeks(c),
      notes: [{ kind: 'acknowledgment', text: "Welcome back. We'll start with just one thing." }],
      next_step: { action: 'open_task', prompt: 'Next.' },
    });
    return;
  }
  if (rest === '/status' && method === 'GET') {
    const cats = (['certificates', 'funeral', 'agencies', 'financial_institutions'] as const).map(
      (cat) => {
        const ts = c.tasks.filter((t) => t.category === cat);
        return {
          category: cat,
          label: cat.replace('_', ' '),
          done: ts.filter((t) => t.status === 'done').map(summary),
          in_progress: ts.filter((t) => t.status === 'in_progress').map(summary),
          up_next: ts.filter((t) => t.status === 'not_started').map(summary),
          set_aside: ts
            .filter((t) => ['skipped', 'not_applicable'].includes(t.status))
            .map(summary),
        };
      },
    );
    const count = (s: string[]) => c.tasks.filter((t) => s.includes(t.status)).length;
    send(res, 200, {
      case_id: c.id,
      as_of: new Date().toISOString(),
      deceased_name: displayName(c),
      journey_paused: user.onBreak,
      paused_until: user.breakUntil,
      counts: {
        total: c.tasks.length,
        done: count(['done']),
        in_progress: count(['in_progress']),
        not_started: count(['not_started']),
        set_aside: count(['skipped', 'not_applicable']),
        overdue: 0,
      },
      next_action: nextAction(c),
      categories: cats,
      certificate_order: c.tasks.find((t) => t.certificate_order)?.certificate_order ?? null,
      institution_notices: c.tasks.flatMap((t) => t.institution_notices),
    });
    return;
  }
  // eslint-disable-next-line security/detect-unsafe-regex -- test code, fixed paths
  const t = /^\/tasks\/([^/]+)(\/.*)?$/.exec(rest);
  const task = t?.[1] ? c.tasks.find((x) => x.id === t[1]) : undefined;
  if (t && task) {
    const sub = t[2] ?? '';
    if (sub === '' && method === 'GET') {
      send(res, 200, taskResponse(c, task));
      return;
    }
    if (sub === '' && method === 'PATCH') {
      if (typeof body.status === 'string') {
        task.status = body.status;
        task.completed_at = body.status === 'done' ? new Date().toISOString() : null;
      }
      if ('snoozed_until' in body)
        task.snoozed_until = (body.snoozed_until as string | null) ?? null;
      send(res, 200, taskResponse(c, task));
      return;
    }
    if (sub === '/certificate-order' && method === 'POST') {
      task.certificate_order = {
        copies_requested: body.copies_requested,
        ordered_on: body.ordered_on ?? today(),
        expected_by: body.expected_by ?? null,
        issuing_office: body.issuing_office ?? null,
      };
      task.status = 'done';
      task.completed_at = new Date().toISOString();
      send(
        res,
        200,
        taskResponse(c, task, [
          { kind: 'acknowledgment', text: "Got it. We've noted your certificate order." },
        ]),
      );
      return;
    }
    if (sub === '/institution-notices' && method === 'POST') {
      task.institution_notices.push({
        id: randomUUID(),
        institution_name: body.institution_name,
        institution_type: body.institution_type ?? 'bank',
        notified_on: body.notified_on ?? today(),
        method: body.method ?? null,
        status: 'notified',
      });
      if (body.complete_task !== false) {
        task.status = 'done';
        task.completed_at = new Date().toISOString();
      }
      send(
        res,
        200,
        taskResponse(c, task, [
          { kind: 'acknowledgment', text: "Done. We've noted that they've been told." },
        ]),
      );
      return;
    }
  }

  problem(res, 404, 'not_found', 'Not in the mock.');
}

/** A case with a started journey, for tests that begin on the journey. */
function startedCase(user: User): void {
  const c: Case = {
    id: randomUUID(),
    status: 'active',
    answers: new Map([
      ['display_name', { state: 'answered', value: 'Margaret', own_words: 'Margaret' }],
    ]),
    askResidence: false,
    skipExplainers: false,
    notificationsChosen: true,
    deathNotYet: false,
    attorneyTriggers: [],
    deletionScheduledFor: null,
    lastStep: null,
    createdAt: new Date().toISOString(),
    journeyStartedAt: new Date().toISOString(),
    tasks: TASK_TEMPLATES.map((t) => ({
      ...t,
      id: randomUUID(),
      status: 'not_started',
      completed_at: null,
      snoozed_until: null,
      certificate_order: null,
      institution_notices: [],
    })),
    deceased: {},
  };
  user.cases.set(c.id, c);
  user.trialStartedAt ??= new Date().toISOString();
}

function prefsOut(user: User) {
  const p = user.prefs;
  const channels = p.channels.map((c) => (c === 'in_app' ? 'in Cairn' : c)).join(' and ');
  return {
    stored: p.stored,
    channels: p.channels,
    frequency: p.frequency,
    quiet_hours_start: p.quiet_hours_start,
    quiet_hours_end: p.quiet_hours_end,
    browser_notifications_on: p.channels.includes('browser'),
    due_date_lead: p.due_date_lead,
    inactivity_after: p.inactivity_after,
    journey_confirmed: false,
    readback:
      p.frequency === 'none'
        ? `No reminders. I'll show things ${channels}.`
        : `I'll let you know ${channels}, ${p.frequency.replace('_', ' ')}.`,
    updated_at: null,
  };
}

function subscriptionOut(user: User) {
  const actions =
    user.subscription === 'active'
      ? [
          { value: 'update_payment', label: 'Update payment details' },
          { value: 'invoices', label: 'See past payments' },
          user.cancelAtPeriodEnd
            ? { value: 'undo_cancel', label: 'Keep my subscription' }
            : { value: 'cancel', label: 'Cancel my subscription' },
        ]
      : user.readOnly || onFreeDays(user)
        ? [{ value: 'subscribe', label: 'Subscribe' }]
        : [];
  const line =
    user.subscription === 'active'
      ? user.cancelAtPeriodEnd
        ? 'Your subscription ends at the end of this month.'
        : 'Subscribed. $14.99 a month.'
      : user.readOnly
        ? 'No subscription. Your account is read-only.'
        : onFreeDays(user)
          ? `Free days until ${trialEndDate(user) ?? ''}.`
          : "Your free days haven't started yet.";
  return {
    status_line: line,
    breaks_note: user.subscription === 'active' ? 'Breaks never pause a subscription.' : null,
    subscription_status: user.subscription,
    access: user.readOnly ? 'read_only' : 'full',
    billing_notice: null,
    cancel_at_period_end: user.cancelAtPeriodEnd,
    current_period_end: null,
    actions,
    next_step: { action: 'subscription', prompt: line, options: actions },
  };
}
