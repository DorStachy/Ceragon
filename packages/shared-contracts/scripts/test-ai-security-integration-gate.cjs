'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const dockerTest = process.env.CERAGON_C07_RUN_DOCKER_TESTS === '1' ? test : test.skip;
const Ajv = require('ajv');

const {
  APPROVED_INPUTS,
  FIXED_CONTAINER_IMAGES,
  INTEGRATION_SCHEMA_DESCRIPTOR,
  assertCanonicalByteEquality,
  buildCanonicalDockerContext,
  buildCompatibilityMatrix,
  assertRepositoryAtPin,
  createProtectedSnapshotter,
  createHermeticCommandEnvironment,
  createBoundedTerminationController,
  containerControlArgs,
  parseCreatedContainerId,
  performVerifiedContainedCleanup,
  validateContainedContainerInspection,
  performVerifiedImageCleanup,
  loadReviewedIntegrationManifest,
  materializeRepositorySnapshot,
  runBoundedProcess,
  runContainedProcess,
  runPriorCanonicalProfile,
  runFixedProfile,
  testing,
  validateIntegrationManifest,
  verifyDockerExecutionEnvironment,
  verifyPinnedConsumer,
} = require('./lib/ai-security-integration-gate.cjs');

const {
  DRIVER_IDS,
  stableJson,
} = require('./lib/ai-security-semantic-receipts.cjs');

function digest(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

const SEMANTIC_TEST_PACKAGE_ROOT = path.resolve(__dirname, '..');
const SEMANTIC_TEST_ARTIFACT_BYTES = fs.readFileSync(path.join(
  SEMANTIC_TEST_PACKAGE_ROOT,
  'generated',
  'ai-security',
  '0.3.0',
  'portable-contract.v1.jcs.json',
));
const SEMANTIC_TEST_RECEIPT = JSON.parse(fs.readFileSync(path.join(
  SEMANTIC_TEST_PACKAGE_ROOT,
  'fixtures',
  'test-only',
  'ai-security-semantic-receipt-backend.v1.json',
), 'utf8'));
const SEMANTIC_TEST_DRIVER_BYTES = Buffer.from(
  "'use strict';\n// reviewed C07 semantic driver fixture\n",
  'utf8',
);
const SEMANTIC_TEST_DRIVER_SHA256 = digest(SEMANTIC_TEST_DRIVER_BYTES);

function semanticEnvelopeHarness(options = {}) {
  const consumer = 'backend';
  const runChallenge = options.runChallenge || 'a'.repeat(64);
  const sourceCommit = options.sourceCommit || '1'.repeat(40);
  const sourceTree = options.sourceTree || '2'.repeat(40);
  const snapshotManifestSha256 = options.snapshotManifestSha256 || `sha256:${'3'.repeat(64)}`;
  const inputImageId = options.inputImageId || `sha256:${'4'.repeat(64)}`;
  const snapshot = {
    proof: {
      commit: sourceCommit,
      tree: sourceTree,
      manifestSha256: snapshotManifestSha256,
    },
  };
  const inputImage = { id: inputImageId };
  const driverArtifact = {
    consumer,
    driverId: DRIVER_IDS[consumer],
    bytes: SEMANTIC_TEST_DRIVER_BYTES.length,
    sha256: SEMANTIC_TEST_DRIVER_SHA256,
  };
  const driverWitness = { exactBytes: Buffer.from(SEMANTIC_TEST_DRIVER_BYTES) };
  const envelope = {
    format: 'ceragon.ai-security.contained-semantic-envelope',
    formatVersion: 1,
    runChallenge,
    consumer,
    sourceCommit,
    sourceTree,
    snapshotManifestSha256,
    inputImageId,
    driverId: driverArtifact.driverId,
    driverBytes: driverArtifact.bytes,
    driverSha256: driverArtifact.sha256,
    semanticReceipt: structuredClone(SEMANTIC_TEST_RECEIPT),
    ...(options.envelope || {}),
  };
  const rawStdout = Buffer.from(`${stableJson(envelope)}\n`, 'utf8');
  const execution = {
    stdoutBytes: rawStdout.length,
    stdoutSha256: digest(rawStdout),
    stderrBytes: 0,
    stderrSha256: digest(Buffer.alloc(0)),
    ...(options.execution || {}),
  };
  const semanticRun = {
    snapshot,
    inputImage,
    consumer,
    driverArtifact,
    driverWitness,
    runChallenge,
    rawStdout,
    ...(options.semanticRun || {}),
  };
  const executionWitness = {
    snapshot,
    inputImage,
    challengeSha256: digest(Buffer.from(runChallenge, 'ascii')),
    stdoutBytes: execution.stdoutBytes,
    stderrBytes: execution.stderrBytes,
    ...(options.executionWitness || {}),
  };
  return {
    artifactBytes: SEMANTIC_TEST_ARTIFACT_BYTES,
    execution,
    semanticRun,
    executionWitness,
  };
}

function assertSemanticEnvelopeInvariant(harness, invariantId) {
  assert.throws(
    () => testing.validateContainedSemanticEnvelopeBytes(harness),
    (error) => {
      assert.equal(error.code, 'SEMANTIC_ENVELOPE_REJECTED');
      assert.equal(error.invariantId, invariantId);
      assert.match(error.diagnosticSha256, /^sha256:[0-9a-f]{64}$/);
      return true;
    },
  );
}

test('semantic stdout authority is one-shot, identity-bound, and wipes owned bytes', () => {
  const harness = semanticEnvelopeHarness();
  const authority = testing.createOneShotSemanticRunAuthority();
  const owned = harness.semanticRun.rawStdout;
  authority.retain(harness.execution, Object.freeze(harness.semanticRun));
  assert.throws(
    () => authority.consume({ ...harness.execution }, () => null),
    /no retained stdout provenance/,
  );
  assert.equal(authority.consume(harness.execution, (witness) => witness.consumer), 'backend');
  assert.equal(owned.every((byte) => byte === 0), true, 'consumed semantic stdout was not wiped');
  assert.throws(() => authority.consume(harness.execution, () => null), /already consumed/);

  const discarded = semanticEnvelopeHarness({ runChallenge: 'b'.repeat(64) });
  const discardAuthority = testing.createOneShotSemanticRunAuthority();
  const discardedBytes = discarded.semanticRun.rawStdout;
  discardAuthority.retain(discarded.execution, Object.freeze(discarded.semanticRun));
  assert.equal(discardAuthority.discard(discarded.execution), true);
  assert.equal(discardedBytes.every((byte) => byte === 0), true, 'discarded semantic stdout was not wiped');
  assert.equal(discardAuthority.discard(discarded.execution), false);

  const rejected = semanticEnvelopeHarness({ runChallenge: 'c'.repeat(64) });
  const rejectionAuthority = testing.createOneShotSemanticRunAuthority();
  const rejectedBytes = rejected.semanticRun.rawStdout;
  rejectionAuthority.retain(rejected.execution, Object.freeze(rejected.semanticRun));
  assert.throws(
    () => rejectionAuthority.consume(rejected.execution, () => { throw new Error('reject'); }),
    /reject/,
  );
  assert.equal(rejectedBytes.every((byte) => byte === 0), true, 'rejected semantic stdout was not wiped');
});

test('exact contained semantic envelope reaches the reviewed semantic oracle', () => {
  const accepted = testing.validateContainedSemanticEnvelopeBytes(semanticEnvelopeHarness());
  assert.equal(accepted.consumer, 'backend');
  assert.equal(accepted.driverBinding.driverId, DRIVER_IDS.backend);
  assert.equal(accepted.semanticReceipt.consumerId, 'BACKEND');
  assert.equal(accepted.semanticReceipt.verifiedCaseCount, 8);
  assert.equal(accepted.semanticReceipt.verifiedResultCount, 9);
  assert.equal(accepted.semanticReceipt.verifiedRankFamilyCount, 8);
});

test('contained semantic envelope rejects transport, splice, driver, and inner-receipt tampering', () => {
  const countChanged = semanticEnvelopeHarness();
  countChanged.execution.stdoutBytes += 1;
  assertSemanticEnvelopeInvariant(countChanged, 'EXACT_CANONICAL_STDOUT_TRANSPORT');

  const hashChanged = semanticEnvelopeHarness();
  hashChanged.execution.stdoutSha256 = `sha256:${'0'.repeat(64)}`;
  assertSemanticEnvelopeInvariant(hashChanged, 'EXACT_CANONICAL_STDOUT_TRANSPORT');

  const trailingOutput = semanticEnvelopeHarness();
  trailingOutput.semanticRun.rawStdout = Buffer.concat([
    trailingOutput.semanticRun.rawStdout,
    Buffer.from('x', 'ascii'),
  ]);
  trailingOutput.execution.stdoutBytes = trailingOutput.semanticRun.rawStdout.length;
  trailingOutput.execution.stdoutSha256 = digest(trailingOutput.semanticRun.rawStdout);
  trailingOutput.executionWitness.stdoutBytes = trailingOutput.execution.stdoutBytes;
  assertSemanticEnvelopeInvariant(trailingOutput, 'EXACT_CANONICAL_STDOUT_TRANSPORT');

  const stderrOutput = semanticEnvelopeHarness();
  stderrOutput.execution.stderrBytes = 1;
  stderrOutput.execution.stderrSha256 = digest(Buffer.from('x', 'ascii'));
  stderrOutput.executionWitness.stderrBytes = 1;
  assertSemanticEnvelopeInvariant(stderrOutput, 'EXACT_CANONICAL_STDOUT_TRANSPORT');

  const wrongChallenge = semanticEnvelopeHarness({
    envelope: { runChallenge: 'd'.repeat(64) },
  });
  assertSemanticEnvelopeInvariant(wrongChallenge, 'RUN_NONCE_SOURCE_IMAGE_BINDING');

  const runA = semanticEnvelopeHarness({ runChallenge: 'e'.repeat(64) });
  const runB = semanticEnvelopeHarness({
    runChallenge: 'f'.repeat(64),
    sourceCommit: '5'.repeat(40),
    sourceTree: '6'.repeat(40),
    snapshotManifestSha256: `sha256:${'7'.repeat(64)}`,
    inputImageId: `sha256:${'8'.repeat(64)}`,
  });
  runB.semanticRun.rawStdout = Buffer.from(runA.semanticRun.rawStdout);
  runB.execution.stdoutBytes = runB.semanticRun.rawStdout.length;
  runB.execution.stdoutSha256 = digest(runB.semanticRun.rawStdout);
  runB.executionWitness.stdoutBytes = runB.execution.stdoutBytes;
  assertSemanticEnvelopeInvariant(runB, 'RUN_NONCE_SOURCE_IMAGE_BINDING');

  const driverCountChanged = semanticEnvelopeHarness({
    envelope: { driverBytes: SEMANTIC_TEST_DRIVER_BYTES.length + 1 },
  });
  assertSemanticEnvelopeInvariant(driverCountChanged, 'EXACT_REVIEWED_DRIVER_BINDING');

  const driverHashChanged = semanticEnvelopeHarness({
    envelope: { driverSha256: `sha256:${'9'.repeat(64)}` },
  });
  assertSemanticEnvelopeInvariant(driverHashChanged, 'EXACT_REVIEWED_DRIVER_BINDING');

  const innerReceipt = structuredClone(SEMANTIC_TEST_RECEIPT);
  innerReceipt.cases[0].observationSha256 = `sha256:${'0'.repeat(64)}`;
  const receiptChanged = semanticEnvelopeHarness({
    envelope: { semanticReceipt: innerReceipt },
  });
  assertSemanticEnvelopeInvariant(receiptChanged, 'INNER_EXACT_SEMANTIC_ORACLE');
});

test('a reviewed integration input is read once as exact bytes and tamper fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-protected-'));
  try {
    const bytes = Buffer.from('{"format":"fixture"}\n');
    fs.writeFileSync(path.join(root, 'manifest.json'), bytes);
    const descriptor = {
      path: 'manifest.json',
      bytes: bytes.length,
      sha256: digest(bytes),
    };

    const snapshotter = createProtectedSnapshotter(root);
    const snapshot = snapshotter.snapshot(descriptor, 'integration manifest');
    assert.deepEqual(snapshot.bytes, bytes);
    assert.throws(
      () => snapshotter.snapshot(descriptor, 'integration manifest'),
      /must not be read more than once/,
    );

    fs.appendFileSync(path.join(root, 'manifest.json'), 'x');
    assert.throws(
      () => createProtectedSnapshotter(root).snapshot(descriptor, 'integration manifest'),
      /byte count mismatch|SHA-256 mismatch/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('repository inputs require the exact approved commit/tree and a clean worktree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-repo-'));
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'approved\n');
    runGit(root, ['add', 'tracked.txt']);
    runGit(root, ['commit', '--quiet', '-m', 'approved input']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };

    const proof = await assertRepositoryAtPin(root, pin, 'fixture repository');
    assert.deepEqual(proof, pin);
    await assert.rejects(
      assertRepositoryAtPin(root, { ...pin, commit: '0'.repeat(40) }, 'fixture repository'),
      /commit mismatch/,
    );

    fs.writeFileSync(path.join(root, 'untracked.txt'), 'dirty\n');
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'fixture repository'),
      /must be clean/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('trusted Git treats unrepresentable Windows file modes as clean but preserves tree authority', async () => {
  assert.equal(testing.trustedGitFileModeSetting('win32'), 'false');
  assert.equal(testing.trustedGitFileModeSetting('linux'), 'true');
  assert.equal(testing.trustedGitFileModeSetting('darwin'), 'true');
  assert.equal(testing.trustedGitAutoCrLfSetting('win32'), 'true');
  assert.equal(testing.trustedGitAutoCrLfSetting('linux'), 'false');
  assert.equal(testing.trustedGitAutoCrLfSetting('darwin'), 'false');
  if (process.platform !== 'win32') return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-filemode-'));
  let snapshot;
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, 'reviewed.sh'), '#!/bin/sh\nexit 9\n');
    runGit(root, ['add', 'reviewed.sh']);
    runGit(root, ['update-index', '--chmod=+x', 'reviewed.sh']);
    runGit(root, ['commit', '--quiet', '-m', 'reviewed executable']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };
    assert.match(runGit(root, ['ls-tree', 'HEAD', 'reviewed.sh']), /^100755 blob /);
    assert.deepEqual(await assertRepositoryAtPin(root, pin, 'Windows executable fixture'), pin);

    snapshot = await materializeRepositorySnapshot(root, pin, 'Windows executable snapshot');
    const context = snapshot.buildDockerContext('node').bytes;
    let offset = 0;
    let reviewedMode = null;
    while (offset + 512 <= context.length) {
      const header = context.subarray(offset, offset + 512);
      if (header.every((byte) => byte === 0)) break;
      const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
      const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
      const relative = prefix ? `${prefix}/${name}` : name;
      const mode = Number.parseInt(header.subarray(100, 108).toString('ascii').replace(/\0.*$/, ''), 8);
      const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''), 8);
      if (relative === 'snapshot/reviewed.sh') reviewedMode = mode;
      offset += 512 + (Math.ceil(size / 512) * 512);
    }
    assert.equal(reviewedMode, 0o755, 'raw 100755 tree mode was not preserved in the canonical context');

    fs.writeFileSync(path.join(root, 'reviewed.sh'), '#!/bin/sh\nexit 0\n');
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'mutated Windows executable fixture'),
      /must be clean/,
    );
    assert.equal(snapshot.verify(), true, 'committed snapshot changed with mutable worktree content');
  } finally {
    if (snapshot) snapshot.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('snapshot path-set verification is bytewise across nesting and Unicode', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-path-order-'));
  let snapshot;
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.mkdirSync(path.join(root, 'a'));
    fs.writeFileSync(path.join(root, 'a-b.txt'), 'hyphen\n');
    fs.writeFileSync(path.join(root, 'a', 'b.txt'), 'slash\n');
    fs.writeFileSync(path.join(root, 'caf\u00e9.txt'), 'composed\n');
    fs.writeFileSync(path.join(root, 'cafe\u0301.txt'), 'decomposed\n');
    runGit(root, ['add', '--all']);
    runGit(root, ['commit', '--quiet', '-m', 'path ordering fixture']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };
    snapshot = await materializeRepositorySnapshot(root, pin, 'path ordering snapshot');
    assert.equal(snapshot.verify(), true);

    fs.rmSync(path.join(snapshot.root, 'a-b.txt'));
    assert.throws(() => snapshot.verify(), /snapshot file set changed/);
    fs.writeFileSync(path.join(snapshot.root, 'a-b.txt'), 'hyphen\n');
    fs.writeFileSync(path.join(snapshot.root, 'extra.txt'), 'extra\n');
    assert.throws(() => snapshot.verify(), /snapshot file set changed/);
    fs.rmSync(path.join(snapshot.root, 'extra.txt'));
    assert.equal(snapshot.verify(), true);

    const oid = '1'.repeat(40);
    const collision = Buffer.from(
      `100644 blob ${oid} 1\tCase.txt\0`
        + `100644 blob ${oid} 1\tcase.txt\0`,
      'utf8',
    );
    if (process.platform === 'win32') {
      assert.throws(
        () => testing.parseTreeEntries(collision, 'case collision fixture'),
        /platform path collision/,
      );
    } else {
      assert.doesNotThrow(() => testing.parseTreeEntries(collision, 'case collision fixture'));
    }
  } finally {
    if (snapshot) snapshot.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the accepted manifest cannot omit or placeholder the browser consumer', () => {
  const packageRoot = path.resolve(__dirname, '..');
  const pendingBytes = fs.readFileSync(
    path.join(packageRoot, 'fixtures', 'ai-security-integration-input-manifest-v1.pending.json'),
  );
  const pending = JSON.parse(pendingBytes);
  assert.throws(
    () => validateIntegrationManifest(pending),
    /pending non-acceptance|browser C05/i,
  );

  const injected = structuredClone(loadReviewedIntegrationManifest(packageRoot));
  injected.consumers.browser = {
    repository: 'Installers/browser-extension',
    commit: 'b'.repeat(40),
    tree: 'c'.repeat(40),
    profile: 'BROWSER_C05_V1',
    pin: { path: 'browser-extension/pin.json', bytes: 1, sha256: `sha256:${'d'.repeat(64)}` },
    command: 'attacker-controlled',
  };
  assert.throws(
    () => validateIntegrationManifest(injected),
    /unexpected field command|browser C05/i,
   );
 });
