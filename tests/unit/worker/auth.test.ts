import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  beginLogin,
  connectionFor,
  freshSession,
  handleCallback,
  handleLinkGet,
  handleLoginGet,
  handleLoginPost,
  handleLogout,
  handleSession,
} from '../../../src/worker/auth.ts';
import { TRANSACTION_COOKIE } from '../../../src/worker/http.ts';
import { maskEmail, methodFromSubject, type SessionData } from '../../../src/worker/session.ts';
import { ORIGIN, cookieHeader, setCookies, testConfig } from '../helpers.ts';

const config = testConfig();
const ISSUER = config.auth0IssuerBaseUrl;

let privateKey: CryptoKey;
let jwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function idToken(
  claims: Record<string, unknown>,
  overrides: { issuer?: string; audience?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? `${ISSUER}/`)
    .setAudience(overrides.audience ?? config.auth0ClientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

/** Stubs fetch as Auth0: the JWKS and the token endpoint. Returns the captured token requests. */
function fakeAuth0(
  tokenResponse: () => Promise<Record<string, unknown>> | Record<string, unknown>,
  status = 200,
  apiHandler?: (url: string, init?: RequestInit) => Response,
) {
  const calls: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`) {
        return Response.json({ keys: [jwk] });
      }
      if (url === `${ISSUER}/oauth/token`) {
        calls.push(new URLSearchParams(String(init?.body)));
        return Response.json(await tokenResponse(), { status });
      }
      if (apiHandler && url.startsWith(config.apiOrigin)) return apiHandler(url, init);
      return new Response('unexpected', { status: 500 });
    }),
  );
  return calls;
}

/** Starts a login and returns what the callback needs: state, nonce, and the tx cookie. */
async function startedLogin(returnTo = '/setup') {
  const request = new Request(`${ORIGIN}/auth/login`);
  const { url, cookie } = await beginLogin(request, config, { method: 'google', returnTo });
  const params = new URL(url).searchParams;
  return {
    state: params.get('state')!,
    nonce: params.get('nonce')!,
    cookie: cookieHeader([cookie]),
  };
}

describe('beginLogin', () => {
  it('builds an Auth0 authorize URL with PKCE S256, state, nonce, and the API audience', async () => {
    const request = new Request(`${ORIGIN}/auth/login`);
    const { url, cookie } = await beginLogin(request, config, {
      method: 'email',
      signup: true,
      loginHint: 'dana@example.com',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${ISSUER}/authorize`);
    const p = parsed.searchParams;
    expect(p.get('response_type')).toBe('code');
    expect(p.get('client_id')).toBe(config.auth0ClientId);
    expect(p.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback`);
    expect(p.get('audience')).toBe(config.auth0Audience);
    // No profile scope: Cairn never asks Google or Apple for a name or photo (D-16).
    expect(p.get('scope')).toBe('openid email offline_access');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toBeTruthy();
    expect(p.get('nonce')).toBeTruthy();
    expect(p.get('connection')).toBe('email');
    expect(p.get('screen_hint')).toBe('signup');
    expect(p.get('login_hint')).toBe('dana@example.com');
    // Never the client secret in a browser-visible URL.
    expect(url).not.toContain(config.auth0ClientSecret);
    expect(cookie).toMatch(/^__Host-cairn_tx=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('maps methods to Auth0 connections', () => {
    expect(connectionFor('google', config)).toBe('google-oauth2');
    expect(connectionFor('apple', config)).toBe('apple');
    expect(
      connectionFor(
        'email',
        testConfig({ AUTH0_EMAIL_CONNECTION: 'Username-Password-Authentication' }),
      ),
    ).toBe('Username-Password-Authentication');
  });
});

describe('GET /auth/login', () => {
  it('redirects to Auth0 and sets the transaction cookie', async () => {
    const response = await handleLoginGet(
      new Request(`${ORIGIN}/auth/login?method=apple&signup=1`),
      config,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toContain('connection=apple');
    expect(setCookies(response)[0]).toMatch(/^__Host-cairn_tx=/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('asks silently when told to', async () => {
    const response = await handleLoginGet(new Request(`${ORIGIN}/auth/login?silent=1`), config);
    expect(new URL(response.headers.get('Location')!).searchParams.get('prompt')).toBe('none');
  });

  it('rejects an unknown method', async () => {
    const response = await handleLoginGet(
      new Request(`${ORIGIN}/auth/login?method=facebook`),
      config,
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  const post = (
    body: unknown,
    headers: Record<string, string> = { Origin: ORIGIN, 'X-Cairn-Client': 'web' },
  ) => new Request(`${ORIGIN}/auth/login`, { method: 'POST', body: JSON.stringify(body), headers });

  it('returns the authorize URL with the typed email as login_hint', async () => {
    const response = await handleLoginPost(
      post({ method: 'email', login_hint: 'dana@example.com', signup: true }),
      config,
    );
    expect(response.status).toBe(200);
    const { authorize_url } = (await response.json()) as { authorize_url: string };
    expect(new URL(authorize_url).searchParams.get('login_hint')).toBe('dana@example.com');
  });

  it('refuses a cross-site request', async () => {
    const response = await handleLoginPost(
      post({ method: 'email' }, { Origin: 'https://evil.example', 'X-Cairn-Client': 'web' }),
      config,
    );
    expect(response.status).toBe(403);
    const noHeader = await handleLoginPost(post({ method: 'email' }, { Origin: ORIGIN }), config);
    expect(noHeader.status).toBe(403);
  });

  it('rejects a malformed email without echoing it', async () => {
    const response = await handleLoginPost(
      post({ method: 'email', login_hint: 'dana@example' }),
      config,
    );
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain('dana@example');
  });

  it('rejects a body that is not JSON', async () => {
    const request = new Request(`${ORIGIN}/auth/login`, {
      method: 'POST',
      body: 'nope',
      headers: { Origin: ORIGIN, 'X-Cairn-Client': 'web' },
    });
    expect((await handleLoginPost(request, config)).status).toBe(400);
  });
});

describe('GET /auth/callback', () => {
  it('exchanges the code, verifies the ID token, and starts a session', async () => {
    const { state, nonce, cookie } = await startedLogin('/setup/privacy');
    const calls = fakeAuth0(async () => ({
      access_token: 'access-token-1',
      refresh_token: 'refresh-token-1',
      expires_in: 600,
      id_token: await idToken({
        sub: 'google-oauth2|123',
        nonce,
        email: 'dana@example.com',
        email_verified: true,
        given_name: 'Dana',
      }),
    }));

    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      config,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/setup/privacy');
    const cookies = setCookies(response);
    expect(cookies.some((c) => c.startsWith(`${TRANSACTION_COOKIE}=;`))).toBe(true);
    const session = cookies.find((c) => c.startsWith('__Host-cairn_session='));
    expect(session).toBeDefined();
    expect(session).toContain('HttpOnly');
    // The token is sealed, never readable in the cookie.
    expect(session).not.toContain('access-token-1');

    expect(calls[0]?.get('grant_type')).toBe('authorization_code');
    expect(calls[0]?.get('code')).toBe('abc');
    expect(calls[0]?.get('code_verifier')).toBeTruthy();
    expect(calls[0]?.get('client_secret')).toBe(config.auth0ClientSecret);

    const info = await handleSession(
      new Request(`${ORIGIN}/auth/session`, { headers: { Cookie: cookieHeader(cookies) } }),
      config,
    );
    expect(await info.json()).toEqual({
      authenticated: true,
      email: 'd•••@example.com',
      email_verified: true,
      method: 'google',
    });
  });

  it('refuses a state that does not match', async () => {
    const { cookie } = await startedLogin();
    fakeAuth0(() => ({}));
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=wrong`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(response.headers.get('Location')).toBe('/?signin_error=true');
    expect(setCookies(response).some((c) => c.startsWith('__Host-cairn_session='))).toBe(false);
  });

  it('refuses a callback without the transaction cookie', async () => {
    const { state } = await startedLogin();
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`),
      config,
    );
    expect(response.headers.get('Location')).toBe('/?signin_error=true');
  });

  it('refuses an ID token with the wrong nonce, issuer, or audience', async () => {
    for (const bad of [
      { nonce: 'other' },
      { issuer: 'https://evil.example/' },
      { audience: 'someone-else' },
    ]) {
      const { state, nonce, cookie } = await startedLogin();
      fakeAuth0(async () => ({
        access_token: 'a',
        id_token: await idToken(
          { sub: 'auth0|1', nonce: bad.nonce ?? nonce },
          {
            ...(bad.issuer ? { issuer: bad.issuer } : {}),
            ...(bad.audience ? { audience: bad.audience } : {}),
          },
        ),
      }));
      const response = await handleCallback(
        new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
          headers: { Cookie: cookie },
        }),
        config,
      );
      expect(response.headers.get('Location')).toBe('/?signin_error=true');
    }
  });

  it('fails safely when Auth0 refuses the code', async () => {
    const { state, cookie } = await startedLogin();
    fakeAuth0(() => ({ error: 'invalid_grant' }), 403);
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      config,
    );
    expect(response.headers.get('Location')).toBe('/?signin_error=true');
  });

  it('UC-REG-02/03: a cancelled Google or Apple sign-in returns to the welcome screen', async () => {
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?error=access_denied`),
      config,
    );
    expect(response.headers.get('Location')).toBe('/?oauth_cancelled=true');
  });

  it('a failed silent check asks interactively, keeping where to return', async () => {
    const { cookie } = await startedLogin('/setup/verify');
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?error=login_required`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(response.headers.get('Location')).toBe('/auth/login?returnTo=%2Fsetup%2Fverify');
  });

  it('any other error goes to the welcome screen with a message', async () => {
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?error=server_error`),
      config,
    );
    expect(response.headers.get('Location')).toBe('/?signin_error=true');
  });

  it('keeps no name from the provider, even if one is in the ID token', async () => {
    const { state, nonce, cookie } = await startedLogin();
    fakeAuth0(async () => ({
      access_token: 'a',
      id_token: await idToken({
        sub: 'email|1',
        nonce,
        email: 'dana@example.com',
        name: 'dana@example.com',
      }),
    }));
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      config,
    );
    const info = await handleSession(
      new Request(`${ORIGIN}/auth/session`, {
        headers: { Cookie: cookieHeader(setCookies(response)) },
      }),
      config,
    );
    const body = (await info.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ method: 'email', email_verified: false });
    expect(JSON.stringify(body)).not.toContain('dana@example.com');
    expect(body).not.toHaveProperty('name_from_provider');
  });
});

