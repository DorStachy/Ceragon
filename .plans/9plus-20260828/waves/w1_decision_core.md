# Wave 1 - Decide locally, and freeze the socket the brain plugs into

**Scorecard rows this moves:** Reliability of reaching the decision engine 3.0 -> 9.7; Ability to plug in a detection brain 8.0 -> 9.6
**Depends on:** nothing
**Phase:** 0 (Tasks 1-4) and 1 (Tasks 5-11)

All paths are stated with their component name; this is a workspace, not a monorepo.
Everything below was read at `Installers` `origin/main` = `5b129523` and `Backend` `origin/main` = `0cf9021e`.
The working checkouts here are behind those commits (`Installers` HEAD is `8e49a625`, which does not
even contain `internal/airuntime`), so **read the code with `git show origin/main:<path>` or from a
fresh worktree at `5b129523`, never from the checked-out tree**. Every line number below is at
`origin/main`.

---

## What exists today

### A. The measured failure, and the exact three lines that produce it

The 6-in-10 private-key leak is not a missing feature. It is three collaborating lines that are each
individually correct:

1. `Installers/internal/airuntime/runner.go:52` - `HookDecisionBudget = 4 * time.Second`, the
   wall-clock bound on the daemon round trip.
2. `Installers/internal/airuntime/runner.go:925-940` - on expiry the runner calls
   `failGating(adapter, adapterID, event, ReasonDecisionBudgetExpired)`.
3. `Installers/cmd/devoid/ai_failure_resolver.go` - `governanceFailureResolver.ResolveHookFailure`
   returns `FailureResolution{FailClosed: false, ReasonSuffix: "daemon-unreachable-proceed"}` for
   `HookFailureInterventionUnavailable`.

Step 3 is **correct and must not be reverted**. Its own comment records the 2026-07-31 incident:
failing that branch closed denied every tool call on a stock endpoint whose daemon was restarting,
made a workstation unusable, and the operator uninstalled the agent. `internal/aiguard` classifies
any AI-agent context as strict, so the fail-closed branch was always the live one. The same file
also records why `EMPTY_PAYLOAD` and `INDETERMINATE_SHAPE` proceed. **This wave does not touch that
resolver's answer for `INTERVENTION_UNAVAILABLE`.** It removes the need to ask it, by answering the
decision locally before the budget can expire.

The decision latch (`Installers/internal/airuntime/decision_latch.go`) already fixed the adjacent
bug - a verdict that exists is never discarded - and its own header states what it does not fix:
"an expiry with an EMPTY latch takes exactly the path it takes today."

The counting is already correct and already wired:
`Installers/internal/airuntime/undecidable.go:64` defines `BucketDaemonUnreachable`,
`undecidable.go:127 UndecidableBucketFor` files a budget expiry there by prefix match, and
`Installers/internal/aihookmetrics/spool.go` appends one content-free TSV record per invocation to
`~/.devoid/ai-hook-outcomes.tsv`. This is the file that recorded
`{"total":11,"byReason":{"daemon-unreachable-budget-expired":11}}` during the leak window. **The
instrument the 10,000-run gate needs already exists and already works.**

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
pure (`internal/dlp/private_key.go:16-18`). The non-wire twin,
`ai_handlers.go:2418 scanAndDecideWithPolicy`, is a method **only** because of one call to the
package-global `aiPolicy.currentForDecision(...)` at the end.

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
both the SYSTEM writer and the user-identity reader** (`%ProgramData%\devoid\aitrust` on Windows),
precisely because a per-identity path had already split reader from writer once. On Windows machine
scope the files carry the canonical `winacl.HardenMachineLocalRead` DACL - LocalSystem/Administrators
write, `BUILTIN\Users` **read** (`internal/aikeystore/harden_windows.go:18-38`).

`cmd/devoid/upgrade_activation_floor.go:94-111` already proves the CLI-side read path works
(`aikeystore.ResolveStoreLocation()` then `aikeystore.NewFileStore(loc.Dir, loc.Machine())`).

Verification of a stored pair is `internal/daemon/ai_policy_authority.go:527 verifyStoredPair`, a
package-level function: signature under the pinned root, envelope identity against the record's index
fields, `DigestCanonicalJSON(pair.PolicyBody)` against the signed legacy-projection digest, chain
link, then `json.Unmarshal(pair.PolicyBody, &backend.AiPolicy{})`.

**There is nothing to invent here.** The snapshot, its generation identity, its atomicity and its
verifier all exist. What is absent is a reader in the hook process.

Two boundaries this creates, both of which must be stated rather than papered over:

- **POSIX machine installs cannot read it.** `internal/aikeystore/harden_other.go` chmods trust files
  to `0600` and `NewFileStore` creates the directory `0700`, both owned by the root daemon. A
  user-run hook on a Linux/macOS system install gets a permission error, not a snapshot. The
  strategy's certified boundary (§2.1) is enterprise-managed Windows, so this is scope-consistent,
  but the plan must degrade there, not fail there.
- **The unsigned legacy mirror is useless to the hook.** `internal/daemon/ai_policy_store.go`
  persists `~/.devoid/ai-policy.json` at `0600` **in the daemon's own profile**, which on a Windows
  SYSTEM install is `C:\Windows\System32\config\systemprofile\.devoid`. The hook cannot read it and
  must not try. Unsigned endpoints fall through to the built-in floor, which §6.3 of the Source of
  Truth establishes is *stricter* than a configured policy, not looser.

### D. The hard-stop set is already frozen, already digest-pinned, and has zero production callers

`Installers/internal/aipolicycontract/detector_catalog_generated.go` is generated from
`embedded/0.7.0/contract-spine.v3.jcs.json` and pinned by
`internal/aipolicycontract/detector-catalog-consumer-pin.v1.json`
(`sha256:b252ee02...`, `classCount: 55`, `hardStopEligibleClassCount: 4`,
`runtimeActivatable: false`, `productionWriterEnabled: false`).

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
`internal/policyeval/shadow.go:47,81` (lifecycle only) and `cmd/ai-security-neutral/holdout.go`.
`DetectorHardStopEligibleClassIDs` has **no caller at all outside its own package**. This is a
Source-of-Truth §16 shape: built, pinned, inert.

The spine also already carries, per class, the two fields the inline core needs and the generated Go
projection currently drops: `budgets` (`maxInputBytes`, `maxMatches`, `maxDecodeDepth` -
`65536 / 16 / 1` for `private-key`) and `defaults` (`recommended` / `restricted` / `unsupported`).

A **wider** conclusive-secret set already gates in production:
`internal/dlp/dlp.go:1376 IsGatingSecretClass` (confidence >= 88, 20 classes), consumed at
`internal/daemon/ai_handlers.go:1399` where `secretFloorApplies && hasGatingSecretFinding(...)` turns
a WARN into `noninteractive-secret:block`. The four-class hard-stop set is a **strict subset** of
that twenty. That subset relation is the blast-radius argument for the whole wave: an inline answer
restricted to those four can only ever convert a leak into a block the daemon would already have
produced had it been reached. It can never invent a block the daemon would not make.

### E. The replay envelope exists, is a real CLI, and is inert by declaration

`Installers/internal/neutraleval` is the canonical, privacy-safe replay envelope Workstream 1
describes. `contract.go` declares `ContractVersion = "0.7.0"`, `FormatVersion = 2`,
`RuntimeActivatable = false`, `V2WriterEligible = false`; `digest.go` computes a JCS semantic digest
and a result digest; `runner.go Run(entry, options)` executes the shipping modules (`dlp`,
`promptrisk`, `policyeval`) and refuses input whose bytes do not match `case.input.artifactDigest`.

The driver is `Installers/cmd/ai-security-neutral` (`--input` / `--corpus` / `--report`), and the
corpora are committed:

