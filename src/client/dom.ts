/**
 * Builds DOM nodes without HTML strings.
 *
 * Every piece of text, including anything that came from the API or the
 * person, goes in through a text node, never innerHTML. The page's Content
 * Security Policy requires Trusted Types with no policies, so an HTML-string
 * sink would throw instead of running. ESLint (no-unsanitized) blocks them too.
 */

export type Child = Node | string | number | false | null | undefined | Child[];

type Handler = (event: Event) => void;

export interface Attrs {
  [name: string]: string | number | boolean | Handler | null | undefined;
}

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  parent.appendChild(
    typeof child === 'string' || typeof child === 'number'
      ? document.createTextNode(String(child))
      : child,
  );
}

function applyAttrs(el: Element, attrs: Attrs): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      if (!name.startsWith('on')) throw new Error(`Handler for ${name} must be named on<event>.`);
      el.addEventListener(name.slice(2).toLowerCase(), value);
      continue;
    }
    if (name === 'href' || name === 'src' || name === 'action') {
      assertSafeUrl(String(value));
    }
    el.setAttribute(name, value === true ? '' : String(value));
  }
}

/** Blocks javascript: and data: URLs in links, whatever their source. */
export function assertSafeUrl(url: string): void {
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    throw new Error('Unsafe URL.');
  }
}

/** Creates an HTML element. `h('p', { class: 'lede' }, 'Hello')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconShape =
  | { path: string }
  | { circle: [number, number, number]; fill?: boolean }
  | { rect: [number, number, number, number, number] };

/** A decorative stroke icon (always aria-hidden). Shapes come from icons.ts, never from data. */
export function svgIcon(
  shapes: readonly IconShape[],
  size = 24,
  className = 'icon',
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  for (const shape of shapes) {
    let node: SVGElement;
    if ('path' in shape) {
      node = document.createElementNS(SVG_NS, 'path');
      node.setAttribute('d', shape.path);
    } else if ('circle' in shape) {
      node = document.createElementNS(SVG_NS, 'circle');
      const [cx, cy, r] = shape.circle;
      node.setAttribute('cx', String(cx));
      node.setAttribute('cy', String(cy));
      node.setAttribute('r', String(r));
      if (shape.fill) node.setAttribute('fill', 'currentColor');
    } else {
      node = document.createElementNS(SVG_NS, 'rect');
      const [x, y, w, hgt, rx] = shape.rect;
      node.setAttribute('x', String(x));
      node.setAttribute('y', String(y));
      node.setAttribute('width', String(w));
      node.setAttribute('height', String(hgt));
      node.setAttribute('rx', String(rx));
    }
    svg.appendChild(node);
  }
  return svg;
}

/** Visually hidden text for screen readers. */
export function srOnly(text: string): HTMLSpanElement {
  return h('span', { class: 'sr-only' }, text);
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}
