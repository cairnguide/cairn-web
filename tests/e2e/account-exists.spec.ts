/**
 * UC-REG-05: the email already has an account made another way.
 */
import { expect, mockControl, test } from './fixtures.ts';

test('offers the method used last time as the main button, and never links accounts on its own', async ({
  page,
}) => {
  await mockControl({ existing: { 'dana@example.com': 'google' } });
  await page.goto('/signup/email');
  await page.getByLabel('Email address').fill('dana@example.com');
  await page.getByRole('button', { name: 'Create my account' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'You already have a Cairn account',
  );
  await expect(page.getByText('Last time you signed in with Google.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page).toHaveURL(/\/setup\/privacy$/);
});
