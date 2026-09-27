/**
 * /setup: where every sign-in lands (UC-REG-02 to UC-REG-05, UC-REG-13).
 *
 * Calls POST /v1/registrations, which creates the account or finds it, and
 * then sends the person to the first unfinished step. Handles the three ways
 * this can stop:
 * - the email isn't confirmed yet (403 email_not_verified): the verify screen
 * - the email already has an account made another way (409 account_exists):
 *   offer that method as the main button
 * - an unsupported sign-in method (403): explain and offer to start again
 */
import { ApiError, api } from '../api.ts';
import type { OnboardingResponse, SignInMethod } from '../api-types.ts';
import { h } from '../dom.ts';
import { actions, callout, textButton } from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import type { Page, View } from '../router.ts';
import { getSession, setOnboarding, signOut } from '../state.ts';

const PROVIDER_LABELS: Record<SignInMethod, string> = {
  google: 'Google',
  apple: 'Apple',
  email: 'your email',
};

function timeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length <= 64 ? zone : undefined;
  } catch {
    return undefined;
  }
}

function accountExistsView(error: ApiError): View {
  const method = error.problem.sign_in_method ?? 'email';
  const option = error.problem.next_step?.options?.[0];
  const label = option?.label ?? `Sign in with ${PROVIDER_LABELS[method]}`;
  return {
    title: 'You already have an account',
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'You already have a Cairn account'),
      h('p', { class: 'lede' }, error.problem.detail),
      actions(
        // Signing out first clears this session, then Auth0 starts fresh with the right method.
        h(
          'button',
          {
            type: 'button',
            class: 'button-primary',
            onClick: () => {
              void signOutThen(`/auth/login?method=${method}`);
            },
          },
          label,
        ),
        textButton('Go back', () => void signOut()),
      ),
      callout(
        'info',
        'info',
        h(
          'p',
          {},
          'For your safety, Cairn never joins two sign-in methods on its own. If you need help, contact support.',
        ),
      ),
    ),
  };
}

async function signOutThen(next: string): Promise<void> {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Cairn-Client': 'web', 'Content-Type': 'application/json' },
    body: '{}',
  });
  window.location.assign(next);
}

export const setupPage: Page = async ({ navigate }) => {
  const session = getSession();
  const body: Record<string, string> = {};
  const zone = timeZone();
  if (zone) body.time_zone = zone;
  if (session.name_from_provider) body.name_from_provider = session.name_from_provider;

  try {
    const response = await api.post<OnboardingResponse>('/v1/registrations', body);
    setOnboarding(response);
    navigate(routeForScreen(response.screen.id), { replace: true });
    return null;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.problem.code === 'email_not_verified') {
      navigate('/setup/verify', { replace: true });
      return null;
    }
    if (error.status === 409 && error.problem.code === 'account_exists')
      return accountExistsView(error);
    throw error;
  }
};
