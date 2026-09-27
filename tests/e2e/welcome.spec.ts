/**
 * UC-REG-01 (welcome), UC-REG-02 and UC-REG-03 (Google and Apple, including cancelling).
 * Wireframe 1: "Start: choose how to sign up".
 */
import { expect, mockControl, test } from './fixtures.ts';

test.describe('UC-REG-01: welcome', () => {
  test('acknowledges the loss first and offers three equal ways to sign up', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Create your Cairn account · Cairn');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText('We are so sorry you are here.');

    const methods = page.getByRole('group', { name: 'Create your free account' }).getByRole('link');
    await expect(methods).toHaveText([
      /Continue with Google/,
      /Continue with Apple/,
      /Continue with email/,
    ]);
    // Equal weight: all three the same size.
    const boxes = await Promise.all((await methods.all()).map((m) => m.boundingBox()));
    const heights = new Set(boxes.map((b) => Math.round(b?.height ?? 0)));
    expect(heights.size).toBe(1);

    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
    const aside = page.getByRole('complementary', { name: 'Before you start' });
    await expect(aside).toContainText('No card needed');
    await expect(aside).toContainText('never uses your information');
    await expect(aside).toContainText('download or delete your information');
    await expect(aside).toContainText('It is not a human, an attorney, or a therapist.');
  });

  test('every page has Privacy Policy, Terms of Use, the AI disclosure, and 988 in the footer', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute(
      'href',
      'http://localhost:8799/legal/privacy',
    );
    await expect(footer.getByRole('link', { name: /Terms of Use/ })).toHaveAttribute(
      'href',
      'http://localhost:8799/legal/terms',
    );
    await expect(footer.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await expect(footer).toContainText('Cairn is an AI guide, not a human.');
    await expect(footer.getByRole('link', { name: '988' })).toHaveAttribute('href', 'tel:988');
  });

  test('the "not ready" link from the API goes to the public journey map', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: /See what the first weeks look like/ }),
    ).toHaveAttribute('href', 'http://localhost:8799/site/journey');
  });
});

test.describe('UC-REG-02 and UC-REG-03: Google and Apple', () => {
  test('Continue with Google creates the account and opens Privacy and terms', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Continue with Google/ }).click();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your privacy');
    await expect(page.getByText('Signed in as')).toContainText('d•••@example.com');
  });

  test('Continue with Apple works the same way', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Continue with Apple/ }).click();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
  });

  test('cancelling on the provider screen returns to the welcome screen with reassurance', async ({
    page,
  }) => {
    await mockControl({ cancelNext: true });
    await page.goto('/');
    await page.getByRole('link', { name: /Continue with Google/ }).click();
    await expect(page).toHaveURL(/\/\?oauth_cancelled=true$/);
    await expect(page.getByRole('status')).toHaveText(
      "No problem. You can choose another way whenever you're ready.",
    );
  });
});
