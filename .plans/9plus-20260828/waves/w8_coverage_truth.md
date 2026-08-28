# Wave 8 - Replace roll-up health with coverage truth

**Scorecard rows this moves:** Enterprise prevention readiness 4.0 -> 9.3; Overall technological architecture 8.5 -> 9.5
**Depends on:** nothing for Tasks 1-7 and 11. Task 8 depends on Task 5 landing and being DEPLOYED first (see its ordering note). Task 6's `PREVENTION_ACTIVE` terminal cannot be *reached* on any real endpoint until the Workstream 3 wave (canary receipt sink) and the Workstream 4 wave (WFP direct-egress denial) land — that is by design, not a blocker for this wave.
**Phase:** 5 (fleet coverage dashboard and operational alerts), with the vocabulary freeze in Task 1 belonging to Phase 0 and Task 6's state machine satisfying the Phase 3 gate ("`Prevention Active` is impossible without a recent E3 canary and a valid capability certificate").

---

## Reading note on line numbers

Every checkout in this workspace is far behind its remote (`Installers` local HEAD `8e49a625` is **1010 commits behind** `origin/main` `5b129523`; Backend 773 behind `0cf9021e`; Frontend 525 behind `cac574ae`). **Every file:line below was read from the `origin/main` blob, not the working tree.** Reproduce any of them with:

```bash
cd <repo> && git show origin/main:<path> | sed -n '<from>,<to>p'
```

Do not `git checkout` or `git stash` to see them — `refs/stash` is shared across every worktree in this workspace.

---

## What exists today

### The coverage record the strategy asks for is 80% built, and the missing 20% is nameable

Workstream 11 asks for one coverage record per `endpoint + user/session + runtime + exact binary + host + OS + route + auth mode`. **Seven of those eight dimensions already exist on the wire and in the store.**

`RuntimeBindingShape` (`Backend/src/ai-governance/runtime-adapter-shape.ts:74-114`) carries `runtime`, `host`, `platform` (OS), `runtimeVersion`, `cliVersion` (client build), `executionHost`, `providerRoute` (route), `wireApi` (transport), `authMode`, `configRoot`, `baseUrl`, **`executablePathHash`** ("SHA-256 of the runtime executable path" — the exact-binary dimension) and **`principalHash`** ("Platform-neutral principal hash (Windows SID / Linux ns-qualified UID)" — the user dimension). `principalHash` and `launchOrigin` participate in the canonical `runtimeInstanceId`; the mutable dims deliberately do not, so a re-route shows as drift on the same instance rather than a new row (`:106-114`).

`RUNTIME_SURFACE_CERTIFICATE_DIMENSIONS` (`Backend/src/ai-governance/services/runtime-adapter-render.util.ts:100-108`) freezes seven of these as the dimensions a surface certificate must name, and `pickRuntimeSurfaceCertificateDims` (`:146-154`) re-projects them at every serialisation site so an eighth dimension is a compile error at each consumer.

**The one genuinely absent key dimension is SESSION.** Nothing in the binding or the report identifies a session. That is a real limit and Task 6 declares it rather than papering over it.

### `GET /api/v1/ai/protection-depth` is already a per-endpoint, per-instance coverage read

`AiQueryService.getProtectionDepth` (`Backend/src/ai-governance/services/ai-query.service.ts:5264-…`) reads `endpoint_control_state` (the rail the heartbeat writes), derives a render state per adapter/checkpoint/MCP row, batches the server's canary proofs by `runtimeInstanceId` (`loadCanaryProofs`, `:1380-1409`), and returns `{ runtimes[], endpoints[], controlPlaneReadiness[], summary }` (`AiProtectionDepthResponseDto`, `Backend/src/ai-governance/dto/ai-response.dto.ts:1806`).

The honesty discipline in that file is already strong and **must not be weakened by anything in this wave**:

- `summary.states` is typed `Record<RuntimeAdapterRenderState, number>` so a ninth state is a compile error at every consumer, and `sum(states) === adaptersReported` is an asserted invariant (`ai-response.dto.ts` summary block; `ai-query.protection-depth-summary.spec.ts`).
- `summary.adapters` counts only stable-identity adapters; `legacyIdentityAdapters` is reported and deliberately not counted as fleet.
- `summary.adaptersTruncatedReported` exists so a bounded attestation is distinguishable from complete coverage.
- `AiProtectionDepthAdapterIngestDto` (`ai-response.dto.ts:1701-1713`) carries `discovered / stored / rejected / rejectedReasons`, and `null` means NOT MEASURED, deliberately not `0`.
- `projectInstanceIntegrity` (`ai-query.service.ts:1411-1495`) refuses to render `proven` without all three of a PROVEN outcome, a **server-held receipt hash**, and an unexpired expiry — a PROVEN outcome with no receipt reads `could-not-test`, never a pass.

### `active` is explicitly not derivable, and that is the hole `PREVENTION_ACTIVE` fills

`resolveRenderState` (`runtime-adapter-render.util.ts:757-820`) has **no `active` branch at all**, with the reason stated in place: everything reaching it is endpoint-authored, and the certificate is an unsigned block on the same heartbeat, so `certificateMatches` (`:738-752`) tests only the report's self-consistency. `NO_QUALIFYING_ENFORCEMENT_PROOF` (`:313`) is the full trace of every rejected candidate. So the render vocabulary's ceiling is `observed`.

**Grep confirms `PREVENTION_ACTIVE` / `preventionActive` / "Prevention Active" appears NOWHERE in Installers, Backend or Frontend `origin/main`.** It is genuinely absent. The composition rule the strategy names does not exist in any repo.

### Section 14's eight instances, re-verified against `origin/main` today

| § | Claim | Verified state on `origin/main` |
|---|---|---|
| 14.1 | Unreadable daemon token -> unauthenticated 401 -> caller proceeds | Not this wave (Workstream 12). |
| 14.2 | Daemon is a scheduled task | Not this wave (Workstream 3). |
| **14.3** | `/health` unauthenticated, unconditionally 200, no governance posture | **CONFIRMED.** `healthLivenessKeys` is a closed five-key list (`Installers/internal/daemon/server.go:1318`), `handleHealth` writes `StatusOK` for any GET (`:1359-1367`), pinned by `TestHealthOpenBody_ExactlyLivenessKeys`. `install.ps1:2745-2754` and `install.sh:138-157` read only `daemon` / `version` / `wireProxy` from it. `handleHealthDetail` (`:1388-1465`) is token-gated and carries eleven independent posture blocks — **and no composed verdict over them.** |
| **14.4** | Claude half closed, Codex half open | **CONFIRMED, both halves.** Claude: `undecidedVerdictTerm` rides the verdict line in every state including a measured zero (`cmd/devoid/ai.go:677-700`), `vendorDiscarded := printVendorHookFailOpenTo(os.Stdout, airuntime.ClaudeCodeAdapterID)` (`:460`), and `ungoverned := rollup.undecided > 0 \|\| vendorDiscarded > 0 \|\| !rollup.state.Measured()` gates the `[OK]` (`:483-504`). Codex: `printUndecidableHookPayloads(codex.CodexAdapterID)` is a **bare statement** at `cmd/devoid/ai_codex_hooks.go:508` and `printVendorHookFailOpen()` at `:513` passes an empty adapter id (`ai.go:756`); neither result reaches `printCodexObservedAndVerdict` (`cmd/devoid/ai_codex_lanes.go:189-399`), whose `VerdictCompliant` branch prints `[devoid] [OK] Codex managed controls installed + compliant …` (`:310-312`) composed only from the fired/applicable count and the two lane-attestability flags (`:394-397`). |
| **14.5** | Route indicator counts decisions, not traffic | **CONFIRMED, and the label is the defect.** `recordTransportRouteDecision` (`internal/daemon/ai_transport_observation.go:60-70`) is called from the proxy alert observer (`internal/daemon/ai_handlers.go:2360`) and is correct. But `internal/proxy/ai_proxy.go:320-323` forwards every non-`POST`/non-scan-target request via `h.forward(w, r, nil)` — and `forward` (`:1283-1296`) emits no alert at all. `isAIScanTarget` (`:1274-1277`) is `/v1/messages` and `/v1/messages/count_tokens` only. The string that misleads is at `cmd/devoid/ai.go:591`: `"NEVER OBSERVED [!] (configured, but no request has ever travelled this route)"`. The live-proof register's own entry (`internal/liveproof/register.json:25`) records a run where a request demonstrably travelled the route, was forwarded to Anthropic, **and this line still printed**. |
| 14.6 | Machine-secret ACL | Not this wave (Workstream 12). |
| **14.7** | Silent agent-wire field loss | **CONFIRMED, and there are THREE drop sites, only one of which is counted.** (1) `AgentIngestValidationPipe.recordDroppedKeys` (`Backend/src/common/pipes/agent-ingest-validation.pipe.ts:153-166`) counts pipe-level whitelist drops via `recordAgentWireDrift` (`src/common/pipes/agent-wire-drift.ts:237`), readable at `GET /api/v1/health/agent-wire-drift`, OWNER/ORG_ADMIN only (`src/health/controllers/health.controller.ts:218-223`). (2) **UNCOUNTED:** `droppedKeyPaths` (`agent-wire-drift.ts:180-226`) diffs pipe *input* against pipe *output*, and `EndpointControlsDto.runtimeAdapters` is deliberately `unknown[]` with no `@ValidateNested`/`@Type` (`src/health/types/heartbeat.types.ts:599-618`) — so the whitelist never enters it and input === output there. The real gate is the service-layer rebuild `normalizeRuntimeAdapterReportOutcome` (`src/ai-governance/runtime-adapter-shape.ts:1221-1334`), which returns `{ report, reasons: [] }` for a report whose *optional* fields were mistyped: `undecidable`, `certificate`, `attestedProfile`, `foreignGovernance`, `unreadableGovernanceTables`, `configHash`, `lastObservedAt` are each conditionally assigned and **silently omitted on a shape failure with no reason recorded and `rejectedCount` unchanged**. (3) **UNCOUNTED:** `normalizeControls` in `Backend/packages/shared-contracts/src/endpoint-controls-contract.ts` rebuilds the controls block field-by-field from a frozen allowlist and drops the rest — the agent source names this in place at `Installers/cmd/devoid/ai.go:652-660` as the reason the undecidable counter's *wire* half has not been attempted. Element-level rejection **is** counted (`normalizeRuntimeAdapters`, `runtime-adapter-shape.ts:1386-1424`, with `over-ceiling` counted too); field-level loss inside a surviving element is not. |
| 14.8 | Obligation receipt `Deny: func() error { return nil }` | Not this wave (Workstream 7). |

