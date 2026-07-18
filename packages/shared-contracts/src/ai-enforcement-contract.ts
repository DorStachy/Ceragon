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
