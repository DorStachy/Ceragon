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

# Wave 7 — Make every lifecycle transition prove its own outcome

**Scorecard rows this moves:** Operational durability 4.5 → 9.5 (shared with Wave 2). This wave owns four
of that row's seven evidence clauses — *no logon gap*, *atomic updates/rollback*, *lifecycle
certification*, *no residue*. Wave 2 owns the other three (*real service*, *external recovery*,
*secure IPC*).

**Depends on:** Nothing outside this wave for Tasks 1, 2, 3, 8. **Task 4 is gated on Task 1** (the
diagnosis must exist and must name exactly one mechanism) and **ships in a later release than Task 3**.
Tasks 5 and 7 land useful standalone but only reach their strongest form once Wave 2 has replaced the
scheduled-task daemon with a real service — both notes say exactly where.

**Task 6 is a prerequisite for Wave 2 and must be implemented first, ahead of everything else in this
wave.** RECONCILIATION §4 R1 is the plan's hardest constraint: Wave 2 Tasks 6 and 8 write
`<machineRoot>\sessions\...`, `sessions` is not in the MSI root guard's allowlist, and the result is
1722 → 1603 → the upgrade rolls back on **every enrolled endpoint** while every clean-box CI matrix
stays green. Task 6 is the completeness pin that catches it. It must exist *before* the writer
arrives, so it lands ahead of Wave 2 Task 6 (Phase 1) even though the rest of this wave is Phase 5.

**Phase:** 5 (*install/update/repair/uninstall certification*). Two exceptions: **Task 5 is Phase 1**
(strategy §11 Phase 1's "no one-minute unwired state"), and **Task 6 is a Phase-0/1 prerequisite** for
the reason above. The phase map in RECONCILIATION §6 lists Task 6 under Phase 5; that is the map's
own inconsistency with R1, and R1 wins.

All paths are relative to the workspace root `C:/Users/Owner/Documents/Ceragon/`. Every line number in
this document was read at **`Installers` `origin/main` = `5b129523`** (the local checkout is 1010
commits behind and sits on an unrelated branch; read with `git show origin/main:<path>`, never from the
working tree).

---

## How an agent executes this wave

You will see one task, not this whole document. Read this block first anyway — it is short and every
line of it has cost this codebase real damage at least once.

1. **Work in a git worktree under `C:/cwt/`, one per task.**
   ```
   cd C:/Users/Owner/Documents/Ceragon/Installers
   git fetch origin main
   git worktree add C:/cwt/w7-t<N> -b w7/t<N> origin/main
   cd C:/cwt/w7-t<N>
   ```
   Do every edit, build and test from `C:/cwt/w7-t<N>`. **Never edit
   `C:/Users/Owner/Documents/Ceragon/Installers` directly** — it is 1010 commits behind `origin/main`
   and on branch `fix/remote-uninstall-privileged-daemon`; a change made there is a change against a
   tree that no longer exists upstream.

2. **NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared repo-wide across every
   worktree. A `git stash pop` in your worktree silently takes another concurrent session's stashed
   work. This has been hit twice in one day here. If you need a clean tree, **commit**.

3. **Commit each task immediately when it is done — never batch.** A crash and three API outages hit
   one campaign in this repo; only committed work survived. A half-finished task committed on its own
   branch is recoverable; an uncommitted one is not.

4. **`git add <explicit paths>`, never `git add -A`.** The tree carries unrelated scratch files, patch
   files and evidence directories; `-A` sweeps them into your commit.

5. **A test you cannot make RED has not run.** Every task below carries a DEFEAT TEST: a mutation, a
   command, and the exact string that must appear. Apply the mutation, run the command, see the string,
   revert the mutation. Do not report a test as passing without that round trip. The five inert-test
   shapes that have shipped GREEN in this repo:
   - a test that asserts on a value it computed itself;
   - a table-driven test with an empty table (zero cases, reports `ok`);
   - a test whose subject sits behind an unwired DI seam, so the production path is never entered;
   - a test asserting a substring that appears in both the pass and the fail rendering;
   - **a build-tag- or lane-excluded test that never runs.** This is the one that bites here:
     `//go:build windows` files run in *no* pull-request lane. See landmine **L-CI** below.

6. **L-CI — the Windows test lanes, read at `origin/main`.** Before you claim a new Go test is
   covered, check which lane runs it:
   - `.github/workflows/pr-checks.yml` runs `go test` on `ubuntu-latest` for eleven package sets and on
     **`windows-latest` for exactly two**: `./cmd/devoid/...` (`pr-checks.yml:318-351`) and
     `./internal/pathfix/...` (`:380`).
   - `./cmd/devoid-msi-root-guard/...`, `./internal/uninstall/...` and `./windows-installer/msi-build/...`
     appear in **no `go test` step in `pr-checks.yml` at all**.
   - The only `go test ./...` in the repo is `internal-candidate.yml:87`, whose `validate` job is
     `runs-on: ubuntu-latest` (`:33`) and which does not run on a pull request (`pr-checks.yml:500`
     says so in its own comment). On ubuntu every `//go:build windows` file compiles to nothing and the
     package reports `ok` with zero tests.
   - Therefore a new `//go:build windows` test in `internal/uninstall` or `cmd/devoid-msi-root-guard`
     is **inert in every lane that exists** until it is added to the `windows-latest` job. Tasks 2, 3
     and 6 each carry that step. Do not skip it: an inert pin against a fleet-wide brick is worse than
     no pin, because it reads as coverage.
   - GitHub Actions is blocked org-wide on this account (Free-plan spending limit, 2026-08-26) and the
     local Docker CI mirror (`ci/README.md`) cannot run Windows containers. So a windows-latest leg you
     add **cannot be verified from this machine**. Run the test on a Windows box yourself, record the
     command and its output in the task's evidence, and say plainly which legs did and did not run.

7. **Read source with `git show origin/main:<path>`.** On Git Bash, prefix with `MSYS_NO_PATHCONV=1`
   and quote the argument, or `origin/main:.github/...` is mangled into a path.

8. **Do not commit, deploy, dispatch a workflow, or run the E2E harness against production.** Deploying
   needs a fresh explicit ask from the owner every time. See landmine **L-PROD** in Task 8.

9. **If a PRECONDITION fails, STOP AND REPORT.** Do not improvise a substitute path, file, constant or
   test target. This codebase has a documented history of agents inventing plausible replacements —
   invented vendor keys, invented file paths, a "fix" that widened a version pin — and each one shipped
   green.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## What exists today

### The MSI, as authored

The shipped Windows product is `Installers/windows-installer/msi-build/Product.wxs` (619 lines at
`5b129523`), WiX v4, `Scope="perMachine"`, installing into `%ProgramData%\devoid`. It declares **65
components, each with an explicit, unique `Guid`** — no `Guid="*"` anywhere.

- `BINDIR` receives **exactly 41 files** from four component groups: `CoreBinaries` (2 —
  `Product.wxs:146-162`), `ToolShimExes` (19 — `:168-247`), `ToolShimCmds` (19 — `:254-332`), and
  `PromptGuardFiles`' `comp_pg_host_exe` (1 — `:391-396`). 2 + 19 + 19 + 1 = **41**. That is the same
  41 the 2026-08-27 real-box install measured and the same 41 the uninstall left behind. **The residue
  is not a subset. It is the complete `BINDIR` component file set, spanning two different features.**
- Every one of those components carries `<RemoveFile … On="install" />`. `On="install"` is a
  *pre-install* stale-copy sweep, not the uninstall mechanism — MSI's own `RemoveFiles` standard action
  is what removes an installed component's files when the component transitions to absent. The Source
  of Truth's §3 and §6 both say "each carrying its own `<RemoveFile>`, so MSI owns them and is supposed
  to remove them"; the conclusion is right, the cited mechanism is not the operative one. (The SOT
  cites `Product.wxs:167-200`; at `5b129523` the shim exe components run `:168-247` and the `.cmd`
  components `:254-332`.)
- There is deliberately **no `<RemoveFolder>` for `BINDIR`** and the reason is written in place
  (`Product.wxs:366-372`): a `RemoveFolder` there "failed the uninstall with 1603 when the
  guard-hardened, daemon-touched BINDIR could not be removed mid-transaction". **Do not add one.**
  That note also contains the assumption this wave has to retire: "*what matters for a clean uninstall
  is that no active shim FILES remain, which RemoveFiles guarantees*". On 2026-08-27 it did not.
- `<MajorUpgrade … Schedule="afterInstallExecute" />` (`Product.wxs:29-30`) — a deliberate
  non-default schedule, so the new payload installs *before* the old product's removal transaction.
- The `DependencyShims` feature (`Product.wxs:585-593`) carries
  `<Level Value="0" Condition='DEPS_ENABLED = "0"' />` at `:590`. That compiles to a Condition-table row
  re-evaluated at **every** transaction including uninstall. It cannot explain the observation on its
  own — the `CoreAgent` feature (`Product.wxs:568`) is `AllowAbsent="no"` (`:572`) and its two binaries
  are in the residue — but it must be ruled out rather than assumed away.

### The uninstall sequence

`Installers/windows-installer/msi-build/CustomActions.wxs` (670 lines), `InstallExecuteSequence`
`:638-666`. In order: `CA_KillProcesses` (`:643`) → `CA_TeardownMachineState` (`:652`;
payload-independent SYSTEM teardown, run from the embedded `DevoidMsiRootGuard` binary,
`Return="ignore"`, definition `:116-121`) → `CA_DeregisterEndpoint` (`:655`) → `CA_RemoveDaemonTask`
(`:656`, `Before="RemoveFiles"`) → `CA_RemoveGitHooks` (`:657`) → `CA_UnpatchPowerShellProfile`
(`:658`) → `CA_RemoveCredentials` (`:659`) → **standard `RemoveFiles`/`RemoveFolders`** →
`CA_FinalizeMachineRootUninstall` (`:665`, definition `:81-86`: `Execute="commit"`, `Return="check"`,
deletes only a *verified, empty* canonical root).

Every uninstall CA is `Return="ignore"` or advisory. **Nothing in the transaction checks that
`RemoveFiles` actually removed anything.** The uninstall's success is msiexec's exit code and nothing
else.

### Two force-strip paths, and what neither of them cleans

There are two code paths that remove DeVoid's Windows Installer registration **without running the MSI
transaction**:

1. `Installers/install-scripts/production/uninstall.ps1:468-513`,
   `Remove-DevoidInstallerRegistrationByProductCode`. It deletes the three ARP keys, plus
   `HKLM\SOFTWARE\Classes\Installer\Products\<packed>`,
   `HKLM\SOFTWARE\Classes\Installer\Features\<packed>`,
   `HKLM\…\Installer\UserData\S-1-5-18\Products\<packed>` (`:474-485`), plus the Package Cache folder
   (`:501-511`). It is entered on `-Recover` **or automatically**, with no operator flag, whenever an
   installer-registered machine has no payload present (`uninstall.ps1:1498-1505`).
2. `Installers/internal/uninstall/windows_installer_windows.go:272`,
   `RemoveWindowsInstallerResidueForRecovery` → `windowsInstallerResidueCleanupScript` (`:303`), which
   enumerates only the three `…\CurrentVersion\Uninstall` roots (`:315-317`).

**Neither path touches `HKLM\SOFTWARE\Classes\Installer\Components\<packedComponentGuid>` or its
`UserData\S-1-5-18\Components` twin.** That hive is where MSI records, per component GUID, the list of
client ProductCodes and the installed path. A force-strip therefore leaves every one of the 65
component GUIDs still naming a now-nonexistent ProductCode as a client. `Product.wxs`'s `<Package>`
element declares no `ProductCode`, so WiX v4 auto-generates a fresh one per build while the component
GUIDs stay fixed — orphaned clients accumulate build over build. When msiexec later uninstalls a
*real* registration and finds a surviving client for a component, it logs
`Disallowing uninstallation of component: {GUID} since another client exists` and **leaves the file on
disk**. That is the leading hypothesis for the 2026-08-27 observation, and it is the one Task 1 must
confirm or kill before Task 4 fixes anything.

### A residue probe already exists, is already wired, and has no payload stage

`Installers/internal/uninstall/residue_probe_windows.go` (268 lines) is a complete, seam-injected,
unit-tested probe with six stages: `machine-path` (`:59-67`), `native-host` (`:71-80`),
`release-trust` (`:84-95`), `scheduled-task` including the per-user AI reconcile task (`:100-129`),
`config` (`:134-141`) and `codex-machine` (`:154-158`). Seam struct `:18-33`; production seams
`realResidueSeams()` `:164-172`.

