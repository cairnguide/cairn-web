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

import { aiNoticePage, privacyPage, trialPage } from './pages/acknowledgment.ts';
import { donePage } from './pages/done.ts';
import { emailPage } from './pages/email.ts';
import { namePage } from './pages/name.ts';
import { declinedPage, momentPage, newCasePage, notFoundPage } from './pages/other.ts';
import { setupPage } from './pages/setup.ts';
import { startPage } from './pages/start.ts';
import { verifyPage } from './pages/verify.ts';
import { voicePage } from './pages/voice.ts';
import { applyPreferences } from './preferences.ts';
import { render, startRouter, type Page, type Route } from './router.ts';
import { onLocalVoicesLoaded } from './speech.ts';
import { loadConfig, loadSession } from './state.ts';

const page = (p: Page) => () => Promise.resolve(p);

export const ROUTES: Route[] = [
  { path: '/', page: page(startPage) },
  { path: '/signup/email', page: page(emailPage) },
  { path: '/moment', page: page(momentPage) },
  { path: '/setup', page: page(setupPage) },
  { path: '/setup/verify', page: page(verifyPage) },
  { path: '/setup/privacy', page: page(privacyPage) },
  { path: '/setup/trial', page: page(trialPage) },
  { path: '/setup/about-cairn', page: page(aiNoticePage) },
  { path: '/setup/declined', page: page(declinedPage) },
  { path: '/setup/name', page: page(namePage) },
  { path: '/setup/voice', page: page(voicePage) },
  { path: '/setup/done', page: page(donePage) },
  { path: '/setup/paused', page: page(momentPage) },
  { path: '/cases/new', page: page(newCasePage) },
];

async function boot(): Promise<void> {
  applyPreferences();
  await Promise.all([loadConfig(), loadSession()]);
  const root = document.getElementById('app');
  if (!root) return;
  startRouter(root, ROUTES, page(notFoundPage));
  // Listen buttons appear only once the device's own voices are known.
  onLocalVoicesLoaded(() => void render());
}

void boot();
