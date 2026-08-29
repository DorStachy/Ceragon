> ## ⚠ READ FIRST — THIS PROGRAMME RUNS IN PARALLEL WITH ANOTHER ONE
>
> A second plan is being implemented **at the same time, by a different agent team, in a different
> chat session.** The two plans share **28 source files** and several resources that have no file
> conflict at all and will still destroy each other's work: one agent release channel, one production
> Backend, one live-proof register, one `pr-checks.yml`.
>
> **Before your first task, read
> [`.plans/PARALLEL_EXECUTION_CONTRACT.md`](../../PARALLEL_EXECUTION_CONTRACT.md).** It names the owner
> of every shared file, the append-only protocol for the shared scoreboards, the serialised
> owner-gated release procedure, and the handshake file for anything you need from the other side.
>
> Three rules that will not be obvious from inside a task:
> 1. **If your task seems to need a file this programme does not own, it does not.** Post a seam
>    request to the handshake and switch tasks. Do not make "a small edit" in the other programme's
>    directory.
> 2. **Never cut an agent release or request a Backend deploy on your own authority.** A release now
>    carries both programmes' merged work. One team releasing alone ships the other team's
>    half-finished work to every endpoint.
> 3. **Append, never rewrite,** in `internal/liveproof/register.json`, the Codex ledger, and
>    `pr-checks.yml`. A reformat by one team turns every later diff into a conflict.
>

# M4.7A revised plan — Waves −1, 0A and 0

Three sections, in execution order. Wave −1 runs first and is mandatory. Wave 0A is the only item in
the whole packet with live customer impact today. Wave 0 is the old plan's Wave 0 (`plan:150-1246`),
preserved, with its premise re-verified and three corrections applied.

**Every source claim below was resolved against `origin/main` on 2026-08-28**, using
`git show origin/main:<path>` rather than the working tree — every checkout in this workspace is
between 20 and 1,010 commits behind its remote and reading the working tree gives the wrong file.
The measured regex results are from a compiled Go probe, not from reading the pattern.

---

# Wave −1 — Rebase, authority regeneration, and claim contract

**Depends on:** nothing. Nothing else in this packet may start until Task 1 and Task 2 are done.
**Implements decisions:** — (new wave; no row in either decision table). If the revised decision
table adds rows for it, cite them here and nowhere else: D-numbers collide between the roadmap
M4.7A list and the plan M4.7A list, and a bare "D3" is ambiguous across the two.
**Certificate impact:** all five risk lanes stay **NOT_READY** — that is this wave's *output*, not a
side effect. It gates the *measurement-substrate integrity* dimension: until the claim contract and
the generated catalogs exist, every number downstream is `UNKNOWN` by construction.

## Context an engineer needs

**The workspace is not the source.** Verified 2026-08-28, from the local remote-tracking refs (last
fetched by the 2026-08-27 disposition pass):

| Repo | local HEAD (branch) | `origin/main` | commits behind |
|---|---|---|---|
| `Backend` | `15dd89bae54d` (`fix/remote-uninstall-command-timeout`) | `0cf9021e944b` | 773 |
| `Frontend` | `1fe6e7a609de` (`feat/font-geist`) | `cac574ae063b` | 525 |
| `Installers` | `8e49a6251bf5` (`fix/remote-uninstall-privileged-daemon`) | `5b12952307db` | 1010 |
| `Ceragon-Intelligence` | `58404e0a3db5` (`feat/push-depth-cli-ui`) | `deb70e647794` | 173 |
| `Static-Worker` | `a7326106e71c` (`feat/install-gate-scan-quality`) | `44d7aabb8b84` | 75 |
| `Sandbox-Worker` | `1a9072538e09` (`chore/cleanup-unnecessary-files`) | `2831997dfe84` | 67 |
| `GithubApp-Bot-Scanner-Worker` | `ed9209996148` (`codex/m42-scanner-reliability`) | `3d4116a5e5b1` | 20 |

**The spine's rebase manifest is already one row stale, and this is not a hypothetical.** It records
Ceragon-Intelligence at `486d937b`. The fetch run while editing this file on 2026-08-28 printed
`486d937b..deb70e64` — five new commits. The spine's own standing rule covers exactly this (*"if your
`git fetch` disagrees with this table, the instructions below are invalid until revalidated"*), and it
is the reason Task 1 is a generator and a standing rule rather than a table someone maintains. No
citation in this packet lives in Ceragon-Intelligence, so nothing here is invalidated by that move —
but the next reader must re-run the generator rather than trust this paragraph either.

Not one checkout is on `main`. Not one is at `origin/main`. **`sed -n '122p' internal/toolrisk/toolrisk.go`
in the Installers working tree returns a different line than the same command against `origin/main`** —
that single fact invalidates any hand-checked citation in this packet that was taken from a working tree.

**A handed-down SHA list is not evidence.** The 2026-08-27 disposition exercise was given a SHA list
that was wrong for four of seven repos — Installers by 1, Intelligence by 20, and Static-Worker and
Sandbox-Worker were labelled UNCHANGED when the fetch printed `e4c6069f..44d7aabb` and
`d68ee58..2831997` on the spot. That is review finding P0-02 recurring *inside* the exercise that was
dispositioning it. The rule below is therefore a standing rule, not a one-time step.

**Two instruments stopped gating and nobody noticed, because both files still describe the trigger
they lost.**
- `Installers/.github/workflows/holdout-score.yml` is 89 lines. `on:` is at **:22-25** and reads
  `workflow_dispatch: {}` + `schedule: cron '17 3 * * *'`. Its own header at **:6** still says
  *"This runs on PUSH TO MAIN and NIGHTLY"*. The push trigger was removed on 2026-08-25 as a cost
  gate. Its header also states at **:13** that *"The job does NOT gate on a rate threshold today."*
  The only automated detector-quality instrument in the workspace is therefore a non-gating nightly
  report.
- `Frontend/.github/workflows/vendored-upstream-drift.yml` is 73 lines. `on:` is at **:39-43** —
  `workflow_dispatch` + `cron "15 6 * * *"`. Its header at **:29-31** carries a written instruction:
  *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the SAME change that re-vendors the
  files."* T-M2 landed (`MANIFEST.json` pin is now `254d24fc`). The trigger did not.
  **Owned by Wave 5 Task 9**, which splits it into a blocked Half A (the `pull_request:` trigger) and
  an unblocked Half B (an offline `workspaceChecks` parity check). Do not fix it here: verified
  2026-08-28, `Frontend/.github/workflows/pr-checks.yml`'s `on:` at **:89-90** is
  `workflow_dispatch: {}` and nothing else, so adding a `pull_request:` trigger to the drift workflow
  re-introduces per-PR GitHub billing in a repository that deliberately has none. That makes it an
  owner spend decision, which this wave's earlier draft did not know when it called that half
  "not blocked."

**There is a third, larger version of the same problem, and it is not in the review.**
`Installers/.github/workflows/pr-checks.yml` is 801 lines and its `on:` at **:81-87** is
`workflow_dispatch` + `schedule: cron '41 7 * * 1'`. The `pull_request` and `push` triggers were
removed on 2026-08-25 (header **:9-30**, owner cost decision; GitHub billed ~$600 for July 2026).
The weekly schedule exists only to keep `codex-hook-lane-live-proof` ringing — every other job
carries `if: github.event_name != 'schedule'`. **There is no automatic GitHub gate on an Installers
PR.** The gate is the local Docker mirror:

```bash
node ci/lib/drift.mjs           # is the local mirror still complete?
node ci/lib/run.mjs Installers  # every mirrored gate leg for one repo
```

Two traps inside that file. Its header at **:69-70** still asserts *"GitHub Actions is blocked
org-wide right now (Free-plan spending limit)"* — that was true on 2026-08-25 and is stale: Actions
were unblocked on 2026-08-27, so the constraint is now budget, not availability. And
`grep -c toolrisk .github/workflows/pr-checks.yml` returns **0**: `./internal/toolrisk/...` runs in
**no** pull-request job. `go test ./...` reaches it only from `internal-candidate.yml:87`, which is
`workflow_dispatch`-only. `ci/gates.json` mirrors nine `pr-checks` jobs plus `holdout-score:score`
and `finding-b-e2e:shim-enforcement` — `internal-candidate` is not among them. **The toolrisk tests
this packet is about run in no CI gate and in no local mirror leg.** Any exit criterion that says
"CI is green" is, for that package, measuring nothing.

**There is a fourth instrument, and it IS wired at PR time — this section previously said it was not.**
`check:ai-security-consumer` verifies the generated portable projection against its reviewed pin, and
it is the only guard standing between the digest-pinned artifact described below and a hand edit.
Verified 2026-08-28 against `Backend@origin/main`:

- `package.json:7` `check:ai-security-consumer` = `node packages/shared-contracts/scripts/check-ai-security-backend-consumer.cjs`.
- It is reachable through **two** npm lifecycle hooks, not one: `prebuild` (`package.json:5`) **and
  `pretest` (`package.json:10`)**, both routing through `build:shared-contracts` (`:6`).
- `pr-checks.yml` runs `npm test` at `:229`, `:245`, `:391` and `:721` — **11 `npm test` invocations
  over its 728 lines** — so the guard runs on every one of them, at PR time, on a change under review.
- It also runs locally: `ci/gates.json` mirrors `Backend build:build_and_test`, so
  `node ci/lib/run.mjs Backend` executes it today.

**An earlier revision of this section claimed the guard "fires after merge, on the deploy path … and
never on a change under review." That was false**, and it was false because its discovery command
grepped only for `npm run build` and therefore could not see any of the eleven `npm test` steps.
**Wave 1's disposition is the authoritative one** (`w1_policy_authority.md:603-618`): the guard is
wired, and reconciliation G-6 is closed as a mis-statement rather than as work.

Task 8 survives on a narrower and honest justification: a **named, greppable, separately-mirrorable
leg** is better than a guard reachable only as a side effect of a lifecycle hook, because the implicit
form is invisible to anyone auditing which gates cover which contract. That is a real improvement. It
is not a coverage fix, and this wave must not describe it as one.

**The DLP catalog is generated, but from the wrong side.**
`Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts:54` holds
`AI_DLP_CLASSES` — **30** entries, counted, from `private-key` to `national-id`. It is re-exported at
`packages/shared-contracts/src/ai-governance-contract.ts:262`. Its header says
`Regenerate with: npm run generate:ai-security-backend-consumer` and pins
`AI_SECURITY_PORTABLE_SOURCE_COMMIT = "d366f5f8c76fac253d9adf7914873e97a955a16d"`.
The producer registers **81**: `Installers/internal/dlp/registry.go:133` `classRegistry` = **33**
entries, plus `Installers/internal/dlp/codesecurity_rules.go:70` `codeSecurityParityClasses` = **48**.
`RegisteredClasses()` (`registry.go:221`) returns the sorted union. **51 endpoint-emitting classes
have no console control at all.**

⚠️ **`d366f5f8c76fac253d9adf7914873e97a955a16d` does not resolve in any of the seven checkouts** —
`git cat-file -t` fails in all of them, re-confirmed 2026-08-28 after a fresh fetch of all seven. So
the generated artifact is pinned to a commit this workspace cannot see. Do not assume it is an
Installers commit.

**This is why Task 3 is discovery only.** `AI_DLP_CLASSES` is not a hand-maintained table that a
generator can be pointed at the producer registry: `ai-governance-contract.ts:262` reads it out of
`AI_SECURITY_PORTABLE_ORDERED_TUPLES`, a digest-pinned generated artifact
(`AI_SECURITY_PORTABLE_ARTIFACT_DIGEST = "sha256:29006c25…"`, `:19`) whose generator
`ceragon-ai-security-artifact` v1.3.1 (`:23-24`) exists in no checkout here. Closing "make
`AI_DLP_CLASSES` 81" from this wave would mean hand-editing a digest-pinned generated file — the exact
drift the pin exists to catch. **The governed-vocabulary decision and the widening are owned by
Wave 1 Task 2 and Wave 1 Task 3.** This wave records the provenance finding and declares the fork.

**Two plan citations in the source material are themselves wrong, and correcting them is part of
this wave.** The dead per-session scratchpad path is **not** at `plan:781` (that line is
`aws iam put-role-policy --role-name ecsTaskExecutionRole`). Its first occurrence is `plan:217`, and
it recurs through Wave 0's line range; **the count is whatever the resolver prints, and this plan does
not carry a second one** — a hand count taken during drafting did not reproduce, which is the defect
Task 4's own exit criterion forbids everyone else. And
`dlp.Scan`/`dlp.ScanAll`: `Installers/internal/dlp/dlp.go` is **1510 lines**, so the plan's
`dlp.go:1519-1520` justification is past EOF. `ScanAll` and `ScanAllAtRest` are not in `dlp.go` at
all — they are at `Installers/internal/dlp/scanall.go:78` and `:101`. The nearest real anchor in
`dlp.go` is `func Redact` at **:1479**.

## Task 1: Fetch first, then publish a rebase manifest — and make it a standing rule

**Files:**
- Create: `.plans/m47a-20260822/v2-waves/REBASE_MANIFEST.md` (regenerated, never hand-edited)
- Modify: the revised plan's preamble (the standing rule)

- [ ] **Step 0, before reading anything else.** Fetch all seven. Do not skip a repo because a SHA
      list says it is unchanged.
