import type { EnforcementEffect, GovernanceDisposition } from './runtime-adapter-contract';
import type { AiDataDisposition } from './ai-governance-contract';
import type {
  AiActualEffectObserver,
  AiInspectionStatus,
  AiObligationKind,
  AiObligationState,
  AiPrimaryState,
  AiReceiptAssurance,
  AiSecurityOutcome,
  AiTranslationDisposition,
} from './ai-enforcement-contract';

/** P0-U01/P1-D01/P1-E01 canonical V2 vocabulary.  These declarations are
 * content-free and inert: they describe future writers, never enable one. */
export const AI_COVERAGE_CONFIDENCE_SOURCES = Object.freeze(['INDEPENDENT', 'DUAL_PATH', 'SELF_REPORTED', 'NONE'] as const);
export const AI_ACTION_COVERAGE_STATES = Object.freeze(['PENDING', 'UNGOVERNED', 'UNSUPPORTED', 'DEGRADED', 'GOVERNED'] as const);
export const AI_EVIDENCE_TIERS = Object.freeze(['A', 'B', 'C', 'D'] as const);
export const AI_CREDENTIAL_ROLES = Object.freeze(['STANDALONE_BEARER', 'SECRET_COMPONENT', 'IDENTIFIER_COMPONENT', 'PRIVATE_KEY', 'CAPABILITY_URL', 'NONCREDENTIAL_SENSITIVE', 'UNKNOWN'] as const);
export const AI_EXPLOITABILITY_STATES = Object.freeze(['STANDALONE', 'PAIRED', 'CONTEXTUAL', 'UNKNOWN', 'NOT_APPLICABLE'] as const);
export const AI_VALIDATION_STATES = Object.freeze(['VALID', 'INVALID', 'UNKNOWN', 'NOT_APPLICABLE'] as const);
export const AI_ASSERTION_STATES = Object.freeze(['YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'] as const);
export const AI_REVERSIBILITY_STATES = Object.freeze(['REVERSIBLE', 'COMPENSATABLE', 'IRREVERSIBLE', 'UNKNOWN'] as const);
export const AI_BLAST_RADIUS_STATES = Object.freeze(['LOCAL', 'TEAM', 'TENANT', 'EXTERNAL', 'UNKNOWN'] as const);
export const AI_OBLIGATION_PROOF_TYPES = Object.freeze(['NONE', 'ADAPTER_OUTPUT', 'RUNTIME_ACK', 'PREPARED_DIGEST_MATCH', 'TRANSFORM_PARSE', 'TRANSFORM_RESCAN', 'CAPABILITY_REMOVED', 'TRUSTED_USER_CONFIRMATION', 'DELEGATED_GRANT', 'ZERO_RELEASE_OBSERVER', 'SINK_RECEIPT', 'FINAL_STATE_OBSERVER'] as const);
export const AI_BUNDLE_AUDIENCE_KINDS = Object.freeze(['ORG', 'SITE', 'ENDPOINT_GROUP', 'ENDPOINT'] as const);
export const AI_ROLLOUT_PHASES = Object.freeze(['SHADOW', 'CANARY', 'ENFORCE'] as const);
export const AI_KEY_TRANSITION_REASONS = Object.freeze(['ROUTINE', 'ADMINISTRATIVE', 'COMPROMISE_RECOVERY'] as const);

export type AiCoverageConfidenceSource = (typeof AI_COVERAGE_CONFIDENCE_SOURCES)[number];
export type AiActionCoverageState = (typeof AI_ACTION_COVERAGE_STATES)[number];
export type AiEvidenceTier = (typeof AI_EVIDENCE_TIERS)[number];
export type AiCredentialRole = (typeof AI_CREDENTIAL_ROLES)[number];
export type AiExploitabilityState = (typeof AI_EXPLOITABILITY_STATES)[number];
export type AiValidationState = (typeof AI_VALIDATION_STATES)[number];
export type AiAssertionState = (typeof AI_ASSERTION_STATES)[number];
export type AiReversibilityState = (typeof AI_REVERSIBILITY_STATES)[number];
export type AiBlastRadiusState = (typeof AI_BLAST_RADIUS_STATES)[number];
export type AiObligationProofType = (typeof AI_OBLIGATION_PROOF_TYPES)[number];
export type AiRolloutPhase = (typeof AI_ROLLOUT_PHASES)[number];

export type AiUuid = string;
export type AiTimestamp = string;
export type AiSlug = string;
export type AiDigest = string;
export type AiHmac = string;
export type AiOpaqueId = string;
export type AiSafeToken = string;
export type AiDecimalU64 = string;
export type EnforcementEffectV2 = EnforcementEffect;
export type AiGovernanceDispositionV2 = GovernanceDisposition;

