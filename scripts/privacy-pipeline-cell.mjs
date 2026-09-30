#!/usr/bin/env node
// Real, deliberately single-cell integration runner. No provider mock is
// installed. Even a completed cell exits 2: this is not a campaign quality pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { fork, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {
  sha256, localUrl, validateConfig, readPinnedJson, verifyBuild,
  validateFixture, validateProviderReview, guardedProviderFetch,
  measureInvocation, scoreFindings, validateCellReport,
} from './privacy-pipeline-cell-lib.mjs';

const here = fileURLToPath(import.meta.url);
const emptyReport = (config) => ({
  schemaVersion: 1, status: 'skipped', variant: config.variant, retention: config.retention,
  qualityGate: 'incomplete', reason: 'not_invoked', measurement: null,
  patchProof: { status: 'unmeasured' }, latency: { queue: null, hook: null, reveal: null },
  terminal: null, coverage: [], pendingDeferredTasks: null, findings: [], detection: null,
  provider: { mode: 'disabled', calls: 0, reservedTokens: 0, reservedUsd: 0, denied: 0, failures: 0, measuredProviderMs: 0, observations: [] },
});

async function inputs(configFile) {
  const bytes = await readFile(configFile);
  const config = validateConfig(JSON.parse(bytes));
  const build = await readPinnedJson(config.build.path, config.build.sha256);
  const fixture = await readPinnedJson(config.fixture.path, config.fixture.sha256);
  const review = validateProviderReview(await readPinnedJson(config.providerReview.path, config.providerReview.sha256));
  validateFixture(fixture, config);
  await verifyBuild(config.buildRoot, build);
  assert.equal(review.mode === 'live', config.job.llmMode === 'CODEFENCE');
  if (review.mode === 'live') assert.equal(review.transport.reviewedBuildSha256, config.build.sha256, 'Transport review belongs to another build');
  assert(!config.job.localArtifact.encryption, 'This local invoker does not emulate a KMS account');
  return { config, build, fixture, review, configSha256: sha256(bytes) };
}

async function requireReadonlyBuild(root) {
  const target = await realpath(root);
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8')).trim().split('\n').map((line) => {
    const fields = line.split(' ');
    return { mount: fields[4].replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))), options: fields[5].split(',') };
  });
  const mount = mounts.filter((entry) => target === entry.mount || target.startsWith(entry.mount.replace(/\/$/, '') + '/')).sort((a, b) => b.mount.length - a.mount.length)[0];
  assert(mount?.options.includes('ro'), 'Build and dependency trees must be mounted read-only');
  assert(mounts.filter((entry) => entry.mount.startsWith(target + '/')).every((entry) => entry.options.includes('ro')), 'Nested writable runtime mount is prohibited');
}

