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
const configIdx = args.indexOf('--config');
if (configIdx < 0) {
  console.error('usage: node production-readiness-gate.cjs --config <path>');
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
