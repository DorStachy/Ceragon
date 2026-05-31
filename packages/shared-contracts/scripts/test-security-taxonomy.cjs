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

// ── vulnerability-applicability parity (Vuln Applicability Hardening,
//    2026-05-31, Wave 0) ─────────────────────────────────────────────────
//
// `VULNERABILITY_APPLICABILITY_STATES` / `_REASONS` are the FROZEN v3
// applicability enums every producer/consumer shares. A lane that adds a new
// applicability state or reason in its own repo WITHOUT updating shared
// contracts silently desyncs the wire — so this gate pins each downstream
// copy to the canonical list and FAILS on drift.
//
// CRITICAL: the four downstream mirrors do NOT exist yet (Wave 1 adds them).
// Each sibling check therefore SKIPS-WITH-WARNING when its file — or the
// expected marker inside it — is absent, so this script PASSES today and
// ENFORCES the moment a lane lands its copy. Same regex-parse + fs.existsSync
// discipline as the SOURCE_IDENTITY_TYPES block above (no cross-repo build
// dependency).
const applicability = require('../dist/vulnerability-applicability.js');

assert.ok(
  Array.isArray(applicability.VULNERABILITY_APPLICABILITY_STATES) &&
    applicability.VULNERABILITY_APPLICABILITY_STATES.length > 0,
  'VULNERABILITY_APPLICABILITY_STATES must be exported as a non-empty array',
);
assert.ok(
  Array.isArray(applicability.VULNERABILITY_APPLICABILITY_REASONS) &&
    applicability.VULNERABILITY_APPLICABILITY_REASONS.length > 0,
  'VULNERABILITY_APPLICABILITY_REASONS must be exported as a non-empty array',
);
// Self-check: the reference comparator must satisfy every canonical vector,
// so the table downstream repos verify against is itself proven here.
assert.ok(
  Array.isArray(applicability.NPM_SEMVER_COMPARE_VECTORS) &&
    applicability.NPM_SEMVER_COMPARE_VECTORS.length > 0,
  'NPM_SEMVER_COMPARE_VECTORS must be exported as a non-empty array',
);
for (const vec of applicability.NPM_SEMVER_COMPARE_VECTORS) {
  assert.equal(
    applicability.compareNpmSemver(vec.a, vec.b),
    vec.expected,
    `compareNpmSemver(${vec.a}, ${vec.b}) must equal ${vec.expected} (${vec.note})`,
  );
}

const CANONICAL_APPLICABILITY_STATES = [
  ...applicability.VULNERABILITY_APPLICABILITY_STATES,
].sort();
const CANONICAL_APPLICABILITY_REASONS = [
  ...applicability.VULNERABILITY_APPLICABILITY_REASONS,
].sort();

/**
 * Extract the string members of a TS `as const` array declaration named
 * `constName` from `src`. Returns null when the declaration is absent (so the
 * caller can skip-with-warning). The declaration may also be a bare union type
 * fallback, handled by `parseTsUnionMembers`.
 */
function parseConstArrayMembers(src, constName) {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  );
  const m = src.match(re);
  if (!m) return null;
  return Array.from(m[1].matchAll(/'([^']+)'|"([^"]+)"/g)).map(
    (g) => g[1] ?? g[2],
  );
}

/**
 * Extract the string-literal members of a TS union type alias named
 * `typeName`, e.g. `type X = 'A' | 'B' | 'C'`. Returns null when absent.
 * Frontend mirrors the applicability states as a union type, not an array.
 */
function parseTsUnionMembers(src, typeName) {
  const re = new RegExp(`type\\s+${typeName}\\s*=\\s*([^;]+);`);
  const m = src.match(re);
  if (!m) return null;
  const members = Array.from(m[1].matchAll(/'([^']+)'|"([^"]+)"/g)).map(
    (g) => g[1] ?? g[2],
  );
  return members.length > 0 ? members : null;
}

/**
 * Pin one downstream copy to a canonical sorted list. Skips-with-warning when
 * the file is absent OR none of the parsers find the declaration (mirror not
 * landed yet); fails hard when found-but-drifted.
 */
function assertApplicabilityParity(opts) {
  const { repoLabel, relPath, canonical, what, parsers } = opts;
  const absPath = path.resolve(__dirname, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(
      `[applicability-parity] SKIP: ${repoLabel} ${what} — file not present yet (${relPath}). ` +
        `Will ENFORCE once the Wave-1 lane adds its copy.`,
    );
    return;
  }
  const src = fs.readFileSync(absPath, 'utf8');
  let found = null;
  for (const parse of parsers) {
    found = parse(src);
    if (found && found.length > 0) break;
  }
  if (!found || found.length === 0) {
    console.warn(
      `[applicability-parity] SKIP: ${repoLabel} ${what} — file present but no recognized ` +
        `declaration found in ${relPath}. Will ENFORCE once the lane lands the canonical const/union.`,
    );
    return;
  }
  assert.deepEqual(
    [...found].sort(),
    canonical,
    `${repoLabel} ${what} (${relPath}) must match canonical ${what} — drift detected`,
  );
  console.log(`[applicability-parity] OK: ${repoLabel} ${what} matches canonical.`);
}

