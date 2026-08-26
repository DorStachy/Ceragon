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
