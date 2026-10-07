/**
 * UC-REG-16, setup complete, and the hand-off to case creation (wireframe 10).
 *
 * Shows the API's summary of the choices, including where confirmations go,
 * with a way to change each one that comes back here. Then Start a case,
 * which asks how the person is connected (POST /v1/onboarding/case-handoff),
 * or the home screen. The shared device tip shows here once (UC-REG-19).
 * Nothing about the person who died is asked on this screen.
 */
import { h, svgIcon } from '../dom.ts';
import { icons } from '../icons.ts';
import { notesList, paragraphs } from '../components/blocks.ts';
import { actions, cairnMessage, primaryButton, routeLink } from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import { isReadAloudOn, setReadAloud } from '../preferences.ts';
import type { Page } from '../router.ts';
import { ensureOnboarding, setOnboarding } from '../state.ts';

function changeLink(href: string, what: string): HTMLAnchorElement {
  return routeLink(href, ['Change', h('span', { class: 'sr-only' }, ` ${what}`)]);
}

export const donePage: Page = async ({ navigate }) => {
  let current = await ensureOnboarding();
  if (current.screen.id !== 'setup_complete') {
    // A cached response from an earlier step. Ask the API.
    setOnboarding(null);
    current = await ensureOnboarding();
  }
  if (current.screen.id !== 'setup_complete') {
    navigate(current.screen.id === 'ready' ? '/home' : routeForScreen(current.screen.id), {
      replace: true,
    });
    return null;
  }
  const screen = current.screen;
  const [summary, ...rest] = screen.body ?? [];
  const options = current.next_step.options ?? [];
  const start = options.find((o) => o.value === 'start_case');
  const home = options.find((o) => o.value === 'home');

  const readAloudValue = h('strong', {}, isReadAloudOn() ? 'On' : 'Off');
  const readAloudChange = h(
    'button',
    {
      type: 'button',
      class: 'text-link',
      onClick: () => {
        setReadAloud(!isReadAloudOn());
        readAloudValue.textContent = isReadAloudOn() ? 'On' : 'Off';
      },
    },
    'Change',
    h('span', { class: 'sr-only' }, ' Read my messages aloud'),
  );

  return {
    title: 'Your account is ready',
    step: null,
    content: h(
      'div',
      { class: 'content content-wide' },
      h(
        'p',
        { class: 'ready-badge' },
        svgIcon(icons.stepDone, 26),
        h('span', {}, 'Your account is ready'),
      ),
      h('h1', { class: 'sr-only' }, 'Your account is ready'),
      screen.acknowledgment ? cairnMessage(screen.acknowledgment) : null,
      summary ? h('p', { class: 'lede' }, summary) : null,
      h(
        'ul',
        { class: 'link-list' },
        h('li', {}, changeLink('/setup/name?change=1&return=done', 'what I call you')),
        h('li', {}, changeLink('/setup/voice?change=1&return=done', 'how I talk with you')),
        h('li', {}, changeLink('/settings/notifications?return=done', 'how I keep in touch')),
        h('li', {}, 'Read my messages aloud: ', readAloudValue, ' ', readAloudChange),
      ),
      notesList(current.notes),
      paragraphs(rest),
      actions(
        primaryButton(start?.label ?? 'Start a case', () => {
          navigate('/cases/start');
        }),
        home ? routeLink('/home', home.label, 'button-secondary') : null,
      ),
    ),
  };
};
