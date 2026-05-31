// ═══════════════════════════════════════════════════════════════════════════
// Phase 6 §6.0 — Scanner findings V2 contract.
//
// Adds an additive `SecurityFindingV2` shape that workers (Static and
// Sandbox) emit alongside their existing legacy `findings[]` array.
// Phase 6 must NOT change verdicting, scoring, or suppression — it adds
// a parallel evidence channel for developer visibility:
//
//   - what happened       → riskSummary
//   - why it matters      → whyItMatters
//   - what evidence proves it → evidence[]
//   - what action to take → developerAction (+ remediation)
//
// Workers continue to emit legacy `findings[]` exactly as today; the
// verdict path consumes legacy findings only. Fields like `runtimeEvents[].id`
// already on the wire are referenced by id rather than duplicated, so
// frontend hydrates from the same source of truth.
//
// Backward compatibility is load-bearing — `EMIT_SECURITY_FINDINGS_V2=false`
// (the default) means workers do not emit `securityFindings`; backend
// stores it defensively when present; frontend gates rendering behind
// `NEXT_PUBLIC_FRONTEND_SECURITY_FINDINGS_V2`. Rollback = clear flag.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Channel that produced the finding. Mirrors the worker pipeline that
 * emitted it — used by the UI to badge findings (e.g., "static eval rule"
 * vs "runtime credential access" vs "OSV CVE").
 */
export type FindingScannerSource =
  | 'static'
  | 'sandbox'
  | 'policy'
  | 'vulnerability'
  | 'reputation'
  | 'ai';

/**
 * Coarse categorization that drives UI grouping AND validates evidence
 * shape (e.g., a `vulnerability` finding requires a `vulnerability` evidence
 * entry; a `credential-access` finding typically carries `runtime-event`
 * evidence).
 */
export type FindingBehaviorClass =
  | 'credential-access'
  | 'exfiltration'
  | 'downloader'
  | 'reverse-shell'
  | 'defense-evasion'
  | 'persistence'
  | 'sandbox-evasion'
  | 'obfuscation'
  | 'vulnerability'
  | 'license-policy'
  | 'reputation'
  | 'unknown';

/**
 * One piece of evidence that backs a `SecurityFindingV2`. The
 * discriminated union keeps the shape minimal — runtime-event entries
 * reference `runtimeEvents[].id` on the same payload rather than
 * duplicating the event fields, so the frontend hydrates from one
 * source and there is no drift risk.
 */
export type FindingEvidence =
  | RuntimeEventEvidence
  | SourceEvidence
  | VulnerabilityEvidence
  | ReputationEvidence;

export interface RuntimeEventEvidence {
  kind: 'runtime-event';
  /**
   * MUST resolve to an existing `runtimeEvents[].id` on the same
   * WorkerResult. The frontend hydrates display fields (process,
   * command, network destination, contentPreview) from the
   * RuntimeEvent record — duplicating them here would risk drift.
   * Backend §6.3 normalizer enforces the resolve.
   */
  eventId: string;
  /** Optional caller-supplied annotations only — not authoritative. */
  processPath?: string[];
  relativeMs?: number;
  correlatedEventIds?: string[];
  note?: string;
}

export interface SourceEvidence {
  kind: 'source';
  file: string;
  line: number;
  endLine?: number;
  /**
   * The matched code excerpt. Same redaction floor as legacy
   * `Finding.snippet` — secret patterns from
   * `Sandbox-Worker/src/telemetry/data-flow-tracker.ts` are scrubbed.
   */
  snippet: string;
  /** ±15-line source window for context, already produced by the static analyzer. */
  sourceContext?: string;
  sourceStartLine?: number;
  matchRange?: { startColumn: number; endColumn: number };
}

