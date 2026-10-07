/**
 * After setup: the home screen (UC-CASE-25, UC-REG-18), Settings (UC-REG-17),
 * sign-in methods (UC-REG-05), download and delete (UC-ACCT-01), Take a break
 * on a journey (UC-BRK-05 to UC-BRK-11), and subscribing (UC-SUB-02 to 14).
 */
import { expect, expectAccessible, mockLog, signedInHome, test, throughSetup } from './fixtures.ts';

test('UC-REG-16 to UC-CASE-25: setup complete goes home, which offers one Start a case', async ({
  page,
}) => {
  await throughSetup(page);
  await page.getByRole('link', { name: 'Go to my home screen' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Dana.');
  await expect(page.getByRole('link', { name: 'Start a case' })).toBeVisible();
  await expect(page).toHaveTitle('Home · Cairn');
  await expectAccessible(page);
});

test('UC-REG-18: a returning sign-in goes home with the session-start AI reminder', async ({
  page,
}) => {
  await signedInHome(page);
  await expect(page.getByText(/I'm Cairn, an AI guide/)).toBeVisible();
});

test('UC-REG-17: Settings changes one thing at a time and says where the confirmation went', async ({
  page,
}) => {
  await signedInHome(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expectAccessible(page);

  await page.getByRole('link', { name: 'Change what I call you' }).click();
  await page.getByLabel('Your answer').fill('Dee');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('status').filter({ hasText: 'A confirmation went to' }),
  ).toBeVisible();
  await expect(page.locator('dl.summary')).toContainText('Dee');

  await page.getByRole('link', { name: 'Change how I keep in touch' }).click();
  await expectAccessible(page);
  await page.getByRole('radio', { name: 'Once a day' }).check();
  await page.getByRole('button', { name: 'Save how often' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop all reminders' }).click();
  await expect(page.getByText(/No reminders/).first()).toBeVisible();

  const { api } = await mockLog();
  const patches = api.filter(
    (c) => c.method === 'PATCH' && c.path === '/v1/me/notification-preferences',
  );
  expect(patches.map((p) => p.body)).toEqual([
    { frequency: 'daily', care_level: 1 },
    { stop_all_reminders: true, care_level: 1 },
  ]);
});

test('UC-REG-05: another way to sign in is added only after signing in with it', async ({
  page,
}) => {
  await signedInHome(page);
  await page.goto('/settings/sign-in');
  await page.getByRole('link', { name: 'Add Apple' }).click();
  await expect(page).toHaveURL(/\/settings\/sign-in\?link=linked$/);
  await expect(page.getByText('Done. You can now sign in that way too.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Apple' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Apple' }).click();
  await expect(page.getByRole('link', { name: 'Add Apple' })).toBeVisible();
});

test('download all my data is a plain JSON download', async ({ page }) => {
  await signedInHome(page);
  await page.goto('/settings/download');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download my data' }).click();
  expect((await download).suggestedFilename()).toBe('cairn-data.json');
});

test('UC-ACCT-01: delete the account with one button, then signed out', async ({
  page,
  context,
}) => {
  await signedInHome(page);
  await page.goto('/settings/delete');
  await expect(page.getByText(/One confirmation goes to d•••@example\.com/).first()).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Delete my account and everything in it' }).click();
  await expect(page).toHaveURL(/\/signed-out\?reason=deleted$/);
  await expect(page.getByText(/Your account and everything in it have been deleted/)).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === '__Host-cairn_session')).toBe(false);
});

test('asking Cairn about the account leads to the same steps as Settings', async ({ page }) => {
  await signedInHome(page);
  await page.goto('/settings/ask');
  await page.getByLabel('What would you like to do?').fill('Please delete my account');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/settings\/delete$/);
});

test.describe('Take a break on a journey', () => {
  test('UC-BRK-05, UC-BRK-08, UC-BRK-10: rest choices, resting first, then welcome back', async ({
    page,
  }) => {
    await signedInHome(page, { activeCase: true });
    await page
      .getByRole('navigation', { name: 'Always available' })
      .getByRole('link', { name: 'Take a break' })
      .click();
    await expect(
      page.getByText('Your free days keep counting during a break you choose.'),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'A few days' }).click();
    await expect(page.getByText(/Your tasks are set aside until/)).toBeVisible();

    // Opening Cairn during a break shows the resting screen first.
    await page.goto('/home');
    await expect(page).toHaveURL(/\/break\?from=%2Fhome/);
    await expect(page.getByText(/Rest well/)).toBeVisible();

    // UC-BRK-11: change how long.
    await page.getByRole('button', { name: 'Change how long' }).click();
    await page.getByRole('button', { name: 'A week' }).click();
    await expect(page.getByText(/Rest well/)).toBeVisible();

    await page.getByRole('button', { name: "I'm back" }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
    await page.getByRole('button', { name: "Let's look at the next thing" }).click();
    await expect(page).toHaveURL(/\/home$/);

    const { api } = await mockLog();
    expect(
      api
        .filter((c) => c.path === '/v1/me/break' && c.method !== 'GET')
        .map((c) => [c.method, c.body]),
    ).toEqual([
      ['POST', { choice: 'three_days', care_level: 1 }],
      ['PUT', { choice: 'week', care_level: 1 }],
      ['DELETE', {}],
    ]);
  });
});

test.describe('Subscription', () => {
  test('UC-SUB-02 to UC-SUB-04: terms first, Stripe for payment, then the result from Cairn', async ({
    page,
  }) => {
    await signedInHome(page, { activeCase: true });
    await page.goto('/settings/subscription');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page).toHaveURL(/\/subscription\/terms$/);
    await expect(page.getByText('$14.99 a month, tax included')).toBeVisible();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByText('Please check the box to continue.')).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page).toHaveURL(/\/subscription\/return\?outcome=success$/);
    await expect(page.getByText(/You're subscribed/)).toBeVisible();
  });

  test('UC-SUB-13 and UC-SUB-14: cancel explains first, and can be undone', async ({ page }) => {
    await signedInHome(page, { subscribed: true });
    await page.goto('/settings/subscription');
    await page.getByRole('button', { name: 'Cancel my subscription' }).click();
    await expect(page.getByText(/you keep full access until the end of this month/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel my subscription' }).last().click();
    await expect(
      page.getByText('Your subscription is cancelled. You keep access until the end of the month.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Keep my subscription' }).click();
    await expect(page.getByText('Your subscription will keep going as before.')).toBeVisible();
  });

  test('UC-SUB-01: a read-only account sees the banner and the subscribe prompt once', async ({
    page,
  }) => {
    await signedInHome(page, { readOnly: true });
    await expect(page.getByText(/Your free days have ended/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Keep going with Cairn' })).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    // Moving around in the same visit, the prompt doesn't come back.
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByRole('link', { name: 'Cairn', exact: true }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText(/Your free days have ended/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Keep going with Cairn' })).toHaveCount(0);
  });
});
