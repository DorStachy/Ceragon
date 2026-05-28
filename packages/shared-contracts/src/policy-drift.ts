/**
 * Policy drift metadata attached to every verdict response.
 *
 * Surfaces the gap between the tenant's configured action and the system-
 * recommended default action so downstream consumers (alert dashboards, SIEM
 * integrations, policy-review reports) can identify decisions where tenant
 * policy is weaker than the system recommends — without the engine itself
 * applying any hidden floor.
 *
 * Added 2026-05-27 as part of the policy-driven action enforcement work.
 * Spec: docs/superpowers/specs/2026-05-27-policy-driven-action-enforcement-design.md
 */

/**
 * The final action a verdict can produce on the wire. Mirrors the
 * Backend `PolicyAction` type. Kept as a string union here to avoid a
 * cross-package dependency cycle.
 */
export type PolicyDriftAction =
  | 'BLOCK'
  | 'PROMPT'
  | 'WARN'
  | 'MONITOR'
  | 'ALLOW'
  | 'HOLD'
  | 'ALLOW_FAST'
  | 'IGNORE';

export interface PolicyDrift {
  /**
   * Would this verdict have been BLOCK under the system-recommended default
   * policy? True when the dominant triggered rule's default action is BLOCK
   * and the tenant has configured something weaker.
   */
  wasBlockingByDefault: boolean;

  /**
   * The tenant-configured action that actually drove this verdict, after
   * translation from rule action (e.g. WARN -> PROMPT when promptEnabled).
   * Use {@link configuredRuleAction} for the raw per-rule action.
   */
  configuredAction: PolicyDriftAction;

  /**
   * The system-recommended action for the dominant triggered rule. This is
   * the action defined in `default-policy-actions.ts` for the rule with the
   * highest severity that fired.
   */
  recommendedAction: PolicyDriftAction;

  /**
   * The raw RuleAction the tenant configured for the dominant rule, before
   * any translation (WARN, MONITOR, BLOCK, IGNORE). May be null if the
   * dominant rule was disabled / not present in tenant policy.
   */
  configuredRuleAction: PolicyDriftAction | null;

  /**
   * Rule keys that fired during evaluation, in the order produced by the
   * policy engine (typically sorted by severity descending). Downstream
   * consumers can use this to build a "which rules were involved" view.
   */
  triggeredRuleKeys: string[];

  /**
   * The rule key whose action dominated the final verdict — i.e. the rule
   * the user should look at first to understand "why was this BLOCKed /
   * PROMPTed". May be null when no rules fired (verdict came from the
   * score-based fallback).
   */
  dominantRuleKey: string | null;
}
