/**
 * Building blocks shared by the signed-in screens: notes from the API,
 * option buttons, Support resources, Read this to me, and request handling
 * that shows the API's plain-language error where the person will see it.
 *
 * Everything the API says is shown as text (never HTML), and every option is
 * a real button with a visible label, at least 44px tall (WCAG 2.2 AA).
 */
import { ApiError } from '../api.ts';
import type { Announcement, Note, Option, ReadAloud, SupportResource } from '../api-types.ts';
import { assertSafeUrl, h, svgIcon, type Child } from '../dom.ts';
import { icons, type IconName } from '../icons.ts';
import { canListen, speak } from '../speech.ts';
import { busy, cairnMessage, callout, errorBanner, newTabLink } from './controls.ts';

const NOTE_ICONS: Record<Note['kind'], IconName> = {
  acknowledgment: 'heart',
  info: 'info',
  legal: 'scale',
  crisis: 'phone',
  reminder: 'calendar',
  account: 'info',
};

/** Links are only shown for http(s) URLs. */
function isWebUrl(url: string): boolean {
  try {
    assertSafeUrl(url);
    return /^https?:\/\//i.test(url);
  } catch {
    return false;
  }
}

/** One note from the API, with its citations and any attorney line next to the text. */
export function noteBlock(note: Note): HTMLElement {
  const sources = (note.source_urls ?? []).filter(isWebUrl);
  const kind = note.kind === 'crisis' ? 'crisis' : 'info';
  return callout(
    kind,
    NOTE_ICONS[note.kind],
    h('p', { role: note.kind === 'account' ? 'status' : null }, note.text),
    note.attorney_line ? h('p', { class: 'fine-print' }, note.attorney_line) : null,
    sources.length > 0
      ? h(
          'p',
          { class: 'fine-print' },
          'Sources: ',
          sources.map((url, index) => [
            index > 0 ? ', ' : null,
            newTabLink(url, new URL(url).hostname, 'text-link'),
          ]),
        )
      : null,
    note.legal_review_required
      ? h('p', { class: 'fine-print' }, 'This wording is waiting on legal review.')
      : null,
  );
}

export function notesList(notes: Note[] | null | undefined): HTMLElement | null {
  if (!notes || notes.length === 0) return null;
  return h('div', { class: 'notes' }, notes.map(noteBlock));
}

/** Support resources from the API (988, the Veterans Crisis Line, and others). */
export function supportList(resources: SupportResource[] | null | undefined): HTMLElement | null {
  if (!resources || resources.length === 0) return null;
  return h(
    'ul',
    { class: 'support-list' },
    resources.map((r) =>
      h(
        'li',
        {},
        svgIcon(icons.phone, 22),
        h(
          'span',
          {},
          r.text,
          ' ',
          r.url.startsWith('tel:') || r.url.startsWith('sms:')
            ? h('a', { href: r.url, class: 'text-link' }, r.url.replace(/^(tel|sms):/, ''))
            : isWebUrl(r.url)
              ? newTabLink(r.url, new URL(r.url).hostname, 'text-link')
              : null,
        ),
      ),
    ),
  );
}

/** "Read this to me" for a whole screen. Hidden when the device can't read aloud on its own. */
export function readThisToMe(readAloud: ReadAloud | null | undefined): HTMLElement | null {
  if (!readAloud?.text || !canListen()) return null;
  const text = readAloud.text;
  return h(
    'button',
    { type: 'button', class: 'control control-small', onClick: () => speak(text) },
    svgIcon(icons.speaker, 18),
    h('span', {}, readAloud.label),
  );
}

/** Screen reader announcements from a case turn (aria-live polite), with their options. */
export function announcementsBlock(
  items: Announcement[] | null | undefined,
  onOption: (announcement: Announcement, option: Option, button: HTMLButtonElement) => void,
): HTMLElement | null {
  if (!items || items.length === 0) return null;
  return h(
    'div',
    { class: 'announcements', 'aria-live': 'polite' },
    items.map((a) =>
      h(
        'div',
        { class: 'announcement' },
        h('p', {}, a.text),
        a.options && a.options.length > 0
          ? h(
              'div',
              { class: 'option-row' },
              a.options.map((o) => {
                const button = h('button', { type: 'button', class: 'button-secondary' }, o.label);
                button.addEventListener('click', () => {
                  onOption(a, o, button);
                });
                return button;
              }),
            )
          : null,
      ),
    ),
  );
}

