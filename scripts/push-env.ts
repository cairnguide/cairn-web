/**
 * Uploads a validated .env file to the Worker as encrypted secrets, in one
 * request, using `wrangler secret bulk`. For deployment pipelines:
 *
 *   npm run env:push -- .env.production
 *   npm run env:push -- .env.preview --env preview
 *
 * Every variable is stored as a secret, so values never appear in the
 * Cloudflare dashboard or in logs. Requires CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID in the pipeline's environment.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { validateEnv } from '../src/shared/env.ts';

const [file, ...wranglerArgs] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run env:push -- <env file> [wrangler args]');
  process.exit(1);
}

const result = validateEnv(parseEnv(readFileSync(file, 'utf8')));
if (!result.ok) {
  console.error(`${file} has problems. Nothing was uploaded.`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const run = spawnSync('npx', ['wrangler', 'secret', 'bulk', file, ...wranglerArgs], {
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