It is wired into exactly **one** call site: `Installers/cmd/devoid/uninstall_command.go:427`, inside
`executeRemoteUninstall` (`:323`) — the console-initiated remote uninstall — where a non-empty result
forces `cleanupVerified=false` and keeps the endpoint enrolled rather than deregistering it. That is
exactly the right pattern.

Two gaps:

- **There is no stage for the machine payload.** `machineConfigResidue`
  (`residue_probe_windows.go:244-259`) stats only `credentials.json` and `config.json`, and the probe's
  own comment (`:131-133`) says the running pending-delete binary is "intentionally NOT probed here".
  So the one probe that exists is structurally blind to the exact defect in front of us.
- **It is not called from the interactive CLI uninstall (`runUninstall`,
  `cmd/devoid/uninstall_command.go:627`) or from the MSI path at all.** The MSI's teardown runs from
  the embedded guard, which has no residue verb.

### A lifecycle E2E harness already exists, already asserts the residue, and is never run

`Installers/windows-installer/e2e-tests/run-silent-install-e2e.ps1` (165 lines) drives scenarios
A/B/C plus `-IncludeExtended` DEPS/HOOKS/PHASE2/DEFERTOKEN. The scenario names are a
`[ValidateSet]` on the `$Scenarios` parameter at `:4`; the ordering map is `$order` at `:22`; the
per-scenario MSI properties come from `Get-ScenarioFlags` at `:23-28`. Each scenario "installs,
verifies … , uninstalls, and checks clean slate" (`e2e-tests/README.md`).

`Installers/windows-installer/e2e-tests/lib/Verify.ps1:100-111`, `Test-NoDevoidInstalled`, already
asserts that `devoid.exe`, `devoid-daemon.exe`, `credentials.json`, the daemon task, the ARP entry, the
PATH entry and **all 19 shims in both `.exe` and `.cmd` form** are gone (the shim list is
`$script:DevoidShimTools` at `Verify.ps1:6`). That check would have caught 40 of the 41 files. It
misses only `devoid-prompt-guard-host.exe` and anything not on that hard-coded list.

**No workflow runs it.** `Installers/.github/workflows/release.yml`'s `build-msi` job (`:1043`,
`runs-on: windows-latest` `:1046`) *builds* the FlaUI suite (`:1102-1107`) and never executes it;
`run-silent-install-e2e.ps1` is referenced nowhere under `.github/` (verified by
`git grep -n run-silent-install-e2e origin/main -- .github/` → no matches). `finding-b-e2e.yml` is a
shim-enforcement matrix, not an install-lifecycle matrix. The assertion exists; the gate does not.

### Upgrade: more atomic than the strategy assumes, and missing the canary

`Installers/cmd/devoid/upgrade_msi_apply_windows.go:63-135`, `applyManagedMsiUpgradeIfNeeded`, already
does most of what strategy §10's "Update" section asks for, in the right order:

- SHA-256 pin against the Ed25519-signed manifest (`:79-82`), then an Authenticode signer pin
  (`:84-98`);
- anti-rollback floor advanced **before** the transaction (`release.PersistAcceptedRelease`, `:103`);
- `msiexec /i … ENROLLMENT_MODE=deferred /qn /norestart /L*v <log>` run **synchronously and waited on**
  (`runManagedMsiInstall` at `:113`, exit-code check `:118-121`, argv in `managedMsiInstallArgs`
  `:259-261`), so success is never reported on a mere launch;
- `verifyManagedInstallVersion` after a success exit (`:127-129`, definition `:267`) — "a rolled-back
  transaction leaves the OLD binary in place, so this closes the 'reported success but stayed on the
  old version' gap".

What is genuinely absent:

- **No post-upgrade functional canary.** The applied *version* is proved; nothing proves the new
  generation still intercepts. A build that installs cleanly and cannot reach a decision passes.
- **No retained upgrade evidence.** On success both the MSI and the verbose log are deleted
  (`:130-131`).
- **Binary rollback to a lower version is refused by design** — `release.PersistAcceptedRelease` is
  forward-only and the floor is advanced before the transaction. This is correct and must stay; see
  "What this wave deliberately does NOT do".

### The upgrade brick class that has now fired three times

`Installers/cmd/devoid-msi-root-guard/guard_windows.go:1047`, `inspectRootEntries`, hard-fails
with `machine root contains unknown entry %q` (`:1086`) on any name in `%ProgramData%\devoid` that is
not in a hand-maintained allowlist: `boundaryChildNames` (`:624-629` — `bin, config, logs, evidence,
doctor,` plus `activationStoreDirName` = `"aitrust"`, `:1005`) plus `credentials.json`, `daemon-token`,
`endpointIdentityFileName`, `installModeMarkerName` and `proxyConfigDirName` (`:1061-1066`). The guard
runs from the MSI Binary table with `Return="check"`, so a failure is 1722 → 1603 → the whole upgrade
rolls back.

The tree documents the shape in its own words at
`cmd/devoid-msi-root-guard/guard_endpoint_identity_windows_test.go:13-26`: the agent creates a new root
entry, the allowlist has never heard of it, the next MSI operation dies — "so a clean-box install
always passes and only a REAL endpoint, one that has been in service, fails. **Every CI matrix in the
world stays green.**" It has fired on `.staging` (F-MSI-1722), on `aitrust` (F13/DF-71), and on
`endpoint-identity.json` — the last one caught on the owner's box on 2026-08-20, where "a 7.8.42
endpoint that had enrolled the night before refused 7.8.43". The same narrative is repeated in the
guard source at `guard_windows.go:1011-1020`.

The defence added each time is a *per-name* pin (`TestActivationStoreDirNameMatchesKeystore`,
`TestEndpointIdentityFileNameMatchesConfig` at `guard_endpoint_identity_windows_test.go:32-39`).
**There is no completeness pin.** The fourth new root entry bricks every enrolled endpoint's next
upgrade. Wave 2 Tasks 6 and 8 are about to write that fourth entry (`sessions`). Task 6 below is the
pin.

### The post-install ungoverned window

`Installers/internal/aiwiretask/aiwiretask.go`: `TaskName = "Devoid AI Governance Reconcile"` (`:144`),
`RepeatInterval = "PT5M"` (`:170`), `LogonDelay = "PT1M"` (`:178`), principal `BUILTIN\Users`
(`UsersGroupSID`, `:211`), action pinned to `<machineRoot>\bin\devoid-daemon.exe ai reconcile`
(`TaskArguments :150`, `TaskExeName :154`, `ValidateExe :241`). Registration is `schtasks /Create /F
/XML` (`CreateArgs :328-333`) — **there is no `/Run`, anywhere** (verified:
`git grep -n '"/Run"' origin/main -- internal/aiwiretask/` returns nothing). Nothing kicks the task at
install time, so the endpoint is installed-but-unwired for roughly the first minute of the session,
with the installer already exited 0, exactly as SOT §3.3 and §6 state.

The `PT1M` delay is not arbitrary: the comment at `:172-178` records that it exists so the reconcile
does not compete with the logon storm and so the SYSTEM daemon has bound its loopback wire proxy first.
**Shortening it re-arms the race it was added to remove.** The honest closures are (a) make the state
reported rather than silent and (b) make the first governed launch prove it wired — not to shave the
delay.

### The durable reconcile stamp that already exists

`Installers/cmd/devoid/ai_wire_retry.go` is the F9 permanent-ungoverned fix and it already owns the
only durable reconcile stamp in the product:

- `aiWireRetryInterval = 15 * time.Minute` (`:60`);
- `aiWireRetryStampName = "aiwire-last-reconcile"` (`:65`), under `devoidUserDirName = ".devoid"`
  (`:68`), i.e. **`<userHome>\.devoid\aiwire-last-reconcile`** (`aiWireRetryStampPath`, `:71-73`) — a
  **per-user, user-owned** path, not a machine-root file;
- `aiWireRetryDue` (`:80-86`) already treats an **absent or unreadable stamp as DUE**, with the
  reasoning written in place: "a box that has never reconciled in this user's context is precisely the
  broken case this file exists for";
- `maybeReconcileAIWireUserContext` is called on every shim invocation from `cmd/devoid/agent_shim.go:496`
  and `cmd/devoid/main.go:4860`.

This is the stamp Task 5 must compute readiness from, and the one Wave 2 Task 6's broker must update.
**RECONCILIATION C4 settles this: Wave 7's rule wins on the stamp, Wave 2's mechanism wins on the
closure.**

---

## Task 6 (FIRST): Stop the fourth upgrade brick before it is written

> **This task is implemented before every other task in this wave, and before Wave 2 Task 6.**
> RECONCILIATION §4 R1 fix step 2: "Land W7 Task 6 before W2 Task 6 so the completeness pin exists when
> the writer arrives." Wave 2 Task 6 and Task 8 add `<machineRoot>\sessions\<userSID>\…`. Without this
> pin, that ships and every enrolled endpoint's next upgrade rolls back with 1722 → 1603 while CI stays
> green.

**Files:**
- `Installers/cmd/devoid-msi-root-guard/guard_root_allowlist_completeness_test.go` (new)
- `Installers/cmd/devoid-msi-root-guard/guard_windows.go` (edit only the error message; allowlist edits
  only if a test legitimately goes red)
- `Installers/.github/workflows/pr-checks.yml` (add the package to the existing `windows-latest` job)
- Read-only inputs: `Installers/internal/core/config/*`,
  `Installers/cmd/devoid-msi-root-guard/guard_endpoint_identity_windows_test.go`,
  `Installers/windows-installer/msi-build/test-msi-log-assertions.ps1`

### PRECONDITIONS

Run each; the expected output is stated. **Any mismatch: STOP AND REPORT. Do not substitute.**

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main
git rev-parse origin/main
# EXPECT exactly: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
# If it differs, origin/main has moved since this plan was written. Every line number below
# was read at that SHA. STOP and report the new SHA; do not "adjust" line numbers by guessing.

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/guard_windows.go | sed -n '624,629p'
# EXPECT the 6-element boundaryChildNames literal ending in `activationStoreDirName,` then `}`

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/guard_windows.go | sed -n '1086p'
# EXPECT exactly:
#			return fmt.Errorf("machine root contains unknown entry %q", entry.Name())

MSYS_NO_PATHCONV=1 git show origin/main:internal/core/config/config.go | sed -n '644p'
# EXPECT: const DaemonTokenFileName = "daemon-token"

MSYS_NO_PATHCONV=1 git show origin/main:internal/core/config/endpoint_identity.go | sed -n '38p'
# EXPECT: const EndpointIdentityFileName = "endpoint-identity.json"

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/guard_endpoint_identity_windows_test.go | sed -n '10p'
# EXPECT: 	"github.com/codefense/cli-wrapper/internal/core/config"
# This proves the guard's TEST package may import internal/core/config even though its
# PRODUCTION path deliberately does not. If this import is gone, STOP: the whole
# enumeration mechanism below depends on it.

MSYS_NO_PATHCONV=1 git grep -n "go/parser" origin/main -- internal/aipolicycontract/inertness_test.go
# EXPECT at least one hit. This is the in-repo precedent for a test that parses source.
```

You need a **Windows** machine to run `go test ./cmd/devoid-msi-root-guard/...` at all — every file in
that package except `main_other.go` is `//go:build windows`. Verify:

```bash
MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/guard_windows_test.go | head -1
# EXPECT: //go:build windows
```

### BLAST RADIUS

**Zero at runtime for the test itself.** This task adds tests and changes one error string. Its only
failure mode is a red CI leg that names a real, unlisted root entry — which is the point. The cost of
*not* doing it is measured: three occurrences, the most recent bricking every endpoint that had
enrolled. The one part with real blast radius is the CI change: adding a step to the `windows-latest`
job costs runner minutes on an account whose Actions are currently blocked. Add the step anyway and say
in the commit message that it was not executed here.

### LANDMINES

- **L-CI (see the top block).** `./cmd/devoid-msi-root-guard/...` is tested by **no pull-request
  workflow**. The only `go test ./...` is `internal-candidate.yml:87` on `ubuntu-latest`, where every
  `//go:build windows` file compiles to nothing and the package reports `ok` with zero tests. If you
  add this pin and do not add the package to the `windows-latest` job in `pr-checks.yml:318-351`, you
  have written the plan's load-bearing pin as **inert-test shape 5** and Wave 2's brick still ships.
- **The error message has three existing consumers and one of them is a PowerShell exact-prefix
  assertion.** `guard_windows_test.go:148`, `:716` and `guard_aitrust_windows_test.go:222` all use
  `strings.Contains(err.Error(), "unknown entry")`; `windows-installer/msi-build/test-msi-log-assertions.ps1:81`
  asserts the line matches `devoid MSI root guard: machine root contains unknown entry` via
  `[Regex]::Escape`. So you may **append** to the message, and only append: the substring
  `machine root contains unknown entry %q` must survive byte-identical and stay at the front.
