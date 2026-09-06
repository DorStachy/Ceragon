/**
 * RA-0 — Runtime integrity INTENT vocabulary + identity derivation (§9.4–§9.6).
 *
 * This file is the single cross-language source of truth for the closed
 * vocabularies the runtime-assurance addendum locks, plus the two DOMAIN-
 * SEPARATED identity preimages (`runtimeInstanceId`, `ControlTargetKey`).
 *
 * It is deliberately a VOCABULARY + PURE-DERIVATION module:
 *   - no issuance logic (RA-1), no inventory (RA-3), no providers (RA-4), and
 *     no controller behaviour (RA-5) live here;
 *   - the Go mirror is `Installers/internal/airuntimeintegrity/vocab.go` and
 *     `Installers/internal/airuntime/vocab.go`, pinned to the SAME canonical
 *     JSON fixture that ships in both repositories
 *     (`fixtures/ai-runtime-integrity/vocabulary.json`).
 *
 * APPEND-ONLY: every tuple below is ordered and load-bearing. Never re-order
 * or delete a member — cross-language fixtures pin exact value AND order.
 *
 * PRIVACY INVARIANT: identifiers / enums / hashes / short version strings /
 * RFC3339 timestamps ONLY. Never a raw path, SID, username, command line,
 * settings body, prompt, credential, or secret.
 */

// ─── Contract version ───────────────────────────────────────────────────────

/**
 * The integrity contract version an endpoint reports and the Backend latches
 * against. Bounded to varchar(16) in `endpoint_control_state`. A bump is a
 * REVIEWED event: it invalidates the server capability latch's assigned
 * version and therefore the green claim until a fresh signed report arrives.
 */
export const RUNTIME_INTEGRITY_CONTRACT_VERSION = 'ri-1';

/** Max accepted length of an integrity-contract-version string. */
export const RUNTIME_INTEGRITY_CONTRACT_VERSION_MAX_LEN = 16;

// ─── §9.4 endpoint policy-integrity vocabularies ────────────────────────────

/**
 * Signature status of the applied signed bundle as the ENDPOINT observed it.
 * `UNKNOWN` is honest (missing/corrupt state), never a synonym for VALID.
 */
export const POLICY_SIGNATURE_STATUSES = ['VALID', 'INVALID', 'UNKNOWN'] as const;
export type PolicySignatureStatus = (typeof POLICY_SIGNATURE_STATUSES)[number];

/**
 * §9.5 semantic integrity state. `MATCHED` is the only state that can
 * contribute to a green render, and only in combination with the server-side
 * convergence gates in {@link ../endpoint-policy-integrity-contract}.
 * `UNKNOWN` is the floor for a row with no observation — a row that never
 * reported must read `unknown`, NEVER `healthy`.
 */
export const POLICY_INTEGRITY_STATES = [
  'MATCHED',
  'DRIFTED',
  'REPAIRING',
  'CONTAINED',
  'FAILED',
  'UNKNOWN',
] as const;
export type PolicyIntegrityState = (typeof POLICY_INTEGRITY_STATES)[number];

/**
 * §9.8 containment is an INDEPENDENT state, not a hook response. `UNSUPPORTED`
 * is honest ("this endpoint cannot contain"), and — like `ACTIVE`/`FAILED` —
 * is never green.
 */
export const POLICY_CONTAINMENT_STATES = [
  'NONE',
  'ARMED',
  'ACTIVE',
  'FAILED',
  'UNSUPPORTED',
] as const;
export type PolicyContainmentState = (typeof POLICY_CONTAINMENT_STATES)[number];

// ─── §9.4 per-runtime-instance vocabularies ─────────────────────────────────

/**
 * Closed `launchOrigin` — how this runtime instance was started. An
 * automation/dispatch path has DIFFERENT approval and authority semantics, so
 * it must never inherit a direct CLI/IDE/Desktop receipt. `UNKNOWN` is the
 * honest floor (never coerce to `DIRECT`).
 */
