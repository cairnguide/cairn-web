/**
 * From review to the journey, and the journey itself.
 *
 *   /cases/:id/review         UC-CASE-11: what you told me, and what we can figure out later. Edit on each line.
 *   /cases/:id/preview        UC-CASE-12: the journey that fits, by week. How Cairn keeps in touch is
 *                             confirmed first (UC-CASE-19), then the pre-button notice, Start journey, Not yet.
 *   /cases/:id/keep-in-touch  UC-CASE-19: reads back the account's choices, then due date lead time and
 *                             inactivity notices, one per screen. Skippable.
 *   /cases/:id/start          UC-CASE-13: what feels doable right now? Cairn never starts a task the person didn't choose.
 *   /cases/:id/journey        UC-9 and UC-12: one next action in front, the weeks below. While resting, a calm
 *                             check-in and no task list.
 *   /cases/:id/status         UC-13: everything done, in progress, and next, by area.
 *
 * Status is always written in words next to an icon, never color alone.
 */
import { api, seg, withQuery } from '../api.ts';
import type {
  CaseStatusResponse,
  CategoryStatus,
  FirstTaskResponse,
  JourneyPreviewResponse,
  JourneyResponse,
  KeepInTouchResponse,
  NotificationSettingsResponse,
  PreviewTask,
  ReviewLine,
  ReviewResponse,
  StartJourneyResponse,
  TaskSummary,
} from '../api-types.ts';
import { h, replaceChildren, svgIcon, type Child } from '../dom.ts';
import { icons, type IconName } from '../icons.ts';
import {
  attempt,
  backLink,
  errorSlot,
  formatDate,
  notesList,
  optionButtons,
  page,
  readThisToMe,
  supportList,
  widePage,
} from '../components/blocks.ts';
import { actions, cairnMessage, primaryButton, routeLink } from '../components/controls.ts';
import type { Page } from '../router.ts';
import { caseBreak } from './intake.ts';
import { getCareLevel, getIntakeSession, takeFlash } from '../state.ts';

function casePath(id: string, rest = ''): string {
  return `/v1/cases/${seg(id)}${rest}`;
}

function pageHref(id: string, rest = ''): string {
  return `/cases/${seg(id)}${rest}`;
}

// ------------------------------------------------------------------ status labels

const STATUS: Record<string, { label: string; icon: IconName; tone: string }> = {
  done: { label: 'Done', icon: 'stepDone', tone: 'done' },
  handled_elsewhere: { label: 'Someone else is handling this', icon: 'stepDone', tone: 'done' },
  in_progress: { label: 'In progress', icon: 'partial', tone: 'progress' },
  check_on_this: { label: 'Check on this', icon: 'info', tone: 'progress' },
  not_today: { label: 'Not today', icon: 'stepTodo', tone: 'todo' },
  not_started: { label: "When you're ready", icon: 'stepTodo', tone: 'todo' },
  skipped: { label: 'Not needed', icon: 'minus', tone: 'muted' },
  not_applicable: { label: 'Not needed', icon: 'minus', tone: 'muted' },
};

export function statusPill(status: string, label?: string): HTMLElement {
  const s = STATUS[status] ?? { label: status, icon: 'stepTodo' as IconName, tone: 'todo' };
  return h(
    'span',
    { class: `status-pill status-${s.tone}` },
    svgIcon(icons[s.icon], 16),
    label ?? s.label,
  );
}

function taskLink(caseId: string, task: TaskSummary): HTMLElement {
  return h(
    'li',
    { class: 'task-row' },
    routeLink(pageHref(caseId, `/tasks/${seg(task.id)}`), task.title),
    ' ',
    statusPill(task.status),
    task.attorney_referral
      ? h(
          'span',
          { class: 'status-pill status-legal' },
          svgIcon(icons.scale, 16),
          'Talk to an attorney',
        )
      : null,
    task.probably_not_applicable
      ? h('span', { class: 'fine-print' }, "Probably doesn't apply. Open it if it does.")
      : null,
    task.due_on ? h('span', { class: 'fine-print' }, `Due ${formatDate(task.due_on)}`) : null,
    task.waypoint ? h('span', { class: 'fine-print' }, task.waypoint) : null,
  );
}

// ------------------------------------------------------------------ review (UC-CASE-11)

function reviewLines(caseId: string, lines: ReviewLine[]): HTMLElement {
  return h(
    'dl',
    { class: 'summary' },
    lines.map((line) =>
      h(
        'div',
        { class: 'summary-row' },
        h('dt', {}, line.label),
        h(
          'dd',
          {},
          h('strong', {}, line.answer),
          routeLink(`${pageHref(caseId)}?edit=${line.field}`, [
            line.edit.options?.[0]?.label ?? 'Edit',
            h('span', { class: 'sr-only' }, ` ${line.label}`),
          ]),
        ),
      ),
    ),
  );
}

