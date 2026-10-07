/**
 * The case conversation (cairn-core case creation spec 3.2.0, UC-CASE-01 to
 * UC-CASE-24, and the Support and Crisis Plan).
 *
 * One turn at a time: Cairn acknowledges first, says at most one thing to
 * answer, and offers exactly one next action. Every question can be answered
 * with a button, in the person's own words (typed, or spoken and turned into
 * text on this device), skipped, or answered "I'm not sure".
 *
 * What the client keeps: the IntakeSession from the last turn, sent back with
 * the next one (UC-CASE-14). It lives in memory only. Free text is sent once
 * and only the API's masked copy is shown back. Nothing is saved from free
 * text until the person confirms Cairn's read-back.
 *
 * Care levels: at level 2 the questions stop and three choices are offered.
 * At levels 3 and 4 nothing is asked, 988 comes first, and the page offers
 * only to stay or to continue when ready. Take a break in the header saves
 * where the person left off first (UC-BRK-04).
 */
import { api, seg, withQuery } from '../api.ts';
import type {
  AnswerIn,
  AttorneyTrigger,
  CaseResponse,
  FieldKey,
  IntakeSession,
  IntakeTurnResponse,
  NextStep,
  Option,
  ProposedAnswer,
  Question,
} from '../api-types.ts';
import { h, svgIcon, type Child } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  announcementsBlock,
  attempt,
  errorSlot,
  notesList,
  optionButtons,
  paragraphs,
  readThisToMe,
  supportList,
} from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  crisisCallout,
  primaryButton,
  routeLink,
  textButton,
  uid,
} from '../components/controls.ts';
import { isFieldKey, questionFor, rememberQuestion } from '../intake-fields.ts';
import type { Page, PageContext, View } from '../router.ts';
import { canSpeakLocally, createLocalRecognizer, mightSpeakLocally } from '../speech.ts';
import { getCareLevel, getIntakeSession, rememberTurn, takeTurn } from '../state.ts';

/** A case turn or the resume screen, which share what is drawn. */
type Turn = Partial<IntakeTurnResponse> &
  Pick<CaseResponse, 'case' | 'next_step' | 'controls' | 'read_aloud'>;

/** Things Cairn should not guide alone (UC-CASE-16). Client copy, for review. */
const ATTORNEY_TRIGGERS: { value: AttorneyTrigger; label: string }[] = [
  { value: 'contested_will', label: 'Someone may challenge the will' },
  { value: 'family_disagreement', label: 'The family disagrees about what to do' },
  { value: 'unsure_of_authority', label: "I'm not sure who has the authority to act" },
  { value: 'multi_state_property', label: 'They owned property in more than one state' },
  { value: 'early_property_disposal', label: 'Someone wants to sell or give away things early' },
];

const REST_CHOICES = new Set(['today', 'three_days', 'week', 'until_back']);

function path(id: string, rest = ''): string {
  return `/v1/cases/${seg(id)}${rest}`;
}

/** The spoken words, once the person has seen what was heard (UC-CASE-22). */
const heardText = new Map<string, string>();

interface Ctx {
  id: string;
  page: PageContext;
  errors: HTMLElement;
}

function session(id: string): IntakeSession | null {
  return getIntakeSession(id);
}

/** Shows the next turn: kept in memory, then the page re-renders from it. */
function show(ctx: Ctx, turn: IntakeTurnResponse, extra = ''): void {
  rememberTurn(ctx.id, turn);
  if (turn.question) rememberQuestion(turn.question);
  ctx.page.navigate(`/cases/${seg(ctx.id)}${extra}`, { replace: true });
}

function post(
  ctx: Ctx,
  rest: string,
  body: unknown,
  button: HTMLButtonElement | null,
  extra = '',
): void {
  void attempt(button, ctx.errors, async () => {
    show(ctx, await api.post<IntakeTurnResponse>(path(ctx.id, rest), body), extra);
  });
}

function keepGoing(ctx: Ctx, button: HTMLButtonElement | null): void {
  post(ctx, '/intake/continue', { session: session(ctx.id) }, button);
}

