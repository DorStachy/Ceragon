# Wave 8 — Bind every consequential action to an authoritative checkpoint, then certify what that buys

**Depends on:** every prior wave. Specifically: Wave −1 (repo-qualified references, catalog digests),
Wave 2 (evidence grades — a certificate cannot report `evidenceStrength` the wire does not carry),
Wave 3 + 3B (per-class denominators, mandatory `--engine-version` — D18 forbids citing a number this
wave did not get from a repaired instrument), Wave 4A/4B/4C (the residuals and the effect resolver
this wave binds approvals to), Wave 5 (the console surface the certificate projects onto), Wave 6
(adjudicated triage feeding `downgradeTriggers`), Wave 7A/7B (the scanner rows of the manifest).

**Implements decisions:** D14 (keep fail-open, force it into a non-green state), D17 (this packet
delivers dimensions, not risk certificates), D15 and D16 as *recorded constraints on the certificate*
rather than as new engineering.

**Certificate impact:** this is the wave that *creates* the certificate, so everything else in the
plan is UNKNOWN until it lands. On completion **R1, R3 and R4 remain `NOT_READY` on F16 alone**;
**R2 remains `NOT_READY` on branch protection alone**; **R5 remains `NOT_READY` on D16 alone**. The
four dimensions that can reach PASS — scanner execution truth, tool-risk policy authority, measurement
substrate integrity, console truth — reach it *here*, because a dimension with no expiring manifest is
an assertion, not a certificate.

---

## Context an engineer needs

### 1. The effect-bound approval transaction is CONNECTED. Do not build one.

v1 line 43 says the effect-bound approval transaction is *"Built, tested, non-replayable — not
connected to the command lane."* **That was already false when it was written**, and the 2026-08-23
review adopted it without opening the source. Verified on `Installers@origin/main` (`5b129523`):

- `Installers/internal/daemon/ai_handlers.go:3054-3055` — the WS-D taint overlay condition:
  `if taintReason, tainted := s.aiTaint.IsTainted(body.SessionID); tainted && decision != aiDecisionBlock && taintRisky(...)`
- `:3056` sets `decision = aiDecisionHold`.
- `:3063` — `approval := s.resolveToolHoldApproval(body, toolFindingClasses(findings), taintReason)`
- `:3065-3072` — `case toolHoldGranted:` a one-use claim **and** consume → `aiDecisionAllow` +
  `emitToolCallReleased`.
- `:3073-3078` — `case toolHoldDenied:` → `aiDecisionBlock` + `emitToolCallHeld`.
- `default:` — pending / expired / unactionable leaves the local hold floor standing. An unreachable
  authority can never soften the decision.

The producer is `Installers/internal/daemon/ai_tool_hold_approval.go` — `resolveToolHoldApproval` at
`:261`, `answerExistingToolHold` at `:283`, `consumeToolHoldGrant` at `:334`, `createToolHoldApproval`
at `:398`. Server side: `Backend/src/ai-governance/controllers/ai-delegated-approval.controller.ts`
plus `services/ai-delegated-approval-authority.service.ts` and
`services/ai-delegated-approval-presence.service.ts`.

**The review's conclusion still holds; only its premise was wrong.** The transaction is wired to
exactly one gate — the taint overlay — and to exactly one lane, the tool lane. **The work in this wave
is to WIDEN an already-working transaction, not to wire one.** An engineer who starts by building a
broker will duplicate a shipped, tested, non-replayable mechanism and will be reviewed out.

### 2. What the binding binds today, and what P0-16 requires it to bind

`toolHoldBinding` (`Installers/internal/daemon/ai_tool_hold_approval.go:145-206`) derives a
content-free binding from a four-part preimage joined with NUL bytes:

```
nonEmptyAgentType(body.AgentType) \x00 body.SessionID \x00 body.ToolName \x00 json.Marshal(body.ToolInput)
```

and returns `BindingKey`, `ActionID`, `ActionType` (`"AI_TOOL_CALL"`), `ProposalFingerprint`,
`BeforeDigest`, `PreparedDigest`, `PolicyRevision`, `PolicyDigest`, `DecisionID`, `DecisionDigest`,
`GrantableObligationsDigest`, `ResourceRef` (`"tool:" + safeEvidenceToolName(...)`), `DestinationRef`
(binding-derived), `GrantableObligationIDs`. Expiry exists (`toolHoldApprovalTTL = 14 * time.Minute`
at `:72`, plus `adoptAuthorityExpiry` at `:378`); one-use consumption exists (`:334`).

Against P0-16's required binding set, these are **missing**: subject identity (which human/endpoint),
runtime and **executable** identity, **normalized effect** (the preimage hashes the raw `ToolInput`,
so `rm -rf ./build` and the same command with a trailing space are two different bindings and an
equivalent-but-respelled command is a third), real resource id, real destination, credential scope,
and artifact digest. `ResourceRef` is the tool *name*, which is `"Bash"` for the entire dangerous-command
surface.

### 3. The load-driven fail-open is the live proof, and it is measured

Two different budgets, both shipped, both verified:

- `Installers/internal/aihooks/settings.go:111` — `promptSubmitTimeoutSeconds = 60`, returned
  uniformly for every managed event by `hookTimeoutFor` (`:546-547`). This is the **host** budget we
  write into the client's settings.
- `Installers/internal/airuntime/runner.go:52` — `HookDecisionBudget = 4 * time.Second`. This is
  **our own** budget for the daemon round-trip.

Measured 2026-08-26 and recorded verbatim in `Installers/internal/liveproof/register.json` under
proof id `hook-lane-prompt-block`: ten identical private-key prompts at the shipped 60 s host timeout.
**Four were blocked with zero requests to the model endpoint. Six were not, and the private-key bytes
egressed.** The split tracks wall clock, not content — blocked runs 27–55 s, leaking runs 63–143 s,
and the leaks began the moment a Docker build put the box under load. `~/.devoid/undecidable-hook-payloads.json`
(written by `Installers/internal/security/ai_hook_undecidable.go:54`) held
`{"total":11,"byAdapter":{"claude-code":11},"byReason":{"daemon-unreachable-budget-expired":11}}`
across the exact window, while `devoid ai hooks-status claude-code --project` printed
`[OK] All DeVoid hooks installed — 5 of 5 have fired`.

**The reporting half shipped in 7.10.6** (`Installers@40f34362`): `undecidedVerdictTerm`
(`Installers/cmd/devoid/ai.go:725`) now rides the primary line in all three states and decides the
command's exit code, and `printVendorHookFailOpenTo` (`:767`) was widened from the Codex printer to
every adapter. `codexfailopen` (`Installers/internal/codexfailopen/observer.go`) is the spawn-side
marker observer; `codexmanaged.AssessHookCoverage`
(`Installers/internal/codexmanaged/failopen_coverage.go:101`) turns its report into a three-state
answer — `CLAIMABLE` / `REFUSED` / `UNMEASURED` (`:54`, `:57`, `:59`) — and its standing prohibition
is already guarded by `TestVendorFailOpenDisclosureNeverBuysAGreenVerdict`
(`failopen_coverage_test.go:167`).

**What remains is exactly D14.** `AssessHookCoverage` has **one** production consumer in the whole
workspace — `Installers/cmd/devoid/ai.go:774`, a CLI printer. The count reaches the Backend by a
different road (`Installers/internal/daemon/codex_failopen_attest.go:122` reaps markers into one
`HOOK_UNDECIDABLE` evidence row per adapter with `reason=vendorDiscarded`, plus an explicit
zero-count `vendorFailOpenNotMeasured` row) and lands in the endpoint's Events ledger. **Nothing
anywhere converts either signal into a non-green certificate state**, because no certificate exists.

### 4. The canary reports a real deny as a launch failure

`Installers/internal/aicanary/exec.go:125` sets `cmd.WaitDelay = 5 * time.Second`. The Codex turn
holds the captured pipes longer than that after the child exits, so `cmd.Run()` returns
`exec: WaitDelay expired before I/O complete`. That error is not an `*exec.ExitError` and `runCtx.Err()`
is nil, so `finish` (`exec.go:144`) falls to its default branch and returns the error; the caller
maps *any* non-nil probe error to `CanaryError` + `CanarySlugHostLaunchFailed`
(`Installers/internal/codexmanaged/canary.go:351`, slug defined `:58`). Recorded in
`Installers/internal/codexmanaged/testdata/liveproof/ledger.json`: two of six
`TestLiveCanary_RealCodexHost` attempts returned `canary-host-launch-failed` on invocations where the
client, in the same launch, printed `hook: UserPromptSubmit Blocked`. Re-measured on identical argv
with a 90 s `WaitDelay`: `waitErr=nil`, exit 0, 11.3 s wall clock, full transcript captured including
the `Blocked` line. See also `Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md:554-556`.

