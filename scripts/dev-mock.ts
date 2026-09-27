/**
 * Runs the app locally with no Auth0 tenant and no Cairn API: the mock server
 * from the use case tests plus `wrangler dev` pointed at it.
 *
 *   npm run dev:mock    then open http://localhost:8787
 *
 * Every sign-in succeeds as "Dana". Stop with Ctrl+C.
 */
import { spawn } from 'node:child_process';

const mock = spawn('node', ['tests/e2e/mock-server.ts'], { stdio: 'inherit' });
const wrangler = spawn(
  'npx',
  ['wrangler', 'dev', '--port', '8787', '--env-file', 'tests/e2e/test.env'],
  {
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  },
);

const stop = () => {
  mock.kill();
  wrangler.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
wrangler.on('exit', (code) => {
  mock.kill();
  process.exit(code ?? 0);
});
