#!/usr/bin/env node
/**
 * One-time login helper that captures the storage state for the retest
 * harness. Run on the retest workstation (NOT in CI):
 *
 *   node scripts/playwright/login.cjs
 *
 * The script opens a Chromium window pointed at console.cera.buzz; you
 * sign in interactively with the production-safe test account; on exit
 * it writes `docs/test-evidence/.auth/console.cera.buzz.storageState.json`.
 *
 * This file is gitignored. NEVER commit it.
 *
 * U2 / docs/CERAGON_POST_SCHEMA_RETEST_ISSUE_FIX_PLAN_2026-05-07.md §U2.
 */
'use strict';

const path = require('path');
const fs = require('fs');

async function main() {
  let chromium;
  try {
    ({ chromium } = require('@playwright/test'));
  } catch (err) {
    process.stderr.write(
      'Missing @playwright/test. Install with `npm install -D @playwright/test` and ' +
        '`npx playwright install chromium` first.\n',
    );
    process.exit(2);
  }

  const consoleUrl = process.env.CERAGON_CONSOLE_URL || 'https://console.cera.buzz';
  const authDir = path.join(process.cwd(), 'docs', 'test-evidence', '.auth');
  const statePath = path.join(authDir, 'console.cera.buzz.storageState.json');
  fs.mkdirSync(authDir, { recursive: true });

  process.stdout.write(`Opening ${consoleUrl}\n`);
  process.stdout.write(`After you sign in successfully, close the browser window.\n`);
  process.stdout.write(`Storage state will be written to ${statePath}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(consoleUrl, { waitUntil: 'domcontentloaded' });

  // Track the last-known URL so the close handler can refuse to save
  // an unauthenticated session state. Codex finding #12: closing the
  // browser mid-flow used to silently save an empty/login-page state,
  // and the harness then reported the FAILED auth as a TEST FAILURE
  // instead of an auth-setup failure.
  let lastUrl = page.url();
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      lastUrl = page.url();
    }
  });

  // Block until the user closes the browser. We rely on the page
  // disconnecting rather than polling for a navigation — gentler if the
  // login flow has multi-step redirects (SSO).
  await new Promise((resolve) => {
    browser.on('disconnected', resolve);
  });

  // Refuse to save state when the last URL is the login page.
  // The harness depends on this assertion: a saved login-page state
  // looks identical to a real session in storage but produces a 401
  // immediately on first request.
  if (/\/login(\?|$|#)/.test(lastUrl)) {
    process.stderr.write(
      `\nERROR: last URL was ${lastUrl} — looks like sign-in did not complete.\n` +
        `Storage state NOT saved (defends against silent auth-setup failure).\n` +
        `Re-run this script and complete the login flow before closing the window.\n`,
    );
    process.exit(2);
  }

  await context.storageState({ path: statePath });
  process.stdout.write(`Storage state saved (last URL: ${lastUrl}).\n`);
}

main().catch((err) => {
  process.stderr.write(`login error: ${err.message || err}\n`);
  process.exit(3);
});
