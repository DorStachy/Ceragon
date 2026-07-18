'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(PACKAGE_ROOT, 'src', 'runtime-adapter-contract.ts');
const DIST_INDEX_JS_PATH = path.join(PACKAGE_ROOT, 'dist', 'index.js');
const DIST_INDEX_DTS_PATH = path.join(PACKAGE_ROOT, 'dist', 'index.d.ts');
const DIST_CONTRACT_DTS_PATH = path.join(
  PACKAGE_ROOT,
  'dist',
  'runtime-adapter-contract.d.ts',
);

const EXPECTED_SOURCE_LF_SHA256 =
  '62cbba9f0f629970c102ee086bf416c61cad3342355453fe1f04b9dfbe10821a';
const EXPECTED_SEMANTIC_SHA256 =
  'f4cbb69431d099da53a7e6cc655270313628b6b7509bee1b1c2d8e281de40709';
const EXPECTED_SEMANTIC_JSON_BYTES = 10302;
const EXPECTED_TYPESCRIPT_VERSION = '5.9.3';

const property = (name, optional, type) => ({
  name,
  optional,
  type,
  kind: 'PropertySignature',
});

const interfaceDeclaration = (name, heritage, members) => ({
  kind: 'interface',
  name,
  extends: heritage,
  members: members.map(([memberName, optional, type]) =>
    property(memberName, optional, type),
  ),
});