**A live canary that reports enforcement successes as errors cannot be the evidence lane for a
certificate.** Fix it before Task 9 runs.

### 5. Prior art you must reuse, not rebuild

| Thing | Where | Why it matters here |
|---|---|---|
| Live-proof register with expiring quarantine | `Installers/internal/liveproof/liveproof.go` (`Validate` at `:104`, `Unobserved` at `:203`, `ReviewBy` at `:83`) + `register.json` | 8 proofs, **3 observed, 5 quarantined with `reviewBy: 2026-11-05`**. It already refuses an unobserved control with no quarantine, refuses an open-ended quarantine, expires on the date, and refuses to go green on a flipped boolean without pasted evidence. That is the certificate's `proof` block, already built. |
| Signed rollout rings | `Backend/src/ai-policy-delivery/policy-integrity.types.ts:20` (`AI_DELIVERY_ROLLOUT_PHASES = ['SHADOW','CANARY','ENFORCE']`), `:27` (`AI_DELIVERY_COHORT_BASIS_POINTS_MAX = 10000`), `:109` `evaluateRolloutProgression`, `:399` `rolloutBucketBasisPoints`; service `ai-policy-rollout.service.ts:129` `setRolloutAuthority`, `:191` `assertProgressionAllowed` | 5% → 25% → 100% is `cohortBasisPoints` 500 → 2500 → 10000. Assignment is a stable hash of `(org, segment, endpoint)` so raising the cohort only ever adds endpoints. ENFORCE cannot be entered except from a non-empty CANARY ring, and one write may not max both phase and cohort. **Do not write a second rollout mechanism.** |
| Fleet canary rollup + receipts | `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:81` `canaryFleetRollupFrom`, `:209` `canaryFleetRollup`, `:507` receipt recording | Counts-only rollup that already refuses to count a never-consumed challenge as a canary that ran. |
| Rollback intents | `Backend/src/ai-policy-delivery/ai-policy-rollback.service.ts` — reason codes at `:9-15`, `FALSE_POSITIVE_STORM` at `:11` | Forward-only: an operator selects a historical policy snapshot, never a bundle revision, so nothing here can lower a revision. **It is entirely operator-initiated; no monitor computes `FALSE_POSITIVE_STORM`.** |
| Four-axis receipt truth | `Installers/internal/daemon/ai_handlers.go:2940-2955`; the standalone route is a deliberate tombstone returning 410 (`internal/daemon/ai_effect_receipt.go:12-18`) | Receipts attach to the terminal event atomically. Do not resurrect standalone receipt rows. |

### 6. Traps

- **Do not widen `taintRisky` or weaken it to widen mediation.** Risk 5's poisoned-session HOLD is a
  real control. Its input defect (any non-INFO raw finding, never policy-filtered) belongs to Wave 4B
  and requires paired benign-sequence precision and poisoned-sequence recall *before* any narrowing.
  Widening mediation to more sinks is orthogonal to that fix and must not be used as cover for it.
- **Do not raise `warnDialogTimeoutSeconds`** (`Installers/cmd/devoid/ai_warn_dialog.go:85`, value 30).
  The arithmetic is 30 s dialog + 10 s PowerShell process cap = 40 s worst case inside a 60 s host
  budget, leaving 20 s for the daemon round-trip. Raising it reproduces the orphaned-dialog hang.
  Lowering the fail-open by shortening the *host* budget is equally wrong for the same reason.
- **Do not widen the Codex hook-trust dialect pin.** `Installers/internal/codexmanaged/hookdialect.go:112`
  carries two rows, `0.144.` and `0.147.`; the owner's client is `0.149.0-alpha.4.1`. Widening the pin
  is forbidden by prior decision — the fix lives at `verify.go:608`. The Codex surface's
  safeguards-on column therefore stays **UNKNOWN** on that box and belongs on the system card as
  such (Task 11).
- **F16 can permanently brick an endpoint.** `Installers/cmd/devoid/setup_installer.go:170-178`
  records the permanent 409 — *"Endpoint signing-key rotation requires the approved rotation
  protocol"* — with no client-side latch and no self-recovery. Any change to mint/convergence that
  presents the backend a key its row has never seen takes that 409 forever. Task 10 is written
  accordingly.
- **Backend deploys before any agent release** whenever a contract widens. Tasks 4, 6 and 8 widen
  Backend contracts; Tasks 1–5 and 10 touch the agent.
- **`git fetch` first.** Every line number above is against the SHAs in the spine's rebase manifest.

---

## Task 1: Enumerate every high-impact sink and make the inventory a gate, not a document

**Files:**
`Installers/internal/daemon/sink_inventory.go` (new),
`Installers/internal/daemon/sink_inventory_test.go` (new),
`Installers/internal/daemon/server.go` (route registration — read only, do not re-route yet),
`.plans/m47a-20260822/v2-waves/artifacts/sink-inventory.json` (new, generated)

- [ ] Write the failing test first: `TestEverySinkIsClassified` walks the registered route table
      and the CLI command table and fails on any decision-producing entry point absent from
      `sinkInventory`. Expected failure text: `sink not classified: POST /v1/ai/<route>`.
- [ ] Seed `sinkInventory` from the verified route table
      (`Installers/internal/daemon/server.go`, `git grep -n "HandleFunc" origin/main -- internal/daemon/server.go`).
      Each row declares: `id`, `entryPoint`, `lane`, `canPermitEffect` (bool), `mediated`
      (`none | taint-overlay | authoritative`), `owner`, and the certificate dimension it feeds.
      Verified seed set:

      | id | entry point | mediated today |
      |---|---|---|
      | `S1-tool-call` | `POST /v1/ai/tool-decision` → `handleAIToolDecision` (`ai_handlers.go:2680`) | `taint-overlay` only (`:3054-3078`) |
      | `S2-prompt-egress` | `POST /v1/ai/prompt-check` → `handleAIPromptCheck` (`ai_handlers.go:1169`) | `none` |
      | `S3-tool-result-ingress` | `POST /v1/ai/post-tool` (`server.go:629`) | `none` |
      | `S4-permission` | `POST /v1/ai/permission` (`server.go:636`) | `none` |
      | `S5-artifact-admission` | `POST /v1/ai/artifact-submit` (`server.go:661`), `/artifact-decision` (`:664`) | `none` |
      | `S6-human-release` | `/v1/ai/allow-once` (`:649`), `/v1/ai/tool-warn-answer` (`:650`), `/v1/ai/prompt-warn-answer` (`:655`) | `none` — these are the release channel and must be bound to the same transaction |
      | `S7-exception-request` | `POST /v1/ai/exception-request` (`server.go:675`) | `none` |
      | `S8-redact-consent` | `POST /v1/ai/redact-consent` (`server.go:665`) | `none` |
      | `S9-package-install` | `devoid install-package` (`Installers/cmd/devoid/main.go:412`) | `none` |
      | `S10-plugin-skill-config-write` | `Installers/cmd/devoid/ai_plugingate.go:91` `recognizePluginToolCall`, `:123` `pickConfigWriteRequest`; `ai_skillgate.go:137` | rides S1; the config-write recognizer is its own sink |
      | `S11-browser-nav` | decided in the extension; the daemon receives only `/v1/browser/nav-blocked` (`server.go:603`) and `/v1/browser/receipt` (`:604`) | `none` — **and it is not a checkpoint at all, it is a reporting lane**: the decision is made off-daemon |
      | `S12-proxy-wire` | `Installers/internal/proxy` (`ai_ingress.go:319` monitored branch) | `none` |
      | `S13-config-change-checkpoint` | named in `Installers/internal/liveproof/register.json` as `config-change-checkpoint`, `observed: false` | `none`, and never observed in the field |

- [ ] For any sink the seed set does not cover, run the discovery command rather than guessing:
      `cd Installers && git grep -n "aiDecisionBlock\|aiDecisionHold\|aiDecisionAllow" origin/main -- internal/daemon internal/proxy | grep -v _test`
      and `git grep -n "HandleFunc" origin/main -- internal/daemon/server.go`. The desktop-egress
      lane (M4.6b) and any MCP runtime sink added after `5b129523` **must** be resolved this way;
      this plan does not name their file:line because they were not verified in this pass.
- [ ] Emit `sink-inventory.json` from the Go table, digest it, and make the digest a manifest field
      (`system.sinkInventoryDigest`), so the certificate names the sink set it was computed over.

**Defeat test:** `TestEverySinkIsClassified` — add a new `mux.HandleFunc("POST /v1/ai/probe-sink", …)`
to `server.go` and it goes RED with `sink not classified: POST /v1/ai/probe-sink`. Revert the route,
green again.

**Exit:** `sink-inventory.json` exists, carries **13 or more** rows, every row has a non-empty
`mediated` value, and the count of rows with `canPermitEffect: true && mediated: "none"` is published
as `metrics.mediationGap.numerator` over the total. Today that number is **11 of 13**.