| corpus | cases | sealed? |
|---|---:|---|
| `parity-vectors/neutral/neutral-corpus.all.jsonl` | 158 | no |
| `parity-vectors/neutral/neutral-corpus.shared.jsonl` | 150 | no |
| `parity-vectors/neutral/neutral-corpus.ingress.jsonl` | 28 | no |
| `parity-vectors/neutral/neutral-corpus.holdout.jsonl` | 39 | **yes** |
| `parity-vectors/policyeval-decision.json` | 17 | no |

`internal/neutraleval/holdout_seal_test.go` mechanically forbids any `*_test.go` or `*.test.mjs` in
the repository from naming `neutral-corpus.holdout.jsonl`. **Any new test in this wave must use
`shared` / `ingress` / `policyeval-decision`, never the holdout.** The holdout is scored post-merge
and nightly by `.github/workflows/holdout-score.yml`.

What is missing for Workstream 1's exit gate is the **producer**: no live path - not the hook runner,
not the provider gateway - ever emits a `neutraleval.Entry`. The importers of `internal/neutraleval`
at `origin/main` are `cmd/ai-security-holdout-seed`, `cmd/ai-security-neutral`, and one dlp test. So
the same normalized event cannot yet be replayed across the hook runner, the gateway and the offline
harness; only the harness exists.

### F. What is frozen in Workstream 1's contract, and what only looks frozen

**Genuinely frozen, with a machine-checked cross-repo edge:**

- The portable policy contract 0.5.0: `internal/aipolicycontract/consumer-pin.v1.json` pins artifact
  bytes and sha256, source commit `93bf85b6...`, `runtimeActivatable: true`, `v2WriterEnabled: true`,
  generated from `Backend/packages/shared-contracts/generated/ai-security/0.5.0/`.
  `contract.go SelfCheck()` verifies the embedded bytes against the pin before anything trusts
  activation metadata; `internal/daemon/ai_policy_authority.go:614 BootSignedAuthority` calls it
  first and **contains** the endpoint if it fails.
- The detector catalog 0.7.0 spine: pin above, plus `detectorcataloggen` regeneration.
- The 882-row F01 failure oracle: `internal/failureoracle/failureoracle.go` reads its rows **through**
  `aipolicycontract.FailureOracleCatalogJSON()`; a missing, malformed or duplicate-key catalog yields
  a nil index and `Resolve` denies everything with `failure-oracle:catalog-unavailable`.
  Closed-world, no generic default, no silent allow.
- The signed-bundle parity corpus: `internal/policybundle/parity_corpus.go` loads
  `testdata/policy-bundle-v2`, which ships **byte-identically** as
  `Backend/packages/shared-contracts/fixtures/policy-bundle-v2`; 24 accept/reject cases minted from
  the real Backend issuance path.
- `internal/aipolicycontract/inertness_test.go` maintains a named importer allowlist. Every new file
  that reads the contract must be added there with a written reason - it is the audit surface for
  "who may make an activation decision".

