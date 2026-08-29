# M4.7A Wave −1 rebase baseline — drift disposition, measured 2026-08-27

All commands run from `C:/Users/Owner/Documents/Ceragon`. Read-only except two deliberate break/restore probes inside throwaway worktrees (§5), both restored to clean.

---

## 0. Ground truth first: the SHAs in the task are already stale, and two "UNCHANGED" repos moved

`git fetch origin` in all seven repos. Result:

| Repo | Review baseline (2026-08-23) | SHA you stated | **Actual `origin/main` now** | commits stated→actual |
|---|---|---|---|---|
| Backend | `787b71dc` | `0cf9021e` | `0cf9021e944b` ✅ | 0 |
| Frontend | `471658a7` | `cac574ae` | `cac574ae063b` ✅ | 0 |
| Installers | `f29d6644` | `9503094e` | **`5b12952307db`** | **+1** |
| Ceragon-Intelligence | `08a58981` | `30d6c6d8` | **`486d937bcbe0`** | **+20** |
| Static-Worker | `e4c6069f` | "UNCHANGED" | **`44d7aabb8b84`** | **+2** |
| Sandbox-Worker | `d68ee58d` | "UNCHANGED" | **`2831997dfe84`** | **+2** |
| Scanner | `3d4116a5` | UNCHANGED | `3d4116a5e5b1` ✅ | 0 |

**This is itself the P0-02 failure recurring.** Static-Worker and Sandbox-Worker were reported unchanged because the local `origin/main` refs were stale — `git fetch` printed `e4c6069f..44d7aabb` and `d68ee58..2831997` on the spot. Four of seven repos in the brief were characterised from un-fetched refs. Sandbox-Worker's two commits are detection-truth changes (`1d1c98e fix(sandbox): a Linux run must not vouch for a non-Linux payload`), i.e. exactly the class of change a detection-quality plan must not miss.

Every stated SHA *is* an ancestor of current `origin/main` — nothing was force-pushed.

Local working checkouts are all on stale feature branches (`git rev-list --count HEAD..origin/main`): Installers **1010** behind, Backend **773**, Frontend **525**, Intelligence **168**, Static-Worker **75**, Sandbox-Worker **67**, Scanner **20**. The plan's own verification standard (line 17530) says "Frontend ~463, Installers ~900" — those numbers are now wrong too.

---

## 1. Per-repo drift that matters to a detection-quality plan

### Backend `787b71dc..0cf9021e` — 92 commits (75 non-merge), 155 files, +37,833/−875

Top dirs: `src/ai-governance` 52, `src/ai-security-policy` 18, `packages/shared-contracts` 18, `src/migrations` 8, `src/alerts` 7.

**This is the largest single change to the plan's premises anywhere.**

