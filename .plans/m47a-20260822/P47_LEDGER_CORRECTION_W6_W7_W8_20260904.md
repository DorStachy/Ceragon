# Remaining-work ledger — Waves 6, 7A, 7B, 7C and 8 measured, 2026-09-04

Completes the re-measurement. With the Wave 3B and Wave 4A/4B corrections filed earlier today,
**every wave in the programme has now been measured against the tree at least once.**

Unlike those two, **these five measured almost exactly as the 09-02 ledger records them.** The
drift was confined to the waves Wave 4C happened to pass through.

## Result

| Wave | Ledger | Measured | Delta |
|---|---|---|---|
| 6 — console triage | 13 NOT STARTED | **0 of 13 built** | none |
| 7A — scanner execution truth | 8 NOT STARTED | **0 of 8 built** | none |
| 7B — scanner certification | 9 NOT STARTED | **0 of 9 built** | none |
| 7C — sandbox containment | 2 NOT STARTED | **0 of 2 built** | none |
| 8 — enforcement certificate | 11 NOT STARTED, 1 BLOCKED | **1 built + 1 partial of 12**; 2 owner-blocked | small |

Wave 8's exceptions: **Task 5** (per-call-site I/O grace) is built and its four named tests exist —
`internal/aicanary/exec.go`, `exec_iograce_test.go`, with call sites in `codexmanaged` and the Claude
provider. **Task 4** is genuinely partial and the split is clean, below.

## The five findings worth acting on

**1. `internal/certificate/schema.json` does not exist, and one wave already paid for it.**
Verified absent across five Installers checkouts and a `find` over the whole worktree area. Wave 8's
own outbound constraint required a schema-only commit *before* Wave 5 Task 10 started. It was never
made, and `W5_CLOSURE_20260904.md:44` records the consequence: Task 10 shipped NOT BUILT because *"it
does not exist, and the plan forbids inventing it."* A one-file commit would have unblocked it.

**2. Wave 8 Task 4 splits cleanly, and the half that exists is the half nobody can use.** The
fail-open observer shipped in 7.10.6 and is real: `internal/codexfailopen/observer.go`, the
three-state `HookCoverageState` (`CLAIMABLE` / `REFUSED` / `UNMEASURED`), a guard that already
refuses to let a vendor disclosure buy a green verdict, a CLI verdict term, and a Backend evidence
row. What is missing is any consumer that turns `REFUSED` into a *certificate status* — because the
certificate package does not exist. **"The observer shipped" and "a fail-open forces non-green" are
different claims and only the first is true.**

**3. Task 2's premise is stale in the safe direction.** The wave says widen the binding "from four
fields"; Wave 4B Task 4 already added the resolved-effect digest, so the preimage is **5** segments
(`ai_tool_hold_approval.go:189-196`). But the Backend DTO mirrors none of the effect axes, so the
"reviewer approves the same tuple the endpoint executes" property is **already broken for the
segment that does exist** — a smaller and sharper defect than the one the task describes.

**4. The live-proof register has outgrown its own specification.** `internal/liveproof/register.json`
holds **10** proofs across four `reviewBy` dates; Wave 8 describes 8 across one. A generator written
to the wave text would under-read it.

**5. Task 11 is blocked on an artifact no wave file flags.** Its guard is specified to compare an
encoded forbidden-claims list against Wave −1 Task 2's prose checklist via `ci/lib/claim-contract.mjs`.
That file does not exist — `ci/lib/` holds eleven scripts and none is it. Neither side of the
equality the exit criterion demands is present.

## What the programme actually looks like now

| Wave | Built | Note |
|---|---|---|
| −1, 0, 0A, 1, 2, 3 | mostly MERGED per the 09-02 ledger | **not re-measured today** — the only rows still taken on trust |
| 3B | **12 of 13** | T2 is a recorded deferral; T12 stranded on an unpushed Backend branch |
| 4A | **6 of 8** | T5/T6 owner-blocked on one private-key posture decision |
| 4B | **10 of 10** | |
| 4C | closed | |
| 5 | **9 of 11** | T6/T7 assigned to the other programme; T10 blocked on Wave 8 T6's schema |
| 6 | **0 of 13** | |
| 7A / 7B / 7C | **0 of 19** | |
| 8 | **1.5 of 12** | 2 owner-blocked |

**Remaining engineering is concentrated in three waves: 6, 7 and 8 — about 42 tasks.** Everything
earlier is built or owner-blocked.

## Cheapest high-value items, measured rather than guessed

1. **`internal/certificate/schema.json`** — one schema-only commit. Unblocks Wave 5 Task 10, and is
   the prerequisite for four separate Wave 8 tasks (4, 6, 7, 11).
2. **Wave 7C Task 1** — the two platform guards it exists to confirm *already work*: 6 Go-lane cases
   and 25 platform-mismatch cases, present and matching the plan's counts. Missing are an evidence
   file, a `pull_request` CI trigger, and one duplicated measurement in a comment. It is a
   documentation task sitting on working code.
3. **Wave 3B Task 12** — built, +913 lines, stranded on Backend `p47/w3b-backend`. Needs moving, not
   writing. It is Wave 6's declared dependency.

## The three red gates are the evidence debt

Restated here because it changes what "remaining work" means. `internal/neutraleval`'s three failing
tests are Wave 3B's own Suite 1, Suite 6 and labeler-governance gates, red because five canonical
residuals are open, 3 of 26 incidents are unmigrated, and enforcing cases lack a second labeler.
They are not inherited noise to route around. **They are the itemised list of what the programme
still owes.**

## What this measurement did NOT establish

- **Waves −1, 0, 0A, 1, 2 and 3 were not re-measured.** Their MERGED rows are still taken on trust.
- **Nothing was executed for Waves 6, 7 or 8.** Every verdict above rests on artifact presence or
  absence. Absence is decisive for NOT STARTED; presence is not proof a test passes.
- **No live, deployed or AWS state was inspected.** Every exit criterion needing a running system
  stays `UNKNOWN`, which is the state the wave files themselves assign.
- **Remotes were not queried for unfetched branches.** Wave 8's negatives cover five local Installers
  checkouts and a sweep of the worktree area.
