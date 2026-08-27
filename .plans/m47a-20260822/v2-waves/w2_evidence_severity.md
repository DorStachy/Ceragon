# Wave 2 — Evidence strength, consequence, and UI vocabulary

**Depends on:** Wave −1 (rebase, citation repair, path discipline). Wave 1 for one exit criterion
only — the totality claim in Task 6 has no denominator until Wave 1 widens `AI_DLP_CLASSES` from
**30 to 81**; until then that criterion reads `UNKNOWN (blocked on Wave 1)`, not `PASS`. Wave 0A runs
in parallel and is not blocked by anything here.
**Implements decisions:** D6 (rewritten — the four objects, and "monitoring must be non-tainting"),
D7 (substance unchanged; its **word** "confidence" is retired here), D8, D9, D10.
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
`Backend/src/ai-governance/services/ai-event-severity.util.ts:648-657`:

```ts
    basis: {
      formulaVersion: AI_EVENT_SEVERITY_FORMULA_VERSION,   // = 4  (util.ts:48)
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

Consequence, measured: `Frontend/app/ai-control-plane/events/events-content.tsx:342-362`
(`severityTitle`) reads `basis.findingClass`, `basis.evidenceTier`, `basis.baseSeverity`. Only
`evidenceTier` is a key the producer writes. So an Events row's severity tooltip **has never named
the governing class or the pre-adjustment base** — it renders `tier <x>` plus the adjustment list and
nothing else, and on a tool-lane row (which sends no `evidenceTier` at all — see §3) it renders the
adjustments alone.

Detections escapes only by casting past the wrong type:
`Frontend/app/ai-control-plane/detections/detections-content.tsx:399-405` does
`row.severityBasis as Record<string, unknown>` and then reads `basis.class` / `basis.base`.

Three test files pin the wrong shape and will move:

- `Frontend/app/ai-control-plane/events/__tests__/events-content.test.tsx:471-478` fabricates the
  fixture in the contract's shape (`findingClass`, `baseSeverity`), so the renderer is green against
  keys production never sends. **It also writes `formulaVersion: 3`; the producer is at 4.**
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

`METER_SEVERITY` (`Frontend/app/ai-control-plane/detections/detection-view-model.ts:78`) and
`SPARK_SEVERITIES` (`:99`) already contain `info`, and `Frontend/components/ui/severity-badge.tsx`
maps `INFO` in both of its tables (`:60`, `:70`). What does not work is the other three AI-detection band declarations:

- `Frontend/app/ai-control-plane/detections/detection-read-model.ts:52` —
  `SEVERITY_BANDS = ["critical","high","medium","low"]`, four members, and it drives the facet
  checkboxes, the distribution bar and the URL filter serialisation.
- `Frontend/app/ai-control-plane/ai-sessions/[id]/session-severity.ts:40-44, 47-51, 185-192` — a
  third, independent four-band rank map, label map and `severitySignalVar` switch, all missing `info`.
- `Frontend/app/globals.css:1594-1599` — the row-spine block has rules for
  `critical/high/medium/low/unknown` and **no `info` rule**, while `:1397` and `:1533` already light
  the info meter. An info row draws a coloured meter above a transparent spine.

Five server-side gates refuse or mis-rank `info`, and **all five must be deployed before any console
change ships**:

| Gate | Location (origin/main `0cf9021e`) | Failure today |
|---|---|---|
| Query DTO | `Backend/src/ai-governance/dto/list-ai-detections.dto.ts:86` — `@IsIn([...AI_EVENT_SEVERITIES], { each: true })` | `?severity=info` 400s the **whole** request |
| Vocabulary | `packages/shared-contracts/src/ai-governance-contract.ts:165` | four-member tuple |
| DB CHECK | `Backend/src/migrations/1787100000000-AddAiEventSeverity.ts:45-52` — `CHK_ai_events_severity` | an info-banded INSERT fails |
| Sort rank | `Backend/src/ai-governance/services/ai-query.service.ts:755-757` — `DETECTION_SEVERITY_RANK_SQL` | info ranks `NULL`, sorting with the unassessed |
| Counts | `ai-query.service.ts:6577` (`detectionSeverityCounts`) + `dto/ai-response.dto.ts:2598-2603` (`AiDetectionSeverityCountsDto`) | exactly four members |

### 3. The evidence axis exists on one lane, is dropped on the wire, and is absent from the other lane

`Installers/internal/dlp/dlp.go:56-63` — `dlp.Finding` carries `EvidenceTier` and
`EnforcementEligible`, and the endpoint already **gates** on them locally in four independent places:

- `Installers/internal/contenttransform/transform.go:121-125` — refuses to transform on tier B/C/D or
  an explicit non-eligible finding (`ErrIneligibleEvidence`);
- `Installers/internal/daemon/ai_handlers.go:853+` — `transformWillAccept`, a hand-duplicated copy of
  the same predicate, whose docblock says outright *"NOT a place to loosen anything"*;
- `Installers/browser-extension/src/content-transform.js:113-119` and `:220-233` — two more copies.

**Four copies of one predicate, none of them a shared exported helper. Do not add a fifth.**

The vocabulary behind it is richer than anyone reading only `dlp.Finding` would guess.
`Installers/internal/dlp/private_key.go:30-99` declares `EvidenceTier` (A/B/C/D, *"the canonical local
evidence strength"*), `CredentialRole`, `ExploitabilityState`, `ValidationState`, `AssertionState`
and `InspectionStatus`. And `Installers/internal/aipolicycontract/detector_catalog_generated.go`
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
vocabularies at `:3014-3016`, and the derivation consumes them at
`ai-event-severity.util.ts:541-585` with the correct rule already written down at `:447`:
*"ABSENT IS NOT FALSE. `enforcementEligible` caps only on an explicit `false`… The agent does not yet
emit these fields (W2/W3 work)."* **That comment names this wave.**

**TRAP — do not put a closed enum on an agent-supplied scalar.**
`Backend/src/ai-governance/dto/ai-prompt-check.dto.ts:41-58` records that `@IsIn(['cli','browser','ide'])`
on `surface` cost three production incidents on this exact route family: `AgentIngestValidationPipe`
(`src/common/pipes/agent-ingest-validation.pipe.ts:90-97`) leniency covers undeclared **keys**, not
out-of-vocabulary **values**, so an unknown value 400s the whole report and the event loses its
findings *and* its band. Every new grade field is bounded free text on the wire and closed at
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
`confidenceForMechanism` (`:89-99`) maps `structural|exact-match → high`, `regex-context → medium`,
`entropy|keyword-heuristic → low`, and `confidenceOf` (`:435`) feeds
`Backend/src/ai-security-policy/ai-policy-presets.ts:258-264` (`dlpActionsByConfidence`) and `:275-283`
(`promptActionsByConfidence`), which place **every** class's shipped preset action on its tier:

```ts
  for (const cls of AI_SECURITY_DLP_CLASSES as readonly AiDlpClass[]) {
    out[cls] = tier[confidenceOf(cls)];        // ai-policy-presets.ts:260-261
  }
