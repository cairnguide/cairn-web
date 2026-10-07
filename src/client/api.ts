/**
 * Calls to the Cairn API, through this site's same-origin proxy (/api/v1/...).
 *
 * The Worker attaches the access token. The browser only sends its session
 * cookie (HttpOnly, so this code never sees it) and the X-Cairn-Client header
 * that the Worker's cross-site request forgery check requires.
 */
import type { Problem } from './api-types.ts';

/** Sent with every acknowledgment and stored on the consent record (AcknowledgmentIn.client). */
export const CLIENT_ID = `web/${__APP_VERSION__}`;

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.code);
    this.name = 'ApiError';
    this.status = problem.status;
    this.problem = problem;
  }
}

const FALLBACK_DETAIL =
  "We couldn't reach Cairn just now. Your information was not changed. Please try again in a moment.";

async function toProblem(response: Response): Promise<Problem> {
  try {
    const body = (await response.json()) as Partial<Problem>;
    if (typeof body.code === 'string' && typeof body.detail === 'string') {
      return { ...body, status: response.status, code: body.code, detail: body.detail };
    }
  } catch {
    // Not JSON. Fall through.
  }
  return { status: response.status, code: 'unexpected_response', detail: FALLBACK_DETAIL };
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Cairn-Client': 'web' },
    cache: 'no-store',
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError({ status: 0, code: 'network_error', detail: FALLBACK_DETAIL });
  }
  if (!response.ok) {
    const error = new ApiError(await toProblem(response));
    // The router signs out on a session timeout, wherever the request came from (UC-REG-19).
    if (error.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cairn:api-error', { detail: error }));
    }
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Adds query parameters, skipping undefined values. Ids and values are always encoded. */
export function withQuery(
  path: string,
  query: Record<string, string | number | boolean | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

/** Encodes one path segment (a case or task id from the API). */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', `/api${path}`),
  post: <T>(path: string, body?: unknown) => request<T>('POST', `/api${path}`, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', `/api${path}`, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', `/api${path}`, body),
  del: <T>(path: string) => request<T>('DELETE', `/api${path}`),
};
