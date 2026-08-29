'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONSUMER = 'frontend';
const DRIVER_ID = 'C07_FRONTEND_SEMANTIC_V1';
const ARTIFACT_SHA256 = 'sha256:096d6c8f181408bb60a1440173f04efdd99764736d97d01169decdecad0c6feb';
const SOURCE_COMMIT = 'dc66d52c4cf835e33d15ddb9181422bc359e78ad';
const SOURCE_TREE = '3c10a1b9750d85daa99f5ab0c2491af9a02f0fc1';
const SNAPSHOT_MANIFEST_SHA256 = 'sha256:71e7976ec192648f833bd3018f633790015ab71399302ddd2383c6d53d6d4680';
const SOURCE_ROOT = '/workspace';
const ARTIFACT_PATH = '/workspace/contracts/ai-security/0.4.0/portable-contract.v1.jcs.json';
const DRIVER_PATH = '/c07/frontend-semantic-driver.test.cjs';
const NODE_PATH = '/usr/local/bin/node';
const NODE_MODULES_ROOT = '/opt/ceragon-c07-frontend/node_modules';
const JEST_PATH = NODE_MODULES_ROOT + '/jest/bin/jest.js';
const TEST_NAME = 'derives the exact neutral unknown-provider observation from real rendered controls';
const CHILD_MODE_KEY = 'C07_FRONTEND_CHILD_MODE';
const CHILD_OBSERVATION_KEY = 'C07_FRONTEND_OBSERVATION_PATH';
const CHILD_SOURCE_ROOT_KEY = 'C07_FRONTEND_SOURCE_ROOT';
const MAX_CHILD_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_OBSERVATION_BYTES = 64 * 1024;

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

const SOURCE_FILES = Object.freeze({
  'ai-security-frontend-consumer-pin.v1.json': 'sha256:129999fe0c94aba7b5f3bb29f0e9a9032b9d7773594cfc386d517ae82c636a69',
  'package.json': 'sha256:f8a79fbb56cf96c7d5eda5ff9aee7ba014041bf98c33cfe1c4e4d1e8d963f899',
  'package-lock.json': 'sha256:f579c1981c3c0da66c62421f983855c199f147ba399643f43954a07f203a3324',
  'jest.config.js': 'sha256:5c132d7306bbb7c0d3c9ac170e79ac6ae0587d8ab03a1494699827619ef73abc',
  'tsconfig.json': 'sha256:17bb7ca2d05d82bcea082b83e7558e03b45f8e0a5ce5f8827194ee75fb78cd55',
  'lib/ai-security-display.ts': 'sha256:3cfadea24f26433e4de8debec732c5ba8a5126135075b6a99876cca4c7ee9876',
  'lib/api/site-scope.ts': 'sha256:98c3e440f2c76ce1408d90f5c7485d2bbcb236edff85f457c37c7d3101870908',
  'types/ai-governance.ts': 'sha256:4252a81cab2865dc1e7c0129f82ea6ee3d9b754d71fad0256cbe017d5e501fb9',
  'types/generated/ai-security-portable.generated.ts': 'sha256:29cb17dbfad22117775105ed36ffd9ae2cb7fdefd11e89f50f21a8d20face68b',
  'components/admin/ai-security-policy-section.tsx': 'sha256:d696707a65096394c55acc1d9c6a338f075b98488fc5d0cc4f3341375e632ac9',
});

const RUNTIME_VERSIONS = Object.freeze({
  jest: '29.7.0',
  react: '19.2.4',
  'react-dom': '19.2.4',
  '@testing-library/react': '16.3.2',
  '@testing-library/jest-dom': '6.9.1',
  'jest-environment-jsdom': '29.7.0',
  'ts-jest': '29.4.11',
  typescript: '5.9.3',
});

function invariant(condition) {
  if (!condition) throw new Error('C07 frontend semantic driver invariant failed');
}

function sha256(bytes) {
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function canonicalBytes(value) {
  return Buffer.from(stableJson(value) + '\n', 'utf8');
}

function exactKeys(value, expected) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value));
  invariant(stableJson(Object.keys(value).sort()) === stableJson([...expected].sort()));
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

function semanticInput() {
  return {
    knownRaw: 'approved',
    unknownSafeRaw: 'future-provider',
    unknownUnsafeRaw: 'future\u202eprovider\n',
    values: ['approved'],
    labels: { approved: 'Approved' },
  };
}

