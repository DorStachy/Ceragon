# STAGE D — RENDER SURFACES — RESULTS

Run started 2026-08-18. Stage D had never been run; the previous wave died before reaching it.

---

## 0. What Stage D is, and where its item list actually comes from

**`PRODUCTION_VERIFICATION_CHECKLIST_20260808.md` contains no section named "Stage D".** Grepping all three
authority documents for `Stage D` returns exactly two hits, and neither is in the checklist:

```
$ grep -n "Stage D\|STAGE D\|Stage-D" PRODUCTION_VERIFICATION_CHECKLIST_20260808.md IMPLEMENTATION_PLAN.md OPEN-REGISTER-TO-DONE.md
IMPLEMENTATION_PLAN.md:985:### Stage D — render surfaces *(hard gate; the last wave died here)*
OPEN-REGISTER-TO-DONE.md:101:### D2. Stage D — render surfaces — HAS NEVER BEEN RUN
```

The checklist is organised by PHASE (GT · AQ · EN · CN · PL · CC · CX · DL · WB · SC · AD · RS · OP · UN · UX),
not by stage, and its render-surface phases (CN, UX) are written for a **live production tenant with an enrolled
endpoint** — not available here. So the operative item list is `IMPLEMENTATION_PLAN.md:985-992`, reproduced verbatim:

> - **D1** Grep **every** render file for the changed field — not just the one you edited.
> - **D2** **Drive a browser to the customer's actual entry point** and look at each changed surface. Screenshot it.
> - **D3** Check every state: populated, empty, loading, error, and **absent-capability** (must read "Not reported" —
>   never green, never red).
> - **D4** Mobile width for anything in the top bar or policy page.
> - **DEFEAT for the whole stage:** point the console at a tenant with no data and confirm surfaces read honestly
>   empty rather than silently green.

D1–D4 are **axes**, not items. The **items** are the render surfaces this remediation wave changed. They are
enumerated in §1 below and carry ids `D-S1 … D-Sn`; each is scored on all four axes plus its own defeat step.

## 0.1 Harness

No Docker, no Playwright (there is none in this workspace and the junction rule forbids installing one).
Chrome DevTools Protocol against the integration worktree's own dev server, exactly as the proven prior-wave
harness did.

