# Wave 4 - Make the machine-managed vendor source authoritative

**Scorecard rows this moves:** Claude interception coverage 7.5 -> 9.4; Codex interception coverage 5.5 -> 9.3 (strategy §12)
**Depends on:** Wave 1 (local inline decision core / real service boundary). A machine hook that reaches a busy daemon still fails open on both vendors, so an authoritative hook lane is only worth its score once the decision is reachable. Nothing in this wave depends on the egress wave, but the §8.6/§9.7 exit gates are not fully met until it lands.
**Phase:** 2 (strategy §11 - "Make vendor controls authoritative and provider egress forced")

All file:line references below were read at the origin/main commits named in the brief and re-confirmed:
Installers `5b129523`, Backend `0cf9021e`, Frontend `cac574ae`. **The local Installers checkout is at
`8e49a625`, which is behind origin/main and does not even contain `internal/codexmanaged`.** Read the
code with `git show origin/main:<path>` or from a worktree of `origin/main`; a plain `ls` in the
workspace checkout will mislead you exactly as it misled the first pass of this wave.

---

## What exists today

### The two lanes are asymmetric, and each is broken in the opposite direction

**Claude: the reporting is honest, and the machine lane cannot run at all.**
The RA-4 Claude provider (`internal/airuntimeintegrity/providers/claude/`) is a complete,
26-decision, three-authority-mode implementation of Anthropic's machine managed-settings tier -
source catalogue with the vendor's real first-non-empty-wins ranking
(`sources.go:129-141`), an ownership probe that refuses reparse points
(`machine_windows.go:43-60`), atomic apply with exact re-read (`provider.go:739`), a canary, and a
ledger. The daemon builds it (`internal/daemon/ai_integrity_wiring.go:300-317`), registers it as an
RA-4 provider (`:328`), and the controller drives Compile -> Inspect -> Apply
(`internal/airuntimeintegrity/controller.go:438`, `:444`, `:513`).

It has never written a byte on any endpoint, for **three independent, verified reasons**, each of
which alone is sufficient:

1. **No server intent is ever issued for Claude.** `defaultRuntimeIntegrityConfig()` ships
   `claudeAuthorityModes: {}` (`Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts:150`).
   `buildIntentsForEndpoint` reads `signed.claudeAuthorityModes?.[host.policyHost] ?? null`
   (`Backend/src/ai-policy-delivery/endpoint-policy-integrity-read.service.ts:642-646`) and hands it
   to `targetShapeForProvider`, which returns `null` for a null Claude mode
   (`:460-475`). The target is then counted in `unresolvedTargets` and no intent is emitted. On the
   endpoint `intentFor` answers `ok=false`, and `reconcileTarget` returns at
   `controller.go:426-436` with `StateUnknown` - discovered but unmanaged. The console *has* the
   control (`Frontend/components/admin/ai-security-policy-section.tsx:1553-1559`) and deliberately
   downgraded the missing entry from a violation to a calm advisory (`:1300-1339`), which is correct
   as a console decision and is why nobody noticed the lane was dark.
2. **Compile would refuse anyway, on a two-package format mismatch.**
   `ai_integrity_wiring.go:305` sets `PackagedDigest: aiwire.HelperDigest(launcherPath)`.
   `aiwire.HelperDigest` returns bare lowercase hex (`internal/aiwire/machine_codex.go:160-170`).
   `BinaryIdentity.Identified()` accepts `PackagedDigest` only against
   `digestRE = ^sha256:[0-9a-f]{64}$` (`providers/claude/projection.go:128`, `:145-147`), and
   `SignerSubjectHash` is never set. So `validateCommon` returns
   `invalid(SlugBinaryIdentityMissing)` at `projection.go:497-499` on **every** endpoint. The failure
   surfaces only as `res.Errors = append(..., "compile:"+...)` at `controller.go:440`.
3. **Preflight would refuse the apply, permanently.** `STATIC_COEXISTENCE` must disprove that a
   higher tier wins: `fileTierUnproven` returns true if any managed-capable, supported source ranked
   above the file tier was never `Probed` (`preflight.go:376-389`). The catalogue registers
   `SourcePolicyHelper` (rank 0) and `SourceMDM` (rank 2) as `ManagedCapable=true, Supported=true`
   with `Path=""` (`sources.go:279-280`). `Provider.observe` has a builtin reader only for
   HKLM/HKCU (`registry_windows.go:37-49`), and `Provider.ExtraSources` is **never assigned by the
   daemon** - `git grep "claude.ExtraSources"` over origin/main returns nothing outside tests. Both
   rows therefore return `Probed=false` (`provider.go:321-324`), `fileTierUnproven` is true, and
   `MayWrite` is false with `ReasonFileTierUnproven` for `STATIC_COEXISTENCE`
   (`preflight.go:217-220`) and for `DEVOID_AUTHORITY`/file (`:247-250`). `registry_windows.go:16-19`
   already states this shape in place, about the HKLM case it closed.

Consequences that are visible today: `Adapter.Machine` and `Adapter.Proof` are declared
(`internal/airuntime/adapters/claudecode/claudecode.go:45`, `:48`) and read
(`machine_lane.go:79-91`), but **nothing assigns them** - `internal/airuntime/adapters/registry.go:31`
calls `claudecode.New(launcher)` and stops. So `binding().ConfigSource` stays `"user-settings"`
(`detect.go:242-254`) and `deploymentAssurance()` stays `"cooperative"` (`:260-265`) on every
endpoint in the fleet. That is the SOT §16 bullet "The Claude machine-scope adapter lane. Nothing
assigns it", verified at its exact site.

The only Claude control that actually runs is the user-scope writer,
`internal/aihooks/settings.go`, which writes `~/.claude/settings.json` - hooks, a uniform 60s
timeout (`settings.go:54-115`), and the transport route. **The route is the user file's alone**:
`ANTHROPIC_BASE_URL` is asserted under the top-level `env` object of the user settings
(`internal/aihooks/transport_route.go:32`, `:70-77`), and in the machine projection `ProviderRoute`
is only a hash row and a validation gate (`projection.go:455`, `:486-488`, `:693`) - it never becomes
a key in the projection body. `allowManagedPermissionRulesOnly` appears **nowhere in the repository**.

**Codex: the machine lane runs everywhere, and the report is hardcoded to claim it did.**
`ReconcileCodexMachine` is called unconditionally from every reconcile tick
(`internal/aiwire/aiwire.go:322`; the lane's own header says "There is no enable flag",
`machine_codex.go:28-35`). The machine baseline it writes is
`%ProgramData%\OpenAI\Codex\requirements.toml`, and its content is exactly three things:
`allow_managed_hooks_only` (`machine_projection.go:779-788`), the `[hooks]` managed-dir label plus
the inline hook groups (`:806-849`), and marketplace sources (`:850-870`). `ManagedOnly()` is gated
on argv attestation - `hookArgvEntersHookPath(p.HookArgv)` (`:521-523`) - which is the CX-5 fix that
stops the pin being asserted over a hook set that cannot dispatch.

The suppression question the strategy raises is already read correctly, and better than the strategy
assumes. `userHookLaneSuppression` is a **tri-state** read of the bytes on disk
(`internal/codexmanaged/canary_host.go:367-409`); `machineHookLaneFor` asks, per requirement and per
checkpoint, whether the baseline declares a DeVoid command that enters `ai hook --adapter codex`,
names that event, and resolves on disk (`internal/codexmanaged/machine_hook_lane.go:92-141`);
`applyManagedOnlyOverlay` combines them so that a machine-governed checkpoint stays `installed` with
an attribution slug and a suppressed-with-nothing-behind-it checkpoint goes `StatusMissing`
(`internal/codexmanaged/verify.go:701-800`). Crucially, `managedOnlyOverlayAdmits` already admits
`unknown / hook-trust-dialect-unverified` rows, so **the machine lane can already close the dialect
question in either direction** (`verify.go:873-882`). The CLI prints all of this precisely
(`cmd/devoid/ai_codex_lanes.go:309-313`, `:345-353`).

