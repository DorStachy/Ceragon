'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'ai-security-policy-v1-contract.ts');
const distIndexPath = path.join(root, 'dist', 'index.js');
const distDeclarationPath = path.join(root, 'dist', 'ai-security-policy-v1-contract.d.ts');
const authorityFixturePath = path.join(
  root, 'fixtures', 'ai-security-policy-v1-authority.json',
);

const DLP_CLASSES = [
  'private-key', 'aws-secret-key', 'aws-access-key', 'gcp-key', 'azure-key',
  'generic-api-key', 'jwt', 'slack-token', 'github-token', 'internal-url',
  'openai-key', 'anthropic-key', 'stripe-live', 'slack-webhook', 'sendgrid-key',
  'twilio-key', 'npm-token', 'pypi-token', 'gitlab-token', 'google-oauth-secret',
  'high-entropy', 'kubeconfig', 'db-connection-string',
  'aws-credential-pair', 'gcp-service-account', 'azure-connection-string',
  'bearer-auth-token', 'payment-card', 'iban', 'national-id',
];
const DLP_BLOCK = [
  'private-key', 'aws-credential-pair', 'gcp-service-account',
];
const DLP_REDACT = [
  'aws-access-key', 'gcp-key', 'generic-api-key', 'jwt', 'slack-token',
  'github-token', 'internal-url', 'openai-key', 'anthropic-key', 'stripe-live',
  'slack-webhook', 'sendgrid-key', 'twilio-key', 'npm-token', 'pypi-token',
  'gitlab-token', 'google-oauth-secret', 'db-connection-string',
  'azure-connection-string', 'payment-card', 'iban',
];
const DLP_WARN = [
  'aws-secret-key', 'azure-key', 'high-entropy', 'kubeconfig',
  'bearer-auth-token', 'national-id',
];
const PROMPT_CONFIGURABLE = [
  'injection-instruction-override', 'injection-system-exfil',
  'injection-role-marker', 'injection-obfuscation-unicode',
  'injection-encoded-payload', 'jailbreak-persona',
  'jailbreak-restriction-removal', 'jailbreak-role-reassign',
  'injection-credential-exfil', 'injection-authority-escalation',
  'injection-decoded-payload', 'ingress-tool-instruction-injection',
  'ingress-exfil-instruction', 'ingress-sensitive-path-read',
];
const PROMPT_DERIVED = [
  'injection-override-exfil', 'jailbreak-persona-unrestricted',
  'injection-override-credexfil', 'ingress-secret-exfil-combo',
];
const BROWSER_PROVIDERS = [
  'openai', 'anthropic', 'google', 'github', 'perplexity', 'poe',
];
const TOOL_PROVIDERS = [
  'cursor', 'claude-code', 'windsurf', 'github-copilot', 'cline',
  'gemini-cli', 'codex',
];
const INGRESS_CLASSES = [
  ...PROMPT_CONFIGURABLE, ...PROMPT_DERIVED,
  'ingress-exfil-verb', 'ingress-tool-poisoning',
];

const EXPECTED_TUPLES = {
  AI_SECURITY_POLICY_V1_DLP_ACTIONS: ['block', 'redact', 'warn', 'allow'],
  AI_SECURITY_POLICY_V1_PROMPT_CONFIGURABLE_CLASSES: PROMPT_CONFIGURABLE,
  AI_SECURITY_POLICY_V1_PROMPT_DERIVED_CLASSES: PROMPT_DERIVED,
  AI_SECURITY_POLICY_V1_PROMPT_CLASSES: [...PROMPT_CONFIGURABLE, ...PROMPT_DERIVED],
  AI_SECURITY_POLICY_V1_PROMPT_ACTIONS: ['block', 'warn', 'allow'],
  AI_SECURITY_POLICY_V1_BROWSER_PROVIDER_KEYS: BROWSER_PROVIDERS,
  AI_SECURITY_POLICY_V1_TOOL_PROVIDER_KEYS: TOOL_PROVIDERS,
  AI_SECURITY_POLICY_V1_GOVERNABLE_PROVIDER_KEYS: [
    ...BROWSER_PROVIDERS, ...TOOL_PROVIDERS,
  ],
  AI_SECURITY_POLICY_V1_EXCLUSION_ACTIONS: ['allow', 'block'],
  AI_SECURITY_POLICY_V1_MCP_ENFORCE_MODES: ['off', 'enforce'],
  AI_SECURITY_POLICY_V1_UPLOAD_ACTIONS: ['block', 'warn', 'allow'],
  AI_SECURITY_POLICY_V1_GOVERNANCE_MODES: ['enforce', 'monitor', ''],
  AI_SECURITY_POLICY_V1_ENFORCEMENT_TIERS: ['detect', 'strict'],
  AI_SECURITY_POLICY_V1_PROXY_FAIL_MODES: ['closed', 'open'],
  AI_SECURITY_POLICY_V1_INGRESS_ACTIONS: ['redact', 'warn', 'hold', 'off'],
  AI_SECURITY_POLICY_V1_INGRESS_CONFIGURABLE_CLASSES: INGRESS_CLASSES,
};

