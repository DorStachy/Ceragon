#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * P1-7 (2026-05-14 stabilization): single release-readiness gate.
 *
 * Runs the entire production-readiness chain in a deterministic order
 * and fails fast on any non-zero exit. Replaces the prior pattern of
 * relying on operator memory + manual sequencing.
 *
 * Sequence (each step halts the gate on non-zero exit):
 *   1. Local contract/unit tests (test:worker-contract) for each repo
 *   2. Frozen-lockfile sanity (single lockfile per repo)
 *   3. Migration lint + dry-run status
 *   4. Security audit allowlist (npm audit --audit-level=high)
 *   5. GitHub Actions check status for required workflows
 *   6. ECS rollout state (deployments[*].rolloutState === COMPLETED)
 *   7. Exact image SHA verification (scripts/verify-ecs-image-shas.cjs)
 *   8. Queue/DLQ zero check (scripts/verify-queues-empty.cjs)
 *   9. Cleanup verification (scripts/scanner-fresh-reset.cjs --verify ...)
 *  10. Smoke package check
 *
 * Invocation:
 *   node scripts/production-readiness-gate.cjs --config production-readiness.config.json
 *
 * The config file declares the actual cluster/service names, expected
 * SHAs, queue URLs, smoke-package corpus, etc. Operators wire it once
 * per environment.
 *
 * NEVER add `|| true` here. Advisory-only checks belong outside the gate.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);

// ════════════════════════════════════════════════════════════════════════
// Vulnerability-applicability corpus section (Task 7, 2026-05-31 plan).
//
// Derives ACTIVE / EXCLUDED / DEGRADED / CLEAN finding counts from the SHARED
// fixture corpus (`packages/shared-contracts/.../vulnerability-applicability-
// fixtures.ts`, built to dist) and asserts the two LIVE production false
// positives are classified NOT_AFFECTED while the true-positive control is
// MATCHED. This is the release-gate's "the FP class is still closed" tripwire:
// if anyone re-introduces package-level-presence-as-active, these assertions
// fail and the gate stops.
//
// Runs as the FIRST step of the main gate (before any AWS/ECS calls) AND can be
// invoked standalone for fast local/CI checks:
//     node scripts/production-readiness-gate.cjs --corpus-only
//
// NEVER soften these assertions. The two FPs and the control are load-bearing.
// ════════════════════════════════════════════════════════════════════════

// The exact live production false positives + the true-positive control,
// pinned by coordinate + advisory id (plan "Live Retest Evidence").
const LIVE_FP_EXPECTATIONS = [
  {
    label: 'playwright FP',
    fixtureId: 'playwright-prerelease-above-fix',
    coordinate: 'npm:playwright@1.61.0-alpha-1778188671000',
    advisoryId: 'GHSA-7mvr-c777-76hp',
    expectState: 'NOT_AFFECTED',
  },
  {
    label: 'eslint-scope FP',
    fixtureId: 'eslint-scope-not-affected',
    coordinate: 'npm:eslint-scope@7.2.2',
    advisoryId: 'GHSA-hxxf-q3w9-4xgw',
    expectState: 'NOT_AFFECTED',
  },
];
const TRUE_POSITIVE_CONTROL = {
  label: 'eslint-scope control',
  fixtureId: 'eslint-scope-affected',
  coordinate: 'npm:eslint-scope@3.7.2',
  advisoryId: 'GHSA-hxxf-q3w9-4xgw',
  expectState: 'MATCHED',
};

