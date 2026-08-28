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

# Wave 6 - Make the canary able to go green, and stop a new binary inheriting it

**Scorecard rows this moves:** Proof that enforcement happened: 3.5 -> 9.6 (strategy §12)
**Depends on:** Nothing outside this wave for Tasks 1-6 — every one of them wires code that already
exists on `origin/main` on both sides of the wire. Task 7 depends on the wave that lands Workstream
7's Decision/Effect Receipt split (it consumes that vocabulary, it does not define it) **and on W5
Task 8's `internal/aicanary.SideEffectWitness`**, which has no other caller. Tasks 10-12 depend on
Task 5 having produced at least one delivered receipt, and on the wave that lands Workstream 4's WFP
direct-egress denial for the two canary layers this wave deliberately does not build
(§ *What this wave deliberately does NOT do*).
**Phase:** 3 for Tasks 1-9; 4 for Tasks 10-12 (strategy §11).

**Reconciliation status (RECONCILIATION.md, 2026-08-28):** this file carries **no stale facts** in the
40-citation spot check, and its four-seam table and register counts were confirmed exact. Six
reconciliation decisions are applied here:

| Item | Decision | Where it landed |
|---|---|---|
| **C5** | W6 Task 5 owns the canary receipt sink. **W5 Task 7 is deleted.** | Task 5, rewritten to stand alone |
| **C6** | W6 is right that **four** seams are unwired, not one | Tasks 2, 3, 5 sequenced |
| **D2** | W6 Task 7 must consume `aicanary.SideEffectWitness` or W5 Task 8 ships dead | Task 7 |
| **D3** | W6 Task 1 lands **before** W2 Task 5; W2 re-baselines off it | Task 1 landmines |
| **O4** | W6 Task 7's widened `CANARY_PROOF_KINDS` is Backend-deployed-first | Task 7 + wave ordering |
| **§3.16** | W5 Task 4 must ship in the **same release** as W6 Tasks 1-5 | Wave ordering |

Two corrections this pass made to the file's own text, both verified at `origin/main`:

- The Codex reason slug is **`challenge-wrong-bundle`** (`codexmanaged/canary.go:52`), not
  `canary-challenge-wrong-bundle`. Fixed in the seam table and in Task 3's exit.
- The composition root for the four seams is **`bindCanaryChallenges` at
  `ai_integrity_wiring.go:615-632`** (assignments at `:628-631`), reached from
  **`bindIntegrityCanaryLoop` at `:204-217`**, which is the only place the daemon's signed backend
  client is in scope (`s.aiBackendClient()` at `:214`). Earlier text named only the latter.

---

## How an agent executes this wave

You will be handed ONE task from this file and you will not see the rest of it. Everything you need
is inside your task. These five rules apply to every task and are not repeated in each one.

1. **Work in a git worktree under `C:/cwt/`.** One worktree per task, branched from `origin/main`:
   ```bash
   git -C C:/Users/Owner/Documents/Ceragon/Installers fetch origin --quiet
   git -C C:/Users/Owner/Documents/Ceragon/Installers worktree add C:/cwt/w6-tN -b w6/tN-<slug> origin/main
   cd C:/cwt/w6-tN
   ```
   Never edit the shared checkout at `C:/Users/Owner/Documents/Ceragon/Installers` — other sessions
   are using it, and every local checkout in this workspace is 20-1010 commits behind `origin/main`.
2. **NEVER `git stash`, anywhere in this workspace.** `refs/stash` is shared across every worktree of
   a repository. A `pop` in your worktree steals a concurrent session's work. This has cost real work
   twice in one day here. If you need a clean tree, commit to your own branch.
3. **Commit each task's work immediately, not at the end.** A crash and three API outages hit one
   campaign in this workspace and only committed work survived. Commit with **explicit paths** —
   `git add internal/aicanary/exec.go internal/aicanary/exec_iograce_test.go` — and **never
   `git add -A`**, which in this workspace sweeps up other people's uncommitted files and the large
   `.plans/` scratch trees.
4. **A test you cannot make RED has not run.** Every task below carries a DEFEAT TEST: a named
   mutation, a command, and the exact string that must appear. Run it. The five inert-test shapes
   that have shipped GREEN in this repository:
   - the test asserts on a value the production path never produces (a fixture asserting itself);
   - the code under test is never reached — a `nil` seam short-circuits before the assertion;
   - the assertion is on a field the marshaller drops, so any value passes;
   - the test is in a package or file the default lane does not match, so it never runs at all;
   - the failure is swallowed (`_ = err`, `t.Log` instead of `t.Fatal`, a deferred assert after an
     early `return`).
   If your defeat mutation does not produce the exact expected string, the test is one of these five.
   Fix the test before writing the fix.
5. **If a PRECONDITION fails, STOP AND REPORT.** Do not improvise a substitute path, constant, file
   or API. This codebase has a documented history of agents inventing plausible replacements — an
   invented vendor key, an invented config directory, a re-created "equivalent" test — that compiled,
   passed CI, and were wrong in production. A failed precondition means the plan is out of date, and
   that is information the owner needs, not a problem for you to route around.

### The three landmines that apply to more than one task

**M1 — The machine root allowlist. Three endpoints have been bricked by this.**
`cmd/devoid-msi-root-guard/guard_windows.go:624-629` declares the ONLY names permitted at the top of
the machine root:

```go
var boundaryChildNames = []string{
	"bin", "config", "logs", "evidence", "doctor",
	activationStoreDirName,   // "aitrust"
}
```

`inspectRootEntries` adds `credentials.json`, `daemon-token`, `endpoint-identity.json`,
`install-mode` and `proxy-config`, and returns
`fmt.Errorf("machine root contains unknown entry %q", entry.Name())` (`:1086`) for anything else. The
guard runs from the MSI Binary table with `Return="check"`, so that error is **1722 → 1603 → the
entire upgrade rolls back**. It has fired three times: `.staging` (F-MSI-1722), `aitrust` (F13/DF-71),
and `endpoint-identity.json` on 2026-08-20, where a 7.8.42 endpoint that had enrolled the night
before refused 7.8.43.

**It is invisible in CI.** A clean box has never enrolled, so it has none of the entries that trip the
guard; every matrix leg stays green and the failure only appears on the second MSI operation of a
machine that has been used. If a task in this wave writes any new entry at the top of
`config.MachineConfigDir()`, that same commit must add it to `boundaryChildNames`, to
`createBoundaryChildren`, and to `boundaryChildRead`. **No task in this wave needs to** — every path
below resolves under an existing subdirectory — so if you find yourself reaching for
`config.MachineConfigDir()`, stop: the task is wrong.

**M2 — Wire contracts widen Backend-first, and the failure direction is not the usual one.**
The familiar hazard in this codebase is `AgentIngestValidationPipe` **dropping** unknown keys, so an
agent shipped ahead of the Backend loses fields silently — no error, no data, a console that looks
correct. The canary receipt route is the opposite: `RecordCanaryReceiptDto` is **strict**
(`endpoint-control-authority.controller.ts:161-166` — the pipe relaxes `forbidNonWhitelisted` only
for DTO classes marked as agent wire contracts, and this family is not marked), so an agent that
sends one member the DTO does not declare gets a **400**, loudly, and the canary degrades honestly.
That is a reason to be less afraid of this route, **not** a reason to relax the ordering rule. Task 7
widens a shared vocabulary and is Backend-deployed-first without exception.

**M3 — Never add a fail-closed branch on a condition that cannot be proven at runtime.**
A fail-closed branch on an unprovable condition bricked a machine in July 2026 and the operator
uninstalled the agent — a control that is not installed protects nobody. **Nothing in this wave may
make any canary result refuse a runtime launch, refuse a package install, or block a vendor binary.**
Revoking a *claim* is safe: the worst case is a red console. Refusing *capability* is not.
Task 10 states the rule in its own terms and it governs the whole wave: **the certificate removes
claims; it does not remove capability.**

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## What exists today

Verified at `Installers` `origin/main` **5b129523**, `Backend` `origin/main` **0cf9021e** (deployed as
ECS task definition 322), `Frontend` `origin/main` **cac574ae**, on 2026-08-28. Every checkout in this
workspace is far behind its `origin/main`; every line number below was read with
`MSYS_NO_PATHCONV=1 git show origin/main:<path>`, not from the working tree. Re-check with the same
form — and note that on Git Bash here, `git show origin/main:.github/...` is mangled by MSYS path
conversion unless you prefix `MSYS_NO_PATHCONV=1`.

### The canary itself is complete, careful, and fails closed at every gate

Both lanes are written, both are hostile to their own false positives, and neither can manufacture a
green:

- Claude: `Installers/internal/airuntimeintegrity/providers/claude/canary.go:160-293` runs the full
  gate chain (challenge present -> shape/bounds -> signature verified -> endpoint/instance/bundle/
  projection binding -> expiry -> ledger consume BEFORE launch -> host invoke -> classify -> receipt).
  Binding is at `:299-327`, receipt emission at `:332-360`.
- Codex: `Installers/internal/codexmanaged/canary.go:236-398`, same order, with the rejection path
  funnelled through `fail()` at `:261-274` so a refusal is still uploaded as evidence.
- The real host invokers exist and launch the real installed client:
  `Installers/internal/codexmanaged/canary_host.go:132-234` and
  `Installers/internal/airuntimeintegrity/providers/claude/canary_host.go` (`ExecHostInvoker`).
- Both share one bounded launcher, `Installers/internal/aicanary/exec.go:77-138`.
- The redeem half **is** wired: `Installers/internal/daemon/ai_canary_consumption.go`
  (`canaryConsumptionSink`, redeeming through `backend.Client.ConsumeControlArtifact`), driven from
  `Installers/internal/airuntimeintegrity/controller.go:751`.
- A local read surface exists: `GET /v1/ai/canary`, `Installers/internal/daemon/ai_canary_status.go`,
  registered behind `requireDaemonToken` at `Installers/internal/daemon/server.go:594`.

### The server half is built, deployed, and waiting

This is the part that makes this wave a wiring job rather than a build job.

- `POST /api/v1/ai/policy-delivery/canary-receipt` —
  `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:758-779`; base path
  `@Controller('api/v1/ai/policy-delivery')` at `:268`; `@HttpCode(HttpStatus.OK)` at `:760`.
- Its wire DTO `RecordCanaryReceiptDto` — same file, `:172-230`. **Fourteen members**, five optional:
  `challengeId, runtimeInstanceId, nonceHash, proofKind, outcome, appliedBundleRevision,
  appliedBundleDigest, appliedProjectionHash, runtimeVersion?, executionHost?, observedAt,
  proofExpiresAt?, reasonSlug?, receiptHash?`. There is **no `endpointId`** — the endpoint comes only
  from the verified request signature (`:168-170`).
- Server-side binding re-check and first-write-wins semantics — `recordCanaryReceipt` at
  `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:543` onward,
  `assertReceiptAnswersChallenge` called at `:593` (defined `:695`).
- Storage — `Backend/src/migrations/1790200000000-AddCanaryReceiptProof.ts`, six additive nullable
  columns plus CHECKs including `ck_eca_proof_expiry_is_proven_only` (only a PROVEN row may carry an
  expiry) and `ck_eca_proof_observation_pairing`.
- A fleet read surface already exists: `@Get('canary-rollup')` at controller `:329`.

The controller's own docblock at `:152-171` says the DTO "mirrors, member-for-member, the single
canonical shape the agent's receipt sink marshals BOTH provider receipt structs into." **That sink
does not exist.** The contract was written from the server side, ahead of the agent.

### The two provider receipt structs are NOT the same shape, and only one matches the DTO

This is the single most important fact for Task 5 and it is not in any source of truth. Read both:

| | Members | Matches the DTO? |
|---|---|---|
| `codexmanaged.CanaryReceipt` (`canary.go:151-166`) | the same 14, same JSON names, same `omitempty` set | **Yes, exactly.** Pass-through. |
| `claudeprovider.Receipt` (`providers/claude/canary.go:131-145`) | 13 — carries **`format`** and **`correlationId`**, which the DTO does not declare; **lacks** `executionHost`, `proofExpiresAt`, `receiptHash` | **No.** Marshalling it as-is is a **400**. |

Two consequences an isolated agent will otherwise discover in production:

1. The sink must **translate** the Claude receipt to the DTO key set (drop `format` and
   `correlationId`), not marshal the provider struct.
2. The Claude lane emits **no expiry**. The migration says so in place
   (`1790200000000-AddCanaryReceiptProof.ts:50-54`): "A PROVEN row is permitted to have a NULL
   expiry: one of the two agent lanes emits no expiry member at all … every server-side freshness
   read requires `proof_expires_at > now()`, so an unbounded proof reads as not-proven." That lane is
   Claude. **A Claude PROVEN receipt recorded today can never read as a live proof.** Task 5 handles
   this explicitly; do not discover it at the exit gate.

### FOUR seams are unwired in production, not one

The Source of Truth §15.2 names the receipt sink. It is real, and it is not the first thing that
fails. Verified by reading `Installers/internal/daemon/ai_integrity_wiring.go` — the one file that
builds the two providers — end to end:

