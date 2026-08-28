# Wave 1 - Decide locally, and freeze the socket the brain plugs into

**Scorecard rows this moves:** Reliability of reaching the decision engine 3.0 -> 9.7; Ability to plug in a detection brain 8.0 -> 9.6
**Depends on:** nothing for Tasks 1-11. Task 12 depends on Wave 8 Task 5 being merged **and deployed** first.
**Phase:** 0 (Tasks 1-4), 1 (Tasks 5-11), 5 (Task 12)

All paths are stated with their component name; this is a workspace, not a monorepo.
Everything below was read at `Installers` `origin/main` = `5b12952307db9903fa166d5d9ce1a0c058e0ad77` and
`Backend` `origin/main` = `0cf9021e944b72ef2a3024e8687f4114db1f2468`.
The working checkouts here are ~1010 commits behind those, so **read the code with
`git show origin/main:<path>` or from a fresh worktree, never from the checked-out tree**. Every line
number below is at those two commits.

---

## How an agent executes this wave

Read this before your first command. You are seeing one task, not the whole plan; these rules are the
part of the context the task text assumes.

**Work in a worktree, never in the checkout.**

```bash
git -C C:/Users/Owner/Documents/Ceragon/Installers fetch origin
git -C C:/Users/Owner/Documents/Ceragon/Installers worktree add C:/cwt/w1-t<N> -b w1/t<N> origin/main
cd C:/cwt/w1-t<N>
```

The workspace checkouts have uncommitted work belonging to other sessions. Do not build in them.

**NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared repo-wide across every
worktree, so a `pop` in your worktree steals a concurrent session's uncommitted work. This has happened
twice in one day here. If you need a clean tree, make another worktree.

**Commit each task the moment it is green — never batch.** A crash and three API outages hit one
campaign on this codebase; only committed work survived. Commit with **explicit paths**:

```bash
git add internal/localsnapshot/localsnapshot.go internal/localsnapshot/state.go   # explicit, always
```

**Never `git add -A`.** These trees carry scratch files, patch files and other sessions' artefacts;
`-A` sweeps them into your commit.

**Every citation in your task is a claim about `origin/main`, not about your disk.** Verify with
`git show origin/main:<path>` before you rely on a line number. Each task's PRECONDITIONS block gives
the exact commands.

**A green test you cannot make RED has not run.** Five inert-test shapes have shipped green on this
codebase while defending nothing. Check your test against all five before you call it done:

1. **Source-text assertions** (`readFileSync` + `toContain`). Satisfiable by pasting the asserted code
   inside a comment.
2. **Hand-built struct literals compared to hand-built struct literals.** Cannot notice the real
   deliverable was deleted. One such test passed identically in the RED and GREEN runs.
3. **Defending ONE branch of a multi-branch route.** A fix was fully tested on the Claude branch while
   the Codex lane — the lane the defect lived in — stayed dead. One route turned out to have three
   branches (runs / suppressed / unknown) and the third was the broken one. Check Codex *and* Claude,
   install *and* uninstall, stored row *and* rendered console.
4. **Exercising only KNOWN members of a closed set.** Cannot distinguish a fail-safe allowlist from a
   fail-open denylist. Feed it something genuinely unknown and see which way it fails.
5. **A test whose PRECONDITION silently skips the assertion.** A signing-key oracle skipped every file
   before the search ran, and sabotaging the writer still passed. **If a test has a precondition, assert
   the precondition loudly.**

Two more from the same campaign, both live in this wave:

- **An HTTP 2xx proves nothing on agent routes.** `AgentIngestValidationPipe` sets
  `forbidNonWhitelisted: false` for agent DTOs (`Backend/src/common/pipes/agent-ingest-validation.pipe.ts:20-21`),
  so an undeclared key is dropped with no 400 and no log. Verify the **stored row** and the **rendered
  projection** separately.
- **A mocked query builder cannot catch a Postgres type error.** Where the claim is about what the
  database did, prove it against live Postgres.

**Read-only outside your task's Files list.** If the fix appears to need a file the task does not name,
STOP AND REPORT rather than widening scope.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## What exists today

### A. The measured failure, and the exact three lines that produce it

The 6-in-10 private-key leak is not a missing feature. It is three collaborating lines that are each
individually correct:

1. `Installers/internal/airuntime/runner.go:52` - `const HookDecisionBudget = 4 * time.Second`, the
   wall-clock bound on the daemon round trip.
2. `Installers/internal/airuntime/runner.go:926-940` - on expiry (`if verdict == budgetExpiredUndecided`
   at `:926`) the runner calls
   `failGating(adapter, adapterID, event, ReasonDecisionBudgetExpired)` at `:940`.
3. `Installers/cmd/devoid/ai_failure_resolver.go:93-96` -
   `governanceFailureResolver.ResolveHookFailure` returns
   `FailureResolution{FailClosed: false, ReasonSuffix: "daemon-unreachable-proceed"}` for
   `airuntime.HookFailureInterventionUnavailable`.

Step 3 is **correct and must not be reverted**. Its own comment records the 2026-07-31 incident:
failing that branch closed denied every tool call on a stock endpoint whose daemon was restarting,
made a workstation unusable, and the operator uninstalled the agent. `internal/aiguard` classifies
any AI-agent context as strict, so the fail-closed branch was always the live one. The same file
also records why `EMPTY_PAYLOAD` and `INDETERMINATE_SHAPE` proceed (`:100`). **This wave does not touch
that resolver's answer for `INTERVENTION_UNAVAILABLE`.** It removes the need to ask it, by answering the
decision locally before the budget can expire.

The decision latch (`Installers/internal/airuntime/decision_latch.go`) already fixed the adjacent
bug - a verdict that exists is never discarded - and its own header states what it does not fix
(`decision_latch.go:42`): "an expiry with an EMPTY latch takes exactly the path it takes today."

The counting is already correct and already wired:
`Installers/internal/airuntime/undecidable.go:64` defines `BucketDaemonUnreachable = "daemonUnreachable"`,
`undecidable.go:127 UndecidableBucketFor` files a budget expiry there by prefix match, and
`Installers/internal/aihookmetrics/spool.go` (`SpoolFileName` at `:41`, `Line` at `:89`) appends one
content-free TSV record per invocation to `~/.devoid/ai-hook-outcomes.tsv`. This is the file that
recorded `{"total":11,"byReason":{"daemon-unreachable-budget-expired":11}}` during the leak window.
**The instrument the 10,000-run gate needs already exists and already works.**

### B. The decision engine is already pure, already local, and already inside the hook binary

`Installers/internal/daemon/ai_handlers.go:2627` is a **package-level function**, not a method:

```go
func scanAndDecideWireWithPolicy(text, provider string, policy *backend.AiPolicy) policyeval.Decision
```

and its body is three pure calls:

```go
res := dlp.ScanAll(text)                                            // internal/dlp/scanall.go
prFindings := promptrisk.Scan(text)                                 // internal/promptrisk
d := policyeval.DecideScan(text, res, prFindings, provider, policy) // internal/policyeval/policyeval.go:313
```

`policyeval.Decide` (`policyeval.go:171`) and `policyeval.DecideScan` (`policyeval.go:313`) take
`*backend.AiPolicy` as a parameter and touch no globals. `internal/dlp` is documented as deliberately
pure (`internal/dlp/private_key.go:16-19`). The non-wire twin,
`ai_handlers.go:2418 (s *Server) scanAndDecideWithPolicy`, is a method **only** because of one call to
the package-global `aiPolicy.currentForDecision(...)` at the end.

The hook process is the **same binary as the daemon**: `devoid ai hook ...` enters
`Installers/cmd/devoid/ai.go:834 runAIHook`, and `cmd/devoid/ai_failure_resolver.go` already imports
`internal/daemon`. So `dlp`, `promptrisk`, `policyeval`, `aipolicycontract`, `failureoracle` and
`aikeystore` are **already linked into the hook process today**. Nothing has to be shipped to the
endpoint to make a local decision possible; the code is already there and is not called.

### C. The immutable signed snapshot already exists on disk, with an atomic pointer swap

`Installers/internal/aikeystore/store.go:35` names `activated-policy-pair.json`.
`store.go:95 ActivatedPolicyPair` carries the signed envelope, the **exact policy body**
(`PolicyBody json.RawMessage`), `KeyID`, `ContractVersion`, `RolloutPhase`, `NotBefore`,
`ValidUntil`, `ActivatedAt`, `TrustedServerTime` and `PreviousBundleDigest`.
`store.go:321 SaveActivatedPolicyPair` writes it through `writeAtomic` with a pre-rename
owner/mode/reparse validation and a directory fsync, and its comment states the exact invariant the
strategy asks for: "A crash exposes either the old valid pair or the new valid pair, never a mixed
generation."

`Installers/internal/aikeystore/location.go` resolves the store to **one machine-first location for
both the SYSTEM writer and the user-identity reader** (`StoreDirName = "aitrust"` at `:67`;
`%ProgramData%\devoid\aitrust` on Windows), precisely because a per-identity path had already split
reader from writer once (`location.go:6-44` records the incident). Two identical stores at both scopes
is refused with `ErrAmbiguousStoreScope` (`location.go:262`, raised at `:243`). On Windows machine scope
the files carry the canonical `winacl.HardenMachineLocalRead` DACL - LocalSystem/Administrators write,
`BUILTIN\Users` **read** (`internal/aikeystore/harden_windows.go:16-40`).

`cmd/devoid/upgrade_activation_floor.go:93-113` already proves the CLI-side read path works
(`aikeystore.ResolveStoreLocation()` then `aikeystore.NewFileStore(loc.Dir, loc.Machine())`).

Verification of a stored pair is `internal/daemon/ai_policy_authority.go:527 verifyStoredPair`, a
package-level function: signature under the pinned root, envelope identity against the record's index
fields, `DigestCanonicalJSON(pair.PolicyBody)` against the signed legacy-projection digest, chain
link, then `json.Unmarshal(pair.PolicyBody, &backend.AiPolicy{})`.

**There is nothing to invent here.** The snapshot, its generation identity, its atomicity and its
verifier all exist. What is absent is a reader in the hook process.

Two boundaries this creates, both of which must be stated rather than papered over:

- **POSIX machine installs cannot read it.** `internal/aikeystore/harden_other.go:11` chmods trust files
  to `0o600` and `NewFileStore` (`store.go:203-207`) creates the directory `0o700`, both owned by the
  root daemon. A user-run hook on a Linux/macOS system install gets a permission error, not a snapshot.
  The strategy's certified boundary (§2.1) is enterprise-managed Windows, so this is scope-consistent,
  but the plan must degrade there, not fail there.
- **The unsigned legacy mirror is useless to the hook.** `internal/daemon/ai_policy_store.go:24,55`
  persists `<configDir>/ai-policy.json` at `0o600` **in the daemon's own profile**, which on a Windows
  SYSTEM install is `C:\Windows\System32\config\systemprofile\.devoid`. The hook cannot read it and
  must not try. Unsigned endpoints fall through to the built-in floor, which §6.3 of the Source of
  Truth establishes is *stricter* than a configured policy, not looser.

### D. The hard-stop set is already frozen, already digest-pinned, and has zero production callers

`Installers/internal/aipolicycontract/detector_catalog_generated.go` is generated from
`embedded/0.7.0/contract-spine.v3.jcs.json` and pinned by
`internal/aipolicycontract/detector-catalog-consumer-pin.v1.json`
(detector catalog `sha256:b252ee02...`, `classCount: 55`, `hardStopEligibleClassCount: 4`,
`runtimeActivatable: false`, `productionWriterEnabled: false`).

Note the spine version split, because it matters to Tasks 2 and 3: `contract.go:22`'s `//go:embed` list
covers `embedded/0.5.0/*` **only**. `embedded/0.7.0/contract-spine.v3.jcs.json` is a repo file read by
the `detectorcataloggen` generator, not an embedded artifact.

`detector_catalog_generated.go:126 DetectorHardStopEligibleClassIDs()` returns exactly four class IDs,
and its docblock already states the rule the inline core needs: "Downstream must refuse to hard-stop
any class absent from this set."

| class | evidence tier | hard-stop rationale | spine default (recommended / restricted) |
|---|---|---|---|
| `private-key` | A | `parsed-private-key` | BLOCK / BLOCK |
| `aws-credential-pair` | A | `validated-access-secret-pair` | BLOCK / BLOCK |
| `gcp-service-account` | A | `parsed-service-account` | BLOCK / BLOCK |
| `azure-connection-string` | A | `parsed-credential-components` | REDACT / BLOCK |

Grep at `origin/main` shows the only non-test, non-generator readers of the catalog are
`internal/policyeval/shadow.go` (lifecycle only) and `cmd/ai-security-neutral/holdout.go`.
`DetectorHardStopEligibleClassIDs` has **no caller at all outside its own package**. This is a
Source-of-Truth §16 shape: built, pinned, inert.

The spine also already carries, per class, the two fields the inline core needs and the generated Go
projection currently drops: `budgets` (`maxInputBytes`, `maxMatches`, `maxDecodeDepth`) and `defaults`
(`recommended` / `restricted` / `unsupported`). Read at `origin/main`, `private-key` is
`65536 / 16 / 1` and `BLOCK / BLOCK / DEGRADED`.

⚠ **`maxDecodeDepth` is legitimately `0` for two of the four hard-stop classes** (`gcp-service-account`
and `azure-connection-string`). Any "budgets are non-zero" assertion must cover `maxInputBytes` and
`maxMatches` only. See Task 3.

A **wider** conclusive-secret set already gates in production:
`internal/dlp/dlp.go:1376 IsGatingSecretClass` (confidence >= 88, 20 classes), consumed at
`internal/daemon/ai_handlers.go:1399` where `secretFloorApplies && hasGatingSecretFinding(...)`
(`hasGatingSecretFinding` at `:2543`) turns a WARN into `noninteractive-secret:block`. The four-class
hard-stop set is a **strict subset** of that twenty. That subset relation is the blast-radius argument
for the whole wave: an inline answer restricted to those four can only ever convert a leak into a block
the daemon would already have produced had it been reached. It can never invent a block the daemon
would not make.

### E. The replay envelope exists, is a real CLI, and is inert by declaration

`Installers/internal/neutraleval` is the canonical, privacy-safe replay envelope Workstream 1
describes. `contract.go` declares `ContractVersion = "0.7.0"` (`:17`), `FormatVersion = 2` (`:16`),
`RuntimeActivatable = false` (`:21`), `V2WriterEligible = false` (`:22`); `digest.go` computes a JCS
semantic digest and a result digest; `runner.go Run(entry, options)` executes the shipping modules
(`dlp`, `promptrisk`, `policyeval`) and refuses input whose bytes do not match
`case.input.artifactDigest`.

The driver is `Installers/cmd/ai-security-neutral` (`--input` / `--corpus` / `--report`), and the
corpora are committed (line counts verified at `origin/main`):

| corpus | cases | sealed? |
|---|---:|---|
| `parity-vectors/neutral/neutral-corpus.all.jsonl` | 158 | no |
| `parity-vectors/neutral/neutral-corpus.shared.jsonl` | 150 | no |
| `parity-vectors/neutral/neutral-corpus.ingress.jsonl` | 28 | no |
| `parity-vectors/neutral/neutral-corpus.holdout.jsonl` | 39 | **yes** |
| `parity-vectors/policyeval-decision.json` (`cases[]`) | 17 | no |

`internal/neutraleval/holdout_seal_test.go:117 TestHoldoutCorpusIsNotReferencedByAnyPerPRTest`
mechanically forbids any `*_test.go` or `*.test.mjs` in the repository from naming
`neutral-corpus.holdout.jsonl`, failing with "the SEALED holdout is referenced by per-PR test file(s)".
**Any new test in this wave must use `shared` / `ingress` / `policyeval-decision`, never the holdout.**
The holdout is scored post-merge and nightly by `.github/workflows/holdout-score.yml`.

What is missing for Workstream 1's exit gate is the **producer**: no live path - not the hook runner,
not the provider gateway - ever emits a `neutraleval.Entry`. The importers of `internal/neutraleval`
at `origin/main` are `cmd/ai-security-holdout-seed/main.go`, `cmd/ai-security-neutral/{main.go,
holdout.go,main_test.go}`, and `internal/dlp/scan_depth_guard_test.go`. So the same normalized event
cannot yet be replayed across the hook runner, the gateway and the offline harness; only the harness
exists.

### F. What is frozen in Workstream 1's contract, and what only looks frozen

**Genuinely frozen, with a machine-checked artifact edge:**

- The portable policy contract 0.5.0: `internal/aipolicycontract/consumer-pin.v1.json` pins artifact
  bytes and sha256, source commit, `runtimeActivatable: true`, `v2WriterEnabled: true`,
  generated from `Backend/packages/shared-contracts/generated/ai-security/0.5.0/`.
  `contract.go:178 SelfCheck()` verifies the embedded bytes against the pin before anything trusts
  activation metadata; `internal/daemon/ai_policy_authority.go:614 BootSignedAuthority` calls it
  first and **contains** the endpoint if it fails.
- The detector catalog 0.7.0 spine: pin above, plus `detectorcataloggen` regeneration.
- The 882-row F01 failure oracle: `internal/failureoracle/failureoracle.go` reads its rows **through**
  `aipolicycontract.FailureOracleCatalogJSON()`; a missing, malformed or duplicate-key catalog yields
  a nil index and `Resolve` denies everything with `failure-oracle:catalog-unavailable`.
  Closed-world, no generic default, no silent allow.
- The signed-bundle parity corpus: `internal/policybundle/parity_corpus.go` loads
  `testdata/policy-bundle-v2` (`ParityRoot()` at `:123-128`), which ships **byte-identically** as
  `Backend/packages/shared-contracts/fixtures/policy-bundle-v2`; **24** accept/reject cases minted from
  the real Backend issuance path (`testdata/policy-bundle-v2/cases/` has 24 files at `origin/main`).