**Looks frozen and is not:** the runtime-adapter vocabulary. `internal/airuntime/vocab.go:17-25`
says the tuples are "conforms-BY-CONVENTION mirrors" of
`Backend/packages/shared-contracts/src/runtime-adapter-contract.ts`, pinned "three-way" by
`internal/airuntime/vocab_parity_test.go`. Reading that test: the expected tuples are **hand-typed Go
literals** and the test explicitly declines to read the `.ts` file ("a path read would couple two
repos"). On the Backend side, `Backend/src/ai-governance/ai-governance-contract.parity.spec.ts`
regex-extracts the TS unions and compares them to a TS snapshot. So there are two independent two-way
pins and **no edge between them**: append a member to `CANONICAL_HOOK_EVENTS` or
`ENFORCEMENT_EFFECTS` in TypeScript and every Go test stays green. The spine v3 does not carry these
tuples either - its `orderedTuples` key holds only `AI_CREDENTIAL_ROLES`, `AI_EVIDENCE_TIERS`,
`AI_EXPLOITABILITY_STATES`.

### G. Genuinely absent

1. Any reader of the activated policy pair in the hook process.
2. Any local decision in the hook process. Every gating lane in `cmd/devoid/ai_hook_runner.go`
   (`executeUserPromptSubmit:489`, `executePreToolUse:771`, `executePermissionRequest:1547`) posts to
   loopback and has no fallback but the ungoverned proceed.
3. A named terminal for "the local snapshot is absent / stale / unreadable". Today an absent policy is
   simply `nil` and nothing distinguishes it from "not yet fetched".
4. A producer for `neutraleval` on any live path.
5. A stress harness of any kind. `Installers/scripts/` holds `egress-adversarial-matrix-e2e.sh`,
   `proxy-redteam-docker-e2e.sh`, `aicontext-e2e/` - no load driver, no concurrency driver, and no
   repeat driver for `devoid ai hook`.
6. A cross-repo edge for the runtime-adapter vocabulary (F above).
7. Any measurement of what a local decision actually costs. The only throughput number on record is
   `internal/aicontext/scan_secrets_scale.go:77-78` - **`dlp.ScanEx` at 352.8 ms per 256 KiB window =
   0.71 MB/s**, and `dlp.ScanHexAtRest` at 10.82 MB/s. At 0.71 MB/s a 50 ms budget buys roughly
   **36 KiB of prompt**, and the spine's own per-class `maxInputBytes` is 65536. The strategy's
   "p95 <= 50 ms" is therefore **not obviously reachable at full depth on a large prompt**, and Task 1
   exists because no plan should be built on the assumption that it is.

### H. What CI can and cannot run

`Installers/.github/workflows/pr-checks.yml` has `on: workflow_dispatch` plus a **weekly Monday 07:41
cron**, and every job except `codex-hook-lane-live-proof` carries
`if: github.event_name != 'schedule'`. The `pull_request` and `push` triggers were deliberately
removed on 2026-08-25 (the $600 July bill) and the file's own comment forbids restoring them. GitHub
Actions is additionally blocked org-wide on the Free-plan spending limit - jobs die in ~4 s with no
runner - so a red GitHub run currently means nothing.

The real gate is the local Docker mirror. `Ceragon/ci/gates.json` -> `repos.Installers.mirrored` lists
11 mirrored legs (`pr-checks:*`, `holdout-score:score`, `finding-b-e2e:shim-enforcement`) on image
`go124`, and `ci/lib/run.mjs` reads the commands **straight out of the workflow YAML**. So the way to
make a new suite run is: add the job to `pr-checks.yml`, then register its key in `ci/gates.json`.
`node ci/lib/drift.mjs` fails if a workflow job exists that `gates.json` neither mirrors nor explains.

---

## Task 1: Measure what a local decision actually costs, before designing around a number

**Files:**
- new `Installers/internal/localdecide/baseline_bench_test.go` (the package is created empty in this
  task; only the benchmark lands here)
- new `Installers/docs/ai-security/LOCAL_DECISION_BASELINE.md` (the recorded artifact)
- reads `Installers/internal/dlp`, `internal/promptrisk`, `internal/policyeval`, `internal/aikeystore`,
  `internal/policybundle`, `internal/aipolicycontract`

**Blast radius:** none - a benchmark and a document. Nothing on any decision path changes. The risk of
*skipping* it is the real one: the strategy proposes p95 <= 50 ms, the only measured detector
throughput on record is 0.71 MB/s, and a plan that assumes 50 ms is achievable and then discovers it
is not will either miss the gate or quietly widen the input cap to hit a latency number.

**Rollback:** delete the benchmark file and the document.

- [ ] Write `BenchmarkPromptDecisionPure` over prompt sizes 1 KiB / 4 KiB / 16 KiB / 64 KiB / 256 KiB,
      timing `dlp.ScanAll(text)` + `promptrisk.Scan(text)` + `policyeval.DecideScan(...)` with (a) a
      nil policy and (b) a realistic policy body lifted from
      `internal/policybundle/testdata/policy-bundle-v2/cases/accept-genesis-enforce.json`.
- [ ] Write `BenchmarkSnapshotLoadAndVerify`: `aikeystore.FileStore.LoadActivatedPolicyPair` +
      `policybundle.ParseAndValidateSignedBundleV2` + `DigestCanonicalJSON` + unmarshal, against a
      pair built from that same fixture. This is the fixed cost the hook pays once per invocation.
- [ ] Write `BenchmarkContractSelfCheck` for `aipolicycontract.SelfCheck()` - it sha256s a 776,482-byte
      embedded artifact and is `sync.OnceValue`-cached, so it is a per-process cost the hook pays and
      the long-lived daemon does not.
- [ ] Run all three on the reference Windows box AND in the `go124` CI image, cold and under a
      concurrent `docker build` (the exact condition that produced the leak). Record p50/p95/p99 per
      size per condition.
- [ ] Write `LOCAL_DECISION_BASELINE.md` with the measured table and a single stated conclusion: the
      **fast-path input cap** in bytes at which p95 <= 50 ms holds on the slowest measured condition,
      and the **full-depth cap** at which p95 <= 150 ms holds. If 50 ms is not reachable at any cap
      above 4 KiB, say so in the document and carry the real number into Task 9's exit criterion
      instead of the strategy's proposal - §10.2 explicitly permits adjusting the latency numbers and
      explicitly forbids adjusting zero-silent-allow.

**Defeat test:** `TestBaselineDocumentMatchesTheBenchmarkNames` - rename `BenchmarkPromptDecisionPure`
without updating `LOCAL_DECISION_BASELINE.md`, expect RED with
`"baseline document names a benchmark that does not exist: BenchmarkPromptDecisionPure"`.

**Exit:** `Installers/docs/ai-security/LOCAL_DECISION_BASELINE.md` exists and states three numbers:
fast-path cap bytes, full-depth cap bytes, and the measured p95 of snapshot load+verify. Those three
numbers are the inputs to Tasks 7 and 9 and no later task may invent its own.

---

## Task 2: Give the runtime-adapter vocabulary a real cross-repo edge

**Files:**
- `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts` (source of truth; content
  unchanged)
- new `Backend/packages/shared-contracts/scripts/emit-runtime-adapter-tuples.mjs`
- new `Backend/packages/shared-contracts/generated/runtime-adapter/1.0.0/runtime-adapter-tuples.v1.jcs.json`
  plus `.sha256`
- new `Backend/src/ai-governance/runtime-adapter-tuples.generated.spec.ts`
- new `Installers/internal/aipolicycontract/embedded/runtime-adapter/1.0.0/runtime-adapter-tuples.v1.jcs.json`
- new `Installers/internal/aipolicycontract/runtime-adapter-consumer-pin.v1.json`
- new `Installers/internal/aipolicycontract/tooling/cmd/runtimevocabgen/main.go`
- new `Installers/internal/airuntime/vocab_generated.go`
- `Installers/internal/aipolicycontract/contract.go` (embed list + `SelfCheck`)
- `Installers/internal/airuntime/vocab.go`, `internal/airuntime/vocab_parity_test.go`
- `Installers/internal/controls/attestation.go:369+`
- `Installers/internal/aipolicycontract/inertness_test.go` (allowlist)

**Blast radius:** these tuples are the **heartbeat wire vocabulary** and are pinned against a Backend
allowlist. A member added, removed, renamed or **re-ordered** either 400s the whole heartbeat for the
fleet or silently changes what a historical bucket means. This is the highest-consequence contract in
the wave.

The mitigation is that this task is a **pure equality proof, not a change**: the generator must emit
Go literals **byte-identical** to the current hand-written ones. If `runtimevocabgen` produces a
different file than what is committed, the task has failed and must not be "fixed" by editing the
committed literals.

**Rollback:** delete `vocab_generated.go` and the pin, restore the hand literals in `vocab.go`. No
runtime behaviour depends on where the literals came from, so rollback is a file deletion with no
endpoint impact. Nothing ships to an endpoint in this task.

- [ ] Failing test first, in `Installers/internal/airuntime/vocab_parity_test.go`:
      `TestVocabularyIsGeneratedFromThePinnedArtifact` asserts
      `aipolicycontract.RuntimeAdapterTuples()["CANONICAL_HOOK_EVENTS"]` deep-equals
      `airuntime.CanonicalEvents` (as strings, in order). RED today: the accessor does not exist.
- [ ] Add the emitter on the Backend side. It regex-extracts the same unions
      `ai-governance-contract.parity.spec.ts` already extracts (`extractTsUnionFromFile`), writes them
      in JCS order under a `format` / `formatVersion` header, and emits a `.sha256` sidecar. Wire it
      into `Backend/packages/shared-contracts/package.json` scripts and add
      `runtime-adapter-tuples.generated.spec.ts`, which fails if regeneration is not a no-op.
- [ ] Copy the artifact into `Installers/internal/aipolicycontract/embedded/runtime-adapter/1.0.0/` and
      write `runtime-adapter-consumer-pin.v1.json` in the exact shape of
      `detector-catalog-consumer-pin.v1.json` (`sourceCommit`, `sourcePackage`, bytes, sha256,
      `runtimeActivatable: false`, `v2WriterEnabled: false`).
- [ ] Extend `contract.go`'s `//go:embed` list and `SelfCheck()` so the new artifact is verified on the
      same code path as the others. A pin mismatch must fail `SelfCheck`, which `BootSignedAuthority`
      already turns into `bootOutcomeSelfCheckFailed` + `Contain`. **This is the "unknown contract
      version fails explicitly and removes prevention status" half of Workstream 1's exit gate, and it
      is satisfied by extending an existing mechanism rather than building a new one.**
- [ ] Write `runtimevocabgen` to emit `internal/airuntime/vocab_generated.go` with
      `var generatedCanonicalEvents = [...]string{...}` and siblings.
- [ ] Change `vocab.go` so `CanonicalEvents`, `EnforcementEffects`, `CoverageDepths`,
      `CertificationStates`, `GovernanceDispositions` and `McpGovernanceRows` are **built from** the
      generated slices rather than declared as literals. Exported names, types and order must not move.
- [ ] Add `vocab_generated.go` and `internal/controls/attestation.go` to the inertness allowlist in
      `inertness_test.go`, each with a written reason.
- [ ] Add a step `go run ./internal/aipolicycontract/tooling/cmd/runtimevocabgen --check` to the
      existing `scanner-parity` job in `pr-checks.yml`. No new job, no new mirrored leg.

**Defeat test:** `TestVocabularyIsGeneratedFromThePinnedArtifact` - append `"FAKE_EVENT"` to the
`CanonicalHookEvent` union in `Backend/packages/shared-contracts/src/runtime-adapter-contract.ts`,
regenerate, and rebuild `Installers` without touching Go by hand. Expect RED with
`"runtime-adapter tuple drift: CANONICAL_HOOK_EVENTS has 12 members in the pinned artifact and 11 in airuntime"`.
Today the identical mutation is GREEN on the Go side, which is the point.

**Exit:** `internal/aipolicycontract/runtime-adapter-consumer-pin.v1.json` exists, `SelfCheck()` covers
it, `internal/airuntime/vocab_generated.go` is byte-identical to what `runtimevocabgen` emits, and the
diff of `internal/airuntime/vocab.go`'s exported values against `5b129523` is **empty**.

---

## Task 3: Project the snapshot fields the inline core needs into the pinned catalog consumer

**Files:**
- `Installers/internal/aipolicycontract/tooling/cmd/detectorcataloggen/main.go`
- `Installers/internal/aipolicycontract/detector_catalog_generated.go` (regenerated)
- `Installers/internal/aipolicycontract/detector-catalog-consumer-pin.v1.json` (digest must **not**
  move - the spine is not edited)
- `Installers/internal/aipolicycontract/detector_catalog_test.go`

**Blast radius:** the generated file has two live readers today (`internal/policyeval/shadow.go`,
`cmd/ai-security-neutral/holdout.go`) and both read only `Lifecycle`. Adding fields to
`AiSecurityDetectorClass` is additive; removing or renaming one is not. If the generator emits a field
the spine does not have, `--check` fails and the build stops - loud, and pre-merge.

**Rollback:** revert the generator and regenerate. No wire format, no endpoint state.

- [ ] Failing test first: `TestHardStopClassesCarryTheirSpineBudgetsAndDefaults` asserts
      `DetectorClassByID("private-key")` returns `Budgets.MaxInputBytes == 65536`,
      `Budgets.MaxMatches == 16`, `Budgets.MaxDecodeDepth == 1`, `Defaults.Recommended == "BLOCK"`,
      `Defaults.Restricted == "BLOCK"`, `Defaults.Unsupported == "DEGRADED"`. RED: the fields do not
      exist.
- [ ] Extend `AiSecurityDetectorClass` with `Budgets{MaxInputBytes, MaxMatches, MaxDecodeDepth int}`
      and `Defaults{Recommended, Restricted, Unsupported string}`, both deep-copied by
      `cloneDetectorClass` exactly as `HardStopEvidenceTiers` already is.
- [ ] Teach `detectorcataloggen` to project `classes[].budgets` and `classes[].defaults` from
      `embedded/0.7.0/contract-spine.v3.jcs.json`. The spine is **not** edited; only the projection
      widens.
- [ ] Add `TestEveryClassHasNonZeroBudgets` - a zero `MaxInputBytes` would make a bounded scan
      unbounded, so a missing budget must be a build failure, never a default of zero.
- [ ] Regenerate and confirm `git diff` on `detector-catalog-consumer-pin.v1.json` is empty (the spine
      digest `sha256:b252ee02...` must not move).

**Defeat test:** `TestEveryClassHasNonZeroBudgets` - change the generator to emit `MaxInputBytes: 0`
when the spine key is missing, expect RED with
`"detector class private-key has MaxInputBytes 0; a class with no budget cannot bound an inline scan"`.

**Exit:** `DetectorClassByID("private-key").Budgets.MaxInputBytes == 65536`, each of the four hard-stop
class IDs returns `Defaults.Restricted == "BLOCK"`, and `detector-catalog-consumer-pin.v1.json` is
byte-unchanged.

---

## Task 4: Make the live decision path emit a replayable neutral case

**Files:**
- new `Installers/internal/neutraleval/capture.go`
- new `Installers/internal/neutraleval/capture_test.go`
- `Installers/internal/neutraleval/contract.go` (no flag change - `RuntimeActivatable` stays false)
- `Installers/cmd/devoid/ai.go` (`buildHookRunRequest`, the capture-sink wiring)
- `Installers/internal/daemon/ai_handlers.go` (the gateway-side sink, after
  `scanAndDecideWithPolicy`)
- new `Installers/parity-vectors/neutral/capture-schema.md`

**Blast radius:** this writes files derived from prompt text. Get it wrong and DeVoid becomes an
exfiltration path for the content it exists to protect, and the person who notices is a customer's
security reviewer. So the capture is **off by default**, opted into per invocation, writes only under
an operator-named directory, and carries **no raw content** unless the operator also sets the explicit
plaintext variable - a support affordance, never a shipped default.

**Rollback:** the sink is a nil function pointer in the composition root. Setting it back to nil
removes the feature completely - no state to unwind, no file format to migrate.

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
      an RSA private key and assert the marshalled bytes do not contain the fixture.
- [ ] Wire the sink in `cmd/devoid/ai.go` next to the existing `Latency:` assignment in
      `buildHookRunRequest`, following the fan-out precedent documented at `cmd/devoid/ai.go`
      `hookLatencySink` - **one seam, one adapter**. That comment records a near-miss where two
      branches each assigned `Latency:` and a merge taking either side whole would have silently
      deleted one consumer.
- [ ] Wire the same sink into `handleAIPromptCheck` after `scanAndDecideWithPolicy`, so a captured hook
      event and a captured gateway event are the same shape.
- [ ] `TestHookAndGatewayCapturesAreIdenticalForTheSameInput` - Workstream 1's exit gate as one
      assertion: build the same input twice, once through the hook lane's core call and once through
      the gateway's, and assert `Result.SemanticDigest` is equal.

**Defeat test:** `TestHookAndGatewayCapturesAreIdenticalForTheSameInput` - change the gateway sink to
pass `provider: ""` where the hook passes the real provider, expect RED with
`"hook and gateway semantic digests differ: sha256:... vs sha256:..."`.

**Exit:** `go run ./cmd/ai-security-neutral --input <captured-entry.json>` reproduces the digest the
live path recorded, for a corpus of at least 20 captures taken from a real Claude Code session, and
`TestCaptureNeverWritesPlaintextByDefault` is green.

---

## Task 5: Read the signed snapshot from the hook process

**Files:**
- new `Installers/internal/localsnapshot/localsnapshot.go`
- new `Installers/internal/localsnapshot/state.go`
- new `Installers/internal/localsnapshot/localsnapshot_test.go`
- `Installers/internal/daemon/ai_policy_authority.go` (move `verifyStoredPair:527` out; the daemon
  keeps a thin wrapper)
- `Installers/internal/aipolicycontract/inertness_test.go` (allowlist the new file)

**Blast radius:** `verifyStoredPair` is on the daemon's boot path (`BootSignedAuthority`,
`ai_policy_authority.go:614`). A behaviour change there does not leak - it **contains** the endpoint,
which means every managed endpoint stops honouring its administrator's policy and drops to the built-in
floor until a recovery fetch succeeds. That is a fleet-wide availability event with no leak, surfaced
to the operator as `signed-state-missing-or-corrupt`.