function answer(
  ctx: Ctx,
  field: FieldKey,
  body: Omit<AnswerIn, 'session'>,
  button: HTMLButtonElement | null,
): void {
  void attempt(button, ctx.errors, async () => {
    const turn = await api.put<IntakeTurnResponse>(path(ctx.id, `/intake/answers/${field}`), {
      ...body,
      session: session(ctx.id),
    });
    show(ctx, turn);
  });
}

function sendWords(
  ctx: Ctx,
  text: string,
  mode: 'typed' | 'speech',
  button: HTMLButtonElement | null,
): void {
  post(ctx, '/intake/messages', { text, input_mode: mode, session: session(ctx.id) }, button);
}

// ------------------------------------------------------------------ own words and speech

/** A text box for the person's own words, with Speak when this device can do it on its own. */
function ownWordsForm(ctx: Ctx, label: string, prefill = ''): HTMLElement {
  const id = uid('words');
  const input = h('textarea', { id, class: 'text-input', rows: '3', maxlength: '2000' });
  input.value = prefill;
  const send = h(
    'button',
    { type: 'submit', class: 'button-primary button-inline' },
    h('span', {}, 'Send'),
    svgIcon(icons.arrowRight, 20),
  );
  const notice = h('p', { class: 'field-hint', role: 'status' });
  const speakButton = h(
    'button',
    { type: 'button', class: 'button-secondary button-inline', hidden: !mightSpeakLocally() },
    svgIcon(icons.mic, 22),
    h('span', {}, 'Speak'),
  );
  speakButton.addEventListener('click', () => {
    void listen(ctx, speakButton, notice, input);
  });
  return h(
    'form',
    {
      class: 'stack words-form',
      novalidate: true,
      onSubmit: (event: Event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) {
          notice.textContent = 'Please type something first, or choose another option.';
          input.focus();
          return;
        }
        sendWords(ctx, text, 'typed', send);
      },
    },
    h('div', { class: 'field' }, h('label', { for: id }, label), input),
    h('div', { class: 'input-row' }, speakButton, send),
    notice,
    h(
      'p',
      { class: 'fine-print' },
      'Please leave out Social Security, account, and card numbers. If any slip in, Cairn removes them before anything is kept.',
    ),
  );
}

/**
 * Speech to text on this device only. The transcript goes to the API, which
 * removes sensitive numbers and checks it like typed text, then shows it back
 * with Did I hear that right? The audio never leaves the device.
 */
async function listen(
  ctx: Ctx,
  button: HTMLButtonElement,
  notice: HTMLElement,
  input: HTMLTextAreaElement,
): Promise<void> {
  const recognizer = (await canSpeakLocally()) ? createLocalRecognizer() : null;
  if (!recognizer) {
    button.hidden = true;
    notice.textContent =
      "Speaking isn't available on this device, so nothing was recorded. Please type instead.";
    input.focus();
    return;
  }
  let latest = '';
  notice.textContent = 'Listening. Speak when you are ready.';
  recognizer.onText = (text) => {
    latest = text;
    notice.textContent = `Heard so far: ${text}`;
  };
  recognizer.onEnd = () => {
    notice.textContent = '';
    void attempt(null, ctx.errors, async () => {
      const turn = await api.post<IntakeTurnResponse>(path(ctx.id, '/intake/transcripts'), {
        transcript: latest || null,
        unclear: !latest,
        session: session(ctx.id),
      });
      if (turn.masked_text) heardText.set(ctx.id, turn.masked_text);
      show(ctx, turn);
    });
  };
  recognizer.start();
}

/** Replaces a set of options with the own-words box, and moves focus into it. */
function swapInWords(ctx: Ctx, button: HTMLButtonElement, label: string, prefill = ''): void {
  const form = ownWordsForm(ctx, label, prefill);
  button.closest('.option-list')?.replaceWith(form);
  form.querySelector('textarea')?.focus();
}

// ------------------------------------------------------------------ questions