| Seam | Assigned in production? | Where the canary dies |
|---|---|---|
| `Challenges` / `Verifier` / `Resolver` | **Yes** — `bindCanaryChallenges`, `ai_integrity_wiring.go:628-630` | — |
| `Host` / `InstanceHost` | **Yes** — `bindCanaryHostsLocked`, `ai_integrity_wiring.go:689-710` | — |
| `Applied.BundleRevision` / `BundleDigest` / `ProjectionHash` | **No.** `:631` assigns `Applied.EndpointID` and nothing else | Codex: `challenge-wrong-bundle` |
| `Ledger` | **No.** No assignment anywhere outside tests | Claude: `canary-ledger-unavailable`; Codex: same |
| `Receipts` | **No.** `git grep -n "Receipts:" origin/main -- '*.go'` returns exactly four hits, all `_test.go` | PROVEN demoted to ERROR |

Concretely:

1. **The applied binding is empty.** Codex compares it unconditionally at
   `Installers/internal/codexmanaged/canary.go:301-307`. A valid challenge payload is *required* to
   carry a canonical uint64 revision, a `sha256:`-prefixed digest and a bare sha256 projection hash —
   `Installers/internal/endpointcontrolauth/artifacts.go:247-254` — so it can never equal `""`. Every
   Codex canary therefore fails `CanarySlugWrongBundle` (`= "challenge-wrong-bundle"`, `canary.go:52`)
   **before the ledger is even consulted**. Claude's equivalents at
   `providers/claude/canary.go:311-319` are `!= ""`-gated, so Claude skips them and dies one gate
   later instead.
   The Backend already knows this and says so in place —
   `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts:530-536`: *"A receipt
   carrying empty applied bundle fields is refused by the shared shape gate. That is the current
   production state of the agent (its local applied binding is never populated)."*
2. **The ledgers are unwired.** Claude refuses at `providers/claude/canary.go:205-209`; Codex at
   `codexmanaged/canary.go:317-319`. Both are `CanaryError`, both fire before the host launches.
   Both implementations exist and are fully tested but have zero production callers:
   `Installers/internal/airuntimeintegrity/providers/claude/ledger.go:71` (`NewFileLedger`) and
   `Installers/internal/codexmanaged/canary_ledger.go:73` (`OpenChallengeLedger`) with its path
   helper at `:77-83` (`LedgerPathFor`), `LedgerFileName = "codex-canary-ledger.json"` at `:53`,
   `MaxLedgerEntries = 512` at `:50`.
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

### Where durable canary state may and may not live

`s.secPaths` is **per-identity** — `security.DefaultPaths()` resolves `os.UserHomeDir()/.devoid`
(`internal/security/paths.go:27-46`) — and the daemon runs as SYSTEM on a machine install. The
codebase records the consequence in place at `internal/daemon/ai_policy_activate.go:82-87`: latching
durable state there "wrote it somewhere no administrator's `devoid upgrade` would ever look (RA-8a
defect D2)", which is why the activation store resolves through `aikeystore.OpenStore()` instead.

For this wave that means:

- **Use `integrityStateDir(s.secPaths)`** (`ai_integrity_subsystem.go:416-421` →
  `filepath.Join(paths.ConfigDir, "integrity")`) for canary replay state. The integrity store already
  lives there, the ledger has the same lifetime and the same trust, and it creates **no new entry at
  the top of anything**.
- **Never `config.MachineConfigDir()`** (`internal/core/config/config.go:549-560`). That returns the
  machine root itself — the directory holding `credentials.json`, `daemon-token` and
  `endpoint-identity.json`. See **M1**.

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

`Installers/internal/liveproof/register.json`: `schemaVersion: 1`, top-level key `proofs`, **8
entries, 3 observed, 5 quarantined**, every quarantine carrying `reviewBy: 2026-11-05`. Observed:
`pretooluse-deny-stops-side-effect`, `signed-bundle-activates-and-digest-reaches-backend`,
`codex-hook-fires-and-client-honours-deny`. Quarantined: `hook-lane-prompt-block`,
`anthropic-transport-decision`, `config-change-checkpoint`, `machine-secret-denies-local-users`,
`evidence-event-traced-end-to-end`. **There is no canary row at all** — the mechanism this wave is
about is not one of the eight controls the register tracks. Nothing outside `internal/liveproof`
imports the package; the register is a test and nothing else.

The parallel Codex ledger `Installers/internal/codexmanaged/testdata/liveproof/ledger.json` reads
`status: UNFIRED`, 2 `requiredBuilds` (`0.134.0` and `0.146.0-alpha.3.1`) × 2 lanes (machine, user) =
four required pairs, with **2 observations, both on the `user` lane**, plus 9 `partialObservations`
the gate deliberately does not read.

### What already exists toward a certification factory

More than the strategy assumes. Do not build a second one.

- **A build register with binary digests and captured payload bytes:**
  `Installers/internal/airuntime/adapters/codex/testdata/shook/corpus/builds/manifest.json` — four
  builds (`0.144.0-alpha.4`, `0.130.0-alpha.5`, `0.134.0`, `0.146.0-alpha.9.2`), each with
  `binary.sha256`, `binary.selfReportedVersion`, `binary.path`, platform, capture date, and a closed
  two-member evidence class (`live-capture` / `binary-schema`) with no `pending` member. Its own test
  fails a build whose required artifacts are missing. The four recorded `binary.path` values span
  **two distinct install locations** — the npm global vendor path
  (`…\npm\node_modules\@openai\codex\…` for `0.134.0`) and the OpenAI-managed
  `…\AppData\Local\OpenAI\Codex\bin\<hash>\codex.exe` (for `0.144.0-alpha.4` and
  `0.146.0-alpha.9.2`). A version string is not a location and not an identity.
- **A digest-scoped dialect pin:** `Installers/internal/codexmanaged/hookdialect.go:99-166`. Two
  confirmed families (`0.144.`, `0.147.`), each added on two vendor artefacts;
  `knownHookTrustDialects` at `:166`. Everything else — including the `0.149.0-alpha.4.1` the Codex
  desktop app runs — answers *no* (`:163-165`).
- **A CI job that installs a pinned vendor client and drives it:**
  `Installers/.github/workflows/pr-checks.yml:382-486`, job `codex-vendor-lane`. It pins
  `@openai/codex@0.134.0` (`:431`), runs `TestLiveCanary_RequiredBuildIsActuallyPresent` (`:443`,
  which FAILS rather than skips when the runner claims a build) and `TestLiveVendorLane_RealCodexHost`
  (`:477`), and uploads evidence (`:483`). It is **mirrored locally in Docker** — `ci/gates.json`,
  `repos.Installers.mirrored` contains `pr-checks:codex-vendor-lane`, so it runs for free via
  `node ci/lib/run.mjs Installers`.
- **Automatic proof invalidation on a binary change:**
  `Installers/internal/codexmanaged/adapter_report.go:146-159` (`VersionChurned`) and `:176-191`
  (`EnforcementState`) — a proof taken against one client version is VOID when a different version is
  observed now, returning the instance to `ABOVE_FLOOR_CANARY_PENDING`. This is the strategy's "green
  status that survives a runtime binary update" avoid-item, already solved on the Codex lane.

### What is genuinely absent

- Any production assignment of `Receipts`, `Ledger`, or the applied-bundle tuple (above).
- A receipt-upload client method. `Installers/internal/core/backend/ai_canary_challenge.go` has
  `RequestCanaryChallenge` (`:105`) and `ConsumeControlArtifact` (`:187`) over one shared signed POST
  helper `postSignedControlAuthority` (`:228-268`). There is no third method.
- A **multi-layer** canary. There is exactly one drivable proof kind on each lane —
  `DrivableCanaryProofKind = "DENY_PROMPT_FIXED_PROBE"` (`codexmanaged/canary_host.go:255`, and the
  Claude equivalent) — while `endpointcontrolauth.CanaryProofKinds` (`artifacts.go:72-76`) already
  declares three (`DENY_PROMPT_FIXED_PROBE`, `DENY_TOOL_FIXED_PROBE`, `DENY_ESCALATION_FIXED_PROBE`)
  and `RunDenyProbe` returns `Synthetic` for every kind but the first (`canary_host.go:138-140`).
  Managed-source, provider-route, direct-egress, gateway-deny, evidence and recovery canaries do not
  exist.
- A **posture state machine** that revokes only the claims that failed. There are three states, on
  the Codex lane only: `ABOVE_FLOOR_CANARY_PENDING`, `ENFORCEMENT_PROVEN`, `ENFORCEMENT_GAP`
  (`Installers/internal/codexmanaged/machine_projection.go:57-72`). Claude has no equivalent.
- Any surface that reads real canary evidence into the operator-facing verdict.
  `Installers/cmd/devoid/ai_codex_machine.go:492` calls `EnforcementState()` on the **zero value**
  (`codexmanaged.EffectiveLoadEvidence{}.EnforcementState()`), so it can never print PROVEN or GAP;
  its own comment at `:421-438` says so and says the fix is a caller change. On the server,
  `Backend/src/ai-governance/services/runtime-adapter-render.util.ts:313-317` still declares
  `NO_QUALIFYING_ENFORCEMENT_PROOF` with `blockedOn: 'EndpointControlAuthorityService.consume'` and
  `SERVER_ENFORCEMENT_PROOF_SOURCES = ['server-recorded-block']` at `:329` — stale now that
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
- `Installers/internal/aicanary/launch_windows.go` (`pipeDrainGrace` at `:53-56` — the de-elevated
  path's mirror of the same value, used at `:118`; both must move together or the two launch paths
  disagree)
- `Installers/internal/codexmanaged/canary_host.go` (`RunDenyProbe` process spec at `:191-209`)
- `Installers/internal/airuntimeintegrity/providers/claude/canary_host.go` (its `aicanary.ProcessSpec`
  at `:160-169`)
- New: `Installers/internal/aicanary/exec_iograce_test.go`

**PRECONDITIONS** — run all four; any mismatch means STOP AND REPORT.

```bash
cd C:/cwt/w6-t1
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The hard-coded grace is still there, on the line this task edits.
MSYS_NO_PATHCONV=1 git show origin/main:internal/aicanary/exec.go | sed -n '125p'
#    expect exactly:  	cmd.WaitDelay = 5 * time.Second

# 2. The de-elevated mirror is still there.
MSYS_NO_PATHCONV=1 git show origin/main:internal/aicanary/launch_windows.go | sed -n '56p'
#    expect exactly:  const pipeDrainGrace = 5 * time.Second

# 3. ProcessSpec does NOT already carry an IOGrace field.
MSYS_NO_PATHCONV=1 git show origin/main:internal/aicanary/exec.go | grep -c "IOGrace"
#    expect: 0

# 4. The package builds and its tests pass before you touch it (this is your baseline).
go test ./internal/aicanary -count=1
#    expect: ok  	github.com/codefense/cli-wrapper/internal/aicanary
```

**LANDMINES**
- `aicanary.Run` is the launcher for **both** canary lanes and nothing else (file header,
  `exec.go:13-18`). There is no third caller to check, and no caller outside the canary.
- **Land this before W2 Task 5.** W2 Task 5 extracts this launch path into `internal/winsession` and
  its exit criterion is "0 tests changed status" measured against a baseline this task moves. Doing
  them in the other order makes W2's gate meaningless (RECONCILIATION D3).
- 90 s is the number **re-measured** in SOT §15.2 (11.3 s wall clock, exit 0, full transcript, on
  identical arguments). Do not pick a different number without a new measurement; a shorter one
  reproduces the defect and a longer one holds a daemon goroutine.
- An I/O grace that outlives the kill deadline turns `Timeout` into a suggestion. The bound
  `IOGrace < Timeout` is the whole safety property of this change.
- This task writes no file and creates no directory. **M1 does not apply** — and must not be made to
  apply by "helpfully" adding a debug artifact anywhere under the machine root.

**DO NOT**
- Do not remove or default `Timeout`. `spec.Timeout <= 0` returning `ErrNoTimeout` (`exec.go:78-80`)
  is the one value a canary launcher must never quietly accept; it is a guard, not an obstacle.
- Do not silently clamp an out-of-range `IOGrace`. Reject it with a named error — a clamp hides a
  caller's mistake and this launcher is exactly where a hidden mistake becomes a false enforcement
  gap.
- Do not "fix" the false `canary-host-error` by making `finish()` treat `exec.ErrWaitDelay` as
  success. That would also swallow a genuinely hung grandchild. The fix is the bound, not the
  classifier.
- Do not touch `internal/airuntime/runner.go:52` (`HookDecisionBudget = 4 * time.Second`) or the 60 s
  hook timeout. They are a different wave's constants and are named here only so you leave them alone.

**Steps**
- [ ] Write `TestRun_IOGraceDefaultsToFiveSecondsWhenUnset` against a `ProcessSpec` with `IOGrace`
      unset; assert the constructed `cmd.WaitDelay` is `5 * time.Second`. RED (no field yet).
- [ ] Write `TestRun_IOGraceIsBoundedBelowTheTimeout`: a spec with `IOGrace >= Timeout` is rejected
      with a named error, not clamped silently.
- [ ] Write `TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure`: a fake child that exits 0 and
      leaves a grandchild holding the pipe for 8 s, with `IOGrace: 30s`, returns `err == nil` and the
      captured stdout. With `IOGrace` unset it returns an error. This is the defect in one test.
