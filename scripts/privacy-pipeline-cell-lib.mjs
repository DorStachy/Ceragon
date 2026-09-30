import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => assert.match(value ?? '', /^[a-f0-9]{64}$/, 'A pinned SHA-256 is required');
const positive = (value, name) => assert(Number.isFinite(value) && value > 0, `${name} must be positive and finite`);
const integer = (value, name) => { positive(value, name); assert(Number.isSafeInteger(value), `${name} must be an integer`); };

export async function readPinnedJson(file, expected) {
  digest(expected);
  const bytes = await readFile(file);
  assert.equal(sha256(bytes), expected, `Digest mismatch: ${path.basename(file)}`);
  return JSON.parse(bytes.toString('utf8'));
}

export function localUrl(raw, kind) {
  const url = new URL(raw);
  assert(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal', 'devoid-privacy-postgres', 'localstack'].includes(url.hostname), 'Only explicitly local hosts are supported');
  assert(!url.search && !url.hash, 'Endpoint query/fragment is not allowed');
  if (kind === 'database') {
    assert(['postgres:', 'postgresql:'].includes(url.protocol));
    assert.match(url.pathname, /^\/privacy_quality_[a-z0-9_]+$/, 'Use a uniquely owned privacy_quality_* database');
    assert(['5432', '15432'].includes(url.port), 'Unexpected local PostgreSQL port');
  } else {
    assert.equal(url.protocol, 'http:');
    assert(!url.username && !url.password && url.pathname === '/');
    assert(['4566', '19000'].includes(url.port), 'Unexpected local object-store port');
  }
  return url;
}

export function validateConfig(config) {
  assert.equal(config.schemaVersion, 1);
  assert(['baseline', 'candidate'].includes(config.variant));
  assert(['minimal', 'extended'].includes(config.retention));
  for (const name of ['build', 'fixture', 'providerReview']) {
    assert.equal(typeof config[name]?.path, 'string', `${name} manifest is required`);
    assert(path.isAbsolute(config[name].path), `${name} path must be absolute`);
    digest(config[name].sha256);
  }
  assert(path.isAbsolute(config.buildRoot), 'buildRoot must be absolute');
  localUrl(config.objectStoreEndpoint, 'object');
  assert.match(config.artifactBucket ?? '', /^privacy-quality-[a-z0-9-]+$/);
  const job = config.job;
  assert(job && job.installationId === 0 && job.scanRoute === 'CUSTOMER_LOCAL', 'Only local synthetic jobs with installationId=0 are supported');
  for (const field of ['scanRunId', 'orgId', 'siteId']) assert.match(job[field] ?? '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, `Missing ${field}`);
  assert.match(job.repositoryFullName ?? '', /^privacy-quality\/[a-z0-9-]+$/);
  assert.match(job.headSha ?? '', /^[a-f0-9]{40}$/);
  assert(['OFF', 'CODEFENCE'].includes(job.llmMode));
  assert(['MINIMAL', 'STANDARD', 'RICH'].includes(job.evidenceMode));
  assert.equal(job.localArtifact?.archiveFormat, 'tar.gz');
  assert.equal(job.scanOrigin, 'local-cli');
  assert.equal(job.triggerType, 'manual');
  assert.equal(job.prNumber, null);
  assert(job.metadata && typeof job.metadata === 'object');
  for (const key of ['scannerExecution', 'scannerStatuses', 'scanDurationMs', 'scannersRun']) assert(!(key in job.metadata), `Caller-supplied runtime evidence prohibited: ${key}`);
  assert(job.localArtifact.key.startsWith(`github-local-scans/${job.orgId}/`));
  digest(job.localArtifact.digest);
  assert(Array.isArray(config.requiredScanners) && config.requiredScanners.length > 0);
  assert(new Set(config.requiredScanners).size === config.requiredScanners.length);
  for (const scanner of config.requiredScanners) assert.match(scanner, /^[a-z0-9][a-z0-9._-]{0,63}$/);
  integer(config.maxArtifactBytes, 'maxArtifactBytes');
  assert(config.maxArtifactBytes <= 100 * 1024 * 1024, 'Synthetic archive exceeds driver limit');
  integer(config.timeoutMs, 'timeoutMs');
  assert(config.timeoutMs <= 3_600_000);
  assert(config.environment && typeof config.environment === 'object');
  // Execution environment is pinned, but connection/credentials/loader overrides
  // must come only from the driver's explicit local settings.
  for (const [key, value] of Object.entries(config.environment)) {
    assert(/^(CODEFENCE_|LLM_|ENABLE_|EGRESS_MODE$|INPUT_EGRESS_MODE$|SOURCE_PROCESSING_PROVIDER_PROFILES$)/.test(key), `Unsupported environment key ${key}`);
    assert(!/(KEY|SECRET|TOKEN|URL|ENDPOINT|HOST|PROXY|COMMAND|EXEC|DATABASE|NODE_OPTIONS|PATH|ROOT|DIR)/.test(key.replace('TOKEN_BUDGET', 'BUDGET')), `Credential/transport/loader override prohibited: ${key}`);
    assert.equal(typeof value, 'string');
  }
  return config;
}

export async function verifyBuild(root, manifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.commit ?? '', /^[a-f0-9]{40}$/);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert(Array.isArray(manifest.completeTrees) && manifest.completeTrees.length > 0, 'Complete compiled/config trees are required');
  const actualRoot = await realpath(root);
  const pins = new Map();
  async function safe(relative) {
    assert.equal(typeof relative, 'string');
    assert(relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes('..'));
    const file = path.resolve(actualRoot, relative);
    const resolved = await realpath(file);
    assert(resolved.startsWith(actualRoot + path.sep), 'Build path escapes its pinned root');
    return resolved;
  }
  for (const entry of manifest.files) {
    digest(entry.sha256);
    const normalized = entry.path.replaceAll('\\', '/');
    assert(!pins.has(normalized), 'Duplicate build manifest path');
    const file = await safe(entry.path);
    assert(!(await lstat(path.join(actualRoot, entry.path))).isSymbolicLink(), 'File entry must not be a symlink');
    assert.equal(sha256(await readFile(file)), entry.sha256, `Build content changed: ${entry.path}`);
    pins.set(normalized, entry.sha256);
  }
  const links = new Map();
  for (const entry of manifest.links ?? []) {
    await safe(entry.path);
    assert(!pins.has(entry.path) && !links.has(entry.path));
    assert.equal(await readlink(path.join(actualRoot, entry.path)), entry.target);
    links.set(entry.path, entry.target);
  }
  async function walk(relative) {
    const directory = await safe(relative);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = `${relative.replaceAll('\\', '/')}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        assert(links.has(child), `Unpinned symlink: ${child}`);
        const target = path.relative(actualRoot, await safe(child)).replaceAll('\\', '/');
        assert(manifest.completeTrees.some((tree) => target === tree || target.startsWith(`${tree}/`)), 'Symlink target must be in a complete pinned tree');
      } else if (entry.isDirectory()) await walk(child);
      else assert(pins.has(child), `Unpinned file in compiled/config tree: ${child}`);
    }
  }
  for (const tree of manifest.completeTrees) await walk(tree);
  for (const name of ['workerEntrypoint', 'actionEntrypoint', 'lockfile']) assert(pins.has(manifest[name]), `Unpinned ${name}`);
  assert(manifest.completeTrees.some((tree) => manifest.workerEntrypoint.startsWith(`${tree}/`)));
  assert(manifest.completeTrees.some((tree) => manifest.actionEntrypoint.startsWith(`${tree}/`)));
  assert(Array.isArray(manifest.engines) && manifest.engines.length > 0);
  // Fixed layout matches production imports and shell runner; dependencies are
  // included, not merely an installer lock that says nothing about disk state.
  assert.equal(manifest.workerEntrypoint, 'scanner-worker/dist/worker.js');
  assert.equal(manifest.actionEntrypoint, 'github-action/scripts/run-scanners.sh');
  assert.equal(manifest.lockfile, 'scanner-worker/package-lock.json');
  for (const tree of ['scanner-worker/dist', 'scanner-worker/node_modules', 'github-action/dist', 'github-action/scripts', 'github-action/configs', 'github-action/node_modules', 'shared-schemas/dist']) assert(manifest.completeTrees.includes(tree), `Missing complete runtime tree: ${tree}`);
  for (const file of ['scanner-worker/package.json', 'github-action/package.json', 'github-action/package-lock.json', 'shared-schemas/package.json']) assert(pins.has(file), `Missing runtime metadata: ${file}`);
  return manifest;
}

export function validateFixture(fixture, config) {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.syntheticOnly, true, 'Only an explicitly synthetic corpus may run');
  assert.equal(fixture.headSha, config.job.headSha);
  assert.equal(fixture.artifactSha256, config.job.localArtifact.digest);
  assert(Array.isArray(fixture.expectedFindings) && fixture.expectedFindings.length > 0);
  assert(['benign', 'malicious'].includes(fixture.expectedRepository));
  for (const finding of fixture.expectedFindings) {
    for (const key of ['id', 'tool', 'rule', 'path']) assert.equal(typeof finding[key], 'string');
    assert(['present', 'absent'].includes(finding.expected));
    if (finding.line !== undefined) integer(finding.line, 'finding line');
  }
}

export function scoreFindings(fixture, findings, verdict) {
  const cases = fixture.expectedFindings.map((expected) => {
    const observed = findings.filter((finding) => finding.tool_name === expected.tool && finding.rule_id === expected.rule && finding.file_path === expected.path &&
      (expected.line === undefined || (finding.start_line <= expected.line && finding.end_line >= expected.line)) &&
      !finding.suppression_id && !['IGNORED', 'ACKNOWLEDGED', 'FIXED'].includes(finding.status));
    return { id: expected.id, expected: expected.expected, observed: observed.length,
      passed: expected.expected === 'present' ? observed.length > 0 : observed.length === 0 };
  });
  return { cases, falseBlock: fixture.expectedRepository === 'benign' && verdict === 'FAIL',
    detectionPassed: cases.every((item) => item.passed) };
}

export async function measureInvocation(invoke) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let failed = false;
  try { await invoke(); } catch { failed = true; }
  return { startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - start, failed,
    clock: 'performance.now', scope: 'ScannerWorker.process; excludes ingest/queue/CLI/reveal' };
}

export function validateCellReport(report) {
  assert.equal(report.schemaVersion, 1);
  assert(['completed', 'failed', 'skipped'].includes(report.status));
  assert(['baseline', 'candidate'].includes(report.variant));
  assert(['minimal', 'extended'].includes(report.retention));
  assert.equal(report.qualityGate, 'incomplete', 'A single cell must never claim whole-campaign success');
  assert.equal(report.patchProof?.status, 'unmeasured');
  assert.equal(report.latency?.queue, null);
  assert.equal(report.latency?.hook, null);
  assert.equal(report.latency?.reveal, null);
  if (report.measurement !== null) {
    assert.equal(report.measurement.clock, 'performance.now');
    assert(Number.isFinite(report.measurement.elapsedMs) && report.measurement.elapsedMs >= 0);
  }
  if (report.status === 'completed') {
    assert(report.measurement && !report.measurement.failed);
    assert.equal(report.terminal?.status, 'COMPLETED');
    assert(report.coverage && report.coverage.length > 0 && report.coverage.every((entry) => entry.complete === true));
    assert.equal(report.pendingDeferredTasks, 0);
    assert.equal(report.provider.denied, 0);
    assert.equal(report.provider.failures, 0);
    assert.equal(report.terminal.security_outcome === 'COVERAGE_FAILED', false);
    assert.equal(report.detection.detectionPassed, true);
    assert.equal(report.detection.falseBlock, false);
    if (report.provider.mode === 'live') {
      assert(report.provider.observations.some((item) => item.purpose === 'generate' && Number.isSafeInteger(item.outputTokens)), 'Live cell requires observed provider generation');
      assert.equal(report.terminal.source_processing_status === 'disabled_by_policy', false);
    }
  }
  return report;
}

export function evaluateCampaign(reports) {
  const missing = [];
  for (const variant of ['baseline', 'candidate']) for (const retention of ['minimal', 'extended']) {
    const cells = reports.filter((report) => report.variant === variant && report.retention === retention);
    if (!cells.length || cells.some((cell) => cell.status !== 'completed')) missing.push(`${variant}/${retention}`);
  }
  for (const report of reports) validateCellReport(report);
  // Patch/application, required repetition counts and separate latency legs are
  // intentionally unsupported by this narrow invoker. No supplied result can
  // manufacture a complete quality pass.
  return { status: 'incomplete', passed: false, missingCells: missing,
    missingProof: ['paired finding/enforcement comparison', 'repeated warmed latency distribution', 'generated patch application and correctness', 'queue/CLI/reveal observations'] };
}

export function validateProviderReview(review) {
  assert.equal(review.schemaVersion, 1);
  assert.equal(typeof review.approvalReference, 'string');
  assert(review.approvalReference.length > 0);
  assert(Number.isFinite(Date.parse(review.expiresAt)) && Date.parse(review.expiresAt) > Date.now(), 'Provider review expired');
  assert(['disabled', 'live'].includes(review.mode));
  assert(Array.isArray(review.routes));
  if (review.mode === 'disabled') {
    assert.equal(review.routes.length, 0);
    for (const key of ['maxCalls', 'maxTokens', 'maxUsd']) assert.equal(review.limits[key], 0);
    return review;
  }
  integer(review.limits.maxCalls, 'maxCalls'); integer(review.limits.maxTokens, 'maxTokens'); positive(review.limits.maxUsd, 'maxUsd');
  assert.equal(review.transport?.kind, 'node-global-fetch');
  digest(review.transport?.reviewedBuildSha256);
  for (const key of ['reviewReference', 'externalContainmentReference']) assert(typeof review.transport[key] === 'string' && review.transport[key].length > 0);
  positive(review.accountHardLimitUsd, 'accountHardLimitUsd');
  assert(review.accountHardLimitUsd <= review.limits.maxUsd, 'A reviewed dedicated account cap must cover alternative transports');
  assert(review.routes.length > 0);
  for (const route of review.routes) {
    assert(['anthropic', 'gemini'].includes(route.protocol), 'Unsupported provider protocol');
    const url = new URL(route.prefix);
    assert.equal(url.protocol, 'https:'); assert(!url.username && !url.password && !url.search && !url.hash && url.pathname.endsWith('/'));
    assert.equal(url.origin, route.protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://generativelanguage.googleapis.com');
    assert.equal(url.pathname, route.protocol === 'anthropic' ? '/v1/' : '/v1beta/');
    assert.equal(typeof route.model, 'string'); assert(route.model && !route.model.includes('*'));
    assert.equal(typeof route.account, 'string'); assert(route.account);
    assert.equal(typeof route.region, 'string'); assert(route.region);
    assert.match(route.credentialEnv ?? '', route.protocol === 'anthropic' ? /^ANTHROPIC_API_KEY$/ : /^(GEMINI_API_KEY|GOOGLE_API_KEY)$/);
    integer(route.maxInputTokens, 'maxInputTokens'); integer(route.maxOutputTokens, 'maxOutputTokens');
    for (const key of ['inputUsdPerMillion', 'outputUsdPerMillion', 'countRequestMaxUsd']) assert(Number.isFinite(route[key]) && route[key] >= 0);
    assert.equal(route.countTokensApproved, true, 'Live execution requires reviewed token-counting permission');
    assert.equal(route.cachedInputRateCovered, true, 'Input rate must conservatively include all permitted cache billing');
    assert.equal(route.outputLimitCoversAllBillableTokens, true, 'Unbounded hidden/reasoning output is unsupported');
  }
  return review;
}

/** Wrap real fetch; no generated content or provider responses are mocked.
 * Count every attempt, reserve worst-case tokens/cost before I/O, and never
 * refund unknown failed attempts. Unsupported/unbounded payloads fail closed.
 */
export function guardedProviderFetch(review, fetchImpl = globalThis.fetch, authorize = async () => { throw new Error('QUALITY_PROVIDER_AUTHORIZER_REQUIRED'); }) {
  validateProviderReview(review);
  const stats = { mode: review.mode, calls: 0, reservedTokens: 0, reservedUsd: 0, measuredProviderMs: 0, denied: 0, failures: 0, observations: [] };
  const deny = (reason) => { stats.denied++; throw new Error(`QUALITY_PROVIDER_${reason}`); };
  function reserve(calls, tokens, usd) {
    if (stats.calls + calls > review.limits.maxCalls || stats.reservedTokens + tokens > review.limits.maxTokens || stats.reservedUsd + usd > review.limits.maxUsd) deny('BUDGET_LIMIT');
    stats.calls += calls; stats.reservedTokens += tokens; stats.reservedUsd += usd;
  }
  async function call(url, init, route, purpose) {
    if (Date.parse(review.expiresAt) <= Date.now()) return deny('REVIEW_EXPIRED');
    const started = performance.now();
    try {
      const response = await fetchImpl(url, { ...init, redirect: 'error' });
      const data = await response.clone().json();
      stats.observations.push({ protocol: route.protocol, model: route.model, purpose, status: response.status,
        elapsedMs: performance.now() - started });
      if (!response.ok) throw new Error('QUALITY_PROVIDER_HTTP_FAILURE');
      return { response, data };
    } catch (error) { stats.failures++; throw error; }
    finally { stats.measuredProviderMs += performance.now() - started; }
  }
  async function guarded(input, init = {}) {
    if (review.mode !== 'live') return deny('DISABLED');
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.username || url.password || url.search || url.hash || init.method !== 'POST' || typeof init.body !== 'string' || init.dispatcher || init.agent) return deny('UNSUPPORTED_REQUEST');
    let payload;
    try { payload = JSON.parse(init.body); } catch { return deny('INVALID_JSON'); }
    const model = payload.model ?? decodeURIComponent(url.pathname.match(/\/models\/([^/:]+):/)?.[1] ?? '');
    const route = review.routes.find((entry) => url.href.startsWith(entry.prefix) && entry.model === model);
    if (!route) return deny('UNAPPROVED_ROUTE');
    const anthropic = route.protocol === 'anthropic';
    const countOnly = anthropic ? url.pathname.endsWith('/messages/count_tokens') : url.pathname.endsWith(':countTokens');
    const generate = anthropic ? url.pathname.endsWith('/messages') : url.pathname.endsWith(':generateContent');
    if (!countOnly && !generate) return deny('UNSUPPORTED_FEATURE');
    if (payload.stream || payload.thinking || payload.generationConfig?.thinkingConfig || payload.cachedContent || payload.tools) return deny('UNBOUNDED_FEATURE');
    if (payload.generationConfig?.candidateCount !== undefined && payload.generationConfig.candidateCount !== 1) return deny('MULTIPLE_CANDIDATES');
    const textParts = (parts) => Array.isArray(parts) && parts.every((part) => part && typeof part.text === 'string' && Object.keys(part).every((key) => ['type', 'text', 'cache_control'].includes(key)) && (!part.type || part.type === 'text'));
    const textContent = (value) => typeof value === 'string' || textParts(value);
    const textOnly = anthropic
      ? Array.isArray(payload.messages) && payload.messages.every((message) => textContent(message.content)) && (payload.system === undefined || textContent(payload.system))
      : Array.isArray(payload.contents) && payload.contents.every((content) => textParts(content.parts)) && (payload.systemInstruction === undefined || textParts(payload.systemInstruction.parts));
    if (!textOnly) return deny('TEXT_ONLY');
    // Prevent arbitrarily large counting requests before contacting a provider.
    if (Buffer.byteLength(init.body) > route.maxInputTokens) return deny('INPUT_ENVELOPE_LIMIT');
    const output = countOnly ? 0 : anthropic ? payload.max_tokens : payload.generationConfig?.maxOutputTokens;
    if (!Number.isSafeInteger(output) || output < 0 || (!countOnly && output === 0) || output > route.maxOutputTokens) return deny('OUTPUT_LIMIT');
    const reservedTokens = route.maxInputTokens * (countOnly ? 1 : 2) + output;
    const reservedUsd = route.countRequestMaxUsd + (countOnly ? 0 : route.maxInputTokens * route.inputUsdPerMillion / 1e6 + output * route.outputUsdPerMillion / 1e6);
    reserve(countOnly ? 1 : 2, reservedTokens, reservedUsd);
    const countUrl = countOnly ? url.href : anthropic ? new URL('messages/count_tokens', route.prefix).href : url.href.replace(/:generateContent$/, ':countTokens');
    const countPayload = countOnly ? payload : anthropic ? { model, messages: payload.messages, ...(payload.system ? { system: payload.system } : {}) } : { contents: payload.contents, ...(payload.systemInstruction ? { systemInstruction: payload.systemInstruction } : {}) };
    try { await authorize(countUrl, model, 'count_tokens'); } catch { return deny('COUNT_POLICY'); }
    const counted = await call(countUrl, { ...init, body: JSON.stringify(countPayload) }, route, 'count_tokens');
    const count = anthropic ? counted.data.input_tokens : counted.data.totalTokens;
    if (!Number.isSafeInteger(count) || count < 0 || count > route.maxInputTokens) return deny('COUNT_LIMIT');
    if (countOnly) return counted.response;
    try { await authorize(url.href, model, 'generate'); } catch { return deny('GENERATE_POLICY'); }
    const generated = await call(url.href, init, route, 'generate');
    const usage = generated.data.usage ?? generated.data.usageMetadata;
    const inputTokens = anthropic ? (usage?.input_tokens ?? NaN) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) : usage?.promptTokenCount;
    const outputTokens = anthropic ? usage?.output_tokens : usage?.candidatesTokenCount;
    if (!anthropic && (usage?.thoughtsTokenCount ?? 0) !== 0) return deny('UNSUPPORTED_THOUGHT_USAGE');
    if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens) || inputTokens < 0 || outputTokens < 0 || inputTokens > route.maxInputTokens || outputTokens > output) return deny('USAGE_UNVERIFIED');
    Object.assign(stats.observations.at(-1), { inputTokens, outputTokens, countedInputTokens: count });
    return generated.response;
  }
  return { fetch: guarded, stats };
}