// Static-Worker (Wave-1 lane W): worker-local mirror of the contract. Lane W
// owns `src/analyzer/*`; the most likely home is a dedicated
// `vulnerability-applicability.ts` (plan Task 2 suggests adding one) or the
// existing scanner file. Try both; skip until one exists with the const.
for (const relPath of [
  '../../../Static-Worker/src/analyzer/vulnerability-applicability.ts',
  '../../../Static-Worker/src/analyzer/vulnerability-scanner.ts',
]) {
  if (!fs.existsSync(path.resolve(__dirname, relPath))) continue;
  const src = fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');
  if (
    parseConstArrayMembers(src, 'VULNERABILITY_APPLICABILITY_STATES') ||
    parseTsUnionMembers(src, 'VulnerabilityApplicabilityState')
  ) {
    assertApplicabilityParity({
      repoLabel: 'Static-Worker',
      relPath,
      canonical: CANONICAL_APPLICABILITY_STATES,
      what: 'applicability STATES',
      parsers: [
        (s) => parseConstArrayMembers(s, 'VULNERABILITY_APPLICABILITY_STATES'),
        (s) => parseTsUnionMembers(s, 'VulnerabilityApplicabilityState'),
      ],
    });
    assertApplicabilityParity({
      repoLabel: 'Static-Worker',
      relPath,
      canonical: CANONICAL_APPLICABILITY_REASONS,
      what: 'applicability REASONS',
      parsers: [
        (s) => parseConstArrayMembers(s, 'VULNERABILITY_APPLICABILITY_REASONS'),
        (s) => parseTsUnionMembers(s, 'VulnerabilityApplicabilityReason'),
      ],
    });
    break;
  }
}

// Backend (Wave-1 lane B): the DTO enum the worker wire whitelists. Lane B may
// import from shared-contracts (no local const → nothing to pin, fine) OR
// re-declare an `as const` in the gate/DTO. Pin it if a local declaration
// exists; otherwise skip.
for (const relPath of [
  '../../../Backend/src/packages/helpers/vulnerability-applicability-gate.ts',
  '../../../Backend/src/jobs/dto/worker-result.dto.ts',
]) {
  const abs = path.resolve(__dirname, relPath);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  if (parseConstArrayMembers(src, 'VULNERABILITY_APPLICABILITY_STATES')) {
    assertApplicabilityParity({
      repoLabel: 'Backend',
      relPath,
      canonical: CANONICAL_APPLICABILITY_STATES,
      what: 'applicability STATES',
      parsers: [
        (s) => parseConstArrayMembers(s, 'VULNERABILITY_APPLICABILITY_STATES'),
      ],
    });
  }
  if (parseConstArrayMembers(src, 'VULNERABILITY_APPLICABILITY_REASONS')) {
    assertApplicabilityParity({
      repoLabel: 'Backend',
      relPath,
      canonical: CANONICAL_APPLICABILITY_REASONS,
      what: 'applicability REASONS',
      parsers: [
        (s) => parseConstArrayMembers(s, 'VULNERABILITY_APPLICABILITY_REASONS'),
      ],
    });
  }
}

// Frontend (Wave-1 lane F): the type union over applicability state in
// `types/forensics.ts`. Frontend conventionally uses a string union, not an
// `as const` array — so try the union parser first. Skip until it lands.
assertApplicabilityParity({
  repoLabel: 'Frontend',
  relPath: '../../../Frontend/types/forensics.ts',
  canonical: CANONICAL_APPLICABILITY_STATES,
  what: 'applicability STATES',
  parsers: [
    (s) => parseTsUnionMembers(s, 'VulnerabilityApplicabilityState'),
    (s) => parseConstArrayMembers(s, 'VULNERABILITY_APPLICABILITY_STATES'),
  ],
});

// Ceragon-Intelligence mirror (Pre-Flight policy): only mirrored if Task 4B
// imports the contract from shared-contracts. If the mirror file exists, it
// MUST be byte-for-byte aligned (same rule as security-taxonomy /
// source-identity). If absent, skip — Intelligence emits a minimal envelope
// Backend already understands and does not need the file.
const applicabilitySourceFile = path.resolve(
  __dirname,
  '../src/vulnerability-applicability.ts',
);
const applicabilityIntelMirror = path.resolve(
  __dirname,
  '../../../Ceragon-Intelligence/packages/shared-contracts/src/vulnerability-applicability.ts',
);
if (fs.existsSync(applicabilityIntelMirror)) {
  assert.equal(
    fs.readFileSync(applicabilityIntelMirror, 'utf8').replace(/\r\n/g, '\n'),
    fs.readFileSync(applicabilitySourceFile, 'utf8').replace(/\r\n/g, '\n'),
    'Ceragon-Intelligence shared-contracts vulnerability-applicability.ts mirror must stay byte-for-byte aligned',
  );
  console.log('[applicability-parity] OK: Ceragon-Intelligence mirror byte-aligned.');
}

console.log('[applicability-parity] applicability enum + comparator gates passed.');