export interface OptionButtonsSettings {
  /** The first option is the main action. */
  primaryFirst?: boolean;
  /** A group label for screen readers. */
  label?: string;
}

/**
 * One large button per option. Unavailable options stay visible, disabled,
 * with their reason, so nothing disappears without explanation.
 */
export function optionButtons(
  options: Option[] | null | undefined,
  onSelect: (option: Option, button: HTMLButtonElement) => void,
  settings: OptionButtonsSettings = {},
): HTMLElement | null {
  if (!options || options.length === 0) return null;
  return h(
    'div',
    { class: 'option-list', role: 'group', 'aria-label': settings.label ?? null },
    options.map((option, index) => {
      const available = option.available !== false;
      const button = h(
        'button',
        {
          type: 'button',
          class: settings.primaryFirst && index === 0 ? 'button-primary' : 'option-button',
          disabled: !available,
          'aria-describedby': available ? null : `why-${option.value}`,
        },
        h('span', {}, option.label),
      );
      button.addEventListener('click', () => {
        onSelect(option, button);
      });
      return h(
        'div',
        { class: 'option-item' },
        button,
        available
          ? null
          : h(
              'p',
              { class: 'field-hint', id: `why-${option.value}` },
              option.unavailable_reason ?? 'Not available yet.',
            ),
      );
    }),
  );
}

/** Turns any failure into the API's plain words, or a calm fallback. */
export function problemText(error: unknown): string {
  return error instanceof ApiError
    ? error.problem.detail
    : 'Something went wrong. Your information was not changed. Please try again.';
}

/**
 * Runs one request from a button: the button can't be pressed twice while it
 * runs, and a failure shows in `errorArea` instead of being lost.
 */
export async function attempt<T>(
  button: HTMLButtonElement | null,
  errorArea: HTMLElement,
  work: () => Promise<T>,
): Promise<T | undefined> {
  errorArea.replaceChildren();
  const run = async () => {
    try {
      return await work();
    } catch (error) {
      errorArea.replaceChildren(errorBanner(problemText(error)));
      return undefined;
    }
  };
  return button ? busy(button, run) : run();
}

/** A live region for errors after an action. */
export function errorSlot(): HTMLDivElement {
  return h('div', { class: 'error-slot', 'aria-live': 'assertive' });
}

/** A standard page body: the heading and what follows. */
export function page(title: string, ...children: Child[]): HTMLDivElement {
  return h('div', { class: 'content' }, h('h1', {}, title), children);
}

/** A wider page body for lists and tables. */
export function widePage(title: string, ...children: Child[]): HTMLDivElement {
  return h('div', { class: 'content content-wide' }, h('h1', {}, title), children);
}

/** The Cairn message card for the main thing the API said on this screen. */
export function says(...parts: (string | null | undefined)[]): HTMLElement | null {
  const text = parts.filter((p): p is string => Boolean(p)).join(' ');
  return text ? cairnMessage(text) : null;
}

/** Paragraphs of statements from the API. */
export function paragraphs(lines: string[] | null | undefined): Child {
  return (lines ?? []).map((line) => h('p', {}, line));
}

/** A date from the API (YYYY-MM-DD or an ISO time) in plain words, in the browser's time zone. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A secondary button with a click handler. */
export function secondaryButton(label: string, onClick: (event: Event) => void): HTMLButtonElement {
  return h('button', { type: 'button', class: 'button-secondary', onClick }, label);
}

/** A link styled as the main action, routed inside the app. */
export function primaryLink(href: string, label: string): HTMLAnchorElement {
  return h(
    'a',
    { href, class: 'button-primary', 'data-route': '' },
    h('span', {}, label),
    svgIcon(icons.arrowRight, 20),
  );
}

/** A link styled as a secondary action, routed inside the app. */
export function secondaryLink(href: string, label: string): HTMLAnchorElement {
  return h('a', { href, class: 'button-secondary', 'data-route': '' }, label);
}

/** A "Back to ..." link at the top of a page. */
export function backLink(href: string, label: string): HTMLAnchorElement {
  return h(
    'a',
    { href, class: 'back-link', 'data-route': '' },
    svgIcon(icons.arrowLeft, 18),
    h('span', {}, label),
  );
}
