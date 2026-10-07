/**
 * Case creation (UC-CASE-01 to UC-CASE-24), the journey (UC-CASE-12, UC-CASE-13,
 * UC-CASE-19, UC-9, UC-13), tasks (UC-10, UC-11), and deleting a case (UC-END-13).
 */
import type { Page } from '@playwright/test';
import { expect, expectAccessible, mockLog, signedInHome, test } from './fixtures.ts';

/** From home, through the hand-off, to the first question of a new case. */
async function startCase(
  page: Page,
  relationship = 'They were my spouse or partner',
): Promise<void> {
  await page.getByRole('link', { name: 'Start a case' }).click();
  await expect(page).toHaveURL(/\/cases\/start$/);
  await page.getByRole('button', { name: relationship }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/);
  await expect(page.getByText("I'm so sorry for your loss.")).toBeVisible();
}

async function answer(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('UC-CASE-01 to UC-CASE-09: one question at a time, with skip and not sure on each', async ({
  page,
}) => {
  await signedInHome(page);
  await startCase(page);
  await expect(page.getByText('Cairn is an AI guide, not a person.')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'One question at a time' }).click();

  // The hand-off answered the connection, so the first question is the name.
  await expect(page.locator('.question-prompt')).toHaveText('What would you like me to call them?');
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await expect(page.getByRole('button', { name: "I'm not sure" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel('Name').fill('Margaret');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.question-prompt')).toHaveText('When did they die?');
  await answer(page, 'Pick the date');
  await page.getByLabel('Date').fill('2099-01-01');
  await page.getByRole('button', { name: 'Save the date' }).click();
  await expect(
    page.getByText('That date is in the future. Please check it and try again.'),
  ).toBeVisible();
  await page.getByLabel('Date').fill('2026-09-12');
  await page.getByRole('button', { name: 'Save the date' }).click();

  await expect(page.locator('.question-prompt')).toHaveText('Where did the death happen?');
  await answer(page, 'It happened away from home');
  await page.getByLabel('State or territory').selectOption('NV');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Away from home: where they lived is asked right away (UC-CASE-04).
  await expect(page.locator('.question-prompt')).toHaveText('Did they live somewhere else?');
  await answer(page, 'Yes, somewhere else');
  await page.getByLabel('State or territory').selectOption('CA');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('.question-prompt')).toHaveText('Had they been ill, or was it sudden?');
  // No free text for how it happened.
  await expect(page.getByText('Or type your answer')).toHaveCount(0);
  await answer(page, "I'd rather not say");
  await expect(page.locator('.question-prompt')).toHaveText('Did they ever serve in the military?');
  await answer(page, "I'm not sure");
  await expect(page.locator('.question-prompt')).toHaveText('Did they have a will or estate plan?');
  await answer(page, 'Yes, and I know where it is');

  await expect(page.locator('.question-prompt')).toContainText(
    'Has anything already been taken care of?',
  );
  await page.getByRole('checkbox', { name: 'We chose a funeral home' }).check();
  await page
    .getByRole('checkbox', { name: 'Someone else is handling this' })
    .filter({ visible: true })
    .check();
  await page
    .getByLabel('Who is handling it? You can leave this blank.')
    .filter({ visible: true })
    .fill('My brother');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText("That's everything I need for now.")).toBeVisible();
  await page.getByRole('link', { name: 'Does this look right?' }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole('heading', { name: 'What you told me' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What we can figure out later' })).toBeVisible();
  await expectAccessible(page);

  const { api } = await mockLog();
  const answers = api.filter((c) => c.method === 'PUT' && c.path.includes('/intake/answers/'));
  expect(answers.find((c) => c.path.endsWith('/date_of_death'))?.body).toMatchObject({
    state: 'answered',
    value: { precision: 'exact', date: '2026-09-12' },
  });
  expect(answers.find((c) => c.path.endsWith('/place_of_death'))?.body).toMatchObject({
    value: { jurisdiction: 'NV', outside_us: false },
    away_from_home: true,
  });
  expect(answers.find((c) => c.path.endsWith('/veteran_status'))?.body).toMatchObject({
    state: 'unsure',
  });
  expect(answers.find((c) => c.path.endsWith('/completed_items'))?.body).toMatchObject({
    value: [{ item: 'funeral_provider_chosen', handled_by: 'My brother' }],
  });
  // The case was started with the hand-off's answer, so it isn't asked twice.
  expect(api.find((c) => c.method === 'POST' && c.path === '/v1/cases')?.body).toEqual({
    user_role: 'spouse_partner',
  });
});

test('UC-CASE-01 own words: masked, read back, and saved only when confirmed', async ({ page }) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByRole('button', { name: 'In my own words' }).click();
  await page
    .getByLabel('In your own words')
    .fill(
      'She was named Margaret. She died today in New Hampshire. Her card was 4111 1111 1111 1111.',
    );
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Did I get that right?')).toBeVisible();
  await expect(page.getByText(/You said: .*\[number removed\]/)).toBeVisible();
  await expect(page.getByText('4111')).toHaveCount(0);
  let { users } = await mockLog();
  expect(Object.keys((users[0]?.cases as { answers: object }[])[0]?.answers ?? {})).toEqual([
    'user_role',
  ]);

  await page.getByRole('button', { name: "Yes, that's right" }).click();
  await expect(page.getByText("Thank you. I've saved that.")).toBeVisible();
  ({ users } = await mockLog());
  expect(Object.keys((users[0]?.cases as { answers: object }[])[0]?.answers ?? {})).toEqual([
    'user_role',
    'display_name',
    'date_of_death',
    'place_of_death',
  ]);
});

test('UC-CASE-09 and UC-CASE-14: three skips in a row stop the questions and offer a choice', async ({
  page,
}) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByRole('button', { name: 'One question at a time' }).click();
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip for now' }).click();
  }
  await expect(page.getByText("Let's stop the questions for now. What would help?")).toBeVisible();
  await expect(page.locator('.question-prompt')).toHaveCount(0);
  await page.getByRole('button', { name: 'One small thing' }).click();
  await expect(
    page.getByText('Find a folder to keep papers in, one place for everything.'),
  ).toBeVisible();
});

test('UC-CASE-14 levels 3 and 4: distress asks nothing, shows 988, then offers the check-in once', async ({
  page,
}) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByRole('button', { name: 'In my own words' }).click();
  await page.getByLabel('In your own words').fill("Honestly I can't go on");
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText("I'm really glad you told me.")).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: '988', exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.question-prompt')).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole('button', { name: "I'm ready to continue" }).click();
  await expect(page.getByText('Would it be okay if I checked in with you tomorrow?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, please' }).click();
  await expect(page.getByText("Okay. I'll check in tomorrow.")).toBeVisible();
  const { api } = await mockLog();
  // The client sends back the session from the last turn, and stores nothing about it.
  const cont = api.find((c) => c.path.endsWith('/intake/continue'));
  expect(cont?.body).toMatchObject({ session: { safety_mode: 'acute_distress' } });
});