const dlpActions = Object.fromEntries(DLP_CLASSES.map((name) => [
  name,
  DLP_BLOCK.includes(name) ? 'block' : DLP_REDACT.includes(name) ? 'redact' : 'warn',
]));
const promptActions = Object.fromEntries([
  ...PROMPT_CONFIGURABLE.map((name) => [name, 'warn']),
  ...PROMPT_DERIVED.map((name) => [name, 'block']),
]);
const ingressActions = Object.fromEntries(
  INGRESS_CLASSES.map((name) => [name, name === 'ingress-exfil-verb' ? 'warn' : 'redact']),
);
const RECOMMENDED = {
  dlp: { enabled: true, actions: dlpActions },
  promptRisk: { enabled: true, actions: promptActions },
  providers: { blocked: [], tolerated: [] },
  exclusions: { allow: [], block: [], patterns: [] },
  mcp: { enabled: true, autoEnforce: false },
  uploads: { files: 'warn', images: 'warn', blockAllImages: false, maxSizeKb: 5120 },
  paths: { blocked: [], allowed: [] },
  agents: { allowed: [], mode: '', enforcementTier: 'detect' },
  egress: { mode: '', allowed: [], blocked: [], includeDefaults: true },
  proxy: { failMode: 'closed' },
  ingress: { enabled: true, actions: ingressActions, taintHold: true },
};
const DIRECT_OMISSION_DEFAULTS = {
  promptRisk: { obfuscationEscalates: true },
  ingress: {
    enabled: true,
    taintHold: true,
    actionForUnlistedClass: 'redact',
    builtInClassOverrides: { 'ingress-exfil-verb': 'warn' },
  },
  agents: { enforcementTier: 'detect' },
  proxy: { failMode: 'closed', failClosedUnlessLiteralOpen: true },
};

const READER_FALLBACKS = {
  legacyOrgWire: { expandedPolicySections: 'absent' },
  dlp: {
    configuredResolutionRequiresEnabled: true,
    actionResolutionOrder: [
      'configured-actions', 'legacy-class-arrays', 'built-in-default',
    ],
    builtInDefaultByClass: {
      'high-entropy': 'allow',
      allOtherClasses: 'warn',
    },
  },
  promptRisk: {
    configuredResolutionRequiresEnabled: true,
    actionResolutionOrder: [
      'configured-actions', 'legacy-dlp-class-arrays', 'severity-default',
    ],
    severityDefault: { high: 'block', medium: 'warn', other: 'allow' },
    obfuscationEscalatesWhenPolicyOrFieldAbsent: true,
  },
  providers: {
    membershipSourcesConsulted: ['nested-providers', 'legacy-top-level-providers'],
    blockedPrecedesTolerated: true,
    unlisted: 'allow',
  },
  mcp: {
    nilPolicy: { enabled: true, autoEnforce: false },
    decodedPolicyWithOmittedSection: { enabled: false, autoEnforce: false },
  },
  agents: {
    absentOrNonStrictEnforcementTier: 'detect-equivalent',
    unsetMode: 'allow',
    emptyAllowlistUnderEnforce: 'allow',
    unknownMode: 'allow',
  },
  egress: {
    omittedSectionZeroValueMode: 'allow',
    unsetMode: 'allow',
    unknownMode: 'allow',
    blockedPrecedesAllowed: true,
  },
  ingress: {
    nilPolicyOrAbsentSection: {
      enabled: true,
      taintHold: true,
      actionForUnlistedClass: 'redact',
      builtInClassOverrides: { 'ingress-exfil-verb': 'warn' },
    },
    actionResolutionOrder: ['configured-actions', 'built-in-default'],
  },
  proxy: {
    failClosedUnlessLiteralOpen: true,
  },
};


