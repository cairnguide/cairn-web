/**
 * UC-REG-11 (preferred name), UC-REG-12 (how Cairn talks), UC-REG-14 (distress
 * pauses sign-up). Wireframes 7, 9, and 10.
 */
import { expect, mockLog, test, throughAcknowledgments } from './fixtures.ts';

test('UC-REG-11 and UC-REG-12: name, voice, then the all set screen', async ({ page }) => {
  await throughAcknowledgments(page);
  await expect(page.getByRole('navigation', { name: 'Account setup steps' })).toContainText(
    'Setting up, step 6 of 7',
  );
  await expect(page.locator('.message-text')).toContainText('What would you like me to call you?');

  // Google shared a name: it is a pre-fill to confirm, not saved yet.
  const answer = page.getByLabel('Your answer');
  await expect(answer).toHaveValue('Dana');
  await answer.fill('Dee');
  await page.getByRole('button', { name: 'Add how to say it' }).click();
  await page.getByLabel('How do you say it?').fill('DEE');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(/\/setup\/voice$/);
  await expect(page.locator('.message-text')).toContainText('Thank you, Dee.');
  const group = page.getByRole('group', { name: 'Choose one' });
  await expect(group.getByRole('radio')).toHaveCount(4);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Please choose one, or choose "Choose for me".')).toBeVisible();
  await group.getByRole('radio', { name: 'Warm & Patient' }).check();
  await expect(page.getByText('Chosen')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.getByText('Your account is ready').first()).toBeVisible();
  await expect(page.locator('.message-text')).toHaveText(/Thank you, Dee\. I'll go gently/);
  const summary = page.locator('dl.summary');
  await expect(summary).toContainText('Dee');
  await expect(summary).toContainText('Warm & Patient');
  await expect(summary).toContainText('Not started. They begin when you start your first journey.');

  const { api } = await mockLog();
  expect(api.find((c) => c.path === '/v1/onboarding/preferred-name')?.body).toEqual({
    preferred_name: 'Dee',
    name_pronunciation: 'DEE',
  });
  expect(api.find((c) => c.path === '/v1/onboarding/personality')?.body).toEqual({
    choice: 'warm_patient',
  });
});

test('"Choose for me" picks the default voice', async ({ page }) => {
  await throughAcknowledgments(page);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Choose for me' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.locator('dl.summary')).toContainText('Steady and Direct');
});

test('names and voices can be changed afterwards', async ({ page }) => {
  await throughAcknowledgments(page);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Choose for me' }).click();
  await page.getByRole('link', { name: 'Change What I will call you' }).click();
  await page.getByLabel('Your answer').fill('Danielle');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.locator('dl.summary')).toContainText('Danielle');

  await page.getByRole('link', { name: 'Change How I talk with you' }).click();
  await page.getByRole('radio', { name: 'Plain and Practical' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('dl.summary')).toContainText('Plain and Practical');
});

test('an empty name gets a clear message and nothing is sent', async ({ page }) => {
  await throughAcknowledgments(page);
  await page.getByLabel('Your answer').fill('   ');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Please type a name, or choose Speak and say it.')).toBeVisible();
  const { api } = await mockLog();
  expect(api.some((c) => c.path === '/v1/onboarding/preferred-name')).toBe(false);
});

test('UC-REG-14: signs of distress pause sign-up and show the 988 resource', async ({ page }) => {
  await throughAcknowledgments(page);
  await page.getByLabel('Your answer').fill("I can't go on");
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page).toHaveURL(/\/setup\/paused$/);
  await expect(page.locator('.message-text')).toHaveText(
    "Thank you for telling me. What you're going through matters more than any of this.",
  );
  await expect(
    page.getByRole('main').getByRole('link', { name: '988', exact: true }),
  ).toBeVisible();
  const { users } = await mockLog();
  expect(users[0]).toMatchObject({ preferred_name: null });

  await page.getByRole('link', { name: "I'm ready to continue" }).click();
  await expect(page).toHaveURL(/\/setup\/name$/);
});

test('the Speak button is hidden when this device cannot turn speech into text on its own', async ({
  page,
}) => {
  await throughAcknowledgments(page);
  await expect(page.getByRole('button', { name: 'Speak' })).toBeHidden();
});

test('Speak turns speech into text on the device, and nothing is sent until confirmed', async ({
  page,
}) => {
  // A fake on-device recognizer that "hears" Dee.
  await page.addInitScript(() => {
    class FakeRecognition extends EventTarget {
      static available() {
        return Promise.resolve('available');
      }
      lang = '';
      interimResults = false;
      continuous = false;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: 'Dee' }], { isFinal: true });
          this.dispatchEvent(Object.assign(new Event('result'), { results: [result] }));
          this.dispatchEvent(new Event('end'));
        }, 50);
      }
      stop() {
        this.dispatchEvent(new Event('end'));
      }
    }
    Object.defineProperty(FakeRecognition.prototype, 'processLocally', {
      value: false,
      writable: true,
    });
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  });
  await throughAcknowledgments(page);
  await page.getByRole('button', { name: 'Speak' }).click();
  await expect(page.locator('.heard-text')).toHaveText('Dee');
  await expect(page.getByText('The recording is never kept.').first()).toBeVisible();
  let { api } = await mockLog();
  expect(api.some((c) => c.path === '/v1/onboarding/preferred-name')).toBe(false);

  await page.getByRole('button', { name: 'That is right, send it' }).click();
  await expect(page).toHaveURL(/\/setup\/voice$/);
  ({ api } = await mockLog());
  expect(api.find((c) => c.path === '/v1/onboarding/preferred-name')?.body).toEqual({
    preferred_name: 'Dee',
  });
});

test('Speak explains itself and records nothing when on-device recognition is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class CloudOnly extends EventTarget {
      static available() {
        return Promise.resolve('unavailable');
      }
    }
    Object.defineProperty(CloudOnly.prototype, 'processLocally', { value: false, writable: true });
    (window as unknown as Record<string, unknown>).SpeechRecognition = CloudOnly;
  });
  await throughAcknowledgments(page);
  await page.getByRole('button', { name: 'Speak' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: "Speaking isn't available" }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speak' })).toBeHidden();
  await expect(page.getByLabel('Your answer')).toBeFocused();
});
