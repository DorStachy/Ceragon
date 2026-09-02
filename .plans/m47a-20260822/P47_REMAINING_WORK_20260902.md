# P47 remaining-work ledger — 2026-09-02

**Supersedes `P47_REMAINING_WORK_20260829.md`,** which was written before the Wave 3 merge stack and
states "0 P47 pull requests are merged." That is no longer true and has not been true since
2026-08-29. Do not quote the 08-29 ledger for any status.

This ledger reports programme outcomes, not activity. It is subordinate to the task details and
ordering constraints in `M47A_IMPLEMENTATION_PLAN.md` and the wave packets under `v2-waves/`.

Every row carries one of four states, per the execution guardrail §4. They are never collapsed:

| State | Meaning |
|---|---|
| **MERGED** | The source is an ancestor of the owning repository's `origin/main`. It does **not** mean the wave's exit evidence has been run. |
| **BUILT · UNMERGED** | Implemented and committed on a branch; not on `main`. |
| **BLOCKED** | Cannot proceed without a named owner decision, a production operation, or an external party. |
| **NOT STARTED** | No implementation exists. |

Two states outside that set appear where the plan itself requires them: **NOT EXERCISED** for a proof
that was never run, and **MOVED** for a task re-homed to another wave rather than done or dropped.

## Measured tips

| Repository | `origin/main` at draw time | Confirmed |
|---|---|---|
| Installers | `48c3d2eb` | `git ls-remote` |
| Backend | `eb5e2ef8` | `git ls-remote` |
| Frontend | `3e6b739b` | `git ls-remote` |
| GithubApp-Bot-Scanner-Worker | `c72579e` | `git ls-remote` |

## Honest status

- The roadmap contains **16 waves and 147 numbered task headings**. About three of those headings are
  headstones that point at another wave rather than describing separate work, so the distinct
  work-item count is nearer **144**.
- **~32 tasks are source-MERGED.** Waves 1 and 2 are, on the evidence below, fully merged at source;
  Wave 3 is merged apart from its three re-homed tasks.
- **0 of 16 waves are evidence-complete.** Merged is not complete: a wave closes only when its own
  exit and defeat evidence pass, and no wave's exit set has been run end to end. Wave 3 is the
  clearest illustration — its code is correct and every artifact it emits is `UNKNOWN` by design,
  because the corpora that would make a number legitimate do not exist yet.
- **1 task is BUILT · UNMERGED**: Wave 3B Task 1, commit `f9672a9e` on
  `p47/w3b-t1-engine-version`, rebased onto `48c3d2eb`. Held local at the owner's instruction.
- **Installers `main` moved during this pass**, `ed45aa72` → `48c3d2eb`, carrying P9's C04 and
  line-ending repairs. That is the standing rule in O-1 demonstrating itself: a ledger is a set of
  claims about a tree, and this one had to be corrected twice before it was committed.
- A percentage over lines or hours would mislead. By wave-exit accounting the programme is **0%**;
  by merged-task accounting it is roughly **22%** (32 of 144). Both numbers are true and neither is
  the answer on its own.

## A correction this pass produced

The 08-29 ledger's Wave 1 row reads "Make every emitted DLP class governable" as remaining work. It is
merged. Measured on `origin/main`:

- `Backend/src/ai-security-policy/ai-security-policy.constants.ts` → `AI_SECURITY_DLP_CLASSES` = **81**
- `Backend/packages/shared-contracts/dlp-classes.v1.json` producer vector = **81**
- `Frontend/types/ai-governance.ts` → `AI_DLP_CLASSES` = **81**, and its parity test passes
- `computeDlpGovernanceGap` reports an ungoverned count of **0**

⚠️ **Do not read `AI_DLP_CLASSES` in `Backend/packages/shared-contracts` and conclude the tuple is 30.**
That constant is the *wire contract* tuple and it is legitimately still 30. The governed policy set is
`AI_SECURITY_DLP_CLASSES`, which is 81. Reading the wrong one during this pass produced a false
O-4 divergence alarm that took four measurements to retire. The two tuples are different objects with
similar names; the governance-gap certificate is the thing that proves parity.

## Wave −1 — rebase, authority regeneration, claim contract

