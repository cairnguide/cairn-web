/**
 * UC-REG-07 (Privacy and Terms), UC-REG-08 (28 free days), UC-REG-09 (AI notice,
 * California SB 243), and UC-REG-10 (declining). Wireframes 4, 5, and 6.
 */
import { agree, expect, mockLog, signUpWithGoogle, test } from './fixtures.ts';

test.describe('UC-REG-07: Privacy and Terms', () => {
  test('shows the API text, never pre-checks, and requires the box', async ({ page }) => {
    await signUpWithGoogle(page);
    const steps = page.getByRole('navigation', { name: 'Account setup steps' });
    await expect(steps).toContainText('Setting up, step 3 of 7');
    await expect(steps.locator('[aria-current="step"]')).toContainText('Privacy and terms');

    await expect(
      page.getByText(/Cairn never uses your information, or information about the person who died/),
    ).toBeVisible();
    await expect(page.getByText('Cairn is for adults 18 and older.')).toBeVisible();
    await expect(page.getByText(/provided by \[AI PROVIDER\]/)).toBeVisible();

    const box = page.getByRole('checkbox', {
      name: 'I have read and agree to the Privacy Policy and Terms of Use.',
    });
    await expect(box).not.toBeChecked();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/Please check the box to continue/)).toBeVisible();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
  });

  test('links to the full documents open in a new tab and say so', async ({ page }) => {
    await signUpWithGoogle(page);
    const link = page.getByRole('link', {
      name: /Read the full Privacy Policy \(opens in a new tab\)/,
    });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('agreeing records the exact document version and this client', async ({ page }) => {
    await signUpWithGoogle(page);
    await agree(page);
    await expect(page).toHaveURL(/\/setup\/trial$/);
    const { api } = await mockLog();
    const ack = api.find((c) => c.path === '/v1/onboarding/acknowledgments/privacy_terms');
    expect(ack?.body).toEqual({
      agreed: true,
      document_version: 'privacy-v1',
      client: 'web/0.1.0',
    });
    expect(ack?.authorized).toBe(true);
  });
});

test.describe('UC-REG-08 and UC-REG-09', () => {
  test('28 free days shows the timeline, then the AI notice shows 988 and the SB 243 notice', async ({
    page,
  }) => {
    await signUpWithGoogle(page);
    await agree(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your 28 free days');
    await expect(
      page.getByRole('list', { name: 'How the 28 days work' }).getByRole('listitem'),
    ).toHaveCount(3);
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await agree(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Before we begin, an important notice',
    );
    await expect(page.getByText(/It is not a human\. It is not an attorney/)).toBeVisible();
    await expect(page.getByText(/California Senate Bill 243/)).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: '988', exact: true }),
    ).toHaveAttribute('href', 'tel:988');
    await expect(page.getByRole('link', { name: /988lifeline\.org/ })).toHaveAttribute(
      'href',
      'https://988lifeline.org',
    );
    await agree(page);
    await expect(page).toHaveURL(/\/setup\/name$/);
  });

  test('Go back shows an earlier step as already saved', async ({ page }) => {
    await signUpWithGoogle(page);
    await agree(page);
    await page.getByRole('link', { name: 'Go back' }).click();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
    await expect(page.getByText('You have already agreed to this. It is saved.')).toBeVisible();
    await page.getByRole('link', { name: 'Continue where you left off' }).click();
    await expect(page).toHaveURL(/\/setup\/trial$/);
  });
});

test.describe("UC-REG-10: I'm not sure", () => {
  test('records nothing and offers ways forward, including reading it again', async ({ page }) => {
    await signUpWithGoogle(page);
    await page.getByRole('button', { name: "I'm not sure" }).click();
    await expect(page).toHaveURL(/\/setup\/declined\?about=privacy_terms$/);
    await expect(
      page.getByText("That's okay. You can't use Cairn without agreeing, but you're not stuck."),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Contact support/ })).toBeVisible();

    const { users } = await mockLog();
    expect(users[0]).toMatchObject({ step: 'account_created', consents: [] });

    await page.getByRole('link', { name: 'Read it again' }).click();
    await expect(page).toHaveURL(/\/setup\/privacy$/);
    await expect(page.getByRole('checkbox')).not.toBeChecked();
  });
});