- `internal/aipolicycontract/inertness_test.go` maintains a named importer allowlist that covers
  **test files as well as product files**. Every new file that reads the contract must be added there
  with a written reason - it is the audit surface for "who may make an activation decision".

**Where the runtime-adapter vocabulary actually stands — corrected 2026-08-28.**

An earlier revision of this section claimed the tuples had "no cross-repo edge at all" and that no
pinned artifact carried them. **The second half was wrong and it made Task 2 ten times larger than the
work requires.** The verified position:

- `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts` contains **no union literals**.
  All six tuples are re-exports of `AI_SECURITY_PORTABLE_ORDERED_TUPLES`, which it imports at `:1` from
  `./generated/ai-security-portable.generated`: `:72` COVERAGE_DEPTHS, `:97` ENFORCEMENT_EFFECTS,
  `:111` CERTIFICATION_STATES, `:130` CANONICAL_HOOK_EVENTS, `:164` GOVERNANCE_DISPOSITIONS,
  `:183` MCP_GOVERNANCE_ROWS.
- **All six already ship inside `Installers`, digest-pinned.**
  `internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json` (776,482 bytes) carries them
  at `v1Policy.orderedTuples`: `CANONICAL_HOOK_EVENTS` (11 members), `ENFORCEMENT_EFFECTS` (12),
  `COVERAGE_DEPTHS` (7), `CERTIFICATION_STATES` (5), `GOVERNANCE_DISPOSITIONS` (12),
  `MCP_GOVERNANCE_ROWS` (3) — all in the same order as the Go literals. That artifact is pinned by
  `consumer-pin.v1.json` and verified by `contract.go SelfCheck()` on the `BootSignedAuthority` ->
  `Contain` path.
- **An accessor already reads exactly that.** `aipolicycontract.OrderedTuples()` (`accessors.go:77`)
  and `OrderedTuple(name)` (`accessors.go:90`) return SelfCheck-gated deep copies of
  `v1Policy.orderedTuples`.
- The earlier claim that the *spine v3* does not carry these tuples is **true** and is why the wrong
  conclusion was reached: the right artifact was never opened.
- The earlier claim that `Backend/src/ai-governance/ai-governance-contract.parity.spec.ts` extracts
  these six is **false**. It defines `extractTsUnionFromFile` at `:48` and calls it once, at `:133`,
  for `VerdictType` from a DTO path.

**What is genuinely missing is one assertion, not an artifact.** `internal/airuntime/vocab_parity_test.go`
is `package airuntime` and pins the Go tuples against **hand-typed literals** in the same file, plus the
heartbeat-wire mirror in `internal/controls/attestation.go:369+`. Its own header (`:12-21`) says a path
read "would couple two repos" and then claims "If the TS contract changes, all three fail together" —
that claim is false, because all three Go mirrors can be changed together and stay green. Nothing binds
any of them to the artifact that is already on disk. Task 2 adds that one binding.

Wave 5 states the opposite ("pinned three ways ... == the TypeScript tuples"). **Wave 1 is correct and
Wave 5 is being corrected to match** (reconciliation C1). Wave 5's *conclusion* survives on the facts —
`restrict-capability` genuinely is present in Go (`vocab.go`), on the wire
(`internal/controls/attestation.go:425`) and in the artifact's 12-member `ENFORCEMENT_EFFECTS` — but its
stated reason does not.

### G. Genuinely absent

1. Any reader of the activated policy pair in the hook process.
2. Any local decision in the hook process. Every gating lane in `cmd/devoid/ai_hook_runner.go`
   (`executeUserPromptSubmit:489`, `executePreToolUse:771`, `executePermissionRequest:1547`) posts to
   loopback and has no fallback but the ungoverned proceed (`ungovernedOutcome(why)` at `:551`, `:795`,
   `:1575`).
3. A named terminal for "the local snapshot is absent / stale / unreadable". Today an absent policy is
   simply `nil` and nothing distinguishes it from "not yet fetched".
4. A producer for `neutraleval` on any live path.
5. A stress harness of any kind. `Installers/scripts/` holds `egress-adversarial-matrix-e2e.sh`,
   `egress-managed-git-gate-e2e.sh`, `proxy-redteam-docker-e2e.sh`, `aicontext-e2e/`, `aicontext-gate/` -
   no load driver, no concurrency driver, and no repeat driver for `devoid ai hook`.
6. **One assertion binding the six runtime-adapter tuples to the pinned artifact that already carries
   them** (F above). Not an artifact, not a generator, not a pin - an assertion.
7. Any measurement of what a local decision actually costs. The only throughput number on record is
   `internal/aicontext/scan_secrets_scale.go:77-78` - **`dlp.ScanEx` at 352.8 ms per 256 KiB window =
   0.71 MB/s**, and `dlp.ScanHexAtRest` at 10.82 MB/s. At 0.71 MB/s a 50 ms budget buys roughly
   **35 KB (34 KiB) of prompt**, and the spine's own per-class `maxInputBytes` is 65536. The strategy's
   "p95 <= 50 ms" is therefore **not obviously reachable at full depth on a large prompt**, and Task 1
   exists because no plan should be built on the assumption that it is.
8. A session dimension anywhere on the runtime binding. `Backend/src/ai-governance/runtime-adapter-shape.ts:73-114
   RuntimeBindingShape` carries `principalHash` (user) and nothing session-scoped. See Task 12.

### H. What CI can and cannot run

`Installers/.github/workflows/pr-checks.yml` has `on: workflow_dispatch` plus a **weekly Monday 07:41
cron** (`cron: '41 7 * * 1'`, lines 81-87), and every job except `codex-hook-lane-live-proof` carries
`if: github.event_name != 'schedule'`. The `pull_request` and `push` triggers were deliberately
removed on 2026-08-25 (the $600 July bill) and the file's own comment forbids restoring them. GitHub
Actions is additionally blocked org-wide on the Free-plan spending limit - jobs die in ~4 s with no
runner - so a red GitHub run currently means nothing.

The real gate is the local Docker mirror. `Ceragon/ci/gates.json` -> `repos.Installers.mirrored` lists
**11** mirrored legs on image `go124`:

```
pr-checks:{hot-path-audit-imports, scanner-parity, wire-lane-tests, codex-vendor-lane,
           ai-checkpoint-observation, codex-hook-lane-live-proof, release-workflow-contract,
           self-update-lane, macos-legacy-identity}
holdout-score:score
finding-b-e2e:shim-enforcement
```

`ci/lib/run.mjs` reads the commands **straight out of the workflow YAML**. So the way to make a new
suite run is: add the job to `pr-checks.yml`, then register its key in `ci/gates.json`.
`node ci/lib/drift.mjs` fails if a workflow job exists that `gates.json` neither mirrors nor explains.

**Two package-to-job facts this wave depends on, verified at `origin/main`:**

- `internal/airuntime/...` runs under `pr-checks.yml` job `ai-checkpoint-observation`
  (`go test ./internal/airuntime/... -count=1`, line 543). That job **is** mirrored. A new test in
  `internal/airuntime` therefore runs in `node ci/lib/run.mjs Installers` with no gates.json change.
- **`internal/aipolicycontract/...` runs in NO `pr-checks.yml` job.** It is reached only by
  `go test ./...` in `internal-candidate.yml:87`, and `ci/gates.json` lists `internal-candidate:*` under
  `cannotMirror` ("Builds and publishes a prerelease, including the Windows installer on
  windows-latest"). **So `inertness_test.go` does not run in the local mirror or in pr-checks.** Any task
  that touches the inertness allowlist must run that test **by hand** and paste the result.

---

## Task 1: Measure what a local decision actually costs, before designing around a number

**Files:**
- new `Installers/internal/localdecide/baseline_bench_test.go` (the package is created empty in this
  task; only the benchmark lands here)
- new `Installers/docs/ai-security/LOCAL_DECISION_BASELINE.md` (the recorded artifact)
- reads `Installers/internal/dlp`, `internal/promptrisk`, `internal/policyeval`, `internal/aikeystore`,
  `internal/policybundle`, `internal/aipolicycontract`

**Depends on:** nothing. **Blocks:** Tasks 7 and 9, which must use its measured caps.

### PRECONDITIONS

```bash
# 1. The tree you read must be the tree these citations describe.
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77
# If it differs, run every citation command below and STOP AND REPORT any that fails.

# 2. The throughput figure this task exists to re-measure.
git show origin/main:internal/aicontext/scan_secrets_scale.go | sed -n '77p'
# expect a line containing: dlp.ScanEx          352.8 ms per 256 KiB window  ->  0.71 MB/s

# 3. The fixture the benchmark loads.
git show origin/main:internal/policybundle/testdata/policy-bundle-v2/cases/accept-genesis-enforce.json | head -c 80
# expect: JSON, not "fatal: path ... does not exist"

# 4. The three entry points being timed.
git show origin/main:internal/policyeval/policyeval.go | sed -n '313p'
# expect: func DecideScan(text string, scan dlp.Result, prFindings []promptrisk.Finding, provider string, p *backend.AiPolicy) Decision {
git show origin/main:internal/aipolicycontract/contract.go | sed -n '178p'
# expect: func SelfCheck() error {

# 5. The CI image the second measurement runs on.
node -e "console.log(require('C:/Users/Owner/Documents/Ceragon/ci/gates.json').images ? 'images present' : 'check gates.json shape')"
docker image inspect go124 >/dev/null 2>&1 || echo "go124 image absent - build it via ci/lib/run.mjs first"
```

**If any precondition fails, STOP AND REPORT.** Do not substitute a different fixture, a different
policy body, or a different throughput baseline. This codebase has a documented history of agents
inventing plausible replacements: a benchmark run against a hand-written policy literal instead of the
minted fixture measures nothing about production.

### LANDMINES

- **This task produces the numbers Tasks 7 and 9 are forbidden to invent.** If you cannot run the
  Windows leg, say so in the document and mark the cap `NOT MEASURED ON WINDOWS`. Do **not** publish a
  Linux-only number as if it were the reference-endpoint number; the leak was a Windows scheduling
  failure under load.
- `aipolicycontract.SelfCheck()` is `sync.OnceValue`-cached (`contract.go:139-141,178-184`). A naive
  `for b.N` loop measures the cache, not the sha256 of a 776,482-byte artifact. Measure the **first**
  call in a fresh process, or the benchmark reports ~0 ns and the hook's real per-process cost stays
  invisible.
- The measurement must include process start. `RunRequest.ProcessStart` (`runner.go:538-548`) exists
  because "the exec, the loader, the Go runtime bootstrap and package init ... was measured at ~45 ms
  per checkpoint and was invisible to the instrumentation". A benchmark that starts its clock inside
  Go under-reports the developer's wait by roughly a third.
- **Never weaken a guard to make a number look better.** If p95 <= 50 ms is unreachable, the answer is a
  smaller input cap and a stated `BUDGET_EXCEEDED` degrade, not a shallower scan depth and not a
  loosened detector.

### DO NOT

- Do not change `HookDecisionBudget` (`runner.go:52`) or any timeout. Measuring is not tuning.
- Do not touch `internal/dlp`, `internal/promptrisk` or `internal/policyeval` source. This task is
  read-only on every package it benchmarks.
- Do not create any file in `internal/localdecide` other than `baseline_bench_test.go`. Tasks 6 and 9
  own the rest of that package.
- Do not reference `parity-vectors/neutral/neutral-corpus.holdout.jsonl` in any file you write.

**Blast radius:** none - a benchmark and a document. Nothing on any decision path changes. The risk of
*skipping* it is the real one: the strategy proposes p95 <= 50 ms, the only measured detector
throughput on record is 0.71 MB/s, and a plan that assumes 50 ms is achievable and then discovers it
is not will either miss the gate or quietly widen the input cap to hit a latency number.

**Rollback:** `git rm Installers/internal/localdecide/baseline_bench_test.go
Installers/docs/ai-security/LOCAL_DECISION_BASELINE.md`. No other file is touched, so rollback is
complete by construction.

- [ ] Write `BenchmarkPromptDecisionPure` over prompt sizes 1 KiB / 4 KiB / 16 KiB / 64 KiB / 256 KiB,
      timing `dlp.ScanAll(text)` + `promptrisk.Scan(text)` + `policyeval.DecideScan(...)` with (a) a
      nil policy and (b) a realistic policy body lifted from
      `internal/policybundle/testdata/policy-bundle-v2/cases/accept-genesis-enforce.json`.
- [ ] Write `BenchmarkSnapshotLoadAndVerify`: `aikeystore.FileStore.LoadActivatedPolicyPair` +
      `policybundle.ParseAndValidateSignedBundleV2` + `DigestCanonicalJSON` + unmarshal, against a
      pair built from that same fixture. This is the fixed cost the hook pays once per invocation.
- [ ] Write `BenchmarkContractSelfCheck` for `aipolicycontract.SelfCheck()` **measured cold, one call
      per process** - it sha256s the 776,482-byte embedded artifact and is `sync.OnceValue`-cached, so
      it is a per-process cost the hook pays and the long-lived daemon does not.
- [ ] Run all three on the reference Windows box AND in the `go124` CI image, cold and under a
      concurrent `docker build` (the exact condition that produced the leak). Record p50/p95/p99 per
      size per condition.
- [ ] Write `LOCAL_DECISION_BASELINE.md` with the measured table and a single stated conclusion: the
      **fast-path input cap** in bytes at which p95 <= 50 ms holds on the slowest measured condition,
      and the **full-depth cap** at which p95 <= 150 ms holds. If 50 ms is not reachable at any cap
      above 4 KiB, say so in the document and carry the real number into Task 9's exit criterion
      instead of the strategy's proposal - §10.2 explicitly permits adjusting the latency numbers and
      explicitly forbids adjusting zero-silent-allow.
- [ ] Every condition you could not run gets an explicit `NOT MEASURED (<reason>)` row. An omitted row
      reads as a measured pass.

### DEFEAT TEST

**Mutation:** in `Installers/internal/localdecide/baseline_bench_test.go`, rename
`BenchmarkPromptDecisionPure` to `BenchmarkPromptDecisionPureX` without editing
`LOCAL_DECISION_BASELINE.md`.

**Command:**

```bash
cd <worktree> && go test ./internal/localdecide/ -run TestBaselineDocumentMatchesTheBenchmarkNames -count=1
```

**Must print:**

```
baseline document names a benchmark that does not exist: BenchmarkPromptDecisionPure
```

Revert the rename and re-run; must print `ok`. Paste both runs.

**EXIT:** `Installers/docs/ai-security/LOCAL_DECISION_BASELINE.md` exists and states three numbers:
fast-path cap bytes, full-depth cap bytes, and the measured p95 of snapshot load+verify. Verify with:

```bash
grep -E "^fast-path-cap-bytes: [0-9]+$" docs/ai-security/LOCAL_DECISION_BASELINE.md
grep -E "^full-depth-cap-bytes: [0-9]+$" docs/ai-security/LOCAL_DECISION_BASELINE.md
grep -E "^snapshot-load-verify-p95-ms: [0-9.]+$" docs/ai-security/LOCAL_DECISION_BASELINE.md
```

All three must match. Those three numbers are the inputs to Tasks 7 and 9 and no later task may invent
its own.

---

## Task 2: Bind the runtime-adapter vocabulary to the pinned artifact that already carries it

> **This task was rewritten on 2026-08-28.** The previous version proposed twelve files across two
> repos - a Backend emitter, a generated JCS artifact, a `.sha256` sidecar, a Backend spec, a second
> embedded artifact, a second consumer pin, a `runtimevocabgen` tool, `vocab_generated.go`, edits to
> `contract.go` / `vocab.go` / `attestation.go`, and a CI step - and called itself "the
> highest-consequence contract in the wave". **Every one of those files was unnecessary.** The artifact
> already exists, is already embedded, is already digest-pinned, is already `SelfCheck()`-verified, and
> is already readable through an accessor. The previous defeat test's mutation ("append `FAKE_EVENT` to
> the `CanonicalHookEvent` union") **cannot be performed**, because that file has no union to append
> to - all six tuples are re-exports. See §F. What follows is the whole task.

**Files:**
- `Installers/internal/aipolicycontract/accessors.go` (one new accessor)
- `Installers/internal/airuntime/vocab_parity_test.go` (one new test + corrected header comment)
- `Installers/internal/aipolicycontract/inertness_test.go` (one allowlist entry, with a written reason)

That is three files, all in `Installers`. **No new artifact. No new pin. No generator. No Backend
change. No workflow change. No `ci/gates.json` change. No change to any exported value in `vocab.go`.**

**Depends on:** nothing. **Blocks:** nothing.

### PRECONDITIONS

Run all six. Each is a claim this task rests on.

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. The TS file has no union to extract - all six are re-exports.
git -C <backend> show origin/main:packages/shared-contracts/src/runtime-adapter-contract.ts \
  | grep -nE "^export const (COVERAGE_DEPTHS|ENFORCEMENT_EFFECTS|CERTIFICATION_STATES|CANONICAL_HOOK_EVENTS|GOVERNANCE_DISPOSITIONS|MCP_GOVERNANCE_ROWS) = AI_SECURITY_PORTABLE_ORDERED_TUPLES\."
# expect: exactly 6 lines, at 72, 97, 111, 130, 164, 183.
# If you get 0 lines, the file has changed shape - STOP AND REPORT. Do not write a regex extractor.

# 2. The embedded artifact already carries all six.
git show origin/main:internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s).v1Policy.orderedTuples;
   for (const k of ['CANONICAL_HOOK_EVENTS','ENFORCEMENT_EFFECTS','COVERAGE_DEPTHS','CERTIFICATION_STATES','GOVERNANCE_DISPOSITIONS','MCP_GOVERNANCE_ROWS'])
     console.log(k, t[k] ? t[k].length : 'ABSENT');})"
