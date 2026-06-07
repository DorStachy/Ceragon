// ═══════════════════════════════════════════════════════════════════════════
// Supply-Chain Zero-Day Policy Hardening — `NormalizedPolicyFact` contract.
//
// A `NormalizedPolicyFact` is the policy-tier, normalized projection of a
// scanner/sandbox observation that the install-time decision builder consumes.
// It is INTERNAL-ONLY: facts (and the `policyFacts*` envelope markers) carry
// detector internals (`findingCodes`, `iocs`, `proof`, file paths) and MUST be
// stripped from every customer-facing serializer (Phase 4 exposure audit).
//
// Transport (Resolved Decision 1): facts ride inside the existing
// `.passthrough()` worker-result `metadata` envelope as `metadata.policyFacts`
// (+ a per-producer `metadata.policyFactsProducer` marker). No
// `WORKER_RESULT_CONTRACT_VERSION` bump, no top-level allowlist/sentinel churn.
//
// behaviorClass (Resolved Decision 6): REUSE the existing `FindingBehaviorClass`
// enum (`scanner-findings.ts`) — extended with the four policy-tier members
// (`runtime-bootstrap`, `network`, `release-integrity`, `coverage`). Do NOT
// fork a parallel enum.
//
// Workers do NOT import `@ceragon/shared-contracts` (vendored-copy pattern), so
// this TS type is mirrored as a worker-LOCAL zod schema in each worker. Keep
// the shapes in lockstep.
//
// Size + redaction caps (facts persist into `Analysis.metadata` / the DynamoDB
// cache — 400 KB item limit — and `evidence` can carry secret material): the
// producer redacts/caps and the Backend consumer re-validates. No raw secret
// VALUES (canary tokens, credential-file contents, env values) — hashes /
// redacted forms only. See the plan's "Fact size + redaction limits" block.
// ═══════════════════════════════════════════════════════════════════════════

import type { FindingBehaviorClass } from './scanner-findings';

/**
 * Schema version stamped on every emitted fact and echoed by the per-producer
 * envelope marker. A consumer that does not recognize this string treats the
 * pack as forward-incompatible.
 */
export const POLICY_FACT_SCHEMA_VERSION = 'policy-facts.v1' as const;

/**
 * Canonical fact names. Each maps to a specific install-time / runtime
 * observation the policy engine reasons about. Net-new detection in v1:
 * `lifecycle_script.remote_runtime_bootstrap` and
 * `dependency.optional_git_prepare` (Phase 2). `release.publisher_continuity_break`
 * is named here for the contract but has no Static producer in v1 (descoped —
 * `PUBLISHER_CONTINUITY_BREAK` stays MONITOR in all presets until a producer ships).
 */
export type PolicyFactName =
  | 'lifecycle_script.executes_code'
  | 'lifecycle_script.download_exec'
  | 'lifecycle_script.remote_runtime_bootstrap'
  | 'lifecycle_script.secret_exfil'
  | 'env.exfil.confirmed'
  | 'credential_file.read'
  | 'credential_file.exfil.confirmed'
  | 'canary_secret.exfil.confirmed'
  | 'network.external_contact'
  | 'network.dns_tunnel'
  | 'remote_payload.download_execute'
  | 'reverse_shell.confirmed'
  | 'persistence.write'
  | 'obfuscation.high'
  | 'imds.credential_probe'
  | 'sandbox.coverage_gap'
  | 'manifest.unusual_repository'
  | 'dependency.http'
  | 'dependency.git'
  | 'dependency.optional_git_prepare'
  | 'install.binary_download'
  | 'install.native_build'
  | 'release.anomaly'
  | 'release.baseline_behavior_drift'
  | 'release.publisher_continuity_break';

/**
 * How strongly the evidence backs the fact. `confirmed_malicious` and
 * `suspicious_correlated` are the high-signal dispositions the zero-day rules
 * key on; `coverage_gap` records a sandbox/telemetry hole rather than a finding.
 */