```bash
cd C:/Users/Owner/Documents/Ceragon
for d in Backend Frontend Installers Ceragon-Intelligence Static-Worker Sandbox-Worker GithubApp-Bot-Scanner-Worker; do
  echo "=== $d ==="; git -C "$d" fetch origin --prune
done
```
- [ ] Generate the manifest from the repos, not from prose:
```bash
for d in Backend Frontend Installers Ceragon-Intelligence Static-Worker Sandbox-Worker GithubApp-Bot-Scanner-Worker; do
  printf "| %s | %s | %s | %s | %s |\n" "$d" \
    "$(git -C $d rev-parse --abbrev-ref HEAD)" \
    "$(git -C $d rev-parse --short=12 HEAD)" \
    "$(git -C $d rev-parse --short=12 origin/main)" \
    "$(git -C $d rev-list --count HEAD..origin/main)"
done
```
- [ ] Record, per repo, whether the fetch **moved** `origin/main`. A repo whose fetch printed a range
      is a repo whose citations must be re-resolved before use.
- [ ] Write the standing rule into the plan preamble, in these words or better: *every `path:line` in
      this plan is a claim about `origin/main` at the SHA in `REBASE_MANIFEST.md`. Resolve citations
      with `git show origin/main:<path>`, never from the working tree. A SHA list handed to you by a
      task brief is not evidence; the fetch is.*

**Defeat test:** `w-1-rebase-manifest.test` (new, `ci/lib/`). Hand-edit one SHA in
`REBASE_MANIFEST.md` and re-run the generator; the test must go RED with
`REBASE_MANIFEST.md is stale: Installers records <edited> but origin/main is <actual>`.
A manifest that can be hand-edited without a test noticing is the defect this task exists to close.

**Exit:** `REBASE_MANIFEST.md` contains exactly **7** rows, each with a non-null `origin/main` SHA
and an integer `behind` count, and its generator is re-runnable and produces a byte-identical file.

## Task 2: Write the claim contract into the goal statement

**Files:**
- Modify: the revised plan's goal statement (replaces `plan:5` and `plan:26-30`)
- Reference: `docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md:695-829`

The old goal at `plan:5` reads *"Make the AI security engine's rules fire correctly, never fire on
legitimate work, carry a severity that means something…"*. `plan:28` quotes the owner asking for
*"zero false positives"*. Both are unachievable as written and the packet cannot certify either.

- [ ] Replace the goal statement with the claim contract. **The conclusion goes in the goal
      statement, not a footnote:** *No risk lane — R1 secrets/company-data exposure, R2 insecure code
      reaching a protected branch, R3 malicious dependency/MCP/plugin admission, R4 dangerous command
      or production action, R5 prompt-injection hijack — can reach PASS from this packet. Every one
      is NOT_READY, and each has named blockers, several of them external to engineering.*
- [ ] Carry the five per-lane blocker lists verbatim from source material §5.4. Do not summarise them
      into "some gaps remain".
- [ ] State what **can** reach PASS, as bounded engineering-assurance dimensions and explicitly not as
      risk certificates: scanner **execution** truth; tool-risk **policy authority and catalog
      totality** (largely closed already, C3/C4); **measurement-substrate integrity** after Wave 3;
      **console truth** after Wave 5.
- [ ] Copy the forbidden-claims list (source material §7) into the plan as a checklist the release
      note is diffed against, including the four the review does not carry: no static-corpus
      prompt-injection result as a release claim; no single prompt-injection number across surfaces;
      no claim that the lexical classifier can be an enforcing tier; no claim of safeguards coverage
      *at install time* (the MSI does not wire the AI hook lane — a per-user scheduled task does,
      about a minute later).
- [ ] **This wave owns the PROSE checklist only. Wave 8 Task 11 owns the executable renderer**
      (`Installers/internal/certificate/claim_test.go`, `TestForbiddenClaimsAreRefused`) that encodes
      the same list as data. Two lists is how they drift, so write the coupling down here and make
      Wave 8's test assert it: **the number of rows in this checklist and the number of encoded
      entries in the renderer must be equal**, and the test fails naming the row that exists on one
      side only. Today both are **15**. Neither side may grow alone.
- [ ] Name `docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md:695-829`
      as the **sole** numeric SLO authority. Do not create a second table.
- [ ] Add the certificate TTL: **90 days**, matching AIUC-1's quarterly re-test requirement.

**Defeat test:** `claim-contract-guard` (new, `ci/lib/claim-contract.mjs`). It greps the plan and any
release note for the forbidden strings ("zero false positives", "all detections", "M4.7A is
complete", "9/10", "high-assurance") outside a fenced *forbidden* block. Re-insert "zero false
positives" into the goal statement and it must go RED naming the line.

**Exit:** the goal statement contains the sentence *"None of the five risk lanes can reach PASS from
this packet"*; the forbidden-claims checklist has **15** rows (8 from §7 "forbidden outright" + 7 from
"forbidden by the research"), each with a named source; and that row count **equals** the count of
encoded entries in Wave 8 Task 11's renderer, asserted by a test there rather than by a reader
comparing two documents.

## Task 3: Resolve the provenance of the pinned DLP vocabulary — DISCOVERY ONLY

**Files:** none. This task writes a finding and a fork into the plan. **It changes no source file, and
it must not**: the thing it is about is a digest-pinned generated artifact, and the only way to close
it from here is to hand-edit that artifact.

**Read, do not edit:**
- `Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts` (`:18` source
  commit, `:19` artifact digest, `:23-24` generator name and version, `:54` the `AI_DLP_CLASSES` key)
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts` (`:262`, the re-export)
- `Installers/internal/dlp/registry.go` (`classRegistry` `:133` = 33, `RegisteredClasses` `:221`)
- `Installers/internal/dlp/codesecurity_rules.go` (`codeSecurityParityClasses` `:70` = 48)

- [ ] **Step 1 — run the sweep, with a control.** The generated file pins
      `AI_SECURITY_PORTABLE_SOURCE_COMMIT = "d366f5f8c76fac253d9adf7914873e97a955a16d"`. Fetch first
      (Task 1), then:
```bash
cd C:/Users/Owner/Documents/Ceragon
for d in Backend Frontend Installers Ceragon-Intelligence Static-Worker Sandbox-Worker GithubApp-Bot-Scanner-Worker; do
  printf "%-30s " "$d"; git -C "$d" cat-file -t d366f5f8c76fac253d9adf7914873e97a955a16d 2>&1 | head -1