- [ ] Add `IOGrace time.Duration` to `ProcessSpec` with the documented default and the `< Timeout`
      bound; apply it at `exec.go:125` and to `pipeDrainGrace` on the de-elevated Windows path.
- [ ] Set `IOGrace: 90 * time.Second` at both canary host call sites, with `Timeout` raised to at
      least `IOGrace + 30s` where it is currently lower (`DefaultCanaryProbeTimeout` is 60 s at
      `providers/claude/canary_host.go:98`; `CanaryConfig.probeTimeout()` defaults to 60 s at
      `codexmanaged/canary.go:219-224`).

**DEFEAT TEST**
- Mutation: in `internal/aicanary/exec.go`, revert line 125 to `cmd.WaitDelay = 5 * time.Second`,
  ignoring `spec.IOGrace`.
- Command:
  `cd C:/cwt/w6-t1 && go test ./internal/aicanary -run TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure -count=1`
- Must appear in the output:
  `expected a clean observation, got error: exec: WaitDelay expired before I/O complete`

**BLAST RADIUS:** Both canary lanes, nothing else. Too permissive: a child that leaked a grandchild
holds the daemon's canary goroutine for the whole grace window. Too restrictive: today's false
`canary-host-error`. Who notices: nobody in the field today (no canary reaches launch), and the
operator running `TestLiveCanary_*` immediately.

**ROLLBACK:** Single-field revert. The field defaults to the current 5 s when unset, so reverting the
two call sites alone restores today's behaviour exactly. `git revert <sha>` is safe; no state, no
schema, no server.

**EXIT** (both verifiable by command)
1. `go test ./internal/aicanary -count=1` exits 0 **and** `go test ./internal/codexmanaged
   ./internal/airuntimeintegrity/... -count=1` exits 0.
2. Live: with `DEVOID_CANARY_LIVE=1`, `DEVOID_CANARY_CODEX_EXE=<abs path>`,
   `DEVOID_CANARY_CODEX_HOME=<home>`, run
   `go test ./internal/codexmanaged -run TestLiveCanary_RealCodexHost -count=6 -v 2>&1 | tee /tmp/w6t1-live.txt`
   then `grep -c "canary-host-launch-failed" /tmp/w6t1-live.txt` → **0**, on runs where
   `grep -c "Blocked" /tmp/w6t1-live.txt` is >= 1. Baseline for comparison: 2 of 6.
   `/tmp/w6t1-live.txt` is the named artifact; attach it.

---

## Task 2: Wire the single-use challenge ledgers on both lanes

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` — construct in `bindIntegrityCanaryLoop`
  (`:204-217`), assign inside `bindCanaryChallenges` (`:615-632`, under `w.mu`, beside the four
  assignments already at `:628-631`)
- `Installers/internal/airuntimeintegrity/providers/claude/ledger.go` (`NewFileLedger` at `:71` — read
  only; do not modify)
- `Installers/internal/codexmanaged/canary_ledger.go` (`OpenChallengeLedger` at `:73`, `LedgerPathFor`
  at `:77-83`, `LedgerFileName` at `:53` — read only)
- New: `Installers/internal/daemon/ai_canary_ledger_wiring_test.go`

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t2
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. Neither ledger seam is assigned in production today.
MSYS_NO_PATHCONV=1 git grep -n "Canaries.Ledger\|claude.Ledger" origin/main -- 'internal/daemon/*.go'
#    expect: no output at all

# 2. The Codex path helper and filename are unchanged.
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary_ledger.go | sed -n '53p;78p'
#    expect: const LedgerFileName = "codex-canary-ledger.json"
#            func LedgerPathFor(devoidConfigDir string) string {

# 3. The config-root resolution this task reuses still resolves to a SUBdirectory.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_subsystem.go | sed -n '416,421p'
#    expect the body to end with:  return filepath.Join(paths.ConfigDir, "integrity")

# 4. The composition root still has the shape this task edits.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_wiring.go | sed -n '628,631p'
#    expect the four existing seam assignments (claude.Challenges, claude.Verifier,
#    codex.Canaries.Resolver, codex.Canaries.Applied.EndpointID)
```

**LANDMINES**
- **M1 applies by proximity.** `codexmanaged.LedgerPathFor(dir)` joins its filename into *whatever
  directory you hand it*. Hand it `config.MachineConfigDir()` and you have written
  `codex-canary-ledger.json` at the top of the machine root — an unknown entry, 1722 → 1603, and the
  next upgrade rolls back on every **enrolled** endpoint while every clean-box test stays green.
  Hand it `integrityStateDir(s.secPaths)` and you have written inside a directory that already
  exists. There is no third option in this task.
- `s.secPaths` is per-identity (`os.UserHomeDir()`), so on a machine install this is the SYSTEM
  account's profile — documented as a defect class at `internal/daemon/ai_policy_activate.go:82-87`
  for state an **administrator** must find. It is the right home for this ledger (the integrity store
  is already there, same lifetime, same trust) and the wrong home for anything an operator must
  inspect. Do not generalise this choice to other state.
- The Claude lane has **no** exported ledger filename — only `NewFileLedger(path)` and
  `LedgerFormat = "devoid.claude-canary-ledger/v1"` (`ledger.go:68`). **The plan decides the name so
  you do not invent one:** add `LedgerFileName = "claude-canary-ledger.json"` to the claude provider
  package, mirroring `codexmanaged.LedgerFileName`, and pin it in a test.
- A ledger a standard user can delete is a replay fast-path removed. That is survivable — the Backend
  row is authoritative (`internal/core/backend/ai_canary_challenge.go:178-186`) — but it must be a
  deliberate choice, not an accident of path construction. Assert the resolved path in a test.

**DO NOT**
- Do not modify `ledger.go` or `canary_ledger.go`. They are complete, tested, and have zero
  production callers; the defect is the missing assignment, not the implementation.
- Do not move the consume-before-launch ordering. It is enforced inside the providers
  (`providers/claude/canary.go:204-219`, `codexmanaged/canary.go:316-322`) and this task does not
  touch it.
- Do not make a nil ledger permissive. `canary-ledger-unavailable` is the correct outcome when the
  ledger is missing, and it is today's outcome — the failure mode of this task is *no change*.

**Steps**
- [ ] `TestBindIntegrityCanaryLoop_AssignsBothLedgers`: build the wiring through `newIntegrityWiring`
      + `bindIntegrityCanaryLoop` with a temp config root; assert `w.claude.Ledger != nil` and
      `w.codex.Canaries.Ledger != nil`. RED today.
- [ ] `TestCanaryLedgerPathIsUnderTheIntegrityStateDir`: assert both resolved paths equal
      `filepath.Join(integrityStateDir(paths), <lane filename>)`, and assert explicitly that neither
      path has `config.MachineConfigDir()` as its immediate parent and neither is under a Codex or
      Claude config root.
- [ ] `TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun`: drive the provider twice with the
      same challenge id against a recording host invoker; assert the host is invoked **once** and the
      second result is `canary-challenge-duplicate` / `CanarySlugChallengeReplayed`.
- [ ] Assign both ledgers inside `bindCanaryChallenges`, constructing them in
      `bindIntegrityCanaryLoop` from `integrityStateDir(s.secPaths)`.

**DEFEAT TEST**
- Mutation: delete the two ledger assignments in `bindCanaryChallenges`.
- Command:
  `cd C:/cwt/w6-t2 && go test ./internal/daemon -run TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun -count=1`
- Must appear in the output: `host invoker was called 0 times, want 1`
  (the nil ledger short-circuits *before* launch, so the count goes to **zero**, not two — assert the
  exact number, because a test that accepts "not 2" passes on the broken build).

**BLAST RADIUS:** Both ledgers write a bounded (512-entry) JSON file under
`<secPaths.ConfigDir>/integrity` and harden it with the machine ACL. A wrong path writes a small file
somewhere unexpected; an unwritable path returns `canary-ledger-unavailable`, which is exactly today's
outcome. Nobody in the field notices either way until Task 5 lands.

**ROLLBACK:** Delete the two assignment lines. The nil-ledger refusal path is untouched and still
correct. No file left behind matters: a stale `*-canary-ledger.json` inside `integrity/` is inert and
is not enumerated by the MSI guard.

**EXIT**
1. `go test ./internal/daemon -run Canary -count=1` exits 0.
2. After two runs of the same challenge id against a stubbed host,
   `python -c "import json,sys;print(len(json.load(open(p))['entries']))" <integrityStateDir>/codex-canary-ledger.json`
   prints **1**.

---

## Task 3: Populate the applied-bundle binding every sweep

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` (`bindCanaryHostsLocked` at `:651-711`, called
  from `:376` inside `BoundInstances`; add a sibling `bindAppliedTupleLocked` invoked from the same
  place)
- `Installers/internal/daemon/ai_integrity_subsystem.go` (`integrityAuthorityPosture` at `:340-414` —
  the existing producer of `AppliedRevision` / `AppliedDigest`, including the durable-floor fallback at
  `:395-412`)
- `Installers/internal/daemon/ai_integrity_observed_projection.go` (the per-instance observed
  projection hash)
- New: `Installers/internal/daemon/ai_canary_applied_binding_test.go`

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t3
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. Only EndpointID is assigned on the applied tuple today.
MSYS_NO_PATHCONV=1 git grep -n "Applied\." origin/main -- 'internal/daemon/ai_integrity_wiring.go'
#    expect exactly one hit: :631  w.codex.Canaries.Applied.EndpointID = endpointID

# 2. The Codex comparison is still unconditional (this is why the tuple cannot be left empty).
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary.go | sed -n '301,307p'
#    expect the three-field compare returning CanarySlugWrongBundle / CanarySlugWrongProjection

# 3. The posture producer still applies the all-or-none rule you are mirroring.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_subsystem.go | sed -n '383,393p'
#    expect the paired assignment of posture.AppliedRevision and posture.AppliedDigest

# 4. The sweep entry point is unchanged.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_wiring.go | sed -n '376p'
#    expect exactly:  	w.bindCanaryHostsLocked(rows)
```

**LANDMINES**
- The applied tuple is the field the **Backend re-checks server-side** before recording a receipt
  (`endpoint-control-authority.service.ts:593`). There is no shape of this task that produces a false
  green: the server holds the authoritative copy and compares. That asymmetry is why this task is
  safe to do before Task 5.
- A **half-populated** tuple is worse than an empty one. Claude's guards are `!= ""`-gated
  (`providers/claude/canary.go:311-319`), so a revision-without-digest makes Claude check one member
  and skip the other — a partial binding nobody wrote a rule for. Mirror the all-or-none rule
  `integrityAuthorityPosture` already applies at `:383-393`.
- The Claude provider carries a **single** `AppliedProjectionHash` field
  (`providers/claude/provider.go:148`), not a per-instance map. If two instances report different
  observed projection hashes, leave it empty rather than picking one — this is the same per-instance
  defect already fixed for `claudeHosts` and documented in place at `ai_integrity_wiring.go:683-693`.
- `bindCanaryHostsLocked` is called **every sweep** (60 s ± jitter) precisely so a runtime installed,
  upgraded or removed between sweeps is re-addressed. Your sibling must have the same property or a
  canary will be bound to a bundle generation the endpoint no longer runs.
- This task writes no file. **M1 does not apply.**

**DO NOT**
- Do not relax the Codex comparison at `codexmanaged/canary.go:301-307` to tolerate an empty tuple.
  That is the guard; the empty tuple is the defect.
- Do not source the tuple from anything but `integrityAuthorityPosture`. A second producer is a second
  truth, and the durable-floor fallback at `:395-412` exists because the first one was not enough.
- Do not populate the tuple from a challenge payload. The endpoint must compare what it *applied*
  against what the server *signed*; taking both sides from the same place removes the comparison.

**Steps**
- [ ] `TestAppliedBindingMirrorsTheReportedPolicyIntegrityTuple`: with a posture carrying revision
      `"8"` and digest `"sha256:5209…"`, assert `w.codex.Canaries.Applied.BundleRevision == "8"`,
      `.BundleDigest == "sha256:5209…"`, and the Claude provider's `AppliedBundleRevision` /
      `AppliedBundleDigest` match. RED today (both empty).
- [ ] `TestAppliedBindingIsAllOrNothing`: a posture with a revision but no digest leaves **all three**
      fields empty.
- [ ] `TestAppliedBindingTracksAnActivationWithinOneSweep`: change the posture between two
      `BoundInstances` calls; assert the second sweep carries the new tuple.
- [ ] `TestClaudeProjectionHashIsPerInstance`: two instances with different observed projection hashes
      do not share one value — the binding leaves `AppliedProjectionHash` empty rather than picking
      one.
- [ ] Implement `bindAppliedTupleLocked(posture, rows)` and call it from the same place as
      `bindCanaryHostsLocked` (`:376`).

**DEFEAT TEST**
- Mutation: in `bindAppliedTupleLocked`, assign `BundleRevision` before checking that the digest is
  present.
- Command:
  `cd C:/cwt/w6-t3 && go test ./internal/daemon -run TestAppliedBindingIsAllOrNothing -count=1`
- Must appear in the output:
  `partial applied binding: revision="8" digest="" — want all three empty`

