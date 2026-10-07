/**
 * Wireframe 1, "Start: choose how to sign up" (UC-REG-01 to UC-REG-03).
 *
 * Acknowledges the loss first, then offers Google, Apple, and email with
 * equal weight, a sign-in link, and a "Before you start" panel. Nothing is
 * asked for here. If Google or Apple sign-in was cancelled, a reassurance
 * note is shown (the API's oauth_cancelled copy). The Support resources link
 * and Take a break work without signing in (crisis plan AC-26-10, UC-BRK-02),
 * and "I can't get into my email" opens sign-in help (UC-REG-20).
 */
import { api } from '../api.ts';
import type { SignInMethod, WelcomeResponse } from '../api-types.ts';
import { h, svgIcon } from '../dom.ts';
import { icons, type IconName } from '../icons.ts';
import { callout, newTabLink, routeLink } from '../components/controls.ts';
import type { Page } from '../router.ts';
import { getSession, getWelcome } from '../state.ts';

const METHOD_DETAILS: Record<SignInMethod, { label: string; hint: string; href: string }> = {
  google: {
    label: 'Continue with Google',
    hint: 'Use the Google account you already have',
    href: '/auth/login?method=google&signup=1',
  },
  apple: {
    label: 'Continue with Apple',
    hint: 'Use your Apple ID',
    href: '/auth/login?method=apple&signup=1',
  },
  email: {
    label: 'Continue with email',
    hint: 'Make a new sign-in with your email address',
    href: '/signup/email',
  },
};

const METHOD_ORDER: SignInMethod[] = ['google', 'apple', 'email'];

function providerMark(method: SignInMethod): HTMLElement {
  if (method === 'email') return h('span', { class: 'method-mark' }, svgIcon(icons.mail, 24));
  // Brand marks are added with each provider's official artwork and usage rules.
  return h(
    'span',
    { class: 'method-mark method-mark-letter', 'aria-hidden': 'true' },
    method === 'google' ? 'G' : 'A',
  );
}

function methodButton(method: SignInMethod, label: string): HTMLAnchorElement {
  const details = METHOD_DETAILS[method];
  const attrs: Record<string, string> = { href: details.href, class: 'method' };
  // Email stays in the app. Google and Apple leave for Auth0, so no client routing.
  if (method === 'email') attrs['data-route'] = '';
  return h(
    'a',
    attrs,
    providerMark(method),
    h(
      'span',
      { class: 'method-text' },
      h('span', { class: 'method-label' }, label),
      h('span', { class: 'method-hint' }, details.hint),
    ),
  );
}

const BEFORE_YOU_START: [IconName, string][] = [
  [
    'noCard',
    'No card needed. Cairn is free for 28 days, and your 28 days only begin when you start your first journey.',
  ],
  [
    'shield',
    'Cairn never uses your information, or information about the person who died, for marketing or advertising.',
  ],
  ['trash', 'You can download or delete your information at any time, for free.'],
  ['info', 'Cairn is an AI guide. It is not a human, an attorney, or a therapist.'],
];

export const startPage: Page = async ({ url, navigate }) => {
  // Someone already signed in goes straight back to where they left off.
  if (getSession().authenticated) {
    navigate('/setup', { replace: true });
    return null;
  }

  const cancelled = url.searchParams.get('oauth_cancelled') === 'true';
  let welcome: WelcomeResponse | null = cancelled ? null : getWelcome();
  if (!welcome) {
    try {
      welcome = await api.get<WelcomeResponse>(
        `/v1/welcome${cancelled ? '?oauth_cancelled=true' : ''}`,
      );
    } catch {
      // The screen still works without the API. Labels fall back to the wireframe's.
    }
  }

  const labels = new Map(welcome?.methods.map((m) => [m.method, m.label]) ?? []);
  const notes = welcome?.notes ?? [];
  const signInError = url.searchParams.get('signin_error') === 'true';

  return {
    title: 'Create your Cairn account',
    step: null,
    content: h(
      'div',
      { class: 'start' },
      h(
        'div',
        { class: 'start-main' },
        h('h1', {}, 'We are so sorry you are here.'),
        h(
          'p',
          { class: 'lede' },
          'You do not have to figure this out all at once. Cairn will walk with you one step at a time, and you can stop whenever you need to.',
        ),
        notes.map((note) => callout('info', 'info', h('p', { role: 'status' }, note.text))),
        cancelled && notes.length === 0
          ? callout(
              'info',
              'info',
              h(
                'p',
                { role: 'status' },
                "No problem. You can choose another way whenever you're ready.",
              ),
            )
          : null,
        signInError
          ? callout(
              'error',
              'warning',
              h(
                'p',
                { role: 'alert' },
                "We couldn't finish signing you in. Nothing was saved. Please try again.",
              ),
            )
          : null,
        h('h2', { id: 'create-h' }, 'Create your free account'),
        h(
          'div',
          { class: 'methods', role: 'group', 'aria-labelledby': 'create-h' },
          METHOD_ORDER.map((method) =>
            methodButton(method, labels.get(method) ?? METHOD_DETAILS[method].label),
          ),
        ),
        h(
          'p',
          { class: 'sign-in' },
          'Already have an account? ',
          h('a', { href: '/auth/login' }, 'Sign in'),
        ),
        h(
          'p',
          {},
          routeLink('/sign-in-help', welcome?.cant_get_into_email ?? "I can't get into my email"),
        ),
        welcome?.not_ready
          ? h('p', {}, newTabLink(welcome.not_ready.url, welcome.not_ready.label, 'text-link'))
          : null,
      ),
      h(
        'aside',
        { class: 'before-you-start', 'aria-labelledby': 'before-h' },
        h('h2', { id: 'before-h' }, 'Before you start'),
        h(
          'ul',
          {},
          BEFORE_YOU_START.map(([icon, text]) =>
            h('li', {}, svgIcon(icons[icon], 26), h('span', {}, text)),
          ),
        ),
        h(
          'p',
          { class: 'before-links' },
          routeLink('/support', welcome?.support.support_resources_label ?? 'Support resources'),
          ' ',
          routeLink('/break?from=%2F', welcome?.support.take_a_break_label ?? 'Take a break'),
        ),
      ),
    ),
  };
};
