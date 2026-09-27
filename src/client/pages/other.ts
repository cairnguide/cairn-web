/**
 * Smaller screens:
 * - declined: "I'm not sure" on an acknowledgment (UC-REG-10). Never a dead end.
 * - moment: "I need a moment" (UC-REG-14). Stops the task flow, shows the 988
 *   resource, sets no timers or reminders. Works signed in or not.
 * - newCase: the hand-off target. Case creation on the web is the next piece of work.
 * - notFound.
 */
import { ApiError, api } from '../api.ts';
import type { ConsentType, PauseResponse } from '../api-types.ts';
import { h } from '../dom.ts';
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
import {
  ensureOnboarding,
  getConfig,
  getOnboarding,
  getSession,
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
  const prompt =
    current?.screen.id === 'declined'
      ? current.next_step.prompt
      : "That's okay. You can't use Cairn without agreeing, but you're not stuck.";
  const links = current?.screen.id === 'declined' ? (current.screen.links ?? []) : [];
  const readAgain = about && about in CONSENT_ROUTES ? CONSENT_ROUTES[about] : '/setup';
  const config = getConfig();

  return {
    title: "That's okay",
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, "That's okay"),
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
            'Read it again',
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

export const momentPage: Page = async ({ url }) => {
  const signedIn = getSession().authenticated;
  const cached = getOnboarding();
  let acknowledgment: string;
  let continueLabel = "I'm ready to continue";
  // After a distress signal on the name screen the API already sent the pause screen.
  if (cached?.screen.id === 'paused' && cached.screen.acknowledgment) {
    acknowledgment = cached.screen.acknowledgment;
    continueLabel = cached.next_step.options?.[0]?.label ?? continueLabel;
  } else {
    try {
      const pause = await api.get<PauseResponse>('/v1/onboarding/need-a-moment');
      acknowledgment = pause.screen.acknowledgment ?? '';
      continueLabel = pause.next_step.options?.[0]?.label ?? continueLabel;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      acknowledgment =
        "Take all the time you need. Everything you've done is saved, and nothing here is going anywhere.";
    }
  }

  const continueTo = signedIn ? '/setup' : '/';
  return {
    title: 'Take a moment',
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'Take a moment'),
      cairnMessage(acknowledgment),
      crisisCallout(),
      actions(
        h(
          'a',
          {
            href: url.pathname === '/moment' ? continueTo : '/setup',
            class: 'button-primary',
            'data-route': '',
            onClick: () => {
              setOnboarding(null);
            },
          },
          continueLabel,
        ),
        signedIn ? textButton('Finish later', () => void signOut()) : null,
      ),
    ),
  };
};

export const newCasePage: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (current.account.onboarding_step !== 'complete') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  return {
    title: 'Start a new case',
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'Start a new case'),
      cairnMessage(
        'Starting a case on the web is almost ready. Everything you set up is saved, and nothing is counting down yet. Your 28 free days begin only when you start your first journey.',
      ),
      actions(
        routeLink('/setup/done', 'Go back'),
        textButton('I will come back later', () => void signOut()),
      ),
    ),
  };
};

export const notFoundPage: Page = () => ({
  title: 'Page not found',
  step: null,
  content: h(
    'div',
    { class: 'content' },
    h('h1', {}, 'We could not find that page'),
    h('p', { class: 'lede' }, 'The link may be old, or the address may have a typo.'),
    actions(routeLink('/', 'Go to the start', 'button-primary')),
  ),
});
