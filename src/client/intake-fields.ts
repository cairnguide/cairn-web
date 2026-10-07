/**
 * The case creation questions (cairn-core case creation spec 3.2.0,
 * data_fields), for Edit on the review screen (UC-CASE-11).
 *
 * During intake the API sends each Question in full. Review only sends the
 * field and its prompt, so changing an answer uses this copy of the same
 * questions. Labels mirror cairn-core api/cairn_api/content/case-creation-copy.json
 * (label_<field>_<value>, question_<field>, jurisdiction_<code>). Questions the
 * API sent in this visit take precedence over this copy.
 */
import type { AnswerOption, FieldKey, Question } from './api-types.ts';

const opts = (pairs: [string, string][]): AnswerOption[] =>
  pairs.map(([value, label]) => ({ value, label }));

export const JURISDICTIONS: AnswerOption[] = opts([
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
  ['PR', 'Puerto Rico'],
  ['GU', 'Guam'],
  ['VI', 'U.S. Virgin Islands'],
  ['AS', 'American Samoa'],
  ['MP', 'Northern Mariana Islands'],
]);

const COMMON = {
  skip: { value: 'skipped', label: 'Skip for now' },
  not_sure: { value: 'unsure', label: "I'm not sure" },
  free_text_allowed: true,
  free_text_label: 'Or type your answer',
  speech_allowed: true,
};

const QUESTIONS: Record<FieldKey, Question> = {
  user_role: {
    ...COMMON,
    field: 'user_role',
    prompt: 'What is your connection to them?',
    input: 'choice',
    options: opts([
      ['spouse_partner', 'Their spouse or partner'],
      ['child', 'Their child'],
      ['other_family', 'Other family'],
      ['named_executor', 'Named executor'],
      ['power_of_attorney', 'I had power of attorney'],
      ['professional_fiduciary', 'Professional fiduciary'],
      ['friend', 'A friend'],
      ['other', 'Something else'],
      ['prefer_not_to_say', "I'd rather not say"],
    ]),
  },
  display_name: {
    ...COMMON,
    field: 'display_name',
    prompt: 'What would you like me to call them?',
    input: 'text',
    options: [],
  },
  date_of_death: {
    ...COMMON,
    field: 'date_of_death',
    prompt: 'When did they die?',
    input: 'date_of_death',
    options: opts([
      ['today', 'Today'],
      ['this_week', 'Earlier this week'],
      ['exact', 'Pick the date'],
    ]),
  },
  place_of_death: {
    ...COMMON,
    field: 'place_of_death',
    prompt: 'Where did the death happen?',
    input: 'place_of_death',
    options: opts([
      ['state', 'Choose the state or territory'],
      ['outside_us', 'Outside the United States'],
      ['away_from_home', 'It happened away from home'],
    ]),
    picker_label: 'State or territory',
    jurisdictions: JURISDICTIONS,
  },
  residence_jurisdiction: {
    ...COMMON,
    field: 'residence_jurisdiction',
    prompt: 'Did they live somewhere else?',
    input: 'residence_jurisdiction',
    options: opts([
      ['same_as_place_of_death', 'No, the same place'],
      ['different', 'Yes, somewhere else'],
      ['unknown', "I don't know"],
    ]),
    picker_label: 'State or territory',
    jurisdictions: JURISDICTIONS,
  },
  circumstance: {
    ...COMMON,
    field: 'circumstance',
    prompt: 'Had they been ill, or was it sudden?',
    input: 'choice',
    free_text_allowed: false,
    options: opts([
      ['expected_illness_or_hospice', 'They had been ill, or were in hospice'],
      ['sudden_natural', 'It was sudden'],
      ['accident_or_unexpected', 'An accident or something unexpected'],
      ['under_investigation', "It's being looked into"],
      ['prefer_not_to_say', "I'd rather not say"],
    ]),
  },
  veteran_status: {
    ...COMMON,
    field: 'veteran_status',
    prompt: 'Did they ever serve in the military?',
    input: 'choice',
    options: opts([
      ['yes', 'Yes'],
      ['no', 'No'],
      ['unknown', "I don't know"],
    ]),
  },
  estate_plan_status: {
    ...COMMON,
    field: 'estate_plan_status',
    prompt: 'Did they have a will or estate plan?',
    input: 'choice',
    options: opts([
      ['yes_location_known', 'Yes, and I know where it is'],
      ['yes_location_unknown', "Yes, but I'm not sure where it is"],
      ['no', 'No'],
      ['unknown', "I don't know"],
    ]),
  },
  completed_items: {
    ...COMMON,
    field: 'completed_items',
    prompt:
      "Has anything already been taken care of? Select anything that's done. It's fine if nothing is.",
    input: 'multi_choice',
    options: opts([
      ['death_pronounced', 'The death was pronounced'],
      ['home_pets_vehicles_secured', 'Their home, pets, and car are safe'],
      ['funeral_provider_chosen', 'We chose a funeral home'],
      ['funeral_home_has_ssn', 'The funeral home has their Social Security number'],
      ['certificates_ordered', 'Death certificates are ordered'],
      ['ssa_notified', 'Social Security knows'],
      ['bank_insurer_or_employer_notified', 'A bank, insurer, or employer knows'],
      ['other', 'Something else'],
      ['none_or_unsure', "Nothing yet, or I'm not sure"],
    ]),
    handled_elsewhere_label: 'Someone else is handling this',
  },
};

/** Questions the API sent during this visit, which win over the copy above. */
const seen = new Map<FieldKey, Question>();

export function rememberQuestion(question: Question): void {
  seen.set(question.field, question);
}

export function questionFor(field: FieldKey): Question {
  return seen.get(field) ?? QUESTIONS[field];
}

export function isFieldKey(value: string | null): value is FieldKey {
  return value !== null && value in QUESTIONS;
}
