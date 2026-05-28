#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// ═════════════════════════════════════════════════════════════════════════
// 2026-05-20 R5 gap-closure: r5-retest-validation.cjs
//
// Validates the local-E2E retest fixture matrix against the latest
// `analysis` rows.  Two explicit modes:
//   --mode=base     — validate the BASE_FIXTURES coordinate set.
//                      Every row MUST have:
//                        scanComplete === true
//                        coverageDegraded === false
//                        failedSources empty
//                        degradationReasons empty
//                        sourceHealth.<applicable>.status === 'succeeded'
//                          AND responseValidated === true
//                        sourceHealth.<non-applicable>.status === 'skipped'
//                      At least one base row must carry a GHSA-sourced
//                      advisory (proving the GHSA path ran AND returned
//                      data, not just an empty success).
//   --mode=degraded — validate DEGRADED_FIXTURE (NOT in BASE_FIXTURES).
//                      MUST have:
//                        coverageDegraded === true
//                        degradationReasons includes ghsa-rate-limited /
//                          ghsa-unavailable / ghsa-malformed-response
//                        sourceHealth.ghsa.status === 'failed'
//                          AND responseValidated === false
//                        sourceHealth.osv.status === 'succeeded'
//                        sourceHealth.npm.status === 'succeeded' (npm
//                          ecosystem only)
//
// `--coords <path>` is required: the resolved BASE_FIXTURES set with
// `__CLEAN_CONTROL__` / `__LOCAL_DIR__` placeholders substituted by the
// caller (Task G runtime selection / Task E install-time resolution).
// `--base-ids <path>` is required in --mode=degraded so we can assert
// no base row was overwritten by the mock-mode run.
// ═════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// BASE_FIXTURES — the nine authoritative-coverage retest coordinates.
const BASE_FIXTURES = Object.freeze([
  { ecosystem: 'npm', name: 'event-stream', version: '3.3.6', sourceType: 'registry' },
  { ecosystem: 'npm', name: 'minimist', version: '0.0.8', sourceType: 'registry' },
  { ecosystem: 'npm', name: 'prismjs', version: '1.29.0', sourceType: 'registry' },
  { ecosystem: 'cargo', name: 'serde', version: '1.0.197', sourceType: 'registry' },
  { ecosystem: 'pypi', name: 'requests', version: '2.32.3', sourceType: 'registry' },
  { ecosystem: 'pypi', name: 'certifi', version: '2024.8.30', sourceType: 'registry' },
  { ecosystem: 'pypi', name: 'urllib3', version: '1.26.5', sourceType: 'registry' },
  { ecosystem: 'npm', name: '__CLEAN_CONTROL__', version: '__CLEAN_CONTROL__', sourceType: 'registry' },
  { ecosystem: 'npm', name: '__LOCAL_DIR__', version: '__LOCAL_DIR__', sourceType: 'local-dir' },
]);

const DEGRADED_FIXTURE = Object.freeze({
  ecosystem: process.env.R5_DEGRADED_ECOSYSTEM || 'npm',
  name: process.env.R5_DEGRADED_NAME || 'kind-of',
  version: process.env.R5_DEGRADED_VERSION || '6.0.3',
  sourceType: 'registry',
});

// Self-check on module load.
for (const f of BASE_FIXTURES) {
  if (
    f.ecosystem === DEGRADED_FIXTURE.ecosystem &&
    f.name === DEGRADED_FIXTURE.name &&
    f.version === DEGRADED_FIXTURE.version
  ) {
    throw new Error('Degraded fixture coordinate must not be in BASE_FIXTURES');
  }
}

function applicableSources(ecosystem, sourceType) {
  if (sourceType === 'local-dir' || sourceType === 'file-protocol' || sourceType === 'local-tarball') {
    return new Set();
  }
  switch (ecosystem) {
    case 'npm':
      return new Set(['osv', 'ghsa', 'npm']);
    case 'pypi':
    case 'cargo':
      return new Set(['osv', 'ghsa']);
    default:
      return new Set();
  }
}

function getArg(name, def) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) {
    const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
    return eq ? eq.split('=').slice(1).join('=') : def;
  }
  return process.argv[idx + 1];
}

function failGate(msg, details) {
  console.error(`[r5-retest-validation] FAIL: ${msg}`);
  if (details !== undefined) console.error(`  details: ${JSON.stringify(details, null, 2)}`);
  process.exit(1);
}

function readCoverageMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;
  return meta.vulnerabilityScanHealth || meta.vulnerabilityCoverage || null;
}

function assertDependencyGraphCoverage(f, meta, coverage) {
  if (f.sourceType !== 'registry' || (f.ecosystem !== 'npm' && f.ecosystem !== 'pypi')) {
    return;
  }

  const graph = meta.dependencyGraph || {};
  const reasons = Array.isArray(coverage.degradationReasons) ? coverage.degradationReasons : [];
  const unresolved = Array.isArray(coverage.unresolvedDependencies)
    ? coverage.unresolvedDependencies
    : (Array.isArray(graph.unresolvedDependencies) ? graph.unresolvedDependencies : []);
  const graphComplete =
    graph.resolutionComplete === true ||
    coverage.dependencyGraphResolutionComplete === true ||
    meta.dependencyGraphStatus === 'COMPLETE';
  const graphExplicitlyDegraded =
    coverage.coverageDegraded === true &&
    (
      unresolved.length > 0 ||
      reasons.some((reason) => /^dependency-(graph|resolution)-/.test(String(reason)))
    );

  if (!graphComplete && !graphExplicitlyDegraded) {
    failGate(
      `Row ${f.name}@${f.version} does not prove npm/PyPI dependency graph coverage was complete or explicitly degraded`,
      { dependencyGraph: graph, vulnerabilityScanHealth: coverage },
    );
  }

  if (graphComplete && unresolved.length > 0) {
    failGate(`Row ${f.name}@${f.version} says dependency graph is complete but has unresolvedDependencies`, {
      unresolvedDependencies: unresolved,
    });
  }
}

function rowHasGhsaAdvisoryEvidence(row) {
  const findings = row.findings || [];
  const securityFindings = row.metadata?.securityFindings || [];
  const preliminaryVulns = row.metadata?.preliminaryDecision?.vulnerabilities || [];

  const hasGhsaProvider = (item) => {
    if (!item || typeof item !== 'object') return false;
    if (item.source === 'ghsa') return true;
    if (Array.isArray(item.advisorySources) && item.advisorySources.includes('ghsa')) return true;
    if (typeof item.legacyCode === 'string' && item.legacyCode.startsWith('GHSA-')) return true;
    if (typeof item.code === 'string' && item.code.startsWith('GHSA-')) return true;
    if (typeof item.id === 'string' && item.id.startsWith('GHSA-')) return true;
    if (typeof item.advisoryId === 'string' && item.advisoryId.startsWith('GHSA-')) return true;
    if (Array.isArray(item.aliases) && item.aliases.some((a) => typeof a === 'string' && a.startsWith('GHSA-'))) {
      return true;
    }
    return false;
  };

  return findings.some(hasGhsaProvider) ||
    securityFindings.some(
      (finding) => hasGhsaProvider(finding) ||
        (finding.evidence || []).some(hasGhsaProvider),
    ) ||
    preliminaryVulns.some(hasGhsaProvider);
}

async function main() {
  const mode = getArg('mode', 'base');
  const coordsPath = getArg('coords');
  const baseIdsPath = getArg('base-ids');
  const repoRootIdx = process.argv.indexOf('--repo-root');
  const repoRoot = repoRootIdx >= 0
    ? path.resolve(process.argv[repoRootIdx + 1])
    : path.resolve(__dirname, '..');

  if (!coordsPath) failGate('--coords <path> required');
  let resolved;
  try {
    resolved = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));
  } catch (e) {
    failGate(`Failed to read --coords ${coordsPath}: ${e.message}`);
  }
  if (!Array.isArray(resolved)) failGate('--coords must be an array');
  if (resolved.length !== BASE_FIXTURES.length) {
    failGate(
      `--coords length mismatch: got ${resolved.length}, expected ${BASE_FIXTURES.length}`,
    );
  }
  for (const f of resolved) {
    if (!f.ecosystem || !f.name || !f.version) failGate(`Invalid coord ${JSON.stringify(f)}`);
    if (f.name.startsWith('__') || f.version.startsWith('__')) {
      failGate(`Unresolved placeholder in --coords: ${JSON.stringify(f)}`);
    }
  }

  // Resolve pg from Backend/node_modules.
  const pgPath = path.join(repoRoot, 'Backend', 'node_modules', 'pg');
  if (!fs.existsSync(pgPath)) {
    failGate(`pg dependency not found at ${pgPath}. Run npm install in ${repoRoot}/Backend.`);
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { Client } = require(pgPath);
  const client = new Client({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 5433),
    user: process.env.DATABASE_USER || 'codefense',
    password: process.env.DATABASE_PASSWORD || 'localtest123',
    database: process.env.DATABASE_NAME || 'codefense_db',
  });
  await client.connect();

  try {
    if (mode === 'base') {
      await validateBase(client, resolved);
    } else if (mode === 'degraded') {
      if (!baseIdsPath) failGate('--mode=degraded requires --base-ids <path>');
      await validateDegraded(client, resolved, baseIdsPath);
    } else {
      failGate(`Unknown --mode=${mode} (expected base|degraded)`);
    }
  } finally {
    await client.end();
  }

  console.log('[r5-retest-validation] PASS');
}

