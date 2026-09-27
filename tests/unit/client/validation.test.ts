import { describe, expect, it } from 'vitest';
import {
  EMAIL_MESSAGES,
  NAME_MESSAGES,
  checkEmail,
  checkPreferredName,
} from '../../../src/client/validation.ts';

describe('checkEmail (wireframe 2 error state)', () => {
  it.each(['dana@example.com', ' dana@example.com ', 'd.o+cairn@mail.example.co.uk'])(
    'accepts %s',
    (value) => {
      expect(checkEmail(value)).toBeNull();
    },
  );

  it('shows the wireframe message for an address without a full ending', () => {
    expect(checkEmail('dana@example')).toBe(EMAIL_MESSAGES.invalid);
    expect(EMAIL_MESSAGES.invalid).toBe(
      'Please check your email address. It needs a full ending, like name@example.com.',
    );
  });

  it.each([
    'dana',
    '@example.com',
    'dana@',
    'da na@example.com',
    'dana@example..com',
    'dana@example.c0m',
  ])('rejects %s', (value) => {
    expect(checkEmail(value)).toBe(EMAIL_MESSAGES.invalid);
  });

  it('asks for an address when empty, and flags very long ones', () => {
    expect(checkEmail('  ')).toBe(EMAIL_MESSAGES.empty);
    expect(checkEmail(`${'a'.repeat(250)}@example.com`)).toBe(EMAIL_MESSAGES.tooLong);
  });
});

describe('checkPreferredName (UC-REG-11)', () => {
  it('accepts any name up to 100 characters', () => {
    expect(checkPreferredName('Dana')).toBeNull();
    expect(checkPreferredName('Mx. Dana O’Neil-Ruiz')).toBeNull();
  });

  it('asks for a name, and limits length to the API maximum', () => {
    expect(checkPreferredName('   ')).toBe(NAME_MESSAGES.empty);
    expect(checkPreferredName('a'.repeat(101))).toBe(NAME_MESSAGES.tooLong);
  });
});
