import { AI_SECURITY_PORTABLE_ORDERED_TUPLES } from './generated/ai-security-portable.generated';

/**
 * AI Control Plane — Wave 1 shared contract.
 *
 * Canonical shapes for AI session/event tracking. Consumed by:
 *   - Backend (`src/ai-governance/*`) — consumes this repository-local generated
 *     shared contract; always-on parity binds it to the digest-pinned artifact.
 *     No optional workspace checkout or manually maintained enum owns it.
 *   - Frontend AI Control Plane views (Wave 2+).
 *
 * These are DATA-SHAPE contracts only — no NestJS/TypeORM coupling. Closed
 * vocabularies alias generated `as const` tuples so both the TypeScript union
 * and runtime array remain exported; the deterministic generator/checker
 * enforces exact values and order.
 */

/**
 * The kinds of AI-control-plane events a session can accumulate.
 *
 * Wave 1 emits only the three `PACKAGE_INSTALL_*` values from the
 * package-check finalize path; the rest are declared now so later waves
 * (prompt capture, tool-call gating, MCP governance, diff/push gating)
 * add emitters without re-touching this contract.
 *
 * M4 (WS-H) — the five untrusted-ingress + upload-governance types are APPENDED
 * at the tail (never re-ordered), emitted later by the daemon (ingress redaction,
 * context taint, tool-hold) and the browser extension (upload gating):
 *   - INGRESS_REDACTED     — untrusted ingested content (tool output / README /
 *                            MCP result) had a secret or injection redacted
 *                            BEFORE the model read it.
 *   - CONTEXT_TAINTED      — the session was marked tainted by untrusted ingress.
 *   - TOOL_CALL_HELD       — the next risky tool call was HELD for confirmation
 *                            (distinct from TOOL_CALL_BLOCKED).
 *   - UPLOAD_BLOCKED       — a browser file upload was blocked (file-type / secret).
 *   - UPLOAD_NOT_INSPECTED — a browser upload was allowed but could not be
 *                            inspected (honest taxonomy).
 * Metadata for all six stays redaction-safe (class / count / disposition /
 * reason-slug only — NEVER raw prompt/file content).
 *
 * NOTE: this append-only order is owned by the digest-pinned generated tuple;
 * change it only through the portable authority and deterministic generator.
 */
/**
 * W1 additive event vocabulary emitted by the currently deployed Backend and
 * endpoint evidence writers after portable contract 0.4.0 was frozen. Keeping
 * the additions here makes this package's public AI_EVENT_TYPES tuple the one
 * runtime authority for DTO validation; callers no longer maintain private
 * exception lists that drift from the shared contract.
 *
 * The frozen portable prefix is never reordered. These values must move into
 * the next portable artifact release unchanged and in this order.
 */
export const AI_EVENT_TYPES = [
  ...AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_EVENT_TYPES,
  'WEB_ADAPTER_DRIFT',
  'WEB_NAV_BLOCKED',
  'ENFORCEMENT_RECEIPT_RECORDED',
  'BROWSER_ENFORCEMENT_RECEIPT_RECORDED',
  'EXCEPTION_GRANTED',
  'EXCEPTION_DENIED',
  'EXCEPTION_REVOKED',
  'EXCEPTION_EXPIRED',
  // ── E8 — session lifecycle ───────────────────────────────────────────────
  // The endpoint's session start/end had NO event class at all. `/v1/ai/session/
  // start` and `/v1/ai/session/end` wrote a session ROW and emitted nothing, so
  // the console could show a session but never an event for its beginning or its
  // end, and no endpoint-side record corroborated either.
  //
  //   - SESSION_STARTED — a runtime session began. Fires on startup AND on
  //                       resume / compact / clear, so it is NOT one per session;
  //                       the endpoint dedupes on (sessionId, source).
  //   - SESSION_ENDED   — a runtime session ended. Carries `endState` +
  //                       `nativeSessionEndCertified`: only a genuine native
  //                       SessionEnd hook earns `ended-native-attested`. Codex has
  //                       no SessionEnd hook at all, so a Codex session's end is
  //                       `ended-visibly-inferred` and is NEVER certified native.
  //
  // Metadata stays enums + identifiers only (sessionId, clientKind, surface,
  // source/reason slug, threadId, endState) — never a chat name or any content.
  'SESSION_STARTED',
  'SESSION_ENDED',

  // E10 — the §10.2 bundle-application receipt event. `AI_POLICY_BUNDLE_APPLIED`
  // was defined in `prompt-evidence-wire-contract.ts` and referenced by
  // `validateManagedV2ItemShape`, but it was NEVER a member of this tuple — and
  // this tuple is what `EndpointEvidenceEventDto.eventType`'s `@IsIn` validates
  // against. An endpoint that emitted the event the contract already describes
  // would have had its ENTIRE evidence batch 400-rejected. (Item 11 [C6]'s
  // agent-route leniency does not cover this: it tolerates undeclared KEYS, not
  // an out-of-vocabulary VALUE on a declared field.)
  'AI_POLICY_BUNDLE_APPLIED',

  // ── Item 27 [B6] — the undecidable-rate ledger row ───────────────────────
  //
  // HOOK_UNDECIDABLE — an AI runtime hook was handed a payload DeVoid could not
  // reach a verdict on, and the invocation PROCEEDED. On Codex that is not a
  // near-miss: the vendor fails OPEN on a hook that did not complete its
  // contract, so every one of these is an action that ran with no governance at
  // all, and nothing else downstream can tell it apart from a clean allow.
  //
  // Cross-cutting rule 1 — "wherever we fall back to allow-on-undecidable, the
  // rate is instrumented and alerts above zero; a fail-open you cannot measure
  // is just ungoverned" — is unimplementable without this. Verification on
  // 2026-08-05 measured the event type as present in NEITHER repo: the endpoint
  // counted undecidables into a heartbeat block the Backend dropped, and the
  // acceptance's "the Events ledger shows a HOOK_UNDECIDABLE row" named an event
  // nothing produced. The producer is
  // `internal/daemon/undecidable_attest.go::emitUndecidableHookEvents`.
  //
  // DEPLOY ORDER: this tuple is what `EndpointEvidenceEventDto.eventType`'s
  // `@IsIn` validates against, and an out-of-vocabulary VALUE 400s the WHOLE
  // evidence batch (item 11 [C6]'s leniency covers undeclared KEYS, not values).
  // Backend first, agent second — the same order `AI_POLICY_BUNDLE_APPLIED`
  // above exists to record.
  //
  // Metadata is enums + counts only: `reason` (the closed bucket slug —
  // normalize | stdinOversize | stdinTimeout | stdinError | other | dropped),
  // `undecidableCount`, `decidedCount`. Never a payload byte — an undecidable
  // payload is BY DEFINITION something we could not parse, which makes it the
  // last thing that may be copied into an evidence channel.
  'HOOK_UNDECIDABLE',

  // ── The prompt-hold family, and the event that CLOSES a hold ─────────────
  //
  // All three were already declared in `prompt-evidence-wire-contract.ts` —
  // `MANAGED_V2_PROMPT_EVENT_TYPES` lists them and `PROMPT_EVENT_COMBINATIONS`
  // gives each one a canonical phase/action/disposition row — but NONE of them
  // was ever a member of this tuple. That is the same defect as
  // `AI_POLICY_BUNDLE_APPLIED` and `HOOK_UNDECIDABLE` above, for the third and
  // fourth time: the contract described an event the validated vocabulary did
  // not contain.
  //
  //   - PROMPT_HELD      — the prompt was HELD pending a human answer.
  //   - PROMPT_RELEASED  — the human answered "send it"; the held prompt went.
  //   - PROMPT_CANCELLED — the hold ended without the prompt being sent
  //                        (answered no, timed out, or the dialog could not be
  //                        drawn at all).
  //
  // WHY THE CLOSE IS A SECOND EVENT AND NEVER AN EDIT. The agent draws the warn
  // dialog and, on cancel / timeout / undrawable, denies LOCALLY and posts
  // nothing — so a released prompt and a refused one are indistinguishable in
  // the ledger forever. The close-out is therefore a NEW row naming the hold
  // through `causedByEventId`. The hold row is hash-chained; mutating it to
  // record its own outcome would rewrite tamper-evident history to carry a fact
  // that arrived later, which is the one thing an evidence chain exists to make
  // impossible.
  //
  // DEPLOY ORDER, and this is the fourth time it is written on this tuple:
  // `EndpointEvidenceEventDto.eventType` is `@IsIn` this array, so an endpoint
  // emitting one of these against a Backend without them has the ITEM rejected
  // and replaced by an `ENDPOINT_EVIDENCE_REJECTED` tombstone — the close-out
  // vanishes and the hold stays open forever. Backend first, agent second.
  //
  // Metadata stays content-free: the decision, the disposition, the reason slug
  // and the causal edge — never the prompt text the human was shown.
  'PROMPT_HELD',
  'PROMPT_RELEASED',
  'PROMPT_CANCELLED',
] as const;

