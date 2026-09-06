#!/usr/bin/env node
/**
 * MUTATION PROOF for `claim-contract.mjs`.
 *
 * A claim guard nobody has ever made go red is a claim guard that has not been
 * run. Every case below builds a plan on disk, mutates it, and asserts the
 * guard's verdict AND the words in its output.
 *
 * The base document is the REAL plan, read from the real checkout. If it cannot
 * be read the suite FAILS -- it does not skip. A precondition that silently
 * skips its assertion is one of the inert shapes this whole programme exists to
 * stamp out.
 *
 *   node ci/lib/claim-contract.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN, RENDERER, check } from './claim-contract.mjs';

/** The CLI under test, driven as a subprocess so the EXIT CODE is asserted. */
const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'claim-contract.mjs');

let failures = 0;
let cases = 0;

function assert(condition, message) {
  cases += 1;
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures += 1;
  }
}

function withPlan(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'claim-contract-'));
  const planPath = join(dir, 'plan.md');
  const rendererPath = join(dir, 'claim_test.go');
  const original = readFileSync(PLAN, 'utf8');
  writeFileSync(planPath, mutate(original), 'utf8');
  return { dir, planPath, rendererPath };
}

function writeRenderer(path, entryCount) {
  mkdirSync(dirname(path), { recursive: true });
  const entries = Array.from(
    { length: entryCount },
    (_, i) => `\t{ Row: ${i + 1}, Phrase: "claim ${i + 1}" },`
  ).join('\n');
  writeFileSync(path, `package certificate\n\nvar forbiddenClaims = []Claim{\n${entries}\n}\n`, 'utf8');
}

function said(result, needle) {
  return result.lines.some((line) => line.includes(needle));
}

// ── PRECONDITION ─────────────────────────────────────────────────────────────
console.log('precondition: the real plan passes its own guard');
{
  const real = check();
  assert(real.ok, 'the shipped plan passes the guard as written');
  assert(real.planRows === 15, `the shipped plan carries 15 checklist rows (saw ${real.planRows})`);
  // This assertion used to read `real.rendererCount === null` — "the Go renderer
  // is reported ABSENT, not as a count". That was true when it was written and
  // is not true now: Wave 8 Task 11 landed the renderer, and it encodes 15.
  // Keeping the old form would have pinned the suite to a fact the tree had
  // moved past, which is the same defect as a stale citation. The DISCRIMINATING
  // case — that an absent renderer reports null and never 0 — is unchanged and
  // still runs below, over a fabricated tree, where it belongs.
  assert(
    real.rendererCount === real.planRows,
    `plan checklist and Go renderer agree (${real.planRows} rows, ${real.rendererCount} renderer entries)`
  );
}

