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

# Wave 2 — Evidence strength, consequence, and UI vocabulary

**Depends on:** Wave −1 (rebase, citation repair, path discipline). Wave 1 for one exit criterion
only — the totality claim in Task 6 has no denominator until Wave 1 widens `AI_DLP_CLASSES` from
**30 to 81**; until then that criterion reads `UNKNOWN (blocked on Wave 1)`, not `PASS`. Wave 0A runs
in parallel and is not blocked by anything here.
**Blocks:** every enforcement change in Wave 4 (**O-14** — the severity spine decides what may block
at all, and Wave 4B's proposals are typed against `evidenceStrength` / `baseCapabilityImpact` /
`resolvedConsequence`, which do not exist until this wave lands).
**Implements decisions:** D6 (rewritten — the four objects, and "monitoring must be non-tainting"),
D7 (substance unchanged; its **word** "confidence" is retired here), D8, D9, D10.

**This wave is the single owner of three things other waves also touch.** Each is written down here
once and cited from there, never re-specified:

| Owned here | Where the rest of it lives |
|---|---|
| `parity-vectors/toolrisk-classes.v1.json` **formatVersion 3** — the `grades` block and `gradesSha256` (Task 6) | Wave 4B Task 1 adds `proposalKind` and **bumps explicitly to formatVersion 4**; the reasoning and the rule are in Task 6 |
| The **`prClassAction` branch ladder** — the whole precedence, numbered, in §8 | Wave 4C Task 4 lands rung **6a** (provenance); Wave 4A Task 2 lands rung **6b** (Tier-C release); Task 10 here rewrites rung **7** in place |
| The **`taintRisky` signature and attribution** (Task 9c) — it ships here | Wave 4B Task 9 owns a later *narrowing* of the taint-eligible set and ships nothing; Wave 8 must not touch the function at all |

**Two deploy orders in this wave are destructive if inverted** and are stated in the tasks that carry
them: **O-6** (Task 2 Backend before Task 4 console) and **O-7** (Task 7 steps 1–4 Backend before
steps 5–8 agent).
**Certificate impact:** the **evidence-grade** dimension is `UNKNOWN` until this wave passes, and
`metrics.precision`, `metrics.falsePositiveRate` and `metrics.inspectionCompleteness` cannot even be
*populated* for the tool lane, because `toolrisk.Finding` carries no evidence axis to bin them by.
R1 and R4 stay **NOT_READY** throughout; this wave clears exactly one named blocker on each — D7's
"weak evidence structurally cannot block" — and makes the manifest's `evidenceStrength` rows
fillable. **Passing this wave moves no risk lane.** Wave 5 (console truth) cannot begin its
manifest-field-to-rendered-number mapping until this wave's vocabulary exists.

---

## Context an engineer needs

### Read the tree with `git show origin/main:<path>`, never the working copy

Every checkout on this box is far behind. All line numbers below were measured against
**Backend `0cf9021e`, Frontend `cac574ae`, Installers `5b129523`** on 2026-08-27. If your `git fetch`
disagrees, revalidate before touching anything. Where a symbol matters more than a line, the
discovery command is given instead of a number — that is deliberate, and the v1 plan's drifted
citations (P1-08) are why.

**Two different D-numberings collide in these files and nobody warns you.** `AI_TOOL_RISK_D4_TIERS`
in `Backend/src/ai-security-policy/ai-security-policy.constants.ts:1216` is the **Backend's** D4 — a
tool-risk tier decision. It is not this plan's decision D4 (lane-specific shadow). Whenever this
wave says "the D4 tier table" it means the Backend constant. Say which one you mean, every time.

### 1. There are two live declarations of one type, and they have never agreed

The producer builds the basis object at
`Backend/src/ai-governance/services/ai-event-severity.util.ts:649-658`:

```ts
    basis: {
      formulaVersion: AI_EVENT_SEVERITY_FORMULA_VERSION,   // = 4  (util.ts:48, emitted at :650)
      class: cls,
      ruleId,
      base,
      evidenceTier,
      tier,
      enforcementEligible,
      adjustments,
    },
```

typed by a **local** `AiEventSeverityBasis` at `ai-event-severity.util.ts:410-421`. The **published**
contract declares a different type of the same name at
`Backend/packages/shared-contracts/src/ai-governance-contract.ts:169-176` — `findingClass`,
`baseSeverity`, no `formulaVersion`, `evidenceTier` narrowed to `'A'|'B'|'C'|'D'|null`. The column is
stored untyped and forwarded verbatim. **There is no mapper anywhere.**

Consequence, measured: `Frontend/app/ai-control-plane/events/events-content.tsx:342-363`
(`severityTitle`, reads at `:351-356`) takes `basis.findingClass`, `basis.evidenceTier`,
`basis.baseSeverity`. Only
`evidenceTier` is a key the producer writes. So an Events row's severity tooltip **has never named
the governing class or the pre-adjustment base** — it renders `tier <x>` plus the adjustment list and
nothing else, and on a tool-lane row (which sends no `evidenceTier` at all — see §3) it renders the
adjustments alone.

Detections escapes only by casting past the wrong type:
`Frontend/app/ai-control-plane/detections/detections-content.tsx:399-405` does
`row.severityBasis as Record<string, unknown>` and then reads `basis.class` / `basis.base`.

Three test files pin the wrong shape and will move:

- `Frontend/app/ai-control-plane/events/__tests__/events-content.test.tsx:471-479` fabricates the
  fixture in the contract's shape (`findingClass` `:472`, `baseSeverity` `:477`), so the renderer is
  green against keys production never sends. **The fixture also carries no `formulaVersion` key at
  all** — the published contract type has no such member (`ai-governance-contract.ts:169-177`) while
  the producer emits `formulaVersion: 4` on every basis (`util.ts:650`). Re-verified at
  `origin/main cac574ae` on 2026-08-28: an earlier draft of this wave said the fixture "writes
  `formulaVersion: 3`". It does not. The defect is an **absent** member, not a stale one.
- `Frontend/app/ai-control-plane/detections/__tests__/detection-view-model.test.ts:331` writes
  `severityBasis: { class: "jwt" } as never` — the `as never` exists because the type disagrees with
  reality, and it is an inert assertion: no change to the type can make it fail.
- `Backend/src/ai-governance/services/detections-absent-facets.spec.ts:141-147` reads the contract
  **source text** and pins the member set to
  `['adjustments','baseSeverity','enforcementEligible','evidenceTier','findingClass','ruleId','tier']`.
  It goes red the moment the contract is corrected — that is the pin working, not a regression.

**TRAP — the `dist/` build step.** `Backend/package.json:6-7` resolves `@ceragon/shared-contracts`
to `dist/index.js` / `dist/index.d.ts`, and `packages/shared-contracts/dist/**` is **checked into
git**. `npm test` rebuilds it via `pretest` → `build:shared-contracts` (`package.json:10`);
`npx jest <path>` does **not**. After any edit under `packages/shared-contracts/src/**` run
`npm run build:shared-contracts` and commit the regenerated `dist/**`, or you will spend an hour
debugging a stale type.

### 2. Five bands are half-built, and five server-side gates refuse the fifth

`METER_SEVERITY` (`Frontend/app/ai-control-plane/detections/detection-view-model.ts:78-84`, `info` at
`:83`) and `SPARK_SEVERITIES` (`:99`) already contain `info`, and `Frontend/components/ui/severity-badge.tsx`
maps `INFO` in both of its tables (`:60`, `:70`). What does not work is the other three AI-detection band declarations:

- `Frontend/app/ai-control-plane/detections/detection-read-model.ts:52` —
  `SEVERITY_BANDS = ["critical","high","medium","low"]`, four members, and it drives the facet
  checkboxes, the distribution bar and the URL filter serialisation.
- `Frontend/app/ai-control-plane/ai-sessions/[id]/session-severity.ts:39-44` (`RANK`), `:46-51`
  (`SEVERITY_LABEL`), `:183-196` (`severitySignalVar`) — a third, independent four-band rank map,
  label map and signal-var switch, all missing `info`.
- `Frontend/app/globals.css:1594-1599` — the row-spine block: `:1594` is the shared
  `.tbl-row[data-sev]` shadow, `:1595-1598` are `critical/high/medium/low`, `:1599` opens the
  `unknown` hatch, and there is **no `info` rule** — while `:1397` and `:1533` already light the info
  meter. An info row draws a coloured meter above a transparent spine.

Five server-side gates refuse or mis-rank `info`, and **all five must be deployed before any console
change ships** — this is **O-6**, and it is not a preference. `@IsIn` on an array query parameter
rejects the *whole request*, so a console that can emit `?severity=info` against an undeployed
Backend does not degrade, it 400s; and an info-banded INSERT violates a live CHECK constraint.

| Gate | Location (origin/main `0cf9021e`) | Failure today |
|---|---|---|
| Query DTO | `Backend/src/ai-governance/dto/list-ai-detections.dto.ts:86` — `@IsIn([...AI_EVENT_SEVERITIES], { each: true })` | `?severity=info` 400s the **whole** request |
| Vocabulary | `packages/shared-contracts/src/ai-governance-contract.ts:165` | four-member tuple |
| DB CHECK | `Backend/src/migrations/1787100000000-AddAiEventSeverity.ts:45-52` — `CHK_ai_events_severity` | an info-banded INSERT fails |
| Sort rank | `Backend/src/ai-governance/services/ai-query.service.ts:756-758` — `DETECTION_SEVERITY_RANK_SQL` | info ranks `NULL`, sorting with the unassessed |
| Counts | `ai-query.service.ts:6577` (`detectionSeverityCounts`) + `dto/ai-response.dto.ts:2598-2603` (`AiDetectionSeverityCountsDto`) | exactly four members |

### 3. The evidence axis exists on one lane, is dropped on the wire, and is absent from the other lane

`Installers/internal/dlp/dlp.go:56-64` — `dlp.Finding` carries `EvidenceTier` (`:60`) and
`EnforcementEligible *bool` (`:61`), and the endpoint already **gates** on them locally in four
independent places:

- `Installers/internal/contenttransform/transform.go:121-125` — refuses to transform on tier B/C/D or
  an explicit non-eligible finding (`ErrIneligibleEvidence`);
- `Installers/internal/daemon/ai_handlers.go:853+` — `transformWillAccept`, a hand-duplicated copy of
  the same predicate, whose docblock says outright *"NOT a place to loosen anything"*;
- `Installers/browser-extension/src/content-transform.js:113-119` and `:220-233` — two more copies.

**Four copies of one predicate, none of them a shared exported helper. Do not add a fifth.**

The vocabulary behind it is richer than anyone reading only `dlp.Finding` would guess.
`Installers/internal/dlp/private_key.go:31-99` declares six vocabularies — `EvidenceTier` (`:32`,
A/B/C/D at `:34-39`, *"the canonical local evidence strength"*), `CredentialRole` (`:42`),
`ExploitabilityState` (`:55`), `ValidationState` (`:67`), `AssertionState` (`:77`) and
`InspectionStatus` (`:87`). And `Installers/internal/aipolicycontract/detector_catalog_generated.go`
already ships a **55-class** catalog carrying, per class: `Family`, `Owner`, `Lifecycle`,
`DefaultEvidenceTier`, `CredentialRole`, `Exploitability`, `HardStopEligible`,
`HardStopEvidenceTiers`, `HardStopRationale`.

