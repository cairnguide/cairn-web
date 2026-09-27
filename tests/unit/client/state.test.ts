// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type State = typeof import('../../../src/client/state.ts');
let state: State;
const assign = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign, href: 'http://localhost/' });
  state = await import('../../../src/client/state.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('state', () => {
  it('loads public config, keeping safe fallbacks for missing fields', async () => {
    stubFetch(() =>
      Response.json({ terms_url: 'https://cairn.test/terms', email_mode: 'password' }),
    );
    const config = await state.loadConfig();
    expect(config.terms_url).toBe('https://cairn.test/terms');
    expect(config.email_mode).toBe('password');
    expect(config.privacy_policy_url).toBe('/');
  });

  it('keeps fallbacks when config cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect((await state.loadConfig()).email_mode).toBe('passwordless');
  });

  it('loads the session summary, and treats errors as signed out', async () => {
    stubFetch(() => Response.json({ authenticated: true, email: 'd•••@example.com' }));
    expect((await state.loadSession()).authenticated).toBe(true);
    expect(state.getSession().email).toBe('d•••@example.com');
    stubFetch(() => new Response('nope', { status: 500 }));
    expect((await state.loadSession()).authenticated).toBe(false);
  });

  it('caches the onboarding response and fetches it when missing', async () => {
    const mock = stubFetch(() => Response.json({ screen: { id: 'trial_terms' } }));
    const first = await state.ensureOnboarding();
    await state.ensureOnboarding();
    expect(first.screen.id).toBe('trial_terms');
    expect(mock).toHaveBeenCalledTimes(1);
    state.setOnboarding(null);
    expect(state.getOnboarding()).toBeNull();
  });

  it('starts email sign-in by POST and follows only an http(s) URL', async () => {
    const mock = stubFetch(() =>
      Response.json({ authorize_url: 'https://tenant.auth0.test/authorize?x=1' }),
    );
    await state.startEmailLogin('dana@example.com');
    const [, init] = mock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      method: 'email',
      login_hint: 'dana@example.com',
      signup: true,
      returnTo: '/setup',
    });
    expect(assign).toHaveBeenCalledWith('https://tenant.auth0.test/authorize?x=1');

    stubFetch(() => Response.json({ authorize_url: 'javascript:alert(1)' }));
    await expect(state.startEmailLogin('dana@example.com')).rejects.toThrow();
  });

  it('signs out through the Worker, then Auth0', async () => {
    stubFetch(() => Response.json({ logout_url: 'https://tenant.auth0.test/v2/logout?x=1' }));
    await state.signOut();
    expect(state.getSession().authenticated).toBe(false);
    expect(assign).toHaveBeenCalledWith('https://tenant.auth0.test/v2/logout?x=1');
  });

  it('still leaves the app if Auth0 logout cannot be reached', async () => {
    stubFetch(() => new Response('{}', { status: 502 }));
    await state.signOut();
    expect(assign).toHaveBeenCalledWith('/');
  });
});
