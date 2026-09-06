# W7C Task 2 — the runs, and the defeat runs

Recorded 2026-09-04, in `C:\cwt\p47-w7c-sbx` (Sandbox-Worker, `p47/w7c-containment`).

The DeVoid shim intercepts `npm`/`npx`, so every run below invokes jest's entrypoint directly:
`node node_modules/jest/bin/jest.js …`. `node_modules` is a Windows junction into the live
checkout's installed tree.

## 1. The containment suite — 22 of 22

```
$ node node_modules/jest/bin/jest.js tests/job-processor.containment-gate.test.ts --runInBand

PASS tests/job-processor.containment-gate.test.ts (14.947 s)
  P0-18 (a)+(b) — a package is NOT executed when the run cannot be contained
    √ (a) direct mode + npm → detonation skipped, execute NEVER called
    √ (b) direct mode + pypi → detonation skipped, execute NEVER called
    √ (b) direct mode + go → detonation skipped, execute NEVER called
    √ a skipped run reports INCONCLUSIVE — the same outcome branch 2 gave, reached without executing anything
    √ DISCRIMINATING PAIR: the SAME ecosystems still run under strace — the weak modes are not collapsed
  P0-18 (c) — cargo is generalised FROM, not replaced
    √ (c) cargo still refuses strace — its existing strict skip is untouched
    √ (c) cargo still refuses direct
    √ (c) cargo still runs under full isolation
  P0-18 (d) — FAIL CLOSED
    √ (d) willRunFullyIsolated() throws → skip, and the package is never run
    √ (d) willRunWithoutAnyContainment() throws → skip, and the package is never run
    √ (d) an unprobed runner reports uncontained — absence is not a clean bill of health
  P0-18 (e) — the gate does not silently disable dynamic analysis
    √ (e) full isolation + npm → execute IS called
    √ (e) full isolation + pypi → execute IS called
    √ (e) full isolation + go → execute IS called
    √ (e) full isolation + cargo → execute IS called
  P0-18 (f) — an artifact with nothing to detonate is not reported as "ran without isolation"
    √ (f) noExecutableSurface still PROCEEDs, above the no-isolation branch
    √ (f) DISCRIMINATING PAIR: the same input WITHOUT noExecutableSurface is INCONCLUSIVE
    √ a HARD signal still BLOCKs from a weak-mode run — the whole benefit of running at all
  P0-18 — EVERY detonation site is behind the gate, not just the install phase
    √ there are exactly 3 detonation call sites — a new one must be gated deliberately
    √ detonation site 0 is dominated by the containment gate
    √ detonation site 1 is dominated by the containment gate
    √ detonation site 2 is dominated by the containment gate

Tests:       22 passed, 22 total
```

All six cases the wave file specifies — (a) through (f) — are present, plus two explicit
discriminating pairs and the source-dominator guard described in §4 below.

## 2. Defeat runs — three mutations, three reproduced reds

A test nobody has seen fail is a test that is NOT RUN. Each mutation was applied, the red observed,
then reverted; `git status` was clean after each.

### Defeat 1 — restore the cargo-only early return (the wave file's specified defeat)

Mutation: `if (ecosystem !== 'cargo') return false;` re-inserted at the top of
`shouldSkipUncontainedDetonation`.

```
  × (a) direct mode + npm → detonation skipped, execute NEVER called      Expected: true / Received: false
  × (b) direct mode + pypi → detonation skipped, execute NEVER called     Expected: true / Received: false
  × (b) direct mode + go → detonation skipped, execute NEVER called       Expected: true / Received: false
  × (d) willRunFullyIsolated() throws → skip                              Expected: true / Received: false
  × (d) willRunWithoutAnyContainment() throws → skip                      Expected: true / Received: false

Tests:       5 failed, 17 passed, 22 total
```

**Deviation from the predicted output, noted honestly.** The wave file predicts case (a) failing on
`expect(runner.execute).not.toHaveBeenCalled()` with `Expected 0 / Received 1`. This suite asserts the
gate's own return value one line earlier, so it fails there first; the `execute` assertion is
unreachable in the failing run. Same defect, same case, one assertion sooner.

**The discriminating pair held**: the three cargo cases and the strace cases stayed green (17 passed).
A one-sided assertion would have reddened everything or nothing.

### Defeat 2 — make the gate fail OPEN

Mutation: the `catch` returns `false` instead of `true`.

```
  × (d) willRunFullyIsolated() throws → skip                              Expected: true / Received: false
  × (d) willRunWithoutAnyContainment() throws → skip                      Expected: true / Received: false

Tests:       2 failed, 20 passed, 22 total
```

A fail-closed gate that opens on an exception is not a gate. Only the two fail-closed cases moved.

### Defeat 3 — un-gate the npm import-trigger detonation (the pre-W7C state of the defect found below)

Mutation: `if (job.ecosystem === 'npm' && !detonationSkippedUncontained)` reverted to
`if (job.ecosystem === 'npm')`.

```
  × detonation site 1 is dominated by the containment gate                Expected: true / Received: false

Tests:       1 failed, 21 passed, 22 total
```

### Defeat 4 — the inverted pin is load-bearing

Mutation: defeat 1 re-applied, running only `job-processor.cargo-detonation.test.ts -t "pre-exec gate"`.

