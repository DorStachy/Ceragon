// ════════════════════════════════════════════════════════════════════════
// Customer-facing taxonomy mapping — the SINGLE source of truth that turns
// internal analysis machinery into customer-safe labels.
//
// Wave (2026-06-23). Design:
//   docs/superpowers/specs/2026-06-23-push-depth-cli-ui-design.md
//
// Two mappings live here (grounded in the REAL internal registries):
//   • FINDING_CLASS_TO_CATEGORY (mapping C) — internal `normalizedRuleCategory`
//     advisory class (ai-advisory.ts ADVISORY_CLASS_MAP) + the structured
//     `FindingCategory` enum (Frontend/types/github.ts) → one of the 9
//     customer Findings categories.
//   • SURFACE_TO_COVERAGE (mapping D) — internal `CoverageSurfaceId`
//     (scanner-worker/src/full-scan-coverage.ts) → one of the 6 customer
//     coverage categories (Overview "What we watch").
//
// HARD RULE: these functions NEVER emit a raw advisory class, a raw surface
// id, an engine name, or a model name to a customer. An unmapped advisory
// class falls back to 'Config' (never the raw class); an unknown surface
// falls back to 'Infrastructure & CI/CD' (never the raw surface id).
//
// The customer label lists are re-exported from `security-taxonomy.ts`
// (SECURITY_CATEGORIES / COVERAGE_CATEGORIES) so there is exactly one copy of
// each label set. Backend Findings endpoint (S7), Frontend Findings facets,
// and the Overview coverage map all key off these identical strings.
// ════════════════════════════════════════════════════════════════════════

import {
  SECURITY_CATEGORIES,
  COVERAGE_CATEGORIES,
  type SecurityCategory,
  type CoverageCategory,
} from './security-taxonomy';

/**
 * The 9 customer-facing Findings categories, in display order. Re-exported
 * from `security-taxonomy.ts` so there is one canonical list.
 */
export const CUSTOMER_FINDING_CATEGORIES = SECURITY_CATEGORIES;
export type CustomerFindingCategory = SecurityCategory;

/**
 * The 6 customer-facing coverage categories (Overview). Re-exported from
 * `security-taxonomy.ts`.
 */
export const CUSTOMER_COVERAGE_CATEGORIES = COVERAGE_CATEGORIES;
export type CustomerCoverageCategory = CoverageCategory;

/**
 * The structured finding-category enum the scanner/Backend already tag a
 * finding with (Frontend/types/github.ts FindingCategory). Pinned here as a
 * string union so this module stays dependency-free; SECRETS/SCA/IAC/etc. take
 * precedence over the advisory-class mapping when present.
 */
export type StructuredFindingCategory =
  | 'SAST'
  | 'SCA'
  | 'SECRETS'
  | 'ACTIONS'
  | 'IAC'
  | 'CONTAINER'
  | 'POSTURE';

/**
 * D21 — CROSS-REPO LOCKSTEP CONTRACT. Canonical mirror of the scanner-worker
 * `ADVISORY_CLASS_MAP` keys
 * (GithubApp-Bot-Scanner-Worker/scanner-worker/src/services/ai-advisory.ts:42,
 * the `ADVISORY_CLASS_MAP` Record built there). The scanner is a SEPARATE repo,
 * so its registry CANNOT be imported here; this frozen list is the contract
 * surface this package's tests key off (own-key consistency vs
 * `FINDING_CLASS_TO_CATEGORY` only — see below).
 *
 * ── Where the REAL drift guard lives (D21) ──
 * shared-contracts cannot see the scanner's source, so the cross-repo drift
 * guard — "every scanner `ADVISORY_CLASS_MAP` key appears in this canonical
 * `ADVISORY_CLASS_KEYS` list" — lives as a SCANNER-side test that imports the
 * real `ai-advisory.ts ADVISORY_CLASS_MAP`. THAT test fails loudly when someone
 * adds a scanner advisory class without mirroring it here. The shared-contracts
 * test can ONLY assert internal own-key consistency (this list ↔
 * `FINDING_CLASS_TO_CATEGORY`), not scanner parity. The runtime `'Config'`
 * default in `customerCategoryForFinding` stays as a backstop so an
 * un-mirrored class is bucketed safely (never raw) until the guard is fixed.
 *
 * D15: every key below MUST be an explicit own-key of `FINDING_CLASS_TO_CATEGORY`
 * (enforced by the local own-key test) — and adding a class to the scanner's
 * `ADVISORY_CLASS_MAP` without mirroring it here is caught by the SCANNER test.
 * Keep in lock-step with the scanner registry. Order matches ai-advisory.ts for
 * review-ability.
 */
