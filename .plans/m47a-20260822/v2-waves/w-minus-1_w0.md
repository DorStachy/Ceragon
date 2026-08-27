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
| `Ceragon-Intelligence` | `58404e0a3db5` (`feat/push-depth-cli-ui`) | `486d937bcbe0` | 168 |
| `Static-Worker` | `a7326106e71c` (`feat/install-gate-scan-quality`) | `44d7aabb8b84` | 75 |
| `Sandbox-Worker` | `1a9072538e09` (`chore/cleanup-unnecessary-files`) | `2831997dfe84` | 67 |
| `GithubApp-Bot-Scanner-Worker` | `ed9209996148` (`codex/m42-scanner-reliability`) | `3d4116a5e5b1` | 20 |

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
  `workflow_dispatch` + `cron "15 6 * * *"`. Its header at **:30-31** carries a written instruction:
  *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the SAME change that re-vendors the
  files."* T-M2 landed (`MANIFEST.json` pin is now `254d24fc`). The trigger did not.

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
`git cat-file -t` fails in all of them. So the generated artifact is pinned to a commit this
workspace cannot see. Do not assume it is an Installers commit. Task 3 opens with a discovery step,
not an assumption.

**Two plan citations in the source material are themselves wrong, and correcting them is part of
this wave.** The dead per-session scratchpad path is **not** at `plan:781` (that line is
`aws iam put-role-policy --role-name ecsTaskExecutionRole`). It is at `plan:217, 224, 231, 232, 278,
293, 313, 330, …` — **15 occurrences, 12 of them inside Wave 0's line range**. And
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
- [ ] Name `docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md:695-829`
      as the **sole** numeric SLO authority. Do not create a second table.
- [ ] Add the certificate TTL: **90 days**, matching AIUC-1's quarterly re-test requirement.

