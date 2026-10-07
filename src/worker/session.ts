/**
 * The signed-in session, kept in one encrypted, HttpOnly cookie.
 *
 * It holds the Auth0 access token (sent to the Cairn API on the browser's
 * behalf), the refresh token, and a few facts the screens need. The browser
 * can't read or change it. Only a masked email is kept, never the full address.
 *
 * SameSite=Lax, not Strict: the first page after Auth0 is reached through a
 * cross-site redirect chain, and Chromium withholds Strict cookies there,
 * which would bounce the person back to sign-in. Lax is still never sent on
 * cross-site POSTs, and every write also passes isSameOriginWrite().
 */
import type { AppConfig } from '../shared/env.ts';
import { seal, unseal } from './crypto.ts';
import { MAX_COOKIE_BYTES, SESSION_COOKIE, clearCookie, readCookie, setCookie } from './http.ts';

export type SignInMethod = 'google' | 'apple' | 'email';

export interface SessionData {
  v: 1;
  /** Auth0 access token for the Cairn API audience. */
  at: string;
  /** Auth0 refresh token (rotating), when the tenant issues one. */
  rt?: string;
  /** Access token expiry, seconds since the epoch. */
  ate: number;
  /** When the person signed in, seconds since the epoch. Sets the absolute lifetime. */
  iat: number;
  /** Auth0 subject. */
  sub: string;
  /** Masked email, for "Signed in as d•••@example.com". */
  em: string;
  /** Whether Auth0 says the email is confirmed. */
  ev: boolean;
  /** How they signed in. */
  m: SignInMethod;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** "dana@example.com" -> "d•••@example.com". Keeps the domain so people can spot a typo. */
export function maskEmail(email: string | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

export function methodFromSubject(sub: string): SignInMethod {
  const strategy = sub.split('|', 1)[0];
  if (strategy === 'google-oauth2') return 'google';
  if (strategy === 'apple') return 'apple';
  return 'email';
}

export async function readSession(
  request: Request,
  config: AppConfig,
): Promise<SessionData | null> {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return null;
  const session = await unseal<SessionData>(value, config.sessionSecret, 'session');
  // Anything unexpected in a cookie that decrypted is still treated as signed out.
  if (!session || typeof session.at !== 'string' || typeof session.iat !== 'number') return null;
  if (nowSeconds() - session.iat > config.sessionMaxAgeSeconds) return null;
  return session;
}

export async function sessionCookie(session: SessionData, config: AppConfig): Promise<string> {
  const value = await seal(session, config.sessionSecret, 'session');
  if (value.length > MAX_COOKIE_BYTES) throw new Error('Session is too large for a cookie.');
  const remaining = Math.max(0, config.sessionMaxAgeSeconds - (nowSeconds() - session.iat));
  return setCookie(SESSION_COOKIE, value, { maxAge: remaining, sameSite: 'Lax' });
}

export function clearSessionCookie(): string {
  return clearCookie(SESSION_COOKIE, 'Lax');
}
