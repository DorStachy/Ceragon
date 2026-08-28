# Wave 6 - Make the canary able to go green, and stop a new binary inheriting it

**Scorecard rows this moves:** Proof that enforcement happened: 3.5 -> 9.6 (strategy §12)
**Depends on:** Nothing for Tasks 1-6 — every one of them wires code that already exists on
`origin/main` on both sides of the wire. Tasks 7-9 depend on the wave that lands Workstream 7's
Decision/Effect Receipt split (they consume its vocabulary, they do not define it). Tasks 10-12
depend on Task 5 having produced at least one delivered receipt, and on the wave that lands
Workstream 4's WFP direct-egress denial for the two canary layers this wave deliberately does not
build (§ *What this wave deliberately does NOT do*).
**Phase:** 3 for Tasks 1-9; 4 for Tasks 10-12 (strategy §11).

---

## What exists today

Verified at `Installers` `origin/main` **5b129523**, `Backend` `origin/main` **0cf9021e** (deployed as
ECS task definition 322), `Frontend` `origin/main` **cac574ae**. Every checkout in this workspace is
far behind its `origin/main`; every line number below was read with `git show origin/main:<path>`, not
from the working tree. Re-check with the same form.

### The canary itself is complete, careful, and fails closed at every gate

Both lanes are written, both are hostile to their own false positives, and neither can manufacture a
green:

- Claude: `Installers/internal/airuntimeintegrity/providers/claude/canary.go:160-293` runs the full
  gate chain (challenge present -> shape/bounds -> signature verified -> endpoint/instance/bundle/
  projection binding -> expiry -> ledger consume BEFORE launch -> host invoke -> classify -> receipt).
  Binding is at `:299-327`, receipt emission at `:332-359`.
- Codex: `Installers/internal/codexmanaged/canary.go:236-398`, same order, with the rejection path
  funnelled through `fail()` at `:261-274` so a refusal is still uploaded as evidence.
- The real host invokers exist and launch the real installed client:
  `Installers/internal/codexmanaged/canary_host.go:132-234` and
  `Installers/internal/airuntimeintegrity/providers/claude/canary_host.go` (`ExecHostInvoker`).
- Both share one bounded launcher, `Installers/internal/aicanary/exec.go:77-138`.
- The redeem half **is** wired: `Installers/internal/daemon/ai_canary_consumption.go`
  (`canaryConsumptionSink`, redeeming through `backend.Client.ConsumeControlArtifact`), driven from
  `Installers/internal/airuntimeintegrity/controller.go:751`.
- A local read surface exists: `GET /v1/ai/canary`, `Installers/internal/daemon/ai_canary_status.go`.

### The server half is built, deployed, and waiting

This is the part that makes this wave a wiring job rather than a build job.

- `POST /api/v1/ai/policy-delivery/canary-receipt` —
  `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:758-779`; base path
  `@Controller('api/v1/ai/policy-delivery')` at `:268`.
- Its wire DTO `RecordCanaryReceiptDto` —
  `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:172-230`.
- Server-side binding re-check and first-write-wins semantics — `recordCanaryReceipt` at
  `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:543` onward,
  `assertReceiptAnswersChallenge` called at `:593`.
- Storage — `Backend/src/migrations/1790200000000-AddCanaryReceiptProof.ts`, six additive nullable
  columns (`proof_outcome`, `proof_observed_at`, `proof_expires_at`, `proof_runtime_version`,
  `proof_reason_slug`, receipt hash) plus CHECKs that refuse a non-PROVEN row carrying an expiry.

The controller's own docblock at `:152-171` says the DTO "mirrors, member-for-member, the single
canonical shape the agent's receipt sink marshals BOTH provider receipt structs into." **That sink
does not exist.** The contract was written from the server side, ahead of the agent.

### FOUR seams are unwired in production, not one

The Source of Truth §15.2 names the receipt sink. It is real, and it is not the first thing that
fails. Verified by reading `Installers/internal/daemon/ai_integrity_wiring.go` — the one file that
builds the two providers — end to end:

| Seam | Assigned in production? | Where the canary dies |
|---|---|---|
| `Challenges` / `Verifier` / `Resolver` | **Yes** — `ai_integrity_wiring.go:627-631` | — |
| `Host` / `InstanceHost` | **Yes** — `ai_integrity_wiring.go:689-710` | — |
| `Applied.BundleRevision` / `BundleDigest` / `ProjectionHash` | **No.** `:631` assigns `Applied.EndpointID` and nothing else | Codex: `canary-challenge-wrong-bundle` |
| `Ledger` | **No.** No assignment anywhere outside tests | Claude: `canary-ledger-unavailable`; Codex: same |
| `Receipts` | **No.** `git grep -n "Receipts" origin/main -- '*.go'` returns declarations, reads, and test assignments only | PROVEN demoted to ERROR |

Concretely:

1. **The applied binding is empty.** Codex compares it unconditionally at
   `Installers/internal/codexmanaged/canary.go:301-307`. A valid challenge payload is *required* to
   carry a canonical uint64 revision, a `sha256:`-prefixed digest and a bare sha256 projection hash —
   `Installers/internal/endpointcontrolauth/artifacts.go:247-254` — so it can never equal `""`. Every
   Codex canary therefore fails `CanarySlugWrongBundle` **before the ledger is even consulted**.
   Claude's equivalents at `providers/claude/canary.go:311-319` are `!= ""`-gated, so Claude skips
   them and dies one gate later instead.
   The Backend already knows this and says so in place —
   `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:530-536`: *"A receipt
   carrying empty applied bundle fields is refused by the shared shape gate. That is the current
   production state of the agent (its local applied binding is never populated)."*
2. **The ledgers are unwired.** Claude refuses at `providers/claude/canary.go:205-209`; Codex at
   `codexmanaged/canary.go:317-319`. Both are `CanaryError`, both fire before the host launches.
   Both implementations exist and are fully tested but have zero production callers:
   `Installers/internal/airuntimeintegrity/providers/claude/ledger.go:71` (`NewFileLedger`) and
   `Installers/internal/codexmanaged/canary_ledger.go:73` (`OpenChallengeLedger`) with its path
   helper at `:78` (`LedgerPathFor`).
3. **The receipt sink is unwired**, exactly as §15.2 states. `emitReceipt` treats a nil sink as a
   delivery *failure* (`providers/claude/canary.go:332-344`, `errNoReceiptSink` declared at `:55-59`),
   and the caller demotes PROVEN to ERROR with `canary-receipt-undelivered` at `:284-290`. Codex is
   identical at `codexmanaged/canary.go:379-396`. **This behaviour is correct and must not be
   weakened.** The fix is to supply a sink, never to soften the demotion.

The upstream half — the server refusing to mint a challenge for an endpoint with no applied bundle,
`Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:278-289`, `2081×` in a seven-day
window — is **correct behaviour and is already closed on one rig**: after the signed-bundle activation
of 2026-08-27 the refusal stopped recurring (SOT §16.1 C9). The count was a symptom of a fleet with no
applied bundles, not a defect in that code. Do not "fix" it.

### The proof path manufactures false failures

`Installers/internal/aicanary/exec.go:125` hard-codes `cmd.WaitDelay = 5 * time.Second`. `ProcessSpec`
(`:32-52`) has no field that overrides it. When a Codex turn holds the captured pipes past that delay
after the process exits, `cmd.Run()` returns `exec.ErrWaitDelay`, which is not an `*exec.ExitError`,
so `finish()` at `:144-161` returns it as an error — and both lanes classify a **real deny** as a
launch failure (`providers/claude/canary.go:237-241` -> `canary-host-error`;
`codexmanaged/canary.go:350-352` -> `CanarySlugHostLaunchFailed`). Measured: 2 of 6 real-host attempts
across the two required builds, on invocations where the client printed its own "Blocked" line in the
same launch; re-measured clean on identical arguments at 90 s (11.3 s wall clock, exit 0, full
transcript). SOT §15.2.

