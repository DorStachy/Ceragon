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

# Wave 8 - Replace roll-up health with coverage truth

**Scorecard rows this moves:** Enterprise prevention readiness 4.0 -> **capped**, not 9.3. This wave builds the honesty machinery the row needs, but the row's "production proof" clause requires convergence against the production authority chain, and per RECONCILIATION §6 **no wave in the programme owns that**. Every live-proof artefact in all eight waves is a local-rig measurement. This wave's exit criteria are all local-rig or unit-level; do not report the row as closed on the strength of them.

**Overall technological architecture 8.5 -> 9.5 is NOT owned by this wave.** It is a **programme-level gate, owned by no single wave** — the sum of all eight. RECONCILIATION §6 lists it under "Rows no wave moves". An earlier revision of this header claimed it, and that claim is withdrawn here. No task below carries an exit criterion for it and none should be invented.

**Depends on:** nothing for Tasks 1-4, 7 and 11. Task 8 depends on Task 5 landing and being DEPLOYED first (see its ordering note). Task 6 depends on Task 1 (vocabulary) and reads Task 5's persisted field. Task 9 depends on Task 6 (it is a declared strict subset of it — see D5 in Task 9). Task 10 depends on Tasks 6, 7 and 8. Task 11's gates must run RED before Task 10 and GREEN after.

**Phase:** 5 (fleet coverage dashboard and operational alerts) for Tasks 2-5 and 7-11, with **Task 1 in Phase 0** (vocabulary freeze) and **Task 6 in Phase 3** (it satisfies the Phase 3 gate: "`Prevention Active` is impossible without a recent E3 canary and a valid capability certificate"). This matches RECONCILIATION §6's phase map exactly.

**Programme-level ordering this wave owns:**

- **Task 5 must be the FIRST Backend change in the entire programme** — ahead of W1 T8, W4 T12 and this wave's own Task 8. RECONCILIATION §3 states this as the rule no wave stated but three waves depend on. Until Task 5 lands, an agent-ahead-of-Backend ordering mistake on any of those three produces **no error, no data, and a console that looks correct**.
- **Task 6 must land FIRST of the three tasks that turn dashboards red** — ahead of W5 T4 (`observed` -> `loaded` fleet-wide) and W4 T8 (Codex `managed` -> `cooperative` for most of the fleet). RECONCILIATION §4 R7. Task 6 is the one that **explains** the other two: it is the task that publishes the reason list, so a dashboard that goes red after Task 6 says *why*, and a dashboard that goes red before it just goes red and gets a rollback request for a plan working as designed. Land Task 6, ship a release note, then W5 T4, then W4 T8 — separate releases, a note each.
- **Task 3 owns `AITransportObservationResponse` / `AITransportObservationEntry` and `routeStatusLabel`.** RECONCILIATION §2 D4: W3 Task 5 also touches that struct and the `AlertObserver` seam at `ai_handlers.go:2360`. **Task 3 defines the struct shape; W3 T5 appends `directEgress` to it afterwards.** Do not let both land independently — the code's own comment at that seam reads "a second counter would be a second truth", and two waves were each adding one.
- **W3's claimed "Backend deployed before agent release" rule for `/v1/ai/transport-observation` was struck** (RECONCILIATION §1 C3). That route is a token-gated loopback handler on the daemon (`Installers/internal/daemon/ai_transport_observation.go:75`), not a Backend route. This wave's negative finding — grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns nothing — is what settled it. Task 3 carries **no** deploy-ordering constraint.

---

## How an agent executes this wave

You will be handed **one task**. You will not see the rest of this document. Everything you need is inside your task block. Follow it literally, and stop when it tells you to stop.

**Work in a git worktree under `C:/cwt/`.** One worktree per task, branched from the verified `origin/main` SHA your task's PRECONDITIONS pin:

```bash
git -C /c/Users/Owner/Documents/Ceragon/<Repo> fetch origin
git -C /c/Users/Owner/Documents/Ceragon/<Repo> worktree add /c/cwt/w8-t<N> -b w8/t<N>-<slug> origin/main
cd /c/cwt/w8-t<N>
```

**NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared across every worktree in a repository. A `git stash pop` in your worktree steals and destroys a concurrent session's uncommitted work. This has happened twice in one day here. If you need a clean tree, commit to your own branch — that is what the branch is for.

**Commit each task immediately, never batch.** A crash and three separate API outages hit one campaign in this workspace; only committed work survived. Commit after each RED->GREEN step, not at the end.

**`git add` explicit paths, never `-A`.** This workspace has untracked scratch directories, `.patch` files and evidence trees at every level. `git add -A` sweeps them into your commit.

```bash
git add cmd/devoid/ai_codex_lanes.go cmd/devoid/ai_codex_undecided_verdict_test.go   # yes
git add -A                                                                            # NEVER
```

**The five inert-test shapes. A test you cannot make RED has not run.** Every task below gives you a DEFEAT TEST: a mutation, a command, and the exact string that must appear. Run it. If the mutation does not turn the test red with that string, your test is inert and the task is not done. The five shapes that have shipped green here:

1. **The skipped suite** — a `describe.skip` or a guard clause that returns early, so no assertion executes. (`shared-contracts-mirror.dev.spec.ts:69` is one, live on `origin/main` today.)
2. **The unwired DI** — the test constructs its own object graph, so the production wiring it claims to cover is never exercised.
3. **The assertion on a mock** — the test asserts the stub returned what the stub was told to return.
4. **The tautological compare** — both sides of the assertion are computed by the same code path, so a bug moves both.
5. **The unreachable branch** — the assertion sits behind a condition the fixture never satisfies, so it passes by never running.

**If a PRECONDITION fails, STOP AND REPORT.** Do not improvise a substitute path, file, symbol or command. This codebase has a documented history of agents inventing plausible replacements — an invented vendor key, an invented file path, a hand-written "equivalent" of a frozen list — and every one of them shipped green. A failed precondition means the world moved and the task needs a human, not a workaround.

**Never weaken an existing guard to make a task fit.** If a guard, a pinning test or a lint fence blocks your task, **the task is wrong**. Report it. Do not edit the guard, do not add an allowlist entry to silence it, do not delete the test.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## Reading note on line numbers

Every checkout in this workspace is far behind its remote (`Installers` local HEAD is **1010 commits behind** `origin/main` `5b129523`; Backend 773 behind `0cf9021e`; Frontend 525 behind `cac574ae`). **Every file:line below was read from the `origin/main` blob, not the working tree.** Reproduce any of them with:

```bash
cd <repo> && git fetch origin && git show origin/main:<path> | sed -n '<from>,<to>p'
```

Do not `git checkout` or `git stash` to see them — `refs/stash` is shared across every worktree in this workspace.

Line numbers drift. Every citation below is a **claim about `origin/main` at the SHA in your task's PRECONDITIONS**. If a `sed -n` does not show what the citation says it shows, your PRECONDITION has failed: stop and report, do not go hunting for the symbol at a different line and proceed.

---

## What exists today

### The coverage record the strategy asks for is 80% built, and the missing 20% is nameable

Workstream 11 asks for one coverage record per `endpoint + user/session + runtime + exact binary + host + OS + route + auth mode`. **Seven of those eight dimensions already exist on the wire and in the store.**

`RuntimeBindingShape` (`Backend/src/ai-governance/runtime-adapter-shape.ts:74-114`) carries `runtime`, `host`, `platform` (OS), `runtimeVersion`, `cliVersion` (client build), `executionHost`, `providerRoute` (route), `wireApi` (transport), `authMode`, `configRoot`, `baseUrl`, **`executablePathHash`** (`:97`, "SHA-256 of the runtime executable path" — the exact-binary dimension) and **`principalHash`** (`:112`, "Platform-neutral principal hash (Windows SID / Linux ns-qualified UID)" — the user dimension). `principalHash` and `launchOrigin` participate in the canonical `runtimeInstanceId`; the mutable dims deliberately do not, so a re-route shows as drift on the same instance rather than a new row.

`RUNTIME_SURFACE_CERTIFICATE_DIMENSIONS` (`Backend/src/ai-governance/services/runtime-adapter-render.util.ts:101`) freezes seven of these as the dimensions a surface certificate must name, and `pickRuntimeSurfaceCertificateDims` (`:146-152`) re-projects them at every serialisation site so an eighth dimension is a compile error at each consumer.

**The one genuinely absent key dimension is SESSION.** Nothing in the binding or the report identifies a session.

> **OWNERSHIP — the session dimension is OWNED BY WAVE 1 TASK 12.** *"The session dimension — produce it, and keep it out of the identity key."* An earlier revision of this file called it unowned and offered a `grep -ci "session"` over Wave 1 as proof, on the strength of that command returning 0. **It now returns 46.** RECONCILIATION §6's phase-map row is stale with it, and so was this paragraph until 2026-08-28.
>
> Verify rather than trust either statement:
> ```bash
> grep -n '^## Task 12' /c/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/waves/w1_decision_core.md
> #   expect: 2110:## Task 12: The session dimension — produce it, and keep it out of the identity key
> ```
> **This wave's Task 6 does not change either way**: it emits `session-dimension-unavailable` until the binding actually carries a session dimension, whoever adds it. A wave *owning* a task is not the same fact as the dimension *existing*, and Task 6 keys off the second.
>
> **This is one of the two reasons `PREVENTION_ACTIVE` is unreachable on every real endpoint.** Task 6's reasoning is intact and must stay intact: it is blocked on **WFP direct-egress denial (Wave 3 Task 6)** *and* **the session dimension (unowned)**, and **reading zero everywhere is the correct output of this wave today**, not a shortfall in it.

### `GET /api/v1/ai/protection-depth` is already a per-endpoint, per-instance coverage read

`AiQueryService.getProtectionDepth` (`Backend/src/ai-governance/services/ai-query.service.ts:5264`) reads `endpoint_control_state` (the rail the heartbeat writes), derives a render state per adapter/checkpoint/MCP row, batches the server's canary proofs by `runtimeInstanceId` (`loadCanaryProofs`, `:1380`), and returns `{ runtimes[], endpoints[], controlPlaneReadiness[], summary }` (`AiProtectionDepthResponseDto`, `Backend/src/ai-governance/dto/ai-response.dto.ts:1806`).

The honesty discipline in that file is already strong and **must not be weakened by anything in this wave**:

- `summary.states` is typed `Record<RuntimeAdapterRenderState, number>` so a ninth state is a compile error at every consumer, and `sum(states) === adaptersReported` is an asserted invariant (`ai-response.dto.ts` summary block; `ai-query.protection-depth-summary.spec.ts`).
- `summary.adapters` counts only stable-identity adapters; `legacyIdentityAdapters` (`ai-response.dto.ts:1842`) is reported and deliberately not counted as fleet, with `adapters + legacyIdentityAdapters === adaptersReported` asserted in place (`:1830`).
- `summary.adaptersTruncatedReported` (`:1864`) exists so a bounded attestation is distinguishable from complete coverage.
- `AiProtectionDepthAdapterIngestDto` (`ai-response.dto.ts:1708`) carries `discovered / stored / rejected / rejectedReasons`, and `null` means NOT MEASURED, deliberately not `0`.
- `projectInstanceIntegrity` (`ai-query.service.ts:1427-1496`) refuses to render `proven` without all three of a PROVEN outcome, a **server-held receipt hash** (`const serverHoldsReceipt = !!proof?.receiptHash`), and an unexpired expiry — a PROVEN outcome with no receipt reads `could-not-test`, never a pass.

### `active` is explicitly not derivable, and that is the hole `PREVENTION_ACTIVE` fills

`resolveRenderState` (`runtime-adapter-render.util.ts:760-825`) has **no `active` branch at all**, with the reason stated in place: everything reaching it is endpoint-authored, and the certificate is an unsigned block on the same heartbeat, so `certificateMatches` (`:739-758`) tests only the report's self-consistency. `NO_QUALIFYING_ENFORCEMENT_PROOF` (`:313`) is the full trace of every rejected candidate. So the render vocabulary's ceiling is `observed`.

**Grep confirms `PREVENTION_ACTIVE` / `preventionActive` / "Prevention Active" appears NOWHERE in Installers, Backend or Frontend `origin/main`.** It is genuinely absent. The composition rule the strategy names does not exist in any repo.

### Section 14's eight instances, re-verified against `origin/main`

| § | Claim | Verified state on `origin/main` |
|---|---|---|
| 14.1 | Unreadable daemon token -> unauthenticated 401 -> caller proceeds | Not this wave (Workstream 12). |
| 14.2 | Daemon is a scheduled task | Not this wave (Workstream 3). |
| **14.3** | `/health` unauthenticated, unconditionally 200, no governance posture | **CONFIRMED.** `healthLivenessKeys` is a closed five-key list (`Installers/internal/daemon/server.go:1318`), `handleHealth` (`:1359`) writes `StatusOK` for any GET, pinned by `TestHealthOpenBody_ExactlyLivenessKeys`. `install.ps1`'s `Get-DevoidDaemonHealthState` (`:2741`) reads only `daemon` and `version` off the body; `install.sh`'s `devoid_daemon_health_check` (`:171`) parses only `daemon` (`:174`) and `version` (`:175`). **Neither reads `wireProxy`** — an earlier revision of this file said they read three keys; they read two. `handleHealthDetail` (`:1388`) is token-gated and carries eleven independent posture blocks — **and no composed verdict over them.** |
| **14.4** | Claude half closed, Codex half open | **CONFIRMED, both halves.** Claude: `vendorDiscarded := printVendorHookFailOpenTo(os.Stdout, airuntime.ClaudeCodeAdapterID)` (`cmd/devoid/ai.go:460`), the two clauses are composed at `:470` (`ungovernedSuffix := undecidedVerdictTerm(rollup) + vendorDiscardTerm(vendorDiscarded)`), `undecidedVerdictTerm` is defined at `:713-725` and documented as "the clause the Claude verdict line carries in EVERY state" including a measured zero, `vendorDiscardTerm` at `:799-804`, and the `ungoverned` three-state gate gates the `[OK]`. Codex: `printUndecidableHookPayloads(codex.CodexAdapterID)` is a **bare statement** at `cmd/devoid/ai_codex_hooks.go:508` and `printVendorHookFailOpen()` at `:513` passes an empty adapter id (`ai.go:756`); neither result reaches `printCodexObservedAndVerdict` (`cmd/devoid/ai_codex_lanes.go:189-399`), whose `VerdictCompliant` branch prints `[devoid] [OK] Codex managed controls installed + compliant …` (`:310-312`) composed only from the fired/applicable count and the two lane-attestability flags (`:394-397`). |
| **14.5** | Route indicator counts decisions, not traffic | **CONFIRMED, and the label is the defect.** `recordTransportRouteDecision` (`internal/daemon/ai_transport_observation.go:60`) is called from the proxy alert observer (`internal/daemon/ai_handlers.go:2360`) and is correct. But `internal/proxy/ai_proxy.go:320-321` forwards every non-`POST`/non-scan-target request via `h.forward(w, r, nil)` — and `forward` (`:1283`) emits no alert at all. `isAIScanTarget` (`:1274`) is `/v1/messages` and `/v1/messages/count_tokens` only. The string that misleads is at `cmd/devoid/ai.go:591`: `"NEVER OBSERVED [!] (configured, but no request has ever travelled this route)"`. The live-proof register's `anthropic-transport-decision` entry (`internal/liveproof/register.json`, quarantine reason at `:25`) records a run where a request demonstrably travelled the route, was forwarded to Anthropic, **and this line still printed**. |
| 14.6 | Machine-secret ACL | Not this wave (Workstream 12). |
| **14.7** | Silent agent-wire field loss | **CONFIRMED, and there are THREE drop sites, only one of which is counted.** (1) `AgentIngestValidationPipe.recordDroppedKeys` (`Backend/src/common/pipes/agent-ingest-validation.pipe.ts:153`) counts pipe-level whitelist drops via `recordAgentWireDrift` (`src/common/pipes/agent-wire-drift.ts:237`), readable at `GET /api/v1/health/agent-wire-drift`, OWNER/ORG_ADMIN only (`src/health/controllers/health.controller.ts:218-223`). (2) **UNCOUNTED:** `droppedKeyPaths` (`agent-wire-drift.ts:180-226`) diffs pipe *input* against pipe *output*, and `EndpointControlsDto.runtimeAdapters` is deliberately `unknown[]` with no `@ValidateNested`/`@Type` (`src/health/types/heartbeat.types.ts:810`, documented at `:599-618` — the docblock states in terms that its decorators "NEVER EXECUTE") — so the whitelist never enters it and input === output there. The real gate is the service-layer rebuild `normalizeRuntimeAdapterReportOutcome` (`src/ai-governance/runtime-adapter-shape.ts:1221`), which returns `{ report, reasons: [] }` for a report whose *optional* fields were mistyped: `undecidable`, `certificate`, `attestedProfile`, `foreignGovernance`, `unreadableGovernanceTables`, `configHash`, `lastObservedAt` are each conditionally assigned and **silently omitted on a shape failure with no reason recorded and `rejectedCount` unchanged**. (3) **UNCOUNTED:** `normalizeControls` in `Backend/packages/shared-contracts/src/endpoint-controls-contract.ts` rebuilds the controls block field-by-field from a frozen allowlist and drops the rest — the agent source names this in place at `Installers/cmd/devoid/ai.go:652-660` as the reason the undecidable counter's *wire* half has not been attempted. Element-level rejection **is** counted (`normalizeRuntimeAdapters`, `runtime-adapter-shape.ts:1386`, with `over-ceiling` counted at `:1415`); field-level loss inside a surviving element is not. |
| 14.8 | Obligation receipt `Deny: func() error { return nil }` | Not this wave (Workstream 7). |

