#!/usr/bin/env node
/**
 * POST-PUSH RATCHET AUDIT: plan section 10 rules 2 and 5, KC-44 (ledger row C11).
 *
 * One shared ratchet for both programmes. GitHub Free cannot refuse a merge
 * (branch protection returns 403 on every product repo), and most detector
 * commits reach `main` as direct pushes, so the per-PR scoreboard leg cannot
 * stop anything by itself. This audit runs after the push instead:
 *
 *   check (default)  every non-merge commit that touches a detector path
 *                    (gates.v1.json detectorPackages), from the programme's base
 *                    commit to the audited ref, must have a PASSING record in
 *                    scoreboard/ratchet-ledger.v1.jsonl from the leg ci/gates.json
 *                    marks `requiredFor` that repository, covering every gate the
 *                    marker requires. No record, a recorded regression, or a record
 *                    from an unmarked leg fails. Any commit to a detector path or to
 *                    an ownership row marked frozen, dated inside a freeze window
 *                    (freeze.v1.json), fails: the round's candidate is void (KC-44).
 *                    freeze.v1.json must be signed.
 *   --record         for each Installers detector commit with no record yet: check
 *                    the commit out into a temporary worktree (the audited repo's
 *                    refs are never moved), overlay the programme's pinned
 *                    scoreboard (the same evaluator for every commit, rule 9), run
 *                    the marked gates, and append the result. A regression prints
 *                    a revert proposal; nothing is pushed and no branch is made.
 *
 * Repositories with detector paths but no marked leg (today: every repository
 * but Installers, whose scoreboard runs only the Installers engines) report
 * their detector commits NOT CHECKED, never passed.
 *
 *   node ci/lib/ratchet-audit.mjs [--root <ws>] [--repo Name=<path>[@ref]] [--ref <ref>]
 *        [--coordination <scoreboard dir>] [--ci-manifest <ci/gates.json>] [--json]
 *        [--record [--scoreboard-tree <Installers dir>] [--runner <command>] [--limit <n>] [--dry-run]]
 *
 * `--runner` replaces the default (go build + devoid-scoreboard run) with a shell
 * command run in the temporary worktree, with SCOREBOARD_OUT and SCOREBOARD_GATES
 * in its environment; it must leave scoreboard.json in SCOREBOARD_OUT and exit
 * 0 (pass) or 1 (a gate failed).
 *
 * Exit: 0 pass; 1 a failing commit, a missing marker or an unsigned freeze file;
 * 2 NOT CHECKED; 3 usage.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT,
  FILES,
  UsageError,
  auditRange,
  combine,
  detectorCommits,
  detectorPathspecs,
  exitFor,
  freezeWindowFor,
  frozenPathspecs,
  git,
  loadCoordination,
  parseArgs,
  parseStrictJSON,
  pathMatches,
  readLedger,
  resolveCheckouts,
  scoreboardDirOf,
  signatureState,
} from './coordination.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD_FORMAT = 'devoid.scoreboard.ratchet-pass/1';
const RECORD_KEYS = [
  'commit', 'format', 'gates', 'gatesDigest', 'gatesSigned', 'leg', 'recordedAt', 'repo', 'result', 'rowSetDigest',
  'scoreboardTree', 'verdictSetDigest',
];

/** The scoreboard code and data every audited commit is scored with (rule 9: one evaluator). */
export const SCOREBOARD_OVERLAY = [
  'internal/scoreboard',
  'cmd/devoid-scoreboard',
  'scoreboard',
  'browser-extension/scripts/scoreboard-engine.mjs',
];

/**
 * The legs ci/gates.json marks as the shared ratchet, per audited repository.
 * Returns { byRepo: Map(repo -> {leg, gates}), problems: [] }.
 */
