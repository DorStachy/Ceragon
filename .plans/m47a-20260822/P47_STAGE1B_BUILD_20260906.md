# P47 stage 1b — building the buildable remainder, 2026-09-06

**Owner's ask, after stage 1 shipped:** "build what's left to build, use Opus agents if needed."
This ledger records what was built, how it was verified, the decisions made along the way, and
what remains that no commit can close. Nothing here is merged to any `main` or deployed; every
branch is named below. The re-measure ledger `P47_REMEASURE_20260905.md` is the baseline this
pass moves from; its "What is still buildable without an owner decision" list is the scope.

## 1. Scope — the buildable remainder, as taken from the ledgers

| Item | Source | Built here |
|---|---|---|
| Wave 3B T5 — five canonical-regression residuals (4 PARTIAL, 1 NOT_READY) | re-measure | yes (A) |
| Wave 3B T10 — three unmigrated incidents | re-measure | yes (A) |
| The permanently-red labeller ratchet masking `wire-lane-tests` | ship ledger debt 1 | split into its own job (A) |
| Wave 8 T11 — `TestSystemCardHasAPerSurfaceRow`; claim tests runnable standalone (debt 5) | re-measure, ship ledger | yes (A + root guard) |
| Wave 8 T12 — the Installers rows of the §16.8/§16.9 matrix | re-measure | yes (A certificate rows, B daemon rows, D scanner row, orchestrator ledger) |
| Wave 8 T3 — 12 of 13 residual sinks (S2 deferred by design) | re-measure | 8 of 10 moved (B); S2, S10, S13 recorded with reasons |
| Wave 4A T2 — browser half (self-vocabulary in the twin's prompt scanner) | re-measure, ship ledger debt 3 | yes (C) + Frontend re-vendor |
| Four upstream browser-extension manifest tests red on main | ship ledger debt 4 | yes (C) |
| Wave 7B T7 — 6 open signing bypasses | re-measure | 5 closed (D), shipped ON (orchestrator); KMS withdrawn |
| Scanner quality gate: Tier-A strata unmeasurable (CWE-798, CWE-506) | ship ledger debt 2 | CWE-798 MEASURED (D + orchestrator); CWE-506 Backend-owned, named |
| Shared-contracts mirror guard that never ran | mirror-divergence note | yes (E) |
| Wave −1 T4 — citation resolver and repair | re-measure | yes (E) |
| Wave 0 T5 — `.codefence.yml` on our repositories | re-measure | yes (orchestrator, 7 PRs) |

## 2. Branches (all local until the gate mirror finished; pushed only as branches, never to main)

| Repository | Branch | Tip | What it carries |
|---|---|---|---|
| Installers | `p47/stage1b-installers` | 8fbec015 | merge of A (`p47/stage1b-neutral-cert-matrix` 1d86388c, 10 commits), C (`p47/stage1b-browser-selfvocab` 6f1d3cee, 3), B (`p47/stage1b-sinks` d065719e, 13) + the matrix ledger test |
| Static-Worker | `p47/stage1b-static-canonical` | fe5610a0 | owning test for the zero-width plugin escape (A) |
| Frontend | `p47/stage1b-revendor-engine` | 1af68883 | promptrisk.js re-vendored at Installers dffde7af; pairs with C's consumer lock |
| GithubApp-Bot-Scanner-Worker | `p47/stage1b-scanner-signing-quality` | 471af3f | D's 7 commits + transport identity shipped ON + the quality-gate staging fix |
| Backend | `p47/stage1b-backend` | 881554c6 | E's mirror guard (43d540ad) + transport-identity stamp (8eb858d7) + ledger notes |
| Ceragon-Intelligence | `p47/stage1b-contracts-mirror` | e4c4540 | the seven M3 contract files (+5 imports) mirrored into the vendored copy (E) |
| workspace root | `p47/stage1b-root` | c8adadc | E's canonical-copy sync, workspace-root helper, citation resolver + plan repair; the vendored-prose guard; `pr-checks:neutraleval-ratchets` mirror entry; this ledger |
| all seven repos | `chore/codefence-evidence-standard` | — | `.codefence.yml` `evidenceMode: STANDARD`; PRs Backend #310, Frontend #200, Installers #263, Scanner #45, Static #27, Sandbox #17, Intel #66 |

**Landing coupling (must merge together):** Installers before Frontend (consumer lock ↔ vendored
copy; the workspace `vendored-engine-parity` guard reads drift otherwise); Backend before the
scanner workers (the workers reject an unstamped producer once signed contracts are required);
Installers with the root branch (`ci/gates.json` names `pr-checks:neutraleval-ratchets`, which
`drift.mjs` reports missing until the job is on origin/main); Backend with the root branch (the
mirror guard runs against the live root copy once a workspace is present).

## 3. Decisions made in this pass, and why

1. **Transport identity ships ON, with no flag.** Packet D closed replay, expiry, wrong-queue and
   wrong-producer in the verifier but bound two of them only to bodies that declared the claim and
   put the absent-producer rejection behind `CODEFENCE_REQUIRE_PRODUCER_IDENTITY` (default off),
   because the Backend stamped nothing and rejecting absence would have rejected 100 % of dispatch.
   A dormant check behind a flag is not a control (the workspace's own rule). So the Backend now
   stamps `producer`, `queueUrl`, `nonce`, `issuedAt`, `expiresAt` into every signed body at all three
   producers (webhook dispatch, local dispatch, results ingestion), the scanner→processor hand-off
   stamps its own, the worker's allowlists default in code to exactly those identities (environment
   can only add), and when signed contracts are required an absent producer or destination is
   rejected. The soft-launch mode that tolerates absence is the same mode that tolerates an
   unsigned message. FIFO dedup on the results path is computed over the caller's payload before
   the stamp so identical uploads still collapse. Deploy order: Backend before the workers; the
   workers are at 0/0, so no in-flight window exists today.
2. **The corpus is staged out of `fixtures/` before gitleaks runs.** The production gitleaks config
   allowlists `fixtures?/` (right for customer code), so scanned in place no corpus case can ever
   fire and CWE-798 read SUPPRESSED for a reason unrelated to the detector. Measured: production
   config in place 0 of 4 a4 cases fire; the same files at `src/keys/` 3 of 4 (never `repaired`).
   The gate now stages the corpus with `fixtures/` renamed and refuses to stage a case at a path
   the allowlist would skip. gitleaks 8.18 reports absolute paths; they are relativised.
3. **The a4 committed-secret fixtures carry a realistic shape.** The Phase-5.1 `private-key`
   override requires ≥3 lines of 64 base64 characters; a one-line placeholder is exactly what it
   was tuned to ignore. The fixtures now carry four synthetic 64-character lines (the unreachable
   twin keeps the same body as a form placeholder, which the classifier's placeholder branch
   suppresses — the property the twin measures). The two TRUE_POSITIVE rows expect CRITICAL, the
   severity the shipped table serves for a private key; HIGH was written before the leg had run.
4. **Mediation has a `Mode` (B).** `mediationResolve` is not a local lookup: its authority calls
   are capped at 1200 ms each, a third of the 4 s hook budget on the common path. Hot-path sinks
   (S1, S4, S12, S18, S7) bind in `consult` mode — the checkpoint is a refusal channel there and
   nothing at a consult sink can grant; S5 is `deferred`; S8 and S9 are `authoritative` and S9 is
   the one sink where all four states run end to end through a new loopback checkpoint route with
   an unreachable daemon as a hold. S2 stays deferred (a prompt has no stable identifier to bind);
   S10's daemon half is already S5 and its CLI fail-open is a fleet policy decision; S13 admits,
   releases and refuses nothing (no checkpoint exists to route) and was not re-declared to flatter
   the ratio.
5. **A fifth neutral-evaluation lane for non-textual properties (A).** Two incidents were lane
   NOT_EXPRESSIBLE because the registry only expressed text handed to a detector; the new lane's
   cases are graded by a named Go test and publish no rate.
6. **The claim tests read a vendored copy only as a last resort (A + root guard).** Env var →
   sibling workspace → vendored extract, with a log line naming which; the workspace guard
   `ci/lib/vendored-prose.mjs` proves the extracts equal their sources (both matched byte for byte:
   5808 B `b503251bf8b0…`, 3788 B `80935169b49e…`).
7. **Wave 0 T5's denominator is NOT MEASURED.** Which repositories CodeFence scans needs an admin
   console token; the file is inert on an unscanned repository.

## 4. Verification (host, per repository) — see §5 for the Docker mirror

| Tree | Command | Result |
|---|---|---|
| Installers merged 8fbec015 | `go build ./...`; `go vet` on touched packages | clean |
| Installers | `go test ./internal/daemon/... ./internal/proxy/...` | ok (47 s, 3.6 s) |
| Installers | `go test ./internal/neutraleval/... ./internal/certificate/... ./internal/toolrisk/... ./internal/promptrisk/... ./internal/policyeval/...` | ok except `TestEnforcingCasesHaveTwoLabelers` (red by design) and `TestCanonicalRegressionSetIsComplete` when `CERAGON_WORKSPACE_ROOT` points at the LIVE Static checkout (its owning test is on the unmerged Static branch; green without the env var and green against the branch) |
| Installers | `go test ./cmd/devoid -count=1 -timeout 30m` (B) | ok, 524.6 s (the hosted job runs with `-timeout 25m`) |
| Installers | browser-extension `node --test test/*.mjs` on the merged tree | 1311 of 1311 |
| Installers | matrix ledger `TestDefeatMatrixLedgerIsCompleteAndTrue` | 27 of 27 placed: RUN here 18, NOT RUN here 2, elsewhere 5 (verified), withdrawn 1, live-gated 1 |
| Installers | full `go test ./... -count=1 -timeout 40m` on the merged tree, `CERAGON_WORKSPACE_ROOT` at the shadow root | **149 packages ok, 2 not:** `internal/neutraleval` (`TestEnforcingCasesHaveTwoLabelers`, red by design) and `internal/daemon` (`TestEndTrackedAISessions_BoundedFanOutCompletesInTimeBox`, the load-sensitive test the re-measure ledger records as failing under full-suite load on main; ok alone, 1.3 s, on this tree). Log `stage1b-evidence/installers-go-full.log`. |
| Static-Worker fe5610a0 | `npx jest --ci` (KMS client junctioned into the worktree) | 207 of 208 suites, 4188 tests, 1 suite skipped by design |
| Frontend 1af68883 | `npx jest lib/ai-security`; `--findRelatedTests` on the vendored file | 4 suites / 78 tests; 9 suites / 116 tests |
| Frontend ↔ Installers | workspace `vendored-engine-parity.mjs` through a junction shadow | PASS, manifest pins dffde7af |
| Scanner 471af3f | signing + processor suites (262 tests); adversarial 36 of 36; `tsc` both packages | pass; mutation (absent-producer branch removed) shown red |
| Scanner | quality gate, gitleaks 8.18.4 on PATH, no semgrep | CWE-798 PASS (4 evaluated); five strata UNKNOWN (semgrep deferred locally; CWE-506 Backend-owned); exit 2 by design |
| Backend 881554c6 | `scan-dispatch` + `results-ingestion` specs (152); mirror guard with `CERAGON_WORKSPACE_ROOT=C:/cwt/p47b-root` (10, 0 skipped); `ai-policy-halt.defeat` (25); `tsc --noEmit` | pass |
| Ceragon-Intelligence e4c4540 | package `tsc` emit; repo `tsc --noEmit`; `jest packages/shared-contracts` (42) | pass (E) |
| root c8adadc | `plan-citations.mjs` 1099 citations 0/0/0; `claim-contract.mjs` 15 = 15; `vendored-prose.mjs` PASS; `node --test ci/lib/` | pass except `vocab-parity.test.mjs` and `drift.mjs`, both explained below |

**Artefacts of the live checkouts, not defects:** packet E's "vocabulary formatVersion 3 vs 4" and
"vendored engine drift" were measured against the live `Backend/` and `Frontend/` checkouts, which
sit on other sessions' branches; on `origin/main` all three vocabulary copies are at formatVersion 4
and the Frontend vendored copy matches. `drift.mjs` reports `pr-checks:neutraleval-ratchets` missing
until the Installers branch lands (expected) and Sandbox-Worker `pr-checks:checks` unmirrored
(pre-existing; the live checkout's own `drift.mjs` prints it).

## 5. The Docker gate mirror on the merged trees

Run from the junction shadow `C:/cwt/p47b-ciroot` (each repo → its stage-1b worktree; Sandbox and
docs → live), `--merged --jobs 1`, `DEVOIDCI_CPUSET=0-5 DEVOIDCI_MEMORY=6g`. Logs under
`stage1b-evidence/`.

| Repo | Legs | Result |
|---|---|---|
| GithubApp-Bot-Scanner-Worker | 14 | **10 pass, 4 fail — the same four environment reds as the ship pass:** `test#package=github-action` (4 git-dependent tests; the volume has no `.git`; 756 of 761 pass incl. the new gate specs), `security:rule-precision` and `ai-vs-scanner-benchmark` (CRLF regeneration artefact), `quality-precision-gate` (`sudo` absent to install gitleaks). `test#package=scanner-worker` (the signing changes) **passes inside Linux**; all typechecks and audits pass. |
| Backend (measured at 70adfa52; the later 881554c6 is a ledger-note commit whose spec ran on the host) | 16 legs | **12 pass, 2 fail, 2 partial — zero test failures.** The two fails are `build:build_and_test` (1116 of 1117 suites, 18,831 tests) and `full_test#shard=1` (278 of 279, 4,887 tests), each failing only on `build-stamp-deploy-gate.spec.ts`, which builds a Docker image and the mirror mounts no Docker socket — the same shape as the ship pass. The two partials are the cloud-credential fences `security:rate_limit_taskdef` and `security:rds_boundary`, as `gates.json` declares. `shared-contracts-pin`, `migration_chain_from_empty`, `lint`, `typecheck`, both integration legs, `e2e_advisory`, shards 2–4 and `security:audit` pass. |
| Installers 8fbec015 | 15 (the ship pass's 14 plus the new `neutraleval-ratchets`) | **9 pass, 6 fail — every fail placed, none attributable to this pass.** Pass: `hot-path-audit-imports`, `ai-checkpoint-observation`, `hard-deny-stress`, `macos-legacy-identity`, `release-workflow-contract`, `self-update-lane`, `toolrisk-lane`, `uninstall-honesty`, `finding-b-e2e:shim-enforcement`. Fail: (1) `neutraleval-ratchets` — `TestEnforcingCasesHaveTwoLabelers`, 0 of 404, **expected red** (the job's own title says so) and the proof that the split worked, because (2) `wire-lane-tests` now runs `internal/neutraleval` **ok** and fails later, in the "Core config · canary · runtime integrity" step, on two `internal/aicanary` tests in a package this pass did not touch (`git diff origin/main -- internal/aicanary` is empty; `go test ./internal/aicanary/` ok on the host): `TestRun_NonZeroExitIsAnObservationNotAnError` refuses the container's binary as `canary-host-executable-untrusted` (the same mirror artefact as the vendor lane), and `TestSideEffectWitness_RefusesRealMachineRoots/the naive t.TempDir() fixture` assumes TempDir sits under the user's home — true on Windows, false on Linux where it is `/tmp`, which the guard is right to admit. The ship-pass mirror never reached that step (its log has no line for either test; the leg stopped at the ratchet), so these are newly observed, not newly caused — recorded in §6. (3) `scanner-parity` — browser suite 1311 of 1311 and all Go packages ok; only step 5, the promotion-gate defeat suite (`not ok 24 — REAL: the gate reads the nightly artifacts…`, 23 of 24), which packet C proved fails identically at 0970b240 (main). (4) `codex-vendor-lane` — `canary-host-executable-untrusted`, mirror. (5) `codex-hook-lane-live-proof` — no live observation for 0.134.0 / 0.146.0-alpha.3.1, owner-gated by design. (6) `holdout-score:score` — the runner cannot resolve `steps.engine.outputs.version`, NOT MEASURED by the mirror. Log `stage1b-evidence/mirror-installers.log`. |
| Frontend 1af68883 | 5 | **4 pass, 1 not measured.** Typecheck 53 s, Tests (jest) 168 s (the leg that wedged the daemon in the ship pass, now under the 6-core cap), no customer-visible em dashes, `security:audit` pass. `Detector vocabulary parity (Installers -> Frontend)` refuses without a GitHub token (`NOT CHECKED … Refusing to pass without comparing anything`), as in the ship pass; the workspace `vocab-parity.mjs` across the three stage-1b branches is the standing evidence: **PASS, 40 classes, same tiers, same wire key path.** |
| Static-Worker | 1 | not mirrorable from a worktree (the runner copies a `.git` pointer file); host result above stands |
| Ceragon-Intelligence e4c4540 | 7 | **4 pass, 3 fail — the same three as the ship pass.** `validate` runs the whole suite inside Linux (**112 suites, 1737 tests, all pass**) and then fails at "Build container image" (`docker: command not found` in the container); `compose-config` needs `sudo`; `cross-reference-aws-baseline` compares compose image SHAs with the AWS snapshot and is unrelated to the contract files. `actionlint`, `env-template-lint`, `iam-policy-lint`, `shellcheck` pass. |

## 6. What this pass does NOT close

- **Owner or production:** 0A T5/T6 live confirmation; 0 T1/T4/T7 (production mutations; T6's
  policy rows are a production API write); 4A T5/T6 (private-key posture); −1 T5 (holdout trigger
  cost); 3B T7 data programme (E1); 3B T11 second labeller (E4) — the ratchet stays red in its own
  job; 7A T5 fork-PR run; 7B T2 benchmark (LLM keys, Joern); 7B T6 (Codex artefacts withdrawn);
  8 T5/T9 live canaries; 8 T10 key custody; the KMS row of the signing lane and of the matrix.
- **Design-gated:** 3B T2 `RunnerIdentity.Valid()` (waits on the D-3B-6 spine); S2 prompt egress
  (needs a content-free prompt identity); S10's CLI fail-open (fleet policy); S13 (no checkpoint to
  route); the inspection-completeness threshold of the coverage-regression row (a number nobody has
  decided); `TestReceiptAxesDisagreementIsNotAPass` (no observed-effect axis in any tree).
- **Outside the 147 headings, found by the stage-1 E2E and still open:** no response-side wire
  inspection; warn tier degrading to monitor for automation; R1–R4 Codex constants not
  admin-settable; the 30 s Codex warn stall; removed MCP entries never marked; W6 T9 has no UI;
  the certificate panel has no data source (Wave 5 T10 is component + harness only); tamper is
  undetectable in schema v2; PASS shown over NOT MEASURED; the sticky spool cause;
  `EVIDENCE_WAL_QUARANTINED` absent from the safeMetadata allowlist; MCP token-env grade.
- **Pre-existing, untouched:** Sandbox `pr-checks:checks` unmirrored; Installers `scanner-parity`
  step 5 (promotion-gate defeat suite, 23 of 24) red on main; `internal/aicanary`
  `TestSideEffectWitness_RefusesRealMachineRoots/the naive t.TempDir() fixture` fails on any Linux
  host because it expects `t.TempDir()` under the user's home (a Windows fact) — the fix is to build
  that fixture under `$HOME` explicitly on POSIX, or to make the case Windows-only; the hosted
  `wire-lane-tests` job is dispatch-only, which is why nobody had seen it; `TestEndTrackedAISessions…` load
  flake; multi-instance replay (per-process store; a shared store is a deployment change);
  `DV-AR-031` never fires on the zero-width fixture (declared in its label, now asserted as
  measured, not corrected); the plan's `plan:NNNN` references that are really v1 anchors.
- **The stage-2 gate** (prompt-evidence keys and the receipt chain on one real endpoint against
  `backend:337`) is unchanged by this pass and still owed before any ring promotion.
