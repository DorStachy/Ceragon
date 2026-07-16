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
];
const PROMPT_CONFIGURABLE = [
  'injection-instruction-override', 'injection-system-exfil',
  'injection-role-marker', 'injection-obfuscation-unicode',
  'injection-encoded-payload', 'jailbreak-persona',
  'jailbreak-restriction-removal', 'jailbreak-role-reassign',
];
const PROMPT_DERIVED = [
  'injection-override-exfil', 'jailbreak-persona-unrestricted',
];
const BROWSER_PROVIDERS = [
  'openai', 'anthropic', 'google', 'github', 'perplexity', 'poe',
];
const TOOL_PROVIDERS = [
  'cursor', 'claude-code', 'windsurf', 'github-copilot', 'cline',
  'gemini-cli', 'codex',
];
const INGRESS_CLASSES = [
  'ingress-exfil-instruction', 'ingress-exfil-verb',
  'ingress-sensitive-path-read', 'ingress-tool-poisoning',
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
};

const dlpActions = Object.fromEntries([
  ...DLP_CLASSES.slice(0, 2).map((name) => [name, 'block']),
  ...DLP_CLASSES.slice(2, 20).map((name) => [name, 'redact']),
  ...DLP_CLASSES.slice(20).map((name) => [name, 'warn']),
]);
const promptActions = Object.fromEntries([
  ...PROMPT_CONFIGURABLE.map((name) => [name, 'warn']),
  ...PROMPT_DERIVED.map((name) => [name, 'block']),
]);
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
};
const DIRECT_OMISSION_DEFAULTS = {
  promptRisk: { obfuscationEscalates: true },
  ingress: { enabled: true, taintHold: true, actionForUnlistedClass: 'redact' },
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
    },
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
  '18ff07ab942a5ff4b816254cab6585ce9cf288e096dbcdafa3f3a0f4352b2e16',
  'authority fixture changed without an explicit source-truth recapture',
);
const authority = deepFreezeFixture(JSON.parse(authorityBytes.toString('utf8')));
assertDeepFrozen(authority, 'authority fixture');
assert.deepEqual(authority.authoritativeSources, {
  'Workspace/packages/shared-contracts/src/ai-governance-contract.ts':
    'a2bc438b0b6f08b14fc56948b0104bb70e35cc69ec63d23aa6b753a8e805e2cc',
  'Backend/src/ai-security-policy/ai-security-policy.constants.ts':
    '49d077c7b62b74751c5515d2f56deeea78f15f913cecad848957c2469aff346b',
  'Backend/src/ai-security-policy/dto/ai-security-policy.dto.ts':
    '724fcea622ac37f3739b4bd8b2d140b370a4009d1b18ceadecf8c7deeb5a25df',
  'Backend/src/ai-security-policy/ai-security-policy.service.ts':
    '92ca68f437c4e46946bbbb91a4b0ae895d8cfaf39cdb21804c04ef9e76af78d8',
  'Backend/src/ai-governance/services/ai-policy.service.ts':
    'f77bc6f7651af0db23cb57aa306ea976852413adbe24c1cb86008e7255b223b6',
  'Installers/internal/core/backend/ai_prompt.go':
    '756368f5906778e04674566d401b6ed8898ee5f7b2a8cdfdcaabd5f09a8a18cb',
  'Installers/internal/policyeval/policyeval.go':
    '22ff2a1fa1e2d7d2d8b01d55455af0b8119fdc231e09b598974b4cd1e5099fb2',
  'Installers/internal/aiagent/aiagent.go':
    '1732b70eb3cf9d28af7a700bb1a6a320c3c97c7fe30e619f229052e5827b28aa',
  'Installers/internal/proxy/ai_egress.go':
    '7f43bbdc601619db83313b131088b3a00add5ffe6c0636100a92fc21ec70b105',
  'Installers/internal/daemon/ai_ingress.go':
    '7d9873f17cfb614e6812a9735796d056584f2c035ceedd6688a063d4c033b61c',
  'Installers/internal/policybundle/bundle.go':
    '82284e569afcf68c28d5d6a9f6f2c5cc321027fcf765c41986d892a84ea174d2',
  'Installers/internal/proxy/ai_proxy.go':
    'cec5a784028104ce35321944e4f092ee615b427a460738b8f494f19857939276',
  'Installers/internal/proxy/ai_ingress.go':
    'e903e8a9bb4495beb25f8fc324d531378fb0b6635fe8830336299af9bf5e52fc',
  'Installers/internal/proxy/openai_decision.go':
    '40810cb67e3eac6dd3c0f600a1be2473428a0b887bdd0ad1aec924d76c00d393',
  'Installers/internal/daemon/ai_handlers.go':
    'fe64d5e877ed46ae1a6d11d650a729b294c3223d52f283b467d0bfeb1ce08115',
  'Installers/internal/daemon/server.go':
    '8bc9ab82d0e79f4feace67ce14e4fedeec6bc02d39f23a5f01dceb7a309db6ad',
  'Installers/internal/daemon/openai_wire.go':
    '0d2335a69a277755897154755458cc089575e9d209362ada7aef2366e5d8075b',
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
  dlpClasses: DLP_CLASSES,
  promptRiskConfigurableClasses: PROMPT_CONFIGURABLE,
  promptRiskDerivedClasses: PROMPT_DERIVED,
  browserProviderKeys: BROWSER_PROVIDERS,
  toolProviderKeys: TOOL_PROVIDERS,
  knownNonPolicyAddressableSignals: {
    engineEmittedDlp: ['base64-wrapped-secret'],
    policySynthesized: ['custom-blocklist'],
    ingressEngineClasses: INGRESS_CLASSES,
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
    .knownNonPolicyAddressableSignals.ingressEngineClasses.push('fixture'),
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
  Object.hasOwn(contract.RECOMMENDED_AI_SECURITY_POLICY_V1, 'ingress'), false,
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
assert.equal(sourceTypeManifest.length, 34, 'pin final exported type count');
assert.equal(
  Buffer.byteLength(serializedTypeManifest, 'utf8'),
  12322,
  'pin final exported type manifest byte length',
);
assert.equal(
  sha256(serializedTypeManifest),
  'abb6e55df6d411e8a321e82c04f0998239e32203867a73b76f5477e727b24d01',
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
AI_SECURITY_POLICY_V1_CATALOG.knownNonPolicyAddressableSignals.ingressEngineClasses.push('fixture');
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