What is *not* right on the Codex lane:

- **The adapter report asserts `managed` unconditionally.**
  `internal/codexmanaged/adapter_report.go:300` assigns `DeploymentAssurance:
  deploymentAssuranceManaged` (`:41`) on every path, including the `anyUnknown()` and
  missing/tampered branches (`:247-278`). `ConfigSource` is the frozen string
  `"managed_config.toml+config.toml"` (`:47`) - the two **user-writable** files - even on an
  endpoint whose real authority is the machine requirements file. `Host` is the literal `"cli"`
  (`:284`) on a desktop or IDE endpoint. Compare the Claude adapter, which does the honest thing at
  `claudecode/detect.go:242-265`.
- **The pins that actually govern tool paths live only in a user-writable file.**
  `approval_policy`, `sandbox_mode`, `sandbox_workspace_write.network_access`, `tools.web_search`,
  `features.computer_use`, the provider route and the audit MCP server are written to
  `$CODEX_HOME/managed_config.toml` (`internal/codexmanaged/merge.go:100-173`), and on a
  desktop-present box only the route survives (`DesktopManagedConfigBytes`, `merge.go:183-200`; the
  sandbox pin is a proven-live desktop brick). The machine requirements file carries none of them.
- **That user file outranks the machine file.** `RequirementsPrecedence` is frozen
  highest-to-lowest as `CLOUD_REQUIREMENTS`, `LEGACY_MANAGED_CONFIG`, `MACHINE_REQUIREMENTS`
  (`internal/codexmanaged/machine.go:191-195`), and `machine.go:184-187` says so in place: DeVoid's
  baseline is "the LOWEST-precedence of the three".
- **A divergence in that higher-precedence user file changes nothing.**
  `legacyRequirementFields` computes `DivergesFromDevoid` per key
  (`machine_effective.go:740-765`), it is populated at `:483`, and its **only** consumer in the whole
  repository is an `[i]` line on a CLI (`cmd/devoid/ai_codex_machine.go:356-362`).
  `EffectiveResult.Verdict()` fails on `UnconstrainedHookPaths` and
  `UserAuthoredManagedHookSources` (`machine_effective.go:263-265`) and **has no clause for
  `LegacyRequirementFields`**. A user setting `tools.web_search = true` in their own
  `managed_config.toml` produces no downgrade, no non-zero exit, and nothing off-box.
- **The trust-hash dialect table is two rows and the owner's own client is outside both.**
  `knownHookTrustDialects = []hookTrustDialect{hookTrustDialect144, hookTrustDialect147}`
  (`hookdialect.go:166`; rows at `:100-104` and `:111-115`), `hookTrustDialectFor` answers no for
  everything else (`:186-197`). 0.145, 0.146, 0.148 and `0.149.0-alpha.4.1` - the Codex desktop app's
  own runtime, and the owner's client - are unresolvable. **Widening the pin without two vendor
  artefacts per family is forbidden by prior decision** and is stated at `hookdialect.go:30-38` and
  `:163-165`, and in SOT §16.1 C1. It is how the firewall went silently dead the first time.
- **Genuinely absent:** Codex permission profiles and the `elevated` Windows sandbox mode. Neither
  string appears anywhere in the Installers tree (`git grep permission_profile`, `git grep '"elevated"'`
  over origin/main return nothing relevant). Also absent: any enumeration of hosted/specialized Codex
  tool paths. The only "uncovered path" inventory that exists is `hookPathKeys`
  (`machine_effective.go:632-637`), which covers SDK hooks and force-enabled plugins - four keys,
  not the §9.4 list.

### The one seal that flips five behaviours

`ManagedEndpoint(stateDir)` is a single boolean read of `seal.json`'s `signedRequired`
(`internal/airuntimeintegrity/local_disablement.go:50-56`; the persisted shape is
`persistedSeal` at `state.go:158-163`). Five consumers read it through `managedEndpoint()`:
refuse-to-launch on an unreachable daemon (`cmd/devoid/agent_shim.go:520`), override a user-set
provider route (`:599`), strip vendor bypass flags (`:609`), and two more installed at CLI start-up
(`cmd/devoid/ai_local_bypass.go:55-71`). A missing seal turns all five cooperative at once. That is
SOT §13.3, verified.

---

## Task 1: Make the Claude machine projection compilable

**Files:** `internal/daemon/ai_integrity_wiring.go` (:302-311),
`internal/daemon/ai_integrity_wiring_test.go` (new case),
`internal/airuntimeintegrity/providers/claude/projection_test.go`

`aiwire.HelperDigest` returns bare hex; `BinaryIdentity.Identified()` demands the `sha256:` prefix.
Fix it at the **wiring**, not by widening `digestRE`: the regex is the contract that keeps a
truncated or foreign string out of a binary identity, and loosening it would weaken an existing
guard. Set `PackagedDigest: "sha256:" + aiwire.HelperDigest(launcherPath)` only when the digest is
non-empty, and leave it empty otherwise so an unreadable launcher still refuses.

**Blast radius:** Today the Claude provider's `Compile` fails for every endpoint and the error is
swallowed into `SweepResult.Errors`. After this fix `Compile` can succeed - but nothing is applied,
because no intent is issued (Task 3) and preflight still refuses (Task 2). If the prefix is wrong in
the other direction (double prefix, uppercase hex) `Identified()` stays false and behaviour is
byte-identical to today. Nobody outside the daemon log notices either way.
**Rollback:** revert the one expression. The lane returns to `binary-identity-missing`, which is the
current shipped state.

- [ ] Write `TestClaudeWiringSuppliesAPrefixedLauncherDigest` in
      `internal/daemon/ai_integrity_wiring_test.go`: build the wiring against a temp launcher file,
      assert `w.claude.Input.Launcher.Identified()` is true. RED today.
- [ ] Write `TestClaudeWiringLeavesDigestEmptyForAnUnreadableLauncher`: point the wiring at a path
      that does not exist, assert `PackagedDigest == ""` and `Identified()` is false. This is the
      guard the fix must not lose.
- [ ] Add a cross-package assertion in `providers/claude/projection_test.go`
      (`TestPackagedDigestFormatMatchesTheWiringProducer`) that the regex accepts exactly what the
      wiring produces, so the two packages cannot drift apart again silently.
- [ ] Make them green with the prefix expression.

**Defeat test:** `TestClaudeWiringSuppliesAPrefixedLauncherDigest` - revert
`ai_integrity_wiring.go` to `PackagedDigest: aiwire.HelperDigest(launcherPath)`, expect RED with
`launcher identity not established: Identified() = false`.
**Exit:** `go test ./internal/daemon -run TestClaudeWiring` green, and one recorded daemon sweep on a
real Windows box whose `SweepResult.Errors` contains **zero** entries beginning `compile:` for the
Claude provider (today: one per sweep per endpoint).

---

## Task 2: Probe the two Claude tiers that outrank the file tier

**Files:** `internal/airuntimeintegrity/providers/claude/sources.go` (Catalog :267-305),
`internal/airuntimeintegrity/providers/claude/provider.go` (`observe` :305-326,
`builtinSourceReader`), new `internal/airuntimeintegrity/providers/claude/tier_probe.go`,
`internal/airuntimeintegrity/providers/claude/preflight_test.go`

`SourcePolicyHelper` and `SourceMDM` are catalogued as managed-capable with no path and no reader, so
`fileTierUnproven` is permanently true. Resolve both **from observations already taken**, never by
assuming absence:

- `SourcePolicyHelper` is not a separate object at all - the helper is *configured by* a
  `policyHelper` key inside a managed settings source. Derive it from the already-read file tier and
  HKLM observation: `Probed=true`, `Present`/`NonEmpty` set from whether any observed managed source
  carries `policyHelper`. This is the same fact `helperActive` already reads at `preflight.go:418-425`
  - it is being computed from an unprobed row today.