- **Writing any new entry under the machine root requires the SAME COMMIT to add it to
  `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go`**, plus the matching
  `createBoundaryChildren` (`:607`) creation and `boundaryChildRead` (`:634`) grant, or the next MSI
  operation dies with 1722 → 1603 and rolls back the upgrade on every ENROLLED endpoint while every
  clean-box test stays green. This has happened three times: `.staging`, `aitrust`,
  `endpoint-identity.json`. This task exists to make the fourth impossible.
- **The guard's production path deliberately does not import the agent's packages** — it is embedded in
  the MSI Binary table. `guard_windows.go:1001-1004` says so. Your test may import
  `internal/core/config` (the existing identity test does); the guard's non-test files may not.
- **`%ProgramData%\devoid.premigration` is a SIBLING of the machine root, not a child**
  (`migrate_windows.go:47`, `:110`). It needs no allowlist entry. Do not add one.

### DO NOT

- **Do not add a name to the allowlist to make a red test green.** A red completeness test means a
  writer exists that the guard will refuse. Report it; the fix is a coordinated commit that adds the
  name to `boundaryChildNames` *and* `createBoundaryChildren` *and* `boundaryChildRead`, which is a
  different change with a different review.
- **Do not delete, skip, or `t.Skip` any existing guard test** to make the new one fit.
- **Do not rewrite the `machine root contains unknown entry %q` prefix.** Append only.
- **Do not weaken `inspectRootEntries` in any way** — not by lowercasing more aggressively, not by
  adding a prefix or glob match, not by tolerating unknown entries with a warning. If the guard blocks
  something, the thing it blocks is wrong.
- **Do not change `boundaryChildNames`, `activationStoreDirName` or `endpointIdentityFileName` values.**

### Steps

- [ ] Create `guard_root_allowlist_completeness_test.go` with `//go:build windows` and
      `package main`, importing `go/ast`, `go/parser`, `go/token`, `strings`, `testing`,
      `path/filepath`, and `github.com/codefense/cli-wrapper/internal/core/config`.
- [ ] Write **`TestGuardAllowlistCoversEveryMachineRootWriter`**. The enumeration mechanism, stated
      precisely enough to implement without re-deriving it:
      1. `parser.ParseDir(token.NewFileSet(), filepath.Join("..", "..", "internal", "core", "config"), nil, 0)`.
         (Precedent for source-parsing in a test: `internal/aipolicycontract/inertness_test.go`.)
         Skip files whose name ends `_test.go`.
      2. Walk every top-level `*ast.GenDecl` with `Tok == token.CONST`. For each `*ast.ValueSpec`,
         take names that are **exported** (`ast.IsExported`) and whose identifier ends in `FileName`
         or `DirName`, and whose single value is an untyped string `*ast.BasicLit` of kind
         `token.STRING`. Unquote it with `strconv.Unquote`.
      3. Keep only values that are a **machine-root child name**: no `/`, no `\`, not `.`, not `..`,
         non-empty. Anything containing a separator is a path fragment, not a root child; record it in
         the test's log line so a future reader can see what was filtered and why.
      4. Subtract an **explicit, named exclusion list** — a `map[string]string` of
         `constantName → one-line reason`, e.g. a constant that names a child of the *user* home rather
         than the machine root. At `5b129523` this list is **empty** and the surviving set is exactly
         `{DaemonTokenFileName: "daemon-token", EndpointIdentityFileName: "endpoint-identity.json"}`.
         Assert the exclusion list is empty-or-justified: every entry must have a non-empty reason
         string, so nobody can silence the pin with a bare name.
      5. For each surviving value: `root := t.TempDir()`, `productionGuardPolicy()`, create the entry
         (a file for `*FileName`, a directory for `*DirName`), then assert
         `inspectRootEntries(root, policy) == nil`.
      6. On failure, `t.Fatalf` naming the **constant**, the **file it was parsed from**, the **value**,
         and the two edit sites: `boundaryChildNames` and the extra-names loop in `inspectRootEntries`
         (`guard_windows.go:624-629` and `:1061-1066`).
      7. `t.Logf` the two counts — the number of enumerated machine-root names and the number of entries
         in the `inspectRootEntries` allowlist — so the EXIT criterion is observable from test output.
      It should PASS today. If it does not, it has already found the fourth brick: stop and report,
      do not add the name.
- [ ] Add a `CONTRIBUTING`-level comment directly above `boundaryChildNames` (`guard_windows.go:624`)
      stating the contract this test creates: **any new file or directory written to the machine root
      must be named by an exported `…FileName` / `…DirName` string constant in
      `internal/core/config`, and must be added to `boundaryChildNames` (or the `inspectRootEntries`
      extra-names loop) plus `createBoundaryChildren` and `boundaryChildRead` in the same commit.** A
      bare string literal in a daemon file is invisible to this pin — which is exactly why Wave 2
      Task 8's session directory must land as `config.SessionsDirName`, not as `"sessions"` inline.
      **Cross-reference: Wave 2 Task 6 and Task 8 depend on this contract; RECONCILIATION §4 R1 step 3.**
- [ ] Write **`TestGuardAllowlistIsClosedOverBoundaryChildNames`**: assert every name in
      `boundaryChildNames` is accepted by `inspectRootEntries` on a temp root. The F13/DF-71 comment at
      `guard_windows.go:613-623` says the divergence between creator and enumerator is exactly what
      armed `aitrust`; this pins the two halves together permanently.
- [ ] Write **`TestGuardRejectsUnknownRootEntryWithActionableMessage`**: create an entry named
      `zz-unknown-probe` in a temp root and assert `inspectRootEntries` returns an error whose text
      (a) **begins** with `machine root contains unknown entry "zz-unknown-probe"` and (b) also
      contains `boundaryChildNames` and `inspectRootEntries`. Then extend the message at
      `guard_windows.go:1086` to satisfy (b) — **append only**, e.g.
      `machine root contains unknown entry %q; add it to boundaryChildNames and the inspectRootEntries allowlist in cmd/devoid-msi-root-guard/guard_windows.go, with a pin test in the same commit`.
- [ ] Re-run the three existing consumers of that message and confirm they are still green:
      `go test ./cmd/devoid-msi-root-guard/... -run 'Aitrust|UnknownEntry|EndpointIdentity|EnrolledMachineRoot' -count=1`
      and `pwsh -NoProfile -File windows-installer/msi-build/test-msi-log-assertions.ps1`.
- [ ] **Add the package to the Windows CI lane.** In `.github/workflows/pr-checks.yml`, inside the
      existing `runs-on: windows-latest` job at `:318`, add a step after `:351`:
      `run: go test ./cmd/devoid-msi-root-guard/... -count=1`. Record in the commit message that this
      leg was **not executed here** (Actions blocked org-wide; Docker cannot run Windows) and paste the
      local Windows `go test` output instead.

### DEFEAT TEST

**Mutation:** in `cmd/devoid-msi-root-guard/guard_windows.go`, delete `endpointIdentityFileName,`
from the extra-names literal at `:1062` (leave the rest of the list intact).

**Command (on a Windows box, from the worktree):**
```
go test ./cmd/devoid-msi-root-guard/ -run TestGuardAllowlistCoversEveryMachineRootWriter -count=1
```

**Must appear in the output:**
```
machine root contains unknown entry "endpoint-identity.json"
```
— the exact string the owner's box produced on 2026-08-20 — together with the constant name
`EndpointIdentityFileName`.

**Then revert the mutation and re-run; the test must be green.** If the test is green *with* the
mutation applied, the enumeration is not reaching the constant and the pin is inert — fix the
enumeration, do not proceed.

### ROLLBACK

Delete `guard_root_allowlist_completeness_test.go`, revert the one-line message change at
`guard_windows.go:1086`, and remove the `pr-checks.yml` step. Three reverts, no shipped behaviour
change.

### EXIT

`go test ./cmd/devoid-msi-root-guard/... -count=1 -v` on Windows is green with **3 new tests**, and the
`t.Logf` line prints two equal counts — enumerated machine-root names and `inspectRootEntries`
allowlist entries — as **a number, printed by the test**. Paste that line into the commit message.
`pr-checks.yml` contains a `go test ./cmd/devoid-msi-root-guard/...` step inside the `windows-latest`
job, verifiable with
`git grep -n 'devoid-msi-root-guard' .github/workflows/pr-checks.yml`.

---

## Task 1: Diagnose the 41-file / 424 MB residue by elimination, and write the mechanism down

**Files:**
- New evidence file, **inside the Installers repo** so the defeat test can read it:
  `Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md`
  (the plan directory gets a one-line pointer at
  `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w7/residue-diagnosis.md`, **not a second copy** — two copies of an
  evidence file is how this codebase grows two truths)
- New script: `Installers/windows-installer/e2e-tests/diagnose-uninstall-residue.ps1`
- New test block in `Installers/windows-installer/e2e-tests/tests/Report.Tests.ps1`
- Read-only inputs: `Installers/windows-installer/msi-build/Product.wxs`,
  `Installers/windows-installer/msi-build/CustomActions.wxs`,
  `Installers/install-scripts/production/uninstall.ps1`

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/Product.wxs | grep -c '<Component Id='
# EXPECT: 65

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/Product.wxs | sed -n '168,247p' | grep -c '<Component Id='
# EXPECT: 19        (ToolShimExes)

MSYS_NO_PATHCONV=1 git show origin/main:install-scripts/production/uninstall.ps1 | grep -n 'Classes\\Installer'
# EXPECT exactly three hits: :448 (UpgradeCodes), :482 (Products), :483 (Features).
# ZERO hits naming `Classes\Installer\Components`. If a Components hit appears, the
# force-strip has changed since this plan and H1 may already be closed — STOP AND REPORT.

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/e2e-tests/tests/Report.Tests.ps1 | head -1
# EXPECT: BeforeAll { . "$PSScriptRoot/../lib/Report.ps1" }   # Pester v5: dot-source in BeforeAll
```

**Environment, all four required. Any one missing: STOP AND REPORT — do not run a reduced version
on a real machine.**

```powershell
# 1. A DISPOSABLE Windows 11 VM with a snapshot taken BEFORE anything is installed.
#    Verify you are on it, not on the owner's box:
(Get-CimInstance Win32_ComputerSystem).Model
#    EXPECT a hypervisor model ("Virtual Machine", "VMware…", "VirtualBox"). A physical
#    model means you are on a real endpoint: STOP.

# 2. Elevated session:
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
#    EXPECT: True

# 3. No pre-existing DeVoid install:
Test-Path C:\ProgramData\devoid
#    EXPECT: False

# 4. A built MSI/bundle from this worktree (Installers/windows-installer/msi-build/build.ps1).
```

### BLAST RADIUS

None to the product — the script installs and uninstalls on a disposable VM and writes only under
`%TEMP%` and the evidence file. The risk is *diagnostic*, not operational: if this task guesses instead
of measures, Task 4 fixes the wrong thing and the residue survives a release that claims to have
removed it. That failure is invisible until a customer's security review finds `claude.exe` on a
machine they believe is clean.

**Probe 4 mutates Windows Installer registration.** `uninstall.ps1 -Recover` deletes ARP keys, the
`Classes\Installer\Products|Features` keys, the `UserData\S-1-5-18\Products` key and the Package Cache
folder (`uninstall.ps1:474-511`). On a machine with a real DeVoid install that is not recoverable
without a reinstall. It is safe **only** on a VM you can roll back.

### LANDMINES

- **The earlier explanation is wrong and must not be re-adopted.** The Source of Truth blames the
  shim-hardening step for having "no uninstall counterpart". It does not fit: the 19 shim `.exe`
  files are **genuine MSI `File` components** inside `ToolShimExes` (`Product.wxs:168-247`), each with
  its own `<RemoveFile>`, and the same is true of the 19 `.cmd` files (`:254-332`) and of the two core
  binaries (`:146-162`). MSI owns all 41. Do not let this task "confirm" that story.
- **`<RemoveFile … On="install" />` is a *pre-install* stale-copy sweep, not the uninstall mechanism.**
  The operative action on uninstall is MSI's standard `RemoveFiles`. A diagnosis that reasons from the
  `RemoveFile` rows is reasoning about the wrong action.
- **Do not create anything under `%ProgramData%\devoid` while diagnosing.** A scratch directory or log
  file there is an unknown root entry, and the next MSI operation on that VM dies with
  `machine root contains unknown entry` → 1722 → 1603 (`guard_windows.go:1086`). Write everything to
  `%TEMP%`.
