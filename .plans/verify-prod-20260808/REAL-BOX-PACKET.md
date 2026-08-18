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

**Total for items 0–14 in one sitting: 540 min = 9 h 00 m** (item 15 adds 20 min of active work but is
calendar-blocked, not box-blocked — see item 15).

**Recommended cut line: finish item 12 (items 0–12 = 390 min = 6 h 30 m) and schedule 13–14 as a separate
destructive session (150 min = 2 h 30 m).** Items 13 and 14 destroy the VM; doing them last means an early stop
costs nothing already earned.

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

---

# PART 1 — ZERO MACHINE-STATE CHANGE

Items 1-3 change nothing that needs undoing. Items 1 and 2 are `[HOST-SAFE: READ ONLY]` and may be run on the
workstation. Item 3 runs on the VM.

---

<a name="1-c11a-3--release-manifest-key-resolution-against-real-s3"></a>
## 1. C11a-3 — release-manifest key resolution against real S3

**Est. 15 min · no risk · `[HOST-SAFE: READ ONLY]` · nothing to undo**

### What we are proving
That the installer's release-manifest binding actually resolves against the real production S3 buckets, and
that it refuses an install whose download URL is not bound to the manifest's artifact key.

### Why it can't be done from here
The binding compares a live `Invoke-WebRequest` result from `installers-prod.s3.eu-north-1.amazonaws.com`
against a host pin on `installer-binaries-prod.s3.eu-north-1.amazonaws.com`; there is no local substitute for
either bucket, and a stubbed HTTP server would only prove the stub.

### Preconditions

```powershell
# 1. Network reachability to the manifest bucket - prints 200 for yes
(Invoke-WebRequest -Uri 'https://installers-prod.s3.eu-north-1.amazonaws.com/channels/stable.json' -UseBasicParsing -TimeoutSec 20).StatusCode

# 2. Discover the current stable version (do NOT hardcode it)
$stable = (Invoke-WebRequest -Uri 'https://installers-prod.s3.eu-north-1.amazonaws.com/channels/stable.json' -UseBasicParsing -TimeoutSec 20).Content | ConvertFrom-Json
$stable.version
```

### The commands

```powershell
$ver = ($stable.version).TrimStart('v')
$mf  = (Invoke-WebRequest -Uri "https://installers-prod.s3.eu-north-1.amazonaws.com/releases/$ver/manifest.json" -UseBasicParsing -TimeoutSec 20).Content | ConvertFrom-Json

# The three facts the installer binds on, for windows-amd64:
$mf.artifacts.'windows-amd64'.key
$mf.artifacts.'windows-amd64'.sha256
$mf.version

# Is this a transitional (unsigned) manifest or a signed one? Decides which
# refusal string the defeat step below must expect.
$mf.manifestSignature
$mf.schemaVersion

# Does the pinned artifact key actually exist in the binaries bucket?
$artUrl = "https://installer-binaries-prod.s3.eu-north-1.amazonaws.com/" + $mf.artifacts.'windows-amd64'.key
(Invoke-WebRequest -Uri $artUrl -Method Head -UseBasicParsing -TimeoutSec 30).StatusCode
```

### Expected output
- `$mf.artifacts.'windows-amd64'.key` matches the shape `releases/<ver>/windows/amd64/...` — the installer's own
  test is literally `-notlike "releases/$verClean/$Os/$Arch/*"` (`install-scripts/production/install.ps1:903`).
- `$mf.artifacts.'windows-amd64'.sha256` is 64 hex characters (`^[0-9A-Fa-f]{64}$`).
- `$mf.version` equals `$ver` exactly.
- The HEAD against the binaries bucket returns `200`.

**PASS = all four.** Any one of them failing is the finding.

### The defeat step
Prove the *installer* rejects a mismatch, not merely that the bucket is well-formed. The binding under test is
`install.ps1:903-908` (signed) / `:823-828` (transitional): it fails the install unless the download URL's
**host is exactly** `installer-binaries-prod.s3.eu-north-1.amazonaws.com` **and** its path equals the manifest's
`key`.

On the VM, take a local copy of `install-scripts/production/install.ps1`, and change **only** the
`$DownloadUrl` value handed to the manifest-binding function so that it names a key the manifest does not
carry (e.g. `releases/0.0.0/windows/amd64/devoid.exe`). Then run it elevated.

**Expected on defeat — the install MUST abort, printing exactly one of:**

```
Refusing install: backend URL is not bound to signed artifact key <key>
```
```
Refusing install: backend URL is not bound to manifest artifact key <key>
```

The **signed** string fires when `$mf.manifestSignature` AND `$mf.schemaVersion` are both present; the
**transitional** string fires when either is absent. You read both values in the commands above — expect the
matching one.

**A run that proceeds to download is a FAIL of the row, not a pass.**

Second, cheaper defeat on the same binding: leave the key correct and change only the **host** to any other
S3 hostname. The same refusal must fire — proving the host pin is load-bearing and not decorative.

### How to undo it
Nothing on the workstation — item 1's main commands are HTTP GETs. The defeat runs on the VM and aborts before
writing anything; if it did not abort, that is the finding, and you restore `CLEAN-PRE-DEVOID`.

### Danger flags
- **Do not run the defeat on the workstation.** A *successful* (non-aborting) install would place a second agent
  next to the production one.
- Edit a **copy** of `install.ps1`. Do not modify the tree's copy — it is the artifact under test.

---

<a name="2-c11d-3--queue-age-from-real-cloudwatch-getmetricdata"></a>
## 2. C11d-3 — queue age from real CloudWatch `GetMetricData`

**Est. 15 min · no risk · `[HOST-SAFE: READ ONLY]` · nothing to undo**

### What we are proving
That `ApproximateAgeOfOldestMessage` on the scanner full-repo FIFO can actually be read from production
CloudWatch, so the lane's age can stop being reported as `NOT_MEASURED` with a null age.

### Why it can't be done from here
`ApproximateAgeOfOldestMessage` is emitted by AWS itself; there is no local substitute. S10-GATE-RESULTS records
this verbatim, and it is why `C11d-2`'s threshold is deliberately `null` rather than "a guess wearing a
number's clothing".

### Preconditions

```bash
# 1. AWS credentials resolve to the right account - must print 113627991972
aws sts get-caller-identity --query Account --output text

# 2. Region - prints eu-north-1 or nothing
aws configure get region

# 3. Discover the queue; do NOT hardcode the name
aws sqs list-queues --region eu-north-1 --queue-name-prefix codefence-scanner --output text
```

The lane named in the finding is `codefence-scanner-fullrepo-jobs.fifo`
(`.plans/verify-prod-20260808/evidence/LIVE-BATCH-1/FINDINGS.md:177`), whose sole consumer
`codefence-scanner-worker-fullrepo` was measured at desired=0/running=0 with the oldest message aging to
58,633 s. Use the name `list-queues` actually returns.

### The commands

```bash
QURL="<queue-url from list-queues>"
QNAME="$(basename "$QURL")"

# Instantaneous attributes (SQS API, not CloudWatch) - the fast sanity read
aws sqs get-queue-attributes --region eu-north-1 --queue-url "$QURL" \
  --attribute-names ApproximateNumberOfMessages ApproximateAgeOfOldestMessage

# The row's actual subject: the CloudWatch series over the last 24h
aws cloudwatch get-metric-data --region eu-north-1 \
  --start-time "$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time   "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --metric-data-queries "[{\"Id\":\"age\",\"MetricStat\":{\"Metric\":{\"Namespace\":\"AWS/SQS\",\"MetricName\":\"ApproximateAgeOfOldestMessage\",\"Dimensions\":[{\"Name\":\"QueueName\",\"Value\":\"$QNAME\"}]},\"Period\":300,\"Stat\":\"Maximum\"},\"ReturnData\":true}]"
```

### Expected output
- `get-queue-attributes` returns an `Attributes` object. **AWS omits `ApproximateAgeOfOldestMessage` entirely
  when the queue is empty** — record that as *empty*, never as *zero*.
- `get-metric-data` returns `"StatusCode": "Complete"` with a `MetricDataResults[0]` carrying **non-empty**
  `Timestamps` and `Values` arrays.

**PASS = `StatusCode: Complete` with at least one datapoint.** `Complete` with `Values: []` means the metric is
not being emitted for that queue — a finding, and exactly the state that would keep the lane permanently
`NOT_MEASURED`.

### The defeat step
Re-run the identical `get-metric-data` with a queue name that does not exist:

```bash
aws cloudwatch get-metric-data --region eu-north-1 \
  --start-time "$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time   "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --metric-data-queries '[{"Id":"age","MetricStat":{"Metric":{"Namespace":"AWS/SQS","MetricName":"ApproximateAgeOfOldestMessage","Dimensions":[{"Name":"QueueName","Value":"this-queue-does-not-exist"}]},"Period":300,"Stat":"Maximum"},"ReturnData":true}]'
```

**Expected on defeat: `StatusCode: Complete` with `Values: []`.**

**This is the load-bearing half of the item, and it is a finding either way.** CloudWatch returns *the same
shape* for "no such queue" and for "real queue, no traffic". So the defeat proves a real limitation:
**a `Values: []` result cannot by itself distinguish an abandoned lane from a typo'd queue name.** Any consumer
of this metric must carry the queue's existence as a separately-established fact, or it will report a
misconfiguration as a healthy quiet lane. Write that on the row explicitly — it is the reason a threshold alone
would not have been safe.

### How to undo it
Nothing. Both commands are read-only AWS API calls.

### Danger flags
- Do **not** use `put-metric-data` to synthesise a datapoint. That writes to production telemetry and would
  make the very metric under test untrustworthy.
- Do **not** enable a CloudWatch alarm as part of this item. Section C of the register already records the
  ordering hazard: alarms with `treatMissingData='breaching'` deployed before their producers fire everything
  at once, the alarms get muted, and the defect is recreated.

---

<a name="3-c2f-cli-cx9--what-a-devoid-block-looks-like-to-codex-exec---json"></a>
## 3. C2f-CLI-CX9 — what a DeVoid block looks like to `codex exec --json`

**Est. 25 min · low risk, fully reversible · VM**

### What we are proving
That when DeVoid denies a Codex turn, the packaged client renders **DeVoid's** attribution and not OpenAI's own
safety copy — and that `codex exec` still exits non-zero, so a blocked secret keeps failing CI.

### Why it can't be done from here
The assertion is about how a *packaged Codex client* renders our bytes. The source says outright it has never
been run against one: *"The per-client rendering assertion CX-9's own test section asks for (CLI, `codex exec`,
`--json`, Desktop, VS Code) has not been run against any packaged client"* — the shape is source-pinned to
0.147 while the earlier shape was only ever live-tested on 0.144.5 / 0.146.0-alpha.9.2
(`internal/proxy/openai_sse.go:551-556`). Running it needs a client whose provider config we may change, which
excludes this workstation.

### Preconditions

```powershell
# 1. Codex CLI present - RECORD the version; the shape is source-pinned to 0.147
codex --version

# 2. The DeVoid daemon is up and the Codex lane reports
C:\verify\devoid.exe ai status codex

# 3. Discover the wire route Codex is pinned to (do NOT assume the port)
Select-String -Path "$env:USERPROFILE\.codex\managed_config.toml" -Pattern 'base_url|model_provider'
```