done
git -C Installers cat-file -t 5b12952307db          # CONTROL: must print `commit`
grep -rn "generate:ai-security-backend-consumer" Backend/package.json Backend/scripts/ 2>/dev/null
gh search repos --owner Ceragon-Prod 'shared-contracts'   # is there a repo this workspace does not have?
```
      Measured 2026-08-28, after fetching all seven: **`could not get object info` in 7 of 7**, and
      the control printed `commit`. The generator `ceragon-ai-security-artifact` v1.3.1 is named by
      the artifact and exists nowhere here.
- [ ] **Step 2 — record the finding, in the plan and in the run log.** *The Backend's closed DLP
      action vocabulary is pinned to a source commit that resolves in none of the seven checkouts, by
      a generator that exists in none of them. The pin is therefore unverifiable from this workspace:
      it can be checked for self-consistency and cannot be traced to a source.* This is a finding
      about **provenance**, not about the 30-vs-81 gap, and it survives whichever fork Wave 1 takes.
- [ ] **Step 3 — declare the fork and hand it over. Do not decide it here.**
      - **Option A** — regenerate the portable artifact so `AI_DLP_CLASSES` itself becomes 81.
        **Blocked on the external dependency Step 1 measured**: no generator, no source commit.
      - **Option B** — the governed tuple becomes `AI_SECURITY_DLP_CLASSES` in
        `Backend/src/ai-security-policy/ai-security-policy.constants.ts`, pinned against a producer
        parity vector, and `AI_DLP_CLASSES` stays the frozen 30-member V1 wire tuple.
      **Owned by Wave 1 Task 2** (the decision and the docblock) and **Wave 1 Task 3** (the widening
      to 81 and the per-class shipped posture, read from `classSpec.defaultAction`, never invented).
      **The deploy-ordering sentence goes with them:** the 400 comes from `validateActionMap` on a
      **console** PUT, so the constraint is *Backend deploys before the Frontend ships the 81-row
      board*. No agent release is required by that widening — and the standing rule still holds
      underneath it: if one is cut for unrelated reasons it still goes after the Backend (Wave 1
      criterion 9). Wave 1's wording is authoritative; an earlier draft of this task stated it as an
      agent-release dependency, which put a false item on the critical path's third step.
- [ ] **Step 4 — carry the count-forbidding rule forward, not the count.** Nothing in this wave may
      write `30`, `51` or `81` as an exit number for a vocabulary. Wave 1's criterion 1
      (`|AI_SECURITY_DLP_CLASSES| == |RegisteredClasses()|`) is where that number is asserted, printed
      by a test rather than typed.

**⚠️ Trap for whoever executes Wave 1 — three copies, two builds, one reference.**
`@ceragon/shared-contracts` exists in three places. `Backend/package.json` resolves it to
`Backend/packages/shared-contracts/` — that is the copy that ships.
`Ceragon-Intelligence/packages/shared-contracts/` is the vendored standalone mirror. The
**workspace-root** `packages/shared-contracts/` is on no build path but is the canonical reference
that seven Backend parity specs compare against, including
`Backend/src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts`, which runs in the default
jest lane. Editing the root copy changes what the parity checks consider correct; editing the Backend
copy changes what ships. Both are usually needed and they are different acts. Stated here because the
discovery surfaces it; the edits themselves are Wave 1's.

**Defeat test:** none is possible — this task produces a finding, not a change. Its integrity clause
is the control in Step 1: **if `git cat-file -t 5b12952307db` does not print `commit`, the sweep is
measuring a broken invocation rather than a missing object and the finding is void.** A sweep whose
control was never run has not run.

**Exit:** a recorded finding naming **7 of 7** checkouts in which the pinned source commit does not
resolve, with the control result beside it; the two options written down with the blocker on Option A
named; and the decision handed to **Wave 1 Task 2**. **This wave asserts no DLP class count.** The
criterion that used to live here — `AI_DLP_CLASSES.length === RegisteredClasses().length` — is
**Wave 1 exit criterion 1**, restated there as `|AI_SECURITY_DLP_CLASSES| == |RegisteredClasses()|`.

## Task 4: Repair every citation in the plan

**Files:** the revised plan text only.

- [ ] Delete the dead per-session scratchpad path — first occurrence `plan:217`, recurring through
      Wave 0. Replace with a discovered workspace-scratch root, resolved at run time. **Do not write a
      count here**; the resolver prints its own, and a hand count taken while drafting this wave did
      not reproduce against `grep -c`.
- [ ] Replace the bare-basename references with `<repo>/<path>:<symbol>` — again, the resolver's
      printed total is the number, not a literal in this bullet. Confirmed examples:
      `plan:15290` cites `main.ts:429` and `main.ts:458-465` with no repo; `plan:7460` cites
      `constants.ts:150-165`; `plan:4621` cites `server.go:365` and `server.go:453` (that one is
      `Installers/internal/daemon/server.go`, and the trap it names — `hookFires.seedFromDisk` sitting
      inside `NewServer`, not `Start` — is worth preserving verbatim).
- [ ] Correct the two known-wrong citations: `dlp.go:1519-1520` → `Installers/internal/dlp/dlp.go:1479`
      (`func Redact`), and `plan:5780`/`plan:5789` `dlp.Scan(...)` →
      `Installers/internal/dlp/scanall.go:78` `ScanAll` / `:101` `ScanAllAtRest`.
- [ ] Correct the F16 citation: the plan mentions F16 **zero** times
      (`grep -c F16 M47A_IMPLEMENTATION_PLAN.md` = 0, verified); `plan:788` is an
      `aws iam put-role-policy` step, and the F16 respec is
      `docs/Devoid_Roadmap_To_Finished_Product.md:788` — a **different repo**. Cite the repo.
- [ ] Prefer a symbol plus a discovery command over a line number wherever the symbol is unique.
      A line number that drifts is a plan defect (review P1-08); a `git grep -n` that returns one hit
      is not.

**Defeat test:** `plan-citation-resolver` (new, `ci/lib/plan-citations.mjs`). For every `path:line` in
the plan it resolves `git show origin/main:<path>` and asserts `line ≤ EOF` and that the path carries
a repo qualifier. Point one citation at `dlp.go:1519` and it must go RED with
`past EOF: internal/dlp/dlp.go has 1510 lines`. Second, for the `dlp.Scan`/`ScanAll` correction
specifically, an already-red guard exists: replace one shipping `dlp.ScanAll` call with `dlp.Scan` and
`TestNoSurfaceScansShallow` fails at `internal/dlp/scan_depth_guard_test.go:140` with
`these surfaces reach internal/dlp through a PARTIAL detector set` — which is why the corrected
citation points at `scanall.go`, not at `dlp.go`.

**Exit:** the resolver reports **0** unresolvable references, **0** past-EOF references, and **0**
unqualified basenames, out of a count it prints itself.

## Task 5: Restore the instrument that no longer gates — `holdout-score.yml` header truth, then the trigger decision

**Files:**
- `Installers/.github/workflows/holdout-score.yml` (`:6` and `:13` header, `:18-21` the existing
  cost-gate note, `:22-25` `on:`)
- `Frontend/.github/workflows/vendored-upstream-drift.yml` (73 lines; `:20-22` and `:29-31` header,
  `:39-43` `on:`) — Half A of the sibling trigger decision, Step 5. **Owned here. Blocked, not handed on.**
- `ci/lib/workflow-header-truth.mjs` (create), `ci/lib/workflow-header-truth.test.mjs` (create)
- `ci/gates.json` (`workspaceChecks`)

**This wave owns the header truth and the trigger decision for this file.** Wave 3 Task 11 and
Wave 3B Task 1 each specified a header half as well; both are **owned by Wave −1 Task 5**, and the
A/B/C option analysis below is Wave 3 Task 11's, moved here intact. **One header test, not three.**

**The engineering half is unambiguous and is not blocked.** `holdout-score.yml:6` reads *"This runs on
PUSH TO MAIN and NIGHTLY"* while `on:` at `:22-25` is `workflow_dispatch: {}` plus
`schedule: cron '17 3 * * *'` — the push trigger was removed on 2026-08-25. `:13` adds *"The job does
NOT gate on a rate threshold today."* A file that describes a trigger it lost is worse than a file
with no comment: it is a live self-contradiction in source that a reader will trust.

- [ ] **Step 1 — fix the header regardless of the decision.** Make `:6` describe the triggers the file
      actually has, and cross-reference the cost-gate note already at `:18-21`, which explains why
      they changed. Leave `:13` alone; it is true.
- [ ] **Step 2 — put the decision to the owner, in plain terms. It is not an engineering call.** The
      push trigger's removal was an owner cost decision after GitHub billed roughly $600 for July
      2026. Restoring it spends money; not restoring it leaves detector quality on a nightly
      non-gating report. Actions were unblocked org-wide on 2026-08-27, so the constraint is
      **budget, not availability**.
      - **Option A — restore `push:` on `main`.** Detector quality gates on merge. Costs one
        ubuntu-latest job per push to `main`. The job is Go-only with `cache: true`; measure the real
        figure with `node ci/lib/drift.mjs --cost` before quoting one.
      - **Option B — write the decision down.** Detector quality is a nightly, non-gating report, and
        the compensating control is named: `ci/gates.json` already mirrors `holdout-score:score`, so
        `node ci/lib/run.mjs Installers holdout-score:score` runs it locally at zero cost, and every
        promotion PR attaches its output.
      - **Option C — the middle, and the recommendation.** Keep the nightly and add a **required
        attachment** rule: no promotion PR merges without a locally-produced report from the exact
        commit. It is the only option that costs nothing and still gates.
- [ ] **Step 3 — record the decision in the file itself**, in the style of the existing cost-gate note
      at `:18-21`, naming the date and the person: `DECIDED: <A|B|C> by <owner> on <date>`. A decision
      that lives only in a chat log regresses. The `push` trigger was removed on 2026-08-25 in
      `cd657c77` as a deliberate owner cost decision. **BLOCKED on: an explicit owner cost decision.**
      Do not restore the trigger on your own authority.
- [ ] **Step 4 — one header-truth check, at the workspace level.** `ci/lib/workflow-header-truth.mjs`
      parses a workflow's `on:` keys, reads the first 20 comment lines, and fails when the header
      names a trigger `on:` does not declare. Register it and its self-test in `ci/gates.json`
      `workspaceChecks`, in the same shape and voice as the existing `toolrisk-vocab-parity` /
      `toolrisk-vocab-parity-selftest` pair. **Why here and not a Go test in the repo:** it runs today
      via `node ci/lib/run.mjs workspace` with no repo CI trigger, and it covers every workflow in all
      seven repositories rather than one file — whereas `internal/neutraleval` (where Wave 3 Task 11
      proposed to put it) has **no CI leg at all** until Wave 4C adds one, so a Go test there would
      run nowhere automatic at the time this wave lands.
      **One false positive to design out before you write it,** because covering all seven repositories
      means covering the file Step 5 claims: `vendored-upstream-drift.yml`'s header names
      `pull_request` at `:29-31` in a *conditional instruction* — *"WHEN T-M2 LANDS: add
      `pull_request:`"* — not as a claim about the triggers it has. The check must fail on a header
      asserting a trigger in the present tense, not on one prescribing a future one, or it lands red on
      its first commit against a file whose comment is correct. That distinction is a required case in
      `workflow-header-truth.test.mjs`, not a heuristic left to the regex.
- [ ] **Step 5 — the sibling trigger. This wave owns it; it does not hand it on.**
      `Frontend/.github/workflows/vendored-upstream-drift.yml` is 73 lines. Its `on:` at **:39-43** is
      `workflow_dispatch: {}` plus `schedule: cron "15 6 * * *"`, and its own header at **:29-31**
      carries the standing instruction *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the
      SAME change that re-vendors the files."* An earlier revision of this step said the trigger was
      *"owned by Wave 5 Task 9"* — **it is not, and Wave 5 Task 9 says so in the same words**
      (`w5_w6_console_triage.md:665-669`: *"**The GitHub half is not this task's.** … owned by Wave −1
      Task 5 … **Do not edit that workflow from this wave.**"*), as do `w3_measurement_substrate.md:951-954`
      and `w4c_prompt_ingress.md:878`, both of which point at this wave's exit criterion 7. Four files
      pointing at each other is how a one-line change goes unmade for a month. **The pointer stops here.**
      - **Half A — adding `pull_request:` — is this wave's, and it is BLOCKED.** Not on engineering: on
        the same owner spend decision as `holdout-score.yml` above, one sitting, two questions.
        `Frontend/.github/workflows/pr-checks.yml`'s `on:` at **:89-90** is `workflow_dispatch: {}` and
        nothing else; its `push:` and `pull_request:` triggers were deleted on **2026-08-25** in
        `3b5c5aa8` (*"ci: stop billing GitHub for push and merge"*), whose own note at `:84-88` states
        the cost plainly — *"there is now NO automatic gate on GitHub."* That repository has **no
        per-PR runs at all**, so a `pull_request:` trigger on the drift workflow is a request to start
        paying for them again. Record the answer exactly as Step 3 records this file's:
        `DECIDED: <yes|no> by <owner> on <date>` in the workflow header, or the literal words
        **BLOCKED — owner spend decision** with the date the question was put. **Do not add the trigger
        on your own authority.**
        **Name the one precondition that IS satisfied, so the block is not over-stated.** The header's
        other condition at `:20-22` — that a `pull_request` trigger must not *"paint every unrelated PR
        red for a condition its author did not cause and cannot fix"*, i.e. T-M2 must have landed — is
        met: `MANIFEST.json` pins `254d24fc` and Wave 5 Task 9 re-verified on 2026-08-28 that all three
        digests still match `Installers@origin/main` (`w5_w6_console_triage.md:714-719`). So
        **`w3_measurement_substrate.md:951-954` is right that the engineering precondition is clear,
        and wrong to conclude from it that "that half is not blocked"** — it reads the T-M2 condition
        and not the spend one. Nothing technical stands in the way. **Money does, and money is the
        owner's call.**
      - **Half B — the offline check — is unblocked, ships, and is built in Wave 5 Task 9, not here.**
        `ci/lib/vendored-engine-parity.mjs` plus its self-test, registered in `ci/gates.json`
        `workspaceChecks` beside `toolrisk-vocab-parity` (`:31`) and `toolrisk-vocab-parity-selftest`
        (`:36`), modelled on `ci/lib/vocab-parity.mjs` — 24,024 bytes, already registered, already run
        by `node ci/lib/run.mjs workspace`. It compares bytes on disk, needs no token and no network,
        and **no GitHub decision can switch it off** — which is precisely why it is the half that ships
        while Half A waits on a budget. This step neither duplicates it nor blocks it. **This wave must
        not put a competing copy in a workflow**, the same rule as Task 7's last bullet.
- [ ] **Step 6 — record the caveat that survives either decision:** until the trigger question is
      answered, detector quality is measured nightly or locally and **never** by an automatic gate on
      a change under review. Any wave that writes "CI is green" for a detector number is measuring
      nothing.

**Defeat test:** revert `holdout-score.yml:6` to claim a push trigger while `on:` declares none;
`node ci/lib/workflow-header-truth.mjs` must exit non-zero with
`holdout-score.yml:6 claims a push trigger; on: at :22 has none`. Second, delete the
`ci/gates.json` `workspaceChecks` entry and `node ci/lib/drift.mjs` must go RED — a check nobody runs
is not a check.

**Exit:** `holdout-score.yml`'s header and its `on:` block agree, pinned by **exactly one**
header-truth check, registered in `workspaceChecks` with a self-test that has been made red. The
trigger question is recorded in the workflow file as `DECIDED: <A|B|C> by <owner> on <date>` or, until
then, as **BLOCKED — owner cost decision**, and this wave's certificate contribution for
detector-quality freshness is **UNKNOWN**, not green. **Both** trigger questions this wave owns — this
file's and `vendored-upstream-drift.yml`'s Half A (Step 5, exit criterion 7) — are recorded in their
own workflow headers by that same rule. A decision that lives only in a chat log regresses, and a
decision handed to another wave does not get taken at all.

## Task 6: Declare the standards columns in the manifest schema

**Files:** the manifest schema from source material §5.3; the class-catalog table in the plan.

**Scope, stated first because this task used to claim more than it can deliver.** This wave declares
the **columns**. It does not populate them. **The generated mapping and its totality test are owned by
Wave 8 Task 7** (`Installers/internal/certificate/standards.go`, `TestEveryClassCarriesStandardsIds`,
exit **121 of 121** = 40 tool-risk + 81 DLP producer classes). A totality criterion cannot be met from
here anyway: the DLP half of that denominator does not exist until Wave 1 widens the governed
vocabulary to 81, and this wave asserts no DLP class count at all (Task 3).

- [ ] Declare three per-class columns in the manifest schema: **`atlasTechniques`**,
      **`owaspLlm2026` / `owaspAsi2026`**, **`aiuc1Controls`** — each required, each permitting an
      explicit `"n/a"` **with a reason** rather than an empty value, so an unmapped class is a visible
      decision and not a blank.
- [ ] Declare **`system.standardsMapping.atlasRelease`** as a required pinned release string, so a
      technique renumbering is a visible diff rather than silent drift. **v2026.07** is current;
      v2026.05 added a `platform` field that includes `Agentic`.
- [ ] Name the editions in the schema's documentation so the populating wave cannot pick a stale one:
      **OWASP Top 10 for LLM Applications 2026** (shipped 2026-08-03; it renumbered 8 of 10, and
      **Excessive Agency moved from LLM06 to LLM03** — the entry the 2026-08-23 review leans on
      hardest while citing `:2025` ids), and **OWASP Top 10 for Agentic Applications 2026**
      (ASI01–ASI10). The four AIUC-1 Q3-2026 controls that land on this product's surface — **A008**,
      **B010.3**, **B006.3**, **B006.1** — are enumerated by Wave 8 Task 7; name them in the schema
      documentation as the closed set the column accepts.
- [ ] `grep -ci owasp` over the v1 plan returns **0**, verified. That is the baseline the column
      declaration moves; the *mapping* baseline is Wave 8's (`git grep -in aiuc` = 0 hits).
- [ ] **ASI09** (Human-Agent Trust Exploitation) requires a confirmation dialog to display **the raw
      action, not an agent-authored summary** — a control this product ships and does not test.
      **Owned by Wave 5 Task 8.**

**Defeat test:** `standards-schema-declaration` (new) — validate a manifest instance whose class rows
omit `atlasTechniques`, or whose `system.standardsMapping.atlasRelease` is blank, against the schema.
Both must be rejected, the second with `standards mapping has no pinned ATLAS release`. Delete the
column from the schema and the invalid instance validates, which is the regression.

**Exit:** the manifest schema declares **3** per-class standards columns plus a required
`atlasRelease`, each with its accepted edition named, and rejects an instance missing any of them.
**Population is Wave 8 Task 7's exit criterion (121 of 121), not this wave's.**

## Task 7: Create the `toolrisk-lane` job and its mirror entry — the one every later wave appends to

**Files:** `Installers/.github/workflows/pr-checks.yml`; `ci/gates.json`.

**This task creates the job and the mirror entry. Later waves add packages to the list it creates and
do not create jobs of their own** — otherwise three waves race on one file. Named consumers:
**Wave 4A Task 8** (the residuals suite) and **Wave 4C exit criterion 11** (`internal/ingressrisk` and
`internal/neutraleval`, which also brings `holdout_seal_test.go` under an automatically-triggered job
for the first time). Both append to `toolrisk-lane`'s package list, not to `scanner-parity`'s step at
`pr-checks.yml:146`.

- [ ] Record the fact this task exists for: **`internal/toolrisk` runs in no PR-time job and in no
      mirrored leg.** `grep -c toolrisk Installers/.github/workflows/pr-checks.yml` = **0** over its
      801 lines, verified. `go test ./...` reaches it only from `internal-candidate.yml:87`
      (`workflow_dispatch`-only). `ci/gates.json` mirrors `pr-checks:{hot-path-audit-imports,
      scanner-parity, wire-lane-tests, codex-vendor-lane, ai-checkpoint-observation,
      codex-hook-lane-live-proof, release-workflow-contract, self-update-lane, macos-legacy-identity}`,
      `holdout-score:score` and `finding-b-e2e:shim-enforcement` — none of which runs
      `./internal/toolrisk/...`.
- [ ] Add a `toolrisk-lane` job whose single test step runs
      `go test ./internal/toolrisk/... ./internal/shellast/... -count=1`, and mirror it in
      `ci/gates.json` as `pr-checks:toolrisk-lane`, so Wave 0A's defeat tests have a leg to be red in.
- [ ] **Say which of the two you are buying.** `pr-checks.yml`'s `on:` at `:81-87` is
      `workflow_dispatch` + `schedule: cron '41 7 * * 1'`, and every job but
      `codex-hook-lane-live-proof` carries `if: github.event_name != 'schedule'`. Adding a job there
      buys **nothing on GitHub** until the trigger question (Task 5) is answered; it buys **the
      mirrored local leg**, which is real and free. Write that sentence into the PR body rather than
      "CI now covers toolrisk".
- [ ] **The cross-repo vocabulary checker already has a home; do not give it a second one.**
      `ci/lib/vocab-parity.mjs` (24,024 bytes, added `221bd5b` 2026-08-26) is registered in
      `ci/gates.json` `workspaceChecks` together with its self-test, and runs today via
      `node ci/lib/run.mjs workspace`. Making it run *inside a repository's* PR gate is
      **owned by Wave 1 Task 6**, which carries the fetch-over-contents-API shape, the NOT-CHECKED
      discipline, and the `secrets.INSTALLERS_READ_TOKEN` blocker. This wave must not put a competing
      copy in a workflow — the token question is not answered here.

**Defeat test:** `node ci/lib/drift.mjs` must report the new leg as mirrored. Delete the
`ci/gates.json` entry and drift must go RED naming `pr-checks:toolrisk-lane`.

**Exit:** `node ci/lib/run.mjs Installers` executes a leg whose command contains
`./internal/toolrisk/`, and `node ci/lib/drift.mjs` reports the mirror complete. The GitHub-side value
of that job is recorded as **UNKNOWN until the Task 5 trigger decision**, not as a gate.

## Task 8 (NEW): Give the pinned-artifact guard a named, separately-runnable leg

**Files:**
- `Backend/.github/workflows/pr-checks.yml` (the new named step)
- `ci/gates.json` (mirror the leg)
- READ ONLY: `Backend/package.json`,
  `Backend/packages/shared-contracts/scripts/check-ai-security-backend-consumer.cjs`

**Why this artifact matters.** Task 3 established that the Backend's closed DLP action vocabulary is
read out of a digest-pinned generated artifact whose source commit resolves in no checkout here.
`check:ai-security-consumer` is the **only** guard standing between that artifact and a hand edit.

**Premise corrected before anything else — this task used to claim that guard does not run at PR time,
and that was false.** An earlier revision justified the whole task with *"the guard fires **after**
merge, on the deploy path … and never on a change under review."* **Wave 1 measured the opposite, and
its disposition is the authoritative one** (`w1_policy_authority.md:603-615`: *"The guard is wired.
**What it lacks is a trigger, not a workflow** … **G-6 is closed as a mis-statement, not as work.**"*),
independently confirmed at `w2_evidence_severity.md:103-108`. Re-measured here against `Backend`
`origin/main` `0cf9021e`: `package.json:10` makes `pretest` run `build:shared-contracts`, and `:6`
makes that run `check:ai-security-consumer` (`:7`) **first** — so every `npm test` reaches the guard,
and Backend's `pr-checks.yml` runs `npm test` at `:229`, `:245`, `:391` and `:721`, inside
`audit_integration` (`:146`), `alerts_integration` (`:321`) and `full_test` (`:497`).
`grep -cE 'npm test|npm run test'` over that 728-line file returns **11**. All three of those jobs are
already mirrored (`ci/gates.json:49`, `:51`, `:53`). **The guard already runs at PR time and already
runs in the local mirror. Nothing below is about wiring it.**

**What is actually missing, and it is the whole of this task: the guard has no name anyone can call.**
It is reachable only through an npm lifecycle hook, so
`grep -rl "check:ai-security-consumer" Backend/.github/workflows/` names **0** files (verified at
`origin/main`). A reviewer reading the workflow cannot see it, `ci/gates.json` cannot mirror it as its
own leg, and nobody can run *just* this guard without running a live-Postgres job or a quarter of the
suite. **A named, greppable, separately-mirrorable leg is better than an implicit one — that is the
only claim this task makes**, and it stands on its own without the false premise it used to lean on.

- [ ] **Step 1 — reproduce the mechanism with a command that can actually see it.** The previous
      revision of this step grepped for `npm run build` and nothing else. **That command is what
      produced the false premise above** — it returns `build=2 pr-checks=0 security=0` and cannot see a
      single one of the `npm test` invocations that reach the guard through `pretest`. There are two
      lifecycle entrypoints, `prebuild` and `pretest`; count **both**, never one:
```bash
cd C:/Users/Owner/Documents/Ceragon/Backend
git fetch origin --quiet
git show origin/main:package.json | grep -nE '"(prebuild|pretest|build:shared-contracts|check:ai-security-consumer)"'
for f in build pr-checks security; do
  printf "%-12s " "$f"
  MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/$f.yml" \
    | grep -cE 'npm run build|npm test'      # BOTH hooks. `npm run build` alone is the wrong question.