- On Windows, MDM policy for this product is delivered through
  `HKLM\SOFTWARE\Policies\ClaudeCode`, which `registrySourceReader` already reads
  (`registry_windows.go:37-49`). Route `SourceMDM` through the same reader on Windows so it is
  `Probed=true`. On darwin the plist is a genuinely separate unread object: leave it `Probed=false`
  and let preflight keep refusing there. **Say that in the code, and do not pretend otherwise.**

**Blast radius:** This is the gate that currently makes the Claude machine lane inert, so getting it
wrong in the permissive direction is the most damaging error available in this wave: DeVoid would
write a machine drop-in on a box whose real authority is a policyHelper or Anthropic server-managed
source, that file would be discarded wholesale by first-non-empty-wins
(`sources.go:105-122`), and the console would then report `managed` over a control that changes
nothing. Getting it wrong in the strict direction preserves today's behaviour exactly.
**Rollback:** revert `tier_probe.go` and the two Catalog rows. `Probed=false` returns,
`fileTierUnproven` is true again, and preflight refuses - the shipped state.

- [ ] `TestPolicyHelperTierIsProbedFromTheManagedSourcesAlreadyRead` - a fixture with no
      `policyHelper` key anywhere: assert the `SourcePolicyHelper` observation is
      `Probed=true, Present=false`. RED today (`Probed=false`).
- [ ] `TestPolicyHelperTierReportsPresentWhenAManagedSourceCarriesTheKey` - a fixture whose HKLM
      value carries `policyHelper`: assert `Present && NonEmpty`, and assert `Preflight` refuses
      `DEVOID_AUTHORITY/MechanismManagedFile` with `ReasonMechanismConflictHelperPresent`.
- [ ] `TestMdmTierIsProbedThroughTheRegistryOnWindows` (build-tagged windows) and
      `TestMdmTierStaysUnprobedOnDarwin` - the honest asymmetry, asserted in both directions.
- [ ] `TestStaticCoexistenceMayWriteOnceBothTiersAreProbedAndAbsent` - the whole point: with both
      tiers probed-and-absent and no foreign file, `MayWrite` is true and `ReasonSlug` is `ok`.
- [ ] `TestStaticCoexistenceStillRefusesWhenAHigherTierIsNonEmpty` - the guard that must survive:
      a non-empty HKLM value keeps `MayWrite=false` with `ReasonFileTierSuppressed`.

**Defeat test:** `TestStaticCoexistenceStillRefusesWhenAHigherTierIsNonEmpty` - mutate
`tier_probe.go` to set `Present=false` unconditionally for the two rows, expect RED with
`MayWrite = true, want false (reason file-tier-suppressed)`.
**Exit:** on one real machine-scope Windows rig with Claude Code installed and no foreign managed
source, `Provider.Preflight()` returns `MayWrite=true, ReasonSlug=ok`; on a second rig with a
non-empty `HKLM\SOFTWARE\Policies\ClaudeCode\Settings` it returns `MayWrite=false,
ReasonSlug=file-tier-suppressed`. Both transcripts committed under
`internal/airuntimeintegrity/providers/claude/testdata/liveproof/`.

---

## Task 3: Observe which managed source Claude actually selected

**Files:** `internal/daemon/ai_integrity_wiring.go` (:300-317, assign `Status` and `Doctor`),
new `internal/daemon/ai_claude_status_probe.go`,
`internal/airuntimeintegrity/providers/claude/provider.go` (`inspectReason` :657-718)

`Provider.Status` and `Provider.Doctor` are declared seams with explicit docs - "the AUTHORITATIVE
answer to which managed source actually won ... nil -> the winning source rests on file inspection
alone, which InspectEffective reports as `effective-source-unverified`" (`provider.go:166-174`) -
and **the daemon assigns neither**. Wire both to `/status` and `claude doctor` on the exact detected
host. This is strategy §8.2's "verify `/status` reports the expected selected/merged source" and
§8.6's "the expected managed source is selected".

**Blast radius:** the probes execute the vendor binary. Two hazards, both already learned here:
(a) never execute a vendor binary from an elevated/SYSTEM context - `internal/codexmanaged`
already carries a structural test asserting its version reader imports neither `os/exec` nor
anything that can execute (SOT §5.3). Run these probes in the **user** context, from the existing
per-user reconcile task (`internal/aiwiretask/aiwiretask.go:144-211`), and hand the result to the
daemon; do not add an exec to the SYSTEM daemon. (b) a hung probe must not stall a sweep: bound it
and treat a timeout as unobserved, never as "the expected source won".
**Rollback:** set the two seams back to nil. `InspectEffective` returns to
`effective-source-unverified`, which is today's state and is not green.

- [ ] `TestClaudeStatusProbeRunsInTheUserContextNotTheDaemon` - a structural test in
      `internal/daemon` asserting the new file's exec call is reachable only from the user-task
      entry point, mirroring the Codex no-exec structural test.
- [ ] `TestInspectEffectiveStaysUnverifiedWhenTheStatusProbeTimesOut` - a probe that never returns
      inside its bound yields `effective-source-unverified`, not a winner.
- [ ] `TestInspectEffectiveNamesTheSelectedSourceWhenStatusAgrees` and
      `TestInspectEffectiveOpensDriftWhenStatusNamesADifferentSource` - the two real outcomes.
- [ ] `TestDoctorStrippedEntriesAreReportedNotSwallowed` - a `claude doctor` output listing a
      stripped managed key produces a named reason rather than a clean inspect.

**Defeat test:** `TestInspectEffectiveOpensDriftWhenStatusNamesADifferentSource` - revert
`ai_integrity_wiring.go` to leave `Status` nil, expect RED with
`ReasonSlug = effective-source-unverified, want effective-source-shadowed`.
**Exit:** one captured `/status` transcript per certified host (CLI, VS Code, desktop) in which the
selected managed source is named and matches the source DeVoid applied; and a `claude doctor`
transcript showing zero stripped DeVoid keys.

---

## Task 4: Pin the Claude transport route in the machine source

**Files:** `internal/airuntimeintegrity/providers/claude/projection.go` (`Compile` :359-475,
`validateCommon` :477-515), `internal/aihooks/transport_route.go` (unchanged - it stays as the
compatibility writer), `internal/airuntimeintegrity/providers/claude/projection_test.go`

`ProviderRoute` is validated and hashed but never rendered, so the route is asserted **only** in the
user-writable `~/.claude/settings.json`. Emit the route as an owned key in the machine projection
body - `env.ANTHROPIC_BASE_URL` - built from the same `aihooks.ProxyBaseURL()` constructor the user
writer uses, so the two can never disagree about the value. Keep the user-scope assertion: it is the
compatibility and pre-machine-lane path, and removing it would strand every unmanaged endpoint.

**Blast radius:** this is the highest-impact key in the wave for a developer's day. A wrong or
stale base URL routes an IDE at a dead port and the developer's Claude Code stops working. Three
existing guards must be preserved and asserted: the daemon refuses to write a route at all when it
is not itself healthy (SOT §5.2 - "writing a route to a dead port is a brick"); a nil health probe
counts as unhealthy; and uninstall removes the route only when the value is one DeVoid could have
written, so a developer's own base URL survives. The machine key changes the projection hash, so
every Claude target re-drifts once and re-applies once on the sweep after deploy - expected, and
visible as exactly one `MANAGED_CONFIG` repair per endpoint.
**Rollback:** stop emitting the key. The projection hash reverts, one more repair sweep runs, and
the route is back to user-scope only. The `RemoveOwned` path must be exercised in the same PR so the
rollback is not theoretical.

- [ ] `TestMachineProjectionPinsTheTransportRoute` - assert `Body["env"]["ANTHROPIC_BASE_URL"]`
      equals `aihooks.ProxyBaseURL()`. RED today (no `env` key at all).
- [ ] `TestMachineProjectionRouteMatchesTheUserScopeWriterExactly` - one assertion comparing the
      machine body's value against `aihooks.MergeWith`'s, so a future edit to either is caught.
