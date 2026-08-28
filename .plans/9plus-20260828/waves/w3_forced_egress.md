# Wave 3 - Make the provider route unavoidable, and stop lying about it when it is not

**Scorecard rows this moves:** Resistance to bypass: 4.0 -> 9.2 (strategy §12). Secondary, not claimed here: Claude interception coverage and Codex interception coverage each get one of their six required evidence items ("direct-egress denial" / "forced route"), but neither row moves without the managed-controls wave.

**Depends on:** Nothing for Tasks 1-5 and 8. Task 6 (WFP) depends only on the daemon running as SYSTEM, which is already true today (`cmd/devoid/setup_installer.go:832-860` registers `Devoid Daemon` with `/SC ONSTART /RU SYSTEM /RL HIGHEST`; `cmd/devoid/main.go:2656-2666` registers the identical args from the CLI path). Task 7's *scorecard* value depends on the Workstream 5 wave (machine-managed vendor settings) because a user-scope route can always be over-ridden by a higher-precedence vendor scope; Task 7 is still worth shipping first because it is the surface that tells you the truth about that.

**Phase:** 2 (strategy §11). **Tasks 1 and 2 are Phase-0-safe and must ship first, ahead of every other wave in the programme** - Task 1 is a one-line security fix on the dispatch path and nothing else in the plan is sound while it stands.

---

## What exists today

Verified against `origin/main` at `5b129523` (Installers). The working checkout in this workspace is `8e49a625`, **1010 commits behind**, and the directory has been renamed (`cmd/cera` locally vs `cmd/devoid` on main), so every path below was read with `git show origin/main:<path>`. Reproduce with:

```sh
cd Installers && git fetch origin && git show origin/main:cmd/devoid/main.go | sed -n '195,250p'
```

### 1. The uppercase-extension walk-past is REAL. Confirmed by reading main.

`cmd/devoid/main.go:242-247`:

```go
func normalizeName(name string) string {
	for _, ext := range []string{".exe", ".cmd", ".bat"} {
		name = strings.TrimSuffix(name, ext)
	}
	return strings.ToLower(name)
}
```

`strings.TrimSuffix` is case-sensitive and runs **before** `strings.ToLower`. The dispatch at `cmd/devoid/main.go:203` is `tool := normalizeName(filepath.Base(os.Args[0]))`, and the branch table at `:207-235` is:

- `isCLIEntrypointName(tool)` (`:238-240`) -> `runCLI()`
- `tool == "git"` -> `RunGitEgress`
- `isAgentShim(tool)` -> `runAgentShim(os.Args[0], os.Args[1:])`
- else -> `runShim(tool)` (package-manager shim)

So `CLAUDE.EXE` -> `claude.exe`, which matches **no** branch and falls to `runShim("claude.exe")`. There is no package-manager config for a tool called `claude.exe`, so the call reaches the real binary with: no policy fetch, no surface gate, no provider deny-list, no agent allowlist, no `--bare` strip, no plugin gate, and **no `ANTHROPIC_BASE_URL` injection**. Windows resolves the filename case-insensitively, so `CLAUDE.EXE` runs the same shim image. Cost of the bypass: one shift key. No privilege, no config edit, no tamper.

Three normalizers in this repo do the same job. **Only this one has the ordering wrong.** The two correct ones are the pattern to copy:

- `internal/inventory/mcp/launch.go:431-440` `trimExeSuffix` - lowercases into `lower`, compares against `lower`, slices `base`.
- `cmd/devoid/ai_client_identity.go:272-283` `processBaseName` - `ToLower` then `TrimSuffix(name, filepath.Ext(name))`.
- `internal/daemon/pidfile.go:116-125` `imageBaseIsDaemon` - `ToLower` then `TrimSuffix(base, ".exe")`.

There is currently **no test** named for `normalizeName`. The only place it is discussed in a test is `cmd/devoid/update_command_test.go:43-48`, whose comment *documents the defect and dismisses it*: "An uppercase `.EXE` suffix would NOT be stripped - and would NOT route to CLI mode in main.go either - so it is correctly NOT canonical; we don't assert it here because it never occurs on disk." The reasoning is wrong: the string does not come from disk, it comes from the caller's command line.

The other two `normalizeName` call sites (`main.go:8280`, `:8290` in `collectRealToolsForOSEnforce`, and `:8876` in `activeLockFilePathAndHash`) are fed from a manifest and from `monitoredShimTools()`, both already lowercase, so the fix is contained.

### 2. Routing is configured, per surface, and each configuration surface is user-writable

**Claude, terminal lane.** `cmd/devoid/agent_shim.go:126-128` `agentProxyBaseURL()` returns `daemonBaseURL() + "/proxy/anthropic"`. `internal/aiagent/aiagent.go:133-144` `TransportEnvFor` returns `("ANTHROPIC_BASE_URL", true)` for Claude, `("OPENAI_BASE_URL", false)` for Codex ("env known, NOT proxied yet"), `("", false)` for Gemini. `buildAgentEnv` (`agent_shim.go:221-250`) injects via `appendEnvIfMissing`, so **a user-set `ANTHROPIC_BASE_URL` is honoured and the proxy is bypassed** on a cooperative endpoint. On a managed endpoint `enforceManagedTransportRoute` (`:306-340`, called at `:599`) overwrites it and records `PROVIDER_ROUTE_BYPASS`.

**Claude, IDE/desktop lane.** `internal/aihooks/transport_route.go:59-77` writes `env.ANTHROPIC_BASE_URL` into the **user-scope** `~/.claude/settings.json` (`internal/aiwire/aiwire.go:54-56`, `:587-620`), asserted rather than deferred-to. This is what converts interception from "a property of how the agent was started" into "a property of the endpoint's configuration". It is still a **user-scope** file, and per strategy §4.1 the vendor's precedence puts enterprise-managed settings above user, project, local and CLI settings - which also means **project scope sits above user scope**. Nothing in this repo reads or reports a project-scope `env.ANTHROPIC_BASE_URL`.

**Codex.** `internal/codexmanaged/transport_route.go:57-68` pins `base_url = http://127.0.0.1:<port>/proxy/openai/v1` in the R5 provider route inside `$CODEX_HOME/managed_config.toml`. `authority_map.go:37-39` says exactly what that file is: "A per-user `$CODEX_HOME/managed_config.toml` is a USER-owned file, whatever its name suggests - that is precisely why an edit there is real policy drift." Drift *detection* exists (`applyRouteOverlay`, `transport_route.go:88-107`: blank -> `provider-route-unset`, mismatched -> `provider-route-stale`), and the reconcile loop rewrites it. Detection plus a five-minute rewrite is not prevention.

