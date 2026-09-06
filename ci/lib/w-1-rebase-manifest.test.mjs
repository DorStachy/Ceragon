#!/usr/bin/env node
/**
 * MUTATION PROOF for `rebase-manifest.mjs`. (M4.7A Wave -1 Task 1's defeat test.)
 *
 * The manifest carried the words "Generated; never hand-edit" for days while no
 * generator existed and nothing could tell you it had been typed by hand. This
 * suite is the thing that would have noticed. Every case builds a seven-repo
 * workspace on disk with real git objects, generates a real manifest from it,
 * mutates one thing, and asserts the gate's exit status AND the words it prints.
 *
 * The fixtures are real repositories, not stubbed command output. A test that
 * mocks `git` proves the parser works and proves nothing about the gate, and
 * "the gate ran against something shaped like git" is one of the inert shapes
 * this programme exists to stamp out.
 *
 *   node ci/lib/w-1-rebase-manifest.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MANIFEST_RELPATH, REPOS } from './rebase-manifest.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(CI_DIR, 'lib', 'rebase-manifest.mjs');

const E = String.fromCharCode(27);
const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s) => (colour ? `${E}[31m${s}${E}[0m` : s);
const green = (s) => (colour ? `${E}[32m${s}${E}[0m` : s);
const dim = (s) => (colour ? `${E}[2m${s}${E}[0m` : s);

let failures = 0;
let ran = 0;

function testCase(name, fn) {
  ran++;
  try {
    fn();
    process.stdout.write(`  ${green('ok')}   ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  ${red('FAIL')} ${name}\n`);
    process.stdout.write(`       ${red(String(err.message).replace(/\n/g, '\n       '))}\n`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// -- fixtures: real git repositories, not stubs -------------------------------

const temps = [];

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * One repository with `commits` commits, HEAD on `branch`, and a synthetic
 * `refs/remotes/origin/main`. A real remote is not needed: the gate reads the
 * remote-tracking ref, which is exactly what a fetch writes.
 */
function makeRepo(root, name, { commits = 3, branch = 'work', originAtIndex = null } = {}) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'ci@local']);
  git(dir, ['config', 'user.name', 'ci']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  const shas = [];
  for (let i = 0; i < commits; i++) {
    writeFileSync(join(dir, 'f.txt'), `commit ${i}\n`);
    git(dir, ['add', 'f.txt']);
    git(dir, ['commit', '-qm', `c${i}`]);
    shas.push(git(dir, ['rev-parse', 'HEAD']));
  }
  const at = originAtIndex === null ? shas.length - 1 : originAtIndex;
  git(dir, ['update-ref', 'refs/remotes/origin/main', shas[at]]);
  if (branch !== 'main') git(dir, ['checkout', '-q', '-b', branch, shas[0]]);
  return { dir, shas, originMain: shas[at] };
}

