# Backend full-suite lane — configuration, denominators, results

Subject: `integ/gate-backend` @ **`08d24367`** (the worktree has since advanced — see §7).

Closes S10 gate row **A2 Backend full suite**, which has been BLOCKED since 2026-08-08 with
"no complete run achieved, so there is no count and this is **not a PASS**".

Everything below is separated into **PROVEN** (pasted evidence from this box) and **NOT EXERCISED**
(with the reason). Nothing here says "all working".

Lane lives at [`be-suite-lane/`](be-suite-lane/):

| file | role |
|---|---|
| `Dockerfile.suite` | image with the Backend tree COPIED IN and `npm install` run inside |
| `run-be-suite.sh` | host orchestrator — `build` / `up` / `run` / `report` / `fetch` / `down` |
| `in-container-suite.sh` | in-container run: prepare schema → sharded jest → repo suite gate |
| `lane-accounting.cjs` | per-lane DISCOVERED vs EXECUTED, plus VACUOUS-suite detection |

## The command that runs the lane

```bash
cd .plans/verify-prod-20260808/be-suite-lane
bash run-be-suite.sh build     # ~13 min: apt + npm install + COPY, once per source change
bash run-be-suite.sh up        # three postgres:17 on named volumes, one netns
bash run-be-suite.sh run       # the suite; SHARDS=4 WORKERS=4 in series
bash run-be-suite.sh report    # per-lane discovered vs executed
bash run-be-suite.sh fetch     # copy /out off the named volume to ./results
bash run-be-suite.sh down      # remove containers + pgdata volumes
```

Knobs: `BE_SRC` (default `/c/cwt/int-be`), `SHARDS`, `WORKERS`, `HEAP_MB`, `MEM`, `FIRST_SHARD`
(resume a run that died mid-way), `SKIP_PREPARE`.

---

## 1. The block, reproduced and named — PROVEN

The recorded diagnosis was "I/O-bound on the Windows bind mount". **That is partly right and not
sufficient.** Measured, same tree, same jest 29.7.0, same deterministic `--shard=1/80` sample,
`--maxWorkers=2`, identical results either side (12 passed / 1 skipped / 13 discovered):

| environment | jest wall time | projected for 973 suites |
|---|---|---|
| Windows host, node 25.2.1, `node_modules` junction | **419.1 s** | **~8.7 h** |
| container, source in image, node 24 | **224.8 s** | **~4.7 h** |

Host:

```
Test Suites: 1 skipped, 12 passed, 12 of 13 total
Tests:       42 skipped, 105 passed, 147 total
Time:        419.149 s, estimated 800 s
```

Container:

```
Test Suites: 1 skipped, 12 passed, 12 of 13 total
Tests:       42 skipped, 105 passed, 147 total
Time:        224.804 s
```

So getting off the Windows filesystem buys **1.86×** — real, but it turns 8.7 h into 4.7 h, which
is still not a completable run. **The blocker was never one thing.** It is two, and the second one
is the one that actually mattered:

1. filesystem — worth 1.86×, fixed by putting the source in the image;
2. **worker count** — the run was pinned at `--maxWorkers=2` on a 12-CPU box because the one attempt
   to raise it took the engine down. Nothing was capping the blast radius, so the safe move was to
   stay at 2 workers forever.

The failure mode is **not** OOM-of-the-suite, not a timeout, not Postgres, and not the bind mount
alone. It is *over-subscription with no containment*.

### The memory ceiling, measured

A ts-jest worker on this repo's module graph costs **~850 MB RSS**. Probe: `--shard=1/20` at
`--maxWorkers=6 --max-old-space-size=1024` under a 5 GiB cgroup cap. The container climbed to the cap
in ~2 min and sat pinned there:

```
be-suite-probe6 1008MiB / 5GiB
be-suite-probe6 2.824GiB / 5GiB
be-suite-probe6 3.892GiB / 5GiB
be-suite-probe6 4.996GiB / 5GiB
be-suite-probe6 4.998GiB / 5GiB
```

VM at that moment — note it is *swapping* and still alive:

