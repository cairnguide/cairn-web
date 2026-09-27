import { defineConfig, devices } from '@playwright/test';

/**
 * Use case tests: the built client and the real Worker (wrangler dev), with
 * Auth0 and the Cairn API replaced by tests/e2e/mock-server.ts.
 *
 * Tests share the mock's state, so they run one at a time.
 * PW_CHROMIUM_PATH points at a preinstalled Chromium when the matching
 * Playwright browser can't be downloaded (CI installs its own).
 */
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /responsive\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 960 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
    {
      name: 'phone',
      use: {
        ...devices['Pixel 7'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/mock-server.ts',
      url: 'http://localhost:8799/.well-known/jwks.json',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command:
        'npm run build && npx wrangler dev --port 8787 --env-file tests/e2e/test.env --show-interactive-dev-session=false',
      url: 'http://localhost:8787/config.json',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        WRANGLER_SEND_METRICS: 'false',
        NO_PROXY: 'localhost,127.0.0.1',
        no_proxy: 'localhost,127.0.0.1',
      },
    },
  ],
});
