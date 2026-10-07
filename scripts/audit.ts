/**
 * npm audit, failing on any high or critical advisory that isn't allowed in
 * .github/audit-allowlist.json. Used by CI (security workflow) and `npm run audit`.
 *
 * An allowed advisory needs a reason, a tracking issue, and a review_by date.
 * The check also fails when an entry is past its review_by date, or when npm
 * audit no longer reports it (a fix landed, so the entry should come out).
 *
 *   node scripts/audit.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Allowed {
  id: string;
  package: string;
  reason: string;
  issue: string;
  review_by: string;
}

interface Via {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
}

interface Report {
  vulnerabilities?: Record<string, { via: (Via | string)[] }>;
}

const BLOCKING = new Set(['high', 'critical']);

export function advisoryId(url: string | undefined): string | null {
  const match = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(url ?? '');
  return match ? match[0] : null;
}

/** The blocking advisories in an npm audit --json report, by id. */
export function blockingAdvisories(report: Report): Map<string, Via> {
  const found = new Map<string, Via>();
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      if (typeof via === 'string' || !BLOCKING.has(via.severity ?? '')) continue;
      const id = advisoryId(via.url) ?? `npm-${String(via.source)}`;
      found.set(id, via);
    }
  }
  return found;
}

/** Problems that should fail the check. Empty means it passes. */
export function check(report: Report, allowed: Allowed[], today: string): string[] {
  const problems: string[] = [];
  const found = blockingAdvisories(report);
  const allowedIds = new Map(allowed.map((a) => [a.id, a]));
  for (const [id, via] of found) {
    if (!allowedIds.has(id)) {
      problems.push(
        `${id} (${via.name ?? '?'}, ${via.severity ?? '?'}): ${via.title ?? ''} ${via.url ?? ''}`,
      );
    }
  }
  for (const entry of allowed) {
    if (!entry.reason || !entry.issue || !/^\d{4}-\d{2}-\d{2}$/.test(entry.review_by)) {
      problems.push(
        `${entry.id}: allowlist entries need a reason, an issue, and a review_by date.`,
      );
    } else if (entry.review_by < today) {
      problems.push(
        `${entry.id}: allowed until ${entry.review_by}. Look at it again (${entry.issue}).`,
      );
    }
    if (!found.has(entry.id)) {
      problems.push(
        `${entry.id}: no longer reported by npm audit. Remove it from the allowlist and close ${entry.issue}.`,
      );
    }
  }
  return problems;
}

function main(): void {
  let raw: string;
  try {
    raw = execFileSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // npm audit exits non-zero when it finds anything. Its JSON is still on stdout.
    raw = String((error as { stdout?: unknown }).stdout ?? '');
  }
  const report = JSON.parse(raw) as Report;
  const allowlist = JSON.parse(readFileSync(resolve('.github/audit-allowlist.json'), 'utf8')) as {
    advisories: Allowed[];
  };
  const today = new Date().toISOString().slice(0, 10);
  const problems = check(report, allowlist.advisories, today);
  for (const entry of allowlist.advisories) {
    if (blockingAdvisories(report).has(entry.id)) {
      console.log(
        `Allowed: ${entry.id} (${entry.package}) until ${entry.review_by}. Tracked in ${entry.issue}.`,
      );
    }
  }
  if (problems.length > 0) {
    console.error('npm audit found problems:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log('npm audit: no high or critical advisories beyond the allowlist.');
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) main();