---

## Task 2: Widen the binding from four fields to the P0-16 field set

**Files:**
`Installers/internal/daemon/ai_tool_hold_approval.go` (`toolHoldBinding` at `:145`, record type at `:110-136`),
`Installers/internal/daemon/ai_tool_hold_approval_binding_test.go` (new),
`Backend/src/ai-governance/dto/ai-delegated-approval.dto.ts`,
`Backend/src/ai-governance/services/ai-delegated-approval-authority.service.ts`

- [ ] Failing test first: `TestBindingRejectsAChangedEffect` — build a grant for a normalized effect,
      then present the *same* raw `ToolInput` re-spelled (added trailing space, reordered flags,
      `$HOME` vs `~`) and assert the grant does **not** apply. Expected failure text before the fix:
      `binding matched a different normalized effect` is never reached because the two respellings
      produce two unrelated `BindingKey`s and the second silently creates a *new* pending hold — the
      test asserts on the grant being **reusable across a respelling**, which is the actual defect.
- [ ] Extend the preimage to the P0-16 set. Each field is added as its own NUL-separated segment so
      the digest is order-stable and the absent-field case is distinguishable from the empty-value case:
      `subject` (endpoint identity + acting user), `runtime` (`resolvedRuntimeID(body.AgentType)`,
      already computed at `ai_handlers.go:2936`), `executableDigest`, `normalizedEffect` (the Wave 4B
      effect-resolver output, **not** the raw `ToolInput`), `resourceId`, `destination`,
      `credentialScope`, `artifactDigest`, `policyDigest` (already present), `expiry` (already
      present), `useCount` (already present).
- [ ] Keep the record content-free. The tool input stays hashed and unstored; add no raw argv, no
      resource names that are not already public identifiers. The file's own contract at
      `ai_tool_hold_approval.go:31-37` is the standard.
- [ ] **`normalizedEffect` is nullable and its absence is load-bearing.** When Wave 4B's resolver
      returns `INSPECTION_INCOMPLETE`, the binding carries `normalizedEffect: null` and the approval
      path must resolve to hold/restricted — never to a grant. Assert this, do not document it.
- [ ] Mirror every added field on the Backend DTO and persist it on the grant entity, so a reviewer
      approving in the console is approving the same tuple the endpoint will check.

**Defeat test:** `TestBindingRejectsAChangedEffect` — revert `toolHoldBinding` to the four-segment
preimage (`agentType \x00 sessionID \x00 toolName \x00 json(toolInput)`) and it goes RED with
`grant applied to a different executable digest`. Second mutation: delete the `normalizedEffect: null`
arm and `TestIncompleteInspectionNeverGrants` goes RED with `INSPECTION_INCOMPLETE produced state=granted`.

**Exit:** the binding preimage contains **11** declared segments (up from 4), and
`ai-delegated-approval.wire.spec.ts` asserts all 11 survive the round trip to the Backend and back.

---

## Task 3: Route every effect-permitting sink through the withholding checkpoint

**Files:**
`Installers/internal/daemon/ai_handlers.go` (the S1 call site at `:3063` is the template),
`Installers/internal/daemon/mediation.go` (new — one entry point, so a sink cannot acquire a second),
per-sink handlers named by Task 1's inventory,
`Installers/internal/daemon/mediation_coverage_test.go` (new)

- [ ] Failing test first: `TestNoSinkPermitsAnEffectUnmediated` reads `sinkInventory` and fails for
      every row with `canPermitEffect: true && mediated != "authoritative"`. Expected failure text:
      `S2-prompt-egress can permit an effect and is mediated by "none"`. **This test starts RED on
      11 of 13 rows and that is the intended starting state** — it is the wave's progress meter.
- [ ] Extract the S1 branch at `ai_handlers.go:3054-3078` into `mediation.Resolve(sink, binding)`
      with the same four-state answer (`granted` / `denied` / `pending` / `unactionable`) and the same
      invariants: a grant is one-use, claim **and** consume; a denial is strictly stronger than the
      hold; pending/expired/unactionable leaves the local floor exactly where the rulebook put it; an
      unreachable authority can never make the outcome more permissive.
- [ ] Move sinks onto it one at a time, each with its own test and its own commit. Order by blast
      radius: S6 (the human-release channel — it is the release path and is currently unbound), then
      S9, S5, S13, S4, S7, S8, S2, S3, S12. S11 is out of scope for mediation and is recorded as such
      with its owner: the decision is made in the extension, not the daemon.
- [ ] **Restricted mode on authority failure.** Add `mediation.RestrictedMode` — when the local
      authority store is unreadable, the policy digest cannot be resolved, or the sink inventory
      digest does not match the running build, governed mutations are refused and read-only
      operations continue. This is a **new refusal, not a new allow**; assert that no code path can
      enter restricted mode and emit `aiDecisionAllow`.
- [ ] Do not touch `taintRisky`. Widening mediation must not change which sessions are tainted.

**Defeat test:** `TestNoSinkPermitsAnEffectUnmediated` — set any migrated sink's `mediated` back to
`"none"` in the inventory and it goes RED naming that sink. Separately,
`TestRestrictedModeNeverAllows` — make `mediation.Resolve` return `granted` under restricted mode and
it goes RED with `restricted mode produced decision=allow`.

**Exit:** rows with `canPermitEffect: true && mediated: "none"` falls from **11 of 13** to **1 of 13**
(S11, recorded as out of scope with a named owner). Any residual above 1 is named in
`profile.exclusions` and forces the affected lane non-green.

---

## Task 4: Make the fail-open force a non-green certificate state (D14)

**Files:**
`Installers/internal/codexmanaged/failopen_coverage.go` (`AssessHookCoverage` at `:101`),
`Installers/internal/daemon/codex_failopen_attest.go` (`:122`),
`Installers/internal/daemon/undecidable_attest.go` (`foldUndecidableCounters` at `:95`),
`Backend/src/ai-governance/runtime-adapter-shape.ts` (undecidable block, `:779-840`),
`Backend/src/ai-governance/services/runtime-adapter-render.util.ts` (`:608-626`),
the certificate generator from Task 6

- [ ] Failing test first, in the certificate generator: `TestFailOpenForcesNonGreen` builds a
      manifest input in which one adapter reports `HookCoverageRefused` and asserts
      `status != "PASS"`. Expected failure text: `status=PASS with 11 ungoverned invocations`.
- [ ] Add `metrics.ungovernedInvocations` to the manifest: `{ decided, undecided, vendorDiscarded,
      notMeasured, rate, byAdapter, byReason }`. `rate` is `null` when the denominator is zero —
      never `0`, per the same rule `runtime-adapter-render.util.ts:614` already applies.
- [ ] Certificate rule, three-way and mirroring `HookCoverageState` exactly so the two vocabularies
      cannot drift: `REFUSED` → `status: FAIL` for every lane whose enforcement depends on that
      adapter; `UNMEASURED` → `status: UNKNOWN`; `CLAIMABLE` → the lane may be evaluated on its other
      evidence. **`CLAIMABLE` is not a pass**; it is permission to look at the rest.
- [ ] Give `AssessHookCoverage` its second production consumer. It has exactly one today
      (`Installers/cmd/devoid/ai.go:774`, a CLI printer). The consumer added here is the manifest
      producer, not another printer.
- [ ] Add `vendorFailOpen` to the certificate's `downgradeTriggers` with a stated threshold:
      **any** `vendorDiscarded > 0` in the certificate window downgrades. There is no acceptable
      non-zero rate for an action that ran with no verdict behind it.
- [ ] Do **not** add a `vendorDiscarded` key to the controls block on the wire. The endpoint-side
      comment at `codex_failopen_attest.go:24-35` explains why: `TestUndecidableWireNamesAreTheClosedBucketVocabulary`
      asserts that block carries exactly the keys the Backend allowlist knows, and an extra key is
      silently dropped in transit — an endpoint that measures correctly and a console that reads zero.
      The count rides the `HOOK_UNDECIDABLE` evidence row that already works. **If a controls-block
      field is wanted later, the Backend allowlist change lands first.**

**Defeat test:** `TestFailOpenForcesNonGreen` — revert the `REFUSED → FAIL` arm and it goes RED with
`status=PASS with 11 ungoverned invocations`. Second: `TestUnmeasuredIsNotZero` — make
`ungovernedInvocations.rate` default to `0` on a zero denominator and it goes RED with
`rate=0 rendered over an unmeasured denominator`.

**Exit:** replaying the 2026-08-26 measurement (`total: 11, byReason: {"daemon-unreachable-budget-expired": 11}`)
through the generator produces `status: "FAIL"` for R1 and R5 and a `downgradeTriggers` entry naming
`vendorFailOpen`. The number **11** appears in the manifest.

---

## Task 5: Stop the canary reporting a real deny as a launch failure

