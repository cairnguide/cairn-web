import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../../../src/worker/index.ts';
import { sessionCookie } from '../../../src/worker/session.ts';
import { ORIGIN, cookieHeader, testConfig, testEnv } from '../helpers.ts';

function env(overrides: Record<string, string> = {}): Env {
  return {
    ...testEnv(overrides),
    ASSETS: {
      fetch: vi.fn(
        async () =>
          new Response('<!doctype html><title>Cairn</title>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    },
  };
}

const ctx = { waitUntil: () => undefined };

describe('Worker routing', () => {
  it('serves public config without secrets', async () => {
    const response = await worker.fetch(new Request(`${ORIGIN}/config.json`), env(), ctx);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      privacy_policy_url: 'https://cairn.test/privacy',
      terms_url: 'https://cairn.test/terms',
      support_url: 'https://cairn.test/support',
      site_url: 'https://cairn.test/',
      email_mode: 'passwordless',
      environment: 'test',
    });
    for (const secret of ['client-secret-xyz', testEnv().SESSION_SECRET!])
      expect(body).not.toContain(secret);
  });

  it('sends a signed-out visitor to sign-in before any protected page is served', async () => {
    const e = env();
    const response = await worker.fetch(new Request(`${ORIGIN}/setup/privacy`), e, ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/auth/login?returnTo=%2Fsetup%2Fprivacy');
    expect(e.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('serves protected pages with a session, with security headers and no caching', async () => {
    const config = testConfig();
    const now = Math.floor(Date.now() / 1000);
    const cookie = cookieHeader([
      await sessionCookie(
        { v: 1, at: 't', ate: now + 600, iat: now, sub: 'auth0|1', em: '', ev: true, m: 'email' },
        config,
      ),
    ]);
    const response = await worker.fetch(
      new Request(`${ORIGIN}/setup/privacy`, { headers: { Cookie: cookie } }),
      env(),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('refuses to run with a broken configuration, naming nothing secret', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request(`${ORIGIN}/config.json`),
      env({ SESSION_SECRET: '' }),
      ctx,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('988');
    expect(errors.mock.calls[0]?.[0]).toContain('SESSION_SECRET');
  });

  it('answers unknown /auth paths and wrong methods', async () => {
    expect((await worker.fetch(new Request(`${ORIGIN}/auth/nope`), env(), ctx)).status).toBe(404);
    expect(
      (await worker.fetch(new Request(`${ORIGIN}/auth/login`, { method: 'DELETE' }), env(), ctx))
        .status,
    ).toBe(405);
    expect(
      (await worker.fetch(new Request(`${ORIGIN}/config.json`, { method: 'POST' }), env(), ctx))
        .status,
    ).toBe(405);
    expect(
      (await worker.fetch(new Request(`${ORIGIN}/setup`, { method: 'POST' }), env(), ctx)).status,
    ).toBe(405);
  });

  it('routes /auth/session and /api', async () => {
    const session = await worker.fetch(new Request(`${ORIGIN}/auth/session`), env(), ctx);
    expect(await session.json()).toEqual({ authenticated: false });
    const api = await worker.fetch(new Request(`${ORIGIN}/api/v1/me`), env(), ctx);
    expect(api.status).toBe(401);
  });

  it('hides unexpected errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const e = env();
    e.ASSETS.fetch = vi.fn(() => Promise.reject(new Error('secret detail')));
    const response = await worker.fetch(new Request(`${ORIGIN}/other`), e, ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret detail');
    expect(errors.mock.calls[0]?.[0]).not.toContain('secret detail');
  });
});
