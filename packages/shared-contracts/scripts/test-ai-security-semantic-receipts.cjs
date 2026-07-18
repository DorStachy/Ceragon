'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const semanticModule = require('./lib/ai-security-semantic-receipts.cjs');
const {
  DRIVER_IDS,
  SEMANTIC_COMPATIBILITY_REQUIREMENTS,
  SEMANTIC_PROFILE_CASE_IDS,
  materializeSemanticInput,
  semanticCatalog,
  semanticProofFor,
  stableJson,
  validateSemanticReceiptBytes,
} = semanticModule;

const packageRoot = path.resolve(__dirname, '..');
const artifactBytes = fs.readFileSync(path.join(
  packageRoot,
  'generated',
  'ai-security',
  '0.2.0',
  'portable-contract.v1.jcs.json',
));
const backendReceiptFixture = Buffer.from(
  fs.readFileSync(path.join(
    packageRoot,
    'fixtures',
    'test-only',
    'ai-security-semantic-receipt-backend.v1.json',
  ), 'utf8').replace(/\r\n/g, '\n'),
  'utf8',
);
const driverBytes = Buffer.from("'use strict';\n// reviewed C07 semantic driver fixture\n", 'utf8');
const driverSha256 = `sha256:${crypto.createHash('sha256').update(driverBytes).digest('hex')}`;

function driverDescriptor(consumer) {
  return { id: DRIVER_IDS[consumer], bytes: driverBytes.length, sha256: driverSha256 };
}

function validate(consumer, receiptBytes = backendReceiptFixture, overrides = {}) {
  return validateSemanticReceiptBytes({
    consumer,
    receiptBytes,
    artifactBytes,
    driverDescriptor: driverDescriptor(consumer),
    driverBytes,
    ...overrides,
  });
}

function canonicalBytes(value) {
  return Buffer.from(`${stableJson(value)}\n`, 'utf8');
}