The move must therefore be a **verbatim relocation**: same function body, same error values, same order
of checks.

**Rollback:** the daemon wrapper stays; reverting means pointing it back at an in-package copy. No
on-disk format changes, so an agent that rolls back reads exactly the files it wrote.

- [ ] Failing test first: `TestLoadReturnsTheVerifiedPolicyBody` - stage an `activated-policy-pair.json`
      plus `trust-root.json` derived from
      `internal/policybundle/testdata/policy-bundle-v2/cases/accept-genesis-enforce.json`, call
      `localsnapshot.Load(dir)`, assert `snap.Policy != nil` and `snap.State == StateSigned`.
- [ ] Move `verifyStoredPair` into `internal/localsnapshot` unchanged. Add
      `TestVerifyStoredPairIsByteIdenticalToTheDaemonCopy`, a golden test that runs the whole
      `internal/policybundle/parity_corpus.go` corpus (24 cases) through both the old daemon path and
      the new package and asserts identical `(bundle, policy, err)` triples. Delete the daemon copy only
      after that test is green.
- [ ] `Load` resolves the directory with `aikeystore.ResolveStoreLocation()` - the same resolver the
      daemon writer and the upgrade reader already use - and **never** a path of its own.
      `ErrAmbiguousStoreScope` maps to `StateAmbiguous`.
- [ ] Trusted-time rule, written into the file comment so it cannot be re-derived wrongly:
      `now = max(wallClock, pair.TrustedServerTime)`; `now > pair.ValidUntil` -> `StateExpired`. Taking
      the max means a **backwards** clock cannot resurrect an expired snapshot, and a **forwards** clock
      can only make a live snapshot look expired - which degrades to the stricter built-in floor. State
      both directions.
