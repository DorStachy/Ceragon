// ════════════════════════════════════════════════════════════════════════
// Scan-run + repo-posture READ-SIDE contract (customer UI + CLI).
//
// Wave (2026-06-23). Design:
//   docs/superpowers/specs/2026-06-23-push-depth-cli-ui-design.md
//
// These are the canonical shapes the Backend read DTOs
// (Backend/src/github-app/services/github-read.service.ts CustomerScanRunDto,
// branch-graph.service.ts CommitNode/BranchGraphResponse,
// results.controller.ts status payload), the Frontend types
// (Frontend/types/*, Frontend/lib/scan-run-display.ts), and the Go CLI wire
// structs MUST align to. A parity spec on the Backend side enforces drift
// detection — same pattern as decision-contract.parity.spec.ts and
// endpoint-inventory-contract.parity.spec.ts.
//
// HARD RULE: nothing in these shapes ever carries an engine or model name
// (no gitleaks/semgrep/codeql/trivy/osv/bandit/checkov/scorecard/trufflehog/
// actionlint/zizmor; no Gemini/Opus/Claude/flash-lite/pro-preview). Categories are
// customer labels (SecurityCategory); coverage uses CoverageCategory.
//
// All fields here are ADDITIVE / OPTIONAL — older Backends omit them and
// consumers fall back to prior behavior.
// ════════════════════════════════════════════════════════════════════════

import type { SecuritySeverity, SecurityCategory, CoverageCategory } from './security-taxonomy';

/**
 * S4 — push OUTCOME (UI state), DISTINCT from the scan VERDICT (PASS|WARN|FAIL).
 * Derived at completion from verdict + bound-policy enforcement:
 *   FAIL + block-policy → BLOCKED   (locked red; non-overridable on secret block)
 *   WARN               → WARNED     (amber)
 *   PASS               → ALLOWED    (green)
 *   PushOverrideAudit  → OVERRIDDEN
 *   landed-on-default  → MERGED     (settled violet)
 * `null` ⇒ not a push scan / outcome not yet derived (back-compat default).
 */
export const PUSH_OUTCOMES = [
  'BLOCKED',
  'WARNED',
  'ALLOWED',
  'OVERRIDDEN',
  'MERGED',
] as const;
export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

/**
 * S3 — extended trigger classification (already on the ScanRun entity at
 * scan-run.entity.ts:275-276). Pinned here so naming helpers across FE/CLI
 * agree on the union.
 */
export const SCAN_TRIGGER_SUBTYPES = [
  'baseline-candidate',
  'push',
  'manual',
  'pr-check',
] as const;
export type ScanTriggerSubtype = (typeof SCAN_TRIGGER_SUBTYPES)[number];

/**
 * S3 — the naming inputs the customer-facing scan-name helper consumes.
 * All fields already exist on the ScanRun entity / customer DTO; this is the
 * additive contract that names them. Optional so legacy rows (no commit DAG)
 * still satisfy the shape.
 */
export interface ScanNameFields {
  triggerSubtype?: ScanTriggerSubtype | null;
  /** First line / subject of the scanned head commit (scan-run.entity.ts:297-298). */
  commitMessage?: string | null;
  /** Branch ref of the scanned head (scan-run.entity.ts:67-68). */
  headRef?: string | null;
  /** Head commit sha (scan-run.entity.ts:61-62). */
  headSha?: string | null;
  /** Base/merge-base sha for diff/push scans — drives S3 push-range naming and S3 artifact keys (scan-run.entity.ts:64-65). */
  baseSha?: string | null;
  /** PR number for pr-check scans (scan-run.entity.ts:58-59). */
  prNumber?: number | null;
}

/**
 * S4 — the additive push-outcome surface on the customer scan-run DTO + the
 * branch-graph commit node. Both expose the SAME optional field. Absent/null
 * on every non-push scan and on pre-cutover rows.
 */
export interface PushOutcomeFields {
  pushOutcome?: PushOutcome | null;
}

/**
 * S3/S4 — additive view extension applied to the customer scan-run DTO and to
 * each branch-graph commit node. Composition only; carries no new PII and no
 * machinery. The Backend CustomerScanRunDto and branch-graph CommitNode each
 * spread these fields.
 */
export interface ScanRunViewExtension extends ScanNameFields, PushOutcomeFields {}

