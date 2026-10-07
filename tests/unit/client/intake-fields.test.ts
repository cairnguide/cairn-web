import { describe, expect, it } from 'vitest';
import type { FieldKey, Question } from '../../../src/client/api-types.ts';
import {
  JURISDICTIONS,
  isFieldKey,
  questionFor,
  rememberQuestion,
} from '../../../src/client/intake-fields.ts';

const FIELDS: FieldKey[] = [
  'user_role',
  'display_name',
  'date_of_death',
  'place_of_death',
  'residence_jurisdiction',
  'circumstance',
  'veteran_status',
  'estate_plan_status',
  'completed_items',
];

describe('intake field catalogue (for Edit on the review screen)', () => {
  it('has every data_fields question, each with Skip for now and I’m not sure', () => {
    for (const field of FIELDS) {
      const q = questionFor(field);
      expect(q.field).toBe(field);
      expect(q.skip).toEqual({ value: 'skipped', label: 'Skip for now' });
      expect(q.not_sure).toEqual({ value: 'unsure', label: "I'm not sure" });
    }
  });

  it('never offers free text for how it happened (UC-CASE-05)', () => {
    expect(questionFor('circumstance').free_text_allowed).toBe(false);
  });

  it('lists the 50 states, DC, and the 5 territories by full name', () => {
    expect(JURISDICTIONS).toHaveLength(56);
    expect(JURISDICTIONS.find((j) => j.value === 'MP')?.label).toBe('Northern Mariana Islands');
  });

  it('prefers a question the API sent in this visit', () => {
    const fromApi: Question = { ...questionFor('veteran_status'), prompt: 'Did they serve?' };
    rememberQuestion(fromApi);
    expect(questionFor('veteran_status').prompt).toBe('Did they serve?');
  });

  it('recognizes field keys and nothing else', () => {
    expect(isFieldKey('date_of_death')).toBe(true);
    expect(isFieldKey('ssn_last4')).toBe(false);
    expect(isFieldKey(null)).toBe(false);
  });
});
