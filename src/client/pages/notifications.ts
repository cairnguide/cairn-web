/**
 * UC-REG-15, two screens with one question each: how Cairn lets the person
 * know (channels), then how often (frequency).
 *
 * Email and in-app start selected. In-app is always on and can't be
 * unchecked. Browser notifications are offered only when Cairn can send them
 * (the API sends a push key) and this browser can show them. The browser is
 * asked for permission only after the person chose browser and selected
 * Continue. No phone number is asked for, and text messages aren't offered.
 *
 * The same controls are reused in Settings (settings.ts).
 */
import { api } from '../api.ts';
import type { Choice, NotificationChannelsIn, OnboardingResponse } from '../api-types.ts';
import { h } from '../dom.ts';
import { attempt, errorSlot, notesList, paragraphs } from '../components/blocks.ts';
import { actions, cairnMessage, primaryButton, textButton } from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import { askForBrowserNotifications, browserNotificationsSupported } from '../push.ts';
import type { Page } from '../router.ts';
import { ensureOnboarding, setOnboarding, signOut } from '../state.ts';

export interface ChannelPicker {
  root: HTMLFieldSetElement;
  email: HTMLInputElement;
  browser: HTMLInputElement | null;
}

/** Checkboxes for email, in-app (always on), and browser when it can work here. */
export function channelPicker(
  legend: string,
  choices: Choice[],
  selected: { email: boolean; browser: boolean },
): ChannelPicker {
  const found: { email?: HTMLInputElement; browser?: HTMLInputElement } = {};
  const rows = choices
    .filter((c) => c.value !== 'browser' || browserNotificationsSupported())
    .map((choice) => {
      const id = `channel-${choice.value}`;
      const alwaysOn = choice.value === 'in_app';
      const input = h('input', {
        id,
        type: 'checkbox',
        class: 'checkbox',
        checked:
          alwaysOn ||
          (choice.value === 'email' && selected.email) ||
          (choice.value === 'browser' && selected.browser),
        disabled: alwaysOn,
        'aria-describedby': alwaysOn ? `${id}-hint` : null,
      });
      if (choice.value === 'email') found.email = input;
      if (choice.value === 'browser') found.browser = input;
      return h(
        'div',
        { class: 'checkbox-row channel-row' },
        input,
        h('label', { for: id }, choice.label),
        alwaysOn
          ? h(
              'span',
              { id: `${id}-hint`, class: 'field-hint' },
              'Always on. You see these inside Cairn.',
            )
          : null,
      );
    });
  const root = h('fieldset', { class: 'choices' }, h('legend', {}, legend), rows);
  return {
    root,
    email: found.email ?? h('input', { type: 'checkbox', checked: true }),
    browser: found.browser ?? null,
  };
}

/** Radio buttons, one per option, with one chosen. */
export function radioGroup(
  name: string,
  legend: string,
  options: { value: string; label: string }[],
  chosen: string,
): { root: HTMLFieldSetElement; value: () => string } {
  const root = h(
    'fieldset',
    { class: 'choices' },
    h('legend', {}, legend),
    options.map((option) => {
      const id = `${name}-${option.value}`;
      return h(
        'div',
        { class: 'radio-row' },
        h('input', {
          id,
          type: 'radio',
          name,
          value: option.value,
          class: 'radio',
          checked: option.value === chosen,
        }),
        h('label', { for: id }, option.label),
      );
    }),
  );
  return {
    root,
    value: () => root.querySelector<HTMLInputElement>('input:checked')?.value ?? chosen,
  };
}

export const channelsPage: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (current.screen.id !== 'notification_channels') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  const screen = current.screen;
  const picker = channelPicker(current.next_step.prompt, screen.choices ?? [], {
    email: true,
    browser: false,
  });
  const errors = errorSlot();
  const continueButton = primaryButton('Continue', () => {
    void attempt(continueButton, errors, async () => {
      const wantsBrowser = picker.browser?.checked === true;
      // Asked here, in direct response to Continue, never on page load.
      const body: NotificationChannelsIn = wantsBrowser
        ? await askForBrowserNotifications(picker.email.checked, screen.push_public_key)
        : { email: picker.email.checked, browser: false };
      const next = await api.put<OnboardingResponse>('/v1/onboarding/notification-channels', body);
      setOnboarding(next);
      navigate(routeForScreen(next.screen.id));
    });
  });

  return {
    title: 'How Cairn keeps in touch',
    step: 8,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'How Cairn keeps in touch'),
      notesList(current.notes),
      screen.acknowledgment ? cairnMessage(screen.acknowledgment) : null,
      picker.root,
      picker.browser ? paragraphs(screen.body) : null,
      h(
        'p',
        { class: 'fine-print' },
        'Cairn never asks for a phone number here, and does not send text messages.',
      ),
      errors,
      actions(
        continueButton,
        textButton('Finish later', () => void signOut()),
      ),
    ),
  };
};

export const frequencyPage: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (current.screen.id !== 'notification_frequency') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  const options = current.next_step.options ?? [];
  const group = radioGroup('frequency', current.next_step.prompt, options, 'due_only');
  const errors = errorSlot();
  const continueButton = primaryButton('Continue', () => {
    void attempt(continueButton, errors, async () => {
      const next = await api.put<OnboardingResponse>('/v1/onboarding/notification-frequency', {
        frequency: group.value(),
      });
      setOnboarding(next);
      navigate(routeForScreen(next.screen.id));
    });
  });
  return {
    title: 'How often to hear from Cairn',
    step: 8,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'How often to hear from Cairn'),
      notesList(current.notes),
      group.root,
      paragraphs(current.screen.body),
      errors,
      actions(
        continueButton,
        textButton('Finish later', () => void signOut()),
      ),
    ),
  };
};
