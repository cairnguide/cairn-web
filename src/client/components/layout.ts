/**
 * The page shell from the wireframes: skip link, header with display
 * controls, the "Setting up" step list, main content, and the footer with
 * Privacy Policy, Terms of Use, the AI disclosure, and the 988 crisis line.
 */
import { h, svgIcon, type Child } from '../dom.ts';
import { icons } from '../icons.ts';
import { SETUP_STEPS, type SetupStepIndex } from '../onboarding.ts';
import {
  TEXT_SIZE_LABELS,
  cycleTextSize,
  getTextSize,
  isReadAloudOn,
  setReadAloud,
} from '../preferences.ts';
import { stopSpeaking } from '../speech.ts';
import { getConfig, getSession, signOut } from '../state.ts';
import { newTabLink } from './controls.ts';

export interface ShellOptions {
  /** Index into SETUP_STEPS to show the step list, or null for none. */
  step: SetupStepIndex | null;
  content: Child;
  /** Show "I need a moment" in the step list (UC-REG-14). */
  needAMomentLabel?: string;
}

function textSizeButton(): HTMLButtonElement {
  const label = h('span', { class: 'control-value' }, TEXT_SIZE_LABELS[getTextSize()]);
  const button = h(
    'button',
    {
      type: 'button',
      class: 'control',
      'aria-describedby': 'text-size-help',
      onClick: () => {
        label.textContent = TEXT_SIZE_LABELS[cycleTextSize()];
      },
    },
    svgIcon(icons.textSize, 20),
    h('span', {}, 'Text size'),
    label,
  );
  return button;
}

function readAloudButton(): HTMLButtonElement {
  const state = h('span', { class: 'control-value' }, isReadAloudOn() ? 'On' : 'Off');
  const button = h(
    'button',
    {
      type: 'button',
      class: 'control',
      'aria-pressed': isReadAloudOn() ? 'true' : 'false',
      onClick: () => {
        const on = !isReadAloudOn();
        setReadAloud(on);
        if (!on) stopSpeaking();
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        state.textContent = on ? 'On' : 'Off';
      },
    },
    svgIcon(icons.speaker, 20),
    h('span', {}, 'Read aloud'),
    state,
  );
  return button;
}

export function siteHeader(): HTMLElement {
  const session = getSession();
  const config = getConfig();
  return h(
    'header',
    { class: 'masthead' },
    h(
      'div',
      { class: 'brand' },
      h('a', { class: 'wordmark', href: '/', 'data-route': '' }, 'Cairn'),
      h('span', { class: 'tagline' }, 'After a death, step by step.'),
    ),
    h(
      'div',
      { class: 'masthead-right' },
      session.authenticated && session.email
        ? h('span', { class: 'signed-in' }, 'Signed in as ', h('strong', {}, session.email))
        : null,
      h(
        'div',
        { class: 'controls', role: 'group', 'aria-label': 'Display and help' },
        textSizeButton(),
        readAloudButton(),
        newTabLink(config.support_url, [svgIcon(icons.help, 20), h('span', {}, 'Help')], 'control'),
        session.authenticated
          ? h(
              'button',
              { type: 'button', class: 'control', onClick: () => void signOut() },
              h('span', {}, 'Sign out'),
            )
          : null,
      ),
      h(
        'span',
        { id: 'text-size-help', class: 'sr-only' },
        'Changes the size of the words on every page.',
      ),
    ),
  );
}

export function setupSteps(current: SetupStepIndex, needAMomentLabel?: string): HTMLElement {
  return h(
    'nav',
    { class: 'setup-steps', 'aria-label': 'Account setup steps' },
    h('p', { class: 'setup-count' }, `Setting up, step ${current + 1} of ${SETUP_STEPS.length}`),
    h(
      'ol',
      {},
      SETUP_STEPS.map((label, index) => {
        const done = index < current;
        const here = index === current;
        return h(
          'li',
          {
            class: here ? 'step step-current' : done ? 'step step-done' : 'step',
            'aria-current': here ? 'step' : null,
          },
          svgIcon(here ? icons.stepCurrent : done ? icons.stepDone : icons.stepTodo, 24),
          h(
            'span',
            { class: 'step-label' },
            label,
            here ? h('span', { class: 'step-state' }, 'You are here') : null,
            done ? h('span', { class: 'step-state' }, 'Done') : null,
          ),
        );
      }),
    ),
    h('p', { class: 'setup-note' }, 'You can stop at any step. Your progress is saved.'),
    needAMomentLabel
      ? h(
          'a',
          { class: 'need-a-moment', href: '/setup/paused', 'data-route': '' },
          svgIcon(icons.pause, 20),
          needAMomentLabel,
        )
      : null,
  );
}

export function siteFooter(): HTMLElement {
  const config = getConfig();
  return h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'footer-links' },
      newTabLink(config.privacy_policy_url, 'Privacy Policy'),
      newTabLink(config.terms_url, 'Terms of Use'),
      h('span', { class: 'footer-note' }, 'Cairn is an AI guide, not a human.'),
    ),
    h(
      'p',
      { class: 'crisis-line' },
      svgIcon(icons.phone, 18),
      h('span', {}, 'In crisis? Call or text ', h('a', { href: 'tel:988' }, '988'), ' any time.'),
    ),
  );
}

export function shell(options: ShellOptions): HTMLElement {
  const main = h('main', { id: 'main', tabindex: '-1', class: 'main' }, options.content);
  const body =
    options.step === null
      ? main
      : h(
          'div',
          { class: 'setup-layout' },
          setupSteps(options.step, options.needAMomentLabel),
          main,
        );
  return h(
    'div',
    { class: 'page' },
    h('a', { class: 'skip-link', href: '#main' }, 'Skip to main content'),
    siteHeader(),
    body,
    siteFooter(),
  );
}