export interface VulnerabilityEvidence {
  kind: 'vulnerability';
  /** Primary advisory ID — OSV / GHSA / CVE. */
  advisoryId: string;
  /** Cross-reference IDs. Empty array if none, never undefined. */
  aliases: string[];
  affectedRange?: string;
  fixedIn?: string;
  directness?: 'direct' | 'transitive' | 'unknown';
  dependencyPath?: string[];
  references?: string[];
  // P0-4 (2026-05-18): reviewer fields so an advisory renders as a
  // proper advisory card (id/aliases/installed version/matched range/
  // fix/source DB/refs/severity/policy) instead of a fake `package.json:0`
  // source row. All optional/additive — backward-compatible.
  /** Scanned package name. */
  packageName?: string;
  /** Package ecosystem (npm/pypi/cargo/go). */
  ecosystem?: string;
  /** The concrete scanned/installed version the advisory was matched against. */
  installedVersion?: string;
  /** Advisory database the row came from. */
  source?: 'osv' | 'ghsa' | 'npm';
  /** Advisory severity. */
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cvssScore?: number;
  cvssVector?: string;
  /** Range that actually matched the scanned version (P0-2). */
  matchedAffectedRange?: string;
  /** Fix of the matched range (range-specific, not the global MAX). */
  matchedFixedIn?: string;
  /** OSV `withdrawn` / GHSA withdrawn timestamp, when retracted. */
  withdrawn?: string;
  /** Why this advisory was excluded from active findings (P0-2 audit). */
  suppressedReason?: 'withdrawn' | 'disputed';
  /** Backend-computed policy action, when known. */
  policyAction?: string;
}

export interface ReputationEvidence {
  kind: 'reputation';
  /** Signal name — e.g., 'edit-distance', 'maintainer-age-days'. */
  signal: string;
  value: string | number | boolean;
  /** Baseline used for comparison — e.g., the intended package name. */
  baseline?: string;
  explanation: string;
}

/**
 * MITRE ATT&CK mapping. Aligns with the existing
 * `aiVerdict.mitreTactics` shape on the SandboxWorkerResult so the UI
 * can render both V2 stories and AI calibration tactics with one
 * component.
 */
export interface MitreMapping {
  /** ATT&CK tactic ID, e.g., 'TA0010' for Exfiltration. */
  tacticId: string;
  /** Human-readable tactic name, e.g., 'Exfiltration'. */
  tacticName: string;
  /** ATT&CK technique IDs, e.g., ['T1071.001']. */
  techniques?: string[];
  techniqueNames?: string[];
  /** Free-text justification — what evidence supports this mapping. */
  evidence: string;
}

/**
 * Sandbox-only ordered story tying together a sequence of RuntimeEvents
 * by id. The frontend renders these as a compact timeline above the
 * aggregate counts. Static workers do not emit RuntimeBehaviorStory
 * (only Sandbox-Worker has runtime telemetry).
 */
export interface RuntimeBehaviorStory {
  /** Stable hash of the constituent eventIds + behaviorClass. */
  storyId: string;
  /** Human title — non-SNAKE_CASE; e.g., 'Postinstall reads .npmrc and exfiltrates'. */
  title: string;
  behaviorClass: FindingBehaviorClass;
  summary: string;
  /** Ordered RuntimeEvent.ids — frontend resolves to display the timeline. */
  timelineEventIds: string[];
  /** Process chain that hosted the behavior — e.g., ['node', 'sh -c', 'curl']. */
  processPath: string[];
  /**
   * Optional source trigger that started this story — useful for
   * 'install-time' vs 'import-time' distinction.
   */
  sourceTrigger?: { file: string; lifecyclePhase?: string; command?: string };
  mitre?: MitreMapping[];
  sandbox: {
    executionMode?: string;
    quality?: string;
    coverageMet?: boolean;
    /** Events that the kernel/seccomp blocked rather than allowed. */
    blockedEventIds: string[];
  };
}

