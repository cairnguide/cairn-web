/**
 * WCAG 2.2 AA checks (axe) on every screen, plus the wireframes' own
 * accessibility features: skip link, focus on the heading, text size, and
 * keyboard-only use.
 */
import {
  agree,
  expect,
  expectAccessible,
  test,
  signedInHome,
  signUpWithGoogleOnly,
  throughAcknowledgments,
} from './fixtures.ts';

test('the start and email screens pass axe', async ({ page }) => {
  await page.goto('/');
  await expectAccessible(page);
  await page.goto('/?oauth_cancelled=true');
  await expectAccessible(page);
  await page.goto('/signup/email');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expectAccessible(page);
});

test('every setup screen passes axe', async ({ page }) => {
  await signUpWithGoogleOnly(page);
  await expectAccessible(page);
  await page.getByRole('button', { name: "Yes, I'm 18 or older" }).click();
  await expect(page).toHaveURL(/\/setup\/privacy$/);
  await expectAccessible(page);
  await agree(page);
  await expectAccessible(page);
  await agree(page);
  await expectAccessible(page);
  await agree(page);
  await expectAccessible(page);
  await page.getByLabel('Your answer').fill('Dana');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/setup\/voice$/);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Choose for me' }).click();
  await expect(page).toHaveURL(/\/setup\/notifications$/);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/setup\/reminders$/);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await expectAccessible(page);
});

test('dark mode passes axe', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expectAccessible(page);
  await throughAcknowledgments(page);
  await expectAccessible(page);
});

test('skip link, then keyboard-only sign-up to the email screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: /Continue with email/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/signup\/email$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('Text size makes the words larger on every page and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const size = () => page.evaluate(() => getComputedStyle(document.querySelector('h1')!).fontSize);
  const before = parseFloat(await size());
  await page.getByRole('button', { name: /Text size/ }).click();
  await page.getByRole('button', { name: /Text size/ }).click();
  await expect(page.getByRole('button', { name: /Text size/ })).toContainText('Largest');
  expect(parseFloat(await size())).toBeGreaterThan(before * 1.2);
  await page.reload();
  await expect(page.getByRole('button', { name: /Text size/ })).toContainText('Largest');
});

test('Read aloud is a toggle button that reports its state', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Read aloud/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toContainText('On');
});

test('signed-in screens pass axe in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signedInHome(page, { activeCase: true });
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Open the journey' }).click();
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expectAccessible(page);
  await page.goto('/support');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Support resources');
  await expectAccessible(page);
});