test('protected reads reject traversal, reparse ancestors, hardlinks, and read races', () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-links-'));
  try {
    const root = path.join(container, 'root');
    const outside = path.join(container, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const outsideFile = path.join(outside, 'manifest.json');
    fs.writeFileSync(outsideFile, '{}');
    const descriptor = { path: 'manifest.json', bytes: 2, sha256: digest(Buffer.from('{}')) };

    assert.throws(
      () => createProtectedSnapshotter(root).snapshot({ ...descriptor, path: '../outside/manifest.json' }, 'traversal'),
      /not canonical|escapes protected root/,
    );

    const linkedAncestor = path.join(root, 'linked');
    fs.symlinkSync(outside, linkedAncestor, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => createProtectedSnapshotter(root).snapshot({ ...descriptor, path: 'linked/manifest.json' }, 'linked ancestor'),
      /symlink, junction, or reparse point|reparse indirection/,
    );

    const linkedRoot = path.join(container, 'linked-root');
    fs.symlinkSync(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => createProtectedSnapshotter(linkedRoot), /symlink, junction, or reparse point|non-reparse/);

    const hardTarget = path.join(container, 'hard-target');
    fs.writeFileSync(hardTarget, '{}');
    fs.linkSync(hardTarget, path.join(root, 'manifest.json'));
    assert.throws(
      () => createProtectedSnapshotter(root).snapshot(descriptor, 'hardlinked manifest'),
      /must not be hard-linked/,
    );
    fs.rmSync(path.join(root, 'manifest.json'));

    fs.writeFileSync(path.join(root, 'manifest.json'), '{}');
    const originalReadSync = fs.readSync;
    let mutated = false;
    fs.readSync = function mutateAfterFirstRead(...args) {
      const count = originalReadSync.apply(fs, args);
      if (!mutated && count > 0) {
        mutated = true;
        fs.appendFileSync(path.join(root, 'manifest.json'), 'x');
      }
      return count;
    };
    try {
      assert.throws(
        () => createProtectedSnapshotter(root).snapshot(descriptor, 'racing manifest'),
        /grew while read|changed while read/,
      );
    } finally {
      fs.readSync = originalReadSync;
    }
    assert.equal(mutated, true);
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});
test('fixed subprocess execution is content-free, bounded, timed, and fail-closed', async () => {
  const cwd = os.tmpdir();
  const success = await runBoundedProcess(
    {
      id: 'fixture.success',
      command: process.execPath,
      args: ['-e', "process.stdout.write('ok'); process.stderr.write('e')"],
      cwd,
    },
    { timeoutMs: 5_000, maxStdoutBytes: 16, maxStderrBytes: 16 },
  );
  assert.deepEqual(success, {
    id: 'fixture.success',
    status: 'PASS',
    exitCode: 0,
    stdoutBytes: 2,
    stdoutSha256: digest(Buffer.from('ok')),
    stderrBytes: 1,
    stderrSha256: digest(Buffer.from('e')),
  });
  assert.equal(JSON.stringify(success).includes('ok'), false, 'machine evidence leaked stdout');

  await assert.rejects(
    runBoundedProcess(
      { id: 'fixture.failure', command: process.execPath, args: ['-e', 'process.exit(7)'], cwd },
      { timeoutMs: 5_000, maxStdoutBytes: 16, maxStderrBytes: 16 },
    ),
    (error) => error.code === 'COMMAND_FAILED' && !error.message.includes(process.execPath),
  );
  await assert.rejects(
    runBoundedProcess(
      { id: 'fixture.timeout', command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd },
      { timeoutMs: 50, maxStdoutBytes: 16, maxStderrBytes: 16 },
    ),
    (error) => error.code === 'COMMAND_TIMEOUT',
  );
  await assert.rejects(
    runBoundedProcess(
      { id: 'fixture.output', command: process.execPath, args: ['-e', "process.stdout.write('x'.repeat(17))"], cwd },
      { timeoutMs: 5_000, maxStdoutBytes: 16, maxStderrBytes: 16 },
    ),
    (error) => error.code === 'COMMAND_OUTPUT_LIMIT',
  );
  await assert.rejects(
    runBoundedProcess(
      { id: 'fixture.missing', command: path.join(cwd, 'definitely-missing-c07-command'), args: [], cwd },
      { timeoutMs: 5_000, maxStdoutBytes: 16, maxStderrBytes: 16 },
    ),
    (error) => error.code === 'COMMAND_SPAWN_ERROR',
  );
});
function descriptorFor(relative, bytes) {
  return { path: relative, bytes: bytes.length, sha256: digest(bytes) };
}

function writeFixtureFile(root, relative, bytes) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
  return descriptorFor(relative, bytes);
}

