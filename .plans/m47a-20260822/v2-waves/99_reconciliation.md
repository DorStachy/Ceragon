I have read all ten files and verified ~50 source claims against `origin/main`. Here is the reconciliation report.

---

# M4.7A v2 Wave Reconciliation Report
**Editor pass, 2026-08-28.** Ten files in `C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/v2-waves/`, 8,510 lines, covering waves −1, 0A, 0, 1, 2, 3, 3B, 4A, 4B, 4C, 7A, 7B, 8. Verified against Backend `0cf9021e`, Frontend `cac574ae`, Installers `5b129523`, Scanner `3d4116a5`, Static-Worker `44d7aabb` — all seven repos re-confirmed at the SHAs the spine's rebase manifest records.

---

## 0. Inventory

| File | Waves | Tasks | Lines |
|---|---|---:|---:|
| `00_spine.md` | — (goal, decisions, ordering, standing rules) | — | 228 |
| `w-minus-1_w0.md` | −1, 0A, 0 | 7 + 6 + 8 = 21 | 1,087 |
| `w1_policy_authority.md` | 1 | 7 | 668 |
| `w2_evidence_severity.md` | 2 | 10 | 937 |
| `w3_measurement_substrate.md` | 3 | 11 | 932 |
| `w3b_corpus_governance.md` | 3B | 13 | 1,017 |
| `w4a_w4b_tool_effect.md` | 4A, 4B | 8 + 10 = 18 | 463 |
| `w4c_prompt_ingress.md` | 4C | 11 | 1,071 |
| `w7_scanner.md` | 7A, 7B | 8 + 9 = 17 | 1,117 |
| `w8_enforcement_certificate.md` | 8 | 12 | 991 |
| **Total** | **13 waves** | **114 tasks** | **8,510** |

**Wave 5 (console truth) and Wave 6 (triage, adjudication, incident learning) have no file.** Both are in the source material's §4 wave structure, and six other waves defer work to them by name. See §5.

---

## 1. CONTRADICTIONS

### C-1 — `AI_DLP_CLASSES` cannot be generated from `RegisteredClasses()`. Wave −1 says it must be; Wave 1 proves it cannot.
- **Wave −1 Task 3 Step 3:** *"Make `AI_DLP_CLASSES` derive from the producer registry rather than from a hand-maintained 30-entry tuple."* Exit criterion 4: `AI_DLP_CLASSES.length === RegisteredClasses().length` — today **81**.
- **Wave 1 Task 2** establishes that `AI_DLP_CLASSES` is not a table: `ai-governance-contract.ts:262` reads it out of `AI_SECURITY_PORTABLE_ORDERED_TUPLES`, a **digest-pinned generated artifact** whose generator (`ceragon-ai-security-artifact` v1.3.1) does not exist in this workspace. Wave 1 therefore takes **Option B**: the governed tuple becomes `AI_SECURITY_DLP_CLASSES` in `ai-security-policy.constants.ts`, and `AI_DLP_CLASSES` stays the frozen 30-member V1 wire tuple.

**Wave 1 is right, verified:**
```
Backend/packages/shared-contracts/src/ai-governance-contract.ts:262
  export const AI_DLP_CLASSES = AI_SECURITY_PORTABLE_ORDERED_TUPLES.AI_DLP_CLASSES;
Backend/.../generated/ai-security-portable.generated.ts:18
  export const AI_SECURITY_PORTABLE_SOURCE_COMMIT = "d366f5f8c76fac253d9adf7914873e97a955a16d"
```
`git cat-file -t d366f5f8…` returns `could not get object info` in Backend, Frontend, Installers **and** Ceragon-Intelligence. The pinned tuple has exactly **30** members (counted). Wave −1's exit criterion 4 as written is unachievable and would be closed by hand-editing a digest-pinned generated file — the exact drift the pin exists to catch.

**Fix:** Wave −1 Task 3 becomes *discovery only* (run the `cat-file` sweep, record the unresolvable provenance as a finding, declare the fork). Wave 1 Task 2 owns the decision and Task 3 owns the widening. Wave −1 exit criterion 4 is restated as `AI_SECURITY_DLP_CLASSES.length === RegisteredClasses().length` and moved to Wave 1, where it already exists as criterion 1.

### C-2 — `holdoutReportFormatVersion` is bumped to 3 twice, with opposite characterisations.
- **Wave 3 Task 3 Step 3:** bump 2 → 3, *"This change is **not** additive: a consumer reading `fpRate` as a number now sees absence."*
- **Wave 3B Task 1:** bump to 3, *"additive, every version-2 field unchanged, matching the comment convention already at `:42-43`."*

Verified: `holdout.go:44` is `const holdoutReportFormatVersion = 2`, and `:42-43` carries the additive-convention comment. **Wave 3 is right** — nulling `fpRate`/`fnRate` is a breaking shape change. If both land, one commit's comment lies about the other's change. Wave 3 owns the bump to 3; Wave 3B's `System` block is additive on top and either rides version 3 or bumps to 4.

### C-3 — Two incompatible definitions of the required system-version tuple.
- **Wave 3 Task 5 exit:** *"a **7-field** system tuple — `engineVersion`, `artifactDigest`, `environmentDigest`, `rulesetDigest`, `detectorCatalogDigest`, `normalizerVersion`, `parserVersion` — plus `effectivePolicyDigest` on provenance."*
- **Wave 3B Task 2 exit:** *"`RunnerIdentity` carries **8** required identity fields (`runnerId`, `engineId`, `engineVersion`, `contractVersion`, `artifactDigest`, `rulesetDigest`, `normalizerVersion`, `parserVersion`) and `ResultProvenance` carries `policyDigest`."*

Wave 3B's eight **omit `detectorCatalogDigest`**, which Wave 3 Task 5 Step 4 specifically sources from the shipped constant `aipolicycontract.DetectorCatalogDigest` (verified present at `detector_catalog_generated.go:13`, `sha256:b252ee02…7553`). Wave 3 names `effectivePolicyDigest`; Wave 3B names `policyDigest`. Two field names for one fact is the defect these waves exist to remove.