// ── CASE 1 — the defeat test Wave -1 Task 2 specifies by name ────────────────
console.log('\ncase 1: re-inserting a banned claim into the goal statement');
{
  const { dir, planPath, rendererPath } = withPlan((text) =>
    text.replace(
      '## The goal, stated as a claim this packet can actually make',
      '## The goal, stated as a claim this packet can actually make\n\nDeVoid ships with zero false positives.'
    )
  );
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(!result.ok, 'the guard goes RED');
  assert(said(result, 'zero false positives'), 'it names the banned phrase');
  assert(said(result, 'checklist row 1'), 'it names the checklist row the phrase belongs to');
  assert(
    result.lines.some((l) => /plan\.md:\d+/.test(l)),
    'it names the file and line'
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 2 — a banned claim inside the fence is NOT a violation ──────────────
console.log('\ncase 2: the fence exempts the checklist that quotes the claims');
{
  const { dir, planPath, rendererPath } = withPlan((text) => text);
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(result.ok, 'an unmutated plan passes even though its fence quotes all 15');
  assert(result.planRows === 15, 'and all 15 rows are still counted inside the fence');
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 3 — THE DISCRIMINATING PAIR, and the point of the whole guard ───────
//
// An absent renderer must not be reported as a renderer holding zero entries,
// and 0 == 0 must never read as agreement. The honest case (a renderer that
// really does encode 15) has to keep its exact verdict while only the dishonest
// one changes -- otherwise the guard is satisfied by always reporting ABSENT.
console.log('\ncase 3: an absent renderer is not a renderer encoding zero');
{
  const { dir, planPath, rendererPath } = withPlan((text) => text);

  const absent = check({ planPath, rendererPath, documents: [planPath] });
  assert(absent.rendererCount === null, 'an absent renderer counts as null, not 0');
  assert(said(absent, 'ABSENT'), 'the output says ABSENT in words');
  assert(
    said(absent, 'the counts are NOT equal'),
    'and refuses to call a missing list equal to anything'
  );
  assert(
    !absent.lines.some((l) => l.includes('renderer entries') && / 0$/.test(l)),
    'it never prints the renderer as holding 0 entries'
  );

  const demanded = check({ planPath, rendererPath, documents: [planPath], requireRenderer: true });
  assert(!demanded.ok, 'with --require-renderer an absent renderer FAILS');

  // The honest half of the pair: a renderer that really matches must pass, and
  // must pass for the stated reason -- the counts agreeing, not the file being
  // unreadable.
  writeRenderer(rendererPath, 15);
  const matched = check({ planPath, rendererPath, documents: [planPath], requireRenderer: true });
  assert(matched.ok, 'a renderer encoding 15 passes even under --require-renderer');
  assert(matched.rendererCount === 15, `and its count is read as 15 (saw ${matched.rendererCount})`);
  assert(!said(matched, 'ABSENT'), 'and ABSENT is not printed when the file is there');

  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 4 — drift in either direction ──────────────────────────────────────
console.log('\ncase 4: neither side may grow alone');
{
  const { dir, planPath, rendererPath } = withPlan((text) => text);

  writeRenderer(rendererPath, 16);
  const rendererGrew = check({ planPath, rendererPath, documents: [planPath] });
  assert(!rendererGrew.ok, 'a renderer that grew to 16 against a 15-row plan goes RED');
  assert(said(rendererGrew, 'carries 15 rows'), 'the failure prints the plan count');
  assert(said(rendererGrew, 'encodes 16'), 'and the renderer count, rather than a literal');

  writeRenderer(rendererPath, 14);
  const rendererShrank = check({ planPath, rendererPath, documents: [planPath] });
  assert(!rendererShrank.ok, 'a renderer that shrank to 14 also goes RED');

  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 5 — a row deleted from the plan is drift, not a smaller list ────────
console.log('\ncase 5: deleting a checklist row');
{
  const { dir, planPath, rendererPath } = withPlan((text) =>
    text.split('\n').filter((line) => !line.startsWith('| 5 | "All DLP classes are governed"')).join('\n')
  );
  writeRenderer(rendererPath, 15);
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(!result.ok, 'the guard goes RED');
  assert(result.planRows === 14, `the plan now reads 14 rows (saw ${result.planRows})`);
  assert(said(result, 'Neither side may grow alone'), 'and it says which rule was broken');
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 6 — the fence cannot be used to switch the guard off ───────────────
//
// Deleting ONE end marker does not leave a fence dangling to the end of the
// file. It merges two fences: the next fence's end closes the first, and the
// whole passage between them becomes silently exempt. That is the cheapest way
// to disable this guard while leaving it apparently installed.
//
// The first version of this case asserted on the word "unterminated" and the
// guard PASSED — it had no idea the fences had merged. That is the defect this
// case caught, and the reason it is now written against the merge rather than
// against a dangling marker.
console.log('\ncase 6: a missing end marker merges two fences, and that is an error');
{
  const { dir, planPath, rendererPath } = withPlan((text) =>
    text.replace('<!-- forbidden-claims:end -->', '')
  );
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(!result.ok, 'the guard goes RED');
  assert(said(result, 'is still open'), 'and says the first fence was never closed');
  assert(
    said(result, 'everything between them is exempt'),
    'and says what that bought, rather than only that it happened'
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 6b — a fence dangling to the end of file is caught too ─────────────
console.log('\ncase 6b: a fence with no end at all');
{
  const { dir, planPath, rendererPath } = withPlan((text) =>
    text.split('\n').filter((line) => !line.includes('forbidden-claims:end')).join('\n')
  );
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(!result.ok, 'the guard goes RED');
  assert(said(result, 'unterminated'), 'and says the fence was never terminated');
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 7 — removing the checklist entirely ────────────────────────────────
console.log('\ncase 7: removing the fence removes the checklist, and that is a failure');
{
  const { dir, planPath, rendererPath } = withPlan((text) =>
    text.split('\n').filter((line) => !line.includes('forbidden-claims:')).join('\n')
  );
  const result = check({ planPath, rendererPath, documents: [planPath] });
  assert(!result.ok, 'the guard goes RED');
  assert(result.planRows === 0, 'no rows are found');
  assert(said(result, 'the fence is missing or renamed'), 'and it says why, rather than passing on an empty list');
  rmSync(dir, { recursive: true, force: true });
}

// ── CASE 8 — a release note is scanned in FULL, not just its opening ─────────
console.log('\ncase 8: a release note has no specification text and no exemption');
{
  const { dir, planPath, rendererPath } = withPlan((text) => text);
  const notePath = join(dir, 'RELEASE_NOTES.md');
  writeFileSync(
    notePath,
    ['# 7.11.0', '', 'Lots of fixes.', '', '## Detection', '', 'M4.7A is complete.', ''].join('\n'),
    'utf8'
  );
  const result = check({ planPath, rendererPath, documents: [planPath, notePath] });
  assert(!result.ok, 'the guard goes RED on the note');
  assert(said(result, 'm4.7a is complete'), 'and names the banned phrase');
  assert(
    result.lines.some((l) => l.includes('RELEASE_NOTES.md:7')),
    'at the right line, deep in the document rather than only near its top'
  );
  rmSync(dir, { recursive: true, force: true });
}


// ── CASE 9 — THE EXIT CODES, WHICH IS WHERE THIS GUARD ONCE LIED ────────────
//
// `check()` returning ok is not the same as the command exiting 0, and the gap
// between them was a real defect: with the renderer absent the guard printed
// "the counts are NOT equal" and then exited 0, so any CI leg wired to the bare
// command went green on an equality that had never run once.
//
// These cases drive the CLI as a subprocess, because the exit code IS the
// interface a CI leg consumes. Asserting `result.ok` here would test the thing
// that was already right and miss the thing that was wrong.
console.log('\ncase 9: the command exits 2 when the equality cannot be measured');
{
  const { dir, planPath, rendererPath } = withPlan((text) => text);

  const run = (args, env) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  // The renderer now EXISTS on Installers origin/main, so `run([])` measures a
  // real 15 == 15. The branch this case is about — the equality that CANNOT be
  // measured — is therefore forced with `--renderer=` pointing at a path that is
  // not there. Asserting it against "whatever renderer this machine happens to
  // have" is what made this case stop testing anything the day Wave 8 Task 11
  // landed: it went green, then red, for reasons that had nothing to do with the
  // behaviour under test.
  const missingRenderer = join(dir, 'no-such-dir', 'claim_test.go');
  const absent = run([`--renderer=${missingRenderer}`]);
  assert(absent.code === 2, `an absent renderer exits 2, not 0 (saw ${absent.code})`);
  assert(
    absent.out.includes('NOT MEASURED'),
    'and the verdict line says NOT MEASURED rather than PASS'
  );
  assert(!/claim-contract: PASS/.test(absent.out), 'PASS is never printed for an unmeasured equality');

  // A forbidden claim is a different failure and must not be confused with it.
  const notePath = join(dir, 'RELEASE_NOTES.md');
  writeFileSync(notePath, '# 7.11.0\n\nM4.7A is complete.\n', 'utf8');
  const violation = run([notePath, `--renderer=${missingRenderer}`]);
  assert(violation.code === 1, `a forbidden claim exits 1, not 2 (saw ${violation.code})`);
  assert(
    violation.out.includes('m4.7a is complete'),
    'and the release note IS scanned — the CLI used to pass no documents at all'
  );

  // The honest half of the pair: a clean note alongside an absent renderer is
  // still 2, because the note being clean says nothing about the equality.
  const cleanNote = join(dir, 'CLEAN_NOTES.md');
  writeFileSync(cleanNote, '# 7.11.0\n\nScanner execution truth is now reported.\n', 'utf8');
  const cleanButUnmeasured = run([cleanNote, `--renderer=${missingRenderer}`]);
  assert(
    cleanButUnmeasured.code === 2,
    `a clean note with no renderer is still NOT MEASURED (saw ${cleanButUnmeasured.code})`
  );

  rmSync(dir, { recursive: true, force: true });
  void planPath;
  void rendererPath;
}
console.log(`\n${cases - failures} of ${cases} assertions held`);
if (failures > 0) {
  console.log('claim-contract.test: FAIL');
  process.exit(1);
}
console.log('claim-contract.test: PASS');