const typePrinter = ts.createPrinter({ removeComments: true });

function isExported(node) {
  return node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;
}

function normalizeTypeNode(node, sourceFile) {
  return typePrinter
    .printNode(ts.EmitHint.Unspecified, node, sourceFile)
    .replace(/\s+/g, ' ')
    .trim();
}

function exportedTypeManifest(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    path.basename(filePath), text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );

  return sourceFile.statements
    .filter((node) =>
      isExported(node) &&
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)),
    )
    .map((node) => {
      const typeParameters = (node.typeParameters ?? []).map((parameter) =>
        normalizeTypeNode(parameter, sourceFile),
      );

      if (ts.isTypeAliasDeclaration(node)) {
        return {
          kind: 'type',
          name: node.name.text,
          typeParameters,
          type: normalizeTypeNode(node.type, sourceFile),
        };
      }

      const heritage = (node.heritageClauses ?? []).map((clause) =>
        normalizeTypeNode(clause, sourceFile),
      );
      const members = node.members.map((member) => {
        if (!ts.isPropertySignature(member) || !member.name || !member.type) {
          throw new Error(
            `unsupported public interface member in ${node.name.text}: ` +
            ts.SyntaxKind[member.kind],
          );
        }
        return {
          name: member.name.getText(sourceFile),
          optional: Boolean(member.questionToken),
          readonly: member.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
          ) ?? false,
          type: normalizeTypeNode(member.type, sourceFile),
        };
      });

      return {
        kind: 'interface',
        name: node.name.text,
        typeParameters,
        heritage,
        members,
      };
    });
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function deepFreezeFixture(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreezeFixture(nested, seen);
  return Object.freeze(value);
}

function assertDeepFrozen(value, label, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${label} must be frozen`);
  for (const key of Reflect.ownKeys(value)) {
    assertDeepFrozen(value[key], `${label}.${String(key)}`, seen);
  }
}

function compilePublicFixture(body) {
  const virtualPath = path.join(root, '__ai-security-policy-v1-public-fixture.ts');
  const sourceText =
    `import {\n` +
    `  AI_SECURITY_POLICY_V1_CATALOG, AI_SECURITY_POLICY_V1_DLP_ACTIONS,\n` +
    `  AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS,\n` +
    `  AI_SECURITY_POLICY_V1_READER_FALLBACKS,\n` +
    `  RECOMMENDED_AI_SECURITY_POLICY_V1, cloneRecommendedAiSecurityPolicyV1,\n` +
    `  type AiDlpPolicyShape, type AiEffectiveSecurityPolicyWireBaseV1, type AiEffectiveSecurityPolicyWireV1,\n` +
    `  type AiLegacyPolicyWireV1, type AiPolicyWireV1,\n` +
    `  type AiSecurityPolicyUpdateV1,\n` +
    `} from './dist';\n` +
    body;
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
  const originalFileExists = host.fileExists.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const sameFile = (left, right) =>
    path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();

  host.fileExists = (fileName) =>
    sameFile(fileName, virtualPath) || originalFileExists(fileName);
  host.readFile = (fileName) =>
    sameFile(fileName, virtualPath) ? sourceText : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    sameFile(fileName, virtualPath)
      ? ts.createSourceFile(
          fileName, sourceText, languageVersion, true, ts.ScriptKind.TS,
        )
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([virtualPath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const numberedSource = sourceText
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(3)} | ${line}`)
    .join('\n');
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }) + '\n' + numberedSource,
  );
}