export const RUNTIME_LAUNCH_ORIGINS = [
  'DIRECT',
  'DESKTOP_DISPATCH',
  'SCHEDULED',
  'REMOTE_CONTROL',
  'UNKNOWN',
] as const;
export type RuntimeLaunchOrigin = (typeof RUNTIME_LAUNCH_ORIGINS)[number];

/**
 * §9.0 / decision 25 — the three assurance tiers. They are SEPARATE facts:
 * MDM/EDR/App Control may strengthen posture but never substitute for egress
 * denial, and local-admin-proof is never claimed at any tier.
 */
export const ENDPOINT_ASSURANCE_TIERS = [
  'cooperative',
  'managed',
  'hardened',
] as const;
export type EndpointAssuranceTier = (typeof ENDPOINT_ASSURANCE_TIERS)[number];

/**
 * Decision 26 — Claude Code's three top-level authority modes. `DEVOID_AUTHORITY`
 * pins EXACTLY ONE mechanism (managed file OR policyHelper) — never both.
 */
export const CLAUDE_AUTHORITY_MODES = [
  'EXTERNAL_ADMIN',
  'STATIC_COEXISTENCE',
  'DEVOID_AUTHORITY',
] as const;
export type ClaudeAuthorityMode = (typeof CLAUDE_AUTHORITY_MODES)[number];

// ─── ControlTargetKey component vocabularies (§9.10) ────────────────────────

/**
 * The winning authority-source KIND for a control target. Closed, because the
 * whole point of the key is that "which tier actually wins" is part of the
 * identity — a user file and a machine file are NOT the same control.
 */
export const AUTHORITY_SOURCE_KINDS = [
  'MACHINE_FILE',
  'MACHINE_REGISTRY',
  'MACHINE_MANAGED_DIR',
  'POLICY_HELPER',
  'REMOTE_MANAGED',
  'MDM',
  'USER_FILE',
  'PROJECT_FILE',
  'UNKNOWN',
] as const;
export type AuthoritySourceKind = (typeof AUTHORITY_SOURCE_KINDS)[number];

/**
 * The scope a control target governs. A Windows machine file and a WSL distro
 * file are different scopes and therefore different targets — a Windows file
 * never automatically governs a Linux distro (§9.1 host-boundary rule).
 */
export const CONTROL_TARGET_SCOPES = [
  'MACHINE',
  'USER',
  'DISTRO',
  'REMOTE_HOST',
  'CLOUD',
] as const;
export type ControlTargetScope = (typeof CONTROL_TARGET_SCOPES)[number];

/**
 * The DeVoid-owned semantic projection kinds an adapter can compile signed
 * admin intent into. The projection hash covers ONLY these DeVoid-owned fields
 * — never an entire settings file — so foreign admin/user configuration is
 * preserved and unrelated edits do not create tamper storms (§9.6).
 */
export const PROJECTION_KINDS = [
  'CODEX_REQUIREMENTS',
  'CODEX_MANAGED_CONFIG',
  'CLAUDE_MANAGED_SETTINGS',
  'CLAUDE_POLICY_HELPER',
  'PROVIDER_ROUTE',
  'WSL_POLICY',
] as const;
export type ProjectionKind = (typeof PROJECTION_KINDS)[number];

// ─── Shape guards (shared by both the endpoint and the Backend) ─────────────

/** `sha256:<64 lowercase hex>` — exactly 71 characters. */
export const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

/** Bare lowercase sha-256 hex (a domain-separated hash, never a raw value). */
export const BARE_SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Canonical uint64 decimal: no sign, no leading zero (except "0" itself), and
 * within the uint64 range. Revisions and sequences cross the wire as STRINGS
 * so neither JavaScript's float64 nor a JSON parser can silently round them.
 */
export const CANONICAL_UINT64_RE = /^(0|[1-9][0-9]{0,19})$/;

/** 2^64 - 1, the inclusive canonical uint64 ceiling. */
export const CANONICAL_UINT64_MAX = '18446744073709551615';

export function isCanonicalUint64(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UINT64_RE.test(value)) return false;
  if (value.length < CANONICAL_UINT64_MAX.length) return true;
  if (value.length > CANONICAL_UINT64_MAX.length) return false;
  return value <= CANONICAL_UINT64_MAX;
}

