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

# Wave 3 - Make the provider route unavoidable, and stop lying about it when it is not

**Scorecard rows this moves:** Resistance to bypass: 4.0 -> 9.2 (strategy §12). Secondary, not claimed here: Claude interception coverage and Codex interception coverage each get one of their six required evidence items ("direct-egress denial" / "forced route"), but neither row moves without the managed-controls wave (`w4_vendor_authority.md`).

**Depends on:** Nothing for Tasks 1-5 and 8. Task 6 (WFP) depends only on the daemon running as SYSTEM, which is already true today (`cmd/devoid/setup_installer.go:832-859` registers `Devoid Daemon` with `/SC ONSTART /RU SYSTEM /RL HIGHEST`; `cmd/devoid/main.go:2653-2666` `systemDaemonTaskCreateArgs` returns the identical args from the CLI path). Task 7's *scorecard* value depends on `w4_vendor_authority.md` (machine-managed vendor settings) because a user-scope route can always be over-ridden by a higher-precedence vendor scope; Task 7 is still worth shipping first because it is the surface that tells you the truth about that.

**Phase:** 2 for Tasks 3-8 (strategy §11; RECONCILIATION §6 phase map). **Tasks 1 and 2 are Phase 0 and must ship ahead of every other wave in the programme** - RECONCILIATION §3 sequencing item 8 puts them there by name. Task 1 is a four-line security fix on the dispatch path and nothing else in the plan is sound while it stands.

> **File-number vs workstream-number.** This file is `w3_forced_egress.md` but it implements the strategy's **Workstream 4**. When `w8_coverage_truth.md` says "the Workstream 4 wave lands WFP denial" it means *this file*. Always cross-reference other waves by **filename**, never by number.

---

## How an agent executes this wave

You are one agent holding one task. You cannot see the rest of this document, and the person who wrote your task is not available. These rules are not style preferences; each one is here because ignoring it has already cost this programme a day or an endpoint.

**1. Work in a git worktree under `C:/cwt/`.** One worktree per task, created from `origin/main`, never in the shared checkout:

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git worktree add C:/cwt/w3-t<N> -b w3/t<N>-<slug> origin/main
cd /c/cwt/w3-t<N>
```

The shared checkout at `Ceragon/Installers` is **1010 commits behind `origin/main`** and the directory has been renamed (`cmd/cera` there vs `cmd/devoid` on main). Editing it is editing the wrong tree.

**2. NEVER run `git stash` anywhere in this workspace.** `refs/stash` is a single stack shared across every worktree of a repo. A `git stash pop` in your worktree can restore - and then destroy - another concurrent session's uncommitted work. This has happened twice in one day here. If you need a clean tree, commit to your own branch. There is no exception.

**3. Commit each task immediately, never batch.** A crash and three API outages hit one campaign on this programme and only committed work survived. Commit when a test goes green, not at the end of the wave.

**4. `git add` explicit paths. Never `git add -A`, never `git add .`** This workspace has untracked scratch directories, patch files and evidence trees everywhere; `-A` sweeps them into your commit.

**5. A test you cannot make RED has not run.** Paste the RED run and the GREEN run into your report. Five inert-test shapes have shipped green on this codebase while defending nothing:

1. **Source-text assertions** (`readFileSync` + `toContain`). Satisfiable by pasting the asserted code *inside a comment*.
2. **Hand-built struct literals.** Cannot notice the real deliverable was deleted; a test comparing one hand-written literal to another passes in both the RED and GREEN runs.
3. **Defending ONE branch of a two-branch route.** CX-10 was fixed and fully tested on the Claude branch while the Codex lane - the lane the defect lived under - stayed dead, because `TransportEnvFor("codex")` returns `proxied=false` so the identity was never minted. **This is this wave's exact shape.** Check Codex *and* Claude, install *and* uninstall, stored row *and* rendered console. One route here turned out to have three branches (runs / suppressed / unknown) and the third was the broken one.
4. **Exercising only KNOWN members of a closed set.** Cannot tell a fail-safe allowlist from a fail-open deny-list. Feed it something genuinely unknown and see which way it fails. (Task 6 exists because of this shape.)
5. **A test whose PRECONDITION silently skips the assertion.** If a test has a precondition, assert it loudly.

**6. Read-only on source you were not told to change.** Every task below names its files. Anything else is reference.

**7. If a PRECONDITION fails, STOP AND REPORT.** Do not substitute a plausible-looking replacement path, symbol or command. This codebase has a documented history of agents inventing substitutes that compile, pass CI and are wrong. A stopped task is cheap; an invented one is not.

**8. Do not commit, deploy, or dispatch a workflow.** Deploying needs a fresh explicit ask from the owner, every time. A green local run is not permission.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## What exists today

Verified against `origin/main` at `5b129523` (Installers) on 2026-08-28. Every path below was read with `git show origin/main:<path>`. Reproduce with:

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main                                  # expect 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git show origin/main:cmd/devoid/main.go | sed -n '195,250p'
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

`strings.TrimSuffix` is case-sensitive and runs **before** `strings.ToLower`. The dispatch at `cmd/devoid/main.go:203` is `tool := normalizeName(filepath.Base(os.Args[0]))`, and the branch table at `:207-236` is:

- `isCLIEntrypointName(tool)` (`:238-240`) -> `runCLI()`
- `tool == "git"` -> `RunGitEgress`
- `isAgentShim(tool)` (`cmd/devoid/agent_shim.go:60-67`, over `agentShimNames()` at `:53`) -> `runAgentShim(os.Args[0], os.Args[1:])`
- else -> `runShim(tool)` (package-manager shim)

So `CLAUDE.EXE` -> `claude.exe`, which matches **no** branch and falls to `runShim("claude.exe")`. There is no package-manager config for a tool called `claude.exe`, so the call reaches the real binary with: no policy fetch, no surface gate, no provider deny-list, no agent allowlist, no `--bare` strip, no plugin gate, and **no `ANTHROPIC_BASE_URL` injection**. Windows resolves the filename case-insensitively, so `CLAUDE.EXE` runs the same shim image. Cost of the bypass: one shift key. No privilege, no config edit, no tamper.

Three normalizers in this repo do the same job. **Only this one has the ordering wrong.** The two correct ones are the pattern to copy:

- `internal/inventory/mcp/launch.go:431-439` `trimExeSuffix` - lowercases into `lower`, compares against `lower`, slices `base`. **Note its extension list is `{".exe",".cmd",".bat",".com"}` - four entries, not three. Copy the *shape*, not the list.**
- `cmd/devoid/ai_client_identity.go:274-284` `processBaseName` - `ToLower` then `TrimSuffix(name, filepath.Ext(name))`.
- `internal/daemon/pidfile.go:115-125` `imageBaseIsDaemon` - `ToLower` then `TrimSuffix(base, ".exe")`.

There is currently **no test** named for `normalizeName`. The only place it is discussed in a test is `cmd/devoid/update_command_test.go:41-48`, whose comment *documents the defect and dismisses it*: "An uppercase `.EXE` suffix would NOT be stripped - and would NOT route to CLI mode in main.go either - so it is correctly NOT canonical; we don't assert it here because it never occurs on disk." The reasoning is wrong: the string does not come from disk, it comes from the caller's command line. `isCanonicalDevoidName` (`cmd/devoid/update_command.go:178-180`) is literally `normalizeName(base) == "devoid"`, so that test is a live, already-wired probe of the defect.

The other three `normalizeName` call sites (`main.go:8280`, `:8290` in `collectRealToolsForOSEnforce`, and `:8876` in `activeLockFilePathAndHash`) are fed from a manifest and from `monitoredShimTools()`, both already lowercase, so the fix is contained.

### 2. Routing is configured, per surface, and each configuration surface is user-writable

**Claude, terminal lane.** `cmd/devoid/agent_shim.go:126-128` `agentProxyBaseURL()` returns `daemonBaseURL() + "/proxy/anthropic"`. `internal/aiagent/aiagent.go:133-144` `TransportEnvFor` returns `("ANTHROPIC_BASE_URL", true)` for Claude, `("OPENAI_BASE_URL", false)` for Codex ("env known, NOT proxied yet"), `("", false)` for Gemini. `buildAgentEnv` (`agent_shim.go:221-250`) injects via `appendEnvIfMissing`, so **a user-set `ANTHROPIC_BASE_URL` is honoured and the proxy is bypassed** on a cooperative endpoint. On a managed endpoint `enforceManagedTransportRoute` (`:306-340`, called at `:600`) overwrites it and records `PROVIDER_ROUTE_BYPASS`.

**Claude, IDE/desktop lane.** `internal/aihooks/transport_route.go:58-79` `mergeTransportRoute` writes `env.ANTHROPIC_BASE_URL` (`transportEnvKey`, `:32`) into the **user-scope** `~/.claude/settings.json`, asserted rather than deferred-to; the value comes from `ProxyBaseURL()` (`:48-56`, default port `19280` at `:37`). The write path is `internal/aiwire/aiwire.go:590-620` `reconcileClaudeCode`, rooted at `filepath.Join(opts.UserHome, claudeConfigDirName)` (`:56`, `:592`). This is what converts interception from "a property of how the agent was started" into "a property of the endpoint's configuration". It is still a **user-scope** file, and per strategy §4.1 the vendor's precedence puts enterprise-managed settings above user, project, local and CLI settings - which also means **project scope sits above user scope**. Nothing in this repo reads or reports a project-scope `env.ANTHROPIC_BASE_URL`.

**Codex.** `internal/codexmanaged/transport_route.go:57-69` pins `base_url = http://127.0.0.1:<port>/proxy/openai/v1` (`WireProxyBaseURL`) in the R5 provider route inside `$CODEX_HOME/managed_config.toml`. `authority_map.go:37-39` says exactly what that file is: "A per-user `$CODEX_HOME/managed_config.toml` is a USER-owned file, whatever its name suggests - that is precisely why an edit there is real policy drift." Drift *detection* exists (`applyRouteOverlay`, `transport_route.go:88-107`: blank -> `provider-route-unset`, mismatched -> `provider-route-stale`), and the reconcile loop rewrites it. Detection plus a five-minute rewrite is not prevention.

**Codex home redirect.** `internal/codexmanaged/bridge.go:32-34` `CodexHomeFor` resolves the install target as "the explicit `ConfigRoot` override wins, else the default home-relative `~/.codex`" - it does **not** read `$CODEX_HOME`. `bridge.go:178-199` `resolvedCodexHomeFor` *does* read `$CODEX_HOME` (`:195-196`), but only when the calling process's own home matches (`:191-194`); from the SYSTEM daemon it returns `""` and the redirect is recorded as un-probed. The shim's user-context reconcile (`cmd/devoid/ai_wire_retry.go:119-165`, called from `agent_shim.go:496`) passes `aiwire.Options{UserHome: home}` and **leaves `CodexHomeOverride` (`internal/aiwire/aiwire.go:70`) empty**, so on a box with `CODEX_HOME` set to anything else, DeVoid writes the R5 route into `~/.codex` while Codex reads a directory that has none.

**Gemini.** No transport env, no proxy mount, no body parser. `internal/aiagent/aiagent.go:14-15`: "codex/gemini transport DLP is a documented fast-follow (no OpenAI/Gemini body parser exists yet)". The shim runs for `gemini` (`agent_shim.go:53-58`) and gates execution, but **Gemini model traffic is never routed through DeVoid**.

**The proxy itself.** Two loopback mounts on the daemon: `internal/daemon/server.go:687` (`/proxy/anthropic/`) and `:789` (`/proxy/openai/`). The listener is `127.0.0.1:<port>` only (`server.go:792`).

### 3. The managed/cooperative hinge gates almost everything above

`cmd/devoid/ai_local_bypass.go:40` `managedEndpoint()` (production probe `managedEndpointFromDisk` at `:43-51`) reads a seal from disk via `airuntimeintegrity.ManagedEndpointForConfigDir`, never the daemon ("the bypass attempts that matter happen exactly when the daemon is not answering", `main.go:197-200`). A missing seal answers false. In the shim it gates three call sites: `agent_shim.go:520` (refuse launch on unreachable daemon), `:599-600` (override a user-set provider route), `:609` (strip `--bare`, `claudeGovernanceBypassFlags` at `:350`). **On any endpoint that has not reached attested posture, all three run the cooperative, fail-open side.**

### 4. OS/network enforcement: a complete generate-and-review framework exists, wired to a CLI, and nothing ever applies anything

This is the wave's biggest reuse opportunity and it is genuinely built:

