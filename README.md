# cairn-web

The web front end for Cairn: creating an account and signing in, account setup, the home screen, Settings, Take a
break, subscribing, creating a case, the journey, and its tasks. It follows the
[Cairn MVP Wireframes](https://claude.ai/artifact/Mv1JfsLPy7GsfuyBCu71md) (the "Registration (UC-REG)" page, and the
"Earlier draft (UC-1 to UC-13)" page for case creation, the journey, tasks, and status) and implements every use case
the Cairn API in [cairnguide/cairn-core](https://github.com/cairnguide/cairn-core) supports. It is hosted on
Cloudflare Workers, the same way as the marketing site [cairnguide/cairn-site](https://github.com/cairnguide/cairn-site).

Cairn is an AI guide that walks a family through what has to be done after someone dies. The people using these
screens are grieving, so the screens follow the wireframes closely: one question per screen, plain language, large
touch targets, a way to pause on every screen, and the 988 crisis line on every page.

## Contents

- [What is in this repository](#what-is-in-this-repository)
- [Screens and routes](#screens-and-routes)
- [How it works](#how-it-works)
- [Security and privacy](#security-and-privacy)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Auth0 setup for cairn-web](#auth0-setup-for-cairn-web)
- [Deploying to Cloudflare](#deploying-to-cloudflare)
- [Project layout](#project-layout)
- [npm scripts](#npm-scripts)
- [Testing](#testing)
- [CI and branch protection](#ci-and-branch-protection)
- [Decisions and differences from the wireframes](#decisions-and-differences-from-the-wireframes)
- [Copy that needs product and legal review](#copy-that-needs-product-and-legal-review)
- [Contributing](#contributing)
- [References](#references)

## What is in this repository

| Part        | What it does                                                                                                                                                                                     | Where         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Browser app | Every screen in [Screens and routes](#screens-and-routes), written in TypeScript with no UI framework. Built by Vite into static files.                                                          | `src/client/` |
| Worker      | A Cloudflare Worker that owns sign-in with Auth0, keeps the session in an encrypted cookie, protects every account page, and forwards API calls to the Cairn API with the person's access token. | `src/worker/` |
| Shared code | Environment variable rules, security headers, and the list of protected pages, used by both.                                                                                                     | `src/shared/` |
| Tests       | Unit tests (Vitest) and browser use case tests (Playwright) with a mock Auth0 and mock Cairn API.                                                                                                | `tests/`      |
| CI          | Lint, security, unit, build, and use case checks on every pull request, with a ruleset that blocks merging until they pass.                                                                      | `.github/`    |

## Screens and routes

Every screen maps to the Cairn API endpoints and use cases in cairn-core
([`api/README.md`](https://github.com/cairnguide/cairn-core/blob/main/api/README.md), use case suite of 2026-10-06:
account 3.2.0, case creation 3.2.0, Take a break 3.2.0, Support and Crisis Plan 3.2.0, subscription 3.3.0). The API
contract is copied to [`contract/openapi.json`](contract/openapi.json), and the TypeScript types in
`src/client/api-schema.ts` are generated from it (`npm run api:types`), so a contract change shows up as a type error.

### Signed out

| Route           | Screen                                         | API endpoint                            | Use case              |
| --------------- | ---------------------------------------------- | --------------------------------------- | --------------------- |
| `/`             | Start: choose how to sign up (wireframe 1)     | `GET /v1/welcome`                       | UC-REG-01 to 03       |
| `/signup/email` | Email sign-up (wireframe 2)                    | Auth0 (`POST /auth/login`)              | UC-REG-04             |
| `/support`      | Support resources (988, Veterans, Crisis Text) | `GET /v1/support-resources`             | Crisis plan, AC-26-10 |
| `/sign-in-help` | I can't get into my email                      | `GET /v1/sign-in-help?method=`          | UC-REG-20             |
| `/break`        | Take a break before sign-in (S-01)             | `GET /v1/break`                         | UC-BRK-02             |
| `/signed-out`   | Signed out, timed out, or account deleted      | `GET /v1/welcome` (session policy copy) | UC-REG-19, UC-ACCT-01 |

### Account setup (one question per screen, in the account spec's onboarding_sequence)

| Route                  | Screen                                | API endpoint                                                             | Use case                |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| `/setup`               | Where every sign-in lands             | `POST /v1/registrations` (time zone only)                                | UC-REG-02 to 05, 13, 18 |
| `/setup/verify`        | Confirm email (wireframe 3)           | Auth0 silent re-check                                                    | UC-REG-04               |
| `/setup/adult`         | Are you 18 or older?                  | `POST /v1/onboarding/adult`                                              | UC-REG-06               |
| `/setup/under-18`      | Cairn is for adults                   | (the API's under_18 screen)                                              | UC-REG-06               |
| `/setup/privacy`       | Privacy and Terms (wireframe 4)       | `POST /v1/onboarding/acknowledgments/privacy_terms`                      | UC-REG-07               |
| `/setup/trial`         | 28 free days (wireframe 5)            | `POST /v1/onboarding/acknowledgments/trial_terms`                        | UC-REG-08               |
| `/setup/about-cairn`   | AI guide notice, SB 243 (wireframe 6) | `POST /v1/onboarding/acknowledgments/ai_notice`                          | UC-REG-09               |
| `/setup/declined`      | "I'm not sure"                        | same endpoints with `agreed: false`                                      | UC-REG-10               |
| `/setup/name`          | Preferred name, typing or speaking    | `PUT /v1/onboarding/preferred-name`                                      | UC-REG-11               |
| `/setup/voice`         | Choose how Cairn talks (wireframe 9)  | `PUT /v1/onboarding/personality`                                         | UC-REG-12               |
| `/setup/notifications` | How Cairn lets you know               | `PUT /v1/onboarding/notification-channels`                               | UC-REG-15               |
| `/setup/reminders`     | How often                             | `PUT /v1/onboarding/notification-frequency`                              | UC-REG-15               |
| `/setup/done`          | All set, with a summary to change     | (the API's setup_complete screen)                                        | UC-REG-16               |
| `/setup/paused`        | Distress during setup, 988, check-in  | `GET /v1/onboarding?offer_check_in=true`, `POST /v1/onboarding/check-in` | UC-REG-14, DEC-26-04    |

### Signed in

| Route                      | Screen                                                        | API endpoints                                                                                           | Use case                           |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `/home`                    | Home: greeting, AI reminder, banner, subscribe prompt, cases  | `GET /v1/home`                                                                                          | UC-CASE-25, UC-REG-18, UC-SUB-01   |
| `/break`                   | Take a break: S-02, S-02b, S-04 to S-07                       | `GET`, `POST`, `PUT`, `DELETE /v1/me/break`                                                             | UC-BRK-01, 03, 05 to 11            |
| `/settings`                | Settings: name, pronunciation, voice, and links to the rest   | `GET`, `PATCH /v1/me`                                                                                   | UC-REG-17                          |
| `/settings/notifications`  | Channels, how often, quiet hours, lead time, inactivity, stop | `GET`, `PATCH /v1/me/notification-preferences`                                                          | UC-REG-17                          |
| `/settings/subscription`   | Status, payment details, past payments, cancel, undo          | `GET /v1/me/subscription`, `.../portal`, `.../confirm-payment`, `.../cancel`, `.../undo-cancel`         | UC-SUB-10 to 14, 23                |
| `/settings/sign-in`        | Add or remove another way to sign in                          | `/auth/link` then `POST /v1/me/sign-in-methods`, `DELETE /v1/me/sign-in-methods/{method}`               | UC-REG-05                          |
| `/settings/download`       | Download all my data (JSON)                                   | `GET /v1/me/data-export`, `GET /v1/me/data-export/file`                                                 | UC-REG-16 (data)                   |
| `/settings/delete`         | Delete my account, one button                                 | `GET`, `POST /v1/me/deletion`                                                                           | UC-ACCT-01                         |
| `/settings/ask`            | Ask Cairn about the account                                   | `POST /v1/me/messages`                                                                                  | Account requests in chat           |
| `/subscription/terms`      | Price and renewal terms, then Stripe Checkout                 | `GET /v1/me/subscription/terms`, `POST /v1/me/subscription/checkout`                                    | UC-SUB-02, 03                      |
| `/subscription/return`     | Back from Stripe                                              | `GET /v1/me/subscription/checkout-result`                                                               | UC-SUB-04, 05                      |
| `/cases`                   | Your cases, drafts included                                   | `GET /v1/cases`                                                                                         | UC-CASE-10, 18                     |
| `/cases/start`             | How you're connected, then a new draft                        | `POST /v1/onboarding/case-handoff`, `POST /v1/cases`                                                    | UC-CASE-01, 18, UC-3, UC-4         |
| `/cases/:id`               | The case conversation (all intake turns)                      | `GET /v1/cases/{id}`, every `/intake/*` endpoint, `POST .../take-a-break`                               | UC-CASE-01 to 10, 14 to 17, 22, 24 |
| `/cases/:id?edit=<field>`  | Change one answer                                             | `PUT /v1/cases/{id}/intake/answers/{field}`                                                             | UC-CASE-11                         |
| `/cases/:id/review`        | What you told me, what we can figure out later                | `GET /v1/cases/{id}/review`                                                                             | UC-CASE-11                         |
| `/cases/:id/preview`       | The journey that fits, Start journey, Not yet                 | `GET .../journey/preview`, `POST .../journey/start`, `POST .../journey/not-yet`                         | UC-CASE-12                         |
| `/cases/:id/keep-in-touch` | Due date lead time, then inactivity notices                   | `GET`, `PUT /v1/cases/{id}/keep-in-touch`                                                               | UC-CASE-19                         |
| `/cases/:id/start`         | What feels doable right now?                                  | `POST .../journey/first-task`                                                                           | UC-CASE-13                         |
| `/cases/:id/journey`       | One next action, then the weeks; resting check-in             | `GET .../journey`, `POST .../journey/resume`                                                            | UC-9, UC-12                        |
| `/cases/:id/status`        | Everything done, in progress, and next, by area               | `GET .../status`                                                                                        | UC-13                              |
| `/cases/:id/tasks/:taskId` | Guidance, sources, certificates, notices, status, snooze      | `GET`, `PATCH .../tasks/{id}`, `.../certificate-order`, `.../institution-notices`, `PATCH .../deceased` | UC-10, UC-11                       |
| `/cases/:id/delete`        | Delete now or in 7 days, or keep a case on hold               | `GET`, `POST`, `DELETE /v1/cases/{id}/deletion`                                                         | UC-END-13, UC-CASE-21              |

The API decides what comes next. After any sign-in, `/setup` asks the API where the person is: unfinished setup
resumes at the first incomplete step (UC-REG-13), and finished setup goes to `/home?session_start=1`, where
`GET /v1/home` routes on (a break's resting screen first, a draft to resume, or home). In a case, every turn's
`next_step.action` picks what the page shows, and the client keeps the turn's `IntakeSession` in memory and sends it
back with the next one.

### On every screen

- **Take a break** in the header: one select, no confirmation (UC-BRK-01). In a case conversation it calls
  `POST /v1/cases/{id}/take-a-break` so it saves where the person left off first.
- **Support resources** in the header and footer, signed in or not (crisis plan AC-26-10).
- **Read aloud** and **Read this to me** (on-device voices only), and **Text size**.
- Signed in: **Settings** and **Sign out**. After 4 minutes 40 seconds with no activity a dialog offers "Stay signed
  in", and at 5 minutes the person is signed out and told why (UC-REG-19, D-20). No countdown numbers are shown.
- The footer's Privacy Policy, Terms of Use, "Cairn is an AI guide, not a human", and the 988 line.

## How it works

```
 Browser                     Cloudflare (cairn-web Worker)                Auth0            Cairn API
 ───────                     ─────────────────────────────                ─────            ─────────
 GET /                  ──►  static file (index.html, /assets/*)
 click "Continue with   ──►  GET /auth/login?method=google
 Google"                     creates state, nonce, PKCE verifier  ──────► /authorize
                                                                          (Google sign-in)
                        ◄──  302 back to /auth/callback?code=…   ◄──────
                             exchanges the code (client secret)  ──────► /oauth/token
                             verifies the ID token (JWKS)
                             sets encrypted HttpOnly session cookie
 GET /setup             ──►  checks the session, serves the page
 POST /api/v1/registrations  adds "Authorization: Bearer <token>" ─────────────────────► /v1/registrations
                        ◄──  passes the answer back (no cookies, no tokens)  ◄──────────
```

- **Static assets.** Vite builds `src/client` into `dist/client`, and Workers Static Assets serves it with the
  headers in `public/_headers`. Unknown paths serve `index.html` so the client router can show the right screen.
- **Worker first for sensitive paths.** `wrangler.jsonc` lists `/auth/*`, `/api/*`, `/config.json`, `/setup`,
  `/setup/*`, `/home`, `/cases`, `/cases/*`, `/settings`, `/settings/*`, `/subscription`, and `/subscription/*` in
  `assets.run_worker_first`. Those requests reach the Worker before
  any file is served, so a signed-out visitor never receives an account page.
- **Backend for frontend.** The browser never holds an Auth0 token. The Worker keeps the access token and refresh
  token inside an AES-256-GCM encrypted, `HttpOnly` cookie, and adds the access token when it forwards a call from
  `/api/v1/...` to `CAIRN_API_ORIGIN/v1/...`. This is the pattern the IETF recommends for browser apps
  ([OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)).
- **Same origin.** Because the API is reached through this origin, the Cairn API needs no CORS settings, and the
  page's Content Security Policy can stay `connect-src 'self'`.
- **Runtime config.** Public settings (Privacy Policy, Terms, support, and site links, and the email sign-in mode)
  come from `GET /config.json`, built from environment variables. The same build can be deployed to preview and
  production.

## Security and privacy

The screens are held to the same Privacy Policy, Terms of Use, and security rules as the rest of Cairn
(see cairn-core's [`api/README.md`](https://github.com/cairnguide/cairn-core/blob/main/api/README.md), "Security
choices", and [`auth0/README.md`](https://github.com/cairnguide/cairn-core/blob/main/auth0/README.md)).

### Authentication and sessions

- **Auth0 owns every credential.** Google, Apple, the email link, and any password or passkey are handled by Auth0.
  Cairn never sees a password, matching cairn-core ("Cairn never sees a password").
- **Authorization code flow with PKCE (S256), `state`, and `nonce`,** using a confidential client. The ID token is
  verified against Auth0's JWKS (issuer, audience, RS256 only, nonce).
- **Every account page needs a session,** checked at the edge before any HTML is sent. The API proxy refuses every
  private endpoint without one. Only six API endpoints are public, the same ones the API itself allows without a
  token: `GET /v1/welcome`, `GET /v1/sign-in-methods`, `GET /v1/policies`, `GET /v1/support-resources`,
  `GET /v1/sign-in-help`, and `GET /v1/break`.
- **Only the email scope.** Sign-in asks Auth0 for `openid email offline_access`, never `profile`, so no name or
  photo from Google or Apple is requested or stored (account spec D-16 and data_boundary). Cairn asks what to call
  the person instead.
- **Adding a second sign-in method** (UC-REG-05) goes through `/auth/link?method=`: the person signs in once more with
  the new method (`prompt=login`), and the Worker hands that token to `POST /v1/me/sign-in-methods` while keeping the
  original session. Accounts are never linked any other way.
- **Signing out** tells the API (`POST /v1/me/sign-out`), revokes the refresh token, clears the cookie, ends the
  Auth0 session, and lands on `/signed-out`, so the back button shows no case data.
- **Session cookie:** `__Host-cairn_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, sealed
  with AES-256-GCM using a key derived from `SESSION_SECRET` by HKDF. Page JavaScript can't read it, and tampering
  makes it invalid. It lasts at most `SESSION_MAX_AGE_SECONDS` (8 hours by default).
- **Refresh tokens rotate.** The Worker refreshes the access token a minute before it expires and stores the new
  refresh token. Signing out revokes the refresh token and ends the Auth0 session.
- **Cross-site request forgery:** every state-changing request must come from this origin (`Origin` header) and carry
  the `X-Cairn-Client: web` header, which a cross-site form can't send. See the
  [OWASP CSRF cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- **No open redirects.** The place to return to after sign-in must be a protected path on this site
  (`src/shared/paths.ts`).
- **Accounts are never linked automatically.** If an email already has an account made another way, the API answers
  409 and the screen offers the method used last time (UC-REG-05).

### Browser hardening

- **Content Security Policy** with `default-src 'none'`, scripts, styles, and fonts only from this origin, no inline
  code, `frame-ancestors 'none'`, and **Trusted Types required** (`require-trusted-types-for 'script'`). The only
  policy allowed, `cairn-push`, returns exactly one URL, the browser notification service worker
  (`public/push-sw.js`). The app builds the page with DOM methods only (`src/client/dom.ts`), and ESLint blocks
  `innerHTML`.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and a
  `Permissions-Policy` that allows only the microphone, and only for this origin.
- The headers live in one place (`src/shared/security-headers.ts`). `public/_headers` is generated from it, and CI
  fails if they drift.

### Personal information

- **Nothing personal is stored in the browser.** No tokens, emails, or names in `localStorage`, `sessionStorage`, or
  readable cookies. Only the text size and read-aloud preferences are kept on the device. The care level and the
  `IntakeSession` from a case conversation live in memory only and are cleared on sign-out (crisis plan decision 7).
- **Free text is shown back masked.** After a message, only the API's `masked_text` is displayed, and nothing from
  free text or speech is saved until the person confirms Cairn's read-back. Task forms have no field for account
  numbers. A legal name and date of birth are asked only inside the certificate task, and only if the office asks.
- **Browser notifications** are asked for only after the person chooses them and selects Continue, never on page
  load. The pushes carry no content: the service worker only says there is something waiting in Cairn.
- **Payments happen on Stripe.** Cairn shows the terms, then sends the person to Stripe Checkout and the customer
  portal. The result is read from Cairn's own status, so visiting the return page grants nothing.
- **Only a masked email** (`d•••@example.com`) is kept in the session, for "Signed in as".
- **The typed email never appears in a Cairn URL.** The email screen sends it in a POST body, so it stays out of
  browser history and request logs.
- **No personal data in logs.** The Worker logs configuration problems by variable name and unexpected errors by
  error type only.
- **Fonts are self-hosted** (Fraunces and Karla, the same typefaces as cairn-site), so no request goes to Google
  Fonts and no visitor IP address is shared with a third party.
- **Speech stays on the device.** Listen only uses voices that report `localService`, and Speak only appears when the
  browser confirms on-device recognition (`processLocally`). Otherwise the buttons are not shown. This keeps the
  wireframe's promise: "When you speak, your voice is only turned into text. The recording is never kept."
- **Consent is exact.** The words on the Privacy and Terms, 28 free days, and AI notice screens always come from the
  API, and the `document_version` shown is the one sent back, so the consent record matches what the person read.
  Checkboxes are never pre-checked.
- **The AI provider is named** on the Privacy and Terms screen before anything is sent to it (UC-REG-07).
- **Crisis resources on every page:** the footer's "In crisis? Call or text 988", the AI notice's 988 callout,
  Support resources, and Take a break. At care level 4, 988 is the first thing on the screen.

### Accessibility

WCAG 2.2 AA is checked with axe on every screen, in light and dark mode. Touch targets are at least 44px, text
scales with the header's Text size control, focus moves to the heading on each new screen, there is a skip link,
every new-tab link says so, and errors are tied to their fields with `aria-describedby`.

## Getting started

### Requirements

- Node.js 22.18 or later (`.nvmrc` says 22). Scripts in `scripts/` and the mock server are TypeScript run directly
  by Node's type stripping.
- npm 10 or later.
- For real sign-in: an Auth0 tenant set up as in [Auth0 setup for cairn-web](#auth0-setup-for-cairn-web), and a
  running Cairn API ([cairn-core `api/README.md`, "Running"](https://github.com/cairnguide/cairn-core/blob/main/api/README.md#running)).

### Try it with no Auth0 or API

```sh
npm ci
npm run dev:mock
# open http://localhost:8787
```

`dev:mock` starts the mock Auth0 and mock Cairn API from the tests (`tests/e2e/mock-server.ts`) and runs the real
Worker against them. Every sign-in succeeds as "Dana".

### Run against your Auth0 tenant and Cairn API

```sh
npm ci
cp .env.example .env
openssl rand -base64 32          # paste the output into SESSION_SECRET in .env
# fill in the Auth0 and API values in .env
npm run check:env                # validates .env without printing any values
npm run dev                      # builds the client and runs `wrangler dev` on http://localhost:8787
```

Wrangler reads `.env` automatically for `wrangler dev`
([Cloudflare docs: local development with .env](https://developers.cloudflare.com/workers/configuration/environment-variables/)).
While changing client code, run `npm run dev:client` in a second terminal to rebuild on save.

## Environment variables

Every variable is documented in [`.env.example`](.env.example) and validated by `src/shared/env.ts`. The Worker
refuses to serve sign-in or the API with an invalid configuration, and `npm run check:env -- <file>` runs the same
checks in a pipeline. Errors name the variable, never its value.

| Variable                  | Required | Secret  | What it is                                                                                                                  |
| ------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`             | Yes      | No      | `development`, `test`, `preview`, or `production`. `http://localhost` URLs are only accepted in development and test.       |
| `CAIRN_API_ORIGIN`        | Yes      | No      | Base URL of the Cairn API, no path. `/api/v1/*` is forwarded to `<origin>/v1/*`.                                            |
| `CAIRN_API_TIMEOUT_MS`    | No       | No      | API and Auth0 timeout. Default 15000.                                                                                       |
| `AUTH0_ISSUER_BASE_URL`   | Yes      | No      | The Auth0 tenant or custom domain, for example `https://cairn.us.auth0.com`. Same tenant as the API's `CAIRN_AUTH0_DOMAIN`. |
| `AUTH0_CLIENT_ID`         | Yes      | No      | The cairn-web application in Auth0.                                                                                         |
| `AUTH0_CLIENT_SECRET`     | Yes      | **Yes** | That application's client secret.                                                                                           |
| `AUTH0_AUDIENCE`          | Yes      | No      | The Cairn API identifier. Must equal the API's `CAIRN_AUTH0_AUDIENCE`.                                                      |
| `AUTH0_EMAIL_CONNECTION`  | No       | No      | Connection for "Continue with email". Must equal the API's `CAIRN_AUTH0_EMAIL_CONNECTION`. Default `email`.                 |
| `AUTH0_EMAIL_MODE`        | No       | No      | `passwordless` (default, an emailed link) or `password`. Changes the words on the email screen.                             |
| `SESSION_SECRET`          | Yes      | **Yes** | At least 32 random bytes, base64 (`openssl rand -base64 32`). Rotating it signs everyone out.                               |
| `SESSION_MAX_AGE_SECONDS` | No       | No      | Longest a sign-in lasts. Default 28800 (8 hours). Between 300 and 86400.                                                    |
| `PRIVACY_POLICY_URL`      | Yes      | No      | Linked in every footer.                                                                                                     |
| `TERMS_URL`               | Yes      | No      | Linked in every footer.                                                                                                     |
| `SUPPORT_URL`             | Yes      | No      | The Help button, and "Contact support".                                                                                     |
| `SITE_URL`                | Yes      | No      | The marketing site (cairn-site).                                                                                            |

`.gitignore` blocks every `.env*` file except `.env.example`, and `.dev.vars`, so real values can't be committed.

## Auth0 setup for cairn-web

Use the same tenant, connections, API, and post-login Action as the Cairn API
([cairn-core `auth0/README.md`](https://github.com/cairnguide/cairn-core/blob/main/auth0/README.md)). Then add an
application for this site:

1. **Applications > Create Application > Regular Web Application**, named `cairn-web`. (A Regular Web Application,
   not a Single Page Application, because the Worker is a confidential client that keeps the secret.)
2. **Allowed Callback URLs:** `https://<your domain>/auth/callback`, plus preview URLs such as
   `https://*-cairn-web.<account>.workers.dev/auth/callback`, plus `http://localhost:8787/auth/callback` for local
   development tenants only.
3. **Allowed Logout URLs:** `https://<your domain>/signed-out`, `https://<your domain>/signed-out?reason=timeout`,
   and `https://<your domain>/signed-out?reason=deleted`, with the same paths for preview and local origins.
4. **Allowed Web Origins:** leave empty. The browser never talks to Auth0 from JavaScript.
5. **Advanced Settings > Grant Types:** Authorization Code and Refresh Token only.
6. **Refresh Token Rotation:** on, with reuse detection, and an absolute lifetime no longer than
   `SESSION_MAX_AGE_SECONDS`.
7. **Connections:** enable exactly `google-oauth2`, `apple`, and the email connection, as for the API.
8. **APIs:** allow this application to request the Cairn API audience (`AUTH0_AUDIENCE`), with Allow Offline Access
   on so refresh tokens are issued.

Auth0 docs: [Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce),
[Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation),
[Logout](https://auth0.com/docs/authenticate/login/logout).

## Deploying to Cloudflare

cairn-web deploys like cairn-site: Cloudflare **Workers Builds** watches this repository and deploys on every push
([Workers Builds docs](https://developers.cloudflare.com/workers/ci-cd/builds/)).

In the Cloudflare dashboard, **Workers & Pages > cairn-web > Settings > Build**:

| Setting                                   | Value                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Build command                             | `npm ci && npm run build`                                                                          |
| Deploy command (production branch `main`) | `npx wrangler deploy`                                                                              |
| Non-production branch deploy command      | `npx wrangler preview` (same as cairn-site. `previews: {}` in `wrangler.jsonc` is required for it) |
| Root directory                            | `/`                                                                                                |

`name` in `wrangler.jsonc` (`cairn-web`) must match the Worker's name in the dashboard.

### Providing the environment variables

The deployment pipeline owns the values. Two ways, pick one per environment:

1. **Dashboard:** **Workers & Pages > cairn-web > Settings > Variables and Secrets**. Add every variable from the
   table above. Mark `AUTH0_CLIENT_SECRET` and `SESSION_SECRET` as secrets (encrypted).
2. **From a `.env` file in the pipeline:** have the pipeline write `.env.production` (or `.env.preview`) from its
   secret store, then run:

   ```sh
   npm run check:env -- .env.production     # fail early, prints no values
   npm run env:push  -- .env.production     # validates, then `wrangler secret bulk` (all values stored encrypted)
   ```

   This needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the pipeline
   ([`wrangler secret bulk`](https://developers.cloudflare.com/workers/wrangler/commands/)).

`keep_vars: true` in `wrangler.jsonc` keeps dashboard values when a new version deploys. If a value is missing or
wrong, the Worker answers 503 with a calm message and the 988 line, and Workers Logs name the variable.

### Custom domain

Add the app's domain under **Settings > Domains & Routes**. Use a different hostname from cairn-site (for example
`app.` for this app). The session cookie is host-only (`__Host-`), so no other subdomain can read it.

## Project layout

```
wrangler.jsonc               Cloudflare Worker config (name, assets, run_worker_first, previews)
.env.example                 every environment variable, documented
contract/openapi.json        copy of cairn-core api/openapi.json, the API contract
index.html                   the page shell Vite builds from
public/                      copied as-is into the build
  _headers                   security and cache headers (generated, see npm run check:headers)
  push-sw.js                 browser notification service worker (content-free pushes)
  favicon.svg, robots.txt
src/
  shared/
    env.ts                   environment variable rules (Worker and scripts)
    security-headers.ts      CSP and security headers (Worker and public/_headers)
    paths.ts                 protected pages and safe return paths
  worker/
    index.ts                 routing
    auth.ts                  /auth/login, /auth/link, /auth/callback, /auth/session, /auth/logout, token refresh
    proxy.ts                 /api/v1/* to the Cairn API
    session.ts               the encrypted session cookie
    crypto.ts                AES-GCM sealing, PKCE, base64url
    http.ts                  responses, cookies, CSRF check
  client/
    main.ts                  routes (loaded on demand) and startup
    router.ts                history router with :params, focus and title handling, timeout sign-out
    dom.ts                   builds DOM without HTML strings
    api.ts                   calls through /api
    api-schema.ts            generated from contract/openapi.json (npm run api:types)
    api-types.ts             named types from api-schema.ts
    state.ts                 config, session, onboarding, care level, intake sessions (memory only)
    session-timeout.ts       the 5-minute inactivity warning and sign-out
    onboarding.ts            API screen to route, and the setup steps
    intake-fields.ts         the case questions, for Edit on the review screen
    push.ts                  browser notification permission and subscription
    preferences.ts           text size and read aloud
    speech.ts                on-device Listen and Speak
    validation.ts            email and name checks
    components/              header, step list, footer, buttons, callouts, fields, notes, options
    pages/                   one file per area (see Screens and routes)
    styles/                  tokens (light and dark), base, layout, components, pages, app
tests/
  unit/                      Vitest: worker/, shared/, client/
  e2e/                       Playwright use case tests, mock-server.ts (Auth0, Stripe), mock-api.ts (Cairn API)
scripts/                     api-types, check-env, check-headers, push-env, dev-mock
.github/                     workflows, ruleset, Dependabot, PR template
```

## npm scripts

| Script                                  | What it does                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`                           | Build the client, then `wrangler dev` with `.env` on http://localhost:8787.                |
| `npm run dev:mock`                      | Same, with the mock Auth0 and mock API. No accounts needed.                                |
| `npm run dev:client`                    | Rebuild the client on every save (use with `dev`).                                         |
| `npm run build`                         | Build the client into `dist/client`.                                                       |
| `npm run deploy`                        | Build and `wrangler deploy` (Workers Builds normally does this).                           |
| `npm run typecheck`                     | `tsc --noEmit`.                                                                            |
| `npm run lint`                          | ESLint (with security rules), Stylelint, and Prettier.                                     |
| `npm run format`                        | Prettier, writing changes.                                                                 |
| `npm test`                              | Unit tests.                                                                                |
| `npm run test:unit`                     | Unit tests with coverage thresholds (80% lines).                                           |
| `npm run test:e2e`                      | Browser use case tests. Starts the mock server and `wrangler dev` itself.                  |
| `npm run check:env -- <file>`           | Validate an env file without printing values.                                              |
| `npm run check:headers`                 | Fail if `public/_headers` drifted from the Worker's headers (`-- --write` regenerates it). |
| `npm run env:push -- <file>`            | Validate an env file and upload it as Worker secrets.                                      |
| `npm run api:types [-- <openapi.json>]` | Copy a newer cairn-core contract in (optional) and regenerate `src/client/api-schema.ts`.  |

## Testing

### Unit tests (`tests/unit`, Vitest)

The Worker and shared code run in Node, which has the same Web Crypto, `fetch`, `Request`, and `Response` as
Workers. Client modules run in jsdom. Covered: environment validation, sealing and tamper detection, PKCE (against
the RFC 7636 example), the whole sign-in flow against a fake Auth0 with real signed ID tokens (wrong state, nonce,
issuer, and audience are all refused), token refresh and rotation, the API proxy (public list, CSRF, header
filtering, size limits, errors that reveal nothing), edge protection of pages, open redirect protection, header
drift, DOM safety, validation messages, preferences with blocked storage, and on-device-only speech.

```sh
npm run test:unit
```

### Use case tests (`tests/e2e`, Playwright)

These run the real built client and the real Worker (`wrangler dev`), with Auth0 and the Cairn API replaced by
`tests/e2e/mock-server.ts` (Auth0 and Stripe) and `tests/e2e/mock-api.ts` (the Cairn API, shaped like
`contract/openapi.json`, with the API's rules for setup order, care levels, read-back, and the free days).

| Spec                      | Covers                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome.spec.ts`         | UC-REG-01 welcome, footer links, UC-REG-02 and 03 Google, Apple, cancelling, only the time zone sent, UC-REG-06 adult                                                                                                            |
| `email.spec.ts`           | UC-REG-04 error state, no password in Cairn, email kept out of URLs, unconfirmed email                                                                                                                                           |
| `account-exists.spec.ts`  | UC-REG-05 an email that already has an account                                                                                                                                                                                   |
| `acknowledgments.spec.ts` | UC-REG-07, 08, 09 (exact document versions recorded), UC-REG-10 "I'm not sure"                                                                                                                                                   |
| `name-voice.spec.ts`      | UC-REG-11 name (never pre-filled) and speaking, UC-REG-12 voice, UC-REG-15 channels and frequency, UC-REG-16, UC-REG-14 distress and check-in                                                                                    |
| `resume.spec.ts`          | UC-REG-13 resume, sign out, Take a break before sign-in and during setup, Support resources signed out, UC-REG-20                                                                                                                |
| `home-settings.spec.ts`   | Home, UC-REG-18 AI reminder, UC-REG-17 Settings, UC-REG-05 adding a sign-in, download, UC-ACCT-01, breaks on a journey (S-04 to S-07), UC-SUB-01 to 04, 13, 14                                                                   |
| `cases.spec.ts`           | UC-CASE-01 to 09 questions, own words masked and read back, level 2 after skips, levels 3 and 4, draft break, UC-CASE-16, 17, review and Edit, preview, keep in touch, Start journey, first task, UC-10, UC-11, UC-13, UC-END-13 |
| `security.spec.ts`        | Edge auth gate, proxy refusals, open redirect, cookie flags, no tokens in page JavaScript, headers                                                                                                                               |
| `accessibility.spec.ts`   | axe WCAG 2.2 AA on every setup screen and the main signed-in screens, in light and dark mode, skip link, keyboard, text size, read aloud                                                                                         |
| `responsive.spec.ts`      | Phone width with no sideways scrolling, setup and signed-in screens                                                                                                                                                              |

Every use case test also fails on any browser console error, which includes CSP and Trusted Types violations.

```sh
npx playwright install chromium   # once
npm run test:e2e
```

If Playwright can't download its browser (a locked-down network), point it at an installed Chromium:
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

## CI and branch protection

Workflows are in [`.github/workflows`](.github/workflows) and described in [`.github/README.md`](.github/README.md).

| Event                          | Runs                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| Pull request into `main`       | Lint, Security, Unit tests, Build, Use case tests, then **All checks passed** |
| Push to `main` (after a merge) | The same, so `main` is re-verified                                            |
| Push to any other branch       | Lint, Security, Unit tests, Build (the fast set)                              |

- **Lint:** `tsc`, ESLint (`typescript-eslint` strict, `eslint-plugin-security`, `eslint-plugin-no-unsanitized`),
  Stylelint, Prettier, header drift, `.env.example` completeness, and actionlint for the workflows.
- **Security:** `npm audit --audit-level=high`, lockfile integrity, and gitleaks over the full git history.
- **Tests:** unit tests with coverage thresholds, a client build plus `wrangler deploy --dry-run` of the Worker,
  and the Playwright use case, security, and accessibility suite.

[`.github/rulesets/protect-main.json`](.github/rulesets/protect-main.json) (the same ruleset as cairn-core) makes
**All checks passed** required, requires a pull request for every change to `main`, requires branches to be up to
date, requires review threads to be resolved, and blocks force pushes and deleting `main`. Import it under
**Settings > Rules > Rulesets > New ruleset > Import a ruleset**. GitHub only enforces rulesets on private
repositories on a paid plan (Pro, Team, or Enterprise)
([GitHub docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)).

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) opens weekly updates for npm and GitHub Actions.

## Decisions and differences from the wireframes

These follow cairn-core's API and security rules where the wireframes and the API differ. Each is worth a look by
product and design.

1. **Password and code entry happen on Auth0, not on Cairn's email screen.** Cairn never sees a password, and the
   default email method is a passwordless link. The email screen collects the address, then hands off to Auth0 with
   it pre-filled. `AUTH0_EMAIL_MODE=password` switches the screen's words to describe the password step (15
   characters minimum, per [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)).
2. **"Check your email" is shown only when Auth0 says the email isn't confirmed yet.** "Send me a new code" is not
   offered because resending needs Auth0's Management API.
3. **Checkboxes are never pre-checked** (acknowledgments and subscription terms).
4. **"I need a moment" became Take a break.** cairn-core removed `GET /v1/onboarding/need-a-moment` with the v3
   specs (BRK-D-01). Take a break is in the header on every screen, and the setup step list links to it too.
5. **The setup steps follow the account spec,** not the earlier wireframe: an adult question (UC-REG-06) comes first,
   and notification channels and frequency (UC-REG-15) come after the voice, before "All set". The step list has
   nine steps.
6. **No name from Google or Apple.** The name screen starts empty (D-16). The earlier build pre-filled it.
7. **Speak and Listen appear only when they can run on the device.** Many browsers send audio or text to a cloud
   service, which would break the promise that the recording is never kept. This applies to case answers too
   (UC-CASE-22), which are always sent to the API as a transcript to confirm first.
8. **Edit on the review screen** uses a client copy of the case questions (`src/client/intake-fields.ts`, mirroring
   cairn-core's case copy), because `GET /v1/cases/{id}/review` sends only each field's prompt. Questions the API
   sent during the visit take precedence.
9. **Labels the API sends only as values** (notification frequency, due date lead time, inactivity notices,
   attorney referral reasons, task status buttons, institution types) are client copy. They should come from the API
   or be reviewed with the rest of the copy.
10. **Google and Apple buttons show a letter, not the logo.** The official artwork must be added under each
    provider's brand rules ([Google](https://developers.google.com/identity/branding-guidelines),
    [Apple](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)).
11. **The case list for fiduciaries** (wireframe UC-13 desktop sidebar) is a plain `/cases` list. cairn-core notes the
    fiduciary case list is not built yet (decision 7 in its API README).
12. **The legal name step** sits inside the certificate task as an optional "only if the office asks" section, since
    `PATCH /v1/cases/{id}/deceased` is just in time and is refused on drafts.
13. **The voice list when changing it later** mirrors cairn-core's `voices/manifest.yaml`, because the API only sends
    the choices during setup.

## Copy that needs product and legal review

Acknowledgments, checkbox labels, crisis wording, voice samples, break screens, subscription terms, task guidance,
and every Cairn message come from the API and are reviewed there. These strings were written for this app and need
the same review:

- Email screen: "Next, we will email you a link to sign in. There is no password to remember. The link works for 15
  minutes." and the password-mode version.
- "Check your email" screen body and "I have confirmed my email".
- "Cairn's AI guide is provided by {provider}. It is named here before anything you share is sent to it."
- "You have already agreed to this. It is saved." and the account-exists safety note.
- "We only ask yes or no. We never ask for your birthday or age." on the adult question.
- The notification, lead time, inactivity, and quiet hours labels in Settings (`src/client/pages/settings.ts`).
- The attorney referral reasons and "The death has not happened yet" on the case page (`src/client/pages/intake.ts`).
- Task status buttons, institution types, and the legal name note (`src/client/pages/task.ts`).
- The fallback session timeout, signed-out, and account-deleted messages (`src/client/session-timeout.ts`,
  `src/client/pages/other.ts`).
- The browser notification text in `public/push-sw.js`.
- Validation messages other than the wireframe's email message.

## Contributing

1. Branch from `main`. Pushes run the fast checks.
2. Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run test:e2e` before opening a pull request.
3. Open a pull request into `main` and fill in the template. It can merge once **All checks passed** is green.
4. After changing `src/shared/security-headers.ts`, run `npm run check:headers -- --write` and commit `public/_headers`.
5. After adding an environment variable, add it to `src/shared/env.ts`, `.env.example`, and the table above.
6. When cairn-core's contract changes, run `npm run api:types -- ../cairn-core/api/openapi.json`, fix any type
   errors, and update `tests/e2e/mock-api.ts` to match.

Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## References

- Wireframes: [Cairn MVP Wireframes](https://claude.ai/artifact/Mv1JfsLPy7GsfuyBCu71md), pages "Registration (UC-REG)"
  and "Earlier draft (UC-1 to UC-13)"
- Cairn API and Auth0 setup: [cairnguide/cairn-core](https://github.com/cairnguide/cairn-core) (`api/README.md`, `auth0/README.md`, `api/openapi.json`, and the use case specs in `database/docs/`)
- [openapi-typescript](https://openapi-ts.dev/) (generates `src/client/api-schema.ts`)
- Stripe: [Checkout](https://docs.stripe.com/payments/checkout), [Customer portal](https://docs.stripe.com/customer-management)
- MDN: [Push API](https://developer.mozilla.org/docs/Web/API/Push_API), [Notification.requestPermission()](https://developer.mozilla.org/docs/Web/API/Notification/requestPermission_static), [`<dialog>`](https://developer.mozilla.org/docs/Web/HTML/Element/dialog)
- [WCAG 2.2 success criterion 2.2.1, Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
- Marketing site and hosting pattern: [cairnguide/cairn-site](https://github.com/cairnguide/cairn-site)
- Cloudflare: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/),
  [`run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/),
  [`_headers`](https://developers.cloudflare.com/workers/static-assets/headers/),
  [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
  [Environment variables and secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/),
  [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- Auth0: [Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce),
  [Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation),
  [Logout](https://auth0.com/docs/authenticate/login/logout)
- IETF: [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/),
  [RFC 7636 (PKCE)](https://www.rfc-editor.org/rfc/rfc7636),
  [RFC 9457 (Problem Details)](https://www.rfc-editor.org/rfc/rfc9457),
  [RFC 6265bis cookie prefixes](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/)
- OWASP: [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
  [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
  [Content Security Policy](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- MDN: [Content Security Policy](https://developer.mozilla.org/docs/Web/HTTP/CSP),
  [Trusted Types](https://developer.mozilla.org/docs/Web/API/Trusted_Types_API),
  [Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) (passwords)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [axe-core](https://github.com/dequelabs/axe-core)
- [California SB 243 (2025)](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260SB243) (AI companion disclosure)
- [988 Suicide and Crisis Lifeline](https://988lifeline.org)
