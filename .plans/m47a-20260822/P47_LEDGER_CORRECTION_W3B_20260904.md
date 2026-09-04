# Remaining-work ledger — Wave 3B correction, 2026-09-04

**Supersedes the Wave 3B section of `P47_REMAINING_WORK_20260902.md`.** That ledger calls Task 4
*"NOT STARTED"* and *"the highest-leverage remaining task in the programme"*. Measured on
`p47/fix-system-exfil` today, Task 4 is built and its exit criteria are met. Three of the other four
rows in that section are wrong in the same direction.

This is the standing rule (O-1) demonstrating itself again: **a ledger is a set of claims about a
tree.** The 09-02 pass was accurate when it was written; Wave 4C then built much of Wave 3B while
working on something else, and nothing re-read the ledger afterwards.

## Measured, task by task

| Task | 09-02 ledger | Measured 2026-09-04 | Evidence |
|---|---|---|---|
| T1 engine version mandatory | BUILT · UNMERGED | **DONE** | `main.go:28` defaults `--engine-version` to `""` and requires it; `m4.7` survives only as `retiredEngineVersion`, a value the runner refuses. |
| T2 system-under-test tuple | NOT STARTED | **DELIVERED, one part deliberately deferred** | The report's `system` object carries 11 axes: runnerId, engineId, engineVersion, contractVersion, artifactDigest, rulesetDigest, normalizerVersion, parserVersion, environmentDigest, environmentAxes, policyDigest. `RunnerIdentity.Valid()` is deliberately NOT widened, with the reason measured and recorded in `contract.go`: three production callers persist five-field identities, and widening would refuse every lane-shadow row the daemon has already written. It moves when the D-3B-6 spine change lands. |
| T3 emit the evaluation report | NOT STARTED | **DONE as of this commit** | `evaluation` carried suite, suiteId, registry, adaptiveArm, policyProfile, agentSurface. The three fields the wave's own §5.3 table lists as *"ABSENT from every emitted artifact"* — `clusteringUnit`, `nEffective`, `rho` — are now emitted. |
| T4 suite registry, six suites | **NOT STARTED**, "highest-leverage remaining" | **BUILT, exit criteria met** | See below. |
| T5–T13 | NOT STARTED | **unchanged — genuinely not started** | Suites 1–6 themselves, labeler governance, vocabulary reconciliation, generator relocation. |

## Task 4 against its own exit criteria

> **Exit:** `suite-registry.json` exists, covers 100% of the corpora enumerated by the test, assigns
> every one of the 55 catalog classes to Tier A or Tier B, and Tier A membership is <= 6.

| Criterion | Measured |
|---|---|
| registry exists | `parity-vectors/neutral/suite-registry.json`, 6 suites, 14 corpora |
| covers 100% of enumerated corpora | `TestEverySuiteCorpusDeclaresItsSuite` enumerates and passes |
| all 55 catalog classes assigned | `countA` 4 + `countB` 51 = 55, and `TestEveryCatalogClassIsAssignedAnEnforcingStratum` recomputes the assignment from the pinned contract-spine bytes rather than reading the file |
| Tier A <= 6 | `countA` = 4, `maxStratumAClasses` = 6 |
| `claimSupported` derived, not typed | `TestClaimSupportedIsDerivedNotTyped` |
| both named defeats | present, plus eight further tests in `suite_registry_test.go` |

**One declared deviation, and it is recorded in the file rather than hidden.** The wave describes
Tier A as the strata that can hard-block **or redact**. The implementation derives Tier A from
hard-stop eligibility alone, and the registry states that twenty Tier-B classes recommend REDACT by
default — honouring the redact half would put K at 24 and break the K <= 6 cap the two-tier structure
exists to hold. That is a real open question about the *wave's* definition, not a gap in the build.

## What this changes about "what is left"

The programme's own headline number does not move much — Wave 3B is 4 of 13 tasks rather than 1 of 13
— but the ROUTING changes, and that was the point of the row:

- **Task 4 was named the gate on Waves 4A / 4B / 4C / 7B exit numbers (O-13).** It is not a gate any
  more. Those waves can quote exit numbers as soon as their own evidence is run.
- **The highest-leverage remaining item is no longer Task 4.** On this measurement it is Task 7 —
  Suite 3, the benign-replay denominator — and that one is explicitly *"a DATA-COLLECTION PROGRAM,
  not an engineering task"*, blocked on an owner decision (E1). The next largest item that IS
  engineering is Task 11, labeler governance, which is blocked at exit by E4.

**Do not read this as "more is done than we thought" in general.** It is one wave, re-measured
because a file turned up that the ledger said did not exist. Every other wave's rows in the 09-02
ledger remain unverified against today's tree, and the same drift is likely wherever Wave 4C touched
something outside its own packet.
