'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  parseStrictJsonBytes,
  STRICT_JSON_MAX_BYTES,
} = require('./strict-json.cjs');

const ARTIFACT_FILE = 'portable-contract.v1.jcs.json';
const DIGEST_FILE = `${ARTIFACT_FILE}.sha256`;
const RELEASE_FILE = 'portable-contract-release.v1.jcs.json';
const EXPECTED_FILES = Object.freeze([RELEASE_FILE, ARTIFACT_FILE, DIGEST_FILE].sort());
const EXPECTED_TUPLE_SYMBOLS_DIGEST =
  'sha256:867c91f2d844142916bb20203a6a1316045c03a3338fed01da85044eb1a5328e';
const EXPECTED_PORTABLE_ARTIFACT_DIGEST =
  'sha256:1bb9aed7553750f0161dadaba531583101d34eef2b35110e326d4d4a20153826';
const EXPECTED_SOURCE_PATHS = Object.freeze({
  definitionsSchema: 'schemas/ai-security-policy-v1.defs.schema.json',
  strictWriteSchema: 'schemas/ai-security-policy-v1.strict-write.schema.json',
  tolerantReadSchema: 'schemas/ai-security-policy-v1.tolerant-read.schema.json',
  schemaCases: 'vectors/ai-security-policy-v1-schema-cases.json',
  jcsConformanceVectors: 'vectors/rfc8785-conformance.v1.json',
  strictJsonRejectionVectors: 'vectors/rfc8785-rejections.v1.json',
  authorityFixture: 'fixtures/ai-security-policy-v1-authority.json',
});
const REVIEWED_SOURCE_DIGESTS = Object.freeze({
  'manifests/ai-security-portable-release.v1.json':
    'sha256:c51a5db74f69674972b18e041a51f7c54dc4a6c427d536c1ba89862363a4d108',
  'schemas/ai-security-portable-source-manifest-v1.schema.json':
    'sha256:295c35cdb931e4742024b1560d81f0cf508504303155fcb1e3416464ac91e8d0',
  'schemas/ai-security-portable-artifact-v1.schema.json':
    'sha256:23b92d829672535604e2c5e52f271366159960dcc76f964fc862698ddb80fadf',
  'schemas/ai-security-portable-release-manifest-v1.schema.json':
    'sha256:402f06380274d1c16a941d135aaad8bcb8e403e720f0860b758a4c2489f889e5',
  'schemas/ai-security-policy-v1.defs.schema.json':
    'sha256:b111a9bde263b06714eba61ed7b0928a198fece15b949f58b5828acd17d593ec',
  'schemas/ai-security-policy-v1.strict-write.schema.json':
    'sha256:dc69065526a81efbf0c3daabb58b00afbb5b21049eb4347bdcd362c272474d52',
  'schemas/ai-security-policy-v1.tolerant-read.schema.json':
    'sha256:a4df8843fd448f31c142f26c987583b12bfd8c7fa3d3af1d1756330dbb75d7a1',
  'vectors/ai-security-policy-v1-schema-cases.json':
    'sha256:00ca8842aaa6eb19c29debfa2530afd6a11e7eff00e8b65f5f1973ca8b0c808a',
  'vectors/rfc8785-conformance.v1.json':
    'sha256:5304b3362dffe965385d1b91a0068fcb349d600b167c0faf18dfda02c0cac284',
  'vectors/rfc8785-rejections.v1.json':
    'sha256:95f35aa37efb36684fabbec794c73146053b84c5500b2df9e3be5cf79a8e1346',
  'fixtures/ai-security-policy-v1-authority.json':
    'sha256:18ff07ab942a5ff4b816254cab6585ce9cf288e096dbcdafa3f3a0f4352b2e16',
});
const EXPECTED_MANIFEST_SCALARS = Object.freeze({
  format: 'ceragon.ai-security.portable-source',
  formatVersion: 1,
  packageName: '@ceragon/shared-contracts',
  packageVersion: '0.3.0',
  generatorName: 'ceragon-ai-security-artifact',
  generatorVersion: '1.1.0',
  runtimeActivatable: false,
  signedRuntimePolicyBundle: false,
  v2WriterEligible: false,
  requiredIntegrationGate: 'P0-C07',
});
const EXPECTED_AUTHORITY = Object.freeze({
  decisionId: 'G-CONTRACT-AUTHORITY',
  decisionSha256:
    'sha256:0667406e1ccc23439e2fb48d0bb2faee1abe4f5d5e0ad9c4e82fabd3b73c415a',
  approvalEventSha256:
    'sha256:2762f5819ed206d24abf435f4218cba4d05cfe8d458236598606a4d480c44eab',
  model: 'WORKSPACE_PORTABLE_AUTHORITY_WITH_IMMUTABLE_GENERATED_CONSUMERS',
});

