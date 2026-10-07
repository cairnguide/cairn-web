/**
 * One task: /cases/:id/tasks/:taskId.
 *
 * Shows the guidance in plain words with citations to the issuing authority
 * and when they were last checked, anything already recorded, and the
 * attorney line wherever a step needs one. Unreviewed guidance is labeled.
 *
 * Ways to finish:
 * - UC-10, order death certificates: copies and expected arrival. Their legal
 *   name and date of birth can be added here, only if the office asks
 *   (just in time, never at case creation).
 * - UC-11, notify a bank or other institution: who was told and when. There
 *   is no field for account numbers, on purpose.
 * - Any task: done, in progress, not today, someone else is handling it,
 *   doesn't apply, or remind me later (snooze).
 */
import { api, seg } from '../api.ts';
import type {
  CaseResponse,
  InstitutionType,
  TaskDetail,
  TaskResponse,
  TaskStatus,
} from '../api-types.ts';
import { h, replaceChildren } from '../dom.ts';
import {
  attempt,
  backLink,
  errorSlot,
  formatDate,
  notesList,
  optionButtons,
  page,
} from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  callout,
  newTabLink,
  primaryButton,
  routeLink,
  uid,
} from '../components/controls.ts';
import type { Page } from '../router.ts';
import { statusPill } from './journey.ts';

const STATUS_CHOICES: { value: TaskStatus; label: string }[] = [
  { value: 'done', label: "I've done this" },
  { value: 'in_progress', label: "I'm working on it" },
  { value: 'not_today', label: 'Not today' },
  { value: 'handled_elsewhere', label: 'Someone else is handling this' },
  { value: 'not_applicable', label: "This doesn't apply" },
];

const INSTITUTION_TYPES: { value: InstitutionType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'credit_union', label: 'Credit union' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'insurer', label: 'Insurance company' },
  { value: 'credit_bureau', label: 'Credit bureau' },
  { value: 'other', label: 'Something else' },
];

const METHODS = [
  { value: 'phone', label: 'By phone' },
  { value: 'in_person', label: 'In person' },
  { value: 'mail', label: 'By mail' },
  { value: 'online', label: 'Online' },
];

const today = () => new Date().toISOString().slice(0, 10);

function input(
  id: string,
  label: string,
  attrs: Record<string, string> = {},
  hint?: string,
): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h('input', {
      id,
      class: 'text-input',
      ...attrs,
      'aria-describedby': hint ? `${id}-hint` : null,
    }),
    hint ? h('span', { id: `${id}-hint`, class: 'field-hint' }, hint) : null,
  );
}

function select(
  id: string,
  label: string,
  options: { value: string; label: string }[],
  blank = false,
): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h(
      'select',
      { id, class: 'text-input' },
      blank ? h('option', { value: '' }, 'Choose one') : null,
      options.map((o) => h('option', { value: o.value }, o.label)),
    ),
  );
}

function val(form: ParentNode, id: string): string {
  return form.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value.trim() ?? '';
}

function guidance(task: TaskDetail): HTMLElement {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'option-row' }, statusPill(task.status)),
    h('p', { class: 'lede' }, task.plain_summary),
    task.why_now ? h('p', {}, task.why_now) : null,
    task.due_on ? h('p', { class: 'note' }, `Due ${formatDate(task.due_on)}.`) : null,
    task.snoozed_until
      ? h('p', { class: 'note' }, `Set aside until ${formatDate(task.snoozed_until)}.`)
      : null,
    task.handled_by ? h('p', {}, `Being handled by ${task.handled_by}.`) : null,
    task.content_reviewed_by_counsel
      ? null
      : callout(
          'info',
          'scale',
          h('p', {}, "This guidance is a draft that hasn't been reviewed by an attorney yet."),
        ),
    task.attorney_referral || task.attorney_referral_note || task.attorney_line
      ? callout(
          'info',
          'scale',
          h(
            'p',
            {},
            task.attorney_referral_note ??
              task.attorney_line ??
              'This is a time to talk with an estate attorney.',
          ),
        )
      : null,
    notesList(task.notes),
    task.citations.length > 0
      ? h(
          'section',
          { class: 'sources' },
          h('h2', {}, 'Where this comes from'),
          h(
            'ul',
            { class: 'link-list' },
            task.citations.map((c) =>
              h(
                'li',
                {},
                /^https?:\/\//.test(c.url)
                  ? newTabLink(c.url, c.authority_name, 'text-link')
                  : c.authority_name,
                h(
                  'span',
                  { class: 'fine-print' },
                  ` ${c.jurisdiction}${c.last_verified_on ? `. Last checked ${formatDate(c.last_verified_on)}` : ''}.`,
                ),
              ),
            ),
          ),
        )
      : null,
    task.certificate_order
      ? h(
          'p',
          { class: 'note' },
          `Recorded: ${task.certificate_order.copies_requested} copies ordered on ${formatDate(task.certificate_order.ordered_on)}${task.certificate_order.expected_by ? `, expected by ${formatDate(task.certificate_order.expected_by)}` : ''}.`,
        )
      : null,
    task.institution_notices && task.institution_notices.length > 0
      ? h(
          'ul',
          { class: 'link-list' },
          task.institution_notices.map((n) =>
            h('li', {}, `${n.institution_name} was told on ${formatDate(n.notified_on)}.`),
          ),
        )
      : null,
  );
}