export type AIEventType = (typeof AI_EVENT_TYPES)[number];

/** W1 server-derived event severity. Emitters never declare this value. */
export const AI_EVENT_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type AiEventSeverity = (typeof AI_EVENT_SEVERITIES)[number];

/** Explainable inputs and adjustments that produced a stored event severity. */
export type AiEventSeverityBasis = {
  formulaVersion: number;
  class: string | null;
  ruleId: string | null;
  base: AiEventSeverity;
  /** Present only when a producer supplied a storage-validated evidence grade. */
  evidenceStrength?: string;
  evidenceTier: string | null;
  tier: string | null;
  enforcementEligible: boolean | null;
  adjustments: string[];
};

/** W1 analyst triage state; deliberately independent of policy outcome. */
export const AI_EVENT_TRIAGE_STATUSES = ['new', 'investigating', 'resolved'] as const;
export type AiEventTriageStatus = (typeof AI_EVENT_TRIAGE_STATUSES)[number];

/**
 * The analyst triage vocabulary a reviewer may CHOOSE, widened from four to
 * eight by M4.7A Wave 6 Task 8 (migration `WidenAiEventTriageClassifications`,
 * 1793300000000) against the mapping Wave 3B Task 12 committed in
 * `src/ai-governance/triage-governance-mapping.v1.json`.
 *
 * Why it grew. `benign_expected` conflated two verdicts with two different
 * fixes — the policy fired when it should not have (`policy_too_strict`), and
 * the actor was allowed to do this (`authorized_action`) — so the one value
 * could not tell the person who fixes it which thing to fix. There was also no
 * way to say the detection was right but its explanation was wrong
 * (`incorrect_explanation`), no way to say the same finding already has a row
 * (`duplicate`), and no way to distinguish "nobody looked" from "somebody
 * looked and could not decide" (`reviewed_unknown`).
 *
 * `not_set` is the column default and the only member that is not a judgement.
 * `reviewed_unknown` is deliberately NOT the default: a reviewer saying "I
 * looked and cannot decide" is a judgement someone made, and a default is not.
 * Harvested from the intel FP agent's `advance.js:33` — "'no file' is not a
 * verdict" — see `.plans/m47a-20260822/v2-waves/artifacts/w6/fp-agent-boundary.md`.
 */
export const AI_EVENT_TRIAGE_CLASSIFICATIONS = [
  'not_set',
  'reviewed_unknown',
  'true_positive',
  'policy_too_strict',
  'authorized_action',
  'false_positive',
  'incorrect_explanation',
  'duplicate',
] as const;
export type AiEventTriageClassification =
  (typeof AI_EVENT_TRIAGE_CLASSIFICATIONS)[number];

/**
 * Values a reviewer once chose and may no longer choose, but which are still
 * stored on live rows and must stay readable.
 *
 * `benign_expected` is retired rather than rewritten. Splitting it into
 * `policy_too_strict` and `authorized_action` is not something a migration can
 * do for past rows: nobody knows which half the reviewer meant, and picking one
 * would put a judgement in their mouth that they never made.
 *
 * A retired value is NOT a second vocabulary. It is this vocabulary's other
 * lifecycle state, declared here once so that every consumer that must still
 * count these rows — the measured-FP denominator above all — reads the same
 * list instead of hand-copying a string. It is deliberately absent from
 * `AI_EVENT_TRIAGE_CLASSIFICATIONS`, so the update DTO's `@IsIn` refuses it and
 * no new row can be written carrying it.
 */
export const AI_EVENT_TRIAGE_RETIRED_CLASSIFICATIONS = ['benign_expected'] as const;
export type AiEventTriageRetiredClassification =
  (typeof AI_EVENT_TRIAGE_RETIRED_CLASSIFICATIONS)[number];

/**
 * Every value the `classification` column may legally hold: what a reviewer may
 * choose now, plus what reviewers chose before the widening. This is what the
 * database CHECK admits, and it is the only list a read path should validate
 * against — a read that only knew the writable half would treat a live
 * `benign_expected` row as corrupt.
 */
export const AI_EVENT_TRIAGE_STORED_CLASSIFICATIONS = [
  ...AI_EVENT_TRIAGE_CLASSIFICATIONS,
  ...AI_EVENT_TRIAGE_RETIRED_CLASSIFICATIONS,
] as const;
export type AiEventTriageStoredClassification =
  (typeof AI_EVENT_TRIAGE_STORED_CLASSIFICATIONS)[number];

export const AI_EVENT_RESOLUTION_REASONS = [
  'issue_fixed',
  'false_positive',
  'exception',
  'wont_fix',
  'no_longer_present',
] as const;
export type AiEventResolutionReason = (typeof AI_EVENT_RESOLUTION_REASONS)[number];

/**
 * Per-session prompt/content evidence-capture posture.
 *
 * Governs whether raw prompt/response text is persisted when an AI event
 * carries such content:
 *   - OFF                  — capture nothing (not even a hash).
 *   - HASH_ONLY (default)  — persist a SHA-256 of the content, never the text.
 *   - REDACTED             — persist a redacted marker + hash + redaction count,
 *                            never the raw text.
 *   - FULL_WITH_APPROVAL   — persist the raw text (only mode that does).
 */
export const PROMPT_EVIDENCE_MODES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.PROMPT_EVIDENCE_MODES;

export type PromptEvidenceMode = (typeof PROMPT_EVIDENCE_MODES)[number];

