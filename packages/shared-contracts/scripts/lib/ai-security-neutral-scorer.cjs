'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  CONTRACT_VERSION,
  SCORER_VERSION,
  buildSchema,
  canonicalizeJcs,
  caseDigest,
  digestValue,
  reportDigest,
  resultDigest,
  semanticDigest,
} = require('./ai-security-neutral-contract-v2.cjs');

const LICENSES_BY_PLANE = Object.freeze({
  PUBLIC_SYNTHETIC: new Set(['CC0-1.0', 'Apache-2.0', 'MIT', 'BSD-3-Clause']),
  PRIVATE_INCIDENT: new Set(['PROPRIETARY-APPROVED']),
  SEALED_HOLDOUT: new Set(['PROPRIETARY-APPROVED']),
  TENANT_LOCAL: new Set(['TENANT-LOCAL-NO-EXPORT']),
  ISSUER_SANDBOX: new Set(['ISSUER-SANDBOX']),
});
const TRUST_BY_PLANE = Object.freeze({
  PUBLIC_SYNTHETIC: new Set(['SYNTHETIC', 'MAINTAINER_REVIEWED', 'INDEPENDENT_REVIEWED']),
  PRIVATE_INCIDENT: new Set(['MAINTAINER_REVIEWED', 'INDEPENDENT_REVIEWED']),
  SEALED_HOLDOUT: new Set(['INDEPENDENT_REVIEWED', 'SEALED']),
  TENANT_LOCAL: new Set(['TENANT_LOCAL']),
  ISSUER_SANDBOX: new Set(['ATTESTED_ISSUER']),
});

const VALIDATION_CODES = new Set([
  'SCHEMA_INVALID_CASE',
  'SCHEMA_INVALID_RESULT',
  'CASE_DIGEST_MISMATCH',
  'RESULT_DIGEST_MISMATCH',
  'SEMANTIC_DIGEST_MISMATCH',
  'DUPLICATE_CASE',
  'DUPLICATE_RESULT',
  'RESULT_CASE_MISMATCH',
  'UNKNOWN_CASE_RESULT',
  'PROVENANCE_REJECTED',
  'LICENSE_REJECTED',
  'CLUSTER_SPLIT_DRIFT',
]);

function stableEqual(left, right) {
  return canonicalizeJcs(left) === canonicalizeJcs(right);
}

function nullableDigest(value) {
  return digestValue(value === undefined ? null : value);
}