# expect exactly:
#   CANONICAL_HOOK_EVENTS 11
#   ENFORCEMENT_EFFECTS 12
#   COVERAGE_DEPTHS 7
#   CERTIFICATION_STATES 5
#   GOVERNANCE_DISPOSITIONS 12
#   MCP_GOVERNANCE_ROWS 3
# Any 'ABSENT' means the artifact is not what this task assumes - STOP AND REPORT.

# 3. An accessor already reads that key, SelfCheck-gated.
git show origin/main:internal/aipolicycontract/accessors.go | sed -n '77p;90p'
# expect:  func OrderedTuples() map[string][]string {
#          func OrderedTuple(name string) ([]string, bool) {

# 4. The test file is an internal test package, so it can see unexported helpers.
git show origin/main:internal/airuntime/vocab_parity_test.go | sed -n '1p'
# expect: package airuntime

# 5. aipolicycontract is stdlib-only, so importing it from airuntime cannot cycle.
ls internal/aipolicycontract/stdlib_only_test.go
# expect: the path, not "No such file"

# 6. internal/airuntime is covered by a MIRRORED CI leg; internal/aipolicycontract is NOT.
grep -n "go test ./internal/airuntime/" .github/workflows/pr-checks.yml
# expect: line 543, inside job ai-checkpoint-observation
node -e "const g=require('C:/Users/Owner/Documents/Ceragon/ci/gates.json').repos.Installers;
  console.log('mirrored?', 'pr-checks:ai-checkpoint-observation' in g.mirrored,
              '| internal-candidate mirrored?', 'internal-candidate:*' in g.mirrored,
              '| cannotMirror?', 'internal-candidate:*' in g.cannotMirror);"
# expect: mirrored? true | internal-candidate mirrored? false | cannotMirror? true
```

**If any precondition fails, STOP AND REPORT.** In particular: if precondition 2 shows a missing tuple,
**do not create a new artifact to hold it.** A second artifact carrying the same vocabulary gives the
endpoint two answers, which is the exact failure this wave refuses elsewhere.

### LANDMINES

- **`internal/aipolicycontract`'s own tests do not run in CI.** They are reached only by `go test ./...`
  in `internal-candidate.yml`, which `ci/gates.json` marks `cannotMirror`. So the inertness allowlist
  entry you add is checked by **nothing** unless you run it yourself:
  `go test ./internal/aipolicycontract/ -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1`.
  Paste the result. Landing this task without that entry leaves a permanently-red gate on `main` that
  nobody sees - and the file's own comment records that this has already happened once: "A
  permanently-red allowlist is strictly worse than none."
- **The inertness allowlist covers test files.** `ai_policy_activate_test.go`, `hmac_test.go`,
  `shadow_test.go` and `ai_ingress_benign_test.go` are all already listed. `vocab_parity_test.go` is not
  exempt for being a test.
- **Three Go tuples have no counterpart in the artifact**: `LaunchOrigins`, `PolicyIntegrityStates`,
  `PolicyContainmentStates` (`vocab.go`). The new accessor and test cover **exactly six** names. Adding
  a seventh to the accessor makes it return nil for every caller.
- **`SelfCheck()` failing makes every accessor return nil, by design.** `OrderedTuple` returns
  `(nil, false)` when the contract is unverifiable. The new test must therefore assert
  `ok == true` **loudly and first** - an assertion that silently skips when the accessor returns nil is
  inert-test shape 5, and the whole test then passes on a broken contract.
- Order is load-bearing. `internal/controls/attestation.go:369+` states these are heartbeat wire
  vocabularies; re-ordering a member "does not break the pin but DOES silently change what a historical
  bucket means" (`undecidable.go:70-74` states the same rule for its own tuple). Compare **value and
  index**, never set membership.

### DO NOT

- **Do not edit `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts`** or anything under
  `Backend/`. This task has no Backend half. The previous revision's Backend emitter does not exist and
  must not be built.
- **Do not add an artifact, a `.sha256`, a consumer pin, or a `//go:embed` entry.** `contract.go:22`'s
  embed list and `consumer-pin.v1.json` are unchanged by this task; `git diff origin/main -- internal/aipolicycontract/consumer-pin.v1.json internal/aipolicycontract/contract.go` must be empty.
- **Do not change any exported value in `internal/airuntime/vocab.go`.** No new const, no re-ordered
  slice, no renamed type. `git diff origin/main -- internal/airuntime/vocab.go` must be empty except for
  the header comment correction.
- **Do not delete the existing `TestVocabularyParity_*` tests.** They pin Go against the wire mirror;
  the new test pins Go against the artifact. Both edges are wanted. If the new test disagrees with the
  hand literals, **the hand literals are the thing that is wrong** - but stop and report rather than
  editing either side, because a genuine disagreement means the shipped agent and the shipped contract
  disagree and that is an incident, not a chore.
- Do not "fix" a failing `SelfCheck()` by relaxing it.

**Blast radius:** near zero. One accessor that copies bytes already on disk, one test, one allowlist
line. Nothing on any decision path, nothing on the wire, nothing shipped to an endpoint changes. The
one way to get this wrong is to reintroduce the deleted scope and touch `vocab.go`'s exported values,
which is why the DO NOT list is explicit and the exit criterion is a `git diff` that must be empty.

**Rollback:** revert the three files. There is no artifact, no pin and no generated file to unwind, and
no endpoint has seen anything.

- [ ] Failing test first, in `Installers/internal/airuntime/vocab_parity_test.go`:
      `TestRuntimeAdapterTuplesMatchThePinnedContract`. For each of the six names, it fetches the tuple
      from `aipolicycontract.RuntimeAdapterTuples()` and compares it to the live Go slice
      (`CanonicalEvents`, `EnforcementEffects`, `CoverageDepths`, `CertificationStates`,
      `GovernanceDispositions`, `McpGovernanceRows`), converted to `[]string`, by **value and index**,
      reusing the existing `assertOrderedEqual` helper at `vocab_parity_test.go:107`.
      RED today: the accessor does not exist.
- [ ] Assert the precondition loudly, as its own subtest: `RuntimeAdapterTuples()` returns a non-nil map
      with **exactly six** keys. `t.Fatalf` on nil with a message naming `SelfCheck` - so a contract that
      fails verification reports *that*, and never a vacuous pass.
- [ ] Add `RuntimeAdapterTuples() map[string][]string` to `internal/aipolicycontract/accessors.go`. It
      calls the existing `contractData()` / `OrderedTuple` path - **no new parsing, no new embed** - and
      returns a deep copy of exactly the six names. If any one of the six is missing from the artifact it
      returns **nil**, not a partial map: a short map would let a future regeneration drop a tuple and
      still pass a per-key loop.
- [ ] Add `internal/airuntime/vocab_parity_test.go` to `gateOpenedConsumerFiles` in
      `internal/aipolicycontract/inertness_test.go`, with a written reason in the file's existing style:
      it reads the pinned tuples **through** this package so the comparison is against real embedded
      metadata rather than a hand-copied literal that drifts; it reads nothing else; it is a test file,
      never compiled into a shipped binary; it changes no activation flag.
- [ ] Correct the false sentence in the `vocab_parity_test.go` header (`:12-21`). It currently claims
      "If the TS contract changes, all three fail together until reconciled." Replace it with what is
      now true: the hand literals pin Go against the heartbeat wire mirror, and
      `TestRuntimeAdapterTuplesMatchThePinnedContract` pins both against
      `embedded/0.5.0/portable-contract.v1.jcs.json`, which is the artifact the TS tuples are generated
      into. Keep the APPEND-ONLY rule verbatim.
- [ ] Run the inertness gate by hand (it is in no mirrored leg):
      `go test ./internal/aipolicycontract/ -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1`.
      Paste the result.

### DEFEAT TEST

Two mutations. Both must be performed and both results pasted.

**Mutation A - prove the new edge catches drift the old pin cannot see.**
In `internal/airuntime/vocab.go` append a member to the tuple, **and** append the same string to
`wantCanonicalHookEvents` in `vocab_parity_test.go` (this is exactly what a well-meaning append looks
like today):

```go
// vocab.go
EventFakeEvent CanonicalEvent = "FAKE_EVENT"   // add to the const block AND to CanonicalEvents
// vocab_parity_test.go
"FAKE_EVENT",                                   // add to wantCanonicalHookEvents
```

**Command:**

```bash
cd <worktree> && go test ./internal/airuntime/ -count=1 \
  -run 'TestVocabularyParity_CanonicalEvents|TestRuntimeAdapterTuplesMatchThePinnedContract' -v
```

**Must print** — the old pin GREEN, the new one RED:

```
--- PASS: TestVocabularyParity_CanonicalEvents
--- FAIL: TestRuntimeAdapterTuplesMatchThePinnedContract
    runtime-adapter tuple drift: CANONICAL_HOOK_EVENTS has 11 members in the pinned contract artifact and 12 in airuntime.CanonicalEvents
```

The `PASS` on the first line is the point of the whole task: today that identical mutation is green
everywhere.

**Mutation B - prove the allowlist entry is load-bearing.**
Delete the `vocab_parity_test.go` line you added to `gateOpenedConsumerFiles`.

**Command:**

```bash
cd <worktree> && go test ./internal/aipolicycontract/ -count=1 \
  -run TestPackageRemainsInertOutsideItsOwnToolingTree
```

**Must print a line containing:**

```
imports the C04 contract package outside the gate-opened consumer set
```

Restore both mutations and re-run both commands; both must be green.

**EXIT:** all four hold, each by command.

```bash
go test ./internal/airuntime/ -run TestRuntimeAdapterTuplesMatchThePinnedContract -v -count=1
#   -> six subtests, all PASS
go test ./internal/aipolicycontract/ -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1
#   -> ok
git diff --stat origin/main -- internal/airuntime/vocab.go
#   -> the ONLY changed lines are inside the header comment block; zero changed const/var lines
git diff --stat origin/main -- internal/aipolicycontract/consumer-pin.v1.json \
    internal/aipolicycontract/contract.go internal/aipolicycontract/embedded
#   -> EMPTY
node ci/lib/run.mjs Installers   # 11 mirrored legs, unchanged count, ai-checkpoint-observation green
```

---

## Task 3: Project the snapshot fields the inline core needs into the pinned catalog consumer

**Files:**
- `Installers/internal/aipolicycontract/tooling/cmd/detectorcataloggen/main.go`
- `Installers/internal/aipolicycontract/detector_catalog_generated.go` (regenerated)
- `Installers/internal/aipolicycontract/detector-catalog-consumer-pin.v1.json` (digest must **not**
  move - the spine is not edited)
- `Installers/internal/aipolicycontract/detector_catalog_test.go`

**Depends on:** nothing. **Blocks:** Task 4 (`expected.resourceBudget`) and Task 9 (the scan bound).

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. The spine carries budgets and defaults per class, and the key is `classId`.
git show origin/main:internal/aipolicycontract/embedded/0.7.0/contract-spine.v3.jcs.json \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s).catalogs.detectorCatalog.classes;
   console.log('classes',c.length);
   const pk=c.find(x=>x.classId==='private-key');
   console.log('budgets',JSON.stringify(pk.budgets),'defaults',JSON.stringify(pk.defaults));
   console.log('zero maxInputBytes:',c.filter(x=>!x.budgets||!x.budgets.maxInputBytes).length);
   console.log('zero maxMatches:',c.filter(x=>!x.budgets||!x.budgets.maxMatches).length);
   console.log('zero maxDecodeDepth count:',c.filter(x=>!x.budgets||x.budgets.maxDecodeDepth===0).length);})"
# expect exactly:
#   classes 55
#   budgets {"maxDecodeDepth":1,"maxInputBytes":65536,"maxMatches":16} defaults {"recommended":"BLOCK","restricted":"BLOCK","unsupported":"DEGRADED"}
#   zero maxInputBytes: 0
#   zero maxMatches: 0
#   zero maxDecodeDepth count: 45
# 45 of 55. Only 10 classes decode at all: private-key, aws-credential-pair, aws-access-key, gcp-key,
# openai-key, github-token, base64-wrapped-secret, private-key-candidate, injection-encoded-payload,
# injection-decoded-payload — each at depth 1. Read the landmine below before writing any budget test.

# 2. The pin that must not move.
git show origin/main:internal/aipolicycontract/detector-catalog-consumer-pin.v1.json | grep -E "b252ee02|classCount|hardStopEligibleClassCount"
# expect: sha256 b252ee02..., "classCount": 55, "hardStopEligibleClassCount": 4

# 3. The struct being widened, and the deep-copy precedent.
git show origin/main:internal/aipolicycontract/detector_catalog_generated.go | grep -n "HardStopEvidenceTiers\|func cloneDetectorClass\|type AiSecurityDetectorClass"
# expect all three present
```

**If any precondition fails, STOP AND REPORT.** In particular, if precondition 1 reports a nonzero
`zero maxInputBytes`, the spine has changed and the bounded-scan design in Task 9 needs re-deriving —
do not paper over it with a default.

### LANDMINES

- **`maxDecodeDepth` is legitimately `0` for 45 of the 55 classes** — including two of the four
  hard-stop classes (`gcp-service-account`, `azure-connection-string`). Only ten classes decode at all,
  each at depth 1. A "no budget may be zero" test written across all three fields is RED for a correct
  spine on 45 rows, and the agent's next instinct — editing the generator to substitute a nonzero
  default, or editing the spine — moves the pinned digest and breaks the contract. **The non-zero
  assertion covers `MaxInputBytes` and `MaxMatches` only**, and a separate test pins the zero as
  deliberate.
- **The spine key is `classId`, not `id`.** `hardStopEligible` is an **object**
  (`{eligibleEvidenceTiers, rationale}`), not a boolean; the four hard-stop classes are the ones whose
  `eligibleEvidenceTiers` is non-empty. A generator written against the wrong shape emits a field the
  spine does not have and `--check` fails — which is the correct, loud outcome, but only if you did not
  "fix" it by editing the spine.
- **The spine is NOT edited by this task.** Only the Go projection widens. If
  `detector-catalog-consumer-pin.v1.json` shows any diff after regeneration, you edited the spine and
  the task has failed.
- `internal/aipolicycontract` runs in no mirrored CI leg (§H). Run
  `go test ./internal/aipolicycontract/ -count=1` yourself and paste it.
- The generated file already has two live readers (`internal/policyeval/shadow.go`,
  `cmd/ai-security-neutral/holdout.go`) and both read only `Lifecycle`. **Adding** fields is additive;
  removing or renaming one is not.

### DO NOT

- Do not edit `embedded/0.7.0/contract-spine.v3.jcs.json`. Ever, in this task.
- Do not edit `detector-catalog-consumer-pin.v1.json` by hand. It is regenerated or it is unchanged.
- Do not widen `DetectorHardStopEligibleClassIDs()` or add a class. Task 9 states why.
- Do not give any budget field a default when the spine key is missing. A missing budget is a build
  failure, never a zero.

**Blast radius:** the generated file has two live readers today and both read only `Lifecycle`. Adding
fields to `AiSecurityDetectorClass` is additive; removing or renaming one is not. If the generator emits
a field the spine does not have, `--check` fails and the build stops - loud, and pre-merge.

**Rollback:** `git checkout origin/main -- internal/aipolicycontract/tooling/cmd/detectorcataloggen/main.go internal/aipolicycontract/detector_catalog_generated.go` then re-run the generator's `--check`. No wire format, no endpoint state, no on-disk file.

- [ ] Failing test first: `TestHardStopClassesCarryTheirSpineBudgetsAndDefaults` asserts
      `DetectorClassByID("private-key")` returns `Budgets.MaxInputBytes == 65536`,
      `Budgets.MaxMatches == 16`, `Budgets.MaxDecodeDepth == 1`, `Defaults.Recommended == "BLOCK"`,
      `Defaults.Restricted == "BLOCK"`, `Defaults.Unsupported == "DEGRADED"`. RED: the fields do not
      exist.
- [ ] Extend `AiSecurityDetectorClass` with `Budgets{MaxInputBytes, MaxMatches, MaxDecodeDepth int}`
      and `Defaults{Recommended, Restricted, Unsupported string}`, both deep-copied by
      `cloneDetectorClass` exactly as `HardStopEvidenceTiers` already is.
- [ ] Teach `detectorcataloggen` to project `classes[].budgets` and `classes[].defaults` from
      `embedded/0.7.0/contract-spine.v3.jcs.json`, keyed on `classId`. The spine is **not** edited; only
      the projection widens.
- [ ] Add `TestEveryClassHasNonZeroInputAndMatchBudgets` - covering `MaxInputBytes` and `MaxMatches`
      across all 55 classes. A zero `MaxInputBytes` would make a bounded scan unbounded, so a missing
      budget must be a build failure, never a default of zero. **`MaxDecodeDepth` is deliberately
      excluded**: 45 of the 55 classes carry `0` in the spine and that is correct.
- [ ] Add `TestDecodeDepthZeroIsPreservedNotDefaulted` - assert
      `DetectorClassByID("gcp-service-account").Budgets.MaxDecodeDepth == 0` **and** that exactly 10
      classes have a non-zero `MaxDecodeDepth`, so a future "helpful" default of 1 is caught rather than
      silently deepening the scan on 45 classes at once.
- [ ] Regenerate and confirm `git diff` on `detector-catalog-consumer-pin.v1.json` is empty (the
      detector-catalog digest `sha256:b252ee02...` must not move).

### DEFEAT TEST

**Mutation:** in `detectorcataloggen/main.go`, make the projection emit `MaxInputBytes: 0` when the
spine key is absent instead of failing. Then regenerate with the `private-key` budget key removed from
the generator's field list.

**Command:**

```bash
cd <worktree> && go run ./internal/aipolicycontract/tooling/cmd/detectorcataloggen \
  && go test ./internal/aipolicycontract/ -run TestEveryClassHasNonZeroInputAndMatchBudgets -count=1
