/**
 * What happens on every view when Take a break is selected (Take a break
 * spec UC-BRK-01):
 * - Listening stops and what was heard is thrown away, before the break
 *   screen opens (AC09, view V-29).
 * - Partly typed text is kept, in memory only, and put back when the person
 *   returns to the same view (AC08).
 * - In a case, the view the person was on is remembered, so the break
 *   screen's resume action brings them back there (UC-BRK-01 step 5).
 */
import { abortListening } from './speech.ts';

/** Typed text per view (path and query), never written to storage. */
const typed = new Map<string, string[]>();
/** Where to go back to after a case break, per case id. */
const returnTo = new Map<string, string>();

const FIELDS = 'main input[type="text"], main input:not([type]), main textarea';

function viewKey(): string {
  return window.location.pathname + window.location.search;
}

/** Call just before a break screen opens. */
export function beforeBreak(): void {
  abortListening();
  const values = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELDS)].map(
    (el) => el.value,
  );
  if (values.some((v) => v.trim() !== '')) typed.set(viewKey(), values);
}

/** Call after a view renders: puts back text typed before a break on this same view. */
export function restoreTyped(root: ParentNode): void {
  const key = viewKey();
  const values = typed.get(key);
  if (!values) return;
  const fields = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELDS)];
  if (fields.length !== values.length) return;
  fields.forEach((field, index) => {
    const value = values[index] ?? '';
    if (value && !field.value) {
      field.value = value;
      // Collapsed sections (own words) open again so the text is seen.
      field.closest('details')?.setAttribute('open', '');
    }
  });
  typed.delete(key);
}

/** Remembers which view of a case the person took a break from. */
export function rememberBreakView(caseId: string, path: string): void {
  returnTo.set(caseId, path);
}

/**
 * The view to go back to after a case break. A delete confirmation is never
 * returned to: taking a break there cancels the deletion (AC10).
 */
export function takeBreakView(caseId: string): string | null {
  const path = returnTo.get(caseId) ?? null;
  returnTo.delete(caseId);
  if (!path || path.endsWith('/delete')) return null;
  return path;
}

/** Forgets everything kept here (sign-out). */
export function clearBreakMemory(): void {
  typed.clear();
  returnTo.clear();
}