async function engineInventory(build, requiredScanners) {
  const inventory = [];
  for (const engine of build.engines) {
    assert.match(engine.id ?? '', /^[a-z0-9][a-z0-9._-]{0,63}$/);
    assert.match(engine.command ?? '', /^[a-z0-9][a-z0-9._-]{0,63}$/);
    assert(path.isAbsolute(engine.binary));
    const command = spawnSync('sh', ['-c', 'command -v "$1"', 'privacy-engine-probe', engine.command], { timeout: 10_000, maxBuffer: 4096, encoding: 'utf8', shell: false });
    assert.equal(command.status, 0, `Engine is absent from PATH: ${engine.id}`);
    assert.equal(await realpath(command.stdout.trim()), await realpath(engine.binary), `Pinned engine differs from PATH: ${engine.id}`);
    assert.deepEqual(engine.versionArgs, [engine.versionArgs?.[0]]);
    assert(['--version', 'version'].includes(engine.versionArgs[0]), 'Only read-only version probes are supported');
    assert.equal(sha256(await readFile(engine.binary)), engine.binarySha256, 'Engine binary changed');
    const probe = spawnSync(engine.binary, engine.versionArgs, { timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8', shell: false });
    assert.equal(probe.status, 0, `Engine version probe failed: ${engine.id}`);
    const versionSha256 = sha256(probe.stdout + probe.stderr);
    assert.equal(versionSha256, engine.versionOutputSha256, `Engine version changed: ${engine.id}`);
    inventory.push({ id: engine.id, command: engine.command, binarySha256: engine.binarySha256, versionOutputSha256: versionSha256 });
  }
  for (const scanner of requiredScanners) assert(inventory.some((engine) => engine.id === scanner), `Missing engine inventory: ${scanner}`);
  return inventory;
}

function childEnvironment(config, review, tempDirectory) {
  const databaseUrl = process.env.PRIVACY_QUALITY_DATABASE_URL;
  localUrl(databaseUrl, 'database');
  assert.match(process.env.PRIVACY_QUALITY_EVIDENCE_KEY ?? '', /^.{32,}$/);
  const env = {
    PATH: process.env.PATH, HOME: tempDirectory, TMPDIR: tempDirectory, LANG: 'C.UTF-8',
    NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=512',
    AWS_REGION: 'us-east-1', AWS_DEFAULT_REGION: 'us-east-1', AWS_EC2_METADATA_DISABLED: 'true',
    AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_ENDPOINT_URL: config.objectStoreEndpoint, AWS_ENDPOINT_URL_S3: config.objectStoreEndpoint,
    AWS_ENDPOINT_URL_SQS: config.objectStoreEndpoint, AWS_ENDPOINT_URL_DYNAMODB: config.objectStoreEndpoint,
    DATABASE_URL: databaseUrl, AI_PROMPT_EVIDENCE_ENCRYPTION_KEY: process.env.PRIVACY_QUALITY_EVIDENCE_KEY,
    SOURCE_PRIVACY_PROTOCOL_VERSION: '1', GITHUB_LOCAL_SCAN_ARTIFACT_BUCKET: config.artifactBucket,
    GITHUB_LOCAL_SCAN_ARTIFACT_REQUIRE_KMS: 'false', GITHUB_LOCAL_SCAN_ARTIFACT_PREFIX: 'github-local-scans/',
    ...config.environment,
  };
  if (review.mode === 'live') {
    assert.equal(process.env.PRIVACY_QUALITY_LIVE_APPROVED, '1', 'Live invocation requires explicit operator approval');
    for (const route of review.routes) {
      const value = process.env[route.credentialEnv];
      assert(typeof value === 'string' && value.length > 0, 'Reviewed provider credential is absent');
      env[route.credentialEnv] = value;
    }
  }
  return env;
}

async function executeCell(data) {
  const { config, build, fixture, review, configSha256 } = data;
  const report = emptyReport(config);
  report.inputs = { configSha256, buildSha256: config.build.sha256, fixtureSha256: config.fixture.sha256,
    providerReviewSha256: config.providerReview.sha256, commit: build.commit, headSha: config.job.headSha,
    artifactSha256: config.job.localArtifact.digest };
  let pool, worker, s3;
  let stage = 'runtime_preflight';
  try {
    assert.equal(process.platform, 'linux', 'Actual invocation requires an isolated Linux container');
    await readFile('/.dockerenv');
    await requireReadonlyBuild(config.buildRoot);
    await verifyBuild(config.buildRoot, build);
    report.engines = await engineInventory(build, config.requiredScanners);
    const requireBuild = createRequire(path.join(config.buildRoot, build.workerEntrypoint));
    const { Pool } = requireBuild('pg');
    const { S3Client, GetObjectCommand } = requireBuild('@aws-sdk/client-s3');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });
    stage = 'local_seed_preflight';
    const identity = await pool.query('SELECT current_database() AS db');
    assert.equal(identity.rows[0]?.db, localUrl(process.env.DATABASE_URL, 'database').pathname.slice(1));
    // Fresh, uniquely owned DB contains one synthetic tenant and one scan. The
    // operator must clone the real schema; no reduced/invented schema is made.
    const tenants = await pool.query('SELECT id FROM orgs');
    assert.deepEqual(tenants.rows.map((row) => row.id), [config.job.orgId]);
    const rows = (await pool.query(`SELECT r.id, r.org_id, r.site_id, r.installation_id, r.repository_full_name, r.head_sha, r.status, r.evidence_mode, r.llm_mode,
      r.source_processing_authorization, s.source_evidence_retention
      FROM github_scan_runs r JOIN security_settings s ON s.org_id=r.org_id`)).rows;
    assert.equal(rows.length, 1, 'One fresh synthetic scan is required');
    const row = rows[0];
    for (const [column, field] of Object.entries({ id: 'scanRunId', org_id: 'orgId', site_id: 'siteId', repository_full_name: 'repositoryFullName', head_sha: 'headSha', evidence_mode: 'evidenceMode', llm_mode: 'llmMode' })) assert.equal(row[column], config.job[field]);
    assert.equal(Number(row.installation_id), 0);
    assert.equal(row.status, 'QUEUED');
    assert.equal(row.source_evidence_retention, config.retention);
    assert.deepEqual(row.source_processing_authorization, config.job.sourceProcessing ?? null);
    for (const table of ['github_findings', 'github_llm_enrichment_tasks']) {
      assert.equal(Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n), 0, 'Fixture already contains results/tasks');
    }
    stage = 'artifact_preflight';
    // Direct IP endpoints avoid virtual-host DNS differences in the worker's
    // unmodified S3 client. No production credentials are present in this child.
    assert(['127.0.0.1', '[::1]'].includes(new URL(config.objectStoreEndpoint).hostname), 'Use a local store reachable through the container loopback interface');
    s3 = new S3Client({ region: 'us-east-1', endpoint: config.objectStoreEndpoint, forcePathStyle: true });
    const object = await s3.send(new GetObjectCommand({ Bucket: config.artifactBucket, Key: config.job.localArtifact.key }));
    assert(Number.isSafeInteger(object.ContentLength) && object.ContentLength > 0 && object.ContentLength <= config.maxArtifactBytes);
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of object.Body) { bytes += chunk.length; assert(bytes <= config.maxArtifactBytes); hash.update(chunk); }
    assert.equal(bytes, object.ContentLength);
    assert.equal(hash.digest('hex'), fixture.artifactSha256);
    report.artifactBytes = bytes;
    stage = 'provider_preflight';
    // Install fetch control BEFORE loading production classes. The same real
    // policy module later used by the worker revalidates extra counting calls
    // inside its AsyncLocalStorage job scope. A baseline without this contract
    // is explicitly unsupported for live cells; it cannot silently bypass it.
    let authorize;
    if (review.mode === 'live') {
      const policy = requireBuild('./services/source-processing-policy.js');
      const providerPolicy = requireBuild('./services/source-provider-policy.js');
      assert.equal(typeof policy.assertSourceProviderRequest, 'function');
      authorize = policy.assertSourceProviderRequest;
      const profiles = providerPolicy.sourceProviderProfiles();
      for (const route of review.routes) assert(profiles.some((profile) => config.job.sourceProcessing?.providerProfileIds.includes(profile.id) && profile.account === route.account && profile.region === route.region && profile.models.includes(route.model) && profile.endpointPrefixes.includes(route.prefix) && profile.features.includes('generate') && profile.features.includes('count_tokens')), 'Reviewed provider account/region/model does not match current source policy');
    }
    const guard = guardedProviderFetch(review, globalThis.fetch, authorize);
    globalThis.fetch = guard.fetch;
    report.provider = guard.stats;
    stage = 'worker_invocation';
    const { ScannerWorker } = requireBuild(path.join(config.buildRoot, build.workerEntrypoint));
    assert.equal(typeof ScannerWorker, 'function');
    worker = new ScannerWorker({ awsRegion: 'us-east-1', processorQueueUrl: `${config.objectStoreEndpoint}/000000000000/privacy-quality-unused`,
      actionRoot: path.join(config.buildRoot, 'github-action'), scannerList: config.requiredScanners,
      unifiedProcessing: true, jobTimeoutMs: config.timeoutMs });
    report.measurement = await measureInvocation(() => worker.process(config.job));
    stage = 'result_observation';
    report.terminal = (await pool.query(`SELECT status, verdict, security_outcome, llm_status, source_processing_status, scanner_execution
      FROM github_scan_runs WHERE id=$1 AND org_id=$2`, [config.job.scanRunId, config.job.orgId])).rows[0];
    const execution = report.terminal?.scanner_execution;
    report.coverage = config.requiredScanners.map((id) => ({ id, complete:
      Array.isArray(execution?.requested) && execution.requested.includes(id) && Array.isArray(execution.succeeded) && execution.succeeded.includes(id) &&
      ['failed', 'partial', 'skipped'].every((key) => Array.isArray(execution[key]) && !execution[key].includes(id)) }));
    report.pendingDeferredTasks = Number((await pool.query("SELECT COUNT(*) AS n FROM github_llm_enrichment_tasks WHERE scan_run_id=$1 AND status <> 'SUCCESS'", [config.job.scanRunId])).rows[0].n);
    report.findings = (await pool.query(`SELECT tool_name, rule_id, file_path, start_line, end_line, severity, confidence, status, suppression_id, is_new,
      cli_verdict, primary_fingerprint FROM github_findings WHERE scan_run_id=$1 AND org_id=$2 ORDER BY tool_name, rule_id, file_path, start_line, id`,
    [config.job.scanRunId, config.job.orgId])).rows;
    report.detection = scoreFindings(fixture, report.findings, report.terminal?.verdict);
    report.status = 'completed';
    report.reason = 'single_cell_observed_campaign_incomplete';
    try { validateCellReport(report); }
    catch { report.status = 'failed'; report.reason = 'cell_evidence_incomplete_or_detection_failed'; }
  } catch {
    report.status = report.measurement ? 'failed' : 'skipped';
    report.reason = `${stage}_failed`;
  } finally {
    await worker?.shutdown().catch(() => { report.status = 'failed'; report.reason = 'worker_shutdown_failed'; });
    await pool?.end().catch(() => { report.status = 'failed'; report.reason = 'database_shutdown_failed'; });
    s3?.destroy();
  }
  return validateCellReport(report);
}