### The machine lane cannot be driven by its own live test

`Installers/internal/codexmanaged/canary_live_test.go:61` builds
`ExecCanaryHost{Machine: MachineProjection{Layout: DefaultMachineLayout()}}` — a **zero-value
projection**: no `Events`, no `HookCommand`, no `HookCommandDigest`, no `ProvenanceKey`, no
`RuntimeVersion`. `machinePromptGateInstalled` (`canary_host.go:416-442`) builds its `want` set from
`h.Machine.InlineHookSignature()` and returns false at `:433-435` when that set is empty. On a
machine-baselined endpoint `managedOnlySuppressesUserHooks` then removes the per-user fallback
(`:307-309`), so `promptGateInstalled` is false, the probe is `Synthetic`, and the outcome is
`UNSUPPORTED` — structurally, on every run. Production does not have this problem: it passes the real
compiled projection from `Provider.MachineProjectionFor()` (`codexmanaged/provider.go:164` ->
`projection()` at `:128-136`) via `ai_integrity_wiring.go:705-707`. The test does not mirror the
production shape it claims to mirror in its own comment at `:54-60`.

### The live-proof register — verified

`Installers/internal/liveproof/register.json`: schemaVersion 1, **8 entries, 3 observed, 5
quarantined**, every quarantine carrying `reviewBy: 2026-11-05`. Observed:
`pretooluse-deny-stops-side-effect`, `signed-bundle-activates-and-digest-reaches-backend`,
`codex-hook-fires-and-client-honours-deny`. Quarantined: `hook-lane-prompt-block`,
`anthropic-transport-decision`, `config-change-checkpoint`, `machine-secret-denies-local-users`,
`evidence-event-traced-end-to-end`. **There is no canary row at all** — the mechanism this wave is
about is not one of the eight controls the register tracks. Nothing outside `internal/liveproof`
imports the package; the register is a test and nothing else.

The parallel Codex ledger `Installers/internal/codexmanaged/testdata/liveproof/ledger.json` reads
`status: UNFIRED`, 2 `requiredBuilds` (0.134.0 and 0.146.0-alpha.3.1) × 2 lanes (machine, user) = four
required pairs, with **2 gating observations, both on the `user` lane**, plus 9 partials the gate
deliberately does not read.

### What already exists toward a certification factory

More than the strategy assumes. Do not build a second one.

- **A build register with binary digests and captured payload bytes:**
  `Installers/internal/airuntime/adapters/codex/testdata/shook/corpus/builds/manifest.json` — four
  builds, each with `sha256`, `selfReportedVersion`, platform, capture date, and a closed two-member
  evidence class (`live-capture` / `binary-schema`) with no `pending` member. Its own test fails a
  build whose required artifacts are missing.
- **A digest-scoped dialect pin:** `Installers/internal/codexmanaged/hookdialect.go:99-166`. Two
  confirmed families (`0.144.`, `0.147.`), each added on two vendor artefacts. Everything else —
  including the `0.149.0-alpha.4.1` the Codex desktop app runs — answers *no*.
- **A CI job that installs a pinned vendor client and drives it:**
  `Installers/.github/workflows/pr-checks.yml:382-486`, job `codex-vendor-lane`. It pins
  `@openai/codex@0.134.0`, runs `TestLiveCanary_RequiredBuildIsActuallyPresent` (which FAILS rather
  than skips when the runner claims a build) and `TestLiveVendorLane_RealCodexHost`, and uploads
  evidence. It is **mirrored locally in Docker** — `ci/gates.json`, `repos.Installers.mirrored`
  contains `pr-checks:codex-vendor-lane`, so it runs for free via `node ci/lib/run.mjs Installers`.
- **Automatic proof invalidation on a binary change:**
  `Installers/internal/codexmanaged/adapter_report.go:146-159` (`VersionChurned`) and `:176-191`
  (`EnforcementState`) — a proof taken against one client version is VOID when a different version is
  observed now, returning the instance to `ABOVE_FLOOR_CANARY_PENDING`. This is the strategy's "green
  status that survives a runtime binary update" avoid-item, already solved on the Codex lane.

### What is genuinely absent

- Any production assignment of `Receipts`, `Ledger`, or the applied-bundle tuple (above).
- A receipt-upload client method. `Installers/internal/core/backend/ai_canary_challenge.go` has
  `RequestCanaryChallenge` (`:105-176`) and `ConsumeControlArtifact` (`:187-223`) over one shared
  signed POST helper `postSignedControlAuthority` (`:228-268`). There is no third method.
- A **multi-layer** canary. There is exactly one drivable proof kind on each lane —
  `DrivableCanaryProofKind = "DENY_PROMPT_FIXED_PROBE"` (`codexmanaged/canary_host.go:255`, and the
  Claude equivalent) — and `RunDenyProbe` returns `Synthetic` for every other kind
  (`canary_host.go:138-140`). Managed-source, provider-route, direct-egress, gateway-deny, evidence
  and recovery canaries do not exist.
- A **posture state machine** that revokes only the claims that failed. There are three states, on
  the Codex lane only: `ABOVE_FLOOR_CANARY_PENDING`, `ENFORCEMENT_PROVEN`, `ENFORCEMENT_GAP`
  (`Installers/internal/codexmanaged/machine_projection.go:57-72`). Claude has no equivalent.
- Any surface that reads real canary evidence into the operator-facing verdict.
  `Installers/cmd/devoid/ai_codex_machine.go:492` calls `EnforcementState()` on the **zero value**, so
  it can never print PROVEN or GAP; its own comment at `:421-438` says so and says the fix is a
  caller change. On the server, `Backend/src/ai-governance/services/runtime-adapter-render.util.ts:313-317`
  still declares `NO_QUALIFYING_ENFORCEMENT_PROOF` with `blockedOn: 'EndpointControlAuthorityService.consume'`
  and `SERVER_ENFORCEMENT_PROOF_SOURCES = ['server-recorded-block']` at `:329` — stale now that
  `recordCanaryReceipt` exists, and nothing reads the recorded proof columns into a render state.
- Freshness anywhere near the strategy's target. `CanaryProofLifetime = 24 * time.Hour` on both lanes
  (`providers/claude/canary.go:64`, `codexmanaged/canary.go:43`). Strategy §7 WS8 asks for 15 minutes.
  Supporting cadences: challenge top-up every 2 minutes
  (`Installers/internal/daemon/ai_integrity_subsystem.go:227`), controller sweep 60 s ± jitter
  (`Installers/internal/airuntimeintegrity/controller.go:46`).

---

## Task 1: Make the child-process I/O grace bounded per call site instead of hard-coded at 5 s

**Files:**
- `Installers/internal/aicanary/exec.go` (`ProcessSpec` at `:32-52`, `Run` at `:77-138`)
- `Installers/internal/aicanary/launch_windows.go` (`pipeDrainGrace` at `:53` — the de-elevated path's
  mirror of the same value; both must move together or the two launch paths disagree)
- `Installers/internal/codexmanaged/canary_host.go` (`RunDenyProbe` process spec at `:191-209`)
- `Installers/internal/airuntimeintegrity/providers/claude/canary_host.go` (its `aicanary.ProcessSpec`
  at `:160-169`)
- New: `Installers/internal/aicanary/exec_iograce_test.go`

**Blast radius:** `aicanary.Run` is the launcher for **both** canary lanes and nothing else — confirmed
by the file header at `exec.go:13-18`. Getting the bound wrong in the permissive direction lets a child
that leaked a grandchild hold the daemon's canary goroutine for the whole grace window; getting it
wrong in the restrictive direction reproduces today's false `canary-host-error`. Who notices: nobody in
the field today (no canary reaches launch), and the operator running `TestLiveCanary_*` immediately.