function expectedObservation() {
  return {
    metadata: {
      readableVersions: ['1', '2'],
      writableVersions: ['1'],
      runtimeActivatable: false,
      signedRuntimePolicyBundle: false,
      v2WriterEnabled: false,
    },
    known: {
      kind: 'known', tone: 'mapped', labelId: 'APPROVED',
      technicalTokenState: 'KNOWN', approvedGreen: true,
    },
    unknownSafe: {
      kind: 'unsupported', tone: 'neutral', labelId: 'UNSUPPORTED',
      technicalTokenState: 'BOUNDED', approvedGreen: false,
    },
    unknownUnsafe: {
      kind: 'unsupported', tone: 'neutral', labelId: 'UNSUPPORTED',
      technicalTokenState: 'ABSENT', approvedGreen: false,
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

function readBindings() {
  invariant(process.argv.length === 2);
  invariant(__filename === DRIVER_PATH && fs.realpathSync(__filename) === DRIVER_PATH);
  invariant(process.execPath === NODE_PATH);
  invariant(process.env[CHILD_MODE_KEY] === undefined);
  invariant(process.env[CHILD_OBSERVATION_KEY] === undefined);
  invariant(process.env[CHILD_SOURCE_ROOT_KEY] === undefined);
  const actualKeys = Object.keys(process.env)
    .filter((key) => key.startsWith('CERAGON_C07_')).sort();
  invariant(stableJson(actualKeys) === stableJson([...ENVELOPE_ENV_KEYS]));
  const values = Object.fromEntries(ENVELOPE_ENV_KEYS.map((key) => [key, process.env[key]]));
  invariant(/^[0-9a-f]{64}$/.test(values.CERAGON_C07_RUN_CHALLENGE));
  invariant(values.CERAGON_C07_CONSUMER === CONSUMER);
  invariant(values.CERAGON_C07_SOURCE_COMMIT === SOURCE_COMMIT);
  invariant(values.CERAGON_C07_SOURCE_TREE === SOURCE_TREE);
  invariant(values.CERAGON_C07_SNAPSHOT_MANIFEST_SHA256 === SNAPSHOT_MANIFEST_SHA256);
  invariant(/^sha256:[0-9a-f]{64}$/.test(values.CERAGON_C07_INPUT_IMAGE_ID));
  invariant(values.CERAGON_C07_DRIVER_ID === DRIVER_ID);
  invariant(/^[1-9][0-9]{0,6}$/.test(values.CERAGON_C07_DRIVER_BYTES));
  const driverBytes = Number(values.CERAGON_C07_DRIVER_BYTES);
  invariant(Number.isSafeInteger(driverBytes) && driverBytes <= 1_048_576);
  invariant(/^sha256:[0-9a-f]{64}$/.test(values.CERAGON_C07_DRIVER_SHA256));
  const selfBytes = fs.readFileSync(DRIVER_PATH);
  invariant(selfBytes.length === driverBytes);
  invariant(sha256(selfBytes) === values.CERAGON_C07_DRIVER_SHA256);
  return Object.freeze({
    runChallenge: values.CERAGON_C07_RUN_CHALLENGE,
    inputImageId: values.CERAGON_C07_INPUT_IMAGE_ID,
    driverBytes,
    driverSha256: values.CERAGON_C07_DRIVER_SHA256,
  });
}

function verifySourceAndArtifact() {
  invariant(fs.realpathSync(SOURCE_ROOT) === SOURCE_ROOT);
  for (const [relative, expected] of Object.entries(SOURCE_FILES)) {
    readDigestBoundFile(path.posix.join(SOURCE_ROOT, relative), expected);
  }
  const artifactBytes = readDigestBoundFile(ARTIFACT_PATH, ARTIFACT_SHA256);
  const artifact = JSON.parse(artifactBytes.toString('utf8'));
  exactKeys(artifact, [
    'format', 'formatVersion', 'generator', 'package', 'authority', 'canonicalization',
    'protocol', 'runtimeActivatable', 'signedRuntimePolicyBundle',
    'requiredIntegrationGate', 'deferredContractSections', 'failureOracle',
    'v1Policy', 'v2Obligations',
  ]);
  invariant(artifact.format === 'ceragon.ai-security.portable-contract');
  invariant(artifact.formatVersion === 1);
}

function verifyRuntime() {
  invariant(process.version === 'v20.20.2');
  invariant(fs.realpathSync(NODE_MODULES_ROOT) === NODE_MODULES_ROOT);
  for (const [packageName, expectedVersion] of Object.entries(RUNTIME_VERSIONS)) {
    const manifestPath = path.posix.join(
      NODE_MODULES_ROOT,
      ...packageName.split('/'),
      'package.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    invariant(manifest.name === packageName && manifest.version === expectedVersion);
  }
  invariant(fs.statSync(JEST_PATH).isFile() && fs.realpathSync(JEST_PATH) === JEST_PATH);
  invariant(fs.statSync(NODE_MODULES_ROOT + '/ts-jest/dist/index.js').isFile());
  invariant(fs.statSync(
    NODE_MODULES_ROOT + '/jest-environment-jsdom/build/index.js',
  ).isFile());
}

function classificationProjection(classification, label, technicalToken, state) {
  exactKeys(classification, ['kind', 'token', 'label', 'tone', 'technicalToken']);
  invariant(classification.label === label && classification.technicalToken === technicalToken);
  return {
    kind: classification.kind,
    tone: classification.tone,
    labelId: classification.label === 'Approved' ? 'APPROVED' : 'UNSUPPORTED',
    technicalTokenState: state,
  };
}

function usesSuccessIndicator(element) {
  invariant(element && typeof element.outerHTML === 'string');
  return element.outerHTML.includes('signal-success');
}

function neutralStatus(element) {
  return element.getAttribute('data-ai-security-tone') === 'neutral'
    && !usesSuccessIndicator(element);
}

function writeExclusiveObservation(observation) {
  const observationPath = exactAbsolutePath(process.env[CHILD_OBSERVATION_KEY]);
  invariant(/^\/tmp\/ceragon-c07-frontend-[A-Za-z0-9_-]+\/observation\.json$/.test(
    observationPath,
  ));
  const bytes = canonicalBytes(observation);
  invariant(bytes.length <= MAX_OBSERVATION_BYTES);
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const handle = fs.openSync(
    observationPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollow,
    0o600,
  );
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function defineChildSemanticTest() {
  invariant(/^[0-9a-f]{64}$/.test(process.env[CHILD_MODE_KEY] || ''));
  invariant(process.env[CHILD_SOURCE_ROOT_KEY] === SOURCE_ROOT);
  const { test, expect, jest: jestApi } = require('@jest/globals');

  jestApi.mock('@/components/site-context', () => ({
    useSiteScope: () => Object.freeze({ activeSiteId: 'site-1', isSiteReady: true }),
    useSiteContext: () => Object.freeze({ activeSite: Object.freeze({ name: 'Test site' }) }),
  }));
  jestApi.mock('sonner', () => ({
    toast: Object.freeze({ success: jestApi.fn(), error: jestApi.fn() }),
  }));
  jestApi.mock('@/lib/logger', () => ({
    logger: Object.freeze({ error: jestApi.fn() }),
  }));

  const React = require('react');
  const { cleanup, render, screen } = require('@testing-library/react');
  const { classifyAiSecurityDisplayToken } = require('@/lib/ai-security-display');
  const {
    AiProviderGovernanceStatusControl,
    AiSecurityPolicySection,
  } = require('@/components/admin/ai-security-policy-section');
  const { cloneRecommendedAiSecurityPolicy } = require('@/types/ai-governance');
  const metadata = require('@/types/generated/ai-security-portable.generated');

  function policyFetch(providerToken, includeProviderToken) {
    const config = cloneRecommendedAiSecurityPolicy();
    if (includeProviderToken) config.providers.tolerated.push(providerToken);
    const fetchMock = jestApi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        siteId: 'site-1',
        source: 'stored',
        config,
        updatedAt: null,
        updatedBy: null,
      }),
    }));
    global.fetch = fetchMock;
    return fetchMock;
  }

  async function renderPolicy(providerToken, includeProviderToken) {
    const fetchMock = policyFetch(providerToken, includeProviderToken);
    render(React.createElement(AiSecurityPolicySection, { readOnly: true }));
    await screen.findByText(includeProviderToken ? 'Unsupported provider' : 'OpenAI (ChatGPT)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/ai-control-plane/security-policy?siteId=site-1',
      { cache: 'no-store' },
    ]);
  }

  test(TEST_NAME, async () => {
    const input = semanticInput();
    const knownClassification = classifyAiSecurityDisplayToken(
      input.knownRaw, input.values, input.labels,
    );
    const safeClassification = classifyAiSecurityDisplayToken(
      input.unknownSafeRaw, input.values, input.labels,
    );
    const unsafeClassification = classifyAiSecurityDisplayToken(
      input.unknownUnsafeRaw, input.values, input.labels,
    );
    expect(knownClassification).toEqual({
      kind: 'known',
      token: 'approved',
      label: 'Approved',
      tone: 'mapped',
      technicalToken: 'approved',
    });
    expect(safeClassification).toEqual({
      kind: 'unsupported',
      token: null,
      label: 'Unsupported',
      tone: 'neutral',
      technicalToken: 'future-provider',
    });
    expect(unsafeClassification).toEqual({
      kind: 'unsupported',
      token: null,
      label: 'Unsupported',
      tone: 'neutral',
      technicalToken: null,
    });

    const onChange = jestApi.fn();
    render(React.createElement(AiProviderGovernanceStatusControl, {
      status: input.unknownSafeRaw,
      providerLabel: 'OpenAI (ChatGPT)',
      onChange,
    }));
    const directUnknownStatus = screen.getByRole('status', {
      name: 'Governance status for OpenAI (ChatGPT): unsupported',
    });
    const directUnknownNeutral = neutralStatus(directUnknownStatus);
    const directUnknownComboboxAbsent = screen.queryByRole('combobox') === null;
    const directUnknownSuccessAbsent = !usesSuccessIndicator(directUnknownStatus);
    expect(onChange).not.toHaveBeenCalled();
    cleanup();

    await renderPolicy(input.unknownSafeRaw, true);
    expect(screen.getByText(input.unknownSafeRaw)).not.toBeNull();
    const safeProviderStatus = screen.getByRole('status', {
      name: 'Governance status for Unsupported provider: unsupported',
    });
    const safeProviderNeutral = neutralStatus(safeProviderStatus);
    const safeProviderComboboxAbsent = screen.queryByRole('combobox', {
      name: 'Governance status for Unsupported provider',
    }) === null;
    const safeProviderSuccess = usesSuccessIndicator(safeProviderStatus);
    cleanup();

    await renderPolicy(input.unknownUnsafeRaw, true);
    expect(screen.getByText('Invalid token')).not.toBeNull();
    const unsafeProviderStatus = screen.getByRole('status', {
      name: 'Governance status for Unsupported provider: unsupported',
    });
    const unsafeProviderNeutral = neutralStatus(unsafeProviderStatus);
    const unsafeProviderComboboxAbsent = screen.queryByRole('combobox', {
      name: 'Governance status for Unsupported provider',
    }) === null;
    const unsafeProviderSuccess = usesSuccessIndicator(unsafeProviderStatus);
    const hostileRawAbsent = !document.body.textContent.includes(input.unknownUnsafeRaw)
      && !document.body.innerHTML.includes(input.unknownUnsafeRaw);
    cleanup();

    await renderPolicy(null, false);
    const knownSelect = screen.getByRole('combobox', {
      name: 'Governance status for OpenAI (ChatGPT)',
    });
    const knownIndicator = knownSelect.parentElement.querySelector('span[aria-hidden]');
    const knownBaselineSuccess = knownSelect.value === 'approved'
      && knownIndicator !== null
      && (knownIndicator.getAttribute('style') || '').includes('var(--signal-success)');
    cleanup();

    const known = classificationProjection(
      knownClassification, 'Approved', 'approved', 'KNOWN',
    );
    known.approvedGreen = knownBaselineSuccess;
    const unknownSafe = classificationProjection(
      safeClassification, 'Unsupported', 'future-provider', 'BOUNDED',
    );
    unknownSafe.approvedGreen = safeProviderSuccess;
    const unknownUnsafe = classificationProjection(
      unsafeClassification, 'Unsupported', null, 'ABSENT',
    );
    unknownUnsafe.approvedGreen = unsafeProviderSuccess;
    const observation = {
      metadata: {
        readableVersions: [...metadata.AI_ENFORCEMENT_PROTOCOL_VERSIONS],
        writableVersions: [...metadata.AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS],
        runtimeActivatable: metadata.AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE,
        signedRuntimePolicyBundle: metadata.AI_SECURITY_PORTABLE_SIGNED_RUNTIME_POLICY_BUNDLE,
        v2WriterEnabled: metadata.AI_SECURITY_V2_WRITER_ENABLED,
      },
      known,
      unknownSafe,
      unknownUnsafe,
      componentOracle: {
        unknownProviderNeutral: safeProviderNeutral && unsafeProviderNeutral,
        unknownStatusNeutral: directUnknownNeutral,
        successIndicatorAbsent:
          directUnknownSuccessAbsent && !safeProviderSuccess && !unsafeProviderSuccess,
        comboboxAbsent:
          directUnknownComboboxAbsent
          && safeProviderComboboxAbsent
          && unsafeProviderComboboxAbsent,
        hostileRawAbsent,
        knownBaselineSuccess,
      },
    };
    expect(observation).toEqual(expectedObservation());
    writeExclusiveObservation(observation);
  });
}

