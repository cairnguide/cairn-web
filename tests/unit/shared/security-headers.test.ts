import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHeadersFile } from '../../../scripts/check-headers.ts';
import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from '../../../src/shared/security-headers.ts';

describe('security headers', () => {
  it('public/_headers matches the headers the Worker sets', () => {
    expect(readFileSync('public/_headers', 'utf8')).toBe(renderHeadersFile());
  });

  it('keeps the CSP strict', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("require-trusted-types-for 'script'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:\/\//);
  });

  it('sets every header on a response, replacing weaker values', () => {
    const response = withSecurityHeaders(
      new Response('ok', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }),
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });
});