**BLAST RADIUS:** If the tuple is populated with the **wrong** values, every receipt is refused 409 and
the canary degrades to `canary-receipt-upload-failed` — today's state, loudly. If it is **stale** after
a bundle activation, the canary refuses itself with `challenge-wrong-bundle` — also today's state.
Neither direction can fabricate a proof.

**ROLLBACK:** Remove the sibling call at `:376`. The unbound fields return to `""` and every gate
returns to refusing, exactly as now.

**EXIT**
1. `go test ./internal/daemon -run AppliedBinding -count=1` exits 0.
2. On a rig with an activated signed bundle:
   `curl -s -H "Authorization: Bearer $(cat <daemon-token path>)" http://127.0.0.1:<port>/v1/ai/canary | python -c "import json,sys;print([r['reasonSlug'] for r in json.load(sys.stdin)['instances']])"`
   contains **no** `challenge-wrong-bundle`, and at least one instance reports a slug strictly later
   in the gate chain (`canary-ledger-unavailable` or later). Save that JSON as the named artifact.

---

## Task 4: Add the receipt-upload client method

**Files:**
- `Installers/internal/core/backend/ai_canary_challenge.go` (add `RecordCanaryReceipt` alongside
  `RequestCanaryChallenge` at `:105` and `ConsumeControlArtifact` at `:187`, reusing
  `postSignedControlAuthority` at `:228-268` and `decodeStrictControlAuthorityJSON` at `:273`)
- New: `Installers/internal/core/backend/ai_canary_receipt_test.go`
- Read-only reference: `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:172-230`

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t4
# 1. There really is no third method today.
MSYS_NO_PATHCONV=1 git show origin/main:internal/core/backend/ai_canary_challenge.go | grep -n "^func (c \*Client)"
#    expect exactly two: RequestCanaryChallenge (:105) and ConsumeControlArtifact (:187)

# 2. The server route and its status code are what this method targets.
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin --quiet
MSYS_NO_PATHCONV=1 git show origin/main:src/ai-policy-delivery/endpoint-control-authority.controller.ts | sed -n '758,760p'
#    expect:  @Post('canary-receipt') / @AuthApiMember() / @HttpCode(HttpStatus.OK)

# 3. The DTO member set has not moved. This is the literal you will pin in the test.
MSYS_NO_PATHCONV=1 git show origin/main:src/ai-policy-delivery/endpoint-control-authority.controller.ts | sed -n '172,230p' | grep -E "^  [a-zA-Z]+\??:"
#    expect these 14, in this order:
#      challengeId runtimeInstanceId nonceHash proofKind outcome appliedBundleRevision
#      appliedBundleDigest appliedProjectionHash runtimeVersion? executionHost? observedAt
#      proofExpiresAt? reasonSlug? receiptHash?
#    if the set differs, STOP: the wire contract moved and the ordering rule in LANDMINES applies.
```

**LANDMINES**
- **M2, inverted — know which one you are standing on.** `RecordCanaryReceiptDto` is **strict**
  (controller `:161-166`). One extra member is a **400**, not a silent drop. Because the route already
  exists in the deployed Backend (td 322), **the agent may ship second for this task and no ordering
  violation is possible.** It becomes possible the moment anyone adds a member: the Backend DTO
  changes first, deploys first, then the agent.
- **There is no `endpointId` member and adding one is a security defect,** not a convenience. The
  controller says why at `:168-170`: the endpoint comes only from the verified request signature, and
  a body-supplied id is a way to write a proof onto someone else's row.
- The Claude provider's receipt struct carries **`format`** and **`correlationId`**, which the DTO does
  **not** declare. Marshalling a `claudeprovider.Receipt` straight onto the wire is a 400. That
  translation belongs to Task 5's adapter; this method takes the DTO shape, not a provider struct.
- `@IsOptional()` + `@IsString()` means **absent** and **`""`** are different values. Emit `omitempty`
  for the five optional members.
- A receipt posted over an unsigned channel is a proof written onto whichever endpoint the server
  infers. The v2-request-signing precondition `RequestCanaryChallenge` enforces at `:118-124` applies
  identically here.

**DO NOT**
- Do not add a retry loop. The receipt is single-shot per attempt; the sweep re-attempts. A retry
  turns one canary into N rows and the server's first-write-wins semantics into a race.
- Do not swallow a non-2xx. A 409 is an **authoritative refusal**, not a transport failure; surface it
  as `*APIError` the way `ConsumeControlArtifact` documents at `:180-186`.
- Do not widen `postSignedControlAuthority` or `decodeStrictControlAuthorityJSON`. Reuse them.
- Do not add a member to the Go struct "for future use". The DTO is strict; an unused member is a
  fleet-wide 400 the day someone populates it.

**Steps**
- [ ] `TestRecordCanaryReceipt_RefusesWithoutV2EndpointSigning`: with signing absent, the method
      returns an error and **sends nothing**. Assert against a recording transport that zero requests
      were made.
- [ ] `TestRecordCanaryReceipt_MarshalsExactlyTheServerDTOMembers`: marshal a fully-populated receipt
      and assert the JSON object's key set equals exactly the 14-member list above, with `endpointId`
      **absent**. Pin the expected key list as a literal slice in the test so adding a Go field fails
      here rather than at a 400 in the field.
- [ ] `TestRecordCanaryReceipt_OmitsOptionalMembersWhenEmpty`: `runtimeVersion`, `executionHost`,
      `proofExpiresAt`, `reasonSlug` and `receiptHash` are absent (not `""`) when unset.
- [ ] `TestRecordCanaryReceipt_A409IsAnAuthoritativeRefusalNotATransportFailure`.
- [ ] Implement, posting to `/api/v1/ai/policy-delivery/canary-receipt` with `wantStatus`
      `http.StatusOK`, a response bound of 4 KiB, decoded with `decodeStrictControlAuthorityJSON`.

**DEFEAT TEST**
- Mutation: add an `EndpointID string \`json:"endpointId"\`` member to the marshalled struct and
  populate it.
- Command:
  `cd C:/cwt/w6-t4 && go test ./internal/core/backend -run TestRecordCanaryReceipt_MarshalsExactlyTheServerDTOMembers -count=1`
- Must appear in the output:
  `unexpected wire member "endpointId": the server derives the endpoint from the request signature`

**BLAST RADIUS:** One new outbound signed POST. It can only fire for an endpoint that is v2
request-signed with an attested trust anchor and holds a minted challenge. On a fleet where no
endpoint holds a challenge, this method never executes. It has **no caller** until Task 5.

**ROLLBACK:** Additive with no callers. Reverting Task 5 alone disarms it; reverting this method is a
clean `git revert`.

**EXIT**
1. `go test ./internal/core/backend -run RecordCanaryReceipt -count=1` exits 0.
2. Against a local Backend at `origin/main`, one hand-driven call returns 200 and
   `psql -At -c "select proof_outcome is not null and proof_observed_at is not null from endpoint_control_authority where challenge_id='<id>'"`
   prints `t`. Paste that SQL result into the live-proof procedure doc as the named artifact.

---

## Task 5: Wire the sink into both providers, without weakening the demotion

> **This task is the sole owner of the canary receipt sink.** W5 Task 7 proposed the same work against
> `internal/daemon/server.go` and assumed a backend client method that does not exist; the
> reconciliation deleted it (C5/C6) and pointed it here. Everything that task carried is folded in
> below. Do not look for a second half of this work in another wave — there isn't one.

**Files:**
- `Installers/internal/daemon/ai_integrity_wiring.go` — construct the sink in `bindIntegrityCanaryLoop`
  (`:204-217`), which is the **only** place the daemon's signed backend client is in scope
  (`s.aiBackendClient()` at `:214`); assign it inside `bindCanaryChallenges` (`:615-632`) beside the
  four seams already assigned at `:628-631`, under `w.mu`
- New: `Installers/internal/daemon/ai_canary_receipt_sink.go` — one adapter type implementing **both**
  `claudeprovider.ReceiptSink` (`providers/claude/canary.go:150-153`, `Upload(ctx, Receipt) error`)
  and `codexmanaged.ReceiptSink` (`codexmanaged/canary.go:171-173`,
  `UploadCanaryReceipt(ctx, CanaryReceipt) error`), translating both provider receipt structs into
  the one canonical DTO shape and calling `backend.Client.RecordCanaryReceipt` (Task 4)
- New: `Installers/internal/daemon/ai_canary_receipt_sink_test.go`
- **Do not modify:** `providers/claude/canary.go:258-291` (the demotion), `:333-344` (the nil-sink
  refusal), `codexmanaged/canary.go:376-396` (the same two on that lane), or
  `providers/claude/canary_receipt_gate_test.go`. Those are the guard.

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t5
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. Task 4 has landed: the client method exists on your branch's base.
grep -n "func (c \*Client) RecordCanaryReceipt" internal/core/backend/ai_canary_challenge.go
#    expect one hit. If none: STOP — Task 4 is a hard prerequisite, do not write a second client.

# 2. Tasks 2 and 3 have landed: without them nothing ever reaches the sink.
grep -n "Canaries.Ledger\|claude.Ledger" internal/daemon/ai_integrity_wiring.go       # expect >= 2 hits
grep -n "Applied.BundleRevision" internal/daemon/ai_integrity_wiring.go               # expect >= 1 hit
#    If either is empty: STOP. Wiring only the sink changes nothing — the Codex lane still dies at
#    challenge-wrong-bundle and the Claude lane at canary-ledger-unavailable, both BEFORE the sink.

# 3. Receipts is still unassigned in production.
MSYS_NO_PATHCONV=1 git grep -n "Receipts:" origin/main -- '*.go'
#    expect exactly four hits, ALL ending in _test.go:
#      internal/airuntimeintegrity/maintenance_test.go:64
#      internal/codexmanaged/canary_host_test.go:289
#      internal/codexmanaged/canary_live_test.go:74
#      internal/codexmanaged/canary_test.go:111

# 4. The two provider receipt structs are still the shapes this adapter translates.
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary.go | sed -n '151,166p'
#    expect 14 members matching the DTO exactly
MSYS_NO_PATHCONV=1 git show origin/main:internal/airuntimeintegrity/providers/claude/canary.go | sed -n '131,145p'
#    expect 13 members INCLUDING Format and CorrelationID and EXCLUDING ProofExpiresAt
```

**LANDMINES**
- **The two receipts are not the same shape.** `codexmanaged.CanaryReceipt` is the DTO, member for
  member — pass it through. `claudeprovider.Receipt` carries `format` and `correlationId`, which the
  **strict** DTO does not declare: marshalling it as-is is a **400 on every Claude canary**. Translate,
  do not marshal.
- **The Claude lane emits no expiry, and the server treats an unbounded PROVEN row as not-proven.**
  `1790200000000-AddCanaryReceiptProof.ts:50-54` states this deliberately. So a Claude PROVEN receipt
  recorded today is stored truthfully and still reads as *not a live proof*. **Scope this wave's first
  green to the Codex lane** (that is where the live rig and the ledger's required builds are), and
  record the Claude gap as a stated limitation. If you close it, close it the additive way: give
  `claudeprovider.Receipt` a `ProofExpiresAt string \`json:"proofExpiresAt,omitempty"\`` member
  populated in `emitReceipt` from `res.ProofExpiresAt` (which is already in scope there, set at
  `canary.go:255` before the call at `:258`). That needs **no Backend deploy** — the DTO already
  declares the optional member — but it needs the next landmine.
- **Never send an expiry on a non-PROVEN receipt.** The database CHECK
  `ck_eca_proof_expiry_is_proven_only` refuses a non-PROVEN row carrying one. The Codex lane already
  clears it on every refusal path (`canary.go:381`, `:385`, `:390`, `:394`); any Claude equivalent must
  do the same or the refusal receipts start failing to write.
- **The permissive direction is the dangerous one, and the code says so in its own words.** A sink
  that swallows its own errors and returns nil reproduces exactly the manufactured green described at
  `providers/claude/canary.go:259-274`: it would set `Evidence.EnforcementTestedAt`, feed
  `hasEnforcementProof()`, and report `PROVEN_GOVERNED` fleet-wide on no evidence. **The sink returns
  the transport error verbatim.** A 4xx, a 5xx, a timeout and a truncated body are each a delivery
  failure.
- **Outbound volume.** Both lanes call `emitReceipt` on *every* rejection path — binding failures,
  expiry, duplicates, ledger errors (`providers/claude/canary.go:193, 200, 207, 213, 217, 224, 230`).
  With the challenge top-up at 2 minutes (`ai_integrity_subsystem.go:227`) and the sweep at 60 s
  (`controller.go:46`), the ceiling is **one POST per instance per sweep**. State that ceiling in the
  sink's docblock and pin it with a test.
- This task writes no file to disk. **M1 does not apply.**
- **M2:** no wire member is added here, so no Backend deploy is required — the route is live in td 322.
  Confirm the migration `1790200000000-AddCanaryReceiptProof` has actually **run** in the environment
  you test against; the file being on `origin/main` is not the same fact.

**DO NOT**
- Do not soften the demotion. `canary-receipt-undelivered` demoting PROVEN → ERROR is the only thing
  standing between this product and a self-certified green. If it blocks you, the task is wrong.
- Do not make `emitReceipt` tolerate a nil sink. `errNoReceiptSink` is a guard.
- Do not assign a "best effort" sink on an endpoint that cannot sign. An unattributable POST is worse
  than an honest refusal.
