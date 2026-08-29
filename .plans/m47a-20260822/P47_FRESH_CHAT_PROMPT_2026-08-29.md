# Fresh-chat prompt for the next P47 agent

Copy everything below into a new Codex/Claude coding chat after the coworker has access to the Ceragon
repositories and test VMs.

---

You are continuing the P47 / M4.7A detection-quality implementation programme for Ceragon. This is
a continuation, not a new planning exercise.

First fetch the root plans repository and every component repository independently. The root default
branch is `master`; Backend, Frontend, Installers, and GithubApp-Bot-Scanner-Worker use `main`. Do not
pull into, switch, or clean a dirty shared checkout. Create one dedicated worktree per task under
`C:\cwt`, never use `git stash`, and stage explicit paths only.

Before changing code, read these files completely in this order:

1. `.plans/m47a-20260822/P47_CHECKPOINT_HANDOFF_2026-08-29.md`
2. `.plans/m47a-20260822/P47_EXECUTION_GUARDRAIL.md`
3. `.plans/PARALLEL_EXECUTION_CONTRACT.md`
4. `.plans/PARALLEL_HANDSHAKE.md`, newest entries at the bottom
5. `.plans/m47a-20260822/v2-waves/00_spine.md`, especially O-1 through O-19
6. `.plans/m47a-20260822/v2-waves/w2_evidence_severity.md`

Then independently verify the remote PR heads and repository tips; do not trust stale local branches
or line numbers. Use TDD and preserve each task's exact RED, GREEN, and defeat evidence. Use parallel
agents for separate dependency-safe roadmap outcomes and exact-SHA review, not for endlessly polishing
one task. At every task boundary report four distinct states: merged, implemented but unmerged,
blocked, and not started.

Your first operational objective is to close the checkpoint safely:

- Backend PR #300 (`898b6c951d80a5d47cf694e625db42f903c05000`) is technically approved and
  passed 19/19 real-Postgres tests, but it is blocked by the parallel-execution contract. Obtain and
  record an explicit P9 grant for the exact additive edit to P9-owned
  `Backend/src/ai-governance/dto/ai-response.dto.ts`: add `info: number` to
  `AiDetectionSeverityCountsDto` and update only its immediately adjacent five-band/unassessed
  comments. The handoff PR already records the retroactive claim for migration `1793100000000`.
  After the grant, re-review the exact source SHA together with the docs state and merge source if
  clean. Do not deploy merely because it merged.
- Frontend PRs #189, #192, #194, #195, and #196 are open behind a Vercel private-organization Hobby
  billing failure. #194, #195, and #196 are independently source-approved; #192's source state and
  verification are recorded in the handoff. Resolve the owner/account gate, rerun exact-head checks,
  and merge in dependency order. Do not bypass or waive the Vercel failure as an administrator.
- Installers PR #221 is independently approved at
  `14e19b23faed4a74a5385fa35d4f1872daf0c592`, but one Docker mirror proof could not run. Use the
  coworker's VM to run it, or obtain an explicit owner acceptance of the evidence exception. Even
  after merge, an agent release requires the combined P9/P47 release protocol and fresh owner approval.

Continue Wave 2 after those closures. Task 4 must not start or ship until Task 2 is deployed to
production and the Deploy-to-ECS job itself is confirmed green. Task 7 must deploy its Backend half
before its agent half, and P9 W8 Task 5's field-drop counter must be confirmed deployed first. O-14
blocks every Wave 4 enforcement change until all Wave 2 exits pass. The best dependency-safe next
implementation while external gates are pending is the Backend half of Wave 2 Task 6.

Preserve the P9 landmines: authoritative decision bodies live in `internal/localdecide`; detector or
disposition changes may intentionally move the 2,842-row decision golden, which must be regenerated
from a pristine pre-change worktree only. Do not replace P9's per-call-site canary I/O grace with a
larger shared delay. P47 owns detector classes/semantics; post a new `DetectorCatalogDigest` after any
intentional regeneration. Respect every shared-file owner and use the append-only handshake for seams,
migration claims, deploys, releases, conflicts, and blockers.

Use the coworker's VMs for disposable loopback-only PostgreSQL and missing platform proofs. Create a
fresh test credential; never copy a credential from a chat or commit it. Require the live-PG reporter
to show suites executed and zero skips. Never point schema preparation, defeat mutation, or test
cleanup at AWS/RDS/production.

Do not deploy, release, change cloud/IAM/task definitions, create repository secrets, change billing,
or weaken checks without the named fresh owner authorization. Do not claim 9+, zero false positives,
or certification until the measurement, corpus, live-proof, and Wave 8 certificate gates actually
support those words.

Work persistently through the remaining plan, but stop at independently reviewable task boundaries,
merge each source task when all of its source and coordination gates pass, and keep the checkpoint
handoff current for the next person.

---