assert.ok(
  fs.existsSync(sourcePath),
  'P0-C02 Stage A source missing: src/ai-security-policy-v1-contract.ts',
);
assert.ok(
  fs.existsSync(authorityFixturePath),
  'P0-C02 Stage A authority fixture missing',
);
assert.ok(fs.existsSync(distIndexPath), 'dist/index.js missing; run npm run build');
assert.ok(
  fs.existsSync(distDeclarationPath),
  'dist/ai-security-policy-v1-contract.d.ts missing; run npm run build',
);
const authorityBytes = fs.readFileSync(authorityFixturePath);
assert.equal(
  sha256(authorityBytes),
  '73aeac38b2f61172a22a2539fac2c9b1829ad60393dbd5091b594813b4e486bd',
  'authority fixture changed without an explicit source-truth recapture',
);
const authority = deepFreezeFixture(JSON.parse(authorityBytes.toString('utf8')));
assertDeepFrozen(authority, 'authority fixture');
assert.equal(
  authority.captureAlgorithm,
  'SHA256_JCS_AUTHORITATIVE_SOURCE_DIGEST_MAP',
);
const { canonicalizeJcs } = require(path.join(root, 'dist', 'sqs-signer.js'));
assert.equal(
  sha256(Buffer.from(canonicalizeJcs(authority.authoritativeSources), 'utf8')),
  authority.capturedControlPlaneSotSha256,
  'authority source capture digest is not derived from the exact digest map',
);
assert.deepEqual(authority.authoritativeSources, {
  'Workspace/packages/shared-contracts/src/ai-governance-contract.ts':
    '42ebb31718598e6ce883802ced9de3f9be1734a9d8b923db803ab183b1a9ceff',
  'Backend/src/ai-security-policy/ai-security-policy.constants.ts':
    'bb49c02117eda886ce95c1a33b4bfa99524aa67e196736b0b242ffbd54f9289a',
  'Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts':
    '4dd22fc819e2092470f634845f09741b8f1136250ce917cc72d3a2a277a1c5bf',
  'Backend/src/ai-security-policy/ai-security-policy.service.ts':
    'c8616c6b00b71aa3fac3d49ea5cb88ab88e482498c5fb804a8e954cb8df4435f',
  'Backend/src/ai-governance/services/ai-policy.service.ts':
    '7e5e2dc6440a4e24063ca9b44f72b08d4f5fa64456d4b6de313b54a1939b4d39',
  'Installers/internal/core/backend/ai_prompt.go':
    '4190232fb22fa9b8c9b4b114c6ba87653664a40ee0b3dac5bab301475fa03da5',
  'Installers/internal/policyeval/policyeval.go':
    '790ff7fedc7c0f21713bc6253130ec1abb800910c6e73d04265a3b548d953c43',
  'Installers/internal/aiagent/aiagent.go':
    '1732b70eb3cf9d28af7a700bb1a6a320c3c97c7fe30e619f229052e5827b28aa',
  'Installers/internal/proxy/ai_egress.go':
    '7f43bbdc601619db83313b131088b3a00add5ffe6c0636100a92fc21ec70b105',
  'Installers/internal/daemon/ai_ingress.go':
    'd5ae0c5d7912c6ab0ee3a6cd66e88d349fa2ea9994995bac0b5aa722af47f113',
  'Installers/internal/policybundle/bundle.go':
    '82284e569afcf68c28d5d6a9f6f2c5cc321027fcf765c41986d892a84ea174d2',
  'Installers/internal/proxy/ai_proxy.go':
    'fe8f113289296920f63c3a06e7aa1de0fa79774a2a1ef53fac3912dde9431161',
  'Installers/internal/proxy/ai_ingress.go':
    'f5cd46db0882844c65ddcc8c95c7e5aee8f59e868aa07a22e8b6b5c9db6ebcdd',
  'Installers/internal/proxy/openai_decision.go':
    'e5daf1b4614a4f3ca5adcd49ad898262aef62a66542fde5cdad6c5a1fc79d026',
  'Installers/internal/daemon/ai_handlers.go':
    '11606e0a74613369b892ad58b850155a8bf4139109213522d7be18364012dfec',
  'Installers/internal/daemon/server.go':
    'e63ce45f02b25af7c9663b12b000a208b05dcd843d52169adc0c896591b272d8',
  'Installers/internal/daemon/openai_wire.go':
    'cac5272e47ad0e93ca4b61281be22c93f0ed1f328d14cc6955b042b3619b63ec',
});
const { legacyOrg, effectiveNoTeam } = authority.wireFixtures;
assert.deepEqual(Object.keys(legacyOrg), [
  'evidenceMode', 'blockedProviders', 'toleratedProviders', 'dlp', 'updatedAt',
]);
assert.equal(Object.hasOwn(effectiveNoTeam, 'resolvedScope'), false);
assert.equal(Object.hasOwn(effectiveNoTeam, 'effective'), false);


