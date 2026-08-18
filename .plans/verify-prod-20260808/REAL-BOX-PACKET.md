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
