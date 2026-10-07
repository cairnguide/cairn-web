/**
 * UC-REG-06, "Are you 18 or older?", and the screen after a no.
 *
 * Yes or no only. No birthdate or age is asked for or stored. After a no,
 * onboarding stops: the API's message, the 988 line, the public journey map,
 * and Support resources. Nothing more is collected.
 */
import { api } from '../api.ts';
import type { OnboardingResponse } from '../api-types.ts';
import { h } from '../dom.ts';
import {
  attempt,
  errorSlot,
  notesList,
  optionButtons,
  page,
  paragraphs,
} from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  crisisCallout,
  newTabLink,
  textButton,
} from '../components/controls.ts';
import { routeForScreen } from '../onboarding.ts';
import type { Page } from '../router.ts';
import { ensureOnboarding, setOnboarding, signOut } from '../state.ts';

export const adultPage: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (current.screen.id !== 'adult') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  const errors = errorSlot();
  return {
    title: 'Are you 18 or older?',
    step: 2,
    content: page(
      'Are you 18 or older?',
      notesList(current.notes),
      cairnMessage(current.next_step.prompt),
      optionButtons(
        current.next_step.options,
        (option, button) =>
          void attempt(button, errors, async () => {
            const next = await api.post<OnboardingResponse>('/v1/onboarding/adult', {
              answer: option.value,
            });
            setOnboarding(next);
            navigate(routeForScreen(next.screen.id));
          }),
        { label: 'Are you 18 or older?' },
      ),
      h(
        'p',
        { class: 'fine-print' },
        'We only ask yes or no. We never ask for your birthday or age.',
      ),
      errors,
      actions(textButton('Finish later', () => void signOut())),
    ),
  };
};

export const under18Page: Page = async ({ navigate }) => {
  const current = await ensureOnboarding();
  if (current.screen.id !== 'under_18') {
    navigate(routeForScreen(current.screen.id), { replace: true });
    return null;
  }
  const [first, ...rest] = current.screen.body ?? [];
  return {
    title: 'Cairn is for adults',
    step: null,
    content: page(
      'Cairn is for adults',
      first ? cairnMessage(first) : null,
      paragraphs(rest),
      crisisCallout(),
      h(
        'ul',
        { class: 'link-list' },
        (current.screen.links ?? []).map((link) =>
          h('li', {}, newTabLink(link.url, link.label, 'text-link')),
        ),
        (current.next_step.options ?? [])
          .filter((o) => o.value === 'support_resources')
          .map((o) =>
            h(
              'li',
              {},
              h('a', { href: '/support', class: 'text-link', 'data-route': '' }, o.label),
            ),
          ),
      ),
      actions(textButton('Sign out', () => void signOut())),
    ),
  };
};