function jestConfiguration() {
  return {
    cache: false,
    moduleNameMapper: { '^@/(.*)$': '/workspace/$1' },
    modulePaths: [NODE_MODULES_ROOT],
    rootDir: '/',
    roots: ['/workspace', '/c07'],
    testEnvironment: NODE_MODULES_ROOT + '/jest-environment-jsdom/build/index.js',
    testEnvironmentOptions: { url: 'https://c07.invalid/' },
    testRegex: ['/c07/frontend-semantic-driver\\.test\\.cjs$'],
    transform: {
      '^.+\\.tsx?$': [
        NODE_MODULES_ROOT + '/ts-jest/dist/index.js',
        {
          diagnostics: true,
          isolatedModules: true,
          tsconfig: '/workspace/tsconfig.json',
        },
      ],
    },
    verbose: false,
  };
}

function validateJestResult(bytes) {
  invariant(Buffer.isBuffer(bytes) && bytes.length >= 2 && bytes.length <= MAX_CHILD_OUTPUT_BYTES);
  const result = JSON.parse(bytes.toString('utf8'));
  invariant(result.success === true && result.wasInterrupted === false);
  invariant(result.numTotalTestSuites === 1 && result.numPassedTestSuites === 1);
  invariant(result.numFailedTestSuites === 0 && result.numPendingTestSuites === 0);
  invariant(result.numRuntimeErrorTestSuites === 0);
  invariant(result.numTotalTests === 1 && result.numPassedTests === 1);
  invariant(result.numFailedTests === 0 && result.numPendingTests === 0);
  invariant(result.numTodoTests === 0);
  invariant(Array.isArray(result.testResults) && result.testResults.length === 1);
  const suite = result.testResults[0];
  invariant(suite.status === 'passed');
  invariant(Array.isArray(suite.assertionResults) && suite.assertionResults.length === 1);
  const assertion = suite.assertionResults[0];
  invariant(assertion.status === 'passed' && assertion.title === TEST_NAME);
  invariant(Array.isArray(assertion.ancestorTitles) && assertion.ancestorTitles.length === 0);
  invariant(Array.isArray(assertion.failureMessages) && assertion.failureMessages.length === 0);
  invariant(suite.testExecError === undefined || suite.testExecError === null);
}