function loadApplicabilityCorpus() {
  const distDir = path.resolve(
    __dirname,
    '..',
    'packages',
    'shared-contracts',
    'dist',
  );
  const fixturesPath = path.join(distDir, 'vulnerability-applicability-fixtures.js');
  const contractPath = path.join(distDir, 'vulnerability-applicability.js');
  if (!fs.existsSync(fixturesPath) || !fs.existsSync(contractPath)) {
    throw new Error(
      `vulnerability-applicability dist not built (${fixturesPath}). ` +
        `Build it first:  (cd packages/shared-contracts && npm run build)`,
    );
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const fixtures = require(fixturesPath);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const contract = require(contractPath);
  return { fixtures, contract };
}

// Classify every advisory across the corpus into the four release-gate buckets
// and report the per-fixture clean/degraded coverage rollup. Returns the counts
// plus a failures[] array (empty == green).
function runApplicabilityCorpusGate() {
  console.log('\n▶  Vulnerability-applicability fixture corpus');
  const { fixtures, contract } = loadApplicabilityCorpus();
  const corpus = fixtures.VULNERABILITY_APPLICABILITY_FIXTURES;
  if (!Array.isArray(corpus) || corpus.length === 0) {
    throw new Error('applicability corpus is empty');
  }

  const counts = { active: 0, excluded: 0, degraded: 0, total: 0 };
  // Per-fixture coverage rollup buckets.
  const coverage = { clean: 0, hasActive: 0, degraded: 0, excludedOnly: 0 };
  const failures = [];

  for (const fx of corpus) {
    for (const adv of fx.expected.advisories) {
      counts.total++;
      const state = adv.worker.state;
      if (state === 'MATCHED') {
        counts.active++;
        // A MATCHED advisory is active everywhere — sanity-cross-check the
        // canonical predicate agrees so a contract regression trips here.
        if (!contract.isActiveApplicableVulnerability({ state })) {
          failures.push(
            `${fx.id}:${adv.advisoryId} expected ACTIVE (MATCHED) but isActiveApplicableVulnerability() said false`,
          );
        }
      } else if (state === 'DEGRADED' || state === 'UNKNOWN') {
        counts.degraded++;
        if (contract.isActiveApplicableVulnerability({ state })) {
          failures.push(`${fx.id}:${adv.advisoryId} ${state} must NOT be active`);
        }
      } else {
        // NOT_AFFECTED | SUPPRESSED → excluded audit evidence.
        counts.excluded++;
        if (contract.isActiveApplicableVulnerability({ state })) {
          failures.push(`${fx.id}:${adv.advisoryId} ${state} must NOT be active`);
        }
      }
    }
    // Per-fixture coverage rollup.
    const cov = fx.expected.coverage;
    if (cov.uiRendersClean) coverage.clean++;
    else if (cov.activeVulnerabilityCount > 0) coverage.hasActive++;
    else if (cov.coverageDegraded) coverage.degraded++;
    else coverage.excludedOnly++;
  }

  console.log(`   fixtures:        ${corpus.length}`);
  console.log(`   advisory rows:   ${counts.total}`);
  console.log(`   ACTIVE (matched):    ${counts.active}`);
  console.log(`   EXCLUDED (not-affected/suppressed): ${counts.excluded}`);
  console.log(`   DEGRADED (unknown/degraded):        ${counts.degraded}`);
  console.log(
    `   coverage rollup: clean=${coverage.clean} active=${coverage.hasActive} ` +
      `degraded=${coverage.degraded} excluded-only=${coverage.excludedOnly}`,
  );

  // ── Assert the two live FPs are NOT_AFFECTED and the control is MATCHED ──
  const checkExpectation = (e) => {
    let fx;
    try {
      fx = fixtures.getApplicabilityFixture(e.fixtureId);
    } catch (err) {
      failures.push(`${e.label}: fixture '${e.fixtureId}' not found (${err.message})`);
      return;
    }
    const adv = fx.expected.advisories.find((a) => a.advisoryId === e.advisoryId);
    if (!adv) {
      failures.push(`${e.label}: advisory ${e.advisoryId} absent from fixture ${e.fixtureId}`);
      return;
    }
    if (adv.worker.state !== e.expectState) {
      failures.push(
        `${e.label}: ${e.coordinate} / ${e.advisoryId} expected ${e.expectState}, got ${adv.worker.state}`,
      );
      return;
    }
    const active = contract.isActiveApplicableVulnerability({ state: adv.worker.state });
    const wantActive = e.expectState === 'MATCHED';
    if (active !== wantActive) {
      failures.push(
        `${e.label}: ${e.coordinate} active=${active} but expected active=${wantActive}`,
      );
      return;
    }
    console.log(
      `   ✔  ${e.label}: ${e.coordinate} / ${e.advisoryId} → ${adv.worker.state} ` +
        `(active=${active})`,
    );
  };
  LIVE_FP_EXPECTATIONS.forEach(checkExpectation);
  checkExpectation(TRUE_POSITIVE_CONTROL);

  if (failures.length > 0) {
    console.error('\n✖  Vulnerability-applicability corpus gate FAILED:');
    for (const f of failures) console.error(`   - ${f}`);
    return { ok: false, counts, coverage, failures };
  }
  console.log('✔  Vulnerability-applicability fixture corpus (both live FPs NOT_AFFECTED, control MATCHED)');
  return { ok: true, counts, coverage, failures };
}

// Standalone invocation: run ONLY the corpus gate (no AWS/ECS config needed).
if (args.includes('--corpus-only')) {
  try {
    const result = runApplicabilityCorpusGate();
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(`✖  corpus gate error: ${err.message}`);
    process.exit(1);
  }
}

const configIdx = args.indexOf('--config');
if (configIdx < 0) {
  console.error('usage: node production-readiness-gate.cjs --config <path>  [| --corpus-only]');
  process.exit(2);
}
const configPath = path.resolve(process.cwd(), args[configIdx + 1]);
if (!fs.existsSync(configPath)) {
  console.error(`FAIL: config file not found: ${configPath}`);
  process.exit(2);
}
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error(`FAIL: config JSON parse error: ${err.message}`);
  process.exit(2);
}

