# Can we get one installed, enrolled DeVoid endpoint without GitHub Actions?

**Answer: YES.**

Nothing in the path from "source code" to "an installed, enrolled endpoint that we can measure"
touches GitHub Actions. This workstation can already build every piece, the runtime does not refuse
to run a binary we built ourselves, and the production Backend is up right now and running today's
code. The only thing still missing is a machine we are allowed to install on — which is owner
decision **§0.4**, not a billing problem.

**Investigated 2026-08-26.** Research only. Nothing was installed, no VM was touched, no repository
was modified. Build artifacts live in this session's scratchpad.

---

## The one-paragraph version, in plain English

We were worried that a DeVoid agent we compile ourselves would refuse to run, because the real ones
are code-signed by a GitHub pipeline we currently cannot start. That worry is unfounded, and for a
slightly embarrassing reason: **the agents we ship to customers today are not code-signed either.**
The signing certificate has never been bought. The product knows this and deliberately runs in a
"transitional unsigned" mode. On top of that, the one place the agent *does* check a signature is
the **self-update** path — the code that pulls a newer version down from S3 and swaps itself. A
fresh install never goes near it. So a binary we build on this laptop is in exactly the same trust
position as the one on a customer's machine, and it starts, enrols and runs.

---

## 1. Can we build it here? YES — proven, end to end

| Tool | Needed for | Present? |
|---|---|---|
| Go 1.25.5 | the agent, daemon, prompt-guard host, MSI payload guard | **yes** |
| WiX 6.0.2 CLI (`dotnet tool`) | the MSI and the EXE bundle | **yes** |
| `WixToolset.Util.wixext` 6.0.2 | MSI | **yes** |
| `WixToolset.UI.wixext` 6.0.2 | MSI | **yes** |
| `WixToolset.BootstrapperApplications.wixext` 6.0.2 | the EXE wizard | **yes** |
| .NET SDK 10.0.201 + WindowsDesktop runtime 10.0.5 | the WPF wizard (`net10.0-windows`) | **yes** |
| `signtool` (Windows SDK) | signing the MSI/EXE | **no — and not needed** |

`build.ps1` takes `-CertPath` as an **optional** parameter. Every signing block in it is wrapped in
`if ($CertPath -and (Test-Path $CertPath))`. With no certificate passed, the build produces unsigned
artifacts and does not fail. There is no certificate to pass anyway — see §2.

### What was actually built (PROVEN)

Built from a scratchpad `git worktree` at `origin/main` = **`114dbc03`** (the same Installers base
Wave 47 lanes are working from). The worktree was created by this session under the scratchpad and
never touched any existing checkout.

```
BUILD_DEVOID_EXIT=0     devoid.exe                    28,997,632 bytes   14:47:52 → 15:11:10
BUILD_DAEMON_EXIT=0     devoid-daemon.exe              2,491,392 bytes   → 15:14:40
BUILD_PGH_EXIT=0        devoid-prompt-guard-host.exe  10,689,536 bytes   → 15:22
BUILD_GUARD_EXIT=0      devoid-msi-root-guard.exe      4,442,112 bytes   → 15:27
```

**A cold Go build of `./cmd/devoid` took 23 minutes** on this box, with roughly a dozen other agents
compiling at the same time and the CPU pinned at 100%. Do not read a slow build as a broken one, and
do not budget from these numbers on a quiet machine — they are contention figures, not a baseline.

> **Gotcha that cost two attempts.** `git worktree add` into the scratchpad **fails on Windows long
> paths** — the scratchpad prefix is ~130 characters and some test fixtures under
> `internal/airuntime/adapters/codex/testdata/` blow past `MAX_PATH`. The checkout dies with
> `Filename too long` and leaves a half-populated directory that is not even a git repo.
> Use `git -c core.longpaths=true worktree add …`, or check out somewhere short like `C:\cwt\`.

### The MSI — built, on this box, unsigned, exit 0 (PROVEN)

```
.\windows-installer\msi-build\build.ps1 -SourceDir <staged> -OutputDir <out> -Version 7.10.99 -MsiOnly

