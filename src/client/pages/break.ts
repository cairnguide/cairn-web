/**
 * Take a break (cairn-core Take a break spec 3.2.0, screens S-01 to S-07).
 *
 * One select from the header, no confirmation. The API decides which screen
 * fits where the person is:
 *   S-01  before sign-in: nothing is saved or sent (UC-BRK-02)
 *   S-02  during setup: progress is already saved (UC-BRK-03)
 *   S-02b after setup with no case
 *   S-03  in a draft case (the case page saves where they left off first)
 *   S-04  on a journey: the four rest choices (UC-BRK-05)
 *   S-05  resting, right after choosing
 *   S-06  resting, shown first whenever Cairn is opened (UC-BRK-08)
 *   S-07  back from a break, with one clear next action (UC-BRK-10)
 *
 * Break screens never show anything from a case except the end date
 * (UC-BRK-12), never ask the person to explain, and never change a
 * subscription. After sign-in they show the quiet 988 line (BRK-D-04).
 */
import { api, withQuery } from '../api.ts';
import type { BreakResponse, Option } from '../api-types.ts';
import { h, replaceChildren } from '../dom.ts';
import { attempt, errorSlot, optionButtons, paragraphs } from '../components/blocks.ts';
import { actions, cairnMessage, routeLink, textButton } from '../components/controls.ts';
import type { Page, PageContext, View } from '../router.ts';
import { getCareLevel, getSession, signOut } from '../state.ts';

/**
 * Only same-site plain paths (with a simple query) are used to go back. A
 * delete confirmation is never returned to: a break there cancels the
 * deletion (UC-BRK-01 AC10), so the person goes back to the page before it.
 */
function safeFrom(url: URL): string {
  const from = url.searchParams.get('from') ?? '';
  const [path = '', query, extra] = from.split('?');
  if (extra !== undefined || !/^\/[A-Za-z0-9/_-]*$/.test(path)) return '';
  if (query !== undefined && !/^[A-Za-z0-9=&_-]*$/.test(query)) return '';
  if (from.startsWith('//') || from.startsWith('/break')) return '';
  return from.endsWith('/delete') ? from.slice(0, -'/delete'.length) : from;
}

/** Break screens that show Sign out with their resume action (Take a break spec, screens). */
const WITH_SIGN_OUT = new Set(['S-02', 'S-02b', 'S-03', 'S-05']);

let shown: BreakResponse | null = null;

/** Lets another page (a case conversation, the home screen) hand over a break screen it already has. */
export function showBreakScreen(screen: BreakResponse): void {
  shown = screen;
}

function breakView(screen: BreakResponse, ctx: PageContext, from: string): View {
  const errors = errorSlot();
  const signedIn = getSession().authenticated;
  const home = signedIn ? '/home' : '/';
  const level = getCareLevel();

  const show = (next: BreakResponse) => {
    shown = next;
    ctx.navigate(withQuery('/break', { from: from || undefined, s: next.screen }), {
      replace: true,
    });
  };

  // S-04 lists the rest choices with keep_going last. S-06's Change shows the choices again.
  let choosing = screen.screen === 'S-04';
  const rest = (choice: Option, button: HTMLButtonElement) =>
    void attempt(button, errors, async () => {
      const onBreak = screen.state?.on_break === true;
      const next = onBreak
        ? await api.put<BreakResponse>('/v1/me/break', { choice: choice.value, care_level: level })
        : await api.post<BreakResponse>('/v1/me/break', {
            choice: choice.value,
            care_level: level,
          });
      show(next);
    });

  const select = (option: Option, button: HTMLButtonElement) => {
    switch (option.value) {
      case 'go_back':
      case 'keep_going':
        ctx.navigate(from || home);
        return;
      case 'resume':
        ctx.navigate(screen.screen === 'S-02' ? '/setup' : from || home);
        return;
      case 'keep_resting':
        errors.replaceChildren(
          h(
            'p',
            { class: 'note', role: 'status' },
            'Okay. Rest as long as you need. You can close Cairn.',
          ),
        );
        return;
      case 'back':
        void attempt(button, errors, async () => {
          show(await api.del<BreakResponse>(withQuery('/v1/me/break', { care_level: level })));
        });
        return;
      case 'change':
        choosing = true;
        renderChoices();
        return;
      case 'continue':
        ctx.navigate(from && !from.startsWith('/setup') ? from : '/home');
        return;
      default:
        if (['today', 'three_days', 'week', 'until_back'].includes(option.value))
          rest(option, button);
    }
  };

  const choicesArea = h('div', {});
  const renderChoices = () => {
    if (!choosing) {
      replaceChildren(
        choicesArea,
        optionButtons(screen.next_step.options, select, { primaryFirst: true }),
      );
      return;
    }
    const options =
      screen.choices && screen.choices.length > 0 ? screen.choices : screen.next_step.options;
    replaceChildren(
      choicesArea,
      h(
        'fieldset',
        { class: 'choices' },
        h(
          'legend',
          {},
          screen.screen === 'S-04' ? screen.next_step.prompt : 'How long would you like to rest?',
        ),
        optionButtons(
          (options ?? []).map((o) =>
            screen.current_choice === o.value ? { ...o, label: `${o.label} (now)` } : o,
          ),
          select,
        ),
      ),
      screen.screen === 'S-04'
        ? null
        : optionButtons(
            (screen.next_step.options ?? []).filter((o) => o.value !== 'change'),
            select,
          ),
    );
  };
  renderChoices();

  return {
    title: 'Take a break',
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, screen.screen === 'S-07' ? 'Welcome back' : 'Take a break'),
      cairnMessage(screen.text),
      paragraphs((screen.body ?? []).filter((line) => line !== screen.text)),
      screen.state?.end_date ? h('p', { class: 'lede' }, `Until ${screen.state.end_date}.`) : null,
      choicesArea,
      errors,
      screen.quiet_988_line ? h('p', { class: 'fine-print' }, screen.quiet_988_line) : null,
      actions(
        routeLink('/support', screen.support_resources_label),
        signedIn && WITH_SIGN_OUT.has(screen.screen)
          ? textButton('Sign out', () => void signOut())
          : null,
      ),
    ),
    // Every break screen but Welcome back replaces Take a break with its own actions.
    hideTakeABreak: screen.screen !== 'S-07',
  };
}

export const breakPage: Page = async (ctx) => {
  const from = safeFrom(ctx.url);
  let screen = shown;
  shown = null;
  if (!screen) {
    screen = getSession().authenticated
      ? await api.get<BreakResponse>(withQuery('/v1/me/break', { care_level: getCareLevel() }))
      : await api.get<BreakResponse>('/v1/break');
  }
  return breakView(screen, ctx, from);
};
