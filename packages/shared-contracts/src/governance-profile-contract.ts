/**
 * M4.1 — versioned Governance Profile and protection-truth contract.
 *
 * A profile is the exact set of capabilities an organization is allowed to
 * rely on. Policy intent is deliberately absent from the observed truth input:
 * an administrator selecting "block" cannot manufacture a capability
 * certificate, fresh endpoint attestation, or deployment assurance.
 */

export const GOVERNANCE_PROFILE_SCHEMA_VERSION = 1 as const;
export const CERA_PILOT_GOVERNANCE_PROFILE_ID = 'cera-pilot-windows-web-code-security-v1' as const;
export const CERA_PILOT_GOVERNANCE_PROFILE_VERSION = 1 as const;

export const GOVERNANCE_CAPABILITY_IDS = [
  'release.windows',
  'release.web-ai-guard',
  'evidence.durable-delivery',
  'endpoint.request-signing',
  'web-ai.request-path',
  'code-security.full-scan',
  'infrastructure.customer-data',
  'package.endpoint-lite',
  'package.registry-fetch',
  'runtime.claude-code',
  'mcp.live-tool-calls',
  'platform.macos',
] as const;

export type GovernanceCapabilityId =
  (typeof GOVERNANCE_CAPABILITY_IDS)[number];

export const PROTECTION_TRUTH_STATES = [
  'active',
  'degraded',
  'unverified',
  'unavailable',
  'not-governed',
] as const;

export type ProtectionTruthState =
  (typeof PROTECTION_TRUTH_STATES)[number];
export const GOVERNANCE_CAPABILITY_STATES = PROTECTION_TRUTH_STATES;
export type GovernanceCapabilityState = ProtectionTruthState;

export const DEPLOYMENT_ASSURANCE_LEVELS = [
  'none',
  'cooperative',
  'mandatory',
] as const;

export type DeploymentAssurance =
  (typeof DEPLOYMENT_ASSURANCE_LEVELS)[number];
export const GOVERNANCE_CAPABILITY_ASSURANCE = DEPLOYMENT_ASSURANCE_LEVELS;
export type GovernanceCapabilityAssurance = DeploymentAssurance;

export interface GovernanceCapabilitySelection {
  /** Disabled capabilities render unavailable and never count as protected. */
  enabled: boolean;
  /** A required capability must satisfy state and assurance for profile readiness. */
  required: boolean;
  minimumAssurance: DeploymentAssurance;
}

export interface GovernanceProfile {
  schemaVersion: typeof GOVERNANCE_PROFILE_SCHEMA_VERSION;
  /** Stable machine identifier, for example cera-pilot-windows-web-code-security. */
  id: string;
  /** Monotonic profile revision; independent from agent binary versions. */
  version: number;
  /** Platforms this profile is allowed to certify. */
  platforms: readonly string[];
  capabilities: Record<GovernanceCapabilityId, GovernanceCapabilitySelection>;
}

export interface CapabilityCertificateObservation {
  /** Exact runtime/mechanism certificate passed its negative and positive suite. */
  passed: boolean;
  /** RFC3339 certificate expiry. An expired certificate is unverified. */
  expiresAt: string;
}

export interface CapabilityAttestationObservation {
  /** RFC3339 time the endpoint/control produced this observation. */
  observedAt: string;
  /** Mechanism is loaded and its self-check passed. */
  healthy: boolean;
  /** Durable evidence health has a known unaccounted delivery gap. */
  evidenceGap?: boolean;
}

export interface CapabilityObservation {
  /** False means the mechanism is outside this platform/profile boundary. */
  supported: boolean;
  /** False means a known action path is not mediated by this capability. */
  governed: boolean;
  assurance: DeploymentAssurance;
  certificate?: CapabilityCertificateObservation;
  attestation?: CapabilityAttestationObservation;
}

export interface CapabilityTruth {
  state: ProtectionTruthState;
  assurance: DeploymentAssurance;
  /** True only when this capability satisfies the selected profile requirement. */
  profileSatisfied: boolean;
  reason:
    | 'disabled'
    | 'unsupported'
    | 'not-governed'
    | 'certificate-missing'
    | 'certificate-failed'
    | 'certificate-expired'
    | 'attestation-missing'
    | 'attestation-stale'
    | 'health-degraded'
    | 'evidence-gap'
    | 'assurance-insufficient'
    | 'verified';
}

export interface GovernanceProfileEvaluation {
  ready: boolean;
  capabilities: Record<GovernanceCapabilityId, CapabilityTruth>;
  unsatisfiedRequired: GovernanceCapabilityId[];
}

/** Read-model shape projected by Backend to the console. */
export type GovernanceCapabilityProjection = {
  id: GovernanceCapabilityId;
  label: string;
  required: boolean;
  state: GovernanceCapabilityState;
  assurance: GovernanceCapabilityAssurance;
  profileSatisfied: boolean;
  reason: string | null;
};

export type GovernanceProfileProjection = {
  id: typeof CERA_PILOT_GOVERNANCE_PROFILE_ID;
  version: typeof CERA_PILOT_GOVERNANCE_PROFILE_VERSION;
  ready: boolean;
  evaluatedAt: string;
  capabilities: GovernanceCapabilityProjection[];
};

const disabledCapability: GovernanceCapabilitySelection = {
  enabled: false,
  required: false,
  minimumAssurance: 'none',
};

/**
 * The first externally certifiable profile selected for the M4.1 startup cut.
 * It deliberately claims endpoint-lite package protection, not hard registry
 * mediation, and excludes unfinished native-runtime/MCP/macOS capabilities.
 */