- `internal/netenforce/` - `Policy{Mode, ProxyURL, RegistryHosts, NoProxy, RequireMTLS, ClientCertPath, RequiredControls, AllowedRemotes}` (`types.go:19-37`) with control constants `proxy|dns|firewall|mtls` (`types.go:12-15`); `LoadPolicy:41` / `SavePolicy:59` / `NormalizePolicy:82` / `ValidatePolicy:116` / `MarkControlApplied` (`policy.go`, `state.go`); `DetectStatus` (`status.go:11-70`); `EvaluateAlert` (`types.go:97-140`); `GenerateTemplates` writing per-platform artifacts (`templates.go:14-99`); and the P5-2 git-egress backstop with a **spied, never-invoked** `GitEgressBackstopDeployer.Apply` seam (`gitegress_doc.go:41-49`, `gitegress_seams.go:15-19`, pinned by `TestDeployerSeamNeverInvokedDuringGeneration` at `gitegress_backstop_test.go:352`).
- `internal/osenforce/` - WDAC/AppLocker policy **string generators** (`gitegress_gen_windows_policy.go:98` `GenerateWDACPolicyXML`, `:189` `GenerateAppLockerXML`), a per-platform enforceable/not-enforceable matrix (`gitegress_doc.go:42-50`), and a `GitEgressDeployer.CompileAndDeploy` that is "DEFINED but NEVER called" (`gitegress_doc.go:23-24`, `gitegress_seams.go:60`, no-op impl at `:69`).
- CLI surface already wired: `cmd/devoid/main.go:414-417` dispatches `network-enforce` and `os-enforce`; subcommands `status | generate | verify | configure | mark-applied | clear-applied` exist (`main.go:7642-8060`; `netenforce.MarkControlApplied` is called at `main.go:7979`).
- `internal/proxy/egress.go:160-175` `EgressRecipe` emits `devoid-egress-firewall.ps1` etc. with the doctrine stated in the comment at `:161-162`: "devoid SHIPS these; the env applies them (**devoid never mutates the host firewall**)".

**Nothing anywhere in this repository ever calls a firewall API.** There is no WFP code, no `fwpuclnt.dll`, no `INetFwPolicy2`. Verified:

```sh
git grep -n -i "netsh\|FwpmEngine\|INetFwPolicy\|New-NetFirewallRule" origin/main -- "*.go" "*.ps1" "*.wxs" "*.cs" | grep -v testdata
```

**This grep returns hits and that is expected.** Every one is a *string in a generated artifact*, a *comment*, or a *detection regex* - never a call:
`netenforce/gitegress_backstop.go:286-295` (emits them commented out), `netenforce/templates.go:170`, `proxy/egress.go:164,324,343-345,402`, `proxy/egress_test.go:225`, and `toolrisk/toolrisk.go:367` + `toolrisk/dialect_matrix_test.go:51` (a detector for `netsh advfirewall ... state off`, i.e. we *detect* firewall disablement, we do not perform it). `FwpmEngine` and `INetFwPolicy` return **zero** hits.

**The honesty defect in that framework:** `netenforce.Status.Effective()` (`types.go:64-85`) resolves through `MissingControls`, which `DetectStatus` fills from `isControlApplied(configDir, control)` (`status.go:42-52`) - and that reads `state.AppliedControls` (`state.go:17-19`), which is a human running `devoid network-enforce mark-applied firewall`. It is a self-attested green over an unobserved control.

### 5. What is already proven and reusable for the proof side

- `internal/fieldobs/fieldobs.go:81` - `Providers = []string{"anthropic","openai"}`; the ledger is `ai-field-observations.json` (`:67`) under `security.DefaultPaths().ConfigDir`, i.e. **`$HOME/.devoid`** (`internal/security/paths.go:27-48`) - *not* the machine root. `internal/daemon/ai_transport_observation.go:60-70` `recordTransportRouteDecision` records "this provider's local proxy route carried one real decision on this endpoint", served over token-gated loopback IPC at `GET /v1/ai/transport-observation` (`server.go:588`, handler at `ai_transport_observation.go:75-89`). This is the **positive** witness. There is no negative witness - nothing observes traffic that did *not* come through the proxy.
- `internal/egressmatrix/` - a test-only enforcement-strength x scenario matrix (three files only: `doc.go`, `README.md`, `egress_matrix_test.go`) with the invariant "a STRONG mode either BLOCKS the push OR marks the endpoint NON-COMPLIANT - there is NEVER a silent-success path" (`doc.go:11-17`). Exactly the shape the provider bypass matrix needs; copy the discipline, not the git semantics.
- `internal/system.ListProcesses()` (`internal/system/process.go:117`, returning `ProcessInfo` at `:56`) is the existing process enumerator; `cmd/devoid/ai_client_identity.go` already consumes it.

### 6. Genuinely absent