- [ ] `TestCompileRefusesWhenTheDaemonWireIsNotHealthy` - the brick guard, at machine scope this
      time: an unhealthy wire yields a refusal slug, never a projection carrying a dead port.
- [ ] `TestRemoveOwnedStripsTheRouteAndLeavesForeignEnvEntries` - the rollback path, proven.

**Defeat test:** `TestCompileRefusesWhenTheDaemonWireIsNotHealthy` - remove the health guard from the
new emit branch, expect RED with `projection carries ANTHROPIC_BASE_URL while the wire proxy is
unhealthy`.
**Exit:** on a certified rig, deleting `~/.claude/settings.json` entirely and launching Claude Code
by absolute path still routes through the DeVoid proxy - proven by a decision recorded on the
transport-route counter (`internal/daemon/ai_transport_observation.go:60`), not by reading a file.

---

## Task 5: Wire the Claude adapter's machine and proof seams

**Files:** `internal/airuntime/adapters/registry.go` (:29-40), `internal/daemon/controls_attest.go`
(:117-125), `internal/airuntime/adapters/claudecode/claudecode_test.go`, new
`internal/airuntime/adapters/registry_test.go`

`Adapter.Machine` and `Adapter.Proof` are read but never assigned, so `ConfigSource` and
`DeploymentAssurance` are frozen at `user-settings` / `cooperative` fleet-wide. Add an options form -
`adapters.DefaultWith(opts)` carrying `ClaudeMachineLane claudecode.MachineLane` and
`ClaudeProof claudecode.ProofSource` - and keep `Default(launcher)` as a thin wrapper so the five
existing callers do not change. Populate the closures at `controls_attest.go:119` from the daemon's
`sharedIntegrityWiring`, which already holds the RA-4 provider.

**Blast radius:** this changes what the endpoint *reports*, not what it enforces. The risk is a
false upgrade: `MachineLaneStatus.Effective` must stay exactly as the provider defines it - "TRUE
only when a machine-owned DeVoid projection is the WINNING source and its re-read hash matches what
was applied. Anything less - shadowed, drifted, unproven - is false" (`machine_lane.go:66-71`). Never
derive `Effective` from "we wrote a file".
Server side: `deploymentAssurance` already exists on the heartbeat DTO
(`Backend/src/health/types/heartbeat.types.ts:697`), so no contract widens and the ordering rule is
not triggered by this task. If a later task adds a **new** key, see the ordering note in the wave
exit criteria.
**Rollback:** pass nil closures (or revert to `Default`). Reports return to
`user-settings`/`cooperative` - today's state, which is a downgrade, never a false green.

- [ ] `TestClaudeAdapterReportsManagedOnlyWhenTheMachineLaneIsEffective` - drive
      `Adapter.VerifyManagedControls` with an injected `MachineLane` returning `Effective=true` and
      assert `DeploymentAssurance == "managed"` and `ConfigSource == "managed-settings"`.
- [ ] `TestClaudeAdapterStaysCooperativeWhenTheMachineLaneIsShadowed` - `Effective=false` keeps
      `cooperative`. The guard that must not be lost.
- [ ] `TestDefaultRegistryLeavesTheClaudeMachineLaneNilByDefault` - `adapters.Default` must not
      invent a lane; only `DefaultWith` supplies one.
- [ ] `TestDaemonAttestationSuppliesTheClaudeMachineLane` in `internal/daemon` - the wiring
      assertion. RED today.

**Defeat test:** `TestDaemonAttestationSuppliesTheClaudeMachineLane` - revert
`controls_attest.go:119` to `adapters.Default("")`, expect RED with
`claude adapter Machine seam is nil; report would say cooperative`.
**Exit:** on a rig where the machine drop-in is the applied and winning source, the heartbeat's
Claude adapter row shows `deploymentAssurance: "managed"` and `configSource: "managed-settings"`;
on a rig with the drop-in deleted it shows `cooperative`/`user-settings` within one sweep.

---

## Task 6: Issue a Claude authority-mode intent by default

**Files:** `Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts` (:142-162),
`Backend/src/ai-policy-delivery/endpoint-policy-integrity-read.service.spec.ts`,
`Frontend/components/admin/ai-security-policy-section.tsx` (:1300-1339 advisory copy)

Change the shipped default from `claudeAuthorityModes: {}` to
`{ windows: 'STATIC_COEXISTENCE', wsl: 'STATIC_COEXISTENCE' }`. This is a **policy default**, not a
feature flag: the field already exists, already ships a default, and is already administrator-editable
in the console. An administrator who wants another authority still picks `EXTERNAL_ADMIN` or
`DEVOID_AUTHORITY`, and an empty entry keeps meaning "no opinion at this scope"
(`foldClaudeAuthorityModes`, `ai-runtime-integrity-policy.ts:225`).

**This is the riskiest task in the wave, and it must merge last.** It is the switch that turns
`C:\Program Files\ClaudeCode\managed-settings.d\<devoid>.json` writes on across the fleet, and the
file it writes carries `allowManagedHooksOnly: true` (`projection.go:375-378`, made mandatory by
`validateCommon:478-482`). On Claude, exactly as on Codex, that lock makes the machine hooks the only
hooks - so DeVoid's own **working** user-scope hooks in `~/.claude/settings.json` stop firing and the
endpoint's entire governance moves onto the machine hook set in one step. That is the CX-1/CX-5
failure shape replayed on the other vendor: pin `managed-only` beside a hook set that cannot
dispatch and the endpoint goes ungoverned while every surface reads green.

The mitigation that makes it safe is that `compileHooks` builds the managed block by calling
`aihooks.MergeWith` - literally the same code that writes the hooks working in production today
(`projection.go:517-530`), including the forward-slash command rule - and `validateCommon` refuses
without an absolute, digest-attested launcher (`:494-499`). But **an argument is not a measurement.**

**Blast radius:** every managed Windows/WSL endpoint with Claude Code installed. If the machine hook
set does not dispatch, prevention drops to zero on the CLI, the IDE and the desktop simultaneously,
and the adapter (after Task 5) will report `managed`. If the drop-in is malformed, Claude Code may
refuse keys or, in the `forceRemoteSettingsRefresh` case, refuse to start - which is why that key is
already triple-gated (`projection.go:285-317`) and must stay unset here.
**Rollback:** two moves, and both are needed. (1) Revert the default - new sweeps stop issuing the
intent, targets go back to discovered-but-unmanaged. (2) That alone leaves the applied file on disk,
so ship the withdrawal path in the same PR: setting the host's mode back to empty must drive the
provider's `RemoveOwned` and delete the DeVoid drop-in, restoring the user-scope hooks. Prove the
withdrawal before proving the rollout.

- [ ] `defaultRuntimeIntegrityConfig pins a Claude authority mode for each local host` in
      `ai-runtime-integrity-policy.spec.ts`. RED today.
- [ ] `buildIntentsForEndpoint emits a CLAUDE_MANAGED_SETTINGS intent for a default tenant` in
      `endpoint-policy-integrity-read.service.spec.ts`: a default config plus one Claude adapter
      report yields one intent and `unresolvedTargets === 0`. RED today (`unresolvedTargets === 1`).
- [ ] `buildIntentsForEndpoint still emits nothing when mode is off` - the guard.
- [ ] `clearing a host's authority mode withdraws the intent` - the rollback path, asserted on the
      server; and in Go, `TestRemoveOwnedDeletesTheDropInAndRestoresUserScopeHooks`.
- [ ] Update the console advisory copy so it stops asking about a value that now has a default, and
      instead names the mode in force.

