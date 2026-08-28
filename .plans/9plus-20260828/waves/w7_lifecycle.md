# Wave 7 — Make every lifecycle transition prove its own outcome

**Scorecard rows this moves:** Operational durability 4.5 → 9.5 (shared with Wave 2). This wave owns four
of that row's seven evidence clauses — *no logon gap*, *atomic updates/rollback*, *lifecycle
certification*, *no residue*. Wave 2 owns the other three (*real service*, *external recovery*,
*secure IPC*).
**Depends on:** Nothing for Tasks 1, 2, 3, 4, 6, 8. Tasks 5 and 7 land useful standalone but only reach
their strongest form once Wave 2 has replaced the scheduled-task daemon with a real service — both
notes say exactly where.
**Phase:** 5 (*install/update/repair/uninstall certification*). One exception: **Task 5 is Phase 1**
— it is strategy §11 Phase 1's "no one-minute unwired state" and must not wait for Phase 5.

All paths are relative to the workspace root `C:/Users/Owner/Documents/Ceragon/`. Every line number in
this document was read at **`Installers` `origin/main` = `5b129523`** (the local checkout is 1010
commits behind; read with `git show origin/main:<path>`, not from the working tree).

---

## What exists today

### The MSI, as authored

The shipped Windows product is `Installers/windows-installer/msi-build/Product.wxs` (619 lines at
`5b129523`), WiX v4, `Scope="perMachine"`, installing into `%ProgramData%\devoid`.

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
- `<MajorUpgrade … Schedule="afterInstallExecute" />` (`Product.wxs:28-29`) — a deliberate
  non-default schedule, so the new payload installs *before* the old product's removal transaction.
- `DependencyShims` carries `<Level Value="0" Condition='DEPS_ENABLED = "0"' />`
  (`Product.wxs:585-591`). That compiles to a Condition-table row re-evaluated at **every** transaction
  including uninstall. It cannot explain the observation on its own — `CoreAgent` is `AllowAbsent="no"`
  and its two binaries are in the residue — but it must be ruled out rather than assumed away.

### The uninstall sequence

`Installers/windows-installer/msi-build/CustomActions.wxs:643-670`. In order: `CA_KillProcesses` →
`CA_TeardownMachineState` (payload-independent SYSTEM teardown, run from the embedded
`DevoidMsiRootGuard` binary, `Return="ignore"`) → `CA_DeregisterEndpoint` → `CA_RemoveDaemonTask`
(`Before="RemoveFiles"`) → `CA_RemoveGitHooks` → `CA_UnpatchPowerShellProfile` →
`CA_RemoveCredentials` → **standard `RemoveFiles`/`RemoveFolders`** → `CA_FinalizeMachineRootUninstall`
(`Execute="commit"`, deletes only a *verified, empty* canonical root).

Every uninstall CA is `Return="ignore"` or advisory. **Nothing in the transaction checks that
`RemoveFiles` actually removed anything.** The uninstall's success is msiexec's exit code and nothing
else.

### Two force-strip paths, and what neither of them cleans

There are two code paths that remove DeVoid's Windows Installer registration **without running the MSI
transaction**:

1. `Installers/install-scripts/production/uninstall.ps1:468-514`,
   `Remove-DevoidInstallerRegistrationByProductCode`. It deletes the three ARP keys, plus
   `HKLM\SOFTWARE\Classes\Installer\Products\<packed>`,
   `HKLM\SOFTWARE\Classes\Installer\Features\<packed>`,
   `HKLM\…\Installer\UserData\S-1-5-18\Products\<packed>`, plus the Package Cache folder
   (`:480-514`). It is entered on `-Recover` **or automatically**, with no operator flag, whenever an
   installer-registered machine has no payload present (`uninstall.ps1:1498-1502`).
2. `Installers/internal/uninstall/windows_installer_windows.go:272-333`,
   `RemoveWindowsInstallerResidueForRecovery` → `windowsInstallerResidueCleanupScript`, which enumerates
   only the three `…\CurrentVersion\Uninstall` roots (`:315-317`).

**Neither path touches `HKLM\SOFTWARE\Classes\Installer\Components\<packedComponentGuid>` or its
`UserData\S-1-5-18\Components` twin.** That hive is where MSI records, per component GUID, the list of
client ProductCodes and the installed path. A force-strip therefore leaves every one of the 41
component GUIDs still naming a now-nonexistent ProductCode as a client. `Product.wxs`'s `<Package>`
element declares no `ProductCode`, so WiX v4 auto-generates a fresh one per build while the component
GUIDs stay fixed — orphaned clients accumulate build over build. When msiexec later uninstalls a
*real* registration and finds a surviving client for a component, it logs
`Disallowing uninstallation of component: {GUID} since another client exists` and **leaves the file on
disk**. That is the leading hypothesis for the 2026-08-27 observation, and it is the one Task 1 must
confirm or kill before Task 4 fixes anything.

### A residue probe already exists, is already wired, and has no payload stage

`Installers/internal/uninstall/residue_probe_windows.go` (268 lines) is a complete, seam-injected,
unit-tested probe with six stages: `machine-path` (`:59-68`), `native-host` (`:70-81`),
`release-trust` (`:82-95`), `scheduled-task` including the per-user AI reconcile task (`:98-128`),
`config` (`:131-142`) and `codex-machine` (`:144-157`). Production seams at `:164-172`.

It is wired into exactly **one** call site: `Installers/cmd/devoid/uninstall_command.go:427`, inside
`executeRemoteUninstall` — the console-initiated remote uninstall — where a non-empty result forces
`cleanupVerified=false` and keeps the endpoint enrolled rather than deregistering it. That is exactly
the right pattern.

Two gaps:

