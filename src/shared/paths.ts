/**
 * Which pages need a signed-in person, and where sign-in may return to.
 * Shared by the Worker (which enforces it) and the client router (which
 * mirrors it so a signed-out person is never shown a half-rendered page).
 */

/** Pages that are only served with a valid session. Keep in sync with wrangler.jsonc run_worker_first. */
export const PROTECTED_PREFIXES = [
  '/setup',
  '/home',
  '/cases',
  '/settings',
  '/subscription',
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Where sign-in lands when nothing else is asked for. */
export const DEFAULT_RETURN_TO = '/setup';

/**
 * Only same-site, protected, plain paths are allowed as a place to return to
 * after sign-in. Anything else (another host, "//evil", "/\\evil", encoded
 * tricks, a query string) falls back to /setup. This prevents open redirects.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 200) return DEFAULT_RETURN_TO;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(value)) return DEFAULT_RETURN_TO;
  if (value.startsWith('//')) return DEFAULT_RETURN_TO;
  return isProtectedPath(value) ? value : DEFAULT_RETURN_TO;
}
