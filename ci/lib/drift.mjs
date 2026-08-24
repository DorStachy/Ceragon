#!/usr/bin/env node
/**
 * The fence around the mirror.
 *
 * `run.mjs` reads gate commands from the real workflow files, so it cannot go
 * stale on a command. It CAN go stale on a job: someone adds
 * `pr-checks.yml:new_gate` upstream, `ci/gates.json` never hears about it, and
 * every local run afterwards reports green while certifying one gate less than
 * the reader believes. That is the same defect class this codebase has shipped
 * before -- a control whose path is dead reports nothing, which reads
 * identically to reporting green.
 *
 * So: every job on origin/main that a `push` or `pull_request` can trigger must
 * appear in gates.json as either mirrored or explicitly cannot-mirror-because.
 * Anything else fails this check. Deploy-only and scheduled jobs are exempt --
 * they are not gates and never block a merge.
 *
 *   node ci/lib/drift.mjs            check every repo
 *   node ci/lib/drift.mjs Backend    check one
 *   node ci/lib/drift.mjs --cost     also print what still runs on GitHub's dime
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { expandMatrix } from './workflow.mjs';
import { listWorkflowsOnMain } from './wfsource.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(CI_DIR, '..');
const MANIFEST = JSON.parse(readFileSync(join(CI_DIR, 'gates.json'), 'utf8'));

const E = String.fromCharCode(27);
const RED = E + '[31m';
const GREEN = E + '[32m';
const YELLOW = E + '[33m';
const DIM = E + '[2m';
const BOLD = E + '[1m';
const RESET = E + '[0m';

/** GitHub's hosted-runner price per minute, 2026-08. Linux x64 2-core is the unit. */
const RUNNER_RATE = {
  'ubuntu-latest': 0.008,
  'ubuntu-24.04': 0.008,
  'ubuntu-22.04': 0.008,
  'windows-latest': 0.016,
  'windows-2022': 0.016,
  'macos-14': 0.08,
  'macos-latest': 0.08,
};

