/**
 * Retest UI verification harness (U2).
 *
 * The third advisory review's plan §U2 mandates a production-safe test
 * account so the retest can verify Dependencies, Alerts, Licenses,
 * Script Forensics, detail pages, filters, and counts at
 * console.cera.buzz. The auth state lives outside git per .gitignore
 * (`docs/test-evidence/.auth/console.cera.buzz.storageState.json`).
 *
 * Usage:
 *   1. One-time, on the retest workstation:
 *        npx playwright install chromium
 *        node scripts/playwright/login.cjs   # writes storageState.json
 *   2. Each retest run:
 *        npx playwright test --config scripts/playwright/playwright.config.ts
 *
 * Screenshots and traces land in docs/test-evidence/<retest-slug>/screenshots/.
 *
 * This harness deliberately depends only on @playwright/test; no
 * application code or backend symbols are imported, so the workspace
 * root remains a multi-component layout (no monorepo lockfile).
 */

import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const RETEST_SLUG = process.env.CERAGON_RETEST_SLUG || 'local';
const EVIDENCE_DIR = path.join(
  process.cwd(),
  'docs',
  'test-evidence',
  `retest-${RETEST_SLUG}`,
);

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(EVIDENCE_DIR, 'playwright-report'), open: 'never' }],
  ],
  outputDir: path.join(EVIDENCE_DIR, 'playwright-output'),
  use: {
    baseURL: process.env.CERAGON_CONSOLE_URL || 'https://console.cera.buzz',
    storageState: path.join(
      process.cwd(),
      'docs',
      'test-evidence',
      '.auth',
      'console.cera.buzz.storageState.json',
    ),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
