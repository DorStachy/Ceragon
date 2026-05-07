# Retest UI verification harness (U2)

Playwright harness for `console.cera.buzz` retest verification.

## What this is

A minimal, gitignored auth-state harness scoped to the production-readiness retest. The full plan section is `docs/CERAGON_POST_SCHEMA_RETEST_ISSUE_FIX_PLAN_2026-05-07.md` §U2.

## One-time setup (retest workstation only)

```bash
# Install Playwright + Chromium.
npm install -D @playwright/test
npx playwright install chromium

# Sign in to console.cera.buzz with the production-safe test account.
# This opens an interactive browser; close it when sign-in completes.
node scripts/playwright/login.cjs
```

The login helper writes `docs/test-evidence/.auth/console.cera.buzz.storageState.json`. **That path is gitignored — never commit the storage state.** Rotate the test-account password regularly; the storage state holds the session.

## Per-retest run

```bash
# Optionally pin a retest slug for evidence path naming.
export CERAGON_RETEST_SLUG=$(date -u +%Y%m%dT%H%M%SZ)

npx playwright test --config scripts/playwright/playwright.config.ts
```

Screenshots land in `docs/test-evidence/retest-${CERAGON_RETEST_SLUG}/screenshots/`. Failure traces and the HTML report land alongside.

## What the spec covers

- Signed-in landing page reachable (auth state honored)
- Dependencies table renders rows
- Detail pages for known retest packages (`minimist`, `request`, `node-sass`)
- Alerts + Licenses pages reachable

The spec is deliberately resilient: each test waits for `networkidle` and captures a full-page screenshot, then leaves API-shape verification to the harness's separate API checks. This keeps UI selectors from blocking the retest when the frontend cosmetically changes.
