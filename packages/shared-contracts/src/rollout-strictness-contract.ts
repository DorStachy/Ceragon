/**
 * M3 Rollout Governance — per-Team push STRICTNESS floor math (P7 / LOCK-7 /
 * §A-C3 / BN7).
 *
 * A Team carries a `scan_strictness` (on `endpoint_groups`) that TIGHTENS how
 * the push pre-push gate blocks — a stricter team blocks at a lower severity
 * threshold than a balanced team. The tightening is expressed here as a pure
 * FLOOR over the two fields the push verdict actually reads:
 *   - the push `enforcementMode` (advisory | block | checked), and
 *   - the block-severity set (`failOn.severities`, defaulting to CRITICAL/HIGH).
 *
 * WHY IT LIVES IN SHARED-CONTRACTS (BN7): the daemon's Go `resolvePushPolicy`
 * and the Backend's `applyTeamStrictness` (folded INSIDE
 * `computeEffectivePolicy`, §A-C3, so it enters the `policyHash`) MUST agree —
 * "the two push moments must agree". {@link STRICTNESS_VECTORS} is the shared
 * fixture battery proving that agreement (a Go corpus file mirrors it in
 * Installers). The floor math is pure + deterministic, the same
 * proven-by-vectors discipline as `computePushVerdict` / `computeReadiness`.
 *
 * NEVER DOWNGRADES: a floor only ever RAISES the enforcement mode and ADDS to
 * the block-severity set. `inherit` is the identity (byte-identical to today —
 * the back-compat guarantee for a no-team endpoint).
 */

/** The Team `scan_strictness` vocabulary. `inherit` = use the base as-is. */
export const TEAM_SCAN_STRICTNESS_VALUES = [
  'inherit',
  'monitor',
  'balanced',
  'strict',
] as const;

export type TeamScanStrictness = (typeof TEAM_SCAN_STRICTNESS_VALUES)[number];

/** The DB/entity default — a Team inherits the site/org base until set. */
export const DEFAULT_TEAM_SCAN_STRICTNESS: TeamScanStrictness = 'inherit';

/** True when `v` is a known strictness value. */
export function isTeamScanStrictness(v: unknown): v is TeamScanStrictness {
  return (
    typeof v === 'string' &&
    (TEAM_SCAN_STRICTNESS_VALUES as readonly string[]).includes(v)
  );
}

/**
 * Push enforcement modes, ranked so a strictness floor can never DOWNGRADE the
 * base: `advisory` (Monitor) < `block` (Enforce) < `checked` (Enforce + CD
 * attestation). Raising toward a higher rank is a tightening; a floor at
 * `block` leaves an already-`checked` base untouched.
 */
export const PUSH_ENFORCEMENT_MODES = ['advisory', 'block', 'checked'] as const;
export type PushEnforcementMode = (typeof PUSH_ENFORCEMENT_MODES)[number];

const ENFORCE_RANK: Record<PushEnforcementMode, number> = {
  advisory: 0,
  block: 1,
  checked: 2,
};

/**
 * Per-strictness enforcement FLOOR. `null` (only `inherit`) means "no floor —
 * return the base unchanged". `monitor`'s floor is `advisory` (rank 0) so it
 * never downgrades an enforcing base; it merely refuses to weaken.
 */
export const STRICTNESS_ENFORCE_FLOOR: Record<
  TeamScanStrictness,
  PushEnforcementMode | null
> = {
  inherit: null,
  monitor: 'advisory',
  balanced: 'block',
  strict: 'block',
};

/**
 * Per-strictness block-severity FLOOR — severities UNIONED into the base set
 * (never removed). `strict` adds MEDIUM so a MEDIUM finding blocks; `balanced`
 * keeps the CRITICAL/HIGH bar; `monitor` adds nothing. `null` = inherit.
 */
export const STRICTNESS_SEVERITY_FLOOR: Record<
  TeamScanStrictness,
  readonly string[] | null
> = {
  inherit: null,
  monitor: [],
  balanced: ['CRITICAL', 'HIGH'],
  strict: ['CRITICAL', 'HIGH', 'MEDIUM'],
};

/** The stricter (higher-ranked) of two enforcement modes. */
export function strictestEnforcementMode(
  a: PushEnforcementMode,
  b: PushEnforcementMode,
): PushEnforcementMode {
  return ENFORCE_RANK[a] >= ENFORCE_RANK[b] ? a : b;
}

/** Uppercase + order-preserving dedupe of a severity list. */
function normalizeSeverities(list: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    if (typeof s !== 'string') continue;
    const up = s.trim().toUpperCase();
    if (up.length === 0 || seen.has(up)) continue;
    seen.add(up);
    out.push(up);
  }
  return out;
}

/** The two push fields a strictness floor tightens. */
export interface StrictnessSlice {
  enforcementMode: PushEnforcementMode;
  /** The block-severity set (CRITICAL/HIGH/…), uppercase. */
  blockSeverities: string[];
}

/**
 * Apply a strictness floor to a `{ enforcementMode, blockSeverities }` slice.
 * PURE + deterministic. NEVER downgrades:
 *   - `enforcementMode` = stricter(base, floor);
 *   - `blockSeverities` = UNION(base, floor) (order: base first, floor extras).
 * `inherit` is the identity (base returned unchanged, only re-normalized).
 */
