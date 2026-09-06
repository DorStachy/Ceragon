# W7C Task 1 — C11 and C12 confirmed GUARDED

Recorded 2026-09-04. Every number below was printed by a run, not asserted by hand. Two guards were
already implemented and already tested; this task pins them, names the test Wave 8 could not name,
removes a contradictory measurement, and closes the pre-merge gap.

Worktrees used:

- `C:\cwt\p47-w7c-intel` — Ceragon-Intelligence, branch `p47/w7c-platform`
- `C:\cwt\p47-w7c-sbx` — Sandbox-Worker, branch `p47/w7c-containment`

---

## 1. Drift check — re-run before starting, as the wave file requires

### Ceragon-Intelligence

```
$ git rev-parse HEAD
ce28c62b8f3cb4cc228be8ae096b4204ceeaaeb5

$ git rev-list --count 486d937b..origin/main
15                      # before fetch

$ git fetch origin
   ce28c62..b7e9f27  main -> origin/main

$ git rev-parse origin/main
b7e9f27c7d030d99a45a277fd40727967799f29c

$ git rev-list --count 486d937b..origin/main
18                      # after fetch

$ git log --oneline 486d937b..origin/main -- '*os-target-classifier*'
                        # EMPTY

$ git merge-base --is-ancestor 486d937b HEAD && echo yes
yes
$ git merge-base --is-ancestor deb70e64 HEAD && echo yes
yes
```

**The wave file's own SHA has moved and its own invalidation condition has not fired.** It recorded
Intelligence at `deb70e64`, five commits ahead of the manifest SHA `486d937b`, on 2026-08-28. Today
`origin/main` is `b7e9f27c`, **eighteen** commits ahead. Both `486d937b` and `deb70e64` remain
ancestors, and the `os-target-classifier` path filter is **still empty**, so every C11 line citation
below holds at the manifest SHA, at `deb70e64`, and at today's `origin/main`. The count is stale;
the citations are not.

The worktree is at `ce28c62`, three commits behind today's `origin/main`; none of the three touch
the classifier.

### Sandbox-Worker

```
$ git rev-parse HEAD origin/main
496073fe3887e1605610798dbed9852824a8b047
496073fe3887e1605610798dbed9852824a8b047

$ git rev-list --count 2831997d..origin/main
1

$ git log --oneline 2831997d..origin/main -- 'src/platform-mismatch.ts' 'tests/platform-mismatch*' \
      'src/telemetry/sandbox-runner.ts' 'src/job-processor.ts' 'src/verdict-routing.ts'
                        # EMPTY

$ git diff --name-only 2831997d..origin/main
src/extractor/artifact-extractor.ts
tests/extractor/artifact-extractor.tar.test.ts
tests/fixtures/agent-skill-rag-perf.tar
```

One commit ahead of the manifest revision, and it touches none of the files this wave cites.

---

## 2. C11 — Go-module Windows routing: **GUARDED**

`Ceragon-Intelligence/src/routing/os-target-classifier.ts`, section 6b.

Every claim in the wave file was checked against the tree and every one held at the stated line:

| Claim | Verified |
|---|---|
| `:374` predicate `p.endsWith('_windows.go') \|\| p.includes('/windows/')` | yes, exactly |
| `:376-378` non-Windows side (`_linux.go`, `_darwin.go`, `_unix.go`) | yes |
| `:349` states winrt-go as 62-of-77 `_windows.go` | yes — the stale sentence, now fixed |
| `:370-371` states winrt-go as 62-of-77 under `/windows/`, zero `_windows.go` | yes |
| 6 Go-lane cases at `test.ts:102, 111, 121, 131, 140, 151` | yes, all six |

### The run — 6 of 6

```
$ node node_modules/jest/bin/jest.js src/routing/__tests__/os-target-classifier.test.ts --runInBand --verbose -t "Go"

PASS src/routing/__tests__/os-target-classifier.test.ts
  classifyOsTarget
    √ routes a Go module of _windows.go build-constraint files to windows (8 ms)
    √ routes a Go module whose packages live under /windows/ to windows
    √ keeps a cross-platform Go module (windows AND unix constraints) on either (1 ms)
    √ keeps a Go module with both /windows/ and /unix/ package dirs on either
    √ does not treat a package merely NAMED windows-* as a Windows Go module (1 ms)
    √ ignores non-.go files when counting Go build constraints

Tests:       10 skipped, 6 passed, 16 total
```

