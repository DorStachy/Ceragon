# Wave 47 — the run to 4.7A readiness

**Started 2026-08-26.** Working the whole of `.plans/READY-FOR-4.7A-MASTER-CHECKLIST.md`.
Every lane is an isolated worktree on a branch off its repo's current `origin/main`, partitioned **by file** so no
two lanes can collide. Nothing here is pushed, merged or deployed — integration is a separate, deliberate step.

Bases: Installers `114dbc03` · Backend `1a24262b` · Frontend `359d6548`.

## Lanes

| # | Checklist item | Repo | Worktree / branch | Hard gate? |
|---|---|---|---|---|
| 1 | §1.1 complete inventory — the sweep sees 200 of 18,299 files | Installers | `r47-inventory` / `wave47/inventory` | **yes (4)** |
| 2 | §1.2 plugins restored on uninstall, both paths, confined | Installers | `r47-plugingate` / `wave47/plugingate` | decision |
| 3 | §2.3 observer for the vendor's own fail-open (+ §3.6, §3.7 research) | Installers | `r47-failopen` / `wave47/failopen` | **yes (2)** |
| 4 | §2.6 real shim interception test + §4.3 re-plug the red gate | Installers | `r47-shimtest` / `wave47/shimtest` | **yes (2)** |
| 5 | §1.3 commit a lockfile, switch to `npm ci` | Backend | `r47-lockfile` / `wave47/lockfile` | decision |
| 6 | §3.3 tool-risk baseline (F41/D4) — **live in production today** | Backend | `r47-toolrisk` / `wave47/toolrisk` | **yes (6)** |
| 7 | §4.1 live-pg fail-closed + §4.8 `guardDegraded` | Backend | `r47-livepg` / `wave47/livepg` | **yes (5)** |
| 8 | §4.2 tests that cross the HTTP boundary | Backend | `r47-httpbound` / `wave47/httpbound` | **yes (5)** |
| 9 | §3.1 `BUILTIN\Users` can read the bearer token | Installers | `r47-winacl` / `wave47/winacl` | |
| 10 | §3.4 prompt lane fires on presence + §3.5 replay brick | Installers | `r47-promptlane` / `wave47/promptlane` | |
| 11 | §3.10 `findingsDropped` + §3.14 `approvalSurface` + §3.13 (BE) | Backend | `r47-console` / `wave47/console` | |
| 12 | §3.8 the console can't tell 3 controls from 8 | Frontend | `r47-attested` / `wave47/attested` | |
| 13 | §3.11 absent total read as whole-scope + §3.12 unsanitised text | Frontend | `r47-fesmall` / `wave47/fesmall` | |
| 14 | §4.5 make the Backend suite runnable (Docker volumes, not bind mount) | Backend | `r47-dockertest` / `wave47/dockertest` | |
| 15 | §3.13 (Go) + register reconcile + two decision briefs | Installers/docs | `r47-misc` / `wave47/misc` | |
| 16 | §4.6 three NOT-RUN discipline gates | Frontend | `r47-gates` / `wave47/gates` | **done** |

## Closed so far

### §4.6 — the three discipline gates have now been run

| Gate | Result |
|---|---|
| `check:ai-security-frontend-consumer` | PASS |
| `check-vocabulary-contrast` | PASS — every text pair clears 4.5:1 and every graphic 3:1, both themes |
| `check:response-only-fields` (digest mode) | PASS |
| `check:response-only-fields` (**drift mode — never run before**) | **FAILED. Real drift found.** |

**What the drift was.** The console carried a stale copy of the registry that decides which fields only the endpoint
may write. The Backend's copy names `teardownObservedAt` / `teardownEvidence` as the sharpest case — they exempt a
row from the signed re-enrollment guard, and a console write path that could set them would hand that exemption to
anyone holding the site API key. The console's copy did not have that at all.

**Why nobody saw it.** The gate exits 0 when it cannot find a Backend checkout. It printed
`OK - digest verified` plus a note that drift `was NOT checked`. A note is not an exit code, and the digest only
proves nobody hand-edited the file.

