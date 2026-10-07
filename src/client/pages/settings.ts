/**
 * Settings (UC-REG-17) and the account actions that live there.
 *
 *   /settings                 everything in one place, each editable on its own
 *   /settings/notifications   channels, how often, quiet hours, due date lead time,
 *                             inactivity notices, and Stop all reminders
 *   /settings/subscription    status and only the actions that apply (UC-SUB-23)
 *   /settings/sign-in         add or remove another way to sign in (UC-REG-05)
 *   /settings/download        download all my data (JSON, always free)
 *   /settings/delete          delete the account and everything in it (UC-ACCT-01)
 *   /settings/ask             ask Cairn about the account in plain words
 *
 * Every change is read back in one line and saved on its own, with where the
 * confirmation went. Settings work on a read-only account too. At care level
 * 4 the API changes nothing in that turn (AC-26-11), and its answer is shown.
 */
import { api, withQuery } from '../api.ts';
import type {
  AccountChatSession,
  AccountDeletionInfo,
  AccountDeletionResponse,
  AccountMessageResponse,
  AccountResponse,
  CancelSubscriptionResponse,
  Choice,
  DataExportInfo,
  NotificationChannelsIn,
  NotificationSettingsPatch,
  NotificationSettingsResponse,
  PortalResponse,
  SignInMethod,
  SignInMethodsChange,
  SubscriptionOut,
} from '../api-types.ts';
import { h, replaceChildren } from '../dom.ts';
import {
  attempt,
  backLink,
  errorSlot,
  notesList,
  optionButtons,
  page,
  paragraphs,
  says,
  supportList,
  widePage,
} from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  callout,
  primaryButton,
  routeLink,
  textButton,
} from '../components/controls.ts';
import { askForBrowserNotifications, stopBrowserNotifications } from '../push.ts';
import type { Page } from '../router.ts';
import {
  endSessionAfterDeletion,
  getCareLevel,
  leaveFor,
  setFlash,
  setOnboarding,
  signOut,
  takeFlash,
} from '../state.ts';
import { channelPicker, radioGroup } from './notifications.ts';
import { VOICE_LABELS } from './voice.ts';

/** Labels for the choices the settings response carries as values only. Client copy, for review. */
export const FREQUENCY_LABELS = [
  { value: 'due_only', label: 'Only when something is due' },
  { value: 'daily', label: 'Once a day' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'none', label: 'No reminders' },
];
export const LEAD_LABELS = [
  { value: 'day_before', label: 'The day before' },
  { value: 'three_days', label: '3 days before' },
  { value: 'one_week', label: 'A week before' },
];
export const INACTIVITY_LABELS = [
  { value: 'off', label: "Don't check in" },
  { value: 'three_days', label: 'After 3 quiet days' },
  { value: 'one_week', label: 'After a quiet week' },
  { value: 'two_weeks', label: 'After 2 quiet weeks' },
];
const METHOD_LABELS: Record<SignInMethod, string> = {
  google: 'Google',
  apple: 'Apple',
  email: 'Email link',
};

function flashNote(): HTMLElement | null {
  const message = takeFlash();
  return message ? h('p', { class: 'note', role: 'status' }, message) : null;
}

function row(label: string, value: string, href: string | null, what: string): HTMLElement {
  return h(
    'div',
    { class: 'summary-row' },
    h('dt', {}, label),
    h(
      'dd',
      {},
      h('strong', {}, value),
      href ? routeLink(href, ['Change', h('span', { class: 'sr-only' }, ` ${what}`)]) : null,
    ),
  );
}

