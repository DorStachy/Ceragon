/**
 * M3 Rollout Governance — endpoint controls attestation wire shape (LOCK-1).
 *
 * The daemon self-reports which protections are actually live on an endpoint
 * via a `controls:{}` block on the heartbeat. This file is the SINGLE source
 * of truth for that content-free, boolean/enum-only shape. It is a NEW file
 * (never appended to `endpoint-inventory-contract.ts`, which the Intelligence
 * mirror carries) so the M3 attestation surface stays isolated.
 *
 * Consumed by:
 *   - Backend (`src/health/*` heartbeat ingest + `endpoint_control_state`
 *     store) via {@link normalizeControls} — mirrored with a snapshot + parity
 *     spec, same pattern as `ai-governance-contract.ts`.
 *   - Installers daemon (`internal/controls/*`, Go) — conforms by CONVENTION
 *     (a header key/enum table + a marshalling test), not a runtime import.
 *   - Frontend readiness/coverage views — hand-vendored ambient mirror.
 *
 * PRIVACY INVARIANT (M1): this payload carries ONLY booleans / enums / short
 * version strings / an RFC3339 timestamp. NEVER a path, secret, prompt, or any
 * raw content. {@link normalizeControls} rebuilds the persisted object
 * field-by-field from the frozen allowlists below — it NEVER spreads the
 * incoming object — so an attacker cannot smuggle extra keys past the DB.
 *
 * These `as const` tuples are the runtime allowlists AND the TypeScript unions;
 * the Backend parity spec extracts them by regex.
 */

/**
 * The attestable control set. Each key is one protection the daemon can report
 * on. FROZEN at P0 — Go conforms to this exact key list by convention.
 *   - proxy       — Prompt Guard / AI proxy running.
 *   - hooks       — dangerous-command tool-call hooks installed.
 *   - packageGate — package install gate active.
 *   - push        — push protection (pre-push hook) installed.
 *   - webAiGuard  — Web AI Guard browser extension present/healthy.
 *   - mcp         — MCP governance active.
 */
export const ENDPOINT_CONTROL_KEYS = [
  'proxy',
  'hooks',
  'packageGate',
  'push',
  'webAiGuard',
  'mcp',
] as const;

export type EndpointControlKey = (typeof ENDPOINT_CONTROL_KEYS)[number];

/**
 * The honest state of one control on an endpoint:
 *   - active      — installed AND enforcing.
 *   - monitoring  — installed AND running, but in detect/observe mode only.
 *   - inactive    — installed but not running / disabled.
 *   - degraded    — present but partially broken (self-check failed).
 *   - unsupported — the platform cannot host this control (never a gap).
 *   - unknown     — the daemon could not determine the state.
 */
export const ENDPOINT_CONTROL_STATES = [
  'active',
  'monitoring',
  'inactive',
  'degraded',
  'unsupported',
  'unknown',
] as const;

export type EndpointControlState = (typeof ENDPOINT_CONTROL_STATES)[number];

/**
 * The enforcement mode a control is running in (constrained to a known enum —
 * §A key-suggestion a; an out-of-set value is DROPPED by normalizeControls,
 * never persisted).
 */
export const ENDPOINT_CONTROL_MODES = [
  'detect',
  'strict',
  'monitor',
  'off',
] as const;

export type EndpointControlMode = (typeof ENDPOINT_CONTROL_MODES)[number];

/**
 * The endpoint-wide enforcement tier the daemon reports (M1 `enforcementTier`).
 */
export const ENDPOINT_ENFORCEMENT_TIERS = ['detect', 'strict'] as const;

export type EndpointEnforcementTier =
  (typeof ENDPOINT_ENFORCEMENT_TIERS)[number];

/** One control's self-reported status. Content-free. */
export interface EndpointControlReport {
  state: EndpointControlState;
  /** Enforcement mode, when meaningful for the control. */
  mode?: EndpointControlMode;
  /** Short semver of the control's implementation (e.g. "7.1.5"). */
  version?: string;
}

/**
 * The full `controls:{}` attestation block carried on the heartbeat. Every
 * control is OPTIONAL (a legacy daemon omits the block entirely; a newer one
 * reports only the controls it knows about).
 */
export interface EndpointControlsAttestation {
  controls: Partial<Record<EndpointControlKey, EndpointControlReport>>;
  /** Daemon-advisory evidence-chain integrity (server re-verify is authoritative — BN6). */
  evidenceIntact?: boolean;
  enforcementTier?: EndpointEnforcementTier;
  /** RFC3339 timestamp the daemon computed the attestation at. */
  attestedAt: string;
}

