/**
 * UC-REG-13 (resume where you left off), UC-REG-14 ("I need a moment"), and signing out.
 */
import { agree, expect, signUpWithGoogle, test } from './fixtures.ts';

test('UC-REG-13: signing out and back in resumes at the first unfinished step', async ({
  page,
  context,
}) => {
  await signUpWithGoogle(page);
  await agree(page);
  await expect(page).toHaveURL(/\/setup\/trial$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('http://localhost:8787/');
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name === '__Host-cairn_session')).toBe(false);

  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await expect(page).toHaveURL(/\/setup\/trial$/);
});

test('"Finish later" signs out and keeps progress', async ({ page }) => {
  await signUpWithGoogle(page);
  await page.getByRole('button', { name: 'Finish later' }).click();
  await expect(page).toHaveURL('http://localhost:8787/');
});

test('UC-REG-14: "I need a moment" is on every setup screen and stops the flow', async ({
  page,
}) => {
  await signUpWithGoogle(page);
  await page.getByRole('link', { name: 'I need a moment' }).click();
  await expect(page).toHaveURL(/\/setup\/paused$/);
  await expect(page.locator('.message-text')).toHaveText(
    "Take all the time you need. Everything you've done is saved, and nothing here is going anywhere.",
  );
  await page.getByRole('link', { name: "I'm ready to continue" }).click();
  await expect(page).toHaveURL(/\/setup\/privacy$/);
});

test('UC-REG-14: "I need a moment" works before signing up too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'I need a moment' }).click();
  await expect(page).toHaveURL(/\/moment$/);
  await expect(page.getByText(/call or text/)).toBeVisible();
  await page.getByRole('link', { name: "I'm ready to continue" }).click();
  await expect(page).toHaveURL('http://localhost:8787/');
});