**Rollback:** Single-field revert. The field defaults to the current 5 s when unset, so reverting the
two call sites alone restores today's behaviour exactly.

- [ ] Write `TestRun_IOGraceDefaultsToFiveSecondsWhenUnset` against a `ProcessSpec` with `IOGrace`
      unset; assert the constructed `cmd.WaitDelay` is `5 * time.Second`. RED (no field yet).
- [ ] Write `TestRun_IOGraceIsBoundedBelowTheTimeout`: a spec with `IOGrace >= Timeout` is rejected
      with a named error, not clamped silently. An I/O grace that outlives the kill deadline turns the
      timeout into a suggestion.
- [ ] Write `TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure`: a fake child that exits 0 and
      leaves a grandchild holding the pipe for 8 s, with `IOGrace: 30s`, returns `err == nil` and the
      captured stdout. With `IOGrace` unset it returns an error. This is the defect in one test.
- [ ] Add `IOGrace time.Duration` to `ProcessSpec` with the documented default and the `< Timeout`
      bound; apply it at `exec.go:125` and to `pipeDrainGrace` on the de-elevated Windows path.
- [ ] Set `IOGrace: 90 * time.Second` at both canary host call sites, with `Timeout` raised to at
      least `IOGrace + 30s` where it is currently lower (`DefaultCanaryProbeTimeout` is 60 s at
      `providers/claude/canary_host.go:98`; `CanaryConfig.probeTimeout()` defaults to 60 s at
      `codexmanaged/canary.go:219-224`). 90 s is the value re-measured clean in SOT §15.2 — do not
      pick a different number without a new measurement.

**Defeat test:** `TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure` — revert `exec.go` to
`cmd.WaitDelay = 5 * time.Second` (ignoring `spec.IOGrace`), expect RED with
`"expected a clean observation, got error: exec: WaitDelay expired before I/O complete"`.

**Exit:** `go test ./internal/aicanary -count=1` green, and a live run of
`TestLiveCanary_RealCodexHost` on a real client that prints its own "Blocked" line returns
`outcome=PROVEN` or `outcome=NOT_PROVEN` — a classification — in **0 of N** runs reporting
`canary-host-launch-failed`. N >= 6, matching the sample size in which 2 failures were measured.

---

## Task 2: Wire the single-use challenge ledgers on both lanes

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` (`bindIntegrityCanaryLoop` at `:204-217`)
- `Installers/internal/airuntimeintegrity/providers/claude/ledger.go` (`NewFileLedger` at `:71` — read
  only; do not modify)
- `Installers/internal/codexmanaged/canary_ledger.go` (`OpenChallengeLedger` at `:73`, `LedgerPathFor`
  at `:78` — read only)
- New: `Installers/internal/daemon/ai_canary_ledger_wiring_test.go`

**Blast radius:** Both ledgers write a bounded (512-entry) JSON file under the DeVoid config root and
harden it with the machine ACL. A wrong path writes a small file somewhere unexpected; an unwritable
path returns `canary-ledger-unavailable`, which is exactly today's outcome — so the failure mode of
this task is *no change*. The consume-before-launch ordering is already enforced inside the providers
and is not touched. Nobody in the field notices either way until Task 5 lands.

**Rollback:** Delete the two assignment lines. The nil-ledger refusal path is untouched and still
correct.

- [ ] `TestBindIntegrityCanaryLoop_AssignsBothLedgers`: build the wiring through
      `newIntegrityWiring` + `bindIntegrityCanaryLoop` with a temp config root; assert
      `w.claude.Ledger != nil` and `w.codex.Canaries.Ledger != nil`. RED today.
- [ ] `TestCanaryLedgerPathIsUnderTheDevoidConfigRoot`: assert the resolved path is
      `filepath.Join(configRoot, ...)` for both lanes and is **not** under any user-writable AI-tool
      config root. A ledger a standard user can delete is a replay fast-path removed, which is
      survivable (the Backend row is authoritative, `ai_canary_challenge.go:178-186`) but must be a
      deliberate choice, not an accident of path construction.
- [ ] `TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun`: drive the provider twice with the
      same challenge id against a recording host invoker; assert the host is invoked **once** and the
      second result is `canary-challenge-duplicate` / `CanarySlugChallengeReplayed`.
- [ ] Assign both ledgers in `bindIntegrityCanaryLoop`, using the daemon's existing config-root
      resolution (the same one `integrityStateDir` uses at
      `Installers/internal/daemon/ai_integrity_subsystem.go:416-421`).

**Defeat test:** `TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun` — revert the two ledger
assignments, expect RED with `"host invoker was called 0 times, want 1"` (the nil ledger short-circuits
before launch, so the count goes to zero, not two — assert on the exact number).

**Exit:** `go test ./internal/daemon -run Canary -count=1` green, and a manual canary against a stubbed
host produces a `codex-canary-ledger.json` on disk with exactly one entry after two runs of the same
challenge id.

---

## Task 3: Populate the applied-bundle binding every sweep

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` (`bindCanaryHostsLocked` at `:651-711`, called
  from `:376`; add a sibling `bindAppliedTupleLocked` invoked from the same place)
- `Installers/internal/daemon/ai_integrity_subsystem.go` (`integrityAuthorityPosture` at `:340-414` —
  the existing producer of `AppliedRevision` / `AppliedDigest`, including the durable-floor fallback at
  `:395-412`)
- `Installers/internal/daemon/ai_integrity_observed_projection.go` (the per-instance observed
  projection hash)
- New: `Installers/internal/daemon/ai_canary_applied_binding_test.go`

**Blast radius:** This is the field the Backend re-checks server-side before recording a receipt
(`endpoint-control-authority.service.ts:593`). If it is populated with the **wrong** tuple, every
receipt is refused 409 and the canary degrades to `canary-receipt-upload-failed` — i.e. back to
today's state, loudly. If it is populated with a *stale* tuple after a bundle activation, the canary
refuses itself with `canary-challenge-wrong-bundle`, which is also today's state. There is no shape of
this task that produces a false green, because the server holds the authoritative copy and compares.
That asymmetry is why this task is safe to do first.

**Rollback:** Remove the sibling call from `:376`. The unbound fields return to `""` and every gate
returns to refusing, exactly as now.

- [ ] `TestAppliedBindingMirrorsTheReportedPolicyIntegrityTuple`: with a posture carrying revision
      `"8"` and digest `"sha256:5209…"`, assert `w.codex.Canaries.Applied.BundleRevision == "8"`,
      `.BundleDigest == "sha256:5209…"`, and the Claude provider's `AppliedBundleRevision` /
      `AppliedBundleDigest` match. RED today (both empty).
- [ ] `TestAppliedBindingIsAllOrNothing`: a posture with a revision but no digest leaves **all three**
      fields empty. A half-populated tuple is worse than an empty one: Claude's `!= ""` guards would
      then check one member and skip the other, which is a partial binding nobody wrote a rule for.
      Mirror the all-or-none rule `integrityAuthorityPosture` already applies at `:383-393`.
- [ ] `TestAppliedBindingTracksAnActivationWithinOneSweep`: change the posture between two
      `BoundInstances` calls; assert the second sweep carries the new tuple. A canary bound to the
      previous generation is a challenge for a bundle this endpoint is no longer running.
- [ ] `TestClaudeProjectionHashIsPerInstance`: two instances with different observed projection hashes
      do not share one value. (The Claude provider carries a single `AppliedProjectionHash` field at
      `providers/claude/provider.go:148`; if the observed hashes differ across instances, the binding
      must leave it empty rather than pick one — the same per-instance defect already fixed for
      `claudeHosts` at `ai_integrity_wiring.go:683-693`.)
