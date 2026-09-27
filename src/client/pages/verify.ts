/**
 * Wireframe 3, "Confirm email" (UC-REG-04).
 *
 * Shown when Auth0 hasn't confirmed the email yet (the API answers 403
 * email_not_verified). Auth0 sends the confirmation email. After the person
 * clicks its link, "I have confirmed my email" checks with Auth0 again
 * without asking them to sign in, then carries on.
 */
import { h } from '../dom.ts';
import { actions, callout, primaryButton, textButton } from '../components/controls.ts';
import type { Page } from '../router.ts';
import { getSession, signOut } from '../state.ts';

export const verifyPage: Page = ({ navigate }) => {
  const session = getSession();
  if (session.email_verified) {
    navigate('/setup', { replace: true });
    return null;
  }
  const email = session.email ?? 'your email address';

  return {
    title: 'Check your email',
    step: 1,
    content: h(
      'div',
      { class: 'content' },
      h('h1', {}, 'Check your email'),
      h(
        'p',
        { class: 'lede', 'data-read-aloud': '' },
        'We sent a link to ',
        h('strong', {}, email),
        ' so you can confirm it is yours. It can take a minute or two to arrive.',
      ),
      callout(
        'info',
        'info',
        h(
          'p',
          {},
          'Cannot find it? Look in your spam or junk folder. Then come back here and choose "I have confirmed my email".',
        ),
      ),
      actions(
        primaryButton('I have confirmed my email', () => {
          // A silent check with Auth0 picks up the confirmed email in a new token.
          window.location.assign('/auth/login?silent=1&returnTo=%2Fsetup');
        }),
        textButton('Use a different email', () => void signOut()),
      ),
    ),
  };
};
