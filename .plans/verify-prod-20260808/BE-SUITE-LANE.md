# Backend full-suite lane — configuration, denominators, results

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

## 4. Results

*(populated when the run completes — see §5 for the classified failure list)*

---

## 5. Restoration

*(populated at the end of the run)*
