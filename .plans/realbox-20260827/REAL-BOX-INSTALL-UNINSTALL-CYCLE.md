# §0.4 — real-box MSI install/uninstall cycle, run 2026-08-27

Owner approved the cycle and the UAC prompts. Build under test: **`DevoidAgent.msi` 7.10.6**, built
locally from Installers `origin/main` @ `9503094e` (PR #179 merged) — *not* the shipped 7.10.5, which
does not carry tonight's uninstall fixes. Unsigned local build; Go 1.25.5 vs the release lane's 1.24.x.

Installed with `ENROLLMENT_MODE=none`, which skips `CA_SaveCredentials` and `CA_RegisterAgent`, so
**this box was never enrolled into production**.

## Pre-flight

Box was genuinely clean: no service, no MSI registration, no `C:\ProgramData\devoid`, and the owner's
`~/.claude/settings.json` and `~/.codex/config.toml` carried **no DeVoid wiring at all**.

Independent copy-only baseline taken first (originals never moved), sha256 over six files.

## INSTALL — PASS

`msiexec /i … /qn` → **exit 0, 172s**.

| Checked | Result |
|---|---|
| Machine root | `C:\ProgramData\devoid\{bin,config,logs,evidence,aitrust,doctor}` |
| Payload | 19 shim pairs + `devoid.exe`, `devoid-daemon.exe`, `devoid-prompt-guard-host.exe` |
| Daemon | running; task `Devoid AI Governance Reconcile` registered (logon + 1min, repeating) |
| Git lane | `repos map --install-hooks` → **"Installed hooks for 41 repositories"** |
| Owner's 6 config files **at install time** | **all UNCHANGED** |

**The MSI does not wire the AI lane. The per-user reconcile task does, ~1 minute later** — all five
Claude hooks plus `ANTHROPIC_BASE_URL → http://127.0.0.1:19280/proxy/anthropic`. The long-standing
"fresh install leaves the AI lane unwired" note is therefore **wrong about the outcome**: it is
unwired by the MSI and wired by the task. Measured, not inferred.

**The product's own backup is byte-identical to the independent baseline** —
`afbe218cc291b1ad368eb85d70304c5df1ab6b3d0008f3713fbdde37ae6f96e5` both. The stash holds the true
original, which is the precondition every restore claim rests on.

Codex user scope: additive, marker-delimited `# >>> devoid codex hook (managed) >>>` block; nothing of
the owner's removed. R5 installed; R7/R8 reported honestly as `unknown (coverage downgrade)`.

**Codex MACHINE baseline asserted** — `C:\ProgramData\OpenAI\Codex\requirements.toml`,
`allow_managed_hooks_only = true`, exact re-read matched `8dfd3fbcef6ed490`. **This is the Windows
machine root that no sandbox could reach**, and it refused to write per-user files as SYSTEM (§9.6).

## UNINSTALL — PASS on restore, one defect

`msiexec /x … /qn` → **exit 0, 213s**.

**All six config files restored BYTE-IDENTICAL to the pre-install baseline** — including the two that
were genuinely rewritten (settings.json gained 5 hooks + a proxy env; config.toml gained a 60-line
hook block). Both back to exact original bytes.

Also clean: scheduled task gone, no processes, MSI registration gone, machine PATH clean, `cmd`
AutoRun clean, PowerShell profile clean, `~/.devoid` removed, `~/.codex/managed_config.toml` removed,
vendor dir `C:\ProgramData\OpenAI\Codex` preserved with DeVoid's `requirements.toml` removed — exactly
what `codex-machine remove` documents.

### DEFECT — uninstall leaves 41 files / ~424 MB behind

`C:\ProgramData\devoid\bin` survives a successful uninstall, holding the 19 `.cmd` shims and 19 `.exe`
shims — **`claude.exe`, `codex.exe`, `npm.exe`, `go.exe`, `python.exe`, `pip.exe`, `yarn.exe`…** each a
21 MB copy of `devoid.exe` — plus `devoid-daemon.exe` and `devoid-prompt-guard-host.exe`.

`PendingFileRenameOperations` schedules **only `devoid.exe`** for post-reboot deletion. The other 40
are scheduled for nothing and stay forever.

**Cause:** the `.exe` shims are not MSI file components. They are created at install by
`CA_HardenShims` → `devoid.exe harden-shims --require-machine-root`, and `harden-shims` appears
**exactly once in the entire `.wxs` set** — there is no uninstall-side counterpart.

**Severity — measured, not assumed:** the ACL is correct (`SYSTEM`/`Administrators` FullControl,
`BUILTIN\Users` ReadAndExecute only) and a non-elevated write is refused, so there is **no planting
vector**; and the machine PATH no longer contains the directory, so nothing intercepts. This is disk
residue and a bad look — an uninstalled security product leaving a 21 MB `claude.exe` on disk — not a
functional or security compromise.

**Not a regression.** Tonight's merge touched no shim or harden file.

## NOT PROVEN by this cycle

**No hook was observed firing on this box.**

- **Claude lane:** all five hooks CONFIGURED `[OK]`, all five OBSERVED `NEVER FIRED`. The session
  running at the time had already read `settings.json` and does not reload hooks mid-session.
- **Codex lane:** the owner's installed client is **`0.149.0-alpha.4.1`**, which is outside every
  build whose hook-trust dialect DeVoid has observed accepted — including the `0.147` the pin was
  widened to tonight. The product states plainly that *"the hooks are not claimed to fire"*. Widening
  again needs two vendor artefacts for 0.149, not a version bump.

So §0.4's install/uninstall obligation is met; §2.2's two Windows MACHINE lanes are **not** closed by
this run, because a machine root being writable is not the same as a hook firing in it.