**Files:**
`Installers/internal/aicanary/exec.go` (`:125`, `finish` at `:144`),
`Installers/internal/aicanary/exec_test.go`,
`Installers/internal/codexmanaged/canary.go` (`:341-352`),
`Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md:554-556`

- [ ] Failing test first: `TestWaitDelayExpiryIsNotALaunchFailure` — a stub runner returns
      `fmt.Errorf("exec: WaitDelay expired before I/O complete")` alongside a populated `Stdout`
      containing the deny marker, and asserts the outcome classifies as an **observation**, not
      `CanaryError`. Expected failure text before the fix:
      `outcome = ERROR / canary-host-launch-failed, want PROVEN`.
- [ ] In `finish`, classify a `WaitDelay` expiry that occurred **after the child exited** as a
      pipe-drain condition, not a launch failure: the process ran, `cmd.ProcessState` is non-nil, and
      the captured output is what the canary is there to read. Return the outcome with a named
      `PipeDrainTruncated` flag rather than an error.
- [ ] Raise the probe's `WaitDelay` to **90 s** for the Codex host path only, matching the
      re-measurement recorded in `Installers/internal/codexmanaged/testdata/liveproof/ledger.json`
      (`waitErr=nil`, exit 0, 11.3 s wall clock, full transcript including the `Blocked` line). Do not
      change the *context* timeout — the bound that kills a hung child stays where it is.
- [ ] A truncated-pipe outcome may prove a **deny** (the marker was captured) but may never prove an
      **allow**: if the deny marker is absent and the pipes were truncated, the answer is
      `CanaryUnsupported`, not `CanaryNotProven`. Assert both directions.
- [ ] Correct `LIVE_PROOF_RUNBOOK.md:554-556` to describe the shipped behaviour.

**Defeat test:** `TestWaitDelayExpiryIsNotALaunchFailure` — revert `finish`'s new arm and it goes RED
with `outcome = ERROR / canary-host-launch-failed, want PROVEN`. Second:
`TestTruncatedPipeNeverProvesAllow` — make the truncated-no-marker case return `CanaryNotProven` and
it goes RED with `truncated capture reported an enforcement gap`.

**Exit:** `TestLiveCanary_RealCodexHost` run **6 of 6** times on the owner's box returns zero
`canary-host-launch-failed`. Compare against the recorded baseline of **2 of 6** failing.

---

## Task 6: The certificate manifest — schema v2, generator, and the two-tier gate

**Files:**
`Installers/cmd/devoid-certificate/main.go` (new),
`Installers/internal/certificate/manifest.go` (new),
`Installers/internal/certificate/manifest_test.go` (new),
`Installers/internal/certificate/schema.json` (new),
`.plans/m47a-20260822/v2-waves/artifacts/certificate/<certificateId>.json` (generated)

`grep -rn "certificateId" origin/main` across Installers, Backend and Frontend returns **zero hits**.
Nothing like this exists; this is the one genuinely new subsystem in Wave 8.

