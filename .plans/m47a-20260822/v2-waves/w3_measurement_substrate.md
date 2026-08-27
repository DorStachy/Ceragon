# Wave 3 — Repair the measurement instrument, then give every lane a denominator

**Depends on:** Wave −1 (rebase, citation repair, the `ScanAll` correction), Wave 2 (the evidence-grade
fields on `toolrisk.Finding`, which Task 7 carries onto the wire). Wave 0A and Wave 1 may run in
parallel; nothing here blocks them.
**Runs before:** **Wave 3B Task 3.** Its `metrics.byClassRepresentationSurface[]` rows are populated
from the per-class exposure counters Task 2 builds here. Emitting that report first publishes the
corpus-wide denominator into a schema-validated artifact, which is the exact defect this wave removes.
**Implements decisions:** D3, D4 (amended — lane-specific, not tool-only), D5, D6 (rewritten), **D18**.

**The split with Wave 3B, stated once so nothing is built twice.** This wave owns the *denominator*
and the *honesty of an absent measurement*: per-surface exposure, `UNKNOWN`-not-zero on both rates,
the package-level inspection budget, the four lane seams, the per-class shadow record, and the shared
invalidation rule. **Wave 3B owns the whole version-identity axis** — making `--engine-version`
mandatory (3B Task 1) and widening the environment digest into the system tuple (3B Task 2). Two tasks
that used to live here, old Task 4 and old Task 5, are deleted below with pointers; **their numbers are
kept as headstones** so every cross-reference in the other nine files still lands.

**Certificate impact:** the **measurement-substrate integrity** dimension is `UNKNOWN` until this wave
passes, and so is every `metrics` block in every certificate. Concretely: `metrics.falsePositiveRate`,
`metrics.recall`, `metrics.unknownRate` and `metrics.inspectionCompleteness` stay `null` for every lane,
and no class may be promoted anywhere in Waves 4A/4B/4C/7B on a number this instrument produced.
`system.engineVersion` stays invalid until **Wave 3B Task 1** lands — this wave does not repair it and
must not report it repaired. D18 is not advisory: **every rate this product has ever published was
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

`scoreHoldout` seeds a row for every catalog class (`:269-271`). Some of those classes cannot be
emitted by the Go engine at all, and they still print `fp=0/23` in a report about the Go engine.

**Re-measured 2026-08-28 against `5b129523`, because an earlier count of "five" was wrong** — and the
wrong version of this paragraph would have pushed two live DLP classes into a producer-less bucket and
deleted two real denominators:

| Class | Go producer on `origin/main` |
|---|---|
| `internal-url` | **yes** — registered at `internal/dlp/registry.go:186` |
| `kubeconfig` | **yes** — registered at `internal/dlp/registry.go:187` |
| `custom-blocklist` | **yes, but outside the three detector packages** — `policyeval.BlocklistClass` at `internal/policyeval/policyeval.go:54`, rendered at `internal/proxy/ai_synth.go:64` |
| `high-risk-file-type` | **no** — catalog and spine only |
| `image-upload` | **no** — catalog, spine and `detector_catalog_test.go` only |

The true count is **two** with no Go producer at all, plus one that is policy-synthesised rather than
detected. Reproduce:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
for c in internal-url custom-blocklist high-risk-file-type image-upload kubeconfig; do
  printf '%-22s ' "$c"
  MSYS_NO_PATHCONV=1 git grep -ln "\"$c\"" origin/main -- internal | grep -v _test | tr '\n' ' '; echo
done
```

The 55 classes carry a `Family` (13 distinct: `CREDENTIAL` 21, `PROMPT_INJECTION` 10, `INGRESS_RISK` 6,
`JAILBREAK` 4, `HEURISTIC` 3, `UPLOAD` 2, `PRIVATE_KEY` 2, `FINANCIAL_DATA` 2, and one each of
`TOPOLOGY`, `POLICY_SYNTHESIZED`, `PERSONAL_DATA`, `DATABASE_URI`, `CONFIGURATION`) but
`AiSecurityDetectorClass` (`detector_catalog_generated.go:22-36`) has **no producer or surface field**.
Family correlates with producer but is not the same statement and must not be assumed to be.
Discovery command for the full producer map, which was not machine-resolved this pass. **Search
`internal/policyeval` and `internal/proxy` too, not only the three detector packages** — restricting
the sweep to `internal/dlp internal/promptrisk internal/ingressrisk` is what mislabelled
`custom-blocklist` as producer-less:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
for c in $(MSYS_NO_PATHCONV=1 git show "origin/main:internal/aipolicycontract/detector_catalog_generated.go" \
           | grep -oE 'ClassID: "[a-z0-9-]+"' | sed 's/ClassID: "//; s/"//'); do
  printf '%-38s %s\n' "$c" "$(MSYS_NO_PATHCONV=1 git grep -ln "\"$c\"" origin/main -- internal/dlp internal/promptrisk internal/ingressrisk internal/policyeval internal/proxy | grep -v _test | tr '\n' ' ')"
done
```

