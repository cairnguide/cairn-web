/**
 * cairn-web Worker entry point.
 *
 * Static files (the built client) are served by Workers Static Assets. Only
 * the paths listed in wrangler.jsonc `assets.run_worker_first` reach this
 * code: sign-in (/auth/*), the API proxy (/api/*), runtime config
 * (/config.json), and pages that need a signed-in person (/setup, /cases,
 * /settings). Those pages are refused at the edge without a valid session,
 * before any HTML is sent.
 */
import { validateEnv, type AppConfig } from '../shared/env.ts';
import { isProtectedPath } from '../shared/paths.ts';
import {
  handleCallback,
  handleLinkGet,
  handleLoginGet,
  handleLoginPost,
  handleLogout,
  handleSession,
} from './auth.ts';
import { json, problem, redirect, secure } from './http.ts';
import { handleApi } from './proxy.ts';
import { readSession } from './session.ts';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  [variable: string]: unknown;
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

/** The public, non-secret settings the screens need. Served at /config.json. */
function publicConfig(config: AppConfig) {
  return {
    privacy_policy_url: config.privacyPolicyUrl,
    terms_url: config.termsUrl,
    support_url: config.supportUrl,
    site_url: config.siteUrl,
    email_mode: config.emailMode,
    environment: config.environment,
  };
}

async function serveAsset(request: Request, env: Env): Promise<Response> {
  const response = secure(await env.ASSETS.fetch(request));
  return response;
}

async function route(
  request: Request,
  env: Env,
  ctx: Context,
  config: AppConfig,
): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname.startsWith('/api/')) return handleApi(request, config);

  if (pathname === '/config.json') {
    if (method !== 'GET' && method !== 'HEAD')
      return problem(405, 'method_not_allowed', 'Use GET.');
    return json(publicConfig(config));
  }

  if (pathname === '/auth/login') {
    if (method === 'GET') return handleLoginGet(request, config);
    if (method === 'POST') return handleLoginPost(request, config);
    return problem(405, 'method_not_allowed', 'Use GET or POST.');
  }
  if (pathname === '/auth/link' && method === 'GET') return handleLinkGet(request, config);
  if (pathname === '/auth/callback' && method === 'GET') return handleCallback(request, config);
  if (pathname === '/auth/session' && method === 'GET') return handleSession(request, config);
  if (pathname === '/auth/logout' && method === 'POST') {
    return handleLogout(request, config, (p) => {
      ctx.waitUntil(p);
    });
  }
  if (pathname.startsWith('/auth/')) return problem(404, 'not_found', 'There is nothing here.');

  if (isProtectedPath(pathname)) {
    if (method !== 'GET' && method !== 'HEAD')
      return problem(405, 'method_not_allowed', 'Use GET.');
    const session = await readSession(request, config);
    if (!session) return redirect(`/auth/login?returnTo=${encodeURIComponent(pathname)}`);
  }

  return serveAsset(request, env);
}

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const result = validateEnv(env);
    if (!result.ok) {
      // Names only, never values. Visible in Workers Logs so the pipeline owner can fix it.
      console.error(`cairn-web configuration errors: ${result.errors.join(' ')}`);
      return problem(
        503,
        'not_configured',
        "Cairn isn't available right now. Please try again later. If you need help now, call or text 988.",
      );
    }
    try {
      return await route(request, env, ctx, result.config);
    } catch (error) {
      // Log the error type only. Messages can contain request details.
      console.error(
        `cairn-web unhandled error: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return problem(
        500,
        'internal_error',
        'Something went wrong on our side. Your information was not changed.',
      );
    }
  },
};
