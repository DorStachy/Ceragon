# W4 T9 — a diverging higher-precedence Codex requirement removes green

Branch `p9/w4-t9-codex-diverging-requirement`, off Installers `origin/main` `3a3cf09e`.
Written by the task agent; **left UNTRACKED on purpose** — this file lives in the workspace-root
repo, not in the Installers worktree the change was made in, and the parent session owns commits
there.

## Lead finding: what is, and is not, observable

`RequirementsPrecedence` is frozen `CLOUD_REQUIREMENTS` > `LEGACY_MANAGED_CONFIG` >
`MACHINE_REQUIREMENTS`. Only ONE of the two tiers above DeVoid's baseline can be seen from an
endpoint:

| tier | observable? | measured |
|---|---|---|
| `CLOUD_REQUIREMENTS` | **No, permanently** | `Provider.CloudRequirements` is assigned nowhere in the repository, so `cloudSource` returns `UNOBSERVED` on every endpoint. Confirms W4 T8 (#239). |
| `LEGACY_MANAGED_CONFIG` | **Yes** | `Provider.legacySources` reads and parses every `$CODEX_HOME/managed_config.toml`, and `legacyRequirementFields` compares five pinned keys against DeVoid's own `want*` constants. |

So the claim this task can support is the narrow one: **not** "a higher tier wins" — no endpoint can
establish that — but "a source that OUTRANKS the DeVoid baseline was READ on this box and it declares
something else". That is enough to remove green, and it is all the evidence there is.

**On a production endpoint the composed verdict is `UNVERIFIABLE` before this task, not `SURVIVED`**,
because the cloud tier is unobserved. So what this change actually moves, in the field, is
`UNVERIFIABLE` (exit 0, "no DeVoid obligation was observed to fail") → `FAILED` (exit 1, named cause).
That is the real behaviour change and the real blast radius.

## The three states, kept apart

Pinned by `TestVerdictSeparatesDivergingAbsentAndUnobservableLegacySources`
(`internal/codexmanaged/machine_effective_test.go`):

| legacy source state | verdict | `FailureReason()` | `LimitationReason()` |
|---|---|---|---|
| PRESENT, value ≠ pin | `FAILED` | `legacy-requirement-diverged` | — |
| PRESENT, value = pin | `SURVIVED` | — | — |
| ABSENT (proven not to exist) | `SURVIVED` | — | — |
| UNOBSERVED (no roots supplied) | `UNVERIFIABLE` | — | `requirements-source-unobserved` |
| UNREADABLE (exists, unparseable) | `FAILED` | `requirements-source-unreadable` | — |

The last row **contradicts the task spec's landmine** ("an unreadable source is `UNVERIFIABLE`, never
`FAILED`"). It was decided earlier and deliberately, by
`TestUnreadableSourceIsAFaultNotALimitation` + `statedLimitationReason`: a file that exists on this
box and cannot be read is an observation the operator can repair, and calling it "nothing can be done
here" launders a locked or corrupt baseline into a clean exit code. That decision is untouched. What
IS honoured is the landmine's substance — the new clause records and fails on nothing that was not
read, pinned by `TestVerdictIsUnaffectedByALegacyFieldInAnUnreadableSource`.

## What the operator sees (captured from the rendering seam)

Matching field — unchanged, still an advisory, almost every endpoint prints this because DeVoid's own
`WriteManagedConfig` writes all five pinned keys:

```
  [i] legacy requirement field approval_policy in user source ff2c7e75a068406a — matches the DeVoid pin
```

Diverging field:

```
  [!] legacy requirement field tools.web_search DIVERGES from the DeVoid pin: observed true, pinned false
      file: C:\Users\Owner\...\.codex\managed_config.toml (user source ff2c7e75a068406a)
      That file is read at LEGACY_MANAGED_CONFIG, which OUTRANKS the DeVoid machine
      baseline, so the pinned value does not govern this endpoint.
      Remediation: set tools.web_search back to false in that file, or remove the key.
```

Verdict and exit code, same run:

```
verdict=FAILED  failureReason=legacy-requirement-diverged  marker=[!]  OK=false
headline=Obligations did not all survive composition (legacy-requirement-diverged).
```

Doctor row, same result:

```
a per-user managed config overrides a DeVoid requirement pin at higher precedence
(legacy-requirement-diverged): tools.web_search. Detail: devoid ai codex-machine status
```

Before this change the doctor row read `obligations did not all survive composition.` — false, since
a divergence fails no obligation, and it sent the reader hunting for a failing obligation that does
not exist.

## Defeat test

Mutation: delete the `DivergingLegacyRequirementFields()` clause from `Verdict()`.

```
$ go test ./internal/codexmanaged -run TestVerdictFailsOnADivergingLegacyRequirementField -count=1
--- FAIL: TestVerdictFailsOnADivergingLegacyRequirementField (0.00s)
    machine_effective_test.go:119: Verdict() = SURVIVED, want FAILED (tools.web_search diverges in LEGACY_MANAGED_CONFIG)
FAIL    github.com/codefense/cli-wrapper/internal/codexmanaged   1.249s
exit 1
```

Four further cases went red under the same mutation (the three-state table's diverging row, the
exit-code chain test, and the doctor-row test's loud precondition). `git checkout --` restored GREEN.

## NOT EXERCISED

- **The on-rig transcript the task's EXIT names.** `devoid ai hooks-status codex` reads
  `%ProgramData%\OpenAI\Codex` through the real provider and needs a real `$CODEX_HOME`. Writes under
  `%ProgramData%` are prohibited for this agent, and tests in this tree have destroyed the owner's
  live Codex governance baseline three times. The chain from composed result → `OK=false` → exit 1 is
  proven hermetically instead (`TestADivergingLegacyRequirementExitsNonZeroAndNamesItself`).
- **"The endpoint's Codex coverage row leaves full-loop on the next heartbeat."** Needs an enrolled
  endpoint and a Backend read. No wire key changed; `EffectiveClean` was already false fleet-wide.
- **`TestVerdictSurvivesAMatchingFieldWrittenWithWindowsPathSeparators` runs on Windows only** and
  skips loudly elsewhere: `normalizeHashPath` folds separators through `filepath.ToSlash`, which is a
  no-op off Windows, while `isAbsolutePath` accepts both dialects. That asymmetry is a real latent
  inconsistency in `machine_projection.go` and was NOT fixed — it feeds `OwnedFieldsHash` and
  changing it would move projection identity on every endpoint.