```

So a hand-authored mechanism label — with no heldout labels, no PPV, no support, no interval, no
calibration error — decides what a customer's policy does. That is the exact thing the forbidden-claims
list bans, wired to enforcement. It is also rendered to the admin as a chip at
`Frontend/components/admin/ai-security-policy-section.tsx:1071`, and the same file's copy claims
*"High-confidence combination of override and hidden-context theft"* (`:453-465`) and
*"Automatic high-confidence taint hold enabled"* (`:4268`) — while the taint predicate is
`severity != INFO` (see §6). Console says X, endpoint does Y, for the fourth time in this workspace.

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
   true when `dataClasses.length > 0`. A monitored finding is therefore a **customer-visible
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

   No policy input. No provenance. `toolName` is accepted and never read. It is called at
   `ai_handlers.go:3054-3055`, and a `true` converts an ALLOW into a **HOLD** on an independently
   tainted session. `TestTaintRisky` (`internal/daemon/ai_taint_test.go:80-104`) pins the defect in
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
| `internal/policyeval/policyeval.go:511-551` — `prClassAction` | severity fallback: HIGH → block, MEDIUM → warn |
| `internal/proxy/ai_replay_promptrisk.go:268` | HIGH-or-MEDIUM gate |

**These are fallback lanes and they cannot simply be deleted.** Rule 5 says the local rulebook must
always reach a verdict, and `decideTool:3745-3752` documents deliberately keeping the legacy lane so
an agent that outlives its backend still governs. The fix is to make the fallback read the
**catalog's declared capability impact and evidence strength** — data that ships in the pinned
contract and is available offline — instead of the detector's syntactic tier. Nothing relaxes.

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

## Task 2: Five bands in the Backend vocabulary — HARD GATE, deploy before Task 4

**Files:**
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts:165`
- `Backend/src/migrations/<new>-WidenAiEventSeverityToFiveBands.ts` (create)
- `Backend/src/ai-governance/services/ai-query.service.ts:755-757, 6577+`
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
- [ ] Add `info` to `detectionSeverityCounts` and to `AiDetectionSeverityCountsDto`. Preserve the
      existing rule at `ai-response.dto.ts:2590-2597`: a NULL severity is counted **nowhere**, never
      folded into the lowest band.
