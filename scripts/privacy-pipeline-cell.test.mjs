// Unit regressions only: controlled fetch/invokers below are NOT quality evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  sha256, validateConfig, localUrl, readPinnedJson, verifyBuild,
  validateFixture, measureInvocation, scoreFindings, validateCellReport,
  evaluateCampaign, guardedProviderFetch,
} from './privacy-pipeline-cell-lib.mjs';

const pin = { path: '/reviewed/manifest.json', sha256: 'a'.repeat(64) };
const config = () => ({
  schemaVersion: 1, variant: 'candidate', retention: 'minimal', build: pin, fixture: pin, providerReview: pin,
  buildRoot: path.resolve('/pinned-build'), objectStoreEndpoint: 'http://127.0.0.1:19000', artifactBucket: 'privacy-quality-unit',
  maxArtifactBytes: 1024, requiredScanners: ['semgrep'], timeoutMs: 1000, environment: {},
  job: { scanRunId: '12345678-1234-1234-1234-123456789012', orgId: '12345678-1234-1234-1234-123456789013',
    siteId: '12345678-1234-1234-1234-123456789014', installationId: 0, scanRoute: 'CUSTOMER_LOCAL',
    scanOrigin: 'local-cli', triggerType: 'manual', prNumber: null, metadata: {}, repositoryFullName: 'privacy-quality/unit',
    headSha: 'a'.repeat(40), evidenceMode: 'MINIMAL', llmMode: 'OFF', localArtifact: {
      key: 'github-local-scans/12345678-1234-1234-1234-123456789013/unit.tar.gz', digest: 'b'.repeat(64), archiveFormat: 'tar.gz' } },
});
const fixture = () => ({ schemaVersion: 1, syntheticOnly: true, headSha: 'a'.repeat(40), artifactSha256: 'b'.repeat(64),
  expectedRepository: 'malicious', expectedFindings: [{ id: 'injection', tool: 'semgrep', rule: 'r', path: 'a.ts', line: 3, expected: 'present' }] });
const review = () => ({ schemaVersion: 1, mode: 'live', approvalReference: 'unit-only-not-live-authority', expiresAt: '2099-01-01T00:00:00Z',
  transport: { kind: 'node-global-fetch', reviewedBuildSha256: 'a'.repeat(64), reviewReference: 'unit-only', externalContainmentReference: 'unit-only' }, accountHardLimitUsd: 1,
  limits: { maxCalls: 4, maxTokens: 40000, maxUsd: 1 }, routes: [{ protocol: 'anthropic', prefix: 'https://api.anthropic.com/v1/',
    model: 'unit-model', account: 'unit-account', region: 'unit-region', credentialEnv: 'ANTHROPIC_API_KEY', maxInputTokens: 8192,
    maxOutputTokens: 16, inputUsdPerMillion: 1, outputUsdPerMillion: 2, countRequestMaxUsd: 0.01,
    countTokensApproved: true, cachedInputRateCovered: true, outputLimitCoversAllBillableTokens: true }] });
const request = (extra = {}) => ({ method: 'POST', body: JSON.stringify({ model: 'unit-model', max_tokens: 8,
  messages: [{ role: 'user', content: 'synthetic test text' }], ...extra }) });
const completed = () => ({ schemaVersion: 1, status: 'completed', variant: 'candidate', retention: 'minimal', qualityGate: 'incomplete',
  patchProof: { status: 'unmeasured' }, latency: { queue: null, hook: null, reveal: null },
  measurement: { clock: 'performance.now', elapsedMs: 10, failed: false }, terminal: { status: 'COMPLETED', security_outcome: 'PASS' },
  coverage: [{ id: 'semgrep', complete: true }], pendingDeferredTasks: 0,
  provider: { mode: 'disabled', denied: 0, failures: 0, observations: [] }, detection: { detectionPassed: true, falseBlock: false } });