export const CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE: GovernanceProfile = {
  schemaVersion: GOVERNANCE_PROFILE_SCHEMA_VERSION,
  id: CERA_PILOT_GOVERNANCE_PROFILE_ID,
  version: CERA_PILOT_GOVERNANCE_PROFILE_VERSION,
  platforms: ['windows-amd64', 'chrome-managed'],
  capabilities: {
    'release.windows': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'release.web-ai-guard': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'evidence.durable-delivery': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'endpoint.request-signing': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'web-ai.request-path': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'code-security.full-scan': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'infrastructure.customer-data': { enabled: true, required: true, minimumAssurance: 'mandatory' },
    'package.endpoint-lite': { enabled: true, required: true, minimumAssurance: 'cooperative' },
    'package.registry-fetch': { ...disabledCapability },
    'runtime.claude-code': { ...disabledCapability },
    'mcp.live-tool-calls': { ...disabledCapability },
    'platform.macos': { ...disabledCapability },
  },
};

export const CERA_PILOT_GOVERNANCE_PROFILE_REQUIREMENTS: Readonly<
  Record<GovernanceCapabilityId, { required: boolean; assurance: GovernanceCapabilityAssurance }>
> = Object.fromEntries(
  GOVERNANCE_CAPABILITY_IDS.map((id) => [
    id,
    {
      required: CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE.capabilities[id].required,
      assurance: CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE.capabilities[id].minimumAssurance,
    },
  ]),
) as Record<GovernanceCapabilityId, { required: boolean; assurance: GovernanceCapabilityAssurance }>;

export const CAPABILITY_ATTESTATION_STALE_MS = 15 * 60 * 1000;

const assuranceRank: Record<DeploymentAssurance, number> = {
  none: 0,
  cooperative: 1,
  mandatory: 2,
};

function parsesAtOrBefore(value: string, nowMs: number): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= nowMs;
}

/**
 * Derive one capability's protection truth without consulting policy intent.
 * This function is deliberately pessimistic: malformed time data is never
 * fresh, and a missing certificate/attestation is never Active.
 */
export function deriveCapabilityTruth(
  selection: GovernanceCapabilitySelection,
  observation: CapabilityObservation | undefined,
  nowIso: string,
  stalenessMs = CAPABILITY_ATTESTATION_STALE_MS,
): CapabilityTruth {
  if (!selection.enabled) {
    return truth('unavailable', 'none', true, 'disabled');
  }
  if (!observation?.supported) {
    return truth('unavailable', observation?.assurance ?? 'none', false, 'unsupported');
  }
  if (!observation.governed) {
    return truth('not-governed', observation.assurance, false, 'not-governed');
  }

  const certificate = observation.certificate;
  if (!certificate) {
    return truth('unverified', observation.assurance, false, 'certificate-missing');
  }
  if (!certificate.passed) {
    return truth('unverified', observation.assurance, false, 'certificate-failed');
  }

  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs) || !parsesAtOrBefore(nowIso, Date.parse(certificate.expiresAt))) {
    return truth('unverified', observation.assurance, false, 'certificate-expired');
  }

  const attestation = observation.attestation;
  if (!attestation) {
    return truth('unverified', observation.assurance, false, 'attestation-missing');
  }
  const observedMs = Date.parse(attestation.observedAt);
  if (
    !Number.isFinite(observedMs) ||
    observedMs > nowMs ||
    nowMs - observedMs > stalenessMs
  ) {
    return truth('unverified', observation.assurance, false, 'attestation-stale');
  }
  if (attestation.evidenceGap) {
    return truth('degraded', observation.assurance, false, 'evidence-gap');
  }
  if (!attestation.healthy) {
    return truth('degraded', observation.assurance, false, 'health-degraded');
  }

  const assuranceSatisfied =
    assuranceRank[observation.assurance] >= assuranceRank[selection.minimumAssurance];
  if (!assuranceSatisfied) {
    // The mechanism may truly be active while the deployment remains bypassable.
    // Keep the axes independent and fail only the profile requirement.
    return truth('active', observation.assurance, false, 'assurance-insufficient');
  }
  return truth('active', observation.assurance, true, 'verified');
}

export function evaluateGovernanceProfile(
  profile: GovernanceProfile,
  observations: Partial<Record<GovernanceCapabilityId, CapabilityObservation>>,
  nowIso: string,
  stalenessMs = CAPABILITY_ATTESTATION_STALE_MS,
): GovernanceProfileEvaluation {
  const capabilities = {} as Record<GovernanceCapabilityId, CapabilityTruth>;
  const unsatisfiedRequired: GovernanceCapabilityId[] = [];

  for (const capability of GOVERNANCE_CAPABILITY_IDS) {
    const selection = profile.capabilities[capability];
    const result = deriveCapabilityTruth(
      selection,
      observations[capability],
      nowIso,
      stalenessMs,
    );
    capabilities[capability] = result;
    if (selection.enabled && selection.required && !result.profileSatisfied) {
      unsatisfiedRequired.push(capability);
    }
  }

  return {
    ready: unsatisfiedRequired.length === 0,
    capabilities,
    unsatisfiedRequired,
  };
}

function truth(
  state: ProtectionTruthState,
  assurance: DeploymentAssurance,
  profileSatisfied: boolean,
  reason: CapabilityTruth['reason'],
): CapabilityTruth {
  return { state, assurance, profileSatisfied, reason };
}
