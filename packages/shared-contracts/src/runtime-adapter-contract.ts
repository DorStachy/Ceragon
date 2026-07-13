/**
 * M4.5 — Native AI Runtime Adapter Backbone (Gate-0 contract surface).
 *
 * Canonical, content-free shapes for the runtime-is-subject model: one adapter
 * per AI *runtime* (Claude Code, later Codex/Cursor), connected through that
 * runtime's official lifecycle hooks + managed configuration, normalized into
 * one canonical Cera/Devoid event, decided by the existing daemon engines, and
 * reported through an honest, per-checkpoint capability-certification model.
 *
 * Consumed by:
 *   - Installers daemon (`internal/airuntime`, Go) — conforms BY CONVENTION
 *     (no compiler link); the marshalling/attestation tests are the guard.
 *   - Backend (`src/ai-governance/*`) — mirrored via the snapshot + parity
 *     spec (`ai-governance-contract.snapshot.ts` +
 *     `ai-governance-contract.parity.spec.ts`), same inlined-with-parity
 *     pattern as the rest of the AI-governance contract.
 *   - Frontend AI Control Plane / Protection-Depth views (`types/ai-governance.ts`).
 *
 * NOT mirrored to `Ceragon-Intelligence/packages/shared-contracts` (per PRD D9 —
 * that mirror carries only inventory/worker/scanner contracts).
 *
 * STYLE / PARITY DISCIPLINE (Gate-0 #9, PRD D9):
 *   - Closed vocabularies (`coverageDepth` / `enforcementEffect` /
 *     `certificationState` / governance disposition / canonical hook events)
 *     are `as const` tuples — the Backend parity spec extracts them by a text
 *     regex, so the tuples MUST hold bare string literals only, with NO
 *     in-array comments, and are APPEND-ONLY (never re-ordered).
 *   - Identity fields (`host` / `runtime` / `integration` / `executionLocation`
 *     / `agentType` / `platform` / `hookDialect` / `configSource` /
 *     `deploymentAssurance`) follow the established FREE-FORM-STRING discipline
 *     (`@IsString`, no `@IsIn`) — there is no runtime/host/agentType enum today
 *     and inventing one would break honest detection of unknown dialects.
 *
 * PRIVACY INVARIANT: like every other AI-plane contract, these shapes carry
 * ONLY identifiers / enums / hashes / booleans / short version strings / RFC3339
 * timestamps. NEVER a raw prompt, tool output, command, secret, or file content.
 */

/**
 * §20.1 — AI interaction/runtime **coverage depth**: which checkpoints the
 * mechanism can mediate for a runtime. A genuinely new axis (distinct from the
 * shipped control/readiness/provider vocabularies, which express control state,
 * not depth of governance). Ordered strongest → weakest:
 *   - full-loop-governed        — prompt pre-send + pre-tool + context-ingress/
 *                                 output-replace + lifecycle/session evidence
 *                                 all certified & fresh for the named tuple.
 *   - partial-native-governance — official hooks mediate SOME but not all
 *                                 material checkpoints; blind checkpoints listed.
 *   - provider-traffic-governed — provider request/response bytes routed through
 *                                 an enforced proxy; native tool/file may be unseen.
 *   - security-context-only     — runtime can ASK Cera for context; Cera is not
 *                                 an authoritative action gate.
 *   - detected-only             — runtime/use inventoried/inferred; no blocking
 *                                 checkpoint proven.
 *   - not-endpoint-governed     — work executes outside the endpoint subject
 *                                 (e.g. a cloud agent) or the integration is
 *                                 unsupported.
 *   - provider-egress-control   — M4.6 APPEND (tail-only): the wire path
 *                                 enforces on provider-bound egress traffic
 *                                 (SC6). Appended after the strength-ordered
 *                                 members per the append-only tuple discipline,
 *                                 so it deliberately sits OUTSIDE that order.
 * (The §20.1 `workforce-web-request-governed` Web-AI-Guard depth is a SEPARATE
 * Web-surface axis — deliberately not in this runtime-coverage tuple per D10.)
 */
