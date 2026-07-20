'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseStrictJsonBytes } = require('./strict-json.cjs');

const PORTABLE_ARTIFACT_SHA256 =
  'sha256:096d6c8f181408bb60a1440173f04efdd99764736d97d01169decdecad0c6feb';

const READER_SEMANTIC_CASE_IDS = Object.freeze([
  'CURRENT_V1_ACCEPTED_RANKABLE',
  'LEGACY_N_MINUS_ONE_ACCEPTED',
  'PROTOCOL_2_READABLE_WITH_WRITER_DISABLED',
  'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE',
  'ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE',
  'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW',
  'MISSING_REQUIRED_FIELDS_INVALID',
  'KNOWN_FIELD_WRONG_TYPE_INVALID',
]);
const FRONTEND_SEMANTIC_CASE_IDS = Object.freeze([
  'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN',
]);
const SEMANTIC_PROFILE_CASE_IDS = Object.freeze({
  backend: READER_SEMANTIC_CASE_IDS,
  installer: READER_SEMANTIC_CASE_IDS,
  browser: READER_SEMANTIC_CASE_IDS,
  frontend: FRONTEND_SEMANTIC_CASE_IDS,
});
const DRIVER_IDS = Object.freeze({
  backend: 'C07_BACKEND_SEMANTIC_V1',
  installer: 'C07_INSTALLER_SEMANTIC_V1',
  browser: 'C07_BROWSER_SEMANTIC_V1',
  frontend: 'C07_FRONTEND_SEMANTIC_V1',
});
const CASE_VECTORS = Object.freeze({
  CURRENT_V1_ACCEPTED_RANKABLE: {
    vectorIds: ['TOLERANT-V1-EFFECTIVE-BRANCH'], protocolVersion: '1',
  },
  LEGACY_N_MINUS_ONE_ACCEPTED: {
    vectorIds: ['TOLERANT-V1-LEGACY-BRANCH'], protocolVersion: '1',
  },
  PROTOCOL_2_READABLE_WITH_WRITER_DISABLED: {
    vectorIds: ['TOLERANT-V1-EFFECTIVE-BRANCH'], protocolVersion: '2',
  },
  FUTURE_PROTOCOL_DEGRADED_NONRANKABLE: {
    vectorIds: ['TOLERANT-V1-EFFECTIVE-BRANCH'], protocolVersion: '3',
  },
  ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE: {
    vectorIds: ['TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED'],
    operationIndexes: [3, 11],
    protocolVersion: '2',
  },
  UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW: {
    vectorIds: ['TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED'],
    protocolVersion: '2',
  },
  MISSING_REQUIRED_FIELDS_INVALID: {
    vectorIds: [
      'TOLERANT-V1-MISSING-FULL-SECTION',
      'TOLERANT-V1-MISSING-CURRENT-ACTION-KEY',
    ],
    protocolVersion: '1',
  },
  KNOWN_FIELD_WRONG_TYPE_INVALID: {
    vectorIds: ['TOLERANT-V1-KNOWN-FIELD-WRONG-TYPE'],
    protocolVersion: '1',
  },
});