/**
 * Canonical policy-decision union for AI events, mapped 1:1 from the
 * package-decision `VerdictType` (see `decision-contract.ts`). Kept as a
 * distinct alias so an AI-plane consumer does not need to import the
 * package decision contract, and so the AI-plane can add plane-specific
 * decisions later without widening the package verdict surface.
 */
export const AI_POLICY_DECISIONS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_POLICY_DECISIONS;

export type AiPolicyDecision = (typeof AI_POLICY_DECISIONS)[number];

/**
 * Alias kept for symmetry with the plan's `POLICY_DECISION` naming; the
 * canonical union is `AiPolicyDecision`.
 */
export type POLICY_DECISION = AiPolicyDecision;

/**
 * AI Control Plane — Wave 4 (Daemon AI plane — prompt-guard + DLP).
 *
 * The DLP class taxonomy the daemon/browser-extension applies client-side
 * and the backend echoes in its policy. Split into block / redact / warn
 * tiers by the default policy below; the union of all three is exported as
 * `AI_DLP_CLASSES` so both sides validate against one closed set.
 */
export const AI_DLP_BLOCK_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_BLOCK_CLASSES;

// The redact tier: the last 10 (openai-key … google-oauth-secret) are the M4
// (WS-C) structured provider/service credential classes the daemon + browser
// engines detect. Redact (mask + let the prompt through) matches the
// sibling-secret tier; an admin can escalate to block or relax to warn/allow.
// NOTE: entries and order are owned by the digest-pinned generated tuple; the
// deterministic checker rejects a stale or manually divergent projection.
export const AI_DLP_REDACT_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_REDACT_CLASSES;

// The warn tier. kubeconfig / db-connection-string are M4 (WS-C) ambiguous
// shapes — a redacted sample kubeconfig / a connection string is common in
// benign context, so they WARN rather than mask by default; an admin can
// escalate per class. Matches the browser-extension DEFAULT_POLICY tiers
// exactly (Installers/browser-extension/src/dlp.js). NOTE: the daemon's
// `base64-wrapped-secret` detector is deliberately NOT tiered here — like the
// browser default it falls to the built-in WARN default (policyeval), keeping
// this heuristic out of the configurable closed set.
export const AI_DLP_WARN_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_WARN_CLASSES;

/** The union of every DLP class across block/redact/warn tiers. */
export const AI_DLP_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES;

export type AiDlpClass = (typeof AI_DLP_CLASSES)[number];

/**
 * The four decisions the daemon prompt-guard reports (and the backend may
 * upgrade). Maps onto AI event types: allow/warn→PROMPT_SUBMITTED,
 * redact→PROMPT_REDACTED, block→PROMPT_BLOCKED.
 */
export const AI_PROMPT_DECISIONS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_PROMPT_DECISIONS;

export type AiPromptDecision = (typeof AI_PROMPT_DECISIONS)[number];

/**
 * AI Control Plane — M2 (Data-movement disposition).
 *
 * The secret-free verdict of what did / did not leave the machine for a given
 * AI event. This is the load-bearing field behind the data-movement panel: the
 * on-box proxy knows the true disposition (it is the wire boundary), while the
 * daemon prompt/tool-check path maps its coarser verdict (marking `warn` that
 * holds as `HELD`). Bound to redaction-safe metadata only — NEVER a preview.
 *
 *   - SENT_ALLOWED          — content was sent to the provider, unmodified.
 *   - REDACTED_THEN_SENT    — secrets were masked, the redacted body was sent.
 *   - BLOCKED_BEFORE_EGRESS — the request was blocked; nothing left the box.
 *   - HELD                  — warn-hold; the user was warned, nothing sent yet.
 *   - NEVER_LEFT            — fail-closed / unscannable; content never left.
 *   - BLOCKED_EGRESS_HOST   — egress to a disallowed host was blocked.
 *   - RELEASED_ONCE         — an explicit allow-once override was consumed.
 *
 * Additive-only: emitters may omit it (older events carry `null`), and the read
 * model derives the first three from existing backend fields when absent.
 */
export const AI_DATA_DISPOSITIONS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DATA_DISPOSITIONS;

export type AiDataDisposition = (typeof AI_DATA_DISPOSITIONS)[number];

/** The DLP block shape returned by `GET /api/v1/ai/policy`. */
export interface AiDlpPolicyShape {
  enabled: boolean;
  blockClasses: AiDlpClass[];
  redactClasses: AiDlpClass[];
  warnClasses: AiDlpClass[];
}

/**
 * The default Wave-4 DLP policy. `enabled` + the three class tiers are the
 * canonical defaults the backend returns when no per-org override exists.
 */
export const AI_DLP_DEFAULT_POLICY: AiDlpPolicyShape = {
  enabled: true,
  blockClasses: [...AI_DLP_BLOCK_CLASSES],
  redactClasses: [...AI_DLP_REDACT_CLASSES],
  warnClasses: [...AI_DLP_WARN_CLASSES],
};

/**
 * One finding the daemon prompt-guard attaches to a `prompt/check` — a DLP
 * class + rule that matched, with an occurrence count. Carries NO raw
 * secret value.
 */
export interface AiPromptFindingShape {
  class: string;
  ruleId: string;
  count: number;
  severity?: string;
}

/** Request shape for `POST /api/v1/ai/prompt/check`. */
export interface AiPromptCheckShape {
  agentType: string;
  provider?: string;
  sessionId?: string;
  /**
   * W6/C — the observation surface. Typed as a plain `string`, NOT a union:
   * the closed vocabulary is {@link AI_SOURCE_SURFACES} and it is enforced at
   * STORAGE (`normalizeSourceSurface`), never on the wire. A union here would
   * re-create the compile-time half of the enum that made a newer agent's
   * surface value 400 the whole report.
   */
  surface?: string;
  decision: AiPromptDecision;
  findings: AiPromptFindingShape[];
  evidenceMode: PromptEvidenceMode;
  promptHash?: string;
  redactedPreview?: string;
  clientCorrelationId?: string;
}

/** Response shape for `POST /api/v1/ai/prompt/check`. */
export interface AiPromptCheckResponseShape {
  eventId: string;
  seqNum: number;
  decision: AiPromptDecision;
  serverEnforced: boolean;
  reason?: string;
}

/**
 * F01 failure-oracle admin action set (M4.7 owner direction #6). Governs ONLY
 * the failure-oracle path — unverifiable / parser-failed / partial secret-shaped
 * material that bounded local inspection could not turn into enforcement-eligible
 * evidence. It is policy config, NOT a detection catalog; it never grants a
 * bypass. Absent / empty / unknown → treated as 'block' (the conservative DENY).
 */
export const AI_FAILURE_ORACLE_ACTIONS = ['block', 'warn', 'confirm', 'audit'] as const;
export type AiFailureOracleAction = (typeof AI_FAILURE_ORACLE_ACTIONS)[number];

/** F01 failure-oracle sub-policy shape carried on `GET /api/v1/ai/policy`. */
export interface AiFailureOraclePolicyShape {
  /** block (default) | warn | confirm | audit. Absent / unknown → 'block'. */
  action: AiFailureOracleAction;
}

