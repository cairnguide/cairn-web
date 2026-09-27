/**
 * Display preferences from the header: text size and read aloud.
 *
 * These are per-device conveniences, not personal information, so they live
 * in localStorage. Storage can be blocked (private windows, strict settings),
 * so every access is guarded and the app works without it.
 */

export type TextSize = 0 | 1 | 2;
export const TEXT_SIZE_LABELS = ['Standard', 'Larger', 'Largest'] as const;

const TEXT_SIZE_KEY = 'cairn.textSize';
const READ_ALOUD_KEY = 'cairn.readAloud';

type Listener = () => void;
const listeners = new Set<Listener>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked. The choice still applies until the page is closed.
  }
}

let textSize: TextSize = (() => {
  const stored = Number(read(TEXT_SIZE_KEY));
  return stored === 1 || stored === 2 ? stored : 0;
})();
let readAloud = read(READ_ALOUD_KEY) === 'on';

export function getTextSize(): TextSize {
  return textSize;
}

export function cycleTextSize(): TextSize {
  textSize = ((textSize + 1) % 3) as TextSize;
  write(TEXT_SIZE_KEY, String(textSize));
  applyPreferences();
  return textSize;
}

export function isReadAloudOn(): boolean {
  return readAloud;
}

export function setReadAloud(on: boolean): void {
  readAloud = on;
  write(READ_ALOUD_KEY, on ? 'on' : 'off');
  applyPreferences();
}

export function applyPreferences(): void {
  document.documentElement.dataset.textSize = String(textSize);
  for (const listener of listeners) listener();
}

export function onPreferencesChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
