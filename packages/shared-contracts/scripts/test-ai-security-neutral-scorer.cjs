'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  buildSchema,
  caseDigest,
  resultDigest,
  semanticDigest,
  withCaseDigest,
  withResultDigests,
} = require('./lib/ai-security-neutral-contract-v2.cjs');
const { lowerOneSided, scoreRecords, upperOneSided } = require('./lib/ai-security-neutral-scorer.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const fixture = read('fixtures/ai-security-neutral-evaluation.v2.json');
const plan = read('fixtures/ai-security-neutral-scorer-adversarial.v1.json');
const clone = (value) => structuredClone(value);

function setPointer(value, pointer, replacement) {
  const parts = pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let target = value;
  for (const part of parts.slice(0, -1)) target = target[Array.isArray(target) ? Number(part) : part];
  const leaf = parts.at(-1);
  target[Array.isArray(target) ? Number(leaf) : leaf] = replacement;
}

function buildScenario(scenario) {
  let cases = [clone(fixture.case)];
  let results = [clone(fixture.result)];
  if (scenario.operation === 'replace') {
    const target = scenario.target === 'case' ? cases[0] : results[0];
    setPointer(target, scenario.path, scenario.value);
  } else if (scenario.operation === 'remove-finding') {
    results[0].findings.splice(0, 1);
    results[0].resourceUsage.findingCount = 0;
  } else if (scenario.operation === 'benign-extra-finding') {
    cases[0].label = 'BENIGN';
    cases[0].expected.findings = [];
    cases[0].expected.transforms = [];
  } else if (scenario.operation === 'duplicate-result') {
    results.push(clone(results[0]));
  } else if (scenario.operation === 'append-semantic-variant') {
    const variant = clone(cases[0]);
    variant.caseId = '44444444-4444-4444-8444-444444444444';
    variant.subject.action.actionId = '55555555-5555-4555-8555-555555555555';
    variant.input.fixtureRef = 'public.aws-access-key.case-1.variant';
    cases.push(withCaseDigest(variant));
    const resultVariant = clone(results[0]);
    resultVariant.caseId = variant.caseId;
    results.push(withResultDigests(resultVariant));
  } else {
    assert.fail(`unknown adversarial operation: ${scenario.operation}`);
  }
  if (scenario.resign) {
    cases = cases.map((record) => withCaseDigest(record));
    results = results.map((record) => withResultDigests(record));
  }
  return { cases, results };
}

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(buildSchema());
assert.equal(validate(fixture.case), true, JSON.stringify(validate.errors));
assert.equal(validate(fixture.result), true, JSON.stringify(validate.errors));
assert.equal(validate(fixture.report), true, JSON.stringify(validate.errors));
assert.equal(caseDigest(fixture.case), fixture.case.caseDigest);
assert.equal(resultDigest(fixture.result), fixture.result.resultDigest);
assert.equal(semanticDigest(fixture.result), fixture.result.semanticDigest);

const baseline = scoreRecords([fixture.case], [fixture.result]);
assert.equal(baseline.pass, true);
assert.equal(baseline.summary.exactResults, 1);
assert.equal(baseline.failures.length, 0);

for (const scenario of plan.scenarios) {
  const input = buildScenario(scenario);
  const report = scoreRecords(input.cases, input.results);
  const codes = new Set(report.failures.map((failure) => failure.code));
  for (const expected of scenario.expectedFailureCodes) {
    assert.ok(codes.has(expected), `${scenario.scenarioId}: missing ${expected}; got ${[...codes].join(',')}`);
  }
  if (scenario.expectedFailureCodes.length > 0) assert.equal(report.pass, false, scenario.scenarioId);
  if (scenario.expectedClusterCount !== undefined) {
    assert.equal(report.clusters.clusterCount, scenario.expectedClusterCount, scenario.scenarioId);
    assert.equal(report.clusters.effectiveClusterSize, scenario.expectedEffectiveClusterSize, scenario.scenarioId);
    assert.equal(report.clusters.duplicateVariantCount, 1, scenario.scenarioId);
  }
}

const timingMutation = clone(fixture.result);
timingMutation.provenance.finishedAt = '2026-07-20T00:00:02Z';
const resignedTiming = withResultDigests(timingMutation);
assert.equal(resignedTiming.semanticDigest, fixture.result.semanticDigest, 'timing must not alter semantic digest');
assert.notEqual(resignedTiming.resultDigest, fixture.result.resultDigest, 'result digest must cover timing');
const rawMutation = clone(fixture.result);
rawMutation.resultDigest = `sha256:${'0'.repeat(64)}`;
assert.equal(resultDigest(rawMutation), fixture.result.resultDigest, 'result digest excludes only resultDigest');

const classOnly = clone(fixture.result);
classOnly.findings[0].span.start += 1;
const classOnlyReport = scoreRecords([fixture.case], [withResultDigests(classOnly)]);
assert.equal(classOnlyReport.pass, false, 'same class with wrong semantics must never pass');
assert.ok(classOnlyReport.summary.wrongSpans > 0);

const rawProperty = clone(fixture.result);
rawProperty.rawContent = 'forbidden';
assert.equal(validate(rawProperty), false, 'raw content property must be rejected');
assert.ok(upperOneSided(0, 100, 0.05) > 0, 'zero observed failures still needs a nonzero upper bound');
assert.ok(lowerOneSided(100, 100, 0.05) < 1, 'perfect observed success still needs a sub-one lower bound');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-neutral-scorer-'));
try {
  const caseJson = path.join(temporary, 'cases.json');
  const resultJsonl = path.join(temporary, 'results.jsonl');
  fs.writeFileSync(caseJson, `${JSON.stringify({ cases: [fixture.case] })}\n`, 'utf8');
  fs.writeFileSync(resultJsonl, `${JSON.stringify(fixture.result)}\n`, 'utf8');
  const execution = spawnSync(process.execPath, [
    path.join(root, 'scripts/score-ai-security-neutral-evaluation.cjs'),
    '--cases', caseJson,
    '--results', resultJsonl,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(execution.stdout);
  assert.equal(report.pass, true);
  assert.equal(report.summary.exactResults, 1);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(`M4.7 neutral scorer: PASS (${plan.scenarios.length} adversarial scenarios)\n`);