Whole-directory run for context: `node node_modules/jest/bin/jest.js src/routing --runInBand` →
**3 suites, 42 of 42 tests passed.**

### Defeat run — reproduced

Mutation: `os-target-classifier.ts:374` reverted to the suffix-only predicate
`const isGoWin = p.endsWith('_windows.go');`

```
  × routes a Go module whose packages live under /windows/ to windows (16 ms)
  × keeps a Go module with both /windows/ and /unix/ package dirs on either (3 ms)

  ● classifyOsTarget › routes a Go module whose packages live under /windows/ to windows
    Expected: "windows"
    Received: "either"
      at src/routing/__tests__/os-target-classifier.test.ts:118:22

  ● classifyOsTarget › keeps a Go module with both /windows/ and /unix/ package dirs on either
    Expected: "either"
    Received: "linux"
      at src/routing/__tests__/os-target-classifier.test.ts:137
```

The first red is exactly the one the wave file predicts. **The second was not predicted** — the
`/windows/` half of the predicate is load-bearing for two of the six cases, not one, and the second
one fails in the *over*-routing direction (a cross-platform module misread as Linux-only). Mutation
reverted; `git status` clean afterwards; the suite re-run green.

---

## 3. C12 — platform-mismatch coverage fold: **GUARDED**

`Sandbox-Worker/src/platform-mismatch.ts`. Verified: **213 lines**, `detectPlatformMismatch` at
`:179`, `foldPlatformCoverage` at `:204`, `if (platformMismatched) return false;` at `:208`,
`PLATFORM_MISMATCH_FINDING_CODE = 'SANDBOX_SKIPPED_PLATFORM_MISMATCH'` at `:213`. Every line number
in the wave file is correct.

### The run — 25 of 25

```
$ node node_modules/jest/bin/jest.js tests/platform-mismatch.test.ts tests/platform-mismatch-routing.test.ts --runInBand

PASS tests/platform-mismatch.test.ts (8.969 s)          20 cases
  npm os field                       9
  pypi wheel platform tag            7
  detectPlatformMismatch dispatch    2
  foldPlatformCoverage               2
PASS tests/platform-mismatch-routing.test.ts             5 cases

Test Suites: 2 passed, 2 total
Tests:       25 passed, 25 total
```

### Defeat run — reproduced

Mutation: `platform-mismatch.ts:208`, the `if (platformMismatched) return false;` early return
deleted.

```
  × forces coverage to false on a mismatch, whatever the base was (3 ms)
    Expected: false
    Received: true
  × with the fold, the same clean run becomes INCONCLUSIVE / COVERAGE_GAP (4 ms)
    Expected: false
    Received: true

Tests:       2 failed, 23 passed, 25 total
```

Exactly the failure the wave file predicts, at `platform-mismatch-routing.test.ts:44`.

**The discriminating pair held.** `:39` — *"BASELINE: without the fold, a clean run PROCEEDs — this
is the ALLOW being laundered"* — stayed **green** under the mutation, and so did the
no-mismatch case at `:72` and the undeclared-coverage case at `:86`. Only the two assertions that
claim the dishonest case is caught went red. A one-sided assertion would have reddened everything or
nothing. Mutation reverted; `git status` clean; suite re-run green.

---

## 4. The name Wave 8 Task 11 is missing — entry 7, and entry 7 only

Wave 8's claimable list asserts, with no named test:

> *"a Linux sandbox run does not vouch for a non-Linux payload, on the npm and PyPI ecosystems"*

