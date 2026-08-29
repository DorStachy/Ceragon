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
import type { AiDataDisposition } from './ai-governance-contract';
import type {
  AiAssertionState,
  AiCredentialRole,
  AiCredentialValidationV2,
  AiEvidenceTier,
  AiExploitabilityState,
} from './ai-security-v2-contract';
import type { EnforcementEffect, GovernanceDisposition } from './runtime-adapter-contract';

/** P1-E01/E07: inert, content-free neutral evaluation contract. */
export const AI_NEUTRAL_EVALUATION_CONTRACT_VERSION = '0.7.0' as const;
export const AI_NEUTRAL_EVALUATION_FORMAT_VERSION = 2 as const;
export const AI_NEUTRAL_EVALUATION_RUNTIME_ACTIVATABLE = false as const;
export const AI_NEUTRAL_EVALUATION_V2_WRITER_ELIGIBLE = false as const;

export type AiNeutralDigest = `sha256:${string}`;
export type AiNeutralDataPlane =
  | 'PUBLIC_SYNTHETIC'
  | 'PRIVATE_INCIDENT'
  | 'SEALED_HOLDOUT'
  | 'TENANT_LOCAL'
  | 'ISSUER_SANDBOX';
export type AiNeutralLabel = 'ATTACK' | 'BENIGN' | 'BOUNDARY' | 'DEGRADED';
export type AiNeutralSpanV2 = Readonly<{ start: number; end: number; unit: 'UTF8_BYTE' }>;
export type AiNeutralFindingSourceV2 = Readonly<{
  kind: 'CONTENT' | 'FILE_METADATA';
  pathId: string;
  pathDigest: AiNeutralDigest | null;
}>;
export type AiNeutralFindingV2 = Readonly<{
  findingRef: string;
  classId: string;
  ruleId: string | null;
  detectorId: string | null;
  detectorVersion: string | null;
  severity: string | null;
  evidenceTier: AiEvidenceTier | null;
  enforcementEligible: boolean | null;
  credentialRole: AiCredentialRole | null;
  exploitability: AiExploitabilityState | null;
  validation: AiCredentialValidationV2 | null;
  representationId: string | null;
  canonicalizationPathIds: readonly string[];
  source: AiNeutralFindingSourceV2;
  span: AiNeutralSpanV2 | null;
  /** null means the shipping engine does not expose normalized-origin truth. */
  normalizedOnly: boolean | null;
  limitations: readonly string[];
}>;
export type AiNeutralObligationV2 = Readonly<{
  obligationId: string | null;
  kind: AiObligationKind;
  state: AiObligationState;
  detailCode: string | null;
}>;
export type AiNeutralDecisionV2 = Readonly<{
  verdict: string;
  alert: boolean;
  reasons: readonly string[];
  primaryState: AiPrimaryState | null;
}>;
export type AiNeutralEffectsV2 = Readonly<{
  /** null means no requested effect was selected at the observed boundary. */
  requestedEffect: EnforcementEffect | null;
  adapterExpressedEffect: EnforcementEffect | null;
  translationDisposition: AiTranslationDisposition;
  observedActualEffect: EnforcementEffect | null;
  actualEffectObserver: AiActualEffectObserver;
  governanceDisposition: GovernanceDisposition;
  dataDisposition: AiDataDisposition | null;
  securityOutcome: AiSecurityOutcome;
  certifiedSecurityOutcome: AiSecurityOutcome;
  receiptAssurance: AiReceiptAssurance;
}>;
export type AiNeutralTransformV2 = Readonly<{
  transformId: string;
  transformType:
    | 'MASK_MINIMUM_UNIT'
    | 'REMOVE_FIELD'
    | 'REWRITE_VALUE'
    | 'REWRITE_URI'
    | 'REPLACE_OUTPUT'
    | 'RESTRICT_CAPABILITY';
  targetFindingRefs: readonly string[];
  inputDigest: AiNeutralDigest;
  outputDigest: AiNeutralDigest;
  sourceMap: readonly Readonly<{ original: AiNeutralSpanV2; transformed: AiNeutralSpanV2 }>[];
  parseStatus: 'VALID' | 'INVALID' | 'UNKNOWN' | 'NOT_APPLICABLE';
  rescanStatus: 'CLEAN' | 'FINDING_REMAINS' | 'UNKNOWN' | 'NOT_APPLICABLE';
  syntaxPreserved: AiAssertionState;
  taskUtilityPreserved: AiAssertionState;
  statePreserved: AiAssertionState;
  limitations: readonly string[];
}>;
export type AiNeutralCompletenessV2 = Readonly<{
  contentInspectionStatus: AiInspectionStatus;
  effectExtractionStatus: AiInspectionStatus;
  limitations: readonly string[];
}>;
export type AiNeutralInterventionV2 = Readonly<{
  visible: boolean;
  hardStop: boolean;
  socIncident: boolean;
}>;
export type AiNeutralFinalStateV2 = Readonly<{
  graderId: string;
  required: boolean;
  outcome: AiSecurityOutcome;
  observationRef: AiNeutralDigest | null;
  assertions: readonly Readonly<{
    assertionId: string;
    resourceType:
      | 'NETWORK'
      | 'RECIPIENT'
      | 'FILESYSTEM'
      | 'PROCESS'
      | 'PRIVILEGE'
      | 'MCP'
      | 'MEMORY'
      | 'DURABLE_RESOURCE';
    state: string;
    valueDigest: AiNeutralDigest | null;
  }>[];
}>;
export type AiNeutralResourceBudgetV2 = Readonly<{
  maxCpuMs: number;
  maxWallMs: number;
  maxMemoryBytes: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxFindings: number;
  expectExhaustion: boolean;
}>;
export type AiNeutralResourceUsageV2 = Readonly<{
  cpuMs: number;
  wallMs: number;
  memoryBytes: number;
  inputBytes: number;
  outputBytes: number;
  findingCount: number;
  exhausted: boolean;
}>;
export type AiNeutralExpectedV2 = Readonly<{
  findings: readonly AiNeutralFindingV2[];
  obligations: readonly AiNeutralObligationV2[];
  decision: AiNeutralDecisionV2;
  effects: AiNeutralEffectsV2;
  transforms: readonly AiNeutralTransformV2[];
  completeness: AiNeutralCompletenessV2;
  intervention: AiNeutralInterventionV2;
  finalState: AiNeutralFinalStateV2;
  resourceBudget: AiNeutralResourceBudgetV2;
}>;
export type AiNeutralEvaluationCaseV2 = Readonly<{
  format: 'ceragon.ai-security.neutral-evaluation-case';
  formatVersion: 2;
  caseDigest: AiNeutralDigest;
  caseId: string;
  caseVersion: number;
  semanticBaseCaseId: string;
  clusterId: string;
  label: AiNeutralLabel;
  split: AiNeutralDataPlane;
  threatIds: readonly string[];
  controlIds: readonly string[];
  provenance: Readonly<{
    sourcePlane: AiNeutralDataPlane;
    sourceId: string;
    sourceVersion: string;
    sourceDigest: AiNeutralDigest;
    licenseId: string;
    trust: string;
    admittedAt: string;
    reviewerIds: readonly string[];
  }>;
  task: Readonly<{ taskId: string; family: string; expectedUtility: 'PRESERVED' | 'DEGRADED' | 'NOT_APPLICABLE' }>;
  subject: Readonly<{
    asset: Readonly<{ classId: string; sensitivity: string; ownership: 'TENANT' | 'PUBLIC' | 'THIRD_PARTY' | 'UNKNOWN'; assetRef: AiNeutralDigest | null }>;
    destination: Readonly<{ zone: string; classId: string; destinationRef: AiNeutralDigest | null }>;
    action: Readonly<{ actionId: string; kind: string; checkpoint: string; reversibility: string; blastRadius: string; capabilities: readonly string[] }>;
  }>;
  context: Readonly<{ surface: string; runtime: string; provider: string; language: string; modality: string; format: string }>;
  input: Readonly<{ fixtureRef: string; artifactDigest: AiNeutralDigest; byteLength: number; mediaType: string; encoding: 'UTF8' | 'BINARY' | 'STRUCTURED' }>;
  representation: Readonly<{
    representationId: string;
    lineage: readonly Readonly<{ stepId: string; transformId: string; parentDigest: AiNeutralDigest; outputDigest: AiNeutralDigest }>[];
  }>;
  statistics: Readonly<{ tenantClusterId: string | null; userClusterId: string | null; strata: readonly string[]; weight: number; claimIds: readonly string[] }>;
  expected: AiNeutralExpectedV2;
  governance: Readonly<Record<string, unknown>>;
}>;