### The field-observation ledger never leaves the box

`internal/fieldobs/fieldobs.go` holds both the per-checkpoint fire records (`RecordCheckpoint`, `:172`) and the per-provider route decisions (`RecordRouteDecision`, `:197`; `Route` struct at `:98-104`). Grepping `origin/main` for `fieldobs.` across `Installers/internal` and `Installers/cmd` returns **six non-test call sites, all local**: `cmd/devoid/ai_hook_runner.go:202` and `:1189`, `internal/daemon/ai_transport_observation.go:65`, `:80`, `:81`, and a comment at `cmd/devoid/ai.go:549`. Grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns **nothing**.

Consequence: the strategy's required evidence-basis lines — "hook observed 3 minutes ago", "direct egress canary passed", the route observation — **exist on the endpoint and are invisible to any fleet surface.** An administrator cannot tell GOVERNED from REPORTED-GOVERNED per host because the observation half of the pair never arrives.

### The inventory coverage report is inert (SOT §16, re-verified)

`sweep.AIResult` gained `Complete`, `DepthCeiling`, `DepthPruned`, `DepthPrunedPaths`, `UnreadableDirs` (`Installers/internal/sweep/sweep_ai.go:43-65`, populated `:80-92`). Both readers throw it away: `cmd/devoid/artifact_user_sweep.go:302-303` logs `"AI inventory sweep complete", "items", res.ItemsScanned, "accepted", res.Accepted` and never reads `Complete`; `internal/daemon/server.go:2604-2610` calls `_, err := daemonAISweepFn(...)` and discards the result entirely. The measurement behind the fix (SOT §16.1 C5) was **585 rule files at depth 8 versus 1,099 at depth 32 on one real machine — 47% invisible — while the sweep logged "AI inventory sweep complete".**

### The console

`RuntimeProtectionDepthPanel` is rendered from `Frontend/app/admin/endpoints/coverage-section.tsx:1756` (imported at `:43-47`), i.e. the fleet surface is `/admin/endpoints`. `Frontend/app/ai-control-plane/protection-depth.tsx` (3,195 lines) already contains `resolveEnforcementProof` with three ways out and none of them upward (`:850-861`), `EnforcementProofFleetRollup` deduped per `runtimeInstanceId` with a rendered arithmetic-shortfall sentence (`:1065-1130`), `UndecidableHooksBlock` (`:1939`), `AdapterIngestAccounting` (`:2605`) and `SurfaceCertificateDims` (`:1630`). **What it has no component for is a composed per-(host × surface) posture** — the reader must assemble six independent blocks themselves, which is the roll-up problem inverted.

### The render harness

`Frontend/scripts/render-harness/` — `fixtures.cjs` (870), `shoot.cjs` (635), `stub-backend.cjs` (225), plus a 224-line README. Six scenarios (`populated`, `empty-tenant`, `absent-data`, `read-failed`, `slow`, `broken-fixture`), `--expect` / `--forbid` / `--strict` / `--fail-on-overflow`, exit 1 on any failed shot and 2 if it cannot run. Its README already states the discipline this wave needs: *"`empty-tenant` and `absent-data` are different claims and must never share copy."* It drives real routes including `admin/endpoints`.

### What is genuinely absent

1. Any composed posture state machine, in any repo.
2. A shared local-and-backend reason vocabulary.
3. Any fleet percentage with a visible numerator, denominator and freshness window.
4. Any wire path for the field-observation ledger.
5. Any counting of field-level (as opposed to element-level) agent-wire loss.
6. **Direct-egress denial** — grepping `Installers/origin/main` for WFP/`Fwpm` symbols finds only unrelated matches (`internal/dlp/oauth_bearer.go`, test corpora). The "% with forced egress" denominator therefore **has no producer**, and Task 7 reports it `NOT MEASURED` rather than inventing one.

---

## Task 1: Freeze the coverage-truth vocabulary as one artifact both runtimes read

**Files:**
- `Installers/parity-vectors/coverage-posture.v1.json` (new — the canonical artifact)
- `Installers/internal/coveragetruth/posture.go` (new)
- `Installers/internal/coveragetruth/posture_vector_test.go` (new)
- `Backend/packages/shared-contracts/src/coverage-posture-contract.ts` (new)
- `Backend/src/ai-governance/coverage-posture-contract.parity.spec.ts` (new)

**Put the TS contract in `Backend/packages/shared-contracts/` and NOWHERE ELSE — verified, and the root `CLAUDE.md` will mislead you here.** That file says the workspace-root `packages/shared-contracts/` is the canonical the Backend parity specs compare against. That is true *for the contracts it actually holds*: the root copy carries **21** files (`cache-schema.ts`, `scanner-decision.ts`, `worker-result-contract.ts`, …) and the Backend copy carries **53**. Neither `runtime-adapter-contract.ts` nor `endpoint-controls-contract.ts` — the two AI-governance contracts this wave extends — exists at the root at all. And `findCanonicalContract` (`Backend/src/__test-utils__/canonical-contract-path.ts:44-49`) tries the **repo-relative copy first**, precisely because resolving to a stale workspace-root copy made specs pass on a developer box and skip in CI. Adding a root copy here would create a fourth divergence with no spec pointing at it.

**What it defines.** Two closed lists and one invariant.

`COVERAGE_POSTURE_STATES` = `PREVENTION_ACTIVE`, `DEGRADED`, `CONTAINED`, `UNSUPPORTED`, `UNMANAGED`, `UNKNOWN` — exactly the strategy's six.

`COVERAGE_POSTURE_REASONS` = a closed slug list, each mapping to one distinct operator action:
`canary-never-run`, `canary-expired`, `canary-receipt-not-held`, `capability-cert-absent`, `capability-cert-version-mismatch`, `undecided-invocations-present`, `undecided-not-measured`, `vendor-discarded-decisions`, `route-never-carried-traffic`, `route-carried-traffic-undecided`, `direct-egress-not-measured`, `direct-egress-not-denied`, `managed-source-absent`, `managed-source-not-confirmed`, `cooperative-lane-only`, `runtime-version-unknown`, `runtime-binary-uncertified`, `config-drift`, `attestation-stale`, `policy-not-converged`, `wire-fields-dropped`, `inventory-walk-truncated`, `unsupported-tool-path-enabled`, `session-dimension-unavailable`.

**THE INVARIANT, and it is the whole design:** `state === 'PREVENTION_ACTIVE'` **if and only if** `reasons.length === 0`. Every other state carries at least one reason. This makes "why is this host not green" answerable without reading code, and makes the state machine impossible to fudge — you cannot mint green by tweaking a threshold, only by emptying the reason list.

The JSON vector is the single source; Go embeds it with `go:embed` and TS vendors it; both sides assert their constant list equals the vector's, byte-for-byte and order-for-order. The digest-pin pattern already used by `internal/aipolicycontract/embedded/*/portable-contract.v1.jcs.json.sha256` is the precedent.