[OK] WiX CLI found: C:\Users\Owner\.dotnet\tools\wix.exe
[OK] Payload binaries + Prompt Guard manifests found
[OK] Theme validation passed
[OK] Generated 19 .cmd shims
[OK] Embedded guard built with all 43 payload hashes
Building MSI...
[OK] MSI built: …\msi-out\DevoidAgent.msi
[OK] MSI-only build complete
MSIONLY_EXIT=0
```

```
DevoidAgent.msi   49,455,104 bytes
SHA-256           1B53042E399D8D68D418C799728C73E8B54373B27F1B31D98425DA25997DD4F2
Authenticode      NotSigned
```

Every gate inside `build.ps1` passed, including the two that actually bite: **theme validation**
(the thmutil-v4 control-shape checks that crash Burn at startup when wrong) and the **43-entry
payload-hash manifest** the embedded machine-boundary guard is compiled around. The guard was built
with the real production ldflags (`-trimpath -s -w -X main.expectedManifestB64=…`) over our own
unsigned payloads and the count check passed exactly.

No certificate was passed and none was needed. The build did not warn, degrade or fall back — the
signing blocks are simply skipped.

Staging the WiX source is four copies, per `release.yml:1115-1135` ("Prepare WiX source"):
`devoid.exe`, `devoid-daemon.exe`, `devoid-prompt-guard-host.exe`, plus
`browser-extension/native-host/com.devoid.prompt_guard.json` and `…firefox.json`.

**Not attempted: the full bundle** (`DevoidSetup.exe`). Dropping `-MsiOnly` additionally runs
`dotnet restore` + `dotnet test` + `dotnet publish --self-contained` on the WPF wizard and then
`wix build` for the Burn bundle. Every prerequisite for it is present and version-matched (.NET SDK
10.0.201 for `net10.0-windows`, `WixToolset.BootstrapperApplicationApi` 6.0.2 against WiX 6.0.2), so
there is no known reason it would fail — but it was **not run**, and the MSI alone is enough for the
rig. `msiexec /i DevoidAgent.msi` installs the same product the EXE wraps.

**Timing, on a box with ~12 other agents compiling:** roughly 40 min for the cold Go builds, ~35 min
for the guard's `-trimpath` rebuild (which shares no cache with a plain build), and ~7 min for
`wix build` to CAB ~600 MB of payload (the 19 tool aliases are each a full copy of the 29 MB
`devoid.exe`). On a quiet machine this is a fraction of that.

---

## 2. Would an unsigned, locally-built agent actually run and enrol? YES

This was the crux. The hypothesis in the brief — *signature verification gates upgrades and fleet
distribution, not fresh install* — is **confirmed**, and the real situation is even more permissive
than that.

### 2a. It runs. Observed, not inferred.

```
> devoid.exe --version
devoid vdev (UNSTAMPED local build, not from the release pipeline)
WARNING: this devoid binary was not produced by the release pipeline.
Neither its version nor its release channel was stamped, and that turns OFF release-gated behaviour:
  * the pre-push endpoint gate never refuses a production agent aimed at a dev backend
  * self-update is disabled and reports that you are already on the latest version
  * the minimum-CLI-version floor is treated as already satisfied
Do not use this build to judge whether enforcement works. Install a released
build to test real behaviour.