- [ ] `TestClockRegressionCannotUnexpireASnapshot` and `TestClockAdvanceExpiresRatherThanExtends`.
- [ ] Enumerate the states as a closed vocabulary in `state.go`: `StateSigned`, `StateExpired`,
      `StateContained`, `StateAbsent`, `StateUnreadable`, `StateCorrupt`, `StateAmbiguous`. Each carries
      a content-free slug. There is no `StateUnknown`.
- [ ] `TestUnreadableIsNotAbsent` - chmod the pair `0000` (POSIX) or deny the current user (Windows) and
      assert `StateUnreadable`, not `StateAbsent`. This is the distinction
      `cmd/devoid/ai_failure_resolver.go ungovernedCheckpointNotice()` had to add for the daemon token
      after an operator was told to restart a daemon that was already running. Do not repeat it.
- [ ] Cache the load for the process lifetime with `sync.OnceValue`. A hook process is short-lived, so
      this is one read per invocation with no invalidation problem.

**Defeat test:** `TestClockRegressionCannotUnexpireASnapshot` - change `now` from
`max(wall, trustedServerTime)` to `wall`, expect RED with
`"expired snapshot accepted after setting the wall clock back: state=signed want=expired"`.

**Exit:** `localsnapshot.Load` returns `StateSigned` with a non-nil `*backend.AiPolicy` on a real Windows
machine install, and the revision and digest it reports match what the daemon reports on
`GET /v1/status` on the same box. `TestVerifyStoredPairIsByteIdenticalToTheDaemonCopy` green 24/24.

---

## Task 6: Extract the decision core, and route the daemon through it first

**Files:**
- new `Installers/internal/localdecide/prompt.go`
- new `Installers/internal/localdecide/tool.go`
- new `Installers/internal/localdecide/floors.go`
- new `Installers/internal/localdecide/prompt_differential_test.go`
- `Installers/internal/daemon/ai_handlers.go` (`scanAndDecideWithPolicy:2418`,
  `scanAndDecideWireWithPolicy:2627`, `hasGatingSecretFinding:2543`, `decideTool:3717`,
  `defaultToolDecision:3903`, `applyPolicyExpiredOracle`, `applyPolicyContainedFloor`, the
  conclusive-secret branch at `:1399`)

**Blast radius:** **the highest in the wave.** It touches the function that decides every prompt on
every endpoint. A change in the *permissive* direction is a silent fleet-wide leak that no current test
catches; a change in the *restrictive* direction blocks benign prompts and, per the 2026-07-31
precedent, gets the agent uninstalled.

The discipline that makes it safe: **the daemon is routed through the new core in the same change that
creates it, and nothing else consumes it yet.** If the extraction is wrong, it is wrong in the one place
already covered by the largest test surface in the repository, before any new caller exists. Task 7 only
then plugs in the second caller.

**Rollback:** the daemon methods keep their names and signatures and become one-line delegations.
Reverting is restoring the bodies. No on-disk state, no wire change, no contract change.

- [ ] Failing test first, `prompt_differential_test.go`: `TestCoreMatchesTheDaemonOverTheSharedCorpora`
      runs every case in `parity-vectors/policyeval-decision.json` (17),
      `parity-vectors/dlp-findings.json`, and `parity-vectors/neutral/neutral-corpus.shared.jsonl` (150)
      through both the pre-existing daemon function and `localdecide.Prompt`, asserting **deep equality
      of the whole `policyeval.Decision`** - `Verdict`, `Alert`, `Reasons` in order, `RedactFindings`,
      `DLPFindings`, `InspectionIssues`. Not just the verdict: a reason slug that moves changes what the
      console renders and what the Backend wire allowlist accepts.
      **This test must never name `neutral-corpus.holdout.jsonl`** -
      `internal/neutraleval/holdout_seal_test.go` fails the build if it does.
- [ ] `localdecide.Prompt(in Input) Result` reproduces, in this exact order, everything
      `handleAIPromptCheck` does before it touches the network:
      1. `aicanary.IsProbe(text)` -> unconditional block carrying `aicanary.ReasonSlug`
         (`ai_handlers.go:1211`)
      2. `evaluateAIGovernance(policy, agentType, foldedSurface)` -> block / monitor
      3. `dlp.ScanAll` + `promptrisk.Scan` + `policyeval.DecideScan`
      4. the `res.MustBlock` Unicode-evasion upgrade (`ai_handlers.go:2435`)
      5. `applyPolicyExpiredOracle` then `applyPolicyContainedFloor`
      6. the `secretFloorApplies && hasGatingSecretFinding` conclusive-secret floor
         (`ai_handlers.go:1399`)
      Steps 5 and 6 take their inputs (`Expired`, `Contained`, `CanHold`, `HoldSurface`) from the `Input`
      struct rather than from daemon globals. The hook already computes `canHold` and `holdSurface`
      locally in `cmd/devoid/ai.go askDaemonPromptCheck` and sends them as headers, so no new information
      is needed on the hook side.
- [ ] `localdecide.Tool` does the same for `decideTool` + `defaultToolDecision` + `toolrisk` classification.
- [ ] Replace the daemon bodies with delegations. `scanAndDecideWithPolicy` keeps its one remaining
      daemon-specific line (`aiPolicy.currentForDecision(...)`) and passes the resulting
      `Expired` / `Contained` / `Terminal` into the core as data.
- [ ] `TestNoDaemonImportInLocaldecide` - a `go/parser` import-graph assertion in the shape of
      `internal/aipolicycontract/dependency_isolation_test.go`, asserting `internal/localdecide` imports
      none of `internal/daemon`, `net/http`, or any backend HTTP client. **The detector side must not
      know a vendor response type** - Workstream 1's "no detector package imports or knows a vendor
      response type" gate.

**Defeat test:** `TestCoreMatchesTheDaemonOverTheSharedCorpora` - remove the
`secretFloorApplies && hasGatingSecretFinding` branch from `localdecide.Prompt`, expect RED with
`"case 'aws pair, non-interactive': verdict allow, want block (reasons: noninteractive-secret:block)"`.

**Exit:** 167+ corpus cases deep-equal across both implementations; `go test ./internal/daemon/...` green
with zero diffs to any existing expectation file; `TestNoDaemonImportInLocaldecide` green.

---

## Task 7: Answer a budget expiry from the local core instead of proceeding ungoverned

**Files:**
- `Installers/internal/airuntime/runner.go` (add `RunRequest.LocalDecider`; change the
  `budgetExpiredUndecided` branch at `:925-940`)
- new `Installers/internal/airuntime/local_decider.go` (the seam type only - `airuntime` must not import
  `localdecide`, exactly as it does not import `failureoracle`)
- new `Installers/cmd/devoid/ai_local_decider.go` (the composition-root adapter)
- `Installers/cmd/devoid/ai.go` (`buildHookRunRequest`)
- `Installers/cmd/devoid/ai_hook_runner.go` (`executeUserPromptSubmit:489`, `executePreToolUse:771`,
  `executePermissionRequest:1547` - the three `ungovernedOutcome(why)` sites)
- `Installers/internal/airuntime/runner_test.go`, `internal/airuntime/undecidable.go`

**Blast radius:** every gating checkpoint on every endpoint. The failure mode to fear is a **new block**
where today there is a proceed. That is bounded by construction: the local core is the same function the
daemon runs, over the same policy the daemon would have used, so the only invocations whose outcome
changes are the ones that **currently proceed with no decision at all**. No invocation that currently
reaches the daemon changes.

**Rollback:** `LocalDecider` is nil-safe. A nil decider restores today's behaviour exactly - the runner
falls through to `failGating(..., ReasonDecisionBudgetExpired)`. Ship it so that setting the field to nil
in `buildHookRunRequest` is a **one-line revert an on-call engineer can find**.

