'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(
  PACKAGE_ROOT,
  'fixtures',
  'ai-security-four-axis-compatibility.v1.json',
);
const DIST_INDEX_PATH = path.join(PACKAGE_ROOT, 'dist', 'index.js');
const DIST_DECLARATION_PATH = path.join(
  PACKAGE_ROOT,
  'dist',
  'ai-enforcement-contract.d.ts',
);
const RELEASE_MANIFEST_PATH = path.join(
  PACKAGE_ROOT,
  'manifests',
  'ai-security-portable-release.v1.json',
);

const EXPECTED = Object.freeze({
  translations: Object.freeze([
    'EXPRESSED',
    'UNSUPPORTED_EFFECT',
    'TRANSLATION_FAILED',
    'NOT_APPLICABLE',
  ]),
  outcomes: Object.freeze([
    'PREVENTED',
    'SANITIZED',
    'RESTRICTED_COMPLETION',
    'AUTHORIZED_COMPLETION',
    'UNAUTHORIZED_EFFECT',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ]),
  assurance: Object.freeze([
    'UNVERIFIED_LEGACY',
    'VERIFIED_ENDPOINT_REPORT',
    'INDEPENDENTLY_OBSERVED',
  ]),
  observers: Object.freeze([
    'NONE',
    'RUNTIME_ACK',
    'BROWSER_CHECKPOINT',
    'PROXY_CHECKPOINT',
    'MCP_BROKER',
    'FINAL_STATE_GRADER',
  ]),
  effectsPrefix: Object.freeze([
    'deny-prompt',
    'deny-tool',
    'rewrite-input',
    'replace-output',
    'stop-continuation',
    'audit-only',
    'none',
    'add-developer-context',
    'deny-escalation',
    'allow-escalation',
    'replace-tool-result-with-feedback-and-continue',
  ]),
  governancePrefix: Object.freeze([
    'devoid-mediated',
    'delegated-and-attested',
    'restricted-intent-unverified',
    'observed-only',
    'not-governed',
    'wire-observed-after-dispatch',
    'hook-failed-original-action-proceeded',
    'native-hook-unverified',
  ]),
  governanceTail: Object.freeze([
    'effect-expressed-runtime-unverified',
    'effect-unsupported-original-action-proceeded',
    'translation-failed-original-action-proceeded',
    'runtime-acknowledged-effect',
  ]),
});

const WIRE_KEYS = Object.freeze([
  'requestedEffect',
  'adapterExpressedEffect',
  'translationDisposition',
  'observedActualEffect',
  'actualEffectObserver',
  'governanceDisposition',
  'securityOutcome',
]);

function assertTuple(actual, expected, name) {
  assert.deepEqual(Array.from(actual), expected, `${name} order drifted`);
  assert.equal(new Set(actual).size, expected.length, `${name} contains duplicates`);
  assert.equal(Object.isFrozen(actual), true, `${name} must be frozen`);
}

