/**
 * The parts of the Cairn API contract these screens use.
 * Source of truth: cairnguide/cairn-core api/openapi.json (OpenAPI 3.1).
 * Field names match the API exactly.
 */

export type SignInMethod = 'google' | 'apple' | 'email';
export type ConsentType = 'privacy_terms' | 'trial_terms' | 'ai_notice';
export type Voice = 'steady_direct' | 'warm_patient' | 'brisk_businesslike' | 'plain_practical';
export type ScreenId =
  | 'welcome'
  | 'privacy_terms'
  | 'trial_terms'
  | 'ai_notice'
  | 'declined'
  | 'preferred_name'
  | 'personality'
  | 'case_handoff'
  | 'ready'
  | 'paused';
export type AccountStatus =
  | 'pending_onboarding'
  | 'active_no_case'
  | 'trial_active'
  | 'read_only'
  | 'subscribed'
  | 'pending_deletion';
export type OnboardingStep =
  | 'account_created'
  | 'privacy_terms_accepted'
  | 'trial_terms_accepted'
  | 'ai_notice_accepted'
  | 'preferred_name_saved'
  | 'complete';

export interface Link {
  label: string;
  url: string;
}

export interface Note {
  kind: 'acknowledgment' | 'info' | 'legal' | 'crisis' | 'reminder' | 'account';
  text: string;
  legal_review_required?: boolean;
  source_urls?: string[];
  attorney_line?: string | null;
}

export interface Support {
  need_a_moment_label: string;
  crisis_resource: string;
}

export interface Option {
  value: string;
  label: string;
  available?: boolean;
  unavailable_reason?: string | null;
}

export interface NextStep {
  action: string;
  prompt: string;
  options?: Option[] | null;
}

export interface Checkbox {
  label: string;
  checked?: false;
  document_version: string;
}

export interface TextInput {
  prefill?: string | null;
  optional_link_label?: string | null;
  optional_prompt?: string | null;
}

export interface Choice {
  value: string;
  label: string;
  tagline?: string | null;
  sample?: string | null;
}

export interface Screen {
  id: ScreenId;
  acknowledgment?: string | null;
  body?: string[];
  legal_notice?: string[];
  sample_situation?: string | null;
  checkbox?: Checkbox | null;
  input?: TextInput | null;
  choices?: Choice[];
  links?: Link[];
  ai_provider?: string | null;
  legal_review_required?: boolean;
}

export interface AccountOut {
  id: string;
  email: string;
  sign_in_method: SignInMethod | null;
  preferred_name: string | null;
  name_pronunciation: string | null;
  voice: Voice;
  status: AccountStatus;
  onboarding_step: OnboardingStep;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_end_date: string | null;
  time_zone: string | null;
  ai_label: string | null;
}

export interface OnboardingResponse {
  account: AccountOut;
  screen: Screen;
  notes: Note[];
  support: Support;
  next_step: NextStep;
}

export interface PauseResponse {
  screen: Screen;
  support: Support;
  next_step: NextStep;
}

export interface SignInOption {
  method: SignInMethod;
  label: string;
  auth0_connection: string;
}

export interface WelcomeResponse {
  acknowledgment: string;
  methods: SignInOption[];
  sign_in_label: string;
  not_ready: Link;
  notes: Note[];
  support: Support;
}

export interface AccountResponse {
  account: AccountOut;
  notes: Note[];
}

/** RFC 9457 problem details, as returned by the API and the Worker. */
export interface Problem {
  type?: string;
  title?: string;
  status: number;
  code: string;
  detail: string;
  next_step?: NextStep;
  sign_in_method?: SignInMethod;
  document_version?: string;
}
