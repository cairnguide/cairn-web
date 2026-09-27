import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CLIENT_ID, api, request } from '../../../src/client/api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const mock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('api client', () => {
  it('identifies the web client on consent records', () => {
    expect(CLIENT_ID).toMatch(/^web\/\d+\.\d+\.\d+$/);
    expect(CLIENT_ID).toMatch(/^[A-Za-z0-9 ._/()+-]+$/); // AcknowledgmentIn.client pattern
  });

  it('calls the same-origin proxy with the CSRF header and JSON body', async () => {
    const mock = stubFetch(Response.json({ ok: true }));
    await api.post('/v1/registrations', { time_zone: 'America/New_York' });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/registrations');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-Cairn-Client']).toBe('web');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"time_zone":"America/New_York"}');
  });

  it('turns problem details into an ApiError', async () => {
    stubFetch(
      Response.json(
        { code: 'account_exists', detail: 'It looks like...', sign_in_method: 'google' },
        { status: 409 },
      ),
    );
    const error = await api.get('/v1/onboarding').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).problem.sign_in_method).toBe('google');
  });

  it('gives a calm message when the network or response is broken', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const network = (await request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(network.problem.code).toBe('network_error');
    expect(network.problem.detail).toContain('Your information was not changed');

    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const html = (await request('GET', '/x').catch((e: unknown) => e)) as ApiError;
    expect(html.problem.code).toBe('unexpected_response');
  });

  it('handles 204 No Content', async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect(await api.put('/v1/x', {})).toBeUndefined();
  });
});