**Read that list again before you design anything.** The three fields this wave is asked to add
mostly *exist*, generated, digest-pinned and vendored — for 55 classes. The gaps are exact:

- the catalog covers **35 DLP-ish + 20 prompt/ingress classes and ZERO tool-risk classes**
  (`grep -o 'ClassID: "[a-z0-9-]*"' detector_catalog_generated.go` — no `destructive-*`, no
  `chmod-*`, no `reverse-shell`). The lane that hard-blocks is the lane with no evidence metadata.
- the catalog is deliberately **inert**: `DetectorCatalogProductionWriterEnabled = false`, header
  *"Nothing here activates a runtime writer or enforcement"*, guarded by
  `internal/aipolicycontract/inertness_test.go`.
- the DLP producer registers **81** classes (`RegisteredClasses()`,
  `internal/dlp/registry.go:221`; 33 in `classRegistry` at `registry.go:133-197` + 48 in
  `codeSecurityParityClasses` at `codesecurity_rules.go:70-159`), so 26 registered classes have no
  catalog row either.
- only five DLP source files ever set an `EvidenceTier` (`registry.go` is not one of them:
  `git grep -l "EvidenceTier" origin/main -- internal/dlp | grep -v _test` → `codesecurity_rules.go`,
  `credential.go`, `dlp.go`, `hexatrest.go`, `private_key.go`). **Every other class emits an empty
  tier**, and an empty tier is *not* refused by `transform.go:121-125` — it is treated as eligible.
  So today, ungraded means enforceable. Fixing that by refusing empty would silently disable
  redaction for most classes; it is a behaviour change with its own FP question and it belongs to
  Wave 4A's redaction-posture decision, **not here**.

The wire then throws all of it away. `Installers/internal/core/backend/ai_prompt.go:35-40`
(`AiPromptFinding`) and `internal/core/backend/ai_tool.go:29-34` (`AiToolFinding`) each declare
exactly `Class / RuleID / Count / Severity`, and the converters `toBackendFindings`
(`ai_handlers.go:4295-4318`) and `toBackendToolFindings` (`ai_handlers.go:4016-4039`) build exactly
those four.

**Delete the v1 exemption at `plan:2067`** — *"The tool lane cannot carry a grade yet and this wave
does not pretend otherwise."* It was true only because nobody had put the fields on
`toolrisk.Finding` (`Installers/internal/toolrisk/toolrisk.go:50-62`), which today is
`Class / RuleID / Severity / Start / End / NormalizedOnly`. **P1-01 confirmed this by mutation: a
probe referencing `f.Confidence` failed to compile.** There *is* a `classConfidence(class) int` at
`toolrisk.go:776` and a `rule.confidence` field at `:69` — both are **overlap-resolution ranks**, not
grades. Do not mistake one for the other.

The Backend end is already waiting for the data. `sanitizeStructuredFindings`
(`Backend/src/ai-governance/services/ai-event.service.ts:2946`) validates all three against closed
vocabularies at `:3014-3020` (`evidenceTier` `:3014`, `tier` `:3016`, `enforcementEligible`
`:3018-3020`), and the derivation reads them at `ai-event-severity.util.ts:541-545` and acts on them
at `:559-585`, with the correct rule already written down at `:447`:
*"ABSENT IS NOT FALSE. `enforcementEligible` caps only on an explicit `false`… The agent does not yet
emit these fields (W2/W3 work)."* **That comment names this wave.**

**TRAP — do not put a closed enum on an agent-supplied scalar.**
`Backend/src/ai-governance/dto/ai-prompt-check.dto.ts:41-58` records that `@IsIn(['cli','browser','ide'])`
on `surface` cost three production incidents on this exact route family: `AgentIngestValidationPipe`
leniency (`src/common/pipes/agent-ingest-validation.pipe.ts:89-93` chooses the branch; the rule is
written out at `:49-55`) covers undeclared **keys**, not out-of-vocabulary **values**, so an unknown
value 400s the whole report and the event loses its findings *and* its band.

**The same file states the other half of the trap, and it is what makes O-7 destructive if inverted.**
`:52-55`: *"`whitelist: true` is on BOTH paths. An undeclared member is still stripped from the
instance before it reaches a service… the agent path drops the key instead of dropping the request."*
So an agent that ships a new grade field **before** the Backend DTO declares it does not fail — the
key is silently removed. No error, no data, and the aggregation fold looks like it works.