1. **The tool-risk default posture was replaced wholesale (D4).** At `787b71dc`, `defaultToolRiskActions()` was a severity loop — HIGH→`block`, MEDIUM→`warn`, INFO→`allow` = **25 block / 12 warn / 0 monitor / 3 allow**. On current main (`src/ai-security-policy/ai-security-policy.constants.ts:1216` `AI_TOOL_RISK_D4_TIERS`, folded at `:1423` by `resolveToolRiskDefaults`) the shipped default is **23 block / 2 warn / 12 monitor / 3 allow**. `monitor` did not exist as a stored tool-risk disposition at the review baseline; twelve classes now ship on it. The severity bands are unchanged at 25/12/3 — only the *disposition* moved, so any plan step keyed off severity bands is now keyed off the wrong axis.
2. **`AI_PRESET_DISTRIBUTION_TOTAL` is still 108 (30 dlp + 18 promptRisk + 20 ingress + 40 toolRisk), but every per-preset tally moved.** `ai-preset-distribution.spec.ts`: `L1_OPEN` 58/13/34 → **56/3/46**; `L3_BALANCED` 74/13/18 → **72/3/30**; `L5_REGULATED` unchanged 90/1/14; `L5` `diffFromCurrent` 38 → **40**.
3. **Malicious floor now holds on the READ path.** New `withMaliciousFloorApplied` (`ai-malicious-floor.ts:285`) is called as the first statement of `assembleEffectiveDto` (`ai-security-policy.service.ts:2198`, function opens at `:2132`). At `787b71dc` the only non-spec caller of anything in that file was `applyMaliciousFloor` on the write path. Floor membership: 23 toolRisk + 10 dlp + 4 promptRisk = 37 members.
4. **A data migration rewrites the fleet's stored posture**: `1792700000000-RebaselineToolRiskDefaultsForUncustomizedOrgs.ts` moves preset-derived stored tool-risk values onto D4 while preserving admin-chosen ones. Its header carries a measured tool-lane number the plan's Wave 4 wants: **7 warns per 705 tool checks**, and "an unanswered dialog becomes a 120-second hold".
5. **Unregistered tool-risk classes are now announced, not silently dropped** (`66d788d3`, new `ai-security-policy.unregistered-class-visibility.spec.ts`, 322 lines). The spec explicitly states the *policy write* path is still closed — `assertClosedActionMap` throws, `validateActionMap` 400s. See §4 for what this does to review P1-02.
6. Measurement/telemetry surfaces added: `findingsDropped` (§3.10), `src/common/pipes/agent-wire-drift.ts` + a health read surface for the agent-wire drop counter, `egressHosts` projection (§4.5), `attestedProfile` on the drill row, `unreadableGovernanceTables` on the heartbeat, `src/ai-governance/ai-policy-integrity.ts`.
7. **Alert severity re-derived** (`4a4739b5` "band severity from what was detected, not from whether it was blocked") — changes what any alert-precision gate measures.
8. **~97 live-pg specs stopped reporting green when Postgres is absent** (`4a9b9cd1`, `10dff863`, `8cb1e9dc`). Any pre-2026-08-27 "suite green" evidence in the plan was collected under the failing-open regime.

### Frontend `471658a7..cac574ae` — 40 commits (33 non-merge), 73 files, +12,406/−302

1. **The console's vendored detection engine was refreshed** (`lib/ai-security/vendored/MANIFEST.json`): source pin `Installers@1365f60e` → **`254d24fc`**; `promptrisk.js` 509 → **908 lines**, `dlp.js` 1622 → 1687, `policyeval.js` 642 → 718. I verified all three digests byte-for-byte (LF-normalised) against `Installers@254d24fc` **and** against `Installers@origin/main` — **the console engine is now current with the endpoint engine**, a review-era staleness that is closed. Commit `9ce16d1a`: "the playground was demonstrating an engine we stopped shipping."
2. `types/generated/ai-security-detector-catalog.v2.json`: **55 classes, all `lifecycle: CURRENT`** — unchanged across the range.
3. New render-harness (`scripts/render-harness/{shoot,fixtures,stub-backend}.cjs`, 1,730 lines) — a measurement surface for console truth that did not exist at review time.
4. Console-truth fixes that change what a measurement reads off the screen: session-timeline chips read from a key that did not exist, zero-denominator all-clears removed, `attestedProfile` / protection-depth 3-vs-8 discriminator rendered, detector-lifecycle chips.

### Installers `f29d6644..5b129523` — 84 commits (61 non-merge), 300 files, +46,551/−2,433
(`f29d6644..9503094e` is 83 commits / 299 files / +46,208/−2,433; `9503094e..5b129523` is one file, +343, `cmd/devoid-g8check/main.go`.)

Top dirs: `cmd/devoid` 55, `internal/codexmanaged` 29, `internal/daemon` 26, `internal/promptrisk` 16, `internal/aicontext` 15. 150 non-test files under `internal/`+`cmd/`+`browser-extension/src`+`parity-vectors`.

