import { describe, expect, it } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  pkceChallenge,
  randomToken,
  seal,
  unseal,
} from '../../../src/worker/crypto.ts';
import { testEnv } from '../helpers.ts';

const SECRET = testEnv().SESSION_SECRET!;
const OTHER_SECRET = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';

describe('base64url', () => {
  it('round-trips bytes without padding or unsafe characters', () => {
    const bytes = new Uint8Array([251, 255, 0, 1, 2]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(base64UrlDecode(encoded) ?? [])).toEqual(Array.from(bytes));
  });

  it('rejects standard base64 characters', () => {
    expect(base64UrlDecode('ab+/')).toBeNull();
  });
});

describe('randomToken', () => {
  it('is unique and URL-safe', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B example', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('seal / unseal', () => {
  it('round-trips a payload', async () => {
    const sealed = await seal({ a: 1, b: 'two' }, SECRET, 'session');
    expect(sealed).not.toContain('two');
    expect(await unseal(sealed, SECRET, 'session')).toEqual({ a: 1, b: 'two' });
  });

  it('uses a fresh IV every time', async () => {
    expect(await seal({ a: 1 }, SECRET, 'session')).not.toBe(
      await seal({ a: 1 }, SECRET, 'session'),
    );
  });

  it('rejects tampering', async () => {
    const sealed = await seal({ a: 1 }, SECRET, 'session');
    const last = sealed.at(-1) === 'A' ? 'B' : 'A';
    expect(await unseal(sealed.slice(0, -1) + last, SECRET, 'session')).toBeNull();
  });

  it('rejects another purpose or another secret', async () => {
    const sealed = await seal({ a: 1 }, SECRET, 'transaction');
    expect(await unseal(sealed, SECRET, 'session')).toBeNull();
    expect(await unseal(sealed, OTHER_SECRET, 'transaction')).toBeNull();
  });

  it('rejects junk', async () => {
    expect(await unseal('not-a-sealed-value', SECRET, 'session')).toBeNull();
    expect(await unseal('', SECRET, 'session')).toBeNull();
  });
});