- **There is no stage for the machine payload.** `machineConfigResidue`
  (`residue_probe_windows.go:244-262`) stats only `credentials.json` and `config.json`, and the probe's
  own comment (`:131-134`) says the binary is "intentionally NOT probed here". So the one probe that
  exists is structurally blind to the exact defect in front of us.
- **It is not called from the interactive CLI uninstall (`runUninstall`,
  `cmd/devoid/uninstall_command.go:627`) or from the MSI path at all.** The MSI's teardown runs from
  the embedded guard, which has no residue verb.

### A lifecycle E2E harness already exists, already asserts the residue, and is never run

`Installers/windows-installer/e2e-tests/run-silent-install-e2e.ps1` (165 lines) drives scenarios
A/B/C plus `-IncludeExtended` DEPS/HOOKS/PHASE2/DEFERTOKEN. Each scenario "installs, verifies … ,
uninstalls, and checks clean slate" (`e2e-tests/README.md`).

`Installers/windows-installer/e2e-tests/lib/Verify.ps1:100-111`, `Test-NoDevoidInstalled`, already
asserts that `devoid.exe`, `devoid-daemon.exe`, `credentials.json`, the daemon task, the ARP entry, the
PATH entry and **all 19 shims in both `.exe` and `.cmd` form** are gone. That check would have caught
40 of the 41 files. It misses only `devoid-prompt-guard-host.exe` and anything not on the hard-coded
tool list (`Verify.ps1:6`).

**No workflow runs it.** `Installers/.github/workflows/release.yml` `build-msi`
(`release.yml:1043-1110`) *builds* the FlaUI suite (`:1106-1108`) and never executes it; the PowerShell
harness is not referenced anywhere in `.github/`. `finding-b-e2e.yml` is a shim-enforcement matrix
(Linux/macOS), not an install-lifecycle matrix. The assertion exists; the gate does not.

### Upgrade: more atomic than the strategy assumes, and missing the canary

`Installers/cmd/devoid/upgrade_msi_apply_windows.go:63-135` already does most of what strategy §10's
"Update" section asks for, in the right order:

- SHA-256 pin against the Ed25519-signed manifest, then an Authenticode signer pin (`:84-98`);
- anti-rollback floor advanced **before** the transaction (`:100-106`);
- `msiexec /i … ENROLLMENT_MODE=deferred /qn /norestart /L*v <log>` run **synchronously and waited on**
  (`:108-116`, argv at `:259-261`), so success is never reported on a mere launch;
- `verifyManagedInstallVersion` after a success exit (`:122-129`) — "a rolled-back transaction leaves
  the OLD binary in place, so this closes the 'reported success but stayed on the old version' gap".

What is genuinely absent:

- **No post-upgrade functional canary.** The applied *version* is proved; nothing proves the new
  generation still intercepts. A build that installs cleanly and cannot reach a decision passes.
- **No retained upgrade evidence.** On success both the MSI and the verbose log are deleted
  (`:130-131`).
- **Binary rollback to a lower version is refused by design** — `release.PersistAcceptedRelease` is
  forward-only and the floor is advanced before the transaction. This is correct and must stay; see
  "What this wave deliberately does NOT do".

### The upgrade brick class that has now fired three times

`Installers/cmd/devoid-msi-root-guard/guard_windows.go:1047-1096`, `inspectRootEntries`, hard-fails
with `machine root contains unknown entry %q` on any name in `%ProgramData%\devoid` that is not in a
hand-maintained allowlist: `boundaryChildNames` (`:624-630` — `bin, config, logs, evidence, doctor,
aitrust`) plus `credentials.json`, `daemon-token`, `endpoint-identity.json`, the install-mode marker
and `proxy-config` (`:1062-1068`). The guard runs from the MSI Binary table with `Return="check"`, so a
failure is 1722 → 1603 → the whole upgrade rolls back.

The file documents the shape in its own words (`:1010-1027`): the agent creates a new root entry, the
allowlist has never heard of it, "the next MSI operation dies". It has fired on `.staging`
(F-MSI-1722), on `aitrust` (F13/DF-71), and on `endpoint-identity.json` — the last one caught on the
owner's box on 2026-08-20, where "a 7.8.42 endpoint that had enrolled the night before refused
7.8.43". The defence added each time is a *per-name* pin
(`TestActivationStoreDirNameMatchesKeystore`, `TestEndpointIdentityFileNameMatchesConfig`). **There is
no completeness pin.** The fourth new root entry bricks every enrolled endpoint's next upgrade, and —
as the file itself says — "every CI matrix in the world stays green", because a clean-box install never
creates the entry.

### The post-install ungoverned window

`Installers/internal/aiwiretask/aiwiretask.go`: `TaskName = "Devoid AI Governance Reconcile"` (`:144`),
`RepeatInterval = "PT5M"` (`:170`), `LogonDelay = "PT1M"` (`:178`), principal `BUILTIN\Users`
(`UsersGroupSID`, `:211`), action pinned to `<machineRoot>\bin\devoid-daemon.exe ai reconcile`
(`TaskArguments :150`, `TaskExeName :154`, `ValidateExe :241`). Registration is `schtasks /Create /F
/XML` (`CreateArgs :328-338`) — **there is no `/Run`, anywhere.** Nothing kicks the task at install
time, so the endpoint is installed-but-unwired for roughly the first minute of the session, with the
installer already exited 0, exactly as SOT §3.3 and §6 state.

The `PT1M` delay is not arbitrary: the comment at `:172-178` records that it exists so the reconcile
does not compete with the logon storm and so the SYSTEM daemon has bound its loopback wire proxy first.
**Shortening it re-arms the race it was added to remove.** The honest closures are (a) make the state
reported rather than silent and (b) make the first governed launch prove it wired — not to shave the
delay.