export function ratchetMarkers(manifest) {
  const byRepo = new Map();
  const problems = [];
  for (const [legRepo, repo] of Object.entries((manifest && manifest.repos) || {})) {
    for (const [gateId, cfg] of Object.entries(repo.mirrored || {})) {
      const rf = cfg && cfg.requiredFor;
      if (!rf) continue;
      const leg = `${legRepo}/${gateId}`;
      if (!Array.isArray(rf.repos) || !rf.repos.length || !Array.isArray(rf.gates) || !rf.gates.length) {
        problems.push(`ci/gates.json ${leg} requiredFor needs non-empty repos and gates`);
        continue;
      }
      if (rf.detectorPackages !== 'Installers/scoreboard/gates.v1.json#detectorPackages') {
        problems.push(`ci/gates.json ${leg} requiredFor.detectorPackages must name Installers/scoreboard/gates.v1.json#detectorPackages`);
      }
      for (const r of rf.repos) {
        if (byRepo.has(r)) problems.push(`ci/gates.json marks two legs requiredFor ${r}: ${byRepo.get(r).leg} and ${leg}`);
        byRepo.set(r, { leg, gates: [...rf.gates] });
      }
    }
  }
  if (!byRepo.size) problems.push('ci/gates.json marks no leg requiredFor detector commits: the shared ratchet is not wired (COORD-01)');
  return { byRepo, problems };
}

export function loadRatchetLedger(path) {
  if (!existsSync(path)) throw new Error(`${FILES.ratchetLedger} missing (${path})`);
  const lines = readLedger(path, FILES.ratchetLedger, null);
  lines.forEach((l, i) => {
    const keys = Object.keys(l).filter((k) => k !== 'detail').sort().join(',');
    if (keys !== RECORD_KEYS.join(',')) throw new Error(`${FILES.ratchetLedger}:${i + 1}: keys must be ${RECORD_KEYS.join(',')} (+ optional detail)`);
    if (l.format !== RECORD_FORMAT || !['pass', 'fail'].includes(l.result) || !/^[0-9a-f]{40}$/.test(l.commit)) {
      throw new Error(`${FILES.ratchetLedger}:${i + 1}: format, result (pass|fail) or commit is malformed`);
    }
  });
  return lines;
}

function loadManifest(opts) {
  const path = opts.ciManifest ? resolve(opts.ciManifest) : join(CI_DIR, 'gates.json');
  return parseStrictJSON(readFileSync(path, 'utf8'), path);
}

function setup(opts, res) {
  const nc = (m) => {
    res.notChecked.push(m);
    res.status = 'not-checked';
    return null;
  };
  const ws = resolveCheckouts(opts, []);
  if (!ws.root && !Object.keys(opts.repos).length) return nc(`NOT CHECKED -- ${ws.reason}`);
  const sbDir = scoreboardDirOf(ws.checkouts, opts.coordination);
  if (!sbDir) return nc('NOT CHECKED -- no Installers checkout, so no coordination data');
  const bundle = loadCoordination(sbDir);
  if (bundle.errors.length) return nc(bundle.errors.map((e) => `NOT CHECKED -- ${e}`).join('; '));
  let manifest;
  let ledger;
  try {
    manifest = loadManifest(opts);
    ledger = loadRatchetLedger(join(sbDir, FILES.ratchetLedger));
  } catch (e) {
    return nc(`NOT CHECKED -- ${e.message}`);
  }
  const repos = Object.keys(bundle.gates.detectorPackages.repos);
  const { checkouts } = resolveCheckouts(opts, repos);
  return { sbDir, bundle, manifest, ledger, repos, checkouts, markers: ratchetMarkers(manifest) };
}

/** Commits in range touching a frozen path, each marked whether it touches a detector path. */
function auditedCommits(ctx, repo, range) {
  const dpaths = detectorPathspecs(ctx.bundle.gates, repo);
  return detectorCommits(ctx.checkouts[repo].dir, range.base, range.head, frozenPathspecs(ctx.bundle, repo)).map((c) => ({
    ...c,
    detector: c.files.some((f) => dpaths.some((p) => pathMatches(p, f))),
  }));
}

