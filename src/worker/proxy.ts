/**
 * Same-origin proxy from the browser to the Cairn API.
 *
 * The browser calls /api/v1/... on this origin. The Worker adds the signed-in
 * person's access token and forwards the call to CAIRN_API_ORIGIN/v1/...
 * Because of this:
 * - the access token never reaches browser JavaScript,
 * - the API needs no CORS configuration, and the page's CSP can stay
 *   `connect-src 'self'`,
 * - only a short list of headers crosses in either direction (no cookies go to
 *   the API and none come back).
 *
 * A few API endpoints work without signing in (the welcome screen, sign-in
 * methods, policy versions, and "I need a moment"). Everything else needs a
 * session, and every write passes the same-origin check.
 */
import type { AppConfig } from '../shared/env.ts';
import { freshSession } from './auth.ts';
import { isSameOriginWrite, problem, secure } from './http.ts';
import { clearSessionCookie, readSession, sessionCookie } from './session.ts';

const PUBLIC_ENDPOINTS = new Set([
  'GET /v1/welcome',
  'GET /v1/sign-in-methods',
  'GET /v1/policies',
  'GET /v1/onboarding/need-a-moment',
]);

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FORWARDED_REQUEST_HEADERS = ['Accept', 'Accept-Language', 'Content-Type'];
const FORWARDED_RESPONSE_HEADERS = ['Content-Type', 'Content-Disposition', 'Content-Language'];
/** The API's largest request is a short free-text message. */
const MAX_BODY_BYTES = 64 * 1024;
const API_PATH = /^\/api(\/v1\/[A-Za-z0-9/_.-]*)$/;

export async function handleApi(request: Request, config: AppConfig): Promise<Response> {
  const url = new URL(request.url);
  const match = API_PATH.exec(url.pathname);
  if (!match?.[1] || match[1].includes('..')) {
    return problem(404, 'not_found', 'There is nothing here.');
  }
  const apiPath = match[1];
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return problem(405, 'method_not_allowed', 'That kind of request is not allowed here.', {
      Allow: 'GET, POST, PUT, PATCH, DELETE',
    });
  }
  const isWrite = method !== 'GET';
  if (isWrite && !isSameOriginWrite(request)) {
    return problem(403, 'forbidden', 'This request was not allowed.');
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const setCookies: string[] = [];
  const isPublic = PUBLIC_ENDPOINTS.has(`${method} ${apiPath}`);
  if (!isPublic) {
    const session = await readSession(request, config);
    const fresh = session ? await freshSession(session, config) : null;
    if (!fresh) {
      return problem(401, 'not_signed_in', 'Please sign in to continue.', {
        'Set-Cookie': clearSessionCookie(),
      });
    }
    if (fresh.changed) setCookies.push(await sessionCookie(fresh.session, config));
    headers.set('Authorization', `Bearer ${fresh.session.at}`);
  }

  let body: ArrayBuffer | undefined;
  if (isWrite) {
    const declared = Number(request.headers.get('Content-Length') ?? '0');
    if (declared > MAX_BODY_BYTES)
      return problem(413, 'too_large', 'That was more than Cairn can take in at once.');
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES)
      return problem(413, 'too_large', 'That was more than Cairn can take in at once.');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.apiOrigin}${apiPath}${url.search}`, {
      method,
      headers,
      body: body ?? null,
      redirect: 'manual',
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
  } catch {
    return problem(
      502,
      'api_unavailable',
      "We couldn't reach Cairn just now. Your information was not changed. Please try again in a moment.",
    );
  }

  const out = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const cookie of setCookies) out.append('Set-Cookie', cookie);
  // The API refused the token even though it looked fresh (revoked, or the
  // person was deleted). End the session here too.
  if (upstream.status === 401 && !isPublic) out.append('Set-Cookie', clearSessionCookie());

  return secure(new Response(upstream.body, { status: upstream.status, headers: out }));
}
