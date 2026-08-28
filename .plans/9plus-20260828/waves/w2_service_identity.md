# Wave 2 - Make the machine authority a real service, and bind its credential to a session

**Scorecard rows this moves:** Operational durability: 4.5 -> 9.5 (strategy §12). Evidence required for that
target: "Real service, external recovery, secure IPC, no logon gap, atomic updates/rollback, lifecycle
certification, no residue." This wave owns the first four. Atomic updates/rollback, lifecycle certification
and residue are named in "What this wave deliberately does NOT do".

**Depends on:** nothing. Runs in parallel with the inline-decision-core wave (Workstream 2). Task 11 is the
only place the two touch, and it touches the *reporting* of an ungoverned checkpoint, not the budget.

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
carries six fields — `exists`, `inspected`, `hasBoot`, `isSystem`, `isHighest`, `command`, `arguments` — and
`configuredFor` (`:66-86`) branches on exactly those. `RestartOnFailure` is neither parsed
(`parseDaemonTaskXML`, `persistence_windows.go:247-286`, decodes only `Triggers`, `Principals`, `Actions`) nor
compared. So on an MSI-installed endpoint the reconciler reads the task, calls it `"present"`, and leaves the
no-crash-recovery task alone forever. **MSI-installed endpoints — the shipping installer — have no crash
recovery at all.**

The watchdog that does exist is *in-process*: `ensureDaemonPersistence` runs once at startup
(`internal/daemon/server.go:2178`) and on every tick of the 5-minute `aiWireReconcileLoop` ticker (`:2186`).
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

**Defeat test:** `TestTaskInfoConfiguredFor_MissingRestartOnFailureIsRepaired` — revert the added
`case !ti.hasRestartOnFailure:` branch in `configuredFor`, expect RED with
`got (true, "present"), want (false, "task has no restart-on-failure action")`.
Second defeat test: `TestTaskInfoConfiguredFor_UninspectedTaskIsStillNotChurned` — move the new branch
**above** the `!ti.inspected` guard, expect RED with `got (false, ...), want (true, "present (definition not
inspected)")`. That second one is the churn-storm guard and must be in the same commit.

**Exit:** on a fresh MSI install of the built agent, `devoid doctor` shows the "Daemon persistence" row
transition from PASS to a repaired PASS within one 5-minute tick, and
`schtasks /Query /TN "Devoid Daemon" /XML` contains `<RestartOnFailure><Interval>PT1M</Interval><Count>3</Count>`
where it previously contained no `<RestartOnFailure>` element. **Number: 1 repair event per endpoint,
exactly once, and 0 further repairs over the next 12 ticks (60 minutes).** The second half is the churn check
and is not optional.

---

## Task 2: Give `devoid-daemon.exe` an SCM service mode that is dormant until registered

**Files:**
- `cmd/devoid-daemon/main_windows.go` (currently 76 lines; add a service branch)
- `cmd/devoid-daemon/service_windows.go` (new — the `svc.Handler`)
- `cmd/devoid-daemon/supervise.go` (new, **no build tag** — the pure supervision decision)
- `cmd/devoid-daemon/supervise_test.go` (new, no build tag — runs on ubuntu)
- `cmd/devoid-daemon/main_windows_test.go` (extend)

**Blast radius:** this binary is what the existing `ONSTART` task launches on **every Windows endpoint**. If
the service-mode detection is wrong in the "I am a service" direction, `devoid-daemon.exe` launched by the
Task Scheduler would try to talk to SCM, fail, and **the daemon would never start fleet-wide**. That is the
worst outcome available in this wave.

