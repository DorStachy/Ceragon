/**
 * Additive C02 protocol declaration for the immutable portable artifact.
 *
 * This deliberately declares reader compatibility only. The four-axis runtime
 * contract, obligation union, failure oracle, signing, and every V2 writer are
 * introduced by their later gated packets.
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

export const AI_SECURITY_DEFERRED_CONTRACT_SECTIONS = Object.freeze({
  fourAxisRuntimeTruth: 'P0-E01',
  obligationUnion: 'P0-O01',
  failureOracle: 'P0-F01',
  signingAndTrust: 'P0-S01',
} as const);