```

**Must print:**

```
detector class private-key has MaxInputBytes 0; a class with no budget cannot bound an inline scan
```

Revert and re-run; must print `ok`. Paste both.

**EXIT:** all four by command.

```bash
go test ./internal/aipolicycontract/ -count=1                    # ok, whole package
go run ./internal/aipolicycontract/tooling/cmd/detectorcataloggen --check   # exit 0
git diff --exit-code -- internal/aipolicycontract/detector-catalog-consumer-pin.v1.json   # exit 0
git diff --exit-code -- internal/aipolicycontract/embedded/                               # exit 0
```

plus, asserted by `TestHardStopClassesCarryTheirSpineBudgetsAndDefaults`:
`DetectorClassByID("private-key").Budgets.MaxInputBytes == 65536`, and each of the four hard-stop class
IDs returns `Defaults.Restricted == "BLOCK"`.

---

## Task 4: Make the live decision path emit a replayable neutral case

**Files:**
- new `Installers/internal/neutraleval/capture.go`
- new `Installers/internal/neutraleval/capture_test.go`
- `Installers/internal/neutraleval/contract.go` (no flag change - `RuntimeActivatable` stays false)
- `Installers/cmd/devoid/ai.go` (`buildHookRunRequest:948`, the capture-sink wiring)
- `Installers/internal/daemon/ai_handlers.go` (the gateway-side sink, after `scanAndDecideWithPolicy`)
- new `Installers/parity-vectors/neutral/capture-schema.md`

**Depends on:** Task 3 (`expected.resourceBudget` reads the class budgets it adds).

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. Task 3 has landed - the budgets this task records exist.
go test ./internal/aipolicycontract/ -run TestHardStopClassesCarryTheirSpineBudgetsAndDefaults -count=1
# expect: ok.  If it fails, STOP - Task 3 is a hard prerequisite, do not invent a budget literal.

# 2. The single seam this task extends, and the near-miss it records.
git show origin/main:cmd/devoid/ai.go | sed -n '948p;972p;996p;1023p'
# expect:  func buildHookRunRequest(args []string, recorder *hooklatency.Recorder) airuntime.RunRequest {
#          		Latency: hookLatencySink(recorder),
#          // hookLatencySink is the ONE sink `RunRequest.Latency` receives, fanning the same
#          func hookLatencySink(recorder *hooklatency.Recorder) airuntime.LatencySink {

# 3. The gateway twin.
git show origin/main:internal/daemon/ai_handlers.go | sed -n '1169p;2418p'
# expect:  func (s *Server) handleAIPromptCheck(w http.ResponseWriter, r *http.Request) {
#          func (s *Server) scanAndDecideWithPolicy(text, provider string, policy *backend.AiPolicy) policyeval.Decision {

# 4. The seal that forbids naming the holdout.
git show origin/main:internal/neutraleval/holdout_seal_test.go | sed -n '117p'
# expect: func TestHoldoutCorpusIsNotReferencedByAnyPerPRTest(t *testing.T) {
```

**If any precondition fails, STOP AND REPORT.** Do not proceed on Task 3 being "probably fine".

### LANDMINES

- **This task writes files derived from prompt text.** Get it wrong and DeVoid becomes an exfiltration
  path for the content it exists to protect, and the person who notices is a customer's security
  reviewer. Capture is **off by default**, opted into per invocation, writes only under an
  operator-named directory, and carries **no raw content** unless the operator also sets the explicit
  plaintext variable.
- **`DEVOID_AI_CAPTURE_PLAINTEXT=1` is a support affordance, never a shipped default and never a
  fallback.** There is no code path in which an absent variable is treated as "probably fine, capture
  it anyway".
- **One seam, one adapter.** `cmd/devoid/ai.go:996` documents a near-miss where two branches each
  assigned `Latency:` and a merge taking either side whole would have silently deleted one consumer.
  Fan out inside the sink; do not add a second assignment to `RunRequest`.
- **Never name `neutral-corpus.holdout.jsonl`** in `capture_test.go`, `capture-schema.md`, or any file
  you touch. `holdout_seal_test.go:117` fails the build with "the SEALED holdout is referenced by per-PR
  test file(s)". Use `shared` / `ingress` / `policyeval-decision`.
- `internal/neutraleval.RuntimeActivatable` stays `false` (`contract.go:21`). A capture producer is not
  an activation.
- A capture that records a digest of text it did not scan is worse than no capture: it certifies a
  replay that cannot be reproduced. `neutraleval.Run` already refuses input whose bytes do not match
  `case.input.artifactDigest` — keep that the only source of truth.

### DO NOT

- Do not flip `RuntimeActivatable` or `V2WriterEligible` in `internal/neutraleval/contract.go`.
- Do not write capture output anywhere but the operator-named directory. No `%TEMP%` fallback, no
  home-directory default.
- Do not add a second `Latency:` or `Capture:` assignment in `buildHookRunRequest`.
- Do not weaken `neutraleval.Run`'s digest check to make a capture replay.

**Blast radius:** this writes files derived from prompt text. So the capture is **off by default**,
opted into per invocation, writes only under an operator-named directory, and carries **no raw content**
unless the operator also sets the explicit plaintext variable - a support affordance, never a shipped
default.

**Rollback:** the sink is a nil function pointer in the composition root. Setting it back to nil
removes the feature completely - no state to unwind, no file format to migrate. Verify by running the
hook with the sink nil and confirming no file appears under the capture directory.

- [ ] Failing test first: `TestCaptureProducesAReplayableEntry` - take a fixed prompt, run the decision
      through the core, capture, feed the captured `neutraleval.Entry` back to `neutraleval.Run` and
      assert the resulting `Result.SemanticDigest` equals the digest the live path recorded. RED:
      `capture.go` does not exist.
- [ ] `Capture(text string, res Decision, meta Meta) (Entry, error)` builds the case metadata
      (`caseId` from `internal/aicorrelation`, `input.artifactDigest = SHA256Bytes(text)`,
      `input.byteLength`, `encoding: "UTF8"`, `expected.resourceBudget` from the class budgets added in
      Task 3) and fills `RunnerInput` **with the digest only**. Plaintext lives in `Entry.Input.Text`
      and reaches disk only when `DEVOID_AI_CAPTURE_PLAINTEXT=1` is set; otherwise the field is empty
      and the entry replays only against a separately supplied corpus of the same digest.
- [ ] `TestCaptureNeverWritesPlaintextByDefault`: run capture with no env var over a fixture containing
      an RSA private key and assert the marshalled bytes do not contain the fixture. Assert the fixture
      is non-empty first, loudly — a test that silently reads an empty fixture passes vacuously
      (inert-test shape 5).
- [ ] Wire the sink in `cmd/devoid/ai.go` next to the existing `Latency:` assignment at `:972`,
      following the fan-out precedent at `hookLatencySink` (`:996-1023`) - **one seam, one adapter**.
- [ ] Wire the same sink into `handleAIPromptCheck` after `scanAndDecideWithPolicy`, so a captured hook
      event and a captured gateway event are the same shape.
- [ ] `TestHookAndGatewayCapturesAreIdenticalForTheSameInput` - Workstream 1's exit gate as one
      assertion: build the same input twice, once through the hook lane's core call and once through
      the gateway's, and assert `Result.SemanticDigest` is equal.

### DEFEAT TEST

**Mutation:** in the gateway sink wiring in `internal/daemon/ai_handlers.go`, pass `provider: ""`
where the hook passes the real provider.

**Command:**

```bash
cd <worktree> && go test ./internal/neutraleval/ -run TestHookAndGatewayCapturesAreIdenticalForTheSameInput -count=1
```

**Must print a line beginning:**

```
hook and gateway semantic digests differ: sha256:
```

Revert and re-run; must print `ok`. Paste both.

**EXIT:** by command, on a corpus of at least 20 captures taken from a real Claude Code session:

```bash
for f in <capture-dir>/*.json; do go run ./cmd/ai-security-neutral --input "$f" || exit 1; done
# every entry reproduces the digest the live path recorded; exit 0
go test ./internal/neutraleval/ -run 'TestCaptureNeverWritesPlaintextByDefault|TestCaptureProducesAReplayableEntry' -count=1
# ok
ls <capture-dir> | wc -l    # >= 20
```

---

## Task 5: Read the signed snapshot from the hook process

**Files:**
- new `Installers/internal/localsnapshot/localsnapshot.go`
- new `Installers/internal/localsnapshot/state.go`
- new `Installers/internal/localsnapshot/localsnapshot_test.go`
- `Installers/internal/daemon/ai_policy_authority.go` (move `verifyStoredPair:527` out; the daemon
  keeps a thin wrapper)
- `Installers/internal/aipolicycontract/inertness_test.go` (allowlist the new file, if and only if it
  imports `aipolicycontract`)

**Depends on:** nothing. **Blocks:** Task 7.

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. The function being relocated, verbatim, and its boot caller.
git show origin/main:internal/daemon/ai_policy_authority.go | sed -n '527p;614p'
# expect:  func verifyStoredPair(pair *aikeystore.ActivatedPolicyPair, rootSpkiB64Url string) (policybundle.AISignedPolicyBundleV2, *backend.AiPolicy, error) {
#          func BootSignedAuthority(a *PolicyAuthority, store aikeystore.ActivationStore, rootSpkiB64Url string, v2Enrolled bool, wall time.Time) PolicyBootResult {

# 2. The single resolver this package must use and never bypass.
git show origin/main:internal/aikeystore/location.go | grep -n "StoreDirName\|ErrAmbiguousStoreScope ="
# expect: 67:const StoreDirName = "aitrust"  and  262:var ErrAmbiguousStoreScope = errors.New(...)

# 3. The 24-case corpus the golden test runs.
git ls-tree -r --name-only origin/main internal/policybundle/testdata/policy-bundle-v2/cases/ | wc -l
# expect: 24
git show origin/main:internal/policybundle/parity_corpus.go | sed -n '123p'
# expect: func ParityRoot() string {

# 4. The POSIX boundary this task must degrade at, not fail at.
git show origin/main:internal/aikeystore/harden_other.go | sed -n '11p'
# expect: 	return func(path string) error { return os.Chmod(path, 0o600) }
```

**If any precondition fails, STOP AND REPORT.** If precondition 3 returns a number other than 24, the
corpus moved; report the new number rather than adjusting the assertion.

### LANDMINES

- **`verifyStoredPair` is on the daemon boot path.** A behaviour change there does not leak - it
  **contains** the endpoint, which means every managed endpoint stops honouring its administrator's
  policy and drops to the built-in floor until a recovery fetch succeeds. That is a fleet-wide
  availability event surfaced to the operator as `signed-state-missing-or-corrupt`. The move must be a
  **verbatim relocation**: same function body, same error values, same order of checks.
- **Never resolve the store directory yourself.** `aikeystore.ResolveStoreLocation()` is the one
  resolver the daemon writer, the upgrade reader and this reader share.
  `location.go:6-44` records the incident where the SYSTEM daemon wrote to
  `C:\Windows\System32\config\systemprofile\.devoid\aitrust` while an elevated admin console read
  `C:\Users\<admin>\.devoid\aitrust`. A path of your own re-creates it.
- **This task creates no file under the machine root.** It only *reads* `%ProgramData%\devoid\aitrust`,
  which `boundaryChildNames` already covers as `activationStoreDirName`. If your design starts wanting a
  new directory or file there, **stop**: writing any new entry under the machine root requires the SAME
  COMMIT to add it to `boundaryChildNames` in `Installers/cmd/devoid-msi-root-guard/guard_windows.go`,
  or the next MSI operation dies with 1722 -> 1603 and rolls back the upgrade on every **enrolled**
  endpoint while every clean-box test stays green. That has happened three times here: `.staging`,
  `aitrust`, `endpoint-identity.json`.
- **"I cannot read it" is not "it is not there."** `cmd/devoid/ai_failure_resolver.go`
  (`ungovernedCheckpointNotice()` at `:284`) had to add exactly this distinction for the daemon token
  after an operator was told to restart a daemon that was already running. Do not repeat it.
- **The trusted-time rule is `now = max(wallClock, pair.TrustedServerTime)` and the direction matters
  both ways.** Taking the max means a **backwards** clock cannot resurrect an expired snapshot, and a
  **forwards** clock can only make a live snapshot look expired - which degrades to the stricter
  built-in floor. Write both directions into the file comment so it cannot be re-derived wrongly.
- **No fail-closed branch belongs in this task.** Every unreadable/corrupt/ambiguous state is a state
  the endpoint reports, not a state that stops it. A fail-closed branch on a condition that cannot be
  proven at runtime bricked a machine in July 2026 and the operator uninstalled the agent.

### DO NOT

- Do not change any behaviour inside `verifyStoredPair` while moving it - not an error string, not a
  check order, not a wrapped error.
- Do not weaken `internal/aikeystore/harden_other.go`'s `0o600` or `NewFileStore`'s `0o700` to make the
  POSIX read work. On POSIX machine installs the hook degrades to the built-in floor. If a guard blocks
  the task, the task is wrong.
- Do not add a `StateUnknown`. The vocabulary is closed.
- Do not write, create, chmod or delete anything under `%ProgramData%\devoid`.
- Do not read `<configDir>/ai-policy.json` (`internal/daemon/ai_policy_store.go:24`). It is unsigned and
  in the daemon's own profile.

**Blast radius:** `verifyStoredPair` is on the daemon's boot path (`BootSignedAuthority`,
`ai_policy_authority.go:614`). A behaviour change there does not leak - it **contains** the endpoint,
which means every managed endpoint stops honouring its administrator's policy and drops to the built-in
floor until a recovery fetch succeeds.

**Rollback:** the daemon wrapper stays; reverting means pointing it back at an in-package copy. No
on-disk format changes, so an agent that rolls back reads exactly the files it wrote.

- [ ] Failing test first: `TestLoadReturnsTheVerifiedPolicyBody` - stage an `activated-policy-pair.json`
      plus `trust-root.json` derived from
      `internal/policybundle/testdata/policy-bundle-v2/cases/accept-genesis-enforce.json`, call
      `localsnapshot.Load(dir)`, assert `snap.Policy != nil` and `snap.State == StateSigned`.
- [ ] Move `verifyStoredPair` into `internal/localsnapshot` unchanged. Add
      `TestVerifyStoredPairIsByteIdenticalToTheDaemonCopy`, a golden test that runs the whole
      `internal/policybundle/parity_corpus.go` corpus (24 cases) through both the old daemon path and
      the new package and asserts identical `(bundle, policy, err)` triples. **Assert the case count is
      24 first, loudly** - a corpus loader that silently found zero cases passes vacuously. Delete the
      daemon copy only after that test is green.
- [ ] `Load` resolves the directory with `aikeystore.ResolveStoreLocation()` and **never** a path of its
      own. `ErrAmbiguousStoreScope` maps to `StateAmbiguous`.
- [ ] Trusted-time rule, written into the file comment: `now = max(wallClock, pair.TrustedServerTime)`;
      `now > pair.ValidUntil` -> `StateExpired`. State both directions and why each is safe.
- [ ] `TestClockRegressionCannotUnexpireASnapshot` and `TestClockAdvanceExpiresRatherThanExtends`.
- [ ] Enumerate the states as a closed vocabulary in `state.go`: `StateSigned`, `StateExpired`,
      `StateContained`, `StateAbsent`, `StateUnreadable`, `StateCorrupt`, `StateAmbiguous`. Each carries
      a content-free slug. There is no `StateUnknown`.
- [ ] `TestUnreadableIsNotAbsent` - chmod the pair `0000` (POSIX) or deny the current user (Windows) and
      assert `StateUnreadable`, not `StateAbsent`. ⚠ On Windows a process that **owns** a file keeps
      implicit `WRITE_DAC` however the DACL reads, and the process always owns its `t.TempDir` fixture -
      that exact fixture failed its own precondition on every runner once. Use a seam plus an assertion
      that the seam was consulted, and assert the precondition (the file really is unreadable) before
      asserting the state.
- [ ] Cache the load for the process lifetime with `sync.OnceValue`. A hook process is short-lived, so
      this is one read per invocation with no invalidation problem.
- [ ] If `internal/localsnapshot` ends up importing `internal/aipolicycontract`, add it to
      `inertness_test.go` with a written reason and run that test by hand (§H - it is in no mirrored leg).

### DEFEAT TEST

**Mutation:** in `internal/localsnapshot/localsnapshot.go`, change the clock line from
`now := maxTime(wall, pair.TrustedServerTime)` to `now := wall`.

**Command:**

```bash
cd <worktree> && go test ./internal/localsnapshot/ -run TestClockRegressionCannotUnexpireASnapshot -count=1
```

**Must print:**

```
expired snapshot accepted after setting the wall clock back: state=signed want=expired
```

Revert and re-run; must print `ok`. Paste both.

**EXIT:**

```bash
go test ./internal/localsnapshot/ -count=1                                   # ok
go test ./internal/localsnapshot/ -run TestVerifyStoredPairIsByteIdenticalToTheDaemonCopy -v -count=1
#   -> 24 subtests, all PASS
go test ./internal/daemon/ -count=1                                          # ok, zero expectation diffs
```

plus, on a real Windows machine install: `localsnapshot.Load` returns `StateSigned` with a non-nil
`*backend.AiPolicy`, and the revision and digest it reports match what the daemon reports on
`GET /v1/status` on the same box. Paste both outputs side by side.

---

## Task 6: Extract the decision core, and route the daemon through it first

**Files:**
- new `Installers/internal/localdecide/prompt.go`
- new `Installers/internal/localdecide/tool.go`
- new `Installers/internal/localdecide/floors.go`
- new `Installers/internal/localdecide/prompt_differential_test.go`
- `Installers/internal/daemon/ai_handlers.go` (`scanAndDecideWithPolicy:2418`,
  `scanAndDecideWireWithPolicy:2627`, `hasGatingSecretFinding:2543`, `decideTool:3716`,
  `defaultToolDecision:3909`, `applyPolicyExpiredOracle:2459`, `applyPolicyContainedFloor:2505`, the
  conclusive-secret branch at `:1399`)

**Depends on:** Task 1 (it must not be blocked on the numbers, but a latency surprise here changes
Task 7's design). **Blocks:** Task 7, then Task 9. Route the daemon through the extracted core **while
it is the only caller and the largest test surface in the repository covers it.**

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. Every function this task relocates or delegates, at its stated line.
git show origin/main:internal/daemon/ai_handlers.go | sed -n '1211p;1399p;2418p;2435p;2459p;2505p;2543p;2627p;3716p;3909p'
# expect, in order:
#   	if aicanary.IsProbe(body.Text) {
#   		case secretFloorApplies && hasGatingSecretFinding(d.DLPFindings):
#   func (s *Server) scanAndDecideWithPolicy(text, provider string, policy *backend.AiPolicy) policyeval.Decision {
#   	if res.MustBlock && policyeval.Rank(d.Verdict) < policyeval.Rank(policyeval.VerdictBlock) {
#   func applyPolicyExpiredOracle(d policyeval.Decision, dp aiDecisionPolicy) policyeval.Decision {
#   func applyPolicyContainedFloor(d policyeval.Decision, dp aiDecisionPolicy) policyeval.Decision {
#   func hasGatingSecretFinding(findings []dlp.Finding) bool {
#   func scanAndDecideWireWithPolicy(text, provider string, policy *backend.AiPolicy) policyeval.Decision {
#   func decideTool(findings []toolrisk.Finding, policy *backend.AiPolicy) string {
#   func defaultToolDecision(findings []toolrisk.Finding) string {

# 2. The governance step and where the prompt path calls it.
git show origin/main:internal/daemon/ai_governance.go | sed -n '99p'
# expect: func evaluateAIGovernance(policy *backend.AiPolicy, agentType, surface string) aiGovernanceVerdict {
git show origin/main:internal/daemon/ai_handlers.go | sed -n '1245p'
# expect: 	gv := evaluateAIGovernance(policy, body.AgentType, foldedSurface)

# 3. The corpora, with their exact case counts.
git show origin/main:parity-vectors/policyeval-decision.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('policyeval cases',JSON.parse(s).cases.length))"
# expect: policyeval cases 17
git show origin/main:parity-vectors/neutral/neutral-corpus.shared.jsonl | grep -c .
# expect: 150

# 4. The import-graph assertion shape to copy (go/parser over the module tree).
git show origin/main:internal/aipolicycontract/inertness_test.go | grep -n "go/parser\|parser.ParseFile\|filepath.WalkDir"
# expect: all three present.  NOTE: dependency_isolation_test.go is a go.mod digest test, NOT this shape.
```

