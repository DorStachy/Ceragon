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

import {
  ENDPOINT_CONTROL_KEYS,
  type EndpointControlKey,
  type EndpointControlReport,
  type EndpointControlState,
} from './endpoint-controls-contract';
import type {
  GovernanceCapabilityId,
  GovernanceCapabilityProjection,
} from './governance-profile-contract';

/** Endpoint-level rollout verdict. Backend drops the go/no-go framing. */
export const ROLLOUT_READINESS_VERDICTS = [
  'ready',
  'at-risk',
  'not-ready',
  'unknown',
] as const;

export type RolloutReadinessVerdict =
  (typeof ROLLOUT_READINESS_VERDICTS)[number];

/**
 * Per-control display status shown uniformly for every endpoint.
 *
 * F6 — `self-reported` is a DISTINCT, NON-GREEN status. It exists because
 * `protected` used to be derived from `report.state` alone, and `report` is the
 * endpoint's own attestation (`Installers/internal/daemon/controls_attest.go`
 * inspects the box and says "active"). A compromised — or merely broken —
 * endpoint could therefore declare its own protection and the console painted a
 * green dot for it. Cross-cutting rule 6: a runtime that cannot govern must
 * never report compliant.
 */
export const CONTROL_DISPLAY_STATUSES = [
  'protected',
  'self-reported',
  'unprotected-used',
  'not-applicable',
  'unknown',
] as const;

export type ControlDisplayStatus = (typeof CONTROL_DISPLAY_STATUSES)[number];

/**
 * F6 — which profile capability's certificate would VERIFY each control.
 *
 * Server-side verification of a control means the SERVER holds a bound,
 * currently-active capability certificate for the capability that governs it —
 * i.e. the same profile-certificate evidence the console already narrates as
 * *"The control self-reports active, but its profile certificate is not
 * verified."* (`self-attestation-without-profile-certificate`).
 */
export const CONTROL_PROFILE_CAPABILITY = {
  proxy: 'web-ai.request-path',
  hooks: 'runtime.claude-code',
  packageGate: 'package.endpoint-lite',
  push: 'code-security.full-scan',
  webAiGuard: 'release.web-ai-guard',
  mcp: 'mcp.live-tool-calls',
} as const satisfies Record<EndpointControlKey, GovernanceCapabilityId>;

/** The one reason code the console renders for `self-reported`. */
export const SELF_REPORTED_CONTROL_REASON =
  'self-attestation-without-profile-certificate';

/**
 * Derive the per-control SERVER-SIDE verification map from the governance
 * profile projection. This is the ONE definition; both `computeReadiness`
 * consumers read it rather than growing a second predicate.
 *
 * Three-valued in spirit, exactly like item A6's `metadata.monitored`: a control
 * is `true` only on positive server-held evidence, `false` when the profile
 * evaluated its governing capability and did NOT certify it, and the key is
 * OMITTED when the capability is absent from the projection entirely — a `false`
 * the server did not earn is never fabricated, and an absent key reads as
 * unverified at the call site without pretending the server checked.
 *
 * `not-governed` capabilities carry `profileSatisfied: true` because they are
 * OUTSIDE the selected profile. That is an exemption, never a verification, so
 * `required` is part of the predicate.
 */
export function deriveControlVerification(
  capabilities: readonly Pick<
    GovernanceCapabilityProjection,
    'id' | 'required' | 'state' | 'profileSatisfied'
  >[],
): Partial<Record<EndpointControlKey, boolean>> {
  const byId = new Map(capabilities.map((c) => [c.id, c] as const));
  const out: Partial<Record<EndpointControlKey, boolean>> = {};
  for (const key of ENDPOINT_CONTROL_KEYS) {
    const capability = byId.get(CONTROL_PROFILE_CAPABILITY[key]);
    if (!capability) continue; // unresolvable → key omitted, never a false
    out[key] =
      capability.required &&
      capability.profileSatisfied &&
      capability.state === 'active';
  }
  return out;
}

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
  /**
   * F6 — whether the SERVER can independently verify each control, derived by
   * {@link deriveControlVerification} from the governance profile projection.
   * Absent/false = the server holds no certificate for the governing capability,
   * so an `active` self-report reads `self-reported`, never `protected`.
   */
  verification: Partial<Record<EndpointControlKey, boolean>>;
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
 * Per-control display status for ONE control, given whether its tool is used,
 * its ATTESTED (endpoint self-reported) state, and whether the SERVER can
 * independently verify it. See the honesty contract at the top of this file.
 *
 * F6 — `verified` is the third input and it is REQUIRED for `protected`. The
 * endpoint's `report` is its own claim about itself; without server-side
 * corroboration the honest reading of "active" is `self-reported`.
 */
export function controlDisplayStatus(
  used: boolean,
  report: EndpointControlReport | undefined,
  verified: boolean,
): ControlDisplayStatus {
  if (!used) return 'not-applicable';
  // Used but the platform can't host the control → not a gap.
  if (report && report.state === 'unsupported') return 'not-applicable';
  if (report && PROTECTED_STATES.includes(report.state)) {
    return verified ? 'protected' : 'self-reported';
  }
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
 *   6. any used control only SELF-REPORTED      → 'unknown'  (F6, never 'ready')
 *   7. otherwise                                → 'ready'
 */
export function computeReadiness(input: ComputeReadinessInput): ReadinessResult {
  const stalenessMs = input.stalenessMs ?? READINESS_ATTESTATION_STALE_MS;

  const controlStatuses: Partial<Record<EndpointControlKey, ControlDisplayStatus>> =
    {};
  const gaps: EndpointControlKey[] = [];
  let anyUnprotected = false;
  let anyUnknownUsed = false;
  let anySelfReported = false;

  for (const key of relevantKeys(input)) {
    const used = input.usage[key] === true;
    const status = controlDisplayStatus(
      used,
      input.controls[key],
      input.verification[key] === true,
    );
    controlStatuses[key] = status;
    if (status === 'unprotected-used') {
      anyUnprotected = true;
      gaps.push(key);
    } else if (status === 'unknown') {
      anyUnknownUsed = true;
    } else if (status === 'self-reported') {
      // NOT a gap: the control may well be doing its job. It is an unproven
      // claim, so it can never carry a `ready` verdict.
      anySelfReported = true;
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
  } else if (anyUnknownUsed || anySelfReported) {
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
