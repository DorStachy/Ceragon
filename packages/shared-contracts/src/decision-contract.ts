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
 * User-visible install-enforcement verdicts surfaced through Backend's
 * package-decision and analysis APIs. Do not use these values as full-repo
 * dependency report severity or disposition labels.
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
 * Clearer alias for the enforcement ACTION axis.
 *
 * NAMING NOTE: in this codebase `Verdict` / `VERDICTS` historically name the
 * install-enforcement ACTION (ALLOW / ALLOW_FAST / PROMPT / HOLD / BLOCK / …),
 * and the install wire field that carries it is `CheckPackagesResponse.action`
 * (the Go CLI depends on it). `Decision` is the additive, self-describing alias
 * for that same union — prefer it in new code when you mean "the action the
 * policy engine decided". This is a pure type alias: it adds no new runtime
 * values and does NOT replace `Verdict`/`VERDICTS` (renaming those would be a
 * breaking, repo-wide, CLI-affecting change). The orthogonal display SEVERITY
 * axis lives in `security-taxonomy.ts` (riskScoreToSeverity / severityBandLabel).
 */
export type Decision = Verdict;

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
