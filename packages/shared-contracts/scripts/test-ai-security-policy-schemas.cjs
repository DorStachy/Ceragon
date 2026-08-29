'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { parseStrictJsonBytes } = require('./lib/strict-json.cjs');

const root = path.resolve(__dirname, '..');
const files = {
  defs: path.join(root, 'schemas', 'ai-security-policy-v1.defs.schema.json'),
  strict: path.join(
    root,
    'schemas',
    'ai-security-policy-v1.strict-write.schema.json',
  ),
  tolerant: path.join(
    root,
    'schemas',
    'ai-security-policy-v1.tolerant-read.schema.json',
  ),
  vectors: path.join(
    root,
    'vectors',
    'ai-security-policy-v1-schema-cases.json',
  ),
};

for (const [name, file] of Object.entries(files)) {
  assert.ok(fs.existsSync(file), `P0-C02 Stage B ${name} file is missing: ${file}`);
}

function readJson(file) {
  const bytes = fs.readFileSync(file);
  const raw = bytes.toString('utf8');
  assert.equal(raw.charCodeAt(0) === 0xfeff, false, `${file} must not have a BOM`);
  assert.equal(raw.includes('\r'), false, `${file} must use deterministic LF line endings`);
  assert.equal(raw.endsWith('\n'), true, `${file} must end with one LF`);
  assert.equal(raw.endsWith('\n\n'), false, `${file} must end with exactly one LF`);
  return parseStrictJsonBytes(bytes);
}

assert.throws(
  () => parseStrictJsonBytes(Buffer.from('{"same":1,"same":2}', 'utf8')),
  (error) => error?.code === 'DUPLICATE_PROPERTY',
  'schema ingestion must reject literal duplicate JSON member names',
);
assert.throws(
  () => parseStrictJsonBytes(Buffer.from('{"a":1,"\\u0061":2}', 'utf8')),
  (error) => error?.code === 'DUPLICATE_PROPERTY',
  'schema ingestion must reject escape-equivalent duplicate JSON member names',
);

const defsSchema = readJson(files.defs);
const strictSchema = readJson(files.strict);
const tolerantSchema = readJson(files.tolerant);
const vectors = readJson(files.vectors);

assert.equal(
  defsSchema.$id,
  'https://schemas.ceragon.ai/ai-security-policy/v1/defs.schema.json',
);
assert.equal(
  strictSchema.$id,
  'https://schemas.ceragon.ai/ai-security-policy/v1/strict-write.schema.json',
);
assert.equal(
  tolerantSchema.$id,
  'https://schemas.ceragon.ai/ai-security-policy/v1/tolerant-read.schema.json',
);

