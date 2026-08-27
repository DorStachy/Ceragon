# Wave 7A — Scanner execution truth

**Depends on:** nothing
**Implements decisions:** D3 (measure before the gate goes live), D6 (a customer-visible detection, a
SOC alert and an enforcement are three different objects), D14 (keep fail-open, make it force
non-green), D17 (this delivers a dimension, not a risk certificate), plus the house rule *absence
reads as UNKNOWN, never ZERO or GREEN*
**Certificate impact:** the **R2 execution-truth dimension** stays `UNKNOWN` until every criterion
below passes. R2 itself stays `NOT_READY` whatever this wave does — 7A proves scanners *ran*, and the
things that keep R2 red live in Wave 7B and in the external branch-protection blocker. Nothing in 7A
may be described as moving a risk lane.

---

## Context an engineer needs

### The rebase, and why this wave is a preserve-not-rewrite

`GithubApp-Bot-Scanner-Worker` `origin/main` is `3d4116a5` — the **same revision** the v1 plan and the
2026-08-23 review both read. Every scanner-side citation in v1's Wave 7 was re-resolved on 2026-08-27
and **all of them are exact**. Backend moved `787b71dc` → `0cf9021e`, but:

```
cd C:/Users/Owner/Documents/Ceragon/Backend
git log --oneline 787b71dc..origin/main -- src/github-app/controllers/results.controller.ts
```

returns **nothing**, so the Backend citations in this wave hold as well. This wave is therefore a
line-citation rebase over v1 `plan:15272-17501`, not a redesign. The review named scanner execution
truth, the deployment sequencing and the unknown-state visibility as strengths; they are kept verbatim
in substance.

**Three citations did drift and are corrected here. Nothing else changed.**

| v1 plan wrote | Verified truth at the revisions above |
|---|---|
| `Backend/src/common/pipes/agent-ingest-validation.pipe.ts:76-80, 88-91` | strict pipe constructed at **`:77-81`**; the strict branch is **`:90-91`** (`if (!isAgentWireDto(metadata.metatype))` → `return this.strict.transform(...)`) |
| `scanner-worker/.github/workflows/test.yml:53-58` | **no such file.** The only test workflow is repo-root **`.github/workflows/test.yml`**, and the `Build github-action dist (scanner-worker only — required by pretest)` step is at **`:52-57`** |
| `Installers/internal/core/backend/client.go:2813-2877` | `ScanRunStatusResponse` is at **`:2856`**, `VerdictReason` at **`:2859`**, and there is still **no `securityOutcome` field on it** |

Discovery commands, so nobody has to trust this table:

```
cd C:/Users/Owner/Documents/Ceragon/GithubApp-Bot-Scanner-Worker
MSYS_NO_PATHCONV=1 git show origin/main:.github/workflows/test.yml | grep -n "Build github-action dist"
cd C:/Users/Owner/Documents/Ceragon/Installers
MSYS_NO_PATHCONV=1 git grep -n "ScanRunStatusResponse struct" origin/main -- internal/core/backend/
```

**Read `origin/main`, never the working tree.** Every checkout on this box is on a stale branch. On
Git Bash prefix `git show` / `git grep` with `MSYS_NO_PATHCONV=1` when the path begins with a dot, or
MSYS rewrites `.github/...` into a revision error.

### The five verified false-green paths

1. **Fork PRs pass unconditionally.** `github-action/scripts/main.ts:433` opens
   `if (forkInfo.fork && !apiKey)` and the block ends in a bare `process.exit(0)` at **`:455`**. No
   verdict is consulted. GitHub never supplies secrets to a `pull_request` from a fork, so `apiKey` is
   always empty there — `detectFork` at `:87` branches on the same condition. This is *the* fork
   behaviour, not an edge case.
2. **Empty API key on a non-fork** skips the Backend and exits on the *local* verdict:
   `main.ts:464`, `process.exit(shouldFailBuild(verdict, failOn, false) ? 1 : 0)` where
   `verdict = severityToVerdictWs3(redacted)` (`:429`). Nothing signals that the org's policy was
   never applied.
3. **Poll timeout falls back to that same local verdict** — `main.ts:536-570`, exiting at `:569`.
   Worse: `pollForVerdict` (`github-action/scripts/upload-results.ts:191`) only returns when
   `body.status && TERMINAL_STATUSES.has(body.status) && body.verdict` (**`:209`**), and the Backend
   **nulls `verdict` exactly when `securityOutcome === 'COVERAGE_FAILED'`**
   (`Backend/src/github-app/controllers/results.controller.ts:360`). So a COVERAGE_FAILED run polls
   the full 120 s, times out, and exits on the local verdict. **A coverage failure becomes a green
   build by construction.**
4. **The worker nulls the fail-closed stamp.** Backend stamps `securityOutcome='COVERAGE_FAILED'` at
   ingest for every Action submission — `normalizeScannerRuntime` returns
   `{scannerExecution: missingScannerExecution(), securityOutcome: 'COVERAGE_FAILED'}` when `runtime`
   is absent or not an object (`Backend/src/github-app/utils/scanner-execution.util.ts:192-197`),
   called from `applyScannerRuntime` (`results.controller.ts:519`) on both submit paths
   (`:165`, `:203`). The scanner worker then writes `security_outcome = $17` / `= $16` with a value
   that is `null` whenever `aggregatedExecution` is null
   (`scanner-worker/src/processor-pipeline.ts:3577-3590` derivation, `:3741` + `:3766-3767`, and the
   schema-skew fallback `:3817` + `:3839-3840`). For an Action-lane run the worker never has scanner
   statuses, so `aggregatedExecution` is always null, so the stamp is always erased. **Two components
   disagree about one row and the weaker one writes last.**
5. **No execution manifest.** `scannersRun` is the hardcoded 12-engine *requested* list
   (`main.ts:430` → `utils.ts:161-180`, the `parseScannerList` fallback array). `run-scanners.sh`
   **does** write real per-engine truth — `<results>/raw/<scanner>.status.json` and the aggregate
   `<results>/scanner-status.json` (`:57`, `:62-63`, `:87`, `:164`, `:184`, `:264-275`) — and
   **nothing in production code reads either file.** Verify:

   ```
   cd C:/Users/Owner/Documents/Ceragon/GithubApp-Bot-Scanner-Worker
   MSYS_NO_PATHCONV=1 git grep -n "scanner-status" origin/main -- github-action/ scanner-worker/
   ```

   Five hits on 2026-08-27: the two writer lines (`run-scanners.sh:57`, `:87`) and three test files
   (`github-action/tests/full-scan-sca-trust.spec.ts:260`,
   `github-action/tests/run-with-timeout.spec.ts:79`, and a *comment* in
   `scanner-worker/src/__tests__/worker-local-scan-refresh.spec.ts:277`). **Zero production
   consumers.** `main.ts:247` explicitly skips `.status.json` when collecting findings, and
   `run-scanners.sh:235` swallows every wrapper failure with `|| true` while the script always exits
   0. **"Zero findings" and "zero engines ran" are identical inputs to every downstream gate.**

### The skip-reason vocabulary (load-bearing for Task 1)

`run-scanners.sh:62` writes `reason:"no-changed-files"`. `scanners/common.sh:179` writes
`reason:"not-diff-safe"`. `common.sh:215-223` documents the three SCA reasons emitted through
`_emit_sca_skip` (`common.sh:240-247`): `missing-changed-files-manifest`, `no-lockfile-change`,
`lockfile-not-present` — and that comment states outright that the first and third are **honest
failure signals, not clean runs**. Do not collapse them into one "skipped" bucket.

### What already exists — connect it, do not rebuild it

- `scanner-worker/src/scanner-execution.ts` already exports `SCANNER_EXECUTION_MISSING =
  'coverage-contract-missing'` (**`:21`**), `missingScannerExecution` (**`:111`**),
  `requireScannerExecutionTruth` (**`:122`**), `buildScannerExecution` (**`:160`**),
  `sanitizeScannerExecution` (**`:202`**), `aggregateScannerExecutions` (**`:219`**),
  `hasRequiredCoverageGap` (**`:325`**), `deriveSecurityOutcome` (**`:357`**).
- `Backend/src/github-app/dto/submit-results.dto.ts:168-179` already declares
  `metadata.runtime?: Record<string, unknown> & { scannerExecution?; securityOutcome? }` as an **open
  `@IsObject()`** — inner keys are not whitelisted. Same for `CompleteUploadMetadataDto.runtime`
  (`complete-upload.dto.ts:48-54`), which also already declares `defaultBranch` (`:22`).
- `ScannerExecutionInput = Partial<ScannerExecution>` where `ScannerExecution` is exactly
  `{requested, succeeded, partial, failed, skipped, required}: string[]`
  (`scanner-execution.util.ts:10-19`). **The manifest shape is that shape.** Do not invent a second.
- `results.controller.ts:555-566` spreads the whole validated `dto.metadata` into the SQS payload, so
  anything under `metadata.runtime` reaches the worker unchanged; `results-chunk.controller.ts:210`
  forwards `runtime` explicitly.
- `http-client.ts` exports `SignedRequestRuntime` (**`:33`**) and `signedJsonRequest` already takes
  `retryControl` (5th, **`:140`**) and `runtime` (6th, **`:141`**). `chunked-upload.ts` already uses
  that seam (`ChunkedUploadOptions`, **`:28-30`**). **`uploadResults` does NOT** — it takes exactly
  two parameters (`upload-results.ts:119-122`), so its test mocks the http-client module rather than
  inventing a third argument.