- **`%ProgramData%\devoid.premigration` is a sibling of the root, not a child** — if it exists, it is
  the migration quarantine (`migrate_windows.go:47`), not residue.
- **Do not use the E2E harness (`run-silent-install-e2e.ps1`) for this task.** Its `lib/Backend.ps1`
  scales the **production** ECS service (`Backend.ps1:4-9`, `--cluster backend --service backend-service`).
  See L-PROD in Task 8.

### DO NOT

- **Do not fix anything in this task.** Task 1 measures; Task 4 repairs. A fix inside Task 1 destroys
  the evidence that would tell Task 4 whether it was the right fix.
- **Do not skip Probe 4.** Probes 0-3 produce a correlation. Probe 4 produces the mechanism. A
  diagnosis without it cannot gate Task 4, which is a registry sweep on a hive other vendors share.
- **Do not write a mechanism the msiexec log does not contain.** If two hypotheses survive, say so and
  list what would separate them.
- **Do not run any part of this on the owner's machine.**

### Steps

- [ ] **Probe 0 — is it `BINDIR`-specific or package-wide?** The 2026-08-27 report enumerated
      `C:\ProgramData\devoid\bin` only. Before anything else, enumerate `CONFIGDIR` too. The MSI installs
      two files there (`com.devoid.prompt_guard.json` at `Product.wxs:397-402`,
      `com.devoid.prompt_guard.firefox.json` at `:403-408`). **If those were removed while all 41
      `BINDIR` files stayed, the fault is directory-scoped** (lock, ACL, `FILE_DELETE_CHILD`, or a
      `BINDIR`-only component-state problem). **If both stayed, it is package-scoped** (registration or
      component-client refcount). This single observation halves the search space and costs one
      `Get-ChildItem`.
- [ ] **Probe 1 — creation timestamps.** For each residue file record `(Get-Item $f).CreationTimeUtc`
      and `LastWriteTimeUtc` against the uninstall's start time (captured before `msiexec /x`). A
      creation time *after* the uninstall started means the files were removed and **re-created**, which
      is a completely different defect from "never removed" and points at a surviving writer (the
      daemon's self-heal, a shim process that outlived `CA_KillProcesses` at `CustomActions.wxs:643`,
      or the per-user reconcile task). This is the cheapest discriminator in the set; run it first.
- [ ] **Probe 2 — the decisive MSI log.** Run the uninstall as
      `msiexec /x {ProductCode} /qn /norestart /l*vx %TEMP%\devoid-uninstall.log`. Then grep the log,
      in this order, for:
      - `since another client exists` → **H1: orphaned component clients.** Confirmed.
      - `Component: comp_claude_exe` with `Action: Null` (rather than `Action: Absent`) → the component
        never transitioned; read the `Feature:` lines just above it.
      - `FeatureName: DependencyShims` … `Action: Null` → **H2: feature deselected at uninstall**
        (would spare `CoreBinaries`; inconsistent with Probe 0 if the core binaries also stayed).
      - `RemoveFiles` present but the per-file `DeleteFile` lines absent or erroring → **H6: deletion
        attempted and failed** (then run `icacls` and `attrib` on the residue).
      - `RemoveFiles` absent entirely, or no `MsiInstaller` 1034/11724 event in the Application log →
        **H4: the MSI transaction never ran** — the removal went through `uninstall.ps1`'s
        auto-recovery force-strip (`uninstall.ps1:1498-1505`) or
        `RemoveWindowsInstallerResidueForRecovery` (`internal/uninstall/windows_installer_windows.go:272`).
- [ ] **Probe 3 — the component-client hive, read before and after.** For each of the 65 component
      GUIDs in `Product.wxs` (all explicit, all unique — verified), compute the MSI packed GUID and read
      `HKLM\SOFTWARE\Classes\Installer\Components\<packed>`. Record the value names (each is a packed
      ProductCode) before install, after install, and after uninstall. **Two or more client
      ProductCodes after uninstall is H1, proven directly, independent of the log.** Note that
      `uninstall.ps1:474-485` removes `Products`, `Features` and `UserData\…\Products` and never
      `Components` — so the orphan survives every recovery run.
- [ ] **Probe 4 — reproduce on a clean VM.** If H1 is confirmed on the dev VM, prove causation from a
      fresh snapshot by running: install → `uninstall.ps1 -Recover` (force-strip) → install →
      `msiexec /x`, and asserting the residue appears; then roll back to the snapshot and run the same
      sequence with the middle force-strip replaced by a normal `msiexec /x`, asserting it does not.
      **This is the step that turns a correlation into the mechanism.**
- [ ] Write `Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md` containing: the
      Probe 0/1 numbers, the **verbatim** msiexec log lines that selected the hypothesis (each on its
      own line, beginning `MSI (s)`), the before/after `Components` hive dump, and one paragraph naming
      the mechanism. If two hypotheses survive Probe 4, say so and list what would separate them.
      **Do not write a mechanism the log does not contain** — the SOT already carries one wrong
      explanation ("the shim-hardening step has no uninstall counterpart") that survived long enough to
      be repeated.
- [ ] Add a one-line pointer at `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w7/residue-diagnosis.md` naming the
      repo path above. **Do not duplicate the content.**

### DEFEAT TEST

**Mutation:** delete every line beginning `MSI (s)` from
`Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md`.

**Command (from the worktree root):**
```
pwsh -NoProfile -Command "Invoke-Pester -Path ./windows-installer/e2e-tests/tests/Report.Tests.ps1 -Output Detailed"
```

**Must appear in the output:**
```
residue-diagnosis.md names a mechanism with no msiexec log excerpt behind it
```

The Pester block to add to `Report.Tests.ps1` (Pester v5, dot-source in `BeforeAll` like the existing
file does at `:1`) asserts two things about that evidence file: at least one line matching `^MSI \(s\)`
and at least one line matching `HKLM\\SOFTWARE\\Classes\\Installer\\Components`. Removing the hive dump
instead must produce
`residue-diagnosis.md names a mechanism with no Installer\Components hive dump behind it`.

**Then restore the log lines and re-run; the test must be green.**

### ROLLBACK

Delete the script, the evidence file, the pointer and the Pester block. Nothing shipped.

### EXIT

`Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md` exists, names **exactly one**
mechanism, and contains the verbatim msiexec log line and the before/after `Components` hive dump that
select it. Verify with:
```
pwsh -NoProfile -Command "Invoke-Pester -Path ./windows-installer/e2e-tests/tests/Report.Tests.ps1 -Output Detailed"
```
**No task after this one may be implemented until this file exists.**

---

## Task 2: Give the existing residue probe a machine-payload stage

**Files:**
- `Installers/internal/uninstall/residue_probe_windows.go` (add stage + seam)
- `Installers/internal/uninstall/residue_probe_windows_test.go` (new cases)
- `Installers/internal/uninstall/residue_probe_other.go` (**unchanged** — still returns nil)
- `Installers/cmd/devoid/uninstall_command.go` (`residueStages`, `:481-495`)
- `Installers/.github/workflows/pr-checks.yml` (add `./internal/uninstall/...` to the `windows-latest` job)

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:internal/uninstall/residue_probe_windows.go | sed -n '18,33p'
# EXPECT the residueProbeSeams struct with EXACTLY five fields:
#   machinePath, hklmSoftwareKeyExists, scheduledTaskExists, configResidue, codexMachineResidue
# A sixth field means someone already added a stage: STOP AND REPORT.

MSYS_NO_PATHCONV=1 git show origin/main:internal/uninstall/residue_probe_windows.go | sed -n '164,172p'
# EXPECT realResidueSeams() wiring those same five.

MSYS_NO_PATHCONV=1 git show origin/main:internal/uninstall/residue_probe.go | sed -n '3,8p'
# EXPECT the "carries NO secrets — never a token, credential, agent id, or command payload"
# contract. That sentence is the constraint on what your new stage may put in Detail.

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/uninstall_command.go | sed -n '427p'
# EXPECT: 	if residue := uninstall.ProbeWindowsResidue(); len(residue) > 0 {

MSYS_NO_PATHCONV=1 git grep -n 'internal/uninstall' origin/main -- .github/workflows/pr-checks.yml
# EXPECT: no matches. This package is tested in no PR lane. See L-CI.
```

Task 1's `residue-diagnosis.md` must exist before this task is *reported complete* (its residue shape
is what the new test's fixture reproduces), but the stage itself does not depend on which hypothesis
won — it observes, it does not repair.

### BLAST RADIUS

The probe currently gates `cleanupVerified` on the **remote** uninstall path only
(`uninstall_command.go:427`). A new stage that fires spuriously makes a *successful* console-initiated
uninstall report `failed + retryable` and keeps the endpoint enrolled — an operator-visible false
alarm, and a fleet whose endpoint count does not go down. That is the whole blast radius: no removal is
blocked, no file is deleted, no install path changes. The stage must therefore tolerate exactly what
Windows genuinely cannot delete.

### LANDMINES

- **L-CI.** `./internal/uninstall/...` is in **no** `go test` step in `pr-checks.yml`, and
  `residue_probe_windows_test.go` is `//go:build windows`, so `internal-candidate.yml`'s ubuntu
  `go test ./...` runs zero of it. Your four new tests are inert until you add the package to the
  `windows-latest` job at `pr-checks.yml:318-351`.
- **The probe runs as SYSTEM.** It must never enumerate a user profile. `internal/daemon/user_ai_wire_task.go:3-32`
  states the RA-3 boundary: a SYSTEM process may create and repair a machine-scope *task*, but may never
  read or write anything under a user home.
- **`Detail` carries no secrets.** `residue_probe.go:3-8`. A count and a byte total are fine; a file
  path list that could contain a user name is not — report names only from the machine bin directory,
  never contents, never a path outside it.
- **`%ProgramData%\devoid.premigration` is a SIBLING of the machine root**
  (`cmd/devoid-msi-root-guard/migrate_windows.go:47`, `:110` — `root + premigrationSuffix`). If you
  enumerate it, use `<programData>\devoid.premigration`, **not** `<machineRoot>\.premigration`, which
  does not exist and would additionally be an unknown root entry if anything ever created it.
- **Do not create anything under the machine root.** The probe is read-only; a scratch file there arms
  the 1722 brick (`guard_windows.go:1086`).

### DO NOT

- **Do not change `residue_probe_other.go`.** It must keep returning `nil` on non-Windows.
- **Do not widen the stage to a user profile**, not even "to be thorough".
- **Do not make the stage block or perform a removal.** It reports.
- **Do not delete or relax the existing pending-reboot carve-out** at `residue_probe_windows.go:131-133`.

### Steps

- [ ] Write `TestProbeReportsSurvivingMachinePayload` **first**, with the injected seam returning the
      exact 2026-08-27 shape — 41 files under `<machineRoot>\bin` including `claude.exe`, `codex.exe`,
      `npm.exe` — and assert one `ResidueItem{Stage: "machine-payload"}`. It must be RED: no such stage
      exists.
- [ ] Add `machinePayloadResidue func() []string` to `residueProbeSeams`
      (`residue_probe_windows.go:18-33`), wired in `realResidueSeams` (`:164-172`) to a new
      `machineBinResidue()` that enumerates `%ProgramData%\devoid\bin` and
      `%ProgramData%\devoid.premigration` — **names only, never contents**, matching the file's
      existing "carries NO secrets" contract (`residue_probe.go:3-8`).
- [ ] Add the stage between `config` (`:134-141`) and `codex-machine` (`:154-158`), reporting **one row
      carrying the file count and total bytes**, e.g. `"41 executable/script files (424 MB) remain in
      the DeVoid machine bin directory"`. A count and a size are what make the row actionable and what
      let the E2E harness in Task 8 assert a number.
- [ ] **Tolerate the one thing Windows cannot do.** Write `TestProbeToleratesPendingRebootDeleteBinary`
      before the tolerance code: a bin directory holding **only** files listed in
      `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations` must return
      **no** `machine-payload` row. This mirrors the existing, deliberate carve-out at
      `residue_probe_windows.go:131-133`. Read the real value through a seam so the test needs no
      registry.
- [ ] Add `TestProbeCountsOnlyMachineBinNotUserState` so the stage can never be widened into a user
      profile — the probe runs as SYSTEM and must stay on the machine boundary (RA-3,
      `internal/daemon/user_ai_wire_task.go:3-32`).
- [ ] Extend `residueStages` (`uninstall_command.go:481-495`) so `machine-payload` appears in the
      operator message, and assert the message text in `cmd/devoid/uninstall_command_test.go`.