1. **A prompt-injection FP corpus and measurement harness now exists in-repo** — `internal/promptrisk/corpus_test.go` (453 lines, new) + `testdata/corpus/{positive,negative}` (10 files) + `quoting.go` (515 lines, new). I ran it:

   ```
   CORPUS: 87 cases (52 benign, 35 attack); 8 carry origin=real
   FALSE POSITIVES: before=30/52  after=15/52
   TRUE POSITIVES:  before=35/35  after=34/35
   BENIGN TEXT REACHING THE BLOCK TIER: before=8 after=0
   attack cases NOT caught after: [evasion-alternating-quotes]
   ```
   Measured prompt-lane numbers on current main: **FP 28.8 % at warn-or-above, TP 97.1 %, block-tier FP 0**. The harness header records that before it existed "the entire prompt-lane denominator on this box was FIVE cases … of which exactly ONE was quotation-shaped."
2. **The neutral corpus was corrected** (`c103c3fa`): case `eff202f1-90fc-517f-a9ba-f1f936e3a838` had a false positive recorded as the expected answer (`severity=medium, verdict=warn` on *"The phrase \"ignore all previous instructions\" is discussed in our security guide."*); both engines now say `low/allow` and both semantic digests moved together. Any plan baseline computed off the pre-`c103c3fa` `neutral-corpus.all.jsonl` is off by that case.
3. **`holdout-score.yml` lost its `push` trigger** (`cd657c77`, 2026-08-25 — *after* the review). File is 99 → **89 lines**; `on:` is now `workflow_dispatch` + `cron 17 3 * * *` only; the entire `paths:` list is deleted. Its own header still says "This runs on PUSH TO MAIN and NIGHTLY" — a live contradiction in the current source.
4. Agent 7.10.6 changes that move detection coverage: rule-file walk depth cap removed, Claude-lane `[OK]`-over-undecided fixed, Codex hook-trust dialect `0.147.` added (`internal/codexmanaged/hookdialect.go:112`). The dialect table has exactly **two** rows — `0.144.` and `0.147.` — and the file itself names `0.149.0-alpha.4.1` as still unmeasured, matching your real-box observation.
5. `internal/toolrisk/class_catalog.go` gained a corrected 22-line header (see §3).

### Ceragon-Intelligence `08a58981..486d937b` — 39 commits (37 non-merge), 80 files, +18,995/−14
(`08a58981..30d6c6d8` = 19 commits / 40 files; `30d6c6d8..486d937b` = 20 commits / 45 files, all of which the brief missed.)

73 of 80 files are `deploy/home` — an operator console plus an **autonomous FP-review agent** (intake, window, triage, run control, judge boundary, campaign state machine, verdict re-derivation after a fix). That lands squarely in the plan's Wave 6 (triage/adjudication) and Wave 7B territory and did not exist when the plan was written.

Exactly **one** production-code change: `src/routing/os-target-classifier.ts` (+59 lines) — Go module artifacts could never reach the Windows detonation lane, because the classifier only read `platformHints`, which the production caller populates with the artifact filename alone (`v0.6.2.zip`). Measured: `saltosystems/winrt-go` is 62-of-77 Windows files and scored **zero** Windows signal. That is a detection-coverage gap closed after the review.

### Static-Worker `e4c6069f..44d7aabb` (+2, 6 files, +1,602) and Sandbox-Worker `d68ee58d..2831997` (+2, 5 files, +599)

- Static-Worker: three executable **veto gates for the FP autofixer agent** (`corpus/catch-identity.cjs`, `evidence-bar.cjs`, `forbidden-guard.cjs`, `forbidden-paths.json`, `src/__tests__/veto-gates.test.ts`). All additive; **no file the plan cites was modified**.
- Sandbox-Worker: `platform-mismatch.ts` (new, 213 lines) — a Linux run no longer vouches for a non-Linux payload, and a deterministic mismatch stops being redelivered. Detection-truth, on a repo reported as unchanged.

---

## 2. DLP class registry — current count, current canonical API, guard status

**The registry did not change in the drift window.** `git diff --stat f29d6644 origin/main -- internal/dlp browser-extension/src/dlp.js internal/scandepth` returns **empty**. The whole registry landed on 2026-08-21 in `a8e2bfd0` (`registry.go`, `codesecurity_rules.go`) and `755b138a` (`scanall.go`, `scan_depth_guard_test.go`) — *before* the review's baseline. So the review's DLP findings were true on 2026-08-23 and are **still true, verbatim**.

