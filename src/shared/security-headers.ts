/**
 * Security headers for every response cairn-web sends.
 *
 * Two places serve responses: the Worker (sign-in, API proxy, protected pages)
 * and Workers Static Assets (everything else, using public/_headers). Both use
 * this list. `npm run check:headers` fails if public/_headers drifts from it.
 *
 * Baseline matches cairn-site's public/_headers, tightened for an app that
 * handles personal information:
 * - A strict Content Security Policy. Only this origin's scripts, styles, and
 *   fonts. Fonts are self-hosted, so no request reaches Google Fonts.
 * - Trusted Types are required, so no code can write HTML strings into the page.
 *   One named policy exists, `cairn-push`, and it only ever returns the fixed
 *   URL of the browser notification service worker (src/client/push.ts).
 * - No referrer is sent anywhere.
 * - The microphone is allowed for this origin only, for "Speak" (on-device
 *   speech recognition). Everything else is off.
 * - noindex: the app is not a search landing page. cairn-site is.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types cairn-push',
].join('; ');

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=(self)',
  'payment=()',
  'usb=()',
].join(', ');

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

/** Returns a copy of the response with every security header set. */
export function withSecurityHeaders(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    out.headers.set(name, value);
  }
  return out;
}
