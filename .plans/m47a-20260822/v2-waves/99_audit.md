# M4.7A v2 — Final Audit After the Reconciliation Pass

**Audited 2026-08-28.** All 11 plan files re-read (12,423 lines). All seven repos fetched. SHAs confirmed against the manifest except one (below). ~35 citations re-resolved against `origin/main`.

**Verdict: NOT READY TO IMPLEMENT.** Four release blockers survive, plus one orphaned wave and a spine that was never edited.

---

## 0. The thing that jumps out first

`00_spine.md` has mtime **00:48**. The reconciliation is **01:26**. Every wave file is **01:57–02:08**.

**The spine was not edited in this pass at all.** Consequences, all verified:

| Spine defect | Evidence |
|---|---|
| Rebase manifest is stale | `Ceragon-Intelligence` pinned `486d937b`; `git rev-parse origin/main` → **`deb70e64`**, 5 commits / 36 files / **+12,372 insertions** ahead, 31 of them under `fp-agent/` — the exact code G-3 is about |
| Ordering list is the pre-reconciliation 7-item version | O-1…O-19 appear nowhere in it |
| Carries the C-6 wording the waves overturned | `00_spine.md:206-208`: *"**Backend deploys before any agent release** … The 51-class DLP widening (Wave 1) is exactly this shape"* — while `w1_policy_authority.md:49-52` says *"the constraint is **Backend-before-Frontend**, not Backend-before-an-agent-release … **this file's wording is authoritative**"* and Wave 6 criterion 13 repeats the correction |
| Does not know Waves 5, 6 or 7C exist | `grep -n "Wave 5\|Wave 6\|Wave 7" 00_spine.md` → **0 hits** |

Wave −1 detected the SHA drift itself (`w-minus-1_w0.md:39-45`) and handled it correctly. The spine did not.

---

## 1. CONTRADICTIONS (C-1…C-11)

**Ten of eleven are settled. One is settled in the waves and still live in the spine.**

