import { describe, expect, it } from 'vitest';
import type { ScreenId } from '../../../src/client/api-types.ts';
import { SETUP_STEPS, compareScreens, routeForScreen } from '../../../src/client/onboarding.ts';

describe('onboarding routing', () => {
  it('has the seven steps from the wireframes, in order', () => {
    expect(SETUP_STEPS).toEqual([
      'Create your account',
      'Confirm your email',
      'Privacy and terms',
      'Your 28 free days',
      'About Cairn',
      'What to call you',
      'How Cairn talks with you',
    ]);
  });

  it('routes every API screen to a page', () => {
    const screens: ScreenId[] = [
      'welcome',
      'privacy_terms',
      'trial_terms',
      'ai_notice',
      'declined',
      'preferred_name',
      'personality',
      'case_handoff',
      'ready',
      'paused',
    ];
    for (const screen of screens) expect(routeForScreen(screen)).toMatch(/^\//);
    expect(routeForScreen('ai_notice')).toBe('/setup/about-cairn');
    expect(routeForScreen('case_handoff')).toBe('/setup/done');
  });

  it('orders screens the way the API enforces them', () => {
    expect(compareScreens('privacy_terms', 'trial_terms')).toBe(-1);
    expect(compareScreens('personality', 'personality')).toBe(0);
    expect(compareScreens('case_handoff', 'ai_notice')).toBe(1);
    expect(compareScreens('declined', 'privacy_terms')).toBe(1);
  });
});