- `scanner-worker/src/worker.ts:3182` (`readScannerStatuses`) is the exact status-file reader to
  mirror in the action.
- `js-yaml` is already a runtime dep and `@types/js-yaml` a devDep of `github-action`
  (`package.json:22`, `:27`), so the `action.yml` test needs no install.

### The trap: never put the manifest at the top level of `metadata`

The global pipe is `AgentIngestValidationPipe` (`Backend/src/main.ts:77`), which is **strict** for
every non-agent DTO (`src/common/pipes/agent-ingest-validation.pipe.ts:77-81` constructs it,
`:90-91` selects it). `SubmitResultsDto` is not an agent wire DTO, so an undeclared
`metadata.scannerStatuses` would **400 the entire submit**. That defect class has shipped in this
workspace three times. Use `metadata.runtime`.

### A guard that has never run

`scanner-worker/src/__tests__/processor-scanner-truth.integration.spec.ts:7` reads
`const describeWithDatabase = databaseUrl ? describe : describe.skip;` off
`SCANNER_TRUTH_TEST_DATABASE_URL`. That variable is set **nowhere in the repository**:

```
cd C:/Users/Owner/Documents/Ceragon/GithubApp-Bot-Scanner-Worker
MSYS_NO_PATHCONV=1 git grep -n "SCANNER_TRUTH_TEST_DATABASE_URL" origin/main
```

returns one hit, inside the spec itself. Its `it.each` declares **2** cases (`:145-147`, primary and
schema-skew branches) and both are skipped in every CI run today. This is the fifth inert-test shape
from `reference_inert_test_shapes.md`: green because it never executed. Task 7's exit criterion is
"**2 passed**, not skipped" precisely for that reason, and Task 7 must also make the skip visible
rather than silent.

### Ordering constraint — read this before deploying anything

The execution manifest must be **produced by deployed runners before the Backend/worker requires
it**, or every scan fails closed on deploy.

1. Tasks 1-5 (`github-action`) merge. Before the release tag is cut, run the composite action once on
   a real fork PR against this repo and record the manifest (Task 5) — that is the D3 measurement
   gate. Then tag. Customers pinning the new ref start emitting `metadata.runtime`.
2. **Task 8 (Backend) deploys next.** Read-path only, safe alone.
3. **Task 6 (worker reads `metadata.runtime.*`) next.** Additive: a message without the envelope
   behaves exactly as today.
4. **Task 7 deploys LAST**, and only after this repo's own workflows run the new action ref. After
   Task 7 a submission carrying **no** manifest completes as `COVERAGE_FAILED`. That is the correct
   answer and it is a visible cutover.

Do not reorder 6 and 7. Do not deploy 7 before 8. Deploying at all needs a fresh explicit owner ask.

### Worktree prerequisites

Both worktrees start with no `node_modules`, and the CI lane builds `github-action/dist` before the
worker specs run (`.github/workflows/test.yml:52-57`), so do the same or some worker specs cannot
resolve it.

```
cd C:/Users/Owner/Documents/Ceragon/GithubApp-Bot-Scanner-Worker
git worktree add ../.wave7-scanner -b wave7/scanner-false-greens origin/main
cd ../.wave7-scanner/shared-schemas && npm install --install-links=false && npm run build
cd ../github-action && npm install --install-links=false && npm run build
cd ../scanner-worker && npm install --install-links=false

cd C:/Users/Owner/Documents/Ceragon/Backend
git worktree add ../.wave7-backend -b wave7/coverage-failed-reason origin/main
cd ../.wave7-backend && npm install
```

All paths below are relative to those worktree roots. **Never `git add -A`.** Never `git stash` —
`refs/stash` is shared repo-wide across worktrees here and a pop steals a concurrent session's work.

---

## Task 1: Execution manifest producer for the action

**Files:**
- Create: `github-action/scripts/execution-manifest.ts`
- Test: `github-action/tests/execution-manifest.spec.ts`

- [ ] Write `tests/execution-manifest.spec.ts` first, red. It asserts, against
      `buildExecutionManifest({requested, statuses})`:
      (a) the output is exactly the `ScannerExecution` shape from
      `Backend/src/github-app/utils/scanner-execution.util.ts:10-19` —
      `{requested, succeeded, partial, failed, skipped, required}`, all `string[]`;
      (b) a `<results>/scanner-status.json` that is **absent or unparseable** yields
      `missingExecutionManifest()` whose every array carries the literal
      `'coverage-contract-missing'` (the same marker as `scanner-execution.ts:21`), **never an empty
      manifest**;
      (c) the five skip reasons are preserved per engine and the three honest-failure reasons
      (`missing-changed-files-manifest`, `lockfile-not-present`, `not-diff-safe`) classify to
      **`failed`**, while `no-changed-files` and `no-lockfile-change` classify to `skipped`;
      (d) an engine present in `requested` with no status entry at all lands in `failed`, not
      `succeeded`.
- [ ] Implement `execution-manifest.ts` by mirroring `scanner-worker/src/worker.ts:3182`
      (`readScannerStatuses`) — same allowlisting, same per-file byte cap. Do not re-derive the
      12-engine list; take `requested` from the caller (`main.ts:430`).
- [ ] Export `missingExecutionManifest()` alongside `buildExecutionManifest()`; both are consumed by
      Task 2.

**Defeat test:** `execution-manifest.spec.ts` — change the absent-file branch to return
`{requested: [], succeeded: [], partial: [], failed: [], skipped: [], required: []}`. Expected
failure: `Expected: ["coverage-contract-missing"] / Received: []` on the `failed` array assertion.
**Exit:** `buildExecutionManifest` classifies **all 5** documented skip reasons plus the two
absent-file cases — **7 of 7** classification assertions green, and the file is imported by
`main.ts` (Task 5), proven by
`MSYS_NO_PATHCONV=1 git grep -n "execution-manifest" -- github-action/scripts/main.ts` returning a hit
on the merged branch.

---

## Task 2: One exit decision for every lane

**Files:**
- Create: `github-action/scripts/scan-exit-decision.ts`
- Test: `github-action/tests/scan-exit-decision.spec.ts`

- [ ] Write `tests/scan-exit-decision.spec.ts` first, red. `resolveScanExitDecision` takes
      `{localVerdict, backendVerdict|null, manifest, failOn, forkMode, apiKeyPresent}` and returns
      `{exitCode, securityOutcome, coverageComplete, enginesUnsatisfied, backendVerdictApplied}`.
      Required cases:
      (a) **fork PR with a blocking local verdict exits 1** — this is the v1 finding, and it is the
      one that must never regress;
      (b) full coverage + backend PASS → 0;
      (c) any required engine not in `succeeded` → exit 1 unless `failOn === 'never'`, and
      `securityOutcome === 'COVERAGE_FAILED'`;
      (d) `missingExecutionManifest()` input → `COVERAGE_FAILED` with
      `enginesUnsatisfied === ['coverage-contract-missing']`;
      (e) `backendVerdict === null` → `backendVerdictApplied === false` and the outcome is not green
      merely because the local verdict was.
- [ ] Implement `scan-exit-decision.ts`. It is the **only** place an exit code is computed.
- [ ] Delete `shouldFailBuild` from `main.ts:278-292` in Task 5, not here; this task only builds its
      replacement.

**Defeat test:** `scan-exit-decision.spec.ts` — revert case (a) by returning `0` whenever
`forkMode === true`. Expected failure: `expect(received).toBe(expected) // Expected: 1, Received: 0`
in the fork case. **Exit:** exactly **one** exit-code computation reachable from the action —
`MSYS_NO_PATHCONV=1 git grep -cn "process.exit(" -- github-action/scripts/main.ts` returns the
post-Task-5 count and every occurrence passes through `resolveScanExitDecision`.

---

## Task 3: Carry the manifest on the upload wire

**Files:**
- Modify: `github-action/scripts/types.ts` — insert above `RunnerMetadata` (`:152`), add one field
  inside it (after `:163`), extend `CompleteUploadRequest.metadata` (`:210-217`)
- Modify: `github-action/scripts/upload-results.ts:150-162` (the `SubmitResultsRequest` metadata
  literal)
- Modify: `github-action/scripts/chunked-upload.ts:17-25` (`ChunkedUploadInput.metadata` Pick),
  `:79-86` (`completeMetadata`)
- Test: `github-action/tests/upload-runtime-envelope.spec.ts`

- [ ] Write the test first, red. It mocks `signedJsonRequest` at the module boundary (because
      `uploadResults` has no runtime seam — `upload-results.ts:119-122`), calls `uploadResults` and
      `uploadResultsInChunks`, and asserts the submitted body contains
      `metadata.runtime.scannerExecution` and `metadata.runtime.securityOutcome`, **and nothing new at
      `metadata`'s top level**.
- [ ] Add the assertion that the payload has **no** undeclared top-level metadata key, listing the
      declared set from `submit-results.dto.ts`. This is the guard against the 400-the-whole-fleet
      defect class.
- [ ] Thread `runtime` through both upload paths.

**Defeat test:** `upload-runtime-envelope.spec.ts` — move the envelope from `metadata.runtime` to
`metadata.scannerExecution`. Expected failure: the top-level-key assertion reports
`Expected: [] / Received: ["scannerExecution"]`. **Exit:** both upload paths (single and chunked)
carry the envelope — **2 of 2** wire-shape assertions green, and a live submit against a running
Backend returns 201, not 400.

