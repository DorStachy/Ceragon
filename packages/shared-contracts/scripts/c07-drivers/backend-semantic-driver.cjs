'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const CONSUMER = 'backend';
const DRIVER_ID = 'C07_BACKEND_SEMANTIC_V1';
const REVIEWED_PACKAGE_ROOT = '/workspace/node_modules';
const REVIEWED_DEPENDENCY_ROOT = '/app/node_modules';
const ARTIFACT_SHA256 =
  'sha256:096d6c8f181408bb60a1440173f04efdd99764736d97d01169decdecad0c6feb';
const EXPECTED_MODULE_SHA256 = Object.freeze({
  reader: 'sha256:405b7cdd118ad0e2e930b0eb264099234da448e3d50aae4dd0a8b32a350ab174',
  strictest: 'sha256:8ef77bc6d4e715d6f10f7bd679b980496f766673ee4bd1e9b4eaa268e40f496a',
  metadata: 'sha256:ad98b3cd82f42d446409a45e17711b5b5009290159e4058fc8c183a6a692e2ab',
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
  if (!condition) throw new Error('C07 backend semantic driver invariant failed');
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

function loadReviewedTypescriptModule(filePath, sourceBytes) {
  invariant(Buffer.isBuffer(sourceBytes) && sourceBytes.length >= 1);
  for (const root of [REVIEWED_PACKAGE_ROOT, REVIEWED_DEPENDENCY_ROOT]) {
    const stat = fs.lstatSync(root);
    invariant(stat.isDirectory() && !stat.isSymbolicLink());
    invariant(fs.realpathSync(root) === root);
  }
  const typescript = require(REVIEWED_DEPENDENCY_ROOT + '/typescript');
  invariant(typescript.version === '5.9.3');
  const compiled = typescript.transpileModule(sourceBytes.toString('utf8'), {
    fileName: filePath,
    compilerOptions: {
      esModuleInterop: true,
      module: typescript.ModuleKind.CommonJS,
      moduleResolution: typescript.ModuleResolutionKind.Node10,
      target: typescript.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  invariant((compiled.diagnostics || []).length === 0 && typeof compiled.outputText === 'string');
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = [REVIEWED_PACKAGE_ROOT, REVIEWED_DEPENDENCY_ROOT];
  loaded._compile(compiled.outputText, filePath);
  return loaded.exports;
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
  const selfBytes = fs.readFileSync(__filename);
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
  invariant(result && typeof result === 'object' && !Array.isArray(result));
  invariant(['accepted', 'degraded', 'held', 'invalid'].includes(result.state));
  invariant(typeof result.rankingEligible === 'boolean');
  invariant(result.policy === null || (typeof result.policy === 'object' && !Array.isArray(result.policy)));
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
  const targets = [
    {
      family: 'dlp', readName: 'readAiSecurityDlpActionToken',
      rankName: 'rankKnownAiSecurityDlpAction',
      ranks: [['allow', 0], ['warn', 1], ['redact', 2], ['block', 3]], representative: 'block',
    },
    {
      family: 'prompt', readName: 'readAiSecurityPromptActionToken',
      rankName: 'rankKnownAiSecurityPromptAction',
      ranks: [['allow', 0], ['warn', 1], ['block', 2]], representative: 'block',
    },
    {
      family: 'upload', readName: 'readAiSecurityUploadActionToken',
      rankName: 'rankKnownAiSecurityUploadAction',
      ranks: [['allow', 0], ['warn', 1], ['block', 2]], representative: 'block',
    },
    {
      family: 'exclusion', readName: 'readAiSecurityExclusionActionToken',
      rankName: 'rankKnownAiSecurityExclusionAction',
      ranks: [['allow', 0], ['block', 1]], representative: 'block',
    },
    {
      family: 'governance', readName: 'readAiSecurityGovernanceModeToken',
      rankName: 'rankKnownAiSecurityGovernanceMode',
      ranks: [['', 0], ['monitor', 1], ['enforce', 2]], representative: 'enforce',
    },
    {
      family: 'enforcementTier', readName: 'readAiSecurityEnforcementTierToken',
      rankName: 'rankKnownAiSecurityEnforcementTier',
      ranks: [['detect', 0], ['strict', 1]], representative: 'strict',
    },
    {
      family: 'proxyFailMode', readName: 'readAiSecurityProxyFailModeToken',
      rankName: 'rankKnownAiSecurityProxyFailMode',
      ranks: [['open', 0], ['closed', 1]], representative: 'closed',
    },
    {
      family: 'ingress', readName: 'readAiSecurityIngressActionToken',
      rankName: 'rankKnownAiSecurityIngressAction',
      ranks: [['off', 0], ['warn', 1], ['redact', 2], ['hold', 3]], representative: 'hold',
    },
  ];
  const sources = [
    { family: 'protocol', readName: 'readAiSecurityProtocolVersionToken', representative: '2' },
    ...targets.map(({ family, readName, representative }) => ({ family, readName, representative })),
  ];
  invariant(targets.length === 8 && sources.length === 9);
  const knownRanks = {};
  const unknownRanks = [];
  const forgedRanks = [];
  const crossFamilyRanks = {};
  for (const target of targets) {
    invariant(typeof reader[target.readName] === 'function' && typeof reader[target.rankName] === 'function');
    knownRanks[target.family] = {};
    for (const [token, expectedRank] of target.ranks) {
      const issued = reader[target.readName](token);
      invariant(Object.isFrozen(issued));
      const actualRank = reader[target.rankName](issued);
      invariant(actualRank === expectedRank);
      knownRanks[target.family][token] = actualRank;
    }
    unknownRanks.push(reader[target.rankName](reader[target.readName]('future-token')));
    forgedRanks.push(reader[target.rankName]({
      state: 'known',
      rawToken: target.representative,
      value: target.representative,
    }));
    crossFamilyRanks[target.family] = {};
    for (const source of sources) {
      if (source.family === target.family) continue;
      invariant(typeof reader[source.readName] === 'function');
      const issued = reader[source.readName](source.representative);
      invariant(Object.isFrozen(issued));
      crossFamilyRanks[target.family][source.family] = reader[target.rankName](issued);
    }
    invariant(Object.keys(crossFamilyRanks[target.family]).length === 8);
  }
  invariant(unknownRanks.every((rank) => rank === null));
  invariant(forgedRanks.every((rank) => rank === null));
  invariant(Object.values(crossFamilyRanks)
    .every((row) => Object.values(row).every((rank) => rank === null)));
  invariant(Object.values(crossFamilyRanks)
    .reduce((count, row) => count + Object.keys(row).length, 0) === 64);
  return {
    familyCount: targets.length,
    knownRanks,
    unknownRanks,
    forgedRanks,
    crossFamilyRanks,
  };
}

function proveStrictestIdentity(strictest, policy) {
  invariant(typeof strictest.resolveStrictestPolicy === 'function');
  const folded = strictest.resolveStrictestPolicy([policy]);
  invariant(stableJson(folded) === stableJson(policy));
  const nonRankable = cloneJson(policy);
  nonRankable.dlp.actions['private-key'] = 'future-action';
  let rejected = false;
  try {
    strictest.resolveStrictestPolicy([nonRankable]);
  } catch {
    rejected = true;
  }
  invariant(rejected);
}

function buildSemanticReceipt(artifact, reader, strictest, metadata) {
  invariant(typeof reader.readAiSecurityPolicy === 'function');
  const metadataRow = metadataObservation(metadata);
  const cases = CASE_DEFINITIONS.map((definition) => {
    const input = materializeInput(artifact, definition);
    const results = input.entries.map((entry) => {
      const result = reader.readAiSecurityPolicy(entry.document, entry.protocolVersion);
      if (definition.id === 'CURRENT_V1_ACCEPTED_RANKABLE') {
        invariant(result.state === 'accepted' && result.policy !== null);
        proveStrictestIdentity(strictest, result.policy);
      }
      return projectedResult(entry.vectorId, result);
    });
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

function main() {
  invariant(process.argv.length === 6);
  const [artifactPath, readerPath, strictestPath, metadataPath] = process.argv.slice(2)
    .map(exactAbsolutePath);
  const bindings = readBindings();
  const artifactBytes = readDigestBoundFile(artifactPath, ARTIFACT_SHA256);
  const readerBytes = readDigestBoundFile(readerPath, EXPECTED_MODULE_SHA256.reader);
  readDigestBoundFile(strictestPath, EXPECTED_MODULE_SHA256.strictest);
  readDigestBoundFile(metadataPath, EXPECTED_MODULE_SHA256.metadata);
  const artifact = JSON.parse(artifactBytes.toString('utf8'));
  invariant(artifact.format === 'ceragon.ai-security.portable-contract' && artifact.formatVersion === 1);
  const reader = loadReviewedTypescriptModule(readerPath, readerBytes);
  const strictest = require(strictestPath);
  const metadata = require(metadataPath);
  const semanticReceipt = buildSemanticReceipt(artifact, reader, strictest, metadata);
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
  main();
} catch {
  process.exitCode = 1;
}