async function loadLatestRow(client, f) {
  const { rows } = await client.query(
    `SELECT id::text, status, verdict, "riskScore", metadata, findings
       FROM analysis
      WHERE ecosystem=$1 AND "packageName"=$2 AND "packageVersion"=$3
      ORDER BY "createdAt" DESC LIMIT 1`,
    [f.ecosystem, f.name, f.version],
  );
  return rows[0] || null;
}

async function validateBase(client, resolved) {
  let ghsaPositiveSourceCount = 0;
  for (const f of resolved) {
    const row = await loadLatestRow(client, f);
    if (!row) failGate(`Missing analysis row for ${f.ecosystem}:${f.name}@${f.version}`);
    if (row.status !== 'COMPLETED') {
      failGate(`Row for ${f.name}@${f.version} status !== COMPLETED: ${row.status}`);
    }
    const meta = row.metadata || {};
    const vsh = meta.vulnerabilityScanHealth;
    if (!vsh || typeof vsh !== 'object' || Array.isArray(vsh) || vsh === null) {
      failGate(`Row ${f.name}@${f.version} missing vulnerabilityScanHealth metadata`);
    }

    if (f.sourceType === 'local-dir') {
      const notRunMarker = (meta.localSourceStaticScanStatus === 'not_run') ||
        ((row.findings || []).some(
          (x) => x && x.evidence && x.evidence.localSourceStaticScanStatus === 'not_run',
        ));
      const completedMarker = (meta.localSourceStaticScanStatus === 'completed') ||
        ((row.findings || []).some(
          (x) => x && x.evidence && x.evidence.localSourceStaticScanStatus === 'completed',
        ));

      if (vsh.terminalFastGate === true || notRunMarker) {
        if (vsh.terminalFastGate !== true) {
          failGate(`Local-dir row ${f.name}@${f.version} expected terminalFastGate=true`, vsh);
        }
        if (vsh.scanComplete !== false || vsh.coverageDegraded !== true) {
          failGate(`Local-dir row ${f.name}@${f.version} expected degraded local static coverage`, vsh);
        }
        if (!Array.isArray(vsh.degradationReasons) ||
            !vsh.degradationReasons.includes('local-source-static-scan-not-run')) {
          failGate(`Local-dir row ${f.name}@${f.version} missing local-source-static-scan-not-run`, vsh);
        }
        if (!notRunMarker) {
          failGate(`Local-dir row ${f.name}@${f.version} missing localSourceStaticScanStatus=not_run marker`);
        }
        continue;
      }

      if (vsh.scanComplete !== true) {
        failGate(`Local artifact row ${f.name}@${f.version} vsh.scanComplete !== true`, vsh);
      }
      if (vsh.coverageDegraded === true) {
        failGate(`Local artifact row ${f.name}@${f.version} coverageDegraded === true`, vsh);
      }
      if (!completedMarker) {
        failGate(`Local artifact row ${f.name}@${f.version} missing localSourceStaticScanStatus=completed marker`);
      }
      continue;
    }

    if (vsh.scanComplete !== true) {
      failGate(`Row ${f.name}@${f.version} vsh.scanComplete !== true`, vsh);
    }
    if (vsh.coverageDegraded === true) {
      failGate(`Row ${f.name}@${f.version} coverageDegraded === true on registry base fixture`, vsh);
    }
    if (!Array.isArray(vsh.failedSources) || vsh.failedSources.length !== 0) {
      failGate(`Row ${f.name}@${f.version} failedSources should be empty`, vsh.failedSources);
    }
    if (!Array.isArray(vsh.degradationReasons) || vsh.degradationReasons.length !== 0) {
      failGate(`Row ${f.name}@${f.version} degradationReasons should be empty`, vsh.degradationReasons);
    }

    if (vsh.terminalFastGate === true) {
      const sourceHealth = vsh.sourceHealth || {};
      for (const src of ['osv', 'ghsa', 'npm']) {
        const sh = sourceHealth[src];
        if (!sh) failGate(`Terminal row ${f.name}@${f.version} sourceHealth.${src} missing`);
        if (sh.status !== 'skipped') {
          failGate(`Terminal row ${f.name}@${f.version} sourceHealth.${src}.status should be 'skipped'`, sh);
        }
      }
      continue;
    }

    // Per-source applicability check.
    const applicable = applicableSources(f.ecosystem, f.sourceType);
    const sourceHealth = vsh.sourceHealth || {};
    for (const src of ['osv', 'ghsa', 'npm']) {
      const sh = sourceHealth[src];
      if (!sh) failGate(`Row ${f.name}@${f.version} sourceHealth.${src} missing`);
      if (applicable.has(src)) {
        if (sh.status !== 'succeeded') {
          failGate(`Row ${f.name}@${f.version} sourceHealth.${src}.status !== 'succeeded'`, sh);
        }
        if (sh.responseValidated !== true) {
          failGate(`Row ${f.name}@${f.version} sourceHealth.${src}.responseValidated !== true`, sh);
        }
      } else {
        if (sh.status !== 'skipped') {
          failGate(`Row ${f.name}@${f.version} sourceHealth.${src}.status should be 'skipped' for non-applicable source`, sh);
        }
      }
    }
    assertDependencyGraphCoverage(f, meta, vsh);

    // Count GHSA-sourced findings/advisories on registry rows.
    if (f.sourceType !== 'local-dir') {
      if (rowHasGhsaAdvisoryEvidence(row)) ghsaPositiveSourceCount++;
    }
  }
  if (ghsaPositiveSourceCount === 0) {
    failGate('No base fixture row carries a GHSA-sourced advisory — GHSA path returned no data');
  }
}

