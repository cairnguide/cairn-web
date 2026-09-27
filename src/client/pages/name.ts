/**
 * Wireframes 7 and 8, "Preferred name, typing" and "Preferred name, speaking"
 * (UC-REG-11).
 *
 * Cairn asks what to call the person. They can type or, if this device can
 * turn speech into text on its own, speak. Nothing is sent until they choose
 * Send (or "That is right, send it"). A name Google or Apple shared is only
 * a pre-fill, and is saved only when the person sends it.
 *
 * If the text shows signs of distress, the API saves nothing and pauses
 * sign-up (UC-REG-14). This page then shows the pause screen.
 *
 * Also used from the "all set" screen to change the name later (PATCH /v1/me).
 */
import { ApiError, api } from '../api.ts';
import type { AccountResponse, OnboardingResponse } from '../api-types.ts';
import { h, svgIcon } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  actions,
  busy,
  cairnMessage,
  callout,
  errorBanner,
  routeLink,
  textButton,
  uid,
} from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import type { Page } from '../router.ts';
import { canSpeakLocally, createLocalRecognizer, mightSpeakLocally } from '../speech.ts';
import { ensureOnboarding, setOnboarding } from '../state.ts';
import { checkPreferredName } from '../validation.ts';

const LEAD_IN = 'Thank you for reading all of that. I am Cairn, and I will be your guide.';
const FOLLOW_UP = 'A first name, a nickname, or anything you like is fine.';