function compilePublicTypeFixture() {
  const virtualPath = path.join(
    PACKAGE_ROOT,
    '__ai-enforcement-four-axis-public-fixture.ts',
  );
  const sourceText = `
import {
  AI_SECURITY_V2_WRITER_ENABLED,
  AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS,
  type AiAdapterExpressionCompatibilityV1,
  type AiFourAxisEffectRecordCompatibilityV1,
  type AiFourAxisEffectWireCompatibilityV1,
  type AiRuntimeEffectObservationCompatibilityV1,
  type EnforcementEffect,
} from './dist';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type Expressed = Extract<
  AiAdapterExpressionCompatibilityV1,
  { translationDisposition: 'EXPRESSED' }
>;
type Unexpressed = Exclude<
  AiAdapterExpressionCompatibilityV1,
  { translationDisposition: 'EXPRESSED' }
>;
type NoActual = Extract<
  AiRuntimeEffectObservationCompatibilityV1,
  { observedActualEffect: null }
>;
type ObservedActual = Exclude<
  AiRuntimeEffectObservationCompatibilityV1,
  { observedActualEffect: null }
>;
type ExpressedRequiresEffect = Assert<
  Equal<Expressed['adapterExpressedEffect'], EnforcementEffect>
>;
type UnsupportedRequiresNull = Assert<
  Equal<Unexpressed['adapterExpressedEffect'], null>
>;
type MissingActualRequiresNone = Assert<
  Equal<NoActual['actualEffectObserver'], 'NONE'>
>;
type RuntimeObservationRequiresEffect = Assert<
  Equal<ObservedActual['observedActualEffect'], EnforcementEffect>
>;
type AssuranceIsNotWireInput = Assert<
  Equal<'receiptAssurance' extends keyof AiFourAxisEffectWireCompatibilityV1
    ? true : false, false>
>;
type AssuranceIsServerRecord = Assert<
  Equal<'receiptAssurance' extends keyof AiFourAxisEffectRecordCompatibilityV1
    ? true : false, true>
>;
type ProductionV2WriterRemainsDisabled = Assert<
  Equal<typeof AI_SECURITY_V2_WRITER_ENABLED, false>
>;
type WritableProtocolsRemainV1Only = Assert<
  Equal<typeof AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS, readonly ['1']>
>;

const expressed: AiFourAxisEffectWireCompatibilityV1 = {
  requestedEffect: 'deny-tool',
  adapterExpressedEffect: 'deny-tool',
  translationDisposition: 'EXPRESSED',
  observedActualEffect: null,
  actualEffectObserver: 'NONE',
  governanceDisposition: 'effect-expressed-runtime-unverified',
  securityOutcome: 'UNKNOWN',
};
const observed: AiFourAxisEffectWireCompatibilityV1 = {
  requestedEffect: 'deny-tool',
  adapterExpressedEffect: 'deny-tool',
  translationDisposition: 'EXPRESSED',
  observedActualEffect: 'deny-tool',
  actualEffectObserver: 'RUNTIME_ACK',
  governanceDisposition: 'runtime-acknowledged-effect',
  securityOutcome: 'UNKNOWN',
};
const record: AiFourAxisEffectRecordCompatibilityV1 = {
  wire: observed,
  receiptAssurance: 'VERIFIED_ENDPOINT_REPORT',
};
void expressed;
void record;
void (0 as unknown as ExpressedRequiresEffect);
void (0 as unknown as UnsupportedRequiresNull);
void (0 as unknown as MissingActualRequiresNone);
void (0 as unknown as RuntimeObservationRequiresEffect);
void (0 as unknown as AssuranceIsNotWireInput);
void (0 as unknown as AssuranceIsServerRecord);
void (0 as unknown as ProductionV2WriterRemainsDisabled);
void (0 as unknown as WritableProtocolsRemainV1Only);
`;

  const options = {
    exactOptionalPropertyTypes: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const sameFile = (left, right) =>
    path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) =>
    sameFile(fileName, virtualPath) || originalFileExists(fileName);
  host.readFile = (fileName) =>
    sameFile(fileName, virtualPath) ? sourceText : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    sameFile(fileName, virtualPath)
      ? ts.createSourceFile(
          fileName,
          sourceText,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : originalGetSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreate,
        );

  const program = ts.createProgram([virtualPath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => PACKAGE_ROOT,
      getNewLine: () => '\n',
    }),
  );
}

for (const requiredPath of [
  FIXTURE_PATH,
  DIST_INDEX_PATH,
  DIST_DECLARATION_PATH,
  RELEASE_MANIFEST_PATH,
]) {
  assert.ok(fs.existsSync(requiredPath), `required P0-E01 artifact missing: ${requiredPath}`);
}

delete require.cache[require.resolve(DIST_INDEX_PATH)];
const contract = require(DIST_INDEX_PATH);

assertTuple(
  contract.AI_TRANSLATION_DISPOSITIONS,
  EXPECTED.translations,
  'AI_TRANSLATION_DISPOSITIONS',
);
assertTuple(contract.AI_SECURITY_OUTCOMES, EXPECTED.outcomes, 'AI_SECURITY_OUTCOMES');
assertTuple(contract.AI_RECEIPT_ASSURANCE, EXPECTED.assurance, 'AI_RECEIPT_ASSURANCE');
assertTuple(
  contract.AI_ACTUAL_EFFECT_OBSERVERS,
  EXPECTED.observers,
  'AI_ACTUAL_EFFECT_OBSERVERS',
);
assert.deepEqual(
  Array.from(contract.ENFORCEMENT_EFFECTS),
  [...EXPECTED.effectsPrefix, 'restrict-capability'],
  'ENFORCEMENT_EFFECTS must preserve its frozen prefix and append restrict-capability',
);
assert.deepEqual(
  Array.from(contract.GOVERNANCE_DISPOSITIONS),
  [...EXPECTED.governancePrefix, ...EXPECTED.governanceTail],
  'GOVERNANCE_DISPOSITIONS must preserve its frozen prefix and append P0-E01 tokens',
);