**Fixed** in `wave47/gates` `7e8cce3b`: registry re-synced, digest refreshed, and that branch now reports
**NOT CHECKED** instead of OK, with `REQUIRE_BACKEND_DRIFT_CHECK=1` turning a missing checkout into a failure.
Proven on all four branches — drift red / cleared green, required-without-checkout red, required-with-checkout green,
digest-only reports NOT CHECKED at exit 0.

## Still owner-only — no agent can close these

- **§0.1 unblock GitHub Actions** (`github.com/organizations/Ceragon-Prod/settings/billing`). Blocks every agent
  release, all CI on 7 repos, §4.4, and M4.7A Risk 2.
- **§0.2 approve an agent release.** Until then every Installers fix in this wave — and the quarantine data-loss fix
  already merged — is live on **zero endpoints**.
- **§0.4 approve a real-box MSI install/uninstall cycle.** §2.1, §2.2, §2.4, §2.5 and §2.7 cannot be closed without
  it; a reinstall has permanently bricked a trust anchor before.
- **§0.3 transcript backup** — declined once; still open.

### §2.7 item 4 — the read-only half, done on this workstation

The full item needs a disposable VM (it changes a registry ACL on a live user hive). Its **precondition
sweep is host-safe and was run**:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss   present: True
  {88643d09-...}  DistributionName=Ubuntu           BasePath=C:\Users\Owner\AppData\Local\wsl\{...}
  {fbc6ddb4-...}  DistributionName=docker-desktop   BasePath=\?\C:\Users\Owner\AppData\Local\Docker\wsl\main
