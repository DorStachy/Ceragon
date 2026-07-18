'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const {
  buildF01Catalog,
  buildO01Catalog,
} = require('./lib/ai-security-o01-f01-catalogs.cjs');
const { parseStrictJsonBytes } = require('./lib/strict-json.cjs');

const packageRoot = path.resolve(__dirname, '..');
const contracts = require(path.join(packageRoot, 'dist', 'index.js'));
const { canonicalizeJcs } = require(path.join(packageRoot, 'dist', 'sqs-signer.js'));

function read(relative) {
  return parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, relative)));
}

function compile(schema) {
  const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: true });
  return ajv.compile(schema);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function digestCanonical(value) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(Buffer.from(canonicalizeJcs(value), 'utf8'))
    .digest('hex')}`;
}

function assertNoDefault(value, at = '$') {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key.toLowerCase(), 'default', `implicit default at ${at}.${key}`);
    assertNoDefault(child, `${at}.${key}`);
  }
}

const obligationSchema = read('schemas/ai-security-obligation-contract-v1.schema.json');
const failureSchema = read('schemas/ai-security-failure-oracle-v1.schema.json');
const obligationCatalog = read('fixtures/ai-security-obligation-contract.v1.json');
const failureCatalog = read('fixtures/ai-security-failure-oracle.v1.json');
const validateObligationCatalog = compile(obligationSchema);
const validateFailureCatalog = compile(failureSchema);

assert.equal(
  validateObligationCatalog(obligationCatalog),
  true,
  JSON.stringify(validateObligationCatalog.errors),
);
assert.equal(
  validateFailureCatalog(failureCatalog),
  true,
  JSON.stringify(validateFailureCatalog.errors),
);

assert.deepEqual(
  obligationCatalog,
  buildO01Catalog(contracts, canonicalizeJcs),
  'O01 fixture is stale relative to the closed catalog builder',
);
assert.deepEqual(
  failureCatalog,
  buildF01Catalog(contracts),
  'F01 fixture is stale relative to the closed catalog builder',
);

const exactTuples = {
  AI_OBLIGATION_KINDS: [
    'AUDIT',
    'NOTIFY',
    'SANITIZE',
    'RESTRICT_CAPABILITY',
    'REQUIRE_CONFIRMATION',
    'REQUIRE_DELEGATED_APPROVAL',
    'DENY',
    'QUARANTINE',
  ],
  AI_OBLIGATION_STATES: [
    'REQUIRED',
    'SATISFIED',
    'UNSATISFIED',
    'UNSUPPORTED',
    'SUPERSEDED',
    'FAILED',
  ],
  AI_PRIMARY_STATES: [
    'SCANNING',
    'CONTINUED_SAFELY',
    'SANITIZED_AND_CONTINUED',
    'CONTINUED_WITH_RESTRICTION',
    'NEEDS_CONFIRMATION',
    'APPROVAL_REQUESTED',
    'BLOCKED_BEFORE_EFFECT',
    'PROTECTION_DEGRADED',
  ],
  AI_INSPECTION_STATUSES: [
    'COMPLETE',
    'PARTIAL',
    'UNSUPPORTED',
    'BUDGET_EXCEEDED',
    'PARSER_FAILED',
    'ENCRYPTED',
    'TIMED_OUT',
    'NOT_APPLICABLE',
  ],
  AI_FAILURE_ORACLE_SURFACES: [
    'RUNTIME_ADAPTER',
    'LOCAL_PROXY',
    'BROWSER_COMPOSER',
    'BROWSER_UPLOAD',
  ],
  AI_FAILURE_ORACLE_CHECKPOINTS: [
    'PRE_PROMPT',
    'PRE_TOOL',
    'POST_TOOL',
    'PRE_UPSTREAM_DISPATCH',
    'POST_UPSTREAM_RESPONSE',
    'PRE_SUBMIT',
    'POST_SUBMIT',
    'PRE_UPLOAD_DISPATCH',
    'POST_UPLOAD_DISPATCH',
  ],
  AI_FAILURE_ORACLE_FAILURES: [
    'POLICY_UNAVAILABLE',
    'POLICY_INVALID',
    'POLICY_EXPIRED',
    'PARTIAL',
    'UNSUPPORTED',
    'BUDGET_EXCEEDED',
    'PARSER_FAILED',
    'ENCRYPTED',
    'TIMED_OUT',
    'EFFECT_EXTRACTION_INCOMPLETE',
    'UNSUPPORTED_EFFECT',
    'TRANSLATION_FAILED',
    'RUNTIME_ACK_MISSING',
    'INTERVENTION_UNAVAILABLE',
  ],
  AI_FAILURE_ORACLE_IMPACTS: [
    'LOW_IMPACT',
    'SENSITIVE_DATA',
    'ACTIVE_SECRET',
    'FORBIDDEN_DESTINATION',
    'DESTRUCTIVE_OR_PRIVILEGED',
    'APPROVAL_REQUIRED',
    'TRUST_INTEGRITY',
  ],
  AI_FAILURE_ORACLE_OUTCOMES: [
    'PROCEED_OBSERVED_ONLY',
    'RESTRICT_CAPABILITY',
    'REQUIRE_CONFIRMATION',
    'HOLD',
    'DENY',
  ],
};

for (const [symbol, expected] of Object.entries(exactTuples)) {
  assert.deepEqual(contracts[symbol], expected, `${symbol} changed`);
  assert.equal(Object.isFrozen(contracts[symbol]), true, `${symbol} is not frozen`);
}

assert.deepEqual(obligationCatalog.orderedTuples, {
  obligationKinds: exactTuples.AI_OBLIGATION_KINDS,
  obligationStates: exactTuples.AI_OBLIGATION_STATES,
  primaryStates: exactTuples.AI_PRIMARY_STATES,
  inspectionStatuses: exactTuples.AI_INSPECTION_STATUSES,
});

assert.deepEqual(
  obligationCatalog.obligationUnionCases.map((item) => item.kind),
  exactTuples.AI_OBLIGATION_KINDS,
);
for (const obligation of obligationCatalog.obligationUnionCases) {
  assert.equal(obligation.parametersDigest, digestCanonical(obligation.parameters));
  assert.equal(
    obligation.obligationId,
    `${obligation.sourceRuleId}:${obligation.kind.toLowerCase()}:0`,
  );
}

assert.deepEqual(
  obligationCatalog.v2ToV1DownConversion.map((row) => [
    row.terminalRequirement,
    row.v1Decision,
  ]),
  [
    ['NON_GRANTABLE_DENY', 'BLOCK'],
    ['QUARANTINE_OR_DELEGATED_APPROVAL', 'HOLD'],
    ['LOCAL_CONFIRMATION', 'PROMPT'],
    ['SATISFIABLE_SANITIZE', 'ALLOW'],
    ['SATISFIABLE_RESTRICTION', 'ALLOW'],
    ['AUDIT_NOTIFY_ONLY', 'ALLOW'],
    ['INSPECTION_OR_EFFECT_INCOMPLETE', 'INCONCLUSIVE'],
    ['POLICY_AWAITING_AUTHORITY', 'PENDING'],
  ],
);
assert.equal(
  obligationCatalog.v2ToV1DownConversion.every(
    (row) => row.onUnsupported === 'FAILURE_ORACLE',
  ),
  true,
);

assert.deepEqual(
  obligationCatalog.combiner.phaseOrder,
  [
    'HARD_FLOORS',
    'AUDIT_NOTIFY_RESTRICTION_UNION',
    'TRANSFORM_ACCUMULATION',
    'CONFIRMATION_APPROVAL_PRESERVATION',
    'NON_GRANTABLE_DENY',
  ],
);
assert.equal(obligationCatalog.combiner.lowerScopeMayRemove, false);
assert.equal(obligationCatalog.combiner.incompatibleTransforms.mayDrop, false);
assert.equal(
  obligationCatalog.combiner.denySupersession.auditAndNotifyStillExecute,
  true,
);
const transformConflict = obligationCatalog.combinerCases.find(
  (row) => row.id === 'incompatible-transform-pair',
);
assert.equal(transformConflict.actionResolution, 'FAILURE_ORACLE');
assert.deepEqual(
  transformConflict.expectedUnsatisfiedObligationIds,
  transformConflict.expectedOrderedObligationIds,
);
const denyCase = obligationCatalog.combinerCases.find(
  (row) => row.id === 'deny-selective-supersession',
);
assert.equal(denyCase.actionResolution, 'DENY');
assert.equal(denyCase.supersessionEdges.length, 2);

const expectedCheckpointKeys = [];
for (const surface of contracts.AI_FAILURE_ORACLE_SURFACES) {
  for (const checkpoint of contracts.AI_FAILURE_ORACLE_SURFACE_CHECKPOINTS[surface]) {
    expectedCheckpointKeys.push(`${surface}|${checkpoint}`);
  }
}
assert.deepEqual(
  obligationCatalog.legacyWarnByCheckpoint.map(
    (row) => `${row.surface}|${row.checkpoint}`,
  ),
  expectedCheckpointKeys,
);
const codexWarn = obligationCatalog.legacyWarnByCheckpoint.find(
  (row) =>
    row.surface === 'RUNTIME_ADAPTER' && row.checkpoint === 'PRE_TOOL',
);
assert.deepEqual(codexWarn, {
  surface: 'RUNTIME_ADAPTER',
  checkpoint: 'PRE_TOOL',
  semantic: 'UNSUPPORTED',
  v1Decision: 'INCONCLUSIVE',
  requestedEffect: null,
  trustedSurface: null,
  onUnsupported: 'FAILURE_ORACLE',
});

assert.deepEqual(
  obligationCatalog.unsupportedMatrix
    .filter((row) => row.obligationKind !== null)
    .map((row) => row.obligationKind),
  exactTuples.AI_OBLIGATION_KINDS,
);
assert.equal(
  obligationCatalog.unsupportedMatrix.every(
    (row) =>
      row.resultState === 'UNSUPPORTED' &&
      row.includeInUnsatisfiedIds === true &&
      row.mayDrop === false &&
      row.mayRankAllow === false &&
      row.resolution === 'FAILURE_ORACLE',
  ),
  true,
);

assert.deepEqual(failureCatalog.authority, {
  decisionId: 'G-FAIL-ORACLE',
  approvalEventSha256:
    'sha256:2762f5819ed206d24abf435f4218cba4d05cfe8d458236598606a4d480c44eab',
  approvalRecordedAt: '2026-07-16T10:20:06Z',
  representedAuthorities: [
    'Product/Architecture',
    'Security/CISO',
    'Product',
    'Privacy',
  ],
  basis: 'BLUEPRINT_IR0_12_APPROVED_WRITTEN_RULE',
  restoration: 'P0_G02_RECORD_RESTORED_FROM_APPROVED_WRITTEN_RULE',
});

const expectedRows = [];
for (const surface of contracts.AI_FAILURE_ORACLE_SURFACES) {
  for (const checkpoint of contracts.AI_FAILURE_ORACLE_SURFACE_CHECKPOINTS[surface]) {
    for (const failure of contracts.AI_FAILURE_ORACLE_FAILURES) {
      for (const impact of contracts.AI_FAILURE_ORACLE_IMPACTS) {
        expectedRows.push(`${surface}|${checkpoint}|${failure}|${impact}`);
      }
    }
  }
}
assert.equal(expectedRows.length, 882);
assert.deepEqual(
  failureCatalog.rows.map(
    (row) =>
      `${row.surface}|${row.checkpoint}|${row.failure}|${row.impact}`,
  ),
  expectedRows,
);
assert.equal(new Set(expectedRows).size, failureCatalog.rows.length);

const post = new Set([
  'POST_TOOL',
  'POST_UPSTREAM_RESPONSE',
  'POST_SUBMIT',
  'POST_UPLOAD_DISPATCH',
]);
const hardImpacts = new Set([
  'ACTIVE_SECRET',
  'FORBIDDEN_DESTINATION',
  'DESTRUCTIVE_OR_PRIVILEGED',
  'APPROVAL_REQUIRED',
  'TRUST_INTEGRITY',
]);
const trustFailures = new Set(['POLICY_INVALID', 'POLICY_EXPIRED']);
for (const row of failureCatalog.rows) {
  if (post.has(row.checkpoint)) {
    assert.equal(
      ['PROCEED_OBSERVED_ONLY', 'RESTRICT_CAPABILITY'].includes(row.outcome),
      true,
    );
    assert.equal(row.primaryState, 'PROTECTION_DEGRADED');
    assert.equal(['audit-only', 'restrict-capability'].includes(row.requestedEffect), true);
  } else if (hardImpacts.has(row.impact)) {
    assert.equal(['HOLD', 'DENY'].includes(row.outcome), true);
  }

  if (row.outcome === 'PROCEED_OBSERVED_ONLY') {
    assert.equal(row.impact, 'LOW_IMPACT');
    assert.equal(row.policyFailOpenRequired, true);
    assert.equal(row.nonGrantable, false);
    assert.equal(trustFailures.has(row.failure), false);
  } else {
    assert.equal(row.policyFailOpenRequired, false);
  }

  if (trustFailures.has(row.failure)) {
    assert.equal(row.nonGrantable, true);
    assert.equal(
      row.outcome,
      post.has(row.checkpoint) ? 'RESTRICT_CAPABILITY' : 'DENY',
    );
  }
}

assert.deepEqual(failureCatalog.invariants.runtimeAckMissing, {
  requestedEffect: 'PRESERVE_DECISION_REQUEST',
  adapterExpressedEffect: 'PRESERVE_VALID_ADAPTER_OUTPUT_OR_NULL',
  translationDisposition: 'PRESERVE_EMITTER_TRANSLATION_FACT',
  observedActualEffect: null,
  actualEffectObserver: 'NONE',
  securityOutcome: 'UNKNOWN',
});
assert.equal(
  failureCatalog.invariants.postCheckpointMayClaimRetroactivePrevention,
  false,
);
assertNoDefault(obligationCatalog);
assertNoDefault(failureCatalog);

const obligationExtra = clone(obligationCatalog);
obligationExtra.default = {};
assert.equal(validateObligationCatalog(obligationExtra), false);

const wrongParameters = clone(obligationCatalog);
wrongParameters.obligationUnionCases[0].parameters = {
  copyKey: 'ai.security.bad',
  audience: 'USER',
};
assert.equal(validateObligationCatalog(wrongParameters), false);

const emptyRestriction = clone(obligationCatalog);
const restriction = emptyRestriction.obligationUnionCases.find(
  (row) => row.kind === 'RESTRICT_CAPABILITY',
);
restriction.parameters = {
  capabilities: [],
  resourceRefs: [],
  destinationRefs: [],
};
assert.equal(validateObligationCatalog(emptyRestriction), false);

const crossSurface = clone(failureCatalog);
crossSurface.rows[0].checkpoint = 'PRE_SUBMIT';
assert.equal(validateFailureCatalog(crossSurface), false);

const missingEffect = clone(failureCatalog);
delete missingEffect.rows[0].requestedEffect;
assert.equal(validateFailureCatalog(missingEffect), false);

const retroactiveDeny = clone(failureCatalog);
const postRow = retroactiveDeny.rows.find((row) => post.has(row.checkpoint));
postRow.outcome = 'DENY';
assert.equal(validateFailureCatalog(retroactiveDeny), false);

const sensitiveFailOpen = clone(failureCatalog);
const proceedRow = sensitiveFailOpen.rows.find(
  (row) => row.outcome === 'PROCEED_OBSERVED_ONLY',
);
proceedRow.impact = 'SENSITIVE_DATA';
assert.equal(validateFailureCatalog(sensitiveFailOpen), false);

process.stdout.write(
  `P0-O01/P0-F01 contracts: PASS (8 obligations, 8 down-conversions, 9 WARN checkpoints, ${failureCatalog.rows.length} explicit oracle rows)\n`,
);