/**
 * The V2 finding. Coexists with the legacy `Finding` array — both are
 * emitted by workers (when the `EMIT_SECURITY_FINDINGS_V2` flag is on)
 * and the legacy array still drives verdicts/scoring. V2 drives UI
 * rendering when the frontend flag is on, and is the source of truth
 * for the new evidence panel + runtime story.
 *
 * §6.0 mechanical invariants (enforced in §6.3 normalizer + §6.5 tests):
 *   • title, riskSummary, whyItMatters, developerAction non-empty;
 *     SNAKE_CASE titles rejected.
 *   • severity ∈ {HIGH, CRITICAL} or driving WARN/BLOCK ⇒
 *     evidence.length ≥ 1, confidence.reasons.length ≥ 1, developerAction non-empty.
 *   • runtime-event evidence references a real runtimeEvents[].id on
 *     the same payload (verified at backend ingest).
 *   • source evidence references a file present in extraction
 *     metadata (or carries inline sourceContext).
 *   • legacyCode matches the value carried on the parallel findings[]
 *     entry so backend/frontend can correlate.
 */
export interface SecurityFindingV2 {
  /**
   * Stable hash of (legacyCode | source | dedupeKey). Used by the
   * backend normalizer for de-duplication and by the frontend for
   * React keys. NOT a database id.
   */
  findingId: string;
  /**
   * Matches the legacy `Finding.code` so adapters can map back.
   * Required so the parallel-channel model can be reconciled.
   */
  legacyCode: string;
  scannerSource: FindingScannerSource;
  /** Human title — non-SNAKE_CASE. Driven by the shared finding-copy catalog (§6.4). */
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  behaviorClass: FindingBehaviorClass;
  /** "What happened" prose. Rendered as the lead in the evidence panel. */
  riskSummary: string;
  /** "Why it matters" prose — security/business impact. */
  whyItMatters: string;
  /** "Developer action" — concrete next step the engineer can take. */
  developerAction: string;
  /** Confidence triad — score in [0,1], qualitative level, ≥1 reason. */
  confidence: {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    reasons: string[];
  };
  /** ≥1 entry for severity ≥ HIGH or for findings driving WARN/BLOCK. */
  evidence: FindingEvidence[];
  /** Sandbox-only — present when the finding has correlated runtime telemetry. */
  runtimeStory?: RuntimeBehaviorStory;
  /** Optional remediation — fixed version, command, free text. */
  remediation?: { fixedVersion?: string; command?: string; text: string };
  /**
   * When a finding is technically present but contextually benign —
   * e.g., a sealed-registry download — the worker can attach the
   * justification so the UI renders it as a calibrated low-severity
   * note rather than a false alarm.
   */
  falsePositiveContext?: {
    benignReasons: string[];
    trustedPackageAdjustment?: string;
  };
}

/**
 * The set of `SecurityFindingV2[]` flag-controlled emission key. When
 * `process.env.EMIT_SECURITY_FINDINGS_V2 === 'true'`, workers emit
 * `securityFindings` alongside legacy findings. Otherwise the field is
 * absent from the worker payload entirely.
 */
export const EMIT_SECURITY_FINDINGS_V2_ENV_KEY = 'EMIT_SECURITY_FINDINGS_V2';

/**
 * Frontend gating env key. When `process.env.NEXT_PUBLIC_FRONTEND_SECURITY_FINDINGS_V2 === 'true'`,
 * the frontend uses V2 findings to drive display; otherwise the legacy
 * adapter path is used unchanged.
 */
export const FRONTEND_SECURITY_FINDINGS_V2_ENV_KEY =
  'NEXT_PUBLIC_FRONTEND_SECURITY_FINDINGS_V2';

/**
 * Type guard: returns true iff a value claims to be an
 * `EMIT_SECURITY_FINDINGS_V2` opt-in. Defensive — `'1'` and other
 * truthy strings are NOT accepted; only the literal `'true'`.
 */
