/**
 * DD6-PN5 — the artifact runtime contract's fleet wire (identical in the
 * Backend, Ceragon-Intelligence and workspace-root copies).
 *
 * The endpoint (Installers internal/core/backend/runtime_contracts.go) reports,
 * per installed artifact version, what its processes touched — tenant-keyed
 * host-class digests (`t1:` + 32 hex), credential-store classes and
 * coverage-partial reasons; content-free — to
 * `POST /api/v1/ai/runtime-contracts/report` (endpoint-signed). The Backend
 * (src/ai-runtime-contracts) answers each contract with what the fleet saw the
 * identity's OTHER versions touch, restricted to the reported values. The
 * Backend's runtime constants are module-local and pinned to these tuples by
 * `runtime-contracts.contract.parity.spec.ts`.
 */

export const RUNTIME_CONTRACT_ECOSYSTEMS = ['plugin', 'agent-skill'] as const;
export type RuntimeContractEcosystem = (typeof RUNTIME_CONTRACT_ECOSYSTEMS)[number];

export const RUNTIME_CONTRACT_REPORT_FIELDS = [
  'identityKey',
  'artifactDigest',
  'keyScope',
  'hosts',
  'creds',
  'partial',
] as const;

export const RUNTIME_CONTRACT_ANSWER_FIELDS = [
  'index',
  'otherVersions',
  'contracts',
  'knownHosts',
  'knownCreds',
] as const;

/** One artifact version's runtime contract as one endpoint saw it. */
export interface RuntimeContractReport {
  /** `ecosystem:canonical name` (the DD6-W6c identity key). */
  identityKey: string;
  /** The version's sha256, 64 lowercase hex. */
  artifactDigest: string;
  /** `tenant:v<key version>`: digests under different key versions never compare. */
  keyScope: string;
  /** Tenant-keyed host-class digests, `t1:` + 32 hex; at most 256. */
  hosts: string[];
  /** Credential-store classes (slugs); at most 64. */
  creds: string[];
  /** Coverage-partial reasons (slugs); at most 32. */
  partial: string[];
}

export interface RuntimeContractReportRequest {
  /** 1..100 contracts. */
  contracts: RuntimeContractReport[];
}

/** The fleet's answer for the contract at `index`. */
export interface RuntimeContractFleetAnswer {
  index: number;
  /**
   * Versions of the identity the org's fleet first saw BEFORE this one (its
   * earliest report): a successor is never a baseline, and versions first
   * seen together do not judge each other.
   */
  otherVersions: number;
  /** Of those, the ones with a comparable contract (same key scope, not partial-only). */
  contracts: number;
  /** The reported host digests some earlier version touched. */
  knownHosts: string[];
  /** The reported credential-store classes some earlier version touched. */
  knownCreds: string[];
}

export interface RuntimeContractReportResponse {
  /** One answer per reported contract, in report order. */
  answers: RuntimeContractFleetAnswer[];
}
