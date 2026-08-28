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

# Wave 5 — Make every number on the console trace to a source

**Depends on:** Wave −1 (rebase manifest and the repo-qualified citation repair). Wave 2 for the
severity/evidence vocabulary the certificate panel renders — **Tasks 1-9 and 11 do not touch it and can
start immediately; Task 10 cannot begin until Wave 2's vocabulary exists**, which Wave 2 states itself
(*"Wave 5 (console truth) cannot begin its manifest-field-to-rendered-number mapping until this wave's
vocabulary exists"*). **One named cross-wave sequencing constraint:** Task 10 renders the certificate
manifest, whose schema Wave 8 Task 6 owns (`Installers/internal/certificate/schema.json`). That file
must land as a **schema-only commit before Task 10 starts**; Task 10 does not invent a second shape and
does not wait for Wave 8's generator.
**Implements decisions:** D6 as rewritten in the spine — private telemetry, customer-visible detection,
SOC alert and enforcement are four objects and the console must not draw them as one. D14 (keep
fail-open, make it visibly non-green). D17 (this wave delivers a *dimension*).
**Certificate impact:** **console truth** — one of only four dimensions §5.4 says can reach PASS — is
`UNKNOWN` until this wave passes, and stays `UNKNOWN` afterwards until Wave 8 issues an expiring
manifest for it. No risk lane moves. R1-R5 are untouched by anything in this wave.

---

## What this wave CLAIMS, and what it hands back

This file was written after the other nine, which deferred work to a "Wave 5" that did not exist. The
reconciliation records those deferrals as gap **G-1**. Each is claimed here by task number, so a reader
following a pointer from another wave lands on something.

| Deferred by | What was deferred | Lands as |
|---|---|---|
| Wave −1 Task 6 | *"ASI09… requires a confirmation dialog to display the raw action, not an agent-authored summary — a control this product ships and does not test. **Add that test in Wave 5.**"* | **Task 8** |
| Wave 1's "what this wave deliberately does not do" | The lane-tally under-count. *"That is console truth and belongs to **Wave 5**; it is recorded here so it is not lost."* | **Task 11** |
| Wave 2's header | *"Wave 5 (console truth) cannot begin its manifest-field-to-rendered-number mapping until this wave's vocabulary exists."* | **Task 10** |
| Wave 8's dependency line | *"Wave 5 (the console surface the certificate projects onto)."* | **Task 10** |
| Source material §4 Wave 5 | The nine distinguishable objects; the defeat test *"set one manifest field to `null`; the console must render NOT MEASURED, not `0`."* | **Task 10** |

**And one deferral is handed back rather than claimed.** Wave 3 Task 11 Step 4 and Wave 4C Task 9 both
say the `pull_request:` trigger on `Frontend/.github/workflows/vendored-upstream-drift.yml` is "Wave 5's
task". It is not. **Owned by Wave −1 Task 5**, where it is already a step and already exit criterion 7,
and where it sits beside the other half of the same owner cost decision (`holdout-score.yml`'s trigger).
Three waves pointing at a fourth is how a one-line change goes unmade for a month. Task 9 below keeps
only the half no GitHub decision can block, and says so.

---

## Context an engineer needs

### Read `origin/main` with `git show`. The working tree is 525 commits behind.

Measured 2026-08-28: Frontend working tree `1fe6e7a6`, `origin/main` `cac574ae`, **525 commits
behind** (`git rev-list --count HEAD..origin/main`). Backend `0cf9021e` (deployed as ECS task
definition 322), Installers `5b129523` (agent 7.10.6 stable). Work in an isolated worktree off
`origin/main`; never switch a branch in these checkouts (they are shared with live sessions) and
never `git add -A`.

`MSYS_NO_PATHCONV=1` is mandatory on Git Bash for any path containing `.github`; without it
`git show "origin/main:.github/workflows/pr-checks.yml"` fails with
`ambiguous argument 'origin\main;.github\workflows\pr-checks.yml'`.

### The instrument that did not exist when the review was written

`Frontend/scripts/render-harness/` — four files on `origin/main`, verified by
`git ls-tree -r --long origin/main -- scripts/render-harness/`:

| File | Lines | Bytes |
|---|---:|---:|
| `shoot.cjs` | 635 | 29,889 |
| `fixtures.cjs` | 870 | 36,270 |
| `stub-backend.cjs` | 225 | 8,925 |
| `README.md` | 224 | 10,811 |

**635 + 870 + 225 = 1,730 lines of code.** It photographs the console's real routes against a wire
state you choose, over the Chrome DevTools Protocol with Node's global `WebSocket` — **there is no
Playwright or Puppeteer in this workspace and none can be installed**, because `node_modules` is a
junction shared with other checkouts (`README.md`, "Notes that will otherwise cost you an hour").

Six scenarios (`fixtures.cjs:740-870`), and two of them are the whole point:

| Scenario | Wire state |
|---|---|
| `populated` | everything measured, data present — the control |
| `empty-tenant` | every read succeeds, every collection **genuinely empty** |
| `absent-data` | reads succeed, rows exist, **every optional measurement omitted** |
| `read-failed` | the AI reads 503 |
| `slow` | reads hang 60s; `never-settled` is the CORRECT verdict |
| `broken-fixture` | deliberately invalid; exists only to prove the harness can fail |

The README states the rule this wave is built on: *"`empty-tenant` and `absent-data` are different
claims and must never share copy."* **A zero printed anywhere under `absent-data` is a finding.**

Seven failure verdicts (`shoot.cjs:29-35, 532-581`): `doc-status`, `redirected-away`,
`never-settled`, `blank`, `page-error`, `missing-text`/`forbidden-text`, `unfixtured`. Exit **1** if
any shot failed, **2** if it could not run at all (`shoot.cjs:631, 634`). `--strict` turns "the console
asked for a path no scenario answers" into a failure (`:565-566`); `--expect`/`--forbid` take
`||`-separated strings (`:118-122, 559-560`). Output per route: `.png`, `.txt` (the pasteable
rendered innerText), `.json`, plus `summary.json` (`:626`).

### What the harness proves, and what it does not — in its own words

> *"These screenshots are evidence about how the console LOOKS and how it behaves around ABSENT data.
> They are NOT evidence that the backend works."*

Three further limits the README states and this plan repeats rather than eliding: no live-update
channel (the websocket token is refused on purpose, `fixtures.cjs:670`), dev-mode rendering (`next dev
--webpack`, not a production build), and scoring a shot is **a person reading the `.txt`** — the
harness refuses to bank a blank frame, it does not answer the Stage-D question for you.

### Two traps that will otherwise cost this wave a day

**1. The harness cannot run in the local Docker CI as it stands.** `ci/images/` holds five
Dockerfiles — `go124`, `node20`, `node24`, `ops`, `scanner` — and `grep -rn "chrome\|chromium"
ci/images/` returns **zero matches**. The harness needs Chrome and a `next dev` server. So the harness
is an **evidence-producing gate a human runs**, and its artifacts go in the PR body; the *automated*
half of every criterion below is a jest assertion. Task 1 states which half is which, and says so out
loud rather than reporting a local run as a CI gate.

**2. `pr-checks.yml` no longer runs on push or on pull_request.**
`Frontend/.github/workflows/pr-checks.yml` on `origin/main` is `on: workflow_dispatch: {}` — the push
and PR triggers were removed on 2026-08-25 as a cost gate (owner decision, GitHub billed roughly $600
for July 2026). The file says so itself: *"there is now NO automatic gate on GitHub."* Gates run in
`ci/lib/run.mjs Frontend`. Any task in this wave that says "add a job to `pr-checks.yml`" is adding a
job to a **dispatch-only** workflow unless the owner restores the triggers, and this plan says that
where it matters rather than assuming a gate exists.

### The console engine IS current. I re-verified it on 2026-08-28, and here is the number.

`Frontend/lib/ai-security/vendored/MANIFEST.json` pins `Ceragon-Prod/Installers@254d24fc`. Recomputing
each file's sha256 over LF-normalised bytes straight out of **Installers `origin/main`** (`5b129523`,
not the pinned commit):

| File | Lines | sha256 at `Installers@origin/main` | Matches manifest? |
|---|---:|---|---|
| `policyeval.js` | 718 | `724ed5a9fabc33261ef51e79e1bade7d46052884571999d39d3fddeb4d84104c` | **yes** |
| `dlp.js` | 1687 | `2967a3430fd6eda82c4dcf1b0e79030e079a368559bcd9165394832aa994748c` | **yes** |
| `promptrisk.js` | 908 | `b3e998a4342590a4e475f862abf80520716e22adad6ca6a2918f1f22998e6237` | **yes** |

C10 holds today. **Do not re-vendor anything.** The gap is not the copy — it is the guard.

### The guard gap, stated exactly (C10)

`lib/ai-security/vendored/__tests__/vendored-digest.test.ts` is **51 lines** and compares the vendored
copy to `MANIFEST.json` **only**. Its own docblock says it *"fails on ANY local modification"* — which
is the whole of what it can do. It cannot catch the copy and the manifest agreeing with each other
while both sit behind Installers.

The upstream check is `Frontend/.github/workflows/vendored-upstream-drift.yml`, and its triggers are:

```yaml
on:
  workflow_dispatch: {}
  schedule:
    - cron: "15 6 * * *"
```

Its own header carries the instruction that was not followed:

> *"WHEN T-M2 LANDS: add `pull_request:` to the triggers in the SAME change that re-vendors the files,
> exactly as pr-checks.yml prescribes."*

T-M2 landed (`9ce16d1a`, "the playground was demonstrating an engine we stopped shipping"). The trigger
did not. **And the local Docker mirror does not cover it either**: `ci/gates.json:76` lists
`vendored-upstream-drift:drift` under Frontend's `cannotMirror` with the reason *"Cross-repo and
scheduled, not a PR gate."* So the only thing standing between the console and a silently stale
detection engine is a daily cron on a GitHub account whose Actions were blocked org-wide as recently as
2026-08-26. That is the whole guard.

**Two different fixes close it, and they belong to two different waves.** The GitHub-side one — adding
`pull_request:` per the header's own instruction — is **Wave −1 Task 5**, because it is the same owner
cost decision as `holdout-score.yml`'s trigger and must be decided once. The workspace-side one is
**Task 9 below**: an offline comparison in `ci/lib/`, which needs no token, no network and no GitHub
decision, and which nothing can switch off. Task 9 does not re-specify Wave −1's half.

### What CLOSED since the review, and must not be rebuilt

- **The ungoverned-invocation rate reaches the screen.** The old plan's W5 Task 8 exit criterion was
  *"`git grep -n undecidable -- app/ components/ types/ lib/` returns hits."* It now returns **10
  files**, including `types/ai-governance.ts`, `app/ai-control-plane/protection-depth.tsx` and seven
  test files. Closed by `48bba5d3` ("carry undecidable and unreadable-governance the last hop to the
  screen"). **Delete that task; do not re-specify it.**
- **The MCP zero-denominator all-clear.** `5225997f` — the header read *"0 OF 0 CONFIGURATION SOURCES
  READ"* over *"Every configuration source in scope was read and none declares an MCP server."*
  `resolveMcpCoverage` gained a fourth partial-coverage test (a zero denominator), and
  `mcp-governance-content.tsx:640-641` now renders `MCP COVERAGE NOT MEASURED` with *"This is not a
  statement that there are none."* Guarded by `app/mcp/__tests__/mcp-zero-denominator.test.tsx` (199
  lines), whose discriminating pair renders a genuinely-clean tenant **and** a nothing-was-checked
  tenant in one assertion, so a fix that deletes the assurance everywhere fails there.
- **The console already has a NOT-MEASURED vocabulary and it is guarded in at least six places.**
  `components/admin/policy/action-bucket-board.tsx:321-341` (`measuredFpRateText` puts `ABSENT` in the
  value position and always carries the denominator), `app/admin/endpoints/ai-optout-coverage-panel.tsx:309`,
  `app/admin/endpoints/coverage-section.tsx:1693`, `components/admin/ai-security-policy-section.tsx:3382`,
  `app/ai-control-plane/protection-depth.tsx:2568`, plus the MCP surface above. **The task is not to
  invent this vocabulary. It is to find where it is still missing** — and to render a certificate
  through it.

### What is still open, verified line by line on 2026-08-28

Every one of these is the old plan's W5 content, re-measured. Line numbers below are current, not the
2026-08-22 ones.

1. **`lib/ai-posture.ts:17`** — `fetchJsonOrNull<T>(url, signal): Promise<T | null>` still collapses a
   network error, a 401, a 403, a 500 and a malformed body into the same `null` that also means "empty
   list". Live call sites: `app/endpoints/[hostname]/endpoint-hub-content.tsx:292, 296, 300` and
   `components/inventory/inventory-fleet-view.tsx:259, 267, 286`. The hub prints *"No AI agents
   detected on this endpoint."* at `:758` off that null; the fleet view sets
   `const showAi = postureRows !== null` (`:430`) and silently drops four columns
   (`const colCount = showAi ? 10 : 6`, `:452`).
2. **`app/mcp/mcp-approval-actions.tsx:178`** computes `pendingCount` by filtering fetched rows and
   `:207` prints `{pendingCount} awaiting review` — over a **50-row window**.
   `Backend/src/ai-governance/services/mcp-governance.service.ts` `listServers(scope, filters)` defaults
   `limit` to 50 and `ai.controller.ts` calls it **with no filters at all**. The response already
   carries `total`.
3. **`app/admin/endpoints/agents-content.tsx`** — four `EndpointStatCard`s at `:1018-1049`, fed by
   `computeEndpointStats(agents, stableVersion)` at `:764`, with `tone="text-signal-success"` hardcoded
   at `:1034`. The error branch is at `:2093`, more than a thousand lines below the cards, so a failed
   `loadAgents` leaves `agents === []` and paints "Online 0" in the success token.
4. **`components/pr-security/repo-grid-card.tsx:216`** prints
   `<span className="…text-signal-success">0</span>` whenever `lastScan` is truthy, and `:256` prints
   `{lastScan ? "No findings" : "Not scanned"}` — **a FAILED scan is truthy.** The correct predicate is
   already computed in the same file and already used by the footer badge: `lastScanEffectiveStatus`
   (`:96`) plus `scanShowsLifecycleStatus` (`:266`).
5. **`app/ai-control-plane/detections/detections-content.tsx:3468`** re-sorts the merged union by
   `eventTime` unconditionally while the Severity button at `:4365` stays `aria-pressed` and the
   streaming request honours `sort` (`:3096`).
6. **`detections-content.tsx:3610` (`tabCount`) and `:4254` (`unresolved={readUnresolvedCount(counts)}`)**
   read the **streaming** envelope only, while at-rest rows minted at `types/ai-context.ts:736`
   (`id: \`aic:${finding.id}\``) render in the same list.
7. **`detections-content.tsx:3092-3096`** sends `class` + `hostname` to the streaming route;
   `fetchAtRest` (`:3186`) sends neither, because `app/api/ai-context/findings/route.ts:23-31`
   allowlists exactly `limit, offset, state, q, severity, endpointId, since` — **seven params, verified
   verbatim** — and the Backend route behind it declares no more. Meanwhile `buildFilterNote`
   still prints `Rule: X` / `Host: Y` over a list half of which was never narrowed. The file's own
   remedy comment stands: **disclose the asymmetry, never client-filter to fake it.**
8. **`app/admin/endpoints/coverage-section.tsx`** defines `self-reported` at `:98` as *"the endpoint
   attests this control is active, but the server cannot verify it"* and draws it `bg-fg-muted/70`
   (`:129`) — explicitly **not** the success token. Then `:1489` greens `nav === "armed"` and `:1527`
   greens `GUARD_TONE[guard] === "success"`, both derived purely from endpoint-authored beacon fields
   (`navBlockVerdict` `:1028`, `guardVerdict` `:1055`, `GUARD_TONE` `:1175`).
9. **D14 token-unreadable.** `Installers/cmd/devoid/agent_shim.go:107` sets `daemonReachable = true`
   on **any** HTTP response — its own comment at `:76` says *"ANY HTTP status, incl. 401/502"* — and
   `:109` returns `(nil, false, true)` for a 401. `GET /v1/ai/policy` is token-gated; `/health` is not.
   So a user outside the `devoid` group gets 401 on policy, 200 on health, and the shim falls into the
   `default:` branch at `:537` labelled *"No scary warning."*

### The ASI09 control nobody has tested, and what the code actually does

OWASP Top 10 for Agentic Applications 2026, **ASI09 (Human-Agent Trust Exploitation)**, requires that
a confirmation dialog display **the raw action**, not an agent-authored summary. Measured:

- `Installers/cmd/devoid/ai_tool_warn_confirm.go:108` — the **tool gate** asks the developer by calling
  `toolWarnDialogSeam(warnDialogBody(reason, false), false)`.
- `warnDialogBody` (`cmd/devoid/ai_warn_dialog.go:305`) opens with the literal
  `"DeVoid flagged this prompt:\n\n"` (`:320`), then a `reason` string trimmed and **truncated at 220
  characters** (`:316-319`). Its docblock at `:302-304`: *"It carries the resolved CLASS LABELS the
  daemon returned — never prompt text or a credential value."*
- The window title is hardcoded twice: XAML `Text="DeVoid flagged this prompt"`
  (`ai_warn_dialog_windows.go:56`) and `DEVOID_WARN_TITLE=DeVoid — review this prompt` (`:201`).

So when the tool gate holds a **command**, the developer is shown a window that says *"DeVoid flagged
this prompt"* carrying a class label, and is never shown the command, the path, or the destination. The
raw action is in hand and discarded: the call site receives `in aihooks.PreToolUseInput`, which carries
`ToolName`, `ToolInput` and `CWD`.

**The trap, and it is the reason this is not a one-line fix.** The obvious source for the action text is
`commandshape.FromToolInput(toolName, toolInput)` (`internal/daemon/ai_handlers.go:2918`) — but
`commandShape` is deliberately privacy-safe for **the wire**: `ai_tool_handler_test.go:128` pins it to
`"git push --force --token -q"`, i.e. **executable, subcommand and flag names with every argument
literal stripped**. The stripped literals are exactly the fields ASI09 requires the human to see. Local
dialog and wire evidence are two different objects with two different rules, and the fix is to stop
using one for both — not to widen `commandShape`, which would put argument literals on the wire.

**And the prompt lane's refusal to render prompt text is CORRECT and must not be "fixed."** Drawing a
credential in a dialog is a leak. ASI09 applies to the *action* lane. Task 8 changes only the tool path.

### House constraints that bite in this wave

- Frontend jest matches `**/__tests__/**/*.test.ts?(x)` only (`jest.config.js:17`). A test outside a
  `__tests__` directory does not run. There is **no `setupFilesAfterEnv`**, so every render test must
  `import "@testing-library/jest-dom"` itself.
- `npm test` is `npm run check:contrast && jest`, with a `pretest` of
  `check:ai-security-frontend-consumer && test:ai-security-frontend-consumer` (`package.json:24-26`).
  Use `npx jest <path>` for the loop; run `npm test` once before the final commit.
- `npm run lint` chains **five** checks before eslint: `check:no-em-dash`, `check:type-discipline`,
  `check:wire-vocabulary`, `check:response-only-fields`, then eslint. `check-no-em-dash.cjs` parses the
  AST and fails on U+2014 inside any string literal, template span or JSX text under
  `app/`/`components/`/`lib/`. Comments are exempt. Write all UI copy with ordinary punctuation.
- Backend jest is `testRegex: '.*\\.spec\\.ts$'` rooted at `src`, with a live-Postgres fail-closed
  setup (`jest.config.js:16, 23, 28`) — since C5, ~97 live-pg specs **fail dark rather than green**
  when Postgres is absent. Any pre-2026-08-27 "suite green" evidence was collected under the failing-open
  regime.

---

## Task 1: Make the render harness this wave's gate, and prove it can still fail

**Files:**
- `Frontend/scripts/render-harness/fixtures.cjs` (add the AI Security policy fixture; extend
  `absent-data`)
- `Frontend/scripts/render-harness/README.md` (the run recipe this wave is scored against)
- `Frontend/package.json` (an `npm run render:*` entry — there is none today; verified against
  `origin/main`'s 17 scripts)
- `.plans/m47a-20260822/v2-waves/artifacts/w5/` (the banked run output)

**The gap that stops Wave 1 as well as this one.** `fixtures.cjs` answers **19** upstream path patterns
plus per-scenario overrides, and **not one of them is the AI Security policy read**:
`git show origin/main:scripts/render-harness/fixtures.cjs | grep -n "ai-security-policy\|presets"`
returns no route key. So `admin/policies/ai-security` cannot be photographed at all today, and under
`--strict` it reports `unfixtured`. Wave 1 Task 5 Step 5 and Wave 1 Task 7 both end in "attach a
render-harness screenshot of the board" — **they are blocked on this fixture**, which is why it is the
first step here.

- [ ] **Step 1 (RED first, and it is the harness's own red): run the two must-stay-red self-checks
  before anything else.** From `README.md`:
  ```bash
  node scripts/render-harness/shoot.cjs --scenario populated --routes no-such-route --retries 0
  node scripts/render-harness/shoot.cjs --scenario broken-fixture --routes coding-ai/detections --retries 0
  ```
  Expected: `FAIL doc-status` (404) + `blank`, exit **1**; and `FAIL never-settled` (the page hangs on
  "Loading detections..."), exit **1**. **If either goes green, stop** — the README says every other
  result in the run is worthless, and it is right.
- [ ] **Step 2: add the policy-presets fixture** to `fixtures.cjs` for all six scenarios, opening
  `types/ai-governance.ts` first. The README warns why: *"A fixture that omits a required field crashes
  the console, and the crash looks exactly like a product bug; six invented shapes cost most of a day
  the last time this was built."* The `absent-data` variant omits `measuredFpRates` entirely — that is
  the shape Task 10 and Wave 6 both need.
- [ ] **Step 3: commit the run recipe as an npm script**, so the gate is a command and not a paragraph:
  the route list, `--strict`, `--retries 0` for the self-checks, and the `--forbid` corpus from Step 4.
  Routes, verified to exist as `page.tsx` on `origin/main`: `admin/policies/ai-security`,
  `admin/endpoints`, `ai-control-plane`, `ai-control-plane/protection-depth` (via
  `ai-control-plane/policy`), `coding-ai/detections`, `coding-ai/sessions`, `mcp`, `endpoints`,
  `inventory`, `alerts`, `repositories`. Write `mcp` without a leading slash or prefix the command with
  `MSYS_NO_PATHCONV=1` — Git Bash rewrites `/mcp` into a Windows path and `shoot.cjs` detects the
  mangled form and says so.
- [ ] **Step 4: write the `--forbid` corpus, and make it specific.** Under `--scenario absent-data`,
  forbid the strings that can only be true of a measurement: `"0 got through"`, `"No findings"`,
  `"none declares"`, `"0 of 0"`, `"all clear"`. Under `--scenario read-failed`, `--expect "COULD NOT
  LOAD"`. A `--forbid` list of one generic string is not a gate; a list derived from the actual copy on
  each surface is.
- [ ] **Step 5: bank the run.** `summary.json` plus every `.txt` under
  `.plans/m47a-20260822/v2-waves/artifacts/w5/`, with the exit code recorded in the PR body **and the
  README's own disclaimer quoted beside it**: these are evidence about how the console looks around
  absent data; they are not evidence that any Backend produces that state.
- [ ] **Step 6: decide the CI question in writing, do not leave it implied.** Either (a) add Chromium
  to `ci/images/node20.Dockerfile` and register the harness as a `workspaceChecks` entry in
  `ci/gates.json` — the same slot `toolrisk-vocab-parity` occupies — or (b) record in `ci/gates.json`'s
  `cannotMirror` for Frontend **why** it is not a gate. Silence is the option this plan forbids.

**Defeat test:** the two self-checks in Step 1, which are defeat tests by construction — they must stay
RED. Additionally: delete one `--forbid` string from the committed recipe and re-run `absent-data`
against the surface it guards; the run must go from exit 1 to exit 0, proving the string was load-bearing.
**Exit:** a banked `summary.json` covering **11 routes × 3 scenarios (`populated`, `empty-tenant`,
`absent-data`) = 33 shots**, of which **0 carry verdict `FAIL`** and **0 carry a non-empty
`unfixturedUpstreamCalls`** under `--strict`. Both self-checks recorded as exit 1. The CI decision
recorded in `ci/gates.json` either way.

---

## Task 2: A failed AI-plane read stops reading as an empty fleet

**Files:**
- `Frontend/lib/ai-posture.ts:17` (replace `fetchJsonOrNull` with a result shape)
- `Frontend/app/endpoints/[hostname]/endpoint-hub-content.tsx:34, 292, 296, 300, 758`
- `Frontend/components/inventory/inventory-fleet-view.tsx:53, 259, 267, 286, 430, 452`
- `Frontend/app/ai-control-plane/__tests__/endpoint-authored-boundary.test.ts` (identifier rename only —
  see the trap)
- `Frontend/lib/__tests__/ai-posture-fetch.test.ts` (create)
- `Frontend/app/endpoints/__tests__/ai-plane-read-failure.test.tsx` (create)
- `Frontend/components/inventory/__tests__/fleet-ai-plane-failure.test.tsx` (create)

Preserve the old plan's task content (`plan:9724-9900`); it is good and its premise still holds
verbatim. Two corrections to it:

**The trap the old plan did not name.** `endpoint-authored-boundary.test.ts` references
`fetchJsonOrNull` by name at **nine** lines — `:603, 1012, 1667, 1673, 1674, 1682, 1687, 1696, 2083,
2135` — and two of them are behavioural assertions, not prose:
`expect(symbolReadsNetwork(path.join(REPO_ROOT, "lib/ai-posture.ts"), "fetchJsonOrNull")).toBe(true)`
at `:1696` and `:2083`. A blind rename turns that suite red for the wrong reason. Rename the symbol in
the assertions **in the same commit**, and do not relax `symbolReadsNetwork` to make it pass — §20.3.

- [ ] **Step 1 (RED): `lib/__tests__/ai-posture-fetch.test.ts`.** Four cases, each pinning a distinct
  failure: `200` with a body is `{ok: true, data}`; `401` is `{ok: false, failure: "unauthorized"}`;
  `500` is `{ok: false, failure: "server"}`; a torn connection is `{ok: false, failure: "network"}`.
  Expected first run: `fetchJsonResult is not a function`.
- [ ] **Step 2: replace the helper**, keeping the abort-race guard the current call sites rely on
  (`endpoint-hub-content.tsx:277` documents it).
- [ ] **Step 3: the hub distinguishes the three states.** A 500 renders a stated failure with a retry;
  a 403 stays silent (a viewer without AI scope is not an incident); an empty body still renders
  *"No AI agents detected on this endpoint."*
- [ ] **Step 4: the fleet view stops silently dropping four columns.** `showAi` becomes three-valued;
  a failed read renders a stated failure banner and **keeps the column count stable**, because a table
  that changes width on a read failure teaches the operator the fleet changed shape.
- [ ] **Step 5: photograph it.** `--scenario read-failed --routes endpoints,inventory
  --expect "COULD NOT LOAD"`.

**Defeat test:** `ai-plane-read-failure.test.tsx` › "a 500 is not an empty fleet" — map `failure` back
to `null` in the hub. Expected failure text:
`Unable to find an element with the text: /could not load/i` while the DOM shows
`No AI agents detected on this endpoint.`
**Second defeat test:** `endpoint-authored-boundary.test.ts:1696` after the rename — point
`symbolReadsNetwork` at a symbol that does not fetch. Expected: `expect(received).toBe(true)` receiving
`false`.
**Exit:** `git grep -n fetchJsonOrNull` on the wave branch returns **0** hits outside git history.
Three failure classes (`unauthorized`, `server`, `network`) render three distinct strings, asserted by
name; a 403 renders none.

---

## Task 3: The MCP approval queue stops asserting a count it cannot see

**Files:**
- `Frontend/app/mcp/mcp-approval-actions.tsx:178, 207, 209`
- `Backend/src/ai-governance/controllers/ai.controller.ts` (the `listServers(scope)` call)
- `Frontend/app/mcp/__tests__/mcp-approval-window.test.tsx` (create)

`listServers(scope, filters = {})` already declares `approvalStatus`, `limit` and `offset`, defaults
`limit` to 50, and returns `total`. **Three parameters exist and no caller has ever used one.** The
console then counts pending rows inside a 50-row window sorted `last_seen DESC` and prints the result
as the queue depth.

- [ ] **Step 1 (RED): assert the discriminating pair, the way `mcp-zero-denominator.test.tsx` does.**
  A tenant with 12 pending servers among 30 total, and a tenant with 12 pending among 300 total where
  the window truncates: the two must not render the same sentence. Expected first run: both render
  `12 awaiting review`.
- [ ] **Step 2: pass the filters that already exist.** `approvalStatus=pending` with an explicit limit,
  and print the server's `total` for the slice actually requested.
- [ ] **Step 3: when the window is capped, say so in plain words** — reuse the existing vocabulary
  (`"has not been measured"` / `"This is not a statement that there are none"`), do not mint a new one.
  `check:wire-vocabulary` runs in `npm run lint` and will hold you to it.
- [ ] **Step 4: the "Show all servers" toggle must change the request**, not just the client-side
  filter, or the fix moves the lie one layer down.

**Defeat test:** `mcp-approval-window.test.tsx` › "a truncated window does not print a queue depth" —
revert the controller to `listServers(scope)`. Expected failure text:
`expect(element).toHaveTextContent(/at least 12/)` receiving `12 awaiting review`.
**Exit:** `GET /api/v1/ai/mcp/servers?approvalStatus=pending&limit=<n>` carries the filters;
the header prints the server's `total`; and the number of console surfaces printing a count derived
from an unstated page window drops from **1 to 0** on this route, asserted by the discriminating pair.

---

## Task 4: Two green zeros that describe a failure

**Files:**
- `Frontend/app/admin/endpoints/agents-content.tsx:764, 1018-1049, 2093`
- `Frontend/components/pr-security/repo-grid-card.tsx:96, 216, 256, 266`
- `Frontend/app/admin/endpoints/__tests__/agents-stats-on-error.test.tsx` (create)
- `Frontend/components/pr-security/__tests__/repo-card-failed-scan.test.tsx` (create)

Both are the same defect and both are one predicate away from correct. `repo-grid-card` **already
computes the right predicate in the same file** — `lastScanEffectiveStatus` at `:96` and
`scanShowsLifecycleStatus` at `:266`, used by the footer badge — and the finding count at `:216` and
the label at `:256` simply do not consult it.

- [ ] **Step 1 (RED): `agents-stats-on-error.test.tsx`** — render with `loadAgents` rejecting and assert
  **no** `EndpointStatCard` is in the document. Expected first run: four cards, "Online 0" in
  `text-signal-success`.
- [ ] **Step 2: gate the stat card block on `error`**, at `:1018`, not inside the table body at `:2093`.
- [ ] **Step 3 (RED): `repo-card-failed-scan.test.tsx`** — the discriminating pair again. A repo whose
  last scan COMPLETED clean keeps green `0` + `No findings`. A repo whose last scan FAILED with no
  findings renders `-` and `Not scanned`, and **carries no `text-signal-success` class anywhere on the
  card**. Assert the class, not only the text: the text can be fixed while the green stays.
- [ ] **Step 4: route `:216` and `:256` through `lastScanEffectiveStatus`.** Do not add a second status
  helper; there is one and it is already right.

**Defeat test:** `repo-card-failed-scan.test.tsx` › "a failed scan is not a clean scan" — revert `:256`
to `{lastScan ? "No findings" : "Not scanned"}`. Expected failure text:
`expect(element).not.toHaveClass("text-signal-success")` on the count span of the FAILED-scan card.
**Exit:** on `--scenario read-failed --routes admin/endpoints,repositories`, the number of stat cards
rendered is **0** and the number of `text-signal-success` nodes on a FAILED-scan card is **0**, both
asserted in jest and both photographed.

---

## Task 5: Sort, tab counts, and the filter note stop describing a list they only half narrowed

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:3092-3096, 3186, 3468, 3610, 4254, 4365`
- `Frontend/app/ai-control-plane/detections/use-detection-filters.ts` (`buildFilterNote`)
- `Frontend/app/api/ai-context/findings/route.ts:23-31` (READ ONLY — the seven-param allowlist stays)
- `Frontend/app/ai-control-plane/detections/__tests__/mixed-lane-honesty.test.tsx` (create)

This is one defect with three faces: the detections list is a **union of two lanes** — the streaming
events lane and the at-rest findings lane (`types/ai-context.ts:736`, `aic:<uuid>`) — and three
different pieces of UI describe the union using a property only one lane has.

**The remedy is already established in this file** and must be followed rather than replaced. The
`until` comment at `detections-content.tsx:3219-3227` states it: **disclose the asymmetry; never
client-filter to fake it.** And `app/api/ai-context/findings/route.ts:18-22` states why the allowlist
is closed: *"a console that shows a site filter which silently does nothing is worse than one with no
filter at all."* **Do not widen the seven-param allowlist to make the note true.** That is the weakening
§20.3 forbids, and it would also mint a param the Backend route does not declare.

- [ ] **Step 1 (RED): one test file, three cases**, each with at-rest rows in play:
  (a) with `?sort=severity`, the highest-severity row is first;
  (b) the tab strip carries the live-activity-only sentence and the unresolved KPI renders its
      at-rest-specific absent reason rather than the "server didn't return triage counts" reason;
  (c) with a Rule or Host facet set, the screen states which facets narrow only the live half.
  A fourth case with **no** at-rest rows asserts all three sentences are absent — the paired control,
  without which a fix that always prints the disclosure passes.
- [ ] **Step 2: honour `sort` across the union** at `:3468`, or disable the Severity button and say why.
  A button that is `aria-pressed` and does nothing is the same defect as a disabled button with an
  excuse.
- [ ] **Step 3: `tabCount` and `readUnresolvedCount` state their population.** They read the streaming
  envelope; the list does not. Either count both lanes or name the one being counted.
- [ ] **Step 4: `buildFilterNote` names the half it narrowed.** The at-rest request still sends exactly
  seven params.

**Defeat test:** `mixed-lane-honesty.test.tsx` › the no-at-rest control case — move the disclosure
outside its conditional. Expected failure text:
`expect(screen.queryByText(/narrows live activity only/i)).toBeNull()` receiving an element, on a page
with no at-rest row.
**Exit:** `3` disclosures, each asserted present with at-rest rows and absent without them. The at-rest
request carries **7** params, unchanged, asserted by name. Zero client-side filtering added.

---

## Task 6: An endpoint's own word stops being drawn in the success token

**Files:**
- `Frontend/app/admin/endpoints/coverage-section.tsx:98, 129, 1028, 1055, 1175, 1489, 1527`
- `Frontend/app/admin/endpoints/__tests__/endpoint-authored-tone.test.tsx` (create)

The file already contains the correct doctrine at `:98` and already draws `self-reported` in the
neutral token at `:129`. Then `:1489` greens `nav === "armed"` and `:1527` greens
`GUARD_TONE[guard] === "success"`, both computed from endpoint-authored beacon fields by
`navBlockVerdict` (`:1028`) and `guardVerdict` (`:1055`).

- [ ] **Step 1 (RED): assert the token, not the label.** For a row whose only evidence is
  endpoint-authored, no descendant carries `text-signal-success` or `bg-signal-success`. Expected first
  run: both selectors match.
- [ ] **Step 2: remove `"success"` from `GUARD_TONE`'s union type** at `:1175`, so the compiler enumerates
  every consumer rather than leaving one behind. This is the tool-risk `resolveToolRiskDefaults` pattern
  applied to a tone map.
- [ ] **Step 3: a MEASURED disarm and a MEASURED fail-open still produce critical.** Assert it in the
  same file, or the fix reads as "endpoint claims are now invisible" rather than "endpoint claims are
  not verification".

**Defeat test:** `endpoint-authored-tone.test.tsx` › "an endpoint's own beacon is never drawn as
verified" — restore `"success"` to `GUARD_TONE` and re-green `nav === "armed"`. Expected failure text:
`expect(element).not.toHaveClass("text-signal-success")` on the nav-block cell of an endpoint whose
`navBlockVerdict` is `armed` from a beacon alone.
**Exit:** `coverage-section.tsx` produces the success token for **0** endpoint-authored readings;
`GUARD_TONE`'s union no longer contains `"success"`; and a measured disarm still produces critical,
asserted as the paired control.

---

## Task 7: D14 — a 401 from the daemon means NOT GOVERNED, not "reachable"

**Files:**
- `Installers/cmd/devoid/agent_shim.go:76, 107-109, 512-537`
- `Installers/cmd/devoid/ai_daemon_ask.go` (the vocabulary already exists — `daemonAskStatus`)
- `Installers/cmd/devoid/agent_shim_unreadable_policy_test.go` (create)

`agent_shim.go:76` is explicit that `daemonReachable` means *"the daemon answered at all (ANY HTTP
status, incl. 401/502)"* — which is a true statement about a variable whose **name** is then used to
decide whether the developer is warned. A user outside the `devoid` group gets 401 on the token-gated
`/v1/ai/policy` and 200 on the ungated `/health`, and lands in the `default:` branch at `:537`,
commented *"No scary warning."*

- [ ] **Step 1 (RED): three cases, one per status.** 401 on a **managed** endpoint blocks; 401 on a
  cooperative endpoint warns; 502 is unchanged. Expected first run: all three take the `default:` branch.
- [ ] **Step 2: split the signal.** `daemonReachable` keeps its meaning; add the classification
  `ai_daemon_ask.go` already models. Do not overload the existing boolean — its comment is correct and
  the bug is one layer up.
- [ ] **Step 3: suppress transport injection on an unreadable policy.** A shim that injects a proxy it
  cannot read a policy for is governing with a policy nobody supplied.
- [ ] **Step 4: `go test ./cmd/devoid/`** and baseline any failure against `origin/main` in a throwaway
  worktree before attributing it.

**Defeat test:** `agent_shim_unreadable_policy_test.go` › "a 401 on a managed endpoint blocks" — restore
`return nil, false, true` for the 401 case. Expected failure text: the managed case asserting a block
receives the `default:` "no admin AI policy" outcome.
**Exit:** **3** statuses classified distinctly (`401`, `502`, `200`), asserted by name; a 401 on a
managed endpoint blocks and injects nothing. `go build ./... && go test ./cmd/devoid/` green.

---

## Task 8: The confirmation dialog names the action it is confirming (OWASP ASI09)

**Files:**
- `Installers/cmd/devoid/ai_tool_warn_confirm.go:92-108`
- `Installers/cmd/devoid/ai_warn_dialog.go:302-335` (`warnDialogBody`, `warnDialogHint`)
- `Installers/cmd/devoid/ai_warn_dialog_windows.go:56, 201`
- `Installers/cmd/devoid/ai_tool_warn_confirm_test.go` (extend; 9 tests today, `:55-215`)
- `Installers/cmd/devoid/ai_warn_dialog_test.go` (extend; do **not** change the prompt-lane cases —
  the six `TestWarnDialogBody_*` functions at `:16`, `:32`, `:42`, `:48`, `:94`, `:106`)

**Claimed from Wave −1 Task 6**, which names the requirement and says *"Add that test in Wave 5."*
Wave −1 keeps the standards **columns** in the class-catalog table; this task supplies the ASI09
**control** and the test that makes it true. They are different objects: a class mapping says what a
detector detects, a control mapping says what a UI is obliged to show.

**Wave 8 Task 7 owns the generated standards mapping and `TestEveryClassCarriesStandardsIds`**
(reconciliation D-12). This task does not build a mapping generator; it populates one entry in the
array that generator emits, and the exit criterion below is written so Wave 8's totality test counts it.

This is the one control in this wave mapped to a named external requirement, and it is the one the
review does not have.

**Do not touch the prompt lane.** `warnDialogBody`'s refusal to render prompt text is correct and
deliberate — drawing a credential in a dialog is a leak. ASI09 is about the **action** lane, and the
tool gate currently borrows the prompt lane's body wholesale, hardcoded string and all.

**Do not reach for `commandShape`.** It is the wire projection and it is pinned to strip argument
literals (`internal/daemon/ai_tool_handler_test.go:128`, `"git push --force --token -q"`). The stripped
literals — path, destination, resource — are precisely what ASI09 requires the human to see. Widening
`commandShape` would put them on the wire. The dialog runs on the developer's own machine, showing the
developer their own agent's proposed command; that is a different privacy question with a different
answer, and this task writes that reasoning into the code.

- [ ] **Step 1 (RED): `TestToolWarnDialogShowsTheProposedAction`.** Swap `toolWarnDialogSeam` for a
  recorder, drive `confirmToolWarnAtDesktop` with a `PreToolUseInput` whose `ToolInput` is
  `{"command":"rm -rf /var/lib/postgresql/data"}`, and assert the captured body **contains the command
  verbatim** and **does not contain** the string `"flagged this prompt"`. Expected first run: the body is
  `"DeVoid flagged this prompt:\n\n<class label>\n\n..."` and the command appears nowhere.
- [ ] **Step 2: give the tool lane its own body builder**, taking `in aihooks.PreToolUseInput` rather
  than a pre-rendered `reason` string. It renders, in this order: the tool name, the raw proposed
  action, the resolved destination or path if the input carries one, the working directory, then the
  class labels and what each button does.
- [ ] **Step 3: the title stops saying "prompt" on the action lane.** `ai_warn_dialog_windows.go:56`
  hardcodes `Text="DeVoid flagged this prompt"` in XAML and `:201` sets
  `DEVOID_WARN_TITLE=DeVoid — review this prompt`. Both must become parameters. **The 220-character
  truncation at `ai_warn_dialog.go:316-319` must not silently swallow the action**: truncate the class
  prose, never the command, and if the command itself exceeds the budget, show its head and tail with an
  explicit elision marker rather than a clean-looking prefix.
- [ ] **Step 4: keep `offerRedact` false on this lane and keep the comment that explains why**
  (`ai_tool_warn_confirm.go:102-107`) — a tool call is an action, not a body, and there is nothing to
  strip. Offering the button would promise a redaction that never happens.
- [ ] **Step 5: assert every failure still lands on BLOCK.** The file's own contract at `:44-49`: a
  dialog that could not be drawn, a timeout, an unparseable answer, a daemon that refused to record.
  Adding a code path to the body builder must not add a way to return allow.
- [ ] **Step 6: re-do the timeout arithmetic if — and only if — you change any constant.** The
  `CURRENT ARITHMETIC` table at `ai_warn_dialog.go:67-73` carries it verbatim: 30s dialog countdown +
  10s PowerShell process cap = 40s worst case, against the 60s host budget we install ourselves
  (`aihooks.hookTimeoutFor`, uniform per event), leaving 20s of margin. The comment's own instruction is
  *"keep this paragraph exact — a previous version of this comment shipped a wrong headroom figure and
  cost a production hang"*: the window stayed on screen and clickable with no parent left to receive the
  answer. **This task changes text, not timing.** `warnDialogTimeoutSeconds` is at `:85` and does not move.

**Defeat test:** `TestToolWarnDialogShowsTheProposedAction` — revert `ai_tool_warn_confirm.go:108` to
`toolWarnDialogSeam(warnDialogBody(reason, false), false)`. Expected failure text:
`dialog body does not contain the proposed action; got "DeVoid flagged this prompt:\n\ndestructive-rm:warn..."`.
**Second defeat test:** `TestToolWarnDialogTruncationNeverEatsTheCommand` — feed a 400-character command
and assert both head and tail survive with an elision marker. Revert to the flat 220-char cut and it
goes RED with the command's tail missing.
**Third defeat test:** the six existing `TestWarnDialogBody_*` prompt-lane cases in
`ai_warn_dialog_test.go` (`:16`, `:32`, `:42`, `:48`, `:94`, `:106`) must remain green and
**unmodified** — proof that the action lane was split off rather than the prompt lane loosened. A diff
that touches those six functions fails review.
**Exit:** on the tool lane, **1** dialog renders the raw proposed action, the tool name and the working
directory, and **0** dialogs on that lane contain the string `"prompt"`. **6** prompt-lane cases green
and byte-identical. Mapped in the certificate's `system.standardsMapping.owaspAsi2026` as `ASI09` — the
first entry in that array, and the only control in this wave that populates it. **The array itself, and
the totality test over it, are Wave 8 Task 7's**; this task's contribution must survive that test
unchanged.

---

## Task 9: Close the vendored-engine upstream-drift gap with a check nothing can switch off

**Files:**
- `ci/lib/vendored-engine-parity.mjs` (create — the offline check)
- `ci/lib/vendored-engine-parity.test.mjs` (create — its mutation proof)
- `ci/gates.json` (`workspaceChecks`)
- `Frontend/lib/ai-security/vendored/__tests__/vendored-digest.test.ts` (READ ONLY — **do not weaken**)
- `Frontend/.github/workflows/vendored-upstream-drift.yml` (READ ONLY here — see the pointer below)

**The GitHub half is not this task's.** Adding `pull_request:` to `vendored-upstream-drift.yml`, per the
instruction in its own header at `:29-31`, is **owned by Wave −1 Task 5** — it is a step there and exit
criterion 7 there, and it is the same owner cost decision as `holdout-score.yml`'s trigger, which Wave
−1 also owns. Wave 3 Task 11 Step 4 and Wave 4C Task 9 both point here instead; both pointers are wrong
and both should read Wave −1 Task 5. Do not edit that workflow from this wave.

What this task must carry, because its own exit criterion depends on it: **until Wave −1's half lands,
the GitHub-side upstream check is a `workflow_dispatch` + daily cron** (`:39-43`, cron `15 6 * * *`) on
an account whose Actions were blocked org-wide as recently as 2026-08-26, and it needs
`secrets.INSTALLERS_READ_TOKEN` (`:72`) to run at all. So *"the console's detection engine is
byte-identical to the shipped endpoint engine"* is guarded per-PR against **local edits only** by
`vendored-digest.test.ts`, and against **upstream drift** only by the workspace check built below.

**The check nobody can switch off, and it is unblocked today.** `ci/gates.json` already has the
right slot: `workspaceChecks`, currently holding `toolrisk-vocab-parity` and its self-test, whose stated
reason is *"Nothing inside a single repo's CI can see this; that is why it is here and not under
'mirrored'."* This is the identical shape. The Installers checkout is on disk in this workspace, so the
comparison needs no token and no network.

- [ ] **Step 1 (RED): `ci/lib/vendored-engine-parity.test.mjs` first.** Fabricate three trios: (a) all
  three files current — PASS; (b) the manifest and the copy agreeing with each other while
  `Installers/browser-extension/src/dlp.js` has moved — **DRIFT**; (c) the Installers checkout absent —
  **NOT CHECKED**. Case (b) is the exact condition `vendored-digest.test.ts` structurally cannot see.
  Expected first run: `Cannot find module '../lib/vendored-engine-parity.mjs'`.
- [ ] **Step 2: write the check**, modelled line for line on `ci/lib/vocab-parity.mjs`. It derives
  everything from bytes on disk, normalises LF (a raw byte compare goes red on every Windows worktree —
  the manifest's own `refresh` note says the digest is over LF-normalised content), and uses the same
  closed exit vocabulary: **0 PASS, 1 DRIFT, 2 NOT CHECKED, 3 usage**.
- [ ] **Step 3: preserve the NOT-CHECKED discipline exactly.** `vendored-upstream-drift.yml:33-37`
  states the rule and it is the failure class this whole task exists to close: *"A drift check that
  exits 0 because it checked nothing reports the same green as one that checked and found nothing."*
  A missing checkout, an unreadable file or unparseable JSON exits non-zero.
- [ ] **Step 4: register both in `ci/gates.json` `workspaceChecks`**, with a `why` written in the same
  voice as the existing two entries, naming C10 and naming what `vendored-digest.test.ts` cannot see.
- [ ] **Step 5: land it green.** Verified 2026-08-28: all three digests already match Installers
  `origin/main`, so the check passes on its first commit. `pr-checks.yml`'s own rule — *"Landing a gate
  that is red from its first commit teaches everyone to ignore red"* — is satisfied without any
  re-vendoring.
- [ ] **Step 6: do not touch `vendored-digest.test.ts`.** It is 51 lines and it does its job. This task
  adds a check beside it; it removes nothing.

**Defeat test:** `ci/lib/vendored-engine-parity.test.mjs` — mutate the fabricated
`Installers/browser-extension/src/promptrisk.js` by one byte while leaving both the vendored copy and
`MANIFEST.json` internally consistent. Expected: exit **1** with a report naming `promptrisk.js`, the
manifest's pinned commit `254d24fc`, and Installers' current `origin/main`. Then delete the fabricated
Installers checkout: expected exit **2**, `NOT CHECKED`, still non-zero.
**Second defeat test:** run `npx jest lib/ai-security/vendored` against the same mutated trio — it must
stay **GREEN**, which is the proof that the two checks answer different questions and that the new one
was necessary.
**Exit:** `node ci/lib/vendored-engine-parity.mjs` covers **3 files × 2 locations = 6 comparisons** and
reports `PASS`, with the digest triple recorded in this plan and re-verified 2026-08-28 by recomputing
sha256 over LF-normalised bytes straight out of `Installers@origin/main`:
`policyeval.js 724ed5a9…104c`, `dlp.js 2967a343…748c`, `promptrisk.js b3e998a4…6237`, all matching
`MANIFEST.json` at `Installers@5b129523`. Registered as a `workspaceChecks` entry, so
`node ci/lib/run.mjs workspace` fails on upstream drift.
**Owned by Wave −1 Task 5:** the `pull_request:` trigger on `vendored-upstream-drift.yml`, and the owner
cost decision it is blocked on. Until it lands, every appearance of the claim *"the console's detection
engine is byte-identical to the shipped endpoint engine"* carries the caveat that upstream drift is
caught by a workspace check and a daily poll, **not** by a per-PR gate.

---

## Task 10: Project the certificate manifest onto the console, and make a `null` render as NOT MEASURED

**Files:**
- `Installers/internal/certificate/schema.json` (READ ONLY — landed by Wave 8 Task 6 as a schema-only
  commit; see the sequencing constraint at the top of this wave)
- `Frontend/types/certificate.ts` (create — the projection type, generated from or asserted against
  the schema)
- `Frontend/components/admin/certificate-panel.tsx` (create)
- `Frontend/scripts/render-harness/fixtures.cjs` (a manifest fixture per scenario)
- `Frontend/components/admin/__tests__/certificate-projection.test.tsx` (create)

**What must be rendered, from §5.3 and review §15's W5/W6 row** — nine distinguishable objects, and the
current console conflates several of them:

detection match · private monitor telemetry · customer-visible detection · policy decision ·
enforcement result · security outcome · coverage-unknown state · certificate boundary + freshness +
exclusions · downgrade reason.

**The `expiresAt` rule is the one most likely to be dropped.** §5.3 sets a **90-day TTL**, matching
AIUC-1's quarterly re-test requirement. A certificate past `expiresAt` reads `UNKNOWN` **in the
console**, not just in the generator — otherwise the console keeps displaying a PASS that the manifest
itself has already retired.

- [ ] **Step 1 (RED): `certificate-projection.test.tsx`, four cases.**
  1. Every rendered number carries the manifest field it came from, asserted as a `data-manifest-field`
     attribute or equivalent — so the criterion "traces to a manifest field" is machine-checkable and
     not a review opinion.
  2. `metrics.precision.lower95 = null` renders `NOT MEASURED`, **never `0`** and never `0%`.
  3. `evaluation.eligible = 0` renders no rate at all — a zero denominator is not a rate, which is the
     same rule `getMeasuredFpRates` enforces on the Backend and `resolveMcpCoverage` enforces on the
     MCP surface. Three surfaces, one rule, stated identically.
  4. `expiresAt` in the past renders `UNKNOWN` regardless of `status`.
  Expected first run: `Cannot find module '@/components/admin/certificate-panel'`.
- [ ] **Step 2: render `profile.exclusions` as a first-class list, not a footnote.** Review §P1-09: an
  exclusion has a certificate consequence. Today's console has no place to put one. Per Wave 1, the
  first entry will read *"51 of 81 producer DLP classes have no administrator control"* until Wave 1
  lands.
- [ ] **Step 3: render `status` and `downgradeTriggers` together.** A `NOT_READY` with no visible
  blocker is indistinguishable from a bug.
- [ ] **Step 4: render `multiplicity.tier`.** A Tier B row carries an interval with **no threshold
  attached** (§5.2) and the console must not draw it beside a Tier A row as if the two were the same
  claim.
- [ ] **Step 5: add the manifest fixture to all six harness scenarios.** `absent-data` omits every
  optional metric; `populated` fills them; `empty-tenant` carries real zeros with real denominators.
  These three are the discriminating triple, and they are what makes the wave's headline defeat test
  runnable.
- [ ] **Step 6: mark the live half blocked, in the plan and in the PR.** The console renders a fixture
  today. It renders a **generated** certificate only after Wave 8 Task 6 ships
  `cmd/devoid-certificate`. Do not describe this task as delivering a certificate.

**Defeat test:** `certificate-projection.test.tsx` › "a null measurement is NOT MEASURED, never zero" —
add `?? 0` to the metric formatter. Expected failure text:
`expect(element).toHaveTextContent("NOT MEASURED")` receiving `0.0%`.
**Second defeat test:** the harness. `--scenario absent-data --routes admin/policies/ai-security
--forbid "0.0%||0 of 0"` must exit **1** if the `?? 0` is present and **0** when it is not — the
source material's own stated defeat test, made executable.
**Third defeat test:** › "an expired certificate reads UNKNOWN" — remove the expiry comparison.
Expected: `expect(element).toHaveTextContent("UNKNOWN")` receiving `PASS`.
**Exit:** **9** distinguishable objects rendered, enumerated in the test by name. **0** rendered numbers
without a `data-manifest-field` source attribute, over the `populated` fixture, counted by the test
rather than asserted in prose. **0** rendered denominators without a source under `absent-data`.
**Blocked, named:** the live certificate requires Wave 8 Task 6; until then this task delivers a
projection over a committed fixture and the console-truth dimension stays `UNKNOWN`.

---

## Task 11: The three lane headers stop being the only answer to "is anything set to warn?"

**Files:**
- `Frontend/components/admin/policy/category-bucket-board.tsx:1758-1766, 2153, 2164-2167, 2251-2260`
- `Frontend/components/admin/policy/ai-category-board-model.ts:179-190` (READ ONLY — `categoryDisposition`
  is correct and does not move)
- `Frontend/components/admin/policy/__tests__/category-bucket-board.test.tsx` (READ ONLY — **the T-U8,
  T-U9 and T-U12 cases stay byte-identical**; that is this task's proof it did not re-open the over-count)
- `Frontend/components/admin/policy/__tests__/category-board-lane-residual.test.tsx` (create)

**Claimed from Wave 1**, which measured it, refused to fix it in a vocabulary wave, and wrote *"That is
console truth and belongs to **Wave 5**; it is recorded here so it is not lost."*

**The mechanism, verified line by line on `origin/main` (`cac574ae`) 2026-08-28.** Three things compose,
and every one of them is individually correct:

1. `categoryDisposition` (`ai-category-board-model.ts:179-188`) is **STRICTEST WINS** — it returns
   `block` on the first blocked member and never looks further. Its docblock defends the choice, and the
   defence is right: *"A category collapsed to its majority would show Monitor over a set containing a
   blocked private key."*
2. `byDisposition` (`category-bucket-board.tsx:1758-1766`) files each **category** into one of three
   lanes by that folded value, and `inColumn = byDisposition[disposition]` (`:2153`) is what a lane
   header iterates.
3. `detectorCount` (`:2164-2167`) sums `membersAtDisposition(c, disposition).length` over `inColumn`
   only. `membersAtDisposition` (`:483-489`) is itself exactly right — it filters to the members that
   carry the lane's own disposition, which is the **T-U8** fix that stopped one blocked class reporting
   thirty siblings as blocked.

The header then prints, at `:2256-2260` on the span carrying `data-bucket-count` (`:2251`):
`{inColumn.length} categories · {detectorCount} detectors`.

**The residual is a member stored at disposition X inside a category whose fold is Y.** Lane X never
sees it, because its category is filed under Y and so is absent from `inColumn`. Lane Y never counts it,
because `membersAtDisposition` filters it out. It is in **no** lane header. Under strictest-wins that is
not an edge case: it is what the board leaves behind every time an admin moves one class, and it is
precisely what a pinned member (T-U8) is *for*.

**This is already a recorded decision, not an unnoticed bug — and that is why the fix must be additive.**
`category-bucket-board.test.tsx:298-306` asserts the consequence in prose and in an expectation: *"those
29 are counted in NO lane header. A member is only counted in the lane its CATEGORY sits in, and dlp
sits in Block… So the three headers do not sum to the catalogue, and the row split is the only place
those 29 are accounted for."* The per-category split (`data-member-split`, `:569`, e.g.
`"30 detectors · 1 Block / 29 Monitor"`) is real and is where they are accounted for — but it is
**per row**, and the question an administrator asks the board is asked of the **lane header**. On a
board whose categories all fold to Block, Warn answers *"is anything set to warn?"* with
`0 categories · 0 detectors` while members warn.

**Do not "fix" this by counting every member of every category in its lane.** That is the T-U8 defect
restored, and `category-bucket-board.test.tsx:273-274` will go red naming it (`"24 detectors"` /
`not "30 detectors"`). §20.3: never weaken a guard to fit a task. The fix is a **board-level residual
statement** beside the three headers, so the headers' deliberate non-summation is disclosed once at the
board, not only inside each collapsed row.

- [ ] **Step 1 (RED): `category-board-lane-residual.test.tsx`, built as a discriminating pair.**
  (a) A board where every category folds to Block while members are stored at `warn` and `monitor`: the
  board states the residual, names the dispositions it is holding, and points at the row split. Expected
  first run: nothing is rendered, and Warn reads `0 categories · 0 detectors`.
  (b) The paired control — a board with a **genuinely uniform** posture (no member at a disposition its
  category does not carry): the residual statement is **absent**. Without (b), a fix that always prints
  a residual passes and teaches the admin to ignore it.
- [ ] **Step 2: compute the residual from the same helper the headers use.** Derive it as
  `every member` minus `the three lanes' detectorCounts`, using `membersAtDisposition` rather than a
  second traversal. A second counting path is how the row split and the mini-bar disagreed before
  (`:491-500` records that history) and it is not to be repeated.
- [ ] **Step 3: the residual carries its dispositions, not just a total.** "7 detectors are set to Warn
  or Monitor inside categories this board shows under Block" answers the administrator's question;
  "7 detectors are not counted above" does not.
- [ ] **Step 4: do not add a fourth `[data-bucket]`.** `category-bucket-board.test.tsx:37` and `:48` assert
  exactly three columns and no fourth, with the reason written out — *"a fourth column is how 'allow'
  comes back in through the side door."* The residual is a board-level line, not a lane.
- [ ] **Step 5: photograph it** on `admin/policies/ai-security` with Task 1's fixture, under `populated`
  and under a folded-board variant, and bank both `.txt` files. This is the surface Wave 1 Task 5 and
  Wave 1 Task 7 attach screenshots of; the residual line must be legible in theirs too.

**Defeat test:** `category-board-lane-residual.test.tsx` › the paired control — print the residual
unconditionally. Expected failure text:
`expect(screen.queryByText(/inside categories this board shows under/i)).toBeNull()` receiving an
element, on a uniformly-dispositioned board.
**Second defeat test:** the three existing suites. Revert the residual to a naive "count every member in
its category's lane" and `category-bucket-board.test.tsx:273-274` goes RED with
`expect(element).toContain("24 detectors")` receiving `30 detectors` — the T-U8 regression, caught by a
test this task never touches.
**Exit:** the accounting identity holds and is **asserted, not described** — the three lane detector
counts plus the residual equal the total membership of every category that is not `modeOnly`
(`modeOnly` categories carry `members: []` in the fixture and return `[]` from `membersAtDisposition`,
so they contribute zero to both sides). Asserted over **3** fixtures — uniform, one-blocked-class,
all-folded-to-Block — with **the total printed by the test** rather than written into this plan.
**1** residual statement rendered on the folded board and **0** on the uniform one. **0** lines changed
in `category-bucket-board.test.tsx`. **0** `[data-bucket]` columns added.

---

## Wave 5 exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **33 banked harness shots (11 routes × 3 scenarios), 0 with verdict `FAIL`, 0 with a non-empty
   `unfixturedUpstreamCalls` under `--strict`**, plus both must-stay-red self-checks recorded at exit 1.
   Defeat: delete a `--forbid` string and the guarded run flips from exit 1 to exit 0.
2. **`fetchJsonOrNull` returns 0 hits** on the wave branch, and **3** failure classes render **3**
   distinct strings while a 403 renders none. Defeat: `ai-plane-read-failure.test.tsx`, map `failure`
   back to `null`.
3. **0 stat cards render while `error` is set**, and **0** `text-signal-success` nodes appear on a
   FAILED-scan repo card, while a COMPLETED clean scan keeps its green `0`. Defeat:
   `repo-card-failed-scan.test.tsx`, revert `repo-grid-card.tsx:256`.
4. **3 mixed-lane disclosures**, each present with at-rest rows and absent without them, with the
   at-rest request still carrying exactly **7** params. Defeat: the no-at-rest control case.
5. **`coverage-section.tsx` produces the success token for 0 endpoint-authored readings** and
   `GUARD_TONE`'s union no longer contains `"success"`, while a measured disarm still produces critical.
   Defeat: `endpoint-authored-tone.test.tsx`.
6. **3 daemon statuses classified distinctly**, with a 401 on a managed endpoint blocking and injecting
   no transport. Defeat: `agent_shim_unreadable_policy_test.go`.
7. **The tool-gate dialog contains the raw proposed action and 0 occurrences of the word "prompt"**,
   with the prompt-lane tests unmodified and green. `ASI09` appears in
   `system.standardsMapping.owaspAsi2026`. Defeat: revert `ai_tool_warn_confirm.go:108`.
8. **`node ci/lib/vendored-engine-parity.mjs` covers 3 files × 2 locations = 6 comparisons and reports
   `PASS`**, registered under `ci/gates.json` `workspaceChecks`, with the three digests recorded in this
   plan. Defeat: the one-byte upstream mutation → exit 1 DRIFT; the removed checkout → exit 2 NOT
   CHECKED; and `vendored-digest.test.ts` stays green through both, which is the proof the new check was
   needed. **The `pull_request:` trigger on `vendored-upstream-drift.yml` is NOT this wave's criterion —
   it is Wave −1 Task 5's criterion 7**, and it is blocked there on an owner decision about GitHub
   Actions spend and on `secrets.INSTALLERS_READ_TOKEN`.
9. **9 manifest objects rendered, 0 numbers without a `data-manifest-field` source, 0 denominators
   without a source under `absent-data`.** Defeat: add `?? 0` to the formatter; both the jest case and
   the harness `--forbid` run go red.
10. **The lane accounting identity holds** — the three lane detector counts plus the residual equal the
    total membership of every non-`modeOnly` category — over **3** fixtures, with the total printed by
    the test; **1** residual statement on a folded board and **0** on a uniform one; **0** lines changed
    in `category-bucket-board.test.tsx`; **0** `[data-bucket]` columns added. Defeat: print the residual
    unconditionally; and separately, revert to counting every member in its category's lane, which
    re-opens T-U8 and goes red at `category-bucket-board.test.tsx:273-274`.
11. **Deploy order:** nothing in this wave widens a contract, so no Backend-before-Frontend constraint
    applies. Task 7 and Task 8 need an **agent release**; both are endpoint-local and neither changes
    floor membership, so no Backend deploy is required by them. **Deploying still needs a fresh explicit
    owner ask (O-19), and the deploy gates are fail-closed on MISSING runs — dispatch `pr-checks` and
    `security` on `main` FIRST or the deploy refuses.**

### What this wave does **not** move, and must not be reported as moving

- **No risk lane moves.** R1-R5 stay exactly where §5.4 puts them. This wave delivers one *dimension*
  and that dimension is `UNKNOWN` until Wave 8 issues an expiring manifest for it (criterion 9 is
  blocked, and says so).
- **The harness is not a Backend test.** Quote its own README wherever its output is cited.
- **"The console's detection engine is byte-identical to the shipped endpoint engine"** remains
  claimable **with the caveat that upstream drift is guarded by a workspace check and a daily poll, not
  by a per-PR gate**, until **Wave −1 Task 5** lands the `pull_request:` trigger.
- **The lane headers still do not sum to the catalogue**, and that stays deliberate. Task 11 discloses
  the residual; it does not fold it into a lane. Reporting "the board now counts every detector" would
  be the T-U8 defect described as a feature.
- **No false-positive claim of any kind.** Rendering a rate honestly is not measuring one. Every rate on
  these surfaces is `UNKNOWN` until Wave 3 repairs the instrument (D18) and Wave 3B supplies a
  denominator.

---
---

# Wave 6 — Turn a measured rate into a governed label, and make every triage control do what it says

**Depends on:** **Wave 3B Task 12**, which commits the production-triage → corpus-governance mapping
table. That wave *defines* the mapping and explicitly defers the widening and the row migration to here,
because the migration touches live tenant rows. Wave 5 for the surfaces this wave adds controls to.
Wave 3 (D18) for anything that cites a number: no promotion in this wave may quote a rate produced by
the unrepaired instrument. Independent of Waves 1, 4A/4B/4C.
**Implements decisions:** D6 (nothing the analyst sees may be inert; the four objects stay four), D18
(the instruments are repaired before measuring), D17.
**Certificate impact:** the measured production FP rate stays a **SIGNAL**, never a certificate input,
until this wave lands the second reviewer and the adjudication record on the row. §7's forbidden list
carries this verbatim — *"Do not treat the measured production FP rate as a certified quality label. A
single reviewer can set it and `benign_expected` conflates two different verdicts."* Wave 8's
`downgradeTriggers` has no governed input until this wave passes.

---

## What this wave CLAIMS, and where the seams are

Gap **G-2** in the reconciliation: Wave 6 did not exist, **Wave 8 lists it as a dependency, and Wave 8
Task 8 cannot pass without it.** Each deferral is claimed here by task number.

| Deferred by | What was deferred | Lands as |
|---|---|---|
| Wave 3B Task 12 | *"This wave defines it; **Wave 6 performs the widening and the row migration.**"* — the 4 → 7 triage vocabulary and the live-row migration | **Task 8** |
| Wave 8 Task 8 | *"one adjudicated false hard block (**Wave 6's adjudication record**, not a single reviewer's label)"* for `TestConfirmedBenignBlockHaltsTheRing` | **Task 9** |
| Wave 8's dependency line | *"Wave 6 (adjudicated triage feeding `downgradeTriggers`)"* | **Tasks 9 + 12** |
| Wave 3B Task 12 / §7 | The production FP rate is not citable as a quality label until this wave lands | **Tasks 9, 10, 11** |
| Source material §4 Wave 6 | detector/class/version/policy attribution; reviewer agreement; a provenance-carrying promotion path; appeal / suppression / exception expiry with label-poisoning controls; *no threshold is ever updated online from untrusted user feedback* | **Tasks 10, 11** |
| Source material §4 Wave 6 (G-3) | *"Inventory the autonomous FP-review agent that landed in Ceragon-Intelligence"* — **zero mentions across the other 8,510 lines** | **Task 13** |

**The one seam that has two owners, stated so the halves meet.** `FALSE_POSITIVE_STORM` is picked up by
**both** Wave 8 Task 8 (*"Wire `FALSE_POSITIVE_STORM`… to a change-point monitor over Wave 6's
adjudicated rate. Declare the threshold numerically in the service"*) and **Task 12 below**. They are
not the same work and neither is redundant:

- **Task 12 (this wave) owns the monitor and its input.** The declared threshold and its arithmetic, the
  minimum-denominator refusal, the read off `getMeasuredFpRates`, and the filing of a rollback intent.
  It cannot be built before Tasks 9 and 10, because an ungoverned single-reviewer rate is not an input a
  monitor may act on.
- **Wave 8 Task 8 owns the consequence.** The halt conditions, `cohortBasisPoints` 500 → 2500 → 10000,
  and the manifest `downgradeTriggers` entry the monitor's output becomes.
- **Ordering: Task 12 before Wave 8 Task 8**, and both must name the same service
  (`ai-policy-rollback-storm.service.ts`), the same constant, and the same number. Two thresholds for one
  reason code is the two-vocabularies defect in its purest form.

---

## Context an engineer needs

### The pipeline exists. W11 in the source material says so, and it is right.

The review's P1-03 — *"production feedback is not a governed quality label"* — was **too absolute, and
was so on the review date.** A per-class production FP rate with a real denominator shipped
**2026-08-06** in `f7d39870`, seventeen days before the review. Verified on `origin/main` 2026-08-28:

- `Backend/src/ai-security-policy/ai-security-policy.service.ts:712` —
  `const MEASURED_FP_WINDOW_DAYS = 7;`
- `:720` — `const MEASURED_FP_VERDICTS = ['true_positive', 'benign_expected', 'false_positive'] as const;`
  with a docblock stating `not_set` is *"the absence of a verdict"* and is deliberately excluded.
- `:722-728` — the rule this whole plan keeps quoting: *"An ABSENT key means NOT MEASURED and must
  render as such — it is never the same statement as `fpRate: 0`, which means measured and found clean."*
- `getMeasuredFpRates` at **`:3217`**, with `RULE 7` written out at `:3211-3215`, per-event-per-class
  dedup at `:3249-3255` (*"One event contributes AT MOST ONCE per class"*), and a belt-and-braces drop
  of any zero-denominator bucket at `:3268-3271`.
- The console renders it honestly: `components/admin/policy/action-bucket-board.tsx:321-341` puts
  `ABSENT` in the value position and always prints the denominator, and `:334` says in the tooltip
  *"This is not a measured rate of zero."*

**Do not rebuild any of that.** The gap is the label, not the arithmetic.

### The five things that are actually missing, each verified

**1. The taxonomy is four values wide.**
`Backend/packages/shared-contracts/src/ai-governance-contract.ts:183-189`:

```ts
export const AI_EVENT_TRIAGE_CLASSIFICATIONS = [
  'not_set',
  'true_positive',
  'benign_expected',
  'false_positive',
] as const;
```

`benign_expected` conflates *"the policy is too strict"* with *"this was an authorized action"* — two
different verdicts with two different fixes. There is no *incorrect-explanation* value (the detection
was right, the reason text was wrong) and no *duplicate* value. And `not_set` is a **column default**
(`src/entities/ai-event-triage.entity.ts:52`), not a reviewed judgement, so "nobody looked" and "a
reviewer looked and could not decide" are the same token.

**2. There is no second reviewer or adjudicator on the row.** Verified field by field —
`src/entities/ai-event-triage.entity.ts` carries `eventId`, `orgId`, `status`, `classification`,
`resolutionReason`, `assigneeId`, `hidden`, `secondsToTriaged`, `secondsToResolved`, `createdAt`,
`updatedAt`. **`assigneeId` is who the work is assigned to, not who judged it.** And
`ai-event-triage.service.ts:204` is `row.classification = nextClassification;` — a second reviewer
disagreeing simply overwrites the first, silently.

**3. But the reviewer identity already exists, one table over — which makes this much cheaper than it
looks.** `src/entities/ai-event-triage-transition.entity.ts` is an append-only ledger carrying
`sequence` (unique per event, `:41`), `fromStatus`/`toStatus`, `fromClassification`/`toClassification`,
`resolutionReason`, `assigneeId`, `hidden`, **`actorType` (`:81`) and `actorId` (`:85`)**, and `note`
(`:93`). `AiEventTriageService.update` is row-locked and appends a transition on every change
(`:230-231, 253-254`). **Who set each label is already recorded.** The work is to derive the labeler set
from the ledger and add adjudication state to the row — not to invent an actor concept.

**4. The rate is attributable to a class, never to a version.** `getMeasuredFpRates` keys purely off
`finding.class` (`:3255-3258`). There is no detector version, no ruleset digest, no policy digest, no
engine version. So a rule that was fixed on Tuesday and a rule that was not share one number, and the
number cannot tell you which build produced it. That is the same defect §5.3 fixes on the evaluation
side with `rulesetDigest` / `engineVersion` / `normalizerVersion` / `parserVersion`.

**5. `FALSE_POSITIVE_STORM` is a string in a list.**
`Backend/src/ai-policy-delivery/ai-policy-rollback.service.ts:11` — **note the directory**; the source
material's citation of `ai-security-policy/` is wrong, `git grep -ln FALSE_POSITIVE_STORM origin/main --
src` returns exactly one file and it is under `src/ai-policy-delivery/`. It is a member of
`AI_POLICY_ROLLBACK_REASON_CODES`, a closed vocabulary an **operator selects by hand** when filing a
rollback intent. Nothing computes it. There is no change-point monitor, no threshold, and no automatic
trigger anywhere.

### What the console still gets wrong, verified on `origin/main` 2026-08-28

The old plan's W6 premises all still hold. Line numbers re-measured:

1. **At-rest rows error on open and can never be triaged.** `types/ai-context.ts:736` mints
   `` id: `aic:${finding.id}` ``. `detections-content.tsx:3291` GETs
   `/api/ai-control-plane/events/${encodeURIComponent(selected.id)}/triage` for every opened row; that
   proxy rejects a non-UUID with 400 `Invalid event id`, and the catch renders red `role="alert"` text
   inside the drawer **before the analyst touches anything**. The lane that does exist is
   `POST /api/ai-context/findings/:id/state` (`Backend/src/ai-context/ai-context.controller.ts`, states
   `new | investigating | resolved | dismissed`). Nothing needs building; the drawer posts to the wrong
   lane.
2. **Three permanently `disabled` bulk buttons, with a title that explains our endpoint's shape to the
   customer.** `detections-content.tsx:4412-4418`:
   `title="Bulk triage is not wired: the triage endpoint acts on one event, and a selected group can
   hold hundreds. Open a signal to triage it."` A full selection model feeds them (`selectedIds`,
   `toggleRowSelection`, select-all header checkbox, per-row checkbox, an `A` shortcut, a blast-radius
   sentence). **`git grep -ln "bulk-triage\|bulkTriage" origin/main -- src` in Backend returns nothing**
   — the endpoint genuinely does not exist. But every piece does: `AiEventTriageService.update` (row-
   locked, ledger-appending) and `AiQueryService.buildDetectionsQuery`, which owns the one detection
   predicate.
3. **Assignee is accepted and never sent.** `update-ai-event-triage.dto.ts` declares optional `note`
   and `assigneeId`; the console sends `note` only inside the resolve payload
   (`detections-content.tsx:3334` reads `detail.triage.assigneeId` but never writes one). A deliberate
   guard blocks the picker: `app/ai-control-plane/detections/absent-facets.ts:70` records the reason as
   *"no display name is served anywhere in the read contract, and no user-list endpoint is wired to this
   surface"*, and `__tests__/absent-facets.test.tsx:59` fails CI on
   `/assigneeOptions|assigneeName|assignee_name|setAssignee|assigneePicker/i`. **Half that reason is
   stale** — `GET /api/v1/users` is `@AuthMember()`, the same role gate as triage, and
   `app/api/users/route.ts` already proxies it. The display-name half is not stale and must be answered,
   not deleted.
4. **No pivots, and the triggering command is never in the drawer.** `row.metadata.commandShape` exists
   and this screen already reads it for the list's asset line (`detections-content.tsx:894`); the drawer
   does not render it. The house rule to honour is
   `app/ai-control-plane/ai-sessions/[id]/investigation-links.ts:11`: **"A PIVOT THAT SILENTLY DROPS ITS
   FILTER IS WORSE THAN AN ABSENT ONE."**
5. **`scope` is an inert prop.** `DetectionsContent` declares `{ scope }: { scope?: AiStreamScope }` at
   `detections-content.tsx:2978` and never reads it. The Backend accepts `channel`
   (`ListAiDetectionsDto:200`, `channel?: string[]`) and forwards it, but the console proxy's
   `FORWARDED_PARAMS` (`app/api/ai-control-plane/detections/route.ts:16-39`) lists **13 params and
   `channel` is not among them**, so it is dropped before the Backend sees it. `app/web-ai/` exists with
   `page.tsx` and `activity/page.tsx` but **no `detections/page.tsx`**; `app/autonomous/` likewise.
6. **`?page=` is stripped.** `detections-content.tsx:3035` is `React.useState(0)` with no URL read, and
   the filter write-back replaces the whole query string with a serialisation that never emits `page`.
   `app/ai-control-plane/events/events-content.tsx` is the shipped pattern every other list follows.

### The fourth vocabulary, and why it must be left alone

Wave 3B Task 12 names three vocabularies for one question and tells you to leave the third
(`Installers/scripts/aicontext-gate/adjudication.go`) alone. Measured 2026-08-28 there is a **fourth**,
and it landed after the review: the autonomous FP-review agent in Ceragon-Intelligence
(`30d6c6d8..486d937b`). It carries `BUCKETS` (4, `store.js:50-55`), `STATUSES` (8, `:79-88`),
`CAMPAIGN_STATES` (7, `:91-93`) and `TERMINAL_STATES` (5, `:96-98`) in
`deploy/home/fp-agent/src/lib/store.js`, a 484-line file.

**Correcting the source material's own count:** it says *"73 of 80 files under `deploy/home`."*
Measured: `git diff --name-only 30d6c6d8..486d937b | wc -l` = **45**, and
`… | grep -c '^deploy/home'` = **45**. Forty-five of forty-five, +11,420 insertions across 20 commits.
Cite the measured number.

**And it is still moving.** Re-measured 2026-08-28: Ceragon-Intelligence `origin/main` is now
**`deb70e64`**, not the `486d937b` the spine's rebase manifest pins — **5 commits ahead, 36 files,
+12,372 insertions**, of which 31 are under `fp-agent/`. The range `30d6c6d8..origin/main` is 25
commits, 61 files, +24,323 lines: **the agent has more than doubled since the SHA this plan verified
against**, and the new commits add a *fix lane* and a *deploy probe*
(`fixlane.js`, `deploy.js`, `redispatch.js`, `watch.js`). Task 13 verifies against `486d937b`, states
that SHA in the inventory, and re-runs the range measurement at execution time. An inventory of a
moving pipeline that does not name the commit it inventoried is a snapshot pretending to be a fact.

It answers a **different question** — artifact and package **threat** detection quality, read from the
DynamoDB analysis cache — and it refuses the policy lane structurally rather than filtering it
(`store.js:72-76`: a `policy` bucket is *"the whole list"* of refused buckets, because *"a tenant
relaxing a CVE rule would read as the agent clearing false positives"*). It is not the AI-event triage
lane and **must not be merged into it.** Task 13 inventories it, states the boundary, and harvests three
of its design properties — which are better than anything this wave would invent:

- **No path where a missing judgement becomes a default judgement.** *"'no file' is not a verdict — and
  an unreadable or unknown-value verdict is refused rather than coerced into 'insufficient'."*
- **The judgement is an input to the gates, never a substitute for them.** A false-positive judgement
  does not open a PR; it moves the campaign to "run the gates", and a failing gate is terminal.
- **The two directions are not symmetric.** Loosening a rule has an evidence bar and a ratchet;
  tightening one has neither, so the tighten side is **propose-only**, enforced by the store refusing a
  `missed_tp` artifact carrying `status: fixed`. *"The agent must never widen a rule and re-bank the
  benign baseline in the same PR."*

### House constraints

Same as Wave 5, plus: Backend's global pipe is `AgentIngestValidationPipe` with
`whitelist: true, forbidNonWhitelisted: true` for every non-agent DTO. **A query param a DTO does not
declare 400s the whole request** — this is the defect class that has now hit the same DTO three times
(see the memory note on reading the agent log against prod). Any new triage field is a DTO change first.

---

## Task 1: At-rest findings get the triage lane they already have on the server

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx` (drawer triage panel; the
  triage-detail effect at `:3285-3303`; the mutation after `resolveDetection`; the drawer call site)
- `Frontend/app/ai-control-plane/detections/__tests__/detections-at-rest-triage.test.tsx` (create)

Preserve the old plan's task content (`plan:12457-12700`) — the premise is verbatim true on current
main and the test it specifies is good.

- [ ] **Step 1 (RED): the test asserts no request is made to the events proxy for an `aic:` row.** Not
  "the error is gone" — assert the **absence of the call**, because a swallowed 400 also removes the
  error and leaves the row untriageable.
- [ ] **Step 2: route the four at-rest states** (`new | investigating | resolved | dismissed`) to
  `POST /api/ai-context/findings/<uuid>/state`, stripping the `aic:` prefix at exactly one place.
- [ ] **Step 3: the at-rest lane states in one line what it does not record.** It has no
  classification, no assignee and no ledger, and a drawer that renders those controls disabled beside a
  lane that has them is the inert-control defect this wave exists to remove. State the difference; do
  not draw a dead control.

**Defeat test:** `detections-at-rest-triage.test.tsx` › "an at-rest row never reaches the events triage
proxy" — restore the unconditional GET at `:3291`. Expected failure text:
`expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/events/aic%3A"))` receiving 1 call.
**Exit:** **0** requests to `/api/ai-control-plane/events/aic%3A…` on any render; **4** at-rest states
POST to the findings lane; **0** errors rendered that the analyst did not cause, asserted on open.

---

## Task 2: The detections page number reaches the URL and survives a paste

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:3035`
- `Frontend/app/ai-control-plane/detections/use-detection-filters.ts` (the write-back effect)
- `Frontend/app/ai-control-plane/detections/__tests__/detections-page-url.test.tsx` (create)

`app/ai-control-plane/events/events-content.tsx` is the shipped pattern. Copy it; do not invent a second
pagination convention. This is also a house rule from an earlier wave: **new lists use the shared pager
and put the page in the URL.**

- [ ] **Step 1 (RED):** `?page=3` on `/coding-ai/detections` loads page 3; changing a filter resets to
  page 1 **and writes that reset to the URL**; `?class=`, `?severity=`, `?status=` still round-trip.
- [ ] **Step 2: read `page` on mount and emit it from the serialiser.** The write-back replaces the
  whole query string, so a `page` the serialiser does not emit is deleted on the next filter change —
  that is the actual mechanism, and a fix that only adds the read will appear to work and then lose the
  page.

**Defeat test:** `detections-page-url.test.tsx` › "a filter change writes the reset page to the URL" —
drop `page` from the serialiser. Expected failure text: `expected "?page=1&severity=high", received
"?severity=high"` and the second assertion showing the list still on offset 60.
**Exit:** **4** URL params round-trip (`page`, `class`, `severity`, `status`); `?page=3` loads offset
`3 × PAGE_SIZE`.

---

## Task 3: A note without resolving, and an assignee picker that names people

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx` (the triage panel)
- `Frontend/app/ai-control-plane/detections/absent-facets.ts:70` (the recorded reason is **edited**, not
  deleted)
- `Frontend/app/ai-control-plane/detections/__tests__/absent-facets.test.tsx:59` (the guard **stays**)
- `Frontend/app/api/users/route.ts` (already proxies `GET /api/v1/users` with `limit`/`offset`)
- `Frontend/app/ai-control-plane/detections/__tests__/detections-note-and-assign.test.tsx` (create)

`AiEventTriageService` explicitly permits a note-only body — `if (!changed && !note) throw new
BadRequestException('no triage change requested')` — so the note lane is a console gap, not a server one.

**Do not delete the `absent-facets` guard to make the picker land.** Its regex at
`absent-facets.test.tsx:59` exists to stop a label being built from an id, and that risk is real here:
`assigneeId` is a bare UUID. Edit the recorded reason to name what is now wired and keep the guard
pointed at the thing that is still true.

- [ ] **Step 1 (RED): three cases.** A standalone note posts `{"note": …}` alone and appears in the
  activity log **without changing status**; the picker lists people by name or email and **never** a
  UUID; an assignee absent from the roster keeps an option labelled as an id rather than silently reading
  as Unassigned.
- [ ] **Step 2: count out loud the users the console cannot name.** A roster page is a window like any
  other (Task 3 of Wave 5 is the same defect on the MCP queue). If the roster is truncated, say so.
- [ ] **Step 3: `@IsOptional()` also skips `null`**, and the service reads
  `dto.assigneeId !== undefined ? dto.assigneeId : …` — so `null` really clears. Assert clearing works;
  it is the case a picker usually forgets.

**Defeat test:** `detections-note-and-assign.test.tsx` › "the picker never renders a bare id as a name" —
fall back to `String(assigneeId)` for an unknown user. Expected failure text: the guard regex case in
`absent-facets.test.tsx` failing, plus
`expect(option).not.toHaveTextContent(/^[0-9a-f]{8}-/)` receiving a UUID.
**Exit:** a note-only POST returns 200 and changes `status` **0** times; **0** options render a bare
UUID as a display name; the `absent-facets` guard still fails on a label built from an id, proven by the
regex case staying green.

---

## Task 4 (Backend): Bulk triage over selected groups, reporting what it did not do

**Files:**
- `Backend/src/ai-governance/services/ai-event-bulk-triage.service.ts` (create)
- `Backend/src/ai-governance/controllers/ai-event-triage.controller.ts` (the new route)
- `Backend/src/ai-governance/dto/` (the bulk DTO)
- `Backend/src/ai-governance/services/ai-event-bulk-triage.service.spec.ts` (create)

Preserve the old plan's task content (`plan:12900-13400`). Its architectural constraint is the important
part and it is still correct: **the detection predicate must have exactly one definition.** The bulk
service delegates to `AiQueryService.buildDetectionsQuery` and to `AiEventTriageService.update`; it
writes no SQL of its own.

- [ ] **Step 1 (RED): the refusal case first.** A group expanding above the cap is refused outright, not
  truncated. A partial bulk action that reports success is worse than one that refuses.
- [ ] **Step 2: `@AuthMember` + `@ActAsReaderBlocked`**, same gates as the single-event route.
- [ ] **Step 3: one ledger row and one audit event per member.** It delegates to
  `AiEventTriageService.update`, which is unchanged — so the transition ledger keeps carrying `actorId`
  per member, which Task 9 depends on.
- [ ] **Step 4: the response reports `applied` / `unchanged` / `failed` as counts**, not a boolean.
- [ ] **Step 5: confirm the write-path list against `origin/main` before wiring.** Do not trust the
  2026-08-22 list; re-derive it.

**Defeat test:** `ai-event-bulk-triage.service.spec.ts` › "a group above the cap is refused, not
truncated" — replace the refusal with a slice. Expected failure text:
`expect(received).rejects.toThrow(BadRequestException)` receiving a resolved value with
`applied: 1000`.
**Second defeat test:** `git grep -n "FROM ai_events" -- src/ai-governance/services/ai-event-bulk-triage.service.ts`
must return **0** lines. Add a raw query and this criterion fails by inspection, so make it a lint-style
assertion in the spec rather than a review note.
**Exit:** **1** new endpoint, **0** raw `FROM ai_events` in the new service, **3** outcome counts on the
response, and a refusal above the cap asserted with a number.

---

## Task 5 (Frontend): The three bulk buttons do what they say, or say what they skipped

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:4412-4427`
- `Frontend/app/ai-control-plane/detections/__tests__/detections-bulk-actions.test.tsx` (create)

**Held until Task 4's Backend is deployed.** This is the Backend-before-Frontend rule in its ordinary
form: the console cannot POST to a route that is not there, and shipping the enabled buttons first turns
a disabled control into a failing one.

- [ ] **Step 1 (RED):** the three buttons are enabled whenever a non-at-rest row is selected, POST group
  **keys** (not ids — the group key resolves to full membership without the 50-id inline cap), and report
  applied / unchanged / failed **in events**, not in a toast that disappears.
- [ ] **Step 2: delete the customer-facing `title`.** `git grep -n "acts on one event" -- app/` must
  return nothing. No control on this screen explains our endpoint's shape to a customer.
- [ ] **Step 3: at-rest rows in the selection are named and skipped**, with the count stated. They have
  no classification lane; silently dropping them is the same defect as the filter note in Wave 5 Task 5.

**Defeat test:** `detections-bulk-actions.test.tsx` › "a mixed selection names what it skipped" — drop
the skipped count from the result sentence. Expected failure text:
`expect(element).toHaveTextContent(/2 at-rest rows were not changed/)` receiving `12 events updated`.
**Exit:** **3** buttons enabled on a valid selection; **0** hits for `"acts on one event"` under `app/`;
**3** outcome counts rendered; skipped at-rest rows named with a number.

---

## Task 6: The drawer names the rule, the endpoint, and the command that triggered the detection

**Files:**
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:894, 2451-2504` (the collapsed
  technical-details block)
- `Frontend/app/ai-control-plane/ai-sessions/[id]/investigation-links.ts:11` (the house rule)
- `Frontend/app/ai-control-plane/detections/__tests__/detections-pivots.test.tsx` (create)

Merges the old plan's W6 Tasks 6 and 7; they are one defect — the drawer holds identifying facts and
renders them as inert mono text.

- [ ] **Step 1 (RED): every pivot either navigates somewhere that honours its filter, or is absent with a
  stated reason.** The negative case is the one that matters: `detectionClassPivot` returns `null` for a
  headline derived from `severityBasis.class` or from the event type, because those are not filterable
  classes and a pivot that silently drops its filter is worse than an absent one.
- [ ] **Step 2: render `commandShape` for a row that can carry one**, the tool-input hash when it cannot,
  and **nothing at all** for a row that has no command. Three states, three renderings; the shipped
  pattern is `investigation-detail-pane.tsx`.
- [ ] **Step 3: the prompt reveal lane stays byte-identical.**
  `git diff origin/main -- app/ai-control-plane/prompt-preview.tsx app/ai-control-plane/prompt-evidence.tsx`
  must be empty. `commandShape` is OWNER/ORG_ADMIN-gated server-side via
  `AiReadScope.canViewEvidenceText`; that gate is not this task's to touch.

**Defeat test:** `detections-pivots.test.tsx` › "a headline derived from severityBasis has no class
pivot" — make `detectionClassPivot` return a link unconditionally. Expected failure text:
`expect(screen.queryByRole("link", { name: /view all/i })).toBeNull()` receiving an element.
**Exit:** **3** pivots present-and-honoured or absent-with-a-reason, enumerated by name; **3** command
render states asserted; the prompt-lane diff is **empty**.

---

## Task 7: Web AI and Autonomous get the same queue, through the prop that already exists

**Files:**
- `Frontend/app/web-ai/detections/page.tsx` (create — `app/web-ai/` exists; `detections/` does not)
- `Frontend/app/autonomous/detections/page.tsx` (create)
- `Frontend/app/api/ai-control-plane/detections/route.ts:16-39` (add `channel` to `FORWARDED_PARAMS`)
- `Frontend/app/ai-control-plane/detections/wired-facets.ts` (the Channel group stays refused on a
  scoped page — the page **is** the cut)
- `Frontend/app/web-ai/__tests__/scoped-pages.test.tsx` (extend — the file exists)

`DetectionsContent` has declared `{ scope }: { scope?: AiStreamScope }` at `:2978` since before the
review and has never read it. The Backend has accepted `channel` since before the review
(`ListAiDetectionsDto:200`). The only missing link is one entry in a 13-entry allowlist — and that
allowlist's own docblock explains why it is closed and why adding a UI filter means adding it there too.

**Held until the Backend carrying `ListAiDetectionsDto.channel` is deployed**, and prove it with a
`curl` returning 200 before merging the console half. The DTO is already on `origin/main`; whether the
deployed task definition carries it is a **deploy question, not a code question** — check the running
revision, do not assume.

- [ ] **Step 1 (RED):** `/web-ai/detections` and `/autonomous/detections` mount `DetectionsContent`,
  send `channel=web` / `channel=autonomous`, render **no** Channel facet, and state the cut in the rail.
- [ ] **Step 2: the unscoped `/coding-ai/detections` request is unchanged** — no `channel` param, Channel
  facet retained. That is the paired control; without it, a fix that always sends a channel passes.
- [ ] **Step 3: both routes appear in the sidebar.** A page nobody can navigate to is not shipped.

**Defeat test:** `scoped-pages.test.tsx` › "the unscoped detections request carries no channel" — send
`channel` unconditionally. Expected failure text:
`expect(url.searchParams.has("channel")).toBe(false)` receiving `true` on `/coding-ai/detections`.
**Exit:** **2** new routes; `FORWARDED_PARAMS` grows from **13 to 14** entries; the unscoped request is
byte-identical, asserted.

---

## Task 8: Widen the taxonomy from four to seven, migrate the rows, and keep the denominator honest

**Files:**
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts:183-190`
- `Backend/src/ai-governance/services/detections-absent-facets.spec.ts:202-207` (**the pin — update it,
  never delete it**)
- `Backend/src/ai-governance/dto/update-ai-event-triage.dto.ts`
- `Backend/src/entities/ai-event-triage.entity.ts:52`,
  `src/entities/ai-event-triage-transition.entity.ts:64-68`
- `Backend/src/migrations/` (one migration, forward-only)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:720` (`MEASURED_FP_VERDICTS`)
- `Frontend/types/ai-governance.ts` + the triage panel

**Wave 3B Task 12 commits the mapping table. This task executes it. Do not re-derive it** — a second
derivation is how the two vocabularies diverged in the first place. Reproduced here for the engineer's
convenience only:

| Today (4) | Target (7) | Corpus `governance` counterpart |
|---|---|---|
| `not_set` | `not_set` **and** `reviewed_unknown` | `adjudication.status: NOT_REQUIRED` vs `UNRESOLVED` |
| `true_positive` | `true_positive` | `labelers[].role: SECURITY_REVIEWER`, agreed |
| `benign_expected` | split → `policy_too_strict`, `authorized_action` | two distinct `adjudication.reasonCode` slugs |
| `false_positive` | `false_positive` | `correction.reasonCode` |
| *(absent)* | `incorrect_explanation` | `correction.reasonCode` |
| *(absent)* | `duplicate` | `correction.supersedesCaseDigest` |

**Two traps, both of which move a published number if you miss them.**

**Trap 1 — `MEASURED_FP_VERDICTS` is a separate list.**
`ai-security-policy.service.ts:720` names `['true_positive','benign_expected','false_positive']` as the
values that count as a measurement. **Splitting `benign_expected` without touching this line drops both
halves out of the denominator, and every measured FP rate in the product moves for a purely lexical
reason.** Assert the constant's membership by name in the same commit.

**Trap 2 — this is a `text` column with a default, in two tables.**
`ai_event_triage.classification` (`entity:52`, `default: 'not_set'`) and
`ai_event_triage_transition.from_classification` / `to_classification` (`entity:64-68`, nullable). The
ledger is history; **history must be migrated by mapping, never by rewriting a past judgement into a
value the reviewer never chose.** Every existing `benign_expected` row becomes exactly one of the two
new values or stays `benign_expected` as a retired-but-readable token — pick one, write the reason into
the migration, and record the mapping in the migration's own comment so the rate's discontinuity has a
documented cause.

- [ ] **Step 1 (RED): update the pin and watch it fail.** `detections-absent-facets.spec.ts:202-207`
  asserts exactly four values with `.toEqual`, and its comment says it exists *"so it cannot grow a
  fifth 'market' value either."* Change the tuple first; the spec goes red naming the three new values.
  **Keep `.toEqual`. Never relax it to `toContain`.** Extend the comment with the migration id and why
  the vocabulary grew.
- [ ] **Step 2: widen the tuple**, then let the compiler enumerate the consumers. `AiEventTriageClassification`
  is a derived union, so every exhaustive `switch` and every `Record<AiEventTriageClassification, …>`
  becomes an error until it handles seven. That is the gate working; fix each by construction.
- [ ] **Step 3: one forward-only migration**, mapping recorded in its comment.
- [ ] **Step 4: `MEASURED_FP_VERDICTS` in the same commit**, with an explicit membership assertion.
- [ ] **Step 5: the console renders seven values with plain-English labels.** `policy_too_strict` and
  `authorized_action` mean different things to the person who fixes them; if the labels do not make that
  obvious, the split has bought nothing. `check:no-em-dash` and `check:wire-vocabulary` run in
  `npm run lint`.
- [ ] **Step 6: `reviewed_unknown` is not a default.** The column default stays `not_set`. A reviewer
  choosing "I looked and cannot decide" is a judgement and must be reachable only from the UI.

**Defeat test:** `detections-absent-facets.spec.ts:202-207` — revert the pin to the four values.
Expected failure text: `expect(received).toEqual(expected)` with `policy_too_strict`,
`authorized_action`, `incorrect_explanation`, `duplicate`, `reviewed_unknown` shown as extra.
**Second defeat test:** a new `ai-security-policy.measured-fp-verdicts.spec.ts` — leave
`MEASURED_FP_VERDICTS` at the old three after the split. Expected: the denominator for a class whose
only triaged events are `policy_too_strict` drops to **0**, and the assertion fires with
`class "aws-access-key" left the denominator on a vocabulary change`.
**Exit:** `AI_EVENT_TRIAGE_CLASSIFICATIONS.length === 7`, pinned by `.toEqual`. **0** rows carry a
classification outside the seven after the migration, asserted by a count query in the migration spec.
**0** measured FP denominators change for a purely lexical reason, asserted by running
`getMeasuredFpRates` over a fixed fixture before and after.

---

## Task 9: A second reviewer and an adjudication record on the production row

**Files:**
- `Backend/src/entities/ai-event-triage.entity.ts` (new adjudication columns)
- `Backend/src/ai-governance/services/ai-event-triage.service.ts:119-260` (the update path; `:204` is
  the silent overwrite)
- `Backend/src/ai-governance/dto/update-ai-event-triage.dto.ts`
- `Backend/src/migrations/`
- `Backend/src/ai-governance/services/ai-event-triage-adjudication.spec.ts` (create)
- `Frontend` triage panel + `Frontend/types/ai-governance.ts`

**Mirror the corpus field names. Do not invent a second shape.** Wave 3B Task 12 fixes the vocabulary:
`adjudication.status` takes `NOT_REQUIRED | AGREED | THIRD_REVIEW | UNRESOLVED`, and roles take
`AUTHOR | SECURITY_REVIEWER | PRIVACY_REVIEWER | ADJUDICATOR`. One vocabulary, two storage locations.

**The cheap half is already built.** `ai_event_triage_transition` carries `actorType` (`:81`) and
`actorId` (`:85`) on every change, with a unique `sequence` per event. The labeler set is derivable
today; nothing needs a new actor concept.

- [ ] **Step 1 (RED): `TestConflictingLabelsEnterAdjudication`.** Two distinct `actorId`s set different
  classifications on the same event. Expected first run: the row shows the second reviewer's value and
  `ai-event-triage.service.ts:204` has silently overwritten the first — **last-write-wins**, which is
  the source material's named defeat test.
- [ ] **Step 2: derive the labeler set from the ledger**, distinct `actorId` over transitions that
  changed `to_classification`. Do not add a `labelers` column that can drift from the ledger that
  already knows.
- [ ] **Step 3: add `adjudicationStatus`, `adjudicatorIds`, `adjudicationReasonCode`, `decidedAt` to the
  row.** These are the *resolution* of a disagreement, which the ledger cannot express because a ledger
  records events and adjudication is a state.
- [ ] **Step 4: a conflict sets `THIRD_REVIEW` and does not overwrite.** The row keeps the disputed value
  visible and marked, because a row that silently shows one of two conflicting judgements is exactly the
  "console says X, endpoint does Y" shape this workspace keeps shipping.
- [ ] **Step 5: an adjudicator must be a distinct actor from both labelers.** Assert it. Self-adjudication
  is how a two-reviewer requirement becomes a one-reviewer requirement with extra steps.
- [ ] **Step 6: the console renders the state**, including who disagreed and that it is unresolved. An
  adjudication field nothing displays is the same defect as `floorRaised` going only to a `logger.warn`.
- [ ] **Step 7: the DTO first.** `forbidNonWhitelisted` 400s the whole request on an undeclared key, and
  this DTO family has taken that hit three times. Declare before you send.

**Defeat test:** `ai-event-triage-adjudication.spec.ts` › "conflicting labels enter adjudication" —
restore `row.classification = nextClassification` unconditionally. Expected failure text:
`expected adjudicationStatus "THIRD_REVIEW", received "NOT_REQUIRED"` with the row carrying the second
reviewer's value.
**Second defeat test:** › "an adjudicator is not one of the labelers" — allow the second labeler to
adjudicate. Expected: `adjudicatorId <uuid> is already a labeler on this event`.
**Exit:** **4** adjudication states reachable and asserted; **0** events where conflicting labels
resolved without an adjudication record, counted over the test corpus; adjudicator ∈ labelers in **0**
cases. Field names identical to `case.governance.adjudication.*` — asserted by
`TestTriageVocabularyMapsToCorpusGovernance` from Wave 3B Task 12, which must still pass after this
task, with **0** unmapped values in either direction.

---

## Task 10: Attribute the rate to a detector, a version and a policy, not just to a class

**Files:**
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:3217-3272` (`getMeasuredFpRates`)
- `Backend/src/ai-security-policy/ai-security-policy.service.ts:729-737` (`MeasuredFpRate`)
- `Backend/src/ai-governance/` (the event metadata the finding already carries)
- `Frontend/components/admin/policy/action-bucket-board.tsx:321-341`
- `Backend/src/ai-security-policy/ai-security-policy.measured-fp-attribution.spec.ts` (create)

`getMeasuredFpRates` keys the map off `finding.class` and nothing else — verified at `:3253-3258`, where
the bucket key is the class string and the only other axis stored is `windowDays`. So a class whose rule
was narrowed on Tuesday shares one number with the version that produced the false positives, and no
consumer can tell which build the rate describes. A rate that cannot name its producer cannot be
compared with an evaluation result, which is the entire point of measuring it.

**Do not invent the axis names here. Wave 3B owns the version-identity vocabulary** — reconciliation
C-3 and D-2 collapse two rival field sets into one union that Wave 3B Task 2 defines, and it is
`RunnerIdentity`'s required identity fields plus **`policyDigest`** on provenance. `policyDigest` is the
agreed name; `effectivePolicyDigest` was the losing spelling and must not reappear on the production
side. Use Wave 3B's names verbatim: the evaluation side and the production side are only comparable if
the two spell the same fact identically, and *"two field names for one fact"* is the defect these waves
exist to remove.

The four axes this task must be able to attribute a production rate to, in Wave 3B's spelling:
**detector class · `engineVersion` · `rulesetDigest` · `policyDigest`.** Which of them are reachable
today is a discovery question, answered in Step 2 — not a guess made here.

- [ ] **Step 1 (RED): `TestMeasuredRateCarriesItsProducingVersion`.** Two events of the same class with
  different `engineVersion` must produce two buckets, not one. Expected first run: one bucket with a
  combined denominator.
- [ ] **Step 2: check what the wire already carries before adding a field.** Discovery, to be run first:
  ```bash
  cd /c/Users/Owner/Documents/Ceragon/Backend
  git grep -n "engineVersion\|rulesetDigest\|policyDigest\|analyzerVersion\|agentVersion" \
    origin/main -- src/ai-governance/ src/entities/ | head -40
  ```
  Verified 2026-08-28 that this grep returns hits across `src/ai-governance/` (receipts, policy
  integrity, delegated approval) — so **some** of these names already exist somewhere in this repo. That
  is not the same as "the event carries one." Read the hits before concluding either way; do not take
  their existence as the answer.
  If the agent already stamps a version on the event, key off it. If not, that is an **agent contract
  change** and it inherits the Backend-before-agent ordering rule: the Backend accepts the new key
  before any release stamps it, or every session-start 400s fleet-wide on `forbidNonWhitelisted`. That
  failure has happened here three times on this DTO family.
- [ ] **Step 3: preserve the ABSENT-is-not-zero rule through the widening.** A bucket keyed by
  `(class, version)` has a smaller denominator than one keyed by class alone, so more buckets fall below
  the measurement floor and **more classes become correctly ABSENT.** That is the honest direction. Do
  not backfill an unknown version with a placeholder to keep the denominators looking healthy.
- [ ] **Step 4: the console shows which version a rate describes**, or says the version is unknown.
  `measuredFpRateText` already carries the denominator and the window; the version is the third thing a
  reader needs to know what the number is about.

**Defeat test:** `ai-security-policy.measured-fp-attribution.spec.ts` › "two versions do not share a
denominator" — revert the key to `class` alone. Expected failure text:
`expected 2 buckets for "aws-access-key", received 1 with triagedEvents: 80`.
**Second defeat test:** › "an unknown version is not a version" — backfill it with a constant. Expected:
`bucket for class %q carries engineVersion "unknown"; an unattributable rate is ABSENT, not attributed`.
This is the D18 rule (`engineVersion` **must not** be a placeholder) applied on the production side.
**Exit:** the rate map is keyed by **at least 2 axes** (class, producing version), and every axis it does
carry is spelled **exactly as Wave 3B Task 2 spells it** — asserted by name, so `policyDigest` cannot
come back as `effectivePolicyDigest`. Of the four target axes (class, `engineVersion`, `rulesetDigest`,
`policyDigest`), the number reachable without an agent contract change is **whatever Step 2 prints** —
record it, do not predict it. Classes correctly reporting ABSENT after the split: report the
**measured** number, not a target — it will rise, and the rise is the honest consequence.
**Blocked if the version is not already on the wire:** that half needs an agent release, which goes
**after** a Backend deploy, and this criterion is blocked on that ordering until it does.

---

## Task 11: Reviewer agreement, the promotion path into the protected corpus, and the label-poisoning controls

**Files:**
- `Backend/src/ai-governance/services/ai-event-triage-agreement.service.ts` (create)
- `Backend/src/ai-governance/services/ai-event-corpus-promotion.service.ts` (create)
- `Installers/parity-vectors/neutral/` (the destination corpus — Wave 3B owns its schema)
- `Backend/src/ai-governance/services/ai-event-corpus-promotion.spec.ts` (create)

Four deliverables the source material names and the current pipeline has none of.

- [ ] **Step 1: inter-rater reliability, with its denominator, or `null`.** Publish the number of
  doubly-labelled events, raw agreement, and a chance-corrected statistic. **Do not publish a reliability
  figure computed over fewer than the doubly-labelled count.** With zero doubly-labelled events on day
  one, the honest value is `null`, not `1.0` — the identical rule Wave 3B Task 11 applies on the corpus
  side, and it must read the same on both surfaces.
- [ ] **Step 2 (RED): the promotion path carries provenance or it does not run.** A triaged production
  event may become a corpus case only with its labelers, its adjudication record, its
  `provenance.{sourceDigest, trust, admittedAt, reviewerIds}` and an explicit `licenseId`. Corpus
  formatVersion 2 already models all of that (Wave 3B §W12) — populate it, do not extend it.
- [ ] **Step 3: appeal, suppression, and exception expiry.** An exception with no expiry is a permanent
  hole with a friendly name. Every suppression carries an expiry and a reason; expiry is enforced by a
  scheduled re-evaluation, not by a person remembering.
- [ ] **Step 4: label-poisoning controls, stated as rules the code enforces.**
  **No threshold is ever updated online from untrusted user feedback.** A promotion requires two distinct
  labelers plus, on conflict, an adjudicator. A single tenant cannot supply both labels on the same case.
  A promoted case is immutable once admitted; a correction is a new `caseVersion` with a
  `correction.reasonCode`, never an edit.
- [ ] **Step 5: no promotion cites a number from the unrepaired instrument.** D18. If Wave 3 has not
  landed, the promotion path may run and must **not** publish a rate. Assert it: the promotion record
  carries the `engineVersion` it was measured under, and a promotion stamped `"m4.7"` is refused.

**Defeat test:** `ai-event-corpus-promotion.spec.ts` › "a single-labeler event cannot be promoted" —
drop the labeler-count check. Expected failure text:
`promotion refused: event %q has 1 labeler; a protected-corpus case needs two distinct labels plus a tie-breaker`,
now absent while the promotion succeeds.
**Second defeat test:** › "an unrepaired-instrument measurement cannot be promoted" — stamp
`engineVersion: "m4.7"`. Expected: `refused: engineVersion "m4.7" is the D18 placeholder, not a build`.
**Exit:** promotions with fewer than **2** distinct labelers: **0**. Promotions with no `provenance`
block: **0**. Suppressions with no expiry: **0**. Inter-rater reliability published **with its
denominator or as `null`** — never a number without one. **Blocked, named:** Step 5's exit depends on
Wave 3 having landed `--engine-version`; until it does, this task's promotion path is built and the
publishing half is `UNKNOWN`.

---

## Task 12: Wire `FALSE_POSITIVE_STORM` to a declared threshold, or say it is operator-only

**Files:**
- `Backend/src/ai-policy-delivery/ai-policy-rollback.service.ts:9-16`
- `Backend/src/ai-policy-delivery/ai-policy-rollback-storm.service.ts` (create)
- `Backend/src/ai-policy-delivery/ai-policy-rollback-storm.spec.ts` (create)

**This task is one half of a seam, and Wave 8 Task 8 is the other.** Wave 8 also says it will wire
`FALSE_POSITIVE_STORM`. The split, restated here so an engineer in either wave finds the same sentence:
**this task owns the monitor and its input** — the declared threshold, the minimum-denominator refusal,
the read off `getMeasuredFpRates`, and the filing of an intent. **Wave 8 Task 8 owns the consequence** —
the ring halt, `cohortBasisPoints` 500 → 2500 → 10000, and the `downgradeTriggers` manifest entry. This
task lands **first**, and both waves name `ai-policy-rollback-storm.service.ts` and the same numeric
constant. If Wave 8 declares a second threshold, one of the two is wrong and neither is authoritative.

**Correct the citation first.** `FALSE_POSITIVE_STORM` lives at
`Backend/src/ai-policy-delivery/ai-policy-rollback.service.ts:11`, not under `src/ai-security-policy/`.
`git grep -ln FALSE_POSITIVE_STORM origin/main -- src` returns exactly one file. Verified on `origin/main`
2026-08-28: it is the second of five members of `AI_POLICY_ROLLBACK_REASON_CODES` (`:9-14`, with the
derived type at `:16`) — a closed vocabulary an operator picks from by hand when filing a rollback
intent. **Nothing computes it.**

The surrounding machinery is good and must not be rebuilt: the rollback intent is **forward-only** by
construction (*"nothing in this file can name, compute, or compare an endpoint bundle revision, so
nothing here can lower one"*), eligibility is re-checked at resolution, and an ACTIVE intent is part of
current authority so a fleet read does not immediately report every endpoint as disagreeing.

- [ ] **Step 1 (RED): declare the threshold as a constant with its arithmetic in the docblock, then
  assert it.** A change-point monitor with an undeclared threshold is a number somebody will tune until
  it stops firing. State: the window, the baseline, the magnitude of change, and the minimum denominator
  below which the monitor **must not fire at all**.
- [ ] **Step 2: the monitor reads the existing measured rate.** `getMeasuredFpRates` is the instrument;
  do not build a second one. Its `MEASURED_FP_WINDOW_DAYS = 7` is the natural baseline window.
- [ ] **Step 3: a zero or absent denominator can never trigger a rollback.** This is the same rule as
  everywhere else in this plan, and here it has teeth: an automatic rollback fired by a missing
  measurement would roll a fleet back for a reason that did not happen.
- [ ] **Step 4: filing is automatic; resolving is not.** The monitor files an intent with reason
  `FALSE_POSITIVE_STORM` and the evidence attached. **A human resolves it.** Per the intel FP agent's own
  design property, harvested in Task 13: the judgement is an input to the gates, never a substitute for
  them.
- [ ] **Step 5: if the owner decides the threshold is not yet knowable, say so in the code and stop.**
  A written decision that `FALSE_POSITIVE_STORM` stays operator-selected, with the reason and the date,
  is a legitimate outcome of this task and better than a fabricated threshold. What is **not** acceptable
  is leaving the string in a list with nothing behind it and no note saying so.

**Defeat test:** `ai-policy-rollback-storm.spec.ts` › "a zero denominator cannot file a storm" — remove
the minimum-denominator guard. Expected failure text:
`expect(intents).toHaveLength(0)` receiving 1, on a window in which the class had **0** triaged events.
**Second defeat test:** › "the monitor files, it does not resolve" — auto-resolve the intent. Expected:
`intent %q resolved with no actorUserId; a rollback is resolved by a human`.
**Exit:** either **1** declared threshold with its arithmetic written out and a monitor that cannot fire
on a zero denominator, **or 1** committed written decision that the reason code stays operator-selected,
naming the owner and the date. Not silence. **The seam is asserted, not assumed:** the constant this
task declares is the one Wave 8 Task 8 reads — **1** threshold constant exists repo-wide for this reason
code, asserted by `git grep -c` in the spec, so a second declaration in Wave 8 fails here rather than
diverging silently. **Blocked, named:** the monitor's input is Task 9's adjudicated rate and Task 10's
version axis; until both land, this task may declare the threshold and must **not** enable automatic
filing — a monitor over a single-reviewer rate would roll a fleet back on one person's label.

---

## Task 13: Inventory the autonomous FP-review agent, and state the lane boundary in writing

**Files:**
- `Ceragon-Intelligence/deploy/home/fp-agent/**` (READ ONLY)
- `Ceragon-Intelligence/deploy/home/intel-console/src/lib/campaigns.js` (READ ONLY)
- `.plans/m47a-20260822/v2-waves/artifacts/w6/fp-agent-boundary.md` (create — the inventory)
- `Backend/src/ai-governance/services/ai-event-triage.service.ts` (a pointer comment, nothing more)

**This task exists because the reconciliation found it in no other file.** Gap **G-3**: *"Zero mentions
across 8,510 lines. A second, undocumented triage pipeline running against production while Wave 6
designs a first one is exactly the two-vocabularies defect W11 names."* It needs a task, not a mention.

**Measured, correcting the source material.** The agent landed in `30d6c6d8..486d937b`: **20 commits,
45 files changed, all 45 under `deploy/home`, +11,420 insertions.** (The source material's "73 of 80
files" does not reproduce; cite 45 of 45.) It reviews the latest 300 analysed artifacts per source every
three hours, in two directions — false positives the detectors raised, and true positives they let
through.

**Re-run the range before you write the inventory.** As of 2026-08-28 the repo's `origin/main` is
`deb70e64`, **5 commits past the `486d937b` this plan verified against**: +12,372 insertions over 36
files, 31 of them under `fp-agent/`, adding a fix lane and a deploy probe. The inventory names the SHA
it inventoried and reports the drift as a number.

**It is a different lane and must stay one.** It reads the DynamoDB artifact analysis cache
(`cera-artifact_analysis_cache-staging` — the live table, per the workspace's own standing note) through
a projection that structurally cannot reach tenant policy: `assertProjectionIsThreatOnly()`
(`src/lib/intake.js:235`, called at `src/run.js:96` and `src/lib/aws.js:149`) fails the run if the
projection ever grows a forbidden attribute, and **`verdict` is deliberately omitted** because a stored
verdict can be policy-resolved. It derives its own threat band from `riskScore`. `store.js:72-76`
**refuses** an artifact bucketed `policy`, with the reason written out at `:66-67`: *"a tenant relaxing a
CVE rule would read as the agent clearing false positives, and a tenant tightening one as a new FP wave
to chase."*

Its vocabulary is a **fourth** one — `BUCKETS` (4, `store.js:50-55`), `STATUSES` (8, `:79-88`),
`CAMPAIGN_STATES` (7, `:91-93`), `TERMINAL_STATES` (5, `:96-98`). **Do not unify it**, for exactly the
reason Wave 3B gives for leaving `scripts/aicontext-gate/adjudication.go` alone: it answers a different
question, and unifying it would lose the property that makes it safe.

- [ ] **Step 1: write the inventory**, naming what the agent covers (artifact/package threat detection
  quality: `SOURCES` at `store.js:100` is `['packages','mcp','plugin','skill']`) and what it does **not**
  (AI runtime governance events — prompt, tool, DLP, ingress — which are this wave's lane and never enter
  its store). **The inventory carries the SHA it inventoried and the drift since**, both printed rather
  than typed:
  ```bash
  cd /c/Users/Owner/Documents/Ceragon/Ceragon-Intelligence && git fetch origin
  git rev-parse origin/main
  git rev-list --count 486d937b..origin/main
  git diff --shortstat 486d937b..origin/main
  ```
  A pipeline this wave does not own, running against production, growing every week, is exactly the
  thing an inventory dated by commit rather than by month is for.
- [ ] **Step 2: harvest three design properties into this wave's tasks and cite the source.** Each is
  already implemented there and each is stronger than the default this wave would otherwise take:
  - **No missing judgement becomes a default judgement.** `advance.js:33`: *"…default judgement, because
    'no file' is not a verdict."* An unreadable or unknown-value verdict is refused rather than coerced
    into `insufficient`. → Task 8 Step 6: `reviewed_unknown` is a choice a reviewer makes, never a
    column default.
  - **The judgement is an input to the gates, never a substitute.** `advance.js:271-272`, verbatim:
    *"judged a false positive, but the gates have not run - a judgement is an input to the gates, never
    a substitute for them"* — the campaign returns to `TRIAGED` with `action: 'run-gates'` (`:274`), and
    a gate that did not pass is `GATE_ABORTED`, `terminal: true` (`:259-266`). Note the precise shape:
    `PR_OPEN` **is** a campaign state, so the property is not "it never opens a PR" — it is that the
    judgement alone never advances past the gates. → Task 12 Step 4 and Task 11 Step 4.
  - **The two directions are not symmetric, and the asymmetry is enforced, not promised.**
    `PROPOSE_ONLY_BUCKETS` (`store.js:109`) is `['missed_tp']`, and `:418` refuses a `missed_tp`
    artifact claiming a landed fix. `README.md:98`: *"The agent must never widen a rule and re-bank the
    benign baseline in the same PR."* → Task 11 Step 4's promotion rules.
- [ ] **Step 3: add one pointer comment** in `ai-event-triage.service.ts` naming the agent, its lane, and
  why the two vocabularies are not merged — so the next reader does not "unify" them and lose the
  no-policy-bucket property.
- [ ] **Step 4: do not change one line of the agent.** It is deployed on Hetzner and is out of this
  packet's scope. If it needs work, that is its own ask.

**Defeat test:** this task ships a document and one comment, so its defeat test is a **linter, not a
unit test**: a check that fails if `AI_EVENT_TRIAGE_CLASSIFICATIONS` gains any member matching the
intel agent's `BUCKETS` or `STATUSES` vocabulary (`detection_fp`, `missed_tp`, `accepted_fp`,
`not_fixed_gate`, …). Expected failure text:
`triage classification %q is intel FP-agent vocabulary; the two lanes answer different questions — see fp-agent-boundary.md`.
Delete the boundary document and the linter's message loses its referent, which is itself detectable.
**Exit:** **1** committed inventory naming **4** vocabularies (production triage, corpus governance,
`aicontext-gate/adjudication.go`, intel fp-agent) and stating for each what question it answers, with
the **inventoried SHA** and the **measured drift from it** both printed by the commands in Step 1 rather
than written down. **3** design properties harvested, each citing the file and line it came from. **0**
values shared between the production triage taxonomy and the intel agent's buckets, enforced by the
linter. **0** lines of the agent changed.

---

## Wave 6 exit criteria

Each is a number or a named artifact, and each names the test that goes red on revert.

1. **`AI_EVENT_TRIAGE_CLASSIFICATIONS.length === 7`**, pinned with `.toEqual` at
   `detections-absent-facets.spec.ts:202-207` (baseline **4**), with **0** rows outside the seven after
   the migration. Defeat: revert the pin.
2. **0 measured FP denominators move for a purely lexical reason.** `MEASURED_FP_VERDICTS` membership
   asserted by name; `getMeasuredFpRates` run over a fixed fixture before and after the split produces
   identical denominators. Defeat: split `benign_expected` without touching
   `ai-security-policy.service.ts:720`.
3. **0 events where conflicting labels resolved without an adjudication record**, over the test corpus;
   **4** adjudication states reachable; adjudicator ∈ labelers in **0** cases. Defeat: restore
   `ai-event-triage.service.ts:204`'s unconditional overwrite — the source material's own defeat test,
   made executable.
4. **The two vocabularies stay converged: 0 unmapped production values and 0 unmapped corpus governance
   fields**, asserted by Wave 3B Task 12's `TestTriageVocabularyMapsToCorpusGovernance`, which must still
   pass after this wave's widening. Defeat: add an eighth production value with no counterpart.
5. **The measured FP rate is keyed by at least 2 axes (class, producing version).** Defeat: revert the
   key to class alone → two versions share a denominator. **Blocked** on the version reaching the wire if
   it is not there today; that half needs an agent release **after** a Backend deploy.
6. **Promotions with fewer than 2 distinct labelers: 0. Promotions with no `provenance` block: 0.
   Suppressions with no expiry: 0.** Inter-rater reliability published with its denominator or as
   `null`. Defeat: drop the labeler-count check.
7. **0 requests to `/api/ai-control-plane/events/aic%3A…`; 4 at-rest states POST to the findings lane;
   0 errors rendered that the analyst did not cause.** Defeat: restore the unconditional GET at
   `detections-content.tsx:3291`.
8. **3 bulk buttons enabled on a valid selection, POSTing group keys, reporting 3 outcome counts; 0 hits
   for `"acts on one event"` under `app/`; 0 raw `FROM ai_events` in the bulk service.** Defeat: replace
   the above-cap refusal with a truncation.
9. **2 new scoped detections routes; `FORWARDED_PARAMS` 13 → 14; the unscoped request byte-identical.**
   Defeat: send `channel` unconditionally.
10. **4 URL params round-trip on the detections list**; **3** pivots present-and-honoured or
    absent-with-a-reason; **3** command render states; the prompt-lane diff **empty**. Defeat: make
    `detectionClassPivot` return a link unconditionally.
11. **1 declared storm threshold with its arithmetic, or 1 committed written decision that the reason
    code stays operator-selected.** A monitor that can fire on a zero denominator fails. **Exactly 1
    threshold constant exists repo-wide for this reason code**, asserted by `git grep -c` in the spec —
    the seam with Wave 8 Task 8, which owns the halt and the `downgradeTriggers` entry the monitor's
    output becomes and must not declare a second number. Defeat: remove the minimum-denominator guard;
    separately, add a rival constant in the halt service and this criterion fails here.
12. **1 committed lane-boundary inventory naming 4 vocabularies, carrying the SHA it inventoried and the
    measured drift from it; 0 values shared between the production taxonomy and the intel FP agent's
    buckets; 0 lines of that agent changed.** Defeat: the vocabulary linter.
13. **Deploy order held and evidenced.** Task 4's Backend deploys **before** Task 5's console. Task 7's
    console waits on a deployed `ListAiDetectionsDto.channel` — check the running task definition, do not
    assume `origin/main` is deployed. Task 10's version axis, if it needs an agent stamp, deploys the
    Backend first or `forbidNonWhitelisted` 400s every session start fleet-wide. Task 8's tuple widening
    is a **Backend-before-Frontend** change on the policy write path, not a Backend-before-agent one
    (reconciliation C-6 corrects the imprecise form). **Deploying needs a fresh explicit owner ask every
    time (O-19), and the deploy gates are fail-closed on MISSING runs — dispatch `pr-checks` and
    `security` on `main` FIRST.**

### What this wave does **not** move, and must not be reported as moving

- **The production FP rate is a SIGNAL until every part of criteria 3 and 6 passes with its defeat test
  demonstrated**, not merely written. §7's forbidden list stands until then, verbatim: *"Do not treat the
  measured production FP rate as a certified quality label."*
- **What would make it certificate-grade**, stated so the bar is not renegotiated later: (a) two distinct
  labelers on every enforcing-stratum event, with an adjudicator who is neither of them; (b) published
  inter-rater reliability carrying its own denominator; (c) the rate attributed to a build, not just a
  class; (d) a denominator produced by an instrument Wave 3 has repaired — D18 forbids citing anything
  else; (e) a promotion path whose provenance survives into the corpus. Four of the five are this wave.
  **The fifth is Wave 3 and cannot be bought here.**
- **No risk lane moves.** R1-R5 stay where §5.4 puts them.
- **No threshold is ever updated online from untrusted user feedback**, and no claim in this wave rests
  on a number the unrepaired instrument produced.
