/**
 * A small history-API router.
 *
 * Each route renders one page into the shell. After every page change the
 * router sets the document title, moves focus to the page's <h1> so screen
 * reader users hear where they are, and scrolls to the top.
 */
import { ApiError } from './api.ts';
import type { Child } from './dom.ts';
import { h, replaceChildren } from './dom.ts';
import { autoReadAloud, errorBanner } from './components/controls.ts';
import { shell } from './components/layout.ts';
import type { SetupStepIndex } from './onboarding.ts';
import { isProtectedPath } from '../shared/paths.ts';
import { stopSpeaking } from './speech.ts';
import { getSession, signOut } from './state.ts';

export interface View {
  title: string;
  content: Child;
  step?: SetupStepIndex | null;
  /**
   * What the header's Take a break does on this page. By default it opens
   * /break, the break screen for where the person is (UC-BRK-01). Case
   * conversations pass their own, which saves where they left off first.
   */
  onTakeABreak?: () => void;
}

export interface PageContext {
  url: URL;
  /** Values for the :name parts of the route path. */
  params: Record<string, string>;
  navigate: (path: string, options?: { replace?: boolean }) => void;
}

export type Page = (ctx: PageContext) => Promise<View | null> | View | null;

export interface Route {
  path: string;
  page: () => Promise<Page>;
}

let routes: Route[] = [];
let root: HTMLElement;
let notFound: () => Promise<Page>;
let renderToken = 0;
/** The first page load leaves focus alone so Tab starts at the skip link. */
let firstRender = true;

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  void render();
}

/** Route path parameters are opaque ids from the API: letters, digits, dashes, underscores. */
const PARAM = /^[A-Za-z0-9_-]{1,64}$/;

export function matchRoute(
  table: Route[],
  pathname: string,
): { route: Route; params: Record<string, string> } | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const parts = normalized.split('/');
  for (const route of table) {
    const pattern = route.path.split('/');
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length && ok; i += 1) {
      const want = pattern[i] ?? '';
      const got = parts[i] ?? '';
      if (want.startsWith(':')) {
        if (PARAM.test(got)) params[want.slice(1)] = got;
        else ok = false;
      } else if (want !== got) {
        ok = false;
      }
    }
    if (ok) return { route, params };
  }
  return undefined;
}

/** UC-REG-19. A request after 5 quiet minutes is refused. Sign out fully, then say why. */
function isTimedOut(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 401 && error.problem.code === 'session_timed_out'
  );
}

function errorView(error: unknown): View {
  const message =
    error instanceof ApiError
      ? error.problem.detail
      : 'Something went wrong on our side. Your information was not changed.';
  return {
    title: 'Something went wrong',
    step: null,
    content: h(
      'div',
      { class: 'content' },
      h('h1', { tabindex: '-1' }, 'Something went wrong'),
      errorBanner(message),
      h('p', {}, h('a', { href: window.location.pathname, class: 'text-link' }, 'Try again')),
    ),
  };
}

export async function render(): Promise<void> {
  const token = ++renderToken;
  const url = new URL(window.location.href);

  // The Worker refuses protected pages without a session. This covers
  // in-app navigation, which doesn't go back to the Worker.
  if (isProtectedPath(url.pathname) && !getSession().authenticated) {
    window.location.assign(`/auth/login?returnTo=${encodeURIComponent(url.pathname)}`);
    return;
  }

  const match = matchRoute(routes, url.pathname);
  let view: View | null;
  try {
    const page = await (match ? match.route.page() : notFound());
    view = await page({ url, params: match?.params ?? {}, navigate });
  } catch (error) {
    if (isTimedOut(error)) {
      void signOut('timeout');
      return;
    }
    if (error instanceof ApiError && error.status === 401) {
      window.location.assign(`/auth/login?returnTo=${encodeURIComponent(url.pathname)}`);
      return;
    }
    view = errorView(error);
  }
  // A newer navigation started while this one was loading.
  if (token !== renderToken || view === null) return;

  document.title = `${view.title} · Cairn`;
  stopSpeaking();
  replaceChildren(
    root,
    shell({
      step: view.step ?? null,
      content: view.content,
      ...(view.onTakeABreak ? { onTakeABreak: view.onTakeABreak } : {}),
    }),
  );
  window.scrollTo(0, 0);
  const heading = root.querySelector<HTMLElement>('main h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    if (!firstRender) heading.focus({ preventScroll: true });
  }
  firstRender = false;
  autoReadAloud(root);
}

export function startRouter(
  target: HTMLElement,
  table: Route[],
  fallback: () => Promise<Page>,
): void {
  root = target;
  routes = table;
  window.addEventListener('cairn:api-error', (event) => {
    if (isTimedOut((event as CustomEvent<unknown>).detail)) void signOut('timeout');
  });
  notFound = fallback;
  window.addEventListener('popstate', () => void render());
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = (event.target as Element | null)?.closest('a[data-route]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = link.getAttribute('href');
    if (!href?.startsWith('/') || href.startsWith('//')) return;
    event.preventDefault();
    navigate(href);
  });
  void render();
}