> Get-AuthenticodeSignature devoid.exe
Status : NotSigned
```

It starts, it self-identifies honestly, it is not blocked.

### 2b. Where the signature check actually lives

`verifyUpgradeAuthenticode` has exactly **three** non-test call sites in the whole repository:

- `cmd/devoid/upgrade.go:597` — verifying the downloaded replacement binary before the swap
- `cmd/devoid/upgrade.go:776` (via `installPromptGuardHostPayloadWithVerifier`, line 735)
- `cmd/devoid/upgrade_msi_apply_windows.go:94` — verifying a downloaded MSI before applying it

**Zero** call sites in install, enrolment, daemon start, hook execution, policy activation or
evidence delivery. The trust contract test that pins this is
`cmd/devoid/upgrade_trust_contract_test.go` — and it is a test about `upgrade.go`, by name.

### 2c. And in a developer build the check is skipped entirely

`internal/release/authenticode_contract.go:25-36`:

> `WindowsSignerPinConfigured` reports whether this build was compiled with a production Windows
> Authenticode signer pin (release.yml injects one only when a code-signing certificate is
> provisioned). **When FALSE this is an UNSIGNED build and the Authenticode-signer layer is deferred
> end-to-end**: the ed25519-signed release manifest, the SHA-256 artifact pin, and the anti-rollback
> floor STILL gate every update — only the extra code-signing-certificate check is skipped until a
> certificate exists.

The pin is a `-X`-injected string. A local build has none, so `WindowsSignerPinConfigured()` is
false and the layer is off.

### 2d. Production releases are unsigned too

`install-scripts/production/install.ps1:317`:

```powershell
$script:AllowUnsignedTransitional = $true
```

with a comment block above it (lines 289-316) stating that until the code-signing certificate is
provisioned, **the customer-facing binaries served from the production backend are NOT
Authenticode-signed**, and that fail-closed signature policy "blocks every current customer
install". The Ed25519 *release-manifest* signature and the SHA-256 byte-binding stay hard-fatal;
only the code-signing-certificate identity check downgrades to a warning.

So a locally-built binary and a shipped binary have the **same** Authenticode status: `NotSigned`.

### 2e. The MSI's own payload guard checks hashes, not signatures

`cmd/devoid-msi-root-guard/guard_windows.go` embeds `expectedManifestB64`, which
`windows-installer/msi-build/build.ps1` computes from the SHA-256 of the exact 43 payload files that
same MSI is about to install. It is a self-consistency check on our own build. An unsigned build
produces a self-consistent manifest and passes.

### 2f. `bootstrap_trust_chain` is a release-promotion flag, not a runtime gate

It appears in only two places outside tests and corpus fixtures:
`.github/workflows/release.yml` (lines 32, 181, 288, 453, 546, 554) and
`.github/scripts/resolve-release-version.py` (lines 102, 154). It exists so the *release version
resolver* refuses to promote a new stable release when the current stable channel is legacy or
unsigned, unless a human explicitly says "yes, bootstrap the chain". It has **no presence in the Go
agent at all**. It cannot block a local install because it never runs on an endpoint.

### 2g. The honest caveat, and how to remove it

`cmd/devoid/version.go:64-70` ends its banner with:

> *"Do not use this build to judge whether enforcement works. Install a released build to test real
> behaviour."*

That is a first-party instruction and it must not be waved away. But read what it enumerates: the
pre-push endpoint gate's dev-backend refusal, self-update, and the minimum-CLI-version floor.
**None of the three touches the hook lane, the policy bundle, or the evidence lane** — i.e. none of
them touches §2.1–§2.5.

**Remove the caveat by stamping the build.** `release.yml` (lines ~365-383) stamps exactly:

```
-X main.version=${VERSION}
-X main.gitSHA=${GIT_SHA}
-X main.buildTime=${BUILD_TIME}
-X main.releaseChannel=stable
-X …release.manifestPublicKeyringB64=${RELEASE_MANIFEST_KEYRING_B64}
-X …release.manifestRevokedKeyIDsCSV=${RELEASE_MANIFEST_REVOKED_KEY_IDS}
-X …release.productionWindowsSignerThumbprint=${EXPECTED_WIN_THUMBPRINT}
```

The first four are ordinary strings we can supply ourselves. Setting `main.version` to a real
version and `main.releaseChannel=stable` makes `isProductionAgentBuild()` true, the banner
disappears, and all three enumerated gates come back on. The last three come from GitHub — but the
keyring and revocation list only affect **self-update manifest verification**, and
`EXPECTED_WIN_THUMBPRINT` is empty in production too (§2d). **The rig should stamp the build**, and
the runbook below does.

And this is not a loophole we are exploiting — the product says so itself, at
`cmd/devoid/endpoint_sanity.go:49-52`:

> *"It is a PROVENANCE STATEMENT rather than a signature check: a caller who sets both ldflags is
> still believed."*

`isProductionAgentBuild` has five non-test call sites in total: two in `doctor` (reporting),
`git_scan.go:256` (the pre-push endpoint gate), `upgrade.go:669`, and `version.go:35` (the banner).
**None in the daemon, the hook lane, policy activation, or evidence delivery.**

> ⚠️ A stamped local build turns the pre-push endpoint gate back ON, which means it will refuse a
> production-stamped agent pointed at a dev backend. If you stamp `releaseChannel=stable`, enrol
> against **production**, not a local backend. Pick one lane and stay in it.

---

## 3. What would it enrol against?

**Production. `https://api.devoid.one`.** And it is up right now.