- [ ] Add `run: go test ./internal/uninstall/... -count=1` as a step in the `windows-latest` job at
      `pr-checks.yml:318-351`. Record that the leg was not executed here and paste the local Windows
      output.

### DEFEAT TEST

**Mutation:** delete the `machinePayloadResidue` block from `probeWindowsResidueWith` in
`internal/uninstall/residue_probe_windows.go`.

**Command (on a Windows box, from the worktree):**
```
go test ./internal/uninstall/ -run TestProbeReportsSurvivingMachinePayload -count=1
```

**Must appear in the output:**
```
want 1 machine-payload residue item, got 0 — a 41-file bin directory would be reported as a clean uninstall
```

**Then restore the block and re-run; the test must be green.**

### ROLLBACK

Delete the stage's block and its seam field; the other six stages are untouched. One commit, one file
(plus the `pr-checks.yml` step and the `residueStages` string).

### EXIT

```
go test ./internal/uninstall/... ./cmd/devoid/... -count=1
```
green on Windows with **4 new tests**, and `ProbeWindowsResidue()` returns a non-empty result on a
machine whose `bin` holds ≥1 non-pending-delete file. Verify the last part on the VM with
`devoid uninstall --deregister-only`-adjacent tooling or a direct unit fixture; state which.
`git grep -n 'internal/uninstall' .github/workflows/pr-checks.yml` returns the new step.

---

## Task 3: Make an incomplete removal impossible to report as a clean one — without ever blocking removal

**Files:**
- `Installers/cmd/devoid-msi-root-guard/main_windows.go` (new verb — **two edits: the argv validator at
  `:18` and the switch at `:33-70`**)
- `Installers/cmd/devoid-msi-root-guard/teardown_windows.go` (verb implementation)
- `Installers/windows-installer/msi-build/CustomActions.wxs` (one `<CustomAction>` + one sequence row)
- `Installers/windows-installer/msi-build/customactions_contract_test.go` (new contract test)
- `Installers/cmd/devoid/uninstall_command.go` (`runUninstall`, `:627`)
- `Installers/.github/workflows/pr-checks.yml` (add `./windows-installer/msi-build/...`)

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/main_windows.go | sed -n '18p'
# EXPECT one long line listing NINE verbs: guard, guard-postremove, verify, verify-uninstall,
# finalize-uninstall, teardown-machine-state, quiesce-runtime, rollback-migration, finalize-migration.
# A tenth verb added to the switch at :33 and NOT to this line exits 1 with usage before the
# switch is ever reached. Both edits, same commit.

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid-msi-root-guard/main_windows.go | sed -n '117p'
# EXPECT: func appendGuardFailureLog(programData, verb string, cause error, trustedOwners []*windows.SID) {
# Its security notes are at :91-116 and its implementation runs to :173.

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/CustomActions.wxs | sed -n '81,86p'
# EXPECT CA_FinalizeMachineRootUninstall: BinaryRef="DevoidMsiRootGuard",
# ExeCommand="finalize-uninstall", Execute="commit", Impersonate="no", Return="check"

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/CustomActions.wxs | sed -n '665p'
# EXPECT: <Custom Action="CA_FinalizeMachineRootUninstall" After="RemoveFolders" Condition='REMOVE~="ALL" AND NOT UPGRADINGPRODUCTCODE' />

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/customactions_contract_test.go | sed -n '9,12p'
# EXPECT TestRemoveGitHooksUsesSharedDevoidHookSweep reading CustomActions.wxs with
# os.ReadFile("CustomActions.wxs") — package msibuild, NO build tag, so it runs on any OS.
```

Task 1's diagnosis must exist. This task ships in a release **before** Task 4 (see the ordering
constraint at the end of this wave).

### BLAST RADIUS

This is the task most able to break the product, and the constraint is absolute: **the new custom
action must be `Return="ignore"`, scheduled after `CA_FinalizeMachineRootUninstall`, and must never
change msiexec's exit code.** A fail-closed uninstall checkpoint on a condition we cannot yet prove is
precisely the July 2026 shape — a machine that will not uninstall gets the agent removed by force and
the operator never installs it again. `Product.wxs:366-372` already records a `RemoveFolder` at this
point failing an uninstall with 1603. The blast radius when done right is one extra ~50 ms SYSTEM
process per uninstall and one small file written under `%ProgramData%\devoid\evidence`; when done wrong
it is a fleet that cannot be uninstalled.

### LANDMINES

- **A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026
  and the operator uninstalled the agent.** "Residue remains" is exactly such a condition: a locked
  file, a pending-reboot delete, an AV handle. This CA therefore **records** and always exits 0. There
  is no variant of this task that aborts a transaction.
- **`main_windows.go:18` and `main_windows.go:33` are two separate lists.** Adding the verb to only the
  switch makes the guard exit 1 with usage for that verb — and because the CA is `Return="ignore"`
  nobody notices, so the evidence file is silently never written. Inert by construction. Edit both.
- **Reuse `appendGuardFailureLog`'s write primitive (`main_windows.go:117-173`), do not write a second
  one.** Its comment block at `:91-116` explains why: this code runs as SYSTEM on a path an attacker may
  control, and the primitive is no-reparse, hard-link-checked and trusted-owner-validated, with
  `validatedTrustedDir` (`:179-187`) refusing to create or traverse anything. A simpler
  `os.WriteFile` here is a SYSTEM-writes-to-attacker-controlled-path LPE.
- **`evidence` is already a managed boundary child** (`boundaryChildNames`, `guard_windows.go:624-629`)
  and its read grant is deliberately read-only-no-traverse (`boundaryChildRead`, `:634-640`). Writing
  `uninstall-residue.json` **inside** `evidence\` needs no allowlist change. Writing it anywhere else
  under the machine root **does** — see the machine-root landmine in Task 6, and do not do it.
- **Do not touch `CA_FinalizeMachineRootUninstall`'s `Return="check"`.** It is the finalizer.

### DO NOT

- **Do not use `Return="check"` on the new CA.** Not "temporarily", not "to see the failure".
- **Do not sequence it before `RemoveFolders`.** It must observe the end state.
- **Do not change the CLI's exit code in this task.** Printing the residue stages is the whole change;
  an exit-code change belongs to a later, separately-reviewed decision.
- **Do not add a `<RemoveFolder>` for `BINDIR`.** `Product.wxs:366-372` records that failing an
  uninstall with 1603.
- **Do not weaken `validateRegularFileHandle` / `validatedTrustedDir` to make the write succeed.** If
  the guard refuses to write, the correct behaviour is to write nothing and exit 0.

### Steps

- [ ] Write `TestUninstallResidueCAIsAdvisoryAndLast` in
      `Installers/windows-installer/msi-build/customactions_contract_test.go` **first** (same package
      `msibuild`, same `os.ReadFile("CustomActions.wxs")` shape as `:10`): parse `CustomActions.wxs` and
      assert the new CA has `Return="ignore"`, `Execute="commit"`, is sequenced
      `After="CA_FinalizeMachineRootUninstall"`, and is conditioned
      `REMOVE~="ALL" AND NOT UPGRADINGPRODUCTCODE` (the house condition every uninstall CA uses,
      `:643-665`). RED — the CA does not exist.
- [ ] Add verb `record-uninstall-residue` to **both** the argv validator (`main_windows.go:18`) and the
      switch (`:33-70`), and implement it in `teardown_windows.go`: enumerate `BINDIR`, subtract
      `PendingFileRenameOperations`, and append one JSON line to
      `%ProgramData%\devoid\evidence\uninstall-residue.json` —
      `{ts, filesRemaining, bytesRemaining, names[], productCode}`. Reuse the guard's existing
      no-reparse, hard-link-checked, trusted-owner-validated write primitive from
      `appendGuardFailureLog` (`main_windows.go:117-173`); **do not write a second, weaker one.**
- [ ] Add the `<CustomAction Id="CA_RecordUninstallResidue" BinaryRef="DevoidMsiRootGuard"
      ExeCommand="record-uninstall-residue" Execute="commit" Impersonate="no" Return="ignore" />`
      definition beside `CA_FinalizeMachineRootUninstall` (`CustomActions.wxs:81-86`), and one sequence
      row after `:665`.
- [ ] Always `os.Exit(0)`. Add `TestRecordUninstallResidueAlwaysExitsZero` covering: bin absent, bin
      unreadable, evidence dir absent, disk full (injected error), untrusted-owner root (the primitive
      refuses — still exit 0).
- [ ] In the CLI path, call `uninstall.ProbeWindowsResidue()` at the end of `runUninstall`
      (`uninstall_command.go:627`) and **print** the stages via the existing `residueStages`
      (`:481-495`). Do not change the CLI's exit code — printing is enough to stop a human reporting a
      clean uninstall that was not one, and it cannot brick anything.
- [ ] Add `TestCLIUninstallPrintsResidueStages` asserting the printed text names `machine-payload` when
      the probe returns it.
- [ ] Add `run: go test ./windows-installer/msi-build/... -count=1` to a `pr-checks.yml` job. This
      package has **no build tag**, so it may go in an ubuntu job; the guard verb tests are
      `//go:build windows` and go in the `windows-latest` job at `:318-351`.

### DEFEAT TEST

**Mutation:** in `windows-installer/msi-build/CustomActions.wxs`, change the new CA's attribute from
`Return="ignore"` to `Return="check"`.

**Command (from the worktree root, any OS):**
```
go test ./windows-installer/msi-build/ -run TestUninstallResidueCAIsAdvisoryAndLast -count=1
```

**Must appear in the output:**
```
CA_RecordUninstallResidue must be Return="ignore": a transaction-aborting uninstall check bricks removal, and an uninstalled control protects nobody
```

**Then restore `Return="ignore"` and re-run; the test must be green.**

### ROLLBACK

Remove the single `<Custom Action="CA_RecordUninstallResidue" …>` row from `CustomActions.wxs`'s
`InstallExecuteSequence` and rebuild. The verb can stay in the binary unused; it is inert without the
sequence row.

### EXIT

`%ProgramData%\devoid\evidence\uninstall-residue.json` is produced by a real MSI uninstall on the VM,
contains `filesRemaining`, and the uninstall's exit code is byte-identical to the exit code before the
change. Verify on the same VM snapshot, both ways:
```powershell
$p = Start-Process msiexec -ArgumentList '/x','{ProductCode}','/qn','/norestart' -Wait -PassThru
$p.ExitCode   # EXPECT 0 before the change and 0 after
Get-Content C:\ProgramData\devoid\evidence\uninstall-residue.json | Select-Object -Last 1
```

---

## Task 4: Apply the repair the diagnosis selected — one pre-specified branch, no others

**Gate:** This task **must not start** before
`Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md` (Task 1) exists. Implement the
branch that file names, and only that branch. **RECONCILIATION §3 item 11 and §4 R6 both make this gate
absolute, including under schedule pressure.** The sweep is only safe if H1 is the real mechanism.

**Files (by branch):**
- **H1 — orphaned component clients:** `Installers/install-scripts/production/uninstall.ps1`
  (`Remove-DevoidInstallerRegistrationByProductCode`, `:468-513`);
  `Installers/internal/uninstall/windows_installer_windows.go`
  (`windowsInstallerResidueCleanupScript`, `:303`); new
  `Installers/internal/uninstall/msi_component_clients_windows.go`.
- **H2 — feature deselected:** `Installers/windows-installer/msi-build/Product.wxs:590` (add
  `AND NOT Installed` to the `<Level Value="0" …>` condition so it can never re-evaluate during
  removal).
- **H3 — re-created after removal:** `Installers/windows-installer/msi-build/CustomActions.wxs`
  (`CA_KillProcesses`, definition `:497-507`, sequence row `:643`) plus the surviving writer the
  diagnosis names.
- **H6 — deletion failed:** `Installers/internal/security/shim_hardening.go:99-132` (the
  `hardenShimDirectoryWindows` `icacls /inheritance:r` passes at `:104-110` and `:118-126`) plus a
  `CA_QuiesceRuntimeForUpgrade`-style unlock before `RemoveFiles` (the existing CA is defined at
  `CustomActions.wxs:145` and sequenced at `:590`).

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

test -f windows-installer/e2e-tests/evidence/residue-diagnosis.md && echo GATE-OPEN || echo GATE-CLOSED
# EXPECT: GATE-OPEN. GATE-CLOSED → STOP. Do not begin, do not "start on the likely branch".

grep -c '^MSI (s)' windows-installer/e2e-tests/evidence/residue-diagnosis.md
# EXPECT: >= 1