- [ ] Implement `bindAppliedTupleLocked(posture, rows)` and call it from the same place as
      `bindCanaryHostsLocked`.

**Defeat test:** `TestAppliedBindingIsAllOrNothing` — mutate the implementation to assign
`BundleRevision` before checking that the digest is present, expect RED with
`"partial applied binding: revision=\"8\" digest=\"\" — want all three empty"`.

**Exit:** On a rig with an activated signed bundle, `GET /v1/ai/canary` shows a per-instance record
whose `reasonSlug` is no longer `canary-challenge-wrong-bundle`, and the Codex lane reaches the ledger
gate. Named artifact: the daemon log line for one canary attempt showing a reason slug strictly later
in the gate chain than `wrong-bundle`.

---

## Task 4: Add the receipt-upload client method

**Files:**
- `Installers/internal/core/backend/ai_canary_challenge.go` (add `RecordCanaryReceipt` alongside
  `RequestCanaryChallenge` at `:105` and `ConsumeControlArtifact` at `:187`, reusing
  `postSignedControlAuthority` at `:228-268`)
- New: `Installers/internal/core/backend/ai_canary_receipt_test.go`
- Read-only reference: `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:172-230`

**Blast radius:** One new outbound signed POST. It can only fire for an endpoint that is v2
request-signed with an attested trust anchor and holds a minted challenge — the same preconditions
`RequestCanaryChallenge` already enforces at `:118-124`. On a fleet where no endpoint holds a
challenge, this method never executes. If the body shape is wrong the Backend returns **400, not a
silent drop**: `RecordCanaryReceiptDto` is deliberately STRICT (controller comment at `:161-166` —
`forbidNonWhitelisted` is relaxed only for DTOs marked as agent wire contracts, and this one is not).

**This inverts the usual landmine and you must know which one you are standing on.** The familiar
hazard is `AgentIngestValidationPipe` dropping unknown keys so an agent shipped ahead of the Backend
loses fields silently. This route does the opposite: an agent that sends one extra member gets a 400
and the canary degrades honestly. Both directions are still deploy-ordered — the route already exists
in td 322, so the agent may ship second and no ordering violation is possible for *this* task. It
becomes possible the moment anyone adds a member: **the Backend DTO changes first, deploys first, then
the agent.**

**Rollback:** The method is additive and has no callers until Task 5. Reverting Task 5 alone disarms
it.

- [ ] `TestRecordCanaryReceipt_RefusesWithoutV2EndpointSigning`: with signing absent, the method
      returns an error and **sends nothing**. Assert against a recording transport that zero requests
      were made. A receipt posted over an unsigned channel is a proof written onto whichever endpoint
      the server infers.
- [ ] `TestRecordCanaryReceipt_MarshalsExactlyTheServerDTOMembers`: marshal a fully-populated receipt
      and assert the JSON object's key set equals exactly the member set of `RecordCanaryReceiptDto`,
      with `endpointId` **absent**. Pin the expected key list as a literal in the test so adding a Go
      field fails here rather than at a 400 in the field.
- [ ] `TestRecordCanaryReceipt_OmitsOptionalMembersWhenEmpty`: `runtimeVersion`, `executionHost`,
      `proofExpiresAt`, `reasonSlug` and `receiptHash` are absent (not `""`) when unset — the DTO
      marks them `@IsOptional()`, and `@IsString()` on an empty string is a different value from
      absent.
- [ ] `TestRecordCanaryReceipt_A409IsAnAuthoritativeRefusalNotATransportFailure`: a 409 surfaces as
      `*APIError` so the caller can tell "the server refused this proof" from "the network failed",
      the same distinction `ConsumeControlArtifact` documents at `:180-186`.
- [ ] Implement, posting to `/api/v1/ai/policy-delivery/canary-receipt` with `wantStatus`
      `http.StatusOK` (the route is `@HttpCode(HttpStatus.OK)` at controller `:760`) and a response
      bound of 4 KiB, decoded with `decodeStrictControlAuthorityJSON`.

**Defeat test:** `TestRecordCanaryReceipt_MarshalsExactlyTheServerDTOMembers` — add an `EndpointID`
member to the marshalled struct, expect RED with
`"unexpected wire member \"endpointId\": the server derives the endpoint from the request signature"`.

**Exit:** Against a local Backend at `origin/main`, one hand-driven call returns 200 and the
`endpoint_control_authority` row for that challenge has non-NULL `proof_outcome` and
`proof_observed_at`. Named artifact: the SQL result pasted into the live-proof procedure doc.

---