Probed read-only at 2026-08-26 12:51Z:

```json
{"status":"ok","database":true,"dynamodb":true,"sqs":true,
 "buildSha":"1a24262b3e4c535ad838ae95ade50a094ae17529",
 "buildTime":"2026-08-26T07:42:42Z","uptime":18025}
```

That `buildSha` is the **same commit Wave 47 is using as its Backend base**. The endpoint would be
talking to today's code, not to something months stale. That matters: it means a finding measured on
this rig is a finding about the code we are currently working on.

### Why production and not the local stack

The local `.codesec-e2e` stack is real and well documented (host Backend on `:2053`, Postgres on
`:5433`, DynamoDB `:8000`, elasticmq `:9324`, minio `:9000`; a `cli_agent` key can be minted by hand
into the `api_keys` table with `key_hash = HMAC-SHA256(pepper, fullKey)` and `keyId` = the row UUID).
Everything the hook lane needs is backend-URL-configurable — `PostAiPromptCheck` posts to
`c.config.BackendURL + "/api/v1/ai/prompt/check"` (`internal/core/backend/ai_prompt.go:847`). So the
hook lane **does work against a local Backend**.

But for these five items production is the right target, for four reasons:

1. **§2.5 says "on production" in its own text**, and the `highestAcknowledgedSequence` vs
   `gap_count` re-check it asks for is against production's own numbers (760 and 7,500).
2. **§2.4 needs a real org with a real signing key.** The Backend generates a per-org Ed25519 key
   lazily on first sign (`src/crypto/policy-signer.service.ts`, `getOrCreateKey`). A local stack
   would generate a *different* key and prove a different chain.
3. **The console half of §2.5 needs the deployed Frontend.** Standing up a local console adds a day
   and proves less.
4. **The local Backend needs `CODEFENCE_SIGNING_MASTER_KEY` and friends set correctly**, and prod
   already has whatever it has — testing against prod measures the real configuration, which is
   where this programme's findings keep coming from ("console says X, endpoint does Y").

Also practical: **the `.codesec-e2e` stack is not currently running.** `docker ps` at 2026-08-26
shows nine containers, all belonging to other Wave 47 lanes and the local CI mirror — none of the
`codesec-e2e-*` emulators. Choosing local means bringing that stack up first, on a box whose CPU is
already saturated.

**Use a dedicated test site inside the production tenant.** §2.4's policy round-trip changes real
policy; REAL-BOX-PACKET item 8 already flags that a change made on a shared site applies to every
endpoint on it.

---

## 4. Minimum viable proof rig — the runbook

Built on `.plans/verify-prod-20260808/REAL-BOX-PACKET.md`: VM checkpoint discipline, a defeat step
per item, and zero-risk items first.

