/**
 * Keeps public/_headers (used by Workers Static Assets) identical to the
 * headers the Worker sets (src/shared/security-headers.ts).
 *
 *   npm run check:headers             fails if public/_headers is out of date
 *   npm run check:headers -- --write  rewrites public/_headers
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '../src/shared/security-headers.ts';

const FILE = new URL('../public/_headers', import.meta.url);

export function renderHeadersFile(): string {
  const lines = [
    '# Custom headers (Cloudflare Workers Static Assets)',
    '# https://developers.cloudflare.com/workers/static-assets/headers/',
    '#',
    '# Generated from src/shared/security-headers.ts. Do not edit by hand.',
    '# Regenerate with: npm run check:headers -- --write',
    '',
    '/*',
    ...Object.entries(SECURITY_HEADERS).map(([name, value]) => `  ${name}: ${value}`),
    '',
    '# The page shell changes with every deploy. Always check for a new one.',
    '/',
    '  Cache-Control: no-cache',
    '',
    '/index.html',
    '  Cache-Control: no-cache',
    '',
    '# Vite puts a content hash in every file name under /assets/, so they never change.',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ];
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const expected = renderHeadersFile();
  if (process.argv.includes('--write')) {
    writeFileSync(FILE, expected);
    console.log('public/_headers written.');
  } else {
    let actual = '';
    try {
      actual = readFileSync(FILE, 'utf8');
    } catch {
      // Missing counts as out of date.
    }
    if (actual !== expected) {
      console.error('public/_headers is out of date with src/shared/security-headers.ts.');
      console.error('Run: npm run check:headers -- --write');
      process.exit(1);
    }
    console.log('public/_headers matches the Worker security headers.');
  }
}