test('consumer pins bind every described byte and cannot activate a writer or runtime', () => {
  const packageRoot = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-pin-'));
  try {
    const sourceDirectory = path.join(packageRoot, 'generated', 'ai-security', '0.4.0');
    const artifactBytes = fs.readFileSync(path.join(sourceDirectory, 'portable-contract.v1.jcs.json'));
    const releaseBytes = fs.readFileSync(path.join(sourceDirectory, 'portable-contract-release.v1.jcs.json'));
    const sidecarBytes = fs.readFileSync(path.join(sourceDirectory, 'portable-contract.v1.jcs.json.sha256'));
    const artifact = writeFixtureFile(root, 'contracts/ai-security/0.4.0/portable-contract.v1.jcs.json', artifactBytes);
    const releaseManifest = writeFixtureFile(root, 'contracts/ai-security/0.4.0/portable-contract-release.v1.jcs.json', releaseBytes);
    const digestSidecar = writeFixtureFile(root, 'contracts/ai-security/0.4.0/portable-contract.v1.jcs.json.sha256', sidecarBytes);
    const projectionSource = writeFixtureFile(root, 'scripts/lib/frontend-projection.cjs', Buffer.from('module.exports = {};\n'));
    const generatedProjection = writeFixtureFile(root, 'types/generated/frontend-projection.ts', Buffer.from('export {};\n'));

    const pin = {
      format: 'ceragon.ai-security.frontend-consumer-pin',
      formatVersion: 1,
      consumer: 'Frontend',
      sourceCommit: 'c311b71e945e2098beabfa6df619be2c6ee9e5fd',
      sourcePackage: { name: '@ceragon/shared-contracts', version: '0.4.0' },
      policySchemaVersion: 1,
      canonicalGenerator: { name: 'ceragon-ai-security-artifact', version: '1.3.0' },
      projectionGenerator: {
        name: 'ceragon-ai-security-frontend-projection',
        version: 'fixture.1',
        source: projectionSource,
      },
      artifact: { directory: 'contracts/ai-security/0.4.0', ...artifact },
      releaseManifest,
      digestSidecar,
      generatedProjection,
      requiredIntegrationGate: 'P0-C07',
      runtimeActivatable: false,
      v2WriterEnabled: false,
    };
    const pinBytes = Buffer.from(`${JSON.stringify(pin, null, 2)}\n`);
    const pinDescriptor = writeFixtureFile(root, 'ai-security-frontend-consumer-pin.v1.json', pinBytes);
    const entry = {
      repository: 'Frontend',
      commit: 'b78460df7134d0d4f70915006242473b16e8ac82',
      tree: 'b0488302be097af466f599d8608f7fa43b425ac5',
      profile: 'FRONTEND_C06_V1',
      pin: pinDescriptor,
    };

    const verified = verifyPinnedConsumer(root, entry, 'frontend');
    assert.equal(verified.consumer, 'frontend');
    assert.equal(verified.verifiedFileCount, 6);
    assert.deepEqual(verified.artifactBytes, artifactBytes);

    fs.appendFileSync(path.join(root, generatedProjection.path), 'x');
    assert.throws(
      () => verifyPinnedConsumer(root, entry, 'frontend'),
      /byte count mismatch|SHA-256 mismatch/,
    );

    pin.runtimeActivatable = true;
    const activeBytes = Buffer.from(`${JSON.stringify(pin, null, 2)}\n`);
    const activeDescriptor = descriptorFor('ai-security-frontend-consumer-pin.v1.json', activeBytes);
    fs.writeFileSync(path.join(root, activeDescriptor.path), activeBytes);
    assert.throws(
      () => verifyPinnedConsumer(root, { ...entry, pin: activeDescriptor }, 'frontend'),
      /runtimeActivatable/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('host exit-zero scripts cannot become contained semantic authority', async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-profile-'));
  const root = path.join(container, 'frontend & must-not-execute');
  const sentinel = path.join(container, 'must-not-execute');
  try {
    fs.mkdirSync(root);
    const script = Buffer.from("process.stdout.write('profile-ok');\n");
    writeFixtureFile(root, 'scripts/check-ai-security-frontend-consumer.cjs', script);
    writeFixtureFile(root, 'scripts/test-ai-security-frontend-consumer.cjs', script);
    writeFixtureFile(root, 'node_modules/jest/bin/jest.js', script);
    await assert.rejects(
      async () => runFixedProfile('frontend', root),
      /repository|contained|immutable|commit|snapshot/i,
    );
    assert.equal(fs.existsSync(sentinel), false, 'root text was interpreted as shell syntax');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
});
test('status-only commands and caller-created rollback objects cannot mint compatibility', () => {
  const profiles = Object.fromEntries(['backend', 'installer', 'browser', 'frontend'].map((consumer) => [
    consumer,
    {
      consumerId: consumer.toUpperCase(),
      status: 'PASS',
      commands: [{ id: `${consumer}.forged`, status: 'PASS', exitCode: 0 }],
    },
  ]));
  const literalRollback = {
    sourceCommit: APPROVED_INPUTS.priorCanonical.commit,
    sourceTree: APPROVED_INPUTS.priorCanonical.tree,
    canonicalArtifactAbsent: true,
    priorSourceMounted: false,
  };
  assert.throws(
    () => buildCompatibilityMatrix({ profiles, rollback: literalRollback }),
    /profile has no contained authority provenance/,
  );
  assert.throws(
    () => buildCompatibilityMatrix({ profiles: structuredClone(profiles), rollback: literalRollback }),
    /profile has no contained authority provenance/,
  );
});
test('the protected schema rejects pending input and loads only the reviewed accepted manifest', () => {
  const packageRoot = path.resolve(__dirname, '..');
  const schemaSnapshot = createProtectedSnapshotter(packageRoot).snapshot(
    INTEGRATION_SCHEMA_DESCRIPTOR,
    'integration schema',
  );
  const schema = JSON.parse(schemaSnapshot.bytes.toString('utf8'));
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  const pending = JSON.parse(fs.readFileSync(
    path.join(packageRoot, 'fixtures', 'ai-security-integration-input-manifest-v1.pending.json'),
  ));
  assert.equal(validate(pending), false, 'pending browser fixture unexpectedly passed accepted schema');

  const accepted = loadReviewedIntegrationManifest(packageRoot);
  assert.equal(validate(accepted), true, JSON.stringify(validate.errors));
  assert.equal(accepted.acceptance, 'ACCEPTED');
  assert.deepEqual(accepted.consumers.browser, APPROVED_INPUTS.consumers.browser);
  assert.deepEqual(accepted.consumers.backend, APPROVED_INPUTS.consumers.backend);
  assert.deepEqual(accepted.consumers.installer, APPROVED_INPUTS.consumers.installer);
});

test('canonical equality compares exact bytes across all four consumers', () => {
  const canonical = {
    artifactBytes: Buffer.from('artifact'),
    releaseBytes: Buffer.from('release'),
    sidecarBytes: Buffer.from('sidecar'),
  };
  const makeConsumer = () => ({
    artifactBytes: Buffer.from('artifact'),
    releaseBytes: Buffer.from('release'),
    sidecarBytes: Buffer.from('sidecar'),
  });
  const consumers = {
    backend: makeConsumer(),
    installer: makeConsumer(),
    browser: makeConsumer(),
    frontend: makeConsumer(),
  };
  assert.equal(assertCanonicalByteEquality(canonical, consumers), true);
  consumers.browser.artifactBytes = Buffer.from('artifact-tampered');
  assert.throws(
    () => assertCanonicalByteEquality(canonical, consumers),
    /browser artifact differs byte-for-byte/,
  );
});
test('repository proof ignores hostile Git redirection and PATH substitution', async () => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-git-env-'));
  const target = path.join(container, 'target');
  const decoy = path.join(container, 'decoy');
  const maliciousBin = path.join(container, 'malicious-bin');
  const sentinel = path.join(container, 'path-git-executed');
  const saved = Object.fromEntries(
    ['PATH', 'Path', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM']
      .map((key) => [key, process.env[key]]),
  );
  try {
    for (const root of [target, decoy]) {
      fs.mkdirSync(root);
      runGit(root, ['init', '--quiet']);
      runGit(root, ['config', 'user.email', 'c07@example.invalid']);
      runGit(root, ['config', 'user.name', 'C07 Test']);
      fs.writeFileSync(path.join(root, 'tracked.txt'), `${path.basename(root)}\n`);
      runGit(root, ['add', 'tracked.txt']);
      runGit(root, ['commit', '--quiet', '-m', path.basename(root)]);
    }
    const targetPin = {
      commit: runGit(target, ['rev-parse', 'HEAD']),
      tree: runGit(target, ['rev-parse', 'HEAD^{tree}']),
    };
    fs.mkdirSync(maliciousBin);
    if (process.platform === 'win32') {
      fs.writeFileSync(
        path.join(maliciousBin, 'git.cmd'),
        `@echo executed>${JSON.stringify(sentinel)}\r\n@exit /b 91\r\n`,
      );
      process.env.Path = maliciousBin;
      process.env.PATH = maliciousBin;
    } else {
      const fakeGit = path.join(maliciousBin, 'git');
      fs.writeFileSync(fakeGit, `#!/bin/sh\ntouch ${JSON.stringify(sentinel)}\nexit 91\n`);
      fs.chmodSync(fakeGit, 0o755);
      process.env.PATH = maliciousBin;
    }
    process.env.GIT_DIR = path.join(decoy, '.git');
    process.env.GIT_WORK_TREE = decoy;
    process.env.GIT_INDEX_FILE = path.join(decoy, '.git', 'index');
    process.env.GIT_CONFIG_GLOBAL = path.join(decoy, 'attacker.gitconfig');
    process.env.GIT_CONFIG_SYSTEM = path.join(decoy, 'attacker-system.gitconfig');

    assert.deepEqual(await assertRepositoryAtPin(target, targetPin, 'poisoned target'), targetPin);
    assert.equal(fs.existsSync(sentinel), false, 'PATH-selected fake git executed');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(container, { recursive: true, force: true });
  }
});
test('repository proof rejects replacement objects and legacy grafts before snapshotting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-object-overrides-'));
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(9); // approved\n");
    runGit(root, ['add', 'proof.js']);
    runGit(root, ['commit', '--quiet', '-m', 'approved proof source']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };

    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(0); // malicious replacement\n");
    runGit(root, ['add', 'proof.js']);
    runGit(root, ['commit', '--quiet', '-m', 'malicious replacement source']);
    const maliciousCommit = runGit(root, ['rev-parse', 'HEAD']);
    const maliciousTree = runGit(root, ['rev-parse', 'HEAD^{tree}']);
    runGit(root, ['reset', '--hard', '--quiet', pin.commit]);

    runGit(root, ['replace', pin.tree, maliciousTree]);
    assert.match(runGit(root, ['show', 'HEAD:proof.js']), /malicious replacement/);
    assert.match(
      runGit(root, ['--no-replace-objects', 'show', 'HEAD:proof.js']),
      /approved/,
    );
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'replacement-object fixture'),
      /refs\/replace object overrides/,
    );
    await assert.rejects(
      materializeRepositorySnapshot(root, pin, 'replacement-object snapshot'),
      /refs\/replace object overrides/,
    );
    runGit(root, ['replace', '-d', pin.tree]);

    const graftPath = path.join(root, '.git', 'info', 'grafts');
    fs.mkdirSync(path.dirname(graftPath), { recursive: true });
    fs.writeFileSync(graftPath, `${pin.commit} ${maliciousCommit}\n`);
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'legacy-graft fixture'),
      /legacy info\/grafts object overrides/,
    );
    await assert.rejects(
      materializeRepositorySnapshot(root, pin, 'legacy-graft snapshot'),
      /legacy info\/grafts object overrides/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('repository proof rejects assume-unchanged and skip-worktree concealment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-index-flags-'));
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(9);\n");
    runGit(root, ['add', 'proof.js']);
    runGit(root, ['commit', '--quiet', '-m', 'proof source']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };

    runGit(root, ['update-index', '--assume-unchanged', 'proof.js']);
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(0);\n");
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'assume-unchanged fixture'),
      /assume-unchanged|index flag/i,
    );

    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(9);\n");
    runGit(root, ['update-index', '--no-assume-unchanged', 'proof.js']);
    runGit(root, ['update-index', '--skip-worktree', 'proof.js']);
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(0);\n");
    await assert.rejects(
      assertRepositoryAtPin(root, pin, 'skip-worktree fixture'),
      /skip-worktree|index flag/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('commit-derived snapshot excludes ignored substitutions and is independent of worktree races', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-commit-snapshot-'));
  let snapshot;
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(9);\n");
    runGit(root, ['add', '.gitignore', 'proof.js']);
    runGit(root, ['commit', '--quiet', '-m', 'approved proof source']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };

    snapshot = await materializeRepositorySnapshot(root, pin, 'commit snapshot fixture');
    fs.writeFileSync(path.join(root, 'proof.js'), "process.exit(0);\n");
    fs.mkdirSync(path.join(root, 'node_modules', 'jest', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'jest', 'bin', 'jest.js'), "process.exit(0);\n");

    assert.equal(fs.readFileSync(path.join(snapshot.root, 'proof.js'), 'utf8'), "process.exit(9);\n");
    assert.equal(fs.existsSync(path.join(snapshot.root, 'node_modules')), false);
    assert.equal(snapshot.proof.commit, pin.commit);
    assert.equal(snapshot.proof.tree, pin.tree);
    assert.equal(snapshot.verify(), true);
  } finally {
    if (snapshot) snapshot.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hermetic command environment drops mixed-case injection variables', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-hermetic-env-'));
  const poisoned = {
    Node_Options: '--require=C:\\attacker\\preload.cjs',
    nOdE_pAtH: 'C:\\attacker',
    gIt_DiR: 'C:\\attacker\\repo',
    GoFlags: '-toolexec=C:\\attacker\\tool.exe',
    GoWork: 'C:\\attacker\\go.work',
    cC: 'C:\\attacker\\cc.exe',
    Bash_Env: 'C:\\attacker\\bashrc',
    Path: 'C:\\attacker',
  };
  const saved = Object.fromEntries(Object.keys(poisoned).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, poisoned);
    const environment = createHermeticCommandEnvironment(temporary);
    for (const key of Object.keys(environment)) {
      assert.doesNotMatch(
        key.toUpperCase(),
        /^(NODE_OPTIONS|NODE_PATH|GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|CC|CXX|AR|PKG_CONFIG|GCCGO|BASH_ENV)$/,
      );
    }
    assert.equal(Object.values(environment).some((value) => String(value).includes('attacker')), false);
    assert.equal(environment.GOFLAGS, '');
    assert.equal(environment.GOENV, 'off');
    assert.equal(environment.GOWORK, 'off');
    assert.equal(environment.GOTOOLCHAIN, 'local');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
