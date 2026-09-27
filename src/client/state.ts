/**
 * App-wide state: public config, the session summary, and the latest
 * onboarding response from the API. Kept in memory only. Nothing personal is
 * written to localStorage or sessionStorage.
 */
import { ApiError, api, request } from './api.ts';
import type { OnboardingResponse, SignInMethod } from './api-types.ts';
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
  name_from_provider?: string | null;
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

/** Only ever navigates to an http(s) URL the Worker handed back. */
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

export async function signOut(): Promise<void> {
  onboarding = null;
  try {
    const result = await request<{ logout_url: string }>('POST', '/auth/logout', {});
    session = { authenticated: false };
    go(result.logout_url);
  } catch (error) {
    // The session cookie is cleared by the Worker even if Auth0 logout fails.
    session = { authenticated: false };
    if (error instanceof ApiError) window.location.assign('/');
    else throw error;
  }
}
