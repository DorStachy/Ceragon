# P47 execution guardrail

**Owner directive — 2026-08-29. Mandatory for every P47 implementation session.**

The programme objective is the complete M4.7A roadmap. Do not silently turn a programme-level
assignment into an open-ended implementation of one task or one detector.

1. Measure progress by roadmap tasks that are merged and evidence-complete, never by hours worked,
   lines written, test count, or implementation sophistication.
2. Before expanding a task beyond the plan's stated boundary, stop and tell the owner what expanded,
   why, the expected cost, and which later tasks would be displaced. Expansion requires an explicit
   decision; technical interest is not authorization.
3. Keep each task to the smallest implementation that satisfies its written exit and defeat tests.
   New architecture, broader shell/language interpretation, or speculative hardening becomes a
   separately scheduled finding unless the exit contract requires it.
4. At every task boundary, publish four facts: **merged**, **implemented but unmerged**, **blocked**,
   and **not started**. Never collapse those states into "done."
5. If proof is blocked by shared infrastructure, preserve the honest gap and switch to another
   dependency-safe task. Do not spend an unbounded session polishing or waiting on one blocked gate.
6. Use parallel agents for independent roadmap outcomes, not only for repeated review of the same
   task. Respect the dependency graph and the parallel-execution ownership contract.
7. A programme-level "finish it all" request is complete only when every scheduled wave is merged
   and its exit evidence is recorded, or when the owner receives an explicit remaining-work ledger.
8. Before editing any file, check `.plans/PARALLEL_EXECUTION_CONTRACT.md`. An implementation can be
   technically correct and still be unmergeable because the other programme owns the file or a
   migration/release/deploy handshake was omitted.
9. Stop a task at its smallest independently reviewable commit. Open one PR per roadmap task and
   merge it when its source and coordination gates pass; do not hold many completed tasks on local
   branches.

## Failure that created this rule

The first P47 implementation run concentrated almost entirely on Wave 0A. It produced a large,
heavily tested shell-analysis change but did not complete or merge W0A and did not advance the rest
of the programme. The agent failed to escalate the scope expansion soon enough and reported activity
instead of programme completion. Do not repeat that pattern.

The next checkpoint exposed the complementary failure mode: Wave 2 Task 2 reached technically green
source and real-Postgres proof, but review found a P9-owned DTO edit and an unrecorded migration claim.
Technical completion is not permission to merge through the coordination contract.