function git(repoPath, args) {
  try {
    return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function isGateTrigger(on) {
  if (!on || typeof on !== 'object') return false;
  return 'push' in on || 'pull_request' in on;
}

/**
 * The runner a job actually lands on, per matrix leg.
 *
 * `runs-on: ${{ matrix.os }}` has to be resolved or the cost table lies about
 * the expensive half of the bill: Installers' `unit` and `uninstall-sweep`
 * jobs both matrix over ubuntu AND macos, and an unresolved expression was
 * being bucketed as "self-hosted, not billed".
 */
function runnersOf(job) {
  const r = job['runs-on'];
  const combos = expandMatrix(job.strategy);
  const one = (raw, combo) => {
    if (Array.isArray(raw)) return raw.join(',');
    if (typeof raw !== 'string') return JSON.stringify(raw);
    let out = raw;
    for (const [key, value] of Object.entries(combo)) {
      const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
      for (const form of ['${{ matrix.' + key + ' }}', '${{matrix.' + key + '}}']) {
        out = out.split(form).join(v);
      }
    }
    return out;
  };
  const out = new Map();
  for (const combo of combos) {
    const name = one(r, combo);
    out.set(name, (out.get(name) || 0) + 1);
  }
  return [...out.entries()].map(([runner, legs]) => ({ runner, legs }));
}

function isLinuxRunner(r) {
  return /^ubuntu/.test(r);
}

/** `wf:job`, `wf:*`, or a free-text key that merely mentions `wf:job`. */
function coveredByCannotMirror(cannotMirror, wfName, jobId) {
  for (const key of Object.keys(cannotMirror || {})) {
    if (key === `${wfName}:${jobId}`) return key;
    if (key === `${wfName}:*`) return key;
    if (key.startsWith(`${wfName}:${jobId} `)) return key;
    if (key.startsWith(`${wfName} `) && key.includes(jobId)) return key;
  }
  return null;
}

function checkRepo(repoKey, wantCost) {
  const repo = MANIFEST.repos[repoKey];
  const repoPath = join(ROOT, repo.path);
  const problems = [];
  const cost = [];
  const seen = new Set();

  const files = listWorkflowsOnMain(repoPath);
  if (!files.length) {
    problems.push({ level: 'error', msg: `no workflows readable on origin/main -- run: git -C ${repo.path} fetch origin` });
    return { problems, cost };
  }

  for (const rel of files) {
    const wfName = rel.replace(/^.*\//, '').replace(/\.ya?ml$/, '');
    const text = git(repoPath, ['show', `origin/main:${rel}`]);
    if (text === null) continue;
    let wf;
    try {
      wf = parseYaml(text);
    } catch (e) {
      problems.push({ level: 'error', msg: `${rel} does not parse on origin/main: ${e.message}` });
      continue;
    }
    const gateTriggered = isGateTrigger(wf.on);

    for (const [jobId, job] of Object.entries(wf.jobs || {})) {
      const id = `${wfName}:${jobId}`;
      seen.add(id);
      const runners = runnersOf(job);
      const runner = runners.map((x) => x.runner).join(' + ');

      if (wantCost && gateTriggered) {
        for (const { runner: rn, legs } of runners) {
          cost.push({ id, runner: rn, legs, rate: RUNNER_RATE[rn] ?? null });
        }
      }
      if (!gateTriggered) continue;

      if (repo.mirrored[id]) continue;
      const excuse = coveredByCannotMirror(repo.cannotMirror, wfName, jobId);
      if (excuse) continue;

      problems.push({
        level: 'error',
        msg:
          `${id} is triggered by push/pull_request on origin/main but appears in neither ` +
          `mirrored nor cannotMirror.` +
          (runners.every((x) => isLinuxRunner(x.runner))
            ? `  It runs on ${runner}, so it is mirrorable -- add "${id}": {} to mirrored.`
            : `  It runs on ${runner}, so add it to cannotMirror with the reason.`),
      });
    }
  }

  for (const id of Object.keys(repo.mirrored)) {
    if (!seen.has(id)) {
      problems.push({
        level: 'error',
        msg: `mirrored gate "${id}" no longer exists on origin/main -- the job was renamed or removed.`,
      });
    }
  }

  return { problems, cost };
}

function main() {
  const args = process.argv.slice(2);
  const wantCost = args.includes('--cost');
  const named = args.filter((a) => !a.startsWith('-'));
  const repoKeys = named.length ? named : Object.keys(MANIFEST.repos);

  let errors = 0;
  const allCost = [];

  for (const key of repoKeys) {
    const { problems, cost } = checkRepo(key, wantCost);
    allCost.push(...cost.map((c) => ({ ...c, repo: key })));
    if (!problems.length) {
      process.stdout.write(`${GREEN}ok${RESET}    ${key}\n`);
      continue;
    }
    process.stdout.write(`${RED}DRIFT${RESET} ${BOLD}${key}${RESET}\n`);
    for (const p of problems) {
      errors += 1;
      process.stdout.write(`        ${p.msg}\n`);
    }
  }

  if (wantCost) {
    process.stdout.write(`\n${BOLD}What a single push/PR still costs on GitHub${RESET}\n`);
    process.stdout.write(`${DIM}legs x runner rate/min; a job billed at 1 minute minimum even if it takes 12s${RESET}\n\n`);
    const byRunner = new Map();
    for (const c of allCost) {
      const cur = byRunner.get(c.runner) || { legs: 0, rate: c.rate, jobs: 0 };
      cur.legs += c.legs;
      cur.jobs += 1;
      byRunner.set(c.runner, cur);
    }
    let floor = 0;
    for (const [runner, v] of [...byRunner.entries()].sort((a, b) => b[1].legs - a[1].legs)) {
      const perRun = v.rate === null ? null : v.legs * v.rate;
      if (perRun !== null) floor += perRun;
      process.stdout.write(
        `  ${runner.padEnd(16)} ${String(v.legs).padStart(4)} legs  ` +
          `${v.rate === null ? `${DIM}self-hosted, not billed${RESET}` : `$${v.rate.toFixed(3)}/min  >= $${perRun.toFixed(2)} per full run`}` +
          `\n`,
      );
    }
    process.stdout.write(
      `\n  ${BOLD}floor: $${floor.toFixed(2)} per run that triggers everything${RESET} ` +
        `${DIM}(one minute each; real jobs run longer)${RESET}\n`,
    );
    const unmirrorable = allCost.filter((c) => c.rate && !isLinuxRunner(c.runner));
    if (unmirrorable.length) {
      process.stdout.write(
        `\n  ${YELLOW}${unmirrorable.reduce((n, c) => n + c.legs, 0)} of those legs cannot run in Docker at all${RESET} ` +
          `${DIM}(macOS/Windows). Local mirroring cannot reduce them; only changing their triggers can.${RESET}\n`,
      );
      for (const c of unmirrorable) {
        process.stdout.write(`      ${c.repo} ${c.id} ${DIM}${c.runner} x${c.legs}${RESET}\n`);
      }
    }
  }

  if (errors) {
    process.stdout.write(`\n${RED}${errors} drift problem(s).${RESET} Fix ci/gates.json, then re-run.\n`);
    process.exit(1);
  }
  process.stdout.write(`\n${GREEN}No drift: every push/PR-triggered job is mirrored or has a stated reason it is not.${RESET}\n`);
}

main();
