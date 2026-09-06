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

---

## CORRECTION TO THIS DOCUMENT, same day

**The row above reading `T5–T13 | NOT STARTED | unchanged — genuinely not started` is WRONG,
and it is wrong by exactly the mechanism this document was written to complain about.** I verified
Tasks 1–4 against the tree in detail, then asserted the remaining nine without checking any of them.
That is a claim about a tree made without reading the tree.

Measured properly, on `p47/w4c` (pushed) plus one Backend branch:

| Task | Corrected verdict | Evidence |
|---|---|---|
| T5 Suite 1, canonical regression | **BUILT** | `p47/w3b-t5` → `2e819659` *"one index, eleven members, and a gate that is red for the right reasons"*; `internal/neutraleval/canonical_regression_test.go:263` |
| T6 Suite 2, transform inventory as a gate | **BUILT** | `p47/w3b-t6` → `d1bd7b5d` *"the C5 unknown-transform inventory fails on an undeclared NOT-CAUGHT, with three owned residuals"* |
| T7 Suite 3, benign-replay denominator | **BUILT (engineering half)** | `p47/w3b-t7` → `5ec4b1f5` *"a bound cannot be published below its own denominator, and the denominator is 123/133"*. The data-collection programme itself stays owner-blocked (E1) — that was always the blocked half. |
| T8 Suite 4, e2e environments | **BUILT** | `internal/neutraleval/e2e_scenarios.go` + `_test.go`; `parity-vectors/neutral/e2e-scenario-index.json`; `DesignEffect` / `EffectiveScenarioSize` |
| T9 Suite 5, private adaptive holdout | **BUILT** | `AdaptiveArm` on every emitted `evaluation`; `ADAPTIVE_EVALUATION_CHARTER.md`; `adaptiveAsr` in the report envelope |
| T10 Suite 6, incident suite | **BUILT** | `p47/w3b-t10` → `58a6eba4` *"the incident index exists, as a projection, and N is 26 with 3 unmigrated"*; `incident_migration_test.go:98` |
| T11 Labeler and adjudicator governance | **BUILT** | `internal/neutraleval/labeler_governance.go` + two test files; `parity-vectors/neutral/labeler-governance-seed.json`; `labelerReliability` on the report |
| T12 Reconcile the two vocabularies | **BUILT · UNMERGED** | Backend `p47/w3b-backend` → `316d22f4`, +913 lines: `TRIAGE_GOVERNANCE_MAPPING.md`, `triage-governance-mapping.v1.json`, `triage-vocabulary-corpus-governance.spec.ts`. **Not an ancestor of any pushed Backend branch** — this one really is stranded. |
| T13 Move the generators into the repository | **BUILT** | `p47/w3b-t13` → `2b96e2d7` *"the two corpus generators can now prove the committed corpus is theirs"* |

**So Wave 3B is 12 of 13 built, not 4 of 13.** Task 2 is the one deliberate deferral, recorded in
`contract.go`.

## And the three "inherited declared-red gates" are Wave 3B's own suites

Every closure record in this programme, mine included, has described `internal/neutraleval`'s three
failing tests as inherited noise to be routed around. They are not noise. They are, exactly:

| Red gate | Is | Red because |
|---|---|---|
| `TestCanonicalRegressionSetIsComplete` | **Suite 1** (T5) | five canonical residuals are still open |
| `TestZeroUnmigratedIncidents` | **Suite 6** (T10) | 3 of 26 incidents are unmigrated |
| `TestEnforcingCasesHaveTwoLabelers` | **labeler governance** (T11) | enforcing cases lack a second labeler |

Each is a suite reporting that the *evidence* it governs is incomplete — which is the instrument
working. "Red on arrival, route around it" was the wrong frame: **these three reds are the
programme's remaining evidence debt, itemised.** Closing them is not maintenance, it is the work.
