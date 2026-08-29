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

# Wave 4 - Make the machine-managed vendor source authoritative

**Scorecard rows this moves:** Claude interception coverage 7.5 -> 9.4; Codex interception coverage
5.5 -> **capped below 9.3** (strategy §12). The Codex cap is not a scheduling problem: permission
profiles and the `elevated` Windows sandbox mode are absent from the tree and both need two vendor
artefacts per key that we do not have. Task 12 declares them unsupported rather than pretending.
Per RECONCILIATION.md §6 ("Targets engineering alone cannot reach").
**Depends on:** Wave 1 (local inline decision core / real service boundary). A machine hook that
reaches a busy daemon still fails open on both vendors, so an authoritative hook lane is only worth
its score once the decision is reachable. Nothing in this wave depends on the egress wave, but the
§8.6/§9.7 exit gates are not fully met until it lands.
**Phase:** 2 (strategy §11 - "Make vendor controls authoritative and provider egress forced")

All file:line references below were read at the origin/main commits named in the brief and
re-confirmed on 2026-08-28: Installers `5b129523`, Backend `0cf9021e`, Frontend `cac574ae`.
**The local Installers checkout is at `8e49a625`, 1010 commits behind origin/main, and does not
contain `internal/codexmanaged` or `internal/airuntimeintegrity` at all.** Read the code with
`git show origin/main:<path>` or from a worktree of `origin/main`; a plain `ls` in the workspace
checkout will mislead you exactly as it misled the first pass of this wave.

**Authority for the corrections in this file:** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/RECONCILIATION.md`
(§1 C8, §3 O2 + the programme-level rule + ordering items 9 and 10, §4 R3 and R7, §6). Where this
file and another wave disagree, the reconciliation has already decided. Do not re-litigate it.

---

## How an agent executes this wave

You will be handed **one task** from this file. You will not see the rest of it. Everything you need
is inside your task block. These five rules apply to every task and are not repeated in each one.

1. **Work in a git worktree under `C:/cwt/`.** Never edit the workspace checkout at
   `C:/Users/Owner/Documents/Ceragon/<Repo>` — it is ~1010 commits (Installers), ~773 (Backend),
   ~525 (Frontend) behind `origin/main`, other sessions have uncommitted work in it, and for
   Installers the packages this wave edits do not exist there. Create your worktree from
   `origin/main` after a fetch:
   `git -C C:/Users/Owner/Documents/Ceragon/Installers fetch origin && git -C ... worktree add C:/cwt/w4-tN -b w4/tN-<slug> origin/main`.

2. **NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared repo-wide across
   every worktree. A `git stash pop` in your worktree can silently steal and destroy another
   concurrent session's in-progress work. This has happened twice in one day here. If you need a
   clean tree, commit to your own branch instead.

3. **Commit each task the moment it is green — never batch.** One campaign here lost days of work to
   a crash and three API outages; only committed work survived. A task with a passing defeat test and
   no commit is a task that has not happened.

4. **`git add` explicit paths. Never `git add -A` or `git add .`.** The workspace root carries
   unrelated uncommitted work, scratch directories, and `.patch` files from other agents. `-A` sweeps
   them into your commit.

5. **A green test you cannot make RED has not run.** Paste both runs — the mutation failing, the fix
   passing. Five inert-test shapes have shipped GREEN on this codebase while defending nothing:
   - **Source-text assertions** (`readFileSync` + `toContain` / `grep` the source). Satisfiable by
     pasting the asserted code inside a comment.
   - **Hand-built struct literals compared to hand-built struct literals.** Cannot notice the real
     deliverable was deleted.
   - **Defending ONE branch of a multi-branch route.** Check Codex *and* Claude, install *and*
     uninstall, stored row *and* rendered console. One route here turned out to have three branches
     (runs / suppressed / unknown) and the third was the broken one.
   - **Exercising only KNOWN members of a closed set.** Cannot tell a fail-safe allowlist from a
     fail-open denylist. Feed it something genuinely unknown and see which way it fails.
   - **A test whose PRECONDITION silently skips the assertion.** If a test has a precondition,
     assert it loudly.

**If a precondition in your task fails, STOP AND REPORT.** Do not substitute a nearby line number, a
similarly-named symbol, a local-checkout reading, or "the obvious equivalent". This codebase has a
documented history of agents inventing plausible replacements that compiled, passed CI, and shipped
a dead lane.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

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
  missing/tampered branches (`configDerivedReport` at `:242-278`). `ConfigSource` is the frozen
  string `"managed_config.toml+config.toml"` (`:47`) - the two **user-writable** files - even on an
  endpoint whose real authority is the machine requirements file. `Host` is the literal `"cli"`
  (`:284`) on a desktop or IDE endpoint. Compare the Claude adapter, which does the honest thing at
  `claudecode/detect.go:242-265`.
- **The pins that actually govern tool paths live only in a user-writable file.**
  `approval_policy` (`merge.go:106`), `sandbox_mode` (`:107`),
  `sandbox_workspace_write.network_access` (`:113`), `tools.web_search` (`:116`),
  `features.computer_use` (`:119`), the provider route and the audit MCP server (`:167-169`) are
  written to `$CODEX_HOME/managed_config.toml` (`internal/codexmanaged/merge.go:100-173`), and on a
  desktop-present box only the route survives (`DesktopManagedConfigBytes`, `merge.go:183-200`; the
  sandbox pin is a proven-live desktop brick, `merge.go:183-190`). The machine requirements file
  carries none of them.
- **That user file outranks the machine file.** `RequirementsPrecedence` is frozen
  highest-to-lowest as `CLOUD_REQUIREMENTS`, `LEGACY_MANAGED_CONFIG`, `MACHINE_REQUIREMENTS`
  (`internal/codexmanaged/machine.go:191-195`), and `machine.go:184-187` says so in place: DeVoid's
  baseline is "the LOWEST-precedence of the three".
- **A divergence in that higher-precedence user file changes nothing.**
  `legacyRequirementFields` computes `DivergesFromDevoid` per key
  (`machine_effective.go:732-765`; the field at `:147-149`; the pinned-key table `legacyRequirementSpecs` at `:721-730`), it
  is populated at `:483`, and its **only** consumer in the whole repository is an `[i]` line on a CLI
  (`cmd/devoid/ai_codex_machine.go:356-362`). `EffectiveResult.Verdict()` fails on
  `UnconstrainedHookPaths` and `UserAuthoredManagedHookSources` (`machine_effective.go:263-265`) and
  **has no clause for `LegacyRequirementFields`**. A user setting `tools.web_search = true` in their
  own `managed_config.toml` produces no downgrade, no non-zero exit, and nothing off-box.
- **The trust-hash dialect table is two rows and the owner's own client is outside both.**
  `knownHookTrustDialects = []hookTrustDialect{hookTrustDialect144, hookTrustDialect147}`
  (`hookdialect.go:166`; rows at `:100-104` and `:111-115`), `hookTrustDialectFor` answers no for
  everything else (`:186-197`). 0.145, 0.146, 0.148 and `0.149.0-alpha.4.1` - the Codex desktop app's
  own runtime, and the owner's client - are unresolvable, and the file says so in place at
  `:163-165`. **Widening the pin without two vendor artefacts per family is forbidden by prior
  decision**, stated at `hookdialect.go:30-38` and in SOT §16.1 C1. It is how the firewall went
  silently dead the first time.
- **Genuinely absent:** Codex permission profiles and the `elevated` Windows sandbox mode. Neither
  string appears anywhere in the Installers tree (`git grep permission_profile`, `git grep '"elevated"'`
  over origin/main return nothing relevant). Also absent: any enumeration of hosted/specialized Codex
  tool paths. The only "uncovered path" inventory that exists is `hookPathKeys`
  (`machine_effective.go:643-655`), which covers SDK hooks and force-enabled plugins - four keys,
  not the §9.4 list.

### The one seal that flips five behaviours

`ManagedEndpoint(stateDir)` is a single boolean read of `seal.json`'s `signedRequired`
(`internal/airuntimeintegrity/local_disablement.go:50-56`; the persisted shape is
`persistedSeal` at `state.go:158-163`). Five consumers read it through `managedEndpoint()`
(`cmd/devoid/ai_local_bypass.go:40`): refuse-to-launch on an unreachable daemon
(`cmd/devoid/agent_shim.go:520`), override a user-set provider route (`:599`), strip vendor bypass
flags (`:609`), and two more installed at CLI start-up (`ai_local_bypass.go:56-57`). A missing seal
turns all five cooperative at once. That is SOT §13.3, verified.

### Where the wire boundary actually is

Three tasks in this wave touch what the endpoint reports. The DTO is **not** the gate:
`RuntimeAdapterReportDto` in `Backend/src/health/types/heartbeat.types.ts` carries
`deploymentAssurance?: string` at `:697` and `configSource?: string` at `:481`, but its own docblock
at `:599-618` states that **none of its decorators ever execute** - `EndpointControlsDto.runtimeAdapters`
is typed `unknown[]` with no `@ValidateNested`. **The enforcing boundary is the field-by-field rebuild
in `Backend/src/ai-governance/runtime-adapter-shape.ts`** (`normalizeRuntimeAdapters` ->
`normalizeRuntimeAdapterReport`): `configSource` is rebuilt through `boundedString` at `:625-626`,
and `deploymentAssurance` is routed through `splitEndpointDeploymentAssuranceReport` at `:1317-1319`,
which narrows it to `ENDPOINT_AUTHORABLE_ASSURANCE_TIERS = ['cooperative', 'managed']`
(`endpoint-authored-assurance.ts:64-66`). **Any key that rebuild does not name is dropped in silence.**

---

## Task 1: Make the Claude machine projection compilable

**Files:** `internal/daemon/ai_integrity_wiring.go` (:302-311),
`internal/daemon/ai_integrity_wiring_test.go` (new case),
`internal/airuntimeintegrity/providers/claude/projection_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t1 -b w4/t1-claude-digest origin/main && cd C:/cwt/w4-t1

grep -n "PackagedDigest: aiwire.HelperDigest(launcherPath)" internal/daemon/ai_integrity_wiring.go
#   MUST print exactly one line, numbered 305

grep -n "digestRE = regexp.MustCompile" internal/airuntimeintegrity/providers/claude/projection.go
#   MUST print line 128 with `^sha256:[0-9a-f]{64}$`

grep -n "return hex.EncodeToString(sum\[:\])" internal/aiwire/machine_codex.go
#   MUST print line 170 - HelperDigest returns BARE hex, no prefix

go build ./...
#   MUST exit 0 before you change anything
```

If `git rev-parse origin/main` prints anything else, the brief's SHA has moved: STOP AND REPORT,
do not re-verify the citations yourself and proceed. If a grep prints a different line number, the
file has changed under this plan: STOP AND REPORT the line it actually printed.

### LANDMINES

- **Never weaken an existing guard to make the task fit.** `digestRE` is the contract that keeps a
  truncated, uppercase, or foreign string out of a binary identity. Widening it to accept bare hex
  would make every wrongly-formatted value in the tree "valid". If a guard blocks the task, the task
  is wrong.
- An empty digest is a **deliberate refusal**, not a bug: `HelperDigest` returns `""` when the file
  cannot be read, and `Identified()` must stay false for that case. Do not paper over an unreadable
  launcher by substituting a placeholder digest, the path string, or a zero-hash.
- `HelperDigest` is also used for `HookCommandDigest` at `ai_integrity_wiring.go:298`, which feeds a
  **different** consumer with a different format contract. Change the Claude `PackagedDigest`
  expression only. Do not change `HelperDigest` itself.
- This task writes **no new file anywhere under the DeVoid machine root**. If you find yourself
  wanting to cache a digest to disk, stop: writing any new entry under the machine root requires the
  SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624`,
  or the next MSI operation dies at `inspectRootEntries` (`:1086`,
  `machine root contains unknown entry`) with 1722 -> 1603, rolling back the upgrade on every
  ENROLLED endpoint while every clean-box test stays green. That has happened three times:
  `.staging`, `aitrust`, `endpoint-identity.json`.

### DO NOT

- Do not edit `digestRE` or `sha256RE` in `projection.go`.
- Do not edit `aiwire.HelperDigest`.
- Do not delete or `t.Skip` any existing test in `internal/daemon` or `providers/claude` to get a
  green run.
- Do not set `SignerSubjectHash` to make `Identified()` true by another route.

### The change

Set `PackagedDigest: "sha256:" + aiwire.HelperDigest(launcherPath)` **only when the digest is
non-empty**, and leave it `""` otherwise.

### Steps

- [ ] Write `TestClaudeWiringSuppliesAPrefixedLauncherDigest` in
      `internal/daemon/ai_integrity_wiring_test.go`: build the wiring against a temp launcher file,
      assert `w.claude.Input.Launcher.Identified()` is true. RED today.
- [ ] Write `TestClaudeWiringLeavesDigestEmptyForAnUnreadableLauncher`: point the wiring at a path
      that does not exist, assert `PackagedDigest == ""` and `Identified()` is false. This is the
      guard the fix must not lose. Assert the precondition loudly - fail the test if the temp path
      unexpectedly exists, so it cannot silently skip.
