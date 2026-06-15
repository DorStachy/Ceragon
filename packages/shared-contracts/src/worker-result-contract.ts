// ════════════════════════════════════════════════════════════════════════
// Canonical worker→backend result contract (P0-2, 2026-05-14 stabilization).
//
// This module is the single source of truth for the shape of payloads
// POSTed to `/api/v1/worker/results`. The Backend `WorkerResultDto`
// (NestJS class-validator) and the worker-side Zod schemas (Static-Worker,
// Sandbox-Worker) each enforce the same wire shape; this file pins the
// allowlists those validators must agree on.
//
// Bump policy: any change to this module that adds, removes, or renames
// a top-level key MUST bump `WORKER_RESULT_CONTRACT_VERSION`. The Backend
// vendored snapshot at `Backend/src/jobs/contracts/worker-result-contract.snapshot.ts`
// must be bumped in lockstep, and the parity test
// `Backend/src/jobs/contracts/worker-result-contract.snapshot.spec.ts`
// will fail until both versions match.
//
// This is a TS-only / dependency-free module: no Zod, no class-validator,
// no Ajv. Workers and Backend may consume it through the
// inlined-types-with-parity-test pattern that the rest of the codebase
// already uses (see Backend/src/packages/services/scanner-cache-schema.spec.ts
// and Backend/src/packages/services/finding-evidence-normalizer.parity.spec.ts).
// ════════════════════════════════════════════════════════════════════════

/**
 * Authoritative wire-contract version. Bump on add/remove/rename of any
 * key in `ALLOWED_TOP_LEVEL_RESULT_KEYS` or `ALLOWED_TOP_LEVEL_FINDING_KEYS`.
 *
 * Wave history:
 *   v1 — Initial executable contract introduced by P0-2 of the
 *        2026-05-14 production stabilization plan. Mirrors the Backend
 *        `WorkerResultDto` and `FindingDto` whitelists at that date,
 *        plus the five transitional alias keys from P0-1 (evidenceTier,
 *        confirmedSourceToSink, fileContext, scriptName, phase) and the
 *        SQS-trim markers (findingsTruncated, filePathCount). The five
 *        aliases are removed when the SCANNER_CACHE_SCHEMA_VERSION v8
 *        bump (P0-5) clears in production AND the
 *        `worker_top_level_evidence_alias` CloudWatch counter has been
 *        zero for one release cycle.
 */
// v2 (2026-05-18, plan P0-2): added top-level `metadata` envelope
// (`metadata.suppressedAdvisories` — withdrawn/disputed advisories excluded
// from active findings). Future audit buckets extend the same envelope.
// v3 (2026-06-04, P0-7): added top-level `digest` (result-swap binding digest).
// v4 (2026-06-07, Sandbox Artifact Identity): added `expectedIntegrity`,
//   `expectedSha256`, `artifactIdentityVerified`. (Canonical catches up to the
//   Backend snapshot here — these were added to the Backend snapshot at v3/v4
//   but the canonical was not bumped in lockstep until now.)
// v5 (2026-06-11, Transitive Malware Detection): added `transitiveInstallSet`
//   (the deduped runtime+peer+optional install-set the Backend coordinator
//   evaluates worst-wins) and `bundledDepsPresent` (bundled-node_modules flag).
// v6 (2026-06-15, FP Phase 7 — SCA evidence disposition): added optional
//   top-level `evidenceClass`. The Static-Worker (7.2) emits the disposition
//   of the strongest SCA evidence it found; the Backend (7.5) reads it to gate
//   the MALICIOUS label (only VERIFIED_MALWARE is permitted to drive MALICIOUS;
//   a bare high risk score no longer escalates to MALICIOUS). Optional — absent
//   means a legacy/unknown producer and the Backend falls back to its prior
//   (score-based) behavior. See `WorkerResultEvidenceClass`.
export const WORKER_RESULT_CONTRACT_VERSION = 6 as const;

export type WorkerResultProducer = 'static-worker' | 'sandbox-worker';