export type AiCredentialValidationV2 = Readonly<{ syntax: AiValidationState; cryptography: AiValidationState; issuerAudienceType: AiValidationState; active: AiAssertionState; tenantOwned: AiAssertionState; revokedOrExpired: AiAssertionState; publicTest: AiAssertionState; paired: AiAssertionState }>;
export type AiFindingSummaryV2 = Readonly<{ findingId: AiUuid; detectorId: AiSlug; detectorVersion: AiSlug; classId: AiSlug; evidenceTier: AiEvidenceTier; credentialRole: AiCredentialRole; exploitability: AiExploitabilityState; validation: AiCredentialValidationV2; representationPathIds: readonly AiSlug[]; spanCount: number; findingHmac: AiHmac; safeTransformIds: readonly AiSlug[]; enforcementEligible: boolean; localEvidenceHandleHmac: AiHmac | null; limitations: readonly AiSlug[] }>;
export type AiLocalFindingV2 = AiFindingSummaryV2 & Readonly<{ spans: readonly Readonly<{ unit: 'UTF8_BYTE'; start: number; end: number }>[]; sealedEvidenceHandle: string }>;
export type AiRuntimeBindingV2 = Readonly<{ runtime: AiSlug; host: AiSlug; integration: AiSlug; platform: AiSlug | null; hookDialect: AiSlug | null; runtimeVersion: AiSafeToken | null; adapterVersion: AiSafeToken | null; configSource: AiSlug | null }>;
export type AiRuntimeSessionIdentityV2 = Readonly<{ runtimeSessionRef: AiHmac | null; backendSessionId: AiOpaqueId | null; toolUseRef: AiHmac | null; checkpoint: AiSlug; eventId: AiUuid | null; idempotencyKey: AiSlug }>;
export type AiRuntimeContextV2 = Readonly<{ binding: AiRuntimeBindingV2; session: AiRuntimeSessionIdentityV2 }>;
export type AiGovernedActionEnvelopeV2 = Readonly<{ actor: Readonly<{ type: AiSlug; id: AiHmac | null; source: AiSlug; assurance: AiSlug }>; executionSubject: Readonly<{ type: AiSlug; id: AiHmac | null; location: AiSlug }>; runtimeContext: AiRuntimeContextV2; governanceDisposition: AiGovernanceDispositionV2 | null; enforcementEffect: EnforcementEffectV2 | null }>;
export type AiActionFingerprintInputV2 = Readonly<{ protocolVersion: '2'; runtimeEnvelopeDigest: AiDigest; beforePayloadDigest: AiDigest; principalRef: AiHmac; capabilities: readonly AiSlug[]; resourceRefs: readonly AiHmac[]; destinationZone: AiSlug; destinationRefs: readonly AiHmac[]; reversibility: AiReversibilityState; blastRadius: AiBlastRadiusState; contentInspectionStatus: AiInspectionStatus; effectExtractionStatus: AiInspectionStatus; schemaDigest: AiDigest | null; publisherDigest: AiDigest | null; taskContractDigest: AiDigest | null; findingSummaries: readonly AiFindingSummaryV2[] }>;
export type AiActionProposalV2 = AiActionFingerprintInputV2 & Readonly<{ actionId: AiUuid; idempotencyKey: AiSlug; runtimeEnvelope: AiGovernedActionEnvelopeV2; proposalFingerprint: AiHmac; limitations: readonly AiSlug[]; createdAt: AiTimestamp }>;
export type AiCanonicalScopeRefV2 = Readonly<{ type: 'org' | 'site' | 'team'; id: AiOpaqueId }>;
export type AiCanonicalObligationV2 = Readonly<{ obligationId: AiSlug; kind: AiObligationKind; sourceRuleId: AiSlug; sourceScope: AiCanonicalScopeRefV2; grantable: boolean; hardFloor: boolean; reasonCode: AiSlug; parameters: Readonly<Record<string, unknown>>; parametersDigest: AiDigest }>;
export type AiDecisionV2 = Readonly<{ protocolVersion: '2'; decisionId: AiUuid; actionId: AiUuid; proposalFingerprint: AiHmac; beforePayloadDigest: AiDigest; policyRevision: AiDecimalU64; policyDigest: AiDigest; bundleDigest: AiDigest; detectorCatalogVersion: AiSlug; detectorBundleDigest: AiDigest; normalizerVersion: AiSlug; copyVersion: AiSlug; obligations: readonly AiCanonicalObligationV2[]; unsatisfiedObligationIds: readonly AiSlug[]; primaryState: AiPrimaryState; requestedEffect: EnforcementEffectV2; contentInspectionStatus: AiInspectionStatus; effectExtractionStatus: AiInspectionStatus; copyKey: AiSlug; evaluator: Readonly<{ implementation: 'go' | 'browser-js' | 'backend-ts'; version: AiSlug }>; decidedAt: AiTimestamp; expiresAt: AiTimestamp; decisionDigest: AiDigest }>;
export type AiProofRefV2 = Readonly<{ type: 'NONE'; ref: null; observedAt: null }> | Readonly<{ type: Exclude<AiObligationProofType, 'NONE'>; ref: AiDigest | AiHmac; observedAt: AiTimestamp }>;
export type AiProofManifestV1 = Readonly<{ format: 'ceragon.ai-security.proof'; formatVersion: 1; proofId: AiUuid; type: Exclude<AiObligationProofType, 'NONE'>; actionId: AiUuid; decisionId: AiUuid; obligationId: AiSlug | null; proposalFingerprint: AiHmac; beforePayloadDigest: AiDigest; afterPayloadDigest: AiDigest | null; checkpoint: AiSlug; observerIdHmac: AiHmac; observerAssurance: AiReceiptAssurance; artifactDigests: readonly AiDigest[]; assertionDigest: AiDigest; observedAt: AiTimestamp }>;
export type AiObligationResultV2 = Readonly<{ obligationId: AiSlug; state: AiObligationState; proofs: readonly AiProofRefV2[]; failureCode: AiSlug | null; supersededByObligationId: AiSlug | null; completedAt: AiTimestamp }>;
export type AiEnforcementReceiptWireV2 = Readonly<{ protocolVersion: '2'; receiptId: AiUuid; actionId: AiUuid; decisionId: AiUuid; decisionDigest: AiDigest; proposalFingerprint: AiHmac; beforePayloadDigest: AiDigest; afterPayloadDigest: AiDigest | null; policyDigest: AiDigest; bundleDigest: AiDigest; detectorBundleDigest: AiDigest; normalizerVersion: AiSlug; checkpoint: AiSlug; runtimeContext: AiRuntimeContextV2; requestedEffect: EnforcementEffectV2; adapterExpressedEffect: EnforcementEffectV2 | null; translationDisposition: AiTranslationDisposition; observedActualEffect: EnforcementEffectV2 | null; actualEffectObserver: AiActualEffectObserver; actualEffectProof: AiProofRefV2; obligationResults: readonly AiObligationResultV2[]; dataDisposition: AiDataDisposition | null; governanceDisposition: AiGovernanceDispositionV2; securityOutcome: AiSecurityOutcome; emitterStreamId: AiUuid; sequence: AiDecimalU64; eventTime: AiTimestamp; limitations: readonly AiSlug[]; errors: readonly AiSlug[]; finalStateObservationRef: AiDigest | AiHmac | null }>;
export type AiEnforcementReceiptRecordV2 = Readonly<{ wire: AiEnforcementReceiptWireV2; wireBodyDigest: AiDigest; serverOrgId: AiOpaqueId; serverSiteId: AiOpaqueId | null; serverEndpointId: AiOpaqueId; requestSigningVerifiedAgentId: AiOpaqueId | null; receiptAssurance: AiReceiptAssurance; certifiedSecurityOutcome: AiSecurityOutcome; certifiedDataDisposition: AiDataDisposition | null; proofValidationVersion: AiSlug; serverReceiveTime: AiTimestamp }>;
export type AiActionCoverageV2 = Readonly<{ actionId: AiUuid; state: AiActionCoverageState; confidenceSource: AiCoverageConfidenceSource; evaluatedAt: AiTimestamp; limitations: readonly AiSlug[] }>;
export type AiHmacDomainCatalogEntryV1 = Readonly<{ domain: AiSlug; inputFields: readonly AiSlug[]; writerEnabled: false }>;
export type AiHmacDomainInputV1 = Readonly<{ domain: AiSlug; value: Readonly<Record<string, unknown>> }>;
export type AiRolloutV2 = Readonly<{ segmentId: AiSlug; phase: AiRolloutPhase; assignmentId: AiUuid }>;
export type AiEvidenceManifestV1 = Readonly<{ evidenceId: AiUuid; classId: AiSlug; findingHmac: AiHmac; tier: AiEvidenceTier; artifactDigests: readonly AiDigest[]; observedAt: AiTimestamp }>;
export type AiDetectorCatalogV1 = Readonly<{ format: 'ceragon.ai-security.detector-catalog'; formatVersion: 1; catalogVersion: AiSlug; productionWriterEnabled: false; classes: readonly unknown[] }>;
export type AiNeutralEvaluationCaseV1 = Readonly<{ format: 'ceragon.ai-security.neutral-evaluation-case'; formatVersion: 1; caseId: AiUuid; semanticBaseCaseId: AiUuid; clusterId: AiSlug; label: 'ATTACK' | 'BENIGN' | 'BOUNDARY' | 'DEGRADED'; split: 'PUBLIC_SYNTHETIC' | 'PRIVATE_INCIDENT' | 'SEALED_HOLDOUT' | 'TENANT_LOCAL' | 'ISSUER_SANDBOX'; provenance: Readonly<{ source: AiSlug; license: AiSlug; trust: AiSlug }>; budget: Readonly<{ maxCpuMs: number; maxWallMs: number; maxMemoryBytes: number }>; expected: Readonly<Record<string, unknown>> }>;
export type AiNeutralEvaluationResultV1 = Readonly<{ format: 'ceragon.ai-security.neutral-evaluation-result'; formatVersion: 1; caseId: AiUuid; runnerId: AiSlug; resultDigest: AiDigest; findings: readonly AiFindingSummaryV2[]; inspectionStatus: AiInspectionStatus; effectExtractionStatus: AiInspectionStatus; finalState: Readonly<{ outcome: AiSecurityOutcome; observationRef: AiDigest | AiHmac | null }>; budget: Readonly<{ cpuMs: number; wallMs: number; memoryBytes: number }> }>;