**If any precondition fails, STOP AND REPORT.** These line numbers name the function that decides every
prompt on every endpoint; do not proceed on a "close enough" match.

### LANDMINES

- **This is the highest blast radius in the wave.** A change in the *permissive* direction is a silent
  fleet-wide leak that no current test catches; a change in the *restrictive* direction blocks benign
  prompts and, per the 2026-07-31 precedent, gets the agent uninstalled.
- **The discipline that makes it safe: the daemon is routed through the new core in the same change
  that creates it, and nothing else consumes it yet.** If the extraction is wrong, it is wrong in the
  one place already covered by the largest test surface in the repository, before any new caller exists.
- **Assert on the whole `policyeval.Decision`, not the verdict.** A reason slug that moves changes what
  the console renders and what the Backend wire allowlist accepts. Compare `Verdict`, `Alert`,
  `Reasons` **in order**, `RedactFindings`, `DLPFindings`, `InspectionIssues`.
- **Comparing hand-built literals to hand-built literals proves nothing** (inert-test shape 2). The
  differential test must call the **pre-existing daemon function** on one side, not a re-implementation.
- **The corpus test must never name `neutral-corpus.holdout.jsonl`** -
  `internal/neutraleval/holdout_seal_test.go:117` fails the build if it does.
- **`internal/aipolicycontract/dependency_isolation_test.go` is NOT the shape to copy for the
  import-graph assertion.** It compares `go.mod`/`go.sum` digests. The `go/parser` + `filepath.WalkDir`
  import walk is in `inertness_test.go`.
- Steps 5 and 6 must take their inputs (`Expired`, `Contained`, `CanHold`, `HoldSurface`) from the
  `Input` struct rather than from daemon globals. The hook already computes `canHold` and `holdSurface`
  locally (`cmd/devoid/ai.go:1976`, `aiHookHoldCapability()`) and sends them as headers, so no new
  information is needed on the hook side.

### DO NOT

- Do not change any decision. This task is an extraction; a behaviour delta is a failure, not a
  refinement.
- Do not let `internal/localdecide` import `internal/daemon`, `net/http`, or any backend HTTP client.
  **The detector side must not know a vendor response type.**
- Do not rename or re-signature the daemon methods. They keep their names and become delegations.
- Do not touch `cmd/devoid/ai_failure_resolver.go`. Its answer for `INTERVENTION_UNAVAILABLE` is
  correct and out of scope.
- Do not delete or weaken any existing daemon test to make the delegation compile.

**Blast radius:** **the highest in the wave.** It touches the function that decides every prompt on
every endpoint.

**Rollback:** the daemon methods keep their names and signatures and become one-line delegations.
Reverting is restoring the bodies. No on-disk state, no wire change, no contract change.

- [ ] Failing test first, `prompt_differential_test.go`: `TestCoreMatchesTheDaemonOverTheSharedCorpora`
      runs every case in `parity-vectors/policyeval-decision.json` (17),
      `parity-vectors/dlp-findings.json`, and `parity-vectors/neutral/neutral-corpus.shared.jsonl` (150)
      through both the pre-existing daemon function and `localdecide.Prompt`, asserting **deep equality
      of the whole `policyeval.Decision`**. Assert the loaded case counts (17 and 150) **before** the
      comparison loop, loudly, so a corpus that failed to load cannot pass vacuously.
- [ ] `localdecide.Prompt(in Input) Result` reproduces, in this exact order, everything
      `handleAIPromptCheck` does before it touches the network:
      1. `aicanary.IsProbe(text)` -> unconditional block carrying `aicanary.ReasonSlug`
         (`ai_handlers.go:1211`)
      2. `evaluateAIGovernance(policy, agentType, foldedSurface)` -> block / monitor
         (called at `ai_handlers.go:1245`, defined at `internal/daemon/ai_governance.go:99`)
      3. `dlp.ScanAll` + `promptrisk.Scan` + `policyeval.DecideScan`
      4. the `res.MustBlock` Unicode-evasion upgrade (`ai_handlers.go:2435`)
      5. `applyPolicyExpiredOracle` (`:2459`) then `applyPolicyContainedFloor` (`:2505`)
      6. the `secretFloorApplies && hasGatingSecretFinding` conclusive-secret floor (`:1399`)
- [ ] `localdecide.Tool` does the same for `decideTool` (`:3716`) + `defaultToolDecision` (`:3909`) +
      `toolrisk` classification.
- [ ] Replace the daemon bodies with delegations. `scanAndDecideWithPolicy` keeps its one remaining
      daemon-specific line (`aiPolicy.currentForDecision(...)`) and passes the resulting
      `Expired` / `Contained` / `Terminal` into the core as data.
- [ ] `TestNoDaemonImportInLocaldecide` - a `go/parser` import-graph assertion in the shape of
      `internal/aipolicycontract/inertness_test.go` (`parser.ParseFile` + `filepath.WalkDir`), asserting
      `internal/localdecide` imports none of `internal/daemon`, `net/http`, or any backend HTTP client.

### DEFEAT TEST

**Mutation:** delete the `secretFloorApplies && hasGatingSecretFinding` branch from
`internal/localdecide/prompt.go` (step 6).

**Command:**

```bash
cd <worktree> && go test ./internal/localdecide/ -run TestCoreMatchesTheDaemonOverTheSharedCorpora -count=1
```

**Must print a line containing:**

```
case 'aws pair, non-interactive': verdict allow, want block (reasons: noninteractive-secret:block)
```

Second mutation, for the isolation half: add `import _ "net/http"` to `internal/localdecide/prompt.go`.

```bash
cd <worktree> && go test ./internal/localdecide/ -run TestNoDaemonImportInLocaldecide -count=1
```

**Must print a line containing:** `internal/localdecide imports net/http`

Revert both and re-run; both must print `ok`. Paste all four runs.

**EXIT:**

```bash
go test ./internal/localdecide/ -run TestCoreMatchesTheDaemonOverTheSharedCorpora -v -count=1
#   -> at least 167 subtests, all PASS
go test ./internal/daemon/... -count=1
#   -> ok, with zero diffs to any existing expectation file
go test ./internal/localdecide/ -run TestNoDaemonImportInLocaldecide -count=1   # ok
node ci/lib/run.mjs Installers                                                  # 11 legs green
```

---

## Task 7: Answer a budget expiry from the local core instead of proceeding ungoverned

**Files:**
- `Installers/internal/airuntime/runner.go` (add `RunRequest.LocalDecider`; change the
  `budgetExpiredUndecided` branch at `:926-940`)
- new `Installers/internal/airuntime/local_decider.go` (the seam type only - `airuntime` must not import
  `localdecide`, exactly as it does not import `failureoracle`)
- new `Installers/cmd/devoid/ai_local_decider.go` (the composition-root adapter)
- `Installers/cmd/devoid/ai.go` (`buildHookRunRequest:948`)
- `Installers/cmd/devoid/ai_hook_runner.go` (`executeUserPromptSubmit:489`, `executePreToolUse:771`,
  `executePermissionRequest:1547` - the `ungovernedOutcome(why)` sites at `:551`, `:795`, `:1575`)
- `Installers/internal/airuntime/runner_test.go`, `internal/airuntime/undecidable.go`

**Depends on:** Task 1 (the measured fast-path cap), Task 5 (`localsnapshot.Load`), Task 6
(`localdecide.Prompt`). **All three must be merged first.**

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. All three prerequisites are actually in this branch's history, by ancestry not by chatter.
git merge-base --is-ancestor <task1-sha> HEAD && echo T1-in || echo T1-MISSING
git merge-base --is-ancestor <task5-sha> HEAD && echo T5-in || echo T5-MISSING
git merge-base --is-ancestor <task6-sha> HEAD && echo T6-in || echo T6-MISSING
# all three must print "-in".  A MISSING is a STOP.

# 2. The measured caps exist. Do not invent them.
grep -E "^fast-path-cap-bytes: [0-9]+$" docs/ai-security/LOCAL_DECISION_BASELINE.md
# expect one line.  If absent, STOP - Task 1 has not landed.

# 3. The branch being changed, and the seam fields it sits beside.
git show origin/main:internal/airuntime/runner.go | sed -n '52p;926p;940p;550p'
# expect:  const HookDecisionBudget = 4 * time.Second
#          	if verdict == budgetExpiredUndecided {
#          		return failGating(adapter, adapterID, event, ReasonDecisionBudgetExpired)
#          	Latency LatencySink

# 4. The prefix-matching rule that governs the new reason constants.
git show origin/main:internal/airuntime/runner.go | sed -n '1003p;1016p'
# expect:  const ReasonDecisionBudgetExpired = UngovernedReasonDaemonUnreachable + "-budget-expired"
#          const ReasonDecidedPastBudget = "decided-past-budget"
git show origin/main:internal/airuntime/undecidable.go | sed -n '127p'
# expect: func UndecidableBucketFor(rec LatencyRecord) string {

# 5. The Backend-side rebuild that decides what a new bucket name would do.
git -C <backend> show origin/main:src/ai-governance/runtime-adapter-shape.ts | sed -n '816p'
# expect: export function normalizeRuntimeAdapterUndecidable(
```

**If any precondition fails, STOP AND REPORT.** Especially precondition 2: if
`LOCAL_DECISION_BASELINE.md` has no cap, do not pick 64 KiB because the spine says 65536. Task 1 exists
precisely because that number may not be reachable.

### LANDMINES

- **The failure mode to fear is a NEW BLOCK where today there is a proceed.** It is bounded by
  construction: the local core is the same function the daemon runs, over the same policy the daemon
  would have used, so the only invocations whose outcome changes are the ones that **currently proceed
  with no decision at all**. No invocation that currently reaches the daemon changes. If your design
  changes an invocation that reached the daemon, the design is wrong.
- **Do not mint a bucket-less reason slug.** `UndecidableBucketFor` (`undecidable.go:127`) matches by
  **prefix**; `runner.go:990-1003` records that a brand-new slug "would have fallen through to `other`,
  which is documented as wiring faults". The in-file comment there says a new member "would 400" on the
  Backend — **that is not what actually happens today, and the truth is worse.**
  `Backend/src/ai-governance/runtime-adapter-shape.ts:816 normalizeRuntimeAdapterUndecidable` rebuilds
  the block **field by field, never spread**, "so an unrecognised sibling an endpoint invents cannot
  reach `endpoint_control_state`". A new bucket name is therefore **silently dropped** — no 400, no log,
  no data, and it looks like it worked. Derive the new constants from existing prefixes.
- **A nil `LocalDecider` must restore today's behaviour exactly.** Ship it so that setting the field to
  nil in `buildHookRunRequest` is a **one-line revert an on-call engineer can find**.
- **`StateUnreadable` / `StateCorrupt` / `StateAmbiguous` must DECLINE, not deny.** "I cannot read the
  snapshot" is exactly the class of unprovable condition that bricked a machine in July 2026 and got the
  agent uninstalled. The correct answer is the pre-existing proceed plus a visible counter, not a new
  fail-closed branch.
- **`StateAbsent` / `StateExpired` / `StateContained` decide with a NIL policy**, which is the documented
  built-in floor. §6.3 of the Source of Truth: an endpoint that has never spoken to the backend is
  *stricter*, not looser. Do not treat absent as "allow".
- **This task creates no file under the machine root.** If it starts to want one, see Task 5's landmine
  on `boundaryChildNames` and `guard_windows.go` — 1722 -> 1603 rolls back the upgrade on every
  **enrolled** endpoint while every clean-box test stays green.
- **Codex denies ride stdout at exit 0.** A non-zero exit is a *discarded* hook and the tool runs
  (`internal/airuntime/adapters/codex/testdata/shook/deny-matrix-0147`). The exit criterion below says
  "exits 0" for that reason, not as an oversight.

### DO NOT

- Do not change `HookDecisionBudget` (`runner.go:52`) or the 60-second host hook timeout.
- Do not change `cmd/devoid/ai_failure_resolver.go`'s answer for `INTERVENTION_UNAVAILABLE`.
- Do not let `internal/airuntime` import `internal/localdecide`, `internal/localsnapshot` or
  `internal/daemon`. The seam is an interface in `local_decider.go`; `airuntime` must not learn a policy
  type.
- Do not add a member to `UndecidableBuckets`.
- Do not make the decline path deny "just to be safe".

**Blast radius:** every gating checkpoint on every endpoint.

**Rollback:** `LocalDecider` is nil-safe. Setting it to nil in `buildHookRunRequest` restores today's
behaviour exactly - the runner falls through to `failGating(..., ReasonDecisionBudgetExpired)`. Verify
the rollback by running Task 10's suite in `daemon-slow` mode with the field nil and observing the
original 6-in-10 failure reproduce.

- [ ] Failing test first: `TestBudgetExpiryAnswersFromTheLocalDecider` - a `RunRequest` with an executor
      that blocks forever, a 10 ms `TimeBudget`, and a `LocalDecider` returning a deny. Assert
      `RunResult.Effect == EffectDenyPrompt` and `RunResult.Reason == "decided-locally"`. RED: the field
      does not exist.
- [ ] Add to `runner.go`, beside the existing seam fields at `:548-550`:

      ```go
      // LocalDecider answers this checkpoint from the verified on-disk snapshot when
      // the authority did not. Nil restores the historical ungoverned-proceed path.
      LocalDecider LocalDecider
      ```

      The interface lives in `local_decider.go`, takes `(CanonicalEvent, []byte)` and returns
      `(HookOutcome, bool)`. `airuntime` must not learn a policy type.
- [ ] In the `verdict == budgetExpiredUndecided` branch (`:926`), ask the decider **before** calling
      `failGating` (`:940`). If it answers, `latch.Latch(out)`, stamp `Reason = ReasonDecidedLocally`,
      return. If it declines, fall through to today's exact path, unchanged.
- [ ] New reason constants, derived rather than invented, in the shape `runner.go:990-1020` establishes:
      `const ReasonDecidedLocally = "decided-locally"` (matches `UndecidableBucketFor`'s `"decided"`
      prefix - correct, because the checkpoint **was** decided; `ReasonDecidedPastBudget` at `:1016` is
      the existing precedent for a `decided-` suffix), and
      `const ReasonLocalDecisionUnavailable = UngovernedReasonDaemonUnreachable + "-no-local-snapshot"`
      (stays in `daemonUnreachable`).
- [ ] `TestDecidedLocallyCountsInTheDecidedBucket` and
      `TestLocalDecisionUnavailableStaysInDaemonUnreachable`. Both must feed the constant through the
      **real** `UndecidableBucketFor`, not a copy of its prefix logic.
- [ ] The composition-root adapter in `cmd/devoid/ai_local_decider.go`:
      `localsnapshot.Load()` -> `StateSigned`: `localdecide.Prompt(...)` with the loaded policy.
      `StateAbsent` / `StateExpired` / `StateContained`: `localdecide.Prompt(...)` with a **nil** policy
      (the built-in floor).
      `StateUnreadable` / `StateCorrupt` / `StateAmbiguous`: **decline**, let the historical path run,
      record the reason.
- [ ] `TestLocalDeciderDeclinesOnAnUnreadableSnapshot`.
- [ ] Wire the identical adapter into the three `ungovernedOutcome(why)` sites in
      `cmd/devoid/ai_hook_runner.go` (`:551`, `:795`, `:1575`), for the case where `why.OK()` is false
      (the daemon answered wrongly or not at all) rather than only on budget expiry. **All three, not
      one** - defending one branch of a multi-branch route is inert-test shape 3, and
      `executePermissionRequest` is the Codex lane.

### DEFEAT TEST

**Mutation:** in `internal/airuntime/runner.go`, delete the decider call so the `budgetExpiredUndecided`
branch goes straight to `failGating`.

**Command:**

```bash
cd <worktree> && go test ./internal/airuntime/ -run TestBudgetExpiryAnswersFromTheLocalDecider -count=1
```

**Must print:**

```
budget expired with a local snapshot available: effect none, want deny-prompt
```

Revert and re-run; must print `ok`. Paste both.

**EXIT:** with the daemon **stopped**, on the Windows reference endpoint:

```bash
# 1. Deny path.
printf -- "-----BEGIN RSA PRIVATE KEY-----\n<fixture>\n-----END RSA PRIVATE KEY-----\n" \
  | devoid ai hook --adapter claude-code --event USER_PROMPT_SUBMIT ; echo "exit=$?"