---

## Task 1: Diagnose the 41-file residue by elimination, and write the mechanism down

**Files:**
- New evidence file: `.plans/9plus-20260828/evidence/w7/residue-diagnosis.md`
- New script: `Installers/windows-installer/e2e-tests/diagnose-uninstall-residue.ps1`
- Read-only inputs: `Installers/windows-installer/msi-build/Product.wxs`,
  `Installers/windows-installer/msi-build/CustomActions.wxs`,
  `Installers/install-scripts/production/uninstall.ps1`

**Blast radius:** None to the product — the script installs and uninstalls on a disposable VM and
writes only under `%TEMP%` and the evidence file. The risk is *diagnostic*, not operational: if this
task guesses instead of measures, Task 4 fixes the wrong thing and the residue survives a release that
claims to have removed it. That failure is invisible until a customer's security review finds
`claude.exe` on a machine they believe is clean.

**Rollback:** Delete the script and the evidence file. Nothing shipped.

- [ ] **Probe 0 — is it `BINDIR`-specific or package-wide?** The 2026-08-27 report enumerated
      `C:\ProgramData\devoid\bin` only. Before anything else, enumerate `CONFIGDIR` too. The MSI installs
      two files there (`com.devoid.prompt_guard.json`, `com.devoid.prompt_guard.firefox.json`,
      `Product.wxs:397-408`). **If those were removed while all 41 `BINDIR` files stayed, the fault is
      directory-scoped** (lock, ACL, `FILE_DELETE_CHILD`, or a `BINDIR`-only component-state problem).
      **If both stayed, it is package-scoped** (registration or component-client refcount). This single
      observation halves the search space and costs one `Get-ChildItem`.
- [ ] **Probe 1 — creation timestamps.** For each residue file record
      `(Get-Item $f).CreationTimeUtc` and `LastWriteTimeUtc` against the uninstall's start time
      (captured before `msiexec /x`). A creation time *after* the uninstall started means the files were
      removed and **re-created**, which is a completely different defect from "never removed" and points
      at a surviving writer (the daemon's self-heal, a shim process that outlived `CA_KillProcesses`, or
      the per-user reconcile task). This is the cheapest discriminator in the set; run it first.
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
        **H4: the MSI transaction never ran** — the removal went through
        `uninstall.ps1`'s auto-recovery force-strip (`uninstall.ps1:1498-1502`) or
        `RemoveWindowsInstallerResidueForRecovery`
        (`internal/uninstall/windows_installer_windows.go:272`).
- [ ] **Probe 3 — the component-client hive, read before and after.** For each of the 41 component
      GUIDs in `Product.wxs`, compute the MSI packed GUID and read
      `HKLM\SOFTWARE\Classes\Installer\Components\<packed>`. Record the value names (each is a packed
      ProductCode) before install, after install, and after uninstall. **Two or more client
      ProductCodes after uninstall is H1, proven directly, independent of the log.** Note that
      `uninstall.ps1:480-514` removes `Products`, `Features` and `UserData\…\Products` and never
      `Components` — so the orphan survives every recovery run.
- [ ] **Probe 4 — reproduce on a clean VM.** If H1 is confirmed on the dev box, prove causation on a
      fresh Windows 11 VM by running: install → `uninstall.ps1 -Recover` (force-strip) → install →
      `msiexec /x` and asserting the residue appears; and the same sequence with the middle
      force-strip replaced by a normal `msiexec /x` and asserting it does not. **This is the step that
      turns a correlation into the mechanism.**
- [ ] Write `residue-diagnosis.md` containing: the Probe 0/1 numbers, the verbatim log lines that
      selected the hypothesis, the before/after `Components` hive dump, and one paragraph naming the
      mechanism. If two hypotheses survive Probe 4, say so and list what would separate them. **Do not
      write a mechanism the log does not contain** — the SOT already carries one wrong explanation
      (§3, §6: "not that the shim-hardening step has no uninstall counterpart") that survived long
      enough to be repeated.

**Defeat test:** `Test-DiagnosisCitesLogEvidence` in
`Installers/windows-installer/e2e-tests/tests/Report.Tests.ps1` — assert the diagnosis file contains at
least one line matching `^MSI \(s\)` (a verbatim msiexec log excerpt) and at least one matching
`HKLM\\SOFTWARE\\Classes\\Installer\\Components`. Revert by removing the log excerpt from the evidence
file; expect RED with `"residue-diagnosis.md names a mechanism with no msiexec log excerpt behind it"`.

**Exit:** `.plans/9plus-20260828/evidence/w7/residue-diagnosis.md` exists, names exactly one mechanism,
and contains the verbatim msiexec log line and the before/after `Components` hive dump that select it.
**No task after this one may be implemented until this file exists.**

---

## Task 2: Give the existing residue probe a machine-payload stage

**Files:**
- `Installers/internal/uninstall/residue_probe_windows.go` (add stage + seam)
- `Installers/internal/uninstall/residue_probe_windows_test.go` (new cases)
- `Installers/internal/uninstall/residue_probe_other.go` (unchanged — still returns nil)
- `Installers/cmd/devoid/uninstall_command.go` (`residueStages`, `:485`)

**Blast radius:** The probe currently gates `cleanupVerified` on the **remote** uninstall path only
(`uninstall_command.go:427`). A new stage that fires spuriously makes a *successful* console-initiated
uninstall report `failed + retryable` and keeps the endpoint enrolled — an operator-visible false
alarm, and a fleet whose endpoint count does not go down. That is the whole blast radius: no removal is
blocked, no file is deleted, no install path changes. The stage must therefore tolerate exactly what
Windows genuinely cannot delete.

