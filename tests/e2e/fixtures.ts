import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

const MOCK = 'http://localhost:8799';

export async function mockControl(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${MOCK}/__control`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error('mock control failed');
}

export interface ApiCall {
  method: string;
  path: string;
  body: Record<string, unknown>;
  authorized: boolean;
}

export async function mockLog(): Promise<{ api: ApiCall[]; users: Record<string, unknown>[] }> {
  return (await (await fetch(`${MOCK}/__log`)).json()) as {
    api: ApiCall[];
    users: Record<string, unknown>[];
  };
}

/** Fails the test on any console error, including Content Security Policy and Trusted Types violations. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      // The real speech recognition service differs between browser builds and can
      // crash headless Chromium. Tests remove it, and install a fake when they need one.
      await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.SpeechRecognition;
        delete w.webkitSpeechRecognition;
      });
      await mockControl({ reset: true });
      await use(errors);
      // The browser logs every 4xx API answer (401 signed out, 409 account exists). The
      // screens handle those, and each is asserted in its own test. Anything else fails.
      expect(
        errors.filter(
          (e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e),
        ),
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** No serious or critical WCAG 2.2 AA problems on the page as it is now. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Signs up with Google through the mock and lands on the adult question (UC-REG-06). */
export async function signUpWithGoogleOnly(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await expect(page).toHaveURL(/\/setup\/adult$/);
}

/** Signs up with Google, says yes to being 18 or older, and lands on Privacy and Terms. */
export async function signUpWithGoogle(page: Page): Promise<void> {
  await signUpWithGoogleOnly(page);
  await page.getByRole('button', { name: "Yes, I'm 18 or older" }).click();
  await expect(page).toHaveURL(/\/setup\/privacy$/);
}

export async function agree(page: Page): Promise<void> {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Signs up and completes the three acknowledgments, landing on the name screen. */
export async function throughAcknowledgments(page: Page): Promise<void> {
  await signUpWithGoogle(page);
  await agree(page);
  await expect(page).toHaveURL(/\/setup\/trial$/);
  await agree(page);
  await expect(page).toHaveURL(/\/setup\/about-cairn$/);
  await agree(page);
  await expect(page).toHaveURL(/\/setup\/name$/);
}

/** Finishes setup: name, voice, channels, and frequency, landing on the setup complete screen. */
export async function throughSetup(page: Page): Promise<void> {
  await throughAcknowledgments(page);
  await page.getByLabel('Your answer').fill('Dana');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/setup\/voice$/);
  await page.getByRole('button', { name: 'Choose for me' }).click();
  await expect(page).toHaveURL(/\/setup\/notifications$/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/setup\/reminders$/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
}

/** Starts signed in with setup already finished (and optionally more), on the home screen. */
export async function signedInHome(
  page: Page,
  preset: { readOnly?: boolean; subscribed?: boolean; activeCase?: boolean } = {},
): Promise<void> {
  await mockControl({ preset: { complete: true, ...preset } });
  await page.goto('/');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await expect(page).toHaveURL(/\/home$/);
}