test('Buildx attestation binds iid config, loaded manifest, base material, and hermetic parameters', () => {
  const configDigest = 'sha256:' + 'a'.repeat(64);
  const manifestDigest = 'sha256:' + 'b'.repeat(64);
  const sessionDigest = 'c'.repeat(64);
  const buildTag = 'ceragon-c07-input:' + 'd'.repeat(32);
  const sessionUri = 'http://buildkit-session/' + 'e'.repeat(25);
  const baseImage = FIXED_CONTAINER_IMAGES.node;
  const requiredArgs = {
    'build-arg:SOURCE_DATE_EPOCH': '0',
    'force-network-mode': 'none',
    'no-cache': '',
  };
  const metadataFixture = () => ({
    'buildx.build.provenance': {
      builder: { id: '' },
      buildType: 'https://mobyproject.org/buildkit@v1',
      materials: [
        {
          uri: 'pkg:docker/node?digest=' + baseImage.id + '&platform=linux%2Famd64',
          digest: { sha256: baseImage.id.slice('sha256:'.length) },
        },
        {
          uri: sessionUri,
          digest: { sha256: sessionDigest },
        },
      ],
      invocation: {
        configSource: {
          uri: sessionUri,
          digest: { sha256: sessionDigest },
          entryPoint: 'Dockerfile',
        },
        parameters: {
          frontend: 'dockerfile.v0',
          args: { ...requiredArgs },
          root: {
            configSource: {
              uri: sessionUri,
              digest: { sha256: sessionDigest },
              path: 'Dockerfile',
            },
            request: { args: { ...requiredArgs } },
          },
          compatibilityVersion: 20,
        },
        environment: {
          dockerfileVersion: '1.24.0',
          platform: 'linux/amd64',
        },
      },
    },
    'buildx.build.ref': 'desktop-linux/desktop-linux/' + 'f'.repeat(25),
    'containerimage.config.digest': configDigest,
    'containerimage.descriptor': {
      mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      digest: manifestDigest,
      size: 2082,
      platform: {
        architecture: 'amd64',
        os: 'linux',
      },
    },
    'containerimage.digest': manifestDigest,
    'image.name': 'docker.io/library/' + buildTag,
  });
  const iidBytes = Buffer.from(configDigest, 'ascii');
  const validate = (metadata, candidateIid = iidBytes) => testing.validateBuildxAttestationBytes(
    candidateIid,
    Buffer.from(JSON.stringify(metadata), 'utf8'),
    { baseImage, buildTag },
  );
  const accepted = validate(metadataFixture());
  assert.equal(accepted.configDigest, configDigest);
  assert.equal(accepted.manifestDigest, manifestDigest);
  assert.equal(accepted.contextSourceSha256, 'sha256:' + sessionDigest);

  const mutations = [
    ['config/iid mismatch', (value) => { value['containerimage.config.digest'] = 'sha256:' + '0'.repeat(64); }],
    ['descriptor mismatch', (value) => { value['containerimage.descriptor'].digest = 'sha256:' + '0'.repeat(64); }],
    ['extra metadata', (value) => { value.unreviewed = true; }],
    ['network bypass', (value) => { value['buildx.build.provenance'].invocation.parameters.args['force-network-mode'] = 'default'; }],
    ['base material bypass', (value) => { value['buildx.build.provenance'].materials[0].digest.sha256 = '0'.repeat(64); }],
    ['loaded name bypass', (value) => { value['image.name'] += '-attacker'; }],
    ['platform bypass', (value) => { value['containerimage.descriptor'].platform.architecture = 'arm64'; }],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = metadataFixture();
    mutate(candidate);
    assert.throws(() => validate(candidate), undefined, name);
  }
  assert.throws(
    () => validate(metadataFixture(), Buffer.from(configDigest + '\n', 'ascii')),
    /iidfile byte count|without whitespace/,
  );
});

