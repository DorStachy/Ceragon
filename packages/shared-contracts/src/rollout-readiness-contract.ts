/**
 * M3 Rollout Governance — rollout readiness computation (LOCK-2).
 *
 * The canonical pure function that answers, per endpoint, "is this machine
 * ready to have AI turned on?" It lives here so Backend can IMPORT it and the
 * Frontend can REIMPLEMENT it (`lib/ai/readiness.ts`), both gated by the shared
 * {@link READINESS_VECTORS} fixture battery (in `rollout-readiness-fixtures.ts`)
 * run in BOTH jest suites — the same triple-impl-proven-by-vectors discipline
 * as the M2.5 detectors.
 *
 * THE HONESTY CONTRACT ("mirror one truth to all"):
 *   - A control is a gap ONLY when the tool it protects is ACTUALLY USED and
 *     the control is not protecting it (used + unattested/inactive/degraded →
 *     red). A tool that is not used → "not-applicable", never a gap.
 *   - Stale attestation is shown as such, never green (an idle machine cannot
 *     masquerade as protected).
 *   - Universal-health failure (offline / policy out of sync / evidence broken
 *     / active bypass) → "not-ready".
 *   - The verdict is NEVER falsely "ready".
 */

import type {
  EndpointControlKey,
  EndpointControlReport,
  EndpointControlState,
} from './endpoint-controls-contract';

/** Endpoint-level rollout verdict. Backend drops the go/no-go framing. */
export const ROLLOUT_READINESS_VERDICTS = [
  'ready',
  'at-risk',
  'not-ready',
  'unknown',
] as const;

export type RolloutReadinessVerdict =
  (typeof ROLLOUT_READINESS_VERDICTS)[number];

/** Per-control display status shown uniformly for every endpoint. */
export const CONTROL_DISPLAY_STATUSES = [
  'protected',
  'unprotected-used',
  'not-applicable',
  'unknown',
] as const;

export type ControlDisplayStatus = (typeof CONTROL_DISPLAY_STATUSES)[number];

/**
 * Universal-health signals judged independent of tool usage (PRD §4 / §A/C5).
 * The Backend readiness service (P5) pins each to a concrete source; the pure
 * function just consumes the resolved booleans.
 */
export interface EndpointHealthSignals {
  /** Agent binary present / enrolled. */
  installed: boolean;
  /** Last seen within the online window. */
  online: boolean;
  /** Reported policy version == server-current effective version. */
  policySynced: boolean;
  /** Server-side evidence-chain re-verify passed (authoritative — BN6). */
  evidenceIntact: boolean;
  /** No active bypass / tamper marker. */
  noActiveBypass: boolean;
}

/** Input to {@link computeReadiness}. Deterministic — no ambient clock. */
export interface ComputeReadinessInput {
  /** The attested per-control reports (from `normalizeControls`). */
  controls: Partial<Record<EndpointControlKey, EndpointControlReport>>;
  /** RFC3339 last-attestation instant, or null if never attested. */
  attestedAt: string | null;
  /**
   * Whether the tool each control protects is ACTUALLY USED on this endpoint
   * (derived server-side from `ai_inventory` + activity). Absent/false = not
   * used → the control is not-applicable.
   */
  usage: Partial<Record<EndpointControlKey, boolean>>;
  health: EndpointHealthSignals;
  /** Server "now" as an RFC3339 instant (staleness reference). */
  nowIso: string;
  /** Attestation-staleness window in ms; defaults to {@link READINESS_ATTESTATION_STALE_MS}. */
  stalenessMs?: number;
}

export interface ReadinessResult {
  verdict: RolloutReadinessVerdict;
  /** Per-control display status over the keys present in `usage`/`controls`. */
  controlStatuses: Partial<Record<EndpointControlKey, ControlDisplayStatus>>;
  /** Controls that are used but unprotected (the actionable gaps). */
  gaps: EndpointControlKey[];
  /** True when attestation is missing or older than the staleness window. */
  stale: boolean;
  /** True when every universal-health signal passes. */
  healthOk: boolean;
}

/**
 * Default attestation-staleness window (15 min). The P5 service MAY override
 * via `stalenessMs`; the contract ships a sensible default so the fixtures are
 * self-contained.
 */
export const READINESS_ATTESTATION_STALE_MS = 15 * 60 * 1000;

/** States that count as "the used tool is protected". */
const PROTECTED_STATES: readonly EndpointControlState[] = ['active', 'monitoring'];
/** States that count as "used but NOT protected" (a real gap). */
const UNPROTECTED_STATES: readonly EndpointControlState[] = [
  'inactive',
  'degraded',
];