- [ ] `npx jest src/ai-governance` plus the live-pg aggregates spec against a real Postgres. **C5:
      ~97 live-pg specs now fail dark rather than green when Postgres is absent — a "green" run with
      no container is a NOT-RUN.**

**Defeat test:** `list-ai-detections.dto.info-band.spec.ts` — revert `AI_EVENT_SEVERITIES` to four
members and it goes red with `severity must be one of the following values: low, medium, high, critical`.
For the CHECK constraint, `ai-query.detections-aggregates.live-pg.spec.ts` must fail on the INSERT
with `violates check constraint "CHK_ai_events_severity"`.

**Exit:** **5 of 5** server gates in the §2 table accept `info` (today 0 of 5).
`GET /api/v1/ai/detections?severity=info` returns 200. **Deployed to production before any Frontend
change in Task 4 ships** — Backend before agent/console, no exceptions.

---

## Task 3: One home for read-time band translation (D9)

**Files:**
- `Frontend/lib/severity.ts` (create — does not exist on `origin/main`)
- `Frontend/lib/__tests__/severity.test.ts` (create)
- `Frontend/types/ai-governance.ts` (band type)
- `Frontend/app/ai-control-plane/detections/detection-view-model.ts:78-112`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/session-severity.ts:40-51, 185-192`

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
`detection-read-model.ts:52`, `detection-view-model.ts:78` and `:99`, `session-severity.ts:40`,
with matching label and signal-var maps at `session-severity.ts:47` and `:185`). `Frontend/lib/severity.ts`
is the only definition site.

---

## Task 4: The fifth band reaches the filter, the bar and the row spine

**Depends on:** Task 2 deployed to production.

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
- [ ] Add `.tbl-row[data-sev="info"] { --sev-spine: var(--signal-info); }` at `globals.css:1599`.
- [ ] `readSeverityCounts` must answer `null` when the server returns a four-member aggregate.
      **A missing band is NOT MEASURED, never zero** — this is the same rule as RULE 7 and the same
      rule Wave 5's defeat test exercises.

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
- `Frontend/components/admin/ai-security-policy-section.tsx:453-465, 976-1071, 4251, 4268`

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
- [ ] Frontend: rename the chip and its label. Rewrite the four
      *"High-confidence combination…"* descriptions (`:453-465`) to name the **mechanism** — e.g.
      *"Two named signals in one message: override plus hidden-context theft"*. Rewrite
      *"a high-confidence match taints the session"* (`:4251`) and
      *"Automatic high-confidence taint hold enabled"* (`:4268`) to state what actually happens: a
      finding above the INFO tier, or a sensitive path/op, taints. **State the fact, never the
      in-house rationale.**
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
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:288-335, 437, 549`

