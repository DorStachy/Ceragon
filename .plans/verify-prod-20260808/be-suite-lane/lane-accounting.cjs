'use strict';

/**
 * lane-accounting — DISCOVERED vs EXECUTED, broken down BY LANE.
 *
 * `scripts/assert-suites-executed.js` (in the Backend repo) already answers the
 * whole-run question: "did every discovered suite execute?". It is a gate, and
 * it is deliberately blunt — one number, pass/fail.
 *
 * This is the diagnostic beside it. Two things it reports that the gate does
 * not, both of which were the actual asks:
 *
 *  1. PER-LANE totals. "957 discovered / 957 executed" hides the case the
 *     project has been bitten by twice: a whole LANE (all the `*.live-pg`
 *     specs, all of `src/licenses/__tests__/**`) going dark at once because one
 *     environment variable was unset. A per-lane count makes that a visible
 *     zero instead of a rounding error inside a four-figure total.
 *
 *  2. VACUOUS suites. Jest records a file as `passed` when its only `describe`
 *     is `describe.skip`-ed at runtime, because the FILE ran fine — it just
 *     asserted nothing. `assert-suites-executed.js` cannot see those (it counts
 *     files, and the file did report), and its own header says so:
 *     "a gated `describe` beside an un-gated one is invisible to it". Here a
 *     suite is EXECUTED only if `numPassingTests + numFailingTests > 0`.
 *     Everything else is a suite that produced no evidence.
 *
 * Lane assignment is by path, and the rules are the same ones the CI workflow
 * uses to decide which env var un-gates which set of files.
 *
 * Usage:
 *   node lane-accounting.cjs <jest-summary.json> [<jest-summary.json> ...]
 *
 * Always exits 0 — this reports, it does not gate. The gate is
 * `scripts/assert-suites-executed.js`.
 */

const fs = require('fs');

/**
 * Lane rules, FIRST MATCH WINS — order is significant.
 *
 * `licenses` is tested before `live-pg` on purpose: a file that is both
 * (`src/licenses/__tests__/*.live-pg.spec.ts`) is gated by
 * RUN_LICENSE_INTEGRATION_TESTS through `__test-utils__/pg-setup.ts`, so the
 * licenses lane is the one whose zero would be diagnostic.
 */
const LANES = [
  {
    id: 'licenses-integration',
    gate: 'RUN_LICENSE_INTEGRATION_TESTS=true (+ live Postgres)',
    match: (p) => p.includes('/licenses/__tests__/'),
  },
  {
    id: 'live-pg',
    gate: 'RUN_INTEGRATION_TESTS=true / RUN_LIVE_PG_TESTS=true (+ live Postgres)',
    match: (p) => p.endsWith('.live-pg.spec.ts'),
  },
  {
    id: 'e2e-dot',
    gate: 'AICP_M1_E2E / AICP_M2_E2E / RUN_INTEGRATION_TESTS (+ own Postgres)',
    match: (p) => p.endsWith('.e2e.spec.ts'),
  },
  {
    id: 'e2e-dash',
    gate: 'separate config: test/jest-e2e.json (NOT discovered by jest.config.js)',
    match: (p) => p.endsWith('.e2e-spec.ts'),
  },
  {
    id: 'dev-only',
    gate: 'platform gate — sibling workspace checkout',
    match: (p) => p.endsWith('.dev.spec.ts'),
  },
  { id: 'unit', gate: 'none — always runs', match: () => true },
];

function laneOf(filePath) {
  const p = filePath.replace(/\\/g, '/');
  return LANES.find((l) => l.match(p)).id;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node lane-accounting.cjs <jest-summary.json> ...');
  process.exit(2);
}

/** lane id -> tallies */
const tally = new Map();
for (const l of LANES) {
  tally.set(l.id, {
    gate: l.gate,
    discovered: 0,
    executed: 0,
    fileSkipped: 0,
    vacuous: 0,
    failedSuites: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsPending: 0,
    fileSkippedPaths: [],
    vacuousPaths: [],
    failedPaths: [],
  });
}

let grandDiscovered = 0;

