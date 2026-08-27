# Wave 3 — Repair the measurement instrument, then give every lane a denominator

**Depends on:** Wave −1 (rebase, citation repair, the `ScanAll` correction), Wave 2 (the evidence-grade
fields on `toolrisk.Finding`, which Task 7 carries onto the wire). Wave 0A and Wave 1 may run in
parallel; nothing here blocks them.
**Implements decisions:** D3, D4 (amended — lane-specific, not tool-only), D5, D6 (rewritten), **D18**.
**Certificate impact:** the **measurement-substrate integrity** dimension is `UNKNOWN` until this wave
passes, and so is every `metrics` block in every certificate. Concretely: `metrics.falsePositiveRate`,
`metrics.recall`, `metrics.unknownRate` and `metrics.inspectionCompleteness` stay `null` for every lane,
`system.engineVersion` stays invalid, and no class may be promoted anywhere in Waves 4A/4B/4C/7B on a
number this instrument produced. D18 is not advisory: **every rate this product has ever published was
computed against the wrong denominator, and 43 of 55 classes report perfect recall on zero evidence.**

---

## Context an engineer needs

### Read the tree with `git show`, not the working copy

`C:/Users/Owner/Documents/Ceragon/Installers` is **1,010 commits behind `origin/main`** (`8e49a625` vs
`5b129523`, measured 2026-08-27). Every file this wave touches — `cmd/ai-security-neutral/holdout.go`,
`internal/neutraleval/*`, `internal/dlp/scanall.go`, `parity-vectors/neutral/*` — **does not exist in
the working tree at all.** `ls cmd/ai-security-neutral/` returns `No such file or directory`.

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
git fetch origin
git rev-list --count HEAD..origin/main
MSYS_NO_PATHCONV=1 git show "origin/main:cmd/ai-security-neutral/holdout.go" | less
```

`MSYS_NO_PATHCONV=1` is mandatory on Git Bash for any path containing `.github`, and harmless
elsewhere. Without it `git show "origin/main:.github/workflows/holdout-score.yml"` fails with
`ambiguous argument 'origin\main;.github\workflows\holdout-score.yml'`.

### The report generator the review told you to build already ships

Review P0-04 says to build a per-class report generator. **One already exists and it is good work.**
`cmd/ai-security-neutral/holdout.go` (442 lines) carries:

| Symbol | Line | What it already does right |
|---|---|---|
| `scoreHoldout` | `:208` | runs every case, aggregates per class |
| lane-mixing refusal | `:222-238` | **refuses** a corpus mixing INGRESS and EGRESS surfaces, with a message explaining why one rate over two populations is not a rate |
| failed-case handling | `:283-287` | a case that did not run is an error and is **excluded** from the rates, never counted as a pass |
| zero-rows-for-silent-classes | `:269-271` | every catalog class gets a row even at zero, so a dead detector is visible rather than absent |
| interruption definition | `:302` | `result.Decision.Verdict != policyeval.VerdictAllow` — what a human actually feels |
| `detectorRates` | `:102-124` | `ClassID`, `Lifecycle`, `BenignCases`, `FalsePositives`, `FPRate`, `AttackCasesExpecting`, `FalseNegatives`, `FNRate`, `TruePositives`, `BoundaryFires` |
| `missedAttack` / `benignInterruption` | `:86-100` | every miss and every benign interruption named individually, not just counted |

**Do not build a second one. Fix this one.** Three defects, all verified on `origin/main` `5b129523`.

### Defect 1 — every class shares one corpus-wide false-positive denominator

`holdout.go:357-359`:

```go
for class := range byClass {
    byClass[class].benign = benignCases
}
```

`benignCases` is the corpus-wide benign count. Every row therefore prints `fp=N/23`, and
`HOLDOUT_REPORT.md` publishes exactly that: `aws-access-key 1/23 4.3%`, `db-connection-string 1/23
4.3%`, `jailbreak-persona 1/23 4.3%`, `injection-system-exfil 0/23 0.0%`.

**The corpus is not one population.** Measured by decoding
`parity-vectors/neutral/neutral-corpus.holdout.jsonl` on `origin/main`:

| | cases | BENIGN | ATTACK | BOUNDARY |
|---|---:|---:|---:|---:|
| `surface: dlp` | 27 | **17** | 7 | 3 |
| `surface: promptrisk` | 12 | **6** | 5 | 1 |
| total | 39 | 23 | 12 | 4 |

Reproduce:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
MSYS_NO_PATHCONV=1 git show "origin/main:parity-vectors/neutral/neutral-corpus.holdout.jsonl" | python -c "
import sys,json,collections
ls=collections.Counter()
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    e=json.loads(line); c=json.loads(e['case']) if isinstance(e.get('case'),str) else e.get('case')
    ls[(e.get('surface'), c.get('label'))]+=1
print(dict(ls))"
```

Both surfaces fall in the EGRESS lane, because `LaneOf` (`internal/neutraleval/ingress.go:66-71`)
returns `LaneIngress` only for `surface == "ingress"` and `LaneEgress` for everything else. So the
lane-mixing guard — which is the right idea and the pattern to copy — does not catch this, because
this is not a lane mix. It is a **surface** mix inside one lane.

What the published numbers actually are, once a class is scored against the cases it was exposed to:

| Class | Published | True exposure | True rate | Exact one-sided 95% upper bound |
|---|---|---|---|---|
| `jailbreak-persona` (promptrisk) | `1/23` = 4.3% | 1 of **6** | **16.7%** | — |
| `db-connection-string` (dlp) | `1/23` = 4.3% | 1 of **17** | **5.9%** | — |
| `aws-access-key` (dlp) | `1/23` = 4.3% | 1 of **17** | **5.9%** | — |
| `injection-system-exfil` (promptrisk) | `0/23` = 0.0% | 0 of **6** | 0% | **39.30%** |
| any `INGRESS_RISK` class | `0/23` = 0.0% | 0 of **0** | — | **UNKNOWN** |

`jailbreak-persona` is the product's own live customer-visible false positive
(`qa-fp-detections-finding-name` — the console rendering the class *name* `jailbreak-persona` trips the
detector). Confirmed `surface: promptrisk`, `label: BENIGN`. **The published number understates it by
3.8×.** And `injection-system-exfil 0.0%` is really "we cannot rule out 39%".

### Defect 2 — 43 of 55 classes report perfect recall on zero evidence

`detectorRates.FNRate` is a bare `float64` at `holdout.go:116` — no pointer, no `omitempty` — and is
written only inside `if a.expecting > 0` at `holdout.go:381-383`. A class with no attack case
therefore serialises as `"fnRate": 0`, which is indistinguishable from a class that caught everything.

**Independently verified, not carried from the source material.** The pinned catalog
`internal/aipolicycontract/detector_catalog_generated.go` declares **55** classes
(`grep -c 'ClassID:'`). The 12 ATTACK cases in the sealed corpus expect exactly **12 distinct** classes:
`aws-credential-pair`, `db-connection-string`, `github-token`, `injection-credential-exfil`,
`injection-instruction-override`, `injection-role-marker`, `injection-system-exfil`,
`jailbreak-persona`, `openai-key`, `private-key`, `slack-token`, `stripe-live`.

**55 − 12 = 43.** Among the 43 reporting `fnRate: 0`: `anthropic-key`, `aws-secret-key`,
`azure-connection-string` — all malicious-floor credential classes.

`FPRate` (`holdout.go:112`) has the same shape and is written only inside `if a.benign > 0`
(`:378-380`). It is currently masked because `a.benign` is always the corpus-wide count and therefore
always positive. **The moment Defect 1 is fixed, `FPRate` acquires exactly Defect 2's bug** — a class
with zero exposure will print `"fpRate": 0`. Fix both fields in the same change or the repair
introduces the defect it removed.

### Defect 2b — the report prints rows for classes the engine under measurement cannot emit

