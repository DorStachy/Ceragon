# M4.7A — Revised Plan Source Material
### Disposition of the 2026-08-23 detection-quality review, measured against origin/main on 2026-08-27

**Baseline for everything below.** All seven repos `git fetch`ed 2026-08-27. Current `origin/main`: Backend `0cf9021e944b`, Frontend `cac574ae063b`, Installers `5b12952307db`, Ceragon-Intelligence `486d937bcbe0`, Static-Worker `44d7aabb8b84`, Sandbox-Worker `2831997dfe84`, Scanner `3d4116a5e5b1`.

**The task brief's own SHA list was wrong for four of seven repos** — Installers by 1, Intelligence by 20, and Static-Worker and Sandbox-Worker were called "UNCHANGED" when `git fetch` printed `e4c6069f..44d7aabb` and `d68ee58..2831997` on the spot. That is P0-02 recurring inside the disposition exercise itself. **Wave −1 step 0 is `git fetch`, not "read the SHA list you were handed."**

**The plan file is unchanged.** `M47A_IMPLEMENTATION_PLAN.md`, mtime 2026-08-22 20:16, 17,538 lines, untracked. Every plan line number cited below is live text, not history.

---

## 1. WHAT THE REVIEW GOT RIGHT THAT IS STILL TRUE

### Theme A — The instrument cannot support the claim (measurement science)

| Finding | Still bites because |
|---|---|
| **P0-07** Recall/precision gates are mathematically incapable | The plan's flagship recall gate (`plan:6874-6901`) fails only when `interrupted == 0`. With 10 attack cases, **1/10 = 10% recall is GREEN**. Measured under the shipped 2026-08-27 policy: aggregate 9/10, but **`chmod-broad-777` is 0/1 — zero recall, today, and the gate is green.** |
| **P0-04** The shadow cannot compute the per-class rate | `toolShadowFile` (`plan:5053-5060`) has **one global `Observed` counter**; an agreement discards the class context (`plan:5096-5117`). Step 6a (`plan:9568`) says "open the Wave 3 shadow report" — `grep` over 17,538 lines returns **one hit, and no task creates the file.** |
| **P0-03** Wave 4's prompt gate reads the wrong lane | All 40 tool-risk class ids contain neither `injection` nor `ingress`, so no prompt class can appear in `[]toolrisk.Finding`. Plan line 9397 gates promotion "on the Wave 3 decision-level shadow and on nothing else." |
| **P1-07** Version lineage incomplete | `cmd/ai-security-neutral/main.go:23` and `internal/neutraleval/runner.go:468` both default `engineVersion` to the constant string **`"m4.7"`**, and `holdout-score.yml` never passes `--engine-version`. Every result the only automated evaluation has ever produced is stamped with a string that does not move when a detector changes. |
| **P1-12** Independent review must own the hidden set | No independent evaluation owner exists. UNKNOWN whether one has ever been named. |

### Theme B — Ordinary work is interrupted, and the plan banks it

| Finding | Still bites because |
|---|---|
| **P0-05** The plan banks a benign hard block | `rm -rf $HOME/.cache/pip` → `destructive-rm` (`internal/toolrisk/toolrisk.go:121-122`). **Worse than the review said:** `destructive-rm` is a malicious-floor member at minimum `block` (`Backend/src/ai-security-policy/ai-malicious-floor.ts:155`) and since `dfbac545` the floor holds on the READ path, so **no administrator on any tenant can relax it.** Measured 1/51 benign interruptions on the plan's own corpus — and the one survivor is the hard block the plan writes into `toolrisk-fp-baseline.json` at `plan:6943-6953`. `grep -n 'expiry\|maxAge\|bank-drain'` over the plan: **nothing.** |
| **P0-06** `monitor` is customer-visible and can change a call | Half 1: monitored findings ride the raw slice to Backend (`ai_handlers.go:2701`→`:2922`) and become a **detection row** via `activity-kind.util.ts:384`. Half 3: `taintRisky` (`ai_taint.go:159-166`) returns true on **any non-INFO raw finding, never policy-filtered** — proven end-to-end: `sudo systemctl restart nginx` returns `allow` untainted and **`hold` on an independently tainted session**. Attribution proven by mutation (removing the severity arm turns both the E2E probe and `TestTaintRisky` red). |
| **P1-11** Approval fatigue needs product gates | No confirmations-per-1,000-opportunities metric exists anywhere. |

### Theme C — Syntax is being treated as impact

| Finding | Still bites because |
|---|---|
| **P0-08** Cloud spelling ≠ production impact | No effect resolver exists: `grep -n 'AWS_PROFILE\|--profile\|--region\|KUBECONFIG'` over `internal/toolrisk` and `internal/shellast` = **zero matches**. Compiling the plan's five regexes verbatim (`plan:8966-8992`): **9 production-effect evasions produce no finding** (`aws --profile prod s3 rm …`, `terraform plan -destroy && terraform apply tfplan`, `PGHOST=db.prod.internal psql -c 'DROP TABLE users'`, `kubectl delete -f prod-namespace.yaml`, …) while **7 zero-impact benign twins fire HIGH**, including a **git commit message** and a **runbook line**. |
| **P0-10** `deriveCombos` amplifies unrelated signals | Corroborator = any high/medium finding outside a 5-member set, with no field/span/AST/resource/destination/proximity/dataflow/time constraint (`plan:7838-7873`). Measured: a threat-model markdown quoting `curl … \| sh` fires `content-pipe-shell` + `content-spawn-shell` → combo true. **Both are on `monitor` today**, so the combo would manufacture the *only* interruption the developer sees. |
| **P0-09** Windows semantics unsupported, evasions green by design | `internal/shellast/shellast.go:156` constructs `syntax.LangBash` and nothing else. `TestC5_UnknownTransforms_Inventory` **contains no assertion** — it `fmt.Printf`s `NOT-CAUGHT` for `cmdsubst-verb` and `non-ifs-unknown-sep` and reports `--- PASS`. `quoting_bypass_pin_test.go` asserts `rm -rf "$HOME"` **stays undetected** (it fails only if someone fixes it). |
| **P1-05** Adversarial inventories must become gates | Same `TestC5` file. The compliant pattern already exists three times in-repo. |

### Theme D — DLP breadth without DLP quality, and 51 ungoverned classes

| Finding | Still bites because |
|---|---|
| **P0-14 / P0-02(A)** | `git diff --stat f29d6644..origin/main -- internal/dlp` is **empty** — nothing has changed here since the review. Producer registers **81** classes (33 `classRegistry` + 48 `codeSecurityParityClasses`); Backend governs **30** (`ai-security-portable.generated.ts` `AI_DLP_CLASSES`, counted: 30, byte-identical across the whole drift range). **51 endpoint-emitting classes have no console control at all** and ship at the endpoint fallback posture (warn = the interrupt), because `assertClosedActionMap` throws and `validateActionMap` 400s on any key outside the tuple. |
| **P0-02(B)** | `plan:5780` / `plan:5789` write `dlp.Scan(...)` inside `internal/daemon/`, which is not exempt from `TestNoSurfaceScansShallow`. **Proven red:** a probe calling `dlp.Scan` produced `scan_depth_guard_test.go:140: these surfaces reach internal/dlp through a PARTIAL detector set`. The guard runs on every PR via `pr-checks.yml:146`. The plan's justification cites `dlp.go:1519-1520`; **`dlp.go` is 1510 lines** — past EOF since 2026-08-21, i.e. stale before the review was written. |
| **P0-01** | **All six named residuals are still published on origin/main.** `parity-vectors/neutral/HOLDOUT_REPORT.md` today: egress benign interrupts 2/23 (8.7%), egress recall 9/12 (75.0%), ingress recall 7/8 (87.5%); `qa-fp-migration-timestamps`, `qa-fp-detections-finding-name`, `attack-private-key-block`, `attack-prod-db-connection-string`, `attack-system-prompt-exfil`, `ingress-attack-private-key-in-tool-output`. Reproduced by rebuilding `./cmd/ai-security-neutral` at current main. **None of the six fixture names appears in the plan.** |

### Theme E — Detection without an authoritative boundary

| Finding | Still bites because |
|---|---|
| **P0-11** Prompt-injection is lexical and unevaluated end to end | 38 `regexp.MustCompile` calls, zero model/embedding/semantic layer; every rule English (`grep -rlP '[\x{0590}-\x{05FF}\x{0600}-\x{06FF}]' internal/promptrisk/` → empty). No provenance typing, no effect grader (`grep -rn 'unauthorizedEffect\|attackSuccess\|effectGrader' internal/` → zero). Measured on current main: **FP 15/52 at warn-or-above; sealed holdout recall 9/12 = 75%; `injection-system-exfil` recall 0%** — and that is the class `plan:9557` promotes **first**. |
| **P0-16** No complete authoritative effect boundary | Conclusion accepted (the *premise* is wrong — see §3). The connected path is gated to the WS-D taint overlay only; not every high-impact sink routes through a withholding checkpoint, and D14 keeps fail-open (`plan:75`). |
| **P0-12 / P0-13** Scanner execution truth ≠ detection quality | Not re-verified this pass (Scanner repo unmoved at `3d4116a5`). Review's own correction stands: the injection defences are real and must be credited; the missing evidence is behavioural. |
| **P0-15, P0-17, P0-18, P0-19** | Architecture/trust dependencies. P0-19 confirmed present in the roadmap at `docs/Devoid_Roadmap_To_Finished_Product.md:788` and **absent from the plan — `grep -c F16` over 17,538 lines = 0.** |
| **P1-01** Impact and confidence are declared, not measured | `toolrisk.Finding` (`toolrisk.go:50-62`) has no `EvidenceTier`, no `EnforcementEligible`, no confidence (a probe referencing `f.Confidence` **failed to compile**). `ai-class-metadata.ts:88-100` derives `confidence` from a **mechanism label** (`regex-context → medium`), with no heldout labels, PPV, support, interval or calibration error. `ClassImpact` was never built. |
| **P1-06** No inspection-budget contract | `InspectionComplete` / `InspectionDegraded` (`internal/proxy/openai_downlink_inspection.go:16-17`) have **six references repo-wide, all in the defining file and its test — zero production consumers.** Neither `internal/toolrisk` nor `internal/dlp/dlp.go` declares a max bytes/items/depth/time, so neither can report exhaustion. |
| **P1-04** Static-Worker TP gate hides ecosystem escapes | Package lane predicate is `nv !== 'ALLOW' \|\| pv !== 'ALLOW'` (OR); artifact Gate 2 counts an escape only when `rows.every(r => r.verdict === 'ALLOW')`. **Measured:** `tp-zero-width-smuggled-directive` is ALLOW under `plugin` (38/39) and the committed predicate reports `escapes = []`. `CATCH_BASELINE.json` says `"escapes": {}, "catchRate": 1`. |
| **P1-09** Exclusions must drive certificate state | `plan:17505-17520` lists exclusions with no certificate-impact column. |
| **P1-08** Not fresh-chat reproducible | **Worse than stated:** `plan:781` hard-codes a dead per-session scratchpad `…/Temp/claude/…/a381f855-c847-4974-8e16-0fee10b3bb55/scratchpad/w0`. Plus **51 bare-basename references** (`main.ts:429`, `constants.ts:150`, `server.go:365`, …) that cannot be resolved without a repo qualifier — a plan defect the review's §15 does not name. |
| **P1-10** Rollback/drift triggers under-specified | `FALSE_POSITIVE_STORM` is declared at `ai-policy-rollback.service.ts:11` with no change-point monitor computing it. |