export const reviewPage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const review = await api.get<ReviewResponse>(casePath(id, '/review'));
  return {
    title: 'Review what you shared',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: page(
      'Review what you shared',
      readThisToMe(review.read_aloud),
      cairnMessage(review.acknowledgment),
      review.told_me.length > 0
        ? [h('h2', {}, review.told_me_heading), reviewLines(id, review.told_me)]
        : null,
      review.later.length > 0
        ? [h('h2', {}, review.later_heading), reviewLines(id, review.later)]
        : null,
      h('p', { class: 'lede' }, review.next_step.prompt),
      optionButtons(
        review.next_step.options,
        (option) => {
          if (option.value === 'yes')
            navigate(pageHref(id, review.case.status === 'draft' ? '/preview' : '/journey'));
          else document.querySelector<HTMLElement>('.summary a')?.focus();
        },
        { primaryFirst: true },
      ),
    ),
  };
};

// ------------------------------------------------------------------ preview (UC-CASE-12)

function previewTask(task: PreviewTask): HTMLElement {
  return h(
    'li',
    { class: 'task-row' },
    h('strong', {}, task.title),
    ' ',
    statusPill(task.status, task.status_label),
    h('p', { class: 'fine-print' }, task.plain_summary),
    task.waypoint ? h('p', { class: 'fine-print' }, task.waypoint) : null,
    task.attorney_line ? h('p', { class: 'fine-print' }, task.attorney_line) : null,
    notesList(task.notes),
  );
}

export const previewPage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const preview = await api.get<JourneyPreviewResponse>(
    withQuery(casePath(id, '/journey/preview'), { care_level: getCareLevel() }),
  );
  if (preview.case.status !== 'draft') {
    navigate(pageHref(id, '/journey'), { replace: true });
    return null;
  }
  const errors = errorSlot();
  const step = preview.next_step;
  const notice = preview.pre_button_notice;

  const buttons: Child = (() => {
    switch (step.action) {
      case 'confirm_keep_in_touch':
        return actions(
          routeLink(
            pageHref(id, '/keep-in-touch'),
            step.options?.[0]?.label ?? 'Confirm how I keep in touch',
            'button-primary',
          ),
        );
      case 'start_journey':
        return optionButtons(
          step.options,
          (option, button) => {
            void attempt(button, errors, async () => {
              if (option.value === 'not_yet') {
                const result = await api.post<FirstTaskResponse>(casePath(id, '/journey/not-yet'));
                replaceChildren(
                  errors,
                  cairnMessage(result.next_step.prompt),
                  actions(routeLink('/home', 'Go to your home screen')),
                );
                return;
              }
              if (!notice) return;
              const started = await api.post<StartJourneyResponse>(casePath(id, '/journey/start'), {
                pre_button_notice_version: notice.version,
                session: getIntakeSession(id),
              });
              startedTurns.set(id, started);
              navigate(pageHref(id, '/start'));
            });
          },
          { primaryFirst: true },
        );
      case 'choose_subscription':
        return optionButtons(
          step.options,
          (option) => {
            navigate(option.value === 'subscribe' ? '/subscription/terms' : '/home');
          },
          { primaryFirst: true },
        );
      case 'death_not_yet':
        return optionButtons(step.options, (option, button) => {
          void attempt(button, errors, async () => {
            await api.post(casePath(id, '/intake/death-not-yet'), {
              choice: option.value,
              session: getIntakeSession(id),
            });
            navigate(pageHref(id));
          });
        });
      default:
        return optionButtons(step.options, () => {
          navigate(pageHref(id));
        });
    }
  })();

  return {
    title: 'The journey that fits',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: widePage(
      'The journey that fits',
      readThisToMe(preview.read_aloud),
      cairnMessage(preview.explanation),
      notesList(preview.notes),
      supportList(preview.support),
      preview.weeks.map((week) =>
        h(
          'section',
          { class: 'week' },
          h('h2', {}, week.label),
          h('ul', { class: 'task-list' }, week.tasks.map(previewTask)),
        ),
      ),
      notice
        ? h('div', { class: 'reading-card' }, h('p', { class: 'reading-text' }, notice.text))
        : null,
      step.action !== 'start_journey' ? h('p', { class: 'lede' }, step.prompt) : null,
      buttons,
      errors,
      actions(
        routeLink(pageHref(id, '/review'), 'Review what you shared'),
        routeLink('/home', 'Go to your home screen'),
      ),
    ),
  };
};

// ------------------------------------------------------------------ keep in touch (UC-CASE-19)

