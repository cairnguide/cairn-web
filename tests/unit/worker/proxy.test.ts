import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../../src/worker/proxy.ts';
import { sessionCookie, type SessionData } from '../../../src/worker/session.ts';
import { ORIGIN, cookieHeader, setCookies, testConfig } from '../helpers.ts';

const config = testConfig();

function session(overrides: Partial<SessionData> = {}): SessionData {
  const now = Math.floor(Date.now() / 1000);
  return {
    v: 1,
    at: 'token-abc',
    rt: 'refresh-1',
    ate: now + 600,
    iat: now,
    sub: 'auth0|1',
    em: 'd•••@example.com',
    ev: true,
    m: 'email',
    ...overrides,
  };
}

async function signedInCookie(overrides: Partial<SessionData> = {}): Promise<string> {
  return cookieHeader([await sessionCookie(session(overrides), config)]);
}

interface Captured {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function fakeApi(response: Response | (() => Response) = Response.json({ ok: true })) {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        return Response.json({
          access_token: 'token-refreshed',
          refresh_token: 'refresh-2',
          expires_in: 600,
        });
      }
      calls.push({
        url,
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : '',
      });
      return typeof response === 'function' ? response() : response.clone();
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const writeHeaders = (cookie: string) => ({
  Cookie: cookie,
  Origin: ORIGIN,
  'X-Cairn-Client': 'web',
  'Content-Type': 'application/json',
});

describe('API proxy', () => {
  it('serves public endpoints without a session and without a token', async () => {
    const calls = fakeApi();
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/welcome?oauth_cancelled=true`),
      config,
    );
    expect(response.status).toBe(200);
    expect(calls[0]?.url).toBe('https://api.cairn.test/v1/welcome?oauth_cancelled=true');
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('refuses private endpoints without a session', async () => {
    const calls = fakeApi();
    const response = await handleApi(new Request(`${ORIGIN}/api/v1/onboarding`), config);
    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(calls).toHaveLength(0);
  });

  it('adds the access token and forwards only allowed headers', async () => {
    const calls = fakeApi();
    const cookie = await signedInCookie();
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/onboarding/preferred-name`, {
        method: 'PUT',
        headers: { ...writeHeaders(cookie), 'X-Forwarded-For': '1.2.3.4' },
        body: JSON.stringify({ preferred_name: 'Dana' }),
      }),
      config,
    );
    expect(response.status).toBe(200);
    const call = calls[0]!;
    expect(call.url).toBe('https://api.cairn.test/v1/onboarding/preferred-name');
    expect(call.method).toBe('PUT');
    expect(call.headers.get('Authorization')).toBe('Bearer token-abc');
    expect(call.headers.get('Content-Type')).toBe('application/json');
    expect(call.headers.get('Cookie')).toBeNull();
    expect(call.headers.get('X-Forwarded-For')).toBeNull();
    expect(call.headers.get('X-Cairn-Client')).toBeNull();
    expect(call.body).toBe('{"preferred_name":"Dana"}');
  });

  it('refuses a cross-site write even with a valid session', async () => {
    const calls = fakeApi();
    const cookie = await signedInCookie();
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/registrations`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'https://evil.example', 'X-Cairn-Client': 'web' },
        body: '{}',
      }),
      config,
    );
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('refreshes an expiring token and re-issues the cookie', async () => {
    const calls = fakeApi();
    const cookie = await signedInCookie({ ate: 0 });
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(response.status).toBe(200);
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer token-refreshed');
    expect(setCookies(response)[0]).toMatch(/^__Host-cairn_session=/);
  });

  it('never passes API cookies back to the browser and marks responses no-store', async () => {
    fakeApi(
      new Response('{}', {
        headers: { 'Set-Cookie': 'tracking=1', 'Content-Type': 'application/json' },
      }),
    );
    const cookie = await signedInCookie();
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(setCookies(response)).toEqual([]);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('passes API problem details through, and ends the session on an API 401', async () => {
    fakeApi(() =>
      Response.json(
        { code: 'invalid_token', detail: 'Please sign in again.', status: 401 },
        { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    );
    const cookie = await signedInCookie();
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'invalid_token' });
    expect(setCookies(response)[0]).toMatch(/Max-Age=0/);
  });

  it('reports an unreachable API without detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.1'))),
    );
    const response = await handleApi(new Request(`${ORIGIN}/api/v1/welcome`), config);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('ECONNREFUSED');
  });

  it.each(['/api/v2/welcome', '/api/v1/../admin', '/api/other'])('refuses %s', async (path) => {
    fakeApi();
    const response = await handleApi(new Request(`${ORIGIN}${path}`), config);
    expect(response.status).toBe(404);
  });

  it('refuses unusual methods and oversized bodies', async () => {
    fakeApi();
    const cookie = await signedInCookie();
    const options = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, { method: 'OPTIONS' }),
      config,
    );
    expect(options.status).toBe(405);
    const big = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, {
        method: 'PATCH',
        headers: writeHeaders(cookie),
        body: 'x'.repeat(70_000),
      }),
      config,
    );
    expect(big.status).toBe(413);
  });

  it('treats an expired session as signed out', async () => {
    fakeApi();
    const cookie = await signedInCookie({ iat: 0 });
    const response = await handleApi(
      new Request(`${ORIGIN}/api/v1/me`, { headers: { Cookie: cookie } }),
      config,
    );
    expect(response.status).toBe(401);
  });
});