grep -iE 'mechanism: (H1|H2|H3|H4|H6)' windows-installer/e2e-tests/evidence/residue-diagnosis.md
# EXPECT exactly ONE line. Zero or two → the diagnosis did not select a branch: STOP AND REPORT.

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/Product.wxs | grep -o 'Guid="[^"]*"' | sort -u | wc -l
# EXPECT: 65   (all component GUIDs explicit and unique — the H1 allowlist is generated from these)
```

Task 3 must already be **in a shipped release** before this one ships (see the ordering constraint).

### BLAST RADIUS (H1, the leading branch)

Deleting the wrong key under `HKLM\SOFTWARE\Classes\Installer\Components` corrupts **other vendors'**
installed products — a machine-wide, non-obvious, support-call-generating failure that shows up weeks
later as somebody else's repair loop. This is the single most dangerous edit in the wave. It is only
acceptable under three constraints, all of which are testable and all of which RECONCILIATION §4 R6
confirms:

1. the packed component GUIDs are compared against a **literal allowlist generated from `Product.wxs`**,
   never a wildcard, never a prefix, never a name match;
2. only the **value** whose name is one of *our* packed ProductCodes is deleted — never the key, never
   another vendor's value;
3. if a component key would be left with zero values, **the key is left in place**. MSI tolerates an
   empty key; deleting keys is where this goes wrong.

### LANDMINES

- **The `.reg` export gate is absolute.** Export `HKLM\SOFTWARE\Classes\Installer\Components` to a
  `.reg` file **before** any deletion and **fail the sweep closed (do nothing) if the export cannot be
  written.** Refusing to sweep is always safe; sweeping without a backup is not. Ship the export as part
  of the change, not as an operator instruction.
- **Two force-strip paths exist and they have already diverged** — that divergence is *why* the orphan
  exists. `uninstall.ps1:468-513` deletes `Products`/`Features`/`UserData\…\Products`;
  `windows_installer_windows.go:303` enumerates only the three `…\CurrentVersion\Uninstall` roots
  (`:315-317`). Both must call the **same** sweep. Fixing one is how this defect gets reintroduced.
- **The evidence backup goes in `%ProgramData%\devoid\evidence\`**, an existing allowlisted boundary
  child. Anywhere else under the machine root arms the 1722 brick.
- **`uninstall.ps1`'s recovery path is entered automatically, with no operator flag** (`:1498-1505`),
  whenever an installer-registered machine has no payload. So this sweep runs on machines nobody chose
  to run it on. Behave accordingly.
- **`Product.wxs` declares no `ProductCode`**, so WiX v4 mints a new one per build while the 65
  component GUIDs stay fixed. Your allowlist is over **component** GUIDs; the values you delete are
  packed **ProductCodes**. Do not confuse the two — deleting by component GUID would remove the key.
- **Do not run this against the owner's box.** Probe 4 and the regression run are VM-only.

### DO NOT

- **Do not implement more than one branch.** If the diagnosis is ambiguous, stop.
- **Do not match packed GUIDs by prefix, suffix, `-like`, or regex.** Exact set membership only.
- **Do not delete a registry key.** Values only.
- **Do not proceed when the `.reg` export fails.** Fail closed; that is the design.
- **Do not "clean up" foreign orphans you notice while in the hive.** Not our machine to tidy.

### Steps

- [ ] Write `TestComponentClientSweepTouchesOnlyDevoidGuids` **first**: feed a synthetic hive containing
      the 65 DeVoid packed GUIDs **and** three foreign ones, and assert the foreign three are
      byte-identical afterwards. RED before the sweep exists.
- [ ] Write `TestComponentGuidAllowlistMatchesProductWxs`: parse `Product.wxs`, extract every
      `Component/@Guid`, assert the count is **65** and that the Go allowlist is exactly that set. This
      is the pin that stops the allowlist drifting into a wildcard the first time someone adds a
      component.
- [ ] Write `TestSweepDeletesValuesNotKeys`: assert a component key that ends with zero values still
      exists.
- [ ] Write `TestSweepRefusesWithoutRegBackup`: with the export path unwritable (injected error), assert
      the sweep deletes **nothing** and returns an error naming the missing backup.
- [ ] Implement the sweep; call it from **both** force-strip paths (`uninstall.ps1:468` and
      `windows_installer_windows.go:272`) so the two cannot diverge.
- [ ] Write the `.reg` export before any deletion, into
      `%ProgramData%\devoid\evidence\installer-components-backup.reg`, and fail the sweep closed if the
      export cannot be written.
- [ ] Re-run Task 1's Probe 4 sequence on a fresh VM snapshot and assert the residue does not appear.

### DEFEAT TEST

**Mutation:** in `internal/uninstall/msi_component_clients_windows.go`, replace the allowlist set
lookup with a prefix match on the packed-GUID string (e.g. `strings.HasPrefix(name, ourPrefix)`).

**Command (on a Windows box, from the worktree):**
```
go test ./internal/uninstall/ -run TestComponentClientSweepTouchesOnlyDevoidGuids -count=1
```

**Must appear in the output:**
```
foreign component {...} was modified: the sweep must match the 65 Product.wxs GUIDs exactly, never by prefix
```

**Then restore the set lookup and re-run; the test must be green.**

### ROLLBACK

The shipped rollback is the `.reg` export written beside the evidence record: restoring it is a single
`reg import C:\ProgramData\devoid\evidence\installer-components-backup.reg`. The code rollback is
reverting the sweep and both call sites.

### EXIT

On the clean VM, the Probe 4 sequence (install → `uninstall.ps1 -Recover` force-strip → install →
`msiexec /x`) leaves **0 files** in `%ProgramData%\devoid\bin`, measured by the same script that
measured 41:
```powershell
(Get-ChildItem C:\ProgramData\devoid\bin -File -ErrorAction SilentlyContinue).Count
# EXPECT: 0
```
and `installer-components-backup.reg` exists with a non-zero length.

---

## Task 5: Report the post-install ungoverned window instead of hiding it — and prove the first launch closes it

**Phase 1**, not Phase 5. Strategy §11 Phase 1: "no one-minute unwired state".

> **Cross-reference — RECONCILIATION §1 C4.** Wave 2 Task 6 originally wrote a **new** stamp,
> `<machineRoot>\sessions\<userSID>\broker-ready`. **This wave's rule wins and Wave 2 is adopting it:**
> implement readiness off the **existing** durable reconcile stamp; **do not invent a second stamp**;
> two stamps is how this codebase grows a false green. Wave 2 Task 6's per-session broker updates that
> same stamp, and Wave 2 Task 6b's refusal condition 3 reads that same stamp. Wave 2's mechanism wins on
> the *closure* (a SYSTEM-driven per-session launch actually closes the window; a readiness state only
> names it); this task's rule wins on the *stamp*. Adopting it also deletes half of the R1 machine-root
> brick, because `broker-ready` no longer needs a `sessions` directory.

**Files:**
- `Installers/cmd/devoid/ai_wire_retry.go` (**read-only** — the stamp's owner)
- `Installers/internal/aiwiretask/aiwiretask.go` (**read-only** — the `PT1M` delay does not change)
- `Installers/cmd/devoid/main.go` (agent shim entry, `:4860`) and
  `Installers/cmd/devoid/agent_shim.go` (`:496`)
- `Installers/internal/daemon/server.go` (posture/readiness surface — **`/v1/health/detail`, not `/health`**)
- `Installers/windows-installer/msi-build/CustomActions.wxs` (`CA_RunDoctor`, definition `:529-539`,
  sequence row `:636`)

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/ai_wire_retry.go | sed -n '60p;65p;68p'
# EXPECT:
#   const aiWireRetryInterval = 15 * time.Minute
#   const aiWireRetryStampName = "aiwire-last-reconcile"
#   const devoidUserDirName = ".devoid"
# THIS IS THE STAMP. There is exactly one. If a second durable reconcile stamp has appeared,
# STOP AND REPORT — C4 was decided on there being one.

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/ai_wire_retry.go | sed -n '80,86p'
# EXPECT aiWireRetryDue returning TRUE on os.Stat error — absent stamp is DUE.

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/ai_wire_retry_test.go | grep -n '^func TestAIWireRetryDue_AbsentStampIsDue'
# EXPECT: 26:func TestAIWireRetryDue_AbsentStampIsDue(t *testing.T) {
# This test ALREADY EXISTS. Do not write a duplicate. See the step below.

MSYS_NO_PATHCONV=1 git show origin/main:internal/daemon/server.go | sed -n '1310,1318p'
# EXPECT the healthLivenessKeys comment ("closed list on purpose") and
#   var healthLivenessKeys = []string{"status", "daemon", "version", "wireProxy", "uptime"}
# pinned by TestHealthOpenBody_ExactlyLivenessKeys (internal/daemon/health_split_test.go:46).
# The place posture detail belongs is handleHealthDetail (server.go:1388).

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/msi-build/CustomActions.wxs | sed -n '636p'
# EXPECT: <Custom Action="CA_RunDoctor" After="CA_PatchPowerShellProfile" Condition='REINSTALL AND NOT REMOVE~="ALL"' />
```

### BLAST RADIUS

A readiness state that is wrong in the *pessimistic* direction makes a correctly installed endpoint
report `INSTALLED_NOT_READY` forever, and the console shows a fleet that looks broken. A readiness state
that is wrong in the *optimistic* direction is the status quo and is what we are fixing. Nothing here
blocks a launch, so no developer is stopped by it.

### LANDMINES

- **The stamp is PER-USER and lives under the user's home** — `<userHome>\.devoid\aiwire-last-reconcile`
  (`ai_wire_retry.go:71-73`). The daemon runs as **SYSTEM** on a machine install and **may not read
  another user's home**: `internal/daemon/user_ai_wire_task.go:3-32` states that boundary in the
  file's own words ("this pass may create and repair the TASK. It may never read or write anything
  under a user home."). So: `devoid status` and the shim compute readiness in the **user's** context;
  the daemon may report only a **machine-scope** readiness (task registered, daemon healthy) and must
  never stat a user profile to answer it. A design that has SYSTEM read the stamp is an RA-3 violation
  and will be rejected.
- **Do not add a key to the open `/health` body.** `healthLivenessKeys` (`server.go:1318`) is an
  **exact closed key set** pinned by `TestHealthOpenBody_ExactlyLivenessKeys`, and its comment says
  why: every key there is readable by any local process. Posture detail belongs on
  `GET /v1/health/detail` (`handleHealthDetail`). Adding a readiness key to `/health` turns that pin red
  — **do not delete or relax the pin to make room.** If a guard blocks the task, the task is wrong.
- **Do not invent a second stamp.** RECONCILIATION C4. Wave 2 Task 6 and Task 6b now read the one that
  exists.
- **Do not shorten `LogonDelay` (`aiwiretask.go:178`).** The comment at `:172-178` records the measured
  race it exists to remove: the logon storm, and the SYSTEM daemon binding its loopback wire proxy.
  Task 5 makes the window *visible*; it does not trade a known race for a shorter gap.
- **Changing `CA_RunDoctor`'s condition changes when it runs on every install.** It is `Return="ignore"`
  (`CustomActions.wxs:534-539`) and must stay that way — it runs `"[BINDIR]devoid.exe" doctor --quiet`
  (`:532`), and a doctor that can fail an install is a brick.

### DO NOT

- **Do not create a new stamp file, of any name, in any scope.**
- **Do not write a machine-root file for readiness.** That arms the 1722 brick.
- **Do not weaken or delete `TestHealthOpenBody_ExactlyLivenessKeys`.**
- **Do not have the SYSTEM daemon stat a user home.**
- **Do not duplicate `TestAIWireRetryDue_AbsentStampIsDue`** — it exists at
  `cmd/devoid/ai_wire_retry_test.go:26`.
- **Do not make readiness gate, block, delay or refuse anything.** It reports.

### Steps

- [ ] Write `TestReadinessIsNotReadyBeforeFirstReconcileStamp` **first**: with no durable reconcile
      stamp present at `<userHome>\.devoid\aiwire-last-reconcile`, the readiness computation must return
      `INSTALLED_NOT_READY` with reason `ai-lane-not-yet-wired`. RED — no such state exists today.
- [ ] Write `TestReadinessBecomesReadyAfterStamp`: with a stamp whose mtime is newer than the install
      time, readiness is `READY`.
- [ ] Implement readiness off the **existing** durable reconcile stamp — the one
      `aiWireRetryStampPath` (`ai_wire_retry.go:71-73`) already builds and `aiWireRetryDue` (`:80-86`)
      already reads. **Do not invent a second stamp; two stamps is how this codebase grows a false
      green.** Wave 2 Task 6 updates this same stamp from the per-session broker; Wave 2 Task 6b reads
      it as its refusal condition 3.