const RANK_FAMILY_NAMES = Object.freeze([
  'dlp',
  'prompt',
  'upload',
  'exclusion',
  'governance',
  'enforcementTier',
  'proxyFailMode',
  'ingress',
]);
const EXPECTED_KNOWN_RANKS = deepFreeze({
  dlp: { allow: 0, warn: 1, redact: 2, block: 3 },
  prompt: { allow: 0, warn: 1, block: 2 },
  upload: { allow: 0, warn: 1, block: 2 },
  exclusion: { allow: 0, block: 1 },
  governance: { '': 0, monitor: 1, enforce: 2 },
  enforcementTier: { detect: 0, strict: 1 },
  proxyFailMode: { open: 0, closed: 1 },
  ingress: { off: 0, warn: 1, redact: 2, hold: 3 },
});
const EXPECTED_CROSS_FAMILY_RANKS = deepFreeze(Object.fromEntries(
  RANK_FAMILY_NAMES.map((targetFamily) => [
    targetFamily,
    Object.fromEntries(
      ['protocol', ...RANK_FAMILY_NAMES]
        .filter((sourceFamily) => sourceFamily !== targetFamily)
        .map((sourceFamily) => [sourceFamily, null]),
    ),
  ]),
));

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function exactKeys(value, expected, label) {
  assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, `${label} must be an object`);
  assert.deepStrictEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields changed`);
}

function sortedUniqueStrings(value, label, maximum = 256) {
  assert.equal(Array.isArray(value), true, `${label} must be an array`);
  assert.equal(value.length <= maximum, true, `${label} exceeds its bound`);
  for (const entry of value) {
    assert.equal(typeof entry === 'string' && entry.length >= 1 && entry.length <= 256, true, `${label} entry invalid`);
  }
  assert.deepStrictEqual(value, [...new Set(value)].sort(), `${label} must be sorted and unique`);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyVectorOperations(document, operations) {
  for (const operation of operations || []) {
    exactKeys(operation, operation.op === 'remove' ? ['op', 'path'] : ['op', 'path', 'value'], 'semantic vector operation');
    assert.equal(['add', 'replace', 'remove'].includes(operation.op), true, 'semantic vector operation unsupported');
    assert.match(operation.path, /^\/(?:[^/~]|~0|~1)*(?:\/(?:[^/~]|~0|~1)*)*$/, 'semantic vector pointer invalid');
    const segments = operation.path.split('/').slice(1)
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent = document;
    for (const segment of segments.slice(0, -1)) {
      assert.equal(parent !== null && typeof parent === 'object', true, 'semantic vector pointer parent missing');
      parent = parent[segment];
    }
    const key = segments.at(-1);
    if (operation.op === 'remove') {
      assert.equal(Object.prototype.hasOwnProperty.call(parent, key), true, 'semantic vector remove target missing');
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (Array.isArray(parent) && key === '-') {
      parent.push(cloneJson(operation.value));
    } else {
      parent[key] = cloneJson(operation.value);
    }
  }
  return document;
}

function parseArtifact(artifactBytes) {
  assert.equal(Buffer.isBuffer(artifactBytes), true, 'semantic artifact must be bytes');
  assert.equal(sha256(artifactBytes), PORTABLE_ARTIFACT_SHA256, 'semantic artifact digest changed');
  const artifact = parseStrictJsonBytes(artifactBytes);
  assert.equal(artifact.format, 'ceragon.ai-security.portable-contract');
  assert.equal(artifact.formatVersion, 1);
  return artifact;
}

function materializeSemanticInput(artifact, caseId) {
  if (caseId === 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN') {
    return {
      knownRaw: 'approved',
      unknownSafeRaw: 'future-provider',
      unknownUnsafeRaw: 'future\u202eprovider\n',
      values: ['approved'],
      labels: { approved: 'Approved' },
    };
  }
  const vector = CASE_VECTORS[caseId];
  assert.ok(vector, `unknown semantic case ${caseId}`);
  const cases = artifact.v1Policy?.schemaCases;
  assert.ok(cases, 'portable artifact schema cases missing');
  const entries = vector.vectorIds.map((vectorId) => {
    const schemaCase = cases.validationCases?.find(({ id }) => id === vectorId);
    assert.ok(schemaCase, `portable semantic vector ${vectorId} missing`);
    assert.equal(schemaCase.schema, 'tolerant-read', `portable semantic vector ${vectorId} is not a read case`);
    const document = schemaCase.documentRef
      ? cloneJson(cases.baseDocuments?.[schemaCase.documentRef])
      : cloneJson(schemaCase.document);
    const operations = vector.operationIndexes
      ? vector.operationIndexes.map((index) => {
        assert.equal(Number.isSafeInteger(index) && index >= 0 && index < schemaCase.operations.length, true, `${caseId} operation index invalid`);
        return schemaCase.operations[index];
      })
      : schemaCase.operations;
    applyVectorOperations(document, operations);
    assert.equal(document !== null && typeof document === 'object' && !Array.isArray(document), true, `${caseId} document missing`);
    return { vectorId, protocolVersion: vector.protocolVersion, document };
  });
  return { entries };
}

function semanticInputProof(artifact, caseId) {
  const input = materializeSemanticInput(artifact, caseId);
  const inputBytes = Buffer.from(`${stableJson(input)}\n`, 'utf8');
  const policyProofs = caseId === 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN'
    ? []
    : input.entries.map(({ vectorId, document }) => ({
      vectorId,
      sha256: sha256(Buffer.from(`${stableJson(document)}\n`, 'utf8')),
    }));
  return Object.freeze({
    input,
    inputSha256: sha256(inputBytes),
    policyProofs: Object.freeze(policyProofs.map(Object.freeze)),
  });
}

const ADDITIVE_DEGRADED_KINDS = Object.freeze([
  'unknown-dlp-action',
  'unknown-dlp-class',
  'unknown-enforcement-tier',
  'unknown-evidence-mode',
  'unknown-governance-mode',
  'unknown-ingress-action',
  'unknown-prompt-action',
  'unknown-prompt-class',
  'unknown-proxy-fail-mode',
  'unknown-upload-action',
]);
const ADDITIVE_UNKNOWN_PATHS = Object.freeze([
  '/dlp/futureNested',
  '/futureTopLevel',
]);

function assertReaderMetadata(observation, label) {
  assert.equal(observation.runtimeActivatable, false, `${label} unexpectedly activates runtime policy`);
  assert.equal(observation.v2WriterEnabled, false, `${label} unexpectedly enables the V2 writer`);
  assert.deepStrictEqual(observation.writableVersions, ['1'], `${label} writable versions changed`);
}

function assertReaderObservation(consumer, caseId, observation, proof) {
  exactKeys(
    observation,
    [
      'state', 'protocolState', 'protocolRawToken', 'protocolValue',
      'rankingEligible', 'policyRetained', 'policySha256',
      'degradedKinds', 'unknownPaths', 'validationKeywords', 'unknownDlpRank',
      'runtimeActivatable', 'v2WriterEnabled', 'writableVersions',
    ],
    `${consumer} ${caseId} observation`,
  );
  assert.equal(['accepted', 'degraded', 'held', 'invalid'].includes(observation.state), true, `${caseId} state invalid`);
  assert.equal(['known', 'degraded', 'invalid'].includes(observation.protocolState), true, `${caseId} protocol state invalid`);
  assert.equal(observation.protocolRawToken === null || typeof observation.protocolRawToken === 'string', true, `${caseId} raw protocol invalid`);
  assert.equal(observation.protocolValue === null || typeof observation.protocolValue === 'string', true, `${caseId} protocol value invalid`);
  assert.equal(typeof observation.rankingEligible, 'boolean', `${caseId} ranking flag invalid`);
  assert.equal(typeof observation.policyRetained, 'boolean', `${caseId} policy retention flag invalid`);
  assert.equal(observation.policySha256 === null || /^sha256:[0-9a-f]{64}$/.test(observation.policySha256), true, `${caseId} policy digest invalid`);
  sortedUniqueStrings(observation.degradedKinds, `${caseId} degraded kinds`);
  sortedUniqueStrings(observation.unknownPaths, `${caseId} unknown paths`);
  sortedUniqueStrings(observation.validationKeywords, `${caseId} validation keywords`);
  assert.equal(observation.unknownDlpRank, null, `${caseId} allowed an unknown DLP token to enter ranking`);
  assertReaderMetadata(observation, `${consumer} ${caseId}`);

  const knownProtocol = caseId !== 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE';
  const protocolVersion = CASE_VECTORS[caseId].protocolVersion;
  assert.equal(observation.protocolRawToken, protocolVersion, `${caseId} protocol raw token changed`);
  assert.equal(observation.protocolState, knownProtocol ? 'known' : 'degraded', `${caseId} protocol classification changed`);
  assert.equal(observation.protocolValue, knownProtocol ? protocolVersion : null, `${caseId} protocol value changed`);

  if ([
    'CURRENT_V1_ACCEPTED_RANKABLE',
    'LEGACY_N_MINUS_ONE_ACCEPTED',
    'PROTOCOL_2_READABLE_WITH_WRITER_DISABLED',
  ].includes(caseId)) {
    assert.equal(observation.state, 'accepted', `${caseId} was not accepted`);
    assert.equal(observation.rankingEligible, true, `${caseId} was not rankable`);
    assert.equal(observation.policyRetained, true, `${caseId} did not retain its policy`);
    assert.equal(observation.policySha256, proof.policySha256, `${caseId} policy bytes changed`);
    assert.deepStrictEqual(observation.degradedKinds, [], `${caseId} unexpectedly degraded`);
    assert.deepStrictEqual(observation.unknownPaths, [], `${caseId} unexpectedly retained unknown fields`);
    assert.deepStrictEqual(observation.validationKeywords, [], `${caseId} unexpectedly failed validation`);
  } else if (caseId === 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE') {
    assert.equal(observation.state, consumer === 'browser' ? 'held' : 'degraded', `${caseId} fail-safe state changed`);
    assert.equal(observation.rankingEligible, false, `${caseId} entered ranking`);
    assert.equal(observation.policyRetained, true, `${caseId} failed to retain its bounded policy`);
    assert.equal(observation.policySha256, proof.policySha256, `${caseId} policy bytes changed`);
    assert.deepStrictEqual(observation.degradedKinds, [], `${caseId} invented token semantics`);
    assert.deepStrictEqual(observation.unknownPaths, [], `${caseId} invented unknown-field semantics`);
    assert.deepStrictEqual(observation.validationKeywords, [], `${caseId} unexpectedly failed validation`);
  } else if ([
    'ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE',
    'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW',
  ].includes(caseId)) {
    assert.equal(observation.state, 'degraded', `${caseId} was not degraded`);
    assert.equal(observation.rankingEligible, false, `${caseId} entered ranking`);
    assert.equal(observation.policyRetained, true, `${caseId} discarded its forward-compatible policy`);
    assert.equal(observation.policySha256, proof.policySha256, `${caseId} policy bytes changed`);
    assert.deepStrictEqual(observation.degradedKinds, ADDITIVE_DEGRADED_KINDS, `${caseId} degraded-token coverage changed`);
    assert.deepStrictEqual(observation.unknownPaths, ADDITIVE_UNKNOWN_PATHS, `${caseId} unknown-field coverage changed`);
    assert.deepStrictEqual(observation.validationKeywords, [], `${caseId} rejected additive input`);
  } else {
    assert.equal(observation.state, 'invalid', `${caseId} was not invalid`);
    assert.equal(observation.rankingEligible, false, `${caseId} entered ranking`);
    assert.equal(observation.policyRetained, false, `${caseId} retained invalid policy bytes`);
    assert.equal(observation.policySha256, null, `${caseId} retained an invalid policy digest`);
    assert.deepStrictEqual(observation.degradedKinds, [], `${caseId} degraded instead of rejecting`);
    assert.deepStrictEqual(observation.unknownPaths, [], `${caseId} retained unknown paths`);
    assert.equal(observation.validationKeywords.length >= 1, true, `${caseId} has no validation oracle`);
    const requiredKeyword = caseId === 'MISSING_REQUIRED_FIELDS_INVALID' ? 'required' : 'type';
    assert.equal(observation.validationKeywords.includes(requiredKeyword), true, `${caseId} missing ${requiredKeyword} validation proof`);
    assert.equal(observation.validationKeywords.some((keyword) => /unavailable|budget/.test(keyword)), false, `${caseId} failed for the wrong reason`);
  }
}

function assertFrontendObservation(observation) {
  exactKeys(observation, ['known', 'unknownSafe', 'unknownUnsafe', 'runtimeActivatable', 'v2WriterEnabled', 'writableVersions'], 'frontend observation');
  assertReaderMetadata(observation, 'frontend display projection');
  assert.deepStrictEqual(observation.known, {
    kind: 'known', tone: 'mapped', labelId: 'APPROVED', technicalTokenState: 'KNOWN', approvedGreen: true,
  });
  assert.deepStrictEqual(observation.unknownSafe, {
    kind: 'unsupported', tone: 'neutral', labelId: 'UNSUPPORTED', technicalTokenState: 'BOUNDED', approvedGreen: false,
  });
  assert.deepStrictEqual(observation.unknownUnsafe, {
    kind: 'unsupported', tone: 'neutral', labelId: 'UNSUPPORTED', technicalTokenState: 'ABSENT', approvedGreen: false,
  });
}

const EXPECTED_METADATA = Object.freeze({
  readableVersions: Object.freeze(['1', '2']),
  writableVersions: Object.freeze(['1']),
  runtimeActivatable: false,
  signedRuntimePolicyBundle: false,
  v2WriterEnabled: false,
});

function canonicalRows(rows) {
  return rows.map((row) => ({ ...row }))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

const FULL_FORWARD_DEGRADED_TOKENS = Object.freeze(canonicalRows([
  { kind: 'unknown-enforcement-tier', path: '/agents/enforcementTier', rawToken: 'future-tier' },
  { kind: 'unknown-governance-mode', path: '/agents/mode', rawToken: 'future-mode' },
  { kind: 'unknown-dlp-action', path: '/dlp/actions/future-secret-class', rawToken: 'future-action' },
  { kind: 'unknown-dlp-class', path: '/dlp/actions/future-secret-class', rawToken: 'future-secret-class' },
  { kind: 'unknown-dlp-action', path: '/dlp/actions/private-key', rawToken: 'future-action' },
  { kind: 'unknown-evidence-mode', path: '/evidenceMode', rawToken: 'FUTURE_MODE' },
  { kind: 'unknown-ingress-action', path: '/ingress/actions/future-ingress-class', rawToken: 'future-action' },
  { kind: 'unknown-prompt-action', path: '/promptRisk/actions/future-prompt-class', rawToken: 'future-action' },
  { kind: 'unknown-prompt-class', path: '/promptRisk/actions/future-prompt-class', rawToken: 'future-prompt-class' },
  { kind: 'unknown-prompt-action', path: '/promptRisk/actions/injection-system-exfil', rawToken: 'future-action' },
  { kind: 'unknown-proxy-fail-mode', path: '/proxy/failMode', rawToken: 'future-fail-mode' },
  { kind: 'unknown-upload-action', path: '/uploads/files', rawToken: 'future-upload-action' },
]));
const FORWARD_UNKNOWN_FIELDS = Object.freeze(canonicalRows([
  { path: '/dlp/futureNested' },
  { path: '/futureTopLevel' },
]));

function expectedProtocol(protocolVersion) {
  if (protocolVersion === '3') {
    return { state: 'degraded', rawToken: '3', value: null, reason: 'unknown-token' };
  }
  return { state: 'known', rawToken: protocolVersion, value: protocolVersion, reason: null };
}

function expectedDiagnostics(consumer, vectorId) {
  const branchAware = consumer === 'backend' || consumer === 'browser';
  if (vectorId === 'TOLERANT-V1-MISSING-FULL-SECTION') {
    return canonicalRows(branchAware ? [
      { path: '/', keyword: 'required' },
      { path: '/siteId', keyword: 'false schema' },
      { path: '/', keyword: 'oneOf' },
    ] : [{ path: '/', keyword: 'required' }]);
  }
  if (vectorId === 'TOLERANT-V1-MISSING-CURRENT-ACTION-KEY') {
    return canonicalRows(branchAware ? [
      { path: '/dlp/actions', keyword: 'required' },
      { path: '/dlp/actions', keyword: 'required' },
      { path: '/siteId', keyword: 'false schema' },
      { path: '/', keyword: 'oneOf' },
    ] : [{ path: '/dlp/actions', keyword: 'required' }]);
  }
  if (vectorId === 'TOLERANT-V1-KNOWN-FIELD-WRONG-TYPE') {
    return canonicalRows(branchAware ? [
      { path: '/agents/enforcementTier', keyword: 'type' },
      { path: '/agents/enforcementTier', keyword: 'type' },
      { path: '/siteId', keyword: 'false schema' },
      { path: '/', keyword: 'oneOf' },
    ] : [{ path: '/agents/enforcementTier', keyword: 'type' }]);
  }
  return [];
}

function expectedReaderResult(consumer, caseId, entry, policySha256) {
  const base = {
    vectorId: entry.vectorId,
    protocol: expectedProtocol(entry.protocolVersion),
    policySha256,
    degradedTokens: [],
    unknownFields: [],
    validationErrors: [],
  };
  if ([
    'CURRENT_V1_ACCEPTED_RANKABLE',
    'LEGACY_N_MINUS_ONE_ACCEPTED',
    'PROTOCOL_2_READABLE_WITH_WRITER_DISABLED',
  ].includes(caseId)) {
    return { ...base, state: 'accepted', rankingEligible: true };
  }
  if (caseId === 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE') {
    return {
      ...base,
      state: consumer === 'browser' ? 'held' : 'degraded',
      rankingEligible: false,
    };
  }
  if (caseId === 'ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE') {
    return {
      ...base,
      state: 'degraded',
      rankingEligible: false,
      unknownFields: FORWARD_UNKNOWN_FIELDS.map((row) => ({ ...row })),
    };
  }
  if (caseId === 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW') {
    return {
      ...base,
      state: 'degraded',
      rankingEligible: false,
      degradedTokens: FULL_FORWARD_DEGRADED_TOKENS.map((row) => ({ ...row })),
      unknownFields: FORWARD_UNKNOWN_FIELDS.map((row) => ({ ...row })),
    };
  }
  return {
    ...base,
    state: 'invalid',
    rankingEligible: false,
    policySha256: null,
    validationErrors: expectedDiagnostics(consumer, entry.vectorId),
  };
}

function expectedReaderObservation(consumer, caseId, proof) {
  const policyByVector = new Map(proof.policyProofs.map(({ vectorId, sha256: digest }) => [vectorId, digest]));
  const results = proof.input.entries.map((entry) => expectedReaderResult(
    consumer,
    caseId,
    entry,
    policyByVector.get(entry.vectorId),
  ));
  return {
    metadata: {
      readableVersions: [...EXPECTED_METADATA.readableVersions],
      writableVersions: [...EXPECTED_METADATA.writableVersions],
      runtimeActivatable: EXPECTED_METADATA.runtimeActivatable,
      signedRuntimePolicyBundle: EXPECTED_METADATA.signedRuntimePolicyBundle,
      v2WriterEnabled: EXPECTED_METADATA.v2WriterEnabled,
    },
    results,
    rankOracle: caseId === 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW'
      ? {
        familyCount: 8,
        knownRanks: cloneJson(EXPECTED_KNOWN_RANKS),
        crossFamilyRanks: cloneJson(EXPECTED_CROSS_FAMILY_RANKS),
        unknownRanks: Array(8).fill(null),
        forgedRanks: Array(8).fill(null),
      }
      : null,
  };
}

function expectedFrontendObservation() {
  return {
    metadata: {
      readableVersions: [...EXPECTED_METADATA.readableVersions],
      writableVersions: [...EXPECTED_METADATA.writableVersions],
      runtimeActivatable: EXPECTED_METADATA.runtimeActivatable,
      signedRuntimePolicyBundle: EXPECTED_METADATA.signedRuntimePolicyBundle,
      v2WriterEnabled: EXPECTED_METADATA.v2WriterEnabled,
    },
    known: {
      kind: 'known',
      tone: 'mapped',
      labelId: 'APPROVED',
      technicalTokenState: 'KNOWN',
      approvedGreen: true,
    },
    unknownSafe: {
      kind: 'unsupported',
      tone: 'neutral',
      labelId: 'UNSUPPORTED',
      technicalTokenState: 'BOUNDED',
      approvedGreen: false,
    },
    unknownUnsafe: {
      kind: 'unsupported',
      tone: 'neutral',
      labelId: 'UNSUPPORTED',
      technicalTokenState: 'ABSENT',
      approvedGreen: false,
    },
    componentOracle: {
      unknownProviderNeutral: true,
      unknownStatusNeutral: true,
      successIndicatorAbsent: true,
      comboboxAbsent: true,
      hostileRawAbsent: true,
      knownBaselineSuccess: true,
    },
  };
}

function expectedSemanticObservation(consumer, caseId, proof) {
  if (consumer === 'frontend') {
    assert.equal(caseId, 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN');
    return expectedFrontendObservation();
  }
  return expectedReaderObservation(consumer, caseId, proof);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function semanticCatalog(consumer, artifact) {
  const entries = SEMANTIC_PROFILE_CASE_IDS[consumer].map((caseId) => {
    const proof = semanticInputProof(artifact, caseId);
    const observation = expectedSemanticObservation(consumer, caseId, proof);
    return {
      caseId,
      inputSha256: proof.inputSha256,
      observationSha256: sha256(Buffer.from(`${stableJson(observation)}\n`, 'utf8')),
      resultCount: consumer === 'frontend' ? 1 : observation.results.length,
    };
  });
  const descriptor = {
    format: 'ceragon.ai-security.semantic-case-catalog',
    formatVersion: 1,
    oracleVersion: 'C07_EXACT_COMPATIBILITY_ORACLE_V1',
    consumer,
    driverId: DRIVER_IDS[consumer],
    entries,
  };
  return Object.freeze({
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    sha256: sha256(Buffer.from(`${stableJson(descriptor)}\n`, 'utf8')),
  });
}

function validateDriverDescriptor(driverDescriptor, driverBytes, consumer) {
  exactKeys(driverDescriptor, ['id', 'bytes', 'sha256'], 'semantic driver descriptor');
  assert.equal(Buffer.isBuffer(driverBytes), true, 'semantic driver must be exact bytes');
  assert.equal(driverDescriptor.id, DRIVER_IDS[consumer], 'semantic driver ID changed');
  assert.equal(Number.isSafeInteger(driverDescriptor.bytes) && driverDescriptor.bytes >= 1 && driverDescriptor.bytes <= 1_048_576, true, 'semantic driver byte count invalid');
  assert.match(driverDescriptor.sha256, /^sha256:[0-9a-f]{64}$/, 'semantic driver digest invalid');
  assert.equal(driverBytes.length, driverDescriptor.bytes, 'semantic driver byte count changed');
  assert.equal(sha256(driverBytes), driverDescriptor.sha256, 'semantic driver digest changed');
}

const validatedSemanticReceipts = new WeakSet();

function validateSemanticReceiptBytes({ consumer, receiptBytes, artifactBytes, driverDescriptor, driverBytes }) {
  try {
    assert.equal(Object.prototype.hasOwnProperty.call(SEMANTIC_PROFILE_CASE_IDS, consumer), true, 'semantic consumer invalid');
    assert.equal(Buffer.isBuffer(receiptBytes), true, 'semantic receipt must be bytes');
    assert.equal(receiptBytes.length >= 2 && receiptBytes.length <= 262_144, true, 'semantic receipt byte bound invalid');
    assert.equal(receiptBytes.at(-1), 0x0a, 'semantic receipt terminal newline missing');
    validateDriverDescriptor(driverDescriptor, driverBytes, consumer);
    const artifact = parseArtifact(artifactBytes);
    const catalog = semanticCatalog(consumer, artifact);
    const receipt = parseStrictJsonBytes(receiptBytes, {
      maxBytes: 262_144,
      maxDepth: 32,
      maxNodes: 16_384,
    });
    assert.deepStrictEqual(
      receiptBytes,
      Buffer.from(`${stableJson(receipt)}\n`, 'utf8'),
      'semantic receipt must be one canonical JSON record',
    );
    exactKeys(
      receipt,
      ['format', 'formatVersion', 'driverId', 'artifactSha256', 'caseCatalogSha256', 'cases'],
      'semantic receipt',
    );
    assert.equal(receipt.format, 'ceragon.ai-security.semantic-receipt');
    assert.equal(receipt.formatVersion, 1);
    assert.equal(receipt.driverId, DRIVER_IDS[consumer]);
    assert.equal(receipt.artifactSha256, PORTABLE_ARTIFACT_SHA256);
    assert.equal(receipt.caseCatalogSha256, catalog.sha256);
    assert.equal(Array.isArray(receipt.cases), true, 'semantic receipt cases must be an array');
    assert.deepStrictEqual(
      receipt.cases.map(({ id }) => id),
      [...SEMANTIC_PROFILE_CASE_IDS[consumer]],
      'semantic receipt case coverage changed',
    );
    const caseProofs = [];
    let resultCount = 0;
    receipt.cases.forEach((actualCase, index) => {
      const expectedCatalogEntry = catalog.entries[index];
      exactKeys(actualCase, ['id', 'inputSha256', 'observationSha256', 'observation'], `semantic case ${index}`);
      assert.equal(actualCase.id, expectedCatalogEntry.caseId, 'semantic case ID changed');
      assert.equal(actualCase.inputSha256, expectedCatalogEntry.inputSha256, `${actualCase.id} input digest changed`);
      const proof = semanticInputProof(artifact, actualCase.id);
      const expectedObservation = expectedSemanticObservation(consumer, actualCase.id, proof);
      assert.deepStrictEqual(actualCase.observation, expectedObservation, `${actualCase.id} semantic observation changed`);
      const observedDigest = sha256(Buffer.from(`${stableJson(actualCase.observation)}\n`, 'utf8'));
      assert.equal(actualCase.observationSha256, observedDigest, `${actualCase.id} observation digest is not machine-derived`);
      assert.equal(observedDigest, expectedCatalogEntry.observationSha256, `${actualCase.id} expected semantics changed`);
      resultCount += expectedCatalogEntry.resultCount;
      caseProofs.push(Object.freeze({
        caseId: actualCase.id,
        inputSha256: actualCase.inputSha256,
        observationSha256: actualCase.observationSha256,
      }));
    });
    const normalized = deepFreeze({
      protocolId: 'C07_SEMANTIC_RECEIPT_V1',
      consumerId: consumer.toUpperCase(),
      artifactSha256: PORTABLE_ARTIFACT_SHA256,
      driverId: driverDescriptor.id,
      driverSha256: driverDescriptor.sha256,
      caseCatalogSha256: catalog.sha256,
      verifiedCaseCount: caseProofs.length,
      verifiedResultCount: resultCount,
      verifiedRankFamilyCount: consumer === 'frontend' ? 0 : 8,
      inputSetSha256: sha256(Buffer.from(`${stableJson(caseProofs.map(({ caseId, inputSha256 }) => ({ caseId, inputSha256 })))}\n`, 'utf8')),
      observationSetSha256: sha256(Buffer.from(`${stableJson(caseProofs.map(({ caseId, observationSha256 }) => ({ caseId, observationSha256 })))}\n`, 'utf8')),
      transportSha256: sha256(receiptBytes),
      caseProofs,
    });
    validatedSemanticReceipts.add(normalized);
    return normalized;
  } catch (error) {
    const rejected = new Error('semantic receipt rejected by reviewed C07 oracle');
    rejected.code = 'SEMANTIC_RECEIPT_REJECTED';
    rejected.invariantId = 'EXACT_CASE_INPUT_OBSERVATION_ORACLE';
    rejected.diagnosticSha256 = sha256(Buffer.from(String(error?.message || ''), 'utf8'));
    throw rejected;
  }
}

const SEMANTIC_COMPATIBILITY_REQUIREMENTS = Object.freeze([
  ...READER_SEMANTIC_CASE_IDS.map((caseId) => Object.freeze({
    id: caseId,
    consumers: Object.freeze(['backend', 'installer', 'browser']),
  })),
  Object.freeze({
    id: 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN',
    consumers: Object.freeze(['frontend']),
  }),
]);

function semanticProofFor(receipt, caseId) {
  assert.equal(validatedSemanticReceipts.has(receipt), true, 'compatibility requires a validator-issued semantic receipt');
  const proof = receipt.caseProofs.find((candidate) => candidate.caseId === caseId);
  assert.ok(proof, `semantic receipt is missing case ${caseId}`);
  return {
    consumerId: receipt.consumerId,
    caseId: proof.caseId,
    inputSha256: proof.inputSha256,
    observationSha256: proof.observationSha256,
  };
}


module.exports = {
  CASE_VECTORS,
  DRIVER_IDS,
  FRONTEND_SEMANTIC_CASE_IDS,
  PORTABLE_ARTIFACT_SHA256,
  READER_SEMANTIC_CASE_IDS,
  SEMANTIC_COMPATIBILITY_REQUIREMENTS,
  SEMANTIC_PROFILE_CASE_IDS,
  materializeSemanticInput,
  semanticCatalog,
  semanticInputProof,
  semanticProofFor,
  stableJson,
  validateSemanticReceiptBytes,
};
