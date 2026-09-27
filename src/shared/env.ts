/**
 * Every environment variable cairn-web reads, in one place.
 *
 * The Worker validates its environment on every request (it is cheap) and
 * refuses to serve sign-in or the API proxy with a broken configuration.
 * `npm run check:env` runs the same checks against a .env file so a pipeline
 * can fail before deploying. Error messages name the variable, never its value.
 */

export type Environment = 'development' | 'test' | 'preview' | 'production';
export type EmailMode = 'passwordless' | 'password';

export interface AppConfig {
  environment: Environment;
  apiOrigin: string;
  apiTimeoutMs: number;
  auth0IssuerBaseUrl: string;
  auth0ClientId: string;
  auth0ClientSecret: string;
  auth0Audience: string;
  auth0EmailConnection: string;
  emailMode: EmailMode;
  sessionSecret: string;
  sessionMaxAgeSeconds: number;
  privacyPolicyUrl: string;
  termsUrl: string;
  supportUrl: string;
  siteUrl: string;
}

export interface EnvVarSpec {
  name: string;
  required: boolean;
  secret: boolean;
  description: string;
}

export const ENV_VARS: readonly EnvVarSpec[] = [
  {
    name: 'ENVIRONMENT',
    required: true,
    secret: false,
    description: 'development, test, preview, or production',
  },
  {
    name: 'CAIRN_API_ORIGIN',
    required: true,
    secret: false,
    description: 'Base URL of the Cairn API',
  },
  {
    name: 'CAIRN_API_TIMEOUT_MS',
    required: false,
    secret: false,
    description: 'API timeout in milliseconds',
  },
  { name: 'AUTH0_ISSUER_BASE_URL', required: true, secret: false, description: 'Auth0 tenant URL' },
  {
    name: 'AUTH0_CLIENT_ID',
    required: true,
    secret: false,
    description: 'Auth0 application client ID',
  },
  {
    name: 'AUTH0_CLIENT_SECRET',
    required: true,
    secret: true,
    description: 'Auth0 application client secret',
  },
  {
    name: 'AUTH0_AUDIENCE',
    required: true,
    secret: false,
    description: 'Cairn API identifier in Auth0',
  },
  {
    name: 'AUTH0_EMAIL_CONNECTION',
    required: false,
    secret: false,
    description: 'Auth0 connection for email',
  },
  {
    name: 'AUTH0_EMAIL_MODE',
    required: false,
    secret: false,
    description: 'passwordless or password',
  },
  { name: 'SESSION_SECRET', required: true, secret: true, description: '32+ random bytes, base64' },
  {
    name: 'SESSION_MAX_AGE_SECONDS',
    required: false,
    secret: false,
    description: 'Session lifetime in seconds',
  },
  {
    name: 'PRIVACY_POLICY_URL',
    required: true,
    secret: false,
    description: 'Public Privacy Policy URL',
  },
  { name: 'TERMS_URL', required: true, secret: false, description: 'Public Terms of Use URL' },
  { name: 'SUPPORT_URL', required: true, secret: false, description: 'Public support page URL' },
  {
    name: 'SITE_URL',
    required: true,
    secret: false,
    description: 'Marketing site URL (cairn-site)',
  },
];