**Current count — AST-parsed from the two `classSpec` tables, not grepped:**

| Table | classes |
|---|---|
| `classRegistry` (registry.go:133) | **33** — 24 warn / 7 redact / 2 monitor |
| `codeSecurityParityClasses` (codesecurity_rules.go:70) | **48** — 46 warn / 2 monitor |
| **`RegisteredClasses()` total (deduped)** | **81** |

Shipped default posture across all 81: **70 warn / 7 redact / 4 monitor**. Families: 68 credential, 4 identifier, 3 sensitive, 2 private-key, 2 heuristic, 1 configuration, 1 inconclusive.

**Backend's governed set is still 30.** `AI_DLP_CLASSES` resolves to `AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES` in `packages/shared-contracts/src/generated/ai-security-portable.generated.ts:54` — **30 members at both `787b71dc` and `origin/main`** (that generated file is byte-identical across the range, 872 lines). **81 − 30 = 51.** The review's "51 newly emitted DLP classes the plan omits" is exact and unchanged. The 51 are the 48 parity classes plus `base64-wrapped-secret`, `hex-credential-at-rest`, `private-key-candidate`. `BASE_BY_CLASS` in `ai-event-severity.util.ts` is still 27 entries at both revisions.

**Canonical full-depth API:** `dlp.ScanAll(text)` (wire / in-flight) and `dlp.ScanAllAtRest(text)` (file content), both in `internal/dlp/scanall.go`. `Scan` drops `MustBlock` and both evidence slices; `ScanEx` drops the at-rest hex detector. Full depth costs a measured ~6.5 % over `ScanEx`.

**The guard exists and is live in CI.** `internal/dlp/scan_depth_guard_test.go` — `TestNoSurfaceScansShallow` (source-level, walks the tree) and `TestFullDepthSurfacesStillScan` (19 pinned production surfaces). Exactly **one** exemption: `internal/contenttransform/transform.go`. Run by `.github/workflows/pr-checks.yml:146` (`go test ./internal/policyeval/... ./internal/dlp/... ./internal/promptrisk/...`) on every PR. Red/green proof in §5.

**Consequence for the plan, unchanged:** plan lines **5780 and 5789** write `dlp.Scan(original)` and `dlp.Scan(out)` inside `internal/daemon/ai_tool_shadow.go`. `internal/daemon` is not exempt. That code as written makes `TestNoSurfaceScansShallow` red in `pr-checks`. Additionally the plan's justification cites `internal/dlp/dlp.go:1519-1520` — **`dlp.go` is 1510 lines**; the behaviour described (`Redact` returns input unchanged on an empty finding list) is real but lives at **1480-1481**. That citation has been past-EOF since 2026-08-21, i.e. it was already stale when the review was written.

---

## 3. Tool-risk class catalogue — count, distribution, producer authority

**Count: 40, in all three locations, byte-identical.** `sha256:2cc7caeff31a09169d5d947fddf805f5d1f4f7eddcfcc984be5f83e69d1af922`, `formatVersion: 2`, `classCount: 40`. MD5 of all three files at `origin/main`: `3b9ec62fc7f039a9eefb6010e440cbc1`. **None of the three vendored files changed in any drift range.**

`node ci/lib/vocab-parity.mjs` → `PASS -- all three repos carry the same 40 classes, the same tiers, and the same wire key path.`

**Default action distribution — this is what moved.**

