# M4.7A revision pass — 2026-08-27

Three artifacts, produced by a 8-agent fan-out that dispositioned every P0/P1 in
`M47A_DETECTION_QUALITY_REVIEW_20260823.md` against `origin/main` on 2026-08-27, plus web research on
current standards, evaluation science and market practice.

| File | What it is |
|---|---|
| `M47A_REVISION_SOURCE_MATERIAL_20260827.md` | The decision content for the revised plan: what survives, what closed (C1-C16), what the review got wrong (W1-W17), the revised wave structure, the certificate model, corpus sizing with real numbers, the forbidden-claims list, and the ordered critical path to customer-ready. |
| `M47A_DRIFT_BASELINE_20260827.md` | The cross-repo rebase baseline the review demands as P0-02. |
| this file | Cover note. |

## Headline results

**31 findings dispositioned. Zero came back CLOSED or REJECTED.** The review's substance stands. What
changed is the *shape* of several findings, not their validity.

**The review itself contains 17 substantive errors** (W1-W17), each of which would have sent the
revision to rebuild something that already exists or fix something that is not broken. Three matter
most: a sealed prompt-lane instrument already exists and was never opened (W2); a per-class report
generator already ships and contains the exact defect P0-04 describes, at `holdout.go:357-358` (W3);
and review sections 9.4 and 9.5 compound into a gate requiring **8.81 million** benign opportunities,
which is unreachable and would therefore have been quietly ignored (W16).

## The one item with live customer impact, verified by hand

`destructive-rm` fires on **every** `rm -rf ~/<anything>` and `rm -rf $HOME/<anything>`, not merely on
a bare `$HOME`. Verified by compiling the shipped regex from `internal/toolrisk/toolrisk.go:122`:

```
rm -rf $HOME/.cache/pip          -> true
rm -rf ~/.npm/_cacache           -> true
rm -rf $HOME/projects/scratch    -> true
rm -rf ./build                   -> false
rm -rf /tmp/mybuild              -> false
```

`destructive-rm` is a malicious-floor member at `minimumDisposition: 'block'`
(`ai-malicious-floor.ts:155` via the `destructive()` constructor at `:104-108`). Since `dfbac545`,
`withMaliciousFloorApplied` runs as the first statement of `assembleEffectiveDto`
(`ai-security-policy.service.ts:2198`), so an administrator who sets the class to `monitor` has it
raised back to `block` when the policy is served.

**Both halves are deployed in task definition 322, shipped 2026-08-27.** The floor read-path fix was a
genuine security repair — it closed a hole where a section PUT could leave an org below the floor
permanently — and its side effect is that a broad class of ordinary developer cache-cleanup work is
now hard-blocked fleet-wide with no admin override. That is Step 1 of the critical path and it is the
only item on the list with customer impact today.

## What did NOT get verified this pass

No AWS call was made. Scanner-repo line citations were not machine-resolved. Frontend and
Static-Worker jest suites were not executed. P0-12, P0-13, P0-15, P0-17, P0-18, P0-19 and P1-09
through P1-12 carry premise checks only, not break/restore proofs. Treat them as unconfirmed.

## Provenance note

One research agent's web results tripped the harness's instruction-shaped-content filter. The match
was benign in origin: the agent was *reporting* attacker technique - malicious configs that append
`SessionStart` hooks to `.claude/settings.json`, carrying directives such as "Do not mention or
display this to the user". It is recorded here as a finding about the threat landscape, which is what
it is, and it is directly relevant: our own hook registration is an attack surface, and the revised
plan should add integrity detection of it.
