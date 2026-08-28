# Wave 2 - Make the machine authority a real service, and bind its credential to a session

**Scorecard rows this moves:** Operational durability: 4.5 -> 9.5 (strategy §12). Evidence required for that
target: "Real service, external recovery, secure IPC, no logon gap, atomic updates/rollback, lifecycle
certification, no residue." This wave owns the first four. Atomic updates/rollback, lifecycle certification
and residue are named in "What this wave deliberately does NOT do".

**Depends on:** three hard cross-wave gates, all of them added by the 2026-08-28 reconciliation. Runs in
parallel with the inline-decision-core wave (Workstream 2) otherwise. Task 11 is the only place the two
touch, and it touches the *reporting* of an ungoverned checkpoint, not the budget.

| Gate | Why | Source |
|---|---|---|
| **W7 Task 6 lands before Task 8** | After adopting C4, **Task 8 is the only task in this wave that writes a new name into the machine root** (Task 6's `broker-ready` stamp is struck — Task 6 now writes nothing there, and carries an executable check that proves it). W7 T6's `TestGuardAllowlistCoversEveryMachineRootWriter` is the completeness pin that catches a writer whose name is not in the guard allowlist; landing the writer first means the pin arrives after the brick. **If any task in this wave is ever changed to write under the machine root again, this gate applies to that task and the guard edit moves into its commit.** | RECONCILIATION §4 R1 + §1 C4 |
| **W7 Task 5 lands before Task 6b** | Task 6b's refusal condition 3 is *"this user's AI lane has never reconciled"*, which is W7 T5's readiness computation. Task 6b calls it; it does not re-derive it. Two readers of one stamp is how this codebase grows a false green. | RECONCILIATION §1 C4 |
| **W6 Task 1 lands before Task 5** | W6 T1 edits `internal/aicanary` (`pipeDrainGrace:53`, `exec.go:125`). Task 5's exit criterion is *"0 tests changed status"* against a recorded baseline — a baseline W6 T1 moves. Re-baseline after W6 T1, never before. | RECONCILIATION §2 D3 |

**No task in this wave requires a Backend deploy**, and that is by design — see "Wave exit criteria". The
one class of route that looks like it needs one and does not is a **token-gated loopback route on the
daemon** (`GET /v1/health/observed`, `POST /v1/browser/health`, `/v1/ai/*`): those are served by
`internal/daemon/server.go` and read by the CLI on the same box. They are not Backend routes and they
carry no ordering constraint. Do not add one; a phantom entry in an ordering list is how a real one gets
ignored.

**Phase:** 1 (strategy §11 — "Eliminate the critical fail-open and establish the real service boundary";
gate: "immediate post-logon launch is governed or refused").

---

## Reading rule for every file:line in this document

**The `Installers` checkout in this workspace is 1010 commits behind `origin/main`** (local HEAD `8e49a625`,
`origin/main` `5b129523`, verified 2026-08-28). Every line number below was read from `origin/main`, not from
the working tree. Read them the same way:

```bash
cd Installers && git fetch origin
MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence.go' | sed -n '66,86p'
```

`git show origin/main:<path>` on a path containing `.github` needs `MSYS_NO_PATHCONV=1` in this Git Bash, or
the ref is mangled into a filename. Backend line numbers are from `Backend` `origin/main` `0cf9021e`
(local HEAD `15dd89ba`, 773 behind).

---

## How an agent executes this wave

Each task below is written to be executed by an agent that sees **only that task**. Read this block first;
it is not repeated per task.

**Where you work.** A git worktree under `C:/cwt/`, never the shared checkout:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git worktree add /c/cwt/w2-t<N> -b w2/t<N> origin/main
cd /c/cwt/w2-t<N> && git rev-parse HEAD    # must print 5b129523... or newer origin/main
```

Branch from `origin/main`, not from the local HEAD — the local `Installers` HEAD (`8e49a625`) is 1010
commits behind and does not contain several files these tasks edit.

**NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared across every worktree of a
repository. A `git stash pop` here has twice taken a concurrent session's work. If you need a clean tree,
commit to your own branch or copy the files aside by path.

**Commit each task immediately — never batch.** One campaign on this codebase lost days of work to a crash
and three API outages; only committed work survived. Finish a checkbox, commit it. And stage explicit
paths:

```bash
git add internal/daemon/persistence.go internal/daemon/persistence_test.go
git commit -m "..."
```

**Never `git add -A`.** This tree carries other sessions' scratch files, `.patch` files and evidence
directories; `-A` sweeps them into your commit.

**A test you cannot make RED has not run.** Every checkbox below that adds a test requires the RED run and
the GREEN run, both pasted into the commit message or the evidence file. Five inert shapes have shipped
green on this codebase while defending nothing:

1. **Source-text assertions** (`readFileSync` + `toContain`) — satisfiable by pasting the asserted code
   inside a comment.
2. **Hand-built struct literals compared to hand-built struct literals** — cannot notice the real
   deliverable was deleted.
3. **Defending ONE branch of a multi-branch route** — check Codex *and* Claude, install *and* uninstall,
   stored row *and* rendered surface. One route here turned out to have three branches and the third was
   the broken one.
4. **Exercising only KNOWN members of a closed set** — cannot tell a fail-safe allowlist from a fail-open
   deny-list. Feed it something genuinely unknown and see which way it fails.
5. **A test whose PRECONDITION silently skips the assertion** — a `t.TempDir` fixture that cannot carry
   the ACE the test filters on skipped every file before the assertion ran. If a test has a
   precondition, assert it loudly.

**If a precondition in a task fails, STOP AND REPORT.** Do not improvise a substitute path, constant,
file or test. This codebase has a documented history of agents inventing a plausible replacement — an
invented vendor key, a second stamp, a second counter, a re-implemented launcher — and every one of them
shipped green and defended nothing.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## Landmines that apply to more than one task in this wave

Stated here once, and repeated inside each task they touch. An agent seeing one task in isolation gets
them either way.

**L1 — The machine root is guarded, and a new entry under it bricks every ENROLLED endpoint's next
upgrade.** `cmd/devoid-msi-root-guard/guard_windows.go` runs from the MSI Binary table with
`Return="check"`. `inspectRootEntries` (`:1047`) builds its allowlist from `boundaryChildNames` (`:624`,
= `bin, config, logs, evidence, doctor, activationStoreDirName`) plus
`credentials.json, daemon-token, endpointIdentityFileName, installModeMarkerName, proxyConfigDirName`
(`:1062-1063`) and returns `machine root contains unknown entry %q` (`:1086`) for anything else. That
error is **1722 → 1603 → the whole upgrade rolls back.** Writing any new file or directory into
`%ProgramData%\devoid` therefore requires, **in the same commit**, an entry in `boundaryChildNames` with
its matching `createBoundaryChildren` creation and `boundaryChildRead` grant. This class has fired three
times: `.staging` (F-MSI-1722), `aitrust` (F13/DF-71), and `endpoint-identity.json` on the owner's own box
on 2026-08-20, where a 7.8.42 endpoint that had enrolled the night before refused 7.8.43. **It is invisible
in CI**: a clean-box install never creates the entry, so every matrix stays green and only a machine that
has been in service fails. In this wave exactly one task writes under the machine root — **Task 8** — and
the guard edit is part of Task 8's commit. If any other task is ever changed to write there, the guard
edit moves into that task's commit too.

**L2 — Widening an agent→Backend wire contract requires the Backend deployed FIRST.**
`AgentIngestValidationPipe` sets `forbidNonWhitelisted:false` for agent-authenticated routes, so an
unknown key is **dropped silently** — no 400, no log, no data, and a console that looks correct. Nothing
in this wave widens such a contract: every off-box signal here rides the bypass-event channel, whose
`type` is `@IsString()` with no enum and whose `details` is a free `@IsObject()`
(`Backend/src/health/types/heartbeat.types.ts:184-189`, `:214-220`). If you find yourself adding a field
to the heartbeat `controls` block or a member to `UndecidableBuckets`, **the task is wrong** — stop and
report rather than shipping the agent half first.

**L3 — A fail-closed branch on a condition that cannot be proven at runtime bricked a machine in July
2026, and the operator uninstalled the agent.** An uninstalled control protects nobody. This wave adds
exactly one new fail-closed branch (Task 6b) and it carries five conditions, all locally provable with no
network. If a task tempts you to refuse on "we could not determine X", the correct behaviour is
**proceed and record**.

**L4 — Never weaken an existing guard to make a task fit.** If a guard, pin, ACL, allowlist or test
blocks the task, **the task is wrong** — stop and report. Specific guards this wave runs into and must
not touch: the `!ti.inspected → configured` anti-churn guard (`internal/daemon/persistence.go:70-72`),
`aiwiretask.ValidateExe`'s machine-bin pin (`internal/aiwiretask/aiwiretask.go:241-262`), the
`PT1M` `LogonDelay` (`:178`), `childArgs`' closed allow-list (`cmd/devoid-daemon/main_windows.go:36-44`),
`MachineSecretSDDL` and `MachineLocalReadSDDL` (`internal/winacl/machine_secret_windows.go:69`, `:91`),
and `TestMachineSecretNonElevatedReaderInventoryIsClosed`.

---

## What exists today

### The daemon is a scheduled task, and there is no service anywhere

There is **no Windows service registration in the entire product**. `git grep "windows/svc"` over `origin/main`
returns exactly two hits and both are *uninstall* manifest rows, not installers. No code calls
`sc.exe create`, `svc.Run`, or `mgr.CreateService`.

Four registration paths write the same canonical `ONSTART` / `SYSTEM` / `HIGHEST` scheduled task named
`Devoid Daemon` (`internal/daemon/persistence.go:17`):

| Path | How it registers | Restart-on-failure? |
|---|---|---|
| `install-scripts/production/install.ps1:2907-2950` | `Register-ScheduledTask` | **yes** — `-RestartCount 3 -RestartInterval 1m` at `:2926-2927` |
| `internal/daemon/persistence_windows.go:141-241` (the daemon's own re-registration) | `schtasks /Create /XML` | **yes** — `<RestartOnFailure><Interval>PT1M</Interval><Count>3</Count>` at `:230-233` |
| `cmd/devoid/setup_installer.go:853-859` (**the MSI custom action**) | plain `schtasks /Create /SC ONSTART /RU SYSTEM /RL HIGHEST` | **no** — plain `/Create` cannot express it |
| `cmd/devoid/main.go:2658-2666` (`devoid service-install`) | the same plain `/Create` args | **no** |

**The reconciler will never repair the two that lack it.** `taskInfo` (`internal/daemon/persistence.go:43-51`)
carries seven fields — `exists`, `inspected`, `hasBoot`, `isSystem`, `isHighest`, `command`, `arguments` — and
`configuredFor` (`:66-86`) branches on exactly those. `RestartOnFailure` is neither parsed
(`parseDaemonTaskXML`, `persistence_windows.go:247-286`, decodes only `Triggers`, `Principals`, `Actions`) nor
compared. So on an MSI-installed endpoint the reconciler reads the task, calls it `"present"`, and leaves the
no-crash-recovery task alone forever. **MSI-installed endpoints — the shipping installer — have no crash
recovery at all.**

The watchdog that does exist is *in-process*: `ensureDaemonPersistence` runs once at startup
(`internal/daemon/server.go:2178`, in the `:2177-2179` block) and again on every tick of the 5-minute
`aiWireReconcileLoop` ticker (`:2187`, in the `:2185-2188` block).
It cannot run while the daemon is dead. Deleting the task while the daemon is stopped is permanent until
something else starts it.

Anyone who can delete it uses the product's own command: `schtasks /Delete /TN <name> /F`, at
`cmd/devoid/main.go:2697` (`serviceUninstallWindows`). There is no security descriptor on the task.

**The uninstall side already reserves the service name.** `windowsDaemonServiceNames()`
(`internal/uninstall/uninstall.go:2561-2573`) already lists `"devoid-daemon"` and `"devoid"`, and
`execWindowsDaemonServiceCleanup` already runs `sc.exe stop` + `sc.exe delete` over that list at `:2627-2630`.
`internal/profilepatch/manifest.go:110-113` already declares `windows/svc-devoid-daemon` with
`Path: "devoid-daemon"` and `Kind: ManifestServiceUninstall`. **A service named exactly `devoid-daemon` is
already torn down by the existing uninstall.** This is the single largest "connect, do not build" win in the
wave: the residue class that would normally accompany a new persistent registration is pre-closed, provided
the name is `devoid-daemon` and nothing else.

**The daemon binary cannot be an SCM service today.** `cmd/devoid-daemon/main_windows.go` (the whole file is
76 lines) is a `-H windowsgui` launcher that `exec`s `devoid.exe daemon start` and waits (`:60-75`). It never
calls `StartServiceCtrlDispatcher`, so SCM would fail it with error 1053. It *is* already an MSI component
(`windows-installer/msi-build/Product.wxs:156-160`, GUID `4A9B2C3D-…`), so teaching **that** binary a service
mode needs **no new WiX component and no new GUID**.

`golang.org/x/sys v0.38.0` is already a direct requirement (`go.mod:14`), and `windows/svc` + `windows/svc/mgr`
ship inside it — confirmed present in the module cache. **No `go.mod` change is needed.** For the APIs x/sys
does not generate (`ImpersonateNamedPipeClient`, `GetNamedPipeClientProcessId`), the house pattern is
`windows.NewLazySystemDLL` — already used at `internal/pathwatcher/watch_windows.go:158` (advapi32),
`cmd/devoid/ai_wire_user_task_windows.go:34-39` (kernel32/user32) and three more places.

**Double-start is already handled.** `s.pidFile.Acquire()` runs at `internal/daemon/server.go:854`, *before*
`net.Listen` at `:893`. A second daemon exits with `daemon already running (pid N)`
(`internal/daemon/pidfile.go:36`), and a genuine port conflict is separately named at `server.go:901-908`.
This is why the supervisor design in Task 3 is safe.

### The one-minute unwired window at logon

`internal/aiwiretask/aiwiretask.go` registers a **per-user** task `Devoid AI Governance Reconcile`
(`:144`) that runs `devoid-daemon.exe ai reconcile` (`:150`, `:154`) as `BUILTIN\Users` / `LeastPrivilege`
(`:211`, `:378`) on a logon trigger **with `<Delay>PT1M</Delay>`** (`LogonDelay`, `:178`) plus a `PT5M`
repetition (`:170`). The delay is deliberate and its reason is written in place at `:172-177`: keep out of the
logon storm, and let the SYSTEM daemon bind its wire proxy first.

The consequence is the strategy's "no one-minute unwired state": on a machine-scope install the SYSTEM daemon
**refuses** to write per-user AI controls (`runAIWireReconcile` returns early on `userCtx.MachineService`,
`internal/daemon/server.go:2233`; the boundary is defined at `internal/daemon/attest_user_home.go:49-78`), and
the delegation that does the work does not fire for a minute. A Claude Code or Codex session started in the
first sixty seconds of a fresh logon runs with whatever wiring the profile already had — which, for a
first-ever logon, is none.

Nothing in the product measures that window, and nothing refuses a launch inside it.

**The primitive to close it already exists and is fully hardened.** `internal/aicanary` can start a process in
the interactive user's own security context from a SYSTEM parent:

- `targetUserToken` (`internal/aicanary/deelevate_windows.go:62-81`) — `WTSQueryUserToken` on the active
  session, with a hard-fenced linked-token fallback and no "run it as SYSTEM anyway" path (`:36-37`).
- `activeInteractiveSession` (`:98-120`) — console session first, `WTSEnumerateSessions` fallback, session 0
  never a candidate.
- `startAsUser` (`internal/aicanary/launch_windows.go:175-330`) — `CreateProcessAsUser` at `:295` with
  `winsta0\default` named explicitly (`:244`), `CreateEnvironmentBlock` against the *user's* token (`:353`),
  `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` narrowing inheritance to three handles (`:236-242`), and a
  kill-on-close job object (`:274-287`). The file's own header (`:17-51`) explains why every one of those is
  not optional.

All of it is unexported and lives in a canary-specific package.

### The machine capability token is readable by every local user

`internal/winacl/machine_secret_windows.go` defines two descriptors:

- `MachineSecretSDDL = "O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)"` (`:69`) — SYSTEM + Administrators only.
- `MachineLocalReadSDDL = "O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;BU)"` (`:91`) — adds
  `BUILTIN\Users` `FILE_GENERIC_READ`.

`%ProgramData%\devoid\daemon-token` is on the second one: `hardenMachineToken = winacl.HardenMachineLocalRead`
(`internal/daemon/daemon_token_perm_windows.go:17`), re-asserted on every daemon start
(`loadOrCreateDaemonToken`, `internal/daemon/daemon_auth.go:238-310`). Every local user can read the capability
token that gates all **40** `requireDaemonToken`-wrapped routes (`grep -c requireDaemonToken` on
`internal/daemon/server.go`).

**Naively narrowing it bricks every non-elevated package install fleet-wide**, and that is not prose — it is
pinned by an executable inventory. `internal/winacl/machine_secret_readers_test.go` (no build tag, deliberately;
it runs on the ubuntu `wire-lane-tests` job) is a `go/ast` walk over `cmd/*` that names two non-elevated
binaries:

- `cmd/devoid` (`:105-121`) — `attachDaemonToken` (`cmd/devoid/daemon_client.go:181-189`) reads the machine
  token in the user's token on every shim and `devoid ai hook` invocation, and `postPrescanWatch`
  (`:199-216`) treats the resulting 401 as **fail-closed**.
- `cmd/devoid-prompt-guard-host` (`:122-133`) — the browser native-messaging host, spawned by the browser in
  the browsing user's token, reads the token **per request** (`readDaemonToken`,
  `cmd/devoid-prompt-guard-host/main.go:234-235`, via `config.DaemonTokenReadPath`). Its failure mode is
  `decision:"allow"` (`:374-389`), so narrowing the ACL would not break that lane visibly — it would leave it
  running and ungoverned.

The test fails in **both** directions (`:34-47`): when a new non-elevated reader appears, and when the last one
disappears — the second being the signal that the ACL finally became narrowable. That is the exact gate this
wave has to move.

The precondition is named in three places and exists nowhere in code: "item 101's per-user credential split +
per-user daemon-token distribution" — `machine_secret_windows.go:39-42`, `daemon_token_perm_windows.go:9-16`,
and the live-proof register entry `machine-secret-denies-local-users`
(`internal/liveproof/register.json`).

`DaemonTokenReadPath` (`internal/core/config/config.go:682-687`) resolves **machine-first, with no per-user
path at all on a system install**, because `IsSystemInstall()` (`:654-658`) returns true whenever a machine
`credentials.json` exists. `ReadTokenDetailed` (`internal/daemon/daemon_auth.go:140-200`) short-circuits on
`config.IsSystemInstall()` at `:163-167`. There is no session concept in the token at all.

**There is no second factor behind the token on Windows.** `peerUIDMatchesDaemon` is real on Linux
(`internal/daemon/daemon_peercred_linux.go:24`) and a `//go:build !linux` no-op everywhere else
(`internal/daemon/daemon_peercred_other.go:22-25`). That file's own comment says it plainly at `:12-18`:
"a Windows system install has no second factor behind the mutating routes at all." It is wired through a
swappable seam, `peerUIDCheckFn` (`internal/daemon/daemon_auth.go:79`), which is the insertion point.

### The false green, stated more precisely than the source of truth does

Source of truth §14.1 calls the unreadable-token endpoint the worst false green and says "the internal reason
bucket still reads `daemon-unreachable-*`". **On the AI hook lane that is no longer exact, and the correction
matters because it tells you which surface to fix.** A 401 from the daemon is classified as `daemonAskStatus`
(`cmd/devoid/ai.go:1684-1686`, and again at `:1845`, `:1989`), which maps to `daemon-error`, not
`daemon-unreachable` (`cmd/devoid/ai_daemon_ask.go:60-69`). The `daemon-unreachable-budget-expired` slug the
SOT quotes is the *budget* path (`internal/airuntime/runner.go:1003`), which is Workstream 2's problem, not
this one. The human-facing notice already separates the two causes and names the token path
(`cmd/devoid/ai_failure_resolver.go:284-296`).

What is genuinely undifferentiated is everything **off-box**, plus one on-box surface:

1. **Nothing off-box distinguishes a token-unreadable endpoint from a healthy one.** The daemon is alive and
   heartbeating, so the dead-man never fires; no bypass event is emitted for an unreadable token; and the
   controls attestation carries no field for it.
2. **The browser native host literally reports the wrong cause**: a missing/unreadable token produces
   `{"error":"daemon-unreachable","reason":"token-missing"}` and `decision:"allow"`
   (`cmd/devoid-prompt-guard-host/main.go:374-389`). The daemon is not unreachable; the caller is not
   authorised. And it fails open.

The safe off-box channel already exists and needs **no Backend change**: `security.RecordEvents`
(`internal/security/events.go:37-46`) queues a `BypassEvent`, `sendHeartbeat` uploads it
(`internal/daemon/server.go:1574-1610`), and the Backend DTO field is
`@IsString() type: string` — **not** an enum — at `Backend/src/health/types/heartbeat.types.ts:184-189`, with
`details` as a free `@IsObject()` at `:214-220`. `daemon_persistence_recreated` already rides this channel
(`internal/daemon/persistence.go:189-192`). Contrast the undecidable-bucket vocabulary, which **is** closed and
Backend-pinned (`internal/airuntime/undecidable.go:68-79`) — adding a bucket there without landing Backend
first is the silent-field-loss landmine.

### The machine root is an allowlist, and this wave writes into it

This section did not exist in the first draft of this wave and its absence was the single most dangerous
defect in the whole eight-wave plan. Stated here so no task below can be executed without it.

`cmd/devoid-msi-root-guard` is embedded in the MSI Binary table and runs with `Return="check"` — its
non-zero exit is **1722 → 1603 → the entire upgrade rolls back**. Two halves of one file decide what may
live in `%ProgramData%\devoid`:

- `boundaryChildNames` (`guard_windows.go:624-629`) — the ordered single source of truth for managed child
  directories: `bin`, `config`, `logs`, `evidence`, `doctor`, `activationStoreDirName` (= `aitrust`,
  `:1005`). `openOrCreateBoundaryChildren` (`:641`) creates and stamps each one with the descriptor
  `boundaryChildRead` (`:634-639`) selects — `evidence` gets read-only, everything else gets the ordinary
  `BUILTIN\Users` read+traverse grant.
- `inspectRootEntries` (`:1047`) — builds its allowlist *from* `boundaryChildNames` plus five
  non-directory / conditionally-present names (`credentials.json`, `daemon-token`,
  `endpointIdentityFileName`, `installModeMarkerName`, `proxyConfigDirName`, `:1062-1063`) and returns
  `fmt.Errorf("machine root contains unknown entry %q", entry.Name())` at `:1086` for anything else.

The file's own F13/DF-71 comment (`:613-623`) explains why the list is a variable rather than three
literal lists: "a child the creator knows about and the enumerators do not is a root that never goes
away". The same divergence, in the other direction, is the brick.

**It has fired three times** — `.staging` (F-MSI-1722), `aitrust` (F13/DF-71), and `endpoint-identity.json`
on the owner's own box on 2026-08-20. `guard_endpoint_identity_windows_test.go:13-26` records the third in
the source: *"a 7.8.42 endpoint that had enrolled the night before refused 7.8.43"*, and names why the
class is so durable: "the entry is created by the endpoint doing its job… so a clean-box install always
passes and only a REAL endpoint, one that has been in service, fails. Every CI matrix in the world stays
green."

Three further facts every task that touches the guard needs:

1. **The guard's own tests run in NO CI job.** They are all `//go:build windows`;
   `cli-entrypoint-tests` (windows-latest) runs only `go test ./cmd/devoid/...` (`pr-checks.yml:351`), and
   `internal-candidate.yml:87`'s `go test ./...` is ubuntu, where the package has only `main_other.go`.
   The guard is *built* by `internal-candidate.yml:436` and `release.yml:1281` and *tested* nowhere.
2. **Contents of a managed child are free** unless the directory is named in the runtime-tree pass
   (`:389`: `logs`, `evidence`, `doctor`, `aitrust` — trusted owner, no reparse point, bounded at
   `maxRuntimeEntries = 4096`) or has a dedicated inspector (`bin`, `config`).
3. **Residue is already closed for anything under the root.** `windowsMachineCleanupTargets`
   (`internal/uninstall/uninstall.go:1348`) `os.RemoveAll`s `%ProgramData%\devoid` whole
   (`:701-707`), and `finalizeUninstallRoot` (`guard_windows.go:402`) only closes the
   RemoveFolder-ordering gap by deleting the root **when it is already empty**.

### CI reality that constrains every task below

- `wire-lane-tests` (ubuntu) already runs `go test ./internal/daemon/... -run 'OpenAI|Wire|Persistence|TaskInfo'`
  (`.github/workflows/pr-checks.yml:213`) and `go test ./internal/winacl/... ./internal/browserinv/...` (`:225`).
  **A new test whose name contains `Persistence` is picked up by an existing gate with no workflow edit.**
- `cli-entrypoint-tests` (windows-latest) runs `go test ./cmd/devoid/... -timeout 25m` (`:351`).
- `internal-candidate.yml:87` runs `go test ./...` **on ubuntu** — so `_windows.go` files are never compiled
  there. Windows-only packages have thin coverage by default.

The consequence is the house pattern, and every task follows it: **the decision is a pure function in a
build-tag-free file; the Windows API call is a thin seam behind an injectable struct.** That is exactly how
`internal/daemon/persistence.go` (pure `reconcilePersistence` + `persistenceSeams`) is already built, and it
is why its tests run on ubuntu.

---

## Task 1: Teach the boot-persistence reconciler to see a missing restart-on-failure

Cheapest task in the wave and the highest value per unit of risk: it closes the MSI crash-recovery hole
**today**, using machinery that already ships, before any service exists.

**Files:**
- `internal/daemon/persistence.go` (add `hasRestartOnFailure` to `taskInfo` at `:43-51`; add one branch to
  `configuredFor` at `:66-86`; add a reason constant beside `reasonCmdMismatch` at `:94`)
- `internal/daemon/persistence_windows.go` (extend the `parseDaemonTaskXML` decode struct at `:248-264` with
  `Settings > RestartOnFailure`; populate at `:268-278`)
- `internal/daemon/persistence_test.go` (pure decision tests, ubuntu)
- `internal/daemon/persistence_windows_test.go` (XML fixture parse test)
- `internal/aiwiretask/testdata/schtasks-query-normalized.xml` is a fixture for the *other* task; add a new
  fixture under `internal/daemon/testdata/` rather than reusing it

**PRECONDITIONS** — run these first; every one must produce the stated output. If any fails, **STOP AND
REPORT**; do not substitute a different file, line or constant.

```bash
cd /c/cwt/w2-t1 && git fetch origin && git rev-parse origin/main
#   -> 5b12952307db9903fa166d5d9ce1a0c058e0ad77 (or newer; if newer, re-read every line below)

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence.go' | sed -n '43,51p'
#   -> the taskInfo struct with EXACTLY seven fields and NO restart field

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence.go' | sed -n '70,72p'
#   -> case !ti.inspected:  ... return true, "present (definition not inspected)"

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence_windows.go' | sed -n '230,233p'
#   -> <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count>

go test ./internal/daemon/... -run 'Persistence|TaskInfo' -count=1
#   -> ok  (this is the exact gate pr-checks.yml:213 runs; it must be GREEN before you start)
```

**LANDMINES**

- **The anti-churn guard is load-bearing and must stay above your new branch.** `!ti.inspected` returning
  `(true, "present (definition not inspected)")` (`:70-72`) is what stops an unreadable task definition
  from being re-registered every 5 minutes on every endpoint. Ordering your branch above it converts a
  locale or ACL quirk into a fleet-wide alert storm.
- **This task writes nothing to the machine root** (L1 does not apply) and **changes no wire contract**
  (L2 does not apply): the repair emits the existing `daemon_persistence_recreated` bypass event whose
  `type` is a free `@IsString()` on the Backend. No Backend deploy.
- The reason string you add becomes the `details` of a **high-severity** event on every affected endpoint
  at once. Every MSI-installed endpoint in the fleet lacks `RestartOnFailure` today, so the first tick
  after this ships emits one event per endpoint. That is intended and is the exit number; a *second* one
  is the defect.

**DO NOT**

- Do not remove, reorder or "simplify" the `!ti.inspected` guard, and do not add a third state to
  `configuredFor`'s return.
- Do not make the query-error arm (`persistence.go:143-148`) fall through into a repair.
- Do not reuse `internal/aiwiretask/testdata/schtasks-query-normalized.xml`; it belongs to the per-user
  task and a shared fixture couples two reconcilers.
- Do not widen the `-run 'OpenAI|Wire|Persistence|TaskInfo'` filter in `pr-checks.yml:213`. An unscoped
  `./internal/daemon` run writes the real machine Codex baseline on the runner (`pr-checks.yml:334-337`).

**Blast radius:** the reconciler runs every 5 minutes on every Windows endpoint. If the new branch is wrong in
the "not configured" direction, every endpoint re-registers its daemon task every 5 minutes and emits a
high-severity `daemon_persistence_recreated` bypass event every 5 minutes — a fleet-wide alert storm and
Task Scheduler churn. **This is the failure mode to design against.** Two existing guards must be preserved
exactly: `!ti.inspected` returns `true` ("present (definition not inspected)", `:71-72`) so an unreadable
definition never churns, and a query error leaves the task alone (`:143-148`). The new field must be
**checked only when `inspected` is true**, and must be ordered **after** the `inspected` guard.

**Rollback:** single-file revert of the `configuredFor` branch. The parse addition is inert without it, so
reverting only the branch is a complete and safe rollback that leaves the new measurement in place.

- [ ] Write `TestTaskInfoConfiguredFor_MissingRestartOnFailureIsRepaired` in `persistence_test.go`:
      `taskInfo{exists:true, inspected:true, hasBoot:true, isSystem:true, isHighest:true, command:<exp>,
      hasRestartOnFailure:false}` -> `(false, "task has no restart-on-failure action")`. RED (field does not
      compile).
- [ ] Write `TestTaskInfoConfiguredFor_UninspectedTaskIsStillNotChurned`:
      `taskInfo{exists:true, inspected:false}` -> `(true, "present (definition not inspected)")` **regardless
      of** `hasRestartOnFailure`. This is the anti-churn pin; it must be written before the branch exists.
- [ ] Write `TestParseDaemonTaskXML_ReadsRestartOnFailure` over two fixtures: the XML `daemonTaskXML` itself
      emits (`persistence_windows.go:230-233`) -> `true`; a plain-`/Create`-shaped XML with no `<Settings>`
      -> `false`. Capture the second fixture from a real box with
      `schtasks /Query /TN "Devoid Daemon" /XML` after an MSI install.
- [ ] Add the field, the parse, and the branch. GREEN.
- [ ] Confirm the repair path: `reconcilePersistence` (`:138-162`) already re-registers through
      `registerCanonicalTask`, whose XML carries `RestartOnFailure`. No new write path.
- [ ] Confirm the repair emits the existing high-severity event with the new reason string
      (`persistence.go:186-193`) — a free-string `type` already on the Backend's `@IsString()` field, so **no
      Backend change and no deploy ordering constraint**.

**DEFEAT TEST 1 — the repair actually fires.**
Mutation: delete the `case !ti.hasRestartOnFailure:` arm from `configuredFor` in
`internal/daemon/persistence.go`.
Command: `go test ./internal/daemon/... -run 'TestTaskInfoConfiguredFor_MissingRestartOnFailureIsRepaired' -count=1`
Must print: `got (true, "present"), want (false, "task has no restart-on-failure action")`

**DEFEAT TEST 2 — the churn-storm guard. Same commit, not a follow-up.**
Mutation: move the `case !ti.hasRestartOnFailure:` arm **above** the `case !ti.inspected:` arm.
Command: `go test ./internal/daemon/... -run 'TestTaskInfoConfiguredFor_UninspectedTaskIsStillNotChurned' -count=1`
Must print: `got (false, "task has no restart-on-failure action"), want (true, "present (definition not inspected)")`

Restore both mutations and re-run; both must be GREEN. Paste the RED and GREEN output into the commit
message.

**Exit:** on a fresh MSI install of the built agent, `devoid doctor` shows the "Daemon persistence" row
transition from PASS to a repaired PASS within one 5-minute tick, and
`schtasks /Query /TN "Devoid Daemon" /XML` contains `<RestartOnFailure><Interval>PT1M</Interval><Count>3</Count>`
where it previously contained no `<RestartOnFailure>` element. **Number: 1 repair event per endpoint,
exactly once, and 0 further repairs over the next 12 ticks (60 minutes).** The second half is the churn check
and is not optional.

Verify the number with a command, not by reading the log:

```powershell
schtasks /Query /TN "Devoid Daemon" /XML | Select-String -Pattern 'RestartOnFailure'
#   -> one match after the first repair tick

Select-String -Path "$env:ProgramData\devoid\logs\*.log" -Pattern 'daemon_persistence_recreated' |
  Measure-Object | Select-Object -ExpandProperty Count
#   -> 1 at T+5min, and STILL 1 at T+65min
```

Save both readings, timestamped, to `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t1-persistence-repair.txt`.

---

## Task 2: Give `devoid-daemon.exe` an SCM service mode that is dormant until registered

**Files:**
- `cmd/devoid-daemon/main_windows.go` (currently 76 lines; add a service branch)
- `cmd/devoid-daemon/service_windows.go` (new — the `svc.Handler`)
- `cmd/devoid-daemon/main_other.go` (new, `//go:build !windows` — **see LANDMINE 1; this file is not
  optional and it is not cosmetic**)
- `internal/daemonsupervise/supervise.go` (new, **no build tag** — the pure supervision decision.
  **An `internal/` package, NOT `cmd/devoid-daemon/supervise.go`** — see LANDMINE 1)
- `internal/daemonsupervise/supervise_test.go` (new, no build tag — runs on ubuntu)
- `cmd/devoid-daemon/main_windows_test.go` (extend)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t2 && git fetch origin && git rev-parse origin/main
#   -> 5b12952307db9903fa166d5d9ce1a0c058e0ad77 (or newer)

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-daemon/main_windows.go' | wc -l
#   -> 76

MSYS_NO_PATHCONV=1 git ls-tree --name-only origin/main cmd/devoid-daemon/
#   -> EXACTLY two files: main_windows.go and main_windows_test.go.
#      There is no main_other.go and no non-Windows file in this package today.

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-msi-root-guard/main_other.go'
#   -> the in-repo precedent to copy: //go:build !windows, package main, a func main()
#      that prints "...is Windows-only" and os.Exit(1)

grep -n "windows/svc" $(go env GOMODCACHE)/golang.org/x/sys@v0.38.0/windows/svc/service.go | head -1
#   -> non-empty; x/sys v0.38.0 is already a direct requirement (go.mod:14), so no go.mod change

GOOS=linux go build ./...
#   -> silent, exit 0. This is pr-checks.yml:201's "Whole-module compile" and it must be
#      GREEN before you start AND after you finish.
```

**LANDMINES**

1. **`cmd/devoid-daemon` is a `package main` with no non-Windows file. Adding a build-tag-free `.go` file
   to it breaks `go build ./...` on ubuntu — which is the FIRST step of the `wire-lane-tests` job
   (`pr-checks.yml:201`) and carries no `if: always()` (`:190-192`).** Today the whole package is excluded
   on Linux, so the wildcard skips it silently. The moment one untagged file appears, Linux tries to link
   a main package that has no `func main` and the build dies with:

   ```
   # github.com/codefense/cli-wrapper/cmd/devoid-daemon
   runtime.main_main·f: function main is undeclared in the main package
   ```

   Reproduced 2026-08-28 on a two-file scratch module, so this is measured, not predicted. **Two
   consequences, both mandatory:** put the pure supervision decision in `internal/daemonsupervise/` (an
   ordinary library package — it still runs on ubuntu, which is the whole point of the house pattern), and
   add `cmd/devoid-daemon/main_other.go` copied from `cmd/devoid-msi-root-guard/main_other.go` so the
   package stays linkable everywhere regardless.
2. **`svc.IsWindowsService()` is the only acceptable detector.** It reads the process's own session and
   parent. Do not detect on an argument, an environment variable or the parent image name: the ONSTART
   task launches this same binary on every Windows endpoint, and a false "I am a service" makes the
   daemon never start **fleet-wide**. That is the worst outcome available in this wave.
3. **This task writes nothing to the machine root** (L1 does not apply) and **changes no wire contract**
   (L2 does not apply). The supervisor's bypass events ride the free-string channel.
4. **Nothing registers the service until Task 3.** If this task changes observable behaviour on any
   endpoint, it is wrong.

**DO NOT**

- Do not turn `childArgs` (`main_windows.go:36-44`) into an open parser. It is a closed allow-list with
  `os.Exit(2)` for everything else; the service branch adds exactly one accepted shape.
- Do not put `supervise.go` in `cmd/devoid-daemon` "because the plan's first draft said so" — see
  LANDMINE 1.
- Do not add a second listener anywhere. The service is a supervisor; it never binds a port.
- Do not remove or relax `s.pidFile.Acquire()` (`internal/daemon/server.go:854`) or the port-conflict
  branch (`:901-908`). They are what make dual registration safe.
- Do not edit `go.mod`. `golang.org/x/sys v0.38.0` already carries `windows/svc` and `windows/svc/mgr`.

**Blast radius:** this binary is what the existing `ONSTART` task launches on **every Windows endpoint**. If
the service-mode detection is wrong in the "I am a service" direction, `devoid-daemon.exe` launched by the
Task Scheduler would try to talk to SCM, fail, and **the daemon would never start fleet-wide**. That is the
worst outcome available in this wave.

The detection must be `svc.IsWindowsService()` (which reads the process's own session/parent, not an argument)
**and** it must be checked such that any error defaults to the legacy launcher path. `childArgs`
(`main_windows.go:36-44`) is a closed allow-list today and must stay one: the service branch adds exactly one
new accepted shape and rejects everything else with `os.Exit(2)` as it does now.

**Rollback:** revert `main_windows.go` to the 76-line launcher. `service_windows.go`,
`internal/daemonsupervise/` and `main_other.go` become dead code and are harmless (keep `main_other.go`:
it only makes the package linkable on Linux). Because nothing registers the service until Task 3,
**this task alone changes no observable behaviour on any endpoint** — that is the point of splitting it
out.

- [ ] Add `cmd/devoid-daemon/main_other.go`, copied from `cmd/devoid-msi-root-guard/main_other.go`, and
      prove the whole-module compile still passes on Linux: `GOOS=linux go build ./...` -> silent, exit 0.
      **Do this first.** If you write any other file in `cmd/devoid-daemon` before this one, the next
      `go build ./...` fails and the failure will read as unrelated.
- [ ] Write `TestChildArgs_UnknownShapeStillRejected` pinning the existing closed list before touching it.
- [ ] Write `TestServiceModeDetectionFallsBackToLauncherOnError`: a table over
      `(isService bool, detectErr error)` asserting the launcher path is taken for `(false,nil)`,
      `(true,err)`, `(false,err)` and only `(true,nil)` takes the service path. Inject the detector as a
      package var seam. RED.
- [ ] Write the supervision decision as a pure function in `internal/daemonsupervise/supervise.go` with
      **no Windows imports**:
      `func NextSupervisorAction(s SupervisorState) SupervisorAction` over
      `{healthyProbes, consecutiveFailures, portHeldByForeigner, childOwned, restartsInWindow, now}`.
      Actions: `Adopt`, `Spawn`, `Wait`, `GiveUpAndReport`. Test it on ubuntu.
- [ ] Pin the restart bound: `TestSupervisor_StopsSpawningAfterCap` — at most 5 spawns in 10 minutes, then
      `GiveUpAndReport`. A supervisor without a cap is a restart-loop generator.
- [ ] Pin the adopt rule: `TestSupervisor_NeverSpawnsWhileAHealthyDaemonAnswers` — any state with
      `healthyProbes>0` must yield `Adopt` or `Wait`, never `Spawn`. This is the no-second-listener invariant.
- [ ] Pin the foreign-holder rule: `TestSupervisor_DoesNotSpawnIntoAHeldPort` — `portHeldByForeigner=true`
      yields `GiveUpAndReport`, never `Spawn`. Without this the supervisor fights a WSL/Docker port forward
      forever (the condition `server.go:901-908` already names).
- [ ] Implement `service_windows.go`: `svc.Run("devoid-daemon", handler)`; accept
      `svc.AcceptStop|svc.AcceptShutdown`; report `svc.StartPending` then `svc.Running` within 10 s; on
      `svc.Stop` terminate only a child this process **owns** (never an adopted one) and report `svc.Stopped`.
- [ ] Health probe reuses the existing open liveness document — `GET /health`, requiring **both** the
      `"daemon":"devoid"` marker and a matching `version`, exactly as `install.ps1` and `probeDaemonHealth`
      already do (`internal/daemon/server.go:1325-1344`, and the comment at `:1328-1332` explains why both).
      No token is needed, which is why this route must stay open.
- [ ] Every spawn emits `security.NewBypassEvent("daemon_supervisor_restarted", "high", "daemon-supervisor", …)`
      through the existing sink. Free-string type, no Backend change.
- [ ] **Discovery step, and it is load-bearing for the whole no-second-listener argument.** The single-instance
      guard is `s.pidFile.Acquire()` on `secPaths.DaemonPIDPath` (`internal/daemon/server.go:399`, `:854`).
      Prove that a service-launched SYSTEM daemon and a task-launched SYSTEM daemon resolve that path to the
      **same file**. Both run as LocalSystem, so they should — but "should" is not the standard here, and if
      they diverge the pidfile serialises nothing and two daemons race the port. Run, from a SYSTEM shell
      (`psexec -s -i`) under each launch context:
      `MSYS_NO_PATHCONV=1 git show 'origin/main:internal/security/paths.go' | grep -n DaemonPIDPath` to find
      the resolver, then print the resolved value from both contexts and diff them. If they differ, the
      supervisor must additionally acquire a named mutex (`Global\devoid-daemon-single-instance`) before
      spawning, and that becomes part of this task rather than a discovery.

**DEFEAT TEST 1 — an unclear detector must never take the service path.**
Mutation: in `cmd/devoid-daemon/main_windows.go`, change the detector call site to
`isService, _ := detectWindowsService()` (drop the error).
Command: `go test ./cmd/devoid-daemon/... -run 'TestServiceModeDetectionFallsBackToLauncherOnError' -count=1`
(on Windows; the detector seam test is in `main_windows_test.go`)
Must print: `detector error must take the launcher path, got service path`

**DEFEAT TEST 2 — the no-second-listener invariant.**
Mutation: delete the `healthyProbes > 0` guard from `NextSupervisorAction` in
`internal/daemonsupervise/supervise.go`.
Command: `go test ./internal/daemonsupervise/... -run 'TestSupervisor_NeverSpawnsWhileAHealthyDaemonAnswers' -count=1`
(runs on ubuntu — no build tag)
Must print: `want Adopt|Wait, got Spawn`

**DEFEAT TEST 3 — the CI landmine itself, and it is the one an agent will skip.**
Mutation: `git rm cmd/devoid-daemon/main_other.go`
Command: `GOOS=linux go build ./...`
Must print: `runtime.main_main·f: function main is undeclared in the main package`
Restore it and re-run; must be silent, exit 0.

**EXIT:** named artifact — a build of `devoid-daemon.exe` from this commit, installed over an existing
endpoint, where the task-launched start is byte-identical to the previous build's:

```powershell
schtasks /Run /TN "Devoid Daemon"; Start-Sleep 10
(Invoke-RestMethod http://127.0.0.1:19280/health) | ConvertTo-Json -Depth 5 |
  Set-Content w2-t2-health-after.json
# repeat on the previous build -> w2-t2-health-before.json, then:
Compare-Object (Get-Content w2-t2-health-before.json) (Get-Content w2-t2-health-after.json) |
  Where-Object { $_.InputObject -notmatch 'uptime' }
#   -> EMPTY
```

**Numbers: 5 liveness keys present (`internal/daemon/server.go:1318`), 0 differences outside `uptime`, and
0 lines of behavioural difference in the daemon log prefix through the first 30 seconds.** Plus the CI
number that this task's landmine is really about: `GOOS=linux go build ./...` exits 0. Save as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t2-service-mode-dormant.txt`.

---

## Task 3: Register `devoid-daemon` as a real service with failure actions and a hardened service DACL

The service is a **supervisor**, not a second daemon. It never starts a listener of its own; it adopts the one
the `ONSTART` task started, or starts one when none is answering. That is what makes dual registration safe,
and it is also exactly the property the strategy asks for: "external recovery when the process is dead, while a
daemon that repairs its own scheduled task can only repair itself while it is already alive."

**Files:**
- `cmd/devoid/setup_installer.go` (`runSetupInstallDaemon`, `:832-895` — register the service after the task,
  before `startDaemonAndWait`)
- `cmd/devoid/setup_daemon_service.go` (new — pure argument builders, no build tag)
- `cmd/devoid/setup_daemon_service_test.go` (new, no build tag)
- `cmd/devoid/main.go` (`serviceInstallWindows`, `:2518-2609` — same registration behind the same UAC hop)
- `cmd/devoid/setup_installer.go` (`runSetupRemoveDaemon` — add the `sc delete`)
- **No WiX change.** `CA_InstallDaemonTask` already runs
  `"[BINDIR]devoid.exe" setup install-daemon --bin-dir "[BINDIR]"` deferred and non-impersonated, i.e. as
  SYSTEM (`windows-installer/msi-build/CustomActions.wxs:176-179`, `:341-346`, sequenced at `:617`), and its
  rollback already runs `setup remove-daemon` (`:241-244`, `:348-353`). Changing the *verb* rather than the
  MSI is what keeps the frozen component GUIDs untouched.

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t3 && git fetch origin && git rev-parse origin/main
#   -> 5b12952307db9903fa166d5d9ce1a0c058e0ad77 (or newer)

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/uninstall/uninstall.go' | sed -n '2561,2573p'
#   -> windowsDaemonServiceNames() listing "devoid-daemon" AND "devoid"

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/profilepatch/manifest.go' | sed -n '110,113p'
#   -> the windows/svc-devoid-daemon row with Path: "devoid-daemon", Kind: ManifestServiceUninstall

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid/setup_installer.go' | sed -n '863,866p'
#   -> the os.Exit(1) on a schtasks /Create failure. Your registration must NOT be on this path.

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid/setup_installer.go' | sed -n '871,884p'
#   -> registerUserAIWireTask: the best-effort shape to copy (never exits, never prints,
#      never returns an error)

MSYS_NO_PATHCONV=1 git show 'origin/main:windows-installer/msi-build/CustomActions.wxs' | sed -n '341,346p'
#   -> CA_InstallDaemonTask, deferred + non-impersonated (SYSTEM), Return="ignore"

# Task 2 must already be merged: this task registers the binary Task 2 taught to be a service.
MSYS_NO_PATHCONV=1 git log --oneline origin/main -1 -- cmd/devoid-daemon/service_windows.go
#   -> non-empty. If empty, Task 2 has not landed. STOP.
```

**LANDMINES**

- **Never let the service registration fail the install.** `runSetupInstallDaemon` already calls
  `os.Exit(1)` on a `schtasks /Create` failure (`setup_installer.go:863-866`). A `sc create` that fails
  on a locked-down or MDM-managed box must be swallowed exactly the way `registerUserAIWireTask`
  (`:871-884`) swallows its own failures. A failed install on a customer fleet is a worse outcome than a
  missing supervisor.
- **`failureflag 1` is the single most-missed line.** Without it SCM applies failure actions to a crash
  only, never to a non-zero exit — which is exactly the failure this task exists to cover.
- **No WiX change, and no new component GUID.** The MSI already invokes
  `"[BINDIR]devoid.exe" setup install-daemon --bin-dir "[BINDIR]"` deferred/non-impersonated
  (`CustomActions.wxs:176-179`, `:341-346`, sequenced `:617`). Editing `Product.wxs` risks the frozen
  GUIDs and the RemoveFolder/SecurityBoundary rows that have produced 1603 before. If a task seems to
  require a WiX edit, **the task is wrong** — stop and report.
- **The service name is `devoid-daemon` and nothing else.** That exact string is already torn down by the
  shipped uninstall (`internal/uninstall/uninstall.go:2561-2573`, `:2627-2630`) and already declared in
  `internal/profilepatch/manifest.go:110-113`. Renaming it silently reintroduces the residue class this
  wave otherwise closes for free.
- **This task writes nothing to the machine root** (L1 does not apply — a service registration lives in
  the SCM database, not in `%ProgramData%\devoid`) and **changes no wire contract** (L2 does not apply).

**DO NOT**

- Do not make `runSetupInstallDaemon` return an error, exit, or print on a service-registration failure.
- Do not treat exit code 1073 (`ERROR_SERVICE_EXISTS`) as a failure; it is the normal upgrade path.
- Do not grant `RP`/`WP`/`DT`/`DC`/`WD`/`SD` to `IU`, `SU`, `BU`, `WD` (Everyone) or `AU` in the service
  SDDL, and do not fall back to SCM's default descriptor if `sdset` fails — record and leave the service
  registered with the create-time descriptor.
- Do not change the run-as identity away from `LocalSystem` (see "What this wave deliberately does NOT do").
- Do not touch the `Devoid Daemon` scheduled task in this task. It stays, untouched, throughout.

**Registration, exactly:**

```
sc.exe create devoid-daemon binPath= "<BINDIR>\devoid-daemon.exe" start= auto obj= LocalSystem \
        DisplayName= "DeVoid Security Daemon"
sc.exe sidtype devoid-daemon unrestricted
sc.exe failure devoid-daemon reset= 86400 actions= restart/60000/restart/60000/restart/120000
sc.exe failureflag devoid-daemon 1
sc.exe sdset devoid-daemon <SDDL>
```

`failureflag 1` is not optional and is the single most-missed line in this whole configuration: **without it
SCM only applies failure actions to a crash, not to a non-zero exit.** A daemon that exits cleanly with an
error code would otherwise never be restarted, which is precisely the failure this task exists to cover.

`sidtype unrestricted` creates `NT SERVICE\devoid-daemon` in the service's token. That SID is what Task 7's
pipe DACL and any future file ACL name, and getting it in now means those later changes are additive rather
than a re-registration.

The SDDL must grant `SY` and `BA` full control, and `IU`/`SU` **query-status, enumerate-dependents,
interrogate and read-control only**. It must not grant `RP` (start), `WP` (stop), `DT` (pause/continue),
`DC` (change config), `WD` (write DAC) or `SD` (delete) to any non-administrative trustee.

**Blast radius:** highest in the wave. Failure modes, in order of severity:
1. Two daemons at boot -> the second exits and, if it is the service, SCM restart-loops it three times and
   leaves the service in a failed state with event-log noise. **Mitigated three ways**: the supervisor never
   spawns while a healthy daemon answers (Task 2 invariant), `pidFile.Acquire()` at
   `internal/daemon/server.go:854` serialises any genuine race, and the loser's exit is classified by the
   supervisor as success, not failure.
2. `sc create` fails on a locked-down box -> the install must **continue**. `CA_InstallDaemonTask` is
   `Return="ignore"` (`CustomActions.wxs:346`) but `runSetupInstallDaemon` itself calls `os.Exit(1)` on a
   `schtasks /Create` failure (`setup_installer.go:863-866`). The service registration must be strictly
   best-effort in the shape `registerUserAIWireTask` already uses (`:871-884`, "never exits, never prints,
   never returns an error"). **Never make the install fail on the service.**
3. An upgrade over an endpoint that already has the service -> `sc create` returns 1073
   (`ERROR_SERVICE_EXISTS`). Treat 1073 as success and fall through to `sc config` + `sdset`.

**Rollback:** `sc.exe stop devoid-daemon && sc.exe delete devoid-daemon`. This is already what the shipped
uninstall does (`internal/uninstall/uninstall.go:2627-2630`) and what `setup remove-daemon` will do. The
`ONSTART` task is untouched throughout, so removing the service returns the endpoint to exactly today's
behaviour with no gap.

- [ ] Write `TestServiceCreateArgs_Invariants` (pure, ubuntu): `start= auto`, `obj= LocalSystem`, an
      **absolute** `binPath=`, and the name literal `devoid-daemon`. RED.
- [ ] Write `TestServiceNameMatchesTheUninstallInventory`: assert the constant equals an entry in
      `internal/uninstall.windowsDaemonServiceNames()` **and** the `Path` of the
      `windows/svc-devoid-daemon` row in `internal/profilepatch.Manifest()`. A cross-package compile-time
      coupling, the same discipline `serviceUninstallTaskNames` adopted at `cmd/devoid/main.go:2681-2685`.
      This is the test that guarantees no residue.
- [ ] Write `TestServiceFailureArgs_SetsFailureFlag`: the emitted command set contains
      `failureflag devoid-daemon 1`. RED — and this is the one a reviewer will not think to ask for.
- [ ] Write `TestServiceSDDL_DeniesStandardUserControl`: parse the SDDL constant and assert no ACE granting
      `RP|WP|DT|DC|WD|SD` to `IU`, `SU`, `BU`, `WD`(Everyone) or `AU`. Pure string/ACE-table test, ubuntu.
- [ ] Write `TestServiceRegistrationNeverFailsTheInstall`: inject a failing runner; assert
      `runSetupInstallDaemon` still reaches `startDaemonAndWait` and does not call the exit seam.
- [ ] Write `TestServiceExistsIsTreatedAsSuccess`: runner returns exit 1073; assert the flow proceeds to
      `sc config`/`sdset` and reports success.
- [ ] Implement. Register **after** `schtasks /Create` succeeds and **before**
      `registerUserAIWireTask(binDir)` so ordering matches the existing best-effort block.
- [ ] Add `sc stop` + `sc delete devoid-daemon` to `runSetupRemoveDaemon`, symmetric with the create.

**DEFEAT TEST 1 — the install must survive a failed registration.**
Mutation: in `cmd/devoid/setup_installer.go`, change the service-registration call so its error is
propagated to the existing `os.Exit(1)` exit seam.
Command: `go test ./cmd/devoid/... -run 'TestServiceRegistrationNeverFailsTheInstall' -count=1`
Must print: `service registration must be best-effort; install aborted with exit(1)`

**DEFEAT TEST 2 — no residue.**
Mutation: rename the service-name constant in `cmd/devoid/setup_daemon_service.go` from `devoid-daemon`
to `devoid-supervisor`.
Command: `go test ./cmd/devoid/... -run 'TestServiceNameMatchesTheUninstallInventory' -count=1`
Must print: `service name "devoid-supervisor" is not in windowsDaemonServiceNames(); uninstall would leave it behind`

**DEFEAT TEST 3 — the line reviewers do not ask for.**
Mutation: delete the `failureflag` entry from the emitted command set.
Command: `go test ./cmd/devoid/... -run 'TestServiceFailureArgs_SetsFailureFlag' -count=1`
Must print: `missing "failureflag devoid-daemon 1"; SCM would restart on crash only, never on a non-zero exit`

**DEFEAT TEST 4 — a standard user must not be able to control the service.**
Mutation: append `(A;;RPWPDTLOCRRC;;;IU)` to the SDDL constant.
Command: `go test ./cmd/devoid/... -run 'TestServiceSDDL_DeniesStandardUserControl' -count=1`
Must print: `SDDL grants RP|WP|DT to IU; a standard user could stop the security daemon`

**Exit:** on a clean Windows 11 VM, after an MSI install:
1. `sc.exe qc devoid-daemon` shows `START_TYPE : 2 AUTO_START`, `SERVICE_START_NAME : LocalSystem`.
2. `sc.exe qfailure devoid-daemon` shows `RESET_PERIOD : 86400`, three `RESTART` actions, and
   `FAILURE_ACTIONS_ON_NONCRASH_FAILURES : TRUE`.
3. `sc.exe sdshow devoid-daemon` matches the pinned SDDL byte-for-byte.
4. From a standard-user shell, `sc.exe stop devoid-daemon` returns **`Access is denied. (5)`** and
   `sc.exe delete devoid-daemon` returns **`Access is denied. (5)`**.
5. **`Get-Process devoid | Measure-Object` returns exactly 1** after boot. This is the no-second-listener
   number and it is the one that says dual registration did not break anything.

---

## Task 4: Prove external recovery, and make the reconciler and doctor report the service

**Files:**
- `internal/daemon/service_persistence.go` (new — pure `serviceInfo` + `configuredFor`, mirroring
  `internal/daemon/persistence.go:43-86` exactly; **no build tag**)
- `internal/daemon/service_persistence_windows.go` (new — `sc qc`/`qfailure`/`sdshow` query seam)
- `internal/daemon/server.go:2177-2179` and `:2184-2187` (add `s.ensureDaemonService(ctx)` alongside the two
  existing reconcilers)
- `internal/daemon/observed_runtime.go:184-195` (add a `ServiceSupervision` block to
  `ObservedRuntimeSnapshot`, served by the already-token-gated `GET /v1/health/observed`,
  `internal/daemon/server.go:522`)
- `cmd/devoid/doctor_persistence.go` (a second row, built on the same two-state classifier at `:41-51`)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t4 && git fetch origin && git rev-parse origin/main
#   -> 5b12952307db9903fa166d5d9ce1a0c058e0ad77 (or newer)

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence.go' | sed -n '66,86p'
#   -> the configuredFor switch you are mirroring, INCLUDING the !ti.inspected arm

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/persistence.go' | sed -n '143,148p'
#   -> the query-error arm that leaves the task alone

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/server.go' | sed -n '2177,2179p;2185,2188p'
#   -> the two reconciler call blocks you are adding a third call to

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/server.go' | grep -n 'v1/health/observed'
#   -> the route, and it is requireDaemonToken-wrapped. It is a LOOPBACK DAEMON route,
#      not a Backend route.

# Task 3 must already be merged.
MSYS_NO_PATHCONV=1 git log --oneline origin/main -1 -- cmd/devoid/setup_daemon_service.go
#   -> non-empty. If empty, Task 3 has not landed. STOP.
```

**LANDMINES**

- **`GET /v1/health/observed` is a token-gated loopback route served by the daemon and read by
  `devoid doctor` (`cmd/devoid/doctor_observed.go:27-30`). It is not a Backend route.** Adding a field to
  it carries **no** deploy-ordering constraint. Do not invent one, and do not "be safe" by putting the
  field on the heartbeat `controls` block instead — that one *is* Backend-shaped and hits L2's
  drop-unknown-keys landmine.
- **The anti-churn rules from Task 1 apply again here and must be re-pinned, not assumed.** An
  un-inspectable service is `configured`; a query error repairs nothing. A wrong "not configured" verdict
  re-runs `sc config` + `sdset` every 5 minutes as SYSTEM on every endpoint.
- **An omitted block reads as "fine" on every surface.** A daemon with no service must report
  `registered:false`, never omit `serviceSupervision`. That is the exact false-green shape §14 catalogues.
- **This task writes nothing to the machine root** (L1 does not apply).

**DO NOT**

- Do not reintroduce a neutral/unknown third state into the doctor row. `doctor_persistence.go:13-31`
  records why the third state was removed; two states is the decision.
- Do not add the service field to `heartbeat.types.ts` or to the `controls` block.
- Do not make `ensureDaemonService` fail the daemon start. It is a reconciler, not a precondition.

**Blast radius:** the reconciler runs every 5 minutes as SYSTEM. A wrong "not configured" verdict re-applies
`sc config`/`sdset` every tick. The same anti-churn rules as Task 1 apply and must be re-pinned here, not
assumed: an un-inspectable service is `configured` (never churn), and a query error leaves it alone.

Adding a field to `ObservedRuntimeSnapshot` is **agent-local** — that route is read by `devoid doctor`
(`cmd/devoid/doctor_observed.go:27-30`), not by the Backend — so it carries **no deploy-ordering constraint**.
Do not put this on the heartbeat `controls` block instead: that one *is* Backend-shaped and would hit the
`AgentIngestValidationPipe` drop-unknown-keys landmine.

**Rollback:** remove the two `ensureDaemonService` call sites. The package and the route field become inert.

- [ ] Write `TestServicePersistenceConfiguredFor_*` mirroring the Task 1 table: missing service,
      present-but-uninspected (-> configured, no churn), wrong start type, wrong account, missing failure
      actions, missing `failureflag`, wrong SDDL, correct. (`Persistence` in the name is what gets them
      executed — see the naming note under DEFEAT TEST.)
- [ ] Write `TestServicePersistenceQueryErrorLeavesServiceAlone`: a non-nil query error yields no repair and
      no event, exactly as `reconcilePersistence` does at `persistence.go:143-148`.
- [ ] Write `TestServicePersistenceSnapshotCarriesServiceSupervision` asserting the JSON key is present and
      that a daemon with no service reports `registered:false` rather than omitting the block. An omitted
      block reads as "fine" on every surface; that is the exact defect §14 catalogues.
- [ ] Implement query + repair. Repair emits `security.NewBypassEvent("daemon_service_repaired", "high", …)`.
- [ ] Add the doctor row using `persistenceRowKind`'s existing two-state rule (`doctor_persistence.go:33-40`):
      `Err != nil` -> FAIL, `Present` -> PASS, `!Present` -> FAIL. **Do not reintroduce a neutral state** —
      the file explains at `:13-31` why the third state was removed.

**DEFEAT TEST 1 — a query error must never trigger a repair.**
Mutation: in `internal/daemon/service_persistence.go`, delete the `if err != nil { return ... }` arm so a
query error falls through into the repair.
Command: `go test ./internal/daemon/... -run 'TestServicePersistenceQueryErrorLeavesServiceAlone' -count=1`
Must print: `query error must not trigger a repair; got Recreated=true`

**DEFEAT TEST 2 — the anti-churn arm, re-pinned for the service.**
Mutation: delete the `!si.inspected` arm from `serviceInfo.configuredFor`.
Command: `go test ./internal/daemon/... -run 'TestServicePersistenceConfiguredFor_UninspectedServiceIsStillNotChurned' -count=1`
Must print: `got (false, ...), want (true, "present (definition not inspected)")`

**DEFEAT TEST 3 — an absent service must be visible, not omitted.**
Mutation: add `,omitempty` to the `ServiceSupervision` JSON tag on `ObservedRuntimeSnapshot`.
Command: `go test ./internal/daemon/... -run 'TestServicePersistenceSnapshotCarriesServiceSupervision' -count=1`
Must print: `serviceSupervision omitted when no service is registered; an omitted block reads as healthy`

**Naming is load-bearing here.** `pr-checks.yml:213` runs `./internal/daemon/... -run
'OpenAI|Wire|Persistence|TaskInfo'`. A test whose name contains none of those four tokens is compiled and
never executed — an inert test of shape 5 that a reviewer will read as passing. **Every test this task
adds must carry `Persistence` in its name** (e.g.
`TestServicePersistenceConfiguredFor_UninspectedServiceIsStillNotChurned`,
`TestServicePersistenceSnapshotCarriesServiceSupervision`), and you must verify it by running
`go test ./internal/daemon/... -run 'OpenAI|Wire|Persistence|TaskInfo' -count=1 -v | grep <TestName>` and
seeing the test named in the output. Do **not** widen the `-run` filter to make a name fit
(`pr-checks.yml:334-337` explains why an unscoped daemon run is not allowed on the runner).

**Exit — this is the wave's external-recovery proof, and it is a named artifact:**
On a clean VM, from an elevated shell, `taskkill /F /IM devoid.exe` while the daemon holds the port. Record:
1. `GET /health` fails immediately after the kill;
2. `GET /health` returns the five liveness keys again **within 90 seconds, with no user action**;
3. the daemon log carries one `daemon_supervisor_restarted` line;
4. the Backend receives one `daemon_supervisor_restarted` bypass event on the next heartbeat.

**Number: 10 consecutive kill-and-recover cycles, 10 recoveries, 0 requiring user action, p95 recovery
< 90 s.** Save the transcript as `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-external-recovery.txt`.

Second exit, the one that separates a real service from a scheduled task: repeat the kill **with the
`Devoid Daemon` scheduled task deleted first**. Today that is unrecoverable until reboot (the in-process
watchdog cannot run while the process is dead). It must now recover, and the recovery must be attributed to
the service.

---

## Task 5: Extract the de-elevated per-session launcher out of `internal/aicanary`

A pure move. No behaviour change. It exists so Task 6 does not copy 300 lines of hardened
`CreateProcessAsUser` code and create the two-implementations-one-weaker shape this codebase has already paid
for (see `internal/daemon/attest_user_home.go:80-94`, which fixed exactly that).

**Files:**
- `internal/winsession/token_windows.go` (new — from `internal/aicanary/deelevate_windows.go:62-120`,
  `:124-150`: `TargetUserToken`, `ActiveInteractiveSession`, `PrimaryTokenFrom`, `LinkedStandardToken`)
- `internal/winsession/launch_windows.go` (new — from `internal/aicanary/launch_windows.go:175-330`,
  `:340-360`: `StartAsUser`, `UserEnvironmentBlock`)
- `internal/winsession/errors.go` (new, no build tag — typed errors; the **canary-specific refusal-reason
  strings stay in aicanary**, which maps typed errors to `ReasonNoInteractiveSession`,
  `ReasonUserTokenUnavailable`, `ReasonDeElevationFailed`)
- `internal/aicanary/deelevate_windows.go`, `internal/aicanary/launch_windows.go` (delegate)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t5 && git fetch origin && git rev-parse origin/main

# HARD GATE: Wave 6 Task 1 must be merged FIRST. It edits internal/aicanary
# (pipeDrainGrace:53, exec.go:125) and this task's entire exit criterion is
# "0 tests changed status" against a baseline W6 T1 moves.
MSYS_NO_PATHCONV=1 git show 'origin/main:internal/aicanary/exec.go' | sed -n '125p'
MSYS_NO_PATHCONV=1 git log --oneline origin/main -3 -- internal/aicanary/exec.go
#   -> the top commit must be W6 Task 1's. If W6 T1 is not merged, STOP AND REPORT.
#      Baselining before it lands makes the exit criterion meaningless.

# THE BASELINE. Run it on WINDOWS, from a worktree at origin/main, BEFORE any edit.
go test ./internal/aicanary/... -count=1 -v > /c/cwt/w2-t5-baseline.txt 2>&1
grep -c '^--- PASS' /c/cwt/w2-t5-baseline.txt
grep -c '^--- FAIL' /c/cwt/w2-t5-baseline.txt
#   -> record both numbers AND the full list. A refactor verified against an unknown
#      baseline proves nothing.
```

**LANDMINES**

- **`internal/aicanary`'s Windows tests run in NO CI job today.** `internal-candidate.yml:87`'s
  `go test ./...` is ubuntu, where `_windows.go` files are excluded; `cli-entrypoint-tests` runs only
  `./cmd/devoid/...` (`pr-checks.yml:351`). A green CI run says nothing about this refactor. The
  Windows run is the evidence, and adding `./internal/winsession/... ./internal/aicanary/...` to
  `cli-entrypoint-tests` is part of this commit, not a follow-up.
- **The refusal-reason vocabulary is externally visible in canary output.** `ReasonNoInteractiveSession`,
  `ReasonUserTokenUnavailable`, `ReasonDeElevationFailed`, `canary-host-executable-foreign-writable` are
  the strings a console reader sees. A "tidier" name during a move is a silent behaviour change.
- **Every hardening in `launch_windows.go` is load-bearing and the file's own header (`:17-51`) says
  why**: `winsta0\default` named explicitly (`:244`), `CreateEnvironmentBlock` against the *user's* token
  (`:353`), `PROC_THREAD_ATTRIBUTE_HANDLE_LIST` narrowing inheritance to three handles (`:236-242`), the
  kill-on-close job object (`:274-287`), `CREATE_NO_WINDOW` (`:291`). Move them verbatim.
- **`targetUserToken` has no "run it as SYSTEM anyway" fallback** (`deelevate_windows.go:36-37`) and must
  not gain one.
- **This task writes nothing to the machine root** (L1) and **changes no wire contract** (L2).

**DO NOT**

- Do not change behaviour. The only permitted diffs are: package name, exported identifier names, and
  typed-error-out / reason-string-mapped-in-aicanary.
- Do not "improve" an error message, a timeout, or a handle list while moving it.
- Do not skip the baseline because CI is green. CI does not run this package on Windows.
- Do not leave `internal/aicanary` with a second copy of the launcher. Delegation, not duplication —
  `internal/daemon/attest_user_home.go:80-94` records what the two-implementations-one-weaker shape cost.

**Blast radius:** the canary lane. It is currently unproven in the field (source of truth §15.2 — the canary
cannot go green today), so a regression here does not remove a working control; but it **can** turn the
existing `internal/aicanary` Windows tests red, and those are a gate. The refusal-reason vocabulary is
externally visible in canary output and must not change: `ReasonNoInteractiveSession`,
`ReasonUserTokenUnavailable`, `ReasonDeElevationFailed`, `canary-host-executable-foreign-writable`.

`internal/aicanary` Windows tests do **not** run in `pr-checks.yml` (ubuntu `go test ./...` skips
`_windows.go`). This extraction must therefore be verified by an explicit local Windows run, recorded, before
merge. Add `./internal/winsession/...` and `./internal/aicanary/...` to the windows-latest
`cli-entrypoint-tests` job in the same commit.

**Rollback:** the move is one commit and reverts cleanly. Nothing else imports `internal/winsession` until
Task 6, so a revert of Task 6 first, then Task 5, is a clean two-step.

- [ ] Run the **baseline** first, on Windows, from a worktree at `origin/main` **with W6 Task 1 already
      merged** (not the stale local HEAD): `go test ./internal/aicanary/... -count=1 -v`. Record the
      pass/fail set, member for member. A refactor verified against an unknown baseline proves nothing —
      this repo has a written rule about that, and the reconciliation added the W6-T1 ordering because
      the baseline moves under it.
- [ ] Move the functions verbatim. Change only: package name, exported identifiers, and the refusal
      construction (typed error out, reason string mapped in aicanary).
- [ ] Re-run `go test ./internal/aicanary/... -count=1` on Windows. **The pass/fail set must be identical to
      the baseline, member for member.**
- [ ] Add `TestRefusalReasonsUnchangedAfterExtraction` in `internal/aicanary`: a table pinning each typed
      `winsession` error to the exact legacy reason string.
- [ ] Extend `.github/workflows/pr-checks.yml` job `cli-entrypoint-tests` (windows-latest, `:317-351`) with
      `go test ./internal/winsession/... ./internal/aicanary/... -count=1`, and re-run
      `node ci/lib/drift.mjs` so the local mirror stays complete.

**DEFEAT TEST — the externally visible vocabulary cannot drift during a move.**
Mutation: in `internal/aicanary`, change the mapping for `winsession.ErrUserTokenUnavailable` from
`ReasonUserTokenUnavailable` to a new literal `"canary-user-token-missing"`.
Command: `go test ./internal/aicanary/... -run 'TestRefusalReasonsUnchangedAfterExtraction' -count=1`
(on Windows)
Must print: `refusal reason drifted: got "canary-user-token-missing", want "canary-user-token-unavailable"`

**EXIT:** `go test ./internal/aicanary/... -count=1 -v` on Windows produces the **byte-identical** pass/fail
set recorded in the baseline. Verify with a command, not by eye:

```bash
go test ./internal/aicanary/... -count=1 -v > /c/cwt/w2-t5-after.txt 2>&1
diff <(grep -E '^--- (PASS|FAIL|SKIP)' /c/cwt/w2-t5-baseline.txt | sort) \
     <(grep -E '^--- (PASS|FAIL|SKIP)' /c/cwt/w2-t5-after.txt    | sort)
#   -> EMPTY. Number: 0 tests changed status.
```

Save both transcripts as `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t5-aicanary-baseline.txt` and
`...-after.txt`. Diff is a pure move: `git diff --stat` shows no net new logic lines outside `errors.go`.

---

## Task 6: Launch a per-session broker at session connect, and measure the unwired window

This task **closes the window mechanically and measures it. It does not refuse anything.** The refusal is
Task 6b below, and it is deliberately gated on this task's number.

**It also writes nothing new to disk.** The first draft of this task invented a
`<machineRoot>\sessions\<userSID>\broker-ready` stamp; the 2026-08-28 reconciliation struck it on two
independent grounds — it would have been an unallowlisted machine-root entry (R1), and W7 Task 5 owns
readiness off the **existing** durable reconcile stamp with the rule "do not invent a second stamp; two
stamps is how this codebase grows a false green" (C4). **The broker already writes that stamp today, with
no code change**, and the chain is worth reading before you start:

`devoid-daemon.exe ai reconcile` → `childArgs` (`cmd/devoid-daemon/main_windows.go:36-44`) →
`devoid.exe ai reconcile` → `runAIReconcile` (`cmd/devoid/ai_wire_user_task.go:145`) →
`maybeReconcileAIWireUserContext(home)` (`:185`) → `touchAIWireRetryStamp(userHome)`
(`cmd/devoid/ai_wire_retry.go:131`) → writes **`<userHome>\.devoid\aiwire-last-reconcile`**
(`aiWireRetryStampName`, `:65`; path helper `:71-72`).

So the readiness signal is a **user-home** file that already exists, not a machine-root file that would
have to be allowlisted. This task's only job is to make the launch happen at session connect instead of
sixty seconds later.

**Files:**
- `internal/daemon/session_watch.go` (new, no build tag — the pure decision: given a set of observed sessions
  and a set of brokers already launched, which sessions need a broker)
- `internal/daemon/session_watch_windows.go` (new — `WTSEnumerateSessions` poll; delegates the launch to
  `internal/winsession`)
- `internal/daemon/session_watch_other.go` (new — no-op stub, matching the `persistence_other.go` pattern)
- `internal/daemon/server.go:2177-2179`, `:2184-2187` (start the watcher beside the existing reconcilers)
- `internal/daemon/observed_runtime.go` (add `SessionBrokers` to `ObservedRuntimeSnapshot`)
- `cmd/devoid/ai_reconcile*.go` (the broker verb is the **existing** `devoid-daemon.exe ai reconcile` —
  `internal/aiwiretask/aiwiretask.go:150`, `:154`. Do not invent a new verb.)
- `internal/aiwiretask/aiwiretask.go` — **unchanged.** `LogonDelay` stays `PT1M` (`:178`).
- `cmd/devoid/ai_wire_retry.go` — **unchanged.** The stamp it already writes is the readiness signal.
- **No file under `%ProgramData%\devoid`.** This task creates no machine-root entry, so the MSI root
  guard is not touched. See PRECONDITIONS for the check that proves it.

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t6 && git fetch origin && git rev-parse origin/main

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid/ai_wire_retry.go' | sed -n '62,72p'
#   -> aiWireRetryStampName = "aiwire-last-reconcile", under <userHome>/.devoid

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid/ai_wire_user_task.go' | sed -n '185p'
#   -> maybeReconcileAIWireUserContext(home)   <- the broker verb already touches the stamp

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/aiwiretask/aiwiretask.go' | sed -n '241,262p'
#   -> ValidateExe: absolute, inside <machineRoot>\bin, existing file. REUSE THIS.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/attest_user_home.go' | sed -n '67,78p'
#   -> the MachineService gate you must reuse

# Task 5 must already be merged (internal/winsession is what performs the launch).
MSYS_NO_PATHCONV=1 git log --oneline origin/main -1 -- internal/winsession/launch_windows.go
#   -> non-empty. If empty, Task 5 has not landed. STOP.

# THE MACHINE-ROOT CHECK. Run this on your finished branch before committing:
git diff origin/main --unified=0 | grep -nE 'sessions|MachineRoot|ProgramData|machineRoot'
#   -> EMPTY. If it is not empty, this task has grown a machine-root writer and
#      LANDMINE L1 now applies: STOP AND REPORT rather than adding the guard entry here.
```

**LANDMINES**

- **L1 applies the moment this task writes anything under `%ProgramData%\devoid`.** It must not. If a
  reviewer or a later revision reintroduces a machine-root stamp, the `boundaryChildNames` /
  `createBoundaryChildren` / `boundaryChildRead` edit in `cmd/devoid-msi-root-guard/guard_windows.go`
  moves into **this** commit, and W7 Task 6 must land first. Otherwise: 1722 → 1603 → the upgrade rolls
  back on every enrolled endpoint, while every clean-box test stays green.
- **`touchAIWireRetryStamp` writes the stamp BEFORE the reconcile runs** (`ai_wire_retry.go:87-91` says
  so explicitly, so a persistently failing box retries on the interval rather than on every invocation).
  The stamp therefore means **"attempted at T"**, not "succeeded at T". That is the safe direction for
  Task 6b — a failed reconcile leaves a *fresh* stamp, which makes the gate **proceed** — and you must
  not "fix" it into a success stamp. Doing so arms a refusal on a failure path, which is L3.
- **The per-user scheduled task is the belt and stays exactly as it is.** `LogonDelay` `PT1M` exists for a
  reason written in place (`aiwiretask.go:172-177`). Removing or shortening it to make this task's number
  look better is weakening an existing guard to fit a task (L4).
- **A double-fire is already a no-op.** The 15-minute durable throttle (`aiWireRetryInterval`, `:60`) and
  `MultipleInstancesPolicy=IgnoreNew` (`aiwiretask.go:111-126`) serialise the two lanes. That existing
  concurrency argument is what makes adding a second launcher safe; do not add a third mechanism.
- **The daemon runs as SYSTEM in session 0 and must never write into a user profile** (RA-3,
  `internal/daemon/attest_user_home.go:49-78`). The broker writes the stamp **as the user**, in its own
  home, which is exactly what the shim already does. The daemon's only act is the launch.
- **This task changes no wire contract** (L2 does not apply); `sessionBrokers` goes on the loopback
  `GET /v1/health/observed`, not on the heartbeat.

**DO NOT**

- Do not write any file, of any kind, under `%ProgramData%\devoid`. Not a stamp, not a lock, not a marker.
  If the task appears to need one, **STOP AND REPORT** — the guard edit and W7 Task 6's ordering come with
  it, and this task is not where that belongs.
- Do not invent a new broker verb. It is the existing `devoid-daemon.exe ai reconcile`
  (`internal/aiwiretask/aiwiretask.go:150`, `:154`).
- Do not touch `internal/aiwiretask/aiwiretask.go` at all — not `LogonDelay`, not `RepeatInterval`, not
  `ExecutionTimeLimit`.
- Do not relaunch a broker that exited. The `PT5M` per-user task is the repeat mechanism; a second one is
  a relaunch loop in every user's session.
- Do not write a second executable-path pin. `aiwiretask.ValidateExe` is the pin.
- Do not launch into session 0, and do not launch on a per-user install.

**Why the per-user task is not touched:** it is the belt. Removing or shortening its delay would weaken an
existing guard to make this task fit, which is forbidden, and its `PT1M` exists for a stated reason
(`:172-177`). The daemon-driven launch is the braces. Both write the same reconcile, and the two are already
serialised by the 15-minute durable stamp and by `MultipleInstancesPolicy=IgnoreNew`
(`aiwiretask.go:111-126`), so a double-fire is a stat-and-return no-op. That existing concurrency argument is
the reason this is safe to add.

**Blast radius:** the daemon would now start a process in each interactive user's session. If the launch is
wrong, every logged-on user sees a console window, or a runaway process, on every poll. Bounds that must be in
the first commit, not added later:
- launch **at most once per (session id, logon SID, boot id)**, tracked in memory; a broker that exits is not
  relaunched by this watcher (the `PT5M` per-user task remains the repeat mechanism);
- the child inherits the kill-on-close job object from `winsession.StartAsUser`
  (`internal/aicanary/launch_windows.go:274-287`) — nothing it spawns escapes;
- `CREATE_NO_WINDOW` is already set (`:291`) and `hideOwnConsoleWindow`
  (`cmd/devoid/ai_wire_user_task_windows.go:33-57`) already covers the console case;
- the launched path is pinned by the **existing** `aiwiretask.ValidateExe`
  (`internal/aiwiretask/aiwiretask.go:241-262`) — absolute, inside `<machineRoot>\bin`, existing file. Reuse
  it; do not write a second pin.

**Rollback:** remove the watcher's two call sites in `server.go`. The per-user scheduled task is untouched and
the endpoint returns to today's behaviour exactly.

- [ ] Write `TestSessionWatch_LaunchesOncePerSession` (pure, ubuntu): the same session observed on ten
      consecutive polls yields one launch.
- [ ] Write `TestSessionWatch_NeverLaunchesForSessionZero`: session 0 is never a target, matching
      `activeInteractiveSession`'s existing rule (`internal/aicanary/deelevate_windows.go:88-90`).
- [ ] Write `TestSessionWatch_RelaunchesAfterSessionIdReuse`: a session id that disconnects and reappears
      with a **different** logon SID is a new target. Session-id reuse is real, and keying on the id alone is
      how a second user gets no broker.
- [ ] Write `TestSessionWatch_IsANoOpOnAPerUserInstall`: gated on `daemonUserContext().MachineService`
      (`internal/daemon/attest_user_home.go:67-78`), the same gate `ensureUserAIWireTask` already uses
      (`internal/daemon/user_ai_wire_task.go:89`). A per-user daemon already does this work in-process.
- [ ] Implement the Windows poll (10 s interval) and the launch through `internal/winsession`. Resolve the
      launched path with `aiwiretask.ExePathFor(machineRoot)` and validate it with
      `aiwiretask.ValidateExe(runtime.GOOS, exePath, machineRoot)` (`:241-262`). **Reuse; do not write a
      second pin.** A `ValidateExe` failure is a refusal to launch, recorded — never a fallback to some
      other path.
- [ ] **Write no readiness stamp.** The broker's completion is already recorded, as the user, in
      `<userHome>\.devoid\aiwire-last-reconcile` by `touchAIWireRetryStamp`
      (`cmd/devoid/ai_wire_retry.go:131`), reached through
      `runAIReconcile → maybeReconcileAIWireUserContext` (`cmd/devoid/ai_wire_user_task.go:185`). W7 Task 5
      computes readiness from that one stamp and Task 6b reads W7 T5's computation. Adding a second stamp
      is explicitly struck (RECONCILIATION C4) and would also be an unallowlisted machine-root entry (R1).
- [ ] Add `TestSessionWatch_WritesNothingUnderTheMachineRoot`: run the watcher's decision + launch path
      against a fake machine root in `t.TempDir()` and assert the directory listing is **byte-identical**
      before and after. This is the executable form of the machine-root check in PRECONDITIONS, and it is
      what stops a later revision from quietly reintroducing the brick.
- [ ] Record, per session, `sessionConnectedAt` and the mtime of the user's
      `aiwire-last-reconcile` stamp after the launch, and surface the delta on
      `GET /v1/health/observed` as `sessionBrokers[].unwiredWindowMs`. Read the stamp **through the same
      helper W7 Task 5 uses**, not with a hand-rolled `filepath.Join` — one reader, one meaning.

**DEFEAT TEST 1 — one launch per session, not one per poll.**
Mutation: delete the launched-set bookkeeping from `internal/daemon/session_watch.go`.
Command: `go test ./internal/daemon/... -run 'TestSessionWatch_LaunchesOncePerSession' -count=1`
Must print: `want 1 launch, got 10`

**DEFEAT TEST 2 — a per-user install must not launch a broker.**
Mutation: delete the `daemonUserContext().MachineService` gate from the watcher.
Command: `go test ./internal/daemon/... -run 'TestSessionWatch_IsANoOpOnAPerUserInstall' -count=1`
Must print: `per-user install must not launch a broker; got 1 launch`

**DEFEAT TEST 3 — the machine-root brick, encoded. This is the one that matters.**
Mutation: in the watcher, write a zero-byte file to
`filepath.Join(machineRoot, "sessions", userSID, "broker-ready")` on launch.
Command: `go test ./internal/daemon/... -run 'TestSessionWatch_WritesNothingUnderTheMachineRoot' -count=1`
Must print: `machine root gained entry "sessions"; it is not in boundaryChildNames (guard_windows.go:624) and the next MSI operation dies 1722 -> 1603`

**Naming note:** none of these three names contains `OpenAI|Wire|Persistence|TaskInfo`, so
`pr-checks.yml:213` will **not** run them. Add `SessionWatch` coverage to the windows-latest
`cli-entrypoint-tests` job, or name the tests so the existing filter catches them, and prove it with
`go test ./internal/daemon/... -run '<filter>' -count=1 -v | grep TestSessionWatch`. A compiled test that
is never executed is inert-shape 5.

**EXIT — a number, and it is the input to Task 6b:** on a clean VM with the agent installed, 20 logon
cycles (log off, log on, immediately run `devoid ai hooks-status claude-code`). Record
`unwiredWindowMs` for each:

```powershell
$t = Get-Content "$env:ProgramData\devoid\daemon-token" -Raw
(Invoke-RestMethod -Uri http://127.0.0.1:19280/v1/health/observed `
   -Headers @{Authorization="Bearer $($t.Trim())"}).sessionBrokers |
   Select-Object sessionId, unwiredWindowMs
```

**p95 < 2000 ms and max < 5000 ms**, against a measured baseline of ~60 000 ms today — and measure that
baseline on the *pre-change* build in the same 20-cycle harness rather than quoting it. Save both series as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-logon-window.csv` with exactly these columns, in this order —
Task 6b's precondition parses them: `build,cycle,unwiredWindowMs`, where `build` is `before` or `after`.

---

## Task 6b: Refuse a managed runtime launch inside a *provable* unwired window

**This task does not start until Task 6's measured p95 is under 2000 ms.** That ordering is not
bureaucratic. A fail-closed checkpoint on an unprovable condition bricked a machine in July 2026 and the
operator removed the agent, and an uninstalled control protects nobody. The condition below is only provable
once the window is measured and small.

**Files:**
- `cmd/devoid/ai_hook_runner.go` (the launch checkpoint), `cmd/devoid/ai_failure_resolver.go`
- `internal/airuntime/runner.go` (reason plumbing — reuses the **existing** closed vocabulary)

**The condition that makes the refusal provable.** All **five** must hold, locally, with no network:

1. `config.IsSystemInstall()` is true (`internal/core/config/config.go:654-658`) — a machine-scope install;
2. the daemon answers `GET /health` with the `daemon: devoid` marker — so this is *not* the dead-daemon
   case, which keeps its existing behaviour untouched;
3. **W7 Task 5's readiness computation returns `INSTALLED_NOT_READY` with reason `ai-lane-not-yet-wired`
   for this user** — i.e. the durable reconcile stamp `<userHome>\.devoid\aiwire-last-reconcile`
   (`cmd/devoid/ai_wire_retry.go:65`, `:71-72`) is **absent**. Call W7 T5's function; do not re-stat the
   file and do not derive a second predicate from it;
4. more than `graceMs` has elapsed since session connect, where `graceMs = 5 × the measured p95` from Task 6
   (i.e. 10 s at the exit number above), read from a constant, not a config;
5. **the machine-root payload this gate depends on verifies**:
   `aiwiretask.ValidateExe(runtime.GOOS, aiwiretask.ExePathFor(machineRoot), machineRoot)` returns nil —
   absolute path, inside `<machineRoot>\bin`, existing file (`internal/aiwiretask/aiwiretask.go:241-262`).

**Condition 3 changed, and the change matters.** The first draft read *"no `broker-ready` stamp, or its
`readyAt` is older than the current session's connect time"*. That is wrong twice over: the stamp it named
does not exist (RECONCILIATION C4/R1 struck it), and "older than session connect" is the wrong predicate
for a **durable** stamp. AI wiring is written into the user's profile and survives a logoff, so a user who
logs off and back on inside fifteen minutes has a correctly wired profile and a stamp that is necessarily
older than the new session — and the first draft would have refused that launch. The right predicate is
**absent**: this user's profile has never been reconciled at all, which is precisely the first-ever-logon
exposure this wave set out to close.

**Condition 5 is the R2 fix, and it inverts the first draft's worst exit criterion.** The draft demanded
"100% refusals in a synthetic run where the broker binary is renamed away." On a real endpoint a renamed
or missing broker binary is a **partially-failed upgrade or an AV quarantine** — so the field's most
likely failure was the one the gate punished hardest, by refusing *every* AI runtime launch on that box.
With condition 5, a payload that does not verify means **proceed and record**, and the refusal is scoped
to the case it was designed for: a healthy daemon, an intact payload, and a user lane that has genuinely
never been wired.

If any of the five cannot be established, **proceed exactly as today**. "Cannot establish" must never mean
"refuse" here.

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t6b && git fetch origin && git rev-parse origin/main

# GATE 1: Task 6's measured p95 must exist and be under 2000 ms.
# CSV columns are build,cycle,unwiredWindowMs — Task 6's exit fixes that order.
awk -F, 'NR>1 && $1=="after" {print $3}' C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-logon-window.csv | sort -n | \
  awk '{a[NR]=$1} END{print "n=" NR " p95=" a[int(NR*0.95)] " max=" a[NR]}'
#   -> n=20, p95 < 2000 and max < 5000. If the file does not exist, or n < 20, Task 6 is
#      not done: STOP AND REPORT. Do not estimate a p95 from a shorter run.

# GATE 2: W7 Task 5 must be merged — condition 3 CALLS its readiness computation.
MSYS_NO_PATHCONV=1 git grep -n 'ai-lane-not-yet-wired' origin/main -- internal/ cmd/
#   -> non-empty. If empty, W7 T5 has not landed. STOP AND REPORT; do not re-derive readiness here.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/airuntime/undecidable.go' | sed -n '64,79p'
#   -> the CLOSED bucket vocabulary. You are adding NOTHING to it.

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid/ai_failure_resolver.go' | sed -n '284,296p'
#   -> ungovernedCheckpointNotice(): the message shape to extend, not rewrite
```

**Blast radius:** this is the only new fail-closed branch in the wave, and it can stop a developer's agent
from starting. Guard rails that are part of the task, not follow-ups:
- the refusal is scoped to the **AI runtime launch checkpoint only**. It must not touch the package-install
  gate, the git hooks, or the pre-push gate. A user who cannot `npm install` uninstalls the product.
- the refusal message names the remedy and the exact stamp path, in the shape
  `ungovernedCheckpointNotice()` already uses (`cmd/devoid/ai_failure_resolver.go:284-296`);
- there is **no new undecidable bucket**. `internal/airuntime/undecidable.go:68-79` documents the vocabulary
  as closed, append-only, and pinned to a Backend-facing wire name. A new bucket needs the Backend deployed
  first. Reuse an existing reason and carry the detail on a bypass event instead.

**LANDMINES**

- **L3 is this task.** A fail-closed branch on a condition that cannot be proven at runtime bricked a
  machine in July 2026 and the operator uninstalled the agent. Every one of the five conditions is a local
  check with no network and no clock skew across boxes. If you find yourself refusing because something
  could not be determined, the branch is inverted.
- **A renamed or missing broker binary is a partly-failed upgrade or an AV quarantine, not an attack.**
  Condition 5 exists so that case proceeds. Do not "harden" it into a refusal.
- **The stamp means *attempted*, not *succeeded*** (`cmd/devoid/ai_wire_retry.go:87-91`). A fresh stamp on
  a box whose reconcile failed makes this gate **proceed**. That is deliberate; changing the stamp's
  semantics to make the gate stricter arms a refusal on a failure path.
- **The undecidable-bucket vocabulary is closed and Backend-pinned**
  (`internal/airuntime/undecidable.go:68-79`, pinned by
  `TestUndecidableWireNamesAreTheClosedBucketVocabulary`,
  `internal/controls/undecidable_shape_test.go:120`). Adding a bucket here is L2: the agent would believe
  it reported it and nothing would arrive. Reuse an existing reason and carry the detail on a bypass event.
- **This task writes nothing to the machine root** (L1 does not apply).

**DO NOT**

- Do not extend the refusal beyond the AI runtime launch checkpoint. Not the package-install gate, not the
  git hooks, not the pre-push gate. A user who cannot `npm install` uninstalls the product.
- Do not add a member to `UndecidableBuckets`.
- Do not make the gate consult the network, the Backend, or a policy fetch. Five local conditions.
- Do not re-derive readiness from the stamp; call W7 Task 5's computation.
- Do not begin this task at all until Task 6's p95 is measured and under 2000 ms (PRECONDITIONS, GATE 1).

**Rollback:** one constant, `sessionBrokerRefusalEnabled`. It is **not** a feature flag on new functionality
(the product ships features ON); it is a kill switch on a **refusal**, which is the one thing an operator must
be able to stand down without a release. Say so in the code comment, or a reviewer will correctly flag it.

- [ ] Write `TestLaunchGate_ProceedsWhenTheDaemonIsDead`: condition 2 false -> proceed. **Write this one
      first.** It is the July-2026 brick, encoded.
- [ ] Write `TestLaunchGate_ProceedsWhenThePayloadDoesNotVerify`: condition 5 false — `ValidateExe` returns
      an error because the broker exe is absent or outside `<machineRoot>\bin` -> **proceed**, and record
      the distinct cause. **Write this one second.** It is the R2 fix and it is the field's most likely
      failure.
- [ ] Write `TestLaunchGate_ProceedsInsideTheGrace`: condition 4 false -> proceed.
- [ ] Write `TestLaunchGate_ProceedsOnAPerUserInstall`: condition 1 false -> proceed.
- [ ] Write `TestLaunchGate_ProceedsWhenTheStampIsPresentButOlderThanThisSession`: the durable stamp exists
      and predates session connect -> **proceed**. This is the logoff/logon-inside-fifteen-minutes case;
      the first draft would have refused it.
- [ ] Write `TestLaunchGate_ProceedsWhenTheStampIsUnreadable`: an unreadable stamp is not an absent stamp ->
      proceed, and record the distinct cause. This is `ReadTokenDetailed`'s `TokenUnreadable` lesson
      (`internal/daemon/daemon_auth.go:128-135`, `:196-197`) applied to a new file.
- [ ] Write `TestLaunchGate_RefusesOnlyWithAllFiveConditions` — the single RED-to-GREEN case. Table-drive it
      over all 32 combinations and assert exactly one refuses.
- [ ] Write `TestLaunchGate_DoesNotTouchThePackageGate`: assert the package-install path's outcome is
      byte-identical with the gate armed and disarmed.

**DEFEAT TEST 1 — the July-2026 brick, encoded.**
Mutation: remove condition 2 (`daemon answers /health`) from the conjunction in
`cmd/devoid/ai_hook_runner.go`.
Command: `go test ./cmd/devoid/... -run 'TestLaunchGate_ProceedsWhenTheDaemonIsDead' -count=1`
Must print: `dead daemon must proceed, got refuse (this is the July-2026 brick)`

**DEFEAT TEST 2 — the R2 fix.**
Mutation: remove condition 5 (`ValidateExe` verifies) from the conjunction.
Command: `go test ./cmd/devoid/... -run 'TestLaunchGate_ProceedsWhenThePayloadDoesNotVerify' -count=1`
Must print: `unverifiable machine payload must proceed, got refuse; a renamed broker exe is a failed upgrade or an AV quarantine, not a bypass`

**DEFEAT TEST 3 — the durable-stamp predicate.**
Mutation: change condition 3 from "stamp absent" to "stamp absent OR older than session connect".
Command: `go test ./cmd/devoid/... -run 'TestLaunchGate_ProceedsWhenTheStampIsPresentButOlderThanThisSession' -count=1`
Must print: `a wired profile that logged off and back on must proceed, got refuse`

**DEFEAT TEST 4 — the vocabulary stays closed.**
Mutation: append a `BucketSessionBrokerUnready` to `airuntime.UndecidableBuckets`.
Command: `go test ./internal/controls/... -run 'TestUndecidableWireNamesAreTheClosedBucketVocabulary' -count=1`
Must print: the existing test's own message naming the added bucket. **This is an existing test; do not
write a new one.**

**EXIT:** 200 scripted logon-and-launch cycles on the VM matrix, four arms:

| Arm | Setup | Required result |
|---|---|---|
| healthy | daemon up, profile wired | **0 refusals** |
| daemon dead | `taskkill /F /IM devoid.exe` before launch | **0 refusals** |
| payload broken | rename `<machineRoot>\bin\devoid-daemon.exe` | **0 refusals**, and one recorded `payload-unverified` cause per launch |
| genuinely unwired | fresh profile, first-ever logon, broker launch suppressed | **100% refusals** |

The third row is the R2 change and it is the row a reviewer must see. Save all four series as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-launch-gate.csv` with an `arm` column.

---

## Task 7: A per-session authentication pipe with an explicit DACL and kernel-verified client identity

The strategy asks for named-pipe IPC replacing loopback HTTP. **Migrating 40 token-gated routes off HTTP is
not a safe change**, and the provider gateway must stay HTTP because it speaks a vendor protocol (the strategy
says so itself). The strongest safe subset is a **single-purpose authentication pipe**: one pipe, one message,
no route migration. It gives the property the shared bearer cannot — an identity the kernel vouched for —
and it leaves every existing route working unchanged.

**Files:**
- `internal/sessionauth/protocol.go` (new, no build tag — the request/response shape, bounded message size,
  schema version, and the pure authorisation decision)
- `internal/sessionauth/protocol_test.go` (new, no build tag — ubuntu)
- `internal/sessionauth/pipe_windows.go` (new — `CreateNamedPipe` with an explicit `SecurityAttributes`,
  `ConnectNamedPipe`, `ImpersonateNamedPipeClient` + `OpenThreadToken` + `RevertToSelf`,
  `GetNamedPipeClientProcessId`)
- `internal/sessionauth/pipe_other.go` (new — stub)
- `internal/daemon/server.go` (start the pipe listener beside the HTTP listener)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t7 && git fetch origin && git rev-parse origin/main

grep -n 'func SecurityDescriptorFromString' \
  "$(go env GOMODCACHE)/golang.org/x/sys@v0.38.0/windows/security_windows.go"
#   -> 1418:func SecurityDescriptorFromString(...)   (verified 2026-08-28; no LazyDLL needed here)

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/aicanary/deelevate_windows.go' | sed -n '41p;88,90p'
#   -> serviceAccountSIDs (S-1-5-18/19/20) and the session-0-is-never-a-candidate rule.
#      Task 5 moved these to internal/winsession. ONE list, ONE answer.

# Task 5 must already be merged.
MSYS_NO_PATHCONV=1 git log --oneline origin/main -1 -- internal/winsession/token_windows.go
#   -> non-empty. If empty, Task 5 has not landed. STOP.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/pathwatcher/watch_windows.go' | sed -n '158p'
#   -> the house NewLazySystemDLL pattern for APIs x/sys does not generate
#      (ImpersonateNamedPipeClient, GetNamedPipeClientProcessId)
```

**LANDMINES**

- **A named pipe is not a filesystem path.** `\\.\pipe\devoid-session-auth` lives in the NPFS namespace,
  not under `%ProgramData%\devoid`, so L1 does not apply — **provided** you do not also drop a socket
  file, a lock file or a name-registry file into the machine root. If you do, L1 applies in full.
- **Never accept the default named-pipe security descriptor.** Microsoft documents it as granting read
  access broadly. Build it from SDDL, explicitly, and pass it in `SECURITY_ATTRIBUTES` on the *first*
  `CreateNamedPipe` call.
- **`FILE_FLAG_FIRST_PIPE_INSTANCE` is not optional.** Without it a process that starts before the daemon
  creates the name first and impersonates the server. Pair it with `PIPE_REJECT_REMOTE_CLIENTS`.
- **A leaked impersonation on a SYSTEM thread is a privilege bug, not a leak.** `RevertToSelf` goes in a
  `defer`, unconditionally, on every path including panics.
- **The `AU` mask must not carry `FILE_CREATE_PIPE_INSTANCE` (0x0004).** One wrong hex digit turns a
  hardened pipe into a squattable one, and a string constant is exactly how that ships.
- **This task changes no wire contract** (L2 does not apply) — the pipe is on-box only.

**DO NOT**

- Do not migrate any of the 40 `requireDaemonToken` HTTP routes onto the pipe. One pipe, one message.
- Do not gate on the client image path in this wave. Recording it is the deliverable; gating on a
  signature the product does not always have (`bootstrap_trust_chain=FALSE`) is the July-2026 brick shape.
- Do not trust any identity the client sends. The user SID, logon SID and session id come from
  `ImpersonateNamedPipeClient` + `OpenThreadToken` and nowhere else.
- Do not remove the 4 KiB cap, the one-message-per-connection rule, the 2 s connection deadline or the
  32-instance ceiling to "make testing easier".

**Pipe name:** `\\.\pipe\devoid-session-auth`.

**Pipe DACL — explicit, never the default.** Microsoft documents the default descriptor as granting read
access broadly; the strategy calls out "default named-pipe security descriptors" as a thing to avoid. Build the
`SECURITY_DESCRIPTOR` from SDDL with `windows.SecurityDescriptorFromString`
(present at `golang.org/x/sys@v0.38.0/windows/security_windows.go:1418`, so no LazyDLL needed for this part):

```
O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x0012019b;;;AU)
```

SYSTEM and Administrators full; `AU` (Authenticated Users) gets read/write/sync on the pipe **instance only** —
enough to connect and exchange one message, not to create a new instance of the pipe name. Combined with
`PIPE_REJECT_REMOTE_CLIENTS` and `FILE_FLAG_FIRST_PIPE_INSTANCE`, that closes the pipe-squatting shape.
`FILE_FLAG_FIRST_PIPE_INSTANCE` matters: without it a process that starts before the daemon can create the
name first and impersonate the server.

**The handshake:**
1. Client connects and writes `{"v":1,"op":"session-token"}` — bounded at 4 KiB.
2. Server calls `ImpersonateNamedPipeClient`, opens the thread token, reads the **user SID**, the **logon SID**
   and the session id, then `RevertToSelf`. **This is the whole point: none of it is client-supplied.**
3. Server also reads `GetNamedPipeClientProcessId` and resolves the client image path, so a privileged
   operation can later require a signed known image. (This wave only *records* the path; it does not gate on
   it — see the exclusions.)
4. Server returns `{"v":1,"token":"<hex>","sessionId":N,"expiresAt":"…"}`.

**Blast radius:** a new listening endpoint in the SYSTEM daemon. If the pipe server has a parsing bug, a
standard user can reach it. Bounds in the first commit: 4 KiB message cap, one message per connection,
connection deadline 2 s, at most 32 concurrent instances, `RevertToSelf` in a `defer` on every path (a leaked
impersonation on a SYSTEM thread is a privilege bug, not a leak), and the parser is the pure `internal/sessionauth`
code tested on ubuntu with fuzz-shaped inputs.

**Rollback:** do not start the listener. The package becomes inert; no client depends on it until Task 8.

- [ ] Write `TestProtocol_RejectsOversizeMessage`, `TestProtocol_RejectsUnknownVersion`,
      `TestProtocol_RejectsTrailingBytes` (pure, ubuntu). RED first.
- [ ] Write `TestAuthorize_RefusesSessionZero` and `TestAuthorize_RefusesAServiceAccountSID` — reuse the
      `serviceAccountSIDs` list already in `internal/aicanary/deelevate_windows.go:41`
      (S-1-5-18/19/20), moved to `internal/winsession` by Task 5. One list, one answer.
- [ ] Write `TestPipeSDDL_GrantsNoCreateToAuthenticatedUsers`: parse the SDDL and assert the `AU` mask has no
      `FILE_CREATE_PIPE_INSTANCE` (0x0004) bit. This is the one bit that turns a hardened pipe into a
      squattable one, and a string constant with a wrong hex digit is exactly how it would ship.
- [ ] Implement the Windows server. `RevertToSelf` in a `defer`, unconditionally.
- [ ] Add `TestPipeServerRevertsImpersonationOnEveryPath` (Windows): a table over success, parse error,
      write error, and deadline, asserting the thread token is the process token afterwards.

**DEFEAT TEST 1 — the one bit that turns a hardened pipe into a squattable one.**
Mutation: in `internal/sessionauth/protocol.go`, change the `AU` mask in the SDDL constant from
`0x0012019b` to `0x0012019f`.
Command: `go test ./internal/sessionauth/... -run 'TestPipeSDDL_GrantsNoCreateToAuthenticatedUsers' -count=1`
(runs on ubuntu — no build tag)
Must print: `AU mask grants FILE_CREATE_PIPE_INSTANCE (0x4); a standard user could squat the pipe name`

**DEFEAT TEST 2 — impersonation must never outlive the handler.**
Mutation: delete the `defer windows.RevertToSelf()` from the connection handler in
`internal/sessionauth/pipe_windows.go`.
Command: `go test ./internal/sessionauth/... -run 'TestPipeServerRevertsImpersonationOnEveryPath' -count=1`
(on Windows)
Must print: `thread is still impersonating after handler return`

**DEFEAT TEST 3 — the parser must refuse what it cannot bound.**
Mutation: remove the 4 KiB cap from the read loop.
Command: `go test ./internal/sessionauth/... -run 'TestProtocol_RejectsOversizeMessage' -count=1`
Must print: `4 KiB cap removed; a standard user can drive unbounded allocation in the SYSTEM daemon`

`internal/sessionauth` is a new package and is named by **no** CI job. Add
`go test ./internal/sessionauth/...` to the ubuntu `wire-lane-tests` job for the pure half and to the
windows-latest `cli-entrypoint-tests` job for the `_windows.go` half, **in this commit**, then re-run
`node ci/lib/drift.mjs` so the local Docker mirror stays complete.

**EXIT:** named artifact — from two simultaneous interactive sessions (users A and B) on one box, each
opening the pipe returns a token whose recorded `sessionId` and user SID match that caller. Run in each
session:

```powershell
whoami /user
$p = new-object System.IO.Pipes.NamedPipeClientStream('.','devoid-session-auth','InOut')
$p.Connect(2000)
$w = new-object System.IO.StreamWriter($p); $w.AutoFlush = $true
$w.Write('{"v":1,"op":"session-token"}')
(new-object System.IO.StreamReader($p)).ReadToEnd()
#   -> {"v":1,"token":"...","sessionId":N,"expiresAt":"..."} with N and the SID matching whoami
```

**Numbers: 2 handshakes, 2 distinct tokens, 0 cross-attribution.** Also assert the descriptor on the live
pipe, not only the constant:

```powershell
(Get-Acl \\.\pipe\devoid-session-auth).Sddl
#   -> matches the pinned SDDL; the AU mask contains no 0x4 bit
```

Save both transcripts as `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t7-pipe-identity.txt`.

---

## Task 8: Issue per-session tokens, and make every client resolve session-first

> **THIS IS THE ONLY TASK IN WAVE 2 THAT WRITES A NEW NAME INTO THE MACHINE ROOT.** Read LANDMINE L1 at
> the top of this file, then read the guard section under "What exists today", then read this task's
> PRECONDITIONS. The guard edit is part of **this commit**. Shipping the writer without it is
> 1722 → 1603 → the upgrade rolls back on every enrolled endpoint, while every clean-box test in CI stays
> green. That has already happened three times on this codebase.

**Files:**
- `internal/core/config/session_token.go` (new — **the exported constant `SessionsDirName = "sessions"`
  and `SessionDaemonTokenPath(userSID string) (string, error)`**. The name lives here, not in the daemon,
  for one reason: W7 Task 6's `TestGuardAllowlistCoversEveryMachineRootWriter` enumerates the **exported
  `internal/core/config` constants** that name machine-root children — the same source
  `TestEndpointIdentityFileNameMatchesConfig` (`guard_endpoint_identity_windows_test.go:32-41`) already
  reaches for. A name defined anywhere else is invisible to that pin, and the pin is the only thing
  standing between this task and the fourth brick.)
- `cmd/devoid-msi-root-guard/guard_windows.go` — **the guard edit, three coordinated changes, same
  commit** (see "The guard edit, exactly" below)
- `cmd/devoid-msi-root-guard/guard_sessions_windows_test.go` (new — the pin, modelled on
  `guard_endpoint_identity_windows_test.go`)
- `internal/daemon/session_token.go` (new, no build tag — mint, index by `(userSID, sessionId)`, expiry, the
  pure lookup)
- `internal/daemon/session_token_windows.go` (new — write the file with a per-user DACL)
- `internal/winacl/machine_secret_windows.go` (add `SessionSecretSDDLFor(userSID string) (string, error)`
  and the **production** hardener `HardenSessionSecretForUser(path, userSID string) error` beside the two
  existing constants at `:69` and `:91`; **do not change either existing constant**)
- `internal/winacl/machine_secret_policy_test.go` (`TestMachineDescriptorRouting`, `:212` — **extend the
  regexes and add the third boundary**; see LANDMINES)
- `internal/core/config/config.go` (change `DaemonTokenReadPath` at `:682-687` to try the session path
  first)
- `internal/daemon/daemon_auth.go` (`ReadTokenDetailed`, `:140-200` — session-first, then today's order
  verbatim; `requireDaemonToken` at `:315` — accept either)
- `cmd/devoid-prompt-guard-host/main.go` (`readDaemonToken`, `:233-235` — picks up the new resolution for free)
- `.github/workflows/pr-checks.yml` — add `./cmd/devoid-msi-root-guard/...` to the windows-latest
  `cli-entrypoint-tests` job (`:351`). **The guard's tests execute in no CI job today**; without this the
  pin you are adding never runs.

**Storage:** `<machineRoot>\sessions\<userSID>\daemon-token`, written by SYSTEM, DACL
`O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;<userSID>)` — SYSTEM and Administrators full, **that one
user** read, nobody else. It is under the machine root, not the user profile, so the RA-3 boundary holds and
the daemon never writes into a profile it must not touch.

**The guard edit, exactly.** All three, in `cmd/devoid-msi-root-guard/guard_windows.go`, in this commit:

1. **`boundaryChildNames` (`:624-629`)** gains `sessionsDirName` as a member, with a comment naming this
   task and the brick class, in the shape the `activationStoreDirName` entry already uses.
2. **A local `const sessionsDirName = "sessions"` (`:989-1027` is where the sibling constants live)**, plus
   a test pinning it to `config.SessionsDirName`. The guard deliberately does **not** import the agent's
   packages in its production path — it is embedded in the MSI — which is exactly why
   `endpointIdentityFileName` is duplicated and pinned rather than imported (`:1007-1027`). Follow that
   pattern; do not add an import.
3. **`boundaryChildRead` (`:634-639`)** — no code change needed: the default arm already returns
   `policy.readSID` + `directoryReadExecuteMask`, i.e. `BUILTIN\Users` read **and traverse**, which is
   exactly what a per-user token two levels down needs. **Assert it in a test** rather than assuming it,
   because the `evidence` arm proves the function has exceptions.

`inspectRootEntries` (`:1047`) needs no edit: it builds its allowlist *from* `boundaryChildNames`
(`:1057-1060`). That is the F13/DF-71 design and it is why one edit closes both halves.

Two things this edit does **not** need, and an agent will be tempted by both:

- **Do not add `sessions` to the runtime-tree pass at `:389`** (`logs`, `evidence`, `doctor`, `aitrust`).
  That pass asserts trusted owner, no reparse point and a 4096-entry bound, and it **fails closed** — on a
  box where a per-user directory somehow carries a different owner, adding it converts a cosmetic anomaly
  into a 1722. Contents of a managed child are free unless the child is in that list.
- **Do not touch the uninstall.** `windowsMachineCleanupTargets` (`internal/uninstall/uninstall.go:1348`)
  already `os.RemoveAll`s `%ProgramData%\devoid` whole (`:701-707`), so the session tree is removed with
  everything else. `finalizeUninstallRoot` (`guard_windows.go:402`) only deletes the root when it is
  already empty, so it is unaffected.

**PRECONDITIONS** — if any fails, **STOP AND REPORT**. Do not "add the allowlist entry later".

```bash
cd /c/cwt/w2-t8 && git fetch origin && git rev-parse origin/main

# GATE 1 — W7 Task 6 must be merged FIRST. Its completeness pin is what catches this
# class; landing the writer first means the pin arrives after the brick.
MSYS_NO_PATHCONV=1 git grep -n 'TestGuardAllowlistCoversEveryMachineRootWriter' origin/main -- cmd/
#   -> non-empty. If empty, W7 T6 has not landed. STOP AND REPORT.

# GATE 2 — read the guard, do not take this document's word for it.
MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-msi-root-guard/guard_windows.go' | sed -n '624,629p'
#   -> "bin", "config", "logs", "evidence", "doctor", activationStoreDirName
#      "sessions" is NOT there. That is the defect this task must close in its own commit.

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-msi-root-guard/guard_windows.go' | sed -n '1086p'
#   -> return fmt.Errorf("machine root contains unknown entry %q", entry.Name())

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-msi-root-guard/guard_endpoint_identity_windows_test.go' | sed -n '13,26p'
#   -> the THIRD occurrence, in the source, with the owner's 2026-08-20 box named

# GATE 3 — the resolution order you must preserve.
MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/daemon_auth.go' | sed -n '161,166p'
#   -> if config.IsSystemInstall() { ... return t, p, w }   <- a HARD RETURN with no fallback.
#      Your session read goes ABOVE this and must FALL THROUGH into it on any non-Available result.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/winacl/machine_secret_policy_test.go' | sed -n '269,270p'
#   -> the two regexes TestMachineDescriptorRouting matches call sites with.
#      A NEW hardener name matches NEITHER and is invisible to the scan.

go test ./internal/winacl/... ./internal/browserinv/... -count=1
#   -> ok. This is pr-checks.yml:225 and it must be GREEN before and after.
```

**LANDMINES**

- **L1, in full, is this task.** See the box at the top of this task and the guard section under "What
  exists today". The failure is invisible in CI by construction: a clean-box install never creates a
  session directory, so every matrix stays green and it fires on the second upgrade of a machine that has
  had an interactive logon — i.e. every real endpoint and none of the test ones.
- **`TestMachineDescriptorRouting` will not see your new hardener.** It matches call sites with
  `winacl\.HardenMachineLocalRead\b|winacl\.HardenLocalReadWithPrincipal\b` and
  `winacl\.HardenMachineSecret\b|winacl\.HardenSecretWithPrincipal\b|winacl\.HardenSecretForTestPrincipal\b`
  (`machine_secret_policy_test.go:269-270`). A brand-new name matches neither regex, so the scan's
  "an unrouted caller is an unreviewed boundary decision" rule **never fires** — a silent hole in the one
  test that walks the whole module for exactly this. **Extend both the regex set and the want-map with a
  third `wantSessionScoped` boundary in this commit.**
- **`HardenSecretWithPrincipal` and `HardenLocalReadWithPrincipal` are test-only.** Their doc comments say
  "Production callers must use HardenMachineSecret" (`machine_secret_windows.go:166-169`, `:185-186`). An
  agent will find them and use them because they take a principal. Do not. Add a production entry point.
- **SDDL injection into a descriptor applied by SYSTEM is a privilege bug.** `SessionSecretSDDLFor` must
  validate the SID (round-trip it through `windows.StringToSid` / `SecurityDescriptorFromString`) and
  return an error, never a descriptor with a raw string spliced in.
- **The hot path is fail-closed downstream.** `DaemonTokenReadPath` and `ReadTokenDetailed` run on every
  shim invocation and every hook. Returning `""` where a token used to come back 401s `postPrescanWatch`,
  which is **fail-closed** (`cmd/devoid/daemon_client.go:195-198`) — i.e. it blocks `npm install`
  fleet-wide. Nothing is taken away in this task: the machine token stays exactly where it is, on exactly
  the descriptor it has now. The narrowing is Task 10 and it is gated on a measured number.
- **On a script-installed box the daemon creates `sessions` itself**, and under the default
  `C:\ProgramData` DACL a non-admin can create a directory there first — the D2c plant vector
  `internal/aikeystore/location.go:29` names. Create it with an explicit protected descriptor and refuse
  a pre-existing one whose owner is not trusted; never `os.MkdirAll` and trust the result.
- **This task changes no wire contract** (L2 does not apply).

**DO NOT**

- Do not ship the writer and the guard entry in separate commits, and do not "verify on a clean box" —
  a clean box cannot reproduce this defect.
- Do not change `MachineSecretSDDL` or `MachineLocalReadSDDL`.
- Do not change `hardenMachineToken` in this task. That is Task 10, behind a 7-day measured zero.
- Do not remove or reorder the `IsSystemInstall()` short-circuit in `ReadTokenDetailed`; insert above it
  and fall through.
- Do not collapse `TokenUnreadable` and `TokenAbsent`. The distinction exists so an operator is not sent
  to restart a running daemon (`daemon_auth.go:193-197`).
- Do not add `sessions` to the guard's runtime-tree pass (`:389`).

**Resolution order — and why it is this way round.** `DaemonTokenReadPath` today is machine-first via
`IsSystemInstall()`. The new order is: session path for the current user's SID, **then today's order
unchanged**. The machine token stays exactly where it is, on exactly the descriptor it has now. **Nothing can
break, because nothing is taken away.** The narrowing is Task 10, and it is gated on a measured zero.

**Blast radius:** `DaemonTokenReadPath` and `ReadTokenDetailed` are on the hot path of every shim invocation
and every hook. A bug that makes them return `""` where they previously returned a token 401s
`postPrescanWatch`, which is **fail-closed** (`cmd/devoid/daemon_client.go:195-198`), i.e. it blocks
`npm install` fleet-wide. The fallback must be unconditional and must preserve the existing
`TokenUnreadable`-vs-`TokenAbsent` distinction (`daemon_auth.go:193-197`), which exists so an operator is not
sent to restart a running daemon.

**Rollback:** revert `DaemonTokenReadPath` and `ReadTokenDetailed` to their current bodies. The session files
become unread; the machine token still authenticates every client. One-commit revert, no state migration.

- [ ] **Do the guard first.** Add `config.SessionsDirName`, add `sessionsDirName` +
      `boundaryChildNames` + the `boundaryChildRead` assertion in `guard_windows.go`, write
      `guard_sessions_windows_test.go`, add `./cmd/devoid-msi-root-guard/...` to `cli-entrypoint-tests`,
      and run `node ci/lib/drift.mjs`. Only then write a line of session-token code. An agent that writes
      the writer first and the allowlist second has, for the length of that gap, a branch that bricks the
      fleet if it is merged.
- [ ] Write `TestGuardAcceptsASessionsDirectory` in `guard_sessions_windows_test.go`, modelled on
      `TestGuardAcceptsAnEnrolledMachineRoot` (`guard_endpoint_identity_windows_test.go:41-47`): build a
      root carrying the full set a real enrolled endpoint has **plus** `sessions\<sid>\daemon-token`, and
      assert `inspectRootEntries` accepts it.
- [ ] Write `TestSessionsDirNameMatchesConfig`, modelled on `TestEndpointIdentityFileNameMatchesConfig`
      (`:32-39`): `sessionsDirName == config.SessionsDirName`, with a failure message that says the guard
      would refuse the very directory the agent writes and every enrolled endpoint would fail its next
      upgrade.
- [ ] Write `TestReadTokenDetailed_FallsBackToMachineWhenNoSessionToken` **before** adding the session branch.
      This is the fleet-wide-brick guard and it must exist first.
- [ ] Write `TestReadTokenDetailed_PrefersTheSessionTokenWhenBothExist`.
- [ ] Write `TestReadTokenDetailed_UnreadableSessionTokenFallsThroughAndStillReportsUnreadable`: the session
      file exists and is denied -> the machine token authenticates **and** the recorded cause stays
      `TokenUnreadable`, not `TokenAbsent`. Preserves the `:173-179` "remembered, surfaces only if nothing
      later succeeds" behaviour on a new path.
- [ ] Write `TestSessionSecretSDDL_NamesExactlyOneUser`: the rendered SDDL contains the given SID and no
      `BU`, `AU`, `WD` or `IU` ACE. Pure, ubuntu, in `internal/winacl`.
- [ ] Write `TestSessionSecretSDDL_RejectsAMalformedSID`: an input that is not a valid SID string returns an
      error, never a descriptor with the raw string spliced in. SDDL injection into a SYSTEM-applied
      descriptor is a privilege bug.
- [ ] Implement mint-on-handshake in the Task 7 server, indexed by `(userSID, sessionId)`, expiring on
      session disconnect (the Task 6 watcher already sees disconnects) and on daemon restart.
- [ ] `requireDaemonToken` accepts a session token whose `(userSID, sessionId)` matches the caller, **or** the
      machine token. Constant-time compare on both, matching the existing `crypto/subtle` use.

**DEFEAT TEST 1 — the machine-root brick. Run this one first and paste its output.**
Mutation: remove `sessionsDirName` from `boundaryChildNames` in
`cmd/devoid-msi-root-guard/guard_windows.go`.
Command: `go test ./cmd/devoid-msi-root-guard/... -run 'TestGuardAcceptsASessionsDirectory' -count=1`
(Windows only — the package is `//go:build windows`)
Must print: `machine root contains unknown entry "sessions"`
That is the exact string the guard produces on a real endpoint, and the exact shape that produced
`machine root contains unknown entry "endpoint-identity.json"` on the owner's box on 2026-08-20.

**DEFEAT TEST 2 — the fleet-wide `npm install` brick.**
Mutation: in `ReadTokenDetailed`, make the new session branch `return` instead of falling through.
Command: `go test ./internal/daemon/... -run 'TestReadTokenDetailed_FallsBackToMachineWhenNoSessionToken' -count=1`
Must print: `no session token must fall back to the machine token; got "" (this 401s every non-elevated npm install)`

**DEFEAT TEST 3 — SDDL injection into a SYSTEM-applied descriptor.**
Mutation: in `SessionSecretSDDLFor`, splice the raw input string into the descriptor without validating it.
Command: `go test ./internal/winacl/... -run 'TestSessionSecretSDDL_RejectsAMalformedSID' -count=1`
Must print: `malformed SID accepted into an SDDL applied by SYSTEM`

**DEFEAT TEST 4 — the routing scan must be able to see the new writer.**
Mutation: revert the regex extension in `machine_secret_policy_test.go:269-270` to its current two
patterns, leaving `HardenSessionSecretForUser` unmatched.
Command: `go test ./internal/winacl/... -run 'TestMachineDescriptorRouting' -count=1`
Must print: a failure naming `internal/daemon/session_token_windows.go` as an unrouted machine-secret
writer. **If it passes, the scan cannot see your writer and the extension is wrong** — that is a silent
hole in the only test that walks the whole module for this.

**EXIT** — three commands, three numbers:

```powershell
# 1. Exactly three ACEs on user A's token, and no BUILTIN\Users
icacls "$env:ProgramData\devoid\sessions\<sidA>\daemon-token"
#   -> SYSTEM:(F), BUILTIN\Administrators:(F), <userA>:(R)   and nothing else

# 2. User B cannot read user A's token (run as user B)
cmd /c type "%ProgramData%\devoid\sessions\<sidA>\daemon-token"
#   -> Access is denied.

# 3. Both users' shims still work
devoid install-package left-pad          # as A, then as B -> both reach a verdict, 0 401s
```

**Numbers: 3 ACEs, 1 denied cross-user read, 0 broken shims.** And the guard number, which is the one
this task exists for: on a VM that has had an interactive logon and therefore carries
`%ProgramData%\devoid\sessions\`, install the previous build, then upgrade to this one —
**1 successful upgrade, exit code 0, and zero `1722` in the MSI log**:

```powershell
Select-String -Path "$env:TEMP\devoid-msi*.log" -Pattern '1722|unknown entry' | Measure-Object |
  Select-Object -ExpandProperty Count
#   -> 0
```

Save the upgrade transcript as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t8-upgrade-over-enrolled-endpoint.txt`. **A clean-box install does not
count as evidence for this task** — the defect is invisible on a clean box, which is why it has shipped
three times.

---

## Task 9: Verify the peer's session on every mutating route

**Files:**
- `internal/daemon/daemon_peercred_windows.go` (new, `//go:build windows`)
- `internal/daemon/daemon_peercred_other.go` (change the tag from `!linux` to `!linux && !windows`; update the
  comment at `:12-18`, which currently states the gap this task closes)
- `internal/daemon/daemon_auth.go:79` (`peerUIDCheckFn` — the seam already exists; **do not add a new one**)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t9 && git fetch origin && git rev-parse origin/main

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/daemon_auth.go' | sed -n '79p'
#   -> peerUIDCheckFn    = peerUIDMatchesDaemon      <- the seam. Use it; do not add another.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/daemon_auth.go' | sed -n '362p'
#   -> if ok, determined := peerUIDCheckFn(r.RemoteAddr); determined && !ok {
#      NOTE the shape: only determined && !ok denies. Undetermined never denies.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/daemon_peercred_other.go' | sed -n '5,25p'
#   -> the //go:build !linux stub, its stated contract, and the comment that names
#      the gap this task closes. You are changing its tag to !linux && !windows.

# Task 8 must already be merged: the per-session token is the PRIMARY, this is defence in depth.
MSYS_NO_PATHCONV=1 git log --oneline origin/main -1 -- internal/daemon/session_token.go
#   -> non-empty. If empty, Task 8 has not landed. STOP.
```

**LANDMINES**

- **A wrong `determined=true, match=false` 403s a legitimate client.** The existing contract
  (`daemon_peercred_other.go:20-21`) is the safe shape and must be preserved exactly: return
  `determined=false` whenever anything at all is uncertain — table lookup failed, PID not found,
  `OpenProcess` denied, token unreadable. Only a positively-resolved *mismatch* may deny.
- **PIDs are reusable and `GetExtendedTcpTable` is a snapshot.** This is defence in depth **behind** the
  per-session token, never the primary. Say that in the file header the way
  `daemon_peercred_other.go:9-18` states its own limit today. A reviewer who believes this is the primary
  will later "strengthen" it into a fail-closed check.
- **This task writes nothing to the machine root** (L1) and **changes no wire contract** (L2).

**DO NOT**

- Do not add a second seam. `peerUIDCheckFn` (`:79`) exists precisely for this.
- Do not change the `determined && !ok` call-site shape at `:362`.
- Do not make an `OpenProcess` failure a denial. On a hardened box that is the common case.
- Do not delete `daemon_peercred_other.go`; retag it `!linux && !windows` so every other platform keeps
  the stub and its stated contract.

**How.** For a loopback TCP connection, resolve the peer PID with `GetExtendedTcpTable`
(`TCP_TABLE_OWNER_PID_CONNECTIONS`, AF_INET) matched on the local/remote port pair, then `OpenProcess` +
`OpenProcessToken` to read the user SID and session id.

**State the limit honestly, in the code.** This is a *snapshot* lookup and PIDs are reusable, so it is
**defence in depth behind the per-session token, never the primary**. The primary is Task 8: the credential
itself is bound to an identity the kernel vouched for at handshake time. Say that in the file header, the way
`daemon_peercred_other.go:9-18` says its own limit today.

**Blast radius:** a wrong `determined=true, match=false` **403s a legitimate client**. The existing contract at
`daemon_peercred_other.go:20-21` is the safe shape and must be preserved exactly: return `determined=false`
whenever anything at all is uncertain — table lookup failed, PID not found, `OpenProcess` denied, token
unreadable. Only a positively-resolved *mismatch* may return `determined=true, match=false`.

**Rollback:** flip the build tag back so the `!linux` stub covers Windows again. One-line revert.

- [ ] Write `TestPeerCheck_UndeterminedOnEveryFailurePath` (pure, ubuntu, over an injected resolver): table
      lookup error, PID zero, `OpenProcess` error, token error -> all `(false, false)`. **Write this first.**
- [ ] Write `TestPeerCheck_MismatchOnlyOnAResolvedDifferentSession`: only a fully resolved,
      genuinely-different `(userSID, sessionId)` yields `(false, true)`.
- [ ] Write `TestRequireDaemonToken_UndeterminedPeerStillAllowsAValidToken` in `daemon_auth_test.go` —
      pinning that this task cannot 403 anyone by itself.
- [ ] Implement the Windows resolver behind the existing seam.

**DEFEAT TEST 1 — an uncertain lookup must never deny.**
Mutation: in `internal/daemon/daemon_peercred_windows.go`, change the `OpenProcess` error arm to
`return false, true`.
Command: `go test ./internal/daemon/... -run 'TestPeerCheck_UndeterminedOnEveryFailurePath' -count=1`
Must print: `an OpenProcess failure must be undetermined, not a mismatch (this 403s legitimate clients)`

**DEFEAT TEST 2 — this task must not be able to 403 anyone by itself.**
Mutation: change the call site at `daemon_auth.go:362` from `determined && !ok` to `!ok`.
Command: `go test ./internal/daemon/... -run 'TestRequireDaemonToken_UndeterminedPeerStillAllowsAValidToken' -count=1`
Must print: `undetermined peer must not deny a valid token; got 403`

**EXIT:** on a two-user box, user B replaying user A's session token against a mutating route receives
**403**, recorded from the daemon log with both SIDs; user A's own 100 consecutive shim invocations
receive **0**:

```powershell
# as user B, with user A's token value in $tokenA
Invoke-WebRequest -Uri http://127.0.0.1:19280/v1/ai/tool-decision -Method POST `
  -Headers @{Authorization="Bearer $tokenA"} -Body '{}' -ContentType application/json
#   -> 403

# as user A
1..100 | ForEach-Object { devoid install-package left-pad | Out-Null }
Select-String -Path "$env:ProgramData\devoid\logs\*.log" -Pattern '403' |
  Measure-Object | Select-Object -ExpandProperty Count
#   -> 1   (the cross-session one above, and nothing else)
```

**Numbers: 1 cross-session 403, 0 same-session 403s out of 100.** Save as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t9-peer-session.txt`.

---

## Task 10: Count which credential authenticated, then narrow the machine token only on a measured zero

**Files:**
- `internal/daemon/daemon_auth.go` (`requireDaemonToken`, `:315` — increment a counter keyed by
  **(credential kind, route)**, not by credential kind alone; see the R4 note below)
- `internal/daemon/observed_runtime.go` (surface `credentialUse[]{kind, route, count}` on
  `GET /v1/health/observed`)
- **later commit, gated:** `internal/daemon/daemon_token_perm_windows.go:17`
  (`hardenMachineToken = winacl.HardenMachineSecret`)
- **later commit, gated:** `internal/winacl/machine_secret_readers_test.go` (the inventory rows), and
  `internal/winacl/machine_secret_policy_test.go` (`TestMachineDescriptorRouting`, `:212` — the routing table).
  Note: `internal/daemon/daemon_token_perm_windows.go:16` says "Pinned by
  `internal/winacl/machine_secret_routing_test.go`". **That file does not exist**; the routing table lives in
  `machine_secret_policy_test.go`. Fix that comment in the same commit rather than following it.

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t10 && git fetch origin && git rev-parse origin/main

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/winacl/machine_secret_readers_test.go' | sed -n '34,47p'
#   -> the TIGHTEN-AND-BRICK / NEVER-TIGHTEN pair. This file is the gate you are moving.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/winacl/machine_secret_readers_test.go' | sed -n '104,133p'
#   -> the two rows: cmd/devoid (:105-121) and cmd/devoid-prompt-guard-host (:122-133).
#      TWO BINARIES, THREE LANES: cmd/devoid's tokenFiles names BOTH daemon_client.go
#      and ai_failure_resolver.go.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/winacl/machine_secret_policy_test.go' | sed -n '250,265p'
#   -> wantSecret, and the comment that tells you EXACTLY what to do here:
#      "When the per-user split ships, MOVE those entries; do not add a second one
#       here and leave the old one above."

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/daemon/daemon_auth.go' | sed -n '241,262p'
#   -> loadOrCreateDaemonToken re-asserts perms on REUSE, not only on mint. This is the
#      property that makes the rollback a daemon restart and nothing else. CONFIRM IT ON
#      THE RIG before shipping the narrowing.

# The soak evidence must exist and must satisfy all three conditions above.
test -f C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-credential-use-soak.csv || echo "SOAK MISSING - STOP"
```

**LANDMINES**

- **Counting an absence is not evidence of migration.** See the R4 note under the soak checkboxes. This
  is the single most likely way this task ships a silently ungoverned browser lane.
- **`postPrescanWatch` treats a 401 as fail-closed** (`cmd/devoid/daemon_client.go:195-198`). If the
  narrowing is wrong, **no developer on the fleet can `npm install`**. That is the loud half.
- **`cmd/devoid-prompt-guard-host` fails open** (`decision:"allow"`). If the narrowing is wrong there,
  nothing breaks and nothing is governed. That is the quiet half, and it is the dangerous one —
  `machine_secret_readers_test.go:122-133` says so in the source.
- **The routing table's own instruction is to MOVE, not to add.** `machine_secret_policy_test.go:258-262`:
  "When the per-user split ships, MOVE those entries; do not add a second one here and leave the old one
  above." A file listed on two boundaries is a routing table that has stopped meaning anything.
- **A hardening failure does not degrade, it locks.** `loadOrCreateDaemonToken` returns `""` and logs
  "mutating IPC is locked" when `applyMachineTokenPerms` fails (`internal/daemon/daemon_auth.go:253-256`).
  So a narrowing that the daemon cannot apply does not leave the old ACL in place — it takes the daemon's
  own capability token away. Confirm the rollback on the rig before shipping, exactly as the Rollback
  paragraph says.
- **`machine-secret-denies-local-users` covers `credentials.json` AND `daemon-token`.** This wave closes
  only the token half. The entry **stays quarantined**, reason narrowed to `credentials.json`, `reviewBy`
  re-set. Flipping it is a false green of exactly the kind §14 catalogues.
- **This task writes nothing to the machine root** (L1) and **changes no wire contract** (L2).

**DO NOT**

- Do not flip `hardenMachineToken` in the same commit as the counters. Two commits, a measured gate
  between them.
- Do not write a new defeat test for the narrowing. The existing
  `TestMachineSecretNonElevatedReaderInventoryIsClosed` is the defeat test and it already fails in both
  directions (`machine_secret_readers_test.go:34-47`).
- Do not edit `machine_secret_readers_test.go`'s rows before the soak passes. Editing the inventory is
  how the guard *learns* the precondition is met; doing it early is how the guard stops guarding.
- Do not narrow `credentials.json`. `config.CredentialsPath` resolves machine-first by `os.Stat`, which
  measures **existence, not readability** (`internal/core/config/config.go:625-637`), so narrowing it
  silently empties the config instead of failing loudly.

**Blast radius of the narrowing, and it is the largest in the wave:** the moment
`hardenMachineToken` becomes `HardenMachineSecret`, every non-elevated reader that has not moved to a session
token is locked out. `postPrescanWatch` treats a 401 as fail-closed, so **`npm install` breaks fleet-wide**;
and `cmd/devoid-prompt-guard-host` fails **open**, so the browser lane silently stops governing. Those two are
already named in `machine_secret_readers_test.go:34-47` as `TIGHTEN-AND-BRICK`. This is why the narrowing is a
separate commit behind a measured number and not part of Task 8.

**Rollback:** revert one line (`hardenMachineToken`). The next daemon start re-applies
`MachineLocalReadSDDL` on the existing token file — `loadOrCreateDaemonToken` re-asserts perms on **reuse**,
not only on mint (`internal/daemon/daemon_auth.go:241-262`), so recovery needs a daemon restart and nothing
else. Confirm that on the rig before shipping the narrowing; it is the property that makes this reversible.

**The soak gate is a POSITIVE signal, not an absence. This is the R4 correction and it is not optional.**
The first draft gated the narrowing on `credentialUse.machine == 0`. A lane that has simply **stopped
calling** satisfies that too — and `cmd/devoid-prompt-guard-host` fails **open** (`decision:"allow"`,
`main.go:374-389`), so a browser lane that quietly stopped reaching the daemon would show zero
machine-token reads, zero errors, and zero governance. Counting an absence cannot distinguish
"migrated" from "dead".

The browser lane is the one that can go dark silently, and it has two token-gated loopback routes of its
own: `POST /v1/ai/prompt-check` and `POST /v1/browser/health`
(`internal/daemon/server.go:598`, both `requireDaemonToken`-wrapped; the native host posts to them with
the on-disk token at `cmd/devoid-prompt-guard-host/main.go:415` and `:464`). **So the gate is: a
session-token authentication observed on those routes**, every day, on the browser rig.

- [ ] Add the per-(kind, route) counters and the observed-runtime field. Ship this half alone and soak.
- [ ] Soak 7 days across the rig matrix (machine install, per-user install, browser-extension lane active,
      two simultaneous users, RDP session, fast user switching). **Exit for the narrowing — all three,
      every day, on every rig:**
      1. `credentialUse[kind=machine].count == 0` (the absence);
      2. `credentialUse[kind=session, route=/v1/ai/prompt-check].count >= 1` **and**
         `credentialUse[kind=session, route=/v1/browser/health].count >= 1` (the positive signal — the
         browser lane authenticated with a session token, so it is alive *and* migrated);
      3. `credentialUse[kind=session, route=POST /v1/prescan-watch].count >= 1` (the shim lane —
         `postPrescanWatch` is the fail-**closed** reader, `internal/daemon/server.go:564`) **and**
         `credentialUse[kind=session, route=POST /v1/ai/tool-decision].count >= 1` (the hook lane,
         `:615`).
      Drive (2) with a real prompt typed into a provider site each day, not with a synthetic POST — a
      synthetic call proves the route works, not that the extension still reaches it.
- [ ] If the browser rig produces the absence but not the positive signal, **STOP**: that is the
      fail-open lane having gone dark, and narrowing would make it permanent and invisible.
- [ ] Only then: flip `hardenMachineToken`, and in the same commit update the two inventory rows in
      `machine_secret_readers_test.go:104-134` from `nonElevated` to `elevatedOnly` **with a `why` string that
      states what changed**. The test fails in the never-tighten direction too (`:44-47`), so this edit is how
      the guard learns the precondition is met.
- [ ] Add a live-proof register entry `session-token-denies-other-local-users` to
      `internal/liveproof/register.json` with all five evidence fields (`internal/liveproof/liveproof.go:62-76`).

**Read this before touching the existing register entry.** `machine-secret-denies-local-users` covers
**both** `credentials.json` and `daemon-token`. This wave closes only the token half. That entry therefore
**stays quarantined**, with its reason narrowed to `credentials.json` and its `reviewBy` re-set — it does not
flip. Flipping it would be a false green of exactly the kind §14 catalogues, and the register's own discipline
is that nothing is deleted because it was partly fixed.

**DEFEAT TEST — and it is an EXISTING test. Do not write a new one.**
Mutation: in `internal/daemon/daemon_token_perm_windows.go:17`, set
`hardenMachineToken = winacl.HardenMachineSecret` **without** updating the two inventory rows in
`internal/winacl/machine_secret_readers_test.go:104-133`.
Command: `go test ./internal/winacl/... -run 'TestMachineSecretNonElevatedReaderInventoryIsClosed' -count=1`
Must print: the test's own TIGHTEN-AND-BRICK message naming `cmd/devoid` and
`cmd/devoid-prompt-guard-host` as non-elevated readers of a secret that has moved to the secret boundary.

Then the **second direction**, which is the one nobody thinks to run — the test also fails when the last
non-elevated reader disappears and the narrowing becomes safe (`machine_secret_readers_test.go:44-47`):
after the soak passes, update the rows from `nonElevated` to `elevatedOnly` **with a `why` string that
states what changed**, and re-run. That edit is how the guard *learns* the precondition is met; it is not
paperwork.

**EXIT** — four commands, and the last one is the R4 addition:

```powershell
# 1. the ACL narrowed
icacls "$env:ProgramData\devoid\daemon-token"
#   -> no BUILTIN\Users ACE

# 2. a standard user is refused
cmd /c type "%ProgramData%\devoid\daemon-token"        # as a standard user
#   -> Access is denied.

# 3. the fail-CLOSED lane still works
devoid install-package left-pad
#   -> reaches a verdict, exit 0, no 401 in the daemon log

# 4. the fail-OPEN lane is still GOVERNED, proven positively
#    Type a real prompt into a provider site in the browser, then:
$sid = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
$t = Get-Content "$env:ProgramData\devoid\sessions\$sid\daemon-token" -Raw
(Invoke-RestMethod -Uri http://127.0.0.1:19280/v1/health/observed `
   -Headers @{Authorization="Bearer $($t.Trim())"}).credentialUse |
   Where-Object { $_.route -in @('POST /v1/ai/prompt-check','POST /v1/browser/health') }
#   -> at least one row per route with kind=session and count >= 1
```

**Numbers: 0 `BUILTIN\Users` ACEs, 1 denied read, 2 lanes still governed — the second of them proven by a
session-token authentication observed on its own routes, not by the absence of a machine-token read.**
Save all four outputs as `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t10-narrowing.txt`.

---

## Task 11: Stop a token-unreadable endpoint from looking healthy off-box

The worst false green in the source of truth is not that the token cannot be read — it is that **nothing
anywhere says so**. The daemon is alive and heartbeating, so the dead-man never fires.

**Files:**
- `internal/daemon/daemon_auth.go` (`requireDaemonToken`, `:315-340` — on a 401, record the cause)
- `internal/daemon/observed_runtime.go` (a `CredentialReachability` block)
- `cmd/devoid-prompt-guard-host/main.go:374-389` (the wrong word, and the fail-open)
- `cmd/devoid/ai_failure_resolver.go:284-296` (already correct — extend, do not rewrite)

**PRECONDITIONS** — if any fails, **STOP AND REPORT**.

```bash
cd /c/cwt/w2-t11 && git fetch origin && git rev-parse origin/main

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/airuntime/undecidable.go' | sed -n '64,79p'
#   -> the CLOSED bucket vocabulary. You add NOTHING to it.

MSYS_NO_PATHCONV=1 git show 'origin/main:internal/security/events.go' | sed -n '37,46p'
#   -> RecordEvents, and ScrubEventDetails on the way in (:43)

cd /c/Users/Owner/Documents/Ceragon/Backend && git fetch origin && \
  MSYS_NO_PATHCONV=1 git show 'origin/main:src/health/types/heartbeat.types.ts' | sed -n '184,189p;214,220p'
#   -> BypassTelemetryEventDto.type is @IsString() with NO enum, details is a free @IsObject().
#      THIS is why a new event type needs no Backend change. Verify it; do not assume it.

MSYS_NO_PATHCONV=1 git show 'origin/main:cmd/devoid-prompt-guard-host/main.go' | sed -n '368,389p'
#   -> the failSafe closure. You are changing ONE string and nothing else.
```

**LANDMINES**

- **L2 is the whole shape of this task.** A new `UndecidableBucket` is Backend-pinned
  (`internal/controls/undecidable_shape_test.go:120`) and would be dropped silently by
  `AgentIngestValidationPipe` if the agent shipped first — the agent would believe it reported the bucket
  and nothing would arrive. The bypass-event channel is free-shaped and needs no Backend deploy. Use it.
- **`ScrubEventDetails` runs on the way in** (`internal/security/events.go:43`) **and it will not save a
  careless detail key.** Keep `details` to `path`, `cause`, `callerBinary`. No token, no prompt text, no
  command line.
- **An event on every 401 floods the heartbeat queue on a misconfigured endpoint.** Rate-limit to one per
  cause per daemon lifetime plus one per 24 h, mirroring `ungovernedWarnOnce`
  (`cmd/devoid/ai_failure_resolver.go:247-252`).
- **Do not make the browser host fail closed here.** It has never been fail-closed; its authoritative
  decision is the extension's in-page DLP (`cmd/devoid-prompt-guard-host/main.go:368-373`). Flipping it in
  the same change that alters token resolution would turn any resolution bug into an invisible *block*
  instead of a visible *log line*.
- **This task writes nothing to the machine root** (L1).

**DO NOT**

- Do not add a member to `airuntime.UndecidableBuckets`.
- Do not change `decision:"allow"` in the browser host. Change the `error` value on one path only.
- Do not rewrite `ungovernedCheckpointNotice` (`ai_failure_resolver.go:284-296`) — extend it.
- Do not put `credentialReachability` on the heartbeat `controls` block; it goes on the loopback
  `GET /v1/health/observed`.

**What must NOT change:** no new `UndecidableBucket`. `internal/airuntime/undecidable.go:68-79` documents the
set as closed, append-only, and pinned to `controls.UndecidableCounters` — i.e. to the Backend-facing wire
name — by `TestUndecidableWireNamesAreTheClosedBucketVocabulary`
(`internal/controls/undecidable_shape_test.go:120`). Adding one without deploying the Backend first is the
`AgentIngestValidationPipe` drop-unknown-keys landmine: the agent would believe it reported the bucket, and
nothing would arrive. **Use the bypass-event channel instead** — `BypassTelemetryEventDto.type` is
`@IsString()` with no enum at `Backend/src/health/types/heartbeat.types.ts:184-189`, and `details` is a free
`@IsObject()` at `:214-220`. A new event type needs **no Backend change and no deploy ordering**.

**Blast radius:** an event emitted on every 401 would flood the heartbeat queue on a misconfigured endpoint.
Rate-limit to one event per cause per daemon lifetime plus one per 24 h, mirroring the
`ungovernedWarnOnce` discipline already at `cmd/devoid/ai_failure_resolver.go:247-252`.

**Rollback:** remove the emit call. The counters and the observed-runtime block are read-only and can stay.

- [ ] Write `TestCredentialUnreadableEmitsExactlyOneEventPerCause`. RED.
- [ ] Write `TestCredentialUnreadableDoesNotMintANewUndecidableBucket`: assert
      `airuntime.UndecidableBuckets` is unchanged, length and order. This is the deploy-ordering guard, and it
      belongs in the same commit as the thing it guards.
- [ ] Emit `security.NewBypassEvent("daemon_credential_unreadable", "high", "daemon-auth", …)` with details
      `{"path": <resolved path>, "cause": "unreadable"|"absent", "callerBinary": <base name>}`. No secret, no
      prompt content — `ScrubEventDetails` runs on the way in (`internal/security/events.go:43`) and will not
      save a careless detail key, so keep them to the three above.
- [ ] Fix the browser host's **word**: `token-unreadable` must not be reported as `daemon-unreachable`.
      Change the `error` value on that one path to `credential-unreadable` and keep `decision:"allow"`.
      **Do not make the browser host fail closed in this wave** — it has never been fail-closed, its
      authoritative decision is the extension's in-page DLP (`:368-373`), and flipping it is a separate,
      measured change with its own blast radius.
- [ ] Surface `credentialReachability` on `GET /v1/health/observed` so `devoid doctor` can print a row.

**DEFEAT TEST 1 — the deploy-ordering guard, in the same commit as the thing it guards.**
Mutation: append `BucketCredentialUnreadable` to `airuntime.UndecidableBuckets` in
`internal/airuntime/undecidable.go`.
Command: `go test ./internal/daemon/... -run 'TestCredentialUnreadableDoesNotMintANewUndecidableBucket' -count=1`
Must print: `the undecidable bucket vocabulary is Backend-pinned; a new bucket needs Backend deployed first`
Then also run the existing pin and watch it go red for the same reason:
`go test ./internal/controls/... -run 'TestUndecidableWireNamesAreTheClosedBucketVocabulary' -count=1`

**DEFEAT TEST 2 — the flood guard.**
Mutation: remove the once-per-cause guard from the emit path in `internal/daemon/daemon_auth.go`.
Command: `go test ./internal/daemon/... -run 'TestCredentialUnreadableEmitsExactlyOneEventPerCause' -count=1`
Must print: `want 1 event, got 40`

**DEFEAT TEST 3 — the wrong word.**
Mutation: revert the browser host's `error` value on the token-missing path from `credential-unreadable`
back to `daemon-unreachable`.
Command: `go test ./cmd/devoid-prompt-guard-host/... -run 'TestPromptCheck_TokenMissingReportsCredentialUnreadable' -count=1`
Must print: `token-missing reported as "daemon-unreachable"; the daemon IS reachable and the caller is not authorised`
**Where this test actually runs.** `cmd/devoid-prompt-guard-host` is named by **no job in
`pr-checks.yml`** — it is only *built* there (`finding-b-e2e.yml:961`, `internal-candidate.yml:132`). It
is *tested* only by `internal-candidate.yml:87`'s ubuntu `go test ./...`, which runs on the candidate
lane and not on a pull request. So a PR touching this file gets **no signal**. Add
`./cmd/devoid-prompt-guard-host/...` to the windows-latest `cli-entrypoint-tests` job (`pr-checks.yml:351`)
in this commit and re-run `node ci/lib/drift.mjs` so the local Docker mirror stays complete.

**EXIT:** on a rig where the machine token is made unreadable to the interactive user, the Backend receives
**exactly one** `daemon_credential_unreadable` bypass event within one heartbeat interval, and the
console's event list shows it. Today that endpoint is indistinguishable from a healthy one.

```powershell
# make it unreadable to the interactive user only
icacls "$env:ProgramData\devoid\daemon-token" /deny "$env:USERNAME:(R)"
devoid ai hooks-status claude-code       # provoke a 401
Start-Sleep 300                          # one heartbeat interval

Select-String -Path "$env:ProgramData\devoid\evidence\tamper.log" `
  -Pattern 'daemon_credential_unreadable' | Measure-Object |
  Select-Object -ExpandProperty Count
#   -> 1   (and STILL 1 after a further 300 s and 40 more 401s)

icacls "$env:ProgramData\devoid\daemon-token" /remove:d "$env:USERNAME"   # undo
```

**Number: 1 event, and a console event id pasted into the live-proof entry.** Save as
`C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t11-credential-unreadable.txt`.

---

## Wave exit criteria

1. **Crash recovery exists on the shipping installer path.** A fresh MSI install's `Devoid Daemon` task
   carries `RestartOnFailure` within one 5-minute tick, and does not churn thereafter.
   Defeat: `TestTaskInfoConfiguredFor_MissingRestartOnFailureIsRepaired` +
   `TestTaskInfoConfiguredFor_UninspectedTaskIsStillNotChurned`. **Number: 1 repair, then 0 over 12 ticks.**
2. **A real service is registered, correctly configured, and standard users cannot control it.**
   `sc qc` / `sc qfailure` / `sc sdshow` match the pinned values, including
   `FAILURE_ACTIONS_ON_NONCRASH_FAILURES : TRUE`; standard-user `sc stop` and `sc delete` both return
   `Access is denied. (5)`. Defeat: `TestServiceSDDL_DeniesStandardUserControl`,
   `TestServiceFailureArgs_SetsFailureFlag`.
3. **External recovery is proven, including with the scheduled task deleted.** 10 kill-and-recover cycles,
   10 recoveries, 0 user actions, p95 < 90 s; and one cycle with the task removed first.
   Defeat: `TestServicePersistenceQueryErrorLeavesServiceAlone`.
   Artifact: `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-external-recovery.txt`.
4. **Exactly one daemon.** `Get-Process devoid | Measure-Object` returns 1 after boot on 10 consecutive boots.
   Defeat: `TestSupervisor_NeverSpawnsWhileAHealthyDaemonAnswers`.
5. **The logon window is measured and small, and no new stamp was invented.** p95 `unwiredWindowMs` < 2000
   and max < 5000 over 20 logon cycles, against a measured ~60 000 ms baseline on the pre-change build.
   Readiness comes from the **existing** durable reconcile stamp `<userHome>\.devoid\aiwire-last-reconcile`;
   `git diff origin/main --stat` shows **no new stamp file and no new machine-root entry**.
   Defeat: `TestSessionWatch_LaunchesOncePerSession`, `TestSessionWatch_WritesNothingUnderTheMachineRoot`.
   Artifact: `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-logon-window.csv`.
6. **The launch gate refuses only when all FIVE conditions hold — never when the daemon is dead, and never
   when the machine payload does not verify.** Over 200 cycles: 0 refusals healthy, 0 refusals
   daemon-dead, **0 refusals with the broker binary renamed away** (recorded as `payload-unverified`),
   100% refusals on a genuinely-unwired first-ever logon.
   Defeat: `TestLaunchGate_ProceedsWhenTheDaemonIsDead`,
   `TestLaunchGate_ProceedsWhenThePayloadDoesNotVerify`.
   Artifact: `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-launch-gate.csv`.
   *(The third arm inverts the first draft's criterion, which demanded 100% refusals there. On a real
   endpoint a renamed broker binary is a partly-failed upgrade or an AV quarantine — the field's most
   likely failure — and refusing every AI runtime launch on that box is how an operator uninstalls the
   agent. RECONCILIATION §4 R2.)*
7. **Session identity is kernel-verified.** Two simultaneous sessions produce two distinct tokens with 0
   cross-attribution; the pipe grants no `FILE_CREATE_PIPE_INSTANCE` to Authenticated Users.
   Defeat: `TestPipeSDDL_GrantsNoCreateToAuthenticatedUsers`,
   `TestPipeServerRevertsImpersonationOnEveryPath`.
8. **Cross-user token replay fails and same-user traffic does not.** 1 cross-session 403; 0 of 100
   same-session 403s. Defeat: `TestPeerCheck_UndeterminedOnEveryFailurePath`.
9. **The machine token is no longer readable by every local user, and nothing broke.** 0 `BUILTIN\Users` ACEs
   on `daemon-token`; `npm install` still reaches a verdict; the browser lane still reaches the daemon.
   Defeat: the existing `TestMachineSecretNonElevatedReaderInventoryIsClosed`.
   Gate, for 7 consecutive days across the rig matrix **before** this criterion may be attempted, and all
   three parts are required: `credentialUse[kind=machine].count == 0` **and**
   `credentialUse[kind=session]` observed on `POST /v1/ai/prompt-check` **and** on
   `POST /v1/browser/health`, driven by a real prompt typed into a provider site each day.
   *(An absence alone is satisfied by a lane that has simply stopped calling, and
   `cmd/devoid-prompt-guard-host` fails **open** — so it would show zero errors while silently
   ungoverned. The positive signal is what distinguishes migrated from dead. RECONCILIATION §4 R4.)*
10. **A token-unreadable endpoint is visible off-box.** Exactly 1 `daemon_credential_unreadable` event within
    one heartbeat interval, with a console event id. Defeat:
    `TestCredentialUnreadableDoesNotMintANewUndecidableBucket`.
11. **Register truth.** `internal/liveproof/register.json` gains
    `session-token-denies-other-local-users` with all five evidence fields, and
    `machine-secret-denies-local-users` remains quarantined with its reason narrowed to `credentials.json`
    and a fresh `reviewBy`. Defeat: `internal/liveproof`'s existing `Validate` — a partially-filled evidence
    block or an expired quarantine fails the package.
12. **THE MERGE GATE FOR THIS WHOLE WAVE — an enrolled endpoint still upgrades.** Exactly one new name is
    written into the machine root by this wave (`sessions`, Task 8), and it is in `boundaryChildNames`
    (`cmd/devoid-msi-root-guard/guard_windows.go:624`) in the **same commit** as the writer, with W7 Task 6
    already merged. Proven on a VM that **has had an interactive logon** and therefore carries
    `%ProgramData%\devoid\sessions\`: install the previous build, upgrade to this one, **exit 0 and zero
    occurrences of `1722` or `unknown entry` in the MSI log.**
    Defeat: `TestGuardAcceptsASessionsDirectory` — remove `sessionsDirName` from `boundaryChildNames` and
    it prints `machine root contains unknown entry "sessions"`.
    Artifact: `C:/Users/Owner/Documents/Ceragon/.plans/9plus-20260828/evidence/w2-t8-upgrade-over-enrolled-endpoint.txt`.
    **A clean-box install is not evidence for this criterion.** The defect is invisible on a clean box —
    that is why the same class has shipped three times (`.staging`, `aitrust`, `endpoint-identity.json`).

**Deploy ordering for this wave: none of it requires a Backend deploy, and that is by design.** Every off-box
signal added here rides the bypass-event channel, whose `type` and `details` are unvalidated free shapes on the
Backend (`Backend/src/health/types/heartbeat.types.ts:184-220`). No contract widens, so the
"Backend before agent" rule is satisfied vacuously rather than by sequencing. **If any task is later changed to
add a field to the heartbeat `controls` block or to `UndecidableBuckets`, that rule re-arms immediately and
the Backend must deploy first** — `AgentIngestValidationPipe` drops unknown keys rather than 400ing, so an
agent shipped first loses the field silently and it will look like it worked.

**The class rule, so a phantom ordering constraint cannot be added here later.** A route served by
`internal/daemon/server.go` on loopback and read by the CLI on the same box — `GET /v1/health/observed`,
`POST /v1/browser/health`, `GET /v1/ai/transport-observation`, and every other `requireDaemonToken` route —
is **not** a Backend route and carries **no** deploy-ordering constraint, no matter how Backend-shaped its
JSON looks. Only `Backend/src/**` DTOs order a deploy. A phantom entry in a four-item ordering list is how a
real one gets ignored (RECONCILIATION §1 C3).

---

## What this wave deliberately does NOT do

**A virtual service account (`NT SERVICE\devoid-daemon` as the run-as identity).** The strategy asks for "a
dedicated virtual service identity". The daemon must write the ACL-hardened machine bin dir to apply
privileged self-updates — that requirement is stated at `cmd/devoid/main.go:2519-2521` and again at
`internal/aiwiretask/aiwiretask.go:236-238` — and must read `%ProgramData%\devoid\credentials.json`, which is
owned by LocalSystem. Moving the run-as identity would need every one of those ACLs re-granted in the same
change, and a mistake would break self-update fleet-wide with no local symptom. **The strongest safe subset is
shipped instead:** LocalSystem with `SERVICE_SID_TYPE unrestricted`, so the service SID exists in the token and
can be named on the pipe DACL now and on file ACLs later, without moving the account.

**Migrating the 40 token-gated HTTP routes to named-pipe transport.** The strategy asks for pipe IPC for
decision/state/control. Rewriting the daemon's transport is a change whose blast radius is the entire product
surface, and the provider gateway must stay HTTP regardless because it speaks a vendor protocol. Task 7 takes
the property that actually matters — a kernel-verified client identity — through a single additive pipe, and
leaves the routes alone.

**Narrowing `credentials.json`.** It holds the endpoint bearer *and* the request-signing secret, and it is
read by roughly 40 `backend.NewClient` sites in `cmd/devoid` plus `cmd/devoid-prompt-guard-host`
(`internal/winacl/machine_secret_windows.go:47-52`). `config.CredentialsPath` resolves machine-first by
`os.Stat`, which measures **existence, not readability** (`internal/core/config/config.go:625-637`), so
narrowing it silently empties the config rather than failing loudly. Closing it requires a per-user
*credential* mirror — a different and larger problem than a per-session *capability token*, and one that
changes what identity the Backend sees. Named here so it is not mistaken for done: the live-proof entry
`machine-secret-denies-local-users` stays quarantined on account of this half.

**Making `cmd/devoid-prompt-guard-host` fail closed.** It has never been fail-closed; the extension's in-page
DLP is the authoritative decision on that lane (`cmd/devoid-prompt-guard-host/main.go:368-373`). Flipping it in
the same change that alters token resolution would make any resolution bug invisible as a *block* instead of
visible as a *log line*. Task 11 corrects the wrong word and leaves the disposition. The flip belongs with the
browser-lane wave, after Task 10's soak proves the session token reaches that process.

**Requiring a signed, known client image on the pipe.** Task 7 *records* the client image path but does not
gate on it. A signature gate on an IPC hot path is a new fail-closed branch whose provable condition is the
release-signing chain — and release signing is currently **optional** (`bootstrap_trust_chain=FALSE`). Gating
on a signature the product does not always have is the July-2026 brick shape. It belongs in the certification
wave, after signing is mandatory.

**MDM/Intune/GPO delivery, WDAC/App Control, and AppID tagging** (strategy Workstream 12, "Enterprise
hardening"). These need a customer tenant we do not control and, for WDAC, a policy authority the customer may
not have deployed. `internal/osenforce/status.go:33-101` already *measures* WDAC and AppLocker posture, so the
input exists; consuming it is a posture question for the proof wave, not engineering we can complete here.
Writing a task for it would be pretending an external blocker is engineering.

**Defending against a local administrator.** A local admin can `sc delete` the service, replace the binary, or
rewrite the managed policy. The strategy says so plainly in §2.1 and excludes hostile local administrators
from the certified profile. This wave raises the cost and makes tampering *visible* — the service repair
emits a high-severity event, and so does a token that becomes unreadable — but it does not claim a boundary
against an administrator, and no exit criterion above is written as if it did.

**Atomic update/rollback and uninstall residue certification** (the remaining two clauses of the
Operational-durability evidence line in §12). Uninstall residue in particular has an open, unexplained defect —
source of truth §17.2, a clean uninstall observed leaving the whole bin payload behind — whose cause is not
established. That belongs to the lifecycle wave. What this wave owes it, and pays, is that the one new
persistent registration it adds is already covered by the existing teardown
(`internal/uninstall/uninstall.go:2561-2573`, `internal/profilepatch/manifest.go:110-113`), pinned by
`TestServiceNameMatchesTheUninstallInventory`.