export const COVERAGE_DEPTHS = [
  'full-loop-governed',
  'partial-native-governance',
  'provider-traffic-governed',
  'security-context-only',
  'detected-only',
  'not-endpoint-governed',
  'provider-egress-control',
] as const;

export type CoverageDepth = (typeof COVERAGE_DEPTHS)[number];

/**
 * D7 — the **enforcement effect** actually applied at a terminal branch,
 * recorded ALONGSIDE (never inferring, and never inferred from) the policy
 * decision. Stamp points: proxy block → `deny-prompt`; proxy/ingress redact →
 * `rewrite-input`; warn/hold → `stop-continuation`; hook deny → `deny-tool`;
 * post-tool taint → `audit-only`; NEW post-tool replace → `replace-output`.
 *
 * `none` (Gate-0 #9) is the explicit "allow / no enforcement effect" member so
 * an allowed action records a truthful effect rather than an ambiguous NULL.
 * Its APPEND at the tail is deliberate. The event-side field is ADDITIONALLY
 * nullable (`enforcementEffect?: ... | null`): older producers that pre-date
 * this axis omit it and read as `null`; new emitters stamp `none` on allow.
 * This is exactly the `ai_events.surface` promotion recipe (nullable additive
 * column + authoritative value carried in secret-free metadata).
 *
 * M4.6 APPENDS (tail-only, append-only — the Codex adapter's terminal effects):
 * `add-developer-context` (inject guidance without blocking the action),
 * `deny-escalation`/`allow-escalation` (the SC6 permission-escalation checkpoint
 * outcomes), and `replace-tool-result-with-feedback-and-continue` (SC2 — swap a
 * tool result for feedback and let the agent loop continue). Same tail discipline
 * as `none`, so the frozen parity tuple stays order-stable.
 */
export const ENFORCEMENT_EFFECTS = [
  'deny-prompt',
  'deny-tool',
  'rewrite-input',
  'replace-output',
  'stop-continuation',
  'audit-only',
  'none',
  'add-developer-context',
  'deny-escalation',
  'allow-escalation',
  'replace-tool-result-with-feedback-and-continue',
] as const;

export type EnforcementEffect = (typeof ENFORCEMENT_EFFECTS)[number];

/**
 * D8 — the per-`(adapter × checkpoint)` **capability-certification ladder**.
 * A checkpoint advances documented → configured → loaded → observed →
 * enforcement-tested; ONLY `observed`/`enforcement-tested` may render "Active."
 * Certification is honest reporting, NOT a feature flag — it never disables a
 * control, it only refuses to CLAIM one is enforcing before it is proven.
 * (Distinct from the §20.2 rendered attestation states — active/observed/
 * installed-unverified/unverified-version/drifted/stale/unsupported/unknown —
 * which are a Backend-derived render concern for Phase 1, not this ladder.)
 */
export const CERTIFICATION_STATES = [
  'documented',
  'configured',
  'loaded',
  'observed',
  'enforcement-tested',
] as const;

export type CertificationState = (typeof CERTIFICATION_STATES)[number];

/**
 * D2 — the **canonical hook-event vocabulary**. Runtime-specific hook names are
 * normalized onto these before they reach the daemon engines, so one decision
 * path serves every adapter. The first three map 1:1 onto shipped daemon routes
 * (D2): USER_PROMPT_SUBMIT → /v1/ai/prompt-check, PRE_TOOL_USE →
 * /v1/ai/tool-decision, POST_TOOL_USE → /v1/ai/post-tool. CONFIG_CHANGE (D6 /
 * US-17 config/skill tamper) and the SESSION_START/SESSION_END/SUBAGENT_STOP
 * lifecycle events (D5 / US-18 session+subagent correlation) are APPENDED.
 * Append-only so later adapters add events without re-touching this tuple.
 * M4.6 APPENDS (tail-only) `PERMISSION_REQUEST` (the SC6 permission checkpoint)
 * plus the SC8 confirmed-firing `PRE_COMPACT`/`POST_COMPACT` compaction events
 * and `SUBAGENT_START` (D5 subagent-lifecycle open, pairing with SUBAGENT_STOP).
 */