## Task 5: Wire the sink into both providers, without weakening the demotion

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` (`bindIntegrityCanaryLoop` at `:204-217`)
- New: `Installers/internal/daemon/ai_canary_receipt_sink.go` — one adapter type implementing **both**
  `claudeprovider.ReceiptSink` (`providers/claude/canary.go:150-153`) and `codexmanaged.ReceiptSink`
  (`codexmanaged/canary.go:168-173`), marshalling both receipt structs into the one canonical wire
  shape the Backend DTO names
- New: `Installers/internal/daemon/ai_canary_receipt_sink_test.go`
- **Do not modify:** `providers/claude/canary.go:258-291`, `codexmanaged/canary.go:376-396`, or
  `providers/claude/canary_receipt_gate_test.go`. Those are the guard.

**Blast radius:** This is the task that makes a green *possible* for the first time. Getting it wrong
in the permissive direction — a sink that swallows its own errors and returns nil — reproduces exactly
the manufactured green the code's own comment at `providers/claude/canary.go:259-274` describes, and it
would set `Evidence.EnforcementTestedAt`, feed `hasEnforcementProof()`, and report `PROVEN_GOVERNED`
fleet-wide on no evidence. Getting it wrong in the restrictive direction keeps today's honest
`canary-receipt-undelivered`. **The sink must return the transport error verbatim.**

Second blast surface: outbound volume. A sink that uploads on every rejection path (both lanes already
call `emitReceipt` on binding failures, expiry, duplicates and ledger errors —
`providers/claude/canary.go:193, 200, 207, 213, 217, 224, 230`) will POST once per canary attempt per
instance. Bound it: the challenge top-up is every 2 minutes
(`ai_integrity_subsystem.go:227`) and the sweep is 60 s, so the ceiling is one POST per instance per
sweep. State that ceiling in the sink's docblock and pin it with a test.

**Rollback:** Delete the two assignments in `bindIntegrityCanaryLoop`. Both lanes return to
`errNoReceiptSink` and to demoting PROVEN to ERROR — the current, honest, shipped behaviour. This is a
one-line-per-lane rollback with no schema, no migration and no server change.

- [ ] `TestReceiptSinkIsAssignedOnBothProviders` in the daemon package. RED today.
- [ ] `TestSinkReturnsTheTransportErrorVerbatim`: a 500 from the route surfaces as a non-nil error out
      of `Upload` / `UploadCanaryReceipt`. Assert the error is not swallowed and not wrapped into
      something the caller reads as success.
- [ ] `TestProvenStillDegradesWhenTheSinkFails` — re-assert the existing guard through the **new**
      wiring, not just in the provider package: with a failing sink, `Canary` returns
      `Outcome == CanaryError`, `ProofExpiresAt == ""`, `ReasonSlug == canary-receipt-undelivered`.
- [ ] `TestSinkIsNilWhenTheEndpointCannotSign`: on an endpoint with no v2 request signing, the sink is
      **not** assigned, so the lane keeps its current honest refusal rather than emitting a POST that
      cannot be attributed. Do not invent a "best effort" sink for an unenrolled endpoint.
- [ ] `TestOneUploadPerCanaryAttempt`: drive two attempts on one instance; assert exactly two POSTs.
- [ ] Implement the adapter and assign it to `w.claude.Receipts` and `w.codex.Canaries.Receipts`.

**Defeat test:** `TestProvenStillDegradesWhenTheSinkFails` — change the sink's `Upload` to
`return nil` on error, expect RED with
`"outcome=PROVEN with an undelivered receipt: the endpoint self-certified"`.

**Exit:** On the local-Backend rig, one canary run against a real Codex client that prints
`hook: UserPromptSubmit Blocked` produces `outcome=PROVEN`, a 200 from `/canary-receipt`, and an
`endpoint_control_authority` row with `proof_outcome='PROVEN'` and `proof_expires_at > now()`. **This
is the first green this mechanism has ever produced** and it is the wave's headline artifact.

---

## Task 6: Make the live Codex canary test able to drive the machine lane

**Files:**
- `Installers/internal/codexmanaged/canary_live_test.go` (`:61`, and the comment at `:54-60` that
  claims it mirrors production)
- `Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md` (§3, the machine-lane procedure)

**Blast radius:** Test-only. The risk is the opposite of a production risk: a test that *looks* like it
drives the machine lane and cannot has already produced two `user`-lane observations recorded against
four required (build, lane) pairs. Who notices: the operator running the live-proof procedure, and the
`liveproof_gate_test.go` gate that keeps reading `UNFIRED`.

**Rollback:** Revert one file. No shipped code is touched.

- [ ] `TestLiveCanaryTestUsesTheProductionProjectionShape`: a **unit** test (not the skipped live one)
      asserting that the projection the live test constructs has a non-empty
      `InlineHookSignature()`. RED today — the zero value returns an empty set.
- [ ] `TestMachineLanePreconditionIsAssertedNotAssumed`: when `DEVOID_CANARY_LANE=machine` is set, a
      run whose `machinePromptGateInstalled()` is false **fails** with a named reason instead of
      logging `UNSUPPORTED` and passing. The claim "this image has a machine baseline" must convert
      an absence into a failure, exactly as `TestLiveCanary_RequiredBuildIsActuallyPresent`
      (`canary_live_test.go:133-140`) converts a missing build into one.
- [ ] Replace `:61` with a projection built the way production builds it — `Provider{Layout, HookCommand,
      HookCommandDigest, RuntimeVersion, EndpointScope}.MachineProjectionFor()` — taking the launcher
      path and observed version from new `DEVOID_CANARY_*` environment inputs, so the test constructs
      the same object `ai_integrity_wiring.go:705-707` does and never a second definition of it.
- [ ] Record in the runbook, in place, that `%ProgramData%` redirection does **not** move the client's
      machine root (the vendor binary resolves the Windows known folder), so the machine lane can only
      be measured on a host whose real `C:\ProgramData\OpenAI\Codex` may be written. This is a fact
      about the vendor, not a defect to fix.

**Defeat test:** `TestLiveCanaryTestUsesTheProductionProjectionShape` — restore
`MachineProjection{Layout: DefaultMachineLayout()}`, expect RED with
`"the live canary builds a projection with 0 inline hook groups; the machine lane cannot be attributed"`.

**Exit:** `internal/codexmanaged/testdata/liveproof/ledger.json` gains at least one observation with
`"lane": "machine"`, taking the four required (build, lane) pairs from 2/4 met to at least 3/4. If the
machine lane measures *failing*, that is a real result and is recorded as one — see the wave exit
criteria.

---

## Task 7: Split the single deny probe into a claim set, and compose posture per claim

**Files:**
- `Installers/internal/airuntimeintegrity/provider.go` (`CanaryOutcome` at `:113-127` — extend the
  request/result to carry a claim id; **do not** change the four outcome members)
- `Installers/internal/endpointcontrolauth/artifacts.go` (`CanaryProofKinds` — the closed vocabulary
  the Backend also validates against; see the Backend counterpart below)
- `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:184` (`@IsIn(CANARY_PROOF_KINDS)`)
  and the shared contract that defines `CANARY_PROOF_KINDS`
- New: `Installers/internal/airuntimeintegrity/posture.go` + `posture_test.go`
- `Installers/internal/codexmanaged/machine_projection.go:57-72` (the three existing states, which
  become the composition of the new per-claim states, not a parallel vocabulary)

**Blast radius:** Widening `CanaryProofKinds` is a **contract change across the wire**, and it is the
one place in this wave where the deploy order is load-bearing in the dangerous direction. The Backend
validates the requested proof kind at mint time (`endpoint-control-authority.service.ts:264-266`,
`isCanaryProofKind`) and again on the receipt DTO. **Backend ships and deploys the widened vocabulary
first; the agent requests a new kind only after that deploy is confirmed.** An agent that requests an
unknown kind gets a 400 and stops asking — annoying but safe. An agent that *receives* a kind it does
not know already refuses it (`endpointcontrolauth` shape gate). The reverse order is the fleet-wide
outage shape.

**Rollback:** The claim set is additive. Reverting the agent to request only
`DENY_PROMPT_FIXED_PROBE` restores single-claim behaviour with the Backend's widened vocabulary still
deployed and unused, which is inert.

- [ ] `TestPostureRevokesOnlyTheFailedClaim`: with `hook-dispatch = FAILED` and `managed-source =
      PROVEN`, the composed posture reports the hook claim revoked and the managed-source claim still
      held. Today's three-state machine cannot express this. RED.
- [ ] `TestPostureNeverGreenOnAnUnprovenClaim`: any claim in `UNKNOWN`, `ERROR`, `UNSUPPORTED` or
      expired removes the aggregate "prevention active" claim. Mirror the pessimism
      `aggregateIntegrityState` already applies at
      `Installers/internal/daemon/ai_integrity_subsystem.go:596-600` — the worst input wins.
- [ ] `TestPostureDistinguishesNotMeasuredFromMeasuredFailure`: a claim never attempted composes
      differently from one attempted and failed. Collapsing them is the exact defect
      `EnforcementState` was written to avoid (`adapter_report.go:169-175`).
- [ ] `TestUnknownClaimIdIsRefusedNotIgnored`: a claim id this build does not model does not silently
      drop out of the composition.
- [ ] Implement the claim vocabulary for the layers this wave can honestly reach:
      `managed-source`, `hook-dispatch`, `pre-action-effect` (the existing deny probe), and
      `evidence-delivery` (the receipt from Task 5). The remaining four strategy layers are out of
      scope — see the closing section.
- [ ] Keep the three legacy state strings as a **derived** rendering of the composition, so no existing
      consumer changes shape.

**Defeat test:** `TestPostureRevokesOnlyTheFailedClaim` — collapse the composition back to a single
worst-outcome string, expect RED with
`"managed-source claim reported revoked; only hook-dispatch failed"`.

**Exit:** `GET /v1/ai/canary` returns a per-claim breakdown for at least four claims on a rig with a
wired canary, and the aggregate matches the pessimistic rule for every one of the 4^4 combinations
exercised by a table test.

---

## Task 8: Bring proof freshness down to a change-driven, time-bounded window

**Files:**
- `Installers/internal/airuntimeintegrity/providers/claude/canary.go:61-64` (`CanaryProofLifetime`)
- `Installers/internal/codexmanaged/canary.go:40-43` (`CanaryProofLifetime`)
- `Installers/internal/daemon/ai_integrity_subsystem.go:223-227`
  (`canaryChallengeRefreshInterval`) and `runCanaryChallengeLoop` at `:238-256`
- New: `Installers/internal/daemon/ai_canary_freshness_test.go`

**LAND THIS BEFORE TASK 5 IS DEPLOYED.** Today zero endpoints hold a PROVEN canary, so shortening the
lifetime revokes nothing and its blast radius is literally empty. After Task 5 there will be green
endpoints, and shortening the window then is a fleet-wide revocation event. Same code, two completely
different risk profiles, separated only by ordering.

**Blast radius:** A window that is too short burns challenges (the Backend mints them, single-use, at
a `MaxCanaryChallengeLifetime` bound) and launches the real client more often — a real, observable
process on the developer's machine. A window that is too long is the stale green the strategy is
trying to remove. Who notices: an operator watching Codex sessions start on their box.

**Rollback:** Two constants. Reverting to 24 h restores today's semantics exactly.

- [ ] `TestProofExpiryIsAtMostFifteenMinutes` on both lanes. RED today (24 h).
- [ ] `TestProofIsVoidedByAnEventNotOnlyByTime`: assert a re-canary is required immediately after each
      of — install, upgrade, runtime binary change, policy change, managed-source change, service
      restart, user sign-in. The binary-change case is **already implemented** on the Codex lane
      (`VersionChurned`, `adapter_report.go:146-159`); this test extends the same rule to the others
      and to the Claude lane, which has no equivalent at all.
- [ ] `TestCanaryLaunchRateIsBounded`: with a 15-minute window and a 60-second sweep, assert at most
      one host launch per instance per window under a simulated clock. Prevent the shortened window
      from turning into a probe storm.
- [ ] `TestAStaleProofIsNotAFailure`: an expired proof composes to *pending*, never to *gap*. The
      difference is the whole reason `ABOVE_FLOOR_CANARY_PENDING` exists
      (`machine_projection.go:57-64`).
- [ ] Implement, keeping the two lanes' constants equal and pinned to each other by a parity test —
      the two lanes have disagreed before, and the weaker one was the default
      (`providers/claude/canary.go:276-278`).

**Defeat test:** `TestAStaleProofIsNotAFailure` — map an expired proof to `ENFORCEMENT_GAP`, expect RED
with `"an expired proof reported as a measured enforcement gap"`.

**Exit:** A rig left idle for 20 minutes after a PROVEN canary reports pending, not proven, and not a
gap; and the observed host-launch count over one hour is <= 4 per instance.

---

## Task 9: Make the surfaces read the real evidence instead of a constant

**Files:**
- `Installers/cmd/devoid/ai_codex_machine.go:492` (the zero-value `EnforcementState()` call; its own
  comment at `:421-438` names this task and says only the caller changes)
- `Installers/internal/daemon/ai_canary_status.go` (the existing `GET /v1/ai/canary` reader — the
  source the CLI should consult)
- `Backend/src/ai-governance/services/runtime-adapter-render.util.ts:266-332`
  (`NO_QUALIFYING_ENFORCEMENT_PROOF` at `:313-317`, `SERVER_ENFORCEMENT_PROOF_SOURCES` at `:329`)
- `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts` (a read of the `proof_*`
  columns for the render path)

**Blast radius:** This is the task that lets a green appear in front of a customer. Two guards. First,
the Backend read must require `proof_outcome = 'PROVEN'` **and** `proof_expires_at > now()` — the
migration's own docblock (`1790200000000-AddCanaryReceiptProof.ts:50-54`) states that a PROVEN row with
a NULL expiry is deliberately **not** a live proof and must read as not-proven. Second, on the CLI the
existing `OK`/`Proven` split must be preserved: `OK: true, Proven: false` for a clean-but-unproven
endpoint is correct and exiting non-zero there would fail the whole fleet on its normal state
(`ai_codex_machine.go:412-419`).

**Rollback:** Backend: revert to the frozen `NO_QUALIFYING_ENFORCEMENT_PROOF` constant — the render
degrades to `observed` and nothing crashes. CLI: revert one caller to the zero value.

- [ ] `TestCodexMachineStatusReadsTheStore`: with a store holding a PROVEN, fresh record the surface
      prints `ENFORCEMENT_PROVEN`; with a NOT_PROVEN record it prints `ENFORCEMENT_GAP`. RED today —
      both print `ABOVE_FLOOR_CANARY_PENDING`.
- [ ] `TestCodexMachineStatusExitCodeIsUnchangedForAPendingEndpoint`: still `OK`, still exit 0, still
      `[i]` and not `[OK]`.
- [ ] Backend `endpoint-control-authority.canary-receipt.live-pg.spec.ts` (extend the existing live-PG
      spec): a PROVEN row with a NULL `proof_expires_at` does **not** satisfy the enforcement-proof
      read; a PROVEN row with a future expiry does; a PROVEN row with a past expiry does not.
- [ ] Backend: append `'validated-canary-receipt'` to `SERVER_ENFORCEMENT_PROOF_SOURCES` — the
      constant's own docblock at `:319-328` says it is an enum precisely so this is an append, not a
      re-shape — and rewrite the `NO_QUALIFYING_ENFORCEMENT_PROOF` docblock, which is now stale: it
      says the artifact "does not exist yet" and blocks on `consume`, while `recordCanaryReceipt`
      landed. Record the correction in place rather than deleting the paragraph.

**Defeat test:** `endpoint-control-authority.canary-receipt.live-pg.spec.ts` /
`"a PROVEN receipt with no expiry is not a live proof"` — drop the `proof_expires_at > now()` clause,
expect RED with `"expected enforcementProof=false for an unbounded PROVEN row, got true"`.

**Exit:** With one live PROVEN receipt on a local Backend, the console's runtime-adapter render reports
the checkpoint as enforcement-proven, and reports it as **not** proven 16 minutes later without any
further action. Named artifact: two screenshots or two API responses 16 minutes apart.

---

## Task 10: Turn the build corpus into a per-digest capability certificate

**Files:**
- `Installers/internal/airuntime/adapters/codex/testdata/shook/corpus/builds/manifest.json` (the
  existing register — the certificate's *evidence* half; keep it as testdata)
- New: `Installers/internal/runtimecert/` — `certificate.go`, `certificate.json`, `certificate_test.go`
- `Installers/internal/codexmanaged/hookdialect.go:99-166` (the existing per-family pin — the
  certificate must **derive** its dialect row from this, never restate it)
- `Installers/internal/codexmanaged/adapter_report.go:146-159` (`VersionChurned` — the certificate
  keys on digest, which is strictly stronger than the version string this already compares)

**Blast radius:** A certificate that answers "unknown" for a binary the fleet actually runs turns every
such endpoint's posture to `UNVERIFIED`, which is *not* green and *not* a gap. That is the intended
behaviour and it is safe, but it will be visible: the Codex desktop on the authoring machine runs
`0.149.0-alpha.4.1`, which no dialect row covers (`hookdialect.go:163-165`), so it will read
UNVERIFIED on day one. Say that in the release note before anyone reports it as a regression.

**A certificate must never be able to make an endpoint refuse to launch a runtime.** A fail-closed
branch on an unprovable condition bricked a machine in July 2026 and the operator removed the agent.
"This binary has no certificate" is not provable as malicious — it is provable only as *unmeasured*.
The certificate removes claims; it does not remove capability.

**Rollback:** The certificate is a new package with one consumer (Task 11's posture input). Removing
the consumer returns every endpoint to today's version-string reasoning.

- [ ] `TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState`: certify digest A as PROVEN, present
      digest B, assert `UNVERIFIED` — not A's state, not "assume compatible", not "assume hostile".
- [ ] `TestCertificateIsKeyedByDigestNotVersionString`: two binaries reporting the same
      `--version` with different sha256 get different rows. The vendor ships the same version string
      from npm and from the desktop bundle; the manifest already records both paths and both digests
      (`builds/manifest.json`, the 0.134.0 and 0.144.0-alpha.4 rows).
- [ ] `TestCLIAndIDEAndDesktopAreSeparateRows`: one digest certified for host `cli` does not certify
      host `desktop`. The strategy's §9 exit gate requires this and the SOT's own Codex evidence says
      the desktop is a different runtime.
- [ ] `TestNoCertificateWithoutBothAnAllowAndADenyControl`: a row whose evidence carries only a deny
      observation is refused. The three observed live-proof entries all carry an allow twin on the
      identical rig; a deny with no allow control proves the rig is broken, not that enforcement works.
- [ ] `TestExpiredCertificateIsNotAValidCertificate`, with the expiry as data, not a constant.
- [ ] `TestEveryCertifiedDigestHasACorpusEntry`: the certificate cannot name a build the evidence
      register does not carry. This is the join that stops the certificate becoming a second,
      unevidenced source of truth.

**Defeat test:** `TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState` — make the lookup fall back
to the newest certified row, expect RED with
`"digest b3f1… inherited the state of digest 1766ac7d…"`.

**Exit:** A certificate file listing, at minimum, the four digests already in
`builds/manifest.json`, each with host, OS, dialect id, covered/uncovered tool paths, test-suite
version, and expiry — and a test proving a fifth, unknown digest reads `UNVERIFIED`.

---

## Task 11: Run the certification matrix on the substrate that actually exists

**Files:**
- `Installers/.github/workflows/pr-checks.yml:382-486` (extend `codex-vendor-lane` from one pinned
  build to a matrix)
- `ci/gates.json` (`repos.Installers.mirrored` already contains `pr-checks:codex-vendor-lane`; the
  matrix legs that cannot run locally go in `cannotMirror` **with a reason**, which
  `node ci/lib/drift.mjs` enforces)
- New: `Installers/internal/runtimecert/watch/` — a release-channel watcher that records
  (channel, version, digest, signer, observed-at) and nothing else
- `Installers/internal/codexmanaged/testdata/liveproof/ledger.json` (`requiredBuilds` — the CI pin and
  this list already fail when they drift apart; keep that property)

**Be honest about what this can and cannot cover. This is the part of Workstream 9 that is not
engineering.**

| Surface | Substrate | Cost | Verdict |
|---|---|---|---|
| Codex CLI on Linux | `codex-vendor-lane`, already mirrored in local Docker | free (`node ci/lib/run.mjs Installers`) | **Do it.** Add matrix legs here. |
| Claude Code CLI on Linux | same job pattern, new legs | free | **Do it.** No workflow has ever installed a Claude client; this is new ground and it is cheap. |
| Codex/Claude **machine lane** on Windows | needs a host whose real `C:\ProgramData\OpenAI\Codex` may be written — `%ProgramData%` redirection does not move the client's machine root, it resolves the Windows known folder | a real Windows VM per leg. `ci/gates.json` already records that Windows jobs `cannotMirror`: "Windows containers need a Windows container host; Docker Desktop here runs the Linux engine." | **Cannot be automated on the substrate we have.** Specify it as an operator-run procedure with a recorded artifact, and put the VM cost in front of the owner as a decision, not as a task. |
| macOS hosts | none | Apple licences macOS VMs only on Apple hardware; `ci/gates.json` calls this "the single most expensive job in the workspace (30 legs per run) and it has no local substitute" | **Out of scope.** It is also outside the strategy's own certified boundary (§2.1: native macOS is a separate profile). |
| Desktop (MSIX) and IDE-extension hosts | none | each is a distinct installed runtime with its own embedded binary | **Certificate rows exist and read UNVERIFIED.** Declaring them uncovered is the honest state; measuring them needs the Windows VM above. |
| A DeVoid-certified release *ring* that holds back vendor auto-update | not ours | npm and the vendor updaters are not under our control | **Not engineering.** The strongest safe subset is: pin where the vendor's managed config honours a pin, and otherwise **detect the change and revoke the claim**. Never block the binary — that is an availability control over a vendor product on the customer's machine, and it is how the agent gets uninstalled. |

**Blast radius:** CI-only, with one exception: `requiredBuilds` and the CI pin are already coupled by a
failing test (`pr-checks.yml:425-442`). Adding matrix legs without adding the corresponding ledger rows
turns that coupling red, which is the coupling working. Note the two standing traps recorded in the
workflow header at `:67-77`: GitHub Actions has been blocked org-wide (jobs die in ~4 s with no runner)
and GitHub silently disables scheduled workflows after 60 days of inactivity — **a red scheduled run is
not evidence until you read the job's own output.**

**Rollback:** Matrix legs are additive; drop back to the single pinned build. The `cannotMirror`
entries are documentation and removing them only re-triggers `drift.mjs`.

- [ ] `TestReleaseWatcherRecordsDigestAndSignerNeverJustAVersion`: a watcher entry with no digest is
      refused. "Semantic-version prefix widening without live artifacts" is on the strategy's own
      avoid list (§7 WS9), and the two-artefacts-per-family rule is stated in place at
      `Installers/internal/codexmanaged/hookdialect.go:117-166` and re-stated in
      `AI_SECURITY_SOURCE_OF_TRUTH.md` §16.1 C1: a loose pin is how this lane went silently dead
      the first time.
- [ ] `TestANewReleaseDoesNotEnterTheRingBeforeItsMatrixRuns`: a watcher entry with no certificate
      cannot be marked ring-eligible.
- [ ] `TestCIPinAndRequiredBuildsAndCertificateAllNameTheSameDigests`: extend the existing pin-drift
      test to a three-way join.
- [ ] `TestEveryUnmirroredMatrixLegHasAStatedReason`: `drift.mjs` already fails on an unmapped job;
      add the assertion that each `cannotMirror` reason names the missing capability, not just
      "Windows".
- [ ] Add matrix legs for the builds the corpus already carries, on Linux, in the mirrored job.
- [ ] Write the Windows machine-lane procedure as an operator runbook section with the same evidence
      fields the live-proof register demands, so a manual run can close a register row.

**Defeat test:** `TestANewReleaseDoesNotEnterTheRingBeforeItsMatrixRuns` — mark a watcher entry
eligible on version-prefix match alone, expect RED with
`"0.150.1 entered the prevention ring on a prefix match with no certificate"`.

**Exit:** The `codex-vendor-lane` job runs >= 3 pinned builds; `node ci/lib/drift.mjs` is clean; and
`ci/gates.json` carries a `cannotMirror` reason for every Windows/desktop leg naming the VM it needs.
A written cost figure for the Windows VM matrix is in front of the owner. **Do not report this
workstream as complete on the strength of the Linux legs.**

---

## Task 12: Put the canary into the live-proof register and keep the gate hostile

**Files:**
- `Installers/internal/liveproof/register.json` (8 entries today; this adds two)
- `Installers/internal/liveproof/liveproof.go:98` (`Validate` — read only; the rules already do the
  work)
- `Installers/internal/codexmanaged/testdata/liveproof/ledger.json`
- `docs/ai-security/LIVE_PROOF_PROCEDURE.md` (the executable procedure each entry must point at)

**Blast radius:** The register is a test and nothing imports it outside its own package, so this cannot
affect a running endpoint. It *can* turn CI red, which is the point: an unobserved control with no
quarantine is a hard fail (`liveproof.go:19-21`), a quarantine must name a reason, an owner and a
`reviewBy` date, and the quarantine **expires** on that date.

**Rollback:** Revert the JSON. Nothing else reads it.

- [ ] Add entry `canary-reaches-proven-with-a-delivered-receipt`, `observed: false`, with a quarantine
      naming the four unwired seams from *What exists today* and pointing at the Task 5 exit criterion
      as the procedure. It flips to `observed: true` only with all five evidence fields — including
      the SQL row showing `proof_outcome='PROVEN'`.
- [ ] Add entry `canary-proves-the-machine-lane`, `observed: false`, quarantined on the Windows
      known-folder fact from Task 6 and the VM decision from Task 11. **This entry may be closed by a
      measured FAILURE as well as a success** — the SOT already records the machine lane as measured
      *failing* (zero hooks fired, deny prompt sent straight to the provider), and a measured failure
      is a real result that belongs in the register, not a reason to leave it silent.
- [ ] Set both `reviewBy` dates deliberately. Do not copy `2026-11-05` from the existing five just
      because it is there.
- [ ] `TestRegisterHasACanaryEntry`: the register names the canary control at all. RED today — the
      mechanism this whole wave is about is not one of the eight tracked controls.
- [ ] `TestNoQuarantineOutlivesItsReviewDate`: already enforced by `Validate`; add the explicit case so
      a future schema change cannot drop it.

**Defeat test:** `TestRegisterHasACanaryEntry` — remove the new entry, expect RED with
`"no live-proof entry covers the canary; the mechanism that answers 'is enforcement alive' is not tracked"`.

**Exit:** `go test ./internal/liveproof -count=1` green with **10** entries, and the register's counts
line reads *10 entries, N observed* with N stated honestly.

---

## Wave exit criteria

1. **The canary reaches PROVEN once, on a real installed client, with a receipt the server holds.**
   Evidence: `outcome=PROVEN` in the agent log, HTTP 200 from
   `POST /api/v1/ai/policy-delivery/canary-receipt`, and an `endpoint_control_authority` row with
   `proof_outcome='PROVEN'` and `proof_expires_at > now()`. Defeat test:
   `TestProvenStillDegradesWhenTheSinkFails` (Task 5).
2. **A PROVEN canary with an undelivered receipt is still not a proof.** The demotion at
   `providers/claude/canary.go:284-290` and `codexmanaged/canary.go:379-396` is byte-unchanged.
   Defeat test: `TestProvenStillDegradesWhenTheSinkFails`.
3. **Zero of >= 6 real-host canary attempts report `canary-host-launch-failed` on a run where the
   client printed its own block line.** Baseline for comparison: 2 of 6. Defeat test:
   `TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure` (Task 1).
4. **All four previously-unwired seams are assigned in production code**, proven by four separate
   daemon-package tests (Tasks 2, 3, 5). Defeat tests:
   `TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun`,
   `TestAppliedBindingIsAllOrNothing`, `TestReceiptSinkIsAssignedOnBothProviders`.
5. **A proof older than 15 minutes reads pending, not proven, and not a gap**, on both lanes. Defeat
   test: `TestAStaleProofIsNotAFailure` (Task 8).
6. **A failed claim revokes only that claim.** >= 4 claims composed, all combinations table-tested.
   Defeat test: `TestPostureRevokesOnlyTheFailedClaim` (Task 7).
7. **An unknown binary digest reads `UNVERIFIED` and never inherits a certified digest's state.**
   Defeat test: `TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState` (Task 10).
8. **`internal/codexmanaged/testdata/liveproof/ledger.json` moves from 2/4 to >= 3/4 required
   (build, lane) pairs**, with the machine-lane row recording whatever was actually measured. Defeat
   test: `TestMachineLanePreconditionIsAssertedNotAssumed` (Task 6).
9. **The live-proof register carries 10 entries, and the canary is one of them.** Defeat test:
   `TestRegisterHasACanaryEntry` (Task 12).
10. **`node ci/lib/drift.mjs` is clean and `node ci/lib/run.mjs Installers` passes**, with the report
    naming which legs ran and which could not. Never report this wave as "all checks pass": 73 legs in
    this workspace cannot be mirrored at all, and the Windows machine lane is one of them.

**Ordering that is load-bearing and has broken production before:**

- **Task 8 lands before Task 5 is deployed.** Shortening the proof window on a fleet with zero green
  endpoints revokes nothing; doing it afterwards is a fleet-wide revocation.
- **Task 7's widened `CANARY_PROOF_KINDS` ships on the Backend and is deployed BEFORE any agent
  requests a new kind.** This is the same rule that caused a fleet-wide outage in the other direction.
  Note the asymmetry that makes this route unusual: `RecordCanaryReceiptDto` is **strict**, so an agent
  ahead of the Backend gets a 400 rather than a silent field drop — loud, not invisible. That is a
  reason to be less afraid of *this* route, not a reason to relax the rule.
- **Task 4/5 may ship on the agent second**, because the receipt route already exists in the deployed
  Backend (td 322). Confirm the migration `1790200000000-AddCanaryReceiptProof` has actually **run** in
  production before relying on it; the file being on `origin/main` is not the same fact.
- **Deploying any of this needs a fresh, explicit ask from the owner.** A green local run is not
  permission, and merging is not deploying.

---

## What this wave deliberately does NOT do

- **It does not build four of the strategy's eight canary layers.** The provider-route canary, the
  direct-egress bypass canary and the gateway-deny canary all rest on Workstream 4's forced egress and
  WFP/ALE denial, which do not exist yet. Writing them now would produce three probes that always
  report "not applicable", which is a fourth green light over a dead path. This wave defines the claim
  vocabulary (Task 7) so those layers are an append when their substrate lands. The recovery canary is
  deferred with them: re-running after service restart, update, logon and resume needs Workstream 3's
  real Windows service, and re-running against today's scheduled task would certify the wrong object.
- **It does not make any canary result refuse a runtime launch.** The strategy contemplates refusing a
  managed runtime launch on WFP failure. That is not safe from here. A fail-closed branch on an
  unprovable condition bricked a machine in July 2026 and the operator removed the agent — and canary
  freshness is *conspicuously* unprovable on an endpoint that has never been minted a challenge, which
  was every endpoint in the fleet 2,081 times in seven days. Revoking a claim is safe because the worst
  case is a red console; refusing a launch is not, because the worst case is an uninstalled control
  that protects nobody. Revisit only when the provable condition can be named: *this endpoint has held
  a valid applied bundle and a successful canary within the last N windows, and lost it*.
- **It does not weaken a single existing guard.** The nil-sink-is-a-delivery-failure rule, the
  PROVEN-degrades-to-ERROR rule, the consume-before-launch ordering, the
  synthetic-is-never-proof downgrade, the applied-tuple shape gate, and the register's expiring
  quarantines are all inputs to this wave, not obstacles in it. Every one of them is currently the only
  thing standing between this product and a manufactured green.
- **It does not widen the Codex hook dialect pin.** `0.145`, `0.146`, `0.148` and `0.149.0-alpha.4.1`
  stay unrecognised (`hookdialect.go:163-165`). A loose pin is how this lane went silently dead the
  first time; two vendor artefacts per family is the price and this wave does not discount it.
- **It does not certify macOS, WSL2, cloud sessions, SDK embeddings, or a hostile local
  administrator.** All are outside the strategy's own initial certified boundary (§2.1), and three of
  them have no substrate in this workspace at all.
- **It does not pretend the Windows machine-lane matrix is an engineering task.** It needs Windows VMs
  this workspace does not have, because `%ProgramData%` redirection cannot move the vendor client's
  machine root — it resolves the Windows known folder, so the only measurable machine root is the
  operator's own. Task 11 states the cost and puts it in front of the owner as a decision. Writing a
  task that automates it would be writing a task that cannot be done.
- **It does not attempt a DeVoid-controlled vendor release ring.** npm and the vendor updaters are not
  under our control. The safe subset — pin where the vendor honours a pin, otherwise detect and revoke
  — is what Task 10 and Task 11 implement. Blocking a vendor binary on a customer's machine is an
  availability control we have no right to and would not survive first contact with a developer.
- **It does not close the 6-in-10 hook fail-open from SOT §15.1.** That is the reliability row
  (3.0 -> 9.7), it is a different wave, and its constants (`internal/aihooks/settings.go:112`,
  `internal/airuntime/runner.go:52`) are untouched here. A canary that goes green while a third of real
  invocations are never decided is a *correct* canary reporting on a *different* claim — which is
  precisely why Task 7 splits the claims apart instead of composing one number.