**Two estimators, declared per row (fixes the review's conflation of gating with reporting):**

- **Gate:** exact one-sided **Clopper–Pearson**. Its over-coverage is the desired property for a claim
  that must not be overstated, and at zero events it reduces to `1 − 0.05^(1/n)`.
- **Report:** **Bayesian interval with uniform prior** — NIST TN 2119's own first choice; TN 2119
  explicitly calls Clopper–Pearson too conservative. Wilson / Agresti–Coull acceptable only above
  n ≈ 40. (The review cited TN 2119 as authority *for* Clopper–Pearson. It does not recommend it.)
- **Wald is banned everywhere.**
- **Do not substitute Wilson for the gate.** At zero events the one-sided 95% Wilson upper bound is
  `z²/(n+z²)` with z = 1.6449: at n = 29,956 Wilson gives **90.3 ppm** where exact gives exactly
  **100.0 ppm**, and Wilson reaches the 100 ppm claim at **n = 27,055** versus **29,956** — a **9.7%
  shortfall in evidence behind an identical published claim.**

**Two-tier gate structure**, because the review's §9.4 × §9.5 compound to an unreachable requirement
(Holm at α = 0.05/114 for a ≤ 100 ppm one-sided bound with zero errors needs **77,316 zero-error
benign opportunities per class — 8.81 million total**). A gate that cannot be met is a gate that is
quietly ignored:

| | **Tier A — enforcing strata** | **Tier B — everything else** |
|---|---|---|
| Membership | predeclared, **K ≤ 6**, the strata that can hard-block or redact | all remaining classes |
| Claim | full exact one-sided bound, **Holm/Bonferroni FWER at α = 0.05/K** | exposure gate only (binary: non-zero eligible denominator in the window) plus the raw interval reported with honest width and **no threshold attached** |
| Multiplicity | FWER | **FDR (Benjamini–Hochberg)** — a screening surface, not a release claim |
| Tier assignment | mandatory for every class, in plan text | mandatory for every class, in plan text |

- [ ] Failing test first: `TestMissingMeasurementIsNotZero` — feed the generator an evaluation with
      `eligible: 0` and assert the emitted row is `null` + `status: "UNKNOWN"`. Expected failure text:
      `precision.lower95 = 0 for an empty denominator`.
- [ ] Implement the schema below verbatim. Fields marked new against review §10 are the ones the
      2026-08-27 disposition forces.

```json
{
  "schemaVersion": 2,
  "certificateId": "m47a-<risk>-<profile>-<release>",
  "profile": {
    "id": "managed-windows-codex-v1",
    "protectedPopulation": "",
    "exclusions": [],
    "prerequisites": []
  },
  "system": {
    "sourceCommits": {},
    "artifactDigests": {},
    "detectorCatalogDigest": "sha256:",
    "policyDigest": "sha256:",
    "rulesetDigest": "sha256:",
    "normalizerVersion": "",
    "parserVersion": "",
    "sinkInventoryDigest": "sha256:",
    "runtime": "",
    "osShellTool": "",
    "modelProviderPrompt": "",
    "engineVersion": "",
    "environmentDigest": "sha256:",
    "standardsMapping": {
      "owaspLlm2026": [],
      "owaspAsi2026": [],
      "atlasRelease": "v2026.07",
      "atlasTechniques": [],
      "aiuc1Controls": []
    }
  },
  "evaluation": {
    "lane": "prompt|ingress|tool|dlp|scanner|package",
    "surface": "claude-code|codex|mcp|browser-extension|scanner",
    "suite": "regression|property|benign-replay|e2e|private-adaptive|incident",
    "corpusDigest": "sha256:",
    "labelVersion": "",
    "windowStart": "",
    "windowEnd": "",
    "eligible": 0,
    "executed": 0,
    "unknown": 0,
    "dropped": 0,
    "uniqueUsersSessionsEndpointsTenants": {},
    "clusteringUnit": "scenario|session|user|tenant|endpoint",
    "nEffective": 0,
    "rho": null,
    "strata": []
  },
  "metrics": {
    "precision": {
      "numerator": 0, "denominator": 0, "lower95": null,
      "gateMethod": "clopper-pearson-onesided", "reportMethod": "bayes-uniform"
    },
    "recall": { "numerator": 0, "denominator": 0, "lower95": null },
    "falsePositiveRate": { "numerator": 0, "denominator": 0, "upper95": null },
    "ppvAtDeclaredBaseRate": { "baseRate": null, "value": null, "lower95": null },
    "unknownRate": { "numerator": 0, "denominator": 0, "upper95": null },
    "adaptiveAsr": [
      {
        "stratum": "", "asrAt1": null, "asrAt10": null, "asrAt100": null,
        "scenarios": 0, "attemptsPerScenario": 0, "upper95": null,
        "safeguards": "on|off"
      }
    ],
    "inspectionCompleteness": { "complete": 0, "degraded": 0, "denominatorUncertainty": null },
    "ungovernedInvocations": {
      "decided": 0, "undecided": 0, "vendorDiscarded": 0, "notMeasured": 0,
      "rate": null, "byAdapter": {}, "byReason": {}
    },
    "mediationGap": { "numerator": 0, "denominator": 0 },
    "utility": {}, "interventions": {}, "latency": {}
  },
  "multiplicity": {
    "family": [], "K": 0,
    "method": "holm|bonferroni|benjamini-hochberg",
    "alphaPerClaim": null,
    "tier": "A|B"
  },
  "proof": {
    "positive": [], "negative": [], "degraded": [], "replay": [], "bypass": [],
    "rollback": [], "liveCanary": [], "independentReview": []
  },
  "status": "PASS|FAIL|UNKNOWN|NOT_READY",
  "expiresAt": "",
  "downgradeTriggers": []
}
```

- [ ] **`expiresAt` is a 90-day TTL.** AIUC-1 certificates run 12 months but require technical
      testing **at least quarterly**; a manifest that outlives its own re-test is a stale claim
      wearing a certificate's clothes. The generator refuses to emit without `expiresAt`, and a
      consumer past `expiresAt` reads `UNKNOWN`, never the last known value.
- [ ] **Missing measurement stays `null` and forces `UNKNOWN` / `NOT_READY`.** This is a schema
      requirement, not permission to fill unknown numbers with zero. Encode it once, in the
      constructor, so no call site can bypass it.
- [ ] Wire `proof` to the existing live-proof register (`Installers/internal/liveproof`) rather than
      a new evidence store: the register's `Validate` (`liveproof.go:104`) already refuses an
      unobserved control with no quarantine, refuses an open-ended quarantine, and expires on
      `reviewBy`. Today it holds **8 proofs, 3 observed, 5 quarantined at `reviewBy: 2026-11-05`**;
      the generator must read those five as `UNKNOWN`, not omit them.
- [ ] Every class is assigned to Tier A or Tier B **in the plan text**, and the generator fails on an
      unassigned class. Tier A's `K` is bounded at 6 by an assertion, not a convention.
- [ ] `status` is computed, never authored. A hand-written `"status": "PASS"` in an input is rejected.

**Defeat test:** `TestMissingMeasurementIsNotZero` — delete the null guard and it goes RED with
`precision.lower95 = 0 for an empty denominator`. Second: `TestExpiredCertificateReadsUnknown` — set
`expiresAt` to yesterday and assert the consumer reads `UNKNOWN`; remove the expiry check and it goes
RED with `expired certificate returned status=PASS`. Third: `TestTierAIsBounded` — add a seventh
Tier A class and it goes RED with `Tier A has K=7, bound is 6`.

**Exit:** one generated `<certificateId>.json` per risk lane and per dimension, validating against
`schema.json`, in which **all five risk lanes read `NOT_READY`** and the four dimensions read `PASS`
or `UNKNOWN` — never `PASS` on a null.

---

## Task 7: Map the class catalog to external control ids, in one commit

**Files:**
`Installers/internal/toolrisk/class_catalog.go` (`ClassCatalog()` at `:57`),
`Installers/parity-vectors/toolrisk-classes.v1.json`,
`Installers/internal/dlp/` class registry (the generated `AI_DLP_CLASSES` source from Wave 1),
`Installers/internal/promptrisk/`,
`Installers/internal/certificate/standards.go` (new),
`Installers/internal/certificate/standards_test.go` (new)

`grep -ci owasp` over the v1 plan = **0**. `git grep -in aiuc` over `Installers@origin/main` = **0**
hits. `git grep -in "AML\.T[0-9]"` = **0** hits. Nothing maps to anything today.

- [ ] Failing test first: `TestEveryClassCarriesStandardsIds` iterates `ClassCatalog()` and the
      generated DLP registry and fails on any class with an empty mapping. Expected failure text:
      `class "chmod-broad-777" has no atlasTechniques and no owaspAsi2026 id`. Starting state: RED on
      **40 tool-risk classes plus 81 DLP producer classes**.
- [ ] Pin an ATLAS release. **v2026.07** is current; v2026.05 added a `platform` field including
      `Agentic`. Record the release id in `system.standardsMapping.atlasRelease` so a technique
      renumbering is a visible diff, not silent drift.
- [ ] Use **OWASP Top 10 for LLM Applications 2026** ids (shipped 2026-08-03; it renumbered 8 of 10,
      and **Excessive Agency moved from LLM06 to LLM03** — the entry the review leans on hardest is
      the one that moved). The review's `:2025` ids at its lines 1701-1712 are one edition stale and
      must not be copied forward.
- [ ] Add **OWASP Top 10 for Agentic Applications 2026** (ASI01–ASI10, published 2025-12-09). This is
      the framework that actually covers this product category and the review misses it entirely.
- [ ] Add the four **AIUC-1** Q3-2026 controls that land on DeVoid's surface, so one corpus run serves
      both the internal gate and an external audit: **A008** secrets in generated code/logs/storage ·
      **B010.3** typosquatted and hallucinated dependencies · **B006.3** scanning configuration
      artifacts for prompt-injection risk (the rule-file walk un-capped by C7 / agent 7.10.6) ·
      **B006.1** approved MCP servers only.
- [ ] **One commit.** ATLAS, OWASP and AIUC-1 ids land together, because a class mapped to one
      framework and not the others produces a certificate that is auditable in one direction only.
- [ ] The mapping is a catalog column, generated like every other — never hand-maintained. Wave −1's
      rule applies: no hand-written counts.

**Defeat test:** `TestEveryClassCarriesStandardsIds` — remove the mapping for one class and it goes RED
with `class "<id>" has no atlasTechniques and no owaspAsi2026 id`. Second:
`TestAtlasReleaseIsPinned` — blank `atlasRelease` and it goes RED with `standards mapping has no
pinned ATLAS release`.

**Exit:** **121 of 121** catalogued classes (40 tool-risk + 81 DLP producer classes) carry at least one
ATLAS technique id and one OWASP LLM:2026-or-ASI id; the four named AIUC-1 controls each map to at
least one class. The counts are derived from the catalogs, not typed.

---

## Task 8: Rings, automatic halt, and rollback — on the mechanism that already exists

**Files:**
`Backend/src/ai-policy-delivery/ai-policy-rollout.service.ts` (`setRolloutAuthority` at `:129`, `assertProgressionAllowed` at `:191`),
`Backend/src/ai-policy-delivery/policy-integrity.types.ts` (`:20`, `:27`, `:109`, `:399`),
`Backend/src/ai-policy-delivery/ai-policy-rollback.service.ts` (`:9-15`),
`Backend/src/ai-policy-delivery/ai-policy-halt.service.ts` (new),
`Backend/src/ai-policy-delivery/ai-policy-halt.service.spec.ts` (new)

- [ ] Failing test first: `TestConfirmedBenignBlockHaltsTheRing` — record one adjudicated
      false hard block (Wave 6's adjudication record, not a single reviewer's label) against a segment
      in `CANARY` and assert the ring is halted and the certificate downgraded. Expected failure text:
      `segment remained at cohortBasisPoints=2500 after an adjudicated false block`.
- [ ] Express 5% → 25% → 100% as `cohortBasisPoints` **500 → 2500 → 10000**. Do not add a new rollout
      field: `AI_DELIVERY_ROLLOUT_PHASES` already gives SHADOW/CANARY/ENFORCE, assignment is already a
      stable hash of `(org, segment, endpoint)` so raising the cohort only ever adds endpoints, and
      `assertProgressionAllowed` already refuses ENFORCE from an empty CANARY ring and refuses a
      single write that maxes both phase and cohort.
- [ ] Add the halt conditions, each with a predeclared threshold and each also a manifest
      `downgradeTriggers` entry: (a) one adjudicated benign hard block; (b) one adjudicated critical
      miss or unauthorized observed effect; (c) `vendorDiscarded > 0` (Task 4); (d) an evidence,
      coverage, latency or utility regression beyond its declared bound; (e) `dropped > 0` in any
      contributing lane report; (f) a catalog, ruleset, normalizer, parser, policy or model digest
      change that is not in the certificate's `system` block.
- [ ] Wire `FALSE_POSITIVE_STORM` — declared at `ai-policy-rollback.service.ts:11` with nothing
      computing it — to a change-point monitor over Wave 6's adjudicated rate. Declare the threshold
      numerically in the service, not in a comment.
- [ ] **Halt is not rollback.** Halt freezes the ring; rollback files a forward-only intent against a
      historical snapshot. Keep the rollback service's invariant intact: nothing in it may name,
      compute or compare a bundle revision, so nothing in it can lower one.
- [ ] Measure restore time. A known-safe compatible rollback must restore within **5 minutes**,
      measured from halt to the endpoints' first read of the restored authority — not from the
      operator's click.

**Defeat test:** `TestConfirmedBenignBlockHaltsTheRing` — remove condition (a) and it goes RED with
`segment remained at cohortBasisPoints=2500 after an adjudicated false block`. Second:
`TestHaltNeverLowersABundleRevision` — attempt a halt that writes a lower revision and it goes RED
with `halt path produced a non-monotonic revision`.

**Exit:** a recorded drill in which a segment moves 500 → 2500, a seeded adjudicated benign block
halts it, and rollback restores authority in **under 300 seconds**, with the measured seconds written
into the manifest's `proof.rollback`.

---

## Task 9: Live effect canary, secret-egress canary, and independent reproduction

**Files:**
`Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts` (`canaryFleetRollup` at `:209`, receipts at `:507`),
`Installers/internal/aicanary/` (after Task 5),
`Installers/internal/liveproof/register.json`,
`scripts/ceragon-power-on.ps1`

**This task has three named external dependencies. It is not fully engineering and must not be
scheduled as though it were.**

- [ ] Failing test first, on the part that *is* engineering: `TestLiveCanaryProvesEffectNotEvent` —
      a canary receipt that records only that an event was created, with no observed effect or
      observed denial, must not satisfy the proof. Expected failure text:
      `canary receipt has no observedEffect and was accepted as proof`.
- [ ] Use **anytime-valid inference** for the live canary — confidence sequences / e-processes, not a
      fixed-horizon interval that is peeked at continuously. Review §9.5 offers "fixed-horizon or
      sequential" as alternatives; canary monitoring is inherently continuous, so sequential is the
      default and a fixed-horizon interval read continuously is a methodological error, not a choice.
- [ ] The effect canary must prove an **actual external effect or an actual denial**, not event
      creation. The rollup at `endpoint-control-authority.service.ts:81` already refuses to count a
      never-consumed challenge as a canary that ran — extend that discipline to the effect axis.
- [ ] The secret-egress canary asserts the negative directly: a seeded canary credential presented to
      a governed prompt must produce **zero bytes** at the model endpoint, measured at the wire, not
      inferred from a decision row. This is the shape the 2026-08-26 measurement already used
      (`0 requests to the model endpoint` on the four blocked runs).
- [ ] Promote the passing results into `Installers/internal/liveproof/register.json` by flipping
      `observed` and pasting the evidence fields. The register refuses a flipped boolean without
      them; that narrow door is the point.

**External dependency 1 — production capacity.** ECS worker services have been at **0/0 since
2026-06-26** (`scripts/ceragon-power-state.json`, `savedAtUtc: 2026-06-26T23:42:45Z`, recording
`cera-fetch-worker-staging` at desired 5, `cera-sandbox-worker-staging` at 1,
`codefence-scanner-worker` at 1). `scripts/ceragon-power-on.ps1` restores them, but **a fresh explicit
ask from the owner is required every time** and a green local run is not permission. Start RDS first,
then run with `-SkipRds`.

**External dependency 2 — an independent evaluation owner.** A named person who is **not a detector
author** must hold the sealed corpus. **Whether such a person exists is UNKNOWN** — the review's P1-12
asserted no owner exists; the disposition pass could not establish that one has ever been named.

**External dependency 3 — no third-party evaluation body.** None exists for AI runtime defence; do
not budget for one. MITRE ATT&CK Evaluations lost Microsoft, SentinelOne and Palo Alto from its 2026
round. The credible substitute is an **AIUC-1 independent audit** (51 requirements / 130 controls;
Schellman is the accredited auditor; certificate valid 12 months, technical testing at least
quarterly — the reason Task 6's TTL is 90 days).

**Defeat test:** `TestLiveCanaryProvesEffectNotEvent` — accept a receipt with no `observedEffect` and
it goes RED with `canary receipt has no observedEffect and was accepted as proof`.

**Exit — BLOCKED.** `proof.liveCanary` and `proof.independentReview` stay **empty**, and every lane
depending on them stays `NOT_READY`, until: (1) the owner grants a fresh power-on ask; (2) an
independent evaluation owner is named in writing; (3) an AIUC-1 audit is contracted or explicitly
declined in writing. The engineering half — the receipt shape, the sequential estimator, the
zero-bytes assertion — is **not** blocked and ships first with `proof.liveCanary` populated only from
the owner's own box.

---

## Task 10: F16 — non-exportable endpoint signing-key custody

**Files:**
`Installers/internal/policybundle/trust_anchor_client.go` (`:375` nil-identity branch, `:404` mint, `:408` / `:427` / `:455` writes, `verifyMintReachedTheAuthoritativeScope` at `:321`),
`Installers/internal/core/config/ai_trust.go` (`SaveAIEndpointSigning` at `:179`),
`Installers/internal/policybundle/trust_anchor_contract.go` (`NewAIEndpointSigningIdentity` at `:210`),
`Installers/cmd/devoid/ai_trust_converge.go` (`canConvergeEndpointTrustInThisProcess` at `:52-64`),
`Installers/cmd/devoid/setup_installer.go:170-178`

**The plan v1 mentions F16 zero times** (`grep -c F16` over 17,538 lines = 0). The respec is
`docs/Devoid_Roadmap_To_Finished_Product.md:788` — **a separate repository**, last touched 2026-08-17.
The review's §15 cites "plan line 788", which is an unrelated `aws iam put-role-policy` step in v1's
Wave 0; the finding is valid, the citation is not. The ownership table repeats F16 as mandatory for
R1, R3 and R4 at `roadmap:945`, `:947`, `:948`.

**What is true today, verified:**

- The private key is stored **in plaintext-recoverable form**: `AIEndpointSigningIdentity` carries
  `PrivateKeyPkcs8DerB64Url`, written into `credentials.json` by `SaveAIEndpointSigning`
  (`ai_trust.go:179`), which writes to **every existing credential scope** bound to the bearer token.
  Any process that can read the file can export the key. Non-exportability does not exist.
- The elevation gate is about **install scope**, not custody:
  `return !config.IsSystemInstall() || uninstall.IsElevated()` (`ai_trust_converge.go:63`). On a
  **user-scope install a non-elevated process passes the gate** and may mint.
- There are **five** convergence entry points. Four funnel through `performEnrollment` — the
  package-tool shim, `devoid install-package`, `devoid daemon start`, `devoid setup enroll` — so the
  gate closes all four at once. The **fifth is the daemon's 30-minute background loop**, gated
  separately inside `internal/daemon`.
- The genuinely good part, which must not be lost: `endpointSigningReadDenial`
  (`trust_anchor_client.go:398`) refuses to mint a replacement when the key is present but unreadable,
  because minting there takes the permanent rotation-conflict 409 recorded at
  `setup_installer.go:170-178`.

- [ ] Failing test first: `TestNonElevatedCannotMintChooseReplaceReadOrExport` — a table over **every
      one of the five entry points × five verbs (mint, choose, replace, read, export)**, run under a
      non-elevated token on both machine and user scope, asserting denial. Expected failure text:
      `user-scope install: non-elevated mint succeeded via performEnrollment`. Starting state: RED on
      the user-scope rows.
- [ ] Move mint, convergence, recovery and rotation behind a privileged broker or a non-exportable
      key owner (KMS / HSM / TPM). Bind the key to the enrolled endpoint identity; prevent
      user-selected or user-supplied replacement material.
- [ ] Inventory every caller and every write destination, including compatibility and migration
      paths, and make the inventory a test the way Task 1 does for sinks.
- [ ] Define privileged recovery and rotation that **never interrupts read-only verification** — a
      device that cannot sign must still be able to verify, or a rotation becomes an outage.
- [ ] Preserve `endpointSigningReadDenial`. **Do not "simplify" it.** Removing it re-creates the
      permanent 409 that has already bricked endpoints here.

**Defeat test:** `TestNonElevatedCannotMintChooseReplaceReadOrExport` — restore the current gate
(`!config.IsSystemInstall() || uninstall.IsElevated()`) and it goes RED with `user-scope install:
non-elevated mint succeeded via performEnrollment`. Second: `TestReadOnlyVerificationSurvivesRotation`
— rotate mid-verification and it goes RED with `verification unavailable during rotation`. Third:
`TestStaleOrWrongEndpointMaterialIsRejected`.

**Exit — BLOCKED on a named external dependency.** Non-exportable custody requires either a SYSTEM /
privileged broker **or** a KMS / HSM / TPM key owner. Both carry **procurement and key-ceremony lead
time that is not engineering time.** Until a key owner is chosen and a ceremony is completed:
**R1, R3, R4 and the shared trust gate stay `NOT_READY`**, and the manifest carries
`prerequisites: ["F16-endpoint-signing-key-custody"]` on all three. The measurable engineering exit
that is *not* blocked: **25 of 25** cells in the five-entry-point × five-verb table deny under a
non-elevated token, on both install scopes.

---

## Task 11: The certification-claim template and the DeVoid system card

**Files:**
`docs/ai-security/CERTIFICATION_CLAIM_TEMPLATE.md` (new — `docs/` is a **separate repository**; run git from inside it),
`docs/ai-security/DEVOID_SYSTEM_CARD.md` (new),
`Installers/internal/certificate/claim_test.go` (new)

- [ ] Failing test first: `TestForbiddenClaimsAreRefused` — the claim renderer takes a manifest plus a
      proposed claim string and refuses any claim on the forbidden list whose supporting field is
      `null` or whose lane is not `PASS`. Expected failure text:
      `claim "zero false positives" refused: falsePositiveRate.numerator = 1`.
- [ ] Encode the **forbidden-claims list** as data the renderer enforces, not prose a human is asked
      to remember:
      - *"Zero false positives"* — measured today: 1 benign hard block per 51 ordinary commands and
        it is un-relaxable; 15/52 benign prompts at interrupt tier; 2/23 sealed benign interrupts.
      - *"All detections are high quality"* — 43 of 55 detector classes report `fnRate: 0` on **zero**
        attack cases.
      - *"Evasive attacks are covered"* — two named semantic residuals plus a pinned `rm -rf "$HOME"`
        evasion. Claimable instead: *the Bash shape and AST family, with the two semantic residuals
        named.*
      - *"Prompt injection is high-assurance protected"* — 75% sealed recall, `injection-system-exfil`
        at 0%, no adaptive evaluation, English-only rules.
      - *"All DLP classes are governed"* — 30 of 81.
      - *"A green scan proves vulnerable code was not introduced"* — execution truth is not detection
        truth.
      - *"Dangerous production actions are prevented"* — 9 production-effect spellings produce no
        finding; the effect broker covered one overlay path before this wave.
      - *"M4.7A is complete"* / *"Risks 1, 2, 4 or 5 are 9+/10."*
      - **Do not present a static-corpus prompt-injection result as a release claim.** Adaptive
        attacks broke **all eight** defences studied (arXiv:2503.00061, Zhan et al.), with **ASR
        consistently over 50%**. Do **not** cite the "twelve defences broken at over 90%" figure —
        it is not supported by the primary source. Second-generation reference-monitor defences have
        never been adaptively evaluated. Static results are **regression evidence**, labelled as such
        in the manifest's `suite` field.
      - **Do not publish a single prompt-injection number.** Same vendor, same disclosure: 0% success
        across 200 attempts in a constrained coding environment versus **78.6% by the 200th attempt**
        in a GUI/browser environment. **Surface dominates model.**
      - **Do not claim safeguards coverage at install time.** The MSI does not wire the AI hook lane;
        a per-user scheduled task does, roughly one minute after install.
      - **Do not claim a corpus is uncontaminated because it carries a canary.** The BIG-bench canary
        GUID was reproducible on demand by GPT-4 — the filter became the proof of contamination.
      - **Do not treat the measured production FP rate as a certified quality label** until Wave 6's
        second reviewer and adjudication record exist on the row. A single reviewer can set it, and
        `benign_expected` conflates "policy too strict" with "authorized action."
      - **Do not claim the lexical/ML prompt classifier can be an enforcing tier** (D16). Published
        guard models operate around **1% FPR** against a product budget of **≤ 0.1%** unnecessary
        visible interventions per 1,000 benign sessions and **≤ 0.5%** confirmations per 1,000 benign
        opportunities. Axelsson's base-rate result for intrusion detection lands on the same order as
        the 100 ppm hard-block bound. This is arithmetic, not opinion.
      - **Do not promise third-party validation of the detection engine.** None exists for AI runtime
        defence, and MITRE ATT&CK Evaluations lost Microsoft, SentinelOne and Palo Alto from its 2026
        round. The AIUC-1 audit is the substitute and must be named as such, never as "independently
        validated detection."
- [ ] Encode the **claimable-today** list with its named test, so the template offers a true sentence
      instead of only refusing false ones: the scanner false-green statement; *"the console's
      detection engine is byte-identical to the shipped endpoint engine"* (pin `254d24fc`, three
      digests, LF-normalised — **caveat: guarded per-PR only against local edits, upstream drift is a
      daily poll**); *"tool shadow capture is local-only and behaviour-invariant on the named tool
      path"*; *"the named policy floor is enforced on the tested write and read paths"*
      (`Backend@dfbac545`, `ai-security-policy.phase-b-content.spec.ts:661-673`); *"the shipped
      tool-risk default posture is 23 block / 2 warn / 12 monitor / 3 allow"*
      (`ai-security-policy.tool-risk-d4-tiers.spec.ts`, red proof at `:302`); *"the agent's AI
      rule-file walk is depth-unbounded and reports its own completeness"* (585 → 1,099 files
      measured); *"a Linux sandbox run does not vouch for a non-Linux payload"*; *"the prompt lane's
      false-positive rate is measured at 15/52 benign at warn-or-above and 0/52 at block tier, on an
      87-case corpus."*