```
              total        used        free      shared  buff/cache   available
Mem:           7591        6513          73          75        1005         812
Swap:          2048        1092         956
```

and then the cgroup OOM killer took a worker:

```
FAIL src/jobs/dto/worker-result.dto.spec.ts
  ● Test suite failed to run
    A jest worker process (pid=81) was terminated by another process:
    signal=SIGKILL, exitCode=null.
```

**That is the whole design of this lane.** Six workers is over-subscribed either way. The difference
is that with a `--memory` wall the kernel kills one process *inside this container* and jest reports
a red suite; without it the VM runs out and the engine goes down, which is what happened on
2026-08-08 (6 workers × 2560 MB = a 15 GiB ask against a 7.4 GiB VM). Throughout that probe
`docker stats` and `docker run` both stayed responsive.

**Chosen: `WORKERS=4`, `HEAP_MB=1024`, `--memory=4608m`.** ~4 × 850 MB + the jest parent ≈ 3.8 GiB,
inside a 4.5 GiB wall, inside a VM with ~5.0 GiB free once the pre-existing `codesec-e2e` stack
(~1.5 GiB, another workstream's, deliberately left running) and the three Postgres servers (~0.4 GiB)
are accounted for. Observed steady state during the real run: `2.372GiB / 4.5GiB`, CPU 385 %.

Shards run **in series**. Four parallel shards would multiply the ceiling by four and put us back
where the last attempt was. Sharding here buys resumability, not concurrency.

---

## 2. Configuration decisions worth knowing

**Source in the image, not bind-mounted.** `.dockerignore` already drops `node_modules/` — which in
both worktrees is a junction into the primary `Backend` checkout — so the container installs its own
inside the Dockerfile. That is the one place a normal `npm install` is safe; on the host it prunes
the junction and yields 335 phantom TS2305 errors.

**Node 24, deliberately.** The repo pins it (CI `node-version: 24.x`, production
`Dockerfile FROM node:24-alpine`). `.nvmrc` says `lts/*`, and the **Windows host currently has node
25.2.1 on PATH** — so any verdict taken with the host node is not taken on the pinned runtime. The
image is `node:24-bookworm-slim` rather than the production Alpine because CI runs `ubuntu-latest`,
and matching CI's libc is what makes a local red/green transferable to a CI red/green.

**Three Postgres servers in ONE network namespace, on named volumes.** They are addressed on
loopback at `5432` / `55432` / `55433` — exactly the addresses `pr-checks.yml` uses. That is not
cosmetic: `src/__test-utils__/assert-non-production-db.ts` is a `setupFiles` entry (so it runs in
every worker before any spec loads) and it **refuses a non-loopback `DATABASE_HOST`** unless
`ALLOW_NONLOCAL_TEST_DB=true`. Sharing a netns means the lane **satisfies** that production-DB guard
instead of switching it off. The two AICP servers get their own instances because both AICP specs
call `DataSource.synchronize(true)` — drop and recreate every table.

**The schema is built the way production builds it**: `testdb:prepare-live-pg` runs the migration
chain on an empty database, then `migration:run` verifies the ledger. Both returned `exit=0` in this
lane.

**`node node_modules/jest/bin/jest.js`, never `npx jest`** — the DeVoid tool-risk guard is a control
we run under, not an obstacle to route around. (It also blocked one of my own `docker run` probes for
`--privileged` and a heredoc containing an `rm -rf` string; both were re-done a different way rather
than bypassed.)

### Fidelity gaps vs CI — stated, not hidden

- `--maxWorkers=4` here vs `--maxWorkers=2` in CI, and shards in series vs four parallel runners.
  Same total work, different scheduling. A test that depends on worker count or on wall-clock timing
  can differ between the two.
- All four shards share **one** prepared Postgres, sequentially. CI gives each shard its own. Any
  cross-shard state left in the database persists here and does not in CI.
- Invoking the jest binary directly skips the `pretest` hook (`build:shared-contracts` →
  `check:ai-security-consumer` + the packed probe). Those are separate checks, not part of the suite;
  the vendored `packages/shared-contracts/dist` they would rebuild is committed. This is the same
  bypass already recorded as NOT-RUN in `S10-GATE-RESULTS.md`.

---

## 3. Denominators — DISCOVERED, by lane

Counted with `--listTests` (no execution), inside the image, on the tree under test:

| config | testRegex | discovered |
|---|---|---|
| `jest.config.js` (rootDir `src`) | `.*\.spec\.ts$` | **973** |
| `test/jest-e2e.json` | `.e2e-spec.ts$` | **1** |
| **total distinct spec files** | | **974** |

The two sets are **disjoint**: `customer-output-contract.e2e-spec.ts` ends in `-spec.ts`, which does
not satisfy `\.spec\.ts$`, so the main config cannot see it.

973 vs the **957** recorded on 2026-08-08 — the campaign added 16 suites. One of the 973 is
`src/ai-governance/services/zz-adv-reporter-probe.live-pg.spec.ts`, an **untracked** probe file
sitting in the worktree; it is inside the build context and therefore inside the image and the run.

Sub-lane composition of the 973 (by filename, which is also how CI decides which env var un-gates
what):

| sub-lane | files | gate |
|---|---|---|
| `*.live-pg.spec.ts` | 80 | `RUN_INTEGRATION_TESTS` / `RUN_LIVE_PG_TESTS` + live PG |
| `src/licenses/__tests__/**` | 32 | `RUN_LICENSE_INTEGRATION_TESTS` + live PG |
| `*.e2e.spec.ts` (dot) | 4 | `AICP_M1_E2E` / `AICP_M2_E2E` / `RUN_INTEGRATION_TESTS` |
| `*.dev.spec.ts` | 1 | platform gate — sibling workspace checkout (allowlisted) |
| plain unit | remainder | none |
| `*.e2e-spec.ts` (dash) | 1 | **separate config** — see below |

**EXECUTED counts per lane are in §4** — they come from the run, not from this table.

### Why `lane-accounting.cjs` exists beside the repo's own gate

`scripts/assert-suites-executed.js` already answers "did every discovered suite execute?" for a run,
and it is a good gate. It has two blind spots this lane's accounting covers, and its own header
admits the second one ("a gated `describe` beside an un-gated one is invisible to it"):

1. it reports **one number for the whole run**, so a whole lane going dark at once — which has
   happened twice on this project, once for 50 live-pg specs and once for 17 licenses suites, both
   from a single unset environment variable — is a rounding error inside a four-figure total;
2. it counts **files**, so a file whose only `describe` is skipped at runtime but which still reports
   is invisible to it. `lane-accounting.cjs` calls those **VACUOUS**: `status: passed`, zero
   assertions executed.

---

## 4. Results — PROVEN

**The run completed.** S10 row A2 moves from BLOCKED to a real verdict.

```
shard 1 exit=1 elapsed=1119s   Test Suites: 7 failed, 1 skipped, 236 passed, 243 of 244 total
shard 2 exit=1 elapsed=690s    Test Suites: 6 failed, 1 skipped, 236 passed, 242 of 243 total
shard 3 exit=1 elapsed=1651s   Test Suites: 14 failed, 229 passed, 243 total
shard 4 exit=1 elapsed=1358s   Test Suites: 10 failed, 233 passed, 243 total
e2e     exit=0                 Test Suites: 1 passed, 1 total   Tests: 26 passed, 26 total
```

Wall clock **4818 s = 80 min** for 973 suites, against a projected 7–13 h — about **6.5× faster than
the host baseline**, of which 1.86× is the filesystem and the rest is being able to raise the worker
count without taking the engine down.

| | suites | tests |
|---|---|---|
| discovered | **974** | |
| passed | **935** | 15 861 |
| failed | **37** | 40 |
| skipped (whole file) | **2** | |

935 + 37 + 2 = **974**. Of the 935 passed, 934 are under `jest.config.js` (236 + 236 + 229 + 233
across the four shards) and 1 is the e2e lane. Of the 37 failed, 13 executed and then failed and 24
were red before a single assertion — that split is the `redSuites` / `failRun` columns below, and it
matters: a compile error and a failed expectation are not the same finding.

### Discovered vs executed, BY LANE

```
lane                    disc  exec  skip  failRun  vacuous  redSuites  tests+  tests-
-------------------------------------------------------------------------------------
licenses-integration      30    30     0        0        0          6     252      22
live-pg                   80    75     0        5        0          4    1004      11
e2e-dot                    4     3     0        1        0          1      16       1
e2e-dash                   1     1     0        0        0          0      26       0
dev-only                   1     0     1        0        0          0       0       0
unit                     858   839     1       18        0          2   14563       6
-------------------------------------------------------------------------------------
TOTAL                    974   948     2       24        0         13

jest numTotalTestSuites across summaries: 974
testResults rows across summaries:        974
```

**VACUOUS = 0 in every lane.** No lane reports green while asserting nothing. That is the honest
answer to "is a whole lane discovered but never executed" — and this time it is good news, earned
rather than assumed.

**The live-pg lane is live.** 80 discovered, 75 executed, **1004 tests passed**. The spec flagged to
me specifically, `src/ai-governance/services/ai-query.optout-details-allowlist.live-pg.spec.ts`,
executed **12 assertions, all passed**:

```
jest-summary-shard-1.json | src/ai-governance/services/ai-query.optout-details-allowlist.live-pg.spec.ts
  status: passed | assertions executed: 12 | pending: 0
   - passed : stores all seven identifying keys in ai_events.metadata (the write side is honest)
   - passed : projects all seven onto the ACTIVITY row
   - passed : projects all seven onto the SESSION TIMELINE row
   - passed : surfaces every key the shared contract names, read off a live console row
```

The 5 live-pg suites in the `failRun` column are not skips — they are red-before-assertion, and all
5 went green on a serial re-run (§4.2).

**Both file-skips are correct and already allowlisted.** The repo's own gate agrees on all shards:

```
suite-gate [be-suite-lane shard 1/4]: 1 allowlisted skip(s):
  - [aspirational-target-behaviour-intentionally-red] src/ai-governance/m47-backend-truth.repro.spec.ts
suite-gate [be-suite-lane shard 2/4]: 1 allowlisted skip(s):
  - [unsatisfiable-precondition] src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts
suite-gate ... shard 1/4: OK — every discovered suite executed.
suite-gate ... shard 2/4: OK — every discovered suite executed.
suite-gate ... shard 3/4: OK — every discovered suite executed.
suite-gate ... shard 4/4: OK — every discovered suite executed.
```

### 4.1 A lane note that outlives the totals

`e2e-dash` — `test/jest-e2e.json` — is **structurally invisible to `npm test`**. Its one spec is
`*.e2e-spec.ts`; `jest.config.js` matches `.*\.spec\.ts$`, which a `-spec.ts` filename does not
satisfy. That config also carries `passWithNoTests: true`, so discovering nothing green-passes. In CI
it runs **only** in `build.yml`'s `e2e_advisory` job, which is `workflow_dispatch`-only and
deliberately outside the deploy job's `needs`.

That is exactly the defect class — except **the author already defended against it**. The spec's
header names the risk, and every test calls `expect.hasAssertions()` so a zero-assertion run cannot
masquerade as green. It executed here: **26 tests, 26 passed**. Reported because the *structure* is
fragile (one config, one file, `passWithNoTests: true`, advisory-only), not because it is dark today.

### 4.2 The 37 failures, classified

Method: re-run only the red suites with contention removed — one container, `--runInBand` (no worker
pool at all, so "worker terminated" cannot occur by construction), 3 GiB heap, nothing else running,
same live-PG environment. Run twice, identical both times: **13 failed, 23 passed, 36 total**.

#### (a) REAL — defects in the merged Backend: 8 suites

**A1 — `AiController` gained a 7th constructor parameter and no spec was updated. 6 suites, 8 errors.**

CX-7 added `private readonly optOutCoverage: AiOptOutCoverageService` at `ai.controller.ts:115`,
deliberately **not** `@Optional()`. All six specs that construct the controller still pass 6
arguments, so they **fail to compile and have never executed on this branch**. Independently
confirmed by `tsc --noEmit` — the same check CI's `typecheck` job runs:

```
src/agents/ai-correlation-key-custody.readiness.spec.ts(92,12): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai-runtime-filter.wire.spec.ts(92,18): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai-runtime-filter.wire.spec.ts(125,18): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai.controller.exceptions.spec.ts(54,16): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai.controller.export.spec.ts(83,16): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai.controller.qa-remediation.spec.ts(25,26): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/controllers/ai.controller.qa-remediation.spec.ts(81,24): error TS2554: Expected 7 arguments, but got 6.
src/ai-governance/services/ai-query.thread-sort-order.spec.ts(469,16): error TS2554: Expected 7 arguments, but got 6.
tsc exit=2
```

`tsconfig.json` has `include: ["src/**/*"]` and does **not** exclude specs, so CI's typecheck job
would fail this SHA. It surfaced here rather than in CI because nothing has run CI on the merged
integration SHA. One of the six even carries the stale comment
`// Real ctor arity on this branch (Wave C added exceptionService as the 5th)` — it was updated for a
*previous* arity change and not for this one, which is the signature of waves landing independently.
**Blocks merge. The fix is mechanical.**

**A2 — `aicp-m1-invariants.e2e.spec.ts` INVARIANT 3: producer and spec disagree on a persisted enum's case.**

```
● AICP M1 invariants (real Postgres, real services) › INVARIANT 3 — dead-man switch records a went-dark agent, idempotently
  expect(received).toBe(expected)
  Expected: "agent_went_dark"
  Received: "AGENT_WENT_DARK"
  > 247 |     expect(tamperRow.metadata.reason).toBe('agent_went_dark');
```

CI recorded this suite green (4/4) on 2026-08-08, so one side changed after that. **Needs an owner
decision on which case is canonical** — if any consumer matches this string exactly, this is a live
behaviour change and not a test nit.

**A3 — `scanner-cache-schema.spec.ts`: the allowlist guard flags its own spec file.**

```
● Cache-version literal lockdown › no Backend file outside the canonical allowlist declares a numeric cache-version literal
  - Expected  - 1     Array []
  + Received  + 3     Array [ "/app/src/packages/services/scanner-cache-schema.spec.ts", ... ]
```

The sweep includes the file performing the sweep. A test-design defect, but red on the merged branch
and still red serially.

#### (b) Not part of the merged Backend: 1 suite

`src/ai-governance/services/zz-adv-reporter-probe.live-pg.spec.ts` is **untracked** in the worktree —
another workstream's scratch probe. It sits inside the Docker build context, so it is inside the run.
It fails on a malformed fixture UUID:

```
QueryFailedError: invalid input syntax for type uuid: "15adv000-0000-4000-8000-000000000001"
```

(`v` is not a hex digit.) Not a finding against `integ/gate-backend` — flagged so nobody counts it as one.

#### (c) Environmental / lane-caused: 28 suites

- **23 — parallel contention.** Green on serial re-run. Two signatures: `A jest worker process was
  terminated by another process: signal=SIGTERM/SIGKILL` (jest recycling a worker mid-assignment), and
  `Exceeded timeout of 5000 ms for a hook` (a `beforeAll` reaching Postgres while three ts-jest
  workers share 12 vCPUs). Includes all 6 licenses-integration reds and 4 of the live-pg reds.
- **1 — `LicenseIssuesRepository.summary+charts.spec.ts`.** Green serially (8/8). The classifier's
  first pass never ran it: `+` is a regex metacharacter, so jest's path pattern did not match the
  filename. A real limitation of my classifier, recorded rather than papered over.
- **3 — `build-stamp-{dist,taskdef,nest-build}.spec.ts`: my image's fault, not the code's.**
  `spawnSync git ENOENT` / `spawnSync jq ENOENT`. All three pass once `git` and `jq` exist (measured
  14/14, 5/5, and a green nest-build). They do **not** need a real `.git` — they build throwaway repos
  in a temp dir. `Dockerfile.suite` now installs both.
- **1 — `build-stamp-deploy-gate.spec.ts`: cannot pass in this lane, by design.** It calls
  `execFileSync('docker', ['build', …])` to construct fixture images, so it needs a Docker daemon
  inside the test. Supplying one means mounting the host docker socket — which the tool-risk guard
  blocks, correctly. **Treat as NOT EXERCISED here, not as a pass and not as a failure.**

#### Known-flaky list: not applicable

`BoundedFanOutCompletesInTimeBox`, `internal/skillgate TestResolve_PluginFastPathHonoursContext` and
`TestRootCockpitUsesLiveStatus` are **Go** tests in the Installers repo. They cannot appear in a
TypeScript Jest suite, and none of them did.

### 4.3 RULE 0 — the lane can be made red — PROVEN

One production line deleted: the CSV-injection formula guard in `src/common/csv.util.ts`, asserted by
`csv.util.spec.ts:28`. All three phases in one container, one image layer, one jest binary:

```
########## PHASE 1 — BASELINE (unmodified production source) ##########
    ✓ neutralizes a leading formula trigger on STRING cells only (1 ms)
    ✓ applies the guard then still quotes when needed (1 ms)
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
PHASE1_EXIT=0

########## PHASE 2 — MUTATE: delete the CSV-injection formula guard ##########
28:  if (FORMULA_LEAD.test(s)) s = `'${s}`;
--- line is gone: ---
0
  ● csvCell — RFC-4180 quoting + spreadsheet-injection guard › applies the guard then still quotes when needed
    expect(received).toBe(expected)
    Expected: "\"'=1,2\""
    Received: "\"=1,2\""
Test Suites: 1 failed, 1 total
Tests:       2 failed, 9 passed, 11 total
PHASE2_EXIT=1

########## PHASE 3 — RESTORE ##########
source restored byte-for-byte
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
PHASE3_EXIT=0
```

GREEN → RED → GREEN.

**Scope, stated honestly:** the mutation was verified against the affected spec, not by re-running all
973 suites, because a full re-run costs 80 minutes per phase. What is proven is that the lane's jest
compiles and executes the image's production source and reports a real failure when that source changes.

### 4.4 Two things that bit me, recorded so they do not bite the next person

**A memory limit set below the working set does not save memory — it manufactures test failures.**
My first configuration (`WORKERS=4 / HEAP_MB=1024 / IDLE_LIMIT=900MB`) produced, in ~15 minutes: 0
PASS lines, 9 suites "failed to run", 4 × `JavaScript heap out of memory`, 2 worker SIGKILLs and 16
worker SIGTERMs. `IDLE_LIMIT=900MB` sits *below* the ~850 MB a healthy ts-jest worker already
occupies, so jest recycled workers almost every file, and a worker torn down mid-assignment reports
its file as failed. ts-jest instantiates a TS program over the whole `src` graph in **every** worker,
so ~1 GB is the floor for one worker, not a budget.

**`jest --json --outputFile` crashes on this suite set.**

```
TypeError: Converting circular structure to JSON
    --- property 'error' closes the circle
    at processResults (/app/node_modules/@jest/core/build/runJest.js:194:17)
```

It throws *after* every test has run, so the summary file is never written. The sharded run was
unaffected — each shard wrote its summary and the gate read all four — but a whole-suite `--json` run,
which is exactly what `build.yml`'s deploy-gate step does, can lose its summary this way while every
test actually ran. The classifier therefore does not use `--json`.

---

## 5. Restoration

Created by this work and removed at the end: containers `be-suite-pg`, `be-suite-pg-aicp-m1`,
`be-suite-pg-aicp-m2`, `be-suite-runner`, `be-suite-classify`; volumes `be-suite-pgdata-*`.

- **The Backend worktree `C:/cwt/int-be` is exactly as found** — branch `integ/gate-backend`, HEAD
  `08d24367`, the same 95 CRLF-only `packages/shared-contracts/dist/*` entries and the same single
  untracked probe file. Nothing was written to it; the lane reads it only as a Docker build context.
- **No `npm install` was ever run on a host worktree.** Installs happen inside the image.
- **The pre-existing `codesec-e2e` stack (another workstream's) was left running throughout** and
  budgeted around, never stopped.
- **WSL untouched** — never written to. `Ubuntu` and `docker-desktop` both still `Running`, and the
  deliberate gate-contamination entry is exactly as found:
  `drwxr-xr-x 2 root root 4096 Aug 18 15:39 /etc/codex/requirements.toml` — still a directory, with a
  timestamp predating this session.
- Nothing under `C:\ProgramData\` or `C:\Users\Owner\.codex` was touched. No branch switched, no push,
  no `git add -A`, no commit to any Backend repo.

## 6. What is NOT proven

- **`build-stamp-deploy-gate.spec.ts` — NOT EXERCISED.** Needs a Docker daemon inside the test.
- **The e2e lane is thin by construction** — 1 suite, 26 tests. Green, but not broad coverage.
- **The 23 contention failures are proven green *serially*, not proven green *under the parallel
  lane*.** They will likely recur at `WORKERS=3`. Fixing that needs either a larger VM, `WORKERS=2`
  (~2× the wall clock), or raising the 5-second hook timeout in the live-PG specs — a test-config
  change deliberately not made here.
- **All four shards shared ONE Postgres, sequentially**, where CI gives each shard its own. Cross-shard
  state persists here and does not in CI. No failure was traced to this, but it is not ruled out.
- **The recorded numbers come from the image built BEFORE `git`/`jq` were added.** The three
  build-stamp suites were proven green by installing those binaries at runtime, not by a rebuilt image.
  A rebuild moves them from failed to passed: **934 → 937 passed, 37 → 34 failed.**
- **Suite-count fidelity to CI is not established.** CI shards on its own runners with `--maxWorkers=2`;
  this lane's timing-sensitive suites ran under a different schedule.

---

## 7. Addendum — the branch moved under the run, and finding A1 is already fixed

**Which SHA these numbers describe.** The run was taken against `integ/gate-backend` at
**`08d24367`**. By the time it finished, a concurrent session had advanced the shared worktree to
**`abaed97b`** — eight commits, none of them mine. Everything in §4 describes `08d24367`. I never
wrote to that worktree; the lane reads it only as a Docker build context.

**Finding A1 was found independently by that session and is fixed at the tip.** Two of those eight
commits are exactly it:

```
767f07c6 merge(gate-backend): six spec files could not compile, so 46 assertions ran as zero
0d0e2826 test(ai-governance): six spec files could not compile, so 46 assertions were running as zero
```

Same six files, same cause. They fixed it by supplying the missing 7th argument positionally, which
is why it does not grep as `optOutCoverage`:

```
83:  const ctrl = new AiController(
...
89-    { custodyReadiness: () => ({ ... }) } as never,
90-    {} as never
91-  );
```

Verified at `abaed97b` with the same independent check used in §4.2:

```
tsc-errors-total: 0
```

So A1 is **CONFIRMED REAL and NO LONGER ACTIONABLE** — two independent discoveries of the same defect,
already closed. Their commit message puts the cost at **46 assertions that were running as zero**,
which is the same quantity this lane's `failRun` column exists to make visible.

**What this does not change.** A2 (`aicp-m1-invariants` enum-case mismatch) and A3
(`scanner-cache-schema` self-referential sweep) were not touched by those eight commits and should be
assumed still open. They were not re-verified at `abaed97b` — re-running them means rebuilding the
image against the new tip, which is the correct next step for whoever picks this up:

```bash
cd .plans/verify-prod-20260808/be-suite-lane
bash run-be-suite.sh build && bash run-be-suite.sh up && bash run-be-suite.sh run
```

**The honest lesson.** A shared worktree is not a stable test subject. A run this long should pin its
subject — build the image from a detached checkout of an explicit SHA, and record that SHA in the
image — otherwise the answer describes a tree that no longer exists by the time it arrives. The lane
records `BE_SRC` but not its commit; that is the first thing to fix in it.