export const CANONICAL_HOOK_EVENTS = [
  'USER_PROMPT_SUBMIT',
  'PRE_TOOL_USE',
  'POST_TOOL_USE',
  'CONFIG_CHANGE',
  'SESSION_START',
  'SESSION_END',
  'SUBAGENT_STOP',
  'PERMISSION_REQUEST',
  'PRE_COMPACT',
  'POST_COMPACT',
  'SUBAGENT_START',
] as const;

export type CanonicalHookEvent = (typeof CANONICAL_HOOK_EVENTS)[number];

/**
 * §20.5 — **governance disposition**: an INDEPENDENT axis (Gate-0 #9) that says
 * how — and whether — a named action was actually mediated. It never infers,
 * and is never inferred from, the policy decision, the enforcement effect, the
 * capability state, or the deployment assurance.
 *   - devoid-mediated              — traversed a certified Devoid checkpoint; the
 *                                    actual enforcement effect is recorded.
 *   - delegated-and-attested       — a named external restriction owns
 *                                    enforcement AND a built, certified
 *                                    mechanism-specific connector supplied fresh
 *                                    authenticated evidence for that restriction.
 *                                    Unavailable by default; never "Cera-mediated."
 *   - restricted-intent-unverified — policy says the path should be unavailable,
 *                                    but Cera has no fresh proof it is. Non-green.
 *   - observed-only                — trustworthy visibility, no authoritative
 *                                    deny/rewrite checkpoint for the action.
 *   - not-governed                 — no in-scope Cera or delegated control
 *                                    mediates, or the subject is out of boundary.
 *   - wire-observed-after-dispatch — M4.6 wire path: the action was OBSERVED
 *                                    only after dispatch to the provider; no
 *                                    pre-dispatch checkpoint (visibility, not a
 *                                    gate).
 *   - hook-failed-original-action-proceeded — a native hook errored or was
 *                                    bypassed and the ORIGINAL action proceeded
 *                                    ungated (fail-open, reported honestly).
 *   - native-hook-unverified       — a native hook is present but its firing /
 *                                    enforcement is not freshly proven.
 * (The three above are M4.6 tail-only APPENDS — append-only, so the frozen
 * parity tuple stays order-stable.)
 *
 * NOTE: the token is `devoid-mediated` per the Cera→Devoid rename (owner
 * decision 2026-07-10 — a zero-consumer token must not carry the repealed
 * brand); roadmap §20.5 was updated to match, so doc and wire agree.
 */
export const GOVERNANCE_DISPOSITIONS = [
  'devoid-mediated',
  'delegated-and-attested',
  'restricted-intent-unverified',
  'observed-only',
  'not-governed',
  'wire-observed-after-dispatch',
  'hook-failed-original-action-proceeded',
  'native-hook-unverified',
] as const;

export type GovernanceDisposition = (typeof GOVERNANCE_DISPOSITIONS)[number];

/**
 * §20.4 / Gate-0 #10 — MCP governance is ALWAYS three distinct rows, and NO row
 * inherits `Active` from another:
 *   - mcp-config-startup — discovery/classification/quarantine before load
 *                          (ships today).
 *   - mcp-runtime-hook   — a certified runtime hook sees/gates only the MCP
 *                          calls the runtime/vendor exposes (a hook firing does
 *                          NOT make the shell-oriented toolrisk an MCP engine).
 *   - mcp-transport      — Cera interposes the actual MCP stream and can
 *                          revoke/deny a running `tools/call` (universal live
 *                          MCP enforcement remains M5-C).
 * Each row carries its OWN independent certification/coverage/effect (see
 * {@link McpGovernanceCapability}) so the contract makes the no-inheritance
 * rule structural, not merely a UI convention.
 */
