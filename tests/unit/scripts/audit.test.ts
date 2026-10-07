import { describe, expect, it } from 'vitest';
import { advisoryId, check } from '../../../scripts/audit.ts';

const braces = {
  source: 1,
  name: 'braces',
  title: 'ReDoS',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  severity: 'high',
};
const report = { vulnerabilities: { braces: { via: [braces, 'micromatch'] } } };
const entry = {
  id: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  reason: 'No fixed release.',
  issue: 'https://github.com/cairnguide/cairn-web/issues/18',
  review_by: '2027-01-05',
};

describe('audit allowlist check', () => {
  it('reads the advisory id from its url', () => {
    expect(advisoryId(braces.url)).toBe('GHSA-vfj7-8cjw-p6xm');
    expect(advisoryId(undefined)).toBeNull();
  });

  it('fails on a blocking advisory that is not allowed', () => {
    expect(check(report, [], '2026-10-07')).toHaveLength(1);
  });

  it('passes an allowed advisory before its review date', () => {
    expect(check(report, [entry], '2026-10-07')).toEqual([]);
  });

  it('ignores moderate and low advisories', () => {
    const low = { vulnerabilities: { x: { via: [{ ...braces, severity: 'moderate' }] } } };
    expect(check(low, [], '2026-10-07')).toEqual([]);
  });

  it('fails once the review date has passed', () => {
    expect(check(report, [entry], '2027-01-06')[0]).toMatch(/allowed until 2027-01-05/);
  });

  it('fails when an entry is incomplete or no longer reported', () => {
    expect(check(report, [{ ...entry, issue: '' }], '2026-10-07')[0]).toMatch(/need a reason/);
    expect(check({}, [entry], '2026-10-07')[0]).toMatch(/no longer reported/);
  });
});
