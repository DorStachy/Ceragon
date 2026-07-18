'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const packageRoot = path.resolve(__dirname, '..');
const generator = path.join(__dirname, 'generate-ai-security-artifact.cjs');
const checker = path.join(__dirname, 'check-ai-security-generated.cjs');
const exporter = path.join(__dirname, 'export-ai-security-artifact.cjs');
const generatedRoot = path.join(packageRoot, 'generated', 'ai-security', '0.3.0');
const {
  buildPortableArtifact,
  compareGeneratedDirectory,
  writePortableArtifact,
} = require('./lib/ai-security-artifact.cjs');

function runCommand(command, args = [], cwd = packageRoot, expectedStatus = 0) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8' },
  });
  assert.equal(
    result.status,
    expectedStatus,
    `${path.basename(command)} ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function run(script, args = [], expectedStatus = 0) {
  return runCommand(process.execPath, [script, ...args], packageRoot, expectedStatus);
}

function npmCliInvocation() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const cli = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (cli) return { command: process.execPath, prefix: [cli] };
  return { command: process.platform === 'win32' ? 'npm.exe' : 'npm', prefix: [] };
}

function digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(root, entry.name);
      return entry.isDirectory()
        ? filesUnder(absolute).map((child) => path.join(entry.name, child))
        : [entry.name];
    })
    .sort();
}

function clonePortableBuildInputs(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(targetRoot, 'package.json'));
  for (const directory of ['dist', 'fixtures', 'manifests', 'schemas', 'vectors']) {
    fs.cpSync(path.join(packageRoot, directory), path.join(targetRoot, directory), {
      recursive: true,
    });
  }
}

function createDirectoryLink(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function assertBytes(pathname, expected, label) {
  assert.deepEqual(fs.readFileSync(pathname), Buffer.from(expected), label);
}

function cloneFreshPackPackage(targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const filename of ['package.json', 'package-lock.json', 'tsconfig.json']) {
    fs.copyFileSync(path.join(packageRoot, filename), path.join(targetRoot, filename));
  }
  for (const directory of [
    'fixtures',
    'generated',
    'manifests',
    'schemas',
    'scripts',
    'src',
    'vectors',
  ]) {
    fs.cpSync(path.join(packageRoot, directory), path.join(targetRoot, directory), {
      recursive: true,
    });
  }
  createDirectoryLink(path.join(packageRoot, 'node_modules'), path.join(targetRoot, 'node_modules'));
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c02-artifact-'));
try {
  const first = path.join(tempRoot, 'first');
  const second = path.join(tempRoot, 'second');
  run(generator, ['--output', first]);
  run(generator, ['--output', second]);

  const expectedFiles = [
    'portable-contract-release.v1.jcs.json',
    'portable-contract.v1.jcs.json',
    'portable-contract.v1.jcs.json.sha256',
  ];
  assert.deepEqual(filesUnder(first), expectedFiles);
  assert.deepEqual(filesUnder(second), expectedFiles);
  for (const relative of expectedFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(first, relative)),
      fs.readFileSync(path.join(second, relative)),
      `fresh builds differ: ${relative}`,
    );
  }

  const dirtyGeneration = path.join(tempRoot, 'dirty-generation');
  fs.mkdirSync(dirtyGeneration);
  fs.writeFileSync(path.join(dirtyGeneration, 'unexpected.txt'), 'unexpected');
  fs.writeFileSync(path.join(dirtyGeneration, 'portable-contract.v1.jcs.json'), 'sentinel-artifact');
  run(generator, ['--output', dirtyGeneration], 1);
  assertBytes(
    path.join(dirtyGeneration, 'portable-contract.v1.jcs.json'),
    'sentinel-artifact',
    'dirty-output rejection must not clobber an existing expected file',
  );
  assertBytes(
    path.join(dirtyGeneration, 'unexpected.txt'),
    'unexpected',
    'dirty-output rejection must not modify the unexpected file',
  );
  assert.deepEqual(filesUnder(dirtyGeneration), [
    'portable-contract.v1.jcs.json',
    'unexpected.txt',
  ]);

  const nonRegularOutput = path.join(tempRoot, 'non-regular-output');
  fs.mkdirSync(nonRegularOutput);
  fs.writeFileSync(path.join(nonRegularOutput, 'portable-contract.v1.jcs.json'), 'sentinel-a');
  fs.writeFileSync(
    path.join(nonRegularOutput, 'portable-contract.v1.jcs.json.sha256'),
    'sentinel-b',
  );
  fs.mkdirSync(path.join(nonRegularOutput, 'portable-contract-release.v1.jcs.json'));
  run(generator, ['--output', nonRegularOutput], 1);
  assertBytes(
    path.join(nonRegularOutput, 'portable-contract.v1.jcs.json'),
    'sentinel-a',
    'non-regular expected-name rejection must preflight before writing',
  );
  assertBytes(
    path.join(nonRegularOutput, 'portable-contract.v1.jcs.json.sha256'),
    'sentinel-b',
    'all expected-name sentinels must survive a later invalid entry',
  );
  assert.equal(
    fs.lstatSync(path.join(nonRegularOutput, 'portable-contract-release.v1.jcs.json')).isDirectory(),
    true,
  );

  const linkedEntryTarget = path.join(tempRoot, 'linked-entry-target');
  const linkedEntryOutput = path.join(tempRoot, 'linked-entry-output');
  fs.mkdirSync(linkedEntryTarget);
  fs.writeFileSync(path.join(linkedEntryTarget, 'marker'), 'outside-marker');
  fs.mkdirSync(linkedEntryOutput);
  fs.writeFileSync(path.join(linkedEntryOutput, 'portable-contract.v1.jcs.json'), 'sentinel-c');
  fs.writeFileSync(
    path.join(linkedEntryOutput, 'portable-contract.v1.jcs.json.sha256'),
    'sentinel-d',
  );
  createDirectoryLink(
    linkedEntryTarget,
    path.join(linkedEntryOutput, 'portable-contract-release.v1.jcs.json'),
  );
  run(generator, ['--output', linkedEntryOutput], 1);
  assertBytes(
    path.join(linkedEntryOutput, 'portable-contract.v1.jcs.json'),
    'sentinel-c',
    'expected-name link rejection must occur before any write',
  );
  assertBytes(
    path.join(linkedEntryOutput, 'portable-contract.v1.jcs.json.sha256'),
    'sentinel-d',
    'expected-name reparse rejection must preserve other expected files',
  );
  assertBytes(path.join(linkedEntryTarget, 'marker'), 'outside-marker');

  const linkedRootTarget = path.join(tempRoot, 'linked-root-target');
  const linkedRoot = path.join(tempRoot, 'linked-root');
  fs.mkdirSync(linkedRootTarget);
  fs.writeFileSync(
    path.join(linkedRootTarget, 'portable-contract.v1.jcs.json'),
    'root-sentinel',
  );
  createDirectoryLink(linkedRootTarget, linkedRoot);
  run(generator, ['--output', linkedRoot], 1);
  assertBytes(
    path.join(linkedRootTarget, 'portable-contract.v1.jcs.json'),
    'root-sentinel',
    'output-root link/reparse rejection must not write through the root',
  );
  assert.deepEqual(filesUnder(linkedRootTarget), ['portable-contract.v1.jcs.json']);

  const hardLinkTarget = path.join(tempRoot, 'hard-link-target');
  const hardLinkOutput = path.join(tempRoot, 'hard-link-output');
  fs.writeFileSync(hardLinkTarget, 'hard-link-sentinel');
  fs.mkdirSync(hardLinkOutput);
  fs.linkSync(
    hardLinkTarget,
    path.join(hardLinkOutput, 'portable-contract.v1.jcs.json'),
  );
  run(generator, ['--output', hardLinkOutput], 1);
  assertBytes(
    hardLinkTarget,
    'hard-link-sentinel',
    'hard-linked external content must remain unchanged on rejection',
  );
  assertBytes(
    path.join(hardLinkOutput, 'portable-contract.v1.jcs.json'),
    'hard-link-sentinel',
  );

  const raceOutput = path.join(tempRoot, 'race-output');
  fs.mkdirSync(raceOutput);
  const raceSentinels = new Map();
  for (const relative of expectedFiles) {
    const sentinel = Buffer.from(`race-sentinel:${relative}`);
    raceSentinels.set(relative, sentinel);
    fs.writeFileSync(path.join(raceOutput, relative), sentinel);
  }
  const raceRenameSync = fs.renameSync;
  let stagedTargets = 0;
  fs.renameSync = function mutateOutputAfterStaging(source, destination) {
    const result = raceRenameSync.call(fs, source, destination);
    if (
      path.basename(path.dirname(destination)).startsWith('.race-output.staging.') &&
      expectedFiles.includes(path.basename(destination))
    ) {
      stagedTargets++;
      if (stagedTargets === expectedFiles.length) {
        fs.writeFileSync(
          path.join(raceOutput, 'portable-contract.v1.jcs.json'),
          'concurrent-output-won',
        );
      }
    }
    return result;
  };
  try {
    assert.throws(
      () => writePortableArtifact(packageRoot, raceOutput),
      /generated output changed after preflight/,
    );
  } finally {
    fs.renameSync = raceRenameSync;
  }
  assertBytes(
    path.join(raceOutput, 'portable-contract.v1.jcs.json'),
    'concurrent-output-won',
    'pre-install race rejection must preserve the concurrent writer result',
  );
  for (const [relative, sentinel] of raceSentinels) {
    if (relative === 'portable-contract.v1.jcs.json') continue;
    assert.deepEqual(fs.readFileSync(path.join(raceOutput, relative)), sentinel);
  }
  assert.deepEqual(
    fs.readdirSync(tempRoot).filter((name) => name.startsWith('.race-output.')),
    [],
    'pre-install race rejection must clean every owned staging/backup sibling',
  );

  const rollbackOutput = path.join(tempRoot, 'rollback-output');
  fs.mkdirSync(rollbackOutput);
  const rollbackSentinels = new Map();
  for (const relative of expectedFiles) {
    const sentinel = Buffer.from(`rollback-sentinel:${relative}`);
    rollbackSentinels.set(relative, sentinel);
    fs.writeFileSync(path.join(rollbackOutput, relative), sentinel);
  }
  const originalRenameSync = fs.renameSync;
  fs.renameSync = function failStagingInstall(source, destination) {
    if (
      path.resolve(destination) === path.resolve(rollbackOutput) &&
      path.basename(source).includes('.staging.')
    ) {
      const error = new Error('simulated staging-directory install failure');
      error.code = 'EIO';
      throw error;
    }
    return originalRenameSync.call(fs, source, destination);
  };
  try {
    assert.throws(
      () => writePortableArtifact(packageRoot, rollbackOutput),
      /simulated staging-directory install failure/,
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }
  for (const [relative, sentinel] of rollbackSentinels) {
    assert.deepEqual(fs.readFileSync(path.join(rollbackOutput, relative)), sentinel);
  }
  assert.deepEqual(
    fs.readdirSync(tempRoot).filter((name) => name.startsWith('.rollback-output.')),
    [],
    'failed directory-swap must clean its private staging and backup siblings',
  );

  run(generator, ['--output', second]);
  assert.deepEqual(filesUnder(second), expectedFiles);

  const immutableSources = [
    'manifests/ai-security-portable-release.v1.json',
    'schemas/ai-security-portable-source-manifest-v1.schema.json',
    'schemas/ai-security-portable-artifact-v1.schema.json',
    'schemas/ai-security-portable-release-manifest-v1.schema.json',
    'schemas/ai-security-policy-v1.defs.schema.json',
    'schemas/ai-security-policy-v1.strict-write.schema.json',
    'schemas/ai-security-policy-v1.tolerant-read.schema.json',
    'vectors/ai-security-policy-v1-schema-cases.json',
    'vectors/rfc8785-conformance.v1.json',
    'vectors/rfc8785-rejections.v1.json',
    'fixtures/ai-security-policy-v1-authority.json',
  ];
  const portableBoundarySources = new Set(immutableSources.slice(0, 4));
  for (const [index, relative] of immutableSources.entries()) {
    const mutatedRoot = path.join(tempRoot, `mutated-source-${index}`);
    clonePortableBuildInputs(mutatedRoot);
    fs.writeFileSync(path.join(mutatedRoot, ...relative.split('/')), '{}');
    assert.throws(
      () => buildPortableArtifact(mutatedRoot),
      /reviewed source digest mismatch/,
      `immutable release source mutation must fail closed: ${relative}`,
    );
    if (portableBoundarySources.has(relative)) {
      assert.throws(
        () => compareGeneratedDirectory(mutatedRoot, first),
        /reviewed source digest mismatch/,
        `generated check must reject portable boundary mutation: ${relative}`,
      );
    }
  }

  const malformedAuthorityRoot = path.join(tempRoot, 'malformed-authority');
  clonePortableBuildInputs(malformedAuthorityRoot);
  fs.writeFileSync(
    path.join(malformedAuthorityRoot, 'fixtures', 'ai-security-policy-v1-authority.json'),
    '{',
  );
  assert.throws(
    () => buildPortableArtifact(malformedAuthorityRoot),
    /reviewed source digest mismatch/,
    'authority fixture bytes must be bound before parsing',
  );

  const traversalContainer = path.join(tempRoot, 'traversal-container');
  const traversalRoot = path.join(traversalContainer, 'package');
  clonePortableBuildInputs(traversalRoot);
  fs.copyFileSync(
    path.join(packageRoot, 'fixtures', 'ai-security-policy-v1-authority.json'),
    path.join(traversalContainer, 'outside-authority.json'),
  );
  const traversalManifestPath = path.join(
    traversalRoot,
    'manifests',
    'ai-security-portable-release.v1.json',
  );
  const traversalSchemaPath = path.join(
    traversalRoot,
    'schemas',
    'ai-security-portable-source-manifest-v1.schema.json',
  );
  const traversalManifest = JSON.parse(fs.readFileSync(traversalManifestPath, 'utf8'));
  const traversalSchema = JSON.parse(fs.readFileSync(traversalSchemaPath, 'utf8'));
  traversalManifest.sources.authorityFixture = '../outside-authority.json';
  traversalSchema.properties.sources.properties.authorityFixture = { type: 'string' };
  fs.writeFileSync(traversalManifestPath, JSON.stringify(traversalManifest));
  fs.writeFileSync(traversalSchemaPath, JSON.stringify(traversalSchema));
  assert.throws(
    () => buildPortableArtifact(traversalRoot),
    /reviewed source digest mismatch/,
    'joint manifest/schema weakening must not escape packageRoot',
  );

  const invariantRoot = path.join(tempRoot, 'weakened-manifest-invariant');
  clonePortableBuildInputs(invariantRoot);
  const invariantManifestPath = path.join(
    invariantRoot,
    'manifests',
    'ai-security-portable-release.v1.json',
  );
  const invariantSchemaPath = path.join(
    invariantRoot,
    'schemas',
    'ai-security-portable-source-manifest-v1.schema.json',
  );
  const invariantManifest = JSON.parse(fs.readFileSync(invariantManifestPath, 'utf8'));
  invariantManifest.generatorVersion = '9.9.9';
  fs.writeFileSync(invariantManifestPath, JSON.stringify(invariantManifest));
  fs.writeFileSync(invariantSchemaPath, '{}');
  assert.throws(
    () => buildPortableArtifact(invariantRoot),
    /reviewed source digest mismatch/,
  );

  const linkedSourceRoot = path.join(tempRoot, 'linked-source-root');
  const externalFixtures = path.join(tempRoot, 'external-fixtures');
  clonePortableBuildInputs(linkedSourceRoot);
  fs.cpSync(path.join(linkedSourceRoot, 'fixtures'), externalFixtures, { recursive: true });
  fs.rmSync(path.join(linkedSourceRoot, 'fixtures'), { recursive: true });
  createDirectoryLink(externalFixtures, path.join(linkedSourceRoot, 'fixtures'));
  assert.throws(
    () => buildPortableArtifact(linkedSourceRoot),
    /symbolic link|reparse point/,
    'source directory links/reparse points must fail closed',
  );

  const linkedLeafRoot = path.join(tempRoot, 'linked-source-leaf');
  const linkedLeafTarget = path.join(tempRoot, 'linked-source-leaf-target.json');
  clonePortableBuildInputs(linkedLeafRoot);
  fs.copyFileSync(
    path.join(packageRoot, 'fixtures', 'ai-security-policy-v1-authority.json'),
    linkedLeafTarget,
  );
  const linkedLeaf = path.join(
    linkedLeafRoot,
    'fixtures',
    'ai-security-policy-v1-authority.json',
  );
  fs.rmSync(linkedLeaf);
  let linkedLeafCreated = false;
  try {
    fs.symlinkSync(linkedLeafTarget, linkedLeaf, 'file');
    linkedLeafCreated = true;
  } catch (error) {
    if (!error || !['EACCES', 'EPERM', 'UNKNOWN'].includes(error.code)) throw error;
  }
  if (linkedLeafCreated) {
    assert.throws(
      () => buildPortableArtifact(linkedLeafRoot),
      /symbolic link|reparse point/,
      'source leaf links/reparse points must fail closed',
    );
  }

  const oversizedSourceRoot = path.join(tempRoot, 'oversized-source');
  clonePortableBuildInputs(oversizedSourceRoot);
  fs.writeFileSync(
    path.join(oversizedSourceRoot, 'vectors', 'ai-security-policy-v1-schema-cases.json'),
    Buffer.alloc(1_048_577, 0x20),
  );
  assert.throws(
    () => buildPortableArtifact(oversizedSourceRoot),
    /source file exceeds 1048576 bytes before read/,
  );

  const artifactBytes = fs.readFileSync(path.join(first, 'portable-contract.v1.jcs.json'));
  const releaseBytes = fs.readFileSync(path.join(first, 'portable-contract-release.v1.jcs.json'));
  const sidecar = fs.readFileSync(path.join(first, 'portable-contract.v1.jcs.json.sha256'), 'utf8');
  const expectedDigest = digest(artifactBytes);
  assert.match(sidecar, /^sha256:[0-9a-f]{64}\n$/);
  assert.equal(sidecar, `${expectedDigest}\n`);
  assert.notEqual(artifactBytes.at(-1), 0x0a, 'canonical artifact must not have a trailing newline');
  assert.notEqual(releaseBytes.at(-1), 0x0a, 'canonical release descriptor must not have a trailing newline');

  const { canonicalizeJcs } = require('../dist/sqs-signer.js');
  const { parseStrictJsonBytes } = require('./lib/strict-json.cjs');
  const artifact = parseStrictJsonBytes(artifactBytes);
  const release = parseStrictJsonBytes(releaseBytes);
  assert.equal(canonicalizeJcs(artifact), artifactBytes.toString('utf8'));
  assert.equal(canonicalizeJcs(release), releaseBytes.toString('utf8'));

  const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  const artifactSchema = JSON.parse(fs.readFileSync(path.join(packageRoot, 'schemas', 'ai-security-portable-artifact-v1.schema.json'), 'utf8'));
  const releaseSchema = JSON.parse(fs.readFileSync(path.join(packageRoot, 'schemas', 'ai-security-portable-release-manifest-v1.schema.json'), 'utf8'));
  const sourceManifestSchema = JSON.parse(fs.readFileSync(path.join(packageRoot, 'schemas', 'ai-security-portable-source-manifest-v1.schema.json'), 'utf8'));
  const validateArtifact = ajv.compile(artifactSchema);
  const validateRelease = ajv.compile(releaseSchema);
  const validateSourceManifest = ajv.compile(sourceManifestSchema);
  assert.equal(validateArtifact(artifact), true, JSON.stringify(validateArtifact.errors));
  assert.equal(validateRelease(release), true, JSON.stringify(validateRelease.errors));

  const sourceManifest = parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'manifests', 'ai-security-portable-release.v1.json')));
  assert.equal(validateSourceManifest(sourceManifest), true, JSON.stringify(validateSourceManifest.errors));
  const unsafeSourceManifest = structuredClone(sourceManifest);
  unsafeSourceManifest.sources.authorityFixture = '../../outside.json';
  assert.equal(validateSourceManifest(unsafeSourceManifest), false);
  const activatingArtifact = structuredClone(artifact);
  activatingArtifact.runtimeActivatable = true;
  assert.equal(validateArtifact(activatingArtifact), false);
  const signedReleaseClaim = structuredClone(release);
  signedReleaseClaim.signature = 'not-authorized-in-c02';
  assert.equal(validateRelease(signedReleaseClaim), false);
  const embeddedSources = {
    definitions: 'ai-security-policy-v1.defs.schema.json',
    strictWrite: 'ai-security-policy-v1.strict-write.schema.json',
    tolerantRead: 'ai-security-policy-v1.tolerant-read.schema.json',
  };
  for (const [key, name] of Object.entries(embeddedSources)) {
    assert.deepEqual(
      artifact.v1Policy.schemas[key],
      parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'schemas', name))),
      `embedded schema differs from ${name}`,
    );
  }
  assert.deepEqual(
    artifact.v2Obligations.schema,
    parseStrictJsonBytes(
      fs.readFileSync(path.join(packageRoot, sourceManifest.sources.obligationSchema)),
    ),
  );
  assert.deepEqual(
    artifact.v2Obligations.catalog,
    parseStrictJsonBytes(
      fs.readFileSync(path.join(packageRoot, sourceManifest.sources.obligationCatalog)),
    ),
  );
  assert.deepEqual(
    artifact.failureOracle.schema,
    parseStrictJsonBytes(
      fs.readFileSync(path.join(packageRoot, sourceManifest.sources.failureOracleSchema)),
    ),
  );
  assert.deepEqual(
    artifact.failureOracle.catalog,
    parseStrictJsonBytes(
      fs.readFileSync(path.join(packageRoot, sourceManifest.sources.failureOracleCatalog)),
    ),
  );
  assert.deepEqual(
    [...Object.keys(artifact.v1Policy.orderedTuples)].sort(),
    [...sourceManifest.orderedTupleSymbols].sort(),
  );
  assert.deepEqual(
    artifact.v1Policy.schemaCases,
    parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'vectors', 'ai-security-policy-v1-schema-cases.json'))),
  );
  assert.deepEqual(
    artifact.v1Policy.authorityProof,
    parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'fixtures', 'ai-security-policy-v1-authority.json'))),
  );
  assert.equal(artifact.canonicalization.algorithm, 'RFC8785_JCS');
  assert.equal(artifact.canonicalization.digestAlgorithm, 'SHA-256');
  assert.deepEqual(
    artifact.canonicalization.conformanceVectors,
    parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'vectors', 'rfc8785-conformance.v1.json'))),
  );
  assert.deepEqual(
    artifact.canonicalization.strictIngestionRejectionVectors,
    parseStrictJsonBytes(fs.readFileSync(path.join(packageRoot, 'vectors', 'rfc8785-rejections.v1.json'))),
  );
  assert.equal(artifact.canonicalization.conformanceVectors.numberVectors.length, 27);
  assert.equal(artifact.canonicalization.strictIngestionRejectionVectors.cases.length, 23);

  assert.deepEqual(artifact.protocol.readableVersions, ['1', '2']);
  assert.deepEqual(artifact.protocol.writableVersions, ['1']);
  assert.equal(artifact.protocol.v2WriterEnabled, false);
  assert.equal(artifact.runtimeActivatable, false);
  assert.equal(artifact.signedRuntimePolicyBundle, false);
  assert.equal(artifact.requiredIntegrationGate, 'P0-C07');
  assert.equal(Object.hasOwn(artifact.deferredContractSections, 'fourAxisRuntimeTruth'), false);
  assert.deepEqual(artifact.deferredContractSections, { signingAndTrust: 'P0-S01' });
  assert.equal(release.artifactDigest, expectedDigest);
  assert.equal(release.artifactBytes, artifactBytes.length);
  assert.equal(release.runtimeActivatable, false);
  assert.equal(release.signedRuntimePolicyBundle, false);
  assert.equal(release.v2WriterEligible, false);
  assert.equal(release.requiredIntegrationGate, 'P0-C07');
  assert.equal('signature' in release, false);
  assert.equal('publicKey' in release, false);
  assert.equal('keyId' in release, false);
  assert.equal('issuedAt' in release, false);
  assert.equal('expiresAt' in release, false);

  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '0.3.0');
  const packageExports = require(packageRoot);
  assert.deepEqual(packageExports.AI_ENFORCEMENT_PROTOCOL_VERSIONS, ['1', '2']);
  assert.equal(packageExports.AI_SECURITY_V2_WRITER_ENABLED, false);
  assert.deepEqual(packageExports.AI_TRANSLATION_DISPOSITIONS, ['EXPRESSED', 'UNSUPPORTED_EFFECT', 'TRANSLATION_FAILED', 'NOT_APPLICABLE']);
  assert.deepEqual(packageExports.AI_SECURITY_OUTCOMES, ['PREVENTED', 'SANITIZED', 'RESTRICTED_COMPLETION', 'AUTHORIZED_COMPLETION', 'UNAUTHORIZED_EFFECT', 'UNKNOWN', 'NOT_APPLICABLE']);
  assert.deepEqual(packageExports.AI_RECEIPT_ASSURANCE, ['UNVERIFIED_LEGACY', 'VERIFIED_ENDPOINT_REPORT', 'INDEPENDENTLY_OBSERVED']);
  assert.deepEqual(packageExports.AI_ACTUAL_EFFECT_OBSERVERS, ['NONE', 'RUNTIME_ACK', 'BROWSER_CHECKPOINT', 'PROXY_CHECKPOINT', 'MCP_BROKER', 'FINAL_STATE_GRADER']);
  assert.deepEqual(artifact.v1Policy.policyCatalog, packageExports.AI_SECURITY_POLICY_V1_CATALOG);
  assert.deepEqual(artifact.v1Policy.directOmissionDefaults, packageExports.AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS);
  assert.deepEqual(artifact.v1Policy.readerFallbacks, packageExports.AI_SECURITY_POLICY_V1_READER_FALLBACKS);
  assert.deepEqual(artifact.v1Policy.recommendedPolicy, packageExports.RECOMMENDED_AI_SECURITY_POLICY_V1);

  const packRoot = path.join(tempRoot, 'pack');
  fs.mkdirSync(packRoot);
  const freshPackPackage = path.join(tempRoot, 'fresh-pack-package');
  cloneFreshPackPackage(freshPackPackage);
  assert.equal(fs.existsSync(path.join(freshPackPackage, 'dist')), false);
  const npm = npmCliInvocation();
  const packed = runCommand(
    npm.command,
    [...npm.prefix, 'pack', '--json', '--foreground-scripts=false', '--pack-destination', packRoot],
    freshPackPackage,
  );
  const packResult = JSON.parse(packed.stdout);
  assert.equal(packResult.length, 1);
  const packedPaths = packResult[0].files.map((entry) => entry.path).sort();
  for (const required of [
    'dist/index.d.ts',
    'dist/index.js',
    'dist/sqs-signer.d.ts',
    'dist/sqs-signer.js',
    ...expectedFiles.map((relative) => `generated/ai-security/0.3.0/${relative}`),
  ]) {
    assert.equal(packedPaths.includes(required), true, `packed artifact is missing ${required}`);
  }
  for (const forbidden of [
    'fixtures/',
    'manifests/',
    'schemas/',
    'scripts/',
    'src/',
    'vectors/',
  ]) {
    assert.equal(
      packedPaths.some((relative) => relative.startsWith(forbidden)),
      false,
      `packed artifact leaked build-only input ${forbidden}`,
    );
  }
  for (const forbidden of ['package-lock.json', 'tsconfig.json']) {
    assert.equal(packedPaths.includes(forbidden), false, `packed artifact leaked ${forbidden}`);
  }
  const tarball = path.join(packRoot, packResult[0].filename);
  const consumer = path.join(tempRoot, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true }));
  runCommand(
    npm.command,
    [...npm.prefix, 'install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund', tarball],
    consumer,
  );
  const installedRoot = path.join(consumer, 'node_modules', '@ceragon', 'shared-contracts');
  const installedExports = require(installedRoot);
  assert.deepEqual(installedExports.AI_ENFORCEMENT_PROTOCOL_VERSIONS, ['1', '2']);
  assert.deepEqual(
    filesUnder(path.join(installedRoot, 'generated', 'ai-security', '0.3.0')),
    expectedFiles,
  );

  assert.deepEqual(filesUnder(generatedRoot), expectedFiles);
  for (const relative of expectedFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(generatedRoot, relative)),
      fs.readFileSync(path.join(first, relative)),
      `checked-in generated output is stale: ${relative}`,
    );
  }
  run(checker);

  const stale = path.join(tempRoot, 'stale');
  fs.cpSync(first, stale, { recursive: true });
  fs.appendFileSync(path.join(stale, 'portable-contract.v1.jcs.json'), 'x');
  run(checker, ['--generated-root', stale], 1);
  fs.cpSync(first, stale, { recursive: true, force: true });
  fs.writeFileSync(path.join(stale, 'unexpected.txt'), 'unexpected');
  const tooManyResult = run(checker, ['--generated-root', stale], 1);
  assert.match(tooManyResult.stderr, /generated output entry limit exceeded/);

  const missing = path.join(tempRoot, 'missing');
  fs.cpSync(first, missing, { recursive: true });
  fs.rmSync(path.join(missing, 'portable-contract.v1.jcs.json.sha256'));
  run(checker, ['--generated-root', missing], 1);

  const nested = path.join(tempRoot, 'nested');
  fs.cpSync(first, nested, { recursive: true });
  fs.rmSync(path.join(nested, 'portable-contract-release.v1.jcs.json'));
  fs.mkdirSync(
    path.join(nested, 'portable-contract-release.v1.jcs.json', 'must-not-be-traversed'),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(
      nested,
      'portable-contract-release.v1.jcs.json',
      'must-not-be-traversed',
      'deep.txt'
    ),
    'deep',
  );
  const nestedResult = run(checker, ['--generated-root', nested], 1);
  assert.match(nestedResult.stderr, /generated output must be a regular file/);
  assert.doesNotMatch(nestedResult.stderr, /deep\.txt/);

  const linkedExportTarget = path.join(tempRoot, 'linked-export-target');
  const linkedExportRoot = path.join(tempRoot, 'linked-export-root');
  fs.mkdirSync(linkedExportTarget);
  createDirectoryLink(linkedExportTarget, linkedExportRoot);
  run(
    exporter,
    ['--output', linkedExportRoot, '--expect-digest', expectedDigest],
    1,
  );
  assert.deepEqual(
    filesUnder(linkedExportTarget),
    [],
    'export must reject an empty output-root link/reparse point before writing through it',
  );

  const nonemptyExport = path.join(tempRoot, 'nonempty-export');
  fs.mkdirSync(nonemptyExport);
  fs.writeFileSync(path.join(nonemptyExport, 'sentinel.txt'), 'export-sentinel');
  run(exporter, ['--output', nonemptyExport, '--expect-digest', expectedDigest], 1);
  assertBytes(
    path.join(nonemptyExport, 'sentinel.txt'),
    'export-sentinel',
    'nonempty export rejection must preserve sentinel bytes',
  );
  assert.deepEqual(filesUnder(nonemptyExport), ['sentinel.txt']);

  const exportHardLinkTarget = path.join(tempRoot, 'export-hard-link-target');
  const exportHardLinkRoot = path.join(tempRoot, 'export-hard-link-root');
  fs.writeFileSync(exportHardLinkTarget, 'export-hard-link-sentinel');
  fs.mkdirSync(exportHardLinkRoot);
  fs.linkSync(
    exportHardLinkTarget,
    path.join(exportHardLinkRoot, 'portable-contract.v1.jcs.json'),
  );
  run(exporter, ['--output', exportHardLinkRoot, '--expect-digest', expectedDigest], 1);
  assertBytes(
    exportHardLinkTarget,
    'export-hard-link-sentinel',
    'export rejection must not clobber a hard-linked external sentinel',
  );

  const emptyExport = path.join(tempRoot, 'empty-export');
  fs.mkdirSync(emptyExport);
  run(exporter, ['--output', emptyExport, '--expect-digest', expectedDigest]);
  assert.deepEqual(filesUnder(emptyExport), expectedFiles);
  for (const relative of expectedFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(emptyExport, relative)),
      fs.readFileSync(path.join(first, relative)),
    );
  }

  const exported = path.join(tempRoot, 'exported');
  run(exporter, ['--output', exported], 1);
  run(exporter, ['--output', exported, '--expect-digest', `sha256:${'0'.repeat(64)}`], 1);
  run(
    exporter,
    ['--output', exported, '--output', exported, '--expect-digest', expectedDigest],
    1,
  );
  run(exporter, ['--output', exported, '--expect-digest', expectedDigest]);
  assert.deepEqual(filesUnder(exported), expectedFiles);
  for (const relative of expectedFiles) {
    assert.deepEqual(fs.readFileSync(path.join(exported, relative)), fs.readFileSync(path.join(first, relative)));
  }

  const serialized = `${artifactBytes.toString('utf8')}\n${releaseBytes.toString('utf8')}`;
  assert.equal(serialized.includes(packageRoot.replaceAll('\\', '/')), false);
  assert.equal(serialized.includes(packageRoot), false);
  assert.equal(serialized.includes('runtimeActivatable":true'), false);
  assert.doesNotMatch(serialized, /(?:^|["\s])[A-Za-z]:(?:\/|\\{1,2})/, 'artifact must not contain an absolute Windows path');
  const forbiddenRawKeys = new Set([
    'rawPrompt',
    'rawValue',
    'rawContent',
    'modelOutput',
    'toolArguments',
    'urlQuery',
    'preview',
    'filename',
    'recipient',
    'rawCommand',
  ]);
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbiddenRawKeys.has(key), false, `forbidden raw-content key in artifact: ${key}`);
      visit(nested);
    }
  };
  visit(artifact);

  console.log(`AI security portable artifact tests passed (${expectedDigest})`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