**Defeat test:** `buildIntentsForEndpoint emits a CLAUDE_MANAGED_SETTINGS intent for a default
tenant` - revert `claudeAuthorityModes` to `{}`, expect RED with
`expected 1 intent, received 0 (unresolvedTargets: 1)`.
**Exit:** a named artefact, not a code state. **`.plans/9plus-20260828/evidence/claude-machine-hook-live.md`**
must exist and carry, from one real machine-scope Windows rig at the certified binary:
(1) `/status` naming the DeVoid drop-in as a selected managed source;
(2) a deny twin - a fixed harmless probe refused by the **machine** hook with
`~/.claude/settings.json` deleted, and the daemon log showing the decision;
(3) an allow twin on the same rig proving Claude Code still works normally.
Until all three exist this task does not merge, whatever the tests say. It is the same two-artefact
rule the Codex dialect table lives by, applied to the other vendor.

---

## Task 7: Measure `allowManagedPermissionRulesOnly` before writing it

**Files:** new `internal/airuntimeintegrity/providers/claude/testdata/vendorkeys/` corpus,
`internal/airuntimeintegrity/providers/claude/projection.go` (`ProjectionInput`, `Compile`),
`internal/airuntimeintegrity/providers/claude/projection_test.go`

Strategy §8.2 requires this lock so user/project sources cannot add weakening permission rules. The
key exists nowhere in this repository. Do **not** add it from documentation alone: that is exactly
the mistake `hookdialect.go:30-38` exists to prevent. Take two artefacts from the certified binary -
(1) the client reporting the key as accepted (`/status` or `claude doctor` showing it not stripped),
and (2) a behavioural twin in which a user-scope permission rule that would widen behaviour is
rejected while the managed rules still apply - then add the key with the artefacts committed beside
it, gated on a version floor the artefacts establish.

**Blast radius:** a permission lock that the installed version silently ignores buys nothing and, if
DeVoid then reports it as enforcing, manufactures assurance. A permission lock the version *does*
honour but which DeVoid mis-scopes can block a developer's legitimate project rules. Both directions
are why the artefacts come first.
**Rollback:** drop the key from `Compile`. One re-drift, one re-apply, the lock is gone.

- [ ] `TestPermissionRulesLockIsNotEmittedBelowItsMeasuredFloor` - written first, and it passes
      trivially today because the key is absent; it becomes the guard once the key lands.
- [ ] Capture artefact 1 and artefact 2; commit both under `testdata/vendorkeys/` with the binary
      sha256, the date and the exact command lines, in the style of
      `hookdialect.go:122-165`.
- [ ] `TestPermissionRulesLockIsEmittedAtAndAboveItsMeasuredFloor` - RED until the key lands.
- [ ] `TestPermissionRulesLockHasTwoCommittedVendorArtefacts` - a structural test that the version
      floor constant has a matching artefact directory, so a future widening cannot be a source
      reading.

**Defeat test:** `TestPermissionRulesLockHasTwoCommittedVendorArtefacts` - add a second version floor
with no artefact directory, expect RED with
`version floor 2.1.x has no committed vendor artefact; a floor may not be widened from source`.
**Exit:** either the key ships with two committed artefacts, or the task closes as
**declared-unsupported** with a row in the capability disposition table of Task 11 and a console line
saying so. Both are acceptable outcomes; silently shipping the key is not.

---

## Task 8: Stop the Codex adapter report from asserting managed authority

**Files:** `internal/codexmanaged/adapter_report.go` (:41, :47, :280-311),
`internal/codexmanaged/adapter_report_test.go`

Three hardcoded values must become derived facts, from data the `Report` already carries:

- `DeploymentAssurance` (:300): `managed` only when `Report.MachineHookLaneGoverns` is true
  (`verify.go:181`, set at `:340`) **and** the machine baseline is the winning requirements source;
  otherwise `cooperative`. Mirror the Claude rule at `claudecode/detect.go:260-265`.
- `ConfigSource` (:47, :288): name the source that actually won -
  `MACHINE_REQUIREMENTS` / `LEGACY_MANAGED_CONFIG` / `CLOUD_REQUIREMENTS` from the
  `EffectiveResult`'s winning source - instead of the frozen string naming the two user files.
- `Host` (:284): carry the observed host (`cli` / `ide` / `desktop`) rather than the literal `"cli"`.
  `ModeDesktop` already exists and is already expressed through `AttestedProfile`
  (`:405`), so the host is known where the string is written.

**Blast radius:** this is a **downgrade** for most of the fleet - endpoints that report `managed`
today will report `cooperative` tomorrow. That is the correct direction and it will change fleet
dashboards visibly; say so before it ships. The reverse risk is that a genuinely machine-governed
endpoint now reads `cooperative` because the derivation is too strict, which loses a true claim but
never manufactures a false one.
**Contract ordering:** `deploymentAssurance` and `configSource` already exist on the Backend
heartbeat shape (`Backend/src/health/types/heartbeat.types.ts:697`,
`Backend/src/ai-governance/runtime-adapter-shape.ts`), and the values are widened, not the keys - so
no new key crosses the wire and `AgentIngestValidationPipe`'s drop-unknown-keys behaviour is not
engaged. **Verify that before merging** by diffing the emitted JSON keys against the DTO; if a new
key does appear, the Backend ships and deploys first.
**Rollback:** restore the three constants. Reports go back to unconditional `managed` - which is the
overclaim, so rollback here is a knowingly worse state and should be a deploy-order decision, not a
reflex.

- [ ] `TestCodexReportIsCooperativeWhenNoMachineBaselineGoverns` - a report with
      `MachineHookLaneGoverns=false` yields `cooperative`. RED today.
- [ ] `TestCodexReportIsManagedOnlyWhenTheMachineLaneGoverns` - the true-claim direction.
- [ ] `TestCodexReportNamesTheWinningRequirementsSource` - `LEGACY_MANAGED_CONFIG` when a user file
      wins, `MACHINE_REQUIREMENTS` when the baseline does.
- [ ] `TestCodexReportNamesTheDesktopHost` - a desktop-mode report does not say `cli`.
- [ ] `TestCodexReportWireKeysAreUnchanged` - a golden key-set assertion, so this task cannot widen
      the contract by accident.

**Defeat test:** `TestCodexReportIsCooperativeWhenNoMachineBaselineGoverns` - restore
`DeploymentAssurance: deploymentAssuranceManaged` at `adapter_report.go:300`, expect RED with
`deploymentAssurance = "managed" over an endpoint with no governing machine hook lane`.
**Exit:** on a rig with `%ProgramData%\OpenAI\Codex\requirements.toml` deleted, the Codex adapter row
reports `cooperative` within one heartbeat; restoring the baseline returns it to `managed`. Both
heartbeat bodies captured.

---

## Task 9: Make a diverging higher-precedence Codex requirement remove green

**Files:** `internal/codexmanaged/machine_effective.go` (`Verdict()` :243-270),
`cmd/devoid/ai_codex_machine.go` (:356-362), `internal/codexmanaged/machine_effective_test.go`

`legacyRequirementFields` computes `DivergesFromDevoid` for five keys
(`machine_effective.go:721-730`, `:740-765`) and its only reader is an `[i]` print. Add the missing
clause to `Verdict()` beside the two that already exist at `:263-265`: a `LegacyRequirementField`
with `DivergesFromDevoid == true` is `VerdictFailed`. Scope it to divergence only - a legacy field
that **matches** the DeVoid pin is coexistence, not drift, and must stay green.

This is the concrete meaning of "user configuration is compatibility and observability, not the basis
of the prevention claim" for Codex: the user file still exists, is still read, and can still be
edited - it just can no longer sit above the machine baseline and leave the claim untouched.

**Blast radius:** endpoints whose users have edited `$CODEX_HOME/managed_config.toml` will flip from
compliant to failed and `devoid ai hooks-status codex` will start exiting non-zero. That is the
intent, but it will land as a support surge if the message is not actionable. The print at
`ai_codex_machine.go:356-362` must become the remediation line: name the key, the file, the observed
value and the pinned value. The false-red direction is a `valuesEqual` bug on path normalization
(`machine_effective.go:624-641`), so cover the Windows path-separator case explicitly.
**Rollback:** delete the clause. Verdict returns to today's, the `[i]` line stays, exit code returns
to zero.

