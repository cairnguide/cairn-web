/**
 * Wireframes 4, 5, and 6: "Privacy and Terms" (UC-REG-07), "28 free days"
 * (UC-REG-08), and "AI guide notice" (UC-REG-09, California SB 243).
 * Declining any of them is UC-REG-10.
 *
 * The words the person agrees to always come from the API (screen.body and
 * screen.checkbox), never from this code, because the consent record stores
 * the document_version of exactly that text. The checkbox is never pre-checked.
 */
import { ApiError, CLIENT_ID, api } from '../api.ts';
import type { ConsentType, OnboardingResponse, ScreenId } from '../api-types.ts';
import { h, svgIcon, type Child } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  actions,
  busy,
  checkboxField,
  crisisCallout,
  errorBanner,
  newTabLink,
  primaryButton,
  readingCard,
  routeLink,
  textButton,
} from '../components/controls.ts';
import { compareScreens, isMoment, routeForScreen, type SetupStepIndex } from '../onboarding.ts';
import type { Page, View } from '../router.ts';
import { ensureOnboarding, setOnboarding, signOut } from '../state.ts';

interface AckScreen {
  consent: ConsentType;
  screen: ScreenId;
  step: SetupStepIndex;
  title: string;
  back: { href: string; label: string } | 'finish-later';
  /** Wireframe content around the API's text. */
  before?: () => Child;
  after?: () => Child;
}

const TRIAL_TIMELINE = [
  { icon: icons.stepTodo, when: 'Now', what: 'Getting set up. No days are used.' },
  {
    icon: icons.arrowRight,
    when: 'Start journey',
    what: 'Day 1 of 28. The days keep counting during a break you choose.',
  },
  {
    icon: icons.info,
    when: 'Day 29',
    what: 'Read-only unless you subscribe. Nothing is deleted or charged.',
  },
];

const SCREENS: Record<ConsentType, AckScreen> = {
  privacy_terms: {
    consent: 'privacy_terms',
    screen: 'privacy_terms',
    step: 3,
    title: 'Your privacy',
    back: 'finish-later',
    after: () => h('p', { class: 'fine-print' }, 'Cairn is for adults 18 and older.'),
  },
  trial_terms: {
    consent: 'trial_terms',
    screen: 'trial_terms',
    step: 4,
    title: 'Your 28 free days',
    back: { href: '/setup/privacy', label: 'Go back' },
    before: () =>
      h(
        'ol',
        { class: 'timeline', 'aria-label': 'How the 28 days work' },
        TRIAL_TIMELINE.map((item) =>
          h(
            'li',
            {},
            h('span', { class: 'timeline-when' }, svgIcon(item.icon, 22), item.when),
            h('span', {}, item.what),
          ),
        ),
      ),
  },
  ai_notice: {
    consent: 'ai_notice',
    screen: 'ai_notice',
    step: 5,
    title: 'Before we begin, an important notice',
    back: { href: '/setup/trial', label: 'Go back' },
  },
};

/** The API's AI notice starts with the same words as the page heading. Don't say them twice. */
function withoutRepeatedHeading(paragraphs: string[], title: string): string[] {
  return paragraphs.map((p, index) =>
    index === 0 && p.startsWith(`${title}.`) ? p.slice(title.length + 1).trim() : p,
  );
}

function alreadyDoneView(config: AckScreen, current: OnboardingResponse): View {
  return {
    title: config.title,
    step: config.step,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, config.title),
      h('p', { class: 'lede' }, 'You have already agreed to this. It is saved.'),
      actions(
        routeLink(
          routeForScreen(current.screen.id),
          'Continue where you left off',
          'button-primary',
        ),
      ),
    ),
  };
}

function ackPage(consent: ConsentType): Page {
  const config = SCREENS[consent];
  return async ({ navigate }) => {
    let response = await ensureOnboarding();
    // "declined" and "paused" are moments, not saved steps. Ask the API where things stand.
    if (isMoment(response.screen.id)) {
      setOnboarding(null);
      response = await ensureOnboarding();
    }
    const order = compareScreens(response.screen.id, config.screen);
    if (order > 0) return alreadyDoneView(config, response);
    const screen = response.screen;
    const checkbox = screen.checkbox;
    if (order < 0 || !checkbox) {
      navigate(routeForScreen(screen.id), { replace: true });
      return null;
    }

    const field = checkboxField(checkbox.label, true);
    const errorArea = h('div', { 'aria-live': 'assertive' });
    const body = withoutRepeatedHeading(screen.body ?? [], config.title);

    const send = async (agreed: boolean) => {
      errorArea.replaceChildren();
      try {
        const next = await api.post<OnboardingResponse>(
          `/v1/onboarding/acknowledgments/${consent}`,
          {
            agreed,
            document_version: agreed ? checkbox.document_version : null,
            client: CLIENT_ID,
          },
        );
        setOnboarding(next);
        if (next.screen.id === 'declined') {
          navigate(`/setup/declined?about=${consent}`);
        } else {
          navigate(routeForScreen(next.screen.id));
        }
      } catch (error) {
        // 422 acknowledgment_outdated: the text changed while it was open. Show the new text.
        if (error instanceof ApiError && error.problem.code === 'acknowledgment_outdated') {
          setOnboarding(null);
          navigate(routeForScreen(config.screen), { replace: true });
          return;
        }
        errorArea.replaceChildren(
          errorBanner(
            error instanceof ApiError
              ? error.problem.detail
              : 'Something went wrong. Please try again.',
          ),
        );
      }
    };

    const continueButton = primaryButton('Continue', () => {
      if (!field.input.checked) {
        field.showError('Please check the box to continue, or choose "I\'m not sure".');
        return;
      }
      field.showError(null);
      void busy(continueButton, () => send(true));
    });
    const notSure = response.next_step.options?.find((o) => o.value === 'not_sure');

    const links = (screen.links ?? []).map((link) =>
      newTabLink(
        link.url,
        [h('span', {}, `Read the full ${link.label}`), svgIcon(icons.external, 18)],
        'text-link',
      ),
    );

    const card = readingCard(
      body,
      consent === 'ai_notice' ? crisisCallout() : null,
      (screen.legal_notice ?? []).map((text) => h('p', { class: 'fine-print' }, text)),
      screen.ai_provider
        ? h(
            'p',
            { class: 'fine-print' },
            `Cairn's AI guide is provided by ${screen.ai_provider}. It is named here before anything you share is sent to it.`,
          )
        : null,
      links.length > 0 ? h('div', { class: 'reading-links' }, links) : null,
    );

    return {
      title: config.title,
      step: config.step,
      content: h(
        'div',
        { class: 'content' },
        h('h1', {}, config.title),
        response.notes.map((note) => h('p', { class: 'note', role: 'status' }, note.text)),
        config.before?.(),
        card,
        field.root,
        config.after?.(),
        errorArea,
        actions(
          continueButton,
          notSure ? textButton(notSure.label, () => void send(false)) : null,
          config.back === 'finish-later'
            ? textButton('Finish later', () => void signOut())
            : routeLink(config.back.href, config.back.label),
        ),
      ),
    };
  };
}

export const privacyPage = ackPage('privacy_terms');
export const trialPage = ackPage('trial_terms');
export const aiNoticePage = ackPage('ai_notice');