# expect: the Claude deny JSON on stdout, exit=0

# 2. Allow twin, identical size and shape.
printf -- "<benign fixture of the same byte length>" \
  | devoid ai hook --adapter claude-code --event USER_PROMPT_SUBMIT ; echo "exit=$?"
# expect: no deny object on stdout, exit=0

# 3. Both counted as decided.
tail -2 ~/.devoid/ai-hook-outcomes.tsv
# expect: both records classify to bucket `decided`
go test ./internal/airuntime/ -run 'TestDecidedLocallyCountsInTheDecidedBucket|TestLocalDecisionUnavailableStaysInDaemonUnreachable' -count=1
# ok
```

---

## Task 8: Name the degraded states, and make them visible instead of inferable

**Files:**
- `Installers/internal/localsnapshot/state.go`
- `Installers/internal/aihookmetrics/spool.go` (`Line:89`, `recordVersion:51`),
  `internal/aihookmetrics/drain.go` (`parseLine:161`)
- `Installers/internal/hooklatency/summary.go`
- `Installers/cmd/devoid/` doctor surface - locate with
  `git grep -n "hooklatency.Summary\|TargetP95" origin/main -- cmd/devoid`
- `Installers/internal/controls/attestation.go` (heartbeat counters, mirror block at `:369+`)
- `Installers/internal/daemon/server.go` (`GET /v1/status`)
- `Backend/src/ai-governance/runtime-adapter-shape.ts` (`normalizeRuntimeAdapterUndecidable:816`,
  `RuntimeAdapterUndecidableShape:250`)
- `Backend/src/health/types/heartbeat.types.ts` (`RuntimeAdapterReportDto`, documentation only)

**Depends on:** Task 7 (the counters count its outcomes) **and, on the Backend side, Wave 8 Task 5.**

> **PROGRAMME-LEVEL ORDERING, stated here because no other wave states it.**
> **Wave 8 Task 5 must be the first Backend change in the entire programme** — ahead of this task,
> ahead of Wave 4 Task 12, ahead of Wave 8 Task 8. Until W8 T5 lands, a mistyped or unknown optional
> field inside a surviving `runtimeAdapters[]` element is dropped with `reasons: []` and
> `rejectedCount` unchanged, and the pipe's drift counter is structurally blind. **Until then, an
> ordering mistake on these counters produces no error, no data, and a console that looks correct.**

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. Wave 8 Task 5 is merged AND deployed. Not "merged". Deployed.
#    Confirm with the owner and paste the confirmation. There is no local command for this.
#    If it is not deployed, STOP AND REPORT.

# 2. The 5-field TSV record and the drain that rejects an unknown format.
git show origin/main:internal/aihookmetrics/spool.go | sed -n '51p;89p'
# expect:  	recordVersion = "1"
#          func Line(rec airuntime.LatencyRecord) string {
git show origin/main:internal/aihookmetrics/drain.go | sed -n '167p'
# expect: 	if len(f) != 5 || f[0] != recordVersion {

# 3. The Backend field-by-field rebuild - the ONLY thing that decides whether a counter survives.
git -C <backend> show origin/main:src/ai-governance/runtime-adapter-shape.ts | sed -n '816,836p'
# expect: export function normalizeRuntimeAdapterUndecidable(  ... out: { decided, normalize,
#         stdinOversize, stdinTimeout, stdinError, other, daemonUnreachable, daemonError,
#         provenanceUnverified, dropped }

# 4. The DTO that does NOT gate anything, so you do not mistake it for the gate.
git -C <backend> show origin/main:src/health/types/heartbeat.types.ts | sed -n '600,606p'
# expect a comment beginning: ⚠ NONE OF THE DECORATORS ON THIS CLASS EVER EXECUTE.
```

**If precondition 1 or 3 fails, STOP AND REPORT.** Adding a counter to the Go side alone produces
nothing and looks like success.

### LANDMINES

- **Widening an agent-wire contract requires the Backend deployed FIRST.**
  `AgentIngestValidationPipe` sets `forbidNonWhitelisted: false` for agent DTOs
  (`Backend/src/common/pipes/agent-ingest-validation.pipe.ts:20-21`) — it **DROPS unknown keys rather
  than rejecting them**, so the reverse order loses fields **silently**: no error, no log, no data, and
  the deploy looks like it worked. **Backend deploys before any agent release that emits these
  counters.** That ordering is not a preference; the reverse has caused a fleet-wide outage.
- **Adding the field to `RuntimeAdapterReportDto` changes nothing.** That class's decorators never
  execute — its own docblock says so and `runtime-adapter-report-dto.inert.spec.ts` pins the statement.
  The enforcing boundary is `normalizeRuntimeAdapterUndecidable` at `runtime-adapter-shape.ts:816`,
  which rebuilds every field explicitly and never spreads. **A counter you do not add there is dropped.**
- **`undecidableCount(src.<name>)` reads the endpoint's EXACT json tag.** A near-miss spelling
  (`local_decided`, `localDecidedCount`) "reads as absent rather than being guessed at". Pin the tag on
  both sides in the same commit.
- **An HTTP 2xx proves nothing here.** Verify the **stored row** and the **rendered projection**
  separately. The exit criterion below requires a database row, not the agent's own log.
- **The drain must keep rejecting a format it does not know.** `drain.go:167` is
  `if len(f) != 5 || f[0] != recordVersion`. Bumping `recordVersion` to `"2"` and widening to 6 fields
  must not turn that into a lenient parse.
- **`devoid doctor` must print `snapshot: absent (built-in floor)`, never a blank.** The §14 failure
  this repo keeps producing is a surface that reads green over a dead path.

### DO NOT

- Do not emit the new counters from an agent release before the Backend change is deployed.
- Do not add the counters to `RuntimeAdapterReportDto` and stop there.
- Do not make `drain.go` tolerant of an unknown field count.
- Do not add a member to `UndecidableBuckets` (Task 7's landmine); these are **new sibling keys** on the
  undecidable block, not new buckets.
- Do not print an empty string for any snapshot state.

**Blast radius:** new counters on the heartbeat, with a silent-loss failure mode in the wrong order.

**Rollback:** the counters are additive. Removing them from the agent is safe at any time; removing them
from the Backend while agents still send them is also safe, because the rebuild drops unknown keys.
There is no migration.

- [ ] Failing test first: `TestSnapshotStateIsOnTheHookOutcomeRecord` - assert the TSV line written by
      `aihookmetrics.Line` carries the snapshot-state slug as a sixth field. RED: the format has five.
- [ ] Bump `recordVersion` from `"1"` to `"2"` in `spool.go:51` and widen `parseLine`'s guard to
      `len(f) != 6`. Add `TestDrainRejectsAV1LineWithoutMisparsingIt`.
- [ ] Add three counters beside the heartbeat's `runtimeAdapters[].undecidable` block: `localDecided`,
      `localDeclined`, `snapshotState`. Add the wire names to `internal/controls/attestation.go` **and**
      to `normalizeRuntimeAdapterUndecidable` in `Backend/src/ai-governance/runtime-adapter-shape.ts` —
      **Backend first, deployed first.**
- [ ] Extend the Backend's all-zero-drop total to include `localDecided` and `localDeclined`, exactly as
      `daemonUnreachable` is included at `runtime-adapter-shape.ts:850` and for the same reason: an
      endpoint whose whole heartbeat window was decided locally reports `{decided: 0, localDecided: N}`
      and would otherwise be discarded as "observed nothing".
- [ ] `devoid doctor` prints one line per state: snapshot revision, digest, phase, validity window, and
      whether the last N invocations were decided by the daemon or locally. **An endpoint that has never
      loaded a snapshot must print `snapshot: absent (built-in floor)`, not a blank.**
- [ ] `TestDoctorPrintsAbsentRatherThanBlank`.

### DEFEAT TEST

**Mutation:** in `internal/aihookmetrics/drain.go`, change the guard at `:167` from `len(f) != 6` back
to `len(f) != 5` while `recordVersion` is `"2"`, so a v1 line is accepted.

**Command:**

```bash
cd <worktree> && go test ./internal/aihookmetrics/ -run TestDrainRejectsAV1LineWithoutMisparsingIt -count=1
```

**Must print:**

```
v1 record accepted under v2: snapshotState parsed as "" from a line that has no such field
```

Second mutation, for the Backend half: delete `localDecided: undecidableCount(src.localDecided),` from
`normalizeRuntimeAdapterUndecidable`.

```bash
cd <backend> && npx jest src/ai-governance/runtime-adapter-shape.undecidable.spec.ts -t localDecided
```

**Must print a line containing:** `localDecided` and `Received: undefined`

Revert both and re-run; both green. Paste all four runs.

**EXIT:**

```bash
# 1. Agent side.
go test ./internal/aihookmetrics/ ./internal/hooklatency/ -count=1     # ok
devoid doctor | grep -E "^snapshot: "                                   # prints revision + digest, never blank

# 2. The same revision and digest, from the daemon.
curl -s --unix-socket <daemon> http://localhost/v1/status | jq -r '.snapshot.revision, .snapshot.digest'
#    must equal what doctor printed

# 3. Backend side - a DATABASE ROW, not the agent's log.
psql "$DATABASE_URL" -c "select controls->'runtimeAdapters'->0->'undecidable'->>'localDecided' \
  from endpoint_control_state where endpoint_id = '<id>';"
#    must return a non-null integer
```

---

## Task 9: Make the hard-stop set pre-emptive, bounded, and unable to widen itself

**Files:**
- new `Installers/internal/localdecide/hardstop.go`
- new `Installers/internal/localdecide/hardstop_test.go`
- `Installers/internal/aipolicycontract/inertness_test.go` (allowlist `hardstop.go`)

**Depends on:** Task 1 (the measured fast-path cap), Task 3 (the projected budgets), Task 6
(`internal/localdecide` exists), Task 7 (the caller).

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. The four-class set, read from the generated contract projection, not from memory.
git show origin/main:internal/aipolicycontract/detector_catalog_generated.go \
  | grep -o 'ClassID: "[a-z-]*"[^}]*HardStopEligible: true' | grep -o 'ClassID: "[a-z-]*"'
# expect exactly four lines, in this order:
#   ClassID: "private-key"
#   ClassID: "aws-credential-pair"
#   ClassID: "gcp-service-account"
#   ClassID: "azure-connection-string"
# Any other count is a STOP: the pinned set moved and Task 9's whole three-way fence changed.

# 2. Task 3's budgets are present.
go test ./internal/aipolicycontract/ -run TestHardStopClassesCarryTheirSpineBudgetsAndDefaults -count=1
# expect: ok.  If it fails, STOP - do not hardcode 65536.

# 3. Task 1's measured cap.
grep -E "^fast-path-cap-bytes: [0-9]+$" docs/ai-security/LOCAL_DECISION_BASELINE.md
# expect one line.  If absent, STOP.

# 4. The wider floor the hard-stop set must be a subset of.
git show origin/main:internal/dlp/dlp.go | sed -n '1376p'
# expect: func IsGatingSecretClass(class string) bool {

# 5. The parsed-vs-candidate distinction that makes this branch provable.
git show origin/main:internal/aipolicycontract/embedded/0.7.0/contract-spine.v3.jcs.json \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s).catalogs.detectorCatalog.classes;
   for (const id of ['private-key','private-key-candidate','aws-access-key'])
     console.log(id, JSON.stringify(c.find(x=>x.classId===id).hardStopEligible));})"
# expect:
#   private-key {"eligibleEvidenceTiers":["A"],"rationale":"parsed-private-key"}
#   private-key-candidate {"eligibleEvidenceTiers":[],"rationale":"inconclusive-parser-never-denial"}
#   aws-access-key {"eligibleEvidenceTiers":[],"rationale":"identifier-shape-not-credential-proof"}
```

**If any precondition fails, STOP AND REPORT.**

### LANDMINES

- **This is the only place in the wave that can produce a block the daemon would not have produced**, so
  it is fenced three ways, all read from the digest-pinned spine: (1) the class must be in
  `aipolicycontract.DetectorHardStopEligibleClassIDs()` — four classes; (2) the finding's evidence tier
  must be in that class's `HardStopEvidenceTiers` — Tier A only, meaning a **parsed** artefact, not a
  shape match; (3) the finding must be `EnforcementEligible`. Widening the set is a contract change with
  a pin diff, not a code edit.
- **The condition that makes this fail-closed branch PROVABLE** — the thing the July 2026 brick lacked —
  is: *a Tier-A parsed finding in a pinned hard-stop-eligible class*. That is `pem-private-key-parse`
  **succeeding**, not a regex firing. `internal/dlp/private_key.go` distinguishes
  `parsed-pem-private-key` from `pem-private-key-candidate`, and the candidate class is
  `eligibleEvidenceTiers: []` in the spine with rationale `inconclusive-parser-never-denial`. If you
  cannot state the provable condition for a branch you are writing, the branch is wrong.
- **Beyond the cap the answer is `BUDGET_EXCEEDED`, routed to the failure oracle — never a hard stop and
  never a silent allow.** A truncated scan that reports "clean" is the leak this wave exists to close.
- **The temptation to add `aws-access-key` is real.** It is the exact class the 2026-08-26 campaign
  found unblocked. The spine's own rationale is `identifier-shape-not-credential-proof`. Widening is a
  detection decision, explicitly out of scope, and belongs in a contract-spine change with a pin diff.
- **`hardstop.go` reads `aipolicycontract`, so it needs an inertness allowlist entry** — and that test
  runs in no mirrored leg (§H). Run it by hand and paste the result.
- Exercising only known members of a closed set cannot tell a fail-safe allowlist from a fail-open
  denylist (inert-test shape 4). Feed `HardStop` a class **not** in the catalog at all and assert it does
  not fire.

### DO NOT

- Do not write a local literal of the class IDs. The test reads the contract; so does the code.
- Do not add `aws-access-key`, `aws-secret-key`, `high-entropy`, or any class, to the hard-stop set.
- Do not truncate the input silently to hit a latency number. Over the cap is a **stated, counted
  degrade**.
- Do not hard-stop on a Tier-D / candidate / unparsed finding.
- Do not weaken `IsGatingSecretClass` to make the subset test pass; if the subset test fails, the
  hard-stop set is wrong.

**Blast radius:** the only place in the wave that can produce a block the daemon would not have produced.

**Rollback:** `HardStop()` returns a bool; the caller in `cmd/devoid/ai_local_decider.go` can be reverted
to ignore it in one line. The class set is data in a pinned artifact, so an emergency narrowing could be
a pin regeneration - but the honest emergency answer is the one-line caller revert.

- [ ] Failing test first: `TestHardStopFiresOnAParsedPrivateKey` and its twin
      `TestHardStopDoesNotFireOnAPrivateKeyCandidate`. RED: `hardstop.go` does not exist.
- [ ] `TestHardStopSetIsExactlyTheContractSet` asserts `HardStopClassIDs()` deep-equals
      `aipolicycontract.DetectorHardStopEligibleClassIDs()` and that the length is 4. A local literal is
      forbidden; the test reads the contract. **Assert the contract accessor returned a non-empty slice
      first, loudly** - a `SelfCheck` failure makes it empty and two empty slices are equal.
- [ ] `TestHardStopIsASubsetOfIsGatingSecretClass` - for every hard-stop class,
      `dlp.IsGatingSecretClass(class)` is true. This is the blast-radius invariant in executable form.
- [ ] `TestHardStopIgnoresAnUnknownClass` - feed a class id that is in no catalog and assert `false`,
      so the mechanism is proven to be an allowlist rather than a denylist.
- [ ] Bound the scan. `HardStop` scans at most `min(Budgets.MaxInputBytes, fast-path-cap-bytes from
      Task 1)` and considers at most `Budgets.MaxMatches` findings. Beyond the cap the result is
      `inspection: BUDGET_EXCEEDED`, which routes to the failure oracle (`SurfaceRuntimeAdapter`,
      `CheckpointPrePrompt`, `FailureBudgetExceeded`, `ImpactTrustIntegrity`) - **not** to a hard stop
      and **not** to a silent allow.
- [ ] `TestOversizeInputRoutesToTheOracleNotToAHardStop` and
      `TestOversizeInputIsNeverReportedClean`.
- [ ] Add `internal/localdecide/hardstop.go` to `inertness_test.go` with a written reason, and run
      `go test ./internal/aipolicycontract/ -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1`
      by hand. Paste it.

### DEFEAT TEST

**Mutation:** in `internal/localdecide/hardstop.go`, append `"aws-access-key"` to the set returned by
`HardStopClassIDs()` by hand.

**Command:**

```bash
cd <worktree> && go test ./internal/localdecide/ -run TestHardStopSetIsExactlyTheContractSet -count=1
```

**Must print:**

```
hard-stop set has 5 members; the pinned contract declares 4 (extra: aws-access-key)
```

Revert and re-run; must print `ok`. Paste both.

**EXIT:**

```bash
go test ./internal/localdecide/ -run 'TestHardStop|TestOversizeInput' -v -count=1
#   -> all PASS, including TestHardStopIsASubsetOfIsGatingSecretClass and TestHardStopIgnoresAnUnknownClass
go test ./internal/aipolicycontract/ -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1   # ok
```

plus, with the daemon dead on the Windows reference endpoint: a Tier-A PEM private key hard-stops, and a
truncated PEM and an encrypted PEM each do not. Paste all three invocations with their exit codes.

---

## Task 10: The 10,000-run hard-deny stress suite

**Files:**
- new `Installers/scripts/harddeny-stress/main.go` (driver)
- new `Installers/scripts/harddeny-stress/matrix.go` (stress conditions)
- new `Installers/scripts/harddeny-stress/classify.go` (the silent-allow classifier)
- new `Installers/scripts/harddeny-stress/classify_test.go`
- new `Installers/scripts/harddeny-stress/README.md`
- new `Installers/scripts/harddeny-stress/testdata/` (deny fixtures and allow twins)

**Depends on:** Tasks 7, 8 and 9. **Blocks:** Task 11.

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. scripts/ is already a Go-source directory here, so no release artefact grows.
git ls-tree --name-only origin/main scripts/
# expect to include: aicontext-gate  (a Go program under scripts/)

# 2. The instrument the suite reads.
git show origin/main:internal/aihookmetrics/spool.go | sed -n '41p'
# expect: 	SpoolFileName = "ai-hook-outcomes.tsv"

# 3. The transport control fixture.
git show origin/main:internal/aicanary/probe.go | sed -n '40p'
# expect: const ProbeToken = "DEVOID-INTEGRITY-CANARY-DENY-PROBE"

# 4. The Codex exit-code rule this suite must encode.
git ls-tree -r --name-only origin/main internal/airuntime/adapters/codex/testdata/shook/ | head
# expect a deny-matrix fixture directory; STOP AND REPORT if absent

# 5. Tasks 7/8/9 are ancestors of HEAD.
for s in <t7-sha> <t8-sha> <t9-sha>; do git merge-base --is-ancestor $s HEAD && echo "$s in" || echo "$s MISSING"; done
```