/** All keys mentioned across `usage` and `controls`, de-duplicated & ordered. */
function relevantKeys(input: ComputeReadinessInput): EndpointControlKey[] {
  const seen = new Set<EndpointControlKey>();
  for (const k of Object.keys(input.usage) as EndpointControlKey[]) seen.add(k);
  for (const k of Object.keys(input.controls) as EndpointControlKey[]) seen.add(k);
  return [...seen];
}

/**
 * Per-control display status for ONE control, given whether its tool is used
 * and its attested report. See the honesty contract at the top of this file.
 */
export function controlDisplayStatus(
  used: boolean,
  report: EndpointControlReport | undefined,
): ControlDisplayStatus {
  if (!used) return 'not-applicable';
  // Used but the platform can't host the control → not a gap.
  if (report && report.state === 'unsupported') return 'not-applicable';
  if (report && PROTECTED_STATES.includes(report.state)) return 'protected';
  if (!report) return 'unprotected-used'; // used + never attested → red
  if (UNPROTECTED_STATES.includes(report.state)) return 'unprotected-used';
  // report.state === 'unknown'
  return 'unknown';
}

/**
 * Canonical rollout-readiness computation. Deterministic + pure.
 *
 * Verdict precedence (worst wins):
 *   1. !installed                              → 'unknown'  (never attested)
 *   2. any universal-health signal false       → 'not-ready'
 *   3. stale attestation                        → 'unknown'
 *   4. any used control unprotected             → 'at-risk'
 *   5. any used control state unknown           → 'unknown'
 *   6. otherwise                                → 'ready'
 */
export function computeReadiness(input: ComputeReadinessInput): ReadinessResult {
  const stalenessMs = input.stalenessMs ?? READINESS_ATTESTATION_STALE_MS;

  const controlStatuses: Partial<Record<EndpointControlKey, ControlDisplayStatus>> =
    {};
  const gaps: EndpointControlKey[] = [];
  let anyUnprotected = false;
  let anyUnknownUsed = false;

  for (const key of relevantKeys(input)) {
    const used = input.usage[key] === true;
    const status = controlDisplayStatus(used, input.controls[key]);
    controlStatuses[key] = status;
    if (status === 'unprotected-used') {
      anyUnprotected = true;
      gaps.push(key);
    } else if (status === 'unknown') {
      anyUnknownUsed = true;
    }
  }

  const h = input.health;
  const healthOk =
    h.installed &&
    h.online &&
    h.policySynced &&
    h.evidenceIntact &&
    h.noActiveBypass;

  const stale = isStale(input.attestedAt, input.nowIso, stalenessMs);

  let verdict: RolloutReadinessVerdict;
  if (!h.installed) {
    verdict = 'unknown';
  } else if (!healthOk) {
    verdict = 'not-ready';
  } else if (stale) {
    verdict = 'unknown';
  } else if (anyUnprotected) {
    verdict = 'at-risk';
  } else if (anyUnknownUsed) {
    verdict = 'unknown';
  } else {
    verdict = 'ready';
  }

  return { verdict, controlStatuses, gaps, stale, healthOk };
}

/** True when `attestedAt` is null/invalid or older than `stalenessMs`. */
export function isStale(
  attestedAt: string | null,
  nowIso: string,
  stalenessMs: number,
): boolean {
  if (!attestedAt) return true;
  const attested = Date.parse(attestedAt);
  const now = Date.parse(nowIso);
  if (Number.isNaN(attested) || Number.isNaN(now)) return true;
  return now - attested > stalenessMs;
}

/**
 * Team-level rollup: a Team is 'ready' only when EVERY member endpoint is
 * 'ready'. Otherwise the worst member verdict surfaces (not-ready > at-risk >
 * unknown > ready). An empty Team is 'unknown' (nothing to attest to).
 */
export function rollupTeamReadiness(
  memberVerdicts: readonly RolloutReadinessVerdict[],
): RolloutReadinessVerdict {
  if (memberVerdicts.length === 0) return 'unknown';
  const rank: Record<RolloutReadinessVerdict, number> = {
    'not-ready': 3,
    'at-risk': 2,
    unknown: 1,
    ready: 0,
  };
  let worst: RolloutReadinessVerdict = 'ready';
  for (const v of memberVerdicts) {
    if (rank[v] > rank[worst]) worst = v;
  }
  return worst;
}