for (const f of files) {
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (err) {
    console.error(`SKIPPED unreadable summary ${f}: ${err.message}`);
    continue;
  }
  grandDiscovered += summary.numTotalTestSuites ?? 0;

  for (const r of summary.testResults ?? []) {
    const lane = laneOf(r.name ?? r.testFilePath ?? '');
    const t = tally.get(lane);
    t.discovered += 1;

    const ran = (r.assertionResults ?? []).filter(
      (a) => a.status === 'passed' || a.status === 'failed',
    ).length;
    const pending = (r.assertionResults ?? []).filter(
      (a) => a.status === 'pending' || a.status === 'todo' || a.status === 'skipped',
    ).length;
    const failed = (r.assertionResults ?? []).filter((a) => a.status === 'failed').length;

    t.testsPassed += ran - failed;
    t.testsFailed += failed;
    t.testsPending += pending;

    const rel = (r.name ?? '').replace(/\\/g, '/').replace(/^.*?\/app\//, '');

    if (r.status === 'skipped') {
      t.fileSkipped += 1;
      t.fileSkippedPaths.push(rel);
    } else if (ran === 0) {
      // The file loaded and reported, but not one assertion executed. This is
      // the shape `assert-suites-executed.js` is structurally blind to.
      t.vacuous += 1;
      t.vacuousPaths.push(rel);
    } else {
      t.executed += 1;
      if (r.status === 'failed') {
        t.failedSuites += 1;
        t.failedPaths.push(rel);
      }
    }
  }
}

const rows = [];
for (const l of LANES) {
  const t = tally.get(l.id);
  if (t.discovered === 0) continue;
  rows.push({ id: l.id, ...t });
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log('');
console.log('DISCOVERED vs EXECUTED, BY LANE');
console.log('  EXECUTED = the suite ran at least one assertion (passed or failed).');
console.log('  FILE-SKIPPED = jest reported the whole file as skipped.');
console.log('  VACUOUS = the file reported as passed but ran ZERO assertions.');
console.log('');
console.log(
  `${pad('lane', 22)}${lpad('disc', 6)}${lpad('exec', 6)}${lpad('skip', 6)}${lpad('vacuous', 9)}${lpad('redSuites', 11)}${lpad('tests+', 8)}${lpad('tests-', 8)}`,
);
console.log('-'.repeat(76));
let d = 0,
  e = 0,
  s = 0,
  v = 0,
  fs_ = 0;
for (const r of rows) {
  d += r.discovered;
  e += r.executed;
  s += r.fileSkipped;
  v += r.vacuous;
  fs_ += r.failedSuites;
  console.log(
    `${pad(r.id, 22)}${lpad(r.discovered, 6)}${lpad(r.executed, 6)}${lpad(r.fileSkipped, 6)}${lpad(r.vacuous, 9)}${lpad(r.failedSuites, 11)}${lpad(r.testsPassed, 8)}${lpad(r.testsFailed, 8)}`,
  );
}
console.log('-'.repeat(76));
console.log(
  `${pad('TOTAL', 22)}${lpad(d, 6)}${lpad(e, 6)}${lpad(s, 6)}${lpad(v, 9)}${lpad(fs_, 11)}`,
);
console.log('');
console.log(`jest numTotalTestSuites across summaries: ${grandDiscovered}`);
console.log(`testResults rows across summaries:        ${d}`);
if (grandDiscovered !== d) {
  console.log(
    'MISMATCH: jest discovered more suites than it reported results for — the run did not finish.',
  );
}

for (const r of rows) {
  if (r.fileSkipped) {
    console.log(`\n[${r.id}] FILE-SKIPPED (${r.fileSkipped})   gate: ${r.gate}`);
    r.fileSkippedPaths.sort().forEach((p) => console.log(`  - ${p}`));
  }
  if (r.vacuous) {
    console.log(`\n[${r.id}] VACUOUS — reported passed, ran nothing (${r.vacuous})`);
    r.vacuousPaths.sort().forEach((p) => console.log(`  - ${p}`));
  }
  if (r.failedSuites) {
    console.log(`\n[${r.id}] RED SUITES (${r.failedSuites})`);
    r.failedPaths.sort().forEach((p) => console.log(`  - ${p}`));
  }
}
console.log('');