### Defect 3 — every result ever produced carries a version stamp that cannot move (REPAIRED IN WAVE 3B)

**This defect is the evidence for D18 and it is NOT repaired in this wave.** `--engine-version` is
made mandatory by **Wave 3B Task 1**; the environment digest and the system tuple are widened by
**Wave 3B Task 2**. It is measured here because every exit number below is invalid until those land,
and because an engineer who trips over the constant while building Task 2 needs to know it already has
an owner and must not fix it twice.

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
run without it (`runner.go:475-479`).

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

`plan:9398` gates the six-class prompt promotion *"on the Wave 3 decision-level shadow and on nothing
else"*, and `plan:9391-9396` justifies it by counting five `promptrisk` cases in
`neutral-corpus.all.jsonl`. That count is right for `all.jsonl` — measured, `all.jsonl` carries 1
ATTACK + 3 BENIGN + 1 BOUNDARY on `surface: promptrisk` — and it is the wrong file.

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
justification is also stale: it cites the `dlp.go:1518-1520` range in four places (`plan:4617`,
`:5638`, `:5690`, `:5773`) and `dlp.go` is **1510 lines**. The real citation is `Redact` at `internal/dlp/dlp.go:1479`
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
whose version stamp is a constant**. Both halves have owners outside this wave and neither is an
engineering call this wave may take: the **header truth and the trigger decision belong to Wave −1
Task 5** (see this file's Task 11 headstone), and the **constant version stamp belongs to Wave 3B
Task 1**. This section is the measurement, not the fix.

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

These three bullets carried v1's line numbers verbatim and **every daemon line number in them was
stale** — v1 was written roughly 1,010 commits ago. The *facts* held; the citations did not. All four
files below were re-resolved against `origin/main` `5b129523` on 2026-08-28. Re-resolve again if your
`git fetch` moves the tree, and prefer the symbol search to the number.

- **`hookFires.seedFromDisk(secPaths.ConfigDir)` at `internal/daemon/server.go:491` sits inside
  `NewServer` (`server.go:396`, which runs to `:801`), not inside `Start`.** Every daemon test helper —
  `newAIServer` (`ai_handlers_test.go:83`), `newAIServerAtPaths` (`ai_session_continuation_test.go:40`)
  — calls `NewServer`. A store seeded there is armed by construction, so a test that seeds *before*
  constructing the server has its persist directory silently replaced. *(v1 said `:453` inside a
  `NewServer` at `:365`; both are stale.)*
- **`security.RecordEvents` (`internal/security/events.go:37-46`) is SOC-visible by construction** —
  it writes the hash-chained tamper log (`appendTamperLog`, `:44`) *and* `appendEventQueue` (`:45`),
  which the heartbeat uploads. D5's "surfaces nothing" rules it out as the shadow sink. Use a
  local-only `0o600` file in the `hookFireStore` pattern
  (`internal/daemon/observed_runtime.go:201` the type, `:426` `seedFromDisk`, `:298` `persistLocked`).
- **Privacy on capture:** reuse `redactedToolInputView` (`internal/daemon/ai_handlers.go:4072`), an
  allowlist of **exactly seven** safe scalar keys (`:4081-4084` — `permission_mode`, `dry_run`,
  `recursive`, `timeout`, `limit`, `offset`, `sandbox`), with `typedSecretMarkers` (`:4143`). *(v1's
  `:3843`, `:3853-3856` and `:3914` are all stale by roughly 230 lines.)* Discovery:
  `MSYS_NO_PATHCONV=1 git grep -n "func redactedToolInputView\|func typedSecretMarkers" origin/main -- internal/daemon`.
- **The ratchet-with-a-banked-baseline idiom already exists twice in-workspace** —
  `Static-Worker/corpus/campaign-lib.cjs:364` `diffCatchBaseline` with
  `corpus/artifact-fixtures/CATCH_BASELINE.json`, and `measuredMentionFires = 6` at
  `internal/toolrisk/zz_c12_mention_fp_test.go:101`. Copy it; do not invent a third shape.

### Scope boundary

v1's Wave 3 Task 8 (`plan:7147-7413`, the Static-Worker benign gate and its ecosystem-blind TP
predicate) **moves to Wave 7B** with the rest of the P1-04 corpus contract. It is not orphaned and it
is not in this wave. **v1's** Task 5 — connecting `internal/toolrisk` to the harness that already computes
rates — is **preserved** and becomes Task 8 lane C here (v1's numbering; this file's own Task 5 is a
headstone pointing at Wave 3B Task 2, and the two are unrelated); its instinct ("use the scorer that exists")
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
- [ ] **Step 2 — declare the producer surface. READ THE SPINE TRAP BEFORE YOU BUDGET THIS STEP.**
      Add `ProducerSurfaces []string` to `AiSecurityDetectorClass`
      (`detector_catalog_generated.go:22-36`) and populate it from the contract spine, **not** from
      `Family`. Family correlates with producer; it is not the same statement — see Defect 2b for the
      re-measured producer table. Regenerate; never hand-edit a `DO NOT EDIT` file.

      **The trap, stated in full by Wave 3B Task 3 and true here unchanged: the spine is generated
      upstream and is not editable in this workspace.**
      `internal/aipolicycontract/detector-catalog-consumer-pin.v1.json` pins it to
      `@ceragon/shared-contracts` 0.7.0, canonical generator `ceragon-ai-security-contract-spine`
      v1.0.0, `sourceCommit 1bc26573…`, and three vendored copies are byte-identical at
      `sha256:4abd98c3…e245` (`Backend/packages/shared-contracts/generated/ai-security/0.7.0/`,
      `Installers/internal/aipolicycontract/embedded/0.7.0/`,
      `Installers/browser-extension/generated/ai-security/0.7.0/`). So adding one field to
      `AiSecurityDetectorClass` is **a shared-contracts change, plus a regeneration, plus three
      re-vendorings, plus two `detector-catalog-consumer-pin.v1.json` updates**, sequenced
      Backend-before-agent. It is a cross-repo change, not a one-file edit. Budget it as one.

      **Certificate contribution if that sequencing is not budgeted this release: `UNKNOWN`, never
      zero.** The step is then satisfied by an in-repo companion map beside the generated catalog
      rather than a spine field — same totality guard in Step 3, same denominators in Step 4 — and the
      regenerated report must name which of the two produced its surfaces.
