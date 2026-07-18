import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONSUMER = 'browser';
const DRIVER_ID = 'C07_BROWSER_SEMANTIC_V1';
const ARTIFACT_SHA256 =
  'sha256:bb172d0d535530fba9ade9648c2a5f9784ccd4fb9b1a08535f0172188aadca67';
const EXPECTED_FILE_SHA256 = Object.freeze({
  reader: 'sha256:35c974ec897b9ffdf5ac2e60f628b42c5745585665ef6fb9d5beff024890d880',
  tokens: 'sha256:c0005d05a9c66e5e1f14105f08713fe787dba012bce55e4137d99a44cddbd9e8',
  forwardInspection: 'sha256:9fcb373792d67bb9a0319fd37f38feaf5193a8f5b0c29e137a5e720c3d3f0ae6',
  metadata: 'sha256:641471d85fca3d730ecf8d417ac3d6538249b514975fb394e3941e5cb36f3323',
  validators: 'sha256:2a525792ef104e358c8e765e68e26b8aa85b170db87c1bc0452b05f28b95aa3d',
  packageJson: 'sha256:774dd24135f8fd34d829080a39b3c94c9dddbbbb20dfe988f2d1cbb865199d16',
});
const ENVELOPE_ENV_KEYS = Object.freeze([
  'CERAGON_C07_CONSUMER',
  'CERAGON_C07_DRIVER_BYTES',
  'CERAGON_C07_DRIVER_ID',
  'CERAGON_C07_DRIVER_SHA256',
  'CERAGON_C07_INPUT_IMAGE_ID',
  'CERAGON_C07_RUN_CHALLENGE',
  'CERAGON_C07_SNAPSHOT_MANIFEST_SHA256',
  'CERAGON_C07_SOURCE_COMMIT',
  'CERAGON_C07_SOURCE_TREE',
]);
const CASE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'CURRENT_V1_ACCEPTED_RANKABLE',
    vectorIds: Object.freeze(['TOLERANT-V1-EFFECTIVE-BRANCH']),
    protocolVersion: '1',
  }),
  Object.freeze({
    id: 'LEGACY_N_MINUS_ONE_ACCEPTED',
    vectorIds: Object.freeze(['TOLERANT-V1-LEGACY-BRANCH']),
    protocolVersion: '1',
  }),
  Object.freeze({
    id: 'PROTOCOL_2_READABLE_WITH_WRITER_DISABLED',
    vectorIds: Object.freeze(['TOLERANT-V1-EFFECTIVE-BRANCH']),
    protocolVersion: '2',
  }),
  Object.freeze({
    id: 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE',
    vectorIds: Object.freeze(['TOLERANT-V1-EFFECTIVE-BRANCH']),
    protocolVersion: '3',
  }),
  Object.freeze({
    id: 'ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE',
    vectorIds: Object.freeze(['TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED']),
    operationIndexes: Object.freeze([3, 11]),
    protocolVersion: '2',
  }),
  Object.freeze({
    id: 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW',
    vectorIds: Object.freeze(['TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED']),
    protocolVersion: '2',
  }),
  Object.freeze({
    id: 'MISSING_REQUIRED_FIELDS_INVALID',
    vectorIds: Object.freeze([
      'TOLERANT-V1-MISSING-FULL-SECTION',
      'TOLERANT-V1-MISSING-CURRENT-ACTION-KEY',
    ]),
    protocolVersion: '1',
  }),
  Object.freeze({
    id: 'KNOWN_FIELD_WRONG_TYPE_INVALID',
    vectorIds: Object.freeze(['TOLERANT-V1-KNOWN-FIELD-WRONG-TYPE']),
    protocolVersion: '1',
  }),
]);

function invariant(condition) {
  if (!condition) throw new Error('C07 browser semantic driver invariant failed');
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function exactKeys(value, expected) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value));
  invariant(
    stableJson(Object.keys(value).sort()) === stableJson([...expected].sort()),
  );
}

