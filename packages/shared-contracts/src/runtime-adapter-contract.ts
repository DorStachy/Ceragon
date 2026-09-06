import { AI_SECURITY_PORTABLE_ORDERED_TUPLES } from './generated/ai-security-portable.generated';
import type {
  EndpointAssuranceTier,
  PolicyContainmentState,
  PolicyIntegrityState,
  RuntimeLaunchOrigin,
} from './runtime-integrity-intent-contract';

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
 *   - Backend (`src/ai-governance/*`) — consumes the repository-local generated
 *     shared contract; its always-on parity spec binds these aliases to the
 *     digest-pinned artifact without an optional workspace checkout or manual
 *     enum mirror.
 *   - Frontend AI Control Plane / Protection-Depth views (`types/ai-governance.ts`).
 *
 * NOT mirrored to `Ceragon-Intelligence/packages/shared-contracts` (per PRD D9 —
 * that mirror carries only inventory/worker/scanner contracts).
 *
 * STYLE / PARITY DISCIPLINE (Gate-0 #9, PRD D9):
 *   - Closed vocabularies (`coverageDepth` / `enforcementEffect` /
 *     `certificationState` / governance disposition / canonical hook events)
 *     alias generated `as const` tuples. The deterministic checker enforces
 *     exact values/order, and the tuples are APPEND-ONLY (never re-ordered).
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
 * (The §20.1 `workforce-web-request-governed` Web-AI-Guard depth is a SEPARATE
 * Web-surface axis — deliberately not in this runtime-coverage tuple per D10.)
 *
 * M4.6 (A0) APPEND — `provider-egress-control`: the wire coverage depth, where
 * the adapter enforces on the runtime's provider egress (SC provider-egress
 * control) rather than via a native hook. Appended at the tail (append-only).
 */
export const COVERAGE_DEPTHS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.COVERAGE_DEPTHS;

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
 * M4.6 (A0) APPEND — the Codex effect vocabulary, appended after `none` (append-
 * only; `none` keeps its frozen ordinal): `add-developer-context` (SC context
 * injection), `deny-escalation` / `allow-escalation` (SC6 PermissionRequest
 * escalation branches), and `replace-tool-result-with-feedback-and-continue`
 * (SC2 deny that swaps the tool result for feedback and continues the loop).
 */
export const ENFORCEMENT_EFFECTS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.ENFORCEMENT_EFFECTS;

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
export const CERTIFICATION_STATES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.CERTIFICATION_STATES;

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
 *
 * M4.6 (A0) APPEND — the SC8 confirmed-firing Codex events, appended at the tail
 * (append-only): `PERMISSION_REQUEST` (the SC6 escalation checkpoint),
 * `PRE_COMPACT` / `POST_COMPACT` (context-compaction lifecycle), and
 * `SUBAGENT_START` (the start half of the subagent lifecycle pair).
 */
export const CANONICAL_HOOK_EVENTS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.CANONICAL_HOOK_EVENTS;

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
 *
 * NOTE: the token is `devoid-mediated` per the Cera→Devoid rename (owner
 * decision 2026-07-10 — a zero-consumer token must not carry the repealed
 * brand); roadmap §20.5 was updated to match, so doc and wire agree.
 *
 * M4.6 (A0) APPEND — the wire/native-hook dispositions, appended at the tail
 * (append-only): `wire-observed-after-dispatch` (the wire saw the action only
 * after it was dispatched — visibility without a pre-dispatch gate),
 * `hook-failed-original-action-proceeded` (a native hook errored/timed out and
 * the runtime proceeded with the original action, so it was NOT mediated), and
 * `native-hook-unverified` (a native hook is claimed but not certified/attested).
 */
