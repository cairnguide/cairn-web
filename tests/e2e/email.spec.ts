/**
 * UC-REG-04: create an account with email. Wireframes 2 and 3.
 */
import { expect, mockControl, mockLog, test } from './fixtures.ts';

test.describe('UC-REG-04: email sign-up', () => {
  test('shows the wireframe error state for an address without a full ending', async ({ page }) => {
    await page.goto('/signup/email');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Create your account');
    await expect(page.getByRole('navigation', { name: 'Account setup steps' })).toContainText(
      'Setting up, step 1 of 7',
    );

    const email = page.getByLabel('Email address');
    await email.fill('dana@example');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toBeFocused();
    await expect(
      page.getByText(
        'Please check your email address. It needs a full ending, like name@example.com.',
      ),
    ).toBeVisible();
    // Nothing was sent anywhere.
    await expect(page).toHaveURL(/\/signup\/email$/);
  });

  test('never asks for a password in Cairn (Auth0 owns credentials)', async ({ page }) => {
    await page.goto('/signup/email');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/email you a link to sign in/)).toBeVisible();
  });

  test('a valid address signs up through Auth0 without putting the email in our URLs', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith('http://localhost:8787')) requests.push(r.url());
    });
    await page.goto('/signup/email');
    await page.getByLabel('Email address').fill('sam@example.com');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/setup\/privacy$/);
    expect(
      requests.filter((u) => u.includes('sam%40example.com') || u.includes('sam@example.com')),
    ).toEqual([]);
    const { users } = await mockLog();
    expect(users[0]).toMatchObject({ email: 'sam@example.com', method: 'email' });
  });

  test('an unconfirmed email shows "Check your email", then continues once confirmed', async ({
    page,
  }) => {
    await mockControl({ unverified: ['new@example.com'] });
    await page.goto('/signup/email');
    await page.getByLabel('Email address').fill('new@example.com');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page).toHaveURL(/\/setup\/verify$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your email');
    await expect(page.getByRole('main').getByText('n•••@example.com')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account setup steps' })).toContainText(
      'Setting up, step 2 of 7',
    );

    await mockControl({ verified: ['new@example.com'] });
    await page.getByRole('button', { name: 'I have confirmed my email' }).click();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
  });
});