| Task | State | Evidence / blocker |
|---|---|---|
| T1 Fetch first, publish a rebase manifest, make it standing | NOT STARTED | **O-1 gates every other task in the programme.** The manifest in `00_spine.md` is dated 2026-08-27 and every tip in it has moved. |
| T2 Write the claim contract into the goal statement | NOT STARTED | |
| T3 Resolve provenance of the pinned DLP vocabulary | **MERGED** (discovery only) | `W_MINUS_1_RUN_LOG.md`: source commit `d366f5f8` does not exist in 7/7 governed repositories. The tuple is a fork. No runtime source changed and no class count is asserted. |
| T4 Repair every citation in the plan | NOT STARTED | Line numbers have already drifted — Wave 3B T1 cited `main.go:23` / `runner.go:467-469`; measured they are `:24` / `:510`. |
| T5 `holdout-score.yml` header truth, then the trigger decision | **BLOCKED** | Owner cost decision. Also inherits Wave 3 Task 11. The header at `:6` claims "runs on PUSH TO MAIN and NIGHTLY"; `on:` is `workflow_dispatch` + cron only. |
| T6 Declare the standards columns in the manifest schema | NOT STARTED | |
| T7 Create the `toolrisk-lane` job and its mirror entry | NOT STARTED | Every later wave appends to this job. P9 also recorded that `ci/lib/run.mjs` silently skips this gate and reports green. |
| T8 Give the pinned-artifact guard a separately-runnable leg | NOT STARTED | |

## Wave 0A — stop hard-blocking ordinary work

**The only item in the programme with live customer impact today.** Source is merged; it reaches zero
endpoints until a release is cut.

| Task | State | Evidence / blocker |
|---|---|---|
| T1 Watch the block on a live endpoint, before changing anything | **NOT EXERCISED — permanently** | `W0A_RUN_LOG.md`: no reachable enrolled endpoint existed. This evidence cannot be recreated after the fact. It is a permanent gap, not a pending item. |
| T2 Write the twin tables as a failing test | **MERGED** | Installers #221 chain, `14e19b23`; integrated `e35f4458`. |
| T3 Narrow the two POSIX home alternatives | **MERGED** | Same. |
| T4 Benign shapes into the ordinary-work corpus with a real denominator | **MERGED** | Same. |
| T5 Prove no Backend deploy is needed, then cut the agent release | **BLOCKED** | Owner authorization. Release carries the combined P9 + P47 payload — see the parallel contract §3.1. |
| T6 Confirm on the live endpoint after, publish the coverage delta | **BLOCKED** | Depends on T5. |

## Wave 0 — emergency egress correction

| Task | State | Evidence / blocker |
|---|---|---|
| T1 Strip both `ALLOW_MINIMAL` overrides from three live task definitions | **BLOCKED** | Production mutation. Observed still deployed 2026-08-29 on revisions 164 / 40 / 96. Those revisions are observations, not rollback coordinates — re-read immediately before any change. |
| T2 Give the task-def validator a privacy/egress invariant | **MERGED** | Scanner #42, merge `2e33812`. |
| T3 Remove the overrides from the committed task-defs | **MERGED** | Scanner #42. |
| T4 Enable ECS Exec on `backend-service` | **BLOCKED** | Production IAM/service mutation. Measured `enableExecuteCommand: false` and the execution role lacks the required permission. |
| T5 Restore depth on our own repositories via `.codefence.yml` | NOT STARTED | No `.codefence.yml` exists in the seven local product repositories. The enabled-repository denominator must come from the authenticated Backend endpoint first. |
| T6 Restore depth on the local-scan lane | NOT STARTED | |
| T7 Deferred live verification at power-on | **NOT EXERCISED** | Both scanner services were 0/0 desired/running. |
| T8 Residual pre-egress boundary and the Risk 1 certificate row | **MERGED** | Scanner #44, source `4dcbef8`. R1 deliberately remains `NOT_READY` with named blockers; F16 remains BLOCKED. |

## Wave 1 — policy authority and catalog totality

**All seven tasks are source-MERGED.** Exit evidence has not been run as a set.