export const namePage: Page = async ({ url, navigate }) => {
  const editing = url.searchParams.get('change') === '1';
  const current = await ensureOnboarding();
  if (!editing && current.screen.id !== 'preferred_name') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }

  const question = editing ? 'What would you like me to call you?' : current.next_step.prompt;
  const prefill = editing
    ? (current.account.preferred_name ?? '')
    : (current.screen.input?.prefill ?? '');
  const pronunciationLabel = current.screen.input?.optional_link_label ?? 'Add how to say it';
  const pronunciationPrompt = current.screen.input?.optional_prompt ?? 'How do you say it?';

  const hintId = uid('name-hint');
  const errorId = uid('name-error');
  const input = h('input', {
    id: 'preferred-name',
    type: 'text',
    autocomplete: 'nickname',
    maxlength: '100',
    class: 'text-input',
    'aria-describedby': hintId,
    value: prefill,
  });
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const errorArea = h('div', { 'aria-live': 'assertive' });

  const pronunciation = h('input', {
    id: 'pronunciation',
    type: 'text',
    maxlength: '200',
    class: 'text-input',
    autocomplete: 'off',
  });
  const pronunciationField = h(
    'div',
    { class: 'field', hidden: true },
    h('label', { for: 'pronunciation' }, pronunciationPrompt),
    pronunciation,
  );
  const pronunciationToggle = textButton(pronunciationLabel, () => {
    pronunciationField.hidden = false;
    pronunciationToggle.hidden = true;
    pronunciation.focus();
  });

  const showError = (message: string | null) => {
    if (message) {
      error.replaceChildren(svgIcon(icons.warning, 22), h('span', {}, message));
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${hintId} ${errorId}`);
    } else {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', hintId);
    }
  };

  const send = async () => {
    errorArea.replaceChildren();
    const message = checkPreferredName(input.value);
    showError(message);
    if (message) {
      input.focus();
      return;
    }
    const body: Record<string, string> = { preferred_name: input.value.trim() };
    if (pronunciation.value.trim()) body.name_pronunciation = pronunciation.value.trim();
    try {
      if (editing) {
        const updated = await api.patch<AccountResponse>('/v1/me', body);
        setOnboarding({ ...current, account: updated.account });
        navigate('/setup/done');
        return;
      }
      const next = await api.put<OnboardingResponse>('/v1/onboarding/preferred-name', body);
      setOnboarding(next);
      navigate(routeForScreen(next.screen.id));
    } catch (err) {
      errorArea.replaceChildren(
        errorBanner(
          err instanceof ApiError ? err.problem.detail : 'Something went wrong. Please try again.',
        ),
      );
    }
  };

  const sendButton = h(
    'button',
    { type: 'submit', class: 'button-primary button-inline' },
    h('span', {}, editing ? 'Save' : 'Send'),
    svgIcon(icons.arrowRight, 20),
  );

  // ---- Speaking (wireframe 8) ----
  const speakArea = h('div', { class: 'speak-area', hidden: true });
  const speakButton = h(
    'button',
    { type: 'button', class: 'button-secondary button-inline', hidden: !mightSpeakLocally() },
    svgIcon(icons.mic, 22),
    h('span', {}, 'Speak'),
  );
  const speakNotice = h('p', { class: 'field-hint', role: 'status' });

  const typeRow = h('div', { class: 'input-row' }, input, speakButton, sendButton);

  speakButton.addEventListener('click', () => {
    void startSpeaking();
  });

  const startSpeaking = async () => {
    // Only now ask the browser whether recognition can run on this device.
    const recognizer = (await canSpeakLocally()) ? createLocalRecognizer() : null;
    if (!recognizer) {
      speakButton.hidden = true;
      speakNotice.textContent =
        "Speaking isn't available on this device, so nothing was recorded. Please type your answer.";
      input.focus();
      return;
    }
    const heard = h('p', { class: 'heard-text' });
    const status = h('p', { class: 'listening' }, 'Listening. Speak when you are ready.');
    let latest = '';
    const finish = () => {
      speakArea.hidden = true;
      typeRow.hidden = false;
      input.focus();
    };
    const stop = h(
      'button',
      {
        type: 'button',
        class: 'button-secondary',
        onClick: () => {
          recognizer.stop();
        },
      },
      svgIcon(icons.stop, 20),
      h('span', {}, 'Stop listening'),
    );
    const accept = h(
      'button',
      {
        type: 'button',
        class: 'button-primary',
        onClick: () => {
          recognizer.stop();
          input.value = latest;
          finish();
          void busy(sendButton, send);
        },
      },
      h('span', {}, 'That is right, send it'),
    );
    const retry = textButton('Try again', () => {
      latest = '';
      heard.textContent = '';
      recognizer.start();
    });
    recognizer.onText = (text) => {
      latest = text;
      heard.textContent = text;
    };
    recognizer.onEnd = () => {
      status.textContent = latest
        ? 'Is this right?'
        : 'I did not catch that. You can try again or type instead.';
    };
    speakArea.replaceChildren(
      status,
      h(
        'div',
        { class: 'heard', 'aria-live': 'polite' },
        h('span', { class: 'heard-label' }, 'What I heard so far'),
        heard,
      ),
      h('div', { class: 'actions' }, stop, accept, retry),
      h(
        'p',
        { class: 'fine-print' },
        'Nothing is sent until you choose "That is right, send it." Your voice is turned into text on this device as you speak. The recording is never kept.',
      ),
      textButton('Type instead', () => {
        recognizer.stop();
        finish();
      }),
    );
    typeRow.hidden = true;
    speakArea.hidden = false;
    recognizer.start();
    stop.focus();
  };

  const form = h(
    'form',
    {
      class: 'stack',
      novalidate: true,
      onSubmit: (event: Event) => {
        event.preventDefault();
        void busy(sendButton, send);
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'preferred-name' }, 'Your answer'),
      typeRow,
      speakArea,
      speakNotice,
      h(
        'span',
        { id: hintId, class: 'field-hint' },
        'Type your answer, or choose Speak and say it out loud if you see it. You can switch any time.',
      ),
      error,
    ),
    h('div', {}, pronunciationToggle, pronunciationField),
    errorArea,
  );

  return {
    title: editing ? 'Change what I call you' : 'What to call you',
    step: editing ? null : 5,
    needAMomentLabel: current.support.need_a_moment_label,
    content: h(
      'div',
      { class: 'content' },
      h('h1', { class: 'sr-only' }, editing ? 'Change what I call you' : 'What to call you'),
      cairnMessage(editing ? question : `${LEAD_IN} ${question} ${FOLLOW_UP}`),
      form,
      callout(
        'info',
        'speaker',
        h(
          'div',
          {},
          'You can type or speak with me any time. Choose ',
          h('strong', {}, 'Listen'),
          ' on any message to hear it read aloud, or turn on ',
          h('strong', {}, 'Read aloud'),
          ' at the top of the page. When you speak, your voice is only turned into text. The recording is never kept.',
        ),
      ),
      editing ? actions(routeLink('/setup/done', 'Go back')) : null,
    ),
  };
};
