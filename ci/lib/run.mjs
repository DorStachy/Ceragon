#!/usr/bin/env node
/**
 * devoid-ci -- run this workspace's GitHub Actions gates locally, in Docker.
 *
 *   node ci/lib/run.mjs <repo|all> [gate...] [flags]
 *
 * The gates are not defined here. They are read out of each repo's real
 * `.github/workflows/*.yml` at run time; `ci/gates.json` only says WHICH jobs
 * are mirrored, which image each one needs, and -- for the jobs that cannot run
 * on a laptop at all -- why not. See ci/README.md.
 *
 * Exit status is the only thing a script should trust: 0 iff every gate that
 * ran reached PASS. PARTIAL (a job whose remaining steps needed cloud
 * credentials) is NOT a pass and does not exit 0 unless --allow-partial.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { expandMatrix, planJob } from './workflow.mjs';
import { resolveWorkflowText, branchState, mergedTree } from './wfsource.mjs';
import {
  daemonUp,
  docker,
  dockerOk,
  ensurePod,
  ensureVolume,
  removeVolume,
  buildImage,
  copyTreeIntoContainer,
  copyGitDirIntoContainer,
  materializeWorkspace,
  pristineStamp,
  WORKDIR,
  imageExists,
  rmContainer,
  startService,
  stopServices,
  waitForService,
} from './docker.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(CI_DIR, '..');
const MANIFEST = JSON.parse(readFileSync(join(CI_DIR, 'gates.json'), 'utf8'));
const LOG_DIR = join(CI_DIR, '.logs');

/**
 * WORKSPACE CHECKS -- the things no single repo's CI can see.
 *
 * Every gate above this line belongs to one repository and runs inside that
 * repository's container. That is the right shape for a gate that asks a
 * question about one repo, and the wrong shape for a contract SPLIT ACROSS
 * repos: three green repos can still disagree with each other, and no per-repo
 * job is standing anywhere it could notice.
 *
 * These run on the host, not in Docker, because their whole value is seeing
 * more than one checkout at once. They therefore also run when Docker is down.
 * They are declared in `gates.json` under `workspaceChecks`; unlike `mirrored`,
 * that key does NOT mirror a GitHub job, so `drift.mjs` neither expects nor
 * validates it.
 */
const WORKSPACE_CHECKS = MANIFEST.workspaceChecks || [];
const WORKSPACE_KEY = 'workspace';

// Written with String.fromCharCode(27) rather than a literal escape byte so
// the source stays copy-pasteable and greppable.
const E = String.fromCharCode(27);
const C = {
  reset: E + '[0m',
  dim: E + '[2m',
  bold: E + '[1m',
  red: E + '[31m',
  green: E + '[32m',
  yellow: E + '[33m',
  cyan: E + '[36m',
};

function parseArgs(argv) {
  const flags = {
    list: false,
    fresh: false,
    noCache: false,
    allowPartial: false,
    merged: false,
    keep: false,
    jobs: 1,
    only: null,
    json: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--list' || a === '-l') flags.list = true;
    else if (a === '--fresh') flags.fresh = true;
    else if (a === '--no-cache') flags.noCache = true;
    else if (a === '--allow-partial') flags.allowPartial = true;
    else if (a === '--merged') flags.merged = true;
    else if (a === '--keep') flags.keep = true;
    else if (a === '--jobs') flags.jobs = Number(argv[++i]) || 1;
    else if (a === '--only') flags.only = argv[++i];
    else if (a === '--json') flags.json = argv[++i];
    else if (a.startsWith('-')) throw new Error(`unknown flag ${a}`);
    else positional.push(a);
  }
  return { flags, positional };
}