**Evidenced by `Sandbox-Worker/tests/platform-mismatch-routing.test.ts:44`** —
*"with the fold, the same clean run becomes INCONCLUSIVE / COVERAGE_GAP"* — with **`:39`** as its
paired baseline (*"BASELINE: without the fold, a clean run PROCEEDs — this is the ALLOW being
laundered"*). The pair is what makes it a measurement rather than an assertion: the baseline holds
its value while only the folded case changes.

**The ecosystem qualifier rides the sentence and is not decoration.** `tests/platform-mismatch.test.ts`
contains the dispatch case *"leaves cargo and go alone — the toolchain gate already covers those
runs"*, so cargo and Go are deliberately outside this guard. The unqualified form of the sentence
overstates what the test proves.

**This closes entry 7 and nothing else.** Wave 8's list carries 8 candidate sentences; entry 3
(tool-shadow capture) and entry 8 (the 15/52 prompt-lane figure, which D18 forbids publishing until
Wave 3 repairs the instrument) remain in its `pending` block and are Wave 8's to close. The list is
**not** fully bound and nothing here reports it as such.

---

## 5. The contradictory comment — fixed

`os-target-classifier.ts` stated one measurement two ways. `:349` said winrt-go *"is 62-of-77
`_windows.go` files"*; `:370-371` said it is *"62-of-77 files under `/windows/` and ZERO
`_windows.go`"*. The second is what the code implements and what the test at `:111` proves; the
first would have told a reader the suffix check alone was sufficient, which is precisely the
deletion the defeat run above shows breaks two tests.

The stale sentence now defers to the measurement instead of restating it:

```
$ grep -n "62-of-77" src/routing/os-target-classifier.ts
372:    // `golang.org/x/sys/windows`, and `saltosystems/winrt-go`, which is 62-of-77
```

**One occurrence, one characterisation.** Comment text only — `git diff` confirms every changed line
begins with `//`, the predicate is byte-identical, and the 42-test routing suite is unchanged green.

Commit: `93c818c` (Ceragon-Intelligence, `p47/w7c-platform`).

---

## 6. The pre-merge gap — closed in code, NOT_READY in fact

`Sandbox-Worker/.github/workflows/build-and-deploy.yml` declared `on: push: branches: [main]` and
`workflow_dispatch` only — verified, and it is the repo's **only** workflow file. `npm test --
--runInBand` runs at `:69-70`, and the AWS credential, ECR push and two ECS deploy steps run at
`:82-138` **in the same job**. So C12's guard ran after the merge, in the same run that deployed.

**Fixed by adding `.github/workflows/pr-checks.yml`** — `on: pull_request: {}` plus
`workflow_dispatch`, carrying the install, both audits, build, test, task-definition policy gate and
worker-result contract gate. `build-and-deploy.yml` is **unchanged**.

It is a separate file rather than a `pull_request:` trigger on the deploy workflow for two concrete
reasons, both verified by parsing the two files:

| | `build-and-deploy.yml` | `pr-checks.yml` |
|---|---|---|
| permissions | `contents: read`, **`id-token: write`** | `contents: read` only |
| concurrency group | `sandbox-worker-deploy`, cancel-in-progress | `sandbox-worker-pr-<pr>`, cancel-in-progress |
| AWS / ECR / deploy steps | 6 | **0** |

Adding a pull-request trigger to the deploy workflow would have put PR runs in the same
cancel-in-progress group as a live production deploy, and would have left six deploy steps one
missing `if:` away from firing on a pull request. The split makes that structurally impossible: the
PR workflow has no OIDC permission and no credentials step.

Deliberately **not** triggered on `push: [main]` — the deploy workflow already runs every one of
these steps there, and duplicating them would double billed minutes for no extra coverage.

Commit: `259f3d0` (Sandbox-Worker, `p47/w7c-containment`).

### Status: `NOT_READY` — withdrawn by owner decision 2026-09-04

**GitHub CI billing is withdrawn** (`D_OWNER_20260904_EXTERNAL_SCOPE_WITHDRAWN.md`: *"Nothing runs
automatically on merge"*). The trigger is committed, correct and ready, and **it has not fired and is
not claimed to have fired.** No GitHub run exists for it.

**C12's pre-merge contribution is therefore recorded `UNKNOWN`**, not PASS and not FAIL. The guard is
proven to work (25 of 25, defeat reproduced); whether it gates a merge is unmeasured, because the
mechanism that would gate the merge is not running. That is an absent measurement, not a zero.

---

## 7. Wave 7C exit criteria 1-5

| # | Criterion | State |
|---|---|---|
| 1 | C11 GUARDED, 6 of 6 Go-lane cases, `/windows/` reversion red | **PASS** — 6 of 6; defeat reproduced, and a second unpredicted red found |
| 2 | C12 GUARDED, 25 of 25, `foldPlatformCoverage` reversion red | **PASS** — 25 of 25; defeat reproduced, baseline held |
| 3 | Wave 8 entry 7 names a test | **PASS** — `platform-mismatch-routing.test.ts:44`, `:39` paired. Entries 3 and 8 remain Wave 8's |
| 4 | winrt-go measurement stated once | **PASS** — one occurrence, `grep` output above |
| 5 | Test leg runs on `pull_request` | **Committed; `NOT_READY` / `UNKNOWN`** — CI billing withdrawn by owner decision 2026-09-04 |

**R3 is not moved by any of this.** Nothing in Task 1 touches a risk lane.