**If any precondition fails, STOP AND REPORT.**

### LANDMINES

- **Do not run it on a quiet box.** The live-proof register entry for `hook-lane-prompt-block` carries a
  standing instruction: *"do not close this entry by re-running on a quiet box until a run passes. The
  control's failure mode IS load."*
- **A non-zero exit is a discarded hook on Codex, and the tool runs.** The deny must ride stdout at
  exit 0. Counting a fail-closed deny as a pass without checking the deny reached the runtime is how a
  suite measures the wrong thing.
- **A suite that measures the wrong thing produces a 9.7 that was not earned** — the failure mode §15 of
  the Source of Truth exists to prevent.
- **Allow twins are not optional.** They are what catch a suite that passes by blocking everything.
  Identical size and shape to each deny fixture.
- **A mode with zero runs is a FAILED report, never a silent omission.**
- **`daemon-slow` must use a real delaying loopback listener on the daemon's configured port**, not a
  killed daemon. "The daemon is not answering" and "the daemon is slow" took the same code path before
  the latch and must be measured apart.
- Do not name `neutral-corpus.holdout.jsonl` in `classify_test.go` or `testdata/`.

### DO NOT

- Do not run the suite in-process. Real `devoid ai hook` processes only — the leak was a process-level
  failure and the ~45 ms of exec + loader + Go bootstrap (`RunRequest.ProcessStart`,
  `runner.go:538-548`) is part of the wait being measured.
- Do not conflate a counted non-decision with a silent allow. They are reported separately.
- Do not lower N to make a run finish.
- Do not add any file to `Installers/parity-vectors/` other than the dated report artefact.

**Blast radius:** none on the product - this is a test driver, and `scripts/` is already a Go-source
directory here, so no release artifact grows. The radius is **on the claim**.

**Rollback:** `git rm -r Installers/scripts/harddeny-stress`. Nothing else is touched.

**Definition of a silent allow** - the load-bearing definition of the whole wave, stated as conjunctive,
machine-checkable conditions:

> One invocation is a **silent allow** when, for a fixture whose expected disposition is DENY:
> 1. the process exited 0 **and** its stdout carried no runtime-native deny for that adapter/event
>    (Claude: no deny object; Codex: no deny on stdout at exit 0); **and**
> 2. the `~/.devoid/ai-hook-outcomes.tsv` record for that invocation classifies to `decided` - i.e. the
>    product believes it decided something the runtime never received; **and**
> 3. no `codexfailopen` marker was left behind for it; **and**
> 4. `devoid ai hooks-status` does not name it.
>
> A **counted** non-decision - a bucket other than `decided`, a stderr warning, a left-behind marker - is a
> failure of the suite's *availability* objective and is reported separately as `countedNonDecisions`. It
> is **not** a silent allow. Conflating the two is how "5 of 5 hooks have fired" appeared over eleven
> undecided invocations.

- [ ] Failing test first: `TestSuiteDetectsAnInjectedSilentAllow` - a driver self-test that runs
      `classify.go` against a synthetic transcript where a deny fixture exited 0 with empty stdout and a
      `decided` TSV record, and asserts the run is reported FAILED. **Write this before the driver**: a
      suite that cannot be made red is a suite that is not running.
- [ ] Driver: spawn `devoid ai hook --adapter <a> --event <e>` as a **real process** N times, feeding a
      fixture on stdin, collecting stdout, stderr, exit code, duration and the TSV record.
- [ ] Fixtures, each with an **allow twin** of identical size and shape: `private-key` (Tier-A PEM),
      `aws-credential-pair` (id plus secret), `gcp-service-account` (parsed JSON key),
      `azure-connection-string`, plus the fixed `aicanary.ProbeToken` (`internal/aicanary/probe.go:40`)
      as the transport control.
- [ ] Stress conditions, from strategy §10.1, each a named mode in `matrix.go`: `idle`,
      `cpu-saturation`, `memory-pressure`, `disk-io`, `container-build`, `concurrent-sessions` (N parallel
      hook processes), `daemon-stopped`, `daemon-slow` (a loopback listener that delays 30 s),
      `daemon-401`, `daemon-429`, `daemon-5xx`, `daemon-malformed-body`,
      `daemon-restart-during-decision`, `snapshot-corrupt`, `snapshot-absent`, `snapshot-expired`,
      `clock-skew`, `evidence-spool-full`.
- [ ] Run **both** adapters — `claude-code` and `codex` — across the matrix. One route here has three
      branches and defending one is inert-test shape 3.
- [ ] Distribution: 10,000 consecutive deny operations **per certified surface**, spread across the matrix
      with per-mode counts stated in the report, plus 10,000 allow-twin operations. A mode with zero runs
      is a FAILED report, never a silent omission.
- [ ] Report `harddeny-report.json`: per mode - `denyFixtures`, `denyEnforced`, `silentAllows`,
      `countedNonDecisions`, `allowTwins`, `falseBlocks`, `p50` / `p95` / `p99` decision latency,
      `localDecided`, `daemonDecided`. Exit non-zero if `silentAllows > 0` **or** `falseBlocks > 0`.

### DEFEAT TEST

**Mutation:** set `LocalDecider` to nil in `buildHookRunRequest` (`cmd/devoid/ai.go:948`) — i.e. restore
the pre-fix behaviour.

**Command:**

```bash
cd <worktree> && go run ./scripts/harddeny-stress --mode daemon-slow --n 200 --adapter claude-code
```

**Must print a line containing:**

```
silentAllows=
```

with a non-zero count, and:

```
in mode daemon-slow (want 0); fixture private-key exited 0 with no deny on stdout
```

and must exit non-zero. Revert and re-run; `silentAllows=0` and exit 0. Paste both.

This is the pre-fix behaviour, so the suite must be able to reproduce the original 6-in-10 failure on
demand. **If it cannot, the suite is measuring something else.**

**EXIT:**

```bash
go run ./scripts/harddeny-stress --full --adapter claude-code --adapter codex --report harddeny-report.json
echo "exit=$?"   # expect 0
node -e "const r=require('./harddeny-report.json');
  const tot=Object.values(r.modes).reduce((a,m)=>a+m.denyFixtures,0);
  console.log('deny ops',tot,'silentAllows',r.totals.silentAllows,'falseBlocks',r.totals.falseBlocks);
  for (const k of ['cpu-saturation','container-build','daemon-slow','concurrent-sessions'])
    console.log(k, r.modes[k].denyFixtures);
  for (const [k,m] of Object.entries(r.modes)) if (m.denyFixtures===0) throw new Error('zero-run mode '+k);"
# expect: deny ops >= 10000, silentAllows 0, falseBlocks 0, each of the four named modes >= 500,
#         and no zero-run mode
```

Committed to `Installers/parity-vectors/` as a dated artifact naming the machine, the agent version and
the snapshot revision.

---

## Task 11: Run the suite where it will actually run, and record only what it proved

**Files:**
- `Installers/.github/workflows/pr-checks.yml` (new job `hard-deny-stress`)
- `Ceragon/ci/gates.json` (`repos.Installers.mirrored`)
- `Installers/internal/liveproof/register.json` (the `hook-lane-prompt-block` row)
- `Installers/docs/ai-security/LIVE_PROOF_PROCEDURE.md` (a new section for the stress run)

**Depends on:** Task 10.

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. The trigger set that must not change.
git show origin/main:.github/workflows/pr-checks.yml | sed -n '81,87p'
# expect: on: / workflow_dispatch: {} / schedule: / - cron: '41 7 * * 1'
#   NO pull_request. NO push. Restoring either is forbidden by the file's own comment.

# 2. The mirror is currently clean at 11 legs.
node ci/lib/drift.mjs && echo DRIFT-CLEAN
node -e "const g=require('C:/Users/Owner/Documents/Ceragon/ci/gates.json').repos.Installers;
  console.log('mirrored legs', Object.keys(g.mirrored).length);"
# expect: DRIFT-CLEAN and "mirrored legs 11"

# 3. The register row and its current honest state.
git show origin/main:internal/liveproof/register.json | node -e "let s='';process.stdin.on('data',d=>s+=d)
  .on('end',()=>{const p=JSON.parse(s).proofs;console.log('proofs',p.length,
   '| observed',p.filter(x=>x.observed).length,
   '| hook-lane-prompt-block observed', p.find(x=>x.id==='hook-lane-prompt-block').observed);});"
# expect: proofs 8 | observed 3 | hook-lane-prompt-block observed false

# 4. The precedent for documenting an unmirrorable class.
node -e "const g=require('C:/Users/Owner/Documents/Ceragon/ci/gates.json').repos.Installers;
  console.log('pr-checks:cli-entrypoint-tests in cannotMirror?', 'pr-checks:cli-entrypoint-tests' in g.cannotMirror);"
# expect: true
```

**If any precondition fails, STOP AND REPORT.**

### LANDMINES

- **Do not add a `push` or `pull_request` trigger to `pr-checks.yml`.** The file's own comment records
  the $600 July 2026 decision and forbids it. A job you add without a trigger is a note, not an alarm —
  which is the first of the two ways to get this task wrong, and it is a real hazard here: GitHub
  Actions is blocked org-wide anyway, so a "green" GitHub run means nothing.
- **Do not flip `observed: true` on the strength of a CI run.** `internal/liveproof/liveproof.go`
  requires five evidence fields, and the register's own rule is that the CI pin goes in **after** the
  observation, never instead of it.
- The container cannot reproduce Windows scheduling, the desktop warn dialog, or the SYSTEM/user
  identity split. `ci/gates.json`'s `cannotMirror` block already documents this class for
  `pr-checks:cli-entrypoint-tests` — follow that precedent in the job's own YAML comment.
- Removing a mirrored job later without adding a `cannotMirror` entry makes `drift.mjs` report it as
  unmirrored-and-unexplained. That is the intended loud state; do not silence it by deleting the check.

### DO NOT

- Do not restore `push` or `pull_request` in `pr-checks.yml`.
- Do not set `observed: true` in `register.json` in this task.
- Do not run the CI leg at full N. It is a regression guard at N=1,000.
- Do not remove or edit any other job in `pr-checks.yml`.
- Do not deploy or dispatch anything. Deploying needs a fresh, explicit owner ask every time.

**Blast radius:** two ways to get this wrong, both already produced here. (1) A workflow job that never
runs. (2) A register flag flipped on CI evidence.

**Rollback:** remove the `gates.json` entry and the workflow job **together**, plus a `cannotMirror`
entry if the job stays in the YAML. `node ci/lib/drift.mjs` must be clean after the rollback.

- [ ] Add job `hard-deny-stress` to `pr-checks.yml`, carrying `if: github.event_name != 'schedule'` like
      every other job there, running a **reduced** N (1,000) so a dispatched run is minutes, not hours.
- [ ] Register `"pr-checks:hard-deny-stress": {}` in `ci/gates.json` under `repos.Installers.mirrored`,
      then confirm `node ci/lib/drift.mjs` is clean and `node ci/lib/run.mjs Installers` executes the new
      leg in Docker on `go124`.
- [ ] Document in the job's own YAML comment that the **full** 10,000-run number is a Windows
      reference-endpoint measurement and the Docker leg is a regression guard at reduced N.
- [ ] Add section `5. Hard-deny stress` to `LIVE_PROOF_PROCEDURE.md` describing the Windows run and its
      load generator, so the observation is reproducible by someone who was not here.
- [ ] Update the `hook-lane-prompt-block` quarantine `reason` in `internal/liveproof/register.json` to name
      the fix, the suite and the report artifact. **Do not set `observed: true`** until a Windows run under
      the §4b stub-transport harness with a real Claude Code client blocks a Tier-A private key with the
      daemon under load, and all five evidence fields exist. Extend `reviewBy` only with the new procedure
      named.

### DEFEAT TEST

**Mutation:** add the `hard-deny-stress` job to `pr-checks.yml` and **omit** its key from
`ci/gates.json`.

**Command:**

```bash
cd C:/Users/Owner/Documents/Ceragon && node ci/lib/drift.mjs; echo "exit=$?"
```

**Must print a line containing:**

```
Installers pr-checks:hard-deny-stress is neither mirrored nor explained
```

and exit non-zero. Add the `gates.json` entry and re-run; must be clean and exit 0. Paste both.

**EXIT:**

```bash
node ci/lib/drift.mjs && echo DRIFT-CLEAN
node -e "console.log('legs',Object.keys(require('C:/Users/Owner/Documents/Ceragon/ci/gates.json').repos.Installers.mirrored).length)"
# expect: legs 12   (was 11)
node ci/lib/run.mjs Installers
# expect: 12 legs run; hard-deny-stress passes at N=1,000 with silentAllows: 0
node -e "const p=require('./Installers/internal/liveproof/register.json').proofs.find(x=>x.id==='hook-lane-prompt-block');
  console.log('reason names the suite?', /harddeny-stress|harddeny-report/.test(p.reason), '| observed', p.observed);"
# expect: reason names the suite? true | observed <whatever the Windows run honestly earned>
```

---

## Task 12: The session dimension — produce it, and keep it out of the identity key

> **Ownership, stated because the reconciliation found it unowned.** Wave 8 declares
> `session-dimension-unavailable` and assigns the dimension to "the wave that owns runtime identity
> (Workstream 1)" — i.e. here. It was absent from this file. It is **one of the two things blocking
> `PREVENTION_ACTIVE`** (the other is WFP direct-egress denial, owned by Wave 3 Task 6), so silence
> would leave a scorecard row with no owner. **Wave 1 owns the producer and the wire field. Wave 8
> Task 6 owns retiring the `session-dimension-unavailable` reason once this lands.** Neither half is
> unowned any more.

**Files:**
- `Installers/internal/controls/attestation.go` (the `runtimeAdapters[]` report, mirror block at `:369+`;
  the binding struct at `:578-580` and its `IsBareSha256` gate at `:1105-1112`)
- `Installers/internal/daemon/ai_handlers.go` (the per-session fire record already keyed by
  `ClientSessionID` — `recordHookFire` at `:1190`)
- `Backend/src/ai-governance/runtime-adapter-shape.ts` (a new **non-binding** block + its field-by-field
  rebuild)
- `Backend/src/health/types/heartbeat.types.ts` (documentation only)

**Depends on:** Wave 8 Task 5 merged **and deployed**; Task 8 of this wave (same wire surface, same
ordering rule). **Phase 5.**

### PRECONDITIONS

```bash
git -C <worktree> fetch origin && git -C <worktree> rev-parse origin/main
# expect: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

# 1. Wave 8 Task 5 merged AND DEPLOYED. Do NOT take this on anyone's word - it is the ordering rule
#    whose violation is SILENT (AgentIngestValidationPipe drops unknown keys rather than rejecting
#    them), so a wrong answer here produces no error, no data, and a console that looks correct.
#    a) what commit is actually serving production right now:
aws ecs describe-task-definition --task-definition backend --region eu-north-1   --query 'taskDefinition.containerDefinitions[0].image' --output text
#       -> ...amazonaws.com/backend:<sha>   ; take <sha>
#    b) does THAT commit carry W8 T5's migration and its drop counter?
git -C <backend> fetch origin --quiet
git -C <backend> ls-tree -r --name-only <sha> -- src/migrations | grep -c 'AddRuntimeAdapterFieldDropsToControlState'
#       expect: 1
git -C <backend> show <sha>:src/ai-governance/runtime-adapter-shape.ts | grep -c 'recordAgentWireDrift'
#       expect: >= 1
#    If either is 0, W8 T5 is not deployed no matter what anyone says. STOP AND REPORT.

# 2. The binding has no session dimension today, and its identity dims are documented.
git -C <backend> show origin/main:src/ai-governance/runtime-adapter-shape.ts | sed -n '73p;106,114p'
# expect:  export interface RuntimeBindingShape {
#          and a comment: "These participate in `runtimeInstanceId`." naming principalHash,
#          launchOrigin, configRootHash — and NOTHING session-scoped.