export const ADVISORY_CLASS_KEYS = [
  // Cross-function / semantic classes
  'injection',
  'auth',
  'crypto',
  'ssrf',
  'path-traversal',
  'deserialization',
  'race-condition',
  'business-logic',
  // Missing-control / design-flaw classes
  'missing-rate-limiting',
  'missing-account-lockout',
  'missing-csrf',
  'swagger-exposure',
  'weak-password-policy',
  'broken-authentication',
  // Phase C back-stops
  'untrusted-href-scheme',
  'missing-security-headers',
  // Phase C — 6 new semantic classes
  'default-fail-open-env-flag',
  'secret-length-unchecked',
  'cross-task-in-memory-state',
  'unconstrained-ai-output-enum',
  'post-validate-mutation',
  'delimiter-collision-fingerprint',
  // 2026-05-22 onboarding-scan gap classes
  'env-spread-to-subprocess',
  'producer-controlled-argv',
  'iac-capability-creep',
  'no-user-directive-dockerfile',
  'ssrf-via-untrusted-url',
  'unbounded-resource-ingest',
  'bearer-only-outbound-auth',
  'llm-prompt-injection-from-package-fields',
  'default-fails-open-config',
] as const;
export type AdvisoryClassKey = (typeof ADVISORY_CLASS_KEYS)[number];

/**
 * D21 — CROSS-REPO LOCKSTEP CONTRACT (consumer side). Mapping C — internal
 * advisory class (`normalizedRuleCategory`) → customer Findings category. Keys
 * are the EXACT scanner `ADVISORY_CLASS_MAP` keys (ai-advisory.ts:42, mirrored
 * in `ADVISORY_CLASS_KEYS` above) plus a few cross-function alias classes the
 * deterministic packs emit (`sql-injection`, `command-injection`,
 * `code-injection`). EVERY `ADVISORY_CLASS_KEYS` entry has an explicit OWN-key
 * entry here — including ones that intentionally resolve to 'Config' — so the
 * membership (not the resolved value) is the source of truth: an 'explicit
 * Config' is provable and distinct from the fallback-default branch in
 * `customerCategoryForFinding`. The scanner↔contract drift guard lives in the
 * scanner test (see `ADVISORY_CLASS_KEYS` JSDoc above); this package's test only
 * asserts own-key consistency between this map and `ADVISORY_CLASS_KEYS`.
 */
export const FINDING_CLASS_TO_CATEGORY: Record<string, CustomerFindingCategory> = {
  // Injection family
  injection: 'Injection',
  'sql-injection': 'Injection',
  'command-injection': 'Injection',
  'code-injection': 'Injection',
  ssrf: 'Injection',
  'ssrf-via-untrusted-url': 'Injection',
  'path-traversal': 'Injection',
  deserialization: 'Injection',
  'untrusted-href-scheme': 'Injection',
  'producer-controlled-argv': 'Injection',
  'env-spread-to-subprocess': 'Injection',
  // Secret family
  'secret-length-unchecked': 'Secret',
  'bearer-only-outbound-auth': 'Secret',
  // AI / prompt family
  'llm-prompt-injection-from-package-fields': 'AI/prompt',
  'unconstrained-ai-output-enum': 'AI/prompt',
  // Access control family
  auth: 'Access control',
  'broken-authentication': 'Access control',
  'missing-csrf': 'Access control',
  'missing-account-lockout': 'Access control',
  'missing-rate-limiting': 'Access control',
  'weak-password-policy': 'Access control',
  'swagger-exposure': 'Access control',
  'business-logic': 'Access control',
  // Crypto family
  crypto: 'Crypto',
  'delimiter-collision-fingerprint': 'Crypto',
  // Config family
  'default-fail-open-env-flag': 'Config',
  'default-fails-open-config': 'Config',
  'post-validate-mutation': 'Config',
  'missing-security-headers': 'Config',
  'cross-task-in-memory-state': 'Config',
  'unbounded-resource-ingest': 'Config',
  'race-condition': 'Config',
  // Infrastructure family
  'iac-capability-creep': 'Infrastructure',
  'no-user-directive-dockerfile': 'Infrastructure',
};