done
MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/pr-checks.yml" | grep -nE 'npm test'
MSYS_NO_PATHCONV=1 git show "origin/main:.github/workflows/pr-checks.yml" | sed -n '35,38p'  # the on: block
grep -rl "check:ai-security-consumer" .github/workflows/ 2>/dev/null   # no output — and THAT is the gap
```
      Measured at `origin/main` `0cf9021e` on 2026-08-28: `package.json:5` `prebuild` and `:10`
      `pretest` both run `build:shared-contracts` (`:6`), which runs `check:ai-security-consumer` (`:7`)
      before anything else. `pr-checks.yml` runs `npm test` at `:229`, `:245`, `:391` and `:721`, so the
      guard executes in three PR-time jobs. Note the shape of the count: only a literal `npm test`
      fires `pretest` — `npm run test:worker-contract` (`:120`) and `npm run testdb:prepare-live-pg`
      (`:182`) fire `pretest:worker-contract` and `pretestdb:prepare-live-pg`, which do not exist. The
      last line is the one finding that survives: **0** workflow files name the script, so it is
      invisible to `grep` and unmirrorable as its own leg.
- [ ] **Step 2 — give the guard its own named job.** Add `shared-contracts-pin` to
      `Backend/.github/workflows/pr-checks.yml`, invoking `npm run check:ai-security-consumer`
      **by name**. A guard reachable only through an npm lifecycle hook is invisible to `grep` and to
      every reviewer, which is how it stayed unnoticed. A step inside the existing `typecheck` job
      (`:47`) would also run it, but it could not then be mirrored as its own leg — and being able to
      run exactly this guard, alone, is the point.
- [ ] **Step 3 — mirror it.** Add the leg to `ci/gates.json` under Backend, so
      `node ci/lib/run.mjs Backend pr-checks:shared-contracts-pin` runs the guard **alone**, in seconds,
      rather than only as a side effect of `build:build_and_test` and of the three mirrored PR legs that
      already reach it through `pretest` — `pr-checks:audit_integration` (`ci/gates.json:49`),
      `:alerts_integration` (`:51`), `:full_test` (`:53`), two of which need a live-Postgres service
      container to get as far as running the guard at all. **Say what you are buying and what you are
      not**, as in Task 7: this buys a leg that is greppable, separately runnable and separately
      mirrorable. It does **not** buy new coverage — the guard already runs in those legs — and it does
      not change what GitHub does, because Backend's `pr-checks.yml` `on:` at `:35-38` is
      `workflow_dispatch` + `repository_dispatch: [backend-pr-checks]`, unchanged until the Task 5
      trigger decision. Write that in the PR body rather than "CI now covers the pinned artifact".
- [ ] **Step 4 — do not weaken the script to make it fit.** It verifies two things — the generated
      projection against its pin, and every committed `dist` artifact — and its own comment records
      why the second exists (`committedDist` was previously read by nothing before a build, so a stale
      dist pin passed). Keep both calls and keep the ordering note: `prebuild` must run it **before**
      the `dist` tree is deleted. Adding a PR-time invocation must not change `prebuild`.

**Defeat test:** hand-edit one entry in
`Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts` — the file's own
banner says `GENERATED FILE — DO NOT EDIT` — and run `npm run check:ai-security-consumer`. It must exit
non-zero. Then run the mirrored leg: `node ci/lib/run.mjs Backend pr-checks:shared-contracts-pin` must
go RED on the same edit. Revert.

**The control, corrected — do not run the old one.** The previous revision's control read *"with the
same edit in place and the new step removed, every PR-time job stays green — which is today's state."*
**That is false**; it is the premise Wave 1 overturned (`w1_policy_authority.md:603-615`), and an
implementer who ran it and saw red would conclude the mirror was broken. Run this instead: with the
same edit in place and the new step removed, `node ci/lib/run.mjs Backend pr-checks:full_test` **also
goes RED** — inside `pretest`, before a single test executes. That is the real control, and it measures
the real gain: without the named leg the failure arrives as a whole-suite job dying in its install
step, with no step name naming the pin, and a reviewer has to read the log to learn what broke; with
it, `run.mjs` prints `pr-checks:shared-contracts-pin`. **Attribution is the deliverable, not
coverage.** If that removed-step run comes back **green**, stop — `package.json`'s lifecycle chain has
changed since 2026-08-28 and this whole task needs re-measuring from Step 1.

**Exit:** `grep -rl "check:ai-security-consumer" Backend/.github/workflows/` names at least **1** file
(today it names **0**, verified at `origin/main`), `ci/gates.json` mirrors the leg, and the hand-edit
mutation has been driven RED **twice** — once in the new named leg, and once in `pr-checks:full_test`
with the new step removed. The certificate contribution is *"the pinned artifact is guarded at PR time
and at deploy time; this wave gave that guard a name a reviewer and the mirror can see"* — written in
those words. **It is not** *"the pinned artifact is now guarded on a change under review"*: it already
was, and a PR body claiming otherwise re-commits the mis-statement Wave 1 closed.

## Wave exit criteria

1. `REBASE_MANIFEST.md` carries **7** rows with live `origin/main` SHAs and integer behind-counts,
   regenerated by a script. Defeat: `w-1-rebase-manifest.test` — hand-edit one SHA, it goes RED.
2. The plan's goal statement contains *"None of the five risk lanes can reach PASS from this packet"*
   and the five per-lane blocker lists. Defeat: `claim-contract-guard` — re-insert "zero false
   positives", it goes RED.
3. The forbidden-claims checklist has **15** rows, each with a named source, **and that count equals
   the number of encoded entries in Wave 8 Task 11's renderer**, asserted by a test there. Defeat:
   `claim-contract-guard` for the prose half; add a 16th row on one side only and Wave 8's test goes
   RED naming it.
4. **Moved.** The DLP vocabulary count is not asserted by this wave. Task 3 is discovery only, and
   `|AI_SECURITY_DLP_CLASSES| == |RegisteredClasses()|` is **Wave 1 exit criterion 1**. What this wave
   asserts instead: a recorded provenance finding naming **7 of 7** checkouts in which
   `d366f5f8c76fac253d9adf7914873e97a955a16d` does not resolve, with a passing control
   (`git cat-file -t 5b12952307db` → `commit`), and the fork handed to Wave 1 Task 2.
5. `ci/lib/plan-citations.mjs` reports **0** unresolvable, **0** past-EOF, **0** unqualified
   references out of a total it prints. Defeat: point one citation at `dlp.go:1519`, it goes RED.
6. `grep -nE '\b(114|108|30 DLP|46 toolRisk)\b'` over the plan returns no *exit criterion* — the
   static denominators at `plan:9654` ("the governed-class denominator is 114") and `plan:4566`
   ("all 30 DLP classes") are gone, replaced by catalog digests. Defeat: re-add `plan:9654` verbatim
   and Wave 1 criterion 1's test disagrees with it.
7. **Owned here — Task 5 Step 5. BLOCKED is a state this wave holds, not a hand-off.** The
   `pull_request:` trigger on `Frontend/.github/workflows/vendored-upstream-drift.yml` (`on:` at
   `:39-43` = `workflow_dispatch` + `cron "15 6 * * *"`; the instruction to add it is in the file's own
   header at `:29-31`) is **Half A**, and it is blocked on an **owner spend decision, not on
   engineering**: `Frontend/.github/workflows/pr-checks.yml`'s `on:` at `:89-90` is
   `workflow_dispatch: {}` and nothing else, its `push:`/`pull_request:` triggers having been removed
   on 2026-08-25 in `3b5c5aa8` — that repository has no per-PR runs at all. **This criterion is met by
   a recorded decision, not by a merged trigger**: the workflow header carries either
   `DECIDED: <yes|no> by <owner> on <date>` or the literal words **BLOCKED — owner spend decision**
   with the date the question was put. Defeat: strip both strings from the header and the criterion is
   unmet. **Half B — `ci/lib/vendored-engine-parity.mjs` as a `workspaceChecks` entry, offline, no
   token, nothing can switch it off — is unblocked and ships in Wave 5 Task 9**, where it is built;
   this wave does not duplicate it. Earlier revisions of this criterion pointed at Wave 5 Task 9 for
   Half A while Wave 5 Task 9 pointed back here (`w5_w6_console_triage.md:665-669`), with
   `w3_measurement_substrate.md:951-954` and `w4c_prompt_ingress.md:878` pointing at this criterion.
   **The cycle is closed at this end.**
8. `holdout-score.yml`'s header and its `on:` block agree, pinned by **exactly one** header-truth
   check — `ci/lib/workflow-header-truth.mjs`, registered in `ci/gates.json` `workspaceChecks` with a
   self-test. Defeat: revert `:6` to "PUSH TO MAIN" → non-zero with
   `holdout-score.yml:6 claims a push trigger; on: at :22 has none`. **The trigger decision itself is
   BLOCKED on an owner cost decision — this wave's certificate contribution for detector-quality
   freshness is UNKNOWN, not green.**
9. `node ci/lib/run.mjs Installers` runs a `toolrisk-lane` leg covering `./internal/toolrisk/`, and
   `node ci/lib/drift.mjs` reports it mirrored. Defeat: delete the `ci/gates.json` entry → drift RED.
   **Making `ci/lib/vocab-parity.mjs` run inside a repository's own PR gate is Wave 1 Task 6**, blocked
   on `secrets.INSTALLERS_READ_TOKEN`; it already runs here as a `workspaceChecks` entry and that is
   what this wave claims.
10. `grep -rl "check:ai-security-consumer" Backend/.github/workflows/` names at least **1** file
    (today: **0**) and the leg is mirrored in `ci/gates.json`. Defeat: hand-edit
    `ai-security-portable.generated.ts` and the mirrored leg goes RED **naming
    `pr-checks:shared-contracts-pin`**; remove the step and the same edit goes RED **anyway**, in
    `pr-checks:full_test`, unattributed. **This criterion is about attribution, not coverage.** An
    earlier revision ended *"remove the step and the same edit passes every PR-time job, which is
    today's state"* — that is false: `package.json:10` `pretest` puts the guard in front of every
    literal `npm test` step in Backend's 728-line `pr-checks.yml` (`:229`, `:245`, `:391`, `:721`,
    across three jobs). Corrected from **Wave 1's G-6 disposition**, `w1_policy_authority.md:603-615`,
    which closes G-6 as a mis-statement rather than as work.
11. Cross-repo defeat, run once at the end of the wave: add one temporary class to the **tool-risk**
    producer. **Every** tool-risk consumer gate must go red —
    `Backend/src/ai-security-policy/ai-security-policy.tool-risk-class-parity.spec.ts:225-230`
    (*"every tier tuple equals the producer catalog, class for class"*), the Frontend toolrisk class
    parity test, and `TestClassCatalog_ParityVector` (`… parity vector is STALE`). A consumer that
    stays green is an ungovernable class waiting to ship. **The DLP half of this drill — a temporary
    class in `classRegistry` going red in a DLP consumer gate — needs a DLP producer parity vector,
    which does not exist yet; it is Wave 1 Task 1 and Wave 1 exit criterion 1.**
12. The manifest schema declares **3** per-class standards columns plus a required `atlasRelease`, and
    rejects an instance missing any of them. Defeat: `standards-schema-declaration` — validate an
    instance with a blank `atlasRelease` and get `standards mapping has no pinned ATLAS release`;
    delete the column from the schema and the invalid instance validates. **Populating those columns
    is Wave 8 Task 7 (121 of 121), not this wave** — this wave asserts the declaration only, because
    the DLP half of that denominator does not exist until Wave 1 widens the governed vocabulary.

---

# Wave 0A — Stop hard-blocking ordinary work

**Depends on:** Wave −1 Task 1 (fetch + manifest). Nothing else.
**Implements decisions:** — (new wave). It is Step 1 of the critical path in source material §8.
**Certificate impact:** **Risk 4** — removes the first named blocker on that lane ("a known-benign
command is hard-blocked fleet-wide with no admin override"). **R4 remains NOT_READY**: five other
blockers survive this wave — `chmod-broad-777` at 0% measured recall, no effect resolver (9
production evasions silent, 7 zero-impact twins HIGH), the Bash-only semantic lane with two C5
residuals, the effect broker connected only on the taint overlay, and F16. No other lane moves.

## Context an engineer needs

**This is the only item in the packet with live customer impact today.** Everything else is
measurement, plumbing or paperwork. This one is a developer, right now, unable to clear a pip cache.

**The defect, in one line.** `rm -rf $HOME/<anything>` and `rm -rf ~/<anything>` are HIGH-severity
`destructive-rm` findings, and `destructive-rm` is a malicious-floor member at
`minimumDisposition: 'block'` that the floor now re-asserts on the **read** path — so no
administrator on any tenant can relax it.

**The rule.** `Installers/internal/toolrisk/toolrisk.go:121-122`, the first entry in `commandRules`
(`:116`):

```go
{class: "destructive-rm", severity: SeverityHigh, confidence: 98,
    re: regexp.MustCompile(`\brm\s+(?:-[a-zA-Z]*\s+)*-?[rf]{1,2}[a-zA-Z]*\s+(?:-[a-zA-Z]+\s+)*(?:/\s*$|/\s+|/\*|~(?:/\S*)?|\$HOME\b|\.{1,2}\s*$|\*\s*$|/(?:etc|usr|var|bin|boot|lib|lib64|sbin|opt|root|home|sys|proc|dev)\b)`)},