test('missing immutable build/provider inputs are rejected before any invocation', () => {
  assert.doesNotThrow(() => validateConfig(config()));
  for (const key of ['build', 'fixture', 'providerReview']) {
    const input = config(); delete input[key]; assert.throws(() => validateConfig(input));
  }
});
test('only local isolated DB/store and non-credential environment are accepted', () => {
  assert.equal(localUrl('postgres://unit:unit@127.0.0.1:15432/privacy_quality_unit', 'database').hostname, '127.0.0.1');
  for (const url of ['postgres://x:x@example.com:5432/privacy_quality_unit', 'postgres://x:x@127.0.0.1:15432/privacy_root', 'postgres://x:x@127.0.0.1:15432/privacy_quality_unit?sslmode=require']) assert.throws(() => localUrl(url, 'database'));
  const input = config(); input.environment.LLM_API_KEY = 'synthetic-but-disallowed'; assert.throws(() => validateConfig(input));
});
test('input metadata cannot masquerade as scanner runtime proof', () => {
  const input = config(); input.job.metadata.scanDurationMs = 42; assert.throws(() => validateConfig(input));
});
test('fixture identity and explicit synthetic declaration are mandatory', () => {
  validateFixture(fixture(), config());
  for (const mutation of [{ syntheticOnly: false }, { headSha: 'c'.repeat(40) }, { artifactSha256: 'd'.repeat(64) }]) assert.throws(() => validateFixture({ ...fixture(), ...mutation }, config()));
});
test('manifest bytes and complete runtime-tree digests cannot be replaced', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'privacy-cell-unit-'));
  try {
    const manifestFile = path.join(root, 'review.json');
    await writeFile(manifestFile, '{"approved":true}');
    assert.deepEqual(await readPinnedJson(manifestFile, sha256('{"approved":true}')), { approved: true });
    await writeFile(manifestFile, '{"approved":false}');
    await assert.rejects(readPinnedJson(manifestFile, sha256('{"approved":true}')), /Digest mismatch/);
    const trees = ['scanner-worker/dist', 'scanner-worker/node_modules', 'github-action/dist', 'github-action/scripts', 'github-action/configs', 'github-action/node_modules', 'shared-schemas/dist'];
    for (const tree of trees) await mkdir(path.join(root, tree), { recursive: true });
    const files = ['scanner-worker/dist/worker.js', 'github-action/scripts/run-scanners.sh', 'scanner-worker/package-lock.json', 'scanner-worker/package.json', 'github-action/package.json', 'github-action/package-lock.json', 'shared-schemas/package.json'];
    for (const file of files) await writeFile(path.join(root, file), 'unit');
    const manifest = { schemaVersion: 1, commit: 'a'.repeat(40), completeTrees: trees, files: files.map((file) => ({ path: file, sha256: sha256('unit') })),
      workerEntrypoint: files[0], actionEntrypoint: files[1], lockfile: files[2], engines: [{ id: 'semgrep' }] };
    await verifyBuild(root, manifest);
    await writeFile(path.join(root, 'github-action/configs/unpinned.json'), '{}');
    await assert.rejects(verifyBuild(root, manifest), /Unpinned file/);
    await writeFile(path.join(root, files[0]), 'changed');
    await assert.rejects(verifyBuild(root, manifest), /Build content changed/);
  } finally { await rm(root, { recursive: true }); }
});
test('latency comes from the monotonic invocation interval, not returned metadata', async () => {
  const measurement = await measureInvocation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { elapsedMs: 999999, scanDurationMs: 999999 };
  });
  assert(measurement.elapsedMs >= 10 && measurement.elapsedMs < 999999);
  assert.equal(measurement.clock, 'performance.now');
  assert.equal(measurement.failed, false);
  assert.equal((await measureInvocation(() => { throw new Error('unit'); })).failed, true);
});
test('detection needs an actual unsuppressed matching finding and observes false blocks', () => {
  assert.equal(scoreFindings(fixture(), [], 'PASS').detectionPassed, false);
  const finding = { tool_name: 'semgrep', rule_id: 'r', file_path: 'a.ts', start_line: 1, end_line: 4, status: 'OPEN' };
  assert.equal(scoreFindings(fixture(), [finding], 'FAIL').detectionPassed, true);
  assert.equal(scoreFindings(fixture(), [{ ...finding, suppression_id: 'x' }], 'FAIL').detectionPassed, false);
  assert.equal(scoreFindings({ ...fixture(), expectedRepository: 'benign' }, [], 'FAIL').falseBlock, true);
});
test('completed cells reject missing coverage, pending AI, failed provider, false blocks and invented patch proof', () => {
  validateCellReport(completed());
  for (const mutation of [{ qualityGate: 'passed' }, { patchProof: { status: 'passed' } }, { coverage: [] },
    { pendingDeferredTasks: 1 }, { provider: { denied: 0, failures: 1 } }, { latency: { queue: 1, hook: null, reveal: null } },
    { detection: { detectionPassed: false, falseBlock: false } }, { detection: { detectionPassed: true, falseBlock: true } }]) assert.throws(() => validateCellReport({ ...completed(), ...mutation }));
  const live = completed(); live.provider.mode = 'live'; assert.throws(() => validateCellReport(live), /observed provider/);
});
test('even all four completed controlled cells cannot manufacture campaign success', () => {
  const reports = ['baseline', 'candidate'].flatMap((variant) => ['minimal', 'extended'].map((retention) => ({ ...completed(), variant, retention })));
  const campaign = evaluateCampaign(reports);
  assert.equal(campaign.passed, false); assert.equal(campaign.status, 'incomplete'); assert.deepEqual(campaign.missingCells, []);
  assert(campaign.missingProof.some((item) => item.includes('patch')));
  assert.equal(evaluateCampaign([]).missingCells.length, 4);
});
test('count and generation attempts reserve hard caps before controlled I/O', async () => {
  let calls = 0;
  const limited = review(); limited.limits.maxCalls = 1;
  const guard = guardedProviderFetch(limited, async () => { calls++; }, async () => {});
  await assert.rejects(guard.fetch('https://api.anthropic.com/v1/messages', request()), /BUDGET_LIMIT/);
  assert.equal(calls, 0); assert.equal(guard.stats.denied, 1);
});
test('real-fetch wrapper counts observed usage and rechecks policy for each step (unit fake transport)', async () => {
  const endpoints = []; const authorization = [];
  const guard = guardedProviderFetch(review(), async (url) => {
    endpoints.push(url);
    return new Response(JSON.stringify(url.endsWith('count_tokens') ? { input_tokens: 4 } : { usage: { input_tokens: 4, output_tokens: 2 } }));
  }, async (url, model, feature) => { authorization.push(feature); });
  await guard.fetch('https://api.anthropic.com/v1/messages', request());
  assert.equal(endpoints.length, 2); assert.deepEqual(authorization, ['count_tokens', 'generate']);
  assert.equal(guard.stats.calls, 2); assert.equal(guard.stats.reservedTokens, 8192 * 2 + 8);
  assert.equal(guard.stats.observations[1].outputTokens, 2);
  assert(guard.stats.measuredProviderMs >= 0);
});
test('missing policy authorization, unsupported payloads and routes cause zero requests', async () => {
  let calls = 0; const noIo = async () => { calls++; throw new Error('unexpected'); };
  const missingPolicy = guardedProviderFetch(review(), noIo);
  await assert.rejects(missingPolicy.fetch('https://api.anthropic.com/v1/messages', request()), /COUNT_POLICY/);
  for (const [url, init] of [
    ['https://unapproved.example/v1/messages', request()],
    ['https://api.anthropic.com/v1/messages', request({ messages: [{ role: 'user', content: [{ type: 'image', source: 'unbounded' }] }] })],
    ['https://api.anthropic.com/v1/messages', request({ thinking: { type: 'enabled' } })],
  ]) await assert.rejects(guardedProviderFetch(review(), noIo, async () => {}).fetch(url, init));
  assert.equal(calls, 0);
});
test('missing/over-limit usage and HTTP failure cannot become completed live cells', async () => {
  for (const response of [{}, { usage: { input_tokens: 4, output_tokens: 99 } }]) {
    const guard = guardedProviderFetch(review(), async (url) => new Response(JSON.stringify(url.endsWith('count_tokens') ? { input_tokens: 4 } : response)), async () => {});
    await assert.rejects(guard.fetch('https://api.anthropic.com/v1/messages', request()), /USAGE_UNVERIFIED/);
    assert.equal(guard.stats.denied, 1);
  }
  const guard = guardedProviderFetch(review(), async () => new Response('{}', { status: 500 }), async () => {});
  await assert.rejects(guard.fetch('https://api.anthropic.com/v1/messages', request()));
  assert.equal(guard.stats.failures, 1); assert.equal(guard.stats.calls, 2, 'Unknown attempts never refund reservations');
});
test('approval is rechecked between counting and generation (controlled clock only)', async () => {
  const realNow = Date.now; let now = realNow(); let calls = 0;
  const approved = review(); approved.expiresAt = new Date(now + 1000).toISOString();
  Date.now = () => now;
  try {
    const guard = guardedProviderFetch(approved, async () => { calls++; now += 2000; return new Response('{"input_tokens":4}'); }, async () => {});
    await assert.rejects(guard.fetch('https://api.anthropic.com/v1/messages', request()), /REVIEW_EXPIRED/);
    assert.equal(calls, 1); assert.equal(guard.stats.denied, 1);
  } finally { Date.now = realNow; }
});