function canonicalBytes(value) {
  return Buffer.from(`${stableJson(value)}\n`, 'utf8');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalRows(rows) {
  invariant(Array.isArray(rows));
  return rows.map((row) => cloneJson(row))
    .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function exactAbsolutePath(value) {
  invariant(typeof value === 'string' && value.length >= 2 && value.length <= 4096);
  invariant(!value.includes('\0') && !value.includes('\\'));
  invariant(path.posix.isAbsolute(value) && path.posix.normalize(value) === value);
  return value;
}

function readDigestBoundFile(filePath, expectedSha256) {
  const bytes = fs.readFileSync(exactAbsolutePath(filePath));
  invariant(bytes.length >= 1 && sha256(bytes) === expectedSha256);
  return bytes;
}

function readBindings() {
  const actualKeys = Object.keys(process.env)
    .filter((key) => key.startsWith('CERAGON_C07_'))
    .sort();
  invariant(stableJson(actualKeys) === stableJson([...ENVELOPE_ENV_KEYS]));
  const binding = Object.fromEntries(ENVELOPE_ENV_KEYS.map((key) => [key, process.env[key]]));
  invariant(/^[0-9a-f]{64}$/.test(binding.CERAGON_C07_RUN_CHALLENGE));
  invariant(binding.CERAGON_C07_CONSUMER === CONSUMER);
  invariant(/^[0-9a-f]{40}$/.test(binding.CERAGON_C07_SOURCE_COMMIT));
  invariant(/^[0-9a-f]{40}$/.test(binding.CERAGON_C07_SOURCE_TREE));
  invariant(/^sha256:[0-9a-f]{64}$/.test(binding.CERAGON_C07_SNAPSHOT_MANIFEST_SHA256));
  invariant(/^sha256:[0-9a-f]{64}$/.test(binding.CERAGON_C07_INPUT_IMAGE_ID));
  invariant(binding.CERAGON_C07_DRIVER_ID === DRIVER_ID);
  invariant(/^[1-9][0-9]{0,6}$/.test(binding.CERAGON_C07_DRIVER_BYTES));
  const driverBytes = Number(binding.CERAGON_C07_DRIVER_BYTES);
  invariant(Number.isSafeInteger(driverBytes) && driverBytes <= 1_048_576);
  invariant(/^sha256:[0-9a-f]{64}$/.test(binding.CERAGON_C07_DRIVER_SHA256));
  const selfBytes = fs.readFileSync(fileURLToPath(import.meta.url));
  invariant(selfBytes.length === driverBytes);
  invariant(sha256(selfBytes) === binding.CERAGON_C07_DRIVER_SHA256);
  return Object.freeze({
    runChallenge: binding.CERAGON_C07_RUN_CHALLENGE,
    sourceCommit: binding.CERAGON_C07_SOURCE_COMMIT,
    sourceTree: binding.CERAGON_C07_SOURCE_TREE,
    snapshotManifestSha256: binding.CERAGON_C07_SNAPSHOT_MANIFEST_SHA256,
    inputImageId: binding.CERAGON_C07_INPUT_IMAGE_ID,
    driverBytes,
    driverSha256: binding.CERAGON_C07_DRIVER_SHA256,
  });
}

function applyVectorOperations(document, operations) {
  for (const operation of operations || []) {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation));
    invariant(['add', 'replace', 'remove'].includes(operation.op));
    invariant(typeof operation.path === 'string' && operation.path.startsWith('/'));
    const segments = operation.path.split('/').slice(1)
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    invariant(segments.length >= 1);
    let parent = document;
    for (const segment of segments.slice(0, -1)) {
      invariant(parent !== null && typeof parent === 'object');
      parent = parent[segment];
    }
    invariant(parent !== null && typeof parent === 'object');
    const key = segments.at(-1);
    if (operation.op === 'remove') {
      invariant(Object.prototype.hasOwnProperty.call(parent, key));
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (Array.isArray(parent) && key === '-') {
      parent.push(cloneJson(operation.value));
    } else if (Array.isArray(parent)) {
      parent[Number(key)] = cloneJson(operation.value);
    } else {
      Object.defineProperty(parent, key, {
        value: cloneJson(operation.value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return document;
}

function materializeInput(artifact, definition) {
  const schemaCases = artifact?.v1Policy?.schemaCases;
  invariant(schemaCases && Array.isArray(schemaCases.validationCases));
  const entries = definition.vectorIds.map((vectorId) => {
    const vector = schemaCases.validationCases.find((candidate) => candidate.id === vectorId);
    invariant(vector && vector.schema === 'tolerant-read');
    const document = vector.documentRef
      ? cloneJson(schemaCases.baseDocuments?.[vector.documentRef])
      : cloneJson(vector.document);
    invariant(document && typeof document === 'object' && !Array.isArray(document));
    const operations = definition.operationIndexes
      ? definition.operationIndexes.map((index) => {
        invariant(Number.isSafeInteger(index) && index >= 0 && index < vector.operations.length);
        return vector.operations[index];
      })
      : vector.operations;
    applyVectorOperations(document, operations);
    return { vectorId, protocolVersion: definition.protocolVersion, document };
  });
  return { entries };
}

function metadataObservation(metadata) {
  invariant(stableJson(metadata.AI_ENFORCEMENT_PROTOCOL_VERSIONS) === stableJson(['1', '2']));
  invariant(stableJson(metadata.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS) === stableJson(['1']));
  invariant(metadata.AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE === false);
  invariant(metadata.AI_SECURITY_PORTABLE_SIGNED_RUNTIME_POLICY_BUNDLE === false);
  invariant(metadata.AI_SECURITY_V2_WRITER_ENABLED === false);
  return {
    readableVersions: [...metadata.AI_ENFORCEMENT_PROTOCOL_VERSIONS],
    writableVersions: [...metadata.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS],
    runtimeActivatable: metadata.AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE,
    signedRuntimePolicyBundle: metadata.AI_SECURITY_PORTABLE_SIGNED_RUNTIME_POLICY_BUNDLE,
    v2WriterEnabled: metadata.AI_SECURITY_V2_WRITER_ENABLED,
  };
}

function projectedProtocol(protocol) {
  const expectedKeys = protocol?.state === 'known'
    ? ['state', 'rawToken', 'value']
    : ['state', 'rawToken', 'reason'];
  exactKeys(protocol, expectedKeys);
  invariant(protocol && typeof protocol === 'object' && !Array.isArray(protocol));
  invariant(['known', 'degraded', 'invalid'].includes(protocol.state));
  return {
    state: protocol.state,
    rawToken: protocol.rawToken,
    value: protocol.state === 'known' ? protocol.value : null,
    reason: protocol.state === 'known' ? null : protocol.reason,
  };
}

function projectedResult(vectorId, result) {
  exactKeys(result, [
    'state', 'protocol', 'policy', 'degradedTokens', 'unknownFields',
    'validationErrors', 'rankingEligible',
  ]);
  invariant(result && typeof result === 'object' && !Array.isArray(result));
  invariant(['accepted', 'degraded', 'held', 'invalid'].includes(result.state));
  invariant(typeof result.rankingEligible === 'boolean');
  invariant(result.policy === null || (typeof result.policy === 'object' && !Array.isArray(result.policy)));
  invariant(Array.isArray(result.degradedTokens));
  invariant(Array.isArray(result.unknownFields));
  invariant(Array.isArray(result.validationErrors));
  result.degradedTokens.forEach((row) => exactKeys(row, ['kind', 'path', 'rawToken']));
  result.unknownFields.forEach((row) => exactKeys(row, ['path']));
  result.validationErrors.forEach((row) => exactKeys(row, ['path', 'keyword']));
  return {
    vectorId,
    protocol: projectedProtocol(result.protocol),
    policySha256: result.policy === null ? null : sha256(canonicalBytes(result.policy)),
    degradedTokens: canonicalRows(result.degradedTokens),
    unknownFields: canonicalRows(result.unknownFields),
    validationErrors: canonicalRows(result.validationErrors),
    state: result.state,
    rankingEligible: result.rankingEligible,
  };
}

function rankOracle(reader) {
  const families = [
    {
      family: 'dlp',
      readName: 'readAiSecurityDlpActionToken',
      rankName: 'rankKnownAiSecurityDlpAction',
      ranks: [['allow', 0], ['warn', 1], ['redact', 2], ['block', 3]],
      representative: 'block',
    },
    {
      family: 'prompt',
      readName: 'readAiSecurityPromptActionToken',
      rankName: 'rankKnownAiSecurityPromptAction',
      ranks: [['allow', 0], ['warn', 1], ['block', 2]],
      representative: 'block',
    },
    {
      family: 'upload',
      readName: 'readAiSecurityUploadActionToken',
      rankName: 'rankKnownAiSecurityUploadAction',
      ranks: [['allow', 0], ['warn', 1], ['block', 2]],
      representative: 'block',
    },
    {
      family: 'exclusion',
      readName: 'readAiSecurityExclusionActionToken',
      rankName: 'rankKnownAiSecurityExclusionAction',
      ranks: [['allow', 0], ['block', 1]],
      representative: 'block',
    },
    {
      family: 'governance',
      readName: 'readAiSecurityGovernanceModeToken',
      rankName: 'rankKnownAiSecurityGovernanceMode',
      ranks: [['', 0], ['monitor', 1], ['enforce', 2]],
      representative: 'enforce',
    },
    {
      family: 'enforcementTier',
      readName: 'readAiSecurityEnforcementTierToken',
      rankName: 'rankKnownAiSecurityEnforcementTier',
      ranks: [['detect', 0], ['strict', 1]],
      representative: 'strict',
    },
    {
      family: 'proxyFailMode',
      readName: 'readAiSecurityProxyFailModeToken',
      rankName: 'rankKnownAiSecurityProxyFailMode',
      ranks: [['open', 0], ['closed', 1]],
      representative: 'closed',
    },
    {
      family: 'ingress',
      readName: 'readAiSecurityIngressActionToken',
      rankName: 'rankKnownAiSecurityIngressAction',
      ranks: [['off', 0], ['warn', 1], ['redact', 2], ['hold', 3]],
      representative: 'hold',
    },
  ];
  const knownRanks = {};
  const unknownRanks = [];
  const forgedRanks = [];
  const crossFamilyRanks = {};
  for (const target of families) {
    invariant(
      typeof reader[target.readName] === 'function'
      && typeof reader[target.rankName] === 'function',
    );
    knownRanks[target.family] = {};
    for (const [token, expectedRank] of target.ranks) {
      const known = reader[target.readName](token);
      exactKeys(known, ['state', 'rawToken', 'value']);
      invariant(Object.isFrozen(known));
      const actualRank = reader[target.rankName](known);
      invariant(actualRank === expectedRank);
      knownRanks[target.family][token] = actualRank;
    }
    const unknown = reader[target.readName]('future-token');
    exactKeys(unknown, ['state', 'rawToken', 'reason']);
    invariant(Object.isFrozen(unknown));
    unknownRanks.push(reader[target.rankName](unknown));
    forgedRanks.push(reader[target.rankName]({
      state: 'known',
      rawToken: target.representative,
      value: target.representative,
    }));
    crossFamilyRanks[target.family] = {};
    for (const source of families) {
      if (source.family === target.family) continue;
      const sourceToken = reader[source.readName](source.representative);
      exactKeys(sourceToken, ['state', 'rawToken', 'value']);
      invariant(Object.isFrozen(sourceToken));
      crossFamilyRanks[target.family][source.family] = reader[target.rankName](sourceToken);
    }
  }
  invariant(unknownRanks.every((rank) => rank === null));
  invariant(forgedRanks.every((rank) => rank === null));
  invariant(
    Object.values(crossFamilyRanks)
      .every((row) => Object.values(row).every((rank) => rank === null)),
  );
  return {
    familyCount: families.length,
    knownRanks,
    unknownRanks,
    forgedRanks,
    crossFamilyRanks,
  };
}

function buildSemanticReceipt(artifact, reader, metadata) {
  invariant(typeof reader.readAiSecurityPolicy === 'function');
  const metadataRow = metadataObservation(metadata);
  const cases = CASE_DEFINITIONS.map((definition) => {
    const input = materializeInput(artifact, definition);
    const results = input.entries.map((entry) => projectedResult(
      entry.vectorId,
      reader.readAiSecurityPolicy(entry.document, entry.protocolVersion),
    ));
    const observation = {
      metadata: { ...metadataRow, readableVersions: [...metadataRow.readableVersions], writableVersions: [...metadataRow.writableVersions] },
      results,
      rankOracle: definition.id === 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW'
        ? rankOracle(reader)
        : null,
    };
    return {
      id: definition.id,
      inputSha256: sha256(canonicalBytes(input)),
      observationSha256: sha256(canonicalBytes(observation)),
      observation,
    };
  });
  const catalog = {
    format: 'ceragon.ai-security.semantic-case-catalog',
    formatVersion: 1,
    oracleVersion: 'C07_EXACT_COMPATIBILITY_ORACLE_V1',
    consumer: CONSUMER,
    driverId: DRIVER_ID,
    entries: cases.map((entry) => ({
      caseId: entry.id,
      inputSha256: entry.inputSha256,
      observationSha256: entry.observationSha256,
      resultCount: entry.observation.results.length,
    })),
  };
  return {
    format: 'ceragon.ai-security.semantic-receipt',
    formatVersion: 1,
    driverId: DRIVER_ID,
    artifactSha256: ARTIFACT_SHA256,
    caseCatalogSha256: sha256(canonicalBytes(catalog)),
    cases,
  };
}

async function main() {
  invariant(process.argv.length === 5);
  const [artifactPath, readerPath, metadataPath] = process.argv.slice(2).map(exactAbsolutePath);
  const bindings = readBindings();
  const artifactBytes = readDigestBoundFile(artifactPath, ARTIFACT_SHA256);
  readDigestBoundFile(readerPath, EXPECTED_FILE_SHA256.reader);
  const sourceRoot = path.posix.dirname(readerPath);
  const tokensPath = path.posix.join(sourceRoot, 'ai-security-policy-v1-tokens.js');
  const forwardInspectionPath = path.posix.join(
    sourceRoot,
    'ai-security-policy-v1-forward-inspection.js',
  );
  const expectedMetadataPath = path.posix.join(
    sourceRoot,
    'generated/ai-security-portable.generated.js',
  );
  const validatorsPath = path.posix.join(
    sourceRoot,
    'generated/ai-security-policy-v1.validators.generated.js',
  );
  const packageJsonPath = path.posix.join(sourceRoot, '../package.json');
  invariant(metadataPath === expectedMetadataPath);
  readDigestBoundFile(tokensPath, EXPECTED_FILE_SHA256.tokens);
  readDigestBoundFile(forwardInspectionPath, EXPECTED_FILE_SHA256.forwardInspection);
  readDigestBoundFile(metadataPath, EXPECTED_FILE_SHA256.metadata);
  readDigestBoundFile(validatorsPath, EXPECTED_FILE_SHA256.validators);
  readDigestBoundFile(packageJsonPath, EXPECTED_FILE_SHA256.packageJson);
  const artifact = JSON.parse(artifactBytes.toString('utf8'));
  invariant(artifact.format === 'ceragon.ai-security.portable-contract' && artifact.formatVersion === 1);
  const reader = await import(pathToFileURL(readerPath).href);
  const metadata = await import(pathToFileURL(metadataPath).href);
  const semanticReceipt = buildSemanticReceipt(artifact, reader, metadata);
  const envelope = {
    format: 'ceragon.ai-security.contained-semantic-envelope',
    formatVersion: 1,
    runChallenge: bindings.runChallenge,
    consumer: CONSUMER,
    sourceCommit: bindings.sourceCommit,
    sourceTree: bindings.sourceTree,
    snapshotManifestSha256: bindings.snapshotManifestSha256,
    inputImageId: bindings.inputImageId,
    driverId: DRIVER_ID,
    driverBytes: bindings.driverBytes,
    driverSha256: bindings.driverSha256,
    semanticReceipt,
  };
  process.stdout.write(canonicalBytes(envelope));
}

try {
  await main();
} catch {
  process.exitCode = 1;
}