**Codex home redirect.** `internal/codexmanaged/bridge.go:32-34` resolves the install target as "the explicit `ConfigRoot` override wins, else the default home-relative `~/.codex`" - it does **not** read `$CODEX_HOME`. `bridge.go:178-200` `resolvedCodexHomeFor` *does* read `$CODEX_HOME`, but only when the calling process's own home matches; from the SYSTEM daemon it returns `""` and the redirect is recorded as un-probed. The shim's user-context reconcile (`cmd/devoid/ai_wire_retry.go:119-165`, called from `agent_shim.go:496`) passes `aiwire.Options{UserHome: home}` and **leaves `CodexHomeOverride` empty**, so on a box with `CODEX_HOME` set to anything else, DeVoid writes the R5 route into `~/.codex` while Codex reads a directory that has none.

**Gemini.** No transport env, no proxy mount, no body parser. `internal/aiagent/aiagent.go:14-15`: "codex/gemini transport DLP is a documented fast-follow (no OpenAI/Gemini body parser exists yet)". The shim runs for `gemini` (`agent_shim.go:53-54`) and gates execution, but **Gemini model traffic is never routed through DeVoid**.

**The proxy itself.** Two loopback mounts on the daemon: `internal/daemon/server.go:687-690` (`/proxy/anthropic/`) and `:789` (`/proxy/openai/`). The listener is `127.0.0.1:<port>` only (`server.go:792`).

### 3. The managed/cooperative hinge gates almost everything above

`cmd/devoid/ai_local_bypass.go:39-51` - `managedEndpoint()` reads a seal from disk, never the daemon ("the attacks that matter happen precisely when the daemon is not answering"). A missing seal answers false. In the shim it gates three call sites: `agent_shim.go:520` (refuse launch on unreachable daemon), `:599` (override a user-set provider route), `:609` (strip `--bare`). **On any endpoint that has not reached attested posture, all three run the cooperative, fail-open side.**

### 4. OS/network enforcement: a complete generate-and-review framework exists, wired to a CLI, and nothing ever applies anything

This is the wave's biggest reuse opportunity and it is genuinely built:

- `internal/netenforce/` - `Policy{Mode: off|monitor|enforce, ProxyURL, RequiredControls[proxy|dns|firewall|mtls], AllowedRemotes}` (`types.go:19-36`), `LoadPolicy`/`SavePolicy`/`NormalizePolicy`/`ValidatePolicy` (`policy.go`), `DetectStatus` (`status.go:11-70`), `EvaluateAlert` (`types.go:98-140`), `GenerateTemplates` writing per-platform artifacts (`templates.go:13-100`), and the P5-2 git-egress backstop with a **spied, never-invoked** `GitEgressBackstopDeployer.Apply` seam (`gitegress_doc.go:38-48`, `gitegress_seams.go`).
- `internal/osenforce/` - WDAC/AppLocker/SELinux/eBPF policy **string generators** (`gitegress_gen_windows_policy.go:94-160`), a per-platform enforceable/not-enforceable matrix (`gitegress_doc.go:41-49`), and a `GitEgressDeployer.CompileAndDeploy` that is "DEFINED but NEVER called".
- CLI surface already wired: `cmd/devoid/main.go:414-417` dispatches `network-enforce` and `os-enforce`; subcommands `status | generate | verify | configure | mark-applied | clear-applied` exist (`main.go:7642-8060`).
- `internal/proxy/egress.go:160-174` `EgressRecipe` emits `devoid-egress-firewall.ps1` etc. with the doctrine stated in the comment: "devoid SHIPS these; the env applies them (**devoid never mutates the host firewall**)".

**Nothing anywhere in this repository ever calls a firewall API.** Every `New-NetFirewallRule` string in the tree is inside a generated artifact or a comment (`internal/netenforce/gitegress_backstop.go:288-296` even emits them commented out). There is no WFP code, no `fwpuclnt.dll`, no `netsh`, no `INetFwPolicy2`. Verified:

```sh
git grep -n -i "netsh\|FwpmEngine\|INetFwPolicy\|New-NetFirewallRule" origin/main -- "*.go" "*.ps1" "*.wxs" "*.cs" | grep -v testdata
```

**The honesty defect in that framework:** `netenforce.Status.Effective()` (`types.go:66-89`) and the `firewall` control both resolve from `MarkedApplied`, which is a human running `devoid network-enforce mark-applied firewall` and a boolean landing in `state.json` (`state.go:17-19`). It is a self-attested green over an unobserved control.

### 5. What is already proven and reusable for the proof side

- `internal/fieldobs/fieldobs.go:81` - `Providers = []string{"anthropic","openai"}`; `internal/daemon/ai_transport_observation.go:60-70` records "this provider's local proxy route carried one real decision on this endpoint", served over token-gated loopback IPC at `GET /v1/ai/transport-observation` (`server.go:588`). This is the **positive** witness. There is no negative witness - nothing observes traffic that did *not* come through the proxy.
- `internal/egressmatrix/` - a test-only enforcement-strength x scenario matrix with the invariant "a STRONG mode either BLOCKS the push OR marks the endpoint NON-COMPLIANT - there is NEVER a silent-success path" (`doc.go:12-19`). Exactly the shape the provider bypass matrix needs; copy the discipline, not the git semantics.

### 6. Genuinely absent