export function check(opts, seams = {}) {
  const res = { status: 'pass', findings: [], notChecked: [], repos: {}, freeze: null };
  const ctx = setup(opts, res);
  if (!ctx) return res;
  const parts = [];
  for (const p of ctx.markers.problems) res.findings.push(p);

  res.freeze = signatureState(ctx.bundle, FILES.freeze, seams);
  if (!res.freeze.signed) {
    res.findings.push(`${FILES.freeze} is UNSIGNED at ${res.freeze.digest}: missing ${res.freeze.missing.join(' and ')} in ${FILES.ledger}`);
  }

  for (const repo of ctx.repos) {
    const rr = { commits: 0, detectorCommits: 0, failed: 0, notChecked: 0 };
    res.repos[repo] = rr;
    const range = auditRange(ctx.bundle.gates, repo, ctx.checkouts[repo]);
    if (range.notChecked) {
      rr.status = 'not-checked';
      res.notChecked.push(range.notChecked);
      parts.push('not-checked');
      continue;
    }
    rr.range = `${range.base.slice(0, 12)}..${range.head.slice(0, 12)}`;
    const marker = ctx.markers.byRepo.get(repo);
    for (const c of auditedCommits(ctx, repo, range)) {
      rr.commits += 1;
      const at = `${repo} ${c.sha.slice(0, 12)} ${c.day}`;
      const win = freezeWindowFor(ctx.bundle.freeze, c.day);
      if (win) {
        rr.failed += 1;
        res.findings.push(`${at}: committed inside the ${win.round} ${win.kind} freeze (${win.from}..${win.to}); the round's release candidate is void (KC-44)`);
      }
      if (!c.detector) continue;
      rr.detectorCommits += 1;
      if (!marker) {
        rr.notChecked += 1;
        res.notChecked.push(`${at}: NOT CHECKED -- no leg in ci/gates.json is marked requiredFor ${repo}'s detector paths`);
        continue;
      }
      const recs = ctx.ledger.filter((l) => l.repo === repo && l.commit === c.sha);
      const last = recs[recs.length - 1];
      if (!last) {
        rr.failed += 1;
        res.findings.push(`${at}: no ratchet-pass record (KC-44; run ci/lib/ratchet-audit.mjs --record)`);
      } else if (last.leg !== marker.leg || marker.gates.some((g) => !last.gates.includes(g))) {
        rr.failed += 1;
        res.findings.push(`${at}: its record comes from ${last.leg} [${last.gates.join(',')}], not the marked ratchet ${marker.leg} [${marker.gates.join(',')}]`);
      } else if (last.result !== 'pass') {
        rr.failed += 1;
        res.findings.push(`${at}: the ratchet recorded a regression${last.detail ? ` (${last.detail})` : ''}; revert it or bank it`);
      }
    }
    rr.status = rr.failed ? 'fail' : rr.notChecked ? 'not-checked' : 'pass';
    parts.push(rr.status);
  }
  if (res.findings.length) parts.push('fail');
  res.status = combine(parts);
  return res;
}

// ─── --record ────────────────────────────────────────────────────────────────

function readReport(outDir) {
  const p = join(outDir, 'scoreboard.json');
  if (!existsSync(p)) throw new Error('the runner left no scoreboard.json');
  const text = readFileSync(p, 'utf8');
  if (/"[^"]*readiness[^"]*"\s*:/i.test(text) || /scenario readiness/i.test(text)) {
    throw new Error('the report carries the readiness series; a merged report is not a ratchet record (rule 11)');
  }
  const rep = JSON.parse(text);
  if (rep.format !== 'devoid.scoreboard.report/1' || !rep.detectionScore || rep.detectionScore.name !== 'Detection score /10') {
    throw new Error('scoreboard.json is not a devoid.scoreboard.report/1 detection-series report');
  }
  return rep;
}