const ajv = new Ajv({ allErrors: true, strict: true });
for (const schema of [defsSchema, strictSchema, tolerantSchema]) {
  assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
}
ajv.addSchema(defsSchema);
const validateStrictWrite = ajv.compile(strictSchema);
const validateTolerantRead = ajv.compile(tolerantSchema);
const validators = {
  'strict-write': validateStrictWrite,
  'tolerant-read': validateTolerantRead,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function decodePointerSegment(segment) {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function applyOperations(document, operations = []) {
  const result = clone(document);
  for (const operation of operations) {
    assert.match(operation.path, /^\//, `${operation.op} path must be JSON Pointer`);
    const parts = operation.path.slice(1).split('/').map(decodePointerSegment);
    const key = parts.pop();
    let parent = result;
    for (const part of parts) {
      assert.notEqual(parent, null, `missing parent for ${operation.path}`);
      assert.equal(typeof parent, 'object', `non-object parent for ${operation.path}`);
      assert.ok(part in parent, `missing ${part} in ${operation.path}`);
      parent = parent[part];
    }

    if (operation.op === 'remove') {
      assert.ok(key in parent, `remove target missing: ${operation.path}`);
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
      continue;
    }

    if (operation.op === 'replace') {
      assert.ok(key in parent, `replace target missing: ${operation.path}`);
    } else {
      assert.equal(operation.op, 'add', `unsupported fixture op: ${operation.op}`);
    }

    if (Array.isArray(parent) && key === '-') parent.push(clone(operation.value));
    else parent[key] = clone(operation.value);
  }
  return result;
}

function materializeCase(testCase) {
  const source = testCase.documentRef
    ? vectors.baseDocuments[testCase.documentRef]
    : testCase.document;
  assert.notEqual(source, undefined, `${testCase.id} has no fixture document`);
  return applyOperations(source, testCase.operations);
}

const caseIds = vectors.validationCases.map((testCase) => testCase.id);
assert.equal(new Set(caseIds).size, caseIds.length, 'validation case IDs must be unique');

for (const testCase of vectors.validationCases) {
  const validate = validators[testCase.schema];
  assert.ok(validate, `${testCase.id} names unknown schema ${testCase.schema}`);
  const document = materializeCase(testCase);
  const actual = validate(document);
  assert.equal(
    actual,
    testCase.valid,
    `${testCase.id}: expected ${testCase.valid}, got ${actual}; ${JSON.stringify(
      validate.errors,
    )}`,
  );
}

function expectStrictValid(id, document) {
  assert.equal(
    validateStrictWrite(document),
    true,
    `${id}: ${JSON.stringify(validateStrictWrite.errors)}`,
  );
}

function expectStrictInvalid(id, document) {
  assert.equal(validateStrictWrite(document), false, `${id} unexpectedly passed`);
}

function expectTolerantInvalid(id, document) {
  assert.equal(validateTolerantRead(document), false, `${id} unexpectedly passed`);
}

function expectTolerantValid(id, document) {
  assert.equal(
    validateTolerantRead(document),
    true,
    `${id}: ${JSON.stringify(validateTolerantRead.errors)}`,
  );
}

const strictSections = {
  dlp: { enabled: true, actions: {} },
  promptRisk: { enabled: true, actions: {} },
  providers: { blocked: [], tolerated: [] },
  exclusions: { allow: [], block: [], patterns: [] },
  mcp: { enabled: true, autoEnforce: false },
  uploads: { files: 'warn', images: 'warn', blockAllImages: false, maxSizeKb: 0 },
  paths: { blocked: [], allowed: [] },
  agents: { allowed: [], mode: '' },
  egress: { mode: '', allowed: [], blocked: [], includeDefaults: true },
  proxy: { failMode: 'closed' },
  ingress: {},
};

for (const [section, value] of Object.entries(strictSections)) {
  expectStrictValid(`strict-${section}-base`, { [section]: value });
  expectStrictInvalid(`strict-${section}-null`, { [section]: null });
  expectStrictInvalid(`strict-${section}-closed`, {
    [section]: { ...value, futureField: true },
  });
}
const requiredSectionFields = {
  dlp: ['enabled', 'actions'],
  promptRisk: ['enabled', 'actions'],
  providers: ['blocked', 'tolerated'],
  exclusions: ['allow', 'block', 'patterns'],
  mcp: ['enabled', 'autoEnforce'],
  uploads: ['files', 'images', 'blockAllImages', 'maxSizeKb'],
  paths: ['blocked', 'allowed'],
  agents: ['allowed', 'mode'],
  egress: ['mode', 'allowed', 'blocked', 'includeDefaults'],
  proxy: ['failMode'],
};

for (const [section, fields] of Object.entries(requiredSectionFields)) {
  for (const field of fields) {
    const missing = clone(strictSections[section]);
    delete missing[field];
    expectStrictInvalid(`strict-${section}-missing-${field}`, { [section]: missing });
    const explicitNull = clone(strictSections[section]);
    explicitNull[field] = null;
    expectStrictInvalid(`strict-${section}-null-${field}`, { [section]: explicitNull });
  }
}
expectStrictInvalid('strict-root-closed', { futureSection: {} });

const dlpClasses = Object.keys(
  defsSchema.definitions.strictDlpActionsPartial.properties,
);
const promptClasses = Object.keys(
  defsSchema.definitions.strictPromptActionsPartial.properties,
);
const expectedDlpClasses = [
  'private-key',
  'aws-secret-key',
  'aws-access-key',
  'gcp-key',
  'azure-key',
  'generic-api-key',
  'jwt',
  'slack-token',
  'github-token',
  'internal-url',
  'openai-key',
  'anthropic-key',
  'stripe-live',
  'slack-webhook',
  'sendgrid-key',
  'twilio-key',
  'npm-token',
  'pypi-token',
  'gitlab-token',
  'google-oauth-secret',
  'high-entropy',
  'kubeconfig',
  'db-connection-string',
  'aws-credential-pair',
  'gcp-service-account',
  'azure-connection-string',
  'bearer-auth-token',
  'payment-card',
  'iban',
  'national-id',
];
const expectedPromptClasses = [
  'injection-instruction-override',
  'injection-system-exfil',
  'injection-role-marker',
  'injection-obfuscation-unicode',
  'injection-encoded-payload',
  'jailbreak-persona',
  'jailbreak-restriction-removal',
  'jailbreak-role-reassign',
  'injection-credential-exfil',
  'injection-authority-escalation',
  'injection-decoded-payload',
  'ingress-tool-instruction-injection',
  'ingress-exfil-instruction',
  'ingress-sensitive-path-read',
  'injection-override-exfil',
  'jailbreak-persona-unrestricted',
  'injection-override-credexfil',
  'ingress-secret-exfil-combo',
];
assert.deepEqual(dlpClasses, expectedDlpClasses);
assert.deepEqual(promptClasses, expectedPromptClasses);
assert.equal(dlpClasses.length, 30, 'strict DLP catalog must contain 30 classes');
assert.equal(promptClasses.length, 18, 'strict prompt catalog must contain 18 classes');
const expectedEnums = {
  dlpAction: ['block', 'redact', 'warn', 'allow'],
  promptAction: ['block', 'warn', 'allow'],
  exclusionAction: ['allow', 'block'],
  uploadAction: ['block', 'warn', 'allow'],
  governanceMode: ['enforce', 'monitor', ''],
  enforcementTier: ['detect', 'strict'],
  proxyFailMode: ['closed', 'open'],
  ingressAction: ['redact', 'warn', 'hold', 'off'],
};
for (const [definition, expected] of Object.entries(expectedEnums)) {
  assert.deepEqual(
    defsSchema.definitions[definition].enum,
    expected,
    `${definition} enum drifted`,
  );
}
for (const dlpClass of dlpClasses) {
  for (const action of ['block', 'redact', 'warn', 'allow']) {
    expectStrictValid(`strict-dlp-${dlpClass}-${action}`, {
      dlp: { enabled: true, actions: { [dlpClass]: action } },
    });
  }
}
for (const promptClass of promptClasses) {
  for (const action of ['block', 'warn', 'allow']) {
    expectStrictValid(`strict-prompt-${promptClass}-${action}`, {
      promptRisk: { enabled: true, actions: { [promptClass]: action } },
    });
  }
}
expectStrictInvalid('strict-dlp-invalid-action', {
  dlp: { enabled: true, actions: { 'private-key': 'nuke' } },
});
expectStrictInvalid('strict-prompt-invalid-action', {
  promptRisk: {
    enabled: true,
    actions: { 'injection-system-exfil': 'redact' },
  },
});

expectStrictValid('strict-provider-boundary', {
  providers: { blocked: ['x'.repeat(128)], tolerated: Array(200).fill('') },
});
expectStrictInvalid('strict-provider-count-overflow', {
  providers: { blocked: Array(201).fill('x'), tolerated: [] },
});
expectStrictInvalid('strict-provider-length-overflow', {
  providers: { blocked: ['x'.repeat(129)], tolerated: [] },
});

expectStrictValid('strict-exclusion-boundary', {
  exclusions: {
    allow: Array(200).fill('x'.repeat(512)),
    block: [],
    patterns: Array(100).fill({ prefix: 'x'.repeat(256), suffix: '', action: 'allow' }),
  },
});
expectStrictInvalid('strict-exclusion-count-overflow', {
  exclusions: { allow: Array(201).fill('x'), block: [], patterns: [] },
});
expectStrictInvalid('strict-exclusion-length-overflow', {
  exclusions: { allow: ['x'.repeat(513)], block: [], patterns: [] },
});
expectStrictInvalid('strict-exclusion-whitespace-only', {
  exclusions: { allow: ['   '], block: [], patterns: [] },
});
expectStrictInvalid('strict-pattern-count-overflow', {
  exclusions: {
    allow: [],
    block: [],
    patterns: Array(101).fill({ prefix: 'x', suffix: '', action: 'allow' }),
  },
});
expectStrictInvalid('strict-pattern-length-overflow', {
  exclusions: {
    allow: [],
    block: [],
    patterns: [{ prefix: 'x'.repeat(257), suffix: '', action: 'allow' }],
  },
});
expectStrictInvalid('strict-pattern-empty-both-sides', {
  exclusions: {
    allow: [],
    block: [],
    patterns: [{ prefix: '', suffix: '', action: 'allow' }],
  },
});

for (const maxSizeKb of [0, 1048576]) {
  expectStrictValid(`strict-upload-size-${maxSizeKb}`, {
    uploads: { files: 'warn', images: 'allow', blockAllImages: false, maxSizeKb },
  });
}
for (const maxSizeKb of [-1, 1048577, 1.5]) {
  expectStrictInvalid(`strict-upload-size-${maxSizeKb}`, {
    uploads: { files: 'warn', images: 'allow', blockAllImages: false, maxSizeKb },
  });
}

expectStrictValid('strict-path-boundary', {
  paths: { blocked: Array(200).fill('x'.repeat(512)), allowed: [] },
});
expectStrictInvalid('strict-path-count-overflow', {
  paths: { blocked: Array(201).fill('x'), allowed: [] },
});
expectStrictInvalid('strict-path-length-overflow', {
  paths: { blocked: ['x'.repeat(513)], allowed: [] },
});

expectStrictValid('strict-agent-boundary-and-default-detect', {
  agents: { allowed: Array(200).fill('x'.repeat(128)), mode: 'monitor' },
});
expectStrictInvalid('strict-agent-count-overflow', {
  agents: { allowed: Array(201).fill('x'), mode: 'monitor' },
});
expectStrictInvalid('strict-agent-length-overflow', {
  agents: { allowed: ['x'.repeat(129)], mode: 'monitor' },
});

expectStrictValid('strict-egress-boundary', {
  egress: {
    mode: 'enforce',
    allowed: Array(500).fill('x'.repeat(512)),
    blocked: [],
    includeDefaults: false,
  },
});
expectStrictInvalid('strict-egress-count-overflow', {
  egress: {
    mode: 'enforce',
    allowed: Array(501).fill('x'),
    blocked: [],
    includeDefaults: false,
  },
});
expectStrictInvalid('strict-egress-length-overflow', {
  egress: {
    mode: 'enforce',
    allowed: ['x'.repeat(513)],
    blocked: [],
    includeDefaults: false,
  },
});

expectStrictValid('strict-ingress-free-form-class', {
  ingress: { actions: { 'future-ingress-class': 'hold' } },
});
expectStrictInvalid('strict-ingress-whitespace-class', {
  ingress: { actions: { '   ': 'hold' } },
});
expectStrictInvalid('strict-ingress-invalid-action', {
  ingress: { actions: { 'future-ingress-class': 'block' } },
});
expectStrictInvalid('strict-obfuscation-null', {
  promptRisk: { enabled: true, actions: {}, obfuscationEscalates: null },
});
expectStrictInvalid('strict-enforcement-tier-null', {
  agents: { allowed: [], mode: '', enforcementTier: null },
});
for (const field of ['enabled', 'actions', 'taintHold']) {
  expectStrictInvalid(`strict-ingress-${field}-null`, { ingress: { [field]: null } });
}

const semanticIds = vectors.semanticOnlyRules.map((rule) => rule.id);
assert.deepEqual(semanticIds, [
  'SEM-V1-PROVIDERS-DISJOINT',
  'SEM-V1-EXCLUSIONS-DISJOINT',
  'SEM-V1-PATTERN-ACTION-UNIQUE',
  'SEM-V1-SECTION-MERGE',
  'SEM-V1-OMISSION-DEFAULTS',
]);
assert.equal(new Set(semanticIds).size, semanticIds.length);
for (const rule of vectors.semanticOnlyRules) {
  assert.equal(
    rule.schemaDisposition,
    'valid-requires-service-semantic-check',
    `${rule.id} must not claim JSON Schema enforcement`,
  );
  expectStrictValid(`${rule.id}-fixture-is-structurally-valid`, rule.fixture.update);
}
const omissionRule = vectors.semanticOnlyRules.find(
  (rule) => rule.id === 'SEM-V1-OMISSION-DEFAULTS',
);
assert.deepEqual(omissionRule.fixture.expectedSemantics, {
  'promptRisk.obfuscationEscalates': true,
  'agents.enforcementTier': 'detect',
  'ingress.enabled': true,
  'ingress.taintHold': true,
  'ingress.actionForUnlistedClass': 'redact',
  'ingress.builtInClassOverrides.ingress-exfil-verb': 'warn',
});

const effective = vectors.baseDocuments.effective;
const legacy = vectors.baseDocuments.legacy;
const teamFields = [
  ['resolvedScope', 'future-scope'],
  ['teamId', null],
  ['appliedProfileId', null],
  ['effective', true],
];
for (const [branch, base] of Object.entries({ effective, legacy })) {
  for (let mask = 0; mask < 16; mask += 1) {
    const candidate = clone(base);
    for (let index = 0; index < teamFields.length; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        const [field, value] = teamFields[index];
        candidate[field] = value;
      }
    }
    const expected = mask === 0 || mask === 15;
    assert.equal(
      validateTolerantRead(candidate),
      expected,
      `${branch} team metadata mask ${mask.toString(2).padStart(4, '0')}: ${JSON.stringify(
        validateTolerantRead.errors,
      )}`,
    );
  }
}

const legacyOptionalKnownFields = [
  'providers',
  'promptRisk',
  'exclusions',
  'mcp',
  'uploads',
  'paths',
  'agents',
  'egress',
  'proxy',
  'ingress',
];
for (const field of legacyOptionalKnownFields) {
  const candidate = clone(legacy);
  candidate[field] = clone(effective[field]);
  expectTolerantValid(`tolerant-legacy-known-addition-${field}`, candidate);
}

const legacyWithActions = clone(legacy);
legacyWithActions.dlp.actions = clone(effective.dlp.actions);
expectTolerantValid('tolerant-legacy-known-dlp-actions', legacyWithActions);

expectTolerantInvalid('tolerant-legacy-site-id-is-full-branch', {
  ...legacy,
  siteId: 'site-1',
});

const legacyKnownWrongAdditions = [
  ['providers', 42],
  ['promptRisk', 42],
  ['exclusions', 42],
  ['mcp', 42],
  ['uploads', 42],
  ['paths', 42],
  ['agents', 42],
  ['egress', 42],
  ['proxy', 42],
  ['ingress', 42],
];
for (const [field, value] of legacyKnownWrongAdditions) {
  const candidate = clone(legacy);
  candidate[field] = value;
  expectTolerantInvalid(`tolerant-legacy-known-type-${field}`, candidate);
}

const legacyActionsWrong = clone(legacy);
legacyActionsWrong.dlp.actions = 42;
expectTolerantInvalid('tolerant-legacy-known-type-dlp-actions', legacyActionsWrong);

const legacyActionValueWrong = clone(legacyWithActions);
legacyActionValueWrong.dlp.actions['private-key'] = 42;
expectTolerantInvalid(
  'tolerant-legacy-known-type-dlp-action-value',
  legacyActionValueWrong,
);

const teamTypeCases = [
  ['resolvedScope', 42],
  ['teamId', 42],
  ['appliedProfileId', 42],
  ['effective', false],
];
for (const [branch, base] of Object.entries({ effective, legacy })) {
  for (const [field, value] of teamTypeCases) {
    const candidate = clone(base);
    Object.assign(candidate, {
      resolvedScope: 'team',
      teamId: null,
      appliedProfileId: null,
      effective: true,
    });
    candidate[field] = value;
    expectTolerantInvalid(`tolerant-${branch}-team-type-${field}`, candidate);
  }
}

const additiveObjectPaths = [
  '/providers',
  '/dlp',
  '/promptRisk',
  '/exclusions',
  '/mcp',
  '/uploads',
  '/paths',
  '/agents',
  '/egress',
  '/proxy',
  '/ingress',
];
for (const objectPath of additiveObjectPaths) {
  const candidate = applyOperations(effective, [
    { op: 'add', path: `${objectPath}/futureField`, value: { version: 2 } },
  ]);
  expectTolerantValid(`tolerant-additive-${objectPath}`, candidate);
}

const additivePattern = clone(effective);
additivePattern.exclusions.patterns = [
  {
    prefix: 'sk-',
    suffix: '-test',
    action: 'future-action',
    futureField: { version: 2 },
  },
];
expectTolerantValid('tolerant-additive-pattern-object', additivePattern);

const wrongTypeCases = [
  ['/evidenceMode', 1],
  ['/siteId', 1],
  ['/blockedProviders', 'openai'],
  ['/blockedProviders/0', 1],
  ['/toleratedProviders/0', 1],
  ['/providers/blocked', 'openai'],
  ['/providers/blocked/0', 1],
  ['/providers/tolerated/0', 1],
  ['/dlp/enabled', 'true'],
  ['/dlp/actions/private-key', 1],
  ['/dlp/actions/future-secret-class', 1],
  ['/dlp/blockClasses', 'private-key'],
  ['/dlp/blockClasses/0', 1],
  ['/dlp/redactClasses/0', 1],
  ['/dlp/warnClasses/0', 1],
  ['/promptRisk/enabled', 1],
  ['/promptRisk/actions/injection-system-exfil', 1],
  ['/promptRisk/actions/future-prompt-class', 1],
  ['/promptRisk/obfuscationEscalates', 'true'],
  ['/exclusions/allow', 'literal'],
  ['/exclusions/allow', [1]],
  ['/exclusions/patterns', [{ prefix: 1, suffix: '', action: 'allow' }]],
  ['/mcp/enabled', 'true'],
  ['/mcp/autoEnforce', 'false'],
  ['/uploads/files', 1],
  ['/uploads/images', 1],
  ['/uploads/blockAllImages', 'false'],
  ['/uploads/maxSizeKb', 1.5],
  ['/paths/blocked', '.env'],
  ['/paths/allowed', [1]],
  ['/agents/allowed', 'codex'],
  ['/agents/allowed', [1]],
  ['/agents/mode', 1],
  ['/agents/enforcementTier', 1],
  ['/egress/mode', 1],
  ['/egress/allowed', [1]],
  ['/egress/blocked', [1]],
  ['/egress/includeDefaults', 'true'],
  ['/proxy/failMode', 1],
  ['/ingress/enabled', 'true'],
  ['/ingress/actions', []],
  ['/ingress/actions/ingress-exfil-instruction', 1],
  ['/ingress/taintHold', 'true'],
  ['/updatedAt', 1],
];
for (const [pointer, value] of wrongTypeCases) {
  const op =
    pointer === '/promptRisk/obfuscationEscalates' || pointer.includes('/future-')
      ? 'add'
      : 'replace';
  const candidate = applyOperations(effective, [
    { op, path: pointer, value },
  ]);
  expectTolerantInvalid(`tolerant-known-type-${pointer}`, candidate);
}

const legacyWrongTypes = [
  ['/evidenceMode', 1],
  ['/blockedProviders', 'openai'],
  ['/dlp/enabled', 'true'],
  ['/dlp/blockClasses/0', 1],
  ['/updatedAt', 1],
];
for (const [pointer, value] of legacyWrongTypes) {
  const candidate = applyOperations(vectors.baseDocuments.legacy, [
    { op: 'replace', path: pointer, value },
  ]);
  expectTolerantInvalid(`tolerant-legacy-known-type-${pointer}`, candidate);
}

console.log(
  `AI security policy V1 schemas: PASS (${vectors.validationCases.length} vectors, ${vectors.semanticOnlyRules.length} semantic-only rules, ${dlpClasses.length} DLP classes, ${promptClasses.length} prompt classes)`,
);