`scoreHoldout` seeds a row for every catalog class (`:269-271`). But five of the 55 have **no Go
producer**: `internal-url`, `custom-blocklist`, `high-risk-file-type`, `image-upload`, `kubeconfig`
appear only in the generated catalog and in `browser-extension/src/`. Verified by
`git grep -ln '"kubeconfig"' origin/main -- internal browser-extension/src`. They still print
`fp=0/23` in a report about the Go engine.

The 55 classes carry a `Family` (13 distinct: `CREDENTIAL` 21, `PROMPT_INJECTION` 10, `INGRESS_RISK` 6,
`JAILBREAK` 4, `HEURISTIC` 3, `UPLOAD` 2, `PRIVATE_KEY` 2, `FINANCIAL_DATA` 2, and one each of
`TOPOLOGY`, `POLICY_SYNTHESIZED`, `PERSONAL_DATA`, `DATABASE_URI`, `CONFIGURATION`) but
`AiSecurityDetectorClass` (`detector_catalog_generated.go:22-36`) has **no producer or surface field**.
Family correlates with producer but is not the same statement and must not be assumed to be.
Discovery command for the full producer map, which was not machine-resolved this pass:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
for c in $(MSYS_NO_PATHCONV=1 git show "origin/main:internal/aipolicycontract/detector_catalog_generated.go" \
           | grep -oE 'ClassID: "[a-z0-9-]+"' | sed 's/ClassID: "//; s/"//'); do
  printf '%-38s %s\n' "$c" "$(MSYS_NO_PATHCONV=1 git grep -ln "\"$c\"" origin/main -- internal/dlp internal/promptrisk internal/ingressrisk | tr '\n' ' ')"