**Rollback:** Delete the stage's block and its seam field; the other six stages are untouched. One
commit, one file.

- [ ] Write `TestProbeReportsSurvivingMachinePayload` first, with the injected seam returning the exact
      2026-08-27 shape — 41 files under `<machineRoot>\bin` including `claude.exe`, `codex.exe`,
      `npm.exe` — and assert one `ResidueItem{Stage: "machine-payload"}`. It must be RED: no such stage
      exists.
- [ ] Add `machinePayloadResidue func() []string` to `residueProbeSeams`
      (`residue_probe_windows.go:18-34`), wired in `realResidueSeams` (`:164-172`) to a new
      `machineBinResidue()` that enumerates `%ProgramData%\devoid\bin` and
      `%ProgramData%\devoid\.premigration` — **names only, never contents**, matching the file's
      existing "carries NO secrets" contract (`residue_probe.go:3-10`).
- [ ] Add the stage between `config` and `codex-machine`, reporting **one row carrying the file count
      and total bytes**, e.g. `"41 executable/script files (424 MB) remain in the DeVoid machine bin
      directory"`. A count and a size are what make the row actionable and what let the E2E harness in
      Task 8 assert a number.
- [ ] **Tolerate the one thing Windows cannot do.** Write
      `TestProbeToleratesPendingRebootDeleteBinary` before the tolerance code: a bin directory holding
      **only** files listed in
      `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations` must return
      **no** `machine-payload` row. This mirrors the existing, deliberate carve-out at
      `residue_probe_windows.go:131-134`. Read the real value through a seam so the test needs no
      registry.
- [ ] Add `TestProbeCountsOnlyMachineBinNotUserState` so the stage can never be widened into a user
      profile — the probe runs as SYSTEM and must stay on the machine boundary.
- [ ] Extend `residueStages` (`uninstall_command.go:481-495`) so `machine-payload` appears in the
      operator message, and assert the message text in `uninstall_command_test.go`.

**Defeat test:** `TestProbeReportsSurvivingMachinePayload` — revert by deleting the
`machinePayloadResidue` block from `probeWindowsResidueWith`; expect RED with
`"want 1 machine-payload residue item, got 0 — a 41-file bin directory would be reported as a clean
uninstall"`.

**Exit:** `go test ./internal/uninstall/... ./cmd/devoid/...` green with **4 new tests**, and
`ProbeWindowsResidue()` returns a non-empty result on a machine whose `bin` holds ≥1 non-pending-delete
file.

---

## Task 3: Make an incomplete removal impossible to report as a clean one — without ever blocking removal

**Files:**
- `Installers/cmd/devoid-msi-root-guard/main_windows.go` (new verb)
- `Installers/cmd/devoid-msi-root-guard/teardown_windows.go` (verb implementation)
- `Installers/windows-installer/msi-build/CustomActions.wxs` (one CA + one sequence row)
- `Installers/cmd/devoid/uninstall_command.go` (`runUninstall`, `:627`)

**Blast radius:** This is the task most able to break the product, and the constraint is absolute:
**the new custom action must be `Return="ignore"`, scheduled after `RemoveFolders`, and must never
change msiexec's exit code.** A fail-closed uninstall checkpoint on a condition we cannot yet prove is
precisely the July 2026 shape — a machine that will not uninstall gets the agent removed by force and
the operator never installs it again. `Product.wxs:366-372` already records a `RemoveFolder` at this
point failing an uninstall with 1603. The blast radius when done right is one extra ~50 ms SYSTEM
process per uninstall and one small file written under `%ProgramData%\devoid\evidence`; when done
wrong it is a fleet that cannot be uninstalled.

**Rollback:** Remove the single `<Custom Action="CA_RecordUninstallResidue" …>` row from
`CustomActions.wxs`'s `InstallExecuteSequence` and rebuild. The verb can stay in the binary unused; it
is inert without the sequence row.

- [ ] Write `TestUninstallResidueCAIsAdvisoryAndLast` in
      `Installers/windows-installer/msi-build/customactions_contract_test.go` (the existing contract-test
      file for this authoring) **first**: parse `CustomActions.wxs` and assert the new CA has
      `Return="ignore"`, `Execute="commit"`, is sequenced `After="CA_FinalizeMachineRootUninstall"`, and
      is conditioned `REMOVE~="ALL" AND NOT UPGRADINGPRODUCTCODE`. RED — the CA does not exist.
- [ ] Add verb `record-uninstall-residue` to the guard's argv switch
      (`main_windows.go:18-19`, `:33-70`) and implement it in `teardown_windows.go`: enumerate `BINDIR`,
      subtract `PendingFileRenameOperations`, and append one JSON line to
      `%ProgramData%\devoid\evidence\uninstall-residue.json` — `{ts, filesRemaining, bytesRemaining,
      names[], productCode}`. Reuse the guard's existing no-reparse, hard-link-checked,
      trusted-owner-validated write primitive from `appendGuardFailureLog`
      (`main_windows.go:105-165`); **do not write a second, weaker one** — that function's security
      notes exist because this code runs as SYSTEM on a path an attacker may control.
- [ ] Always `os.Exit(0)`. Add `TestRecordUninstallResidueAlwaysExitsZero` covering: bin absent, bin
      unreadable, evidence dir absent, disk full (injected error).
- [ ] In the CLI path, call `uninstall.ProbeWindowsResidue()` at the end of `runUninstall`
      (`uninstall_command.go:627`) and **print** the stages. Do not change the CLI's exit code in this
      task — printing is enough to stop a human reporting a clean uninstall that was not one, and it
      cannot brick anything.