export function isEmitSecurityFindingsV2Enabled(
  envValue: string | undefined,
): boolean {
  return envValue === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// Finding Quality Gate metadata contract (2026-05-31 code-scan-finding-quality
// -gate plan, Frozen Wire Contracts #1/#3/#4).
//
// These describe the OPTIONAL, backward-compatible JSON shapes carried under
// `github_findings.metadata.quality`, `.contextEvidence`, and `.dependency`.
// They are NOT part of the SecurityFindingV2 channel above — they annotate the
// existing legacy `Finding` rows.
//
//   • `metadata.quality` — written by the Backend quality gate, read by the
//     Frontend, and filtered by Backend SQL. `customerVisible: false` means
//     the finding is INTERNAL and is excluded from every customer count/list.
//   • `metadata.contextEvidence` — written by the GitHub Action producer, read
//     by the Backend gate (with a legacy filePath/toolName/ruleId fallback).
//   • `metadata.dependency` — written by the scanner SCA producer, consumed by
//     the worker enrichment read and the Backend display normalizer.
//
// Every field is optional / additive so old workers, old scan rows, and
// partial deploys keep working ("absent quality ⇒ visible").
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The gate's classification of a finding for customer reporting.
 *  - REPORTABLE              — shown as-is.
 *  - REPORTABLE_WITH_CONTEXT — shown, but carries a context badge (e.g. test).
 *  - DOWNGRADED              — shown with a lowered display severity.
 *  - INTERNAL                — `customerVisible: false`; never counted/listed.
 */
export type FindingQualityDisposition =
  | 'REPORTABLE'
  | 'REPORTABLE_WITH_CONTEXT'
  | 'DOWNGRADED'
  | 'INTERNAL';

/** Where the finding's code lives — drives context-aware classification. */
export type FindingContextClass =
  | 'RUNTIME'
  | 'TEST'
  | 'FIXTURE'
  | 'EXAMPLE'
  | 'CANARY'
  | 'GENERATED'
  | 'VENDOR'
  | 'DOCS'
  | 'WORKFLOW'
  | 'LOCKFILE'
  | 'UNKNOWN';

/**
 * Compact authoritative quality annotation written under
 * `finding.metadata.quality`. The gate preserves raw provenance
 * (`rawTitle`/`rawSeverity`/`rawConfidence`) before writing any display field
 * so re-running the gate is idempotent (display fields are always derived from
 * the preserved raw values, never from the current mutated values).
 */
export type FindingQualityMetadata = {
  schemaVersion: 1;
  customerVisible: boolean;
  disposition: FindingQualityDisposition;
  context: FindingContextClass;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reasonCodes: string[];
  displayTitle?: string;
  displayCategory?: string;
  displaySeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  rawTitle?: string;
  rawSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  rawConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
};

/**
 * Producer-side context evidence written under
 * `finding.metadata.contextEvidence`. Consumed by the Backend gate as an INPUT
 * hint; the gate recomputes the authoritative `customerVisible`/disposition.
 */
export type FindingContextEvidence = {
  schemaVersion: 1;
  pathClass: FindingContextClass;
  signals: string[];
  isRuntimeReachable: boolean;
  isSyntheticSecret?: boolean;
};

/**
 * Nested dependency metadata written under `finding.metadata.dependency` for
 * SCA findings. `disposition` distinguishes a known-vulnerable advisory match
 * from actual malware evidence so customer wording stays accurate.
 */
export type DependencyFindingMetadata = {
  dependency?: {
    packageName?: string;
    packageVersion?: string;
    ecosystem?:
      | 'npm'
      | 'pypi'
      | 'maven'
      | 'go'
      | 'cargo'
      | 'rubygems'
      | 'nuget'
      | 'unknown';
    dependencyType?: 'direct' | 'transitive' | 'unknown';
    dependencyScope?: 'runtime' | 'development' | 'optional' | 'unknown';
    lockfilePath?: string;
    disposition?: 'KNOWN_VULNERABLE' | 'MALWARE' | 'HIGH_RISK' | 'NEEDS_REVIEW';
    advisoryIds?: string[];
  };
};
