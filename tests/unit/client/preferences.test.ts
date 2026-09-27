// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

describe('display preferences', () => {
  it('cycles text size through three steps and applies it to <html>', async () => {
    const prefs = await import('../../../src/client/preferences.ts');
    prefs.applyPreferences();
    expect(document.documentElement.dataset.textSize).toBe('0');
    expect(prefs.cycleTextSize()).toBe(1);
    expect(document.documentElement.dataset.textSize).toBe('1');
    expect(prefs.cycleTextSize()).toBe(2);
    expect(prefs.cycleTextSize()).toBe(0);
  });

  it('remembers read aloud on this device', async () => {
    const prefs = await import('../../../src/client/preferences.ts');
    const listener = vi.fn();
    prefs.onPreferencesChange(listener);
    prefs.setReadAloud(true);
    expect(listener).toHaveBeenCalled();
    vi.resetModules();
    const again = await import('../../../src/client/preferences.ts');
    expect(again.isReadAloudOn()).toBe(true);
  });

  it('works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const prefs = await import('../../../src/client/preferences.ts');
    expect(prefs.getTextSize()).toBe(0);
    expect(() => prefs.setReadAloud(true)).not.toThrow();
    expect(prefs.isReadAloudOn()).toBe(true);
  });
});
