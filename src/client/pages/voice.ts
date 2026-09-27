/**
 * Wireframe 9, "Choose how Cairn talks" (UC-REG-12).
 *
 * The voices, their taglines, and their sample replies come from the API,
 * which reads them from cairn-core voices/manifest.yaml. "Choose for me"
 * picks the default voice. The choice changes tone only, never the crisis
 * protocol, AI disclosure, attorney referrals, or citations.
 *
 * Also used from the "all set" screen to change the voice later
 * (PATCH /v1/me). The API only lists the choices during setup, so that view
 * uses the same four voices as voices/manifest.yaml.
 */
import { ApiError, api } from '../api.ts';
import type { AccountResponse, Choice, OnboardingResponse } from '../api-types.ts';
import { h, replaceChildren, srOnly, svgIcon } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  actions,
  busy,
  cairnMessage,
  errorBanner,
  primaryButton,
  routeLink,
} from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import type { Page } from '../router.ts';
import { canListen, speak } from '../speech.ts';
import { ensureOnboarding, setOnboarding } from '../state.ts';

/** Mirrors cairn-core voices/manifest.yaml (labels and taglines). Used only when changing the voice later. */
export const VOICE_LABELS: Record<string, { label: string; tagline: string }> = {
  steady_direct: { label: 'Steady and Direct', tagline: 'Just the next step, clearly stated' },
  warm_patient: { label: 'Warm & Patient', tagline: 'Room to process before moving on' },
  brisk_businesslike: {
    label: 'Brisk and Businesslike',
    tagline: 'Treat it like a project to close out',
  },
  plain_practical: {
    label: 'Plain and Practical',
    tagline: "No euphemisms, just what's true and what's next",
  },
};

function choiceCard(choice: Choice, checked: boolean, onSelect: () => void): HTMLDivElement {
  const id = `voice-${choice.value}`;
  const input = h('input', {
    id,
    type: 'radio',
    name: 'voice',
    value: choice.value,
    class: 'radio',
    checked,
    onChange: onSelect,
  });
  const sample = choice.sample ?? null;
  return h(
    'div',
    { class: checked ? 'choice choice-selected' : 'choice' },
    h(
      'div',
      { class: 'choice-head' },
      input,
      h('label', { for: id }, choice.label),
      checked ? h('span', { class: 'choice-badge' }, 'Chosen') : null,
    ),
    choice.tagline
      ? h('p', { class: 'choice-tagline' }, `${choice.tagline}.`.replace(/\.\.$/, '.'))
      : null,
    sample
      ? h(
          'div',
          { class: 'choice-sample' },
          canListen()
            ? h(
                'button',
                { type: 'button', class: 'control control-small', onClick: () => speak(sample) },
                svgIcon(icons.speaker, 18),
                h('span', {}, 'Hear a sample'),
                srOnly(` of ${choice.label}`),
              )
            : null,
          h('span', { class: 'fine-print' }, `Sample: "${sample}"`),
        )
      : null,
  );
}

export const voicePage: Page = async ({ url, navigate }) => {
  const editing = url.searchParams.get('change') === '1';
  const current = await ensureOnboarding();
  if (!editing && current.screen.id !== 'personality') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }

  const choices: Choice[] = editing
    ? Object.entries(VOICE_LABELS).map(([value, v]) => ({
        value,
        label: v.label,
        tagline: v.tagline,
      }))
    : (current.screen.choices ?? []);
  const chooseForMe = editing
    ? undefined
    : current.next_step.options?.find((o) => o.value === 'choose_for_me');

  let selected: string | null = editing ? current.account.voice : null;
  const errorArea = h('div', { 'aria-live': 'assertive' });
  const legendError = h('p', { class: 'field-error', id: 'voice-error', hidden: true });

  const fieldset = h('fieldset', { class: 'choices' });
  const renderChoices = () => {
    replaceChildren(
      fieldset,
      h('legend', {}, 'Choose one'),
      choices.map((choice) =>
        choiceCard(choice, choice.value === selected, () => {
          selected = choice.value;
          legendError.hidden = true;
          fieldset.removeAttribute('aria-describedby');
          renderChoices();
          fieldset.querySelector<HTMLInputElement>(`#voice-${choice.value}`)?.focus();
        }),
      ),
      legendError,
    );
  };
  renderChoices();

  const save = async (choice: string) => {
    errorArea.replaceChildren();
    try {
      if (editing) {
        const updated = await api.patch<AccountResponse>('/v1/me', { voice: choice });
        setOnboarding({ ...current, account: updated.account });
      } else {
        const next = await api.put<OnboardingResponse>('/v1/onboarding/personality', { choice });
        setOnboarding(next);
        navigate(routeForScreen(next.screen.id));
        return;
      }
      navigate('/setup/done');
    } catch (err) {
      errorArea.replaceChildren(
        errorBanner(
          err instanceof ApiError ? err.problem.detail : 'Something went wrong. Please try again.',
        ),
      );
    }
  };

  const continueButton = primaryButton(editing ? 'Save' : 'Continue', () => {
    if (!selected) {
      legendError.replaceChildren(
        svgIcon(icons.warning, 22),
        h('span', {}, 'Please choose one, or choose "Choose for me".'),
      );
      legendError.hidden = false;
      fieldset.setAttribute('aria-describedby', 'voice-error');
      fieldset.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    const choice = selected;
    void busy(continueButton, () => save(choice));
  });

  const name = current.account.preferred_name;
  const intro = editing
    ? 'How would you like me to talk with you?'
    : `${name ? `Thank you, ${name}. ` : ''}People want different things at a time like this. ${current.next_step.prompt}`;

  return {
    title: editing ? 'Change how Cairn talks' : 'How Cairn talks with you',
    step: editing ? null : 6,
    needAMomentLabel: current.support.need_a_moment_label,
    content: h(
      'div',
      { class: 'content' },
      h(
        'h1',
        { class: 'sr-only' },
        editing ? 'Change how Cairn talks' : 'How Cairn talks with you',
      ),
      cairnMessage(intro),
      current.screen.sample_situation && !editing
        ? h(
            'p',
            { class: 'fine-print' },
            `Each sample answers the same situation: ${current.screen.sample_situation}`,
          )
        : null,
      fieldset,
      errorArea,
      actions(
        continueButton,
        chooseForMe
          ? h(
              'button',
              {
                type: 'button',
                class: 'button-secondary',
                onClick: (e: Event) =>
                  void busy(e.currentTarget as HTMLButtonElement, () => save('choose_for_me')),
              },
              chooseForMe.label,
            )
          : null,
        editing ? routeLink('/setup/done', 'Go back') : null,
      ),
    ),
  };
};