```

Two registrations, and **this is exactly the shape the WSL test fixtures already model** — `cmd/devoid/wsl.go:71-72`
excludes `docker-desktop` and `docker-desktop-data` as system distros, and
`wsl_enumerator_agreement_test.go` asserts the doctor **names** docker-desktop and says it was excluded and why,
rather than silently dropping it, and that it never advises `bootstrap --distro docker-desktop` (advice that would
damage a Docker install).

**So the WSL lane's premise holds on real hardware.** What still cannot be closed here is the access-denied case —
a key that exists but cannot be opened — because producing it means changing the ACL on this profile's live hive,
which the packet forbids on the workstation.

**One thing to check when the VM item runs:** docker-desktop's `BasePath` carries the `\?\` extended-length prefix.
Nothing in `internal/wsldistro` or `internal/pathfix` matches on that prefix. If any consumer ever starts comparing
`BasePath` as a plain string, that entry will not match. Not a defect today — no consumer reads it — but it is the
kind of detail that becomes one silently.

---

## Lane 15 — CLOSED (§3.13 Go, register reconcile, two decision briefs)

`wave47/misc` `fa9ee14c` (Installers) · workspace `a112274` + `393a8f6`. Build verified clean by me
(`go build ./internal/wsldistro/... ./internal/core/backend/...` exit 0) — the agent could only claim a
parse, so this was re-checked rather than accepted.

**Both suspect comments were genuinely false.** Neither was a checklist error:
- `internal/wsldistro/rows.go:68` claimed a distinction had not been drawn — `721c780b` drew it.
- `internal/core/backend/aicontext_findings.go:135-137` claimed a field was inert pending a Backend
  declaration — Backend `ac07b170` declares and persists it.
Adjacent sentences that were re-checked and found **still true** were deliberately left alone.

**Register reconciled: 13 fixed, 2 still open, 0 wrong claims.** The file's failure mode is staleness,
not inaccuracy — every line was true the day it was written. It now opens by saying it is a list of
claims to check, not a worklist.

Two things the register said **about itself** were false and are now corrected:
- "Nothing was pushed" — all **seventeen** SHAs are ancestors of Installers `origin/main`, checked
  individually. Pushed is still not shipped: zero endpoints, per §0.2.
- The trust-anchor deploy-order constraint is now **satisfied**.

**Still open from that file:** `knownTrustLevel` has no telemetry (`requirements.go:865`, line reference
was stale), and the opt-out panel's absent-`total` bug (already lane 13).

### Two new findings from this lane

1. **A closed register line's own resolution text is stale in the direction that costs a live proof.**
   It records that the runbook was corrected to expect exit **1** on a healthy endpoint. The exit code
   changed afterwards and the runbook now correctly says **0**. An operator trusting the register over
   the runbook would abandon a valid proof for the opposite reason.
2. **§3.10 confirmed with a hard zero.** `findingsDropped` appears **0 times** in the query service.
   Fixing the truncation's write side did not make the fact visible to any console reader.

## Correction to §2.1 and §2.2 — the premise was wrong

I reported that hooks fire but do not enforce, on the strength of a destructive delete passing
`PreToolUse`. **DeVoid is not installed on this workstation** — verified: no install directory, no
`ProgramData\devoid` (only a 3-file leftover from 2026-07-14), no `~/.devoid`, no service, no uninstall
registry entry, and **no DeVoid hooks in any Claude Code settings file**, user/project/managed.

The repo already recorded this. `internal/liveproof/register.json` carries four proofs, all
`"observed": false`, all quarantined with the reason *"DeVoid is NOT INSTALLED on the build box"*, and
`docs/ai-security/LIVE_PROOF_PROCEDURE.md` states the proofs need an endpoint the build box does not have.
`go test ./internal/liveproof/...` fails when a control has never fired and its quarantine is missing or
expired — those quarantines expire **2026-11-05**.

**Correct status of §2.1 and §2.2: NOT MEASURED — not "proven broken".** Still a hard gate; different
fix. It is not "repair enforcement", it is "obtain one endpoint and measure".

## §3.1 redirected before it could ship a brick

`internal/liveproof/register.json` entry `machine-secret-denies-local-users` records that the strict
descriptor **already exists and is already pinned in both directions**, that **no production file carries
it**, and that moving the credential files onto it today *"blocks every non-elevated `npm install`
fleet-wide"* — because the unprivileged shim reads the machine credentials and treats a 401 as
fail-closed. The recorded precondition is a per-user credential split plus per-user daemon-token
distribution. Lane 9 has been redirected to the reader-inventory test plus a design for that split.

---

## Lane 7 — CLOSED (§4.1 live-pg fail-closed, §4.8 guardDegraded). 10 commits on `wave47/livepg`.

### The question it was sent to answer

**Is `RUN_INTEGRATION_TESTS=true` actually set where the Backend suite really runs?**

**Yes.** `pr-checks.yml:228, :244, :391, :650` (all 4 shards) and `build.yml:272`. It is set nowhere else —
`package.json:23` is a bare `jest`, no jest config sets it, and the local Docker mirror never names it but
**does inherit it**, verified by executing the mirror's own `planJob` against the real workflow file.

**But since 2026-08-25 no GitHub event runs those workflows at all** — the cost gate left them
`workflow_dispatch`/`repository_dispatch` only. So the switch is correct and the lane it protects executes
only on a deliberate dispatch or a local mirror run.

### The sharper finding — the switch was never enough for seven of them

**7 live-pg specs could not reach a CI database even with the switch on, in any lane, ever.** They do not
read `DATABASE_HOST`. They read `VERDICT_SQL_TEST_DATABASE_URL` (one tries `F38_TEST_DATABASE_URL` first)
and otherwise fall back to laptop ports 5433 / 55432 / 55433. **Neither variable is set in any workflow.**
They take a runtime `dbUp = false` branch, every `it()` returns early and **passes**, Jest counts the file
as a passed suite, and `scripts/assert-suites-executed.js` is structurally blind to it — it can only see a
file Jest marked *skipped*.

Census of all 98: **89 wired** on `DATABASE_HOST`, **7 dark**, 2 wired on their own vars.
The comment at `pr-checks.yml:651-656` still says "47 of the 50". There are 97, and the three it names are
not these seven.

### Proven

Same file, same absent database, opposite verdicts:
```
REQUIRE_LIVE_PG unset  ->  Tests: 19 passed, 19 total   exit 0
REQUIRE_LIVE_PG=true   ->  Tests: 20 failed, 20 total   exit 1
```
§4.8 green against a real Postgres 17 (129 tables, 240 migrations, 323 CHECK constraints): 10/10.
A psql dry-run showed **the real predicate selects 2 rows where the naive one selects 6** — including a
JSON-null row that would have demoted a known fail-open endpoint. That is exactly the class of defect a
TypeScript re-implementation of a database predicate cannot catch.

Default lane unchanged: no test injected, no suite status flipped, the existing suite gate still green.

### PENDING — a workflow edit I must apply at integration (the agent correctly did not touch `.github/**`)

**Order matters. Step 2 before step 1 reds the job on day one.**

1. Add to the Jest `env:` block in `pr-checks.yml` (after :650) and `build.yml` (after :272):
   `VERDICT_SQL_TEST_DATABASE_URL: 'postgresql://codefense:codefense@localhost:5432/codefense_db'`
2. **Only once step 1's run is green**, add `REQUIRE_LIVE_PG: 'true'` to the same blocks.
The mirror inherits both automatically; no `ci/` change needed.

### Not exercised

3 of the 7 dark specs never got a clean run **on this box** — every failure was a timeout or a dropped
connection, **zero assertion-shaped failures**, with single spec files taking 700–1900s under contention
versus 38s alone. That is this wave saturating the machine, not a defect. No full-suite run, no mirror run,
no GitHub run.

`ceragon-ra0-pg` is **behind the migration chain** — its `ai_events` lacks `caused_by_event_id`. A loud
precondition check now names the missing columns and the fixing command. A prepared Postgres is left as
`r47-livepg-pg` on `127.0.0.1:55462`; remove with `docker rm -f r47-livepg-pg`.

---

## Lane 11 — CLOSED (§3.10, §3.14, §3.13 Backend). 4 commits on `wave47/console`.

**§3.10 — the console can now see that evidence was truncated.** `findingsDropped` is projected through
`safeMetadata` and declared on the timeline DTO. One DTO type serves Timeline, Activity and Detections, so
all three get it from one projection. Bounded as a **count**, not text, and absence is never coerced to 0 —
so an untruncated row still hashes as before.

Mutation-proven both halves: removing the allowlist entry reds 5 specs (the 4 that stay green are the
absence controls, correctly); removing the DTO field is invisible to transpile-only jest, so that half is
proven by `tsc` instead — `TS2339: Property 'findingsDropped' does not exist`. Restored, 9/9 green,
including a control at exactly the cap (not a truncation) and an **unknown** key fed to the allowlist and
dropped while the declared one passes. The pass is a declaration, not an open door.

**§3.14 — option C implemented, and the comment defending option B cited its own evidence backwards.**

*Plain English:* the field is a one-word label for **where** an operator approved a data release; the
console prints "approved on …". Under B the backend accepted any 64-character sentence, so a tampered
endpoint could make the console display a plausible approval story of its own wording. Under C only
single-token labels pass — `BROWSER_EXTENSION`, `browser_extension`, `CLI`, `extension-modal` all render
exactly as today; a sentence or markup renders as nothing. **No legitimate producer value is lost.**

The comment justifying B cited a spec line as supporting it. That line sits inside
`it('rejects any other surface claim, including free text')` and asserts the string is **rejected** — the
citation was inverted. The comment also contradicted itself four lines later.
Mutation-proven: reverted to the loose rule, all six legitimate values stay green and only the sentence,
the markup, the HTML-ish label, the quoted claim and the comma list go red. That is a narrowing, not a wall.

**§3.13 — all three Backend comments were genuinely false.** My summary was right on all three; each is
rewritten to name the real producer. Three adjacent comments that were checked and found **still true**
were left alone.

### Follow-ups this lane generated

- **Applied by me** (`a3bb8e4f`): a live-Postgres fixture listed a free-text `approvalSurface` in its
  *legitimate* set — a value no producer can emit — so option C would have read as a regression the first
  time anyone corrected the gate. NOT RUN: no Postgres attached, and per lane 7 these files report green
  when Postgres is absent, so it carries no evidence yet.
- **Routed to lane 12**: the Frontend chip that renders the count. Sent with the control requirement
  (absent and zero must render nothing) and a question — the Backend lane reports **the console renders no
  AI-event findings list at all**, which would make this chip the only findings signal there is.
- **NEW, still open:** `guardDegradedDropped` and `metadataKeysDropped` are the *same defect* — stamped by
  the same writer, read by nobody, absent from both the allowlist and the DTO. §3.10 named only
  `findingsDropped`, so only that was fixed; a tripwire spec now pins `guardDegradedDropped` as *not*
  projected, so whoever adds it sees the pin.

### Measured, not assumed

Three HTTP suites failed with timeouts on the parallel run. Re-run serially on the same branch:
**3 passed, 31 tests, 0 failures.** One of those suites takes 558s alone against a 5s per-test default, so
187 suites in parallel on this bind mount blows it. Not caused by this change. `tsc --noEmit` exit 0. The
138 eslint errors across the touched files all sit on lines this wave never touched — pre-existing red.

**Near-miss worth recording:** this lane ran a `git stash push` it intended to be inert. It captured its own
edit for about a minute, popped it immediately, and verified the seven other stashes (other chats') were
intact. Concurrent sessions share these checkouts — `git stash` is not a safe idle command here.

---

## Lane 9 — RECORDED "NOT LANDABLE" (§3.1). 3 commits on `wave47/winacl`. **No SDDL was changed.**

That is the correct outcome, and it is evidence-backed rather than cautious.

**The register was half stale.** One production file *does* now carry the strict descriptor
(`endpoint_identity_windows.go:32`, landed 2026-08-18); the register entry was written 2026-08-07, so it
was true when recorded and false for eight days. The rest holds: the credential file and the daemon token
are still on the permissive boundary.

**There are THREE non-elevated readers of the daemon token, not one.** The register named one. The third
— the browser prompt-guard host — **fails OPEN**. So anyone who read the old prose, closed the named
reader and narrowed the ACL would have taken the shipped Web AI Guard browser lane down **silently**: it
would keep running and stop governing.

**Landed instead:** a `go/ast` reader-inventory test — resolved selectors, immune to comments and string
literals, no build tag so it runs on the Linux runner CI actually uses. It fails in **both** directions:
a new non-elevated reader appears, *or* the last one disappears. Mutation-proven both ways, plus the
tightening itself proven to go red naming the exposure.

### The second door — three components encode two opposite boundaries

Verified by me directly:
- `install-scripts/production/install.ps1:2585-2596` **always re-asserts** a restrictive DACL on the
  daemon token — installing user + Administrators + SYSTEM, inheritance disabled — and its own comment
  calls itself *"the ACL-repair path for a token the daemon minted itself with the permissive inherited
  ACL"*. It then prints **"Daemon capability token ACL enforced"**.
- `internal/daemon/daemon_auth.go:209` documents the opposite intent — *"protected file ACL granting
  Builtin Users read on Windows, so the human-user shim can authenticate"* — and
  `loadOrCreateDaemonToken` **re-asserts the at-rest perms on every reuse, not just on mint**.
- `windows-installer/msi-build/verify-msi-acl.ps1:1100` **asserts a non-admin CAN read both secrets.**

The installer runs once; the daemon runs on every start. **The daemon wins, so the installer's message is
the falsehood.** And the daemon is not simply wrong — its looseness is what keeps non-elevated
`npm install` working, because the shim treats a refusal as fail-closed. The one automated gate that
would catch a bad tightening runs only on GitHub Windows runners, which cannot be mirrored and are
blocked.

On Windows there is also **no second factor** behind that token — the peer-identity check is a no-op off
Linux — so it is the only local authentication for restore, shutdown and the posture routes that were
moved behind a token *precisely because loopback is not a boundary*. Two comments promising a "per-user"
token were corrected by me (`b2302589`).

A full per-user-split design is in the lane report, including the sharp part: the "may only ever tighten"
rule that is protective today becomes the delivery mechanism for a fleet-wide outage the moment the
routing constant changes.

---

## Lane 4 — CLOSED (§2.6 real shim test, §4.3 the alarm). 3 commits + `6ac4e38` in the workspace repo.

**The fake is gone.** Shim directories now hold byte-identical copies of the real binary, re-verified
before anything is asserted, and the assertions are on **the side effect — whether the commit reached the
bare remote** — not on exit codes.

Green across **all 6 Linux shells × 3 scenarios × both privilege modes.** The allow-control and the block
go through the *same* branch and differ only in verdict, and a bypass leg re-sends the blocked push and
lands it — which is what rules out "the push failed for an unrelated reason".

### The mutation that caught a hole in the test's own first version

With enforcement removed, **the product still prints "PUSH BLOCKED" and pushes anyway.** On the `.env`
input an unrelated fail-closed control happened to stop the push, so exit code, unmoved ref and the
message all looked correct. Only asserting *"the run must stop at the gate"* separates them. The first
version of the test went red one case too late. **The message is not the enforcement.**

A fourth mutation proves the shell-profile shim is load-bearing rather than decoration: identical commit,
identical remote, PATH the only difference — on PATH the push is refused; off PATH the hook fails open and
**the secret lands**.

### The alarm is re-plugged, cheaply

Weekly schedule; every job except the deliberately-red one carries an event filter, so a scheduled run is
**one Linux job — roughly two cents a week**, against the ~$600 month the pull-request trigger produced.
The RED-ON-PURPOSE block is verbatim, with a note that it is deliberately the one job without a filter so
nobody silences it by adding one. `finding-b-e2e` gets a path-filtered push-on-main running only the new
enforcement job, plus a monthly full matrix.

**Not exercised:** GitHub Actions never ran — every trigger, filter and schedule is static reasoning only.
macOS and Windows legs unrun (no macOS runtime; Docker here is the Linux engine).

---

## A claim I checked and did NOT act on

The tool-risk lane reported that the interruption copy "names no dial" and still says "Cera". **Both are
stale.** `internal/daemon/ai_handlers.go:3962` says **DeVoid**, and `:3982` already appends
*"To stop this interruption: AI Security -> Tool-Risk -> {class} -> Monitor"*. The only "Cera" strings in
that tree are deliberate pre-rebrand scheduled-task name lookups. **F41(c)'s "name the class and the dial"
is DONE.** The remaining half is surfacing `exclusions.allow` in the console — Backend already carries it.

---

## Lane 5 — CLOSED (§1.3 lockfile). 5 commits on `wave47/lockfile`.

Two clean installs from **separate empty caches**: 1016 packages each, identical tree hash
`6dda24f3…`. Build exit 0, 3673 dist files, zero TS errors. Audit gate passed with **0 unaccounted
high/critical**; the allowlist stays empty. The gate can go red — a deliberate `package.json`/lockfile
mismatch produced `Invalid: lock file's axios@1.20.0 does not satisfy axios@1.19.0`.

**The real evidence is the negative, and it is not what "reproducible install" usually means.** Two
unlocked installs *at the same instant* agree. The failure is that the answer changes underneath you:
**21 of 80 direct dependencies differed** between the developer's installed tree and a same-day fresh
resolve, with **zero commits to `package.json`** — axios 1.16→1.20, openai 6.25→6.49, typeorm
0.3.28→0.3.31, @typescript-eslint 8.59→8.68, and 17 more. `ajv` was installed at 8.18.0 while
`package.json` demands exactly 8.20.0.

**The lane retracted its own reasoning after measuring it.** It first wrote that the lockfile landed on a
working `@types/node` only because of the pin. Then it swapped in 20.19.43 by unpacking the tarball
directly (npm silently reverted an earlier attempt — worth knowing) and measured: **0 errors either way.**
The documented 3-error breakage no longer reproduces, and *why* is not established. Pin kept on narrower
honest grounds, written into the step, with relaxing it named as a real option rather than a trap.

Frontend confirmed genuinely using its lockfile (`npm ci` in pr-checks, security, and the Dockerfile).

**Highest residual risk:** the **Docker image build never succeeded** — three attempts, all failing on
container→registry egress, never on the lockfile. The same `npm ci --omit=dev` succeeds on Windows, so
the lockfile is installable dev-free, but the Linux leg is unverified and the Dockerfile builds what ships.

Also found, reported not fixed: **the committed `shared-contracts/dist` does not match its source** — the
de-AI sweep edited the built artifact rather than the source, so every rebuild reintroduces em dashes.
And `.gitattributes` does not pin the lockfile to LF, in a repo whose own file documents four prior CRLF
incidents.

**Method warning worth keeping:** `git show "origin/main:.github/…"` fails under MSYS path mangling on
this box, and a `|| echo` fallback swallowed it into a **false negative**. Use `MSYS_NO_PATHCONV=1`.

**Fixed by me** (`e0ee2bd`): the mirror's own docs asserted the Backend has no lockfile and cannot use
`npm ci`. The mirror reads commands from the real workflows and picked the change up unaided — only the
prose was stale, which is the worse half.

---

## Lane 8 — CLOSED (§4.2 HTTP boundary). 4 commits on `wave47/httpbound`.

Three specs booting a **real Nest app over a real socket** with the production bootstrap — real rawBody
verify, cookie parser, helmet, exception filter, the real ingest pipe, real guards. The policy-bundle spec
derives a **genuine HMAC signature** from the keyring and verifies it through the real signature guard
against a real database row, so the endpoint identity is crypto-derived rather than injected. Schema built
fresh: 240 migrations, 323 CHECK constraints. Baseline 48/48 green.

Five mutations, all red then green. **The most important is M2:** stop the controller forwarding one field
and the request still returns **201 in every case** — only the stored-row assertion notices. That is
exactly how a silently-dead column shipped here before.

### New finding — the tolerate-and-drop mechanism has a layer in front of it that tolerates nothing

Guards run **before** validation in Nest, and `SiteGuard` reads the raw request body. So an agent that
starts stamping a site identifier onto an enrolment body gets **403 Forbidden**, not a silent drop —
reproducing the exact fleet-wide-outage class the tolerance mechanism exists to prevent, one layer earlier,
where nobody has been auditing. **The pipe is the wrong place to look.** Sent back to be fixed at the right
layer, with a tenant-boundary test and a sweep for sibling guards.

### Three more, pinned at the wire

- **The signature timestamp header is ISO-8601, not epoch seconds.** Nothing in the repo pinned this. If
  the Go agent ever "simplifies" to epoch, **policy delivery dies fleet-wide and the signing code still
  looks correct.**
- The exception filter **echoes the raw internal error string** on unhandled 500s unless
  `NODE_ENV=production` — deliberate, but a dev or staging box leaks internals in the response body.
- **A bearer-only endpoint gets 403 from the policy bundle and no policy at all**, while the console shows
  it healthy. That is this campaign's core failure shape and it is adjacent to a hard gate. Routed to a
  decision brief; behaviour unchanged.

---

## Lane 13 — CLOSED (§3.11, §3.12). 2 commits on `wave47/fesmall`, now resumed with a widened scope.

**§3.11 proven by showing the defect verbatim:** with no total on the wire, the pre-fix panel rendered a
**byte-identical string** to the measured case. Now three distinct states. A sibling in the same file was
worse — an unreported *population* was printed as the row count of the page in front of the operator.

**§3.12 — honest verdict: robustness, not a vulnerability.** AST-verified across 1,483 files: **zero**
`dangerouslySetInnerHTML` anywhere. The suite *demonstrates* the escaping rather than asserting it, by
feeding it script and image-onerror payloads and requiring no element is created — **and those cases
passed on the unfixed code**, which is the evidence for the verdict rather than a weakness in it. What was
genuinely possible and is now closed: right-to-left override characters reversing displayed text,
invisible characters inside words, newlines breaking the sentence, and a 5,000-character flood.

**The file already contained the fix**, with a doc comment describing this exact defect — wired to a
different banner one section below and never to the reported line.

**A closed-set lookup walked the JavaScript prototype.** `constructor` returns a Function and React
renders **nothing** — the reason a capability is inactive silently vanishes. `__proto__` returns
`Object.prototype` and React **throws**, taking the whole card down. Inert shape 4 exactly: the set had
only ever been fed its own members.

**Its own test was inert first** — it asserted only that the page survived, and passed against the broken
lookup for 4 of 5 tokens. Rewritten to a positive assertion; all five then go red unfixed.

**Systemic:** ~25 further sites across the console render server-supplied text raw. Now producing a
census rather than a patch, plus the shared-component fix, the sibling sites in its own directory, and the
`exclusions.allow` console surface that F41(c) still needs.