/**
 * Additive paginated-list envelope fields for the scan-runs LIST response,
 * mirroring the server-driven pagination v1 fields already on the inventory
 * list responses (endpoint-inventory-contract.ts:339-351). The Backend
 * `PaginatedResponse<T>` (github-read.service.ts:148-172) already emits
 * `hasMore?`/`totalIsEstimate?`; this pins them for the scan-runs surface so
 * FE/CLI read them by name.
 */
export interface ScanListPageFields {
  /** Authoritative next-page sentinel (LIMIT pageSize+1). Absent ⇒ derive from total. */
  hasMore?: boolean;
  /** TRUE when `total` is a capped/estimated count. Absent ⇒ treat total as exact. */
  totalIsEstimate?: boolean;
}

// ── S6 — Overview posture summary (mainline security state) ──────────────
//
// D7 — SOURCE SET (stated explicitly, not implied): the posture aggregates the
// ACTIVE baseline PLUS the landed/merged/rebaselined deltas that have since
// joined the mainline. It EXCLUDES unlanded WARNED push deltas — a WARNED-but-
// not-yet-landed push's new findings live only on THAT push's scan-detail and
// enter this posture only once they land (merged / re-baselined).

/** Per-severity counts on the active baseline (display severity). */
export interface PostureSeverityCounts {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
}

/**
 * One coverage chip on the Overview. `category` is a customer CoverageCategory
 * (NO engine names); `covered` reflects whether the mapped internal surfaces
 * ran; `findingsCount` is the customer-visible total in that category.
 */
export interface CoverageCategorySummary {
  category: CoverageCategory;
  covered: boolean;
  findingsCount: number;
}

/** A top-risk row (highest-severity findings) shown on the Overview. */
export interface TopRiskItem {
  findingId: string;
  title: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  path: string;
}

/** Branch-activity roll-up for the Overview (S6). Deterministic, no LLM. */
export interface BranchActivitySummary {
  branchCount: number;
  blockedPushes: number;
  landedOnDefault: number;
  pushesScanned: number;
}

/**
 * Response for the Overview posture endpoint. D7 — the aggregate's source set
 * is the ACTIVE baseline PLUS landed/merged/rebaselined deltas, EXCLUDING
 * unlanded WARNED push deltas. This is the mainline security state, NOT a raw
 * active-baseline-only snapshot.
 */
export interface RepoPostureSummary {
  /**
   * The active baseline scan this posture is anchored on (the base of the
   * aggregate); null ⇒ no baseline yet. Landed/merged/rebaselined deltas are
   * folded in on top of it per D7; unlanded WARNED push deltas are excluded.
   */
  baselineScanId: string | null;
  severityCounts: PostureSeverityCounts;
  coverage: CoverageCategorySummary[];
  topRisks: TopRiskItem[];
  branchActivity: BranchActivitySummary;
}

// ── S7 — Repo-level findings list ────────────────────────────────────────

/**
 * Finding status relative to the active baseline:
 *   'new'      — NEW-since-baseline (accepted push delta).
 *   'baseline' — present in the active baseline (the customer "open" baseline set).
 *   'fixed'    — was in the baseline, no longer present.
 * Mirrors the processor-pipeline NEW vs BASELINE_KNOWN vs FIXED classification.
 */
export const REPO_FINDING_STATUSES = ['new', 'baseline', 'fixed'] as const;
export type RepoFindingStatus = (typeof REPO_FINDING_STATUSES)[number];

/** One row in the repo Findings tab. `category` is a customer label, never an engine. */
export interface RepoFinding {
  findingId: string;
  title: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  path: string;
  line?: number;
  status: RepoFindingStatus;
}

/** Query params for the repo-findings list (filterable). */
export interface RepoFindingsListQuery {
  severity?: SecuritySeverity;
  category?: SecurityCategory;
  path?: string;
  status?: RepoFindingStatus;
  page?: number;        // 1-based
  pageSize?: number;
}

/** Response for the repo-findings list — additive pagination envelope (S7). */
export interface RepoFindingsListResponse extends ScanListPageFields {
  items: RepoFinding[];
  total: number;
  page: number;
  pageSize: number;
}

// ── S8 — CLI live stages + budget (status payload) ───────────────────────