// This readable fixture is the contract. The digest below is a second,
// independently reproducible guard over its compact JSON representation.
const EXPECTED_SEMANTIC_MANIFEST = [
  {
    kind: 'const',
    name: 'COVERAGE_DEPTHS',
    values: [
      'full-loop-governed',
      'partial-native-governance',
      'provider-traffic-governed',
      'security-context-only',
      'detected-only',
      'not-endpoint-governed',
      'provider-egress-control',
    ],
  },
  { kind: 'type', name: 'CoverageDepth', type: '(typeof COVERAGE_DEPTHS)[number]' },
  {
    kind: 'const',
    name: 'ENFORCEMENT_EFFECTS',
    values: [
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
      'restrict-capability',
    ],
  },
  {
    kind: 'type',
    name: 'EnforcementEffect',
    type: '(typeof ENFORCEMENT_EFFECTS)[number]',
  },
  {
    kind: 'const',
    name: 'CERTIFICATION_STATES',
    values: ['documented', 'configured', 'loaded', 'observed', 'enforcement-tested'],
  },
  {
    kind: 'type',
    name: 'CertificationState',
    type: '(typeof CERTIFICATION_STATES)[number]',
  },
  {
    kind: 'const',
    name: 'CANONICAL_HOOK_EVENTS',
    values: [
      'USER_PROMPT_SUBMIT',
      'PRE_TOOL_USE',
      'POST_TOOL_USE',
      'CONFIG_CHANGE',
      'SESSION_START',
      'SESSION_END',
      'SUBAGENT_STOP',
      'PERMISSION_REQUEST',
      'PRE_COMPACT',
      'POST_COMPACT',
      'SUBAGENT_START',
    ],
  },
  {
    kind: 'type',
    name: 'CanonicalHookEvent',
    type: '(typeof CANONICAL_HOOK_EVENTS)[number]',
  },
  {
    kind: 'const',
    name: 'GOVERNANCE_DISPOSITIONS',
    values: [
      'devoid-mediated',
      'delegated-and-attested',
      'restricted-intent-unverified',
      'observed-only',
      'not-governed',
      'wire-observed-after-dispatch',
      'hook-failed-original-action-proceeded',
      'native-hook-unverified',
      'effect-expressed-runtime-unverified',
      'effect-unsupported-original-action-proceeded',
      'translation-failed-original-action-proceeded',
      'runtime-acknowledged-effect',
    ],
  },
  {
    kind: 'type',
    name: 'GovernanceDisposition',
    type: '(typeof GOVERNANCE_DISPOSITIONS)[number]',
  },
  {
    kind: 'const',
    name: 'MCP_GOVERNANCE_ROWS',
    values: ['mcp-config-startup', 'mcp-runtime-hook', 'mcp-transport'],
  },
  {
    kind: 'type',
    name: 'McpGovernanceRow',
    type: '(typeof MCP_GOVERNANCE_ROWS)[number]',
  },
  interfaceDeclaration('GovernedActionActor', [], [
    ['type', false, 'string'],
    ['id', false, 'string | null'],
    ['source', false, 'string'],
    ['assurance', false, 'string'],
  ]),
  interfaceDeclaration('GovernedActionExecutionSubject', [], [
    ['type', false, 'string'],
    ['id', false, 'string | null'],
    ['location', false, 'string'],
  ]),
  interfaceDeclaration('RuntimeBinding', [], [
    ['runtime', false, 'string'],
    ['host', false, 'string'],
    ['integration', false, 'string'],
    ['platform', true, 'string | null'],
    ['hookDialect', true, 'string | null'],
    ['runtimeVersion', true, 'string | null'],
    ['adapterVersion', true, 'string | null'],
    ['configSource', true, 'string | null'],
    ['executionHost', true, 'string | null'],
    ['cliVersion', true, 'string | null'],
    ['configRoot', true, 'string | null'],
    ['executablePathHash', true, 'string | null'],
    ['providerRoute', true, 'string | null'],
    ['wireApi', true, 'string | null'],
    ['baseUrl', true, 'string | null'],
    ['authMode', true, 'string | null'],
  ]),
  interfaceDeclaration('RuntimeSessionIdentity', [], [
    ['runtimeSessionId', true, 'string | null'],
    ['backendSessionId', true, 'string | null'],
    ['toolUseId', true, 'string | null'],
    ['checkpoint', true, 'CanonicalHookEvent | null'],
    ['eventId', true, 'string | null'],
    ['idempotencyKey', true, 'string | null'],
  ]),
  interfaceDeclaration(
    'GovernedActionEnvelope',
    ['RuntimeBinding', 'RuntimeSessionIdentity'],
    [
      ['actor', false, 'GovernedActionActor'],
      ['executionSubject', false, 'GovernedActionExecutionSubject'],
      ['governanceDisposition', true, 'GovernanceDisposition | null'],
      ['enforcementEffect', true, 'EnforcementEffect | null'],
    ],
  ),
  interfaceDeclaration('CapabilitySet', [], [
    ['checkpoint', false, 'CanonicalHookEvent'],
    ['certificationState', false, 'CertificationState'],
    ['enforcementEffect', true, 'EnforcementEffect | null'],
    ['loaded', true, 'boolean'],
    ['lastObservedAt', true, 'string | null'],
    ['lastEnforcementTestedAt', true, 'string | null'],
    ['drifted', true, 'boolean'],
    ['fresh', true, 'boolean'],
    ['intendedEffect', true, 'EnforcementEffect | null'],
    ['actualEffect', true, 'EnforcementEffect | null'],
  ]),
  interfaceDeclaration('McpGovernanceCapability', [], [
    ['row', false, 'McpGovernanceRow'],
    ['certificationState', false, 'CertificationState'],
    ['coverageDepth', true, 'CoverageDepth | null'],
    ['enforcementEffect', true, 'EnforcementEffect | null'],
    ['lastObservedAt', true, 'string | null'],
    ['lastEnforcementTestedAt', true, 'string | null'],
  ]),
  interfaceDeclaration('RuntimeInstance', [], [
    ['adapterId', false, 'string'],
    ['binding', false, 'RuntimeBinding'],
    ['executionLocation', false, 'string'],
    ['coverageDepth', false, 'CoverageDepth'],
    ['certificationState', false, 'CertificationState'],
    ['capabilities', false, 'CapabilitySet[]'],
  ]),
  interfaceDeclaration('AdapterCapabilityCertificate', [], [
    ['adapterId', false, 'string'],
    ['adapterVersion', false, 'string'],
    ['contractVersion', false, 'string'],
    ['runtime', false, 'string'],
    ['host', false, 'string'],
    ['platform', false, 'string'],
    ['hookDialect', false, 'string'],
    ['runtimeVersionRange', false, 'string'],
    ['checkpoint', false, 'CanonicalHookEvent'],
    ['coverageDepth', false, 'CoverageDepth'],
    ['certificationState', false, 'CertificationState'],
    ['testedAt', false, 'string'],
  ]),
  interfaceDeclaration('RuntimeAdapterReport', [], [
    ['adapterId', false, 'string'],
    ['binding', false, 'RuntimeBinding'],
    ['executionLocation', false, 'string'],
    ['coverageDepth', false, 'CoverageDepth'],
    ['certificationState', false, 'CertificationState'],
    ['capabilities', false, 'CapabilitySet[]'],
    ['mcpGovernance', true, 'McpGovernanceCapability[]'],
    ['configHash', true, 'string | null'],
    ['loaded', true, 'boolean'],
    ['lastObservedAt', true, 'string | null'],
    ['lastEnforcementTestedAt', true, 'string | null'],
    ['drifted', true, 'boolean'],
    ['fresh', true, 'boolean'],
    ['deploymentAssurance', true, 'string'],
    ['certificate', true, 'AdapterCapabilityCertificate | null'],
    ['attestedAt', true, 'string'],
    ['versionChurned', true, 'boolean'],
  ]),
];

