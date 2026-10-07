/**
 * App-wide state: public config, the session summary, and the latest
 * onboarding response from the API. Kept in memory only. Nothing personal is
 * written to localStorage or sessionStorage.
 */
import { ApiError, api, request } from './api.ts';
import type {
  IntakeSession,
  IntakeTurnResponse,
  OnboardingResponse,
  SignInMethod,
  UserRole,
  WelcomeResponse,
} from './api-types.ts';
import { assertSafeUrl } from './dom.ts';

export interface PublicConfig {
  privacy_policy_url: string;
  terms_url: string;
  support_url: string;
  site_url: string;
  email_mode: 'passwordless' | 'password';
  environment: string;
}

export interface SessionSummary {
  authenticated: boolean;
  email?: string;
  email_verified?: boolean;
  method?: SignInMethod;
}

/** Used until /config.json answers, and if it can't. The links still go somewhere useful. */
const FALLBACK_CONFIG: PublicConfig = {
  privacy_policy_url: '/',
  terms_url: '/',
  support_url: '/',
  site_url: '/',
  email_mode: 'passwordless',
  environment: 'production',
};

let config: PublicConfig = FALLBACK_CONFIG;
let session: SessionSummary = { authenticated: false };
let onboarding: OnboardingResponse | null = null;
let welcome: WelcomeResponse | null = null;
/** Crisis plan care level (1 steady to 4 unsafe), from the latest case turn. Memory only, never stored. */
let careLevel: 1 | 2 | 3 | 4 = 1;
/** IntakeSession per case, sent back with each turn (UC-CASE-14). Never stored. */
const intakeSessions = new Map<string, IntakeSession>();
/** The latest turn per case, so a page can show the answer to the request that led to it. */
const lastTurns = new Map<string, IntakeTurnResponse>();
/** The relationship answered at the hand-off, sent to POST /v1/cases so it isn't asked twice. */
let handoffRole: UserRole | null = null;
let subscribePromptSeen = false;

export function getConfig(): PublicConfig {
  return config;
}

export async function loadConfig(): Promise<PublicConfig> {
  try {
    const response = await fetch('/config.json', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok)
      config = { ...FALLBACK_CONFIG, ...((await response.json()) as Partial<PublicConfig>) };
  } catch {
    // Keep the fallback.
  }
  return config;
}

export function getSession(): SessionSummary {
  return session;
}

export async function loadSession(): Promise<SessionSummary> {
  try {
    session = await request<SessionSummary>('GET', '/auth/session');
  } catch {
    session = { authenticated: false };
  }
  return session;
}

export function getOnboarding(): OnboardingResponse | null {
  return onboarding;
}

export function setOnboarding(value: OnboardingResponse | null): void {
  onboarding = value;
}

/** The latest onboarding state, from memory or the API (UC-REG-13, resume). */
export async function ensureOnboarding(): Promise<OnboardingResponse> {
  if (onboarding) return onboarding;
  onboarding = await api.get<OnboardingResponse>('/v1/onboarding');
  return onboarding;
}

/** Public welcome copy: Support and Take a break labels, the session policy. Cached for the visit. */
export async function loadWelcome(): Promise<WelcomeResponse | null> {
  if (welcome) return welcome;
  try {
    welcome = await api.get<WelcomeResponse>('/v1/welcome');
  } catch {
    welcome = null;
  }
  return welcome;
}

export function getWelcome(): WelcomeResponse | null {
  return welcome;
}

export function getCareLevel(): 1 | 2 | 3 | 4 {
  return careLevel;
}

export function setCareLevel(level: number): void {
  careLevel = level >= 4 ? 4 : level === 3 ? 3 : level === 2 ? 2 : 1;
}

export function getIntakeSession(caseId: string): IntakeSession | null {
  return intakeSessions.get(caseId) ?? null;
}

/** Keeps a case turn: its session, its care level, and the turn itself for the next page. */
export function rememberTurn(caseId: string, turn: IntakeTurnResponse): void {
  intakeSessions.set(caseId, turn.session);
  lastTurns.set(caseId, turn);
  setCareLevel(turn.care_level);
}

/** The turn kept for this case, once. */
export function takeTurn(caseId: string): IntakeTurnResponse | null {
  const turn = lastTurns.get(caseId) ?? null;
  lastTurns.delete(caseId);
  return turn;
}

export function getHandoffRole(): UserRole | null {
  return handoffRole;
}

export function setHandoffRole(role: UserRole | null): void {
  handoffRole = role;
}

export function wasSubscribePromptSeen(): boolean {
  return subscribePromptSeen;
}

export function markSubscribePromptSeen(): void {
  subscribePromptSeen = true;
}

let flash: string | null = null;

/** A one-line read-back to show on the next screen ("Saved. A confirmation went to ..."). */
export function setFlash(message: string | null): void {
  flash = message;
}

export function takeFlash(): string | null {
  const message = flash;
  flash = null;
  return message;
}

/** Forgets everything about the person kept in memory (sign-out, deletion). */
export function clearPersonalState(): void {
  onboarding = null;
  careLevel = 1;
  intakeSessions.clear();
  lastTurns.clear();
  handoffRole = null;
  subscribePromptSeen = false;
  flash = null;
}

/** Only ever navigates to an http(s) URL the Worker or API handed back (Auth0, Stripe). */
export function leaveFor(url: string): void {
  go(url);
}

function go(url: string): void {
  assertSafeUrl(url);
  if (!/^https?:\/\//.test(url)) throw new Error('Unexpected sign-in URL.');
  window.location.assign(url);
}

/** Starts email sign-up or sign-in with the address typed on the email screen. */
export async function startEmailLogin(email: string): Promise<void> {
  const result = await request<{ authorize_url: string }>('POST', '/auth/login', {
    method: 'email',
    login_hint: email,
    signup: true,
    returnTo: '/setup',
  });
  go(result.authorize_url);
}

/**
 * Signs out (UC-REG-19): the Worker tells the API, clears the session cookie,
 * and returns Auth0's logout URL, which comes back to /signed-out. A full page
 * load afterwards means the back button shows no case data. `timeout` shows
 * the session-timed-out message instead of the signed-out one.
 */
let signingOut = false;
export async function signOut(reason: 'signed_out' | 'timeout' = 'signed_out'): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  clearPersonalState();
  const fallback = reason === 'timeout' ? '/signed-out?reason=timeout' : '/signed-out';
  try {
    const result = await request<{ logout_url: string }>('POST', '/auth/logout', { reason });
    session = { authenticated: false };
    go(result.logout_url);
  } catch (error) {
    // The session cookie is cleared by the Worker even if Auth0 logout fails.
    session = { authenticated: false };
    signingOut = false;
    if (error instanceof ApiError) window.location.assign(fallback);
    else throw error;
  }
}

/** After the account is deleted: the session is gone, so only clear the cookie and leave. */
export async function endSessionAfterDeletion(): Promise<void> {
  clearPersonalState();
  try {
    await request('POST', '/auth/logout', { reason: 'deleted' });
  } catch {
    // The cookie is cleared either way.
  }
  session = { authenticated: false };
  window.location.assign('/signed-out?reason=deleted');
}
