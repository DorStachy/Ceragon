# AI security disposition vocabulary

Status: Wave 2 Task 9 authority

Scope: prompt, ingress, and tool findings that can reach the AI event ledger

Last verified against:

- Backend `e6fde84572e345c485537b087e35782d186fc553`
- Installers merge `a9b987072b7c952085c1733207711db55fcf8891` from independently reviewed
  candidate `7b1eb502d9a0cecdee384749c756fcb8d0e845e6`

## Why this vocabulary exists

The word `monitor` previously collapsed visibility, alerting, and enforcement into one label. Those
are different product effects with different decision points. A detector can be visible without
paging the SOC, and it can be non-blocking on an ordinary session while still contributing to a
hold on an independently tainted session.

Use the four objects below when describing what a finding does. Never substitute one for another.

## The four objects

| Object | Meaning | Authoritative decision | Current product effect |
|---|---|---|---|
| Private endpoint telemetry | A measurement retained only on the endpoint and never sent to the control plane | No production class or configuration flag exists for this object today | Empty by construction. It is not a synonym for `monitor`. |
| Customer-visible detection | A row classified as a detection and returned on the customer detection surfaces | Backend `isDetectionEvent` in `src/ai-governance/services/activity-kind.util.ts` and the matching detection SQL predicate | A row with at least one data class is a detection. A monitored finding therefore remains visible and counts in precision and false-positive measurement. |
| SOC alert | A row admitted to the alert feed and its notification workflow | Backend `aiAlertScopeSql` in `src/alerts/alerts.service.ts` | Tool `TOOL_CALL_REQUESTED` is absent from the alert scope. A tool finding set to monitor does not page the SOC. `TOOL_CALL_HELD` is also absent today. |
| Enforcement | An effect that stops, rewrites, redacts, warns, or holds the developer's action | The endpoint policy engines, backend upgrade-only decision, runtime adapter translation, and taint overlay at their named checkpoints | This is about what happened to the action, not whether a row is visible or alert-worthy. |

## What `monitor` means today

On the tool lane, the Backend projects a monitored class as `allow` in the action map plus the class
id in `monitorClasses`. The endpoint resolves that pair to the internal `monitor` marker before it
applies independent safety floors. The finding is still evaluated and sent to the Backend, so its
data class makes the event a customer-visible detection. It is not private telemetry, and hiding it
from detection surfaces would be suppression, not monitoring.

The self-defense floor is a separate rule. For `devoid-self-disable` and
`sensitive-write-devoid`, an explicit `allow` or `monitor` class-policy disposition is raised to
`warn`. Those calls can therefore interrupt on a clean session even though the tenant-authored
class disposition was `allow` or `monitor`. This exception does not give a SHADOW class authority:
the lifecycle filter removes SHADOW findings before the self-defense floor.

The monitored tool event does not enter the current SOC alert scope. Nobody is paged merely because
the tool finding was monitored.

For a non-self-defense finding whose disposition remains `monitor` after the independent floors, a
clean session is not interrupted. Monitoring is still not guaranteed to be non-interrupting in every
sequence: if a session was already tainted by independently ingested untrusted content, every
non-INFO, non-SHADOW tool finding makes the proposed action risky enough for the taint overlay to
HOLD. That includes a finding whose class-policy disposition is `monitor`. The hold is an enforcement
effect caused by the combination of the prior session taint and the current risky action; it is not a
reclassification of the finding as a block.

Therefore, for a class whose final local disposition remains `monitor`, today's tool `monitor` is:

- customer-visible detection;
- no direct SOC alert;
- no interruption on a clean session; and
- potentially an input to a hold on an independently tainted session.

The self-defense classes are the declared exception: their explicit `allow` or `monitor` disposition
is floored to `warn` before the final tool decision.

The earlier phrase “silent telemetry is fine” does not describe this behavior. `monitor` is neither
silent nor endpoint-private.

## SHADOW is a lifecycle, not a disposition

`SHADOW` answers whether a detector class has earned authority to interrupt. It does not answer how
an administrator configured the class.

A SHADOW class is evaluated and recorded as a customer-visible detection, but it may never block,
redact, warn, or hold. The lifecycle gate wins before a tenant action map, legacy class arrays,
built-in fallback, or taint handling. Unknown classes are not treated as SHADOW; doing that would
turn a missing catalog entry into an enforcement bypass.

This distinction is load-bearing:

- `monitor` is a policy disposition and can currently participate in the taint overlay;
- `SHADOW` is a detector lifecycle and cannot participate in any interruption.

## Two reasons on a taint-induced hold

A taint-induced hold has two independent causes. Both must be recorded:

| Field | Question it answers |
|---|---|
| `taintReason` | Why did the session become tainted? |
| `taintRiskClass` | Which finding class, or the synthetic `sensitive-path-or-op` class, made this action risky? |
| `taintRiskDisposition` | For the finding arm, which per-class policy disposition did `toolRiskDisposition` return before the independent self-defense floor? A missing or invalid token records the singleton fallback instead; the sensitive-path arm records `hold`. This attribution is not always the final aggregate tool verdict. |
| `taintRiskArm` | Which arm fired: `finding` or `sensitive-path`? |

`taintReason` must not be reused as the current-action reason. A poisoned tool result and the later
action it influenced are different facts.

## The deliberately unshipped narrowing

“Monitoring alone must remain non-tainting” is `NOT_READY` and is not delivered by Wave 2 Task 9.
Removing monitored findings from the taint input would remove a live prompt-injection control. Wave
4B owns that possible narrowing after both of these exist:

1. a named Product/Security ratification of the taint-eligible disposition set; and
2. paired benign-sequence precision and poisoned-sequence recall measurements.

Those denominators do not exist until Wave 3 repairs the measurement instrument, and the required
sequence corpora do not exist until the later suite work. Until then, keep the eligible set stable,
record the class-policy attribution defined above, and report this line as `NOT_READY`.

## Review invariants

- Do not change `isDetectionEvent` to make monitored findings disappear.
- Do not add a private-telemetry class or flag under the name `monitor`.
- Do not claim a monitored tool finding pages the SOC while `TOOL_CALL_REQUESTED` and
  `TOOL_CALL_HELD` are absent from `aiAlertScopeSql`.
- Do not let a SHADOW class interrupt through policy, fallback, self-defense, or taint paths.
- Do not collapse `taintReason` and the current action's `taintRisk*` attribution.
- Do not describe `taintRiskDisposition` as the final tool verdict; the self-defense floor and
  strictest-wins aggregation are separate axes.
- Do not narrow monitor out of taint before the named Product/Security and measurement gates.

## Proof hooks

- Installers `TestShadowClassNeverHoldsOnTaint`
- Installers `TestToolRiskDisposition_ShadowWins`
- Installers `TestTaintRisky_AttributesTheFindingAndSensitivePathArms`
- Installers `TestToolGate_TaintedRiskyHolds`
- Installers `TestToolGate_TaintedFindingHoldCarriesEffectiveDisposition`
- Installers `TestToolHold_GrantReleasesOnceThenIsSpent`

These tests establish behavior and attribution. They do not establish a measured false-positive
rate, calibrated evidence strength, or production rollout proof.