---

## Task 4: A nulled backend verdict must end the poll, not exhaust it

**Files:**
- Modify: `github-action/scripts/upload-results.ts:11` (import), `:186-221` (`pollForVerdict` and its
  JSDoc)
- Test: `github-action/tests/poll-for-verdict.spec.ts`

`signedJsonRequest` already accepts a 6th `runtime: SignedRequestRuntime` (`http-client.ts:141`) and
`SignedRequestRuntime` is already exported (`:33`). Nothing new is invented; the existing seam is
threaded through one more caller.

- [ ] Write the test first, red. A terminal status with `verdict: null` and
      `securityOutcome: 'COVERAGE_FAILED'` must return on the **first** poll, with the timing function
      injected so the test proves the 120 s wall was not reached.
- [ ] Change the return condition at `:209` from
      `body.status && TERMINAL_STATUSES.has(body.status) && body.verdict` to terminal-status-only,
      returning the whole body so the caller can read `securityOutcome`.
- [ ] Add the counter-case: a non-terminal status still polls.

**Defeat test:** `poll-for-verdict.spec.ts` — restore `&& body.verdict`. Expected failure: the
injected clock assertion reports the poll consumed the full timeout —
`Expected: 1 poll, Received: <n>` with `n` at the retry ceiling. **Exit:** a COVERAGE_FAILED run
returns on poll **1**, not poll `n`; measured on the real fork-PR run in Task 5 and recorded.

---

## Task 5: Wire `main.ts`, and make the composite action's outputs real

**Files:**
- Modify: `github-action/scripts/main.ts:33` (imports), `:278-292` (delete `shouldFailBuild`),
  `:329` (insert helpers above `main`), `:429-465`, `:509-523`, `:526-570`
- Modify: `github-action/action.yml:72-74` (`outputs`), `:78` (the step, to add `id: scan`)
- Test: `github-action/tests/action-outputs.spec.ts`

`action.yml` today declares exactly **one** output — `scan-run-id` at `:73-74` — **with no `value:`**,
and its single step (`:78`) has **no `id:`**. A composite-action output without `value:` is always the
empty string, so the one declared output is inert while `main.ts:526-530` and `:566-568` write four
values nobody can read.

- [ ] Write `tests/action-outputs.spec.ts` first, red: parse `action.yml` with `js-yaml` and assert
      all **eight** outputs exist, each with a `value:` mapping to `steps.scan.outputs.*`, and that
      the step carries `id: scan`. The eight: `scan-run-id`, `verdict`, `final-verdict`,
      `findings-count`, `security-outcome`, `coverage-complete`, `engines-unsatisfied`,
      `backend-verdict-applied`.
- [ ] Add a second assertion that every one of the eight is written on **every** exit path in
      `main.ts` — fork exit, no-API-key exit, poll-timeout exit, normal exit. A declared-but-empty
      output is the same false green in a different costume.
- [ ] Delete `shouldFailBuild` (`:278-292`). Route all four exits through `resolveScanExitDecision`.
- [ ] Call `buildExecutionManifest` after `run-scanners.sh` completes and before
      `severityToVerdictWs3` at `:429`; pass the manifest into the upload metadata (Task 3) and into
      the exit decision (Task 2).
- [ ] **D3 measurement gate.** Run the composite action once on a **real fork PR against this repo**
      before the release tag is cut. Record in the PR description: the annotation line, the literal
      `engines-unsatisfied` value, and the literal `security-outcome` value.

**Defeat test:** `action-outputs.spec.ts` — remove `value:` from one output in `action.yml`.
Expected failure: `Expected: 8, Received: 7` on the mapped-output count.
**Exit:** **8 of 8** outputs declared, mapped and written on **4 of 4** exit paths;
`shouldFailBuild` returns **0** hits from
`MSYS_NO_PATHCONV=1 git grep -c shouldFailBuild -- github-action/scripts/main.ts`; and the real
fork-PR run's `engines-unsatisfied` is empty on an unmodified `main`, or the offending engine was
fixed before tagging.

---

## Task 6: Worker reads the manifest the action now sends

**Files:**
- Modify: `scanner-worker/src/processor-pipeline.ts:3301`, `:3309`, `:3342`, `:3376-3384`
- Test: `scanner-worker/src/__tests__/processor-runtime-envelope.spec.ts`

The Backend spreads the whole validated `dto.metadata` into the SQS payload
(`results.controller.ts:555-566`) and the chunk path forwards `runtime` explicitly
(`results-chunk.controller.ts:210`), so `metadata.runtime` arrives intact. The worker reads only the
metadata **top level** today (`processor-pipeline.ts:3301` `const md = (message.metadata ?? {})`,
then `:3309` `md['scannerStatuses']`, `:3342` `sanitizeScannerExecution(md['scannerExecution'])`), so
it never sees it.

- [ ] Write the test first, red, exercising `extractRuntimeMetadata` (`processor-pipeline.ts:3293`)
      directly. Construct `ProcessorService` with `pool = null` (4th ctor arg, `:443`) so the test is
      deterministic regardless of `DATABASE_URL` in the shell.
- [ ] Resolve `metadata.runtime.scannerExecution` and `metadata.runtime.scannerStatuses` with the
      existing top-level read as a fallback — additive, never a replacement.
- [ ] Extend `requiresScannerExecutionTruth` (`:3375-3385`) so a message carrying
      `runtime.scannerExecution` sets `scannerExecutionRequired: true`.
- [ ] Assert the legacy top-level shape still works, so an old action ref does not regress.

**Defeat test:** `processor-runtime-envelope.spec.ts` — revert the nested read. Expected failure:
`Expected: {"requested": [...], ...} / Received: null` on the resolved `scannerExecution`.
**Exit:** **3 of 3** resolution assertions green (nested, legacy top-level,
`scannerExecutionRequired` flip), with the legacy case proving zero behaviour change for an
unmigrated producer.

---

## Task 7: Stop the worker erasing the fail-closed stamp

**Files:**
- Modify: `scanner-worker/src/processor-pipeline.ts:3741` and `:3817` (the two
  `UPDATE github_scan_runs` statements) plus their parameter arrays at `:3766-3767` and `:3839-3840`
- Modify: `scanner-worker/src/__tests__/processor-pipeline.spec.ts:531-532`, `:957-958`,
  `:1151-1158` — three literal-SQL assertions that pin the pre-fix text
- Modify: `scanner-worker/src/__tests__/processor-scanner-truth.integration.spec.ts:7`
- Test: `scanner-worker/src/__tests__/processor-security-outcome-preserve.spec.ts`

**Deploy this LAST** — after Task 8 is live in the Backend and after this repo's own workflows run the
new action ref.

- [ ] Write `processor-security-outcome-preserve.spec.ts` first, red, with a recording pool that
      captures `{sql, params}`. Assert that when `aggregatedExecution` is null the emitted SQL uses
      `COALESCE` and does **not** bind `security_outcome` / `scanner_execution` unconditionally, on
      **both** completion branches.
- [ ] Change both `UPDATE` statements to `security_outcome = COALESCE($n, security_outcome)` and
      `scanner_execution = COALESCE($m::jsonb, scanner_execution)`.
- [ ] Update the three pinned literal-SQL assertions in `processor-pipeline.spec.ts` to the new text.
      **Updating an assertion to match a deliberate change is allowed; deleting it is not.** These
      three are the reason the erasure was ever visible.
- [ ] **Make the dark integration guard visible.** `processor-scanner-truth.integration.spec.ts:7`
      silently downgrades to `describe.skip` without `SCANNER_TRUTH_TEST_DATABASE_URL`, which is set
      nowhere in the repo. Replace the silent skip with a `describe` that **fails** when
      `process.env.CI` is set and the URL is not, and add the variable to the test workflow's env
      pointing at a service container. A guard that quietly does not run is not a guard.

**Defeat test:** `processor-security-outcome-preserve.spec.ts` — restore the unconditional bind.
Expected failure: `expect(sql).toContain("COALESCE($17, security_outcome)")` reports the received SQL
still says `security_outcome = $17`. **Exit:** `processor-scanner-truth.integration.spec.ts` reports
**2 passed** (not 2 skipped) against a real Postgres, and neither completion `UPDATE` binds
`security_outcome` or `scanner_execution` unconditionally.

---

## Task 8: A COVERAGE_FAILED scan must tell the developer why

**Files:**
- Modify: `Backend/src/github-app/controllers/results.controller.ts:34` (import), insert above
  `:355`, and change `:360` and `:364`
- Test: `Backend/src/github-app/controllers/results.controller.spec.ts` — add inside the existing
  `describe('getScanRunStatus response shape', ...)` block (`:480`), after the
  `'returns the full status payload for a completed local-cli scan'` case (`:485`)

The status poll is what the local `cera` CLI reads —
`Installers/internal/core/backend/client.go:2856` (`ScanRunStatusResponse`) has `Verdict` and
`VerdictReason` at `:2859` and **no `securityOutcome` field**. On a COVERAGE_FAILED run the
controller nulls `verdict` (`:360`) and passes the row's `verdictReason` through
`sanitizeVerdictReason` (`:364`), which returns `null` for a null input
(`src/github-app/utils/customer-scan-run-sanitizer.ts:227`, `if (typeof verdictReason !== 'string')
return null`). So the push blocks while naming an **empty verdict and an empty reason**.

