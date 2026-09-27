import { describe, expect, it } from 'vitest';
import { decodeBase64, validateEnv } from '../../../src/shared/env.ts';
import { testEnv } from '../helpers.ts';

describe('validateEnv', () => {
  it('accepts a complete environment and applies defaults', () => {
    const env = testEnv();
    delete env.CAIRN_API_TIMEOUT_MS;
    delete env.AUTH0_EMAIL_MODE;
    delete env.AUTH0_EMAIL_CONNECTION;
    const result = validateEnv(env);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.apiTimeoutMs).toBe(15000);
    expect(result.config.emailMode).toBe('passwordless');
    expect(result.config.auth0EmailConnection).toBe('email');
  });

  it('lists every missing required variable by name, never by value', () => {
    const result = validateEnv({
      ENVIRONMENT: 'production',
      AUTH0_CLIENT_SECRET: 'super-secret-value',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.errors.join('\n');
    for (const name of [
      'CAIRN_API_ORIGIN',
      'AUTH0_ISSUER_BASE_URL',
      'SESSION_SECRET',
      'TERMS_URL',
    ]) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('super-secret-value');
  });

  it('requires https outside local development', () => {
    const result = validateEnv(
      testEnv({ ENVIRONMENT: 'production', CAIRN_API_ORIGIN: 'http://api.cairn.test' }),
    );
    expect(result.ok).toBe(false);
  });

  it('allows http://localhost in development and test only', () => {
    expect(validateEnv(testEnv({ CAIRN_API_ORIGIN: 'http://localhost:8000' })).ok).toBe(true);
    expect(
      validateEnv(testEnv({ ENVIRONMENT: 'preview', CAIRN_API_ORIGIN: 'http://localhost:8000' }))
        .ok,
    ).toBe(false);
  });

  it('rejects origins with a path, query, or credentials', () => {
    expect(validateEnv(testEnv({ CAIRN_API_ORIGIN: 'https://api.cairn.test/v1' })).ok).toBe(false);
    expect(
      validateEnv(testEnv({ AUTH0_ISSUER_BASE_URL: 'https://user:pw@tenant.auth0.test' })).ok,
    ).toBe(false);
  });

  it('rejects a short or non-base64 session secret', () => {
    expect(validateEnv(testEnv({ SESSION_SECRET: 'c2hvcnQ=' })).ok).toBe(false);
    expect(validateEnv(testEnv({ SESSION_SECRET: 'not base64 at all!' })).ok).toBe(false);
  });

  it('refuses placeholder secrets in production', () => {
    const result = validateEnv(
      testEnv({ ENVIRONMENT: 'production', AUTH0_CLIENT_SECRET: 'replace-with-client-secret' }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects unknown modes and out-of-range numbers', () => {
    expect(validateEnv(testEnv({ AUTH0_EMAIL_MODE: 'sms' })).ok).toBe(false);
    expect(validateEnv(testEnv({ ENVIRONMENT: 'staging' })).ok).toBe(false);
    expect(validateEnv(testEnv({ SESSION_MAX_AGE_SECONDS: '10' })).ok).toBe(false);
    expect(validateEnv(testEnv({ CAIRN_API_TIMEOUT_MS: 'soon' })).ok).toBe(false);
    expect(validateEnv(testEnv({ AUTH0_EMAIL_CONNECTION: 'bad connection' })).ok).toBe(false);
  });
});

describe('decodeBase64', () => {
  it('decodes standard and URL-safe base64', () => {
    expect(Array.from(decodeBase64('AQID') ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(decodeBase64('-_8') ?? [])).toEqual([251, 255]);
  });

  it('returns null for anything else', () => {
    expect(decodeBase64('%%%')).toBeNull();
  });
});