- Do not put the sink in `internal/daemon/server.go`. The composition root for these seams is
  `ai_integrity_wiring.go`; a second wiring site is how the four seams got out of step in the first
  place.
- Do not add a local success cache. "The server already has this" is a claim only the server can make.

**Steps**
- [ ] `TestReceiptSinkIsAssignedOnBothProviders` in the daemon package. RED today.
- [ ] `TestSinkTranslatesClaudeReceiptToTheDTOKeySet`: the marshalled body from a
      `claudeprovider.Receipt` has exactly the DTO's 14 keys — `format` and `correlationId` **absent**.
      RED before the mapper exists.
- [ ] `TestSinkPassesTheCodexReceiptThroughUnchanged`: key set and values identical.
- [ ] `TestSinkReturnsTheTransportErrorVerbatim`: a 500, a 4xx, a timeout and a truncated body each
      surface as a non-nil error out of `Upload` / `UploadCanaryReceipt`.
- [ ] `TestSinkDeliversRefusalReceiptsToo`: a duplicate / expired / wrong-instance outcome still
      uploads, matching `emitReceipt`'s contract at `:329-331`.
- [ ] `TestSinkBodyIsContentFree`: fuzz hostile values through both provider structs and assert no
      path, prompt, command line or credential-shaped string can reach the body.
- [ ] `TestProvenStillDegradesWhenTheSinkFails` — re-assert the existing guard through the **new**
      wiring, not just in the provider package: with a failing sink, `Canary` returns
      `Outcome == CanaryError`, `ProofExpiresAt == ""`, `ReasonSlug == canary-receipt-undelivered`.
- [ ] `TestNilSinkStillFailsClosed`: pin the pre-existing behaviour so a future refactor cannot
      reintroduce a silent nil.
- [ ] `TestSinkIsNilWhenTheEndpointCannotSign`: on an endpoint with no v2 request signing the sink is
      **not** assigned.
- [ ] `TestOneUploadPerCanaryAttempt`: drive two attempts on one instance; assert exactly two POSTs.
- [ ] Implement the adapter; construct it in `bindIntegrityCanaryLoop`; assign `w.claude.Receipts` and
      `w.codex.Canaries.Receipts` in `bindCanaryChallenges`.

**DEFEAT TEST**
- Mutation: in `ai_canary_receipt_sink.go`, change the upload path to `return nil` when
  `RecordCanaryReceipt` returns an error.
- Command:
  `cd C:/cwt/w6-t5 && go test ./internal/daemon -run TestProvenStillDegradesWhenTheSinkFails -count=1`
- Must appear in the output:
  `outcome=PROVEN with an undelivered receipt: the endpoint self-certified`

**BLAST RADIUS:** This is the task that makes a green *possible* for the first time. Permissive: a
manufactured `PROVEN_GOVERNED` fleet-wide on no evidence. Restrictive: today's honest
`canary-receipt-undelivered`. Second surface: outbound volume, bounded above at one POST per instance
per sweep.

**ROLLBACK:** Delete the two assignments in `bindCanaryChallenges`. Both lanes return to
`errNoReceiptSink` and to demoting PROVEN to ERROR — the current, honest, shipped behaviour. One line
per lane, no schema, no migration, no server change. Rows already written stay written and remain
truthful.

**EXIT**
1. `go test ./internal/daemon -run "ReceiptSink|Sink" -count=1` exits 0, and
   `git grep -n "Receipts:" -- '*.go' | grep -v _test.go | wc -l` prints **2** (today: 0).
2. On the local-Backend rig, one **Codex-lane** canary run against a real client that prints
   `hook: UserPromptSubmit Blocked` produces `outcome=PROVEN`, a 200 from `/canary-receipt`, and
   `psql -At -c "select count(*) from endpoint_control_authority where proof_outcome='PROVEN' and proof_expires_at > now()"`
   prints **>= 1**. **This is the first green this mechanism has ever produced** and it is the wave's
   headline artifact. Attach the agent log line, the HTTP status, and that SQL output.
3. State in the PR body which lane produced it and that the Claude lane records a NULL expiry today.

---

## Task 6: Make the live Codex canary test able to drive the machine lane

**Files:**
- `Installers/internal/codexmanaged/canary_live_test.go` (`:61`, and the comment at `:54-60` that
  claims it mirrors production; `TestLiveCanary_RealCodexHost` at `:35`,
  `TestLiveCanary_RequiredBuildIsActuallyPresent` at `:133`)
- `Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md` (§3, the machine-lane procedure)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t6
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The zero-value projection is still the thing being fixed.
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary_live_test.go | sed -n '61p'
#    expect: 	host := ExecCanaryHost{Machine: MachineProjection{Layout: DefaultMachineLayout()}}

# 2. The gate that makes it structurally UNSUPPORTED is still there.
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary_host.go | sed -n '429,435p'
#    expect the want-set build from InlineHookSignature() and `if len(want) == 0 { return false }`

# 3. The production construction you must mirror is unchanged.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_wiring.go | sed -n '705,707p'
#    expect: 	w.codex.Canaries.Host = codexmanaged.ExecCanaryHost{ Machine: w.codex.MachineProjectionFor(), }

# 4. The ledger still records 2 observations, both on the user lane.
python -c "import json;d=json.load(open('internal/codexmanaged/testdata/liveproof/ledger.json'));print(d['status'],len(d['requiredBuilds']),len(d['observations']),[o['lane'] for o in d['observations']])"
#    expect: UNFIRED 2 2 ['user', 'user']
```

**LANDMINES**
- **`%ProgramData%` redirection does not move the vendor's machine root.** The Codex binary resolves
  the Windows known folder, so the only machine root that can be exercised is the operator's real
  `C:\ProgramData\OpenAI\Codex`. This is a fact about the vendor, not a defect to fix, and it is why
  the machine lane cannot be containerised. Record it in the runbook in place.
- That directory belongs to **OpenAI**, not to DeVoid. It is not the DeVoid machine root and **M1 does
  not apply to it** — but do not confuse the two, and do not write anything of ours into either.
- The failure mode this task removes is a *fabricated* one: the SOT records that on one box the zero
  value produced `CanaryNotProven` (a fabricated gap) where the production shape produced
  `CanaryUnsupported` (the honest answer). Making the test honest may turn results *worse-looking* and
  that is the correct outcome.
- **A measured FAILURE on the machine lane is a real result.** The SOT already records that lane as
  measured failing (zero hooks fired, deny prompt sent straight to the provider). Record what you
  measure; do not re-run until it is green.

**DO NOT**
- Do not build a second definition of the machine projection. Construct it the way production does,
  through `Provider{...}.MachineProjectionFor()`, or the test drifts from the thing it certifies.
- Do not make `TestLiveCanary_RequiredBuildIsActuallyPresent` skip instead of fail. Its whole value is
  that a claimed-but-absent build is an error.
- Do not delete or weaken `managedOnlySuppressesUserHooks`. When it reports suppression, that is the
  machine baseline working.
- Do not modify any shipped (non-test, non-doc) file in this task.

**Steps**
- [ ] `TestLiveCanaryTestUsesTheProductionProjectionShape`: a **unit** test (not the skipped live one)
      asserting the projection the live test constructs has a non-empty `InlineHookSignature()`. RED
      today.
- [ ] `TestMachineLanePreconditionIsAssertedNotAssumed`: when `DEVOID_CANARY_LANE=machine` is set, a
      run whose `machinePromptGateInstalled()` is false **fails** with a named reason instead of
      logging `UNSUPPORTED` and passing — the same conversion of an absence into a failure that
      `TestLiveCanary_RequiredBuildIsActuallyPresent` (`:133-140`) already performs for a missing
      build.
- [ ] Replace `:61` with a projection built the way production builds it —
      `Provider{Layout, HookCommand, HookCommandDigest, RuntimeVersion, EndpointScope}.MachineProjectionFor()`
      — taking the launcher path and observed version from new `DEVOID_CANARY_*` environment inputs,
      alongside the existing `DEVOID_CANARY_LIVE`, `DEVOID_CANARY_CODEX_EXE`,
      `DEVOID_CANARY_CODEX_HOME` and `DEVOID_CANARY_REQUIRED_BUILD` (`canary_live_test.go:25-27`,
      `:113`).
- [ ] Record in the runbook, in place, the `%ProgramData%` fact above.

**DEFEAT TEST**
- Mutation: restore `host := ExecCanaryHost{Machine: MachineProjection{Layout: DefaultMachineLayout()}}`
  at the replaced line.
- Command:
  `cd C:/cwt/w6-t6 && go test ./internal/codexmanaged -run TestLiveCanaryTestUsesTheProductionProjectionShape -count=1`
- Must appear in the output:
  `the live canary builds a projection with 0 inline hook groups; the machine lane cannot be attributed`

**BLAST RADIUS:** Test and documentation only. The risk is the inverse of a production risk: a test
that *looks* like it drives the machine lane and cannot has already produced two `user`-lane
observations against four required (build, lane) pairs. Who notices: the operator running the
live-proof procedure, and the `liveproof_gate_test.go` gate that keeps reading `UNFIRED`.

**ROLLBACK:** Revert two files. No shipped code is touched.

**EXIT**
`python -c "import json;d=json.load(open('internal/codexmanaged/testdata/liveproof/ledger.json'));obs=d['observations'];print(sum(1 for o in obs if o['lane']=='machine'))"`
prints **>= 1**, taking the four required (build, lane) pairs from **2/4 met to >= 3/4**. If the machine
lane measures *failing*, that is the result and it is recorded as one.

---

## Task 7: Split the single deny probe into a claim set, and compose posture per claim

**Files:**
- `Installers/internal/airuntimeintegrity/provider.go` (`CanaryOutcome` at `:113-127` — extend the
  request/result to carry a claim id; **do not** change the four outcome members)
- `Installers/internal/endpointcontrolauth/artifacts.go` (`CanaryProofKinds` at `:72-76` — the closed
  vocabulary, three members today; the shape gate that reads it is at `:255`)
- `Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:184`
  (`@IsIn(CANARY_PROOF_KINDS)`) and the shared contract that defines `CANARY_PROOF_KINDS`; the mint-time
  check is `isCanaryProofKind` at `endpoint-control-authority.service.ts:264-266`
- `Installers/internal/aicanary/sideeffect.go` — **built by W5 Task 8; this task is its only caller**
- New: `Installers/internal/airuntimeintegrity/posture.go` + `posture_test.go`
- `Installers/internal/codexmanaged/machine_projection.go:57-72` (the three existing states, which
  become the composition of the new per-claim states, not a parallel vocabulary)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t7
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The vocabulary is still three members on the agent side.
MSYS_NO_PATHCONV=1 git show origin/main:internal/endpointcontrolauth/artifacts.go | sed -n '72,76p'
#    expect: DENY_PROMPT_FIXED_PROBE, DENY_TOOL_FIXED_PROBE, DENY_ESCALATION_FIXED_PROBE

# 2. W5 Task 8 has landed — this task consumes it and it has no other caller.
grep -n "type SideEffectWitness struct" internal/aicanary/sideeffect.go
#    expect one hit. If the file does not exist: STOP AND REPORT. Do not write your own witness —
#    a second implementation of "a deny with no allow twin is not proof" is exactly the duplication
#    the reconciliation removed (D2).

# 3. THE ORDERING GATE. The widened vocabulary must be DEPLOYED on the Backend first.
#    Confirm against the environment you will test against, not against origin/main:
curl -s -X POST "$BACKEND/api/v1/ai/policy-delivery/canary" -H "Authorization: Bearer $KEY" \
  -d '{"proofKind":"<your new kind>", ...}' -o /dev/null -w '%{http_code}\n'
#    expect: anything but 400 "Unsupported canary proof kind".
#    A 400 means the Backend has not deployed the widened vocabulary. STOP — do not ship the agent.
```

**LANDMINES**
- **M2 in its strict form.** Widening `CanaryProofKinds` is a contract change across the wire, and it
  is the one place in this wave where deploy order is load-bearing. The Backend validates the proof
  kind at mint time (`service.ts:264-266`) and again on the receipt DTO (`controller.ts:184`).
  **Backend ships and deploys the widened vocabulary first; the agent requests a new kind only after
  that deploy is confirmed.** An agent that requests an unknown kind gets a 400 and stops asking —
  annoying but safe. The reverse order is the fleet-wide outage shape.
- **Programme-level rule from RECONCILIATION §3:** W8 Task 5 (the field-level wire-loss counter) must
  be the **first Backend change in the entire programme**, ahead of every other Backend/agent pair.
  Until it lands, an ordering mistake on a *silently dropping* route produces no error, no data, and a
  console that looks correct. This route is not one of those — a strict DTO 400s — but the rule
  governs the release train you are shipping in.
- An agent that *receives* a proof kind it does not model already refuses it
  (`endpointcontrolauth` shape gate, `artifacts.go:255`). Keep that; do not make an unknown kind
  silently drop out of the composition.
- The three legacy state strings (`ABOVE_FLOOR_CANARY_PENDING`, `ENFORCEMENT_PROVEN`,
  `ENFORCEMENT_GAP`) have downstream readers. Keep them as a **derived rendering** of the composition
  so no existing consumer changes shape.
- **M3:** the posture is a claim surface. Nothing in it may gate a launch.
- This task writes no file. **M1 does not apply.**