assert.equal(contract.AI_SECURITY_V2_WRITER_ENABLED, false);
assert.deepEqual(Array.from(contract.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS), ['1']);
assert.equal(contract.AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE, false);

const releaseManifest = JSON.parse(fs.readFileSync(RELEASE_MANIFEST_PATH, 'utf8'));
assert.equal(releaseManifest.runtimeActivatable, false);
assert.equal(releaseManifest.signedRuntimePolicyBundle, false);
assert.equal(releaseManifest.v2WriterEligible, false);

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
assert.deepEqual(Object.keys(fixture), [
  'format',
  'formatVersion',
  'productionV2WriterEnabled',
  'productionHmacWriterEnabled',
  'cases',
]);
assert.equal(fixture.format, 'ceragon.ai-security.four-axis-compatibility');
assert.equal(fixture.formatVersion, 1);
assert.equal(fixture.productionV2WriterEnabled, false);
assert.equal(fixture.productionHmacWriterEnabled, false);
assert.equal(fixture.cases.length, 4);

const translations = new Set(EXPECTED.translations);
const outcomes = new Set(EXPECTED.outcomes);
const assurance = new Set(EXPECTED.assurance);
const observers = new Set(EXPECTED.observers);
const effects = new Set(contract.ENFORCEMENT_EFFECTS);
const governance = new Set(contract.GOVERNANCE_DISPOSITIONS);

for (const testCase of fixture.cases) {
  assert.deepEqual(Object.keys(testCase), ['id', 'wire', 'receiptAssurance']);
  assert.deepEqual(Object.keys(testCase.wire), WIRE_KEYS);
  assert.equal(Object.hasOwn(testCase.wire, 'receiptAssurance'), false);
  assert.ok(effects.has(testCase.wire.requestedEffect));
  assert.ok(translations.has(testCase.wire.translationDisposition));
  assert.ok(outcomes.has(testCase.wire.securityOutcome));
  assert.ok(observers.has(testCase.wire.actualEffectObserver));
  assert.ok(governance.has(testCase.wire.governanceDisposition));
  assert.ok(assurance.has(testCase.receiptAssurance));

  const expressionPresent = testCase.wire.adapterExpressedEffect !== null;
  assert.equal(
    testCase.wire.translationDisposition === 'EXPRESSED',
    expressionPresent,
    `${testCase.id}: EXPRESSED must be equivalent to a non-null adapter effect`,
  );
  if (expressionPresent) {
    assert.ok(effects.has(testCase.wire.adapterExpressedEffect));
  }

  const actualPresent = testCase.wire.observedActualEffect !== null;
  assert.equal(
    testCase.wire.actualEffectObserver === 'NONE',
    !actualPresent,
    `${testCase.id}: actual-effect absence must be equivalent to observer NONE`,
  );
  if (actualPresent) {
    assert.ok(effects.has(testCase.wire.observedActualEffect));
  }
}

const casesById = Object.fromEntries(
  fixture.cases.map((testCase) => [testCase.id, testCase]),
);
assert.equal(
  casesById['unsupported-original-action-proceeded'].wire.governanceDisposition,
  'effect-unsupported-original-action-proceeded',
);
assert.equal(
  casesById['translation-failed-original-action-proceeded'].wire
    .governanceDisposition,
  'translation-failed-original-action-proceeded',
);
assert.equal(
  casesById['runtime-acknowledged-outcome-still-unknown'].wire.securityOutcome,
  'UNKNOWN',
  'runtime acknowledgment must not self-certify prevention',
);
assert.notEqual(
  casesById['unsupported-original-action-proceeded'].wire.governanceDisposition,
  'hook-failed-original-action-proceeded',
  'unsupported translation is not hook-path failure',
);

compilePublicTypeFixture();

console.log(
  `AI enforcement four-axis contract: PASS (${fixture.cases.length} compatibility cases; V2/HMAC writers disabled)`,
);