- [ ] Add `TestCLIUninstallPrintsResidueStages` asserting the printed text names `machine-payload` when
      the probe returns it.

**Defeat test:** `TestUninstallResidueCAIsAdvisoryAndLast` — revert by changing the CA's attribute to
`Return="check"`; expect RED with `"CA_RecordUninstallResidue must be Return=\"ignore\": a
transaction-aborting uninstall check bricks removal, and an uninstalled control protects nobody"`.

**Exit:** `%ProgramData%\devoid\evidence\uninstall-residue.json` is produced by a real MSI uninstall on
the VM, contains `filesRemaining`, and the uninstall's exit code is byte-identical to the exit code
before the change (**0**, measured both ways on the same VM snapshot).

---

## Task 4: Apply the repair the diagnosis selected — one pre-specified branch, no others

**Gate:** This task **must not start** before `residue-diagnosis.md` (Task 1) exists. Implement the
branch that file names, and only that branch.

**Files (by branch):**
- **H1 — orphaned component clients:** `Installers/install-scripts/production/uninstall.ps1`
  (`Remove-DevoidInstallerRegistrationByProductCode`, `:468-514`);
  `Installers/internal/uninstall/windows_installer_windows.go`
  (`windowsInstallerResidueCleanupScript`, `:303-333`); new
  `Installers/internal/uninstall/msi_component_clients_windows.go`.
- **H2 — feature deselected:** `Installers/windows-installer/msi-build/Product.wxs:585-591` (add
  `AND NOT Installed` to the level condition so it can never re-evaluate during removal).
- **H3 — re-created after removal:** `Installers/windows-installer/msi-build/CustomActions.wxs`
  (`CA_KillProcesses` scope, `:497-512`, `:643`) plus the surviving writer the diagnosis names.
- **H6 — deletion failed:** `Installers/internal/security/shim_hardening.go:99-132` (the `icacls
  /inheritance:r` pass) plus a `CA_QuiesceRuntimeForUpgrade`-style unlock before `RemoveFiles`.

**Blast radius (H1, the leading branch):** Deleting the wrong key under
`HKLM\SOFTWARE\Classes\Installer\Components` corrupts **other vendors'** installed products — a
machine-wide, non-obvious, support-call-generating failure that shows up weeks later as somebody else's
repair loop. This is the single most dangerous edit in the wave. It is only acceptable under three
constraints, all of which are testable: (1) the packed component GUIDs are compared against a **literal
allowlist generated from `Product.wxs`**, never a wildcard or a name match; (2) only the **value** whose
name is one of *our* packed ProductCodes is deleted, never the key and never another vendor's value;
(3) if a component key would be left with zero values, the key is left in place — MSI tolerates an
empty key, and deleting keys is where this goes wrong.

**Rollback:** Export `HKLM\SOFTWARE\Classes\Installer\Components` to a `.reg` file **before** the sweep
and write it beside the evidence record; restoring it is a single `reg import`. Ship that export as
part of the change, not as an operator instruction.

- [ ] Write `TestComponentClientSweepTouchesOnlyDevoidGuids` first: feed a synthetic hive containing
      the 41 DeVoid packed GUIDs **and** three foreign ones, and assert the foreign three are byte-identical
      afterwards. RED before the sweep exists.
- [ ] Write `TestComponentGuidAllowlistMatchesProductWxs`: parse `Product.wxs`, extract every
      `Component/@Guid`, and assert the Go allowlist is exactly that set. This is the pin that stops the
      allowlist drifting into a wildcard the first time someone adds a component.
- [ ] Write `TestSweepDeletesValuesNotKeys`: assert a component key that ends with zero values still
      exists.
- [ ] Implement the sweep; call it from **both** force-strip paths (`uninstall.ps1:468` and
      `windows_installer_windows.go:272`) so the two cannot diverge — the divergence between those two
      is why the orphan exists at all.
- [ ] Write the `.reg` export before any deletion, into
      `%ProgramData%\devoid\evidence\installer-components-backup.reg`, and fail the sweep closed (do
      nothing) if the export cannot be written. **Refusing to sweep is always safe; sweeping without a
      backup is not.**
- [ ] Re-run Task 1's Probe 4 sequence and assert the residue does not appear.

**Defeat test:** `TestComponentClientSweepTouchesOnlyDevoidGuids` — revert by replacing the allowlist
lookup with a prefix match on the packed-GUID string; expect RED with
`"foreign component {…} was modified: the sweep must match the 41 Product.wxs GUIDs exactly, never by
prefix"`.

**Exit:** On the clean VM, the Probe 4 sequence (install → force-strip → install → `msiexec /x`) leaves
**0 files** in `%ProgramData%\devoid\bin`, measured by the same script that measured 41.

---

## Task 5: Report the post-install ungoverned window instead of hiding it — and prove the first launch closes it

**Phase 1**, not Phase 5. Strategy §11 Phase 1: "no one-minute unwired state".

**Files:**
- `Installers/internal/aiwiretask/aiwiretask.go` (read-only in this task — **the `PT1M` delay does not
  change**)
- `Installers/cmd/devoid/main.go` (agent shim entry, the reconcile-if-drifted step)
- `Installers/internal/daemon/server.go` (posture/readiness surface)
- `Installers/windows-installer/msi-build/CustomActions.wxs` (`CA_RunDoctor`, `:529-542`, `:636`)

**Blast radius:** A readiness state that is wrong in the *pessimistic* direction makes a correctly
installed endpoint report `INSTALLED_NOT_READY` forever, and the console shows a fleet that looks
broken. A readiness state that is wrong in the *optimistic* direction is the status quo and is what we
are fixing. Nothing here blocks a launch, so no developer is stopped by it.

