import type { EnforcementEffect } from './runtime-adapter-contract';
import type { AiPrimaryState } from './ai-enforcement-contract';

/** P0-F01 — the approved, closed failure-oracle dimensions. */
export const AI_FAILURE_ORACLE_SURFACES = Object.freeze([
  'RUNTIME_ADAPTER',
  'LOCAL_PROXY',
  'BROWSER_COMPOSER',
  'BROWSER_UPLOAD',
] as const);
export type AiFailureOracleSurface =
  (typeof AI_FAILURE_ORACLE_SURFACES)[number];

export const AI_FAILURE_ORACLE_CHECKPOINTS = Object.freeze([
  'PRE_PROMPT',
  'PRE_TOOL',
  'POST_TOOL',
  'PRE_UPSTREAM_DISPATCH',
  'POST_UPSTREAM_RESPONSE',
  'PRE_SUBMIT',
  'POST_SUBMIT',
  'PRE_UPLOAD_DISPATCH',
  'POST_UPLOAD_DISPATCH',
] as const);
export type AiFailureOracleCheckpoint =
  (typeof AI_FAILURE_ORACLE_CHECKPOINTS)[number];

const RUNTIME_ADAPTER_CHECKPOINTS = Object.freeze([
  'PRE_PROMPT',
  'PRE_TOOL',
  'POST_TOOL',
] as const);
const LOCAL_PROXY_CHECKPOINTS = Object.freeze([
  'PRE_UPSTREAM_DISPATCH',
  'POST_UPSTREAM_RESPONSE',
] as const);
const BROWSER_COMPOSER_CHECKPOINTS = Object.freeze([
  'PRE_SUBMIT',
  'POST_SUBMIT',
] as const);
const BROWSER_UPLOAD_CHECKPOINTS = Object.freeze([
  'PRE_UPLOAD_DISPATCH',
  'POST_UPLOAD_DISPATCH',
] as const);

export const AI_FAILURE_ORACLE_SURFACE_CHECKPOINTS = Object.freeze({
  RUNTIME_ADAPTER: RUNTIME_ADAPTER_CHECKPOINTS,
  LOCAL_PROXY: LOCAL_PROXY_CHECKPOINTS,
  BROWSER_COMPOSER: BROWSER_COMPOSER_CHECKPOINTS,
  BROWSER_UPLOAD: BROWSER_UPLOAD_CHECKPOINTS,
} as const);

export const AI_FAILURE_ORACLE_FAILURES = Object.freeze([
  'POLICY_UNAVAILABLE',
  'POLICY_INVALID',
  'POLICY_EXPIRED',
  'PARTIAL',
  'UNSUPPORTED',
  'BUDGET_EXCEEDED',
  'PARSER_FAILED',
  'ENCRYPTED',
  'TIMED_OUT',
  'EFFECT_EXTRACTION_INCOMPLETE',
  'UNSUPPORTED_EFFECT',
  'TRANSLATION_FAILED',
  'RUNTIME_ACK_MISSING',
  'INTERVENTION_UNAVAILABLE',
] as const);
export type AiFailureOracleFailure =
  (typeof AI_FAILURE_ORACLE_FAILURES)[number];

export const AI_FAILURE_ORACLE_IMPACTS = Object.freeze([
  'LOW_IMPACT',
  'SENSITIVE_DATA',
  'ACTIVE_SECRET',
  'FORBIDDEN_DESTINATION',
  'DESTRUCTIVE_OR_PRIVILEGED',
  'APPROVAL_REQUIRED',
  'TRUST_INTEGRITY',
] as const);
export type AiFailureOracleImpact =
  (typeof AI_FAILURE_ORACLE_IMPACTS)[number];

export const AI_FAILURE_ORACLE_OUTCOMES = Object.freeze([
  'PROCEED_OBSERVED_ONLY',
  'RESTRICT_CAPABILITY',
  'REQUIRE_CONFIRMATION',
  'HOLD',
  'DENY',
] as const);
export type AiFailureOracleOutcome =
  (typeof AI_FAILURE_ORACLE_OUTCOMES)[number];

export const AI_FAILURE_ORACLE_RECOVERY_ACTIONS = Object.freeze([
  'RETRY_AFTER_PROTECTION_RESTORED',
  'RESTORE_TRUSTED_POLICY',
  'USE_TRUSTED_CONFIRMATION',
  'REQUEST_DELEGATED_APPROVAL',
  'REMOVE_ACTIVE_SECRET',
  'CHANGE_FORBIDDEN_DESTINATION',
  'REDUCE_CAPABILITY_AND_RETRY',
  'USE_SUPPORTED_SURFACE',
  'START_NEW_PROPOSAL',
] as const);
export type AiFailureOracleRecoveryAction =
  (typeof AI_FAILURE_ORACLE_RECOVERY_ACTIONS)[number];

export type AiFailureOracleRowV1 = Readonly<{
  surface: AiFailureOracleSurface;
  checkpoint: AiFailureOracleCheckpoint;
  failure: AiFailureOracleFailure;
  impact: AiFailureOracleImpact;
  outcome: AiFailureOracleOutcome;
  primaryState: AiPrimaryState;
  requestedEffect: EnforcementEffect;
  copyKey: string;
  recoveryAction: AiFailureOracleRecoveryAction;
  policyFailOpenRequired: boolean;
  nonGrantable: boolean;
}>;