export const settingsPage: Page = async () => {
  const care = getCareLevel();
  const [me, prefs, subscription] = await Promise.all([
    api.get<AccountResponse>(withQuery('/v1/me', { care_level: care })),
    api.get<NotificationSettingsResponse>('/v1/me/notification-preferences'),
    api.get<SubscriptionOut>(withQuery('/v1/me/subscription', { care_level: care })),
  ]);
  const account = me.account;
  const methods = [account.sign_in_method, ...(account.linked_sign_in_methods ?? [])].filter(
    (m): m is SignInMethod => Boolean(m),
  );
  return {
    title: 'Settings',
    step: null,
    content: widePage(
      'Settings',
      flashNote(),
      notesList(me.notes),
      h('h2', {}, 'You'),
      h(
        'dl',
        { class: 'summary' },
        row(
          'What I call you',
          account.preferred_name ?? 'Not set',
          '/setup/name?change=1',
          'what I call you',
        ),
        row(
          'How to say it',
          account.name_pronunciation ?? 'Not added',
          '/setup/name?change=1',
          'how to say your name',
        ),
        row(
          'How I talk with you',
          VOICE_LABELS[account.voice]?.label ?? account.voice,
          '/setup/voice?change=1',
          'how I talk with you',
        ),
        row('Your time zone', account.time_zone ?? 'Not set', null, ''),
      ),
      h('h2', {}, 'Keeping in touch'),
      h('p', {}, prefs.preferences.readback),
      h('p', {}, routeLink('/settings/notifications', 'Change how I keep in touch')),
      h('h2', {}, 'Subscription'),
      subscription.status_line ? h('p', {}, subscription.status_line) : null,
      h('p', {}, routeLink('/settings/subscription', 'Subscription and payments')),
      h('h2', {}, 'Signing in'),
      h('p', {}, `You sign in with: ${methods.map((m) => METHOD_LABELS[m]).join(', ')}.`),
      h('p', {}, routeLink('/settings/sign-in', 'Ways to sign in')),
      h('h2', {}, 'Your information'),
      h(
        'ul',
        { class: 'link-list' },
        h('li', {}, routeLink('/settings/download', 'Download all my data')),
        h('li', {}, routeLink('/settings/delete', 'Delete my account')),
        h('li', {}, routeLink('/settings/ask', 'Ask Cairn about my account')),
      ),
      actions(textButton('Sign out', () => void signOut())),
    ),
  };
};

// ------------------------------------------------------------------ notifications