function readStableObservation(observationPath) {
  const beforePath = fs.lstatSync(observationPath, { bigint: true });
  invariant(beforePath.isFile() && !beforePath.isSymbolicLink() && beforePath.nlink === 1n);
  invariant(beforePath.size >= 2n && beforePath.size <= BigInt(MAX_OBSERVATION_BYTES));
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const handle = fs.openSync(observationPath, fs.constants.O_RDONLY | noFollow);
  try {
    const before = fs.fstatSync(handle, { bigint: true });
    const bytes = fs.readFileSync(handle);
    const after = fs.fstatSync(handle, { bigint: true });
    for (const field of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
      invariant(after[field] === before[field]);
    }
    invariant(bytes.length === Number(before.size));
    invariant(bytes.at(-1) === 0x0a && !bytes.subarray(0, -1).includes(0x0a));
    const observation = JSON.parse(bytes.toString('utf8'));
    invariant(bytes.equals(canonicalBytes(observation)));
    exactKeys(observation, [
      'metadata', 'known', 'unknownSafe', 'unknownUnsafe', 'componentOracle',
    ]);
    return observation;
  } finally {
    fs.closeSync(handle);
  }
}

function runRenderedOracle() {
  const temporaryRoot = fs.mkdtempSync('/tmp/ceragon-c07-frontend-');
  invariant(/^\/tmp\/ceragon-c07-frontend-[A-Za-z0-9_-]+$/.test(temporaryRoot));
  fs.chmodSync(temporaryRoot, 0o700);
  const observationPath = path.posix.join(temporaryRoot, 'observation.json');
  invariant(!fs.existsSync(observationPath));
  try {
    const child = spawnSync(process.execPath, [
      JEST_PATH,
      '--runInBand',
      '--runTestsByPath',
      DRIVER_PATH,
      '--config',
      stableJson(jestConfiguration()),
      '--json',
      '--silent',
      '--no-cache',
      '--noStackTrace',
      '--testTimeout=30000',
    ], {
      cwd: SOURCE_ROOT,
      encoding: null,
      env: {
        [CHILD_MODE_KEY]: crypto.randomBytes(32).toString('hex'),
        [CHILD_OBSERVATION_KEY]: observationPath,
        [CHILD_SOURCE_ROOT_KEY]: SOURCE_ROOT,
        CI: 'true',
        FORCE_COLOR: '0',
        HOME: temporaryRoot,
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        NODE_ENV: 'test',
        NO_COLOR: '1',
        PATH: '/usr/local/bin:/usr/bin:/bin',
        TMPDIR: temporaryRoot,
        TZ: 'UTC',
      },
      maxBuffer: MAX_CHILD_OUTPUT_BYTES,
      timeout: 120_000,
      windowsHide: true,
    });
    invariant(child.error === undefined && child.signal === null && child.status === 0);
    invariant(Buffer.isBuffer(child.stdout) && Buffer.isBuffer(child.stderr));
    invariant(child.stdout.length <= MAX_CHILD_OUTPUT_BYTES);
    invariant(child.stderr.length <= MAX_CHILD_OUTPUT_BYTES);
    validateJestResult(child.stdout);
    return readStableObservation(observationPath);
  } finally {
    invariant(
      temporaryRoot.startsWith('/tmp/ceragon-c07-frontend-')
      && path.posix.dirname(temporaryRoot) === '/tmp',
    );
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function buildSemanticReceipt(observation) {
  const input = semanticInput();
  const caseRow = {
    id: 'FRONTEND_UNKNOWN_NEUTRAL_NOT_GREEN',
    inputSha256: sha256(canonicalBytes(input)),
    observationSha256: sha256(canonicalBytes(observation)),
    observation,
  };
  const catalog = {
    format: 'ceragon.ai-security.semantic-case-catalog',
    formatVersion: 1,
    oracleVersion: 'C07_EXACT_COMPATIBILITY_ORACLE_V1',
    consumer: CONSUMER,
    driverId: DRIVER_ID,
    entries: [{
      caseId: caseRow.id,
      inputSha256: caseRow.inputSha256,
      observationSha256: caseRow.observationSha256,
      resultCount: 1,
    }],
  };
  return {
    format: 'ceragon.ai-security.semantic-receipt',
    formatVersion: 1,
    driverId: DRIVER_ID,
    artifactSha256: ARTIFACT_SHA256,
    caseCatalogSha256: sha256(canonicalBytes(catalog)),
    cases: [caseRow],
  };
}

function main() {
  const bindings = readBindings();
  verifySourceAndArtifact();
  verifyRuntime();
  const semanticReceipt = buildSemanticReceipt(runRenderedOracle());
  process.stdout.write(canonicalBytes({
    format: 'ceragon.ai-security.contained-semantic-envelope',
    formatVersion: 1,
    runChallenge: bindings.runChallenge,
    consumer: CONSUMER,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    snapshotManifestSha256: SNAPSHOT_MANIFEST_SHA256,
    inputImageId: bindings.inputImageId,
    driverId: DRIVER_ID,
    driverBytes: bindings.driverBytes,
    driverSha256: bindings.driverSha256,
    semanticReceipt,
  }));
}

if (process.env[CHILD_MODE_KEY] !== undefined) {
  defineChildSemanticTest();
} else {
  try {
    main();
  } catch {
    process.exitCode = 1;
  }
}