/**
 * Mapping for the structured FindingCategory enum, applied BEFORE the advisory
 * class lookup. A SECRETS/SCA/IAC/CONTAINER/ACTIONS finding maps directly; a
 * SAST/POSTURE finding falls through to the advisory-class table.
 */
const STRUCTURED_CATEGORY_TO_CATEGORY: Partial<
  Record<StructuredFindingCategory, CustomerFindingCategory>
> = {
  SECRETS: 'Secret',
  SCA: 'Supply chain',
  IAC: 'Infrastructure',
  CONTAINER: 'Infrastructure',
  ACTIONS: 'Infrastructure',
};

/**
 * Mapping D — internal `CoverageSurfaceId` (full-scan-coverage.ts:5-14) →
 * customer coverage category. EVERY surface has an explicit entry. The
 * always-on deterministic secret lane is anchored to 'Secrets & credentials'
 * separately by the aggregate (it is not a deep surface id).
 */
export const SURFACE_TO_COVERAGE: Record<string, CustomerCoverageCategory> = {
  'subprocess-cli-wrapper': 'Secrets & credentials',
  'frontend-rendering': 'Injection & unsafe data flow',
  'migration-sql': 'Injection & unsafe data flow',
  'signed-message-contracts': 'Injection & unsafe data flow',
  'supply-chain-ci': 'Dependencies & supply chain',
  'iac-runtime-hardening': 'Infrastructure & CI/CD',
  'llm-prompt-boundary': 'AI & prompt safety',
  'auth-token-jwt': 'Auth & access control',
  'data-tenant-boundary': 'Auth & access control',
};

/**
 * Map an internal finding to its customer Findings category. The structured
 * `category` enum (SECRETS/SCA/IAC/…) takes precedence; otherwise the advisory
 * class is looked up. Unmapped ⇒ 'Config' (NEVER the raw class, NEVER an
 * engine name). `normalizedRuleCategory` is the internal advisory class string
 * (e.g. 'injection', 'ssrf-via-untrusted-url'); `category` is the structured
 * FindingCategory (or null).
 */
export function customerCategoryForFinding(
  normalizedRuleCategory: string | null | undefined,
  category: StructuredFindingCategory | string | null | undefined,
): CustomerFindingCategory {
  if (category) {
    const structured =
      STRUCTURED_CATEGORY_TO_CATEGORY[category as StructuredFindingCategory];
    if (structured) {
      return structured;
    }
  }
  if (normalizedRuleCategory) {
    const mapped = FINDING_CLASS_TO_CATEGORY[normalizedRuleCategory];
    if (mapped) {
      return mapped;
    }
  }
  return 'Config';
}

/**
 * Map an internal coverage surface id to its customer coverage category. NEVER
 * emits the raw surface id. Unknown surface ⇒ 'Infrastructure & CI/CD' (a safe,
 * machinery-free default).
 */
export function customerCoverageCategory(
  surfaceId: string | null | undefined,
): CustomerCoverageCategory {
  if (surfaceId) {
    const mapped = SURFACE_TO_COVERAGE[surfaceId];
    if (mapped) {
      return mapped;
    }
  }
  return 'Infrastructure & CI/CD';
}