**Blast radius:** none at runtime — this task adds constants and tests only, and nothing consumes them until Task 6. If the lists are wrong, the later tasks compile against a wrong vocabulary and the parity spec catches the divergence, not production.
**Rollback:** delete the four new source files and the vector. No consumer exists yet.

- [ ] Write `coverage-posture-contract.parity.spec.ts` asserting the TS `COVERAGE_POSTURE_STATES` and `COVERAGE_POSTURE_REASONS` equal the arrays parsed from the vector JSON, in order. Run it: RED (module not found).
- [ ] Write `posture_vector_test.go` asserting the Go slices equal the embedded vector, in order, and that `len(COVERAGE_POSTURE_STATES) == 6`. Run: RED.
- [ ] Add the vector JSON, the Go file, both TS files. Both tests GREEN.
- [ ] Add `TestPostureStateInvariantIsDocumented` / `posture-invariant.spec.ts`: a table of `{state, reasons}` fixtures asserting `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` for every state in the vocabulary. RED first (helper absent), then GREEN.
- [ ] Do **not** add the new contract to `M3_GOVERNANCE_DOMAIN_FILES` or otherwise touch `Backend/src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts`. That spec byte-compares a workspace copy against the Backend copy, and it locates the workspace copy by probing three candidate paths for `endpoint-controls-contract.ts` (`:61-67`). **Verified on this workspace: none of the three candidates contains that file, so `findCopy1()` returns `null` and the whole spec is `describe.skip` (`:69`) — the byte-compare does not currently run anywhere.** Adding a Backend-only file to its list therefore changes nothing today and creates a red the day the workspace copy is restored. The always-on CI guard is `m3-contracts.parity.spec.ts`, and the new contract's guard is its own parity spec above. *(Flagging only: that skip is a green-but-inert shape and deserves its own item; it is out of this wave's scope and fixing it here would widen the blast radius for no coverage-truth gain.)*
- [ ] Mirror into `Ceragon-Intelligence/packages/shared-contracts/` only if that repo needs it — it does not for this wave. Say so in the commit message rather than leaving a reader to wonder.

**Defeat test:** `coverage-posture-contract.parity.spec.ts` — revert by deleting the string `"CONTAINED"` from `Installers/parity-vectors/coverage-posture.v1.json`, expect RED with `posture states diverged from the vector: TS has CONTAINED, vector does not`.
**Exit:** `coverage-posture.v1.json` exists with exactly 6 states and 24 reason slugs; three parity/invariant tests green in both `Installers` (`go test ./internal/coveragetruth/...`) and `Backend` (`npx jest coverage-posture`); the Go vector digest and the TS constant list are asserted equal by both sides against the same file.

---

## Task 2: Compose the Codex undecided and vendor-discarded counts into the Codex verdict and exit code

**Files:**
- `Installers/cmd/devoid/ai_codex_hooks.go` (lines 508 and 513)
- `Installers/cmd/devoid/ai_codex_lanes.go` (`printCodexObservedAndVerdict`, `:189-399`)
- `Installers/cmd/devoid/ai_codex_undecided_verdict_test.go` (new)

**What changes.** Mirror exactly what Installers `40f34362` did for Claude. Capture the two return values that are currently discarded, thread them into `printCodexObservedAndVerdict`, append `undecidedVerdictTerm(rollup) + vendorDiscardTerm(discarded)` to every verdict line, and add the same three-state `ungoverned` gate to the `VerdictCompliant` branch so `[OK] Codex managed controls installed + compliant` cannot stand over a non-zero undecided count or an unreadable counter.

Change `printVendorHookFailOpen()` at `ai_codex_hooks.go:513` to `printVendorHookFailOpenTo(os.Stdout, codex.CodexAdapterID)` so the per-runtime split is attributed instead of printed endpoint-wide-unlabelled. Also give `printUndecidableHookPayloadsTo` (`ai.go:690-710`) a `default:` arm that prints the measured zero, so silence and nought stop being indistinguishable on the Codex lane too.

**Blast radius:** read this before touching it. `install.sh:564` and `install.ps1:2829` run `devoid ai hooks-status <target>` and treat a **non-zero exit as "NOT governed"**: they print a warning, echo the `[!]` lines, and set `AI_GOVERNANCE_STATE="gap"`. `install.sh:583-586` returns 0 in that branch, so **the install does not fail** — the summary reads "gap" instead of "confirmed". That is the intended, honest outcome, and it is the same blast radius the Claude half already took in 7.10.6 without an install regression. The reason it does not turn every fresh box red: `UndecidableCounterNeverWritten` (`internal/security/ai_hook_undecidable.go:95-98`) **counts as measured** (`Measured()`, `:109-111`), so a machine that has never fired a hook reports a measured zero, not NOT MEASURED. Verify that with the defeat test below before shipping.
**Rollback:** revert the two call sites at `ai_codex_hooks.go:508` and `:513` to bare statements and drop the two new parameters from `printCodexObservedAndVerdict`. Single-commit revert; no state, no wire, no migration.

- [ ] `TestCodexVerdictIsNotOKOverUndecidedInvocations`: build a `codexmanaged.Report` with `Verdict: VerdictCompliant`, an `ungovernedRollup{undecided: 3, state: UndecidableCounterRead}`, call `printCodexObservedAndVerdict` against a `bytes.Buffer`, assert the output does **not** contain `[OK]`, does contain `UNGOVERNED`, contains `3 invocation(s) UNDECIDED`, and the function returns `false`. Run: RED.
- [ ] `TestCodexVerdictPrintsAMeasuredZero`: same with `undecided: 0, state: UndecidableCounterNeverWritten`; assert output contains `[OK]`, contains `0 invocations undecided (measured zero)`, returns `true`. Run: RED.
- [ ] `TestCodexVerdictFailsOnAnUnreadableCounter`: `state: UndecidableCounterUnreadable`; assert no `[OK]`, contains `NOT MEASURED (this is not a zero)`, returns `false`. Run: RED.
- [ ] `TestCodexVendorDiscardIsAttributedToThisRuntime`: assert `printVendorHookFailOpenTo(buf, codex.CodexAdapterID)` output contains `— %d of them on this runtime (codex)` rather than the unattributed endpoint-wide form. Run: RED.
- [ ] Implement. All four GREEN. `go test ./cmd/devoid/...` green.
- [ ] Run `go test ./install-scripts/production/...` — `install_hook_parity_contract_test.go:478-538` pins that both scripts read governance back from `hooks-status` and only claim governed inside the clean branch. It must stay green unmodified.

**Defeat test:** `TestCodexVerdictIsNotOKOverUndecidedInvocations` — revert `ai_codex_hooks.go:508` to the bare statement `printUndecidableHookPayloads(codex.CodexAdapterID)`, expect RED with `codex verdict printed [OK] over 3 undecided invocation(s)`.
**Exit:** four new tests green; `devoid ai hooks-status codex` exits non-zero on any of {undecided > 0, vendor-discarded > 0, counter unreadable}; the Claude and Codex verdict lines carry the identical `undecidedVerdictTerm` / `vendorDiscardTerm` clauses (asserted by a fifth test that calls both printers and diffs the clause substrings).

---

## Task 3: Separate route TRAFFIC from route DECISIONS, and stop asserting the false one

**Files:**
- `Installers/internal/fieldobs/fieldobs.go` (`Route` struct `:98-104`; new `RecordRouteTraffic`)
- `Installers/internal/proxy/ai_proxy.go` (the non-scan forward at `:320-323`)
- `Installers/internal/daemon/ai_transport_observation.go` (`AITransportObservationEntry` `:48-52`, `handleAITransportObservation` `:75-90`, new `recordTransportRouteTraffic`)
- `Installers/internal/daemon/ai_handlers.go` (observer wiring near `:2360`)
- `Installers/cmd/devoid/ai.go` (`routeStatusLabel`, `:579-597`)
- `Installers/internal/proxy/ai_proxy_route_traffic_test.go` (new)
- `Installers/cmd/devoid/ai_transport_route_status_test.go` (extend — it already asserts on `NEVER OBSERVED` at `:25`, `:39`, `:52`)

**What changes.** The counter is correct; the **claim** is wrong. Add a second, independent counter on the same ledger: `Route.Traffic` alongside `Route.Decisions`, incremented for **every** request the proxy handles, including the transparent-forward path at `ai_proxy.go:320-323`. Then rewrite `routeStatusLabel` into four honest states:

