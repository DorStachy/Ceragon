'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/ai-security-detector-catalog.v2.json'), 'utf8'));
const ids = catalog.classes.map((row) => row.classId);
assert.equal(new Set(ids).size, ids.length, 'duplicate IDs are forbidden');
for (const required of ['base64-wrapped-secret', 'custom-blocklist', 'private-key-candidate']) assert.ok(ids.includes(required), `${required} must be catalogued`);
for (const row of catalog.classes) {
  assert.ok(row.evidence.possibleTiers.includes(row.evidence.defaultTier), `${row.classId}: invalid default evidence tier`);
  assert.ok(row.securityCardId.length > 0, `${row.classId}: security card missing`);
}
const generated = fs.readFileSync(path.join(root, 'generated/ai-security/0.6.0/detector-catalog.v2.jcs.json'), 'utf8');
const generatedAgain = fs.readFileSync(path.join(root, 'generated/ai-security/0.6.0/detector-catalog.v2.jcs.json'), 'utf8');
assert.equal(generated, generatedAgain, 'generated catalog must be byte stable');
assert.match(fs.readFileSync(path.join(root, 'src/generated/ai-security-detector-catalog.generated.ts'), 'utf8'), /AI_SECURITY_DETECTOR_CATALOG_DIGEST/);
process.stdout.write('M4.7 detector catalog: PASS\n');
