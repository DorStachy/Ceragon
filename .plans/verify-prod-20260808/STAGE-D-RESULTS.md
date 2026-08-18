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