| Task | State | Evidence |
|---|---|---|
| T1 Publish the DLP class catalog as a producer parity vector | **MERGED** | Installers #229; `Backend/packages/shared-contracts/dlp-classes.v1.json`, 81 classes, digest `sha256:6dd17f98…`. |
| T2 Record which tuple is governed, and why the other cannot be | **MERGED — attribution inferred** | The substance exists: `AI_SECURITY_DLP_CLASSES` is the governed set, the frozen 30-entry wire tuple is not, and Wave −1 T3 records why the pinned vocabulary cannot be reconstructed. No commit names T2, so this row is inference from the delivered state, not from a merge title. Confirm against W1's exit criteria before closing the wave. |
| T3 Widen the governed DLP tuple to 81 without changing a posture | **MERGED** | `AI_SECURITY_DLP_CLASSES` = 81. Delivered as a policy constant beside the frozen 30-entry wire tuple, not by widening it. |
| T4 State the real failure mode for an unregistered class, keep it non-green | **MERGED** | `src/ai-security-policy/dlp-governance-gap.ts`; `ungovernedClassCount` is a live certificate, deliberately independent of tenant policy rows so corruption and catalog drift cannot be conflated. |
| T5 Eighty-one settable rows on the board | **MERGED** | `Frontend/types/ai-governance.ts` = 81; `ai-security-policy-dlp-class-parity.test.ts` asserts equality with the producer vector and passes. |
| T6 Cross-repo vocabulary check running inside a repository | **MERGED** | Parity specs on both sides: `ai-security-policy.dlp-class-parity.spec.ts` (Backend), `ai-security-policy-dlp-class-parity.test.ts` (Frontend). |
| T7 Malicious floor on the write path, and the floor made visible | **MERGED** | `ai-malicious-floor-write-path.spec.ts`, `ai-malicious-floor-write-http.live-pg.spec.ts`, `ai-malicious-floor.read-path.spec.ts`. |

## Wave 2 — evidence strength, consequence, UI vocabulary

**All ten tasks are source-MERGED.** T2 is merged but **NOT DEPLOYED**, and O-6 makes that ordering
load-bearing.

| Task | State | Evidence |
|---|---|---|
| T1 One `severityBasis` shape, Events surface renders it | **MERGED** | Backend #299; Frontend `da41d96e`. |
| T2 Five bands in the Backend vocabulary — HARD GATE (O-6) | **MERGED, NOT DEPLOYED** | Backend `898b6c95`; migration `1793200000000-WidenAiEventSeverityToFiveBands` with its spec. Timestamp repaired from a collision. **Must deploy before T4's console reaches production.** |
| T3 One home for read-time band translation (D9) | **MERGED** | `src/ai-governance/services/ai-event-severity.util.ts`. |
| T4 The fifth band reaches the filter, the bar and the row spine | **MERGED** | `AiEventSeverity = "info" \| "low" \| "medium" \| "high" \| "critical"`. |
| T5 Retire "confidence"; mechanism label off the policy path | **MERGED** | Frontend #197; Backend #302. |
| T6 Three graded fields, generated from the producer catalogs | **MERGED** | Installers #246, #247. |
| T7 The grade reaches the Backend on both lanes | **MERGED** | Installers `dc55137b`; Backend `546385cb`; Frontend `def83544`. |
| T8 Evidence strength on the console, beside impact, never blended | **MERGED** | Frontend `9c517c91`. |
| T9 Split `monitor` into three concepts; stop a SHADOW class interrupting | **MERGED** | Installers #248; Backend #303. |
| T10 No enforcing disposition is a pure function of `Finding.Severity` | **MERGED** | Installers #249; Frontend `4f491caf`. |

## Wave 3 — measurement substrate

Source-merged. Every artifact it emits is `UNKNOWN`, which is the instrument working.

| Task | State | Evidence |
|---|---|---|
| T1–T3 Scorer harness, per-surface opportunities, UNKNOWN-not-zero | **MERGED** | Installers #251 → `47ed9772`. |
| T4 Mandatory engine version | **MOVED** → Wave 3B T1 | Headstone, not omitted. |
| T5 System-under-test tuple | **MOVED** → Wave 3B T2 | Headstone. |
| T6 Inspection completeness and bounded work | **MERGED** | #252 → `caf2ce52`. Reports 0 complete / 12 degraded (prompt), 0/27 (DLP), 0/28 (ingress). |
| T7 Bounded local per-class shadow evidence | **MERGED** | #253 → `4a8371c3`. Caps verified: 500 samples, 1,024 identities. |
| T8 Four explicit evidence lanes | **MERGED** | #254 → `5d39ea1c`. |
| T9 Deterministic report and promotion predicate | **MERGED** | #255 → `6f92df5a`. Workflow carries no push/PR trigger. |
| T10 Shared terminal invalidation | **MERGED** | #256 → `80c98470`. Eight triggers, exactly two production callers, all five rates through `InvalidationResult.Rate`. |
| T11 Trigger-cost decision | **MOVED** → Wave −1 T5 | Owner-blocked there. |