**DO NOT**
- Do not change the four `CanaryOutcome` members. They are the vocabulary every consumer keys on.
- Do not collapse "never attempted" into "attempted and failed". That is the precise defect
  `EnforcementState` was written to avoid (`adapter_report.go:169-175`).
- Do not add a claim for a layer this wave cannot honestly reach. A probe that always answers "not
  applicable" is a fourth green light over a dead path.
- Do not re-implement `SideEffectWitness`. Consume it.

**Steps**
- [ ] `TestPostureRevokesOnlyTheFailedClaim`: with `hook-dispatch = FAILED` and
      `managed-source = PROVEN`, the composed posture reports the hook claim revoked and the
      managed-source claim still held. Today's three-state machine cannot express this. RED.
- [ ] `TestPostureNeverGreenOnAnUnprovenClaim`: any claim in `UNKNOWN`, `ERROR`, `UNSUPPORTED` or
      expired removes the aggregate "prevention active" claim. Mirror the pessimism
      `aggregateIntegrityState` already applies at `internal/daemon/ai_integrity_subsystem.go:596-600`
      — the worst input wins.
- [ ] `TestPostureDistinguishesNotMeasuredFromMeasuredFailure`.
- [ ] `TestUnknownClaimIdIsRefusedNotIgnored`.
- [ ] `TestPreActionEffectClaimConsumesTheSideEffectWitness`: the `pre-action-effect` claim is PROVEN
      only when `aicanary.SideEffectWitness` reports `Witnessed == true` (deny marker absent **and**
      allow twin present). A deny alone composes to NOT PROVEN with the witness's own reason.
- [ ] Implement the claim vocabulary for the layers this wave can honestly reach: `managed-source`,
      `hook-dispatch`, `pre-action-effect` (the existing deny probe plus the witness), and
      `evidence-delivery` (the receipt from Task 5). The remaining four strategy layers are out of
      scope — see the closing section.
- [ ] Keep the three legacy state strings as a derived rendering.

**DEFEAT TEST**
- Mutation: collapse the composition back to a single worst-outcome string.
- Command:
  `cd C:/cwt/w6-t7 && go test ./internal/airuntimeintegrity -run TestPostureRevokesOnlyTheFailedClaim -count=1`
- Must appear in the output:
  `managed-source claim reported revoked; only hook-dispatch failed`

**BLAST RADIUS:** The vocabulary widening crosses the wire (see M2). The composition itself is
agent-local and additive.

**ROLLBACK:** The claim set is additive. Reverting the agent to request only `DENY_PROMPT_FIXED_PROBE`
restores single-claim behaviour with the Backend's widened vocabulary still deployed and unused, which
is inert.

**EXIT**
1. `GET /v1/ai/canary` returns a per-claim breakdown for **>= 4** claims on a rig with a wired canary:
   `curl -s -H "Authorization: Bearer $(cat <daemon-token>)" http://127.0.0.1:<port>/v1/ai/canary | python -c "import json,sys;print(len(json.load(sys.stdin)['instances'][0]['claims']))"`
   prints **>= 4**.
2. `go test ./internal/airuntimeintegrity -run TestPosture -count=1` exits 0 with a table test
   exercising all 4^4 combinations against the pessimistic rule.

---

## Task 8: Bring proof freshness down to a change-driven, time-bounded window

**Files:**
- `Installers/internal/airuntimeintegrity/providers/claude/canary.go:61-64` (`CanaryProofLifetime`)
- `Installers/internal/codexmanaged/canary.go:40-43` (`CanaryProofLifetime`)
- `Installers/internal/daemon/ai_integrity_subsystem.go:223-227`
  (`canaryChallengeRefreshInterval`) and `runCanaryChallengeLoop` at `:238-256`
- New: `Installers/internal/daemon/ai_canary_freshness_test.go`

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t8
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. Both constants are still 24h and still equal.
MSYS_NO_PATHCONV=1 git show origin/main:internal/airuntimeintegrity/providers/claude/canary.go | sed -n '64p'
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/canary.go | sed -n '43p'
#    expect both: const CanaryProofLifetime = 24 * time.Hour

# 2. THE ORDERING GATE — the whole risk profile of this task depends on the answer.
psql -At -c "select count(*) from endpoint_control_authority where proof_outcome='PROVEN' and proof_expires_at > now()"
#    expect: 0
#    If it is NOT 0, Task 5 has already been DEPLOYED and this change is a fleet-wide
#    REVOCATION EVENT, not a no-op. STOP AND REPORT; the owner decides, not you.

# 3. The cadences you must not turn into a probe storm.
MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/ai_integrity_subsystem.go | sed -n '227p'
#    expect: const canaryChallengeRefreshInterval = 2 * time.Minute
```

**LANDMINES**
- **LAND THIS BEFORE TASK 5 IS DEPLOYED.** Today zero endpoints hold a PROVEN canary, so shortening
  the lifetime revokes nothing and its blast radius is literally empty. After Task 5 there will be
  green endpoints and the identical change is a fleet-wide revocation. Same code, two completely
  different risk profiles, separated only by ordering.
- The two lanes' constants **have disagreed before and the weaker one was the default** — the reason
  the Claude demotion block cites `codexmanaged/canary.go:379-395` explicitly at
  `providers/claude/canary.go:276-278`. Pin them to each other with a parity test.
- A shortened window launches the real vendor client more often. That is a real, observable process on
  a developer's machine, and challenges are minted single-use under
  `MaxCanaryChallengeLifetime`. Bound the launch rate or the freshness win becomes a probe storm.
- An **expired** proof is *pending*, never *gap*. The whole reason `ABOVE_FLOOR_CANARY_PENDING` exists
  (`machine_projection.go:57-64`) is that "no live proof yet" is where every endpoint legitimately
  sits after a successful install. Reporting it as a fault made the operator surface look like the
  client was broken.
- **M3:** an expired proof must not gate anything.

**DO NOT**
- Do not make the two lanes' lifetimes different "temporarily".
- Do not lengthen `canaryChallengeRefreshInterval` to compensate; that starves the window instead of
  bounding the launches.
- Do not implement the binary-change trigger twice. `VersionChurned` (`adapter_report.go:146-159`)
  already does it on the Codex lane; extend the same rule, do not restate it.

**Steps**
- [ ] `TestProofExpiryIsAtMostFifteenMinutes` on both lanes. RED today (24 h).
- [ ] `TestProofIsVoidedByAnEventNotOnlyByTime`: assert a re-canary is required immediately after each
      of — install, upgrade, runtime binary change, policy change, managed-source change, service
      restart, user sign-in.
- [ ] `TestCanaryLaunchRateIsBounded`: with a 15-minute window and a 60-second sweep, assert at most
      one host launch per instance per window under a simulated clock.
- [ ] `TestAStaleProofIsNotAFailure`: an expired proof composes to *pending*, never to *gap*.
- [ ] `TestBothLanesShareOneLifetime`: a parity test pinning the two constants equal.
- [ ] Implement.

**DEFEAT TEST**
- Mutation: map an expired proof to `ENFORCEMENT_GAP`.
- Command:
  `cd C:/cwt/w6-t8 && go test ./internal/daemon -run TestAStaleProofIsNotAFailure -count=1`
- Must appear in the output: `an expired proof reported as a measured enforcement gap`

**BLAST RADIUS:** Too short: burns challenges and launches the real client more often. Too long: the
stale green the strategy is removing. Who notices: an operator watching Codex sessions start on their
box.

**ROLLBACK:** Two constants. Reverting to 24 h restores today's semantics exactly.

**EXIT**
1. `go test ./internal/daemon ./internal/codexmanaged ./internal/airuntimeintegrity/... -run "Proof|Freshness|Lifetime" -count=1` exits 0.
2. A rig left idle for 20 minutes after a PROVEN canary reports **pending** (not proven, not gap) via
   `GET /v1/ai/canary`, and the observed host-launch count over one hour is **<= 4 per instance**
   (count the `RunDenyProbe` entries in the daemon log).

---

## Task 9: Make the surfaces read the real evidence instead of a constant

**Files:**
- `Installers/cmd/devoid/ai_codex_machine.go:492` (the zero-value `EnforcementState()` call; its own
  comment at `:421-438` names this task and says only the caller changes; the OK/Proven split it must
  preserve is explained at `:412-419`)
- `Installers/internal/daemon/ai_canary_status.go` (the existing `GET /v1/ai/canary` reader,
  `handleAICanaryStatus` at `:149` — the source the CLI should consult)
- `Backend/src/ai-governance/services/runtime-adapter-render.util.ts:266-332`
  (`NO_QUALIFYING_ENFORCEMENT_PROOF` at `:313-317`, its docblock rationale at `:319-328`,
  `SERVER_ENFORCEMENT_PROOF_SOURCES` at `:329`)
- `Backend/src/ai-policy-delivery/endpoint-control-authority.service.ts` (a read of the `proof_*`
  columns for the render path)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t9
# 1. The CLI still calls EnforcementState on the ZERO VALUE.
MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/ai_codex_machine.go | sed -n '492p'
#    expect: 	state, slug := codexmanaged.EffectiveLoadEvidence{}.EnforcementState()

# 2. The Backend constant is still frozen and still an enum (so this is an append).
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin --quiet
MSYS_NO_PATHCONV=1 git show origin/main:src/ai-governance/services/runtime-adapter-render.util.ts | sed -n '329p'
#    expect: export const SERVER_ENFORCEMENT_PROOF_SOURCES = ['server-recorded-block'] as const;

# 3. There is at least one live PROVEN receipt to read (Task 5 must have produced one).
psql -At -c "select count(*) from endpoint_control_authority where proof_outcome='PROVEN'"
#    expect: >= 1. If 0: STOP — there is nothing to render and the exit gate cannot be met.
```

**LANDMINES**
- **This is the task that lets a green appear in front of a customer.** Two guards, both mandatory.
  First, the Backend read must require `proof_outcome = 'PROVEN'` **and** `proof_expires_at > now()`:
  the migration's own docblock (`1790200000000-AddCanaryReceiptProof.ts:50-54`) states that a PROVEN
  row with a NULL expiry is deliberately **not** a live proof — and that is the shape the **Claude
  lane produces today** (Task 5 landmines). Second, the CLI's existing `OK`/`Proven` split must be
  preserved: `OK: true, Proven: false` for a clean-but-unproven endpoint is correct, and exiting
  non-zero there would fail the whole fleet on its normal state (`ai_codex_machine.go:412-419`).
- The `NO_QUALIFYING_ENFORCEMENT_PROOF` docblock is now **stale**: it says the artifact "does not
  exist yet" and blocks on `consume`, while `recordCanaryReceipt` landed. Correct it in place —
  record the correction, do not delete the paragraph. The reasoning it carries (an endpoint must not
  be able to mint its own green) is still the rule.
- **M3:** a red render is a claim, not a control. Nothing here gates anything.
- This task writes no file to the endpoint. **M1 does not apply.**

**DO NOT**
- Do not make `devoid ai codex machine` exit non-zero for a pending endpoint.
- Do not re-shape `SERVER_ENFORCEMENT_PROOF_SOURCES`. Its docblock at `:319-328` says it is an enum
  precisely so this is an **append**.
- Do not read the `proof_*` columns from more than one place. One reader, used by both the render path
  and the rollup.
- Do not have the CLI recompute posture. It consults `GET /v1/ai/canary`; the daemon owns the answer.

**Steps**
- [ ] `TestCodexMachineStatusReadsTheStore`: with a store holding a PROVEN, fresh record the surface
      prints `ENFORCEMENT_PROVEN`; with a NOT_PROVEN record it prints `ENFORCEMENT_GAP`. RED today —
      both print `ABOVE_FLOOR_CANARY_PENDING`.
- [ ] `TestCodexMachineStatusExitCodeIsUnchangedForAPendingEndpoint`: still `OK`, still exit 0, still
      `[i]` and not `[OK]`.
- [ ] Backend, extending the existing `endpoint-control-authority.canary-receipt.live-pg.spec.ts`: a
      PROVEN row with a NULL `proof_expires_at` does **not** satisfy the enforcement-proof read; a
      PROVEN row with a future expiry does; a PROVEN row with a past expiry does not.
- [ ] Backend: append `'validated-canary-receipt'` to `SERVER_ENFORCEMENT_PROOF_SOURCES` and rewrite
      the `NO_QUALIFYING_ENFORCEMENT_PROOF` docblock in place.

**DEFEAT TEST**
- Mutation: drop the `proof_expires_at > now()` clause from the enforcement-proof read.
- Command:
  `cd C:/cwt/w6-t9/Backend && npx jest src/ai-policy-delivery/endpoint-control-authority.canary-receipt.live-pg.spec.ts -t "a PROVEN receipt with no expiry is not a live proof"`
- Must appear in the output:
  `expected enforcementProof=false for an unbounded PROVEN row, got true`

**BLAST RADIUS:** Customer-visible render state on every endpoint. Wrong in the permissive direction:
a green that no live proof supports. Wrong in the restrictive direction: the render degrades to
`observed`, which is today's state.

**ROLLBACK:** Backend — revert to the frozen `NO_QUALIFYING_ENFORCEMENT_PROOF` constant; the render
degrades to `observed` and nothing crashes. CLI — revert one caller to the zero value.

