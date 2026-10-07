/**
 * Smaller screens:
 * - declined: "I'm not sure" on an acknowledgment (UC-REG-10). Never a dead end.
 * - paused: signs of distress during setup (UC-REG-14). Setup stops, progress
 *   is saved, the 988 resource shows, and the follow-up check-in is offered
 *   once (crisis plan DEC-26-04).
 * - support: the Support resources page. Works signed out (AC-26-10).
 * - signInHelp: "I can't get into my email" (UC-REG-20).
 * - signedOut: after Sign out, a timeout, or deleting the account (UC-REG-19).
 * - notFound.
 */
import { api, withQuery } from '../api.ts';
import type {
  ConsentType,
  OnboardingResponse,
  SignInHelpResponse,
  SignInMethod,
  SupportResourcesPage,
} from '../api-types.ts';
import { h } from '../dom.ts';
import {
  attempt,
  errorSlot,
  notesList,
  optionButtons,
  page,
  paragraphs,
  supportList,
} from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  crisisCallout,
  newTabLink,
  routeLink,
  textButton,
} from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import type { Page } from '../router.ts';
import { getSessionPolicy } from '../session-timeout.ts';
import {
  ensureOnboarding,
  getConfig,
  getOnboarding,
  getSession,
  getWelcome,
  loadWelcome,
  setOnboarding,
  signOut,
} from '../state.ts';

const CONSENT_ROUTES: Record<ConsentType, string> = {
  privacy_terms: '/setup/privacy',
  trial_terms: '/setup/trial',
  ai_notice: '/setup/about-cairn',
};

export const declinedPage: Page = ({ url }) => {
  const about = url.searchParams.get('about') as ConsentType | null;
  const current = getOnboarding();
  const declined = current?.screen.id === 'declined' ? current : null;
  const prompt =
    declined?.next_step.prompt ??
    "That's okay. You can't use Cairn without agreeing, but you're not stuck.";
  const links = declined?.screen.links ?? [];
  const readAgain = about && about in CONSENT_ROUTES ? CONSENT_ROUTES[about] : '/setup';
  const config = getConfig();
  const readAgainLabel =
    declined?.next_step.options?.find((o) => o.value.startsWith('read_again'))?.label ??
    'Read it again';

  return {
    title: "That's okay",
    step: null,
    content: page(
      "That's okay",
      cairnMessage(prompt),
      h('p', {}, 'Nothing was saved from that screen. Here is what you can do next:'),
      h(
        'ul',
        { class: 'link-list' },
        h(
          'li',
          {},
          h(
            'a',
            {
              href: readAgain,
              class: 'text-link',
              'data-route': '',
              onClick: () => {
                setOnboarding(null);
              },
            },
            readAgainLabel,
          ),
        ),
        links.length > 0
          ? links.map((link) => h('li', {}, newTabLink(link.url, link.label, 'text-link')))
          : [
              h(
                'li',
                {},
                newTabLink(config.site_url, 'See what the first weeks look like', 'text-link'),
              ),
              h('li', {}, newTabLink(config.support_url, 'Contact support', 'text-link')),
            ],
      ),
      actions(textButton('Finish later', () => void signOut())),
    ),
  };
};

/** Where setup goes after the pause: the first unfinished step. */
async function resumeSetup(navigate: (path: string) => void): Promise<void> {
  setOnboarding(null);
  const next = await ensureOnboarding();
  navigate(routeForScreen(next.screen.id));
}

export const pausedPage: Page = ({ navigate }) => {
  let current = getOnboarding();
  if (current?.screen.id !== 'paused') {
    // Only the API can say setup paused. Without that, this is the break screen.
    navigate('/break?from=%2Fsetup', { replace: true });
    return null;
  }
  const paused: OnboardingResponse = current;
  const errors = errorSlot();
  const step = paused.next_step;

  const choose = (value: string, button: HTMLButtonElement) =>
    void attempt(button, errors, async () => {
      if (value === 'continue') {
        if (step.action === 'paused') {
          // Ready to go on after a hard moment: the follow-up is offered once first.
          current = await api.get<OnboardingResponse>(
            withQuery('/v1/onboarding', { offer_check_in: true }),
          );
          setOnboarding(current);
          if (current.next_step.action === 'check_in_offer') {
            navigate('/setup/paused');
            return;
          }
        }
        await resumeSetup(navigate);
        return;
      }
      // yes, yes_email, yes_in_cairn, or no. Only a yes stores anything (a time, never a reason).
      const next = await api.post<OnboardingResponse>('/v1/onboarding/check-in', { answer: value });
      setOnboarding(next);
      navigate(routeForScreen(next.screen.id));
    });

  return {
    title: 'Take all the time you need',
    step: null,
    content: page(
      'Take all the time you need',
      paused.screen.acknowledgment ? cairnMessage(paused.screen.acknowledgment) : null,
      crisisCallout(),
      paragraphs(paused.screen.body),
      step.action === 'check_in_offer' ? h('p', { class: 'lede' }, step.prompt) : null,
      optionButtons(step.options, (option, button) => {
        choose(option.value, button);
      }),
      h('p', { class: 'fine-print' }, 'Everything you have done is saved.'),
      errors,
      actions(textButton('Finish later', () => void signOut())),
    ),
  };
};