# 3. The Go mirror and its content-free gate.
git show origin/main:internal/controls/attestation.go | sed -n '578,580p;1105,1112p'
# expect: PrincipalHash / LaunchOrigin / ConfigRootHash json tags, gated by IsBareSha256

# 4. A session identifier already reaches the daemon on every hook body.
git show origin/main:internal/daemon/ai_handlers.go | sed -n '661p;1190p'
# expect:  	ClientSessionID string `json:"clientSessionId,omitempty"`
#          	s.recordHookFire(promptFireRuntime, CheckpointUserPromptSubmit, body.ClientSessionID)

# 5. The rebuild that decides whether a new key survives.
git -C <backend> show origin/main:src/ai-governance/runtime-adapter-shape.ts | grep -n "never spread"
# expect: a comment stating every field is rebuilt explicitly, never spread
```

**If any precondition fails, STOP AND REPORT.**

### LANDMINES

- **The session dimension must NOT participate in `runtimeInstanceId`.** `RuntimeBindingShape`'s own
  comment (`runtime-adapter-shape.ts:106-110`) says the mutable dims "deliberately do NOT: a change
  there must show as DRIFT ON THE SAME instance, never as a new row." A session-scoped value in the
  identity key re-keys every existing row and turns yesterday's one instance into today's many — the
  exact failure `stableIdentity` was introduced to prevent. **Put the dimension in its own block, not on
  `RuntimeBindingShape`**, so it is out of the key by construction rather than by convention.
- **Widening an agent-wire contract requires the Backend deployed FIRST.**
  `AgentIngestValidationPipe` DROPS unknown keys rather than rejecting them
  (`Backend/src/common/pipes/agent-ingest-validation.pipe.ts:20-21`), so the reverse order loses the
  field silently. Same rule, same reason, same outage history as Task 8.
- **Adding the field to `RuntimeAdapterReportDto` changes nothing** — its decorators never execute. The
  gate is the explicit rebuild in `runtime-adapter-shape.ts`.
- **Content-free or it does not ship.** A session id is a correlation handle, not an identifier to
  publish. Emit a **bare SHA-256** and gate it with `IsBareSha256` exactly as `principalHash` and
  `configRootHash` are gated at `attestation.go:1105-1112`. Never the raw id, never a path, never a
  prompt.
- **This task writes nothing to disk on the endpoint.** If a design appears to need a new file or
  directory under the machine root, **stop**: `boundaryChildNames` in
  `Installers/cmd/devoid-msi-root-guard/guard_windows.go` must gain the entry in the SAME COMMIT, or the
  next MSI operation dies 1722 -> 1603 and rolls back the upgrade on every **enrolled** endpoint while
  every clean-box test stays green. Three occurrences so far: `.staging`, `aitrust`,
  `endpoint-identity.json`.
- **Do not make `PREVENTION_ACTIVE` reachable by softening a reason.** This task retires
  `session-dimension-unavailable` by **supplying the missing fact**, and only Wave 8 Task 6 removes the
  reason. Emitting the field and also deleting the reason in one change removes the ability to tell
  whether the field arrived.

### DO NOT

- Do not add any field to `RuntimeBindingShape`.
- Do not change `runtimeInstanceId`'s inputs or its computation.
- Do not emit a raw session identifier, ever.
- Do not release an agent that emits the field before the Backend change is deployed.
- Do not edit Wave 8's posture reason list from this task.

**Blast radius:** one additive, non-identity block on the heartbeat, with two failure modes: a silent
field loss in the wrong deploy order (Task 8's landmine, same mechanism), and — far worse — an identity
re-key if the dimension lands on `RuntimeBindingShape`. The second would split every endpoint's history
into new rows and is the reason the defeat test below asserts `runtimeInstanceId` is byte-identical.

**Rollback:** additive on both sides. Removing it from the agent is safe at any time; removing it from
the Backend while agents still send it is safe because the rebuild drops unknown keys. No migration,
because no existing key changes — which is exactly what the defeat test proves.

- [ ] Failing test first, Backend: `runtime-adapter-shape.session-dimension.spec.ts` —
      `it('does not change runtimeInstanceId when a session dimension is present')`. Build one report
      with the block and one without, assert `runtimeInstanceId` is **identical**. RED: the block is
      dropped, so the test is vacuous until the rebuild knows it — assert the block survived first,
      loudly.
- [ ] Backend: add `sessionDimension?: { observedSessions: number; sessionScopeHash?: string | null }`
      as its own key on the adapter report shape — **not** on `RuntimeBindingShape` — and rebuild it
      field by field in the same style as `normalizeRuntimeAdapterUndecidable`. `sessionScopeHash` is
      accepted only when `isIntegrityBareSha256` passes; anything else reads as absent.
- [ ] Backend: document in `heartbeat.types.ts` that this block is **excluded from
      `runtimeInstanceId`** and why, with a pinning test so the comment cannot go stale.
- [ ] **Deploy the Backend.** Requires a fresh, explicit owner ask. Merging is not deploying.
- [ ] Agent: emit `sessionDimension.observedSessions` from the per-session fire records the daemon
      already keeps (`recordHookFire(..., body.ClientSessionID)` at `ai_handlers.go:1190`), and
      `sessionScopeHash` as a bare SHA-256 of the client session id, gated by `IsBareSha256` in
      `internal/controls/attestation.go` beside `PrincipalHash`.
- [ ] `TestSessionDimensionIsContentFree` — assert the emitted block matches `^[0-9a-f]{64}$` for the
      hash and contains no substring of the raw session id.
- [ ] `TestSessionDimensionIsNotOnTheBinding` — a Go assertion that the binding struct
      (`attestation.go:578-580` block) gained no field, so a later refactor cannot quietly move it.

### DEFEAT TEST

**Mutation:** move `sessionScopeHash` onto `RuntimeBindingShape` and include it in the
`runtimeInstanceId` inputs.

**Command:**

```bash
cd <backend> && npx jest src/ai-governance/runtime-adapter-shape.session-dimension.spec.ts -t runtimeInstanceId
```

**Must print a line containing:**

```
runtimeInstanceId changed when a session dimension was added: every existing endpoint row would re-key
```

Second mutation, for the content-free half: emit the raw `ClientSessionID` instead of its SHA-256.

```bash
cd <worktree> && go test ./internal/controls/ -run TestSessionDimensionIsContentFree -count=1
```

**Must print a line containing:** `sessionScopeHash is not a bare sha256`

Revert both and re-run; both green. Paste all four runs.

**EXIT:**

```bash
# 1. Identity is unchanged.
cd <backend> && npx jest src/ai-governance/runtime-adapter-shape.session-dimension.spec.ts   # green

# 2. Agent side is content-free.
go test ./internal/controls/ -run 'TestSessionDimension' -count=1                            # ok

# 3. The field reaches the database, proven by a row and not by the agent's log.
psql "$DATABASE_URL" -c "select controls->'runtimeAdapters'->0->'sessionDimension'->>'observedSessions' \
  from endpoint_control_state where endpoint_id = '<id>';"
#   must return a non-null integer

# 4. The identity key did not move for that endpoint.
psql "$DATABASE_URL" -c "select count(distinct controls->'runtimeAdapters'->0->'binding'->>'runtimeInstanceId') \
  from endpoint_control_state where endpoint_id = '<id>';"
#   must return 1
```

Wave 8 Task 6 may then retire `session-dimension-unavailable` — **in a separate change**, so the two
facts stay separable.

---

## Wave exit criteria

1. **Zero silent allows over 10,000 consecutive hard-deny operations per certified surface**, under a
   stress matrix in which `cpu-saturation`, `container-build`, `daemon-slow` and `concurrent-sessions`
   each carry >= 500 runs. Artifact: `harddeny-report.json` with `silentAllows: 0`. Defeat test:
   `TestSuiteDetectsAnInjectedSilentAllow` (Task 10).
2. **Zero false blocks over 10,000 allow twins** in the same run. Same artifact, `falseBlocks: 0`. Defeat
   test: the allow-twin half of `TestSuiteDetectsAnInjectedSilentAllow`.
3. **A hard deny is reachable with the daemon stopped.**
   `devoid ai hook --adapter claude-code --event USER_PROMPT_SUBMIT` with a Tier-A PEM on stdin and no
   daemon emits the Claude deny on stdout at exit 0. Defeat test:
   `TestBudgetExpiryAnswersFromTheLocalDecider` (Task 7).
4. **The inline hard-stop set is exactly the four pinned classes and is a strict subset of the daemon's
   existing conclusive-secret floor.** Defeat tests: `TestHardStopSetIsExactlyTheContractSet` and
   `TestHardStopIsASubsetOfIsGatingSecretClass` (Task 9).
5. **The extraction changed no decision.** 167+ shared-corpus cases deep-equal between the pre-existing
   daemon function and `localdecide.Prompt`, over the whole `policyeval.Decision`, not just the verdict.
   Defeat test: `TestCoreMatchesTheDaemonOverTheSharedCorpora` (Task 6).
6. **An unreadable snapshot declines rather than denies.** Defeat test:
   `TestLocalDeciderDeclinesOnAnUnreadableSnapshot` (Task 7). No new fail-closed branch exists on a
   condition the endpoint cannot prove.
7. **Every undecided invocation remains a visible failure state, and a locally decided one is
   distinguishable from a daemon-decided one.** `devoid doctor` prints the snapshot state and the
   local/daemon split, and the counter is proven by a database row. Defeat test:
   `TestDrainRejectsAV1LineWithoutMisparsingIt` (Task 8).
8. **One normalized event replays identically across the hook runner, the provider gateway and the offline
   harness.** Defeat test: `TestHookAndGatewayCapturesAreIdenticalForTheSameInput` (Task 4).
9. **The runtime-adapter vocabulary is bound to the pinned artifact, and an unknown contract version
   fails explicitly.** Defeat test: `TestRuntimeAdapterTuplesMatchThePinnedContract` (Task 2), whose
   mutation is GREEN on the existing three-way pin and RED on the new one; the explicit-failure half is
   the existing `SelfCheck` -> `BootSignedAuthority` -> `Contain` path, which already covers the
   artifact and needs no extension.
10. **The latency claim is a measured number, not the strategy's proposal.**
    `LOCAL_DECISION_BASELINE.md` names the fast-path cap, the full-depth cap and the measured snapshot
    load+verify p95, and Tasks 7 and 9 use those numbers. Defeat test:
    `TestBaselineDocumentMatchesTheBenchmarkNames` (Task 1).
11. **The suite runs without anyone remembering to run it.** `node ci/lib/drift.mjs` clean and
    `node ci/lib/run.mjs Installers` executes 12 mirrored legs. Defeat test: the drift checker itself
    (Task 11).
12. **The session dimension exists, is content-free, and did not re-key any endpoint.** Defeat test:
    the `runtimeInstanceId`-stability half of Task 12. This closes one of the two things blocking
    `PREVENTION_ACTIVE`; the other is Wave 3 Task 6's WFP direct-egress denial.

### Ordering within this wave

1. **Task 1 (measure) before Tasks 7 and 9.** The only throughput figure on record — `dlp.ScanEx` at
   0.71 MB/s — buys about 35 KB inside 50 ms while the spine's own `maxInputBytes` is 65536. Neither
   later task may invent its own cap.
2. **Task 3 before Tasks 4 and 9.** Both read the projected budgets.
3. **Task 5 before Task 7.** The adapter cannot decide without a snapshot reader.
4. **Task 6 -> Task 7 -> Task 9, strictly.** Route the daemon through the extracted core while it is the
   only caller and the largest test surface in the repository covers it; only then add the second
   caller; only then add the one branch that can produce a block the daemon would not.
5. **Tasks 7, 8, 9 before Task 10; Task 10 before Task 11.**
6. **Task 2 is independent of all of the above** and can land at any point. It blocks nothing.

### Deploy ordering for this wave

- **Wave 8 Task 5 is the first Backend change in the entire programme** — ahead of this wave's Task 8
  and Task 12, ahead of Wave 4 Task 12, ahead of Wave 8 Task 8. Until it lands, an ordering mistake on
  any of those produces no error, no data, and a console that looks correct.
- Task 8 adds heartbeat counters and Task 12 adds a session-dimension block. **Backend deploys first for
  both.** `AgentIngestValidationPipe` sets `forbidNonWhitelisted: false` for agent DTOs, so it drops
  unknown keys rather than 400ing; an agent released first loses the fields silently and the gap looks
  like a working deploy. The enforcing boundary on the Backend is the field-by-field rebuild in
  `src/ai-governance/runtime-adapter-shape.ts`, **not** the DTO — a field added only to
  `RuntimeAdapterReportDto` is dropped, because that class's decorators never execute.
- Tasks 1-7 and 9-11 are agent-only and touch no Backend contract.
- **Deploying anything requires a fresh explicit owner ask.** A green local run is not permission, and
  merging is not deploying.

---

## What this wave deliberately does NOT do

- **It does not change the answer for `INTERVENTION_UNAVAILABLE`.**
  `cmd/devoid/ai_failure_resolver.go:93-96` still returns `FailClosed: false`, and
  `governanceFailClosed` (`:240`) still always returns false. Reversing that is what stopped a
  workstation on 2026-07-31 and got the agent uninstalled. The wave makes that branch **rarer**, not
  stricter.
- **It does not raise or lower the 4-second decision budget or the 60-second host hook timeout.** The
  strategy is explicit that a larger timeout only makes the user wait longer before the same fail-open.
  `internal/aihooks/settings.go:88-113` also documents that 60 is the runtime-integrity projection's own
  `maxHookTimeoutSeconds`, and that a faster per-event tool gate requires teaching that projection to
  attest a timeout map - a deliberate change to what the canary attests, not a side effect of this wave.
- **It does not widen the hard-stop set beyond the four pinned classes**, and specifically does not add
  `aws-access-key` - the class the 2026-08-26 campaign found unblocked. The spine's own rationale is
  `identifier-shape-not-credential-proof` and its `eligibleEvidenceTiers` is empty. Widening it is a
  detection decision, explicitly out of the strategy's scope, and belongs in a contract-spine change with
  a pin diff, not here.
- **It does not build a second policy engine.** `localdecide` is an extraction of the shipped one, proven
  equal over the shared corpora before anything new consumes it. A second engine is how the Go/JS parity
  problem got created once already.
- **It does not build a second runtime-adapter vocabulary artifact.** The tuples already ship inside
  `Installers` at `internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json`
  (`v1Policy.orderedTuples`), digest-pinned and `SelfCheck()`-verified. Task 2 adds an assertion, not an
  artifact. A second artifact carrying the same vocabulary would give the endpoint two answers.
- **It does not invent a new snapshot file, a new atomic-swap protocol, or a new signing chain.**
  `activated-policy-pair.json` already is an immutable, atomically-committed, digest-verified generation.
  A second one would give the endpoint two answers.
- **It does not create any new entry under the machine root.** No task in this wave writes a new file or
  directory under `%ProgramData%\devoid`, so `boundaryChildNames` in
  `cmd/devoid-msi-root-guard/guard_windows.go` is untouched. If a task ever appears to need one, that is
  a stop-and-report, not an edit: the guard runs from the MSI Binary table with `Return="check"`, so an
  unknown entry is 1722 -> 1603 and the upgrade rolls back on every **enrolled** endpoint while every
  clean-box matrix stays green. It has fired three times (`.staging`, `aitrust`,
  `endpoint-identity.json`).
- **It does not make the local snapshot readable on POSIX machine installs.** The trust files are `0o600`
  root-owned by design (`internal/aikeystore/harden_other.go:11`) and changing that weakens an existing
  guard. On those installs the hook degrades to the built-in floor, which is stricter than a configured
  policy. Changing the POSIX ACL model belongs with the service/broker work.
- **It does not touch the Codex dialect pin.** `internal/codexmanaged/hookdialect.go:99-115,161-166`
  answers no for 0.145 / 0.146 / 0.148 / 0.149-alpha, and the Source of Truth's C1 note is explicit: do
  not widen without two vendor artefacts per family. Codex coverage is a different wave.
- **It does not fix the canary receipt sink or the canary exec timeout.** The nil-sink failure path is
  `internal/airuntimeintegrity/providers/claude/canary.go:55-59` (`errNoReceiptSink`) and `:333-345`
  (`emitReceipt`), and `Receipts:` is assigned in exactly four **test** files —
  `internal/airuntimeintegrity/maintenance_test.go:64`, `internal/codexmanaged/canary_host_test.go:289`,
  `canary_live_test.go:74`, `canary_test.go:111` — and nowhere in production. The hard-coded 5-second
  `cmd.WaitDelay` at `internal/aicanary/exec.go:125` that classifies a real deny as a launch failure is
  also untouched. Both are proof-lane defects owned by Wave 6; this wave's gate is the stress suite, not
  the canary.
- **It does not attempt the strategy's 99.999% decision-availability number.** With a population of one
  reference endpoint, five nines is unmeasurable - distinguishing it from four nines needs roughly 10^5 to
  10^6 observations. The honest substitute is the 10,000-run zero-silent-allow gate plus a fleet-wide
  `localDecided` / `daemonUnreachable` ratio from Task 8's counters, and the availability figure should be
  claimed only once fleet telemetry exists.
- **It does not claim the p95 <= 50 ms target is met.** The only throughput figure on record is
  `dlp.ScanEx` at 0.71 MB/s, which buys about 35 KB inside 50 ms, while the spine's own per-class
  `maxInputBytes` is 65536. Task 1 measures it; if the number is not reachable, the wave carries the
  measured number and states the cap rather than quietly truncating the scan to hit a latency figure.
  §10.2 permits adjusting latency; it does not permit adjusting zero-silent-allow.
- **It does not own the production-authority-chain convergence.** Every live-proof artefact in this wave
  is a local-rig or reference-endpoint measurement. No control in this product has been observed against
  the production signing, policy and evidence chain, and no wave in this plan owns that. It is a required
  clause of two scorecard rows and it is stated here as unowned rather than left implied.