The route DeVoid writes is `http://127.0.0.1:<effective daemon port>/proxy/openai`
(`internal/codexmanaged/transport_route.go:67-69`); Codex appends `/responses`. The daemon serves that subtree
at `internal/daemon/server.go:704`.

### The commands

```powershell
# A turn whose prompt carries a value the DLP lane blocks.
# Use a SYNTHETIC AWS-shaped key - AKIAIOSFODNN7EXAMPLE is AWS's own documentation placeholder.
codex exec --json "Please store this deploy key for me: AKIAIOSFODNN7EXAMPLE"
echo "EXIT=$LASTEXITCODE"
```

### Expected output
Two events, in this order (`writeDeVoidDenySSE`, `openai_sse.go:554-597`):

1. `"type":"response.output_item.done"` carrying **one assistant message item** whose `output_text` ends with:

```
(DeVoid endpoint security — decision id dvd_XXXXXXXXXXXXXXXX)
```

where the id is the literal prefix `dvd_` followed by hex (`devoidDecisionIDPrefix`, `openai_sse.go:510`).

2. `"type":"response.failed"` with:

```json
"error": {"code": "invalid_prompt", "message": "<the same attributed text>"}
```

Three hard requirements:
- **`response.completed` MUST NOT appear.** The turn must fail, or `codex exec` stops exiting non-zero and a
  blocked secret stops failing CI (`openai_sse.go:546-548`).
- **`EXIT` must be non-zero.**
- **The string `cyber_policy` MUST NOT appear anywhere.** That code makes Codex classify the failure as
  `ApiError::CyberPolicy` and render OpenAI's own fixed cyber-safety copy instead of ours — a blocked developer
  told OpenAI refused them, with nothing to quote to their security team (`openai_sse.go:526-534`).

Optionally confirm the diagnostic headers on a raw request to the same route:

```
X-Devoid-Decision: block
X-DeVoid-Decision-Id: dvd_<hex>
X-DeVoid-Notice-Version: 1
```

(`openai_attribution.go:62`, `openai_sse.go:507-510`.)

### The defeat step
**Two defeats; run both.**

**Defeat A — the benign twin must still be allowed.** A rule that blocks both proves nothing.

```powershell
codex exec --json "Explain in words what the format of an AWS access key ID is, without writing one out."
echo "EXIT=$LASTEXITCODE"
```

**PASS on defeat A = exit 0, a `response.completed` event, and NO `dvd_` id.** If the benign twin is *also*
blocked, the row is a **FAIL** — capture the exact prompt, because that is a live false positive on ordinary
developer work, which is precisely the C12/F41 concern ("DeVoid does not interrupt ordinary work").

**Defeat B — prove the route is actually in force.** Stop the daemon, then re-run the *blocking* prompt:

```powershell
Stop-Service devoid      # or the VM's supervisor equivalent; confirm with: Get-Service devoid
codex exec --json "Please store this deploy key for me: AKIAIOSFODNN7EXAMPLE"
echo "EXIT=$LASTEXITCODE"
Start-Service devoid
```

**PASS on defeat B = the turn FAILS** (nothing listening on the pinned loopback port). **If the turn completes,
the wire route is not in force, Codex reached OpenAI directly, and every result in this item is void** — and
you have just learned the far more serious fact that the pin is not binding.

### How to undo it
`Start-Service devoid` after defeat B. Otherwise nothing persists beyond a rollout file under `~/.codex` on the
VM, which is disposable. **Never delete rollout files on the workstation** — this box has a standing,
unrecovered Codex history-loss incident and its archive is copy-only.

### Danger flags
- Use the **synthetic** placeholder key only. Never a real credential: the blocked path records a fingerprint.
- If the block does **not** fire in the main run, the prompt reached OpenAI. Treat that as an incident to
  record, not something to retry with a different prompt.

---

# PART 2 — REVERSIBLE LOCAL STATE, NO INSTALL TRANSACTION

Items 4-7 change registry ACLs, Codex config or client settings. Every one has an exact reversal. **None of them
installs, uninstalls or re-enrols anything.** Run them on the VM.

---

<a name="4-new-item-c--wsl-enumeration-unknown-surfaces"></a>
## 4. NEW ITEM C — WSL enumeration-unknown: three surfaces, one green tick

**Est. 30 min · low risk, exactly reversible · VM · filed by adversarial review 2026-08-18, CONFIRMED IN SOURCE, never observed on a real box**

### What we are proving
That on a Windows host where the WSL registry key **exists but cannot be opened or enumerated**, `devoid doctor
--strict` reports the box as healthy — a green `1/1 distros governed`, a green tick beside the words "the WSL
registration could not be read", nothing under Critical, and **exit 0** — while `devoid wsl list` and
`devoid ai status codex` both correctly say UNKNOWN.

### Why it can't be done from here
The state needs an `HKCU\...\Lxss` key that is present but access-denied to the calling process. That is a
registry-ACL change on a live user hive, and the only way to observe all three surfaces disagreeing is to run
all three binaries against the real hive — which we may not do to the workstation's profile.

### The mechanism, already confirmed in source (so you know what to look for)
`internal/pathfix/pathfix_windows.go:371-378` — when `wslEnumerate()` returns `ok=false`, `inspectWSLWithExclusions`
returns **one synthetic result**:

```go
[]WSLResult{{ Distro: "(enumeration)", Action: profilepatch.ActionFailed,
  Message: "the WSL registration could not be read — DeVoid cannot say which distros exist" }}
```

That row has `Installed == false` and `ExitCode == 0`. Three separate consumers then treat it as benign:

| Consumer | Line | Predicate | Result on the synthetic row |
|---|---|---|---|
| `wslRowState` | `doctor_fix_render.go:511` | `if w.Installed && !w.Governed()` | not ungoverned → falls through to the green `✓` |
| `renderWSL` | `doctor_fix_render.go:684` | `if d.ExitCode != 0 \|\| (d.Installed && !d.HasDevoid)` | neither → icon stays `✓` |
| `collectCritical` | `doctor_fix_render.go:265` | `if !w.Installed \|\| w.Governed() { continue }` | skipped → Critical is empty |
| `composeStrictInspectExit` | `doctor_fix.go:221` | `if w.Installed && !w.HasDevoid { return 31 }` | not 31 → exit stays 0 |

`len(rep.WSL)` is 1, not 0, so the "no distros installed" branch never fires and the denominator is 1.

### Preconditions

```powershell
# 1. The Lxss key EXISTS on this profile - must print True. If False, install a
#    WSL distro first; a key that does not exist is (nil, true) = "genuinely zero
#    distros", which is a DIFFERENT state and not the one under test.
Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'

# 2. Baseline: all three surfaces agree BEFORE the change
C:\verify\devoid.exe wsl list;            echo "wsl-list EXIT=$LASTEXITCODE"
C:\verify\devoid.exe ai status codex
C:\verify\devoid.exe doctor --strict;     echo "doctor EXIT=$LASTEXITCODE"

# 3. SAVE THE ACL. This is the undo. Do not skip it.
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
Get-Acl -Path $key | Export-Clixml C:\verify\lxss-acl-backup.xml
Test-Path C:\verify\lxss-acl-backup.xml    # must print True before continuing
```

> **Note on the strict exit code.** `composeStrictInspectExit` also returns **40** when no system-effective
> surface is present and `--accept-user-only` was not passed (`doctor_fix.go:246-248`). Run this item against a
> **machine-scope install**, or add `--accept-user-only`, or the 40 will mask the 0 this item is about. Confirm
> at baseline: step 2's `doctor EXIT` must already be `0`.

### The commands

```powershell
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'

# Deny THIS user QueryValues + EnumerateSubKeys on the key.
# Deliberately NOT denying ReadPermissions / ChangePermissions / TakeOwnership:
# that keeps Get-Acl and Set-Acl working, which is what makes the undo guaranteed.
$acl  = Get-Acl -Path $key
$me   = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$deny = New-Object System.Security.AccessControl.RegistryAccessRule(
          $me,
          [System.Security.AccessControl.RegistryRights]'QueryValues, EnumerateSubKeys',
          [System.Security.AccessControl.InheritanceFlags]::None,
          [System.Security.AccessControl.PropagationFlags]::None,
          [System.Security.AccessControl.AccessControlType]::Deny)
$acl.AddAccessRule($deny)
Set-Acl -Path $key -AclObject $acl

# Confirm the state is the one under test: present but unreadable.
Test-Path $key                                   # still True (existence check needs no read)
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss"   # must print Access is denied

# Now the three surfaces.
C:\verify\devoid.exe wsl list;        echo "wsl-list EXIT=$LASTEXITCODE"
C:\verify\devoid.exe ai status codex
C:\verify\devoid.exe doctor --strict; echo "doctor EXIT=$LASTEXITCODE"
```

### Expected output

**`devoid wsl list` — CORRECT.** Exactly these two lines (`cmd/devoid/wsl.go:104-105`, via
`printWSLRegistrationUnknown`), and `wsl-list EXIT=31` (`runWSLList` returns 31, `wsl.go:117`):

```
[devoid] The WSL registration could not be read — DeVoid cannot say which distros exist here.
         This is an UNKNOWN, not a clean result, and not an empty machine.
```

**`devoid ai status codex` — CORRECT.** In the WSL section (`cmd/devoid/ai_status_wsl.go:52-53`):

```
  [?] WSL registration could not be read — DeVoid cannot say whether a WSL Codex exists here.
      This is an UNKNOWN, not a clean result.
```

**`devoid doctor --strict` — THE FINDING.** All four of these together are the PASS condition *for reproducing
the defect*:

1. A per-distro row rendered with a **green tick** and the distro name `(enumeration)`:
```
✓ (enumeration)   the WSL registration could not be read — DeVoid cannot say which distros exist
```
2. A summary row reading, with a **green tick**:
```
1/1 distros governed (enrolled + daemon answering)
```
3. **Nothing** listed under the `Critical` header for WSL.
4. `doctor EXIT=0`.

**Record all three surfaces' output side by side.** The item is the *disagreement*: same binary, same box,
seconds apart, one surface exits 31 saying UNKNOWN and another exits 0 saying governed.

> If the doctor instead prints `✗` or exits 31, the defect is **not** present in the build you tested — record
> the SHA from Preflight and say so. That is a legitimate and valuable outcome.

### The defeat step
The green tick must be shown to be *caused by the unreadable key*, not by the box simply being healthy. Two
halves, both required:

**Defeat A — restore the ACL and re-run the doctor.** (Commands in "How to undo it" below.) The summary row
must **change**: on a box with one governed distro it becomes a real `1/1 distros governed` backed by a real
probe; on a box with an ungoverned distro it must go **red**:

```
✗  1/1 distros NOT governed: Ubuntu [<reason>]
```

If the doctor prints the *identical* green line before and after the ACL change, then the row is not reading
the enumeration at all and **this item is UNFALSIFIABLE as run** — record it NOT-RUN and say why.

