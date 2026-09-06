'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'generated', 'ai-security', '0.6.0', 'contract-spine.v2.jcs.json');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const stable = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = (value) => `sha256:${crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
const manifest = read('manifests/ai-security-contract-spine-release.v2.json');
const wireSchema = read(manifest.sources.wireSchema);
const hmacCatalog = read(manifest.sources.hmacCatalog);
const detectorSchema = read(manifest.sources.detectorSchema);
const detectorCatalog = read(manifest.sources.detectorCatalog);
const neutralSchema = read(manifest.sources.neutralSchema);
const neutralFixture = read(manifest.sources.neutralFixture);
const ajv = new Ajv({ allErrors: true, strict: true });
for (const [label, schema, value] of [['detector catalog', detectorSchema, detectorCatalog], ['neutral case', neutralSchema, neutralFixture.case], ['neutral result', neutralSchema, neutralFixture.result]]) {
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(`${label} invalid: ${JSON.stringify(validate.errors)}`);
}
if (manifest.runtimeActivatable || manifest.signedRuntimePolicyBundle || manifest.v2WriterEligible) throw new Error('contract-spine v2 release must remain inert');
const artifact = {
  format: 'ceragon.ai-security.contract-spine', formatVersion: 2,
  packageVersion: manifest.packageVersion, generatorVersion: manifest.generatorVersion,
  runtimeActivatable: false, signedRuntimePolicyBundle: false, v2WriterEligible: false,
  requiredIntegrationGate: manifest.requiredIntegrationGate,
  orderedTuples: {
    AI_EVIDENCE_TIERS: ['A', 'B', 'C', 'D'],
    AI_CREDENTIAL_ROLES: ['STANDALONE_BEARER', 'SECRET_COMPONENT', 'IDENTIFIER_COMPONENT', 'PRIVATE_KEY', 'CAPABILITY_URL', 'NONCREDENTIAL_SENSITIVE', 'UNKNOWN'],
    AI_EXPLOITABILITY_STATES: ['STANDALONE', 'PAIRED', 'CONTEXTUAL', 'UNKNOWN', 'NOT_APPLICABLE']
  },
  schemas: { wire: wireSchema, detectorCatalog: detectorSchema, neutralEvaluation: neutralSchema },
  catalogs: { hmacDomains: hmacCatalog, detectorCatalog, neutralEvaluation: neutralFixture },
  sourceDigest: digest(manifest)
};
const bytes = `${stable(artifact)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== bytes) throw new Error('contract-spine v2 artifact is stale');
} else { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes, 'utf8'); }
process.stdout.write(`${digest(artifact)}\n`);