> **Correction to that packet.** Its standing guardrail #1 says *"The only DeVoid agent enrolled on
> this workstation points at PRODUCTION."* **That is no longer true — DeVoid is not installed on this
> workstation at all.** Confirmed: no `C:\Program Files\DeVoid`, no `C:\ProgramData\devoid` (only a
> 3-file `Devoid.stale-20260714`), nothing named `devoid` on PATH, no service, no uninstall registry
> entry, no DeVoid hooks in any Claude Code settings file. `C:\Users\Owner\.devoid\` **does** exist
> and was written as recently as 2026-08-25, but it is the residue of somebody running a locally
> built binary in shim mode: `manifest.json` has `"shimFiles": {}` and `tamper.log`'s single event
> carries `"agent_version": "dev"`. It is not an install. The guardrail's *conclusion* still holds —
> install on a VM, not here — but for a different reason: 15 agents are working in this workspace.

### Step 0 — Owner gate (BLOCKING)

- [ ] **§0.4 approved.** A disposable Windows 11 VM may be created, enrolled and destroyed.
  This is the **only** blocker. It is not §0.1.
- [ ] Confirm the **site** inside the production tenant that the VM will enrol into. A dedicated
  test site, not a live one.

Two environment facts the owner should know before saying yes:

- **Free space on `C:` is 37.8 GB.** A Windows 11 VM plus one checkpoint is tight. Consider a
  different volume or freeing space first.
- **Hyper-V state could not be verified** — `Get-WindowsOptionalFeature` and `Get-VM` both require
  elevation and were refused. Check it in an elevated shell before committing to a schedule.

### Step 1 — Build (≈45 min cold, ≈5 min warm; **zero risk, can start before §0.4**)

```powershell
# Short path — avoids the MAX_PATH failure described above.
git -C C:\Users\Owner\Documents\Ceragon\Installers -c core.longpaths=true `
    worktree add --detach C:\cwt\rig-47 origin/main
cd C:\cwt\rig-47
git rev-parse --short HEAD          # RECORD. Every verdict below is against this SHA.

$V="7.10.99-rig"; $SHA=(git rev-parse --short HEAD); $T=(Get-Date -Format o)
$LD="-s -w -X main.version=$V -X main.gitSHA=$SHA -X main.buildTime=$T -X main.releaseChannel=stable"

New-Item -ItemType Directory -Force C:\rig\src | Out-Null
go build -trimpath -ldflags $LD -o C:\rig\src\devoid.exe ./cmd/devoid
go build -trimpath -ldflags "-s -w -H windowsgui -X main.version=$V" -o C:\rig\src\devoid-daemon.exe ./cmd/devoid-daemon
go build -trimpath -ldflags "-s -w -X main.version=$V" -o C:\rig\src\devoid-prompt-guard-host.exe ./cmd/devoid-prompt-guard-host
Copy-Item browser-extension\native-host\com.devoid.prompt_guard*.json C:\rig\src\

# VERIFY the stamp took. Must NOT print the UNSTAMPED banner.
C:\rig\src\devoid.exe --version
C:\rig\src\devoid.exe version --json    # record verbatim; this is your provenance evidence

.\windows-installer\msi-build\build.ps1 -SourceDir C:\rig\src -OutputDir C:\rig\out -Version 7.10.99
```

**Defeat step:** rebuild once *without* the `-X main.releaseChannel=stable` flag and confirm
`--version` prints the UNSTAMPED banner. A stamp check you cannot make fail did not run.

### Step 2 — VM (≈30 min, zero risk to the workstation)

Windows 11, 4 vCPU / 8 GB. Install Claude Code and the Codex CLI **before** DeVoid.
**`Checkpoint-VM -SnapshotName 'CLEAN-PRE-DEVOID'` while clean.** Copy `C:\rig\out\*` in.

`codex --version` — **record it verbatim.** §2.2's runbook discriminator string was mined on Codex
0.144 and is not present in 0.134. If the VM has 0.134, confirm the marker against the actual binary
before trusting any negative result.

### Step 3 — Install (⚠️ irreversible on this VM; restore the checkpoint to undo)

```powershell
# Property names verified against Product.wxs lines 59-74 — TOKEN and BACKEND_URL,
# not APIKEY/BACKENDURL. TOKEN is declared Hidden="yes" so it is not written to the log.
msiexec /i C:\rig\out\DevoidAgent.msi /qn /l*v C:\rig\install.log `
        TOKEN=<cli_agent key> BACKEND_URL=https://api.devoid.one `
        ENROLLMENT_MODE=required HOOKS_ENABLED=1 DAEMON_ENABLED=1
