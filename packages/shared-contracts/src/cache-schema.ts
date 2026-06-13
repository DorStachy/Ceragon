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
 *   v9 — 2026-06-02 Supply-Chain Hardening (Phase 1). The transitive-CVE
 *        policy↔display split fix: the Backend mapper now HONORS the worker's
 *        per-finding transitive applicability stamp instead of blanket-
 *        downgrading MATCHED transitive findings to UNKNOWN under a non-COMPLETE
 *        graph, the authoritative install decision counts MATCHED-only direct
 *        AND transitive evidence, and an unproven transitive advisory / truncated
 *        graph now fails closed to a TRANSITIVE_COVERAGE_INCOMPLETE PROMPT. This
 *        changes what MATCHED/applicability MEANS for a row: v8 rows carry the
 *        old blanket-UNKNOWN transitive stamp and an authoritativeEvidenceDecision
 *        computed under the bypass, so a v8 HIT would re-serve the contradiction.
 *        Bumping invalidates all pre-fix rows as miss (re-analyze under the fixed
 *        pipeline). Policy→action mapping change per the bump policy above.
 *   v10 — 2026-06-06 Supply-Chain Zero-Day Policy Hardening (Phase 4). Cache
 *        rows can now carry normalized `policyFacts` (the policy-tier projection
 *        of scanner/sandbox observations that the install-time decision builder
 *        consumes). A row is stamped v10 ONLY when the producers required for
 *        its analysis mode reported terminal `status:'ok'` with clean
 *        `validation:'ok'` coverage — i.e. the row is fully fact-aware. A v9 row
 *        either predates facts entirely or carries a partial/incomplete fact
 *        pack, so it is NOT a complete fact-bearing row.
 *
 *        IMPORTANT — this bump is FRESHNESS-FLAG-GATED, not an exact-match flip.
 *        Backend reads route through `isCacheVersionFreshForRead(v, { readV10 })`
 *        whose floor is `readV10 ? 10 : 9`. With `BACKEND_POLICY_FACTS_READ_V10`
 *        OFF (default) BOTH v9 and v10 rows are fresh, so existing v9 rows serve
 *        normally (no deploy/shadow re-analysis spike) while new v10 rows
 *        accumulate. Flipping the flag ON raises the floor to 10 so v9 rows go
 *        stale and re-screen under the fact-bearing pipeline. The constant
 *        itself stays the max/target; do NOT revert it on rollback — flip the
 *        read flag instead.
 */
export const SCANNER_CACHE_SCHEMA_VERSION = 10 as const;

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
 * Supply-Chain Zero-Day Policy Hardening (Phase 4) — minimum cache version a
 * READ path will accept as fresh. This is the single source of truth for the
 * `BACKEND_POLICY_FACTS_READ_V10` cutover:
 *
 *   readV10 === false (default) → floor 9  → v9 AND v10 rows are fresh.
 *   readV10 === true            → floor 10 → only v10 rows are fresh.
 *
 * Keeping this a derived floor (not an exact-match flip) is what lets the v10
 * bump deploy WITHOUT a mass cache-miss/HOLD spike: with the flag off, the
 * already-cached v9 corpus continues to serve while v10 rows accumulate during
 * shadow burn-in; flipping the flag on re-screens the v9 corpus. See the v10
 * wave note above.
 */
export function minFreshReadVersion(readV10: boolean): number {
  return readV10 ? SCANNER_CACHE_SCHEMA_VERSION : SCANNER_CACHE_SCHEMA_VERSION - 1;
}

/**
 * READ-side freshness gate. Returns true iff a persisted `cacheVersion` is at
 * least `minFreshReadVersion(readV10)` AND not ahead of the current authoritative
 * version (future-version rows remain fail-closed for the same rollback-safety
 * reason as `isCacheVersionFresh`). Use this in every cache-READ path instead of
 * the exact-equality `isCacheVersionFresh` so the read floor moves atomically
 * with the `BACKEND_POLICY_FACTS_READ_V10` flag.
 *
 * `readV10` defaults to `false` so a caller that has not yet been migrated to
 * pass the flag behaves exactly like the pre-Phase-4 "accept v9-or-current"
 * lenient read (it will accept both v9 and v10) — never stricter by accident.
 */
export function isCacheVersionFreshForRead(
  persistedVersion: number | undefined | null,
  opts?: { readV10?: boolean },
): boolean {
  if (persistedVersion === undefined || persistedVersion === null) return false;
  if (typeof persistedVersion !== 'number' || !Number.isFinite(persistedVersion)) return false;
  // Future-version rows are never fresh (partial-rollback safety — identical to
  // isCacheVersionFresh's upper bound).
  if (persistedVersion > SCANNER_CACHE_SCHEMA_VERSION) return false;
  return persistedVersion >= minFreshReadVersion(opts?.readV10 === true);
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

/**
 * Async-Install-UX B1-B — extract the hash ALGORITHM of an artifact digest so a
 * cache-integrity compare can refuse to match across algorithms. Mirrored,
 * lock-step, in the inlined Backend copy at
 * `Backend/src/packages/services/scanner-cache-schema.ts`.
 *
 * SECURITY CONTEXT: an npm lockfile carries an SRI integrity in the form
 * `sha512-<base64>`, while a worker-written cache row stores a colon/bare-hex
 * digest (today usually `sha256:<hex>`). Treating a `sha512` target as a match
 * for a `sha256` cache row is FALSE EQUIVALENCE — it would let a republished /
 * mirror-drifted tarball at the same name@version reuse an old clean row. The
 * compare must treat a cross-algorithm pair as "no comparable proof" (a MISS),
 * never a hit. `algOf` makes "same algorithm?" decidable.
 *
 * Recognizes, in order:
 *   1. npm SRI prefix:        `sha512-…`, `sha256-…`, `sha1-…`   (case-insensitive)
 *   2. worker colon form:     `sha512:…`, `sha256:…`, `sha1:…`    (case-insensitive)
 *   3. bare hex by length:    40→sha1, 64→sha256, 128→sha512
 *
 * Returns the lowercase algorithm name, or `null` for an absent / placeholder /
 * unrecognized digest.
 */
export type SupportedDigestAlgorithm = 'sha1' | 'sha256' | 'sha512';

export function algOf(value: string | null | undefined): SupportedDigestAlgorithm | null {
  const normalized = normalizeArtifactDigest(value);
  if (normalized === null) return null;
  const delimited = /^(sha512|sha256|sha1)[-:]/i.exec(normalized);
  if (delimited) {
    return delimited[1].toLowerCase() as SupportedDigestAlgorithm;
  }
  if (/^[0-9a-f]+$/i.test(normalized)) {
    switch (normalized.length) {
      case 40:
        return 'sha1';
      case 64:
        return 'sha256';
      case 128:
        return 'sha512';
      default:
        return null;
    }
  }
  return null;
}