**Rollback:** The readiness field is additive; remove the field and the surface reverts to today's
behaviour. The shim change is one early-return removal.

- [ ] Write `TestReadinessIsNotReadyBeforeFirstReconcileStamp` first: with no durable reconcile stamp
      present, the readiness computation must return `INSTALLED_NOT_READY` with reason
      `ai-lane-not-yet-wired`. RED — no such state exists today.
- [ ] Write `TestReadinessBecomesReadyAfterStamp`: with a stamp newer than the install time, readiness
      is `READY`.
- [ ] Implement readiness off the **existing** durable reconcile stamp the shim already consults (SOT
      §5 "reconcile hooks if they have drifted, throttled to 15 minutes against a durable stamp") —
      **do not invent a second stamp**; two stamps is how this codebase grows a false green.
- [ ] Surface it: `devoid status` and the daemon's health payload report `INSTALLED_NOT_READY` until
      the first reconcile completes. Add `TestStatusPrintsNotReadyReason`.
- [ ] Write `TestFirstShimLaunchReconcilesWithNoStamp`: on a fresh install with **no** stamp, the first
      agent-shim launch must run the reconcile rather than skip it on the 15-minute throttle. This is
      the assertion that the CLI half of the window closes itself at first use; if it fails, the
      throttle is treating "absent" as "recent" and that is a real bug this task must fix.
- [ ] Make `CA_RunDoctor` run on **fresh install** as well as repair (it is currently `REINSTALL AND
      NOT REMOVE~="ALL"`, `CustomActions.wxs:636`) and keep `Return="ignore"` (`:534-542`) so it still
      cannot fail an install. Its value is that it writes the readiness state at install time, so the
      window is *recorded* from minute zero.

**Defeat test:** `TestReadinessIsNotReadyBeforeFirstReconcileStamp` — revert by making the readiness
computation return `READY` when the stamp is absent; expect RED with `"readiness reported READY with no
reconcile stamp: the endpoint has no hooks and no asserted route for the first minute and must not
claim otherwise"`.

**Exit:** On the VM, `devoid status` within 30 s of a fresh MSI install prints `INSTALLED_NOT_READY`,
and prints `READY` after the first reconcile — **two observations, timestamped, in
`.plans/9plus-20260828/evidence/w7/post-install-window.md`**.

---

## Task 6: Stop the fourth upgrade brick before it is written

**Files:**
- `Installers/cmd/devoid-msi-root-guard/guard_root_allowlist_completeness_test.go` (new)
- `Installers/cmd/devoid-msi-root-guard/guard_windows.go` (read-only unless the test goes red)
- `Installers/internal/core/config/*` (read-only — the source of the real names)

**Blast radius:** **Zero at runtime.** This task adds a test and changes no shipped behaviour. Its only
failure mode is a red CI leg that names a real, unlisted root entry — which is the point. The cost of
*not* doing it is measured: three occurrences, the most recent bricking every endpoint that had
enrolled.

**Rollback:** Delete the test file.

- [ ] Write `TestGuardAllowlistCoversEveryMachineRootWriter` first. Build the set of names the **agent**
      can create directly in `%ProgramData%\devoid` by enumerating the exported constants in
      `internal/core/config` that name machine-root children/files (`EndpointIdentityFileName` and its
      siblings — the same source `TestEndpointIdentityFileNameMatchesConfig`
      (`guard_endpoint_identity_windows_test.go:32-41`) already reaches for), and assert every one is
      accepted by `inspectRootEntries`. It should pass today; if it does not, it has already found the
      fourth brick.
- [ ] Add `TestGuardAllowlistIsClosedOverBoundaryChildNames`: assert every name in
      `boundaryChildNames` (`guard_windows.go:624-630`) is in the `inspectRootEntries` allowlist. The
      F13/DF-71 comment at `:613-623` says the divergence between creator and enumerator is exactly what
      armed `aitrust`; this pins the two halves together permanently.
- [ ] Add `TestGuardRejectsUnknownRootEntryWithActionableMessage`: an unknown entry must fail with a
      message naming the entry **and** telling the reader where to add it. The current text is
      `machine root contains unknown entry %q` (`guard_windows.go:1086`) — extend it to name
      `inspectRootEntries` and `boundaryChildNames` so the next engineer's fix takes minutes, not a
      brick.
- [ ] Add a `CONTRIBUTING`-level note next to `boundaryChildNames`: any new file or directory written
      to the machine root requires an allowlist entry **plus** a pin test in the same commit.

**Defeat test:** `TestGuardAllowlistCoversEveryMachineRootWriter` — revert by removing
`endpointIdentityFileName` from the `inspectRootEntries` allowlist (`guard_windows.go:1062-1068`);
expect RED with `machine root contains unknown entry "endpoint-identity.json"` — the exact string the
owner's box produced on 2026-08-20.

**Exit:** **3 new tests** green in `go test ./cmd/devoid-msi-root-guard/...`, and the count of
machine-root names asserted by the completeness test equals the count of allowlist entries in
`inspectRootEntries` (**a number, printed by the test**).

---

## Task 7: Prove an upgrade still enforces, and recover forward when it does not

**Files:**
- `Installers/cmd/devoid/upgrade_msi_apply_windows.go:63-135`
- `Installers/cmd/devoid/upgrade_postcondition_test.go` (exists — extend)
- `Installers/cmd/devoid/upgrade_msi_apply_windows_test.go` (exists — extend)

**Blast radius:** A canary that is wrong in the failing direction turns a *successful* upgrade into a
reported failure and — if it triggered a remediation — could remove a working generation. The canary in
this task therefore **reports and re-runs; it never uninstalls, never downgrades, and never touches the
anti-rollback floor.** The strongest thing it may do is refuse to report success and leave the endpoint
running the version it just installed, which is the same generation msiexec already committed.

