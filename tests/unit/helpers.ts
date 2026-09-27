import { validateEnv, type AppConfig } from '../../src/shared/env.ts';

/** A complete, valid environment for tests. The secret is 32 zero bytes, base64 encoded. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ENVIRONMENT: 'test',
    CAIRN_API_ORIGIN: 'https://api.cairn.test',
    CAIRN_API_TIMEOUT_MS: '5000',
    AUTH0_ISSUER_BASE_URL: 'https://tenant.auth0.test',
    AUTH0_CLIENT_ID: 'client-123',
    AUTH0_CLIENT_SECRET: 'client-secret-xyz',
    AUTH0_AUDIENCE: 'https://api.cairn.test',
    AUTH0_EMAIL_CONNECTION: 'email',
    AUTH0_EMAIL_MODE: 'passwordless',
    SESSION_SECRET: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    SESSION_MAX_AGE_SECONDS: '3600',
    PRIVACY_POLICY_URL: 'https://cairn.test/privacy',
    TERMS_URL: 'https://cairn.test/terms',
    SUPPORT_URL: 'https://cairn.test/support',
    SITE_URL: 'https://cairn.test',
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  const result = validateEnv(testEnv(overrides));
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.config;
}

export const ORIGIN = 'https://app.cairn.test';

/** Collects every Set-Cookie header value. */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** Turns Set-Cookie values into a Cookie request header. */
export function cookieHeader(values: string[]): string {
  return values
    .map((v) => v.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}
