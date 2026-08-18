# REAL-BOX PACKET — the items that cannot be closed from a session

**Scope authority:** `OPEN-REGISTER-TO-DONE.md` **section E** ("Needs a real box — cannot be closed here, by
construction"), plus three items an adversarial review filed on 2026-08-18 that are **asserted from source and
never observed**. Cross-referenced against `S10-GATE-RESULTS.md` (which rows are BLOCKED on hardware and why).

**Verdict rule in force (Rule 0):** a row is PASS only with pasted evidence **and an exercised defeat step**. A
check you could not make fail did not run — it is NOT-RUN, not PASS. Every entry below therefore carries a
defeat step, and where a defeat step could not be specified honestly the entry says so and is marked
**UNFALSIFIABLE AS SPECIFIED**.

**Source of expected strings:** `C:/cwt/int-go`, branch `integ/gate-go`, read 2026-08-18. Where a string could
not be verified against that tree it is tagged **[NEEDS CONFIRMATION]** and must not be treated as an expected
value until confirmed.

---

## ⛔ STANDING GUARDRAILS — read before anything below

1. **The only DeVoid agent enrolled on this workstation points at PRODUCTION (`https://api.devoid.one`).**
   Nothing in this packet may install, uninstall, re-enrol, re-key, or run `harden-shims` against it. Every
   install/ACL/credential item runs on a **disposable VM**. Items marked `[HOST-SAFE: READ ONLY]` may be run on
   the workstation because they only read.
2. **Never move or overwrite anything under `C:\ProgramData\devoid`** on the workstation — not even to back it
   up. Copy-only, and only when an entry explicitly says to copy.
3. **Never print a credential value.** Every entry below asks only for *presence, path, size and ACL* — never
   contents. `type`/`cat`/`Get-Content` on `credentials.json`, `daemon-token` or `endpoint-identity.json` is
   forbidden by this packet.
4. **A reinstall has permanently bricked the trust anchor before (409 forever).** Any entry that reinstalls says
   so in bold and runs only on a VM you are willing to destroy.
5. **Do not disable or bypass the DeVoid tool-risk guard** to make a step run. If a step is blocked, record it
   blocked.
6. **Deploy ordering (applies to anything that pairs an agent build with a backend):** never cut an agent
   release before the Backend detections work is deployed, or session-start 400s fleet-wide.

---

## Table of contents

Ordered so every zero-risk item is done first and every irreversible item last.

| # | Item | Register row | Risk | Est. |
|---|---|---|---|---|
| **0** | [Preflight — build the disposable box and the two binaries](#0-preflight) | — | none | **30 min** |
| **1** | [Release-manifest key resolution against real S3](#1-c11a-3--release-manifest-key-resolution-against-real-s3) | C11a-3 | none (read-only AWS) | **15 min** |
| **2** | [Queue age from real CloudWatch `GetMetricData`](#2-c11d-3--queue-age-from-real-cloudwatch-getmetricdata) | C11d-3 | none (read-only AWS) | **15 min** |
| **3** | [What a DeVoid block looks like to `codex exec --json`](#3-c2f-cli-cx9--what-a-devoid-block-looks-like-to-codex-exec---json) | C2f-CLI-CX9 | low, reversible | **25 min** |
| **4** | [WSL enumeration-unknown: three surfaces, one green tick](#4-new-item-c--wsl-enumeration-unknown-surfaces) | **new (adversarial)** | low, reversible | **30 min** |
| **5** | [WSL roll-up branch + console surface](#5-c2d-5--c2d-6--wsl-roll-up-branch-and-console-surface) | C2d-5 / C2d-6 | low, reversible | **25 min** |
| **6** | [The exit-2 deny contract on Codex 0.147](#6-c2b-2b--the-exit-2-deny-contract-on-codex-0147) | C2b-2b | low, reversible | **45 min** |
| **7** | [Block rendering in Codex Desktop and the VS Code extension](#7-c2j--block-rendering-in-codex-desktop-and-the-vs-code-extension) | C2j | medium, reversible | **40 min** |
| **8** | [Enrolment, policy round-trip, ungoverned-window console state](#8-b1b--b3--c3c--enrolment-policy-round-trip-ungoverned-window) | B1b / B3 / C3c | medium (VM only) | **45 min** |
| **9** | [C8 agent half — receipt round-trip from a real endpoint](#9-c8-agent-half--receipt-round-trip-from-a-real-endpoint) | C8 | medium (VM only) | **25 min** |
| **10** | [Daemon restart mid-turn under the SCM](#10-c2i-2--daemon-restart-mid-turn-under-the-scm) | C2i-2 | medium (VM only) | **20 min** |
| **11** | [⚠ Daemon-token hardening brick](#11-new-item-a--the-daemon-token-hardening-brick-c3) | **new (adversarial)** | **DANGEROUS — blocks installs** | **30 min** |
| **12** | [⚠ Read-loosened signing key, MSI vs script install](#12-new-item-b--the-read-loosened-signing-key-on-a-script-install-c10) | **new (adversarial)** | **DANGEROUS — F16-adjacent** | **45 min** |
| **13** | [🔥 DACL across fresh / upgrade / lite / re-enrol](#13-c6b--dacl-across-fresh--upgrade--lite--re-enrol) | C6b | **IRREVERSIBLE** | **90 min** |
| **14** | [🔥 Stage E — second endpoint, second non-admin user, cross-tenant, nav-block](#14-stage-e--second-endpoint-second-user-cross-tenant-nav-block) | Stage E | **IRREVERSIBLE** | **60 min** |
| **15** | [Calendar-blocked: F8b fleet replay · F26 live handshake header](#15-f8b--f26--calendar-blocked) | F8b / F26 | n/a | **20 min active** |

**Total for items 0–14 in one sitting: ≈ 8 h 45 m.**
**Recommended cut line: finish item 12 (≈ 6 h 15 m) and schedule 13–14 as a separate destructive session.**
Items 13 and 14 destroy the VM; doing them last means an early stop costs nothing already earned.

---

<a name="0-preflight"></a>
## 0. Preflight — build the disposable box and the two binaries

**Est. 30 min · no risk · nothing to undo on the workstation**

### What we are proving
Nothing. This is setup: a throwaway Windows VM that is allowed to be enrolled, bricked and destroyed, plus the
`devoid.exe` and MSI built from `integ/gate-go` that every later item measures.

### Why it can't be done from here
The workstation's only enrolled agent points at production and must never be re-enrolled, so every install,
ACL and credential item needs a machine we are permitted to destroy.

### Preconditions

```powershell
# 1. Hyper-V (or your hypervisor) is available — prints True/False
(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All).State -eq 'Enabled'

# 2. Go toolchain present — prints a version, or errors
go version

# 3. The integration tree is on the expected branch — must print integ/gate-go
git -C C:/cwt/int-go branch --show-current

# 4. The tree has no unresolved merge — must print nothing at all
git -C C:/cwt/int-go diff --name-only --diff-filter=U
```

> **Note (measured 2026-08-18):** `C:/cwt/int-go` is **actively edited by concurrent sessions**. It was mid-merge
> with `internal/core/config/machine_secret_hardening_windows.go` in `UU` state during this packet's source read,
> and the conflict was resolved by another session minutes later. **Run check 4 and re-run `go build ./...`
> immediately before building anything you will carry to the VM**, and record the commit you built:
> `git -C C:/cwt/int-go rev-parse --short HEAD`.

### The commands

```powershell
git -C C:/cwt/int-go rev-parse --short HEAD          # RECORD THIS. Every verdict below is against this SHA.
cd C:/cwt/int-go
go build ./...                                        # must exit 0
go build -o C:/verify/devoid.exe ./cmd/devoid
C:/verify/devoid.exe --version
```

Then create the VM: Windows 11, 4 vCPU / 8 GB, **checkpoint it while clean and name the checkpoint
`CLEAN-PRE-DEVOID`**. Copy `C:/verify/devoid.exe` and the built MSI to `C:\verify\` inside the VM.

```powershell
# On the HOST, after the VM is installed and before anything DeVoid touches it:
Checkpoint-VM -Name <vm-name> -SnapshotName 'CLEAN-PRE-DEVOID'
Get-VMSnapshot -VMName <vm-name> | Select-Object Name, CreationTime
```

### Expected output
- `go build ./...` → exit `0`, no output.
- `Get-VMSnapshot` lists exactly one row named `CLEAN-PRE-DEVOID`.

### Defeat step
Prove the checkpoint actually restores **before** you rely on it. Inside the VM create `C:\verify\CANARY.txt`,
then on the host `Restore-VMSnapshot -VMName <vm-name> -Name 'CLEAN-PRE-DEVOID' -Confirm:$false` and boot.
**PASS = `C:\verify\CANARY.txt` is gone.** If the file survives, the checkpoint is not a real rollback and
**items 11–14 must not be run**, because their only undo is the snapshot.

### How to undo it
Nothing on the workstation. On the VM: restore `CLEAN-PRE-DEVOID`.

### Danger flags
None yet — but every later Danger flag assumes this checkpoint exists and was proven to restore.
