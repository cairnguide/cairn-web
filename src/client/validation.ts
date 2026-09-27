/**
 * Form checks. Messages are the wireframe's plain-language wording and never
 * repeat what the person typed back to them.
 */

export const EMAIL_MESSAGES = {
  empty: 'Please enter your email address.',
  invalid: 'Please check your email address. It needs a full ending, like name@example.com.',
  tooLong: 'That email address is too long. Please check it.',
} as const;

/** Returns an error message, or null when the address looks usable. Auth0 does the real check. */
export function checkEmail(raw: string): string | null {
  const value = raw.trim();
  if (!value) return EMAIL_MESSAGES.empty;
  if (value.length > 254) return EMAIL_MESSAGES.tooLong;
  // Something before the last @, and a domain with a dot and a real ending (like .com).
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const labels = domain.split('.');
  const ending = labels[labels.length - 1] ?? '';
  const valid =
    at > 0 &&
    !/[\s@]/.test(local) &&
    !/[\s@]/.test(domain) &&
    labels.length >= 2 &&
    labels.every((label) => label.length > 0) &&
    /^[A-Za-z]{2,}$/.test(ending);
  if (!valid) return EMAIL_MESSAGES.invalid;
  return null;
}

export const NAME_MESSAGES = {
  empty: 'Please type a name, or choose Speak and say it.',
  tooLong: 'Please use 100 characters or fewer.',
} as const;

export function checkPreferredName(raw: string): string | null {
  const value = raw.trim();
  if (!value) return NAME_MESSAGES.empty;
  if (value.length > 100) return NAME_MESSAGES.tooLong;
  return null;
}