- [ ] Failing test first: `TestBudgetExpiryAnswersFromTheLocalDecider` - a `RunRequest` with an executor
      that blocks forever, a 10 ms `TimeBudget`, and a `LocalDecider` returning a deny. Assert
      `RunResult.Effect == EffectDenyPrompt` and `RunResult.Reason == "decided-locally"`. RED: the field
      does not exist.
- [ ] Add to `runner.go`, beside the existing seam fields:

      ```go
      // LocalDecider answers this checkpoint from the verified on-disk snapshot when
      // the authority did not. Nil restores the historical ungoverned-proceed path.
      LocalDecider LocalDecider
      ```

      The interface lives in `local_decider.go`, takes `(CanonicalEvent, []byte)` and returns
      `(HookOutcome, bool)`. `airuntime` must not learn a policy type.
- [ ] In the `verdict == budgetExpiredUndecided` branch, ask the decider **before** calling `failGating`.
      If it answers, `latch.Latch(out)`, stamp `Reason = ReasonDecidedLocally`, return. If it declines,
      fall through to today's exact path, unchanged.
- [ ] New reason constants, derived rather than invented, in the shape `runner.go:990-1010` already
      establishes:
      `const ReasonDecidedLocally = "decided-locally"` (matches `UndecidableBucketFor`'s `"decided"`
      prefix, so it lands in `BucketDecided`, the denominator - correct, because the checkpoint **was**
      decided), and
      `const ReasonLocalDecisionUnavailable = UngovernedReasonDaemonUnreachable + "-no-local-snapshot"`
      (stays in `daemonUnreachable`). **Do not mint a bucket-less slug** - `undecidable.go:69-72` records
      that the wire vocabulary is pinned to a Backend allowlist and a new member would 400.
- [ ] `TestDecidedLocallyCountsInTheDecidedBucket` and
      `TestLocalDecisionUnavailableStaysInDaemonUnreachable`.
- [ ] The composition-root adapter in `cmd/devoid/ai_local_decider.go`:
      `localsnapshot.Load()` -> `StateSigned`: `localdecide.Prompt(...)` with the loaded policy.
      `StateAbsent` / `StateExpired` / `StateContained`: `localdecide.Prompt(...)` with a **nil** policy,
      which is the documented built-in floor (§6.3 of the Source of Truth: an endpoint that has never
      spoken to the backend is *stricter*, not looser).
      `StateUnreadable` / `StateCorrupt` / `StateAmbiguous`: **decline**, let the historical path run,
      record the reason.
- [ ] `TestLocalDeciderDeclinesOnAnUnreadableSnapshot` - "I cannot read the snapshot" is exactly the class
      of unprovable condition that bricked a machine in July 2026, and the correct answer is the
      pre-existing proceed plus a visible counter, not a new fail-closed branch.
- [ ] Wire the identical adapter into the three `ungovernedOutcome(why)` sites in
      `cmd/devoid/ai_hook_runner.go`, for the case where `why.OK()` is false (the daemon answered wrongly
      or not at all) rather than only on budget expiry.

**Defeat test:** `TestBudgetExpiryAnswersFromTheLocalDecider` - revert the decider call so the expiry
branch goes straight to `failGating`, expect RED with
`"budget expired with a local snapshot available: effect none, want deny-prompt"`.

**Exit:** with the daemon **stopped**, `devoid ai hook --adapter claude-code --event USER_PROMPT_SUBMIT`
fed a PEM private key on stdin emits the Claude deny JSON on stdout and exits 0; the same invocation with
a benign prompt emits no deny. Both recorded in `~/.devoid/ai-hook-outcomes.tsv` under bucket `decided`.

---

## Task 8: Name the degraded states, and make them visible instead of inferable

**Files:**
- `Installers/internal/localsnapshot/state.go`
- `Installers/internal/aihookmetrics/spool.go` (`Line`, `recordVersion`), `internal/aihookmetrics/drain.go`
- `Installers/internal/hooklatency/summary.go`
- `Installers/cmd/devoid/` doctor surface - locate with
  `git grep -n "hooklatency.Summary\|TargetP95" origin/main -- cmd/devoid`
- `Installers/internal/controls/attestation.go` (heartbeat counters)
- `Installers/internal/daemon/server.go` (`GET /v1/status`)
- `Backend` heartbeat DTO allowlist - locate with
  `git grep -n "undecidable" origin/main -- src/health src/ai-governance`

**Blast radius:** new counters on the heartbeat. `AgentIngestValidationPipe` **drops unknown keys rather
than 400ing**, so an agent shipped before the Backend accepts the new keys loses them **silently** - no
error, no data, and it looks like it worked. **Backend deploys before any agent release that emits these
counters.** That ordering is not a preference; the reverse has caused a fleet-wide outage.

**Rollback:** the counters are additive. Removing them from the agent is safe at any time; removing them
from the Backend while agents still send them is also safe, because the pipe drops unknown keys. There is
no migration.

- [ ] Failing test first: `TestSnapshotStateIsOnTheHookOutcomeRecord` - assert the TSV line written by
      `aihookmetrics.Line` carries the snapshot-state slug as a sixth field. RED: the format has five
      (`internal/aihookmetrics/spool.go`, `Line`).
- [ ] Bump `recordVersion` from `"1"` to `"2"` in `spool.go`. The drain already rejects a format it does
      not know rather than mis-parsing it - keep that property and add
      `TestDrainRejectsAV1LineWithoutMisparsingIt`.
- [ ] Add three counters beside the heartbeat's `runtimeAdapters[].undecidable` block: `localDecided`,
      `localDeclined`, `snapshotState`. Add the wire names to `internal/controls/attestation.go` **and**
      the Backend allowlist in the same wave, Backend first.
- [ ] `devoid doctor` prints one line per state: snapshot revision, digest, phase, validity window, and
      whether the last N invocations were decided by the daemon or locally. **An endpoint that has never
      loaded a snapshot must print `snapshot: absent (built-in floor)`, not a blank.** The §14 failure
      this repo keeps producing is a surface that reads green over a dead path.
- [ ] `TestDoctorPrintsAbsentRatherThanBlank`.

**Defeat test:** `TestDrainRejectsAV1LineWithoutMisparsingIt` - make the drain accept a 5-field line under
`recordVersion 2`, expect RED with
`"v1 record accepted under v2: snapshotState parsed as \"\" from a line that has no such field"`.

**Exit:** `devoid doctor` on a real endpoint prints a snapshot line whose revision and digest match
`GET /v1/status`; the heartbeat carries `localDecided` and the Backend stores it, proven by a database
row, not by the agent's own log.

---

## Task 9: Make the hard-stop set pre-emptive, bounded, and unable to widen itself

**Files:**
- new `Installers/internal/localdecide/hardstop.go`
- new `Installers/internal/localdecide/hardstop_test.go`
- `Installers/internal/aipolicycontract/inertness_test.go` (allowlist `hardstop.go`)

**Blast radius:** this is the only place in the wave that can produce a block the daemon would not have
produced, so it is fenced three ways: (1) the class must be in
`aipolicycontract.DetectorHardStopEligibleClassIDs()` - four classes; (2) the finding's evidence tier
must be in that class's `HardStopEvidenceTiers` - Tier A only, meaning a **parsed** artefact, not a shape
match; (3) the finding must be `EnforcementEligible`. All three are read from the digest-pinned spine, so
widening the set is a contract change with a pin diff, not a code edit.

The condition that makes this fail-closed branch **provable** - the thing the July 2026 brick lacked - is
named explicitly: *a Tier-A parsed finding in a pinned hard-stop-eligible class*. That is
`pem-private-key-parse` succeeding, not a regex firing. `internal/dlp/private_key.go` already
distinguishes `parsed-pem-private-key` from `pem-private-key-candidate`, and the candidate class is
`hardStopEligible: false` in the spine with rationale `inconclusive-parser-never-denial`.

