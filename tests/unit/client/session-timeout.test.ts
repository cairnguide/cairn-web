// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../../../src/client/state.ts', () => ({
  getSession: () => ({ authenticated: true }),
  signOut,
}));
const get = vi.fn(() => Promise.resolve({}));
vi.mock('../../../src/client/api.ts', () => ({ api: { get } }));

const policy = {
  inactivity_timeout_seconds: 300,
  warning_before_timeout_seconds: 20,
  overall_session_days: 30,
  timeout_warning: 'Are you still there?',
  timeout_warning_button: 'Stay signed in',
  session_timed_out: 'Signed out after a while.',
  signed_out: 'Signed out.',
};

beforeEach(() => {
  vi.useFakeTimers();
  signOut.mockClear();
  get.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session timeout (UC-REG-19)', () => {
  it('warns 20 seconds before, then signs out with the timeout reason', async () => {
    const { startSessionTimeout } = await import('../../../src/client/session-timeout.ts');
    startSessionTimeout(policy);
    vi.advanceTimersByTime(279_000);
    expect(document.querySelector('.timeout-dialog')).toBeNull();
    vi.advanceTimersByTime(1_000);
    const dialog = document.querySelector('.timeout-dialog');
    expect(dialog?.textContent).toContain('Are you still there?');
    expect(dialog?.textContent).not.toMatch(/\d/);

    // Staying tells the API and starts the clock again.
    dialog?.querySelector('button')?.click();
    expect(get).toHaveBeenCalledWith('/v1/me');
    expect(document.querySelector('.timeout-dialog')).toBeNull();
    vi.advanceTimersByTime(299_000);
    expect(signOut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(signOut).toHaveBeenCalledWith('timeout');
  });
});