const REQUIRED_KEYS = [
  'repos', // [{name, path, runContractTests}]
  'imageVerifyTargets', // [{cluster, service, expectedSha}]
  'queues', // [{url, dlq?: boolean}]
  'ecsServices', // [{cluster, service}]
  // P1-7 (Codex HIGH follow-up): backend block is mandatory. Required:
  // backend.migrationStatusCommand (non-empty string).
  'backend',
];
for (const k of REQUIRED_KEYS) {
  if (!cfg[k]) {
    console.error(`FAIL: config missing required key: ${k}`);
    process.exit(2);
  }
}
if (!cfg.backend || typeof cfg.backend !== 'object') {
  console.error('FAIL: cfg.backend must be an object');
  process.exit(2);
}
if (
  !cfg.backend.migrationStatusCommand ||
  typeof cfg.backend.migrationStatusCommand !== 'string' ||
  cfg.backend.migrationStatusCommand.trim().length === 0
) {
  console.error(
    'FAIL: cfg.backend.migrationStatusCommand must be a non-empty string ' +
      '(operator-supplied non-mutating migration status command).',
  );
  process.exit(2);
}

function run(label, cmd, opts = {}) {
  console.log(`\n▶  ${label}`);
  console.log(`   $ ${cmd}`);
  const res = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (res.status !== 0) {
    console.error(`✖  ${label} FAILED (exit ${res.status})`);
    process.exit(res.status ?? 1);
  }
  console.log(`✔  ${label}`);
}

// 0. Vulnerability-applicability corpus gate (Task 7). Runs FIRST — before any
//    AWS/ECS calls — so a re-introduced package-level false positive fails fast
//    and cheaply. Skippable only via an explicit opt-out for environments where
//    shared-contracts dist is intentionally absent.
if (cfg.skipApplicabilityCorpus !== true) {
  let corpusResult;
  try {
    corpusResult = runApplicabilityCorpusGate();
  } catch (err) {
    console.error(`✖  Vulnerability-applicability corpus gate FAILED (${err.message})`);
    process.exit(1);
  }
  if (!corpusResult.ok) process.exit(1);
}

// 1. Local contract/unit tests
for (const repo of cfg.repos) {
  if (repo.runContractTests === false) continue;
  run(`Worker-result contract gate: ${repo.name}`, 'npm run test:worker-contract', {
    cwd: repo.path,
  });
}

// 2. Lockfile sanity
for (const repo of cfg.repos) {
  if (!repo.expectedLockfile) continue;
  const repoPath = repo.path;
  const expected = repo.expectedLockfile;
  const others = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].filter(
    (f) => f !== expected,
  );
  if (!fs.existsSync(path.join(repoPath, expected))) {
    console.error(`✖  ${repo.name}: expected lockfile '${expected}' is missing`);
    process.exit(1);
  }
  for (const other of others) {
    if (fs.existsSync(path.join(repoPath, other))) {
      console.error(`✖  ${repo.name}: foreign lockfile '${other}' must be deleted`);
      process.exit(1);
    }
  }
  console.log(`✔  Lockfile sanity: ${repo.name} (${expected} only)`);
}

// 3. Migration lint + status. backend.migrationStatusCommand is now a
// top-level required key (validated at startup); lint command path is
// optional but defaults to the standard location.
{
  const lintCmd = cfg.backend.lintMigrationsCommand || 'node Backend/scripts/lint-migrations.js';
  run('Migration lint', lintCmd, {});
  run('Migration status (dry-run)', cfg.backend.migrationStatusCommand, {});
}

