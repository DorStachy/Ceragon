const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const taxonomy = require('../dist/security-taxonomy.js');

const boundaryCases = [
  [0, 'INFO'],
  [19, 'INFO'],
  [20, 'LOW'],
  [39, 'LOW'],
  [40, 'MEDIUM'],
  [59, 'MEDIUM'],
  [60, 'HIGH'],
  [79, 'HIGH'],
  [80, 'CRITICAL'],
  [100, 'CRITICAL'],
];

for (const [score, expected] of boundaryCases) {
  assert.equal(taxonomy.riskScoreToSeverity(score), expected, `riskScoreToSeverity(${score})`);
}

const dispositionCases = [
  ['ALLOW', 0, 'NO_FINDING'],
  ['ALLOW_FAST', 0, 'NO_FINDING'],
  ['PROMPT', 55, 'NEEDS_REVIEW'],
  ['BLOCK', 75, 'MALICIOUS'],
  ['HOLD', 55, 'NEEDS_REVIEW'],
  ['HOLD', 75, 'NEEDS_REVIEW'],
  ['HOLD', 85, 'MALICIOUS'],
  ['HOLD', undefined, 'UNKNOWN'],
  ['PENDING', undefined, 'UNKNOWN'],
  ['INCONCLUSIVE', undefined, 'UNKNOWN'],
  [undefined, 85, 'MALICIOUS'],
  [undefined, 75, 'NEEDS_REVIEW'],
  [undefined, 45, 'NEEDS_REVIEW'],
  [undefined, 5, 'NO_FINDING'],
  [undefined, undefined, 'UNKNOWN'],
];

for (const [verdict, score, expected] of dispositionCases) {
  assert.equal(
    taxonomy.legacyInstallVerdictToDisposition(verdict, score),
    expected,
    `legacyInstallVerdictToDisposition(${verdict}, ${score})`,
  );
}

assert.equal(taxonomy.reportVerdictToDisposition('REVIEW'), 'NEEDS_REVIEW');
assert.equal(taxonomy.reportVerdictToDisposition('MALICIOUS'), 'MALICIOUS');
assert.equal(taxonomy.reportVerdictToDisposition('NO_FINDING'), 'NO_FINDING');
assert.equal(taxonomy.reportVerdictToDisposition('FAILED'), 'FAILED');
assert.equal(taxonomy.reportVerdictToDisposition('UNKNOWN'), 'UNKNOWN');
assert.equal(taxonomy.reportVerdictToDisposition(undefined), 'UNKNOWN');

const sourceFile = path.resolve(__dirname, '../src/security-taxonomy.ts');
const mirrorFile = path.resolve(
  __dirname,
  '../../../Ceragon-Intelligence/packages/shared-contracts/src/security-taxonomy.ts',
);
if (fs.existsSync(mirrorFile)) {
  assert.equal(
    fs.readFileSync(mirrorFile, 'utf8').replace(/\r\n/g, '\n'),
    fs.readFileSync(sourceFile, 'utf8').replace(/\r\n/g, '\n'),
    'Ceragon-Intelligence shared-contracts security-taxonomy.ts mirror must stay byte-for-byte aligned',
  );
}

// ── source-identity parity (Workstream I release-gate, 2026-05-28) ──────
//
// SourceIdentity is the canonical alias/provenance contract used by
// installer → Backend DTOs → SQS fetch job → Static-Worker zod schema.
// If a new sourceType is added in shared-contracts but not mirrored
// downstream, the wire round-trip silently drops it. The release-gate
// pins:
//   1. The compiled canonical exports a non-empty SOURCE_IDENTITY_TYPES.
//   2. Every canonical sourceType string is also present, byte-for-byte,
//      in Backend's source-identity DTO and Static-Worker's zod enum
//      (parsed via regex so this test does NOT require either codebase
//      on the build path).
//   3. If a Ceragon-Intelligence vendored mirror exists, it stays byte-
//      for-byte aligned (same pattern as security-taxonomy).
const sourceIdentity = require('../dist/source-identity.js');
assert.ok(
  Array.isArray(sourceIdentity.SOURCE_IDENTITY_TYPES),
  'SOURCE_IDENTITY_TYPES must be exported as an array from source-identity.ts',
);
assert.ok(
  sourceIdentity.SOURCE_IDENTITY_TYPES.length > 0,
  'SOURCE_IDENTITY_TYPES must list at least one canonical source type',
);
for (const t of sourceIdentity.SOURCE_IDENTITY_TYPES) {
  assert.equal(typeof t, 'string', `SOURCE_IDENTITY_TYPES entry must be a string, got ${typeof t}`);
}

const sourceIdentityFile = path.resolve(__dirname, '../src/source-identity.ts');
const sourceIdentityMirror = path.resolve(
  __dirname,
  '../../../Ceragon-Intelligence/packages/shared-contracts/src/source-identity.ts',
);
if (fs.existsSync(sourceIdentityMirror)) {
  assert.equal(
    fs.readFileSync(sourceIdentityMirror, 'utf8').replace(/\r\n/g, '\n'),
    fs.readFileSync(sourceIdentityFile, 'utf8').replace(/\r\n/g, '\n'),
    'Ceragon-Intelligence shared-contracts source-identity.ts mirror must stay byte-for-byte aligned',
  );
}

// Static-Worker zod schema parity — only enforce when the sibling repo
// is checked out (workspace layout). Standalone shared-contracts CI
// (without sibling repos) skips this gate, mirroring the pattern in
// Backend/src/packages/dto/decision-contract.parity.spec.ts.
const staticWorkerFetchSchema = path.resolve(
  __dirname,
  '../../../Static-Worker/src/schemas/fetch-job.schema.ts',
);
if (fs.existsSync(staticWorkerFetchSchema)) {
  const src = fs.readFileSync(staticWorkerFetchSchema, 'utf8');
  // The zod enum lives in a `z.enum([ ... ])` directly after `sourceType:`.
  const match = src.match(/sourceType:\s*z\.enum\(\[([\s\S]*?)\]\)/);
  assert.ok(
    match,
    'Static-Worker fetch-job.schema.ts must declare sourceType: z.enum([...])',
  );
  const workerTypes = Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  assert.deepEqual(
    [...workerTypes].sort(),
    [...sourceIdentity.SOURCE_IDENTITY_TYPES].sort(),
    'Static-Worker fetch-job.schema.ts sourceType enum must match canonical SOURCE_IDENTITY_TYPES',
  );
}

// Backend source-identity DTO parity — enforced when the sibling repo
// is on disk. Backend re-declares `SOURCE_IDENTITY_TYPES` as a literal
// `as const` array (not yet imported from shared-contracts), so we
// parse that array and pin it to the canonical list.
const backendSourceIdentityDto = path.resolve(
  __dirname,
  '../../../Backend/src/packages/dto/source-identity.dto.ts',
);
if (fs.existsSync(backendSourceIdentityDto)) {
  const src = fs.readFileSync(backendSourceIdentityDto, 'utf8');
  const literalMatch = src.match(
    /export\s+const\s+SOURCE_IDENTITY_TYPES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/,
  );
  assert.ok(
    literalMatch,
    'Backend source-identity.dto.ts must declare `export const SOURCE_IDENTITY_TYPES = [...] as const`',
  );
  const backendTypes = Array.from(literalMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  assert.deepEqual(
    [...backendTypes].sort(),
    [...sourceIdentity.SOURCE_IDENTITY_TYPES].sort(),
    'Backend source-identity.dto.ts SOURCE_IDENTITY_TYPES must match canonical SOURCE_IDENTITY_TYPES (sibling repo)',
  );
}