| | block | warn | monitor | allow |
|---|---|---|---|---|
| `787b71dc` (severity loop) | 25 | 12 | 0 | 3 |
| `AI_TOOL_RISK_D4_TIERS` (owner's table) | 15 | 6 | 16 | 3 |
| **`AI_TOOL_RISK_DEFAULT_ACTIONS` (shipped)** | **23** | **2** | **12** | **3** |

The 8 the floor raises: `base64-pipe-shell`, `content-pipe-shell`, `pipe-to-shell`, `powershell-download-exec` (monitor→block) and `destructive-rm`, `git-history-destroy`, `cloud-cred-read`, `data-exfil` (warn→block). The only two classes still on `warn` are `chmod-sensitive` and `untrusted-network-install`. Severity bands unchanged (25 HIGH / 12 MEDIUM / 3 INFO).

**Producer authority: partially exists — the lists are *derived* inside each repo but still *hand-copied* between them.**

- **Producer side is genuinely derived**, not hand-listed. `ClassCatalog()` (`internal/toolrisk/class_catalog.go:57`) loops `commandRules`, `sensitivePathRules`, `contentRules` plus the three AST classes, so "a rule added without a catalog update is impossible."
- **Each consumer pins against its own vendored copy**, and both pins are real (red proofs in §5): `Backend/src/ai-security-policy/ai-security-policy.tool-risk-class-parity.spec.ts:226`, `Frontend/components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts`.
- **The copy step across repos is still manual.** `class_catalog.go`'s header was rewritten in this drift window (`782cbec8` / `c0013dd9`) to say so out loud: "Regenerate this vector and never copy it and all three repos stay green while the new class becomes ungovernable."
- **What is new since the review:** the cross-repo comparison now exists — `ci/lib/vocab-parity.mjs`, added **2026-08-26** (`221bd5b`), wired into `node ci/lib/run.mjs workspace`, reports `NOT CHECKED` rather than passing when a checkout is missing. It lives at the workspace root, outside all three repos, so no repo's own CI runs it.
- **Backend gained a second, stronger authority mechanism:** `AI_TOOL_RISK_D4_TIERS` is `Record<AiToolRiskClass, …>` (compile error on a new class) *and* `resolveToolRiskDefaults` throws at module load on a registered class with no assigned tier. The stated failure it closes is the one that let `interpreter-exec`, `fetch-then-exec`, `substitution-exfil` reach production governing nothing.

**Verdict:** producer authority now covers producer→vector and vector→each-consumer-tuple. The one uncovered hop is repo-to-repo file copy, and it is now *detectable* by a workspace-level script rather than by nothing.

---

## 4. Review §15 line ranges — which now point at moved or deleted code

Method: extracted every `path:line` reference in the plan (`grep -noE` over all 17,538 lines), resolved each to a repo, then checked (a) file exists at `origin/main`, (b) line ≤ EOF, (c) whether the file changed between the review baseline and `origin/main`. **152 distinct plan references point at a file that changed since the review; 9 are past EOF; 51 basenames are ambiguous as written.** Working set: `…/scratchpad/driftout.txt`.

### Stale, with the exact new numbers

| Review §15 row | Verdict | Evidence |
|---|---|---|
| **Lines 5780, 5789** (`dlp.Scan`) | **STILL TRUE, and the citation is past EOF.** `dlp.go` is 1510 lines; plan cites `:1518-1520`/`:1519-1520`. Behaviour is at `:1480-1481`. Guard live in `pr-checks.yml:146`. | §2, §5 |
| **Lines 9255–9261, 9654** (114 denominator) | **NOW WRONG IN A NEW WAY.** Denominator is still 108, but every arithmetic base the plan's "four failures, each with a determinable remedy" builds on has moved: `ai-preset-distribution.spec.ts` assertions moved `:191→:227`, `:204→:240`, `:213→:276`, `:152→:158`, and the L1/L3 tallies changed (58/13/34→56/3/46; 74/13/18→72/3/30). The plan's expected table (`L1_OPEN: block 63, warn 9, monitor 39`) is unreachable from current main. | §1 |
| **Wave 4 opening (~7468) and 7486–7517** | **STALE BY +359 LINES.** All four `constants.ts:NNNN` citations are to `Backend/src/ai-security-policy/ai-security-policy.constants.ts`, which grew **1665 → 2024 lines**. `CORE_MONITOR_INGRESS_CLASSES` `:1436→:1795`; `applyCalmMonitorBaseline` `:1445→:1804`; the configurable-prompt-class loop `:1462-1468→:1821-1827`; `applyCalmMonitorBaseline` write `:1470-1476→:1829-1835`; the `cloneRecommendedAiSecurityPolicy` call `:1598→:1957`; regeneration note `:150-165→:151-166`. `ai-security-policy.service.ts:2976-2985` (the tool-risk wire translation body) is now a docblock; file grew 6129→6292. | measured per-symbol |
| **W3 corpus generation, 6355–6593** (+ plan 6651, 7083) | **POINTS AT DELETED YAML.** `holdout-score.yml` shrank 99→89 lines on 2026-08-25 (`cd657c77`). The plan says "add to the `paths:` list at lines 21-30" and "immediately after line 24 (`- 'internal/ingressrisk/**'`)" — **the entire `paths:` block and the `push:` trigger are gone.** "upload paths at 94-98" is past EOF. | `git diff f29d6644 origin/main -- .github/workflows/holdout-score.yml` |
| **Lines 9141 onward** (open class strings) | **THE REVIEW IS HALF-RIGHT AND CURRENT MAIN NOW SAYS SO EXPLICITLY.** The plan's premise is true for the *policy write* path — `assertClosedActionMap` throws and `validateActionMap` 400s, restated verbatim in the new `ai-security-policy.unregistered-class-visibility.spec.ts` header. The review is right that finding `class` is open text on the *agent wire*. `66d788d3` closed the actual gap (the drop announced nothing anywhere) without restoring control. P1-02's "required change" is largely satisfied in source; the plan text is not. | `src/ai-security-policy/ai-security-policy.unregistered-class-visibility.spec.ts:10-35` |
| **W2 lines 4100–4567, and line 4566** ("all 30 DLP classes") | **STILL TRUE, UNCHANGED.** Backend governs 30; producer emits 81; delta 51. Nothing in the drift window touched either number. | §2 |
| **W3 lines 4571 onward** | Most refs resolve; `internal/daemon/ai_handlers.go` (12 cited line numbers), `observed_runtime.go`, `server.go`, `ai_policy_activate.go`, `class_catalog.go`, `ai_prompt.go` all **changed since the review** — treat every line number in that block as unvalidated. | `driftout.txt` |
| **W7 lines 15272–17501** | `scanner-worker/.github/workflows/test.yml:53-58` **still resolves and still says what the plan says** (build `github-action/dist` before the worker suite). Scanner repo did not move. `Installers/internal/core/backend/client.go:2813-2877` / `:2822-2877` changed. `src/common/pipes/agent-ingest-validation.pipe.ts:76-80` / `:88-91` / `:90-97` changed. | manual |
| **Wave 0, lines 150–190** | **ALL SEVEN SOURCE CITATIONS STILL RESOLVE AND STILL MATCH**, including `opus-pass2.ts:936-944`, `anthropic-client.ts:42`, `gemini-pro-fallback.ts:74`, `scan-dispatch.service.ts:4247`, and both Frontend `evidenceMode: "STANDARD"` sites. The egress premise is intact. (`deployment/*-task-def.json` and `github-action/action.yml` live in the scanner repo and were not machine-checked.) | §4 table above |
| **Roadmap prerequisite at line 788** | **NOT A PLAN LINE.** The plan mentions `F16` **zero times**. Line 788 of the plan is an `aws iam put-role-policy` step in Wave 0. The F16 respec is `docs/Devoid_Roadmap_To_Finished_Product.md:788`, a **separate repo** last touched 2026-08-17. The review's §15 table silently mixes two documents. | `grep -n F16` on both |
| **Lines 7147–7291** (Static-Worker ratchet) | **NOT STALE.** `corpus/campaign-lib.cjs:364/371` and `src/__tests__/corpus-fp-gate.test.ts:131/184` are unmodified; Static-Worker's two new commits are purely additive. | `git diff --name-status e4c6069f origin/main` |
| **Lines 11–22, 34–50, 67–75, 5/26–30, 3** | Prose/decision rows, no source refs — nothing to invalidate mechanically. Note D4, D6, D11 and D12 all now describe a shipped state different from the one the plan assumed (see §1.1). | — |
| **P1-08 (workstation reproducibility)** | **WORSE THAN THE REVIEW SAID.** Plan line 781 hard-codes a dead per-session scratchpad: `…/Temp/claude/C--Users-Owner-Documents-Ceragon/a381f855-c847-4974-8e16-0fee10b3bb55/scratchpad/w0`. | `sed -n '780,790p'` |

**Aggregate answer to "which of the ~30 are stale":** by strict machine check, **8 rows point at code that has moved or been deleted** (5780/5789; 6355-6593 incl. 6651/7083; 7468 & 7486-7517; 9255-9261 & 9654; 4571-onward; 15272-17501 in part; the 788 row is a wrong-document reference; 9141 needs rewriting for a different reason than the review gave). **3 rows are confirmed still exactly true** (Wave 0 150-190; 4100-4567/4566; 7147-7291). The remainder are prose edits with no line-level dependency.

---

## 5. Break/restore proofs (nothing I relied on is inert)

All in throwaway worktrees I created: `C:/cwt/m47a-inst-9503094e` (Installers @ `9503094e`) and `C:/cwt/m47a-be-main` (Backend @ `0cf9021e`). Both `git status --porcelain` clean after restore. *(I left both worktrees in place; the `node_modules` junction I made in the Backend worktree has been removed with `rmdir` — `Backend/node_modules` is intact, 620 entries.)*

**(a) DLP scan-depth guard.** Green: `go test ./internal/dlp/ -run 'TestNoSurfaceScansShallow|TestFullDepthSurfaces|Parity'` → all PASS (33.7 s). Red: added `internal/neutraleval/zz_m47a_probe.go` calling `dlp.Scan(s)` →

```
--- FAIL: TestNoSurfaceScansShallow (0.32s)
    scan_depth_guard_test.go:140: these surfaces reach internal/dlp through a PARTIAL detector set:
        internal/neutraleval/zz_m47a_probe.go calls dlp.Scan
```

**(b) Tool-risk producer pin.** Green: `go test ./internal/toolrisk/ -run TestClassCatalog` → 5 PASS. Red: added one class to `astClassSeverity` → `FAIL: TestClassCatalog_ParityVector … parity vector is STALE`.

**(c) Backend consumer pin.** Red: removed `"fork-bomb"` from `packages/shared-contracts/toolrisk-classes.v1.json` → `FAIL … ai-security-policy.tool-risk-class-parity.spec.ts:226` (`AI_TOOL_RISK_HIGH_CLASSES` vs `vector.tiers.high`).

**(d) D4 shipped tally.** Green: `npx jest src/ai-security-policy/ai-security-policy.tool-risk-d4-tiers.spec.ts` → 20/20 PASS (144 s), including `counts the shipped tiers: 23 block, 2 warn, 12 monitor, 3 allow`. Red: flipped `'chmod-sensitive': 'warn'` → `'monitor'` →

```
-   "monitor": 12,   -   "warn": 2,
+   "monitor": 13,   +   "warn": 1,
    at ai-security-policy.tool-risk-d4-tiers.spec.ts:302
```

**(e) Prompt-risk corpus.** `go test ./internal/promptrisk/ -run TestPromptRiskCorpus -v` → PASS with the measured numbers in §1. The test fatals if the discipline removes no FPs *or* if no attack case fires, so it cannot pass on an empty/clean corpus.

---

## 6. Not verified

- No AWS call made — Wave 0's live task-definition claims (`codefence-scanner-worker:164` etc.) and the `desiredCount: 0` blast-radius statement are unchecked.
- `deployment/*-task-def.json` and `github-action/action.yml` line citations were skipped by the resolver (they live in the scanner repo's non-standard roots).
- Frontend and Static-Worker jest suites were not executed; only the Backend and Go suites named above were run.
- The 51 ambiguous bare-basename refs in the plan (`main.ts:429`, `constants.ts:150`, `server.go:365`, `runner.go:249`, …) cannot be resolved without a repo qualifier — that is itself a plan defect the review's §15 does not name.