const ENVIRONMENTS: readonly Environment[] = ['development', 'test', 'preview', 'production'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type ValidationResult = { ok: true; config: AppConfig } | { ok: false; errors: string[] };

function str(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * An absolute URL with no path, query, or fragment. https only, except
 * http://localhost in development and test.
 */
function checkOrigin(value: string, name: string, environment: string, errors: string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} must be an absolute URL.`);
    return '';
  }
  const localDev =
    url.protocol === 'http:' &&
    LOCAL_HOSTS.has(url.hostname) &&
    (environment === 'development' || environment === 'test');
  if (url.protocol !== 'https:' && !localDev) {
    errors.push(
      `${name} must use https (http is allowed only for localhost in development or test).`,
    );
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    errors.push(`${name} must be an origin only, with no path, query, or fragment.`);
  }
  if (url.username || url.password) {
    errors.push(`${name} must not contain credentials.`);
  }
  return url.origin;
}

function checkPublicUrl(
  value: string,
  name: string,
  environment: string,
  errors: string[],
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    errors.push(`${name} must be an absolute URL.`);
    return '';
  }
  const local =
    url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname) && environment !== 'production';
  if (url.protocol !== 'https:' && !local) {
    errors.push(`${name} must use https.`);
  }
  return url.toString();
}

function checkInt(
  value: string,
  name: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    errors.push(`${name} must be a whole number.`);
    return fallback;
  }
  const n = Number(value);
  if (n < min || n > max) {
    errors.push(`${name} must be between ${min} and ${max}.`);
    return fallback;
  }
  return n;
}

/** Decodes standard or URL-safe base64. Returns null if it is not base64. */
export function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const PLACEHOLDER = /^replace-with-/;

export function validateEnv(env: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  for (const spec of ENV_VARS) {
    if (spec.required && !str(env, spec.name)) {
      errors.push(`${spec.name} is not set (${spec.description}).`);
    }
  }

  const environment = str(env, 'ENVIRONMENT');
  if (environment && !ENVIRONMENTS.includes(environment as Environment)) {
    errors.push(`ENVIRONMENT must be one of: ${ENVIRONMENTS.join(', ')}.`);
  }

  const apiOrigin = str(env, 'CAIRN_API_ORIGIN')
    ? checkOrigin(str(env, 'CAIRN_API_ORIGIN'), 'CAIRN_API_ORIGIN', environment, errors)
    : '';
  const issuer = str(env, 'AUTH0_ISSUER_BASE_URL')
    ? checkOrigin(str(env, 'AUTH0_ISSUER_BASE_URL'), 'AUTH0_ISSUER_BASE_URL', environment, errors)
    : '';

  const secret = str(env, 'SESSION_SECRET');
  if (secret) {
    const bytes = decodeBase64(secret);
    if (!bytes || bytes.length < 32) {
      errors.push(
        'SESSION_SECRET must be at least 32 random bytes, base64 encoded (openssl rand -base64 32).',
      );
    }
  }

  for (const name of ['AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'SESSION_SECRET']) {
    if (PLACEHOLDER.test(str(env, name)) && environment === 'production') {
      errors.push(`${name} still has the placeholder value from .env.example.`);
    }
  }

  const emailMode = str(env, 'AUTH0_EMAIL_MODE') || 'passwordless';
  if (emailMode !== 'passwordless' && emailMode !== 'password') {
    errors.push('AUTH0_EMAIL_MODE must be passwordless or password.');
  }

  const emailConnection = str(env, 'AUTH0_EMAIL_CONNECTION') || 'email';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(emailConnection)) {
    errors.push('AUTH0_EMAIL_CONNECTION must be an Auth0 connection name.');
  }

  const urls = {
    privacyPolicyUrl: '',
    termsUrl: '',
    supportUrl: '',
    siteUrl: '',
  };
  const urlVars: [keyof typeof urls, string][] = [
    ['privacyPolicyUrl', 'PRIVACY_POLICY_URL'],
    ['termsUrl', 'TERMS_URL'],
    ['supportUrl', 'SUPPORT_URL'],
    ['siteUrl', 'SITE_URL'],
  ];
  for (const [key, name] of urlVars) {
    if (str(env, name)) urls[key] = checkPublicUrl(str(env, name), name, environment, errors);
  }

  const apiTimeoutMs = checkInt(
    str(env, 'CAIRN_API_TIMEOUT_MS'),
    'CAIRN_API_TIMEOUT_MS',
    15000,
    1000,
    60000,
    errors,
  );
  const sessionMaxAgeSeconds = checkInt(
    str(env, 'SESSION_MAX_AGE_SECONDS'),
    'SESSION_MAX_AGE_SECONDS',
    28800,
    300,
    60 * 60 * 24,
    errors,
  );

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      environment: environment as Environment,
      apiOrigin,
      apiTimeoutMs,
      auth0IssuerBaseUrl: issuer,
      auth0ClientId: str(env, 'AUTH0_CLIENT_ID'),
      auth0ClientSecret: str(env, 'AUTH0_CLIENT_SECRET'),
      auth0Audience: str(env, 'AUTH0_AUDIENCE'),
      auth0EmailConnection: emailConnection,
      emailMode: emailMode as EmailMode,
      sessionSecret: secret,
      sessionMaxAgeSeconds,
      ...urls,
    },
  };
}