Direct-egress observation of any kind; any OS-level network enforcement; per-session or brokered gateway credentials (the proxy relays the client's own credential unchanged); any project-scope route attestation; any Gemini route; any statement anywhere that distinguishes a native-binary agent install from a `node.exe`-hosted one for the purpose of network identity.

---

## Task 1: Lowercase before stripping the extension

**Files:** `cmd/devoid/main.go` (`normalizeName`, lines 242-247); new `cmd/devoid/name_dispatch_test.go`; edit the stale comment at `cmd/devoid/update_command_test.go:43-48`.

**Blast radius:** Every name-dispatch decision the CLI makes. If wrong, `devoid.exe` itself could stop routing to `runCLI()` and the whole binary becomes inert - the loudest possible failure, caught by any existing CLI test. The realistic risk is the opposite direction: names that previously fell through to `runShim` now route to a real branch. The only names that change behaviour are those whose extension is not all-lowercase (`.EXE`, `.Exe`, `.CMD`, `.BAT`, and mixed case). Nothing the installer lays on disk has such a name - measured: 41 files in `C:\ProgramData\devoid\bin`, all lowercase. So the change affects **only** invocations a human typed in mixed case, which today are ungoverned and after the change are governed. Who notices: nobody, unless they were relying on the bypass.

**Rollback:** Revert the four-line function body. No state, no file format, no wire contract, no persisted value depends on it. Safe to revert at any point with no migration.

- [ ] Write `cmd/devoid/name_dispatch_test.go` with a table-driven `TestNormalizeNameIsCaseInsensitiveOnTheExtension`. Cases and expected results: `claude.exe`->`claude`, `CLAUDE.EXE`->`claude`, `Claude.Exe`->`claude`, `claude.EXE`->`claude`, `npm.CMD`->`npm`, `NPM.BAT`->`npm`, `git.EXE`->`git`, `DEVOID.EXE`->`devoid`, `claude`->`claude`, `claude.js`->`claude.js` (a non-executable extension must NOT be stripped). Run it; it is RED on `CLAUDE.EXE`, `Claude.Exe`, `claude.EXE`, `npm.CMD`, `NPM.BAT`, `git.EXE`, `DEVOID.EXE`.
- [ ] Add `TestNameDispatchRoutesUppercaseInvocationsToTheSameBranch`: for each of `{"claude","CLAUDE.EXE"}`, `{"codex","CODEX.EXE"}`, `{"gemini","GEMINI.EXE"}` assert `isAgentShim(normalizeName(n))` is true; for `{"devoid","DEVOID.EXE"}` assert `isCLIEntrypointName(normalizeName(n))`; for `{"git","GIT.EXE"}` assert `normalizeName(n) == "git"`. RED before the fix.
- [ ] Fix `normalizeName` by copying the shape already used at `internal/inventory/mcp/launch.go:431-440`: lowercase once into a local, compare the suffix against the lowered value, slice the *lowered* value. Keep the extension list `{".exe", ".cmd", ".bat"}` unchanged - **do not** add `.com` or `.ps1` in this task; widening the set is a separate decision with its own blast radius.
- [ ] Replace the comment at `cmd/devoid/update_command_test.go:43-48` with the true statement, and add `"DEVOID.EXE"` to that test's `canonical` slice so the claim is asserted rather than excused.
- [ ] Run `go test ./cmd/devoid/... ./internal/...` and record the pass/fail delta against a `origin/main` baseline built in a throwaway worktree (per the workspace rule about proving whose failure it is).

**Defeat test:** `TestNormalizeNameIsCaseInsensitiveOnTheExtension` - revert `normalizeName` to strip before lowering (i.e. restore the `for ... TrimSuffix` loop ahead of `strings.ToLower`), expect RED with `normalizeName("CLAUDE.EXE") = "claude.exe", want "claude"`.

**Exit:** `go test ./cmd/devoid/ -run 'NormalizeName|NameDispatch' -count=1` passes with **10** normalizer cases and **5** dispatch pairs asserted, and a manual check on a Windows box records `CLAUDE.EXE --version` producing an `agent shim` line in `%ProgramData%\devoid\logs` where it previously produced a `Running in shim mode` line.

---

## Task 2: Cross-check the shim's identity against its own image, and record the mismatch

**Files:** new `cmd/devoid/shim_identity.go`; `cmd/devoid/main.go` (one call after `installManagedProbes()` at `:201`, before the dispatch at `:203`); new `cmd/devoid/shim_identity_test.go`.

**Why:** Task 1 fixes the one normalizer defect we found. `argv[0]` is fully caller-controlled and there will be another one. This makes the *next* normalization gap loud instead of silent, without making dispatch depend on a value that is unsafe to depend on.

**Do not** switch dispatch to `os.Executable()`. On macOS and Linux the shims are **symlinks** to the single `devoid` binary (`install-scripts/production/install.sh:1546`, `:1555`), so `os.Executable()` resolves them all to `.../bin/devoid` and dispatch would collapse to CLI mode for every shim on both platforms. That is the trap in this task.

**Files:** as above.
**Blast radius:** On a cooperative endpoint: one extra `os.Executable()` call and, in the mismatch case, one local integrity-mirror record per launch. Nothing refuses. On a managed endpoint the mismatch refuses the launch, which is the same class of refusal already shipped at `agent_shim.go:520` - a managed box with a genuinely odd invocation name would see a launch refused and a named reason. Who notices: a managed-endpoint developer, with an actionable message.
**Rollback:** Delete the call site line in `main.go`. The package compiles standalone; nothing else references it.

- [ ] Write `TestShimIdentityMismatchIsDetected`: given a fake `imageBase` of `claude.exe` and a dispatch decision of `package-shim`, `classifyShimIdentity` returns `MismatchAgentShimMissed`. Given `imageBase=claude.exe` + `agent-shim`, it returns `MatchOK`. Given `imageBase=devoid.exe` + `cli`, `MatchOK`. RED (no function yet).
- [ ] Write `TestShimIdentityIsWindowsOnlyAndSymlinkSafe`: on non-Windows, `shimIdentityEnabled()` is false; and a fake image path equal to the devoid launcher with an `argv[0]` of `claude` returns `MatchIndeterminate`, never a mismatch. RED.
- [ ] Implement `classifyShimIdentity(imageBase, dispatched string) identityVerdict` as a pure function (no I/O), plus a thin `checkShimIdentity()` that on Windows only calls `os.Executable()`, takes `filepath.Base`, lowercases, strips the extension with the *fixed* `normalizeName`, and compares. Every non-Windows build and every unresolvable `os.Executable()` returns `MatchIndeterminate`.
- [ ] On `MismatchAgentShimMissed`: call `recordLocalDisablementAttempt` (`cmd/devoid/ai_local_bypass.go:88-92`) with `Control: "SHIM_DISPATCH"`, `Reason: "SHIM_IDENTITY_MISMATCH"`, `Response: "dispatch-name-not-image-name"`. **On `managedEndpoint()` only**, print the named reason and exit 1.
- [ ] Add `TestShimIdentityCooperativeNeverRefuses`: with the managed probe faked false, a mismatch records and returns "continue". RED if the managed gate is inverted.

**Defeat test:** `TestShimIdentityCooperativeNeverRefuses` - revert the managed gate to an unconditional refusal, expect RED with `cooperative endpoint refused a launch: want continue, got exit 1`.

**Exit:** Named artifact - a local integrity-mirror record with `control=SHIM_DISPATCH reason=SHIM_IDENTITY_MISMATCH` produced by running a deliberately mis-normalized name on a Windows box, plus **0** refusals on a cooperative endpoint across the whole test matrix.

---

## Task 3: Make the Claude route's real precedence a measured fact, and attest project scope

**Files:** new `internal/aihooks/route_precedence.go` (pure classification) and `internal/aihooks/route_precedence_test.go`; new `cmd/devoid/agent_shim_route_attest.go` (the cwd read, shim-side only); a new row in `devoid doctor` (`cmd/devoid/doctor_scoreboard.go`, which already has a `doctorRowUnverified` state for exactly this).

**Why this is a measurement task, not a code task, first.** The strategy asserts the vendor precedence order (§4.1) and this repo asserts nothing. Before anyone writes an enforcement branch we need to know, for the exact certified binary, which of these wins for `ANTHROPIC_BASE_URL`: process environment, user `~/.claude/settings.json` `env`, project `.claude/settings.json` `env`, project `.claude/settings.local.json` `env`. Guessing here would produce a control that reports green over the losing source.

**Blast radius:** Read-only. The shim gains one `os.Stat` + one small JSON read of files under the developer's cwd, on a path that already reads several files. Worst realistic failure is a slow launch on a huge repo; bound the read at 64 KiB and skip on any error. `doctor` gains one row. Nothing refuses, nothing is written. Who notices: nobody, unless the row goes red.
**Rollback:** Remove the doctor row and the shim call; the `internal/aihooks` function has no other caller.

- [ ] **Measure first.** Against the certified Claude binary in a clean VM, run the 4x2 matrix (each source present/absent x each other source) and record the observed effective base URL per cell. Write the result to `.plans/9plus-20260828/evidence/claude-route-precedence-<version>.md` with the binary version and SHA-256. **No code lands before this file exists.**
- [ ] Write `TestRoutePrecedenceMatchesMeasuredOrder` as a golden test that reads the recorded order from a checked-in fixture and asserts `EffectiveRouteSource(sources)` returns it for all 16 cells. RED (no function).
- [ ] Implement `EffectiveRouteSource` as a pure function over a `RouteSources` struct with one field per scope. Do **not** infer; encode the measured table.
- [ ] Write `TestProjectScopeOverrideIsReportedNotSilent`: given a project `.claude/settings.json` carrying an `env.ANTHROPIC_BASE_URL` that is not `aihooks.ProxyBaseURL()`, the shim-side attestor returns `RouteAttest{Overridden: true, Scope: "project", Value: <redacted host only>}` and emits a `PROVIDER_ROUTE_BYPASS` record with `Response: "project-scope-override-observed"`. RED.
- [ ] Add the `doctor` row `AI provider route (Claude)` with three states: `routed (user scope)`, `overridden by <scope>`, `unverified`. Default to `unverified` when the precedence fixture is absent for the observed binary version - never to `routed`.

**Defeat test:** `TestProjectScopeOverrideIsReportedNotSilent` - revert the attestor to read only the user-scope file, expect RED with `want Overridden=true scope=project, got Overridden=false`.

**Exit:** Named artifact `.plans/9plus-20260828/evidence/claude-route-precedence-<version>.md` containing **16** measured cells, plus a `devoid doctor --json` run on a box with a planted project-scope override showing `"aiProviderRouteClaude":"overridden"`.

---

## Task 4: Follow `CODEX_HOME` where Codex actually reads it

**Files:** `cmd/devoid/ai_wire_retry.go` (`maybeReconcileAIWireUserContext`, lines 119-165) and its call site `cmd/devoid/agent_shim.go:496`; `internal/aiwire/aiwire.go` (`Options.CodexHomeOverride`, line 70 - **already exists, this task only fills it**); new `cmd/devoid/ai_wire_retry_codexhome_test.go`.

**Why:** `internal/codexmanaged/bridge.go:32-34` writes into `~/.codex` unless `ConfigRoot` is set; `bridge.go:191-198` shows the running Codex would use `$CODEX_HOME`. The shim runs in the user's own session, so it is the one component that can read `$CODEX_HOME` honestly (the SYSTEM daemon cannot, and correctly reports it un-probed). Today the shim passes no override, so on a `CODEX_HOME`-redirected box DeVoid writes a route into a directory Codex never reads and then attests it. This is a connect-what-exists fix: one field, already documented, never populated.

**Blast radius:** Only boxes where `CODEX_HOME` is set to something other than `~/.codex` - today those boxes are silently ungoverned, so the change can only add governance. The risk is writing a managed profile into an unexpected directory: guard it. Refuse to write when the resolved home is not an absolute path, is a symlink to outside the user's profile, or is not writable by the current user. Who notices: a developer with a relocated `CODEX_HOME` gets governed for the first time; if the guard trips, `hooks-status` shows `provider-route-unset` instead of green.
**Rollback:** Pass `CodexHomeOverride: ""` again - one line. The files already written under the redirected home are inert to Codex only if you also delete them; document the cleanup command in the task's PR body (`devoid ai uninstall-hooks --codex-home <path>`).

- [ ] Write `TestUserRetryFollowsCodexHomeEnv`: with `CODEX_HOME` set to a `t.TempDir()`, the reconcile options handed to `aiwire.Reconcile` carry `CodexHomeOverride` equal to that dir. RED (currently empty).
- [ ] Write `TestUserRetryRefusesUnsafeCodexHome`: relative path, non-existent parent, and a path outside the user's home each yield `CodexHomeOverride: ""` **and** a `PROVIDER_ROUTE_BYPASS` record with `Response: "codex-home-redirect-unsafe"`. RED.
- [ ] Write `TestCodexHomeDivergenceIsRecordedEvenWhenWireSucceeds`: when `$CODEX_HOME != ~/.codex`, exactly one record with `Response: "codex-home-redirect-observed"` is emitted per throttle window - not per launch (the retry stamp at `ai_wire_retry.go:94-106` already throttles; reuse it, do not add a second timer).
- [ ] Implement: resolve `$CODEX_HOME` in the shim, run the safety guard, populate `Options.CodexHomeOverride`.
- [ ] Re-run `go test ./internal/aiwire/... ./internal/codexmanaged/... ./cmd/devoid/...` and confirm the frozen S-cfg corpus goldens are untouched (this task must not change `classifyProvider` or any golden - if it does, stop and re-scope).

**Defeat test:** `TestUserRetryRefusesUnsafeCodexHome` - revert the guard so any non-empty `$CODEX_HOME` is passed straight through, expect RED with `unsafe CODEX_HOME accepted: want override="", got override="../../elsewhere"`.

**Exit:** On a box with `CODEX_HOME` pointed at a scratch directory, `devoid ai hooks-status codex` reports the R5 provider route `installed` **in that directory**, and `internal/codexmanaged` reports `AttestedHome == ResolvedHome`. Number: **0** frozen-corpus goldens changed.

---

## Task 5: A direct-egress witness - observe first, enforce never (in this task)

**Files:** new package `internal/aiegress/` - `witness.go` (pure classification), `conntable_windows.go` (the `iphlpapi` reader), `conntable_other.go` (stub), `witness_test.go`; wiring in `internal/daemon/server.go` next to the existing sweep loops; a new counter surfaced through the existing `GET /v1/ai/transport-observation` response shape (`internal/daemon/ai_transport_observation.go:41-51`).

**Why this task comes before the WFP task.** `fieldobs` already answers "did the route carry a decision" (`internal/daemon/ai_transport_observation.go:60-70`). Nothing answers "did anything go around it". Without that number you cannot state a bypass-matrix result, you cannot size the WFP allowlist, and you cannot tell an enforcement regression from a quiet week. This task is pure observation: no filter, no refusal, no network mutation, so it can ship on every endpoint immediately and it is the input to every later claim.

**Blast radius:** One polling goroutine in the SYSTEM daemon. If wrong: wasted CPU, or false "direct egress" records that make a healthy endpoint look non-compliant on a report. It cannot block, refuse, delay, or alter a single packet. Bound it: a 1 Hz default poll, a hard cap on records per hour, and a kill switch in the existing `netenforce` policy (`Mode == off` disables it). Who notices: whoever reads the coverage row.
**Rollback:** Set `netenforce` mode to `off`, or revert the single `go s.runDirectEgressWitness(ctx)` line.

- [ ] Write `TestWitnessClassifiesLoopbackGatewayAsRouted`: a connection row `{pid: X, remote: 127.0.0.1:19280}` owned by a certified runtime PID classifies as `Routed`. RED.
- [ ] Write `TestWitnessClassifiesExternal443AsDirect`: `{pid: X, remote: 160.79.104.10:443}` from the same PID classifies as `DirectEgress` with the destination recorded as **port + address family only**, never the full address and never a hostname (this is the endpoint's own telemetry floor; do not widen it).
- [ ] Write `TestWitnessIgnoresNonRuntimeProcesses`: a PID not in the runtime set yields no record, regardless of destination. RED.
- [ ] Write `TestWitnessIsSamplingAndSaysSo`: `WitnessResult.Method == "poll"` and `WitnessResult.IntervalMS` is populated, so a consumer cannot read "0 direct connections" as proof. RED.
- [ ] Implement `conntable_windows.go` over `iphlpapi.dll!GetExtendedTcpTable` with `TCP_TABLE_OWNER_PID_ALL` for `AF_INET` and `AF_INET6`, plus `GetExtendedUdpTable` for `UDP_TABLE_OWNER_PID`. **Discovery command before writing it:** `go doc golang.org/x/sys/windows | grep -i "ExtendedTcpTable\|MIB_TCPROW_OWNER_PID"` - if `x/sys` already exports these, use them; if not, declare them with `windows.NewLazySystemDLL("iphlpapi.dll")`. `golang.org/x/sys v0.38.0` is already a direct dependency (`go.mod:14`), so no new module is added either way.
- [ ] Runtime PID identification: match on the process image path against the set the certified profile names (Task 8's inventory), **not** on the process name. Use the existing `internal/system` process snapshot helper that `cmd/devoid/ai_client_identity.go:272-283` already relies on rather than adding a second enumerator.
- [ ] Extend `AITransportObservationResponse` with a `directEgress` map keyed by the same closed provider vocabulary in `internal/fieldobs/fieldobs.go:81`, plus an `observationMethod` field. Additive JSON fields only - the console tolerates unknown keys, but **the Backend must ship any consuming change before an agent release carries it** (see Wave exit criteria).

**Defeat test:** `TestWitnessIsSamplingAndSaysSo` - revert `Method` to the constant `"complete"`, expect RED with `witness claims complete coverage: want method="poll"`. This is the defeat test that matters, because the failure mode of this task is not a crash, it is a number that looks like proof.

**Exit:** Number - a 60-minute run on a real box with a deliberately bypassed Claude (user-set `ANTHROPIC_BASE_URL`) records **>=1** `DirectEgress` observation, and the same run with the route intact records **0**. Named artifact: `.plans/9plus-20260828/evidence/direct-egress-witness-baseline.md` carrying both numbers and the poll interval.

---

## Task 6: WFP / ALE application-scoped direct-egress denial, in a dynamic session, off by default

**Files:** new `internal/aiegress/wfp_windows.go` (interop), `internal/aiegress/wfp_plan.go` (pure filter-plan builder), `internal/aiegress/wfp_stub.go` (non-Windows), `internal/aiegress/wfp_plan_test.go`; a `Deployer` seam mirroring `internal/netenforce/gitegress_seams.go`; policy fields on `netenforce.Policy`; CLI verbs under the existing `devoid network-enforce` dispatch (`cmd/devoid/main.go:414`).

### What WFP can actually do here, stated honestly

**It can:** deny an outbound connection at `FWPM_LAYER_ALE_AUTH_CONNECT_V4` / `_V6`, scoped to one application, for TCP and UDP, covering IPv4 and IPv6 and therefore QUIC, and it can permit a specific loopback destination for that same application at a higher weight so the DeVoid gateway stays reachable. Filters live in our own sublayer, so a user-added Windows Firewall "allow" rule cannot re-open the path.

**It cannot:** redirect. User-mode WFP filter management is permit/block only; transparent redirection needs `FWPS_LAYER_ALE_*_REDIRECT`, which is a kernel callout driver. We are not writing one, and the strategy agrees (§ Workstream 4 D, and Avoid list). So the design is "deny direct, and the configured route is the only thing left", not "capture everything".

**What it requires:** `FwpmEngineOpen0` + `FwpmFilterAdd0` need `FWPM_ACTRL_ADD` on the engine, granted by default to `Administrators` and `SYSTEM`. The DeVoid daemon already runs as `NT AUTHORITY\SYSTEM` at `HighestAvailable` (`cmd/devoid/setup_installer.go:851-859`), so **no MDM and no additional elevation is required to install these filters.** That is a real, verified fact about the shipping install, not an aspiration. (Note the orphaned `windows-installer/msi-build/scripts/install_daemon_task.vbs`, which registers `/RL LIMITED /IT` - it is referenced by nothing in `windows-installer/` and is dead; confirm with `git grep -n install_daemon_task origin/main -- windows-installer/` returning empty before relying on the SYSTEM claim.)

**What genuinely needs MDM or App Control, and must not be written as an engineering task:**

1. **Stopping a local administrator from removing the filters.** Nothing local can do this. The certified scope (strategy §2.1) already excludes hostile local administrators. Detect-and-revoke is the honest answer, and Task 7 is where it lands.
2. **A stable application identity across vendor update paths.** `FwpmGetAppIdFromFileName0` derives the app id from the **file path**. A copied or moved runtime binary is a different app id and is not covered. App Control / AppID tagging gives a path-independent identity, and for a fleet that means a WDAC policy deployed through Intune/MDM. **Do not write a task that builds AppID tagging without MDM.** The safe subset is: re-derive app ids whenever the runtime identity changes, and revoke the certificate when a runtime binary appears at an uncertified path (Task 7).
3. **Preventing local firewall-rule merge from weakening org policy.** Only relevant if you use Windows Firewall rules. We are not - our own sublayer sidesteps the merge question entirely. This is a reason to prefer WFP over `New-NetFirewallRule`, not a reason to ask for MDM.

**The identity problem that decides the scope of this task, and it is not a Windows problem.** ALE identifies the process that owns the socket. A Claude Code installed through npm is `node.exe` running a JS entry point; the socket owner is `node.exe`, not `claude.exe`. Blocking `node.exe` fleet-wide would break every Node tool on the machine and is exactly the kind of change that gets an agent uninstalled. Therefore:

| Surface | ALE app-scoped denial | Reason |
|---|---|---|
| Codex CLI (native `codex.exe`) | **Yes** | Own process, own image path |
| Claude Code, native-binary install | **Yes** | Own process |
| Claude Code, npm/`node.exe`-hosted | **No** | Socket owner is a shared interpreter; scoping is impossible without breaking unrelated tools |
| Claude Desktop / Codex desktop app | **Yes** | Own process |
| VS Code / JetBrains extension host | **No** | Socket owner is the IDE's shared extension host |
| WSL2 | **No** | Host ALE does not cover the lxss network path; already a separate profile per strategy §2.1 |

The certified 9+ profile must therefore **name the native-binary install as a requirement**, and every other row above is a declared-uncovered cell, not a silent gap. That is a narrowing of the claim, not a weakening of a guard.

### Why a dynamic session, and why not Windows Firewall rules

A persistent filter (or a `New-NetFirewallRule -Program ... -Action Block`) survives the daemon's death. If the daemon dies and never comes back, the runtime can reach neither the provider nor the gateway and the developer's agent is bricked - that is precisely the July 2026 shape the owner named, and an uninstalled agent protects nobody. `FwpmEngineOpen0` with `FWPM_SESSION_FLAG_DYNAMIC` makes every filter added on that session **automatically removed by Windows when the session closes or the process exits**. The provable condition for this fail-closed branch is therefore: *"the DeVoid gateway process is alive"* - and it is provable because the same process holds the filters. No gateway, no filters, agent works. That is the property that makes this shippable.

The cost is honest and must be stated in the product surface: **filters do not survive a reboot** and there is a window between boot and daemon start. That window is covered by the managed-endpoint shim refusal (`agent_shim.go:520`) and by the certificate going stale, not by WFP. A persistent-filter "hard" profile is a separate, opt-in, later decision with its own watchdog; do not ship it in this wave.

**Files:** as above.
**Blast radius:** The largest in this wave by an order of magnitude. A wrong filter plan silently kills a developer's AI tooling, or - worse - kills something else on the box. Containment: filters are app-scoped to an explicit list of image paths and are never installed for `node.exe`, `Code.exe`, `powershell.exe`, `cmd.exe`, `git.exe` or any image not on the certified list (enforce this as a hard deny-list in the plan builder, tested); the whole feature is behind `netenforce.Policy.Mode == "enforce"` **plus** a new explicit `ProviderEgressDenial` field that defaults false; and the session is dynamic so process death removes everything. Who notices immediately: the developer whose agent stops working - which is why the monitor stage below is mandatory.
**Rollback:** Three independent levers, any one of which is sufficient: (1) `devoid network-enforce configure --provider-egress-denial off` and the daemon drops the filters on the next tick; (2) `taskkill` the daemon - Windows removes the dynamic filters itself; (3) revert the code. There is no persistent state to clean up. This is the reason for the dynamic session.

- [ ] **Stage 0 - plan only, no interop.** Write `TestFilterPlanPermitsLoopbackGatewayAtHigherWeight`: the plan for a runtime at path P and gateway port 19280 contains exactly one permit filter (remote `127.0.0.1/32` and `::1/128`, remote port 19280, app id P) at a strictly greater weight than the block filter (app id P, all remote addresses), in one dedicated sublayer. RED.
- [ ] Write `TestFilterPlanRefusesSharedInterpreters`: `BuildPlan` returns an error naming the image for each of `node.exe`, `Code.exe`, `python.exe`, `powershell.exe`, `cmd.exe`, `git.exe`, `devoid-daemon.exe`. RED. **This is the test that stops this feature from taking a machine down.**
- [ ] Write `TestFilterPlanCoversV4V6TcpAndUdp`: the plan enumerates `{V4,V6} x {TCP,UDP}` = 4 block filters, so QUIC on UDP/443 is covered.
- [ ] Write `TestFilterPlanPermitsCertifiedAncillaryOnly`: given the Task 8 ancillary inventory, the plan permits exactly the entries marked `route: direct` and nothing else; an empty inventory yields DNS-only (UDP/TCP 53) plus loopback.
- [ ] Write `TestDeployerNeverInvokedByPlanning` with a spy deployer, mirroring `internal/netenforce` `TestDeployerSeamNeverInvokedDuringGeneration`. RED until the seam exists.
- [ ] **Stage 1 - interop, behind the seam.** Implement `wfp_windows.go` over `fwpuclnt.dll`: `FwpmEngineOpen0` (with `FWPM_SESSION_FLAG_DYNAMIC`), `FwpmSubLayerAdd0`, `FwpmFilterAdd0`, `FwpmFilterDeleteById0`, `FwpmGetAppIdFromFileName0`, `FwpmEngineClose0`. Five entry points, one sublayer GUID, one filter struct. Non-Windows builds get the stub and the plan builder still compiles and tests.
- [ ] **Stage 2 - monitor mode is mandatory and is the default first deployment.** `ProviderEgressDenial: "monitor"` installs **no filters at all** and instead reports what the plan *would* deny using the Task 5 witness. Only `"enforce"` installs filters. `TestMonitorModeInstallsZeroFilters` with the spy deployer asserting zero `Apply` calls.
- [ ] **Stage 3 - a self-test before the first block filter is ever added.** On entering enforce, the daemon must first prove the gateway is reachable from a child process at the permitted loopback destination. If the probe fails, refuse to install and record `provider-egress-denial-refused-gateway-unproven`. `TestEnforceRefusesWhenGatewayProbeFails`. This is the named provable condition; without it the branch is exactly the July 2026 brick.
- [ ] Add `devoid network-enforce provider-egress status|plan|configure`, reusing the existing dispatch at `cmd/devoid/main.go:414-415` and the existing `--json` conventions. `plan` prints the artifact and applies nothing - the same review-first doctrine `internal/proxy/egress.go:160-165` already states.

**Defeat test:** `TestFilterPlanRefusesSharedInterpreters` - remove `node.exe` from the plan builder's deny-list, expect RED with `BuildPlan accepted shared interpreter image "node.exe"; a block filter on a shared interpreter takes the machine down`.

**Exit:** Number - on a clean Windows 11 VM running the certified native-binary Claude and Codex, with `provider-egress-denial=enforce`, the Task 7 bypass matrix records **0** direct provider connections across all cells marked *enforceable* in the surface table above, and **0** regressions in the ancillary suite (agent starts, authenticates, completes a turn, and updates on its certified path). Named artifact: `.plans/9plus-20260828/evidence/wfp-ale-vm-run-<date>.md`.

---

## Task 7: The certified provider bypass matrix, and coverage that is observed rather than asserted

**Files:** new test-only package `internal/aiegressmatrix/` (`doc.go`, `README.md`, `aiegress_matrix_test.go`), copying the structure and the never-silent invariant of `internal/egressmatrix/`; changes to `internal/netenforce/status.go` and `internal/netenforce/types.go` for the observed-control change; `cmd/devoid/main.go:7960-7995` for the `mark-applied` behaviour.

**Why:** The strategy's 9+ exit gate is a matrix result, not a feature list. And today `netenforce.Status.Effective()` can read true because a human ran `mark-applied firewall` - a self-attested green over an unobserved control, which is the exact "no-op satisfaction" §12 forbids for this row.

The matrix cells, each with a required outcome of **routed through DeVoid** or **fails visibly** (never "silently direct"):

| # | Bypass attempt | Certified expectation |
|---|---|---|
| 1 | `CLAUDE.EXE` / `Claude.Exe` / `npm.CMD` | routed (Task 1) |
| 2 | absolute path to the real `claude` binary | routed via settings.json (Task 3 measurement decides which scope) |
| 3 | copy the real binary to a new path and run it | direct egress observed + certificate revoked (path-based app id cannot cover it; **this cell is declared, not solved**) |
| 4 | user-set `ANTHROPIC_BASE_URL` in the process env | routed on managed (`agent_shim.go:599`); **honest failure on cooperative** |
| 5 | project `.claude/settings.json` `env` override | reported, and demoted (Task 3) |
| 6 | `CODEX_HOME` redirect | routed (Task 4) |
| 7 | hand-edited `base_url` in `managed_config.toml` | detected as `provider-route-stale` (`transport_route.go:88-107`) and rewritten |
| 8 | alternate provider table in Codex config | fails visibly or declared uncovered |
| 9 | IPv6 to the provider | denied (Task 6, `_V6` filters) |
| 10 | QUIC / UDP 443 | denied (Task 6, UDP filters) |
| 11 | system proxy (`HTTPS_PROXY`) pointed elsewhere | denied by ALE regardless of proxy config |
| 12 | VS Code extension host | **declared uncovered** for ALE; routed only by config |
| 13 | Claude Desktop | routed + denied |
| 14 | npm/`node.exe`-hosted Claude | **declared uncovered** for ALE |
| 15 | retry/reconnect after a deny | Codex per-turn deny persists 60 min (existing); Claude has no equivalent - **declared** |
| 16 | daemon killed mid-session | filters vanish (dynamic session), shim refuses on managed, cooperative fails open and says so |

**Blast radius:** The matrix package is test-only and mutates nothing (mirror `internal/egressmatrix`'s spy-deployer discipline: assert zero `Apply` calls). The `netenforce` change is the risky half: making `firewall` resolve from observation rather than `MarkedApplied` will flip existing endpoints from `Effective()==true` to `false`. That is the gate working, exactly like Backend C7 in the source of truth §16.1 - but it must not fire an alert storm. Contain it: introduce the observed state as a **new** control name (`provider-egress`) rather than redefining `firewall`, and make `mark-applied provider-egress` return a non-zero exit with the message that this control cannot be self-attested.
**Rollback:** The new control is additive; drop it from `RequiredControls` and posture returns to today's behaviour exactly.

- [ ] Write the matrix skeleton with all 16 cells present and every unimplemented cell asserting `t.Skip` **with the reason string checked by a meta-test** - `TestEveryMatrixCellIsEitherAssertedOrNamed` fails if a cell is skipped without a reason from the closed vocabulary `{"declared-uncovered","blocked-on-task-N","external-blocker"}`. RED first.
- [ ] Write `TestNoCellIsSilentlyDirect`: for every cell, the recorded outcome is in `{routed, visible-failure, declared-uncovered}` and never `silent-direct`. This is the wave's single hardest invariant.
- [ ] Write `TestProviderEgressControlCannotBeSelfAttested`: `netenforce.MarkControlApplied(dir, "provider-egress")` returns an error naming the control. RED.
- [ ] Write `TestProviderEgressControlReadsObservedFilters`: with a fake filter enumerator returning the planned filter GUIDs, the control is applied; with an empty enumeration it is missing, regardless of `state.json`. RED.
- [ ] Implement the `ObservedControls` seam in `netenforce.DetectStatus` (an injected interface, defaulting to a Windows enumerator that lists our sublayer's filters and to a nil-returning stub elsewhere).
- [ ] Fill the cells that Tasks 1-6 unlock; leave 3, 12, 14, 15 as `declared-uncovered` with their reasons.

**Defeat test:** `TestNoCellIsSilentlyDirect` - change any one cell's recorded outcome to `silent-direct`, expect RED with `matrix cell 4 recorded silent-direct; a bypass matrix may not contain a silent success`.

**Exit:** Number - **16/16** cells present, **12** asserted, **4** declared-uncovered with named reasons, **0** silent-direct. Named artifact: `internal/aiegressmatrix/README.md` with the test-to-cell map, in the style of `internal/egressmatrix/README.md`.

---

## Task 8: Inventory the ancillary traffic and declare Gemini out of the certified profile

**Files:** new `.plans/9plus-20260828/evidence/ancillary-traffic-inventory.md`; a checked-in machine-readable copy at `internal/aiegress/testdata/ancillary.json` consumed by the Task 6 plan builder; a Gemini row in the certified-profile document and one string change in the shim's user-facing status output.

**Why:** The strategy is explicit that model traffic, login, updates, telemetry, WebFetch, hosted tools and provider discovery are different things and each needs a decision (route / allow-direct / disable / declare unsupported). Task 6's default-deny is only shippable once that list exists - a deny-all with an unknown ancillary set is how you brick a fleet's `claude login`.

For Gemini the honest answer is short: `internal/aiagent/aiagent.go:127` returns no transport env, there is no `/proxy/gemini` mount, and `aiagent.go:14-15` says no Gemini body parser exists. Building one is a different wave. **Do not** write a task that blocks Gemini's launch to make the coverage number look better - the agent allowlist already exists (`internal/core/backend/ai_prompt.go:451-452`) and is the administrator's decision, not ours.

**Blast radius:** Documentation plus one JSON fixture and one status string. The JSON fixture becomes load-bearing only in Task 6. Who notices: a customer reading the certified-scope document, and an administrator who now sees `gemini: execution-governed, traffic not routed` instead of an unqualified row.
**Rollback:** Revert the strings; the fixture is only read when provider-egress denial is enabled.

- [ ] Enumerate, per certified surface, every outbound destination class the runtime uses: model API, auth/login, update check and download, telemetry, hosted tools, provider discovery, marketplace/plugin fetch. Capture it by running each certified binary in the clean VM with the Task 5 witness enabled and a permissive plan, for one full session including login and an update check.
- [ ] Assign each entry exactly one of `route | direct | disable | unsupported`, with a one-line reason. An entry with no decision fails the review.
- [ ] Write `TestAncillaryInventoryIsTotalAndTyped`: every entry has a non-empty destination class, a decision from the closed set, and a reason; the file parses; unknown decisions fail. RED.
- [ ] Write `TestPlanPermitsOnlyDirectDecisions` (pairs with Task 6): the plan's permit set equals the `direct` entries plus loopback plus DNS.
- [ ] Add the Gemini row to the certified-profile document with the three facts (execution-governed by the shim, traffic not routed, no body parser), and change the status string so it says so.

**Defeat test:** `TestAncillaryInventoryIsTotalAndTyped` - add an entry with `decision: ""`, expect RED with `ancillary entry "claude:update" has no decision; every ancillary flow must be routed, allowed, disabled or declared unsupported`.

**Exit:** Named artifact `.plans/9plus-20260828/evidence/ancillary-traffic-inventory.md` with **>=1** entry per (certified surface x destination class) and **0** entries lacking a decision.

---

## Wave exit criteria

1. **The uppercase walk-past is closed and pinned.** `go test ./cmd/devoid/ -run 'NormalizeName|NameDispatch'` passes with 10 normalizer cases and 5 dispatch pairs. Defeat test: `TestNormalizeNameIsCaseInsensitiveOnTheExtension`.
2. **A dispatch-name gap can no longer be silent.** At least one `SHIM_IDENTITY_MISMATCH` record produced on a real Windows box; **0** cooperative-endpoint refusals. Defeat test: `TestShimIdentityCooperativeNeverRefuses`.
3. **Claude route precedence is measured, not assumed.** 16-cell evidence file exists for the certified binary; `devoid doctor` reports `unverified` for any binary version with no such file. Defeat test: `TestProjectScopeOverrideIsReportedNotSilent`.
4. **A relocated `CODEX_HOME` is governed.** `AttestedHome == ResolvedHome` on a redirected box; **0** frozen S-cfg goldens changed. Defeat test: `TestUserRetryRefusesUnsafeCodexHome`.
5. **Direct egress is observable.** Baseline artifact records >=1 direct observation with the route deliberately bypassed and 0 with it intact, and the surface states `method=poll`. Defeat test: `TestWitnessIsSamplingAndSaysSo`.
6. **Denial exists, is app-scoped, and cannot brick.** VM run artifact shows 0 direct provider connections in the enforceable cells and 0 ancillary regressions; killing the daemon removes every filter within one second (measured). Defeat test: `TestFilterPlanRefusesSharedInterpreters`.
7. **The matrix has no silent success.** 16/16 cells, 12 asserted, 4 declared, 0 silent-direct; `mark-applied provider-egress` exits non-zero. Defeat tests: `TestNoCellIsSilentlyDirect`, `TestProviderEgressControlCannotBeSelfAttested`.
8. **Ancillary traffic is decided.** 0 entries without a decision. Defeat test: `TestAncillaryInventoryIsTotalAndTyped`.

**Ordering rule for the release, and it is not optional.** Task 5 adds fields to the `/v1/ai/transport-observation` response and, if the console is to render them, to whatever Backend surface consumes them. `AgentIngestValidationPipe` **drops unknown keys rather than 400ing**, so an agent shipped ahead of the Backend loses those fields silently - no error, no data, and it looks like it worked. Therefore: **Backend change deployed first, agent release second**, every time a field is added here. Tasks 1, 2, 3, 4, 6, 7 and 8 add no wire fields and are agent-only.

---

## What this wave deliberately does NOT do

- **No kernel callout driver, and therefore no transparent redirection.** User-mode WFP is permit/block only. Everything here is "deny the direct path so the configured route is the only one left", never "capture traffic the client did not agree to send us". The strategy's own Avoid list says not to start with a driver, and nothing found here proves one is necessary yet.
- **No broad TLS interception.** The proxy terminates only traffic that was configured to use it. We are not becoming a corporate MITM.
- **No IP or FQDN provider blocklist.** Provider endpoints sit on shared CDN ranges that move. The denial is app-scoped and default-deny with an allowlist, which does not rot when a cloud range changes.
- **No credential brokering, and no claim of credential isolation.** Issuing short-lived per-session gateway credentials and holding the real upstream secret in the gateway is a large change to the authentication path with a very large blast radius (a mistake locks every developer out of their agent). The strategy permits the lower tier explicitly: this wave keeps credentials client-held and requires the assurance tier to **say so**, rather than implying gateway isolation the product does not have.
- **No persistent firewall rules and no boot-time enforcement.** Dynamic-session filters vanish when the daemon exits. That is a deliberate trade: a reboot-to-daemon-start window stays open, and it is covered by the managed shim refusal and by certificate staleness, not by WFP. A persistent "hard" profile is a separate decision with a watchdog design of its own.
- **No App Control / AppID tagging.** It is the correct answer to the copied-binary cell (matrix #3) and it genuinely requires a WDAC policy, which for a fleet means Intune/MDM the customer may not have. Writing it as an engineering task would be pretending an external blocker is code. The safe subset shipped here is detect-and-revoke.
- **No ALE coverage for `node.exe`-hosted agents or IDE extension hosts.** The socket owner is a shared interpreter and scoping a block to it would break unrelated tooling. These are declared-uncovered cells in the matrix and a named requirement (native-binary install) in the certified profile.
- **No WSL2, macOS or Linux enforcement.** Host ALE does not cover the lxss network path; `internal/osenforce/gitegress_doc.go:47-49` already models WSL-from-host as a first-class not-enforceable cell and that judgement carries over unchanged.
- **No Gemini routing.** There is no Gemini body parser and no proxy mount. Gemini stays execution-governed and traffic-ungoverned, and the product says that in words.
- **No change to any existing guard.** Nothing here weakens `managedEndpoint()`, the surface gate, the provider deny-list, the `--bare` strip, the proxy's fail-closed default, or the malicious floor. Task 7 *tightens* one posture control by adding a new observed one beside the self-attested one rather than by loosening anything.
- **No deploy.** Every item above is code and evidence. Deploying needs a fresh, explicit ask from the owner, every time.