export const keepInTouchPage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const kit = await api.get<KeepInTouchResponse>(casePath(id, '/keep-in-touch'));
  const errors = errorSlot();
  const answers: Record<string, string> = {};
  const area = h('div', {});

  const finish = (body: Record<string, unknown>, button: HTMLButtonElement | null) =>
    void attempt(button, errors, async () => {
      const saved = await api.put<NotificationSettingsResponse>(
        casePath(id, '/keep-in-touch'),
        body,
      );
      navigate(
        saved.next_step.action === 'preview_journey'
          ? pageHref(id, '/preview')
          : pageHref(id, '/journey'),
      );
    });

  const ask = (index: number) => {
    const question = kit.questions[index];
    if (!question) {
      finish(answers, null);
      return;
    }
    replaceChildren(
      area,
      h('p', { class: 'lede' }, question.prompt),
      optionButtons(question.options, (option) => {
        answers[question.id] = option.value;
        ask(index + 1);
      }),
    );
    area.querySelector('button')?.focus();
  };
  if (kit.questions.length > 0) ask(0);
  else {
    const ok = primaryButton(kit.next_step.options?.[0]?.label ?? 'Continue', () => {
      finish({ skip: true }, ok);
    });
    replaceChildren(area, h('p', { class: 'lede' }, kit.next_step.prompt), actions(ok));
  }

  return {
    title: 'How I keep in touch',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: page(
      'How I keep in touch',
      readThisToMe(kit.read_aloud),
      cairnMessage(kit.opening),
      h(
        'p',
        {},
        kit.preferences.readback,
        ' ',
        routeLink('/settings/notifications', kit.change_link.label),
      ),
      area,
      errors,
      actions(
        h(
          'button',
          {
            type: 'button',
            class: 'text-link',
            onClick: (e: Event) => {
              finish({ skip: true }, e.currentTarget as HTMLButtonElement);
            },
          },
          'Skip for now',
        ),
      ),
    ),
  };
};

// ------------------------------------------------------------------ first task (UC-CASE-13)

const startedTurns = new Map<string, StartJourneyResponse>();

export const firstTaskPage: Page = ({ params, navigate }) => {
  const id = params.id ?? '';
  const started = startedTurns.get(id);
  if (!started) {
    navigate(pageHref(id, '/journey'), { replace: true });
    return null;
  }
  const errors = errorSlot();
  return {
    title: 'Your journey has started',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: page(
      'Your journey has started',
      readThisToMe(started.read_aloud),
      cairnMessage(started.confirmation),
      started.recommended.length > 0
        ? h(
            'ul',
            { class: 'task-list' },
            started.recommended.map((r) =>
              h(
                'li',
                { class: 'task-row' },
                h('strong', {}, r.task.title),
                r.why_now ? h('p', { class: 'fine-print' }, r.why_now) : null,
              ),
            ),
          )
        : null,
      h('p', { class: 'lede' }, started.next_step.prompt),
      optionButtons(started.next_step.options, (option, button) => {
        void attempt(button, errors, async () => {
          const result = await api.post<FirstTaskResponse>(casePath(id, '/journey/first-task'), {
            choice: option.value,
          });
          startedTurns.delete(id);
          if (result.task) navigate(pageHref(id, `/tasks/${seg(result.task.id)}`));
          else {
            replaceChildren(
              errors,
              result.acknowledgment ? cairnMessage(result.acknowledgment) : '',
              h('p', { class: 'lede' }, result.next_step.prompt),
              actions(
                routeLink(pageHref(id, '/journey'), 'See the journey', 'button-primary'),
                routeLink('/home', 'Go to your home screen'),
              ),
            );
          }
        });
      }),
      errors,
    ),
  };
};

// ------------------------------------------------------------------ journey (UC-9, UC-12)