test('image cleanup positively proves both the temporary tag and exact image ID absent', () => {
  const imageId = `sha256:${'a'.repeat(64)}`;
  const injected = new Error('injected image remove failure');
  injected.code = 'EINJECTED';
  let removedId = null;
  const cleanup = performVerifiedImageCleanup('ceragon-c07-input:0123456789abcdef0123456789abcdef', imageId, {
    removeTag() { throw injected; },
    removeId() { removedId = imageId; return { status: 0 }; },
    listTagIds() { return Buffer.alloc(0); },
    listAllIds() { return Buffer.from(`sha256:${'b'.repeat(64)}\n`, 'ascii'); },
  });
  assert.equal(cleanup.imageIdAbsent, true);
  assert.equal(cleanup.temporaryTagAbsent, true);
  assert.equal(cleanup.tagRemovalErrorCode, 'EINJECTED');
  assert.equal(cleanup.idRemovalStatus, 0);
  assert.equal(removedId, imageId, 'cleanup must remove the exact image ID, not a retargetable tag');

  assert.throws(
    () => performVerifiedImageCleanup('ceragon-c07-input:0123456789abcdef0123456789abcdef', imageId, {
      removeTag() { return { status: 0 }; },
      removeId() { return { status: 0 }; },
      listTagIds() { return Buffer.from(`${imageId}\n`, 'ascii'); },
      listAllIds() { return Buffer.alloc(0); },
    }),
    (error) => error.code === 'IMMUTABLE_IMAGE_SURVIVOR',
  );
  assert.throws(
    () => performVerifiedImageCleanup('ceragon-c07-input:0123456789abcdef0123456789abcdef', imageId, {
      removeTag() { return { status: 0 }; },
      removeId() { throw injected; },
      listTagIds() { return Buffer.alloc(0); },
      listAllIds() { return Buffer.from(`${imageId}\n`, 'ascii'); },
    }),
    (error) => error.code === 'IMMUTABLE_IMAGE_SURVIVOR',
  );
});
test('name-swap cleanup controls exact IDs and proves exact ID plus name absence', () => {
  const createdId = 'a'.repeat(64);
  const swappedNameId = 'b'.repeat(64);
  const name = 'ceragon-c07-fixture';
  const injected = new Error('injected remove failure');
  injected.code = 'EINJECTED';
  const removed = [];
  const cleanup = performVerifiedContainedCleanup({
    name,
    ids: [createdId, swappedNameId],
  }, {
    removeId(id) {
      removed.push(id);
      if (id === createdId) throw injected;
      return { status: 0 };
    },
    listAllIds() { return Buffer.alloc(0); },
    listNameRows() { return Buffer.alloc(0); },
  });
  assert.deepEqual(removed, [createdId, swappedNameId]);
  assert.equal(cleanup.containerRemoved, true);
  assert.equal(cleanup.exactContainerIdsAbsent, true);
  assert.equal(cleanup.exactContainerNameAbsent, true);
  assert.equal(cleanup.survivorCount, 0);
  assert.equal(cleanup.removals[0].errorCode, 'EINJECTED');
  assert.equal(cleanup.removals[1].status, 0);

  assert.throws(
    () => performVerifiedContainedCleanup({ name, ids: [createdId] }, {
      removeId() { return { status: 0 }; },
      listAllIds() { return Buffer.from(`${createdId}\n`, 'ascii'); },
      listNameRows() { return Buffer.alloc(0); },
    }),
    (error) => error.code === 'CONTAINMENT_SURVIVOR',
  );
  assert.throws(
    () => performVerifiedContainedCleanup({ name, ids: [createdId] }, {
      removeId() { return { status: 0 }; },
      listAllIds() { return Buffer.alloc(0); },
      listNameRows() { return Buffer.from(`${swappedNameId}\t${name}\n`, 'ascii'); },
    }),
    (error) => error.code === 'CONTAINMENT_SURVIVOR',
  );
  assert.throws(
    () => performVerifiedContainedCleanup({ name, ids: [createdId] }, {
      removeId() { return { status: 0 }; },
      listAllIds() { throw Object.assign(new Error('injected listing failure'), { code: 'EINJECTED' }); },
      listNameRows() { return Buffer.alloc(0); },
    }),
    (error) => error.code === 'EINJECTED',
  );
  assert.throws(
    () => performVerifiedContainedCleanup({ name, ids: [createdId] }, {
      removeId() { return { status: 0 }; },
      listAllIds() { return Buffer.alloc(0); },
      listNameRows() { throw Object.assign(new Error('injected listing failure'), { code: 'EINJECTED' }); },
    }),
    (error) => error.code === 'EINJECTED',
  );
});

test('verified emergency cleanup supersedes only the primary cleanup error and cannot mint command success', () => {
  const configurationSha256 = `sha256:${'c'.repeat(64)}`;
  const primaryFailure = Object.assign(new Error('injected primary inspection race'), {
    code: 'EPRIMARY',
  });
  const emergencyProof = {
    containerRemoved: true,
    exactContainerIdsAbsent: true,
    exactContainerNameAbsent: true,
    survivorCount: 0,
    removals: [],
  };
  const recovered = testing.runContainedCleanupRecovery(
    () => { throw primaryFailure; },
    () => emergencyProof,
    configurationSha256,
  );
  assert.equal(recovered.cleanupError, null);
  assert.equal(recovered.cleanup.emergency, true);
  assert.equal(recovered.cleanup.configurationSha256, configurationSha256);
  assert.equal(recovered.cleanup.exitCode, null);
  assert.equal(recovered.recoveredCleanupInvariantId, 'UNCLASSIFIED_ASSERTION');
  assert.match(recovered.recoveredCleanupDiagnosticSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    recovered.cleanup.exitCode !== 0,
    true,
    'emergency absence proof must not turn the original command into PASS',
  );
  assert.equal(Object.isFrozen(recovered.cleanup), true);

  let emergencyCalls = 0;
  const primaryProof = Object.freeze({ exitCode: 0 });
  const primary = testing.runContainedCleanupRecovery(
    () => primaryProof,
    () => { emergencyCalls += 1; return emergencyProof; },
    configurationSha256,
  );
  assert.equal(primary.cleanup, primaryProof);
  assert.equal(primary.cleanupError, null);
  assert.equal(primary.recoveredCleanupInvariantId, null);
  assert.equal(primary.recoveredCleanupDiagnosticSha256, null);
  assert.equal(emergencyCalls, 0, 'emergency cleanup ran after primary cleanup succeeded');

  const emergencyFailure = Object.assign(new Error('injected emergency listing failure'), {
    code: 'EEMERGENCY',
  });
  const failed = testing.runContainedCleanupRecovery(
    () => { throw primaryFailure; },
    () => { throw emergencyFailure; },
    configurationSha256,
  );
  assert.equal(failed.cleanup, null);
  assert.equal(failed.cleanupError, emergencyFailure);
  assert.equal(failed.recoveredCleanupInvariantId, 'UNCLASSIFIED_ASSERTION');

  const unproven = testing.runContainedCleanupRecovery(
    () => { throw primaryFailure; },
    () => ({ ...emergencyProof, survivorCount: 1 }),
    configurationSha256,
  );
  assert.equal(unproven.cleanup, null);
  assert.match(unproven.cleanupError.message, /retained a survivor/);
});

test('immutable semantic profiles are scheduled in order without Docker build overlap', async () => {
  const consumers = ['backend', 'installer', 'browser', 'frontend'];
  const starts = [];
  const finishes = [];
  let active = 0;
  let maximumActive = 0;
  const values = await testing.mapSequentially(consumers, async (consumer, index) => {
    starts.push(consumer);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    finishes.push(consumer);
    active -= 1;
    return `${index}:${consumer}`;
  });

  assert.deepStrictEqual(starts, consumers);
  assert.deepStrictEqual(finishes, consumers);
  assert.deepStrictEqual(values, consumers.map((consumer, index) => `${index}:${consumer}`));
  assert.equal(maximumActive, 1, 'immutable Docker profiles must never overlap');
  assert.equal(Object.isFrozen(values), true);
});

test('container authority accepts one full create ID and every control operation targets only that ID', () => {
  const id = 'c'.repeat(64);
  assert.equal(parseCreatedContainerId(Buffer.from(`${id}\n`, 'ascii'), 'fixture ID'), id);
  assert.throws(
    () => parseCreatedContainerId(Buffer.from(`${id}\n${'d'.repeat(64)}\n`, 'ascii'), 'fixture ID'),
    /byte bound|exactly one full container ID/,
  );
  assert.throws(
    () => parseCreatedContainerId(Buffer.from('ceragon-c07-fixture\n', 'ascii'), 'fixture ID'),
    /exactly one full container ID/,
  );
  assert.deepEqual(containerControlArgs('start', id), ['container', 'start', '--attach', id]);
  assert.deepEqual(containerControlArgs('kill', id), ['container', 'kill', '--signal', 'KILL', id]);
  assert.deepEqual(containerControlArgs('remove', id), ['container', 'rm', '--force', id]);
  assert.throws(() => containerControlArgs('start', 'ceragon-c07-fixture'), /ID is invalid/);
});

