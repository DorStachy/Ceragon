'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const {
  canonicalizeJcs,
  reportDigest,
  resultDigest,
  semanticDigest,
} = require('./lib/ai-security-neutral-contract-v2.cjs');
const { scoreRecords } = require('./lib/ai-security-neutral-scorer.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const artifact = read('generated/ai-security/0.7.0/contract-spine.v3.jcs.json');
assert.equal(artifact.packageVersion, '0.7.0');
assert.equal(artifact.runtimeActivatable, false);
assert.equal(artifact.signedRuntimePolicyBundle, false);
assert.equal(artifact.v2WriterEligible, false);
assert.equal(artifact.neutralScorerContract.classMultisetOnlyPassPermitted, false);
assert.deepEqual(artifact.neutralScorerContract.resultDigestExcludesOnly, ['resultDigest']);
assert.ok(artifact.neutralScorerContract.failureCodes.includes('WRONG_SPAN'));
assert.ok(artifact.neutralScorerContract.failureCodes.includes('DIFFERENTIAL_MISMATCH'));

const fixture = artifact.catalogs.neutralEvaluation;
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(artifact.schemas.neutralEvaluation);
for (const record of [fixture.case, fixture.result, fixture.report]) {
  assert.equal(validate(record), true, JSON.stringify(validate.errors));
}
assert.equal(fixture.result.resultDigest, resultDigest(fixture.result));
assert.equal(fixture.result.semanticDigest, semanticDigest(fixture.result));
assert.equal(fixture.report.reportDigest, reportDigest(fixture.report));
assert.equal(scoreRecords([fixture.case], [fixture.result]).pass, true);

for (const [relative, expected] of Object.entries(artifact.sourceDigests)) {
  const actual = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex')}`;
  assert.equal(actual, expected, `${relative}: source digest drift`);
}
const bytes = fs.readFileSync(path.join(root, 'generated/ai-security/0.7.0/contract-spine.v3.jcs.json'), 'utf8');
assert.equal(bytes, `${canonicalizeJcs(artifact)}\n`, '0.7 artifact must be canonical JCS plus one LF');
process.stdout.write('M4.7 contract-spine 0.7 neutral evaluation: PASS\n');
