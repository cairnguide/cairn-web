/**
 * UC-REG-13 (resume where you left off), Take a break during setup and before
 * sign-in (UC-BRK-02, UC-BRK-03), signing out (UC-REG-19), and Support
 * resources signed out (AC-26-10).
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
  await expect(page).toHaveURL(/\/signed-out$/);
  await expect(page.getByText("You're signed out. Everything is saved.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name === '__Host-cairn_session')).toBe(false);

  await page.goto('/');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await expect(page).toHaveURL(/\/setup\/trial$/);
  await expect(page.getByText("Welcome back. Let's pick up where you left off.")).toBeVisible();
});

test('"Finish later" signs out and keeps progress', async ({ page }) => {
  await signUpWithGoogle(page);
  await page.getByRole('button', { name: 'Finish later' }).click();
  await expect(page).toHaveURL(/\/signed-out$/);
});

test('UC-BRK-03: Take a break is on every setup screen, saves progress, and comes back', async ({
  page,
}) => {
  await signUpWithGoogle(page);
  await page
    .getByRole('navigation', { name: 'Always available' })
    .getByRole('link', { name: 'Take a break' })
    .click();
  await expect(page).toHaveURL(/\/break\?from=/);
  await expect(
    page.getByText('Your progress is saved. Come back whenever you are ready.'),
  ).toBeVisible();
  await expect(
    page.getByText('If you need to talk with someone, you can call or text 988.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pick up where I left off' }).click();
  await expect(page).toHaveURL(/\/setup\/privacy$/);
});

test('UC-BRK-02: Take a break works before signing up, and saves nothing', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Always available' })
    .getByRole('link', { name: 'Take a break' })
    .click();
  await expect(page.getByText(/Nothing has been saved, and nothing is sent/)).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page).toHaveURL('http://localhost:8787/');
});

test('Support resources open without signing in (AC-26-10)', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Always available' })
    .getByRole('link', { name: 'Support resources' })
    .click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Support resources');
  await expect(
    page.getByRole('main').getByRole('link', { name: '988', exact: true }),
  ).toHaveAttribute('href', 'tel:988');
});

test("UC-REG-20: I can't get into my email points to the right help", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: "I can't get into my email" }).click();
  await expect(page).toHaveURL(/\/sign-in-help$/);
  await expect(page.getByText(/support can help/)).toBeVisible();
  await page.getByRole('link', { name: 'I signed up with Google' }).click();
  await expect(page.getByRole('link', { name: /Google account recovery/ })).toBeVisible();
});