export type AiNeutralEvaluationResultV2 = Readonly<{
  format: 'ceragon.ai-security.neutral-evaluation-result';
  formatVersion: 2;
  resultDigest: AiNeutralDigest;
  semanticDigest: AiNeutralDigest;
  caseId: string;
  semanticBaseCaseId: string;
  clusterId: string;
  runner: Readonly<{ runnerId: string; engineId: string; engineVersion: string; contractVersion: '0.7.0'; artifactDigest: AiNeutralDigest }>;
  provenance: Readonly<{ inputArtifactDigest: AiNeutralDigest; environmentDigest: AiNeutralDigest; startedAt: string; finishedAt: string }>;
  findings: readonly AiNeutralFindingV2[];
  decision: AiNeutralDecisionV2;
  obligations: readonly AiNeutralObligationV2[];
  effects: AiNeutralEffectsV2;
  transforms: readonly AiNeutralTransformV2[];
  completeness: AiNeutralCompletenessV2;
  intervention: AiNeutralInterventionV2;
  finalState: AiNeutralFinalStateV2;
  resourceUsage: AiNeutralResourceUsageV2;
  errors: readonly string[];
}>;

export type AiNeutralScorerReportV1 = Readonly<{
  format: 'ceragon.ai-security.neutral-evaluation-scorer-report';
  formatVersion: 1;
  reportDigest: AiNeutralDigest;
  contractVersion: '0.7.0';
  scorerVersion: '1.0.0';
  caseSetDigest: AiNeutralDigest;
  resultSetDigest: AiNeutralDigest;
  analysis: Readonly<Record<string, unknown>>;
  validation: Readonly<Record<string, number>>;
  summary: Readonly<Record<string, number>>;
  clusters: Readonly<Record<string, unknown>>;
  metrics: Readonly<Record<string, unknown>>;
  differential: Readonly<Record<string, number>>;
  failures: readonly Readonly<Record<string, unknown>>[];
  pass: boolean;
}>;
