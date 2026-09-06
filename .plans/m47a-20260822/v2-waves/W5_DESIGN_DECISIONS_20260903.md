# Wave 5 — design decisions recorded before the branch is built, 2026-09-03

Measured on `p47/w5` at `1e5d73e6` — Frontend `origin/main` (`0f0cb7d1`) plus the two unmerged
consumer branches `p47/w4a-revendor` and `p47/w4b-frontend`. Baseline on that base:
`npx jest lib/ai-security types/vendored` = **78 tests green, 4 suites**.

## D-5-1 — The plan's reading instructions are obsolete

The wave opens *"Read `origin/main` with `git show`. The working tree is 525 commits behind"*, and
makes `MSYS_NO_PATHCONV=1` mandatory for it. Measured: `git rev-list --count HEAD..origin/main` = **0**.
The Frontend working tree **is** `origin/main`. Every `git show origin/main:<path>` instruction in this
wave becomes an ordinary working-tree read, and every line number in it was taken against a tree that
has since moved.

Wave 2's Frontend half is **merged to main** (`p47/w2-t1-severity-basis` and `p47/w2-t6-tool-grades`
are both ancestors of `origin/main`), so Task 10's vocabulary dependency is satisfied on the console
side. The Wave 4A and 4B re-vendors are **not** merged and are carried in this wave's base, because
Task 9 measures exactly that vendored surface.

## D-5-2 — The instrument is bigger than the plan knows, and already asks this wave's question

The plan inventories `scripts/render-harness/` as four files totalling **1,730 lines**. Measured:

```
248   README.md
282   coverage-truth-gate.md      <-- the plan does not know this exists
1245  fixtures.cjs                <-- plan says 870
635   shoot.cjs                   <-- plan says 635, correct
225   stub-backend.cjs            <-- plan says 225, correct
2635  total
```

`coverage-truth-gate.md` is not a report — it describes itself as *"a repeatable run, not a one-off"*,
and it already poses this wave's central question in as many words:

> does the composed coverage posture ever read healthier, or more definite, than the wire state behind
> it supports?

It also already carries the two limits any Wave 5 claim has to inherit: nothing there talks to a real
Backend, so a green run says the console renders honestly **given that wire state** and says nothing
about whether a Backend ever produces it; and there is no live-update channel, so every screenshot is
of the console in one settled state.

**Decision.** Task 1 extends that gate and inherits its stated limits verbatim. It does not build a
rival gate, and it does not restate those limits in weaker words. A Wave 5 exit criterion reading
"the harness proves the console is honest" would be a stronger claim than the harness makes about
itself.

## D-5-3 — Task 10 is BLOCKED, on a named dependency inside this programme

Task 10's first file is `Installers/internal/certificate/schema.json`, marked **READ ONLY** and
required to *"land by Wave 8 Task 6 as a schema-only commit"* before Task 10 starts. The wave header
repeats it: Task 10 *"does not invent a second shape."*

Measured: `internal/certificate/` **does not exist** in Installers on any P47 branch. The nearest
artifact is `internal/runtimecert/` (631 + 125 + 779 lines plus a `watch/` subdirectory), and it is a
**different object** — a Codex hook-dialect attestation whose rows are keyed by host binary:

```
digest, host, os, corpusVersion, selfReportedVersion, binaryPath, dialectId,
state, reason, coveredToolPaths, uncoveredToolPaths, allowControl, denyControl,
testSuiteVersion, expiresAt
```

It shares the `expiresAt` idiom and the `state`/`reason` pair, so it is a useful precedent for the
shape. It carries **none** of the fields Task 10 renders — no `metrics.precision.lower95`, no
`evaluation.eligible`, no `profile.exclusions`, no `downgradeTriggers`, no `multiplicity.tier`, no
`status`.

**Decision.** Task 10 is recorded **BLOCKED**, with a one-line unblock: a schema-only commit of
`internal/certificate/schema.json` from Wave 8 Task 6. Wave 5 does not author that schema. Authoring
it here would put the manifest's shape in the hands of the wave that renders it — the exact failure the
sequencing constraint exists to prevent — and every downstream number would then trace to a field this
wave invented for its own convenience.

Tasks 1-9 and 11 have no dependency on it and proceed.

## D-5-4 — Two ownership boundaries, one of them inside a directory this wave edits

`.plans/PARALLEL_EXECUTION_CONTRACT.md` gives P47 *"the console's policy and detections surfaces"*,
which covers this wave. Two exceptions are named in the 28-file table and both matter here:

- **`Frontend/app/admin/endpoints/coverage-section.ts` is P9's** ("Coverage truth"). Task 4 edits
  `Frontend/app/admin/endpoints/agents-content.tsx` — the same directory, a different file. The table
  names files, not directories, so `agents-content.tsx` is ours; `coverage-section.ts` is not, and no
  task may touch it. If a fix appears to need it, it becomes a handshake seam request.