export function applyStrictnessFloors(
  slice: StrictnessSlice,
  strictness: TeamScanStrictness,
): StrictnessSlice {
  const enforceFloor = STRICTNESS_ENFORCE_FLOOR[strictness];
  const sevFloor = STRICTNESS_SEVERITY_FLOOR[strictness];

  const baseSeverities = normalizeSeverities(slice.blockSeverities);
  if (enforceFloor === null || sevFloor === null) {
    // inherit — identity (no floor).
    return { enforcementMode: slice.enforcementMode, blockSeverities: baseSeverities };
  }

  const enforcementMode = strictestEnforcementMode(slice.enforcementMode, enforceFloor);
  const blockSeverities = normalizeSeverities([...baseSeverities, ...sevFloor]);
  return { enforcementMode, blockSeverities };
}

// ── Shared fixture battery (BN7) ─────────────────────────────────────────────

/**
 * One strictness vector: the floor-math result plus (optionally) an end-to-end
 * push-verdict scenario. The Backend `applyTeamStrictness` unit test asserts
 * `applyStrictnessFloors(base, strictness)` deep-equals `expected`; the
 * `push-verdict.service.spec` composes `expected` into a `BoundPushProtectionPolicy`
 * and asserts `computePushVerdict` returns `scenario.expectedVerdict`. The Go
 * corpus mirrors this exact table.
 */
export interface StrictnessVector {
  strictness: TeamScanStrictness;
  base: StrictnessSlice;
  /** The slice after the floor is applied (never a downgrade). */
  expected: StrictnessSlice;
  /** Optional end-to-end verdict scenario for a single new finding. */
  scenario?: {
    findingSeverity: string;
    isSecret?: boolean;
    expectedVerdict: 'BLOCK' | 'WARN' | 'ALLOW';
  };
  note: string;
}

export const STRICTNESS_VECTORS: readonly StrictnessVector[] = [
  {
    strictness: 'inherit',
    base: { enforcementMode: 'advisory', blockSeverities: ['CRITICAL', 'HIGH'] },
    expected: { enforcementMode: 'advisory', blockSeverities: ['CRITICAL', 'HIGH'] },
    scenario: { findingSeverity: 'MEDIUM', expectedVerdict: 'WARN' },
    note: 'inherit is identity — advisory base warns a MEDIUM (back-compat)',
  },
  {
    strictness: 'strict',
    base: { enforcementMode: 'advisory', blockSeverities: ['CRITICAL', 'HIGH'] },
    expected: {
      enforcementMode: 'block',
      blockSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    },
    scenario: { findingSeverity: 'MEDIUM', expectedVerdict: 'BLOCK' },
    note: 'strict team blocks a MEDIUM (enforce + MEDIUM floor)',
  },
  {
    strictness: 'balanced',
    base: { enforcementMode: 'advisory', blockSeverities: ['CRITICAL', 'HIGH'] },
    expected: { enforcementMode: 'block', blockSeverities: ['CRITICAL', 'HIGH'] },
    scenario: { findingSeverity: 'MEDIUM', expectedVerdict: 'WARN' },
    note: 'balanced team only WARNs a MEDIUM (enforce, no MEDIUM floor)',
  },
  {
    strictness: 'balanced',
    base: { enforcementMode: 'advisory', blockSeverities: ['CRITICAL', 'HIGH'] },
    expected: { enforcementMode: 'block', blockSeverities: ['CRITICAL', 'HIGH'] },
    scenario: { findingSeverity: 'HIGH', expectedVerdict: 'BLOCK' },
    note: 'balanced team blocks a HIGH',
  },
  {
    strictness: 'strict',
    base: { enforcementMode: 'checked', blockSeverities: ['CRITICAL', 'HIGH', 'LOW'] },
    expected: {
      enforcementMode: 'checked',
      blockSeverities: ['CRITICAL', 'HIGH', 'LOW', 'MEDIUM'],
    },
    note: 'never downgrades — a checked base stays checked; MEDIUM added, LOW kept',
  },
  {
    strictness: 'monitor',
    base: { enforcementMode: 'block', blockSeverities: ['CRITICAL'] },
    expected: { enforcementMode: 'block', blockSeverities: ['CRITICAL'] },
    scenario: { findingSeverity: 'CRITICAL', expectedVerdict: 'BLOCK' },
    note: 'monitor never downgrades an enforcing base (advisory floor is a no-op here)',
  },
  {
    strictness: 'strict',
    base: { enforcementMode: 'advisory', blockSeverities: [] },
    expected: {
      enforcementMode: 'block',
      blockSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    },
    scenario: { findingSeverity: 'LOW', isSecret: true, expectedVerdict: 'BLOCK' },
    note: 'secret ALWAYS blocks regardless of strictness (secret-override precedence)',
  },
  {
    strictness: 'strict',
    base: { enforcementMode: 'advisory', blockSeverities: [] },
    expected: {
      enforcementMode: 'block',
      blockSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    },
    scenario: { findingSeverity: 'LOW', expectedVerdict: 'WARN' },
    note: 'strict enforce with a LOW (below floor) non-secret finding → WARN',
  },
];