export const taskPage: Page = async ({ params }) => {
  const caseId = params.id ?? '';
  const taskId = params.taskId ?? '';
  const base = `/v1/cases/${seg(caseId)}/tasks/${seg(taskId)}`;
  const { task, notes } = await api.get<TaskResponse>(base);
  const errors = errorSlot();
  const result = h('div', { 'aria-live': 'polite' });
  const journeyHref = `/cases/${seg(caseId)}/journey`;

  const after = (response: TaskResponse) => {
    const next = response.next_action;
    replaceChildren(
      result,
      notesList(response.notes),
      cairnMessage(next ? `Saved. Next up: ${next.title}.` : 'Saved.'),
      actions(
        next
          ? routeLink(
              `/cases/${seg(caseId)}/tasks/${seg(next.id)}`,
              'Open the next step',
              'button-primary',
            )
          : null,
        routeLink(journeyHref, 'Back to the journey'),
      ),
    );
    result.querySelector('a')?.focus();
  };

  // ---- UC-10: certificate order
  let record: HTMLElement | null = null;
  if (task.kind === 'certificate_order') {
    const ids = {
      copies: uid('copies'),
      ordered: uid('ordered'),
      expected: uid('expected'),
      office: uid('office'),
    };
    const save = primaryButton('Save my order', () => {
      const copies = Number(val(form, ids.copies));
      if (!Number.isInteger(copies) || copies < 1 || copies > 100) {
        errors.replaceChildren(
          h(
            'p',
            { class: 'field-error', role: 'alert' },
            'Please enter how many copies, from 1 to 100.',
          ),
        );
        return;
      }
      void attempt(save, errors, async () => {
        after(
          await api.post<TaskResponse>(`${base}/certificate-order`, {
            copies_requested: copies,
            ordered_on: val(form, ids.ordered) || today(),
            expected_by: val(form, ids.expected) || null,
            issuing_office: val(form, ids.office) || null,
          }),
        );
      });
    });
    const form = h(
      'form',
      {
        class: 'stack',
        novalidate: true,
        onSubmit: (e: Event) => {
          e.preventDefault();
          save.click();
        },
      },
      h('h2', {}, 'I ordered them'),
      input(ids.copies, 'How many copies?', {
        type: 'number',
        min: '1',
        max: '100',
        inputmode: 'numeric',
      }),
      input(ids.ordered, 'When did you order them?', {
        type: 'date',
        max: today(),
        value: today(),
      }),
      input(ids.expected, 'When should they arrive? (optional)', { type: 'date' }),
      input(ids.office, 'Which office? (optional)', { type: 'text', maxlength: '120' }),
      actions(save),
    );
    record = h('div', {}, form, identityForm(caseId, errors));
  }

  // ---- UC-11: institution notice
  if (task.kind === 'institution_notice') {
    const ids = { name: uid('inst'), type: uid('type'), on: uid('on'), method: uid('method') };
    const save = primaryButton('I told them. Mark as notified.', () => {
      const name = val(form, ids.name);
      if (!name) {
        errors.replaceChildren(
          h('p', { class: 'field-error', role: 'alert' }, 'Please enter who you told.'),
        );
        return;
      }
      void attempt(save, errors, async () => {
        after(
          await api.post<TaskResponse>(`${base}/institution-notices`, {
            institution_name: name,
            institution_type: val(form, ids.type) || 'bank',
            notified_on: val(form, ids.on) || today(),
            method: val(form, ids.method) || null,
          }),
        );
      });
    });
    const form = h(
      'form',
      {
        class: 'stack',
        novalidate: true,
        onSubmit: (e: Event) => {
          e.preventDefault();
          save.click();
        },
      },
      h('h2', {}, 'I told them'),
      input(
        ids.name,
        'Who did you tell?',
        { type: 'text', maxlength: '120', autocomplete: 'off' },
        'The name of the bank or company. Please leave out account numbers.',
      ),
      select(ids.type, 'What kind of place is it?', INSTITUTION_TYPES),
      input(ids.on, 'When?', { type: 'date', max: today(), value: today() }),
      select(ids.method, 'How? (optional)', METHODS, true),
      actions(save),
    );
    record = form;
  }

  // ---- Any task: status and snooze
  const snoozeId = uid('snooze');
  const snooze = h(
    'details',
    {},
    h('summary', {}, 'Remind me later'),
    h(
      'div',
      { class: 'stack' },
      input(snoozeId, 'Remind me on', { type: 'date', min: today() }),
      h(
        'button',
        {
          type: 'button',
          class: 'button-secondary',
          onClick: (e: Event) => {
            const date = val(snooze, snoozeId);
            if (!date) return;
            void attempt(e.currentTarget as HTMLButtonElement, errors, async () => {
              after(
                await api.patch<TaskResponse>(base, {
                  snoozed_until: new Date(`${date}T09:00:00`).toISOString(),
                }),
              );
            });
          },
        },
        'Set aside until then',
      ),
    ),
  );

  return {
    title: task.title,
    step: null,
    content: page(
      task.title,
      backLink(journeyHref, 'Back to the journey'),
      notesList(notes),
      guidance(task),
      record,
      h('h2', {}, 'Where things stand'),
      optionButtons(
        STATUS_CHOICES.filter((c) => c.value !== task.status),
        (option, button) =>
          void attempt(button, errors, async () => {
            after(await api.patch<TaskResponse>(base, { status: option.value }));
          }),
      ),
      snooze,
      errors,
      result,
      actions(routeLink(journeyHref, 'Back to the journey')),
    ),
  };
};

