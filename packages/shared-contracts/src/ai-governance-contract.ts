/**
 * AI Control Plane — Wave 1 shared contract.
 *
 * Canonical shapes for AI session/event tracking. Consumed by:
 *   - Backend (`src/ai-governance/*`) — mirrored via a snapshot + parity
 *     test rather than a runtime import (same inlined-with-parity pattern
 *     as `decision-contract.ts` → `check-packages-response.dto.ts`).
 *   - Frontend AI Control Plane views (Wave 2+).
 *
 * These are DATA-SHAPE contracts only — no NestJS/TypeORM coupling. The
 * `AIEventType` and `PROMPT_EVIDENCE_MODES` tuples are `as const` so both
 * the TypeScript union and the runtime array are exported (the parity test
 * on the Backend side extracts them by regex).
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
 * Metadata for all five stays redaction-safe (class / count / disposition /
 * reason-slug only — NEVER raw prompt/file content).
 *
 * NOTE: keep this tuple free of in-array comments — the Backend parity test
 * regex-extracts it by splitting on commas.
 */
export const AI_EVENT_TYPES = [
  'PROMPT_SUBMITTED',
  'PROMPT_REDACTED',
  'PROMPT_BLOCKED',
  'AI_RESPONSE_RECEIVED',
  'TOOL_CALL_REQUESTED',
  'TOOL_CALL_BLOCKED',
  'MCP_SERVER_ADDED',
  'MCP_SERVER_APPROVED',
  'MCP_SERVER_BLOCKED',
  'MCP_QUARANTINE_APPLIED',
  'MCP_QUARANTINE_RESTORED',
  'MCP_TOOL_INVOKED',
  'PACKAGE_INSTALL_REQUESTED',
  'PACKAGE_INSTALL_BLOCKED',
  'PACKAGE_INSTALL_ALLOWED',
  'FILE_WRITE_OBSERVED',
  'DIFF_SCAN_COMPLETED',
  'GIT_PUSH_BLOCKED',
  'POLICY_EXCEPTION_REQUESTED',
  'POSTURE_DRIFT',
  'CODE_DIFF_SCANNED',
  'CODE_DIFF_FLAGGED',
  'EXCEPTION_REQUESTED',
  'AGENT_CONTROL_TAMPER',
  'INGRESS_REDACTED',
  'CONTEXT_TAINTED',
  'TOOL_CALL_HELD',
  'UPLOAD_BLOCKED',
  'UPLOAD_NOT_INSPECTED',
] as const;

export type AIEventType = (typeof AI_EVENT_TYPES)[number];

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
export const PROMPT_EVIDENCE_MODES = [
  'OFF',
  'HASH_ONLY',
  'REDACTED',
  'FULL_WITH_APPROVAL',
] as const;

export type PromptEvidenceMode = (typeof PROMPT_EVIDENCE_MODES)[number];

/**
 * Canonical policy-decision union for AI events, mapped 1:1 from the
 * package-decision `VerdictType` (see `decision-contract.ts`). Kept as a
 * distinct alias so an AI-plane consumer does not need to import the
 * package decision contract, and so the AI-plane can add plane-specific
 * decisions later without widening the package verdict surface.
 */
export const AI_POLICY_DECISIONS = [
  'ALLOW',
  'ALLOW_FAST',
  'PROMPT',
  'HOLD',
  'BLOCK',
  'PENDING',
  'INCONCLUSIVE',
] as const;

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
export const AI_DLP_BLOCK_CLASSES = ['private-key', 'aws-secret-key'] as const;

// The redact tier: the last 10 (openai-key … google-oauth-secret) are the M4
// (WS-C) structured provider/service credential classes the daemon + browser
// engines detect. Redact (mask + let the prompt through) matches the
// sibling-secret tier; an admin can escalate to block or relax to warn/allow.
// NOTE: entries here MUST be bare string literals (no inline comments) — the
// contract-parity spec extracts this tuple by a text regex.
export const AI_DLP_REDACT_CLASSES = [
  'aws-access-key',
  'gcp-key',
  'azure-key',
  'generic-api-key',
  'jwt',
  'slack-token',
  'github-token',
  'internal-url',
  'openai-key',
  'anthropic-key',
  'stripe-live',
  'slack-webhook',
  'sendgrid-key',
  'twilio-key',
  'npm-token',
  'pypi-token',
  'gitlab-token',
  'google-oauth-secret',
] as const;