**EXIT**
With one live PROVEN receipt on a local Backend, the console's runtime-adapter render reports the
checkpoint as enforcement-proven, **and reports it as not proven 16 minutes later with no further
action**. Named artifact: the two API responses 16 minutes apart, saved as
`w6t9-proven.json` / `w6t9-expired.json`, plus
`diff <(python -c "import json;print(json.load(open('w6t9-proven.json'))['enforcementProof'])") <(python -c "import json;print(json.load(open('w6t9-expired.json'))['enforcementProof'])")`
showing `true` → `false`.

---

## Task 10: Turn the build corpus into a per-digest capability certificate

> ### A certificate must never be able to make an endpoint refuse to launch a runtime.
>
> A fail-closed branch on an unprovable condition bricked a machine in July 2026 and the operator
> removed the agent. "This binary has no certificate" is not provable as malicious — it is provable
> only as **unmeasured**. **The certificate removes claims; it does not remove capability.** This is
> the rule for the whole wave (M3) and this task is where it would be most tempting to break it.
> If a reviewer asks for a launch block here, the answer is no, and the reason is that a control which
> has been uninstalled protects nobody.

**Files:**
- `Installers/internal/airuntime/adapters/codex/testdata/shook/corpus/builds/manifest.json` (the
  existing register — the certificate's *evidence* half; keep it as testdata)
- New: `Installers/internal/runtimecert/` — `certificate.go`, `certificate.json`, `certificate_test.go`
- `Installers/internal/codexmanaged/hookdialect.go:99-166` (the existing per-family pin — the
  certificate must **derive** its dialect row from this, never restate it)
- `Installers/internal/codexmanaged/adapter_report.go:146-159` (`VersionChurned` — the certificate
  keys on digest, which is strictly stronger than the version string this already compares)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t10
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The evidence register still carries four builds with digests.
python -c "import json;d=json.load(open('internal/airuntime/adapters/codex/testdata/shook/corpus/builds/manifest.json'));print(len(d['builds']),[b['version'] for b in d['builds']])"
#    expect: 4 ['0.144.0-alpha.4', '0.130.0-alpha.5', '0.134.0', '0.146.0-alpha.9.2']

# 2. The dialect pin is still two families and still refuses everything else.
MSYS_NO_PATHCONV=1 git show origin/main:internal/codexmanaged/hookdialect.go | sed -n '166p'
#    expect: var knownHookTrustDialects = []hookTrustDialect{hookTrustDialect144, hookTrustDialect147}

# 3. internal/runtimecert does not already exist.
test -d internal/runtimecert && echo EXISTS || echo ABSENT
#    expect: ABSENT
```

**LANDMINES**
- A certificate that answers "unknown" for a binary the fleet actually runs turns that endpoint's
  posture to `UNVERIFIED` — which is *not* green and *not* a gap. That is intended and safe, but it
  **will** be visible: the Codex desktop on the authoring machine runs `0.149.0-alpha.4.1`, which no
  dialect row covers (`hookdialect.go:163-165`), so it reads UNVERIFIED on day one. **Say that in the
  release note before anyone reports it as a regression.**
- A version string is not an identity. The corpus records four builds across **two distinct install
  locations** — the npm global vendor path (`0.134.0`) and
  `…\AppData\Local\OpenAI\Codex\bin\<hash>\codex.exe` (`0.144.0-alpha.4`, `0.146.0-alpha.9.2`) — each
  with its own sha256. Key on digest.
- A deny observation with no allow twin proves the rig is broken, not that enforcement works. All
  three `observed: true` live-proof entries carry an allow twin on the identical rig.
- The certificate must not become a second, unevidenced source of truth. Every certified digest must
  join to a corpus entry.
- **M1 does not apply** — `internal/runtimecert/certificate.json` is a repository file, not an
  endpoint file. Do not add a per-endpoint certificate cache anywhere under the machine root.

**DO NOT**
- Do not let an unknown digest inherit any other digest's state — not the newest, not "assume
  compatible", not "assume hostile".
- Do not restate the dialect families in the certificate. Derive them from `hookdialect.go`.
- Do not add a launch-blocking branch, an install-blocking branch, or a "quarantine the binary" path.
  See the box above.
- Do not widen the dialect pin to cover a digest you want to certify. Two vendor artefacts per family
  is the price (`hookdialect.go:117-166`, SOT §16.1 C1) and this wave does not discount it.

**Steps**
- [ ] `TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState`: certify digest A as PROVEN, present
      digest B, assert `UNVERIFIED`.
- [ ] `TestCertificateIsKeyedByDigestNotVersionString`: two binaries reporting the same `--version`
      with different sha256 get different rows.
- [ ] `TestCLIAndIDEAndDesktopAreSeparateRows`: one digest certified for host `cli` does not certify
      host `desktop`.
- [ ] `TestNoCertificateWithoutBothAnAllowAndADenyControl`.
- [ ] `TestExpiredCertificateIsNotAValidCertificate`, with the expiry as data, not a constant.
- [ ] `TestEveryCertifiedDigestHasACorpusEntry`.
- [ ] `TestCertificateNeverGatesALaunch`: a table over every certificate state — including
      `UNVERIFIED` and `EXPIRED` — asserting the returned decision object exposes no member any caller
      could read as "do not launch". This is the box above, as a test.

**DEFEAT TEST**
- Mutation: make the lookup fall back to the newest certified row when the digest is unknown.
- Command:
  `cd C:/cwt/w6-t10 && go test ./internal/runtimecert -run TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState -count=1`
- Must appear in the output: `digest b3f1… inherited the state of digest 1766ac7d…`
  (`1766ac7dfbf4c7dd…` is the real corpus digest for `0.134.0`.)

**BLAST RADIUS:** Posture display only. The certificate has exactly one consumer (Task 11's posture
input) and no path to capability.

**ROLLBACK:** Remove the consumer. Every endpoint returns to today's version-string reasoning.

**EXIT**
`python -c "import json;d=json.load(open('internal/runtimecert/certificate.json'));print(len(d['rows']),all(k in d['rows'][0] for k in ['digest','host','os','dialectId','coveredToolPaths','uncoveredToolPaths','testSuiteVersion','expiresAt']))"`
prints **`4 True`** (at minimum the four digests already in `builds/manifest.json`), and
`go test ./internal/runtimecert -count=1` exits 0 including the fifth-unknown-digest case.

---

## Task 11: Run the certification matrix on the substrate that actually exists — and put the VM cost in front of the owner

**Files:**
- `Installers/.github/workflows/pr-checks.yml:382-486` (extend `codex-vendor-lane` from one pinned
  build to a matrix; the npm pin is at `:431`, the required-build assertion at `:443`, the vendor-lane
  run at `:477`, the evidence upload at `:483`)
- `ci/gates.json` (`repos.Installers.mirrored` already contains `pr-checks:codex-vendor-lane`; matrix
  legs that cannot run locally go in `cannotMirror` **with a reason**, which `node ci/lib/drift.mjs`
  enforces)
- New: `Installers/internal/runtimecert/watch/` — a release-channel watcher that records
  (channel, version, digest, signer, observed-at) and nothing else
- `Installers/internal/codexmanaged/testdata/liveproof/ledger.json` (`requiredBuilds` — the CI pin and
  this list already fail when they drift apart; keep that property)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t11
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The job is where the plan says and is mirrored locally.
MSYS_NO_PATHCONV=1 git show origin/main:.github/workflows/pr-checks.yml | sed -n '382p;431p'
#    expect: codex-vendor-lane: / run: npm install -g @openai/codex@0.134.0
python -c "import json;d=json.load(open('C:/Users/Owner/Documents/Ceragon/ci/gates.json'));print('pr-checks:codex-vendor-lane' in d['repos']['Installers']['mirrored'])"
#    expect: True

# 2. The drift gate is clean before you touch it.
node C:/Users/Owner/Documents/Ceragon/ci/lib/drift.mjs
#    expect: exit 0

# 3. The two standing CI traps are still recorded (read them; they will fool you otherwise).
MSYS_NO_PATHCONV=1 git show origin/main:.github/workflows/pr-checks.yml | sed -n '67,77p'
#    expect the note that GitHub Actions is blocked org-wide (jobs die in ~4s with no runner) and
#    that GitHub silently disables scheduled workflows after 60 days of no commit activity.
```

### What this can and cannot cover. This is the part of Workstream 9 that is not engineering.

| Surface | Substrate | Cost | Verdict |
|---|---|---|---|
| Codex CLI on Linux | `codex-vendor-lane`, already mirrored in local Docker | **free** (`node ci/lib/run.mjs Installers`) | **Do it.** Add matrix legs here. |
| Claude Code CLI on Linux | same job pattern, new legs | **free** | **Do it.** No workflow has ever installed a Claude client; new ground and cheap. |
| Codex/Claude **machine lane** on Windows | needs a host whose real `C:\ProgramData\OpenAI\Codex` may be written — `%ProgramData%` redirection does not move the client's machine root, it resolves the Windows known folder | **a real Windows VM per leg.** `ci/gates.json` already records why Windows jobs `cannotMirror`: *"Windows containers need a Windows container host; Docker Desktop here runs the Linux engine."* | **Cannot be automated on the substrate we have.** Operator-run procedure with a recorded artifact; the VM spend goes to the owner as a **decision**, not a task. |
| macOS hosts | none | Apple licenses macOS VMs only on Apple hardware; `ci/gates.json` calls the macOS matrix *"the single most expensive job in the workspace (30 legs per run)"* with *"no local substitute"* | **Out of scope**, and outside the strategy's own certified boundary (§2.1). |
| Desktop (MSIX) and IDE-extension hosts | none | each is a distinct installed runtime with its own embedded binary | **Certificate rows exist and read UNVERIFIED.** Measuring them needs the Windows VM above. |
| A DeVoid-certified release *ring* that holds back vendor auto-update | not ours | npm and the vendor updaters are not under our control | **Not engineering.** Safe subset: pin where the vendor's managed config honours a pin, otherwise **detect the change and revoke the claim**. Never block the binary. |

**The owner's decision, stated plainly:** everything in the "free" rows can be done this week at zero
marginal cost. Everything in the Windows and desktop rows is a **spend decision** — a Windows VM per
certification leg, recurring — and until that spend is approved those cells stay honestly uncovered.
No amount of engineering removes that constraint, because `%ProgramData%` redirection cannot move the
vendor's machine root. Put the figure in front of the owner; do not absorb it into a task and do not
report the workstream complete on the strength of the Linux legs.

**LANDMINES**
- `requiredBuilds` and the CI pin are already coupled by a failing test. Adding matrix legs without
  adding the corresponding ledger rows turns that coupling red — **that is the coupling working**, not
  a flake to suppress.
- **A red scheduled run is not evidence until you read the job's own output.** GitHub Actions has been
  blocked org-wide (jobs die in ~4 s with no runner assigned) and a no-runner failure looks identical
  from the outside to this alarm firing.
- "Semantic-version prefix widening without live artifacts" is on the strategy's own avoid list
  (§7 WS9). Two vendor artefacts per family, stated in place at `hookdialect.go:117-166` and again in
  `AI_SECURITY_SOURCE_OF_TRUTH.md` §16.1 C1: a loose pin is how this lane went silently dead the first
  time.
- **M3 / the Task 10 box:** the "ring" is a claim surface. It never blocks a vendor binary on a
  customer's machine — that is an availability control over someone else's product and it is how the
  agent gets uninstalled.

**DO NOT**
- Do not "fix" a red mirrored gate by adding `continue-on-error`, deleting the job, or narrowing the
  schedule. The redness is the message (`pr-checks.yml:78-79`).
- Do not add a `cannotMirror` entry whose reason is just "Windows". Name the missing capability.
- Do not mark a release ring-eligible on a version-prefix match.
- Do not restore `push` or `pull_request` triggers on this workflow. Those are what cost $600 in July.

**Steps**
- [ ] `TestReleaseWatcherRecordsDigestAndSignerNeverJustAVersion`: a watcher entry with no digest is
      refused.
- [ ] `TestANewReleaseDoesNotEnterTheRingBeforeItsMatrixRuns`: a watcher entry with no certificate
      cannot be marked ring-eligible.
- [ ] `TestCIPinAndRequiredBuildsAndCertificateAllNameTheSameDigests`: extend the existing pin-drift
      test to a three-way join.
- [ ] `TestEveryUnmirroredMatrixLegHasAStatedReason`: `drift.mjs` already fails on an unmapped job; add
      the assertion that each `cannotMirror` reason names the missing capability.
- [ ] Add matrix legs for the builds the corpus already carries, on Linux, in the mirrored job.
- [ ] Write the Windows machine-lane procedure as an operator runbook section with the same evidence
      fields the live-proof register demands, so a manual run can close a register row.
- [ ] Write the VM cost figure into the PR body, addressed to the owner as a decision.

**DEFEAT TEST**
- Mutation: mark a watcher entry ring-eligible on a version-prefix match with no certificate.
- Command:
  `cd C:/cwt/w6-t11 && go test ./internal/runtimecert/watch -run TestANewReleaseDoesNotEnterTheRingBeforeItsMatrixRuns -count=1`
- Must appear in the output:
  `0.150.1 entered the prevention ring on a prefix match with no certificate`

**BLAST RADIUS:** CI and documentation only, with one exception: the `requiredBuilds` ↔ CI pin
coupling is enforced by a test that will go red if you add legs without ledger rows.

**ROLLBACK:** Matrix legs are additive; drop back to the single pinned build. `cannotMirror` entries
are documentation and removing them only re-triggers `drift.mjs`.

**EXIT**
1. `grep -c "codex@" .github/workflows/pr-checks.yml` >= **3** pinned builds in the matrix.
2. `node C:/Users/Owner/Documents/Ceragon/ci/lib/drift.mjs` exits 0, and
   `python -c "import json;d=json.load(open('C:/Users/Owner/Documents/Ceragon/ci/gates.json'));cm=d['repos']['Installers']['cannotMirror'];print(all(len(v)>40 and 'Windows' != v.strip() for v in cm.values()))"`
   prints `True`.
3. A written Windows-VM cost figure appears in the PR body. **Do not report this workstream complete
   on the strength of the Linux legs.**

---

## Task 12: Put the canary into the live-proof register and keep the gate hostile

**Files:**
- `Installers/internal/liveproof/register.json` (top-level key `proofs`; 8 entries today, this adds two)
- `Installers/internal/liveproof/liveproof.go` (`Validate` — read only; the rules at `:19-24` already
  do the work)
- `Installers/internal/codexmanaged/testdata/liveproof/ledger.json`
- `docs/ai-security/LIVE_PROOF_PROCEDURE.md` (the executable procedure each entry must point at)

**PRECONDITIONS**

```bash
cd C:/cwt/w6-t12
# 0. REFRESH THE REF. Every `git show origin/main:` below is a claim about the REMOTE tip.
#    Local checkouts in this workspace run 20-1010 commits behind; without this the whole
#    precondition block silently validates against a stale tree.
git fetch origin --quiet && git rev-parse origin/main
#    expect: 5b129523... (Installers). If it differs, the citations below may have moved: STOP AND REPORT.
# 1. The register is still 8 entries, 3 observed, and has no canary row.
python -c "import json;d=json.load(open('internal/liveproof/register.json'));p=d['proofs'];print(len(p),sum(1 for x in p if x['observed']),any('canary' in x['id'] for x in p))"
#    expect: 8 3 False

# 2. The gate is green before you add anything.
go test ./internal/liveproof -count=1
#    expect: ok

# 3. docs/ is a SEPARATE git repository. Run git from inside it, not from Installers.
git -C C:/Users/Owner/Documents/Ceragon/docs rev-parse --show-toplevel
#    expect a path ending in /docs
```

**LANDMINES**
- An unobserved control with **no** quarantine is a hard FAIL (`liveproof.go:19-21`); a quarantine must
  name a reason, an owner and a `reviewBy`, and it **expires** on that date. That is the gate working.
- Do not copy `reviewBy: 2026-11-05` from the existing five just because it is there. Five entries
  sharing one date means five expire in one day and someone bulk-extends them.
- **A measured FAILURE closes an entry as legitimately as a success.** The SOT already records the
  machine lane as measured failing; a measured failure is a real result that belongs in the register,
  not a reason to leave it silent.
- `docs/` is a different repository from `Installers`. A commit in the wrong tree is invisible to both
  reviews.
- **M1 does not apply** — this is repository data.

**DO NOT**
- Do not mark an entry `observed: true` without all five evidence fields, including the SQL row.
- Do not remove or relax any existing quarantine to make the gate green.
- Do not add a canary entry that points at a procedure section that does not exist yet. Write the
  procedure first.

**Steps**
- [ ] Add entry `canary-reaches-proven-with-a-delivered-receipt`, `observed: false`, quarantined on the
      four unwired seams from *What exists today* and pointing at Task 5's exit criterion as the
      procedure. It flips to `observed: true` only with all five evidence fields — including the SQL
      row showing `proof_outcome='PROVEN'` **and** `proof_expires_at > now()`.
- [ ] Add entry `canary-proves-the-machine-lane`, `observed: false`, quarantined on the Windows
      known-folder fact from Task 6 and the VM decision from Task 11.
- [ ] Set both `reviewBy` dates deliberately and differently.
- [ ] `TestRegisterHasACanaryEntry`: the register names the canary control at all. RED today.
- [ ] `TestNoQuarantineOutlivesItsReviewDate`: already enforced by `Validate`; add the explicit case so
      a future schema change cannot drop it.

**DEFEAT TEST**
- Mutation: remove the `canary-reaches-proven-with-a-delivered-receipt` entry from `register.json`.
- Command: `cd C:/cwt/w6-t12 && go test ./internal/liveproof -run TestRegisterHasACanaryEntry -count=1`
- Must appear in the output:
  `no live-proof entry covers the canary; the mechanism that answers 'is enforcement alive' is not tracked`

**BLAST RADIUS:** The register is a test and nothing imports it outside its own package, so this cannot
affect a running endpoint. It *can* turn CI red, which is the point.

**ROLLBACK:** Revert the JSON. Nothing else reads it.

**EXIT**
`go test ./internal/liveproof -count=1` exits 0 and
`python -c "import json;d=json.load(open('internal/liveproof/register.json'));p=d['proofs'];print(len(p),sum(1 for x in p if x['observed']))"`
prints **`10 N`** with N stated honestly in the PR body.

---

## Wave exit criteria

1. **The canary reaches PROVEN once, on a real installed client, with a receipt the server holds.**
   Evidence: `outcome=PROVEN` in the agent log, HTTP 200 from
   `POST /api/v1/ai/policy-delivery/canary-receipt`, and an `endpoint_control_authority` row with
   `proof_outcome='PROVEN'` and `proof_expires_at > now()`. **On the Codex lane** — the Claude lane
   emits no expiry today (Task 5) and that limitation is stated, not hidden. Defeat test:
   `TestProvenStillDegradesWhenTheSinkFails` (Task 5).
2. **A PROVEN canary with an undelivered receipt is still not a proof.** The demotion at
   `providers/claude/canary.go:284-290` and `codexmanaged/canary.go:379-396` is byte-unchanged:
   `git diff origin/main -- internal/airuntimeintegrity/providers/claude/canary.go internal/codexmanaged/canary.go | grep -c "^[-+].*ReceiptUndelivered\|^[-+].*ReceiptUploadFailed"`
   prints **0**. Defeat test: `TestProvenStillDegradesWhenTheSinkFails`.
3. **Zero of >= 6 real-host canary attempts report `canary-host-launch-failed`** on a run where the
   client printed its own block line. Baseline: 2 of 6. Defeat test:
   `TestRun_SlowPipeCloseAfterCleanExitIsNotALaunchFailure` (Task 1).
4. **All four previously-unwired seams are assigned in production code**, proven by
   `git grep -n "Receipts:\|Canaries.Ledger\|claude.Ledger\|Applied.BundleRevision" -- '*.go' | grep -v _test.go | wc -l`
   printing **>= 5**, and by four separate daemon-package tests (Tasks 2, 3, 5). Defeat tests:
   `TestSecondCanaryOnTheSameChallengeIsEvidenceNotASecondRun`, `TestAppliedBindingIsAllOrNothing`,
   `TestReceiptSinkIsAssignedOnBothProviders`.
5. **A proof older than 15 minutes reads pending, not proven, and not a gap**, on both lanes. Defeat
   test: `TestAStaleProofIsNotAFailure` (Task 8).
6. **A failed claim revokes only that claim.** >= 4 claims composed, all combinations table-tested.
   Defeat test: `TestPostureRevokesOnlyTheFailedClaim` (Task 7).
7. **An unknown binary digest reads `UNVERIFIED`, never inherits a certified digest's state, and never
   stops a launch.** Defeat tests: `TestUnknownDigestIsUNVERIFIEDNeverTheLastVersionsState` and
   `TestCertificateNeverGatesALaunch` (Task 10).
8. **`internal/codexmanaged/testdata/liveproof/ledger.json` moves from 2/4 to >= 3/4 required
   (build, lane) pairs**, with the machine-lane row recording whatever was actually measured. Defeat
   test: `TestMachineLanePreconditionIsAssertedNotAssumed` (Task 6).
9. **The live-proof register carries 10 entries, and the canary is one of them.** Defeat test:
   `TestRegisterHasACanaryEntry` (Task 12).
10. **`node ci/lib/drift.mjs` is clean and `node ci/lib/run.mjs Installers` passes**, with the report
    naming which legs ran and which could not. Never report this wave as "all checks pass": 73 legs in
    this workspace cannot be mirrored at all, and the Windows machine lane is one of them.

### Ordering that is load-bearing and has broken production before

- **Task 4 before Task 5.** Task 5 calls a client method that does not exist until Task 4 lands. Do
  not let an isolated agent write a second one (RECONCILIATION C5).
- **Tasks 2 and 3 before Task 5.** Wiring only the sink changes nothing: the Codex lane still dies at
  `challenge-wrong-bundle` and the Claude lane at `canary-ledger-unavailable`, both before the sink
  is reached (RECONCILIATION C6).
- **Task 1 before W2 Task 5.** W2 extracts this launch path and measures "0 tests changed status"
  against a baseline this task moves (RECONCILIATION D3).
- **Task 8 lands before Task 5 is *deployed*.** Shortening the proof window on a fleet with zero green
  endpoints revokes nothing; doing it afterwards is a fleet-wide revocation.
- **W5 Task 4 ships in the SAME RELEASE as this wave's Tasks 1-5** (RECONCILIATION §3.16). W5 Task 4
  drops every endpoint's certification display from `observed` to `loaded`; this wave is the only
  thing that can legitimately restore it. Without the pairing an operator reads a correct change as a
  regression and asks for a rollback.
- **Task 7's widened `CANARY_PROOF_KINDS` ships on the Backend and is DEPLOYED before any agent
  requests a new kind.** Note the asymmetry that makes this route unusual: `RecordCanaryReceiptDto` is
  **strict**, so an agent ahead of the Backend gets a 400 rather than a silent field drop — loud, not
  invisible. That is a reason to be less afraid of *this* route, not a reason to relax the rule.
- **W8 Task 5 is the first Backend change in the whole programme.** Until the field-level wire-loss
  counter lands, an ordering mistake on any silently-dropping route produces no error, no data, and a
  console that looks correct.
- **Tasks 4/5 may ship on the agent second**, because the receipt route already exists in the deployed
  Backend (td 322). Confirm the migration `1790200000000-AddCanaryReceiptProof` has actually **run**
  in the target environment; the file being on `origin/main` is not the same fact.
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
  that protects nobody. **The certificate removes claims; it does not remove capability.** Revisit only
  when the provable condition can be named: *this endpoint has held a valid applied bundle and a
  successful canary within the last N windows, and lost it*.
- **It does not weaken a single existing guard.** The nil-sink-is-a-delivery-failure rule, the
  PROVEN-degrades-to-ERROR rule, the consume-before-launch ordering, the synthetic-is-never-proof
  downgrade, the applied-tuple shape gate, the strict receipt DTO, and the register's expiring
  quarantines are all inputs to this wave, not obstacles in it. Every one of them is currently the only
  thing standing between this product and a manufactured green. **If a guard blocks a task, the task is
  wrong.**
- **It does not widen the Codex hook dialect pin.** `0.145`, `0.146`, `0.148` and `0.149.0-alpha.4.1`
  stay unrecognised (`hookdialect.go:163-165`). A loose pin is how this lane went silently dead the
  first time; two vendor artefacts per family is the price and this wave does not discount it.
- **It does not certify macOS, WSL2, cloud sessions, SDK embeddings, or a hostile local
  administrator.** All are outside the strategy's own initial certified boundary (§2.1), and three of
  them have no substrate in this workspace at all.
- **It does not pretend the Windows machine-lane matrix is an engineering task.** It needs Windows VMs
  this workspace does not have, because `%ProgramData%` redirection cannot move the vendor client's
  machine root — it resolves the Windows known folder, so the only measurable machine root is the
  operator's own. Task 11 states the cost and puts it in front of the owner as a **spend decision**.
  Writing a task that automates it would be writing a task that cannot be done.
- **It does not attempt a DeVoid-controlled vendor release ring.** npm and the vendor updaters are not
  under our control. The safe subset — pin where the vendor honours a pin, otherwise detect and revoke
  — is what Task 10 and Task 11 implement. Blocking a vendor binary on a customer's machine is an
  availability control we have no right to and would not survive first contact with a developer.
- **It does not close the 6-in-10 hook fail-open from SOT §15.1.** That is the reliability row
  (3.0 -> 9.7), it is a different wave, and its constants (`internal/aihooks/settings.go:111`,
  `internal/airuntime/runner.go:52`) are untouched here. A canary that goes green while a third of real
  invocations are never decided is a *correct* canary reporting on a *different* claim — which is
  precisely why Task 7 splits the claims apart instead of composing one number.
- **It does not close the "production evidence convergence" clause of its own scorecard row.** Every
  live-proof artefact this wave produces is a **local-rig measurement**. Nothing here — and, per
  RECONCILIATION §6, nothing in any of the eight waves — proves the canary against the **production**
  signing, policy and evidence chain. That clause appears in both the Proof row and the Enterprise
  readiness row and is currently **unowned**. This wave takes the Proof row to 9.6 on local evidence
  and says so; do not report the row closed.
