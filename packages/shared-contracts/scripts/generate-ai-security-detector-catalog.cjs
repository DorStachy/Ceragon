'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Ajv = require('ajv');

const root = path.resolve(__dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const stable = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
  : item);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
const title = (id) => id.split('-').map((word) => word === 'db' ? 'DB' : word === 'api' ? 'API' : word.toUpperCase() === 'IBAN' ? 'IBAN' : word[0].toUpperCase() + word.slice(1)).join(' ');
const write = (relative, bytes) => {
  const target = path.join(root, relative);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bytes) throw new Error(`stale generated file: ${relative}`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, 'utf8');
};

const schema = read('schemas/ai-security-detector-catalog-v2.schema.json');
const catalog = read('fixtures/ai-security-detector-catalog.v2.json');
const inputs = read('fixtures/ai-security-detector-catalog-inputs.v2.json');
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
if (!validate(catalog)) throw new Error(`detector catalog invalid: ${JSON.stringify(validate.errors)}`);
if (catalog.productionWriterEnabled !== false) throw new Error('detector catalog writers must remain inert');

const ids = catalog.classes.map((row) => row.classId);
if (new Set(ids).size !== ids.length) throw new Error('duplicate detector class ID');
for (const row of catalog.classes) {
  if (!row.evidence.possibleTiers.includes(row.evidence.defaultTier)) throw new Error(`${row.classId}: default tier is not possible`);
  if (new Set(row.representations).size !== row.representations.length) throw new Error(`${row.classId}: duplicate representation`);
  if (new Set(row.surfaces).size !== row.surfaces.length) throw new Error(`${row.classId}: duplicate surface`);
  for (const tier of row.hardStopEligible.eligibleEvidenceTiers) {
    if (!row.evidence.possibleTiers.includes(tier)) throw new Error(`${row.classId}: hard-stop tier is not possible`);
  }
  if (row.hardStopEligible.eligibleEvidenceTiers.includes('A') && row.validators.length === 0) {
    throw new Error(`${row.classId}: Tier A hard-stop eligibility requires a validator`);
  }
  if (row.family === 'HEURISTIC' || row.family === 'PROMPT_INJECTION' || row.family === 'JAILBREAK' || row.family === 'INGRESS_RISK') {
    if (row.hardStopEligible.eligibleEvidenceTiers.length !== 0) throw new Error(`${row.classId}: probabilistic/pattern class cannot hard-stop`);
  }
}

// Build first: the portable V1 projection is the compatibility authority whose
// class tuples and Recommended defaults this V2 catalog must faithfully cover.
const portable = require(path.join(root, 'dist', 'generated', 'ai-security-portable.generated.js'));
const policy = require(path.join(root, 'dist', 'ai-security-policy-v1-contract.js'));
const tupleIds = new Set([
  ...portable.AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES,
  ...policy.AI_SECURITY_POLICY_V1_PROMPT_CLASSES,
  ...portable.AI_SECURITY_PORTABLE_POLICY_CATALOG.ingressConfigurableClasses,
]);
const requiredIds = new Set([...tupleIds, ...inputs.currentEmitterClassIds]);
for (const id of requiredIds) if (!ids.includes(id)) throw new Error(`uncatalogued current class: ${id}`);
for (const id of ids) if (!requiredIds.has(id)) throw new Error(`catalog class has no current emitter/configuration source: ${id}`);

const expectedDlpAction = (id) => portable.AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_BLOCK_CLASSES.includes(id) ? 'BLOCK'
  : portable.AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_REDACT_CLASSES.includes(id) ? 'REDACT'
    : 'WARN';
for (const id of portable.AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES) {
  const row = catalog.classes.find((candidate) => candidate.classId === id);
  if (row.defaults.recommended !== expectedDlpAction(id)) {
    throw new Error(`${id}: recommended default drift (${row.defaults.recommended} != ${expectedDlpAction(id)})`);
  }
}
for (const id of policy.AI_SECURITY_POLICY_V1_PROMPT_CLASSES) {
  const row = catalog.classes.find((candidate) => candidate.classId === id);
  const action = policy.RECOMMENDED_AI_SECURITY_POLICY_V1.promptRisk.actions[id];
  if (action && row.defaults.recommended !== action.toUpperCase()) {
    throw new Error(`${id}: recommended prompt default drift (${row.defaults.recommended} != ${action.toUpperCase()})`);
  }
}

