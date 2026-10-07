/**
 * UC-REG-19 and account spec D-20: sign out after 5 minutes with no activity,
 * with a warning first.
 *
 * The API enforces the timeout on its side (401 session_timed_out). This
 * module keeps the browser in step with it:
 * - Any activity (a key, a tap, a click) counts as staying. While the person
 *   is active, a light request tells the API so, at most once a minute, so
 *   someone reading or typing a long answer isn't signed out.
 * - After timeout minus warning seconds with no activity, a dialog shows the
 *   API's timeout_warning and one "Stay signed in" button, with at least 20
 *   seconds to respond (WCAG 2.2 success criterion 2.2.1). No countdown
 *   numbers are shown, which also meets the care level 3 and 4 rule.
 * - When the time is up, the person is signed out and the signed-out screen
 *   says why.
 */
import { api } from './api.ts';
import type { SessionPolicy } from './api-types.ts';
import { h } from './dom.ts';
import { getSession, signOut } from './state.ts';

const FALLBACK: SessionPolicy = {
  inactivity_timeout_seconds: 300,
  warning_before_timeout_seconds: 20,
  overall_session_days: 30,
  timeout_warning:
    "Are you still there? For your privacy, you'll be signed out soon. Everything is saved.",
  timeout_warning_button: 'Stay signed in',
  session_timed_out:
    'You were signed out because there was no activity for a while. Everything you did is saved.',
  signed_out: "You're signed out. Everything is saved.",
};

/** WCAG 2.2.1 needs at least 20 seconds to respond. */
const MIN_WARNING_SECONDS = 20;
/** Tell the API about activity at most this often. */
const PING_EVERY_MS = 60_000;

let policy: SessionPolicy = FALLBACK;
let lastActivity = Date.now();
let lastPing = Date.now();
let warnTimer: number | undefined;
let endTimer: number | undefined;
let dialog: HTMLDialogElement | null = null;
let started = false;

export function getSessionPolicy(): SessionPolicy {
  return policy;
}

function clearTimers(): void {
  window.clearTimeout(warnTimer);
  window.clearTimeout(endTimer);
}

function closeWarning(): void {
  if (dialog?.open && typeof dialog.close === 'function') dialog.close();
  dialog?.remove();
  dialog = null;
}

function stay(): void {
  closeWarning();
  lastActivity = Date.now();
  lastPing = Date.now();
  // A request counts as activity on the API side too.
  void api.get('/v1/me').catch(() => undefined);
  schedule();
}

function showWarning(): void {
  if (dialog) return;
  const stayButton = h(
    'button',
    { type: 'button', class: 'button-primary', onClick: stay },
    policy.timeout_warning_button,
  );
  dialog = h(
    'dialog',
    {
      class: 'timeout-dialog',
      role: 'alertdialog',
      'aria-labelledby': 'timeout-text',
      'aria-modal': 'true',
    },
    h('p', { id: 'timeout-text', class: 'lede' }, policy.timeout_warning),
    h('div', { class: 'actions' }, stayButton),
  );
  dialog.addEventListener('cancel', (event) => {
    // Escape also means "I'm here".
    event.preventDefault();
    stay();
  });
  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  stayButton.focus();
}

function schedule(): void {
  clearTimers();
  const total = policy.inactivity_timeout_seconds * 1000;
  const warning = Math.max(policy.warning_before_timeout_seconds, MIN_WARNING_SECONDS) * 1000;
  const idle = Date.now() - lastActivity;
  warnTimer = window.setTimeout(showWarning, Math.max(0, total - warning - idle));
  endTimer = window.setTimeout(
    () => {
      closeWarning();
      void signOut('timeout');
    },
    Math.max(0, total - idle),
  );
}

function onActivity(): void {
  // Once the warning is up, only its button (or Escape) counts, so a stray
  // scroll doesn't hide it before the person has read it.
  if (dialog) return;
  lastActivity = Date.now();
  if (Date.now() - lastPing > PING_EVERY_MS) {
    lastPing = Date.now();
    void api.get('/v1/me').catch(() => undefined);
  }
  schedule();
}

/** Starts watching for inactivity when someone is signed in. Safe to call more than once. */
export function startSessionTimeout(fromApi: SessionPolicy | null | undefined): void {
  if (fromApi) policy = fromApi;
  if (started || !getSession().authenticated) return;
  started = true;
  for (const type of ['keydown', 'pointerdown', 'input']) {
    document.addEventListener(type, onActivity, { passive: true, capture: true });
  }
  schedule();
}