```

Two of the eight target alternatives are the whole problem:
- `~(?:/\S*)?` — the tail is optional **and unbounded**, so `~/anything` matches.
- `\$HOME\b` — `\b` between `E` and `/` is a word boundary, so `$HOME/anything` matches.

The target alternation is positionally anchored: it must match immediately after the `rm` flags. That
is why `rm -rf "$HOME"` does **not** match (the quote sits at the target position) and why
`rm -rf ./build` does not (`\.{1,2}\s*$` needs end-of-string after the dots).

**Measured, by compiling the shipped pattern verbatim and running it** (Go 1.25.5, 2026-08-28):

| command | current `destructive-rm` |
|---|---|
| `rm -rf $HOME/.cache/pip` | **true** |
| `rm -rf ~/.npm/_cacache` | **true** |
| `rm -rf $HOME/projects/scratch` | **true** |
| `rm -rf ~/go/pkg/mod` | **true** |
| `rm -rf ~/Documents` | **true** |
| `rm -rf ./build` | false |
| `rm -rf /tmp/mybuild` | false |
| `rm -rf ${HOME}` | **false** ← a real evasion, see Task 3 |

**Why no admin can turn it off.** `Backend/src/ai-security-policy/ai-malicious-floor.ts:155` is
`destructive('destructive-rm')`, and the `destructive` constructor at **:104-108** sets
`minimumDisposition: 'block'`. `withMaliciousFloorApplied` (`ai-malicious-floor.ts:285`) is the first
executable statement of `assembleEffectiveDto`
(`Backend/src/ai-security-policy/ai-security-policy.service.ts:2132` signature, floor call at
**:2198**). The method's own docblock at `:2136-2139` says the parameter must never be read directly
because *"the first statement of this method raises it to the malicious floor."* Assembling is the
only way to build a wire payload, so an admin who stores `monitor` gets `block` served back. Both
halves are deployed in **task definition 322** (2026-08-27). The floor repair itself was correct — it
closed a hole where a section PUT could leave an org below the floor permanently. Its side effect is
this wave.

**Windows already got this right, and its comment says so.** `toolrisk.go:95-110` introduces
`winBroadTarget` (`:111-114`) as *"the WINDOWS half of the 'broad target' idea the POSIX destructive
rules already encode"*, and states the boundary explicitly at `:101-104`: *"Everything narrower is
deliberately outside it. Deleting `node_modules`, a `.\build` directory or a scratch path under the
user's own workspace is ordinary developer work on this very box and must stay allowed"* — and at
`:106-110`: *"Each alternative ends on a quote, whitespace or end-of-string so a LONGER path that
merely BEGINS with a system directory does not satisfy it."* `winBroadTarget`'s home arm is
`\$home\b(?:["'\s]|$)` — terminator-anchored, bare-only. **The POSIX arm is the outlier.** This wave
brings POSIX to the boundary the Windows dialect already documents and tests.

**Traps, all four verified.**

1. **Two tests pin the *current* home behaviour and must stay green.**
   `internal/toolrisk/interpreter_body_anchor_test.go` `TestAnchorDefeat_UnanchoredAlternativesSurvive`
   asserts that `rm -rf ~` and `rm -rf $HOME` match **both bare and wrapped** as
   `bash -c "rm -rf ~"` — the control that proves only end-anchored alternatives are quote-defeated.
   `internal/toolrisk/quoting_bypass_pin_test.go` `TestScan_QuotedBroadTargetIsNoLongerEvaded`
   requires `rm -rf ~/` and `rm -rf "~/"` to match with identical severity. Any replacement whose
   terminator class excludes `"` breaks both.
2. **One test pins a *bug*, and its banner tells you what to do if you fix it.**
   `TestScan_EnvironmentVariableTargetStillEvades` asserts `rm -rf "$HOME"` is **not** detected. Its
   message: *"FIXED: … Invert this pin and record how the scanner learned the value of a
   PROCESS-ENVIRONMENT variable."* Wave 0A must **not** change that residue — resolving process-env
   variables at scan time makes the scanner machine-dependent and is a separate design. If your
   change flips it anyway, **invert the pin, never restore the evasion**. **Wave 4B Task 6 inverts
   that pin deliberately, on top of this change; Wave 0A lands first.** Inverting it first would mean
   this wave rewrites the alternation around a pin that has already moved, and the two waves' benign
   tables would then disagree about `rm -rf "$HOME"`.
3. **RE2 has no lookahead.** A "no further path characters" assertion must be a **consumed**
   terminator character. That is exactly what `winBroadTarget` does. Consequence: the reported
   `Finding.Start/End` span widens by one byte on the new arms. Check
   `internal/daemon/ai_preview_window.go` and the span-sensitive comment at
   `internal/toolrisk/expansion_fp_test.go:18` before assuming nothing downstream reads the span.
4. **`internal/toolrisk` is in no CI gate.** See Wave −1 Task 7. Your defeat tests run when a human
   types `go test`, or in the mirrored leg Wave −1 adds — and nowhere else. State which.

**Who owns this alternation, so three waves do not edit one regex.** **Wave 0A rewrites it (Task 3)
→ Wave 4B Task 6 inverts the `"$HOME"` pin on top of it.** Nothing else touches it. An earlier draft
of Wave 4A Task 7 specified a second, incompatible narrowing — *"`$HOME` followed by a non-empty path
tail does not satisfy the broad-target requirement"* — which would release `~/.ssh/id_ed25519` and
`$HOME/.aws/credentials`, reasons about no terminator, and cannot coexist with clause 3 below.
**Wave 4A Task 7 keeps only its bank-drain rule and cites this task for the regex**; the benign
`0 of 51` figure on `command-expansion.json` belongs to this wave, not to 4A.

**What does *not* move.** `ClassCatalog()` (`internal/toolrisk/class_catalog.go:57-67`) is built from
`rl.class` and `rl.severity` over `commandRules`, `sensitivePathRules`, `contentRules`, plus three
AST classes. **It never reads `rl.re`.** So a regex change cannot move the 40-class catalog, cannot
move the parity vector digest `sha256:2cc7caef…f922`, cannot move `AI_TOOL_RISK_D4_TIERS`, and cannot
change malicious-floor membership. **No Backend deploy is required.** An **agent release is
required** — the regex ships in the agent binary, and `Installers/.github/workflows/release.yml` is
`workflow_dispatch`-only with a `bump` choice input.

## Task 1: Watch the block happen on a live endpoint, before changing anything

**Files:** no repo files. This task produces a run-log entry with a timestamp and a decision string.

Nobody has yet observed this block on a real endpoint. Every claim in this wave so far is a compiled
regex plus a read of the policy code. Close that gap before, not after.

- [ ] **Step 1.** On the endpoint, read the policy the daemon is actually serving. The route is
      `GET /v1/ai/policy`, registered at `Installers/internal/daemon/server.go:582` behind
      `requireDaemonToken`. Confirm `toolRisk.actions["destructive-rm"] == "block"` **as served**,
      not as stored in the console. Read the policy before theorising about enforcement code.
- [ ] **Step 2.** Ask the daemon for a decision on the benign command. `POST /v1/ai/tool-decision`,
      registered at `server.go:615`, same token gate. Body: tool `Bash`, input
      `{"command":"rm -rf $HOME/.cache/pip"}`.
- [ ] **Step 3.** Record the exact response: the decision, the finding class, the severity, and the
      reason string the developer would see. The hook mapping is at
      `Installers/internal/aihooks/pretooluse.go:102-133` — `block` becomes
      `permissionDecision: "deny"` and the tool is stopped outright; `warn` becomes `"ask"` with a
      `⚠ ` prefix. Expected here: **deny**.
- [ ] **Step 4.** Record the reason text against `classAlternatives["destructive-rm"]`
      (`Installers/internal/toolrisk/alternatives.go:15`), which tells the developer: *"Never target
      `/`, `~`, `$HOME`, or a system directory."* Note the mismatch in the run log — the message
      describes the narrowed rule, and the shipped rule fires on a subpath. That mismatch is part of
      the customer harm: the message does not describe what happened.
- [ ] **Step 5.** Repeat Steps 2-4 for `rm -rf ~/.npm/_cacache` and, as a control that the scanner is
      live, `rm -rf /` (must also deny). A benign deny with no control deny would prove nothing.

**Defeat test:** none — this is an observation, not a change. Its integrity clause is the control in
Step 5: **if `rm -rf /` does not deny, the endpoint is not enforcing and the whole run is void.**

**Exit:** a run-log entry naming the endpoint, the agent version from `devoid version --json`, the
served disposition for `destructive-rm`, and **3** recorded decisions — two benign denies and one
control deny. If any is not obtained, the entry says **NOT EXERCISED** and names why.

## Task 2: Write the twin tables as a failing test

**Files:** `Installers/internal/toolrisk/home_target_boundary_test.go` (new)

TDD order — the test lands first, red, against the shipped rule.

- [ ] **Step 1.** Write the attack table. Every row must be `destructive-rm` **true** both before and
      after the fix, so the table is a regression fence and not a description of the change:

| # | command | why it is a broad target |
|---|---|---|
| A1 | `rm -rf ~` | home root |
| A2 | `rm -rf ~/` | home root, trailing slash — also pinned by `quoting_bypass_pin_test.go` |
| A3 | `rm -rf $HOME` | home root — also pinned by `TestAnchorDefeat_UnanchoredAlternativesSurvive` |
| A4 | `rm -rf ${HOME}` | braced form. **Currently FALSE — this row is a new detection** |
| A5 | `rm -rf $HOME/` | trailing slash only |
| A6 | `rm -rf ~/*` | whole-home glob |
| A7 | `rm -rf $HOME/*` | whole-home glob |
| A8 | `rm -rf ~/.*` | every dotfile |
| A9 | `rm -rf ~/*/*` | two expansive segments |
| A10 | `rm -rf ~/.` | dot tail |
| A11 | `rm -rf ~/..` | parent tail |
| A12 | `rm -rf ~root` | another user's home root |
| A13 | `rm -rf ~root/*` | another user's home, globbed |
| A14 | `rm -rf ~/.ssh` | credential store — see the boundary note in Task 3 |
| A15 | `rm -rf ~/.ssh/` | same, trailing slash |
| A16 | `rm -rf ~/.ssh/id_ed25519` | file inside a credential store |
| A17 | `rm -rf $HOME/.aws/credentials` | credential store |
| A18 | `rm -rf ~/.gnupg` | credential store |
| A19 | `rm -rf ~/.kube/config` | credential store |
| A20 | `rm -rf ~/.config/gcloud` | credential store, nested |
| A21 | `rm -rf ~/.azure` | credential store |
| A22 | `bash -c "rm -rf ~"` | wrapper control — quote must be a valid terminator |
| A23 | `bash -c "rm -rf $HOME"` | wrapper control |
| A24-A29 | `rm -rf /`, `/etc`, `/*`, `.`, `*`, `/ tmp` | the six alternatives this wave does not touch |
| A30 | `rm -rf ~/;rm -rf /etc` | `;` must be a valid terminator |

- [ ] **Step 2.** Write the benign table. Every row must be `destructive-rm` **true today** (that is
      the bug) and **false after**:

| # | command | what it is |
|---|---|---|
| B1 | `rm -rf $HOME/.cache/pip` | pip cache |
| B2 | `rm -rf ~/.npm/_cacache` | npm cache |
| B3 | `rm -rf $HOME/projects/scratch` | scratch directory |
| B4 | `rm -rf ~/.cache` | cache root |
| B5 | `rm -rf ~/Downloads/tmp` | downloads |
| B6 | `rm -rf ~/go/pkg/mod` | Go module cache |
| B7 | `rm -rf ~/.gradle/caches` | Gradle |
| B8 | `rm -rf $HOME/.m2/repository` | Maven |
| B9 | `rm -rf ~/*/node_modules` | a literal last segment bounds the blast radius |
| B10 | `rm -rf ~/Documents` | a user-data subtree is not a broad target |
| B11 | `rm -rf ~/.config` | config root — **deliberately not** on the credential list |
| B12 | `rm -rf ~/.docker/buildx` | **deliberately not** on the credential list — see Task 3 |
| B13 | `rm -rf ~/.local/share/virtualenvs` | virtualenv store |
| B14 | `rm -rf $HOME/tmp/build-123` | build scratch |
| B15 | `bash -c "rm -rf ~/.cache/pip"` | the wrapped benign form |

- [ ] **Step 3.** Write the invariants table — rows that must not move in either direction:

| # | command | required |
|---|---|---|
| C1 | `rm -rf ./build` | false before and after |
| C2 | `rm -rf /tmp/mybuild` | false before and after |
| C3 | `rm -rf node_modules` | false before and after |
| C4 | `rm -rf "$HOME"` | **false before and after** — the pinned residue. Do not fix it here |
| C5 | `rm -f ~/.bash_history` | `destructive-rm` drops it; **`history-wipe` must still fire** |

- [ ] **Step 4.** Run it and watch it fail. Expected today: **0/30 attack failures, 15/15 benign
      failures** (B1-B15 all report `destructive-rm` present when the table says absent), plus **A4
      failing** (`${HOME}` reported absent when the table says present). Save that output — Task 6's
      delta is filled from it and nothing else.

**Defeat test:** `TestHomeTargetBoundary_BenignTwins` — this test **is** the defeat test for Task 3.
After Task 3, revert `toolrisk.go:122` to the shipped pattern and it goes RED with
`` B1 `rm -rf $HOME/.cache/pip`: destructive-rm present, want absent ``.

**Exit:** the file compiles and reports **50** rows across three tables, with **16** currently
failing. Not "the test exists" — the two counts.

## Task 3: Narrow the two POSIX home alternatives

**Files:** `Installers/internal/toolrisk/toolrisk.go:121-122` (and the comment block at `:118-120`)

**The rule, stated precisely.** `destructive-rm` is a *blast-radius* class sitting on an
un-relaxable malicious floor. Its POSIX home target is satisfied when, and only when, one of the
following holds:

1. **Home root.** The target is `~`, `~/`, `$HOME`, `${HOME}`, `$HOME/`, or `~<user>` — with no path
   tail beyond optional trailing slashes.
2. **An unbounded expansion of home.** The target is home followed by a tail in which **every**
   segment is purely expansive, i.e. matches `[*?.]+`. `~/*`, `$HOME/*`, `~/.*`, `~/*/*`, `~/.`,
   `~/..` qualify. `~/*/node_modules` does **not** — a literal final segment bounds the delete to a
   named set the user typed, and cleaning node_modules across projects is ordinary work.
3. **A named credential store under home.** The tail's first segment is one of exactly six:
   `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `.config/gcloud` — optionally with a deeper path
   under it.

And in every case the match must end on a **terminator**: a quote, whitespace, `;`, `|`, `&`, `)`, or
end-of-string. That is the same device `winBroadTarget` uses at `toolrisk.go:111-114` and it is what
stops a longer path that merely *begins* with a broad target from satisfying the rule.

**Where the boundary is, and why — answer the three questions the design raises.**

- **`$HOME/Documents`?** Not a broad target. A single named subtree is bounded and the user typed the
  name. It leaves the class. (B10.)
- **`$HOME/*`?** A broad target. It is `$HOME` written with an extra character, and the shell expands
  it to the same set. Clause 2. (A7.)
- **`$HOME/.ssh`?** **Stays in the class**, by clause 3, and this is a deliberate, arguable call.
  The reasoning: it is already blocked today, so keeping it blocked is the status quo, not a new hard
  block, and this wave's job is to remove the *new* harm rather than relitigate an existing one. It
  costs no Backend deploy and no new class. **It is nonetheless still an un-relaxable block on a
  narrow target**, which is the same shape of defect this wave exists to fix — so it is recorded as a
  named residual in Task 6 and handed to Wave 4B, where the right answer is its own admin-settable
  class (`credential-store-destroy`, MEDIUM, **not** on the malicious floor). That move needs a
  catalog change and therefore Backend-before-agent ordering, which is exactly why it cannot ride in
  this agent-only hotfix.
- **`.docker` and `.config` are deliberately absent from clause 3.** `~/.docker` holds registry
  credentials but `rm -rf ~/.docker/buildx` is a real cleanup shape, and `~/.config` is both a
  credential parent (gcloud) and the most common "reset my dotfiles" target. Both are named as
  coverage losses in Task 6 rather than papered over. `.config/gcloud` is listed explicitly so the
  credential path stays covered while its parent does not.
- **A tail that is itself broad but not purely expansive** — `~/Doc*`, `~/[a-z]*` — is **not**
  covered. A literal prefix bounds the set. Record both as residuals; do not widen the rule to chase
  them, because the widening reintroduces the false positives this wave removes.

**Candidate pattern.** Verified against all 50 rows of Task 2's tables; it is a starting point, not
the spec — the spec is the three clauses above and the tables.

```go
const homeRef       = `(?:~[A-Za-z_][A-Za-z0-9_.-]*|~|\$HOME|\$\{HOME\})`
const expansiveTail = `(?:/+(?:[*?.]+/+)*[*?.]+)?/*`
const homeTerm      = `(?:["'\s;|&)]|$)`
const credTail      = `/+(?:\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.config/+gcloud)(?:/[^\s"';|&]*)?`

// replaces the `~(?:/\S*)?|\$HOME\b` pair in the destructive-rm target alternation
homeRef + expansiveTail + homeTerm + `|` + homeRef + credTail + homeTerm
```

- [ ] **Step 1.** Apply the change to `toolrisk.go:122` only. Do not touch the six other target
      alternatives, the Windows dialect rules at `:138` and `:146`, or `winBroadTarget`.
- [ ] **Step 2.** Rewrite the comment at `:118-120`. It currently says *"rm -rf (or -fr / -r -f)
      targeting a broad path: /, ~, $HOME, /\*, . , .., a bare wildcard, or a top-level system dir.
      Narrow `rm -rf ./build` does NOT match"* — which describes the intent, not the behaviour. State
      the three clauses and the terminator, and say why `~/.cache/pip` is out.
- [ ] **Step 3.** Note the alternation ordering: `~<user>` must precede bare `~`. Go's `regexp` is
      leftmost-first, so `~root` reaches the user arm and `~/` falls through to bare `~`.
- [ ] **Step 4.** Run the full toolrisk and shellast suites, not just the new file:
```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
go test ./internal/toolrisk/... ./internal/shellast/... -count=1
go test ./internal/daemon/ -count=1 -run 'C12|InterpreterBody|ToolRisk'
```
      `TestAnchorDefeat_UnanchoredAlternativesSurvive`, `TestScan_QuotedBroadTargetIsNoLongerEvaded`
      and `TestScan_EnvironmentVariableTargetStillEvades` must all stay green.
      `internal/daemon/ai_tool_interpreter_body_test.go:142` uses `sh -c "rm -rf ~"` and must keep
      finding `destructive-rm`.
- [ ] **Step 5.** If `TestScan_EnvironmentVariableTargetStillEvades` goes red — meaning `rm -rf "$HOME"`
      now matches — **invert the pin per its own banner and record the mechanism**. Do not narrow the
      pattern to keep the pin green. (The candidate above does not flip it: the target position holds
      a quote and no arm starts with one.)
- [ ] **Step 6.** Record `rm -rf ${HOME}` as a **new detection**, not a side effect. The shipped
      `\$HOME\b` never matched the braced form; the fix closes that evasion while narrowing the rest.

**Defeat test:** `TestHomeTargetBoundary_BenignTwins` and `TestHomeTargetBoundary_AttackTwins` from
Task 2. Revert `toolrisk.go:122` to the shipped alternation: benign goes RED at B1 with
`` `rm -rf $HOME/.cache/pip`: destructive-rm present, want absent ``. Separately, delete the
`homeTerm` terminator from the expansive arm: attack goes RED at A22 with
`` bash -c "rm -rf ~": destructive-rm absent, want present ``, proving the terminator is what keeps
the wrapper control alive.

**Exit:** **50/50** rows in Task 2's tables pass, and the count of rows whose `destructive-rm`
verdict changed is exactly **16 removals + 1 addition = 17**, enumerated in the commit message.

## Task 4: Put the benign shapes into the ordinary-work corpus with a real denominator

**Files:** `Installers/internal/daemon/zz_c12_ordinary_work_probe_test.go`

The C12 probe is the existing "DeVoid does not interrupt ordinary work" measurement
(`ordinaryWork()` at `:94`, `dangerProbes()` at `:263`, `TestC12_OrdinaryWork_ZeroInterruptions` at
`:305`). It runs `toolrisk.Scan → decideTool` over a corpus in two lanes — LANE A (no cached policy,
severity default) and LANE B (a D4 policy fixture) — and fails unless interruptions are **zero**. Its
precondition clause asserts the scanner is live before counting zeros, and
`TestC12_DangerProbesStillCaught` is its defeat clause.

**Do not write the corpus size into this plan. The test prints its own denominator** (`:329`,
`C12TOTAL lane=%-34s corpus=%d interruptions=%d`), and a hand count taken while drafting this wave did
not reproduce against a syntactic count of `ordinaryWork()`. Read it:

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
go test ./internal/daemon/ -run TestC12_OrdinaryWork -count=1 -v 2>&1 | grep C12TOTAL
```

Call that printed number **N**. Every criterion below is stated against `N`, never against a literal.

**The corpus contains no `rm -rf ~/…` case at all.** That is why N ordinary commands could pass while a
pip-cache clean was hard-blocked fleet-wide.

- [ ] **Step 1.** Record **N** from the command above, before touching the file. Then add B1-B14 from
      Task 2 to `ordinaryWork()`. The denominator moves **N → N + 14**.
- [ ] **Step 2.** Run `go test ./internal/daemon/ -run TestC12_OrdinaryWork -count=1 -v` **before**
      Task 3's change is in the tree. It must report
      `C12TOTAL lane=… corpus=<N+14> interruptions=14` on both lanes and fail. If it reports zero
      interruptions, the cases were added wrong.
- [ ] **Step 3.** With Task 3 applied, the same command must report `interruptions=0` on both lanes.
- [ ] **Step 4.** Fix the stale fixture while you are here, in its own commit. `d4Policy()` in that
      file puts `destructive-rm` in the **warn** list. The shipped posture is **block** — the tally
      is 23 block / 2 warn / 12 monitor / 3 allow (`Backend/src/ai-security-policy/ai-security-policy.constants.ts:1195-1206`
      docblock; the table itself is 15/6/16/3 and the floor folds 8 up). A LANE-B fixture that
      disagrees with the shipped floor measures a policy no endpoint has. `dangerProbes()` marks
      `rm -rf /` as `want: "warn"` for the same stale reason and must become `"block"`.

**Defeat test:** `TestC12_OrdinaryWork_ZeroInterruptions`. Revert `toolrisk.go:122` and it goes RED
with 14 `C12INTERRUPT` lines naming `classes=destructive-rm/high`. Its own defeat clause
(`TestC12_DangerProbesStillCaught`, plus the precondition at the top of the zero-interruption test)
is what stops the fix being scored by deleting the detector.

**Exit:** `C12TOTAL corpus=<N+14> interruptions=0` on **both** lanes, where **N** is the denominator
the test printed before the change and the arithmetic is shown in the run log; and
`C12DANGERTOTAL probes=10 violations=0` with `rm -rf /` recorded as `want=block decision=block`
(`dangerProbes()` carries **10** entries, verified, and today marks `rm-root` as `want: "warn"`).

## Task 5: Prove no Backend deploy is needed, then cut the agent release

**Files:** no source changes. `Installers/.github/workflows/release.yml` (dispatch only).

- [ ] **Step 1.** Prove the class vocabulary did not move. `ClassCatalog()`
      (`Installers/internal/toolrisk/class_catalog.go:57-67`) reads `rl.class` and `rl.severity` and
      never reads `rl.re`, so a regex edit cannot change it. Demonstrate rather than assert:
```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
go test ./internal/toolrisk/ -run 'TestClassCatalog' -count=1
git diff --stat origin/main -- parity-vectors/toolrisk-classes.v1.json   # must be empty
node ../ci/lib/vocab-parity.mjs                                          # must print PASS, 40 classes
```
- [ ] **Step 2.** Record the conclusion in the run log, with its mechanism: **no Backend deploy.**
      Malicious-floor membership is unchanged (`ai-malicious-floor.ts:155` still lists
      `destructive-rm`), `AI_TOOL_RISK_D4_TIERS` is unchanged, the 40-class parity vector digest
      `sha256:2cc7caef…f922` is unchanged. Backend-before-agent ordering does not apply to this wave
      because nothing on the policy write path widens.
- [ ] **Step 3.** Run the gate that exists. Until Wave −1 Task 7 lands a `toolrisk-lane` leg, the
      only gate is a typed command; say so rather than writing "CI green":
```bash
cd C:/Users/Owner/Documents/Ceragon
node ci/lib/drift.mjs
node ci/lib/run.mjs Installers
cd Installers && go test ./internal/toolrisk/... ./internal/shellast/... ./internal/daemon/ -count=1
```
- [ ] **Step 4.** **An agent release IS required** — the regex ships in the binary.
      `release.yml` is `workflow_dispatch` with a `bump` choice (`patch`/`minor`/`major`) and a rare
      `explicit_version` override. Stable is **7.10.6**. Signing is optional
      (`bootstrap_trust_chain=FALSE`); stable has been signed since 7.10.4. **BLOCKED on: a fresh,
      explicit dispatch decision from the owner.** A green local run is not permission and merging is
      not releasing.
- [ ] **Step 5.** Deploy gates in this org are fail-closed on MISSING runs. If a dispatch is
      authorised, dispatch `pr-checks` and `security` on `main` **first**, then the release. Do not
      discover that ordering during the release.

**Defeat test:** Step 1 is itself the test — add a class to `astClassSeverity` in
`class_catalog.go` and `TestClassCatalog_ParityVector` goes RED with `parity vector is STALE`, which
is the signal that a Backend deploy *would* have been needed. If it stays green for a regex-only
change, the "no deploy" claim holds.

**Exit:** `git diff --stat origin/main -- parity-vectors/toolrisk-classes.v1.json` is empty,
`vocab-parity.mjs` prints `PASS -- all three repos carry the same 40 classes`, and the release
decision is recorded as either a dispatched version number or **BLOCKED — owner dispatch**.

## Task 6: Confirm on the live endpoint after, and publish the coverage delta

**Files:** run log; `.plans/m47a-20260822/v2-waves/W0A_COVERAGE_DELTA.md`

- [ ] **Step 1.** Repeat Task 1 Steps 1-5 against an endpoint running the released agent. Same three
      commands, same control. Expected: `rm -rf $HOME/.cache/pip` → **allow, no finding**;
      `rm -rf ~/.npm/_cacache` → **allow, no finding**; `rm -rf /` → **deny**. Record the agent
      version from `devoid version --json` on both the before and after runs, so the two observations
      are attributable to different builds.
- [ ] **Step 2.** Publish the coverage delta as a table, not a sentence. Every shape that **stopped**
      producing `destructive-rm`, with what it produces now: 14 corpus rows plus B15 (the wrapped
      form) plus `rm -f ~/.bash_history` — the last of which keeps its interruption through
      `history-wipe` (`Installers/internal/toolrisk/toolrisk.go:369-370`, the POSIX arm; the Windows
      dialect twin is at `:386`), verified: that rule's
      `\b(?:rm|>)\s*[^\n]*\.(?:bash|zsh)_history\b` alternative matches independently of
      `destructive-rm`.
- [ ] **Step 3.** Record the named residuals, each with its owner and its wave:
      - `rm -rf ~/.ssh` and the five other credential tails remain an **un-relaxable block**. Owner
        decision; Wave 4B moves them to `credential-store-destroy` (MEDIUM, off the floor), which is
        Backend-coupled.
      - `~/.docker/*` and `~/.config` leave the class entirely. No other class covers them.
      - `~/Doc*`, `~/[a-z]*` — literal-prefixed globs are not covered.
      - `rm -rf "$HOME"` — still evaded, still pinned, still recorded by
        `TestScan_EnvironmentVariableTargetStillEvades`.
- [ ] **Step 4.** Update `classAlternatives["destructive-rm"]`
      (`Installers/internal/toolrisk/alternatives.go:15`) only if the narrowed rule makes its wording
      wrong. It currently reads *"Never target `/`, `~`, `$HOME`, or a system directory"* — which is
      now accurate rather than over-claiming, so the likely correct action is **no change**, recorded
      as a deliberate no-op. `TestAlternative_CoversEveryNonInfoClass` requires ≥ 20 characters and no
      placeholder text.

**Defeat test:** none — Steps 1 and 2 are observations. Integrity clause: the control deny in Step 1.
An "after" run without a passing control is **NOT EXERCISED**, not green.

**Exit:** `W0A_COVERAGE_DELTA.md` exists with **16** removal rows and **1** addition row, each naming
the replacement class or `none`; and the run log carries **two** endpoint observations (before and
after) with different `devoid version --json` values and a passing control in each.

## Wave exit criteria

1. `go test ./internal/toolrisk/ -run TestHomeTargetBoundary -count=1` passes **50/50** rows.
   Defeat: revert `toolrisk.go:122` → RED at B1 with
   `` `rm -rf $HOME/.cache/pip`: destructive-rm present, want absent ``.
2. `go test ./internal/daemon/ -run TestC12_OrdinaryWork -count=1` reports
   `corpus=<N+14> interruptions=0` on **both** lanes, where **N** is the denominator the same command
   printed before Task 4's cases were added. Defeat: revert `toolrisk.go:122` → RED with 14
   `C12INTERRUPT` lines.
3. `go test ./internal/daemon/ -run TestC12_DangerProbesStillCaught -count=1` reports
   `probes=10 violations=0` with `rm -rf /` at `want=block decision=block`. Defeat: delete the
   `destructive-rm` rule entirely — this test goes RED while criteria 1 and 2 would have gone green,
   which is why it is separate.
4. The three pre-existing pins stay green: `TestAnchorDefeat_UnanchoredAlternativesSurvive`,
   `TestScan_QuotedBroadTargetIsNoLongerEvaded`, `TestScan_EnvironmentVariableTargetStillEvades`.
   Defeat: drop `"` from the terminator class → the first two go RED.
5. `git diff --stat origin/main -- parity-vectors/toolrisk-classes.v1.json` is empty and
   `node ci/lib/vocab-parity.mjs` prints `PASS -- all three repos carry the same 40 classes`. This is
   the evidence for "no Backend deploy". Defeat: add a class to `astClassSeverity` →
   `TestClassCatalog_ParityVector` goes RED with `parity vector is STALE`.
6. `W0A_COVERAGE_DELTA.md` enumerates **16** removals and **1** addition, each naming the replacement
   class or `none`, and lists **4** named residuals with an owning wave.
7. Two live endpoint observations exist — one before the release and one after — each with a passing
   `rm -rf /` control and a recorded `devoid version --json`. Without both, the wave's customer-impact
   claim is **NOT EXERCISED**.
8. **BLOCKED — owner dispatch.** The fix reaches zero endpoints until an agent release is cut, and a
   release needs a fresh explicit ask every time. Until then this wave's Risk 4 contribution is
   **UNKNOWN**, not green: the code is correct in the repository and the customer is still blocked.

---

# Wave 0 — Emergency egress correction

**Depends on:** Wave −1 (citations and manifest). Independent of Wave 0A; can run in parallel.
**Implements decisions:** D1 (pull both `ALLOW_MINIMAL` vars now; restore depth only where consent is
real) and D2 (enable ECS Exec on `backend-service`), as named at `plan:156`. Verify these numbers
against the revised decision table before citing them elsewhere.
**Certificate impact:** **Risk 1**. This wave removes **one unauthorized policy state**. It does not
build the pre-egress boundary, so per review P0-15 **R1 stays NOT_READY** and the residual gap is a
named row in the certificate, not a footnote.

## Context an engineer needs

**Read the old plan's Wave 0 body at `plan:150-1246` for the verbatim command blocks.** They are long
and correct; this section preserves the tasks, states what was re-verified, and adds what was
missing. Do not retype the AWS round-trips — copy them, with the corrections below applied.

**The premise is intact. Every source citation re-resolved against `origin/main` on 2026-08-28:**

| claim | file:line at `origin/main` | verified |
|---|---|---|
| the corpus is read from the customer's checkout | `GithubApp-Bot-Scanner-Worker/scanner-worker/src/opus-corpus-builder.ts:130` — `const buf = await fs.readFile(full);` | ✓ |
| it is POSTed to Anthropic | `…/scanner-worker/src/utils/anthropic-client.ts:42` — `const ENDPOINT = 'https://api.anthropic.com/v1/messages';` | ✓ |
| and to Gemini | `…/scanner-worker/src/utils/gemini-pro-fallback.ts:74` — the `generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` template | ✓ |
| the Opus privacy gate, code-default safe | `…/scanner-worker/src/opus-pass2.ts:936` — `if (evidenceMode === 'MINIMAL') { … CODEFENCE_OPUS_BASELINE_ALLOW_MINIMAL \|\| 'false' … }` | ✓ |
| the same gate in `explainOpusBaselineEligibility` | `…/scanner-worker/src/opus-pass2.ts:637-642`, returning `reason: 'minimal_evidence'` | ✓ |
| the Gemini twin | `…/scanner-worker/src/gemini-vuln-review.ts:410-416`, `CODEFENCE_GEMINI_VULN_REVIEW_ALLOW_MINIMAL` | ✓ |
| both overrides committed in all three task-defs | `deployment/scanner-worker-task-def.json:90-91`, `deployment/scanner-worker-heavy-task-def.json:85-86`, `deployment/scanner-worker-fullrepo-task-def.json:92-93` | ✓ |
| `MINIMAL` is the backend's last fallback | `Backend/src/github-app/services/scan-dispatch.service.ts:4247` — `const defaultEvidence: EvidenceMode = 'MINIMAL';` | ✓ |
| the console writes a fixed, non-editable `STANDARD` | `Frontend/components/pr-security/policy-editor-dialog.tsx:52` and `Frontend/components/admin/code-security-sections.tsx:41` | ✓ |

**⚠️ NO AWS CALL WAS MADE in the 2026-08-27 disposition pass, and none was made on 2026-08-28
either.** Every live claim the old plan carries is therefore **UNKNOWN** and must be re-measured
before it is acted on:
- `codefence-scanner-worker:164`, `-fullrepo:40`, `-heavy:96` — rollback revisions.
- environment lengths 61 / 62 / 56.
- `desiredCount: 0` / `runningCount: 0` on both scanner services, autoscaling targets at
  `MinCapacity: 0, MaxCapacity: 0`, three `SuspendedState` flags true on
  `service/cera-workers-staging/codefence-scanner-worker` — the "blast radius right now" statement.
- `backend-service` on `backend:318` with `enableExecuteCommand: false`. **Memory records the
  deployed Backend as task definition 322**, so `318` is almost certainly stale; measure it.
- the 19 inline policies on `ecsTaskExecutionRole` with zero `ssmmessages` hits.

Task 1 Step 2 in the old plan is the confirm-before-you-change step and it exists for exactly this.
**Whatever prints when you run it is the truth; the numbers in the plan are a hypothesis.**

**Three corrections to apply while transcribing:**
1. **Delete the dead scratchpad path.** `plan:217` and the other lines inside this wave that
   `ci/lib/plan-citations.mjs` prints — do not carry a hand count — hard-code
   `…/Temp/claude/C--Users-Owner-Documents-Ceragon/a381f855-c847-4974-8e16-0fee10b3bb55/scratchpad/w0`,
   a per-session directory that no longer exists. Resolve a scratch root at run time.
2. **`worker.ts` line numbers have drifted.** The old plan cites `worker.ts:1780-1804` for the
   `opus_scan_invoked` telemetry and `:1789` for the `opus_cost_usd = 0` note; measured at
   `origin/main` the `console.log(` is at `:1788`, `event: 'opus_scan_invoked'` at `:1790`, and the
   explanatory comment at `:1791-1793`. Cite the symbol and a discovery command, per Wave −1 Task 4:
   `git grep -n "opus_scan_invoked" -- scanner-worker/src/worker.ts`.
3. **Shell.** All commands are Git Bash on Windows. Any argument starting with `/` — log group names,
   container commands, `git show origin/main:<path>` — needs `MSYS_NO_PATHCONV=1` or Git Bash
   rewrites it into a Windows path. This bit during this very verification pass.

**Why the guard did not catch it.** `GithubApp-Bot-Scanner-Worker/deployment/validate-taskdef-security.js`
asserts `NODE_ENV=production`, `CODEFENCE_SIGNED_CONTRACTS_REQUIRED=true`, a non-empty
`INTERNAL_SELF_SCAN_REPOS`, the SQS timing contract, env-vs-secret placement, and required SSM
secrets. It has **no privacy or egress invariant**, which is why all three committed task-defs pass it
today. Task 2 is that invariant.

## Task 1: Strip both `ALLOW_MINIMAL` overrides from the three live task definitions

**Files:** no repo files — live AWS state. Steps verbatim from `plan:221-407`.
- [ ] Record pre-change revisions to a file; whatever prints **is** the rollback target, not `164/40/96`.
- [ ] Confirm the defect is still live: `length(...environment[?ends_with(name,'_ALLOW_MINIMAL')])`
      must print `2` per family. A `0` means someone already fixed that family — skip it and say so.
- [ ] Dump, filter with the `jq` `del(...)` + `map(select(…endswith("_ALLOW_MINIMAL")|not))`
      expression, re-register, repoint both services.
- [ ] Do **not** hand-edit `.containerDefinitions[0].image`. The live defs pin an image SHA that the
      deploy workflow substitutes for `:latest`; re-registering from `describe-task-definition`
      preserves the pin.
- [ ] No secrets and no raw customer content in the run log. Redact before pasting a task-def.

**Defeat test:** re-add one override in a **staging** task definition and re-run the Step 2 query — it
must print `1` or `2`, not `0`. The pre-egress assertion from Task 8 must go red on that revision
before any request is issued.
**Exit:** the `_ALLOW_MINIMAL` count is **0** for all three families, evidenced by a
`describe-task-definition` diff captured before and after.

## Task 2: Give the task-def validator a privacy/egress invariant

**Files:** `GithubApp-Bot-Scanner-Worker/deployment/validate-taskdef-security.js`. Steps at `plan:408-580`.
- [ ] Write the failing test first: the validator must exit **1** on a task-def carrying any
      `*_ALLOW_MINIMAL` set to `"true"`, and **0** when the value is `"false"` or the key is absent.
- [ ] Land the validator change and the task-def change in the **same** PR, so the gate is never red
      from its first commit.

**Defeat test:** `node deployment/validate-taskdef-security.js` against a fixture with
`CODEFENCE_OPUS_BASELINE_ALLOW_MINIMAL=true` — exit **1** with the variable named. Remove the new
invariant and the fixture passes, which is the regression.
**Exit:** exit code **1** on the true-valued fixture, **0** on all three cleaned committed task-defs,
**0** on a false-valued fixture.

## Task 3: Remove the overrides from the committed task-defs

**Files:** the three `deployment/*-task-def.json`. Steps at `plan:581-709`.
- [ ] Delete lines `90-91`, `85-86`, `92-93` respectively — re-resolve those line numbers first; they
      were verified on 2026-08-28 but the repo is 20 commits ahead of the local checkout.
**Defeat test:** `grep -rn ALLOW_MINIMAL deployment/` on the merged `main` returns nothing; re-add one
line and Task 2's validator goes red in the same PR.
**Exit:** `grep -rn ALLOW_MINIMAL deployment/` returns **0** matches on merged `main`.

## Task 4: Enable ECS Exec on `backend-service`

**Files:** live AWS state + an inline IAM policy. Steps at `plan:710-861`.
- [ ] Add inline policy `AllowEcsExecSsmMessages` with the four `ssmmessages` actions to
      `ecsTaskExecutionRole`, then set `enableExecuteCommand` on the service and force a new deployment.
- [ ] **Record the scope honestly:** `ecsTaskExecutionRole` is also the *task* role for the `frontend`
      family. The grant makes exec possible there too; a session still requires
      `enableExecuteCommand` on that service, which stays `false`. Narrowing it needs `backend` to
      have its own task role — a task-definition change, out of scope, recorded as an open item.
**Defeat test:** `aws ecs execute-command --container backend --interactive --command "/bin/sh"`
opens and reaches a prompt. Remove the inline policy and the session fails with an SSM error.
**Exit:** `describe-services … --query 'services[0].enableExecuteCommand'` returns `True` **and** one
session reached a prompt. The flag alone is not the exit.

## Task 5: Restore depth on our own repositories via `.codefence.yml`

**Files:** `.codefence.yml` in each of our own enabled repos. Steps at `plan:862-985`.
- [ ] `STANDARD` is the correct and attainable dial: it clears the `evidenceMode === 'MINIMAL'` gate in
      both `opus-pass2.ts` and `gemini-vuln-review.ts` and does not ship per-finding snippets.
      `RICH` is not attainable — it is clamped without `LLM_SOURCE_OPT_IN`, and a per-org
      `llm_on_source_opt_in` row must also read the literal string `'true'`.
**Defeat test:** Task 7 Step 4 — an `opus_scan_invoked` event with `opus_cost_usd > 0` for that repo.
**Exit:** every repo from `GET /api/v1/github/repositories?isEnabled=true` is accounted for: either a
merged `.codefence.yml` with `evidenceMode: STANDARD`, or listed in the run log as deliberately left
as-is with a reason. The denominator is the endpoint's count, printed.

## Task 6: Restore depth on the local-scan lane via a repo-scoped scan policy

**Files:** policy rows via `POST`/`PUT /api/v1/github/policies`. Steps at `plan:986-1102`.
- [ ] **Read the org default row live** before writing any "N repositories were affected" line. The
      code default is `MINIMAL` but the console writes `STANDARD` into every policy it creates, so
      the resolved value is a database fact, not a code fact.
**Defeat test:** re-read each policy after the write and diff `config.failOn` against the org default;
a drifted `failOn` is a silent policy weakening riding along with an evidence-mode change.
**Exit:** for each repo, `config.evidenceMode == "STANDARD"` **and** `config.failOn` byte-identical to
the org default **and** its push-protection baseline still active — three assertions, not one.

## Task 7: Deferred live verification at power-on

**Files:** run log only. Steps at `plan:1103-1230`.
- [ ] **Everything in Tasks 1, 5 and 6 is NOT EXERCISED until a task runs.** Both scanner services sit
      at `desiredCount: 0` — re-verify, it is a 2026-08-22 observation.
- [ ] `scripts/ceragon-power-on.ps1` reads state from `$env:CERAGON_POWER_STATE_PATH` or
      `%USERPROFILE%\.ceragon\aws-power-state.json` (`:64-78`), **not** from
      `scripts/ceragon-power-state.json`. That path does not exist on this box, so `Read-PowerState`
      falls back to `Get-DefaultState`, whose `scalableTargets` list has **no entry for**
      `service/cera-workers-staging/codefence-scanner-worker`. Register that scalable target
      explicitly at `--min-capacity 1` or autoscaling drives the service back to 0 within minutes.
      Leave the three `SuspendedState` flags alone — `min: 1` is what holds the service up.
- [ ] Filter CloudWatch on `evidenceMode=MINIMAL`, **not** on `"Opus baseline skipped"` — that phrase
      also appears on the missing-API-key line, so a hit there would not prove the privacy gate fired.
      Always bound `--start-time`; the group has 30-day retention.
- [ ] **Absence of a log line is not evidence.** No skip line plus no confirmed run is **UNKNOWN**,
      not green. Confirm the run happened first.
- [ ] Record the two standing observations: the `-heavy` family has no log group and no service, so it
      has never run; and the console decides `evidenceMode` and shows no control for it.
**Defeat test:** Step 3's negative control — a repo that resolves to `MINIMAL` must log the skip line.
If no such repo exists because the org default is already `STANDARD`, say so and mark the step NOT
EXERCISED rather than manufacturing one.
**Exit:** a run log split into **PROVEN LIVE** and **NOT EXERCISED**, item by item, with no item
claimed green on the absence of a log line, and `MinCapacity: 1` on the scanner scalable target.

## Task 8 (NEW): The residual pre-egress boundary and the Risk 1 certificate row

**Files:** `GithubApp-Bot-Scanner-Worker/scanner-worker/src/utils/anthropic-client.ts`,
`…/utils/gemini-pro-fallback.ts`; the certificate manifest.

Removing the override closes one unauthorized *policy state*. It does not create a *boundary*: the
same corpus still reaches the same two endpoints whenever the resolved evidence mode permits it, and
there is no assertion at the last point before the wire. Review P0-15 is not closed by this wave and
the plan must say so.

- [ ] **Step 1.** Write a pre-egress assertion at the single point each client actually sends —
      `anthropic-client.ts:42`'s `ENDPOINT` call site and the `fetch` at `gemini-pro-fallback.ts:74`.
      It receives the resolved evidence mode alongside the payload and **throws before the request is
      issued** if the mode is `MINIMAL`. Today the decision is made far upstream in `opus-pass2.ts`
      and `gemini-vuln-review.ts`; a second gate at the wire is what makes a future upstream
      regression fail closed instead of silently sending.
- [ ] **Step 2.** Enumerate every provider route, not just these two, and record which have a
      pre-egress assertion and which do not. A boundary that covers two of N routes is a partial
      boundary and the manifest must carry the fraction with its denominator.
- [ ] **Step 3.** Write the R1 certificate row. `status: "NOT_READY"`, with the blockers named from
      source material §5.4: 51 of 81 DLP classes ungovernable; two published FN residuals
      (`attack-private-key-block`, `attack-prod-db-connection-string`) plus the ingress private-key
      leak reaching the provider verbatim; **no pre-egress boundary across every provider route
      (P0-15)**; no inspection-completeness contract — `InspectionDegraded`
      (`Installers/internal/proxy/openai_downlink_inspection.go:16-17`) has **zero production
      consumers**, verified — its only references are in the defining file and its test, and
      **Wave 3 Task 6 gives it its first production consumer**, so this blocker stays on the R1 row
      until that lands; **F16 key custody absent**
      (`docs/Devoid_Roadmap_To_Finished_Product.md:788`, the *"Named trust prerequisite — F16 respec"*
      paragraph);
      prompt-evidence key distribution and `ai_events` retention are declared exclusions.
- [ ] **Step 4.** **BLOCKED, external: F16.** Non-exportable endpoint signing-key custody needs a
      SYSTEM/privileged broker or a KMS/HSM/TPM key owner — procurement plus a key ceremony. R1
      cannot certify without it. This is a named external dependency, not an engineering task, and no
      task in this wave may pretend otherwise.

**Defeat test:** `pre-egress-assertion.test` (new). Construct a request with
`evidenceMode: 'MINIMAL'` and call the client directly; it must throw **before** any network call —
assert on a mocked transport that recorded **zero** invocations. Delete the assertion and the test
goes RED with `provider request was issued under evidenceMode=MINIMAL`.

**Exit:** the assertion exists at **2** provider call sites, the enumeration in Step 2 prints
`covered/total` with a real denominator, and the R1 row in the certificate reads `NOT_READY` with
**6** named blockers, one of which is marked **BLOCKED — F16, signing-infrastructure dependency**.

## Wave exit criteria

1. `_ALLOW_MINIMAL` count is **0** on all three live task-def families, evidenced by a
   `describe-task-definition` diff captured pre and post. Defeat: re-add one override in a staging
   task definition — the count query and Task 8's pre-egress assertion both go red.
2. Both `cera-workers-staging` services point at the new revisions, and the pre-change revisions —
   whatever Task 1 Step 1 printed, **not** the plan's `164/40/96` — are written down as the rollback
   target.
3. `grep -rn ALLOW_MINIMAL deployment/` returns **0** on merged `main`.
4. `node deployment/validate-taskdef-security.js` exits **1** on a `*_ALLOW_MINIMAL=true` fixture,
   **0** on all three committed task-defs, **0** on a `false`-valued fixture. Defeat: remove the
   invariant and the true-valued fixture passes.
5. The validator commit and the task-def commit are in **one** merged PR to
   `Ceragon-Prod/GithubApp-Bot-Scanner-Worker` main.
6. `enableExecuteCommand` is `True` **and** one `aws ecs execute-command` session reached a prompt.
7. The org default policy's live `config.evidenceMode` is in the run log, read from
   `GET /api/v1/github/policies` — not inferred from `scan-dispatch.service.ts:4247`.
8. Every enabled repository is accounted for, against the endpoint's own count as denominator; and
   for each, `evidenceMode: "STANDARD"`, `failOn` byte-identical to the org default, and push
   protection still active.
9. Task 7 has run against a powered-on fleet with `MinCapacity: 1` on the scanner scalable target,
   and the run log names PROVEN LIVE vs NOT EXERCISED item by item.
10. The pre-egress assertion exists at **2** provider call sites and the route enumeration prints
    `covered/total`. Defeat: `pre-egress-assertion.test` with a mocked transport asserting zero
    invocations.
11. The R1 certificate row reads **NOT_READY** with **6** named blockers. **BLOCKED — F16
    (signing-infrastructure dependency, procurement and key-ceremony lead time). R1's certificate
    contribution from this wave is one closed policy state, not a boundary.**
12. Three open items are recorded and carried forward: the missing
    `/ecs/codefence-scanner-worker-heavy` log group alongside a non-existent heavy service; the
    console hard-coding a non-editable `evidenceMode: "STANDARD"` into every policy it creates while
    showing no control for it (`policy-editor-dialog.tsx:52`, `code-security-sections.tsx:41`); and
    `backend` sharing `ecsTaskExecutionRole` as its task role with `frontend`.