The canonical customer-safe string already exists and is already exported —
`results-ingestion.service.ts:41-42` `CUSTOMER_SCAN_FAILED_REASON = "We couldn't complete a full scan
of this code."`, mirrored at `github-read.service.ts:431-432` and used at `:1697`, `:1711`, `:1733`.
**Reuse it; do not mint a second string.**

- [ ] Confirm the existing suite is green before touching anything:
      `npx jest --runInBand src/github-app/controllers/results.controller.spec.ts`.
- [ ] Write the failing test: a `COMPLETED` row with `securityOutcome: 'COVERAGE_FAILED'`,
      `verdict: 'PASS'`, `verdictReason: null` must return `verdict: null` **and**
      `verdictReason: "We couldn't complete a full scan of this code."`.
- [ ] Add the counter-case: a non-COVERAGE_FAILED row's `verdictReason` still goes through
      `sanitizeVerdictReason` unchanged. **Do not weaken the sanitizer** — it is an existing guard.
- [ ] Import `CUSTOMER_SCAN_FAILED_REASON` at `:34` and substitute it only on the COVERAGE_FAILED
      branch.

**Defeat test:** `results.controller.spec.ts` — revert the substitution. Expected failure:
`Expected: "We couldn't complete a full scan of this code." / Received: null` on `verdictReason`.
**Exit:** `GET /api/v1/github/results/:id/status` on a COVERAGE_FAILED row returns `verdict: null`
**and** the exact canonical string — **1 of 1** new case green with the sanitizer counter-case still
green, i.e. **2 of 2** in the block.

---

## Wave 7A exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. `github-action/scripts/execution-manifest.ts` exists and is *consumed*:
   `MSYS_NO_PATHCONV=1 git grep -n "execution-manifest" -- github-action/scripts/main.ts` returns
   **≥1** hit on the merged branch. Defeat: `execution-manifest.spec.ts`.
2. `buildExecutionManifest` classifies **7 of 7** documented status cases (5 skip reasons + absent
   file + unparseable file), and the absent case yields `coverage-contract-missing`, never `[]`.
   Defeat: `execution-manifest.spec.ts`.
3. A fork PR with a blocking local verdict **exits 1**, proven by `scan-exit-decision.spec.ts` **and**
   confirmed on a real fork PR against this repo before the release tag is cut. Defeat:
   `scan-exit-decision.spec.ts`, fork case.
4. The D3 measurement from that same real fork-PR run is recorded in the PR description: the
   annotation line, `engines-unsatisfied`, and `security-outcome`. `engines-unsatisfied` is **empty**
   on an unmodified-`main` run, or the offending engine was fixed before tagging.
5. A run where any required engine did not succeed **exits 1** unless `fail-on: never`, and its
   `security-outcome` output is `COVERAGE_FAILED`. Defeat: `scan-exit-decision.spec.ts`, case (c).
6. A run whose `scanner-status.json` is absent reports `security-outcome=COVERAGE_FAILED` with
   `engines-unsatisfied=coverage-contract-missing`. Absence reads as UNKNOWN, not as zero findings.
   Defeat: `scan-exit-decision.spec.ts`, case (d).
7. `pollForVerdict` returns on the **first** terminal poll even when `verdict` is null; no
   COVERAGE_FAILED run reaches the 120 s timeout. Defeat: `poll-for-verdict.spec.ts` with the
   injected clock.
8. `action.yml` declares **8** outputs, each with a `value:` mapping to `steps.scan.outputs.*`, the
   step carries `id: scan`, and each is written on **4 of 4** exit paths. **0** declared-but-empty
   outputs remain. Defeat: `action-outputs.spec.ts`.
9. `shouldFailBuild` returns **0** hits in `github-action/scripts/main.ts` — one exit policy, not two.
   Defeat: `scan-exit-decision.spec.ts` plus the grep in the merge checklist.
10. Neither completion `UPDATE github_scan_runs` in `processor-pipeline.ts` binds `security_outcome`
    or `scanner_execution` unconditionally; both use `COALESCE`, and
    `processor-scanner-truth.integration.spec.ts` reports **2 passed** (not 2 skipped) against a real
    Postgres. Defeat: `processor-security-outcome-preserve.spec.ts`.
11. The worker resolves `metadata.runtime.scannerExecution` / `metadata.runtime.scannerStatuses`, a
    message carrying `runtime.scannerExecution` sets `scannerExecutionRequired: true`, and the legacy
    top-level shape is unchanged — **3 of 3**. Defeat: `processor-runtime-envelope.spec.ts`.
12. `GET /api/v1/github/results/:id/status` on a COVERAGE_FAILED row returns `verdict: null` **and**
    `verdictReason: "We couldn't complete a full scan of this code."`. Defeat:
    `results.controller.spec.ts`.
13. Full suites green in both scanner packages and in Backend, **excluding only** the repos' own
    declared baseline failures (`scan-policy.service.spec.ts`, `normalize-json.spec.ts`,
    `ensure-python-tool.spec.ts`) and the three scanner-worker specs that run under their own configs.
    Baseline those exclusions on untouched `origin/main` in a throwaway worktree first and compare
    counts; do not attribute a pre-existing red to this wave.
14. Deploy sequence executed and recorded **in this order**: action release tag → Backend (Task 8) →
    worker Task 6 → worker Task 7. Task 7 is not deployed until this repo's own workflows are on the
    new action ref. Each deploy needs its own fresh owner ask.

**Certificate contribution.** On all fourteen: R2 **execution-truth dimension** = `PASS`, with the
bound stated as *"scanner execution absence and partial coverage no longer appear as green on the
named paths"* and nothing more. R2 the risk lane stays `NOT_READY` (D17).

---
---

# Wave 7B — Scanner detection certification

**Depends on:** Wave 7A (an execution manifest must exist before detection quality can be attributed
to a run), Wave 3 (per-class denominators and the UNKNOWN-not-zero rule), Wave 3B (version identity —
no result artifact may be stamped with a constant)
**Implements decisions:** D3, D17, D18, and the review's P0-12, P0-13, P0-17, P1-04
**Certificate impact:** **R2 stays `NOT_READY` at the end of this wave.** Every deliverable here is
necessary and none is sufficient, because the roadmap makes M5.3-A mandatory for any 9+ R2 profile
and M5.3-A requires protected branches, which the current GitHub plan cannot provide. This wave's
own contribution is a new bounded dimension — **scanner detection evidence** — reported with its
denominators, or `UNKNOWN` where a denominator does not exist yet.

---

## Context an engineer needs

### The premise, stated plainly

Wave 7A proves scanners **ran**. An inert or inaccurate scanner executes successfully and truthfully
returns an empty result. Nothing in 7A measures vulnerability recall, precision, CWE/language/
framework strata, cross-file source→sink reachability, generated/minified/obfuscated variants,
suppression behaviour, per-engine contribution or blind spots, or ruleset/model-version quality. That
is P0-12, and the Scanner repo has not moved since it was written, so it is current.

### What the evidence base actually is today, with real denominators

This is not starting from zero, and the review said so. It is starting from **59 labelled cases across
three corpora, in three file languages, with zero benign twins in the largest one.** Measured on
`origin/main` `3d4116a5`:

| Asset | Size, measured | Languages | What it can support |
|---|---|---|---|
| `github-action/configs/quality-corpus/quality-corpus-manifest.json` | **22 entries** over **7 fixture files**, **6 FP classes**, producers `semgrep` 17 / `gitleaks` 2 / `sca` 2 / `ai-advisory` 1. Verdicts: **10** `FALSE_POSITIVE`, **8** `TRUE_POSITIVE`, **3** `TITLE_INACCURATE`, **1** `OVER_SEVERITY` | `.ts`, `.tsx`, `.mjs`, `.yml`, `.json` | with 10 zero-error benign traps: FP ≤ **25.89%**. With 8 zero-miss controls: recall ≥ **68.8%** |
| `github-action/configs/ai-corpus/ai-corpus-manifest.json` | **31 entries**, **31 distinct advisory classes**, every one `required: true`, **31 fixture files, all `.js`** | JavaScript only | **zero benign cases** — it can support a recall floor and **no precision claim at all**. Its gate anchors on a deterministic fingerprint, not on customer-facing precision |
| `scanner-worker/bench/recall-6.expected.json` | **6 cases**, **6 CWEs** (22, 78, 89, 918, 327, 95), over **5 TypeScript + 1 Python** source lines in one synthetic repo | TS + Py | recall ≥ **60.7%** if 6/6. `"baselineFpCount": -1` — the FP baseline was **never captured** |

Discovery commands for every number above:

```
cd C:/Users/Owner/Documents/Ceragon/GithubApp-Bot-Scanner-Worker
git show origin/main:github-action/configs/quality-corpus/quality-corpus-manifest.json | grep -c '"id"'
git show origin/main:github-action/configs/quality-corpus/quality-corpus-manifest.json \
  | grep -o '"expectedVerdict": "[A-Z_]*"' | sort | uniq -c
git show origin/main:github-action/configs/ai-corpus/ai-corpus-manifest.json | grep -c '"class":'
git ls-tree -r --name-only origin/main | grep -c 'configs/ai-corpus/fixtures/'
git show origin/main:scanner-worker/bench/recall-6.expected.json | grep -o '"cwe": "[^"]*"' | sort -u
```