- [ ] Surface it: `devoid status` and the daemon's **`/v1/health/detail`** payload report
      `INSTALLED_NOT_READY` until the first reconcile completes. Add `TestStatusPrintsNotReadyReason`.
      The daemon's machine-scope answer must not depend on any user home; if it cannot know, it says
      `unknown` with a reason, never `READY`.
- [ ] **Pin, do not re-fix, the first-launch behaviour.** `aiWireRetryDue` already treats an absent
      stamp as DUE and `TestAIWireRetryDue_AbsentStampIsDue` (`ai_wire_retry_test.go:26`) already covers
      it. Add instead `TestFirstShimLaunchReconcilesWithNoStamp` at the **call-site** level: assert that
      `maybeReconcileAIWireUserContext` — reached from `agent_shim.go:496` and `main.go:4860` — actually
      performs a reconcile on a fresh home with no stamp, rather than only that the predicate returns
      true. That is the half that is not yet pinned. If the existing predicate test is missing or
      changed, STOP AND REPORT rather than rewriting it.
- [ ] Make `CA_RunDoctor` run on **fresh install** as well as repair (currently
      `REINSTALL AND NOT REMOVE~="ALL"`, `CustomActions.wxs:636`) and keep `Return="ignore"`
      (`:534-539`) so it still cannot fail an install. Its value is that it writes the readiness state
      at install time, so the window is *recorded* from minute zero.

### DEFEAT TEST

**Mutation:** in the readiness computation, return `READY` when the stamp is absent (invert the
absent-stamp branch).

**Command (on a Windows box, from the worktree):**
```
go test ./cmd/devoid/ -run TestReadinessIsNotReadyBeforeFirstReconcileStamp -count=1
```

**Must appear in the output:**
```
readiness reported READY with no reconcile stamp: the endpoint has no hooks and no asserted route for the first minute and must not claim otherwise
```

**Then restore the branch and re-run; the test must be green.** Also re-run
`go test ./internal/daemon/ -run TestHealthOpenBody_ExactlyLivenessKeys -count=1` and confirm it is
still green — if it is red, you added a key to `/health` and must move it to `/v1/health/detail`.

### ROLLBACK

The readiness field is additive; remove the field and the surface reverts to today's behaviour. The
shim change is one early-return removal. The `CA_RunDoctor` condition is one attribute.

### EXIT

On the VM, `devoid status` within 30 s of a fresh MSI install prints `INSTALLED_NOT_READY`, and prints
`READY` after the first reconcile — **two observations, timestamped**, recorded in
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w7/post-install-window.md`. Verify:
```powershell
"$(Get-Date -Format o)  $(& 'C:\ProgramData\devoid\bin\devoid.exe' status | Select-String 'READY')"
```
run twice, and both lines pasted into the evidence file.

---

## Task 7: Prove an upgrade still enforces, and recover forward when it does not

**Files:**
- `Installers/cmd/devoid/upgrade_msi_apply_windows.go:63-135`
- `Installers/cmd/devoid/upgrade_postcondition_test.go` (exists, **no build tag** — extend)
- `Installers/cmd/devoid/upgrade_msi_apply_windows_test.go` (exists, `//go:build windows` — extend)

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/upgrade_msi_apply_windows.go | sed -n '103p;113p;127p;130,131p'
# EXPECT, in order:
#   if pErr := release.PersistAcceptedRelease(manifest); pErr != nil {
#   exitCode, runErr := runManagedMsiInstall(msiPath, logPath)
#   if vErr := verifyManagedInstallVersion(info.LatestVersion); vErr != nil {
#   _ = os.Remove(msiPath)
#   _ = os.Remove(logPath)

MSYS_NO_PATHCONV=1 git show origin/main:cmd/devoid/upgrade_msi_apply_windows.go | sed -n '259,261p'
# EXPECT: return []string{"/i", msiPath, "ENROLLMENT_MODE=deferred", "/qn", "/norestart"}

MSYS_NO_PATHCONV=1 git grep -n 'cmd/devoid' origin/main -- .github/workflows/pr-checks.yml | head -3
# EXPECT a hit around :351 — `go test ./cmd/devoid/... -count=1 -timeout 25m` in the
# windows-latest job. This package IS covered; you do not need a new CI leg for this task.
```

### BLAST RADIUS

A canary that is wrong in the failing direction turns a *successful* upgrade into a reported failure
and — if it triggered a remediation — could remove a working generation. The canary in this task
therefore **reports and re-runs; it never uninstalls, never downgrades, and never touches the
anti-rollback floor.** The strongest thing it may do is refuse to report success and leave the endpoint
running the version it just installed, which is the same generation msiexec already committed.

### LANDMINES

- **The anti-rollback floor is advanced BEFORE the transaction** (`upgrade_msi_apply_windows.go:103`)
  and `release.PersistAcceptedRelease` is forward-only by construction. A failing canary must leave it
  exactly where it is. Lowering it to "recover" is weakening an existing guard to fit a task.
- **The canary must not be a second implementation of Wave 8's canary.** Two canary surfaces are how two
  green lights start disagreeing. Reuse the existing local canary surface. If it is not yet callable
  in-process, ship the **E1 subset** and say so in the code comment: the new `devoid.exe` starts,
  reports the target version, and its daemon answers `/health` within the existing budget. That is a
  liveness canary, not a semantic one — label it honestly.
- **A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July 2026
  and the operator uninstalled the agent.** The canary's failure path must therefore leave the endpoint
  *running*, on the version msiexec just committed, with an evidence record — never blocked, never
  rolled back, never uninstalled.
- **Nothing in this task widens an agent↔backend contract**, so the Backend-before-agent rule is not
  triggered here. If you find yourself adding a field to a heartbeat or ingest payload, stop: that is a
  different task with a deploy-ordering constraint (see the wave ordering note).
- **`%ProgramData%\devoid\evidence\` is an allowlisted boundary child** (`guard_windows.go:624-629`).
  `upgrade.json` goes there. Anywhere else under the machine root arms the 1722 brick.

### DO NOT

- **Do not lower, reset or bypass the anti-rollback floor.**
- **Do not add a downgrade path.** Recovery from a bad build is forward.
- **Do not delete the MSI or the verbose log on a canary failure** — that is the evidence.
- **Do not make the canary block the upgrade transaction.** It runs after `verifyManagedInstallVersion`.
- **Do not widen the Authenticode or SHA-256 pins** to make a test build pass.

### Steps

- [ ] Write `TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot` **first**, with the canary seam
      injected to fail: `applyManagedMsiUpgradeIfNeeded` must return an error naming the canary. RED —
      no canary is called.
- [ ] Write `TestManagedUpgradeRetainsLogWhenCanaryFails`: on canary failure the verbose MSI log and the
      downloaded MSI must **not** be deleted (today both are removed unconditionally on a success exit,
      `:130-131`).
- [ ] Implement the post-apply canary as a **reuse** of the existing local canary surface, called once
      after `verifyManagedInstallVersion` (`:127-129`). If Wave 8's canary is not yet callable
      in-process, ship the **E1** subset described in the landmine above and state in the code comment
      that it is the E1 subset and not a semantic canary.
- [ ] Write `TestUpgradeEvidenceRecordWritten`: on every managed upgrade attempt, success or failure,
      append one record to `%ProgramData%\devoid\evidence\upgrade.json` —
      `{from, to, msiExit, versionVerified, canaryResult, ts}`. Today a successful upgrade deletes its
      own evidence.
- [ ] Add `TestAntiRollbackFloorIsNeverLoweredByCanaryFailure`, pinning the one thing this task must not
      do: `release.PersistAcceptedRelease` is called before the transaction (`:103`) and a failing
      canary must leave that floor exactly where it is.

### DEFEAT TEST

**Mutation:** delete the canary call from `applyManagedMsiUpgradeIfNeeded` in
`cmd/devoid/upgrade_msi_apply_windows.go` (the statement immediately after the
`verifyManagedInstallVersion` block at `:127-129`).

**Command (on a Windows box, from the worktree):**
```
go test ./cmd/devoid/ -run TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot -count=1
```

**Must appear in the output:**
```
upgrade reported success with a failing canary: a version number is not proof the new generation enforces
```

**Then restore the call and re-run; the test must be green.**

### ROLLBACK

The canary call is one statement after `verifyManagedInstallVersion`
(`upgrade_msi_apply_windows.go:127-129`); remove it and the upgrade path returns to today's
version-only proof. The evidence append is a second, independently removable statement.

### EXIT

`%ProgramData%\devoid\evidence\upgrade.json` holds **≥2 records** from the VM matrix — one successful
upgrade and one deliberately failed one (inject a canary failure) — and the failed record carries
`canaryResult:"fail"` with the MSI log path retained on disk. Verify:
```powershell
(Get-Content C:\ProgramData\devoid\evidence\upgrade.json | Measure-Object -Line).Lines   # EXPECT >= 2
Get-Content C:\ProgramData\devoid\evidence\upgrade.json | Select-String '"canaryResult":"fail"'
Test-Path (Get-Content C:\ProgramData\devoid\evidence\upgrade.json | ConvertFrom-Json | Select-Object -Last 1).msiLogPath  # EXPECT True
```

---

## Task 8: Run the lifecycle matrix that already exists

**Files:**
- `Installers/windows-installer/e2e-tests/run-silent-install-e2e.ps1` (add scenarios — **three edit
  sites**: the `[ValidateSet]` at `:4`, the `$order` map at `:22`, and `Get-ScenarioFlags` at `:23-28`)
- `Installers/windows-installer/e2e-tests/lib/Verify.ps1` (`Test-NoDevoidInstalled`, `:100-111`)
- `Installers/windows-installer/e2e-tests/tests/Report.Tests.ps1` (defeat test)
- `Installers/.github/workflows/release.yml` (`build-msi`, `:1043`, `runs-on: windows-latest` `:1046`)
  **or** a documented manual release gate — see the blast-radius note
- `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w7/lifecycle-matrix.md`

### PRECONDITIONS

```bash
cd C:/Users/Owner/Documents/Ceragon/Installers
git fetch origin main && git rev-parse origin/main
# EXPECT: 5b12952307db9903fa166d5d9ce1a0c058e0ad77   (mismatch → STOP AND REPORT)

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/e2e-tests/run-silent-install-e2e.ps1 | sed -n '4p'
# EXPECT: [ValidateSet('A','B','C','DEPS','HOOKS','PHASE2','DEFERTOKEN')][string[]]$Scenarios=@('A','B','C'),

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/e2e-tests/lib/Verify.ps1 | sed -n '6p'
# EXPECT the 19-element $script:DevoidShimTools list. This is the known-name list you are replacing.

MSYS_NO_PATHCONV=1 git show origin/main:windows-installer/e2e-tests/lib/Backend.ps1 | sed -n '4,9p'
# EXPECT `aws ecs describe-services --cluster backend --services backend-service` and
# `aws ecs update-service ... --desired-count`. THIS IS PRODUCTION. See L-PROD.

MSYS_NO_PATHCONV=1 git grep -n "run-silent-install-e2e" origin/main -- .github/
# EXPECT: no matches. The harness is referenced by no workflow.
```

**Environment:** the same disposable, snapshotted Windows 11 VM as Task 1, elevated, with no
pre-existing DeVoid install, plus an N-1 installer staged for the `UPGRADE` scenarios. Any one missing:
STOP AND REPORT.

### BLAST RADIUS

Adding a job to `release.yml` that cannot get a runner blocks releases — and the org's GitHub Actions
posture has already blocked this repo once (Free-plan spending limit, 2026-08-26). The harness also
**requires an elevated Windows session, installs and uninstalls the real product, and raises/lowers a
real ECS service**; a hosted `windows-latest` runner can do the first two and must never do the third.
So: run it with `-Token` against a disposable backend or with the backend steps skipped, on a runner
that is either self-hosted or explicitly provisioned. **If neither is available, this task lands as a
named manual release gate with a recorded artifact — not as a CI job that will be disabled the first
time it is inconvenient.** State which of the two shipped.

### LANDMINES

- **L-PROD — the harness touches production.** `lib/Backend.ps1:4-9` runs
  `aws ecs update-service --cluster backend --service backend-service --desired-count <n>` against the
  **real** production cluster, and `Get-ScenarioFlags` (`run-silent-install-e2e.ps1:23-28`) points every
  scenario at `BACKEND_URL='https://api.devoid.one'`. Running this harness unmodified scales
  production. **Do not run it without either `-KeepBackendUp` plus a verified non-zero desired count,
  or a redirected `BACKEND_URL`.** Deploying and scaling production needs a fresh, explicit ask from the
  owner every time; a green local run is not permission.
- **The three edit sites for a new scenario are separate.** Adding a name to the `[ValidateSet]` at `:4`
  without adding it to `$order` (`:22`) and `Get-ScenarioFlags` (`:23-28`) produces a scenario that is
  accepted, ordered as `$null`, and installs with no flags. It will look like it ran.
- **`ENROLLED-UPGRADE` is the only shape that reproduces the root-allowlist brick class.** A clean-box
  install never creates the entries the guard rejects — `guard_endpoint_identity_windows_test.go:20-23`
  says so in the tree's own words. If you drop this scenario to save VM time, you have removed the only
  cell that fails.
- **`RECOVER` runs `uninstall.ps1 -Recover`, which force-strips Windows Installer registration and
  deletes the Package Cache** (`uninstall.ps1:474-511`). VM-only, snapshot first.
- **Do not add a `<RemoveFolder>` for `BINDIR`** to make clean-slate pass. `Product.wxs:366-372`.
- **Never report "all checks pass" on the strength of a local run.** 73 job legs in this repo cannot be
  mirrored at all and 68 of them are `finding-b-e2e.yml` on macOS and Windows. Say which gates ran and
  which could not.

### DO NOT

- **Do not run the harness against `https://api.devoid.one` with the ECS steps enabled.**
- **Do not run it on the owner's box.**
- **Do not weaken `Test-NoDevoidInstalled` to make a scenario pass** — the whole task is strengthening
  it.