done
```

### Defect 3 — every result ever produced carries a version stamp that cannot move

`cmd/ai-security-neutral/main.go:23`:
`engineVersion := flag.String("engine-version", "m4.7", "executed engine version")`
`internal/neutraleval/runner.go:467-468`: `if out.EngineVersion == "" { out.EngineVersion = "m4.7" }`

`.github/workflows/holdout-score.yml` invokes the scorer twice — `:48-52` (egress) and `:62-66`
(ingress) — and passes `--engine-version` neither time. Change any detector rule and re-run: the
stamp is still `"m4.7"`.

`EnvironmentDigest` (`runner.go:480-491`) is derived from four keys only —
`{goVersion, goos, goarch, runner: "neutral-module-v2"}`. No ruleset digest, no catalog digest, no
normalizer version, no parser version, no effective-policy digest, no OS build, no shell, no tool
schema. `RunnerIdentity` (`internal/neutraleval/contract.go:124-130`) and `ResultProvenance`
(`:132-137`) are where those belong.

**`artifactDigest` already works and nobody should rebuild it.** `main.go:28-39` derives it from the
executing binary — *"a pasted digest can be wrong; this one cannot"* — and `normalizeOptions` rejects a
run without it (`runner.go:474-478`).

### The scorer has never had a test

```bash
MSYS_NO_PATHCONV=1 git grep -n "scoreHoldout\|detectorRates" origin/main -- cmd
```

Seven hits, all in `holdout.go` and one call site in `main.go`. `cmd/ai-security-neutral/main_test.go`
is 204 lines with seven tests — `TestRunRejectsEmptyInput`, `TestRunRejectsMalformedJSON`,
`TestRunDispatchesSingleEntry`, `TestRunDispatchIgnoresNestedEntriesStringWhitespaceAndKeyOrder`,
`TestRunDispatchesCorpusByFormatAndHandlesDuplicateCaseIDs`,
`TestRunRejectsUnsupportedCorpusFormatVersion`, `TestRunRejectsEmptyCorpus` — and **none of them
touches the scorer.** Every defeat test in this wave needs somewhere to live, so Task 1 builds that
first.

### THE SEAL TRAP — this will cost you the task if you miss it

`internal/neutraleval/holdout_seal_test.go:117-161` walks the entire repository and **fails the build**
if any `*_test.go`, `*.test.mjs` or `*.test.js` file contains the literal string
`neutral-corpus.holdout.jsonl` **or** `holdout-seed.json`. The seal test itself is the only exemption
(`:137-139`).

So the tests you write in Task 1 **must construct their corpus in memory** and must not name either
file. They must also not read the sealed corpus by any indirection — the point of the seal is that no
merge gate can see it, and a helper that computes the path defeats the seal just as effectively as a
literal.

**Do not weaken the seal.** It is one of the few instruments in this workspace that provably works.

### The prompt-lane instrument the old plan says does not exist

`plan:9397` gates the six-class prompt promotion *"on the Wave 3 decision-level shadow and on nothing
else"*, and `plan:9390-9396` justifies it by counting five `promptrisk` cases in
`neutral-corpus.all.jsonl`. That count is right for `all.jsonl` and it is the wrong file.

Two sealed prompt-lane instruments already ship and are scored nightly:

- `parity-vectors/neutral/neutral-corpus.holdout.jsonl` — 39 cases, **12 on `surface: promptrisk`**
  (6 BENIGN / 5 ATTACK / 1 BOUNDARY), sealed, `split: SEALED_HOLDOUT` on every line
  (`holdout_seal_test.go:62-114`).
- `parity-vectors/neutral/neutral-corpus.ingress.jsonl` — 28 cases (**18 BENIGN / 8 ATTACK /
  2 BOUNDARY**), deliberately *not* sealed so `internal/neutraleval/ingress_lane_test.go` can prove the
  number moves.

**A tool-lane shadow is not prompt evidence** (P0-03). All 40 tool-risk class ids contain neither
`injection` nor `ingress`, so no prompt class can ever appear in a `[]toolrisk.Finding`. Task 8's lane
seams exist so that the prompt promotion in Wave 4C reads the prompt lane's report.

### The corpus reference table conflates case count with denominator — including in the source material

`M47A_REVISION_SOURCE_MATERIAL_20260827.md` §6.2 lists `neutral-corpus.ingress.jsonl` as "28 B / 8 A".
Measured: **18 BENIGN**, 8 ATTACK, 2 BOUNDARY — as `HOLDOUT_REPORT.md` itself states. It also credits
`neutral-corpus.all.jsonl` dlp cases with "128 → FP ≤ 2.31%"; 128 is the total dlp case count
(44 BENIGN / 79 ATTACK / 5 BOUNDARY), and the FP denominator is **44**, so the supportable bound is
**6.58%**, not 2.31%.

Exact one-sided 95% bounds at zero observed errors (`1 − 0.05^(1/n)` for FP, `0.05^(1/n)` for recall):

| n | FP upper | recall lower |
|---:|---:|---:|
| 5 | 45.07% | 54.93% |
| 6 | 39.30% | 60.70% |
| 7 | 34.82% | 65.18% |
| 12 | 22.09% | 77.91% |
| 17 | 16.16% | 83.84% |
| 18 | 15.33% | 84.67% |
| 23 | 12.21% | 87.79% |
| 44 | 6.58% | 93.42% |

**A denominator is the count of cases of the right label on the right surface, never the file's line
count.** This wave's entire purpose is that sentence; the plan must not violate it in its own tables.

### `dlp.Scan` in v1's shadow, and the guard that is proven red

`plan:5780` (`for _, f := range dlp.Scan(original)`) and `plan:5789`
(`if len(dlp.Scan(out)) > 0`) write shallow scans into `internal/daemon/`.

`internal/dlp/scan_depth_guard_test.go` forbids that. `narrowEntryPoints` (`:55-61`) lists
`dlp.Scan(`, `dlp.ScanEx(`, `dlp.ScanHexAtRest(`, `dlp.ScanCredentialEvidence(`,
`dlp.ScanPrivateKeyEvidence(`. `narrowCallExemptions` (`:81-84`) has **exactly one entry** —
`internal/contenttransform/transform.go`. `internal/daemon/ai_handlers.go` is not exempt; it is in
`fullDepthSurfaces` (`:103`), which `TestFullDepthSurfacesStillScan` (`:162`) pins from the other
direction. `TestNoSurfaceScansShallow` (`:129`) fatals at `:140` with:

```
these surfaces reach internal/dlp through a PARTIAL detector set:
```

The canonical calls are `dlp.ScanAll` (`internal/dlp/scanall.go:78`) and `dlp.ScanAllAtRest` (`:101`).
Using `ScanAll` in the shadow's re-scan guard is *strictly stronger* — more findings means more chances
to refuse to store — so this correction never softens anything.

**Never weaken this guard, and never add an exemption for a measurement surface.** The plan's stated
justification is also stale: it cites `dlp.go:1519-1520` in four places (`plan:4617`, `:5638`, `:5690`,
`:5773`) and `dlp.go` is **1510 lines**. The real citation is `Redact` at `internal/dlp/dlp.go:1479`
with `if len(findings) == 0 { return text }` at **`:1480-1481`**. The underlying trap is real and
important: `Redact` returns the raw text when handed an empty finding list, so a caller that scans,
finds nothing, and redacts stores the plaintext while every line reads as if it redacted.

### Where the guard actually runs — the review is wrong about this

Review §15 and the disposition both say the scan-depth guard *"runs on every PR via `pr-checks.yml:146`"*.
`pr-checks.yml:145-146` is indeed the step
`go test ./internal/policyeval/... ./internal/dlp/... ./internal/promptrisk/...`, inside the
`scanner-parity` job. **But `pr-checks.yml` has no `pull_request` and no `push` trigger.** `on:` at
`:81-87` is `workflow_dispatch` plus a weekly `schedule: '41 7 * * 1'`, and the `scanner-parity` job
carries `if: github.event_name != 'schedule'` at `:116`, so the scheduled run skips it. The cost-gate
note at `:9-30` explains why, and `:26-30` says it plainly: *"there is now NO automatic gate on
GitHub."*

The guard runs in exactly two places: a manual `gh workflow run pr-checks.yml`, and the local Docker
mirror. `ci/gates.json` mirrors `pr-checks:scanner-parity` **and** `holdout-score:score`, so both are
runnable for free:

```bash
node ci/lib/run.mjs Installers pr-checks:scanner-parity
node ci/lib/run.mjs Installers holdout-score:score
```

Every exit criterion in this wave is stated against that local runner, not against a GitHub tick.

### The regression that removed the only automated detector-quality instrument from the merge path

`.github/workflows/holdout-score.yml` is 89 lines. Its `on:` block at `:22-25` is `workflow_dispatch`
plus `schedule: '17 3 * * *'`. The `push` trigger was removed on 2026-08-25 (`cd657c77`, cost gate,
owner decision) and the note at `:18-21` records that. **Its own header at `:6` still reads
"This runs on PUSH TO MAIN and NIGHTLY"** — a live self-contradiction in shipped source. And `:13-16`
states *"The job does NOT gate on a rate threshold today."*

So the only automated detector-quality instrument in the workspace is a **non-gating nightly report
whose version stamp is a constant**. Task 11 handles this and it is an **owner decision, not an
engineering call**.

### The v1 shadow store, and why it is being replaced rather than extended

`plan:5052-5061` defines `toolShadowFile` with three fields:

```go
type toolShadowFile struct {
    Observed int64             `json:"observed"`
    Dropped  int64             `json:"dropped"`
    Deltas   []toolShadowDelta `json:"deltas"`
}
```

`Observed` is **one global counter**. `observe` (`plan:5098-5115`) increments it and, when
`d.Active == d.Candidate`, returns without appending — so an agreement's `Classes` are discarded and
no per-class denominator can ever be reconstructed. `maxToolShadowDeltas = 500` (`plan:5034`) with
`Dropped` counting overflow, which is the right instinct and is kept.

`plan:9568` then instructs the implementer to *"Open the Wave 3 shadow report and find this class"*.
`grep -n "shadow report" M47A_IMPLEMENTATION_PLAN.md` returns that one line and **no task creates the
file.** Task 9 creates it.

### v1 traps worth carrying forward verbatim

These were established by v1's own reading of the tree and remain true. Do not rediscover them.

- **`hookFires.seedFromDisk(secPaths.ConfigDir)` at `internal/daemon/server.go:453` sits inside
  `NewServer` (which begins at `server.go:365`), not inside `Start`.** Every daemon test helper —
  `newAIServer` (`ai_handlers_test.go:83`), `newAIServerAtPaths` (`ai_session_continuation_test.go:40`)
  — calls `NewServer`. A store seeded there is armed by construction, so a test that seeds *before*
  constructing the server has its persist directory silently replaced.
- **`security.RecordEvents` (`internal/security/events.go:37-47`) is SOC-visible by construction** —
  it writes the hash-chained tamper log *and* `appendEventQueue`, which the heartbeat uploads. D5's
  "surfaces nothing" rules it out as the shadow sink. Use a local-only `0o600` file in the
  `hookFireStore` pattern (`internal/daemon/observed_runtime.go:167` type, `:276` `seedFromDisk`,
  `:329`/`:343` save/load).
- **Privacy on capture:** reuse `redactedToolInputView` (`internal/daemon/ai_handlers.go:3843`), an
  allowlist of seven safe scalar keys (`:3853-3856`), with `typedSecretMarkers` (`:3914`).
- **The ratchet-with-a-banked-baseline idiom already exists twice in-workspace** —
  `Static-Worker/corpus/campaign-lib.cjs:364` `diffCatchBaseline` with
  `corpus/artifact-fixtures/CATCH_BASELINE.json`, and `measuredMentionFires = 6` at
  `internal/toolrisk/zz_c12_mention_fp_test.go:101`. Copy it; do not invent a third shape.

### Scope boundary

v1's Wave 3 Task 8 (`plan:7147-7413`, the Static-Worker benign gate and its ecosystem-blind TP
predicate) **moves to Wave 7B** with the rest of the P1-04 corpus contract. It is not orphaned and it
is not in this wave. v1's Task 5 — connecting `internal/toolrisk` to the harness that already computes
rates — is **preserved** and becomes Task 8 lane C here; its instinct ("use the scorer that exists")
was right and the review's P0-04 was wrong to call for a second generator.

---

## Task 1: Give the scorer a test file, and prove it can go red

Nothing below can be defended without this. It is deliberately first.

**Files:**
- Create: `Installers/cmd/ai-security-neutral/holdout_test.go`

- [ ] Write `holdoutCorpusFixture(t *testing.T, cases []fixtureCase) []byte` — a helper that builds a
      JSONL corpus **in memory** from a table, and never names `neutral-corpus.holdout.jsonl` or
      `holdout-seed.json` in any form. Give it at minimum: surface, label, split, caseId, holdoutSeed
      name, expected finding classIds, and the input text.
- [ ] Write `TestScoreHoldout_RefusesAMixedLaneCorpus` — one `surface: "dlp"` case plus one
      `surface: "ingress"` case. Assert the returned error contains `mixes measurement lanes`. **This
      one passes on arrival**; it exists to pin the pattern every other invalidation rule in this wave
      copies (`holdout.go:222-238`).
- [ ] Write `TestScoreHoldout_ACaseThatCannotRunIsAnErrorNotAPass` — one case on an unsupported
      surface. Assert `report.Errors` has length 1 and that the case is absent from
      `report.Totals.BenignCases`. Pins `holdout.go:283-287`.
- [ ] Write `TestScoreHoldout_EveryCatalogClassGetsARow` — assert `len(report.Detectors) >= 55` and
      that a class known to fire on nothing is present. Pins `holdout.go:269-271`.
- [ ] Run `cd Installers && go test ./cmd/ai-security-neutral/ -count=1 -v`.
- [ ] Run `cd Installers && go test ./internal/neutraleval/ -run TestHoldoutCorpusIsNotReferenced -count=1`
      and confirm it is **green** — proof your new test file did not breach the seal.

**Defeat test:** `TestScoreHoldout_RefusesAMixedLaneCorpus` — delete the `if len(laneSet) > 1` block at
`holdout.go:228-234` and it goes RED. Expected failure: the test asserts on an error and receives
`nil`, so it fails at the `if err == nil { t.Fatal(...) }` arm.

**Second defeat test, on the seal itself:** temporarily add the literal string
`neutral-corpus.holdout.jsonl` inside a comment in your new test file and run
`go test ./internal/neutraleval/ -run TestHoldoutCorpusIsNotReferencedByAnyPerPRTest -count=1`.
Expected failure text: `the SEALED holdout is referenced by per-PR test file(s) [...]`. **Remove it
again.** This proves the seal sees your file, which is the only way to know your in-memory fixture is
genuinely necessary rather than accidentally compliant.

**Exit:** `cmd/ai-security-neutral/holdout_test.go` exists, contains **3 passing tests plus 1 proven
red-on-revert**, and `TestHoldoutCorpusIsNotReferencedByAnyPerPRTest` is green with the file present.

---

## Task 2: Give every class the denominator it was actually exposed to

**Files:**
- Modify: `Installers/cmd/ai-security-neutral/holdout.go` (`:256-265` the `acc` type and `get`,
  `:295-313` the BENIGN arm, `:357-359` the corpus-wide assignment)
- Modify: `Installers/internal/aipolicycontract/detector_catalog_generated.go` **via its generator**
  (`detectorcataloggen`, per the `DO NOT EDIT` banner at `:1-2`) — add a producer-surface field
- Modify: `Installers/internal/aipolicycontract/detector_catalog_test.go` (totality assertion)
- Modify: `Installers/cmd/ai-security-neutral/holdout_test.go`

- [ ] **Step 1 — the failing test.** Add `TestScoreHoldout_FPDenominatorIsPerSurfaceExposure`: build a
      corpus of 3 `surface: dlp` BENIGN cases and 1 `surface: promptrisk` BENIGN case where a
      promptrisk class fires on the single promptrisk case. Assert the promptrisk class's row reads
      `BenignCases: 1, FalsePositives: 1, FPRate: 1.0`. Today it reads `BenignCases: 4,
      FPRate: 0.25`. Expected failure text: `BenignCases = 4, want 1`.
- [ ] **Step 2 — declare the producer surface.** Add `ProducerSurfaces []string` to
      `AiSecurityDetectorClass` (`detector_catalog_generated.go:22-36`) and populate it from the
      contract spine, **not** from `Family`. Family correlates with producer; it is not the same
      statement, and five classes (`internal-url`, `custom-blocklist`, `high-risk-file-type`,
      `image-upload`, `kubeconfig`) have no Go producer at all. Regenerate; never hand-edit.
- [ ] **Step 3 — totality guard.** In `detector_catalog_test.go`, assert every one of the 55 classes
      has a non-empty `ProducerSurfaces`, and that every value is a surface the runner dispatches
      (`internal/neutraleval/runner.go:219-263`: `dlp`, `promptrisk`, `policy`, `ingress`) or the
      explicit token `none-go` for the five browser-only classes. A class with no declared producer
      must fail the build, in the shape of `resolveToolRiskDefaults`' module-load throw.
- [ ] **Step 4 — count exposure, not the corpus.** Replace `holdout.go:357-359`. In the BENIGN arm,
      after `report.Splits`/`report.Labels` are updated, increment `get(class).benign` for every
      catalog class whose `ProducerSurfaces` contains `entry.Surface`. Delete `benignCases` as a
      per-class assignment; keep `report.Totals.BenignCases` unchanged, because the corpus-wide
      interrupt rate is a legitimate separate number.
- [ ] **Step 5 — do the same on the ATTACK side.** `AttackCasesExpecting` is already per-class and
      correct. Add `AttackCasesEligible` — attack cases on a surface this class produces — so a class
      that *could* have fired and did not is distinguishable from one that was never exposed.
- [ ] **Step 6 — regenerate `HOLDOUT_REPORT.md`.** Every `N/23` becomes `N/17` or `N/6` or UNKNOWN.
      Record the movement in the document, with the old number beside the new one and one sentence
      saying the instrument changed, not the detectors. The corpus digest does **not** change, and
      the document must say so — this is the inverse of the 2026-08-06 entry, which correctly said the
      detectors moved and the instrument did not.

**Defeat test:** `TestScoreHoldout_FPDenominatorIsPerSurfaceExposure` — restore
`byClass[class].benign = benignCases` and it goes RED with `BenignCases = 4, want 1`.

**Second defeat test:** blank one class's `ProducerSurfaces` in the generator input.
`detector_catalog_test.go` must go RED naming that class. Expected: `class %q declares no producer
surface`.

**Exit:** `HOLDOUT_REPORT.md`, regenerated from the exact rebased commit, contains **zero** occurrences
of `/23` in the per-detector table. `jailbreak-persona` reads `1/6 (16.7%)`; `db-connection-string` and
`aws-access-key` read `1/17 (5.9%)`; all six `INGRESS_RISK` classes read UNKNOWN.

---

## Task 3: UNKNOWN is not zero — on both rates

**Files:**
- Modify: `Installers/cmd/ai-security-neutral/holdout.go` (`:110-116` the rate fields, `:366-385` the
  row construction, `:432-440` the summary printer)
- Modify: `Installers/cmd/ai-security-neutral/holdout_test.go`

- [ ] **Step 1 — the failing test.** `TestScoreHoldout_ZeroExposureReportsUnknownNotZero`: a corpus
      with one dlp BENIGN case and no attack cases. Marshal the report to JSON. Assert that for a
      promptrisk class the key `fpRate` is **absent** and `fnRate` is **absent** — not `0`. Assert the
      same for `fnRate` on every dlp class. Expected failure today: `"fpRate":0` and `"fnRate":0`
      present in the encoded output.
- [ ] **Step 2 — change the field types.** `FPRate *float64` with `json:"fpRate,omitempty"` and
      `FNRate *float64` with `json:"fnRate,omitempty"` (`holdout.go:112`, `:116`). Leave
      `BenignCases`, `FalsePositives`, `AttackCasesExpecting`, `FalseNegatives`, `TruePositives`,
      `BoundaryFires` as plain ints — a count of zero **is** zero and carries no ambiguity.
- [ ] **Step 3 — bump `holdoutReportFormatVersion`.** It is `2` at `holdout.go:44` and the comment
      there records that version 2 was additive. This change is **not** additive: a consumer reading
      `fpRate` as a number now sees absence. Set it to `3` and write the same style of comment saying
      exactly which two fields changed shape and why absence is the honest value.
- [ ] **Step 4 — the summary line must say UNKNOWN.** `summarizeHoldout` at `holdout.go:436-439`
      prints `fp=%d/%d (%.1f%%)`. A nil rate must print `fp=%d/0 (UNKNOWN)`, never `0.0%`. Do not
      change the skip condition at `:433-435` — a class with no fires and no boundary hits is still
      correctly omitted from the human summary.
- [ ] **Step 5 — teach the report envelope.** Add `DetectorsWithNoExposure []string` to
      `holdoutReport` so the count is a first-class published number rather than something a reader
      must derive by scanning for absent keys.

**Defeat test:** `TestScoreHoldout_ZeroExposureReportsUnknownNotZero` — revert `FNRate` to `float64`
and it goes RED. Expected failure text: `encoded report contains "fnRate":0 for class
%q with attackCasesExpecting=0; an absent measurement must be an absent key`.

**Exit:** In the regenerated machine report, **43 of 55** classes have no `fnRate` key, and
`detectorsWithNoExposure` names them. Today all 43 print `"fnRate": 0`. The number 43 is itself a
measurement of this corpus and must be recomputed, not copied, whenever the corpus changes.

---

## Task 4: Make `--engine-version` mandatory

**Files:**
- Modify: `Installers/cmd/ai-security-neutral/main.go:23`
- Modify: `Installers/internal/neutraleval/runner.go:467-468`
- Modify: `Installers/.github/workflows/holdout-score.yml:48-52` and `:62-66`
- Modify: `Installers/internal/neutraleval/runner_test.go`

- [ ] **Step 1 — the failing test.** In `runner_test.go`, add
      `TestNormalizeOptions_RejectsAnAbsentEngineVersion`: call `normalizeOptions` with
      `EngineVersion: ""` and assert an error whose text names the flag. Today it silently returns
      `"m4.7"`. Expected failure: `err = nil, want "engineVersion of the executed engine is required"`.
- [ ] **Step 2 — the second failing test.** `TestNormalizeOptions_RejectsThePlaceholderVersion`:
      assert `EngineVersion: "m4.7"` is **also** rejected, by name. A constant that was the default for
      three months will otherwise be passed explicitly by the first person who hits the new error.
      Expected failure text: `engineVersion "m4.7" is the retired placeholder default; pass the
      version of the engine actually under test`.
- [ ] **Step 3 — remove the defaults.** `main.go:23` becomes
      `flag.String("engine-version", "", "executed engine version (required)")`; `runner.go:467-468`
      returns an error instead of assigning. Keep the `safeTokenRE` validation at `:472`.
- [ ] **Step 4 — pass a real value from CI.** Both `go run` invocations in `holdout-score.yml` gain
      `--engine-version "$(git rev-parse --short HEAD)"` — or the agent version if one is available in
      that step. Whichever is chosen, it must **move when a detector rule changes**, which a commit SHA
      does and a release tag does not always.
- [ ] **Step 5 — sweep the callers.** `MSYS_NO_PATHCONV=1 git grep -n "ai-security-neutral" origin/main`
      and update every invocation, including anything under `scripts/` and `ci/`. A missed caller now
      fails loudly rather than silently stamping a constant, which is the intended trade.

**Defeat test:** `TestNormalizeOptions_RejectsThePlaceholderVersion` — restore
`out.EngineVersion = "m4.7"` at `runner.go:468` and it goes RED, because `normalizeOptions` returns nil
error for an empty input.

**Exit:** `MSYS_NO_PATHCONV=1 git grep -c '"m4.7"' origin/main -- cmd internal` returns **0** outside
the two rejection tests. No result artifact produced after this task carries
`"engineVersion": "m4.7"`.

---

## Task 5: Widen the environment digest into a real system-under-test tuple

**Files:**
- Modify: `Installers/internal/neutraleval/contract.go:124-130` (`RunnerIdentity`), `:132-137`
  (`ResultProvenance`)
- Modify: `Installers/internal/neutraleval/runner.go:480-491` (`normalizeOptions` digest derivation),
  `:165-175` (result assembly)
- Modify: `Installers/internal/neutraleval/runner_test.go`

- [ ] **Step 1 — the failing test.** `TestEnvironmentDigestMovesWhenTheRulesetMoves`: compute the
      digest, mutate the declared ruleset digest input, recompute, assert the two differ. Today the
      digest is over `{goVersion, goos, goarch, runner}` only (`runner.go:482-487`) and does not move.
      Expected failure: `digest unchanged after ruleset change`.
- [ ] **Step 2 — widen `EnvironmentDigest`.** Add OS build, shell, and tool schema to the JCS map at
      `runner.go:482-487`. Keep the existing four keys; this is additive to the digest input and
      therefore changes the digest value once, deliberately.
- [ ] **Step 3 — add the system-under-test axes as their own fields**, not folded into one digest.
      On `RunnerIdentity`: `RulesetDigest`, `DetectorCatalogDigest`, `NormalizerVersion`,
      `ParserVersion`. On `ResultProvenance`: `EffectivePolicyDigest`. Each must be a `sha256:` or a
      version token; each must be **required**, in the shape `normalizeOptions` already uses for
      `ArtifactDigest` (`runner.go:474-478`).
- [ ] **Step 4 — source the catalog digest from the pin that exists.**
      `aipolicycontract.DetectorCatalogDigest` is already a constant
      (`detector_catalog_generated.go:13`, `sha256:b252ee02…7553`) alongside
      `DetectorCatalogSpineDigest` and `DetectorCatalogSourceCommit` (`:14`, `:16`). Read those; do
      not compute a second one.
- [ ] **Step 5 — record what is NOT covered.** In a comment beside the new fields, state that the LLM
      code-scanner lane is not executed by `neutraleval` at all and therefore needs its own
      model-version and system-prompt-version capture. Wave 7B owns that; naming it here stops it from
      being assumed covered.
- [ ] **Step 6 — do not rebuild `artifactDigest`.** Add a one-line comment at `main.go:28` pointing at
      it as the axis that already works.

**Defeat test:** `TestEnvironmentDigestMovesWhenTheRulesetMoves` — remove `rulesetDigest` from the JCS
map and it goes RED with `digest unchanged after ruleset change`.

**Second defeat test:** clear `RulesetDigest` in a runner options struct and assert `normalizeOptions`
errors, exactly as it does today for an absent `ArtifactDigest`
(`artifactDigest of the executed shipping module is required`).

**Exit:** Every `Result` produced after this task carries a **7-field** system tuple —
`engineVersion`, `artifactDigest`, `environmentDigest`, `rulesetDigest`, `detectorCatalogDigest`,
`normalizerVersion`, `parserVersion` — plus `effectivePolicyDigest` on provenance, and
`normalizeOptions` rejects a run missing any of them.

---

## Task 6: Declare an inspection budget, and give `InspectionDegraded` a consumer (P1-06)

The plan has no task for this today. It is in this wave because a rate computed over
under-inspected input is not a rate.

**Files:**
- Modify: `Installers/internal/dlp/scanall.go` (budget declaration and the completeness field)
- Modify: `Installers/internal/dlp/dlp.go:410-422` (`Result`), `:374-375` (the existing silent caps)
- Modify: `Installers/internal/toolrisk/toolrisk.go` (budget declaration; the package declares none)
- Modify: `Installers/internal/proxy/openai_downlink_inspection.go:13-21`, `:96-97`
- Modify: `Installers/internal/neutraleval/runner.go:239-251` (the `promptrisk` arm)
- Create: `Installers/internal/dlp/inspection_budget_test.go`

**What is true today.** `dlp.Result` (`dlp.go:410-422`) has `Findings`, `PrivateKeyEvidence`,
`CredentialEvidence`, `MustBlock` — **no completeness field**. Two silent caps exist:
`base64MaxRunLen = 8 * 1024` and `base64MaxRuns = 256` (`dlp.go:374-375`), consumed at `:725`,
`:748` and `:766-771`. A text with more than 256 base64 runs is under-inspected and **nothing reports
it**. `internal/toolrisk` declares no budget of any kind — `grep -nE 'maxBytes|maxItems|maxDepth|budget'`
over the package returns zero.

`OutputStreamObservation.InspectionComplete` / `.InspectionDegraded`
(`openai_downlink_inspection.go:16-17`, set at `:96-97`) have **six references repo-wide**, all in the
defining file and its test. Zero production consumers. Verify:
`MSYS_NO_PATHCONV=1 git grep -n "InspectionComplete\|InspectionDegraded" origin/main -- internal cmd`.

`internal/neutraleval/runner.go:249` hard-codes `Inspection: "COMPLETE"` for the `promptrisk` surface —
an unconditional completeness claim with nothing behind it.

- [ ] **Step 1 — the failing test.** `TestScanAll_ReportsExhaustionWhenTheBase64BudgetIsSpent`: build
      a text with more than `base64MaxRuns` decodable runs; assert `Result.Completeness.Exhausted` is
      true and `Result.Completeness.Limitations` names the budget. Expected failure today:
      `undefined: Result.Completeness`.
- [ ] **Step 2 — adopt the shape that already exists.** Model the new field on `RuleWalkCoverage`
      (`internal/inventory/aitools/aitools.go:157-181`) with its `Complete()` method (`:185-187`), and
      use the **field names already in the corpus contract** — `CompletenessRecord`
      (`internal/neutraleval/contract.go:229-233`) and `ResourceBudget` (`:266-274`). Two vocabularies
      for one question is the defect W11 names elsewhere; do not create a third.
- [ ] **Step 3 — declare the budgets.** Max bytes, max items, max depth, max wall time for
      `internal/dlp` and `internal/toolrisk`, as named constants with a written justification, in the
      style of `scanall.go:38-43`'s measured cost note (`ScanHexAtRest` 10.82 MB/s vs `ScanEx`
      0.71 MB/s, full depth ≈6.5% more than `ScanEx`).
- [ ] **Step 4 — give `InspectionDegraded` a production consumer.** A degraded inspection must not
      earn a clean allow. Route it into the decision path so the outcome is hold or restricted. Wave 8
      owns the authoritative checkpoint; this task owns making the signal *reachable* and proving a
      degraded stream cannot resolve to allow.
- [ ] **Step 5 — delete the unconditional COMPLETE.** `runner.go:249` must derive its value the way the
      `dlp` arm does at `:236` via `inspectionFromDecision` (`runner.go:509-519`), or report `UNKNOWN`.
      A hard-coded `"COMPLETE"` is a claim, and this wave exists to stop those.
- [ ] **Step 6 — carry completeness into the report.** Add `inspectionCompleteness: {complete,
      degraded, denominatorUncertainty}` to `holdoutReport`. A run with any degraded case cannot
      publish a clean rate.

**Defeat test:** `TestScanAll_ReportsExhaustionWhenTheBase64BudgetIsSpent` — set the exhaustion flag
unconditionally to false and it goes RED with `budget spent (257 runs > 256) but Exhausted=false`.

**Second defeat test:** feed a truncated downlink stream and assert the decision is not `allow`.
Remove the `InspectionDegraded` consumer added in Step 4 and it goes RED — that is the whole point of
the step, because today removing it changes nothing.

**Exit:** `internal/dlp` and `internal/toolrisk` each declare **4** budget dimensions with named
constants. `InspectionDegraded` has **at least 1** production consumer, provable by
`git grep -n "InspectionDegraded" -- internal | grep -v _test.go | grep -v openai_downlink_inspection.go`
returning a non-empty result. `runner.go` contains **0** hard-coded `Inspection: "COMPLETE"`.

---

## Task 7: Replace the three-field shadow with a per-class lane record

**Files:**
- Create: `Installers/internal/daemon/ai_lane_shadow.go` (replaces v1's `ai_tool_shadow.go`)
- Create: `Installers/internal/daemon/ai_lane_shadow_test.go`
- Modify: `Installers/internal/daemon/server.go` near `:453` (the `NewServer` seeding site)

- [ ] **Step 1 — the failing test.** `TestLaneShadow_AgreementAdvancesThePerClassDenominator`: observe
      two agreements on class `X` and one delta on class `X`. Assert the class row reads
      `candidateTriggers: 3, agreements: 2, deltas: 1`. v1's store cannot express this: an agreement
      returns before the record is kept (`plan:5103-5105`), so the class context is discarded.
      Expected failure: `undefined: laneShadowStore`.
- [ ] **Step 2 — the record shape.** One row per `(lane, classId)`, carrying: `lane`, `classId`,
      `catalogDigest`, `eligible`, `candidateTriggers`, `activeTriggers`, `agreements`, `deltas`,
      `unknown`, `dropped`, `uniqueSessions`, `uniqueEndpoints`, `windowStart`, `windowEnd`, the
      version tuple from Task 5, and `adjudication`. **`eligible` is the denominator** and it is
      per-class, not per-store.
- [ ] **Step 3 — keep what v1 got right.** The `maxToolShadowDeltas = 500` cap with an explicit
      `dropped` counter (`plan:5034`, `:5106-5112`), and the rule that the **new** record is dropped
      rather than an old one evicted — evicting rewrites the history a reader is about to draw a
      conclusion from. Keep the local-only `0o600` file and the `hookFireStore` pattern.
- [ ] **Step 4 — the seeding trap.** Seed from `NewServer` (`server.go:365`, seeding site at `:453`),
      **not** `Start`, matching `hookFires`. Write the test that proves it: construct the server, then
      assert the store's persist directory is the one you passed. A test that seeds before
      constructing has its directory silently replaced.
- [ ] **Step 5 — behaviour invariance.** Assert the shadow cannot change an outcome: run the same tool
      call with the shadow armed and disarmed and assert byte-identical decisions. This is v1's Task 3
      and it was correct.
- [ ] **Step 6 — the redaction re-scan, at full depth.** Carry v1's `toolShadowSafeText` re-scan
      guard, with `dlp.Scan` replaced by **`dlp.ScanAll`** at both call sites (`plan:5780`, `:5789`).
      Correct the three stale citations in the surrounding comments (`plan:5690`, `:5773`, and the
      read-first list at `plan:5638`) to `internal/dlp/dlp.go:1479-1481`. The guard's logic is right
      and stays: every span the engine finds in the ORIGINAL must be absent from the OUTPUT, and the
      output must not itself scan as carrying a secret; otherwise store nothing.

**Defeat test:** `TestLaneShadow_AgreementAdvancesThePerClassDenominator` — make `observe` return early
on `active == candidate` without recording, exactly as `plan:5103-5105` does, and it goes RED with
`candidateTriggers = 1, want 3`.

**Second defeat test:** replace one `dlp.ScanAll` with `dlp.Scan` in the new daemon file and run
`node ci/lib/run.mjs Installers pr-checks:scanner-parity`. Expected RED at
`scan_depth_guard_test.go:140`: `these surfaces reach internal/dlp through a PARTIAL detector set`.
**Do not add a `narrowCallExemptions` entry to make this green** — the exemption map has exactly one
member and a measurement surface is not a candidate for the second.

**Exit:** the shadow store emits **one row per (lane, classId)** with a non-empty `eligible` count,
and `grep -c '"observed"' ai_lane_shadow.go` returns 0 — the single global counter is gone.

---

## Task 8: Four declared lane seams, each with its own denominator

`plan:9397` gates the prompt promotion "on the Wave 3 decision-level shadow and on nothing else."
That sentence is deleted here; Wave 4C gates on lane A below.

**Files:**
- Create: `Installers/internal/neutraleval/lanes.go` (the seam declarations)
- Modify: `Installers/internal/neutraleval/ingress.go:58-71` (`LaneOf` and the lane constants)
- Modify: `Installers/internal/neutraleval/runner.go:219-263` (`execute` dispatch)
- Create: `Installers/internal/neutraleval/toolrisk.go` + `toolrisk_test.go` (v1 Task 5, preserved)
- Modify: `Installers/cmd/ai-security-neutral/holdout.go:46-51` (lane re-exports)

Four seams. Each declares, in code and in the report: **eligibility**, **denominator**,
**candidate/active decision**, **user-visible outcome**, **security outcome**, **runtime/version
cohort**, **freshness**.

| Lane | Code under measurement | Instrument that exists today | Denominator today |
|---|---|---|---|
| **A — prompt egress policy decision** | `policyeval.Decide` via `runner.go:239-251` | `neutral-corpus.holdout.jsonl`, `surface: promptrisk` | **6 BENIGN / 5 ATTACK** |
| **B — ingress / tool-result redaction** | `proxy.RedactIngressText` via `executeIngress` (`runner.go:254-257`) | `neutral-corpus.ingress.jsonl` | **18 BENIGN / 8 ATTACK** |
| **C — tool-call policy** | `toolrisk.Scan` + `defaultToolDecision` | **none — this is the gap** | 0 |
| **D — LLM code-scanner advisory** | not executed by `neutraleval` at all | **none** | 0 |

- [ ] **Step 1 — the failing test.** `TestLaneSeams_EveryDeclaredLaneNamesItsDenominator`: table-drive
      the four seams and assert each declares a non-nil eligibility predicate and a denominator source.
      Lanes C and D must fail with an explicit `NOT_INSTRUMENTED` value, **not** with a zero.
- [ ] **Step 2 — build lane C.** This is v1 Task 5 preserved: add a `toolrisk` surface to
      `runner.go`'s dispatch and to `LaneOf`, add `internal/neutraleval/toolrisk.go`, and extend
      `validateEntry` and `projection.go`'s `requestedEffect`. v1's file list at `plan:5871-5882` is a
      good starting point; re-resolve every line number against current `origin/main` before using it.
- [ ] **Step 3 — the tool lane needs catalog rows before it can be scored.**
      `detector_catalog_generated.go` contains **zero** tool-risk classes; verify with
      `MSYS_NO_PATHCONV=1 git show "origin/main:internal/aipolicycontract/detector_catalog_generated.go" | grep -c 'destructive-rm\|privilege-escalation\|dynamic-eval'`
      → `0`, while `parity-vectors/toolrisk-classes.v1.json` declares `"classCount": 40`. Without
      catalog rows every tool class scores as `Lifecycle: "UNCATALOGED"` (`holdout.go:196-201`). Extend
      the spine and regenerate; do not special-case the scorer.
- [ ] **Step 4 — lane D is declared, not built.** Record it as `NOT_INSTRUMENTED` with a named owner
      and the packet that will build it (Wave 7B). **Blocked, external:** it needs the exact release
      model and system prompt of every enabled Anthropic/Gemini route, which is a vendor-artifact
      dependency this wave does not control. Its certificate contribution is `UNKNOWN`, never zero.
- [ ] **Step 5 — delete the wrong gate sentence.** Remove `plan:9397`'s "on the Wave 3 decision-level
      shadow and on nothing else" and replace it with a reference to lane A's report. Fix the
      justification at `plan:9390-9396`, which counts promptrisk cases in the wrong file.

**Defeat test:** `TestLaneSeams_EveryDeclaredLaneNamesItsDenominator` — give lane D a denominator of
`0` instead of `NOT_INSTRUMENTED` and it goes RED with `lane D reports a zero denominator; an
uninstrumented lane is UNKNOWN, never zero`.

**Second defeat test:** feed a corpus mixing lane A and lane C entries into `scoreHoldout`. It must
refuse, in the same shape as the existing INGRESS/EGRESS refusal (`holdout.go:222-238`). **That
existing refusal already works and is the pattern to copy**, so this defeat test proves the new lane
constants were added to `laneSet` rather than bypassing it.

**Exit:** `neutral-corpus.toolrisk.jsonl` exists and lane C reports a per-class FP denominator over a
stated number of benign cases. Lanes A and B report against **6/5** and **18/8** respectively. Lane D
reports `NOT_INSTRUMENTED` with a named owner. **Certificate contribution for lanes C and D:
`UNKNOWN`** until their corpora are built, and lane C's corpus size is Wave 3B's benign-replay
programme, not this wave's.

---

## Task 9: Produce the report `plan:9568` tells the implementer to open

**Files:**
- Create: `Installers/cmd/ai-lane-shadow-report/main.go`
- Create: `Installers/cmd/ai-lane-shadow-report/main_test.go`
- Modify: `Installers/.github/workflows/holdout-score.yml` (an additional scoring step)

- [ ] **Step 1 — the failing test.** `TestShadowReport_RefusesAStoreWithDroppedRecords`: build a store
      snapshot with `dropped > 0` and assert the report's `status` is `UNKNOWN` and that a promotion
      helper returns `false`. Expected failure: `undefined: cmd/ai-lane-shadow-report`.
- [ ] **Step 2 — read the local store, render the report.** One row per `(lane, classId)`. Same field
      names as Task 7's record. Same lane-mixing refusal as `scoreHoldout`.
- [ ] **Step 3 — the promotion predicate lives here, not in prose.** Export a single function that
      answers, for one class: eligible-denominator present, zero developer-visible deltas, no dropped
      records, no store error, no version mismatch, window not stale. Wave 4C calls it. `plan:9568`'s
      "open the report and find this class" becomes a function call with a defeat test.
- [ ] **Step 4 — wire it into the nightly job** alongside the two existing scoring steps
      (`holdout-score.yml:48-52`, `:62-66`), and add its output to the artifact upload list at `:80-89`.

**Defeat test:** `TestShadowReport_RefusesAStoreWithDroppedRecords` — make the predicate ignore
`dropped` and it goes RED with `promotion allowed with dropped=3; a lossy window is UNKNOWN`.

**Exit:** `grep -rn "shadow report" M47A_IMPLEMENTATION_PLAN.md` resolves to a **named binary with a
test**, not to one unimplemented sentence. `cmd/ai-lane-shadow-report` exists and
`node ci/lib/run.mjs Installers holdout-score:score` uploads its output.

---

## Task 10: The invalidation rule, as a shared function rather than six copies

**Files:**
- Create: `Installers/internal/neutraleval/invalidation.go`
- Create: `Installers/internal/neutraleval/invalidation_test.go`
- Modify: `Installers/cmd/ai-security-neutral/holdout.go` (`scoreHoldout` return path)
- Modify: `Installers/cmd/ai-lane-shadow-report/main.go`

Any one of these makes a measurement `UNKNOWN`, never green:

1. `dropped > 0`
2. any store error
3. any catalog digest mismatch against `aipolicycontract.DetectorCatalogDigest`
4. any version-tuple mismatch inside one report (Task 5's seven fields)
5. a stale window — `windowEnd` older than a declared freshness bound
6. any cross-lane record in a single-lane report
7. **any class with a zero eligible denominator** (Task 2/3)
8. **any degraded inspection in the run** (Task 6)

- [ ] **Step 1 — the failing test.** `TestInvalidation_EachTriggerForcesUnknown` — a table with one
      row per trigger above, each asserting `status == UNKNOWN` and a `reason` naming the trigger.
      Eight rows, eight distinct reason strings. Expected failure: `undefined: Invalidate`.
- [ ] **Step 2 — one implementation, called from both report producers.** A second copy will drift;
      that is the defect `ScanAll` exists to prevent in the DLP package and the same reasoning applies.
- [ ] **Step 3 — `UNKNOWN` must be terminal.** No caller may coerce it to a rate, a zero, or a pass.
      Assert it: `TestInvalidation_UnknownCannotBeCoercedToARate`.
- [ ] **Step 4 — the summary printer says so.** `summarizeHoldout` (`holdout.go:408-442`) must lead
      with the invalidation reason when one is present, before any number. A reader who quotes a
      number out of a summary must not be able to quote one from an invalid run.

**Defeat test:** `TestInvalidation_EachTriggerForcesUnknown` — remove any single trigger from the
switch and exactly one table row goes RED, naming it. Expected: `trigger %q did not force UNKNOWN`.

**Exit:** **8 of 8** triggers force `UNKNOWN`, each proven by its own table row and each named in the
failure text. One implementation, two callers, zero copies.

---

## Task 11: The `holdout-score.yml` regression — OWNER DECISION, not an engineering call

**Files:**
- Modify: `Installers/.github/workflows/holdout-score.yml:6` (the header), `:22-25` (`on:`)

**This task cannot be completed by an engineer.** The `push` trigger was removed on 2026-08-25
(`cd657c77`) as a deliberate cost gate by owner decision, after GitHub billed roughly $600 for July
2026. Restoring it spends money. Not restoring it leaves detector quality on a nightly non-gating
report. Both are defensible; neither is mine to choose.

**What is unambiguously a defect and must be fixed either way:** the header at `:6` reads
*"This runs on PUSH TO MAIN and NIGHTLY"* while `on:` at `:22-25` is `workflow_dispatch` plus
`schedule: '17 3 * * *'`. That is a live self-contradiction in shipped source and it is exactly the
"obscure event records / accountability opacity" failure class this workspace keeps repeating.

- [ ] **Step 1 — fix the header regardless of the decision.** Make `:6` describe the actual triggers,
      and cross-reference the cost-gate note at `:18-21` which already explains why.
- [ ] **Step 2 — put the decision to the owner, in plain terms.**
      - **Option A — restore `push:` on `main`.** Detector quality gates on merge. Costs one
        ubuntu-latest job per push to `main`. The job is Go-only with `cache: true`; measure the real
        figure with `node ci/lib/drift.mjs --cost` before quoting one.
      - **Option B — write the decision down.** Detector quality is a nightly, non-gating report. Then
        the compensating control must be named: the local mirror runs it for free, and every promotion
        PR must attach its output. `ci/gates.json` already mirrors `holdout-score:score`, so
        `node ci/lib/run.mjs Installers holdout-score:score` is available today at zero cost.
      - **Option C — the middle.** Keep the nightly, and add a **required attachment** rule: no
        promotion PR merges without a locally-produced report from the exact commit. This is the only
        option that costs nothing and still gates, and it is the one to recommend.
- [ ] **Step 3 — record the decision in the file itself**, in the style of the existing cost-gate note,
      naming the date and the person. A decision that lives only in a chat log regresses.
- [ ] **Step 4 — the same question, once, for `vendored-upstream-drift.yml`.** Its own written
      instruction — *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the SAME change that
      re-vendors the files"* — was not followed; T-M2 landed (`MANIFEST.json` pin = `254d24fc`). That
      belongs to Wave 5, and it is named here only so the two are decided together rather than
      separately.

**Defeat test:** none is possible for the trigger half — a workflow trigger cannot be unit-tested. For
the header half: `TestHoldoutWorkflowHeaderMatchesItsTriggers` in
`internal/neutraleval/holdout_seal_test.go`'s package — parse the YAML, extract the `on:` keys, and
assert the first 20 comment lines do not name a trigger that is absent. Revert the header to
"PUSH TO MAIN" and it goes RED with `header claims trigger %q which on: does not declare`.

**Exit criterion — BLOCKED, external dependency: owner decision on GitHub Actions spend.**
The header test is not blocked and ships regardless: **1 new test, proven red on revert.** The trigger
state is recorded as `DECIDED: <A|B|C> by <owner> on <date>` in the workflow file, or the wave's
certificate contribution for "detector quality is gated" stays **UNKNOWN**.

---

## Wave exit criteria

Each is a number or a named artifact, measured with the local Docker mirror
(`node ci/lib/run.mjs Installers`) because `pr-checks.yml` has no automatic GitHub trigger.

1. **`cmd/ai-security-neutral/holdout_test.go` exists with ≥ 8 tests**, and
   `go test ./internal/neutraleval/ -run TestHoldoutCorpusIsNotReferencedByAnyPerPRTest` is green with
   that file present. *Defeat: `TestScoreHoldout_RefusesAMixedLaneCorpus`, revert `holdout.go:228-234`.*
2. **Zero occurrences of `/23` in the regenerated `HOLDOUT_REPORT.md` per-detector table.**
   `jailbreak-persona` reads `1/6`, `db-connection-string` and `aws-access-key` read `1/17`, the six
   `INGRESS_RISK` classes read UNKNOWN. *Defeat:
   `TestScoreHoldout_FPDenominatorIsPerSurfaceExposure`, restore `holdout.go:357-359`.*
3. **43 of 55 classes carry no `fnRate` key** in the machine report, and `detectorsWithNoExposure`
   names them. The 43 is recomputed from the corpus, never copied. *Defeat:
   `TestScoreHoldout_ZeroExposureReportsUnknownNotZero`, revert `FNRate` to `float64`.*
4. **`git grep -c '"m4.7"' -- cmd internal` returns 0** outside the two rejection tests, and no result
   artifact carries `"engineVersion": "m4.7"`. *Defeat:
   `TestNormalizeOptions_RejectsThePlaceholderVersion`, restore `runner.go:468`.*
5. **Every `Result` carries a 7-field system tuple** plus `effectivePolicyDigest`, and
   `normalizeOptions` rejects a run missing any of them. *Defeat:
   `TestEnvironmentDigestMovesWhenTheRulesetMoves`, remove `rulesetDigest` from the JCS map.*
6. **`internal/dlp` and `internal/toolrisk` each declare 4 budget dimensions**, and
   `InspectionDegraded` has ≥ 1 production consumer outside its defining file and test. `runner.go`
   contains 0 hard-coded `Inspection: "COMPLETE"`. *Defeat:
   `TestScanAll_ReportsExhaustionWhenTheBase64BudgetIsSpent`.*
7. **The shadow store emits one row per `(lane, classId)`** with a per-class `eligible` count, and the
   single global `observed` counter is gone. *Defeat:
   `TestLaneShadow_AgreementAdvancesThePerClassDenominator`, restore v1's early return.*
8. **The scan-depth guard is green with the new daemon file present**, proven by driving it red first:
   swap one `dlp.ScanAll` for `dlp.Scan` and see `scan_depth_guard_test.go:140`
   `these surfaces reach internal/dlp through a PARTIAL detector set`. **`narrowCallExemptions` still
   has exactly 1 entry.**
9. **Lanes A and B report against 6/5 and 18/8**; lane C reports a per-class denominator over
   `neutral-corpus.toolrisk.jsonl`; **lane D reports `NOT_INSTRUMENTED` with a named owner.**
   *Defeat: `TestLaneSeams_EveryDeclaredLaneNamesItsDenominator`, give lane D a zero.*
10. **`cmd/ai-lane-shadow-report` exists and is exercised by `holdout-score:score`**, and the promotion
    predicate is a function with a test rather than a sentence at `plan:9568`. *Defeat:
    `TestShadowReport_RefusesAStoreWithDroppedRecords`.*
11. **8 of 8 invalidation triggers force `UNKNOWN`**, one implementation, two callers, each trigger
    named in its own failure text. *Defeat: `TestInvalidation_EachTriggerForcesUnknown`, remove any
    one trigger.*
12. **`holdout-score.yml:6` describes the triggers it actually has**, pinned by
    `TestHoldoutWorkflowHeaderMatchesItsTriggers`. *Defeat: restore "PUSH TO MAIN" to the header.*

### Criteria this wave cannot measure, and what they need

- **Lane C's false-positive rate.** Lane C is instrumented here; its **denominator is not built here**.
  Today's tool-lane benign corpus is `parity-vectors/command-expansion.json` at **51 benign rows**,
  which supports a bound of **≤ 5.70%** and is not zero-error — one benign hard block survives. Tier A
  needs **29,956** zero-error benign enforcing-eligible opportunities, stratified six ways (4,993 per
  stratum, clearing the 4,785 Holm requirement at K=6). **Certificate contribution: `UNKNOWN`.**
  **Blocked, external: this is a consented data-collection programme measured in months, not an
  engineering task.** It belongs to Wave 3B. Near-duplicate mutations and retries do not count toward
  it and the gate must reject them.
- **Lane D entirely.** `neutraleval` does not execute the LLM code-scanner lane. **Certificate
  contribution: `UNKNOWN`. Blocked, external: vendor-artifact dependency** — it needs the exact release
  model and system-prompt version of every enabled Anthropic and Gemini route. Owned by Wave 7B.
- **Whether detector quality gates on merge.** **Blocked, external: owner decision on GitHub Actions
  spend** (Task 11). Until it is recorded in the workflow file, the "detector quality is gated"
  contribution is **`UNKNOWN`**, and Option C — a required locally-produced report attached to every
  promotion PR — is the recommendation because it costs nothing and still gates.
- **The producer-surface map for all 55 catalog classes.** Families were enumerated and six classes
  were spot-resolved by hand this pass; the full map was not machine-resolved. Task 2 Step 2 must run
  the discovery command in the context section and populate the field from the contract spine, and
  Step 3's totality guard is what makes an unresolved class a build failure rather than a silent
  `fp=0/23` row.