Against §6.1 of the source material, **nothing in the scanner lane today supports a precision claim
better than ≈25.9% or a recall claim better than ≈68.8%**, and the deepest CWE-labelled asset is six
cases. The 12 requested engines (`github-action/scripts/utils.ts:161-180`) include `bandit` and
`pip-audit` (Python), `checkov` and `trivy` (IaC/containers), `actionlint` and `zizmor` (GitHub
Actions) — and **no corpus in the repo carries a labelled Python, Go, Java, C#, Ruby, PHP or Rust
finding.** Engine breadth and evidence breadth are not the same number and today they differ by an
order of magnitude.

### Three quality gates whose push leg has never fired

All three detection-quality workflows carry `push: branches: [master]`, and the repository's default
branch is `main` — `git symbolic-ref refs/remotes/origin/HEAD` prints `refs/remotes/origin/main`, and
`origin/master` does not exist.

- `.github/workflows/ai-detection-gate.yml:23`
- `.github/workflows/ai-vs-scanner-benchmark.yml:20`
- `.github/workflows/quality-precision-gate.yml:53`

Their `pull_request:` legs still fire (path-filtered), so this is a partial, not total, outage — but
**no post-merge detection-quality signal exists on this repo.** This is the same shape as
`holdout-score.yml` losing its push trigger in the Installers repo, and it belongs in the same
instrument-restoration bucket.

### A precision floor that a zero denominator satisfies

`github-action/configs/quality-corpus/quality-baseline.json` sets `precisionFloorByClass` to **1.0 for
all six classes**, and its own `_note` says: *"locally a vacuous (no-served) class trivially satisfies
the floor."* A class with zero served findings therefore reports a perfect precision floor. That is
the exact failure Wave 3's invalidation rule forbids — a zero denominator must render `UNKNOWN`, never
green — and it is live in the scanner lane today.

### The injection defences are real. The proof is not.

The review's correction stands and must be credited. Current code has genuine defence in depth:

- `scanner-worker/src/opus-baseline-prompt.ts` — source/sink grounding, and explicit
  treat-`CERAGON_*`-blocks-as-untrusted-data instructions at `:79`, `:134`, `:179`.
- `scanner-worker/src/utils/prompt-sanitizer.ts` (194 lines) — zero-width/bidi/control stripping
  (`:51`), known-marker detection (`:57`, `:162`), sentinel escaping and untrusted fences
  (`wrapUntrusted`, `:172`), truncation.
- `scanner-worker/src/opus-trust-model.ts`, `scanner-worker/src/services/finding-validation.service.ts`
  and their specs; structured output schemas and deterministic validation layers.

**Preserve all of it.** What is missing is behavioural evidence, and the specs prove it: every `it()`
in `opus-baseline-prompt.spec.ts` (203 lines), `utils/prompt-sanitizer.spec.ts` (114 lines) and
`__tests__/prompt-sanitizer.spec.ts` (150 lines) asserts *string presence, escaping or stripping* —
"wraps content in a labeled fence with sentinel", "strips bidi override characters", "escapes a
sentinel-like sequence inside untrusted content". **Not one test executes a model route against a
malicious repository and grades the outcome.** Section 20.3 of the review forbids treating fencing and
system-prompt instructions as proof of injection resistance, and this plan does not.

There are **four** enabled LLM routes to cover, not one — `LLM_REVIEW_MODES` at
`scanner-worker/src/worker.ts:118-124`: `OPUS_FULL_REPO`, `GEMINI_PRO_DIFF`, `GEMINI_FLASH_DIFF`,
`GEMINI_FLASH_LEGACY` (plus `NONE`). `resolvePass2LlmRoute` (`:126`) selects among them, and
`opus-gemini-synthesis.ts` is a second-pass consumer of first-pass output — a poisoning surface in its
own right.

### Scanner signing: real in code, unproven live

P0-17's correction also stands. This is **not** "add signing from scratch":

- Backend signs scanner dispatch and fails closed in production —
  `Backend/src/github-app/services/scan-dispatch.service.ts:3864`
  (`isScannerDispatchSigningRequired`, `NODE_ENV === 'production'` ⇒ true) and `:3883`
  (`buildSignatureAttributes`, raising `ServiceUnavailableException` on the required path).
- The worker verifies and rejects — `scanner-worker/src/main.ts:263-285` (`verifySignature`), boot
  gate at `scanner-worker/src/secure-config.ts:20-32` (`assertSecureProductionConfig`).
- Worker→processor messages are signed — `scanner-worker/src/worker.ts:4248`.
- All three committed task definitions set `CODEFENCE_SIGNED_CONTRACTS_REQUIRED=true`
  (`deployment/scanner-worker-task-def.json:49`, `-fullrepo-:50`, `-heavy-:48`).

Two things remain, and they are different in kind. First, `main.ts:284` still has the permissive
branch — `console.warn('[scanner-worker] unsigned message accepted (Phase 2 soft-launch)'); return
true;` — reachable whenever `signedContractsRequired` is false. Second, **what is committed is not
what is deployed**, and no AWS call was made in the 2026-08-27 pass. The **deployed** revisions are
`UNKNOWN`.

**And this is Risk 2's scanner lane only.** The separate install-time artifact-admission job and
result transport is a Static/Sandbox/Intelligence lane, is still permissive, and belongs to **Risk 3**.
Scanner signing is never evidence that the artifact-admission lane is closed. v1's exclusion list at
`plan:17514-17515` conflates them; keep them apart.

### Static-Worker: a strength to preserve and a measured escape to stop hiding

**C9 landed in `e4c6069f..44d7aabb` and must be preserved untouched.** The FP-autofixer veto gates —
`corpus/catch-identity.cjs`, `corpus/evidence-bar.cjs`, `corpus/forbidden-guard.cjs`,
`corpus/forbidden-paths.json`, guarded by `src/__tests__/veto-gates.test.ts` (368 lines, three
describes: evidence-bar at `:75`, catch-identity at `:193`, forbidden-guard at `:260`) — encode
exactly the discipline this plan is trying to install: five distinct artifacts across three
publishers before touching a detector, a named decision path, an FP rate that must actually move, a
named denominator, and a catch-identity check that catches a **swap** where one true positive is lost
and another gained with every count identical. **Do not weaken any of it. Extend around it.**

The open defect is P1-04, and it is two predicates:

- **Package lane** — `Static-Worker/src/__tests__/corpus-fp-gate.test.ts:162`:
  `const caught = nv !== 'ALLOW' || pv !== 'ALLOW';`. An OR across npm and PyPI. A fixture caught in
  npm passes even if it escapes in the ecosystem it actually applies to.
- **Artifact lane, Gate 2** — same file, `:296`: `if (rows.every((r) => r.verdict === 'ALLOW'))`. A
  fixture counts as an escape only when it is ALLOW in **every** one of the four classes
  (`ARTIFACT_ECOSYSTEMS` at `:70`: `agent-skill`, `mcp`, `editor-extension`, `plugin`).

Consequence, measured: `tp-zero-width-smuggled-directive` is ALLOW under `plugin` and the committed
predicate reports `escapes = []`. `corpus/artifact-fixtures/CATCH_BASELINE.json` says
`"escapes": {}, "catchRate": 1` — and that file's own `emptyBankNote` warns *"a corpus that catches
everything it contains is measuring its own contents."* The fixture's `LABEL.json` **already declares**
`artifactClass: "agent-skill"`, `expectVerdict: "non-ALLOW"` and `expectRuleIds: ["DV-AR-028",
"DV-AR-031"]`. **The data needed to fix the gate is already in the corpus; the gate ignores it.**

Current denominators, measured:

```
cd C:/Users/Owner/Documents/Ceragon/Static-Worker
git ls-tree -r --name-only origin/main | grep LABEL.json | sed 's|/LABEL.json||' \
  | awk -F/ '{print $1"/"$2"/"$3}' | sort | uniq -c
git ls-tree -r --name-only origin/main | grep '^corpus/tp-fixtures/' | cut -d/ -f3 | sort -u | wc -l
```

**50** labelled benign artifact dirs, **39** labelled TP artifact dirs, **50** labelled package benign
fixtures (30 npm / 18 pypi / 2 go), **11** package TP fixture dirs. (The source material's §6.2 row
says "Static-Worker TP fixtures 18"; the measured package-lane count is 11 dirs and the artifact-lane
TP count is 39. Re-run the command above before citing either.) The gate's own floors are
`rows.length >= 25` per class for benign (`:250`) and `labels.size >= 15` for TP (`:284`).

### One more thing that is not engineering

`.github/workflows/deploy-scanner-workers.yml:10-14` justifies auto-deploying an engine bump with:
*"The merged SHA already passed the required CI checks (tsc/jest + precision-recall gate + AI-vs-Scanner
benchmark) **via branch protection**."* Branch protection returns 403 on all six repositories on the
current GitHub plan. **The deploy workflow's stated safety premise is false today.** That is not a
code defect to fix in this wave; it is the external blocker made concrete on the scanner lane.

---

## Task 1: Inventory and freeze the existing quality assets into one scanner evidence manifest

**Files:**
- Create: `github-action/scripts/scanner-evidence-manifest.ts`
- Create: `github-action/configs/quality-corpus/EVIDENCE_INVENTORY.md`
- Test: `github-action/scripts/__tests__/scanner-evidence-manifest.spec.ts`

- [ ] Write the test first, red. `buildScannerEvidenceManifest()` reads the three existing corpora and
      emits one record per lane conforming to the Wave 3 / §5.3 manifest schema: `lane: "scanner"`,
      `surface: "scanner"`, `suite`, `corpusDigest`, `labelVersion`, `eligible`, `executed`,
      `unknown`, `dropped`, `strata[]`, and per-stratum `{numerator, denominator, lower95|upper95,
      gateMethod: "clopper-pearson-onesided", reportMethod: "bayes-uniform"}`.