test('Take a break in a draft saves where they left off (UC-BRK-04)', async ({ page }) => {
  await signedInHome(page);
  await startCase(page);
  await page
    .getByRole('navigation', { name: 'Always available' })
    .getByRole('button', { name: 'Take a break' })
    .click();
  await expect(
    page.getByText('Your draft is saved. Drafts no one opens for 28 days are deleted.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('.question-prompt')).toBeVisible();
});

test('UC-CASE-16 and UC-CASE-17: something for a lawyer, and a death that has not happened', async ({
  page,
}) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByText('Something here needs a lawyer').click();
  await page.getByRole('button', { name: 'The family disagrees about what to do' }).click();
  await expect(page.getByText(/This is a time to talk to an estate attorney/)).toBeVisible();
  await expect(
    page.getByText('An estate attorney can tell you what applies in your state.'),
  ).toBeVisible();

  await page.getByText('The death has not happened yet').click();
  await page.getByRole('button', { name: 'They are still living' }).click();
  await expect(page.getByText(/Cairn's journeys start after a death/)).toBeVisible();
  await page.getByRole('button', { name: 'Save it for now' }).click();
  await expect(page.getByRole('button', { name: 'The death has happened' })).toBeVisible();
});

test('UC-CASE-11: Edit on the review screen asks that one question again', async ({ page }) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByRole('link', { name: 'Review what you shared so far' }).click();
  await page.getByRole('link', { name: 'Edit Had they been ill, or was it sudden?' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Change an answer');
  await page.getByRole('button', { name: 'It was sudden' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/);
  const { api } = await mockLog();
  expect(api.find((c) => c.path.endsWith('/intake/answers/circumstance'))?.body).toMatchObject({
    state: 'answered',
    value: 'sudden_natural',
  });
});

test('UC-CASE-12, 19, 13: preview, keep in touch, Start journey, then the first task', async ({
  page,
}) => {
  await signedInHome(page);
  await startCase(page);
  await page.getByRole('link', { name: 'Review what you shared so far' }).click();
  await page.getByRole('button', { name: 'Yes, show me the journey' }).click();
  await expect(page).toHaveURL(/\/preview$/);
  await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();
  await expect(page.getByText("When you're ready").first()).toBeVisible();
  await expectAccessible(page);
  let { users } = await mockLog();
  expect(users[0]?.trialStartedAt).toBeNull();

  await page.getByRole('link', { name: 'Confirm how I keep in touch' }).click();
  await expect(page).toHaveURL(/\/keep-in-touch$/);
  await page.getByRole('button', { name: '3 days before' }).click();
  await page.getByRole('button', { name: 'After a quiet week' }).click();
  await expect(page).toHaveURL(/\/preview$/);

  await expect(
    page.getByText('When you select Start journey, your 28 free days begin.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start journey' }).click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByText(/Your free days end on/)).toBeVisible();
  ({ users } = await mockLog());
  expect(users[0]?.trialStartedAt).not.toBeNull();

  await page.getByRole('button', { name: 'Order certified death certificates' }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Order certified death certificates',
  );
  await expect(
    page.getByText("This guidance is a draft that hasn't been reviewed by an attorney yet."),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /New Hampshire Division of Vital Records/ }),
  ).toBeVisible();
  await expectAccessible(page);

  const { api } = await mockLog();
  expect(api.find((c) => c.path.endsWith('/keep-in-touch') && c.method === 'PUT')?.body).toEqual({
    due_date_lead: 'three_days',
    inactivity_after: 'one_week',
  });
  expect(api.find((c) => c.path.endsWith('/journey/start'))?.body).toMatchObject({
    pre_button_notice_version: 'notice-1',
  });
});

test('UC-9, UC-10, UC-11, UC-13: the journey, recording tasks, and everything in one view', async ({
  page,
}) => {
  await signedInHome(page, { activeCase: true });
  await page.getByRole('link', { name: 'Open the journey' }).click();
  await expect(page).toHaveURL(/\/journey$/);
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible();
  await expectAccessible(page);

  // UC-10: certificates.
  await page.getByRole('link', { name: 'Open this step' }).click();
  await page.getByLabel('How many copies?').fill('6');
  await page.getByRole('button', { name: 'Save my order' }).click();
  await expect(page.getByText("Got it. We've noted your certificate order.")).toBeVisible();
  await expect(page.getByText(/Saved\. Next up: Tell Social Security\./)).toBeVisible();

  // Any task: mark it done.
  await page.getByRole('link', { name: 'Open the next step' }).click();
  await page.getByRole('button', { name: "I've done this" }).click();
  await expect(page.getByText(/Saved\. Next up:/)).toBeVisible();

  // UC-11: tell the bank. No account numbers are asked for.
  await page.getByRole('link', { name: 'Back to the journey' }).first().click();
  await page.getByRole('link', { name: 'Tell their bank' }).click();
  await expect(page.getByText(/account number/i)).toContainText(
    'Please leave out account numbers.',
  );
  await page.getByLabel('Who did you tell?').fill('First Granite Bank');
  await page.getByRole('button', { name: 'I told them. Mark as notified.' }).click();
  await expect(page.getByText("Done. We've noted that they've been told.")).toBeVisible();

  // UC-13: status by area, in words.
  await page.getByRole('link', { name: 'Back to the journey' }).first().click();
  await page.getByRole('link', { name: 'Everything in one view' }).click();
  await expect(page.getByRole('table')).toContainText('Order certified death certificates');
  await expect(page.getByText('First Granite Bank, on', { exact: false })).toBeVisible();
  await expectAccessible(page);

  const { api } = await mockLog();
  expect(api.find((c) => c.path.endsWith('/certificate-order'))?.body).toMatchObject({
    copies_requested: 6,
  });
  expect(api.find((c) => c.path.endsWith('/institution-notices'))?.body).toMatchObject({
    institution_name: 'First Granite Bank',
    institution_type: 'bank',
  });
});

test('UC-END-13: delete a case in 7 days, then keep it after all', async ({ page }) => {
  await signedInHome(page, { activeCase: true });
  await page.goto('/cases');
  await page.getByRole('link', { name: 'Delete Margaret' }).click();
  await expect(page.getByText(/One confirmation goes to d•••@example\.com/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete it in 7 days' }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByText(/Set to be deleted on/)).toBeVisible();
  await page.getByRole('link', { name: 'Delete Margaret' }).click();
  await page.getByRole('button', { name: 'Keep this case' }).click();
  await expect(page.getByText('The case is kept. Nothing was deleted.')).toBeVisible();
});