- [ ] **Step 3 — totality guard.** In `detector_catalog_test.go`, assert every one of the 55 classes
      has a non-empty `ProducerSurfaces`, and that every value is either a surface the runner
      dispatches (`internal/neutraleval/runner.go:219-263`: `dlp`, `promptrisk`, `policy`, `ingress`)
      or one of exactly two explicit tokens: **`none-go`** for the **two** classes with no Go producer
      at all (`high-risk-file-type`, `image-upload`), and **`policy-synthesized`** for
      `custom-blocklist`, which is produced by `internal/policyeval/policyeval.go:54` rather than by a
      detector package. **Do not put `internal-url` or `kubeconfig` in either bucket** — they are
      registered DLP classes at `internal/dlp/registry.go:186-187`, and bucketing them would delete
      two real denominators while looking like a cleanup. A class with no declared producer must fail
      the build, in the shape of `resolveToolRiskDefaults`' module-load throw.
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
of `/23` in the per-detector table, and every published rate carries a per-surface denominator: `/6`
for `promptrisk`, `/17` for `dlp`, UNKNOWN for all six `INGRESS_RISK` classes.

**The numerators are a PRE-WAVE-4A BASELINE SNAPSHOT, not a standing exit value.** At the moment this
task lands, `jailbreak-persona` reads `1/6 (16.7%)` and `db-connection-string` and `aws-access-key`
read `1/17 (5.9%)`. **Wave 4A Task 2 closes `qa-fp-detections-finding-name`, which *is* the
`jailbreak-persona` false positive** (`HOLDOUT_REPORT.md:110`), so after 4A that row is `0/6` and a
re-run against a literal `1/6` would go red on a fix. Record the three values in the document as
*"denominator repaired, detectors unmoved, measured at `<sha>`"*. The standing criterion is the shape,
never the numerator.

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
- [ ] **Step 3 — bump `holdoutReportFormatVersion`. THIS WAVE OWNS THE BUMP TO 3.** It is `2` at
      `holdout.go:44` and the comment at `:42-43` records that version 2 was additive. **This change
      is not additive.** `FPRate` and `FNRate` become `*float64` with `omitempty`, so a consumer
      reading `fpRate` as a number now sees absence. That is a breaking shape change, and version 3's
      comment must say so in those words.

      **Coordinate that comment with Wave 3B Task 1, which adds a `System` block to the same
      envelope and also bumps to 3.** 3B's block genuinely *is* additive — every version-2 field
      unchanged — and it **rides on top of this breaking bump**: it either lands inside version 3 or
      bumps to 4. Whichever of the two commits lands second **appends to the ledger rather than
      rewriting it**, so the file never carries two version-3 notes that contradict each other about
      whether 3 was additive. Write it as a numbered ledger in the style already at `:42-43`:
      *"3 — BREAKING: `fpRate`/`fnRate` are absent rather than 0 on a zero denominator (Wave 3
      Task 3). Additive within 3: the `system` block (Wave 3B Task 1)."*
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