/** Response shape for `GET /api/v1/ai/policy`. */
export interface AiPolicyShape {
  evidenceMode: PromptEvidenceMode;
  blockedProviders: string[];
  toleratedProviders: string[];
  dlp: AiDlpPolicyShape;
  /**
   * M4.7 (owner direction #6) — F01 failure-oracle admin action. Additive +
   * optional so a pre-M4.7 consumer reads byte-identically; absent → the daemon
   * applies the conservative DENY ('block') default.
   */
  failureOracle?: AiFailureOraclePolicyShape;
  updatedAt: string;
  /**
   * M3 (LOCK-4) — team-scoped policy resolution, all additive + optional so a
   * pre-M3 consumer (and a no-team endpoint) reads byte-identically to today.
   *   - resolvedScope     — the scope the effective policy resolved AT.
   *   - teamId            — the endpoint_group the team-tier came from (null = none).
   *   - appliedProfileId  — the named Role/profile applied (null = ad-hoc/site).
   *   - effective         — true when this object is the strictest-folded result.
   */
  resolvedScope?: AiPolicyScope;
  teamId?: string | null;
  appliedProfileId?: string | null;
  effective?: boolean;
}

/** Lifecycle state of an AI session. */
export type AiSessionState = 'active' | 'ended';

/**
 * A tracked AI-agent session. One row per (agent surface, session id).
 * `evidenceMode` is the per-session capture posture applied to every
 * event recorded under it.
 */
export interface AiSessionShape {
  id: string;
  orgId: string;
  siteId: string | null;
  endpointId: string | null;
  userId: string | null;
  username: string | null;
  hostnameHash: string | null;
  repoFullName: string | null;
  agentType: string;
  provider: string | null;
  model: string | null;
  sourceSurface: string;
  startedAt: string;
  endedAt: string | null;
  evidenceMode: PromptEvidenceMode;
  policyProfileId: string | null;
  riskScore: number;
  state: AiSessionState;
  createdAt: string;
  updatedAt: string;
}

/**
 * AI Control Plane — Wave 3 (AI Inventory + Provider Matrix).
 *
 * The kinds of inventory row the endpoint sweep produces:
 *   - 'ai-tool' — a detected AI coding agent (cursor, claude-code, ...).
 *   - 'ai-rule' — a detected AI-agent rule/config file (CLAUDE.md, .cursor/rules, ...).
 */
export const AI_INVENTORY_KINDS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_INVENTORY_KINDS;

export type AiInventoryKind = (typeof AI_INVENTORY_KINDS)[number];

/**
 * Per-org governance status for an AI provider. 'observed' is the default
 * when no explicit policy row exists; approved / tolerated / blocked are set
 * by an admin via `PATCH /api/v1/ai/providers/:providerKey/policy`.
 */
export const AI_PROVIDER_POLICY_STATUSES =
  AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_PROVIDER_POLICY_STATUSES;

export type AiProviderPolicyStatus = (typeof AI_PROVIDER_POLICY_STATUSES)[number];

/**
 * A single AI-inventory item as SENT by the daemon/extension in an ingestion
 * batch. `provider` is optional on ingest — the backend resolves the
 * canonical provider key via the provider catalog when absent.
 */
export interface AiInventoryItemShape {
  kind: AiInventoryKind;
  name: string;
  provider?: string;
  version?: string;
  sourceFile?: string;
  detector?: string;
  /** Detection confidence in [0, 1]. */
  confidence?: number;
  /** Small kv metadata only — NEVER raw prompt/secret content. */
  metadata?: Record<string, string>;
}

/**
 * A persisted AI-inventory row as RETURNED by the console read endpoints.
 * `provider` is always resolved server-side; timestamps are ISO-8601.
 */
export interface AiInventoryRowShape {
  id: string;
  orgId: string;
  siteId: string | null;
  endpointId: string | null;
  kind: AiInventoryKind;
  name: string;
  provider: string;
  version: string | null;
  sourceFile: string | null;
  detector: string | null;
  confidence: number | null;
  metadata: Record<string, string> | null;
  firstSeen: string;
  lastSeen: string;
  detectionCount: number;
}

/**
 * Enforcement-truth model (M2.5 runtime-gov core — decision P2). Admin INTENT
 * (the provider-policy status) and ACTUAL per-layer enforcement capability are
 * represented distinctly, so the honest gap "provider set to blocked, app still
 * launches" is shown as a deliberate boundary, never a false "blocked."
 *   - launch    — always 'by-design' (not-EDR; we never lock the app process).
 *   - traffic   — 'denied' for a blocked provider (real egress deny), else 'allowed'.
 *   - promptDlp — 'active' when an explicit policy inspects prompts, else 'inactive'.
 * effectiveStatus is the glance-level derivation: 'Blocked' requires a real
 * mechanism (traffic); a merely-observed provider is 'Monitored', never 'Blocked'.
 */
export interface AiEnforcementTruthShape {
  intent: AiProviderPolicyStatus;
  layers: {
    launch: 'by-design';
    traffic: 'denied' | 'allowed';
    promptDlp: 'active' | 'inactive';
  };
  effectiveStatus: 'Blocked' | 'Governed' | 'Monitored';
}

/**
 * One row of the provider/model governance matrix. A row is derived from the
 * UNION of observed sessions (sessionCount) and inventory detections
 * (inventoryCount) for a provider, carrying its governance `status` (admin
 * intent) and the derived `enforcement` truth (P2 effective status + per-layer).
 */
export interface AiProviderMatrixRowShape {
  provider: string;
  model: string | null;
  agentType: string | null;
  status: AiProviderPolicyStatus;
  sessionCount: number;
  inventoryCount: number;
  lastSeen: string | null;
  enforcement: AiEnforcementTruthShape;
}

/**
 * One row of the per-endpoint AI posture view — the AI tooling + rule files
 * detected on an endpoint, with derived risk flags.
 */
export interface AiAgentPostureRowShape {
  endpointId: string | null;
  hostname: string | null;
  detectedTools: string[];
  toolCount: number;
  ruleFileCount: number;
  lastSeen: string | null;
  riskFlags: string[];
}

/**
 * M2.5 — Web AI Guard coverage/health: one endpoint's browser-extension
 * presence, reported by the daemon on the endpoint-inventory rail (ecosystem
 * 'browser-extension'). `online` uses the same last-seen freshness rule as the
 * endpoint agent, so an idle-but-installed extension reads truthfully.
 */
export interface AiWebCoverageEndpointShape {
  endpointId: string;
  hostname: string | null;
  version: string | null;
  lastSeen: string | null;
  online: boolean;
  // Wave A (coverage drift truth) — control-coverage staleness/health forwarded
  // from the daemon's `metadata.webCoverage` beacon. "Control coverage, not
  // usage": no prompt/page content, only per-site selector-drift markers.
  policyAgeMs: number | null;
  drifted: boolean;
  driftedSites: { host: string; provider: string; selectors: string[] }[];
  // F39 — MEASURED nav-block (restricted-provider navigation block) tier state.
  // `navBlockRuleCountSource` is the discriminator, not the count: the beacon
  // always emits a numeric ruleCount, so only a source of 'dnr-engine' proves
  // the count was measured. Anything else => navBlockArmed null => "not
  // reported" (absence), never "not armed" (a defect).
  navBlockRuleCount?: number | null;
  navBlockRuleCountSource?: string | null;
  navBlockArmed?: boolean | null;
  navBlockProviders?: string[];
  navBlockUnsupportedProviders?: string[];
  navBlockLastRefreshedAt?: string | null;
  navBlockFailureReason?: string | null;
}

