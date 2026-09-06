/**
 * RA-0 — §9.4 endpoint-level policy-integrity report + server-derived
 * convergence vocabulary.
 *
 * The endpoint attaches ONE bounded `policyIntegrity` block to
 * `EndpointControlsAttestation`. The block is GLOBAL: it is present even when
 * no AI runtime is installed, so "no runtime" is an honest zero rather than a
 * silent omission.
 *
 * HONESTY RULES this file makes structural:
 *   - the endpoint NEVER reports a "desired" value — desired/current authority
 *     is server-derived (see {@link ENDPOINT_CONVERGENCE_STATES});
 *   - an absent/malformed block yields `null`, and a row with no accepted
 *     observation reads `unknown` — NEVER `healthy`;
 *   - `MATCHED` alone is not green: it requires `VALID` plus a complete applied
 *     tuple plus report/verification data (mirrored as a DB CHECK in the
 *     `AddEndpointPolicyIntegrityState` migration);
 *   - `reportSequence` / `verifiedThroughSequence` are canonical uint64 DECIMAL
 *     STRINGS. Numbers are rejected outright so a float64 can never round one.
 *
 * PRIVACY INVARIANT: identifiers / enums / digests / canonical decimal strings /
 * RFC3339 timestamps ONLY.
 */

import {
  POLICY_CONTAINMENT_STATES,
  POLICY_INTEGRITY_STATES,
  POLICY_SIGNATURE_STATUSES,
  RUNTIME_INTEGRITY_CONTRACT_VERSION_MAX_LEN,
  isBundleDigest,
  isCanonicalUint64,
  isEvidenceStreamId,
  isIntegrityRfc3339,
  isIntegrityUuid,
  type PolicyContainmentState,
  type PolicyIntegrityState,
  type PolicySignatureStatus,
} from './runtime-integrity-intent-contract';

// ─── The wire shape (§9.4, verbatim) ────────────────────────────────────────

/** The applied-bundle tuple. ALL-OR-NONE: a partial tuple is rejected. */
export interface EndpointAppliedBundleTuple {
  /** Canonical uint64 decimal. */
  revision: string;
  /** `sha256:<64 hex>`. */
  digest: string;
  keyId: string;
  appliedAt: string;
}

/** The durable-evidence watermark this report is ordered against. */
export interface EndpointEvidenceWatermark {
  emitterStreamId: string;
  /** Canonical uint64 decimal; `0` is the genesis registration value. */
  verifiedThroughSequence: string;
}

/**
 * §9.4 — the endpoint-level policy-integrity report. One bounded block on
 * `EndpointControlsAttestation`.
 */
export interface EndpointPolicyIntegrityReport {
  schemaVersion: 1;
  /** Canonical uint64 decimal from the endpoint's hardened monotonic store. */
  reportSequence: string;
  integrityContractVersion: string;
  appliedBundle?: EndpointAppliedBundleTuple;
  signatureStatus: PolicySignatureStatus;
  state: PolicyIntegrityState;
  containment: PolicyContainmentState;
  verifiedAt?: string | null;
  activeEpisodeId?: string | null;
  evidenceWatermark: EndpointEvidenceWatermark;
  criticalEvidencePendingDepth: number;
  oldestCriticalEvidenceAt?: string | null;
  /**
   * The endpoint's own word on whether it can record evidence AT ALL. `null`
   * or absent means its evidence spool is open; a slug (for example
   * `spool-corrupt-quarantined`, `spool-held-by-another-process`,
   * `spool-open-failed`) means every audit obligation on that endpoint is
   * currently failing and no bundle-application receipt can be produced.
   *
   * Additive on purpose: an agent that predates this field sends nothing and
   * is read exactly as before. It exists because an endpoint whose spool would
   * not open stayed `healthy` in `endpoint_evidence_health` for hours
   * (2026-09-06): that row is derived from the DELIVERY stream, and an endpoint
   * that cannot open its spool delivers nothing, so nothing ever contradicted
   * the last verdict. The heartbeat is the one channel such an endpoint still
   * has, so the claim rides here.
   */
  evidenceSpoolCause?: string | null;
}

/** Slug charset for {@link EndpointPolicyIntegrityReport.evidenceSpoolCause}. */
export const EVIDENCE_SPOOL_CAUSE_MAX_LEN = 64;
const EVIDENCE_SPOOL_CAUSE_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/;

/**
 * Rebuild the optional evidence-spool cause. Returns:
 *   - `null` when absent or explicitly null (spool open);
 *   - the slug when present and well-formed;
 *   - `undefined` when present but malformed — the caller rejects the report,
 *     because a malformed claim from the endpoint is not a claim we can act on.
 */
export function normalizeEvidenceSpoolCause(
  input: unknown,
): string | null | undefined {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (s.length === 0 || s.length > EVIDENCE_SPOOL_CAUSE_MAX_LEN) return undefined;
  if (!EVIDENCE_SPOOL_CAUSE_RE.test(s)) return undefined;
  return s;
}