export type PolicyFactDisposition =
  | 'confirmed_malicious'
  | 'suspicious_correlated'
  | 'suspicious_uncorrelated'
  | 'informational'
  | 'coverage_gap';

/** Which producer/derivation channel minted the fact. */
export type PolicyFactSource = 'static' | 'sandbox' | 'manifest' | 'policy-data';

export type PolicyFactSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Lifecycle/execution phase the observation belongs to. */
export type PolicyFactPhase =
  | 'preinstall'
  | 'install'
  | 'postinstall'
  | 'prepare'
  | 'import_trigger'
  | 'build'
  | 'runtime';

export interface NormalizedPolicyFact {
  schemaVersion: typeof POLICY_FACT_SCHEMA_VERSION;
  factId: string;
  name: PolicyFactName;
  source: PolicyFactSource;
  disposition: PolicyFactDisposition;
  severity: PolicyFactSeverity;
  /**
   * Confidence in [0, 1]. NOTE: release/baseline metadata and Sandbox
   * attack-chain/signal confidences are 0-100 at the source — the fact mapper
   * MUST convert 0-100 → 0-1 when minting facts from those sources.
   */
  confidence: number;
  phase?: PolicyFactPhase;
  // RESOLVED Decision 6: reuse FindingBehaviorClass (scanner-findings.ts), do
  // NOT fork. The enum is extended with the four policy-tier members
  // ('runtime-bootstrap' | 'network' | 'release-integrity' | 'coverage').
  behaviorClass: FindingBehaviorClass;
  proof?: {
    sourceKind?: 'env' | 'credential-file' | 'canary' | 'file' | 'remote-payload' | 'manifest';
    sinkKind?: 'http' | 'dns' | 'process-argument' | 'file-exec' | 'github-repository' | 'package-publish';
    dataFlow?: 'body' | 'header' | 'query' | 'dns-label' | 'argument' | 'content-hash' | 'same-pid-temporal' | 'proximity';
    sameExecutionContext?: boolean;
    telemetryTier?: 'full' | 'reduced' | 'none';
    allowlistedSink?: boolean;
    // Worker zod mirrors `proof` as `.passthrough()` for forward-compat; model that here so the TS type matches.
    [key: string]: unknown;
  };
  evidence?: {
    findingCodes?: string[];
    runtimeEventIds?: string[];
    attackChainIds?: string[];
    files?: Array<{ path: string; line?: number }>;
    scripts?: Array<{ name: string; commandHash: string }>;
    iocs?: string[];
    reasons?: string[];
    // Worker zod mirrors `evidence` as `.passthrough()` for forward-compat; model that here so the TS type matches.
    [key: string]: unknown;
  };
}

/**
 * Per-producer envelope marker carried at `metadata.policyFactsProducer` on
 * EVERY result a fact-aware worker (`WORKER_EMIT_POLICY_FACTS_V1=true`)
 * processes — even a zero-fact benign result. Each worker reports ONLY ITS OWN
 * coverage; the Backend aggregates across the separate Static/Sandbox results
 * (Phase 4) and stamps the cache row v10 only when the required producers are
 * terminal-`ok` with clean validation.
 *
 * `validation: 'partial'` means some facts were dropped/truncated/redacted (the
 * malformed-fact + size-cap rules): the retained facts MAY still drive the LIVE
 * decision, but the cache row is stamped v9 (a truncated pack is NOT a complete
 * v10 row). `detectors` is the producer's capability list (Phase 4) so the
 * aggregator can tell "no fact because nothing fired" from "no fact because the
 * detector was absent".
 */
export interface PolicyFactsProducer {
  producer: 'static' | 'sandbox';
  status: 'ok' | 'skipped' | 'failed';
  schemaVersion: typeof POLICY_FACT_SCHEMA_VERSION;
  validation: 'ok' | 'partial';
  detectors?: string[];
}
