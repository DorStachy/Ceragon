import type {
  EnforcementEffect,
  GovernanceDisposition,
} from './runtime-adapter-contract';

/**
 * P0-E01 — additive, content-free four-axis runtime-effect compatibility
 * contract.
 *
 * This is deliberately not the full V2 receipt writer. It lets N/N-1 readers
 * preserve requested effect, adapter expression/translation, runtime-observed
 * actual effect, independently graded outcome, and server-derived assurance
 * without promoting one fact into another. Production V2 and tenant-HMAC
 * writers remain disabled by `ai-security-portable-contract.ts` until P1-H04.
 */

export const AI_TRANSLATION_DISPOSITIONS = Object.freeze([
  'EXPRESSED',
  'UNSUPPORTED_EFFECT',
  'TRANSLATION_FAILED',
  'NOT_APPLICABLE',
] as const);

export type AiTranslationDisposition =
  (typeof AI_TRANSLATION_DISPOSITIONS)[number];

export const AI_SECURITY_OUTCOMES = Object.freeze([
  'PREVENTED',
  'SANITIZED',
  'RESTRICTED_COMPLETION',
  'AUTHORIZED_COMPLETION',
  'UNAUTHORIZED_EFFECT',
  'UNKNOWN',
  'NOT_APPLICABLE',
] as const);

export type AiSecurityOutcome = (typeof AI_SECURITY_OUTCOMES)[number];

export const AI_RECEIPT_ASSURANCE = Object.freeze([
  'UNVERIFIED_LEGACY',
  'VERIFIED_ENDPOINT_REPORT',
  'INDEPENDENTLY_OBSERVED',
] as const);

export type AiReceiptAssurance = (typeof AI_RECEIPT_ASSURANCE)[number];

export const AI_ACTUAL_EFFECT_OBSERVERS = Object.freeze([
  'NONE',
  'RUNTIME_ACK',
  'BROWSER_CHECKPOINT',
  'PROXY_CHECKPOINT',
  'MCP_BROKER',
  'FINAL_STATE_GRADER',
] as const);

export type AiActualEffectObserver =
  (typeof AI_ACTUAL_EFFECT_OBSERVERS)[number];

/** `EXPRESSED` if and only if an adapter-expressed effect is present. */
export type AiAdapterExpressionCompatibilityV1 =
  | Readonly<{
      adapterExpressedEffect: EnforcementEffect;
      translationDisposition: 'EXPRESSED';
    }>
  | Readonly<{
      adapterExpressedEffect: null;
      translationDisposition: Exclude<
        AiTranslationDisposition,
        'EXPRESSED'
      >;
    }>;

/** A runtime-observed effect requires a named observer; absence requires NONE. */
export type AiRuntimeEffectObservationCompatibilityV1 =
  | Readonly<{
      observedActualEffect: null;
      actualEffectObserver: 'NONE';
    }>
  | Readonly<{
      observedActualEffect: EnforcementEffect;
      actualEffectObserver: Exclude<AiActualEffectObserver, 'NONE'>;
    }>;

/**
 * The four facts carried additively on compatibility events/receipts.
 * `securityOutcome` is an emitter report; this shape never certifies it.
 */
export type AiFourAxisEffectWireCompatibilityV1 = Readonly<{
  requestedEffect: EnforcementEffect;
  governanceDisposition: GovernanceDisposition;
  securityOutcome: AiSecurityOutcome;
}> &
  AiAdapterExpressionCompatibilityV1 &
  AiRuntimeEffectObservationCompatibilityV1;

/**
 * Server-side compatibility record. Assurance is outside `wire` because only
 * verified transport identity and an independently correlated observer may
 * derive it; an endpoint/body cannot stamp its own assurance.
 */
export type AiFourAxisEffectRecordCompatibilityV1 = Readonly<{
  wire: AiFourAxisEffectWireCompatibilityV1;
  receiptAssurance: AiReceiptAssurance;
}>;


/** P0-O01 — exact ordered V2 obligation vocabulary. */
export const AI_OBLIGATION_KINDS = Object.freeze([
  'AUDIT',
  'NOTIFY',
  'SANITIZE',
  'RESTRICT_CAPABILITY',
  'REQUIRE_CONFIRMATION',
  'REQUIRE_DELEGATED_APPROVAL',
  'DENY',
  'QUARANTINE',
] as const);