// 4. Security audit
for (const repo of cfg.repos) {
  if (repo.runAudit === false) continue;
  const cmd = repo.packageManager === 'pnpm' ? 'pnpm audit --audit-level=high' : 'npm audit --audit-level=high';
  run(`Security audit: ${repo.name}`, cmd, { cwd: repo.path });
}

// 5. GitHub Actions status — pinned to the exact release SHA so an
// older green main run cannot mask a failed/missing check for the
// artifact under review. (Codex HIGH follow-up.)
if (cfg.githubWorkflows && Array.isArray(cfg.githubWorkflows)) {
  const releaseSha = cfg.releaseSha;
  if (!releaseSha) {
    console.error('FAIL: cfg.releaseSha is required when githubWorkflows is set');
    process.exit(2);
  }
  for (const wf of cfg.githubWorkflows) {
    run(
      `GH workflow ${wf} succeeded for SHA ${releaseSha}`,
      // Query runs filtered by headSha; fail if zero rows or conclusion != success
      `gh run list --workflow ${wf} --commit ${releaseSha} --json conclusion --jq 'if length == 0 then error("no run for SHA") elif .[0].conclusion != "success" then error("conclusion=" + .[0].conclusion) else empty end'`,
    );
  }
}

// 6. ECS rollout state — structured JSON: require exactly one PRIMARY
// deployment, with rolloutState=COMPLETED, AND no other deployment in
// FAILED / IN_PROGRESS. Also asserts the task-definition matches the
// expected ARN when supplied. (Codex HIGH follow-up.)
for (const svc of cfg.ecsServices) {
  const expectArn = svc.expectedTaskDefinitionArn || '';
  // Inline node check: parses the describe-services JSON and asserts
  // the invariants. The Node.js heredoc avoids quote-escaping issues.
  const cmd =
    `aws ecs describe-services --cluster ${svc.cluster} --services ${svc.service} ` +
    `--query 'services[0].deployments' --output json | ` +
    `node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'))||[]; ` +
    `const primary=d.filter(x=>x.status==='PRIMARY'); ` +
    `if(primary.length!==1){console.error('PRIMARY count='+primary.length);process.exit(1)} ` +
    `if(primary[0].rolloutState!=='COMPLETED'){console.error('PRIMARY rolloutState='+primary[0].rolloutState);process.exit(1)} ` +
    `for(const x of d){if(x.rolloutState==='FAILED'||x.rolloutState==='IN_PROGRESS'){console.error('deployment in '+x.rolloutState);process.exit(1)}} ` +
    (expectArn ? `if(primary[0].taskDefinition!==${JSON.stringify(expectArn)}){console.error('taskDef mismatch: '+primary[0].taskDefinition);process.exit(1)} ` : '') +
    `"`;
  run(`ECS rollout state: ${svc.service}`, cmd);
}

// 7. Image SHA verification
const targetsJson = JSON.stringify(cfg.imageVerifyTargets);
run('Image SHA verification', `node scripts/verify-ecs-image-shas.cjs ${JSON.stringify(targetsJson)}`);

// 8. Queues empty — delegate to the hardened verify-queues-empty.cjs
// helper so we get delayed-message coverage + quiet-period sampling
// (Codex HIGH follow-up). The cfg.queues array is normalised to a list
// of URLs and passed as argv; the helper exits non-zero on any failure.
if (!Array.isArray(cfg.queues) || cfg.queues.length === 0) {
  console.error('FAIL: cfg.queues must be a non-empty array of {url} entries');
  process.exit(2);
}
const queueUrls = cfg.queues.map((q) => q.url).filter(Boolean);
if (queueUrls.length === 0) {
  console.error('FAIL: cfg.queues has no entries with a `url` field');
  process.exit(2);
}
run(
  `Queue/DLQ empty (quiet-period verifier)`,
  `node ${path.join(__dirname, 'verify-queues-empty.cjs')} ${queueUrls.map((u) => `"${u}"`).join(' ')}`,
);

// 9. Cleanup verify (caller-driven; the scanner-fresh-reset script
//    accepts --verify with correlation prefix in the config)
if (cfg.cleanupVerifyArgs) {
  run('Cleanup verify', `node scripts/scanner-fresh-reset.cjs --verify ${cfg.cleanupVerifyArgs}`);
}

// 10. Smoke package check (placeholder; the smoke harness is
//    operator-owned and wired via cfg.smokeCheckCommand if present)
if (cfg.smokeCheckCommand) {
  run('Smoke package check', cfg.smokeCheckCommand);
}

console.log('\n✅  production-readiness-gate: ALL CHECKS PASSED');
