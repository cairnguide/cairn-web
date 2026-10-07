/**
 * UC-REG-11 (preferred name), UC-REG-12 (how Cairn talks), UC-REG-14 (distress
 * pauses sign-up). Wireframes 7, 9, and 10.
 */
import { expect, mockLog, test, throughAcknowledgments, throughSetup } from './fixtures.ts';

test('UC-REG-11, UC-REG-12, UC-REG-15, and UC-REG-16: name, voice, keeping in touch, then all set', async ({
  page,
}) => {
  await throughAcknowledgments(page);
  await expect(page.getByRole('navigation', { name: 'Account setup steps' })).toContainText(
    'Setting up, step 7 of 9',
  );
  await expect(page.locator('.message-text')).toContainText('What would you like me to call you?');

  // Never pre-filled from Google or Apple (D-16).
  const answer = page.getByLabel('Your answer');
  await expect(answer).toHaveValue('');
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
  await group.getByRole('radio', { name: 'Warm and Patient' }).check();
  await expect(page.getByText('Chosen')).toHaveCount(1);
  await page.getByRole('button', { name: 'Continue' }).click();

  // UC-REG-15, first screen: email and in-app start selected, in-app can't be unchecked.
  await expect(page).toHaveURL(/\/setup\/notifications$/);
  await expect(page.getByText("Thanks, Dee. We'll take this one step at a time.")).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Email to/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Inside Cairn' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Inside Cairn' })).toBeChecked();
  await expect(page.getByText(/phone number/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Second screen: how often, due only by default.
  await expect(page).toHaveURL(/\/setup\/reminders$/);
  await expect(page.getByRole('radio', { name: 'Only when something is due' })).toBeChecked();
  await page.getByRole('radio', { name: 'Once a week' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.getByText('Your account is ready').first()).toBeVisible();
  await expect(page.locator('.message-text')).toHaveText("You're all set, Dee.");
  await expect(page.getByText(/Warm and Patient voice/)).toBeVisible();
  await expect(
    page.getByText('If you share this device, sign out when you are done.'),
  ).toBeVisible();

  const { api } = await mockLog();
  expect(api.find((c) => c.path === '/v1/onboarding/preferred-name')?.body).toEqual({
    preferred_name: 'Dee',
    name_pronunciation: 'DEE',
  });
  expect(api.find((c) => c.path === '/v1/onboarding/personality')?.body).toEqual({
    choice: 'warm_patient',
  });
  expect(api.find((c) => c.path === '/v1/onboarding/notification-channels')?.body).toEqual({
    email: true,
    browser: false,
  });
  expect(api.find((c) => c.path === '/v1/onboarding/notification-frequency')?.body).toEqual({
    frequency: 'weekly',
  });
});

test('names and voices can be changed from the summary, which comes back to it', async ({
  page,
}) => {
  await throughSetup(page);
  await page.getByRole('link', { name: 'Change what I call you' }).click();
  await page.getByLabel('Your answer').fill('Danielle');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.getByText("You're all set, Danielle.")).toBeVisible();

  await page.getByRole('link', { name: 'Change how I talk with you' }).click();
  await page.getByRole('radio', { name: 'Plain and Practical' }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await expect(page.getByText(/Plain and Practical voice/)).toBeVisible();
});

test('an empty name gets a clear message and nothing is sent', async ({ page }) => {
  await throughAcknowledgments(page);
  await page.getByLabel('Your answer').fill('   ');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Please type a name, or choose Speak and say it.')).toBeVisible();
  const { api } = await mockLog();
  expect(api.some((c) => c.path === '/v1/onboarding/preferred-name')).toBe(false);
});

test('UC-REG-14: signs of distress pause sign-up, show 988, and offer the check-in once', async ({
  page,
}) => {
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
  let { users } = await mockLog();
  expect(users[0]).toMatchObject({ preferred_name: null });

  // Before UC-REG-15 there are no channels yet, so the question asks about email too.
  await expect(page.getByText(/I can email you, or just show it here/)).toBeVisible();
  await page.getByRole('button', { name: 'Only here in Cairn' }).click();
  await expect(page).toHaveURL(/\/setup\/name$/);
  await expect(page.getByText("Okay. I'll check in tomorrow.")).toBeVisible();
  ({ users } = await mockLog());
  expect(users[0]).toMatchObject({ checkIn: true });
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