export const MCP_GOVERNANCE_ROWS = [
  'mcp-config-startup',
  'mcp-runtime-hook',
  'mcp-transport',
] as const;

export type McpGovernanceRow = (typeof MCP_GOVERNANCE_ROWS)[number];

/**
 * Gate-0 #1 — the actor half of the thin governed-action provenance envelope.
 * Identity stays HONEST: an undetermined actor is `type:'unknown'` with a null
 * id, never a fabricated human. Endpoint Teams remain deployment cohorts, not
 * invented identity (SCIM/HRIS/IAM are out of scope). All fields are free-form
 * strings — no closed enum — so an unknown/novel source is representable.
 *   - type      — e.g. 'human' | 'agent' | 'service' | 'unknown'.
 *   - id        — opaque actor id/hash, or null when unknown.
 *   - source    — where the actor attribution came from (a provenance signal).
 *   - assurance — how strongly the attribution is trusted, e.g.
 *                 'unknown' | 'asserted' | 'verified'.
 */
export interface GovernedActionActor {
  type: string;
  id: string | null;
  source: string;
  assurance: string;
}

/**
 * Gate-0 #1 — the execution-subject half of the envelope: WHAT ran the action
 * and WHERE, which is what decides whether the work is even endpoint-governable.
 *   - type     — e.g. 'runtime' | 'subagent' | 'cloud-agent' | 'unknown'.
 *   - id       — opaque subject id, or null when unknown.
 *   - location — e.g. 'endpoint' | 'wsl' | 'container' | 'cloud'. A `cloud`
 *                location is the moment coverage becomes not-endpoint-governed.
 */
export interface GovernedActionExecutionSubject {
  type: string;
  id: string | null;
  location: string;
}

/**
 * Gate-0 #1 — the runtime/host binding carried on every governed action and
 * attestation. NEVER trust `--adapter <id>` from the installed command as
 * identity: the dialect is probed/detected and its schema validated, and an
 * unknown shape is rejected safely. All free-form strings (no enum).
 *   - runtime        — the SUBJECT, e.g. 'claude-code' (host is metadata, D1).
 *   - host           — the app the runtime lives in, e.g. 'cli' | 'vscode' |
 *                      'cursor' | 'claude-desktop'.
 *   - integration    — how Cera attached, e.g. 'cli-shim' | 'vscode-ext'.
 *   - platform       — 'windows' | 'darwin' | 'linux' (M4.5 live target = windows).
 *   - hookDialect    — the detected/validated hook schema variant.
 *   - runtimeVersion — the runtime's own version (null/unknown → "Unverified version").
 *   - adapterVersion — the Cera adapter's version (short semver).
 *   - configSource   — where the managed config lives, e.g. 'user-settings' |
 *                      'managed-settings' (drives deployment assurance).
 */
export interface RuntimeBinding {
  runtime: string;
  host: string;
  integration: string;
  platform?: string | null;
  hookDialect?: string | null;
  runtimeVersion?: string | null;
  adapterVersion?: string | null;
  configSource?: string | null;
}

/**
 * Gate-0 #7 — session/dedup identity carried on the event-side types. The
 * daemon dedup key STARTS with `runtime + session + tool-use + checkpoint`, so
 * these must ride on every governed action. Endpoint-global proxy taint is NOT
 * mixed with runtime-session taint (D5 split-brain fix). All optional/nullable
 * (additive): an emitter that pre-dates a field omits it.
 *   - runtimeSessionId — the runtime's own session id (the real session, D6).
 *   - backendSessionId — the Backend `ai_sessions` row id, once correlated.
 *   - toolUseId        — the runtime's per-tool-call id (extends the dedup key).
 *   - checkpoint       — which canonical checkpoint produced the event.
 *   - eventId          — stable per-event id.
 *   - idempotencyKey   — the dedup key (derived from runtime+session+tool-use+checkpoint).
 */