| # | State | The line that settles it |
|---|---|---|
| C-1 | ✅ | `w-minus-1_w0.md:316-318` — *"**This wave asserts no DLP class count.** The criterion that used to live here … is **Wave 1 exit criterion 1**"*; matched by `w1:797-801` |
| C-2 | ✅ | `w3:553` — *"Step 3 — bump `holdoutReportFormatVersion`. **THIS WAVE OWNS THE BUMP TO 3.** … **This change is not additive**"*; `w3b:300-306` — *"**Format version: ride 3, do not bump again.**"* Verified: `holdout.go:44` = `const holdoutReportFormatVersion = 2`, `:42-43` = the additive-convention comment |
| C-3 | ✅ | `w3b:391-396` — 9 required `RunnerIdentity` fields incl. `detectorCatalogDigest`, `ResultProvenance` carries `policyDigest`, *"Occurrences of `effectivePolicyDigest` anywhere in the tree: **0**"*; `w3:606-626` is a headstone carrying both of Wave 3's contributions forward |
| C-4 | ✅ | `w4a:165` — *"**The `destructive-rm` regex narrowing is not in this wave. Owned by Wave 0A Task 3.**"* and `:167` reproduces the three-clause rule incl. the six credential stores |
| C-5 | ✅ | `w-minus-1_w0.md:729-735`, `w4a:171`, `w4b:426`, `w3b:~` all state the identical chain: **0A rewrites `toolrisk.go:122` → 4B Task 6 inverts the pin on top.** Verified `toolrisk.go:122` still carries `~(?:/\S*)?\|\$HOME\b` |
| **C-6** | ⚠️ **half-open** | Settled between waves (`w1:49-52`, `w-minus-1_w0.md:287-292`, `w6` crit 13). **`00_spine.md:206-208` still carries the wrong form and was never touched.** A reader who starts at the spine — which is what the spine is for — gets the superseded rule |
| C-7 | ✅ | `w8:980-982` — *"`knownHookTrustDialects` (`…hookdialect.go:166`) carries two rows … **Do not cite `:112`**; that is a field inside one row"*; `w3b` repeats it. Verified at origin/main: `:112` = `id: "codex-hooktrust-0.147",`, `:166` = the table. *(The reconciliation's claim that the spine also carried `:112` was itself wrong — the spine never mentioned it.)* |
| C-8 | ✅ | `w4b:442` — *"**The task picks ONE reading, and it is the resolver-only one (C-8). Decided: the resolver escalates at decision time and the D4 token stays `monitor`.**"* Verified `constants.ts:1244` = `'chmod-broad-777': 'monitor'` |
| C-9 | ✅ | `w4a:230-238` — criteria restated per surface (dlp-benign 0/17, prompt-benign 0/6, prompt-attack 5/5, dlp-attack 6/7), explicitly *"never their sum"* |
| C-10 | ✅ | `w3:527` — *"**The numerators are a PRE-WAVE-4A BASELINE SNAPSHOT, not a standing exit value.**"*; reciprocated by `w4a:87` and `w4a:122` (*"Note for Wave 3"*) |
| C-11 | ✅ | `w3:645-648` — *"This task also owns the **first** production consumer of `InspectionDegraded` — Wave 4B Task 2's effect resolver is the **second**"*; `w4b:341` — *"**Wave 3 Task 6 Step 4 gives it its FIRST production consumer; this resolver is the SECOND** (C-11)"*; `w0 Task 8 Step 3` agrees |

---

## 2. DUPLICATIONS (D-1…D-13)

**Twelve have exactly one owner. One does not.**

Greps run across all files; every loser carries a live pointer.

- **D-1** ✅ `w3` Task 4 is a headstone → 3B Task 1. `w3:594-598` even bans re-creating the retired test names.
- **D-2** ✅ `w3` Task 5 headstone → 3B Task 2, carrying forward the two axes 3B's draft omitted.
- **D-3** ✅ `w3` Task 11 headstone → −1 Task 5; 3B Task 1's last bullet defers the header truth; A/B/C analysis physically moved into `w-minus-1_w0.md:383-392`.
- **D-4** ✅ 0A Task 3 sole spec.
- **D-5** ✅ `w3:645-648` package budget / `w4b:342` resolver budget only, *"does not redeclare them"*.
- **D-6** ❌ **SEE BLOCKER 2.**
- **D-7** ✅ `w3:796-799` — *"Land the constant here; land the proof there"*; 3B criterion 12 owns the refusal test.
- **D-8** ⚠️ substantively resolved (−1 Task 7 creates the job; 4A Task 8 and 4C criterion 11 append) but **two mis-pointers survive** — see §4.6.
- **D-9** ✅ `w2:375-441` is the single 7-rung ladder; 4A Task 2 (`w4a:77`) and 4C Task 4 both insert *by rung number* and refuse to restate the count. `grep -n "existing branches\|fifth branch\|four existing" w*.md` returns exactly the 3 lines Wave 2 criterion 16 predicts, all prohibitions, **0 instructions**.
- **D-10** ✅ `w2:931-951` and `w4b:498-506` carry the identical three-row table; `w8:163-164` — *"**do not read this trap as 'the function is untouched.'** By the time this wave runs, **Wave 2 Task 9b/9c has already changed it**"*.
- **D-11** ✅ `w-minus-1_w0.md:225-230` (prose, 15 rows) ↔ `w8:875-880` (renderer, 15 encoded), with the equality asserted by Wave 8's test, failure text `renderer encodes 15 forbidden claims; the plan checklist carries 16`.
- **D-12** ✅ `w-minus-1_w0.md:435-438` declares columns only; `w8:647` owns `121 of 121`.
- **D-13** ✅ `w4a:193-200` — *"**There is one registry and this wave does not create it. Owned by Wave 3B Task 5** … The `internal/neutraleval/residuals_manifest.json` this task used to create is **deleted**"*; 3B Task 5 seeds 11 members.

---

## 3. THE FOUR GAPS

| Gap | Owner | State |
|---|---|---|
| **G-3** FP-review agent inventory | **Wave 6 Task 13** (`w5_w6:1683`) | ✅ Owned, and it is the best-measured task in the packet: it corrects the source material (20 commits / **45** files, not "73 of 80"), and it independently caught the manifest drift to `deb70e64`. Verified: `store.js` = 484 lines, `BUCKETS` `:50`, `STATUSES` `:79`, `30d6c6d8..486d937b` = 20 commits / 45 files |
| **G-4** C11/C12 verification | **Wave 7C Task 1** (`w7:1421`) **and** Wave 8 Task 11 entry 7 | ✅ Owned twice, compatibly (7C confirms + pins, W8 cites). Verified: `os-target-classifier.ts:341-399` is section 6b, tests at `:102-157`, `platform-mismatch.ts` = **213** lines, 5 routing + 20 unit cases = 25 |
| **G-5** P0-18 sandbox containment | **Wave 7C Task 2** (`w7:1481`) | ⚠️ Owned — **but Wave 8 still says it is not.** See Blocker 4 |
| **G-6** `check:ai-security-consumer` | Contested | ❌ **See Blocker 1** |

**G-1 and G-2 are closed properly.** `w5_w6_console_triage.md` (1,837 lines) exists, and its §"What this wave CLAIMS" table maps every prior deferral to a task number. Wave 6's does the same for G-2. Wave 8's `Wave 5 Task 10` / `Wave 6 Task 9` / `Wave 6 Task 12` pointers all land.

---

## 4. NEW CONTRADICTIONS INTRODUCED BY THIS PASS

### 🔴 BLOCKER 1 — Wave −1 Task 8 is built on a premise Waves 1 and 2 both measure as false

`w-minus-1_w0.md:512-571` adds **a brand-new Task 8** whose entire justification is:

> *"the guard fires **after** merge, on the deploy path … and never on a change under review."*
> Exit criterion 10 control: *"with the same edit in place and the new step removed, every PR-time job stays green — **which is today's state**."*

`w1_policy_authority.md:603-615` says the opposite and calls it out by name:

> *"**Correcting this file's own earlier claim, which reconciliation G-6 inherited.** … **That is wrong, verified 2026-08-28.** `Backend/package.json:5` makes `prebuild` run `build:shared-contracts`, and `:10` makes `pretest` run it too … `pr-checks.yml:229` and `:245` both do. **The guard is wired.** … **G-6 is closed as a mis-statement, not as work.**"*

`w2_evidence_severity.md:105` independently confirms the mechanism.

**Measured at `origin/main` `0cf9021e`:**
```
package.json:10   "pretest": "npm run build:shared-contracts"
package.json:6    "build:shared-contracts": "npm run check:ai-security-consumer && …"
Backend pr-checks.yml:229  run: npm test -- src/audit/audit.service.live-pg.spec.ts
Backend pr-checks.yml:245  run: npm test -- src/alerts/alerts.service.live-pg.spec.ts
$ grep -cE 'npm test|npm run test' pr-checks.yml → 11
```

**Wave 1 and Wave 2 are right; Wave −1 Task 8 is wrong.** Worse, its own Step 1 discovery command is what produced the wrong answer — it greps only for `npm run build`:

```bash
for f in build pr-checks security; do … grep -c "npm run build"; done
```
which returns `build=2 pr-checks=0 security=0` and misses all 11 `npm test` invocations. A plan that hands the implementer a command guaranteed to reproduce the error is worse than a wrong line number.

**Fix:** Wave −1 Task 8's premise, defeat-test control and exit criterion 10 all have to be rewritten (the *named-job* argument at Step 2 survives — a greppable, separately-mirrorable leg is still worth having; the "today every PR-time job stays green" claim does not). Wave 1's G-6 disposition is the authoritative one.

---

### 🔴 BLOCKER 2 — D-6: two waves make opposite, mutually exclusive decisions about `formatVersion`

| | Wave 2 Task 6 | Wave 4B Task 1 |
|---|---|---|
| Text | `w2:686` — *"**Wave 4B bumps `formatVersion` to 4 explicitly.** It does not ride this wave's bump."* | `w4b:309` — *"**`proposalKind` lands inside that same bump.** It does not get a `formatVersion` 4"* |
| Exit | crit 7: *"`proposalKind` is **absent** (it lands at formatVersion 4, Wave 4B Task 1 — D-6, decided in Task 6)"* | crit 8: *"at **one** `formatVersion` bump shared with Wave 2 (D-6)"* / Task 1 exit: *"`git log --oneline -- parity-vectors/toolrisk-classes.v1.json` shows a **single** version-changing commit for Wave 2 + Wave 4B combined"* |

Both cite "D-6" as their authority. Both are labelled "decided". They cannot both hold: Wave 2's exit **requires** `proposalKind` absent from the file at its exit; Wave 4B's exit **requires** it present in the same version-changing commit.

Wave 2's reasoning is the sound one and 4B does not engage with it: *"This wave cannot truthfully populate `proposalKind`. Its producer is `ClassCatalog()` … the field does not exist on it. A column emitted here would be a value no producer sets."* And O-14 puts Wave 2 strictly before Wave 4B, which makes 4B's "one shared commit" physically unachievable.

This is not cosmetic. Both files say the same sentence about the cost: *"Two silent bumps of a three-repo digest-pinned file … is a re-vendor outage."* Shipping this ambiguity is how that outage happens.

**Fix:** Wave 4B Task 1 adopts formatVersion 4 and drops the single-commit exit criterion.

---

### 🔴 BLOCKER 3 — an ownership cycle: nobody owns the `vendored-upstream-drift.yml` `pull_request:` trigger

Four files, and they form a loop:

- `w-minus-1_w0.md:595` (exit criterion 7): *"**Owned by Wave 5 Task 9.** … Half A there and is **BLOCKED on an owner spend decision** … This wave asks the question in Task 5 Step 5 and implements neither half."*
- `w5_w6:34-40`: *"**And one deferral is handed back rather than claimed.** … It is not. **Owned by Wave −1 Task 5**, where it is already a step and already exit criterion 7."*
- `w5_w6:661-665` (Task 9): *"**The GitHub half is not this task's.** … owned by Wave −1 Task 5 — it is a step there and exit criterion 7 there … Do not edit that workflow from this wave."*
- `w3:951-954`: *"**The `vendored-upstream-drift.yml` half is Wave −1 Task 5's too, not Wave 5's.** … Wave −1 Task 5 specifies it and makes it exit criterion 7, and its stated precondition is satisfied — **so that half is not blocked**."*
- `w4c:878`: *"owned by **Wave −1 Task 5** (its exit criterion 7), and it **is blocked there**"*

So: **Wave −1 → Wave 5 Task 9. Wave 5 Task 9 → Wave −1 Task 5 criterion 7.** Both explicitly disclaim. Wave 3 and Wave 4C both point at a criterion that has handed the work away. Wave 3 additionally says it is *not blocked* while three other files say it is.

Wave 5 Task 9 is real and good — but it is Half B only (`ci/lib/vendored-engine-parity.mjs`, offline, needs no token). **Half A has no owner in any of the eleven files.** Wave 5's own paragraph nails the failure mode and then commits it: *"Three waves pointing at a fourth is how a one-line change goes unmade for a month."*

**Fix:** one file has to actually take it. Wave −1 Task 5 is the right home (same owner cost decision as `holdout-score.yml`) — restore criterion 7 as an owned, BLOCKED criterion rather than a pointer.

---

### 🔴 BLOCKER 4 — Wave 8 says P0-18 has no owner; Wave 7C owns it

`w8:1172` (traceability table, still says):
> *"**The containment change has no owning task in any wave of this packet** (reconciliation G-5) … It is carried as an **unowned open defect** … **Do not read the prerequisite row as an assignment**"*

`w7_scanner.md:1481` (Wave 7C Task 2):
> *"Do not execute an untrusted package the sandbox cannot contain (P0-18, G-5)"*, exit criterion 6: *"**P0-18 has an owner and a merged change.**"*

Wave 7 was edited **last** (02:08 vs Wave 8's 02:02), so Wave 8's row is stale rather than a real dispute — but as shipped, the certificate wave will render `profile.prerequisites` with an "unowned open defect" that a merged change has closed, and instruct its reader not to treat 7C as an assignment.

---

### 🟠 4.5 — Wave 1 asserts a grep result that is false

`w1:236-239`:
> *"**Wave 5 as written has ten tasks and none of them carries it** — `grep -n "byDisposition\|detectorCount" w5_w6_console_triage.md` returns nothing."*

Run it:
```
w5_w6_console_triage.md:813  byDisposition (category-bucket-board.tsx:1758-1766) files each category …
w5_w6_console_triage.md:816  detectorCount (:2164-2167) sums membersAtDisposition …
w5_w6_console_triage.md:854  every member minus the three lanes' detectorCounts …
(6 hits)
```
Wave 5 has **eleven** tasks, and **Task 11** (`w5_w6:793`, *"The three lane headers stop being the only answer to 'is anything set to warn?'"*) is entirely the lane-tally under-count, explicitly *"**Claimed from Wave 1**"*. Wave 1 was edited at 02:02, Wave 5 finished at 02:05.

Wave 1 repeats the false claim in its closing section (`w1:859-860`, *"no Wave 5 task carries it as written"*). Two paragraphs to delete. Not a blocker — the work is owned — but it is a plan telling an implementer to open a defect against a wave that already did the job.

### 🟠 4.6 — three ownership mis-pointers that will send someone to the wrong task

- `w4b:314`: *"(Wave −1 Task 7 moves it in)"* about `ci/lib/vocab-parity.mjs` — but `w-minus-1_w0.md:497-503` says *"**owned by Wave 1 Task 6** … This wave must not put a competing copy in a workflow"*, and Wave 1 Task 6 does own it.
- `w4a:208` and `w4a` criterion 7: *"until **Wave −1 Task 7**'s trigger decision is taken by the owner"* — Wave −1 Task 7 explicitly says *"until the trigger question (**Task 5**) is answered"*. Task 7 owns a job, Task 5 owns a trigger.
- `w4a:36`: *"Restoring the trigger is **Wave −1 step 7**"* — same slip.

### 🟠 4.7 — Wave 7C over-claims a property of Wave 8's list

`w7:1560` criterion 3: *"**0** entries on that list remain without a named test."*
`w8:1007`: *"and **2** (entries 3 and 8) sit in the `pending` block."* Wave 8 entry 3 is *"**PENDING — no test named**"* (tool-shadow capture) and entry 8 is the 15/52 prompt-lane figure. 7C closes entry 7 only.

---

## 5. CITATION SPOT-CHECKS — 31 added/changed references re-resolved

Every one below was verified with `git show origin/main:<path>` at the manifest SHAs. **31 of 31 resolve exactly.** The editors' citation discipline is genuinely good; the failures in this audit are all cross-file logic, not line numbers.

| Citation | File | Result |
|---|---|---|
| `Backend package.json:5` prebuild / `:10` pretest / `:6-7` chain | w1, w2 | ✅ exact |
| `Backend pr-checks.yml:229`, `:245` `npm test`; `on:` `:35-38`; **728 lines** | w1, w−1 | ✅ exact (11 `npm test` steps total) |
| `Backend build.yml:246`/`:371`/`:423`; `on:` `:3-6` | w1, w−1 | ✅ exact |
| `Frontend pr-checks.yml` `on:` `:89-90` = `workflow_dispatch: {}` only | w−1, w1, w5 | ✅ exact |
| `Frontend render-harness` 635 / 870 / 225 / 224 lines, byte sizes | w5 | ✅ exact |
| `fixtures.cjs` answers no `ai-security-policy` / `presets` route | w1, w5 | ✅ exact (0 hits) |
| `category-bucket-board.tsx:1758`, `:2153`, `:2164`, `:2251`, `:483` | w5 T11 | ✅ exact |
| `category-bucket-board.test.tsx:37`, `:48`, `:273-274`, `:298-300` | w5 T11 | ✅ exact incl. the `"24 detectors"` / `not "30 detectors"` pair |
| `ai-category-board-model.ts:179` `categoryDisposition` | w5 T11 | ✅ exact |
| `MANIFEST.json` → `254d24fc` + `724ed5a9…104c` / `2967a343…748c` / `b3e998a4…6237` | w5 T9 | ✅ all four exact |
| `ai-security-policy.service.ts:712` / `:720` | w6, w3b | ✅ exact |
| `detections-absent-facets.spec.ts:196-208` + the "fifth 'market' value" comment | w3b, w6 | ✅ exact |
| `fp-agent/src/lib/store.js` 484 lines, `BUCKETS :50`, `STATUSES :79`; `30d6c6d8..486d937b` = 20 commits / 45 files | w6 T13 | ✅ exact |
| `os-target-classifier.ts:341` (§6b), `:349` (winrt-go), `__tests__/…:102-157` | w7C T1 | ✅ exact |
| `Sandbox-Worker/src/platform-mismatch.ts` = 213 lines; `platform-mismatch-routing.test.ts:44`; 5 + 20 cases | w7C, w8 | ✅ exact |
| Scanner `.github/workflows/test.yml:53-58` (the "wrong path, right lines" correction) | w7A | ✅ exact |
| Scanner `main.ts:87` detectFork / `:433` fork branch / `:455` bare `process.exit(0)` | w7A | ✅ exact |
| `Installers client.go:2856` / `:2859`, no `securityOutcome` | w7A | ✅ exact |
| `agent-ingest-validation.pipe.ts:77-81` / `:90-91` | w7A | ✅ exact |
| `hookdialect.go:100/:104/:111/:112/:115/:166` | w8, w3b | ✅ exact — `:112` really is a field, `:166` really is the table |
| `holdout.go:42-44` / `:112` / `:116` / `:357-359` | w3, w3b | ✅ exact |
| `zz_c12_ordinary_work_probe_test.go:94/:263/:305/:329` (`C12TOTAL` printf) | w0A T4 | ✅ exact — **M-2 fix landed correctly**; the literal 109 is gone, replaced by the printed **N** |
| `toolrisk.go:122` still carries `~(?:/\S*)?\|\$HOME\b` | w0A, w4A, w4B | ✅ exact |
| Installers `pr-checks.yml` 801 lines, `grep -c toolrisk` = **0**, `on:` `:81-87` | w−1, w3, w4A | ✅ exact |
| `holdout-score.yml` 89 lines, `:6` "PUSH TO MAIN", `:13` "does NOT gate", `on:` `:22-25` | w−1, w3, w3b | ✅ exact |
| `ai-security-portable-reader.spec.ts:128-132` (`toBe` identity, not deep equality) | w1 T2 | ✅ exact |
| `constants.ts:93` alias / `:1244` chmod monitor / `:1254` priv-esc monitor | w1, w4B | ✅ exact |
| `events-content.test.tsx:471-479` — `findingClass` `:472`, `baseSeverity` `:477`, **`formulaVersion` hits = 0** | w2 T1 | ✅ exact — Wave 2's *"the defect is an **absent** member, not a stale one"* correction is right |

**One resolution failure, and it is the manifest's, not a wave's:** `Ceragon-Intelligence origin/main` = `deb70e64`, not the spine's `486d937b`. Wave −1 and Wave 6 both caught it and state it; the spine does not.

---

## 6. WAVE DEPENDENCY DAG

```
W−1 ──┬─► W0A ──┬────────────────────────────► W4B ─┐
      ├─► W0     │                                   │
      ├─► W1 ──► W2 ──┬─► W3 ──┬─► W3B ──┬─► W4A ──► W4C
      │               │        │         └─► W4B     │
      │               └─► W5* ─┴─► W6 ───────────────┤
      └────────────────────────────────────────────► W8
W7A ──► W7B ──────────────────────────────────────► W8
W7C ──► (nothing)
```

**No wave depends on a wave that does not exist.** Referenced set = {−1, 0, 0A, 1, 2, 3, 3B, 4A, 4B, 4C, 5, 6, 7A, 7B, 7C, 8}; all sixteen have a file. No Wave 9/10 phantoms.

**One cycle, disclosed and broken at task granularity:**
- `w5_w6:7-10`: *"Task 10 renders the certificate manifest, whose schema **Wave 8 Task 6** owns … That file must land as a **schema-only commit before Task 10 starts**; Task 10 does not invent a second shape and does not wait for Wave 8's generator."*
- `w8:29-31`: *"**Task 6 lands `schema.json` as a schema-only commit before Wave 5 Task 10 starts.** Wave 5 does not wait for the generator."*

Both sides state it identically. **W8·T6 → W5·T10 → W8·rest** is acyclic. Acceptable, and the only wave-level cycle in the packet.

**One orphan node — Wave 7C.** It is referenced by exactly **4 lines, all inside its own file**. Nothing depends on it, and `w8:3-10`'s dependency line names *"Wave 7A/7B"* only. That is wrong on two counts: Wave 8's R3 certificate row needs 7C Task 2's outcome, and Wave 8 Task 11's claimable entry 7 is the row 7C Task 1 exists to pin. **Wave 8's dependency line must add Wave 7C Task 1 and Task 2.**

---

## 7. WHAT TO FIX BEFORE ANYONE WRITES CODE

Ordered by blast radius:

1. **D-6.** Wave 4B Task 1 adopts `formatVersion` **4**; delete its "single version-changing commit" exit criterion. *(Two silent bumps of a three-repo digest-pinned file is the outage both files warn about.)*
2. **The vendored-drift trigger.** Break the −1 ↔ 5 loop. Wave −1 Task 5 takes Half A back as an owned, BLOCKED criterion; Wave 5 Task 9 keeps Half B; Wave 3 Task 11's *"not blocked"* sentence is deleted.
3. **Wave −1 Task 8.** Rewrite the premise, the discovery command (`grep -cE 'npm test|npm run build'`), the defeat control and exit criterion 10 against the measured fact that `pretest` reaches the guard from 11 PR-time steps. Keep the named-job argument; drop the false "today's state".
4. **Wave 8 `w8:1172`.** P0-18 is owned by Wave 7C Task 2. Update the traceability row and add Wave 7C to Wave 8's dependency line.
5. **The spine.** Refresh the rebase manifest (`deb70e64`), correct hard-ordering item 2 to Backend-before-Frontend per C-6, absorb O-1…O-19, and add Waves 5, 6 and 7C to the wave list. It is the entry point and it is 80 minutes older than every file it governs.
6. **Housekeeping:** Wave 1's false Wave-5 grep (2 places); `w4b:314` and `w4a:36`/`:208`/crit 7 ownership slips; Wave 7C criterion 3's "0 entries" over-claim.

Items 1–4 are release blockers: each one leaves two files instructing an implementer to do incompatible things, and three of the four are about a digest-pinned artifact, a fleet-wide guard, or a certificate row.