- [ ] Add a cross-package assertion in `providers/claude/projection_test.go`
      (`TestPackagedDigestFormatMatchesTheWiringProducer`) that the regex accepts exactly what the
      wiring produces, so the two packages cannot drift apart again silently. Feed it one genuinely
      malformed value (uppercase hex, and a double `sha256:sha256:` prefix) and assert it is
      rejected - a test that only exercises the good member cannot tell a guard from a no-op.
- [ ] Make them green with the prefix expression.

### DEFEAT TEST

```
Mutate:  internal/daemon/ai_integrity_wiring.go:305 - replace
         `PackagedDigest: prefixedHelperDigest(launcherPath),`
         with `PackagedDigest: aiwire.HelperDigest(launcherPath),`
Run:     cd C:/cwt/w4-t1 && go test ./internal/daemon -run TestClaudeWiringSuppliesAPrefixedLauncherDigest -count=1
Expect:  exit code 1, output contains: launcher identity not established: Identified() = false
Restore: git -C C:/cwt/w4-t1 checkout -- internal/daemon/ai_integrity_wiring.go
```

### BLAST RADIUS

Today the Claude provider's `Compile` fails for every endpoint and the error is swallowed into
`SweepResult.Errors`. After this fix `Compile` can succeed - but nothing is applied, because no
intent is issued (Task 6) and preflight still refuses (Task 2). If the prefix is wrong in the other
direction (double prefix, uppercase hex) `Identified()` stays false and behaviour is byte-identical
to today. Nobody outside the daemon log notices either way. No wire key changes, so no Backend
ordering constraint applies.

### ROLLBACK

Revert the one expression. The lane returns to `binary-identity-missing`, which is the current
shipped state.

### EXIT

A command and a number. `cd C:/cwt/w4-t1 && go test ./internal/daemon -run TestClaudeWiring -count=1`
exits 0 with 2 tests run; **and** one recorded daemon sweep on a real Windows rig whose
`SweepResult.Errors` contains **zero** entries beginning `compile:` for the Claude provider (today:
one per sweep per endpoint). Commit the sweep transcript under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t1-sweep.md`.

---

## Task 2: Probe the two Claude tiers that outrank the file tier

**Files:** `internal/airuntimeintegrity/providers/claude/sources.go` (Catalog :267-305),
`internal/airuntimeintegrity/providers/claude/provider.go` (`observe` :305-326,
`builtinSourceReader`), new `internal/airuntimeintegrity/providers/claude/tier_probe.go`,
`internal/airuntimeintegrity/providers/claude/preflight_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t2 -b w4/t2-tier-probe origin/main && cd C:/cwt/w4-t2

sed -n '279,280p' internal/airuntimeintegrity/providers/claude/sources.go
#   MUST print:
#     add(SourcePolicyHelper, ri.AuthorityPolicyHelper, ri.ScopeMachine, "", true, true)
#     add(SourceMDM, ri.AuthorityMDM, ri.ScopeMachine, "", true, true)

grep -n "func fileTierUnproven" internal/airuntimeintegrity/providers/claude/preflight.go
#   MUST print line 376

grep -n 'const policyKeyPath = ' internal/airuntimeintegrity/providers/claude/registry_windows.go
#   MUST print line 28 with `SOFTWARE\Policies\ClaudeCode`

git grep -n "claude.ExtraSources" -- ':!*_test.go'
#   MUST print NOTHING - the daemon never assigns ExtraSources. If it prints a line,
#   the premise of this task is stale: STOP AND REPORT.

go test ./internal/airuntimeintegrity/... -count=1
#   MUST exit 0 before you change anything - record the pass count
```

### LANDMINES

- **This is the gate that currently makes the Claude machine lane inert.** Getting it wrong in the
  permissive direction is the most damaging error available in this wave: DeVoid writes a machine
  drop-in on a box whose real authority is a policyHelper or an Anthropic server-managed source, that
  file is discarded wholesale by first-non-empty-wins (`sources.go:105-122`), and the console then
  reports `managed` over a control that changes nothing.
- **`Probed=true` is a claim about a READ, not about an absence.** `fileTierUnproven`'s own comment
  (`preflight.go:372-375`) says "an unexamined MDM or remote source is not a proof of absence".
  Setting `Probed=true` on a row nothing actually read is manufacturing the proof this gate exists to
  demand. Derive both rows **from observations already taken** - never from "we looked and there was
  nothing to look at".
- On darwin the MDM plist is a genuinely separate unread object. Leave it `Probed=false`, let
  preflight keep refusing there, and **say that in the code**. A fail-closed refusal on a platform we
  cannot read is correct; inventing a pass is the failure that bricked a machine in July 2026 in the
  other direction.
- Do not add any new file under the DeVoid machine root. Writing any new entry there requires the
  SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624`
  or the next MSI operation dies with 1722 -> 1603 and rolls back the upgrade on every ENROLLED
  endpoint while every clean-box test stays green (`.staging`, `aitrust`, `endpoint-identity.json`).
  Probe fixtures belong in `testdata/`.

### DO NOT

- Do not change `fileTierUnproven`, `blockingForeignFile`, or the `Rank` values in the catalogue.
- Do not remove the `ManagedCapable`/`Supported` flags from either row to sidestep the gate.
- Do not make `SourceRemoteManaged` (`sources.go:281`, `ManagedCapable=false`) probed as part of this
  task - it is a different tier with a different answer.
- Do not delete or skip an existing preflight test.

### The change

- `SourcePolicyHelper` is not a separate object at all - the helper is *configured by* a
  `policyHelper` key inside a managed settings source. Derive it from the already-read file tier and
  HKLM observation: `Probed=true`, `Present`/`NonEmpty` set from whether any observed managed source
  carries `policyHelper`. This is the same fact `helperActive` already reads at `preflight.go:418-425`
  - it is being computed from an unprobed row today.
- On Windows, MDM policy for this product is delivered through
  `HKLM\SOFTWARE\Policies\ClaudeCode`, which `registrySourceReader` already reads
  (`registry_windows.go:37-49`). Route `SourceMDM` through the same reader on Windows so it is
  `Probed=true`. On darwin leave it `Probed=false` with the reason stated in a comment.

### Steps

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
- [ ] `TestUnreadableRegistryStaysUnprobed` - feed the reader a genuinely unknown failure (permission
      denied, not "key absent") and assert it yields `Probed=false`, not `Probed=true, Present=false`.
      This is the fail-safe-vs-fail-open distinction; without it the closed-set shape applies.

### DEFEAT TEST

```
Mutate:  internal/airuntimeintegrity/providers/claude/tier_probe.go - in the function that
         builds the two rows, set `Present: false, NonEmpty: false` unconditionally.
Run:     cd C:/cwt/w4-t2 && go test ./internal/airuntimeintegrity/providers/claude \
           -run TestStaticCoexistenceStillRefusesWhenAHigherTierIsNonEmpty -count=1
Expect:  exit code 1, output contains: MayWrite = true, want false (reason file-tier-suppressed)
Restore: git -C C:/cwt/w4-t2 checkout -- internal/airuntimeintegrity/providers/claude/tier_probe.go
```

### BLAST RADIUS

See the first landmine. Getting it wrong in the strict direction preserves today's behaviour exactly
- the lane stays inert, which is the shipped state and is honest. No wire key changes.

### ROLLBACK

Revert `tier_probe.go` and the two Catalog rows. `Probed=false` returns, `fileTierUnproven` is true
again, and preflight refuses - the shipped state.

### EXIT

A named artefact plus two exact strings. On one real machine-scope Windows rig with Claude Code
installed and no foreign managed source, `Provider.Preflight()` returns `MayWrite=true,
ReasonSlug=ok`; on a second rig with a non-empty `HKLM\SOFTWARE\Policies\ClaudeCode\Settings` it
returns `MayWrite=false, ReasonSlug=file-tier-suppressed`. Both transcripts committed under
`internal/airuntimeintegrity/providers/claude/testdata/liveproof/`, each labelled a **local-rig
measurement** (no control in this product has been observed against the production authority chain).
Verify with: `ls internal/airuntimeintegrity/providers/claude/testdata/liveproof/ | wc -l` >= 2.

---

## Task 3: Observe which managed source Claude actually selected

**Files:** `internal/daemon/ai_integrity_wiring.go` (:300-317, assign `Status` and `Doctor`),
new `internal/daemon/ai_claude_status_probe.go`,
`internal/airuntimeintegrity/providers/claude/provider.go` (`inspectReason` :657-718)

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t3 -b w4/t3-status-probe origin/main && cd C:/cwt/w4-t3

sed -n '166,175p' internal/airuntimeintegrity/providers/claude/provider.go
#   MUST show the `Status StatusProbe` (:171) and `Doctor DoctorProbe` (:174) seams
#   with the docblock naming `effective-source-unverified`

grep -n "Status:\|Doctor:" internal/daemon/ai_integrity_wiring.go
#   MUST print NOTHING for the claude provider literal - the daemon assigns neither.
#   If it prints an assignment, this task is already done: STOP AND REPORT.

grep -n 'case "reconcile":' cmd/devoid/ai.go
#   MUST print line 75 - this is the USER-CONTEXT reconcile verb entry point

grep -n 'const TaskArguments = "ai reconcile"' internal/aiwiretask/aiwiretask.go
#   MUST print line 150 - the per-user scheduled task invokes that verb

# Task 1 must already be merged into your base. Confirm:
grep -n 'PackagedDigest' internal/daemon/ai_integrity_wiring.go
#   MUST show the "sha256:" prefix form. If it shows the bare HelperDigest call,
#   Task 1 has not landed: STOP AND REPORT - this task is inert without it.
```

### LANDMINES

- **Never execute a vendor binary from an elevated/SYSTEM context.** `internal/codexmanaged` already
  carries a structural test asserting its version reader imports neither `os/exec` nor anything that
  can execute (SOT §5.3). A SYSTEM process executing a user-writable vendor binary is a local
  privilege escalation. Run these probes in the **user** context, from the existing per-user reconcile
  verb (`cmd/devoid/ai.go:75`, invoked by the scheduled task at `aiwiretask.go:150`), and hand the
  result to the daemon.
- **A hung probe must not stall a sweep, and a timeout is not an answer.** Bound it, and treat a
  timeout as *unobserved* (`effective-source-unverified`), never as "the expected source won". A
  fail-closed or fail-green branch on a condition that cannot be proven at runtime bricked a machine
  in July 2026 and the operator uninstalled the agent - an uninstalled control protects nobody, and a
  fabricated green is worse than an honest unknown.
- **The probe result crosses a process boundary.** If you persist it, do **not** invent a new file
  under the DeVoid machine root: writing any new entry there requires the SAME COMMIT to add it to
  `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624`, or the next MSI operation
  dies at `inspectRootEntries` (`:1086`) with 1722 -> 1603 and rolls back the upgrade on every
  ENROLLED endpoint while every clean-box test stays green. This class has fired three times here
  (`.staging`, `aitrust`, `endpoint-identity.json`). Prefer the existing user-scope state directory
  or an in-process handoff; if a machine-root entry is genuinely unavoidable, the guard edit is part
  of this task's commit and its own test must cover it.
- Do not weaken `inspectReason`'s existing refusals to let a probe result through.

### DO NOT

- Do not add an `os/exec` import to any file reachable from the daemon's SYSTEM service entry point.
- Do not treat a non-zero exit from `claude doctor` as "no stripped keys".
- Do not cache a probe result past its bound and re-serve it as fresh.
- Do not delete the structural no-exec test in `internal/codexmanaged` "for consistency".

### The change

Wire `Provider.Status` and `Provider.Doctor` to `/status` and `claude doctor` on the exact detected
host, executed in the user context. This is strategy §8.2's "verify `/status` reports the expected
selected/merged source" and §8.6's "the expected managed source is selected".

### Steps

- [ ] `TestClaudeStatusProbeRunsInTheUserContextNotTheDaemon` - a structural test in
      `internal/daemon` asserting the new file's exec call is reachable only from the user-task
      entry point, mirroring the Codex no-exec structural test. Assert on the **import graph**, not
      on source text: a `readFileSync`+`toContain` shape here is satisfiable by a comment.
- [ ] `TestInspectEffectiveStaysUnverifiedWhenTheStatusProbeTimesOut` - a probe that never returns
      inside its bound yields `effective-source-unverified`, not a winner.
- [ ] `TestInspectEffectiveNamesTheSelectedSourceWhenStatusAgrees` and
      `TestInspectEffectiveOpensDriftWhenStatusNamesADifferentSource` - the two real outcomes.
- [ ] `TestInspectEffectiveOnAnUnparseableStatusPayload` - the third branch. Feed it a genuinely
      unknown shape (not empty, not valid) and assert it lands on unverified, never on a winner.
- [ ] `TestDoctorStrippedEntriesAreReportedNotSwallowed` - a `claude doctor` output listing a
      stripped managed key produces a named reason rather than a clean inspect.

### DEFEAT TEST

```
Mutate:  internal/daemon/ai_integrity_wiring.go - delete the `Status:` assignment from the
         claude provider literal (leave the seam nil, as it ships today).
Run:     cd C:/cwt/w4-t3 && go test ./internal/airuntimeintegrity/providers/claude \
           -run TestInspectEffectiveOpensDriftWhenStatusNamesADifferentSource -count=1
Expect:  exit code 1, output contains:
         ReasonSlug = effective-source-unverified, want effective-source-shadowed
