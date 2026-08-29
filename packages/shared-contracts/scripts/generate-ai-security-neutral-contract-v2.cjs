'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  buildRepresentativeRecords,
  buildSchema,
  canonicalizeJcs,
} = require('./lib/ai-security-neutral-contract-v2.cjs');
const { scoreRecords } = require('./lib/ai-security-neutral-scorer.cjs');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

function write(relative, bytes) {
  const target = path.join(root, relative);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bytes) {
      throw new Error(`stale generated neutral contract: ${relative}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, 'utf8');
}

const schema = buildSchema();
const representative = buildRepresentativeRecords();
const report = scoreRecords([representative.case], [representative.result]);
const fixture = { case: representative.case, result: representative.result, report };
const adversarial = {
  format: 'ceragon.ai-security.neutral-scorer-adversarial-plan',
  formatVersion: 1,
  baseCaseId: representative.case.caseId,
  scenarios: [
    { scenarioId: 'same-class-wrong-span', target: 'result', operation: 'replace', path: '/findings/0/span/start', value: 12, resign: true, expectedFailureCodes: ['FALSE_FINDING', 'MISSED_FINDING', 'WRONG_SPAN'] },
    { scenarioId: 'same-class-wrong-rule', target: 'result', operation: 'replace', path: '/findings/0/ruleId', value: 'wrong-rule', resign: true, expectedFailureCodes: ['FALSE_FINDING', 'MISSED_FINDING', 'WRONG_RULE'] },
    { scenarioId: 'same-class-wrong-tier', target: 'result', operation: 'replace', path: '/findings/0/evidenceTier', value: 'C', resign: true, expectedFailureCodes: ['FALSE_FINDING', 'MISSED_FINDING', 'WRONG_EVIDENCE_TIER'] },
    { scenarioId: 'missing-finding', target: 'result', operation: 'remove-finding', path: '/findings/0', value: null, resign: true, expectedFailureCodes: ['MISSED_FINDING'] },
    { scenarioId: 'extra-benign-finding', target: 'both', operation: 'benign-extra-finding', path: null, value: null, resign: true, expectedFailureCodes: ['FALSE_FINDING'] },
    { scenarioId: 'transform-corruption', target: 'result', operation: 'replace', path: '/transforms/0/outputDigest', value: `sha256:${'9'.repeat(64)}`, resign: true, expectedFailureCodes: ['TRANSFORM_MISMATCH'] },
    { scenarioId: 'wrong-outcome', target: 'result', operation: 'replace', path: '/effects/certifiedSecurityOutcome', value: 'PREVENTED', resign: true, expectedFailureCodes: ['EFFECT_MISMATCH', 'OUTCOME_MISMATCH'] },
    { scenarioId: 'budget-breach', target: 'result', operation: 'replace', path: '/resourceUsage/wallMs', value: 101, resign: true, expectedFailureCodes: ['RESOURCE_BUDGET_EXCEEDED'] },
    { scenarioId: 'duplicate-result', target: 'result', operation: 'duplicate-result', path: null, value: null, resign: false, expectedFailureCodes: ['DUPLICATE_RESULT'] },
    { scenarioId: 'digest-tamper', target: 'result', operation: 'replace', path: '/resultDigest', value: `sha256:${'f'.repeat(64)}`, resign: false, expectedFailureCodes: ['RESULT_DIGEST_MISMATCH'] },
    { scenarioId: 'cluster-dedupe', target: 'both', operation: 'append-semantic-variant', path: null, value: null, resign: true, expectedFailureCodes: [], expectedClusterCount: 1, expectedEffectiveClusterSize: 1 },
    { scenarioId: 'license-rejection', target: 'case', operation: 'replace', path: '/provenance/licenseId', value: 'TENANT-LOCAL-NO-EXPORT', resign: true, expectedFailureCodes: ['LICENSE_REJECTED'] },
    { scenarioId: 'provenance-rejection', target: 'case', operation: 'replace', path: '/provenance/sourcePlane', value: 'TENANT_LOCAL', resign: true, expectedFailureCodes: ['PROVENANCE_REJECTED'] },
  ],
};

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
for (const [label, record] of [['case', fixture.case], ['result', fixture.result], ['report', fixture.report]]) {
  if (!validate(record)) throw new Error(`${label} fixture invalid: ${JSON.stringify(validate.errors)}`);
}
if (!fixture.report.pass) throw new Error('representative neutral fixture must score exactly');

write('schemas/ai-security-neutral-evaluation-v2.schema.json', `${JSON.stringify(schema, null, 2)}\n`);
write('fixtures/ai-security-neutral-evaluation.v2.json', `${canonicalizeJcs(fixture)}\n`);
write('fixtures/ai-security-neutral-scorer-adversarial.v1.json', `${JSON.stringify(adversarial, null, 2)}\n`);
process.stdout.write(`${fixture.report.reportDigest}\n`);