| Traffic | Decisions | Line |
|---|---|---|
| unknown (daemon unreachable) | — | `observation unknown [!] (daemon unreachable — cannot confirm this route)` (unchanged) |
| 0 | 0 | `NEVER OBSERVED [!] (configured; no request has ever travelled this route)` |
| >0 | 0 | `TRAFFIC UNGOVERNED [!] (N requests travelled this route and none reached a decision)` |
| >0 | >0 | `observed (N requests, M decisions, last …)` |

The third row is the one that has never existed and is exactly what the live-proof register recorded happening (`internal/liveproof/register.json:25`).

Increment traffic in the proxy handler **before** the `isAIScanTarget` branch so both paths are counted, and route it through the existing `AlertObserver` seam rather than a second observer — the file's own comment at `ai_transport_observation.go:18-21` says "a second counter would be a second truth", and this keeps one producer.

**Blast radius:** the proxy hot path gains one best-effort ledger write per request. `recordTransportRouteDecision` already tolerates a failed write and logs at Debug (`:65-69`); the traffic recorder must do the same — **a failed write must never affect the request**, and the load-bearing fact is the monotone "has this route carried traffic", which a lost increment cannot erase. If the write throttling is wrong the visible symptom is ledger churn on a busy box, not a blocked request. The status line changes wording, which `ai_transport_route_status_test.go` and any operator runbook quoting the old string will notice.
**Rollback:** revert `routeStatusLabel` to the three-state form and stop calling `recordTransportRouteTraffic`. `Route.Traffic` is additive JSON and an older reader ignores it, so a rolled-back binary reads a forward ledger without error.

- [ ] `TestTransparentForwardRecordsTraffic`: drive the proxy handler with `GET /proxy/anthropic/v1/models` (a non-scan target), assert the ledger's `anthropic` route shows `Traffic == 1, Decisions == 0`. Run: RED.
- [ ] `TestRouteStatusSaysTrafficUngoverned`: `routeStatusLabel(true, "anthropic", routeObservation{known: true, traffic: 4, decisions: 0})` must contain `TRAFFIC UNGOVERNED` and must **not** contain `no request has ever travelled this route`. Run: RED.
- [ ] `TestRouteStatusStillSaysNeverObservedOnAColdRoute`: `traffic: 0, decisions: 0` still yields `NEVER OBSERVED`. Run: RED (the new signature).
- [ ] `TestRouteTrafficWriteFailureDoesNotAffectTheRequest`: point the ledger at an unwritable dir, assert the forwarded response is unchanged and no error surfaces to the caller. Run: RED.
- [ ] Implement. All four GREEN, plus the three existing assertions in `ai_transport_route_status_test.go` updated to the new vocabulary and still green.

**Defeat test:** `TestRouteStatusSaysTrafficUngoverned` — revert the `traffic > 0 && decisions == 0` arm of `routeStatusLabel`, expect RED with `route line printed "no request has ever travelled this route" over 4 observed requests`.
**Exit:** a request to `GET /proxy/anthropic/v1/models` moves `Route.Traffic` from 0 to 1 and leaves `Route.Decisions` at 0; `devoid ai hooks-status claude-code` then prints `TRAFFIC UNGOVERNED`; the exact live-proof scenario in `register.json:25` (enrolled, `POST /proxy/anthropic/v1/messages` forwarded, no decision recorded) no longer produces a line that contradicts the traffic.

---

## Task 4: Make the AI-inventory sweep unable to log "complete" over a truncated walk

**Files:**
- `Installers/cmd/devoid/artifact_user_sweep.go` (`:295-305`)
- `Installers/internal/daemon/server.go` (`:2604-2610`)
- `Installers/cmd/devoid/artifact_user_sweep_coverage_test.go` (new)
- `Installers/internal/daemon/ai_sweep_coverage_test.go` (new)

**What changes.** Both readers consume `AIResult.Complete` and the four detail fields that already exist and have no reader (`internal/sweep/sweep_ai.go:43-65`). On `Complete == false` the user sweep logs at **Warn**, not Info, and the message states a floor rather than an inventory: `"AI inventory sweep INCOMPLETE — items is a floor, not an inventory"` with `depthCeiling`, `depthPruned`, `unreadableDirs`. The daemon sweep stops discarding the result (`_, err := daemonAISweepFn(...)`) and records the same fact.

**Blast radius:** log lines only, plus one new Warn on machines with deep or unreadable home trees. Nothing gates on it, nothing fails. The risk is Warn noise on a box with many unreadable directories — bound it by logging the incompleteness at most once per sweep (it already is one line per sweep).
**Rollback:** revert both call sites to their current shape. No wire, no store, no schema.

- [ ] `TestUserSweepDoesNotSayCompleteOnATruncatedWalk`: stub `sweep.RunAI` to return `AIResult{ItemsScanned: 585, Complete: false, DepthCeiling: 32, DepthPruned: 14}`, capture the logger, assert the output contains `INCOMPLETE` and does **not** contain the string `AI inventory sweep complete`. Run: RED.
- [ ] `TestUserSweepStillSaysCompleteOnAWholeWalk`: `Complete: true` still logs the existing Info line with `items` and `accepted`. Run: RED (helper absent), then GREEN.
- [ ] `TestDaemonSweepReadsTheCoverageResult`: assert the daemon path no longer discards the `*AIResult` and emits the same incompleteness fact. Run: RED.
- [ ] Implement all three.

**Defeat test:** `TestUserSweepDoesNotSayCompleteOnATruncatedWalk` — revert `artifact_user_sweep.go:302-303` to `logger.Info("AI inventory sweep complete", "items", res.ItemsScanned, "accepted", res.Accepted)`, expect RED with `sweep logged "complete" over a walk that pruned 14 directories`.
**Exit:** on a tree that prunes at least one directory, `devoid ai reconcile` emits a Warn naming `depthPruned` and never the word "complete"; `go test ./cmd/devoid/... ./internal/daemon/...` green.

---

## Task 5: Count the field-level agent-wire loss the pipe cannot see, and expose it

**Files:**
- `Backend/src/ai-governance/runtime-adapter-shape.ts` (`normalizeRuntimeAdapterReportOutcome`, `:1221-1334`)
- `Backend/src/common/pipes/agent-wire-drift.ts` (reuse `recordAgentWireDrift`, `:237`)
- `Backend/src/health/services/health.service.ts` (`:432-512`, the persist site)
- `Backend/src/entities/endpoint-control-state.entity.ts` (one nullable jsonb column)
- `Backend/src/migrations/<ts>-AddRuntimeAdapterFieldDropsToControlState.ts` (new)
- `Backend/src/ai-governance/runtime-adapter-field-drift.spec.ts` (new)

**Why this must land before Task 8.** This is the wave's ordering safety net. Task 8 widens the agent wire. The known landmine is that an agent shipped ahead of its Backend loses fields **silently — no error, no data, and it looks like it worked**. Today a mistyped optional field inside a surviving `runtimeAdapters[]` element is dropped by the field-by-field rebuild at `runtime-adapter-shape.ts:1281-1330` with `reasons: []`, `rejectedCount` unchanged, and the pipe's drift counter structurally blind because `runtimeAdapters` is `unknown[]` (`heartbeat.types.ts:599-618`) so `droppedKeyPaths` (`agent-wire-drift.ts:180-226`, an input-vs-output diff) sees input === output. **Landing this first converts a future ordering mistake from invisible into a counted, queryable fact.**

**What changes.** `normalizeRuntimeAdapterReportOutcome` returns a third value: `droppedKeyPaths: string[]` — the bounded set of keys present on `src` that the rebuilt report does not carry, index-collapsed and capped exactly as `agent-wire-drift.ts` caps (64 paths, `AGENT_WIRE_DRIFT_TRUNCATED` sentinel). `normalizeRuntimeAdapters` unions them. `health.service.ts` (a) calls `recordAgentWireDrift('RuntimeAdapterReport', paths)` so `GET /api/v1/health/agent-wire-drift` reads them back through the surface that already exists, and (b) persists the union on the control-state row so it survives a process restart and can be **subtracted from a coverage denominator**, which the process-local counter cannot (SOT §14.7 "what remains": "the counter is process-local and resets on restart, has no console surface, and nothing subtracts it from any coverage denominator").

**IT STILL NEVER REJECTS.** Nothing on this path may turn a drop into a 400. `agent-ingest-validation.pipe.ts:150-152` states that invariant and the 400 form has taken the fleet down more than once. The new code counts and persists; it never throws, and the caller swallows.

**Blast radius:** one nullable jsonb column and one extra counter increment per heartbeat. If the diff is wrong the failure mode is an over-reported drop list (noise on an OWNER-only route and a non-null column), never a rejected heartbeat. The migration is additive and nullable, so a rollback of the code leaves a harmless unread column.
**Rollback:** revert the service change; leave the column (dropping a column needs its own ask). `GET /api/v1/health/agent-wire-drift` returns to pipe-level drops only.