/** Their legal name and date of birth, only if the certificate office asks (PATCH /deceased). */
function identityForm(caseId: string, errors: HTMLElement): HTMLElement {
  const ids = { first: uid('first'), middle: uid('middle'), last: uid('last'), dob: uid('dob') };
  const saved = h('p', { role: 'status', class: 'note', hidden: true });
  const details = h(
    'details',
    { class: 'identity' },
    h('summary', {}, 'Add their legal name, only if the office asks'),
  );
  const loadAndShow = async () => {
    const opened = await api.get<CaseResponse>(`/v1/cases/${seg(caseId)}`);
    const d = opened.deceased;
    const save = primaryButton('Save', () => {
      void attempt(save, errors, async () => {
        await api.patch<CaseResponse>(`/v1/cases/${seg(caseId)}/deceased`, {
          legal_first_name: val(details, ids.first) || null,
          legal_middle_name: val(details, ids.middle) || null,
          legal_last_name: val(details, ids.last) || null,
          date_of_birth: val(details, ids.dob) || null,
        });
        saved.textContent = 'Saved. It is only used for this paperwork.';
        saved.hidden = false;
      });
    });
    details.append(
      h(
        'div',
        { class: 'stack' },
        h(
          'p',
          { class: 'fine-print' },
          'Some offices need the legal name on the certificate. Cairn only keeps it for this case, and you can delete it with the case.',
        ),
        input(ids.first, 'Legal first name', {
          type: 'text',
          maxlength: '100',
          value: d?.legal_first_name ?? '',
        }),
        input(ids.middle, 'Middle name (optional)', {
          type: 'text',
          maxlength: '100',
          value: d?.legal_middle_name ?? '',
        }),
        input(ids.last, 'Legal last name', {
          type: 'text',
          maxlength: '100',
          value: d?.legal_last_name ?? '',
        }),
        input(ids.dob, 'Date of birth', {
          type: 'date',
          max: today(),
          value: d?.date_of_birth ?? '',
        }),
        actions(save),
        saved,
      ),
    );
  };
  details.addEventListener('toggle', () => {
    if (details.open && details.childElementCount === 1) void attempt(null, errors, loadAndShow);
  });
  return details;
}
