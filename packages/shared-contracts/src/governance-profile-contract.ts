/** M4.1 canonical first-pilot governance profile contract. */
export const CERA_PILOT_GOVERNANCE_PROFILE_ID = 'cera-pilot-windows-web-code-security-v1' as const;
export const CERA_PILOT_GOVERNANCE_PROFILE_VERSION = 1 as const;

export const GOVERNANCE_CAPABILITY_IDS = [
  'release.windows',
  'release.web-ai-guard',
  'evidence.durable-delivery',
  // F5 — stated ONCE, here, because this is where capabilities live. Protocol-2
  // enforcement receipts have NO producer on any fleet: no shipped agent emits
  // the {wire, proofManifests} envelope, and the evidence ingest refuses one on
  // any event type other than the two receipt types. Before this capability
  // existed the gap was implied instead on every event row in the product, as a
  // per-row "no endpoint receipt is attached" absence that blamed the endpoint.
  'evidence.enforcement-receipt-protocol-2',
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
export type GovernanceCapabilityId = (typeof GOVERNANCE_CAPABILITY_IDS)[number];

export const GOVERNANCE_CAPABILITY_STATES = [
  'active',
  'degraded',
  'unverified',
  'unavailable',
  'not-governed',
] as const;
export type GovernanceCapabilityState = (typeof GOVERNANCE_CAPABILITY_STATES)[number];

export const GOVERNANCE_CAPABILITY_ASSURANCE = ['none', 'cooperative', 'mandatory'] as const;
export type GovernanceCapabilityAssurance = (typeof GOVERNANCE_CAPABILITY_ASSURANCE)[number];

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

export const CERA_PILOT_GOVERNANCE_PROFILE_REQUIREMENTS: Readonly<
  Record<GovernanceCapabilityId, { required: boolean; assurance: GovernanceCapabilityAssurance }>
> = {
  'release.windows': { required: true, assurance: 'mandatory' },
  'release.web-ai-guard': { required: true, assurance: 'mandatory' },
  'evidence.durable-delivery': { required: true, assurance: 'mandatory' },
  // NOT required and NOT assured: the capability is honestly unavailable, and
  // making it required would flip `ready` to false for every org over a gap no
  // customer can close. It is reported so it is visible, not to gate anyone.
  'evidence.enforcement-receipt-protocol-2': { required: false, assurance: 'none' },
  'endpoint.request-signing': { required: true, assurance: 'mandatory' },
  'web-ai.request-path': { required: true, assurance: 'mandatory' },
  'code-security.full-scan': { required: true, assurance: 'mandatory' },
  'infrastructure.customer-data': { required: true, assurance: 'mandatory' },
  'package.endpoint-lite': { required: true, assurance: 'cooperative' },
  'package.registry-fetch': { required: false, assurance: 'none' },
  'runtime.claude-code': { required: false, assurance: 'none' },
  'mcp.live-tool-calls': { required: false, assurance: 'none' },
  'platform.macos': { required: false, assurance: 'none' },
};