describe('freshSession', () => {
  const base: SessionData = {
    v: 1,
    at: 'old',
    rt: 'refresh-1',
    ate: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    sub: 'auth0|1',
    em: 'd•••@example.com',
    ev: true,
    m: 'email',
  };

  it('keeps a token that is still good', async () => {
    expect(await freshSession(base, config)).toEqual({ session: base, changed: false });
  });

  it('refreshes an expiring token and stores the rotated refresh token', async () => {
    const calls = fakeAuth0(() => ({
      access_token: 'new',
      refresh_token: 'refresh-2',
      expires_in: 600,
    }));
    const result = await freshSession({ ...base, ate: 0 }, config);
    expect(calls[0]?.get('grant_type')).toBe('refresh_token');
    expect(result?.changed).toBe(true);
    expect(result?.session.at).toBe('new');
    expect(result?.session.rt).toBe('refresh-2');
  });

  it('ends the session when there is no refresh token or it is refused', async () => {
    const { rt: _rt, ...noRefresh } = base;
    expect(await freshSession({ ...noRefresh, ate: 0 }, config)).toBeNull();
    fakeAuth0(() => ({ error: 'invalid_grant' }), 403);
    expect(await freshSession({ ...base, ate: 0 }, config)).toBeNull();
  });
});

describe('POST /auth/logout', () => {
  it('clears the session and returns the Auth0 logout URL', async () => {
    const request = new Request(`${ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'X-Cairn-Client': 'web' },
    });
    const response = await handleLogout(request, config, () => undefined);
    expect(response.status).toBe(200);
    const { logout_url } = (await response.json()) as { logout_url: string };
    const url = new URL(logout_url);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/v2/logout`);
    expect(url.searchParams.get('returnTo')).toBe(`${ORIGIN}/signed-out`);
    expect(setCookies(response)[0]).toMatch(/^__Host-cairn_session=; .*Max-Age=0/);
  });

  it('comes back to the timed-out message after an inactivity sign-out', async () => {
    const request = new Request(`${ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'X-Cairn-Client': 'web', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'timeout' }),
    });
    const { logout_url } = (await (
      await handleLogout(request, config, () => undefined)
    ).json()) as {
      logout_url: string;
    };
    expect(new URL(logout_url).searchParams.get('returnTo')).toBe(
      `${ORIGIN}/signed-out?reason=timeout`,
    );
  });

  it('tells the API the person signed out (UC-REG-19)', async () => {
    const { state, nonce, cookie } = await startedLogin();
    const apiCalls: string[] = [];
    fakeAuth0(
      async () => ({
        access_token: 'at-1',
        expires_in: 600,
        id_token: await idToken({ sub: 'email|1', nonce }),
      }),
      200,
      (url, init) => {
        apiCalls.push(
          `${init?.method ?? 'GET'} ${url} ${new Headers(init?.headers).get('Authorization') ?? ''}`,
        );
        return Response.json({ message: 'Signed out.' });
      },
    );
    const signedIn = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      config,
    );
    const pending: Promise<unknown>[] = [];
    await handleLogout(
      new Request(`${ORIGIN}/auth/logout`, {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'X-Cairn-Client': 'web',
          Cookie: cookieHeader(setCookies(signedIn)),
        },
      }),
      config,
      (p) => pending.push(p),
    );
    await Promise.all(pending);
    expect(apiCalls).toContain(`POST ${config.apiOrigin}/v1/me/sign-out Bearer at-1`);
  });

  it('refuses a cross-site logout', async () => {
    const request = new Request(`${ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect((await handleLogout(request, config, () => undefined)).status).toBe(403);
  });
});

describe('GET /auth/link (UC-REG-05)', () => {
  async function signedInCookie(): Promise<string> {
    const { state, nonce, cookie } = await startedLogin();
    fakeAuth0(async () => ({
      access_token: 'original',
      expires_in: 600,
      id_token: await idToken({ sub: 'email|1', nonce }),
    }));
    const response = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=abc&state=${state}`, {
        headers: { Cookie: cookie },
      }),
      config,
    );
    return cookieHeader(setCookies(response));
  }

  it('needs a signed-in session', async () => {
    const response = await handleLinkGet(new Request(`${ORIGIN}/auth/link?method=apple`), config);
    expect(response.headers.get('Location')).toBe('/auth/login?returnTo=%2Fsettings%2Fsign-in');
  });

  it('signs in with the new method, then hands its token to the API, keeping the session', async () => {
    const session = await signedInCookie();
    const start = await handleLinkGet(
      new Request(`${ORIGIN}/auth/link?method=apple`, { headers: { Cookie: session } }),
      config,
    );
    const authorize = new URL(start.headers.get('Location')!);
    expect(authorize.searchParams.get('connection')).toBe('apple');
    expect(authorize.searchParams.get('prompt')).toBe('login');
    const txCookie = cookieHeader(setCookies(start));
    const linked: { auth: string | null; body: unknown }[] = [];
    fakeAuth0(
      async () => ({
        access_token: 'second',
        expires_in: 600,
        id_token: await idToken({ sub: 'apple|9', nonce: authorize.searchParams.get('nonce') }),
      }),
      200,
      (url, init) => {
        expect(url).toBe(`${config.apiOrigin}/v1/me/sign-in-methods`);
        linked.push({
          auth: new Headers(init?.headers).get('Authorization'),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({ result: 'linked', message: 'Done.' });
      },
    );
    const done = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=xyz&state=${authorize.searchParams.get('state')}`, {
        headers: { Cookie: `${session}; ${txCookie}` },
      }),
      config,
    );
    expect(done.headers.get('Location')).toBe('/settings/sign-in?link=linked');
    expect(linked).toEqual([{ auth: 'Bearer original', body: { access_token: 'second' } }]);
    // The original session is kept: no new session cookie for the second sign-in.
    expect(
      setCookies(done).some(
        (c) => c.startsWith('__Host-cairn_session=') && !c.startsWith('__Host-cairn_session=;'),
      ),
    ).toBe(false);
  });

  it('reports a refusal by its code', async () => {
    const session = await signedInCookie();
    const start = await handleLinkGet(
      new Request(`${ORIGIN}/auth/link?method=google`, { headers: { Cookie: session } }),
      config,
    );
    const authorize = new URL(start.headers.get('Location')!);
    fakeAuth0(
      async () => ({
        access_token: 'second',
        id_token: await idToken({
          sub: 'google-oauth2|9',
          nonce: authorize.searchParams.get('nonce'),
        }),
      }),
      200,
      () => Response.json({ code: 'sign_in_in_use', detail: 'x' }, { status: 409 }),
    );
    const done = await handleCallback(
      new Request(`${ORIGIN}/auth/callback?code=xyz&state=${authorize.searchParams.get('state')}`, {
        headers: { Cookie: `${session}; ${cookieHeader(setCookies(start))}` },
      }),
      config,
    );
    expect(done.headers.get('Location')).toBe('/settings/sign-in?link=sign_in_in_use');
  });
});

describe('session helpers', () => {
  it('masks emails, keeping the domain', () => {
    expect(maskEmail('dana@example.com')).toBe('d•••@example.com');
    expect(maskEmail('x')).toBe('•••');
    expect(maskEmail(undefined)).toBe('');
  });

  it('reads the sign-in method from the Auth0 subject', () => {
    expect(methodFromSubject('google-oauth2|1')).toBe('google');
    expect(methodFromSubject('apple|1')).toBe('apple');
    expect(methodFromSubject('email|1')).toBe('email');
    expect(methodFromSubject('auth0|1')).toBe('email');
  });

  it('reports signed out without a cookie', async () => {
    const response = await handleSession(new Request(`${ORIGIN}/auth/session`), config);
    expect(await response.json()).toEqual({ authenticated: false });
  });
});