// ─── Server-derived convergence (§9.4) ──────────────────────────────────────

/**
 * The DERIVED read states shared by Rollout Readiness and Protection Depth.
 * ONLY `healthy` may map to the green `active` UI token; everything else is a
 * distinct honest non-green outcome. `unknown` is the floor for a row with no
 * accepted observation — an unobserved endpoint must never read green.
 */
export const ENDPOINT_CONVERGENCE_STATES = [
  'healthy',
  'pending-refresh',
  'mismatch',
  'drifted',
  'repairing',
  'contained',
  'stale',
  'unknown',
] as const;
export type EndpointConvergenceState =
  (typeof ENDPOINT_CONVERGENCE_STATES)[number];

/**
 * The ONE green token. Exported as a constant so no consumer can grow a second
 * literal `'healthy'` comparison that later drifts.
 */
export const ENDPOINT_CONVERGENCE_GREEN: EndpointConvergenceState = 'healthy';

/**
 * The honest floor a persisted row with no accepted integrity observation
 * derives to. Product rule (RA-0 exit criterion): old endpoint rows serialize
 * as `unknown`, never `healthy`.
 */
export const ENDPOINT_CONVERGENCE_FLOOR: EndpointConvergenceState = 'unknown';

// ─── Bounds ─────────────────────────────────────────────────────────────────

/** Bound on `criticalEvidencePendingDepth` (a spool depth, not a payload). */
export const CRITICAL_EVIDENCE_PENDING_DEPTH_MAX = 1_000_000;

/** Bound on the key-ID string (a UUID today; kept as a bounded string). */
export const INTEGRITY_KEY_ID_MAX_LEN = 64;

/**
 * Serialized-size ceiling for the `policyIntegrity` block. Anything larger is
 * rejected outright (fail closed) rather than truncated — an oversize block is
 * evidence of a bug or an attack, not something to salvage.
 */
export const ENDPOINT_POLICY_INTEGRITY_MAX_BYTES = 4096;

// ─── Membership guards ──────────────────────────────────────────────────────

export function isPolicySignatureStatus(v: unknown): v is PolicySignatureStatus {
  return (
    typeof v === 'string' &&
    (POLICY_SIGNATURE_STATUSES as readonly string[]).includes(v)
  );
}

export function isPolicyIntegrityState(v: unknown): v is PolicyIntegrityState {
  return (
    typeof v === 'string' &&
    (POLICY_INTEGRITY_STATES as readonly string[]).includes(v)
  );
}

export function isPolicyContainmentState(
  v: unknown,
): v is PolicyContainmentState {
  return (
    typeof v === 'string' &&
    (POLICY_CONTAINMENT_STATES as readonly string[]).includes(v)
  );
}

export function isEndpointConvergenceState(
  v: unknown,
): v is EndpointConvergenceState {
  return (
    typeof v === 'string' &&
    (ENDPOINT_CONVERGENCE_STATES as readonly string[]).includes(v)
  );
}

// ─── Rebuild / validate (fail closed) ───────────────────────────────────────

/**
 * UTF-8 byte length WITHOUT a Node `Buffer` dependency — this contract is also
 * vendored into browser bundles, so it must stay runtime-neutral.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.codePointAt(i) as number;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else {
      bytes += 4;
      i += 1; // surrogate pair consumed
    }
  }
  return bytes;
}

function boundedString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length === 0 || s.length > max) return null;
  return s;
}

/**
 * Rebuild the ALL-OR-NONE applied-bundle tuple. Returns:
 *   - `undefined` when the tuple is absent (a legitimate never-applied state);
 *   - `null` when the tuple is PRESENT but incomplete/malformed — the caller
 *     must reject the whole report rather than persist a half tuple.
 */
export function normalizeAppliedBundleTuple(
  input: unknown,
): EndpointAppliedBundleTuple | null | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const keyId = boundedString(src.keyId, INTEGRITY_KEY_ID_MAX_LEN);
  if (
    !isCanonicalUint64(src.revision) ||
    !isBundleDigest(src.digest) ||
    !keyId ||
    !isIntegrityRfc3339(src.appliedAt)
  ) {
    return null;
  }
  return {
    revision: src.revision,
    digest: src.digest,
    keyId,
    appliedAt: src.appliedAt,
  };
}

/**
 * §9.4 — `MATCHED` requires `VALID` signature PLUS a complete applied tuple
 * PLUS a `verifiedAt`. This is the SAME predicate the migration encodes as a
 * table CHECK, so an endpoint cannot claim MATCHED on an empty tuple and the
 * database cannot hold a row that claims it either.
 */
