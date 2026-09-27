import { describe, expect, it } from 'vitest';
import { isProtectedPath, safeReturnTo } from '../../../src/shared/paths.ts';

describe('isProtectedPath', () => {
  it.each(['/setup', '/setup/privacy', '/cases/new', '/settings'])('%s needs a session', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(['/', '/signup/email', '/moment', '/setupx', '/assets/index.js'])(
    '%s is public',
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe('safeReturnTo (open redirect protection)', () => {
  it('keeps protected same-site paths', () => {
    expect(safeReturnTo('/setup/voice')).toBe('/setup/voice');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%2F%2Fevil.example',
    '/setup?x=https://evil.example',
    'javascript:alert(1)',
    '/signup/email',
    `/setup/${'a'.repeat(300)}`,
  ])('falls back to /setup for %s', (value) => {
    expect(safeReturnTo(value)).toBe('/setup');
  });
});
