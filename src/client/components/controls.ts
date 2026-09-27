/**
 * Reusable pieces from the wireframes: buttons, links, callouts, the Cairn
 * message card with Listen, checkboxes, and field errors.
 *
 * Accessibility rules from the wireframes are built in: real <button> and <a>
 * elements, touch targets of at least 44px (styled in CSS), visible labels,
 * hints and errors tied to fields with aria-describedby, and "(opens in a new
 * tab)" announced on every new-tab link.
 */
import { h, srOnly, svgIcon, type Child } from '../dom.ts';
import { icons, type IconName } from '../icons.ts';
import { isReadAloudOn } from '../preferences.ts';
import { canListen, speak } from '../speech.ts';

let idCounter = 0;
export function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function newTabLink(url: string, children: Child, className?: string): HTMLAnchorElement {
  return h(
    'a',
    { href: url, target: '_blank', rel: 'noopener noreferrer', class: className ?? null },
    children,
    srOnly(' (opens in a new tab)'),
  );
}

export function primaryButton(
  label: string,
  onClick: (event: Event) => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: 'button-primary', onClick, ...attrs },
    h('span', {}, label),
    svgIcon(icons.arrowRight, 20),
  );
}

export function routeLink(href: string, label: Child, className = 'text-link'): HTMLAnchorElement {
  return h('a', { href, class: className, 'data-route': '' }, label);
}

export function textButton(label: string, onClick: (event: Event) => void): HTMLButtonElement {
  return h('button', { type: 'button', class: 'text-link', onClick }, label);
}

export function actions(...children: Child[]): HTMLDivElement {
  return h('div', { class: 'actions' }, children);
}

export function callout(
  kind: 'info' | 'crisis' | 'error',
  icon: IconName,
  ...children: Child[]
): HTMLDivElement {
  return h(
    'div',
    { class: `callout callout-${kind}` },
    svgIcon(icons[icon], 24),
    h('div', {}, children),
  );
}

/** "Listen" / "Listen to this" button. Hidden when the device can't read aloud on its own. */
export function listenButton(getText: () => string, label = 'Listen'): HTMLButtonElement | null {
  if (!canListen()) return null;
  return h(
    'button',
    { type: 'button', class: 'control control-small', onClick: () => speak(getText()) },
    svgIcon(icons.speaker, 18),
    h('span', {}, label),
  );
}

/**
 * A message from Cairn, as in the wireframes' chat card. Announced politely
 * to screen readers, and read aloud automatically when Read aloud is on.
 */
export function cairnMessage(text: string): HTMLDivElement {
  const message = h('p', { class: 'message-text', 'data-read-aloud': '' }, text);
  return h(
    'div',
    { class: 'message', role: 'log', 'aria-live': 'polite' },
    h(
      'div',
      { class: 'message-head' },
      h('span', { class: 'message-from' }, 'Cairn'),
      listenButton(() => text),
    ),
    message,
  );
}

/** Reads the page's main Cairn message when Read aloud is on. Called after each page renders. */
export function autoReadAloud(root: ParentNode): void {
  if (!isReadAloudOn()) return;
  const target = root.querySelector('[data-read-aloud]');
  if (target?.textContent) speak(target.textContent);
}

/** A card with body text and a "Listen to this" button, as on the privacy, trial, and AI notice screens. */
export function readingCard(paragraphs: string[], ...extra: Child[]): HTMLDivElement {
  const text = () => paragraphs.join(' ');
  const listen = listenButton(text, 'Listen to this');
  return h(
    'div',
    { class: 'reading-card' },
    listen ? h('div', { class: 'reading-card-tools' }, listen) : null,
    paragraphs.map((p, index) =>
      h('p', { class: 'reading-text', 'data-read-aloud': index === 0 ? '' : null }, p),
    ),
    extra,
  );
}

export interface CheckboxField {
  root: HTMLDivElement;
  input: HTMLInputElement;
  showError(message: string | null): void;
}

/** Acknowledgment checkbox. Never pre-checked (API Checkbox.checked is always false). */
export function checkboxField(label: string, emphasis = false): CheckboxField {
  const id = uid('ack');
  const errorId = `${id}-error`;
  const input = h('input', { id, type: 'checkbox', class: 'checkbox' });
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const root = h(
    'div',
    { class: emphasis ? 'checkbox-field checkbox-field-emphasis' : 'checkbox-field' },
    h('div', { class: 'checkbox-row' }, input, h('label', { for: id }, label)),
    error,
  );
  return {
    root,
    input,
    showError(message) {
      if (message) {
        error.replaceChildren(svgIcon(icons.warning, 22), h('span', {}, message));
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', errorId);
        input.focus();
      } else {
        error.hidden = true;
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    },
  };
}

/** The 988 crisis callout used on the AI notice and pause screens. */
export function crisisCallout(): HTMLDivElement {
  return callout(
    'crisis',
    'phone',
    h(
      'p',
      {},
      h('strong', {}, 'If you are in crisis,'),
      ' you can call or text ',
      h('a', { href: 'tel:988' }, '988'),
      ', or chat at ',
      newTabLink('https://988lifeline.org', '988lifeline.org'),
      ', any time.',
    ),
  );
}

/** Shows an error from the API or the network where the person will see it. */
export function errorBanner(message: string): HTMLDivElement {
  return h(
    'div',
    { class: 'callout callout-error', role: 'alert' },
    svgIcon(icons.warning, 24),
    h('p', {}, message),
  );
}

/** Disables a button while a request is running, so it can't be sent twice. */
export async function busy<T>(
  button: HTMLButtonElement,
  work: () => Promise<T>,
): Promise<T | undefined> {
  if (button.disabled) return undefined;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
