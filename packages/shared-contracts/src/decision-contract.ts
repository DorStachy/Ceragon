// ════════════════════════════════════════════════════════════════════════
// P1-5 (2026-05-14 stabilization): canonical decision/status contract.
//
// Backend DTOs, Frontend types, CLI parsers, and OpenAPI schemas MUST
// align on the union of user-visible verdicts and analysis statuses.
// Before P1-5, Backend used `'ALLOW' | 'BLOCK'` while Frontend already
// rendered `INCONCLUSIVE` and the CLI parsed both `'COMPLETE'` and
// `'COMPLETED'`. Pin the canonical lists here so a drift is a CI failure
// (decision-contract.parity.spec.ts in Backend asserts the inlined
// types match these exports).
// ════════════════════════════════════════════════════════════════════════

/**
 * User-visible verdicts surfaced through Backend's package-decision and
 * analysis APIs.
 *
 *   - ALLOW: pass policy gates, install proceeds
 *   - ALLOW_FAST: pass via FastGate hardcoded-trust path (no policy eval)
 *   - PROMPT: ambiguous; CLI/UI prompts the user
 *   - HOLD: queued / processing / awaiting sandbox enrichment
 *   - BLOCK: policy decided block (NOT scanner failure — see failureReason)
 *   - PENDING: legacy synonym for HOLD; emitted by some older paths
 *   - INCONCLUSIVE: scanner ran but produced no actionable verdict (rare)
 */
export const VERDICTS = [
  'ALLOW',
  'ALLOW_FAST',
  'PROMPT',
  'HOLD',
  'BLOCK',
  'PENDING',
  'INCONCLUSIVE',
] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * Terminal-and-transitional analysis statuses surfaced by Backend's
 * `GET /api/v1/packages/analysis/:id`.
 *
 *   - PENDING: queued, not yet picked up by a worker
 *   - PROCESSING: worker in-flight
 *   - COMPLETED: terminal — verdict was produced
 *   - FAILED: terminal — scanner failed (failureReason carries detail)
 *   - ABANDONED: terminal — user cancelled or supplanted by retry
 *   - TIMEOUT: terminal — pipeline exceeded the hard-timeout budget
 *
 * CLI tolerates the legacy `'COMPLETE'` spelling but normalizes to
 * `'COMPLETED'` before any business logic. Test parity ensures both
 * spellings reach the same code path.
 */
export const ANALYSIS_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'ABANDONED',
  'TIMEOUT',
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
