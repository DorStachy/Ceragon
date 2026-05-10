// ═══════════════════════════════════════════════════════════════════════════
// Scanner decision contract — Phase 0 (foundation; must land before Phase 1.x)
//
// Two orthogonal axes carve the decision surface so the historical
// `PolicyAction` enum can stay untouched while we add UNKNOWN /
// INCONCLUSIVE / POLICY_SUPPRESSED visibility.
//
//   ScannerDisplayState  — what the UI shows (CLI, PR comment, dashboard).
//   ScannerRuntimeAction — what enforcement actually does at install-time.
//
// Fusion invariant (verified by Backend/src/packages/utils/decision-fusion.spec.ts):
//   BLOCK dominates INCONCLUSIVE. If any sub-decision yields BLOCK and any
//   other yields INCONCLUSIVE, the fused decision is BLOCK. Closes Phase 6
//   fixture #14 ("Partial BLOCK then timeout becomes INCONCLUSIVE").
//
// `PolicyAction` (Backend/src/policy-groups/types/policy.types.ts) is NOT
// modified by this module. The wire-level `action` enum exposed to existing
// CLI/Frontend consumers is preserved. New states are surfaced through
// optional `displayState` / `runtimeAction` fields and a one-way adapter
// (`runtimeActionToWireAction`) that downgrades INCONCLUSIVE→BLOCK,
// POLICY_SUPPRESSED→ALLOW, UNKNOWN→PROMPT for legacy consumers.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UI display state for a single package decision.
 *
 *   ALLOW              — package is safe; install proceeds silently.
 *   PROMPT             — interactive confirmation required.
 *   BLOCK              — install must not proceed.
 *   INCONCLUSIVE       — analysis could not produce a confident verdict;
 *                        per Phase 1.0/1.1, NEVER auto-displayed as ALLOW.
 *   UNKNOWN            — pre-analysis state; tenant policy decides default.
 *   POLICY_SUPPRESSED  — finding was filtered by triage / IGNORED / FIXED;
 *                        not surfaced in PR / SARIF / check-run / dashboards.
 */
export type ScannerDisplayState =
  | 'ALLOW'
  | 'PROMPT'
  | 'BLOCK'
  | 'INCONCLUSIVE'
  | 'UNKNOWN'
  | 'POLICY_SUPPRESSED';

/**
 * What enforcement (CLI, sandbox dispatcher, GitHub Action) does.
 *
 *   PROCEED          — execute the package install / passthrough.
 *   PROMPT_USER      — interactive prompt; PROCEED only on explicit confirm.
 *   DENY             — refuse the install; reportable.
 *   DEFER_DECISION   — wait for upstream signal (sandbox, async result).
 *   DEFAULT_BY_POLICY— tenant default applies (ALLOW / PROMPT / DENY).
 */
export type ScannerRuntimeAction =
  | 'PROCEED'
  | 'PROMPT_USER'
  | 'DENY'
  | 'DEFER_DECISION'
  | 'DEFAULT_BY_POLICY';

/**
 * Why analysis could not produce a confident verdict. Persisted on
 * `worker-result.dto.ts` and surfaced to the UI when display state is
 * INCONCLUSIVE (Phase 0.5 wire DTO extension).
 */
export type InconclusiveReason =
  | 'SANDBOX_TIMEOUT'
  | 'SANDBOX_NO_ISOLATION'
  | 'SANDBOX_DEGRADED_TELEMETRY'
  | 'STATIC_OVERSIZED_ARCHIVE'
  | 'STATIC_EXTRACTION_FAILED'
  | 'AI_DEGRADED'
  | 'COVERAGE_GAP'
  | 'UPSTREAM_REGISTRY_UNAVAILABLE'
  | 'CACHE_VERSION_MISMATCH'
  | 'STATIC_SANDBOX_DIGEST_DRIFT';