- [ ] **The system card** publishes, per surface: ASR raw and safeguarded, persistence scaled
      1 → 200 attempts, named attacker methodology (adaptive versus known), held-out environment
      count, external red-team evidence, and explicit regressions. **The safeguards-off column for
      the Codex surface belongs on that page**, not absorbed into a coverage claim: on the owner's own
      machine the client is `0.149.0-alpha.4.1` and the hook-trust dialect table
      (`Installers/internal/codexmanaged/hookdialect.go:112`) carries two rows, `0.144.` and `0.147.`.
- [ ] Cite the **Five Eyes** *Careful Adoption of Agentic AI Services* (CISA / NSA / ASD ACSC / CCCS /
      NCSC-NZ / NCSC-UK, 2026-05-01) in the template. Human approval at consequential actions and
      per-request least privilege are now government-stated requirements, which makes the broker
      architecture a compliance answer rather than a security opinion. Its named risk category
      **"obscure event records / accountability opacity"** is precisely the defect class this
      workspace keeps shipping — and making evidence completeness a first-class gate is the direct
      answer to it.
- [ ] **Deliberately out of scope:** EU AI Act readiness. The Digital Omnibus (in force 2026-07-27)
      moved Annex III high-risk to 2027-12-02 and Annex I to 2028-08-02. Spend the effort on the three
      artifacts a buyer's security review asks for today — an **ISO/IEC 42001** roadmap statement, a
      **CSA AI-CAIQ / AICM** response, and the **AIUC-1** mapping — all three of which draw on this
      same manifest.