Restore: git -C C:/cwt/w4-t3 checkout -- internal/daemon/ai_integrity_wiring.go
```

### BLAST RADIUS

The probes execute the vendor binary. Both hazards are named in the landmines. Beyond that this task
changes what the endpoint *knows*, not what it writes - nothing is applied until Task 6. No wire key
changes.

### ROLLBACK

Set the two seams back to nil. `InspectEffective` returns to `effective-source-unverified`, which is
today's state and is not green.

### EXIT

A named artefact. One captured `/status` transcript per certified host (CLI, VS Code, desktop) in
which the selected managed source is named and matches the source DeVoid applied; and a
`claude doctor` transcript showing zero stripped DeVoid keys. Committed under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t3-status-per-host/`, one file per host, each labelled a
local-rig measurement. Verify with: that directory contains exactly 3 files, and
`grep -c "stripped" .../doctor.txt` returns 0.

---

## Task 4: Pin the Claude transport route in the machine source

**Files:** `internal/airuntimeintegrity/providers/claude/projection.go` (`Compile` :359-475,
`validateCommon` :477-515), `internal/aihooks/transport_route.go` (unchanged - it stays as the
compatibility writer), `internal/airuntimeintegrity/providers/claude/projection_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t4 -b w4/t4-machine-route origin/main && cd C:/cwt/w4-t4

grep -n 'const transportEnvKey = "ANTHROPIC_BASE_URL"' internal/aihooks/transport_route.go
#   MUST print line 32

grep -n "^func ProxyBaseURL" internal/aihooks/transport_route.go
#   MUST print line 48 - this is the ONE constructor both writers must use

grep -n "ANTHROPIC_BASE_URL" internal/airuntimeintegrity/providers/claude/projection.go
#   MUST print NOTHING - the machine projection does not carry the route today.
#   If it prints a line, this task is already done: STOP AND REPORT.

grep -n "func (s \*Server) recordTransportRouteDecision" internal/daemon/ai_transport_observation.go
#   MUST print line 60 - the counter the EXIT criterion reads

# Tasks 1-3 must be in your base (each is inert without its predecessor).
```

**Cross-wave precondition (RECONCILIATION §1 C8, ordering item 9).** Wave 3 Task 3 measures a
route-precedence matrix and encodes it as the golden fixture behind `EffectiveRouteSource`. Its
matrix covers **four** scopes (process env / user settings / project settings / project-local
settings). This task adds a **fifth**: machine managed-settings. Before merging, confirm W3 Task 3
has landed and been **re-measured at five sources / 25 cells**. If W3 T3's fixture is still 4x2,
STOP AND REPORT: after this task `EffectiveRouteSource` is asked a question its fixture cannot
answer, and W3's doctor row either falls to `unverified` everywhere or reports `routed (user scope)`
on a box whose real winner is the machine file.

### LANDMINES