export const notificationSettingsPage: Page = async ({ url, navigate }) => {
  const backTo = url.searchParams.get('return') === 'done' ? '/setup/done' : '/settings';
  const [settings, me] = await Promise.all([
    api.get<NotificationSettingsResponse>('/v1/me/notification-preferences'),
    api.get<AccountResponse>(withQuery('/v1/me', { care_level: getCareLevel() })),
  ]);
  const prefs = settings.preferences;
  const status = h('p', { class: 'note', role: 'status', hidden: true });
  const errors = errorSlot();

  const save = async (patch: NotificationSettingsPatch) => {
    const result = await api.patch<NotificationSettingsResponse>(
      '/v1/me/notification-preferences',
      {
        ...patch,
        care_level: getCareLevel(),
      },
    );
    status.textContent = result.next_step.prompt;
    status.hidden = false;
    setOnboarding(null);
    return result;
  };

  const choices: Choice[] = [
    { value: 'email', label: `Email to ${me.account.email}` },
    { value: 'in_app', label: 'Inside Cairn' },
    ...(settings.push_public_key
      ? [{ value: 'browser', label: 'Browser notifications on this device' }]
      : []),
  ];
  const picker = channelPicker('How should I let you know?', choices, {
    email: prefs.channels.includes('email'),
    browser: prefs.browser_notifications_on,
  });
  const saveChannels = primaryButton('Save how I let you know', () => {
    void attempt(saveChannels, errors, async () => {
      const wantsBrowser = picker.browser?.checked === true;
      let channels: NotificationChannelsIn;
      if (wantsBrowser && !prefs.browser_notifications_on) {
        channels = await askForBrowserNotifications(picker.email.checked, settings.push_public_key);
      } else {
        if (!wantsBrowser && prefs.browser_notifications_on) await stopBrowserNotifications();
        channels = { email: picker.email.checked, browser: wantsBrowser };
      }
      await save({ channels });
    });
  });

  const frequency = radioGroup('frequency', 'How often?', FREQUENCY_LABELS, prefs.frequency);
  const saveFrequency = primaryButton('Save how often', () => {
    void attempt(saveFrequency, errors, () =>
      save({ frequency: frequency.value() as NotificationSettingsPatch['frequency'] }),
    );
  });

  const lead = radioGroup(
    'lead',
    'How early should I tell you a date is coming up?',
    LEAD_LABELS,
    prefs.due_date_lead,
  );
  const saveLead = primaryButton('Save how early', () => {
    void attempt(saveLead, errors, () =>
      save({ due_date_lead: lead.value() as NotificationSettingsPatch['due_date_lead'] }),
    );
  });

  const inactivity = radioGroup(
    'inactivity',
    'Should I check in if things go quiet for a while?',
    INACTIVITY_LABELS,
    prefs.inactivity_after,
  );
  const saveInactivity = primaryButton('Save checking in', () => {
    void attempt(saveInactivity, errors, () =>
      save({
        inactivity_after: inactivity.value() as NotificationSettingsPatch['inactivity_after'],
      }),
    );
  });

  const quietStart = h('input', {
    id: 'quiet-start',
    type: 'time',
    class: 'text-input text-input-short',
    value: prefs.quiet_hours_start.slice(0, 5),
  });
  const quietEnd = h('input', {
    id: 'quiet-end',
    type: 'time',
    class: 'text-input text-input-short',
    value: prefs.quiet_hours_end.slice(0, 5),
  });
  const saveQuiet = primaryButton('Save quiet hours', () => {
    void attempt(saveQuiet, errors, () =>
      save({ quiet_hours_start: quietStart.value, quiet_hours_end: quietEnd.value }),
    );
  });

  const stopAll = h(
    'button',
    { type: 'button', class: 'button-secondary' },
    settings.next_step.options?.find((o) => o.value === 'stop_all_reminders')?.label ??
      'Stop all reminders',
  );
  stopAll.addEventListener('click', () => {
    void attempt(stopAll, errors, async () => {
      // One step, no persuasion.
      await save({ stop_all_reminders: true });
      navigate(url.pathname + url.search, { replace: true });
    });
  });

  const section = (title: string, ...children: (Node | null)[]) =>
    h('section', { class: 'settings-section' }, h('h2', {}, title), children);

  return {
    title: 'How Cairn keeps in touch',
    step: null,
    content: widePage(
      'How Cairn keeps in touch',
      backLink(backTo, backTo === '/settings' ? 'Back to Settings' : 'Back to your summary'),
      h('p', { class: 'lede' }, prefs.readback),
      status,
      errors,
      section('Where', picker.root, actions(saveChannels)),
      section('How often', frequency.root, actions(saveFrequency)),
      section(
        'Quiet hours',
        h(
          'p',
          { class: 'field-hint' },
          `No reminders between these times, in your time zone (${me.account.time_zone ?? 'your browser'}).`,
        ),
        h(
          'div',
          { class: 'input-row' },
          h('div', { class: 'field' }, h('label', { for: 'quiet-start' }, 'From'), quietStart),
          h('div', { class: 'field' }, h('label', { for: 'quiet-end' }, 'Until'), quietEnd),
        ),
        actions(saveQuiet),
      ),
      section('Due dates', lead.root, actions(saveLead)),
      section('Checking in', inactivity.root, actions(saveInactivity)),
      section(
        'Stop all reminders',
        h('p', {}, 'Confirmations of things you do, and account notices, still go to your email.'),
        actions(stopAll),
      ),
    ),
  };
};

// ------------------------------------------------------------------ subscription

export const subscriptionSettingsPage: Page = async ({ navigate }) => {
  const care = getCareLevel();
  const sub = await api.get<SubscriptionOut>(
    withQuery('/v1/me/subscription', { care_level: care }),
  );
  const errors = errorSlot();
  const explainer = h('div', {});

  const portal = (purpose: 'update_payment' | 'invoices', button: HTMLButtonElement) =>
    void attempt(button, errors, async () => {
      const result = await api.post<PortalResponse>('/v1/me/subscription/portal', { purpose });
      leaveFor(result.portal_url);
    });

  const cancelFlow = (button: HTMLButtonElement) =>
    void attempt(button, errors, async () => {
      const result = await api.post<CancelSubscriptionResponse>('/v1/me/subscription/cancel', {
        confirm: false,
        care_level: care,
      });
      replaceChildren(
        explainer,
        cairnMessage(result.message),
        optionButtons(result.next_step.options, (option, b) => {
          if (option.value !== 'confirm') {
            replaceChildren(explainer);
            return;
          }
          void attempt(b, errors, async () => {
            const done = await api.post<CancelSubscriptionResponse>('/v1/me/subscription/cancel', {
              confirm: true,
              care_level: care,
            });
            setFlash(done.message);
            navigate('/settings/subscription', { replace: true });
          });
        }),
      );
    });

  return {
    title: 'Subscription',
    step: null,
    content: page(
      'Subscription',
      backLink('/settings', 'Back to Settings'),
      flashNote(),
      sub.status_line ? cairnMessage(sub.status_line) : null,
      sub.billing_notice
        ? callout('info', 'warning', h('p', { role: 'status' }, sub.billing_notice))
        : null,
      sub.breaks_note ? h('p', {}, sub.breaks_note) : null,
      optionButtons(sub.actions, (option, button) => {
        switch (option.value) {
          case 'subscribe':
            navigate('/subscription/terms');
            return;
          case 'update_payment':
          case 'invoices':
            portal(option.value, button);
            return;
          case 'confirm_payment':
            void attempt(button, errors, async () => {
              const result = await api.post<PortalResponse>('/v1/me/subscription/confirm-payment');
              leaveFor(result.portal_url);
            });
            return;
          case 'cancel':
            cancelFlow(button);
            return;
          case 'undo_cancel':
            void attempt(button, errors, async () => {
              const result = await api.post<CancelSubscriptionResponse>(
                '/v1/me/subscription/undo-cancel',
              );
              setFlash(result.message);
              navigate('/settings/subscription', { replace: true });
            });
            return;
          default:
        }
      }),
      explainer,
      errors,
    ),
  };
};