function gitInfo(repoPath) {
  const run = (args) => {
    try {
      return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  return { sha: run(['rev-parse', 'HEAD']), ref: run(['rev-parse', '--abbrev-ref', 'HEAD']) };
}

/** Every mirrored gate for a repo, matrix already expanded into legs. */
function enumerateGates(repoKey) {
  const repo = MANIFEST.repos[repoKey];
  if (!repo) throw new Error(`unknown repo "${repoKey}" -- see ci/gates.json`);
  const repoPath = join(ROOT, repo.path);
  const git = gitInfo(repoPath);
  const gates = [];

  for (const [gateId, cfg] of Object.entries(repo.mirrored)) {
    const [wfName, jobId] = gateId.split(':');
    const relPath = `.github/workflows/${wfName}.yml`;
    const src = resolveWorkflowText(repoPath, relPath);
    if (!src) {
      gates.push({ gateId, error: `no such workflow file, here or on origin/main: ${relPath}` });
      continue;
    }
    let wf;
    try {
      wf = parseYaml(src.text);
    } catch (e) {
      gates.push({ gateId, error: `cannot parse ${wfName}.yml (${src.source}): ${e.message}` });
      continue;
    }
    const job = wf.jobs?.[jobId];
    if (!job) {
      gates.push({ gateId, error: `workflow ${wfName}.yml has no job "${jobId}"` });
      continue;
    }

    const ctx = {
      github: {
        workspace: WORKDIR,
        event_name: 'pull_request',
        sha: git.sha,
        ref_name: git.ref,
        repository: `Ceragon-Prod/${repoKey}`,
        actor: 'devoid-ci-local',
      },
      runner: { os: 'Linux', temp: '/tmp', arch: 'X64' },
      inputs: cfg.inputs || {},
      vars: cfg.vars || {},
    };

    let combos = expandMatrix(job.strategy);
    if (cfg.matrix) {
      combos = combos.filter((c) =>
        Object.entries(cfg.matrix).every(([k, v]) => String(c[k]) === String(v)),
      );
    }
    for (const combo of combos) {
      const legSuffix = Object.keys(combo).length
        ? `#${Object.entries(combo)
            .map(([k, v]) => `${k}=${typeof v === 'object' ? v.name || JSON.stringify(v) : v}`)
            .join(',')}`
        : '';
      gates.push({
        gateId,
        legId: `${gateId}${legSuffix}`,
        repoKey,
        repoPath,
        wfName,
        wfSource: src.source,
        wfNote: src.note,
        jobId,
        wf,
        combo,
        ctx,
        cfg,
        image: cfg.image || repo.defaultImage,
        jobName: job.name || jobId,
      });
    }
  }
  return gates;
}

async function ensureImages(needed, flags, log) {
  for (const key of needed) {
    const df = MANIFEST.images[key];
    if (!df) throw new Error(`gates.json references image "${key}" with no images[] entry`);
    const tag = `devoid-ci/${key}:latest`;
    if (!flags.noCache && (await imageExists(tag))) continue;
    log(`${C.dim}building image ${tag} (first run only, a few minutes)${C.reset}\n`);
    await buildImage(tag, join(CI_DIR, df), CI_DIR, { noCache: flags.noCache, log: () => {} });
  }
}

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 60);
}

/**
 * A fingerprint of exactly what would be transferred: the commit or merge tree,
 * plus the size and mtime of every uncommitted file. Editing a file changes it;
 * running the same gates twice on an untouched tree does not.
 */
function treeStamp(repoPath, tree, overlay) {
  const h = createHash('sha256');
  h.update(tree || '');
  if (!tree) {
    try {
      h.update(execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }));
    } catch {
      h.update('no-head');
    }
  }
  for (const p of overlay?.remove || []) h.update(`- ${p}\n`);
  for (const p of overlay?.add || []) {
    try {
      const st = statSync(join(repoPath, p));
      h.update(`+ ${p} ${st.size} ${st.mtimeMs}\n`);
    } catch {
      h.update(`+ ${p} missing\n`);
    }
  }
  return h.digest('hex');
}

