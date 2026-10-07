/**
 * Subscribing (cairn-core subscription spec 3.3.0).
 *
 *   /subscription/terms   UC-SUB-02: price, renewal, how to cancel, no refunds,
 *                         what's included, that breaks don't pause it, and that
 *                         Stripe takes the payment details. The checkbox is
 *                         never pre-checked and the renewal terms sit next to
 *                         the button. Then Stripe Checkout (UC-SUB-03).
 *   /subscription/return  UC-SUB-04 and UC-SUB-05: back from Stripe. The
 *                         result comes from Cairn's own status, never from the
 *                         redirect, so visiting this page grants nothing.
 *
 * No card or bank detail is ever entered on a Cairn page.
 */
import { CLIENT_ID, api, withQuery } from '../api.ts';
import type {
  CheckoutResponse,
  CheckoutResultResponse,
  SubscriptionTermsResponse,
} from '../api-types.ts';
import { h } from '../dom.ts';
import { attempt, errorSlot, page } from '../components/blocks.ts';
import {
  actions,
  cairnMessage,
  checkboxField,
  newTabLink,
  primaryButton,
  readingCard,
  routeLink,
} from '../components/controls.ts';
import type { Page } from '../router.ts';
import { getCareLevel, leaveFor } from '../state.ts';

export const subscriptionTermsPage: Page = async () => {
  const terms = await api.get<SubscriptionTermsResponse>(
    withQuery('/v1/me/subscription/terms', { care_level: getCareLevel() }),
  );
  const field = checkboxField(terms.checkbox.label, true);
  const errors = errorSlot();
  const pay = primaryButton(terms.button, () => {
    if (!field.input.checked) {
      field.showError('Please check the box to continue.');
      return;
    }
    field.showError(null);
    void attempt(pay, errors, async () => {
      const result = await api.post<CheckoutResponse>('/v1/me/subscription/checkout', {
        agreed: true,
        document_version: terms.checkbox.document_version,
        client: CLIENT_ID,
        care_level: getCareLevel(),
      });
      leaveFor(result.checkout_url);
    });
  });

  return {
    title: terms.title,
    step: null,
    content: page(
      terms.title,
      h('p', { class: 'price' }, terms.price),
      readingCard(terms.lines),
      terms.links.length > 0
        ? h(
            'p',
            {},
            terms.links.map((l) => [newTabLink(l.url, l.label, 'text-link'), ' ']),
          )
        : null,
      field.root,
      errors,
      actions(pay, routeLink('/settings/subscription', 'Not now')),
      h(
        'p',
        { class: 'fine-print' },
        'You will enter payment details on Stripe’s secure page, not on Cairn.',
      ),
    ),
  };
};

const POLL_MS = 3000;

export const subscriptionReturnPage: Page = async ({ url }) => {
  const outcome = url.searchParams.get('outcome') === 'cancelled' ? 'cancelled' : 'success';
  const started = Date.now();
  const check = (waited: number) =>
    api.get<CheckoutResultResponse>(
      withQuery('/v1/me/subscription/checkout-result', { outcome, waited_seconds: waited }),
    );
  const first = await check(0);
  const message = h('div', { 'aria-live': 'polite' }, cairnMessage(first.message));
  const errors = errorSlot();
  const next = h('div', {});

  const finish = (result: CheckoutResultResponse) => {
    message.replaceChildren(cairnMessage(result.message));
    next.replaceChildren(
      actions(
        routeLink('/home', 'Go to your home screen', 'button-primary'),
        routeLink('/settings/subscription', 'See your subscription'),
      ),
    );
  };

  if (first.next_step.action === 'keep_checking') {
    // Waiting on Stripe's verified event. Never asks to pay again.
    const poll = async () => {
      if (!document.body.contains(message)) return;
      try {
        const result = await check(Math.floor((Date.now() - started) / 1000));
        if (result.next_step.action === 'keep_checking') {
          message.replaceChildren(cairnMessage(result.message));
          window.setTimeout(() => void poll(), POLL_MS);
        } else {
          finish(result);
        }
      } catch {
        errors.replaceChildren(
          h(
            'p',
            { class: 'note' },
            'Still checking. You can close this page. We will email you when it is done.',
          ),
        );
      }
    };
    window.setTimeout(() => void poll(), POLL_MS);
  } else {
    finish(first);
  }
  return {
    title: outcome === 'cancelled' ? 'Nothing was charged' : 'Finishing up',
    step: null,
    content: page(
      outcome === 'cancelled' ? 'Nothing was charged' : 'Your subscription',
      message,
      next,
      errors,
    ),
  };
};
