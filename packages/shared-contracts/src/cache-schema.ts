// ═══════════════════════════════════════════════════════════════════════════
// Cache schema version — single source of truth.
//
// Closes Phase 0 §2.15 cache-version split-brain (five sites). Before
// centralization:
//   Backend/src/packages/services/dynamodb-cache.service.ts:207        = 4
//   Backend/src/packages/services/global-artifact-cache.service.ts:65  = 5
//   Ceragon-Intelligence/src/runtime/intel-result-writer.ts:44         = 4
//   Ceragon-Intelligence/src/lambda/result-aggregator-handler.ts:31    = 4
//   Ceragon-Intelligence/src/runtime/result-aggregator.ts:43           = 4
//
// All five MUST import SCANNER_CACHE_SCHEMA_VERSION from this module.
// A divergence is detected by Backend's startup integration test
// (`packages/services/__tests__/cache-version-centralization.spec.ts`) and
// by the lint rule `no-cache-version-literal` configured under
// Backend/.eslintrc.json (forbids local `CURRENT_CACHE_VERSION` / `CACHE_VERSION`
// numeric literals outside this file).
//
// ── Bump policy ──────────────────────────────────────────────────────
// Increment when ANY of the following changes in a way that invalidates
// previously cached verdicts:
//   • detection-rule set (new typosquat / malware / obfuscation rules)
//   • risk-scoring algorithm (weights, thresholds, fusion logic)
//   • shared-contracts envelope shape (decision schema, finding schema)
//   • policy → action mapping (e.g., new INCONCLUSIVE class)
//
// A bump triggers the cache pre-warm runbook (Appendix D §D.5) — schedule
// the cache-version bump alongside the pre-warm budget script run.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Authoritative scanner-cache schema version. Must be incremented whenever
 * cached verdicts produced by an older version would be unsafe to reuse.
 *
 * Wave history (post-centralization snapshot):
 *   v6 — Phase 0 introduces ScannerDisplayState / ScannerRuntimeAction.
 *        Reset baseline because the global artifact cache (which used to
 *        be at 5) now coexists with DynamoDB / Intelligence (which used
 *        to be at 4). A single bump above max(4, 5) = 5 + 1 = 6 makes
 *        every pre-Phase-0 cached row a guaranteed miss across BOTH paths,
 *        which is the only correct behavior.
 *   v7 — P0-1 canonical vulnerability evidence parity. Cache rows must
 *        carry direct and transitive evidence completeness metadata so a
 *        low historical riskScore cannot mask critical/high CVE evidence.
 *   v8 — 2026-05-14 stabilization plan (P0-5). WorkerResult finding-evidence
 *        canonicalization (finding.evidence as the open extension point),
 *        failure-classification persistence (workerFailure.contractRejected
 *        on Analysis.metadata), and the executable worker-result contract
 *        gate. Old rows may carry top-level analyzer evidence keys
 *        (evidenceTier/confirmedSourceToSink/fileContext/scriptName/phase),
 *        may carry FAILED/BLOCK analyses produced by DTO rejection rather
 *        than real package risk, and may lack workerFailure metadata.
 *        Bumping invalidates all pre-fix rows as miss.
 */
export const SCANNER_CACHE_SCHEMA_VERSION = 8 as const;

/**
 * Type-safe alias for cache rows that carry a `cacheVersion` integer.
 * Importers should declare `cacheVersion: ScannerCacheSchemaVersion` to
 * make the dependency on this module explicit at compile time.
 */
export type ScannerCacheSchemaVersion = typeof SCANNER_CACHE_SCHEMA_VERSION;

/**
 * Returns true iff a cached row's persisted `cacheVersion` matches the
 * current authoritative version. Use this in cache-read paths instead of
 * comparing against a local literal.
 */
export function isCacheVersionFresh(persistedVersion: number | undefined | null): boolean {
  if (persistedVersion === undefined || persistedVersion === null) return false;
  if (typeof persistedVersion !== 'number' || !Number.isFinite(persistedVersion)) return false;
  return persistedVersion === SCANNER_CACHE_SCHEMA_VERSION;
}

/**
 * Normalize an artifact digest at every cache boundary. Returns the
 * trimmed digest when it looks like a real value, or `null` for any
 * absent / placeholder / whitespace input. Use this BEFORE keying a
 * row by `${ecosystem}#${digest}` or before storing the digest in
 * the integrity column. Closes Phase 0 §2.15 placeholder-digest class
 * (Codex v12 HIGH): `'unknown'` / `'undefined'` / `'null'` /
 * `'   '` would otherwise pass a naive truthiness check and let
 * distinct artifacts share a single cache row.
 *
 * Intentional choices:
 *   • Case-insensitive placeholder rejection (so 'UNKNOWN' is also rejected).
 *   • Returns the ORIGINAL trimmed value (preserves case for hex-encoded
 *     digests where consumers may compare verbatim).
 *   • Does NOT enforce a strict format (no SHA-256/SRI regex) — cache
 *     readers vary in what shape they accept; the goal here is only to
 *     reject obviously-non-artifact placeholders that would collide.
 */
export function normalizeArtifactDigest(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'unknown' || lower === 'undefined' || lower === 'null') return null;
  return trimmed;
}