export const GOVERNANCE_DISPOSITIONS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.GOVERNANCE_DISPOSITIONS;

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
export const MCP_GOVERNANCE_ROWS = AI_SECURITY_PORTABLE_ORDERED_TUPLES.MCP_GOVERNANCE_ROWS;

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
  // ── M4.6 (LOCK-5) — per-INSTANCE identity dims (additive) ────────────────
  // One host can run MANY runtime instances (e.g. two Codex CLIs pointed at
  // different configRoots / providers). These dims make each instance
  // separately identifiable so the console never collapses them to "all codex".
  // Content-free: hashes / short identifiers / a base URL — never a raw path,
  // secret, prompt, or token. All optional/nullable (a pre-dim emitter omits them).
  /** The concrete execution host/context, e.g. 'wsl:Ubuntu' | 'container:ci'. */
  executionHost?: string | null;
  /** The runtime CLI's own version (distinct from `adapterVersion`). */
  cliVersion?: string | null;
  /** Redaction-safe identifier of the managed-config root (short id / hash). */
  configRoot?: string | null;
  /** SHA-256 of the runtime executable path — never the raw path. */
  executablePathHash?: string | null;
  /** Provider route this instance targets, e.g. 'openai' | 'azure'. */
  providerRoute?: string | null;
  /** Wire API family, e.g. 'responses' | 'chat-completions'. */
  wireApi?: string | null;
  /** Provider base URL, e.g. 'https://api.openai.com' (identifier, not content). */
  baseUrl?: string | null;
  /** Auth mode, e.g. 'api-key' | 'oauth' | 'device-code'. */
  authMode?: string | null;
  // ── RA-0 (§9.4) — the CANONICAL MODERN identity dimensions ───────────────
  // These three participate in `runtimeInstanceId`. Everything above them that
  // is mutable (runtimeVersion, providerRoute, wireApi, baseUrl, authMode)
  // deliberately does NOT: a change there must show as DRIFT ON THE SAME
  // instance, never as a brand-new row.
  /**
   * Platform-neutral principal hash. Windows derives it from the SID, Linux
   * from the namespace-qualified UID, both through the endpoint correlation
   * key — the raw identity NEVER leaves the endpoint.
   */
  principalHash?: string | null;
  /**
   * Closed launch origin. An automation/Dispatch path has different approval
   * and authority semantics, so it must never inherit a direct CLI/IDE/Desktop
   * receipt. Omitted/unknown reads as `UNKNOWN`, never `DIRECT`.
   */
  launchOrigin?: RuntimeLaunchOrigin | null;
  /** Hash of the managed-config root — the identity-bearing form of `configRoot`. */
  configRootHash?: string | null;
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
  /**
   * M4.6 (LOCK-2) — the effect the policy INTENDED this checkpoint to apply vs
   * the effect that was ACTUALLY applied. A divergence is the honest signal the
   * console surfaces (intended `deny-tool`, actual `none` = enforcement gap).
   * Both optional/nullable + EnforcementEffect-validated.
   */
  intendedEffect?: EnforcementEffect | null;
  actualEffect?: EnforcementEffect | null;
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
 * RA-0 (§9.4) — the MODERN per-instance identity + semantic-integrity block
 * carried by both the in-daemon {@link RuntimeInstance} and the wire
 * {@link RuntimeAdapterReport}.
 *
 * `runtimeInstanceId` is the CANONICAL GROUPING KEY. It is stable across
 * version and provider changes:
 *
 *   sha256("devoid-runtime-instance/v1" NUL endpoint-scope NUL adapterId NUL
 *          runtime NUL principalHash NUL executionHost NUL host NUL integration
 *          NUL launchOrigin NUL configRootHash NUL executablePathHash)
 *
 * (see `buildRuntimeInstanceIdPreimage` in `runtime-integrity-intent-contract`).
 *
 * Every field is optional/nullable because a pre-RA-0 emitter omits the whole
 * block. An omitted block does NOT mean healthy — a report with no
 * `runtimeInstanceId` is LEGACY identity and stays non-green until a modern
 * report arrives (see {@link legacyInstanceKey}).
 */
export interface RuntimeInstanceIntegrity {
  /** sha-256 hex of the domain-separated identity preimage above. */
  runtimeInstanceId?: string | null;
  /**
   * The OLD mutable key, retained ONLY as a `legacy:`-prefixed alias so an old
   * report is still representable. It is NEVER deduped against a modern
   * `runtimeInstanceId` and never used to merge two rows.
   */
  legacyInstanceKey?: string | null;
  /**
   * The shared writable control this instance is bound to (sha-256 hex of the
   * `devoid-control-target/v1` preimage). MANY instances can share ONE target;
   * the repair state machine is keyed by the target, canary proof by the
   * instance.
   */
  controlTargetKey?: string | null;
  /** Hash over the canonical DeVoid-owned semantic fields the server intends. */
  desiredProjectionHash?: string | null;
  /** Hash over the same fields as actually observed in the effective source. */
  observedProjectionHash?: string | null;
  /** §9.5 semantic integrity state for THIS instance. */
  integrityState?: PolicyIntegrityState | null;
  /** §9.8 containment state for THIS instance (independent of integrity). */
  containment?: PolicyContainmentState | null;
  /** Decision 25 assurance tier this instance can honestly claim. */
  assuranceTier?: EndpointAssuranceTier | null;
  lastCheckedAt?: string | null;
  lastRepairAt?: string | null;
  /** Last time a REAL current-version deny canary was proven for this instance. */
  lastCanaryAt?: string | null;
  activeEpisodeId?: string | null;
  /** Short slug for the active episode's reason; never free-form prose. */
  activeEpisodeReason?: string | null;
  // ── Separate lifecycle timestamps + expiry semantics (§9.4) ──────────────
  // `configured` is what DeVoid wrote; `loaded` is the vendor having read it;
  // `observed` is a real firing; `enforcementTested` is a proven deny. They are
  // DISTINCT facts — configured never implies loaded, loaded never implies
  // observed, observed (an allow) never implies enforcement-tested.
  configuredAt?: string | null;
  loadedAt?: string | null;
  observedAt?: string | null;
  enforcementTestedAt?: string | null;
  /**
   * When the current enforcement proof goes stale. After this instant the
   * instance needs a fresh canary before it may be rendered active again.
   */
  proofExpiresAt?: string | null;
}