/** Max accepted length of a control `version` string (defensive bound). */
export const ENDPOINT_CONTROL_VERSION_MAX_LEN = 32;

/**
 * A short semver: 1–3 dot-separated numeric segments with an optional short
 * pre-release/build tail (e.g. "7", "7.1", "7.1.5", "7.1.5-rc1"). Anything
 * else — a path, a git sha, an arbitrary string — is rejected so a version
 * field can never smuggle content.
 */
const SHORT_SEMVER_RE =
  /^\d{1,5}(\.\d{1,5}){0,2}(-[0-9A-Za-z][0-9A-Za-z.-]{0,15})?$/;

export function isShortSemver(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= ENDPOINT_CONTROL_VERSION_MAX_LEN &&
    SHORT_SEMVER_RE.test(value)
  );
}

/** RFC3339 / ISO-8601 instant, e.g. "2026-07-08T12:00:00.000Z". */
const RFC3339_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export function isRfc3339(value: unknown): value is string {
  return typeof value === 'string' && RFC3339_RE.test(value);
}

function isControlState(v: unknown): v is EndpointControlState {
  return (
    typeof v === 'string' &&
    (ENDPOINT_CONTROL_STATES as readonly string[]).includes(v)
  );
}

function isControlMode(v: unknown): v is EndpointControlMode {
  return (
    typeof v === 'string' &&
    (ENDPOINT_CONTROL_MODES as readonly string[]).includes(v)
  );
}

function isEnforcementTier(v: unknown): v is EndpointEnforcementTier {
  return (
    typeof v === 'string' &&
    (ENDPOINT_ENFORCEMENT_TIERS as readonly string[]).includes(v)
  );
}

/**
 * Rebuild one control report field-by-field from the frozen allowlists.
 * Unknown `state` → 'unknown' (honest floor, never dropped — a present-but-
 * unrecognized control is still surfaced). `mode` / `version` are included
 * ONLY when they pass their allowlist / shape check.
 */
function normalizeControlReport(input: unknown): EndpointControlReport {
  const src = (input ?? {}) as Record<string, unknown>;
  const report: EndpointControlReport = {
    state: isControlState(src.state) ? src.state : 'unknown',
  };
  if (isControlMode(src.mode)) report.mode = src.mode;
  if (isShortSemver(src.version)) report.version = src.version;
  return report;
}

/**
 * Normalize an UNTRUSTED controls attestation into a clean, persist-safe
 * {@link EndpointControlsAttestation}. This is the ONLY path the Backend uses
 * to build the jsonb it stores — a field-by-field allowlist rebuild, never a
 * spread of the incoming object (§A key-suggestion a; P3).
 *
 * Behavior:
 *   - Non-object input → `null` (caller skips: legacy agent, no controls block).
 *   - Every known control key present with an object value is rebuilt via
 *     {@link normalizeControlReport}; unknown keys are dropped silently.
 *   - `evidenceIntact` kept only if a boolean; `enforcementTier` only if in the
 *     tier allowlist.
 *   - `attestedAt` = the input value when it is a valid RFC3339 instant, else
 *     `nowIso` (the server clock the caller supplies — keeps this PURE).
 *
 * @param input  the untrusted `controls` block from the heartbeat DTO.
 * @param nowIso the server's current RFC3339 timestamp (fallback for attestedAt).
 */
export function normalizeControls(
  input: unknown,
  nowIso: string,
): EndpointControlsAttestation | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;

  const rawControls =
    src.controls && typeof src.controls === 'object' && !Array.isArray(src.controls)
      ? (src.controls as Record<string, unknown>)
      : {};

  const controls: Partial<Record<EndpointControlKey, EndpointControlReport>> = {};
  for (const key of ENDPOINT_CONTROL_KEYS) {
    const raw = rawControls[key];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      controls[key] = normalizeControlReport(raw);
    }
  }

  const result: EndpointControlsAttestation = {
    controls,
    attestedAt: isRfc3339(src.attestedAt) ? (src.attestedAt as string) : nowIso,
  };
  if (typeof src.evidenceIntact === 'boolean') {
    result.evidenceIntact = src.evidenceIntact;
  }
  if (isEnforcementTier(src.enforcementTier)) {
    result.enforcementTier = src.enforcementTier;
  }
  return result;
}