The detection must be `svc.IsWindowsService()` (which reads the process's own session/parent, not an argument)
**and** it must be checked such that any error defaults to the legacy launcher path. `childArgs`
(`main_windows.go:36-44`) is a closed allow-list today and must stay one: the service branch adds exactly one
new accepted shape and rejects everything else with `os.Exit(2)` as it does now.

**Rollback:** revert `main_windows.go` to the 76-line launcher. The two new files become dead code and are
harmless. Because nothing registers the service until Task 3, **this task alone changes no observable
behaviour on any endpoint** — that is the point of splitting it out.

- [ ] Write `TestChildArgs_UnknownShapeStillRejected` pinning the existing closed list before touching it.
- [ ] Write `TestServiceModeDetectionFallsBackToLauncherOnError`: a table over
      `(isService bool, detectErr error)` asserting the launcher path is taken for `(false,nil)`,
      `(true,err)`, `(false,err)` and only `(true,nil)` takes the service path. Inject the detector as a
      package var seam. RED.
- [ ] Write the supervision decision as a pure function in `supervise.go` with **no Windows imports**:
      `func nextSupervisorAction(s SupervisorState) SupervisorAction` over
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

**Defeat test:** `TestServiceModeDetectionFallsBackToLauncherOnError` — change the detector call site to
`isService, _ := detect()` (dropping the error), expect RED with
`detector error must take the launcher path, got service path`.
Second: `TestSupervisor_NeverSpawnsWhileAHealthyDaemonAnswers` — delete the `healthyProbes>0` guard in
`nextSupervisorAction`, expect RED with `want Adopt|Wait, got Spawn`.

**Exit:** named artifact — a build of `devoid-daemon.exe` from this commit, installed over an existing
endpoint, where `schtasks /Run /TN "Devoid Daemon"` still brings the daemon up and
`GET http://127.0.0.1:19280/health` returns the five liveness keys. **Number: 0 behavioural differences from
the previous build on a task-launched start**, measured as an identical `/health` body (modulo `uptime`) and
an identical daemon log prefix through the first 30 seconds.

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

**Defeat test:** `TestServiceRegistrationNeverFailsTheInstall` — change the service registration to return an
error the caller propagates to `os.Exit(1)`, expect RED with
`service registration must be best-effort; install aborted with exit(1)`.
Second: `TestServiceNameMatchesTheUninstallInventory` — rename the constant to `devoid-supervisor`, expect RED
with `service name "devoid-supervisor" is not in windowsDaemonServiceNames(); uninstall would leave it behind`.

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

**Blast radius:** the reconciler runs every 5 minutes as SYSTEM. A wrong "not configured" verdict re-applies
`sc config`/`sdset` every tick. The same anti-churn rules as Task 1 apply and must be re-pinned here, not
assumed: an un-inspectable service is `configured` (never churn), and a query error leaves it alone.

Adding a field to `ObservedRuntimeSnapshot` is **agent-local** — that route is read by `devoid doctor`
(`cmd/devoid/doctor_observed.go:27-30`), not by the Backend — so it carries **no deploy-ordering constraint**.
Do not put this on the heartbeat `controls` block instead: that one *is* Backend-shaped and would hit the
`AgentIngestValidationPipe` drop-unknown-keys landmine.

**Rollback:** remove the two `ensureDaemonService` call sites. The package and the route field become inert.

- [ ] Write `TestServiceInfoConfiguredFor_*` mirroring the Task 1 table: missing service, present-but-
      uninspected (-> configured, no churn), wrong start type, wrong account, missing failure actions,
      missing `failureflag`, wrong SDDL, correct.
- [ ] Write `TestServicePersistenceQueryErrorLeavesServiceAlone`: a non-nil query error yields no repair and
      no event, exactly as `reconcilePersistence` does at `persistence.go:143-148`.
- [ ] Write `TestObservedRuntimeSnapshot_CarriesServiceSupervision` asserting the JSON key is present and
      that a daemon with no service reports `registered:false` rather than omitting the block. An omitted
      block reads as "fine" on every surface; that is the exact defect §14 catalogues.
- [ ] Implement query + repair. Repair emits `security.NewBypassEvent("daemon_service_repaired", "high", …)`.
- [ ] Add the doctor row using `persistenceRowKind`'s existing two-state rule (`doctor_persistence.go:33-40`):
      `Err != nil` -> FAIL, `Present` -> PASS, `!Present` -> FAIL. **Do not reintroduce a neutral state** —
      the file explains at `:13-31` why the third state was removed.

**Defeat test:** `TestServicePersistenceQueryErrorLeavesServiceAlone` — change the query-error arm to fall
through into the repair, expect RED with `query error must not trigger a repair; got Recreated=true`.

**Exit — this is the wave's external-recovery proof, and it is a named artifact:**
On a clean VM, from an elevated shell, `taskkill /F /IM devoid.exe` while the daemon holds the port. Record:
1. `GET /health` fails immediately after the kill;
2. `GET /health` returns the five liveness keys again **within 90 seconds, with no user action**;
3. the daemon log carries one `daemon_supervisor_restarted` line;
4. the Backend receives one `daemon_supervisor_restarted` bypass event on the next heartbeat.

**Number: 10 consecutive kill-and-recover cycles, 10 recoveries, 0 requiring user action, p95 recovery
< 90 s.** Save the transcript as `.plans/9plus-20260828/evidence/w2-external-recovery.txt`.

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

- [ ] Run the **baseline** first, on Windows, from a worktree at `origin/main` (not the stale local HEAD):
      `go test ./internal/aicanary/... -count=1`. Record the pass/fail set. A refactor verified against an
      unknown baseline proves nothing — this repo has a written rule about that.
- [ ] Move the functions verbatim. Change only: package name, exported identifiers, and the refusal
      construction (typed error out, reason string mapped in aicanary).
- [ ] Re-run `go test ./internal/aicanary/... -count=1` on Windows. **The pass/fail set must be identical to
      the baseline, member for member.**
- [ ] Add `TestRefusalReasonsUnchangedAfterExtraction` in `internal/aicanary`: a table pinning each typed
      `winsession` error to the exact legacy reason string.
- [ ] Extend `.github/workflows/pr-checks.yml` job `cli-entrypoint-tests` (windows-latest, `:317-351`) with
      `go test ./internal/winsession/... ./internal/aicanary/... -count=1`, and re-run
      `node ci/lib/drift.mjs` so the local mirror stays complete.

**Defeat test:** `TestRefusalReasonsUnchangedAfterExtraction` — change one mapped string from
`ReasonUserTokenUnavailable` to a new literal, expect RED with
`refusal reason drifted: got "…", want "canary-user-token-unavailable"`.

**Exit:** `go test ./internal/aicanary/... -count=1` on windows-latest produces the byte-identical pass/fail
set recorded in the baseline. **Number: 0 tests changed status.** Diff is a pure move: `git diff --stat` shows
no net new logic lines outside `errors.go`.

---

## Task 6: Launch a per-session broker at session connect, and measure the unwired window

This task **closes the window mechanically and measures it. It does not refuse anything.** The refusal is
Task 6b below, and it is deliberately gated on this task's number.

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
- [ ] Implement the Windows poll (10 s interval) and the launch through `internal/winsession`.
- [ ] Have the broker write a readiness stamp on completion: `<machineRoot>\sessions\<userSID>\broker-ready`
      containing `{"sessionId":N,"readyAt":"<RFC3339>","reconcileResult":"…"}`. The directory is created by
      SYSTEM under the already-ACL-hardened machine root, so the **RA-3 user-context boundary is respected —
      the daemon never writes into a user profile.**
- [ ] Record, per session, `sessionConnectedAt` and `brokerReadyAt`, and surface the delta on
      `GET /v1/health/observed` as `sessionBrokers[].unwiredWindowMs`.

**Defeat test:** `TestSessionWatch_LaunchesOncePerSession` — remove the launched-set bookkeeping, expect RED
with `want 1 launch, got 10`. Second: `TestSessionWatch_IsANoOpOnAPerUserInstall` — delete the
`MachineService` gate, expect RED with `per-user install must not launch a broker; got 1 launch`.

**Exit — a number, and it is the input to Task 6b:** on a clean VM with the agent installed, 20 logon cycles
(log off, log on, immediately run `devoid ai hooks-status claude-code`). Record `unwiredWindowMs` for each.
**p95 < 2000 ms and max < 5000 ms**, against a measured baseline of ~60 000 ms today. Save as
`.plans/9plus-20260828/evidence/w2-logon-window.csv`.

---

## Task 6b: Refuse a managed runtime launch inside a *provable* unwired window

**This task does not start until Task 6's measured p95 is under 2000 ms.** That ordering is not
bureaucratic. A fail-closed checkpoint on an unprovable condition bricked a machine in July 2026 and the
operator removed the agent, and an uninstalled control protects nobody. The condition below is only provable
once the window is measured and small.

**Files:**
- `cmd/devoid/ai_hook_runner.go` (the launch checkpoint), `cmd/devoid/ai_failure_resolver.go`
- `internal/airuntime/runner.go` (reason plumbing — reuses the **existing** closed vocabulary)

**The condition that makes the refusal provable.** All four must hold, locally, with no network:
1. `config.IsSystemInstall()` is true (`internal/core/config/config.go:654-658`) — a machine-scope install;
2. the daemon answers `GET /health` with the `daemon: devoid` marker — so this is *not* the dead-daemon case,
   which keeps its existing behaviour untouched;
3. the current session has **no** `broker-ready` stamp, or the stamp's `readyAt` is older than the current
   session's connect time;
4. more than `graceMs` has elapsed since session connect, where `graceMs = 5 × the measured p95` from Task 6
   (i.e. 10 s at the exit number above), read from a constant, not a config.

If any of the four cannot be established, **proceed exactly as today**. "Cannot establish" must never mean
"refuse" here.

**Blast radius:** this is the only new fail-closed branch in the wave, and it can stop a developer's agent
from starting. Guard rails that are part of the task, not follow-ups:
- the refusal is scoped to the **AI runtime launch checkpoint only**. It must not touch the package-install
  gate, the git hooks, or the pre-push gate. A user who cannot `npm install` uninstalls the product.
- the refusal message names the remedy and the exact stamp path, in the shape
  `ungovernedCheckpointNotice()` already uses (`cmd/devoid/ai_failure_resolver.go:284-296`);
- there is **no new undecidable bucket**. `internal/airuntime/undecidable.go:68-79` documents the vocabulary
  as closed, append-only, and pinned to a Backend-facing wire name. A new bucket needs the Backend deployed
  first. Reuse an existing reason and carry the detail on a bypass event instead.

**Rollback:** one constant, `sessionBrokerRefusalEnabled`. It is **not** a feature flag on new functionality
(the product ships features ON); it is a kill switch on a **refusal**, which is the one thing an operator must
be able to stand down without a release. Say so in the code comment, or a reviewer will correctly flag it.

- [ ] Write `TestLaunchGate_ProceedsWhenTheDaemonIsDead`: condition 2 false -> proceed. **Write this one
      first.** It is the July-2026 brick, encoded.
- [ ] Write `TestLaunchGate_ProceedsInsideTheGrace`: condition 4 false -> proceed.
- [ ] Write `TestLaunchGate_ProceedsOnAPerUserInstall`: condition 1 false -> proceed.
- [ ] Write `TestLaunchGate_ProceedsWhenTheStampIsUnreadable`: an unreadable stamp is not an absent stamp ->
      proceed, and record the distinct cause. This is `ReadTokenDetailed`'s `TokenUnreadable` lesson
      (`internal/daemon/daemon_auth.go:123-135`) applied to a new file.
- [ ] Write `TestLaunchGate_RefusesOnlyWithAllFourConditions` — the single RED-to-GREEN case.
- [ ] Write `TestLaunchGate_DoesNotTouchThePackageGate`: assert the package-install path's outcome is
      byte-identical with the gate armed and disarmed.

**Defeat test:** `TestLaunchGate_ProceedsWhenTheDaemonIsDead` — remove condition 2 from the conjunction,
expect RED with `dead daemon must proceed, got refuse (this is the July-2026 brick)`.

**Exit:** 200 scripted logon-and-launch cycles on the VM matrix. **0 refusals when the daemon is healthy and
the broker is ready; 0 refusals when the daemon is dead; 100% refusals in a synthetic run where the broker
binary is renamed away.** Save as `.plans/9plus-20260828/evidence/w2-launch-gate.csv`.

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

**Defeat test:** `TestPipeSDDL_GrantsNoCreateToAuthenticatedUsers` — change the `AU` mask to
`0x0012019f`, expect RED with `AU mask grants FILE_CREATE_PIPE_INSTANCE (0x4); a standard user could squat the pipe name`.
Second: `TestPipeServerRevertsImpersonationOnEveryPath` — remove the `defer RevertToSelf()`, expect RED with
`thread is still impersonating after handler return`.

**Exit:** named artifact — from two simultaneous interactive sessions (users A and B) on one box, each opening
the pipe returns a token whose recorded `sessionId` and user SID match that caller. **Number: 2 handshakes,
2 distinct tokens, 0 cross-attribution.** Recorded with `whoami /user` beside each response.

---

## Task 8: Issue per-session tokens, and make every client resolve session-first

**Files:**
- `internal/daemon/session_token.go` (new, no build tag — mint, index by `(userSID, sessionId)`, expiry, the
  pure lookup)
- `internal/daemon/session_token_windows.go` (new — write the file with a per-user DACL)
- `internal/winacl/machine_secret_windows.go` (add `SessionSecretSDDLFor(userSID string) string` beside the
  two existing constants at `:69` and `:91`; **do not change either existing constant**)
- `internal/core/config/config.go` (add `SessionDaemonTokenPath(userSID string) string`; change
  `DaemonTokenReadPath` at `:682-687` to try the session path first)
- `internal/daemon/daemon_auth.go` (`ReadTokenDetailed`, `:140-200` — session-first, then today's order
  verbatim; `requireDaemonToken` at `:315` — accept either)
- `cmd/devoid-prompt-guard-host/main.go` (`readDaemonToken`, `:234-235` — picks up the new resolution for free)

**Storage:** `<machineRoot>\sessions\<userSID>\daemon-token`, written by SYSTEM, DACL
`O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;<userSID>)` — SYSTEM and Administrators full, **that one
user** read, nobody else. It is under the machine root, not the user profile, so the RA-3 boundary holds and
the daemon never writes into a profile it must not touch. `BUILTIN\Users` already has traverse on the machine
root, so the path is reachable.

**Resolution order — and why it is this way round.** `DaemonTokenReadPath` today is machine-first via
`IsSystemInstall()`. The new order is: session path for the current user's SID, **then today's order
unchanged**. The machine token stays exactly where it is, on exactly the descriptor it has now. **Nothing can
break, because nothing is taken away.** The narrowing is Task 10, and it is gated on a measured zero.

**Blast radius:** `DaemonTokenReadPath` and `ReadTokenDetailed` are on the hot path of every shim invocation
and every hook. A bug that makes them return `""` where they previously returned a token 401s
`postPrescanWatch`, which is **fail-closed** (`cmd/devoid/daemon_client.go:195-198`), i.e. it blocks
`npm install` fleet-wide. The fallback must be unconditional and must preserve the existing
`TokenUnreadable`-vs-`TokenAbsent` distinction (`daemon_auth.go:193-199`), which exists so an operator is not
sent to restart a running daemon.

**Rollback:** revert `DaemonTokenReadPath` and `ReadTokenDetailed` to their current bodies. The session files
become unread; the machine token still authenticates every client. One-commit revert, no state migration.

- [ ] Write `TestReadTokenDetailed_FallsBackToMachineWhenNoSessionToken` **before** adding the session branch.
      This is the fleet-wide-brick guard and it must exist first.
- [ ] Write `TestReadTokenDetailed_PrefersTheSessionTokenWhenBothExist`.
- [ ] Write `TestReadTokenDetailed_UnreadableSessionTokenFallsThroughAndStillReportsUnreadable`: the session
      file exists and is denied -> the machine token authenticates **and** the recorded cause stays
      `TokenUnreadable`, not `TokenAbsent`. Preserves the `:174-178` "remembered, surfaces only if nothing
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

**Defeat test:** `TestReadTokenDetailed_FallsBackToMachineWhenNoSessionToken` — make the session branch
`return` instead of falling through, expect RED with
`no session token must fall back to the machine token; got "" (this 401s every non-elevated npm install)`.
Second: `TestSessionSecretSDDL_RejectsAMalformedSID` — accept the raw string, expect RED with
`malformed SID accepted into an SDDL applied by SYSTEM`.

**Exit:** on a two-user box, `icacls "<machineRoot>\sessions\<sidA>\daemon-token"` shows exactly three ACEs
(SYSTEM, Administrators, user A), and user B's `type` of that path returns **Access is denied**, while user B's
own shim continues to work. **Number: 3 ACEs, 1 denied cross-user read, 0 broken shims.**

---

## Task 9: Verify the peer's session on every mutating route

**Files:**
- `internal/daemon/daemon_peercred_windows.go` (new, `//go:build windows`)
- `internal/daemon/daemon_peercred_other.go` (change the tag from `!linux` to `!linux && !windows`; update the
  comment at `:12-18`, which currently states the gap this task closes)
- `internal/daemon/daemon_auth.go:79` (`peerUIDCheckFn` — the seam already exists; **do not add a new one**)

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

**Defeat test:** `TestPeerCheck_UndeterminedOnEveryFailurePath` — change the `OpenProcess` error arm to
`return false, true`, expect RED with `an OpenProcess failure must be undetermined, not a mismatch (this 403s legitimate clients)`.

**Exit:** on a two-user box, user B replaying user A's session token against a mutating route receives **403**,
recorded from the daemon log with both SIDs. User A's own 100 consecutive shim invocations receive **0** 403s.
**Numbers: 1 cross-session 403, 0 same-session 403s out of 100.**

---

## Task 10: Count which credential authenticated, then narrow the machine token only on a measured zero

**Files:**
- `internal/daemon/daemon_auth.go` (`requireDaemonToken`, `:315` — increment a per-kind counter)
- `internal/daemon/observed_runtime.go` (surface `credentialUse{session,machine}` on
  `GET /v1/health/observed`)
- **later commit, gated:** `internal/daemon/daemon_token_perm_windows.go:17`
  (`hardenMachineToken = winacl.HardenMachineSecret`)
- **later commit, gated:** `internal/winacl/machine_secret_readers_test.go` (the inventory rows), and
  `internal/winacl/machine_secret_policy_test.go` (`TestMachineDescriptorRouting`, `:212` — the routing table).
  Note: `internal/daemon/daemon_token_perm_windows.go:16` says "Pinned by
  `internal/winacl/machine_secret_routing_test.go`". **That file does not exist**; the routing table lives in
  `machine_secret_policy_test.go`. Fix that comment in the same commit rather than following it.

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

- [ ] Add the counters and the observed-runtime field. Ship this half alone and soak.
- [ ] Soak 7 days across the rig matrix (machine install, per-user install, browser-extension lane active,
      two simultaneous users, RDP session, fast user switching). **Exit for the narrowing:
      `credentialUse.machine == 0` on every rig for 7 consecutive days.**
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

**Defeat test:** `TestMachineSecretNonElevatedReaderInventoryIsClosed` (existing, unmodified) — flip
`hardenMachineToken` to `HardenMachineSecret` **without** updating the inventory rows, expect RED with the
test's own message naming `cmd/devoid` and `cmd/devoid-prompt-guard-host` as non-elevated readers of a secret
that has moved to the secret boundary. **That existing test is the defeat test; do not write a new one.**

**Exit:** `icacls %ProgramData%\devoid\daemon-token` shows no `BUILTIN\Users` ACE; a standard user's
`type` of it returns Access is denied; and on the same box `npm install left-pad` still reaches a verdict and
the browser extension's prompt check still reaches the daemon. **Numbers: 0 `BUILTIN\Users` ACEs,
1 denied read, 2 lanes still governed.**

---

## Task 11: Stop a token-unreadable endpoint from looking healthy off-box

The worst false green in the source of truth is not that the token cannot be read — it is that **nothing
anywhere says so**. The daemon is alive and heartbeating, so the dead-man never fires.

**Files:**
- `internal/daemon/daemon_auth.go` (`requireDaemonToken`, `:315-340` — on a 401, record the cause)
- `internal/daemon/observed_runtime.go` (a `CredentialReachability` block)
- `cmd/devoid-prompt-guard-host/main.go:374-389` (the wrong word, and the fail-open)
- `cmd/devoid/ai_failure_resolver.go:284-296` (already correct — extend, do not rewrite)

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

**Defeat test:** `TestCredentialUnreadableDoesNotMintANewUndecidableBucket` — append a
`BucketCredentialUnreadable` to `UndecidableBuckets`, expect RED with
`the undecidable bucket vocabulary is Backend-pinned; a new bucket needs Backend deployed first`.
Second: `TestCredentialUnreadableEmitsExactlyOneEventPerCause` — remove the once-guard, expect RED with
`want 1 event, got 40`.

**Exit:** on a rig where the machine token is made unreadable to the interactive user, the Backend receives
**exactly one** `daemon_credential_unreadable` bypass event within one heartbeat interval, and the console's
event list shows it. Today that endpoint is indistinguishable from a healthy one. **Number: 1 event, and a
console event id pasted into the live-proof entry.**

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
   Artifact: `.plans/9plus-20260828/evidence/w2-external-recovery.txt`.
4. **Exactly one daemon.** `Get-Process devoid | Measure-Object` returns 1 after boot on 10 consecutive boots.
   Defeat: `TestSupervisor_NeverSpawnsWhileAHealthyDaemonAnswers`.
5. **The logon window is measured and small.** p95 `unwiredWindowMs` < 2000 and max < 5000 over 20 logon
   cycles, against a ~60 000 ms baseline. Defeat: `TestSessionWatch_LaunchesOncePerSession`.
   Artifact: `.plans/9plus-20260828/evidence/w2-logon-window.csv`.
6. **The launch gate refuses only when all four conditions hold, and never when the daemon is dead.**
   0 refusals healthy, 0 refusals daemon-dead, 100% refusals broker-absent, over 200 cycles.
   Defeat: `TestLaunchGate_ProceedsWhenTheDaemonIsDead`.
   Artifact: `.plans/9plus-20260828/evidence/w2-launch-gate.csv`.
7. **Session identity is kernel-verified.** Two simultaneous sessions produce two distinct tokens with 0
   cross-attribution; the pipe grants no `FILE_CREATE_PIPE_INSTANCE` to Authenticated Users.
   Defeat: `TestPipeSDDL_GrantsNoCreateToAuthenticatedUsers`,
   `TestPipeServerRevertsImpersonationOnEveryPath`.
8. **Cross-user token replay fails and same-user traffic does not.** 1 cross-session 403; 0 of 100
   same-session 403s. Defeat: `TestPeerCheck_UndeterminedOnEveryFailurePath`.
9. **The machine token is no longer readable by every local user, and nothing broke.** 0 `BUILTIN\Users` ACEs
   on `daemon-token`; `npm install` still reaches a verdict; the browser lane still reaches the daemon.
   Defeat: the existing `TestMachineSecretNonElevatedReaderInventoryIsClosed`.
   Gate: `credentialUse.machine == 0` for 7 days across the rig matrix **before** this criterion may be
   attempted.
10. **A token-unreadable endpoint is visible off-box.** Exactly 1 `daemon_credential_unreadable` event within
    one heartbeat interval, with a console event id. Defeat:
    `TestCredentialUnreadableDoesNotMintANewUndecidableBucket`.
11. **Register truth.** `internal/liveproof/register.json` gains
    `session-token-denies-other-local-users` with all five evidence fields, and
    `machine-secret-denies-local-users` remains quarantined with its reason narrowed to `credentials.json`
    and a fresh `reviewBy`. Defeat: `internal/liveproof`'s existing `Validate` — a partially-filled evidence
    block or an expired quarantine fails the package.

**Deploy ordering for this wave: none of it requires a Backend deploy, and that is by design.** Every off-box
signal added here rides the bypass-event channel, whose `type` and `details` are unvalidated free shapes on the
Backend (`Backend/src/health/types/heartbeat.types.ts:184-220`). No contract widens, so the
"Backend before agent" rule is satisfied vacuously rather than by sequencing. **If any task is later changed to
add a field to the heartbeat `controls` block or to `UndecidableBuckets`, that rule re-arms immediately and
the Backend must deploy first** — `AgentIngestValidationPipe` drops unknown keys rather than 400ing, so an
agent shipped first loses the field silently and it will look like it worked.

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