export const journeyPage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const journey = await api.get<JourneyResponse>(
    withQuery(casePath(id, '/journey'), { care_level: getCareLevel() }),
  );
  if (journey.mode === 'not_started') {
    navigate(pageHref(id, '/preview'), { replace: true });
    return null;
  }
  const errors = errorSlot();
  const flash = takeFlash();

  if (journey.mode === 'paused') {
    return {
      title: 'Resting',
      step: null,
      onTakeABreak: caseBreak(id, navigate),
      content: page(
        'Resting',
        notesList(journey.notes),
        journey.check_in
          ? cairnMessage(journey.check_in.message)
          : cairnMessage(journey.next_step.prompt),
        journey.paused_until
          ? h('p', {}, `The tasks are set aside until ${formatDate(journey.paused_until)}.`)
          : null,
        optionButtons(
          journey.check_in?.options,
          (option, button) => {
            if (option.value !== 'resume') {
              navigate('/home');
              return;
            }
            void attempt(button, errors, async () => {
              await api.post<JourneyResponse>(casePath(id, '/journey/resume'));
              navigate(pageHref(id, '/journey'), { replace: true });
            });
          },
          { primaryFirst: true },
        ),
        supportList(journey.support),
        errors,
      ),
    };
  }

  const next = journey.next_action;
  return {
    title: 'Your journey',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: widePage(
      'Your journey',
      flash ? h('p', { class: 'note', role: 'status' }, flash) : null,
      notesList(journey.notes),
      next
        ? h(
            'section',
            { class: 'case-card next-up', 'aria-labelledby': 'next-h' },
            h('h2', { id: 'next-h' }, 'Next up'),
            h('p', { class: 'lede' }, next.title),
            h('p', {}, next.plain_summary),
            next.why_now ? h('p', { class: 'fine-print' }, next.why_now) : null,
            actions(
              routeLink(pageHref(id, `/tasks/${seg(next.id)}`), 'Open this step', 'button-primary'),
            ),
          )
        : cairnMessage(journey.next_step.prompt),
      journey.weeks.map((week) =>
        h(
          'section',
          { class: 'week', 'aria-labelledby': `week-${week.week}` },
          h(
            'h2',
            { id: `week-${week.week}` },
            `Week ${week.week}`,
            week.week === journey.current_week ? ' (this week)' : '',
          ),
          h('p', { class: 'fine-print' }, `${week.done} of ${week.total} done`),
          h(
            'ul',
            { class: 'task-list' },
            week.tasks.map((t) => taskLink(id, t)),
          ),
        ),
      ),
      supportList(journey.support),
      actions(
        routeLink(pageHref(id, '/status'), 'Everything in one view'),
        routeLink(pageHref(id, '/review'), 'What you shared'),
        routeLink('/home', 'Home'),
      ),
      errors,
    ),
  };
};

// ------------------------------------------------------------------ status (UC-13)

export const statusPage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const status = await api.get<CaseStatusResponse>(
    withQuery(casePath(id, '/status'), { care_level: getCareLevel() }),
  );
  const counts = status.counts;
  const all = (c: CategoryStatus) => [...c.in_progress, ...c.up_next, ...c.done, ...c.set_aside];
  return {
    title: 'Everything in one view',
    step: null,
    onTakeABreak: caseBreak(id, navigate),
    content: widePage(
      'Everything in one view',
      backLink(pageHref(id, '/journey'), 'Back to the journey'),
      h('p', { class: 'lede' }, `For ${status.deceased_name}. As of ${formatDate(status.as_of)}.`),
      status.journey_paused
        ? h(
            'p',
            { class: 'note' },
            `Resting${status.paused_until ? ` until ${formatDate(status.paused_until)}` : ''}.`,
          )
        : null,
      h(
        'ul',
        { class: 'count-grid' },
        h('li', {}, statusPill('done'), h('strong', {}, String(counts.done))),
        h('li', {}, statusPill('in_progress'), h('strong', {}, String(counts.in_progress))),
        h(
          'li',
          {},
          statusPill('not_started', 'Not started'),
          h('strong', {}, String(counts.not_started)),
        ),
        h('li', {}, statusPill('skipped', 'Set aside'), h('strong', {}, String(counts.set_aside))),
      ),
      status.next_action
        ? h(
            'p',
            { class: 'note' },
            h('strong', {}, 'Next up: '),
            routeLink(
              pageHref(id, `/tasks/${seg(status.next_action.id)}`),
              status.next_action.title,
            ),
          )
        : null,
      h(
        'table',
        { class: 'status-table' },
        h('caption', {}, 'All steps by area'),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, 'Area'),
            h('th', { scope: 'col' }, 'Step'),
            h('th', { scope: 'col' }, 'Status'),
            h('th', { scope: 'col' }, 'Done on'),
          ),
        ),
        h(
          'tbody',
          {},
          status.categories.flatMap((cat) =>
            all(cat).map((task) =>
              h(
                'tr',
                {},
                h('td', {}, cat.label),
                h(
                  'th',
                  { scope: 'row' },
                  routeLink(pageHref(id, `/tasks/${seg(task.id)}`), task.title),
                ),
                h('td', {}, statusPill(task.status)),
                h('td', {}, task.completed_at ? formatDate(task.completed_at) : ''),
              ),
            ),
          ),
        ),
      ),
      status.certificate_order
        ? h(
            'p',
            {},
            `Death certificates: ${status.certificate_order.copies_requested} copies ordered on ${formatDate(status.certificate_order.ordered_on)}${status.certificate_order.expected_by ? `, expected by ${formatDate(status.certificate_order.expected_by)}` : ''}.`,
          )
        : null,
      status.institution_notices.length > 0
        ? [
            h('h2', {}, 'Who has been told'),
            h(
              'ul',
              { class: 'link-list' },
              status.institution_notices.map((n) =>
                h('li', {}, `${n.institution_name}, on ${formatDate(n.notified_on)}`),
              ),
            ),
          ]
        : null,
    ),
  };
};
