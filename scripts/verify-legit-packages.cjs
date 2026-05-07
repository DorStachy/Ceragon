'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const credentialsPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Owner', '.ceragon', 'credentials.json');
const region = 'eu-north-1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
    ...options,
  }).trim();
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
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function getJson(url, apiKey) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}

function fetchLogsByPattern(pattern, startTimeMs) {
  const raw = run('aws', [
    'logs', 'filter-log-events', '--no-cli-pager',
    '--log-group-name', '/ecs/cera-fetch-worker-staging',
    '--region', region,
    '--start-time', String(startTimeMs),
    '--filter-pattern', pattern,
    '--output', 'json',
  ]);
  const parsed = JSON.parse(raw || '{"events": []}');
  return (parsed.events || []).map((e) => e.message).filter(Boolean);
}

// ── Test packages ──────────────────────────────────────────────────────────
const TEST_PACKAGES = [
  { name: 'fastify', version: '5.8.2', expectedVerdict: 'ALLOW' },
  { name: 'axios', version: '1.13.6', expectedVerdict: 'ALLOW' },
  { name: 'yargs-parser', version: '22.0.0', expectedVerdict: 'ALLOW' },
];

async function main() {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const correlationId = `legit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTimeMs = Date.now() - 60_000;

  console.log(`Correlation ID: ${correlationId}`);
  console.log(`Testing ${TEST_PACKAGES.length} legitimate packages...\n`);

  // ── Submit all packages in one request ────────────────────────────────
  const targets = TEST_PACKAGES.map((p) => ({ name: p.name, version: p.version }));
  console.log('Submitting check-packages request...');
  const checkResponse = await postJson(
    `${credentials.apiBaseUrl}/api/v1/packages/check-packages`,
    credentials.apiKey,
    {
      tool: 'npm',
      intent: 'INSTALL',
      targets,
      context: {
        os: 'windows',
        arch: 'x64',
        hostname: 'copilot-legit-verifier',
        toolVersion: '10.0.0',
        runtimeVersion: 'v20.0.0',
        registry: 'https://registry.npmjs.org',
        isInteractive: false,
        isCI: true,
      },
      correlationId,
    },
  );

  console.log('Initial response:');
  const decisions = checkResponse.decisions || [];
  for (const d of decisions) {
    console.log(`  ${d.package}@${d.version} → ${d.action} (analysisId: ${d.analysisId || 'N/A'}, cacheHit: ${d.cacheHit})`);
  }

  // ── Collect HOLD analysis IDs to poll ────────────────────────────────
  const holdItems = decisions.filter((d) => d.action === 'HOLD' && d.analysisId);
  const nonHoldItems = decisions.filter((d) => d.action !== 'HOLD');

  if (holdItems.length > 0) {
    console.log(`\nPolling ${holdItems.length} HOLD analyses (up to 5 min)...`);
  }

  const results = {};
  for (const d of nonHoldItems) {
    results[`${d.package}@${d.version}`] = {
      action: d.action,
      reason: d.reason,
      riskScore: d.riskScore,
      cacheHit: d.cacheHit,
      status: 'IMMEDIATE',
    };
  }

  // ── Poll each HOLD analysis until COMPLETE ───────────────────────────
  const MAX_POLLS = 60; // 60 × 5s = 5 min
  for (const hold of holdItems) {
    const key = `${hold.package}@${hold.version}`;
    let completed = false;
    for (let i = 1; i <= MAX_POLLS; i++) {
      await sleep(5000);
      const { status, data } = await getJson(
        `${credentials.apiBaseUrl}/api/v1/packages/analysis/${hold.analysisId}`,
        credentials.apiKey,
      );
      if (status === 200 && data.status === 'COMPLETE') {
        const dec = data.decision || {};
        results[key] = {
          action: dec.action,
          reason: dec.reason,
          riskScore: dec.riskScore,
          cacheHit: dec.cacheHit,
          status: 'COMPLETE',
          pollAttempts: i,
          findings: (dec.topFindings || []).length,
          topFindings: (dec.topFindings || []).slice(0, 5).map((f) => `${f.code}: ${f.description}`),
        };
        console.log(`  ✓ ${key} → ${dec.action} (score: ${dec.riskScore}, polls: ${i})`);
        completed = true;
        break;
      }
      if (i % 12 === 0) {
        console.log(`  … ${key} still ${data.status || 'PENDING'} after ${i * 5}s`);
      }
    }
    if (!completed) {
      results[key] = { status: 'TIMEOUT', analysisId: hold.analysisId };
      console.log(`  ✗ ${key} → TIMEOUT after 5 min`);
    }
  }

  // ── CloudWatch provider evidence ─────────────────────────────────────
  console.log('\nFetching CloudWatch logs...');

  // Give CloudWatch a moment to ingest
  await sleep(5000);

  const providerLogs = fetchLogsByPattern('"LLM call succeeded"', startTimeMs);
  const fallbackLogs = fetchLogsByPattern('"falling back to Gemini"', startTimeMs);
  const reasoningLogs = fetchLogsByPattern('"Nemotron returned reasoning without final content"', startTimeMs);
  const exhaustedLogs = fetchLogsByPattern('"Nemotron exhausted retries"', startTimeMs);

  const nemotronSuccesses = providerLogs
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.context?.provider === 'nemotron');

  const geminiSuccesses = providerLogs
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.context?.provider === 'gemini');

  // ── Summary ──────────────────────────────────────────────────────────
  const summary = {
    correlationId,
    packages: TEST_PACKAGES.map((p) => ({
      name: p.name,
      version: p.version,
      expectedVerdict: p.expectedVerdict,
      ...(results[`${p.name}@${p.version}`] || { status: 'NOT_FOUND' }),
    })),
    providerStats: {
      nemotronSuccessCount: nemotronSuccesses.length,
      geminiSuccessCount: geminiSuccesses.length,
      geminiFallbackCount: fallbackLogs.length,
      reasoningRecoveryCount: reasoningLogs.length,
      exhaustedRetryCount: exhaustedLogs.length,
    },
    nemotronLatencies: nemotronSuccesses.map((e) => e.context.latencyMs),
    falsePositives: TEST_PACKAGES.filter((p) => {
      const r = results[`${p.name}@${p.version}`];
      return r && r.action !== p.expectedVerdict && r.action !== 'ALLOW_FAST';
    }).map((p) => `${p.name}@${p.version}: expected ${p.expectedVerdict}, got ${results[`${p.name}@${p.version}`].action}`),
  };

  console.log('\n' + JSON.stringify(summary, null, 2));

  // Exit with non-zero if any false positives
  if (summary.falsePositives.length > 0) {
    console.error(`\n❌ ${summary.falsePositives.length} FALSE POSITIVE(S) DETECTED`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ All ${TEST_PACKAGES.length} packages got expected verdicts — no false positives`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exitCode = 1;
});