export type AiObligationKind = (typeof AI_OBLIGATION_KINDS)[number];

export const AI_OBLIGATION_STATES = Object.freeze([
  'REQUIRED',
  'SATISFIED',
  'UNSATISFIED',
  'UNSUPPORTED',
  'SUPERSEDED',
  'FAILED',
] as const);

export type AiObligationState = (typeof AI_OBLIGATION_STATES)[number];

export const AI_PRIMARY_STATES = Object.freeze([
  'SCANNING',
  'CONTINUED_SAFELY',
  'SANITIZED_AND_CONTINUED',
  'CONTINUED_WITH_RESTRICTION',
  'NEEDS_CONFIRMATION',
  'APPROVAL_REQUESTED',
  'BLOCKED_BEFORE_EFFECT',
  'PROTECTION_DEGRADED',
] as const);

export type AiPrimaryState = (typeof AI_PRIMARY_STATES)[number];

export const AI_INSPECTION_STATUSES = Object.freeze([
  'COMPLETE',
  'PARTIAL',
  'UNSUPPORTED',
  'BUDGET_EXCEEDED',
  'PARSER_FAILED',
  'ENCRYPTED',
  'TIMED_OUT',
  'NOT_APPLICABLE',
] as const);

export type AiInspectionStatus = (typeof AI_INSPECTION_STATUSES)[number];

export const AI_NOTIFY_AUDIENCES = Object.freeze(['USER', 'ADMIN', 'SOC'] as const);
export type AiNotifyAudience = (typeof AI_NOTIFY_AUDIENCES)[number];

export const AI_TRUSTED_CONFIRMATION_SURFACES = Object.freeze([
  'BROWSER_EXTENSION',
  'MANAGEMENT_CONSOLE',
] as const);
export type AiTrustedConfirmationSurface =
  (typeof AI_TRUSTED_CONFIRMATION_SURFACES)[number];

export const AI_QUARANTINE_UNTIL_STATES = Object.freeze([
  'INSPECTION_COMPLETE',
  'USER_RESUME',
  'ADMIN_DECISION',
] as const);
export type AiQuarantineUntilState =
  (typeof AI_QUARANTINE_UNTIL_STATES)[number];

export type AiScopeRefV2 =
  | Readonly<{ type: 'org'; id: string }>
  | Readonly<{ type: 'site'; id: string }>
  | Readonly<{ type: 'team'; id: string }>;

export type AiObligationBaseV2<K extends AiObligationKind, P> = Readonly<{
  obligationId: string;
  kind: K;
  sourceRuleId: string;
  sourceScope: AiScopeRefV2;
  grantable: boolean;
  hardFloor: boolean;
  reasonCode: string;
  parameters: Readonly<P>;
  parametersDigest: string;
}>;

/**
 * Exact P0-O01 discriminated union. Bounds, canonical parameter digests, and
 * the at-least-one restriction deny-set invariant are enforced by the portable
 * JSON schema and conformance catalog generated from this package.
 */
export type AiObligationV2 =
  | AiObligationBaseV2<'AUDIT', {
      eventClass: string;
      retentionClass: string;
    }>
  | AiObligationBaseV2<'NOTIFY', {
      copyKey: string;
      audience: AiNotifyAudience;
    }>
  | AiObligationBaseV2<'SANITIZE', {
      transformIds: readonly string[];
      targetFieldPathHmacs: readonly string[];
      requireParse: boolean;
      requireRescan: boolean;
      requireStatePreservation: boolean;
    }>
  | AiObligationBaseV2<'RESTRICT_CAPABILITY', {
      capabilities: readonly string[];
      resourceRefs: readonly string[];
      destinationRefs: readonly string[];
    }>
  | AiObligationBaseV2<'REQUIRE_CONFIRMATION', {
      confirmationClass: string;
      trustedSurface: AiTrustedConfirmationSurface;
      ttlSeconds: number;
    }>
  | AiObligationBaseV2<'REQUIRE_DELEGATED_APPROVAL', {
      approvalClass: string;
      reviewerRoles: readonly string[];
      ttlSeconds: number;
      maxUses: number;
    }>
  | AiObligationBaseV2<'DENY', {
      invariantId: string;
      copyKey: string;
      nonGrantable: true;
    }>
  | AiObligationBaseV2<'QUARANTINE', {
      until: AiQuarantineUntilState;
      ttlSeconds: number;
    }>;