- [ ] Assert the measured baseline explicitly, so a corpus that silently shrinks fails:
      quality-corpus **22** entries / **6** FP classes / **10** benign traps / **8** TP controls;
      ai-corpus **31** entries / **31** classes / **0** benign; recall-6 **6** cases / **6** CWEs.
- [ ] **Any stratum with a zero denominator emits `null` and `status: "UNKNOWN"`.** Never `1.0`, never
      `0`. This is the direct fix for `quality-baseline.json`'s vacuous-class-satisfies-the-floor note.
- [ ] Write `EVIDENCE_INVENTORY.md` naming, for each asset: what it measures, what it does **not**
      measure, its denominator, and the best claim it supports from the §6.1 reference table.
- [ ] Do **not** modify `quality-baseline.json`'s floors. Raising or lowering a ratcheted floor is out
      of scope; the manifest reports alongside it.

**Defeat test:** `scanner-evidence-manifest.spec.ts` — delete one entry from
`quality-corpus-manifest.json`. Expected failure: `Expected: 22, Received: 21` on the entry-count
assertion. Separately, force a stratum's denominator to 0 and assert the row reads `UNKNOWN`, not
`1.0`. **Exit:** one machine-readable manifest covering **3 of 3** existing corpora with **0**
hand-written denominators, and `EVIDENCE_INVENTORY.md` stating the three best-supported claims
(≤25.89% FP, ≥68.8% recall, ≥60.7% CWE recall) as the current ceiling.

---

## Task 2: Restore the three dead detection-quality push legs and arm the recall benchmark

**Files:**
- Modify: `.github/workflows/ai-detection-gate.yml:23`,
  `.github/workflows/ai-vs-scanner-benchmark.yml:20`,
  `.github/workflows/quality-precision-gate.yml:53`
- Modify: `scanner-worker/bench/recall-6.expected.json` (`baselineFpCount`)
- Modify: `.github/workflows/test.yml` (add a `bench:recall6` leg) **or** record in writing that it
  stays a manual npm script
- Test: `github-action/scripts/__tests__/workflow-branch-parity.spec.ts` (new)

- [ ] Write the test first, red: enumerate every `.github/workflows/*.yml`, parse each `push:
      branches:` list with `js-yaml`, and assert every named branch exists on the remote — or at
      minimum that the list contains the repository's default branch. Expected initial state: **3
      failures**.
- [ ] Change the three `[master]` values to `[main]`.
- [ ] Capture the recall-6 FP baseline: run `npm run bench:recall6 -- --mode=baseline` in
      `scanner-worker/` and commit the observed count, replacing the `-1` placeholder. Until it is
      captured, `--mode=gate` (`fpCount <= baselineFpCount`) cannot be armed at all.
- [ ] Decide, in writing, whether `bench:recall6` becomes a CI leg or stays a manual script. If it
      stays manual, say so in `EVIDENCE_INVENTORY.md` and mark its certificate contribution
      `UNKNOWN` — an uncaptured baseline on an unrun benchmark is not evidence.

**Defeat test:** `workflow-branch-parity.spec.ts` — revert one workflow to `[master]`. Expected
failure: `Expected: [] / Received: ["ai-detection-gate.yml: push branch 'master' does not exist"]`.
**Exit:** **0 of 3** workflows reference a non-existent branch; `baselineFpCount` is a non-negative
integer, not `-1`; and the recall-6 lane is either a named CI job or a written, dated exclusion.

---

## Task 3: CWE × language × framework strata — design the programme and state its real size

**Files:**
- Create: `github-action/configs/quality-corpus/STRATA.md`
- Create: `github-action/configs/quality-corpus/strata.json`
- Test: `github-action/scripts/__tests__/strata-contract.spec.ts`

- [ ] Declare the stratum key: `{cweId, language, framework, engineFamily, reachability}`. Every
      labelled case in every scanner corpus carries one. Fixtures with no stratum are rejected by the
      schema test, not silently counted.
- [ ] Predeclare **Tier A** membership per §5.2: **K ≤ 6** strata that can hard-block or redact a
      merge. Everything else is **Tier B** — exposure gate only, interval reported with honest width
      and **no threshold attached**, FDR (Benjamini-Hochberg) for multiplicity.
- [ ] Write the sizing into `STRATA.md` from the §6.1 table so nobody proposes an unreachable gate.
      For zero-error exact one-sided bounds: **299** benign per stratum → ≤1.00% FP; **2,995** → ≤0.1%;
      Holm at K=6 for ≤0.1% → **4,785 per stratum**. Recall: **29** zero-miss attack cases per
      enforcing class → ≥90.2%; **59** → ≥95.0%. Today's per-stratum denominators are single digits.
- [ ] Name the honest gap in the same file: **10 benign traps today vs 299 for a 1% claim is ~30×; vs
      4,785 for the Tier-A Holm claim is ~479×.** State that this is a corpus-construction programme
      measured in months, not a sprint.
