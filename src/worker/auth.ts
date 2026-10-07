/**
 * Sign-in with Auth0, done entirely by the Worker (OAuth 2.0 authorization
 * code flow with PKCE and a confidential client).
 *
 * Auth0 owns every credential: Google, Apple, the email link or code, and any
 * password or passkey. Cairn never sees one (cairn-core auth0/README.md).
 * The browser only ever holds an encrypted, HttpOnly session cookie, so a
 * script running in the page can't read a token. This is the "backend for
 * frontend" pattern from the IETF's OAuth 2.0 for Browser-Based Applications.
 *
 * Routes:
 *   GET  /auth/login      start sign-in (Google, Apple, the chooser, or a silent re-check)
 *   POST /auth/login      start email sign-in with the address typed on the email screen
 *   GET  /auth/link       add another way to sign in, from Settings (UC-REG-05)
 *   GET  /auth/callback   Auth0 sends the person back here
 *   GET  /auth/session    what the screens may know about the session (no tokens)
 *   POST /auth/logout     end the session, then sign out of Auth0
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AppConfig } from '../shared/env.ts';
import { DEFAULT_RETURN_TO, safeReturnTo } from '../shared/paths.ts';
import { pkceChallenge, randomToken, seal, unseal } from './crypto.ts';
import {
  TRANSACTION_COOKIE,
  clearCookie,
  isSameOriginWrite,
  json,
  problem,
  readCookie,
  redirect,
  setCookie,
} from './http.ts';
import {
  type SessionData,
  type SignInMethod,
  clearSessionCookie,
  maskEmail,
  methodFromSubject,
  nowSeconds,
  readSession,
  sessionCookie,
} from './session.ts';

/** A sign-in attempt must finish within 10 minutes. */
const TRANSACTION_MAX_AGE = 600;
/** Refresh the access token when it has less than this many seconds left. */
const REFRESH_LEEWAY = 60;
/**
 * No profile scope: Cairn never asks Google or Apple for a name or photo (cairn-core account
 * spec D-16 and data_boundary.enforcement). It asks the person what to call them instead.
 */
const SCOPE = 'openid email offline_access';
/** Where Settings shows the result of adding a sign-in method. */
const LINK_RETURN = '/settings/sign-in';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Transaction {
  s: string; // state
  n: string; // nonce
  cv: string; // PKCE code verifier
  r: string; // where to go afterwards
  iat: number;
  k?: 1; // adding a second sign-in method to the signed-in account
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

export interface LoginRequest {
  method?: SignInMethod | undefined;
  signup?: boolean | undefined;
  loginHint?: string | undefined;
  returnTo?: string | undefined;
  silent?: boolean | undefined;
  /** Sign in with another method only to add it to the current account. */
  link?: boolean | undefined;
}

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(issuer: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksCache.set(issuer, jwks);
  }
  return jwks;
}

export function connectionFor(method: SignInMethod, config: AppConfig): string {
  if (method === 'google') return 'google-oauth2';
  if (method === 'apple') return 'apple';
  return config.auth0EmailConnection;
}

function parseMethod(value: unknown): SignInMethod | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  return value === 'google' || value === 'apple' || value === 'email' ? value : null;
}

function callbackUrl(request: Request): string {
  return `${new URL(request.url).origin}/auth/callback`;
}

/** Builds the Auth0 /authorize URL and the sealed transaction cookie that goes with it. */
export async function beginLogin(
  request: Request,
  config: AppConfig,
  login: LoginRequest,
): Promise<{ url: string; cookie: string }> {
  const verifier = randomToken(32);
  const tx: Transaction = {
    s: randomToken(24),
    n: randomToken(24),
    cv: verifier,
    r: login.link ? LINK_RETURN : safeReturnTo(login.returnTo),
    iat: nowSeconds(),
  };
  if (login.link) tx.k = 1;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.auth0ClientId,
    redirect_uri: callbackUrl(request),
    scope: SCOPE,
    audience: config.auth0Audience,
    state: tx.s,
    nonce: tx.n,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  if (login.method) params.set('connection', connectionFor(login.method, config));
  if (login.signup) params.set('screen_hint', 'signup');
  if (login.loginHint) params.set('login_hint', login.loginHint);
  if (login.silent) params.set('prompt', 'none');
  // Adding a method always asks Auth0 for a fresh sign-in with that method.
  if (login.link) params.set('prompt', 'login');

  const sealed = await seal(tx, config.sessionSecret, 'transaction');
  // Lax, not Strict: Auth0 returns with a cross-site top-level GET, and the
  // cookie has to come back with it.
  const cookie = setCookie(TRANSACTION_COOKIE, sealed, {
    maxAge: TRANSACTION_MAX_AGE,
    sameSite: 'Lax',
  });
  return { url: `${config.auth0IssuerBaseUrl}/authorize?${params.toString()}`, cookie };
}