delete require.cache[require.resolve(distIndexPath)];
const contract = require(distIndexPath);
for (const [name, expected] of Object.entries(EXPECTED_TUPLES)) {
  assert.ok(Object.hasOwn(contract, name), `public tuple export missing: ${name}`);
  assert.deepEqual(Array.from(contract[name]), expected, `${name} order drifted`);
  assert.equal(new Set(contract[name]).size, expected.length, `${name} duplicates`);
}
assert.deepEqual(Array.from(contract.AI_DLP_CLASSES), DLP_CLASSES);
assert.deepEqual(contract.AI_SECURITY_POLICY_V1_CATALOG, {
  schemaVersion: 1,
  scope: 'v1-policy-addressable',
  completeDetectorInventory: false,
  phaseDPolicyAddressableInventoryComplete: true,
  dlpClasses: DLP_CLASSES,
  promptRiskConfigurableClasses: PROMPT_CONFIGURABLE,
  promptRiskDerivedClasses: PROMPT_DERIVED,
  ingressConfigurableClasses: INGRESS_CLASSES,
  browserProviderKeys: BROWSER_PROVIDERS,
  toolProviderKeys: TOOL_PROVIDERS,
  knownNonPolicyAddressableSignals: {
    policySynthesized: ['custom-blocklist'],
    degradedRuleIds: ['injection-decoded-payload-budget-exceeded'],
  },
});
assert.deepEqual(
  contract.AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS,
  DIRECT_OMISSION_DEFAULTS,
);
assert.deepEqual(
  contract.AI_SECURITY_POLICY_V1_READER_FALLBACKS,
  READER_FALLBACKS,
);
for (const name of Object.keys(EXPECTED_TUPLES)) {
  assertDeepFrozen(contract[name], name);
}
assertDeepFrozen(contract.AI_SECURITY_POLICY_V1_CATALOG, 'catalog');
assertDeepFrozen(
  contract.AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS,
  'direct omission defaults',
);
assertDeepFrozen(
  contract.AI_SECURITY_POLICY_V1_READER_FALLBACKS,
  'reader fallbacks',
);
assertDeepFrozen(
  contract.RECOMMENDED_AI_SECURITY_POLICY_V1,
  'recommended policy',
);
assert.throws(
  () => contract.AI_SECURITY_POLICY_V1_DLP_ACTIONS.push('allow'),
  TypeError,
);
assert.throws(
  () => contract.AI_SECURITY_POLICY_V1_CATALOG
    .ingressConfigurableClasses.push('fixture'),
  TypeError,
);
assert.throws(
  () => {
    contract.AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS.ingress.enabled =
      false;
  },
  TypeError,
);
assert.throws(
  () => {
    contract.AI_SECURITY_POLICY_V1_READER_FALLBACKS.dlp
      .configuredResolutionRequiresEnabled = false;
  },
  TypeError,
);
assert.throws(
  () => {
    contract.RECOMMENDED_AI_SECURITY_POLICY_V1.dlp.actions['private-key'] =
      'allow';
  },
  TypeError,
);
assert.deepEqual(contract.RECOMMENDED_AI_SECURITY_POLICY_V1, RECOMMENDED);
assert.equal(
  Object.hasOwn(contract.RECOMMENDED_AI_SECURITY_POLICY_V1.promptRisk,
    'obfuscationEscalates'),
  false,
);
assert.equal(
  Object.hasOwn(contract.RECOMMENDED_AI_SECURITY_POLICY_V1, 'ingress'), true,
);
const clone = contract.cloneRecommendedAiSecurityPolicyV1();
assert.deepEqual(clone, contract.RECOMMENDED_AI_SECURITY_POLICY_V1);
clone.providers.blocked.push('fixture-provider');
clone.dlp.actions['private-key'] = 'allow';
clone.proxy.failMode = 'open';
assert.deepEqual(contract.RECOMMENDED_AI_SECURITY_POLICY_V1, RECOMMENDED);

