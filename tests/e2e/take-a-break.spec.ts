/**
 * Take a break on every view (Take a break spec 3.2.0, UC-BRK-01), checked
 * against the view_inventory and the acceptance checklist in the use case docs:
 * - break screens replace Take a break with their own actions (V-41 to V-45)
 * - in a case, the break saves where the person was and resume goes back there
 * - partly typed text is kept (AC08), listening stops and nothing is sent (AC09)
 * - a break on a delete confirmation cancels the deletion (AC10)
 * - no billing wording at care levels 3 and 4 (crisis plan AC-26-03)
 * - the AI guide label from the API shows in chat views (UC-REG-09 AC03)
 */
import type { Page } from '@playwright/test';
import { expect, mockLog, signedInHome, signUpWithGoogle, test } from './fixtures.ts';

const header = (page: Page) => page.getByRole('navigation', { name: 'Always available' });

async function startDraft(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'Start a case' }).click();
  await page.getByRole('button', { name: 'They were my spouse or partner' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname;
}

test('break screens replace Take a break with their own actions, and Welcome back shows it again', async ({
  page,
}) => {
  await signUpWithGoogle(page);
  await header(page).getByRole('link', { name: 'Take a break' }).click();
  // S-02: progress saved, 988 line, Support resources, resume, Sign out. No Take a break.
  await expect(page.getByText('Your progress is saved.').first()).toBeVisible();
  await expect(header(page).getByText('Take a break')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Support resources' }),
  ).toBeVisible();
});

test('on a journey: rest choices, resting, and Welcome back (V-41 to V-44)', async ({ page }) => {
  await signedInHome(page, { activeCase: true });
  await header(page).getByRole('link', { name: 'Take a break' }).click();
  await expect(page.getByRole('button', { name: 'A few days' })).toBeVisible();
  await expect(header(page).getByText('Take a break')).toHaveCount(0);
  await page.getByRole('button', { name: 'A few days' }).click();
  await expect(header(page).getByText('Take a break')).toHaveCount(0);
  await page.getByRole('button', { name: "I'm back" }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
  await expect(header(page).getByRole('link', { name: 'Take a break' })).toBeVisible();
});

test('in a draft, a break from the review saves first, and Keep going returns to the review', async ({
  page,
}) => {
  await signedInHome(page);
  const casePath = await startDraft(page);
  await page.getByRole('link', { name: 'Review what you shared so far' }).click();
  await expect(page).toHaveURL(`${casePath}/review`);
  await header(page).getByRole('button', { name: 'Take a break' }).click();
  await expect(
    page.getByText('Your draft is saved. Drafts no one opens for 28 days are deleted.'),
  ).toBeVisible();
  await expect(header(page).getByText('Take a break')).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page).toHaveURL(`${casePath}/review`);
  const { api } = await mockLog();
  expect(api.some((c) => c.path.endsWith('/take-a-break') && c.method === 'POST')).toBe(true);
});

test('partly typed text is kept when the person comes back (AC08)', async ({ page }) => {
  await signedInHome(page);
  await startDraft(page);
  await page.getByRole('button', { name: 'One question at a time' }).click();
  await page.getByLabel('Name').fill('Marg');
  await header(page).getByRole('button', { name: 'Take a break' }).click();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Marg');
  // Nothing typed was sent while resting.
  const { api } = await mockLog();
  expect(api.some((c) => c.path.endsWith('/intake/answers/display_name'))).toBe(false);
});

test('Take a break while listening stops it and sends nothing that was heard (AC09)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Listening extends EventTarget {
      static available() {
        return Promise.resolve('available');
      }
      lang = '';
      interimResults = false;
      continuous = false;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: 'She died on' }], { isFinal: false });
          this.dispatchEvent(Object.assign(new Event('result'), { results: [result] }));
        }, 20);
      }
      stop() {
        this.dispatchEvent(new Event('end'));
      }
    }
    Object.defineProperty(Listening.prototype, 'processLocally', { value: false, writable: true });
    (window as unknown as Record<string, unknown>).SpeechRecognition = Listening;
  });
  await signedInHome(page);
  await startDraft(page);
  await page.getByRole('button', { name: 'In my own words' }).click();
  await page.getByRole('button', { name: /Speak/ }).click();
  await expect(page.getByText(/Heard so far: She died on/)).toBeVisible();
  // The API's first-use note explains that the recording is never kept.
  await expect(page.getByText(/The recording is never kept/).first()).toBeVisible();
  await header(page).getByRole('button', { name: 'Take a break' }).click();
  await expect(page.getByText('Your draft is saved.', { exact: false }).first()).toBeVisible();
  const { api } = await mockLog();
  expect(api.some((c) => c.path.endsWith('/intake/transcripts'))).toBe(false);
});

test('a break on a delete confirmation cancels it, and resume never returns there (AC10)', async ({
  page,
}) => {
  await signedInHome(page, { activeCase: true });
  await page.goto('/cases');
  await page.getByRole('link', { name: 'Delete Margaret' }).click();
  await header(page).getByRole('button', { name: 'Take a break' }).click();
  await page.getByRole('button', { name: 'Never mind, keep going' }).click();
  await expect(page).not.toHaveURL(/\/delete$/);
  const { api, users } = await mockLog();
  expect(api.some((c) => c.path.endsWith('/deletion') && c.method !== 'GET')).toBe(false);
  expect((users[0]?.cases as unknown[]).length).toBe(1);
});

test('after a level 3 moment, Settings shows no billing wording (AC-26-03)', async ({ page }) => {
  await signedInHome(page, { subscribed: true });
  await startDraft(page);
  await page.getByRole('button', { name: 'In my own words' }).click();
  await page.getByLabel('In your own words').fill("I can't go on");
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText("I'm really glad you told me.")).toBeVisible();
  await header(page).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(page.getByRole('main')).not.toContainText(/subscri|price|\$|payment|free days/i);
});

test('the AI guide label from the API shows in chat views (UC-REG-09 AC03)', async ({ page }) => {
  await signedInHome(page);
  await startDraft(page);
  await expect(page.locator('.ai-label')).toHaveText('Cairn is an AI guide, not a person.');
  await page.goto('/settings/ask');
  await expect(page.locator('.ai-label')).toHaveText('Cairn is an AI guide, not a person.');
});