### The field-observation ledger never leaves the box

`internal/fieldobs/fieldobs.go` holds both the per-checkpoint fire records (`RecordCheckpoint`, `:172`) and the per-provider route decisions (`RecordRouteDecision`, `:197`; `Route` struct at `:98`; `Checkpoint` at `:87`). Grepping `origin/main` for `fieldobs.` across `Installers/internal` and `Installers/cmd` returns **six non-test call sites, all local**: `cmd/devoid/ai_hook_runner.go:202` and `:1189`, `internal/daemon/ai_transport_observation.go:65`, `:80`, `:81`, and a comment at `cmd/devoid/ai.go:549`. Grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns **nothing**.

Consequence: the strategy's required evidence-basis lines — "hook observed 3 minutes ago", "direct egress canary passed", the route observation — **exist on the endpoint and are invisible to any fleet surface.** An administrator cannot tell GOVERNED from REPORTED-GOVERNED per host because the observation half of the pair never arrives.

### The inventory coverage report is inert (SOT §16, re-verified)

`sweep.AIResult` gained `Complete`, `DepthCeiling`, `DepthPruned`, `DepthPrunedPaths`, `UnreadableDirs` (`Installers/internal/sweep/sweep_ai.go:43-65`, with the field doc stating in place that "Callers MUST render a false value as incomplete rather than as coverage"). Both readers throw it away: `cmd/devoid/artifact_user_sweep.go:303-304` logs `"AI inventory sweep complete", "items", res.ItemsScanned, "accepted", res.Accepted` and never reads `Complete`; `internal/daemon/server.go:2607` calls `_, err := daemonAISweepFn(...)` and discards the result entirely. The measurement behind the fix (SOT §16.1 C5) was **585 rule files at depth 8 versus 1,099 at depth 32 on one real machine — 47% invisible — while the sweep logged "AI inventory sweep complete".**

### The console

`RuntimeProtectionDepthPanel` is rendered from `Frontend/app/admin/endpoints/coverage-section.tsx:1756` (imported at `:43`), i.e. the fleet surface is `/admin/endpoints`. `Frontend/app/ai-control-plane/protection-depth.tsx` (3,195 lines) already contains `resolveEnforcementProof` (`:829`) with three ways out and none of them upward, `EnforcementProofFleetRollup` (`:1065`) deduped per `runtimeInstanceId` with a rendered arithmetic-shortfall sentence, `SurfaceCertificateDims` (`:1630`), `UndecidableHooksBlock` (`:1939`), `AdapterCard` (`:2419`) and `AdapterIngestAccounting` (`:2605`). **What it has no component for is a composed per-(host × surface) posture** — the reader must assemble six independent blocks themselves, which is the roll-up problem inverted.

### The render harness

`Frontend/scripts/render-harness/` — `fixtures.cjs` (870 lines), `shoot.cjs` (635), `stub-backend.cjs` (225), plus a 224-line README. Six scenarios (`populated`, `empty-tenant`, `absent-data`, `read-failed`, `slow`, `broken-fixture`), `--expect` / `--forbid` / `--strict` / `--fail-on-overflow`, exit 1 on any failed shot and 2 if it cannot run. Its README states the discipline this wave needs in place at `fixtures.cjs:21`: *"`empty-tenant` and `absent-data` are different claims and must never share copy."* It drives real routes including `admin/endpoints`.

### What is genuinely absent

1. Any composed posture state machine, in any repo.
2. A shared local-and-backend reason vocabulary.
3. Any fleet percentage with a visible numerator, denominator and freshness window.
4. Any wire path for the field-observation ledger.
5. Any counting of field-level (as opposed to element-level) agent-wire loss.
6. **Direct-egress denial** — grepping `Installers` `origin/main` for WFP/`Fwpm` symbols finds only unrelated matches (`internal/dlp/oauth_bearer.go`, test corpora). The "% with forced egress" denominator therefore **has no producer**, and Task 7 reports it `NOT MEASURED` rather than inventing one.

---

## The eight false greens, and the runnable command that proves each surface now tells the truth

This table is the backbone of the wave. Each row names a surface that today reports success it has not earned, the task that fixes it, and **the exact command an operator or an auditor runs to see that the surface now tells the truth.** A task is not done until its row's command produces its row's output.

| # | The false green today | Task | The command that proves it now tells the truth | What must come back |
|---|---|---|---|---|
| 1 | Codex prints `[OK] … installed + compliant` over an undecided count it never read | **2** | `devoid ai hooks-status codex; echo "exit=$?"` on a box with a non-zero undecidable counter | `UNGOVERNED`, `N invocation(s) UNDECIDED`, `exit=1` — and on a clean box, `[OK]` with `0 invocations undecided (measured zero)`, `exit=0` |
| 2 | `NEVER OBSERVED … no request has ever travelled this route` printed after a request travelled it | **3** | `curl -s localhost:19280/proxy/anthropic/v1/models >/dev/null; devoid ai hooks-status claude-code \| grep -i 'transport route'` | `TRAFFIC UNGOVERNED [!] (1 requests travelled this route and none reached a decision)` — and **not** `no request has ever travelled this route` |
| 3 | `AI inventory sweep complete` logged over a walk that pruned directories | **4** | `devoid ai reconcile 2>&1 \| grep -i 'inventory sweep'` on a home tree deeper than the ceiling | `AI inventory sweep INCOMPLETE — items is a floor, not an inventory` with `depthPruned=` — and the word `complete` absent |
| 4 | A mistyped optional field inside a valid adapter report vanishes with `reasons: []` and nothing counted | **5** | `curl -s -H "$JWT" $API/api/v1/health/agent-wire-drift \| jq '.RuntimeAdapterReport'` after a heartbeat carrying `undecidable: "3"` | a non-zero drop count with `undecidable` in its path list; and `select id, runtime_adapter_field_drops from endpoint_control_state where …` non-null on the row |
| 5 | A console with no composed posture, where an operator assembles green from six blocks | **6** | `curl -s -H "$JWT" $API/api/v1/ai/protection-depth \| jq '[.endpoints[].adapters[].posture.state] \| unique'` | **no `PREVENTION_ACTIVE` anywhere**, and `… \| jq '[.endpoints[].adapters[].posture.reasons[]] \| unique'` contains `direct-egress-not-measured` and `session-dimension-unavailable` |
| 6 | A fleet percentage with no denominator, and an unmeasurable metric rendered as `0%` | **7** | `curl -s -H "$JWT" $API/api/v1/ai/protection-depth \| jq '.summary.fleet'` | exactly 7 entries; `forced-egress` has `measured:false`, `numerator:null`, `denominator:null`; every `measured:true` entry has integer `numerator` and `denominator`; no `%` anywhere in the response |
| 7 | Open `/health` returns 200 unconditionally and installers log it as governance | **9** | `curl -s localhost:19280/health \| jq 'keys'` **and** `curl -s -H "X-Devoid-Token: $TOK" localhost:19280/v1/health/detail \| jq .governancePosture` | keys still exactly `["daemon","status","uptime","version","wireProxy"]`; the detail route returns `{state, reasons[]}` with a vocabulary member; installer log reads `daemon reachable (liveness only; governance posture is not readable without a capability token)` |
| 8 | The console renders green over a wire state in which nothing was measured | **10, 11** | `cd Frontend && node scripts/render-harness/shoot.cjs --scenario posture-unmeasured --routes admin/endpoints --strict --retries 0 --forbid "Prevention Active\|\|PREVENTION_ACTIVE\|\|0%\|\|100%" --expect "not measured\|\|not reported"; echo "exit=$?"` | `exit=0` — and `exit=1` with `FAIL forbidden-text` when Task 10's fleet strip is reverted |

---

## Task 1: Freeze the coverage-truth vocabulary as one artifact both runtimes read

**Phase 0.** No dependencies. Nothing consumes the output until Task 6.

**Files:**
- `Installers/parity-vectors/coverage-posture.v1.json` (new — the canonical artifact)
- `Installers/internal/coveragetruth/posture.go` (new — the Go constant lists)
- `Installers/internal/coveragetruth/posture_vector_test.go` (new — reads the vector by relative path)
- `Backend/packages/shared-contracts/coverage-posture.v1.json` (new — a **byte-identical** vendored copy)
- `Backend/packages/shared-contracts/src/coverage-posture-contract.ts` (new — the TS constant lists)
- `Backend/src/ai-governance/coverage-posture-contract.parity.spec.ts` (new)

### PRECONDITIONS

Run all of these. Every one must produce the stated output before you write a line.

```bash
# 1. Fetch. Every citation below is a claim about origin/main, and the local
#    checkouts are 1010 (Installers) and 773 (Backend) commits behind.
git -C /c/Users/Owner/Documents/Ceragon/Installers fetch origin
git -C /c/Users/Owner/Documents/Ceragon/Installers rev-parse origin/main
# EXPECT exactly: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git -C /c/Users/Owner/Documents/Ceragon/Backend fetch origin
git -C /c/Users/Owner/Documents/Ceragon/Backend rev-parse origin/main
# EXPECT exactly: 0cf9021e944b72ef2a3024e8687f4114db1f2468

# 2. The precedent this task copies EXISTS and works the way the task says.
git -C .../Installers show origin/main:internal/core/backend/ai_policy_toolrisk_wire_parity_test.go | grep -n 'toolRiskWireVectorPath'
# EXPECT: 50:const toolRiskWireVectorPath = "../../../parity-vectors/toolrisk-classes.v1.json"
git -C .../Installers ls-tree --name-only origin/main parity-vectors/ | grep toolrisk
# EXPECT: parity-vectors/toolrisk-classes.v1.json
git -C .../Backend ls-tree --name-only origin/main packages/shared-contracts/ | grep toolrisk
# EXPECT: packages/shared-contracts/toolrisk-classes.v1.json

# 3. The package you are creating does not already exist.
git -C .../Installers ls-tree --name-only origin/main internal/coveragetruth/
# EXPECT: empty output

# 4. The two AI-governance contracts really are Backend-only (this is why the
#    root CLAUDE.md would mislead you — see LANDMINES).
ls /c/Users/Owner/Documents/Ceragon/packages/shared-contracts/src/ | grep -c 'runtime-adapter-contract.ts\|endpoint-controls-contract.ts'
# EXPECT: 0
git -C .../Backend ls-tree --name-only origin/main packages/shared-contracts/src/ | grep -c 'runtime-adapter-contract.ts\|endpoint-controls-contract.ts'
# EXPECT: 2

# 5. The mirror guard really is skipped today (so you know not to touch it).
git -C .../Backend show origin/main:src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts | sed -n '61,70p'
# EXPECT to contain: `function findCopy1()` and `const describeIfWorkspace = copy1 ? describe : describe.skip;`
```

**If any of these fails, STOP AND REPORT.** Do not substitute a different vector directory, a different precedent test, or a different contracts copy.

### LANDMINES

- **`go:embed` CANNOT reach `parity-vectors/`.** Go's embed patterns must not contain `..` path elements, and `parity-vectors/` sits at the Installers repo root while your package is `internal/coveragetruth/`. An earlier revision of this task said "Go embeds it with `go:embed`" — **that does not compile.** Follow the working precedent instead: the Go constant lists live as ordinary literals in `posture.go`, and `posture_vector_test.go` reads the vector at **test time** by relative path, exactly as `ai_policy_toolrisk_wire_parity_test.go:50` does with `"../../../parity-vectors/toolrisk-classes.v1.json"`. From `internal/coveragetruth/` the path is `"../../parity-vectors/coverage-posture.v1.json"` — count the levels yourself and assert the file opens before asserting anything about its contents.
- **The root `CLAUDE.md` will mislead you here, and it is wrong for these two files specifically.** It says the workspace-root `packages/shared-contracts/` is the canonical the Backend parity specs compare against. That is true *for the contracts it actually holds*, and it holds **21 top-level entries** against the Backend copy's **42** (53 counting subdirectories). Verify both counts yourself:
  ```bash
  ls /c/Users/Owner/Documents/Ceragon/packages/shared-contracts/src/ | wc -l          # 21
  git -C .../Backend ls-tree --name-only origin/main packages/shared-contracts/src/ | wc -l   # 42
  ```
  Neither `runtime-adapter-contract.ts` nor `endpoint-controls-contract.ts` — the two AI-governance contracts this wave extends — exists at the root at all. And `findCanonicalContract` (`Backend/src/__test-utils__/canonical-contract-path.ts:54`, candidates built at `:44-51`) tries the **repo-relative copy first**, precisely because resolving to a stale workspace-root copy made specs pass on a developer box and skip in CI. Adding a root copy here would create a fourth divergence with no spec pointing at it.
- **This task writes nothing under any machine root and touches no installer.** The machine-root landmine does not apply. It is stated here only so you know it was considered and ruled out, not so you go looking for it.
- **This task widens no agent-wire contract.** No Backend deploy ordering applies.

### DO NOT

- **Do not use `go:embed`.** See LANDMINES. If you find yourself writing `//go:embed ../../parity-vectors/...`, stop — it is a compile error, not a syntax you need to work around.
- **Do not add the new contract to `M3_GOVERNANCE_DOMAIN_FILES` and do not touch `Backend/src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts`.** That spec byte-compares a workspace copy against the Backend copy and locates the workspace copy by probing candidate paths for `endpoint-controls-contract.ts` (`:61-66`). **Verified: none of the candidates contains that file, so `findCopy1()` returns `null` and the whole spec is `describe.skip` (`:69`) — the byte-compare does not currently run anywhere.** Adding a Backend-only file to its list changes nothing today and creates a red the day the workspace copy is restored. The always-on CI guard is `m3-contracts.parity.spec.ts`; the new contract's guard is its own parity spec. *(That skip is inert-test shape #1 and deserves its own item. It is out of this wave's scope and fixing it here would widen the blast radius for no coverage-truth gain. Report it; do not fix it.)*
- **Do not "unskip" that spec to make your contract covered.** That is weakening-a-guard's mirror image and is equally forbidden.
- **Do not mirror into `Ceragon-Intelligence/packages/shared-contracts/`.** That repo does not need this contract for this wave. Say so in the commit message rather than leaving a reader to wonder.
- **Do not add a seventh state or a 25th reason** to make a later task fit. If Task 6 needs a slug that is not here, that is a change to this task, made deliberately, not a quiet append.

### What it defines

Two closed lists and one invariant.

`COVERAGE_POSTURE_STATES` = `PREVENTION_ACTIVE`, `DEGRADED`, `CONTAINED`, `UNSUPPORTED`, `UNMANAGED`, `UNKNOWN` — exactly the strategy's six.

`COVERAGE_POSTURE_REASONS` = a closed slug list, each mapping to one distinct operator action:
`canary-never-run`, `canary-expired`, `canary-receipt-not-held`, `capability-cert-absent`, `capability-cert-version-mismatch`, `undecided-invocations-present`, `undecided-not-measured`, `vendor-discarded-decisions`, `route-never-carried-traffic`, `route-carried-traffic-undecided`, `direct-egress-not-measured`, `direct-egress-not-denied`, `managed-source-absent`, `managed-source-not-confirmed`, `cooperative-lane-only`, `runtime-version-unknown`, `runtime-binary-uncertified`, `config-drift`, `attestation-stale`, `policy-not-converged`, `wire-fields-dropped`, `inventory-walk-truncated`, `unsupported-tool-path-enabled`, `session-dimension-unavailable`.

That is 6 states and 24 reasons. Count them in the file before you commit.

**THE INVARIANT, and it is the whole design:** `state === 'PREVENTION_ACTIVE'` **if and only if** `reasons.length === 0`. Every other state carries at least one reason. This makes "why is this host not green" answerable without reading code, and makes the state machine impossible to fudge — you cannot mint green by tweaking a threshold, only by emptying the reason list.