export const supportPage: Page = async () => {
  // Opening this page changes nothing and is never tied to who is looking.
  const resources = await api.get<SupportResourcesPage>('/v1/support-resources');
  return {
    title: 'Support resources',
    step: null,
    content: page(
      'Support resources',
      h('p', { class: 'lede' }, resources.intro),
      supportList(resources.resources),
      actions(
        h(
          'button',
          {
            type: 'button',
            class: 'button-secondary',
            onClick: () => {
              window.history.back();
            },
          },
          'Go back',
        ),
      ),
    ),
  };
};

export const signInHelpPage: Page = async ({ url }) => {
  const raw = url.searchParams.get('method');
  const method: SignInMethod | undefined =
    raw === 'google' || raw === 'apple' || raw === 'email' ? raw : undefined;
  const help = await api.get<SignInHelpResponse>(withQuery('/v1/sign-in-help', { method }));
  const config = getConfig();
  return {
    title: "Can't get into your email",
    step: null,
    content: page(
      "Can't get into your email",
      cairnMessage(help.intro),
      help.provider_recovery
        ? h(
            'p',
            {},
            newTabLink(help.provider_recovery.url, help.provider_recovery.label, 'text-link'),
          )
        : null,
      (help.next_step.options ?? []).map((o) =>
        o.value === 'contact_support'
          ? h('p', {}, newTabLink(config.support_url, o.label, 'button-primary'))
          : null,
      ),
      h(
        'ul',
        { class: 'link-list' },
        method !== 'email'
          ? h(
              'li',
              {},
              routeLink('/sign-in-help?method=email', 'I signed up with my email address'),
            )
          : null,
        method !== 'google'
          ? h('li', {}, routeLink('/sign-in-help?method=google', 'I signed up with Google'))
          : null,
        method !== 'apple'
          ? h('li', {}, routeLink('/sign-in-help?method=apple', 'I signed up with Apple'))
          : null,
      ),
      actions(routeLink('/', 'Back to the start')),
    ),
  };
};

export const signedOutPage: Page = async ({ url }) => {
  if (getSession().authenticated) {
    // A stale history entry while signed in again. Go where the person belongs.
    return {
      title: 'Signed in',
      step: null,
      content: page(
        'You are signed in',
        actions(routeLink('/home', 'Go to your home screen', 'button-primary')),
      ),
    };
  }
  const reason = url.searchParams.get('reason');
  const welcome = getWelcome() ?? (await loadWelcome());
  const policy = welcome?.session ?? getSessionPolicy();
  const message =
    reason === 'timeout'
      ? policy.session_timed_out
      : reason === 'deleted'
        ? 'Your account and everything in it have been deleted. A confirmation is on its way to your email.'
        : policy.signed_out;
  return {
    title: reason === 'timeout' ? 'You were signed out' : 'Signed out',
    step: null,
    content: page(
      reason === 'timeout' ? 'You were signed out' : 'Signed out',
      cairnMessage(message),
      reason === 'deleted' ? crisisCallout() : null,
      notesList([]),
      actions(
        reason === 'deleted'
          ? routeLink('/', 'Go to the start', 'button-primary')
          : h(
              'a',
              { href: '/auth/login?returnTo=%2Fsetup', class: 'button-primary' },
              'Sign in again',
            ),
        routeLink('/support', welcome?.support.support_resources_label ?? 'Support resources'),
      ),
    ),
  };
};

export const notFoundPage: Page = () => ({
  title: 'Page not found',
  step: null,
  content: page(
    'We could not find that page',
    h('p', { class: 'lede' }, 'The link may be old, or the address may have a typo.'),
    actions(routeLink('/', 'Go to the start', 'button-primary')),
  ),
});