const sourceTypeManifest = exportedTypeManifest(sourcePath);
const declarationTypeManifest = exportedTypeManifest(distDeclarationPath);
assert.deepEqual(
  declarationTypeManifest,
  sourceTypeManifest,
  'source and emitted public type surfaces drifted',
);
const serializedTypeManifest = JSON.stringify(sourceTypeManifest);
assert.equal(sourceTypeManifest.length, 35, 'pin final exported type count');
assert.equal(
  Buffer.byteLength(serializedTypeManifest, 'utf8'),
  12475,
  'pin final exported type manifest byte length',
);
assert.equal(
  sha256(serializedTypeManifest),
  '975c9607636197eada3dfea7529aca2b5f2592b31fc3d09de0cb8f96c41cb084',
  'pin final exported type manifest digest',
);

const byName = Object.fromEntries(
  sourceTypeManifest.map((declaration) => [declaration.name, declaration]),
);
assert.deepEqual(byName.AiLegacyPolicyWireV1.members, [
  { name: 'evidenceMode', optional: false, readonly: false, type: 'PromptEvidenceMode' },
  { name: 'blockedProviders', optional: false, readonly: false, type: 'string[]' },
  { name: 'toleratedProviders', optional: false, readonly: false, type: 'string[]' },
  { name: 'dlp', optional: false, readonly: false, type: 'AiDlpPolicyShape' },
  { name: 'updatedAt', optional: false, readonly: false, type: 'string' },
]);
assert.deepEqual(
  byName.AiEffectiveSecurityPolicyNoTeamResolutionV1.members,
  [
    { name: 'resolvedScope', optional: true, readonly: false, type: 'never' },
    { name: 'teamId', optional: true, readonly: false, type: 'never' },
    { name: 'appliedProfileId', optional: true, readonly: false, type: 'never' },
    { name: 'effective', optional: true, readonly: false, type: 'never' },
  ],
);
assert.deepEqual(
  byName.AiEffectiveSecurityPolicyTeamResolutionV1.members,
  [
    { name: 'resolvedScope', optional: false, readonly: false, type: 'AiPolicyScope' },
    { name: 'teamId', optional: false, readonly: false, type: 'string | null' },
    { name: 'appliedProfileId', optional: false, readonly: false, type: 'string | null' },
    { name: 'effective', optional: false, readonly: false, type: 'true' },
  ],
);
assert.equal(
  byName.AiEffectiveSecurityPolicyWireV1.type,
  'AiEffectiveSecurityPolicyWireBaseV1 & (AiEffectiveSecurityPolicyNoTeamResolutionV1 | AiEffectiveSecurityPolicyTeamResolutionV1)',
);