/**
 * D3 — a detected runtime on the endpoint: the runtime is the subject, the host
 * is metadata on the binding (D1 — no host×runtime cross-product). Carries the
 * coverage depth + overall certification state + the per-checkpoint capability
 * rows. This is the in-daemon model; `RuntimeAdapterReport` is what crosses the
 * wire to the Backend.
 *
 * RA-0: also carries the {@link RuntimeInstanceIntegrity} identity/integrity
 * block, so `ToReport` is a lossless projection in both languages.
 */
export interface RuntimeInstance extends RuntimeInstanceIntegrity {
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
// ── W8 T8 — the field-observation ledger on the wire ───────────────────────
//
// Every other block on {@link RuntimeAdapterReport} is the endpoint describing
// ITSELF. This one is the endpoint describing what it OBSERVED, and it is the
// half no fleet surface has ever had: the ledger existed on the box from the
// day it was written and never left it, so an administrator could read a
// self-reported configuration with nothing at all to weigh it against.
//
// Producer of record: Installers `internal/fieldobs/fieldobs.go`.
//
// ─── THE ORDERING IS PART OF THE CONTRACT ──────────────────────────────────
//
// `EndpointControlsDto.runtimeAdapters` is `unknown[]` so a forward-shaped
// daemon report can never 400 the whole key-heartbeat. The cost of that
// leniency is that a key the Backend does not yet rebuild is dropped SILENTLY:
// no error, no data, `reasons: []`, the adapter still stored, and the agent's
// own status output reading perfectly fine. So the Backend accepts this block,
// and is DEPLOYED, before any agent emits it. W8 T5's `droppedKeyPaths` is the
// safety net if that order is ever violated, not a licence to violate it.

/** Closed adapter vocabulary — Go `fieldobs.Adapters`. */
export const FIELD_OBSERVATION_ADAPTERS = ['claude-code', 'codex'] as const;
export type FieldObservationAdapter = (typeof FIELD_OBSERVATION_ADAPTERS)[number];

/**
 * Closed assurance vocabulary — Go `fieldobs.Assurances`.
 *
 * `EMITTED` means DeVoid expressed the effect and nothing watched the runtime
 * take it. `RUNTIME_ACKNOWLEDGED` means the runtime said it did. Only the
 * second may raise the certification ladder to `observed`, which is why the
 * axis is part of the record's composite key on the producer and is carried
 * here rather than collapsed.
 */
export const FIELD_OBSERVATION_ASSURANCES = [
  'EMITTED',
  'RUNTIME_ACKNOWLEDGED',
] as const;
export type FieldObservationAssurance =
  (typeof FIELD_OBSERVATION_ASSURANCES)[number];

/** Closed provider vocabulary — Go `fieldobs.Providers` (the two proxy mounts). */
export const FIELD_OBSERVATION_PROVIDERS = ['anthropic', 'openai'] as const;
export type FieldObservationProvider =
  (typeof FIELD_OBSERVATION_PROVIDERS)[number];

/**
 * Closed observation-method vocabulary — Go `fieldobs.ObservationMethods`.
 *
 * Exactly one member (`poll`) is a measurement; the other four are the several
 * different ways a run can fail to be one. They are distinct members because an
 * endpoint that could not look and an endpoint that looked and saw nothing
 * produce the same count and mean opposite things.
 */
export const FIELD_OBSERVATION_METHODS = [
  'poll',
  'unsupported',
  'unavailable',
  'disabled',
  'unstarted',
] as const;
export type FieldObservationMethod = (typeof FIELD_OBSERVATION_METHODS)[number];

/** One per-(adapter × checkpoint × effect × assurance) field observation. */
export interface FieldObservationCheckpoint {
  adapter: FieldObservationAdapter;
  checkpoint: CanonicalHookEvent;
  effect: EnforcementEffect;
  assurance: FieldObservationAssurance;
  count: number;
  /** `null` when the producer holds no such instant — never a fabricated one. */
  firstAt?: string | null;
  lastAt?: string | null;
}

/**
 * One per-provider transport-route observation, carrying TWO counters that are
 * never merged: `traffic` is how many requests travelled this route, `decisions`
 * is how many of those reached a DeVoid decision. Until W8 T3 only `decisions`
 * existed, so the status surface answered the traffic question with the decision
 * count and printed "no request has ever travelled this route" over requests
 * that had.
 *
 * `firstAt`/`lastAt` are the DECISION instants and are `null` on a route that
 * carried traffic and reached no decision. That is the honest reading of the
 * pair, not a gap for a consumer to fill in.
 */
export interface FieldObservationRoute {
  provider: FieldObservationProvider;
  traffic: number;
  decisions: number;
  firstAt?: string | null;
  lastAt?: string | null;
}

/**
 * The NEGATIVE witness: a certified runtime was seen holding a connection that
 * did NOT travel the governed proxy route. {@link FieldObservationRoute} answers
 * "did anything come through the governed route"; nothing answered "did anything
 * go around it", so a report of zero bypasses was indistinguishable from never
 * having looked.
 *
 * `observations` is a SAMPLE count, not a connection count, and the writer rate
 * limits itself — a floor, never a total. `method` and `intervalMs` are on the
 * row for that reason: quoting `observations` without them is quoting a number
 * that does not mean what the reader thinks. A non-zero count establishes
 * OFF-ROUTE EGRESS BY A CERTIFIED RUNTIME and nothing stronger — the row holds
 * no destination address, so any consumer string claiming the runtime reached
 * the provider is wrong.
 */
export interface FieldObservationDirectEgress {
  provider: FieldObservationProvider;
  observations: number;
  method: FieldObservationMethod;
  intervalMs?: number;
  firstAt?: string | null;
  lastAt?: string | null;
  /**
   * THE TRI-STATE. `false` | `null`, and never `true` from this producer.
   *
   *   `false` — off-route egress WAS seen, so it was definitely not denied.
   *   `null`  — NOT MEASURED. A sample cannot prove absence, so "we sampled and
   *             saw none" is neither "none happened" nor "it was denied".
   *   `true`  — would mean DENIED. This producer observes; it denies nothing.
   *             Only a direct-egress denial mechanism can author `true`, and a
   *             `true` arriving here is refused and recorded, not believed.
   *
   * Explicit rather than derived from `observations` by each consumer:
   * re-deriving a measurement on the read side is exactly how a `null` becomes
   * a `false`.
   */
  directEgressDenied: boolean | null;
  /** SERVER-DERIVED. Present when a refused `directEgressDenied: true` arrived. */
  rejectedDirectEgressDenialClaim?: true;
}

/**
 * The endpoint's field-observation ledger.
 *
 * OMITTED when the endpoint reported nothing readable. A pre-T8 agent, an
 * unreadable block and an EMPTY ledger are one fact on the producer too —
 * `fieldobs.Load` returns an empty ledger and a nil error for a missing file, a
 * corrupt file AND a schema version it does not understand, deliberately,
 * because "no observation on record" and "I cannot read the record" must both
 * render as never-observed. Consumers render ABSENT as NOT REPORTED. A stored
 * `{checkpoints: [], routes: [{traffic: 0, decisions: 0}]}` would say the
 * opposite — "observed, and nothing happened" — over an endpoint that measured
 * nothing at all.
 *
 * The `*Dropped` counters are SERVER-DERIVED and exist because the agent-wire
 * drift walker compares index-for-index and cannot see a shortened list: without
 * them a truncated ledger is indistinguishable from a complete one.
 *
 * Content-free: closed-vocabulary ids, non-negative integers and RFC3339
 * instants. No paths, no prompts, no tokens.
 */
export interface RuntimeAdapterFieldObservation {
  checkpoints?: FieldObservationCheckpoint[];
  routes?: FieldObservationRoute[];
  directEgress?: FieldObservationDirectEgress[];
  checkpointsDropped?: number;
  routesDropped?: number;
  directEgressDropped?: number;
}

export interface RuntimeAdapterReport extends RuntimeInstanceIntegrity {
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
  /**
   * M4.6 — the daemon detected the runtime version churned (changed) since the
   * last enforcement-tested attestation. A churned version has not been
   * re-enforcement-tested, so the console auto-downgrades it to
   * `unverified-version` (never `active`), even with a matching certificate.
   */
  versionChurned?: boolean;
  /**
   * W8 T8 — what this adapter's endpoint actually OBSERVED, as distinct from
   * what it reports about its own configuration. ABSENT means NOT REPORTED and
   * must never render as an observed zero; see
   * {@link RuntimeAdapterFieldObservation}.
   */
  fieldObservation?: RuntimeAdapterFieldObservation;
}
