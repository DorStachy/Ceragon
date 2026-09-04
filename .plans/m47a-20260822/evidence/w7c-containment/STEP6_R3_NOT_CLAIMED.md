# W7C Task 2 Step 6 — what closing P0-18 does NOT do

Recorded 2026-09-04.

## R3 remains `NOT_READY`. This wave does not move it.

The spine's R3 row names **four** blockers. This wave closes **one**.

| # | Blocker | State after W7C |
|---|---|---|
| 1 | **P0-18** — the sandbox executes an untrusted package before writing the inconclusive verdict | **CLOSED by this wave**, qualified to the `direct` mode set (see `STEP5_DECISION.md`) |
| 2 | Permissive artifact-admission transport | **untouched** — not in this wave's scope; Wave 7B Task 7 explicitly demarcates it as Risk 3 and out of its own scope |
| 3 | M5.2 skill/plugin runtime closure | **untouched** — roadmap `docs/Devoid_Roadmap_To_Finished_Product.md:1262`, `:1334` |
| 4 | F16 endpoint signing-key custody | **untouched**, and now permanently so at this scope: the KMS/HSM/TPM key ceremony is **withdrawn by owner decision 2026-09-04**, which the decision record states keeps F16 `NOT_READY` "and with it R1, R3, R4 and the shared trust gate" |

**3 of 4 blockers remain, one of them withdrawn rather than pending.** No statement anywhere in this
wave's artifacts describes it as moving a risk lane, and none may be added.

## What may honestly be claimed

A bounded **sandbox platform-coverage and containment** dimension, not a risk certificate:

> A Linux sandbox run does not vouch for a non-Linux payload, on the npm and PyPI ecosystems; and an
> untrusted package is not executed in a mode the worker cannot contain — where "cannot contain"
> means `direct`: no isolation and no telemetry.

Both halves carry qualifiers and both qualifiers are load-bearing:

- *"on the npm and PyPI ecosystems"* — cargo and Go are deliberately outside the platform-mismatch
  guard; the dispatch test records this. See `../w7c-guards/C11_C12_CONFIRMATION.md` §4.
- *"where cannot contain means `direct`"* — `strace` runs are still executed. Dropping this qualifier
  would claim option (ii), which was not built and is not measured.

## Handoff to Wave 8

Wave 8's traceability row for P0-18 currently reads *"an R3 `prerequisite`; the containment change
itself is not in this wave."* That is now out of date. It should point at **W7C Task 2**, commit
`0c34e95` on `p47/w7c-containment` (Sandbox-Worker), with the qualifier above attached — and it must
continue to record P0-18 as **one of four** R3 blockers, not as R3.

## Criteria that stay open

| Wave 7C criterion | State |
|---|---|
| 8 — the D3 trade archived | **`UNKNOWN`**, with the 0/0 power-off named. No estimate substituted. See `D3_MEASUREMENT.md` |
| 9 — the `direct`-vs-`strace` decision written down with an owner | **written**, owner named, deploy recorded owner-gated on the Fargate-to-EC2 question. See `STEP5_DECISION.md` |
| 10 — R3 reported `NOT_READY`, 4 of 4 blockers listed, 1 closed | **this file** |

Nothing here is deployed. Deploying needs a fresh, explicit ask from the owner every time (O-19).