- [ ] `runtime-adapter-field-drift.spec.ts` — `it('reports a mistyped undecidable block as a dropped key path')`: feed a report with a valid binding, valid coverage depth/certification state, and `undecidable: "3"` (a string). Assert the outcome's `report` is non-null (it must still store), `reasons` is `[]`, and `droppedKeyPaths` contains `undecidable`. Run: RED.
- [ ] `it('reports a misspelled optional key')`: `undecideable: {...}`; assert `droppedKeyPaths` contains `undecideable`. Run: RED.
- [ ] `it('reports nothing for a clean report')`: a fully valid report yields `droppedKeyPaths: []`. Run: RED.
- [ ] `it('never rejects a heartbeat because of a dropped field')`: assert the persist path completes and the row is written with the adapter stored. Run: RED.
- [ ] `it('caps the path list and appends the truncation sentinel')` — 200 junk keys yield 64 paths plus the sentinel. Run: RED.
- [ ] Implement, add the migration, run `npm run test -- runtime-adapter-field-drift` and the existing `agent-wire-drift` and `runtime-adapter-report-dto.inert.spec.ts` suites unchanged.

**Defeat test:** `reports a mistyped undecidable block as a dropped key path` — revert `normalizeRuntimeAdapterReportOutcome` to return only `{ report, reasons }`, expect RED with `expected droppedKeyPaths to contain "undecidable", received undefined`.
**Exit:** a heartbeat carrying one mistyped optional field inside a valid adapter report produces a non-empty `droppedKeyPaths` on the persisted row **and** a non-zero entry under DTO `RuntimeAdapterReport` at `GET /api/v1/health/agent-wire-drift`; zero heartbeats are rejected in the process.

---

## Task 6: Derive the Prevention Active state machine, server-side, additively

**Files:**
- `Backend/src/ai-governance/services/coverage-posture.util.ts` (new — pure, no ambient clock)
- `Backend/src/ai-governance/services/coverage-posture.util.spec.ts` (new)
- `Backend/src/ai-governance/dto/ai-response.dto.ts` (add `posture` to `AiProtectionDepthAdapterDto` and `AiProtectionDepthEndpointDto`)
- `Backend/src/ai-governance/services/ai-query.service.ts` (`getProtectionDepth`, project the new block)
- `Backend/src/ai-governance/services/ai-query.protection-depth-posture.spec.ts` (new)

**The composition rule.** `derivePreventionPosture(input, nowMs)` returns `{ state, reasons[], evidence[] }` where `state` is from Task 1's vocabulary and the invariant `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` holds by construction (build the reason list first; the state is a function of it).

The mandatory gates, each sourced from something that already exists:

| Gate | Source, verified | Reason on failure |
|---|---|---|
| Server holds an unexpired receipt-backed PROVEN canary | `AiRuntimeInstanceIntegrityDto.enforcementProof === 'proven'` (`ai-query.service.ts:1411-1495`) | `canary-never-run` / `canary-expired` / `canary-receipt-not-held` |
| Capability certificate matches the tuple and the running version | `certificateMatches` + `versionSatisfiesCertRange` (`runtime-adapter-render.util.ts:711-752`) | `capability-cert-absent` / `capability-cert-version-mismatch` |
| Zero undecided invocations, measured | `RuntimeAdapterUndecidableView.aboveZero` / `null` (`runtime-adapter-render.util.ts:604-627`) | `undecided-invocations-present` / `undecided-not-measured` |
| No drift, attestation fresh, version known | `resolveRenderState` inputs (`:757-820`) | `config-drift` / `attestation-stale` / `runtime-version-unknown` |
| Policy converged | `EndpointPolicyIntegrityView.convergence === 'healthy'` | `policy-not-converged` |
| No field-level wire loss on this row | Task 5's persisted `droppedKeyPaths` | `wire-fields-dropped` |
| Direct provider egress denied independently | **NO PRODUCER EXISTS** (verified: no WFP code in `Installers/origin/main`) | `direct-egress-not-measured` |
| Session dimension | **ABSENT from the binding** (verified against `RuntimeBindingShape:74-114`) | `session-dimension-unavailable` |

The last two mean **`PREVENTION_ACTIVE` is unreachable on every real endpoint today, and that is the correct answer.** Do not soften them to make the state reachable. They become reachable when the Workstream 4 wave lands WFP denial and when a session dimension is added to the binding — at which point the reason simply stops being emitted and no code in this task changes.

Non-mandatory composition: `UNMANAGED` when the endpoint reports a cooperative-only lane (`cooperative-lane-only`); `UNSUPPORTED` when `coverageDepth === 'not-endpoint-governed'` or a runtime binary is uncertified; `CONTAINED` when direct use is prevented but functionality is unavailable; `UNKNOWN` when DeVoid cannot measure — **and `UNKNOWN` outranks `DEGRADED`, never the reverse.** "Unknown is not clean. Drift is not unknown. Failure is not absence."

**This adds ZERO enforcement branches.** Nothing on any endpoint decides differently because of this task. It is a projection over data the server already holds, delivered on a read route. It therefore cannot brick a machine and cannot create a fail-closed checkpoint on an unprovable condition — the July 2026 failure mode is structurally out of reach here.

**Blast radius:** two new optional fields on an existing read response. A Frontend that does not know them ignores them (the FE reads named fields, not a spread). If the derivation is wrong, an operator sees a wrong posture badge on `/admin/endpoints`; nothing enforces on it. The one real risk is **over-claiming** — a bug that emits `PREVENTION_ACTIVE` where it should not — which the invariant test and the defeat test below are aimed squarely at.
**Rollback:** stop projecting `posture` in `getProtectionDepth`; the util and its tests can stay. One-line revert.

- [ ] `coverage-posture.util.spec.ts` — `it('never returns PREVENTION_ACTIVE while direct egress is unmeasured')`: pass an otherwise perfect input (proven receipt-backed unexpired canary, matching certificate, measured zero undecided, fresh, no drift, converged) with `directEgressDenied: null`. Assert `state !== 'PREVENTION_ACTIVE'` and `reasons` includes `direct-egress-not-measured`. Run: RED.
- [ ] `it('holds the invariant across a generated matrix')`: for every combination over the eight gates, assert `(state === 'PREVENTION_ACTIVE') === (reasons.length === 0)`. Run: RED.
- [ ] `it('demotes a PROVEN canary with no server receipt')`: `enforcementProof: 'could-not-test'` with `serverHoldsReceipt: false` yields `canary-receipt-not-held`, never green. Run: RED.
- [ ] `it('prefers UNKNOWN over DEGRADED when a gate is unmeasurable')`. Run: RED.
- [ ] `it('emits a reason slug from the frozen vocabulary only')`: assert every reason produced across the matrix is a member of Task 1's `COVERAGE_POSTURE_REASONS`. Run: RED.
- [ ] `ai-query.protection-depth-posture.spec.ts` — assert `getProtectionDepth` projects `posture` on every adapter and every endpoint, and that no endpoint in a realistic fixture reaches `PREVENTION_ACTIVE`. Run: RED.
- [ ] Implement. All six GREEN. Existing `ai-query.protection-depth-summary.spec.ts` and the `sum(states) === adaptersReported` invariant must remain green **unmodified** — this task adds a field, it does not touch the render-state tally.

**Defeat test:** `never returns PREVENTION_ACTIVE while direct egress is unmeasured` — revert by deleting the `direct-egress-not-measured` push from `derivePreventionPosture`, expect RED with `expected state not to be PREVENTION_ACTIVE; direct egress was never measured on this endpoint`.
**Exit:** `derivePreventionPosture` exists as a pure function with `nowMs` as an argument; the invariant test passes over a generated matrix of at least 256 gate combinations; `GET /api/v1/ai/protection-depth` carries `posture: {state, reasons[], evidence[]}` on every adapter and endpoint; **zero endpoints in the production tenant read `PREVENTION_ACTIVE`**, and each carries at least `direct-egress-not-measured`.

---

## Task 7: Give every fleet percentage a numerator, a denominator, and a freshness window

**Files:**
- `Backend/src/ai-governance/dto/ai-response.dto.ts` (`AiProtectionDepthResponseDto.summary`)
- `Backend/src/ai-governance/services/ai-query.service.ts` (`getProtectionDepth`)
- `Backend/src/ai-governance/services/ai-query.protection-depth-denominators.spec.ts` (new)

**What changes.** Add `summary.fleet: FleetRatioDto[]`, where each entry is `{ metric, numerator: number | null, denominator: number | null, freshnessWindowMs: number, measured: boolean, unmeasuredReason: string | null }` — **never a bare percentage.** The console computes the ratio; the server never ships a number whose denominator it did not also ship.

The metrics, and what each can honestly say today:

| Metric | Measurable now? | Source |
|---|---|---|
| `endpoints-managed` | yes | `attestedProfile` / lane fields on the control-state row |
| `certified-runtime-version` | yes | `versionSatisfiesCertRange` over the stored certificate |
| `fresh-canary` | yes | `enforcementProof === 'proven'` per instance, deduped by `runtimeInstanceId` exactly as `EnforcementProofFleetRollup` does |
| `undecided-invocation-rate` | yes | `RuntimeAdapterUndecidableView.rate`, with `null` preserved as NOT MEASURED |
| `evidence-gaps` | yes | `adapterIngest.rejected` + Task 5's `droppedKeyPaths` count |
| `prevention-active` | yes (and it will read 0/N) | Task 6's posture |
| **`forced-egress`** | **NO** | **no producer exists.** `measured: false`, `unmeasuredReason: 'direct-egress-not-measured'`, `numerator: null`, `denominator: null` |

**The rule the strategy names, made structural:** `numerator: 0, denominator: 100` and `numerator: null, denominator: null` are different claims and must serialise differently. A metric whose denominator cannot be established emits `null`, never `0` — "a zero count omitted from output, making zero indistinguishable from unreadable" is on the strategy's Avoid list, and the codebase already applies this rule to `adapterIngest` (`ai-response.dto.ts:1701-1713`) and `adaptersTruncatedReported`. Follow the existing precedent, do not invent a second convention.

Type `FleetRatioDto[]`'s `metric` over a closed union so a seventh metric is a compile error at every consumer — the same mechanism that fixed `summary.states` (`ai-response.dto.ts`, the F8/DF-31 block: three states were "computed and then dropped on the floor" because the field list was hand-written).

**Blast radius:** one new array on an existing read response. A wrong denominator shows a wrong ratio on `/admin/endpoints`. Nothing enforces on it. The genuine risk is the opposite of the usual one: a metric that reports `measured: true` when it is not.
**Rollback:** stop projecting `summary.fleet`. One-line revert.

- [ ] `it('reports forced-egress as unmeasured, never as zero')`: assert the `forced-egress` entry has `measured: false` and `numerator === null`, and **not** `numerator === 0`. Run: RED.
- [ ] `it('ships a denominator with every ratio')`: for every entry, `measured === true` implies both `numerator` and `denominator` are finite non-negative integers and `numerator <= denominator`. Run: RED.
- [ ] `it('dedupes fresh-canary by runtimeInstanceId')`: two adapters on one instance count once. Run: RED.
- [ ] `it('is a compile-time closed set')` — a type-level test asserting `FleetMetric` has exactly seven members. Run: RED.
- [ ] Implement. All four GREEN.

**Defeat test:** `reports forced-egress as unmeasured, never as zero` — revert by changing the `forced-egress` entry to `{ numerator: 0, denominator: endpointCount, measured: true }`, expect RED with `forced-egress claimed a measured 0/N; no direct-egress producer exists in this build`.
**Exit:** `summary.fleet` has exactly seven entries; six are `measured: true` with integer numerator and denominator; `forced-egress` is `measured: false` with null numerator and denominator; no percentage is serialised anywhere in the response.

---

## Task 8: Put the field-observation ledger on the wire — Backend first, agent second

**Files:**
- **Backend, and DEPLOYED, before any agent work:** `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts` (this file exists **only** in the Backend copy — the workspace-root `packages/shared-contracts/src/` does not carry it; verified), `Backend/src/ai-governance/runtime-adapter-shape.ts` (accept `fieldObservation` in the rebuild), `Backend/src/ai-governance/runtime-adapter-field-observation.spec.ts` (new)
- **Agent, only after the above is live:** `Installers/internal/fieldobs/fieldobs.go`, `Installers/internal/airuntimeinventory/row.go` (project the ledger onto the report), `Installers/internal/airuntimeinventory/field_observation_test.go` (new)

**THE ORDERING IS THE WHOLE TASK.** `EndpointControlsDto.runtimeAdapters` is `unknown[]` (`heartbeat.types.ts:599-618`), so an agent that ships this field first is **not** rejected — `normalizeRuntimeAdapterReportOutcome` (`runtime-adapter-shape.ts:1281-1330`) rebuilds field-by-field from an allowlist and the unknown key vanishes with `reasons: []`. **No error, no data, and the agent's own `hooks-status` reads fine.** That is the exact silent-loss shape the landmine describes, and `Installers/cmd/devoid/ai.go:652-660` already documents this as the reason the undecidable counter's wire half was deferred. Task 5 must be deployed first so that if this ordering is ever violated the loss shows up as a counted `droppedKeyPaths` entry instead of nothing.

**What goes on the wire.** A content-free `fieldObservation` block per adapter report: `{ checkpoints: [{event, effect, lastAt, count}], route: {provider, traffic, decisions, firstAt, lastAt} }`. No paths, no prompts, no tokens — the ledger already holds only closed-vocabulary ids, counts and RFC3339 timestamps (`fieldobs.go:87-110`), so this widens no content surface.

Why it matters: without it the console cannot render "hook observed 3 minutes ago" or "this route carried traffic and decided nothing", which are two of the strategy's named evidence-basis lines, and Task 6's posture must fall back to the endpoint's self-report for observation — the exact provenance laundering `NO_QUALIFYING_ENFORCEMENT_PROOF` exists to prevent.

**Blast radius:** heartbeat payload grows by a bounded block (cap it: 16 checkpoints, 2 providers, matching the existing `RUNTIME_ADAPTER_MAX_*` bounds). If the Backend half is not deployed first, the field is silently dropped and the console shows nothing new — degraded, not broken, and now **counted** thanks to Task 5. If the Backend half is deployed and the agent never ships, the field is absent and every consumer must treat absence as NOT MEASURED, never as zero.
**Rollback:** revert the agent projection; the Backend keeps accepting a field nobody sends, which is inert. Do **not** roll the Backend back below an agent that is already shipping the field — that recreates the silent drop.

- [ ] **Backend first.** `runtime-adapter-field-observation.spec.ts` — `it('stores a field-observation block')`, `it('treats absence as null, never as zero')`, `it('bounds the checkpoint list and counts the overflow')`, `it('rejects a provider outside the closed vocabulary without rejecting the report')`. All RED, then GREEN.
- [ ] Backend parity spec updated for `Backend/packages/shared-contracts/` only — see the note in Task 1 on why the workspace-root copy is not a target for these two contracts.
- [ ] **Owner asks for a Backend deploy. Confirm the new ECS task definition is live and `GET /api/v1/ai/protection-depth` round-trips a hand-crafted heartbeat carrying the block.** This is a fresh explicit ask; a green local run is not permission.
- [ ] **Agent second.** `field_observation_test.go` — assert the projected block equals `fieldobs.Load(dir)` for a seeded ledger, and that an unreadable ledger yields the field **absent**, never a zeroed block.
- [ ] Assert the block carries no path, no prompt and no token: a sweep test over the marshalled JSON asserting every string value matches a closed vocabulary, a hex id, or an RFC3339 timestamp.

**Defeat test:** `treats absence as null, never as zero` — revert the Backend normalizer to default `fieldObservation` to `{checkpoints: [], route: {traffic: 0, decisions: 0}}` when absent, expect RED with `an agent that does not report observations must not be recorded as having observed zero`.
**Exit:** a heartbeat from a 7.10.7+ agent lands a non-null `fieldObservation` on the control-state row; a heartbeat from 7.10.6 lands `null` and the console renders "not reported"; `GET /api/v1/health/agent-wire-drift` shows **zero** drops under `RuntimeAdapterReport.fieldObservation` after the deploy (proving the ordering held).

---

## Task 9: Compose the daemon's own posture, and stop anything reading open `/health` as governance

