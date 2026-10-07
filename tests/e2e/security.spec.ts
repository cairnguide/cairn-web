/**
 * Authentication is required for every account page, tokens never reach the
 * page, and the security headers and CSP hold in a real browser.
 */
import { expect, mockLog, signUpWithGoogle, test } from './fixtures.ts';

test.describe('authentication required', () => {
  for (const path of ['/setup', '/setup/privacy', '/setup/done', '/cases/new']) {
    test(`${path} is refused at the edge without a session`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(response.headers().location).toBe(`/auth/login?returnTo=${encodeURIComponent(path)}`);
    });
  }

  test('a signed-out visitor who opens a setup page is sent through sign-in and back', async ({
    page,
  }) => {
    await page.goto('/setup/privacy');
    // The mock signs in without a prompt. The real Auth0 shows its login page here.
    await expect(page).toHaveURL(/\/setup\/privacy$/);
  });

  test('the API proxy refuses private calls without a session', async ({ request }) => {
    const response = await request.get('/api/v1/onboarding');
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toBe('application/problem+json');
  });

  test('the API proxy refuses cross-site writes', async ({ request }) => {
    const response = await request.post('/api/v1/registrations', {
      data: {},
      headers: { Origin: 'https://evil.example', 'X-Cairn-Client': 'web' },
    });
    expect(response.status()).toBe(403);
  });

  test('open redirects through returnTo are refused', async ({ page }) => {
    await page.goto('/auth/login?returnTo=https://evil.example');
    await expect(page).toHaveURL(/localhost:8787\/setup\/adult$/);
  });
});

test.describe('session and tokens', () => {
  test('the session cookie is HttpOnly, Secure, host-only, and holds no readable token', async ({
    page,
    context,
  }) => {
    await signUpWithGoogle(page);
    const cookie = (await context.cookies()).find((c) => c.name === '__Host-cairn_session');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.value).not.toMatch(/^at_|eyJ/);

    // Nothing in page JavaScript can see a cookie or token.
    expect(await page.evaluate(() => document.cookie)).toBe('');
    const session = await page.evaluate(async () => (await fetch('/auth/session')).text());
    expect(session).not.toMatch(/at_|rt_|eyJ/);
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toMatch(/at_|rt_|eyJ|dana@example\.com/);
  });

  test('the Worker, not the browser, adds the access token to API calls', async ({ page }) => {
    await signUpWithGoogle(page);
    const { api } = await mockLog();
    const registration = api.find((c) => c.path === '/v1/registrations');
    expect(registration?.authorized).toBe(true);
    // Only the time zone: no name or photo from the provider is ever sent (D-16).
    expect(Object.keys(registration?.body ?? {})).toEqual(['time_zone']);
  });
});

test.describe('headers', () => {
  test('static pages and Worker responses carry the security headers', async ({ request }) => {
    for (const path of ['/', '/config.json', '/auth/session']) {
      const headers = (await request.get(path)).headers();
      expect(headers['content-security-policy']).toContain("default-src 'none'");
      expect(headers['content-security-policy']).toContain("require-trusted-types-for 'script'");
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['strict-transport-security']).toContain('max-age=31536000');
    }
  });

  test('config.json exposes no secrets', async ({ request }) => {
    const text = await (await request.get('/config.json')).text();
    expect(text).not.toContain('e2e-not-a-secret');
    expect(text).not.toContain('AAAAAAAA');
  });
});