// ------------------------------------------------------------------ sign-in methods

const LINK_RESULTS: Record<string, string> = {
  linked: 'Done. You can now sign in that way too.',
  already_linked: 'That way to sign in was already on your account.',
  cancelled: 'No problem. Nothing was changed.',
};

export const signInMethodsPage: Page = async ({ url, navigate }) => {
  const me = await api.get<AccountResponse>(withQuery('/v1/me', { care_level: getCareLevel() }));
  const account = me.account;
  const linked = account.linked_sign_in_methods ?? [];
  const all: SignInMethod[] = ['google', 'apple', 'email'];
  const available = all.filter((m) => m !== account.sign_in_method && !linked.includes(m));
  const result = url.searchParams.get('link');
  const errors = errorSlot();
  const message = result
    ? (LINK_RESULTS[result] ??
      "We couldn't add that way to sign in. Nothing was changed. If it belongs to another Cairn account, contact support.")
    : null;

  return {
    title: 'Ways to sign in',
    step: null,
    content: page(
      'Ways to sign in',
      backLink('/settings', 'Back to Settings'),
      message ? h('p', { class: 'note', role: 'status' }, message) : null,
      h(
        'p',
        { class: 'lede' },
        `You created your account with ${account.sign_in_method ? METHOD_LABELS[account.sign_in_method] : 'a sign-in'}. That one always stays.`,
      ),
      linked.length > 0
        ? h(
            'ul',
            { class: 'link-list' },
            linked.map((method) => {
              const remove = h(
                'button',
                { type: 'button', class: 'text-link' },
                `Remove ${METHOD_LABELS[method]}`,
              );
              remove.addEventListener('click', () => {
                void attempt(remove, errors, async () => {
                  const change = await api.del<SignInMethodsChange>(
                    `/v1/me/sign-in-methods/${method}`,
                  );
                  setFlash(change.message);
                  navigate('/settings/sign-in', { replace: true });
                });
              });
              return h('li', {}, h('strong', {}, METHOD_LABELS[method]), ' ', remove);
            }),
          )
        : null,
      available.length > 0
        ? [
            h('h2', {}, 'Add another way'),
            h(
              'p',
              {},
              "You'll sign in once with the new way to prove it's yours. Cairn never joins two accounts on its own.",
            ),
            h(
              'div',
              { class: 'actions' },
              available.map((method) =>
                h(
                  'a',
                  { href: `/auth/link?method=${method}`, class: 'button-secondary' },
                  `Add ${METHOD_LABELS[method]}`,
                ),
              ),
            ),
          ]
        : null,
      flashNote(),
      errors,
    ),
  };
};

// ------------------------------------------------------------------ download my data

export const downloadPage: Page = async () => {
  const info = await api.get<DataExportInfo>('/v1/me/data-export');
  const label = info.next_step.options?.[0]?.label ?? 'Download';
  return {
    title: 'Download all my data',
    step: null,
    content: page(
      'Download all my data',
      backLink('/settings', 'Back to Settings'),
      cairnMessage(info.explanation),
      h(
        'p',
        {},
        // A plain link: the Worker adds the token, and the API names the file.
        h(
          'a',
          {
            href: '/api/v1/me/data-export/file',
            class: 'button-primary',
            download: 'cairn-data.json',
          },
          label,
        ),
      ),
      h(
        'p',
        { class: 'fine-print' },
        'The file is in JSON, a format other apps can read. It is always free.',
      ),
    ),
  };
};