export function isBundleDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST_RE.test(value);
}

export function isBareSha256(value: unknown): value is string {
  return typeof value === 'string' && BARE_SHA256_RE.test(value);
}

/**
 * The SHIPPED durable-evidence emitter stream-ID contract, reused UNCHANGED
 * (§9.4). The Go daemon currently mints `devoid:<uuid>`; this is deliberately
 * NOT a database UUID column, so a legacy stream ID keeps validating.
 */
export const EVIDENCE_STREAM_ID_RE = /^[A-Za-z0-9:._-]{1,128}$/;
export const EVIDENCE_STREAM_ID_MAX_LEN = 128;

export function isEvidenceStreamId(value: unknown): value is string {
  return typeof value === 'string' && EVIDENCE_STREAM_ID_RE.test(value);
}

/** RFC3339 / ISO-8601 instant, e.g. "2026-07-29T12:00:00.000Z". */
export const INTEGRITY_RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export function isIntegrityRfc3339(value: unknown): value is string {
  return typeof value === 'string' && INTEGRITY_RFC3339_RE.test(value);
}

/** RFC4122 UUID (any version) — episode IDs, key IDs, artifact IDs. */
export const INTEGRITY_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isIntegrityUuid(value: unknown): value is string {
  return typeof value === 'string' && INTEGRITY_UUID_RE.test(value);
}

// ─── Domain-separated identity preimages ────────────────────────────────────

/**
 * The NUL byte joining every identity component. Using NUL (rather than a
 * printable separator) makes the preimage unambiguous: no component value can
 * contain it, so `a|b` and `a` + `|b` can never collide.
 */
export const IDENTITY_SEPARATOR = String.fromCharCode(0);

/**
 * The same NUL, exported under a neutral name for the SIGNATURE-DOMAIN
 * separators below (matching the shipped
 * `AI_POLICY_BUNDLE_SIGNATURE_DOMAIN = 'ceragon.ai-security.bundle v2 '`
 * convention in `Backend/src/crypto/ai-policy-signing.ts`).
 */
export const NUL = IDENTITY_SEPARATOR;

/** §9.4 — the `runtimeInstanceId` domain label. */
export const RUNTIME_INSTANCE_ID_DOMAIN = 'devoid-runtime-instance/v1';

/**
 * §9.4 — the ORDERED identity components of a runtime instance. Deliberately
 * EXCLUDES runtime version, provider route, base URL, and auth mode: those are
 * MUTABLE observed properties whose change must show as DRIFT ON THE SAME
 * instance, not as a brand-new row.
 */
export interface RuntimeInstanceIdentityInput {
  /** Endpoint-scope correlation key (never a raw hostname or machine SID). */
  endpointScope: string;
  adapterId: string;
  runtime: string;
  /** Platform-neutral principal hash (Windows SID / Linux ns-qualified UID). */
  principalHash: string;
  /** e.g. 'windows' | 'wsl:Ubuntu' | 'container:ci' | 'remote:ssh'. */
  executionHost: string;
  /** The app the runtime lives in, e.g. 'cli' | 'vscode' | 'claude-desktop'. */
  host: string;
  /** How DeVoid attached, e.g. 'cli-shim' | 'vscode-ext'. */
  integration: string;
  launchOrigin: RuntimeLaunchOrigin;
  /** Hash of the managed-config root — never the raw path. */
  configRootHash: string;
  /** SHA-256 of the runtime executable path — never the raw path. */
  executablePathHash: string;
}

/**
 * Build the EXACT preimage that is sha-256'd into `runtimeInstanceId`:
 *
 *   sha256("devoid-runtime-instance/v1" NUL endpoint-scope NUL adapterId NUL
 *          runtime NUL principalHash NUL executionHost NUL host NUL integration
 *          NUL launchOrigin NUL configRootHash NUL executablePathHash)
 *
 * The hashing itself is left to the caller so this module stays dependency-free
 * in every consumer (browser bundles included). Both languages hash the SAME
 * preimage string, and the cross-language fixture pins the preimage AND the
 * resulting digest.
 */