---

## 2. WHAT IS NOW CLOSED

Strict standard: code that closes it **plus** a named test that goes red on revert. Anything without both is listed as "closed as fact, unguarded."

### Closed, with a guard

| # | What closed | Commit | Test that goes red |
|---|---|---|---|
| C1 | **The warn storm on ordinary work.** `privilege-escalation` moved MEDIUM/`warn` → `monitor`. Shipped tool-risk tally is now **23 block / 2 warn / 12 monitor / 3 allow** (`ai-security-policy.constants.ts:1195-1206` docblock; table itself is 15/6/16/3, floor folds 8 up). | `803b73ad`, `b03e341a` (2026-08-26); deployed **td 322** | `ai-security-policy.tool-risk-d4-tiers.spec.ts` — 20/20 PASS; **RED proven:** flipping `'chmod-sensitive'` warn→monitor yields `"monitor": 13 / "warn": 1` failing at `:302`. |
| C2 | **Malicious floor holds on the READ path.** `withMaliciousFloorApplied` (`ai-malicious-floor.ts:285`) is the first statement of `assembleEffectiveDto` (`ai-security-policy.service.ts:2198`). At the review baseline the only non-spec caller was the write path. 37 members (23 toolRisk + 10 dlp + 4 promptRisk). | `dfbac545` (2026-08-27); td 322 | `ai-security-policy.phase-b-content.spec.ts:661-673` — "B9, floor half: `require_approval` on a FLOOR class is raised, not projected"; four golden wire recordings carry `"destructive-rm": "block"`. |
| C3 | **Tool-risk producer authority (producer→vector, vector→consumer).** `ClassCatalog()` (`class_catalog.go:57`) loops the rule tables — a rule added without a catalog update is impossible. 40 classes, `sha256:2cc7caef…f922`, byte-identical in all three repos. | pre-existing + `782cbec8`/`c0013dd9` header correction | **RED proven ×2:** adding a class to `astClassSeverity` → `TestClassCatalog_ParityVector … parity vector is STALE`; removing `"fork-bomb"` from `toolrisk-classes.v1.json` → `ai-security-policy.tool-risk-class-parity.spec.ts:226` fails. |
| C4 | **Backend compile-time tool-risk totality.** `AI_TOOL_RISK_D4_TIERS` is `Record<AiToolRiskClass, …>` and `resolveToolRiskDefaults` (`constants.ts:1409-1417`) **throws at module load** on a registered class with no tier. Closes the failure that let `interpreter-exec`, `fetch-then-exec`, `substitution-exfil` reach production governing nothing. | `803b73ad`/`b03e341a` | Any first importing test in any environment. |
| C5 | **~97 live-pg specs fail dark instead of green when Postgres is absent.** Any pre-2026-08-27 "suite green" evidence in the plan was collected under the failing-open regime. | `4a9b9cd1`, `10dff863`, `8cb1e9dc` | The specs themselves. |
| C6 | **A prompt-injection FP corpus and harness exists in-repo.** 87 cases (52 benign, 35 attack), 8 `origin=real`. Measured: FP 30→15 of 52, TP 35→34 of 35, block-tier benign 8→0. | `063b66e9`, `46a07557`, `0b8342de`, `47b4a8e7` (2026-08-26) | `internal/promptrisk/corpus_test.go` (453 lines) — **fatals** if the discipline removes no FPs *or* if no attack fires, so it cannot pass on an empty corpus. |
| C7 | **The AI rule-file walk no longer caps at depth 8.** Measured on a real machine: depth 8 → 585 files in 1m37s; depth 32 → 1,099 in 8m20s. **514 of 1,099 (47%) were invisible while `runArtifactAISweep` logged "AI inventory sweep complete."** `RuleWalkCoverage` (`internal/inventory/aitools/aitools.go:157-187`) now carries DepthCeiling/DepthPruned/Unreadable and `Complete()`. | `d506156f`, agent **7.10.6** | `internal/inventory/aitools/rule_walk_coverage_test.go` (220 lines), `internal/sweep/sweep_ai_coverage_test.go` (141 lines). |
| C8 | **Unregistered tool-risk classes are announced, not silently dropped.** | `66d788d3` | `ai-security-policy.unregistered-class-visibility.spec.ts` (322 lines). |
| C9 | **Static-Worker FP-autofixer veto gates.** `corpus/catch-identity.cjs`, `evidence-bar.cjs`, `forbidden-guard.cjs`, `forbidden-paths.json`. | Static-Worker `e4c6069f..44d7aabb` | `src/__tests__/veto-gates.test.ts`. |

### Closed as fact, **unguarded** — these regress silently

| # | What closed | Evidence | Why it is unguarded |
|---|---|---|---|
| C10 | **The console's vendored detection engine is now current with the endpoint engine.** `MANIFEST.json` pin `Installers@1365f60e` → **`254d24fc`**; `promptrisk.js` 509→**908** lines, `dlp.js` 1622→1687, `policyeval.js` 642→718; all three digests verified LF-normalised against `Installers@origin/main`. Commit `9ce16d1a`: "the playground was demonstrating an engine we stopped shipping." | verified byte-for-byte | `vendored-digest.test.ts` **only compares the copy to the local manifest** — it catches a hand edit, not the copy and the manifest both sitting behind Installers. The upstream check lives in `.github/workflows/vendored-upstream-drift.yml`, whose triggers are **`workflow_dispatch` + daily cron only**. That file's own instruction — *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the SAME change that re-vendors the files"* — **was not followed.** T-M2 landed; the trigger did not. |
| C11 | **Go module artifacts can now reach the Windows detonation lane.** `Ceragon-Intelligence/src/routing/os-target-classifier.ts` +59 lines. The production caller populates `platformHints` with the artifact filename alone (`v0.6.2.zip`); measured, `saltosystems/winrt-go` is 62-of-77 Windows files and scored **zero** Windows signal. | Intelligence `30d6c6d8..486d937b` | UNKNOWN whether a regression test accompanies it — not verified this pass. |
| C12 | **A Linux sandbox run no longer vouches for a non-Linux payload**, and a deterministic mismatch stops being redelivered. `Sandbox-Worker/src/.../platform-mismatch.ts`, 213 lines new. | `1d1c98e` | Not verified this pass. |
| C13 | **The neutral corpus itself carried a false positive as an expected answer.** Case `eff202f1-90fc-517f-a9ba-f1f936e3a838` — *"The phrase \"ignore all previous instructions\" is discussed in our security guide."* — was recorded `severity=medium, verdict=warn`; both engines now say `low/allow`. | `c103c3fa` | Any plan baseline computed off the pre-`c103c3fa` corpus is off by that case. |
| C14 | **Cross-repo class-vocabulary comparison now exists.** `ci/lib/vocab-parity.mjs` → `PASS -- all three repos carry the same 40 classes…`; reports `NOT CHECKED` rather than passing on a missing checkout. | `221bd5b`, 2026-08-26 | It lives at the **workspace root, outside all three repos**, so **no repo's own CI runs it.** The repo-to-repo file copy remains a manual step; `class_catalog.go`'s header now says so: *"Regenerate this vector and never copy it and all three repos stay green while the new class becomes ungovernable."* |
| C15 | **Frontend render-harness** (`scripts/render-harness/{shoot,fixtures,stub-backend}.cjs`, 1,730 lines) — a console-truth measurement surface that did not exist at review time; plus session-timeline chip fix, zero-denominator all-clears removed, `attestedProfile` / 3-vs-8 depth discriminator rendered. | Frontend `471658a7..cac574ae` | Not a gate. |
| C16 | **A per-class production FP rate with a real denominator has shipped since 2026-08-06** — seventeen days *before* the review. `MEASURED_FP_WINDOW_DAYS = 7`, `MEASURED_FP_VERDICTS`, per-event-per-class dedup, zero-denominator buckets dropped, and the explicit rule at `ai-security-policy.service.ts:725-727`: *"An ABSENT key means NOT MEASURED … it is never the same statement as `fpRate: 0`."* | `f7d39870` | The rate is governed; the **label** is not (see §3). |

### Explicitly NOT closed

- **Codex hook lane on the owner's own machine.** `internal/codexmanaged/hookdialect.go:112` has exactly **two rows** — `0.144.` and `0.147.` The owner's client is **0.149.0-alpha.4.1**, and the file itself names it as unmeasured. On that box DeVoid does not claim the Codex hook lane fires at all.
- **The MSI does not wire the AI hook lane.** A per-user scheduled task does, ~1 minute after install. Real-box install/uninstall both exit 0 and every user config file restores byte-identical, but the safeguards-on window is not the install.
- **A REGRESSION introduced after the review.** `holdout-score.yml` lost its `push` trigger on 2026-08-25 (`cd657c77`, cost gate, owner decision). It is 89 lines; `on:` is now `workflow_dispatch` + `cron '17 3 * * *'`. **Its own header still reads "This runs on PUSH TO MAIN and NIGHTLY"** — a live self-contradiction in current source. And its header also states: *"The job does NOT gate on a rate threshold today."* **The only automated detector-quality instrument in the workspace is a non-gating nightly report whose version stamp is a constant.**

---

## 3. WHAT THE REVIEW GOT WRONG

Named plainly. Each of these would send the revision to rebuild something that exists, or to fix something that is not broken.

**W1 — P0-16's factual basis is wrong: the effect-bound approval transaction IS connected to the command lane, and was 18 days before the review.**
The review adopted `plan:43` ("Built, tested, non-replayable — not connected to the command lane") as fact without opening the source. `internal/daemon/ai_handlers.go:3063` — `approval := s.resolveToolHoldApproval(body, toolFindingClasses(findings), taintReason)`, granted branch `:3065-3072` (one-use claim+consume → `aiDecisionAllow`), denied branch `:3073-3078` → `aiDecisionBlock`. **The finding's conclusion still holds** (the connected path is gated to the WS-D taint overlay only; not every high-impact sink is mediated), but the required work is *widen an already-wired transaction*, not *wire one*.