export async function handleLoginGet(request: Request, config: AppConfig): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const method = parseMethod(query.get('method'));
  if (method === null)
    return problem(400, 'invalid_method', 'Please choose Google, Apple, or email.');
  const { url, cookie } = await beginLogin(request, config, {
    method,
    signup: query.get('signup') === '1',
    returnTo: query.get('returnTo') ?? DEFAULT_RETURN_TO,
    silent: query.get('silent') === '1',
  });
  return redirect(url, { 'Set-Cookie': cookie });
}

/**
 * GET /auth/link?method=apple. UC-REG-05: the person is signed in the original
 * way and signs in once more with the method to add. The callback hands that
 * second token to the API (POST /v1/me/sign-in-methods) and keeps the current
 * session. Accounts are never linked any other way.
 */
export async function handleLinkGet(request: Request, config: AppConfig): Promise<Response> {
  const session = await readSession(request, config);
  if (!session) return redirect(`/auth/login?returnTo=${encodeURIComponent(LINK_RETURN)}`);
  const method = parseMethod(new URL(request.url).searchParams.get('method'));
  if (!method) return problem(400, 'invalid_method', 'Please choose Google, Apple, or email.');
  const { url, cookie } = await beginLogin(request, config, { method, link: true });
  return redirect(url, { 'Set-Cookie': cookie });
}

/**
 * The email screen posts the typed address here (not in a URL, so it stays out
 * of browser history and request logs on our side) and navigates to the
 * returned Auth0 URL, which pre-fills it.
 */
export async function handleLoginPost(request: Request, config: AppConfig): Promise<Response> {
  if (!isSameOriginWrite(request))
    return problem(403, 'forbidden', 'This request was not allowed.');
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return problem(400, 'invalid_body', 'The request could not be read.');
  }
  const method = parseMethod(body.method);
  if (!method) return problem(400, 'invalid_method', 'Please choose Google, Apple, or email.');
  const loginHint = typeof body.login_hint === 'string' ? body.login_hint.trim() : '';
  if (loginHint && (loginHint.length > 254 || !EMAIL_PATTERN.test(loginHint))) {
    return problem(
      422,
      'invalid_email',
      'Please check your email address. It needs a full ending, like name@example.com.',
    );
  }
  const { url, cookie } = await beginLogin(request, config, {
    method,
    signup: body.signup === true,
    loginHint: loginHint || undefined,
    returnTo: typeof body.returnTo === 'string' ? body.returnTo : DEFAULT_RETURN_TO,
  });
  return json({ authorize_url: url }, 200, { 'Set-Cookie': cookie });
}