```

The MSI enrols by itself: `CA_SaveCredentials` runs `devoid setup save-credentials --token … --backend-url …`
(`CustomActions.wxs:211-214`) and `CA_RegisterAgent` runs `devoid setup enroll`
(`CustomActions.wxs:156-159`).

> ⚠️ **DO NOT run `install-scripts/development/install-windows.ps1` bare.** Its `-ApiKey` parameter
> has a **hard-coded default that is a real-looking `cf_api_…` production token committed to
> `origin/main`**, and its `-BackendUrl` default is `https://api.devoid.one`. Running it with no
> arguments silently enrols the box into production using a credential that is sitting in the
> repository. See §6 — this is a finding in its own right. If you use that script at all, pass both
> arguments explicitly.

> ⚠️ **Reinstall risk.** A reinstall has permanently bricked the trust anchor before — 409 forever,
> `AI_TRUST_ANCHOR_KEY_SUBSTITUTION`, no recovery path. The Backend now clears all four
> `endpoint_signing_*` columns on a teardown-proven reinstall (`src/agents/agents.service.ts`,
> `clearLocalKeyBindings`), and production is running a Backend that contains that code. **That fix
> has not been exercised.** Treat every reinstall as destructive and restore the checkpoint instead.

### Step 4 — Preconditions (this is where most attempts die)

```powershell
devoid doctor
Invoke-RestMethod http://127.0.0.1:19280/health
devoid ai hooks-status claude-code
devoid ai hooks-status codex
```

> 🔴 **The MSI does not install the AI hooks.** Checked against `origin/main`: the only hook-ish
> custom action is `CA_DiscoverInstallHooks`, and `CustomActions.wxs:191-193` sets it to
> `devoid.exe repos map --install-hooks` — **git** hooks. There is no `ai install-hooks` custom
> action anywhere in the MSI. So run it by hand, or §2.1 and §2.2 will "fail" for a reason that has
> nothing to do with the control being measured:

```powershell
devoid ai install-hooks claude-code
devoid ai install-hooks codex
devoid ai hooks-status claude-code     # expect: installed [OK] · NEVER OBSERVED [!]
```

`NEVER OBSERVED` is the correct starting state. It is what the proofs change.

### Step 5 — Run the proofs, cheapest and safest first

| Order | Item | Procedure | Risk |
|---|---|---|---|
| 1 | **§2.4** policy bundle activates, digest reaches Backend | REAL-BOX item 8 (B3) | changes real policy — **use a test site** |
| 2 | **§2.5** one evidence event end to end | LIVE_PROOF_PROCEDURE §2 + console | read-only after enrolment |
| 3 | **§2.1** Claude Code PreToolUse deny stops the side effect | LIVE_PROOF_PROCEDURE §1 | none |
| 4 | **§2.2** Codex hook fires, decides, client honours the deny | `internal/codexmanaged/LIVE_PROOF_RUNBOOK.md` §3 | none |
| 5 | **§2.3** observer for the vendor's fail-open | needs the Wave 47 lane-3 code first | none |
| 6 | REAL-BOX items 3–10 | that packet | as marked there |
| — | REAL-BOX items 11–14 | **DANGEROUS / IRREVERSIBLE** | last, or a separate session |

§2.4 goes first because it is the item everything else sits on: until a signed bundle actually
activates, every other detection is running on permissive built-in defaults rather than on your
policy, and a §2.1 result measured under defaults is measuring the wrong thing.

**Recording a proof means editing `internal/liveproof/register.json`'s `evidence` block and deleting
the `quarantine`.** You cannot make it green by flipping the boolean —
`go test ./internal/liveproof/...` fails when a control has never fired and its quarantine is missing
or expired. Quarantines currently expire **2026-11-05**.

### Step 6 — Tear down

`Restore-VMSnapshot 'CLEAN-PRE-DEVOID'`, or destroy the VM. Nothing on the workstation to undo.

---

## 5. Which of the five items does this actually close?