**Defeat B — prove the row is not merely counting.** Before restoring, keep the ACL denied and additionally
stop the daemon. Re-run `devoid doctor --strict`. The WSL row must **still** print the same green
`1/1 distros governed (enrolled + daemon answering)` — proving the words "enrolled + daemon answering" are
asserted about a distro that was never probed and, in this state, could not have been. **That is the sharpest
form of the finding**: the row makes a positive claim about enrolment and daemon liveness on the strength of a
registry read that failed.

### How to undo it

```powershell
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
Set-Acl -Path $key -AclObject (Import-Clixml C:\verify\lxss-acl-backup.xml)

# Verify the undo - must print the subkeys again, not "Access is denied"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss"

# And the surfaces agree again
C:\verify\devoid.exe wsl list; echo "wsl-list EXIT=$LASTEXITCODE"
```

If `Set-Acl` itself is refused, you are the **owner** of an HKCU key and therefore always retain implicit
`WRITE_DAC`. Fall back to:

```powershell
$acl = Get-Acl -Path $key
$acl.RemoveAccessRuleAll($deny)   # $deny from the session above
Set-Acl -Path $key -AclObject $acl
```

or, from an elevated prompt, remove the explicit Deny ACE with `regini` against a template file.

### Danger flags
- **Do not deny `ReadPermissions`, `ChangePermissions` or `TakeOwnership`.** Denying those can lock you out of
  your own key and turn a reversible experiment into a profile repair.
- **Do not run this on the workstation profile.** The workstation has a live WSL setup that the production
  agent reports on.
- Restart Windows Explorer or log off/on if any app behaves oddly while the Deny ACE is in place; WSL itself
  will not start while it is applied — that is expected and reverses with the ACL.

---

<a name="5-c2d-5--c2d-6--wsl-roll-up-branch-and-console-surface"></a>
## 5. C2d-5 / C2d-6 — WSL roll-up branch and console surface

**Est. 25 min · low risk, reversible · VM**

### What we are proving
**C2d-5:** that the WSL roll-up reports per-surface truth across clean Windows Codex layers — a covered distro,
an uncovered distro, and an unknown one — rather than collapsing them into one verdict.
**C2d-6:** whether any console surface consumes WSL coverage at all.

### Why it can't be done from here
C2d-5 needs two real distros with different baseline states, and the probe is run **from inside each distro**
(`wslCodexBaselineProbe`) — reading the distro filesystem from the Windows side is forbidden by the rule stated
in both `boundary.go` and pathfix's `probeWSLDistro`. This workstation's distros are governed by the
production agent.

### Preconditions

```powershell
wsl -l -v                      # must list at least two distros
C:\verify\devoid.exe wsl list  # baseline; record it
```

### The commands

```powershell
# Make the three states explicit, one per distro.
# COVERED: a real, non-empty baseline file
wsl -d <distroA> -u root -- sh -c 'mkdir -p /etc/codex && printf "x\n" > /etc/codex/requirements.toml'

# UNCOVERED: nothing there at all
wsl -d <distroB> -u root -- sh -c 'rm -rf /etc/codex/requirements.toml'

C:\verify\devoid.exe ai status codex
C:\verify\devoid.exe wsl list; echo "EXIT=$LASTEXITCODE"
```

### Expected output
From `reportCodexWSLSurfaces` (`cmd/devoid/ai_status_wsl.go:62-88`), one row per distro plus a tally:

- Covered distro:
```
  <distroA>                COVERED — a machine requirements baseline is present at /etc/codex/requirements.toml
      (a baseline file, not an enforcement proof: nothing here has observed that distro enforce)
```
- Uncovered distro:
```
  <distroB>                UNCOVERED (<reason>) — no usable baseline at /etc/codex/requirements.toml
      a Codex running in this distro is NOT governed by the Windows machine lock.
      govern it as its OWN endpoint: `devoid wsl bootstrap --distro <distroB>`
```
- Tally line:
```
  WSL surfaces: 1 covered · 1 uncovered · 0 unknown
```
- Plus an exclusion line naming any registered-but-excluded distro (e.g. `docker-desktop`), so an excluded
  distro is **visibly** excluded rather than silently absent (`wsldistro.ExclusionLine`).

**PASS = per-surface rows, not one collapsed verdict, and the exclusion line present when a Docker Desktop
registration exists.**

**[NEEDS CONFIRMATION]** The literal words `COVERED` / `UNCOVERED` / `UNKNOWN` are rendered from
`wslcodex.StateCovered` etc. via `%s`. Confirm the exact casing with
`grep -rn "StateCovered\s*=" C:/cwt/int-go/internal/wslcodex/` before treating the strings above as exact.