**Defeat test:** `claim-contract-guard` (new, `ci/lib/claim-contract.mjs`). It greps the plan and any
release note for the forbidden strings ("zero false positives", "all detections", "M4.7A is
complete", "9/10", "high-assurance") outside a fenced *forbidden* block. Re-insert "zero false
positives" into the goal statement and it must go RED naming the line.

**Exit:** the goal statement contains the sentence *"None of the five risk lanes can reach PASS from
this packet"*, and the forbidden-claims checklist has **at least 15** rows (8 from §7 "forbidden
outright" + 7 from "forbidden by the research"), each with a named source.

## Task 3: Generate the DLP class catalog instead of hand-editing counts

**Files:**
- `Installers/internal/dlp/registry.go` (`RegisteredClasses`, `:221`)
- `Backend/packages/shared-contracts/src/generated/ai-security-portable.generated.ts` (`:54`)
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts` (`:262`)
- `Backend/packages/shared-contracts/` **and** the workspace-root `packages/shared-contracts/` — see
  the trap below

- [ ] **Step 1, discovery — do not guess.** The generated file pins
      `AI_SECURITY_PORTABLE_SOURCE_COMMIT = "d366f5f8c76fac253d9adf7914873e97a955a16d"`, which
      resolves in **none** of the seven checkouts. Find where it lives before writing any generator:
```bash
cd C:/Users/Owner/Documents/Ceragon
for d in Backend Frontend Installers Ceragon-Intelligence Static-Worker Sandbox-Worker GithubApp-Bot-Scanner-Worker; do
  printf "%-30s " "$d"; git -C "$d" cat-file -t d366f5f8c76fac253d9adf7914873e97a955a16d 2>&1 | head -1
done
grep -rn "generate:ai-security-backend-consumer" Backend/package.json Backend/scripts/ 2>/dev/null
```
      If it resolves nowhere, the generator's provenance is **UNKNOWN** and that is a finding: the
      Backend's closed DLP vocabulary is pinned to a commit this workspace cannot verify. Record it
      before proceeding.
- [ ] **Step 2, write the failing test first.** A parity spec that asserts
      `AI_DLP_CLASSES.length === RegisteredClasses().length` and that the sets are equal. It must
      fail today at **30 vs 81**, naming the 51 missing classes.
- [ ] **Step 3.** Make `AI_DLP_CLASSES` derive from the producer registry rather than from a
      hand-maintained 30-entry tuple. Widening a closed action vocabulary is a **write-path** change:
      `assertClosedActionMap` throws and `validateActionMap` 400s on any key outside the tuple, so
      **Backend deploys before any agent release** or the console 400s on the first policy PUT that
      carries a new class.
- [ ] **Step 4.** Assign each of the 51 newly-governed classes a shipped default posture from
      `classSpec.defaultAction` in the producer (`registry.go`), not an invented one. Note that
      `private-key-candidate` is `familyInconclusive` at `PostureMonitor` **by design** — a parse
      failure must not become an enforcement decision. Do not promote it.

**⚠️ Trap — three copies, two builds, one reference.** `@ceragon/shared-contracts` exists in three
places. `Backend/package.json` resolves it to `Backend/packages/shared-contracts/` — that is the copy
that ships. `Ceragon-Intelligence/packages/shared-contracts/` is the vendored standalone mirror. The
**workspace-root** `packages/shared-contracts/` is on no build path but is the canonical reference
that seven Backend parity specs compare against, including
`Backend/src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts`, which runs in the default
jest lane. Editing the root copy changes what the parity checks consider correct; editing the Backend
copy changes what ships. Both are usually needed and they are different acts.

**Defeat test:** add one temporary class to `classRegistry` in `Installers/internal/dlp/registry.go`.
The new DLP generator gate must go RED with the class name in the message. Separately, replace one
shipping `dlp.ScanAll` call with `dlp.Scan` and confirm `TestNoSurfaceScansShallow` goes RED — this
one is **already proven red** at `internal/dlp/scan_depth_guard_test.go:140` with
`these surfaces reach internal/dlp through a PARTIAL detector set`.

**Exit:** `AI_DLP_CLASSES.length === RegisteredClasses().length`, and the number is printed by the
test rather than written in the plan. Today that number is **81**; if the producer changes, the exit
criterion follows it without an edit.

## Task 4: Repair every citation in the plan

**Files:** the revised plan text only.

- [ ] Delete the dead per-session scratchpad path — **15 occurrences**, first at `plan:217`, 12 of
      them inside Wave 0. Replace with a discovered workspace-scratch root, resolved at run time.
- [ ] Replace the **51 bare-basename references** with `<repo>/<path>:<symbol>`. Confirmed examples:
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
`past EOF: internal/dlp/dlp.go has 1510 lines`.

**Exit:** the resolver reports **0** unresolvable references, **0** past-EOF references, and **0**
unqualified basenames, out of a count it prints itself.

## Task 5: Restore the two instruments that no longer gate

**Files:**
- `Installers/.github/workflows/holdout-score.yml` (`:6` header, `:13` header, `:22-25` `on:`)
- `Frontend/.github/workflows/vendored-upstream-drift.yml` (`:30-31` instruction, `:39-43` `on:`)

- [ ] **Fix the header first, whatever the trigger decision is.** `holdout-score.yml:6` currently
      states a push trigger the file does not have. A file that describes a trigger it lost is worse
      than a file with no comment: it is a live self-contradiction in source that a reader will trust.
- [ ] **Owner decision, not an engineering one.** Either restore `push:` on `main` to
      `holdout-score.yml`, or write into the file that detector quality is a nightly, non-gating
      report. Actions were unblocked org-wide on 2026-08-27, so the constraint is budget, not
      availability. **BLOCKED on: an explicit owner cost decision.** Do not restore the trigger on
      your own authority — its removal was an owner decision on 2026-08-25.
- [ ] Add `pull_request:` to `vendored-upstream-drift.yml`, per the file's own written instruction at
      `:30-31`. T-M2 has landed and `MANIFEST.json` pins `254d24fc`, current — the precondition the
      instruction names is satisfied, so this half is **not** blocked.
- [ ] Record the honest caveat that survives either decision: the console-engine claim is guarded
      **per-PR against local edits only**; upstream drift is a daily poll until the `pull_request`
      trigger lands.

**Defeat test:** for `vendored-upstream-drift`, open a PR that bumps `MANIFEST.json`'s pin without
re-vendoring; the job must go RED. For `holdout-score`, the defeat test is the header itself: revert
the header to claim a push trigger while `on:` has none, and `ci/lib/workflow-header-truth.mjs` (new)
must go RED with `holdout-score.yml:6 claims a push trigger; on: at :22 has none`.

**Exit:** `vendored-upstream-drift.yml` `on:` contains `pull_request`. `holdout-score.yml`'s header
and its `on:` block agree, verified by the header-truth check. The trigger question itself is
recorded as **BLOCKED — owner cost decision**, and the certificate contribution for detector-quality
freshness is **UNKNOWN** until it is answered.

## Task 6: Add the standards columns to the class catalog

**Files:** the class-catalog table in the plan; the manifest schema from source material §5.3.

- [ ] Add three per-class columns: **ATLAS technique id** (pin an `atlas-data` release; **v2026.07**
      is current, and v2026.05 added a `platform` field that includes `Agentic`), **OWASP LLM:2026 /
      ASI id**, **AIUC-1 control id**.
- [ ] Use the **2026** OWASP edition. The 2026 Top 10 for LLM Applications shipped 2026-08-03 and
      renumbered 8 of 10 — **Excessive Agency moved from LLM06 to LLM03**, which is the entry the
      2026-08-23 review leans on hardest while citing `:2025` ids. Also map OWASP Top 10 for Agentic
      Applications 2026 (ASI01–ASI10). ASI09 (Human-Agent Trust Exploitation) requires a confirmation
      dialog to display **the raw action, not an agent-authored summary** — a control this product
      ships and does not test. Add that test in Wave 5.
- [ ] Map the AIUC-1 Q3-2026 controls that match this product's surface: **A008** (secrets in
      generated code/logs/storage), **B010.3** (typosquatted and hallucinated dependencies),
      **B006.3** (scanning configuration artifacts for prompt-injection risk — exactly the rule-file
      walk that PR #179 un-capped), **B006.1** (approved MCP servers only). One corpus run then
      serves the internal gate and the external audit.
- [ ] `grep -ci owasp` over the current plan returns **0**. That is the baseline this task moves.

**Defeat test:** `standards-mapping-totality` (new). Every class in the generated catalog must carry
a non-empty `owaspLlm2026` **or** an explicit `"n/a"` with a reason. Remove one mapping and it goes
RED naming the class.

**Exit:** every one of the 40 tool-risk classes and all producer DLP classes carries a standards row,
and `atlasRelease` is pinned to a named release string in the manifest.

## Task 7: Make the parity checker and the toolrisk tests run somewhere

**Files:** `ci/lib/vocab-parity.mjs`; `ci/gates.json`; one repo's workflow.

- [ ] `ci/lib/vocab-parity.mjs` exists (24,024 bytes, added `221bd5b` 2026-08-26) and prints
      `PASS -- all three repos carry the same 40 classes…`, reporting `NOT CHECKED` rather than
      passing on a missing checkout. It lives at the **workspace root, outside all three repos**, so
      **no repo's own CI runs it**. Give it a home inside at least one repo's CI.
- [ ] Record the harder fact and act on it: **`internal/toolrisk` runs in no PR-time job and in no
      mirrored leg.** `grep -c toolrisk Installers/.github/workflows/pr-checks.yml` = 0. `go test ./...`
      reaches it only from `internal-candidate.yml:87` (`workflow_dispatch`). `ci/gates.json` mirrors
      `pr-checks:{hot-path-audit-imports, scanner-parity, wire-lane-tests, codex-vendor-lane,
      ai-checkpoint-observation, codex-hook-lane-live-proof, release-workflow-contract,
      self-update-lane, macos-legacy-identity}`, `holdout-score:score` and
      `finding-b-e2e:shim-enforcement` — none of which runs `./internal/toolrisk/...`.
- [ ] Add a `toolrisk-lane` job that runs `go test ./internal/toolrisk/... ./internal/shellast/... -count=1`
      and mirror it in `ci/gates.json`, so Wave 0A's defeat tests have a gate to be red in. Adding a
      job to `pr-checks.yml` while it has no `pull_request` trigger buys nothing on GitHub but does
      buy the mirrored local leg — say which of the two you are getting.

**Defeat test:** `node ci/lib/drift.mjs` must report the new leg as mirrored. Delete the
`ci/gates.json` entry and drift must go RED.

**Exit:** `node ci/lib/run.mjs Installers` executes a leg whose command contains
`./internal/toolrisk/`, and `node ci/lib/vocab-parity.mjs` is invoked from inside at least one repo's
workflow file rather than only from the workspace root.

## Wave exit criteria

1. `REBASE_MANIFEST.md` carries **7** rows with live `origin/main` SHAs and integer behind-counts,
   regenerated by a script. Defeat: `w-1-rebase-manifest.test` — hand-edit one SHA, it goes RED.
2. The plan's goal statement contains *"None of the five risk lanes can reach PASS from this packet"*
   and the five per-lane blocker lists. Defeat: `claim-contract-guard` — re-insert "zero false
   positives", it goes RED.
3. The forbidden-claims checklist has **≥ 15** rows, each with a named source. Defeat: same guard.
4. `AI_DLP_CLASSES.length === RegisteredClasses().length` — today **81**, printed by the test, not
   written down. Defeat: add a temporary class to `classRegistry`, the generator gate goes RED.
5. `ci/lib/plan-citations.mjs` reports **0** unresolvable, **0** past-EOF, **0** unqualified
   references out of a total it prints. Defeat: point one citation at `dlp.go:1519`, it goes RED.
6. `grep -nE '\b(114|108|30 DLP|46 toolRisk)\b'` over the plan returns no *exit criterion* — the
   static denominators at `plan:9654` ("the governed-class denominator is 114") and `plan:4566`
   ("all 30 DLP classes") are gone, replaced by catalog digests. Defeat: re-add `plan:9654` verbatim
   and criterion 4's test disagrees with it.
7. `vendored-upstream-drift.yml` `on:` contains `pull_request`. Defeat: a PR bumping the manifest pin
   without re-vendoring goes RED.
8. `holdout-score.yml`'s header and its `on:` block agree. Defeat: `ci/lib/workflow-header-truth.mjs`.
   **The trigger decision itself is BLOCKED on an owner cost decision — this wave's certificate
   contribution for detector-quality freshness is UNKNOWN, not green.**
9. `node ci/lib/run.mjs Installers` runs a leg covering `./internal/toolrisk/`, and
   `node ci/lib/vocab-parity.mjs` runs inside a repo's CI. Defeat: `node ci/lib/drift.mjs`.
10. Cross-repo defeat, run once at the end of the wave: add one temporary class to the **tool-risk**
    producer and separately to the **DLP** producer. **Every** consumer gate must go red —
    `Backend .../ai-security-policy.tool-risk-class-parity.spec.ts:226`, the Frontend toolrisk class
    parity test, `TestClassCatalog_ParityVector` (`… parity vector is STALE`), and the new DLP
    generator gate. A consumer that stays green is an ungovernable class waiting to ship.

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
rules already encode"*, and states the boundary explicitly at `:106-109`: *"Everything narrower is
deliberately outside it. Deleting `node_modules`, a `.\build` directory or a scratch path under the
user's own workspace is ordinary developer work on this very box and must stay allowed"* — and at
`:107-110`: *"Each alternative ends on a quote, whitespace or end-of-string so a LONGER path that
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
   change flips it anyway, **invert the pin, never restore the evasion**.
3. **RE2 has no lookahead.** A "no further path characters" assertion must be a **consumed**
   terminator character. That is exactly what `winBroadTarget` does. Consequence: the reported
   `Finding.Start/End` span widens by one byte on the new arms. Check
   `internal/daemon/ai_preview_window.go` and the span-sensitive comment at
   `internal/toolrisk/expansion_fp_test.go:18` before assuming nothing downstream reads the span.
4. **`internal/toolrisk` is in no CI gate.** See Wave −1 Task 7. Your defeat tests run when a human
   types `go test`, or in the mirrored leg Wave −1 adds — and nowhere else. State which.

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

The C12 probe is the existing "DeVoid does not interrupt ordinary work" measurement. It runs
`toolrisk.Scan → decideTool` over a corpus in two lanes — LANE A (no cached policy, severity default)
and LANE B (a D4 policy fixture) — and fails unless interruptions are **zero**. Counted at
`origin/main`: **109 cases** (69 POSIX commands, 29 PowerShell, 5 security-engineering, 6 non-Bash
tool calls). Its precondition clause asserts the scanner is live before counting zeros, and
`TestC12_DangerProbesStillCaught` is its defeat clause.

**The corpus contains no `rm -rf ~/…` case at all.** That is why 109 ordinary commands could pass
while a pip-cache clean was hard-blocked fleet-wide.

- [ ] **Step 1.** Add B1-B14 from Task 2 to `ordinaryWork()`. Denominator moves **109 → 123**.
- [ ] **Step 2.** Run `go test ./internal/daemon/ -run TestC12_OrdinaryWork -count=1 -v` **before**
      Task 3's change is in the tree. It must report
      `C12TOTAL lane=… corpus=123 interruptions=14` on both lanes and fail. If it reports zero, the
      cases were added wrong.
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

**Exit:** `C12TOTAL corpus=123 interruptions=0` on **both** lanes, and `C12DANGERTOTAL probes=10
violations=0` with `rm -rf /` recorded as `want=block decision=block`.

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
      `history-wipe` (`toolrisk.go:126`), verified: that rule matches `rm … .bash_history`
      independently of `destructive-rm`.
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
   `corpus=123 interruptions=0` on **both** lanes. Defeat: revert `toolrisk.go:122` → RED with 14
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
1. **Delete the dead scratchpad path.** `plan:217` and eleven other lines inside this wave hard-code
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
      consumers**; **F16 key custody absent** (`docs/Devoid_Roadmap_To_Finished_Product.md:788`);
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