function safeIdentity(value, pattern) {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

function makeFailure(code, options = {}) {
  return {
    code,
    caseId: safeIdentity(options.caseId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    runnerId: safeIdentity(options.runnerId, /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/),
    classId: safeIdentity(options.classId, /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/),
    fieldPath: options.fieldPath || null,
    expectedDigest: Object.prototype.hasOwnProperty.call(options, 'expected') ? nullableDigest(options.expected) : null,
    observedDigest: Object.prototype.hasOwnProperty.call(options, 'observed') ? nullableDigest(options.observed) : null,
    inputIndex: Number.isInteger(options.inputIndex) && options.inputIndex >= 0 ? options.inputIndex : null,
  };
}

function schemaFailureCode(kind, errors) {
  const paths = (errors || []).map((error) => error.instancePath || '');
  if (kind === 'case' && paths.some((path) => path === '/provenance/licenseId')) return 'LICENSE_REJECTED';
  if (kind === 'case' && paths.some((path) => path.startsWith('/provenance/'))) return 'PROVENANCE_REJECTED';
  return kind === 'case' ? 'SCHEMA_INVALID_CASE' : 'SCHEMA_INVALID_RESULT';
}

function compileValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(buildSchema());
}

function validSpanInvariants(record) {
  const groups = record.format === 'ceragon.ai-security.neutral-evaluation-case'
    ? [record.expected && record.expected.findings, ...(record.expected ? [record.expected.transforms] : [])]
    : [record.findings, record.transforms];
  const findings = groups[0] || [];
  for (const finding of findings) {
    if (finding.source && finding.source.kind === 'CONTENT' && finding.span === null) return false;
    if (finding.source && finding.source.kind === 'FILE_METADATA' && finding.span !== null) return false;
    if (finding.span && finding.span.end < finding.span.start) return false;
  }
  const transforms = groups[1] || [];
  for (const transform of transforms) {
    for (const segment of transform.sourceMap || []) {
      if (segment.original.end < segment.original.start || segment.transformed.end < segment.transformed.start) return false;
    }
  }
  return true;
}

function validEffectInvariants(effects) {
  if (!effects) return false;
  if ((effects.adapterExpressedEffect !== null) !== (effects.translationDisposition === 'EXPRESSED')) return false;
  if ((effects.observedActualEffect !== null) !== (effects.actualEffectObserver !== 'NONE')) return false;
  return true;
}

function validateCaseProvenance(record) {
  if (record.provenance.sourcePlane !== record.split) return 'PROVENANCE_REJECTED';
  if (!LICENSES_BY_PLANE[record.split] || !LICENSES_BY_PLANE[record.split].has(record.provenance.licenseId)) return 'LICENSE_REJECTED';
  if (!TRUST_BY_PLANE[record.split] || !TRUST_BY_PLANE[record.split].has(record.provenance.trust)) return 'PROVENANCE_REJECTED';
  return null;
}

function sortCanonical(values) {
  return [...values].sort((left, right) => {
    const a = canonicalizeJcs(left);
    const b = canonicalizeJcs(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function addComparisonFailure(failures, code, record, classId, fieldPath, expected, observed) {
  failures.push(makeFailure(code, {
    caseId: record.caseId,
    runnerId: record.runner.runnerId,
    classId,
    fieldPath,
    expected,
    observed,
  }));
}

function compareFindings(expected, observed, record, failures) {
  const usedObserved = new Set();
  const unmatchedExpected = [];
  const exactMatches = [];
  for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex++) {
    const expectedFinding = expected[expectedIndex];
    let match = -1;
    for (let observedIndex = 0; observedIndex < observed.length; observedIndex++) {
      if (!usedObserved.has(observedIndex) && stableEqual(expectedFinding, observed[observedIndex])) {
        match = observedIndex;
        break;
      }
    }
    if (match >= 0) {
      usedObserved.add(match);
      exactMatches.push({ expectedIndex, observedIndex: match });
    } else {
      unmatchedExpected.push(expectedIndex);
    }
  }
  for (const expectedIndex of unmatchedExpected) {
    const expectedFinding = expected[expectedIndex];
    const observedIndex = observed.findIndex((candidate, index) =>
      !usedObserved.has(index) && candidate.classId === expectedFinding.classId);
    failures.push(makeFailure('MISSED_FINDING', {
      caseId: record.caseId,
      runnerId: record.runner.runnerId,
      classId: expectedFinding.classId,
      fieldPath: `/findings/${expectedIndex}`,
      expected: expectedFinding,
      observed: null,
    }));
    if (observedIndex < 0) continue;
    usedObserved.add(observedIndex);
    const actual = observed[observedIndex];
    failures.push(makeFailure('FALSE_FINDING', {
      caseId: record.caseId,
      runnerId: record.runner.runnerId,
      classId: actual.classId,
      fieldPath: `/findings/${observedIndex}`,
      expected: null,
      observed: actual,
    }));
    const checks = [
      ['WRONG_RULE', 'ruleId'],
      ['WRONG_SPAN', 'span'],
      ['WRONG_EVIDENCE_TIER', 'evidenceTier'],
      ['WRONG_ELIGIBILITY', 'enforcementEligible'],
      ['WRONG_CREDENTIAL_ROLE', 'credentialRole'],
      ['WRONG_EXPLOITABILITY', 'exploitability'],
      ['WRONG_REPRESENTATION', 'representationId'],
    ];
    for (const [code, field] of checks) {
      if (!stableEqual(expectedFinding[field], actual[field])) {
        addComparisonFailure(
          failures,
          code,
          record,
          expectedFinding.classId,
          `/findings/${observedIndex}/${field}`,
          expectedFinding[field],
          actual[field],
        );
      }
    }
  }
  for (let observedIndex = 0; observedIndex < observed.length; observedIndex++) {
    if (usedObserved.has(observedIndex)) continue;
    const actual = observed[observedIndex];
    failures.push(makeFailure('FALSE_FINDING', {
      caseId: record.caseId,
      runnerId: record.runner.runnerId,
      classId: actual.classId,
      fieldPath: `/findings/${observedIndex}`,
      expected: null,
      observed: actual,
    }));
  }
  return { exactMatches, unmatchedExpected, usedObserved };
}

function compareBoolean(expected, observed, falseCode, missedCode, pathName, record, failures) {
  if (expected === observed) return;
  failures.push(makeFailure(observed ? falseCode : missedCode, {
    caseId: record.caseId,
    runnerId: record.runner.runnerId,
    fieldPath: `/intervention/${pathName}`,
    expected,
    observed,
  }));
}

function compareResult(caseRecord, result, failures) {
  const before = failures.length;
  compareFindings(caseRecord.expected.findings, result.findings, result, failures);
  if (!stableEqual(caseRecord.expected.decision, result.decision)) {
    addComparisonFailure(failures, 'DECISION_MISMATCH', result, null, '/decision', caseRecord.expected.decision, result.decision);
  }
  if (!stableEqual(sortCanonical(caseRecord.expected.obligations), sortCanonical(result.obligations))) {
    addComparisonFailure(failures, 'OBLIGATION_MISMATCH', result, null, '/obligations', caseRecord.expected.obligations, result.obligations);
  }
  if (!stableEqual(caseRecord.expected.effects, result.effects)) {
    addComparisonFailure(failures, 'EFFECT_MISMATCH', result, null, '/effects', caseRecord.expected.effects, result.effects);
    if (
      caseRecord.expected.effects.securityOutcome !== result.effects.securityOutcome ||
      caseRecord.expected.effects.certifiedSecurityOutcome !== result.effects.certifiedSecurityOutcome
    ) {
      addComparisonFailure(failures, 'OUTCOME_MISMATCH', result, null, '/effects/securityOutcome', {
        securityOutcome: caseRecord.expected.effects.securityOutcome,
        certifiedSecurityOutcome: caseRecord.expected.effects.certifiedSecurityOutcome,
      }, {
        securityOutcome: result.effects.securityOutcome,
        certifiedSecurityOutcome: result.effects.certifiedSecurityOutcome,
      });
    }
  }
  if (!stableEqual(caseRecord.expected.transforms, result.transforms)) {
    addComparisonFailure(failures, 'TRANSFORM_MISMATCH', result, null, '/transforms', caseRecord.expected.transforms, result.transforms);
  }
  if (!stableEqual(caseRecord.expected.completeness, result.completeness)) {
    addComparisonFailure(failures, 'COMPLETENESS_MISMATCH', result, null, '/completeness', caseRecord.expected.completeness, result.completeness);
  }
  compareBoolean(caseRecord.expected.intervention.visible, result.intervention.visible, 'FALSE_INTERVENTION', 'MISSED_INTERVENTION', 'visible', result, failures);
  compareBoolean(caseRecord.expected.intervention.hardStop, result.intervention.hardStop, 'FALSE_HARD_STOP', 'MISSED_HARD_STOP', 'hardStop', result, failures);
  compareBoolean(caseRecord.expected.intervention.socIncident, result.intervention.socIncident, 'FALSE_SOC_INCIDENT', 'MISSED_SOC_INCIDENT', 'socIncident', result, failures);
  if (!stableEqual(caseRecord.expected.finalState, result.finalState)) {
    addComparisonFailure(failures, 'FINAL_STATE_MISMATCH', result, null, '/finalState', caseRecord.expected.finalState, result.finalState);
  }
  const budget = caseRecord.expected.resourceBudget;
  const usage = result.resourceUsage;
  const budgetExceeded =
    usage.cpuMs > budget.maxCpuMs ||
    usage.wallMs > budget.maxWallMs ||
    usage.memoryBytes > budget.maxMemoryBytes ||
    usage.inputBytes > budget.maxInputBytes ||
    usage.outputBytes > budget.maxOutputBytes ||
    usage.findingCount > budget.maxFindings ||
    usage.findingCount !== result.findings.length;
  if (budgetExceeded) {
    addComparisonFailure(failures, 'RESOURCE_BUDGET_EXCEEDED', result, null, '/resourceUsage', budget, usage);
  }
  if (budget.expectExhaustion !== usage.exhausted) {
    addComparisonFailure(failures, 'RESOURCE_EXHAUSTION_MISMATCH', result, null, '/resourceUsage/exhausted', budget.expectExhaustion, usage.exhausted);
  }
  return failures.length === before;
}

function logGamma(value) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  let x = 0.99999999999980993;
  const z = value - 1;
  for (let index = 0; index < coefficients.length; index++) x += coefficients[index] / (z + index + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaInverse(probability, a, b) {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 100; iteration++) {
    const middle = (low + high) / 2;
    if (regularizedBeta(middle, a, b) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function lowerOneSided(successes, trials, alpha) {
  if (trials <= 0) return null;
  if (successes <= 0) return 0;
  return betaInverse(alpha, successes, trials - successes + 1);
}

function upperOneSided(failures, trials, alpha) {
  if (trials <= 0) return null;
  if (failures >= trials) return 1;
  return betaInverse(1 - alpha, failures + 1, trials - failures);
}

function effectiveSize(weights) {
  if (weights.length === 0) return 0;
  const sum = weights.reduce((total, value) => total + value, 0);
  const sumSquares = weights.reduce((total, value) => total + value * value, 0);
  return sumSquares === 0 ? 0 : (sum * sum) / sumSquares;
}

function buildMetric(cases, resultsByCase, exactFindingKeys, dimension, familySize) {
  const selected = cases.filter((record) => dimension.surface === null || record.context.surface === dimension.surface);
  const clusters = new Map();
  for (const record of selected) {
    if (!clusters.has(record.clusterId)) clusters.set(record.clusterId, []);
    clusters.get(record.clusterId).push(record);
  }
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let benign = 0;
  let benignFalsePositives = 0;
  let falseHardStops = 0;
  for (const clusterCases of clusters.values()) {
    let positive = false;
    let exact = true;
    let anyObserved = false;
    let clusterBenign = true;
    let hardStop = false;
    for (const record of clusterCases) {
      clusterBenign = clusterBenign && record.label === 'BENIGN';
      const expected = record.expected.findings.filter((finding) =>
        (dimension.classId === null || finding.classId === dimension.classId) &&
        (dimension.representationId === null || finding.representationId === dimension.representationId));
      const caseResults = resultsByCase.get(record.caseId) || [];
      if (expected.length > 0) positive = true;
      if (expected.length > 0 && caseResults.length === 0) exact = false;
      for (const result of caseResults) {
        const observed = result.findings.filter((finding) =>
          (dimension.classId === null || finding.classId === dimension.classId) &&
          (dimension.representationId === null || finding.representationId === dimension.representationId));
        anyObserved = anyObserved || observed.length > 0;
        hardStop = hardStop || result.intervention.hardStop;
        for (const expectedFinding of expected) {
          const key = `${record.caseId}\u0000${result.runner.runnerId}\u0000${digestValue(expectedFinding)}`;
          if (!exactFindingKeys.has(key)) exact = false;
        }
        if (expected.length === 0 && observed.length > 0) exact = false;
      }
    }
    if (positive && exact) tp++;
    if (positive && !exact) fn++;
    if ((!positive && anyObserved) || (positive && anyObserved && !exact)) fp++;
    if (!positive && !anyObserved) tn++;
    if (clusterBenign) {
      benign++;
      if ((!positive && anyObserved) || (positive && anyObserved && !exact)) benignFalsePositives++;
      if (hardStop) falseHardStops++;
    }
  }
  const weights = [...clusters.keys()].map(() => 1);
  const nEff = effectiveSize(weights);
  const precisionTrials = tp + fp;
  const recallTrials = tp + fn;
  const adjustedAlpha = 0.05 / Math.max(1, familySize);
  return {
    classId: dimension.classId,
    representationId: dimension.representationId,
    surface: dimension.surface,
    sampleCases: selected.length,
    independentClusters: clusters.size,
    effectiveClusterSize: nEff,
    truePositiveClusters: tp,
    falsePositiveClusters: fp,
    falseNegativeClusters: fn,
    trueNegativeClusters: tn,
    benignClusters: benign,
    benignFalsePositiveClusters: benignFalsePositives,
    falseHardStopClusters: falseHardStops,
    precision: precisionTrials === 0 ? null : tp / precisionTrials,
    precisionLowerBound: precisionTrials === 0 ? null : lowerOneSided(tp, precisionTrials, adjustedAlpha),
    recall: recallTrials === 0 ? null : tp / recallTrials,
    recallLowerBound: recallTrials === 0 ? null : lowerOneSided(tp, recallTrials, adjustedAlpha),
    missRate: recallTrials === 0 ? null : fn / recallTrials,
    missRateUpperBound: recallTrials === 0 ? null : upperOneSided(fn, recallTrials, adjustedAlpha),
    falsePositiveRate: benign === 0 ? null : benignFalsePositives / benign,
    falsePositiveRateUpperBound: benign === 0 ? null : upperOneSided(benignFalsePositives, benign, adjustedAlpha),
    falseHardStopRate: benign === 0 ? null : falseHardStops / benign,
    falseHardStopRateUpperBound: benign === 0 ? null : upperOneSided(falseHardStops, benign, adjustedAlpha),
    unadjustedAlpha: 0.05,
    adjustedAlpha,
    adjustmentMethod: 'HOLM_CONSERVATIVE_FIRST_STEP',
  };
}

function summarizeFailures(failures, exactResults) {
  const count = (codes) => failures.filter((failure) => codes.has(failure.code)).length;
  return {
    exactResults,
    missedFindings: count(new Set(['MISSED_FINDING'])),
    falseFindings: count(new Set(['FALSE_FINDING'])),
    falseInterventions: count(new Set(['FALSE_INTERVENTION'])),
    falseHardStops: count(new Set(['FALSE_HARD_STOP'])),
    falseSocIncidents: count(new Set(['FALSE_SOC_INCIDENT'])),
    wrongSpans: count(new Set(['WRONG_SPAN'])),
    wrongRules: count(new Set(['WRONG_RULE'])),
    wrongEvidenceTiers: count(new Set(['WRONG_EVIDENCE_TIER'])),
    wrongEligibility: count(new Set(['WRONG_ELIGIBILITY'])),
    wrongCredentialRoles: count(new Set(['WRONG_CREDENTIAL_ROLE'])),
    wrongExploitability: count(new Set(['WRONG_EXPLOITABILITY'])),
    wrongRepresentations: count(new Set(['WRONG_REPRESENTATION'])),
    decisionFailures: count(new Set(['DECISION_MISMATCH'])),
    obligationFailures: count(new Set(['OBLIGATION_MISMATCH'])),
    transformFailures: count(new Set(['TRANSFORM_MISMATCH'])),
    outcomeFailures: count(new Set(['OUTCOME_MISMATCH', 'EFFECT_MISMATCH'])),
    completenessFailures: count(new Set(['COMPLETENESS_MISMATCH'])),
    finalStateFailures: count(new Set(['FINAL_STATE_MISMATCH'])),
    resourceFailures: count(new Set(['RESOURCE_BUDGET_EXCEEDED', 'RESOURCE_EXHAUSTION_MISMATCH'])),
    differentialFailures: count(new Set(['DIFFERENTIAL_MISMATCH'])),
    validationFailures: count(VALIDATION_CODES),
  };
}

function scoreRecords(caseRecords, resultRecords) {
  const validate = compileValidator();
  const failures = [];
  const acceptedCases = [];
  const acceptedResults = [];
  const caseIds = new Set();
  const resultKeys = new Set();

  for (let inputIndex = 0; inputIndex < caseRecords.length; inputIndex++) {
    const record = caseRecords[inputIndex];
    const valid = validate(record) && record.format === 'ceragon.ai-security.neutral-evaluation-case';
    if (!valid || !validSpanInvariants(record) || !validEffectInvariants(record.expected && record.expected.effects)) {
      failures.push(makeFailure(schemaFailureCode('case', validate.errors), {
        caseId: record && record.caseId,
        fieldPath: null,
        inputIndex,
      }));
      continue;
    }
    const provenanceFailure = validateCaseProvenance(record);
    if (provenanceFailure) {
      failures.push(makeFailure(provenanceFailure, { caseId: record.caseId, inputIndex }));
      continue;
    }
    if (record.caseDigest !== caseDigest(record)) {
      failures.push(makeFailure('CASE_DIGEST_MISMATCH', { caseId: record.caseId, fieldPath: '/caseDigest', inputIndex }));
      continue;
    }
    if (caseIds.has(record.caseId)) {
      failures.push(makeFailure('DUPLICATE_CASE', { caseId: record.caseId, inputIndex }));
      continue;
    }
    caseIds.add(record.caseId);
    acceptedCases.push(record);
  }

  const caseById = new Map(acceptedCases.map((record) => [record.caseId, record]));
  for (let inputIndex = 0; inputIndex < resultRecords.length; inputIndex++) {
    const record = resultRecords[inputIndex];
    const valid = validate(record) && record.format === 'ceragon.ai-security.neutral-evaluation-result';
    if (!valid || !validSpanInvariants(record) || !validEffectInvariants(record.effects)) {
      failures.push(makeFailure(schemaFailureCode('result', validate.errors), {
        caseId: record && record.caseId,
        runnerId: record && record.runner && record.runner.runnerId,
        inputIndex,
      }));
      continue;
    }
    if (record.resultDigest !== resultDigest(record)) {
      failures.push(makeFailure('RESULT_DIGEST_MISMATCH', {
        caseId: record.caseId,
        runnerId: record.runner.runnerId,
        fieldPath: '/resultDigest',
        inputIndex,
      }));
      continue;
    }
    if (record.semanticDigest !== semanticDigest(record)) {
      failures.push(makeFailure('SEMANTIC_DIGEST_MISMATCH', {
        caseId: record.caseId,
        runnerId: record.runner.runnerId,
        fieldPath: '/semanticDigest',
        inputIndex,
      }));
      continue;
    }
    const key = `${record.caseId}\u0000${record.runner.runnerId}`;
    if (resultKeys.has(key)) {
      failures.push(makeFailure('DUPLICATE_RESULT', {
        caseId: record.caseId,
        runnerId: record.runner.runnerId,
        inputIndex,
      }));
      continue;
    }
    resultKeys.add(key);
    const caseRecord = caseById.get(record.caseId);
    if (!caseRecord) {
      failures.push(makeFailure('UNKNOWN_CASE_RESULT', {
        caseId: record.caseId,
        runnerId: record.runner.runnerId,
        inputIndex,
      }));
      continue;
    }
    if (
      record.semanticBaseCaseId !== caseRecord.semanticBaseCaseId ||
      record.clusterId !== caseRecord.clusterId ||
      record.provenance.inputArtifactDigest !== caseRecord.input.artifactDigest
    ) {
      failures.push(makeFailure('RESULT_CASE_MISMATCH', {
        caseId: record.caseId,
        runnerId: record.runner.runnerId,
        inputIndex,
      }));
      continue;
    }
    acceptedResults.push(record);
  }

  const baseIdentity = new Map();
  for (const record of acceptedCases) {
    const prior = baseIdentity.get(record.semanticBaseCaseId);
    const identity = `${record.clusterId}\u0000${record.split}`;
    if (prior !== undefined && prior !== identity) {
      failures.push(makeFailure('CLUSTER_SPLIT_DRIFT', { caseId: record.caseId }));
    } else {
      baseIdentity.set(record.semanticBaseCaseId, identity);
    }
  }

  const runners = [...new Set(acceptedResults.map((record) => record.runner.runnerId))].sort();
  for (const caseRecord of acceptedCases) {
    if (runners.length === 0) {
      failures.push(makeFailure('MISSING_RESULT', { caseId: caseRecord.caseId }));
      continue;
    }
    for (const runnerId of runners) {
      if (!resultKeys.has(`${caseRecord.caseId}\u0000${runnerId}`)) {
        failures.push(makeFailure('MISSING_RESULT', { caseId: caseRecord.caseId, runnerId }));
      }
    }
  }

  const resultsByCase = new Map();
  const exactResultKeys = new Set();
  const exactFindingKeys = new Set();
  let exactResults = 0;
  for (const record of acceptedResults) {
    if (!resultsByCase.has(record.caseId)) resultsByCase.set(record.caseId, []);
    resultsByCase.get(record.caseId).push(record);
    const caseRecord = caseById.get(record.caseId);
    const before = failures.length;
    const exact = compareResult(caseRecord, record, failures);
    if (exact) {
      exactResults++;
      exactResultKeys.add(`${record.caseId}\u0000${record.runner.runnerId}`);
    }
    for (const finding of caseRecord.expected.findings) {
      if (record.findings.some((candidate) => stableEqual(candidate, finding))) {
        exactFindingKeys.add(`${record.caseId}\u0000${record.runner.runnerId}\u0000${digestValue(finding)}`);
      }
    }
    if (failures.length < before) throw new Error('scorer failure count moved backwards');
  }

  let comparedCases = 0;
  let differentialMismatches = 0;
  for (const [caseId, results] of resultsByCase.entries()) {
    if (results.length < 2) continue;
    comparedCases++;
    const reference = results[0];
    for (const candidate of results.slice(1)) {
      if (candidate.semanticDigest !== reference.semanticDigest) {
        differentialMismatches++;
        failures.push(makeFailure('DIFFERENTIAL_MISMATCH', {
          caseId,
          runnerId: candidate.runner.runnerId,
          fieldPath: '/semanticDigest',
          expected: reference.semanticDigest,
          observed: candidate.semanticDigest,
        }));
      }
    }
  }

  const clusterMap = new Map();
  for (const record of acceptedCases) {
    if (!clusterMap.has(record.clusterId)) clusterMap.set(record.clusterId, []);
    clusterMap.get(record.clusterId).push(record);
  }
  const clusterStats = [...clusterMap.entries()].map(([clusterId, records]) => {
    const resultCount = records.reduce((total, record) => total + (resultsByCase.get(record.caseId) || []).length, 0);
    const exact = records.every((record) => {
      const caseResults = resultsByCase.get(record.caseId) || [];
      return caseResults.length === runners.length && caseResults.every((result) => exactResultKeys.has(`${record.caseId}\u0000${result.runner.runnerId}`));
    });
    return {
      clusterId,
      caseCount: records.length,
      semanticBaseCaseCount: new Set(records.map((record) => record.semanticBaseCaseId)).size,
      resultCount,
      exact,
      weight: 1,
    };
  }).sort((left, right) => left.clusterId.localeCompare(right.clusterId));

  const dimensionsByKey = new Map();
  for (const caseRecord of acceptedCases) {
    const findings = [
      ...caseRecord.expected.findings,
      ...(resultsByCase.get(caseRecord.caseId) || []).flatMap((record) => record.findings),
    ];
    for (const finding of findings) {
      const dimension = {
        classId: finding.classId,
        representationId: finding.representationId || caseRecord.representation.representationId,
        surface: caseRecord.context.surface,
      };
      dimensionsByKey.set(canonicalizeJcs(dimension), dimension);
    }
  }
  const dimensions = [...dimensionsByKey.values()].sort((left, right) => canonicalizeJcs(left).localeCompare(canonicalizeJcs(right)));
  const familySizes = new Map();
  for (const dimension of dimensions) {
    const family = `${dimension.classId}\u0000${dimension.surface}`;
    familySizes.set(family, (familySizes.get(family) || 0) + 1);
  }
  const metrics = dimensions.map((dimension) => buildMetric(
    acceptedCases,
    resultsByCase,
    exactFindingKeys,
    dimension,
    familySizes.get(`${dimension.classId}\u0000${dimension.surface}`),
  ));
  const overall = buildMetric(
    acceptedCases,
    resultsByCase,
    exactFindingKeys,
    { classId: null, representationId: null, surface: null },
    1,
  );

  failures.sort((left, right) => canonicalizeJcs(left).localeCompare(canonicalizeJcs(right)));
  const report = {
    format: 'ceragon.ai-security.neutral-evaluation-scorer-report',
    formatVersion: 1,
    reportDigest: `sha256:${'0'.repeat(64)}`,
    contractVersion: CONTRACT_VERSION,
    scorerVersion: SCORER_VERSION,
    caseSetDigest: digestValue(sortCanonical(acceptedCases.map((record) => record.caseDigest))),
    resultSetDigest: digestValue(sortCanonical(acceptedResults.map((record) => record.resultDigest))),
    analysis: {
      confidenceLevel: 0.95,
      alpha: 0.05,
      clusterUnit: 'semantic-cluster',
      effectiveSizeFormula: '(sum(w)^2)/sum(w^2),equal-total-weight-per-cluster,floor-for-intervals',
      intervalMethod: 'EXACT_ONE_SIDED_CLOPPER_PEARSON',
      adjustmentMethod: 'HOLM_CONSERVATIVE_FIRST_STEP',
    },
    validation: {
      acceptedCases: acceptedCases.length,
      rejectedCases: caseRecords.length - acceptedCases.length,
      acceptedResults: acceptedResults.length,
      rejectedResults: resultRecords.length - acceptedResults.length,
    },
    summary: summarizeFailures(failures, exactResults),
    clusters: {
      caseCount: acceptedCases.length,
      semanticBaseCaseCount: new Set(acceptedCases.map((record) => record.semanticBaseCaseId)).size,
      clusterCount: clusterMap.size,
      duplicateVariantCount: acceptedCases.length - new Set(acceptedCases.map((record) => record.semanticBaseCaseId)).size,
      effectiveClusterSize: effectiveSize(clusterStats.map((record) => record.weight)),
      stats: clusterStats,
    },
    metrics: { overall, byClassRepresentationSurface: metrics },
    differential: { comparedCases, mismatches: differentialMismatches },
    failures,
    pass: failures.length === 0,
  };
  report.reportDigest = reportDigest(report);
  const reportValid = validate(report);
  if (!reportValid) throw new Error(`scorer produced invalid report: ${JSON.stringify(validate.errors)}`);
  return report;
}

module.exports = {
  betaInverse,
  lowerOneSided,
  scoreRecords,
  upperOneSided,
};
