// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { assertSafeUrl, h, replaceChildren, srOnly, svgIcon } from '../../../src/client/dom.ts';
import { icons } from '../../../src/client/icons.ts';

describe('h()', () => {
  it('treats text as text, never as HTML', () => {
    const el = h('p', {}, '<img src=x onerror=alert(1)>');
    expect(el.children).toHaveLength(0);
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('sets attributes, skips empty ones, and nests children', () => {
    const el = h(
      'a',
      { href: '/setup', class: 'x', hidden: false, title: null, 'data-route': '' },
      'Go',
      1,
      [h('span', {}, '!')],
    );
    expect(el.getAttribute('href')).toBe('/setup');
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hasAttribute('data-route')).toBe(true);
    expect(el.textContent).toBe('Go1!');
  });

  it('attaches event handlers', () => {
    const onClick = vi.fn();
    h('button', { onClick }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('refuses javascript: and data: URLs', () => {
    expect(() => h('a', { href: 'javascript:alert(1)' })).toThrow();
    expect(() => h('a', { href: ' JavaScript:alert(1)' })).toThrow();
    expect(() => assertSafeUrl('data:text/html,hi')).toThrow();
    expect(() => assertSafeUrl('https://988lifeline.org')).not.toThrow();
  });

  it('refuses a handler that is not an on<event> attribute', () => {
    expect(() => h('button', { click: () => undefined })).toThrow();
  });
});

describe('svgIcon()', () => {
  it('is decorative and hidden from screen readers', () => {
    const svg = svgIcon(icons.stepCurrent, 20);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(svg.querySelector('circle[fill="currentColor"]')).not.toBeNull();
    expect(svgIcon(icons.mail).querySelector('rect')).not.toBeNull();
  });
});

describe('helpers', () => {
  it('srOnly and replaceChildren', () => {
    const div = h('div', {}, 'old');
    replaceChildren(div, srOnly('hidden text'), 'new');
    expect(div.querySelector('.sr-only')?.textContent).toBe('hidden text');
    expect(div.textContent).toBe('hidden textnew');
  });
});
