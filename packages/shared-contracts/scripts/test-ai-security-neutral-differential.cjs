#!/usr/bin/env node
'use strict';

// P1-E07 — self-contained test for the cross-engine differential report.
// Uses the representative neutral case/result (no cross-repo dependency) to prove:
//   * per-engine confusion is exact against the shared content-free cases;
//   * a cross-engine semantic divergence is detected and attributed to the pair;
//   * the authoritative-engine-exact composite passes while a divergent engine is
//     reported (green-with-documented-divergence);
//   * the report is deterministic (stable reportDigest across runs) and content-free.

const assert = require('node:assert');
const { buildRepresentativeRecords, withResultDigests, canonicalizeJcs } = require('./lib/ai-security-neutral-contract-v2.cjs');
const { computeDifferentialReport } = require('./lib/ai-security-neutral-differential.cjs');

function makeResult(base, runnerId, engineId, mutate) {
  const clone = JSON.parse(JSON.stringify(base));
  clone.runner = { ...clone.runner, runnerId, engineId };
  if (mutate) mutate(clone);
  return withResultDigests(clone);
}

function fail(message) { process.stderr.write(`differential test FAIL: ${message}\n`); process.exit(1); }

const { case: caseRecord, result } = buildRepresentativeRecords();
const cases = [caseRecord];

// Engine A (authoritative) reproduces the case exactly.
const engineA = makeResult(result, 'engine-a', 'engine-a', null);
// Engine B agrees exactly (DUPLICATE across engines).
const engineB = makeResult(result, 'engine-b', 'engine-b', null);
// Engine C drifts: it shifts the finding span, forcing a cross-engine divergence
// AND a per-engine mismatch against the authoritative expected.
const engineC = makeResult(result, 'engine-c', 'engine-c', (clone) => {
  clone.findings[0].span = { start: 0, end: 5, unit: 'UTF8_BYTE' };
});

// (1) Two agreeing engines: exact per-engine, zero cross-engine mismatch.
const agree = computeDifferentialReport(cases, [
  { engineId: 'engine-a', runnerId: 'engine-a', results: [engineA] },
  { engineId: 'engine-b', runnerId: 'engine-b', results: [engineB] },
]);
assert.equal(agree.format, 'ceragon.ai-security.neutral-differential-report');
assert.equal(agree.pass, true, 'agreeing engines must pass');
assert.equal(agree.crossEngine.comparedCases, 1);
assert.equal(agree.crossEngine.mismatches, 0, 'agreeing engines must have zero mismatches');
assert.equal(agree.crossEngine.agreements, 1);
for (const engine of agree.engines) assert.equal(engine.pass, true, `${engine.engineId} should be exact`);
assert.equal(agree.corpus.independentClusterCount, 1);
assert.equal(agree.corpus.effectiveClusterSize, 1);

// (2) Authoritative + divergent engine: authoritative exact -> composite passes,
//     divergence detected and attributed to the (engine-a, engine-c) pair.
const drift = computeDifferentialReport(cases, [
  { engineId: 'engine-a', runnerId: 'engine-a', results: [engineA] },
  { engineId: 'engine-c', runnerId: 'engine-c', results: [engineC] },
]);
assert.equal(drift.authoritativeEngineId, 'engine-a');
const authoritative = drift.engines.find((e) => e.engineId === 'engine-a');
const divergent = drift.engines.find((e) => e.engineId === 'engine-c');
assert.equal(authoritative.pass, true, 'authoritative engine must reproduce the case exactly');
assert.equal(divergent.pass, false, 'divergent engine must be reported as not-exact');
assert.ok(divergent.confusion.wrongSpans >= 1 || divergent.confusion.missedFindings >= 1, 'span drift must surface in confusion');
assert.equal(drift.crossEngine.mismatches, 1, 'one cross-engine mismatch expected');
assert.equal(drift.crossEngine.pairwiseMismatchCaseCount, 1);
assert.deepEqual(drift.crossEngine.byEnginePair, [{ engineA: 'engine-a', engineB: 'engine-c', mismatchCases: 1 }]);
assert.equal(drift.crossEngine.mismatchCases.length, 1);
assert.equal(drift.crossEngine.mismatchCases[0].caseId, caseRecord.caseId);
assert.equal(drift.pass, true, 'authoritative-exact composite is green with documented divergence');

// (3) Determinism + content-free.
const again = computeDifferentialReport(cases, [
  { engineId: 'engine-a', runnerId: 'engine-a', results: [engineA] },
  { engineId: 'engine-c', runnerId: 'engine-c', results: [engineC] },
]);
assert.equal(again.reportDigest, drift.reportDigest, 'differential report must be deterministic');
const serialized = canonicalizeJcs(drift);
assert.equal(serialized.includes('AKIAIOSFODNN7EXAMPLE'), false, 'report must be content-free');
assert.equal(/[\u{1F000}-\u{1FAFF}]/u.test(serialized), false, 'report must be content-free (no astral content)');

process.stdout.write('M4.7 neutral differential: PASS (per-engine confusion + cross-engine detection + determinism + content-free)\n');
