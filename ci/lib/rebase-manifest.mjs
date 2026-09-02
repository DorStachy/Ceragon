#!/usr/bin/env node
/**
 * THE REBASE MANIFEST — generator and staleness gate. (M4.7A Wave −1 Task 1.)
 *
 * ── What this exists to catch ────────────────────────────────────────────────
 *
 * Every `path:line` in the M4.7A plan is a claim about `origin/main`. The seven
 * working trees in this workspace run between 12 and 1,010 commits behind their
 * remotes, so the same `sed -n '122p'` returns a different line in a working
 * tree than it does at `origin/main`. A plan whose citations were resolved
 * against a stale tree is a plan that instructs you to edit code that moved.
 *
 * That is not hypothetical here. The 2026-08-27 disposition pass was handed a
 * SHA list built from local checkouts and **four of seven were stale**; it only
 * caught the error because it fetched first. On 2026-09-02 a ledger written
 * against `Installers ed45aa72` had to be corrected mid-write because the tip
 * moved to `48c3d2eb` while it was being typed.
 *
 * ── The specific defect in the manifest that already existed ─────────────────
 *
 * `REBASE_MANIFEST.md` carried the words "Generated; never hand-edit. Run
 * `node ci/lib/rebase-manifest.mjs`" — and that file did not exist. The manifest
 * was hand-typed, wearing the authority of a generated artifact, and nothing
 * could tell you so. A document that claims to be generated and is not is worse
 * than one that admits it is prose: readers extend trust to it that it has not
 * earned.
 *
 * This script is that generator, and the gate that makes a hand edit visible.
 *
 * ── Why the manifest carries no timestamp ────────────────────────────────────
 *
 * The wave's exit requires that the generator be re-runnable and produce a
 * BYTE-IDENTICAL file. A `generatedAt` line would defeat that by construction:
 * every run would differ from the last and the byte comparison would carry no
 * information. The SHAs are the identity. When the fetch itself is the fact
 * being recorded — what `origin/main` was before and after — that belongs in
 * `REBASE_FETCH_OBSERVATION.json`, which is a record of one fetch, not a
 * description of current state. The manifest renders that observation; it does
 * not re-derive it. So `--write` twice with no intervening fetch is a no-op, and
 * a run whose bytes changed means the world changed.
 *
 * ── It refuses to pass when it cannot compare ────────────────────────────────
 *
 * Modelled on `vocab-parity.mjs` in this directory. A missing checkout, a
 * missing `origin/main`, an unreadable ref: all produce `NOT CHECKED` and
 * exit 2. There is no degraded mode, because a gate that shrugs and exits 0 when
 * it could not look is the defect it was written to prevent.
 *
 *   node ci/lib/rebase-manifest.mjs              fetch, then check
 *   node ci/lib/rebase-manifest.mjs --no-fetch   check against local refs only
 *   node ci/lib/rebase-manifest.mjs --write      fetch, then regenerate
 *   node ci/lib/rebase-manifest.mjs --json       machine-readable verdict
 *
 * Exit 0 = the manifest describes the repositories. Exit 1 = it does not.
 * Exit 2 = it could not be determined.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = resolve(CI_DIR, '..');

/**
 * The seven governed repositories, in the order the plan lists them. The order
 * is part of the artifact: a generator that sorted them would produce a diff
 * against every historical manifest for no reason.
 */
export const REPOS = [
  'Backend',
  'Frontend',
  'Installers',
  'Ceragon-Intelligence',
  'Static-Worker',
  'Sandbox-Worker',
  'GithubApp-Bot-Scanner-Worker',
];

export const MANIFEST_RELPATH = join('.plans', 'm47a-20260822', 'v2-waves', 'REBASE_MANIFEST.md');
export const OBSERVATION_RELPATH = join(
  '.plans',
  'm47a-20260822',
  'v2-waves',
  'REBASE_FETCH_OBSERVATION.json',
);

const STATUS_PASS = 'PASS';
const STATUS_STALE = 'STALE';
const STATUS_NOT_CHECKED = 'NOT_CHECKED';

// ── git, without a shell ─────────────────────────────────────────────────────

/**
 * Arguments go through as an array, never a command string. On this workstation
 * MSYS rewrites anything shaped like a path inside a shell word, which has
 * already turned `git cat-file -e origin/main:.github/workflows/x.yml` into a
 * false MISSING. execFileSync bypasses the shell entirely.
 */
function git(repoDir, args) {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(repoDir, args) {
  try {
    return { ok: true, value: git(repoDir, args) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.message || err).trim() };
  }
}

// ── reading one repository ───────────────────────────────────────────────────

/**
 * Read the five facts the manifest records. `problem` being set is the only
 * signal callers should test; every other field is meaningless when it is.
 */
