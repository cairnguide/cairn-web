/**
 * The home screen (UC-CASE-25) and where a returning sign-in goes first
 * (UC-REG-18).
 *
 * GET /v1/home says where to go: setup that isn't finished, the resting
 * screen during a break (UC-BRK-08), a draft to pick up, or home. Home greets
 * by the preferred name, shows the session-start AI reminder when due
 * (UC-CASE-23), a check-in the person said yes to, the read-only banner and
 * the subscribe prompt (once a session, UC-SUB-01), and one card per case.
 * The page title never names the person who died.
 */
import { api, withQuery } from '../api.ts';
import type { HomeCaseCard, HomeResponse, Option } from '../api-types.ts';
import { h } from '../dom.ts';
import {
  errorSlot,
  formatDate,
  notesList,
  optionButtons,
  primaryLink,
  widePage,
} from '../components/blocks.ts';
import { cairnMessage, callout } from '../components/controls.ts';
import type { Page } from '../router.ts';
import { startSessionTimeout } from '../session-timeout.ts';
import {
  getCareLevel,
  getWelcome,
  markSubscribePromptSeen,
  setOnboarding,
  takeFlash,
  wasSubscribePromptSeen,
} from '../state.ts';
import { showBreakScreen } from './break.ts';

function caseHref(card: HomeCaseCard, action: string): string {
  const id = encodeURIComponent(card.id);
  if (action === 'delete') return `/cases/${id}/delete`;
  if (action === 'open_journey') return `/cases/${id}/journey`;
  return `/cases/${id}`;
}

function caseCard(card: HomeCaseCard): HTMLElement {
  return h(
    'section',
    { class: 'case-card', 'aria-labelledby': `case-${card.id}` },
    h('h2', { id: `case-${card.id}` }, card.display_name),
    card.status === 'draft' ? h('p', { class: 'status-pill' }, 'Not started yet') : null,
    card.where_left_off ? h('p', {}, card.where_left_off) : null,
    card.next_task ? h('p', { class: 'lede' }, card.next_task) : null,
    card.trial_line ? h('p', { class: 'fine-print' }, card.trial_line) : null,
    card.draft_notice ? h('p', { class: 'fine-print' }, card.draft_notice) : null,
    card.draft_expires_at
      ? h(
          'p',
          { class: 'fine-print' },
          `If it isn't opened, it will be deleted on ${formatDate(card.draft_expires_at)}.`,
        )
      : null,
    h(
      'div',
      { class: 'actions' },
      card.actions.map((action: Option, index) =>
        h(
          'a',
          {
            href: caseHref(card, action.value),
            class: index === 0 ? 'button-primary' : 'text-link',
            'data-route': '',
          },
          action.label,
          action.value === 'delete'
            ? h('span', { class: 'sr-only' }, ` ${card.display_name}`)
            : null,
        ),
      ),
    ),
  );
}

export const homePage: Page = async ({ url, navigate }) => {
  const sessionStart = url.searchParams.get('session_start') === '1';
  startSessionTimeout(getWelcome()?.session);
  const home = await api.get<HomeResponse>(
    withQuery('/v1/home', {
      care_level: getCareLevel(),
      session_start: sessionStart || undefined,
      subscribe_prompt_seen: wasSubscribePromptSeen() || undefined,
    }),
  );

  if (home.route === 'resume_setup') {
    setOnboarding(null);
    navigate('/setup', { replace: true });
    return null;
  }
  if (home.route === 'resting' && home.resting) {
    // The resting screen first. Nothing else asks for attention (UC-BRK-08).
    showBreakScreen(home.resting);
    navigate('/break?from=%2Fhome', { replace: true });
    return null;
  }
  if (home.route === 'resume_draft' && home.cases[0]) {
    navigate(`/cases/${encodeURIComponent(home.cases[0].id)}`, { replace: true });
    return null;
  }

  // A session starts once. A refresh shouldn't count as a new one.
  if (sessionStart) window.history.replaceState(null, '', '/home');
  if (home.subscribe_prompt) markSubscribePromptSeen();
  const errors = errorSlot();
  const flash = takeFlash();
  const prompt = home.subscribe_prompt;

  return {
    title: home.page_title,
    step: null,
    content: widePage(
      home.greeting,
      flash ? h('p', { class: 'note', role: 'status' }, flash) : null,
      home.ai_reminder
        ? callout('info', 'info', h('p', { role: 'status' }, home.ai_reminder))
        : null,
      notesList(home.notes),
      prompt
        ? h(
            'section',
            { class: 'case-card', 'aria-labelledby': 'subscribe-h' },
            h('h2', { id: 'subscribe-h' }, prompt.title),
            h('p', {}, prompt.body),
            optionButtons(
              prompt.options,
              (option, button) => {
                if (option.value === 'subscribe') navigate('/subscription/terms');
                else button.closest('section')?.remove();
              },
              { primaryFirst: true },
            ),
          )
        : null,
      home.cases.length === 0
        ? [
            cairnMessage(home.next_step.prompt),
            h(
              'div',
              { class: 'actions' },
              primaryLink('/cases/start', home.next_step.options?.[0]?.label ?? 'Start a case'),
            ),
          ]
        : [
            h('div', { class: 'case-grid' }, home.cases.map(caseCard)),
            h(
              'div',
              { class: 'actions' },
              h(
                'a',
                { href: '/cases/start', class: 'button-secondary', 'data-route': '' },
                'Start another case',
              ),
              h('a', { href: '/cases', class: 'text-link', 'data-route': '' }, 'See all cases'),
            ),
          ],
      errors,
    ),
  };
};