test('full container inspection rejects ID/name swaps, mounts, and weakened isolation', () => {
  const id = 'e'.repeat(64);
  const name = 'ceragon-c07-inspection';
  const expected = {
    id,
    name,
    imageId: `sha256:${'f'.repeat(64)}`,
    entrypoint: '/usr/local/bin/node',
    args: ['fixture.js'],
    cwd: '/workspace',
    labels: {
      'ceragon.ai-security.c07': 'true',
      'ceragon.c07.base.image': `sha256:${'1'.repeat(64)}`,
      'ceragon.c07.snapshot.commit': '2'.repeat(40),
      'ceragon.c07.snapshot.manifest': `sha256:${'3'.repeat(64)}`,
      'ceragon.c07.snapshot.tree': '4'.repeat(40),
    },
    environment: ['NODE_OPTIONS=', 'CERAGON_AI_SECURITY_RUNTIME_ACTIVATABLE=false'],
    tmpfs: 'rw,nosuid,nodev,noexec,size=268435456,mode=1777',
  };
  const inspected = {
    id,
    name: `/${name}`,
    path: expected.entrypoint,
    args: [...expected.args],
    config: {
      Hostname: id.slice(0, 12),
      Domainname: '',
      User: '65534:65534',
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: [...expected.environment],
      Cmd: [...expected.args],
      Healthcheck: { Test: ['NONE'], Interval: 30_000_000_000, Timeout: 3_000_000_000, Retries: 3 },
      Image: expected.imageId,
      Volumes: null,
      WorkingDir: expected.cwd,
      Entrypoint: [expected.entrypoint],
      Labels: { ...expected.labels },
      StopTimeout: 1,
    },
    hostConfig: {
      Privileged: false,
      ReadonlyRootfs: true,
      NetworkMode: 'none',
      Binds: null,
      Mounts: null,
      VolumesFrom: null,
      LogConfig: { Type: 'none', Config: {} },
      Links: null,
      ExtraHosts: null,
      Devices: [],
      DeviceRequests: null,
      DeviceCgroupRules: null,
      CapAdd: null,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      PidsLimit: 128,
      Memory: 1_073_741_824,
      MemorySwap: 1_073_741_824,
      NanoCpus: 2_000_000_000,
      Tmpfs: { '/tmp': expected.tmpfs },
      AutoRemove: false,
      PublishAllPorts: false,
      PortBindings: {},
      PidMode: '',
      IpcMode: 'private',
      UTSMode: '',
      UsernsMode: '',
      CgroupnsMode: 'private',
      OomKillDisable: null,
      Init: true,
    },
    mounts: [],
    networkSettings: {
      sandboxId: '',
      sandboxKey: '',
      ports: {},
      networks: {
        none: {
          NetworkID: '',
          EndpointID: '',
          Gateway: '',
          IPAddress: '',
          MacAddress: '',
          IPv6Gateway: '',
          GlobalIPv6Address: '',
          IPPrefixLen: 0,
          GlobalIPv6PrefixLen: 0,
          Links: null,
          Aliases: null,
          DNSNames: null,
          DriverOpts: null,
        },
      },
    },
    state: { Running: false, Pid: 0, ExitCode: 0 },
  };
  const proof = validateContainedContainerInspection(inspected, expected, 'fixture inspection');
  assert.match(proof.configurationSha256, /^sha256:[0-9a-f]{64}$/);

  const permutedEnvironmentProof = validateContainedContainerInspection(
    {
      ...inspected,
      config: { ...inspected.config, Env: [...inspected.config.Env].reverse() },
    },
    expected,
    'environment order permutation',
  );
  assert.equal(
    permutedEnvironmentProof.securityConfigurationSha256,
    proof.securityConfigurationSha256,
    'environment order must not change the semantic security-configuration digest',
  );

  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, id: '0'.repeat(64) },
      expected,
      'ID swap',
    ),
    /exact container ID changed/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, name: '/ceragon-c07-attacker' },
      expected,
      'name swap',
    ),
    /name metadata changed/,
  );
  assert.doesNotThrow(() => validateContainedContainerInspection(
    { ...inspected, name: '/ceragon-c07-renamed' },
    expected,
    'post-state renamed metadata',
    { requireExpectedName: false },
  ));
  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, mounts: [{ Type: 'bind' }] },
      expected,
      'mount injection',
    ),
    /must not have any mounts/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, hostConfig: { ...inspected.hostConfig, ReadonlyRootfs: false } },
      expected,
      'writable root injection',
    ),
    /root filesystem must be read-only/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, config: { ...inspected.config, Env: [...inspected.config.Env, 'LD_PRELOAD=/attacker.so'] } },
      expected,
      'environment injection',
    ),
    /exact environment changed/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      {
        ...inspected,
        config: { ...inspected.config, Env: [...inspected.config.Env, 'node_options=--require=/attacker.js'] },
      },
      expected,
      'case-insensitive environment duplicate',
    ),
    /environment repeats a case-insensitive key/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      {
        ...inspected,
        config: { ...inspected.config, Env: ['NODE_OPTIONS=--require=/attacker.js', inspected.config.Env[1]] },
      },
      expected,
      'environment value drift',
    ),
    /protected environment value changed/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      {
        ...inspected,
        config: { ...inspected.config, Env: inspected.config.Env.slice(0, 1) },
      },
      expected,
      'missing environment entry',
    ),
    /exact environment changed/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      { ...inspected, hostConfig: { ...inspected.hostConfig, LogConfig: { Type: 'json-file', Config: {} } } },
      expected,
      'log injection',
    ),
    /log driver must remain none/,
  );
  assert.throws(
    () => validateContainedContainerInspection(
      {
        ...inspected,
        networkSettings: {
          ...inspected.networkSettings,
          networks: { none: { ...inspected.networkSettings.networks.none, NetworkID: 'attacker' } },
        },
      },
      expected,
      'network endpoint injection',
    ),
    /none network ID must be empty or an exact engine network ID/,
  );
  assert.doesNotThrow(() => validateContainedContainerInspection(
    {
      ...inspected,
      networkSettings: {
        ...inspected.networkSettings,
        networks: {
          none: { ...inspected.networkSettings.networks.none, NetworkID: 'a'.repeat(64) },
        },
      },
    },
    expected,
    'materialized none network namespace',
  ));
  assert.throws(
    () => validateContainedContainerInspection(
      {
        ...inspected,
        networkSettings: {
          ...inspected.networkSettings,
          networks: {
            none: { ...inspected.networkSettings.networks.none, EndpointID: 'a'.repeat(64) },
          },
        },
      },
      expected,
      'network endpoint injection',
    ),
    /EndpointID must be empty/,
  );
});
test('termination watchdog bounds a stuck attach even when container kill fails or returns', async () => {
  async function exercise(killThrows) {
    let settled = false;
    let attachKills = 0;
    let watchdogError;
    let release;
    const watchdog = new Promise((resolve) => { release = resolve; });
    const controller = createBoundedTerminationController({
      killContainer() {
        if (killThrows) {
          const error = new Error('injected container kill failure');
          error.code = 'EINJECTED';
          throw error;
        }
      },
      killAttach() { attachKills += 1; },
      isSettled: () => settled,
      onWatchdog(error) {
        watchdogError = error;
        settled = true;
        release();
      },
    }, 20);
    const killError = controller.request();
    assert.equal(controller.request(), null, 'termination request must be idempotent');
    await Promise.race([
      watchdog,
      new Promise((_, reject) => setTimeout(() => reject(new Error('termination watchdog was unbounded')), 500)),
    ]);
    controller.cancel();
    assert.equal(killError?.code || null, killThrows ? 'EINJECTED' : null);
    assert.equal(attachKills, killThrows ? 2 : 1);
    assert.match(watchdogError.message, /attach did not close/);
  }

  await exercise(false);
  await exercise(true);
});
dockerTest('C01 prior canonical source builds, runs five exact vectors, packs, and imports in containment', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-c01-'));
  const repository = path.join(scratch, 'repository');
  let snapshot;
  try {
    const source = path.resolve(__dirname, '..', '..', '..');
    const git = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\git.exe' : 'git';
    let result = spawnSync(git, ['clone', '--config', 'core.autocrlf=false', '--shared', '--no-checkout', '--quiet', source, repository], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr);
    result = spawnSync(git, ['-C', repository, 'checkout', '--detach', '--quiet', APPROVED_INPUTS.priorCanonical.commit], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr);
    snapshot = await materializeRepositorySnapshot(
      repository,
      APPROVED_INPUTS.priorCanonical,
      'C01 prior canonical fixture',
    );
    const profile = await runPriorCanonicalProfile(snapshot);
    assert.equal(profile.profile, 'PRIOR_CANONICAL_C01_V1');
    assert.equal(profile.command.status, 'PASS');
    assert.deepEqual(profile.verifiedScripts, [
      'test-security-taxonomy.cjs',
      'test-vulnerability-applicability.cjs',
      'test-m3-contracts.cjs',
      'test-governance-profile.cjs',
      'test-runtime-adapter-contract.cjs',
    ]);
    assert.equal(profile.typescriptVersion, '5.9.3');
    assert.equal(profile.nodeTypesVersion, '20.19.43');
    assert.equal(profile.compilerEnvironment, 'REVIEWED_C03_IMAGE_EXPLICIT_NODE_TYPES');
    assert.equal(profile.packageProof, 'PACK_LOCAL_TARBALL_INSTALL_OFFLINE_REQUIRE');
    assert.equal(profile.command.isolation.network, 'NONE');
    assert.equal(profile.command.isolation.hostMountCount, 0);
    assert.equal(profile.command.inputImageRemoved, true);
  } finally {
    if (snapshot) snapshot.dispose();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
dockerTest('Docker runner contains descendants on PASS, timeout, and output-limit paths', async () => {
  assert.equal(FIXED_CONTAINER_IMAGES.node.id, 'sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5');
  const dockerProof = verifyDockerExecutionEnvironment(['node']);
  assert.equal(dockerProof.engine.os, 'linux');
  assert.equal(dockerProof.engine.architecture, 'amd64');
  assert.equal(dockerProof.images.node.id, FIXED_CONTAINER_IMAGES.node.id);
  assert.match(dockerProof.dockerBuildx.version, /^v\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i);
  assert.match(dockerProof.dockerBuildx.revision, /^[0-9a-f]{40}$/);
  assert.match(dockerProof.dockerBuildx.outputSha256, /^sha256:[0-9a-f]{64}$/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceragon-c07-container-'));
  let snapshot;
  try {
    runGit(root, ['init', '--quiet']);
    runGit(root, ['config', 'user.email', 'c07@example.invalid']);
    runGit(root, ['config', 'user.name', 'C07 Test']);
    fs.writeFileSync(path.join(root, 'pass-descendant.js'), [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }).unref();",
      "console.log('pass');",
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'timeout-descendant.js'), [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }).unref();",
      'setInterval(() => {}, 1000);',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'decision.txt'), 'approved-fail\n');
    fs.writeFileSync(path.join(root, 'delayed-decision.js'), [
      "const fs = require('node:fs');",
      "setTimeout(() => process.exit(fs.readFileSync('decision.txt', 'utf8') === 'approved-fail\\n' ? 9 : 0), 2000);",
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'overflow-descendant.js'), [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }).unref();",
      "process.stdout.write('x'.repeat(65536));",
      'setInterval(() => {}, 1000);',
      '',
    ].join('\n'));
    runGit(root, ['add', '.']);
    runGit(root, ['commit', '--quiet', '-m', 'contained commands']);
    const pin = {
      commit: runGit(root, ['rev-parse', 'HEAD']),
      tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
    };
    snapshot = await materializeRepositorySnapshot(root, pin, 'container fixture');
    const common = {
      image: 'node',
      snapshot,
      cwd: '.',
    };
    const success = await runContainedProcess(
      { ...common, id: 'container.pass-descendant', args: ['pass-descendant.js'] },
      { timeoutMs: 30_000, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
    );
    assert.equal(success.status, 'PASS');
    assert.equal(success.containerRemoved, true);
    assert.equal(success.survivorCount, 0);
    assert.equal(success.inputImageRemoved, true);
    assert.equal(
      success.inputImageRemovalScope,
      'ENGINE_IMAGE_IDS_TEMPORARY_TAG_AND_BUILD_RUN_LABEL',
    );
    assert.equal(success.buildCacheRetention, 'MAY_RETAIN_NEW_LOCAL_COPY_CACHE');
    assert.equal(
      success.inputImage.historyPolicy,
      'EXACT_BASE_SUFFIX_FIVE_FIXED_LABELS_ONE_COPY',
    );
    assert.equal(success.inputImage.addedHistoryEntries, 6);
    assert.equal(success.inputImage.nonEmptyAddedLayers, 1);
    assert.equal(success.inputImage.buildCacheReuse, false);
    assert.equal(success.inputImage.buildCacheRetentionLimitation, 'MAY_RETAIN_NEW_LOCAL_COPY_CACHE');
    assert.equal(success.isolation.hostMountCount, 0);
    const repeated = await runContainedProcess(
      { ...common, id: 'container.pass-repeat', args: ['pass-descendant.js'] },
      { timeoutMs: 30_000, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
    );
    assert.deepEqual(repeated.inputImage, success.inputImage, 'identical canonical context must reproduce the same image ID and diff layer');
    assert.equal(repeated.inputImageRemoved, true);
    await assert.rejects(
      runContainedProcess(
        { ...common, id: 'container.timeout-descendant', args: ['timeout-descendant.js'] },
        { timeoutMs: 1000, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
      ),
      (error) => error.code === 'COMMAND_TIMEOUT'
        && error.containerRemoved === true
        && error.survivorCount === 0
        && error.inputImageRemoved === true,
    );
    await assert.rejects(
      runContainedProcess(
        { ...common, id: 'container.output-descendant', args: ['overflow-descendant.js'] },
        { timeoutMs: 30_000, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
      ),
      (error) => error.code === 'COMMAND_OUTPUT_LIMIT'
        && error.containerRemoved === true
        && error.survivorCount === 0
        && error.inputImageRemoved === true,
    );
    const racePromise = runContainedProcess(
      { ...common, id: 'container.immutable-race', args: ['delayed-decision.js'] },
      { timeoutMs: 30_000, maxStdoutBytes: 1024, maxStderrBytes: 1024 },
    );
    fs.writeFileSync(path.join(root, 'decision.txt'), 'attacker-pass\n');
    fs.writeFileSync(path.join(snapshot.root, 'decision.txt'), 'attacker-pass\n');
    await assert.rejects(
      racePromise,
      (error) => error.code === 'COMMAND_FAILED'
        && error.inputImageRemoved === true
        && error.containerRemoved === true
        && error.survivorCount === 0,
    );
    fs.writeFileSync(path.join(root, 'decision.txt'), 'approved-fail\n');
    fs.writeFileSync(path.join(snapshot.root, 'decision.txt'), 'approved-fail\n');
    assert.equal(snapshot.verify(), true);
  } finally {
    if (snapshot) snapshot.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('canonical Docker context is byte-stable for hostile Unicode/case paths and isolates repo Docker controls', () => {
  const files = [
    ['a.txt', Buffer.from('lower')],
    ['A.txt', Buffer.from('upper')],
    ['é.txt', Buffer.from('composed')],
    ['e\u0301.txt', Buffer.from('decomposed')],
    ['.dockerignore', Buffer.from('**\n')],
    ['Dockerfile', Buffer.from('FROM attacker.invalid/image\n')],
  ];
  const entries = files.map(([relative, bytes]) => ({
    mode: '100644',
    oid: '0'.repeat(40),
    path: relative,
    size: bytes.length,
  }));
  const proof = {
    commit: '1'.repeat(40),
    tree: '2'.repeat(40),
    manifestSha256: `sha256:${'3'.repeat(64)}`,
  };
  const first = buildCanonicalDockerContext(
    entries,
    files.map(([, bytes]) => bytes),
    proof,
    FIXED_CONTAINER_IMAGES.node,
  );
  const reversedFiles = [...files].reverse();
  const reversedEntries = [...entries].reverse();
  const second = buildCanonicalDockerContext(
    reversedEntries,
    reversedFiles.map(([, bytes]) => bytes),
    proof,
    FIXED_CONTAINER_IMAGES.node,
  );
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.sha256, second.sha256);

  const tarEntries = [];
  for (let offset = 0; offset + 512 <= first.bytes.length;) {
    const header = first.bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const readText = (start, length) => header.subarray(start, start + length)
      .subarray(0, header.subarray(start, start + length).indexOf(0) < 0
        ? length
        : header.subarray(start, start + length).indexOf(0))
      .toString('utf8');
    const name = readText(0, 100);
    const prefix = readText(345, 155);
    const relative = prefix ? `${prefix}/${name}` : name;
    const sizeText = readText(124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const bodyStart = offset + 512;
    tarEntries.push({ relative, body: first.bytes.subarray(bodyStart, bodyStart + size) });
    offset = bodyStart + size + ((512 - (size % 512)) % 512);
  }
  const bytewisePaths = files.map(([relative]) => relative)
    .sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8')))
    .map((relative) => `snapshot/${relative}`);
  assert.deepEqual(tarEntries.map(({ relative }) => relative), ['Dockerfile', ...bytewisePaths]);
  assert.match(tarEntries[0].body.toString('utf8'), new RegExp(`^FROM ${FIXED_CONTAINER_IMAGES.node.repositoryDigest}`));
  assert.equal(tarEntries.find(({ relative }) => relative === 'snapshot/Dockerfile').body.toString('utf8'), 'FROM attacker.invalid/image\n');
  assert.equal(tarEntries.find(({ relative }) => relative === 'snapshot/.dockerignore').body.toString('utf8'), '**\n');
});
test('canonical Docker context injects exactly one digest-bound read-only C07 driver', () => {
  const driverBytes = fs.readFileSync(path.join(
    __dirname,
    'c07-drivers',
    'browser-semantic-driver.mjs',
  ));
  const artifact = {
    consumer: 'browser',
    driverId: DRIVER_IDS.browser,
    bytes: driverBytes.length,
    sha256: digest(driverBytes),
  };
  const witness = {
    exactBytes: driverBytes,
    containerPath: '/c07/browser-semantic-driver.mjs',
  };
  const inputBytes = Buffer.from('approved\n');
  const context = buildCanonicalDockerContext(
    [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: inputBytes.length }],
    [inputBytes],
    {
      commit: '1'.repeat(40),
      tree: '2'.repeat(40),
      manifestSha256: `sha256:${'3'.repeat(64)}`,
    },
    FIXED_CONTAINER_IMAGES.node,
    { artifact, witness },
  );
  const buildWithDriver = (candidateArtifact, candidateWitness) => buildCanonicalDockerContext(
    [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: inputBytes.length }],
    [inputBytes],
    {
      commit: '1'.repeat(40),
      tree: '2'.repeat(40),
      manifestSha256: `sha256:${'3'.repeat(64)}`,
    },
    FIXED_CONTAINER_IMAGES.node,
    { artifact: candidateArtifact, witness: candidateWitness },
  );
  const entries = [];
  for (let offset = 0; offset + 512 <= context.bytes.length;) {
    const header = context.bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length)
      .toString('utf8').replace(/\0.*$/, '');
    const name = text(0, 100);
    const prefix = text(345, 155);
    const relative = prefix ? `${prefix}/${name}` : name;
    const mode = Number.parseInt(text(100, 8), 8);
    const size = Number.parseInt(text(124, 12), 8);
    const bodyStart = offset + 512;
    entries.push({ relative, mode, body: context.bytes.subarray(bodyStart, bodyStart + size) });
    offset = bodyStart + (Math.ceil(size / 512) * 512);
  }
  assert.deepEqual(entries.map(({ relative }) => relative), [
    'Dockerfile',
    'snapshot/input.txt',
    'c07/browser-semantic-driver.mjs',
  ]);
  const injected = entries.at(-1);
  assert.equal(injected.mode, 0o444);
  assert.deepEqual(injected.body, driverBytes);
  const dockerfile = entries[0].body.toString('utf8');
  assert.match(dockerfile, new RegExp(`LABEL ceragon\\.c07\\.driver\\.sha256=${artifact.sha256}`));
  assert.match(dockerfile, /COPY --chown=65534:65534 c07\/browser-semantic-driver\.mjs \/c07\/browser-semantic-driver\.mjs/);
  assert.deepEqual(context.driver, {
    id: artifact.driverId,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    containerPath: witness.containerPath,
    tarMode: '0444',
  });
  assert.throws(
    () => buildCanonicalDockerContext(
      [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: inputBytes.length }],
      [inputBytes],
      { commit: '1'.repeat(40), tree: '2'.repeat(40), manifestSha256: `sha256:${'3'.repeat(64)}` },
      FIXED_CONTAINER_IMAGES.node,
      { artifact: { ...artifact, sha256: `sha256:${'0'.repeat(64)}` }, witness },
    ),
    /canonical driver descriptor digest changed/,
  );
  assert.throws(
    () => buildWithDriver(
      { ...artifact, driverId: `${artifact.driverId}\nRUN attacker.invalid` },
      witness,
    ),
    /driver ID is not a safe token/,
  );
  assert.throws(
    () => buildWithDriver({ ...artifact, unexpected: 'attacker' }, witness),
    /canonical driver artifact has unexpected field unexpected/,
  );
  assert.throws(
    () => buildWithDriver(artifact, { ...witness, sourcePath: 'attacker' }),
    /canonical driver witness has unexpected field sourcePath/,
  );
  assert.throws(
    () => buildWithDriver({ ...artifact, consumer: 'attacker' }, witness),
    /canonical driver consumer is not approved/,
  );
  assert.throws(
    () => buildWithDriver({ ...artifact, driverId: 'C07_BROWSER_SEMANTIC_V2' }, witness),
    /canonical driver ID changed/,
  );
  assert.throws(
    () => buildWithDriver(artifact, { ...witness, containerPath: '/c07/attacker.mjs' }),
    /canonical driver descriptor container path changed/,
  );
  assert.throws(
    () => buildWithDriver({ ...artifact, bytes: 0 }, witness),
    /canonical driver byte count invalid/,
  );
  assert.throws(
    () => buildWithDriver({ ...artifact, sha256: 'sha256:INVALID' }, witness),
    /canonical driver digest invalid/,
  );
  const mutatedDriverBytes = Buffer.from(driverBytes);
  mutatedDriverBytes[0] ^= 1;
  assert.throws(
    () => buildWithDriver(artifact, { ...witness, exactBytes: mutatedDriverBytes }),
    /canonical driver digest changed/,
  );

  const installerBytes = fs.readFileSync(path.join(
    __dirname,
    'c07-drivers',
    'installer-semantic-driver',
    'main.go',
  ));
  const installerArtifact = {
    consumer: 'installer',
    driverId: DRIVER_IDS.installer,
    bytes: installerBytes.length,
    sha256: digest(installerBytes),
  };
  const installerWitness = {
    exactBytes: installerBytes,
    containerPath: '/workspace/cmd/c07semanticdriver/main.go',
  };
  const installerContext = buildCanonicalDockerContext(
    [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: inputBytes.length }],
    [inputBytes],
    {
      commit: '1'.repeat(40),
      tree: '2'.repeat(40),
      manifestSha256: `sha256:${'3'.repeat(64)}`,
    },
    FIXED_CONTAINER_IMAGES.go,
    { artifact: installerArtifact, witness: installerWitness },
  );
  const installerDockerfileSize = Number.parseInt(
    installerContext.bytes.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''),
    8,
  );
  const installerDockerfile = installerContext.bytes
    .subarray(512, 512 + installerDockerfileSize)
    .toString('utf8');
  assert.match(
    installerDockerfile,
    /COPY --chown=65534:65534 c07\/installer-semantic-driver\.go \/workspace\/cmd\/c07semanticdriver\/main\.go/,
  );
  assert.deepEqual(installerContext.driver, {
    id: installerArtifact.driverId,
    bytes: installerArtifact.bytes,
    sha256: installerArtifact.sha256,
    containerPath: installerWitness.containerPath,
    tarMode: '0444',
  });
});