export function buildRuntimeInstanceIdPreimage(
  input: RuntimeInstanceIdentityInput,
): string {
  return [
    RUNTIME_INSTANCE_ID_DOMAIN,
    input.endpointScope,
    input.adapterId,
    input.runtime,
    input.principalHash,
    input.executionHost,
    input.host,
    input.integration,
    input.launchOrigin,
    input.configRootHash,
    input.executablePathHash,
  ].join(IDENTITY_SEPARATOR);
}

/** §9.10 — the `ControlTargetKey` domain label. */
export const CONTROL_TARGET_KEY_DOMAIN = 'devoid-control-target/v1';

/**
 * §9.10 — the ORDERED identity components of ONE writable control that may be
 * shared by one or many runtime instances. It carries NO raw path in
 * telemetry: `machineObjectHash` is a domain-separated hash of the canonical
 * machine object/root.
 */
export interface ControlTargetIdentityInput {
  /** Neutral provider id, e.g. 'codex' | 'claude-code'. */
  provider: string;
  /** Which authority tier actually WINS for this target. */
  authoritySourceKind: AuthoritySourceKind;
  /** Hash of the canonical machine object/root — never the raw path. */
  machineObjectHash: string;
  scope: ControlTargetScope;
}

/**
 * Build the EXACT preimage that is sha-256'd into a `ControlTargetKey`:
 *
 *   sha256("devoid-control-target/v1" NUL provider NUL authoritySourceKind NUL
 *          machineObjectHash NUL scope)
 *
 * Provider interfaces operate on this target; canary/effectiveness results
 * stay per `runtimeInstanceId`.
 */
export function buildControlTargetKeyPreimage(
  input: ControlTargetIdentityInput,
): string {
  return [
    CONTROL_TARGET_KEY_DOMAIN,
    input.provider,
    input.authoritySourceKind,
    input.machineObjectHash,
    input.scope,
  ].join(IDENTITY_SEPARATOR);
}

// ─── Intent shape (server-derived; the endpoint never reports "desired") ────

/**
 * §9.4 — the server-derived DESIRED state for one control target. The endpoint
 * NEVER reports a desired value; it reports observed facts only, and the
 * Backend derives desired/current authority. This shape is the contract RA-4
 * providers compile against and RA-5 reconciles toward.
 */
export interface RuntimeIntegrityIntent {
  schemaVersion: 1;
  integrityContractVersion: string;
  /** Opaque `ControlTargetKey` (sha-256 hex of the domain-separated preimage). */
  controlTargetKey: string;
  provider: string;
  authoritySourceKind: AuthoritySourceKind;
  scope: ControlTargetScope;
  projectionKind: ProjectionKind;
  /** Hash over the canonical DeVoid-OWNED semantic fields only. */
  desiredProjectionHash: string;
  /** The signed bundle revision this intent was compiled from. */
  sourceBundleRevision: string;
  sourceBundleDigest: string;
  /** Which Claude authority mode the admin pinned (Claude targets only). */
  claudeAuthorityMode?: ClaudeAuthorityMode | null;
  /**
   * Signed Claude customization-source policy. Omitted means the tenant did
   * not enable this control; an endpoint must never manufacture a default.
   * Marketplace objects contain vendor source identifiers only, never auth
   * headers or credential values.
   */
  claudeSourceGovernance?: {
    enabled: true;
    strictKnownMarketplaces: readonly Readonly<Record<string, string>>[];
    strictPluginOnlyCustomization: true;
    disableSideloadFlags: true;
  } | null;
  /**
   * Signed Codex requirements.toml marketplace-source allowlist. This governs
   * add/install/Git-refresh operations only; the vendor does not retroactively
   * filter already-configured marketplaces, so that remains explicit residual
   * coverage rather than being represented as enforcement.
   */
  codexMarketplaceGovernance?: {
    enabled: true;
    restrictToAllowedSources: true;
    allowedSources: readonly Readonly<Record<string, string>>[];
  } | null;
  /** The assurance tier this target can honestly support once applied. */
  assuranceTier: EndpointAssuranceTier;
}