| Item | Closed by the rig? | Why |
|---|---|---|
| **§2.1** Claude Code `PreToolUse` deny stops the side effect | **YES** | Pure measurement. Needs an enrolled box, Claude Code, and hooks installed by hand. Also closes `register.json` entry 1 (`hook-lane-prompt-block`). |
| **§2.2** Codex hook fires, decides, client honours the deny | **YES, with a caveat** | Measurement, but ⚠️ the runbook's discriminator string was mined on Codex 0.144 and is absent from 0.134. Confirm the marker against the VM's actual Codex build or a negative result means nothing. |
| **§2.3** observer for the vendor's own fail-open | **NO — not a measurement item** | `HookTimeoutFailOpen = true` (`internal/codexmanaged/machine_projection.go:120`) and nothing records it. This needs **code written** (Wave 47 lane 3). The rig is where you then prove it fires. |
| **§2.4** signed policy bundle activates, digest reaches Backend | **YES — and it is NOT GitHub-blocked** | See below. |
| **§2.5** one evidence event end to end | **YES** | Mechanism is backend-URL-configurable, and production is up. The checklist says "on production", and it can be. |

Plus two free ones: **`register.json` entries 2 and 3** (`anthropic-transport-decision`,
`config-change-checkpoint`) are both closed by the same rig — LIVE_PROOF_PROCEDURE §2 and §3.
Entry 4 (`machine-secret-denies-local-users`) is **not** closable: it is blocked on item 101's
per-user credential split, not on hardware.

### §2.4 specifically — does its signing depend on GitHub secrets? **No.**

The brief asked this directly, because if the answer were yes, §2.4 would stay blocked even with a
VM. It is not.

- The bundle is signed by the **Backend**, in `src/crypto/policy-signer.service.ts`, using a
  **per-organisation Ed25519 key pair generated lazily on the first sign request and persisted in
  the `signing_keys` table, encrypted at rest**. No key material comes from GitHub.
- The endpoint fetches the org's public key from the Backend at enrolment —
  `internal/policybundle/bundle.go:63-116`, `FetchAndCachePublicKey` — and pins it in
  `internal/aikeystore` as `trust-root.json`. Nothing pinned at build time.
- The gate that decides whether signed activation may run at all reads an **embedded, in-repo
  contract**: `contractActivationGate.Activatable()` in `internal/daemon/ai_policy_activate.go`
  consults `aipolicycontract.ContractMetadata()`, whose bytes live at
  `internal/aipolicycontract/embedded/…/portable-contract.v1.jcs.json` and ship inside the binary we
  compile. A locally built agent carries the same contract a released one does.
- `CODEFENCE_SIGNING_MASTER_KEY` — the boot-required variable from the old deploy-blocker note — is
  a **Backend** environment/SSM secret used for at-rest key protection and decision fingerprints. It
  is not a GitHub Actions secret and production already has it (the Backend booted).

**§2.4 is blocked only on having an endpoint.**

---

## 6. Findings raised along the way

1. 🔴 **A production-shaped API token is committed to `origin/main`.**
   `install-scripts/development/install-windows.ps1`, the `-ApiKey` parameter default (line ~17),
   is a full `cf_api_<uuid>_<64-hex>` value, and `-BackendUrl` defaults to `https://api.devoid.one`.
   Anyone who runs that script with no arguments enrols their machine into the production tenant
   using a credential that is in the repository. Value deliberately not reproduced here.
   **Recommend: revoke the key, make `-ApiKey` mandatory, and default `-BackendUrl` to localhost.**

2. 🟠 **The MSI never installs the AI hooks.** Confirmed at `origin/main`: no custom action runs
   `devoid ai install-hooks`. `CA_DiscoverInstallHooks` is git hooks
   (`CustomActions.wxs:191-193`). This is the known ship-on gap, still open — and it means any
   out-of-box measurement of hook coverage on a fresh install measures *zero hooks*, not a broken
   control.

3. 🟡 **`REAL-BOX-PACKET.md` guardrail #1 is stale** — it says this workstation has an enrolled agent
   pointing at production. It does not have DeVoid installed at all. Correct the guardrail so the
   next reader does not plan around a machine state that no longer exists.

4. 🟡 **`git worktree add` into the Claude scratchpad fails on Windows `MAX_PATH`** for this repo.
   Anything that needs an Installers worktree should use `-c core.longpaths=true` or a short path.