function selectField(
  id: string,
  label: string,
  options: { value: string; label: string }[],
  chosen = '',
): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h(
      'select',
      { id, class: 'text-input' },
      h('option', { value: '' }, 'Choose one'),
      options.map((o) => h('option', { value: o.value, selected: o.value === chosen }, o.label)),
    ),
  );
}

function valueOf(root: ParentNode, id: string): string {
  const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  return el?.value.trim() ?? '';
}

function fieldError(area: HTMLElement, message: string): void {
  area.replaceChildren(
    h(
      'p',
      { class: 'field-error', role: 'alert' },
      svgIcon(icons.warning, 22),
      h('span', {}, message),
    ),
  );
}

/** The answer controls for one question, by its input kind. */
function questionForm(ctx: Ctx, q: Question): HTMLElement {
  const local = h('div', { 'aria-live': 'assertive' });
  const extra = h('div', { class: 'stack' });
  let body: Child;

  const pick = (option: Option, button: HTMLButtonElement) => {
    answer(ctx, q.field, { state: 'answered', value: option.value }, button);
  };

  switch (q.input) {
    case 'choice':
      body = optionButtons(q.options, pick, { label: q.prompt });
      break;
    case 'text': {
      const id = uid('text');
      const input = h('input', {
        id,
        type: 'text',
        class: 'text-input',
        maxlength: '100',
        autocomplete: 'off',
      });
      const save = primaryButton('Save', () => {
        const value = input.value.trim();
        if (!value) {
          fieldError(local, 'Please type a name, or choose Skip for now.');
          input.focus();
          return;
        }
        answer(ctx, q.field, { state: 'answered', value, own_words: value }, save);
      });
      body = h(
        'div',
        { class: 'stack' },
        h('div', { class: 'field' }, h('label', { for: id }, 'Name'), input),
        actions(save),
      );
      break;
    }
    case 'date_of_death':
      body = optionButtons(q.options, (option, button) => {
        if (option.value !== 'exact') {
          answer(
            ctx,
            q.field,
            { state: 'answered', value: { precision: option.value, date: null } },
            button,
          );
          return;
        }
        const id = uid('date');
        const today = new Date().toISOString().slice(0, 10);
        const save = primaryButton('Save the date', () => {
          const date = valueOf(extra, id);
          if (!date) {
            fieldError(local, 'Please choose the date.');
            return;
          }
          if (date > today) {
            fieldError(local, 'That date is in the future. Please check it and try again.');
            return;
          }
          answer(ctx, q.field, { state: 'answered', value: { precision: 'exact', date } }, save);
        });
        extra.replaceChildren(
          h(
            'div',
            { class: 'field' },
            h('label', { for: id }, 'Date'),
            h('input', { id, type: 'date', class: 'text-input text-input-short', max: today }),
          ),
          actions(save),
        );
        extra.querySelector('input')?.focus();
      });
      break;
    case 'place_of_death':
      body = optionButtons(q.options, (option, button) => {
        if (option.value === 'outside_us') {
          answer(
            ctx,
            q.field,
            { state: 'answered', value: { outside_us: true, jurisdiction: null } },
            button,
          );
          return;
        }
        const away = option.value === 'away_from_home';
        const stateId = uid('state');
        const cityId = uid('city');
        const save = primaryButton('Save', () => {
          const jurisdiction = valueOf(extra, stateId);
          if (!jurisdiction) {
            fieldError(local, 'Please choose the state or territory, or choose I’m not sure.');
            return;
          }
          const city = valueOf(extra, cityId);
          answer(
            ctx,
            q.field,
            {
              state: 'answered',
              value: { jurisdiction, county_or_city: city || null, outside_us: false },
              away_from_home: away,
            },
            save,
          );
        });
        extra.replaceChildren(
          selectField(stateId, q.picker_label ?? 'State or territory', q.jurisdictions ?? []),
          h(
            'div',
            { class: 'field' },
            h('label', { for: cityId }, 'County or city (optional)'),
            h('input', { id: cityId, type: 'text', class: 'text-input', maxlength: '100' }),
          ),
          actions(save),
        );
        extra.querySelector('select')?.focus();
      });
      break;
    case 'residence_jurisdiction':
      body = optionButtons(q.options, (option, button) => {
        if (option.value !== 'different') {
          answer(ctx, q.field, { state: 'answered', value: { choice: option.value } }, button);
          return;
        }
        const stateId = uid('home-state');
        const save = primaryButton('Save', () => {
          const jurisdiction = valueOf(extra, stateId);
          if (!jurisdiction) {
            fieldError(local, 'Please choose where they lived, or choose I don’t know.');
            return;
          }
          answer(
            ctx,
            q.field,
            { state: 'answered', value: { choice: 'different', jurisdiction } },
            save,
          );
        });
        extra.replaceChildren(
          selectField(stateId, q.picker_label ?? 'State or territory', q.jurisdictions ?? []),
          actions(save),
        );
        extra.querySelector('select')?.focus();
      });
      break;
    case 'multi_choice': {
      const rows = q.options.map((o) => {
        const id = uid('item');
        const byId = `${id}-by`;
        const elsewhere = h('input', { id: `${id}-else`, type: 'checkbox', class: 'checkbox' });
        const byField = h(
          'div',
          { class: 'field', hidden: true },
          h('label', { for: byId }, 'Who is handling it? You can leave this blank.'),
          h('input', { id: byId, type: 'text', class: 'text-input', maxlength: '60' }),
        );
        elsewhere.addEventListener('change', () => {
          byField.hidden = !elsewhere.checked;
        });
        const box = h('input', { id, type: 'checkbox', class: 'checkbox', value: o.value });
        const handled =
          q.handled_elsewhere_label && o.value !== 'none_or_unsure'
            ? h(
                'div',
                { class: 'checkbox-row nested' },
                elsewhere,
                h('label', { for: `${id}-else` }, q.handled_elsewhere_label),
                byField,
              )
            : null;
        if (handled) handled.hidden = true;
        box.addEventListener('change', () => {
          if (handled) handled.hidden = !box.checked;
        });
        return {
          option: o,
          box,
          elsewhere,
          byId,
          row: h(
            'div',
            { class: 'checkbox-item' },
            h('div', { class: 'checkbox-row' }, box, h('label', { for: id }, o.label)),
            handled,
          ),
        };
      });
      const save = primaryButton('Save', () => {
        const chosen = rows.filter((r) => r.box.checked);
        if (chosen.length === 0) {
          fieldError(
            local,
            "Please select at least one, or choose “Nothing yet, or I'm not sure”.",
          );
          return;
        }
        if (chosen.some((r) => r.option.value === 'none_or_unsure') && chosen.length > 1) {
          fieldError(local, "“Nothing yet, or I'm not sure” can't be chosen with other items.");
          return;
        }
        const value = chosen.map((r) => {
          if (!r.elsewhere.checked) return r.option.value;
          const by = valueOf(extra.ownerDocument, r.byId);
          return { item: r.option.value, handled_by: by || null };
        });
        answer(ctx, q.field, { state: 'answered', value }, save);
      });
      body = h(
        'fieldset',
        { class: 'choices' },
        h('legend', { class: 'sr-only' }, q.prompt),
        rows.map((r) => r.row),
        actions(save),
      );
      break;
    }
    default:
      body = optionButtons(q.options, pick);
  }

  return h(
    'div',
    { class: 'question' },
    h('p', { class: 'question-prompt' }, q.prompt),
    body,
    extra,
    local,
    h(
      'div',
      { class: 'option-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'button-secondary',
          onClick: (e: Event) => {
            answer(ctx, q.field, { state: 'skipped' }, e.currentTarget as HTMLButtonElement);
          },
        },
        q.skip.label,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button-secondary',
          onClick: (e: Event) => {
            answer(ctx, q.field, { state: 'unsure' }, e.currentTarget as HTMLButtonElement);
          },
        },
        q.not_sure.label,
      ),
    ),
    q.free_text_allowed !== false
      ? h(
          'details',
          { class: 'own-words' },
          h('summary', {}, q.free_text_label),
          ownWordsForm(ctx, q.free_text_label),
        )
      : null,
  );
}

