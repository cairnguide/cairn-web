# Security policy

cairn-web handles sign-in for people who are grieving and information about someone who died. Please report
security problems privately so they can be fixed before anyone is harmed.

## Reporting a problem

- Use GitHub's private vulnerability reporting for this repository (**Security > Report a vulnerability**), or
- contact the Cairn maintainers privately through the support address on the Cairn website.

Please don't open a public issue or pull request for a security problem. Include what you found, how to reproduce
it, and what an attacker could do with it. Do not access, change, or keep anyone else's data while testing.

## What is in scope

- The Worker in `src/worker/` (sign-in, session cookie, API proxy, protected pages)
- The browser app in `src/client/`
- Security headers and Content Security Policy (`src/shared/security-headers.ts`, `public/_headers`)
- The GitHub workflows in `.github/workflows/`

The Cairn API and database are in [cairnguide/cairn-core](https://github.com/cairnguide/cairn-core). Auth0 and
Cloudflare have their own programs.

## How this app protects people

See [README.md, "Security and privacy"](README.md#security-and-privacy) for the design: Auth0 owns every
credential, tokens never reach browser JavaScript, every account page needs a session at the edge, requests are
checked for cross-site forgery, the CSP requires Trusted Types, nothing personal is stored in the browser or logged,
and speech features only run on the device.

## Handling secrets

- `AUTH0_CLIENT_SECRET` and `SESSION_SECRET` live only in the deployment pipeline's secret store and in Cloudflare
  as encrypted secrets. Never in a committed file, an issue, or a log.
- `.gitignore` blocks every `.env*` file except `.env.example`. CI runs gitleaks over the full history.
- If a secret is exposed, rotate it right away. Rotating `SESSION_SECRET` signs everyone out, which is the safe
  outcome.