export function readRepo(root, name) {
  const dir = join(root, name);
  if (!existsSync(join(dir, '.git'))) {
    return { name, problem: `checkout not found at ${dir}` };
  }
  const branch = tryGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok) return { name, problem: `not a readable git repository (${branch.error})` };

  const head = tryGit(dir, ['rev-parse', 'HEAD']);
  if (!head.ok) return { name, problem: `HEAD could not be resolved (${head.error})` };

  const originMain = tryGit(dir, ['rev-parse', 'refs/remotes/origin/main']);
  if (!originMain.ok) {
    return { name, problem: `origin/main does not exist locally — has this repo ever been fetched?` };
  }

  const behind = tryGit(dir, ['rev-list', '--count', 'HEAD..refs/remotes/origin/main']);
  if (!behind.ok) return { name, problem: `behind-count failed (${behind.error})` };

  return {
    name,
    branch: branch.value === 'HEAD' ? '(detached)' : branch.value,
    head: head.value,
    originMain: originMain.value,
    behind: Number.parseInt(behind.value, 10),
  };
}

/**
 * Fetch all seven and record what moved. This is the step the plan calls
 * mandatory: "A SHA list handed to you by a task brief is not evidence; the
 * fetch is." A repo that cannot be fetched is recorded, not skipped — the
 * caller decides whether that is fatal.
 */
export function fetchAll(root, repos = REPOS) {
  const observation = {};
  for (const name of repos) {
    const dir = join(root, name);
    if (!existsSync(join(dir, '.git'))) {
      observation[name] = { problem: 'checkout not found' };
      continue;
    }
    const before = tryGit(dir, ['rev-parse', 'refs/remotes/origin/main']);
    const fetched = tryGit(dir, ['fetch', 'origin', '--prune']);
    const after = tryGit(dir, ['rev-parse', 'refs/remotes/origin/main']);
    observation[name] = {
      before: before.ok ? before.value : null,
      after: after.ok ? after.value : null,
      ...(fetched.ok ? {} : { fetchError: fetched.error }),
    };
  }
  return observation;
}

// ── the artifact ─────────────────────────────────────────────────────────────

const short = (sha) => (sha ? sha.slice(0, 12) : '');

/**
 * Render the "did the required fetch move this?" column from a recorded
 * observation. Absent observation renders as `not recorded` rather than `no`:
 * "we did not look" and "we looked and nothing moved" are different facts and
 * collapsing them is the reporting failure this programme keeps finding.
 */
function movedCell(observation, name) {
  const o = observation?.repos?.[name];
  if (!o || !o.before || !o.after) return 'not recorded';
  if (o.before === o.after) return 'no';
  return `yes (${short(o.before)} → ${short(o.after)})`;
}

export function renderManifest(rows, observation) {
  const lines = [
    '# Rebase manifest',
    '',
    '**Generated; never hand-edit.** Run `node ci/lib/rebase-manifest.mjs` to validate and',
    '`node ci/lib/rebase-manifest.mjs --write` to regenerate after the required seven-repo fetch.',
    '',
    'Every `path:line` claim in the M4.7A plan is a claim about `origin/main` at the SHA',
    'below. Resolve citations with `git show origin/main:<path>`, never from the working tree.',
    'A SHA list handed to an implementer is not evidence; the required fetch is.',
    '',
    'This file carries no generation timestamp on purpose: the wave exit requires that a',
    're-run produce byte-identical output, and a clock would defeat that by construction.',
    'If these bytes changed, the repositories changed.',
    '',
    '| Repository | Local branch | Local HEAD | `origin/main` | Behind | Required fetch moved `origin/main`? |',
    '|---|---|---|---|---:|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.name}\` | \`${row.branch}\` | \`${row.head}\` | \`${row.originMain}\` | ` +
        `${row.behind} | ${movedCell(observation, row.name)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Parse the rows back out, so the gate compares recorded values to live ones. */
export function parseManifest(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{40})`\s*\|\s*`([0-9a-f]{40})`\s*\|\s*(\d+)\s*\|/,
    );
    if (m) {
      rows.push({
        name: m[1],
        branch: m[2],
        head: m[3],
        originMain: m[4],
        behind: Number.parseInt(m[5], 10),
      });
    }
  }
  return rows;
}

// ── the gate ─────────────────────────────────────────────────────────────────