- [ ] `TestVerdictFailsOnADivergingLegacyRequirementField` - a user `managed_config.toml` with
      `tools.web_search = true` yields `VerdictFailed`. RED today (`VerdictSurvived`).
- [ ] `TestVerdictSurvivesALegacyRequirementFieldThatMatchesThePin` - the defeat direction, and the
      one that stops this becoming a blanket red.
- [ ] `TestVerdictIsUnaffectedByALegacyFieldInAnUnreadableSource` - an unreadable source is
      `UNVERIFIABLE`, never `FAILED` on a value nobody read.
- [ ] `TestDivergingLegacyFieldPrintsTheObservedAndPinnedValues` - the operator can act on the line.

**Defeat test:** `TestVerdictFailsOnADivergingLegacyRequirementField` - remove the new clause from
`Verdict()`, expect RED with `Verdict() = SURVIVED, want FAILED (tools.web_search diverges in
LEGACY_MANAGED_CONFIG)`.
**Exit:** on a rig, editing `tools.web_search = true` in `$CODEX_HOME/managed_config.toml` makes
`devoid ai hooks-status codex` exit non-zero within one reconcile, and the endpoint's Codex coverage
row leaves full-loop on the next heartbeat.

---

## Task 10: Move the tool-path pins into the Codex machine source, key by key

**Files:** `internal/codexmanaged/machine_projection.go` (`RootBlock` :779-788, `TableBlock`
:806-872, `ownedPlan` :874-), `internal/codexmanaged/machine_effective.go` (obligation table
:449, `:728-729`), `internal/codexmanaged/testdata/scfg/managed/probes/` (new probe dirs),
`internal/codexmanaged/machine_schema_test.go`

Today the machine requirements file carries hooks and nothing else, by a stated restraint
(`machine_projection.go:17-30`): "silently widening the machine baseline with keys whose composition
semantics this build has not verified for the exact client version would manufacture assurance". That
restraint is correct and stays. What changes is that the restraint gets *discharged*, one key at a
time, against a real binary.

Order the keys by measured safety, and ship only what the probes clear:

| Key | Why it is a candidate | Known hazard |
|---|---|---|
| `tools.web_search` | R3; hosted WebSearch is not hook-covered, so config is the only control | none measured |
| `features.computer_use` | R4; the one feature DeVoid claims to govern | none measured |
| `sandbox_workspace_write.network_access` | R2 egress half | **no measured effect** - `requirements.go:408-421` records that `true` and `false` produce an identical `doctor --json` posture on 0.148.0-alpha.15. Do not claim it until a probe distinguishes them |
| `approval_policy` | R1 | pinning `never` makes `PermissionRequest` structurally unreachable (SOT §5.3). If it moves to machine scope, the unreachable-checkpoint claim moves with it and must be restated, not inherited |
| `sandbox_mode` | R2 filesystem half | **proven-live desktop brick** - `invalid value for sandbox_mode` hard-errors the ChatGPT/Codex desktop core (`merge.go:183-190`). Never write it into a source a desktop-present box reads, at any scope |

Add a probe directory per key under `testdata/scfg/managed/probes/`, in the existing shape
(`cmd.txt`, `home/`, `observed.txt`, `verdict.md`), showing the key accepted at machine scope and the
composed behaviour it produces. A key with no probe does not ship.

**Blast radius:** a requirements file Codex cannot parse does not weaken a restriction - it stops
Codex starting. `MachineProjection.Validate` is the last place that can say no, and it already
refuses on unsafe command characters and invalid marketplace sources (`machine_projection.go:474-482`);
extend it, do not bypass it. The desktop profile is the specific landmine: the same file is read by a
host that a full CLI profile bricks, and that has already happened once.
**Rollback:** per key. Each key is an independent entry in `ownedPlan`, so removing one re-renders
the file without it and the endpoint re-applies on the next sweep. Ship them as separate commits so
one can be reverted without the others.

- [ ] `TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` - a structural test walking the emitted
      key set against `testdata/scfg/managed/probes/`. Write this first; it is the rule.
- [ ] `TestMachineBaselineNeverWritesSandboxModeOnADesktopPresentEndpoint` - the brick guard.
- [ ] `TestMachineBaselinePinsWebSearchOff` / `...ComputerUseOff` - one per cleared key, RED until
      that key's probe and emit land.
- [ ] `TestEffectiveCompositionPrefersTheMachineSourceForAMovedKey` - after the move, the obligation's
      `WinningSource` is `MACHINE_REQUIREMENTS` when no higher source names the key.
- [ ] `TestNetworkAccessIsNotClaimedWhileItsEffectIsUndetermined` - the honest refusal, kept.

**Defeat test:** `TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` - add a key to `TableBlock`
without a probe directory, expect RED with
`emitted machine requirement key "tools.web_search" has no committed probe under testdata/scfg/managed/probes`.
**Exit:** a number - **at least two** of the five keys pinned at machine scope with committed probes,
`sandbox_mode` explicitly excluded with its brick evidence cited in the test, and
`network_access` explicitly excluded as undetermined. Plus: on a certified rig, deleting
`$CODEX_HOME/managed_config.toml` entirely does not change the composed status of any moved key.

---

## Task 11: Retire the cooperative trust-hash lane from the Codex certificate

**Files:** `internal/codexmanaged/hookdialect.go` (:166, :179), `internal/codexmanaged/verify.go`
(`Report` :162-181, `applyManagedOnlyOverlay` :701-800), `internal/codexmanaged/adapter_report.go`
(`configDerivedReport` :242-278), `internal/codexmanaged/nochurn.go` (:58, :96)

Strategy §9.2 asks for the trust-hash dependency to be replaced. **The replacement already exists**
and is already the stronger lane: managed hooks declared inline in the machine requirements file are
exempt from hook-trust (`canary_host.go:264-274`), and `machineHookLaneFor` already proves, per
checkpoint, that DeVoid's own dispatchable command is declared there
(`machine_hook_lane.go:92-141`). So this is a demotion, not a build:

- Keep `writerHookTrustDialect` writing unconditionally (`hookdialect.go:168-179`). Writing on an
  unrecognised build costs nothing and might work; withholding guarantees it never does.
- **Freeze `knownHookTrustDialects`.** Add a structural test asserting each row has a committed
  two-artefact provenance block, so no future row can be added from a source reading or a semver
  guess. `0.149.0-alpha.4.1` - the owner's client and the desktop app's runtime - stays outside the
  table. **Widening the prefix to `0.14` is explicitly forbidden and is how this lane went silently
  dead the first time** (`hookdialect.go:106-115`, `:163-165`; SOT §16.1 C1).
- **Make full-loop coverage require the machine lane.** `configDerivedReport` currently grants
  `CoverageFullLoopGoverned` on R7+R8 being `installed` (`adapter_report.go:257-263`) - and after
  `applyManagedOnlyOverlay` those rows can be `installed` on the strength of the machine lane
  (good) *or* on the strength of the user-scope trust ledger (not good enough for 9+). Require the
  attribution slug: full-loop only when the rows carry
  `ReasonUserHooksSupersededByMachineLane` or `ReasonHookCheckpointsCarriedByMachineLane`
  (`verify.go:820-824`). A cooperative endpoint drops to
  `CoveragePartialNativeGovernance` - accurate, and it is the honest report of an unmanaged box.

**Blast radius:** every unmanaged / user-scope Codex endpoint loses its full-loop claim. That is the
5.5 score being told the truth. The failure direction is a machine-governed endpoint that does *not*
carry the attribution slug because the overlay did not run - which `managedOnlyOverlayAdmits`
(`verify.go:873-882`) already handles for the `dialect-unverified` case; cover the
`userHookLaneSuppressionUnknown` case explicitly so an unreadable baseline does not silently
downgrade a working endpoint to partial.
**Rollback:** restore the R7+R8-only condition in `configDerivedReport`. Coverage returns to today's
more generous claim.