/**
 * Coverage envelope reported alongside an INCONCLUSIVE verdict so the UI
 * (and policy engine) can decide whether the gap is fatal.
 */
export interface ScannerCoverage {
  /** True if the static stage produced a complete file inventory. */
  staticComplete: boolean;
  /** True if the sandbox stage achieved both isolation and telemetry. */
  sandboxClean: boolean;
  /** Free-form reasons for any coverage gap (audit / debug). */
  gaps: string[];
}

/**
 * Fused per-package decision used internally by Backend before adapting to
 * the legacy wire action. NEVER serialized to existing CLI/Frontend wire
 * formats without going through `runtimeActionToWireAction`.
 */
export interface ScannerDecision {
  displayState: ScannerDisplayState;
  runtimeAction: ScannerRuntimeAction;
  inconclusiveReason?: InconclusiveReason;
  coverage?: ScannerCoverage;
  /** When `displayState === 'POLICY_SUPPRESSED'`: the suppression record id. */
  suppressionId?: string;
  /** Free-form audit reason — never user-facing copy. */
  reason?: string;
}

/** Legacy wire action recognized by every shipped CLI / Frontend / IDE plugin. */
export type LegacyWireAction = 'ALLOW' | 'BLOCK' | 'PROMPT' | 'HOLD';

/**
 * One-way adapter from new runtime action → legacy wire action. Required
 * because old CLI / Frontend builds don't understand DEFER_DECISION /
 * INCONCLUSIVE. Matches Phase 4 SSE contract.
 *
 *   PROCEED            → ALLOW
 *   PROMPT_USER        → PROMPT
 *   DENY               → BLOCK
 *   DEFER_DECISION     → HOLD   (CLI waits for SSE follow-up)
 *   DEFAULT_BY_POLICY  → caller MUST resolve via tenant policy first; this
 *                         function deliberately throws to surface logic bugs.
 */
export function runtimeActionToWireAction(action: ScannerRuntimeAction): LegacyWireAction {
  switch (action) {
    case 'PROCEED':
      return 'ALLOW';
    case 'PROMPT_USER':
      return 'PROMPT';
    case 'DENY':
      return 'BLOCK';
    case 'DEFER_DECISION':
      return 'HOLD';
    case 'DEFAULT_BY_POLICY':
      throw new Error(
        'runtimeActionToWireAction: DEFAULT_BY_POLICY must be resolved via tenant policy before adapting to wire action',
      );
    default: {
      const exhaustive: never = action;
      throw new Error(`runtimeActionToWireAction: unhandled runtime action ${exhaustive as string}`);
    }
  }
}

/**
 * Adapter from internal display state → legacy wire action. Used only by
 * read-paths that have already lost the runtime-action axis (e.g., DTO
 * round-trips through the global artifact cache before Phase 0.5 ships
 * the extended schema). Suppression NEVER reaches here — POLICY_SUPPRESSED
 * findings are filtered upstream by Phase 5 reporters.
 */
export function displayStateToWireAction(state: ScannerDisplayState): LegacyWireAction {
  switch (state) {
    case 'ALLOW':
      return 'ALLOW';
    case 'PROMPT':
      return 'PROMPT';
    case 'BLOCK':
      return 'BLOCK';
    case 'INCONCLUSIVE':
      // Phase 1.0/1.1 invariant: INCONCLUSIVE never auto-displays as ALLOW.
      // The wire downgrade is BLOCK so legacy CLIs default to deny;
      // tenant policy may override this via the DEFAULT_BY_POLICY path
      // BEFORE reaching this adapter.
      return 'BLOCK';
    case 'UNKNOWN':
      return 'PROMPT';
    case 'POLICY_SUPPRESSED':
      throw new Error(
        'displayStateToWireAction: POLICY_SUPPRESSED must be filtered before wire adaptation',
      );
    default: {
      const exhaustive: never = state;
      throw new Error(`displayStateToWireAction: unhandled display state ${exhaustive as string}`);
    }
  }
}