export function matchedRequirementsSatisfied(
  report: Pick<
    EndpointPolicyIntegrityReport,
    'state' | 'signatureStatus' | 'appliedBundle' | 'verifiedAt'
  >,
): boolean {
  if (report.state !== 'MATCHED') return true;
  return (
    report.signatureStatus === 'VALID' &&
    !!report.appliedBundle &&
    typeof report.verifiedAt === 'string' &&
    report.verifiedAt.length > 0
  );
}

/**
 * Normalize an UNTRUSTED `policyIntegrity` block into a persist-safe report.
 *
 * FAIL CLOSED — returns `null` (report rejected, endpoint integrity becomes
 * unknown) when ANY of these hold:
 *   - the input is not an object, or serializes larger than
 *     {@link ENDPOINT_POLICY_INTEGRITY_MAX_BYTES};
 *   - `schemaVersion` is not exactly `1`;
 *   - `reportSequence` / `verifiedThroughSequence` are not canonical uint64
 *     decimal STRINGS (a JSON number is rejected, never coerced);
 *   - any of the three enums is unknown (no coercion to a default);
 *   - the applied tuple is present but incomplete;
 *   - `state === 'MATCHED'` without VALID + applied tuple + verifiedAt;
 *   - the evidence stream ID fails the shipped stream-ID contract;
 *   - `criticalEvidencePendingDepth` is not a non-negative safe integer.
 *
 * Rebuild is field-by-field — the input object is NEVER spread — so an unknown
 * key can never reach the store.
 */
export function normalizeEndpointPolicyIntegrityReport(
  input: unknown,
): EndpointPolicyIntegrityReport | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return null;
  }
  if (
    typeof serialized !== 'string' ||
    utf8ByteLength(serialized) > ENDPOINT_POLICY_INTEGRITY_MAX_BYTES
  ) {
    return null;
  }

  const src = input as Record<string, unknown>;
  if (src.schemaVersion !== 1) return null;
  if (!isCanonicalUint64(src.reportSequence)) return null;

  const contractVersion = boundedString(
    src.integrityContractVersion,
    RUNTIME_INTEGRITY_CONTRACT_VERSION_MAX_LEN,
  );
  if (!contractVersion) return null;

  if (
    !isPolicySignatureStatus(src.signatureStatus) ||
    !isPolicyIntegrityState(src.state) ||
    !isPolicyContainmentState(src.containment)
  ) {
    return null;
  }

  const appliedBundle = normalizeAppliedBundleTuple(src.appliedBundle);
  if (appliedBundle === null) return null;

  const watermarkSrc = src.evidenceWatermark;
  if (
    !watermarkSrc ||
    typeof watermarkSrc !== 'object' ||
    Array.isArray(watermarkSrc)
  ) {
    return null;
  }
  const wm = watermarkSrc as Record<string, unknown>;
  if (
    !isEvidenceStreamId(wm.emitterStreamId) ||
    !isCanonicalUint64(wm.verifiedThroughSequence)
  ) {
    return null;
  }

  const depth = src.criticalEvidencePendingDepth;
  if (
    typeof depth !== 'number' ||
    !Number.isSafeInteger(depth) ||
    depth < 0 ||
    depth > CRITICAL_EVIDENCE_PENDING_DEPTH_MAX
  ) {
    return null;
  }

  let verifiedAt: string | null = null;
  if (src.verifiedAt !== undefined && src.verifiedAt !== null) {
    if (!isIntegrityRfc3339(src.verifiedAt)) return null;
    verifiedAt = src.verifiedAt;
  }

  let activeEpisodeId: string | null = null;
  if (src.activeEpisodeId !== undefined && src.activeEpisodeId !== null) {
    if (!isIntegrityUuid(src.activeEpisodeId)) return null;
    activeEpisodeId = src.activeEpisodeId;
  }

  let oldestCriticalEvidenceAt: string | null = null;
  if (
    src.oldestCriticalEvidenceAt !== undefined &&
    src.oldestCriticalEvidenceAt !== null
  ) {
    if (!isIntegrityRfc3339(src.oldestCriticalEvidenceAt)) return null;
    oldestCriticalEvidenceAt = src.oldestCriticalEvidenceAt;
  }

  const evidenceSpoolCause = normalizeEvidenceSpoolCause(src.evidenceSpoolCause);
  if (evidenceSpoolCause === undefined) return null;

  const report: EndpointPolicyIntegrityReport = {
    schemaVersion: 1,
    reportSequence: src.reportSequence,
    integrityContractVersion: contractVersion,
    signatureStatus: src.signatureStatus,
    state: src.state,
    containment: src.containment,
    verifiedAt,
    activeEpisodeId,
    evidenceWatermark: {
      emitterStreamId: wm.emitterStreamId,
      verifiedThroughSequence: wm.verifiedThroughSequence,
    },
    criticalEvidencePendingDepth: depth,
    oldestCriticalEvidenceAt,
    evidenceSpoolCause,
  };
  if (appliedBundle) report.appliedBundle = appliedBundle;

  if (!matchedRequirementsSatisfied(report)) return null;
  return report;
}