compilePublicFixture(`
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type ExpectedLegacyKeys =
  | 'evidenceMode'
  | 'blockedProviders'
  | 'toleratedProviders'
  | 'dlp'
  | 'updatedAt';
type LegacyKeysAreExact = Assert<
  Equal<keyof AiLegacyPolicyWireV1, ExpectedLegacyKeys>
>;
type LegacyDlpIsExact = Assert<
  Equal<AiLegacyPolicyWireV1['dlp'], AiDlpPolicyShape>
>;

const legacy: AiLegacyPolicyWireV1 = ${JSON.stringify(legacyOrg)};
const effectiveBase: AiEffectiveSecurityPolicyWireBaseV1 =
  ${JSON.stringify(effectiveNoTeam)};
const effectiveNoTeam: AiEffectiveSecurityPolicyWireV1 = effectiveBase;
const effectiveTeam: AiEffectiveSecurityPolicyWireV1 = {
  ...effectiveBase,
  resolvedScope: 'team',
  teamId: 'team-authority-fixture',
  appliedProfileId: null,
  effective: true,
};
const wires: AiPolicyWireV1[] = [legacy, effectiveNoTeam, effectiveTeam];
void wires;
const validUpdate: AiSecurityPolicyUpdateV1 = {
  dlp: { enabled: true, actions: { 'private-key': 'block' } },
  agents: { allowed: [], mode: 'monitor' },
};
void validUpdate;

// @ts-expect-error legacy is exactly five fields
const invalidLegacy: AiLegacyPolicyWireV1 = { ...legacy, resolvedScope: 'org' };
const resolvedOnly = { ...effectiveBase, resolvedScope: 'site' as const };
// @ts-expect-error team metadata is all-or-none
const invalidResolvedOnly: AiEffectiveSecurityPolicyWireV1 = resolvedOnly;
const teamOnly = { ...effectiveBase, teamId: null };
// @ts-expect-error team metadata is all-or-none
const invalidTeamOnly: AiEffectiveSecurityPolicyWireV1 = teamOnly;
const profileOnly = { ...effectiveBase, appliedProfileId: null };
// @ts-expect-error team metadata is all-or-none
const invalidProfileOnly: AiEffectiveSecurityPolicyWireV1 = profileOnly;
const effectiveOnly = { ...effectiveBase, effective: true as const };
// @ts-expect-error team metadata is all-or-none
const invalidEffectiveOnly: AiEffectiveSecurityPolicyWireV1 = effectiveOnly;
const missingEffective = {
  ...effectiveBase,
  resolvedScope: 'team' as const,
  teamId: 'team-authority-fixture',
  appliedProfileId: null,
};
// @ts-expect-error effective is required with the other three metadata fields
const invalidMissingEffective: AiEffectiveSecurityPolicyWireV1 =
  missingEffective;
const falseEffective = {
  ...effectiveBase,
  resolvedScope: 'team' as const,
  teamId: 'team-authority-fixture',
  appliedProfileId: null,
  effective: false as const,
};
// @ts-expect-error effective is the literal true
const invalidFalse: AiEffectiveSecurityPolicyWireV1 = falseEffective;
const explicitUndefined = { ...effectiveBase, resolvedScope: undefined };
// @ts-expect-error exactOptionalPropertyTypes rejects explicit undefined
const invalidUndefined: AiEffectiveSecurityPolicyWireV1 = explicitUndefined;
// @ts-expect-error explicit null is outside PUT section types
const invalidNullUpdate: AiSecurityPolicyUpdateV1 = { dlp: null };

// @ts-expect-error tuple is deeply readonly
AI_SECURITY_POLICY_V1_DLP_ACTIONS.push('allow');
// @ts-expect-error nested catalog arrays are deeply readonly
AI_SECURITY_POLICY_V1_CATALOG.ingressConfigurableClasses.push('fixture');
// @ts-expect-error direct defaults are deeply readonly
AI_SECURITY_POLICY_V1_DIRECT_OMISSION_DEFAULTS.ingress.enabled = false;
// @ts-expect-error reader fallbacks are deeply readonly
AI_SECURITY_POLICY_V1_READER_FALLBACKS.dlp.configuredResolutionRequiresEnabled =
  false;
// @ts-expect-error recommended nested arrays are deeply readonly
RECOMMENDED_AI_SECURITY_POLICY_V1.providers.blocked.push('fixture');
// @ts-expect-error recommended action maps are deeply readonly
RECOMMENDED_AI_SECURITY_POLICY_V1.dlp.actions['private-key'] = 'allow';

const mutableClone = cloneRecommendedAiSecurityPolicyV1();
mutableClone.providers.blocked.push('fixture');
mutableClone.dlp.actions['private-key'] = 'allow';
mutableClone.proxy.failMode = 'open';

void (0 as unknown as LegacyKeysAreExact);
void (0 as unknown as LegacyDlpIsExact);
`);

const declarations = fs.readFileSync(distDeclarationPath, 'utf8');
assert.doesNotMatch(
  declarations,
  /\bAiPolicyShape\b/,
  'legacy wire must not inherit optional team metadata',
);
const declarationSurface = declarations
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
assert.doesNotMatch(declarationSurface,
  /protocolVersion|v2Writer|signature|signedBundle/,
);
assert.match(declarations,
  /actions: Partial<Record<AiDlpClass, AiSecurityPolicyV1DlpAction>>;/,
);
assert.match(declarations,
  /actions: Partial<Record<AiSecurityPolicyV1PromptClass, AiSecurityPolicyV1PromptAction>>;/,
);

console.log(
  `AI security policy V1 contract: PASS (${DLP_CLASSES.length} DLP classes, ` +
  `${PROMPT_CONFIGURABLE.length} configurable + ${PROMPT_DERIVED.length} derived prompt classes)`,
);
