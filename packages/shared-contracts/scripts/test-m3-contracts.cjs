// ════════════════════════════════════════════════════════════════════════
// M3 Rollout Governance — shared-contracts golden runner.
//
// Proves the M3 pure functions against their shared fixture batteries on the
// COMPILED dist (`npm run build` runs first). Run in BOTH copies' `npm test`
// so a drift in either copy's compiled output is caught. Mirrors the existing
// `test-security-taxonomy.cjs` / `test-vulnerability-applicability.cjs` shape.
//   - matchesAutoSortRule   vs AUTOSORT_VECTORS
//   - computeReadiness       vs READINESS_VECTORS (+ gap-key assertions)
//   - normalizeControls      allowlist rebuild + privacy (no smuggled keys)
// ════════════════════════════════════════════════════════════════════════
const assert = require('node:assert/strict');

const c = require('../dist/index.js');

// ── matchesAutoSortRule vs AUTOSORT_VECTORS ──────────────────────────────
assert.ok(Array.isArray(c.AUTOSORT_VECTORS) && c.AUTOSORT_VECTORS.length > 0,
  'AUTOSORT_VECTORS must be a non-empty array');
for (const v of c.AUTOSORT_VECTORS) {
  assert.equal(
    c.matchesAutoSortRule(v.rule, v.endpoint),
    v.expected,
    `matchesAutoSortRule — ${v.note}`,
  );
}
console.log(`[m3] matchesAutoSortRule: ${c.AUTOSORT_VECTORS.length} vectors OK`);

// ── computeReadiness vs READINESS_VECTORS ────────────────────────────────
assert.ok(Array.isArray(c.READINESS_VECTORS) && c.READINESS_VECTORS.length > 0,
  'READINESS_VECTORS must be a non-empty array');
for (const v of c.READINESS_VECTORS) {
  const res = c.computeReadiness(v.input);
  assert.equal(res.verdict, v.expected.verdict, `computeReadiness verdict — ${v.note}`);
  if (v.expected.gaps) {
    assert.deepEqual(
      [...res.gaps].sort(),
      [...v.expected.gaps].sort(),
      `computeReadiness gaps — ${v.note}`,
    );
  }
}
console.log(`[m3] computeReadiness: ${c.READINESS_VECTORS.length} vectors OK`);

// rollup: worst member wins; empty → unknown
assert.equal(c.rollupTeamReadiness([]), 'unknown', 'empty team rollup → unknown');
assert.equal(c.rollupTeamReadiness(['ready', 'ready']), 'ready', 'all ready → ready');
assert.equal(c.rollupTeamReadiness(['ready', 'at-risk']), 'at-risk', 'one at-risk → at-risk');
assert.equal(c.rollupTeamReadiness(['at-risk', 'not-ready']), 'not-ready', 'not-ready outranks at-risk');
assert.equal(c.rollupTeamReadiness(['ready', 'unknown']), 'unknown', 'unknown outranks ready');
console.log('[m3] rollupTeamReadiness: OK');

// ── normalizeControls allowlist rebuild + privacy ────────────────────────
const NOW = '2026-07-08T12:00:00.000Z';
assert.equal(c.normalizeControls(null, NOW), null, 'null input → null');
assert.equal(c.normalizeControls('nope', NOW), null, 'string input → null');
assert.equal(c.normalizeControls([], NOW), null, 'array input → null');

// Field-by-field rebuild: unknown keys dropped, invalid state → unknown,
// invalid mode/version dropped, extra top-level keys never survive.
const dirty = {
  controls: {
    proxy: { state: 'active', mode: 'strict', version: '7.1.5' },
    hooks: { state: 'bogus-state', mode: 'not-a-mode', version: '/etc/passwd' },
    packageGate: { state: 'inactive' },
    NOT_A_CONTROL: { state: 'active' },
  },
  evidenceIntact: true,
  enforcementTier: 'strict',
  attestedAt: '2026-07-08T11:59:00.000Z',
  secretField: 'sk-should-never-survive',
  __proto__: { polluted: true },
};
const norm = c.normalizeControls(dirty, NOW);
assert.ok(norm, 'dirty object → normalized');
assert.deepEqual(norm.controls.proxy, { state: 'active', mode: 'strict', version: '7.1.5' },
  'valid control fully kept');