export function check({ root = WORKSPACE, manifestPath, repos = REPOS } = {}) {
  const file = manifestPath || join(root, MANIFEST_RELPATH);
  const live = repos.map((name) => readRepo(root, name));
  const unreadable = live.filter((r) => r.problem);

  if (unreadable.length) {
    return {
      status: STATUS_NOT_CHECKED,
      reasons: unreadable.map((r) => `${r.name}: ${r.problem}`),
      live,
      recorded: [],
    };
  }

  if (!existsSync(file)) {
    return {
      status: STATUS_NOT_CHECKED,
      reasons: [`${file} does not exist — run with --write to generate it`],
      live,
      recorded: [],
    };
  }

  const recorded = parseManifest(readFileSync(file, 'utf8'));
  const reasons = [];

  if (recorded.length !== repos.length) {
    reasons.push(
      `REBASE_MANIFEST.md records ${recorded.length} repositories but ${repos.length} are governed`,
    );
  }

  for (const actual of live) {
    const row = recorded.find((r) => r.name === actual.name);
    if (!row) {
      reasons.push(`REBASE_MANIFEST.md has no row for ${actual.name}`);
      continue;
    }
    // The message below is the one the wave's defeat test asserts by name. Do
    // not reword it without updating w-1-rebase-manifest.test.mjs.
    if (row.originMain !== actual.originMain) {
      reasons.push(
        `REBASE_MANIFEST.md is stale: ${actual.name} records ${row.originMain} ` +
          `but origin/main is ${actual.originMain}`,
      );
    }
    if (row.head !== actual.head) {
      reasons.push(
        `REBASE_MANIFEST.md is stale: ${actual.name} records local HEAD ${row.head} ` +
          `but HEAD is ${actual.head}`,
      );
    }
    if (row.branch !== actual.branch) {
      reasons.push(
        `REBASE_MANIFEST.md is stale: ${actual.name} records branch ${row.branch} ` +
          `but the checkout is on ${actual.branch}`,
      );
    }
    if (row.behind !== actual.behind) {
      reasons.push(
        `REBASE_MANIFEST.md is stale: ${actual.name} records ${row.behind} behind ` +
          `but the checkout is ${actual.behind} behind`,
      );
    }
  }

  return {
    status: reasons.length ? STATUS_STALE : STATUS_PASS,
    reasons,
    live,
    recorded,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const E = String.fromCharCode(27);
const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s) => (colour ? `${E}[31m${s}${E}[0m` : s);
const green = (s) => (colour ? `${E}[32m${s}${E}[0m` : s);
const yellow = (s) => (colour ? `${E}[33m${s}${E}[0m` : s);

function main(argv) {
  const args = argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : WORKSPACE;
  const manIdx = args.indexOf('--manifest');
  const manifestPath = manIdx >= 0 ? resolve(args[manIdx + 1]) : join(root, MANIFEST_RELPATH);
  const wantsWrite = args.includes('--write');
  const wantsJson = args.includes('--json');
  const noFetch = args.includes('--no-fetch');

  let observation = null;
  const obsPath = join(root, OBSERVATION_RELPATH);

  if (!noFetch) {
    const repos = fetchAll(root);
    // A fetch is only worth recording if it is the fetch that produced the
    // manifest, so the observation is written in --write mode only. In check
    // mode the fetch still runs — the point is to compare against the truth,
    // not against whatever was last cached.
    observation = { fetchedAt: new Date().toISOString().slice(0, 10), repos };
    if (wantsWrite) writeFileSync(obsPath, `${JSON.stringify(observation, null, 2)}\n`);
  }
  if (!observation && existsSync(obsPath)) {
    try {
      observation = JSON.parse(readFileSync(obsPath, 'utf8'));
    } catch {
      observation = null;
    }
  }
  if (wantsWrite && !observation && existsSync(obsPath)) {
    try {
      observation = JSON.parse(readFileSync(obsPath, 'utf8'));
    } catch {
      observation = null;
    }
  }

  if (wantsWrite) {
    const live = REPOS.map((name) => readRepo(root, name));
    const bad = live.filter((r) => r.problem);
    if (bad.length) {
      const msg = bad.map((r) => `  ${r.name}: ${r.problem}`).join('\n');
      if (wantsJson) {
        process.stdout.write(`${JSON.stringify({ status: STATUS_NOT_CHECKED, reasons: bad }, null, 2)}\n`);
      } else {
        process.stdout.write(`\n${yellow('NOT CHECKED')} — refusing to write a partial manifest\n${msg}\n\n`);
      }
      return 2;
    }
    const text = renderManifest(live, observation);
    const before = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
    writeFileSync(manifestPath, text);
    if (!wantsJson) {
      const verb = before === text ? 'unchanged (byte-identical)' : before === null ? 'created' : 'updated';
      process.stdout.write(`\n${green('WROTE')} ${manifestPath} — ${verb}, ${live.length} repositories\n\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ status: 'WROTE', rows: live }, null, 2)}\n`);
    }
    return 0;
  }

  const result = check({ root, manifestPath });

  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.status === STATUS_PASS) {
    process.stdout.write(
      `\n${green('PASS')} — REBASE_MANIFEST.md describes all ${result.recorded.length} repositories\n\n`,
    );
  } else if (result.status === STATUS_NOT_CHECKED) {
    process.stdout.write(
      `\n${yellow('NOT CHECKED')} — the manifest could not be compared\n` +
        `${result.reasons.map((r) => `  ${r}`).join('\n')}\n\n`,
    );
  } else {
    process.stdout.write(
      `\n${red('STALE')} — the manifest does not describe the repositories\n` +
        `${result.reasons.map((r) => `  ${r}`).join('\n')}\n\n` +
        `Regenerate with: node ci/lib/rebase-manifest.mjs --write\n\n`,
    );
  }

  if (result.status === STATUS_PASS) return 0;
  if (result.status === STATUS_NOT_CHECKED) return 2;
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('rebase-manifest.mjs')) {
  process.exit(main(process.argv));
}
