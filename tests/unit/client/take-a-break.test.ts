// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const abortListening = vi.fn();
vi.mock('../../../src/client/speech.ts', () => ({ abortListening }));

const breaks = await import('../../../src/client/take-a-break.ts');

beforeEach(() => {
  abortListening.mockClear();
  breaks.clearBreakMemory();
  window.history.replaceState(null, '', '/cases/c1');
  document.body.replaceChildren();
});

function view(...values: string[]): HTMLElement {
  const main = document.createElement('main');
  for (const value of values) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    main.appendChild(input);
  }
  document.body.replaceChildren(main);
  return main;
}

describe('Take a break helpers (UC-BRK-01)', () => {
  it('stops listening before the break screen opens (AC09)', () => {
    breaks.beforeBreak();
    expect(abortListening).toHaveBeenCalledOnce();
  });

  it('keeps partly typed text for the same view and puts it back once (AC08)', () => {
    view('Marg');
    breaks.beforeBreak();
    const fresh = view('');
    breaks.restoreTyped(fresh);
    expect(fresh.querySelector('input')?.value).toBe('Marg');
    const again = view('');
    breaks.restoreTyped(again);
    expect(again.querySelector('input')?.value).toBe('');
  });

  it('does not put text into a different view', () => {
    view('Marg');
    breaks.beforeBreak();
    window.history.replaceState(null, '', '/cases/c1/review');
    const other = view('');
    breaks.restoreTyped(other);
    expect(other.querySelector('input')?.value).toBe('');
  });

  it('returns to the view the break was taken from, but never to a delete confirmation (AC10)', () => {
    breaks.rememberBreakView('c1', '/cases/c1/review');
    expect(breaks.takeBreakView('c1')).toBe('/cases/c1/review');
    expect(breaks.takeBreakView('c1')).toBeNull();
    breaks.rememberBreakView('c1', '/cases/c1/delete');
    expect(breaks.takeBreakView('c1')).toBeNull();
  });
});
