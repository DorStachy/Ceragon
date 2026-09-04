# Remaining-work ledger — Waves 4A and 4B correction, 2026-09-04

**Supersedes the Waves 4A / 4B rows of `P47_REMAINING_WORK_20260902.md`,** which record
`4A: 6 NOT STARTED, 2 BLOCKED` and `4B: 10 NOT STARTED` — sixteen unstarted tasks.

**Measured today: zero of the eighteen are unstarted.** Sixteen are built, two are owner-blocked
exactly as recorded. This is the second ledger section in one day found stale in the same direction,
after Wave 3B.

**Read "BUILT" precisely.** It means the task's artifacts exist and the packages carrying them pass.
It does **not** mean the wave's exit evidence has been run as a set — no wave in this programme has
closed on that standard, and these two have not either.

## Wave 4A — close the published residuals

| Task | Ledger | Measured | Evidence |
|---|---|---|---|
| T1 `qa-fp-migration-timestamps` | NOT STARTED | **BUILT** | `financial.go:9` records the change in its own header: a context-free Luhn+IIN PAN moved off Tier B. Measured on the sealed dlp lane, the case now resolves `allow` where the index's `observedToday` says `warn`. The finding is still raised, at Tier C — which is the designed outcome, not a residual. |
| T2 `qa-fp-detections-finding-name` | NOT STARTED | **BUILT THIS SESSION** | `selfvocab.go`. Sealed promptrisk benign interruptions **1 of 6 → 0 of 6**. |
| T3 `attack-system-prompt-exfil` | NOT STARTED | **BUILT** | Sealed promptrisk lane: **5 of 5** attacks fully detected, `missedAttacks: []`. The index's "verdict=allow, ZERO findings" is a 2026-08-30 observation. |
| T4 `attack-prod-db-connection-string` | NOT STARTED | **BUILT, with one discrepancy** | The userinfo re-spelling landed (`database_uri.go:69-77`, `dbURIUserinfoEscaper:143`) and the false negative is closed — the case produces a `db-connection-string` finding, so `fn 0/1`. **But it lands at `evidenceTier: C`, `enforcementEligible: false`**, where the task's first bullet asks for Tier A. Flagged rather than called done. |
| T5 `attack-private-key-block` | BLOCKED | **BLOCKED, confirmed live** | Still the only miss on the sealed dlp lane: zero finding classes, verdict `inconclusive`. |
| T6 ingress private-key redactor | BLOCKED | BLOCKED, same owner decision | |
| T7 benign hard block unbankable | NOT STARTED | **BUILT** | `internal/neutraleval/toolrisk_fp_baseline.go:63` — `ToolRiskFPHardBlockRefusal = "a benign hard block is never bankable"`, plus the bankable-verdict list and the rejected template rows. |
| T8 canonical registry + packages in the lane | NOT STARTED | **BUILT** | 11 members with the insufficiency clause; `pr-checks.yml:146` runs `policyeval`, `dlp`, `promptrisk`. |

## Wave 4B — tool/effect detection quality

| Task | Ledger | Measured | Evidence |
|---|---|---|---|
| T1 capability-proposal vocabulary | NOT STARTED | **CLOSED TODAY** | `ProposalKind` in `class_catalog.go:43-67`; vector at `formatVersion` 4 with 40 `proposalKinds`. Installers and Frontend were already at 4; **Backend was still at 3 with the field absent**, so the wave's whole point reached one consumer and not the other. Closed by `p47/w4b-t1-backend`. `vocab-parity.mjs` now PASSes across all three. |
| T2 effect resolver | NOT STARTED | **BUILT** | `internal/effectresolve/` — resolve, budget, filesystem, tools, all with tests. |
| T3 data context | NOT STARTED | **BUILT** | `DataContext` in `effectresolve.go`. |
| T4 bind approval to the resolved effect | NOT STARTED | **BUILT** | `internal/daemon/ai_tool_hold_effect.go:182` calls `effectresolve.Resolve` and reads the budget-exceeded arm. |
| T5 no `deriveCombos` in tool-risk; one named correlation | NOT STARTED | **BUILT** | `git grep -c deriveCombos -- internal/toolrisk` = **0**, the exit criterion. `internal/toolrisk/correlation.go` carries the named correlation and the closed `RelationPredicate` set. |
| T6 C5 residuals release-blocking | NOT STARTED | **BUILT** | The canonical index records `cmdsubst-verb` and `non-ifs-unknown-sep` at `INSPECTION_INCOMPLETE/command-word[unknown-expansion]` "as of Wave 4B Task 6". |
| T7 `chmod-broad-777` | NOT STARTED | **BUILT** | Index: "CLOSED 2026-09-03 by Wave 4B Task 7", with the before state (0 of 1 recall under the shipped policy) recorded beside it. |
| T8 catalog / D4 totality | NOT STARTED | **BUILT** | `proposalKinds` is total over the 40 classes and the Backend spec now asserts that totality rather than mere presence. |
| T9 fix the taint input | NOT STARTED | **BUILT** | `taintRiskyWithShadowLookup` takes `policy *backend.AiPolicy`, skips shadow classes and reads `toolRiskDisposition`. The spine's complaint — "returns true on any non-INFO raw finding and is never policy-filtered" — no longer describes it. |
| T10 Windows NOT_READY record | NOT STARTED | **BUILT** | `internal/toolrisk/zz_w4b_windows_not_ready_test.go` gates on `.plans/m47a-20260822/v2-waves/W4B_WINDOWS_NOT_READY.json`. |

Packages verified green today: `toolrisk`, `effectresolve`, `dlp`, `daemon`, `promptrisk`, `policyeval`, `cmd/ai-security-neutral`.

## What actually remains in these two waves

1. **4A T5 and T6** — one owner posture decision on private-key handling releases both.
2. **4A T4's tier** — the finding is produced but at Tier C, not the Tier A the task's first bullet
   names. Either the bullet or the ladder is wrong; deciding which is a small, real piece of work.
3. **Nothing else.** The engineering in these two waves is done.

## Why the ledger was wrong, again

The same mechanism as Wave 3B: **Wave 4C did the work while executing a different packet**, and its
closure record says so in as many words — *"Three of its eleven tasks had already been delivered by
those waves"*. Nobody then re-read the 09-02 ledger against the tree.

O-1 says a wave file is a set of claims about a tree. That applies to the ledger itself, and after
two corrections in one day the sensible default is that **every remaining "NOT STARTED" row in the
09-02 ledger is unverified** rather than true. Waves 6, 7A/7B/7C and 8 have not been re-measured and
should not be quoted from that document without one.
