# CI and branch management

## What runs when

| Event                            | Workflow                                         | What it checks                                                                                 |
| -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Push to any branch except `main` | [`branch-push.yml`](workflows/branch-push.yml)   | Lint, Security, Unit tests, Build.                                                             |
| Pull request into `main`         | [`pull-request.yml`](workflows/pull-request.yml) | Lint, Security, Unit tests, Build, and the browser use case tests, then **All checks passed**. |
| Merge to `main`                  | [`pull-request.yml`](workflows/pull-request.yml) | The same full set, so `main` is re-verified after every merge.                                 |

The jobs themselves live in three reusable workflows:

- [`lint.yml`](workflows/lint.yml): `tsc`, ESLint (strict TypeScript rules plus `eslint-plugin-security` and
  `eslint-plugin-no-unsanitized`), Stylelint, Prettier, `public/_headers` drift, `.env.example` completeness, and
  actionlint (downloaded with a pinned SHA-256).
- [`security.yml`](workflows/security.yml): `npm audit --audit-level=high`, `npm ci` lockfile integrity, and the
  gitleaks CLI over the full history (pinned version and SHA-256).
- [`tests.yml`](workflows/tests.yml): unit tests with coverage thresholds, the client build plus
  `wrangler deploy --dry-run` for the Worker, and the Playwright use case tests. The Playwright report is uploaded
  when they fail.

Run the same checks locally before pushing:

```bash
npm ci
npm run typecheck && npm run lint && npm run check:headers
npm run test:unit
npx playwright install chromium && npm run test:e2e
```

## Blocking merges until everything passes

The pull request workflow ends with one job, **All checks passed**, which fails unless every other job succeeded.
The ruleset in [`rulesets/protect-main.json`](rulesets/protect-main.json) (the same as cairn-core's) makes that job
required for `main`. It also:

- requires a pull request for every change to `main` (no direct pushes)
- requires the branch to be up to date with `main` before merging
- requires review conversations to be resolved
- blocks force pushes to `main` and deleting it

The approval count is 0 so a solo engineer isn't blocked. Raise `required_approving_review_count` once there's a team.

### Turning it on

The ruleset isn't active until it's imported. Either:

- **Web:** Settings > Rules > Rulesets > New ruleset > Import a ruleset, then choose `protect-main.json`.
- **CLI:** `gh api -X POST repos/cairnguide/cairn-web/rulesets --input .github/rulesets/protect-main.json`

Rulesets are only **enforced on private repositories on a paid GitHub plan** (Pro, Team, or Enterprise). On GitHub
Free a private repository can save the ruleset, but merges won't be blocked. The checks still run and show red or
green on every pull request either way.

## Optional extra scanning

If the organization has GitHub Code Security (Advanced Security), add CodeQL
(`github/codeql-action`, language `javascript-typescript`) and `actions/dependency-review-action`. Both need it on
private repositories, so they are not included by default. They would otherwise fail every pull request.