## Task 4: Make `--engine-version` mandatory — MOVED

**Owned by Wave 3B Task 1.**

*(Reconciliation D-1. This task and Wave 3B Task 1 specified the same two assertions against the same
three files — `cmd/ai-security-neutral/main.go:23`, `internal/neutraleval/runner.go:467-468`, and both
scorer invocations in `.github/workflows/holdout-score.yml` at `:48-52` and `:62-66` — under two
different sets of test names. Version identity is Wave 3B's entire subject, so it owns the change.)*

Do **not** re-specify it here and do **not** add a second pair of tests under this file's retired
names (`TestNormalizeOptions_RejectsAnAbsentEngineVersion`,
`TestNormalizeOptions_RejectsThePlaceholderVersion`). Wave 3B Task 1's names are
`TestNormalizeOptionsRejectsAbsentEngineVersion` (in `runner_test.go`) and `TestEngineVersionM47IsRejected`
(in `main_test.go`), and its exit criterion 1 is the measurement.

**What this wave still depends on:** every number below is invalid while the stamp is the constant
`"m4.7"` (D18). See wave exit criterion 4, which is now an inherited reference rather than a
measurement this wave takes.

---

## Task 5: Widen the environment digest into a real system-under-test tuple — MOVED

**Owned by Wave 3B Task 2.**

*(Reconciliation D-2 and C-3. Both waves widened `EnvironmentDigest` (`runner.go:480-491`) and added
the missing identity axes to `RunnerIdentity` (`contract.go:124-130`) and `ResultProvenance`
(`:132-137`) — and they disagreed. This file specified a 7-field tuple including
`detectorCatalogDigest` plus `effectivePolicyDigest`; Wave 3B specified eight `RunnerIdentity` fields
**without** `detectorCatalogDigest`, plus `policyDigest`. Two names for one fact is exactly the defect
these waves exist to remove, so there is one owner and one union.)*

**The union Wave 3B Task 2 carries, recorded here so this file's two contributions are not lost in
the move:**

- **`detectorCatalogDigest` is a required identity field**, on top of Wave 3B's eight. Do not compute
  a second one: `aipolicycontract.DetectorCatalogDigest` is already a shipped constant at
  `internal/aipolicycontract/detector_catalog_generated.go:13`
  (`sha256:b252ee021229da77cc36a302898a0843758326084e8504ac4ce32d9f8ecf7553`), beside
  `DetectorCatalogSpineDigest` (`:14`) and `DetectorCatalogSourceCommit` (`:16`). Read those.
- **The provenance field is named `policyDigest`, once, everywhere.** `effectivePolicyDigest` — this
  file's retired spelling — is dead; nothing in the packet may reintroduce it.

**What did NOT move, and is carried elsewhere in this wave:** the note that the LLM code-scanner lane
is not executed by `neutraleval` at all, and therefore needs its own model-version and
system-prompt-version capture, now lives in **Task 8 Step 4**, where lane D is declared. It is not a
version-tuple axis and must not be assumed covered by one.

See wave exit criterion 5, which is now an inherited reference.

---

## Task 6: Declare an inspection budget, and give `InspectionDegraded` a consumer (P1-06)

The plan has no task for this today. It is in this wave because a rate computed over
under-inspected input is not a rate.

**Ownership, so this is not declared twice.** This task owns the **package-level inspection budget for
`internal/dlp` and `internal/toolrisk`** — the max bytes / items / depth / wall-time constants and the
completeness record they feed. **Wave 4B Task 2 declares only its own resolver budget** (argv count,
nesting depth, resolver wall time) and **consumes the `internal/toolrisk` budget declared here**; it
does not redeclare it, and a second set of package constants is a defect. This task also owns the
**first** production consumer of `InspectionDegraded` — Wave 4B Task 2's effect resolver is the
**second**, and its text says so.

**Files:**
- Modify: `Installers/internal/dlp/scanall.go` (budget declaration and the completeness field)
- Modify: `Installers/internal/dlp/dlp.go:410-422` (`Result`), `:374-375` (the existing silent caps)
- Modify: `Installers/internal/toolrisk/toolrisk.go` (budget declaration; the package declares none)
- Modify: `Installers/internal/proxy/openai_downlink_inspection.go:13-21`, `:96-97`
- Modify: `Installers/internal/neutraleval/runner.go:239-251` (the `promptrisk` arm)
- Create: `Installers/internal/dlp/inspection_budget_test.go`

**What is true today.** `dlp.Result` (`dlp.go:410-422`) has `Findings`, `PrivateKeyEvidence`,
`CredentialEvidence`, `MustBlock` — **no completeness field**. Two silent caps exist:
`base64MaxRunLen = 8 * 1024` and `base64MaxRuns = 256` (`dlp.go:374-375`), consumed at `:725` (the
run budget) and `:751`, `:767` and `:797` (the run-length skip). A text with more than 256 base64 runs
is under-inspected and **nothing reports it**. `internal/toolrisk` declares no budget of any kind — `grep -nE 'maxBytes|maxItems|maxDepth|budget'`
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
      returns before the record is kept (`plan:5102-5105`), so the class context is discarded.
      Expected failure: `undefined: laneShadowStore`.
- [ ] **Step 2 — the record shape.** One row per `(lane, classId)`, carrying: `lane`, `classId`,
      `catalogDigest`, `eligible`, `candidateTriggers`, `activeTriggers`, `agreements`, `deltas`,
      `unknown`, `dropped`, `uniqueSessions`, `uniqueEndpoints`, `windowStart`, `windowEnd`, the
      system tuple **Wave 3B Task 2** defines (its eight `RunnerIdentity` fields plus
      `detectorCatalogDigest`, and `policyDigest` on provenance — read it, do not redefine it), and
      `adjudication`. **`eligible` is the denominator** and it is per-class, not per-store.
- [ ] **Step 3 — keep what v1 got right.** The `maxToolShadowDeltas = 500` cap with an explicit
      `dropped` counter (`plan:5034`, `:5106-5112`), and the rule that the **new** record is dropped
      rather than an old one evicted — evicting rewrites the history a reader is about to draw a
      conclusion from. Keep the local-only `0o600` file and the `hookFireStore` pattern.
- [ ] **Step 4 — the seeding trap.** Seed from `NewServer` (`server.go:396`, seeding site at `:491`),
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
on `active == candidate` without recording, exactly as `plan:5102-5105` does, and it goes RED with
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

`plan:9398` gates the prompt promotion "on the Wave 3 decision-level shadow and on nothing else."
That sentence is deleted here; Wave 4C gates on lane A below.

**Files:**
- Create: `Installers/internal/neutraleval/lanes.go` (the seam declarations)
- Modify: `Installers/internal/neutraleval/ingress.go:58-71` (`LaneOf` and the lane constants)
- Modify: `Installers/internal/neutraleval/runner.go:219-263` (`execute` dispatch)
- Create: `Installers/internal/neutraleval/toolrisk.go` + `toolrisk_test.go` (**v1's** Task 5,
  preserved — unrelated to this file's Task 5 headstone)
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
- [ ] **Step 2 — build lane C. THIS WAVE OWNS THE `LaneOf` CODE CHANGE.** This is v1's Task 5
      preserved: add a `toolrisk` surface to `runner.go`'s dispatch (`:219-263`) and to `LaneOf`
      (`internal/neutraleval/ingress.go:66-71`, with the lane constants at `:58-63`), add
      `internal/neutraleval/toolrisk.go`, and extend `validateEntry` and `projection.go`'s
      `requestedEffect`. v1's file list at `plan:5871-5882` is a good starting point; re-resolve every
      line number against current `origin/main` before using it — v1 was written roughly 1,010 commits
      ago and its daemon citations have already been measured stale in this file's context section.
      **The matching refusal test is Wave 3B Task 9's, not this task's** (reconciliation D-7): Wave 3B
      exit criterion 12 reads *"a two-lane corpus is refused for every registered lane pair, not only
      ingress/egress"*, and it goes red today precisely because `LaneOf` maps both surfaces to EGRESS.
      Land the constant here; land the proof there. Do not write a second copy of either.
- [ ] **Step 3 — the tool lane needs catalog rows before it can be scored.**
      `detector_catalog_generated.go` contains **zero** tool-risk classes; verify with
      `MSYS_NO_PATHCONV=1 git show "origin/main:internal/aipolicycontract/detector_catalog_generated.go" | grep -c 'destructive-rm\|privilege-escalation\|dynamic-eval'`
      → `0`, while `parity-vectors/toolrisk-classes.v1.json` declares `"classCount": 40`. Without
      catalog rows every tool class scores as `Lifecycle: "UNCATALOGED"` (`holdout.go:196-201`).

      **"Extend the spine and regenerate" is not a one-file edit, and this step previously said it
      without saying what it costs.** The trap is stated in full by Wave 3B Task 3 and applies here
      unchanged: the spine is generated upstream in `@ceragon/shared-contracts` 0.7.0 —
      `detector-catalog-consumer-pin.v1.json`, generator `ceragon-ai-security-contract-spine` v1.0.0,
      `sourceCommit 1bc26573…` — and is **not editable in this workspace**. Putting 40 tool-risk
      classes into it is a shared-contracts change, plus a regeneration, plus three re-vendorings of
      the byte-identical `sha256:4abd98c3…e245` copies, plus two pin updates, sequenced
      Backend-before-agent. **Do not hand-edit a JCS file** and do not special-case the scorer.

      **Certificate contribution if that sequencing is not budgeted this release: lane C stays
      `UNKNOWN` and the 40 classes stay `UNCATALOGED`.** That is the honest published state — the
      report already renders it as such — and it is strictly better than a scorer taught to pretend
      the catalog covers a lane it does not.
- [ ] **Step 4 — lane D is declared, not built.** Record it as `NOT_INSTRUMENTED` with a named owner
      and the packet that will build it (Wave 7B). **Blocked, external:** it needs the exact release
      model and system prompt of every enabled Anthropic/Gemini route, which is a vendor-artifact
      dependency this wave does not control. Its certificate contribution is `UNKNOWN`, never zero.
      **Carried here from this file's deleted Task 5, so lane D is not assumed covered by the system
      tuple:** `neutraleval` does not execute the LLM code-scanner lane at all, so nothing in Wave 3B
      Task 2's version axes says anything about it. Lane D needs its own **model version** and
      **system-prompt version** capture, and declaring that in the seam is what stops a reader from
      reading a fully populated `RunnerIdentity` as coverage of a lane the runner never ran.
- [ ] **Step 5 — delete the wrong gate sentence.** Remove `plan:9398`'s "on the Wave 3 decision-level
      shadow and on nothing else" and replace it with a reference to lane A's report. Fix the
      justification at `plan:9391-9396`, which counts promptrisk cases in the wrong file.

**Defeat test:** `TestLaneSeams_EveryDeclaredLaneNamesItsDenominator` — give lane D a denominator of
`0` instead of `NOT_INSTRUMENTED` and it goes RED with `lane D reports a zero denominator; an
uninstrumented lane is UNKNOWN, never zero`.

**Second defeat test — owned by Wave 3B Task 9.** A corpus mixing lane A and lane C entries must be
refused by `scoreHoldout` in the same shape as the existing INGRESS/EGRESS refusal
(`holdout.go:222-238`); that existing refusal already works and is the pattern to copy. **Wave 3B
Task 9 writes the test and Wave 3B exit criterion 12 measures it** — *"a two-lane corpus is refused
for every registered lane pair, not only ingress/egress"*. This step's own obligation is narrower and
is what makes that test able to go red at all: the new lane constant must be added to `laneSet` at
`holdout.go:222-227` rather than bypassing it.

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
4. any version-tuple mismatch inside one report — the system tuple **Wave 3B Task 2** defines (its
   eight `RunnerIdentity` fields plus `detectorCatalogDigest`, and `policyDigest` on provenance). This
   wave consumes that tuple; it does not define it.
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

## Task 11: The `holdout-score.yml` regression — MOVED

**Owned by Wave −1 Task 5** ("Restore the two instruments that no longer gate"), which is
critical-path step 2 and lands before this wave.

*(Reconciliation D-3. The header-truth fix and the trigger decision were specified in three places —
Wave −1 Task 5, this task, and Wave 3B Task 1 — with two different defeat tests,
`ci/lib/workflow-header-truth.mjs` and `TestHoldoutWorkflowHeaderMatchesItsTriggers`. One owner, one
test: Wave −1's `ci/lib/workflow-header-truth.mjs`, whose expected RED is
`holdout-score.yml:6 claims a push trigger; on: at :22 has none`.)*

**Wave −1 Task 5 now carries this file's A/B/C option analysis**, which the reconciliation judged the
best version of the three. Handoff record below, so nothing is lost in transit. **It is a receipt, not
a task** — do not implement from it, and delete it once Wave −1 Task 5 carries the same three options
in full.

- **Option A — restore `push:` on `main`.** Detector quality gates on merge. Costs one ubuntu-latest
  job per push to `main`; the job is Go-only with `cache: true`. Measure the real figure with
  `node ci/lib/drift.mjs --cost` before quoting one.
- **Option B — write the decision down.** Detector quality is a nightly, non-gating report, and the
  compensating control is then named rather than assumed: `ci/gates.json` already mirrors
  `holdout-score:score`, so `node ci/lib/run.mjs Installers holdout-score:score` runs it locally at
  zero cost today.
- **Option C — the middle, and the recommendation.** Keep the nightly and add a required-attachment
  rule: no promotion PR merges without a locally-produced report from the exact commit. The only one
  of the three that costs nothing and still gates.
- Whichever is chosen, **record it in the workflow file itself**, in the style of the existing
  cost-gate note at `:18-21`, naming the date and the person. A decision that lives only in a chat log
  regresses. The `push` trigger was removed on 2026-08-25 (`cd657c77`) as a deliberate owner cost
  decision; **do not restore it on your own authority.**

**The `vendored-upstream-drift.yml` half is Wave −1 Task 5's too, not Wave 5's.** This file previously
routed it to Wave 5 and that pointer was wrong: Wave −1 Task 5 specifies it and makes it exit
criterion 7.

**It is BLOCKED there, and an earlier revision of this paragraph wrongly concluded otherwise.** The
T-M2 precondition being satisfied — T-M2 landed, `MANIFEST.json` pins `254d24fc` — is not the only
condition. Adding a `pull_request:` trigger to a Frontend workflow is an **owner spend decision**,
because `Frontend/.github/workflows/pr-checks.yml` is `on: workflow_dispatch: {}` only: every push and
PR trigger was removed on 2026-08-25 as a deliberate cost gate. Reading the T-M2 condition and not the
spend one is what produced the wrong answer here. Wave −1 Task 5 Step 5 holds BLOCKED as a state, and
the unblocked offline half lives in Wave 5 Task 9.

**What this wave still depends on:** while the trigger question is open, this wave's certificate
contribution for *"detector quality is gated"* stays **UNKNOWN**. See wave exit criterion 12, now an
inherited reference.

---

## Wave exit criteria

Each is a number or a named artifact, measured with the local Docker mirror
(`node ci/lib/run.mjs Installers`) because `pr-checks.yml` has no automatic GitHub trigger.

1. **`cmd/ai-security-neutral/holdout_test.go` exists and carries the 5 tests this wave names** —
   `TestScoreHoldout_RefusesAMixedLaneCorpus`, `…_ACaseThatCannotRunIsAnErrorNotAPass`,
   `…_EveryCatalogClassGetsARow` (Task 1), `…_FPDenominatorIsPerSurfaceExposure` (Task 2) and
   `…_ZeroExposureReportsUnknownNotZero` (Task 3) — and
   `go test ./internal/neutraleval/ -run TestHoldoutCorpusIsNotReferencedByAnyPerPRTest` is green with
   that file present. The count is derived from the task list above, not written down independently;
   *(it read ≥ 8 before this pass, which no version of the task list ever reached — the engine-version
   and system-tuple tests were always in `runner_test.go`, and both of those tasks are now Wave 3B's).*
   *Defeat: `TestScoreHoldout_RefusesAMixedLaneCorpus`, revert `holdout.go:228-234`.*
2. **Zero occurrences of `/23` in the regenerated `HOLDOUT_REPORT.md` per-detector table**, and every
   published rate carries a per-surface denominator: `/6` for `promptrisk`, `/17` for `dlp`, UNKNOWN
   for the six `INGRESS_RISK` classes. **The numerators — `jailbreak-persona 1/6`,
   `db-connection-string` and `aws-access-key 1/17` — are a pre-Wave-4A baseline snapshot and are not
   part of this criterion:** Wave 4A Task 2 closes `qa-fp-detections-finding-name` and drives
   `jailbreak-persona` to `0/6`. The criterion is the shape, never the numerator. *Defeat:
   `TestScoreHoldout_FPDenominatorIsPerSurfaceExposure`, restore `holdout.go:357-359`.*
3. **43 of 55 classes carry no `fnRate` key** in the machine report, and `detectorsWithNoExposure`
   names them. The 43 is recomputed from the corpus, never copied. *Defeat:
   `TestScoreHoldout_ZeroExposureReportsUnknownNotZero`, revert `FNRate` to `float64`.*
4. **INHERITED — not measured by this wave.** No artifact carries `"engineVersion": "m4.7"`.
   **Owned by Wave 3B Task 1** (its exit criterion 1; defeat test
   `TestNormalizeOptionsRejectsAbsentEngineVersion`, restore the default at `runner.go:468`). It is
   listed here because D18 makes every number this wave publishes invalid until it passes — this wave
   does not close it and must not report it closed.
5. **INHERITED — not measured by this wave.** `RunnerIdentity` carries its eight required identity
   fields **plus `detectorCatalogDigest`**, `ResultProvenance` carries **`policyDigest`** (never
   `effectivePolicyDigest`), and `normalizeOptions` rejects a run missing any of them. **Owned by
   Wave 3B Task 2** (its exit criteria 3 and 4; defeat test `TestEnvironmentDigestCoversDeclaredAxes`).
   Task 10's invalidation trigger 4 in this wave consumes that tuple; it does not define it.
6. **`internal/dlp` and `internal/toolrisk` each declare 4 package-level budget dimensions** — this
   wave owns both, and Wave 4B Task 2 consumes the `internal/toolrisk` one rather than redeclaring it —
   and `InspectionDegraded` has **its first** production consumer outside its defining file and test
   (Wave 4B Task 2's resolver is the second). `runner.go` contains 0 hard-coded
   `Inspection: "COMPLETE"`. *Defeat: `TestScanAll_ReportsExhaustionWhenTheBase64BudgetIsSpent`.*
7. **The shadow store emits one row per `(lane, classId)`** with a per-class `eligible` count, and the
   single global `observed` counter is gone. *Defeat:
   `TestLaneShadow_AgreementAdvancesThePerClassDenominator`, restore v1's early return.*
8. **The scan-depth guard is green with the new daemon file present**, proven by driving it red first:
   swap one `dlp.ScanAll` for `dlp.Scan` and see `scan_depth_guard_test.go:140`
   `these surfaces reach internal/dlp through a PARTIAL detector set`. **`narrowCallExemptions` still
   has exactly 1 entry.**
9. **Lanes A and B report against 6/5 and 18/8**; lane C reports a per-class denominator over
   `neutral-corpus.toolrisk.jsonl`; **lane D reports `NOT_INSTRUMENTED` with a named owner.**
   *Defeat: `TestLaneSeams_EveryDeclaredLaneNamesItsDenominator`, give lane D a zero.* The proof that
   a mixed `toolrisk`+`dlp` corpus is **refused** is **Wave 3B exit criterion 12**, not this one —
   this wave lands the lane constant, Wave 3B Task 9 lands the refusal test.
10. **`cmd/ai-lane-shadow-report` exists and is exercised by `holdout-score:score`**, and the promotion
    predicate is a function with a test rather than a sentence at `plan:9568`. *Defeat:
    `TestShadowReport_RefusesAStoreWithDroppedRecords`.*
11. **8 of 8 invalidation triggers force `UNKNOWN`**, one implementation, two callers, each trigger
    named in its own failure text. *Defeat: `TestInvalidation_EachTriggerForcesUnknown`, remove any
    one trigger.*
12. **INHERITED — not measured by this wave.** `holdout-score.yml:6` describes the triggers it
    actually has. **Owned by Wave −1 Task 5** (its exit criterion 8), pinned by
    `ci/lib/workflow-header-truth.mjs`, whose expected RED is
    `holdout-score.yml:6 claims a push trigger; on: at :22 has none`. Do **not** also write
    `TestHoldoutWorkflowHeaderMatchesItsTriggers` — this file's retired name for the same check — or
    the packet ships two header tests for one header.

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
  spend.** Owned by **Wave −1 Task 5**, which carries the A/B/C option analysis (see this file's
  Task 11 headstone for the handoff record). Until the decision is recorded in the workflow file, this
  wave's "detector quality is gated" contribution is **`UNKNOWN`**, and Option C — a required
  locally-produced report attached to every promotion PR — is the recommendation because it costs
  nothing and still gates.
- **The producer-surface map for all 55 catalog classes.** Families were enumerated and five classes
  were re-resolved by hand on 2026-08-28 (Defect 2b); the full map was not machine-resolved. Task 2
  Step 2 must run the discovery command in the context section — **including `internal/policyeval` and
  `internal/proxy` in the search paths** — and Step 3's totality guard is what makes an unresolved
  class a build failure rather than a silent `fp=0/23` row. **Certificate contribution while the spine
  field is unbudgeted: `UNKNOWN`**, per the trap in Task 2 Step 2.