function defaultRunner(tree, outDir, gates) {
  const bin = join(outDir, process.platform === 'win32' ? 'devoid-scoreboard.exe' : 'devoid-scoreboard');
  const build = spawnSync('go', ['build', '-o', bin, './cmd/devoid-scoreboard'], { cwd: tree, encoding: 'utf8' });
  if (build.status !== 0) return { status: 2, output: `go build failed: ${build.stderr || build.error}` };
  const run = spawnSync(
    bin,
    [
      'run', '--dept', 'all', '--splits', 'public', '--presets', 'SHIPPED_CORE,SHIPPED_RESTRICTED,NONE',
      '--gates', 'scoreboard/gates.v1.json', '--import-map', 'scoreboard/import-map.v1.json',
      '--ratchet', 'scoreboard/baseline/public-regression.v1.json', '--out', join(outDir, 'report'),
      '--require-browser', '--gate', gates.join(','),
    ],
    { cwd: tree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return { status: run.status, output: `${run.stdout || ''}${run.stderr || ''}`, reportDir: join(outDir, 'report') };
}

function commandRunner(command, tree, outDir, gates) {
  const run = spawnSync(command, {
    cwd: tree,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, SCOREBOARD_OUT: join(outDir, 'report'), SCOREBOARD_GATES: gates.join(',') },
  });
  return { status: run.status, output: `${run.stdout || ''}${run.stderr || ''}`, reportDir: join(outDir, 'report') };
}

function treeLabel(dir) {
  const head = git(dir, ['rev-parse', 'HEAD']);
  const dirty = git(dir, ['status', '--porcelain', '--', ...SCOREBOARD_OVERLAY]);
  return `${head.ok ? head.stdout.trim() : 'unknown'}${dirty.ok && dirty.stdout.trim() ? '+worktree' : ''}`;
}

export function record(opts) {
  const res = { status: 'pass', findings: [], notChecked: [], recorded: [], errors: [], planned: [] };
  const ctx = setup(opts, res);
  if (!ctx) return res;
  const repo = 'Installers';
  const marker = ctx.markers.byRepo.get(repo);
  if (!marker || marker.leg !== 'Installers/pr-checks:scoreboard') {
    res.notChecked.push('NOT CHECKED -- ci/gates.json does not mark Installers/pr-checks:scoreboard requiredFor Installers');
    res.status = 'not-checked';
    return res;
  }
  for (const other of ctx.repos.filter((r) => r !== repo)) {
    res.notChecked.push(`${other}: NOT RECORDED -- no ratchet runner exists for ${other}'s detector paths yet`);
  }
  const range = auditRange(ctx.bundle.gates, repo, ctx.checkouts[repo]);
  if (range.notChecked) {
    res.notChecked.push(range.notChecked);
    res.status = 'not-checked';
    return res;
  }
  const inst = ctx.checkouts[repo].dir;
  const sbTree = resolve(opts.scoreboardTree || inst);
  const pending = auditedCommits(ctx, repo, range)
    .filter((c) => c.detector && !ctx.ledger.some((l) => l.repo === repo && l.commit === c.sha))
    .reverse(); // oldest first
  const limit = opts.limit ? Number(opts.limit) : pending.length;
  for (const c of pending.slice(0, limit)) {
    res.planned.push(c.sha);
    if (opts.dryRun) continue;
    const tmp = mkdtempSync(join(tmpdir(), 'd9-ratchet-'));
    const tree = join(tmp, 'tree');
    const outDir = join(tmp, 'out');
    mkdirSync(outDir);
    try {
      const add = git(inst, ['worktree', 'add', '--detach', tree, c.sha]);
      if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr.trim()}`);
      for (const p of SCOREBOARD_OVERLAY) {
        const src = join(sbTree, p);
        if (!existsSync(src)) throw new Error(`the scoreboard tree ${sbTree} has no ${p}`);
        rmSync(join(tree, p), { recursive: true, force: true });
        cpSync(src, join(tree, p), { recursive: true });
      }
      const run = opts.runner ? commandRunner(opts.runner, tree, outDir, marker.gates) : defaultRunner(tree, outDir, marker.gates);
      if (run.status !== 0 && run.status !== 1) throw new Error(`the runner exited ${run.status}: ${run.output.trim().split('\n').slice(-3).join(' | ')}`);
      const rep = readReport(run.reportDir);
      const results = new Map((rep.gateResults || []).map((g) => [g.id, g]));
      const failing = marker.gates.filter((g) => !results.has(g) || results.get(g).status !== 'PASS');
      if (run.status === 0 && failing.length) throw new Error(`the runner exited 0 but ${failing.join(',')} did not PASS in its report`);
      const result = run.status === 0 ? 'pass' : 'fail';
      if (result === 'fail' && !failing.length) throw new Error('the runner exited 1 but every marked gate PASSED in its report');
      const line = {
        format: RECORD_FORMAT,
        repo,
        commit: c.sha,
        leg: marker.leg,
        gates: marker.gates,
        result,
        gatesDigest: rep.gates && rep.gates.digest,
        gatesSigned: Boolean(rep.gates && rep.gates.signed),
        rowSetDigest: rep.rowSetDigest,
        verdictSetDigest: rep.verdictSetDigest,
        scoreboardTree: treeLabel(sbTree),
        recordedAt: new Date().toISOString(),
      };
      if (result === 'fail') {
        line.detail = failing.map((g) => `${g}: ${(results.get(g) && results.get(g).detail || []).slice(0, 3).join('; ')}`).join(' | ');
      }
      appendFileSync(join(ctx.sbDir, FILES.ratchetLedger), `${JSON.stringify(line)}\n`);
      res.recorded.push({ commit: c.sha, result });
      if (result === 'fail') {
        res.findings.push(
          `REGRESSION at ${c.sha.slice(0, 12)} (${c.subject}): ${line.detail}. Proposed revert, for a person to open as a PR: ` +
            `git switch -c ratchet-revert/${c.sha.slice(0, 12)} origin/main && git revert ${c.sha}. Nothing was pushed.`,
        );
      }
    } catch (e) {
      res.errors.push(`${c.sha.slice(0, 12)}: ${e.message}`);
    } finally {
      git(inst, ['worktree', 'remove', '--force', tree]);
      rmSync(tmp, { recursive: true, force: true });
      git(inst, ['worktree', 'prune']);
    }
  }
  res.status = res.findings.length ? 'fail' : res.errors.length ? 'not-checked' : 'pass';
  return res;
}

function render(res, recording) {
  const out = [recording ? 'post-push ratchet audit: record' : 'post-push ratchet audit (shared ratchet, freeze windows)'];
  if (res.freeze) out.push(`  ${res.freeze.file}: ${res.freeze.signed ? 'signed' : `UNSIGNED (${res.freeze.digest})`}`);
  for (const [repo, r] of Object.entries(res.repos || {})) {
    if (r.status === 'not-checked' && !r.range) continue;
    out.push(`  ${repo.padEnd(15)} ${r.range}  ${r.commits} commit(s) on frozen paths, ${r.detectorCommits} detector, ${r.failed} failing`);
  }
  for (const c of res.recorded || []) out.push(`  recorded ${c.commit.slice(0, 12)} ${c.result}`);
  if (recording && res.planned && !res.recorded.length && !res.errors.length) out.push(`  ${res.planned.length} commit(s) to record${res.planned.length ? `: ${res.planned.map((s) => s.slice(0, 12)).join(' ')}` : ''}`);
  for (const m of res.notChecked) out.push(`  ${m}`);
  for (const e of res.errors || []) out.push(`  ERROR ${e}`);
  for (const f of res.findings) out.push(`  FAIL ${f}`);
  out.push(res.status === 'pass' ? 'PASS' : res.status === 'fail' ? 'FAIL' : 'NOT CHECKED');
  return out.join('\n') + '\n';
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), {
      '--coordination': 'value',
      '--ci-manifest': 'value',
      '--record': 'bool',
      '--scoreboard-tree': 'value',
      '--runner': 'value',
      '--limit': 'value',
      '--dry-run': 'bool',
    });
    opts.coordination = opts.extra['--coordination'];
    opts.ciManifest = opts.extra['--ci-manifest'];
    opts.scoreboardTree = opts.extra['--scoreboard-tree'];
    opts.runner = opts.extra['--runner'];
    opts.limit = opts.extra['--limit'];
    opts.dryRun = Boolean(opts.extra['--dry-run']);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(e instanceof UsageError ? EXIT.USAGE : EXIT.NOT_CHECKED);
  }
  const recording = Boolean(opts.extra['--record']);
  let res;
  try {
    res = recording ? record(opts) : check(opts);
  } catch (e) {
    res = { status: 'not-checked', findings: [], notChecked: [`NOT CHECKED -- ${e.message}`], repos: {} };
  }
  process.stdout.write(opts.json ? `${JSON.stringify(res, null, 2)}\n` : render(res, recording));
  process.exit(exitFor(res.status));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