function testReceiptFixture(consumer) {
  if (consumer === 'backend') return backendReceiptFixture;
  const artifact = JSON.parse(artifactBytes);
  const catalog = semanticCatalog(consumer, artifact);
  if (consumer === 'frontend') {
    const observation = {
      metadata: {
        readableVersions: ['1', '2'],
        runtimeActivatable: false,
        signedRuntimePolicyBundle: false,
        v2WriterEnabled: false,
        writableVersions: ['1'],
      },
      known: {
        approvedGreen: true, kind: 'known', labelId: 'APPROVED',
        technicalTokenState: 'KNOWN', tone: 'mapped',
      },
      unknownSafe: {
        approvedGreen: false, kind: 'unsupported', labelId: 'UNSUPPORTED',
        technicalTokenState: 'BOUNDED', tone: 'neutral',
      },
      unknownUnsafe: {
        approvedGreen: false, kind: 'unsupported', labelId: 'UNSUPPORTED',
        technicalTokenState: 'ABSENT', tone: 'neutral',
      },
      componentOracle: {
        unknownProviderNeutral: true, unknownStatusNeutral: true,
        successIndicatorAbsent: true, comboboxAbsent: true,
        hostileRawAbsent: true, knownBaselineSuccess: true,
      },
    };
    return canonicalBytes({
      artifactSha256: JSON.parse(backendReceiptFixture).artifactSha256,
      caseCatalogSha256: catalog.sha256,
      cases: [{
        id: 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN',
        inputSha256: catalog.entries[0].inputSha256,
        observation,
        observationSha256: `sha256:${crypto.createHash('sha256')
          .update(Buffer.from(`${stableJson(observation)}\n`))
          .digest('hex')}`,
      }],
      driverId: DRIVER_IDS.frontend,
      format: 'ceragon.ai-security.semantic-receipt',
      formatVersion: 1,
    });
  }
  const receipt = JSON.parse(backendReceiptFixture);
  receipt.driverId = DRIVER_IDS[consumer];
  receipt.caseCatalogSha256 = catalog.sha256;
  if (consumer === 'browser') {
    receipt.cases.find(({ id }) => id === 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE')
      .observation.results[0].state = 'held';
  }
  if (consumer === 'installer') {
    const missing = receipt.cases.find(({ id }) => id === 'MISSING_REQUIRED_FIELDS_INVALID');
    missing.observation.results[0].validationErrors = [{ keyword: 'required', path: '/' }];
    missing.observation.results[1].validationErrors = [{ keyword: 'required', path: '/dlp/actions' }];
    receipt.cases.find(({ id }) => id === 'KNOWN_FIELD_WRONG_TYPE_INVALID')
      .observation.results[0].validationErrors = [{ keyword: 'type', path: '/agents/enforcementTier' }];
  }
  for (const receiptCase of receipt.cases) {
    receiptCase.observationSha256 = `sha256:${crypto.createHash('sha256')
      .update(Buffer.from(`${stableJson(receiptCase.observation)}\n`))
      .digest('hex')}`;
  }
  return canonicalBytes(receipt);
}

function validatedSemanticReceipts() {
  return Object.fromEntries(
    ['backend', 'installer', 'browser', 'frontend'].map((consumer) => [
      consumer,
      validate(consumer, testReceiptFixture(consumer)),
    ]),
  );
}

test('ordered semantic inputs preserve operation subsets and every required vector', () => {
  const artifact = JSON.parse(artifactBytes);
  const additive = materializeSemanticInput(
    artifact,
    'ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE',
  );
  assert.equal(additive.entries.length, 1);
  assert.deepStrictEqual(additive.entries[0].document.dlp.futureNested, { v: 2 });
  assert.deepStrictEqual(additive.entries[0].document.futureTopLevel, [1, 2, 3]);
  assert.equal(additive.entries[0].document.evidenceMode, 'HASH_ONLY');
  assert.equal(additive.entries[0].document.dlp.actions['private-key'], 'block');
  assert.equal(additive.entries[0].protocolVersion, '2');

  const unknown = materializeSemanticInput(
    artifact,
    'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW',
  );
  assert.equal(unknown.entries[0].document.evidenceMode, 'FUTURE_MODE');
  assert.equal(unknown.entries[0].document.dlp.actions['private-key'], 'future-action');
  assert.equal(unknown.entries[0].protocolVersion, '2');

  const missing = materializeSemanticInput(artifact, 'MISSING_REQUIRED_FIELDS_INVALID');
  assert.deepStrictEqual(missing.entries.map(({ vectorId }) => vectorId), [
    'TOLERANT-V1-MISSING-FULL-SECTION',
    'TOLERANT-V1-MISSING-CURRENT-ACTION-KEY',
  ]);
  assert.equal(Object.hasOwn(missing.entries[0].document, 'proxy'), false);
  assert.equal(Object.hasOwn(missing.entries[1].document.dlp.actions, 'private-key'), false);
});

test('strict receipts derive exact measured facts and catalogs cover every consumer', () => {
  const receipt = validate('backend');
  assert.equal(receipt.verifiedCaseCount, SEMANTIC_PROFILE_CASE_IDS.backend.length);
  assert.equal(receipt.verifiedResultCount, 9);
  assert.equal(receipt.verifiedRankFamilyCount, 8);
  assert.match(receipt.inputSetSha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(receipt.observationSetSha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(receipt.transportSha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepStrictEqual(
    receipt.caseProofs.map(({ caseId }) => caseId),
    [...SEMANTIC_PROFILE_CASE_IDS.backend],
  );
  const evidenceText = JSON.stringify(receipt);
  for (const forbidden of [
    '/dlp/', 'future-action', 'future-provider', 'Approved', 'Unsupported',
    'rawToken', 'validationErrors',
  ]) {
    assert.equal(evidenceText.includes(forbidden), false, `normalized evidence retained ${forbidden}`);
  }
  const artifact = JSON.parse(artifactBytes);
  for (const consumer of ['backend', 'installer', 'browser', 'frontend']) {
    assert.equal(semanticCatalog(consumer, artifact).entries.length, SEMANTIC_PROFILE_CASE_IDS[consumer].length);
  }
});

test('exit zero text, missing cases, and fabricated semantic observations have no authority', () => {
  assert.throws(
    () => validate('backend', Buffer.from('PASS\n')),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED',
  );
  const valid = JSON.parse(backendReceiptFixture);

  const empty = structuredClone(valid);
  empty.cases = [];
  assert.throws(() => validate('backend', canonicalBytes(empty)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const duplicate = structuredClone(valid);
  duplicate.cases[1] = structuredClone(duplicate.cases[0]);
  assert.throws(() => validate('backend', canonicalBytes(duplicate)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const forged = structuredClone(valid);
  const future = forged.cases.find(({ id }) => id === 'FUTURE_PROTOCOL_DEGRADED_NONRANKABLE');
  future.observation.results[0].state = 'accepted';
  future.observation.results[0].rankingEligible = true;
  future.observationSha256 = `sha256:${crypto.createHash('sha256')
    .update(Buffer.from(`${stableJson(future.observation)}\n`))
    .digest('hex')}`;
  assert.throws(() => validate('backend', canonicalBytes(forged)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const wrongInput = structuredClone(valid);
  wrongInput.cases[0].inputSha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validate('backend', canonicalBytes(wrongInput)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const rehashObservation = (receiptCase) => {
    receiptCase.observationSha256 = `sha256:${crypto.createHash('sha256')
      .update(Buffer.from(`${stableJson(receiptCase.observation)}\n`))
      .digest('hex')}`;
  };
  const wrongKnownRank = structuredClone(valid);
  const wrongKnownRankCase = wrongKnownRank.cases
    .find(({ id }) => id === 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW');
  wrongKnownRankCase.observation.rankOracle.knownRanks.dlp.allow = 1;
  rehashObservation(wrongKnownRankCase);
  assert.throws(() => validate('backend', canonicalBytes(wrongKnownRank)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const crossFamilyBypass = structuredClone(valid);
  const crossFamilyCase = crossFamilyBypass.cases
    .find(({ id }) => id === 'UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW');
  crossFamilyCase.observation.rankOracle.crossFamilyRanks.dlp.prompt = 0;
  rehashObservation(crossFamilyCase);
  assert.throws(() => validate('backend', canonicalBytes(crossFamilyBypass)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');
});

test('receipt transport, driver bytes, artifact bytes, and field allowlists fail closed', () => {
  const validBytes = backendReceiptFixture;
  assert.throws(() => validate('backend', Buffer.concat([validBytes, Buffer.from('{}\n')])),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');
  assert.throws(() => validate('backend', validBytes, { driverBytes: Buffer.from('changed') }),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');
  const changedArtifact = Buffer.from(artifactBytes);
  changedArtifact[0] ^= 1;
  assert.throws(() => validate('backend', validBytes, { artifactBytes: changedArtifact }),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED');

  const injected = JSON.parse(validBytes);
  injected.cases[0].freeText = 'C:\\Users\\secret-canary';
  assert.throws(
    () => validate('backend', canonicalBytes(injected)),
    (error) => error.code === 'SEMANTIC_RECEIPT_REJECTED'
      && !error.message.includes('secret-canary')
      && !JSON.stringify(error).includes('secret-canary'),
  );
});

test('semantic proof authority is validator-issued and exposes no final matrix minting', () => {
  assert.equal(semanticModule.buildReviewedOracleReceiptFixture, undefined);
  assert.equal(semanticModule.buildStandaloneReceipt, undefined);
  assert.equal(semanticModule.buildSemanticCompatibilityMatrix, undefined);

  const receipts = validatedSemanticReceipts();
  const proofs = SEMANTIC_COMPATIBILITY_REQUIREMENTS.flatMap((requirement) => (
    requirement.consumers.map((consumer) => semanticProofFor(receipts[consumer], requirement.id))
  ));
  assert.equal(proofs.length, 25);
  assert.equal(proofs.every(({ consumerId, caseId, inputSha256, observationSha256 }) => (
    /^[A-Z]+$/.test(consumerId)
      && /^[A-Z0-9_]+$/.test(caseId)
      && /^sha256:[0-9a-f]{64}$/.test(inputSha256)
      && /^sha256:[0-9a-f]{64}$/.test(observationSha256)
  )), true);

  assert.throws(
    () => semanticProofFor(structuredClone(receipts.backend), 'CURRENT_V1_ACCEPTED_RANKABLE'),
    /validator-issued/,
  );
  assert.throws(
    () => semanticProofFor({ status: 'PASS', caseProofs: [] }, 'CURRENT_V1_ACCEPTED_RANKABLE'),
    /validator-issued/,
  );
});
