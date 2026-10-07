import { describe, expect, it } from 'vitest';
import type { ScreenId } from '../../../src/client/api-types.ts';
import {
  SETUP_STEPS,
  compareScreens,
  isMoment,
  routeForScreen,
} from '../../../src/client/onboarding.ts';

describe('onboarding routing', () => {
  it('lists the setup steps in the account spec order', () => {
    expect(SETUP_STEPS).toEqual([
      'Create your account',
      'Confirm your email',
      'Confirm you are an adult',
      'Privacy and terms',
      'Your 28 free days',
      'About Cairn',
      'What to call you',
      'How Cairn talks with you',
      'How Cairn keeps in touch',
    ]);
  });

  it('routes every API screen to a page', () => {
    const screens: ScreenId[] = [
      'welcome',
      'adult',
      'under_18',
      'privacy_terms',
      'trial_terms',
      'ai_notice',
      'declined',
      'preferred_name',
      'personality',
      'notification_channels',
      'notification_frequency',
      'setup_complete',
      'ready',
      'paused',
    ];
    for (const screen of screens) expect(routeForScreen(screen)).toMatch(/^\//);
    expect(routeForScreen('adult')).toBe('/setup/adult');
    expect(routeForScreen('notification_frequency')).toBe('/setup/reminders');
    expect(routeForScreen('ready')).toBe('/home');
  });

  it('orders the setup screens', () => {
    expect(compareScreens('adult', 'privacy_terms')).toBe(-1);
    expect(compareScreens('notification_channels', 'personality')).toBe(1);
    expect(compareScreens('ai_notice', 'ai_notice')).toBe(0);
    expect(compareScreens('declined', 'setup_complete')).toBe(1);
  });

  it('treats declined and paused as moments, not saved steps', () => {
    expect(isMoment('declined')).toBe(true);
    expect(isMoment('paused')).toBe(true);
    expect(isMoment('personality')).toBe(false);
  });
});