The three fields, and what each one is **allowed** to say:

| Field | Vocabulary | Who decides | What it may never be |
|---|---|---|---|
| `evidenceStrength` | `validated` \| `corroborated` \| `probable` \| `weak` \| `unknown` | the detector, per finding | never inferred from severity; `unknown` is a real value and the default |
| `baseCapabilityImpact` | `info` \| `low` \| `medium` \| `high` \| `critical` | the catalog, per class | a **context-free upper bound on capability**; never "production impact" |
| `resolvedConsequence` | `unresolved` \| the five bands | policy, per event | `unresolved` for **every tool class** until Wave 4B's effect resolver exists |

- [ ] **Reuse, do not invent.** Map `evidenceStrength` onto the tiers that already ship:
      `dlp.EvidenceTierA→validated, B→corroborated, C→probable, D→weak`, empty/absent→`unknown`
      (`Installers/internal/dlp/private_key.go:33-38`). Take `baseCapabilityImpact` for the 55
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
      `gradesSha256`. The existing `sha256` covers `tiers` only
      (`ai-security-policy.tool-risk-class-parity.spec.ts:159-166`); do not fold the new block into it
      or every consumer digest breaks for a reason unrelated to tiers.
      `TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/`, then copy the byte-identical file into
      both consumer repos (`ci/lib/vocab-parity.mjs` verifies all three; C14 — it currently runs at
      the workspace root only, and Wave 1 moves it into a repo's CI).
- [ ] Update both consumer parity specs: `formatVersion` 2 → 3, plus a new assertion that the grades
      block is total over `vector.classes`.
- [ ] Create `dlp-classes-grades.v1.json` from the detector catalog plus the DLP registry, and
      `generate-ai-event-impact-catalog.cjs` that emits
      `ai-event-impact-catalog.generated.ts` from both files. Its spec asserts byte-equality with a
      fresh generation, and totality over both producer vocabularies.
- [ ] Delete `BASE_BY_CLASS` (`ai-event-severity.util.ts:301-335`) and point `baseForFinding:437` and
      the `unknown-class-default` marker at `:549` at the generated table. Keep the `?? 'medium'`
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
**byte-identical across all 3 repos**. `AI_EVENT_IMPACT_BY_CLASS` covers **40 of 40** tool-risk
classes and **every member of `AI_DLP_CLASSES`**. `resolvedConsequence` is `unresolved` for **40 of
40** tool classes.
**Totality over the producer set is `UNKNOWN (blocked on Wave 1)`.** The generated table can only be
total over `AI_DLP_CLASSES` = **30**, which is 30 of the DLP producer's **81**. Counted at
`origin/main`, the classes that can reach `deriveAiEventSeverity` are:

| Producer | Count | Discovery |
|---|---:|---|
| DLP | **81** | `RegisteredClasses()`, `internal/dlp/registry.go:221` (33 + 48) |
| tool-risk | **40** | `ClassCatalog()`, `internal/toolrisk/class_catalog.go:57` |
| prompt-risk | **14** | class constants, `internal/promptrisk/promptrisk.go:53-85` — folded into the same findings array by `foldPromptRiskFindings` (`ai_handlers.go:1448`), so they hit `BASE_BY_CLASS` too |
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

**Ordering inside this task is load-bearing.** Steps 1-4 are Backend and must be **deployed** before
steps 5-8 (the agent) are released. An undeclared key is dropped by `AgentIngestValidationPipe`, not
400'd, so shipping the agent first loses the data silently.

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
- [ ] Extend `sanitizeStructuredFindings` (`ai-event.service.ts:3014-3016`) with a closed
      `evidenceStrength` vocabulary beside the existing `evidenceTier` and `tier` checks.
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

**Files:**
- `Installers/internal/policyeval/shadow.go` (docs), `internal/daemon/ai_handlers.go:3716-3856`
- `Installers/internal/daemon/ai_taint.go:151-166`
- `Installers/internal/daemon/ai_taint_test.go:80-104`
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
- [ ] Update `TestTaintRisky:80-104` to assert the reason as well as the bool. Its first case —
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

**Files:**
- `Installers/internal/daemon/ai_handlers.go:3789, 3909-3922`
- `Installers/internal/policyeval/policyeval.go:511-551`
- `Installers/internal/proxy/ai_replay_promptrisk.go:268`
- `Installers/internal/daemon/ai_fallback_grades_test.go` (create)

These are the **offline fallback** lanes and they may not be deleted: `decideTool:3745-3752` documents
keeping the legacy lane deliberately, because an agent in the field can outlive its backend and rule 5
says the local rulebook must always reach a verdict.

- [ ] Test first: for **all 40** tool-risk classes, assert the fallback verdict computed from
      `class_grades.go` (`baseCapabilityImpact` + `evidenceStrength`) is **greater than or equal to**
      today's `defaultToolDecision` verdict. **0 of 40 may relax.** This is the non-weakening proof and
      it must be written before the change.
- [ ] Repoint `defaultToolDecision` and the `prClassAction` severity fallback at the catalog grades.
      A `weak`-or-`unknown` evidenceStrength may never reach `block` on its own — that is D7's
      substance and the reason the axis exists.
- [ ] Leave `ai_replay_promptrisk.go:268` alone if it is a replay/telemetry filter rather than a
      decision; confirm which with
      `git show origin/main:internal/proxy/ai_replay_promptrisk.go | sed -n '250,285p'` and record the
      answer in the task, either way.

**Defeat test:** `ai_fallback_grades_test.go::TestFallbackNeverRelaxes` — lower any class's
`baseCapabilityImpact` below its current fallback verdict and it goes red with
`class "x": fallback relaxed from block to warn`. `TestWeakEvidenceCannotBlock` — set a class to
`evidenceStrength: weak, baseCapabilityImpact: critical` and assert the fallback is at most `warn`;
reverting the guard yields `block`.

**Exit:** the §7 grep returns **0** enforcing severity switches (today **5**, of which 4 are enforcing
and 1 is under review). **0 of 40** tool classes relax relative to the pre-change fallback.

---

## Wave exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **One basis type.** `git grep -c "AiEventSeverityBasis = {"` across
   `Backend/packages`, `Backend/src`, `Frontend/types` returns **1** (today 3).
   Defeat: `ai-event-severity.contract-parity.spec.ts` (Task 1).
2. **The Events tooltip tells the truth.** **3 of 3** producer key names resolve (today 1 of 3, and
   the pinned fixture writes a stale `formulaVersion: 3` against a producer at 4).
   Defeat: `events-content.test.tsx` with the cast removed.
3. **Five bands, server first.** **5 of 5** gates in the §2 table accept `info` (today 0 of 5); the
   Backend carrying them is **deployed** before any console change ships.
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
   with a recomputing `gradesSha256`, **byte-identical across 3 repos**;
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
9. **The grade crosses the wire on both lanes.** `git grep -n "count: f.count" -- Backend/src/ai-governance/controllers`
   returns **2** sites, both carrying the grade; a tool-check finding lands `evidenceStrength` in
   `severity_basis`; the aggregate carries the **weakest** occurrence's grade.
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
    enforcing severity switches (today 5, of which 4 enforce). **0 of 40** tool classes relax.
    Defeat: `TestFallbackNeverRelaxes`, `TestWeakEvidenceCannotBlock`.
16. **The four disposition objects are written down once.** `DISPOSITION_VOCABULARY.md` exists,
    states that today's `monitor` is customer-visible and therefore counts against the FP budget,
    states that no class is on private telemetry, and is cross-referenced from
    `activity-kind.util.ts` and `alerts.service.ts`.
17. **Suites green, and say which ran.** `cd Backend && npm test` (with a live Postgres — C5 means a
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