**Fix:** one union, one name. Recommend Wave 3B owns the whole version-identity axis (it is that wave's stated purpose) with the union set — 9 required fields plus `policyDigest` on provenance — and Wave 3 Task 5 is deleted with a pointer. See D-2.

### C-4 — Wave 0A and Wave 4A specify **different, incompatible** narrowings of the same regex line.
Both rewrite the target alternation in `internal/toolrisk/toolrisk.go:122`. Verified, that line is one regex containing `~(?:/\S*)?|\$HOME\b` among eight alternatives.

| | Wave 0A Task 3 | Wave 4A Task 7 |
|---|---|---|
| Rule | 3 clauses: home root · purely-expansive tail · **6 named credential stores** | *"`$HOME` followed by a **non-empty path tail** does not satisfy the broad-target requirement"* |
| `rm -rf ~/.ssh` | **stays blocked** (clause 3, A14–A21) | **released** (non-empty tail) |
| `rm -rf ${HOME}` | **new detection** (A4) | not mentioned |
| `rm -rf ~/*` | blocked (clause 2) | released (non-empty tail) |
| Terminator | required (`["'\s;\|&)]\|$`) | not specified |
| Exit | 50/50 rows; 16 removals + 1 addition; C12 `corpus=123 interruptions=0` | benign interruptions `0 of 51` on `command-expansion.json` |

These cannot both be implemented. **Wave 0A is the correct spec** — it is the only one that reasons about the terminator (RE2 has no lookahead), about the three pins that must stay green, about `winBroadTarget` as the precedent, and about the credential-store residual it deliberately keeps. Wave 4A Task 7's rule would silently release `~/.aws/credentials` and `~/.ssh/id_ed25519`.

**Fix:** Wave 4A Task 7 keeps **only** the bank-drain rule — sub-bullets (a) a benign BLOCK/REDACT is never bankable, (b) the WARN/PROMPT entry schema with expiry, (c) the wave exit criterion, (e) the stale `cmd-benign-sudo-restart-nginx` template row — and cites Wave 0A for the regex. Its exit criterion becomes *"the FP baseline file contains zero `"verdict": "block"` entries"* alone; the `0 of 51` number belongs to Wave 0A.

### C-5 — Wave 4A Task 7 cross-references the wrong wave for the shared alternation.
Wave 4A Task 7 says *"Note the tension with Wave 4B Task 6… The two edits touch the same alternation and must be designed together."* It never mentions **Wave 0A**, which is the wave that actually rewrites the alternation and lands first. Wave 4B Task 6 does get it right — it says *"Wave 4A Task 7 narrows the same `\$HOME\b` alternation"* — but after C-4 that pointer must move to Wave 0A too.

Three waves now believe they own one regex. After the C-4 fix the chain is: **Wave 0A rewrites it → Wave 4B Task 6 inverts the `"$HOME"` pin on top of it.** Wave 0A Task 3 Step 5 already states the handoff correctly (*"Do not narrow the pattern to keep the pin green"*), and Wave 3B Task 6 independently states *"that pin is Wave 4B's to flip."* Consistent once 4A is out of the regex.

### C-6 — "Backend before agent" vs "Backend before Frontend" for the DLP widening.
- **Wave −1 Task 3 Step 3:** *"**Backend deploys before any agent release** or the console 400s on the first policy PUT that carries a new class."*
- **Wave 1 "Deploy ordering, stated precisely":** *"**Backend deploys before the Frontend ships the 81-row board**… **No agent release is required by this wave.**"*

Wave 1 is the accurate statement — the 400 comes from `validateActionMap` on a **console** PUT, not from an agent. Wave −1 imports the imprecision straight from source material §8 Step 3. Both agree Backend goes first, so this is not an outage risk, but it puts a false agent-release dependency on the critical path's third step. **Wave 1's wording is authoritative.**

### C-7 — `hookdialect.go:112` does not hold the dialect table.
- **Wave 8 Traps** and the spine: *"`Installers/internal/codexmanaged/hookdialect.go:112` carries two rows, `0.144.` and `0.147.`"*
- **Wave 4C Task 11:** *"`knownHookTrustDialects` (`hookdialect.go:166`) has exactly two rows: `hookTrustDialect144` (`:100-104`) and `hookTrustDialect147` (`:111-115`)."*

Verified: `:112` is `id: "codex-hooktrust-0.147",` — a field inside one row. `:166` is `var knownHookTrustDialects = []hookTrustDialect{hookTrustDialect144, hookTrustDialect147}`. **Wave 4C is right**; Wave 8 and the spine carry a stale/imprecise line. Same fact, two citations.

### C-8 — Wave 4B Task 7 is internally inconsistent about the D4 table.
It says *"**Do not edit the D4 token.** `constants.ts:1207-1211` forbids it explicitly"* — then two bullets later: *"Moving `chmod-broad-777` changes that tally… Backend-before-agent ordering applies: the disposition change is read on the policy path."* Verified `constants.ts:1244` is `'chmod-broad-777': 'monitor'` and the docblock at `:1195-1206` pins the 23/2/12/3 tally.

Either the resolver escalates at decision time and the D4 token stays `monitor` (no tally change, no Backend deploy), or the token moves (tally changes, `tool-risk-d4-tiers.spec.ts` moves, Backend deploys first). **The task must pick one.** The resolver-only reading is the one the constants file's own remedy sentence supports.

### C-9 — Wave 4A's exit criteria are stated in a report shape Wave 4C deletes.
Wave 4A criteria 1–4 read *"EGRESS benign interrupts: 0 of 23"*, *"EGRESS attack recall: 11 of 12"*, *"INGRESS attack recall: 7 of 8"*. Wave 4C Task 3 exit requires `HOLDOUT_REPORT.md` to publish *"exactly 4 numbered denominators — prompt-attack 5, prompt-benign 6, ingress-injection-attack 4, ingress-benign 18 — and **zero** aggregate recall figures"*, with `TestNoCrossSurfaceRecall` making a cross-surface rate a build failure.

4C depends on 4A, so 4A measures first — but after 4C lands, 4A's criteria are unmeasurable by construction and a re-run would go red on a test that is doing its job. **Fix:** restate Wave 4A criteria 1–3 in per-surface terms now (prompt-benign 6 → 0 interrupts; dlp-benign 17 → 0; prompt-attack 5/5 minus named survivors), so they survive 4C.

### C-10 — Wave 3's regenerated-report exit numbers are overwritten by Wave 4A.
Wave 3 Task 2 exit: *"`jailbreak-persona` reads `1/6 (16.7%)`."* Wave 4A Task 2 closes `qa-fp-detections-finding-name`, which is that exact false positive — it becomes `0/6`. Same for `db-connection-string 1/17` (Wave 4A Task 4 drives the FN to 0 but leaves the FP). Wave 3's numbers are a correct *baseline* and must be labelled as the pre-4A snapshot, not as a standing exit value.

### C-11 — Two waves each claim the **first** production consumer of `InspectionDegraded`.
- **Wave 3 Task 6 Step 4:** *"Give `InspectionDegraded` a production consumer… today removing it changes nothing."* Exit: *"`InspectionDegraded` has **at least 1** production consumer."*
- **Wave 4B Task 2:** *"…which has six references repo-wide, all in the defining file and its test, and zero production consumers — give it its first real consumer here."*

Verified both descriptions of today's state. Only one can be first. **Wave 3 owns it** (it is the measurement-substrate wave and Wave 4B depends on Wave 3); Wave 4B's effect resolver becomes the **second** consumer and should say so.

---

## 2. DUPLICATION

| # | Task specified twice (or more) | Waves | Owner |
|---|---|---|---|
| D-1 | Make `--engine-version` mandatory: `main.go:23`, `runner.go:467-468`, `holdout-score.yml:48-52/62-66`. Different test names for the same two assertions (`TestNormalizeOptions_RejectsAnAbsentEngineVersion` vs `TestNormalizeOptionsRejectsAbsentEngineVersion`; `…RejectsThePlaceholderVersion` vs `TestEngineVersionM47IsRejected`). | 3 Task 4, **3B Task 1** | **3B** — version identity is that wave's whole subject. Delete Wave 3 Task 4; Wave 3's exit criterion 4 becomes an inherited reference. |
| D-2 | Widen `EnvironmentDigest`; add ruleset/normalizer/parser/policy digests to `RunnerIdentity` / `ResultProvenance`. | 3 Task 5, **3B Task 2** | **3B**, with the C-3 union field set. |
| D-3 | `holdout-score.yml` header truth + the trigger decision. Three separate owners, two separate defeat tests (`ci/lib/workflow-header-truth.mjs` vs `TestHoldoutWorkflowHeaderMatchesItsTriggers`). | **−1 Task 5**, 3 Task 11, 3B Task 1 | **−1** (critical-path Step 2). Move Wave 3 Task 11's A/B/C option analysis — the best content of the three — into Wave −1 Task 5, and delete the duplicate header tests down to one. |
| D-4 | Narrow `destructive-rm` at `toolrisk.go:122`. | **0A Task 3**, 4A Task 7 | **0A** (see C-4). 4A keeps the bank-drain rule only. |
| D-5 | Declare inspection budgets (max bytes/items/depth/time) for `internal/toolrisk`. | **3 Task 6**, 4B Task 2 | **3** for the package-level budget; 4B declares only the resolver's own argv/nesting/time budget and consumes Wave 3's. |
| D-6 | Regenerate `parity-vectors/toolrisk-classes.v1.json` and re-vendor to Backend + Frontend. Wave 2 bumps to **formatVersion 3** with a `grades` block and `gradesSha256`; Wave 4B adds `proposalKind` with no version named. | 2 Task 6, 4B Task 1 | **2** owns formatVersion 3. 4B either lands `proposalKind` inside the same block (one bump) or explicitly bumps to 4 and updates both consumer parity specs again. Two silent bumps of a three-repo digest-pinned file is a re-vendor outage. |
| D-7 | Extend `LaneOf` (`internal/neutraleval/ingress.go:66-71`) for a `toolrisk` lane. | 3 Task 8 Step 2, 3B Task 9 | **3** owns the code; **3B** owns the mixed-lane refusal test for the new pair (its criterion 12 already reads that way). |
| D-8 | Edit `pr-checks.yml`'s package list / add jobs. | −1 Task 7 (toolrisk+shellast leg + `ci/gates.json` mirror), 4A Task 8 (residuals suite), 4C criterion 11 (`ingressrisk` + `neutraleval`) | **−1** creates the job and the mirror entry; 4A and 4C add packages to the list it created. Otherwise three waves race on one file that has no `pull_request` trigger anyway. |
| D-9 | Modify `internal/policyeval/policyeval.go` `prClassAction` (verified at `:511`). Wave 2 repoints its severity fallback at catalog grades; Wave 4A adds a Tier-C release arm; Wave 4C inserts a provenance branch *above* the floor and says *"Do not touch the four existing branches"* — after 4A there will be five. | 2 Task 10, 4A Task 2, 4C Task 4 | No single owner is right; **write the branch precedence once**, in Wave 2, as a numbered ladder the later waves insert into by position. 4C's "four existing branches" must become "the branches below this one, whatever their count." |
| D-10 | Modify `taintRisky` (`ai_taint.go:159-166`). Wave 2 adds the shadow gate and a structured reason and drops `toolName`; Wave 4B changes the signature again for evidence+policy; Wave 8's trap says *"Do not widen `taintRisky` or weaken it."* | 2 Task 9b/9c, 4B Task 9, 8 trap | **2** owns the signature and attribution (ships). **4B** owns the narrowing (blocked on ratification, ships nothing). **8** must not touch it — its trap is correct and should cite Wave 2 as the wave that already changed the signature, so a Wave 8 engineer does not read the trap as "the function is untouched." |
| D-11 | The forbidden-claims list. Wave −1 Task 2 requires **≥15 rows** in the plan text; Wave 8 Task 11 requires **15 encoded entries** the renderer enforces. | −1 Task 2, 8 Task 11 | Both, deliberately — but say so. **−1 owns the prose checklist, 8 owns the executable renderer**, and the two counts must be asserted equal by Wave 8's test or they will drift. |
| D-12 | Standards mapping (ATLAS `v2026.07` / OWASP LLM:2026 + ASI / AIUC-1 A008·B010.3·B006.3·B006.1) onto the class catalogs. Wave −1 exit: *"every one of the 40 tool-risk classes and all producer DLP classes carries a standards row."* Wave 8 exit: *"121 of 121."* | −1 Task 6, 8 Task 7 | **8** owns the generated mapping and `TestEveryClassCarriesStandardsIds`. Wave −1 owns only the *column declaration* in the manifest schema — its exit as written (all producer DLP classes) is unachievable before Wave 1 widens the governed vocabulary to 81. |
| D-13 | The Suite-1 canonical regression registry. Wave 3B Task 5 creates `parity-vectors/neutral/canonical-regression-index.json` with **11 members**; Wave 4A Task 8 creates `internal/neutraleval/residuals_manifest.json` with **10 entries**. Same seven residuals, same two C5 residuals, same `chmod-broad-777`; 3B adds `tp-zero-width-smuggled-directive [plugin]`. | 3B Task 5, 4A Task 8 | **One file.** Recommend 3B's path and 11-member seed (it includes the Static-Worker fixture and carries the append-only immutability rule); Wave 4A populates `owningTest` into it. Two registries for one immutable suite is how a member goes missing. |

---

## 3. HARD ORDERING CONSTRAINTS

Carried forward from the old plan's `plan:81-102`, plus what the ten files establish. **Every one of these is destructive or wasteful if inverted, not merely inefficient.**

### Still applies from the old plan (lines 81–102)

1. **Backend deploys before any agent release whenever a contract widens.** Standing rule; has taken production down here before. *Still applies* — Wave 2 Task 7 (grade fields on the wire) and Wave 4B Task 8 (new tool-risk classes) are exactly this shape. **Corrected:** the Wave 1 DLP widening is Backend-before-**Frontend**, not before an agent release (C-6).
2. **The signed-queue two-sided trap** (consumers get the allowlist → Backend gets the key id → Intelligence signs → the reject flag last). *Not in these waves; carry the note forward verbatim so nobody starts it.*
3. **Scanner queue redrive policy changes in AWS before the task-def value ships**, or the worker refuses to boot. *Still applies; touches Wave 7A's deploy sequence.*
4. **The PROCESSING heartbeat reaches every deployed worker before the reaper threshold is shortened.** *Still applies; not in these waves.*
5. **The Action execution manifest is produced by deployed runners before the Backend requires it.** *Still applies and is now Wave 7A's four-step deploy sequence — see O-9.*
6. **W3 before W4.** *Still applies, hardened as D18.*
7. **Any endpoint-side default change is gated on fleet uptake, which is unknown.** *Still applies; affects Wave 4B Task 7 and Wave 4C Task 7.*

### The full ordered constraint list for v2

| # | Constraint | What breaks if inverted |
|---|---|---|
| **O-1** | **Wave −1 Task 1 (fetch + manifest) before every other task in the packet.** | Every `path:line` in 8,510 lines is a claim about `origin/main`. The working trees are 20–1,010 commits behind; `sed -n '122p' internal/toolrisk/toolrisk.go` returns a different line in the working tree than at `origin/main`. Implementing from a working tree edits the wrong file. |
| **O-2** | **Wave 0A ships before anything else that touches the endpoint.** | It is the only item in the packet with live customer impact: `rm -rf $HOME/.cache/pip` is hard-blocked fleet-wide and the malicious floor (deployed td 322) means no admin can relax it. It needs **an agent release and no Backend deploy** — `ClassCatalog()` (`class_catalog.go:57`) reads `rl.class`/`rl.severity` and never `rl.re`, so a regex edit cannot move the 40-class vector, the D4 table, or floor membership. |
| **O-3** | **Wave 0A before Wave 4B Task 6.** | 4B inverts `TestScan_EnvironmentVariableTargetStillEvades` on the alternation 0A rewrites. Inverting first means 0A rewrites around a pin that has already moved; both waves' benign tables then disagree about `rm -rf "$HOME"`. |
| **O-4** | **Backend deploys before the Frontend 81-row board (Wave 1).** | `assertClosedActionMap` throws and `validateActionMap` 400s on any `dlp.actions` key outside the tuple. Ship the console first and every policy PUT 400s. |
| **O-5** | **Wave 1 Task 3 Step 4 (widen the Recommended preset to all 81 keys) lands in the same commit as the tuple widening.** | `sanitizeStoredConfig` (`service.ts:5399`) merges the stored document over `cloneRecommendedAiSecurityPolicy()`. If the tuple widens and the preset does not, `assertClosedActionMap` throws `non-rankable token undefined at dlp.actions.<class>` on the **read** path **for every tenant, fleet-wide**. This is the single highest-blast-radius ordering constraint in the packet. |
| **O-6** | **Wave 2 Task 2 (five-band Backend: DTO, contract, CHECK constraint, rank SQL, counts) deploys before Wave 2 Task 4 (the console).** | `?severity=info` 400s the **whole** request against a four-member `@IsIn`; an info-banded INSERT violates `CHK_ai_events_severity`. Verified: `AI_EVENT_SEVERITIES` is four members today. |
| **O-7** | **Wave 2 Task 7 steps 1–4 (Backend DTO + both controller mappers) deploy before steps 5–8 (the agent).** | `AgentIngestValidationPipe` **drops** an undeclared key rather than 400ing it. Shipping the agent first loses `evidenceStrength`/`enforcementEligible` silently — no error, no data, and the fold looks like it works. |
| **O-8** | **Wave 3 before any promotion decision anywhere (D18).** | 43 of 55 classes report `fnRate: 0` on zero attack cases; every class shares one corpus-wide FP denominator (`holdout.go:357-359`, verified); every artifact is stamped `"m4.7"`. A promotion cited off the unrepaired instrument is a number that looks like evidence. **This gates Waves 4A, 4B, 4C and 7B.** |
| **O-9** | **Wave 7A deploy sequence, exactly: action release tag → Backend (Task 8) → worker Task 6 → worker Task 7.** | Task 7 makes a submission carrying no manifest complete as `COVERAGE_FAILED`. Deployed before the runners emit `metadata.runtime`, **every scan fails closed on deploy.** Task 7 before Task 8 leaves a COVERAGE_FAILED run with a null verdict *and* a null reason. |
| **O-10** | **`deriveCombos` is deleted before Wave 4B ships, not after (D11 reversed).** | Under D4, `content-pipe-shell` and `content-spawn-shell` are both `monitor` (verified `constants.ts:1245-1246`). The combo would manufacture the only interruption the developer sees, out of two signals the product deliberately decided not to show them. |
| **O-11** | **Wave 4B Task 8 adds a class to `AI_TOOL_RISK_D4_TIERS` in the same edit as the severity tuple.** | `resolveToolRiskDefaults` (`constants.ts:1409-1417`, verified) **throws at module load** on a registered class with no tier — in every environment including the first importing test. Backend does not boot. The old plan's Task 6 Step 3 adds six classes and never touches D4. |
| **O-12** | **Wave 3 (per-class denominators) before Wave 3B Task 3 (emit the spine's evaluation report).** | 3B's `byClassRepresentationSurface[]` rows are populated from Wave 3's per-class exposure counters. Emitting first publishes the corpus-wide denominator into a schema-validated artifact. |
| **O-13** | **Wave 3B Task 4 (the suite registry) before any of 4A/4B/4C/7B declares an exit number.** | Stated by 3B's own dependency line and it is right: without `claimSupported` derived from `independentClusters`, every wave writes its own bound. |
| **O-14** | **Wave 2 before Wave 4's enforcement changes.** | The severity spine decides what may block at all; Wave 4B's proposals are typed against `evidenceStrength` / `baseCapabilityImpact` / `resolvedConsequence`. |
| **O-15** | **Wave 4A before Wave 4C.** | 4C's promotion gate reads a prompt-lane report whose `injection-system-exfil` row 4A Task 3 fixes. Gating first means gating on a class at 0% recall, which is the state the gate exists to refuse. |
| **O-16** | **Wave 4B Task 2 (the effect resolver) before Wave 8 Task 2 (the widened binding).** | The binding's `normalizedEffect` segment **is** the resolver's output. Without it the preimage still hashes raw `ToolInput` and a respelled command is a different grant. |
| **O-17** | **Wave 8 Task 5 (canary honesty) before Wave 8 Task 9 (live canary evidence).** | `aicanary/exec.go:125` sets `WaitDelay = 5 * time.Second` (verified) and a real deny is reported as `canary-host-launch-failed` in 2 of 6 recorded runs. A canary that reports enforcement successes as errors cannot be the evidence lane. |
| **O-18** | **Wave 8 Task 1 (sink inventory) before Task 3 (mediation) before Task 12 (defeat matrix).** | The matrix's `TestDirectAlternatePathToTheSameSinkFails` needs the inventory to know what "the same sink" is. |
| **O-19** | **Deploying needs a fresh explicit owner ask, every time.** Merging is not deploying; a green local run is not permission; deploy gates are fail-closed on MISSING runs, so `pr-checks` and `security` are dispatched on `main` **first**. | Recorded in the spine and in Wave 0A Task 5 Step 5. |

---

## 4. STALE FACTS — verification sample

I resolved **50 claims** against `origin/main` across all ten files, weighted toward the ones that drive a task. **46 confirmed exactly, 4 misses.**

### Confirmed (sample, one line each)

| Claim | Wave | Result |
|---|---|---|
| `toolrisk.go:121-122` destructive-rm rule, `~(?:/\S*)?\|\$HOME\b` in the alternation | 0A, 4A, 4B | ✅ exact |
| `toolrisk.go:50-62` `Finding` = Class/RuleID/Severity/Start/End/NormalizedOnly, **no confidence field** | 2 | ✅ exact |
| `internal/dlp/dlp.go` is **1510** lines; `Redact` at `:1479`, `if len(findings)==0` at `:1480` | −1, 3 | ✅ exact |
| `scanall.go:78` `ScanAll`, `:101` `ScanAllAtRest` | −1, 3 | ✅ exact |
| `registry.go:133` `classRegistry` = **33**; `:201` `classIndex`; `:221` `RegisteredClasses` | −1, 1, 2 | ✅ exact |
| `codesecurity_rules.go:70` `codeSecurityParityClasses` = **48** → union **81** | −1, 1, 2 | ✅ exact |
| `AI_DLP_CLASSES` in the generated portable file = **30** entries | −1, 1 | ✅ exact |
| `AI_SECURITY_PORTABLE_SOURCE_COMMIT = d366f5f8…` resolves in **none** of four checkouts | −1, 1 | ✅ exact |
| `holdout-score.yml` 89 lines; `on:` at `:22-25` dispatch+cron; header `:6` still says "PUSH TO MAIN"; `:13` "does NOT gate" | −1, 3, 3B, 4A, 4C | ✅ exact |
| `pr-checks.yml` **801** lines; `on:` at `:81-87` dispatch + `cron '41 7 * * 1'`; **`grep -c toolrisk` = 0**; `:145-146` is the policyeval/dlp/promptrisk leg | −1, 3, 4C | ✅ exact |
| `vendored-upstream-drift.yml` 73 lines; `on:` at `:39-43`, no `pull_request`; the T-M2 instruction at `:30-31` | −1, 4C | ✅ exact |
| `holdout.go:112` `FPRate float64`, `:116` `FNRate float64`, `:357-359` corpus-wide overwrite, `:381-383` `if a.expecting > 0` | 3, 3B | ✅ exact |
| `main.go:23` default `"m4.7"`; `runner.go:467-468` refill | 3, 3B | ✅ exact |
| `scan_depth_guard_test.go:140` `t.Fatalf("these surfaces reach internal/dlp through a PARTIAL detector set…")` | −1, 3 | ✅ exact |
| `ai-malicious-floor.ts:155` `destructive('destructive-rm')`; `:285` `withMaliciousFloorApplied`; `:184-187` the four combo floor members | 0A, 1, 4A, 4C | ✅ exact |
| `ai-security-policy.service.ts:2198` floor call; `:725-727` the ABSENT-key rule; `:5399` `sanitizeStoredConfig` | 0A, 1, 2, 3B | ✅ exact |
| `constants.ts:93` alias; `:1216` D4 record; `:1244` `chmod-broad-777: monitor`; `:1245-1247`/`:1254` the four monitor classes; `:1409-1417` module-load throw; `:1195-1206` 23/2/12/3 docblock; file is 2,024 lines | 1, 2, 4B | ✅ exact |
| `resolve-strictest-policy.ts:412` `nonRankableToken`, `:426` `assertClosedActionMap` | 1 | ✅ exact |
| `ai-policy-presets.ts:258-264` `dlpActionsByConfidence` with the `as` cast at `:259` | 1, 2 | ✅ exact |
| `ai-class-metadata.ts:30` "purely descriptive"; `:89` `confidenceForMechanism` | 2 | ✅ exact |
| `ai-event-severity.util.ts:48` `FORMULA_VERSION = 4`; `:301` `BASE_BY_CLASS`; `:648-657` the basis object with `class`/`base` | 2 | ✅ exact |
| `ai-governance-contract.ts:165` four-member `AI_EVENT_SEVERITIES`; `:169-176` the rival basis type with `findingClass`/`baseSeverity`; `:183-190` four triage values | 2, 3B | ✅ exact |
| `ai-agent.controller.ts` `count: f.count` at **380** and **878** — two mappers | 2 | ✅ exact |
| `alerts.service.ts:862` `aiAlertScopeSql` | 2, 4B | ✅ exact |
| `activity-kind.util.ts:385` `dataClasses.length > 0 → true` inside `isDetectionEvent` (`:380`) | 2 | ✅ exact |
| `ai_taint.go:159-166` `taintRisky`, severity-only, `toolName` unread | 2, 4B, 8 | ✅ exact |
| `ai_handlers.go:2701` raw scan, `:2922` `toBackendToolFindings(findings)`, `:3054-3055` overlay, `:3063` `resolveToolHoldApproval` | 2, 4B, 8 | ✅ exact |
| `policyeval.go:405` + `:514` = the only two `IsShadowClass` production call sites; `prClassAction` at `:511` | 2 | ✅ exact |
| `aicanary/exec.go:125` `WaitDelay = 5s`; `aihooks/settings.go:111` `= 60`; `airuntime/runner.go:52` `HookDecisionBudget = 4s` | 8 | ✅ exact |
| `effect_truth.go:19` `FINAL_STATE_GRADER`, `:49` `UNAUTHORIZED_EFFECT` | 4C | ✅ exact |
| `promptrisk.go` 1,043 lines / **38** regexes; `:207` override rule; `:212-213` system-exfil; `:301-303` `jailbreak-persona` bare `\bjailbreak\b` at Tier C; `:832` `deriveCombos`; 14 classes | 4A, 4C | ✅ exact |
| `proxy/ai_ingress.go:473` `RedactIngressText`, `:485` `ScanVerbatim`, `:493` `dlp.ScanAll(text).Findings` | 4A, 4C | ✅ exact |
| `dlp/financial.go:86-88` the Tier-B `payment-card-no-corroborating-context` arm | 4A | ✅ exact |
| `detector_catalog_generated.go` **55** `ClassID:`; `:13` digest `b252ee02…`; spine digest `4abd98c3…e245`, 110,117 bytes | 3, 3B | ✅ exact |
| `neutral-corpus.holdout.jsonl` **39** lines; `ingress.jsonl` **28**; `command-expansion.json` benign **51** / attack **10** | 3, 3B, 4A, 4B | ✅ exact |
| `zz_c5_adversarial_probe_test.go:201-256` contains **0** `t.Errorf` | 3B, 4B | ✅ exact |
| `liveproof/register.json` **8** proofs, **3** observed | 8 | ✅ exact |
| `ai-preset-distribution.spec.ts` dlp 30 / promptRisk 18 / ingress 20 / toolRisk 40 = **108**, "the ONLY literal 108" | 4C | ✅ exact |
| `constants.ts:1804` `applyCalmMonitorBaseline`, loop at `:1821-1827`, `injection-obfuscation-unicode` → warn | 4C | ✅ exact |
| `detections-absent-facets.spec.ts:196-208` pins the four triage values with the anti-fifth-value comment | 3B | ✅ exact |
| Scanner `main.ts:433` fork branch, `:455` bare `process.exit(0)`, `:464` local-verdict exit; `upload-results.ts:209` `&& body.verdict` | 7A | ✅ exact |
| Backend `results.controller.ts:360` nulls verdict on COVERAGE_FAILED; `scan-dispatch.service.ts:4247` `MINIMAL` default | 7A, 0 | ✅ exact |
| Scanner default branch is `main`; all three quality workflows push on `[master]` at `:23`/`:20`/`:53`; `baselineFpCount: -1`; quality-corpus **22**; ai-corpus **31** | 7B | ✅ exact |
| `server.go` routes at `:582`,`:615`,`:629`,`:636`,`:649`,`:650`,`:655`,`:661`,`:664`,`:665`,`:675` — all 11 match Wave 8's sink table | 0A, 8 | ✅ exact |
| `ai_tool_hold_approval.go:145` `toolHoldBinding`, `:261` `resolveToolHoldApproval`, `:334` `consumeToolHoldGrant` | 8 | ✅ exact |
| `policy-integrity.types.ts:20` phases, `:27` `= 10000`; `ai-policy-rollback.service.ts:11` `FALSE_POSITIVE_STORM` | 8 | ✅ exact |
| `ai-risk-groups.ts:604` renders `Data-loss detectors (${AI_SECURITY_DLP_CLASSES.length})` | 1 | ✅ exact |
| `aicontext/respond.go:175` `ActionFor`, `:179` `DefaultClassAction`, `:189` `automaticDefaultCeiling = ActionWarn`, `:194` `capAutomaticDefault` | 1 | ✅ exact |
| `parity-vectors/dlp-classes.v1.json` **ABSENT**; `dlp-findings.json` present; both toolrisk consumer copies present | 1 | ✅ exact |
| `ci/lib/vocab-parity.mjs` **24,024 bytes** | −1, 1, 4B | ✅ exact |

### Misses

**M-1 — `hookdialect.go:112` (Wave 8 traps; also the spine).** Line 112 is `id: "codex-hooktrust-0.147",`, a field inside one dialect row. The two-row table `knownHookTrustDialects` is at **`:166`**. Wave 4C Task 11 cites it correctly. Fix Wave 8's trap to `:166`, or to `:100-104` / `:111-115` for the rows.

**M-2 — Wave 0A Task 4's "109 cases" could not be reproduced.** Verified `internal/daemon/zz_c12_ordinary_work_probe_test.go` exists with `TestC12_OrdinaryWork_ZeroInterruptions` (`:305`), `TestC12_DangerProbesStillCaught` (`:337`), `d4Policy()` (`:41`), `ordinaryWork()` (`:94`), `dangerProbes()` (`:263`, **10 entries** ✅ matching `probes=10`). A syntactic count of `ordinaryWork()` entries returns **103** (69 struct literals + 34 `bashCall`), not 109. The wave's derived exit number `corpus=123` is `109 + 14`. **Replace the hand count with the discovery command** — the test prints its own denominator:
```bash
cd Installers && go test ./internal/daemon/ -run TestC12_OrdinaryWork -count=1 -v 2>&1 | grep C12TOTAL
```
and set the exit criterion to `<printed> + 14`, not to a literal.

**M-3 — Wave 3 Tasks 2 and 8 require a change to a file this workspace cannot regenerate, and do not say so.** Wave 3 Task 2 Step 2 adds `ProducerSurfaces []string` to `AiSecurityDetectorClass` "**via its generator** (`detectorcataloggen`)", and Task 8 Step 3 says "Extend the spine and regenerate." Verified: the generator exists (`internal/aipolicycontract/tooling/cmd/detectorcataloggen/main.go`) but its header reads `Source: embedded/0.7.0/contract-spine.v3.jcs.json (@ 1bc26573…)` — and **Wave 3B Task 3's trap establishes that the spine is generated upstream in `@ceragon/shared-contracts` 0.7.0 and is not editable here**: a field addition is a shared-contracts change plus a regeneration plus three re-vendorings plus two pin updates. Wave 3 names no such blocker on either task. Add 3B's trap by reference to Wave 3 Task 2 Step 2 and Task 8 Step 3, and mark those steps' certificate contribution accordingly.

**M-4 — Wave −1 Task 4's "51 bare-basename references" and "15 occurrences" of the dead scratchpad path are not independently reproducible from the wave text.** The three examples it gives (`plan:15290` → `main.ts:429`, `plan:7460` → `constants.ts:150-165`, `plan:4621` → `server.go:365`) are the right shape, but the counts drive exit criterion 5 (`0` unresolvable / `0` past-EOF / `0` unqualified "out of a count it prints itself"). That phrasing is already correct — the resolver prints its own total. **Delete the literal 51 and 15 from the task body** so the plan does not carry two numbers for one measurement, exactly as its own criterion 6 demands of everyone else.

**Not checked, and flagged by the waves themselves as UNKNOWN:** every live AWS claim in Wave 0 (task-definition revisions, `desiredCount`, environment lengths, the 19 inline IAM policies) — the wave states plainly that no AWS call was made and that "whatever prints when you run it is the truth." Same for Wave 7B Task 7's deployed `CODEFENCE_SIGNED_CONTRACTS_REQUIRED` and Wave 8 Task 1's desktop-egress and post-`5b129523` MCP sinks, which the wave routes to a discovery command rather than a citation. That is the correct handling and I am not counting them as misses.

---

## 5. GAPS against the critical path (source material §8, steps 1–12)

| Step | Covered by | State |
|---|---|---|
| 1 — Stop hard-blocking ordinary work | **Wave 0A** (and duplicated in 4A Task 7) | ✅ covered |
| 2 — Restore the two instruments | **Wave −1 Task 5** (duplicated in 3 Task 11, 3B Task 1) | ✅ covered |
| 3 — Close the 51 ungoverned DLP classes | **Wave 1** | ✅ covered |
| 4 — Fix the measurement instruments | **Wave 3** + **3B** | ✅ covered |
| 5 — Close the seven published residuals | **Wave 4A** | ✅ covered |
| 6 — Build the benign replay corpus | **Wave 3B Task 7** | ✅ covered, correctly marked blocked |
| 7 — Effect resolver and named correlations | **Wave 4B** | ✅ covered |
| 8 — Prompt/ingress architecture, then adaptive evaluation | **Wave 4C** | ✅ covered |
| 9 — Authoritative effect boundary | **Wave 8** Tasks 1–3, 10 | ✅ covered |
| 10 — Scanner detection certification | **Wave 7B** | ✅ covered |
| 11 — Live canary, independent reproduction, certificate | **Wave 8** Tasks 6, 9 | ✅ covered |
| 12 — Publish a DeVoid system card | **Wave 8** Task 11 | ✅ covered |

**All twelve critical-path steps have an owning task.** The gaps are elsewhere.

### G-1 — Wave 5 (console truth) does not exist. **Six waves defer work to it.**
- Wave −1 Task 6: *"ASI09… requires a confirmation dialog to display the raw action, not an agent-authored summary — a control this product ships and does not test. **Add that test in Wave 5.**"*
- Wave 1's "what this wave deliberately does not do": the lane-tally under-count — `detectorCount` (`category-bucket-board.tsx:2164-2168`) sums over `byDisposition` (`:1758-1766`), which buckets by **category** disposition under strictest-wins, so a board where every category folds to Block answers *"is anything set to warn?"* with **0 categories · 0 detectors** while members warn. *"That is console truth and belongs to **Wave 5**."*
- Wave 4C Task 9: the `pull_request` trigger on `vendored-upstream-drift.yml` is *"**Wave 5's task**"* — which directly conflicts with **Wave −1 Task 5**, where it is specified and made an exit criterion (criterion 7). With no Wave 5, Wave −1 must own it, and 4C's pointer is wrong.
- **Wave 8's dependency line names Wave 5 explicitly**: *"Wave 5 (the console surface the certificate projects onto)."*
- Source material §4 Wave 5 also requires: the UI distinguishing detection match / private monitor telemetry / customer-visible detection / policy decision / enforcement result / security outcome / coverage-unknown / certificate boundary + freshness + exclusions + downgrade reason; and the defeat test *"set one manifest field to `null`; the console must render 'NOT MEASURED,' not `0`."* **None of that appears in any file.**
- Wave 2 Task 8 and Wave 1 Task 5/7 each attach a render-harness screenshot as an exit artifact, so C15's harness is used — but no wave owns the manifest-field-to-rendered-number mapping that Wave 8's certificate projects onto.

### G-2 — Wave 6 (triage, adjudication, incident learning) does not exist. **Wave 8 cannot pass without it.**
- **Wave 8's dependency line:** *"Wave 6 (adjudicated triage feeding `downgradeTriggers`)."*
- **Wave 8 Task 8** requires *"Wave 6's adjudication record, not a single reviewer's label"* for `TestConfirmedBenignBlockHaltsTheRing`, and Wave 8 exit criterion 10's drill is unrunnable without it.
- **Wave 3B Task 12** defines the 4 → 7 triage vocabulary mapping and states explicitly: *"This wave defines it; **Wave 6 performs the widening and the row migration.**"* The migration touches live tenant rows and `MEASURED_FP_VERDICTS` (`service.ts:720`) — splitting `benign_expected` without touching that constant silently drops both halves out of every measured FP denominator.
- Source material §4 Wave 6 also requires, and no file covers: detector/class/version/policy attribution so `fpRate` is attributable to a **version**; reviewer-agreement measurement; a provenance-carrying promotion path from a triaged production event into the protected corpus; appeal/suppression/exception-expiry with label-poisoning controls; the rule that *no threshold is ever updated online from untrusted user feedback*; and wiring `FALSE_POSITIVE_STORM` to a change-point monitor. **Wave 8 Task 8 picks up only the `FALSE_POSITIVE_STORM` half.**

### G-3 — The autonomous FP-review agent in Ceragon-Intelligence is inventoried nowhere.
Source material §4 Wave 6: *"**Inventory the autonomous FP-review agent that landed in Ceragon-Intelligence** (`30d6c6d8..486d937b`, 73 of 80 files under `deploy/home`: intake, window, triage, run control, judge boundary, campaign state machine, verdict re-derivation after a fix). It lands squarely in this wave's territory and did not exist when the plan was written."* **Zero mentions across 8,510 lines.** A second, undocumented triage pipeline running against production while Wave 6 designs a first one is exactly the two-vocabularies defect W11 names.

### G-4 — C11 and C12 are never re-verified.
Source material §2 lists both as *"closed as fact, unguarded"* with *"UNKNOWN whether a regression test accompanies it — not verified this pass"* (C11, `os-target-classifier.ts` Go-module Windows routing) and *"Not verified this pass"* (C12, `Sandbox-Worker/.../platform-mismatch.ts`). Wave 8 Task 11's claimable list includes *"a Linux sandbox run does not vouch for a non-Linux payload"* **with no named test** — every other entry on that list names one. No wave owns confirming either guard exists.

### G-5 — P0-18 (sandbox containment) has no engineering task anywhere.
Wave 8's traceability table records it as *"recorded as an R3 `prerequisite`; the containment change itself is not in this wave."* No other wave picks it up. The defect — `strace`/`direct` modes execute the untrusted package **before** the inconclusive verdict is written — stays open with no owner, and R3 has no wave of its own at all.

### G-6 — `check:ai-security-consumer` runs in no workflow, and no task fixes it.
Wave 1 Task 6 flags it in passing as *"a second gap for Wave −1"*: the script that verifies the generated portable projection against its pin is wired into `npm run build:shared-contracts` only, and **no workflow runs either** (`npm run build` is `nest build`). Wave −1 never picks it up. Given C-1, this is the only guard standing between the pinned artifact and a hand edit.

---

## 6. THE HONEST SUMMARY

This plan, executed end to end, will make DeVoid's AI security engine **honestly measurable and governable — and it will not make any of the five risk lanes certifiable.** It closes one live customer harm on day one (a benign `rm -rf $HOME/.cache/pip` is hard-blocked fleet-wide today with no admin override, and Wave 0A is a regex narrowing plus an agent release); it gives an administrator a control for all 81 DLP classes the endpoint can emit instead of 30; it repairs three defects that invalidate every detector-quality number this product has ever published (one shared false-positive denominator, 43 of 55 classes reporting perfect recall on zero evidence, and every artifact stamped with the frozen string `"m4.7"`); it deletes an amplifier that would have manufactured the only interruption a developer sees; it stops a scanner reporting "zero engines ran" and "zero findings" as the same green; and it produces, for the first time, an expiring machine-readable certificate whose missing measurements read UNKNOWN instead of zero. What it will not produce is a number a customer can buy on. Measured today, the best zero-error false-positive claim anywhere in this workspace is **≤5.70%** on 51 benign commands — and that corpus is not zero-error; the Tier-A hard-block tier needs **29,956** zero-error benign opportunities, a **590× gap**. Every enforcing lane is worse than 5% and the two that gate today are worse than 12%.

**Six of the blockers are not engineering, and no amount of work inside this plan moves them.** (1) The benign-replay corpus is a **consented local-replay data-collection programme** — 2–4 months, owner decision M0 still outstanding, and it cannot be synthesised because near-duplicate mutations inflate the published bound and nothing else. (2) The adaptive prompt-injection arm needs **contracted red-team time**, multiple attacker models plus human expert attempts; a static corpus is regression evidence and must be labelled as such. (3) **F16 endpoint signing-key custody** needs a privileged broker or a KMS/HSM/TPM key owner — procurement plus a key ceremony — and R1, R3 and R4 cannot certify without it. (4) **Branch protection is impossible on the current GitHub plan** — all six repos return 403 — and the roadmap makes M5.3-A mandatory for any 9+ R2 profile; that is a billing decision, and it also makes the scanner auto-deploy workflow's stated safety premise false today. (5) A **named independent evaluation owner who is not a detector author** must hold the sealed corpus; whether such a person exists is UNKNOWN, and only role slugs exist in the repos. (6) Whether detector quality **gates on merge at all** is an owner spend decision — `pr-checks.yml` and `holdout-score.yml` both lost their push triggers as a cost gate, so `./internal/toolrisk/...` currently runs in no CI job and in no mirrored leg, and several waves' "CI is green" would be measuring nothing until Wave −1 Task 7 lands. Two smaller external items sit alongside: the Codex surface cannot be measured safeguards-on on the owner's own machine until a `0.149.x` vendor binary can be observed (widening the dialect pin is forbidden), and the live canary needs prod capacity that has been at 0/0 since 2026-06-26.

**Before execution starts, the editor's required fixes are:** resolve C-1 (Wave −1's `AI_DLP_CLASSES` exit criterion is unachievable and Wave 1 is right); resolve C-4 (Wave 0A and Wave 4A specify incompatible narrowings of one regex, and 4A's would release `~/.ssh`); reconcile C-2/C-3 and collapse D-1/D-2 so one wave owns version identity; collapse D-13 so the immutable regression suite has one registry; and **write Wave 5 and Wave 6** — six waves defer to them by name, Wave 8 lists both as dependencies, and Wave 8's ring-halt drill and `downgradeTriggers` are unbuildable without Wave 6's adjudication record.