- [ ] `TestFullLoopRequiresTheMachineLaneAttribution` - R7/R8 `installed` with no attribution slug
      yields `partial-native-governance`. RED today.
- [ ] `TestFullLoopIsGrantedOnTheMachineLaneAttribution` - both slugs accepted.
- [ ] `TestEveryDialectRowHasATwoArtefactProvenanceBlock` - the freeze.
- [ ] `TestDialectTableRejectsAWidenedPrefix` - a row with prefix `0.14.` fails the structural test
      by name.
- [ ] `TestUnknownSuppressionWithAGoverningMachineLaneStaysFullLoop` - the false-red guard.

**Defeat test:** `TestDialectTableRejectsAWidenedPrefix` - change `hookTrustDialect147.minorPrefixes`
to `[]string{"0.14."}`, expect RED with
`dialect row codex-hooktrust-0.147 spans unmeasured families 0.145, 0.146, 0.148, 0.149`.
**Exit:** a number - Codex full-loop coverage is reported by **zero** endpoints whose checkpoints are
not carried by the machine lane, measured over one fleet heartbeat window; and the dialect table
still has exactly two rows.

---

## Task 12: Declare a disposition for every Codex capability the hook path does not cover

**Files:** new `internal/codexmanaged/capability_disposition.go` and
`capability_disposition_test.go`, `internal/codexmanaged/verify.go` (`Report`),
`internal/codexmanaged/adapter_report.go` (wire), `cmd/devoid/ai_codex_machine.go`,
`Backend/src/ai-governance/runtime-adapter-shape.ts`,
`Backend/src/health/types/heartbeat.types.ts`,
`Frontend/components/admin/ai-security-policy-section.tsx`

Strategy §9.4 names capabilities that the local function-tool hook path does not cover. Against the
real code, here is what exists and what each must become. Every row takes exactly one of four
dispositions - **disabled by managed requirement**, **governed by another proven control**,
**lower assurance profile**, **declared unsupported** - and the console shows the choice.

| Capability | What exists today | Proposed disposition |
|---|---|---|
| Hosted WebSearch | `tools.web_search = false` in the **user** file only (`merge.go:116`); named in `machine_projection.go:39-40` as not hook-covered | **disabled by managed requirement** once Task 10 moves the key to machine scope |
| Computer use | `features.computer_use = false`, user file only (`merge.go:119`) | **disabled by managed requirement** (Task 10) |
| SDK hooks / force-enabled plugin hooks | already inventoried - `hookPathKeys` (`machine_effective.go:632-637`), reported through `UnconstrainedHookPaths` (`:482`) and already failing the verdict (`:263`) | **governed** (inventoried + fails green); keep |
| MCP servers | DeVoid's own audit MCP is pinned (`merge.go:167-169`); third-party MCP is governed by the separate MCP verdict path | **governed by another proven control**; name it explicitly rather than implying the hook covers it |
| Marketplace / plugin sources | machine `[marketplaces.allowed_sources.*]` is rendered (`machine_projection.go:850-870`) and `codexMarketplaceGovernance` exists on the Backend | **governed by managed requirement** |
| Follow-up input to an approved unified-exec session | **nothing** in the tree models it | **declared unsupported** in the first certified profile, with the reason: a re-used approved session may not re-enter `PreToolUse`, and DeVoid has no measurement either way |
| Browser / apps surfaces | **nothing** | **declared unsupported** |
| `PostToolUse` feedback | modelled and correct - `Gating: false` in the frozen event table (`hookset.go:94`), and the closed-world oracle already returns `RESTRICT_CAPABILITY` rather than `DENY` at post-tool | **governed, non-preventive**; the row must say so and must never be counted as prevention |
| Permission profiles | absent from the tree | **declared unsupported** pending artefacts (see below) |
| `elevated` Windows sandbox | absent from the tree | **declared unsupported** pending artefacts (see below) |
| `PermissionRequest` checkpoint | declared gating but structurally unreachable under `approval_policy = "never"` (SOT §5.3; `requirements.go` records the gate is constant-true) | **declared unreachable under the current pin**, stated on the row rather than counted as a gating checkpoint |

**Blast radius:** this adds keys to the adapter report and therefore to the wire. **This is the task
that triggers the ordering landmine.** `AgentIngestValidationPipe` drops unknown keys silently
rather than 400ing (SOT §14.7), so an agent released before the Backend accepts the new field loses
the data with no error and the console shows nothing - it looks like it worked. **Backend ships and
is deployed first; the agent release follows.** No exception.
The product risk is the opposite of a false green: several capabilities move from unmentioned to
explicitly unsupported, which is a visible reduction in the claim. That is the point.
**Rollback:** stop emitting the field; the console falls back to not showing the table. The Backend
column is additive and nullable, so it can stay.

- [ ] Backend first: `runtime-adapter-shape.ts` accepts `capabilityDispositions`, with a spec
      asserting an unknown disposition value is rejected rather than coerced.
      `TestUnknownDispositionIsRejected`.
- [ ] `TestEveryCodexCapabilityHasExactlyOneDisposition` in Go - a structural test over the closed
      table; a capability with no row, or two rows, fails.
- [ ] `TestDispositionTableCoversEveryCheckpointInTheFrozenEventTable` - ties the table to
      `managedHookEvents` (`hookset.go:91-97`) so a new checkpoint cannot be added without a
      disposition.
- [ ] `TestUnsupportedCapabilitiesAreNeverCountedAsGoverned` - the roll-up must not fold an
      `unsupported` row into a coverage numerator.
- [ ] Console: render the table under the Codex posture, with the disposition wording verbatim from
      the closed slug set (no free prose).

**Defeat test:** `TestEveryCodexCapabilityHasExactlyOneDisposition` - delete the
`unified-exec-followup` row, expect RED with
`capability "unified-exec-followup" has no declared disposition; "Codex hooks healthy" is not "all Codex capabilities governed"`.
**Exit:** a named artefact - the rendered capability table on the console for one real endpoint,
with every row carrying one of the four dispositions and **zero** rows blank. Plus a number: the
count of capabilities declared unsupported is stated on the fleet view, not hidden.

---

## Task 13: Split the single managed seal into a capability posture

**Files:** `internal/airuntimeintegrity/state.go` (`persistedSeal` :158-163),
`internal/airuntimeintegrity/local_disablement.go` (:44-62),
`cmd/devoid/ai_local_bypass.go` (:40-51), `cmd/devoid/agent_shim.go` (:599, :609)

Workstream 5 asks for the single managed/cooperative boolean to become a capability posture -
"managed policy source active; machine hook active; provider egress forced; service identity valid;
certificate fresh; canary fresh; user broker ready" - so that each behaviour depends on the
capability it needs rather than on one seal whose absence flips five behaviours at once.

Do this additively and narrowly:

- Add optional capability fields to `persistedSeal`. `ManagedEndpoint()` keeps reading
  `signedRequired` and keeps its exact current answer for an old seal - **byte-compatible**, so a
  mixed fleet during rollout behaves identically.
- Move exactly **two** of the five consumers onto the capability they actually need:
  the provider-route override (`agent_shim.go:599`) onto `providerRouteAuthoritative`, and the
  bypass-flag strip (`:609`) onto `machineHookActive`. Both are *strengthening* behaviours - they add
  a control, they never refuse the launch.
- **Leave `agent_shim.go:520` on the existing boolean.** That is the refuse-to-launch branch. A
  fail-closed checkpoint on an unprovable condition bricked a machine in July 2026 and the operator
  removed the agent; an uninstalled control protects nobody. This branch does not move until the
  capability that would replace it is proven on a real endpoint, and that proof is not in this wave.
  Say so on the line.

**Blast radius:** if a capability field is absent (old seal, partial rollout) the two moved consumers
must fall back to the existing boolean, or a managed endpoint silently stops overriding a user-set
route. That fallback is the whole safety property and it is what the tests are for.
**Rollback:** the fields are additive and the fallback is the current behaviour, so reverting the two
consumers restores today's semantics with no seal migration.