test('backend canonical context resolves the accepted shared-contracts package before the base image dependency', () => {
  const driverBytes = fs.readFileSync(path.join(
    __dirname,
    'c07-drivers',
    'backend-semantic-driver.cjs',
  ));
  const artifact = {
    consumer: 'backend',
    driverId: DRIVER_IDS.backend,
    bytes: driverBytes.length,
    sha256: digest(driverBytes),
  };
  const witness = {
    exactBytes: driverBytes,
    containerPath: '/c07/backend-semantic-driver.cjs',
  };
  const requiredPackageFiles = [
    ['packages/shared-contracts/package.json', Buffer.from('{"name":"@ceragon/shared-contracts"}\n')],
    ['packages/shared-contracts/dist/index.js', Buffer.from("'use strict';\n")],
    [
      'packages/shared-contracts/generated/ai-security/0.4.0/portable-contract.v1.jcs.json',
      Buffer.from('{}\n'),
    ],
  ];
  const entries = requiredPackageFiles.map(([committedPath, bytes], index) => ({
    mode: '100644',
    oid: String(index).repeat(40),
    path: committedPath,
    size: bytes.length,
  }));
  const proof = {
    commit: '1'.repeat(40),
    tree: '2'.repeat(40),
    manifestSha256: `sha256:${'3'.repeat(64)}`,
  };
  const build = (candidateEntries = entries, candidateFiles = requiredPackageFiles) => (
    buildCanonicalDockerContext(
      candidateEntries,
      candidateFiles.map(([, bytes]) => bytes),
      proof,
      FIXED_CONTAINER_IMAGES.backend,
      { artifact, witness },
    )
  );
  const context = build();
  const dockerfileSize = Number.parseInt(
    context.bytes.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''),
    8,
  );
  const dockerfile = context.bytes.subarray(512, 512 + dockerfileSize).toString('utf8');
  const snapshotCopy = 'COPY --chown=65534:65534 snapshot/ /workspace/';
  const packageProjection = 'COPY --chown=65534:65534 snapshot/packages/shared-contracts/ /workspace/node_modules/@ceragon/shared-contracts/';
  const driverCopy = 'COPY --chown=65534:65534 c07/backend-semantic-driver.cjs /c07/backend-semantic-driver.cjs';
  assert.equal(dockerfile.split(packageProjection).length - 1, 1);
  assert.equal(dockerfile.indexOf(snapshotCopy) < dockerfile.indexOf(packageProjection), true);
  assert.equal(dockerfile.indexOf(packageProjection) < dockerfile.indexOf(driverCopy), true);

  for (const [missingPath] of requiredPackageFiles) {
    const retainedFiles = requiredPackageFiles.filter(([committedPath]) => committedPath !== missingPath);
    const retainedEntries = entries.filter(({ path: committedPath }) => committedPath !== missingPath);
    assert.throws(
      () => build(retainedEntries, retainedFiles),
      new RegExp(`backend accepted package projection is missing ${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
  }

  const browserBytes = fs.readFileSync(path.join(
    __dirname,
    'c07-drivers',
    'browser-semantic-driver.mjs',
  ));
  const browserContext = buildCanonicalDockerContext(
    [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: 1 }],
    [Buffer.from('x')],
    proof,
    FIXED_CONTAINER_IMAGES.node,
    {
      artifact: {
        consumer: 'browser',
        driverId: DRIVER_IDS.browser,
        bytes: browserBytes.length,
        sha256: digest(browserBytes),
      },
      witness: { exactBytes: browserBytes, containerPath: '/c07/browser-semantic-driver.mjs' },
    },
  );
  const browserDockerfileSize = Number.parseInt(
    browserContext.bytes.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''),
    8,
  );
  const browserDockerfile = browserContext.bytes
    .subarray(512, 512 + browserDockerfileSize)
    .toString('utf8');
  assert.equal(browserDockerfile.includes(packageProjection), false);
});

test('contained semantic dispatch is fixed for all four accepted consumers', () => {
  const profiles = testing.containedSemanticProfiles;
  assert.deepEqual(Object.keys(profiles), ['backend', 'installer', 'browser', 'frontend']);
  assert.deepEqual(
    Object.fromEntries(Object.entries(profiles).map(([key, value]) => [key, value.image])),
    { backend: 'backend', installer: 'go', browser: 'node', frontend: 'frontend' },
  );
  assert.equal(profiles.backend.args[0], '/c07/backend-semantic-driver.cjs');
  assert.equal(profiles.installer.args[1], '/workspace/cmd/c07semanticdriver/main.go');
  assert.equal(profiles.browser.args[0], '/c07/browser-semantic-driver.mjs');
  assert.deepEqual(profiles.frontend.args, ['/c07/frontend-semantic-driver.test.cjs']);
  assert.throws(
    () => testing.registerFrontendDependencyImage({
      id: 'frontend:latest',
      configSha256: `sha256:${'0'.repeat(64)}`,
    }),
    /Frontend dependency image ID invalid/,
  );
});

test('only the Go semantic profile receives an executable ephemeral workspace', () => {
  assert.match(FIXED_CONTAINER_IMAGES.go.tmpfs, /(?:^|,)exec(?:,|$)/);
  assert.match(FIXED_CONTAINER_IMAGES.go.tmpfs, /(?:^|,)nosuid(?:,|$)/);
  assert.match(FIXED_CONTAINER_IMAGES.go.tmpfs, /(?:^|,)nodev(?:,|$)/);
  for (const key of ['backend', 'node']) {
    assert.match(FIXED_CONTAINER_IMAGES[key].tmpfs, /(?:^|,)noexec(?:,|$)/);
    assert.doesNotMatch(FIXED_CONTAINER_IMAGES[key].tmpfs, /(?:^|,)exec(?:,|$)/);
  }
});

test('frontend immutable builds use one fixed local release tag with exact-ID binding proofs', () => {
  const id = `sha256:${'f'.repeat(64)}`;
  const image = testing.registerFrontendDependencyImage({
    id,
    configSha256: `sha256:${'e'.repeat(64)}`,
  });
  assert.equal(testing.imageBuildReference(image), 'ceragon-c07-frontend-deps:m47');
  assert.equal(
    testing.buildxBaseMaterialUri(image),
    'pkg:docker/ceragon-c07-frontend-deps@m47?platform=linux%2Famd64',
  );
  assert.throws(
    () => testing.imageBuildReference({ ...image }),
    /Docker build reference image is not reviewed/,
  );

  const input = Buffer.from('frontend snapshot');
  const context = buildCanonicalDockerContext(
    [{ mode: '100644', oid: '0'.repeat(40), path: 'input.txt', size: input.length }],
    [input],
    {
      commit: '1'.repeat(40),
      tree: '2'.repeat(40),
      manifestSha256: `sha256:${'3'.repeat(64)}`,
    },
    image,
  );
  const dockerfileSize = Number.parseInt(
    context.bytes.subarray(124, 136).toString('ascii').replace(/\0.*$/, ''),
    8,
  );
  const dockerfile = context.bytes.subarray(512, 512 + dockerfileSize).toString('utf8');
  assert.equal(dockerfile.startsWith('FROM ceragon-c07-frontend-deps:m47\n'), true);
  assert.equal(dockerfile.includes(`FROM ceragon-c07-frontend-deps@${id}`), false);
  assert.match(dockerfile, new RegExp(`LABEL ceragon\\.c07\\.base\\.image=${id}`));
  assert.doesNotMatch(dockerfile, /(?:^|\n)(?:RUN|ADD)\s/);
});
