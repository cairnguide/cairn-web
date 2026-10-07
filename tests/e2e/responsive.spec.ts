/**
 * Phone width: no sideways scrolling, and the current step stays in view.
 * Runs in the "phone" project (Pixel 7).
 */
import { expect, signUpWithGoogle, signedInHome, test } from './fixtures.ts';

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

test('home, the journey, a task, and the status table fit a phone', async ({ page }) => {
  await signedInHome(page, { activeCase: true });
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: 'Open the journey' }).click();
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: 'Open this step' }).click();
  await expect(page.getByLabel('How many copies?')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: 'Back to the journey' }).first().click();
  await page.getByRole('link', { name: 'Everything in one view' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('Take a break stays reachable at 320 CSS pixels wide (UC-BRK-01 AC05)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await signedInHome(page, { activeCase: true });
  await expectNoHorizontalScroll(page);
  const control = page
    .getByRole('navigation', { name: 'Always available' })
    .getByRole('link', { name: 'Take a break' });
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
});
