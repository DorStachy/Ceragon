'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  CONTRACT_VERSION,
  FAILURE_CODES,
  SCORER_VERSION,
  canonicalizeJcs,
  reportDigest,
  resultDigest,
  semanticDigest,
} = require('./lib/ai-security-neutral-contract-v2.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'generated', 'ai-security', '0.7.0', 'contract-spine.v3.jcs.json');
const manifestPath = 'manifests/ai-security-contract-spine-release.v3.json';
const readBytes = (relative) => fs.readFileSync(path.join(root, relative));
const read = (relative) => JSON.parse(readBytes(relative).toString('utf8'));
const sha256Bytes = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const digest = (value) => sha256Bytes(Buffer.from(canonicalizeJcs(value), 'utf8'));
const manifest = read(manifestPath);
const wireSchema = read(manifest.sources.wireSchema);
const hmacCatalog = read(manifest.sources.hmacCatalog);
const detectorSchema = read(manifest.sources.detectorSchema);
const detectorCatalog = read(manifest.sources.detectorCatalog);
const neutralSchema = read(manifest.sources.neutralSchema);
const neutralFixture = read(manifest.sources.neutralFixture);
const neutralAdversarialPlan = read(manifest.sources.neutralAdversarialPlan);
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

for (const [label, schema, value] of [
  ['detector catalog', detectorSchema, detectorCatalog],
  ['neutral case', neutralSchema, neutralFixture.case],
  ['neutral result', neutralSchema, neutralFixture.result],
  ['neutral report', neutralSchema, neutralFixture.report],
]) {
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(`${label} invalid: ${JSON.stringify(validate.errors)}`);
}
if (manifest.packageVersion !== CONTRACT_VERSION) throw new Error('manifest/package contract version mismatch');
if (neutralFixture.result.resultDigest !== resultDigest(neutralFixture.result)) throw new Error('representative result digest mismatch');
if (neutralFixture.result.semanticDigest !== semanticDigest(neutralFixture.result)) throw new Error('representative semantic digest mismatch');
if (neutralFixture.report.reportDigest !== reportDigest(neutralFixture.report)) throw new Error('representative report digest mismatch');
if (manifest.runtimeActivatable || manifest.signedRuntimePolicyBundle || manifest.v2WriterEligible) {
  throw new Error('contract-spine 0.7 release must remain inert');
}

const sourcePaths = [manifestPath, ...Object.values(manifest.sources), ...Object.values(manifest.tooling)];
const sourceDigests = Object.fromEntries(sourcePaths.sort().map((relative) => [relative, sha256Bytes(readBytes(relative))]));
const artifact = {
  format: 'ceragon.ai-security.contract-spine',
  formatVersion: 3,
  packageVersion: manifest.packageVersion,
  generatorVersion: manifest.generatorVersion,
  runtimeActivatable: false,
  signedRuntimePolicyBundle: false,
  v2WriterEligible: false,
  requiredIntegrationGate: manifest.requiredIntegrationGate,
  orderedTuples: {
    AI_EVIDENCE_TIERS: ['A', 'B', 'C', 'D'],
    AI_CREDENTIAL_ROLES: ['STANDALONE_BEARER', 'SECRET_COMPONENT', 'IDENTIFIER_COMPONENT', 'PRIVATE_KEY', 'CAPABILITY_URL', 'NONCREDENTIAL_SENSITIVE', 'UNKNOWN'],
    AI_EXPLOITABILITY_STATES: ['STANDALONE', 'PAIRED', 'CONTEXTUAL', 'UNKNOWN', 'NOT_APPLICABLE'],
  },
  schemas: { wire: wireSchema, detectorCatalog: detectorSchema, neutralEvaluation: neutralSchema },
  catalogs: {
    hmacDomains: hmacCatalog,
    detectorCatalog,
    neutralEvaluation: neutralFixture,
    neutralAdversarialPlan,
  },
  neutralScorerContract: {
    contractVersion: CONTRACT_VERSION,
    scorerVersion: SCORER_VERSION,
    caseFormat: 'ceragon.ai-security.neutral-evaluation-case',
    resultFormat: 'ceragon.ai-security.neutral-evaluation-result',
    reportFormat: 'ceragon.ai-security.neutral-evaluation-scorer-report',
    canonicalization: 'RFC8785_JCS',
    digestAlgorithm: 'SHA-256',
    resultDigestExcludesOnly: ['resultDigest'],
    semanticDigestProjection: [
      'caseId', 'semanticBaseCaseId', 'clusterId', 'findings', 'decision', 'obligations',
      'effects', 'transforms', 'completeness', 'intervention', 'finalState', 'errors',
    ],
    scorerEntrypoint: manifest.tooling.neutralScorerCli,
    failureCodes: FAILURE_CODES,
    classMultisetOnlyPassPermitted: false,
  },
  sourceDigests,
  sourceDigest: digest(manifest),
};
const bytes = `${canonicalizeJcs(artifact)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== bytes) {
    throw new Error('contract-spine v3 artifact is stale');
  }
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes, 'utf8');
}
process.stdout.write(`${digest(artifact)}\n`);