- **This is the highest-impact key in the wave for a developer's day.** A wrong or stale base URL
  routes an IDE at a dead port and the developer's Claude Code stops working. Three existing guards
  must be preserved and asserted:
  1. the daemon refuses to write a route at all when it is not itself healthy (SOT §5.2 - "writing a
     route to a dead port is a brick");
  2. a **nil** health probe counts as unhealthy, not as healthy-by-default;
  3. uninstall removes the route only when the value is one DeVoid could have written, so a
     developer's own base URL survives.
- **Keep the user-scope assertion.** `internal/aihooks/transport_route.go` is the compatibility and
  pre-machine-lane path; removing it strands every unmanaged endpoint. This task adds a second
  writer, it does not replace the first.
- Both writers must build the value from the **same** `aihooks.ProxyBaseURL()` constructor. Two
  constructors is how the two files come to disagree and nobody notices until an endpoint is routed
  at a port that moved.
- A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026
  and the operator uninstalled the agent. Here the fail-closed direction is *refusing to emit the
  key* when health is unproven - that is correct and must stay. Do not invert it into "emit anyway
  and hope".

### DO NOT

- Do not remove or weaken the health guard to make a test pass.
- Do not make `ProviderRoute`'s existing hash row or validation gate conditional on the new emit.
- Do not delete the user-scope writer or its tests.
- Do not set `forceRemoteSettingsRefresh` - it is triple-gated at `projection.go:283-317` and stays
  unset in this wave (see Task 6's landmines).

### The change

Emit the route as an owned key in the machine projection body - `env.ANTHROPIC_BASE_URL` - built
from `aihooks.ProxyBaseURL()`.

### Steps

- [ ] `TestMachineProjectionPinsTheTransportRoute` - assert `Body["env"]["ANTHROPIC_BASE_URL"]`
      equals `aihooks.ProxyBaseURL()`. RED today (no `env` key at all).
- [ ] `TestMachineProjectionRouteMatchesTheUserScopeWriterExactly` - one assertion comparing the
      machine body's value against `aihooks.MergeWith`'s, so a future edit to either is caught.
      Compare **produced values**, not two hand-written literals.
- [ ] `TestCompileRefusesWhenTheDaemonWireIsNotHealthy` - the brick guard, at machine scope this
      time: an unhealthy wire yields a refusal slug, never a projection carrying a dead port.
- [ ] `TestCompileRefusesWhenTheHealthProbeIsNil` - the third branch. nil is not healthy.
- [ ] `TestRemoveOwnedStripsTheRouteAndLeavesForeignEnvEntries` - the rollback path, proven, with a
      foreign `env` entry present so the test can tell a targeted strip from a wholesale delete.

### DEFEAT TEST

```
Mutate:  internal/airuntimeintegrity/providers/claude/projection.go - in the new emit branch,
         delete the `if !in.WireHealthy { ... }` guard so the key is emitted unconditionally.
Run:     cd C:/cwt/w4-t4 && go test ./internal/airuntimeintegrity/providers/claude \
           -run TestCompileRefusesWhenTheDaemonWireIsNotHealthy -count=1
Expect:  exit code 1, output contains:
         projection carries ANTHROPIC_BASE_URL while the wire proxy is unhealthy
Restore: git -C C:/cwt/w4-t4 checkout -- internal/airuntimeintegrity/providers/claude/projection.go
```

### BLAST RADIUS

See the first landmine. The machine key changes the projection hash, so every Claude target re-drifts
once and re-applies once on the sweep after deploy - expected, and visible as exactly one
`MANAGED_CONFIG` repair per endpoint. Nothing is applied at all until Task 6 turns the intent on.
No wire key changes. Downstream: W3 Task 3's route-precedence fixture must already be five-source
(see cross-wave precondition).

### ROLLBACK

Stop emitting the key. The projection hash reverts, one more repair sweep runs, and the route is back
to user-scope only. **The `RemoveOwned` path must be exercised in the same PR so the rollback is not
theoretical** - `TestRemoveOwnedStripsTheRouteAndLeavesForeignEnvEntries` is that proof.

### EXIT

A recorded counter, not a file read. On a certified rig, deleting `~/.claude/settings.json` entirely
and launching Claude Code by absolute path still routes through the DeVoid proxy, proven by a
decision recorded through `recordTransportRouteDecision`
(`internal/daemon/ai_transport_observation.go:60`) and read back from
`GET /v1/ai/transport-observation`. Command: with the user file deleted, run one Claude Code turn,
then `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:<daemonPort>/v1/ai/transport-observation`
and confirm the `claude-code` provider entry's count incremented by >= 1. Transcript committed under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t4-route-survives-user-file-deletion.md`, labelled a local-rig
measurement.

---

## Task 5: Wire the Claude adapter's machine and proof seams

**Files:** `internal/airuntime/adapters/registry.go` (:29-40), `internal/daemon/controls_attest.go`
(:117-125), `internal/airuntime/adapters/claudecode/claudecode_test.go`, new
`internal/airuntime/adapters/registry_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t5 -b w4/t5-adapter-seams origin/main && cd C:/cwt/w4-t5

grep -n "r.Register(claudecode.New(launcher))" internal/airuntime/adapters/registry.go
#   MUST print line 31 - no Machine/Proof seam supplied

grep -n 'adapters.Default("")' internal/daemon/controls_attest.go
#   MUST print line 119

sed -n '66,71p' internal/airuntime/adapters/claudecode/machine_lane.go
#   MUST show the Effective docblock: "TRUE only when a machine-owned DeVoid projection is
#   the WINNING source and its re-read hash matches what was applied"

git grep -n "adapters.Default(" origin/main -- ':!*_test.go' | grep -v "^origin/main:internal/aiwire/aiwire.go:11:"
#   MUST print exactly FIVE real call sites (the sixth hit is a doc comment at
#   internal/aiwire/aiwire.go:11 and is excluded above):
#     cmd/devoid/ai_codex_hooks.go:116
#     cmd/devoid/ai_hook_runner.go:46
#     internal/aiwire/aiwire.go:472
#     internal/daemon/ai_event_certification.go:19
#     internal/daemon/controls_attest.go:119
#   If the count differs, STOP AND REPORT - `Default` must stay a thin wrapper for all of them.
```

Backend-side precondition (this task must NOT widen the wire):

```bash
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin
git rev-parse origin/main   # MUST print 0cf9021e944b72ef2a3024e8687f4114db1f2468
git show origin/main:src/ai-governance/endpoint-authored-assurance.ts | sed -n '64,68p'
#   MUST show ENDPOINT_AUTHORABLE_ASSURANCE_TIERS = ['cooperative', 'managed']
git show origin/main:src/ai-governance/runtime-adapter-shape.ts | grep -n "boundedString(src.configSource"
#   MUST print a line near 625 - configSource is rebuilt, free-form, bounded
```

### LANDMINES

- **This changes what the endpoint reports, not what it enforces. The risk is a false upgrade.**
  `MachineLaneStatus.Effective` must stay exactly as the provider defines it at
  `machine_lane.go:66-71`: "TRUE only when a machine-owned DeVoid projection is the WINNING source
  and its re-read hash matches what was applied. Anything less - shadowed, drifted, unproven - is
  false." **Never derive `Effective` from "we wrote a file".**
- **The DTO is not the gate.** `heartbeat.types.ts:697` carries `deploymentAssurance?: string` but
  its docblock at `:599-618` states none of that class's decorators ever execute. The enforcing
  boundary is `Backend/src/ai-governance/runtime-adapter-shape.ts`
  (`normalizeRuntimeAdapters` -> `normalizeRuntimeAdapterReport`), and **any key it does not name is
  dropped in silence**. `deploymentAssurance` and `configSource` are both already named there, and
  both values this task produces (`managed`/`cooperative`, `managed-settings`/`user-settings`) are
  already accepted - so no contract widens and no Backend deploy ordering is triggered. **That is a
  test, not an assumption** (`TestClaudeAdapterWireKeysAreUnchanged` below).
- **Widening an agent-wire contract requires the Backend deployed FIRST.**
  `AgentIngestValidationPipe` DROPS unknown keys rather than rejecting them, so the reverse order
  loses fields silently: no error, no data, and a console that looks correct. If your diff adds any
  key to the emitted adapter report, this task stops being safe to ship alone - STOP AND REPORT
  rather than shipping it.

### DO NOT

- Do not change the five existing `adapters.Default(launcher)` call sites' behaviour; add
  `DefaultWith(opts)` and keep `Default` as a thin wrapper.
- Do not make `adapters.Default` invent a machine lane.
- Do not add any key to `airuntime.RuntimeAdapterReport`.
- Do not relax `Effective` to "a projection was applied".

### The change

Add an options form - `adapters.DefaultWith(opts)` carrying `ClaudeMachineLane claudecode.MachineLane`
and `ClaudeProof claudecode.ProofSource` - and keep `Default(launcher)` as a thin wrapper so the five
existing callers do not change. Populate the closures at `controls_attest.go:119` from the daemon's
`sharedIntegrityWiring`, which already holds the RA-4 provider.

### Steps

- [ ] `TestClaudeAdapterReportsManagedOnlyWhenTheMachineLaneIsEffective` - drive
      `Adapter.VerifyManagedControls` with an injected `MachineLane` returning `Effective=true` and
      assert `DeploymentAssurance == "managed"` and `ConfigSource == "managed-settings"`.
- [ ] `TestClaudeAdapterStaysCooperativeWhenTheMachineLaneIsShadowed` - `Effective=false` keeps
      `cooperative`. The guard that must not be lost.
- [ ] `TestClaudeAdapterStaysCooperativeWhenTheMachineLaneErrors` - the third branch. An erroring or
      nil lane is `cooperative`, never `managed`.
- [ ] `TestDefaultRegistryLeavesTheClaudeMachineLaneNilByDefault` - `adapters.Default` must not
      invent a lane; only `DefaultWith` supplies one.
- [ ] `TestDaemonAttestationSuppliesTheClaudeMachineLane` in `internal/daemon` - the wiring
      assertion. RED today.
- [ ] `TestClaudeAdapterWireKeysAreUnchanged` - a golden key-set assertion over the marshalled
      report, so this task cannot widen the contract by accident.

### DEFEAT TEST

```
Mutate:  internal/daemon/controls_attest.go:119 - replace the DefaultWith(...) call with
         `reg := adapters.Default("")`
Run:     cd C:/cwt/w4-t5 && go test ./internal/daemon -run TestDaemonAttestationSuppliesTheClaudeMachineLane -count=1
Expect:  exit code 1, output contains:
         claude adapter Machine seam is nil; report would say cooperative
Restore: git -C C:/cwt/w4-t5 checkout -- internal/daemon/controls_attest.go
```

### BLAST RADIUS

Report-only. The failure direction that matters is a false upgrade (see landmine 1). The downgrade
direction - a genuinely machine-governed endpoint reading `cooperative` - loses a true claim but
never manufactures a false one. No new wire key; the values are already accepted by
`runtime-adapter-shape.ts`, proven by `TestClaudeAdapterWireKeysAreUnchanged` and by the Backend
precondition above.

### ROLLBACK

Pass nil closures (or revert to `Default`). Reports return to `user-settings`/`cooperative` - today's
state, which is a downgrade, never a false green.

### EXIT

Two captured heartbeat bodies. On a rig where the machine drop-in is the applied and winning source,
the heartbeat's Claude adapter row shows `deploymentAssurance: "managed"` and
`configSource: "managed-settings"`; on the same rig with the drop-in deleted it shows
`cooperative`/`user-settings` within one sweep. Both bodies committed under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t5-heartbeat-managed.json` and `...-cooperative.json`. Verify:
`jq -r '.controls.runtimeAdapters[] | select(.adapterId=="claude-code") | .deploymentAssurance'`
returns `managed` on the first and `cooperative` on the second.

---

## Task 6: Issue a Claude authority-mode intent by default

**Files:** `Backend/src/ai-security-policy/ai-runtime-integrity-policy.ts` (:142-162),
`Backend/src/ai-policy-delivery/endpoint-policy-integrity-read.service.spec.ts`,
`Frontend/components/admin/ai-security-policy-section.tsx` (:1300-1339 advisory copy)

> **This is the riskiest task in the wave. It merges LAST, and it merges only when the withdrawal
> proof and the rollout proof both exist. See MERGE GATE below - it is a gate, not a bullet.**

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin
git rev-parse origin/main   # MUST print 0cf9021e944b72ef2a3024e8687f4114db1f2468
git worktree add C:/cwt/w4-t6-be -b w4/t6-claude-default origin/main && cd C:/cwt/w4-t6-be

grep -n "claudeAuthorityModes: {}," src/ai-security-policy/ai-runtime-integrity-policy.ts
#   MUST print line 150 - the shipped default is empty

grep -n "foldClaudeAuthorityModes" src/ai-security-policy/ai-runtime-integrity-policy.ts
#   MUST print a line near 225 - an empty entry means "no opinion at this scope"

sed -n '460,475p' src/ai-policy-delivery/endpoint-policy-integrity-read.service.ts
#   MUST show targetShapeForProvider returning
#   { projectionKind: 'CLAUDE_MANAGED_SETTINGS', authoritySourceKind: 'MACHINE_FILE' }
#   for STATIC_COEXISTENCE, and `null` for a null mode

cd C:/Users/Owner/Documents/Ceragon/Frontend && git fetch origin
git rev-parse origin/main   # MUST print cac574ae063b4e91ec38ddb205ec5abe4cbc3dff
git show origin/main:components/admin/ai-security-policy-section.tsx | sed -n '1322,1339p'
#   MUST show runtimeIntegrityAdvisories pushing the "no authority mode is pinned" advisory

cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git show origin/main:internal/airuntimeintegrity/providers/claude/projection.go | sed -n '376,378p'
#   MUST show owned["allowManagedHooksOnly"] = true
```

**Predecessor gate.** Tasks 1, 2, 3, 4 and 5 must all be merged. Each is inert without the one
before it, and that sequence is what makes this task's flip survivable. If any is missing, STOP AND
REPORT - do not flip the default over a lane that cannot compile, cannot pass preflight, cannot name
its selected source, or cannot report honestly.

### LANDMINES

- **The file this default turns on carries `allowManagedHooksOnly: true`** (`projection.go:376`,
  made mandatory by `validateCommon:478-482`). On Claude, exactly as on Codex, that lock makes the
  machine hooks the **only** hooks - so DeVoid's own **working** user-scope hooks in
  `~/.claude/settings.json` stop firing and the endpoint's entire governance moves onto the machine
  hook set in one step. That is the CX-1/CX-5 failure shape replayed on the other vendor: pin
  `managed-only` beside a hook set that cannot dispatch and the endpoint goes ungoverned while every
  surface reads green.
- **The obvious rollback leaves every endpoint UNGOVERNED.** Reverting the default alone stops new
  intents but leaves the applied drop-in on disk, still carrying `allowManagedHooksOnly: true`, with
  user-scope hooks still suppressed. Both halves are required. This is why the withdrawal path ships
  in the same PR and is proven **before** the rollout (RECONCILIATION §4 R3).
- **`forceRemoteSettingsRefresh` must stay unset.** A malformed drop-in can make Claude Code refuse
  keys or, in the `forceRemoteSettingsRefresh` case, refuse to start. That key is already triple-gated
  at `projection.go:283-317` and this task does not touch it.
- **An argument is not a measurement.** The mitigation that makes this safe is that `compileHooks`
  builds the managed block by calling `aihooks.MergeWith` - literally the same code that writes the
  hooks working in production today (`projection.go:517-530`), including the forward-slash command
  rule - and `validateCommon` refuses without an absolute, digest-attested launcher (`:494-499`).
  That is a good argument. It does not substitute for the deny twin in the EXIT criterion.
- **This is a policy default, not a feature flag.** The field already exists, already ships a
  default, and is already administrator-editable in the console. An administrator who wants another
  authority still picks `EXTERNAL_ADMIN` or `DEVOID_AUTHORITY`, and an empty entry keeps meaning "no
  opinion at this scope". Do not add an environment switch, a rollout percentage, or an off-by-default
  gate - this programme ships ON.

### DO NOT

- Do not merge this task before Tasks 1-5.
- Do not merge it on green tests alone. See MERGE GATE.
- Do not set `forceRemoteSettingsRefresh`.
- Do not remove or disable the user-scope hook writer as "now redundant" - it is the fallback the
  withdrawal path restores to.
- Do not turn this into a flag, a percentage rollout, or an opt-in.
- Do not ship the rollout commit without the withdrawal commit in the same PR.

### The change

Change the shipped default from `claudeAuthorityModes: {}` to
`{ windows: 'STATIC_COEXISTENCE', wsl: 'STATIC_COEXISTENCE' }`, and ship the withdrawal path
(clearing a host's mode drives `RemoveOwned`, deletes the DeVoid drop-in, and restores user-scope
hooks) in the same PR.

### Steps

- [ ] **Withdrawal first.** `clearing a host's authority mode withdraws the intent` in
      `endpoint-policy-integrity-read.service.spec.ts`; and in Go,
      `TestRemoveOwnedDeletesTheDropInAndRestoresUserScopeHooks`.
- [ ] `defaultRuntimeIntegrityConfig pins a Claude authority mode for each local host` in
      `ai-runtime-integrity-policy.spec.ts`. RED today.
- [ ] `buildIntentsForEndpoint emits a CLAUDE_MANAGED_SETTINGS intent for a default tenant` in
      `endpoint-policy-integrity-read.service.spec.ts`: a default config plus one Claude adapter
      report yields one intent and `unresolvedTargets === 0`. RED today (`unresolvedTargets === 1`).
- [ ] `buildIntentsForEndpoint still emits nothing when mode is off` - the guard.
- [ ] `buildIntentsForEndpoint still emits nothing for a non-targeted host` - the third branch.
- [ ] Update the console advisory copy (`ai-security-policy-section.tsx:1322-1339`) so it stops
      asking about a value that now has a default, and instead names the mode in force.

### DEFEAT TEST

```
Mutate:  src/ai-security-policy/ai-runtime-integrity-policy.ts:150 - restore
         `claudeAuthorityModes: {},`
Run:     cd C:/cwt/w4-t6-be && npx jest ai-policy-delivery/endpoint-policy-integrity-read.service.spec.ts \
           -t "emits a CLAUDE_MANAGED_SETTINGS intent for a default tenant"
Expect:  exit code 1, output contains:
         expected 1 intent, received 0 (unresolvedTargets: 1)
Restore: git -C C:/cwt/w4-t6-be checkout -- src/ai-security-policy/ai-runtime-integrity-policy.ts
```

Second defeat test, for the half that makes rollback real:

```
Mutate:  remove the RemoveOwned call from the withdrawal branch
Run:     cd C:/cwt/w4-t6 && go test ./internal/airuntimeintegrity/providers/claude \
           -run TestRemoveOwnedDeletesTheDropInAndRestoresUserScopeHooks -count=1
Expect:  exit code 1, output contains:
         drop-in still present after withdrawal; allowManagedHooksOnly still true and user-scope hooks remain suppressed
Restore: git -C C:/cwt/w4-t6 checkout -- <the withdrawal file>
```

### BLAST RADIUS

Every managed Windows/WSL endpoint with Claude Code installed. If the machine hook set does not
dispatch, prevention drops to zero on the CLI, the IDE and the desktop simultaneously, and the
adapter (after Task 5) reports `managed`. If the drop-in is malformed, Claude Code may refuse keys.
This is the largest fleet-wide behaviour change in the whole eight-wave plan (RECONCILIATION §4 R3).

### ROLLBACK - and the MERGE GATE it produces

Rollback is **two moves and both are required**:

1. Revert the default. New sweeps stop issuing the intent; targets go back to
   discovered-but-unmanaged.
2. Drive `RemoveOwned` to delete the applied DeVoid drop-in and restore the user-scope hooks.
   **Without this, step 1 leaves the file on disk with `allowManagedHooksOnly: true` and user-scope
   hooks still suppressed - the obvious rollback of the riskiest task in the plan leaves every
   endpoint UNGOVERNED.**

**MERGE GATE (RECONCILIATION §4 R3 - elevated from a bullet by decision).** This task does not merge
until **all four** artefacts below exist in
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-machine-hook-live.md`, and the **withdrawal artefact (0) is
captured and pasted BEFORE the three rollout artefacts**. "Prove the withdrawal before proving the
rollout" is a gate on the merge, not advice.

### EXIT

A named artefact: **`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-machine-hook-live.md`** must exist and
carry, from one real machine-scope Windows rig at the certified binary, in this order:

0. **The withdrawal, proven first.** With the drop-in applied and user-scope hooks suppressed,
   clearing the host's authority mode deletes the DeVoid drop-in and the endpoint returns to
   enforcing through `~/.claude/settings.json` within one sweep - shown by a decision recorded in the
   daemon log through the **user-scope** hook after the withdrawal. An endpoint that is governed
   before and governed after, with the machine file gone in between.
1. `/status` naming the DeVoid drop-in as a selected managed source.
2. A **deny twin** - a fixed harmless probe refused by the **machine** hook with
   `~/.claude/settings.json` deleted, and the daemon log showing the decision.
3. An **allow twin** on the same rig proving Claude Code still works normally.

**The gate must not be forgeable by the agent it gates.** Counting headings in a markdown file the
implementing agent wrote proves only that the agent can write four headings. This is the largest
fleet-wide behaviour change in the programme; its merge gate has to read something the agent cannot
author. So the evidence file is the *index*, and the gate verifies the *artefacts it points at*:

```bash
EV=C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-machine-hook-live.md
test -f "$EV" || { echo "no evidence file"; exit 1; }

# 1. The drop-in as the CLIENT actually read it back, not as we intended to write it.
#    The digest is computed on the rig, from disk, after Claude Code has started.
grep -oE 'dropInSha256=[0-9a-f]{64}' "$EV" | cut -d= -f2 > /tmp/claimed.sha
certutil -hashfile "<rig>/managed-settings.d/<devoid>.json" SHA256 | sed -n '2p' | tr -d ' \r' > /tmp/actual.sha
diff /tmp/claimed.sha /tmp/actual.sha   # must be empty

# 2. The deny twin must be findable in the DAEMON'S OWN record by the decision id the file quotes.
#    The agent can write a decision id into markdown; it cannot put a matching row in the daemon's
#    store without the deny having actually happened.
DEC=$(grep -oE 'denyDecisionId=[0-9a-f-]{36}' "$EV" | cut -d= -f2)
devoid ai decisions show "$DEC" --json | jq -e '.disposition=="block" and .source=="machine-hook"'
#    expect exit 0. A missing or non-machine-hook decision fails the gate.

# 3. The allow twin, same shape, same rig, different id - proving the client still works.
ALW=$(grep -oE 'allowDecisionId=[0-9a-f-]{36}' "$EV" | cut -d= -f2)
devoid ai decisions show "$ALW" --json | jq -e '.disposition=="allow"'
```

If `devoid ai decisions show` does not exist as a read surface, that is itself a finding: **STOP AND
REPORT** rather than falling back to counting headings. A gate the implementer can satisfy by writing
prose is not a gate.
Every artefact is labelled a **local-rig measurement** - no control in this product has been observed
against the production authority chain (SOT §15). Until all four exist this task does not merge,
whatever the tests say. It is the same two-artefact rule the Codex dialect table lives by, applied to
the other vendor.

---

## Task 7: Measure `allowManagedPermissionRulesOnly` before writing it

**Files:** new `internal/airuntimeintegrity/providers/claude/testdata/vendorkeys/` corpus,
`internal/airuntimeintegrity/providers/claude/projection.go` (`ProjectionInput`, `Compile`),
`internal/airuntimeintegrity/providers/claude/projection_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t7 -b w4/t7-permission-lock origin/main && cd C:/cwt/w4-t7

git grep -n "allowManagedPermissionRulesOnly"
#   MUST print NOTHING. The key exists nowhere in this repository. If it prints,
#   someone has added it: STOP AND REPORT - it may have been added from documentation.

sed -n '30,38p' internal/codexmanaged/hookdialect.go
#   MUST show the prior decision this task obeys: no pin without two vendor artefacts

ls internal/airuntimeintegrity/providers/claude/testdata/
#   Record what is there. `vendorkeys/` MUST NOT exist yet.
```

### LANDMINES

- **Do not add this key from documentation alone.** That is exactly the mistake `hookdialect.go:30-38`
  exists to prevent, and it is how the Codex hook-trust firewall went silently dead the first time.
  A permission lock the installed version silently ignores buys nothing and, if DeVoid then reports it
  as enforcing, **manufactures assurance**.
- The opposite direction is equally real: a permission lock the version *does* honour but which
  DeVoid mis-scopes can block a developer's legitimate project rules. Both directions are why the
  artefacts come first.
- **Two artefacts means two, from the certified binary, committed in-tree** - not one screenshot, not
  a changelog entry, not a model's recollection of the vendor docs.
- Do not weaken `validateCommon` or `digestRE` to accommodate a new key.

### DO NOT

- Do not emit the key without both artefacts committed.
- Do not widen an existing version floor to cover this key.
- Do not write "documented by the vendor" as a substitute for a measurement.
- Do not delete `TestPermissionRulesLockIsNotEmittedBelowItsMeasuredFloor` if the key never lands -
  it becomes the standing guard.

### The change

Strategy §8.2 requires this lock so user/project sources cannot add weakening permission rules. Take
two artefacts from the certified binary - (1) the client reporting the key as accepted (`/status` or
`claude doctor` showing it not stripped), and (2) a behavioural twin in which a user-scope permission
rule that would widen behaviour is rejected while the managed rules still apply - then add the key
with the artefacts committed beside it, gated on a version floor the artefacts establish.

### Steps

- [ ] `TestPermissionRulesLockIsNotEmittedBelowItsMeasuredFloor` - written first. It passes trivially
      today because the key is absent; it becomes the guard once the key lands. **Assert the
      precondition loudly** (fail if the floor constant is unset) so it cannot silently skip.
- [ ] Capture artefact 1 and artefact 2; commit both under `testdata/vendorkeys/` with the binary
      sha256, the date and the exact command lines, in the style of `hookdialect.go:122-165`.
- [ ] `TestPermissionRulesLockIsEmittedAtAndAboveItsMeasuredFloor` - RED until the key lands.
- [ ] `TestPermissionRulesLockHasTwoCommittedVendorArtefacts` - a structural test that the version
      floor constant has a matching artefact directory containing **two** artefacts, so a future
      widening cannot be a source reading.

### DEFEAT TEST

```
Mutate:  add a second version floor constant (e.g. permissionLockFloor2 = "2.1.0") with NO
         matching directory under testdata/vendorkeys/
Run:     cd C:/cwt/w4-t7 && go test ./internal/airuntimeintegrity/providers/claude \
           -run TestPermissionRulesLockHasTwoCommittedVendorArtefacts -count=1
Expect:  exit code 1, output contains:
         version floor 2.1.x has no committed vendor artefact; a floor may not be widened from source
Restore: git -C C:/cwt/w4-t7 checkout -- internal/airuntimeintegrity/providers/claude/
```

### BLAST RADIUS

See the landmines - manufactured assurance in one direction, a blocked developer in the other. If the
task closes as declared-unsupported, the blast radius is zero and the claim shrinks, which is the
correct outcome of an unmeasured key.

### ROLLBACK

Drop the key from `Compile`. One re-drift, one re-apply, the lock is gone.

### EXIT

One of exactly two states, verifiable by a command:

- **Shipped:** `ls internal/airuntimeintegrity/providers/claude/testdata/vendorkeys/<floor>/ | wc -l`
  returns >= 2, and `TestPermissionRulesLockHasTwoCommittedVendorArtefacts` is green; or
- **Declared unsupported:** `grep -n "allowManagedPermissionRulesOnly"
  internal/codexmanaged/capability_disposition.go` (Task 12's table analogue for Claude) returns a
  row with disposition `declared-unsupported`, and the console line saying so is rendered.

Both are acceptable outcomes. Silently shipping the key is not.

---

## Task 8: Stop the Codex adapter report from asserting managed authority

**Files:** `internal/codexmanaged/adapter_report.go` (:41, :47, :280-311),
`internal/codexmanaged/adapter_report_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t8 -b w4/t8-codex-honest-report origin/main && cd C:/cwt/w4-t8

sed -n '41p;47p' internal/codexmanaged/adapter_report.go
#   MUST print:
#     const deploymentAssuranceManaged = "managed"
#     	codexConfigSource = "managed_config.toml+config.toml"

sed -n '284p;300p' internal/codexmanaged/adapter_report.go
#   MUST print:  Host:         "cli",
#          and:  DeploymentAssurance: deploymentAssuranceManaged,

grep -n "MachineHookLaneGoverns bool" internal/codexmanaged/verify.go
#   MUST print line 181

grep -n "MachineHookLaneGoverns:" internal/codexmanaged/verify.go
#   MUST print line 340 - where it is set

sed -n '260,265p' internal/airuntime/adapters/claudecode/detect.go
#   MUST show the Claude rule this task mirrors
```

Backend-side precondition (this task must NOT widen the wire):

```bash
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin
git rev-parse origin/main   # MUST print 0cf9021e944b72ef2a3024e8687f4114db1f2468
git show origin/main:src/ai-governance/endpoint-authored-assurance.ts | sed -n '64,68p'
#   MUST show ENDPOINT_AUTHORABLE_ASSURANCE_TIERS = ['cooperative', 'managed']
#   Both values this task produces are already accepted. If `cooperative` is absent,
#   STOP AND REPORT - this task would then widen the contract.
```

### LANDMINES

- **This is a DOWNGRADE for most of the fleet.** Endpoints that report `managed` today report
  `cooperative` tomorrow. That is the correct direction and it will change fleet dashboards visibly.
  Say so in the release note before it ships.
- **Release sequencing (RECONCILIATION §4 R7).** Three tasks across the programme turn green surfaces
  red simultaneously: W5 T4 (`observed` -> `loaded` fleet-wide), **this task** (Codex `managed` ->
  `cooperative` for most of the fleet), and W8 T6 (`PREVENTION_ACTIVE` reads zero everywhere). All
  three are correct and none changes enforcement. Landing them in one release turns every coverage
  dashboard red at once, and the predictable response is a rollback request for a plan working as
  designed. **Ship this task in a release AFTER W8 Task 6**, which is the one that explains why
  several dashboards go red at once, and attach a release note.
- **The DTO is not the gate.** `heartbeat.types.ts:697`/`:481` carry `deploymentAssurance` and
  `configSource`, but that class's decorators never execute (`:599-618`). The enforcing boundary is
  `Backend/src/ai-governance/runtime-adapter-shape.ts` (`normalizeRuntimeAdapterReport`), which
  rebuilds `configSource` through `boundedString` (`:625-626`) and routes `deploymentAssurance`
  through `splitEndpointDeploymentAssuranceReport` (`:1317-1319`). **Any key that rebuild does not
  name is dropped in silence.**
- **Widening an agent-wire contract requires the Backend deployed FIRST.**
  `AgentIngestValidationPipe` DROPS unknown keys rather than rejecting them, so the reverse order
  loses fields silently - no error, no data, a console that looks correct. This task is *believed* to
  widen values only, not keys. **That belief is a test** (`TestCodexReportWireKeysAreUnchanged`), not
  an assumption. If the golden key-set assertion goes red, the Backend ships and deploys first.
- **Do not over-tighten.** A genuinely machine-governed endpoint reading `cooperative` because the
  derivation is too strict loses a true claim. That is safer than the reverse, but it is still wrong
  - `TestCodexReportIsManagedOnlyWhenTheMachineLaneGoverns` is the guard.

### DO NOT

- Do not delete the `deploymentAssuranceManaged` constant - it is still the true answer on a governed
  endpoint.
- Do not change any wire key name.
- Do not ship this in the same release as W5 T4 or W8 T6.
- Do not "fix" a red dashboard by restoring the constant.

### The change

Three hardcoded values become derived facts, from data the `Report` already carries:

- `DeploymentAssurance` (`:300`): `managed` only when `Report.MachineHookLaneGoverns` is true
  (`verify.go:181`, set at `:340`) **and** the machine baseline is the winning requirements source;
  otherwise `cooperative`. Mirror the Claude rule at `claudecode/detect.go:260-265`.
- `ConfigSource` (`:47`, `:288`): name the source that actually won -
  `MACHINE_REQUIREMENTS` / `LEGACY_MANAGED_CONFIG` / `CLOUD_REQUIREMENTS` from the
  `EffectiveResult`'s winning source - instead of the frozen string naming the two user files.
- `Host` (`:284`): carry the observed host (`cli` / `ide` / `desktop`) rather than the literal
  `"cli"`. `ModeDesktop` already exists and is already expressed through `attestedProfile()`
  (`:384-410`), so the host is known where the string is written.

### Steps

- [ ] `TestCodexReportIsCooperativeWhenNoMachineBaselineGoverns` - a report with
      `MachineHookLaneGoverns=false` yields `cooperative`. RED today.
- [ ] `TestCodexReportIsManagedOnlyWhenTheMachineLaneGoverns` - the true-claim direction.
- [ ] `TestCodexReportIsCooperativeWhenTheLaneGovernsButAUserFileWins` - the third branch: lane
      governs, `LEGACY_MANAGED_CONFIG` is the winning source, answer is still `cooperative`.
- [ ] `TestCodexReportNamesTheWinningRequirementsSource` - `LEGACY_MANAGED_CONFIG` when a user file
      wins, `MACHINE_REQUIREMENTS` when the baseline does.
- [ ] `TestCodexReportNamesTheDesktopHost` - a desktop-mode report does not say `cli`.
- [ ] `TestCodexReportWireKeysAreUnchanged` - a golden key-set assertion over the marshalled report,
      so this task cannot widen the contract by accident.

### DEFEAT TEST

```
Mutate:  internal/codexmanaged/adapter_report.go:300 - restore
         `DeploymentAssurance: deploymentAssuranceManaged,`
Run:     cd C:/cwt/w4-t8 && go test ./internal/codexmanaged \
           -run TestCodexReportIsCooperativeWhenNoMachineBaselineGoverns -count=1
Expect:  exit code 1, output contains:
         deploymentAssurance = "managed" over an endpoint with no governing machine hook lane
Restore: git -C C:/cwt/w4-t8 checkout -- internal/codexmanaged/adapter_report.go
```

### BLAST RADIUS

Reporting only - no enforcement changes. Most of the fleet's Codex rows go from `managed` to
`cooperative` in one heartbeat. See the release-sequencing landmine: this is one of three tasks that
turn dashboards red, and it must land after W8 T6.

### ROLLBACK

Restore the three constants. Reports go back to unconditional `managed` - which is the overclaim, so
**rollback here is a knowingly worse state and should be a deploy-order decision, not a reflex.**

### EXIT

Two captured heartbeat bodies plus a release note. On a rig with
`%ProgramData%\OpenAI\Codex\requirements.toml` deleted, the Codex adapter row reports `cooperative`
within one heartbeat; restoring the baseline returns it to `managed`. Both bodies committed under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t8-codex-heartbeat-{cooperative,managed}.json`. Verify:
`jq -r '.controls.runtimeAdapters[] | select(.adapterId=="codex") | .deploymentAssurance'` returns
the expected value on each. Plus: the release note naming the dashboard change exists and the release
follows W8 T6.

---

## Task 9: Make a diverging higher-precedence Codex requirement remove green

**Files:** `internal/codexmanaged/machine_effective.go` (`Verdict()` :243-270),
`cmd/devoid/ai_codex_machine.go` (:356-362), `internal/codexmanaged/machine_effective_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t9 -b w4/t9-legacy-divergence origin/main && cd C:/cwt/w4-t9

sed -n '263,265p' internal/codexmanaged/machine_effective.go
#   MUST show the two existing Verdict clauses:
#     if len(r.UnconstrainedHookPaths) > 0 || len(r.UserAuthoredManagedHookSources) > 0 {
#         return VerdictFailed

grep -n "DivergesFromDevoid bool" internal/codexmanaged/machine_effective.go
#   MUST print line 149

grep -n "res.LegacyRequirementFields = legacyRequirementFields" internal/codexmanaged/machine_effective.go
#   MUST print line 483

git grep -n "DivergesFromDevoid" origin/main -- ':!*_test.go'
#   MUST print exactly FOUR lines and no more:
#     machine_effective.go:147   (doc comment)
#     machine_effective.go:149   (the field declaration)
#     machine_effective.go:754   (the ONLY producer)
#     cmd/devoid/ai_codex_machine.go:358   (the ONLY reader - an [i] print)
#   The premise of this task is that there is exactly ONE reader and it is a print.
#   If a second reader exists, STOP AND REPORT - the premise has changed.

grep -n "func valuesEqual" internal/codexmanaged/machine_effective.go
#   MUST print line 624 - the normalization this task's false-red risk lives in
```

### LANDMINES

- **The false-red direction is a `valuesEqual` bug on path normalization** (`machine_effective.go:624-641`).
  A Windows path separator difference that reads as divergence would flip compliant endpoints to
  failed for no reason. Cover the Windows path-separator case explicitly.
- **Scope it to divergence only.** A legacy field that **matches** the DeVoid pin is coexistence, not
  drift, and must stay green. A blanket red on the presence of the field would fail every endpoint
  that has ever had a `managed_config.toml` written - which is all of them.
- **An unreadable source is `UNVERIFIABLE`, never `FAILED`.** Failing on a value nobody read is a
  fail-closed branch on a condition that cannot be proven at runtime. That shape bricked a machine in
  July 2026 and the operator uninstalled the agent. Here it produces a non-zero exit and a support
  surge on endpoints where nothing is actually wrong.
- **The message is load-bearing.** `devoid ai hooks-status codex` starts exiting non-zero for real
  users. The `[i]` print at `ai_codex_machine.go:356-362` must become a remediation line naming the
  key, the file, the observed value and the pinned value. A non-zero exit with no actionable line is
  how a correct change lands as an outage.
- Do not weaken `Verdict()`'s two existing clauses to make room for the new one.

### DO NOT

- Do not fail on presence; fail only on divergence.
- Do not fail on an unreadable or absent source.
- Do not change `RequirementsPrecedence` (`machine.go:191-195`) - it is frozen.
- Do not remove the `[i]` print; upgrade it.

### The change

Add the missing clause to `Verdict()` beside the two that already exist at `:263-265`: a
`LegacyRequirementField` with `DivergesFromDevoid == true` is `VerdictFailed`.

This is the concrete meaning of "user configuration is compatibility and observability, not the basis
of the prevention claim" for Codex: the user file still exists, is still read, and can still be
edited - it just can no longer sit above the machine baseline and leave the claim untouched.

### Steps

- [ ] `TestVerdictFailsOnADivergingLegacyRequirementField` - a user `managed_config.toml` with
      `tools.web_search = true` yields `VerdictFailed`. RED today (`VerdictSurvived`).
- [ ] `TestVerdictSurvivesALegacyRequirementFieldThatMatchesThePin` - the defeat direction, and the
      one that stops this becoming a blanket red.
- [ ] `TestVerdictSurvivesAMatchingFieldWrittenWithWindowsPathSeparators` - the false-red guard on
      `valuesEqual` normalization.
- [ ] `TestVerdictIsUnaffectedByALegacyFieldInAnUnreadableSource` - an unreadable source is
      `UNVERIFIABLE`, never `FAILED` on a value nobody read.
- [ ] `TestDivergingLegacyFieldPrintsTheObservedAndPinnedValues` - the operator can act on the line.

### DEFEAT TEST

```
Mutate:  internal/codexmanaged/machine_effective.go - delete the new LegacyRequirementFields
         clause from Verdict()
Run:     cd C:/cwt/w4-t9 && go test ./internal/codexmanaged \
           -run TestVerdictFailsOnADivergingLegacyRequirementField -count=1
Expect:  exit code 1, output contains:
         Verdict() = SURVIVED, want FAILED (tools.web_search diverges in LEGACY_MANAGED_CONFIG)
Restore: git -C C:/cwt/w4-t9 checkout -- internal/codexmanaged/machine_effective.go
```

### BLAST RADIUS

Endpoints whose users have edited `$CODEX_HOME/managed_config.toml` flip from compliant to failed and
`devoid ai hooks-status codex` starts exiting non-zero. That is the intent, but it lands as a support
surge if the message is not actionable. No wire key changes; the verdict value is already on the
wire.

### ROLLBACK

Delete the clause. Verdict returns to today's, the `[i]` line stays, exit code returns to zero.

### EXIT

A command and an exit code. On a rig, editing `tools.web_search = true` in
`$CODEX_HOME/managed_config.toml` makes `devoid ai hooks-status codex` exit non-zero within one
reconcile: `devoid ai hooks-status codex; echo "exit=$?"` prints `exit=1` and the output names
`tools.web_search`, the file path, `observed true`, `pinned false`. Restoring the file returns
`exit=0`. Both transcripts committed under
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t9-legacy-divergence.md`. Plus: the endpoint's Codex coverage row
leaves full-loop on the next heartbeat.

---

## Task 10: Move the tool-path pins into the Codex machine source, key by key

**Files:** `internal/codexmanaged/machine_projection.go` (`RootBlock` :779-788, `TableBlock`
:790-872, `ownedPlan`), `internal/codexmanaged/machine_effective.go` (obligation table :440-480,
the pinned-key table `legacyRequirementSpecs` :721-730), `internal/codexmanaged/testdata/scfg/managed/probes/` (new probe
dirs), `internal/codexmanaged/machine_schema_test.go`

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t10 -b w4/t10-machine-pins origin/main && cd C:/cwt/w4-t10

sed -n '17,30p' internal/codexmanaged/machine_projection.go
#   MUST show the stated restraint: "silently widening the machine baseline with keys whose
#   composition semantics this build has not verified ... would manufacture assurance"

sed -n '183,190p' internal/codexmanaged/merge.go
#   MUST show the DESKTOP BRICK note: sandbox_mode HARD-ERRORS the desktop core
#   ("invalid value for sandbox_mode ... Managed{Restricted}", proven live)

sed -n '410,421p' internal/codexmanaged/requirements.go
#   MUST show the 0.148.0-alpha.15 note: network_access true and false produce an
#   IDENTICAL doctor --json posture. This key is UNDETERMINED, not safe.

ls internal/codexmanaged/testdata/scfg/managed/probes/ 2>/dev/null
#   Record the existing probe shape (cmd.txt, home/, observed.txt, verdict.md).
#   If the directory does not exist, STOP AND REPORT - the probe convention is the rule
#   this task is built on.

grep -n "func (p MachineProjection) Validate" internal/codexmanaged/machine_projection.go
#   MUST print a line near 474 - the last place that can say no
```

### LANDMINES

- **`sandbox_mode` is a proven-live desktop brick.** `merge.go:183-190` records that the sandbox pin
  HARD-ERRORS the ChatGPT/Codex desktop core. The machine requirements file is read by a host that a
  full CLI profile bricks. **Never write `sandbox_mode` into a source a desktop-present box reads, at
  any scope.** This has already happened once.
- **`sandbox_workspace_write.network_access` has no measured effect.** `requirements.go:408-421`
  records that `true` and `false` produce an identical `doctor --json` posture on 0.148.0-alpha.15.
  Do not claim it until a probe distinguishes them. An unmeasured pin that DeVoid reports as
  enforcing manufactures assurance.
- **`approval_policy = never` makes `PermissionRequest` structurally unreachable** (SOT §5.3). If the
  pin moves to machine scope, the unreachable-checkpoint claim moves with it and **must be restated
  on the disposition row, not inherited**. Coordinate with Task 12's table.
- **A requirements file Codex cannot parse does not weaken a restriction - it stops Codex starting.**
  `MachineProjection.Validate` is the last place that can say no, and it already refuses on unsafe
  command characters and invalid marketplace sources (`machine_projection.go:474-482`). **Extend it,
  do not bypass it.** Never weaken an existing guard to make a key fit.
- **A key with no probe does not ship.** The structural test is the rule, not a formality.

### DO NOT

- Do not emit `sandbox_mode` at machine scope under any condition.
- Do not emit `network_access` while its effect is undetermined.
- Do not add a key to `TableBlock` without a committed probe directory.
- Do not bypass or relax `MachineProjection.Validate`.
- Do not ship all cleared keys in one commit - one commit per key (see ROLLBACK).

### The change

Discharge the stated restraint one key at a time, against a real binary. Order by measured safety and
ship only what the probes clear:

| Key | Why it is a candidate | Known hazard |
|---|---|---|
| `tools.web_search` | R3; hosted WebSearch is not hook-covered, so config is the only control | none measured |
| `features.computer_use` | R4; the one feature DeVoid claims to govern | none measured |
| `sandbox_workspace_write.network_access` | R2 egress half | **no measured effect** - `requirements.go:408-421` records that `true` and `false` produce an identical `doctor --json` posture on 0.148.0-alpha.15. Do not claim it until a probe distinguishes them |
| `approval_policy` | R1 | pinning `never` makes `PermissionRequest` structurally unreachable (SOT §5.3). If it moves to machine scope, the unreachable-checkpoint claim moves with it and must be restated, not inherited |
| `sandbox_mode` | R2 filesystem half | **proven-live desktop brick** - `invalid value for sandbox_mode` hard-errors the ChatGPT/Codex desktop core (`merge.go:183-190`). Never write it into a source a desktop-present box reads, at any scope |

Add a probe directory per key under `testdata/scfg/managed/probes/`, in the existing shape
(`cmd.txt`, `home/`, `observed.txt`, `verdict.md`), showing the key accepted at machine scope and the
composed behaviour it produces.

### Steps

- [ ] `TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` - a structural test walking the emitted
      key set against `testdata/scfg/managed/probes/`. **Write this first; it is the rule.** Walk the
      **emitted** keys, not a hand-written list - a literal-vs-literal comparison cannot notice a key
      that was added.
- [ ] `TestMachineBaselineNeverWritesSandboxModeOnADesktopPresentEndpoint` - the brick guard.
- [ ] `TestMachineBaselineNeverWritesSandboxModeOnAnyEndpoint` - the stronger form. The desktop-present
      detection is itself a branch that can be wrong.
- [ ] `TestMachineBaselinePinsWebSearchOff` / `...ComputerUseOff` - one per cleared key, RED until
      that key's probe and emit land.
- [ ] `TestEffectiveCompositionPrefersTheMachineSourceForAMovedKey` - after the move, the obligation's
      `WinningSource` is `MACHINE_REQUIREMENTS` when no higher source names the key.
- [ ] `TestNetworkAccessIsNotClaimedWhileItsEffectIsUndetermined` - the honest refusal, kept.

### DEFEAT TEST

```
Mutate:  internal/codexmanaged/machine_projection.go - add `tools.web_search` to TableBlock
         WITHOUT creating testdata/scfg/managed/probes/tools-web-search/
Run:     cd C:/cwt/w4-t10 && go test ./internal/codexmanaged \
           -run TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe -count=1
Expect:  exit code 1, output contains:
         emitted machine requirement key "tools.web_search" has no committed probe under testdata/scfg/managed/probes
Restore: git -C C:/cwt/w4-t10 checkout -- internal/codexmanaged/machine_projection.go
```

Second defeat test, for the brick guard:

```
Mutate:  add `sandbox_mode` to TableBlock (with a probe directory, so the first guard passes)
Run:     cd C:/cwt/w4-t10 && go test ./internal/codexmanaged \
           -run TestMachineBaselineNeverWritesSandboxModeOnAnyEndpoint -count=1
Expect:  exit code 1, output contains:
         machine baseline emits sandbox_mode; this hard-errors the Codex desktop core (proven-live brick, merge.go:183-190)
Restore: git -C C:/cwt/w4-t10 checkout -- internal/codexmanaged/machine_projection.go
```

### BLAST RADIUS

A requirements file Codex cannot parse stops Codex starting - that is the worst case, and
`Validate` is what prevents it. The desktop profile is the specific landmine: the same file is read by
a host that a full CLI profile bricks, and that has already happened once. No wire key changes.

### ROLLBACK

Per key. Each key is an independent entry in `ownedPlan`, so removing one re-renders the file without
it and the endpoint re-applies on the next sweep. **Ship them as separate commits so one can be
reverted without the others.**

### EXIT

A number, verifiable by a command. **At least two** of the five keys pinned at machine scope with
committed probes:
`ls internal/codexmanaged/testdata/scfg/managed/probes/ | wc -l` >= 2 (excluding pre-existing dirs
recorded in the preconditions), and `TestMachineBaselineOmitsAnyKeyWithoutACommittedProbe` green.
`sandbox_mode` explicitly excluded with its brick evidence cited in the test, and `network_access`
explicitly excluded as undetermined. Plus: on a certified rig, deleting
`$CODEX_HOME/managed_config.toml` entirely does not change the composed status of any moved key -
transcript under `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t10-composed-status-survives.md`, labelled a
local-rig measurement.

---

## Task 11: Retire the cooperative trust-hash lane from the Codex certificate

**Files:** `internal/codexmanaged/hookdialect.go` (:166, :179), `internal/codexmanaged/verify.go`
(`Report` :162-181, `applyManagedOnlyOverlay` :701-800), `internal/codexmanaged/adapter_report.go`
(`configDerivedReport` :242-278), `internal/codexmanaged/nochurn.go` (:58, :96)

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t11 -b w4/t11-retire-trusthash origin/main && cd C:/cwt/w4-t11

grep -n "var knownHookTrustDialects" internal/codexmanaged/hookdialect.go
#   MUST print line 166, with exactly TWO members: hookTrustDialect144, hookTrustDialect147

sed -n '163,165p' internal/codexmanaged/hookdialect.go
#   MUST show the in-file statement that 0.145, 0.146, 0.148 and the 0.149 alpha
#   remain UNMEASURED and UNRESOLVABLE

sed -n '257,263p' internal/codexmanaged/adapter_report.go
#   MUST show the R7+R8 condition granting airuntime.CoverageFullLoopGoverned

grep -n "ReasonUserHooksSupersededByMachineLane\|ReasonHookCheckpointsCarriedByMachineLane" internal/codexmanaged/verify.go
#   MUST print the two attribution slugs (near :820-824)

grep -n "func managedOnlyOverlayAdmits" internal/codexmanaged/verify.go
#   MUST print line 873
```

### LANDMINES

- **Widening the dialect prefix to `0.14` is explicitly forbidden and is how this lane went silently
  dead the first time** (`hookdialect.go:106-115`, `:163-165`; SOT §16.1 C1). `0.149.0-alpha.4.1` -
  the owner's own client and the desktop app's runtime - **stays outside the table.** The way out is
  another live measurement on that exact binary, never a wider prefix. Refuse this even if a green
  dashboard depends on it.
- **Keep `writerHookTrustDialect` writing unconditionally** (`hookdialect.go:168-179`). Writing on an
  unrecognised build costs nothing and might work; withholding guarantees it never does. The file
  states this reasoning in place. Do not "tidy" it into a gated write.
- **The false-red direction is a machine-governed endpoint that does not carry the attribution slug
  because the overlay did not run.** `managedOnlyOverlayAdmits` (`verify.go:873-882`) already handles
  the `dialect-unverified` case; cover the `userHookLaneSuppressionUnknown` case explicitly so an
  unreadable baseline does not silently downgrade a working endpoint to partial.
- Never weaken an existing guard to make a task fit. If the freeze test blocks a row you want, the row
  is wrong.

### DO NOT

- Do not add a row to `knownHookTrustDialects`.
- Do not widen any `minorPrefixes` entry.
- Do not gate `writerHookTrustDialect` on version recognition.
- Do not remove `managedOnlyOverlayAdmits`'s `unknown / hook-trust-dialect-unverified` admission -
  that is what lets the machine lane close the dialect question.

### The change

Strategy §9.2 asks for the trust-hash dependency to be replaced. **The replacement already exists**
and is already the stronger lane: managed hooks declared inline in the machine requirements file are
exempt from hook-trust (`canary_host.go:264-274`), and `machineHookLaneFor` already proves, per
checkpoint, that DeVoid's own dispatchable command is declared there
(`machine_hook_lane.go:92-141`). So this is a demotion, not a build:

- Keep `writerHookTrustDialect` writing unconditionally.
- **Freeze `knownHookTrustDialects`.** Add a structural test asserting each row has a committed
  two-artefact provenance block, so no future row can be added from a source reading or a semver
  guess.
- **Make full-loop coverage require the machine lane.** `configDerivedReport` currently grants
  `CoverageFullLoopGoverned` on R7+R8 being `installed` (`adapter_report.go:257-263`) - and after
  `applyManagedOnlyOverlay` those rows can be `installed` on the strength of the machine lane (good)
  *or* on the strength of the user-scope trust ledger (not good enough for 9+). Require the
  attribution slug: full-loop only when the rows carry `ReasonUserHooksSupersededByMachineLane` or
  `ReasonHookCheckpointsCarriedByMachineLane` (`verify.go:820-824`). A cooperative endpoint drops to
  `CoveragePartialNativeGovernance` - accurate, and it is the honest report of an unmanaged box.

### Steps

- [ ] `TestFullLoopRequiresTheMachineLaneAttribution` - R7/R8 `installed` with no attribution slug
      yields `partial-native-governance`. RED today.
- [ ] `TestFullLoopIsGrantedOnTheMachineLaneAttribution` - both slugs accepted.
- [ ] `TestEveryDialectRowHasATwoArtefactProvenanceBlock` - the freeze.
- [ ] `TestDialectTableRejectsAWidenedPrefix` - a row with prefix `0.14.` fails the structural test
      by name.
- [ ] `TestUnknownSuppressionWithAGoverningMachineLaneStaysFullLoop` - the false-red guard.

### DEFEAT TEST

```
Mutate:  internal/codexmanaged/hookdialect.go - change hookTrustDialect147.minorPrefixes to
         []string{"0.14."}
Run:     cd C:/cwt/w4-t11 && go test ./internal/codexmanaged \
           -run TestDialectTableRejectsAWidenedPrefix -count=1
Expect:  exit code 1, output contains:
         dialect row codex-hooktrust-0.147 spans unmeasured families 0.145, 0.146, 0.148, 0.149
Restore: git -C C:/cwt/w4-t11 checkout -- internal/codexmanaged/hookdialect.go
```

### BLAST RADIUS

Every unmanaged / user-scope Codex endpoint loses its full-loop claim. That is the 5.5 score being
told the truth. The failure direction is the false-red covered by
`TestUnknownSuppressionWithAGoverningMachineLaneStaysFullLoop`. No wire key changes - `coverageDepth`
is an existing field and both values are existing members.

### ROLLBACK

Restore the R7+R8-only condition in `configDerivedReport`. Coverage returns to today's more generous
claim.

### EXIT

Two numbers, both verifiable. (1) Codex full-loop coverage is reported by **zero** endpoints whose
checkpoints are not carried by the machine lane, measured over one fleet heartbeat window - the query
and its `0` result committed under `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t11-fullloop-census.md`.
(2) `grep -c "hookTrustDialect1" internal/codexmanaged/hookdialect.go` on the
`knownHookTrustDialects` line still shows exactly two rows, and
`go test ./internal/codexmanaged -run TestEveryDialectRowHasATwoArtefactProvenanceBlock` is green.

---

## Task 12: Declare a disposition for every Codex capability the hook path does not cover

**Files:** new `internal/codexmanaged/capability_disposition.go` and
`capability_disposition_test.go`, `internal/codexmanaged/verify.go` (`Report`),
`internal/codexmanaged/adapter_report.go` (wire), `cmd/devoid/ai_codex_machine.go`,
`Backend/src/ai-governance/runtime-adapter-shape.ts`,
`Backend/src/health/types/heartbeat.types.ts`,
`Frontend/components/admin/ai-security-policy-section.tsx`

> **This task widens the agent wire. Read the ORDERING GATE before writing a line of Go.**

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Backend && git fetch origin
git rev-parse origin/main   # MUST print 0cf9021e944b72ef2a3024e8687f4114db1f2468

git show origin/main:src/health/types/heartbeat.types.ts | sed -n '599,618p'
#   MUST show the docblock: "NONE OF THE DECORATORS ON THIS CLASS EVER EXECUTE" and
#   "THE REAL, ENFORCING BOUNDARY is the service-layer field-by-field rebuild in
#    ai-governance/runtime-adapter-shape.ts"

git show origin/main:src/ai-governance/runtime-adapter-shape.ts | grep -n "capabilityDisposition"
#   MUST print NOTHING - the field does not exist yet. If it prints, STOP AND REPORT.

cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main   # MUST print 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git show origin/main:internal/codexmanaged/hookset.go | sed -n '91,97p'
#   MUST show the frozen managedHookEvents table, five rows, PostToolUse Gating:false

git show origin/main:internal/codexmanaged/machine_effective.go | sed -n '643,655p'
#   MUST show hookPathKeys - the FOUR-key inventory, not the §9.4 list
```

### ORDERING GATE - two constraints, both from RECONCILIATION §3

1. **W8 Task 5 must have landed and been deployed first.** It is the programme-level rule no wave
   states: until W8 T5 lands, a mistyped or unknown optional field inside a surviving
   `runtimeAdapters[]` element is dropped with `reasons: []` and `rejectedCount` unchanged, and the
   pipe's drift counter is structurally blind. **Until W8 T5 lands, an ordering mistake on this task
   produces no error, no data, and a console that looks correct.** Confirm it is deployed before
   starting. If it is not, STOP AND REPORT.
2. **Backend ships and is DEPLOYED before the agent release that emits the new field.**
   `AgentIngestValidationPipe` DROPS unknown keys rather than rejecting them, so the reverse order
   loses the data with no error and the console shows nothing - it looks like it worked (SOT §14.7).
   **No exception.** This is RECONCILIATION §3 O2.

### LANDMINES

- **Widening an agent-wire contract requires the Backend deployed FIRST** (see the ordering gate).
  The DTO is not the gate: `heartbeat.types.ts`'s decorators never execute (`:599-618`). Add the
  field to the **field-by-field rebuild** in `ai-governance/runtime-adapter-shape.ts`, or it is
  dropped in silence however correct the DTO looks.
- **The product risk here is the opposite of a false green.** Several capabilities move from
  unmentioned to explicitly unsupported, which is a visible reduction in the claim. That is the point.
  Do not soften a row to keep a dashboard number.
- **`PermissionRequest` is declared gating but structurally unreachable under `approval_policy = "never"`**
  (SOT §5.3). If Task 10 moves `approval_policy` to machine scope, that claim moves with it and must
  be restated on this row, not inherited.
- **`PostToolUse` is `Gating: false`** in the frozen event table (`hookset.go:94`) and the closed-world
  oracle returns `RESTRICT_CAPABILITY` rather than `DENY` at post-tool. The row must say
  "governed, non-preventive" and **must never be counted as prevention**.
- Do not add a new file under the DeVoid machine root for this table. Writing any new entry there
  requires the SAME COMMIT to add it to `boundaryChildNames` in
  `cmd/devoid-msi-root-guard/guard_windows.go:624`, or the next MSI operation dies at
  `inspectRootEntries` (`:1086`) with 1722 -> 1603 and rolls back the upgrade on every ENROLLED
  endpoint while every clean-box test stays green (`.staging`, `aitrust`, `endpoint-identity.json`).

### DO NOT

- Do not emit the new field from the agent before the Backend accepting it is deployed.
- Do not add a capability row without a disposition, and do not add two rows for one capability.
- Do not invent a fifth disposition value; the set is closed.
- Do not fold an `unsupported` row into a coverage numerator.
- Do not write free prose into the console rows - the wording comes from the closed slug set.
- Do not add permission profiles or `elevated` sandbox as anything but `declared unsupported`; both
  are absent from the tree and neither has two vendor artefacts.

### The change

Strategy §9.4 names capabilities that the local function-tool hook path does not cover. Every row
takes exactly one of four dispositions - **disabled by managed requirement**, **governed by another
proven control**, **lower assurance profile**, **declared unsupported** - and the console shows the
choice.

| Capability | What exists today | Proposed disposition |
|---|---|---|
| Hosted WebSearch | `tools.web_search = false` in the **user** file only (`merge.go:116`); named in `machine_projection.go:39-40` as not hook-covered | **disabled by managed requirement** once Task 10 moves the key to machine scope |
| Computer use | `features.computer_use = false`, user file only (`merge.go:119`) | **disabled by managed requirement** (Task 10) |
| SDK hooks / force-enabled plugin hooks | already inventoried - `hookPathKeys` (`machine_effective.go:643-655`), reported through `UnconstrainedHookPaths` (`:482`) and already failing the verdict (`:263`) | **governed** (inventoried + fails green); keep |
| MCP servers | DeVoid's own audit MCP is pinned (`merge.go:167-169`); third-party MCP is governed by the separate MCP verdict path | **governed by another proven control**; name it explicitly rather than implying the hook covers it |
| Marketplace / plugin sources | machine `[marketplaces.allowed_sources.*]` is rendered (`machine_projection.go:850-870`) and `codexMarketplaceGovernance` exists on the Backend | **governed by managed requirement** |
| Follow-up input to an approved unified-exec session | **nothing** in the tree models it | **declared unsupported** in the first certified profile, with the reason: a re-used approved session may not re-enter `PreToolUse`, and DeVoid has no measurement either way |
| Browser / apps surfaces | **nothing** | **declared unsupported** |
| `PostToolUse` feedback | modelled and correct - `Gating: false` in the frozen event table (`hookset.go:94`), and the closed-world oracle already returns `RESTRICT_CAPABILITY` rather than `DENY` at post-tool | **governed, non-preventive**; the row must say so and must never be counted as prevention |
| Permission profiles | absent from the tree | **declared unsupported** pending artefacts |
| `elevated` Windows sandbox | absent from the tree | **declared unsupported** pending artefacts |
| `PermissionRequest` checkpoint | declared gating but structurally unreachable under `approval_policy = "never"` (SOT §5.3) | **declared unreachable under the current pin**, stated on the row rather than counted as a gating checkpoint |

### Steps

- [ ] **Backend first, and deployed first.** `runtime-adapter-shape.ts` accepts
      `capabilityDispositions` in the field-by-field rebuild, with a spec asserting an unknown
      disposition value is **rejected rather than coerced**: `TestUnknownDispositionIsRejected`.
      Feed it a genuinely unknown member, not a known-bad one.
- [ ] `TestEveryCodexCapabilityHasExactlyOneDisposition` in Go - a structural test over the closed
      table; a capability with no row, or two rows, fails.
- [ ] `TestDispositionTableCoversEveryCheckpointInTheFrozenEventTable` - ties the table to
      `managedHookEvents` (`hookset.go:91-97`) so a new checkpoint cannot be added without a
      disposition.
- [ ] `TestUnsupportedCapabilitiesAreNeverCountedAsGoverned` - the roll-up must not fold an
      `unsupported` row into a coverage numerator.
- [ ] Console: render the table under the Codex posture, with the disposition wording verbatim from
      the closed slug set (no free prose).

### DEFEAT TEST

```
Mutate:  internal/codexmanaged/capability_disposition.go - delete the `unified-exec-followup` row
Run:     cd C:/cwt/w4-t12 && go test ./internal/codexmanaged \
           -run TestEveryCodexCapabilityHasExactlyOneDisposition -count=1
Expect:  exit code 1, output contains:
         capability "unified-exec-followup" has no declared disposition; "Codex hooks healthy" is not "all Codex capabilities governed"
Restore: git -C C:/cwt/w4-t12 checkout -- internal/codexmanaged/capability_disposition.go
```

Second defeat test, for the wire half:

```
Mutate:  Backend src/ai-governance/runtime-adapter-shape.ts - remove `capabilityDispositions`
         from the field-by-field rebuild (leave it in the DTO)
Run:     cd C:/cwt/w4-t12-be && npx jest ai-governance/runtime-adapter-shape.spec.ts \
           -t "capabilityDispositions survives the rebuild"
Expect:  exit code 1, output contains:
         capabilityDispositions absent from normalized report (dropped silently by the rebuild)
Restore: git -C C:/cwt/w4-t12-be checkout -- src/ai-governance/runtime-adapter-shape.ts
```

### BLAST RADIUS

This adds keys to the adapter report and therefore to the wire. **This is the task that triggers the
ordering landmine** - see the ORDERING GATE. The product risk is the opposite of a false green:
several capabilities move from unmentioned to explicitly unsupported, which is a visible reduction in
the claim. That is the point.

### ROLLBACK

Stop emitting the field; the console falls back to not showing the table. The Backend column is
additive and nullable, so it can stay. Rolling back the **Backend** while the agent still emits the
field re-creates the silent-drop condition - do not do that half alone.

### EXIT

A named artefact plus a number. The rendered capability table on the console for one real endpoint,
screenshotted to `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w4-t12-capability-table.png`, with every row
carrying one of the four dispositions and **zero** rows blank. Verify in code:
`go test ./internal/codexmanaged -run TestEveryCodexCapabilityHasExactlyOneDisposition` green, and
the count of capabilities declared unsupported is **stated on the fleet view**, not hidden -
confirmed by reading that number off the console screenshot.

---

## Task 13: Split the single managed seal into a capability posture

**Files:** `internal/airuntimeintegrity/state.go` (`persistedSeal` :158-163),
`internal/airuntimeintegrity/local_disablement.go` (:44-62),
`cmd/devoid/ai_local_bypass.go` (:40-51), `cmd/devoid/agent_shim.go` (:599, :609)

### PRECONDITIONS - run these first; if any fails, STOP AND REPORT

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w4-t13 -b w4/t13-seal-posture origin/main && cd C:/cwt/w4-t13

sed -n '158,163p' internal/airuntimeintegrity/state.go
#   MUST show persistedSeal with SignedRequired bool `json:"signedRequired"` at :161

grep -n "func ManagedEndpoint" internal/airuntimeintegrity/local_disablement.go
#   MUST print line 50

grep -n "managedEndpoint()" cmd/devoid/agent_shim.go
#   MUST print exactly THREE lines: 520, 599, 609

grep -n "uninstall.ManagedGuard = managedEndpoint\|aiwire.SetManagedProbe(managedEndpoint)" cmd/devoid/ai_local_bypass.go
#   MUST print lines 56 and 57 - the other two consumers

# Total consumers = 5. If the count differs, STOP AND REPORT.

ls internal/airuntimeintegrity/testdata/ | grep -i seal
#   Record what seal fixtures exist. You need a 7.10.6-written seal for the EXIT criterion.
#   If none exists you must capture one from a real 7.10.6 endpoint - do NOT hand-write it.
```

### LANDMINES

- **`agent_shim.go:520` is the refuse-to-launch branch and it DOES NOT MOVE in this wave.** A
  fail-closed checkpoint on a condition that cannot be proven at runtime bricked a machine in July
  2026 and the operator removed the agent; an uninstalled control protects nobody. This branch stays
  on the existing seal boolean until the capability that would replace it is proven on a real
  endpoint, and that proof is not in this wave. **Say so on the line, in a comment.**
- **A missing capability field must fall back to the existing boolean.** If it defaults to false, a
  managed endpoint silently stops overriding a user-set provider route during a mixed-fleet rollout.
  That fallback is the whole safety property of this task and it is what the tests are for.
- **A hand-written seal fixture cannot prove byte-compatibility.** The hand-built-literal inert shape
  applies exactly here: a test comparing your new struct to your new struct passes in both the RED and
  GREEN runs. Capture a real 7.10.6-written seal.
- **Do not create a new file under the machine root for the capability posture.** The seal is an
  existing entry; **add fields to it**. Writing any new entry under the machine root requires the
  SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624`,
  or the next MSI operation dies at `inspectRootEntries` (`:1086`,
  `machine root contains unknown entry`) with 1722 -> 1603, rolling back the upgrade on every
  ENROLLED endpoint while every clean-box test stays green. That class has fired three times here:
  `.staging`, `aitrust`, `endpoint-identity.json`.

### DO NOT

- Do not move `agent_shim.go:520` onto a capability.
- Do not remove `signedRequired` from the seal or change its JSON name.
- Do not write a second state file; the fields are additive on `persistedSeal`.
- Do not move more than the two named consumers.

### The change

Do this additively and narrowly:

- Add optional capability fields to `persistedSeal`. `ManagedEndpoint()` keeps reading
  `signedRequired` and keeps its exact current answer for an old seal - **byte-compatible**, so a
  mixed fleet during rollout behaves identically.
- Move exactly **two** of the five consumers onto the capability they actually need:
  the provider-route override (`agent_shim.go:599`) onto `providerRouteAuthoritative`, and the
  bypass-flag strip (`:609`) onto `machineHookActive`. Both are *strengthening* behaviours - they add
  a control, they never refuse the launch.
- **Leave `agent_shim.go:520` on the existing boolean**, with the reason on the line.

### Steps

- [ ] `TestOldSealWithoutCapabilitiesAnswersExactlyAsBefore` - a seal **captured from 7.10.6**
      produces identical answers at all five sites. Assert the fixture's provenance loudly so the
      test cannot silently pass on a hand-written stand-in.
- [ ] `TestRouteOverrideUsesTheRouteCapabilityWhenPresent` and
      `TestRouteOverrideFallsBackToTheSealWhenTheCapabilityIsAbsent` - the two halves.
- [ ] `TestBypassStripUsesMachineHookActiveWhenPresent` and its fallback twin.
- [ ] `TestRefuseToLaunchStillReadsTheSealOnly` - a structural test asserting `agent_shim.go:520` has
      no capability dependency. This is a guard against a future well-meaning refactor.
- [ ] `TestMissingSealStillMakesEveryBranchCooperative` - SOT §13.3 preserved.

### DEFEAT TEST

```
Mutate:  cmd/devoid/agent_shim.go:599 - remove the fallback so the capability defaults to false
         when absent
Run:     cd C:/cwt/w4-t13 && go test ./cmd/devoid \
           -run TestRouteOverrideFallsBackToTheSealWhenTheCapabilityIsAbsent -count=1
Expect:  exit code 1, output contains:
         managed endpoint did not override a user-set provider route (capability absent, seal says managed)
Restore: git -C C:/cwt/w4-t13 checkout -- cmd/devoid/agent_shim.go
```

Second defeat test, for the branch that must not move:

```
Mutate:  cmd/devoid/agent_shim.go:520 - change `managedEndpoint()` to a capability read
Run:     cd C:/cwt/w4-t13 && go test ./cmd/devoid -run TestRefuseToLaunchStillReadsTheSealOnly -count=1
Expect:  exit code 1, output contains:
         refuse-to-launch branch now depends on a capability; a fail-closed branch on an unprovable condition bricked a machine in July 2026
Restore: git -C C:/cwt/w4-t13 checkout -- cmd/devoid/agent_shim.go
```

### BLAST RADIUS

If a capability field is absent (old seal, partial rollout) the two moved consumers must fall back to
the existing boolean, or a managed endpoint silently stops overriding a user-set route. That fallback
is the whole safety property. No wire key changes; the seal is endpoint-local.

### ROLLBACK

The fields are additive and the fallback is the current behaviour, so reverting the two consumers
restores today's semantics with no seal migration.

### EXIT

A number, verifiable by a command. Five `managedEndpoint()` call sites before, **three** after -
`grep -c "managedEndpoint()" cmd/devoid/agent_shim.go cmd/devoid/ai_local_bypass.go` totals 3 - and
zero change in behaviour on a seal written by the previous agent version, proven by running the
captured 7.10.6 seal fixture through all five sites:
`go test ./cmd/devoid ./internal/airuntimeintegrity -run "TestOldSealWithoutCapabilities|TestMissingSealStillMakes" -count=1`
green.

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
6. **The withdrawal is proven BEFORE the rollout, and a live machine-hook deny twin exists for
   Claude.** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-machine-hook-live.md` carries **four** artefacts
   in order: (0) the withdrawal - clearing the host's mode deletes the drop-in and the endpoint is
   governed again through user-scope hooks within one sweep; (1) `/status` naming the drop-in as a
   selected managed source; (2) the deny twin; (3) the allow twin proving the runtime still works.
   **Artefact 0 is a merge gate, not a follow-up:** reverting the default alone leaves the drop-in on
   disk with `allowManagedHooksOnly: true` and user-scope hooks suppressed, so the obvious rollback of
   the riskiest task in the plan leaves every endpoint ungoverned (RECONCILIATION §4 R3). Defeat:
   `buildIntentsForEndpoint emits a CLAUDE_MANAGED_SETTINGS intent for a default tenant` and
   `TestRemoveOwnedDeletesTheDropInAndRestoresUserScopeHooks` (Task 6).
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
12. **The seal split changes nothing on an old seal.** Five call sites become three; the captured
    7.10.6 seal fixture produces identical answers at all five. Defeat:
    `TestRefuseToLaunchStillReadsTheSealOnly` (Task 13).

### Merge and deploy order, which is not negotiable

- **W8 Task 5 lands and is deployed before ANY Backend change in this wave.** It is the
  programme-level rule no wave states (RECONCILIATION §3): until it lands, a mistyped or unknown
  optional field inside a surviving `runtimeAdapters[]` element is dropped with `reasons: []` and
  `rejectedCount` unchanged, and the pipe's drift counter is structurally blind. It is the only thing
  that makes a violation of the ordering below **visible instead of silent**.
- Tasks 1, 2, 3, 4, 5 land in that order. Each is inert without the one before it, which is what
  makes the sequence safe: nothing is applied until Task 6.
- **Task 4 is gated on W3 Task 3 having been re-measured at five sources / 25 cells**
  (RECONCILIATION §1 C8). This task adds the machine scope W3's four-scope matrix cannot answer.
- **Task 12 widens the wire.** Backend merges and **is deployed** before the agent release that
  emits the new field. `AgentIngestValidationPipe` drops unknown keys silently, so the reverse order
  produces no error, no data, and a console that looks correct. Task 8 must be checked against this
  rule too: it is believed to widen values only, not keys, and that belief is a test
  (`TestCodexReportWireKeysAreUnchanged`), not an assumption.
- **Task 8 ships in a release AFTER W8 Task 6** (RECONCILIATION §4 R7). Three tasks across the
  programme turn green surfaces red at once - W5 T4, W4 T8, W8 T6. All three are correct and none
  changes enforcement, but landing them together turns every coverage dashboard red simultaneously
  and the predictable response is a rollback request for a plan working as designed. W8 T6 goes
  first because it is the one that explains the other two. One release note each.
- **Task 6 merges last in the wave**, and only once its named evidence artefact carries all four
  parts with the withdrawal proven first.
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
  exist. **This is an external blocker on the vendor's binary, not engineering work we are skipping,
  and it is why the Codex row is capped below 9.3** (RECONCILIATION §6).
- **It does not widen the Codex dialect pin to cover 0.149.** The owner's own client and the desktop
  app's runtime stay outside the table. The way out is another live measurement on that exact binary,
  never a wider prefix. Task 11 makes this structurally enforced rather than a convention.
- **It does not move the refuse-to-launch branch onto a capability.** `agent_shim.go:520` is the
  fail-closed branch, and a fail-closed checkpoint on an unprovable condition bricked a machine in
  July 2026. It stays on the existing seal until the replacing capability is proven live.
- **It does not fix the uppercase-extension dispatch gap.** `CLAUDE.EXE` normalises to `claude.exe`,
  matches no dispatch branch, and is handed to the real binary with no surface gate, no shim, no
  transport injection and no bypass-flag strip (`cmd/devoid/main.go:242-247`, `:203`, `:222`,
  `:4778-4781`). It is a bypass-resistance defect, it belongs to Wave 3 Tasks 1-2 - which the
  reconciliation sequences **ahead of the whole programme** - and it is named here only so nobody
  reads "machine authority" as covering it.
- **It does not claim anything against production.** No control in this product has been observed
  against the production authority chain (SOT §15). Every live-proof artefact this wave names is a
  local-rig measurement, and it must be labelled as one. Converging these against production signing,
  policy and evidence is Phase 5 - and RECONCILIATION §6 records that **no wave in the programme
  currently owns that convergence**, although it is a required clause of two scorecard rows.
- **It does not make the canary green.** No receipt sink implementation exists outside tests
  (SOT §16.1 C9), so the machine-hook deny twins named in Tasks 6 and 11 are frozen artefacts, not a
  continuous canary. Wave 6 Task 5 owns the receipt sink (RECONCILIATION §2 D1), and until it lands
  "Prevention Active" cannot be earned by this wave's work alone.