5. 🟡 **`C:` has 37.8 GB free** and Hyper-V availability could not be confirmed without elevation.
   Both need checking before scheduling the VM session.

---

## 7. What is proven and what is not

### PROVEN (commands run, output observed)

- Go 1.25.5, WiX 6.0.2 + all three required extensions, and .NET SDK 10.0.201 with the WindowsDesktop
  10.0.5 runtime are all present on this box.
- All four Go binaries build clean from `origin/main` `114dbc03` (exit 0 each).
- **`DevoidAgent.msi` builds on this box, unsigned, exit 0** — 49,455,104 bytes, SHA-256
  `1B53042E…97DD4F2`, `Authenticode: NotSigned`. Theme validation and the 43-entry payload-hash
  manifest both passed.
- The resulting `devoid.exe` **runs** on Windows and reports `Status : NotSigned`.
- `verifyUpgradeAuthenticode` has three non-test call sites, all in the upgrade path.
- `WindowsSignerPinConfigured()` is false without an injected pin, and the source states the
  Authenticode layer is then "deferred end-to-end".
- `AllowUnsignedTransitional = $true` in the production installer: shipped binaries are unsigned too.
- `bootstrap_trust_chain` exists only in release CI, never in the Go agent.
- The policy-bundle signing key is a per-org Ed25519 key in the Backend's `signing_keys` table.
- The MSI contains no `ai install-hooks` custom action.
- Production `https://api.devoid.one` is healthy, `buildSha 1a24262b`, built 2026-08-26T07:42Z.
- DeVoid is not installed on this workstation; `~/.devoid` is dev-binary residue (`agent_version: "dev"`).

### NOT EXERCISED (believed true, not observed)

- **No install was performed anywhere.** That an unsigned MSI installs cleanly, enrols, starts the
  daemon and passes `devoid doctor` is inferred from the code paths above, not observed. The MSI
  exists as a file; it has never been run.
- **The full EXE bundle (`DevoidSetup.exe`) was not built.** Only `-MsiOnly`. All its prerequisites
  are present and version-matched, but `dotnet restore/test/publish` on the WPF wizard and the Burn
  bundle step were not run.
- **No enrolment was attempted** against production or locally.
- **No hook has been fired**, no policy bundle activated, no evidence event traced.
- **Hyper-V availability is unknown** — the query needs elevation.
- **The trust-anchor 409 fix (`clearLocalKeyBindings`) has not been exercised.** It is present in the
  Backend commit production is running; that it works is unproven.
- **The signed-manifest self-update path was not tested** with a locally built binary. It should
  refuse to self-update (no keyring injected), which is the intended and safe direction, but it was
  not run.
- **Whether §2.1's deny actually stops the side effect is exactly the open question** — this document
  says the rig can ask it, not what the answer is.

---

## 8. What this session left behind

Everything is in this session's scratchpad —
`%LOCALAPPDATA%\Temp\claude\C--Users-Owner-Documents-Ceragon\377f096c-…\scratchpad\`:

| Path | What |
|---|---|
| `inst-wt/` | detached-HEAD `git worktree` at Installers `origin/main` `114dbc03`, **verified clean** (`git status --porcelain` empty) |
| `out/` | the four unstamped Go binaries |
| `wix-source/` | the staged MSI payload dir |
| `msi-out/DevoidAgent.msi` | the built, unsigned MSI |
| `msi-build.log` | the full build transcript |

**No repository was modified.** No branch was created, checked out or switched; no file in any
existing checkout was touched. The only trace outside the scratchpad is one worktree registration in
`Installers/.git/worktrees/`. Remove it with:

```powershell
git -C C:\Users\Owner\Documents\Ceragon\Installers worktree remove --force <scratchpad>\inst-wt
# or, once the scratchpad is gone:
git -C C:\Users\Owner\Documents\Ceragon\Installers worktree prune
```

Nothing was installed on this workstation. No VM was created, restored or deleted. Nothing under
`C:\ProgramData` was read for content, moved, or written. No credential value appears anywhere in
this document.
