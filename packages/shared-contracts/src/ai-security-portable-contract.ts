/**
 * Additive C02 protocol declaration for the immutable portable artifact.
 *
 * This declares reader compatibility only. Four-axis runtime truth is now
 * additive and non-HMAC; P0-O01/P0-F01 are frozen but inert. Signing and every
 * production V2 writer remain gated to their later packets.
 */
export const AI_ENFORCEMENT_PROTOCOL_VERSIONS = Object.freeze(['1', '2'] as const);
export type AiEnforcementProtocolVersion =
  (typeof AI_ENFORCEMENT_PROTOCOL_VERSIONS)[number];

export const AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS = Object.freeze(['1'] as const);
export type AiSecurityWritableProtocolVersion =
  (typeof AI_SECURITY_WRITABLE_PROTOCOL_VERSIONS)[number];

export const AI_SECURITY_V2_WRITER_ENABLED = false as const;
export const AI_SECURITY_PORTABLE_RUNTIME_ACTIVATABLE = false as const;
export const AI_SECURITY_PORTABLE_REQUIRED_INTEGRATION_GATE = 'P0-C07' as const;

export const AI_SECURITY_COMPLETED_CONTRACT_SECTIONS = Object.freeze({
  obligationUnion: 'P0-O01',
  failureOracle: 'P0-F01',
} as const);

export const AI_SECURITY_DEFERRED_CONTRACT_SECTIONS = Object.freeze({
  signingAndTrust: 'P0-S01',
} as const);