// ------------------------------------------------------------------ the next step

function readback(
  ctx: Ctx,
  proposals: ProposedAnswer[],
  step: NextStep,
  masked: string | null | undefined,
): Child {
  return [
    h(
      'dl',
      { class: 'summary' },
      proposals.map((p) =>
        h(
          'div',
          { class: 'summary-row' },
          h('dt', {}, questionFor(p.field).prompt),
          h('dd', {}, h('strong', {}, p.label)),
        ),
      ),
    ),
    h('p', { class: 'lede' }, step.prompt),
    optionButtons(
      step.options,
      (option, button) => {
        if (option.value === 'yes') {
          post(
            ctx,
            '/intake/confirmations',
            {
              answers: proposals.map((p) => ({
                field: p.field,
                value: p.value,
                own_words: p.own_words ?? null,
              })),
              session: session(ctx.id),
            },
            button,
          );
          return;
        }
        // Fix it: write it again, starting from the masked copy.
        swapInWords(ctx, button, 'Tell me again in your own words', masked ?? '');
      },
      { primaryFirst: true },
    ),
  ];
}

function nextStepBlock(ctx: Ctx, turn: Turn): Child {
  const step = turn.next_step;
  const status = turn.case.status;
  const toPlan = () => {
    ctx.page.navigate(
      status === 'draft' ? `/cases/${seg(ctx.id)}/preview` : `/cases/${seg(ctx.id)}/journey`,
    );
  };

  switch (step.action) {
    case 'answer_question':
      return turn.question ? questionForm(ctx, turn.question) : null;
    case 'confirm_readback':
      return readback(ctx, turn.proposals ?? [], step, turn.masked_text);
    case 'confirm_transcript': {
      const heard = heardText.get(ctx.id) ?? turn.masked_text ?? '';
      return [
        h(
          'div',
          { class: 'heard' },
          h('span', { class: 'heard-label' }, 'What I heard'),
          h('p', { class: 'heard-text' }, heard),
        ),
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(
          step.options,
          (option, button) => {
            if (option.value === 'yes') {
              heardText.delete(ctx.id);
              sendWords(ctx, heard, 'speech', button);
            } else {
              swapInWords(ctx, button, 'Change what I heard', heard);
            }
          },
          { primaryFirst: true },
        ),
      ];
    }
    case 'speak_again':
      return [
        h('p', { class: 'lede' }, step.prompt),
        ownWordsForm(
          ctx,
          step.options?.find((o) => o.value === 'type')?.label ?? 'Type your answer',
        ),
      ];
    case 'choose_intake_mode':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          if (option.value === 'own_words') {
            swapInWords(ctx, button, 'In your own words');
          } else {
            keepGoing(ctx, button);
          }
        }),
      ];
    case 'choose_pace':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          void attempt(button, ctx.errors, async () => {
            show(
              ctx,
              await api.put<IntakeTurnResponse>(path(ctx.id, '/intake/preferences'), {
                skip_explainers: option.value === 'skip_explainers',
                session: session(ctx.id),
              }),
            );
          });
        }),
      ];
    case 'choose_name_fallback':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          void attempt(button, ctx.errors, async () => {
            show(
              ctx,
              await api.put<IntakeTurnResponse>(path(ctx.id, '/intake/preferences'), {
                name_fallback: option.value,
                session: session(ctx.id),
              }),
            );
          });
        }),
      ];
    case 'overwhelm_choice':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          post(
            ctx,
            '/intake/level-2-choice',
            { choice: option.value, session: session(ctx.id) },
            button,
          );
        }),
      ];
    case 'stay_with_user':
    case 'just_talk':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          if (option.value === 'continue') keepGoing(ctx, button);
          else
            button
              .closest('.option-list')
              ?.replaceWith(
                h(
                  'p',
                  { class: 'note', role: 'status' },
                  "That's okay. I'm here. Take all the time you need.",
                ),
              );
        }),
        h(
          'details',
          { class: 'own-words' },
          h('summary', {}, 'Say something'),
          ownWordsForm(ctx, 'Whatever you would like to say'),
        ),
      ];
    case 'intake_stopped':
      return [
        crisisCallout(),
        h('p', { class: 'lede' }, step.prompt),
        actions(routeLink('/home', 'Go to your home screen')),
      ];
    case 'small_task':
      return [
        h('p', { class: 'lede' }, step.prompt),
        actions(
          primaryButton('Keep going', () => {
            keepGoing(ctx, null);
          }),
          routeLink('/home', 'Not now'),
        ),
      ];
    case 'paused':
    case 'resume':
    case 'draft_saved':
    case 'death_not_yet':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(
          step.options,
          (option, button) => {
            switch (option.value) {
              case 'keep_going':
                keepGoing(ctx, button);
                return;
              case 'something_else':
                ctx.page.navigate('/home');
                return;
              case 'save_draft':
              case 'come_back_later':
              case 'has_happened':
              case 'not_yet':
                post(
                  ctx,
                  '/intake/death-not-yet',
                  { choice: option.value, session: session(ctx.id) },
                  button,
                );
                return;
              default:
                keepGoing(ctx, button);
            }
          },
          { primaryFirst: true },
        ),
        actions(routeLink('/home', 'Go to your home screen')),
      ];
    case 'choose_rest':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          if (REST_CHOICES.has(option.value))
            post(
              ctx,
              '/take-a-break',
              { rest_choice: option.value, session: session(ctx.id) },
              button,
            );
          else keepGoing(ctx, button);
        }),
      ];
    case 'resting':
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (option, button) => {
          if (option.value === 'resume' || option.value === 'back') {
            void attempt(button, ctx.errors, async () => {
              await api.del(withQuery('/v1/me/break', { care_level: getCareLevel() }));
              keepGoing(ctx, null);
            });
          } else {
            ctx.page.navigate('/home');
          }
        }),
      ];
    case 'review':
      return [
        h('p', { class: 'lede' }, step.prompt),
        actions(
          routeLink(
            `/cases/${seg(ctx.id)}/review`,
            step.options?.[0]?.label ?? 'Review what you shared',
            'button-primary',
          ),
        ),
      ];
    case 'view_journey':
    case 'preview_journey':
      return [
        h('p', { class: 'lede' }, step.prompt),
        actions(
          primaryButton(
            status === 'draft' ? 'See the journey that fits' : 'Open the journey',
            toPlan,
          ),
        ),
      ];
    default:
      return [
        h('p', { class: 'lede' }, step.prompt),
        optionButtons(step.options, (_option, button) => {
          keepGoing(ctx, button);
        }),
      ];
  }
}

