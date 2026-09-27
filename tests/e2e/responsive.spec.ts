/**
 * Phone width: no sideways scrolling, and the current step stays in view.
 * Runs in the "phone" project (Pixel 7).
 */
import { expect, signUpWithGoogle, test } from './fixtures.ts';

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('start, email, and setup screens fit a phone', async ({ page }) => {
  await page.goto('/');
  await expectNoHorizontalScroll(page);
  await page.goto('/signup/email');
  await expectNoHorizontalScroll(page);
  await signUpWithGoogle(page);
  await expectNoHorizontalScroll(page);
  const steps = page.getByRole('navigation', { name: 'Account setup steps' });
  await expect(steps.getByText('Privacy and terms')).toBeVisible();
  await expect(steps.getByText('Your 28 free days')).toBeHidden();
});