**Rollback:** The canary call is one statement after `verifyManagedInstallVersion`
(`upgrade_msi_apply_windows.go:127-129`); remove it and the upgrade path returns to today's
version-only proof.

- [ ] Write `TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot` first, with the canary seam injected
      to fail: `applyManagedMsiUpgradeIfNeeded` must return an error naming the canary. RED — no canary
      is called.
- [ ] Write `TestManagedUpgradeRetainsLogWhenCanaryFails`: on canary failure the verbose MSI log and the
      downloaded MSI must **not** be deleted (today both are removed unconditionally on a success exit,
      `:130-131`).
- [ ] Implement the post-apply canary as a **reuse** of the existing local canary surface, not a new
      one — the strategy's Workstream 8 canary is the same artefact and a second implementation is how
      two green lights start disagreeing. If Wave 8's canary is not yet callable in-process, the
      minimum honest subset here is: the new `devoid.exe` starts, reports the target version, and its
      daemon answers `/health` within the existing budget. State in the code comment that this is the
      **E1** subset and not a semantic canary.
- [ ] Write `TestUpgradeEvidenceRecordWritten`: on every managed upgrade attempt, success or failure,
      append one record to `%ProgramData%\devoid\evidence\upgrade.json` — `{from, to, msiExit,
      versionVerified, canaryResult, ts}`. Today a successful upgrade deletes its own evidence.
- [ ] Add `TestAntiRollbackFloorIsNeverLoweredByCanaryFailure`, pinning the one thing this task must
      not do: `release.PersistAcceptedRelease` is called before the transaction (`:100-106`) and a
      failing canary must leave that floor exactly where it is.

**Defeat test:** `TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot` — revert by deleting the canary
call from `applyManagedMsiUpgradeIfNeeded`; expect RED with `"upgrade reported success with a failing
canary: a version number is not proof the new generation enforces"`.

**Exit:** `%ProgramData%\devoid\evidence\upgrade.json` holds **≥2 records** from the VM matrix — one
successful upgrade and one deliberately failed one (inject a canary failure) — and the failed record
carries `canaryResult:"fail"` with the MSI log path retained on disk.

---

## Task 8: Run the lifecycle matrix that already exists

**Files:**
- `Installers/windows-installer/e2e-tests/run-silent-install-e2e.ps1` (add scenarios)
- `Installers/windows-installer/e2e-tests/lib/Verify.ps1` (`Test-NoDevoidInstalled`, `:100-111`)
- `Installers/.github/workflows/release.yml` (`build-msi`, `:1043-1110`) **or** a documented manual
  release gate — see the blast-radius note
- `.plans/9plus-20260828/evidence/w7/lifecycle-matrix.md`

**Blast radius:** Adding a job to `release.yml` that cannot get a runner blocks releases — and the
org's GitHub Actions posture has already blocked this repo once (Free-plan spending limit, 2026-08-26).
The harness also **requires an elevated Windows session, installs and uninstalls the real product, and
raises/lowers a real ECS service**; a hosted `windows-latest` runner can do the first two and must never
do the third. So: run it with `-Token` against a disposable backend or with the backend steps skipped,
on a runner that is either self-hosted or explicitly provisioned. **If neither is available, this task
lands as a named manual release gate with a recorded artifact — not as a CI job that will be disabled
the first time it is inconvenient.** State which of the two shipped.

**Rollback:** Remove the workflow job (or the runbook step). The harness itself is additive and already
in the tree.

- [ ] Write the failing assertion first: extend `Test-NoDevoidInstalled` (`Verify.ps1:100-111`) from a
      **known-name list** to a **whole-directory** check — after uninstall,
      `%ProgramData%\devoid\bin` must contain **0** files other than those listed in
      `PendingFileRenameOperations`. Run it against the current build on the VM; it must go RED with the
      real count. **The known-name list is what let `devoid-prompt-guard-host.exe` sit outside the
      check; an unknown-file check is what catches the next unexplained file.**
- [ ] Report the count and the byte total in the result detail so the evidence file carries numbers,
      not a boolean.