/** Extra ways out on a draft: things Cairn shouldn't guide alone, and a death that hasn't happened. */
function draftTools(ctx: Ctx, turn: Turn): Child {
  const quiet = ['death_not_yet', 'draft_saved', 'intake_stopped', 'stay_with_user'];
  if (
    turn.case.status !== 'draft' ||
    (turn.care_level ?? 1) >= 2 ||
    quiet.includes(turn.next_step.action)
  ) {
    return null;
  }
  return h(
    'div',
    { class: 'draft-tools' },
    h(
      'details',
      {},
      h('summary', {}, 'Something here needs a lawyer'),
      h(
        'p',
        {},
        'Cairn will add a step to talk with an estate attorney, and keep helping with everything else. Choose what applies.',
      ),
      optionButtons(ATTORNEY_TRIGGERS, (option, button) => {
        post(
          ctx,
          '/intake/attorney-referrals',
          { trigger: option.value, session: session(ctx.id) },
          button,
        );
      }),
    ),
    h(
      'details',
      {},
      h('summary', {}, 'The death has not happened yet'),
      h(
        'p',
        {},
        "Cairn's journeys start after a death. You can save what you've shared and come back.",
      ),
      optionButtons([{ value: 'not_yet', label: 'They are still living' }], (option, button) => {
        post(
          ctx,
          '/intake/death-not-yet',
          { choice: option.value, session: session(ctx.id) },
          button,
        );
      }),
    ),
    h(
      'p',
      {},
      routeLink(`/cases/${seg(ctx.id)}/review`, 'Review what you shared so far'),
      ' · ',
      textButton('Stop for now', (e) => {
        post(
          ctx,
          '/intake/pause',
          { session: session(ctx.id) },
          e.currentTarget as HTMLButtonElement,
        );
      }),
    ),
  );
}