function lstatOrNull(absolute) {
  try {
    return fs.lstatSync(absolute);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRealDirectory(absolute, label) {
  const stat = lstatOrNull(absolute);
  assertCondition(stat, `${label} does not exist`);
  assertCondition(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `${label} must be a real directory, not a symbolic link or reparse point`,
  );
  return stat;
}

function assertConfinedRelativePath(relativePath, label) {
  assertCondition(typeof relativePath === 'string' && relativePath.length > 0, `${label} is empty`);
  assertCondition(!relativePath.includes('\\'), `${label} must use forward slashes only`);
  assertCondition(
    !path.posix.isAbsolute(relativePath) && !path.win32.isAbsolute(relativePath),
    `${label} must be relative`,
  );
  const segments = relativePath.split('/');
  assertCondition(
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    `${label} must not contain empty or dot segments`,
  );
  return segments;
}

function resolveRegularSourceFile(packageRoot, relativePath, label = relativePath) {
  const root = path.resolve(packageRoot);
  assertRealDirectory(root, 'package root');
  const segments = assertConfinedRelativePath(relativePath, label);
  const absolute = path.resolve(root, ...segments);
  const lexicalRelative = path.relative(root, absolute);
  assertCondition(
    lexicalRelative !== '' &&
      lexicalRelative !== '..' &&
      !lexicalRelative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(lexicalRelative),
    `${label} escapes package root`,
  );

  let cursor = root;
  for (let index = 0; index < segments.length; index++) {
    cursor = path.join(cursor, segments[index]);
    const stat = lstatOrNull(cursor);
    assertCondition(stat, `${label} does not exist`);
    assertCondition(
      !stat.isSymbolicLink(),
      `${label} must not contain a symbolic link or reparse point`,
    );
    if (index === segments.length - 1) {
      assertCondition(stat.isFile(), `${label} must be a regular file`);
    } else {
      assertCondition(stat.isDirectory(), `${label} parent must be a real directory`);
    }
  }

  const realRoot = fs.realpathSync.native(root);
  const realSource = fs.realpathSync.native(absolute);
  const realRelative = path.relative(realRoot, realSource);
  assertCondition(
    realRelative !== '' &&
      realRelative !== '..' &&
      !realRelative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(realRelative),
    `${label} real path escapes package root`,
  );
  return absolute;
}

function readRegularSourceBytes(packageRoot, relativePath) {
  const absolute = resolveRegularSourceFile(packageRoot, relativePath, relativePath);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(absolute, flags);
  try {
    const before = fs.fstatSync(descriptor);
    assertCondition(before.isFile(), `${relativePath} must remain a regular file after open`);
    assertCondition(
      before.size <= STRICT_JSON_MAX_BYTES,
      `${relativePath} source file exceeds ${STRICT_JSON_MAX_BYTES} bytes before read`,
    );
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    assertCondition(
      offset === before.size &&
        after.size === before.size &&
        after.dev === before.dev &&
        after.ino === before.ino &&
        after.mtimeMs === before.mtimeMs &&
        after.ctimeMs === before.ctimeMs,
      `${relativePath} changed while being read`,
    );
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readStrictJson(packageRoot, relativePath) {
  return parseStrictJsonBytes(readRegularSourceBytes(packageRoot, relativePath));
}

function readReviewedStrictJson(packageRoot, relativePath) {
  const expectedDigest = REVIEWED_SOURCE_DIGESTS[relativePath];
  assertCondition(expectedDigest, `no reviewed source digest is registered for ${relativePath}`);
  const bytes = readRegularSourceBytes(packageRoot, relativePath);
  assertCondition(
    sha256Digest(bytes) === expectedDigest,
    `reviewed source digest mismatch: ${relativePath}`,
  );
  return parseStrictJsonBytes(bytes);
}

function sha256Digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExactKeys(value, expectedKeys, label) {
  assertCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertCondition(JSON.stringify(actual) === JSON.stringify(expected), `${label} keys changed`);
}

function assertExactRecord(value, expected, label) {
  assertExactKeys(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    assertCondition(value[key] === expectedValue, `source manifest invariant mismatch: ${label}.${key}`);
  }
}

function assertSourceManifestInvariants(sourceManifest) {
  const topLevelKeys = [
    ...Object.keys(EXPECTED_MANIFEST_SCALARS),
    'authority',
    'orderedTupleSymbols',
    'sources',
  ];
  assertExactKeys(sourceManifest, topLevelKeys, 'source manifest');
  for (const [key, expectedValue] of Object.entries(EXPECTED_MANIFEST_SCALARS)) {
    assertCondition(
      sourceManifest[key] === expectedValue,
      `source manifest invariant mismatch: ${key}`,
    );
  }
  assertExactRecord(sourceManifest.authority, EXPECTED_AUTHORITY, 'authority');
  assertExactRecord(sourceManifest.sources, EXPECTED_SOURCE_PATHS, 'sources');
}

function assertReviewedVectorShapes(schemaCases, conformance, rejections) {
  assertExactKeys(
    schemaCases,
    ['contractVersion', 'baseDocuments', 'validationCases', 'semanticOnlyRules'],
    'policy schema cases',
  );
  assertCondition(schemaCases.validationCases.length === 18, 'policy schema cases must contain 18 validation cases');
  assertCondition(schemaCases.semanticOnlyRules.length === 5, 'policy schema cases must contain 5 semantic-only rules');
  assertExactKeys(
    conformance,
    ['schemaVersion', 'source', 'primitiveExample', 'utf16Ordering', 'nonNormalization', 'permutations', 'numberVectors'],
    'JCS conformance vectors',
  );
  assertCondition(conformance.numberVectors.length === 27, 'JCS conformance must contain 27 number vectors');
  assertExactKeys(rejections, ['schemaVersion', 'profile', 'cases'], 'strict-ingestion vectors');
  assertCondition(rejections.cases.length === 23, 'strict-ingestion vectors must contain 23 cases');
}

function compileSchema(schema, label, dependencies = []) {
  const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  for (const dependency of dependencies) ajv.addSchema(dependency);
  try {
    return ajv.compile(schema);
  } catch (error) {
    throw new Error(`${label} is not a valid strict draft-07 schema: ${error.message}`);
  }
}

function validateOrThrow(validate, value, label) {
  if (!validate(value)) {
    throw new Error(`${label} failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
}

function buildPortableArtifact(packageRoot) {
  const packageJson = readStrictJson(packageRoot, 'package.json');
  const sourceManifest = readReviewedStrictJson(
    packageRoot,
    'manifests/ai-security-portable-release.v1.json',
  );
  const sourceManifestSchema = readReviewedStrictJson(
    packageRoot,
    'schemas/ai-security-portable-source-manifest-v1.schema.json',
  );
  validateOrThrow(
    compileSchema(sourceManifestSchema, 'portable source manifest schema'),
    sourceManifest,
    'portable source manifest',
  );
  assertSourceManifestInvariants(sourceManifest);
  assertCondition(packageJson.name === sourceManifest.packageName, 'source manifest package name mismatch');
  assertCondition(packageJson.version === sourceManifest.packageVersion, 'source manifest package version mismatch');
  assertCondition(packageJson.version === '0.3.0', 'P0-E01 portable package must be exactly 0.3.0');
  assertCondition(sourceManifest.runtimeActivatable === false, 'portable source must remain inert');
  assertCondition(sourceManifest.signedRuntimePolicyBundle === false, 'C02 cannot claim a signed runtime bundle');
  assertCondition(sourceManifest.v2WriterEligible === false, 'C02 cannot enable a V2 writer');
  assertCondition(sourceManifest.requiredIntegrationGate === 'P0-C07', 'C02 must remain gated by P0-C07');

  const contracts = require(resolveRegularSourceFile(
    packageRoot,
    'dist/index.js',
    'compiled contract module',
  ));
  const tupleSymbols = sourceManifest.orderedTupleSymbols;
  assertCondition(Array.isArray(tupleSymbols) && tupleSymbols.length === 41, 'portable tuple manifest must contain exactly 41 symbols');
  assertCondition(new Set(tupleSymbols).size === tupleSymbols.length, 'portable tuple manifest has duplicate symbols');
  assertCondition(
    sha256Digest(Buffer.from(JSON.stringify(tupleSymbols), 'utf8')) === EXPECTED_TUPLE_SYMBOLS_DIGEST,
    'portable tuple symbol order or membership changed outside the C02 authority freeze',
  );
  const orderedTuples = {};
  for (const symbol of tupleSymbols) {
    const tuple = contracts[symbol];
    assertCondition(Array.isArray(tuple), `missing exported ordered tuple ${symbol}`);
    if (
      symbol.startsWith('AI_SECURITY_POLICY_V1_') ||
      symbol === 'AI_ENFORCEMENT_PROTOCOL_VERSIONS' ||
      symbol === 'AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS' ||
      symbol === 'AI_TRANSLATION_DISPOSITIONS' ||
      symbol === 'AI_SECURITY_OUTCOMES' ||
      symbol === 'AI_RECEIPT_ASSURANCE' ||
      symbol === 'AI_ACTUAL_EFFECT_OBSERVERS'
    ) {
      assertCondition(Object.isFrozen(tuple), `new ordered tuple ${symbol} must be runtime-frozen`);
    }
    orderedTuples[symbol] = [...tuple];
  }

  const definitionsSchema = readReviewedStrictJson(packageRoot, sourceManifest.sources.definitionsSchema);
  const strictWriteSchema = readReviewedStrictJson(packageRoot, sourceManifest.sources.strictWriteSchema);
  const tolerantReadSchema = readReviewedStrictJson(packageRoot, sourceManifest.sources.tolerantReadSchema);
  const schemaCases = readReviewedStrictJson(packageRoot, sourceManifest.sources.schemaCases);
  const jcsConformanceVectors = readReviewedStrictJson(
    packageRoot,
    sourceManifest.sources.jcsConformanceVectors,
  );
  const strictJsonRejectionVectors = readReviewedStrictJson(
    packageRoot,
    sourceManifest.sources.strictJsonRejectionVectors,
  );
  const authorityProof = readReviewedStrictJson(packageRoot, sourceManifest.sources.authorityFixture);
  assertReviewedVectorShapes(schemaCases, jcsConformanceVectors, strictJsonRejectionVectors);
  compileSchema(strictWriteSchema, 'strict-write policy schema', [definitionsSchema]);
  compileSchema(tolerantReadSchema, 'tolerant-read policy schema', [definitionsSchema]);

  const artifact = {
    format: 'ceragon.ai-security.portable-contract',
    formatVersion: 1,
    package: {
      name: packageJson.name,
      version: packageJson.version,
    },
    generator: {
      name: sourceManifest.generatorName,
      version: sourceManifest.generatorVersion,
    },
    authority: sourceManifest.authority,
    protocol: {
      readableVersions: [...contracts.AI_ENFORCEMENT_PROTOCOL_VERSIONS],
      writableVersions: [...contracts.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS],
      v2WriterEnabled: contracts.AI_SECURITY_V2_WRITER_ENABLED,
    },
    runtimeActivatable: contracts.AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE,
    signedRuntimePolicyBundle: false,
    requiredIntegrationGate: contracts.AI_SECURITY_PORTABLE_REQUIRED_INTEGRATION_GATE,
    deferredContractSections: { ...contracts.AI_SECURITY_DEFERRED_CONTRACT_SECTIONS },
    canonicalization: {
      algorithm: 'RFC8785_JCS',
      digestAlgorithm: 'SHA-256',
      conformanceVectors: jcsConformanceVectors,
      strictIngestionRejectionVectors: strictJsonRejectionVectors,
    },
    v1Policy: {
      orderedTuples,
      policyCatalog: contracts.AI_SECURITY_POLICY_V1_CATALOG,
      directOmissionDefaults: contracts.AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS,
      readerFallbacks: contracts.AI_SECURITY_POLICY_V1_READER_FALLBACKS,
      recommendedPolicy: contracts.RECOMMENDED_AI_SECURITY_POLICY_V1,
      schemas: {
        definitions: definitionsSchema,
        strictWrite: strictWriteSchema,
        tolerantRead: tolerantReadSchema,
      },
      schemaCases,
      authorityProof,
    },
  };

  const { canonicalizeJcs } = require(resolveRegularSourceFile(
    packageRoot,
    'dist/sqs-signer.js',
    'compiled canonicalizer module',
  ));
  const artifactBytes = Buffer.from(canonicalizeJcs(artifact), 'utf8');
  const artifactDigest = sha256Digest(artifactBytes);
  assertCondition(
    artifactDigest === EXPECTED_PORTABLE_ARTIFACT_DIGEST,
    `portable artifact digest differs from reviewed immutable 0.3.0 release; got ${artifactDigest}`,
  );
  const release = {
    format: 'ceragon.ai-security.portable-release',
    formatVersion: 1,
    artifactKind: 'PORTABLE_CONTRACT',
    artifactPath: ARTIFACT_FILE,
    artifactDigest,
    artifactBytes: artifactBytes.length,
    sourcePackageName: packageJson.name,
    sourcePackageVersion: packageJson.version,
    generatorName: sourceManifest.generatorName,
    generatorVersion: sourceManifest.generatorVersion,
    runtimeActivatable: false,
    signedRuntimePolicyBundle: false,
    v2WriterEligible: false,
    requiredIntegrationGate: sourceManifest.requiredIntegrationGate,
  };
  const releaseBytes = Buffer.from(canonicalizeJcs(release), 'utf8');

  const artifactSchema = readReviewedStrictJson(
    packageRoot,
    'schemas/ai-security-portable-artifact-v1.schema.json',
  );
  const releaseSchema = readReviewedStrictJson(
    packageRoot,
    'schemas/ai-security-portable-release-manifest-v1.schema.json',
  );
  validateOrThrow(compileSchema(artifactSchema, 'portable artifact schema'), artifact, 'portable artifact');
  validateOrThrow(compileSchema(releaseSchema, 'portable release schema'), release, 'portable release');

  return Object.freeze({
    artifact,
    release,
    artifactDigest,
    files: new Map([
      [ARTIFACT_FILE, artifactBytes],
      [DIGEST_FILE, Buffer.from(`${artifactDigest}\n`, 'ascii')],
      [RELEASE_FILE, releaseBytes],
    ]),
  });
}

function readDirectoryNamesBounded(root, maxEntries, label) {
  const names = [];
  const directory = fs.opendirSync(root);
  try {
    for (;;) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > maxEntries) {
        throw new Error(`${label} entry limit exceeded (maximum ${maxEntries})`);
      }
    }
  } finally {
    directory.closeSync();
  }
  return names.sort();
}

function snapshotStat(stat) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  });
}

function sameSnapshot(stat, snapshot) {
  return (
    stat.dev === snapshot.dev &&
    stat.ino === snapshot.ino &&
    stat.mode === snapshot.mode &&
    stat.nlink === snapshot.nlink &&
    stat.size === snapshot.size &&
    stat.mtimeMs === snapshot.mtimeMs &&
    stat.ctimeMs === snapshot.ctimeMs
  );
}

function preflightOutputRoot(outputRoot, allowMissing = false) {
  const rootStat = lstatOrNull(outputRoot);
  if (!rootStat && allowMissing) return null;
  assertCondition(rootStat, 'generated output root does not exist');
  assertCondition(
    rootStat.isDirectory() && !rootStat.isSymbolicLink(),
    'generated output root must be a real directory, not a symbolic link or reparse point',
  );
  const names = readDirectoryNamesBounded(
    outputRoot,
    EXPECTED_FILES.length,
    'generated output',
  );
  const files = new Map();
  for (const name of names) {
    assertCondition(EXPECTED_FILES.includes(name), `unexpected generated output entry: ${name}`);
    const absolute = path.join(outputRoot, name);
    const stat = fs.lstatSync(absolute);
    assertCondition(
      stat.isFile() && !stat.isSymbolicLink(),
      `generated output must be a regular file: ${absolute}`,
    );
    assertCondition(stat.nlink === 1, `generated output must not be a hard link: ${absolute}`);
    files.set(name, snapshotStat(stat));
  }
  return Object.freeze({ root: snapshotStat(rootStat), files });
}

function createSafeTemporaryFile(outputRoot, name, bytes) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const suffix = crypto.randomBytes(12).toString('hex');
    const tempName = `.${name}.${process.pid}.${suffix}.tmp`;
    const absolute = path.join(outputRoot, tempName);
    const flags =
      fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW || 0);
    let descriptor;
    try {
      descriptor = fs.openSync(absolute, flags, 0o600);
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
    try {
      const opened = fs.fstatSync(descriptor);
      assertCondition(opened.isFile() && opened.nlink === 1, 'temporary output is not a private regular file');
      let offset = 0;
      while (offset < bytes.length) {
        offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset, null);
      }
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return Object.freeze({ name: tempName, absolute });
  }
  throw new Error(`could not create a private temporary file for ${name}`);
}

function assertOutputSnapshot(outputRoot, snapshot, temporaryFiles) {
  const rootStat = assertRealDirectory(outputRoot, 'generated output root');
  assertCondition(
    rootStat.dev === snapshot.root.dev &&
      rootStat.ino === snapshot.root.ino &&
      rootStat.mode === snapshot.root.mode,
    'generated output root changed after preflight',
  );
  const temporaryNames = new Set(temporaryFiles.map((temporary) => temporary.name));
  const names = readDirectoryNamesBounded(
    outputRoot,
    EXPECTED_FILES.length + temporaryFiles.length,
    'generated output during write',
  );
  assertCondition(
    names.length === snapshot.files.size + temporaryFiles.length,
    'generated output changed after preflight',
  );
  for (const name of names) {
    const stat = fs.lstatSync(path.join(outputRoot, name));
    if (temporaryNames.has(name)) {
      assertCondition(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'temporary output changed after creation');
      continue;
    }
    const expected = snapshot.files.get(name);
    assertCondition(expected && sameSnapshot(stat, expected), `generated output changed after preflight: ${name}`);
  }
}

function ensureRealOutputParent(outputRoot) {
  const parent = path.dirname(outputRoot);
  assertCondition(parent !== outputRoot, 'generated output cannot replace a filesystem root');
  if (!lstatOrNull(parent)) fs.mkdirSync(parent, { recursive: true });
  assertRealDirectory(parent, 'generated output parent');
  return parent;
}

function unusedSiblingPath(outputRoot, role) {
  const parent = path.dirname(outputRoot);
  const base = path.basename(outputRoot);
  for (let attempt = 0; attempt < 16; attempt++) {
    const suffix = crypto.randomBytes(12).toString('hex');
    const candidate = path.join(parent, `.${base}.${role}.${process.pid}.${suffix}`);
    if (!lstatOrNull(candidate)) return candidate;
  }
  throw new Error(`could not allocate a private ${role} sibling for generated output`);
}

function createPrivateStagingDirectory(outputRoot) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = unusedSiblingPath(outputRoot, 'staging');
    try {
      fs.mkdirSync(candidate, { mode: 0o700 });
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
    assertRealDirectory(candidate, 'private staging directory');
    return candidate;
  }
  throw new Error('could not create a private staging directory for generated output');
}

function removeOwnedFlatDirectory(root, label) {
  if (!lstatOrNull(root)) return;
  assertRealDirectory(root, label);
  const names = readDirectoryNamesBounded(
    root,
    EXPECTED_FILES.length * 2,
    `${label} cleanup`,
  );
  for (const name of names) {
    const absolute = path.join(root, name);
    const stat = fs.lstatSync(absolute);
    assertCondition(
      stat.isFile() && !stat.isSymbolicLink(),
      `${label} cleanup refuses non-regular entry: ${absolute}`,
    );
    fs.unlinkSync(absolute);
  }
  fs.rmdirSync(root);
}

function populatePrivateStaging(stagingRoot, files) {
  const emptySnapshot = preflightOutputRoot(stagingRoot);
  const temporaryFiles = [];
  try {
    for (const [name, bytes] of files) {
      temporaryFiles.push({
        target: path.join(stagingRoot, name),
        ...createSafeTemporaryFile(stagingRoot, name, bytes),
      });
    }
    assertOutputSnapshot(stagingRoot, emptySnapshot, temporaryFiles);
    for (const temporary of temporaryFiles) {
      fs.renameSync(temporary.absolute, temporary.target);
    }
  } finally {
    for (const temporary of temporaryFiles) {
      try {
        fs.unlinkSync(temporary.absolute);
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
      }
    }
  }
  verifyGeneratedFiles(stagingRoot, files);
}

function writeVerifiedArtifactFiles(outputRoot, files, options = {}) {
  assertCondition(files instanceof Map, 'portable artifact files must be a Map');
  const names = [...files.keys()].sort();
  assertCondition(
    JSON.stringify(names) === JSON.stringify(EXPECTED_FILES),
    'portable artifact file map does not contain the exact expected file set',
  );
  for (const [name, bytes] of files) {
    assertCondition(Buffer.isBuffer(bytes), `portable artifact file must be bytes: ${name}`);
  }
  assertCondition(
    options !== null && typeof options === 'object' && !Array.isArray(options),
    'portable artifact write options must be an object',
  );
  assertCondition(
    Object.keys(options).every((key) => key === 'requireAbsentOrEmpty'),
    'unknown portable artifact write option',
  );
  assertCondition(
    options.requireAbsentOrEmpty === undefined ||
      typeof options.requireAbsentOrEmpty === 'boolean',
    'requireAbsentOrEmpty must be boolean',
  );
  const resolvedOutputRoot = path.resolve(outputRoot);
  ensureRealOutputParent(resolvedOutputRoot);
  const initial = preflightOutputRoot(resolvedOutputRoot, true);
  if (initial && options.requireAbsentOrEmpty) {
    assertCondition(initial.files.size === 0, 'export directory must be absent or empty');
  }
  const stagingRoot = createPrivateStagingDirectory(resolvedOutputRoot);
  try {
    populatePrivateStaging(stagingRoot, files);
  } catch (error) {
    removeOwnedFlatDirectory(stagingRoot, 'private staging directory');
    throw error;
  }

  let backupRoot;
  try {
    if (initial) {
      assertOutputSnapshot(resolvedOutputRoot, initial, []);
    } else {
      assertCondition(!lstatOrNull(resolvedOutputRoot), 'generated output appeared after preflight');
    }
    backupRoot = initial ? unusedSiblingPath(resolvedOutputRoot, 'backup') : null;
  } catch (error) {
    try {
      removeOwnedFlatDirectory(stagingRoot, 'private staging directory');
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'generated output changed before install and staging cleanup failed',
      );
    }
    throw error;
  }

  let originalMoved = false;
  let stagingInstalled = false;
  try {
    if (backupRoot) {
      fs.renameSync(resolvedOutputRoot, backupRoot);
      originalMoved = true;
      assertOutputSnapshot(backupRoot, initial, []);
    }
    fs.renameSync(stagingRoot, resolvedOutputRoot);
    stagingInstalled = true;
    verifyGeneratedFiles(resolvedOutputRoot, files);
  } catch (error) {
    const rollbackErrors = [];
    try {
      if (stagingInstalled) {
        fs.renameSync(resolvedOutputRoot, stagingRoot);
        stagingInstalled = false;
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      if (originalMoved) {
        fs.renameSync(backupRoot, resolvedOutputRoot);
        originalMoved = false;
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      removeOwnedFlatDirectory(stagingRoot, 'private staging directory');
    } catch (cleanupError) {
      rollbackErrors.push(cleanupError);
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'generated output transaction failed and rollback was incomplete',
      );
    }
    throw error;
  }

  if (originalMoved) {
    assertOutputSnapshot(backupRoot, initial, []);
    removeOwnedFlatDirectory(backupRoot, 'private backup directory');
  }
}

function writePortableArtifact(packageRoot, outputRoot) {
  const built = buildPortableArtifact(packageRoot);
  writeVerifiedArtifactFiles(outputRoot, built.files);
  return built;
}

function readVerifiedGeneratedFile(absolute, expected, snapshot, name) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(absolute, flags);
  try {
    const before = fs.fstatSync(descriptor);
    assertCondition(
      sameSnapshot(before, snapshot),
      `generated output changed before verification: ${name}`,
    );
    if (before.size !== expected.length) return null;
    const actual = Buffer.alloc(expected.length);
    let offset = 0;
    while (offset < actual.length) {
      const count = fs.readSync(descriptor, actual, offset, actual.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    assertCondition(
      offset === expected.length && sameSnapshot(after, snapshot),
      `generated output changed during verification: ${name}`,
    );
    return actual;
  } finally {
    fs.closeSync(descriptor);
  }
}

function verifyGeneratedFiles(generatedRoot, expectedFiles) {
  const snapshot = preflightOutputRoot(generatedRoot);
  const actualFiles = [...snapshot.files.keys()].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FILES)) {
    throw new Error(`generated file set mismatch: expected ${EXPECTED_FILES.join(', ')}, got ${actualFiles.join(', ')}`);
  }
  for (const [name, expected] of expectedFiles) {
    const actual = readVerifiedGeneratedFile(
      path.join(generatedRoot, name),
      expected,
      snapshot.files.get(name),
      name,
    );
    if (!actual || !actual.equals(expected)) throw new Error(`stale generated output: ${name}`);
  }
}

function compareGeneratedDirectory(packageRoot, generatedRoot) {
  const built = buildPortableArtifact(packageRoot);
  verifyGeneratedFiles(generatedRoot, built.files);
  return built;
}

module.exports = {
  ARTIFACT_FILE,
  DIGEST_FILE,
  EXPECTED_FILES,
  RELEASE_FILE,
  buildPortableArtifact,
  compareGeneratedDirectory,
  sha256Digest,
  writePortableArtifact,
  writeVerifiedArtifactFiles,
};