**Files:**
- `Installers/internal/coveragetruth/posture.go` (extend with a local composition sharing Task 1's vocabulary)
- `Installers/internal/daemon/server.go` (`handleHealthDetail`, `:1388-1465` — add one key)
- `Installers/internal/daemon/health_governance_posture_test.go` (new)
- `Installers/internal/daemon/health_open_body_test.go` (extend the existing `TestHealthOpenBody_ExactlyLivenessKeys`)
- `Installers/install-scripts/production/install.ps1` (`:2745-2760`), `install.sh` (`:138-160`)

**What changes, and what deliberately does not.** The open `/health` body **stays exactly five keys**. Do not add a posture field to it: `handleHealth`'s doc (`server.go:1341-1358`) records that publishing posture to any local process is the reconnaissance step before acting unreported, and `TestHealthOpenBody_ExactlyLivenessKeys` is the guard. **Never weaken an existing guard to make a task fit.**

Instead: add `resp["governancePosture"]` to the **token-gated** `/v1/health/detail`, computed by the same `derivePreventionPosture` logic and emitting slugs from the same frozen vocabulary as Task 6. Today that route returns eleven independent posture blocks and no verdict over them; a reader must compose it themselves, which nobody does.

Then fix the *claim* at the consumers: `install.ps1` and `install.sh` currently log a successful `/health` probe as reachability. Change the success line to name what was and was not established — `"daemon reachable (liveness only; governance posture is not readable without a capability token)"` — and pin it with the existing `install_hook_parity_contract_test.go` pattern so it cannot silently regress to "we are up".

**Blast radius:** one new key on a token-gated route (a client that does not know it ignores it) and two install-script log strings. `install.ps1:2745-2754` reads only `daemon` and `version` off the open body and is untouched. The parity contract test pins the new wording, so the failure mode of a mistake here is a red gate, not a bad install.
**Rollback:** delete the `governancePosture` key and revert the two log strings. Nothing depends on either.

- [ ] `TestHealthOpenBodyStillHasExactlyFiveKeys` — run the **existing** test first and confirm it is green; it must remain green, byte-for-byte unmodified, at the end of this task. If it goes red, the task was implemented wrongly.
- [ ] `TestHealthDetailCarriesGovernancePosture`: assert the token-gated body contains `governancePosture` with a `state` from the six-value vocabulary and a `reasons` array. Run: RED.
- [ ] `TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary`: seed a daemon with no canary receipt, assert `state !== "PREVENTION_ACTIVE"` and `reasons` contains `canary-never-run`. Run: RED.
- [ ] `TestHealthDetailPostureUsesTheSharedVocabulary`: every emitted slug is a member of the embedded `coverage-posture.v1.json` reason list. Run: RED.
- [ ] `TestInstallScriptsDoNotClaimGovernanceFromLiveness` (in `install-scripts/production/`): assert neither script contains a success string asserting governance in the `/health`-probe branch, and both contain the liveness-only wording. Run: RED.
- [ ] Implement. All four new tests GREEN, the open-body test untouched and green.

**Defeat test:** `TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary` — revert by defaulting the local composition's canary gate to satisfied when no receipt is present, expect RED with `local posture read PREVENTION_ACTIVE with no canary receipt on this endpoint`.
**Exit:** `curl -H "<token>" localhost:19280/v1/health/detail | jq .governancePosture.state` returns a vocabulary member on a real box; `curl localhost:19280/health | jq 'keys'` still returns exactly `["daemon","status","uptime","version","wireProxy"]`; local and backend posture emit slugs from one file, asserted by a test on each side against the same vector.

---

## Task 10: Render per-host × per-surface posture in the console, with no rolled-up green

**Files:**
- `Frontend/app/ai-control-plane/coverage-posture.tsx` (new)
- `Frontend/app/ai-control-plane/protection-depth.tsx` (add the posture badge to `AdapterCard` at `:2419` and the endpoint drill; do **not** touch `resolveEnforcementProof` at `:829-861` or `EnforcementProofFleetRollup` at `:1065`)
- `Frontend/app/admin/endpoints/coverage-section.tsx` (`:1756` — add the fleet ratio strip beside `RuntimeProtectionDepthPanel`)
- `Frontend/types/ai-governance.ts` (the ambient mirror the harness README warns about)
- `Frontend/app/ai-control-plane/__tests__/coverage-posture.test.tsx` (new)

**What it must show.** Per host and per surface, never rolled up:

- The posture badge, with its reason list expanded on the card, not behind a tooltip. A state with reasons the reader cannot see is a roll-up in a different shape.
- The evidence basis beside the state, in the strategy's own phrasing: "hook observed 3 minutes ago", "2 undecided invocations in the last hour", "route carried 4 requests and 0 decisions", "desktop binary 0.147.0, certificate …, expires …". Every one of these is a field this wave puts on the wire or the server already holds.
- The seven fleet ratios as `numerator / denominator` with the freshness window, **never as a bare percentage**, and `forced-egress` rendered as "not measured" — never as a red 0% and never omitted.
- Drill from the runtime summary to the exact host, binary hash, route, capability and evidence. `SurfaceCertificateDims` (`protection-depth.tsx:1630`) already renders the seven dimensions with "not reported" for a null; reuse it rather than writing a second projection.

Follow the calm-design constraint: signal tokens, neutral surfaces, no bright colours, no emoji, no gradients. State the fact; never the in-house rationale for why we built it that way.

**Blast radius:** one console panel. A wrong badge misleads an administrator, which is precisely the harm this wave exists to remove — hence Task 11 gates it. No enforcement, no wire, no store.
**Rollback:** remove the new component's mount points; `protection-depth.tsx`'s existing components are untouched by construction.

- [ ] `it('renders the reason list, not just the state')`: a `DEGRADED` fixture with three reasons renders all three visibly. Run: RED.
- [ ] `it('renders forced-egress as not measured, never as 0%')`: assert the strip contains `not measured` and does **not** contain `0%` for that metric. Run: RED.
- [ ] `it('never renders a percentage without its denominator')`: for every ratio, assert the rendered text contains the `n / d` form. Run: RED.
- [ ] `it('does not roll up two hosts into one badge')`: two endpoints with different postures render two badges. Run: RED.
- [ ] `it('renders absent observation as "not reported", never as zero')`: `fieldObservation: null` (a 7.10.6 agent) must not render `0 decisions`. Run: RED.
- [ ] Implement. All five GREEN. `npm test -- protection-depth` must stay green **unmodified** — the existing truth-signal suites (`protection-depth-truth-signals`, `protection-depth-identity-and-accounting`, `f38-enforcement-proof`) are guards, not obstacles.
- [ ] D1 by hand, per the harness README's own gap note: grep **every** render file for `posture`, `fleet`, `fieldObservation` — not only the files edited.

**Defeat test:** `renders absent observation as "not reported", never as zero` — revert by defaulting `fieldObservation` to `{traffic: 0, decisions: 0}` in the view model, expect RED with `an unreported observation rendered as a measured zero`.
**Exit:** `/admin/endpoints` shows one posture badge per (host × surface) with its full reason list; the fleet strip shows seven `n / d` ratios with `forced-egress` reading "not measured"; five new tests green; every pre-existing protection-depth suite green without modification.

---

## Task 11: Gate console truth with the render harness, as a repeatable run

**Files:**
- `Frontend/scripts/render-harness/fixtures.cjs` (two new scenarios)
- `Frontend/scripts/render-harness/README.md` (scenario table + the new gate)
- `Frontend/scripts/render-harness/coverage-truth-gate.md` (new — the runnable command block and its expected verdicts)

**The two new scenarios.** Add them to the existing six, following the README's rule that `empty-tenant` and `absent-data` are different claims and must never share copy:

- **`posture-unmeasured`** — every endpoint present and attesting, every *optional* measurement omitted: `posture: null`, `fieldObservation: null`, `undecidable: null`, `summary.fleet` entries all `measured: false`. **A zero, a percentage, or the string "Prevention Active" anywhere on this screen is a finding.**
- **`posture-degraded`** — endpoints with real postures, non-empty reason lists, a `forced-egress` entry that is `measured: false`, and one endpoint whose `posture.state` is `UNKNOWN`. The screen must distinguish UNKNOWN from DEGRADED in copy, not only in colour.

**The gate, as one runnable command per scenario:**

```bash
# governance may never read green over an unmeasured wire state
node scripts/render-harness/shoot.cjs --scenario posture-unmeasured \
  --routes admin/endpoints --strict --retries 0 \
  --forbid "Prevention Active||PREVENTION_ACTIVE||0%||100%" \
  --expect "not measured||not reported"

# unknown and degraded must not share copy
node scripts/render-harness/shoot.cjs --scenario posture-degraded \
  --routes admin/endpoints --strict --retries 0 \
  --expect "UNKNOWN||DEGRADED||not measured" \
  --forbid "Prevention Active"
```

`--strict` is not optional: it fails a shot when the console asks for a path no scenario answers, i.e. when the screen is sitting on data nobody chose. `--retries 0` is not optional either: a forbidden string is a fact about the console and must be reported on the first attempt.

**Record the harness's stated limits verbatim in any report built on this run**, because they are real: nothing here talks to a real Backend, so a green run says the console renders honestly *given that wire state* and says nothing about whether any Backend produces it; there is no live-update channel; it drives `next dev`, not a production build. Do not round "the screen looked right" up to "the feature works".

**Blast radius:** test fixtures and documentation. Zero product code. The one hazard the README names: *"A fixture that omits a required field crashes the console, and the crash looks exactly like a product bug; six invented shapes cost most of a day the last time this was built."* Open `Frontend/types/ai-governance.ts` **first** and build both scenarios from the real types.
**Rollback:** delete the two scenarios. The existing six are untouched.

- [ ] Prove the harness can still fail, before trusting any result — run the README's two standing checks (`--routes no-such-route` must exit 1 on `doc-status`+`blank`; `--scenario broken-fixture --routes coding-ai/detections` must exit 1 on `never-settled`). If either goes green, stop.
- [ ] Add `posture-unmeasured`. Run the first gate command **before** Task 10 lands: it must FAIL on `missing-text` (the console has no "not measured" copy yet). That failure is the RED.
- [ ] Add `posture-degraded`. Run the second gate: FAIL on `missing-text`.
- [ ] After Task 10, both gates exit 0. Bank `.txt` and `.json` per route.
- [ ] Write `coverage-truth-gate.md` with the commands, the expected verdicts, and the harness's limits restated in its own words.

**Defeat test:** the `posture-unmeasured` gate — revert Task 10's fleet strip so `forced-egress` renders `0%`, expect RED with `FAIL forbidden-text: "0%"` and exit 1.
**Exit:** `Frontend/scripts/render-harness/fixtures.cjs` lists eight scenarios; both gate commands exit 0 against the built console and exit 1 against the reverted mutation; `coverage-truth-gate.md` exists with the banked `.txt` evidence path.

---

## Wave exit criteria

1. **The vocabulary is one file.** `Installers/parity-vectors/coverage-posture.v1.json` holds exactly 6 states and 24 reason slugs; a Go test and a TS parity spec both assert equality with it, in order. *Defeat: `coverage-posture-contract.parity.spec.ts` — delete `"CONTAINED"` from the vector.* (Task 1)
2. **`PREVENTION_ACTIVE` is impossible without a recent canary and a valid capability certificate**, and the equivalence `state === 'PREVENTION_ACTIVE' ⟺ reasons.length === 0` holds over a generated matrix of at least 256 gate combinations. *Defeat: `never returns PREVENTION_ACTIVE while direct egress is unmeasured`.* (Task 6) — this is the strategy's Phase 3 gate, met.
3. **Zero endpoints in the production tenant read `PREVENTION_ACTIVE`**, and every one names `direct-egress-not-measured` among its reasons. A run that produces a green endpoint before the Workstream 4 wave lands is a defect in this wave, not a success. (Task 6)
4. **No `[OK]` over an undecided count on either lane.** `devoid ai hooks-status codex` exits non-zero on undecided > 0, vendor-discarded > 0, or an unreadable counter, and the Claude and Codex verdict lines carry identical clause text. *Defeat: `TestCodexVerdictIsNotOKOverUndecidedInvocations`.* (Task 2)
5. **A route that carried traffic and decided nothing says so.** `Route.Traffic` moves independently of `Route.Decisions`, and the string "no request has ever travelled this route" is unreachable when traffic > 0. *Defeat: `TestRouteStatusSaysTrafficUngoverned`.* (Task 3)
6. **A truncated inventory walk cannot log "complete."** *Defeat: `TestUserSweepDoesNotSayCompleteOnATruncatedWalk`.* (Task 4)
7. **Field-level agent-wire loss is counted and persisted**, so a future ordering mistake is visible rather than silent: one mistyped optional field inside a valid adapter report produces a non-empty `droppedKeyPaths` on the row and a non-zero count at `GET /api/v1/health/agent-wire-drift`, and zero heartbeats are rejected. *Defeat: `reports a mistyped undecidable block as a dropped key path`.* (Task 5)
8. **Every fleet number ships its denominator.** `summary.fleet` has exactly 7 entries; no percentage is serialised; `forced-egress` is `measured: false` with null numerator and denominator. *Defeat: `reports forced-egress as unmeasured, never as zero`.* (Task 7)
9. **The open `/health` body is still exactly five keys**, unchanged, with its pinning test green and unmodified — while `/v1/health/detail` carries a composed `governancePosture` using the same vocabulary as the Backend. *Defeat: `TestHealthDetailPostureIsNeverPreventionActiveWithoutACanary`; guard: the untouched `TestHealthOpenBody_ExactlyLivenessKeys`.* (Task 9)
10. **The console can be driven to a wire state where nothing is measured and produces no green.** Both render-harness gate commands exit 0 against the shipped console and exit 1 against the reverted mutation, with banked `.txt` evidence. *Defeat: the `posture-unmeasured` gate with `forced-egress` reverted to `0%`.* (Tasks 10, 11)
11. **Ordering held.** After the Task 8 agent release, `GET /api/v1/health/agent-wire-drift` shows zero drops under `RuntimeAdapterReport.fieldObservation` — the positive proof that the Backend was deployed first. (Tasks 5, 8)

---

## What this wave deliberately does NOT do

**It adds no enforcement branch anywhere.** Every task in this wave changes what is *reported*, what a *read route* returns, or what an *exit code* says. Nothing changes what any endpoint permits or denies. That is deliberate: a fail-closed checkpoint on an unprovable condition bricked a machine in July 2026 and the operator removed the agent, and an uninstalled control protects nobody. Coverage truth is a reporting problem and it is solved with reporting.

**The one behaviour change is an exit code** — `devoid ai hooks-status codex` — and its blast radius is bounded and known: `install.sh:583-586` sets `AI_GOVERNANCE_STATE="gap"` and **returns 0**, so no install fails. A fresh box does not go red because `UndecidableCounterNeverWritten` counts as measured (`internal/security/ai_hook_undecidable.go:95-111`).

**It does not weaken `RuntimeAdapterRenderState`.** An undecided count does not demote `observed` to something else in the existing eight-state vocabulary. That vocabulary is consumed by six Frontend suites and a compile-error-on-a-ninth-state invariant; mutating it to carry a new gate would put the new logic behind an existing guard. The posture composition is **additive and parallel** — one derivation, two independent axes, exactly as `deploymentAssurance` is already kept an independent axis rather than fused into the state badge.

**It does not open the `/health` body.** SOT §14.3's finding is real, but widening the open body publishes governance posture to any local process — including one an AI agent spawned — which is the reconnaissance step DF-72 removed. The strongest safe subset is: leave the five-key liveness document alone, put the composed verdict behind the existing token gate, and fix the *consumers' claim*. The pinning test `TestHealthOpenBody_ExactlyLivenessKeys` must be green and unmodified at the end of this wave.

**It cannot make "% with forced egress" measurable.** No WFP / direct-egress denial code exists in `Installers/origin/main` — that is Workstream 4's build. Writing a task here that emits a forced-egress number would be pretending an external dependency is engineering. The metric ships as `measured: false` with a null numerator and denominator, and `direct-egress-not-measured` blocks `PREVENTION_ACTIVE` on every endpoint until that wave lands. **This is the correct output of this wave, not a shortfall in it.**

**It does not add a session dimension.** `RuntimeBindingShape` (`Backend/src/ai-governance/runtime-adapter-shape.ts:74-114`) has `principalHash` (user) but nothing session-scoped, and `runtimeInstanceId` is built from the stable dims. Adding a session dimension changes the identity key, which re-keys every existing row and would make yesterday's one instance today's many — the exact failure `stableIdentity` was introduced to prevent. It is declared as `session-dimension-unavailable` and left to the wave that owns runtime identity (Workstream 1).

**It does not fix the 4-second decision budget or the 60-second hook timeout.** Both are unchanged and verified today: `HookDecisionBudget = 4 * time.Second` (`Installers/internal/airuntime/runner.go:52`) and the 60-second host timeout (`internal/aihooks/settings.go`). The 6-in-10 leak of SOT §15.1 is a *reliability* problem owned by the Workstream 2 wave. This wave makes that leak **visible on both lanes and in the fleet**; it does not make it stop.

**It does not implement the canary receipt sink.** `Receipts:` is assigned in four places and all four are test files (`internal/airuntimeintegrity/providers/claude/canary.go:55-59`, `:335-343`), and `aicanary.Run` hard-codes a 5-second `WaitDelay` (`internal/aicanary/exec.go:125`) that classifies a real deny as a launch failure. Both are Workstream 3/8 work. Task 6 consumes the receipt-backed proof **when it exists** and correctly reports `canary-receipt-not-held` until it does.

**It does not touch the Codex dialect pin.** `internal/codexmanaged/hookdialect.go:99-115` answers no for 0.145/0.146/0.148/0.149-alpha, including the build the desktop app runs. Widening it without two vendor artefacts per family is how that lane went silently dead the first time. A dialect miss surfaces here as `cooperative-lane-only` / `runtime-binary-uncertified`, which is the honest report.

**It bans one shortcut explicitly.** Do not make any denominator measurable by lowering what it measures. If a metric cannot be established, it ships `measured: false` — "unknown is not clean" is the rule, and a metric quietly redefined to something reportable is the same false green in a new costume.