**Rollback:** `HardStop()` returns a bool; the caller can be reverted to ignore it in one line. The class
set is data in a pinned artifact, so an emergency narrowing could be a pin regeneration - but the honest
emergency answer is the one-line caller revert.

- [ ] Failing test first: `TestHardStopFiresOnAParsedPrivateKey` and its twin
      `TestHardStopDoesNotFireOnAPrivateKeyCandidate`. RED: `hardstop.go` does not exist.
- [ ] `TestHardStopSetIsExactlyTheContractSet` asserts `HardStopClassIDs()` deep-equals
      `aipolicycontract.DetectorHardStopEligibleClassIDs()` and that the length is 4. A local literal is
      forbidden; the test reads the contract.
- [ ] `TestHardStopIsASubsetOfIsGatingSecretClass` - for every hard-stop class,
      `dlp.IsGatingSecretClass(class)` is true. This is the blast-radius invariant in executable form:
      the inline core can never block a class the daemon's own conclusive-secret floor would not already
      have blocked.
- [ ] Bound the scan. `HardStop` scans at most `Budgets.MaxInputBytes` (65536, from Task 3) and considers
      at most `Budgets.MaxMatches` findings. Beyond the cap the result is `inspection: BUDGET_EXCEEDED`,
      which routes to the failure oracle (`SurfaceRuntimeAdapter`, `CheckpointPrePrompt`,
      `FailureBudgetExceeded`, `ImpactTrustIntegrity`) - **not** to a hard stop and **not** to a silent
      allow.
- [ ] `TestOversizeInputRoutesToTheOracleNotToAHardStop`.
- [ ] Use the fast-path cap measured in Task 1 for the inline scan on the budget-expiry path. If Task 1
      measured that 64 KiB exceeds the latency target, use the smaller measured cap and treat the
      remainder as `BUDGET_EXCEEDED` - a stated, counted degrade, never a silent truncation.

**Defeat test:** `TestHardStopSetIsExactlyTheContractSet` - add `"aws-access-key"` to the hard-stop set by
hand, expect RED with
`"hard-stop set has 5 members; the pinned contract declares 4 (extra: aws-access-key)"`.
`aws-access-key` is `hardStopEligible: false` in the spine with rationale
`identifier-shape-not-credential-proof`, and it is the exact class the 2026-08-26 campaign found
unblocked - so the temptation to add it here is real and must fail loudly.

**Exit:** four class IDs, read from the contract; the subset test green; a Tier-A PEM private key
hard-stops with the daemon dead, and a truncated or encrypted PEM does not.

---

## Task 10: The 10,000-run hard-deny stress suite

**Files:**
- new `Installers/scripts/harddeny-stress/main.go` (driver)
- new `Installers/scripts/harddeny-stress/matrix.go` (stress conditions)
- new `Installers/scripts/harddeny-stress/classify.go` (the silent-allow classifier)
- new `Installers/scripts/harddeny-stress/classify_test.go`
- new `Installers/scripts/harddeny-stress/README.md`
- new `Installers/scripts/harddeny-stress/testdata/` (deny fixtures and allow twins)

**Blast radius:** none on the product - this is a test driver, and `scripts/` is already a Go-source
directory here (`scripts/aicontext-gate/`), so no release artifact grows. The radius is **on the claim**:
a suite that measures the wrong thing produces a 9.7 that was not earned, which is the failure mode §15 of
the Source of Truth exists to prevent. Two specific traps this repo has already hit:

- Running it on a quiet box. The register entry for `hook-lane-prompt-block` carries a standing
  instruction: *"do not close this entry by re-running on a quiet box until a run passes. The control's
  failure mode IS load."*
- Counting a fail-closed deny as a pass without checking the deny reached the runtime. On Codex a non-zero
  exit is a **discarded** hook and the tool runs
  (`internal/airuntime/adapters/codex/testdata/shook/deny-matrix-0147`); the deny must ride stdout at
  exit 0.

**Rollback:** delete the directory.

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
      fixture on stdin, collecting stdout, stderr, exit code, duration and the TSV record. Real processes,
      not in-process calls - the leak was a process-level failure and the ~45 ms of exec + loader + Go
      bootstrap (`RunRequest.ProcessStart`, `runner.go:538-548`) is part of the wait being measured.
- [ ] Fixtures, each with an **allow twin** of identical size and shape: `private-key` (Tier-A PEM),
      `aws-credential-pair` (id plus secret), `gcp-service-account` (parsed JSON key),
      `azure-connection-string`, plus the fixed `aicanary.ProbeToken`
      (`internal/aicanary/probe.go:40`) as the transport control. The allow twins are what catch a suite
      that passes by blocking everything.
- [ ] Stress conditions, from strategy §10.1, each a named mode in `matrix.go`: `idle`,
      `cpu-saturation`, `memory-pressure`, `disk-io`, `container-build`, `concurrent-sessions` (N parallel
      hook processes), `daemon-stopped`, `daemon-slow` (a loopback listener that delays 30 s),
      `daemon-401`, `daemon-429`, `daemon-5xx`, `daemon-malformed-body`,
      `daemon-restart-during-decision`, `snapshot-corrupt`, `snapshot-absent`, `snapshot-expired`,
      `clock-skew`, `evidence-spool-full`.
- [ ] `daemon-slow` must use a real delaying loopback listener on the daemon's configured port, not a
      killed daemon. "The daemon is not answering" and "the daemon is slow" took the same code path
      before the latch and must be measured apart.
- [ ] Distribution: 10,000 consecutive deny operations **per certified surface**, spread across the matrix
      with per-mode counts stated in the report, plus 10,000 allow-twin operations. A mode with zero runs
      is a FAILED report, never a silent omission.
- [ ] Report `harddeny-report.json`: per mode - `denyFixtures`, `denyEnforced`, `silentAllows`,
      `countedNonDecisions`, `allowTwins`, `falseBlocks`, `p50` / `p95` / `p99` decision latency,
      `localDecided`, `daemonDecided`. Exit non-zero if `silentAllows > 0` **or** `falseBlocks > 0`.

**Defeat test:** `TestSuiteDetectsAnInjectedSilentAllow` - set `LocalDecider` to nil in
`buildHookRunRequest` and run the suite in `daemon-slow` mode, expect RED with
`"silentAllows=<n> in mode daemon-slow (want 0); fixture private-key exited 0 with no deny on stdout"`.
This is the pre-fix behaviour, so the suite must be able to reproduce the original 6-in-10 failure on
demand.

**Exit:** `harddeny-report.json` with `silentAllows: 0` over >= 10,000 deny operations and
`falseBlocks: 0` over >= 10,000 allow twins, on the Windows reference endpoint, with `cpu-saturation`,
`container-build`, `daemon-slow` and `concurrent-sessions` each carrying >= 500 runs. Committed to
`Installers/parity-vectors/` as a dated artifact naming the machine, the agent version and the snapshot
revision.

---

## Task 11: Run the suite where it will actually run, and record only what it proved

**Files:**
- `Installers/.github/workflows/pr-checks.yml` (new job `hard-deny-stress`)
- `Ceragon/ci/gates.json` (`repos.Installers.mirrored`)
- `Installers/internal/liveproof/register.json` (the `hook-lane-prompt-block` row)
- `Installers/docs/ai-security/LIVE_PROOF_PROCEDURE.md` (a new section for the stress run)

**Blast radius:** two ways to get this wrong, both already produced here. (1) Adding a workflow job that
never runs, because `pr-checks.yml` has no push or PR trigger - a green-looking gate that is a note, not
an alarm. (2) Flipping `observed: true` in the live-proof register on the strength of a CI run.
`internal/liveproof/liveproof.go` requires five evidence fields, and the register's own rule is that the
CI pin goes in **after** the observation, never instead of it.