/**
 * M2.5 — `GET /api/v1/ai/web-coverage` response: per-endpoint extension health
 * plus an install/online/stale rollup for the Web AI Guard console.
 */
export interface AiWebCoverageResponseShape {
  endpoints: AiWebCoverageEndpointShape[];
  summary: {
    installed: number;
    online: number;
    stale: number;
    /** Count of installed endpoints reporting selector drift (degraded coverage). */
    degraded: number;
    /** F39 — ONLINE endpoints that MEASURED zero nav-block rules. Absence is never counted. */
    navBlockNotArmed?: number;
  };
}

/**
 * A single AI-control-plane event, hash-chained per org (its OWN chain,
 * independent of the `audit_events` chain). Content-bearing events store
 * a hash/redacted marker via `metadata`/`evidenceRef` unless the owning
 * session is in `FULL_WITH_APPROVAL`.
 */
export interface AiEventShape {
  id: string;
  sessionId: string | null;
  orgId: string;
  siteId: string | null;
  endpointId: string | null;
  eventType: AIEventType;
  eventTime: string;
  agentType: string | null;
  provider: string | null;
  model: string | null;
  repoFullName: string | null;
  repoPathHash: string | null;
  packageEcosystem: string | null;
  packageName: string | null;
  packageVersion: string | null;
  mcpServerId: string | null;
  mcpToolName: string | null;
  filePathHash: string | null;
  gitSha: string | null;
  policyDecision: AiPolicyDecision | null;
  /** Warn is represented as ALLOW plus these facts; never a WARN decision. */
  warned?: boolean;
  warnReason?: string | null;
  dataClasses: string[] | null;
  evidenceRef: string | null;
  /**
   * M2: secret-free data-movement verdict (what did / did not leave the box).
   * Optional + nullable — additive: emitters that don't set it and older rows
   * read as absent, and the read model derives the sent/redacted/blocked
   * subset from existing fields when null.
   */
  disposition?: AiDataDisposition | null;
  /** Server-derived, write-time risk and the immutable basis for that value. */
  severity?: AiEventSeverity | null;
  severityBasis?: AiEventSeverityBasis | null;
  /** Mutable analyst workflow, kept separate from policy outcome and severity. */
  triageStatus?: AiEventTriageStatus;
  triageClassification?: AiEventTriageClassification;
  resolutionReason?: AiEventResolutionReason | null;
  assigneeId?: string | null;
  secondsToTriaged?: number | null;
  secondsToResolved?: number | null;
  /** Trusted-emitter effect truth; null means the emitter did not report it. */
  intendedEffect?: string | null;
  actualEffect?: string | null;
  /**
   * M2: first-class causal grouping keys promoted from `metadata` so the
   * replay can group a prompt with everything it caused. Optional — additive.
   */
  taskId?: string | null;
  correlationId?: string | null;
  /**
   * M2.5: the surface the event originated on (cli|browser|ide), promoted from
   * `metadata.surface` to a first-class, indexed field so the web-AI console can
   * aggregate browser-surface events cheaply. Optional + nullable — additive:
   * older rows / non-set emitters read as absent. Denormalized query field; the
   * authoritative value stays in `metadata` and is NOT part of the event hash.
   */
  surface?: string | null;
  metadata: Record<string, unknown> | null;
  // Hash-chain (per-org, monotonic seq).
  seqNum: number;
  prevHash: string | null;
  eventHash: string;
}

/**
 * AI Control Plane — Wave 6 (MCP Governance V1).
 *
 * Approval lifecycle for a discovered MCP server:
 *   - 'pending'  — discovered by the scan, not yet reviewed (default).
 *   - 'approved' — an account admin explicitly allowed it.
 *   - 'blocked'  — an account admin explicitly disallowed it.
 */
export const MCP_APPROVAL_STATUSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.MCP_APPROVAL_STATUSES;

export type McpApprovalStatus = (typeof MCP_APPROVAL_STATUSES)[number];

/**
 * The static verdict the scan attached to an MCP server (from its
 * package/config risk analysis). Kept distinct from the approval lifecycle:
 * the verdict is what the scanner concluded, the approval is what the admin
 * decided.
 */
export const MCP_STATIC_VERDICTS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.MCP_STATIC_VERDICTS;

export type McpStaticVerdict = (typeof MCP_STATIC_VERDICTS)[number];

/**
 * One risk finding the scan attached to an MCP server. WIRE-SAFE: carries the
 * finding class + rule id + severity + occurrence count only — NEVER a raw
 * value, config content, or secret. Mirrors {@link AiPromptFindingShape}.
 */
export interface McpRiskFindingShape {
  class: string;
  ruleId: string;
  severity: string;
  count: number;
}

/**
 * A persisted MCP-server row as RETURNED by the console/agent read endpoints.
 * Timestamps are ISO-8601. Carries no raw env values or config content — only
 * the discovered identity, declared capabilities (names), and wire-safe
 * findings.
 */
export interface McpServerRowShape {
  id: string;
  orgId: string;
  siteId: string | null;
  endpointId: string | null;
  serverName: string;
  packageName: string | null;
  packageManager: string | null;
  transport: string | null;
  remoteUrl: string | null;
  launchIdentityDigest: string | null;
  authMode: string | null;
  authScopeDigest: string | null;
  tlsState: string | null;
  tlsPeerDigest: string | null;
  protocolVersion: string | null;
  toolListDigest: string | null;
  toolSchemaDigest: string | null;
  toolCoverageRatio: number | null;
  remoteInspectionState: 'not-applicable' | 'pending' | 'complete' | 'partial' | 'failed';
  driftStatus: 'baseline' | 'unchanged' | 'changed';
  lastInspectedAt: string | null;
  /** Remote inspection never claims access to server source code. */
  sourceCodeCoverage: 'not-claimed';
  sourceFile: string | null;
  capabilities: string[];
  riskFindings: McpRiskFindingShape[];
  staticVerdict: McpStaticVerdict | null;
  approvalStatus: McpApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  firstSeen: string;
  lastSeen: string;
  detectionCount: number;
  /**
   * F7d-A. WHICH CLIENT declared this server (`claude-code`, `codex`,
   * `cursor`, `vscode`, …) and at which scope. Descriptors only — they are NOT
   * part of the row identity, which stays
   * `(org_id, COALESCE(endpoint_id,''), server_name, COALESCE(package_name,''))`.
   * That means two clients declaring the SAME server name still collapse into
   * one row whose descriptors flip-flop per scan; these two fields make that
   * pre-existing collapse VISIBLE instead of silent. NULL on every row written
   * before an agent that reports them (no backfill exists, and inventing one
   * would be a claim about a scan that never happened).
   */
  clientId: string | null;
  configScope: McpDiscoveryScope | null;
}