The JSON vector is the single source. The Go literals and the TS literals are each asserted equal to it, byte-for-byte and order-for-order, by a test on their own side. The vendored Backend copy must be byte-identical to the Installers original — assert that too, the same way the toolrisk vector is vendored byte-identically into `Backend/packages/shared-contracts/` and `Frontend/types/vendored/`.

### Steps

- [ ] Write `coverage-posture-contract.parity.spec.ts` asserting the TS `COVERAGE_POSTURE_STATES` and `COVERAGE_POSTURE_REASONS` equal the arrays parsed from the vendored vector JSON, **in order**, and that the vendored copy is byte-identical to `Installers/parity-vectors/coverage-posture.v1.json` when that path resolves (skip the byte-compare only if the Installers checkout is absent, and say so in the skip message). Run it: RED (module not found).
- [ ] Write `posture_vector_test.go` asserting (a) the vector file **opens** at the relative path — fail with the resolved absolute path in the message if it does not — (b) the Go slices equal the vector's arrays in order, and (c) `len(COVERAGE_POSTURE_STATES) == 6 && len(COVERAGE_POSTURE_REASONS) == 24`. Run: RED.
- [ ] Add the vector JSON, `posture.go`, the vendored copy, and the TS contract. Both tests GREEN.
- [ ] Add `TestPostureStateInvariantIsDocumented` / `posture-invariant.spec.ts`: a table of `{state, reasons}` fixtures asserting `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` for every state in the vocabulary. RED first (helper absent), then GREEN.
- [ ] Commit. `git add Installers/parity-vectors/coverage-posture.v1.json Installers/internal/coveragetruth/ Backend/packages/shared-contracts/coverage-posture.v1.json Backend/packages/shared-contracts/src/coverage-posture-contract.ts Backend/src/ai-governance/coverage-posture-contract.parity.spec.ts` — explicit paths, never `-A`.

### DEFEAT TEST

```bash
# Mutation
cd /c/cwt/w8-t1-installers && \
  python -c "import json,io;p='parity-vectors/coverage-posture.v1.json';d=json.load(open(p));d['states'].remove('CONTAINED');json.dump(d,open(p,'w'),indent=2)"
# Copy the mutated vector into the Backend vendored path so both sides see it
cp parity-vectors/coverage-posture.v1.json /c/cwt/w8-t1-backend/packages/shared-contracts/coverage-posture.v1.json

# Command
cd /c/cwt/w8-t1-backend && npx jest coverage-posture-contract.parity

# MUST APPEAR in the output (exact string):
#   posture states diverged from the vector: TS has CONTAINED, vector does not
```

And the Go half:

```bash
cd /c/cwt/w8-t1-installers && go test ./internal/coveragetruth/...
# MUST APPEAR: posture states diverged from the vector: Go has CONTAINED, vector does not
```