**Rollback:** remove the `gates.json` entry and the workflow job. `node ci/lib/drift.mjs` will then report
the job as unmirrored-and-unexplained, which is the intended loud state - so a deliberate removal must
also add a `cannotMirror` entry.

- [ ] Add job `hard-deny-stress` to `pr-checks.yml`, carrying `if: github.event_name != 'schedule'` like
      every other job there, running a **reduced** N (1,000) so a dispatched run is minutes, not hours. Do
      **not** add a `push` or `pull_request` trigger - the file's own comment records the $600 decision and
      forbids it.
- [ ] Register `"pr-checks:hard-deny-stress": {}` in `ci/gates.json` under `repos.Installers.mirrored`,
      then confirm `node ci/lib/drift.mjs` is clean and `node ci/lib/run.mjs Installers` executes the new
      leg in Docker on `go124`.
- [ ] Document in the job's own YAML comment that the **full** 10,000-run number is a Windows
      reference-endpoint measurement and the Docker leg is a regression guard at reduced N. The container
      cannot reproduce Windows scheduling, the desktop warn dialog, or the SYSTEM/user identity split -
      `ci/gates.json`'s `cannotMirror` block already documents this class for
      `pr-checks:cli-entrypoint-tests`.
- [ ] Add section `5. Hard-deny stress` to `LIVE_PROOF_PROCEDURE.md` describing the Windows run and its
      load generator, so the observation is reproducible by someone who was not here.
- [ ] Update the `hook-lane-prompt-block` quarantine `reason` in `internal/liveproof/register.json` to name
      the fix, the suite and the report artifact. **Do not set `observed: true`** until a Windows run under
      the §4b stub-transport harness with a real Claude Code client blocks a Tier-A private key with the
      daemon under load, and all five evidence fields exist. Extend `reviewBy` only with the new procedure
      named.

**Defeat test:** the existing drift checker - add the `hard-deny-stress` job to `pr-checks.yml` and omit it
from `ci/gates.json`, expect `node ci/lib/drift.mjs` RED with
`"Installers pr-checks:hard-deny-stress is neither mirrored nor explained"`.

**Exit:** `node ci/lib/run.mjs Installers` runs 12 mirrored legs (was 11) and the new leg passes at N=1,000
with `silentAllows: 0`. The register row for `hook-lane-prompt-block` names the suite, the report artifact
and the reference machine, and its `observed` flag is whatever the Windows run honestly earned.

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
   local/daemon split. Defeat test: `TestDrainRejectsAV1LineWithoutMisparsingIt` (Task 8).
8. **One normalized event replays identically across the hook runner, the provider gateway and the offline
   harness.** Defeat test: `TestHookAndGatewayCapturesAreIdenticalForTheSameInput` (Task 4).
9. **The runtime-adapter vocabulary has a machine-checked cross-repo edge, and an unknown contract version
   fails explicitly.** Defeat test: `TestVocabularyIsGeneratedFromThePinnedArtifact` (Task 2); the
   explicit-failure half is the existing `SelfCheck` -> `Contain` path extended to cover the new artifact.
10. **The latency claim is a measured number, not the strategy's proposal.**
    `LOCAL_DECISION_BASELINE.md` names the fast-path cap, the full-depth cap and the measured snapshot
    load+verify p95, and Tasks 7 and 9 use those numbers. Defeat test:
    `TestBaselineDocumentMatchesTheBenchmarkNames` (Task 1).
11. **The suite runs without anyone remembering to run it.** `node ci/lib/drift.mjs` clean and
    `node ci/lib/run.mjs Installers` executes 12 mirrored legs. Defeat test: the drift checker itself
    (Task 11).

### Deploy ordering for this wave

- Task 8 adds heartbeat counters. **Backend deploys first.** `AgentIngestValidationPipe` drops unknown keys
  rather than 400ing, so an agent released first loses the fields silently and the gap looks like a working
  deploy.
- Every other task in this wave is agent-only and touches no Backend contract.
- **Deploying anything requires a fresh explicit owner ask.** A green local run is not permission, and
  merging is not deploying.

---

## What this wave deliberately does NOT do

- **It does not change the answer for `INTERVENTION_UNAVAILABLE`.**
  `cmd/devoid/ai_failure_resolver.go` still returns `FailClosed: false`, and `governanceFailClosed` still
  always returns false. Reversing that is what stopped a workstation on 2026-07-31 and got the agent
  uninstalled. The wave makes that branch **rarer**, not stricter.
- **It does not raise or lower the 4-second decision budget or the 60-second host hook timeout.** The
  strategy is explicit that a larger timeout only makes the user wait longer before the same fail-open.
  `internal/aihooks/settings.go:88-113` also documents that 60 is the runtime-integrity projection's own
  `maxHookTimeoutSeconds`, and that a faster per-event tool gate requires teaching that projection to
  attest a timeout map - a deliberate change to what the canary attests, not a side effect of this wave.
- **It does not widen the hard-stop set beyond the four pinned classes**, and specifically does not add
  `aws-access-key` - the class the 2026-08-26 campaign found unblocked. The spine's own rationale is
  `identifier-shape-not-credential-proof`. Widening it is a detection decision, explicitly out of the
  strategy's scope, and belongs in a contract-spine change with a pin diff, not here.
- **It does not build a second policy engine.** `localdecide` is an extraction of the shipped one, proven
  equal over the shared corpora before anything new consumes it. A second engine is how the Go/JS parity
  problem got created once already.
- **It does not invent a new snapshot file, a new atomic-swap protocol, or a new signing chain.**
  `activated-policy-pair.json` already is an immutable, atomically-committed, digest-verified generation.
  A second one would give the endpoint two answers.
- **It does not make the local snapshot readable on POSIX machine installs.** The trust files are `0600`
  root-owned by design (`internal/aikeystore/harden_other.go`) and changing that weakens an existing guard.
  On those installs the hook degrades to the built-in floor, which is stricter than a configured policy.
  Changing the POSIX ACL model belongs with the service/broker work.
- **It does not touch the Codex dialect pin.** `internal/codexmanaged/hookdialect.go:99-115,161-165` answers
  no for 0.145 / 0.146 / 0.148 / 0.149-alpha, and the Source of Truth's C1 note is explicit: do not widen
  without two vendor artefacts per family. Codex coverage is a different wave.
- **It does not fix the canary receipt sink**
  (`internal/airuntimeintegrity/providers/claude/canary.go:55-59`, `:335-343`, where `Receipts:` is assigned
  only in four test files) or the hard-coded 5-second `WaitDelay` at `internal/aicanary/exec.go:125` that
  classifies a real deny as a launch failure. Both are proof-lane defects; this wave's gate is the stress
  suite, not the canary.
- **It does not attempt the strategy's 99.999% decision-availability number.** With a population of one
  reference endpoint, five nines is unmeasurable - distinguishing it from four nines needs roughly 10^5 to
  10^6 observations. The honest substitute is the 10,000-run zero-silent-allow gate plus a fleet-wide
  `localDecided` / `daemonUnreachable` ratio from Task 8's counters, and the availability figure should be
  claimed only once fleet telemetry exists.
- **It does not claim the p95 <= 50 ms target is met.** The only throughput figure on record is
  `dlp.ScanEx` at 0.71 MB/s, which buys about 36 KiB inside 50 ms, while the spine's own per-class
  `maxInputBytes` is 65536. Task 1 measures it; if the number is not reachable, the wave carries the
  measured number and states the cap rather than quietly truncating the scan to hit a latency figure.
  §10.2 permits adjusting latency; it does not permit adjusting zero-silent-allow.