- [ ] Add three scenarios to the matrix, each one a transition the product has actually broken:
      `UPGRADE` (install N-1 → install N in place, assert no 1722/1603 and the new version reports),
      `ENROLLED-UPGRADE` (enrol, *then* upgrade — this is the only shape that reproduces the
      root-allowlist brick class from Task 6, and the reason "every CI matrix in the world stays
      green"), and `RECOVER` (install → force-strip via `uninstall.ps1 -Recover` → install →
      `msiexec /x` → assert clean, which is Task 4's regression test).
- [ ] Wire the run and publish `out\e2e-results-<v>.json` as a release artifact.
- [ ] Record in `lifecycle-matrix.md`: which scenarios ran, on which Windows build, and — explicitly —
      **which OS builds and user counts did not run**, so nobody reads a green matrix as coverage it
      does not have.

**Defeat test:** `Test-CleanSlateCountsUnknownFiles` in
`Installers/windows-installer/e2e-tests/tests/Report.Tests.ps1` — revert `Test-NoDevoidInstalled` to
the known-name list and place a single unexpected file in a synthetic bin directory; expect RED with
`"clean-slate passed with 1 unexplained file in bin: the check must enumerate the directory, not a
name list"`.

**Exit:** `out\e2e-results-<v>.json` from a real run, with **7 scenarios** (A, B, C, UPGRADE,
ENROLLED-UPGRADE, RECOVER, plus one `-IncludeExtended` case) each reporting
`clean-slate: filesRemaining=0`.

---

## Wave exit criteria

1. **The residue mechanism is written down and backed by a log line.**
   `.plans/9plus-20260828/evidence/w7/residue-diagnosis.md` names exactly one mechanism and quotes the
   msiexec log excerpt and the `Installer\Components` hive dump that select it. Defeat test:
   `Test-DiagnosisCitesLogEvidence`.
2. **A clean uninstall leaves 0 files in `%ProgramData%\devoid\bin`**, excluding anything queued in
   `PendingFileRenameOperations`, measured on a clean VM by the same script that measured 41. Defeat
   test: `TestComponentClientSweepTouchesOnlyDevoidGuids` (Task 4 branch) plus
   `Test-CleanSlateCountsUnknownFiles` (Task 8).
3. **No uninstall can report clean while residue remains**, on all three exit paths — remote (already
   wired), CLI (Task 3), MSI (Task 3's evidence record). Defeat test:
   `TestProbeReportsSurvivingMachinePayload`.
4. **The uninstall's exit code is unchanged by everything this wave adds.** Measured 0 before and 0
   after on the same VM snapshot. Defeat test: `TestUninstallResidueCAIsAdvisoryAndLast`.
5. **The post-install window is reported, not silent.** Two timestamped `devoid status` observations in
   `evidence/w7/post-install-window.md` — `INSTALLED_NOT_READY` within 30 s of install, `READY` after
   the first reconcile. Defeat test: `TestReadinessIsNotReadyBeforeFirstReconcileStamp`.
6. **The machine-root allowlist is closed over every writer**, with the asserted-name count equal to the
   allowlist-entry count. Defeat test: `TestGuardAllowlistCoversEveryMachineRootWriter`.
7. **An upgrade that installs but does not enforce is reported as a failed upgrade**, and both outcomes
   leave an evidence record — ≥2 records in `evidence/w7/`-referenced `upgrade.json`. Defeat test:
   `TestManagedUpgradeFailsWhenPostUpgradeCanaryDoesNot`.
8. **The lifecycle matrix ran**, with 7 scenarios including `ENROLLED-UPGRADE` and `RECOVER`, and
   `lifecycle-matrix.md` names the OS builds and user counts that did **not** run. Defeat test:
   `Test-CleanSlateCountsUnknownFiles`.

**Ordering constraint that must not be violated:** nothing in this wave widens an agent↔backend
contract, so the Backend-before-agent rule is not triggered. But Task 4 and Task 8's `RECOVER` scenario
change what a *recovery* does, and a recovery is what an operator reaches for when a machine is already
wedged. Ship Task 3 (which only observes) in a release **before** Task 4 (which mutates the registry),
so the evidence record exists on the fleet before the sweep that is supposed to make it read zero.

---

## What this wave deliberately does NOT do

- **It does not implement A/B immutable version directories.** Strategy §10 asks to "stage the new
  DeVoid version beside the active one" and "atomically switch the active version". On this product a
  new directory under `%ProgramData%\devoid` is refused by `inspectRootEntries`
  (`guard_windows.go:1047-1096`) — the exact mechanism that has already bricked upgrades three times
  (Task 6). Adding `versions\<v>\` would re-arm that brick on every endpoint at once. The **strongest
  safe subset is what already exists plus Task 7**: the msiexec transaction is already atomic over the
  file set and already rolls back to the previous generation on failure, and
  `verifyManagedInstallVersion` already refuses to report success on a rolled-back transaction
  (`upgrade_msi_apply_windows.go:122-129`). An A/B layout is a Phase 4+ design change that needs the
  guard's boundary model rewritten first, and it should be its own wave with its own review.
- **It does not add binary rollback to a lower version.** The anti-rollback floor is forward-only by
  construction (`release.PersistAcceptedRelease`, called at `upgrade_msi_apply_windows.go:100-106`,
  before the transaction), and strategy §10's own Rollback section endorses that: "a historical body is
  reissued at a higher revision rather than lowering monotonic state". Building a downgrade path would
  weaken an existing guard to fit a task. Recovery from a bad build is **forward** — reissue the
  known-good body at a higher version — and that is a release-process capability, not endpoint code.
- **It does not shorten the `PT1M` logon delay** (`aiwiretask.go:172-178`). The delay exists to avoid
  a measured race with the logon storm and with the daemon binding its loopback proxy. Task 5 makes the
  window *visible* and makes the first launch close it; it does not trade a known race for a shorter
  gap.
- **It does not close the window for a profile whose owner never logs on.** A SYSTEM process may not
  write per-user AI configuration — that is the RA-3 boundary, stated at
  `internal/daemon/user_ai_wire_task.go:6-31`. There is no safe engineering fix; the honest handling is
  the readiness state in Task 5 plus fleet reporting (Wave 11's coverage truth). Do not write a task
  that pretends otherwise.
- **It does not add a `RemoveFolder` for `BINDIR`.** `Product.wxs:366-372` records that doing so failed
  an uninstall with 1603. Task 2/3/8 assert the directory is *empty*, which is the property that
  matters, and leave the empty ACL-hardened directory in place.
- **It does not touch the `SecurityBoundary` marker or the `RemoveFolder` rows that are already frozen**
  by prior incidents.
- **It does not attempt residue removal on a hostile local administrator's machine.** Strategy §2.1
  places that outside the initial certified profile; a local admin can re-create anything this wave
  removes. What we owe that case is detection and revoked assurance, not a cleanup arms race.
- **It does not claim the MSI and the script installer will be unified.** They differ on PATH assertion
  and on install-failure semantics (SOT §5, `install.ps1:2314-2334` vs `Product.wxs:373-379`), and
  unifying them is a larger change than this wave's constraint allows. Task 4 does require the two
  *recovery* paths to share one sweep, which is the narrow part that actually causes the defect.