// ── F7d-A — MCP DISCOVERY COVERAGE ──────────────────────────────────────────
//
// THE PROPERTY THESE TYPES EXIST TO CARRY: "we found no risky MCP servers" and
// "we could not read half this machine" must not be the same value. Before
// F7/F7d, discovery returned servers only, so a parse failure, an unreadable
// file and a genuinely clean box all rendered as one unqualified clean result.
//
// BACKEND-FIRST IS MANDATORY, NOT STYLISTIC. Agent routes run
// `AgentIngestValidationPipe` with `forbidNonWhitelisted: false`
// (src/common/pipes/agent-wire-dto.ts): a key the agent puts on the wire that
// the backend has not declared is SILENTLY DROPPED, not rejected. An agent
// shipped before this declaration would therefore appear to work in dev and be
// a no-op in prod — the invisible-producer failure class. Hence: declare here,
// then the DTO, then the agent.
//
// MIRROR SCOPE: `ai-governance-contract.ts` exists ONLY in
// `Backend/packages/shared-contracts`. The three-mirror parity rule that binds
// `cache-schema.ts` and the scanner contracts does NOT apply to this file —
// neither the workspace root package nor Ceragon-Intelligence carries it, and
// creating it there would be new unreviewed surface. Verified 2026-08-16.

/**
 * The CLOSED coverage vocabulary, mirroring the endpoint's own
 * `mcpsources.ParseState` (Installers internal/mcpsources/mcpsources.go) token
 * for token. Ordered: the three ANSWERS first, then the three NON-answers.
 *
 *   parsed        read and understood; `serverCount` servers declared
 *   empty         read and understood; it declares no servers
 *   absent        looked, and it is not there — an OBSERVATION, not a failure
 *   unreadable    it is there and DeVoid could not read it
 *   unparseable   read, but not understood in its declared format
 *   unrecognized  a config-shaped file in a registered location, in a format
 *                 this build has no reader for (basename evidence only —
 *                 never read, so never a claim about its contents)
 *
 * Append-only (LOCK-8): a future state goes on the END, never in the middle.
 */
export const MCP_DISCOVERY_STATES = [
  'parsed',
  'empty',
  'absent',
  'unreadable',
  'unparseable',
  'unrecognized',
] as const;

export type McpDiscoveryState = (typeof MCP_DISCOVERY_STATES)[number];

/**
 * The states that are a real ANSWER about a location. "A check that cannot
 * answer never reports a clean pass" — any coverage set containing a state
 * outside this list must suppress an unqualified clean verdict on every
 * surface that renders it.
 */
export const MCP_DISCOVERY_ANSWERED_STATES = ['parsed', 'empty', 'absent'] as const;

export function isMcpDiscoveryStateAnswered(state: string): boolean {
  return (MCP_DISCOVERY_ANSWERED_STATES as readonly string[]).includes(state);
}

/** Whose configuration a source is. Mirrors `mcpsources.Scope`. */
export const MCP_DISCOVERY_SCOPES = ['user', 'project', 'machine'] as const;
export type McpDiscoveryScope = (typeof MCP_DISCOVERY_SCOPES)[number];

/** On-disk syntax of a source. Mirrors `mcpsources.Format`. */
export const MCP_DISCOVERY_FORMATS = ['json', 'toml'] as const;
export type McpDiscoveryFormat = (typeof MCP_DISCOVERY_FORMATS)[number];

/**
 * The CLOSED `detail` vocabulary, mirroring `mcpsources` Detail* constants.
 * A TOKEN, never a raw Go error and never file bytes: interpolating an error
 * into an operator-facing record is how a durable record came to state that a
 * valid TOML file "is not parseable JSON".
 */
export const MCP_DISCOVERY_DETAILS = [
  'not-found',
  'permission-denied',
  'not-a-regular-file',
  'symlink-refused',
  'exceeds-max-size',
  'io-error',
  'json-syntax-error',
  'toml-syntax-error',
  'no-reader-for-format',
  'no-servers-declared',
] as const;

export type McpDiscoveryDetail = (typeof MCP_DISCOVERY_DETAILS)[number];

/**
 * One coverage row AS POSTED BY THE AGENT on `POST /api/v1/ai/mcp/scan`
 * (`coverage[]`). WIRE-SAFE: a source PATH and closed-vocabulary tokens only —
 * never file contents.
 *
 * `sourceFile` is the endpoint's `mcpsources.SourceCoverage.Path`. The wire
 * name is `sourceFile` (not `path`) so it matches the name `McpScanServerDto`
 * already uses for the same concept; the Go mirror
 * (`internal/core/backend/mcp.go`) must tag it `json:"sourceFile"`.
 */
export interface McpScanCoverageShape {
  clientId: string;
  scope: McpDiscoveryScope;
  format: McpDiscoveryFormat;
  sourceFile: string | null;
  state: McpDiscoveryState;
  serverCount: number;
  detail: McpDiscoveryDetail | null;
}

/**
 * One PERSISTED coverage row as returned to the console. Identity is
 * `(org_id, COALESCE(endpoint_id,''), client_id, scope, COALESCE(source_file,''))`.
 */
export interface McpDiscoveryCoverageRowShape extends McpScanCoverageShape {
  id: string;
  orgId: string;
  siteId: string | null;
  endpointId: string | null;
  /** Derived from `state` via {@link isMcpDiscoveryStateAnswered}. */
  answered: boolean;
  lastSeen: string;
}

/**
 * The count line the console renders above the MCP table, and the ONLY sound
 * basis for its empty state.
 *
 * `reported` is the load-bearing field. It is FALSE when no coverage has ever
 * been posted for the scope — which is what an agent older than the coverage
 * wire produces, since its (absent) coverage field cannot be distinguished
 * from one that was dropped. A surface must render `reported === false` as
 * "DeVoid cannot say which configuration sources were read", NEVER as full
 * coverage and never as a clean world.
 */
export interface McpCoverageSummaryShape {
  reported: boolean;
  /** Total registered sources the endpoints reported on. */
  sourcesTotal: number;
  /** Sources that produced an ANSWER (parsed | empty | absent). */
  sourcesAnswered: number;
  /** Sources DeVoid could not read or could not understand. */
  sourcesUnanswered: number;
  /** Endpoints in scope that reported coverage at all. */
  endpointsReporting: number;
}

/**
 * M3 Rollout Governance — team-scoped policy resolution vocabulary (LOCK-4).
 *
 * The scope an AI security policy resolves AT. Resolution folds org → site →
 * team, strictest-wins, server-side. A no-team endpoint resolves at 'site'
 * (byte-identical to today); a team-governed endpoint folds in the strictest
 * team tier and resolves at 'team'.
 *
 * Appended (never re-ordered) so the generated artifact, always-on parity, and
 * append-only tuple discipline (LOCK-8) remain aligned.
 */
export const AI_POLICY_SCOPES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_POLICY_SCOPES;

export type AiPolicyScope = (typeof AI_POLICY_SCOPES)[number];

/**
 * A read-model summary of how an endpoint's / team's effective policy resolved
 * (the console renders the strictest-wins explainer from this). Content-free.
 */
export interface AiPolicyScopeSummaryShape {
  scope: AiPolicyScope;
  siteId: string | null;
  teamId: string | null;
  /** The named Role/profile applied, when the tier came from one. */
  appliedProfileId: string | null;
  updatedAt: string | null;
}

