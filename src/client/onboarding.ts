/**
 * Maps the API's onboarding screens to pages, and pages to the steps in the
 * "Setting up" list on the left of every account setup screen.
 *
 * The API decides where the person is (GET /v1/onboarding, UC-REG-13). The
 * client only routes to the page for that screen. The order is the account
 * spec's onboarding_sequence (cairn-core account spec 3.2.0).
 */
import type { ScreenId } from './api-types.ts';

export const SETUP_STEPS = [
  'Create your account',
  'Confirm your email',
  'Confirm you are an adult',
  'Privacy and terms',
  'Your 28 free days',
  'About Cairn',
  'What to call you',
  'How Cairn talks with you',
  'How Cairn keeps in touch',
] as const;

export type SetupStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const SCREEN_ROUTES: Record<ScreenId, string> = {
  welcome: '/',
  adult: '/setup/adult',
  under_18: '/setup/under-18',
  privacy_terms: '/setup/privacy',
  trial_terms: '/setup/trial',
  ai_notice: '/setup/about-cairn',
  declined: '/setup/declined',
  preferred_name: '/setup/name',
  personality: '/setup/voice',
  notification_channels: '/setup/notifications',
  notification_frequency: '/setup/reminders',
  setup_complete: '/setup/done',
  ready: '/home',
  paused: '/setup/paused',
};

export function routeForScreen(screen: ScreenId): string {
  return SCREEN_ROUTES[screen];
}

/** Order of the screens that make up setup, used to tell "already done" from "not yet". */
const SCREEN_ORDER: ScreenId[] = [
  'adult',
  'privacy_terms',
  'trial_terms',
  'ai_notice',
  'preferred_name',
  'personality',
  'notification_channels',
  'notification_frequency',
  'setup_complete',
];

/** -1 before, 0 same, 1 after. Screens outside setup (declined, paused, ready) count as after. */
export function compareScreens(a: ScreenId, b: ScreenId): number {
  const ia = SCREEN_ORDER.indexOf(a);
  const ib = SCREEN_ORDER.indexOf(b);
  const na = ia === -1 ? SCREEN_ORDER.length : ia;
  const nb = ib === -1 ? SCREEN_ORDER.length : ib;
  return Math.sign(na - nb);
}

/** Screens that are moments, not saved steps. Ask the API again before routing on them. */
export function isMoment(screen: ScreenId): boolean {
  return screen === 'declined' || screen === 'paused';
}