// ------------------------------------------------------------------ delete account

export const deleteAccountPage: Page = async () => {
  const info = await api.get<AccountDeletionInfo>('/v1/me/deletion');
  const errors = errorSlot();
  const after = h('div', {});
  const confirmOption = info.next_step.options?.[0];
  const button = h(
    'button',
    { type: 'button', class: 'button-danger' },
    confirmOption?.label ?? 'Delete my account',
  );
  button.addEventListener('click', () => {
    void attempt(button, errors, async () => {
      const result = await api.post<AccountDeletionResponse>('/v1/me/deletion', {
        confirm: true,
        care_level: getCareLevel(),
      });
      // signed_out is always true when deletion happened. At care level 4 nothing is
      // deleted in the same turn and the API answers with an error, shown below.
      replaceChildren(after, notesList(result.notes), says(result.next_step.prompt));
      await endSessionAfterDeletion();
    });
  });
  return {
    title: 'Delete my account',
    step: null,
    content: page(
      'Delete my account',
      backLink('/settings', 'Back to Settings'),
      cairnMessage(info.explanation),
      info.subscription_note ? notesList([info.subscription_note]) : null,
      h('p', { class: 'lede' }, info.next_step.prompt),
      h('p', {}, `The one confirmation goes to ${info.masked_email}.`),
      actions(button, routeLink('/settings', 'Keep my account')),
      after,
      errors,
    ),
  };
};

// ------------------------------------------------------------------ ask about the account

export const askPage: Page = ({ navigate }) => {
  let session: AccountChatSession | null = null;
  const errors = errorSlot();
  const log = h('div', { class: 'conversation', 'aria-live': 'polite' });
  const input = h('textarea', {
    id: 'ask-text',
    class: 'text-input',
    rows: '3',
    maxlength: '2000',
  });
  const sendButton = h('button', { type: 'submit', class: 'button-primary' }, 'Send');

  const show = (reply: AccountMessageResponse) => {
    session = reply.session;
    if (reply.masked_text)
      log.appendChild(h('p', { class: 'you-said' }, `You: ${reply.masked_text}`));
    const options = reply.next_step.options ?? [];
    log.appendChild(
      h(
        'div',
        { class: 'turn' },
        says(reply.acknowledgment),
        paragraphs(reply.body),
        supportList(reply.support),
        h('p', { class: 'lede' }, reply.next_step.prompt),
        optionButtons(options, (option, button) => {
          if (option.value === 'delete_account' || reply.intent === 'delete_account')
            navigate('/settings/delete');
          else if (option.value === 'download_data' || option.value === 'download')
            navigate('/settings/download');
          else if (option.value === 'change_notifications') navigate('/settings/notifications');
          else if (option.value === 'confirm' && reply.proposal) {
            const proposal = reply.proposal;
            void attempt(button, errors, async () => {
              const result = await api.patch<NotificationSettingsResponse>(
                '/v1/me/notification-preferences',
                {
                  channels: proposal,
                  care_level: getCareLevel(),
                },
              );
              log.appendChild(says(result.next_step.prompt) ?? h('p', {}, 'Saved.'));
            });
          }
        }),
      ),
    );
  };

  const form = h(
    'form',
    {
      class: 'stack',
      novalidate: true,
      onSubmit: (event: Event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
          input.focus();
          return;
        }
        void attempt(sendButton, errors, async () => {
          const reply = await api.post<AccountMessageResponse>('/v1/me/messages', {
            text,
            session,
          });
          // Only the masked copy is kept on screen.
          input.value = '';
          show(reply);
        });
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'ask-text' }, 'What would you like to do?'),
      input,
    ),
    actions(sendButton),
  );

  return {
    title: 'Ask about my account',
    step: null,
    content: page(
      'Ask about my account',
      backLink('/settings', 'Back to Settings'),
      cairnMessage(
        'You can ask me to delete your account, download your data, or change how I keep in touch. Please leave out any account or card numbers.',
      ),
      log,
      form,
      errors,
    ),
  };
};