### Raised and closed against Wave 3, 2026-09-02

- **The C04 inertness guard was RED on Installers `main`, and is now fixed.** Found by clean-checkout
  A/B: green at `d57138a8`, red at `ed45aa72`, reducing to `internal/neutraleval/capture.go` and
  `capture_test.go` from P9's `b9299f66`, which imported `aipolicycontract` outside the gate-opened
  consumer set. Invisible three ways: no CI job runs that package; the only `go test ./...` is Linux
  where the package was already red for an unrelated CRLF pin; and 7 of the 10 post-handoff commits
  carry `[skip ci]`. Raised as `CONFLICT` in `PARALLEL_HANDSHAKE.md`; **P9 repaired it the same day**
  using the second offered shape — `2a4fabaf` moved the budget projection into
  `internal/localdecide/hardstop.go`, which was already in the allowlist, so the allowlist itself was
  never widened. Verified independently in a clean checkout at `48c3d2eb`: **PASS**.

- **The "stale ingress corpus" was never stale content.** The handoff records the committed ingress
  corpus as stale relative to its generator, and the VM-proof script is written to expect that failure
  stopping the ordered job. The real cause was line endings: `toolrisk-seed.json` hashed CRLF (seeded
  on Windows) and `ingress-seed.json` hashed LF (seeded on Linux), so
  `ai-security-holdout-seed --check` could not pass on **any** platform. P9 pinned the vector tree to
  LF (`69deee97`), re-seeded toolrisk digests only (`f1837455`, 4 cases held, no label or budget
  changed), widened the LF tripwire (`6a2a7f39`, `c707f26a`) and pinned `go.mod`/`go.sum`
  (`48c3d2eb`). Verified independently at `48c3d2eb`: the check **exits 0** with holdout 39, ingress
  28, toolrisk 4 all current.
  **Consequence: the VM-proof script's expected stale-seed failure is obsolete.** Re-read
  `vm-proof/run-wave3-proof.sh` before running it; the ordered workflow may now pass where the
  handoff says it must fail. This is the fourth CRLF-blind guard found in this repository this month.
- **The handoff's "105-row producer union" is wrong.** Measured 132 at both `d57138a8` and
  `ed45aa72` — `dlp` 79 + `promptrisk` 14 + `ingressrisk` 7 + `toolrisk` 31 + the policyeval
  blocklist class, deduplicated. The 136 rows in a holdout report are that 132 unioned with the
  frozen 55-class spine (81 `UNCATALOGED` + 55 `CURRENT`), which is what the artifact emits and is
  correct. No measurement is affected.

## Wave 3B — evaluation and corpus governance

| Task | State | Notes |
|---|---|---|
| T1 Mandatory engine version, stamped on the aggregate | **BUILT · UNMERGED** | `f9672a9e` on `p47/w3b-t1-engine-version`, rebased onto `48c3d2eb` (one import conflict in `capture.go`: P9 swapped in `localdecide`, this branch adds `core/config`; both kept). Green after rebase — build, vet, `neutraleval`, `ai-security-neutral` and `aipolicycontract` all pass. Both defeat proofs go red on revert. Emits `system.engineVersion` = commit sha; `formatVersion` 3; denominator 6/5 unchanged. Two items flagged for review: the exit criterion's literal "0 occurrences of `m4.7`" is unsatisfiable alongside refusing the value by name (measured 4: three in the rejection test, one constant that performs the refusal), and the change touches P9's `capture.go` by one import and one field. |
| T2 The system-under-test tuple | NOT STARTED | Premises verified on current `main`: `RunnerIdentity` carries 5 fields against a target of 9; `contract.go` already names Wave 3B as the widener of `Valid()`. |
| T3 Emit the evaluation report the spine defines | NOT STARTED | **O-12** satisfied — Wave 3 is merged. |
| T4 One suite registry, six suites | NOT STARTED | **O-13: gates 4A / 4B / 4C / 7B exit numbers.** The highest-leverage remaining task in the programme. |
| T5–T10 The six suites | NOT STARTED | Suites 3, 4-adaptive and 5b will finish `NOT_READY` regardless of engineering — see external blockers. |
| T11 Labeler and adjudicator governance | NOT STARTED | Blocked at exit by E4. |
| T12 Reconcile the two vocabularies | NOT STARTED | |
| T13 Move the generators into the repository | NOT STARTED | |