Direct-egress observation of any kind; any OS-level network enforcement; per-session or brokered gateway credentials (the proxy relays the client's own credential unchanged); any project-scope route attestation; any machine-scope route attestation (`w4_vendor_authority.md` Task 4 creates the first one); any Gemini route; any statement anywhere that distinguishes a native-binary agent install from a `node.exe`-hosted one for the purpose of network identity. `internal/coveragetruth/` does not exist yet - it is created by `w8_coverage_truth.md` Task 1.

---

## Task 1: Lowercase before stripping the extension

> **PHASE 0. This ships ahead of every other task in the eight-wave programme.** RECONCILIATION §3 item 8. It is a four-line change that closes a bypass costing one shift key. Do not schedule it behind anything.

**Files (the complete set - touch nothing else):**
- `cmd/devoid/main.go` - the body of `normalizeName` only (lines 242-247)
- `cmd/devoid/name_dispatch_test.go` - new
- `cmd/devoid/update_command_test.go` - the comment at `:41-48` and the `canonical` slice at `:49`

### PRECONDITIONS - every one must pass; if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
#   EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
#   If different, origin/main has moved. Re-verify EVERY line citation in this task
#   with `git show origin/main:<path> | sed -n '<range>p'` before touching anything.

git worktree add C:/cwt/w3-t1 -b w3/t1-normalizename origin/main && cd /c/cwt/w3-t1

sed -n '242,247p' cmd/devoid/main.go
#   EXPECT exactly:
#   func normalizeName(name string) string {
#   	for _, ext := range []string{".exe", ".cmd", ".bat"} {
#   		name = strings.TrimSuffix(name, ext)
#   	}
#   	return strings.ToLower(name)
#   }

sed -n '178,180p' cmd/devoid/update_command.go
#   EXPECT: func isCanonicalDevoidName(base string) bool { ... normalizeName(base) == "devoid" ... }
#   This is why adding "DEVOID.EXE" to update_command_test.go's canonical slice is a REAL probe.

grep -c "TestNormalizeName" cmd/devoid/*_test.go
#   EXPECT: 0 in every file. If a test already exists, STOP - someone else is in this file.

go build ./... && go test ./cmd/devoid/ -run TestIsCanonicalDevoidName -count=1
#   EXPECT: ok  (a green baseline before you change anything)
```

### LANDMINES

- **Do not "improve" the extension list.** `internal/inventory/mcp/launch.go:431-439` - the shape you are copying - carries a fourth entry `".com"`. Adding `.com`, `.ps1`, `.vbs` or anything else here changes which invocations route to `runCLI()` and `RunGitEgress` on every platform. It is a separate decision with its own blast radius and it is **not** in this task.
- **Do not switch dispatch to `os.Executable()`.** On macOS and Linux the shims are symlinks to the single `devoid` binary (`install-scripts/production/install.sh:1546` for package tools, `:1555` for AI tools - both `ln -sf devoid "$BIN_DIR/$tool"`), so `os.Executable()` resolves them all to `.../bin/devoid` and dispatch collapses to CLI mode for every shim on both platforms. That is Task 2's subject and Task 2 explicitly refuses it too.
- **Never weaken an existing guard to make this fit.** If `TestIsCanonicalDevoidName` goes red in a direction you did not intend, the fix is wrong - do not relax the test.
- This task writes **nothing** under the machine root (`%ProgramData%\devoid`, `internal/core/config/config.go:524` `MachineCredsDir`). Keep it that way. See Task 5's landmine for why any new machine-root entry is a fleet-wide upgrade brick.

### DO NOT

- Do not touch the three other `normalizeName` call sites (`main.go:8280`, `:8290`, `:8876`). They are fed from a manifest and from `monitoredShimTools()`, both already lowercase.
- Do not delete or rewrite `TestIsCanonicalDevoidName`. You are *adding* a case to its `canonical` slice, not replacing the test.
- Do not add a `.com` case to the new test to "match" `trimExeSuffix`. `.com` is not in this function's list and must not become so in this task.
- Do not commit, push, open a PR, or dispatch a workflow.

**Blast radius:** Every name-dispatch decision the CLI makes. If wrong, `devoid.exe` itself could stop routing to `runCLI()` and the whole binary becomes inert - the loudest possible failure, caught by `TestIsCanonicalDevoidName` and by any CLI test. The realistic risk is the opposite direction: names that previously fell through to `runShim` now route to a real branch. The only names that change behaviour are those whose extension is not all-lowercase (`.EXE`, `.Exe`, `.CMD`, `.BAT`, and mixed case). Nothing the installer lays on disk has such a name - measured: 41 files in `C:\ProgramData\devoid\bin`, all lowercase. So the change affects **only** invocations a human typed in mixed case, which today are ungoverned and after the change are governed. Who notices: nobody, unless they were relying on the bypass.

**Rollback:** Revert the four-line function body. No state, no file format, no wire contract, no persisted value depends on it. Safe to revert at any point with no migration.

### STEPS

- [ ] Write `cmd/devoid/name_dispatch_test.go` with a table-driven `TestNormalizeNameIsCaseInsensitiveOnTheExtension`. Cases and expected results: `claude.exe`->`claude`, `CLAUDE.EXE`->`claude`, `Claude.Exe`->`claude`, `claude.EXE`->`claude`, `npm.CMD`->`npm`, `NPM.BAT`->`npm`, `git.EXE`->`git`, `DEVOID.EXE`->`devoid`, `claude`->`claude`, `claude.js`->`claude.js` (a non-executable extension must NOT be stripped). Run it; record the RED output - it fails on `CLAUDE.EXE`, `Claude.Exe`, `claude.EXE`, `npm.CMD`, `NPM.BAT`, `git.EXE`, `DEVOID.EXE` (7 of 10).
- [ ] Add `TestNameDispatchRoutesUppercaseInvocationsToTheSameBranch`: for each of `{"claude","CLAUDE.EXE"}`, `{"codex","CODEX.EXE"}`, `{"gemini","GEMINI.EXE"}` assert `isAgentShim(normalizeName(n))` is true; for `{"devoid","DEVOID.EXE"}` assert `isCLIEntrypointName(normalizeName(n))`; for `{"git","GIT.EXE"}` assert `normalizeName(n) == "git"`. Record the RED output.
- [ ] Fix `normalizeName` by copying the shape at `internal/inventory/mcp/launch.go:431-439`: lowercase once into a local, compare the suffix against the lowered value, slice the *lowered* value. Keep the extension list `{".exe", ".cmd", ".bat"}` unchanged.
- [ ] Replace the comment at `cmd/devoid/update_command_test.go:41-48` with the true statement (uppercase extensions ARE stripped; the name comes from the caller's command line, not from disk), and add `"DEVOID.EXE"` to that test's `canonical` slice so the claim is asserted rather than excused.
- [ ] Run `go test ./cmd/devoid/... ./internal/...` and record the pass/fail delta against an `origin/main` baseline built in a throwaway worktree (`git worktree add C:/cwt/w3-t1-base origin/main`). Any test red in both is pre-existing and not yours; say so explicitly.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation.** In `cmd/devoid/main.go`, restore the defect: put the `for ... strings.TrimSuffix(name, ext)` loop back *ahead* of `strings.ToLower(name)`.

**Command.**
```sh
cd /c/cwt/w3-t1 && go test ./cmd/devoid/ -run TestNormalizeNameIsCaseInsensitiveOnTheExtension -count=1
```

**Required output.** The run must FAIL and stderr must contain the literal string:
```
normalizeName("CLAUDE.EXE") = "claude.exe", want "claude"
```
Write the test's failure message to produce exactly that. If the mutated build passes, the test is inert - shape 2 (hand-built literals) or shape 5 (a precondition that skips the assertion) - and must be rewritten before you proceed.

**Second defeat test, same mutation:**
```sh
cd /c/cwt/w3-t1 && go test ./cmd/devoid/ -run TestIsCanonicalDevoidName -count=1
```
must FAIL with `isCanonicalDevoidName("DEVOID.EXE") = false; want true (canonical devoid self-updates)`.

### EXIT

1. **Number.** `go test ./cmd/devoid/ -run 'NormalizeName|NameDispatch|IsCanonicalDevoidName' -count=1` passes with **10** normalizer cases, **5** dispatch pairs, and **5** canonical names asserted.
2. **Runnable on-box proof that `CLAUDE.EXE` now reaches the agent shim and did not before.** On a Windows box with DeVoid installed, in PowerShell:

```powershell
Copy-Item "$env:ProgramData\devoid\bin\devoid.exe" "$env:TEMP\CLAUDE.EXE" -Force
$env:DEVOID_LOG_LEVEL = 'debug'   # internal/logger/logger.go:99; debug also mirrors to stderr (:56-58)
& "$env:TEMP\CLAUDE.EXE" --version 2>&1 | Select-String 'Running in (AI-agent shim|shim) mode'
```

- **BEFORE the fix** the line is `Running in shim mode` with `tool=claude.exe` (`main.go:233`).
- **AFTER the fix** the line is `Running in AI-agent shim mode` with `tool=claude` (`main.go:230`).

Record both outputs verbatim in the wave evidence. A run that shows only the AFTER line is not proof; the BEFORE line is the bypass.

---

## Task 2: Cross-check the shim's identity against its own image, and record the mismatch

> **PHASE 0**, immediately after Task 1. It depends on Task 1's fixed `normalizeName`.

**Files (the complete set):**
- `cmd/devoid/shim_identity.go` - new
- `cmd/devoid/shim_identity_test.go` - new
- `cmd/devoid/main.go` - **one** call line, after `installManagedProbes()` at `:201` and before the dispatch at `:203`

**Why:** Task 1 fixes the one normalizer defect we found. `argv[0]` is fully caller-controlled and there will be another one. This makes the *next* normalization gap loud instead of silent, without making dispatch depend on a value that is unsafe to depend on.

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# Task 1 MUST already be merged. Verify by behaviour, not by chatter:
git worktree add C:/cwt/w3-t2 -b w3/t2-shim-identity origin/main && cd /c/cwt/w3-t2
sed -n '242,247p' cmd/devoid/main.go | grep -q "ToLower" && sed -n '242,247p' cmd/devoid/main.go
#   EXPECT the LOWERCASE-FIRST form. If you still see `TrimSuffix` above `ToLower`,
#   Task 1 has not landed. STOP AND REPORT - do not implement Task 1 yourself inside this task.

sed -n '195,205p' cmd/devoid/main.go
#   EXPECT `installManagedProbes()` then `tool := normalizeName(filepath.Base(os.Args[0]))`

sed -n '34,51p' cmd/devoid/ai_local_bypass.go
#   EXPECT the seam vars `managedProbe` / `bypassRecorder` at :34-37, and
#          `func managedEndpoint() bool { return managedProbe() }` at :40.
#          Those two seams are how you fake managed mode in tests - do not add a third.

sed -n '88,93p' cmd/devoid/ai_local_bypass.go
#   EXPECT `func recordLocalDisablementAttempt(d airuntimeintegrity.LocalDisablementDecision) {` at :91
#   If this signature differs, STOP - do not invent a recorder.

sed -n '1544,1557p' install-scripts/production/install.sh
#   EXPECT two `ln -sf devoid "$BIN_DIR/$tool"` loops (package tools, then AI tools).
#   This is the symlink fact that makes os.Executable() unusable for dispatch.
```

### LANDMINES

- **`os.Executable()` cannot be the dispatch key.** On macOS and Linux every shim is a symlink to the one `devoid` binary (`install-scripts/production/install.sh:1546`, `:1555`). `os.Executable()` resolves them all to `.../bin/devoid`, so dispatch would collapse to CLI mode for every shim on both platforms and the product would silently stop governing anything on non-Windows. This is the trap in this task; it is why `checkShimIdentity` is Windows-only and advisory.
- **A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent.** `os.Executable()` can fail, can be a symlink, can be a hardlink, can be an in-place-replaced file mid-upgrade. Every unresolvable case must return `MatchIndeterminate` and continue. Refusal happens **only** on an affirmative `MismatchAgentShimMissed` **and** `managedEndpoint() == true`.
- **Writing any new entry under the machine root (`%ProgramData%\devoid`, `internal/core/config/config.go:524`) requires the SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624-630`,** or the next MSI operation dies with `machine root contains unknown entry` (`guard_windows.go:1086`) -> 1722 -> 1603 and rolls back the upgrade on every ENROLLED endpoint while every clean-box test stays green. This has happened three times: `.staging`, `aitrust`, `endpoint-identity.json`. **This task must write nothing there.** `recordLocalDisablementAttempt` writes to `security.DefaultPaths().ConfigDir` = `$HOME/.devoid` (`internal/security/paths.go:27-48`), which is outside the guard. Keep it that way.
- **Inert-test shape 3.** Test Claude *and* Codex *and* the CLI entrypoint, and test the cooperative branch *and* the managed branch. A mismatch check that only exercises the managed lane is exactly the CX-10 shape.

### DO NOT

- Do not make dispatch read `os.Executable()`. The classification is advisory; `normalizeName(filepath.Base(os.Args[0]))` stays the dispatch key.
- Do not refuse a launch on a cooperative endpoint under any circumstance. `managedEndpoint()` gates the refusal and nothing else.
- Do not add a second bypass recorder or a second evidence spool. Use `recordLocalDisablementAttempt` (`cmd/devoid/ai_local_bypass.go:91-93`). Two recorders is how this codebase grows a second truth.
- Do not log the full image path anywhere. The mismatch record carries basenames and a verdict, never a user directory.
- Do not commit, push, or dispatch.

**Blast radius:** On a cooperative endpoint: one extra `os.Executable()` call and, in the mismatch case, one local integrity-mirror record per launch. Nothing refuses. On a managed endpoint the mismatch refuses the launch, which is the same class of refusal already shipped at `agent_shim.go:520` - a managed box with a genuinely odd invocation name would see a launch refused and a named reason. Who notices: a managed-endpoint developer, with an actionable message.

**Rollback:** Delete the single call line in `main.go`. The file compiles standalone; nothing else references it.

### STEPS

- [ ] Write `TestShimIdentityMismatchIsDetected`: given a fake `imageBase` of `claude.exe` and a dispatch decision of `package-shim`, `classifyShimIdentity` returns `MismatchAgentShimMissed`. Given `imageBase=claude.exe` + `agent-shim`, `MatchOK`. Given `imageBase=devoid.exe` + `cli`, `MatchOK`. Record RED (no function yet).
- [ ] Write `TestShimIdentityIsWindowsOnlyAndSymlinkSafe`: on non-Windows, `shimIdentityEnabled()` is false; and a fake image path equal to the devoid launcher with an `argv[0]` of `claude` returns `MatchIndeterminate`, never a mismatch. Record RED.
- [ ] Implement `classifyShimIdentity(imageBase, dispatched string) identityVerdict` as a **pure function, no I/O**, plus a thin `checkShimIdentity()` that on Windows only calls `os.Executable()`, takes `filepath.Base`, and normalizes with the *fixed* `normalizeName`. Every non-Windows build and every unresolvable `os.Executable()` returns `MatchIndeterminate`.
- [ ] On `MismatchAgentShimMissed`: call `recordLocalDisablementAttempt` with `Control: "SHIM_DISPATCH"`, `Reason: "SHIM_IDENTITY_MISMATCH"`, `Response: "dispatch-name-not-image-name"`. **On `managedEndpoint()` only**, print the named reason and exit 1.
- [ ] Add `TestShimIdentityCooperativeNeverRefuses`: with the `managedProbe` seam faked to `false` (`ai_local_bypass.go:34-37`), a mismatch records and returns "continue". Record RED if the managed gate is inverted.
- [ ] Add `TestShimIdentityIndeterminateNeverRefuses`: `MatchIndeterminate` with `managedProbe` faked **true** still returns "continue". This is the July-2026 guard. Record RED.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation.** In `cmd/devoid/shim_identity.go`, remove the `managedEndpoint()` condition so the mismatch branch refuses unconditionally.

**Command.**
```sh
cd /c/cwt/w3-t2 && go test ./cmd/devoid/ -run TestShimIdentityCooperativeNeverRefuses -count=1
```

**Required output.** FAIL, containing the literal string:
```
cooperative endpoint refused a launch: want continue, got exit 1
```

**Second defeat test.** Mutation: make `checkShimIdentity` return `MismatchAgentShimMissed` instead of `MatchIndeterminate` when `os.Executable()` returns an error.
```sh
cd /c/cwt/w3-t2 && go test ./cmd/devoid/ -run TestShimIdentityIndeterminateNeverRefuses -count=1
```
must FAIL with `unresolvable image refused a launch on a managed endpoint: want continue, got exit 1`.

### EXIT

1. **Named artifact.** A local integrity-mirror record under `%USERPROFILE%\.devoid` carrying `control=SHIM_DISPATCH reason=SHIM_IDENTITY_MISMATCH`, produced on a Windows box by copying `devoid.exe` to a name that dispatches to `runShim` while its image base dispatches to the agent shim. Paste the record.
2. **Number.** **0** refusals on a cooperative endpoint across the whole test matrix, asserted by `go test ./cmd/devoid/ -run 'ShimIdentity' -count=1` (6 subtests, all green).

---

## Task 3: Make the Claude route's real precedence a measured fact, across FIVE scopes, and attest project scope

> **RECONCILIATION C8 applies to this task and changes its size.** The original matrix was four sources (16 cells). `w4_vendor_authority.md` Task 4 (`TestMachineProjectionPinsTheTransportRoute`) is about to emit `env.ANTHROPIC_BASE_URL` as an owned key in the **machine** managed-settings projection, and its Task 6 turns those writes on fleet-wide. If the machine scope is not a cell, `EffectiveRouteSource` is asked a question its fixture cannot answer the moment W4 lands, and the doctor row either falls to `unverified` everywhere or reports `routed (user scope)` on a box whose real winner is the machine file.
>
> **The five sources are:** (1) process environment, (2) machine managed-settings (`managed-settings.d\<devoid>.json`), (3) user `~/.claude/settings.json` `env`, (4) project `.claude/settings.json` `env`, (5) project `.claude/settings.local.json` `env`.
>
> **Cell count:** the reconciliation wrote "25". The present/absent matrix over five sources is 2^5 = **32**. Five sources is the decision; 32 is the count that decision implies. Measure 32.
>
> **Ordering:** this measurement runs **before** `w4_vendor_authority.md` Task 4 and is **RE-MEASURED after it**, because Task 4 creates the machine-scope file that cell class describes. Ship the code once, against the second measurement.

**Files (the complete set):**
- `internal/aihooks/route_precedence.go` - new, pure classification
- `internal/aihooks/route_precedence_test.go` - new
- `internal/aihooks/testdata/claude-route-precedence.v1.json` - new, the checked-in golden fixture
- `cmd/devoid/agent_shim_route_attest.go` - new, the cwd read, shim-side only
- `cmd/devoid/doctor_ai_surface.go` - one new row (see LANDMINES for why not `doctor_scoreboard.go`)
- `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-route-precedence-<version>.md` - new evidence artifact

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t3 -b w3/t3-route-precedence origin/main && cd /c/cwt/w3-t3

sed -n '32,56p' internal/aihooks/transport_route.go
#   EXPECT `const transportEnvKey = "ANTHROPIC_BASE_URL"` (:32),
#          `const defaultDaemonPort = 19280` (:37),
#          `func ProxyBaseURL() string` (:48)

sed -n '58,79p' internal/aihooks/transport_route.go
#   EXPECT mergeTransportRoute, asserting env[transportEnvKey] = ProxyBaseURL()

grep -n "doctorRowUnverified doctorRowState" cmd/devoid/doctor_scoreboard.go
#   EXPECT: 82:	doctorRowUnverified doctorRowState = "unverified"
#   If absent, STOP - the three-state row model this task depends on is gone.

grep -n "doctorRowUnverified" cmd/devoid/doctor_ai_surface.go
#   EXPECT at least one hit (:219, the "Codex machine baseline" row) - this is the file
#   AI rows live in, and the pattern to copy.

# The evidence artifact this task's code depends on:
ls C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-route-precedence-*.md 2>/dev/null
#   EXPECT: no such file, at the start. NO CODE LANDS BEFORE IT EXISTS.
```

### LANDMINES

- **The row goes in `cmd/devoid/doctor_ai_surface.go`, not `doctor_scoreboard.go`.** `doctor_scoreboard.go` holds the *state vocabulary* (`doctorRowUnverified` at `:82`, `doctorRow` at `:86`) and the tally invariant (`selfConsistent`: `printed == passed + failed + unverif`). AI rows are emitted from `doctor_ai_surface.go`. Adding a row without going through the scoreboard's emit path breaks the tally invariant.
- **`unverified` is not a neutral glyph and is never green.** `doctor_scoreboard.go:79-82`: "the question was asked and the off-endpoint authority could not answer it. Never green, never counted as passed, and never a failure of this endpoint." Default to it when the fixture is absent for the observed binary version. **Never default to `routed`.**
- **Do not infer the precedence order from the vendor's documentation.** The whole point of this task is that we measured it for the exact certified binary. An inferred table produces a control that reports green over the losing source, which is the failure this task exists to prevent.
- **Inert-test shape 4.** The fixture is a closed set. Feed `EffectiveRouteSource` a source combination that is *not* in the fixture and assert it returns `unverified`, not a guess. A fixture lookup that silently falls back to "user scope" is a fail-open deny-list wearing an allowlist's clothes.
- **Inert-test shape 1.** Do not assert the fixture's contents with a `strings.Contains` over the file text. Parse it and assert the resolved verdict.
- The shim-side read touches files under the **developer's cwd**. Bound it at 64 KiB, skip on any error, never follow a symlink out of the cwd, and never log a path.

### DO NOT

- Do not write anything to the project directory. This attestor is read-only over the developer's repo.
- Do not emit the full override URL. The record carries **host only**, redacted of userinfo, path and query.
- Do not add an enforcement branch. Nothing refuses in this task; a project-scope override is *reported and demoted*, never blocked.
- Do not land code before the evidence artifact exists. If you cannot get a clean VM and the certified binary, STOP AND REPORT - do not measure on a developer box and call it certified.
- Do not commit, push, or dispatch.

**Blast radius:** Read-only. The shim gains one `os.Stat` + one bounded JSON read of files under the developer's cwd, on a path that already reads several files. Worst realistic failure is a slow launch on a huge repo. `doctor` gains one row. Nothing refuses, nothing is written. Who notices: nobody, unless the row goes red.

**Rollback:** Remove the doctor row and the shim call; the `internal/aihooks` function has no other caller. The fixture is inert without a reader.

### STEPS

- [ ] **Measure first, five sources.** Against the certified Claude binary in a clean VM, run the 2^5 = 32-cell present/absent matrix and record the observed effective base URL per cell. Write the result to `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-route-precedence-<version>.md` with the binary version and its SHA-256. **No code lands before this file exists.**
- [ ] Check the measured order into `internal/aihooks/testdata/claude-route-precedence.v1.json`, keyed by binary version, with the SHA-256 of the measured binary in the file.
- [ ] Write `TestRoutePrecedenceMatchesMeasuredOrder` as a golden test that reads the fixture and asserts `EffectiveRouteSource(sources)` returns the recorded winner for **all 32 cells**. Record RED (no function).
- [ ] Write `TestRoutePrecedenceRefusesAnUnmeasuredBinary`: for a binary version absent from the fixture, `EffectiveRouteSource` returns `SourceUnverified` and never a guess. Record RED. *(inert-test shape 4)*
- [ ] Implement `EffectiveRouteSource` as a pure function over a `RouteSources` struct with one field per scope (`ProcessEnv`, `MachineManagedSettings`, `UserSettings`, `ProjectSettings`, `ProjectLocalSettings`). Do **not** infer; encode the measured table.
- [ ] Write `TestProjectScopeOverrideIsReportedNotSilent`: given a project `.claude/settings.json` carrying an `env.ANTHROPIC_BASE_URL` that is not `aihooks.ProxyBaseURL()`, the shim-side attestor returns `RouteAttest{Overridden: true, Scope: "project", Value: <host only>}` and emits a `PROVIDER_ROUTE_BYPASS` record with `Response: "project-scope-override-observed"`. Record RED.
- [ ] Add the `doctor` row `AI provider route (Claude)` in `doctor_ai_surface.go` with the states `routed (<scope>)`, `overridden by <scope>`, `unverified`. Default to `unverified` when the fixture has no entry for the observed binary version.
- [ ] **RE-MEASURE after `w4_vendor_authority.md` Task 4 merges**, replace the fixture, and re-run the golden test. Record both fixture versions in the evidence file.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation.** In `cmd/devoid/agent_shim_route_attest.go`, revert the attestor to read only the user-scope `~/.claude/settings.json`.

**Command.**
```sh
cd /c/cwt/w3-t3 && go test ./cmd/devoid/ -run TestProjectScopeOverrideIsReportedNotSilent -count=1
```

**Required output.** FAIL, containing the literal string:
```
want Overridden=true scope=project, got Overridden=false
```

**Second defeat test.** Mutation: make `EffectiveRouteSource` fall back to `SourceUserSettings` for an unknown binary version.
```sh
cd /c/cwt/w3-t3 && go test ./internal/aihooks/ -run TestRoutePrecedenceRefusesAnUnmeasuredBinary -count=1
```
must FAIL with `EffectiveRouteSource guessed "user" for an unmeasured binary; want "unverified"`.

### EXIT

1. **Named artifact.** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/claude-route-precedence-<version>.md` containing **32** measured cells over **5** sources, the binary version and its SHA-256, and both the pre-W4 and post-W4 measurements.
2. **Command.** On a box with a planted project-scope override:
   `devoid doctor --json | jq -r '.rows[] | select(.label=="AI provider route (Claude)") | .state'`
   returns `overridden`. On a box with no fixture entry for the installed binary version it returns `unverified`, never `pass`.

---

## Task 4: Follow `CODEX_HOME` where Codex actually reads it

**Files (the complete set):**
- `cmd/devoid/ai_wire_retry.go` - `maybeReconcileAIWireUserContext` (`:119-165`)
- `cmd/devoid/ai_wire_retry_codexhome_test.go` - new
- **`internal/aiwire/aiwire.go` is READ-ONLY here.** `Options.CodexHomeOverride` already exists at `:70`; this task only *fills* it.

**Why:** `internal/codexmanaged/bridge.go:32-34` writes into `~/.codex` unless `ConfigRoot` is set; `bridge.go:191-198` shows the running Codex would use `$CODEX_HOME`. The shim runs in the user's own session, so it is the one component that can read `$CODEX_HOME` honestly (the SYSTEM daemon cannot, and correctly reports it un-probed at `bridge.go:191-194`). Today the shim passes no override, so on a `CODEX_HOME`-redirected box DeVoid writes a route into a directory Codex never reads and then attests it. This is a connect-what-exists fix: one field, already documented, never populated.

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t4 -b w3/t4-codex-home origin/main && cd /c/cwt/w3-t4

sed -n '59,71p' internal/aiwire/aiwire.go
#   EXPECT `type Options struct` (:59), `UserHome string` (:63),
#          `CodexHomeOverride string` (:70). If CodexHomeOverride is absent, STOP -
#          do NOT add the field yourself; the task premise has changed.

sed -n '119,165p' cmd/devoid/ai_wire_retry.go
#   EXPECT maybeReconcileAIWireUserContext building aiwire.Options{UserHome, LauncherPath,
#          Skip, DaemonHealthy} with NO CodexHomeOverride.

sed -n '92,106p' cmd/devoid/ai_wire_retry.go
#   EXPECT touchAIWireRetryStamp - the EXISTING throttle. Reuse it; do not add a timer.

sed -n '187,199p' internal/codexmanaged/bridge.go
#   EXPECT resolvedCodexHomeFor, reading os.Getenv("CODEX_HOME") only when
#          homeEqual(self, opts.Home). This is the honesty rule you are extending.

# Frozen-corpus baseline BEFORE you change anything:
go test ./internal/codexmanaged/... -count=1 > /c/cwt/w3-t4-codexmanaged-baseline.txt 2>&1; tail -3 /c/cwt/w3-t4-codexmanaged-baseline.txt
#   EXPECT ok. Keep this file; the exit criterion is a diff against it.
```

### LANDMINES

- **This must not change `classifyProvider` or any frozen S-cfg corpus golden.** If a golden moves, the change has leaked into classification and the task is wrong. Stop and re-scope; do not update the golden to match.
- **Writing a managed profile into an attacker-chosen directory is a real risk.** `$CODEX_HOME` is user-controlled. Refuse to write when the resolved home is not an absolute path, is a symlink resolving outside the user's profile, or is not writable by the current user. On refusal, pass `CodexHomeOverride: ""` and record - never fall back to writing somewhere else.
- **Do not add a second throttle.** `ai_wire_retry.go:92-106` `touchAIWireRetryStamp` plus `aiWireRetryDue` already throttle this path. A second timer is a second truth and will emit per-launch records the exit criterion forbids.
- **Do not read `$CODEX_HOME` from the daemon.** `bridge.go:191-194` deliberately declines when the process home is not the attested home. Widening that is weakening an existing guard.
- **Inert-test shape 3.** Codex is the lane the defect lives under and `TransportEnvFor("codex")` returns `proxied=false`, which is exactly how a Codex-lane fix has shipped dead here before. Assert the *written file location*, not just the options struct.
- This task writes under `$CODEX_HOME`, never under `%ProgramData%\devoid`. If you find yourself adding a machine-root entry, stop: it requires the same commit to add the name to `boundaryChildNames` (`cmd/devoid-msi-root-guard/guard_windows.go:624-630`) or the next MSI operation dies with `machine root contains unknown entry` (`:1086`) -> 1722 -> 1603 on every enrolled endpoint, while every clean-box test stays green.

### DO NOT

- Do not edit `internal/aiwire/aiwire.go`. Read-only in this task.
- Do not widen the Codex dialect pin. `internal/codexmanaged/hookdialect.go:166` keeps 0.145/0.146/0.148/0.149-alpha unresolvable on purpose; that is a separate owner decision blocked on vendor artefacts.
- Do not delete or relax any test that goes red. If a frozen golden moves, the fix is wrong.
- Do not commit, push, or dispatch.

**Blast radius:** Only boxes where `CODEX_HOME` is set to something other than `~/.codex` - today those boxes are silently ungoverned, so the change can only add governance. The risk is writing a managed profile into an unexpected directory; the guard above contains it. Who notices: a developer with a relocated `CODEX_HOME` gets governed for the first time; if the guard trips, `hooks-status` shows `provider-route-unset` instead of green.

**Rollback:** Pass `CodexHomeOverride: ""` again - one line. Files already written under the redirected home are inert to Codex only if you also delete them; document the cleanup command in the PR body (`devoid ai uninstall-hooks --codex-home <path>`).

### STEPS

- [ ] Write `TestUserRetryFollowsCodexHomeEnv`: with `CODEX_HOME` set to a `t.TempDir()`, the reconcile options handed to `aiwire.Reconcile` carry `CodexHomeOverride` equal to that dir. Record RED.
- [ ] Write `TestUserRetryWritesTheRouteIntoTheRedirectedHome`: after the reconcile, `managed_config.toml` exists **under the redirected dir** and carries `base_url = codexmanaged.WireProxyBaseURL()`; `~/.codex` is untouched. Record RED. *(this is the assertion that defeats inert-test shape 3)*
- [ ] Write `TestUserRetryRefusesUnsafeCodexHome`: a relative path, a non-existent parent, and a path outside the user's home each yield `CodexHomeOverride: ""` **and** a `PROVIDER_ROUTE_BYPASS` record with `Response: "codex-home-redirect-unsafe"`. Record RED.
- [ ] Write `TestCodexHomeDivergenceIsRecordedEvenWhenWireSucceeds`: when `$CODEX_HOME != ~/.codex`, exactly one record with `Response: "codex-home-redirect-observed"` is emitted per throttle window - not per launch. Reuse the existing stamp.
- [ ] Implement: resolve `$CODEX_HOME` in the shim, run the safety guard, populate `Options.CodexHomeOverride`.
- [ ] Re-run `go test ./internal/aiwire/... ./internal/codexmanaged/... ./cmd/devoid/...` and diff `./internal/codexmanaged/...` against `/c/cwt/w3-t4-codexmanaged-baseline.txt`.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation.** In `cmd/devoid/ai_wire_retry.go`, remove the safety guard so any non-empty `$CODEX_HOME` is passed straight through.

**Command.**
```sh
cd /c/cwt/w3-t4 && go test ./cmd/devoid/ -run TestUserRetryRefusesUnsafeCodexHome -count=1
```

**Required output.** FAIL, containing the literal string:
```
unsafe CODEX_HOME accepted: want override="", got override="../../elsewhere"
```

**Second defeat test.** Mutation: pass `CodexHomeOverride: ""` unconditionally (the current `origin/main` behaviour).
```sh
cd /c/cwt/w3-t4 && go test ./cmd/devoid/ -run TestUserRetryWritesTheRouteIntoTheRedirectedHome -count=1
```
must FAIL with `R5 provider route written to ~/.codex while CODEX_HOME points elsewhere; Codex reads a directory with no route`.

### EXIT

1. **Command on a box with `CODEX_HOME` pointed at a scratch directory:**
   `devoid ai hooks-status codex --json | jq -r '.requirements[] | select(.id=="R5") | .status'` returns `installed`, and `jq -r '.codexHome'` returns the scratch directory - not `~/.codex`.
2. **Number.** `diff /c/cwt/w3-t4-codexmanaged-baseline.txt <(go test ./internal/codexmanaged/... -count=1 2>&1)` shows **0** frozen-corpus goldens changed.

---

## Task 5: A direct-egress witness - observe first, enforce never (in this task)

> **RECONCILIATION D4 and C3 both apply and both change this task.**
>
> **D4 - ownership.** `w8_coverage_truth.md` Task 3 **owns** `AITransportObservationResponse` / `AITransportObservationEntry` and `routeStatusLabel`; it is adding `Route.Traffic` alongside `Route.Decisions`. This task **appends** a `directEgress` field; it does not define, restructure or rename the struct. The code's own comment at `internal/daemon/ai_handlers.go:2356-2359` reads "a second counter would be a second truth" - two waves were each adding one without referencing the other. Read `w8_coverage_truth.md` Task 3 before you write a line here, and if the struct has not yet been reshaped by that task, add your field additively and say so in the PR body.
>
> **C3 - ordering.** The earlier claim that this task requires a Backend deploy first was **wrong and is struck**. `GET /v1/ai/transport-observation` is a **token-gated loopback handler on the daemon** (`internal/daemon/server.go:588`, handler at `ai_transport_observation.go:75`), read by the local CLI. It is not a Backend route. Grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns nothing. **This task is agent-only and carries no deploy-ordering constraint.** (Task 6 Stage 4 does; that one is real.)

**Files (the complete set):**
- `internal/aiegress/` - new package: `witness.go` (pure classification), `conntable_windows.go` (the `iphlpapi` reader), `conntable_other.go` (stub), `witness_test.go`
- `internal/fieldobs/fieldobs.go` - one additive record type (see LANDMINES)
- `internal/daemon/server.go` - one `go s.runDirectEgressWitness(ctx)` line next to the existing sweep loops
- `internal/daemon/ai_transport_observation.go` - **append only**, one `directEgress` map + one `observationMethod` field
- `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/direct-egress-witness-baseline.md` - new

**Why this task comes before the WFP task.** `fieldobs` already answers "did the route carry a decision" (`internal/daemon/ai_transport_observation.go:60-70`). Nothing answers "did anything go around it". Without that number you cannot state a bypass-matrix result, you cannot size the WFP allowlist, and you cannot tell an enforcement regression from a quiet week. This task is pure observation: no filter, no refusal, no network mutation, so it can ship on every endpoint immediately and it is the input to every later claim.

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t5 -b w3/t5-egress-witness origin/main && cd /c/cwt/w3-t5

sed -n '40,52p' internal/daemon/ai_transport_observation.go
#   EXPECT `type AITransportObservationResponse struct` (:43) and
#          `type AITransportObservationEntry struct` (:48). If these have grown a
#          `Traffic` field, w8 Task 3 has already landed - APPEND to it, do not reshape.

sed -n '2354,2362p' internal/daemon/ai_handlers.go
#   EXPECT the comment "a second counter would be a second truth" and
#          `s.recordTransportRouteDecision(rec.Provider)` at :2360.

sed -n '67,113p' internal/fieldobs/fieldobs.go
#   EXPECT LedgerFileName = "ai-field-observations.json" (:67),
#          Providers = []string{"anthropic","openai"} (:81),
#          type Checkpoint (:87), type Route (:98), type Ledger (:106),
#          func Path(dir string) (:113)

sed -n '27,48p' internal/security/paths.go
#   EXPECT ConfigDir = filepath.Join(os.UserHomeDir(), brand.ConfigDirName), i.e. $HOME/.devoid.
#   THIS IS NOT THE MACHINE ROOT. Confirm it before writing anything.

grep -n "golang.org/x/sys" go.mod
#   EXPECT: 14:	golang.org/x/sys v0.38.0   (a DIRECT require - no new module is needed)

go doc golang.org/x/sys/windows 2>/dev/null | grep -i "ExtendedTcpTable\|MIB_TCPROW_OWNER_PID"
#   Either outcome is fine, but RECORD IT: if x/sys exports these, use them; if not,
#   declare them with windows.NewLazySystemDLL("iphlpapi.dll"). Do NOT add a new module.

grep -n "func ListProcesses" internal/system/process.go
#   EXPECT: 117:func ListProcesses() []ProcessInfo
#   If absent, STOP - do not add a second process enumerator.
```

### LANDMINES

- **Writing any new entry under the machine root (`%ProgramData%\devoid`; `internal/core/config/config.go:524` `MachineCredsDir`) requires the SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624-630`, with the matching `createBoundaryChildren` (`:607`) entry and `boundaryChildRead` (`:634`) grant** - or the next MSI operation dies at `inspectRootEntries` (`:1047`) with `machine root contains unknown entry %q` (`:1086`) -> **1722 -> 1603 -> the whole upgrade rolls back on every ENROLLED endpoint**, while every clean-box test stays green because a clean box never creates the entry. This has fired three times here: `.staging`, `aitrust`, and `endpoint-identity.json` (on the owner's own box, 2026-08-20: a 7.8.42 endpoint that had enrolled the night before refused 7.8.43). **This task is a SYSTEM daemon and the temptation to put a fleet-visible ledger in `%ProgramData%\devoid` is exactly how the fourth one happens.** Use `fieldobs`, which writes to `security.DefaultPaths().ConfigDir` = `$HOME/.devoid` (`internal/security/paths.go:27-48`). If you genuinely need a machine-root path, STOP AND REPORT rather than adding one.
- **A number that looks like proof is this task's failure mode, not a crash.** A poll cannot see a connection that opened and closed between samples. Every consumer must be able to tell sampling from completeness, which is why `Method` and `IntervalMS` are load-bearing fields and not decoration.
- **A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent.** This task must contain **zero** refusal branches. It cannot block, delay or alter a packet. If you find yourself writing `if directEgress { deny }`, you are writing Task 6.
- **Inert-test shape 4.** Feed the classifier a PID that is not in the runtime set, an address family it does not know, and a destination that is neither loopback nor the provider. Assert which way each fails.
- **This is the endpoint's own telemetry floor.** Record destination **port + address family only**. Never the full address, never a hostname, never a process command line. Widening it later is a separate decision with a privacy review.

### DO NOT

- Do not redefine, rename or restructure `AITransportObservationResponse` / `AITransportObservationEntry`. `w8_coverage_truth.md` Task 3 owns them. Append.
- Do not add a second process enumerator. Use `internal/system.ListProcesses()` (`internal/system/process.go:117`).
- Do not match runtime PIDs on process **name**. Match on the process **image path** against the set the certified profile names (Task 8's inventory). A name match is trivially spoofed by copying a binary, which is matrix cell 3.
- Do not add a new Go module. `golang.org/x/sys v0.38.0` is already a direct require (`go.mod:14`).
- Do not install any filter, rule or hook. Observation only.
- Do not commit, push, or dispatch.

**Blast radius:** One polling goroutine in the SYSTEM daemon. If wrong: wasted CPU, or false "direct egress" records that make a healthy endpoint look non-compliant on a report. It cannot block, refuse, delay, or alter a single packet. Bound it: a 1 Hz default poll, a hard cap on records per hour, and a kill switch in the existing `netenforce` policy (`Mode == "off"` disables it).

**Rollback:** Set `netenforce` mode to `off` (`devoid network-enforce configure --mode off`), or revert the single `go s.runDirectEgressWitness(ctx)` line.

### STEPS

- [ ] Write `TestWitnessClassifiesLoopbackGatewayAsRouted`: a connection row `{pid: X, remote: 127.0.0.1:19280}` owned by a certified runtime PID classifies as `Routed`. Record RED.
- [ ] Write `TestWitnessClassifiesExternal443AsDirect`: `{pid: X, remote: 160.79.104.10:443}` from the same PID classifies as `DirectEgress` with the destination recorded as **port + address family only**. Assert the record contains no dotted quad and no colon-hex address. Record RED.
- [ ] Write `TestWitnessIgnoresNonRuntimeProcesses`: a PID not in the runtime set yields no record, regardless of destination. Record RED.
- [ ] Write `TestWitnessIsSamplingAndSaysSo`: `WitnessResult.Method == "poll"` and `WitnessResult.IntervalMS` is populated, so a consumer cannot read "0 direct connections" as proof. Record RED.
- [ ] Write `TestWitnessRecordsNothingWhenModeIsOff`: with `netenforce.Policy.Mode == "off"`, zero records regardless of input. Record RED.
- [ ] Implement `conntable_windows.go` over `iphlpapi.dll!GetExtendedTcpTable` with `TCP_TABLE_OWNER_PID_ALL` for `AF_INET` and `AF_INET6`, plus `GetExtendedUdpTable` for `UDP_TABLE_OWNER_PID`. Non-Windows builds get `conntable_other.go`, which returns an empty table and `Method: "unsupported"` - never a zeroed "0 direct connections".
- [ ] Runtime PID identification: match on the process **image path** against the set the certified profile names (Task 8's inventory), using `internal/system.ListProcesses()`.
- [ ] Add an additive `DirectEgress` record to `internal/fieldobs` keyed by the same closed provider vocabulary at `fieldobs.go:81`, so the ledger `w8_coverage_truth.md` Task 8 puts on the wire already carries it.
- [ ] **Append** `directEgress` (map, same closed vocabulary) and `observationMethod` to `AITransportObservationResponse`. Additive JSON fields only.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation.** In `internal/aiegress/witness.go`, change `Method` to the constant `"complete"`.

**Command.**
```sh
cd /c/cwt/w3-t5 && go test ./internal/aiegress/ -run TestWitnessIsSamplingAndSaysSo -count=1
```

**Required output.** FAIL, containing the literal string:
```
witness claims complete coverage: want method="poll", got method="complete"
```

This is the defeat test that matters, because the failure mode of this task is not a crash - it is a number that looks like proof.

**Second defeat test.** Mutation: make `conntable_other.go` return `Method: "poll"` with an empty table on non-Windows.
```sh
cd /c/cwt/w3-t5 && go test ./internal/aiegress/ -run TestWitnessUnsupportedPlatformIsNotZero -count=1
```
must FAIL with `unsupported platform reported method="poll" with 0 rows; absence of measurement is not a measurement of zero`.

### EXIT

1. **Number.** A 60-minute run on a real box with a deliberately bypassed Claude (user-set `ANTHROPIC_BASE_URL`) records **>=1** `DirectEgress` observation; the same run with the route intact records **0**.
2. **Named artifact.** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/direct-egress-witness-baseline.md` carrying both numbers, the poll interval, and the `observationMethod` value.
3. **Command.** `curl -H "<daemon token>" http://127.0.0.1:19280/v1/ai/transport-observation | jq -r '.observationMethod'` returns `poll` on Windows and `unsupported` elsewhere.

---

## Task 6: WFP / ALE application-scoped direct-egress denial, ALLOWLIST-ONLY, in a dynamic session, off by default

> **RECONCILIATION R5 applies and changes the containment mechanism.** The plan previously specified a **deny-list** (`node.exe`, `Code.exe`, `python.exe`, `powershell.exe`, `cmd.exe`, `git.exe`, `devoid-daemon.exe`) while its own surface table described an **allowlist** ("app-scoped to an explicit list of image paths"). Two mechanisms, one test. **The plan builder is now ALLOWLIST-ONLY: `BuildPlan` refuses any image that is not on the certified list.** The deny-list survives as a **redundant second assertion** inside the same builder. A deny-list on its own is one unlisted interpreter away from taking a machine down - the exact failure this task's defeat test claims to prevent.
>
> **RECONCILIATION §6 adds Stage 4 to this task.** `PREVENTION_ACTIVE` is blocked on exactly two things and one of them is here. `w8_coverage_truth.md` Task 6 is right that the posture reads zero everywhere today, but the reason does **not** "simply stop being emitted" when this task lands - **someone must wire a `directEgressDenied` producer into the posture input, and that someone is this task.** Stage 4 below is that work, and it is the only part of this wave with a real Backend-first constraint.

**Files (the complete set):**
- `internal/aiegress/wfp_plan.go` - new, pure filter-plan builder (allowlist-only)
- `internal/aiegress/wfp_plan_test.go` - new
- `internal/aiegress/wfp_windows.go` - new, `fwpuclnt.dll` interop
- `internal/aiegress/wfp_stub.go` - new, non-Windows
- `internal/aiegress/deployer.go` - new, a `Deployer` seam mirroring `internal/netenforce/gitegress_seams.go:15-19`
- `internal/netenforce/types.go` - one new `Policy` field, `ProviderEgressDenial`
- `cmd/devoid/main.go` - new verbs under the existing `network-enforce` dispatch at `:414`
- **Stage 4 only:** `internal/fieldobs/fieldobs.go` (the producer), plus the Backend accept-side owned by `w8_coverage_truth.md` Task 8

### What WFP can actually do here, stated honestly

**It can:** deny an outbound connection at `FWPM_LAYER_ALE_AUTH_CONNECT_V4` / `_V6`, scoped to one application, for TCP and UDP, covering IPv4 and IPv6 and therefore QUIC, and permit a specific loopback destination for that same application at a higher weight so the DeVoid gateway stays reachable. Filters live in our own sublayer, so a user-added Windows Firewall "allow" rule cannot re-open the path.

**It cannot:** redirect. User-mode WFP filter management is permit/block only; transparent redirection needs `FWPS_LAYER_ALE_*_REDIRECT`, which is a kernel callout driver. We are not writing one, and the strategy agrees (Workstream 4 D, and the Avoid list). So the design is "deny direct, and the configured route is the only thing left", not "capture everything".

**What it requires:** `FwpmEngineOpen0` + `FwpmFilterAdd0` need `FWPM_ACTRL_ADD` on the engine, granted by default to `Administrators` and `SYSTEM`. The DeVoid daemon already runs as `NT AUTHORITY\SYSTEM` at `HIGHEST` (`cmd/devoid/setup_installer.go:851-859`; the identical args from the CLI path at `cmd/devoid/main.go:2658-2666`), so **no MDM and no additional elevation is required to install these filters.** That is a verified fact about the shipping install. (`windows-installer/msi-build/scripts/install_daemon_task.vbs` exists and registers `/RL LIMITED /IT`, but `git grep -n install_daemon_task origin/main -- windows-installer/` returns **empty** - it is referenced by nothing and is dead. Re-run that grep before relying on the SYSTEM claim.)

**What genuinely needs MDM or App Control, and must not be written as an engineering task:**

1. **Stopping a local administrator from removing the filters.** Nothing local can do this. The certified scope (strategy §2.1) already excludes hostile local administrators. Detect-and-revoke is the honest answer, and Task 7 is where it lands.
2. **A stable application identity across vendor update paths.** `FwpmGetAppIdFromFileName0` derives the app id from the **file path**. A copied or moved runtime binary is a different app id and is not covered. App Control / AppID tagging gives a path-independent identity, and for a fleet that means a WDAC policy deployed through Intune/MDM. **Do not write a task that builds AppID tagging without MDM.** The safe subset is: re-derive app ids whenever the runtime identity changes, and revoke the certificate when a runtime binary appears at an uncertified path (Task 7).
3. **Preventing local firewall-rule merge from weakening org policy.** Only relevant if you use Windows Firewall rules. We are not - our own sublayer sidesteps the merge question entirely.

**The identity problem that decides the scope of this task, and it is not a Windows problem.** ALE identifies the process that owns the socket. A Claude Code installed through npm is `node.exe` running a JS entry point; the socket owner is `node.exe`, not `claude.exe`. Blocking `node.exe` fleet-wide would break every Node tool on the machine and is exactly the kind of change that gets an agent uninstalled. Therefore:

| Surface | ALE app-scoped denial | Reason |
|---|---|---|
| Codex CLI (native `codex.exe`) | **Yes** | Own process, own image path |
| Claude Code, native-binary install | **Yes** | Own process |
| Claude Code, npm/`node.exe`-hosted | **No** | Socket owner is a shared interpreter; scoping is impossible without breaking unrelated tools |
| Claude Desktop / Codex desktop app | **Yes** | Own process |
| VS Code / JetBrains extension host | **No** | Socket owner is the IDE's shared extension host |
| WSL2 | **No** | Host ALE does not cover the lxss network path; already a separate profile per strategy §2.1 |

The certified 9+ profile must therefore **name the native-binary install as a requirement**, and every other row above is a declared-uncovered cell, not a silent gap. That is a narrowing of the claim, not a weakening of a guard. **The allowlist is built from the "Yes" rows and nothing else.**

### Why a dynamic session, and why not Windows Firewall rules

A persistent filter (or a `New-NetFirewallRule -Program ... -Action Block`) survives the daemon's death. If the daemon dies and never comes back, the runtime can reach neither the provider nor the gateway and the developer's agent is bricked - that is precisely the July 2026 shape, and an uninstalled agent protects nobody. `FwpmEngineOpen0` with `FWPM_SESSION_FLAG_DYNAMIC` makes every filter added on that session **automatically removed by Windows when the session closes or the process exits**. The provable condition for this fail-closed branch is therefore: *"the DeVoid gateway process is alive"* - and it is provable because the same process holds the filters. No gateway, no filters, agent works. That is the property that makes this shippable.

The cost is honest and must be stated in the product surface: **filters do not survive a reboot** and there is a window between boot and daemon start. That window is covered by the managed-endpoint shim refusal (`agent_shim.go:520`) and by the certificate going stale, not by WFP. A persistent-filter "hard" profile is a separate, opt-in, later decision with its own watchdog; do not ship it in this wave.

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t6 -b w3/t6-wfp-denial origin/main && cd /c/cwt/w3-t6

# 1. Task 5 must have landed - this task consumes its witness and its package.
ls internal/aiegress/witness.go
#   EXPECT the file to exist. If not, STOP - Task 5 is the prerequisite, do not build it here.

# 2. Task 8's ancillary inventory must exist - the allowlist and the permit set come from it.
ls internal/aiegress/testdata/ancillary.json
#   EXPECT the file to exist. A default-deny with an unknown ancillary set is how you brick
#   a fleet's `claude login`. If absent, STOP AND REPORT.

# 3. The SYSTEM claim:
git show origin/main:cmd/devoid/setup_installer.go | sed -n '849,860p'
#   EXPECT /SC ONSTART /RU SYSTEM /RL HIGHEST
git grep -n install_daemon_task origin/main -- windows-installer/
#   EXPECT EMPTY OUTPUT. Any hit means the /RL LIMITED task is live and the
#   "no elevation required" claim is FALSE. STOP AND REPORT.

# 4. There is still no firewall code to collide with:
git grep -n -i "FwpmEngine\|INetFwPolicy" origin/main -- "*.go"
#   EXPECT EMPTY OUTPUT.

# 5. The seam discipline you are mirroring:
sed -n '5,22p' internal/netenforce/gitegress_seams.go
grep -n "func TestDeployerSeamNeverInvokedDuringGeneration" internal/netenforce/gitegress_backstop_test.go
#   EXPECT: 352:func TestDeployerSeamNeverInvokedDuringGeneration(t *testing.T) {

# 6. The default gateway port:
grep -n "defaultDaemonPort = 19280" internal/aihooks/transport_route.go
#   EXPECT: 37:const defaultDaemonPort = 19280
```

### LANDMINES

- **A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent.** This task installs the programme's most dangerous branch. The provable condition is *"the gateway process is alive, and it is the same process that holds the filters"* - a dynamic session makes that true by construction. **Stage 3's gateway-reachability self-test before the first block filter is not optional; without it this branch is exactly the July 2026 brick.**
- **The allowlist is the guard. The deny-list is a second assertion, not the mechanism.** `BuildPlan` must return an error for any image not on the certified list. The named shared interpreters are additionally rejected, so a bug that widens the allowlist still trips the second assertion. Removing either is weakening a guard.
- **Never weaken an existing guard to make this task fit.** If `internal/proxy/egress.go:161-162`'s doctrine ("devoid never mutates the host firewall") appears to block you: it does not. That doctrine is about the *host firewall*; this task installs filters in **our own WFP sublayer** and never touches Windows Firewall rules. If any other guard blocks the task, the task is wrong - report it, do not relax the guard.
- **Writing any new entry under the machine root (`%ProgramData%\devoid`) requires the SAME COMMIT to add it to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624-630`**, or the next MSI operation dies with `machine root contains unknown entry` (`:1086`) -> 1722 -> 1603 and rolls back the upgrade on every ENROLLED endpoint while every clean-box test stays green (three prior occurrences: `.staging`, `aitrust`, `endpoint-identity.json`). **The dynamic session is the reason this task needs no persistent state at all. Keep it that way** - if you find yourself persisting filter GUIDs to disk, you have re-introduced the reboot problem *and* armed the fourth brick.
- **Stage 4 widens an agent-wire contract, and the Backend must be deployed FIRST.** `EndpointControlsDto.runtimeAdapters` is `unknown[]` whose DTO decorators never execute (`Backend/src/.../heartbeat.types.ts:599-618`); the enforcing gate is the field-by-field rebuild in `runtime-adapter-shape.ts`, which **DROPS unknown keys rather than rejecting them**. An agent shipped ahead of the Backend loses the field silently - no error, no data, and `hooks-status` reads fine. **Backend accept-side deployed first, agent release second.** See ORDERING below.
- **Inert-test shape 4** is the whole reason for the allowlist. A test that only feeds `BuildPlan` known-good and known-bad images cannot tell a fail-safe allowlist from a fail-open deny-list. Feed it a genuinely unknown image (`C:\Tools\weird-runtime.exe`) and assert it is REFUSED.

### DO NOT

- Do not add an image to the allowlist to make a test pass. The allowlist is derived from the certified profile's "Yes" rows and Task 8's inventory.
- Do not create a persistent filter, a `New-NetFirewallRule`, or a session without `FWPM_SESSION_FLAG_DYNAMIC`.
- Do not write a kernel callout driver or any redirection layer.
- Do not enable `ProviderEgressDenial` by default. It defaults to `"off"`; `"monitor"` is the first deployment; `"enforce"` requires `netenforce.Policy.Mode == "enforce"` as well.
- Do not delete or skip `TestFilterPlanRefusesSharedInterpreters` or `TestFilterPlanRefusesUncertifiedImages` if they are in your way.
- Do not commit, push, deploy, or dispatch. Stage 4's Backend half needs a **fresh explicit ask from the owner**.

**Blast radius:** The largest in this wave by an order of magnitude. A wrong filter plan silently kills a developer's AI tooling, or - worse - kills something else on the box. Containment, in order: (1) the plan builder is **allowlist-only** and refuses any image not on the certified list; (2) a redundant deny-list additionally refuses `node.exe`, `Code.exe`, `python.exe`, `powershell.exe`, `cmd.exe`, `git.exe`, `devoid-daemon.exe`; (3) the whole feature is behind `netenforce.Policy.Mode == "enforce"` **plus** a new explicit `ProviderEgressDenial` field defaulting to `"off"`; (4) `"monitor"` installs zero filters and is the mandatory first deployment; (5) Stage 3 refuses to install a block filter until the gateway is proven reachable; (6) the session is dynamic, so process death removes everything. Who notices immediately: the developer whose agent stops working - which is why the monitor stage is mandatory.

**Rollback:** Four independent levers, any one sufficient: (1) `devoid network-enforce provider-egress configure --mode off` and the daemon drops the filters on the next tick; (2) `devoid network-enforce configure --mode monitor`; (3) `taskkill` the daemon - Windows removes the dynamic filters itself; (4) revert the code. There is no persistent state to clean up. This is the reason for the dynamic session.

### STEPS

- [ ] **Stage 0 - plan only, no interop.** Write `TestFilterPlanRefusesUncertifiedImages`: `BuildPlan` returns an error naming the image for `C:\Tools\weird-runtime.exe`, `C:\Users\x\Downloads\claude.exe`, and an empty path. **This is the allowlist test and it is the primary guard.** Record RED. *(inert-test shape 4)*
- [ ] Write `TestFilterPlanRefusesSharedInterpreters`: `BuildPlan` returns an error naming the image for each of `node.exe`, `Code.exe`, `python.exe`, `powershell.exe`, `cmd.exe`, `git.exe`, `devoid-daemon.exe` **even when a caller has erroneously added them to the allowlist**. This is the redundant second assertion. Record RED.
- [ ] Write `TestFilterPlanPermitsLoopbackGatewayAtHigherWeight`: the plan for a certified runtime at path P and gateway port 19280 contains exactly one permit filter (remote `127.0.0.1/32` and `::1/128`, remote port 19280, app id P) at a strictly greater weight than the block filter (app id P, all remote addresses), in one dedicated sublayer. Record RED.
- [ ] Write `TestFilterPlanCoversV4V6TcpAndUdp`: the plan enumerates `{V4,V6} x {TCP,UDP}` = 4 block filters, so QUIC on UDP/443 is covered.
- [ ] Write `TestFilterPlanPermitsCertifiedAncillaryOnly`: given `internal/aiegress/testdata/ancillary.json`, the plan permits exactly the entries marked `route: direct` and nothing else; an empty inventory yields DNS-only (UDP/TCP 53) plus loopback.
- [ ] Write `TestDeployerNeverInvokedByPlanning` with a spy deployer, mirroring `internal/netenforce`'s `TestDeployerSeamNeverInvokedDuringGeneration` (`gitegress_backstop_test.go:352`). Record RED until the seam exists.
- [ ] **Stage 1 - interop, behind the seam.** Implement `wfp_windows.go` over `fwpuclnt.dll`: `FwpmEngineOpen0` (with `FWPM_SESSION_FLAG_DYNAMIC`), `FwpmSubLayerAdd0`, `FwpmFilterAdd0`, `FwpmFilterDeleteById0`, `FwpmGetAppIdFromFileName0`, `FwpmEngineClose0`. Five entry points, one sublayer GUID, one filter struct. Non-Windows builds get `wfp_stub.go` and the plan builder still compiles and tests.
- [ ] **Stage 2 - monitor mode is mandatory and is the default first deployment.** `ProviderEgressDenial: "monitor"` installs **no filters at all** and instead reports what the plan *would* deny using the Task 5 witness. Only `"enforce"` installs filters. `TestMonitorModeInstallsZeroFilters` with the spy deployer asserting zero `Apply` calls.
- [ ] **Stage 3 - a self-test before the first block filter is ever added.** On entering enforce, the daemon must first prove the gateway is reachable from a child process at the permitted loopback destination. If the probe fails, refuse to install and record `provider-egress-denial-refused-gateway-unproven`. `TestEnforceRefusesWhenGatewayProbeFails`.
- [ ] **Stage 4 - wire the `directEgressDenied` producer into the posture input.** (RECONCILIATION §6.) Emit a **tri-state** `directEgressDenied` - `true` (filters installed and the gateway probe passed) / `false` (mode is monitor or enforce refused) / `null` (Windows unsupported, or the witness never ran). Carry it on the `fieldObservation` block that `w8_coverage_truth.md` Task 8 puts on the wire; do **not** invent a new heartbeat key. Also surface it in the local Go posture that `w8_coverage_truth.md` Task 9 composes into `/v1/health/detail`. Write `TestDirectEgressDeniedIsTriStateAndNeverFalseWhenUnmeasured`. **`null` must never be serialised as `false`** - "not measured" is not "not denied", and `w8_coverage_truth.md` Task 6 distinguishes `direct-egress-not-measured` from `direct-egress-not-denied` on exactly that difference.
- [ ] Add `devoid network-enforce provider-egress status|plan|configure`, reusing the existing dispatch at `cmd/devoid/main.go:414-415` and the existing `--json` conventions. `plan` prints the artifact and applies nothing - the same review-first doctrine `internal/proxy/egress.go:161-162` already states.

### ORDERING - Stage 4 only

Stage 4 is the **only** deploy-ordered item in this wave.

1. `w8_coverage_truth.md` **Task 5** (the field-level agent-wire loss counter) must be the **first Backend change in the entire programme**, ahead of this. Until it lands, a violation of the order below produces no error, no data and a console that looks correct.
2. `w8_coverage_truth.md` **Task 8**'s Backend accept-side deployed, with the owner's fresh explicit ask.
3. **Then** the agent release carrying Stage 4's producer.

Reverse that order and `AgentIngestValidationPipe` / `normalizeRuntimeAdapterReportOutcome` **drops the field silently** and `PREVENTION_ACTIVE` stays blocked with nobody able to say why.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation 1 (the allowlist - primary).** In `internal/aiegress/wfp_plan.go`, make `BuildPlan` accept any image whose path exists, instead of requiring membership of the certified allowlist.

```sh
cd /c/cwt/w3-t6 && go test ./internal/aiegress/ -run TestFilterPlanRefusesUncertifiedImages -count=1
```
must FAIL with:
```
BuildPlan accepted uncertified image "C:\\Tools\\weird-runtime.exe"; the plan builder is allowlist-only
```

**Mutation 2 (the redundant assertion).** Remove `node.exe` from the plan builder's deny-list **and** add it to the certified allowlist.

```sh
cd /c/cwt/w3-t6 && go test ./internal/aiegress/ -run TestFilterPlanRefusesSharedInterpreters -count=1
```
must FAIL with:
```
BuildPlan accepted shared interpreter image "node.exe"; a block filter on a shared interpreter takes the machine down
```

**Mutation 3 (the July-2026 guard).** Remove the Stage 3 gateway probe so enforce installs filters unconditionally.

```sh
cd /c/cwt/w3-t6 && go test ./internal/aiegress/ -run TestEnforceRefusesWhenGatewayProbeFails -count=1
```
must FAIL with:
```
enforce installed block filters with an unproven gateway; this is the July 2026 brick
```

**Mutation 4 (Stage 4 tri-state).** Serialise `null` as `false`.

```sh
cd /c/cwt/w3-t6 && go test ./internal/aiegress/ -run TestDirectEgressDeniedIsTriStateAndNeverFalseWhenUnmeasured -count=1
```
must FAIL with:
```
unmeasured directEgressDenied serialised as false; absence of measurement is not a measurement of "not denied"
```

### EXIT

1. **Number.** On a clean Windows 11 VM running the certified native-binary Claude and Codex, with `provider-egress-denial=enforce`, the Task 7 bypass matrix records **0** direct provider connections across all cells marked *enforceable* in the surface table above, and **0** regressions in the ancillary suite (agent starts, authenticates, completes a turn, and updates on its certified path).
2. **Number.** Killing the daemon removes **every** filter within **1 second**, measured. Command on the VM:
   `Stop-Process -Name devoid-daemon -Force; Start-Sleep -Milliseconds 1000; devoid network-enforce provider-egress status --json | ConvertFrom-Json | % filtersInstalled` returns `0`.
3. **Named artifact.** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/wfp-ale-vm-run-<date>.md`.
4. **Command (Stage 4).** After the Backend accept-side is live: `GET /api/v1/ai/protection-depth` on a VM in enforce mode carries `directEgressDenied: true` and the endpoint's `posture.reasons` no longer contains `direct-egress-not-measured`. On a monitor-mode box it carries `false` with `direct-egress-not-denied`. On a non-Windows box it carries `null` with `direct-egress-not-measured`.

---

## Task 7: The certified provider bypass matrix, and coverage that is observed rather than asserted

**Files (the complete set):**
- `internal/aiegressmatrix/` - new **test-only** package: `doc.go`, `README.md`, `aiegress_matrix_test.go`, copying the structure and the never-silent invariant of `internal/egressmatrix/` (three files only: `doc.go`, `README.md`, `egress_matrix_test.go`)
- `internal/netenforce/status.go` and `internal/netenforce/types.go` - the observed-control change
- `cmd/devoid/main.go` - the `mark-applied` behaviour around `netenforce.MarkControlApplied` at `:7979`

**Why:** The strategy's 9+ exit gate is a matrix result, not a feature list. And today `netenforce.Status.Effective()` (`types.go:64-85`) can read true because a human ran `mark-applied firewall`: `DetectStatus` fills `MissingControls` from `isControlApplied(configDir, control)` (`status.go:42-52`), which reads `state.AppliedControls` (`state.go:17-19`). A self-attested green over an unobserved control - the exact "no-op satisfaction" §12 forbids for this row.

The matrix cells, each with a required outcome of **routed through DeVoid** or **fails visibly** (never "silently direct"):

| # | Bypass attempt | Certified expectation |
|---|---|---|
| 1 | `CLAUDE.EXE` / `Claude.Exe` / `npm.CMD` | routed (Task 1) |
| 2 | absolute path to the real `claude` binary | routed via settings.json (Task 3's measurement decides which scope) |
| 3 | copy the real binary to a new path and run it | direct egress observed + certificate revoked (path-based app id cannot cover it; **this cell is declared, not solved**) |
| 4 | user-set `ANTHROPIC_BASE_URL` in the process env | routed on managed (`agent_shim.go:599-600`); **honest failure on cooperative** |
| 5 | project `.claude/settings.json` `env` override | reported, and demoted (Task 3) |
| 6 | `CODEX_HOME` redirect | routed (Task 4) |
| 7 | hand-edited `base_url` in `managed_config.toml` | detected as `provider-route-stale` (`codexmanaged/transport_route.go:88-107`) and rewritten |
| 8 | alternate provider table in Codex config | fails visibly or declared uncovered |
| 9 | IPv6 to the provider | denied (Task 6, `_V6` filters) |
| 10 | QUIC / UDP 443 | denied (Task 6, UDP filters) |
| 11 | system proxy (`HTTPS_PROXY`) pointed elsewhere | denied by ALE regardless of proxy config |
| 12 | VS Code extension host | **declared uncovered** for ALE; routed only by config |
| 13 | Claude Desktop | routed + denied |
| 14 | npm/`node.exe`-hosted Claude | **declared uncovered** for ALE |
| 15 | retry/reconnect after a deny | Codex per-turn deny persists 60 min (existing); Claude has no equivalent - **declared** |
| 16 | daemon killed mid-session | filters vanish (dynamic session), shim refuses on managed, cooperative fails open and says so |
| 17 | machine managed-settings `env.ANTHROPIC_BASE_URL` override | routed or reported per Task 3's **re-measured** 5-source fixture (added by RECONCILIATION C8) |

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t7 -b w3/t7-bypass-matrix origin/main && cd /c/cwt/w3-t7

git ls-tree --name-only origin/main internal/egressmatrix/
#   EXPECT exactly three paths: README.md, doc.go, egress_matrix_test.go.
#   This is the shape you copy. If it has grown, read it before copying.

sed -n '11,17p' internal/egressmatrix/doc.go
#   EXPECT the invariant: "a STRONG mode either BLOCKS the push OR marks the endpoint
#   NON-COMPLIANT - there is NEVER a silent-success path."

sed -n '38,52p' internal/netenforce/status.go
#   EXPECT the isControlApplied loop filling MissingControls.

sed -n '17,19p' internal/netenforce/state.go
#   EXPECT `AppliedControls map[string]int64` - the self-attested boolean.

grep -n "MarkControlApplied" cmd/devoid/main.go
#   EXPECT: 7979:		if err := netenforce.MarkControlApplied(secPaths.ConfigDir, control); err != nil {

sed -n '12,15p' internal/netenforce/types.go
#   EXPECT ControlProxy/ControlDNS/ControlFirewall/ControlMTLS. You are ADDING a fifth,
#   not redefining any of these four.
```

### LANDMINES

- **Do not redefine the `firewall` control.** Making `firewall` resolve from observation instead of `MarkedApplied` flips existing endpoints from `Effective()==true` to `false` fleet-wide and fires an alert storm. Introduce the observed state as a **NEW** control name, `provider-egress`, beside the four that exist. Additive.
- **`mark-applied provider-egress` must exit non-zero** with a message naming the control and saying it cannot be self-attested. Silently accepting it re-creates the defect this task exists to close.
- **The matrix package mutates nothing.** Mirror `internal/egressmatrix`'s spy-deployer discipline and assert zero `Apply` calls. A matrix that installs a filter to test a filter is a matrix that can brick a CI box.
- **Inert-test shape 5.** A skipped cell must carry a reason from a closed vocabulary and a meta-test must assert it. A `t.Skip()` with no reason is a cell that has never been evaluated wearing a green tick.
- **Inert-test shape 3.** Cells 1-8 have Claude *and* Codex forms. Assert both. `TransportEnvFor("codex")` returns `proxied=false`, which is exactly how a Codex-lane assertion has shipped dead here before.
- **Never weaken an existing guard to make a cell pass.** If a cell cannot be asserted, it is `declared-uncovered` with a named reason - not a relaxed guard.

### DO NOT

- Do not mark a cell `routed` on the strength of a config read. `routed` requires an observation (Task 5's witness or the `fieldobs` route ledger).
- Do not remove a cell because it is inconvenient. 17 cells present, always.
- Do not add an enforcement branch in this task. The `netenforce` change alters what posture *reports*, never what the endpoint *does*.
- Do not commit, push, or dispatch.

**Blast radius:** The matrix package is test-only and mutates nothing. The `netenforce` change is the risky half, and it is contained by being a **new** control (`provider-egress`) rather than a redefinition of `firewall`: adding it to `RequiredControls` is an explicit policy act, and until someone does, posture is byte-identical to today.

**Rollback:** The new control is additive; drop it from `RequiredControls` and posture returns to today's behaviour exactly.

### STEPS

- [ ] Write the matrix skeleton with all **17** cells present and every unimplemented cell asserting `t.Skip` **with the reason string checked by a meta-test** - `TestEveryMatrixCellIsEitherAssertedOrNamed` fails if a cell is skipped without a reason from the closed vocabulary `{"declared-uncovered","blocked-on-task-N","external-blocker"}`. Record RED. *(inert-test shape 5)*
- [ ] Write `TestNoCellIsSilentlyDirect`: for every cell, the recorded outcome is in `{routed, visible-failure, declared-uncovered}` and never `silent-direct`. This is the wave's single hardest invariant.
- [ ] Write `TestProviderEgressControlCannotBeSelfAttested`: `netenforce.MarkControlApplied(dir, "provider-egress")` returns an error naming the control. Record RED.
- [ ] Write `TestProviderEgressControlReadsObservedFilters`: with a fake filter enumerator returning the planned filter GUIDs, the control is applied; with an empty enumeration it is missing, **regardless of `state.json`**. Seed `state.json` with `provider-egress` marked applied and assert it is still missing. Record RED.
- [ ] Write `TestExistingFourControlsAreUnchanged`: `proxy`, `dns`, `firewall` and `mtls` still resolve from `MarkedApplied` exactly as before. Record GREEN before and after - a regression here is an alert storm.
- [ ] Implement the `ObservedControls` seam in `netenforce.DetectStatus` (an injected interface, defaulting to a Windows enumerator that lists our sublayer's filters and to a nil-returning stub elsewhere).
- [ ] Fill the cells that Tasks 1-6 unlock; leave 3, 12, 14, 15 as `declared-uncovered` with their reasons.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation 1.** Change any one cell's recorded outcome to `silent-direct` (use cell 4).
```sh
cd /c/cwt/w3-t7 && go test ./internal/aiegressmatrix/ -run TestNoCellIsSilentlyDirect -count=1
```
must FAIL with:
```
matrix cell 4 recorded silent-direct; a bypass matrix may not contain a silent success
```

**Mutation 2.** Make `MarkControlApplied` accept `provider-egress`.
```sh
cd /c/cwt/w3-t7 && go test ./internal/netenforce/ -run TestProviderEgressControlCannotBeSelfAttested -count=1
```
must FAIL with:
```
MarkControlApplied accepted "provider-egress"; an observed control may not be self-attested
```

**Mutation 3.** Make the observed control fall back to `state.json` when the enumerator returns empty.
```sh
cd /c/cwt/w3-t7 && go test ./internal/netenforce/ -run TestProviderEgressControlReadsObservedFilters -count=1
```
must FAIL with:
```
provider-egress read applied from state.json with zero observed filters; this is the self-attested green the control replaces
```

### EXIT

1. **Number.** **17/17** cells present, **13** asserted, **4** declared-uncovered with named reasons, **0** silent-direct. Verify: `go test ./internal/aiegressmatrix/ -count=1 -v | grep -c "^=== RUN"` returns 17+ and `grep -c "SKIP"` returns 4.
2. **Command.** `devoid network-enforce mark-applied provider-egress; echo $?` returns a non-zero code and prints a message naming `provider-egress`.
3. **Named artifact.** `internal/aiegressmatrix/README.md` with the test-to-cell map, in the style of `internal/egressmatrix/README.md`.

---

## Task 8: Inventory the ancillary traffic and declare Gemini out of the certified profile

> **Task 6 cannot start until this task's `ancillary.json` exists.** A default-deny with an unknown ancillary set is how you brick a fleet's `claude login`.

**Files (the complete set):**
- `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/ancillary-traffic-inventory.md` - new
- `internal/aiegress/testdata/ancillary.json` - new, the machine-readable copy the Task 6 plan builder consumes
- `internal/aiegress/ancillary_test.go` - new
- the certified-profile document - one Gemini row
- `cmd/devoid/ai.go` - one user-facing status string

**Why:** The strategy is explicit that model traffic, login, updates, telemetry, WebFetch, hosted tools and provider discovery are different things and each needs a decision (route / allow-direct / disable / declare unsupported).

For Gemini the honest answer is short: `internal/aiagent/aiagent.go:133-144` `TransportEnvFor` returns `("", false)` for `AgentTypeGemini`, there is no `/proxy/gemini` mount (only `/proxy/anthropic/` at `internal/daemon/server.go:687` and `/proxy/openai/` at `:789`), and `aiagent.go:14-15` says no Gemini body parser exists. Building one is a different wave.

### PRECONDITIONS - if any fails, STOP AND REPORT

```sh
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main            # EXPECT 5b12952307db9903fa166d5d9ce1a0c058e0ad77
git worktree add C:/cwt/w3-t8 -b w3/t8-ancillary origin/main && cd /c/cwt/w3-t8

sed -n '133,144p' internal/aiagent/aiagent.go
#   EXPECT TransportEnvFor: claude->("ANTHROPIC_BASE_URL", true), codex->("OPENAI_BASE_URL", false),
#          gemini->("", false), default->("", false)

sed -n '12,18p' internal/aiagent/aiagent.go
#   EXPECT the comment "codex/gemini transport DLP is a documented fast-follow
#          (no OpenAI/Gemini body parser exists yet)"

git grep -n "proxy/gemini" origin/main
#   EXPECT EMPTY OUTPUT. If a Gemini mount exists, this task's premise has changed. STOP.

sed -n '450,459p' internal/core/backend/ai_prompt.go
#   EXPECT AiPolicyAgents{Allowed, Mode} with the comment "Unconfigured is permissive - an
#   empty Allowed under enforce does NOT brick every agent."

# Task 5 must have landed - the inventory is CAPTURED with its witness:
ls internal/aiegress/witness.go
#   EXPECT the file to exist. If not, STOP - you cannot capture an inventory without a witness.
```

### LANDMINES

- **Do not block Gemini's launch to make a coverage number look better.** The agent allowlist already exists (`internal/core/backend/ai_prompt.go:450-459`) and is **the administrator's decision, set in our console, never hardcoded**. A code change that denies Gemini is a policy change made by an engineer.
- **`ancillary.json` becomes load-bearing in Task 6.** An entry you guess at becomes a permit filter or a missing one. Capture it by *observation*, not by reading vendor docs.
- **An entry with no decision must fail the review.** `route | direct | disable | unsupported` - four values, closed set, no default.
- **Inert-test shape 4.** Assert that an *unknown* decision string is rejected, not just that the four known ones are accepted. Otherwise the schema test cannot tell an allowlist from a passthrough.
- **Inert-test shape 1.** Do not assert the inventory with `strings.Contains` over the markdown. Parse `ancillary.json` and assert the parsed entries.
- This task writes to `.plans/` and `internal/aiegress/testdata/` only. Nothing under `%ProgramData%\devoid`; see Task 5's machine-root landmine for what happens if that changes.

### DO NOT

- Do not add a Gemini proxy mount, body parser or transport env. Out of scope; a different wave.
- Do not change `TransportEnvFor`. Read-only.
- Do not mark an entry `direct` because you could not determine it. Unknown is `unsupported` with a reason, never `direct`.
- Do not commit, push, or dispatch.

**Blast radius:** Documentation plus one JSON fixture and one status string. The JSON fixture becomes load-bearing only in Task 6. Who notices: a customer reading the certified-scope document, and an administrator who now sees `gemini: execution-governed, traffic not routed` instead of an unqualified row.

**Rollback:** Revert the strings; the fixture is only read when provider-egress denial is enabled.

### STEPS

- [ ] Enumerate, per certified surface, every outbound destination class the runtime uses: model API, auth/login, update check and download, telemetry, hosted tools, provider discovery, marketplace/plugin fetch. Capture it by running each certified binary in the clean VM with the Task 5 witness enabled and a permissive plan, for one full session **including login and an update check**.
- [ ] Assign each entry exactly one of `route | direct | disable | unsupported`, with a one-line reason.
- [ ] Write `TestAncillaryInventoryIsTotalAndTyped`: every entry has a non-empty destination class, a decision from the closed set, and a reason; the file parses; an unknown decision string is REJECTED. Record RED.
- [ ] Write `TestPlanPermitsOnlyDirectDecisions` (pairs with Task 6): the plan's permit set equals the `direct` entries plus loopback plus DNS.
- [ ] Add the Gemini row to the certified-profile document with the three facts (execution-governed by the shim, traffic not routed, no body parser), and change the status string in `cmd/devoid/ai.go` so it says so.

### DEFEAT TEST - runnable, with the exact expected failure text

**Mutation 1.** Add an entry to `internal/aiegress/testdata/ancillary.json` with `"decision": ""`.
```sh
cd /c/cwt/w3-t8 && go test ./internal/aiegress/ -run TestAncillaryInventoryIsTotalAndTyped -count=1
```
must FAIL with:
```
ancillary entry "claude:update" has no decision; every ancillary flow must be routed, allowed, disabled or declared unsupported
```

**Mutation 2.** Add an entry with `"decision": "probably-fine"`.
```sh
cd /c/cwt/w3-t8 && go test ./internal/aiegress/ -run TestAncillaryInventoryIsTotalAndTyped -count=1
```
must FAIL with:
```
ancillary entry "claude:telemetry" has decision "probably-fine"; the closed set is route|direct|disable|unsupported
```

### EXIT

1. **Named artifact.** `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/ancillary-traffic-inventory.md` with **>=1** entry per (certified surface x destination class) and **0** entries lacking a decision.
2. **Command.** `jq -r '.entries[] | select(.decision == "" or (["route","direct","disable","unsupported"] | index(.decision) | not)) | .id' internal/aiegress/testdata/ancillary.json` prints nothing.
3. **Command.** `devoid ai hooks-status gemini` prints a line containing `execution-governed, traffic not routed`.

---

## Wave exit criteria

1. **The uppercase walk-past is closed and pinned.** `go test ./cmd/devoid/ -run 'NormalizeName|NameDispatch|IsCanonicalDevoidName'` passes with 10 normalizer cases, 5 dispatch pairs and 5 canonical names. The on-box before/after (`CLAUDE.EXE` producing `Running in shim mode` before and `Running in AI-agent shim mode` after) is recorded verbatim. Defeat test: `TestNormalizeNameIsCaseInsensitiveOnTheExtension`.
2. **A dispatch-name gap can no longer be silent.** At least one `SHIM_IDENTITY_MISMATCH` record produced on a real Windows box; **0** cooperative-endpoint refusals; **0** refusals on an indeterminate image. Defeat test: `TestShimIdentityCooperativeNeverRefuses`.
3. **Claude route precedence is measured across five scopes, not assumed.** A **32**-cell evidence file exists for the certified binary, measured before and re-measured after `w4_vendor_authority.md` Task 4; `devoid doctor` reports `unverified` for any binary version with no such fixture. Defeat test: `TestProjectScopeOverrideIsReportedNotSilent`.
4. **A relocated `CODEX_HOME` is governed.** The R5 route is installed **in that directory**; **0** frozen S-cfg goldens changed. Defeat test: `TestUserRetryRefusesUnsafeCodexHome`.
5. **Direct egress is observable.** Baseline artifact records >=1 direct observation with the route deliberately bypassed and 0 with it intact, and the surface states `method=poll` (or `unsupported`, never a zeroed `poll`). Defeat test: `TestWitnessIsSamplingAndSaysSo`.
6. **Denial exists, is allowlist-scoped, and cannot brick.** VM run artifact shows 0 direct provider connections in the enforceable cells and 0 ancillary regressions; killing the daemon removes every filter within one second (measured); `directEgressDenied` is a tri-state that never serialises `null` as `false`. Defeat tests: `TestFilterPlanRefusesUncertifiedImages`, `TestFilterPlanRefusesSharedInterpreters`, `TestEnforceRefusesWhenGatewayProbeFails`.
7. **The matrix has no silent success.** 17/17 cells, 13 asserted, 4 declared, 0 silent-direct; `mark-applied provider-egress` exits non-zero; the four existing controls are byte-identically unchanged. Defeat tests: `TestNoCellIsSilentlyDirect`, `TestProviderEgressControlCannotBeSelfAttested`.
8. **Ancillary traffic is decided.** 0 entries without a decision; an unknown decision string is rejected. Defeat test: `TestAncillaryInventoryIsTotalAndTyped`.

### Ordering rules for this wave

**1. Tasks 1 and 2 ship ahead of the entire eight-wave programme.** Phase 0. RECONCILIATION §3 item 8.

**2. Task 3's measurement runs before `w4_vendor_authority.md` Task 4 and is RE-MEASURED after it.** RECONCILIATION C8 / §3 item 9. The machine scope is the fifth source and W4 Task 4 creates it.

**3. Task 5 carries NO deploy-ordering constraint.** RECONCILIATION C3: the earlier claim that `/v1/ai/transport-observation` required a Backend deploy first was **wrong and is struck**. It is a token-gated loopback handler on the daemon (`internal/daemon/server.go:588`), read by the local CLI; grepping Backend `origin/main` for `routeObserved` / `transportRoute` / `routeDecisions` returns nothing. A phantom entry in an ordering list is how a real one gets ignored, so it is gone.

**4. Task 6 Stage 4 IS Backend-first, and it is the only such item in this wave.** The `directEgressDenied` producer rides the `fieldObservation` block. `runtimeAdapters` is `unknown[]` whose DTO decorators never execute; `normalizeRuntimeAdapterReportOutcome` rebuilds field-by-field and **DROPS unknown keys rather than rejecting them** - no error, no data, and it looks like it worked. Therefore, in order: `w8_coverage_truth.md` **Task 5** (the wire-loss counter, the first Backend change in the whole programme) -> `w8_coverage_truth.md` **Task 8** Backend accept-side, deployed on a fresh explicit owner ask -> the agent release carrying Stage 4.

**5. Task 8 before Task 6.** Task 6's default-deny needs the ancillary inventory; without it, `claude login` breaks fleet-wide.

**6. Task 5 before Task 6.** The witness is how monitor mode reports and how the allowlist is sized.

**7. Land Task 6 Stage 4 in the same release note as `w8_coverage_truth.md` Task 6.** RECONCILIATION R7: three tasks across three waves turn green surfaces red at the same time. `w8` Task 6 lands first because it is the one that explains the others.

---

## What this wave deliberately does NOT do

- **No kernel callout driver, and therefore no transparent redirection.** User-mode WFP is permit/block only. Everything here is "deny the direct path so the configured route is the only one left", never "capture traffic the client did not agree to send us".
- **No broad TLS interception.** The proxy terminates only traffic that was configured to use it. We are not becoming a corporate MITM.
- **No IP or FQDN provider blocklist.** Provider endpoints sit on shared CDN ranges that move. The denial is app-scoped and **allowlist-only**, which does not rot when a cloud range changes.
- **No credential brokering, and no claim of credential isolation.** This wave keeps credentials client-held and requires the assurance tier to **say so**, rather than implying gateway isolation the product does not have.
- **No persistent firewall rules and no boot-time enforcement.** Dynamic-session filters vanish when the daemon exits. A reboot-to-daemon-start window stays open, covered by the managed shim refusal and by certificate staleness, not by WFP.
- **No App Control / AppID tagging.** It is the correct answer to the copied-binary cell (matrix #3) and it genuinely requires a WDAC policy, which for a fleet means Intune/MDM the customer may not have. The safe subset shipped here is detect-and-revoke.
- **No ALE coverage for `node.exe`-hosted agents or IDE extension hosts.** The socket owner is a shared interpreter. These are declared-uncovered cells in the matrix and a named requirement (native-binary install) in the certified profile.
- **No WSL2, macOS or Linux enforcement.** Host ALE does not cover the lxss network path; `internal/osenforce/gitegress_doc.go:38-40, :49` already models WSL-from-host as a first-class not-enforceable cell and that judgement carries over unchanged.
- **No Gemini routing.** There is no Gemini body parser and no proxy mount. Gemini stays execution-governed and traffic-ungoverned, and the product says that in words.
- **No change to any existing guard.** Nothing here weakens `managedEndpoint()`, the surface gate, the provider deny-list, the `--bare` strip, the proxy's fail-closed default, the malicious floor, the four existing `netenforce` controls, or the MSI root guard's allowlist. Task 7 *tightens* one posture control by adding a new observed one beside the self-attested one rather than by loosening anything.
- **No production-authority-chain proof.** Every live-proof artefact in this wave is a **local-rig or clean-VM measurement**. RECONCILIATION §6 records that no wave in the programme owns convergence against production signing, policy and evidence - and this wave does not claim it either.
- **No deploy.** Every item above is code and evidence. Deploying needs a fresh, explicit ask from the owner, every time.