export interface RuntimeSessionIdentity {
  runtimeSessionId?: string | null;
  backendSessionId?: string | null;
  toolUseId?: string | null;
  checkpoint?: CanonicalHookEvent | null;
  eventId?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Gate-0 #1 + #7 + #9 — the thin **governed-action envelope**: the per-event
 * provenance projection that one browser-human fixture and one local-agent
 * runtime fixture must BOTH round-trip through (Gate-0 exit criterion). Binds
 * actor + execution subject + runtime binding + session identity + the two
 * independent per-action axes (governance disposition, enforcement effect). It
 * is the additive provenance that the daemon promotes onto the `ai_events`
 * emit path (Phase 1); raw payload/content is NEVER part of it.
 */
export interface GovernedActionEnvelope extends RuntimeBinding, RuntimeSessionIdentity {
  actor: GovernedActionActor;
  executionSubject: GovernedActionExecutionSubject;
  /** §20.5 independent axis (Gate-0 #9) — how the action was (or was not) mediated. */
  governanceDisposition?: GovernanceDisposition | null;
  /** D7 — the effect actually applied; `none` on allow, null for pre-axis emitters. */
  enforcementEffect?: EnforcementEffect | null;
}

/**
 * D3 — the per-checkpoint capability state (one `CapabilitySet` per canonical
 * checkpoint the adapter mediates for a runtime). This is the endpoint-fresh
 * view of ONE checkpoint. Gate-0 #2: an observed *allow* proves wiring, not
 * enforcement — only `enforcement-tested` (or a fresh `observed` block/rewrite/
 * replace) may back an "Active" render, and it must combine with a matching
 * certificate + fresh attestation.
 *   - checkpoint          — the canonical checkpoint this row describes.
 *   - certificationState  — the D8 ladder state reached for this checkpoint here.
 *   - enforcementEffect   — the effect this checkpoint applies when it fires.
 *   - loaded              — the hook/config for this checkpoint is loaded.
 *   - lastObservedAt      — last time the checkpoint was observed firing.
 *   - lastEnforcementTestedAt — last time a live block/rewrite/replace was proven.
 *   - drifted             — expected config/hash/launcher differs (tamper/drift).
 *   - fresh               — the attestation for this checkpoint is within freshness.
 */
export interface CapabilitySet {
  checkpoint: CanonicalHookEvent;
  certificationState: CertificationState;
  enforcementEffect?: EnforcementEffect | null;
  loaded?: boolean;
  lastObservedAt?: string | null;
  lastEnforcementTestedAt?: string | null;
  drifted?: boolean;
  fresh?: boolean;
}

/**
 * §20.4 / Gate-0 #10 — the INDEPENDENT state of ONE of the three MCP-governance
 * rows. A separate shape from {@link CapabilitySet} because an MCP row is NOT a
 * hook-event checkpoint. Each row's `certificationState` stands alone — nothing
 * here lets one row inherit another's `Active`.
 */
export interface McpGovernanceCapability {
  row: McpGovernanceRow;
  certificationState: CertificationState;
  coverageDepth?: CoverageDepth | null;
  enforcementEffect?: EnforcementEffect | null;
  lastObservedAt?: string | null;
  lastEnforcementTestedAt?: string | null;
}

/**
 * D3 — a detected runtime on the endpoint: the runtime is the subject, the host
 * is metadata on the binding (D1 — no host×runtime cross-product). Carries the
 * coverage depth + overall certification state + the per-checkpoint capability
 * rows. This is the in-daemon model; `RuntimeAdapterReport` is what crosses the
 * wire to the Backend.
 */
export interface RuntimeInstance {
  /** Free-form adapter id, e.g. 'claude-code' — NEVER trusted as identity (Gate-0 #1). */
  adapterId: string;
  binding: RuntimeBinding;
  executionLocation: string;
  coverageDepth: CoverageDepth;
  certificationState: CertificationState;
  capabilities: CapabilitySet[];
}

/**
 * Gate-0 #2 — the RELEASE-level **capability certificate**, stored SEPARATELY
 * from any per-endpoint attestation. It records what Cera actually
 * enforcement-tested for a runtime/version/host/platform/dialect at build/
 * release time. It proves NOTHING about a given machine on its own — only the
 * fresh combination (certificate + fresh attestation + observed enforcement)
 * renders "Active." M4.5 certifies Windows live; cross-compiled macOS/Linux are
 * `built/tested`, NOT runtime-certified (Gate-0 #11).
 *   - runtimeVersionRange — the runtime version range this certificate covers.
 *   - checkpoint          — the specific checkpoint certified.
 *   - coverageDepth       — the depth this certificate attests for the tuple.
 *   - certificationState  — the ladder state reached at release-test time.
 *   - testedAt            — RFC3339 instant the release test ran.
 */
export interface AdapterCapabilityCertificate {
  adapterId: string;
  adapterVersion: string;
  contractVersion: string;
  runtime: string;
  host: string;
  platform: string;
  hookDialect: string;
  runtimeVersionRange: string;
  checkpoint: CanonicalHookEvent;
  coverageDepth: CoverageDepth;
  certificationState: CertificationState;
  testedAt: string;
}

/**
 * D9 — what an endpoint ATTESTS about one runtime adapter (the additive
 * `runtimeAdapters[]` element on `EndpointControlsAttestation`). Carries the
 * endpoint-runtime facts (coverageDepth / certificationState / capabilities per
 * the D9 placement rule) plus the Gate-0 #2 FRESH per-endpoint attestation
 * fields (config hash · loaded · last observed · last enforcement-tested ·
 * drift/freshness), kept DISTINCT from the release certificate above.
 *
 * Gate-0 #10 — MCP governance is represented as THREE distinct rows via the
 * dedicated {@link mcpGovernance} field ({@link McpGovernanceCapability}); no
 * row inherits state from another. It is kept SEPARATE from `capabilities`
 * (hook-event checkpoints) so the shell-oriented toolrisk hook can never be
 * mistaken for an MCP policy engine.
 *
 * §20.2 — `deploymentAssurance` is an INDEPENDENT axis: a user-level hook is
 * `state=active, deploymentAssurance='cooperative'` (the machine owner can
 * remove it) — it must NOT be fused into the state badge nor labeled
 * `tamper-resistant`. Managed settings earn `'managed'` only after their own
 * proof. Free-form string (documented values: 'cooperative' | 'managed').
 *
 * All content-free: identifiers, enums, hashes, short versions, RFC3339 stamps.
 */
export interface RuntimeAdapterReport {
  adapterId: string;
  binding: RuntimeBinding;
  executionLocation: string;
  coverageDepth: CoverageDepth;
  certificationState: CertificationState;
  capabilities: CapabilitySet[];
  /** §20.4 / Gate-0 #10 — the three independent MCP-governance rows (no inheritance). */
  mcpGovernance?: McpGovernanceCapability[];
  /** Gate-0 #2 fresh per-endpoint attestation — the hash of the exact installed config. */
  configHash?: string | null;
  loaded?: boolean;
  lastObservedAt?: string | null;
  lastEnforcementTestedAt?: string | null;
  drifted?: boolean;
  fresh?: boolean;
  /** §20.2 independent assurance axis — 'cooperative' (user-level) | 'managed'. */
  deploymentAssurance?: string;
  /** The release certificate this endpoint's runtime/version matched, when known. */
  certificate?: AdapterCapabilityCertificate | null;
  /** RFC3339 instant the daemon computed this runtime attestation. */
  attestedAt?: string;
}
