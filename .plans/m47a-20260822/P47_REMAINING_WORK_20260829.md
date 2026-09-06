> ## ⚠ SUPERSEDED — 2026-09-02
>
> Replaced by [`P47_REMAINING_WORK_20260902.md`](./P47_REMAINING_WORK_20260902.md).
>
> This document states "**0 P47 pull requests are merged**" and "0% complete". That was true
> when it was written and stopped being true the same day: the Wave 3 stack (Installers
> #251-#257), Wave 2 (Installers #246-#249, Backend #299/#302/#303, Frontend #197), Wave 1
> (Installers #229, Backend #298) and Wave 0A (#221) have all merged since. Roughly 32 tasks
> are now source-merged.
>
> Its Wave 1 row is also wrong on the facts: the DLP catalog IS governable at 81 classes with a
> measured ungoverned count of zero.
>
> **Do not quote this file for any status.** Kept for audit only.

# P47 remaining-work ledger — 2026-08-29

This ledger reports programme outcomes, not activity. It is subordinate to the task details and
ordering constraints in `M47A_IMPLEMENTATION_PLAN.md`.

## Honest status

- The P47 roadmap contains **16 waves and 147 numbered task sections**.
- **0 of 16 P47 waves are evidence-complete.**
- **0 P47 pull requests are merged.** GitHub has no W0A/P47 PR; the only P47 branches are local.
- Wave 0A has substantial source and test work on local candidate
  `c8447d88a042c174c37a422e869e5b526b803ea2`, but it is **implemented, unmerged, and
  evidence-incomplete**.
- P9 has merged runtime-enforcement work and at least one explicit P47 prerequisite, but P9 overlap
  is not counted as completion of a P47 wave unless that wave's own exit and defeat evidence passes.
- A percentage based on lines or hours would be misleading. By wave-exit accounting, the programme
  is still at **0% complete**. By implementation activity, only part of W0A exists.

## Wave 0A — what remains before it is complete

1. Pause the concurrent P9 Go workload long enough to run the prepared paired latency harness. No
   samples have been accepted while the host is at 100% CPU.
2. Run the removal-side defeat: temporarily restore the historical broad home arms, prove B1 and the
   18-removal cardinality go RED, restore the source, and prove GREEN/clean.
3. Rerun the exact-candidate merged-tree local mirror and require the measured baseline: 8 pass, the
   same 3 named known failures, 0 partial, 0 error, and no fourth failure.
4. Finish `W0A_RUN_LOG.md` and `W0A_COVERAGE_DELTA.md`; remove every stale PENDING claim and preserve
   the aggregate-suite, live, and release evidence gaps honestly.
5. Obtain the immutable-tip audit, push the branch, open the PR, inspect the actual merge diff and
   checks, and merge only if clean.
6. Do **not** release automatically. An agent release needs a fresh owner authorization for the full
   combined P9+P47 payload.
7. After an authorized release, run the real enrolled-endpoint control and benign probes. The
   pre-change live observation was never exercised and remains a permanent evidence gap; it cannot
   be recreated after the fact.

## Remaining roadmap

| Wave | Tasks | Remaining outcome |
|---|---:|---|
| −1 | 8 | Refresh authority/citations and finish the CI/measurement foundation, including the missing tool-risk lane and independently runnable pinned-artifact guard. |
| 0A | 6 | Finish, merge, release only with authorization, and perform the post-release live observation described above. |
| 0 | 8 | Remove emergency egress overrides, enforce the AWS/task-definition invariant, enable Backend ECS Exec, restore legitimate repository/local-scan depth, and verify at power-on. |
| 1 | 7 | Make every emitted DLP class governable: producer catalog, canonical 81-class authority, Backend presets/write-path malicious floor, complete admin board, and cross-repo pinning. |
| 2 | 10 | Introduce evidence strength, capability impact, resolved consequence, five-band storage/filter/UI vocabulary, wire fields, and remove severity-only enforcement. |
| 3 | 11 | Repair the scorer, give every class and lane a real denominator, model UNKNOWN and inspection budgets, create lane records, and make invalidation shared and testable. |
| 3B | 13 | Version the system under test; build the six-suite registry, governed corpora, transforms, end-to-end graders, private holdout, incident suite, labeling/adjudication rules, and in-repo generators. |
| 4A | 8 | Fix the published DLP/prompt residuals, including PAN/context, system-prompt exfil, malformed DB credentials, and the private-key decisions; make benign hard blocks unbankable. |
| 4B | 10 | Build tool/effect detection quality: proposal vocabulary, effect resolver, executed-vs-data context, effect-bound approval, safe correlations, remaining C5/chmod gaps, catalog totality, taint semantics, and Windows readiness truth. |
| 4C | 11 | Make prompt and ingress lanes measurable, type byte provenance, grade unauthorized effects and over-defence separately, gate promotions, expand corpora, report per surface, and commission adaptive testing. |
| 5 | 11 | Make every console number and state trace to a source: failed reads/scans, counts, filters, status colors, daemon 401 semantics, confirmations, vendor drift, certificate projection, and policy summaries. |
| 6 | 13 | Complete production triage and learning: pagination, notes, assignment, bulk actions, detail drawer, all AI surfaces, seven-state taxonomy, second review/adjudication, detector/version attribution, corpus promotion, storm threshold, and autonomous-review boundary. |
| 7A | 8 | Make scanner execution truthful end to end: manifest, one lane verdict, upload wire, Backend polling, action outputs, worker consumption, fail-closed preservation, and developer-visible coverage failures. |
| 7B | 9 | Certify scanner detection quality: evidence manifest, restored quality gates, CWE/language/framework programme, reachable twins/mutation/repair, per-engine tiers, sealed injection corpus, signing proof, ecosystem contracts, and certificate row. |
| 7C | 2 | Pin platform routing and prevent execution of an untrusted package when the sandbox cannot contain it. |
| 8 | 12 | Inventory every consequential sink, bind and mediate every effect, preserve fail-closed certificate truth, adopt the P9 canary fix, generate the v2 certificate, map controls, add rings/halt/rollback/live canaries, protect signing keys, publish the system card, and execute the defeat matrix. |

## Dependencies and owner-controlled blockers

The implementation cannot honestly close all 147 tasks through code alone. Explicit external
decisions or operations remain for private-key posture, taint-policy ratification, holdout/CI billing,
contracted adaptive red-team work, an eligible Codex live-measurement machine, GitHub branch
protection capability, non-exportable signing-key custody, Backend deployments, agent releases, and
production/live verification. Each stays `BLOCKED` or `NOT EXERCISED` until its named owner acts.

## Correct execution order

1. Finish and merge W0A without expanding it again.
2. Close the remaining Wave −1 foundation.
3. Run dependency-safe work in parallel: Wave 0 and Wave 1; Wave 2 after its prerequisites; then
   Wave 3 and Wave 3B before any detection promotion.
4. Execute Waves 4A/4B/4C only on the repaired evidence spine and governed corpora.
5. Progress console/triage and scanner streams in parallel where the plan permits.
6. Finish with Wave 8 authoritative mediation and certification, preserving every owner/deploy gate.

Every future update must state: **merged**, **implemented but unmerged**, **blocked**, and **not
started**. Anything else recreates the reporting failure this ledger exists to prevent.
