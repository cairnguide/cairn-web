/**
 * Wireframe 10, "All set, hand-off to case creation" (after UC-REG-12).
 *
 * Confirms the account is ready in the chosen voice, summarizes the choices
 * with a way to change each, and offers to start a case or come back later.
 */
import { h, svgIcon } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  actions,
  cairnMessage,
  callout,
  primaryButton,
  routeLink,
  textButton,
} from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import { isReadAloudOn, setReadAloud } from '../preferences.ts';
import type { Page } from '../router.ts';
import { ensureOnboarding, signOut } from '../state.ts';
import { VOICE_LABELS } from './voice.ts';

function trialText(startedAt: string | null, endDate: string | null): string {
  if (!startedAt) return 'Not started. They begin when you start your first journey.';
  return endDate ? `Started. They end on ${endDate}.` : 'Started.';
}

function summaryRow(label: string, value: string, change: HTMLElement | null): HTMLDivElement {
  return h(
    'div',
    { class: 'summary-row' },
    h('dt', {}, label),
    h('dd', {}, h('strong', {}, value), change),
  );
}

export const donePage: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (
    current.screen.id !== 'case_handoff' &&
    current.screen.id !== 'ready' &&
    current.account.onboarding_step !== 'complete'
  ) {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  const { account } = current;
  const name = account.preferred_name ?? '';
  const message =
    current.screen.acknowledgment ??
    `You are all set${name ? `, ${name}` : ''}. Whenever you feel ready, we can start with the person you are taking care of things for. There is no rush.`;

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
      cairnMessage(message),
      h(
        'dl',
        { class: 'summary' },
        summaryRow(
          'What I will call you',
          name || 'Not set',
          routeLink('/setup/name?change=1', [
            'Change',
            h('span', { class: 'sr-only' }, ' What I will call you'),
          ]),
        ),
        summaryRow(
          'How I talk with you',
          VOICE_LABELS[account.voice]?.label ?? account.voice,
          routeLink('/setup/voice?change=1', [
            'Change',
            h('span', { class: 'sr-only' }, ' How I talk with you'),
          ]),
        ),
        h(
          'div',
          { class: 'summary-row' },
          h('dt', {}, 'Read my messages aloud'),
          h('dd', {}, readAloudValue, readAloudChange),
        ),
        summaryRow(
          'Your 28 free days',
          trialText(account.trial_started_at, account.trial_end_date),
          null,
        ),
      ),
      callout(
        'info',
        'trash',
        'You can download or delete your information from Settings at any time, for free.',
      ),
      actions(
        primaryButton('Start a new case', () => {
          navigate('/cases/new');
        }),
        textButton('I will come back later', () => void signOut()),
      ),
    ),
  };
};