- [ ] `TestOldSealWithoutCapabilitiesAnswersExactlyAsBefore` - a seal written by 7.10.6 produces
      identical answers at all five sites.
- [ ] `TestRouteOverrideUsesTheRouteCapabilityWhenPresent` and
      `TestRouteOverrideFallsBackToTheSealWhenTheCapabilityIsAbsent` - the two halves.
- [ ] `TestRefuseToLaunchStillReadsTheSealOnly` - a structural test asserting `agent_shim.go:520` has
      no capability dependency. This is a guard against a future well-meaning refactor.
- [ ] `TestMissingSealStillMakesEveryBranchCooperative` - SOT §13.3 preserved.

**Defeat test:** `TestRouteOverrideFallsBackToTheSealWhenTheCapabilityIsAbsent` - remove the fallback
so the capability defaults to false, expect RED with
`managed endpoint did not override a user-set provider route (capability absent, seal says managed)`.
**Exit:** a number - five `managedEndpoint()` call sites before, three after, and zero change in
behaviour on a seal written by the previous agent version, proven by running the 7.10.6 seal fixture
through all five sites.

---

## Wave exit criteria

Each is measurable and names the defeat test that keeps it honest.

1. **The Claude machine lane can compile.** Zero `compile:` errors for the Claude provider in one
   daemon sweep on a real rig. Defeat: `TestClaudeWiringSuppliesAPrefixedLauncherDigest` (Task 1).
2. **The Claude file tier is provable.** `Preflight` returns `MayWrite=true, ReasonSlug=ok` on a
   clean Windows rig and `MayWrite=false, ReasonSlug=file-tier-suppressed` on a rig with a non-empty
   HKLM policy value. Defeat: `TestStaticCoexistenceStillRefusesWhenAHigherTierIsNonEmpty` (Task 2).
3. **Claude names its selected source from the client, not from a file read.** One `/status`
   transcript per certified host. Defeat:
   `TestInspectEffectiveOpensDriftWhenStatusNamesADifferentSource` (Task 3).
4. **The Claude route survives deletion of the user file.** With `~/.claude/settings.json` deleted
   and Claude Code launched by absolute path, the transport-route counter records a decision. Defeat:
   `TestCompileRefusesWhenTheDaemonWireIsNotHealthy` (Task 4).
5. **The Claude report tells the truth about its authority.** `managed`/`managed-settings` with the
   drop-in winning; `cooperative`/`user-settings` with it deleted; transition within one sweep.
   Defeat: `TestDaemonAttestationSuppliesTheClaudeMachineLane` (Task 5).
6. **A live machine-hook deny twin exists for Claude.**
   `.plans/9plus-20260828/evidence/claude-machine-hook-live.md` carries all three artefacts, and the
   allow twin proves the runtime still works. Defeat:
   `buildIntentsForEndpoint emits a CLAUDE_MANAGED_SETTINGS intent for a default tenant` (Task 6).
7. **The Codex report cannot assert managed authority it does not have.** Zero endpoints report
   `deploymentAssurance: managed` without a governing machine hook lane. Defeat:
   `TestCodexReportIsCooperativeWhenNoMachineBaselineGoverns` (Task 8).
8. **A user edit to the higher-precedence Codex file removes green.** `hooks-status codex` exits
   non-zero within one reconcile of a diverging `tools.web_search`. Defeat:
   `TestVerdictFailsOnADivergingLegacyRequirementField` (Task 9).
9. **At least two tool-path pins are authoritative at machine scope**, each with a committed probe,
   and deleting `$CODEX_HOME/managed_config.toml` does not change their composed status. Defeat:
   `TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` (Task 10).
10. **No Codex certificate rests on the cooperative trust hash**, and the dialect table still has
    exactly two rows. Defeat: `TestDialectTableRejectsAWidenedPrefix` (Task 11).
11. **Every Codex capability carries exactly one declared disposition**, rendered on the console,
    zero blank rows. Defeat: `TestEveryCodexCapabilityHasExactlyOneDisposition` (Task 12).
12. **The seal split changes nothing on an old seal.** Five call sites become three; the 7.10.6 seal
    fixture produces identical answers at all five. Defeat:
    `TestRefuseToLaunchStillReadsTheSealOnly` (Task 13).

### Merge and deploy order, which is not negotiable

- Tasks 1, 2, 3, 4, 5 land in that order. Each is inert without the one before it, which is what
  makes the sequence safe: nothing is applied until Task 6.
- **Task 12 widens the wire.** Backend merges and **is deployed** before the agent release that
  emits the new field. `AgentIngestValidationPipe` drops unknown keys silently, so the reverse order
  produces no error, no data, and a console that looks correct. Task 8 must be checked against this
  rule too: it is believed to widen values only, not keys, and that belief is a test
  (`TestCodexReportWireKeysAreUnchanged`), not an assumption.
- **Task 6 merges last in the wave**, and only once its named evidence artefact exists.
- Deploying any of this needs a fresh, explicit ask from the owner. A green local `ci/lib/run.mjs`
  run is not permission, and 68 of the Installers `finding-b-e2e.yml` legs cannot run in Docker at
  all - report which gates ran and which could not.

---

## What this wave deliberately does NOT do

- **It does not force provider egress at the OS layer.** WFP/ALE direct-egress denial is strategy
  Workstream 4 and Phase 2's other half. Without it, Task 4's route pin is still configuration, and
  the §8.6/§9.7 exit gates ("direct egress is denied") remain unmet. This wave makes the route
  *authoritative*; it does not make it *unavoidable*.
- **It does not fix the fail-open that makes a hook worth less than it looks.** The 4-second daemon
  budget and the 6-in-10 leak are Wave 1. On Codex the arithmetic is worse - a timeout, a crash or a
  non-zero exit all fail open (`machine_projection.go:116-120`), so no configured hook can support an
  enforcement claim on its own. Both scorecard rows are capped by that until Wave 1 lands.
- **It does not add Codex permission profiles or the `elevated` Windows sandbox.** Both are genuinely
  absent from the tree, and both are vendor features whose exact keys, enum values and per-host
  behaviour DeVoid has never measured. Adding them from documentation is the defect class
  `hookdialect.go` exists to prevent, and `sandbox_mode` in particular has already bricked the
  desktop host once. They are declared unsupported in Task 12's table until two artefacts per key
  exist. **This is an external blocker on the vendor's binary, not engineering work we are skipping.**
- **It does not widen the Codex dialect pin to cover 0.149.** The owner's own client and the desktop
  app's runtime stay outside the table. The way out is another live measurement on that exact binary,
  never a wider prefix. Task 11 makes this structurally enforced rather than a convention.
- **It does not move the refuse-to-launch branch onto a capability.** `agent_shim.go:520` is the
  fail-closed branch, and a fail-closed checkpoint on an unprovable condition bricked a machine in
  July 2026. It stays on the existing seal until the replacing capability is proven live.
- **It does not fix the uppercase-extension dispatch gap.** `CLAUDE.EXE` normalises to `claude.exe`,
  matches no dispatch branch, and is handed to the real binary with no surface gate, no shim, no
  transport injection and no bypass-flag strip (`cmd/devoid/main.go:242-247`, `:203`, `:222`,
  `:4778-4781`). It is a bypass-resistance defect, it belongs to that wave, and it is named here only
  so nobody reads "machine authority" as covering it.
- **It does not claim anything against production.** No control in this product has been observed
  against the production authority chain (SOT §15). Every live-proof artefact this wave names is a
  local-rig measurement, and it must be labelled as one. Converging these against production signing,
  policy and evidence is Phase 5.
- **It does not make the canary green.** No receipt sink implementation exists outside tests
  (SOT §16.1 C9), so the machine-hook deny twins named in Tasks 6 and 11 are frozen artefacts, not a
  continuous canary. Phase 3 owns that, and until it lands "Prevention Active" cannot be earned by
  this wave's work alone.