If either command passes, or fails with a different message, the test is inert (shape #4 — both sides computed from the same literal). Fix the test, not the mutation.

**BLAST RADIUS:** none at runtime. This task adds constants, a JSON file and tests. Nothing consumes them until Task 6. If the lists are wrong, the later tasks compile against a wrong vocabulary and the parity spec catches the divergence, not production. It writes nothing to any machine root, changes no wire contract, and adds no enforcement branch.
**ROLLBACK:** delete the six new files. No consumer exists yet, no migration, no state.
**EXIT:** `Installers/parity-vectors/coverage-posture.v1.json` exists with exactly 6 states and 24 reason slugs, verified by `jq '.states | length'` -> `6` and `jq '.reasons | length'` -> `24`; `go test ./internal/coveragetruth/...` green; `npx jest coverage-posture` green in Backend; `cmp Installers/parity-vectors/coverage-posture.v1.json Backend/packages/shared-contracts/coverage-posture.v1.json` exits 0; both defeat-test mutations produce their exact strings.

---

## Task 2: Compose the Codex undecided and vendor-discarded counts into the Codex verdict and exit code

**Phase 5.** No dependencies. Agent-only; no Backend, no wire, no deploy ordering.

**Files:**
- `Installers/cmd/devoid/ai_codex_hooks.go` (lines 508 and 513)
- `Installers/cmd/devoid/ai_codex_lanes.go` (`printCodexObservedAndVerdict`, `:189-399`)
- `Installers/cmd/devoid/ai.go` (`printUndecidableHookPayloadsTo`, `:701`)
- `Installers/cmd/devoid/ai_codex_undecided_verdict_test.go` (new)

### PRECONDITIONS

```bash
git -C .../Installers fetch origin && git -C .../Installers rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# The two discarded results are still bare statements.
git -C .../Installers show origin/main:cmd/devoid/ai_codex_hooks.go | sed -n '508p;513p'
# EXPECT exactly two lines:
#   	printUndecidableHookPayloads(codex.CodexAdapterID)
#   	printVendorHookFailOpen()

# The Claude half already did this — you are mirroring it, not inventing it.
git -C .../Installers show origin/main:cmd/devoid/ai.go | sed -n '460p'
# EXPECT: 	vendorDiscarded := printVendorHookFailOpenTo(os.Stdout, airuntime.ClaudeCodeAdapterID)

# The three-state counter and its Measured() semantics are unchanged.
git -C .../Installers show origin/main:internal/security/ai_hook_undecidable.go | sed -n '109,111p'
# EXPECT: func (s UndecidableCounterState) Measured() bool {
#           return s == UndecidableCounterRead || s == UndecidableCounterNeverWritten

# The install scripts read the exit code back and DO NOT fail the install on it.
git -C .../Installers show origin/main:install-scripts/production/install.sh | sed -n '583,585p'
# EXPECT:  if [[ $gaps -gt 0 ]] / AI_GOVERNANCE_STATE="gap" / return 0
git -C .../Installers show origin/main:install-scripts/production/install.ps1 | sed -n '2829p'
# EXPECT a line invoking: ai hooks-status $runtime.Target
```

**If `sed -n '508p;513p'` does not return exactly those two bare statements, STOP AND REPORT** — someone has already changed the call sites and this task's premise is gone.

### LANDMINES

- **This changes an exit code that two install scripts read**, and that is the whole blast radius. `install.sh:564` and `install.ps1:2829` run `devoid ai hooks-status <target>` and treat a **non-zero exit as "NOT governed"**: they print a warning, echo the `[!]` lines, and set `AI_GOVERNANCE_STATE="gap"`. `install.sh:583-585` returns 0 in that branch, so **the install does not fail** — the summary reads "gap" instead of "confirmed". That is the intended, honest outcome, and it is the same blast radius the Claude half already took in 7.10.6 without an install regression.
- **A fresh box must not go red.** `UndecidableCounterNeverWritten` (`internal/security/ai_hook_undecidable.go:98`) **counts as measured** (`Measured()`, `:109-111`), so a machine that has never fired a hook reports a measured zero, not NOT MEASURED. Your second test proves this. **If a clean box goes red, you have used `Measured()` wrong — do not "fix" it by relaxing the gate.**
- **This is not a fail-closed branch.** It changes an exit code and a printed line. It does not stop, delay, deny or block any AI runtime launch, tool call, or package install. A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent — if you find yourself adding one here, you have left the task.
- **This task writes nothing under any machine root** and adds no file, directory or marker there. The MSI root-guard allowlist is untouched.
- **This task widens no agent-wire contract.** No Backend deploy is required or permitted for it.

### DO NOT

- **Do not modify `install_hook_parity_contract_test.go`.** It pins that both scripts read governance back from `hooks-status` and only claim governed inside the clean branch. It must stay green **unmodified**. If it goes red, your change is wrong.
- **Do not widen the Codex dialect pin.** `internal/codexmanaged/hookdialect.go:99-115` answers no for 0.145/0.146/0.148/0.149-alpha, including the build the desktop app runs, and it is that way because widening it without two vendor artefacts per family is how the lane went silently dead the first time. A dialect miss is supposed to surface here as an honest non-attestable lane, not be made to disappear.
- **Do not delete or relax any assertion in `ai_codex_lanes.go`'s existing tests** to make the new gate fit.
- **Do not change the Claude lane's wording** to match Codex. The fifth test below diffs the two clause substrings — make Codex match Claude, not the reverse.

### What changes

Mirror exactly what Installers `40f34362` did for Claude. Capture the two return values that are currently discarded, thread them into `printCodexObservedAndVerdict`, append `undecidedVerdictTerm(rollup) + vendorDiscardTerm(discarded)` to every verdict line, and add the same three-state `ungoverned` gate to the `VerdictCompliant` branch so `[OK] Codex managed controls installed + compliant` cannot stand over a non-zero undecided count or an unreadable counter.

Change `printVendorHookFailOpen()` at `ai_codex_hooks.go:513` to `printVendorHookFailOpenTo(os.Stdout, codex.CodexAdapterID)` so the per-runtime split is attributed instead of printed endpoint-wide-unlabelled. Also give `printUndecidableHookPayloadsTo` (`ai.go:701`) a `default:` arm that prints the measured zero, so silence and nought stop being indistinguishable on the Codex lane too.

### Steps

- [ ] `TestCodexVerdictIsNotOKOverUndecidedInvocations`: build a `codexmanaged.Report` with `Verdict: VerdictCompliant`, an `ungovernedRollup{undecided: 3, state: UndecidableCounterRead}`, call `printCodexObservedAndVerdict` against a `bytes.Buffer`, assert the output does **not** contain `[OK]`, does contain `UNGOVERNED`, contains `3 invocation(s) UNDECIDED`, and the function returns `false`. Run: RED.
- [ ] `TestCodexVerdictPrintsAMeasuredZero`: same with `undecided: 0, state: UndecidableCounterNeverWritten`; assert output contains `[OK]`, contains `0 invocations undecided (measured zero)`, returns `true`. Run: RED.
- [ ] `TestCodexVerdictFailsOnAnUnreadableCounter`: `state: UndecidableCounterUnreadable`; assert no `[OK]`, contains `NOT MEASURED (this is not a zero)`, returns `false`. Run: RED.
- [ ] `TestCodexVendorDiscardIsAttributedToThisRuntime`: assert `printVendorHookFailOpenTo(buf, codex.CodexAdapterID)` output contains `— %d of them on this runtime (codex)` rather than the unattributed endpoint-wide form. Run: RED.
- [ ] `TestClaudeAndCodexCarryIdenticalVerdictClauses`: call both printers with the same rollup and assert the `undecidedVerdictTerm` / `vendorDiscardTerm` clause substrings are byte-identical. Run: RED.
- [ ] Implement. All five GREEN. `go test ./cmd/devoid/...` green.
- [ ] Run `go test ./install-scripts/production/...` unmodified. It must stay green.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: put the discarded result back
cd /c/cwt/w8-t2 && \
  sed -i 's/^\t_ = printUndecidableHookPayloadsTo(os.Stdout, readUngovernedRollup(codex.CodexAdapterID))$/\tprintUndecidableHookPayloads(codex.CodexAdapterID)/' cmd/devoid/ai_codex_hooks.go
# (or by hand: revert ai_codex_hooks.go:508 to the bare statement
#  `printUndecidableHookPayloads(codex.CodexAdapterID)` and drop the rollup parameter)

# Command
go test ./cmd/devoid/ -run TestCodexVerdictIsNotOKOverUndecidedInvocations -v

# MUST APPEAR (exact string):
#   codex verdict printed [OK] over 3 undecided invocation(s)
```

If the test still passes with the bare statement restored, it is inert (shape #2 — you built your own printer graph instead of calling the production one). Fix the test.

**BLAST RADIUS:** one CLI exit code and the text of the Codex verdict lines. Two install scripts read that exit code and downgrade their summary from "confirmed" to "gap"; **neither fails the install** (`install.sh:583-585` returns 0). No enforcement, no wire, no store, no machine-root write. On a fresh box the output is `[OK]` with an explicit measured zero, because `UndecidableCounterNeverWritten.Measured()` is true.
**ROLLBACK:** revert the two call sites at `ai_codex_hooks.go:508` and `:513` to bare statements and drop the two new parameters from `printCodexObservedAndVerdict`. Single-commit revert; no state, no wire, no migration, no deployed dependency.
**EXIT:** five new tests green; `install-scripts/production` suite green **unmodified**; on a box with a non-zero undecidable counter, `devoid ai hooks-status codex; echo "exit=$?"` prints `UNGOVERNED`, `N invocation(s) UNDECIDED` and `exit=1`; on a clean box it prints `[OK]`, `0 invocations undecided (measured zero)` and `exit=0`; the defeat-test mutation produces its exact string.

---

## Task 3: Separate route TRAFFIC from route DECISIONS, and stop asserting the false one

**Phase 5.** No dependencies. Agent-only; **no Backend deploy ordering** (see below).

**Files:**
- `Installers/internal/fieldobs/fieldobs.go` (`Route` struct `:98`; new `RecordRouteTraffic`)
- `Installers/internal/proxy/ai_proxy.go` (the non-scan forward at `:320-321`)
- `Installers/internal/daemon/ai_transport_observation.go` (`AITransportObservationEntry` `:48`, `handleAITransportObservation` `:75`, new `recordTransportRouteTraffic`)
- `Installers/internal/daemon/ai_handlers.go` (observer wiring at `:2360`)
- `Installers/cmd/devoid/ai.go` (`routeStatusLabel`, `:579-597`)
- `Installers/internal/proxy/ai_proxy_route_traffic_test.go` (new)
- `Installers/cmd/devoid/ai_transport_route_status_test.go` (extend — it already asserts on `NEVER OBSERVED` at `:25`, `:39`, `:52`)

### PRECONDITIONS

```bash
git -C .../Installers fetch origin && git -C .../Installers rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# The transparent forward really does bypass the alert path.
git -C .../Installers show origin/main:internal/proxy/ai_proxy.go | sed -n '320,321p'
# EXPECT:  if r.Method != http.MethodPost || !isAIScanTarget(r.URL.Path) {
#            h.forward(w, r, nil)

# The misleading string is still there, unchanged.
git -C .../Installers show origin/main:cmd/devoid/ai.go | sed -n '591p'
# EXPECT to contain: NEVER OBSERVED [!] (configured, but no request has ever travelled this route)

# The one-producer rule is stated at the seam you are extending.
git -C .../Installers show origin/main:internal/daemon/ai_handlers.go | sed -n '2356,2360p'
# EXPECT to contain: a second counter would be a second truth

# The live-proof entry that recorded this failing is still quarantined.
git -C .../Installers show origin/main:internal/liveproof/register.json | jq -r '..|objects|select(.id=="anthropic-transport-decision")|.observed'
# EXPECT: false
```

**Coordination precondition (RECONCILIATION §2 D4).** Before editing `AITransportObservationEntry`, confirm Wave 3 Task 5 has not already reshaped it:

```bash
git -C .../Installers log --oneline origin/main -- internal/daemon/ai_transport_observation.go | head -3
grep -n "directEgress" /c/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/waves/w3_forced_egress.md | head -3
```

**Task 3 owns this struct and `routeStatusLabel`. W3 Task 5 appends `directEgress` to the shape you define.** If W3 T5 has already landed a different shape, STOP AND REPORT rather than adding a second field independently — the seam's own comment says a second counter would be a second truth, and two waves were each adding one.

### LANDMINES

- **One producer, not two.** Route traffic through the existing `AlertObserver` seam at `ai_handlers.go:2360`, not a second observer. The file's own comment at `ai_transport_observation.go:18-21` says "a second counter would be a second truth". Adding a parallel observer is the exact defect this wave exists to remove, dressed as a fix for it.
- **The proxy hot path must never be affected by a ledger write.** `recordTransportRouteDecision` already tolerates a failed write and logs at Debug (`:65-69`); the traffic recorder must do the same. **A failed ledger write must never change, delay or fail the forwarded request.** The load-bearing fact is the monotone "has this route carried traffic", which a lost increment cannot erase. If your write throttling is wrong the visible symptom is ledger churn on a busy box, not a blocked request — and the fourth test below is what proves it.
- **This is not a fail-closed branch and must not become one.** No traffic count may deny, delay or gate a request. A fail-closed branch on an unprovable condition bricked a machine in July 2026 and the operator uninstalled the agent.
- **This writes nothing under the machine root.** The ledger lives where `fieldobs` already writes it. If your implementation adds a new file or directory under the machine root, **stop**: writing any new entry under the machine root requires the SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624`, or the next MSI operation dies with `machine root contains unknown entry` (`:1086`) -> 1722 -> 1603 and rolls back the upgrade on **every ENROLLED endpoint while every clean-box test stays green**. That has happened three times: `.staging`, `aitrust`, `endpoint-identity.json`. This task should not need it — if it does, the task is wrong.
- **No agent-wire widening, therefore no Backend deploy ordering.** `/v1/ai/transport-observation` is a **token-gated loopback handler on the daemon** (`ai_transport_observation.go:75`), read by the CLI. Wave 3 asserted a Backend-first rule for it; RECONCILIATION §1 C3 struck that rule as spurious. Do not reintroduce it.

### DO NOT

- **Do not add a second observer** or a second counter file. Extend the one that exists.
- **Do not make `Route.Traffic` participate in any decision, gate or denial.** It is an observation.
- **Do not delete or rewrite the three existing assertions** in `ai_transport_route_status_test.go` (`:25`, `:39`, `:52`). Update them to the new vocabulary and keep them asserting.
- **Do not remove the `NEVER OBSERVED` line.** A genuinely cold route must still say so. You are adding a fourth state, not replacing the third.

### What changes

The counter is correct; the **claim** is wrong. Add a second, independent counter on the same ledger: `Route.Traffic` alongside `Route.Decisions`, incremented for **every** request the proxy handles, including the transparent-forward path at `ai_proxy.go:320-321`. Then rewrite `routeStatusLabel` into four honest states:

| Traffic | Decisions | Line |
|---|---|---|
| unknown (daemon unreachable) | — | `observation unknown [!] (daemon unreachable — cannot confirm this route)` (unchanged) |
| 0 | 0 | `NEVER OBSERVED [!] (configured; no request has ever travelled this route)` |
| >0 | 0 | `TRAFFIC UNGOVERNED [!] (N requests travelled this route and none reached a decision)` |
| >0 | >0 | `observed (N requests, M decisions, last …)` |

The third row is the one that has never existed and is exactly what the live-proof register recorded happening.

Increment traffic in the proxy handler **before** the `isAIScanTarget` branch so both paths are counted.

### Steps

- [ ] `TestTransparentForwardRecordsTraffic`: drive the proxy handler with `GET /proxy/anthropic/v1/models` (a non-scan target), assert the ledger's `anthropic` route shows `Traffic == 1, Decisions == 0`. Run: RED.
- [ ] `TestRouteStatusSaysTrafficUngoverned`: `routeStatusLabel(true, "anthropic", routeObservation{known: true, traffic: 4, decisions: 0})` must contain `TRAFFIC UNGOVERNED` and must **not** contain `no request has ever travelled this route`. Run: RED.
- [ ] `TestRouteStatusStillSaysNeverObservedOnAColdRoute`: `traffic: 0, decisions: 0` still yields `NEVER OBSERVED`. Run: RED (the new signature).
- [ ] `TestRouteTrafficWriteFailureDoesNotAffectTheRequest`: point the ledger at an unwritable dir, assert the forwarded response body, status and headers are byte-identical to the same request with a writable ledger, and that no error surfaces to the caller. Run: RED.
- [ ] Implement. All four GREEN, plus the three existing assertions in `ai_transport_route_status_test.go` updated to the new vocabulary and still green.
- [ ] `go test ./internal/proxy/... ./internal/daemon/... ./internal/fieldobs/... ./cmd/devoid/...` green.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: delete the traffic>0 && decisions==0 arm of routeStatusLabel so it
# falls through to the cold-route line.
cd /c/cwt/w8-t3
# by hand: in cmd/devoid/ai.go routeStatusLabel, remove the
#   if obs.traffic > 0 && obs.decisions == 0 { ... "TRAFFIC UNGOVERNED" ... }
# branch

# Command
go test ./cmd/devoid/ -run TestRouteStatusSaysTrafficUngoverned -v

# MUST APPEAR (exact string):
#   route line printed "no request has ever travelled this route" over 4 observed requests
```

And the producer half:

```bash
# Mutation: move the traffic increment BELOW the isAIScanTarget branch in ai_proxy.go
go test ./internal/proxy/ -run TestTransparentForwardRecordsTraffic -v
# MUST APPEAR: expected Traffic == 1 on route anthropic after a transparent forward, got 0
```

**BLAST RADIUS:** the proxy hot path gains one best-effort ledger write per request, on a path that already tolerates write failure at Debug. A failed write cannot affect the request (pinned by test 4). The status line changes wording, which `ai_transport_route_status_test.go` and any operator runbook quoting the old string will notice. `Route.Traffic` is additive JSON. No enforcement, no machine-root write, no Backend, no deploy.
**ROLLBACK:** revert `routeStatusLabel` to the three-state form and stop calling `recordTransportRouteTraffic`. `Route.Traffic` is additive JSON and an older reader ignores it, so a rolled-back binary reads a forward ledger without error. No migration, no deployed dependency.
**EXIT:** `curl -s localhost:19280/proxy/anthropic/v1/models >/dev/null` moves `Route.Traffic` from 0 to 1 and leaves `Route.Decisions` at 0 (verify with `jq '.providers.anthropic' < <ledger>`); `devoid ai hooks-status claude-code | grep -i 'transport route'` then prints `TRAFFIC UNGOVERNED`; the exact scenario the `anthropic-transport-decision` register entry recorded no longer produces a line that contradicts the traffic; both defeat-test mutations produce their exact strings.

---

## Task 4: Make the AI-inventory sweep unable to log "complete" over a truncated walk

**Phase 5.** No dependencies. Agent-only; log lines only.

**Files:**
- `Installers/cmd/devoid/artifact_user_sweep.go` (`:303-304`)
- `Installers/internal/daemon/server.go` (`:2607`)
- `Installers/cmd/devoid/artifact_user_sweep_coverage_test.go` (new)
- `Installers/internal/daemon/ai_sweep_coverage_test.go` (new)

### PRECONDITIONS

```bash
git -C .../Installers fetch origin && git -C .../Installers rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# The false-green log line is still there, at these lines.
git -C .../Installers show origin/main:cmd/devoid/artifact_user_sweep.go | sed -n '303,304p'
# EXPECT exactly:
#   	logger.Info("AI inventory sweep complete",
#   		"items", res.ItemsScanned, "accepted", res.Accepted)
# (an earlier revision cited :302-303 — the reconciliation corrected it to :303-304)

# The daemon still discards the whole result.
git -C .../Installers show origin/main:internal/daemon/server.go | sed -n '2607p'
# EXPECT: 		_, err := daemonAISweepFn(sweep.AIOptions{

# The five fields exist and the source itself says callers MUST render false as incomplete.
git -C .../Installers show origin/main:internal/sweep/sweep_ai.go | sed -n '43,65p' | grep -c 'Complete bool\|DepthCeiling\|DepthPruned\|DepthPrunedPaths\|UnreadableDirs'
# EXPECT: 5
git -C .../Installers show origin/main:internal/sweep/sweep_ai.go | grep -c 'MUST render a false value as incomplete rather than as coverage'
# EXPECT: 1
```

### LANDMINES

- **Nothing may gate on `Complete`.** This task changes a log level and a message. It must not cause a sweep to fail, an install to fail, an exit code to change, or a runtime to be denied. A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent — an incomplete walk is exactly such an unprovable condition, and the correct response is to **say so**, not to refuse.
- **Warn noise is the real risk, and it is bounded by one line per sweep.** Do not log per pruned directory. `DepthPrunedPaths` is a bounded sample and belongs in structured fields on the single line, not in a loop.
- **This writes nothing under the machine root.** No new file, directory or marker. If your change adds one, the SAME COMMIT must add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624` or the next MSI operation dies 1722 -> 1603 and rolls back the upgrade on every enrolled endpoint while every clean-box test stays green. This task should not need it.
- **No agent-wire widening, no Backend, no deploy.**

### DO NOT

- **Do not change `sweep.RunAI`'s behaviour, its depth ceiling, or its pruning.** The measurement (585 files at depth 8 vs 1,099 at depth 32 on one real machine — 47% invisible) is the *reason* for this task, not its scope. Raising the ceiling is a different task with a different blast radius.
- **Do not make the daemon sweep fail on `Complete == false`.** Record it; return the same error you returned before.
- **Do not weaken or delete any existing sweep test** to accommodate the new log shape.

### What changes

Both readers consume `AIResult.Complete` and the four detail fields that already exist and have no reader. On `Complete == false` the user sweep logs at **Warn**, not Info, and the message states a floor rather than an inventory: `"AI inventory sweep INCOMPLETE — items is a floor, not an inventory"` with `depthCeiling`, `depthPruned`, `unreadableDirs`. The daemon sweep stops discarding the result (`_, err := daemonAISweepFn(...)`) and records the same fact.

### Steps

- [ ] `TestUserSweepDoesNotSayCompleteOnATruncatedWalk`: stub `sweep.RunAI` to return `AIResult{ItemsScanned: 585, Complete: false, DepthCeiling: 32, DepthPruned: 14}`, capture the logger, assert the output contains `INCOMPLETE` and does **not** contain the string `AI inventory sweep complete`. Run: RED.
- [ ] `TestUserSweepStillSaysCompleteOnAWholeWalk`: `Complete: true` still logs the existing Info line with `items` and `accepted`, at Info level. Run: RED (helper absent), then GREEN.
- [ ] `TestDaemonSweepReadsTheCoverageResult`: assert the daemon path no longer discards the `*AIResult` and emits the same incompleteness fact. Run: RED.
- [ ] `TestSweepIncompletenessIsOneLinePerSweep`: with `DepthPrunedPaths` holding 12 sample paths, assert exactly one Warn record is emitted. Run: RED.
- [ ] Implement all four. `go test ./cmd/devoid/... ./internal/daemon/...` green.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: restore the unconditional Info line
cd /c/cwt/w8-t4
# by hand: revert cmd/devoid/artifact_user_sweep.go:303-304 to
#   logger.Info("AI inventory sweep complete",
#       "items", res.ItemsScanned, "accepted", res.Accepted)

# Command
go test ./cmd/devoid/ -run TestUserSweepDoesNotSayCompleteOnATruncatedWalk -v

# MUST APPEAR (exact string):
#   sweep logged "complete" over a walk that pruned 14 directories
```

If the test passes with the Info line restored, your stub is not reaching the production logger (inert shape #3) — assert on the captured production logger, not on a value you computed.

**BLAST RADIUS:** log lines only, plus one new Warn on machines with deep or unreadable home trees. Nothing gates on it, nothing fails, no exit code changes. The risk is Warn noise on a box with many unreadable directories, bounded to one line per sweep and pinned by test 4. No wire, no store, no schema, no machine-root write, no Backend.
**ROLLBACK:** revert both call sites to their current shape. No wire, no store, no schema, no deployed dependency.
**EXIT:** on a tree that prunes at least one directory, `devoid ai reconcile 2>&1 | grep -i 'inventory sweep'` emits a Warn containing `INCOMPLETE`, containing `depthPruned=`, and **never** the word `complete`; `go test ./cmd/devoid/... ./internal/daemon/...` green; the defeat-test mutation produces its exact string.

---

## Task 5: Count the field-level agent-wire loss the pipe cannot see, and expose it

**Phase 5. THIS IS THE FIRST BACKEND CHANGE IN THE ENTIRE PROGRAMME.** RECONCILIATION §3: it must land ahead of W1 T8, W4 T12 and this wave's own Task 8. Until it lands, an agent-ahead-of-Backend ordering mistake on any of those three produces **no error, no data, and a console that looks correct.**

**Files:**
- `Backend/src/ai-governance/runtime-adapter-shape.ts` (`normalizeRuntimeAdapterReportOutcome`, `:1221`; `normalizeRuntimeAdapters`, `:1386`)
- `Backend/src/common/pipes/agent-wire-drift.ts` (reuse `recordAgentWireDrift`, `:237`; the cap constants at `:57`, `:60`, `:81`)
- `Backend/src/health/services/health.service.ts` (the persist site)
- `Backend/src/entities/endpoint-control-state.entity.ts` (one nullable jsonb column)
- `Backend/src/migrations/<ts>-AddRuntimeAdapterFieldDropsToControlState.ts` (new)
- `Backend/src/ai-governance/runtime-adapter-field-drift.spec.ts` (new)

### PRECONDITIONS

```bash
git -C .../Backend fetch origin && git -C .../Backend rev-parse origin/main
# EXPECT: 0cf9021e944b72ef2a3024e8687f4114db1f2468

# The rebuild that silently drops optional fields is where the task says it is.
git -C .../Backend show origin/main:src/ai-governance/runtime-adapter-shape.ts | sed -n '1221p'
# EXPECT: export function normalizeRuntimeAdapterReportOutcome(

# The pipe is structurally blind to it: runtimeAdapters is unknown[].
git -C .../Backend show origin/main:src/health/types/heartbeat.types.ts | sed -n '810p'
# EXPECT:   runtimeAdapters?: unknown[];
git -C .../Backend show origin/main:src/health/types/heartbeat.types.ts | grep -c 'NONE OF THE DECORATORS ON THIS CLASS EVER EXECUTE'
# EXPECT: 1

# The caps you must match already exist. Do not invent new numbers.
git -C .../Backend show origin/main:src/common/pipes/agent-wire-drift.ts | sed -n '57p;60p;81p'
# EXPECT: AGENT_WIRE_DRIFT_MAX_DTOS = 64 / AGENT_WIRE_DRIFT_MAX_PATHS_PER_DTO = 64 /
#         AGENT_WIRE_DRIFT_TRUNCATED = '<walk-budget-exhausted>'

# The never-reject invariant is stated in the pipe itself.
git -C .../Backend show origin/main:src/common/pipes/agent-ingest-validation.pipe.ts | sed -n '150,153p'
# EXPECT to contain: STILL NEVER REJECTS. Nothing on this path can turn a drop into a 400

# The read-back surface exists and is owner-gated.
git -C .../Backend show origin/main:src/health/controllers/health.controller.ts | sed -n '218,223p'
# EXPECT to contain: @Roles(UserRole.OWNER, UserRole.ORGANIZATION_ADMIN) and @Get('agent-wire-drift')
```

**Programme-order precondition.** Before starting, confirm no other Backend wire-widening task has landed first:

```bash
git -C .../Backend log --oneline origin/main -- src/ai-governance/runtime-adapter-shape.ts | head -5
```

If `localDecided` / `localDeclined` / `snapshotState` (W1 T8), `capabilityDispositions` (W4 T12) or `fieldObservation` (W8 T8) already appear in that file on `origin/main`, **the programme order has been violated — STOP AND REPORT.** Those changes shipped without the counter that would make an ordering mistake visible.

### LANDMINES

- **IT STILL NEVER REJECTS.** Nothing on this path may turn a drop into a 400. `agent-ingest-validation.pipe.ts:150-153` states that invariant in place, and the 400 form has taken the fleet down more than once — most recently when `forbidNonWhitelisted` on a typed nested DTO 400'd every synchronous prompt-check fleet-wide, invisible to both the DB and the code. The new code **counts and persists; it never throws**, and the caller swallows.
- **This is the ordering safety net for three other tasks in three other waves.** Its value is entirely in landing first. If you find yourself deferring it behind a wire widening, you have inverted the thing it exists to protect.
- **Widening an agent-wire contract requires the Backend deployed FIRST.** `AgentIngestValidationPipe` **DROPS** unknown keys rather than rejecting them, so the reverse order loses fields silently — no error, no data, and the agent's own status surfaces read fine. This task does not widen the wire; it is what makes a future violation visible. Do not let it become a wire widening.
- **The migration must be additive and nullable.** A rollback of the code then leaves a harmless unread column. Dropping a column is its own ask and is not in this task.
- **Do not reuse the pipe's per-DTO cap loosely.** Match `AGENT_WIRE_DRIFT_MAX_PATHS_PER_DTO` (64) and append `AGENT_WIRE_DRIFT_TRUNCATED` exactly as `agent-wire-drift.ts:225` does. Two capping conventions in one surface is how "we dropped some" becomes unreadable.

### DO NOT

- **Do not add `@ValidateNested` / `@Type` to `EndpointControlsDto.runtimeAdapters`.** Its doc says why: a forward-shaped daemon report must never 400 the whole key-heartbeat. Wiring the DTO up reintroduces the fail-the-heartbeat behaviour that was deliberately removed.
- **Do not throw, reject, or 4xx on a dropped field**, under any condition, including a configuration flag.
- **Do not modify `runtime-adapter-report-dto.inert.spec.ts` or the existing `agent-wire-drift` suites.** They must stay green unmodified.
- **Do not invent a new cap number** or a new truncation sentinel.

### What changes

`normalizeRuntimeAdapterReportOutcome` returns a third value: `droppedKeyPaths: string[]` — the bounded set of keys present on `src` that the rebuilt report does not carry, index-collapsed and capped exactly as `agent-wire-drift.ts` caps (64 paths, `AGENT_WIRE_DRIFT_TRUNCATED` sentinel). `normalizeRuntimeAdapters` unions them. `health.service.ts` (a) calls `recordAgentWireDrift('RuntimeAdapterReport', paths)` so `GET /api/v1/health/agent-wire-drift` reads them back through the surface that already exists, and (b) persists the union on the control-state row so it survives a process restart and can be **subtracted from a coverage denominator**, which the process-local counter cannot (SOT §14.7 "what remains": "the counter is process-local and resets on restart, has no console surface, and nothing subtracts it from any coverage denominator").

### Steps

- [ ] `runtime-adapter-field-drift.spec.ts` — `it('reports a mistyped undecidable block as a dropped key path')`: feed a report with a valid binding, valid coverage depth/certification state, and `undecidable: "3"` (a string). Assert the outcome's `report` is non-null (it must still store), `reasons` is `[]`, and `droppedKeyPaths` contains `undecidable`. Run: RED.
- [ ] `it('reports a misspelled optional key')`: `undecideable: {...}`; assert `droppedKeyPaths` contains `undecideable`. Run: RED.
- [ ] `it('reports nothing for a clean report')`: a fully valid report yields `droppedKeyPaths: []`. Run: RED.
- [ ] `it('never rejects a heartbeat because of a dropped field')`: assert the persist path completes with HTTP 2xx and the row is written with the adapter stored. Run: RED.
- [ ] `it('caps the path list and appends the truncation sentinel')` — 200 junk keys yield 64 paths plus `<walk-budget-exhausted>`. Run: RED.
- [ ] Implement, add the additive nullable jsonb migration, run `npm run test -- runtime-adapter-field-drift`.
- [ ] Run the existing `agent-wire-drift` and `runtime-adapter-report-dto.inert.spec.ts` suites **unmodified**. Both must be green.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: drop the third return value
cd /c/cwt/w8-t5
# by hand: change normalizeRuntimeAdapterReportOutcome back to returning only
#   { report, reasons }

# Command
npx jest runtime-adapter-field-drift -t 'reports a mistyped undecidable block as a dropped key path'

# MUST APPEAR (exact string):
#   expected droppedKeyPaths to contain "undecidable", received undefined
```

Second defeat, on the never-reject invariant:

```bash
# Mutation: make the normalizer throw when droppedKeyPaths is non-empty
npx jest runtime-adapter-field-drift -t 'never rejects a heartbeat because of a dropped field'
# MUST APPEAR: a dropped field turned a heartbeat into a rejection; this path must never reject
```

**BLAST RADIUS:** one nullable jsonb column and one extra counter increment per heartbeat. If the diff is wrong the failure mode is an over-reported drop list — noise on an OWNER-only route and a non-null column — **never a rejected heartbeat**, pinned by test 4. The migration is additive and nullable, so a rollback of the code leaves a harmless unread column. No agent change, no wire widening, no endpoint behaviour change.
**ROLLBACK:** revert the service change; **leave the column** (dropping a column needs its own ask). `GET /api/v1/health/agent-wire-drift` returns to pipe-level drops only. No agent depends on this, so no agent rollback is coupled to it.
**EXIT:** a heartbeat carrying one mistyped optional field inside a valid adapter report produces a non-empty `droppedKeyPaths` on the persisted row **and** a non-zero entry under DTO `RuntimeAdapterReport` at `curl -s -H "$JWT" $API/api/v1/health/agent-wire-drift | jq '.RuntimeAdapterReport'`; **zero heartbeats are rejected in the process** (assert the 2xx); five new tests green; the two existing suites green unmodified; both defeat-test mutations produce their exact strings.

---

## Task 6: Derive the Prevention Active state machine, server-side, additively

**Phase 3 — this task IS the strategy's Phase 3 gate.** Depends on Task 1 (vocabulary) and reads Task 5's persisted field.

**ORDERING, RECONCILIATION §4 R7: this task must land FIRST of the three tasks that turn dashboards red** — ahead of W5 T4 (`observed` -> `loaded` fleet-wide) and W4 T8 (Codex `managed` -> `cooperative`). It is the one that **explains** the other two, because it publishes the reason list. Landing all three in one release turns every coverage dashboard red at once and the predictable response is a rollback request for a plan working as designed. **Land this, ship a release note, then W5 T4, then W4 T8 — separate releases, a note each.**

**Files:**
- `Backend/src/ai-governance/services/coverage-posture.util.ts` (new — pure, no ambient clock)
- `Backend/src/ai-governance/services/coverage-posture.util.spec.ts` (new)
- `Backend/src/ai-governance/dto/ai-response.dto.ts` (add `posture` to `AiProtectionDepthAdapterDto` `:1437` and `AiProtectionDepthEndpointDto` `:1671`)
- `Backend/src/ai-governance/services/ai-query.service.ts` (`getProtectionDepth`, `:5264`, project the new block)
- `Backend/src/ai-governance/services/ai-query.protection-depth-posture.spec.ts` (new)

### PRECONDITIONS

```bash
git -C .../Backend fetch origin && git -C .../Backend rev-parse origin/main
# EXPECT: 0cf9021e944b72ef2a3024e8687f4114db1f2468

# Task 1 landed and the vocabulary is on this branch.
test -f packages/shared-contracts/src/coverage-posture-contract.ts && \
  jq '.states | length, .reasons | length' packages/shared-contracts/coverage-posture.v1.json
# EXPECT: 6 then 24
# If ABSENT: Task 1 has not landed. STOP AND REPORT — do not hand-write the vocabulary.

# Task 5 landed (this task reads its persisted droppedKeyPaths).
grep -c 'droppedKeyPaths' src/ai-governance/runtime-adapter-shape.ts
# EXPECT: >= 1. If 0: Task 5 has not landed. STOP AND REPORT.

# Every gate source below still exists, at these lines.
git -C .../Backend show origin/main:src/ai-governance/services/ai-query.service.ts | sed -n '1427p'
# EXPECT: 	private projectInstanceIntegrity(
git -C .../Backend show origin/main:src/ai-governance/services/ai-query.service.ts | grep -n 'serverHoldsReceipt = !!proof?.receiptHash'
# EXPECT: one hit inside projectInstanceIntegrity
git -C .../Backend show origin/main:src/ai-governance/services/runtime-adapter-render.util.ts | sed -n '711p;739p;760p'
# EXPECT: function versionSatisfiesCertRange( / function certificateMatches( / function resolveRenderState(params: {
git -C .../Backend show origin/main:src/ai-governance/services/runtime-adapter-render.util.ts | sed -n '604p'
# EXPECT: export function runtimeAdapterUndecidableView(

# The two blockers really have no producer. These must BOTH come back 0.
git -C .../Installers grep -c -iE 'Fwpm|FWPM_|WfpEngineOpen' origin/main -- 'internal/**/*.go' 'cmd/**/*.go' | grep -v oauth_bearer | wc -l
# EXPECT: 0 real matches (dlp/oauth_bearer.go and test corpora are unrelated)
git -C .../Backend show origin/main:src/ai-governance/runtime-adapter-shape.ts | sed -n '74,114p' | grep -ci 'session'
# EXPECT: 0
```

**If the last two do not return 0, the world has moved: a direct-egress producer or a session dimension now exists. STOP AND REPORT** — the gate list below changes, and it is not yours to change unilaterally.

### LANDMINES

- **`PREVENTION_ACTIVE` is unreachable on every real endpoint today, and that is the correct output of this task.** Two gates block it: **direct-egress denial has no producer** (Wave 3 Task 6 builds it) and **the session dimension is absent from the binding and unowned** (RECONCILIATION §6 — Wave 1 does not contain it). **Do not soften either gate to make the state reachable.** A run that produces a green endpoint before Wave 3 Task 6 lands is a defect in this wave, not a success.
- **The blocker does not clear itself.** An earlier revision said the reason "simply stops being emitted" when Wave 3 lands. **That is wrong** (RECONCILIATION §6): someone must wire a `directEgressDenied` producer into this function's input. **That wiring is assigned to Wave 3 Task 6.** Write the input field now (`directEgressDenied: boolean | null`) so Wave 3 has a socket to plug into, and state in the code comment that `null` means no producer exists and is the expected value in every build until Wave 3 Task 6 ships.
- **This adds ZERO enforcement branches.** Nothing on any endpoint decides differently because of this task. It is a projection over data the server already holds, delivered on a read route. It therefore cannot brick a machine and cannot create a fail-closed checkpoint on an unprovable condition — the July 2026 failure mode is structurally out of reach here, and it must stay out of reach.
- **The one real risk is over-claiming**, i.e. a bug that emits `PREVENTION_ACTIVE` where it should not. The invariant test and the defeat test are aimed squarely at it. Build the reason list first and derive the state from it; never assign a state and then attach reasons.
- **No wire widening, no agent change, no machine-root write.** This task adds two optional fields to an existing **read response**. The Backend-first deploy rule does not apply because no agent sends anything new.

### DO NOT

- **Do not touch `RuntimeAdapterRenderState` or `summary.states`.** The existing eight-state vocabulary is consumed by six Frontend suites and carries a compile-error-on-a-ninth-state invariant; `sum(states) === adaptersReported` is asserted. Mutating it to carry a new gate would put new logic behind an existing guard. The posture composition is **additive and parallel** — one derivation, two independent axes, exactly as `deploymentAssurance` is already kept an independent axis rather than fused into the state badge.
- **Do not modify `ai-query.protection-depth-summary.spec.ts`.** It must stay green unmodified.
- **Do not emit a reason slug that is not in Task 1's vocabulary.** Test 5 pins this.
- **Do not read the clock inside the util.** `nowMs` is an argument. A function with an ambient clock cannot be tested over a matrix.
- **Do not let `DEGRADED` outrank `UNKNOWN`.** "Unknown is not clean. Drift is not unknown. Failure is not absence."

### The composition rule

`derivePreventionPosture(input, nowMs)` returns `{ state, reasons[], evidence[] }` where `state` is from Task 1's vocabulary and the invariant `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` holds **by construction** (build the reason list first; the state is a function of it).

The mandatory gates, each sourced from something that already exists:

| Gate | Source, verified on `origin/main` | Reason on failure |
|---|---|---|
| Server holds an unexpired receipt-backed PROVEN canary | `AiRuntimeInstanceIntegrityDto.enforcementProof === 'proven'` (`ai-query.service.ts:1427-1496`, `serverHoldsReceipt = !!proof?.receiptHash`) | `canary-never-run` / `canary-expired` / `canary-receipt-not-held` |
| Capability certificate matches the tuple and the running version | `certificateMatches` (`runtime-adapter-render.util.ts:739-758`) + `versionSatisfiesCertRange` (`:711`) | `capability-cert-absent` / `capability-cert-version-mismatch` |
| Zero undecided invocations, measured | `runtimeAdapterUndecidableView` (`:604`) — `aboveZero` / `null` | `undecided-invocations-present` / `undecided-not-measured` |
| No drift, attestation fresh, version known | `resolveRenderState` inputs (`:760-825`), `RUNTIME_ADAPTER_ATTESTATION_STALE_MS` (`:243`) | `config-drift` / `attestation-stale` / `runtime-version-unknown` |
| Policy converged | `EndpointPolicyIntegrityView.convergence === 'healthy'` | `policy-not-converged` |
| No field-level wire loss on this row | Task 5's persisted `droppedKeyPaths` | `wire-fields-dropped` |
| Direct provider egress denied independently | **NO PRODUCER EXISTS** (verified: no WFP code in Installers `origin/main`). Input field `directEgressDenied: boolean \| null`; **Wave 3 Task 6 owns wiring the producer into it** | `direct-egress-not-measured` |
| Session dimension | **ABSENT from the binding** (verified against `RuntimeBindingShape` `:74-114`) and **UNOWNED** (RECONCILIATION §6 — Wave 1 does not contain it) | `session-dimension-unavailable` |

Non-mandatory composition: `UNMANAGED` when the endpoint reports a cooperative-only lane (`cooperative-lane-only`); `UNSUPPORTED` when `coverageDepth === 'not-endpoint-governed'` or a runtime binary is uncertified; `CONTAINED` when direct use is prevented but functionality is unavailable; `UNKNOWN` when DeVoid cannot measure — **and `UNKNOWN` outranks `DEGRADED`, never the reverse.**

### Steps

- [ ] `coverage-posture.util.spec.ts` — `it('never returns PREVENTION_ACTIVE while direct egress is unmeasured')`: pass an otherwise perfect input (proven receipt-backed unexpired canary, matching certificate, measured zero undecided, fresh, no drift, converged) with `directEgressDenied: null`. Assert `state !== 'PREVENTION_ACTIVE'` and `reasons` includes `direct-egress-not-measured`. Run: RED.
- [ ] `it('never returns PREVENTION_ACTIVE while the session dimension is absent')`: same perfect input with `sessionDimensionPresent: false`; assert `reasons` includes `session-dimension-unavailable`. Run: RED.
- [ ] `it('holds the invariant across a generated matrix')`: for every combination over the eight gates (2^8 = 256 minimum), assert `(state === 'PREVENTION_ACTIVE') === (reasons.length === 0)`. Run: RED.
- [ ] `it('demotes a PROVEN canary with no server receipt')`: `enforcementProof: 'could-not-test'` with `serverHoldsReceipt: false` yields `canary-receipt-not-held`, never green. Run: RED.
- [ ] `it('prefers UNKNOWN over DEGRADED when a gate is unmeasurable')`. Run: RED.
- [ ] `it('emits a reason slug from the frozen vocabulary only')`: assert every reason produced across the matrix is a member of Task 1's `COVERAGE_POSTURE_REASONS`, imported from the contract — **not** re-typed. Run: RED.
- [ ] `ai-query.protection-depth-posture.spec.ts` — assert `getProtectionDepth` projects `posture` on every adapter and every endpoint, and that no endpoint in a realistic fixture reaches `PREVENTION_ACTIVE`. Run: RED.
- [ ] Implement. All seven GREEN. Existing `ai-query.protection-depth-summary.spec.ts` and the `sum(states) === adaptersReported` invariant green **unmodified**.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: delete the direct-egress reason push
cd /c/cwt/w8-t6
# by hand: in derivePreventionPosture, remove the
#   if (input.directEgressDenied !== true) reasons.push('direct-egress-not-measured')
# branch

# Command
npx jest coverage-posture.util -t 'never returns PREVENTION_ACTIVE while direct egress is unmeasured'

# MUST APPEAR (exact string):
#   expected state not to be PREVENTION_ACTIVE; direct egress was never measured on this endpoint
```

Second defeat, on the invariant itself:

```bash
# Mutation: make the state assignment independent of the reason list
#   (assign 'PREVENTION_ACTIVE' first, then append reasons)
npx jest coverage-posture.util -t 'holds the invariant across a generated matrix'
# MUST APPEAR: PREVENTION_ACTIVE emitted with 3 reasons; the state must be a function of the reason list
```

If the matrix test passes under that mutation, it is inert (shape #4 — the expected value is computed by the code under test). Compute the expectation from the fixture, not from the function.

**BLAST RADIUS:** two new optional fields on an existing read response. A Frontend that does not know them ignores them (the FE reads named fields, not a spread). If the derivation is wrong, an operator sees a wrong posture badge on `/admin/endpoints`; **nothing enforces on it**. No endpoint behaviour changes. No wire widening, so no deploy-ordering constraint. **The dashboard consequence is real and intended:** every endpoint will read non-green with a reason list, which is why this must land before W5 T4 and W4 T8 and carry a release note.
**ROLLBACK:** stop projecting `posture` in `getProtectionDepth`; the util and its tests can stay. One-line revert, no migration, no agent coupling.
**EXIT:** `derivePreventionPosture` exists as a pure function with `nowMs` as an argument; the invariant test passes over a generated matrix of at least 256 gate combinations; `curl -s -H "$JWT" $API/api/v1/ai/protection-depth | jq '[.endpoints[].adapters[].posture.state] | unique'` contains **no** `PREVENTION_ACTIVE`; `... | jq '[.endpoints[].adapters[].posture.reasons[]] | unique'` contains both `direct-egress-not-measured` and `session-dimension-unavailable`; **zero endpoints in the production tenant read `PREVENTION_ACTIVE`**; both defeat-test mutations produce their exact strings.

---

## Task 7: Give every fleet percentage a numerator, a denominator, and a freshness window

**Phase 5.** Depends on Task 5 (`droppedKeyPaths` count) and Task 6 (`prevention-active` metric).

**Files:**
- `Backend/src/ai-governance/dto/ai-response.dto.ts` (`AiProtectionDepthResponseDto.summary`, `:1806`)
- `Backend/src/ai-governance/services/ai-query.service.ts` (`getProtectionDepth`, `:5264`)
- `Backend/src/ai-governance/services/ai-query.protection-depth-denominators.spec.ts` (new)

### PRECONDITIONS

```bash
git -C .../Backend fetch origin && git -C .../Backend rev-parse origin/main
# EXPECT: 0cf9021e944b72ef2a3024e8687f4114db1f2468

# Tasks 5 and 6 landed.
grep -c 'droppedKeyPaths' src/ai-governance/runtime-adapter-shape.ts        # EXPECT >= 1
test -f src/ai-governance/services/coverage-posture.util.ts && echo present  # EXPECT present
# If either is missing: STOP AND REPORT. Do not stub the metrics they feed.

# The null-means-NOT-MEASURED precedent this task copies already exists.
git -C .../Backend show origin/main:src/ai-governance/dto/ai-response.dto.ts | sed -n '1708p'
# EXPECT: export interface AiProtectionDepthAdapterIngestDto {
git -C .../Backend show origin/main:src/ai-governance/dto/ai-response.dto.ts | sed -n '1864p'
# EXPECT to contain: adaptersTruncatedReported

# forced-egress still has no producer.
git -C .../Installers grep -ciE 'Fwpm|FWPM_|WfpEngineOpen' origin/main -- 'internal/**/*.go' | grep -v oauth_bearer | wc -l
# EXPECT: 0
```

### LANDMINES

- **`numerator: 0, denominator: 100` and `numerator: null, denominator: null` are different claims and must serialise differently.** A metric whose denominator cannot be established emits `null`, never `0` — "a zero count omitted from output, making zero indistinguishable from unreadable" is on the strategy's Avoid list, and the codebase already applies this rule to `adapterIngest` (`ai-response.dto.ts:1708`) and `adaptersTruncatedReported` (`:1864`). **Follow the existing precedent; do not invent a second convention.**
- **`forced-egress` has no producer and must not acquire one here.** Wave 3 Task 6 builds direct-egress denial. Emitting a measured number for it is pretending an external dependency is engineering.
- **Do not make a denominator measurable by lowering what it measures.** If a metric cannot be established, it ships `measured: false`. A metric quietly redefined to something reportable is the same false green in a new costume.
- **No wire widening, no agent change, no enforcement, no machine-root write.** One new array on an existing read response.

### DO NOT

- **Do not serialise a percentage anywhere.** The console computes the ratio; the server never ships a number whose denominator it did not also ship. Test 5 greps the whole response for `%`.
- **Do not add an eighth metric** without changing this task deliberately. The union is closed so a seventh-plus is a compile error at every consumer — the same mechanism that fixed `summary.states`, where three states were "computed and then dropped on the floor" because the field list was hand-written.
- **Do not touch `summary.states`, `summary.adapters`, `legacyIdentityAdapters` or `adaptersTruncatedReported`.** They carry asserted invariants.

### What changes

Add `summary.fleet: FleetRatioDto[]`, where each entry is `{ metric, numerator: number | null, denominator: number | null, freshnessWindowMs: number, measured: boolean, unmeasuredReason: string | null }` — **never a bare percentage.**

| Metric | Measurable now? | Source |
|---|---|---|
| `endpoints-managed` | yes | `attestedProfile` / lane fields on the control-state row |
| `certified-runtime-version` | yes | `versionSatisfiesCertRange` (`runtime-adapter-render.util.ts:711`) over the stored certificate |
| `fresh-canary` | yes | `enforcementProof === 'proven'` per instance, deduped by `runtimeInstanceId` exactly as `EnforcementProofFleetRollup` (`Frontend .../protection-depth.tsx:1065`) does |
| `undecided-invocation-rate` | yes | `runtimeAdapterUndecidableView` (`:604`) rate, with `null` preserved as NOT MEASURED |
| `evidence-gaps` | yes | `adapterIngest.rejected` + Task 5's `droppedKeyPaths` count |
| `prevention-active` | yes (**and it will read 0/N**) | Task 6's posture |
| **`forced-egress`** | **NO** | **no producer exists.** `measured: false`, `unmeasuredReason: 'direct-egress-not-measured'`, `numerator: null`, `denominator: null` |

Type `FleetRatioDto['metric']` over a closed union so an eighth metric is a compile error at every consumer.

### Steps

- [ ] `it('reports forced-egress as unmeasured, never as zero')`: assert the `forced-egress` entry has `measured: false` and `numerator === null`, and **not** `numerator === 0`. Run: RED.
- [ ] `it('ships a denominator with every ratio')`: for every entry, `measured === true` implies both `numerator` and `denominator` are finite non-negative integers and `numerator <= denominator`. Run: RED.
- [ ] `it('dedupes fresh-canary by runtimeInstanceId')`: two adapters on one instance count once. Run: RED.
- [ ] `it('is a compile-time closed set')` — a type-level test asserting `FleetMetric` has exactly seven members. Run: RED.
- [ ] `it('serialises no percentage anywhere in the response')`: `JSON.stringify(response)` contains no `%` character in any `summary.fleet` value or key. Run: RED.
- [ ] Implement. All five GREEN. `ai-query.protection-depth-summary.spec.ts` green unmodified.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: claim a measured zero for forced-egress
cd /c/cwt/w8-t7
# by hand: change the forced-egress entry to
#   { metric: 'forced-egress', numerator: 0, denominator: endpointCount, measured: true,
#     unmeasuredReason: null, freshnessWindowMs: ... }

# Command
npx jest ai-query.protection-depth-denominators -t 'reports forced-egress as unmeasured, never as zero'

# MUST APPEAR (exact string):
#   forced-egress claimed a measured 0/N; no direct-egress producer exists in this build
```

**BLAST RADIUS:** one new array on an existing read response. A wrong denominator shows a wrong ratio on `/admin/endpoints`. Nothing enforces on it. No wire widening, no agent change, no deploy ordering, no machine-root write. The genuine risk is the opposite of the usual one: a metric that reports `measured: true` when it is not — which tests 1 and 2 are aimed at.
**ROLLBACK:** stop projecting `summary.fleet`. One-line revert; no migration, no agent coupling.
**EXIT:** `curl -s -H "$JWT" $API/api/v1/ai/protection-depth | jq '.summary.fleet | length'` returns `7`; `... | jq '[.summary.fleet[] | select(.measured)] | length'` returns `6`; `... | jq '.summary.fleet[] | select(.metric=="forced-egress")'` shows `measured:false`, `numerator:null`, `denominator:null`; `... | jq -r '.summary.fleet' | grep -c '%'` returns `0`; the defeat-test mutation produces its exact string.

---

## Task 8: Put the field-observation ledger on the wire — Backend first, agent second

**Phase 5. THE ORDERING IS THE WHOLE TASK.** Depends on Task 5 being landed **and deployed**, and on Task 3 (the traffic counter this projects).

**Files:**
- **Backend, and DEPLOYED, before any agent work:** `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts` (this file exists **only** in the Backend copy — verified), `Backend/src/ai-governance/runtime-adapter-shape.ts` (accept `fieldObservation` in the rebuild), `Backend/src/ai-governance/runtime-adapter-field-observation.spec.ts` (new)
- **Agent, only after the above is live:** `Installers/internal/fieldobs/fieldobs.go`, `Installers/internal/airuntimeinventory/row.go` (project the ledger onto the report), `Installers/internal/airuntimeinventory/field_observation_test.go` (new)

### PRECONDITIONS

```bash
git -C .../Backend fetch origin && git -C .../Backend rev-parse origin/main
# EXPECT: 0cf9021e944b72ef2a3024e8687f4114db1f2468
git -C .../Installers fetch origin && git -C .../Installers rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# Task 5 has landed. THIS IS NOT OPTIONAL — it is the safety net for this task.
grep -c 'droppedKeyPaths' src/ai-governance/runtime-adapter-shape.ts
# EXPECT: >= 1. If 0: STOP AND REPORT. Task 5 must land and DEPLOY before this task starts.

# Task 3 has landed (Route.Traffic is what you project).
grep -c 'Traffic' /c/cwt/.../Installers/internal/fieldobs/fieldobs.go
# EXPECT: >= 1. If 0: STOP AND REPORT.

# The silent-drop mechanism is unchanged — this is why the order matters.
git -C .../Backend show origin/main:src/health/types/heartbeat.types.ts | sed -n '810p'
# EXPECT:   runtimeAdapters?: unknown[];

# The contract file really is Backend-only.
ls /c/Users/Owner/Documents/Ceragon/packages/shared-contracts/src/runtime-adapter-contract.ts 2>&1
# EXPECT: No such file or directory

# The ledger carries no content — verify before widening anything.
git -C .../Installers show origin/main:internal/fieldobs/fieldobs.go | sed -n '87,110p'
# EXPECT: Checkpoint and Route structs holding only ids, counts and timestamps
```

**BEFORE the agent half, this precondition is a hard stop:**

```bash
# The Backend half must be LIVE, not merely merged.
curl -s -H "$JWT" $API/api/v1/health | jq -r '.version'      # note the deployed build
curl -s -H "$JWT" $API/api/v1/health/agent-wire-drift | jq '.RuntimeAdapterReport'
# Then POST a hand-crafted heartbeat carrying fieldObservation and re-read:
curl -s -H "$JWT" $API/api/v1/ai/protection-depth | jq '.endpoints[0].adapters[0].fieldObservation'
# EXPECT: the block round-trips (non-null). If it is null or the drift counter shows a
#         drop under RuntimeAdapterReport.fieldObservation, the Backend is NOT deployed.
#         STOP AND REPORT. Do not ship the agent half.
```

### LANDMINES

- **Widening an agent-wire contract requires the Backend deployed FIRST.** `EndpointControlsDto.runtimeAdapters` is `unknown[]` (`heartbeat.types.ts:810`), so an agent that ships this field first is **not** rejected — `normalizeRuntimeAdapterReportOutcome` (`runtime-adapter-shape.ts:1221`) rebuilds field-by-field from an allowlist and the unknown key vanishes with `reasons: []`. **No error, no data, and the agent's own `hooks-status` reads fine.** `Installers/cmd/devoid/ai.go:652-660` already documents this as the reason the undecidable counter's wire half was deferred. Task 5 must be **deployed** first so that if this ordering is ever violated the loss shows up as a counted `droppedKeyPaths` entry instead of nothing.
- **A deploy needs a fresh, explicit ask from the owner every time.** Merging is not deploying and a green local run is not permission. That ask is a checklist item below, not something you infer.
- **Absence is NOT MEASURED, never zero.** A 7.10.6 agent sends nothing; the consumer must render "not reported". Defaulting to `{traffic: 0, decisions: 0}` manufactures a measurement that never happened — the exact false green this wave exists to remove.
- **Do not roll the Backend back below an agent that is already shipping the field.** That recreates the silent drop.
- **Content-free means content-free.** The ledger holds closed-vocabulary ids, counts and RFC3339 timestamps only (`fieldobs.go:87-110`). No paths, no prompts, no tokens. Test 5 is a sweep over the marshalled JSON that proves it.
- **This writes nothing new under the machine root.** The ledger already lives where `fieldobs` writes it. If your change adds a machine-root entry, the SAME COMMIT must add it to `boundaryChildNames` (`cmd/devoid-msi-root-guard/guard_windows.go:624`) with the matching `createBoundaryChildren` entry, or the next MSI operation dies with `machine root contains unknown entry` (`:1086`) -> 1722 -> 1603, **rolling back the upgrade on every ENROLLED endpoint while every clean-box test stays green** — because a clean box has no such directory to trip on. `.staging`, `aitrust` and `endpoint-identity.json` each did this.

### DO NOT

- **Do not ship the agent half before the Backend half is deployed and round-trip-verified**, under any schedule pressure. This ordering is the task.
- **Do not add `@ValidateNested` to `runtimeAdapters`** to "make the drop loud". Its doc says why not.
- **Do not default an absent `fieldObservation` to a zeroed block** anywhere — Backend, agent, or console.
- **Do not widen the block beyond the caps** (16 checkpoints, 2 providers, matching the existing `RUNTIME_ADAPTER_MAX_*` bounds).

### What goes on the wire

A content-free `fieldObservation` block per adapter report: `{ checkpoints: [{event, effect, lastAt, count}], route: {provider, traffic, decisions, firstAt, lastAt} }`.

Why it matters: without it the console cannot render "hook observed 3 minutes ago" or "this route carried traffic and decided nothing", which are two of the strategy's named evidence-basis lines, and Task 6's posture must fall back to the endpoint's self-report for observation — the exact provenance laundering `NO_QUALIFYING_ENFORCEMENT_PROOF` (`runtime-adapter-render.util.ts:313`) exists to prevent.

### Steps

- [ ] **Backend first.** `runtime-adapter-field-observation.spec.ts` — `it('stores a field-observation block')`, `it('treats absence as null, never as zero')`, `it('bounds the checkpoint list and counts the overflow')`, `it('rejects a provider outside the closed vocabulary without rejecting the report')`. All RED, then GREEN.
- [ ] Backend parity spec updated for `Backend/packages/shared-contracts/` **only** — see Task 1's LANDMINES on why the workspace-root copy is not a target for these two contracts.
- [ ] Commit the Backend half with explicit paths.
- [ ] **Owner asks for a Backend deploy. Confirm the new ECS task definition is live** and that `GET /api/v1/ai/protection-depth` round-trips a hand-crafted heartbeat carrying the block (the hard-stop precondition above). **This is a fresh explicit ask; a green local run is not permission and merging is not deploying.**
- [ ] **Agent second.** `field_observation_test.go` — assert the projected block equals `fieldobs.Load(dir)` for a seeded ledger, and that an unreadable ledger yields the field **absent**, never a zeroed block. RED then GREEN.
- [ ] `it('carries no path, no prompt and no token')` — a sweep over the marshalled JSON asserting every string value matches a closed vocabulary member, a hex id, or an RFC3339 timestamp. RED then GREEN.
- [ ] Commit the agent half with explicit paths.

### DEFEAT TEST

```bash
# Mutation: default an absent block to zeros
cd /c/cwt/w8-t8-backend
# by hand: in the normalizer, when fieldObservation is absent set
#   { checkpoints: [], route: { traffic: 0, decisions: 0 } }

# Command
npx jest runtime-adapter-field-observation -t 'treats absence as null, never as zero'

# MUST APPEAR (exact string):
#   an agent that does not report observations must not be recorded as having observed zero
```

Second defeat, on the content-free guarantee:

```bash
cd /c/cwt/w8-t8-installers
# Mutation: add a filesystem path to a checkpoint record
go test ./internal/airuntimeinventory/ -run TestFieldObservationCarriesNoContent -v
# MUST APPEAR: field-observation block carried a value that is not a vocabulary id,
#              a hex id or an RFC3339 timestamp
```

**BLAST RADIUS:** heartbeat payload grows by a bounded block (16 checkpoints, 2 providers). **If the Backend half is not deployed first, the field is silently dropped and the console shows nothing new — degraded, not broken, and now counted thanks to Task 5.** If the Backend half is deployed and the agent never ships, the field is absent and every consumer must treat absence as NOT MEASURED, never as zero. No enforcement branch, no machine-root write, no schema migration on the agent side.
**ROLLBACK:** revert the agent projection; the Backend keeps accepting a field nobody sends, which is inert. **Do NOT roll the Backend back below an agent that is already shipping the field** — that recreates the silent drop.
**EXIT:** a heartbeat from a 7.10.7+ agent lands a non-null `fieldObservation` on the control-state row (`curl … | jq '.endpoints[].adapters[].fieldObservation'` non-null); a heartbeat from 7.10.6 lands `null` and the console renders "not reported"; `curl -s -H "$JWT" $API/api/v1/health/agent-wire-drift | jq '.RuntimeAdapterReport.fieldObservation'` shows **zero** drops after the deploy — **the positive proof that the ordering held**; both defeat-test mutations produce their exact strings.

---

## Task 9: Compose the daemon's own posture, and stop anything reading open `/health` as governance

**Phase 5.** Depends on Task 1 (vocabulary) and Task 6 (the rule this is a declared subset of).

**RECONCILIATION §2 D5 — Task 6 is authoritative for the posture composition rule.** This wave shares the *vocabulary* file but would otherwise implement the *rule* twice, in Go and in TypeScript: exactly the Go/JS parity problem Wave 1 warns about. **The decision: the local posture is a declared STRICT SUBSET of Task 6's rule, and the subset relation is pinned by a test.** The daemon cannot see server-held receipts, so it evaluates fewer gates; it must therefore never be *less* pessimistic than the server. Concretely: every reason the server would emit for a given input, the daemon emits too or emits a superset; the daemon never emits `PREVENTION_ACTIVE` where the server would not. Write that as a test over a shared fixture table, not as a comment.

**Files:**
- `Installers/internal/coveragetruth/posture.go` (extend with the local composition, sharing Task 1's vocabulary)
- `Installers/internal/coveragetruth/posture_subset_test.go` (new — the D5 subset pin)
- `Installers/internal/daemon/server.go` (`handleHealthDetail`, `:1388` — add one key)
- `Installers/internal/daemon/health_governance_posture_test.go` (new)
- `Installers/install-scripts/production/install.ps1` (`Get-DevoidDaemonHealthState`, `:2741`), `install.sh` (`devoid_daemon_health_check`, `:171`)

### PRECONDITIONS

```bash
git -C .../Installers fetch origin && git -C .../Installers rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# Task 1 landed.
test -f internal/coveragetruth/posture.go && echo present   # EXPECT: present

# Task 6 landed (you are pinning a subset of its rule).
test -f /c/cwt/.../Backend/src/ai-governance/services/coverage-posture.util.ts && echo present
# If ABSENT: STOP AND REPORT. There is nothing to be a subset of.

# The open body is exactly five keys and pinned. Run the guard FIRST and confirm GREEN.
git -C .../Installers show origin/main:internal/daemon/server.go | sed -n '1318p'
# EXPECT: var healthLivenessKeys = []string{"status", "daemon", "version", "wireProxy", "uptime"}
go test ./internal/daemon/ -run TestHealthOpenBody_ExactlyLivenessKeys -v
# EXPECT: PASS. If it is already red, STOP AND REPORT — do not start on a broken guard.

# The token-gated detail route exists and carries no composed verdict.
git -C .../Installers show origin/main:internal/daemon/server.go | sed -n '1388p'
# EXPECT: func (s *Server) handleHealthDetail(w http.ResponseWriter, r *http.Request) {

# The installers read only two keys off the open body.
git -C .../Installers show origin/main:install-scripts/production/install.sh | sed -n '174,175p'
# EXPECT: two grep -o lines extracting "daemon" and "version" — and NOTHING else.
git -C .../Installers show origin/main:install-scripts/production/install.ps1 | sed -n '2751,2752p'
# EXPECT: $DaemonId = $healthJson.daemon / $DaemonVersion = $healthJson.version
# (an earlier revision of this file claimed they also read wireProxy — they DO NOT)
```

### LANDMINES

- **The open `/health` body STAYS EXACTLY FIVE KEYS. Do not add a posture field to it.** `handleHealth`'s doc (`server.go:1345-1358`, the sentence at `:1354`) records that publishing posture to any local process is the **reconnaissance step before acting unreported** — including a process an AI agent spawned — which is what DF-72 removed. `TestHealthOpenBody_ExactlyLivenessKeys` is the guard. **Never weaken an existing guard to make a task fit.** If your implementation makes that test red, your implementation is wrong.
- **The subset relation is a pin, not a comment.** D5 exists because a rule implemented twice diverges. Write the fixture table, run both sides against it, assert the subset relation.
- **This task changes two installer log strings.** They must be pinned by the existing `install_hook_parity_contract_test.go` pattern so the failure mode of a mistake is a **red gate**, not a bad install.
- **This adds no fail-closed branch.** The daemon's posture is reported on a token-gated read route. It gates nothing, denies nothing, and delays nothing. A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent.
- **This writes nothing under the machine root.** No new file, directory or marker. If your change adds one, the SAME COMMIT must add it to `boundaryChildNames` (`guard_windows.go:624`) or the next MSI operation dies 1722 -> 1603 on every enrolled endpoint while every clean-box test stays green.
- **No agent-wire widening, no Backend deploy ordering.** `/v1/health/detail` is a token-gated loopback route on the daemon.

### DO NOT

- **Do not modify `TestHealthOpenBody_ExactlyLivenessKeys`.** It must be byte-for-byte unmodified and green at the end of this task.
- **Do not add `governancePosture` to the open body**, not even behind a flag, an env var or a build tag.
- **Do not re-implement the composition rule.** Import the vocabulary from Task 1 and implement a declared subset of Task 6's gate list, pinned by the subset test.
- **Do not touch `install.ps1:2751-2752` or `install.sh:174-175`** — the two-key read is correct and out of scope. You are changing the **success log line**, not the parser.

### What changes, and what deliberately does not

Add `resp["governancePosture"]` to the **token-gated** `/v1/health/detail`, computed by the local subset composition and emitting slugs from the same frozen vocabulary as Task 6. Today that route returns eleven independent posture blocks and no verdict over them; a reader must compose it themselves, which nobody does.

Then fix the *claim* at the consumers: `install.ps1` and `install.sh` currently log a successful `/health` probe as reachability. Change the success line to name what was and was not established — `"daemon reachable (liveness only; governance posture is not readable without a capability token)"`.

### Steps

- [ ] Run the **existing** `TestHealthOpenBody_ExactlyLivenessKeys` and confirm it is green. It must remain green, **byte-for-byte unmodified**, at the end of this task. If it goes red, the task was implemented wrongly.
- [ ] `TestLocalPostureIsAStrictSubsetOfTheServerRule` (the D5 pin): a shared fixture table of gate inputs; for each, assert the local reason set is a superset of the server's for the gates the daemon can evaluate, and that the local state is never `PREVENTION_ACTIVE` where the server's is not. Run: RED.
- [ ] `TestHealthDetailCarriesGovernancePosture`: assert the token-gated body contains `governancePosture` with a `state` from the six-value vocabulary and a `reasons` array. Run: RED.
- [ ] `TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary`: seed a daemon with no canary receipt, assert `state != "PREVENTION_ACTIVE"` and `reasons` contains `canary-never-run`. Run: RED.
- [ ] `TestHealthDetailPostureUsesTheSharedVocabulary`: every emitted slug is a member of the `coverage-posture.v1.json` reason list, read from the vector — not re-typed. Run: RED.
- [ ] `TestInstallScriptsDoNotClaimGovernanceFromLiveness` (in `install-scripts/production/`): assert neither script contains a success string asserting governance in the `/health`-probe branch, and both contain the liveness-only wording. Run: RED.
- [ ] Implement. All five new tests GREEN, the open-body test untouched and green.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: default the local canary gate to satisfied when no receipt is present
cd /c/cwt/w8-t9
# by hand: in the local composition, remove the
#   if !localCanaryReceiptPresent { reasons = append(reasons, "canary-never-run") }
# branch

# Command
go test ./internal/daemon/ -run TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary -v

# MUST APPEAR (exact string):
#   local posture read PREVENTION_ACTIVE with no canary receipt on this endpoint
```

Second defeat, on the guard that must not move:

```bash
# Mutation: add "governancePosture" to healthLivenessKeys and to the open body
go test ./internal/daemon/ -run TestHealthOpenBody_ExactlyLivenessKeys -v
# MUST FAIL. If this passes, the guard has been weakened and the task is wrong.
# Revert the mutation; do not "fix" the guard.
```

Third defeat, on the D5 subset pin:

```bash
# Mutation: make the local composition drop the session-dimension reason
go test ./internal/coveragetruth/ -run TestLocalPostureIsAStrictSubsetOfTheServerRule -v
# MUST APPEAR: local posture omitted a reason the server rule emits: session-dimension-unavailable
```

**BLAST RADIUS:** one new key on a token-gated route (a client that does not know it ignores it) and two install-script log strings. The open five-key body and the two-key installer parsers are untouched. The parity contract test pins the new wording, so the failure mode of a mistake here is a **red gate, not a bad install**. No enforcement, no wire, no machine-root write, no Backend, no deploy.
**ROLLBACK:** delete the `governancePosture` key and revert the two log strings. Nothing depends on either; no migration, no deployed dependency.
**EXIT:** `curl -s -H "X-Devoid-Token: $TOK" localhost:19280/v1/health/detail | jq -r .governancePosture.state` returns a vocabulary member on a real box; `curl -s localhost:19280/health | jq -c 'keys'` still returns exactly `["daemon","status","uptime","version","wireProxy"]`; `go test ./internal/daemon/ -run TestHealthOpenBody_ExactlyLivenessKeys` green with the file unmodified (`git diff --stat origin/main -- internal/daemon/health_open_body_test.go` empty); local and backend posture emit slugs from one file, asserted by a test on each side against the same vector; all three defeat-test mutations behave as stated.

---

## Task 10: Render per-host × per-surface posture in the console, with no rolled-up green

**Phase 5.** Depends on Tasks 6, 7 and 8. **Task 11's gate commands must have been run and observed RED before this task starts.**

**Files:**
- `Frontend/app/ai-control-plane/coverage-posture.tsx` (new)
- `Frontend/app/ai-control-plane/protection-depth.tsx` (add the posture badge to `AdapterCard` at `:2419` and the endpoint drill)
- `Frontend/app/admin/endpoints/coverage-section.tsx` (`:1756` — add the fleet ratio strip beside `RuntimeProtectionDepthPanel`)
- `Frontend/types/ai-governance.ts` (the ambient mirror the harness README warns about)
- `Frontend/app/ai-control-plane/__tests__/coverage-posture.test.tsx` (new)

### PRECONDITIONS

```bash
git -C .../Frontend fetch origin && git -C .../Frontend rev-parse origin/main
# EXPECT: cac574ae063b4e91ec38ddb205ec5abe4cbc3dff

# The mount points are where the task says.
git -C .../Frontend show origin/main:app/admin/endpoints/coverage-section.tsx | sed -n '1756p'
# EXPECT: to contain <RuntimeProtectionDepthPanel />
git -C .../Frontend show origin/main:app/ai-control-plane/protection-depth.tsx | sed -n '829p;1065p;1630p;2419p'
# EXPECT: export function resolveEnforcementProof( / export function EnforcementProofFleetRollup({
#         export function SurfaceCertificateDims({ / export function AdapterCard({ adapter }...

# The existing guard suites are green BEFORE you start.
cd Frontend && npm test -- protection-depth
# EXPECT: PASS. If already red, STOP AND REPORT.

# Task 11's scenarios exist and its gates are RED (that RED is the proof this task is needed).
node scripts/render-harness/shoot.cjs --scenario posture-unmeasured --routes admin/endpoints \
  --strict --retries 0 --forbid "Prevention Active||PREVENTION_ACTIVE||0%||100%" \
  --expect "not measured||not reported"; echo "exit=$?"
# EXPECT: exit=1 with a missing-text failure. If it is already exit=0, either Task 11 has
# not landed or the console already renders this — STOP AND REPORT either way.

# Open the real types FIRST. The README says six invented fixture shapes cost most of a day.
sed -n '1,40p' types/ai-governance.ts
```

### LANDMINES

- **A wrong badge misleads an administrator, which is precisely the harm this wave exists to remove.** Task 11 gates it; do not treat the gate as optional.
- **A state with reasons the reader cannot see is a roll-up in a different shape.** The reason list goes on the card, expanded, not behind a tooltip or a hover.
- **A fixture that omits a required field crashes the console, and the crash looks exactly like a product bug.** The harness README names this: six invented shapes cost most of a day the last time this was built. Build from `types/ai-governance.ts`, not from memory of the DTOs.
- **Absence is NOT MEASURED.** `fieldObservation: null` (a 7.10.6 agent) must render "not reported", never `0 decisions`. `forced-egress` renders "not measured", never a red `0%` and never omitted.
- **Calm design is a constraint, not a preference.** Signal tokens, neutral surfaces, no bright colours, no emoji, no gradients. State the fact; never the in-house rationale for why we built it that way.
- **No enforcement, no wire, no store, no machine-root write.** One console panel.

### DO NOT

- **Do not touch `resolveEnforcementProof` (`:829`) or `EnforcementProofFleetRollup` (`:1065`).** They are guards with three ways out and none of them upward.
- **Do not modify any existing protection-depth suite.** `protection-depth-truth-signals`, `protection-depth-identity-and-accounting` and `f38-enforcement-proof` are **guards, not obstacles**. `npm test -- protection-depth` must stay green **unmodified**.
- **Do not write a second projection of the surface certificate dimensions.** `SurfaceCertificateDims` (`:1630`) already renders the seven with "not reported" for a null. Reuse it.
- **Do not render a bare percentage anywhere.** Every ratio renders as `n / d` with its freshness window.
- **Do not roll two hosts into one badge**, ever, including "for readability".

### What it must show

Per host and per surface, never rolled up:

- The posture badge, with its reason list expanded on the card.
- The evidence basis beside the state, in the strategy's own phrasing: "hook observed 3 minutes ago", "2 undecided invocations in the last hour", "route carried 4 requests and 0 decisions", "desktop binary 0.147.0, certificate …, expires …". Every one of these is a field this wave puts on the wire or the server already holds.
- The seven fleet ratios as `numerator / denominator` with the freshness window, and `forced-egress` rendered as "not measured".
- Drill from the runtime summary to the exact host, binary hash, route, capability and evidence, reusing `SurfaceCertificateDims`.

### Steps

- [ ] `it('renders the reason list, not just the state')`: a `DEGRADED` fixture with three reasons renders all three visibly. Run: RED.
- [ ] `it('renders forced-egress as not measured, never as 0%')`: assert the strip contains `not measured` and does **not** contain `0%` for that metric. Run: RED.
- [ ] `it('never renders a percentage without its denominator')`: for every ratio, assert the rendered text contains the `n / d` form. Run: RED.
- [ ] `it('does not roll up two hosts into one badge')`: two endpoints with different postures render two badges. Run: RED.
- [ ] `it('renders absent observation as "not reported", never as zero')`: `fieldObservation: null` must not render `0 decisions`. Run: RED.
- [ ] Implement. All five GREEN. `npm test -- protection-depth` green **unmodified**.
- [ ] Verify every render surface by hand, per the harness README's own gap note: `grep -rn "posture\|fleet\|fieldObservation" app/ components/ --include=*.tsx` — **not only the files you edited**. A grep census cannot see JSX-wrapped copy, so also drive the browser to `/admin/endpoints` itself.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: default fieldObservation to a zeroed block in the view model
cd /c/cwt/w8-t10
# by hand: in coverage-posture.tsx, replace
#   const obs = adapter.fieldObservation ?? null
# with
#   const obs = adapter.fieldObservation ?? { route: { traffic: 0, decisions: 0 }, checkpoints: [] }

# Command
npm test -- coverage-posture -t 'renders absent observation as "not reported", never as zero'

# MUST APPEAR (exact string):
#   an unreported observation rendered as a measured zero
```

Second defeat, run from Task 11's gate:

```bash
# Mutation: render forced-egress as 0%
node scripts/render-harness/shoot.cjs --scenario posture-unmeasured --routes admin/endpoints \
  --strict --retries 0 --forbid "Prevention Active||PREVENTION_ACTIVE||0%||100%" \
  --expect "not measured||not reported"; echo "exit=$?"
# MUST APPEAR: FAIL forbidden-text: "0%"   and   exit=1
```

**BLAST RADIUS:** one console panel. A wrong badge misleads an administrator — the harm this wave exists to remove, hence the Task 11 gate. No enforcement, no wire, no store, no machine-root write, no Backend, no deploy.
**ROLLBACK:** remove the new component's mount points at `coverage-section.tsx:1756` and in `AdapterCard`; `protection-depth.tsx`'s existing components are untouched by construction, so the revert is two mount-point deletions plus one new file.
**EXIT:** `/admin/endpoints` shows one posture badge per (host × surface) with its full reason list; the fleet strip shows seven `n / d` ratios with `forced-egress` reading "not measured"; five new tests green; `npm test -- protection-depth` green with `git diff --stat origin/main -- app/ai-control-plane/__tests__/` showing only the new file; both defeat-test mutations produce their exact strings.

---

## Task 11: Gate console truth with the render harness, as a repeatable run

**Phase 5.** **Its gates must run RED before Task 10 and GREEN after** (RECONCILIATION §3, item 15). Depends on Tasks 6, 7 and 8 for the wire shapes the fixtures mimic.

**Files:**
- `Frontend/scripts/render-harness/fixtures.cjs` (two new scenarios)
- `Frontend/scripts/render-harness/README.md` (scenario table + the new gate)
- `Frontend/scripts/render-harness/coverage-truth-gate.md` (new — the runnable command block and its expected verdicts)

### PRECONDITIONS

```bash
git -C .../Frontend fetch origin && git -C .../Frontend rev-parse origin/main
# EXPECT: cac574ae063b4e91ec38ddb205ec5abe4cbc3dff

# The harness is where and what the task says.
git -C .../Frontend ls-tree --name-only origin/main scripts/render-harness/
# EXPECT: README.md, fixtures.cjs, shoot.cjs, stub-backend.cjs
for f in fixtures.cjs shoot.cjs stub-backend.cjs README.md; do
  echo -n "$f "; git -C .../Frontend show origin/main:scripts/render-harness/$f | wc -l; done
# EXPECT: fixtures.cjs 870 / shoot.cjs 635 / stub-backend.cjs 225 / README.md 224

# The six existing scenarios and the separate-claims rule.
git -C .../Frontend show origin/main:scripts/render-harness/fixtures.cjs | sed -n '15,22p'
# EXPECT to list populated / empty-tenant / absent-data / read-failed / slow, and to contain:
#   `empty-tenant` and `absent-data` are different claims and must never share copy

# PROVE THE HARNESS CAN STILL FAIL before trusting any result.
cd Frontend
node scripts/render-harness/shoot.cjs --routes no-such-route; echo "exit=$?"
# EXPECT: exit=1 with doc-status + blank failures
node scripts/render-harness/shoot.cjs --scenario broken-fixture --routes coding-ai/detections; echo "exit=$?"
# EXPECT: exit=1 with never-settled
# IF EITHER GOES GREEN, STOP. A harness that cannot fail proves nothing.

# Open the real types FIRST.
sed -n '1,40p' types/ai-governance.ts
```

### LANDMINES

- **A fixture that omits a required field crashes the console, and the crash looks exactly like a product bug.** The README names this in place: six invented shapes cost most of a day the last time this was built. Open `Frontend/types/ai-governance.ts` **first** and build both scenarios from the real types.
- **`--strict` is not optional.** It fails a shot when the console asks for a path no scenario answers — i.e. when the screen is sitting on data nobody chose. Without it a green run can mean the screen quietly rendered from an unmodelled path.
- **`--retries 0` is not optional.** A forbidden string is a fact about the console and must be reported on the first attempt. A retry turns a deterministic finding into a flake.
- **Record the harness's stated limits verbatim in any report built on this run**, because they are real: nothing here talks to a real Backend, so a green run says the console renders honestly *given that wire state* and says nothing about whether any Backend produces it; there is no live-update channel; it drives `next dev`, not a production build. **Do not round "the screen looked right" up to "the feature works."**
- **Zero product code changes in this task.** Fixtures and documentation only. If you find yourself editing a component to make a gate pass, you are in Task 10.

### DO NOT

- **Do not modify the six existing scenarios.** Add two; leave `populated`, `empty-tenant`, `absent-data`, `read-failed`, `slow` and `broken-fixture` untouched.
- **Do not let `posture-unmeasured` and `posture-degraded` share copy** with each other or with `empty-tenant` / `absent-data`. That is the README's own rule and it is the point of the scenarios.
- **Do not drop `--strict` or raise `--retries`** to get a green run.
- **Do not edit any component, DTO or type** from this task.
- **Do not report a green harness run as "the feature works."**

### The two new scenarios

- **`posture-unmeasured`** — every endpoint present and attesting, every *optional* measurement omitted: `posture: null`, `fieldObservation: null`, `undecidable: null`, `summary.fleet` entries all `measured: false`. **A zero, a percentage, or the string "Prevention Active" anywhere on this screen is a finding.**
- **`posture-degraded`** — endpoints with real postures, non-empty reason lists, a `forced-egress` entry that is `measured: false`, and one endpoint whose `posture.state` is `UNKNOWN`. The screen must distinguish UNKNOWN from DEGRADED **in copy, not only in colour**.

### The gate, as one runnable command per scenario

```bash
# governance may never read green over an unmeasured wire state
node scripts/render-harness/shoot.cjs --scenario posture-unmeasured \
  --routes admin/endpoints --strict --retries 0 \
  --forbid "Prevention Active||PREVENTION_ACTIVE||0%||100%" \
  --expect "not measured||not reported"; echo "exit=$?"
# BEFORE Task 10: exit=1 with FAIL missing-text
# AFTER  Task 10: exit=0

# unknown and degraded must not share copy
node scripts/render-harness/shoot.cjs --scenario posture-degraded \
  --routes admin/endpoints --strict --retries 0 \
  --expect "UNKNOWN||DEGRADED||not measured" \
  --forbid "Prevention Active"; echo "exit=$?"
# BEFORE Task 10: exit=1 with FAIL missing-text
# AFTER  Task 10: exit=0
```

### Steps

- [ ] Run the README's two standing checks (the PRECONDITIONS above). If either goes green, stop.
- [ ] Add `posture-unmeasured`, built from `types/ai-governance.ts`. Run the first gate **before** Task 10 lands: it must FAIL on `missing-text`. **That failure is the RED**; record the exact output.
- [ ] Add `posture-degraded`. Run the second gate: FAIL on `missing-text`. Record it.
- [ ] After Task 10, both gates exit 0. Bank `.txt` and `.json` per route.
- [ ] Write `coverage-truth-gate.md` with the commands, the expected verdicts before and after Task 10, the banked evidence paths, and the harness's limits restated in its own words.
- [ ] Commit with explicit paths.

### DEFEAT TEST

```bash
# Mutation: revert Task 10's fleet strip so forced-egress renders 0%
cd /c/cwt/w8-t11
# by hand, in the Task 10 worktree: render the forced-egress ratio as `0%`

# Command
node scripts/render-harness/shoot.cjs --scenario posture-unmeasured \
  --routes admin/endpoints --strict --retries 0 \
  --forbid "Prevention Active||PREVENTION_ACTIVE||0%||100%" \
  --expect "not measured||not reported"; echo "exit=$?"

# MUST APPEAR (exact strings):
#   FAIL forbidden-text: "0%"
#   exit=1
```

Second defeat, on the harness itself (prove it can fail before trusting it):

```bash
node scripts/render-harness/shoot.cjs --routes no-such-route; echo "exit=$?"
# MUST APPEAR: exit=1
# If this is exit=0 the harness is inert and every green result above is meaningless.
```

**BLAST RADIUS:** test fixtures and documentation. **Zero product code.** No enforcement, no wire, no store, no machine-root write, no Backend, no deploy. The one hazard is a malformed fixture crashing the console during a run and being mistaken for a product bug — bounded by building both scenarios from `types/ai-governance.ts`.
**ROLLBACK:** delete the two scenarios and `coverage-truth-gate.md`. The existing six scenarios and the README's existing table are untouched.
**EXIT:** `node -e "console.log(Object.keys(require('./scripts/render-harness/fixtures.cjs').scenarios).length)"` returns `8`; both gate commands exit 0 against the shipped console and exit 1 against the reverted mutation; `coverage-truth-gate.md` exists and names the banked `.txt` evidence path; the harness's two standing self-checks both exit 1.

---

## Wave exit criteria

1. **The vocabulary is one file.** `Installers/parity-vectors/coverage-posture.v1.json` holds exactly 6 states and 24 reason slugs (`jq '.states|length, .reasons|length'` -> `6`, `24`); a Go test and a TS parity spec both assert equality with it, in order; `cmp` against the Backend vendored copy exits 0. *Defeat: delete `"CONTAINED"` from the vector -> `posture states diverged from the vector: TS has CONTAINED, vector does not`.* (Task 1)
2. **`PREVENTION_ACTIVE` is impossible without a recent canary and a valid capability certificate**, and the equivalence `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` holds over a generated matrix of at least 256 gate combinations. *Defeat: `never returns PREVENTION_ACTIVE while direct egress is unmeasured`.* (Task 6) — this is the strategy's Phase 3 gate, met.
3. **Zero endpoints in the production tenant read `PREVENTION_ACTIVE`**, and every one names both `direct-egress-not-measured` and `session-dimension-unavailable` among its reasons. Verify: `curl -s -H "$JWT" $API/api/v1/ai/protection-depth | jq '[.endpoints[].adapters[].posture.state]|unique'`. **A run that produces a green endpoint before the Wave 3 WFP task lands is a defect in this wave, not a success.** (Task 6)
4. **No `[OK]` over an undecided count on either lane.** `devoid ai hooks-status codex; echo "exit=$?"` gives `exit=1` on undecided > 0, vendor-discarded > 0, or an unreadable counter, and the Claude and Codex verdict lines carry identical clause text. *Defeat: `TestCodexVerdictIsNotOKOverUndecidedInvocations`.* (Task 2)
5. **A route that carried traffic and decided nothing says so.** `Route.Traffic` moves independently of `Route.Decisions`, and the string "no request has ever travelled this route" is unreachable when traffic > 0. *Defeat: `TestRouteStatusSaysTrafficUngoverned`.* (Task 3)
6. **A truncated inventory walk cannot log "complete."** `devoid ai reconcile 2>&1 | grep -i 'inventory sweep'` on a pruned tree emits `INCOMPLETE` and never `complete`. *Defeat: `TestUserSweepDoesNotSayCompleteOnATruncatedWalk`.* (Task 4)
7. **Field-level agent-wire loss is counted and persisted**, so a future ordering mistake is visible rather than silent: one mistyped optional field inside a valid adapter report produces a non-empty `droppedKeyPaths` on the row and a non-zero count at `GET /api/v1/health/agent-wire-drift`, and **zero heartbeats are rejected**. *Defeat: `reports a mistyped undecidable block as a dropped key path`.* (Task 5) — **and this is the first Backend change in the whole programme.**
8. **Every fleet number ships its denominator.** `summary.fleet` has exactly 7 entries; no percentage is serialised (`jq -r '.summary.fleet' | grep -c '%'` -> `0`); `forced-egress` is `measured: false` with null numerator and denominator. *Defeat: `reports forced-egress as unmeasured, never as zero`.* (Task 7)
9. **The open `/health` body is still exactly five keys**, unchanged, with its pinning test green and **unmodified** (`git diff --stat origin/main -- internal/daemon/health_open_body_test.go` empty) — while `/v1/health/detail` carries a composed `governancePosture` using the same vocabulary as the Backend, pinned as a declared strict subset of Task 6's rule. *Defeat: `TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary`; guard: the untouched `TestHealthOpenBody_ExactlyLivenessKeys`; subset pin: `TestLocalPostureIsAStrictSubsetOfTheServerRule`.* (Task 9)
10. **The console can be driven to a wire state where nothing is measured and produces no green.** Both render-harness gate commands exit 0 against the shipped console and exit 1 against the reverted mutation, with banked `.txt` evidence, and both harness self-checks exit 1. (Tasks 10, 11)
11. **Ordering held.** After the Task 8 agent release, `curl -s -H "$JWT" $API/api/v1/health/agent-wire-drift | jq '.RuntimeAdapterReport.fieldObservation'` shows zero drops — the **positive proof** that the Backend was deployed first. (Tasks 5, 8)
12. **Release sequencing held.** Task 6 shipped in its own release, with a release note, **before** W5 T4 and W4 T8. Verify by release tag order. (RECONCILIATION §4 R7)

**Not an exit criterion of this wave, stated so nobody claims it:** "Overall technological architecture 8.5 -> 9.5" is a **programme-level gate owned by no single wave**, and "production evidence convergence" / "production proof" — required clauses of the Enterprise readiness row — are owned by **no wave at all**. Every artefact this wave produces is a local-rig or unit-level measurement.

---

## What this wave deliberately does NOT do

**It adds no enforcement branch anywhere.** Every task changes what is *reported*, what a *read route* returns, or what an *exit code* says. Nothing changes what any endpoint permits or denies. That is deliberate: a fail-closed checkpoint on an unprovable condition bricked a machine in July 2026 and the operator removed the agent, and an uninstalled control protects nobody. Coverage truth is a reporting problem and it is solved with reporting.

**It writes nothing new under the machine root.** No task adds a file, directory or marker there, so no task needs a `boundaryChildNames` entry in `cmd/devoid-msi-root-guard/guard_windows.go:624`. This is stated because the guard has fired three times on other people's changes — `.staging`, `aitrust`, `endpoint-identity.json` — always invisibly in CI, because a clean box has no such entry to trip on and the failure only reaches an **enrolled** endpoint's next upgrade as 1722 -> 1603 -> full rollback. If any task here grows a machine-root write, that write and its allowlist entry ship in the **same commit** or the task is wrong.

**The one behaviour change is an exit code** — `devoid ai hooks-status codex` — and its blast radius is bounded and known: `install.sh:583-585` sets `AI_GOVERNANCE_STATE="gap"` and **returns 0**, so no install fails. A fresh box does not go red because `UndecidableCounterNeverWritten` counts as measured (`internal/security/ai_hook_undecidable.go:98-111`).

**It does not weaken `RuntimeAdapterRenderState`.** An undecided count does not demote `observed` to something else in the existing eight-state vocabulary. That vocabulary is consumed by six Frontend suites and a compile-error-on-a-ninth-state invariant; mutating it to carry a new gate would put the new logic behind an existing guard. The posture composition is **additive and parallel** — one derivation, two independent axes, exactly as `deploymentAssurance` is already kept an independent axis rather than fused into the state badge.

**It does not open the `/health` body.** SOT §14.3's finding is real, but widening the open body publishes governance posture to any local process — including one an AI agent spawned — which is the reconnaissance step DF-72 removed. The strongest safe subset is: leave the five-key liveness document alone, put the composed verdict behind the existing token gate, and fix the *consumers' claim*. `TestHealthOpenBody_ExactlyLivenessKeys` must be green and **unmodified** at the end of this wave.

**It cannot make "% with forced egress" measurable.** No WFP / direct-egress denial code exists in Installers `origin/main` — that is Wave 3 Task 6's build. Writing a task here that emits a forced-egress number would be pretending an external dependency is engineering. The metric ships as `measured: false` with a null numerator and denominator, and `direct-egress-not-measured` blocks `PREVENTION_ACTIVE` on every endpoint until that wave lands. **This is the correct output of this wave, not a shortfall in it.** And the reason does **not** clear itself: **Wave 3 Task 6 must wire a `directEgressDenied` producer into Task 6's posture input** (RECONCILIATION §6). Task 6 provides the socket; Wave 3 owns the plug.

**It does not add a session dimension.** `RuntimeBindingShape` (`Backend/src/ai-governance/runtime-adapter-shape.ts:74-114`) has `principalHash` (user, `:112`) but nothing session-scoped, and `runtimeInstanceId` is built from the stable dims. Adding a session dimension changes the identity key, which re-keys every existing row and would make yesterday's one instance today's many — the exact failure `stableIdentity` was introduced to prevent. It is declared as `session-dimension-unavailable`. **Per RECONCILIATION §6, it is UNOWNED at the programme level: Wave 1 does not contain it.** An earlier revision of this file assigned it to Wave 1; that assignment was not accepted by Wave 1 and is withdrawn here. Whoever takes it, Task 6 does not change — the reason stops being emitted when the binding carries the dimension.

**It does not fix the 4-second decision budget or the 60-second hook timeout.** Both are unchanged and verified: `HookDecisionBudget = 4 * time.Second` (`Installers/internal/airuntime/runner.go:52`) and the 60-second host timeout (`internal/aihooks/settings.go`). The 6-in-10 leak of SOT §15.1 is a *reliability* problem owned by the Wave 2 work. This wave makes that leak **visible on both lanes and in the fleet**; it does not make it stop. (Waves 1, 5, 6 and 8 each carry this same disclaimer and all four are consistent — RECONCILIATION §2 D6. Nobody should read four refusals as four fixes.)

**It does not implement the canary receipt sink.** `Receipts:` is assigned in exactly four places on `origin/main` and **all four are test files**: `internal/airuntimeintegrity/maintenance_test.go:64`, `internal/codexmanaged/canary_host_test.go:289`, `internal/codexmanaged/canary_live_test.go:74`, `internal/codexmanaged/canary_test.go:111`. *(An earlier revision of this file cited `providers/claude/canary.go:55-59, :335-343` — those are the `errNoReceiptSink` declaration and `emitReceipt`, not assignments. RECONCILIATION §1 C7 corrected it; the conclusion was right, the citation was wrong. Reproduce with `git grep -n "Receipts:" origin/main -- '*.go'`.)* `aicanary.Run` also hard-codes a 5-second `WaitDelay` (`internal/aicanary/exec.go:125`) that classifies a real deny as a launch failure. Both are **Wave 6's** work — specifically **W6 Task 5 owns the receipt sink** (RECONCILIATION §2 D1; W5's version targets the wrong composition root and assumes a backend client method that does not exist). Task 6 consumes the receipt-backed proof **when it exists** and correctly reports `canary-receipt-not-held` until it does.

**It does not touch the Codex dialect pin.** `internal/codexmanaged/hookdialect.go:99-115` answers no for 0.145/0.146/0.148/0.149-alpha, including the build the desktop app runs. Widening it without two vendor artefacts per family is how that lane went silently dead the first time. A dialect miss surfaces here as `cooperative-lane-only` / `runtime-binary-uncertified`, which is the honest report.

**It bans one shortcut explicitly.** Do not make any denominator measurable by lowering what it measures. If a metric cannot be established, it ships `measured: false` — "unknown is not clean" is the rule, and a metric quietly redefined to something reportable is the same false green in a new costume.