| Piece | Value |
|---|---|
| Frontend under test | `C:/cwt/int-fe`, branch `integ/gate-fe-all` @ `26000d2` |
| Dev server | `node node_modules/next/dist/bin/next dev --webpack -p 3130` (Turbopack panics on the worktree's `node_modules` symlink — see §9) |
| Stub backend | port 2163, the prior wave's contract-shaped stub + a live-reloaded override layer |
| Browser | `chrome.exe --headless=new` over CDP; `Network.setCookie` installs the HttpOnly `codefense_session` |
| Fixture switching | `overrides.json`, re-read on every request, so a defeat step costs no restart |

Nothing in this run touched production. `BACKEND_URL` pointed at `http://localhost:2163` for the whole run.

**What these results are evidence of:** how the console RENDERS a given wire shape, and how it behaves around
absent data. They are **not** evidence that any backend produces those shapes. Every verdict below is scoped to
the render surface.

---

## 1. Verdict table

| Item | Surface | Entry point | Verdict |
|---|---|---|---|
| D-S1 | AI-governance opt-out coverage (register #18) | `/admin/endpoints?sub=coverage` | PASS |
| D-S1e | …its summary strip vs its own resolved rows | same | **FAIL** |

(Table extended as each item completes.)

---

## D-S1 — AI-governance opt-out coverage panel — **PASS**

Register A3 #18 said: *"No console surface for the opt-out anywhere — zero matches for `SKIPPED_AUTHORIZED`/opt-out
in backend `src/` or the frontend."* **Measured against `integ/gate-fe-all`, that is now REFUTED on the frontend
half.** The surface exists, is reachable from the real navigation, and is honest.

### D1 — grep every render file for the changed field

```
$ grep -rn "SKIPPED_AUTHORIZED" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v __tests__
./app/admin/endpoints/ai-optout-coverage-panel.tsx:88:  SKIPPED_AUTHORIZED: "warn",
./types/ai-governance.ts:4927:  "SKIPPED_AUTHORIZED",
./types/ai-governance.ts:4940:  SKIPPED_AUTHORIZED: {
(+ 3 comment hits)

$ grep -rln "optOut\|opt-out\|optout\|OPTOUT" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v __tests__
./app/admin/endpoints/ai-optout-coverage-panel.tsx
./app/admin/endpoints/coverage-section.tsx
./app/ai-control-plane/prompt-preview.tsx
./app/api/ai-control-plane/optout-coverage/route.ts
./lib/api/endpoints.ts
./types/ai-governance.ts
```

Exactly one renderer consumes the field (`ai-optout-coverage-panel.tsx`), mounted once
(`coverage-section.tsx:1514`), fed by one proxy (`app/api/ai-control-plane/optout-coverage/route.ts`) over one
backend path (`AI_GOVERNANCE_ENDPOINTS.OPTOUT_COVERAGE = "/api/v1/ai/optout-coverage"`). No second renderer of the
same field exists to disagree with it.

### D2 — reachable from the customer's actual entry point

Not a component in isolation: driven to `/admin/endpoints?sub=coverage` — Admin → Endpoint Management → the
**Coverage** toggle. Screenshot `shots/D-S1-populated.png` shows the sidebar, breadcrumb `ADMIN > ENDPOINTS`, the
Fleet/Coverage segmented control, and the panel below the readiness dashboard. Page title
`Endpoint Management · Admin · DeVoid`.

### D3 — every state

**populated** (`shots/D-S1-populated.png`, `.txt`) — all four wire states on one screen, each with a distinct tone:

```
[data-state="SKIPPED_AUTHORIZED"] [data-tone="warn"]     :: Opt-out in force
[data-state="OPTOUT_EXPIRED"]     [data-tone="warn"]     :: Opt-out expired
[data-state="COVERED"]            [data-tone="success"]  :: Governed
[data-state="NOT_REPORTED"]       [data-tone="neutral"]  :: Not reported
[data-state="NOT_REPORTED"]       [data-tone="neutral"]  :: Not reported

ENDPOINTS IN SCOPE 5 · OPT-OUT IN FORCE 1 · OPT-OUT EXPIRED 1 · NOT REPORTED 2
```

`COVERED` is the only state rendered green, and it is only reachable from an observed restore. An
opt-out in force renders amber and sorts as its own state — never green, never auto-repaired.

**absent-capability** — this is the row the plan cares most about. Two shapes, both correct:

```
DESKTOP-QA04 · wsl:Ubuntu-22.04   No readable opt-out transition has been reported here, so opt-out coverage
                                  has not been measured. This is not a statement that it is governed.  → Not reported
DESKTOP-QA05                      (no runtime named — nothing spoke, so nothing is attributed)         → Not reported
```

Neutral tone, not green and not red. The attribution block (`Authorized by` / `Lever` / `Expires` / `Observed`)
is **suppressed** on a NOT_REPORTED row rather than printed as hyphens, so absent data does not masquerade as
failed data. `DESKTOP-QA04` is precisely the coordinator's WSL shape — a runtime that spoke and could not be read —
and it renders as an unmeasured row, not a tick.

**all-unmeasured fleet** (`shots/D-S1-unmeasured.png`) — the fleet-wide honest-absence sentence fires:

```
[optout-coverage-all-unmeasured] :: No endpoint in scope has reported an opt-out transition.
                                    Opt-out coverage is unmeasured across this fleet.
```

**empty** (`shots/D-S1-empty.png`) — zero endpoints in scope is stated as a real answer, and explicitly disclaims
being a pass:

```
[optout-coverage-empty] :: No endpoints are in scope, so there is no opt-out coverage to report.
                           This is not a statement that any runtime is governed.
```

**loading** (`shots/D-S1-slow.png`, backend delayed 60 s) — `Reading AI opt-out coverage…`, and **no stat strip**:
no counts are shown before any count is known.

**error** (`shots/D-S1-error.png`, backend 503) — the strongest of the five:

```
failedRequests: 503 /api/ai-control-plane/optout-coverage?siteId=...
[optout-coverage-unread] :: AI opt-out coverage could not be read, so nothing here is known about which
   runtimes are opted out. No count is shown: a zero would be indistinguishable from a fleet with no opt-outs.
   opt-out coverage read failed: upstream unavailable
```

Zero stat tiles rendered (`optout-stat-*` x0). The failed read is **not** softened into an empty rollup — the
exact failure mode this stage exists to catch.

### DEFEAT steps exercised

**1. Hand it a state token the type does not name.** Rows served with `state: "GOVERNED_OK"` and `state: null`.
A console that trusted the wire would print an unknown green.

```
[data-state="NOT_REPORTED"] [data-tone="neutral"] :: Not reported   (was "GOVERNED_OK")
[data-state="NOT_REPORTED"] [data-tone="neutral"] :: Not reported   (was null)
```

Degraded to measured-absence, neutral tone. `resolveOptOutCoverageState` holds.

**2. Remove a required field.** `summary` deleted from the response (`AiOptOutCoverageResponse.summary` is
non-optional, so this is the older-backend shape).

```
consoleErrors: none
[optout-stat-endpoints] x0        ← whole stat strip omitted
[optout-coverage-row] x5          ← rows still render, states intact
```

No crash, no invented zeros. The surface degrades to what it can still say.

**3. Break the surface deliberately** — covered by defeat 1 and 2 above; both produced a visibly different screen,
so the checks are falsifiable rather than decorative.

---

## D-S1e — the summary strip can contradict its own rows — **FAIL**

Found by defeat step 1. The stat strip is copied verbatim from `summary`; the rows are re-derived client-side
through `resolveOptOutCoverageState`. When the two disagree, nothing says so.

Same response, same screen, `shots/D-S1-unknown-token.png`:

```
ENDPOINTS IN SCOPE 2 · OPT-OUT IN FORCE 0 · OPT-OUT EXPIRED 0 · NOT REPORTED 0
   ↑ server-authored counts

DESKTOP-QA09 · codex   → Not reported
DESKTOP-QA10 · codex   → Not reported
   ↑ client-resolved rows
```

**`NOT REPORTED 0` sits directly above two rows that read "Not reported".** The panel has just decided it cannot
read those states, and then prints a confident zero for the category it put them in. The `all-unmeasured` sentence
also cannot fire, because it is gated on `summary.notReported === summary.endpoints` — a comparison of two
server-authored numbers, not of what the screen actually rendered.

**Mechanism:** `ai-optout-coverage-panel.tsx` renders `summary.*` directly
(`value={summary.skippedAuthorized}` etc.) while `OptOutRow` renders `resolveOptOutCoverageState(row.state)`.
Two derivations of one fact, only one of them defended.

**Severity:** the trigger is a state token the Backend does not currently emit, so this is not live today. It goes
live the moment the Backend's `AI_OPTOUT_COVERAGE_STATES` gains a member the console has not shipped — i.e. on the
next contract addition, which is exactly when a stale console is deployed against a newer backend.

**Fix shape (not applied — Stage D measures, it does not build):** tally the counts from the resolved rows, or
render a discrepancy note when the two disagree.

**Defeat of this finding:** re-served the same fixture with the states corrected to `NOT_REPORTED`; the strip then
read `NOT REPORTED 2` and the all-unmeasured sentence fired — so the check discriminates and is not a constant.

---

## D-S2 — Web AI Guard ladder (F39 nav-block · F40 guard health) — **PASS on the ladder, FAIL on the panel's failure states**

Same page as D-S1, `/admin/endpoints?sub=coverage`, section "Web AI Guard coverage".

### D1 — grep every render file for the changed fields

```
navBlockRuleCount        -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
navBlockRuleCountSource  -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
navBlockArmed            -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
guardHealth              -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
guardFailOpenSendCount   -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
guardDegradedEpisodes    -> app/admin/endpoints/coverage-section.tsx · types/ai-governance.ts
```

One renderer each. No second consumer exists to disagree.

### D-S2a — the C10 trap — **PASS**

The checklist's own defeat for C10: *"a synthetic endpoint payload with `ruleCount: 0` and no `ruleCountSource`
must render **"Not reported"**, not "Blocks not armed" — this is the fleet-wide false-red trap."*
Served exactly that (`shots/D-S2-populated.*`):

```
{"data-web-guard-row":"wep-trap","data-web-guard-state":"Not reported","data-nav-block":"not-reported"}
  TRAP-COUNT-0-NO-SOURCE  NOT REPORTED
  "The extension has not reported coverage. This is measured absence, not a pass:
   nothing here has been shown to block."
```

**Discriminating control** (the half that makes it a check rather than a constant): the same count of 0 **with**
`navBlockRuleCountSource: "dnr-engine"` and `navBlockArmed: false` still reaches the critical rung —

```
{"data-web-guard-row":"wep-disarm","data-web-guard-state":"Blocks not armed","data-nav-block":"not-armed"}
  MEASURED-DISARM  BLOCKS NOT ARMED
  "The extension read its own block engine and found no installed rules."
```

— and a measured **armed** endpoint whose count is also 0 (the structural-zero every shipped 0.5.13 beacons)
renders `Active / 0 ARMED`. Three different verdicts from the same `ruleCount: 0`, separated only by the source.

### D-S2b — guard health cannot be faked into a pass — **PASS**

Four unmeasurable shapes, all four kept off the clean rung:

```
GUARD-KEY-ABSENT      guardHealth key absent   -> NOT REPORTED   "No guard-health reading. This is measured
                                                                  absence, not a pass: nothing here has been
                                                                  shown to inspect a send."
GUARD-NOT-REPORTED    guardHealth NOT_REPORTED -> NOT REPORTED   (same sentence)
GUARD-UNKNOWN-TOKEN   guardHealth OK_PROBABLY  -> UNREADABLE STATE
                                                 "The endpoint reported a guard state this console does not
                                                  recognise, so it is not being called healthy.
                                                  Reported state: OK_PROBABLY"
EXTENSION-MISSING     online false             -> EXTENSION MISSING
                                                 "No fresh health beacon. Nothing about this browser is
                                                  being measured."
```

**Discriminating control:** `guardHealth: "HEALTHY"` does reach `HEALTHY`, and `DEGRADED_FAIL_OPEN` reaches the
top critical rung `FAILING OPEN` with `3 sends went out unverified…` — so the allowlist is not simply refusing
everything.

**This is the coordinator's `devoid doctor --strict` pattern, and this surface does NOT have it.** An invented
state token gets its own visible "UNREADABLE STATE" row rather than a tick.

### D-S2c — absent summary keys are not manufactured zeros — **PASS**

Older-Backend shape: `summary` served without `navBlockNotArmed` / `guardFailOpen` / `guardHealthNotReported`
(`shots/D-S2-legacy-summary.txt`):

```
INSTALLED 8 · ONLINE (FRESH BEACON) 7 · STALE 0 · BLOCKS NOT ARMED - · GUARD FAILING OPEN - · GUARD NOT REPORTED -
```

Hyphens, not zeros. **Defeat:** with the keys present the same tiles read `1 / 1 / 5`, so the "-" is a real
absence rendering, not a broken tile.

### D-S2d — **FAIL — loading, read-failure and no-data are the same blank screen**

`shots/D-S2-error.*` (backend 502) and `shots/D-S2-loading.*` (backend delayed 60 s):

```
D-S2-error   failedRequests: 502 /api/ai-control-plane/web-coverage?siteId=...
             grep "Web AI Guard" D-S2-error.txt   -> 0 occurrences
D-S2-loading grep "Web AI Guard" D-S2-loading.txt -> 0 occurrences
```

**The entire "Web AI Guard coverage" section is absent from the page.** No heading, no tiles, no error, no
skeleton. An operator sees a Coverage dashboard with no web-guard section and reads it as "we have no browser
endpoints" — which is exactly the reading a failed read must never be able to produce.

**Mechanism** — `app/admin/endpoints/coverage-section.tsx:1165-1177`:

```js
fetch(withSiteScope("/api/ai-control-plane/web-coverage", activeSiteId))
  .then((r) => (r.ok ? r.json() : null))     // a 4xx/5xx becomes `null`
  .then((d) => setData(d))
  .catch((err) => logger.error("web-coverage fetch failed", err))   // console only
...
if (!data || !Array.isArray(data.endpoints)) return null            // the section deletes itself
```

`null` is the initial state, the error state, and the network-failure state. Three facts, one blank.

**This is a cross-surface disagreement on one page.** The opt-out panel sits directly beneath this one and answers
the identical failure class correctly:

```
D-S1-error  [optout-coverage-unread] :: "AI opt-out coverage could not be read, so nothing here is known about
            which runtimes are opted out. No count is shown: a zero would be indistinguishable from a fleet with
            no opt-outs."
D-S2-error  (nothing — the section is not on the page)
```

Two panels, one page, one backend outage, two opposite behaviours.

**Provenance:** pre-existing. `git show origin/main:app/admin/endpoints/coverage-section.tsx` carries the same
three lines at `:952-957`. This wave rebuilt the ladder inside the panel and did not touch the panel's failure
path. It is reported as a Stage D FAIL because Stage D scores every state of a changed surface, not only the
states the diff touched.

**Defeat of this finding:** with the same route returning 200, the section renders in full with 8 rows — so the
blank is caused by the failure, not by the harness.

### D-S2e — observation, not a FAIL: the `STATUS` column reads `Active` beside an unmeasured guard

```
GUARD-KEY-ABSENT   STATUS: ACTIVE   NAV BLOCKS: 0 ARMED   GUARD HEALTH: NOT REPORTED
```

`STATUS` is the nav-block/drift/staleness rail and `Active` there is backed by a measurement
(`navBlockRuleCountSource: dnr-engine`, `navBlockArmed: true`). The unmeasured guard is displayed in its own
column, counted in its own fleet tile (`GUARD NOT REPORTED 5`), and named in the panel footnote:

> "Guard health" is a different reading on a different rail… It is reported by the endpoint, never inferred
> here, so an endpoint that has never reported it reads "Not reported" and never "Healthy". The fleet tile counts
> those endpoints, so an unmeasured fleet cannot be read as a clean one.

Recorded as a residual risk only: a column generically headed `STATUS` invites being read as the row's overall
verdict. Not scored FAIL — the absent fact is on screen, adjacent, and counted.

---

## D-S3 — MCP discovery coverage (F7d) — **PASS on the per-source rows, FAIL on the count line**

Entry point `/mcp` — the top-level "MCP Control Tower" nav item. Screenshots `shots/D-S3-*`.

### D1 — grep every render file for the changed fields

```
coverageSummary          -> app/mcp/mcp-governance-content.tsx · app/endpoints/[hostname]/endpoint-hub-content.tsx
                            (the latter is a different type: github/ai-context coverage, not MCP discovery)
McpDiscoveryCoverageRow  -> app/mcp/mcp-governance-content.tsx · types/ai-governance.ts
```

### D-S3a — the six source states, plus one the console has never seen — **PASS**

`shots/D-S3-populated.*`. All six wire states rendered, unanswered ones sorted to the top:

```
COULD NOT READ           "DeVoid could not open this file, so what it declares is unknown. Servers configured
                          here would not appear anywhere in this console." (permission denied)
COULD NOT PARSE          "…opened this file and could not parse it…" (invalid JSON syntax)
CONFIG NOT UNDERSTOOD    "…has no reader for this file's format…" (no reader for this format)
SKIMMED                  ← a state this build has never heard of, from a newer Backend
READ                     "DeVoid read this file and understood it. 2 servers declared here."
READ, EMPTY              "…and it declares no MCP servers."
NOT PRESENT              "This location was checked and there is no file there."
```

The three unanswered states are rendered as neither a pass nor a defect, and each says the consequence out loud:
a server declared there is **absent from this console**. The unknown `skimmed` state is placed in the unanswered
group by `isMcpDiscoveryStateAnswered(r.state)` — the console does not trust the row's own `answered` boolean
(the fixture set `answered: true` on it and was overruled).

### D-S3b — empty / not-served / unreported — **PASS**

```
mcp-coverage-unreported  (reported:false) :: "DeVoid cannot say which configuration sources were read. No
   endpoint in this scope has reported its discovery coverage, which is indistinguishable from an agent whose
   report was dropped in transit. Treat the list above as what happened to be found, never as the set of MCP
   servers that exist."

mcp-coverage-not-served  (no coverage keys at all — older Backend) :: "This deployment does not report which
   configuration sources were read… The list above is what was found, not a statement about what exists."
```

Two different absences, two different sentences, neither of them a pass. This is the distinction
`McpServersResponse` documents, and it survives to the screen.

### D-S3c — error — **PASS**

`shots/D-S3-error.txt`, backend 500:

```
COULD NOT LOAD MCP SERVERS
mcp read failed
RETRY
```

Loud, named, retryable. (Contrast D-S2d on the coverage page, which renders nothing at all for the same class of
failure — the two surfaces disagree, and this one is right.)

### D-S3d — **FAIL — "7 OF 7 CONFIGURATION SOURCES READ" printed directly above three rows that say they could not be read**

This is the `devoid doctor --strict` shape the coordinator flagged, in the console.

`shots/D-S3-lying-summary.*`. Response carries the same seven coverage rows as the populated case, with
`coverageSummary: { reported: true, sourcesTotal: 7, sourcesAnswered: 7, sourcesUnanswered: 0 }`:

```
[mcp-count-line]          :: 1 MCP SERVER · 7 OF 7 CONFIGURATION SOURCES READ
[mcp-coverage-counts]     :: 7 answered · 0 unanswered · 1 endpoint reporting
[mcp-coverage-incomplete] :: (absent — the qualifier does not fire)

…and immediately below, in the same panel:

COULD NOT READ         C:/Users/other/.claude.json  "…what it declares is unknown."
COULD NOT PARSE        C:/repo/.mcp.json            "…what it declares is unknown."
CONFIG NOT UNDERSTOOD  C:/repo/mcp.yaml             "…what it declares is unknown."
```

**Mechanism** — `app/mcp/mcp-governance-content.tsx`:

```js
// counts + count line: taken verbatim from the server
{summary.sourcesAnswered} answered · {summary.sourcesUnanswered} unanswered      // :221
return `${servers} · ${summary.sourcesAnswered} of ${summary.sourcesTotal} configuration sources read`  // :148
const coverageIsPartial = !coverageSummary || !coverageSummary.reported || coverageSummary.sourcesUnanswered > 0  // :332

// rows: re-derived locally, and correctly
const unanswered = rows.filter((r) => !isMcpDiscoveryStateAnswered(r.state))     // :177
```

`sourcesUnanswered` gates **three** honesty surfaces — the incomplete banner, the count line, and
`coverageIsPartial` (which qualifies the empty state and the inventory reconciliation note). All three are keyed
on a number the console never checks against the rows it just rendered.

**This does not need a lying backend.** The realistic trigger is deployment skew, and it is already visible in the
ordinary populated case — `shots/D-S3-populated.*`, with an honest backend that simply knows one state more than
the console does:

```
[mcp-count-line]      :: 2 MCP SERVERS · 4 OF 7 CONFIGURATION SOURCES READ
[mcp-coverage-counts] :: 4 answered · 3 unanswered
rows actually rendered: 3 in the answered group, 4 in the unanswered group
```

The Backend counted `skimmed` as answered; the console put it in the unanswered group and kept the Backend's
number. Off by one, silently, from nothing worse than shipping a new state token — which is exactly the sequence
that will happen the next time the discovery vocabulary grows.

**Defeat / discriminating control:** `shots/D-S3-complete.*` — three genuinely answered rows with
`sourcesAnswered: 3, sourcesUnanswered: 0`:

```
[mcp-count-line]  :: 1 MCP SERVER · 3 OF 3 CONFIGURATION SOURCES READ
rows: READ · READ, EMPTY · NOT PRESENT   (three answered, zero unanswered)
```

Here `3 OF 3` is true, and the same code path produces it — so the check discriminates between an honest N-of-N
and a false one rather than always firing.

**Fix shape (not applied):** derive the displayed counts from the rows when rows are present, or render a
discrepancy note when `summary.sourcesUnanswered !== unanswered.length`.