const FORBIDDEN_RAW_CONTENT_FIELDS = new Set([
  'prompt',
  'promptText',
  'rawPrompt',
  'input',
  'rawInput',
  'content',
  'rawContent',
  'fileContent',
  'command',
  'rawCommand',
  'toolOutput',
  'output',
  'rawOutput',
  'secret',
  'secretValue',
  'token',
  'accessToken',
  'apiKey',
  'credential',
  'credentials',
  'payload',
  'requestBody',
  'responseBody',
  'toolResult',
]);

const EXPECTED_RUNTIME_TUPLES = EXPECTED_SEMANTIC_MANIFEST.filter(
  (declaration) => declaration.kind === 'const',
);
const EXPECTED_DECLARATION_NAMES = EXPECTED_SEMANTIC_MANIFEST.map(
  (declaration) => declaration.name,
);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeTypeScriptText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isExported(statement) {
  return Boolean(
    statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ),
  );
}

/**
 * Deterministic normalization bound by P0-C01:
 * - source-order exported statements only;
 * - source-order variable declarations, tuple elements, heritage, and members;
 * - whitespace-collapsed type/name text;
 * - compact JSON.stringify with insertion order and no trailing newline.
 */
function buildSemanticManifest(sourceFile) {
  const manifest = [];

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        assert.ok(
          ts.isIdentifier(declaration.name),
          'runtime-adapter contract exports only identifier-named constants',
        );
        const normalized = { kind: 'const', name: declaration.name.text };
        if (
          declaration.initializer &&
          ts.isAsExpression(declaration.initializer) &&
          ts.isArrayLiteralExpression(declaration.initializer.expression)
        ) {
          normalized.values = declaration.initializer.expression.elements.map((element) => {
            assert.ok(
              ts.isStringLiteral(element),
              `${declaration.name.text} must contain bare string literals only`,
            );
            return element.text;
          });
        }
        manifest.push(normalized);
        continue;
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      manifest.push({
        kind: 'type',
        name: statement.name.text,
        type: normalizeTypeScriptText(statement.type.getText(sourceFile)),
      });
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      manifest.push({
        kind: 'interface',
        name: statement.name.text,
        extends: (statement.heritageClauses ?? []).flatMap((clause) =>
          clause.types.map((type) =>
            normalizeTypeScriptText(type.getText(sourceFile)),
          ),
        ),
        members: statement.members.map((member) => ({
          name: member.name
            ? normalizeTypeScriptText(member.name.getText(sourceFile))
            : '',
          optional: Boolean(member.questionToken),
          type: member.type
            ? normalizeTypeScriptText(member.type.getText(sourceFile))
            : '',
          kind: ts.SyntaxKind[member.kind],
        })),
      });
      continue;
    }

    assert.fail(
      `unexpected exported declaration kind: ${ts.SyntaxKind[statement.kind]}`,
    );
  }

  return manifest;
}