### The defeat step
**Defeat A — the fail-open probe (register #8).** Put a **directory** at the baseline path on distro B:

```powershell
wsl -d <distroB> -u root -- sh -c 'rm -f /etc/codex/requirements.toml && mkdir -p /etc/codex/requirements.toml'
C:\verify\devoid.exe ai status codex
```

The register records that the probe's predicate was `test -s`, so a **directory reads as `WSL_COVERED`**. The
fix must make this distro report **UNCOVERED with a reason naming the directory**, or **UNKNOWN** — never
COVERED. **If it prints COVERED, the row is a FAIL and register #8 is still live.**

**Defeat B — enumerator agreement (register #9).** Run the two surfaces back to back and diff the distro sets:

```powershell
C:\verify\devoid.exe wsl list        > C:\verify\wsl-list.txt
C:\verify\devoid.exe ai status codex > C:\verify\ai-status.txt
```

**PASS = the same distro names appear in both.** Both now start from `wslRegistrations`
(`cmd/devoid/wsl.go:89-97`, `ai_status_wsl.go:29-40`), so a difference means the shared-enumerator fix did not
take.

### C2d-6 — the console surface: MEASURED, and there is nothing there
Searched `Backend/src` and `Frontend` on 2026-08-18. **No backend or frontend code consumes WSL coverage.** The
only two hits are non-surfaces: a comment listing `'wsl-no-agent'` as one reason string in
`Backend/src/github-app/entities/endpoint-enforcement-status.entity.ts:69`, and a frontend **test fixture**
using `"wsl-ubuntu"` as an `executionHost` value in
`Frontend/app/ai-control-plane/__tests__/protection-depth.codex.test.tsx:81`.

**This half of the item is UNFALSIFIABLE AS SPECIFIED and needs no real box.** There is no surface to point a
browser at, so there is no defeat step that could turn it red. It is a **FAIL by absence**, decidable from
source, and it should be moved off the real-box list and onto the build list. Confirm before acting:

```bash
grep -rn "wslCoverage\|WSL_COVERED\|wslSurfaces" C:/Users/Owner/Documents/Ceragon/Backend/src C:/Users/Owner/Documents/Ceragon/Frontend
# Expect: no matches.
```

### How to undo it

```powershell
wsl -d <distroA> -u root -- sh -c 'rm -f /etc/codex/requirements.toml'
wsl -d <distroB> -u root -- sh -c 'rm -rf /etc/codex/requirements.toml'
C:\verify\devoid.exe wsl list    # back to the baseline you recorded
```

### Danger flags
- `/etc/codex/requirements.toml` is a **machine governance baseline**. Writing a placeholder into it makes that
  distro claim coverage it does not have. Remove it in the undo step, and never do this on a distro that is
  actually governed.
- **Do not run any of this against the workstation's distros.**

---

<a name="6-c2b-2b--the-exit-2-deny-contract-on-codex-0147"></a>
## 6. C2b-2b — the exit-2 deny contract on Codex 0.147

**Est. 45 min · low risk, reversible · VM**

### ⚑ STATUS CHANGE — read this before running
The register lists C2b-2b as **BLOCKED**, described as *"the repo contradicts itself on the highest-consequence
row"*: `DENY_MATRIX.md` (measured on 0.144) says exit 2 **allows**, while `adapters/codex/response.go:357`
(source read of 0.147) said exit 2 + non-empty stderr **blocks**.

**That contradiction has since been resolved by measurement, and the register entry is stale.** A frozen 0.147
corpus now exists at
`internal/airuntime/adapters/codex/testdata/shook/deny-matrix-0147/` (15 cases), and the source now records the
opposite of what the register says (`response.go:340-360`):

> codex-cli 0.147.0 prints `hook: PreToolUse Failed` for exit 2 exactly as it does for exit 1, **and runs the
> tool**. `04b-exit2-stderr` — exit 2, empty stdout, stderr "Devoid policy: shell blocked" → `hook: PreToolUse
> Failed`, `exec … succeeded`, `TOOL_RAN.txt` written. **ALLOWED.**

`ExitHookFailed = 2` is now named as *"the hook failed, and the original action proceeds"*, and the ONE channel
that enforces is documented as **exit 0 + stdout canonical/legacy deny JSON with a NON-EMPTY reason**.

### What we are proving
That the frozen 0.147 corpus reproduces independently on a second real box — i.e. that the measurement is a
property of the client and not of the machine it was taken on.

### Why it can't be done from here
It needs the real `codex.exe` 0.147.0 binary invoked directly with a scratch `CODEX_HOME` and a machine-scope
managed config, and it must be a box we may reconfigure. The corpus README pins the exact binary by SHA.

### Preconditions

```powershell
# 1. The binary under test - the corpus pins this exact SHA256
$codex = "$env:APPDATA\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe"
Test-Path $codex
(Get-FileHash $codex -Algorithm SHA256).Hash
# Expect: 935A1911ED2556E4FFCEC995F4886AC2AC425863BA26FED264DF62E30272AD9D
& $codex --version    # expect 0.147.0

# 2. Node present for the stub provider
node --version
```

**If the SHA differs, STOP and record the SHA you have.** A different binary makes every verdict below a
measurement of a different client, which is exactly the mistake that produced the 0.144-vs-0.147 contradiction
in the first place.

### The commands
Follow the corpus's own reproduction recipe verbatim
(`internal/airuntime/adapters/codex/testdata/shook/deny-matrix-0147/README.md`). Its load-bearing details, which
are the ones people get wrong:

- Invoke `codex.exe` **directly**. The DeVoid shim on `PATH` is not the thing under test.
- Provider: `testdata/shook/harness/stub_server.cjs` with `SHOOK_STUB_MODE=custom`, `SHOOK_STUB_TOOL=exec`, and
  `SHOOK_STUB_JS = await tools.shell_command({command:'…write a marker…'})`. **The `await` is load-bearing** —
  without it 0.147 discards the call, the run measures nothing, and it looks clean.
- Prefix the JS with `// @exec: {"yield_time_ms": 60000}`. A cold `pwsh.exe` start can exceed the exec tool's
  10 s default; the cell yields, the stub ends the turn, the child is killed before writing the marker, **and
  that looks like a block but is not one**.
- Posture: `codex exec --dangerously-bypass-hook-trust --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox`
  with a scratch `CODEX_HOME`, so the hook is the only thing that can stop the tool.
- **Hook scope: the blocks go in `$CODEX_HOME/managed_config.toml`, never `config.toml`.**

Then run the repo's own reader against your fresh captures:

```powershell
cd C:\cwt\int-go
go test ./internal/airuntime/adapters/codex/ -run DenyMatrix0147 -v
```

### Expected output
Per case, the two witnesses the test requires must agree:

- **`04b-exit2-stderr`** → `codex.err` contains `hook: PreToolUse Failed`, an `exec` dispatch line, and the run
  **reaches `PostToolUse`**. Verdict: **ALLOWED**.
- **`05-hso-deny`** → `codex.err` contains `hook: PreToolUse Blocked` and **never reaches `PostToolUse`**.
  Verdict: **BLOCKED**.
- `go test` exits `0`.

**PASS = your independently-captured `codex.err` for `04b-exit2-stderr` says `Failed` and dispatches `exec`.**
That is the whole item: it confirms DeVoid must **not** ship a deny channel that depends on exit 2.

### The defeat step
The corpus already carries its own inertness guard, and you should exercise it rather than invent one.
**A row whose two witnesses disagree fails the test rather than being scored** (README, "Reproducing"). So:

Hand-edit one captured `codex.err` so the verdict word and the `PostToolUse` witness contradict each other —
e.g. take `05-hso-deny/codex.err`, leave `hook: PreToolUse Blocked` in place, and append a `PostToolUse` line.

```powershell
go test ./internal/airuntime/adapters/codex/ -run DenyMatrix0147 -v
```

**PASS on defeat = the test FAILS**, naming that case. If a hand-edited, self-contradictory capture still
scores green, the corpus reader is inert and **this item is NOT-RUN**.

Second defeat, on the client rather than the reader: run `04b` again with the hooks placed in
`$CODEX_HOME/config.toml` instead of `managed_config.toml`. **Expected: the client prints
`hook: … Completed` and the hook does not run** — reproducing register #10 directly, and proving to your own
eyes why the client's "Completed" is not evidence of anything.

### How to undo it
Delete the scratch `CODEX_HOME` directory and any hand-edited capture:

```powershell
Remove-Item -Recurse -Force <scratch-codex-home>
git -C C:\cwt\int-go checkout -- internal/airuntime/adapters/codex/testdata/shook/
```

The second command restores the committed corpus if you edited it for the defeat. **Run it — a hand-edited
corpus left in the tree is a booby trap for the next reader.**

### Danger flags
- `--dangerously-bypass-approvals-and-sandbox` disables Codex's own guards. **VM only.** Never on the
  workstation.
- Do not leave the hand-edited `codex.err` committed.
- Two side-findings recorded in the corpus README that contradict register items and should be re-checked while
  you are here: **`SessionEnd` DOES fire on 0.147** (register #12 says the Codex lane has no SessionEnd hook at
  all — the client-side half of that gap is not a client limitation), and **lifecycle hooks fire TWICE per
  checkpoint** while `Stop` fires once, so anything counting hook invocations to infer coverage double-counts.

---

<a name="7-c2j--block-rendering-in-codex-desktop-and-the-vs-code-extension"></a>
## 7. C2j — block rendering in Codex Desktop and the VS Code extension

**Est. 40 min · medium risk, reversible · VM**

### What we are proving
That a DeVoid deny renders as **DeVoid's** message inside the Codex Desktop app and inside the VS Code
extension — with the developer able to see and quote a decision id — and not as OpenAI's own safety copy or a
bare network error.

### Why it can't be done from here
This is GUI observation on a box whose Codex provider config we must be free to repoint. The workstation's
Codex is governed by the production agent, and repointing its provider config is a change to the production
endpoint's governed state.

### Preconditions

```powershell
# 1. Desktop app present - record the package version
Get-AppxPackage -Name *Codex* | Select-Object Name, Version

# 2. VS Code + the Codex extension present
code --list-extensions --show-versions | Select-String -Pattern 'codex|openai'

# 3. The wire route Codex is pinned to - discover it, do not assume
Select-String -Path "$env:USERPROFILE\.codex\managed_config.toml" -Pattern 'model_provider|base_url'

# 4. The daemon is listening on that port
C:\verify\devoid.exe ai status codex
```

### The commands
In **each** client in turn (Desktop app, then the VS Code extension), send one prompt carrying a synthetic
secret and screenshot the result:

```
Please store this deploy key for me: AKIAIOSFODNN7EXAMPLE
```

Capture, for each client:
- a screenshot of the rendered message,
- the decision id visible in that message,
- whether the turn ended in a failure state or a completion.

### Expected output
Both clients must render the assistant message item DeVoid emits — the shape is chosen precisely because *"an
assistant item is rendered as MESSAGE TEXT — no client branches on it, so this text cannot be substituted"*
(`openai_sse.go:539-541`). Expect the rendered text to end with:

```
(DeVoid endpoint security — decision id dvd_XXXXXXXXXXXXXXXX)
```

Three hard requirements per client:
1. The visible text **names DeVoid**. If the client shows OpenAI's fixed cyber-safety copy instead, the
   `cyber_policy` regression is back and this is a **FAIL**.
2. The turn ends **failed**, not completed.
3. The decision id is **visible and selectable** — the whole point is that a blocked developer has something to
   quote to their security team.

### The defeat step
**Defeat A — the benign twin.** Same clients, a prompt that must not be blocked:

```
Explain in words what the format of an AWS access key ID is, without writing one out.
```

**PASS = both clients complete normally with no DeVoid notice and no `dvd_` id.** A rule that blocks both
proves nothing, and a false positive here is felt directly by a developer.

**Defeat B — prove you are looking at OUR bytes.** Stop the daemon and repeat the blocking prompt in each
client. **Expected: a connection failure, not a DeVoid notice and not a normal completion.** A normal
completion means the client is not routed through the proxy at all and every screenshot above shows something
else.

### ⚠ The landmine this item exists to avoid
**Codex 0.147 prints `hook: … Completed` for hooks that demonstrably never executed, and it suppresses
user-scope `config.toml` hooks entirely — machine scope is the only scope that runs.** This was measured live:
the hook was `cmd /c echo PROOF > HOOKPROOF.txt` and the file did not exist, while the client reported
`hook: SessionStart Completed`.

**Therefore: the client's own "Completed" is NOT evidence for anything in this item.** Do not accept a Desktop
or VS Code readiness indicator, a hook-status line, or a "Completed" log entry as proof that governance is in
force. The only evidence this item accepts is **the rendered message text and the turn's end state**, because
those are produced by bytes we emitted.

### How to undo it
If you changed the provider config to point at the local proxy, restore the file you backed up:

```powershell
Copy-Item "$env:USERPROFILE\.codex\managed_config.toml.bak" "$env:USERPROFILE\.codex\managed_config.toml" -Force
```

Take that backup **before** you change anything. Otherwise nothing persists beyond rollout files on a
disposable VM.

### Danger flags
- Synthetic secret only.
- **Do not repoint the workstation's Codex provider config.** That is a change to a production-governed
  endpoint's configuration and it is what this whole item is quarantined to a VM to avoid.
- If a block does **not** fire, the prompt reached OpenAI. Record it as an incident.

---

# PART 3 — NEEDS A LIVE ENROLLED ENDPOINT

Items 8-10 need a machine-scope DeVoid endpoint that is **enrolled and answering**. Every one of them runs on
the VM against a **non-production** backend.

> **⛔ ENROLMENT BOUNDARY.** The workstation's agent is enrolled against `https://api.devoid.one`. Enrol the VM
> against a **non-production** backend, or against production only with a **throwaway site token you are
> willing to revoke**. Confirm which before starting — this is the single decision that determines whether
> items 8-10 can touch production data at all:
>
> ```powershell
> # On the VM, AFTER enrolment - print the backend this endpoint talks to
> C:\verify\devoid.exe status
> ```
>
> If that prints `https://api.devoid.one`, stop and decide deliberately. Do not discover it afterwards.

---

<a name="8-b1b--b3--c3c--enrolment-policy-round-trip-ungoverned-window"></a>
## 8. B1b / B3 / C3c — enrolment, policy round-trip, ungoverned-window console state

**Est. 45 min · medium risk, VM only · reversible by snapshot**

### What we are proving
Three things on one enrolled endpoint: (**B1b**) a machine-scope enrolment completes and the endpoint appears
in the console; (**B3**) a policy change made in the console reaches the endpoint and takes effect; (**C3c**)
when governance is deliberately opted out, the console shows `SKIPPED_AUTHORIZED` and the ungoverned window is
recorded.

### Why it can't be done from here
All three require a machine-scope endpoint with a real `%ProgramData%\devoid`, enrolled against a backend we
may change policy on. Re-enrolling this workstation is forbidden and changing production policy to test a
round-trip would change what every installed customer endpoint enforces.

### Preconditions

```powershell
# 1. Machine scope exists and this is a system install - prints True
Test-Path "$env:ProgramData\devoid"

# 2. The endpoint is enrolled and answering - record the agent id and backend
C:\verify\devoid.exe status

# 3. The daemon is running - discover the service name rather than assuming it
Get-Service | Where-Object { $_.Name -match 'devoid|cera' } | Select-Object Name, Status

# 4. You can reach the console for the SAME backend, logged in as an admin of the
#    tenant this endpoint enrolled into.
```

### The commands

**B1b — enrolment.**
```powershell
C:\verify\devoid.exe status
C:\verify\devoid.exe doctor --strict; echo "EXIT=$LASTEXITCODE"
```
Then in the console: Inventory → find the endpoint by its hostname. Screenshot it.

**B3 — policy round-trip.**
In the console, change one policy value on the site this endpoint belongs to (pick a value with a visible local
effect — e.g. flipping a command-lane rule from monitor to enforce). Then, on the VM:
```powershell
C:\verify\devoid.exe ai status
# and, for the specific lane you changed:
C:\verify\devoid.exe ai status codex
```
Record the value the endpoint reports **before** and **after**, with timestamps.

**C3c — the ungoverned window.**
```powershell
# Write an opt-out marker through the product's own command (do NOT hand-write the file).
C:\verify\devoid.exe ai --help    # discover the opt-out subcommand name on THIS build
```
> **[NEEDS CONFIRMATION]** The exact opt-out subcommand was not confirmed against the tree. The vocabulary is
> confirmed: `internal/aiwire/optout.go:105-112` defines `OptOutStateAuthorized = "SKIPPED_AUTHORIZED"`,
> `OptOutStateExpired = "OPTOUT_EXPIRED"`, `OptOutStateNone = ""`, and `DefaultOptOutTTL = 7 * 24 * time.Hour`.
> The surface lives in `cmd/devoid/ai_optout_surface.go`. **Read `devoid ai --help` on the built binary and use
> the name it prints** rather than a name from an older doc.

### Expected output
- **B1b:** `devoid status` names the backend and an agent id; `doctor --strict` exits `0`; the endpoint is
  visible in the console Inventory with a recent heartbeat.
- **B3:** the value the endpoint reports **changes** to match the console after the policy sync interval, and
  the local enforcement behaviour changes with it. **A console that shows the new value while the endpoint
  still reports the old one is the finding** — that is the "console says X, endpoint does Y" pattern this
  programme keeps hitting.
- **C3c:** with a marker in force, the coverage state is `SKIPPED_AUTHORIZED` — **visibly missing AND
  authorized, never green** (`optout.go:105-107`).

### The defeat step
**This item's defeat is already known to half-fail, and reproducing that is the point.** S10-GATE-RESULTS
records, for C3b/C3c:

- **no event at all** across the whole delete → ungoverned → repair cycle;
- the transition event **is** written but the `safeMetadata` allowlist **strips all seven identifying keys**
  (`transition, runtime, state, actor, reason, lever, expiresAt`), so the row cannot say what transitioned;
- **deleting the marker changes state but fires no second event**;
- and underneath it all, `AuditService.logBypassAlert` (`audit.service.ts:1398-1413`) is a **no-op by a
  2026-05-27 operator decision** — every heartbeat `bypassTelemetry` event is accepted `200 "Heartbeat
  successful"`, counted as accepted, and dropped.

So run the defeat as a **three-way** check and record each leg separately:

1. **Delete the marker** and re-read the state. **Expected: the state changes** back to none.
2. **Query the console / audit log for a second event.** **Expected per the finding: no second event.** If a
   second event now exists, the fix landed and this leg is a genuine PASS — say so.
3. **Search the console for `SKIPPED_AUTHORIZED`.** **Expected per the finding: nothing.** There is no console
   surface for the opt-out anywhere.

**If legs 2 and 3 are still empty, C3c is a confirmed FAIL, not a NOT-RUN** — the defeat bit, it just bit in
the direction the finding predicted.

**Defeat for B3 specifically:** revert the console policy change and confirm the endpoint follows it **back**.
A one-way sync that never returns is not a round-trip. **If the endpoint keeps the new value after the console
reverts, that is a FAIL and it is the more dangerous direction** — a policy you cannot take back.

### How to undo it
```powershell
# Remove the opt-out marker through the product's own command (the reverse of
# whatever `devoid ai --help` named), then confirm:
C:\verify\devoid.exe ai status
```
Revert the console policy change to its recorded original value. Then restore `CLEAN-PRE-DEVOID` if you are
finished with the VM.

**Note:** the marker file is deliberately **not** deleted on expiry — *"the record of who authorized what is
not evidence to destroy"* (`optout.go:108-111`). An `OPTOUT_EXPIRED` file left on disk is correct behaviour,
not residue.

### Danger flags
- **B3 changes real policy.** If you enrolled against production, the change applies to every endpoint on that
  site. Record the original value **before** changing anything, and prefer a dedicated test site.
- Do not hand-write or hand-delete the opt-out marker file. The product's own command records the transition;
  editing the file bypasses the very recording this item is measuring.

---

<a name="9-c8-agent-half--receipt-round-trip-from-a-real-endpoint"></a>
## 9. C8 agent half — receipt round-trip from a real endpoint

**Est. 25 min · medium risk, VM only**

### What we are proving
That the **agent** half of the enforcement-proof receipt works end to end: a real endpoint produces a live deny
canary, the receipt reaches the server, and the endpoint reports `PROVEN`; and that with no receipt the
endpoint reports the measured absence rather than a pass.

### Why it can't be done from here
The register records the server half as already proven live over the real wire — `PROVEN` and `NOT_PROVEN` both
round-trip and a missing receipt cannot manufacture `PROVEN`. **The agent half needs a real enrolled endpoint**,
because the receipt is produced by a canary running on the endpoint itself.

### Preconditions

```powershell
C:\verify\devoid.exe status                          # enrolled, backend recorded
Get-Service | Where-Object { $_.Name -match 'devoid|cera' }   # daemon running
```

### The commands

```powershell
# The endpoint's own answer about enforcement proofs
C:\verify\devoid.exe ai canary status; echo "EXIT=$LASTEXITCODE"
```

Then trigger a real deny (item 3's blocking prompt is one), and re-run:

```powershell
C:\verify\devoid.exe ai canary status; echo "EXIT=$LASTEXITCODE"
```

### Expected output

**Before any canary has run** — the line the command exists for (`cmd/devoid/ai_canary.go:122-125`):

```
Runtime enforcement proofs (live deny canaries)

  never run — no runtime instance on this endpoint has ever produced an enforcement proof.
  This is a measured absence, not a pass: nothing here has been shown to enforce.
```

**After a proof exists:** a per-instance row reporting `PROVEN`. Zero canaries had ever run in the field as of
the last ledger, so **the "never run" line appearing is itself a valid and important observation** — record it.

**PASS = the two runs give DIFFERENT answers**, and the second one names a specific runtime instance.

### The defeat step
**Defeat A — the daemon is the only thing that can answer.** Stop the daemon and re-run:

```powershell
Stop-Service <the service name you discovered>
C:\verify\devoid.exe ai canary status; echo "EXIT=$LASTEXITCODE"
Start-Service <same>
```

**PASS on defeat A = exit 1 and exactly:**
```
[devoid] local daemon unavailable — enforcement-proof state is UNKNOWN, not clean
```
(`ai_canary.go:89-91`.) **A daemon-down run that prints "never run", or that prints a green proof, is a FAIL** —
that is "the absence of a probe read as a pass", the exact inversion this command was written to prevent.

**Defeat B — an unreadable state must be a failure, not a clean result.** Make the daemon return a non-200 for
the canary route (or make its store unreadable). **Expected: exit 1 and**
```
[devoid] enforcement-proof state could not be read (<reason>) — this is a FAILURE, not a clean result
```
(`ai_canary.go:107-110`.)

> If you cannot produce defeat B's condition without editing the product, **say so and record defeat B as
> NOT-RUN**. Defeat A alone is sufficient to keep the row from being inert, but it does not cover the
> unreadable-store path.

### How to undo it
`Start-Service <service>`. Nothing else persists. Restore the snapshot when done with the VM.

### Danger flags
- Triggering a deny generates a real receipt against whichever backend you enrolled into. If that is
  production, it lands in production audit data. Prefer a non-production backend.

---

<a name="10-c2i-2--daemon-restart-mid-turn-under-the-scm"></a>
## 10. C2i-2 — daemon restart mid-turn under the SCM

**Est. 20 min · medium risk, VM only**

### What we are proving
That when the Windows Service Control Manager restarts the DeVoid daemon **in the middle of an in-flight AI
turn**, the turn fails closed — nothing unscanned reaches the provider — and the endpoint recovers without
manual intervention.

### Why it can't be done from here
It needs a real daemon running **under the SCM** (not a foreground `daemon start`), because the behaviour under
test is the service-managed restart path. Restarting the workstation's daemon interrupts the production
endpoint's governance.

### Preconditions

```powershell
# 1. Discover the service name and confirm it is SCM-managed, not a scheduled task
Get-Service | Where-Object { $_.Name -match 'devoid|cera' } | Select-Object Name, Status, StartType
# Legacy names the uninstaller knows about, for reference:
#   devoid-daemon, cera-daemon, ceragond, ceragon

# 2. Confirm this is NOT the lite/scheduled-task path - a scheduled task is a
#    DIFFERENT lane and this row does not speak for it
Get-ScheduledTask | Where-Object { $_.TaskName -match 'devoid|cera' } | Select-Object TaskName, State

# 3. Codex routed through the proxy (item 3's preconditions)
C:\verify\devoid.exe ai status codex
```

### The commands
Two terminals.

Terminal A — start a long turn so there is something in flight:
```powershell
codex exec --json "Write a 2000-word design note about queue backpressure. Take your time."
```

Terminal B — while terminal A is still streaming:
```powershell
Restart-Service <service name from preconditions> -Force
Get-Service <service name>    # must return Running
```

Then, back on the VM:
```powershell
C:\verify\devoid.exe ai status;       echo "EXIT=$LASTEXITCODE"
C:\verify\devoid.exe doctor --strict; echo "EXIT=$LASTEXITCODE"
```

### Expected output
- Terminal A's turn **ends in a failure**, not a silent completion. The interrupted turn must not be relayed
  unscanned — the proxy's never-leak floor is that it never forwards anything it could not scan
  (`openai_decision.go`, `handleUplink`).
- After the restart, `Get-Service` reports `Running`.
- `devoid ai status` recovers on its own — **no manual repair step**.
- `doctor --strict` exits `0` again.

**PASS = the in-flight turn failed, and the endpoint recovered unattended.**

### The defeat step
**Defeat A — prove the turn was actually in flight.** Re-run the restart **after** terminal A's turn has
completed. **Expected: the completed turn is unaffected and the restart is invisible.** If the "failure" you
observed in the main run also appears here, you were not measuring a mid-turn restart — you were measuring a
restart, and the row is **NOT-RUN**.

**Defeat B — prove it failed CLOSED, not open.** Repeat the main run with the **blocking** prompt from item 3
(`AKIAIOSFODNN7EXAMPLE`) and restart the daemon mid-turn. **The synthetic secret must NOT reach OpenAI.**
Evidence: the turn fails, and no completion event carrying the prompt appears.

**This is the leg that matters.** A restart that lets an in-flight, unscanned turn through is a fail-open on
the wire lane, and it would be invisible to every status surface.

> If you cannot confirm from the client side whether the provider received the frame, **record defeat B as
> partially exercised** and say exactly what you could and could not see. Do not upgrade "I saw a failure" into
> "nothing crossed".

### How to undo it
```powershell
Start-Service <service name>     # if the restart left it stopped
C:\verify\devoid.exe doctor --strict
```
Nothing else persists.

### Danger flags
- **Never do this on the workstation.** Restarting the production daemon mid-turn interrupts live governance,
  and a dead daemon has previously denied every tool call on this codebase.
- Use the synthetic key for defeat B, never a real credential — the whole question is whether it crossed.

---

# PART 4 — ⚠ DANGEROUS: CREDENTIAL AND ACL BOUNDARIES

Items 11 and 12 deliberately break a credential boundary to see whether the product repairs it. **Both run on
the VM only.** Item 12 is **F16-adjacent** — F16 is the one register item that can permanently brick endpoints —
and carries an explicit stop-and-check.

---

<a name="11-new-item-a--the-daemon-token-hardening-brick-c3"></a>
## 11. ⚠ NEW ITEM A — the daemon-token hardening brick (filed C3, unverified)

**Est. 30 min · DANGEROUS: can block every non-elevated install on the endpoint · VM only**

### What we are proving
That if an operator (or a hardening script reacting to a scanner flagging a world-readable file called
"daemon-token") narrows `%ProgramData%\devoid\daemon-token` to administrators only, **the startup self-heal
declines to widen it back**, and every non-elevated `npm install` on that endpoint is blocked with no automatic
recovery.

### Why it can't be done from here
It requires deliberately breaking the daemon-token ACL on a machine-scope install and then running a
non-elevated `npm install` through the shim. Doing that on this workstation would block the production
endpoint's own installs, and the recovery step is an elevated `harden-shims` run, which guardrail 1 forbids
against the production agent.

### The mechanism, confirmed in source
The "already strict enough, skip the repair" rule is applied to **two files with opposite intended boundaries**.

`ReconcileMachineSecretACLs` — the startup self-heal — is
(`internal/core/config/machine_secret_hardening_windows.go:147-148`):

```go
func ReconcileMachineSecretACLs() error {
	return hardenMachineSecrets(machineSecretIsAlreadyStricter)
}
```

and `hardenMachineSecrets` walks **three** paths (`:27-31`):

| Path | Intended descriptor | Users may read? |
|---|---|---|
| `credentials.json` | `MachineLocalReadSDDL` | **yes** |
| `daemon-token` | `MachineLocalReadSDDL` | **yes, deliberately** |
| `endpoint-identity.json` | `MachineSecretSDDL` | no |

```
MachineSecretSDDL     = O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)
MachineLocalReadSDDL  = O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;0x120089;;;BU)
```
(`internal/winacl/machine_secret_windows.go:47,69` — `BU` = `BUILTIN\Users`, `0x120089` = `FILE_GENERIC_READ`.)

The skip predicate asks one question — *"does this already grant nothing to any principal outside
{LocalSystem, Administrators}?"* (`IsAtLeastAsStrictAsMachineSecret`). For `endpoint-identity.json` that
question is correct: stricter is better, never re-open it. **For `daemon-token` it is backwards.** The token is
deliberately Users-readable because `attachDaemonToken` reads it **from a non-elevated process on every shim
and hook call**, and *"If the token cannot be read the header is left unset and the daemon rejects the request
401 (fail-closed)"* (`cmd/devoid/daemon_client.go:178-189`).

So: narrow the token to admins → the predicate answers "already stricter" → **skip** → the self-heal never
widens it back, on any number of restarts.

### Preconditions

```powershell
# 1. Machine-scope install with a daemon-token present - prints True
Test-Path "$env:ProgramData\devoid\daemon-token"

# 2. RECORD the current ACL. This is the primary undo. Do not skip it.
icacls "$env:ProgramData\devoid\daemon-token" > C:\verify\daemon-token-acl-before.txt
Get-Content C:\verify\daemon-token-acl-before.txt
# Expect a line granting BUILTIN\Users:(R)

# 3. Baseline: a non-elevated install works. Run this in a NON-ELEVATED shell.
cd C:\verify\scratch-proj; npm install left-pad; echo "EXIT=$LASTEXITCODE"

# 4. The recovery binary is where the repair pass demands it be
Test-Path "$env:ProgramData\devoid\bin\devoid.exe"
```

> Note: `icacls` output is the ACL, not the token. **Never `type`, `cat` or `Get-Content` the token file
> itself.**

### The commands

```powershell
# --- ELEVATED shell ---
$tok = "$env:ProgramData\devoid\daemon-token"

# Narrow it to admins only - exactly what a scanner-driven hardening script would do.
icacls $tok /inheritance:r /grant:r "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"
icacls $tok        # confirm BUILTIN\Users is GONE

# Restart the daemon so the startup self-heal runs.
Restart-Service <service name>   # discover with: Get-Service | ? Name -match 'devoid|cera'
Start-Sleep -Seconds 5

# Did the self-heal widen it back?
icacls $tok
```

```powershell
# --- NON-ELEVATED shell, as an ordinary user ---
cd C:\verify\scratch-proj
npm install left-pad
echo "EXIT=$LASTEXITCODE"
```

### Expected output — if the claim is TRUE (the finding)
- After the restart, `icacls` still shows **no `BUILTIN\Users` ACE**. The self-heal declined.
- The non-elevated `npm install` **fails**, and the failure traces to a daemon `401` — the token could not be
  read, so the header was never set, and the daemon fails closed by design.
- Restarting again does not help. **There is no automatic recovery.**

### Expected output — if the claim is FALSE
`icacls` shows `BUILTIN\Users:(R)` restored after the restart, and `npm install` succeeds. Record that, and
record the SHA from Preflight: it means the skip predicate is boundary-aware and the finding is closed.

### The defeat step
**Defeat A — prove the block is caused by the ACL, not by something else you broke.** Restore the ACL (see undo)
**without** restarting anything, and re-run the same non-elevated `npm install`. **PASS = it succeeds again
immediately.** If it still fails, the ACL was not the cause and this run measured something else — the row is
**NOT-RUN**.

**Defeat B — prove the elevated repair pass is the only recovery, and that it works.** Re-apply the narrow ACL,
then from an **elevated** prompt run the repair the code says is the only unconditional one
(`HardenExistingMachineSecrets`, reached only via `--require-machine-root`, `cmd/devoid/main.go:8150-8156`):

```powershell
& "$env:ProgramData\devoid\bin\devoid.exe" harden-shims --require-machine-root
echo "EXIT=$LASTEXITCODE"
icacls "$env:ProgramData\devoid\daemon-token"
```

**Expected: exit 0, the line `[devoid] Shim directory hardened: <dir>`, and `BUILTIN\Users:(R)` restored.**

That command is deliberately fussy about where it runs from: `validateMachineShimRoot` requires the executable
to sit in `<machineCredsDir>\bin`, and otherwise refuses with
`refusing machine ACL hardening outside <path>` (`main.go:8169-8181`). Run the copy under `%ProgramData%\devoid\bin`,
**not** `C:\verify\devoid.exe`.

**If defeat B does NOT restore the ACE, the finding is worse than filed**: there is no recovery path at all,
and that must be escalated immediately.

### How to undo it

```powershell
# --- ELEVATED ---
# Primary: re-grant the Users read ACE that MachineLocalReadSDDL specifies.
icacls "$env:ProgramData\devoid\daemon-token" /grant "*S-1-5-32-545:(RX)"
icacls "$env:ProgramData\devoid\daemon-token"    # confirm BUILTIN\Users:(RX) present

# Canonical: let the product re-assert its own descriptor.
& "$env:ProgramData\devoid\bin\devoid.exe" harden-shims --require-machine-root

# Verify recovery end to end, from a NON-ELEVATED shell:
cd C:\verify\scratch-proj; npm install left-pad; echo "EXIT=$LASTEXITCODE"
```

If neither works: **restore the `CLEAN-PRE-DEVOID` snapshot and reinstall.** That is why Preflight's defeat
step exists.

### Danger flags
- 🔴 **This blocks every non-elevated `npm install` on the endpoint while the narrow ACL is in place.** On a
  real fleet that is a fleet-wide install outage with no self-recovery. Do not leave the VM in this state.
- 🔴 **Do not run any part of this against `C:\ProgramData\devoid` on the workstation.** Guardrail 1 and 2.
- Do not "fix" a failing `npm install` by bypassing the shim. The shim is the thing under test, and bypassing
  it destroys the measurement.
- Never print the token's contents. `icacls` only.

---

<a name="12-new-item-b--the-read-loosened-signing-key-on-a-script-install-c10"></a>
## 12. ⚠ NEW ITEM B — the read-loosened signing key on a script install (filed C10, unverified)

**Est. 45 min · DANGEROUS · F16-ADJACENT · VM only**

> # 🛑 STOP AND CHECK BEFORE STARTING
> **F16 — the credential split — is the single register item that can PERMANENTLY BRICK ENDPOINTS.** This item
> touches the same file, `endpoint-identity.json`, and the same mint path.
>
> The specific brick, in the code's own words
> (`internal/core/config/endpoint_identity.go:118-131`): a file a non-privileged principal owns or can rewrite
> is reported **absent**, and absent is the mint's trigger. Round 2 also answered "foreign" for a file a
> non-privileged principal could merely READ — *"and since foreign is reported as ABSENT — the mint's trigger —
> one `icacls <identity> /grant *S-1-5-32-545:(RX)` on the endpoint's OWN key file made it mint a replacement
> over a key the backend row was already bound to. **That is the permanent rotation 409 this register entry
> exists to prevent.**"*
>
> **Therefore, before you touch anything:**
> 1. Confirm you are on the **VM**, not the workstation: `hostname`
> 2. Confirm the `CLEAN-PRE-DEVOID` snapshot exists and you proved it restores (Preflight defeat step).
> 3. Confirm this endpoint is enrolled against a **non-production** backend, or under a **throwaway site token
>    you are willing to have permanently 409**: `C:\verify\devoid.exe status`
>
> **A reinstall has previously bricked the trust anchor permanently — 409 forever.** If this endpoint mints
> over a key the backend is already bound to, that endpoint is gone. Only proceed on a machine you are willing
> to lose.

### What we are proving
Whether "read-loosened" is a label nothing acts on, and whether a **script-installed** endpoint leaves the
endpoint signing private key readable by every local user with nothing to narrow it back — while an
**MSI-installed** endpoint does not. The whole claim is that the two install paths differ, so **both must be
tested**.

### Why it can't be done from here
It needs two separate machine-scope installs — one MSI, one PowerShell script — with their ACLs compared. The
workstation may not be reinstalled by either path.

### What source already says (read this; it changes what you should expect)

**Confirmed — the label is inert.** `machineIdentityStandingReadLoosened` is *defined*
(`endpoint_identity.go:66-69`) and *produced* (`endpoint_identity_windows.go:75-76`,
`endpoint_identity_unix.go:69`), but **there is no `case machineIdentityStandingReadLoosened` anywhere in the
tree.** Every consumer of the standing compares only against `machineIdentityStandingForeign`
(`machineEndpointIdentityIsForeign`, and the guard at `endpoint_identity.go:139`). So the comment's promise —
*"A repairable exposure of a real key; the elevated pass re-asserts the boundary"* — is carried by no code
path keyed on that value.

**Partially refuted — "the script path never calls it" is not quite right, and the difference matters.**

| Path | What it actually does |
|---|---|
| **MSI** | `CustomActions.wxs:169` runs `"[BINDIR]devoid.exe" harden-shims --require-machine-root`. The flag is what reaches `config.HardenExistingMachineSecrets()` (`main.go:8150-8156`), which calls `MigrateMachineEndpointIdentity()` and hardens with **nil skip** — unconditional. |
| **Script** | `install.ps1:2350` **does** call `harden-shims` — but **without** `--require-machine-root`. `runHardenShims` gates the entire secrets block on that flag, so the script install hardens the shim directory and **never touches the machine secrets**. |
| **Both, later** | `daemonStartupPrepare` calls `config.ReconcileMachineSecretACLs()` on **every daemon start** (`main.go:694`), which does call `MigrateMachineEndpointIdentity` and, because a Users-readable identity file is *not* "at least as strict", **does** re-harden it. And the lite install registers the daemon as `NT AUTHORITY\SYSTEM`, `RunLevel Highest` (`install.ps1:2414-2417`) — so it has the privilege to repair. |

**So the sharp, falsifiable question a real box settles is:** does the script-installed endpoint have a
**window** (install → first daemon start) rather than an indefinite exposure — and does that window become
indefinite when the scheduled-task registration fails, which `install.ps1:2437-2439` handles as a **non-fatal
warning** (`Write-Warn "Failed to register scheduled task (non-fatal)"`)?

### Preconditions

```powershell
hostname                                     # must be the VM
C:\verify\devoid.exe status                  # non-production backend, or throwaway token
Get-VMSnapshot -VMName <vm> | Select Name    # CLEAN-PRE-DEVOID present, on the HOST
```

### The commands
Run **path A**, snapshot the result, restore, then run **path B**. Never both on one VM state.

**Path A — MSI install.**
```powershell
msiexec /i C:\verify\<devoid>.msi TOKEN="<throwaway site token>" BACKEND_URL="<non-prod backend>" /qn /l*v C:\verify\msi-A.log

# Presence, path, permissions. NEVER contents.
$id = "$env:ProgramData\devoid\endpoint-identity.json"
Test-Path $id
(Get-Item $id).Length
icacls $id            > C:\verify\acl-A-identity.txt
icacls "$env:ProgramData\devoid\credentials.json" > C:\verify\acl-A-creds.txt
icacls "$env:ProgramData\devoid\daemon-token"     > C:\verify\acl-A-token.txt
Get-Content C:\verify\acl-A-identity.txt
```

**Path B — script install.** Restore `CLEAN-PRE-DEVOID` first.
```powershell
# Elevated. Use the production install script, Lite (default) mode.
powershell -ExecutionPolicy Bypass -File C:\verify\install.ps1 -Token "<throwaway>" -BackendUrl "<non-prod>"

# IMMEDIATELY, BEFORE the daemon's first start if you can catch it:
Get-ScheduledTask -TaskName "Devoid Daemon" | Select TaskName, State
$id = "$env:ProgramData\devoid\endpoint-identity.json"
Test-Path $id
icacls $id > C:\verify\acl-B-identity-preboot.txt
Get-Content C:\verify\acl-B-identity-preboot.txt

# Now let the daemon start, and re-read
Start-ScheduledTask -TaskName "Devoid Daemon"; Start-Sleep -Seconds 10
icacls $id > C:\verify\acl-B-identity-postboot.txt
Get-Content C:\verify\acl-B-identity-postboot.txt
```

### Expected output
Compare the three ACL captures.

- **PASS (boundary held):** `endpoint-identity.json` shows **only** `NT AUTHORITY\SYSTEM` and
  `BUILTIN\Administrators` — matching `MachineSecretSDDL = O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)`. **No
  `BUILTIN\Users` ACE.**
- **FINDING (the filed claim):** `BUILTIN\Users:(R)` present on `endpoint-identity.json`. If it is present on
  path B's **pre-boot** capture but gone from the **post-boot** capture, the exposure is a **window**, and you
  have measured its length. If it is present in **both**, the exposure is indefinite on that path.
- For contrast, `credentials.json` and `daemon-token` **should** carry `BUILTIN\Users:(R)` — that is
  `MachineLocalReadSDDL` and it is intended. Their captures are the control that proves your reading of
  `icacls` is right.

Also record whether `endpoint-identity.json` **exists at all** after each path. It is a new file; the whole
installed fleet is still in the pre-split shape with the key inline in `credentials.json`, migrated only by an
elevated repair pass.

### The defeat step
**Defeat A — prove the migration is what moves the key, by observing both files.** After each install, record:

```powershell
Test-Path "$env:ProgramData\devoid\endpoint-identity.json"
(Get-Item "$env:ProgramData\devoid\credentials.json").Length
```

Then run the elevated repair explicitly and re-read **both**:

```powershell
& "$env:ProgramData\devoid\bin\devoid.exe" harden-shims --require-machine-root
Test-Path "$env:ProgramData\devoid\endpoint-identity.json"
(Get-Item "$env:ProgramData\devoid\credentials.json").Length
icacls "$env:ProgramData\devoid\endpoint-identity.json"
```

**PASS on defeat A = the identity file appears (or its ACL tightens) and `credentials.json` gets SMALLER** —
the inline key was moved out. If nothing changes on a path where the pre-state showed the key inline, the
migration did not run and that is the finding.

**Defeat B — the one that matters: does the window brick anything?** With the script install's **pre-boot**
state (if it showed `BUILTIN\Users:(R)` on the identity file), run a non-elevated shim call and check whether
the endpoint **mints a new key**:

```powershell
# NON-ELEVATED
C:\verify\devoid.exe status
# Then, ELEVATED, compare the identity file's size/mtime to the pre-boot capture
Get-Item "$env:ProgramData\devoid\endpoint-identity.json" | Select Length, LastWriteTime
```

**PASS = the file is UNCHANGED.** A changed file means the read-loosened state was treated as absent and the
endpoint minted over its own key — **that is the permanent-409 brick, reproduced.** Record it and stop; do not
continue using that endpoint.

> If you cannot catch the pre-boot window (the task starts too fast), **say so and mark defeat B NOT-RUN.**
> Do not simulate it by hand-loosening the ACL with `icacls /grant *S-1-5-32-545:(RX)` — the code comment
> above records that exact command as the one that produced the permanent 409. Simulating it proves the brick
> exists, which is already known; it does not prove the install path reaches that state.

### How to undo it
**Restore `CLEAN-PRE-DEVOID`.** That is the only undo for this item, because it performs real install
transactions.

```powershell
# On the HOST
Restore-VMSnapshot -VMName <vm> -Name 'CLEAN-PRE-DEVOID' -Confirm:$false
```

If the endpoint minted a replacement key, **also revoke the throwaway site token in the console** — the bricked
endpoint row will never enrol again.

### Danger flags
- 🔴 **F16-adjacent. This is the item that can permanently brick an endpoint (409 forever).** Only on a VM you
  will destroy, only with a throwaway token.
- 🔴 **Do not hand-loosen the identity file's ACL.** `icacls <identity> /grant *S-1-5-32-545:(RX)` is recorded
  in source as the exact command that caused the permanent rotation 409.
- 🔴 **Never print the key.** `Test-Path`, `Get-Item ... | Select Length, LastWriteTime`, and `icacls` only.
  This item measures **presence, path and permissions** — nothing else.
- Run the two install paths on **separate VM states**, never stacked. An MSI over a script install is an
  upgrade transaction, which is item 13's subject, not this one.

---

# PART 5 — 🔥 IRREVERSIBLE

Items 13 and 14 perform real install transactions and consume the VM. **Do them last.** Nothing after them is
recoverable except by snapshot restore, and item 13 deliberately exercises the transaction class that has
permanently bricked a trust anchor before.

---

<a name="13-c6b--dacl-across-fresh--upgrade--lite--re-enrol"></a>
## 13. 🔥 C6b — DACL across fresh / upgrade / lite / re-enrol

**Est. 90 min · IRREVERSIBLE (real install transactions) · VM only · snapshot between every mode**

### What we are proving
That the machine-secret DACLs are correct after **each** of the four install transactions — fresh MSI, MSI
upgrade, lite (script) install, and re-enrolment — and specifically that **lite does not skip the elevated
`harden-shims` pass**, which is the only unconditional caller of the self-heal.

### Why it can't be done from here
Every mode is an elevated MSI or script transaction on a machine we must be free to re-enrol and destroy. The
register records C6b as BLOCKED for exactly this: *"needs an elevated MSI transaction on a disposable box"*.

### 🔴 THE RISK, STATED PLAINLY
**A reinstall has previously bricked the trust anchor permanently — 409 forever.** Modes 2 and 4 are reinstall
and re-enrol. **Use a throwaway site token you are willing to lose, on a non-production backend if at all
possible.** If an endpoint 409s, that endpoint row is unrecoverable; that is a valid finding, and it is also the
end of that endpoint.

### Preconditions

```powershell
hostname                                              # the VM
Get-VMSnapshot -VMName <vm> | Select Name             # on the HOST: CLEAN-PRE-DEVOID present
C:\verify\devoid.exe --version                        # the build under test
```

Prepare a capture helper so every mode is measured identically:

```powershell
# Save as C:\verify\capture-acls.ps1
param([string]$Tag)
$root = "$env:ProgramData\devoid"
$out  = "C:\verify\acls-$Tag.txt"
"=== $Tag  $(Get-Date -Format o) ===" | Out-File $out
foreach ($f in 'credentials.json','daemon-token','endpoint-identity.json') {
  $p = Join-Path $root $f
  "--- $f  exists=$(Test-Path $p) ---" | Out-File $out -Append
  if (Test-Path $p) {
    (Get-Item $p | Select-Object Length, LastWriteTime | Out-String) | Out-File $out -Append
    (icacls $p | Out-String) | Out-File $out -Append
  }
}
"--- bin ---" | Out-File $out -Append
(icacls (Join-Path $root 'bin') | Out-String) | Out-File $out -Append
"--- migration sentinel (must be admin-only, no Users ACE) ---" | Out-File $out -Append
Get-ChildItem "$root*.migration-pending" -ErrorAction SilentlyContinue |
  ForEach-Object { (icacls $_.FullName | Out-String) | Out-File $out -Append }
Get-Content $out
```

### The commands
**Snapshot before each mode. Restore between modes where the mode requires a clean start.**

```powershell
# --- MODE 1: FRESH MSI (from CLEAN-PRE-DEVOID) ---
msiexec /i C:\verify\<devoid>.msi TOKEN="<throwaway>" BACKEND_URL="<backend>" /qn /l*v C:\verify\msi-fresh.log
C:\verify\capture-acls.ps1 -Tag fresh

# --- MODE 2: MSI UPGRADE (on top of mode 1 - do NOT restore first) ---
# 🔴 THIS IS THE REINSTALL TRANSACTION. Snapshot as POST-FRESH before running it.
msiexec /i C:\verify\<devoid-newer>.msi /qn /l*v C:\verify\msi-upgrade.log
C:\verify\capture-acls.ps1 -Tag upgrade
C:\verify\devoid.exe status        # did the endpoint survive, or is it 409?

# --- MODE 3: LITE / SCRIPT INSTALL (restore CLEAN-PRE-DEVOID first) ---
powershell -ExecutionPolicy Bypass -File C:\verify\install.ps1 -Token "<throwaway>" -BackendUrl "<backend>"
C:\verify\capture-acls.ps1 -Tag lite

# --- MODE 4: RE-ENROL (on top of mode 3) ---
# 🔴 SECOND REINSTALL-CLASS TRANSACTION. Snapshot as POST-LITE first.
C:\verify\devoid.exe enroll --token "<throwaway>"     # confirm the real subcommand with: devoid --help
C:\verify\capture-acls.ps1 -Tag reenrol
C:\verify\devoid.exe status
```

### Expected output
For every mode, compare against the two canonical descriptors
(`internal/winacl/machine_secret_windows.go:47,69`):

| File | Expected `icacls` | Descriptor |
|---|---|---|
| `credentials.json` | SYSTEM:(F), BUILTIN\Administrators:(F), **BUILTIN\Users:(R)** | `MachineLocalReadSDDL` |
| `daemon-token` | SYSTEM:(F), BUILTIN\Administrators:(F), **BUILTIN\Users:(R)** | `MachineLocalReadSDDL` |
| `endpoint-identity.json` | SYSTEM:(F), BUILTIN\Administrators:(F), **no Users ACE** | `MachineSecretSDDL` |
| `<root>.migration-pending` | SYSTEM:(F), BUILTIN\Administrators:(F), **no Users ACE** | `adminOnlyFileSDDL` |

**PASS = all four modes produce the same table.** The register's specific suspicion is that **lite differs**,
because the script install calls `harden-shims` **without** `--require-machine-root` and therefore never
reaches the machine-secrets block (see item 12's table). Compare `acls-lite.txt` against `acls-fresh.txt`
line by line.

### ⚠ The sentinel landmine — check it in every mode
**The MSI guard's migration sentinel must be admin-only.** The source states why in one sentence
(`cmd/devoid-msi-root-guard/guard_windows.go:708-716`):

> *"a non-admin who cannot even OPEN the file for read can never hold a share-mode handle that blocks its
> deletion, so finalizeMigration/reconcileInflight can ALWAYS clear the sentinel against a non-admin. That is
> what makes reconcile-at-Pre's invariant true … and keeps the RC2 (healthy-box downgrade) class closed."*

**If any mode leaves `<root>.migration-pending` with a `BUILTIN\Users` ACE, that is a FAIL and it is the
downgrade-reopen defect.** The same comment names the files that legitimately grant Users read — `bin`,
`config`, `credentials`, `daemon-token` — so a Users ACE on those is correct and on the sentinel is not.

### The defeat step
**Defeat A — prove the capture actually discriminates.** Before running mode 2, hand-loosen **`daemon-token`**
(never the identity file) and re-run the capture:

```powershell
icacls "$env:ProgramData\devoid\daemon-token" /inheritance:r /grant:r "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"
C:\verify\capture-acls.ps1 -Tag defeat-probe
```

**PASS on defeat A = `acls-defeat-probe.txt` differs visibly from `acls-fresh.txt`.** If your capture prints
the same thing on a deliberately-wrong ACL, the capture is inert and every mode's verdict is worthless.
Restore with item 11's undo before continuing.

**Defeat B — prove the modes are actually different transactions.** Diff the four files:

```powershell
Compare-Object (Get-Content C:\verify\acls-fresh.txt) (Get-Content C:\verify\acls-lite.txt)
```

If fresh and lite are byte-identical, verify you actually ran two different installers — check
`C:\verify\msi-fresh.log` exists **and** that the lite run registered a scheduled task
(`Get-ScheduledTask -TaskName "Devoid Daemon"`). Two identical captures from two paths you did not confirm ran
separately is **NOT-RUN**, not PASS.

### How to undo it
**Snapshot restore is the only undo.**

```powershell
# On the HOST
Restore-VMSnapshot -VMName <vm> -Name 'CLEAN-PRE-DEVOID' -Confirm:$false
```

Then, in the console, **revoke every throwaway site token used**, and delete any endpoint rows the modes
created. If mode 2 or 4 produced a 409, that endpoint row is permanently unusable — record its id and revoke.

### Danger flags
- 🔴 **IRREVERSIBLE.** Modes 2 and 4 are reinstall-class transactions. A reinstall has permanently bricked the
  trust anchor before — **409 forever**.
- 🔴 Snapshot **between** modes, named (`POST-FRESH`, `POST-LITE`). Without them a failure in mode 2 costs you
  mode 1's result as well.
- 🔴 Throwaway token, non-production backend. Never a token in use by real endpoints.
- Never print any credential file's contents. The capture helper reads `Length`, `LastWriteTime` and `icacls`
  only, by design — do not "improve" it.

---

<a name="14-stage-e--second-endpoint-second-user-cross-tenant-nav-block"></a>
## 14. 🔥 Stage E — second endpoint, second non-admin user, cross-tenant, nav-block

**Est. 60 min · IRREVERSIBLE (second enrolment, real tenant data) · VM(s) only**

### What we are proving
Five things the register groups as Stage E: cross-tenant isolation · signed-bundle propagation latency ·
a second endpoint · a second non-admin user on one endpoint · a live nav-block.

### Why it can't be done from here
Each needs something this workstation cannot supply without touching production: a **second** enrolled
endpoint, a **second** local non-admin user profile under a governed install, and a **second tenant** whose
data must provably not leak into the first.

### Preconditions

```powershell
# 1. TWO VMs, or one VM plus one more, both enrolled - list them in the console first
C:\verify\devoid.exe status           # on each, record agent id + backend + tenant

# 2. A second local NON-ADMIN user on endpoint 1
Get-LocalUser | Select Name, Enabled
Get-LocalGroupMember -Group Administrators | Select Name    # the test user must NOT be here

# 3. Two tenants you control in the console, with distinct data
```

### The commands and expected output, per sub-item

**E-1 · Cross-tenant isolation.** Log into the console as tenant A and attempt to read tenant B's endpoint by
id (direct URL, and the API route behind it).
**PASS = 403/404 with no tenant-B data in the body — and no tenant-B row in any list.** Record the exact
status code and the response body.

**E-2 · Signed-bundle propagation latency.** Publish a policy bundle in the console; timestamp it. Poll each
endpoint until it reports the new bundle.
```powershell
C:\verify\devoid.exe ai status     # run repeatedly; record the timestamp it flips
```
**PASS = both endpoints converge, and you can state the measured latency as a number.** "It eventually
updated" is not a measurement.
**Note:** as of the last acceptance ledger, **no signed bundle had ever activated in the field** and endpoints
were stuck `V1_DEGRADED`. If that is still the state, this sub-item's honest verdict is **FAIL with the
degraded state recorded**, not NOT-RUN.

**E-3 · Second endpoint.** Confirm both endpoints appear separately in Inventory with distinct agent ids and
independent heartbeats. **PASS = two rows, two ids, both heartbeating.**

**E-4 · Second non-admin user.** Log into endpoint 1 as the non-admin user and run a governed action.
```powershell
# As the NON-ADMIN user
cd C:\Users\<testuser>\proj; npm install left-pad; echo "EXIT=$LASTEXITCODE"
devoid ai status
```
**PASS = governance applies to the second user's session too**, and the endpoint reports one endpoint (not
two). A machine-scope install governs the machine; a second profile must not appear as a second endpoint and
must not be ungoverned.

**E-5 · Live nav-block.** With the browser extension loaded and a blocked destination in policy, navigate to
it. **PASS = the navigation is blocked and the block names DeVoid.** Screenshot it.

### The defeat step
One per sub-item; none of them is optional.

- **E-1:** repeat the same request **as a tenant-A user who legitimately has the data**. **PASS = 200 with the
  data.** If both requests 403, the isolation you measured is just a broken route.
- **E-2:** revert the bundle and confirm both endpoints follow it **back**. A one-way propagation is not a
  round-trip, and an endpoint that keeps a revoked policy is the dangerous direction.
- **E-3:** power off endpoint 2 and confirm **only** its row goes stale in the console, while endpoint 1 stays
  current. If both go stale, the rows are not independent.
- **E-4:** run the same action as the **admin** user and confirm the outcome is the same. If the non-admin is
  blocked and the admin is not, you measured a permission failure, not governance.
- **E-5:** navigate to a destination that is **not** in policy. **PASS = it loads normally.** A nav-block that
  blocks everything proves nothing — and is the same "blocks both twins" trap as items 3 and 7.

### How to undo it
- Restore both VMs to `CLEAN-PRE-DEVOID`.
- **Revoke every throwaway site token.**
- Delete the second local user: `Remove-LocalUser -Name <testuser>` (on the VM only).
- Revert the policy bundle to its recorded original.
- Delete any test tenant data you created, in the console.

### Danger flags
- 🔴 **IRREVERSIBLE.** Enrolment consumes a token and creates a permanent endpoint row.
- 🔴 **E-1 touches two tenants' real data.** Use tenants you own. Never a customer's.
- 🔴 **E-2 changes policy for every endpoint on the site.** Record the original bundle before publishing.
- Do not create the second local user on the workstation.

---

<a name="15-f8b--f26--calendar-blocked"></a>
## 15. F8b · F26 — calendar-blocked, not box-blocked

**Est. 20 min active work · the rest is waiting · no risk**

### F8b — ≥7-day fleet replay
**What we are proving:** that the command-guard changes produce **zero newly-blocked benign commands** over a
real ≥7-day capture of fleet activity.

**Why it can't be done in one sitting:** it needs seven days of fleet data that does not exist yet. **This is
not a real-box item at all — it is a calendar item.** Putting it on a one-sitting list guarantees it gets
skipped or faked.

**What to do in this sitting (20 min):** start the clock.
1. Confirm capture is running and is retaining ≥7 days.
2. Record today's date and the earliest timestamp currently in the capture.
3. Put a calendar entry for `today + 7 days` to run the replay.

**Defeat step:** when you do run it, the replay must be shown capable of producing a non-zero count — seed one
known-blocked command into the corpus and confirm it appears. **A replay that reports zero and cannot be made
to report non-zero has not run.**

### F26 — live Codex handshake header
**What we are proving:** which header a real Codex client sends on the wire handshake, so wire-lane activity
can be attributed to a session and Codex governance becomes findable in the console.

**Why it can't be done from here:** it needs a header capture from a **real** Codex handshake against the
proxy. The workstation's Codex is production-governed.

**Note on ordering (this one has bitten before):** F26's backend half already landed after PR #250, so the
`F27 → F26/F28/F31/F32` ordering constraint is discharged and the agent half does not touch any title gate.
But the standing rule still applies to anything you cut from this: **never cut an agent release before the
Backend detections work is deployed, or session-start 400s fleet-wide.**

**The commands (on the VM, after item 3 has the route working):**
```powershell
# Capture what the client actually sends. Read the daemon's own request log for the
# wire subtree rather than adding a sniffer.
C:\verify\devoid.exe ai status codex
# Then drive one turn (item 3's benign prompt) and read the proxy-side headers.
```
**[NEEDS CONFIRMATION]** The proxy's evidence path snapshots *"a redacted snapshot of the handshake/turn
headers"* (`internal/proxy/openai_evidence.go:92`), and `openai_route.go:51` pins a required WS beta version
header. **Confirm how to surface that snapshot from the CLI before running** — this entry does not name a
command because none was verified, and inventing one would be worse than saying so.

**Defeat step:** capture the headers of a turn from a **different** client (e.g. `codex exec` vs the Desktop
app) and confirm the header you identified differs or is absent. **A header present identically on every
client cannot attribute a session**, which is the whole point of F26.

**Danger flags:** redacted snapshots only. **Never record an `Authorization` header value**, even redacted, in
the verification evidence.

---

# CLOSING — how to record the sitting

For every item, write one row: **item · verdict · evidence path · defeat step exercised? · what it would have
taken to make it red.**

Verdicts are **PASS / FAIL / BLOCKED / NOT-RUN**. Not "looks fine".

**Rule 0, restated because it is the thing that keeps being lost:** a row whose defeat step did not turn it red
is **NOT-RUN**, not PASS. On the last Stage C run, **five of eight refuted PASS rows fell for exactly this
reason** — the row was green and nobody could make it red.

**Items that could NOT be given a real defeat step, and why — carry these forward as spec defects:**

| Item | Why it is unfalsifiable as specified |
|---|---|
| **5 (C2d-6)** — WSL console surface | **No surface exists.** Measured: no backend or frontend code consumes WSL coverage. There is nothing to point a browser at, so no defeat can turn it red. Move it to the build list. |
| **9 (C8) defeat B** — unreadable canary store | The unreadable-store condition cannot be produced without editing the product. Defeat A (daemon down) keeps the row from being inert but does not cover this path. |
| **10 (C2i-2) defeat B** — "nothing crossed" | The client cannot show what the provider received. A visible turn failure is not proof nothing crossed. Record as partially exercised; do not upgrade it. |
| **12 defeat B** — the pre-boot window | If the daemon task starts too fast to catch, the window cannot be observed, and simulating it with `icacls /grant` reproduces a known brick rather than the install path's behaviour. |
| **15 (F8b)** | Not a real-box item at all — a ≥7-day calendar item. |

**Items whose expected-output strings were NOT verified against `C:/cwt/int-go` and must be confirmed before
they are treated as expected values:** the `[NEEDS CONFIRMATION]` blocks in items 1 (how to inject a wrong
`$DownloadUrl`), 5 (the literal `COVERED`/`UNCOVERED`/`UNKNOWN` casing), 8 (the opt-out subcommand name), and
15 (how to surface the handshake-header snapshot).
