/**
 * Starting and managing cases.
 *
 *   /cases/start         After setup, Start a case: how the person is connected
 *                        (POST /v1/onboarding/case-handoff), then what that
 *                        answer leads to (start new, confirm a power of
 *                        attorney's current role, confirm a fiduciary). Then a
 *                        new draft (POST /v1/cases) with that role, so it isn't
 *                        asked twice (UC-CASE-01, UC-CASE-18).
 *   /cases               Every case, drafts included.
 *   /cases/:id/delete    UC-END-13 and UC-CASE-21: delete now or in 7 days, with
 *                        where the one confirmation goes shown first. A case on
 *                        hold can be kept.
 */
import { api, seg } from '../api.ts';
import type {
  CaseDeletionInfo,
  CaseDeletionResponse,
  CaseHandoffResponse,
  CaseListResponse,
  IntakeTurnResponse,
  NextStep,
  Relationship,
  UserRole,
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
  primaryLink,
  widePage,
} from '../components/blocks.ts';
import { actions, cairnMessage, routeLink } from '../components/controls.ts';
import type { Page } from '../router.ts';
import { getHandoffRole, rememberTurn, setFlash, setHandoffRole, takeFlash } from '../state.ts';

/** The relationship question, before the API has been asked anything (cairn-core messages.py). */
const RELATIONSHIP_STEP: NextStep = {
  action: 'choose_relationship',
  prompt: 'So we can use the right words, how are you connected to the person who died?',
  options: [
    { value: 'spouse', label: 'They were my spouse or partner' },
    { value: 'child', label: 'They were my parent' },
    { value: 'sibling', label: 'They were my brother or sister' },
    { value: 'other_family', label: 'Another family relationship' },
    { value: 'power_of_attorney', label: 'I held their power of attorney' },
    { value: 'fiduciary', label: "I'm a professional fiduciary" },
  ],
};

/** Creates the draft and opens it. */
export async function startCase(
  navigate: (path: string) => void,
  role: UserRole | null,
): Promise<void> {
  const turn = await api.post<IntakeTurnResponse>('/v1/cases', role ? { user_role: role } : {});
  setHandoffRole(null);
  rememberTurn(turn.case.id, turn);
  navigate(`/cases/${seg(turn.case.id)}`);
}

export const caseStartPage: Page = ({ navigate }) => {
  const errors = errorSlot();
  const area = h('div', {});
  let handoff: CaseHandoffResponse | null = null;

  const showStep = (step: NextStep, notes: CaseHandoffResponse['notes'] = []) => {
    replaceChildren(
      area,
      notesList(notes),
      cairnMessage(step.prompt),
      optionButtons(step.options, (option, button) => {
        void attempt(button, errors, async () => {
          if (step.action === 'choose_relationship') {
            handoff = await api.post<CaseHandoffResponse>('/v1/onboarding/case-handoff', {
              relationship: option.value as Relationship,
            });
            setHandoffRole(handoff.user_role as UserRole);
            if (handoff.next_step.action === 'start_case') {
              await startCase(navigate, getHandoffRole());
              return;
            }
            showStep(handoff.next_step, handoff.notes);
            return;
          }
          if (step.action === 'confirm_fiduciary' && option.value === 'change') {
            setHandoffRole(null);
            showStep(RELATIONSHIP_STEP);
            return;
          }
          // choose_case_start (start_new_case), confirm_current_role (any answer, a routing hint
          // only), and confirm_fiduciary (confirm) all start the case with the hand-off role.
          await startCase(navigate, getHandoffRole());
        });
      }),
      step.action === 'start_case'
        ? actions(
            h(
              'button',
              {
                type: 'button',
                class: 'button-primary',
                onClick: (e: Event) =>
                  void attempt(e.currentTarget as HTMLButtonElement, errors, () =>
                    startCase(navigate, getHandoffRole()),
                  ),
              },
              'Start',
            ),
          )
        : null,
    );
  };
  showStep(RELATIONSHIP_STEP);

  return {
    title: 'Start a case',
    step: null,
    content: page(
      'Start a case',
      area,
      errors,
      h(
        'p',
        { class: 'fine-print' },
        'You can skip any question later. Nothing is counting down yet.',
      ),
      actions(routeLink('/home', 'Not right now')),
    ),
  };
};

export const caseListPage: Page = async () => {
  const list = await api.get<CaseListResponse>('/v1/cases');
  const flash = takeFlash();
  return {
    title: 'Your cases',
    step: null,
    content: widePage(
      'Your cases',
      backLink('/home', 'Back to home'),
      flash ? h('p', { class: 'note', role: 'status' }, flash) : null,
      list.cases.length === 0
        ? h('p', { class: 'lede' }, 'You have no cases yet.')
        : h(
            'ul',
            { class: 'case-list' },
            list.cases.map((c) => {
              const id = seg(c.id);
              const href = c.status === 'draft' ? `/cases/${id}` : `/cases/${id}/journey`;
              return h(
                'li',
                { class: 'case-card' },
                h('h2', {}, routeLink(href, c.display_name)),
                h(
                  'p',
                  { class: 'fine-print' },
                  `${c.status === 'draft' ? 'Not started yet' : 'Journey started'}. Last activity ${formatDate(c.last_activity_at)}.`,
                ),
                c.draft_notice ? h('p', { class: 'fine-print' }, c.draft_notice) : null,
                c.deletion_scheduled_for
                  ? h(
                      'p',
                      { class: 'note' },
                      `Set to be deleted on ${formatDate(c.deletion_scheduled_for)}.`,
                    )
                  : null,
                h(
                  'div',
                  { class: 'actions' },
                  c.status !== 'draft'
                    ? routeLink(`/cases/${id}/status`, 'Everything in one view')
                    : null,
                  routeLink(`/cases/${id}/delete`, [
                    'Delete',
                    h('span', { class: 'sr-only' }, ` ${c.display_name}`),
                  ]),
                ),
              );
            }),
          ),
      actions(primaryLink('/cases/start', 'Start a case')),
    ),
  };
};

export const caseDeletePage: Page = async ({ params, navigate }) => {
  const id = params.id ?? '';
  const info = await api.get<CaseDeletionInfo>(`/v1/cases/${seg(id)}/deletion`);
  const errors = errorSlot();
  const done = (result: CaseDeletionResponse) => {
    setFlash(result.acknowledgment);
    navigate(result.deleted ? '/home' : '/cases');
  };
  return {
    title: 'Delete this case',
    step: null,
    content: page(
      'Delete this case',
      backLink('/home', 'Back to home'),
      cairnMessage(info.explanation),
      h('p', {}, info.confirmation_destination),
      info.deletion_scheduled_for
        ? h(
            'p',
            { class: 'note' },
            `This case is set to be deleted on ${formatDate(info.deletion_scheduled_for)}.`,
          )
        : null,
      h('p', { class: 'lede' }, info.next_step.prompt),
      optionButtons(info.next_step.options, (option, button) => {
        void attempt(button, errors, async () => {
          if (option.value === 'keep') {
            done(await api.del<CaseDeletionResponse>(`/v1/cases/${seg(id)}/deletion`));
            return;
          }
          const mode = option.value === 'hold' ? 'hold' : 'now';
          done(await api.post<CaseDeletionResponse>(`/v1/cases/${seg(id)}/deletion`, { mode }));
        });
      }),
      errors,
    ),
  };
};