/**
 * v6 (FP Phase 7): SCA evidence-disposition the Static-Worker emits for the
 * artifact and the Backend reads to gate the MALICIOUS label. Ordered roughly
 * strongest→weakest:
 *
 *   - `VERIFIED_MALWARE`     — confirmed-malicious evidence (threat-intel feed
 *     hit, confirmed source→sink exfil, known IoC). The ONLY class the Backend
 *     permits to drive a MALICIOUS verdict.
 *   - `KNOWN_VULNERABLE`     — a matched, applicable known CVE/advisory (not
 *     malware): vulnerable, not malicious.
 *   - `HIGH_RISK_HEURISTIC`  — heuristics/score say high-risk but no confirmed
 *     malware evidence. Suspicious, NOT MALICIOUS — caps at the high-risk band.
 *   - `REPUTATION_UNKNOWN`   — insufficient reputation/intel signal to dispose;
 *     unknown, not an accusation.
 *   - `CLEAN`                — analysis found no malicious or vulnerable evidence.
 *
 * Absent (`undefined`) means a legacy/unknown producer; the Backend keeps its
 * prior behavior for those.
 */
export type WorkerResultEvidenceClass =
  | 'VERIFIED_MALWARE'
  | 'KNOWN_VULNERABLE'
  | 'HIGH_RISK_HEURISTIC'
  | 'REPUTATION_UNKNOWN'
  | 'CLEAN';

/**
 * Allowed top-level keys on a `/api/v1/worker/results` payload. Anything
 * outside this set MUST be rejected by Backend's strict ValidationPipe
 * and SHOULD be rejected by the worker-side schema before submission.
 *
 * This list is intentionally exhaustive for the current wire — the
 * goal is to make a producer-side addition (or a Backend DTO removal)
 * a visible test failure rather than a silent 400 storm.
 *
 * NOTE on growth: when adding a new top-level result key, list it here
 * AND in Backend `WorkerResultDto` AND in both worker Zod schemas AND
 * bump `WORKER_RESULT_CONTRACT_VERSION`. The Backend snapshot version
 * pin enforces the bump.
 */
export const ALLOWED_TOP_LEVEL_RESULT_KEYS = [
  // Identity / coordinates
  'jobId',
  'ecosystem',
  'name',
  'version',
  'requestedVersion',
  'resolvedVersion',
  'integrity',
  'sha256',
  // v3 (P0-7): result-swap binding digest (the artifact integrity the worker
  // analyzed, echoed back so the result can be bound to the job).
  'digest',
  // v4 (Sandbox Artifact Identity): the expected anchor (from the job) echoed
  // verbatim for the backend reality-anchored gate.
  'expectedIntegrity',
  'expectedSha256',
  'artifactIdentityVerified',
  'artifactS3Key',
  'siteId',
  'tenantId',
  'agentId',
  'correlationId',
  'originalAnalysisId',
  'analysisType',
  'workerVersion',
  'verdictSource',

  // Verdict + score + status
  'riskScore',
  'verdict',
  'confidence',
  'blockReason',
  'verdictSummary',
  'signals',
  'inconclusiveReason',
  'coverage',
  'reputationTier',

  // Evidence channels
  'findings',
  'evidence',
  'evidenceUrl',
  'securityFindings',
  'securityFindingsTruncated',
  'runtimeEvents',

  // SQS-trim markers (added by Static-Worker trimPayloadForSQS)
  'findingsTruncated',
  'filePathCount',

  // Static analyzer outputs
  'binaryDetection',
  'obfuscationScore',
  'typosquat',
  'registryCollision',
  'iocs',
  'npmManifest',
  'pypiArtifact',
  'codeReachability',
  'dependencyGraph',
  // v5 (Transitive Malware Detection): true when the analyzed tarball ships a
  // bundled node_modules/ tree (the Shai-Hulud-2.0 bundled-code vector). Flag-only;
  // the bundled content is scanned by the worker, not resolved as graph nodes.
  'bundledDepsPresent',
  'scripts',
  'filePaths',

  // AI + threat intel
  'aiAnalysis',
  'aiVerdict',
  'aiCalibration',
  'aiProvenance',
  'threatIntel',
  'llmGate',

  // Vulnerability scanning
  'vulnerabilities',
  'vulnerabilityScanHealth',
  'transitiveVulnerabilities',
  // v5 (Transitive Malware Detection): deduped runtime+peer+optional install-set
  // (its OWN top-level array, not derived from the trimmable dependencyGraph) the
  // Backend TransitiveMalwareCoordinator evaluates worst-wins. Each entry carries
  // { ecosystem, name, version, integrity?, depth, path[], scope, specifierKind,
  //   publishedAt? }. Kept lenient on the wire (opaque, like transitiveVulnerabilities).
  'transitiveInstallSet',

  // Release anomaly + baseline drift + publisher continuity + campaign
  'packageBaselineFingerprint',
  'releaseAnomalyScore',
  'releaseAnomalyReasons',
  'baselineDriftScore',
  'baselineDriftReasons',
  'publisherContinuity',
  'campaignCorrelationScore',
  'campaignCorrelationReasons',

  // Sandbox-specific
  'attackChains',
  'sandboxAssessment',
  'sandboxExecutionMode',
  'sandboxQuality',
  'sandboxOutcome',
  'sandboxCoverageMet',
  'sandboxTriggerExpectations',
  'sandboxTriggerProfileId',
  'sandboxAttemptedTriggerPaths',
  'sandboxObservedTriggerPaths',
  'sandboxJobId',
  'artifacts',

  // License + policy + manifest signals
  'license',
  'licenseFact',
  'isDeprecated',
  'deprecationMessage',
  'isUnmaintained',
  'daysSinceLastPublish',
  'hasNpmShrinkwrap',
  'hasHttpDependency',
  'hasGitDependency',
  'hasGitHubDependency',
  'hasTelemetry',
  'hasBinaryDownload',

  // Escalation
  'analysisConfidence',
  'escalateToDynamic',
  'escalateReasons',
  'analysisStatus',
  'escalationReasons',
  'escalationPriority',

  // Misc operational
  'processingTimeMs',

  // v6 (FP Phase 7): SCA evidence-disposition the Static-Worker emits and the
  // Backend reads to gate the MALICIOUS label. Optional; values in
  // `WorkerResultEvidenceClass`. Absent = legacy/unknown producer.
  'evidenceClass',

  // v2 (P0-2): additive metadata envelope (suppressedAdvisories, …)
  'metadata',
] as const;