**W2 — P0-03: a sealed prompt-lane instrument already exists, and running it contradicts the plan's promotion order.**
The review examined only `neutral-corpus.all.jsonl` (5 promptrisk cases). It did not open `neutral-corpus.holdout.jsonl` (**39 cases, 12 promptrisk**, landed `9047903b` 2026-08-05) or `neutral-corpus.ingress.jsonl` (**28 cases**, `72ea06d2` 2026-08-06). `holdout-score.yml` scores them as separate lanes with separate denominators and `scoreHoldout` **refuses a corpus that mixes lanes**. Run today: `injection-system-exfil CURRENT fp=0/23 fn=1/1` — **0% recall, its one attack case verdicts `allow`** — and that is the class `plan:9557` promotes *first* as "the strongest attack signal." There was a third implementation the review did not consider: gate on the instrument that exists.

**W3 — P0-04: a per-class report generator already ships, and it contains the exact defect P0-04 names.**
`cmd/ai-security-neutral/holdout.go` `detectorRates` (100-124) already carries ClassID, Lifecycle, BenignCases, FalsePositives, FPRate, AttackCasesExpecting, FalseNegatives, FNRate, TruePositives, BoundaryFires. The defect is at **`holdout.go:357-358`**:
```go
for class := range byClass {
    byClass[class].benign = benignCases
}
```
Every class's FP denominator is the corpus-wide benign count. `db-connection-string fp=1/23` and `aws-access-key fp=1/23` share a denominator neither was individually exposed to. **Fix the shipped one; do not build a second.**

**W4 — P0-04 companion: `holdout.go:114/379` makes 43 of 55 classes report perfect recall on zero evidence.** `FNRate float64` has no pointer and no `omitempty`, and line 379 sets it only `if a.expecting > 0`. Measured: **43 of 55 detector classes report `fnRate: 0` on `attackCasesExpecting: 0`** — including malicious-floor credential classes `anthropic-key`, `aws-secret-key`, `azure-connection-string`.

**W5 — P0-05: half of it is stale, which makes the surviving half worse.** `sudo systemctl restart nginx` no longer interrupts anyone on a clean session (`privilege-escalation` → `monitor`, 2026-08-26). Measured benign interruptions on the plan's own 51-case corpus: **1/51, not 2/51.** The single survivor is the hard block — and since `dfbac545` it is **un-relaxable by any administrator**. The plan's banked-entry template at `plan:6949` names `cmd-benign-sudo-restart-nginx` with `"verdict": "warn"`; that row is stale.

**W6 — P0-06: `monitor` creates a DETECTION row, not an ALERT row.** `alerts.service.ts:862-881` `aiAlertScopeSql` admits only `TOOL_CALL_BLOCKED, CODE_DIFF_FLAGGED, MCP_SERVER_BLOCKED, PACKAGE_INSTALL_BLOCKED` plus gated `PROMPT_*` and `WEB_NAV_BLOCKED` — **`TOOL_CALL_REQUESTED` is absent.** Nobody is paged. Conflating the two sends the fix to the wrong service and overstates the operational cost.

**W7 — P0-06's line citations have drifted.** `taintRisky` is at `ai_taint.go:159-166` (cited 151-165); the HOLD overlay is at `ai_handlers.go:3054-3055` (cited **2938-2954**, ~116 lines off); the proxy monitored branch is at `ai_ingress.go:319` (cited 325-328). Symbols intact, mechanics unchanged — but this is the review's own P1-08 hazard biting the review.

**W8 — P0-09 overstates the open evasion set by roughly an order of magnitude.** Run on current main, control `chmod -R 777 /etc` = BLOCK. **CAUGHT-SAME-CLASS** for: empty-dquote-split-verb, empty-squote-split-verb, quoted-whole-verb, ansic-hex-space, tab-separated, crlf-continuation, abs-path-verb, env-prefixed-verb, leading-assignment, subshell-wrapped, brace-group, and-chained, nested-c-plain, nested-c-ifs, nested-c-backslash, double-nested-c, assign-then-use, printf-into-shell. CAUGHT-OTHER-CLASS for eval-string, b64-into-shell. **NOT-CAUGHT for exactly two: `cmdsubst-verb` and `non-ifs-unknown-sep`.** And PowerShell `-EncodedCommand` is not merely caught — it is **decoded and escalated to HIGH** (`adversarial_wsg_test.go:55`, decode path `shellast.go:574-604` + `interpreter_body.go`; an undecodable one is reported, not cleared). `TestDialectMatrixHasNoParityGaps` reports **0 gaps over 14 both-dialect classes.** The scope limitation (no PowerShell/cmd *semantic* parser) is entirely correct; the residual is two semantic shapes plus the `"$HOME"` residue.

**W9 — P0-08's "reordered options and `--flag=value` variants" bullet is wrong about the plan's own regexes.** They already tolerate both: `aws ecs update-service … --desired-count= 0` matches (`--desired-count[=\s]\s*0`), and `aws s3 rm --recursive s3://prod-bucket` matches. Every *other* bullet in P0-08 is confirmed. Listing this one invites a fix to something that is not broken.

**W10 — P0-10 is understated against current main.** The plan justifies MEDIUM severity by "`defaultToolRiskActions` gives every MEDIUM class warn" — **that function is gone**. Under D4, `privilege-escalation`, `docker-cp-host`, `content-spawn-shell` and `content-pipe-shell` are **all on `monitor`**, so both measured benign examples are silent today. The combo would not add a warning beside existing ones; it would **manufacture the only interruption the developer sees, out of two signals the product deliberately decided not to show them.**

**W11 — P1-03 "production feedback is not a governed quality label" is too absolute, and was on the review date.** See C16. The real gap is **taxonomy width and adjudication**, not the rate: `AI_EVENT_TRIAGE_CLASSIFICATIONS` (`ai-governance-contract.ts:183-190`) has **four** values, `benign_expected` conflates "policy too strict" with "authorized action," there is no incorrect-explanation or duplicate value, `not_set` is a default not a reviewed unknown, and **no second-reviewer or adjudicator field exists on the production path.** Meanwhile the evaluation corpus record already models exactly that (`case.governance.labelers[].{labelerId,role}`, `case.governance.adjudication.{status,adjudicatorIds,reasonCode,decidedAt}`). **Two vocabularies for one question.**

**W12 — P1-07 is too absolute about the case record.** Corpus formatVersion 2 already carries `semanticBaseCaseId`, `representation.lineage`, `caseVersion`, `governance.labelers`, `governance.adjudication`, `governance.correction`, `provenance.{sourceDigest,licenseId,trust,admittedAt,reviewerIds}`, `expected.{findings,decision,effects,finalState,completeness.limitations,resourceBudget}`. And `main.go:28-38` derives `artifactDigest` **from the executing binary** ("a pasted digest can be wrong; this one cannot"). The actual gap is the *system-under-test* axes: `engineVersion "m4.7"`, `EnvironmentDigest` over only `{goVersion, goos, goarch, runner}`, and no ruleset/normalizer/parser/policy digest anywhere.

**W13 — §15's "Roadmap prerequisite at line 788" row silently mixes two documents.** The plan mentions F16 **zero times**; plan line 788 is an `aws iam put-role-policy` step in Wave 0. The F16 respec is `docs/Devoid_Roadmap_To_Finished_Product.md:788` — a **separate repo**, last touched 2026-08-17. The finding is valid; the citation is not.

**W14 — the review's OWASP citations are one edition stale.** OWASP Top 10 for LLM Applications **2026** shipped 2026-08-03 and renumbered 8 of 10. **Excessive Agency moved from LLM06 to LLM03** — the entry the review leans on hardest. The review cites `:2025` IDs at lines 1701-1712. It also misses the framework that is now the actual reference for this product category: **OWASP Top 10 for Agentic Applications 2026 (ASI01–ASI10, published 2025-12-09)**, whose ASI09 (Human-Agent Trust Exploitation) requires that a confirmation dialog **display the raw action, not an agent-authored summary** — a control DeVoid ships and does not test. The plan itself cites **zero** standards: `grep -ci owasp` over 17,538 lines = **0**.

**W15 — the review cites NIST TN 2119 as its authority for Clopper-Pearson, and TN 2119 does not recommend Clopper-Pearson.** TN 2119 (Lu, Sept 2020) calls Clopper-Pearson **too conservative**, notes it always contains the Jeffreys interval, and names the **Bayesian likelihood interval with uniform prior** as its first choice, with Wilson/Agresti-Coull acceptable above n≈40 and Wald cautioned against. The resolution is to split the two uses, not to pick one (see §5).

**W16 — the review's own §9.4 + §9.5 compound into an arithmetically unreachable gate, and it does not say so.** Per-class denominators (§9.4) × family-wise error control (§9.5) at the plan's own K=114: Holm at α=0.05/114 for a ≤100 ppm one-sided bound with zero errors needs **77,316 zero-error benign opportunities per class — 8.81 million total.** A gate that cannot be met is a gate that will be quietly ignored. The fix is a two-tier structure (§6).

**W17 — a secondary-source claim the review's research lineage would have inherited: "twelve defences broken at over 90%" is not supported.** The primary (arXiv:2503.00061, Zhan et al.) evaluates **eight** defences, all bypassed, **ASR consistently over 50%**. Do not cite the inflated figure.

---

## 4. THE REVISED WAVE STRUCTURE

Review §14 is the skeleton. Adjusted for what closed, what regressed, and what the research changes. Every exit criterion below is a number or a named artifact; every defeat test names the mutation.

---

### **Wave −1 — Rebase, authority regeneration, and claim contract** *(mandatory, first)*

**Purpose.** Stop implementing against stale source; make the plan reproducible from a fresh chat; define exactly what this packet can certify.