const metadata = catalog.classes.map((row) => ({
  classId: row.classId,
  label: title(row.classId),
  copyKey: `ai.security.class.${row.classId}`,
  securityCardId: row.securityCardId,
  family: row.family,
  owner: row.owner,
  lifecycle: row.lifecycle,
}));
const catalogDigest = digest(catalog);
const ts = `// GENERATED from fixtures/ai-security-detector-catalog.v2.json. Do not edit.\n` +
  `export const AI_SECURITY_DETECTOR_CATALOG_VERSION = 'detector-catalog-v2' as const;\n` +
  `export const AI_SECURITY_DETECTOR_CATALOG_DIGEST = '${catalogDigest}' as const;\n` +
  `export const AI_SECURITY_DETECTOR_CLASS_IDS = ${JSON.stringify(ids, null, 2)} as const;\n` +
  `export type AiSecurityDetectorClassId = (typeof AI_SECURITY_DETECTOR_CLASS_IDS)[number];\n` +
  `export const AI_SECURITY_DETECTOR_PRESENTATION = ${JSON.stringify(metadata, null, 2)} as const;\n`;
const js = `// GENERATED from fixtures/ai-security-detector-catalog.v2.json. Do not edit.\n` +
  `export const AI_SECURITY_DETECTOR_CATALOG_VERSION = 'detector-catalog-v2';\n` +
  `export const AI_SECURITY_DETECTOR_CATALOG_DIGEST = '${catalogDigest}';\n` +
  `export const AI_SECURITY_DETECTOR_CLASS_IDS = Object.freeze(${JSON.stringify(ids, null, 2)});\n` +
  `export const AI_SECURITY_DETECTOR_PRESENTATION = Object.freeze(${JSON.stringify(metadata, null, 2)});\n`;
const goRows = metadata.map((row) => `\t{ClassID: ${JSON.stringify(row.classId)}, Label: ${JSON.stringify(row.label)}, CopyKey: ${JSON.stringify(row.copyKey)}, SecurityCardID: ${JSON.stringify(row.securityCardId)}},`).join('\n');
const go = `// Code generated by generate-ai-security-detector-catalog.cjs; DO NOT EDIT.\npackage generated\n\n` +
  `const AiSecurityDetectorCatalogVersion = "detector-catalog-v2"\nconst AiSecurityDetectorCatalogDigest = "${catalogDigest}"\n\n` +
  `type AiSecurityDetectorMetadata struct { ClassID string; Label string; CopyKey string; SecurityCardID string }\n\n` +
  `var AiSecurityDetectorCatalog = []AiSecurityDetectorMetadata{\n${goRows}\n}\n`;
const cards = `${stable({ format: 'ceragon.ai-security.security-card-index', formatVersion: 1, catalogVersion: catalog.catalogVersion, catalogDigest, cards: metadata.map(({ classId, securityCardId, label }) => ({ classId, securityCardId, label })) })}\n`;
const catalogArtifact = `${stable(catalog)}\n`;
write('src/generated/ai-security-detector-catalog.generated.ts', ts);
write('generated/ai-security/0.6.0/ai-security-detector-catalog.generated.js', js);
write('generated/ai-security/0.6.0/ai_security_detector_catalog.generated.go', go);
write('generated/ai-security/0.6.0/detector-catalog.v2.jcs.json', catalogArtifact);
write('generated/ai-security/0.6.0/detector-catalog.v2.jcs.json.sha256', `${catalogDigest}\n`);
write('generated/ai-security/0.6.0/security-card-index.v1.jcs.json', cards);
process.stdout.write(`${catalogDigest}\n`);