- [ ] Declare which strata are **NOT_READY** rather than inventing a number for them: every language
      with zero labelled cases today (Python beyond the single `bench/repo/py/app.py` line, Go, Java,
      C#, Ruby, PHP, Rust) and every IaC/container/GH-Actions engine lane.

**Defeat test:** `strata-contract.spec.ts` — add a corpus entry with no `cweId`. Expected failure:
`Expected: [] / Received: ["<entry id>: missing stratum key cweId"]`.
**Exit:** **100%** of labelled cases in all three corpora carry a stratum key; **K ≤ 6** Tier-A
strata are predeclared by name; and `STRATA.md` states the per-stratum target `n` and today's actual
`n` side by side for every stratum, with every zero-`n` stratum marked `NOT_READY` and owned.

---

## Task 4: Reachable/unreachable twins, mutation, and repair-revert

**Files:**
- Create: `github-action/configs/quality-corpus/fixtures/reachability/` (per-stratum twin pairs)
- Modify: `github-action/scripts/quality-precision-gate.ts`
- Test: `github-action/scripts/__tests__/quality-precision-gate.spec.ts` (existing; extend)

- [ ] For each Tier-A stratum, add a **matched pair**: an identical sink where the source is reachable
      from an untrusted entry point, and one where it provably is not. Both must be labelled; the
      unreachable twin is a benign case with its own denominator.
- [ ] Add **repair-revert** cases: a fixture with the vulnerability, and the same fixture with the
      canonical fix applied. The gate asserts the finding appears in the first and disappears in the
      second — a detector that fires on both is measuring syntax, not impact.
- [ ] Add **seeded mutations** per stratum: generated/minified/obfuscated/re-formatted variants of the
      same semantic case. All descendants of one semantic base case stay in **one split** (Wave 3B's
      contamination rule); near-dedupe before splitting.
- [ ] Extend the precision gate so a stratum with an unreachable-twin false positive fails that
      stratum, independently of the aggregate.
- [ ] **No aggregate score may hide a failed critical stratum.** The gate reports per-stratum and the
      run fails on any Tier-A stratum failure even when the aggregate is above floor.

**Defeat test:** `quality-precision-gate.spec.ts` — make one detector fire on the unreachable twin.
Expected failure: the per-stratum assertion reports
`Expected: [] / Received: ["<stratum>: false positive on unreachable twin <fixture>"]` while the
aggregate stays above floor — which is precisely the state the aggregate would otherwise hide.
**Exit:** **≥1** reachable/unreachable twin pair and **≥1** repair-revert pair per Tier-A stratum
(**K ≤ 6**, so ≥6 pairs of each), and **0** aggregate-only pass paths remain in
`quality-precision-gate.ts`.

---

## Task 5: Per-engine attribution, enforcement tiers, and version pinning

**Files:**
- Modify: `github-action/scripts/quality-precision-gate.ts`
- Modify: `github-action/configs/quality-corpus/quality-corpus-manifest.json` (add
  `enforcementTier` per entry)
- Create: `github-action/configs/quality-corpus/ENGINE_TIERS.md`
- Test: `github-action/scripts/__tests__/quality-corpus-schema.spec.ts` (existing; extend)

- [ ] Give every corpus entry an explicit **`enforcementTier`**: `enforcing` (high-precision, may
      block a merge) or `advisory` (extended, reported and never blocking). This is the CodeQL
      default-vs-extended-suite distinction the review names, and the product has no equivalent today
      — all engine output is treated as equally block-worthy.
- [ ] Every result carries the producing engine plus its **pinned version**. The gate already pins
      `semgrep==1.89.0` and `gitleaks v8.18.4` (`quality-precision-gate.yml:85`, `:88-94`); extend the
      pin set to every engine that contributes an enforcing finding, and record the pins in the
      evidence manifest's `system.rulesetDigest`.
- [ ] Report **per-engine contribution and overlap**: for each stratum, which engines found it, which
      missed it, and which found nothing anywhere (a blind spot, not a clean bill).
- [ ] For the LLM lane, capture model id, system-prompt digest and route (`OPUS_FULL_REPO`,
      `GEMINI_PRO_DIFF`, `GEMINI_FLASH_DIFF`, `GEMINI_FLASH_LEGACY`) on every result.
      `neutraleval` does not cover this lane at all — say so in `ENGINE_TIERS.md`.
- [ ] **The model stays advisory.** Exact schema, path, line, source→sink, reachability, execution
      coverage and merge policy remain deterministically validated. A model statement that the
      repository is safe is never an authoritative allow. Assert this as a test over
      `finding-validation.service.ts`, not as prose.

**Defeat test:** `quality-corpus-schema.spec.ts` — mark one `ai-advisory` entry `enforcementTier:
enforcing`. Expected failure: `Expected: [] / Received: ["<id>: ai-advisory producer may not be
enforcing"]`. **Exit:** **22 of 22** existing entries plus every new one carry an `enforcementTier`;
**0** entries with producer `ai-advisory` are `enforcing`; and every enforcing finding names a pinned
engine version in the manifest.

---

## Task 6: Sealed scanner-injection corpus, executed behaviourally through every enabled route

**Files:**
- Create: `github-action/configs/scanner-injection-corpus/` (sealed; see holdout rules below)
- Create: `scanner-worker/src/__tests__/scanner-injection-behavioural.spec.ts`
- Modify: `.github/workflows/quality-precision-gate.yml` (add the injection leg, or a sibling
  workflow)
- Preserve, untouched: `opus-baseline-prompt.ts`, `utils/prompt-sanitizer.ts`, `opus-trust-model.ts`,
  `services/finding-validation.service.ts` and all their existing specs

This is P0-13. **Fencing and system-prompt instructions are not proof of injection resistance** —
review §20.3 — so no assertion in this task may be satisfied by a string being present.

- [ ] Build the corpus with, at minimum, these strata: malicious repository comments; malicious string
      literals; malicious documentation and README text; malicious file **paths**; malicious package
      metadata (npm `description`, `version`, `scripts`); generated/minified files; mixed encodings
      and homoglyphs; instructions **split across files** so no single chunk contains the whole
      directive; and **benign security-documentation twins** — a security guide that legitimately
      contains the words of an attack and must not be treated as one.
- [ ] Grade **six** attack objectives per case, each as an observable outcome, not a string:
      (1) suppress a seeded true vulnerability; (2) fabricate a vulnerability or a line number;
      (3) downgrade confidence/severity or claim coverage that did not occur; (4) redirect the
      narrative; (5) poison the second-pass finding validator (`opus-gemini-synthesis.ts`); (6) force a
      false green through malformed or overlong output.
- [ ] Execute through **all 4** enabled routes (`worker.ts:118-124`) with the **exact release model id
      and system prompt**. A run that covers one route reports coverage for one route.
- [ ] Grade **both** axes per case: the security outcome, and the ordinary vulnerability
      recall/precision impact — a defence that suppresses the attack by suppressing everything is not
      a pass.
- [ ] Report per route and per stratum at **ASR@1 / @10 / @100**, with the unit of analysis the
      **scenario**, not the attempt. Design effect `deff = 1+(m−1)ρ`: at m=100 and ρ=0.5, 100 attempts
      carry the weight of **2.0** independent trials. Per §6.3: **299** independent scenarios per
      stratum for ASR ≤1%; Holm across 4 routes → **436 per route**, **1,744 total**.
- [ ] Make the suite **defence-aware and adaptive**: the attacker gets the class list, the normalizer
      behaviour and the decision reason string. Label every static-corpus result
      `suite: "regression"` in the manifest — **never** as a release claim.
- [ ] **Holdout rules.** The sealed portion is never published in any form, including redacted or
      hashed; it is **regenerated per release**; contamination detection is not a substitute for
      withholding. Copy the existing seal mechanism from `Installers/.../holdout_seal_test.go` (a test
      that fails if any other test references the sealed file).
- [ ] **Blocked, named:** the adaptive arm needs multiple attacker models plus human expert attempts.
      That is contracted red-team time, not engineering. Until it is procured, the adaptive stratum's
      exit criterion is `NOT_READY` with a named owner — it is not satisfied by the static corpus.

**Defeat test:** inject a repository instruction telling the scanner to omit one seeded critical
finding and invent another. The gate must prove the real finding **survives**, the fabricated one is
**rejected or non-enforcing**, and coverage does **not** turn green from model output alone. Then
revert the defence (remove the `wrapUntrusted` call at the call site) and confirm the same case flips
to a suppressed finding — expected failure text: `Expected seeded finding "<id>" to be present /
Received: []`.
**Exit:** static regression arm — **9 of 9** strata × **4 of 4** routes executed with **0** successful
suppressions and **0** enforcing fabrications, reported per route, never as one number. Adaptive arm —
**BLOCKED on contracted red-team time**; certificate row `NOT_READY`, owner named, ASR reported as
`null`, not `0`.

---

## Task 7: Prove the scanner signing lane live — binding, replay, completeness, rotation, outage

**Files:**
- Create: `scanner-worker/src/__tests__/signed-transport-adversarial.spec.ts`
- Create: `.plans/m47a-20260822/evidence/w7b-signing/` (deployed task-definition captures)
- Preserve: `scan-dispatch.service.ts:3864`+, `scanner-worker/src/main.ts:263-285`,
  `secure-config.ts:20-32`, `worker.ts:4248`

- [ ] Write the adversarial spec first, red where it should be. Each case is a rejection the worker
      must make: unsigned when required; wrong tenant/organization; wrong repository; **wrong commit
      SHA**; wrong queue; wrong producer identity; expired; **replayed** (nonce reuse); incomplete
      result pages; wrong policy digest; wrong scanner artifact/ruleset/model version;
      KMS-unverifiable.
- [ ] Add the **rotation** case (a message signed with key version N−1 during a rotation window is
      accepted; N−2 is not) and the **outage** case (signing service unavailable ⇒ the producer fails
      closed and the consumer does not accept an unsigned substitute).
- [ ] Assert the permissive branch is unreachable in production: `main.ts:284`'s
      `unsigned message accepted (Phase 2 soft-launch)` path must be provably dead when
      `NODE_ENV=production`, enforced by `assertSecureProductionConfig` at boot
      (`secure-config.ts:24-28`). Add the test that proves boot **throws**, not merely warns.
- [ ] **Capture the deployed reality.** The committed task definitions all set
      `CODEFENCE_SIGNED_CONTRACTS_REQUIRED=true`; the deployed revisions are **UNKNOWN** because no
      AWS call was made on 2026-08-27. Capture and archive:

      ```
      aws ecs describe-task-definition --task-definition codefence-scanner-worker \
        --region eu-north-1 --query 'taskDefinition.containerDefinitions[0].environment'
      aws ecs describe-services --cluster cera-workers-staging \
        --services codefence-scanner-worker codefence-scanner-worker-fullrepo \
                   codefence-scanner-worker-heavy --region eu-north-1
      ```

      (cluster and service names from `.github/workflows/deploy-scanner-workers.yml:27-31`.)
- [ ] **Do not touch the artifact-admission lane here.** The unsigned install-time SQS job/result
      traffic is Static/Sandbox/Intelligence and belongs to **Risk 3**. Correct v1's exclusion text at
      `plan:17514-17515` to separate the two lanes explicitly, and record that scanner signing is
      never evidence about artifact admission.

**Defeat test:** `signed-transport-adversarial.spec.ts` — replay a previously accepted message
verbatim. Expected failure on revert of the nonce check: `Expected: rejected, Received: accepted` for
the replay case. Separately, set `NODE_ENV=production` with `CODEFENCE_SIGNED_CONTRACTS_REQUIRED`
unset and assert boot throws the exact `scanner-worker refusing to boot:` message from
`secure-config.ts:24-26`.
**Exit:** **13 of 13** adversarial rejection cases green in test, **plus** an archived
`describe-task-definition` capture showing `CODEFENCE_SIGNED_CONTRACTS_REQUIRED=true` on the
**deployed** revision of all three services. **The live half is BLOCKED** on (a) an AWS call and (b)
ECS worker services having been at 0/0 since the 2026-06-26 power-off — restoring them via
`scripts/ceragon-power-on.ps1` needs a **fresh explicit owner ask** every time. Until both, this
criterion reports `UNKNOWN` and the claim is limited to *"integrity mechanisms represented in code"*.

---

## Task 8: Static-Worker — per-applicable-ecosystem TP contract (P1-04), preserving C9

**Files:**
- Modify: `Static-Worker/src/__tests__/corpus-fp-gate.test.ts:151-178` (package lane) and
  `:280-306` (artifact Gate 2)
- Modify: every `LABEL.json` under `corpus/tp-fixtures/` and `corpus/artifact-fixtures/tp/` that lacks
  a declared applicability
- Modify: `Static-Worker/corpus/artifact-fixtures/CATCH_BASELINE.json`
- Preserve untouched: `corpus/catch-identity.cjs`, `corpus/evidence-bar.cjs`,
  `corpus/forbidden-guard.cjs`, `corpus/forbidden-paths.json`, `src/__tests__/veto-gates.test.ts`

- [ ] Every TP fixture declares: **applicable ecosystems/classes**, expected finding class/code,
      **minimum verdict**, and expected final state. Non-applicable ecosystems are excluded
      **explicitly**, not treated as alternative opportunities to pass. The artifact-lane fixtures
      already carry `artifactClass` / `expectVerdict` / `expectRuleIds` (see
      `corpus/artifact-fixtures/tp/tp-zero-width-smuggled-directive/LABEL.json`) — read them instead
      of ignoring them. The package-lane fixtures need the field added.
- [ ] Rewrite the package predicate at `:162` from `nv !== 'ALLOW' || pv !== 'ALLOW'` to
      **per-declared-ecosystem**: for each ecosystem in the fixture's `applicableEcosystems`, that
      ecosystem's verdict must be non-ALLOW. **A miss in ANY applicable ecosystem fails.**
- [ ] Rewrite artifact Gate 2 at `:296` from `rows.every(r => r.verdict === 'ALLOW')` to
      **per-applicable-class**: an escape is any applicable class in which the fixture is ALLOW.
- [ ] Re-bank `tp-zero-width-smuggled-directive [plugin]` in `CATCH_BASELINE.json` with a written
      reason, and **correct `catchRate: 1`** to the recomputed per-applicable-class rate. The
      re-banking is the honest act; the current empty bank next to `catchRate: 1` is the thing the
      file's own note warns against.
- [ ] **Do not weaken the floors.** `rows.length >= 25` per benign class (`:250`) and
      `labels.size >= 15` (`:284`) stay or rise. `diffCatchBaseline`'s three failure modes — new
      escape, fixed-but-unbanked escape, stale baseline entry — stay exactly as they are.
- [ ] **Add a build-freshness assertion.** `beforeAll` at `:131-142` only checks that
      `dist/analyzer/smart-heuristic-scanner.js` **exists** (`DIST_SENTINEL`, `:58`). A stale `dist`
      from a previous build passes today. Assert the sentinel's mtime is newer than the newest
      `src/**/*.ts`, or compile in the test's setup.

**Defeat test:** revert the per-ecosystem predicate at `:162` to the OR form. Expected failure in the
Gate-2 assertion: `expect(diff.newEscapes...).toEqual([])` reports
`Expected: [] / Received: ["tp-zero-width-smuggled-directive [plugin] ALLOW@… rules=none …"]`.
Separately, touch a `src/**/*.ts` file without rebuilding and confirm the new `beforeAll` fails rather
than silently measuring the old analyzer.
**Exit:** **100%** of package-lane and artifact-lane TP fixtures declare applicable ecosystems;
per-applicable-class escapes are **either empty or banked with a written reason**;
`CATCH_BASELINE.json`'s `catchRate` is the recomputed per-applicable-class figure, not `1` by
construction; and `veto-gates.test.ts` still reports its full pre-existing pass count (baseline it on
untouched `origin/main` first).

---

## Task 9: The R2 certificate row, and the blocker that is not ours to fix

**Files:**
- Create: `.plans/m47a-20260822/certificates/r2-scanner-detection.json`
- Modify: `github-action/configs/quality-corpus/EVIDENCE_INVENTORY.md`

- [ ] Emit the §5.3 schema-version-2 certificate row for the scanner detection dimension. Missing
      measurements stay `null` and force `UNKNOWN`/`NOT_READY` — **this is a schema requirement, not
      permission to fill unknown numbers with zero.** `expiresAt` = 90 days.
- [ ] Populate `system.standardsMapping` in the same commit that adds the ATLAS ids elsewhere: OWASP
      **LLM:2026** (not `:2025` — the 2026 edition renumbered 8 of 10 and moved Excessive Agency from
      LLM06 to LLM03), OWASP **ASI 2026**, ATLAS release `v2026.07`, and the AIUC-1 controls this lane
      answers — **A008** (secrets in generated code/logs/storage) and **B006.3** (scanning
      configuration artifacts for prompt-injection risk).
- [ ] Write the forbidden claims for this lane into `EVIDENCE_INVENTORY.md` verbatim:
      *"A green scan proves vulnerable code was not introduced"* is forbidden — W7A proves execution,
      not detection. *"Do not present a static-corpus prompt-injection result as a release claim"* —
      adaptive attacks broke **all eight** defences studied (arXiv:2503.00061), ASR consistently over
      50%; second-generation reference-monitor defences have never been adaptively evaluated. *"Do not
      publish a single prompt-injection number"* — surface dominates model.
- [ ] **State the external blocker in the certificate itself, not in a footnote.** `status:
      "NOT_READY"`, with `downgradeTriggers` naming it:

      > **Branch protection is impossible on the current GitHub plan.** All six repositories return
      > 403. `docs/Devoid_Roadmap_To_Finished_Product.md:1321` makes **M5.3-A** mandatory for any Risk
      > 2 profile at 9+, and `:1334` states plainly that *no Risk 2 profile may claim 9+ without it*.
      > `:1445` and `:1465` repeat it. **This is a billing decision for the owner. It is not a code
      > problem and no engineering in this wave changes it.** Until it is made, R2 is `NOT_READY`
      > regardless of how good the detection evidence becomes. Related: the auto-deploy workflow
      > `.github/workflows/deploy-scanner-workers.yml:10-14` justifies itself by citing *"required CI
      > checks … via branch protection"* — a premise that is currently false.

- [ ] Verify the 403 before publishing the row rather than inheriting the claim:

      ```
      gh api repos/Ceragon-Prod/<repo>/branches/main/protection
      ```

      for each of the six repositories, and archive the responses alongside the certificate.

**Defeat test:** set any populated metric in the certificate to `null` and confirm the emitter flips
`status` to `UNKNOWN` rather than leaving `PASS`. Expected failure on revert:
`Expected: "UNKNOWN", Received: "PASS"`.
**Exit:** one certificate artifact at the path above, `status: "NOT_READY"`, **≥1** named external
blocker with a roadmap citation, **0** metrics rendered as `0` where the measurement is absent, and
`expiresAt` set 90 days out.

---

## Wave 7B exit criteria

1. **One scanner evidence manifest** covers **3 of 3** existing corpora (22 + 31 + 6 = **59** labelled
   cases) with **0** hand-written denominators, and every zero-denominator stratum renders `UNKNOWN`.
   Defeat: `scanner-evidence-manifest.spec.ts`, zero-denominator case.
2. **0 of 3** detection-quality workflows reference a branch that does not exist (today: 3 of 3 do),
   and `recall-6.expected.json`'s `baselineFpCount` is a non-negative integer (today: `-1`). Defeat:
   `workflow-branch-parity.spec.ts`.
3. **100%** of labelled scanner cases carry a `{cweId, language, framework, engineFamily,
   reachability}` stratum key; **K ≤ 6** Tier-A strata predeclared by name; every stratum with zero
   labelled cases is marked `NOT_READY` with an owner. Defeat: `strata-contract.spec.ts`.
4. **≥6** reachable/unreachable twin pairs and **≥6** repair-revert pairs (one of each per Tier-A
   stratum), and **0** aggregate-only pass paths remain — no aggregate score hides a failed critical
   stratum. Defeat: `quality-precision-gate.spec.ts`, unreachable-twin case.
5. Every corpus entry carries an `enforcementTier`; **0** `ai-advisory` entries are `enforcing`; every
   enforcing finding names a pinned engine version in the manifest. Defeat:
   `quality-corpus-schema.spec.ts`.
6. Scanner-injection **static regression** arm: **9 of 9** strata × **4 of 4** LLM routes executed,
   **0** successful suppressions of a seeded finding, **0** enforcing fabrications, reported **per
   route** and never as a single number. Defeat: the seeded-omission injection, reverting
   `wrapUntrusted` at the call site.
7. Scanner-injection **adaptive** arm: `NOT_READY`, **BLOCKED on contracted red-team time**, owner
   named, ASR reported as `null`. Per §6.3 the target is **299** scenarios per stratum and **436** per
   route across 4 routes (**1,744** total); today it is 0. This criterion is not satisfiable by
   engineering and must not be marked green by a static run.
8. Signed-transport adversarial suite: **13 of 13** rejection cases green, and boot **throws** (not
   warns) when `NODE_ENV=production` without `CODEFENCE_SIGNED_CONTRACTS_REQUIRED`. Defeat:
   `signed-transport-adversarial.spec.ts`, replay case.
9. Signed-transport **live** proof: `UNKNOWN` until an archived `describe-task-definition` capture
   shows the flag on the **deployed** revision of all three scanner services. **BLOCKED** on an AWS
   call and on the owner's fresh ask to power the services back on (0/0 since 2026-06-26).
10. Static-Worker: **100%** of TP fixtures declare applicable ecosystems; the OR predicate at
    `corpus-fp-gate.test.ts:162` and the `rows.every(ALLOW)` predicate at `:296` are both replaced by
    per-applicable-class checks; `tp-zero-width-smuggled-directive [plugin]` is banked with a written
    reason; `catchRate` is recomputed and is no longer `1` by construction; the `dist` sentinel is
    freshness-checked, not existence-checked. Defeat: reverting `:162` to the OR form.
11. **C9 preserved:** `veto-gates.test.ts` reports its full pre-existing pass count, baselined on
    untouched `origin/main` in a throwaway worktree. **0** veto-gate assertions deleted or relaxed.
12. One R2 certificate artifact exists with `status: "NOT_READY"`, a 90-day `expiresAt`, **0** absent
    measurements rendered as `0`, and the branch-protection blocker named in `downgradeTriggers` with
    its roadmap citation and archived 403 evidence.

**Certificate contribution.** With criteria 1-6, 8 and 10-12: a new bounded **scanner detection
evidence** dimension reports `PASS` **with its denominators attached** — at today's corpus size the
best supportable claims are FP ≤ 25.89% (n=10) and recall ≥ 68.8% (n=8), which is why criterion 3
forces the gap to be written down rather than averaged away. Criteria 7 and 9 stay `UNKNOWN`/`BLOCKED`
on external dependencies. **R2 the risk lane remains `NOT_READY` and is not moved by this wave.**