**Deliverables.**
1. `git fetch` **first**, then a SHA manifest for all seven repos with `rev-list --count HEAD..origin/main` per checkout. Record that a handed-down SHA list is not evidence (four of seven were wrong on 2026-08-27).
2. Replace all **51 bare-basename references** (`main.ts:429`, `constants.ts:150`, `server.go:365`, …) with `<repo>/<path>:<symbol>`; replace line numbers with symbol names plus a discovery command.
3. Delete `plan:781`'s dead per-session scratchpad path; express every path relative to a discovered workspace root; make `superpowers:*` advisory.
4. **Generate `AI_DLP_CLASSES` from `RegisteredClasses()`.** 81 producer classes; 30 governed; **close the 51.** Never hand-update a count.
5. Fix `plan:5780`/`5789` to `dlp.ScanAll` / `ScanAllAtRest` and re-audit the redaction adaptation. Correct the `dlp.go:1519-1520` citation to `:1480-1481`.
6. Delete the static `114` denominator (`plan:9654`) and the `all 30 DLP classes` criterion (`plan:4566`); derive from catalog digests.
7. **Restore the two instruments that no longer gate.** (a) `holdout-score.yml`: fix the header that still claims a push trigger, and make an explicit owner decision — restore `push:` on `main` or state in writing that detector quality is a nightly non-gating report. (b) `vendored-upstream-drift.yml`: add `pull_request:` per the file's own written instruction, now that T-M2 has landed (`MANIFEST.json` pin = `254d24fc`, current).
8. Add a per-class catalog column set: **ATLAS technique id** (pin an `atlas-data` release; v2026.07 is current, and v2026.05 added a `platform` field including `Agentic`), **OWASP LLM:2026 / ASI id**, **AIUC-1 control id**.
9. Normative reference to `docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md:695-829` as the sole numeric authority. Do not invent a second table.

**Exit criteria (measurable).**
- Zero hand-written detector denominators: `grep -nE '\b(114|108|30 DLP|46 toolRisk)\b'` over the plan returns no exit criterion.
- Every `path:line` in the plan resolves to an existing file with `line ≤ EOF` and a repo qualifier — 0 of 152 currently-changed refs unvalidated, 0 of 9 past EOF, 0 of 51 ambiguous.
- `node ci/lib/vocab-parity.mjs` runs inside at least one repo's CI, not only at the workspace root.

**Defeat test.** Add one temporary class to the producer registry (DLP and tool-risk separately). **Every** consumer parity gate must go red — Backend `tool-risk-class-parity.spec.ts:226`, Frontend `ai-security-policy-toolrisk-class-parity.test.ts`, `TestClassCatalog_ParityVector`, and the new DLP generator gate. Separately, replace one shipping `ScanAll` with `Scan` and prove `TestNoSurfaceScansShallow` goes red (**already proven red** at `scan_depth_guard_test.go:140`).

---

### **Wave 0 — Emergency egress correction** *(unchanged; premise verified intact)*

**Purpose.** Remove the deployed override that let raw repository corpora reach Anthropic and Gemini under an evidence mode intended not to send source.

**Status.** **All seven source citations at `plan:150-190` still resolve and still match**, including `opus-pass2.ts:936-944`, `anthropic-client.ts:42`, `gemini-pro-fallback.ts:74`, `scan-dispatch.service.ts:4247`, and both Frontend `evidenceMode: "STANDARD"` sites. The premise is intact.

**Add.** Pre/post AWS task-definition evidence; explicit residual Risk 1 gap (this removes one unauthorized policy state, it does not build the boundary — P0-15); no secrets or raw customer content in run logs.

**Exit.** The named overrides are absent from the deployed task definitions, evidenced by a `describe-task-definition` diff. **NOT VERIFIED this pass — no AWS call was made.** The live task-definition claims (`codefence-scanner-worker:164`, the `desiredCount: 0` blast-radius statement) are UNKNOWN.

**Defeat test.** Re-add one override in a staging task definition; the pre-egress assertion must go red before any request is issued.

---

### **Wave 1 — Policy authority and catalog totality**

**Purpose.** No class the endpoint can emit may be ungovernable.

**Adjusted for what closed.** The **tool-risk half is largely done** (C3, C4, C14) — do not rebuild it. The **DLP half is entirely open**: 51 of 81 classes have no console control.

**Deliverables.**
- Generate `AI_DLP_CLASSES` from `RegisteredClasses()` with class, family, default posture, evidence mechanism, base capability impact, producer version, digest. Vendor into Backend, Frontend, neutral eval, shared contracts.
- Correct `plan:9141`: the premise is wrong for the *policy write* path (`assertClosedActionMap` throws, `validateActionMap` 400s — restated verbatim in `ai-security-policy.unregistered-class-visibility.spec.ts:10-35`) and right for the *agent wire* (finding `class` is open text). Write the real failure mode: unknown classes are accepted as evidence, marked ungoverned, cannot inherit a permissive action, and keep the certificate non-green.
- Move `ci/lib/vocab-parity.mjs` (or a copy) into at least one repo's PR gate.

**Exit criteria.** `|AI_DLP_CLASSES| == |RegisteredClasses()|` asserted by a generated-file byte-comparison, currently **30 vs 81**. Every one of the 81 has a console-settable disposition.

**Defeat test.** Add `acme-token` to `codeSecurityParityClasses` with no consumer update. The generator gate must go red in Backend, Frontend and shared-contracts. **Today it does not exist and the class would silently ship at warn.**

---

### **Wave 2 — Evidence strength, consequence, and UI vocabulary**

**Purpose.** Stop deriving policy consequence from detector severity.