Every new grade field is bounded free text on the wire and closed at
**storage**, exactly like `surface`. A spec that imports only the DTO gets the STRICT branch (the
lenient one is keyed on `Reflect` metadata stamped by the controller's auth decorator); construct the
pipe from the exported `LENIENT_AGENT_INGEST_VALIDATION_OPTIONS` instead of importing the controller.

### 4. The impact table is partial, and v1's replacement invariant re-imports the bug it fixes

`BASE_BY_CLASS` (`ai-event-severity.util.ts:301-335`) has **exactly 30 entries** — the 30 members of
`AI_DLP_CLASSES`. Everything else falls through to `medium` and stamps `unknown-class-default`
(`:549`). All **40** tool-risk classes miss: a `destructive-rm` block and an `action-git-commit`
monitor band from the same base.

v1's Task 8 replaced it with a generated `ClassImpact` catalog, which is the right move — the parity
machinery is real and proven (C3): `Installers/parity-vectors/toolrisk-classes.v1.json`,
formatVersion 2, `classCount` 40, `sha256:2cc7caeff31a…f922` over the tier grouping,
**byte-identical blob `e8bd025b` in `Backend/packages/shared-contracts/` and
`Frontend/types/vendored/`**, regenerated with `TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/`.

But v1 then pinned an invariant at `plan:4139-4141`: *"impact EQUALS the detector tier, except for
the classes listed in `criticalImpactClasses`… `class_impact_test.go` enforces exactly that."*
**Review §15 requires that invariant deleted, and the measurement says why.** The detector tier is
syntax. `content-pipe-shell` is tier HIGH because it matched `curl … | sh`; its real capability
depends on the source host and the interpreter, and the same shape fires on a threat-model markdown
file. `chmod-broad-777` is tier HIGH and its D4 action is `monitor`. Inheriting impact from the
detector tier re-imports Theme C — syntax treated as impact — into the axis built to escape it. It
also declares 13 classes CRITICAL by assertion, which is P1-01 verbatim.

### 5. "Confidence" is not descriptive, and it sets a shipped enforcement action

`Backend/src/ai-security-policy/ai-class-metadata.ts:30` states: *"`label` / `category` /
`confidence` / `mechanism` remain purely descriptive."* **That sentence is false.**
`confidenceForMechanism` (`:89-100`) maps `structural|exact-match → high`, `regex-context → medium`,
`entropy|keyword-heuristic → low`; `meta()` stamps it onto every class at `:104`; and `confidenceOf`
(`:435`) feeds `Backend/src/ai-security-policy/ai-policy-presets.ts:258-264`
(`dlpActionsByConfidence`) and `:271-283` (`promptActionsByConfidence`), which place **every** class's
shipped preset action on its tier:

```ts
  for (const cls of AI_SECURITY_DLP_CLASSES as readonly AiDlpClass[]) {
    out[cls] = tier[confidenceOf(cls)];        // ai-policy-presets.ts:260-261
  }
```

So a hand-authored mechanism label — with no heldout labels, no PPV, no support, no interval, no
calibration error — decides what a customer's policy does. That is the exact thing the forbidden-claims
list bans, wired to enforcement. It is also carried onto the admin board's row model at
`Frontend/components/admin/ai-security-policy-section.tsx:1071` (`confidence: meta?.confidence`) and
attached as a row chip by the block whose docblock is at `:976`. The same file's customer-facing copy
claims *"High-confidence combination of override and hidden-context theft"* (`:453`, and three more
at `:457`, `:461`, `:465`), *"a high-confidence match taints the session"* (`:4251`),
*"Automatic high-confidence taint hold enabled"* (`:4268`) and *"Automatic taint hold only reacts to
high-confidence correlations"* (`:4306`) — while the taint predicate is `severity != INFO` (see §6).
Console says X, endpoint does Y, for the fourth time in this workspace.

Do not count these by hand. The census is:

```bash
cd /c/Users/Owner/Documents/Ceragon/Frontend
git show origin/main:components/admin/ai-security-policy-section.tsx | grep -ni confidence
```

which prints **12** lines today, of which four are code (`:120` type import, `:1071` model field,
`:2910` comment, `:5597` `enableConfidenceSort`) and the rest are rendered copy.

**C16 is the counter-example to copy, not to rebuild.** A measured per-class FP rate with a real
denominator has shipped since 2026-08-06: `ai-security-policy.service.ts:3195-3215` explains it and
`:725-727` states RULE 7 — *"An ABSENT key means NOT MEASURED … it is never the same statement as
`fpRate: 0`."* The rate is governed. The **label** is not.

### 6. `monitor` is four things, and one of them changes the call

Verified end to end on `origin/main`, in order:

1. `Installers/internal/daemon/ai_handlers.go:2701` — `findings := toolrisk.Scan(...)`, the raw slice.
2. `decideTool` (`:3716`) → `decideToolRisk` (`:3857`) → `toolRiskDisposition` (`:3829-3844`). A
   `monitor` class resolves to `aiDispositionMonitor` and does **not** interrupt. The code says so
   itself at `:3874-3878`: *"The finding still rides the AiToolCheckRequest to the backend either
   way; only the local interruption is suppressed."*
3. `ai_handlers.go:2922` — `Findings: toBackendToolFindings(findings)`. **The raw slice, never the
   policy-filtered one.**
4. `Backend/src/ai-governance/controllers/ai-agent.controller.ts:875-883` — the tool-lane mapper
   folds **every** finding class into `dataClasses`.
5. `isDetectionEvent` (`Backend/src/ai-governance/services/activity-kind.util.ts:380-394`) returns
   true when `dataClasses.length > 0` (`:385`). A monitored finding is therefore a **customer-visible
   detection row**, and it counts against the FP and precision budget. (The path is
   `services/activity-kind.util.ts`, not `utils/` — the bare-basename citation in the disposition
   material does not resolve.)
6. `aiAlertScopeSql` (`Backend/src/alerts/alerts.service.ts:862-881`) admits only
   `TOOL_CALL_BLOCKED, CODE_DIFF_FLAGGED, MCP_SERVER_BLOCKED, PACKAGE_INSTALL_BLOCKED` plus gated
   `PROMPT_*` and `WEB_NAV_BLOCKED`. **`TOOL_CALL_REQUESTED` is absent — nobody is paged.**
7. `taintRisky` (`Installers/internal/daemon/ai_taint.go:159-166`):

```go
func taintRisky(toolName string, toolInput map[string]any, findings []toolrisk.Finding) bool {
	for _, f := range findings {
		if f.Severity != toolrisk.SeverityInfo {
			return true
		}
	}
	return toolTargetsSensitive(toolInput)
}
```

   No policy input. No provenance. `toolName` is accepted and never read. It has exactly **one**
   production caller, `ai_handlers.go:3055`, and a `true` there converts an ALLOW into a **HOLD** on an
   independently tainted session. `TestTaintRisky` (`internal/daemon/ai_taint_test.go:80-104`) pins the defect in
   its first case: `privilege-escalation` at MEDIUM must be risky — and `privilege-escalation` is on
   **`monitor`** in the Backend D4 tier table (`ai-security-policy.constants.ts:1254`), alongside
   `docker-cp-host` (`:1247`), `content-spawn-shell` (`:1246`) and `content-pipe-shell` (`:1245`).

**And there is a live hole this plan itself opens.** `Installers/internal/policyeval/shadow.go`
already implements the detector lifecycle and states the rule in its own docblock: a SHADOW class
*"can NEVER interrupt: not block, not redact, not warn, not hold — regardless of the tenant action
map, the legacy class arrays, the built-in severity default, or a nil policy."* `IsShadowClass` is
consulted in exactly **two** places — `internal/policyeval/policyeval.go:405` (`dlpClassAction`) and
`:514` (`prClassAction`).

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git grep -n "IsShadowClass" origin/main -- internal/
```

**Neither `decideToolRisk` nor `taintRisky` consults it. The tool lane has no shadow gate at all.**
That is dormant today — the pinned catalog ships zero SHADOW classes — and it fires on the first day
M4.7A ships a new detector, which is the whole point of M4.7A. A taint-induced HOLD is an interrupt.

### 7. Enforcement still falls back to raw detector severity in five places

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
git grep -n "f\.Severity\|\.Severity ==" origin/main -- internal/policyeval internal/daemon internal/proxy | grep -v _test
```

Measured, the enforcing ones are:

| Site | What it does |
|---|---|
| `internal/daemon/ai_handlers.go:3909-3922` — `defaultToolDecision` | HIGH → block, MEDIUM → warn, else allow |
| `internal/daemon/ai_handlers.go:3789` | legacy DLP-shaped tool lane: monitor arm gated on `!= SeverityHigh` |
| `internal/daemon/ai_taint.go:161` | `severity != INFO` → taint-risky |
| `internal/policyeval/policyeval.go:544-551` — the `prClassAction` floor | severity fallback: HIGH → block, MEDIUM → warn, else allow |
| `internal/proxy/ai_replay_promptrisk.go:265-272` — `enforcingPromptFindings` | HIGH-or-MEDIUM gate at `:268` |

**These are fallback lanes and they cannot simply be deleted.** Rule 5 says the local rulebook must
always reach a verdict, and `decideTool:3745-3752` documents deliberately keeping the legacy lane so
an agent that outlives its backend still governs. The fix is to read an **explicit reviewed per-class
offline posture**, apply rule-level safeguards, and cap that posture with the catalog's capability
impact × evidence ceiling instead of deriving policy from the detector's syntactic tier. The
40-class migration proof requires exact equality: neither a relaxation nor an unapproved hardening.

**The replay site is not an independent judgement — it is a second copy of the floor, and Task 10
must move it in lockstep.** Verified at `origin/main 5b129523`: `enforcingPromptFindings`'
own docblock (`ai_replay_promptrisk.go:262-264`) reads *"returns the findings at or above the WARN
floor — the set that actually gates under the built-in severity default (prClassAction: high→block,
medium→warn, low→allow)."* The moment rung 7 of the ladder in §8 stops being a function of
`Finding.Severity`, that sentence is false and `:268` selects a different set than the resolver it
claims to mirror. This answers the open question the earlier draft of Task 10 left to the engineer.

### 8. The `prClassAction` ladder — written down once, here, and cited from everywhere else

Three waves modify `prClassAction` (`Installers/internal/policyeval/policyeval.go:511-552`): Task 10
of this wave, Wave 4A Task 2 and Wave 4C Task 4. Each of them once described the branch order in its
own words, and two of those descriptions disagreed about how many branches there are — a tally is
correct on the day it is written and wrong on the day the other wave lands. Both sibling tasks now
defer here by name. **This is the only place in the packet where that order is written. Cite a rung
number; never count branches.**

Rungs 1–6 were measured at `origin/main 5b129523`. Rung 7 below is the authoritative
post-Task-10 replacement; the baseline row was `Finding.Severity` high→`block`,
medium→`warn`, else `allow`.

| Rung | Line | Condition | Result |
|---:|---|---|---|
| **1** | `:514` | `IsShadowClass(class)` | `allow` + MONITOR marker |
| **2** | `:519` | policy present, prompt-risk enabled, class in `PromptRisk.MonitorClasses` | `allow` + MONITOR marker |
| **3** | `:522` | policy present, prompt-risk enabled, `validAction(PromptRisk.Actions[class])` resolves | the configured action |
| **4** | `:528` | policy present, DLP enabled, class in legacy `DLP.BlockClasses` | `block` |
| **5** | `:530` | policy present, DLP enabled, class in legacy `DLP.WarnClasses` | `warn` |
| **6** | `:541` | policy present **and** `PromptRisk.Enabled == false` | `allow` + MONITOR marker |
| **7** | `PromptRiskFallbackDecision` | no earlier rung resolved: read the class's declared offline posture, then cap it with `baseCapabilityImpact × evidenceStrength`; unknown class/posture → `warn` | the declared posture at or below the grade ceiling; rule-level quote/decode-budget safeguards apply before the cap |

Rung 1 sits above every policy-dependent branch on purpose, and the comment at `:512-513` says why: a
nil policy (backend unreachable) falls through to rung 7, and rung 7 can `warn`, which is an
interruption. `dlpClassAction` places the identical gate at `:405` for the same reason.

**Rungs 4 and 5 are the two arms of one `switch` inside one `if` block (`:526-533`)** and other wave
files refer to them jointly as *"the legacy DLP arrays"*. They are numbered separately here because
they return different verdicts. Either citation finds the same code; do not read the two spellings as
a disagreement about how many rungs exist.

**The two reserved positions, and who fills them.** Both new branches sit **below rung 6 and above
rung 7** — the same place `dlpClassAction` puts its evidence arm (`:443-445`), which is below the
policy branches and above the built-in defaults at `:464` and `:478`.

- **Rung 6a — provenance restriction. Owned by Wave 4C Task 4.** A finding whose `ContentOrigin` is
  not `DEVELOPER_AUTHORED` and whose class is a declared *instruction* class resolves to the
  restricting disposition rather than falling to the floor.
- **Rung 6b — uncorroborated Tier-C evidence release. Owned by Wave 4A Task 2.** An uncorroborated
  Tier-C prompt finding resolves to `allow` + MONITOR marker; a corroborated one resolves as today.

**6a is evaluated before 6b, and a finding restricted at 6a never reaches 6b.** The release at 6b is
a false-positive remedy for a weak keyword match in text the principal typed. Provenance says the
principal did not type it, which is precisely the corroborating context whose absence 6b requires.
This is the same rule Wave 4A already states for obfuscation — *"anything obfuscation-derived
(`NormalizedOnly`) is never released"* — extended to derived origin, and it relaxes nothing.

**Rung 7 is rewritten in place by Task 10 of this wave.** Same position, same precedence, different
inputs. `baseCapabilityImpact` + `evidenceStrength` define a maximum justified intervention; they do
not author the disposition by themselves. The engine first reads an explicit per-class offline
posture, applies the quoted-finding/decode-budget rule adjustment, and caps that posture with the
grade matrix in Task 10. This distinction is load-bearing: a normal `git push` has high potential
impact but remains an observation, while a weak or unknown signal can never block on its own. No wave
may delete rung 7 — rule 5 requires the local rulebook to reach a verdict with no backend.

**Standing rules for anyone inserting a rung.**

1. Insert by rung number. **Do not write "the four existing branches", "the fifth branch", or any
   other count** — the count changes as this ladder fills, and a phrase like that is correct on the
   day it is written and wrong on the day it lands.
2. A wave may add its own rung and rewrite the rung it owns. It may not reorder, merge or delete any
   other rung.
3. Every new rung is added to this table in the same commit that lands it, with its measured line
   number. A rung that exists in code and not here is the drift this section exists to stop.
4. **The browser extension carries a full twin of this ladder and it moves in lockstep.**
   `browser-extension/src/policyeval.js:298-320` is `prClassAction` with all seven rungs in the same
   order — shadow `:302`, monitor lane `:304`, actions map `:305`, legacy block `:309`, legacy warn
   `:310`, explicit-disable `:316`, floor `:317-319` — and its docblock at `:295-297` says it mirrors
   the Go function. `policyeval.go:462-463` states the lockstep rule for the DLP twin in the same
   file; it holds identically here. A rung landed on one engine and not the other means the Codex and
   Claude lanes decide differently on the same finding.

### Working discipline

Concurrent sessions use these checkouts. Work in an isolated worktree per repo; never switch branch
in a shared checkout; **never `git stash`** (`refs/stash` is shared repo-wide);
`git add <explicit paths>`, never `-A`. Frontend string literals, template spans and JSX text may not
contain U+2014 (`npm run check:no-em-dash`; comments are exempt). Frontend jest has no
`setupFilesAfterEnv`, so every new test file using `toBeInTheDocument` must
`import "@testing-library/jest-dom"` itself.

---

## Task 1: One `severityBasis` shape, and an Events surface that renders it

**Files:**
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts:169-176`
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:1-9, 409-421`
- `Backend/src/ai-governance/services/detections-absent-facets.spec.ts:141-147`
- `Backend/src/ai-governance/services/ai-event-severity.contract-parity.spec.ts` (create)
- `Frontend/types/ai-governance.ts:1500-1509, 1594`
- `Frontend/app/ai-control-plane/events/events-content.tsx:342-362`
- `Frontend/app/ai-control-plane/events/__tests__/events-content.test.tsx:471-478`
- `Frontend/app/ai-control-plane/detections/__tests__/detection-view-model.test.ts:331`

- [ ] Rewrite the Events fixture in the **producer's** key names, taken from
      `ai-event-severity.util.ts:648-657`, with `formulaVersion: 4` (not 3 — v1's fixture is stale
      against `AI_EVENT_SEVERITY_FORMULA_VERSION` at `util.ts:48`). Cast temporarily so the assertion
      compiles against today's wrong type; the cast is deleted in the last step.
- [ ] Run it and watch it go red: the tooltip renders `tier B` and the adjustments, and neither
      `class aws-access-key` nor `base high`.
- [ ] Correct the published contract to the producer's members — `formulaVersion`, `class`, `ruleId`,
      `base`, `evidenceTier`, `tier`, `enforcementEligible`, `adjustments`. Keep `evidenceTier` as
      `string | null` on the **stored** type; the closed `A|B|C|D` vocabulary is enforced at write
      time by `sanitizeStructuredFindings` (`ai-event.service.ts:3014`) and narrowing the read type
      would make a legacy row untypeable.
- [ ] Delete the rival local declaration at `ai-event-severity.util.ts:409-421` and re-export the
      contract type from the same name, so the producer object is structurally checked against the
      published shape at compile time.
- [ ] `npm run build:shared-contracts` and commit `packages/shared-contracts/dist/**`.
- [ ] Update `detections-absent-facets.spec.ts:141-147` to the new member list. Do **not** delete the
      assertion — it is the pin that made this defect findable.
- [ ] Mirror the type in `Frontend/types/ai-governance.ts:1500-1509`, fix `severityTitle` to read
      `basis.class` / `basis.base`, and delete the `as never` at `detection-view-model.test.ts:331`.
- [ ] Create `ai-event-severity.contract-parity.spec.ts`: assert the produced object satisfies the
      contract type (compile-time) and that its runtime member set equals the contract's, sorted.

**Defeat test:** `ai-event-severity.contract-parity.spec.ts` — re-add `findingClass` to the contract
type and remove `class`; it must fail with a member-set diff, and the Events test must fail with the
tooltip missing `class aws-access-key`. Expected text: `Expected: ... "class" ... Received: ... "findingClass"`.

**Exit:** `git grep -c "AiEventSeverityBasis = {" -- Backend/packages Backend/src Frontend/types`
returns **1** (today 3: contract, util, Frontend mirror). **3 of 3** producer key names resolve in
the Events tooltip (today 1 of 3). `as never` count in `detection-view-model.test.ts` for
`severityBasis`: **0**.

---

## Task 2: Five bands in the Backend vocabulary — HARD GATE (O-6), deploy before Task 4

**Deploy ordering — O-6, and it is destructive if inverted.** Every artifact this task produces is
Backend-side and must be **deployed to production** before Task 4's console change ships. Two
independent failures, both fleet-wide, both immediate:

- `?severity=info` against a four-member `@IsIn` (`list-ai-detections.dto.ts:86`) 400s the **whole
  request**, not the offending member. A detections page that renders a five-band facet rail against
  an undeployed Backend returns nothing at all the first time an operator ticks *Info*.
- An info-banded row violates `CHK_ai_events_severity`
  (`migrations/1787100000000-AddAiEventSeverity.ts:45-52`), so the INSERT fails and the event is lost
  rather than mis-banded.

The console change is Task 4 and it carries the matching `**Depends on:**` line. Verify the order by
the **Deploy-to-ECS job** result, not the workflow run conclusion — the run conclusion has lied here
before.

**Files:**
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts:165`
- `Backend/src/migrations/<new>-WidenAiEventSeverityToFiveBands.ts` (create)
- `Backend/src/ai-governance/services/ai-query.service.ts:756-758, 6577`
- `Backend/src/ai-governance/dto/ai-response.dto.ts:2598-2603`
- `Backend/src/ai-governance/dto/list-ai-detections.dto.info-band.spec.ts` (create)
- `Backend/src/ai-governance/services/ai-query.detections-aggregates.live-pg.spec.ts` (expectations)

- [ ] Write `list-ai-detections.dto.info-band.spec.ts` first: `?severity=info` must validate. Red
      today with a class-validator `isIn` message naming the four-member tuple.
- [ ] Widen `AI_EVENT_SEVERITIES` to `['info','low','medium','high','critical']`, rebuild `dist/`.
- [ ] New migration: drop and re-add `CHK_ai_events_severity` with five values. Forward-only (D9) —
      **do not rewrite any stored row**; the evidence chain must keep verifying.
- [ ] Extend `DETECTION_SEVERITY_RANK_SQL` with `WHEN 'info' THEN 0`. Keep the `ELSE NULL` arm and the
      `NULLS LAST` ordering — an unassessed row must still never outrank an assessed one, and must
      never be bucketed as `info`.
- [ ] Add `info` to `detectionSeverityCounts` (`ai-query.service.ts:6577`) and to
      `AiDetectionSeverityCountsDto` (`ai-response.dto.ts:2598-2603`). Preserve the existing rule
      written at `ai-response.dto.ts:2588-2596`: a NULL severity is counted **nowhere**, never folded
      into the lowest band, and the counts may therefore sum to less than `total`.
- [ ] `npx jest src/ai-governance` plus the live-pg aggregates spec against a real Postgres. **C5:
      ~97 live-pg specs now fail dark rather than green when Postgres is absent — a "green" run with
      no container is a NOT-RUN.**

**Defeat test:** `list-ai-detections.dto.info-band.spec.ts` — revert `AI_EVENT_SEVERITIES` to four
members and it goes red with `severity must be one of the following values: low, medium, high, critical`.
For the CHECK constraint, `ai-query.detections-aggregates.live-pg.spec.ts` must fail on the INSERT
with `violates check constraint "CHK_ai_events_severity"`.

**Exit:** **5 of 5** server gates in the §2 table accept `info` (today 0 of 5).
`GET /api/v1/ai/detections?severity=info` returns 200. **Deployed to production before any Frontend
change in Task 4 ships (O-6)** — Backend before console, no exceptions, and the evidence is the
Deploy-to-ECS job result.

---

## Task 3: One home for read-time band translation (D9)

**Files:**
- `Frontend/lib/severity.ts` (create — does not exist on `origin/main`)
- `Frontend/lib/__tests__/severity.test.ts` (create)
- `Frontend/types/ai-governance.ts` (band type)
- `Frontend/app/ai-control-plane/detections/detection-view-model.ts:78-112`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/session-severity.ts:39-51, 183-196`

- [ ] Write the test first: one exported `bandOfStored(value)` that lowercases, validates against the
      five-band tuple, and returns `"unknown"` for anything else — including `""`, `null`, and a band
      this build does not know. **A future sixth band must read `unknown`, never round down to `info`.**
- [ ] Create `Frontend/lib/severity.ts` with the single tuple, `bandOfStored`, `severitySignalVar` and
      the rank map. Everything else imports from it.
- [ ] Repoint `meterSeverityOf` / `sparkSeverityOf` and the whole of `session-severity.ts` at it.
      Delete their local tuples.

**TRAP — scope.** `components/ai-console/sessions/sessions-hero-model.ts:44` (`FACET_ORDER`, a
`RunRiskBand`) and `lib/queue-envelope.ts:171` (`QUEUE_SEVERITIES`) are **different vocabularies for
different products**. Do not fold them in. The scope of this task is exactly the AI-detection band:
`detection-read-model.ts`, `detection-view-model.ts`, `session-severity.ts`.

**Defeat test:** `lib/__tests__/severity.test.ts` — reintroduce a local `toLowerCase()` band
derivation in `detection-view-model.ts` and the module-count assertion goes red. Expected text:
`expected 1 band-tuple definition, found 2`.

**Exit:**

```bash
cd /c/Users/Owner/Documents/Ceragon/Frontend
git grep -nE '\["critical", "high"|^\s+critical:' origin/main -- \
  app/ai-control-plane/detections/detection-read-model.ts \
  app/ai-control-plane/detections/detection-view-model.ts \
  'app/ai-control-plane/ai-sessions/[id]/session-severity.ts'
```

**0** independent detection-band declarations remain in those three files (today **4**:
`detection-read-model.ts:52`, `detection-view-model.ts:78` and `:99`, `session-severity.ts:39`,
with matching label and signal-var maps at `session-severity.ts:46` and `:183`). `Frontend/lib/severity.ts`
is the only definition site.

---

## Task 4: The fifth band reaches the filter, the bar and the row spine

**Depends on:** Task 2 **deployed to production** (O-6). Not merged — deployed, and confirmed by the
Deploy-to-ECS job. Shipping this first makes the Info facet a 400 on the whole detections request.

**Files:**
- `Frontend/app/ai-control-plane/detections/detection-read-model.ts:42-53, 134-160`
- `Frontend/app/ai-control-plane/detections/severity-band.tsx`
- `Frontend/components/ai-console/segbar.tsx`
- `Frontend/app/ai-control-plane/detections/facet-rail.tsx`
- `Frontend/app/globals.css:1594-1599`
- `Frontend/app/ai-control-plane/detections/__tests__/severity-five-bands.test.tsx` (create)

- [ ] Test first: an `info` row is filterable, appears in the distribution bar, and paints a spine.
- [ ] Point `SEVERITY_BANDS` at the Task 3 tuple. Widen the facet rail, the `SegBar` and the URL
      filter serialisation with it.
- [ ] Add `.tbl-row[data-sev="info"] { --sev-spine: var(--signal-info); }` immediately after the
      `low` rule at `globals.css:1598`, before the `unknown` hatch that opens at `:1599`. The hatch
      must stay last — `unknown` is a warning state, not a band, and it may not inherit a spine.
- [ ] `readSeverityCounts` must answer `null` when the server returns a four-member aggregate.
      **A missing band is NOT MEASURED, never zero** — the same rule as RULE 7
      (`ai-security-policy.service.ts:725-727`) and the same rule Wave 5 Task 10's defeat test
      exercises on the certificate manifest.

**Defeat test:** `severity-five-bands.test.tsx` — delete the `info` case from `SEVERITY_BANDS`; the
filter assertion goes red with `Unable to find an element with the text: Info`. Separately, feed
`readSeverityCounts` a four-member object and prove it returns `null`; a version that folds the
missing band to `0` must fail.

**Exit:** `.tbl-row[data-sev="info"]` exists in `globals.css`; the facet rail, distribution bar, URL
filter and row meter all draw **5 of 5** bands (today 2 of 4 surfaces draw 5); `readSeverityCounts`
returns `null` on a four-band aggregate.

---

## Task 5: Retire the word "confidence", and take the mechanism label off the policy path

**Files:**
- `Backend/src/ai-security-policy/ai-class-metadata.ts:9-31, 33, 44-46, 89-104, 435-437`
- `Backend/src/ai-security-policy/ai-policy-presets.ts:15, 253, 258-283`
- `Backend/src/ai-security-policy/ai-policy-presets.evidence-mechanism.spec.ts` (create)
- `Frontend/components/admin/ai-security-policy-section.tsx:120, 453-465, 976, 1071, 2910, 4251, 4268, 4306, 5597`
  (the twelve sites the §5 census prints)

- [ ] Test first. Assert that (a) no exported symbol under `src/ai-security-policy/` is named
      `confidence*` unless it carries a calibration record, and (b) the preset builder receives its
      tier from a field literally named `evidenceMechanism`.
- [ ] Rename `AiClassConfidence` → `AiClassMechanismTier`, `confidenceForMechanism` →
      `mechanismTier`, `confidenceOf` → `evidenceMechanismOf`, and the metadata member
      `confidence` → `evidenceMechanism`. This is a rename, not a semantic change: **the shipped
      preset actions must be byte-identical before and after.**
- [ ] Correct the false docblock at `ai-class-metadata.ts:30`. It currently claims the field is
      "purely descriptive". Replace with the measured truth: it selects the shipped preset action for
      every DLP and prompt-risk class via `ai-policy-presets.ts:258-283`, and it is an authored
      mechanism label with no heldout labels, PPV, support, interval or calibration error — so it may
      never be presented to a customer as confidence.
- [ ] Frontend: rename the chip, its label, and the `enableConfidenceSort` prop (`:5597`). Rewrite
      the four *"High-confidence combination…"* descriptions (`:453`, `:457`, `:461`, `:465`) to name
      the **mechanism** — e.g. *"Two named signals in one message: override plus hidden-context
      theft"*. Rewrite all three taint strings — *"a high-confidence match taints the session"*
      (`:4251`), *"Automatic high-confidence taint hold enabled"* (`:4268`) and *"Automatic taint hold
      only reacts to high-confidence correlations"* (`:4306`) — to state what actually happens: a
      finding above the INFO tier, or a sensitive path/op, taints. **State the fact, never the
      in-house rationale.** `:4306` is the one an earlier draft of this wave missed; run the §5
      census, do not work from this list.
- [ ] Add the ban as a lint-shaped guard beside the existing `check:no-em-dash` pattern: the word
      `confidence` is forbidden in customer-facing copy under `Frontend/components/admin/` and
      `Frontend/app/ai-control-plane/` unless the same JSX subtree renders a support count.

**Defeat test:** `ai-policy-presets.evidence-mechanism.spec.ts` — snapshot every rung's full DLP and
prompt-risk action map before the rename and assert byte-equality after. Reverting the rename must
leave the snapshot green (proving it is a pure rename); changing any `mechanismTier` return value
must turn it red with a per-class action diff. The copy guard goes red on reinserting
`High-confidence combination` with `expected 0 uncalibrated "confidence" strings, found 4`.

**Exit:** `git grep -cw confidence -- Backend/src/ai-security-policy Frontend/components/admin` counts
only calibrated uses; the four preset rungs produce **identical** action maps to the pre-rename
snapshot (**0 of 30 DLP classes and 0 of N prompt-risk classes change action**). The word
`confidence` appears **0** times in admin-console copy.

---

## Task 6: Three graded fields, generated from the producer catalogs

Replaces v1 Task 8's single `ClassImpact`. **The invariant "impact equals the detector tier" is
deleted, and no replacement invariant may derive one axis from another.**

### This wave owns `formatVersion 3`, and Wave 4B bumps to 4 — decided here, once (D-6)

`Installers/parity-vectors/toolrisk-classes.v1.json` is a digest-pinned file vendored into **three**
repos. Two waves add columns to it: this one adds the `grades` block, Wave 4B Task 1 adds
`proposalKind`. **Wave 4B bumps `formatVersion` to 4 explicitly.** It does not ride this wave's bump.

The reasoning, because a later reader will want to reopen it:

- **This wave cannot truthfully populate `proposalKind`.** Its producer is `ClassCatalog()`
  (`internal/toolrisk/class_catalog.go:57-68`), which loops the live rule tables, and the field does
  not exist on it. Adding it is Wave 4B Task 1's own first step. A column emitted here would be a
  value no producer sets — the declared-not-measured defect this wave exists to remove.
- **The two changes cannot be one commit anyway.** O-14 puts this whole wave before every Wave 4
  enforcement change, so the file is regenerated and re-vendored twice regardless. The only question
  is whether `formatVersion` moves with it.
- **A schema change under an unchanged `formatVersion` is exactly the silent drift the pin exists to
  catch.** Both consumer specs assert the version literally — `expect(vector.formatVersion).toBe(2)`
  at `ai-security-policy.tool-risk-class-parity.spec.ts:171` — so a new column landing under an
  unchanged 3 passes a green check that is measuring nothing.
- **Neither bump disturbs the tier digest.** Verified: `canonicalCatalogDigest`
  (`tool-risk-class-parity.spec.ts:159-166`) hashes `vector.tiers` and nothing else, and the spec
  compares it to `vector.sha256` at `:176-178`. `grades` gets its own `gradesSha256`; `proposalKind`
  changes `gradesSha256` and leaves `sha256` alone.

**Standing rule for this file, from here on: no schema change lands under an unchanged
`formatVersion`.** Every bump updates, in the same commit, both consumer parity specs
(`Backend/src/ai-security-policy/ai-security-policy.tool-risk-class-parity.spec.ts` and
`Frontend/components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts`) and re-vendors
a byte-identical file to `Backend/packages/shared-contracts/` and `Frontend/types/vendored/`, with
`node ci/lib/vocab-parity.mjs` reporting PASS across all three — never `NOT CHECKED`, which is what it
prints on a missing checkout.

**Files:**
- `Installers/internal/toolrisk/class_grades.go` (create)
- `Installers/internal/toolrisk/class_grades_test.go` (create)
- `Installers/internal/toolrisk/class_catalog_test.go` (vector generation)
- `Installers/parity-vectors/toolrisk-classes.v1.json` (regenerated — **never hand-edited**)
- `Backend/packages/shared-contracts/toolrisk-classes.v1.json`, `Frontend/types/vendored/toolrisk-classes.v1.json` (copied)
- `Backend/src/ai-security-policy/ai-security-policy.tool-risk-class-parity.spec.ts:171, 226-230`
- `Frontend/components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts`
- `Backend/packages/shared-contracts/dlp-classes-grades.v1.json` (create)
- `Backend/scripts/generate-ai-event-impact-catalog.cjs` (create)
- `Backend/src/ai-governance/services/ai-event-impact-catalog.generated.ts` (create)
- `Backend/src/ai-governance/services/ai-event-impact-catalog.spec.ts` (create)
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:289-335, 432-437, 549`

The three fields, and what each one is **allowed** to say:

| Field | Vocabulary | Who decides | What it may never be |
|---|---|---|---|
| `evidenceStrength` | `validated` \| `corroborated` \| `probable` \| `weak` \| `unknown` | the detector, per finding | never inferred from severity; `unknown` is a real value and the default |
| `baseCapabilityImpact` | `info` \| `low` \| `medium` \| `high` \| `critical` | the catalog, per class | a **context-free upper bound on capability**; never "production impact" |
| `resolvedConsequence` | `unresolved` \| the five bands | policy, per event | `unresolved` for **every tool class** until Wave 4B's effect resolver exists |

- [ ] **Reuse, do not invent.** Map `evidenceStrength` onto the tiers that already ship:
      `dlp.EvidenceTierA→validated, B→corroborated, C→probable, D→weak`, empty/absent→`unknown`
      (`Installers/internal/dlp/private_key.go:34-39`). Take `baseCapabilityImpact` for the 55
      catalogued classes from `internal/aipolicycontract/detector_catalog_generated.go`
      (`HardStopEligible`, `Exploitability`, `CredentialRole` already encode it). **Only the 40
      tool-risk classes need a new declaration**, because the detector catalog contains zero of them.
- [ ] Write `class_grades_test.go` first, with three assertions that must all fail on an empty file:
      totality over `ClassCatalog()` (40/40); **no class's `baseCapabilityImpact` may be a function
      of its `ClassCatalog()` severity** — assert the two are not order-isomorphic, naming at least
      `chmod-broad-777` (detector HIGH, capability depends entirely on the target path) and
      `reverse-shell` (detector HIGH, capability HIGH, and it destroys nothing) as the disproof pair;
      and every row carries a written `rationale` string.
- [ ] Write `class_grades.go`. `evidenceStrength` for tool-risk is `probable` for every regex rule and
      `corroborated` for the three shell-AST classes (`ClassInterpreterExec`, `ClassFetchThenExec`,
      `ClassSubstitutionExfil`, `internal/toolrisk/class_catalog.go:47-51`), because an AST match
      resolves the command word rather than matching a substring. **Nothing is `validated` on the
      tool lane** — no tool-risk detector validates anything today, and saying otherwise is the
      declared-not-measured defect.
- [ ] Regenerate the parity vector to **formatVersion 3** with a `grades` block and its own
      `gradesSha256`. The existing `sha256` covers `tiers` only —
      `canonicalCatalogDigest(vector.tiers)` at
      `ai-security-policy.tool-risk-class-parity.spec.ts:159-166`, compared to `vector.sha256` at
      `:176-178` — so do not fold the new block into it, or every consumer digest breaks for a reason
      unrelated to tiers. `TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/`, then copy the
      byte-identical file into both consumer repos (`ci/lib/vocab-parity.mjs` verifies all three;
      C14 — it currently runs at the workspace root only, and Wave 1 moves it into a repo's CI).
      **Do not add a `proposalKind` column here.** It is Wave 4B Task 1's, on formatVersion 4 — the
      decision block above says why.
- [ ] Update both consumer parity specs: `formatVersion` 2 → 3 (the literal is at
      `ai-security-policy.tool-risk-class-parity.spec.ts:171`), plus a new assertion that the grades
      block is total over `vector.classes`.
- [ ] Create `dlp-classes-grades.v1.json` from the detector catalog plus the DLP registry, and
      `generate-ai-event-impact-catalog.cjs` that emits
      `ai-event-impact-catalog.generated.ts` from both files. Its spec asserts byte-equality with a
      fresh generation, and totality over both producer vocabularies.
- [ ] Delete `BASE_BY_CLASS` (`ai-event-severity.util.ts:301-335`) and point `baseForFinding`
      (`:432-438`, the lookup at `:437`) and the `unknown-class-default` marker at `:549` at the
      generated table. Keep the `?? 'medium'`
      fallback — `sanitizeStructuredFindings` accepts any 64-char class, so an unrecognised class is
      an unknown secret, not a safe one. `git grep -n BASE_BY_CLASS -- Backend/src/` must print nothing.

**Defeat test:** (a) `TestClassGrades_IsTotalOverTheCatalog` — add a class to `astClassSeverity` and
omit it from `class_grades.go`; expected `class "x" has no grade row`. (b)
`TestClassGrades_ImpactIsNotTheDetectorTier` — set every class's `baseCapabilityImpact` equal to its
`ClassCatalog()` severity and it must go red with
`baseCapabilityImpact is order-isomorphic to the detector tier; that is syntax, not impact`.
(c) `ai-event-impact-catalog.spec.ts` — hand-edit one entry in the generated file; expected a
byte-diff against `build()`.

**Exit:** `parity-vectors/toolrisk-classes.v1.json` is formatVersion 3, `gradesSha256` recomputes,
**byte-identical across all 3 repos**, and `node ci/lib/vocab-parity.mjs` prints PASS rather than
`NOT CHECKED`. The tiers digest `sha256` is **unchanged** at
`sha256:2cc7caeff31a09169d5d947fddf805f5d1f4f7eddcfcc984be5f83e69d1af922` — a moved tiers digest means
a class changed tier, which this task does not do. **`proposalKind` is absent from the file at this
wave's exit**; it arrives at formatVersion 4, owned by Wave 4B Task 1.
`AI_EVENT_IMPACT_BY_CLASS` covers **40 of 40** tool-risk classes and **every member of
`AI_DLP_CLASSES`**. `resolvedConsequence` is `unresolved` for **40 of 40** tool classes.
**Totality over the producer set is `UNKNOWN (blocked on Wave 1)`.** The generated table can only be
total over `AI_DLP_CLASSES` = **30**, which is 30 of the DLP producer's **81**. Counted at
`origin/main`, the classes that can reach `deriveAiEventSeverity` are:

| Producer | Count | Discovery |
|---|---:|---|
| DLP | **81** | `RegisteredClasses()`, `internal/dlp/registry.go:221` (33 + 48) |
| tool-risk | **40** | `ClassCatalog()`, `internal/toolrisk/class_catalog.go:57` |
| prompt-risk | **14** | class constants, `internal/promptrisk/promptrisk.go:53-86` — folded into the same findings array by `foldPromptRiskFindings` (`ai_handlers.go:1448`), so they hit `BASE_BY_CLASS` too |
| ingress-risk | **7** | `git grep -oE '= "ingress-[a-z-]+"' origin/main -- internal/ingressrisk` — **reachability of `deriveAiEventSeverity` NOT VERIFIED this pass; confirm before counting it** |

So the true denominator is **135 verified + 7 unverified = 142**, against a table that covers 30 today
and a pinned detector catalog that covers 55. **The pinned catalog is already one class behind its own
ingress producer** — it has 6 ingress classes and the producer emits 7 (`ingress-remote-code-exec` is
absent). Record that; do not fix it here (it is Wave 1's generator work).

The criterion becomes `|AI_EVENT_IMPACT_BY_CLASS| == 135` **the day Wave 1 lands**, and this wave
records it as not-yet-measurable rather than claiming totality over a truncated denominator.
**The static "all 30 DLP classes" wording at `plan:4566` is deleted.**

---

## Task 7: The grade reaches the Backend on both lanes

**Ordering inside this task is load-bearing — this is O-7, and it fails silently, which is worse than
failing loudly.** Steps 1-4 are Backend (the DTO at `ai-prompt-check.dto.ts:76-96`, the storage
vocabulary, and **both** controller mappers) and must be **deployed** before steps 5-8 (the agent) are
released.

The mechanism, verified: `AgentIngestValidationPipe` routes an agent wire DTO down the lenient branch
(`src/common/pipes/agent-ingest-validation.pipe.ts:89-93`), and its own docblock at `:52-55` states
that `whitelist: true` is on **both** branches — *"An undeclared member is still stripped from the
instance before it reaches a service… the agent path drops the key instead of dropping the request."*
So an agent shipped first does not 400. It sends `evidenceStrength` and `enforcementEligible`, the
pipe removes them, and the Backend stores a basis without them. **No error, no data, and the
aggregation fold looks like it works** — the weakest-occurrence test in this task passes on a field
that never arrives. There is no signal anywhere that tells you it happened.

Deploy Backend, confirm by the **Deploy-to-ECS job** result rather than the workflow run conclusion,
and only then cut the agent release.

**Files:**
- `Backend/src/ai-governance/dto/ai-prompt-check.dto.ts:76-96` (`AiPromptFindingDto`)
- `Backend/src/ai-governance/controllers/ai-agent.controller.ts:377-382` **and** `:875-880`
- `Backend/src/ai-governance/dto/ai-prompt-check.dto.evidence-grade.spec.ts` (create)
- `Installers/internal/toolrisk/toolrisk.go:50-62`
- `Installers/internal/core/backend/ai_prompt.go:35-40`, `internal/core/backend/ai_tool.go:29-34`
- `Installers/internal/daemon/ai_handlers.go:4016-4039, 4295-4318`
- `Installers/internal/daemon/ai_findings_evidence_test.go` (create)

Both controller mappers rebuild `{class, ruleId, count, severity}` by hand and would drop the new
fields even with the DTO declaring them. **The second one is the tool lane and v1 missed it** — and
its line number has drifted twice (v1 said `:838-842`, the disposition material said `:877-882`;
measured today it is `:875-880`). Find it with:

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend
git show origin/main:src/ai-governance/controllers/ai-agent.controller.ts | grep -n "count: f.count"
```

- [ ] Backend test first: a finding carrying `evidenceStrength`, `evidenceTier` and
      `enforcementEligible` survives the **lenient** pipe (built from
      `LENIENT_AGENT_INGEST_VALIDATION_OPTIONS`, not by importing the controller) and reaches
      `severity_basis`; an **unknown** `evidenceStrength` value travels rather than 400ing the report,
      and is dropped at storage.
- [ ] Declare the fields on `AiPromptFindingDto` as `@IsOptional() @IsString() @MaxLength(32)` /
      `@IsBoolean()`. **No `@IsIn`.** `AiToolCheckDto.findings` is the same DTO
      (`ai-prompt-check.dto.ts:1063`), so both lanes are covered by one declaration.
- [ ] Extend `sanitizeStructuredFindings` (`ai-event.service.ts:3014-3020`) with a closed
      `evidenceStrength` vocabulary beside the existing `evidenceTier` (`:3014`), `tier` (`:3016`) and
      `enforcementEligible` (`:3018-3020`) checks. Closed at **storage**, never on the wire.
- [ ] Fix **both** mappers. Ship and deploy Backend.
- [ ] Add `EvidenceStrength` and `EnforcementEligible *bool` to `toolrisk.Finding:50-62` and populate
      them from `class_grades.go`. Keep them `omitempty`: a legacy ungraded finding must send neither
      key, and the Backend's "absent is not false" rule (`ai-event-severity.util.ts:447`) depends on it.
- [ ] Add the fields to `backend.AiPromptFinding` and `backend.AiToolFinding`.
- [ ] **TRAP — aggregation is where a grade gets silently strengthened.** `toBackendFindings:4295` and
      `toBackendToolFindings:4016` collapse by class and keep the **first** occurrence's ruleID and
      severity. For a grade that gates enforcement, the fold must be conservative: the aggregate
      carries the **weakest** `evidenceStrength` of any occurrence, and `enforcementEligible: false`
      if **any** occurrence is ineligible. Write that as its own test; a max-fold is a guard weakening
      dressed as an aggregation detail.
- [ ] Do not add a fifth copy of the transform-eligibility predicate. Export one helper from
      `internal/contenttransform` and have `transformWillAccept` (`ai_handlers.go:853+`) call it.
      **Behaviour must be identical** — the docblock there says "NOT a place to loosen anything", and
      the two browser-extension copies (`browser-extension/src/content-transform.js:113-119, 220-233`)
      must stay in step or the Codex and Claude lanes diverge.

**Defeat test:** `ai-prompt-check.dto.evidence-grade.spec.ts` — revert either controller mapper and
the field is absent at the DTO boundary: `expected severityBasis.evidenceTier to be "B", received null`.
Go side, `TestToBackendToolFindings_FoldsToWeakestEvidence` — change the fold from weakest to first
and it goes red with `aggregate reported evidenceStrength=validated for a class with a probable occurrence`.
`TestToBackendFindings_LegacyUngradedSendsNeitherKey` must stay green throughout.

**Exit:** A prompt-check **and** a tool-check finding both land `evidenceStrength` /
`enforcementEligible` in `severity_basis`. `git grep -n "count: f.count" -- Backend/src/ai-governance/controllers`
returns **2** sites and **both** carry the grade. `plan:2067`'s tool-lane exemption is deleted from
the plan text. **Backend deployed before the agent release** — verified by the Deploy-to-ECS **job**
result, not the workflow run conclusion.

---

## Task 8: Evidence strength on the console, beside impact, never blended into it

**Files:**
- `Frontend/lib/severity.ts` (append), `Frontend/lib/__tests__/severity.test.ts` (append)
- `Frontend/app/ai-control-plane/detections/evidence-mark.tsx` (create)
- `Frontend/app/ai-control-plane/detections/__tests__/evidence-mark.test.tsx` (create)
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:381-390, 442, 452`
- `Frontend/app/globals.css` (after the `.tbl-row[data-sev="unknown"]` rule)

- [ ] Test first for `evidenceStrengthOfStored`: reads `evidenceStrength` when present; falls back to
      the letter tier (`A→validated, B→corroborated, C→probable, D→weak`); falls back again to the
      coarse `tier` (`validated→corroborated`, `heuristic→probable`); prefers the strongest-specified
      source, not the strongest value; reports `enforceable` as a **separate tri-state** where absent
      is `null`, not `false`; and answers `unknown` — never `weak` — for a row that was never graded
      or carries a token this build does not know.
- [ ] Build `evidence-mark.tsx`. It renders a **word**, carries **no `data-sev`** and no signal colour,
      and sits beside the impact meter, never inside it. An ungraded row reads `not graded`, never
      `Weak`. This replaces the truncated 12.5px `tierSubtext` at `detections-content.tsx:381-390`.
- [ ] Delete `tierSubtext` and its call sites (`:442`, `:452`).

**Defeat test:** `evidence-mark.test.tsx` — give the component `{}` and assert it renders
`not graded`; change the fallback to `weak` and it goes red with
`Unable to find text: not graded`. Add `data-sev` to the mark and the "colour is reserved for impact"
assertion fails.

**Exit:** every detection row shows an impact meter **and** a separate evidence mark; the mark carries
`data-sev` on **0** rows; a row with no grade reads `not graded` on **100%** of ungraded rows in the
render-harness fixture set (C15, `Frontend/scripts/render-harness/`).

---

## Task 9: Split `monitor` into three declared concepts, and stop a SHADOW class interrupting

This is the P0-06 core. **Two halves: one ships whole here, one is deliberately handed to Wave 4B
with a named external blocker. Do not merge them.**

### Who owns `taintRisky` — decided once, here (D-10)

Three waves have something to say about `taintRisky`
(`Installers/internal/daemon/ai_taint.go:159-166`), and only one of them changes it.

| Wave | What it owns | Ships? |
|---|---|---|
| **Wave 2 (here), 9b + 9c** | The **signature and the attribution**: the shadow gate, the resolved policy parameter, and the structured reason replacing the bare bool | **Yes — this is the wave that edits the function** |
| **Wave 4B Task 9** | A later **narrowing of the taint-eligible disposition set** — "monitoring alone must remain non-tainting" | **No.** Blocked on Product/Security ratification plus paired benign-sequence precision and poisoned-sequence recall. See 9d |
| **Wave 8** | **Nothing.** Its trap — *"Do not widen `taintRisky` or weaken it to widen mediation"* — is correct and stays | **No** |

Two consequences a reader must carry away:

- **Wave 8's trap is about behaviour, not about the source text.** By the time Wave 8 runs, this wave
  has already changed the function's signature and return type. A Wave 8 engineer who reads the trap
  as "this function is untouched" and finds a changed one will assume the trap is stale. It is not.
  The trap forbids **widening or weakening what makes a session risky**; refactoring for attribution
  is exactly what Wave 2 was asked to do.
- **Wave 4B Task 9's "`taintRisky` ships unchanged" means the eligible set is unchanged**, not the
  function. The function is already different by then. If 4B's ratification never arrives, what stays
  frozen is *which dispositions can taint* — the signature and the recorded reason stay.

**Files:**
- `Installers/internal/policyeval/shadow.go` (docs), `internal/daemon/ai_handlers.go:3716-3856`
- `Installers/internal/daemon/ai_taint.go:151-166` (`taintRisky` at `:159`), `:178` (`toolTargetsSensitive`)
- `Installers/internal/daemon/ai_taint_test.go:80-105` (`TestTaintRisky`; its six assertions at `:82-104`)
- `Installers/internal/daemon/ai_taint_shadow_test.go` (create)
- `Backend/src/ai-governance/services/activity-kind.util.ts:370-394` (docs only)
- `Backend/src/alerts/alerts.service.ts:840-881` (docs only)
- `.plans/m47a-20260822/v2-waves/DISPOSITION_VOCABULARY.md` (create)

### 9a — Declare the concepts. Change no behaviour.

- [ ] Write `DISPOSITION_VOCABULARY.md` naming four objects, each with the exact source that decides it:
      **private telemetry** (never leaves the endpoint — **no class is on it today; the set is empty
      by construction, not by flag**); **customer-visible detection** (`isDetectionEvent`,
      `activity-kind.util.ts:380-394` — a monitored finding IS one, via `dataClasses` at
      `ai-agent.controller.ts:881-883`, and it **counts against the FP and precision budget**);
      **SOC alert** (`aiAlertScopeSql`, `alerts.service.ts:862-881` — `TOOL_CALL_REQUESTED` is absent,
      **nobody is paged**); **enforcement** (the developer is stopped).
- [ ] State in the same document that today's `monitor` is **(2) + (3-via-taint)** and is **not (1)**,
      and that the D6 phrase "silent telemetry is fine" therefore does not describe `monitor`.
- [ ] Add the docblock cross-references in `activity-kind.util.ts` and `alerts.service.ts` so the next
      reader finds the other half. **Do not change `isDetectionEvent`.** Making a monitored row
      invisible would be a suppression, which its own docblock forbids and which review §11.5 rules
      out: if it is customer-visible it counts, and the answer is to count it, not to hide it.

### 9b — A SHADOW class may not interrupt on the tool lane. Ships here, whole.

`shadow.go` promises that a SHADOW class *"can NEVER interrupt: not block, not redact, not warn, not
hold."* `IsShadowClass` is consulted at `policyeval.go:405` and `:514` and **nowhere else**. The tool
lane has no shadow gate, and a taint-induced HOLD is an interrupt. Dormant today (zero SHADOW classes
shipped); live the day M4.7A ships its first new detector.

- [ ] Test first, in `ai_taint_shadow_test.go`: drive `catalogLifecycleOf` (the package var that
      exists precisely so *"a gate no test can drive is a gate nobody knows works"*) to mark one class
      SHADOW; taint a session; fire only that class. Expected today: **HOLD**. Required: **allow**.
      Add the twin for `decideToolRisk` — a SHADOW class named in `blockClasses` must not block.
- [ ] Add the shadow gate to `toolRiskDisposition` (`ai_handlers.go:3829-3844`) as the **first**
      statement, above the block/warn/monitor reads — same position as `policyeval.go:405`.
- [ ] Add it to `taintRisky`: a SHADOW-lifecycle class does not make an action risky.
- [ ] **Do not touch `toolRiskSelfDefenseClasses` (`ai_handlers.go:3822-3826`) or
      `toolTargetsSensitive` (`ai_taint.go:178`).** The self-defense floor and the sensitive-path arm
      are independent of the class lifecycle, and `TestShadowLookupDefaultIsThePinnedCatalog` must
      stay green.

### 9c — Make the taint decision attributable. Ships here.

- [ ] Change `taintRisky` to take the resolved policy and return a structured reason, not a bare bool:
      the class, its effective disposition from `toolRiskDisposition`, and which arm fired
      (`finding` | `sensitive-path`). Drop the unused `toolName` parameter or use it.
- [ ] Carry that reason into `emitToolCallHeld` / `emitToolCallReleased` (called at
      `ai_handlers.go:3072, :3078, :3085`) and onto the wire, so a held call records **why**. Note
      those functions already take a `taintReason` — that is why the **session** is tainted, not why
      **this call** was judged risky. Two different facts; today only the first is recorded.
- [ ] Update `TestTaintRisky` (`:80-105`) to assert the reason as well as the bool. Its first case
      (`:82-85`) —
      `privilege-escalation` at MEDIUM → risky — **stays true and stays green**; it now additionally
      records `disposition=monitor`, which is the fact that makes 9d decidable.

### 9d — Narrowing `monitor` out of the taint input: **handed to Wave 4B, blocked**

- [ ] Record, in this wave's text and in the certificate's `downgradeTriggers`, that
      *"monitoring alone must remain non-tainting"* (review §15, D6 row) is **not delivered here**.
      Narrowing removes a real Risk 5 control — the poisoned-session HOLD — and per the disposition
      material it requires Product/Security ratification of which monitor-policy signals may still
      make an already-tainted action risky, with **paired benign-sequence precision and
      poisoned-sequence recall** measured first. Those denominators do not exist until Wave 3 and the
      sequence corpora do not exist until Suite 4.
      **External dependency: a named Product/Security ratification decision. Not engineering. Owner's.**

**Defeat test:** `ai_taint_shadow_test.go::TestShadowClassNeverHoldsOnTaint` — remove the
`IsShadowClass` guard from `taintRisky` and it goes red with
`shadow class "x" produced decision=hold on a tainted session; shadow.go promises it can never interrupt`.
`TestToolRiskDisposition_ShadowWins` — remove the guard from `toolRiskDisposition` and a SHADOW class
in `blockClasses` blocks. `TestTaintRisky` must remain green in **all** six of its existing cases;
if any flips, the change narrowed something 9d says it may not.

**Exit:**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers
git grep -n "IsShadowClass(" origin/main -- internal | grep -v "_test\|internal/policyeval/shadow.go" | wc -l
```

returns **4** call sites (today **2**), covering all four lanes that can interrupt: DLP, prompt-risk,
tool-policy, taint.
**100%** of taint-induced HOLDs record class + effective disposition + arm (today **0%** — the
predicate returns a bare bool). `DISPOSITION_VOCABULARY.md` exists and is referenced from both
Backend files.
**"Monitoring alone is non-tainting" is `NOT_READY`**, owner-blocked, and Risk 4 and Risk 5 stay
non-green on that line.

---

## Task 10: No enforcing disposition is a pure function of `Finding.Severity`

**This task rewrites rung 7 of the §8 ladder, in place.** Same position, same precedence, different
input. It does not add a rung, does not move one, and does not delete the floor — rule 5 requires the
local rulebook to reach a verdict with no backend. Rungs 6a and 6b belong to Waves 4C and 4A; if
either has already landed when you get here, the floor you are rewriting is still rung 7 and its
position is unchanged.

**Files:**
- Create `Installers/internal/aigrade/fallback.go` and `fallback_test.go` — the shared grade
  vocabulary, 25-cell intervention ceiling and unknown-value behavior.
- Create `Installers/internal/toolrisk/fallback_posture.go` and `fallback_posture_test.go` — the
  explicit offline posture for all 40 tool classes and the separately authored taint projection.
- Create `Installers/internal/promptrisk/class_grades.go` and `class_grades_test.go` — the explicit
  impact and offline posture for all 14 prompt classes plus per-finding evidence projection.
- `Installers/internal/localdecide/tool.go` and `ai_fallback_grades_test.go` (`decideToolRisk`,
  `DefaultToolDecision`, and the self-defense floor; P9 PR #187 moved the authoritative bodies out
  of `daemon/ai_handlers.go`).
- `Installers/internal/localdecide/decision_golden_test.go` and
  `Installers/internal/localdecide/testdata/decision-golden.json` (the latter is immutable in this
  task; never regenerate or bless it from the changed tree).
- `Installers/internal/daemon/ai_taint.go` and `ai_taint_test.go` — replace the fifth severity switch
  with the dedicated taint projection without narrowing the six behaviors Task 9 pinned.
- `Installers/internal/policyeval/policyeval.go` (rung 7 only — the ladder's other rungs are out of
  scope), `ai_fallback_grades_test.go`, and `prompt_grade_parity_test.go`.
- `Installers/internal/proxy/ai_replay_promptrisk.go` and `ai_replay_promptrisk_test.go` — replay must
  use the same rung-7 predicate and must evaluate the SHADOW gate first.
- `Installers/browser-extension/src/policyeval.js`, `src/promptrisk.js`, their tests, and all five
  browser-extension version sources.
- Create `Installers/parity-vectors/prompt-grade-fallback.v1.json` — the Go/JavaScript contract for
  every prompt class and rule-level adjustment.
- `Installers/browser-extension/consumers.lock.json` and the exact vendored copies plus
  `Frontend/lib/ai-security/vendored/MANIFEST.json` — updated only after the source commit exists.

These are the **offline fallback** lanes and they may not be deleted: `decideTool:3745-3752` documents
keeping the legacy lane deliberately, because an agent in the field can outlive its backend and rule 5
says the local rulebook must always reach a verdict.

### Task 10 adjudication: grades are a ceiling, not a complete policy

The earlier wording was under-specified. A naïve `impact × evidence → disposition` matrix hardened
**14 of 40** ordinary tool observations, including turning a normal `git push` into a block. It also
lost the detector's quoted-text and decode-budget safeguards. That design is rejected. Capability
answers *how bad the represented capability could be*; evidence answers *how strongly this finding
supports the claim*. Neither says whether ordinary intended use should interrupt.

The normative resolver is therefore:

1. Read the class's explicit, reviewed offline posture.
2. Apply any rule-level finding safeguard before grading.
3. Compute the maximum intervention justified by `evidenceStrength × baseCapabilityImpact`.
4. Return the less restrictive of the declared posture and that ceiling.
5. Resolve an unknown class, impact or declared posture to `warn`: reviewable, but neither silently
   allowed nor hard-blocked without an authored contract. An unknown or future evidence value follows
   the frozen `unknown` matrix row below, so known `info`/`low` impact remains `allow` and known
   `medium`/`high`/`critical` impact becomes `warn`.

The complete grade ceiling is frozen here:

| Evidence \ impact | `info` | `low` | `medium` | `high` | `critical` |
|---|---|---|---|---|---|
| `validated` | allow | warn | warn | block | block |
| `corroborated` | allow | warn | warn | block | block |
| `probable` | allow | warn | warn | block | block |
| `weak` | allow | allow | warn | warn | warn |
| `unknown` or future value | allow | allow | warn | warn | warn |

An unknown impact resolves to `warn` for every evidence value. A weak or unknown signal can ask for
review but cannot deny on its own.

### Behavior-preserving migration contracts

- **Tool fallback:** all **40 of 40** classes have explicit postures: **3 allow, 12 warn, 25 block**.
  The migration must be exactly equal to the pre-Task-10 decision for every class — **0 relaxations
  and 0 unapproved hardenings**. `chmod-broad-777` is the sole named compatibility floor: its authored
  impact remains `medium`, while its reviewed legacy posture remains `block`. Keep this exception
  visible and class-specific; do not distort the shared matrix to hide it.
- **Prompt fallback:** all **14 of 14** classes have explicit postures. The three corroborated combo
  classes `injection-override-credexfil`, `injection-override-exfil`, and
  `jailbreak-persona-unrestricted` declare `block`; the other 11 declare `warn`. A quoted finding
  demotes that declared posture one step before the ceiling. A `decoded-payload-budget-exceeded`
  finding declares `allow` and carries weak evidence. These are detector contracts, not incidental
  severity behavior.
- **Taint is a distinct decision.** It must not be derived from the offline intervention posture.
  Exactly `action-git-commit`, `action-git-push`, and `action-pr-create` are ineligible; every other
  current class and every unknown/future class remains taint-eligible. Preserve Task 9's six existing
  taint behaviors and its structured class/disposition/arm attribution.
- **SHADOW always wins first.** DLP, prompt policy, tool policy, taint and replay must skip a SHADOW
  class before consulting a grade, posture, policy floor or acknowledgement key.
- **Go and JavaScript are one contract.** The 14-class parity vector includes grades, declared
  postures, evidence projection, quoted adjustment, budget-exceeded adjustment and final decisions.
  Browser source, its version contract, the Installers consumer lock and the Frontend vendored
  manifest must move through the source-commit/consumer-copy choreography; never hand-edit a digest
  before its source commit exists.

### Required implementation and proof

- [x] Pin all 25 matrix cells and unknown-value behavior before changing a caller.
- [x] Pin exact equality with the legacy fallback for all 40 tool classes; fail on a relaxation **or**
      an unapproved hardening, and separately pin the sole `chmod-broad-777` compatibility floor.
- [x] Repoint `DefaultToolDecision`, Go `prClassAction` rung 7, the JavaScript twin, and proxy replay
      to the shared grade-backed resolver. Replay must first apply `IsShadowClass` and then select
      exactly `warn`/`block` outcomes from that resolver.
- [x] Replace the daemon taint severity switch with `ClassTaintEligible`; prove the three exclusions,
      unknown-class fail-safe behavior, severity-mutation independence, and all six Task 9 cases.
- [x] Correct the self-defense floor without weakening it. For both `devoid-self-disable` and
      `sensitive-write-devoid`: unspecified → fallback (`block`), explicit allow → `warn`, explicit
      monitor → `warn`, explicit warn → `warn`, explicit block → `block`.
- [x] Prove Go/JavaScript equality over the whole prompt parity vector and bump every browser version
      source together.
- [x] Run P9's `TestExtractedCoreReproducesTheDaemonDecisionsExactly`. Keep
      `decision-golden.json` byte-identical at **2,842 rows**, SHA-256
      `5d520495e7abb64db521d6bf6ae446d5bf5a9d7ab4e9b4e4de92d9e8a76f20d8`. Record the expected
      self-defense correction as an explicit set of exactly **20 named pristine-warn → reviewed-block
      rows** in the test harness. Every name must exist and match the asserted before/after shape.
      Do not regenerate or bless the frozen JSON from the changed tree. Keep
      `TestGoldenStillDiscriminates` above its ≥70% matched floor.
- [x] After the Installers source commit exists, copy the exact browser sources into Frontend,
      recompute the manifest, run the consumer tests, then update the Installers consumer lock to the
      exact consumer file digests. Record the source and consumer commit SHAs in
      `PARALLEL_HANDSHAKE.md`.

**Defeat tests:** mutate any of the 25 matrix cells; mutate a tool class's grade or posture; remove the
`chmod-broad-777` floor; turn a quoted combo back into a block; make decode-budget exhaustion warn;
mix one SHADOW and one current prompt finding in replay; derive taint from disposition or change one
of the three action tags; restore the self-defense empty-disposition floor arm; change one of the 20
golden overlay rows; or make either engine disagree with the parity vector. Each mutation must make a
named test red.

**Exit:** the §7 grep returns **0** enforcing severity switches in the five migrated lanes. Tool
fallback is exactly equal for **40 of 40** classes. Go and JavaScript agree for **14 of 14** prompt
classes and every vector case. SHADOW remains non-interrupting on all Task 9 lanes, including mixed
replay input. Both self-defense classes pass the five-state matrix. The extraction golden reports
`strict=2717 drifted=0 tool=125`, its JSON hash and row count are unchanged, and exactly 20 reviewed
rows carry the explicit overlay. Task-10-local Go and browser tests have zero failures; pre-existing
baseline failures, if any, are reported separately and may not be hidden. The Frontend vendored
sources, manifest and Installers consumer lock identify and hash the exact same source commit.

---

## Wave exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **One basis type.** `git grep -c "AiEventSeverityBasis = {"` across
   `Backend/packages`, `Backend/src`, `Frontend/types` returns **1** (today 3).
   Defeat: `ai-event-severity.contract-parity.spec.ts` (Task 1).
2. **The Events tooltip tells the truth.** **3 of 3** producer key names resolve (today 1 of 3), and
   the Events fixture carries `formulaVersion` at all — today it carries **no** `formulaVersion` key,
   because the contract type it was written against has no such member, while the producer emits
   `formulaVersion: 4` on every basis.
   Defeat: `events-content.test.tsx` with the cast removed.
3. **Five bands, server first (O-6).** **5 of 5** gates in the §2 table accept `info` (today 0 of 5);
   the Backend carrying them is **deployed** — evidenced by the Deploy-to-ECS **job** result, not the
   workflow run conclusion — before any Task 4 console change ships.
   Defeat: `list-ai-detections.dto.info-band.spec.ts` + the live-pg CHECK-constraint assertion.
4. **One band translator.** The Task 3 grep, scoped to `detection-read-model.ts`,
   `detection-view-model.ts` and `session-severity.ts`, returns **0** independent declarations
   (today **4**); `Frontend/lib/severity.ts` is the only definition site. `RunRiskBand` and
   `QUEUE_SEVERITIES` are out of scope and stay untouched.
   Defeat: the band-tuple-count assertion in `lib/__tests__/severity.test.ts`.
5. **A missing band is UNKNOWN.** `readSeverityCounts` returns `null` on a four-member aggregate.
   Defeat: a version folding the missing band to `0` must fail.
6. **The mechanism label no longer sets policy, and is no longer called confidence.** The four preset
   rungs produce action maps **byte-identical** to the pre-rename snapshot; the word `confidence`
   appears **0** times in admin-console copy.
   Defeat: `ai-policy-presets.evidence-mechanism.spec.ts` + the copy guard.
7. **Three fields, generated, and impact is not the detector tier.** Parity vector is formatVersion 3
   with a recomputing `gradesSha256` and an **unchanged** tiers `sha256`, **byte-identical across 3
   repos**, `vocab-parity.mjs` PASS; `proposalKind` is **absent** (it lands at formatVersion 4, Wave
   4B Task 1 — D-6, decided in Task 6);
   `AI_EVENT_IMPACT_BY_CLASS` covers **40 of 40** tool-risk classes and every `AI_DLP_CLASSES` member;
   `resolvedConsequence` is `unresolved` on **40 of 40** tool classes;
   `git grep -n BASE_BY_CLASS -- Backend/src/` prints nothing.
   Defeat: `TestClassGrades_ImpactIsNotTheDetectorTier`, `TestClassGrades_IsTotalOverTheCatalog`,
   `ai-event-impact-catalog.spec.ts`.
8. **Totality over the producer set — `UNKNOWN (blocked on Wave 1)`.** The generated table can be
   total only over `AI_DLP_CLASSES` = **30**, while the classes that can reach the derivation number
   **135 verified** (81 DLP + 40 tool-risk + 14 prompt-risk) **+ 7 ingress unverified**. The criterion
   `|AI_EVENT_IMPACT_BY_CLASS| == 135` becomes measurable the day Wave 1 lands and **not before**.
   This wave records it as not-yet-measurable; it does not claim totality over a truncated
   denominator, and the static "all 30 DLP classes" wording at `plan:4566` is deleted.
   **Certificate contribution: UNKNOWN.**
9. **The grade crosses the wire on both lanes, Backend first (O-7).** `git grep -n "count: f.count" -- Backend/src/ai-governance/controllers`
   returns **2** sites, both carrying the grade; a tool-check finding lands `evidenceStrength` in
   `severity_basis`; the aggregate carries the **weakest** occurrence's grade. **The Backend half is
   deployed before the agent release**, by Deploy-to-ECS job result — an agent shipped first loses the
   fields to `whitelist: true` with no error and no data, and every test in this criterion still
   passes.
   Defeat: `ai-prompt-check.dto.evidence-grade.spec.ts`,
   `TestToBackendToolFindings_FoldsToWeakestEvidence`,
   `TestToBackendFindings_LegacyUngradedSendsNeitherKey`.
10. **The eligibility predicate is not copied a fifth time.** `internal/contenttransform` exports one
    helper; `transformWillAccept` calls it; behaviour is byte-identical; the two browser-extension
    copies are unchanged and still agree.
    Defeat: a differential test over the four call sites with the same finding set.
11. **Evidence is rendered as a word, beside impact, never coloured.** The evidence mark carries
    `data-sev` on **0** rows; an ungraded row reads `not graded` on **100%** of ungraded
    render-harness fixtures.
    Defeat: `evidence-mark.test.tsx`.
12. **A SHADOW class cannot interrupt on any lane.** `IsShadowClass` has **4** production call sites
    outside its own declaring file (today 2). `TestShadowLookupDefaultIsThePinnedCatalog` stays green.
    Defeat: `TestShadowClassNeverHoldsOnTaint`, `TestToolRiskDisposition_ShadowWins`.
13. **Every taint HOLD is attributable.** **100%** record class + effective disposition + arm
    (today 0%). All six existing `TestTaintRisky` cases stay green — a flip means the change narrowed
    something criterion 14 forbids narrowing yet.
14. **"Monitoring alone must remain non-tainting" — `NOT_READY`, owner-blocked.** Delivered in Wave 4B,
    not here. **External dependency: Product/Security ratification of the taint-eligible disposition
    set, plus paired benign-sequence precision and poisoned-sequence recall, whose denominators do not
    exist until Wave 3 and whose sequence corpora do not exist until Suite 4.** Risk 4 and Risk 5 stay
    non-green on this line, and the certificate carries it as a named `downgradeTrigger`.
15. **No enforcing disposition is a pure function of `Finding.Severity`.** The §7 grep returns **0**
    enforcing severity switches (today 5, all five in scope). All **25** ceiling cells are pinned;
    **40 of 40** tool classes are exactly equal to the legacy fallback (0 relaxations and 0 unapproved
    hardenings); all **14** prompt classes plus the **3** quote/budget cases agree across Go and JS;
    the sole `chmod-broad-777` compatibility floor is explicit; and replay applies SHADOW before the
    grade floor. Defeat: `TestFallbackCeilingPinsAllTwentyFiveCells`,
    `TestFallbackNeverRelaxes`, `TestPromptGradeFallbackCrossEngineVector`,
    `TestEnforcingPromptFindingsSkipsShadowBeforeTheGradeFloor`.
16. **The `prClassAction` precedence is written down exactly once.** §8 carries all **7** rungs with
    their measured line numbers, the **2** reserved positions (6a Wave 4C Task 4, 6b Wave 4A Task 2)
    and the 6a-before-6b tie-break; the Go ladder and its JS twin
    (`browser-extension/src/policyeval.js:298-320`) agree rung for rung.
    **No wave file instructs anyone by branch count.** Measured over
    `.plans/m47a-20260822/v2-waves/w*.md`:

    ```bash
    grep -n "existing branches\|fifth branch\|four existing" w*.md
    ```

    returns **3** lines today — §8 rule 1 here, `w4a_w4b_tool_effect.md:77` and
    `w4c_prompt_ingress.md:555` — and **all three are prohibitions that quote the old wording and
    name this ladder as the authority.** **0** are instructions. That is the criterion: zero
    instructions phrased as a tally, not zero occurrences of the words.
    Defeat: land a rung without adding its row to the §8 table and the cross-engine parity assertion
    in Task 10 still passes while the table is short — which is why rule 3 makes the table edit part
    of the same commit, and why the reviewer checks the table, not the diff.
17. **The four disposition objects are written down once.** `DISPOSITION_VOCABULARY.md` exists,
    states that today's `monitor` is customer-visible and therefore counts against the FP budget,
    states that no class is on private telemetry, and is cross-referenced from
    `activity-kind.util.ts` and `alerts.service.ts`.
18. **Suites green, and say which ran.** `cd Backend && npm test` (with a live Postgres — C5 means a
    container-less run is NOT-RUN, not green), `cd Frontend && npm test && npm run lint`,
    `cd Installers && go test ./internal/...`. Report per-repo, and name the gates that could not run
    locally. **Never report "all checks pass."**

### What this wave does NOT claim

- It does not make any risk lane green. R1 and R4 remain **NOT_READY**; each loses exactly one named
  blocker.
- It does not produce a single measured number about detector quality. Every rate stays `null` until
  Wave 3 repairs the instrument (D18).
- It does not calibrate anything. `evidenceStrength` is a **declared** axis with a declared
  vocabulary; the word "confidence" is banned precisely because the calibration does not exist yet.
- It does not stop `monitor` interrupting. It stops **SHADOW** interrupting, makes the monitor→HOLD
  conversion attributable, and hands the narrowing to Wave 4B with the blocker named.