/** A whole workspace. `omit` names repos to leave out entirely. */
function workspace({ omit = [], noOriginMain = [], perRepo = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rebase-manifest-'));
  temps.push(root);
  const made = {};
  for (const name of REPOS) {
    if (omit.includes(name)) continue;
    made[name] = makeRepo(root, name, perRepo[name] || {});
    if (noOriginMain.includes(name)) {
      git(made[name].dir, ['update-ref', '-d', 'refs/remotes/origin/main']);
    }
  }
  mkdirSync(dirname(join(root, MANIFEST_RELPATH)), { recursive: true });
  return { root, made };
}

function run(root, extraArgs = []) {
  const env = { ...process.env, NO_COLOR: '1' };
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--root', root, '--no-fetch', ...extraArgs], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const manifestPath = (root) => join(root, MANIFEST_RELPATH);
const readManifest = (root) => readFileSync(manifestPath(root), 'utf8');
const writeManifest = (root, text) => writeFileSync(manifestPath(root), text);

/** Generate a manifest that genuinely describes the fixture. */
function generated(opts) {
  const ws = workspace(opts);
  const w = run(ws.root, ['--write']);
  assert(w.code === 0, `fixture setup failed: --write exited ${w.code}\n${w.out}`);
  return ws;
}

// -- the cases ----------------------------------------------------------------

process.stdout.write('\nw-1 rebase-manifest mutation proof\n\n');
process.stdout.write(dim('  -- the defeat the wave names --\n'));

testCase('a freshly generated manifest -> PASS (exit 0)', () => {
  const ws = generated();
  const r = run(ws.root);
  assert(r.code === 0, `expected exit 0, got ${r.code}\n${r.out}`);
  assert(/\bPASS\b/.test(r.out), `expected PASS:\n${r.out}`);
});

testCase('THE NAMED DEFEAT: hand-edit one origin/main SHA -> STALE naming repo, edit and actual', () => {
  const ws = generated();
  const actual = ws.made.Installers.originMain;
  const forged = 'd'.repeat(40);
  writeManifest(ws.root, readManifest(ws.root).replace(actual, forged));
  const r = run(ws.root);
  assert(r.code === 1, `expected exit 1 (STALE), got ${r.code}\n${r.out}`);
  assert(
    r.out.includes(`REBASE_MANIFEST.md is stale: Installers records ${forged} but origin/main is ${actual}`),
    `the exact wave-specified message is missing:\n${r.out}`,
  );
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

testCase('the edit is caught for ANY of the seven, not just Installers', () => {
  for (const name of ['Backend', 'Sandbox-Worker', 'GithubApp-Bot-Scanner-Worker']) {
    const ws = generated();
    const actual = ws.made[name].originMain;
    const forged = 'e'.repeat(40);
    writeManifest(ws.root, readManifest(ws.root).replace(actual, forged));
    const r = run(ws.root);
    assert(r.code === 1, `${name}: expected exit 1, got ${r.code}\n${r.out}`);
    assert(
      r.out.includes(`REBASE_MANIFEST.md is stale: ${name} records ${forged}`),
      `${name}: message must name the repo:\n${r.out}`,
    );
  }
});

process.stdout.write(dim('\n  -- it reads the repositories, not just its own file --\n'));

testCase('origin/main genuinely MOVES -> STALE, with no edit to the manifest at all', () => {
  const ws = generated();
  const dir = ws.made.Frontend.dir;
  writeFileSync(join(dir, 'f.txt'), 'moved upstream\n');
  git(dir, ['add', 'f.txt']);
  git(dir, ['commit', '-qm', 'upstream moves']);
  const moved = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['update-ref', 'refs/remotes/origin/main', moved]);
  const r = run(ws.root);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(
    r.out.includes(`Frontend records ${ws.made.Frontend.originMain} but origin/main is ${moved}`),
    `a real upstream move must be reported like a hand edit:\n${r.out}`,
  );
});

testCase('the behind count is checked, not just the SHAs', () => {
  const ws = generated({ perRepo: { Backend: { commits: 5, branch: 'work' } } });
  const text = readManifest(ws.root);
  const bumped = text.replace(/(\| `Backend` \|[^|]*\|[^|]*\|[^|]*\| )(\d+)( \|)/, '$199$3');
  assert(bumped !== text, 'fixture invalid: the Backend behind-count was not rewritten');
  writeManifest(ws.root, bumped);
  const r = run(ws.root);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/records 99 behind but the checkout is \d+ behind/.test(r.out), `expected a behind callout:\n${r.out}`);
});

testCase('the recorded branch is checked', () => {
  const ws = generated();
  const text = readManifest(ws.root);
  const swapped = text.replace('| `work` |', '| `some-other-branch` |');
  assert(swapped !== text, 'fixture invalid: no branch cell was rewritten');
  writeManifest(ws.root, swapped);
  const r = run(ws.root);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(
    /records branch some-other-branch but the checkout is on work/.test(r.out),
    `expected a branch callout:\n${r.out}`,
  );
});

testCase('a deleted row -> STALE naming the repository with no row', () => {
  const ws = generated();
  const kept = readManifest(ws.root)
    .split('\n')
    .filter((l) => !l.startsWith('| `Ceragon-Intelligence`'))
    .join('\n');
  writeManifest(ws.root, kept);
  const r = run(ws.root);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/has no row for Ceragon-Intelligence/.test(r.out), `must name the missing row:\n${r.out}`);
  assert(/records 6 repositories but 7 are governed/.test(r.out), `must say the count is wrong:\n${r.out}`);
});

process.stdout.write(dim('\n  -- it refuses to pass when it cannot compare --\n'));

testCase('a checkout absent -> NOT CHECKED (exit 2), never PASS', () => {
  const ws = generated();
  rmSync(join(ws.root, 'Sandbox-Worker'), { recursive: true, force: true });
  const r = run(ws.root);
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/NOT CHECKED/.test(r.out), `expected NOT CHECKED:\n${r.out}`);
  assert(/Sandbox-Worker: checkout not found/.test(r.out), `must name the repo:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

testCase('a repo that has never been fetched (no origin/main) -> NOT CHECKED, and says so', () => {
  const ws = workspace({ noOriginMain: ['Installers'] });
  const r = run(ws.root);
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(
    /Installers: origin\/main does not exist locally/.test(r.out),
    `must say the ref is missing rather than guess:\n${r.out}`,
  );
});

testCase('--write refuses to emit a PARTIAL manifest when a repo is unreadable', () => {
  const ws = workspace({ omit: ['Static-Worker'] });
  const r = run(ws.root, ['--write']);
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/refusing to write a partial manifest/.test(r.out), `expected a refusal:\n${r.out}`);
  let wrote = true;
  try {
    readManifest(ws.root);
  } catch {
    wrote = false;
  }
  assert(!wrote, 'a partial manifest was written anyway');
});

testCase('no manifest at all -> NOT CHECKED, not a silent pass', () => {
  const ws = workspace();
  const r = run(ws.root);
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/does not exist/.test(r.out), `expected a missing-file callout:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

process.stdout.write(dim('\n  -- the wave exit criteria, asserted --\n'));

testCase('EXIT: exactly 7 rows, each with a 40-char origin/main and an integer behind', () => {
  const ws = generated();
  const rows = [
    ...readManifest(ws.root).matchAll(
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{40})`\s*\|\s*`([0-9a-f]{40})`\s*\|\s*(\d+)\s*\|/gm,
    ),
  ];
  assert(rows.length === 7, `expected 7 rows, got ${rows.length}`);
  for (const row of rows) {
    assert(row[4].length === 40, `${row[1]}: origin/main is not a full SHA`);
    assert(Number.isInteger(Number.parseInt(row[5], 10)), `${row[1]}: behind is not an integer`);
  }
});

testCase('EXIT: the generator is re-runnable and produces a BYTE-IDENTICAL file', () => {
  const ws = generated();
  const first = readManifest(ws.root);
  const r = run(ws.root, ['--write']);
  assert(r.code === 0, `second --write exited ${r.code}\n${r.out}`);
  assert(first === readManifest(ws.root), 'a second --write produced different bytes');
  assert(/byte-identical/.test(r.out), `the run should report that it changed nothing:\n${r.out}`);
});

testCase('the manifest carries NO timestamp -- a clock would defeat byte-identity', () => {
  const ws = generated();
  const text = readManifest(ws.root);
  assert(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(text), `the manifest contains an ISO timestamp:\n${text}`);
});

testCase('--json reports the same verdict a gate would act on', () => {
  const ws = generated();
  const actual = ws.made.Backend.originMain;
  writeManifest(ws.root, readManifest(ws.root).replace(actual, 'a'.repeat(40)));
  const r = run(ws.root, ['--json']);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  const parsed = JSON.parse(r.out);
  assert(parsed.status === 'STALE', `expected STALE, got ${parsed.status}`);
  assert(
    parsed.reasons.some((x) => x.includes('Backend records')),
    `the machine-readable form must name the repo too:\n${r.out}`,
  );
});

for (const t of temps) {
  try {
    rmSync(t, { recursive: true, force: true });
  } catch {
    /* a leftover temp directory is not a test failure */
  }
}

process.stdout.write(
  `\n${failures ? red(`${failures} of ${ran} FAILED`) : green(`${ran} cases, all as stated`)}\n\n`,
);
process.exit(failures ? 1 : 0);
