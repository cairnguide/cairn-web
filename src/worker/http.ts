/**
 * Response helpers and cookie handling for the Worker.
 *
 * Every response the Worker builds is `Cache-Control: no-store` (it is either
 * personal or about sign-in) and gets the shared security headers.
 * Error bodies use RFC 9457 problem details, the same shape as the Cairn API,
 * so the client handles both the same way.
 */
import { withSecurityHeaders } from '../shared/security-headers.ts';

export const SESSION_COOKIE = '__Host-cairn_session';
export const TRANSACTION_COOKIE = '__Host-cairn_tx';

/** Browsers reject cookies over 4096 bytes. Stay well under it. */
export const MAX_COOKIE_BYTES = 3900;

function finalize(response: Response): Response {
  const out = withSecurityHeaders(response);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const response = new Response(JSON.stringify(body), { status, headers });
  response.headers.set('Content-Type', 'application/json; charset=utf-8');
  return finalize(response);
}

export function problem(
  status: number,
  code: string,
  detail: string,
  headers: HeadersInit = {},
): Response {
  const body = {
    type: `https://cairn.invalid/problems/${code}`,
    title: code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    status,
    code,
    detail,
  };
  const response = new Response(JSON.stringify(body), { status, headers });
  response.headers.set('Content-Type', 'application/problem+json');
  return finalize(response);
}

export function redirect(location: string, headers: HeadersInit = {}): Response {
  const response = new Response(null, { status: 302, headers });
  response.headers.set('Location', location);
  return finalize(response);
}

export function secure(response: Response): Response {
  return finalize(response);
}

export interface CookieOptions {
  maxAge: number;
  sameSite: 'Strict' | 'Lax';
}

/**
 * A __Host- cookie: Secure, HttpOnly, Path=/, no Domain. JavaScript can never
 * read it, it is only sent over https (browsers treat localhost as secure),
 * and no subdomain can set or read it.
 */
export function setCookie(name: string, value: string, options: CookieOptions): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=${options.sameSite}; Max-Age=${options.maxAge}`;
}

export function clearCookie(name: string, sameSite: 'Strict' | 'Lax' = 'Lax'): string {
  return `${name}=; Path=/; Secure; HttpOnly; SameSite=${sameSite}; Max-Age=0`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value || null;
    }
  }
  return null;
}

/**
 * Cross-site request forgery check for anything that changes state.
 * The request must come from this origin (Origin header, which browsers
 * always send on POST/PUT/PATCH/DELETE) and carry the app's custom header,
 * which a cross-site form cannot add without a CORS preflight that this
 * Worker never approves. The session cookie is also SameSite=Lax, so it is
 * never attached to a cross-site POST.
 */
export function isSameOriginWrite(request: Request): boolean {
  const origin = request.headers.get('Origin');
  const expected = new URL(request.url).origin;
  return origin === expected && request.headers.get('X-Cairn-Client') === 'web';
}