async function validateDegraded(client, resolved, baseIdsPath) {
  // Assert no base row was overwritten by the mock-mode run.
  const baseSnapshot = JSON.parse(fs.readFileSync(baseIdsPath, 'utf8'));
  for (const f of resolved) {
    const key = `${f.ecosystem}:${f.name}@${f.version}`;
    if (!baseSnapshot[key]) {
      failGate(`base snapshot missing key ${key}`);
    }
    const row = await loadLatestRow(client, f);
    if (!row) failGate(`Base row vanished after mock phase: ${key}`);
    if (row.id !== baseSnapshot[key]) {
      failGate(`Base row ${key} OVERWRITTEN by mock phase`, { snapshotId: baseSnapshot[key], currentId: row.id });
    }
  }

  // Validate the DEGRADED_FIXTURE row.
  const row = await loadLatestRow(client, DEGRADED_FIXTURE);
  if (!row) failGate(`Missing degraded fixture row for ${DEGRADED_FIXTURE.name}@${DEGRADED_FIXTURE.version}`);
  const meta = row.metadata || {};
  const coverage = readCoverageMetadata(meta);
  if (!coverage) {
    failGate('Degraded row missing vulnerabilityScanHealth/vulnerabilityCoverage metadata');
  }
  if (coverage.coverageDegraded !== true) {
    failGate('Degraded row coverageDegraded !== true', coverage);
  }
  const reasons = Array.isArray(coverage.degradationReasons) ? coverage.degradationReasons : [];
  if (!reasons.includes('ghsa-rate-limited')) {
    failGate(`Degraded row missing GHSA degradation reason`, reasons);
  }
  const sourceHealth = coverage.sourceHealth || {};
  if (sourceHealth.ghsa?.status !== 'failed') {
    failGate('Degraded row sourceHealth.ghsa shape wrong', sourceHealth.ghsa);
  }
}

main().catch((e) => {
  console.error(`[r5-retest-validation] EXCEPTION: ${e.message}`);
  process.exit(1);
});
