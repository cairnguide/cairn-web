/**
 * cairn-web client entry point.
 */
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/karla/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/app.css';

import { applyPreferences } from './preferences.ts';
import { render, startRouter, type Page, type Route } from './router.ts';
import { startSessionTimeout } from './session-timeout.ts';
import { onLocalVoicesLoaded } from './speech.ts';
import { getSession, loadConfig, loadSession, loadWelcome } from './state.ts';

/** Pages load on demand, so the start page stays small. */
const lazy =
  <M>(load: () => Promise<M>, pick: (module: M) => Page) =>
  async () =>
    pick(await load());

const registration = () => import('./pages/start.ts');
const email = () => import('./pages/email.ts');
const setup = () => import('./pages/setup.ts');
const verify = () => import('./pages/verify.ts');
const adult = () => import('./pages/adult.ts');
const ack = () => import('./pages/acknowledgment.ts');
const name = () => import('./pages/name.ts');
const voice = () => import('./pages/voice.ts');
const notifications = () => import('./pages/notifications.ts');
const done = () => import('./pages/done.ts');
const other = () => import('./pages/other.ts');
const brk = () => import('./pages/break.ts');
const home = () => import('./pages/home.ts');
const settings = () => import('./pages/settings.ts');
const subscription = () => import('./pages/subscription.ts');
const cases = () => import('./pages/cases.ts');
const intake = () => import('./pages/intake.ts');
const journey = () => import('./pages/journey.ts');
const task = () => import('./pages/task.ts');

export const ROUTES: Route[] = [
  // Signed out (UC-REG-01 to 05, 20, the Support resources page, and Take a break S-01)
  { path: '/', page: lazy(registration, (m) => m.startPage) },
  { path: '/signup/email', page: lazy(email, (m) => m.emailPage) },
  { path: '/support', page: lazy(other, (m) => m.supportPage) },
  { path: '/sign-in-help', page: lazy(other, (m) => m.signInHelpPage) },
  { path: '/signed-out', page: lazy(other, (m) => m.signedOutPage) },
  { path: '/break', page: lazy(brk, (m) => m.breakPage) },
  // Account setup (UC-REG-06 to 16)
  { path: '/setup', page: lazy(setup, (m) => m.setupPage) },
  { path: '/setup/verify', page: lazy(verify, (m) => m.verifyPage) },
  { path: '/setup/adult', page: lazy(adult, (m) => m.adultPage) },
  { path: '/setup/under-18', page: lazy(adult, (m) => m.under18Page) },
  { path: '/setup/privacy', page: lazy(ack, (m) => m.privacyPage) },
  { path: '/setup/trial', page: lazy(ack, (m) => m.trialPage) },
  { path: '/setup/about-cairn', page: lazy(ack, (m) => m.aiNoticePage) },
  { path: '/setup/declined', page: lazy(other, (m) => m.declinedPage) },
  { path: '/setup/name', page: lazy(name, (m) => m.namePage) },
  { path: '/setup/voice', page: lazy(voice, (m) => m.voicePage) },
  { path: '/setup/notifications', page: lazy(notifications, (m) => m.channelsPage) },
  { path: '/setup/reminders', page: lazy(notifications, (m) => m.frequencyPage) },
  { path: '/setup/done', page: lazy(done, (m) => m.donePage) },
  { path: '/setup/paused', page: lazy(other, (m) => m.pausedPage) },
  // Home, Settings, and subscribing (UC-CASE-25, UC-REG-17 to 19, UC-ACCT-01, UC-SUB)
  { path: '/home', page: lazy(home, (m) => m.homePage) },
  { path: '/settings', page: lazy(settings, (m) => m.settingsPage) },
  { path: '/settings/notifications', page: lazy(settings, (m) => m.notificationSettingsPage) },
  { path: '/settings/subscription', page: lazy(settings, (m) => m.subscriptionSettingsPage) },
  { path: '/settings/sign-in', page: lazy(settings, (m) => m.signInMethodsPage) },
  { path: '/settings/download', page: lazy(settings, (m) => m.downloadPage) },
  { path: '/settings/delete', page: lazy(settings, (m) => m.deleteAccountPage) },
  { path: '/settings/ask', page: lazy(settings, (m) => m.askPage) },
  { path: '/subscription/terms', page: lazy(subscription, (m) => m.subscriptionTermsPage) },
  { path: '/subscription/return', page: lazy(subscription, (m) => m.subscriptionReturnPage) },
  // Cases, the conversation, and the journey (UC-CASE-01 to 25, UC-9 to 13, UC-END-13)
  { path: '/cases', page: lazy(cases, (m) => m.caseListPage) },
  { path: '/cases/start', page: lazy(cases, (m) => m.caseStartPage) },
  { path: '/cases/:id', page: lazy(intake, (m) => m.intakePage) },
  { path: '/cases/:id/delete', page: lazy(cases, (m) => m.caseDeletePage) },
  { path: '/cases/:id/review', page: lazy(journey, (m) => m.reviewPage) },
  { path: '/cases/:id/preview', page: lazy(journey, (m) => m.previewPage) },
  { path: '/cases/:id/keep-in-touch', page: lazy(journey, (m) => m.keepInTouchPage) },
  { path: '/cases/:id/start', page: lazy(journey, (m) => m.firstTaskPage) },
  { path: '/cases/:id/journey', page: lazy(journey, (m) => m.journeyPage) },
  { path: '/cases/:id/status', page: lazy(journey, (m) => m.statusPage) },
  { path: '/cases/:id/tasks/:taskId', page: lazy(task, (m) => m.taskPage) },
];

async function boot(): Promise<void> {
  applyPreferences();
  const [, , welcome] = await Promise.all([loadConfig(), loadSession(), loadWelcome()]);
  const root = document.getElementById('app');
  if (!root) return;
  if (getSession().authenticated) startSessionTimeout(welcome?.session);
  startRouter(
    root,
    ROUTES,
    lazy(other, (m) => m.notFoundPage),
  );
  // Listen buttons appear only once the device's own voices are known.
  onLocalVoicesLoaded(() => void render());
}

void boot();