function turnView(ctx: Ctx, turn: Turn): View {
  const level = turn.care_level ?? getCareLevel();
  const crisisFirst = level === 4;
  return {
    title: turn.case.status === 'draft' ? 'Starting a case' : 'Your case',
    step: null,
    onTakeABreak: () => {
      // One select, no confirmation. Saves where the person left off first.
      post(ctx, '/take-a-break', { session: session(ctx.id) }, null);
    },
    content: h(
      'div',
      { class: 'content conversation-page' },
      h('h1', { class: 'sr-only' }, turn.case.status === 'draft' ? 'Starting a case' : 'Your case'),
      h(
        'div',
        { class: 'conversation-tools' },
        h('span', { class: 'ai-label' }, 'Cairn is an AI guide, not a person.'),
        readThisToMe(turn.read_aloud),
      ),
      crisisFirst ? supportList(turn.support) : null,
      turn.acknowledgment ? cairnMessage(turn.acknowledgment) : null,
      paragraphs(turn.body),
      turn.redactions && turn.redactions.length > 0
        ? h(
            'p',
            { class: 'fine-print' },
            'Some numbers were removed from what you wrote, to keep them private.',
          )
        : null,
      turn.masked_text && turn.next_step.action !== 'confirm_transcript'
        ? h('p', { class: 'you-said' }, `You said: ${turn.masked_text}`)
        : null,
      notesList(turn.notes),
      crisisFirst ? null : supportList(turn.support),
      announcementsBlock(turn.announcements, (announcement, option, button) => {
        if (announcement.kind === 'check_in') {
          post(
            ctx,
            '/intake/check-in',
            { answer: option.value === 'yes' ? 'yes' : 'no', session: session(ctx.id) },
            button,
          );
        } else if (
          REST_CHOICES.has(option.value) ||
          option.value === 'rest' ||
          option.value === 'take_a_break'
        ) {
          post(ctx, '/take-a-break', { session: session(ctx.id) }, button);
        } else {
          button.closest('.announcement')?.remove();
        }
      }),
      h('div', { class: 'next-step' }, nextStepBlock(ctx, turn)),
      ctx.errors,
      draftTools(ctx, turn),
    ),
  };
}

/** Edit from the review screen: the question for one field, answered the usual ways. */
function editView(ctx: Ctx, field: FieldKey): View {
  const q = questionFor(field);
  return {
    title: 'Change an answer',
    step: null,
    content: h(
      'div',
      { class: 'content conversation-page' },
      h('h1', {}, 'Change an answer'),
      questionForm(ctx, q),
      ctx.errors,
      actions(routeLink(`/cases/${seg(ctx.id)}/review`, 'Back to the review')),
    ),
  };
}

export const intakePage: Page = async (page) => {
  const id = page.params.id ?? '';
  const ctx: Ctx = { id, page, errors: errorSlot() };
  const edit = page.url.searchParams.get('edit');
  if (isFieldKey(edit)) return editView(ctx, edit);

  const kept = takeTurn(id);
  if (kept) return turnView(ctx, kept);

  // Opening the case: for a draft, the resume turn (UC-CASE-10).
  const opened = await api.get<CaseResponse>(withQuery(path(id), { care_level: getCareLevel() }));
  if (opened.case.status !== 'draft' && opened.next_step.action === 'view_journey') {
    page.navigate(`/cases/${seg(id)}/journey`, { replace: true });
    return null;
  }
  return turnView(ctx, opened);
};