// The warn tier. kubeconfig / db-connection-string are M4 (WS-C) ambiguous
// shapes — a redacted sample kubeconfig / a connection string is common in
// benign context, so they WARN rather than mask by default; an admin can
// escalate per class. Matches the browser-extension DEFAULT_POLICY tiers
// exactly (Installers/browser-extension/src/dlp.js). NOTE: the daemon's
// `base64-wrapped-secret` detector is deliberately NOT tiered here — like the
// browser default it falls to the built-in WARN default (policyeval), keeping
// this heuristic out of the configurable closed set.
export const AI_DLP_WARN_CLASSES = [
  'high-entropy',
  'kubeconfig',
  'db-connection-string',
] as const;

/** The union of every DLP class across block/redact/warn tiers. */
export const AI_DLP_CLASSES = [
  ...AI_DLP_BLOCK_CLASSES,
  ...AI_DLP_REDACT_CLASSES,
  ...AI_DLP_WARN_CLASSES,
] as const;

export type AiDlpClass = (typeof AI_DLP_CLASSES)[number];

/**
 * The four decisions the daemon prompt-guard reports (and the backend may
 * upgrade). Maps onto AI event types: allow/warn→PROMPT_SUBMITTED,
 * redact→PROMPT_REDACTED, block→PROMPT_BLOCKED.
 */
export const AI_PROMPT_DECISIONS = ['allow', 'warn', 'redact', 'block'] as const;

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
export const AI_DATA_DISPOSITIONS = [
  'SENT_ALLOWED',
  'REDACTED_THEN_SENT',
  'BLOCKED_BEFORE_EGRESS',
  'HELD',
  'NEVER_LEFT',
  'BLOCKED_EGRESS_HOST',
  'RELEASED_ONCE',
] as const;

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
  surface?: 'cli' | 'browser' | 'ide';
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

/** Response shape for `GET /api/v1/ai/policy`. */
export interface AiPolicyShape {
  evidenceMode: PromptEvidenceMode;
  blockedProviders: string[];
  toleratedProviders: string[];
  dlp: AiDlpPolicyShape;
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
export const AI_INVENTORY_KINDS = ['ai-tool', 'ai-rule'] as const;

export type AiInventoryKind = (typeof AI_INVENTORY_KINDS)[number];

/**
 * Per-org governance status for an AI provider. 'observed' is the default
 * when no explicit policy row exists; approved / tolerated / blocked are set
 * by an admin via `PATCH /api/v1/ai/providers/:providerKey/policy`.
 */
export const AI_PROVIDER_POLICY_STATUSES = [
  'approved',
  'tolerated',
  'blocked',
  'observed',
] as const;

export type AiProviderPolicyStatus =
  (typeof AI_PROVIDER_POLICY_STATUSES)[number];

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
  dataClasses: string[] | null;
  evidenceRef: string | null;
  /**
   * M2: secret-free data-movement verdict (what did / did not leave the box).
   * Optional + nullable — additive: emitters that don't set it and older rows
   * read as absent, and the read model derives the sent/redacted/blocked
   * subset from existing fields when null.
   */
  disposition?: AiDataDisposition | null;
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
export const MCP_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'blocked',
] as const;

export type McpApprovalStatus = (typeof MCP_APPROVAL_STATUSES)[number];

/**
 * The static verdict the scan attached to an MCP server (from its
 * package/config risk analysis). Kept distinct from the approval lifecycle:
 * the verdict is what the scanner concluded, the approval is what the admin
 * decided.
 */
export const MCP_STATIC_VERDICTS = ['allow', 'warn', 'block'] as const;

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
}

/**
 * M3 Rollout Governance — team-scoped policy resolution vocabulary (LOCK-4).
 *
 * The scope an AI security policy resolves AT. Resolution folds org → site →
 * team, strictest-wins, server-side. A no-team endpoint resolves at 'site'
 * (byte-identical to today); a team-governed endpoint folds in the strictest
 * team tier and resolves at 'team'.
 *
 * Appended (never re-ordered) so the Backend parity regex + the append-only
 * tuple discipline (LOCK-8) hold.
 */
export const AI_POLICY_SCOPES = ['org', 'site', 'team'] as const;

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