assert.deepEqual(norm.controls.hooks, { state: 'unknown' },
  'invalid state → unknown; invalid mode + non-semver version dropped');
assert.deepEqual(norm.controls.packageGate, { state: 'inactive' }, 'state-only control kept');
assert.equal(norm.controls.NOT_A_CONTROL, undefined, 'unknown control key dropped');
assert.equal(norm.evidenceIntact, true);
assert.equal(norm.enforcementTier, 'strict');
assert.equal(norm.attestedAt, '2026-07-08T11:59:00.000Z', 'valid attestedAt kept');
assert.equal(norm.secretField, undefined, 'PRIVACY: arbitrary top-level field never survives');
assert.equal(Object.prototype.hasOwnProperty.call(norm, 'polluted'), false,
  'PRIVACY: no prototype-smuggled field survives');

// attestedAt fallback to nowIso when invalid/missing.
const noTs = c.normalizeControls({ controls: { proxy: { state: 'active' } } }, NOW);
assert.equal(noTs.attestedAt, NOW, 'missing attestedAt → nowIso fallback');
const badTs = c.normalizeControls({ controls: {}, attestedAt: 'not-a-date' }, NOW);
assert.equal(badTs.attestedAt, NOW, 'invalid attestedAt → nowIso fallback');

// isShortSemver guard.
assert.equal(c.isShortSemver('7.1.5'), true);
assert.equal(c.isShortSemver('7'), true);
assert.equal(c.isShortSemver('7.1.5-rc1'), true);
assert.equal(c.isShortSemver('/usr/local/bin'), false);
assert.equal(c.isShortSemver('a'.repeat(64)), false);
console.log('[m3] normalizeControls allowlist + privacy: OK');

// ── console-roles + policy-scope vocab sanity ────────────────────────────
assert.equal(c.CONSOLE_SITE_ROLE_LABELS.admin_viewer, 'Auditor', 'admin_viewer labelled Auditor');
assert.equal(c.CONSOLE_SITE_ROLE_ADMISSION.admin_viewer, 'organization_admin',
  'admin_viewer admits as organization_admin (§A/C1)');
assert.equal(c.isReadOnlyConsoleSiteRole('admin_viewer'), true);
assert.equal(c.isReadOnlyConsoleSiteRole('site_admin'), false);
assert.deepEqual([...c.AI_POLICY_SCOPES], ['org', 'site', 'team'], 'policy scope vocab');
console.log('[m3] console-roles + policy-scope vocab: OK');

// ── applyStrictnessFloors vs STRICTNESS_VECTORS (P7 / BN7) ────────────────
assert.ok(Array.isArray(c.STRICTNESS_VECTORS) && c.STRICTNESS_VECTORS.length > 0,
  'STRICTNESS_VECTORS must be a non-empty array');
for (const v of c.STRICTNESS_VECTORS) {
  const got = c.applyStrictnessFloors(v.base, v.strictness);
  assert.equal(got.enforcementMode, v.expected.enforcementMode,
    `applyStrictnessFloors enforcementMode — ${v.note}`);
  assert.deepEqual([...got.blockSeverities].sort(), [...v.expected.blockSeverities].sort(),
    `applyStrictnessFloors blockSeverities — ${v.note}`);
}
// inherit is the identity (never a downgrade / no drift).
assert.deepEqual(
  c.applyStrictnessFloors({ enforcementMode: 'block', blockSeverities: ['CRITICAL'] }, 'inherit'),
  { enforcementMode: 'block', blockSeverities: ['CRITICAL'] },
  'inherit is identity');
console.log(`[m3] applyStrictnessFloors: ${c.STRICTNESS_VECTORS.length} vectors OK`);

console.log('[m3] all M3 shared-contract golden vectors passed.');