/**
 * Uncommitted work, expressed as files to lay over the git archive and files to
 * remove from it.
 *
 * `git status --porcelain` is the right source rather than a filesystem walk
 * because it respects .gitignore for free: build output, caches and
 * node_modules never appear, which is exactly what a GitHub checkout looks
 * like. It also means a gate can be run against edits that have not been
 * committed, which is the normal case while working.
 */
function workingTreeOverlay(repoPath) {
  let raw = '';
  try {
    raw = execFileSync('git', ['-C', repoPath, 'status', '--porcelain', '-z', '--untracked-files=all'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return { add: [], remove: [], skipped: [] };
  }

  const add = [];
  const remove = [];
  const skipped = [];
  const entries = raw.split('\0');
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    const x = entry[0];
    const y = entry[1];
    const path = entry.slice(3);
    if (x === 'R' || x === 'C') {
      // Rename/copy: `-z` puts the ORIGIN in the next field. The new name is
      // added, the old one removed.
      const origin = entries[++i];
      if (origin) remove.push(origin);
      add.push(path);
      continue;
    }
    if (x === 'D' || y === 'D') {
      remove.push(path);
      continue;
    }
    if (x === 'U' || y === 'U') {
      // An unmerged path has no single content to copy. Named, not guessed at.
      skipped.push(path);
      continue;
    }
    add.push(path);
  }
  return { add, remove, skipped };
}

async function runGate(gate, flags, log) {
  const repo = MANIFEST.repos[gate.repoKey];
  const plan = planJob(gate.wf, gate.jobId, gate.combo, gate.ctx);
  const pod = `devoidci-pod-${safeName(gate.repoKey)}`;
  const container = `devoidci-run-${safeName(gate.repoKey)}-${safeName(gate.legId)}`;
  const volume = repo.volume;
  const tag = `devoid-ci/${gate.image}:latest`;

  const logFile = join(LOG_DIR, gate.repoKey, `${safeName(gate.legId)}.log`);
  mkdirSync(dirname(logFile), { recursive: true });
  let logBuf = `# ${gate.repoKey} :: ${gate.legId}\n# mirrors ${gate.wfName}.yml job "${gate.jobId}" (${gate.jobName})\n\n`;
  const cap = (s) => {
    logBuf += s;
  };

  const started = Date.now();
  const services = [];
  const result = { ...gate, steps: [], status: 'pass', logFile };

  try {
    await ensurePod(pod);
    await ensureVolume(volume);
    if (flags.fresh) {
      await removeVolume(volume);
      await ensureVolume(volume);
    }

    for (const [key, spec] of Object.entries(plan.services)) {
      const normalized = typeof spec === 'string' ? { image: spec } : spec;
      const svc = await startService(pod, key, normalized, { log });
      services.push(svc);
    }
    for (const svc of services) await waitForService(svc, { log });

    await rmContainer(container);
    const runArgs = [
      'run', '-d', '--name', container,
      '--network', `container:${pod}`,
      '-v', `${volume}:/w`,
      '-v', `${MANIFEST.caches.npm}:/root/.npm`,
      '-v', `${MANIFEST.caches.go}:/gocache`,
      '-w', WORKDIR,
    ];
    if (gate.cfg.dockerSocket || repo.dockerSocket) {
      runArgs.push('-v', '/var/run/docker.sock:/var/run/docker.sock');
    }
    runArgs.push(tag, 'sleep', 'infinity');
    await dockerOk(runArgs);

    // --- checkout: what actions/checkout does, minus the network ---
    const t0 = Date.now();
    const tree = flags.merged ? gate.mergedTree : undefined;
    const overlay = tree ? null : workingTreeOverlay(gate.repoPath);
    if (overlay?.skipped?.length) {
      cap(`--- checkout: ${overlay.skipped.length} unmergeable path(s) skipped\n`);
    }
    const stamp = treeStamp(gate.repoPath, tree, overlay);
    if ((await pristineStamp(container)) === stamp) {
      cap('--- checkout: reusing the copy already in this volume (same tree, same edits)\n');
    } else {
      await copyTreeIntoContainer(container, gate.repoPath, { log: cap, tree, overlay, stamp });
      if (repo.copyGit) {
        // A git tree carries no `.git`, so for the repos whose gates ask git
        // questions it has to arrive by a second route.
        await copyGitDirIntoContainer(container, gate.repoPath, { log: cap });
      }
    }
    await materializeWorkspace(container);
    if (repo.copyGit) {
      // Point the index at the same tree the files came from, or every tracked
      // file reads as modified and a lockfile guard fails on the copy alone.
      const idx = await docker([
        'exec', container, 'bash', '-c',
        `git config --global --add safe.directory ${WORKDIR} && ` +
          `git -C ${WORKDIR} config core.autocrlf false && ` +
          `git -C ${WORKDIR} read-tree ${tree || 'HEAD'} && ` +
          `git -C ${WORKDIR} update-index --really-refresh >/dev/null 2>&1 || true`,
      ]);
      if (idx.code !== 0) throw new Error(`could not settle the git index:\n${idx.err}`);
    }
    cap(`--- checkout: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

    if (repo.postCheckout) {
      const pc = await docker(['exec', container, 'bash', '-c', repo.postCheckout], {
        onStdout: cap,
        onStderr: cap,
      });
      if (pc.code !== 0) throw new Error(`postCheckout failed:` + pc.err);
    }

    // --- steps ---
    const carried = {}; // what steps wrote to $GITHUB_ENV, as GitHub carries it forward
    for (const step of plan.steps) {
      if (step.kind !== 'run') {
        result.steps.push(step);
        cap(`\n--- SKIP  ${step.name}\n      ${step.reason}\n`);
        if (step.kind === 'cloud-fence') result.status = 'partial';
        continue;
      }

      const env = {
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GITHUB_WORKSPACE: WORKDIR,
        GITHUB_SHA: gate.ctx.github.sha,
        GITHUB_REF_NAME: gate.ctx.github.ref,
        GITHUB_REPOSITORY: gate.ctx.github.repository,
        GITHUB_EVENT_NAME: gate.ctx.github.event_name,
        GITHUB_STEP_SUMMARY: '/tmp/github_step_summary.md',
        GITHUB_OUTPUT: '/tmp/github_output',
        GITHUB_ENV: '/tmp/github_env',
        RUNNER_TEMP: '/tmp',
        RUNNER_OS: 'Linux',
        HOME: '/root',
        ...carried,
        ...step.env,
      };

      const args = ['exec'];
      for (const [k, v] of Object.entries(env)) args.push('-e', `${k}=${v}`);
      args.push('-w', step.cwd ? `${WORKDIR}/${step.cwd}` : WORKDIR, container);
      args.push('bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c',
        'rm -f /tmp/github_env; touch /tmp/github_env /tmp/github_output /tmp/github_step_summary.md\n' + step.run);

      cap(`\n=== STEP  ${step.name}\n`);
      const t0 = Date.now();
      const r = await docker(args, { onStdout: cap, onStderr: cap });
      const ms = Date.now() - t0;

      // GitHub carries `KEY=value` lines written to $GITHUB_ENV into later steps.
      const envDump = await docker(['exec', container, 'sh', '-c', 'cat /tmp/github_env 2>/dev/null || true']);
      for (const line of envDump.out.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) carried[m[1]] = m[2];
      }

      result.steps.push({ ...step, code: r.code, ms });
      if (r.code !== 0) {
        result.status = 'fail';
        cap(`\n!!! STEP FAILED (exit ${r.code}) after ${(ms / 1000).toFixed(1)}s\n`);
        break;
      }
      cap(`\n--- ok (${(ms / 1000).toFixed(1)}s)\n`);
    }
  } catch (e) {
    result.status = 'error';
    result.error = e.message;
    cap(`\n!!! RUNNER ERROR\n${e.stack || e.message}\n`);
  } finally {
    if (!flags.keep) {
      await rmContainer(container);
      await stopServices(services);
    }
    result.ms = Date.now() - started;
    writeFileSync(logFile, logBuf);
  }
  return result;
}

/**
 * Run the host-side workspace checks.
 *
 * Exit-status contract, which each check documents for itself:
 *   0  the check was made and passed
 *   1  the check was made and failed
 *   2  THE CHECK COULD NOT BE MADE -- reported as ERROR, never as a pass.
 * Anything else is an error too. A cross-repo check that shrugs when a sibling
 * checkout is missing would recreate the exact defect it exists to catch, so
 * "could not compare" is a red result here and not a footnote.
 */
async function runWorkspaceChecks(list, flags, log) {
  const results = [];
  mkdirSync(join(LOG_DIR, WORKSPACE_KEY), { recursive: true });
  for (const check of list) {
    log(`${C.dim}>>${C.reset} ${WORKSPACE_KEY} ${C.cyan}${check.id}${C.reset}\n`);
    const started = Date.now();
    const logFile = join(LOG_DIR, WORKSPACE_KEY, `${safeName(check.id)}.log`);
    let code;
    let out = '';
    try {
      out = execFileSync(process.execPath, [join(ROOT, check.script), ...(check.args || [])], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      code = 0;
    } catch (err) {
      code = typeof err.status === 'number' ? err.status : 2;
      out = `${err.stdout || ''}${err.stderr || ''}${err.status === undefined ? err.message : ''}`;
    }
    writeFileSync(logFile, out);
    const status = code === 0 ? 'pass' : code === 1 ? 'fail' : 'error';
    results.push({
      repoKey: WORKSPACE_KEY,
      legId: check.id,
      gateId: check.id,
      wfName: 'workspace',
      jobId: check.script,
      status,
      ms: Date.now() - started,
      logFile,
      steps: [{ name: check.script, kind: 'host', code, reason: check.why }],
    });
    if (status !== 'pass') log(out.replace(/\n?$/, '\n'));
    log(
      `   ${statusLabel(status)} ${WORKSPACE_KEY} ${check.id} ` +
        `${C.dim}${((Date.now() - started) / 1000).toFixed(0)}s${C.reset}` +
        (code === 2 ? `  ${C.red}<- could not be checked${C.reset}` : '') +
        '\n',
    );
  }
  return results;
}

function statusLabel(s) {
  if (s === 'pass') return `${C.green}PASS   ${C.reset}`;
  if (s === 'fail') return `${C.red}FAIL   ${C.reset}`;
  if (s === 'partial') return `${C.yellow}PARTIAL${C.reset}`;
  return `${C.red}ERROR  ${C.reset}`;
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const log = (s) => process.stdout.write(s);

  const allRepos = !positional.length || positional[0] === 'all';
  const workspaceOnly = positional[0] === WORKSPACE_KEY;
  const repoKeys = allRepos ? Object.keys(MANIFEST.repos) : workspaceOnly ? [] : [positional[0]];
  const wanted = positional.slice(1);

  // The cross-repo checks run when the whole workspace is in scope, or when
  // asked for by name. They are skipped for a single-repo run for the same
  // reason a single-repo run does not build the other repos' images -- but that
  // is exactly why `node ci/lib/run.mjs all` has to include them, and does.
  let workspaceChecks = allRepos || workspaceOnly ? WORKSPACE_CHECKS : [];
  if (workspaceOnly && wanted.length) {
    workspaceChecks = workspaceChecks.filter((c) => wanted.includes(c.id));
  }
  if (flags.only) workspaceChecks = workspaceChecks.filter((c) => c.id.includes(flags.only));

  let gates = repoKeys.flatMap((r) => enumerateGates(r));
  if (wanted.length) {
    gates = gates.filter((g) => wanted.some((w) => g.gateId === w || g.legId === w || g.gateId?.endsWith(`:${w}`)));
  }
  if (flags.only) gates = gates.filter((g) => (g.legId || g.gateId).includes(flags.only));

  const broken = gates.filter((g) => g.error);
  gates = gates.filter((g) => !g.error);

  if (flags.list) {
    for (const key of repoKeys) {
      const repo = MANIFEST.repos[key];
      log(`\n${C.bold}${key}${C.reset}  ${C.dim}(image ${repo.defaultImage}, volume ${repo.volume})${C.reset}\n`);
      for (const g of gates.filter((x) => x.repoKey === key)) {
        log(`  ${C.cyan}${g.legId}${C.reset}\n      ${C.dim}${g.wfName}.yml -> ${g.jobName}${C.reset}\n`);
      }
      for (const [job, why] of Object.entries(repo.cannotMirror || {})) {
        log(`  ${C.yellow}(not mirrored)${C.reset} ${job}\n      ${C.dim}${why}${C.reset}\n`);
      }
    }
    if (workspaceChecks.length) {
      log(`\n${C.bold}${WORKSPACE_KEY}${C.reset}  ${C.dim}(host, no Docker; sees every checkout at once)${C.reset}\n`);
      for (const check of workspaceChecks) {
        log(`  ${C.cyan}${check.id}${C.reset}\n      ${C.dim}${check.script} -- ${check.why}${C.reset}\n`);
      }
    }
    for (const b of broken) log(`\n${C.red}BROKEN MANIFEST ENTRY${C.reset} ${b.gateId}: ${b.error}\n`);
    process.exit(broken.length ? 1 : 0);
  }

  // Before the Docker gate, so a cross-repo contract break is reported even
  // when Docker Desktop is down -- these need three git checkouts, not a daemon.
  const workspaceResults = workspaceChecks.length
    ? await runWorkspaceChecks(workspaceChecks, flags, log)
    : [];

  if (workspaceOnly) {
    const bad = workspaceResults.filter((r) => r.status !== 'pass');
    log(`\n${C.bold}${'='.repeat(72)}${C.reset}\n`);
    for (const r of workspaceResults) {
      log(`${statusLabel(r.status)} ${r.repoKey.padEnd(30)} ${r.legId}\n`);
      if (r.status !== 'pass') log(`          ${C.dim}log: ${r.logFile}${C.reset}\n`);
    }
    process.exit(bad.length ? 1 : 0);
  }

  if (!(await daemonUp())) {
    log(`${C.red}Docker is not running.${C.reset} Start Docker Desktop and try again.\n`);
    process.exit(2);
  }
  if (broken.length) {
    for (const b of broken) log(`${C.red}BROKEN MANIFEST ENTRY${C.reset} ${b.gateId}: ${b.error}\n`);
    log(`\nRefusing to run: ci/gates.json names gates that do not exist. Run 'node ci/lib/drift.mjs'.\n`);
    process.exit(2);
  }
  if (!gates.length) {
    log('no gates matched\n');
    process.exit(2);
  }

  // What a PR would test is the MERGE of this branch into main, not the branch
  // tip. When a checkout is behind, those trees differ, and the difference
  // shows up as a gate failure with no obvious cause -- the first real run here
  // failed Frontend's em-dash gate with "Cannot find module
  // /w/scripts/check-no-em-dash.cjs", because main's workflow calls a fence
  // script main has and the branch does not. Say so before the gates run, not
  // after somebody has spent an hour on it.
  for (const key of [...new Set(gates.map((g) => g.repoKey))]) {
    const st = branchState(join(ROOT, MANIFEST.repos[key].path));
    if (!st) continue;
    const bits = [];
    if (st.ahead) bits.push(`${st.ahead} ahead`);
    if (st.behind) bits.push(`${C.yellow}${st.behind} behind${C.reset}`);
    if (st.dirty) bits.push('uncommitted changes');
    log(
      `${C.dim}${key}${C.reset} on ${C.cyan}${st.branch}${C.reset}` +
        (bits.length ? ` (${bits.join(', ')})` : ' (level with main)') +
        '\n',
    );
    if (st.behind && !flags.merged) {
      log(
        `   ${C.yellow}A pull request would test this branch MERGED with main; this run tests the branch alone.${C.reset}\n` +
          `   ${C.dim}Pass --merged to build and test the real merge tree, or bring the branch up to date.${C.reset}\n`,
      );
    }
  }
  if (flags.merged) {
    for (const g of gates) {
      g.mergedTree = mergedTree(g.repoPath);
      if (!g.mergedTree) {
        log(
          `${C.red}${g.repoKey}: origin/main and HEAD do not merge cleanly.${C.reset} ` +
            `GitHub would not run checks on that pull request either. Resolve it first.\n`,
        );
        process.exit(2);
      }
    }
  }

  await ensureImages([...new Set(gates.map((g) => g.image))], flags, log);

  const results = [...workspaceResults];
  const byRepo = new Map();
  for (const g of gates) {
    if (!byRepo.has(g.repoKey)) byRepo.set(g.repoKey, []);
    byRepo.get(g.repoKey).push(g);
  }

  // Repos run in parallel (separate pods, separate volumes); gates within one
  // repo run in order because they share that repo's workspace volume.
  const queues = [...byRepo.entries()];
  const workers = Array.from({ length: Math.max(1, Math.min(flags.jobs, queues.length)) }, async () => {
    for (;;) {
      const next = queues.shift();
      if (!next) return;
      const [repoKey, list] = next;
      for (const g of list) {
        log(`${C.dim}>>${C.reset} ${repoKey} ${C.cyan}${g.legId}${C.reset}\n`);
        const r = await runGate(g, flags, log);
        results.push(r);
        const failed = r.steps.find((s) => s.code);
        log(
          `   ${statusLabel(r.status)} ${repoKey} ${g.legId} ${C.dim}${(r.ms / 1000).toFixed(0)}s${C.reset}` +
            (failed ? `  ${C.red}<- ${failed.name}${C.reset}` : '') +
            `\n`,
        );
      }
    }
  });
  await Promise.all(workers);

  log(`\n${C.bold}${'='.repeat(72)}${C.reset}\n`);
  for (const r of results.sort((a, b) => (a.repoKey + a.legId).localeCompare(b.repoKey + b.legId))) {
    log(`${statusLabel(r.status)} ${r.repoKey.padEnd(30)} ${r.legId}\n`);
    if (r.status === 'partial') {
      const fence = r.steps.find((s) => s.kind === 'cloud-fence');
      log(`          ${C.dim}stopped at: ${fence?.name} -- ${fence?.reason}${C.reset}\n`);
    }
    if (r.status !== 'pass') log(`          ${C.dim}log: ${r.logFile}${C.reset}\n`);
  }

  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  log(
    `\n${counts.pass || 0} pass, ${counts.fail || 0} fail, ${counts.partial || 0} partial, ${counts.error || 0} error\n`,
  );

  if (flags.json) {
    writeFileSync(
      flags.json,
      JSON.stringify(
        results.map((r) => ({
          repo: r.repoKey,
          gate: r.legId,
          mirrors: `${r.wfName}.yml#${r.jobId}`,
          status: r.status,
          ms: r.ms,
          log: r.logFile,
          steps: r.steps.map((s) => ({ name: s.name, kind: s.kind, code: s.code ?? null, reason: s.reason })),
        })),
        null,
        2,
      ),
    );
  }

  const bad = results.filter((r) => r.status === 'fail' || r.status === 'error').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  process.exit(bad || (partial && !flags.allowPartial) ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`${C.red}${e.stack || e.message}${C.reset}\n`);
  process.exit(2);
});