**Deliverables.**
- Replace the single `ClassImpact` catalog (`plan:4125-4160`, never built) with **three** fields: `evidenceStrength` (exact/validated, corroborated, probable, weak, unknown), `baseCapabilityImpact`, `resolvedConsequence`.
- **Rename `ai-class-metadata.confidence`** → `evidenceMechanism`. Ban the word "confidence" for any value not calibrated against heldout labels and published with support, PPV, interval and calibration error. Today `confidenceForMechanism()` (`:88-100`) maps `regex-context → medium` with none of that.
- Add grade fields to `toolrisk.Finding` (`toolrisk.go:50-62`) and carry them through `toBackendToolFindings`, `AiPromptFindingDto` (`ai-prompt-check.dto.ts:76-96`) and **both** controller mappers (`ai-agent.controller.ts:340-344` and `:877-882`). **Delete the tool-lane exemption at `plan:2067`.**
- **Split `monitor` into three declared concepts** (this is D6's real fix): private detector telemetry (aggregated, no customer row) / customer-visible detection (counts against the FP and precision budget) / enforcement signal (may change this or a later action). State that today's `monitor` is **(2)+(3)**, citing `ai-agent.controller.ts:882-885` and `activity-kind.util.ts:384`, and that it is **not (1)**.

**Exit criteria.** No enforcing disposition anywhere is a pure function of `Finding.Severity`. `grep` for `severity ===` in any policy-resolution path returns nothing.

**Defeat test.** Emit a finding with `evidenceStrength: unknown` and `severity: high`. It must resolve to hold/UNKNOWN, never to a clean block. Revert the plumbing → the grade fields must be observably absent at the Backend DTO boundary, failing a wire-shape spec.

---

### **Wave 3 — Measurement substrate for every lane** *(the largest rewrite)*

**Purpose.** One measurement framework, six adapters, per-class denominators, no second vocabulary.

**Deliverables.**
1. **Repair the shipped report generator; do not build a second.** `holdout.go:357-358` → per-class exposure denominator, not `benignCases`. `holdout.go:114/379` → `FNRate *float64` with `omitempty`, so a zero-attack-case class reports **UNKNOWN, not `fnRate: 0`** (today 43 of 55 do).
2. **Replace the three-field `toolShadowFile`** (`plan:5053-5060`) with a per-class record: `lane`, `classId` + `catalogDigest`, `eligible`, `candidateTriggers`, `activeTriggers`, `agreements`, `deltas`, `unknown`, `dropped`, `uniqueSessions`/`uniqueEndpoints`, `windowStart`/`windowEnd`, version tuple, `adjudication`.
3. **Add the task that produces the report.** `plan:9568` currently instructs the implementer to open a file no task creates.
4. **Four declared lane seams**, each with its own eligibility, denominator, candidate/active decision, user-visible outcome, security outcome, runtime/version cohort, freshness: prompt-egress policy decision; ingress/tool-result redaction; tool-call policy; LLM code-scanner advisory. Delete `plan:9397`'s "on the Wave 3 decision-level shadow and on nothing else."
5. **Cross-lane inspection-budget contract (P1-06, a task the plan does not have).** Adopt `RuleWalkCoverage` (`aitools.go:157`) as the shape and `case.expected.completeness` / `case.expected.resourceBudget` as the field names. Declare max bytes/items/depth/time for `toolrisk` and `dlp` (neither declares any today). **Give `InspectionComplete`/`InspectionDegraded` a production consumer** — a degraded inspection must not earn a clean allow.
6. Invalidation rule: nonzero `dropped`, any store error, any catalog/version mismatch, any stale window, any cross-lane record → **UNKNOWN**, never green.

**Exit criteria.**
- Every published per-class FP rate carries a per-class denominator. Today every class prints `fp=N/23` against the same 23.
- `fnRate` is absent (not zero) for every class with `attackCasesExpecting == 0`. Today **43 of 55** report `0`.
- Every lane report carries `eligible`, `dropped`, `windowStart/End` and a version tuple.

**Defeat test.** (a) Set one class's exposure to zero and confirm its row reads UNKNOWN rather than `fp=0/23`. (b) Force `dropped > 0` in the shadow store and confirm the promotion gate refuses. (c) Feed a mixed-lane corpus and confirm `scoreHoldout` refuses (**this one already works** — it is the pattern to copy).

---

### **Wave 3B — Evaluation and corpus governance**

**Purpose.** Make a run name the system that produced it, and keep the holdout uncontaminated.

**Deliverables.**
- **Make `--engine-version` mandatory.** Remove the `"m4.7"` default at `main.go:23` and `runner.go:468`; pass a real value from `holdout-score.yml` (which passes none today at `:48-52` and `:62-66`).
- Widen `EnvironmentDigest` (`runner.go:482-487`) beyond `{goVersion, goos, goarch, runner}` to include OS build, shell, tool schema.
- Add ruleset/catalog digest, normalizer version, parser version, effective-policy digest to `RunnerIdentity`/`ResultProvenance`.
- Add seed, decoding settings, trial count, retry policy for any non-deterministic lane. **State that the LLM code-scanner lane is not covered by neutraleval at all** and needs its own model/system-prompt version capture.
- Name `artifactDigest` as the one axis that already works so nobody rebuilds it.
- **Holdout rules the review does not state:** the private holdout is never published in any form, including redacted or hashed; **holdout cases are regenerated per release**, not reused; contamination detection is not a substitute for withholding. (The BIG-bench canary GUID was reproducible on demand by GPT-4 — the filter became the proof of contamination.)
- Move generators out of a per-session scratch path into a repo-owned `scripts/`.

**Exit criteria.** No result artifact carries `engineVersion: "m4.7"`. Every certificate row names a complete version tuple. The holdout corpus digest for release N+1 differs from release N.

**Defeat test.** Change one detector rule, re-run, and confirm the stamped engine version moves. **Today it does not** — that is the red state to start from.

---

### **Wave 4A — Close the published residuals** *(before any new rule work)*

**Purpose.** A quality program cannot claim completion while ignoring its own published failures.

**The seven.** All six holdout residuals confirmed present on `origin/main` today, plus the banked block:
`qa-fp-migration-timestamps` (Luhn-valid epoch-ms → `payment-card` warn) · `qa-fp-detections-finding-name` (the console rendering the string `jailbreak-persona` → prompt-risk warn) · `attack-private-key-block` (`verdict=inconclusive`, **zero finding classes**) · `attack-prod-db-connection-string` (`postgres://svc_prod:Hq7#nR2v!Lz9@…` → zero findings) · `attack-system-prompt-exfil` (**`verdict=allow`, zero findings**) · `ingress-attack-private-key-in-tool-output` (`RedactIngressText` consumes `dlp.Scan` findings but never `Result.PrivateKeyEvidence`, so the key **reaches the model provider verbatim**) · `cmd-benign-rm-home-var-with-tail` (`rm -rf $HOME/.cache/pip` → hard block, un-relaxable).

**Deliverables.** One red test per residual, on its actual lane. Fix without deleting or weakening the case. Assert expected class, decision, enforcement result **and final system state**. Each becomes a permanent regression case.

**Plus the bank-drain rule (P0-05).** (a) A benign BLOCK/REDACT is **never** bankable — delete the `cmd-benign-rm-home-var-with-tail` entry from `plan:6943-6953` and make the gate refuse a `"verdict": "block"` entry exactly as `plan:7238-7241` already does for Static-Worker. (b) A WARN/PROMPT bank entry requires owner, defect id, cause, first-seen version, **max age, expiry** and certificate impact. (c) Add exit criterion "zero known benign hard stops and no expired visible-intervention debt." (d) Fix `toolrisk.go:122` so `$HOME/<subpath>` with a narrow tail does not satisfy the broad-target alternation. (e) Correct the stale `cmd-benign-sudo-restart-nginx` template row at `plan:6949`.

**Exit criteria.** `HOLDOUT_REPORT.md` regenerated from the exact rebased commit shows **0 benign interruptions of 23** and **12/12 egress attack recall, 8/8 ingress** — or each survivor is named with an owner and a certificate downgrade. The FP baseline file contains **zero `"verdict": "block"` entries**.

**Defeat test.** Revert each individual fix and prove its exact fixture fails again. An aggregate-rate assertion is explicitly insufficient.

---

### **Wave 4B — Tool/effect detection quality**

**Purpose.** The detector proposes a normalized destructive capability; **policy** decides production impact.

**Deliverables.**
- **Split `plan` Task 5.** (a) Detector emits a normalized DESTRUCTIVE-CAPABILITY proposal, never "production impact." (b) Build an **effect resolver** over executable + normalized argv + env (`AWS_PROFILE`, `AWS_REGION`, `PGHOST`, `KUBECONFIG`, kube-context) + resource id/tags + desired state + reversibility + parser confidence. **None of this exists** — repo-wide grep for `effectResolver`/`resolveEffect`/`NormalizedEffect` returns only unrelated push-policy symbols. (c) Policy binds approval to the exact normalized effect. (d) Unknown or incomplete high-impact resolution → `INSPECTION_INCOMPLETE` → hold/restricted, **never a clean allow**. (e) Quoted/committed/document text is a data context and must not reach an enforcing disposition.
- **Delete `deriveCombos`** (`plan:7805-7894`) and the `corroborated-elevated-risk` exit criterion (`plan:9650`). Replace with named relation-specific correlations, each declaring threat objective, required source class, required sink class, valid surfaces, a **relation predicate** (same AST command | dataflow | shared destination | same resource | bounded proximity | ordered session sequence), a time/call boundary, evidence and uncertainty behaviour, benign counterexamples, and the final state that proves prevention. **Two findings with no provable relation stay two findings.** Precedent note: `promptrisk.go:832` recognises three *named pairs*; `ingressrisk.go:334` recognises one. Neither is a generic amplifier.
- **Rewrite Task 6 Step 3 against current Backend.** Any class added to `AI_TOOL_RISK_HIGH/MEDIUM/INFO_CLASSES` must simultaneously get a row in `AI_TOOL_RISK_D4_TIERS`, or `resolveToolRiskDefaults` **throws at module load in every environment including the first importing test.** The plan adds six classes and never touches D4.
- **Fix the taint input (P0-06).** `taintRisky` must carry evidence/provenance and policy state instead of `any non-INFO raw finding`. Require Product/Security ratification of which monitor-policy signals may make an already-tainted action risky, with paired benign-sequence precision and poisoned-sequence recall **before** any narrowing — Risk 5's poisoned-session HOLD is a genuine control that must not be weakened to fix this.
- **Two C5 residuals become release-blocking regressions:** `cmdsubst-verb`, `non-ifs-unknown-sep`, plus the `rm -rf "$HOME"` residue currently pinned as *expected to evade*.
- Replace `plan:9656`'s Windows exit criterion. Documentation of a limitation is not an exit pass: Risk 4 / managed-Windows evasive coverage is recorded **NOT_READY** with owner, planned packet, and the exact residual list.

**Exit criteria.**
- Per-class recall ≥ a ratified threshold with a one-sided lower bound (see §6). **`chmod-broad-777` at 0/1 must be a RED, not a footnote.**
- Zero enforcing dispositions reachable from a git commit message or a Markdown runbook line. Today **7 of 7** benign twins fire HIGH.
- `TestC5_UnknownTransforms_Inventory` contains assertions; `NOT-CAUGHT` fails the build.

**Defeat test.** Delete the `chmod-broad-777` and `sudoers-edit` detectors entirely. Aggregate attack recall stays **8/10 = 80%** and the plan's current gate stays **green** — that is the failure the new gate must convert to red.

---

### **Wave 4C — Prompt/ingress detection quality**

**Purpose.** Risk 5 is not a detector problem; it is an architecture problem with a measurement problem attached.

**Deliverables.**
- **Gate the six-class promotion** (`plan:9400`, `9529`, `9564` — `injection-system-exfil`, `injection-instruction-override`, `ingress-tool-instruction-injection`, `injection-authority-escalation`, `injection-credential-exfil`, `ingress-exfil-instruction`) on the **prompt-lane report**, not the tool shadow. Block on the measured **0% `injection-system-exfil` recall**.
- **Reuse the instruments that exist:** `neutral-corpus.holdout.jsonl` (12 promptrisk cases) and `internal/promptrisk/corpus_test.go` + `testdata/corpus`. Grow them to a stated size before any class moves.
- Preserve **typed provenance** across every hop; separate trusted instructions from untrusted data structurally; restrict capability while untrusted-derived instructions are in scope.
- Add a **semantic/adaptive arm** beside the deterministic lexical one. Measure **unauthorized final effects**, benign task completion and intervention load — not detector hits.
- Extend the corpus with Hebrew, Arabic, mixed script, paraphrase, role-play, long context, code comments, HTML/Markdown, nested encoding, split tool results, cross-turn, delayed action, repository injection, and **clean-security-documentation twins**.
- **Report per surface, never as one number:** Claude Code lane, Codex lane, MCP lane, browser/extension lane — each raw and safeguarded, at ASR@1/@10/@100. Surface dominates model: one vendor's own disclosure reports **0% success across 200 attempts** in a constrained coding environment versus **78.6% by the 200th attempt** in a GUI/browser environment.
- **Label every static-corpus result as regression evidence** in the manifest `suite` field. Make the adaptive suite **defence-aware** — the attacker gets the class list, the normalizer behaviour and the decision reason string.

**Exit criteria.** ASR upper bound below 1% per declared stratum with scenario-clustered intervals (see §6 for the count). Benign-twin over-defence measured with its own denominator.

**Defeat test.** Revert the `injection-system-exfil` fix; `attack-system-prompt-exfil` must return to `verdict=allow` and the gate must go red. Today the same state exists and **nothing is red.**

---

### **Wave 5 — Console truth** *(largely preserved; new instrument available)*

**Purpose.** Make the UI a projection of the evidence manifest.

**Adjust.** The console engine is now current (C10) and a render-harness exists (C15) — **use them, do not rebuild.** Add the `pull_request` trigger to `vendored-upstream-drift.yml`.

**Deliverables.** The UI must distinguish: detection match / private monitor telemetry / customer-visible detection / policy decision / enforcement result / security outcome / coverage-unknown state / certificate boundary + freshness + exclusions + downgrade reason.

**Plus one control the review does not have (OWASP ASI09):** prove the confirmation dialog renders the **raw proposed action** — command, path, destination — and **not a model-authored paraphrase.** One UI assertion, mapped to a named external control.

**Exit criteria.** Every number on the AI Security surfaces traces to a manifest field. Zero rendered denominators without a source.

**Defeat test.** Set one manifest field to `null`; the console must render "NOT MEASURED," not `0`.

---

### **Wave 6 — Triage, adjudication, and incident learning**

**Purpose.** Turn an existing measured rate into a governed quality label.

**Do not rebuild the pipeline (W11).** Extend it:
- Widen `AI_EVENT_TRIAGE_CLASSIFICATIONS` from **4 → 7**: split `benign_expected` into *policy-too-strict* and *authorized-action*; add *incorrect-explanation*, *duplicate*, *reviewed-unknown*. Migrate existing rows and record the mapping.
- Add detector/class/version/policy attribution so `fpRate` is attributable to a **version**, not just a class.
- Add second-reviewer + adjudication to the production row, **mirroring the field names already in `case.governance.adjudication`** so the two vocabularies converge.
- Add reviewer-agreement measurement; a provenance-carrying promotion path from a triaged production event into the protected corpus; appeal/suppression/exception-expiry with label-poisoning controls.
- **No threshold is ever updated online from untrusted user feedback.**
- Wire `FALSE_POSITIVE_STORM` (`ai-policy-rollback.service.ts:11`) to a change-point monitor over the existing measured rate; declare the automatic rollback threshold.
- **Inventory the autonomous FP-review agent that landed in Ceragon-Intelligence** (`30d6c6d8..486d937b`, 73 of 80 files under `deploy/home`: intake, window, triage, run control, judge boundary, campaign state machine, verdict re-derivation after a fix). It lands squarely in this wave's territory and did not exist when the plan was written.

**Exit criteria.** No production FP rate is citable as a quality label until a second reviewer and an adjudication record exist on the row.

**Defeat test.** Submit conflicting labels from two reviewers; the row must enter adjudication, not last-write-wins.

---

### **Wave 7A — Scanner execution truth** *(preserve; Scanner repo unmoved)*

Keep the false-green work, the execution manifest, fork/poll behaviour and `COVERAGE_FAILED`. `scanner-worker/.github/workflows/test.yml:53-58` still resolves and still says what the plan says. Preserve existing scanner signing and require **live** exact-SHA/tenant/policy binding, replay, completeness, rotation and outage proof before authoritative certification. Do not conflate with the separate artifact-admission transport lane (P0-17).

**Defeat test.** Disable the finding logic while leaving engine execution/status green. The detection-quality gate must fail even though the W7 execution manifest passes.

---

### **Wave 7B — Scanner detection certification**

**Purpose.** Execution coverage is not detection coverage.

**Deliverables.** CWE × language × framework strata; reachable/unreachable source→sink twins; mutation and repair-revert tests; per-engine expected findings and end-to-end merge outcome; engine/ruleset/model pinning; **enforcement tiers** (high-precision enforcing vs extended advisory, the CodeQL pattern); sealed scanner-injection corpus executed through **every enabled Anthropic/Gemini route** with the exact release model and prompt (P0-13).

**Plus the corpus contract (P1-04).** Every fixture in `corpus/tp-fixtures` and `corpus/artifact-fixtures` declares applicable ecosystems/classes, expected finding class/code, minimum verdict, expected final state. **A miss in ANY applicable ecosystem fails.** Rewrite Gate 2's `rows.every(ALLOW)` → per-applicable-class, and the package lane's `nv !== 'ALLOW' || pv !== 'ALLOW'` → per-declared-ecosystem. Re-bank `tp-zero-width-smuggled-directive [plugin]` in `CATCH_BASELINE.json` with a written reason, and correct `catchRate: 1`. Add a build-freshness assertion — `beforeAll` currently only checks that `dist/analyzer/smart-heuristic-scanner.js` **exists**.

**Exit criteria.** No aggregate score hides a failed critical stratum. Per-class escape list is empty or banked with a reason.

**Defeat test.** Inject a repository instruction telling the scanner to omit one seeded critical finding and invent another. Prove the real finding survives, the fabricated one is rejected or non-enforcing, and coverage does not turn green from model output alone.

---

### **Wave 8 — Authoritative enforcement, canary, rollback, certificate**

**Purpose.** The difference between detecting a proposal and preventing an action.

**Deliverables.** Enumerate every in-scope high-impact sink; route 100% through an authoritative withholding checkpoint; **widen the already-connected effect-bound transaction** (`ai_handlers.go:3063`) from the WS-D taint overlay to every sink; bind subject/runtime/executable/normalized args/resource/destination/credential scope/artifact+policy digest/expiry/use-count; accept approval only from a trusted independent human channel; restricted/read-only mode on authority failure. Plus the pre-egress data boundary (P0-15), lane-specific signed transport (P0-17), sandbox containment (P0-18), **F16 endpoint signing-key custody** (P0-19), protected branches, rollout 5%→25%→100%, automatic halt/rollback, live effect and secret-egress canaries, independent reproduction, machine-readable certificate with automatic expiry.

**Use anytime-valid inference for the live canary** — confidence sequences / e-processes, not a fixed-horizon interval that is peeked at continuously. Review §9.5 offers "fixed-horizon or sequential"; canary monitoring is inherently continuous, so sequential is the default, not an option.

**Defeat tests.** Replay, expiry, changed arguments, changed target, executable swap, identity swap, stale policy, fake approval text, daemon outage, direct-binary bypass — all must fail at the final boundary. For F16: every non-elevated entry point must be denied mint/choose/replace/read/export.

---

## 5. THE CERTIFICATE MODEL

### 5.1 Two estimators, declared per row

The review conflates gating with reporting. Split them.

- **Gate:** exact one-sided **Clopper-Pearson**. Its over-coverage is the *desired* property for a claim that must not be overstated, and at zero events it reduces to the `1 − 0.05^(1/n)` formula the review already uses correctly.
- **Report:** **Bayesian interval with uniform prior**, per NIST TN 2119's own first choice (TN 2119 explicitly calls Clopper-Pearson too conservative). Wilson/Agresti-Coull acceptable only above n≈40.
- **Wald is banned everywhere.**
- **Do not substitute Wilson for the gate.** At zero events the one-sided 95% Wilson upper bound is `z²/(n+z²)` with z=1.6449: at n=29,956 Wilson gives **90.3 ppm** where exact gives exactly **100.0 ppm**, and Wilson reaches the 100 ppm claim at **n=27,055** vs **29,956** — a **9.7% shortfall in evidence for an identical published claim.**

### 5.2 Two-tier gate structure (fixes W16)

| | Tier A — enforcing strata | Tier B — everything else |
|---|---|---|
| Membership | Predeclared, **K ≤ 6**, the strata that can hard-block or redact | All remaining classes |
| Claim | Full exact one-sided bound, **Holm/Bonferroni FWER at α=0.05/K** | Exposure gate only (binary: non-zero eligible denominator in the window) + raw interval reported with honest width and **no threshold attached** |
| Multiplicity | FWER | **FDR (Benjamini-Hochberg)** — this is a screening surface, not a release claim |
| Every class must be assigned to a tier in the plan text | ✓ | ✓ |

### 5.3 Refined manifest schema

Review §10's shape, with the additions the research forces (changes in **bold**):

```json
{
  "schemaVersion": 2,
  "certificateId": "m47a-<risk>-<profile>-<release>",
  "profile": { "id":"managed-windows-codex-v1", "protectedPopulation":"", "exclusions":[], "prerequisites":[] },
  "system": {
    "sourceCommits": {}, "artifactDigests": {},
    "detectorCatalogDigest":"sha256:", "policyDigest":"sha256:",
    "**rulesetDigest**":"sha256:", "**normalizerVersion**":"", "**parserVersion**":"",
    "runtime":"", "osShellTool":"", "modelProviderPrompt":"",
    "**engineVersion**":"",            // MUST NOT be "m4.7"; mandatory, no default
    "**environmentDigest**":"sha256:", // goVersion+goos+goarch+OS build+shell+tool schema
    "**standardsMapping**": { "owaspLlm2026":[], "owaspAsi2026":[], "atlasRelease":"v2026.07",
                              "atlasTechniques":[], "aiuc1Controls":[] }
  },
  "evaluation": {
    "lane":"prompt|ingress|tool|dlp|scanner|package",
    "**surface**":"claude-code|codex|mcp|browser-extension|scanner",
    "suite":"regression|property|benign-replay|e2e|private-adaptive|incident",
    "corpusDigest":"sha256:", "labelVersion":"", "windowStart":"", "windowEnd":"",
    "eligible":0,"executed":0,"unknown":0,"dropped":0,
    "uniqueUsersSessionsEndpointsTenants":{},
    "**clusteringUnit**":"scenario|session|user|tenant|endpoint",
    "**nEffective**":0,                // n / deff, deff = 1+(m-1)rho
    "**rho**":null,
    "strata":[]
  },
  "metrics": {
    "precision":{"numerator":0,"denominator":0,"lower95":null,
                 "**gateMethod**":"clopper-pearson-onesided","**reportMethod**":"bayes-uniform"},
    "recall":{"numerator":0,"denominator":0,"lower95":null},
    "falsePositiveRate":{"numerator":0,"denominator":0,"upper95":null},
    "**ppvAtDeclaredBaseRate**":{"baseRate":null,"value":null,"lower95":null},
    "unknownRate":{"numerator":0,"denominator":0,"upper95":null},
    "adaptiveAsr":[{"stratum":"","asrAt1":null,"asrAt10":null,"asrAt100":null,
                    "**scenarios**":0,"**attemptsPerScenario**":0,"upper95":null,
                    "**safeguards**":"on|off"}],
    "**inspectionCompleteness**":{"complete":0,"degraded":0,"denominatorUncertainty":null},
    "utility":{},"interventions":{},"latency":{}
  },
  "**multiplicity**": { "family":[], "K":0, "method":"holm|bonferroni|benjamini-hochberg",
                        "alphaPerClaim":null, "**tier**":"A|B" },
  "proof": { "positive":[],"negative":[],"degraded":[],"replay":[],"bypass":[],
             "rollback":[],"liveCanary":[],"independentReview":[] },
  "status":"PASS|FAIL|UNKNOWN|NOT_READY",
  "expiresAt":"",            // TTL = 90 days, matching AIUC-1's quarterly re-test requirement
  "downgradeTriggers":[]
}
```

Missing measurements stay `null` and force `UNKNOWN`/`NOT_READY`. **This is a schema requirement, not permission to fill unknown numbers with zero.**

### 5.4 Which of the five risk lanes can reach PASS with this packet

Roadmap risks: **R1** secrets/company-data exposure · **R2** insecure code reaching a protected branch/release · **R3** malicious dependency/MCP/plugin/skill/extension/artifact admission · **R4** dangerous command or production action · **R5** prompt injection hijacking an agent.

**None of the five can reach PASS from this packet.** That is the honest answer and it should be written into the plan's goal statement at `plan:5, 26-30`.

| Risk | State | Named blockers, each with a source |
|---|---|---|
| **R1** | **NOT_READY** | 51 of 81 DLP classes ungovernable (`AI_DLP_CLASSES`=30 vs `RegisteredClasses()`=81). Two published FN residuals (`attack-private-key-block`, `attack-prod-db-connection-string`) plus the ingress private-key leak reaching the provider verbatim. No pre-egress boundary across every provider route (P0-15). No inspection-completeness contract; `InspectionDegraded` has **zero production consumers**. F16 key custody absent (`roadmap:788`; plan mentions F16 zero times). Prompt-evidence key distribution and `ai_events` retention are declared exclusions. |
| **R2** | **NOT_READY** (execution-truth *dimension* can reach PASS) | No CWE × language × framework precision/recall program (P0-12). Scanner injection defences real but behaviourally unproven (P0-13). Signed transport needs **live** binding/replay/completeness/rotation/outage proof (P0-17). Ecosystem-blind TP predicate hides a measured escape (P1-04). **Branch protection is impossible on the current GitHub plan — all six repos return 403 — and the roadmap makes M5.3-A mandatory for any 9+ R2 profile.** That is a billing decision, not code. |
| **R3** | **NOT_READY** | Unsigned/permissive artifact-admission job and result transport (P0-17). Sandbox `strace`/`direct` modes execute the untrusted package **before** the inconclusive verdict is written (P0-18). Roadmap makes **M5.2** skill/plugin runtime closure mandatory before broad R3 certification. F16. |
| **R4** | **NOT_READY** | A known-benign command is **hard-blocked fleet-wide with no admin override** and the floor now holds on the read path (P0-05) — the only item on this lane with live customer impact today. `chmod-broad-777` measured at **0% recall** under the shipped policy (P0-07). No effect resolver; 9 production evasions silent, 7 zero-impact twins HIGH including a commit message and a runbook line (P0-08). Semantic lane is Bash-only; two C5 residuals green by design (P0-09). Effect broker connected only on the taint overlay (P0-16). F16. |
| **R5** | **NOT_READY** | Sealed-holdout recall **9/12 = 75%**; `injection-system-exfil` **0%**; two benign FPs at warn. 15/52 benign texts still fire at interrupt tier. No provenance typing, no effect grader, no adaptive evaluation (P0-11). Monitor-policy classes still convert an ALLOW into a HOLD on an independently tainted session (P0-06). **The lexical classifier is structurally ineligible to be an enforcing tier** — see §7. On the owner's own machine the Codex hook lane is not claimed to fire at all (client 0.149.0-alpha.4.1 vs a two-row dialect table). |

**What CAN reach PASS** — as bounded engineering-assurance *dimensions*, not risk certificates: scanner **execution** truth; tool-risk **policy authority and catalog totality** (already largely closed, C3/C4); the **measurement-substrate integrity** dimension after Wave 3; **console truth** after Wave 5. Each is a legitimate deliverable. None of them is a risk lane.

---

## 6. THE CORPUS PROGRAM

Review §12's six suites, sized. All bounds are exact one-sided 95%, zero observed errors, `1 − 0.05^(1/n)`; recall lower bounds are `0.05^(1/n)`.

### 6.1 The reference table

| n (zero errors) | FP upper bound | Recall lower bound |
|---:|---:|---:|
| 1 | 95.0% | 5.0% |
| 8 | 31.2% | 68.8% |
| 10 | **25.89%** | 74.1% |
| 12 | 22.09% | 77.9% |
| 18 | **15.33%** | 84.7% |
| 23 | 12.21% | 87.8% |
| **29** | 9.81% | **90.2%** |
| 39 | 7.39% | 92.6% |
| 51 | **5.70%** | 94.3% |
| **59** | 4.95% | **95.0%** |
| 128 | **2.31%** | 97.7% |
| 129 | 2.30% | 97.7% |
| **299** | **1.00%** | **99.0%** |
| 2,995 | 0.100% | 99.90% |
| 29,956 | **100 ppm** | 99.990% |
| 299,572 | 10 ppm | 99.999% |

**With Holm/Bonferroni at α=0.05/K, zero errors, ≤100 ppm:** K=1 → 29,956 · K=6 → **47,873** per class (287,238 total) · K=30 → 63,967 per class (1.92M) · K=114 → **77,316 per class, 8.81M total.** The last is why the review's unmodified requirements are unreachable.

### 6.2 What the current corpora actually buy

| Corpus | n | Best claim it supports |
|---|---:|---|
| `parity-vectors/command-expansion.json` benign | 51 | FP ≤ **5.70%** — and it is not zero-error: 1 benign hard block |
| same, attack | 10 | recall ≥ 74.1% *if 10/10*; it is **9/10**, and `chmod-broad-777` is **0/1** |
| `neutral-corpus.holdout.jsonl` benign | 23 | FP ≤ 12.21% — not zero-error: 2 interrupts |
| same, attack | 12 | recall ≥ 77.9% *if 12/12*; it is **9/12** |
| `neutral-corpus.ingress.jsonl` | 28 B / 8 A | ingress recall ≥ 68.8% *if 8/8*; it is **7/8** |
| `internal/promptrisk` corpus | 52 B / 35 A | FP ≤ 5.60% *if zero*; it is **15/52** |
| `neutral-corpus.all.jsonl` dlp cases | 128 | FP ≤ **2.31%** |
| Static-Worker TP fixtures | 18 | ≤ **15.33%** |

**Nothing in the workspace today supports a claim better than ≈2.3%, and every enforcing lane is worse than 5%.**

### 6.3 Suite sizing

**Suite 1 — Canonical regression (immutable).** Every confirmed incident, miss, false block, fixed bypass. Seed = the 7 Wave-4A residuals + the 2 C5 residuals + `chmod-broad-777` + `tp-zero-width-smuggled-directive [plugin]`. **Target: 100% retained forever; no size bound — this suite proves non-regression, never a rate.**

**Suite 2 — Transform/property.** Semantic base cases × equivalent encodings; all descendants in one split; near-dedupe before splitting. **Target: ≥20 transforms per base family** (the C5 inventory is 22 today — convert it from a printer into a gate). No statistical claim; this is a coverage matrix.

**Suite 3 — Representative benign replay (the FP denominator).**
- **Tier A aggregate hard-block claim, K=1:** **29,956** zero-error benign enforcing-eligible opportunities → **≤100 ppm**.
- **Tier A per-stratum, K=6 at ≤0.1%:** `ln(0.05/6)/ln(0.999)` = **4,785 per stratum**, 28,710 total. **A balanced 29,956-case corpus stratified 6 ways gives 4,993 per stratum — it clears both claims from one corpus.** That is the buildable design.
- **Tier B per-class:** 1,000 benign per class → ≤0.299%; 300 → ≤0.995%; 100 → ≤2.95%. Report the interval; attach no threshold; control FDR.
- Today's 51 benign command cases buy ≤5.70%. **The gap to Tier A is roughly 590×.**

**Suite 4 — End-to-end environments with deterministic final-state graders.** Adaptive-ASR unit of analysis is the **scenario**, not the attempt. Design effect `deff = 1+(m−1)ρ`: at m=100 attempts and ρ=0.5, **deff=50.5 → 100 attempts carry the weight of 2.0 independent trials** (ρ=0.3 → 3.3; ρ=0.8 → 1.2). Therefore:
- **299 independent scenarios per stratum, zero successes → ASR ≤1%.**
- Holm across 6 strata → **477 per stratum.**
- Per prompt surface (4 surfaces: Claude Code, Codex, MCP, browser/extension), Holm at K=4 → **436 scenarios per surface**, 1,744 total.
- For calibration: 28 scenarios with zero successes supports only ≤10.15%; 129 held-out environments (what a frontier lab actually fields) supports ≤2.30%. **299 is the target and it is buildable.**

**Suite 5 — Private adaptive holdout.** Independently owned, hidden from detector authors, **never published in any form including redacted or hashed**, **regenerated per release**. Today's `neutral-corpus.holdout.jsonl` is 39 cases and *is* sealed (`holdout_seal_test.go` fails if any test references it) — keep the mechanism, grow the size. Target for a ≥95% recall lower bound per enforcing class: **59 zero-miss attack cases per class**; for ≥90%: **29**. For 40 tool classes at 29 each = **1,160 attack cases**; at 59 each = 2,360.

**Suite 6 — Incident suite.** Every production bypass, false hard stop, policy error, race, drift, explanation failure. **No size target; the gate is "zero unmigrated incidents."**

**Precision side.** A ≥99.9% lower precision bound with zero false blocks needs **2,995 independently adjudicated candidate blocks**. Two labelers plus a tie-breaker, inter-rater reliability reported.

**Over-defence.** Build a benign-twin corpus of security documentation, incident write-ups, CVE text and secure-coding examples, and measure over-defence as a first-class metric with its own denominator. This is where a lexical engine fails in front of a customer — and it is exactly where the product already fails today (`qa-fp-detections-finding-name`: the console rendering the *name* `jailbreak-persona` triggers a prompt-risk warning).

**Also add to the gate table (review §9.1 omits it): PPV at the declared production base rate.** An FPR bound does not describe what a customer experiences; two products with identical FPR have different alert quality at different base rates, and the buyer's question is always what fraction of blocks were real.

---

## 7. WHAT WE MUST NOT CLAIM

### Forbidden outright

- **"Zero false positives."** Measured today: 1 benign hard block per 51 ordinary commands, un-relaxable; 15/52 benign prompts at interrupt tier; 2/23 sealed benign interrupts.
- **"All detections are high quality."** 43 of 55 detector classes report `fnRate: 0` on **zero** attack cases.
- **"Evasive attacks are covered."** Two named semantic residuals plus a pinned `rm -rf "$HOME"` evasion. Claimable instead: *the Bash shape and AST family, with the two semantic residuals named.*
- **"Prompt injection is high-assurance protected."** 75% sealed recall, `injection-system-exfil` at 0%, no adaptive evaluation, English-only rules.
- **"All DLP classes are governed."** 30 of 81.
- **"A green scan proves vulnerable code was not introduced."** W7 proves execution, not detection.
- **"Dangerous production actions are prevented."** 9 production-effect spellings produce no finding; the effect broker covers one overlay path.
- **"M4.7A is complete."** / **"Risks 1, 2, 4 or 5 are 9+/10."**

### Forbidden by the research, and not in review §19

- **Do not present a static-corpus prompt-injection result as a release claim.** Adaptive attacks broke **all eight** defences studied (arXiv:2503.00061), ASR consistently over 50%. Second-generation reference-monitor defences (CaMeL, FIDES, Progent, RTBAS, FORGE, Conseca) report near-elimination on static benchmarks and **have never been adaptively evaluated** (arXiv:2606.26479, 2026-06-25) — the same methodology gap that made the first generation look strong. Static = regression evidence, labelled as such in the manifest `suite` field.
- **Do not publish a single prompt-injection number.** Same vendor, same disclosure: 0% across 200 attempts in a constrained coding environment vs 78.6% by attempt 200 in a GUI environment. **Surface dominates model.** For DeVoid the honest safeguards-off column for the Codex surface on the owner's own machine is real: client 0.149.0-alpha.4.1 sits outside every accepted hook-trust dialect including the newly added 0.147.
- **Do not claim the lexical/ML prompt classifier can be an enforcing tier.** Published guard models operate around **1% FPR** — ten times the product's own budget of ≤1 unnecessary visible intervention per 1,000 benign sessions (0.1%) and ≤5 confirmations per 1,000 benign opportunities (0.5%). Axelsson's base-rate result for intrusion detection lands on the same order as the review's 100 ppm hard-block bound. This is arithmetic, not opinion; write it down and close the debate.
- **Do not claim safeguards coverage at install time.** The MSI does **not** wire the AI hook lane; a per-user scheduled task does, ~1 minute later.
- **Do not claim a corpus is uncontaminated because it carries a canary.** The BIG-bench canary GUID was reproducible on demand by GPT-4 — the filter became the proof of contamination.
- **Do not promise third-party validation of the detection engine.** None exists for AI runtime defence, and MITRE ATT&CK Evaluations lost Microsoft, SentinelOne and Palo Alto from its 2026 round.
- **Do not treat the measured production FP rate as a certified quality label.** A single reviewer can set it and `benign_expected` conflates two different verdicts. It is a signal, not a certificate input.

### Claimable today, with the exact test named

- "Scanner execution absence and partial coverage no longer appear as green on the named paths."
- "The console's detection engine is byte-identical to the shipped endpoint engine" — pin `254d24fc`, three digests, LF-normalised (**caveat: guarded per-PR only against local edits; upstream drift is a daily poll**).
- "Tool shadow capture is local-only and behaviour-invariant on the named tool path."
- "The named policy floor is enforced on the tested **write and read** paths" — `dfbac545`, `phase-b-content.spec.ts:661-673`.
- "The shipped tool-risk default posture is 23 block / 2 warn / 12 monitor / 3 allow" — `tool-risk-d4-tiers.spec.ts`, red proof at `:302`.
- "The agent's AI rule-file walk is depth-unbounded and reports its own completeness" — `RuleWalkCoverage`, measured 585→1,099 files.
- "A Linux sandbox run does not vouch for a non-Linux payload."
- "The prompt lane's false-positive rate is measured at 15/52 benign at warn-or-above and 0/52 at block tier, on an 87-case corpus."

---

## 8. THE CRITICAL PATH TO CUSTOMER READY

"Customer ready" for a runtime AI security protection and detection engine means, concretely: **an admin can see and set every class the endpoint can emit; ordinary developer work is not interrupted; the classes that do interrupt have a measured recall and a bounded false-positive rate on a corpus the detector authors did not tune against; a consequential action cannot happen without passing an authoritative checkpoint; and every number on the console traces to a manifest that names the build that produced it.** Ordered, with the honest blocker at each step.

**Step 1 — Stop hard-blocking ordinary work.** *(days, internal only)*
Fix `toolrisk.go:122` so `$HOME/<subpath>` with a narrow tail does not satisfy the broad-target alternation. **This is the only item on the whole list with live customer impact today** — `rm -rf $HOME/.cache/pip` is blocked fleet-wide and the malicious floor means no admin can relax it. Blocker: none. Requires a Backend deploy *before* an agent release only if the floor membership changes; it does not.

**Step 2 — Restore the two instruments that stopped gating.** *(hours)*
`holdout-score.yml` push trigger (or a written decision that detector quality is nightly and non-gating — and fix the header that still claims otherwise); `vendored-upstream-drift.yml` `pull_request` trigger per its own instruction. Blocker: **the push trigger was removed as a cost gate by owner decision.** GitHub Actions were unblocked on 2026-08-27, so the constraint is now budget, not availability. **Owner decision, not mine.**

**Step 3 — Close the 51 ungoverned DLP classes.** *(1–2 weeks)*
Generate `AI_DLP_CLASSES` from `RegisteredClasses()`. Backend-before-agent ordering applies: the enum widens on the policy write path, so Backend deploys first or the console 400s. Blocker: none technical.

**Step 4 — Fix the measurement instruments before measuring anything.** *(1–2 weeks)*
`holdout.go:357-358` (per-class denominator), `holdout.go:114/379` (UNKNOWN not `fnRate: 0`), `--engine-version` mandatory, `EnvironmentDigest` widened. Blocker: none. **Everything downstream is invalid until this lands** — 43 of 55 classes currently report perfect recall on zero evidence.

**Step 5 — Close the seven published residuals, each with a revert-proof.** *(2–4 weeks)*
Blocker: `attack-private-key-block` and `ingress-attack-private-key-in-tool-output` need a **redaction-posture change with its own FP question** (the ingress redactor needs a failure-oracle seam). That is a real design decision, not a patch.

**Step 6 — Build the benign replay corpus.** *(the long pole: 2–4 months)*
29,956 zero-error benign enforcing-eligible opportunities, stratified 6 ways (4,993 per stratum, clearing the 4,785 Holm requirement). **Honest blocker: this cannot be synthesised.** It requires locally-consented replay of real sanctioned developer and admin workflows. Near-duplicate mutations and retries do not count. Today's denominator is 51. **This is the single largest calendar item on the path and it is a data-collection program, not an engineering task.**

**Step 7 — Effect resolver and named correlations.** *(4–6 weeks, gated on Step 6 for its FP measurement)*
Blocker: `deriveCombos` must be deleted before it ships, not after. Under D4 it would manufacture the only interruption a developer sees.

**Step 8 — Prompt/ingress architecture, then adaptive evaluation.** *(2–3 months)*
299 scenarios per stratum, 436 per surface across 4 surfaces. **Blockers, external:** (a) the adaptive arm needs multiple attacker models plus human expert attempts — that is contracted red-team time, not engineering; (b) **the Codex surface cannot be measured safeguards-on on the owner's own machine** until the hook-trust dialect covers 0.149.0-alpha.4.1, and widening the dialect pin is explicitly forbidden by prior decision (the fix is `verify.go:608`, not the pin). Whether 0.149 is stable enough to accept is a **vendor-artifact dependency: UNKNOWN.**

**Step 9 — Authoritative effect boundary.** *(2–3 months)*
Widen the connected transaction from the taint overlay to every high-impact sink. **Blocker, external: F16.** Non-exportable endpoint signing-key custody requires a SYSTEM/privileged broker or a KMS/HSM/TPM key owner — a **signing-infrastructure dependency with procurement and key-ceremony lead time.** R1, R3, R4 and the shared trust gate cannot certify without it, per `roadmap:788`.

**Step 10 — Scanner detection certification.** *(2–3 months, parallelisable)*
**Blocker, external: branch protection is impossible on the current GitHub plan** — all six repos return 403, and the roadmap makes M5.3-A mandatory for any 9+ R2 profile. **That is a billing decision the owner must make; it is not a code problem.**

**Step 11 — Live canary, independent reproduction, certificate.** *(4–6 weeks after Step 9)*
**Blockers, external:** (a) a named **independent evaluation owner who is not a detector author** must hold the sealed corpus — currently UNKNOWN whether such a person exists; (b) **no third-party product evaluation body exists for AI runtime defence** — do not budget for one. The credible substitute is an **AIUC-1 independent audit** (51 requirements / 130 controls, Schellman is the accredited auditor, certificate valid 12 months but **requires technical testing at least quarterly** — which is why the manifest TTL should be 90 days). The Q3-2026 revision (2026-07-15) added exactly DeVoid's surface: **A008** secrets in generated code/logs/storage, **B010.3** typosquatted and hallucinated dependencies, **B006.3** scanning configuration artifacts for prompt-injection risk (the rule-file walk PR #179 just un-capped), **B006.1** approved MCP servers only. Map the class catalog to these ids in the same commit that adds the ATLAS ids, and one corpus run serves both the internal gate and the external audit; (c) **live canary needs prod capacity** — ECS worker services have been at 0/0 since the 2026-06-26 power-off; `scripts/ceragon-power-on.ps1` restores them, but **a fresh explicit ask from the owner is required every time.**

**Step 12 — Publish a DeVoid system card**, in the schema buyers now score vendors against: per-surface ASR raw and safeguarded, persistence-scaled 1→200 attempts, named attacker methodology (adaptive vs known), held-out environment count, external red-team evidence, explicit regressions. The safeguards-off column for the Codex surface belongs on that page rather than being absorbed by a coverage claim.

**Dropped from scope, deliberately.** EU AI Act readiness — the Digital Omnibus (in force 2026-07-27) moved Annex III high-risk to 2027-12-02 and Annex I to 2028-08-02. Spend that effort on the three artifacts a buyer's security review requests today: an **ISO/IEC 42001** roadmap statement, a **CSA AI-CAIQ / AICM** response, and the **AIUC-1** mapping. All three draw on the same evidence manifest, so this is packaging on top of the measurement work, not a separate program.

**Cite in the certification-claim template:** the Five Eyes *Careful Adoption of Agentic AI Services* (CISA/NSA/ASD ACSC/CCCS/NCSC-NZ/NCSC-UK, 2026-05-01). Human approval at consequential actions and per-request least privilege are now government-stated requirements — which makes DeVoid's broker architecture a compliance answer rather than a security opinion. Its named risk category **"obscure event records / accountability opacity"** is precisely the defect class this workspace keeps shipping (console says X, endpoint does Y; the depth-8 walk logging "sweep complete"; `[OK]` printed over undecided invocations). Making **evidence completeness a first-class gate** is the direct answer to it, and it is what review §9.4's no-data rules already encode.

---

### Files that matter, absolute paths

- `C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` — 17,538 lines, unchanged since 2026-08-22 20:16
- `C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/M47A_DETECTION_QUALITY_REVIEW_20260823.md` — 1,990 lines
- `C:/Users/Owner/Documents/Ceragon/docs/Devoid_Roadmap_To_Finished_Product.md:788` — the F16 respec (separate repo)
- `C:/Users/Owner/Documents/Ceragon/docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md:695-829` — the sole numeric SLO authority
- `C:/Users/Owner/Documents/Ceragon/Installers/parity-vectors/neutral/HOLDOUT_REPORT.md` — all six residuals, live on origin/main
- `C:/Users/Owner/Documents/Ceragon/Installers/cmd/ai-security-neutral/holdout.go:114, 357-358, 379` — the three lines that invalidate every published per-class rate
- `C:/Users/Owner/Documents/Ceragon/Installers/internal/toolrisk/toolrisk.go:121-122` — the benign hard block
- `C:/Users/Owner/Documents/Ceragon/Installers/internal/daemon/ai_taint.go:159-166` — `taintRisky`, the monitor→HOLD mechanism
- `C:/Users/Owner/Documents/Ceragon/Backend/src/ai-security-policy/ai-security-policy.constants.ts:1195-1216, 1409-1417` — the D4 tally docblock and the module-load throw
- `C:/Users/Owner/Documents/Ceragon/Backend/src/ai-security-policy/ai-malicious-floor.ts:155, 285` — `destructive-rm` at minimum block; `withMaliciousFloorApplied`
- `C:/Users/Owner/Documents/Ceragon/Installers/.github/workflows/holdout-score.yml` — 89 lines, no push trigger, header still says there is one
- `C:/Users/Owner/Documents/Ceragon/Frontend/.github/workflows/vendored-upstream-drift.yml:39-43` — `pull_request` still absent after T-M2 landed

**Not verified this pass:** no AWS call was made (Wave 0's live task-definition claims and the `desiredCount: 0` blast radius are UNKNOWN); Scanner-repo `deployment/*-task-def.json` and `github-action/action.yml` line citations were not machine-resolved; Frontend and Static-Worker jest suites were not executed; P0-12, P0-13, P0-15, P0-17, P0-18, P0-19, P1-09, P1-10, P1-11, P1-12 are carried from the review with premise checks only, not with break/restore proofs.