/** Convenience set for lookups. */
export const ALLOWED_TOP_LEVEL_RESULT_KEY_SET: ReadonlySet<string> = new Set(
  ALLOWED_TOP_LEVEL_RESULT_KEYS,
);

/**
 * Allowed top-level keys on a single `Finding` inside `findings[]`.
 * Same rules apply as `ALLOWED_TOP_LEVEL_RESULT_KEYS`.
 *
 * The five transitional analyzer-tier keys (evidenceTier,
 * confirmedSourceToSink, fileContext, scriptName, phase) are included
 * here as DEPRECATED transitional aliases. The canonical home is
 * `finding.evidence` (open Record<string, unknown>). See
 * `Static-Worker/src/submitter/finding-wire-normalizer.ts`. The aliases
 * remain accepted for one release after the
 * `worker_top_level_evidence_alias` CloudWatch counter has been zero
 * for one release.
 */
export const ALLOWED_TOP_LEVEL_FINDING_KEYS = [
  // Identity / display
  'code',
  'label',
  'title',
  'description',
  'severity',

  // Location / display
  'file',
  'line',
  'snippet',
  'sourceContext',
  'sourceStartLine',

  // Stable policy fields
  'category',
  'confidence',
  'score',
  'context',
  'isInformational',

  // Stable analyzer-source labels
  'source',
  'aiSummary',
  'aiPattern',

  // Vulnerability fields
  'url',
  'cve',
  'aliases',
  'affectedRange',
  'fixedIn',
  'references',

  // Canonical extension point
  'evidence',

  // P0-1 (2026-05-14) — TRANSITIONAL top-level analyzer-tier aliases.
  // Canonical home is `finding.evidence`. Remove after the v8 cache-schema
  // bump cycle.
  'evidenceTier',
  'confirmedSourceToSink',
  'fileContext',
  'scriptName',
  'phase',
] as const;

/** Convenience set for lookups. */
export const ALLOWED_TOP_LEVEL_FINDING_KEY_SET: ReadonlySet<string> = new Set(
  ALLOWED_TOP_LEVEL_FINDING_KEYS,
);

/** Names of the five P0-1 transitional alias keys (subset of ALLOWED_TOP_LEVEL_FINDING_KEYS). */
export const TRANSITIONAL_FINDING_ALIAS_KEYS = [
  'evidenceTier',
  'confirmedSourceToSink',
  'fileContext',
  'scriptName',
  'phase',
] as const;

export const TRANSITIONAL_FINDING_ALIAS_KEY_SET: ReadonlySet<string> = new Set(
  TRANSITIONAL_FINDING_ALIAS_KEYS,
);