- **`Frontend/scripts/render-harness/fixtures.cjs` is P47-owned, and P9 appends to it** (section 2.5).
  So Wave 5 may edit it, but must not disturb an existing fixture object it did not author: two teams
  editing one fixture silently changes what the other team's screenshots prove.

## D-5-5 — Task 9 keeps only the half no billing decision can block

Three waves have now pointed at the `pull_request:` trigger on
`Frontend/.github/workflows/vendored-upstream-drift.yml` as someone else's task. The plan settles it:
that half is **Wave -1 Task 5's**, where it is already a step and already an exit criterion, and it is
blocked there on the same owner spend decision as `holdout-score.yml`'s trigger.

**Decision.** Task 9 delivers only the half that runs regardless of any GitHub trigger — a check that
cannot be switched off by a workflow setting — and says so in its exit line rather than claiming the
drift gap closed. Three waves pointing at a fourth is how a one-line change goes unmade for a month.

## D-5-6 — Operational facts for every agent in this wave

- `node_modules` is a real 572-entry directory in the live Frontend checkout, junctioned into each
  worktree. **`ls` under Git Bash does not traverse a Windows junction** and will report one entry;
  `fs.readdirSync` reports 572. Do not conclude the junction failed from an `ls`.
- Installing a package is impossible here: the junction is shared with other checkouts.
- Next.js builds in this repo have needed `--webpack` rather than Turbopack.

## D-5-7 — Two more tasks are OUT OF BOUNDS, and the contract says so by name

D-5-4 above understated this. Checking every file in Wave 5's task list against the 28-file table
gives two more exclusions, both explicit:

| Contract row | Owner | Reason given | Which Wave 5 task |
|---|---|---|---|
| `Frontend/app/admin/endpoints/coverage-section.ts` | **P9** | "Coverage truth" | **Task 6, entirely** |
| `Installers/cmd/devoid/agent_shim.go` | **P9** | "Launch gate and dispatch" | **Task 7, primary file** |
| `Installers/cmd/devoid/ai.go` | **P9** | "Status/posture surfaces belong to coverage truth" | — |
| `Installers/cmd/devoid/main.go` | **P9** | "The uppercase-extension dispatch fix" | — |

**Task 6 has exactly two files and one of them is the whole task.** The contract row says
`coverage-section.ts`; the file on disk is `coverage-section.tsx`, 1,809 lines, and there is no `.ts`
variant, so the row names this file. Task 6 edits it at seven lines. There is no version of Task 6
that does not edit a P9 file.

**Task 7's first file is `agent_shim.go`**, named P9's for the exact reason Task 7 exists — it is the
launch gate. Its second file, `ai_daemon_ask.go`, is unnamed, but the plan's own text says the
vocabulary already exists there and the change is at the shim.

**Decision.** Tasks 6 and 7 are recorded **OUT OF BOUNDS** and posted to the handshake as seam
requests, each with the defect measured and the fix specified, so P9 can take them as one-file changes.
Section 1 is unambiguous: *"a task that edits the other programme's directory is out of scope by
definition, no matter how small the edit looks."* Wave 4A already breached this once in
`internal/proxy`; this wave does not add two more.

**Task 8 is NOT excluded, and the distinction is worth stating.** Section 1 gives P9 "`cmd/devoid`
dispatch", not all of `cmd/devoid`, and the table then names the three dispatch files individually —
`ai.go`, `agent_shim.go`, `main.go`. Task 8's files (`ai_tool_warn_confirm.go`, `ai_warn_dialog.go`,
`ai_warn_dialog_windows.go` and their tests) are named nowhere and are a confirmation-dialog surface,
not dispatch. Task 8 proceeds.

**Task 3's Backend half is narrow by decision.** `ai-governance/controllers/ai.controller.ts` is
unnamed; the neighbouring `ai-query.service.ts` is P47's ("Detections read path") while
`cmd/devoid/ai.go` is P9's because "status/posture surfaces belong to coverage truth". An MCP server
list sits close to that line. Task 3 therefore reads the existing `listServers(scope)` signature and
changes the console; if it turns out to need a Backend behaviour change, that becomes a seam request
rather than an edit.

## D-5-8 — What this wave can therefore deliver

**Buildable: Tasks 1, 2, 3, 4, 5, 8, 9, 11** — eight of eleven.

**Not buildable, each for a named reason, none of them "hard":**
- **Task 6** — P9 owns the only file it touches.
- **Task 7** — P9 owns its primary file.
- **Task 10** — its input schema is another wave's deliverable and has not landed.

Three of eleven, and the wave will report them as such rather than finding a way to touch the files
anyway. The exit criteria that depend on them are reported unmet, with the owner named.