/**
 * W6/C — the observation-surface vocabulary (cross-repo contract §1).
 *
 * `surface` says HOW a checkpoint reached us: an on-box CLI hook, the browser
 * extension, an IDE extension, the desktop app, the provider-egress wire proxy,
 * or an MCP server. It is a DIFFERENT axis from `agentType` (whose agent) and
 * `clientKind` (which client binary).
 *
 * IT IS DELIBERATELY NOT A WIRE ENUM. `surface` used to be
 * `@IsIn(['cli','browser','ide'])` on `POST /ai/prompt/check` and
 * `POST /ai/tool/check`. The Backend ValidationPipe runs `forbidNonWhitelisted`,
 * so a value outside that enum did not cost a chip — it 400-rejected the WHOLE
 * report, taking the event's findings (and therefore its severity band) with it.
 * That class of defect has now cost three separate incidents on this route
 * family. The wire bound is `@IsString @MaxLength(32)`; the closed set below is
 * enforced at STORAGE via `normalizeSourceSurface`, which collapses anything it
 * does not recognise to `unknown`. Same pattern, same rationale as `clientKind`.
 *
 * APPEND-ONLY. Never re-order, never remove — stored rows carry these values.
 *
 * NOTE: the Backend RUNTIME imports a byte-identical local mirror
 * (`src/ai-governance/ai-source-surface.ts`) rather than this specifier, for the
 * same dist-resolution reason documented on `AI_PLANES` below.
 */
export const AI_SOURCE_SURFACES = [
  'cli',
  'browser',
  'ide',
  'desktop',
  'web-ai-proxy',
  'mcp',
  'unknown',
] as const;

export type AiSourceSurface = (typeof AI_SOURCE_SURFACES)[number];

/**
 * The canonical stored default when nothing was reported. LOWERCASE, because
 * production holds this column in two casings (`cli` ×208, `CLI` ×35 as of
 * 2026-08-01) — the Backend default used to be the literal `'CLI'` while every
 * agent producer sends `'cli'`, and Postgres equality is case-sensitive, so any
 * GROUP BY / filter silently split the fleet in two.
 */
export const DEFAULT_SOURCE_SURFACE: AiSourceSurface = 'cli';

/** True only for a value that IS one of the frozen slugs above (already folded). */
export function isKnownSourceSurface(value: unknown): value is AiSourceSurface {
  return typeof value === 'string' && (AI_SOURCE_SURFACES as readonly string[]).includes(value);
}

/**
 * Case-fold an untrusted surface for STORAGE: trim + lowercase, nothing else.
 *
 * Information-preserving by construction — no value is ever replaced by
 * another — so EVERY producer can fold safely, including the lanes that emit
 * surfaces with no agent-wire slug (`browser-composer` / `browser-upload` from
 * the evidence-batch lane, `ci` from `context.callerType`).
 *
 * Absent / blank / non-string → `null`; the caller owns its own default.
 */
export function foldSourceSurface(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const folded = value.trim().toLowerCase();
  return folded.length === 0 ? null : folded;
}

/**
 * Normalize an untrusted AGENT-WIRE surface for STORAGE: fold, then collapse
 * anything outside {@link AI_SOURCE_SURFACES} to the explicit `unknown` slug.
 *
 * ABSENT STAYS ABSENT (`null`). An off-vocabulary value is a fact ("the agent
 * told us something we cannot trust"), never a 400.
 *
 * ONLY for the agent routes that used to carry the `@IsIn`. Other lanes use
 * {@link foldSourceSurface} so their legitimate sub-surfaces survive.
 */
export function normalizeSourceSurface(value: unknown): AiSourceSurface | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'unknown';
  const folded = foldSourceSurface(value);
  if (folded === null) return null;
  return isKnownSourceSurface(folded) ? folded : 'unknown';
}

/**
 * True when a STORED surface carries no more information than the default —
 * absent, blank, `cli`, or `unknown`, in ANY casing. This is the predicate that
 * lets a session's surface be UPGRADED to a more specific observation while
 * never being DOWNGRADED back to the default.
 *
 * Keyed off the FOLDED value on purpose: `browser-composer` has no agent-wire
 * slug but is highly specific, and must not be treated as upgradable.
 */
export function isDefaultSourceSurface(value: unknown): boolean {
  const folded = foldSourceSurface(value);
  if (folded === null) return true;
  return folded === 'cli' || folded === 'unknown';
}

/**
 * Console plane scoping (IA v3, 2026-07-17; constants verified vs prod DISTINCT
 * values 2026-07-17).
 *
 * The three self-contained console planes each carry their OWN scoped
 * Sessions/Events. These read APIs (`GET /api/v1/ai/sessions`,
 * `GET /api/v1/ai/activity`) accept `?plane=` and resolve rows to at most one
 * plane via the DISJOINT rule below.
 *
 * NOTE: the Backend RUNTIME imports a byte-identical local mirror
 * (`src/ai-governance/ai-plane.constants.ts`) rather than this specifier, because
 * `@ceragon/shared-contracts` resolves to a pre-built `dist` and would not surface
 * a freshly-added export. This copy is the contract home; keep them in lockstep.
 * Appended (never re-ordered) so the Backend parity regex + the append-only tuple
 * discipline hold.
 */
export const AI_PLANES = ['web', 'coding', 'autonomous'] as const;
export type AiPlane = (typeof AI_PLANES)[number];

/** Web plane by agent identity (rows whose agent IS the browser/web guard, whatever surface recorded them). */
export const WEB_AGENT_TYPES = ['browser', 'chat', 'web-ai'] as const;

/** Web plane by observation surface (employees using browser AI). */
export const WEB_SURFACES = ['browser', 'browser-composer', 'browser-upload'] as const;

export const CODING_AGENT_TYPES = [
  'claude-code',
  'codex',
  'cursor',
  'cli',
  'bench',
  'manual-test',
] as const;

/**
 * mcp            → cera mcp serve tool calls (Installers/internal/mcpserve/executor.go:101; flag-gated, near-zero today)
 * mcp-governance → real MCP block/quarantine enforcement events (Installers/internal/daemon/mcp_governance_event.go:57)
 * NOTE: "automation" was removed — zero producers exist anywhere (M4.8 will add the agent gateway; extend then).
 */
export const AUTONOMOUS_AGENT_TYPES = ['mcp', 'mcp-governance'] as const;

/**
 * DISJOINT plane resolution rule (planes are mutually exclusive — a row belongs
 * to at most one plane). ALL matching is case-INSENSITIVE (prod has both `CLI`
 * and `cli`) and NULL-safe. The surface column differs per table:
 * `ai_sessions.source_surface` vs `ai_events.surface`.
 *
 *   1. web         when surface ∈ WEB_SURFACES OR agent_type ∈ WEB_AGENT_TYPES.
 *   2. autonomous  when agent_type ∈ AUTONOMOUS_AGENT_TYPES AND NOT web.
 *   3. coding      when agent_type ∈ CODING_AGENT_TYPES AND NOT web (deliberately
 *                  includes surface='web-ai-proxy' rows — coding agents seen at the
 *                  provider-egress wire proxy).
 *   4. else        EXCLUDED from plane-scoped views (all-planes views only).
 */

// ── CX-7 — THE AUTHORIZED OPT-OUT TRANSITION ────────────────────────────────