/**
 * Light structural type for a wire `Finding`. Intentionally loose — every
 * field except `code`/`description`/`severity` is optional, and the
 * `evidence` record carries forward-compatible extensions. Producer-side
 * schemas (Static-Worker, Sandbox-Worker) and the Backend DTO are the
 * authoritative validators; this type is for compile-time hinting only.
 */
export interface WorkerFindingContract {
  code: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  label?: string;
  title?: string;
  file?: string;
  line?: number;
  snippet?: string;
  sourceContext?: string;
  sourceStartLine?: number;
  category?: string;
  confidence?: number;
  score?: number;
  context?: 'build' | 'runtime';
  isInformational?: boolean;
  source?: string;
  aiSummary?: string;
  aiPattern?: string;
  url?: string;
  cve?: string;
  aliases?: string[];
  affectedRange?: string;
  fixedIn?: string;
  references?: string[];
  evidence?: Record<string, unknown>;
  evidenceTier?: string;
  confirmedSourceToSink?: boolean;
  fileContext?: string;
  scriptName?: string;
  phase?: string;
}

/**
 * Light structural type for a wire `WorkerResult`. Same caveat as
 * `WorkerFindingContract` — the validators on either end are authoritative.
 */
export interface WorkerResultContract {
  jobId: string;
  ecosystem: 'npm' | 'pypi' | 'cargo' | 'go';
  name: string;
  version: string;
  integrity?: string;
  sha256?: string;
  artifactS3Key?: string;
  riskScore: number;
  findings: WorkerFindingContract[];
  analysisType: 'static' | 'sandbox';
  workerVersion?: string;
  siteId?: string | null;
  tenantId?: string;
  agentId?: string;
  correlationId?: string;
  originalAnalysisId?: string;
  verdict?: 'ALLOW' | 'WARN' | 'BLOCK' | 'INCONCLUSIVE';
  confidence?: string;
  reason?: string;
  reasoning?: string;
  inconclusiveReason?: string;
  coverage?: { staticComplete?: boolean; sandboxClean?: boolean; gaps?: string[] };
  findingsTruncated?: boolean;
  filePathCount?: number;
  securityFindings?: Array<Record<string, unknown>>;
  securityFindingsTruncated?: boolean;
  // v6 (FP Phase 7): SCA evidence-disposition; gates the Backend MALICIOUS label.
  evidenceClass?: WorkerResultEvidenceClass;
  [k: string]: unknown;
}

/**
 * Returns true iff `key` is in the allowlist of result top-level keys.
 */
export function isAllowedTopLevelResultKey(key: string): boolean {
  return ALLOWED_TOP_LEVEL_RESULT_KEY_SET.has(key);
}

/**
 * Returns true iff `key` is in the allowlist of finding top-level keys.
 */
export function isAllowedTopLevelFindingKey(key: string): boolean {
  return ALLOWED_TOP_LEVEL_FINDING_KEY_SET.has(key);
}

/**
 * Returns true iff `key` is a P0-1 transitional analyzer-tier alias.
 * Producers SHOULD nest these under `finding.evidence` instead of
 * emitting them at the top level.
 */
export function isTransitionalFindingAliasKey(key: string): boolean {
  return TRANSITIONAL_FINDING_ALIAS_KEY_SET.has(key);
}

/**
 * Find every top-level result key that is NOT in the allowlist. Returns
 * `[]` if the result is well-formed. Use this in producer-side and
 * Backend-side contract tests.
 */
export function findUnknownResultKeys(result: Record<string, unknown>): string[] {
  return Object.keys(result).filter((k) => !ALLOWED_TOP_LEVEL_RESULT_KEY_SET.has(k));
}

/**
 * Find every top-level finding key that is NOT in the allowlist, per
 * finding. Returns an array of `{ findingIndex, unknownKeys }` for each
 * finding that has any. Empty array means every finding is well-formed.
 */
export function findUnknownFindingKeys(
  findings: Array<Record<string, unknown>>,
): Array<{ findingIndex: number; unknownKeys: string[] }> {
  const out: Array<{ findingIndex: number; unknownKeys: string[] }> = [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (!f || typeof f !== 'object') continue;
    const unknownKeys = Object.keys(f).filter(
      (k) => !ALLOWED_TOP_LEVEL_FINDING_KEY_SET.has(k),
    );
    if (unknownKeys.length > 0) out.push({ findingIndex: i, unknownKeys });
  }
  return out;
}