- **Do not add scenarios to `release.yml` if you cannot verify the runner exists.** Land the manual gate
  instead and say so.
- **Do not paper over a red `ENROLLED-UPGRADE` by rerunning on a clean box.** A clean box is the
  condition under which this class is always green.

### Steps

- [ ] Write the failing assertion first: extend `Test-NoDevoidInstalled` (`Verify.ps1:100-111`) from a
      **known-name list** (`$script:DevoidShimTools`, `:6`) to a **whole-directory** check — after
      uninstall, `%ProgramData%\devoid\bin` must contain **0** files other than those listed in
      `PendingFileRenameOperations`. Run it against the current build on the VM; it must go RED with the
      real count. **The known-name list is what let `devoid-prompt-guard-host.exe` sit outside the
      check; an unknown-file check is what catches the next unexplained file.**
- [ ] Report the count and the byte total in the result `Detail` so the evidence file carries numbers,
      not a boolean.
- [ ] Add three scenarios to the matrix — **editing all three sites at `:4`, `:22` and `:23-28`** —
      each one a transition the product has actually broken:
      `UPGRADE` (install N-1 → install N in place, assert no 1722/1603 and the new version reports),
      `ENROLLED-UPGRADE` (enrol, *then* upgrade — the only shape that reproduces the root-allowlist
      brick class Task 6 pins), and `RECOVER` (install → force-strip via `uninstall.ps1 -Recover` →
      install → `msiexec /x` → assert clean, which is Task 4's regression test).
- [ ] Wire the run and publish `out\e2e-results-<v>.json` as a release artifact.
- [ ] Record in `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w7/lifecycle-matrix.md`: which scenarios ran, on which
      Windows build, and — explicitly — **which OS builds and user counts did not run**, so nobody reads
      a green matrix as coverage it does not have.

### DEFEAT TEST

**Mutation:** revert `Test-NoDevoidInstalled` to the known-name list (restore the
`$script:DevoidShimTools` loop as the only bin check) and place a single unexpected file, e.g.
`zz-unexplained.exe`, in the synthetic bin directory the Pester fixture builds.

**Command (from the worktree root):**
```
pwsh -NoProfile -Command "Invoke-Pester -Path ./windows-installer/e2e-tests/tests/Report.Tests.ps1 -Output Detailed"
```

**Must appear in the output:**
```
clean-slate passed with 1 unexplained file in bin: the check must enumerate the directory, not a name list
```

**Then restore the whole-directory check and re-run; the test must be green.**

### ROLLBACK

Remove the workflow job (or the runbook step) and revert `Verify.ps1`. The harness itself is additive
and already in the tree.

### EXIT

`out\e2e-results-<v>.json` from a real run, with **7 scenarios** (A, B, C, UPGRADE, ENROLLED-UPGRADE,
RECOVER, plus one `-IncludeExtended` case) each reporting `clean-slate: filesRemaining=0`. Verify:
```powershell
$r = Get-Content out\e2e-results-*.json | ConvertFrom-Json
($r.results | Select-Object -ExpandProperty Scenario -Unique).Count           # EXPECT 7
$r.results | Where-Object Check -eq 'clean-slate' | Where-Object { $_.Detail -notmatch 'filesRemaining=0' }
# EXPECT no output
```

---

## Wave exit criteria

1. **The machine-root allowlist is closed over every writer**, with the asserted-name count equal to the
   allowlist-entry count, printed by the test. Defeat test:
   `TestGuardAllowlistCoversEveryMachineRootWriter`. **This one lands first and Wave 2 Task 6 is
   blocked on it** (RECONCILIATION §4 R1).
2. **The residue mechanism is written down and backed by a log line.**
   `Installers/windows-installer/e2e-tests/evidence/residue-diagnosis.md` names exactly one mechanism
   and quotes the msiexec log excerpt and the `Installer\Components` hive dump that select it. Defeat
   test: the `Report.Tests.ps1` block described in Task 1.
3. **A clean uninstall leaves 0 files in `%ProgramData%\devoid\bin`**, excluding anything queued in
   `PendingFileRenameOperations`, measured on a clean VM by the same script that measured 41. Defeat
   tests: `TestComponentClientSweepTouchesOnlyDevoidGuids` (Task 4 branch) plus
   `Test-CleanSlateCountsUnknownFiles` (Task 8).
4. **No uninstall can report clean while residue remains**, on all three exit paths — remote (already
   wired), CLI (Task 3), MSI (Task 3's evidence record). Defeat test:
   `TestProbeReportsSurvivingMachinePayload`.
5. **The uninstall's exit code is unchanged by everything this wave adds.** Measured 0 before and 0
   after on the same VM snapshot. Defeat test: `TestUninstallResidueCAIsAdvisoryAndLast`.
6. **The post-install window is reported, not silent.** Two timestamped `devoid status` observations in
   `evidence/w7/post-install-window.md` — `INSTALLED_NOT_READY` within 30 s of install, `READY` after
   the first reconcile, both computed from the **single existing** stamp. Defeat test:
   `TestReadinessIsNotReadyBeforeFirstReconcileStamp`.
7. **An upgrade that installs but does not enforce is reported as a failed upgrade**, and both outcomes
   leave an evidence record — ≥2 records in `%ProgramData%\devoid\evidence\upgrade.json`. Defeat test:
   `TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot`.
8. **The lifecycle matrix ran**, with 7 scenarios including `ENROLLED-UPGRADE` and `RECOVER`, and
   `lifecycle-matrix.md` names the OS builds and user counts that did **not** run. Defeat test:
   `Test-CleanSlateCountsUnknownFiles`.
9. **Every new `//go:build windows` test is in a lane that runs it.** `pr-checks.yml` names
   `./cmd/devoid-msi-root-guard/...` and `./internal/uninstall/...` in its `windows-latest` job.
   Verify: `git grep -n 'devoid-msi-root-guard\|internal/uninstall' .github/workflows/pr-checks.yml`.

### Ordering constraints that must not be violated

- **Task 6 first, before every other task in this wave and before Wave 2 Task 6.** RECONCILIATION §4 R1.
- **Task 1 (diagnose) before Task 4 (registry sweep), absolutely, including under schedule pressure.**
  RECONCILIATION §3 item 11 and §4 R6. The sweep is only safe if H1 is the real mechanism.
- **Ship Task 3 (which only observes) in a release before Task 4 (which mutates the registry).**
  RECONCILIATION §3 item 12. A recovery is what an operator reaches for when a machine is already
  wedged, so the evidence record must exist on the fleet before the sweep that is supposed to make it
  read zero.
- **Nothing in this wave widens an agent↔backend contract, so the Backend-before-agent rule is not
  triggered here.** It is stated anyway because it is the wave's most likely accidental violation:
  **widening an agent-wire contract requires the Backend deployed FIRST.**
  `AgentIngestValidationPipe` **drops** unknown keys rather than rejecting them
  (`runtimeAdapters` is `unknown[]` with no `@ValidateNested`; the DTO's decorators "NEVER EXECUTE" per
  `heartbeat.types.ts:599-618`), so an agent released ahead of the Backend loses the new fields
  **silently** — no error, no data, and a console that looks correct. If a task in this wave grows a new
  heartbeat or ingest field, it has left this wave's scope and acquires that ordering constraint.

---

## What this wave deliberately does NOT do

- **It does not implement A/B immutable version directories.** Strategy §10 asks to "stage the new
  DeVoid version beside the active one" and "atomically switch the active version". On this product a
  new directory under `%ProgramData%\devoid` is refused by `inspectRootEntries`
  (`guard_windows.go:1047`, error at `:1086`) — the exact mechanism that has already bricked upgrades
  three times (Task 6). Adding `versions\<v>\` would re-arm that brick on every endpoint at once. The
  **strongest safe subset is what already exists plus Task 7**: the msiexec transaction is already
  atomic over the file set and already rolls back to the previous generation on failure, and
  `verifyManagedInstallVersion` already refuses to report success on a rolled-back transaction
  (`upgrade_msi_apply_windows.go:127-129`). An A/B layout is a Phase 4+ design change that needs the
  guard's boundary model rewritten first, and it should be its own wave with its own review.
- **It does not add binary rollback to a lower version.** The anti-rollback floor is forward-only by
  construction (`release.PersistAcceptedRelease`, called at `upgrade_msi_apply_windows.go:103`, before
  the transaction), and strategy §10's own Rollback section endorses that: "a historical body is
  reissued at a higher revision rather than lowering monotonic state". Building a downgrade path would
  weaken an existing guard to fit a task. Recovery from a bad build is **forward** — reissue the
  known-good body at a higher version — and that is a release-process capability, not endpoint code.
- **It does not shorten the `PT1M` logon delay** (`aiwiretask.go:172-178`). The delay exists to avoid a
  measured race with the logon storm and with the daemon binding its loopback proxy. Task 5 makes the
  window *visible* and makes the first launch close it; it does not trade a known race for a shorter
  gap.
- **It does not invent a second readiness or reconcile stamp.** There is exactly one durable stamp,
  `<userHome>\.devoid\aiwire-last-reconcile` (`cmd/devoid/ai_wire_retry.go:65`, `:71-73`), and Task 5,
  Wave 2 Task 6 and Wave 2 Task 6b all use it. RECONCILIATION §1 C4.
- **It does not close the window for a profile whose owner never logs on.** A SYSTEM process may not
  write per-user AI configuration — that is the RA-3 boundary, stated at
  `internal/daemon/user_ai_wire_task.go:3-32`. There is no safe engineering fix; the honest handling is
  the readiness state in Task 5 plus fleet reporting (Wave 8's coverage truth). Do not write a task that
  pretends otherwise.
- **It does not add a `RemoveFolder` for `BINDIR`.** `Product.wxs:366-372` records that doing so failed
  an uninstall with 1603. Tasks 2/3/8 assert the directory is *empty*, which is the property that
  matters, and leave the empty ACL-hardened directory in place.
- **It does not touch the `SecurityBoundary` marker or the `RemoveFolder` rows that are already frozen**
  by prior incidents.
- **It does not attempt residue removal on a hostile local administrator's machine.** Strategy §2.1
  places that outside the initial certified profile; a local admin can re-create anything this wave
  removes. What we owe that case is detection and revoked assurance, not a cleanup arms race.
- **It does not claim the MSI and the script installer will be unified.** They differ on PATH assertion
  and on install-failure semantics (SOT §5, `install.ps1:2329-2334` vs `Product.wxs:373-379`), and
  unifying them is a larger change than this wave's constraint allows. Task 4 does require the two
  *recovery* paths to share one sweep, which is the narrow part that actually causes the defect.
- **It does not converge any of this against the production authority chain.** Every artefact this wave
  produces — the diagnosis, the residue records, the upgrade evidence, the lifecycle matrix — is a
  **local-rig / VM measurement**. RECONCILIATION §6 "Rows no wave moves" is right that *no wave in the
  programme* owns "production evidence convergence" or Enterprise readiness's "production proof", and
  this wave does not secretly own it either. Nothing in `evidence/w7/` may be described as production
  proof. That gap is an owner decision (a production-signed, production-policy verification run), not a
  task an agent can close.
