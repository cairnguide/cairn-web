/**
 * Wireframe 2, "Email sign-up (error and focus states)" (UC-REG-04).
 *
 * Collects the email address, checks it with the wireframe's error state,
 * then hands off to Auth0, which pre-fills the address. Auth0 then sends the
 * sign-in link (passwordless, the API's default) or asks for a password.
 *
 * Why the password isn't typed here: Cairn never handles passwords
 * (cairn-core auth0/README.md, "Cairn never sees a password"). Auth0 stores
 * them hashed, applies the 15-character minimum and breached-password
 * detection, and offers passkeys.
 */
import { ApiError } from '../api.ts';
import { h, svgIcon } from '../dom.ts';
import { icons } from '../icons.ts';
import {
  actions,
  busy,
  callout,
  errorBanner,
  primaryButton,
  routeLink,
} from '../components/controls.ts';
import type { Page } from '../router.ts';
import { getConfig, getSession, startEmailLogin } from '../state.ts';
import { checkEmail } from '../validation.ts';

export const emailPage: Page = ({ navigate }) => {
  if (getSession().authenticated) {
    navigate('/setup', { replace: true });
    return null;
  }
  const passwordless = getConfig().email_mode === 'passwordless';

  const hintId = 'email-hint';
  const errorId = 'email-error';
  const input = h('input', {
    id: 'email',
    type: 'email',
    name: 'email',
    autocomplete: 'email',
    inputmode: 'email',
    spellcheck: 'false',
    autocapitalize: 'off',
    required: true,
    maxlength: '254',
    'aria-describedby': hintId,
    class: 'text-input',
  });
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const serverError = h('div', { 'aria-live': 'assertive' });

  const showError = (message: string | null) => {
    if (message) {
      error.replaceChildren(svgIcon(icons.warning, 22), h('span', {}, message));
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${hintId} ${errorId}`);
    } else {
      error.hidden = true;
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', hintId);
    }
  };

  const submit = async (button: HTMLButtonElement) => {
    serverError.replaceChildren();
    const message = checkEmail(input.value);
    showError(message);
    if (message) {
      input.focus();
      return;
    }
    await busy(button, async () => {
      try {
        await startEmailLogin(input.value.trim());
      } catch (err) {
        const detail =
          err instanceof ApiError ? err.problem.detail : 'Something went wrong. Please try again.';
        if (err instanceof ApiError && err.problem.code === 'invalid_email') {
          showError(detail);
          input.focus();
        } else {
          serverError.replaceChildren(errorBanner(detail));
        }
      }
    });
  };

  // A submit button: clicking it or pressing Enter in the field both submit the form once.
  const button = primaryButton('Create my account', () => undefined, { type: 'submit' });
  const form = h(
    'form',
    {
      class: 'stack',
      novalidate: true,
      onSubmit: (event: Event) => {
        event.preventDefault();
        void submit(button);
      },
    },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'email' }, 'Email address'),
      h(
        'span',
        { id: hintId, class: 'field-hint' },
        'We only use this to sign you in and to confirm things you do in Cairn.',
      ),
      input,
      error,
    ),
    passwordless
      ? callout(
          'info',
          'mail',
          'Next, we will email you a link to sign in. There is no password to remember. The link works for 15 minutes.',
        )
      : callout(
          'info',
          'shield',
          h(
            'p',
            {},
            'Next, you will create a password on our secure sign-in page. Use at least 15 characters. A short sentence you will remember works well, like "tea on the porch in june".',
          ),
          h(
            'p',
            {},
            'Your password is scrambled before it is stored, so no one at Cairn can read it.',
          ),
        ),
    serverError,
    actions(button, routeLink('/', 'Go back')),
  );

  return {
    title: 'Create your account',
    step: 0,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'Create your account'),
      h(
        'p',
        { class: 'lede' },
        passwordless
          ? 'Just your email address. You will confirm it next.'
          : 'Just two things: your email address here, then a password. You will confirm your email next.',
      ),
      form,
    ),
  };
};