async function main() {
  if (process.argv[2] === '--worker-child') {
    process.once('message', async (data) => {
      try { process.send(await executeCell(data)); }
      catch { process.send({ driverFailure: true }); }
      finally { process.disconnect(); }
    });
    return;
  }
  const args = process.argv.slice(2);
  assert(args.length === 5 && args[0] === '--config' && args[2] === '--report' && ['--preflight', '--execute-reviewed'].includes(args[4]),
    'Usage: node scripts/privacy-pipeline-cell.mjs --config /absolute/cell.json --report /absolute/new-report.json --preflight|--execute-reviewed');
  assert(path.isAbsolute(args[1]) && path.isAbsolute(args[3]));
  const data = await inputs(args[1]);
  let report = emptyReport(data.config);
  report.inputs = { configSha256: data.configSha256, buildSha256: data.config.build.sha256,
    fixtureSha256: data.config.fixture.sha256, providerReviewSha256: data.config.providerReview.sha256 };
  if (args[4] === '--preflight') report.reason = 'files_validated_runtime_not_invoked';
  else {
    assert.equal(process.platform, 'linux');
    const temp = await mkdtemp(path.join(os.tmpdir(), 'privacy-pipeline-'));
    let child, timeout, childDone, observed;
    // Worker timeout does not cancel every asynchronous subprocess. This owns
    // a NEW process group and stops only that group, even after early completion.
    const stop = () => {
      if (!child?.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    try {
      child = fork(here, ['--worker-child'], { env: childEnvironment(data.config, data.review, temp), cwd: temp,
        execArgv: [], detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      childDone = new Promise((resolve) => child.once('exit', resolve));
      timeout = setTimeout(stop, data.config.timeoutMs + 60_000);
      await new Promise((resolve, reject) => {
        child.on('message', (value) => { observed = value; stop(); });
        child.once('error', reject);
        child.once('exit', resolve);
        child.send(data);
      });
    } finally {
      clearTimeout(timeout); stop();
      if (child?.pid) await childDone;
      // mkdtemp created this unique directory. No shared cache or user checkout
      // is removed. Resolve and constrain the path before recursive cleanup.
      const actual = await realpath(temp);
      assert.equal(path.dirname(actual), await realpath(os.tmpdir()));
      assert(path.basename(actual).startsWith('privacy-pipeline-'));
      await rm(actual, { recursive: true });
    }
    if (observed && !observed.driverFailure) report = validateCellReport(observed);
    else { report.status = 'failed'; report.reason = 'child_exited_or_timed_out_without_evidence'; }
  }
  await writeFile(args[3], JSON.stringify(validateCellReport(report), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, qualityGate: 'incomplete', reason: report.reason }));
  process.exitCode = 2;
}

main().catch(() => {
  // Do not print raw exception messages, connection strings, source or keys.
  console.error('Privacy pipeline cell failed input validation or execution. No quality pass was produced.');
  process.exitCode = 1;
});