/**
 * The coverage state a runtime is IN, as the ENDPOINT reports it. Mirrors
 * `internal/aiwire.OptOutState`.
 *
 * `SKIPPED_AUTHORIZED` is NEVER green: a runtime carrying an opt-out is visibly
 * MISSING and AUTHORIZED, which is not the same fact as governed.
 *
 * ORDERED WORST-LAST, because the Backend's coverage ladder is BUILT FROM THIS
 * TUPLE rather than restating it — `AI_OPTOUT_COVERAGE_STATES` in
 * `src/ai-governance/dto/ai-response.dto.ts` is
 * `['NOT_REPORTED', 'COVERED', ...AI_OPTOUT_STATES]`. The two backend-derived
 * rungs are prepended there because no endpoint ever reports them: 'COVERED' is
 * what an observed RESTORE means and 'NOT_REPORTED' is measured absence, and
 * neither is a state a runtime can be in on the box. A member removed from this
 * tuple therefore removes a rung from the console ladder and stops compiling in
 * the reader that ranks them, which is the point: this is the one list.
 */
export const AI_OPTOUT_STATES = ['OPTOUT_EXPIRED', 'SKIPPED_AUTHORIZED'] as const;
export type AiOptOutState = (typeof AI_OPTOUT_STATES)[number];

/**
 * What happened. Mirrors the `OptOutTransition*` slugs in
 * `internal/aiwire/optout.go`. Closed slugs, never prose.
 */
export const AI_OPTOUT_TRANSITIONS = [
  'ai-optout-taken',
  'ai-optout-restored',
  'ai-optout-lapsed',
] as const;
export type AiOptOutTransition = (typeof AI_OPTOUT_TRANSITIONS)[number];

/**
 * §10 register #15 — THE SEVEN KEYS THAT SAY WHAT HAPPENED.
 *
 * `cmd/devoid/ai_optout_surface.go` stamps exactly these on every coverage
 * transition. They were measured landing in `ai_events.metadata` and then being
 * dropped by the read-side projection, so the stored row could not name the
 * runtime, the state, the authorizing actor, the lever the user reached for, or
 * when the authorization lapses — only a free-text `reason`.
 *
 * THIS TUPLE IS THE ONE LIST. Every gate the keys pass — the endpoint's local
 * integrity mirror (`integrityDetailAllowlist`), the evidence spool
 * (`evidenceMetadataKeys`), and the Backend's read projection
 * (`AiQueryService.safeMetadata`) — is keyed off it, so a key that clears one
 * gate and not the next is a contract edit rather than a silent disappearance.
 */
export const AI_OPTOUT_TRANSITION_METADATA_KEYS = [
  'transition',
  'runtime',
  'state',
  'actor',
  'reason',
  'lever',
  'expiresAt',
] as const;
export type AiOptOutTransitionMetadataKey = (typeof AI_OPTOUT_TRANSITION_METADATA_KEYS)[number];

/**
 * The subset of the seven that a COVERAGE ROW carries verbatim as a nullable
 * string, and the shape of `AiOptOutCoverageRowDto`'s detail half is generated
 * from it — see `src/ai-governance/dto/ai-response.dto.ts`.
 *
 * `transition` and `state` are excluded because the coverage read does NOT
 * carry them verbatim: it DERIVES the row's `state` from the transition slug
 * through a closed table, so an endpoint that stamps a `state` it likes cannot
 * name its own rung on the console. Every other member is the endpoint's text,
 * bounded on read and never interpreted.
 *
 * A key added here without a matching row member stops compiling, and a key
 * removed from here removes the row member — which is what makes this tuple the
 * one list rather than a comment about one.
 */
export const AI_OPTOUT_TRANSITION_DETAIL_KEYS = AI_OPTOUT_TRANSITION_METADATA_KEYS.filter(
  (k): k is Exclude<AiOptOutTransitionMetadataKey, 'transition' | 'state'> =>
    k !== 'transition' && k !== 'state'
);
export type AiOptOutTransitionDetailKey = Exclude<
  AiOptOutTransitionMetadataKey,
  'transition' | 'state'
>;

/**
 * The projected shape of an opt-out transition on a console row. Every field is
 * OPTIONAL and ABSENT means "this build did not report it" — never a fabricated
 * default. An older agent that stamps none of them renders exactly as it does
 * today.
 */
export type AiOptOutTransitionMetadata = {
  /** Which transition: taken / restored / lapsed. */
  transition?: string;
  /** Agent token the transition is about (`codex`, `claude-code`). */
  runtime?: string;
  /** Coverage state the endpoint is IN after the transition. */
  state?: string;
  /** WHO authorized it, as the endpoint resolved it. Best-effort by design. */
  actor?: string;
  /** WHY, as the operator typed it on the command line. */
  reason?: string | null;
  /** WHICH escape hatch produced the transition (CX-11). */
  lever?: string;
  /** When the authorization lapses, RFC3339. Absent means no expiry was set. */
  expiresAt?: string;
};

/** True only for a value that IS one of the frozen coverage states. */
export function isAiOptOutState(value: unknown): value is AiOptOutState {
  return typeof value === 'string' && (AI_OPTOUT_STATES as readonly string[]).includes(value);
}

/** True only for a value that IS one of the frozen transition slugs. */
export function isAiOptOutTransition(value: unknown): value is AiOptOutTransition {
  return typeof value === 'string' && (AI_OPTOUT_TRANSITIONS as readonly string[]).includes(value);
}

/**
 * Adjudication state on a production triage row (M4.7A Wave 6 Task 9).
 *
 * MIRRORS THE CORPUS VERBATIM. These are `governance.adjudication.status` from
 * the embedded contract spine, in the spine's own order, and the mapping Wave
 * 3B Task 12 committed requires the production row to take those values
 * unchanged. One vocabulary, two storage locations - the evaluation side and
 * the production side are only comparable if the same fact is spelled the same
 * way, and two field names for one fact is the defect these waves exist to
 * remove.
 *
 *   NOT_REQUIRED  one labeler, or none. Nothing to adjudicate.
 *   AGREED        two distinct labelers reached the same verdict, or an
 *                 adjudicator settled a dispute.
 *   THIRD_REVIEW  two distinct labelers disagreed and nobody has settled it.
 *                 The row keeps the FIRST verdict and is marked disputed.
 *   UNRESOLVED    an adjudicator looked and could not decide.
 */
export const AI_EVENT_ADJUDICATION_STATUSES = [
  'NOT_REQUIRED',
  'AGREED',
  'THIRD_REVIEW',
  'UNRESOLVED',
] as const;
export type AiEventAdjudicationStatus = (typeof AI_EVENT_ADJUDICATION_STATUSES)[number];

/**
 * The role a labeler acted in. Mirrors `governance.labelers[].role` from the
 * spine, same four values, same order.
 *
 * The FIRST labeler's role is `SECURITY_REVIEWER` by construction - it is the
 * console analyst - so only the second labeler's role is stored, because it is
 * the one that varies.
 */
export const AI_EVENT_LABELER_ROLES = [
  'AUTHOR',
  'SECURITY_REVIEWER',
  'PRIVACY_REVIEWER',
  'ADJUDICATOR',
] as const;
export type AiEventLabelerRole = (typeof AI_EVENT_LABELER_ROLES)[number];