/**
 * D20 — THE canonical S8 customer-facing scan phase enum (NO tool names). This
 * is the ONE authoritative lifecycle the backend `scan-phase-mapper` EMITS and
 * the CLI Bubble Tea model CONSUMES verbatim; both repos have producer/consumer
 * exactness tests pinned to THIS array (and to the same array order). The
 * terminal `'failed'` state is part of the contract so a failed scan is a
 * first-class phase, not an out-of-band signal. Coarse lifecycle the CLI TUI
 * animates through; maps the internal pipeline phases to branded copy.
 */
export const SCAN_PHASES = [
  'queued',
  'reading',     // "Read your changes"
  'scanning',    // secrets + data-flow + deps sweeps
  'reviewing',   // strong-LLM re-score of the delta
  'finalizing',  // "Final once-over"
  'complete',    // terminal success
  'failed',      // terminal failure (fail-SAFE — never silently dropped)
] as const;
export type ScanPhase = (typeof SCAN_PHASES)[number];

/**
 * Per-stage lifecycle state. No tool names; purely lifecycle. `'skipped'` marks
 * a stage that did not run for THIS scan (e.g. the dependencies stage when no
 * lockfile changed) — distinct from `'pending'` (will run / not started yet).
 */
export const SCAN_STAGE_STATUSES = ['pending', 'active', 'done', 'skipped'] as const;
export type ScanStageStatus = (typeof SCAN_STAGE_STATUSES)[number];

/**
 * D20 — the canonical stable INTERNAL stage keys the backend mapper emits and
 * the CLI keys its rendering off of. These NEVER change wording (the wire
 * contract); the customer-visible wording lives entirely in `label`.
 *   'read-changes'  — "Read your changes"
 *   'secrets'       — "Swept for secrets"
 *   'data-flow'     — "Followed the data trail"
 *   'dependencies'  — "Checked your dependencies"
 *   'final'         — "Final once-over"
 */
export const SCAN_STAGE_KEYS = [
  'read-changes',
  'secrets',
  'data-flow',
  'dependencies',
  'final',
] as const;
export type ScanStageKey = (typeof SCAN_STAGE_KEYS)[number];

/**
 * D20 — ONE customer-facing stage in the live status payload.
 *   `key`    — a STABLE internal identifier (ScanStageKey) the CLI keys its
 *              ordering/animation off of; never shown to the customer, never
 *              changes wording. The backend emits one of the fixed keys.
 *   `label`  — the BRANDED customer string ("Read your changes", "Swept for
 *              secrets", "Followed the data trail", "Checked your dependencies",
 *              "Final once-over") — backend EMITS it; CLI renders it VERBATIM and
 *              NEVER derives its own. NEVER an engine/model name.
 *   `status` — lifecycle state (ScanStageStatus).
 * `key` is typed `string` (not `ScanStageKey`) on the wire shape so an older/
 * newer backend that adds a stage key does not hard-break deserialization; the
 * canonical key set is pinned in `SCAN_STAGE_KEYS` for producer/consumer tests.
 */
export interface ScanStage {
  /** Stable internal key (one of SCAN_STAGE_KEYS); CLI keys ordering off it. */
  key: string;
  /** Branded customer copy — backend emits, CLI renders verbatim. NO machinery. */
  label: string;
  status: ScanStageStatus;
}

/**
 * S8 — the customer-facing status payload the CLI polls.
 * `progress` is an INTEGER 0..100 (100 = complete) — NOT a 0..1 fraction. A
 * 0..1 consumer (the CLI Bubble Tea model) clamps the untrusted integer to
 * [0,100] FIRST, then divides by 100. `timeBudgetMs` is the server-reported
 * soft budget the CLI honors INSTEAD of a hardcoded timeout
 * (Installers/cmd/cera/git_scan.go:46 currently hardcodes 30s). `pushOutcome` is
 * present once derived (terminal). All fields additive/optional so an older
 * Backend status response still satisfies the shape.
 */
export interface ScanStatusStagePayload {
  phase?: ScanPhase;
  /** INTEGER 0..100 customer-facing progress (100 = complete). CLI clamps to [0,100] then /100. */
  progress?: number;
  stages?: ScanStage[];
  /** Server-reported soft time budget (ms). Absent ⇒ CLI uses its own gentle default, never a hard cap. */
  timeBudgetMs?: number;
  /** Terminal scan verdict label is carried elsewhere; this is the push outcome (S4). */
  pushOutcome?: PushOutcome | null;
}