**Defeat test:** `TestForbiddenClaimsAreRefused` — remove the `falsePositiveRate` guard and it goes RED
with `claim "zero false positives" refused: falsePositiveRate.numerator = 1`. Second:
`TestSystemCardHasAPerSurfaceRow` — delete the Codex safeguards-off row and it goes RED with
`system card publishes a single prompt-injection number`.

**Exit:** the forbidden list contains **15** encoded entries, each bound to the manifest field that
refuses it; the claimable list contains **8** entries, each bound to a named test; the system card
carries **4** surface rows (Claude Code, Codex, MCP, browser/extension), with Codex safeguards-on
explicitly `UNKNOWN`.

---

## Task 12: The §16.8 / §16.9 defeat-test matrix, as executable tests

**Files:**
`Installers/internal/daemon/mediation_defeat_test.go` (new),
`Installers/internal/certificate/downgrade_defeat_test.go` (new),
`Backend/src/ai-policy-delivery/ai-policy-halt.defeat.spec.ts` (new)

The review's §16.8 and §16.9 are a list. A list is not a gate. Each row below becomes one named test.

**§16.8 — authorization and integrity (all must FAIL at the final boundary):**

- [ ] `TestApprovalReplayFails` · `TestApprovalExpiryFails` · `TestUseCountExhaustionFails`
- [ ] `TestSubjectMismatchFails` · `TestRuntimeMismatchFails` · `TestToolMismatchFails` ·
      `TestArgvMismatchFails` · `TestResourceMismatchFails` · `TestDestinationMismatchFails` ·
      `TestDigestMismatchFails` (one table over Task 2's 11 binding segments)
- [ ] `TestExecutableSwapAfterApprovalFails`
- [ ] `TestFakeApprovalInPromptDomStdoutOrToolOutputFails` — approval text appearing in model output,
      page DOM, tool stdout or a tool result never satisfies the transaction. Only the trusted
      independent human channel does.
- [ ] `TestDaemonOutageFails` · `TestBrokerOutageFails` · `TestPolicyOutageFails` · `TestKmsOutageFails`
      — each must produce restricted mode, never an allow.
- [ ] `TestUnsignedWrongQueueWrongTenantWrongShaExpiredReplayedResultRejected`
- [ ] `TestNonElevatedKeyMintChooseReplaceReadExportDenied` (Task 10's 25-cell table)
- [ ] `TestDirectAlternatePathToTheSameSinkFails` — the direct-binary bypass. If a sink is reachable
      without the daemon, mediation is decorative.
- [ ] `TestReceiptAxesDisagreementIsNotAPass` — attempted / authorized / executed / observed-effect
      receipts that disagree produce `UNKNOWN`, never a clean outcome.

**§16.9 — rollout and operations:**

- [ ] `TestMonitorThenCanaryThenWiderOnlyAfterGates`
- [ ] `TestConfirmedBenignBlockAutomaticallyHalts` (Task 8)
- [ ] `TestCriticalMissOrUnauthorizedEffectAutomaticallyHalts`
- [ ] `TestEvidenceCoverageLatencyUtilityRegressionHalts`
- [ ] `TestKnownSafeRollbackRestoresWithinFiveMinutes`
- [ ] `TestModelParserPolicyCatalogChangeExpiresTheCertificate`
- [ ] `TestLiveCanaryProvesEffectNotEventCreation` (Task 9)

**Defeat test:** the matrix is its own defeat test — every row states a mutation and the failure text
it must produce. A row whose test cannot be made red is **NOT RUN** and is recorded as such in the
manifest's `proof.bypass` gaps, never counted as a pass.

**Exit:** **27 of 27** matrix rows exist as named tests, each demonstrated red on its stated mutation,
with the mutation and the failure text recorded beside it. Any row that cannot be made red is listed
in `profile.exclusions` with an owner and forces its lane non-green.

---

## Wave exit criteria

Every criterion below is a number or a named artifact, and names the test that goes red on revert.
Criteria marked **BLOCKED** cannot be measured today; they contribute `UNKNOWN` to the certificate
rather than a number, and the named external dependency is stated rather than engineered around.

1. **Sink mediation.** `sink-inventory.json` exists with ≥ 13 rows; rows with
   `canPermitEffect: true && mediated: "none"` fall from **11 of 13** to **1 of 13** (S11, out of
   scope, named owner). Defeat: `TestNoSinkPermitsAnEffectUnmediated`, set a migrated row back to
   `"none"` → RED naming that sink.
2. **Binding width.** The approval preimage carries **11** declared segments, up from 4, and all 11
   survive the Backend round trip. Defeat: `TestBindingRejectsAChangedEffect`, restore the
   four-segment preimage → RED with `grant applied to a different executable digest`.
3. **Incomplete inspection never grants.** A `normalizedEffect: null` binding resolves to
   hold/restricted in **100%** of cases across the sink table. Defeat:
   `TestIncompleteInspectionNeverGrants`, delete the null arm → RED with
   `INSPECTION_INCOMPLETE produced state=granted`.
4. **Fail-open is non-green (D14).** Replaying the 2026-08-26 measurement
   (`total: 11`, `byReason: {"daemon-unreachable-budget-expired": 11}`) through the generator yields
   `status: "FAIL"` for R1 and R5 and a `downgradeTriggers` entry naming `vendorFailOpen`. The number
   **11** appears in the manifest. Defeat: `TestFailOpenForcesNonGreen`, revert the `REFUSED → FAIL`
   arm → RED with `status=PASS with 11 ungoverned invocations`.
5. **Unmeasured is never zero.** `ungovernedInvocations.rate` is `null` on a zero denominator, and
   every metric block refuses a bound on an empty denominator. Defeat: `TestMissingMeasurementIsNotZero`
   → RED with `precision.lower95 = 0 for an empty denominator`.
6. **Canary honesty.** `TestLiveCanary_RealCodexHost` returns **0 of 6** `canary-host-launch-failed`
   against a recorded baseline of **2 of 6**. Defeat: `TestWaitDelayExpiryIsNotALaunchFailure`, revert
   `finish`'s new arm → RED with `outcome = ERROR / canary-host-launch-failed, want PROVEN`.
7. **The manifest exists and expires.** One schema-v2 certificate per risk lane and per dimension;
   **all five risk lanes read `NOT_READY`**; a certificate past `expiresAt` reads `UNKNOWN`. TTL is
   **90 days**. Defeat: `TestExpiredCertificateReadsUnknown` → RED with
   `expired certificate returned status=PASS`.
8. **Two-tier gate.** Every class is assigned a tier; Tier A is bounded at **K ≤ 6** by assertion;
   Tier B carries intervals with **no threshold attached** and FDR control. Defeat: `TestTierAIsBounded`,
   add a seventh Tier A class → RED with `Tier A has K=7, bound is 6`.
9. **Standards mapping.** **121 of 121** catalogued classes (40 tool-risk + 81 DLP) carry ≥ 1 ATLAS
   technique id and ≥ 1 OWASP LLM:2026-or-ASI id; the four named AIUC-1 controls (A008, B010.3,
   B006.3, B006.1) each map to ≥ 1 class; `atlasRelease` is pinned to `v2026.07`. Defeat:
   `TestEveryClassCarriesStandardsIds` → RED naming the unmapped class.
10. **Rings and halt.** A recorded drill moves a segment 500 → 2500 basis points, a seeded adjudicated
    benign block halts it, and rollback restores authority in **under 300 seconds**, with the measured
    seconds written into `proof.rollback`. Defeat: `TestConfirmedBenignBlockHaltsTheRing` → RED with
    `segment remained at cohortBasisPoints=2500 after an adjudicated false block`.
11. **Defeat matrix.** **27 of 27** §16.8/§16.9 rows exist as named tests, each demonstrated red on a
    stated mutation. Any row that cannot be made red appears in `profile.exclusions` with an owner.
12. **Claim discipline.** The forbidden list holds **15** encoded entries bound to the manifest field
    that refuses each; the claimable list holds **8** entries bound to a named test; the system card
    carries **4** surface rows. Defeat: `TestForbiddenClaimsAreRefused` → RED with
    `claim "zero false positives" refused: falsePositiveRate.numerator = 1`.
13. **F16 — BLOCKED.** Engineering half measurable: **25 of 25** cells in the five-entry-point ×
    five-verb table deny under a non-elevated token on both install scopes. Defeat:
    `TestNonElevatedCannotMintChooseReplaceReadOrExport`, restore the current gate → RED with
    `user-scope install: non-elevated mint succeeded via performEnrollment`.
    **Certificate contribution: UNKNOWN.** Non-exportable custody needs a privileged broker or a
    KMS/HSM/TPM key owner — **procurement and key-ceremony lead time, not engineering time.**
    **R1, R3, R4 and the shared trust gate stay `NOT_READY`** and carry
    `prerequisites: ["F16-endpoint-signing-key-custody"]` per `docs/Devoid_Roadmap_To_Finished_Product.md:788`
    (separate repository; `roadmap:945`, `:947`, `:948` repeat it as mandatory).
14. **Live canary and independent reproduction — BLOCKED.** `proof.liveCanary` and
    `proof.independentReview` stay empty until: (a) the owner grants a **fresh explicit power-on ask**
    — ECS worker services have been at 0/0 since 2026-06-26 per `scripts/ceragon-power-state.json`,
    and `scripts/ceragon-power-on.ps1` restores them but a green local run is not permission;
    (b) an **independent evaluation owner who is not a detector author** is named in writing to hold
    the sealed corpus — **whether such a person exists is UNKNOWN**; (c) an **AIUC-1 independent
    audit** is contracted or explicitly declined in writing (no third-party evaluation body exists for
    AI runtime defence; do not budget for one). **Certificate contribution: UNKNOWN** for every lane
    whose evidence depends on a live effect.
15. **R2 — BLOCKED, and not by us.** Branch protection is impossible on the current GitHub plan; all
    six repositories return 403, and the roadmap makes M5.3-A mandatory for any 9+ R2 profile. That is
    a **billing decision the owner must make.** R2 stays `NOT_READY` regardless of anything in this
    wave. **Certificate contribution: UNKNOWN.**
16. **R5 — BLOCKED by arithmetic (D16).** Published guard models operate around **1% FPR** against
    this product's budget of **≤ 0.1%** visible interventions per benign session. The lexical
    classifier is structurally ineligible as an enforcing tier no matter what this wave binds. R5
    stays `NOT_READY`. **Certificate contribution: UNKNOWN.**
17. **The honest headline.** After this wave, the plan's goal statement reads: **zero of five risk
    lanes certify; four dimensions certify with 90-day expiry.** Any document, deck or console
    surface that says otherwise is a defect against criterion 12.

---

## Traceability — review finding → task

| Finding | Task | Note |
|---|---|---|
| P0-15 pre-egress data boundary | 1, 3 | S2/S12 rows of the sink inventory; the boundary itself is Wave 4A/4C work this wave *binds* |
| P0-16 authoritative effect boundary | 1, 2, 3, 12 | premise corrected — W1; the transaction is connected at `ai_handlers.go:3063` |
| P0-17 signed transport, live proof | 12 | `TestUnsignedWrongQueueWrongTenantWrongShaExpiredReplayedResultRejected`; the scanner lane's own proof is Wave 7A |
| P0-18 sandbox containment | 6 | recorded as an R3 `prerequisite`; the containment change itself is not in this wave |
| P0-19 F16 | 10 | citation corrected — W13; the respec is in a separate repo |
| P1-09 exclusions drive certificate state | 6, 12 | `profile.exclusions` is a manifest field with a certificate consequence, not a footnote |
| P1-10 rollback and drift triggers | 8 | `FALSE_POSITIVE_STORM` gets a monitor and a numeric threshold |
| P1-12 independent review owns the hidden set | 9 | BLOCKED — owner UNKNOWN |
| D14 fail-open forces non-green | 4 | observer shipped 7.10.6 (`40f34362`); the certificate consumer is what was missing |
| Review §9.5 continuous observation | 9 | sequential inference is the default, not an option |
| Review §10 manifest | 6 | schema v2 |
| Review §16.8 / §16.9 | 12 | 27 executable rows |