async function exchangeCode(
  config: AppConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<TokenResponse | null> {
  return tokenRequest(config, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
}

async function tokenRequest(
  config: AppConfig,
  fields: Record<string, string>,
): Promise<TokenResponse | null> {
  try {
    const response = await fetch(`${config.auth0IssuerBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.auth0ClientId,
        client_secret: config.auth0ClientSecret,
        ...fields,
      }),
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as TokenResponse;
  } catch {
    return null;
  }
}

export async function handleCallback(request: Request, config: AppConfig): Promise<Response> {
  const url = new URL(request.url);
  const clearTx = clearCookie(TRANSACTION_COOKIE, 'Lax');
  const fail = (location: string) => redirect(location, { 'Set-Cookie': clearTx });

  const sealedTx = readCookie(request, TRANSACTION_COOKIE);
  const tx = sealedTx
    ? await unseal<Transaction>(sealedTx, config.sessionSecret, 'transaction')
    : null;

  const error = url.searchParams.get('error');
  if (error) {
    // UC-REG-02 and UC-REG-03: cancelling on Google's or Apple's screen goes
    // back to the welcome screen with a reassurance note.
    if (error === 'access_denied')
      return fail(tx?.k ? `${LINK_RETURN}?link=cancelled` : '/?oauth_cancelled=true');
    // A silent re-check found no Auth0 session. Ask interactively instead.
    if (
      error === 'login_required' ||
      error === 'interaction_required' ||
      error === 'consent_required'
    ) {
      const returnTo = tx ? tx.r : DEFAULT_RETURN_TO;
      return fail(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return fail('/?signin_error=true');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!tx || !code || !state || state !== tx.s || nowSeconds() - tx.iat > TRANSACTION_MAX_AGE) {
    return fail('/?signin_error=true');
  }

  const tokens = await exchangeCode(config, code, tx.cv, callbackUrl(request));
  if (!tokens?.access_token || !tokens.id_token) return fail('/?signin_error=true');

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(tokens.id_token, jwksFor(config.auth0IssuerBaseUrl), {
      issuer: `${config.auth0IssuerBaseUrl}/`,
      audience: config.auth0ClientId,
      algorithms: ['RS256'],
    });
    claims = verified.payload;
  } catch {
    return fail('/?signin_error=true');
  }
  if (claims.nonce !== tx.n || typeof claims.sub !== 'string') return fail('/?signin_error=true');

  if (tx.k) return finishLink(request, config, tokens.access_token, clearTx);

  const method = methodFromSubject(claims.sub);
  const now = nowSeconds();
  const session: SessionData = {
    v: 1,
    at: tokens.access_token,
    ate: now + (typeof tokens.expires_in === 'number' ? tokens.expires_in : 300),
    iat: now,
    sub: claims.sub,
    em: maskEmail(typeof claims.email === 'string' ? claims.email : undefined),
    ev: claims.email_verified === true,
    m: method,
  };
  if (tokens.refresh_token) session.rt = tokens.refresh_token;

  const headers = new Headers();
  headers.append('Set-Cookie', clearTx);
  headers.append('Set-Cookie', await sessionCookie(session, config));
  return redirect(tx.r, headers);
}

/**
 * The second half of /auth/link. The current session stays as it is. The API
 * checks both tokens and answers linked, already_linked, or a problem.
 */
async function finishLink(
  request: Request,
  config: AppConfig,
  newAccessToken: string,
  clearTx: string,
): Promise<Response> {
  const headers = new Headers({ 'Set-Cookie': clearTx });
  const current = await readSession(request, config);
  const fresh = current ? await freshSession(current, config) : null;
  if (!fresh) {
    headers.append('Set-Cookie', clearSessionCookie());
    return redirect(`/auth/login?returnTo=${encodeURIComponent(LINK_RETURN)}`, headers);
  }
  if (fresh.changed) headers.append('Set-Cookie', await sessionCookie(fresh.session, config));
  let result = 'failed';
  try {
    const response = await fetch(`${config.apiOrigin}/v1/me/sign-in-methods`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fresh.session.at}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ access_token: newAccessToken }),
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    const body = (await response.json().catch(() => ({}))) as { result?: unknown; code?: unknown };
    if (response.ok && (body.result === 'linked' || body.result === 'already_linked')) {
      result = body.result;
    } else if (typeof body.code === 'string' && /^[a-z_]{1,40}$/.test(body.code)) {
      result = body.code;
    }
  } catch {
    // Network or timeout: reported as failed.
  }
  return redirect(`${LINK_RETURN}?link=${result}`, headers);
}

/**
 * Returns a session whose access token is good for at least a minute,
 * refreshing it with Auth0 if needed. `changed` means the cookie must be
 * re-issued. Null means the person has to sign in again.
 */
export async function freshSession(
  session: SessionData,
  config: AppConfig,
): Promise<{ session: SessionData; changed: boolean } | null> {
  if (session.ate - REFRESH_LEEWAY > nowSeconds()) return { session, changed: false };
  if (!session.rt) return null;
  const tokens = await tokenRequest(config, {
    grant_type: 'refresh_token',
    refresh_token: session.rt,
  });
  if (!tokens?.access_token) return null;
  const next: SessionData = {
    ...session,
    at: tokens.access_token,
    ate: nowSeconds() + (typeof tokens.expires_in === 'number' ? tokens.expires_in : 300),
  };
  // Auth0 refresh token rotation returns a new refresh token every time.
  if (tokens.refresh_token) next.rt = tokens.refresh_token;
  return { session: next, changed: true };
}

export async function handleSession(request: Request, config: AppConfig): Promise<Response> {
  const session = await readSession(request, config);
  if (!session) return json({ authenticated: false });
  return json({
    authenticated: true,
    email: session.em,
    email_verified: session.ev,
    method: session.m,
  });
}

export async function handleLogout(
  request: Request,
  config: AppConfig,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (!isSameOriginWrite(request))
    return problem(403, 'forbidden', 'This request was not allowed.');
  const session = await readSession(request, config);
  if (session && session.ate > nowSeconds()) {
    // UC-REG-19: the API stops accepting this token and saves where the person was.
    waitUntil(
      fetch(`${config.apiOrigin}/v1/me/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.at}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(config.apiTimeoutMs),
      }).catch(() => undefined),
    );
  }
  if (session?.rt) {
    // Best effort: revoke the refresh token so it can't be used again.
    waitUntil(
      fetch(`${config.auth0IssuerBaseUrl}/oauth/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.auth0ClientId,
          client_secret: config.auth0ClientSecret,
          token: session.rt,
        }),
      }).catch(() => undefined),
    );
  }
  // Where Auth0 sends the browser afterwards: the signed-out screen, which says why.
  let reason = 'signed_out';
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (body.reason === 'timeout' || body.reason === 'deleted') reason = body.reason;
  } catch {
    // No body: a plain sign-out.
  }
  const back = reason === 'signed_out' ? '/signed-out' : `/signed-out?reason=${reason}`;
  const params = new URLSearchParams({
    client_id: config.auth0ClientId,
    returnTo: `${new URL(request.url).origin}${back}`,
  });
  return json({ logout_url: `${config.auth0IssuerBaseUrl}/v2/logout?${params.toString()}` }, 200, {
    'Set-Cookie': clearSessionCookie(),
  });
}