```
  √ (a) a NOT-fully-isolated runner → cargo detonation is skipped and execute is NEVER called
  √ (b) a FULLY-isolated runner → cargo detonation proceeds (execute is called)
  × non-cargo ecosystems ARE gated by this pre-exec check (npm proceeds in strace mode, but only after being asked)
      Expected number of calls: >= 1
      Received number of calls:    0
  √ FAIL CLOSED: if the runner capability query throws → skip cargo detonation

Tests:       1 failed, 58 skipped, 3 passed, 62 total
```

The inverted assertion is the one that moves; the three cargo assertions beside it do not. The pin is
**inverted and still present** — 0 assertions deleted.

## 3. Full suite — no regression

| | Baseline (before W7C Task 2) | After |
|---|---|---|
| Test suites | 14 failed, 76 passed, **90** total | 14 failed, 77 passed, **91** total |
| Tests | **0 failed**, 9 skipped, **1064 passed**, 1073 total | **8 failed**, 9 skipped, **1140 passed**, 1157 total |

`node node_modules/typescript/bin/tsc --noEmit` → **exit 0**, no output.

Reading the difference honestly:

- The baseline's 14 suite failures were all `Cannot find module '@iarna/toml' from 'src/job-processor.ts'`.
  That package is declared in `package.json` but absent from the junctioned `node_modules`, so 14
  suites could not load at all and contributed **zero** tests. Installing is not possible here (the
  DeVoid shim intercepts every package manager) and was not attempted.
- After the change, `job-processor.cargo-detonation.test.ts` loads and runs 62 tests: **54 pass**,
  and **8 fail loudly** with *"@iarna/toml is not installed in this checkout — this test needs a real
  TOML parse and cannot run here."* Those eight are exactly the accept-side manifest cases; the
  reject-side cases pass because rejection does not depend on a successful parse.
- **Net: 76 more tests execute than before, and zero previously-passing tests fail.** The 8 failures
  are newly *visible*, not newly *broken* — before, they were invisible inside a suite that could not
  load.
- An earlier full run also showed `tests/harness/mcp-provocation.test.ts`,
  `tests/harness/skill-detonation.test.ts` and `tests/sqs-consumer-visibility.test.ts` failing. All
  three **pass in isolation** (8.6 s each, vs 68–74 s under full-suite load) and none recurred on the
  re-run. They are timing flakes under `--runInBand`, not regressions.

## 4. The defect found while implementing, which the wave file does not describe

`this.sandboxRunner.execute(` is called from **three** places in `job-processor.ts`, not one:

| Site | What it detonates | Guard before W7C |
|---|---|---|
| `:1319` install phase | the install/build command | the containment gate |
| `:1448` npm import-trigger | every published entrypoint, via a worker-authored harness | **`job.ecosystem === 'npm'` alone** |
| `:1560` PyPI import-trigger | every importable top-level module | **`job.ecosystem === 'pypi'` alone** |

The install-phase block closes well before the two trigger phases, so they were never inside it.
Following Step 3 literally — generalise `shouldSkipCargoDetonation` and nothing else — would have
skipped the install detonation for an uncontainable npm run and then **executed the package anyway**
through the import-trigger harness, which is precisely where module-body supply-chain malware fires.
P0-18 would have read as closed while remaining open on the highest-risk ecosystem.

All three sites are now behind the gate. The last four cases in the containment suite walk the real
source, compute the enclosing block structure around each detonation call, and require the gate to
dominate it — so a fourth detonation added later cannot be ungated silently. Defeat 3 above shows
that guard going red.

## 5. Exit-criterion greps

```
$ MSYS_NO_PATHCONV=1 git grep -c "willRunFullyIsolated" HEAD -- src/
HEAD:src/job-processor.ts:1
HEAD:src/telemetry/sandbox-runner.ts:2

$ MSYS_NO_PATHCONV=1 git grep -n "ecosystem !== 'cargo'" HEAD -- src/
HEAD:src/job-processor.ts:3479:   * ... `if (ecosystem !== 'cargo') return false`      ← comment, describing the removal
HEAD:src/job-processor.ts:3538:   * P0-18 (W7C) deliberately did NOT generalise the ...  ← comment, recording the decision
HEAD:src/job-processor.ts:3554:    if (ecosystem !== 'cargo') return false;             ← cargoBuildDidNotCover, post-exec belt
HEAD:src/job-processor.ts:4622:    if (ecosystem !== 'cargo' && ecosystem !== 'go') {   ← toolchain coverage fold, the exempted predicate
```

**`0` executable `ecosystem !== 'cargo'` guards remain in the containment gate.** Two departures from
the criterion's literal wording, both deliberate and both stated rather than hidden:

1. The criterion expects `willRunFullyIsolated` to have **≥2** production callers. It has **one call
   site**, but that site is now reached for **every** ecosystem rather than cargo only — which is the
   substance the criterion is protecting. Duplicating the call to satisfy a grep count would make the
   number true and the code worse.
2. `cargoBuildDidNotCover` at `:3554` keeps its guard. The criterion exempts only the toolchain fold
   at `:4622`. Removing this one would impose containment option (ii) without the decision or the
   measurement — see `STEP5_DECISION.md`, "What was NOT done, deliberately."