## Waves 4A, 4B, 4C, 5, 6, 7A, 7B, 7C, 8

**NOT STARTED**, with these exceptions already named as blocked:

| Task | State | Blocker |
|---|---|---|
| 4A T5 `attack-private-key-block` reporting gap | **BLOCKED** | Owner posture decision. |
| 4A T6 ingress redactor failure-oracle seam | **BLOCKED** | Same decision. |
| 4C T10 Commission the adaptive arm | **BLOCKED** | Contracted red-team time, not engineering. |
| 4C T11 Codex surface safeguards-on | **BLOCKED** | No eligible measurement machine; the dialect pin may not be widened on inference. |
| 8 T10 F16 signing-key custody | **BLOCKED** | Non-exportable key custody is an owner/infrastructure decision. |

| Wave | Tasks | State |
|---|---:|---|
| 4A | 8 | 6 NOT STARTED, 2 BLOCKED |
| 4B | 10 | NOT STARTED |
| 4C | 11 | 9 NOT STARTED, 2 BLOCKED |
| 5 | 11 | NOT STARTED |
| 6 | 13 | NOT STARTED |
| 7A | 8 | NOT STARTED |
| 7B | 9 | NOT STARTED |
| 7C | 2 | NOT STARTED |
| 8 | 12 | 11 NOT STARTED, 1 BLOCKED |

## Owner-controlled blockers, gathered

These have the longest lead times in the programme and every one is on the critical path to Wave 8.
None is engineering. Opening them early costs nothing; opening them when they are needed adds their
full lead time to the end.

| # | Item | Consequence while open |
|---|---|---|
| E1 | Consented benign-replay data programme — 29,956 opportunities against today's 51 | Every downstream Tier-A false-positive claim is `BLOCKED: suite-3` |
| E2 | Contracted red-team time — 299 scenarios per stratum | Suite 4 adaptive arm `NOT_READY` |
| E3 | Vendor artefacts for the Codex safeguards-on column | `UNKNOWN`; publish the safeguards-off column and say which it is |
| E4 | A named independent evaluation owner who is not a detector author | Suite 5b custody `NOT_READY`; `proof.independentReview` stays empty |
| E5 | Upstream shared-contracts spine change for the report interval | Emit the gate bound only. Never substitute Wald; never substitute Wilson for the gate |
| — | Private-key posture decision | 4A T5 and T6 |
| — | Holdout CI trigger/cost decision | Wave −1 T5 |
| — | Agent release authorization (combined P9 + P47 payload) | Wave 0A T5/T6; live customer impact continues |
| — | Production mutation authorization | Wave 0 T1, T4, T7 |
| — | GitHub branch protection | Impossible on the current plan; all six repositories return 403 |

## Execution order

Recorded in full, with the O-constraints attached, in the P47 Completion Sequence. In brief:

1. **Phase 0** — Wave −1 (O-1 gates everything), the C04 conflict, this ledger. Open the external
   items above on day one.
2. **Phase 1** — Wave 3B, Task 4 first among the unstarted ones (O-13).
3. **Phase 2** — Waves 1 and 2 exit evidence plus Wave 0's remainder; first deploy window
   (O-4, O-5, O-6, O-7) and the 0A release.
4. **Phase 3–5, concurrent** — detection quality (O-15, O-10, O-11); console and triage; scanner
   (O-9's exact deploy order).
5. **Phase 6** — Wave 8 (O-16, O-17, O-18), then the combined release.

## What completing all 147 tasks does not buy

Per D17, **none of the five risk lanes reaches certified**, even at 147/147. The programme delivers
four engineering-assurance dimensions — scanner execution truth, tool-risk policy authority and
catalog totality, measurement-substrate integrity, console truth. Each is a real deliverable; none is
a risk certificate, and the plan requires saying so in those words.

Every future update must state **merged**, **implemented but unmerged**, **blocked**, and **not
started** separately. Anything else recreates the reporting failure this ledger exists to prevent.