function parseTypeScript(filePath, source) {
  return ts.createSourceFile(
    path.basename(filePath),
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function verifySourceContract() {
  assert.equal(
    ts.version,
    EXPECTED_TYPESCRIPT_VERSION,
    'TypeScript AST toolchain drifted; re-verify the semantic normalization before updating',
  );
  assert.ok(
    fs.existsSync(SOURCE_PATH),
    `P0-C01 source missing: ${path.relative(PACKAGE_ROOT, SOURCE_PATH)}`,
  );

  const rawSource = fs.readFileSync(SOURCE_PATH, 'utf8');
  const lfSource = rawSource.replace(/\r\n?/g, '\n');
  assert.equal(
    sha256(Buffer.from(lfSource, 'utf8')),
    EXPECTED_SOURCE_LF_SHA256,
    'runtime-adapter source LF SHA-256 drifted',
  );

  const sourceFile = parseTypeScript(SOURCE_PATH, rawSource);
  const semanticManifest = buildSemanticManifest(sourceFile);
  const semanticJson = JSON.stringify(semanticManifest);
  const expectedSemanticJson = JSON.stringify(EXPECTED_SEMANTIC_MANIFEST);

  assert.equal(EXPECTED_SEMANTIC_MANIFEST.length, 22);
  assert.equal(Buffer.byteLength(expectedSemanticJson, 'utf8'), EXPECTED_SEMANTIC_JSON_BYTES);
  assert.equal(
    sha256(Buffer.from(expectedSemanticJson, 'utf8')),
    EXPECTED_SEMANTIC_SHA256,
    'static expected semantic manifest was edited without an authority update',
  );
  assert.deepEqual(
    semanticManifest,
    EXPECTED_SEMANTIC_MANIFEST,
    'runtime-adapter exported AST shape drifted',
  );
  assert.equal(Buffer.byteLength(semanticJson, 'utf8'), EXPECTED_SEMANTIC_JSON_BYTES);
  assert.equal(
    sha256(Buffer.from(semanticJson, 'utf8')),
    EXPECTED_SEMANTIC_SHA256,
    'runtime-adapter normalized semantic SHA-256 drifted',
  );

  assert.equal(EXPECTED_RUNTIME_TUPLES.length, 6);
  for (const expectedTuple of EXPECTED_RUNTIME_TUPLES) {
    const actualTuple = semanticManifest.find(
      (declaration) =>
        declaration.kind === 'const' && declaration.name === expectedTuple.name,
    );
    assert.deepEqual(
      actualTuple?.values,
      expectedTuple.values,
      `${expectedTuple.name} ordinal order drifted`,
    );
  }

  const enumNames = sourceFile.statements
    .filter(ts.isEnumDeclaration)
    .map((declaration) => declaration.name.text);
  assert.deepEqual(enumNames, [], 'identity enums are forbidden in this contract');

  const interfaceMembers = semanticManifest
    .filter((declaration) => declaration.kind === 'interface')
    .flatMap((declaration) => declaration.members.map((member) => member.name));
  const forbiddenFieldsFound = interfaceMembers.filter((memberName) =>
    FORBIDDEN_RAW_CONTENT_FIELDS.has(memberName),
  );
  assert.deepEqual(
    forbiddenFieldsFound,
    [],
    'runtime-adapter contract must remain free of raw prompt/content/secret fields',
  );

  console.log(
    `runtime-adapter source semantics: PASS (${semanticManifest.length} declarations, ` +
      `${EXPECTED_RUNTIME_TUPLES.length} ordered tuples, TypeScript ${ts.version}, ` +
      `sha256=${EXPECTED_SEMANTIC_SHA256})`,
  );
}

function collectExportedDeclarationNames(sourceFile) {
  const names = [];
  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    } else if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement)
    ) {
      if (statement.name) names.push(statement.name.text);
    }
  }
  return names;
}

function verifyPublicBuildExports() {
  for (const requiredPath of [
    DIST_INDEX_JS_PATH,
    DIST_INDEX_DTS_PATH,
    DIST_CONTRACT_DTS_PATH,
  ]) {
    assert.ok(
      fs.existsSync(requiredPath),
      `built artifact missing; run npm run build first: ${path.relative(PACKAGE_ROOT, requiredPath)}`,
    );
  }

  delete require.cache[require.resolve(DIST_INDEX_JS_PATH)];
  const rootExports = require(DIST_INDEX_JS_PATH);
  for (const expectedTuple of EXPECTED_RUNTIME_TUPLES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(rootExports, expectedTuple.name),
      `dist root runtime export missing: ${expectedTuple.name}`,
    );
    assert.deepEqual(
      Array.from(rootExports[expectedTuple.name]),
      expectedTuple.values,
      `dist root runtime tuple drifted: ${expectedTuple.name}`,
    );
  }

  const rootDeclarationSource = fs.readFileSync(DIST_INDEX_DTS_PATH, 'utf8');
  const rootDeclarationFile = parseTypeScript(
    DIST_INDEX_DTS_PATH,
    rootDeclarationSource,
  );
  const contractRootExports = rootDeclarationFile.statements.filter(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      !statement.exportClause &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === './runtime-adapter-contract',
  );
  assert.equal(
    contractRootExports.length,
    1,
    "dist/index.d.ts must publicly export exactly one './runtime-adapter-contract' module",
  );

  const contractDeclarationSource = fs.readFileSync(DIST_CONTRACT_DTS_PATH, 'utf8');
  const contractDeclarationFile = parseTypeScript(
    DIST_CONTRACT_DTS_PATH,
    contractDeclarationSource,
  );
  assert.deepEqual(
    collectExportedDeclarationNames(contractDeclarationFile),
    EXPECTED_DECLARATION_NAMES,
    'built runtime-adapter declarations do not expose the exact 22-declaration contract',
  );

  console.log(
    `runtime-adapter public build exports: PASS (${EXPECTED_RUNTIME_TUPLES.length} runtime + ` +
      `${EXPECTED_DECLARATION_NAMES.length} declared exports)`,
  );
}

const mode = process.argv[2] ?? '--all';
assert.ok(
  ['--all', '--source-only', '--public-export-only'].includes(mode),
  `unknown test mode: ${mode}`,
);

if (mode !== '--public-export-only') verifySourceContract();
if (mode !== '--source-only') verifyPublicBuildExports();

console.log('runtime-adapter contract tests: PASS');
if (mode === '--all') require('./test-ai-enforcement-four-axis-contract.cjs');
