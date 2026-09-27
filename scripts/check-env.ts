/**
 * Validates a .env file with the same rules the Worker uses, without
 * printing any values. For deployment pipelines, before deploying:
 *
 *   npm run check:env -- .env.production
 *
 * Exit code 0 when valid, 1 otherwise.
 */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ENV_VARS, validateEnv } from '../src/shared/env.ts';

const file = process.argv[2] ?? '.env';
let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch {
  console.error(`Could not read ${file}.`);
  process.exit(1);
}

const values = parseEnv(text);
const known = new Set(ENV_VARS.map((v) => v.name));
const unknown = Object.keys(values).filter((name) => !known.has(name));
const result = validateEnv(values);

if (unknown.length > 0) {
  console.warn(`Not used by cairn-web (check for typos): ${unknown.join(', ')}`);
}
if (!result.ok) {
  console.error(`${file} has problems:`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`${file} is valid for ENVIRONMENT=${result.config.environment}.`);
