> ## ⚠ READ FIRST — THIS PROGRAMME RUNS IN PARALLEL WITH ANOTHER ONE
>
> A second plan is being implemented **at the same time, by a different agent team, in a different
> chat session.** The two plans share **28 source files** and several resources that have no file
> conflict at all and will still destroy each other's work: one agent release channel, one production
> Backend, one live-proof register, one `pr-checks.yml`.
>
> **Before your first task, read
> [`.plans/PARALLEL_EXECUTION_CONTRACT.md`](../../PARALLEL_EXECUTION_CONTRACT.md).** It names the owner
> of every shared file, the append-only protocol for the shared scoreboards, the serialised
> owner-gated release procedure, and the handshake file for anything you need from the other side.
>
> Three rules that will not be obvious from inside a task:
> 1. **If your task seems to need a file this programme does not own, it does not.** Post a seam
>    request to the handshake and switch tasks. Do not make "a small edit" in the other programme's
>    directory.
> 2. **Never cut an agent release or request a Backend deploy on your own authority.** A release now
>    carries both programmes' merged work. One team releasing alone ships the other team's
>    half-finished work to every endpoint.
> 3. **Append, never rewrite,** in `internal/liveproof/register.json`, the Codex ledger, and
>    `pr-checks.yml`. A reformat by one team turns every later diff into a conflict.
>

# Wave 5 - Make the effect honest and separate the decision receipt from the effect receipt

**Scorecard rows this moves:** Ability to enforce once a decision is reached 7.0 -> 9.5 (Workstream 6); Proof that enforcement happened 3.5 -> 9.6 (Workstream 7, this wave carries the receipt-separation, assurance-level and no-op-satisfaction half; the E3 canary half belongs to Wave 6)

**Honest ceiling on the Proof row.** Every live-proof artefact this wave produces is a **local-rig measurement**. The "production evidence convergence" clause of the Proof row - proving any of this against the production signing, policy and evidence chain - is owned by **no wave in this programme** (RECONCILIATION §6, "Rows no wave moves"). Do not report that clause as closed by anything here.

**Depends on:** the contract-freeze wave (Workstream 1) for the frozen normalized-action / requested-effect / receipt contracts, and the inline local decision core wave (Workstream 2) so there is a decision to enforce without a backend hop. Tasks 1-6 and 8 can be built against `origin/main` as it stands today; only the exit gate needs the earlier waves.

**Phase:** 3

---

## How an agent executes this wave

You will be given ONE task from this file and not the rest of it. Everything you need is inside that task. If it is not, **stop and report** - do not improvise a substitute. This codebase has a documented history of agents inventing plausible replacements for a missing precondition and shipping them green.

**Worktree.** Work in a git worktree under `C:/cwt/`, one per task:

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers   # or Backend / Frontend for Task 6
git fetch origin
git worktree add /c/cwt/w5-t<N> -b w5/t<N>-<slug> origin/main
cd /c/cwt/w5-t<N>
```

**NEVER run `git stash` anywhere in this workspace.** `refs/stash` is shared across every worktree of a repo. A `git stash pop` in your worktree steals a concurrent session's stashed work, and it has happened twice in one day here. If you need a clean tree, commit to your own branch instead.

**Commit each task immediately, never batch.** One campaign here lost days of work to a crash and three API outages; only committed work survived. Commit as soon as a test goes green, before starting the next thing.

**`git add` explicit paths, never `-A`.** These trees carry other sessions' uncommitted work and unrelated scratch directories. `git add -A` sweeps them into your commit.

**The five inert-test shapes. A green test you cannot make RED has not run.** Every fix must show the test RED without the fix and GREEN with it, and you must paste both. Five shapes have shipped green here while defending nothing:

1. **Source-text assertions** (`readFileSync` + `toContain`). Satisfiable by pasting the asserted code inside a comment.
2. **Hand-built struct literals** compared to other hand-built struct literals. Cannot notice the real deliverable was deleted.
3. **Defending ONE branch of a two-branch route.** Check Codex *and* Claude, install *and* uninstall, stored row *and* rendered console. One route here turned out to have three branches and the third was the broken one.
4. **Exercising only KNOWN members of a closed set.** Cannot tell a fail-safe allowlist from a fail-open denylist. Feed it something genuinely unknown and see which way it fails.
5. **A test whose PRECONDITION silently skips the assertion.** If a test has a precondition, assert it loudly.

Two more: an HTTP 2xx proves nothing on an agent route (`AgentIngestValidationPipe` sets `forbidNonWhitelisted:false`, so an undeclared key is dropped with no 400 and no log - verify the STORED ROW and the RENDERED PROJECTION separately); and a mocked query builder cannot catch a Postgres type error.

**Citations.** Every file:line in this wave is a claim about `origin/main`, not about your local checkout. The Installers checkout in this workspace is **1010 commits behind** `origin/main`; Backend 773, Frontend 525. Always `git fetch origin` first and read with `git show origin/main:<path>`, never with a bare editor open on the working tree.

**Pinned SHAs for this wave** (verified 2026-08-28): Installers `5b129523`, Backend `0cf9021e`, Frontend `cac574ae`. If `git rev-parse origin/main` disagrees with these, **stop and report** - the citations below were read at those commits and a moved base invalidates the line numbers, not the reasoning.

**A pin added to `pr-checks.yml` is ADVISORY on the current GitHub plan, not a merge gate.** Branch
protection is impossible across all six repositories today — every one returns 403 on the Free plan —
so nothing compels a job to pass before a merge. Several tasks in this programme add legs to
`pr-checks.yml` as load-bearing guards (notably the machine-root allowlist completeness pin). Treat
them as *detection* until the owner takes the billing decision: they will tell you a rule was broken,
they will not stop the break from merging. Run the leg locally through `node ci/lib/run.mjs <repo>`
before you push, because on this plan that local run is the only thing that actually blocks you.

---

## What exists today

Every path below was read at `origin/main` on 2026-08-28: Installers `5b129523`, Backend `0cf9021e` (ECS td 322), Frontend `cac574ae`. Line numbers are from `git show origin/main:<path>`.

### The four-axis effect truth is BUILT and WIRED, end to end

This is the single most important fact for this wave, and it inverts the obvious plan. DeVoid already has the vocabulary Workstream 6 asks for and the receipt separation Workstream 7 asks for. Most of what follows is connecting, not building.

- `internal/airuntime/effect_truth.go:76-119` — `FourAxisEffectTruth` (struct `:76-84`) keeps **requested / adapter-expressed / observed-actual / graded outcome** on four independent axes, with `ValidateFourAxisEffectTruth` (`:88-119`) enforcing "EXPRESSED iff an expressed effect is present" (`:96-98`) and "observed present iff observer != NONE" (`:105-108`).
- `internal/airuntime/effect_truth.go:11-29` — `ActualEffectObserver` is a closed set: `NONE`, `RUNTIME_ACK`, `BROWSER_CHECKPOINT`, `PROXY_CHECKPOINT`, `MCP_BROKER`, `FINAL_STATE_GRADER`. **`RUNTIME_ACK` has zero producers** anywhere in the tree (verified: the only two hits are its own declaration at `:15` and the tuple at `:24`).
- `internal/airuntime/effect_truth.go:44-52` — `SecurityOutcome` is the independently graded axis; `UNKNOWN` is required with no proof.
- `internal/airuntime/effect_receipt.go:107-148` — `Validate` enforces the **local writer boundary**: this endpoint may not assert an observed actual effect (`:133-135`) and may not certify a security outcome (`:136-138`). That is already the honest floor Workstream 7 demands. Note `:139-142`: the governance-matches-translation rule is **exempted** when `TranslationDisposition == NOT_APPLICABLE`, which is what makes a non-adapter receipt legal.
- `internal/airuntime/vocab.go:92-136` — the twelve-member `EnforcementEffect` tuple (constants `:92-110`, ordered tuple `:113-126`), including `restrict-capability` at `:109` / `:125`.

  ⚠️ **The runtime-adapter vocabulary has NO cross-repo pin.** An earlier draft of this wave said the tuple was "pinned three ways: `airuntime` (typed) == `internal/controls` wire == the TypeScript `AI_SECURITY_PORTABLE_ORDERED_TUPLES` tuples". **That is wrong and the code's own comments are wrong with it.** `internal/airuntime/vocab_parity_test.go:13-21` states that the expected tuples are "EMBEDDED here as literal string slices rather than read from the TS file" because "a path read would couple two repos", and then claims "If the TS contract changes, all three fail together until reconciled." It does not: the Go literals are hand-typed, the test imports only `internal/controls`, and nothing in the Installers module reads the `.ts`. `internal/airuntime/vocab.go:15-31` repeats the same false claim in prose. **Append a member to `ENFORCEMENT_EFFECTS` or `CANONICAL_HOOK_EVENTS` in TypeScript and every Go test stays green.** The real pin is Go-typed == Go-wire, and that is it. See **Wave 1 Task 2**, which owns closing this edge by reading `v1Policy.orderedTuples` out of the already-embedded, already-digest-pinned `internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json`.

  What survives, and is what this wave actually depends on, is the **membership fact**, verified independently in all three places: `restrict-capability` is present in Go (`vocab.go:109`), on the heartbeat wire (`internal/controls/attestation.go:425`, tuple `:434`), and in the TypeScript (`Backend/packages/shared-contracts/dist/generated/ai-security-portable.generated.d.ts:72`, twelve members). So Task 5 needs **no append and no Backend deploy** - because the member is already everywhere, not because a pin would have caught it.
- The tuple already separates pre- from post-action effects by name: `deny-tool` vs `replace-output` vs `replace-tool-result-with-feedback-and-continue`. There is **no generic `block`**. The strategy's "one generic block value" defect does not exist here.
- Backend persists all four axes (`src/ai-governance/services/ai-local-receipt-compat.util.ts:53-86` wire fields + owned metadata keys, `:129-147` the validating fold), and Frontend renders them as four distinct rows with post-tool honesty already built in (`app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx`, 326 lines; `:14-15` "A `POST_TOOL_USE` checkpoint means the tool ALREADY RAN - such a row is never phrased as 'prevented'; it reads 'flagged after the tool ran'").

### The obligation machinery is BUILT and correct, and two producers hand it lies

`internal/obligation/obligation.go` is a careful, honest executor: a nil capability is `UNSUPPORTED` with a pinned O01 trigger (`runSimple`, `:344-347`), every prevention-class kind at a post checkpoint is forced `UNSUPPORTED` with `POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM` (`executeOne`, `:215-239`), and `ExecuteWithEscalation` (`:366-388`) escalates once and folds most-restrictive so an escalated terminal is never weaker.

It has exactly two production callers (`git grep ExecuteWithEscalation` over `origin/main`, non-test: `ai_oracle_receipt.go:155`, `failure_oracle_route.go:84`) and **both hand it no-op capabilities that always return nil**:

| Site | Capability | Line | What `SATISFIED` then attests |
|---|---|---|---|
| `internal/daemon/ai_oracle_receipt.go:82` | `Deny` | `func() error { return nil }` | The SOT §14.8 finding, confirmed. The real deny happens downstream in the hook's handling of the block response, so `obligation:deny:SATISFIED` attests a **plan**. |
| `internal/proxy/failure_oracle_route.go:64` | `Deny` | `func() error { return nil }` | Same shape at `LOCAL_PROXY`. The proxy does write its own refusal, so the plan is usually kept - but nothing in the receipt says so. |
| `internal/proxy/failure_oracle_route.go:65` | `Quarantine` | `func() error { return nil }` | Records `hold-placed` with no hold mechanic invoked. |
| `internal/proxy/failure_oracle_route.go:66` | `Confirm` | `func() error { return nil }` | **New finding, not in the SOT.** The file's own header (`:9-11`) states that a confirm terminal this surface cannot satisfy "is executed as the HOLD ... never a faked confirmation ... (O01 TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE)". Because `Confirm` is non-nil, `runSimple` returns `REQUIRED` / `hold-placed-awaiting-confirmation` (`obligation.go:232-233`) and the `TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE` trigger is **never emitted**; `REQUIRED` is not one of the three states that set `Escalate` (`obligation.go:207-210`). The comment describes behaviour the code does not have. |

`RestrictCapability`, `Sanitize` and `Notify` are nil at both producers.

**Read this before touching either file.** `Outcome.ReasonToken()` (`obligation.go:126-136`) appends the detail slug **only for `FAILED`**. `UNSUPPORTED` renders as a bare `obligation:<kind>:UNSUPPORTED`; its pinned trigger lives in `Outcome.Detail` and nowhere else. Assertions that expect `obligation:deny:UNSUPPORTED:POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM` as a token will never match anything.

### The F01 catalog's whole post-effect half has no executor

The pinned closed-world catalog is 882 rows (`internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json`, top-level `failureOracle.catalog.rows`), counted directly at `origin/main`:

```
RESTRICT_CAPABILITY 344   DENY 250   HOLD 125   PROCEED_OBSERVED_ONLY 108   REQUIRE_CONFIRMATION 55
```

All 344 `RESTRICT_CAPABILITY` rows sit at the four `POST_*` checkpoints, 86 each, one block per surface: `RUNTIME_ADAPTER x POST_TOOL`, `LOCAL_PROXY x POST_UPSTREAM_RESPONSE`, `BROWSER_COMPOSER x POST_SUBMIT`, `BROWSER_UPLOAD x POST_UPLOAD_DISPATCH`. Every one carries `requestedEffect: restrict-capability`. **Nothing executes them.** Both non-test `ExecuteWithEscalation` callers are at pre-checkpoints. On the hook lane a `VerbRestrict` terminal produces only a reason suffix and is excluded from `failClosedVerb` (`cmd/devoid/ai_failure_resolver.go:161-171`) - no obligation, no capability drop, no receipt.

`airuntime.EffectRestrictCapability` has **zero producers** anywhere outside the two vocabulary tuples (`vocab.go:109`, `vocab.go:125`, `controls/attestation.go:425`, `:434`).

The catalog itself is well-formed and I found no defect in it: `RUNTIME_ADAPTER x POST_TOOL` holds exactly 98 rows, 86 `RESTRICT_CAPABILITY` and 12 `PROCEED_OBSERVED_ONLY`, and no prevention-class outcome at any `POST_*` checkpoint - so `verbForRow`'s post-checkpoint refusal (`internal/failureoracle/failureoracle.go:250-267`) never fires on the shipped catalog.

### There IS a per-checkpoint capability model, but it is per-adapter, checkpoint-only, and has no shared resolver

- Codex: `internal/airuntime/adapters/codex/effects.go:44-50` — a frozen `effectSets` map, checkpoint -> ordered strongest-to-weakest effects, with a **closed `codexEffect` type** (`:18-29`) so an unsupported effect has no name to reference. `EffectSet` (`:55`) returns it as canonical values; `selectStrongestSupported` (`:117`) degrades to `none` rather than fabricating. This is genuinely good work and is the model to generalize.
- Claude: `internal/airuntime/adapters/claudecode/detect.go:25-34` — `mediatedCheckpoints`, a flat five-entry checkpoint -> single-effect list.
- Neither is keyed by runtime version, binary digest, host, OS, hook dialect or managed source. There is no cross-adapter resolver: `EffectSet` is exported from the codex package only, and resolution happens inside each adapter's `TranslateDecision`.
- Nothing checks a policy's `requestedEffect` against a capability before acting on it. `spoolPromptOracleReceipt` (`ai_oracle_receipt.go:281`, checks at `:292` and `:397`) only checks `airuntime.IsEnforcementEffect` - vocabulary membership, not capability.
- `internal/airuntime.Registry` (`registry.go:315-375`) is an adapter-id lookup only (`Register`, `Lookup`, `IDs`, `Len`).
- `controls.AdapterCapabilityCertificate` (`internal/controls/attestation.go:648-663`) is the release-level certificate the strategy wants, keyed by adapter/version/contract/runtime/host/platform/hookDialect/runtimeVersionRange/checkpoint. **It has no producer**: the only non-test references are its declaration, the envelope field at `:682`, and `normalizeCertificate` on the wire-normalize path (`:1195`).

### The field-observation ledger records EMITTED and the ladder reads it as OBSERVED

`internal/fieldobs` is a well-built, content-free, closed-vocabulary ledger of controls that really fired, and it is wired (`cmd/devoid/ai_hook_runner.go:136`, `internal/daemon/ai_transport_observation.go:65`).

But `recordFieldObservation` (`cmd/devoid/ai_hook_runner.go:190-203`) writes when `out.TranslationDisposition == airuntime.TranslationExpressed` - i.e. when **DeVoid put deny bytes on stdout**. Nothing confirms the runtime honoured them. And `capabilitiesFromStatus` (`internal/airuntime/adapters/claudecode/detect.go:97`, promotion block `:159-168`) raises the certification rung to `CertObserved` on exactly that record.

That is the strategy's "treating hook stdout as proof the vendor honored it", live. It matters most on Codex, where the product's own code records that a deny it emitted was **not honoured**: `internal/airuntime/registry.go:220-224` says the stderr deny channel was measured on codex-cli 0.147.0 and "the client allowed the tool", and `DenyOnExit` (`:227-243`) carries the same lesson for exit codes, in its own words: "NO ADAPTER SETS THIS TODAY". SOT §13.1 adds that a Codex hook failure fails open at the vendor.

The vocabulary for the honest version already exists and has zero producers: `ActualEffectObserverRuntimeAck` = `RUNTIME_ACK` (`effect_truth.go:15`) and `DispositionRuntimeAcknowledgedEffect` = `runtime-acknowledged-effect` (`vocab.go:239`, in the pinned tuple at `:255` and in the TypeScript at `ai-security-portable.generated.d.ts:73`).

### Workstream 7's V2 lane exists ALMOST ENTIRELY on the Backend and not at all on the endpoint

`Backend/src/ai-governance/ai-enforcement-receipt-v2.ts` is a complete, hardened implementation of exactly what Workstream 7 specifies:

- `AiDecisionV2` (`:30-54`) — the **Decision Receipt**: policy/detector/normalizer digests, obligations, requested effect, evaluator identity, expiry, decision digest.
- `AiEnforcementReceiptWireV2` (`:89-160`) — the **Effect Receipt**: expressed effect, translation disposition, observed actual effect, observer, `actualEffectProof` (`:143`), obligation results with proof refs, before/after payload digests, `finalStateObservationRef` (`:153`), `receiptAssurance` (`:155`).
- `AiProofManifestV1` (`:65-82`) with `observerAssurance` (`:78`), and `AiReceiptAssuranceV2 = UNVERIFIED_LEGACY | VERIFIED_ENDPOINT_REPORT | INDEPENDENTLY_OBSERVED` (`:9-10`).
- `validateCausalBinding` (`:1063`) pins ten fields between receipt and decision.
- `resolveProofs` (`:1090-1131`) **refuses endpoint self-assertion of independent assurance** (`:1121-1125`) - the exact property Workstream 7 needs.
- `deriveCertifiedOutcome` (`:1162`) refuses impossible claims (a `PREVENTED` with a non-null after-digest, `:1168-1175`; a `SANITIZED` with no digest change, `:1180-1186`) and returns `UNKNOWN` on the endpoint-authenticated route because "this endpoint-authenticated route has no independently authenticated observer correlation" (`:1176-1178`).
- The transport exists: `EndpointEnforcementReceiptV2Dto` on the evidence batch (`src/ai-governance/dto/endpoint-evidence-batch.dto.ts:53`, field at `:153-154`), ingest (`endpoint-evidence-ingest.service.ts:1310-1401`), storage (migration `src/migrations/1786700000000-AddAiEnforcementReceiptsV2.ts`), read projection (`ai-query.service.ts:3730, 5954`), and console render (`obligation-axes.tsx:83-87`).

**The endpoint has never emitted one.** `git grep enforcementReceiptV2` over Installers Go returns only three unrelated hits in `internal/promptevidence/validate.go:1383-1425`. `internal/daemon/ai_oracle_receipt.go`'s own header says why: "the production V2/HMAC receipt writers stay DISABLED (custody prerequisites unmet)." The Backend agrees from its side: `ai-query.service.ts:5127-5137` records that `enforcementReceiptV2` is "null on 100% of rows in every tenant, permanently, and that is a MISSING PRODUCER, not a per-row failure".

**And there is a hard structural blocker, not a wiring gap.** `prepareReceipt` (`src/ai-governance/services/ai-enforcement-receipt.service.ts:158-170`) rejects any receipt whose `decisionId` is not already a server-registered decision (`unknown-causal-decision`). The only production producer of registered decisions is `AiEnforcementDecisionProducerService` (`ai-enforcement-decision-producer.service.ts:150`), whose one entry point `registerForIssuedBundle` (`:162-174`) mints exactly one decision per issued policy bundle - the authorization to *apply that bundle* (`mintBundleActivationDecision`, `:182-215`). There is no per-action decision, and `proposalFingerprint` is a server-keyed HMAC the endpoint cannot compute (`:211`, private method `:243`; the file says so itself at `:58`). Making a prompt or tool decision server-known first would reintroduce the backend round-trip that produced the 6-in-10 private-key leak (SOT §15.1). Task 6 and the "does NOT do" section handle this honestly.

### The canary receipt sink is unwired — and Wave 6 owns it

`internal/airuntimeintegrity/providers/claude/canary.go:332-344` — a nil `Receipts` sink is an explicit delivery FAILURE (`errNoReceiptSink`, declared `:59`), which demotes proven to error. `Receipts:` is assigned in exactly four places and all four are test files (`airuntimeintegrity/maintenance_test.go:64`, `codexmanaged/canary_host_test.go:289`, `codexmanaged/canary_live_test.go:74`, `codexmanaged/canary_test.go:111`). Re-verified at `origin/main` 2026-08-28. The destination exists and is signature-gated: `POST /api/v1/ai/policy-delivery/canary-receipt` (`Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:758`, `req.requestSigningVerifiedAgentId` at `:769`).

**This wave does not build it. Wave 6 Task 5 does.** See the pointer where Task 7 used to be.

### The E3 witness exists only as a human procedure

The one E3-grade observation in the product - "the marker file was never created while the allow twin created it" - lives in `internal/liveproof/register.json` (`pretooluse-deny-stops-side-effect`, `observed: true`, `observedAt` 2026-08-26T17:11:57Z) and `docs/ai-security/LIVE_PROOF_PROCEDURE.md#4b-...`. It is an operator runbook recorded as JSON in a test-only package. No code performs it. The register holds 8 proofs in total.

### What is honest already, and must not be "fixed"

- Post-effect labelling is correct on both surfaces: `obligation-axes.tsx:14-15`, `IsPostCheckpoint` (`failureoracle.go:57-62`), `oracleCheckpointFor` (`cmd/devoid/ai_failure_resolver.go:42-57`), and the effect labels (`Frontend/types/ai-governance.ts:3374-3387`, `"replace-output": "Replaced output"`, not "Blocked").
- The PostToolUse path stamping `DispositionRedactedThenSent` (`internal/daemon/ai_ingress.go:864`) is **accurate**, not an overclaim: the redacted tool result is what enters model context and later travels the wire. The strategy's enforceable guarantee - "poisoned bytes never become model context" - is what `updatedToolOutput` delivers. Do not change it.
- The console's enforcement-proof panel demotes "proven" three ways and never upward (`Frontend/app/ai-control-plane/protection-depth.tsx:846-861`).
- The human-permit machinery is strong: `devoid ai allow-once` requires a TTY on stdin *and* stdout, refuses any process classified as an AI runtime, and reads one keypress from the controlling terminal rather than stdin (`cmd/devoid/ai_allow_once_human.go`, header at `:14-20` records the measured 2026-08-10 incident where an agent released its own hold). Workstream 6's "the agent cannot mint or consume its own permit" is **already satisfied**; do not rebuild it.
- A trusted confirmation surface does exist on the tool lane (warn only, three required conditions, every failure lands on block): `cmd/devoid/ai_tool_warn_confirm.go`.

---

## Task 1: Build one capability resolver, derived from what the adapters already declare

**Files:**
- new `internal/airuntime/capability.go`
- new `internal/airuntime/capability_test.go`
- `internal/airuntime/adapters/codex/effects.go` (add an exported adapter method; the table itself is untouched)
- `internal/airuntime/adapters/claudecode/detect.go` (same)

### PRECONDITIONS

All must pass. **If any fails, STOP AND REPORT.** Do not substitute a different file, a different line, or a "close enough" symbol.

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/airuntime/adapters/codex/effects.go | sed -n '44,50p'
# MUST show `var effectSets = map[airuntime.CanonicalEvent][]codexEffect{` with
# EXACTLY five entries, POST_TOOL_USE at line 47 reading:
#   airuntime.EventPostToolUse:       {effReplaceAndContinue, effAddDeveloperCtx, effNone},

git show origin/main:internal/airuntime/adapters/claudecode/detect.go | sed -n '25,34p'
# MUST show `mediatedCheckpoints` with EXACTLY five entries.

git show origin/main:internal/airuntime/vocab.go | sed -n '114,125p' | grep -c Effect
# MUST print: 12        (the enforcement-effect tuple body has exactly 12 members;
#                        :113 is the `var EnforcementEffects = ...{` line and :126 the closing brace)

git show origin/main:internal/airuntime/registry.go | sed -n '315,375p' | grep -c '^func (r \*Registry)'
# MUST print: 4         (Register, Lookup, IDs, Len — an id lookup and nothing more)
```

### LANDMINES

- **Nothing in this task goes near the machine root.** If you find yourself creating any new entry under `%ProgramData%\devoid`, you are in the wrong task - and if you did it anyway, the SAME COMMIT must add the name to `boundaryChildNames` in `cmd/devoid-msi-root-guard/guard_windows.go:624-629`, or the next MSI operation dies with `machine root contains unknown entry` -> 1722 -> 1603 and rolls back the upgrade on **every enrolled endpoint** while every clean-box test stays green. This has happened three times: `.staging`, `aitrust`, `endpoint-identity.json`.
- **This task widens no agent-wire contract**, so the Backend-deployed-first rule does not apply. If your change starts sending a new key to the Backend, you have left the task: `AgentIngestValidationPipe` sets `forbidNonWhitelisted:false` on agent routes, so an undeclared key is **silently dropped** - no 400, no log, and the console looks fine.
- **The two adapter tables are the same tables `TranslateDecision` translates from.** That shared source is the whole point: a resolution can never disagree with what the adapter will emit. Do not copy the tables into the resolver. Do not "normalize" them. Read them.
- `EffectSet` returns a fresh slice by construction (`effects.go:52-54`); do not retain or mutate the map's own slice.

### DO NOT

- Do not add, remove or re-order a member of `effectSets` or `mediatedCheckpoints`. They are frozen and derived from each event's `expected-envelope.json` (`effects.go:31-34`). Widening a table to make a test pass is widening a capability claim nobody measured.
- Do not give `ResolveEffect` a production caller in this task. Tasks 2, 3 and 5 are its consumers and each takes its own risk.
- Do not weaken `codexEffect`'s closed-type guard (`effects.go:14-18`) to let the resolver see a broader vocabulary. It is the compile-time half of the defence.
- Do not invent a `VersionRange` other than `"*"`. The shipped tables were derived per checkpoint, not per version.

### What it is

An optional adapter interface plus a pure resolver. No wire change, no vocabulary change, no behaviour change on its own - Task 1 ships a function nobody calls yet.

```go
// airuntime
type CapabilityKey struct {
    AdapterID      string          // "claude-code" | "codex"
    Host           string          // binding host: "cli" | "vscode" | "claude-desktop" ...
    RuntimeVersion string          // exact reported version, or "" when unknown
    HookDialect    string          // the adapter's resolved dialect id, or ""
    Checkpoint     CanonicalEvent
}

type ResolutionClass string
const (
    ResolvedAsRequested ResolutionClass = "SUPPORTED_AS_REQUESTED"
    ResolvedStricter    ResolutionClass = "SUPPORTED_STRICTER"
    ResolvedWeaker      ResolutionClass = "SUPPORTED_WEAKER"
    ResolvedUnsupported ResolutionClass = "UNSUPPORTED"
)

type Resolution struct {
    Requested EnforcementEffect
    Resolved  EnforcementEffect // EffectNone when Unsupported
    Class     ResolutionClass
    // VersionRange is the range this answer is certified for. The shipped
    // tables are version-independent, so it is "*" today and says so rather
    // than implying a measurement nobody took.
    VersionRange string
}

// EffectCapable is OPTIONAL. An adapter that does not implement it resolves
// UNSUPPORTED for every effect - the honest floor, never a silent allow.
type EffectCapable interface {
    SupportedEffects(checkpoint CanonicalEvent) []EnforcementEffect // strongest -> weakest
}

func ResolveEffect(reg *Registry, key CapabilityKey, want EnforcementEffect) Resolution
```

The codex adapter implements `SupportedEffects` by returning `EffectSet(checkpoint)` verbatim. The claude adapter returns the single effect from `mediatedCheckpoints` for that checkpoint, or nil.

Ordering rule for `ResolvedStricter`: within one checkpoint's declared list, earlier is stricter (both existing tables are already documented strongest-to-weakest). Never promote across checkpoints.

### Tests to write (failing first)

- [ ] `TestResolveEffect_UnknownAdapterIsUnsupported` — a `CapabilityKey` naming an unregistered adapter resolves `UNSUPPORTED` with `Resolved == EffectNone`. Write it first; it fails to compile, then fails, then passes.
- [ ] `TestResolveEffect_AdapterWithoutEffectCapableIsUnsupported` — a registered adapter that does not implement `EffectCapable` never reports a supported effect. (Inert-shape 4: this is the genuinely-unknown member, not another known one.)
- [ ] `TestResolveEffect_CodexMatrixMatchesTranslateDecision` — for every (checkpoint x effect) pair in `CanonicalEvents` x `EnforcementEffects`, assert `ResolveEffect(...).Resolved` equals the `AdapterExpressedEffect` that `codex.TranslateDecision` actually produces for that pair (or `EffectNone` when the translation is not `EXPRESSED`). 11 checkpoints x 12 effects = 132 pairs, exhaustive. **Drive the real `TranslateDecision`, not a hand-built expectation table** (inert-shape 2).
- [ ] `TestResolveEffect_ClaudeMatrixMatchesTranslateDecision` — the same 132 pairs against the claude adapter (inert-shape 3: both branches, not one).
- [ ] `TestResolveEffect_NeverPromotesAcrossCheckpoints` — a `deny-tool` request at `POST_TOOL_USE` never resolves to `deny-tool`.
- [ ] `TestResolveEffect_VersionRangeIsStarUntilMeasured` — every resolution the shipped tables produce carries `VersionRange == "*"`. This is the pin that stops a later wave silently inventing a version-specific capability claim.

### DEFEAT TEST

```bash
cd /c/cwt/w5-t1
# 1. Mutate: widen the codex POST_TOOL_USE table with a prevention-class effect.
sed -i '47s/{effReplaceAndContinue, effAddDeveloperCtx, effNone}/{effDenyTool, effReplaceAndContinue, effAddDeveloperCtx, effNone}/' \
  internal/airuntime/adapters/codex/effects.go
# 2. Run:
go test ./internal/airuntime/... -run TestResolveEffect_CodexMatrixMatchesTranslateDecision 2>&1 | tee /tmp/w5t1-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'POST_TOOL_USE/deny-tool: resolver says "deny-tool", TranslateDecision expressed ""' /tmp/w5t1-red.txt
# 4. REVERT the mutation before committing anything:
git checkout -- internal/airuntime/adapters/codex/effects.go
git diff --exit-code internal/airuntime/adapters/codex/effects.go   # MUST exit 0
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** none at runtime - nothing calls `ResolveEffect` after Task 1. The only risk is a compile break in the two adapter packages, which the Go build gate catches immediately.

**ROLLBACK:** delete `capability.go`, `capability_test.go` and the two adapter methods. Nothing else references them. One `git revert` of one commit.

**EXIT:** `go test ./internal/airuntime/... -run 'TestResolveEffect' -v` reports **264** passing sub-cases (132 per adapter), and `git grep -n 'ResolveEffect(' -- '*.go' | grep -v _test | grep -v 'func ResolveEffect'` returns **zero lines** at merge time.

---

## Task 2: Replace the prompt checkpoint's no-op `Deny` with a resolution-backed capability

**Files:**
- `internal/daemon/ai_oracle_receipt.go` (`promptObligationCaps`, `:80-97`)
- `internal/daemon/ai_oracle_receipt_test.go`

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/daemon/ai_oracle_receipt.go | sed -n '80,82p'
# MUST print EXACTLY (tabs shown as leading whitespace):
# func (s *Server) promptObligationCaps(body aiPromptCheckBody) obligation.Capabilities {
# 	return obligation.Capabilities{
# 		Deny: func() error { return nil },

git show origin/main:internal/obligation/obligation.go | sed -n '344,347p'
# MUST show runSimple returning Outcome{kind, StateUnsupported, unsupportedTrigger} for a nil capability.

git show origin/main:internal/obligation/obligation.go | sed -n '126,136p'
# MUST show ReasonToken appending the detail slug ONLY when State == StateFailed.

git show origin/main:internal/daemon/ai_event_certification.go | sed -n '18,20p'
# MUST show: var hookCertificationRegistry = sync.OnceValue(func() *airuntime.Registry {
#              return adapters.Default("")
# This is the registry to pass to ResolveEffect. It EXISTS. Do not construct another one.

git grep -n 'func resolvedRuntimeID' origin/main -- '*.go'
# MUST print: origin/main:internal/daemon/ai_handlers.go:3709:func resolvedRuntimeID(agentType string) string {
git grep -n 'func safeSurface' origin/main -- '*.go'
# MUST print: origin/main:internal/daemon/evidence_delivery.go:495:func safeSurface(surface string) string {

# Task 1 must be merged into your base — this task calls its function:
git grep -n 'func ResolveEffect' -- 'internal/airuntime/capability.go'
# MUST print one line. If it does not, Task 1 has not landed: STOP AND REPORT.
```

### LANDMINES

- **This is the wave's most valuable finding: a function that returns `nil` while the receipt stamps `deny: satisfied`.** `obligation.Capabilities.Deny` is documented as "the surface's REAL mechanics" (`obligation.go:138-140`). `func() error { return nil }` claims a mechanic that does not exist at this call site - the real deny happens downstream, in the hook's handling of the block response. Every `obligation:deny:SATISFIED` this daemon has ever emitted attests a **plan**, not an outcome. Treat any edit that makes this arm return `nil` unconditionally as a regression, whatever the reason.
- **The condition you gate on must be provable at runtime.** A fail-closed branch on a condition that cannot be proven bricked a machine in July 2026 and the operator uninstalled the agent. The condition here is "the routed adapter's own pinned effect table, the same table it translates from, contains `deny-prompt` at this checkpoint" - a local, offline, deterministic map lookup with no network, no clock, no filesystem, no vendor cooperation and no enrolment requirement. It cannot be made unprovable by load, by a dead daemon, or by an unenrolled endpoint. **If your implementation needs any of those, you have chosen the wrong condition: stop and report.**
- **The failure direction is stricter, never open, and that is load-bearing.** `ExecuteWithEscalation` (`obligation.go:368`) returns early without escalating when `terminal.Verb == VerbDeny`, so on the 50 `DENY` rows at `RUNTIME_ADAPTER x PRE_PROMPT` a wrong answer records loudly and changes nothing. On the 25 `HOLD` and 11 `REQUIRE_CONFIRMATION` rows it escalates through `MoreRestrictive` (`:373`), which is never weaker.
- **`FAILED` is the only state whose detail reaches the reason token** (`ReasonToken`, `obligation.go:126-136`). Returning an `obligation.CauseError` with a slug containing a colon or whitespace silently drops the slug (`:132-134`). `deny-not-expressible` is safe; `"deny not expressible"` is not.
- This task touches no machine-root entry and widens no wire contract. No `boundaryChildNames` edit, no Backend deploy ordering.

### DO NOT

- Do not change `internal/obligation/obligation.go`. If the obligation executor appears to block this task, the task is wrong - report it.
- Do not make the closure consult the backend, the policy bundle, the clock, or the filesystem. See the landmine above.
- Do not touch the `DelegatedApproval` or `Audit` arms of `promptObligationCaps` (`:83-101`). The `Audit` arm's tagged-cause handling was written to close a specific defect (`:91-95`) and is correct.
- Do not "fix" the `auditProbe = func() error { return nil }` you may notice at `internal/proxy/failure_oracle_route.go:80`. It is not a `Capabilities` member; it deliberately establishes only that an audit mechanic exists, and the real write patches the outcome afterwards (`:85-90`). A naive `git grep 'func() error { return nil }'` returns **4** hits in that file and only 3 of them are in scope, and none of them are in this task.

### The change

`Deny: func() error { return nil }` becomes a closure that asks Task 1's resolver whether the routed adapter can express `deny-prompt` at `USER_PROMPT_SUBMIT`, and returns a tagged error when it cannot:

```go
Deny: func() error {
    res := airuntime.ResolveEffect(hookCertificationRegistry(), airuntime.CapabilityKey{
        AdapterID:  resolvedRuntimeID(body.AgentType),
        Host:       safeSurface(body.Surface),
        Checkpoint: airuntime.EventUserPromptSubmit,
    }, airuntime.EffectDenyPrompt)
    switch res.Class {
    case airuntime.ResolvedAsRequested, airuntime.ResolvedStricter:
        return nil
    default:
        return obligation.CauseError("deny-not-expressible",
            errors.New("deny effect not expressible at this checkpoint: "+string(res.Class)))
    }
},
```

`body.AgentType` is `aiPromptCheckBody.AgentType` (`ai_handlers.go:658`); `body.Surface` is `:672`.

### Tests to write (failing first)

- [ ] `TestPromptDenyCapability_UnexpressibleRecordsFailed` — with a registry holding an adapter whose `SupportedEffects(USER_PROMPT_SUBMIT)` omits `deny-prompt`, `finalizePromptOracle` (`ai_oracle_receipt.go:153-157`) produces an outcome `{Kind: KindDeny, State: StateFailed, Detail: "deny-not-expressible"}` and `ReasonToken()` is exactly `obligation:deny:FAILED:deny-not-expressible`. Failing test first.
- [ ] `TestPromptDenyCapability_ExpressibleStaysSatisfied` — with the real claude adapter registered, the outcome is `{KindDeny, StateSatisfied}` and the emitted receipt is byte-identical to today's for the same input.
- [ ] `TestPromptDenyCapability_NeverWeakensATerminal` — over all **98** `RUNTIME_ADAPTER x PRE_PROMPT` catalog rows (50 DENY, 25 HOLD, 11 REQUIRE_CONFIRMATION, 12 PROCEED_OBSERVED_ONLY), assert `verbRank(after) >= verbRank(before)` for both an expressible and an unexpressible adapter.
- [ ] `TestPromptDenyCapability_NoNetworkNoClock` — the capability closure is exercised with a nil `appCfg` and a nil backend client and still answers. Assert the precondition loudly (inert-shape 5): fail the test if the injected client is non-nil.

### DEFEAT TEST

```bash
cd /c/cwt/w5-t2
# 1. Mutate: replace the whole Deny arm of promptObligationCaps with the old no-op, so the
#    file's line 82 reads exactly `Deny: func() error { return nil },` again. Then verify:
git grep -c 'ResolveEffect' -- internal/daemon/ai_oracle_receipt.go
# MUST print 0 (or exit 1). If it prints a positive number the mutation did not land —
# fix the mutation, do not skip the defeat test.
# 2. Run:
go test ./internal/daemon/... -run TestPromptDenyCapability_UnexpressibleRecordsFailed 2>&1 | tee /tmp/w5t2-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'want obligation:deny:FAILED:deny-not-expressible, got obligation:deny:SATISFIED' /tmp/w5t2-red.txt
# 4. REVERT:
git checkout -- internal/daemon/ai_oracle_receipt.go
git diff --exit-code internal/daemon/ai_oracle_receipt.go   # MUST exit 0
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** the F01 degraded-inspection path at the prompt checkpoint only - the path that runs when a prompt could not be evaluated. This code is unreachable when inspection succeeds, so nobody's clean prompt is affected. A wrong "unexpressible" answer for a runtime that can in fact deny turns a `HOLD` into a `DENY` on a prompt DeVoid already could not evaluate; a developer sees a blocked prompt with `failure-oracle:` reason tokens instead of a hold. Bounded above by `MoreRestrictive` and below by the fact that `VerbDeny` terminals never escalate at all.

**ROLLBACK:** one line, back to `Deny: func() error { return nil },`. No data, no wire, no migration, no deploy.

**EXIT:** two commands, both must pass.

```bash
go test ./internal/daemon/... -run 'TestPromptDenyCapability' -v   # 4 tests PASS
# and the grep gate — zero bare no-op Deny arms in a Capabilities literal:
git grep -n 'Deny: *func() error { return nil }' -- 'internal/daemon/ai_oracle_receipt.go'
# MUST return nothing (exit status 1).
```

---

## Task 3: Fix the proxy's three no-op capabilities, and make `Confirm` honestly nil

**Files:**
- `internal/proxy/failure_oracle_route.go` (`proxyObligationCaps`, `:56-70`; header comment `:3-11`)
- `internal/proxy/failure_oracle_route_test.go`

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/proxy/failure_oracle_route.go | sed -n '62,69p'
# MUST show proxyObligationCaps with EXACTLY these three no-ops at :64/:65/:66 —
#   Deny:              func() error { return nil },
#   Quarantine:        func() error { return nil },
#   Confirm:           func() error { return nil },
# and DelegatedApproval/Audit taking the passed-in funcs.

git show origin/main:internal/proxy/failure_oracle_route.go | sed -n '9,11p'
# MUST contain "TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE" — this is the claim the code does not keep.

git show origin/main:internal/obligation/obligation.go | sed -n '227,233p'
# MUST show KindRequireConfirmation -> runSimple(..., TriggerTrustedConfirmationSurfaceUnavailable,
#            StateRequired, "hold-placed-awaiting-confirmation")

git show origin/main:internal/obligation/obligation.go | sed -n '207,210p'
# MUST show Escalate set for StateUnsupported, StateUnsatisfied, StateFailed — and NOT StateRequired.

git show origin/main:internal/obligation/obligation.go | sed -n '90p'
# MUST print: 	TriggerTrustedConfirmationSurfaceUnavailable = "TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE"

git show origin/main:internal/proxy/ai_proxy.go | sed -n '568,581p'
# MUST show the proxy writing its own deterministic refusal — the mechanic the Deny closure will bind to.
```

### LANDMINES

- **`Confirm: nil` is the point of this task, not an oversight.** A nil member means "this surface cannot execute that kind" and produces `UNSUPPORTED` with the pinned trigger (`obligation.go:138-140`, `runSimple` `:345-347`). The proxy has no trusted confirmation surface, and the file already says so. An agent optimising for "make the tests pass" will be tempted to supply *some* callable; do not.
- **This changes a `REQUIRED` into an `UNSUPPORTED`, which sets `Escalate`.** `REQUIRED` is not in the escalate set (`obligation.go:207-210`), which is exactly why the pinned trigger has never been emitted. After the change, `ExecuteWithEscalation` escalates once through `MoreRestrictive` (`:371-373`) - never weaker. Behaviourally the proxy already holds on all 11 affected rows; what changes is the reason text and, on a subset, a hold that becomes a deny.
- **`UNSUPPORTED` does not carry its trigger in the reason token.** `ReasonToken()` appends the detail only for `FAILED` (`obligation.go:126-136`). Assert the token as `obligation:require_confirmation:UNSUPPORTED` and the trigger separately as `Outcome.Detail`. A test asserting `obligation:require_confirmation:UNSUPPORTED:TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE` will never match anything and is inert.
- **The provable condition for `Deny` and `Quarantine` is "a writer is bound to this handler"** - a local struct-field nil check, not a network probe. At `LOCAL_PROXY` the deny genuinely is deterministic: the proxy writes the refusal itself (`internal/proxy/ai_proxy.go:568-581`). Do not gate on anything that a dead daemon or an unenrolled endpoint could make unanswerable.
- No machine-root entry, no wire contract widening, no Backend ordering.

### DO NOT

- Do not touch `auditProbe` at `:80`. It is not a `Capabilities` member and its `return nil` is correct by design: it establishes that an audit mechanic exists, and a real write failure patches the outcome to FAILED afterwards (`:85-90`). `git grep -c 'func() error { return nil }'` reports **4** in this file; only 3 are in scope.
- Do not change `internal/obligation/obligation.go`, `internal/failureoracle/`, or the pinned catalog. If one of them blocks the task, the task is wrong - report it.
- Do not delete or soften `proxyAuditUnsatisfied` / `denyForProxyAudit` (`:85-86`). Those are an existing guard.
- Do not let anything be forwarded upstream on an escalated confirm row. That is the customer-visible invariant and it has its own test below.

### The change

Three separate changes, and the third is the one with real behaviour:

1. `Deny` — becomes a closure over the handler's own refusal writer, returning a tagged error when the handler has no writer bound.
2. `Quarantine` — same, over the hold writer.
3. `Confirm` — becomes **nil**.

Also delete the now-false half of the header comment at `:9-11` and replace it with what the code does.

### Tests to write (failing first)

- [ ] `TestProxyConfirm_EmitsTrustedConfirmationUnavailable` — for a `REQUIRE_CONFIRMATION` terminal at `LOCAL_PROXY x PRE_UPSTREAM_DISPATCH`, `ReasonToken()` is exactly `obligation:require_confirmation:UNSUPPORTED` and `Outcome.Detail` is exactly `TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE`. Failing test first.
- [ ] `TestProxyConfirm_EscalatedTerminalIsNeverWeaker` — for all **11** `REQUIRE_CONFIRMATION` rows at that surface/checkpoint, `verbRank(after) >= verbRank(VerbConfirmTrustedSurface)`.
- [ ] `TestProxyConfirm_NothingIsForwarded` — drive the real handler for each of those 11 rows and assert the upstream transport received **zero** requests, before and after the change. This is the customer-visible invariant.
- [ ] `TestProxyDeny_UnboundWriterRecordsFailed` — with no refusal writer bound, the `DENY` outcome is `StateFailed`, not `StateSatisfied`.
- [ ] `TestProxyQuarantine_UnboundWriterRecordsFailed` — the same for the hold writer (inert-shape 3: both branches).

### DEFEAT TEST

```bash
cd /c/cwt/w5-t3
# 1. Mutate: put the no-op Confirm back. (Whitespace-insensitive — gofmt realigns the
#    struct fields when Confirm becomes nil, so match on the key, not on the alignment.)
perl -0pi -e 's/Confirm:\s*nil,/Confirm: func() error { return nil },/' \
  internal/proxy/failure_oracle_route.go
grep -n 'Confirm:' internal/proxy/failure_oracle_route.go
# MUST now show a line containing: Confirm: func() error { return nil },
# If it still shows `Confirm: nil`, the mutation did not land — fix the mutation, do not
# skip the defeat test.
# 2. Run:
go test ./internal/proxy/... -run TestProxyConfirm_EmitsTrustedConfirmationUnavailable 2>&1 | tee /tmp/w5t3-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'want obligation:require_confirmation:UNSUPPORTED, got obligation:require_confirmation:REQUIRED' /tmp/w5t3-red.txt
# 4. REVERT:
git checkout -- internal/proxy/failure_oracle_route.go
git diff --exit-code internal/proxy/failure_oracle_route.go   # MUST exit 0
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** 11 pinned catalog rows at the proxy pre-dispatch checkpoint. Behaviourally the proxy already holds on all of them, so the developer-visible change is the reason text and, on a subset, a hold that becomes a deny. Nothing is forwarded either way - pinned by `TestProxyConfirm_NothingIsForwarded`. Whoever notices is a developer reading a proxy refusal message.

**ROLLBACK:** restore the three closures. One commit revert; no state, no data, no deploy.

**EXIT:**

```bash
go test ./internal/proxy/... -run 'TestProxyConfirm|TestProxyDeny_Unbound|TestProxyQuarantine_Unbound' -v  # 5 tests PASS
git grep -c 'func() error { return nil }' -- 'internal/proxy/failure_oracle_route.go'
# MUST print exactly 1  (the auditProbe at :80, which stays)
```

---

## Task 4: Stop the field-observation ledger calling EMITTED "observed"

**Files:**
- `internal/fieldobs/fieldobs.go` (record schema; bump `schemaVersion` at `:72`)
- `cmd/devoid/ai_hook_runner.go` (`recordFieldObservation`, `:190-203`)
- `internal/airuntime/adapters/claudecode/detect.go` (`capabilitiesFromStatus`, promotion block `:159-168`)
- `internal/fieldobs/fieldobs_test.go`, `cmd/devoid/ai_hook_runner_test.go`

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/fieldobs/fieldobs.go | sed -n '69,72p'
# MUST show: const schemaVersion = 1   with the "unknown version is treated as EMPTY" comment.

git show origin/main:internal/fieldobs/fieldobs.go | grep -n 'func RecordCheckpoint'
# MUST print: 172:func RecordCheckpoint(dir, adapter string, cp airuntime.CanonicalEvent, eff airuntime.EnforcementEffect) error {

git show origin/main:cmd/devoid/ai_hook_runner.go | sed -n '190,193p'
# MUST show recordFieldObservation gating on out.TranslationDisposition != airuntime.TranslationExpressed

git show origin/main:internal/airuntime/adapters/claudecode/detect.go | sed -n '161,163p'
# MUST print:
# 				if cap.CertificationState != string(airuntime.CertEnforcementTested) {
# 					cap.CertificationState = string(airuntime.CertObserved)
# 				}

# The vocabulary for the honest version already exists and has zero producers — confirm both:
git grep -n 'ActualEffectObserverRuntimeAck' origin/main -- '*.go' | grep -v '_test\.go'
# MUST print EXACTLY two lines, both in internal/airuntime/effect_truth.go — :15 (the
# declaration) and :24 (the tuple). Any third line means a producer now exists and this
# task's premise has changed: STOP AND REPORT.
git show origin/main:internal/airuntime/vocab.go | sed -n '239p'
# MUST print: 	DispositionRuntimeAcknowledgedEffect                GovernanceDisposition = "runtime-acknowledged-effect"
```

### LANDMINES

- **This is the riskiest task in the wave and the reason is not technical.** It is a deliberate downgrade of a green surface. Every endpoint that shows `USER_PROMPT_SUBMIT: observed` in `devoid ai certify` and in the console's capability rows will show `loaded` after it ships, because **no runtime-acknowledgement channel exists yet** - `RUNTIME_ACK` and `runtime-acknowledged-effect` both have zero producers. Nothing enforcing changes; the claim changes.
- **RELEASE PAIRING, MANDATORY.** This task must ship in the **same release as Wave 6 Tasks 1-5**, which are what can legitimately restore `observed`. Without the pairing, every endpoint's certification display drops `observed` -> `loaded` with nothing able to restore it, and an operator reads it as a regression and asks for a rollback of a plan working as designed. (RECONCILIATION §3 item 16.)
- **Three tasks in this programme turn green surfaces red and they must not land together.** This one, Wave 4 Task 8 (Codex `managed` -> `cooperative`), and Wave 8 Task 6 (`PREVENTION_ACTIVE` reads zero). All three are correct and none changes enforcement. **Land Wave 8 Task 6 first** - it is the one that explains the other two - then sequence these across releases with a release note each. (RECONCILIATION §4 R7.)
- **`fieldobs` already degrades safely on an unknown schema version** (`fieldobs.go:69-72`): an older agent reading a newer ledger sees EMPTY, i.e. "never observed". That is the safe direction and it is why the bump is cheap. Do not change that behaviour.
- **Do not descend the ladder.** `detect.go:161` guards `CertEnforcementTested` from being pulled down. Preserve it.
- No machine-root entry, no wire contract widening, no Backend deploy ordering. The ledger is endpoint-local.

### DO NOT

- Do not create a `RUNTIME_ACKNOWLEDGED` **producer** in this task. There is no acknowledgement channel; inventing one would be the exact defect this task removes, one level up. Add the member and the reader; leave the writer to Wave 6.
- Do not widen `recordFieldObservation`'s gate. Its current comment (`:177-186`) explains why `none` is excluded and `audit-only` is included; both are correct.
- Do not touch `fieldObsDir` (`:153-163`). It is the hermeticity seam that keeps unit tests out of the developer's real `~/.devoid`.
- Do not relabel the console strings to hide the change. The whole point is that the surface now says something true.

### The change

Add a closed `Assurance` field to the ledger record with two members today - `EMITTED` and `RUNTIME_ACKNOWLEDGED` - and record `EMITTED` at the existing call site, because that is all `TranslationDisposition == EXPRESSED` establishes. Bump `schemaVersion` to 2. Then `capabilitiesFromStatus` raises the rung to `CertObserved` **only** on a `RUNTIME_ACKNOWLEDGED` record; an `EMITTED` record raises it to `CertLoaded` and no further.

### Tests to write (failing first)

- [ ] `TestFieldObs_EmittedDoesNotRaiseObserved` — a ledger holding only `EMITTED` records leaves every checkpoint at `loaded`. Failing test first.
- [ ] `TestFieldObs_RuntimeAcknowledgedRaisesObserved` — a `RUNTIME_ACKNOWLEDGED` record raises exactly that checkpoint to `observed` and no other.
- [ ] `TestFieldObs_UnknownSchemaVersionIsEmpty` — regression pin on `fieldobs.go:69-72`, so the bump cannot silently promote garbage. Feed it version `99`, not just `1` and `2` (inert-shape 4).
- [ ] `TestFieldObs_CodexEmittedDenyIsNotObserved` — the specific case the product measured (`registry.go:220-224`): a codex adapter that expressed a deny records `EMITTED`, and `devoid ai certify codex` prints `loaded`, not `observed`. (inert-shape 3: codex as well as claude.)
- [ ] `TestFieldObs_LadderNeverDescends` — a checkpoint already at `enforcement-tested` is not pulled down by an `EMITTED` record (preserves the `detect.go:161` guard).

### DEFEAT TEST

```bash
cd /c/cwt/w5-t4
# 1. Mutate: restore the unconditional promotion. Edit detect.go by hand so that the
#    assurance guard your fix added is removed and the assignment inside the
#    `if cap.CertificationState != string(airuntime.CertEnforcementTested)` block reads,
#    unconditionally, exactly:
#        cap.CertificationState = string(airuntime.CertObserved)
#    Leave the CertEnforcementTested never-descend guard in place — this defeat test is
#    for the EMITTED/RUNTIME_ACKNOWLEDGED distinction, not for that guard.
grep -n 'CertLoaded\|CertObserved\|Assurance' internal/airuntime/adapters/claudecode/detect.go
# MUST now show CertObserved assigned with NO assurance condition, and no CertLoaded arm.
# If it still shows an assurance condition, the mutation did not land — fix it, do not
# skip the defeat test.
# 2. Run:
go test ./internal/airuntime/... -run TestFieldObs_EmittedDoesNotRaiseObserved 2>&1 | tee /tmp/w5t4-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'USER_PROMPT_SUBMIT: want certificationState "loaded", got "observed"' /tmp/w5t4-red.txt
# 4. REVERT:
git checkout -- internal/airuntime/adapters/claudecode/detect.go
git diff --exit-code internal/airuntime/adapters/claudecode/detect.go   # MUST exit 0
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** every endpoint's certification display and the console's per-checkpoint capability rows. **No enforcement path reads `CertificationState`** - verify this yourself before shipping with `git grep -n 'CertificationState' -- '*.go' | grep -v _test` and confirm every reader is a display or attestation path. The people who notice are operators looking at coverage, and they will notice on day one. Ship the release note with it, and ship it paired with Wave 6.

**ROLLBACK:** revert `detect.go:159-168` to the current unconditional promotion. The ledger's new field is additive and harmless if unread; the schema bump degrades old readers to EMPTY, which is the safe direction.

**EXIT:** on a rig with no runtime acknowledgement,

```bash
devoid ai certify claude-code | grep -c ' observed'   # MUST print 0
devoid ai certify codex       | grep -c ' observed'   # MUST print 0
git grep -n 'CertObserved' -- '*.go' | grep -v _test  # every hit must be gated on RUNTIME_ACKNOWLEDGED
```

---

## Task 5: Give the 344 post-checkpoint RESTRICT_CAPABILITY rows a real executor, by wiring the taint store that already restricts

**Files:**
- new `internal/daemon/ai_posttool_obligations.go`
- `internal/daemon/ai_event_certification.go` (one new certification constructor, alongside `delegatedAuthorityCertification` at `:50-58`)
- `internal/daemon/ai_ingress.go` (`handleAIPostTool`, `:796-891`; the taint branch at `:867-883`)
- new `internal/daemon/ai_posttool_obligations_test.go`

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/daemon/ai_ingress.go | sed -n '867,883p'
# MUST show the taint branch: ingressrisk.HighConfidence -> ingressTaintClasses(pr, ig) ->
# recordContextTaintWithTitle(..., certification) with certification built by
# untranslatedHookCertification(body.AgentType, airuntime.EventPostToolUse, airuntime.EffectAuditOnly)

git show origin/main:internal/daemon/ai_event_certification.go | sed -n '50,82p'
# MUST show delegatedAuthorityCertification (the PRECEDENT to copy) and certificationFromOutcome,
# which builds the V1 receipt and RETURNS NIL when Validate() fails (:78-80).

git show origin/main:internal/daemon/ai_handlers.go | sed -n '3054,3056p'
# MUST show the taint -> hold-next-risky overlay reading s.aiTaint.IsTainted and taintRisky.

git grep -n 'func ingressTaintClasses' origin/main -- '*.go'
# MUST print: origin/main:internal/daemon/ai_ingress.go:1090:func ingressTaintClasses(...
git grep -n 'func taintRisky' origin/main -- '*.go'
# MUST print: origin/main:internal/daemon/ai_taint.go:159:func taintRisky(toolName string, ...

git show origin/main:internal/obligation/obligation.go | sed -n '252,263p'
# MUST show KindRestrictCapability: nil -> UNSUPPORTED; empty dropped list -> UNSATISFIED/"nothing-dropped".

git show origin/main:internal/obligation/obligation.go | sed -n '215,239p'
# MUST show every prevention-class kind forced UNSUPPORTED at a post checkpoint.

git show origin/main:internal/airuntime/vocab.go | sed -n '109p'
# MUST print: 	EffectRestrictCapability EnforcementEffect = "restrict-capability"
```

### LANDMINES

- **The capability tokens come from `ingressTaintClasses`, not from `taintRisky`.** `taintRisky` (`ai_taint.go:159`) takes the *next* tool's name and input and runs on the **tool-decision lane** (`ai_handlers.go:3055`), which has not happened yet at post-tool time. Calling it here means inventing a tool name. The closed list available at `POST_TOOL` is `ingressTaintClasses(pr, ig)` (`ai_ingress.go:1090`, "deduped, sorted class names contributing to a taint"), which is what `:873` already computes two lines away.
- **`restrict-capability` needs no vocabulary append and no Backend deploy** - it is already the 12th member in Go (`vocab.go:109`), on the heartbeat wire (`controls/attestation.go:425`) and in TypeScript (`ai-security-portable.generated.d.ts:72`). That is a membership fact verified in all three places, **not** an inference from a cross-repo pin: there is no cross-repo pin (see "What exists today"). If you find yourself needing to add anything to `ENFORCEMENT_EFFECTS`, stop - you have left the task, and the ordering rule then becomes hard: **the Backend must be deployed FIRST**, because `AgentIngestValidationPipe` sets `forbidNonWhitelisted:false` on agent routes and **DROPS** unknown keys instead of rejecting them, so the reverse order loses the field silently with no 400 and no log.
- **`certificationFromOutcome` returns `nil` when `Validate()` fails** (`ai_event_certification.go:78-80`). A wrong disposition therefore produces **no receipt at all**, silently, and a test that only asserts "no crash" stays green. Assert the receipt is non-nil and that `Validate()` returned nil, loudly.
- **`GovernanceDisposition: devoid-mediated` with `TranslationDisposition: NOT_APPLICABLE` is legal** and this is the one place it matters: `effect_receipt.go:139-142` exempts `NOT_APPLICABLE` from the governance-matches-translation rule. `delegatedAuthorityCertification` (`:41-49`) documents exactly this exemption. Copy that shape.
- **Every prevention-class capability stays nil.** `obligation.Execute` forces them `UNSUPPORTED` with `POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM` at a post checkpoint anyway (`obligation.go:215-239`); nil makes that structural rather than incidental.
- **`UNSUPPORTED` does not carry its trigger in the reason token.** Assert `Outcome.Detail`, not a `:TRIGGER` suffix on the token.
- No machine-root entry. Nothing under `%ProgramData%\devoid` changes, so no `boundaryChildNames` edit is required - and if that ever stops being true, the guard edit goes in the **same commit** or the next MSI operation dies 1722 -> 1603 on every enrolled endpoint while clean-box CI stays green.

### DO NOT

- Do not build a new spool path. The post-tool lane **already** attaches a V1 four-axis receipt through `recordContextTaintWithTitle(..., certification)` at `ai_ingress.go:874-878`. Add a constructor next to `delegatedAuthorityCertification` and pass it there.
- Do not emit outside the `tainted` branch. A clean tool result must produce no new event.
- Do not change `internal/obligation/obligation.go`, the pinned catalog, or the taint write / hold mechanic in `ai_handlers.go:3047-3087`. This task adds a **receipt**, not an enforcement.
- Do not set `SecurityOutcome` to anything but `UNKNOWN`, or `ActualEffectObserver` to anything but `NONE`. `effect_receipt.go:133-138` will reject it, `certificationFromOutcome` will return nil, and you will ship a silent no-op.

### The change

The capability the catalog asks for is already implemented and wired - it just does not run through the obligation machinery or land in a receipt. `handleAIPostTool` taints the session on a high-confidence ingress signal (`ai_ingress.go:867-883`), and `handleAIToolDecision` reads that taint and holds the next risky action (`ai_handlers.go:3047-3087`). That **is** `RESTRICT_CAPABILITY`: subsequent capability is narrowed after an effect that already happened.

Build `postToolObligationCaps` supplying:
- `RestrictCapability` — performs the existing taint write and returns the closed list of restricted capability tokens **derived from `ingressTaintClasses(pr, ig)`**, not free text. Zero tokens returns an empty slice, which `obligation.go:260-262` correctly records as `UNSATISFIED` / `nothing-dropped`.
- `Audit` — the same `ensureEvidenceDelivery` probe `promptObligationCaps` uses (`ai_oracle_receipt.go:86-100`).
- Every prevention-class capability stays **nil**.

Then build the receipt with a `restrictCapabilityCertification(adapterID, checkpoint)` constructor modelled line-for-line on `delegatedAuthorityCertification` (`ai_event_certification.go:50-58`): `RequestedEffect: EffectRestrictCapability`, `TranslationDisposition: TranslationNotApplicable` (no adapter was asked to express anything), `AdapterExpressedEffect` empty, `ActualEffectObserver: ActualEffectObserverNone`, `SecurityOutcome: SecurityOutcomeUnknown`, `GovernanceDisposition: DispositionDevoidMediated`. Pass it at `ai_ingress.go:874-878` in place of the `EffectAuditOnly` certification, on the taint branch only.

### Tests to write (failing first)

- [ ] `TestPostToolObligations_RestrictSatisfiedWithDroppedList` — a tainting tool result produces `obligation:restrict_capability:SATISFIED` with a non-empty `Outcome.Detail` whose comma-separated members are all in `ingressTaintClasses`' closed vocabulary. Failing test first.
- [ ] `TestPostToolObligations_PreventionKindsAreUnsupported` — `KindDeny` and `KindQuarantine` at `POST_TOOL` produce `Outcome.State == StateUnsupported` and `Outcome.Detail == "POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM"`, never `StateSatisfied`.
- [ ] `TestPostToolObligations_NoTaintNoReceipt` — a clean tool result spools zero additional events. Assert the spool depth is unchanged.
- [ ] `TestPostToolObligations_ReceiptValidates` — the certification is **non-nil** and its receipt passes `airuntime.LocalEffectReceiptCompatibilityV1.Validate()`, including the local-writer boundary at `effect_receipt.go:133-138`. Assert non-nil loudly (inert-shape 5: `certificationFromOutcome` returns nil on failure).
- [ ] `TestPostToolObligations_SecurityOutcomeStaysUnknown` — the endpoint never certifies an outcome for a post-effect restriction.
- [ ] `TestPostToolObligations_CatalogRowsHaveAnExecutor` — walk the 86 `RUNTIME_ADAPTER x POST_TOOL` `RESTRICT_CAPABILITY` rows in the embedded catalog and assert a non-nil `RestrictCapability` capability for each. Read the catalog, do not hand-build the row list (inert-shape 2).

### DEFEAT TEST

Primary — mutates only this task's own new code:

```bash
cd /c/cwt/w5-t5
# 1. Mutate: make the RestrictCapability closure return an empty dropped list — change its
#    successful return to `return nil, nil`. Then verify the taint classes no longer reach it:
grep -n 'ingressTaintClasses' internal/daemon/ai_posttool_obligations.go
# MUST print nothing reachable from the RestrictCapability return. If the closure still
# returns a populated slice the mutation did not land — fix it, do not skip the defeat test.
# 2. Run:
go test ./internal/daemon/... -run TestPostToolObligations_RestrictSatisfiedWithDroppedList 2>&1 | tee /tmp/w5t5-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'want obligation:restrict_capability:SATISFIED, got obligation:restrict_capability:UNSATISFIED' /tmp/w5t5-red.txt
# 4. REVERT:
git checkout -- internal/daemon/ai_posttool_obligations.go
git diff --exit-code internal/daemon/ai_posttool_obligations.go   # MUST exit 0
```

Second — pins the shared post-checkpoint guard. **This mutation edits a file you must not change permanently; revert it in the same shell before doing anything else.**

```bash
cd /c/cwt/w5-t5
# 1. Mutate: drop the `if post` guard from the KindDeny arm (obligation.go:218-220).
sed -i '218,220d' internal/obligation/obligation.go
sed -n '215,220p' internal/obligation/obligation.go   # confirm KindDeny now falls straight to runSimple
# 2. Run:
go test ./internal/daemon/... -run TestPostToolObligations_PreventionKindsAreUnsupported 2>&1 | tee /tmp/w5t5b-red.txt
# 3. The output MUST contain this exact substring.
#    NOTE the value: caps.Deny is nil, so runSimple returns the DENY_EFFECT_UNAVAILABLE trigger,
#    NOT "SATISFIED". A test expecting SATISFIED here is asserting the wrong thing.
grep -F 'DENY Detail: want "POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM", got "DENY_EFFECT_UNAVAILABLE"' /tmp/w5t5b-red.txt
# 4. REVERT — MANDATORY, and verify:
git checkout -- internal/obligation/obligation.go
git diff --exit-code internal/obligation/obligation.go   # MUST exit 0
git status --porcelain internal/obligation/               # MUST print nothing
```

If either step 3 finds nothing, that test is inert. Do not proceed; report.

**BLAST RADIUS:** one extra durable evidence row per tainted tool result, on the existing V1 spool with an existing event type and existing wire fields. The Backend already accepts this exact shape (`hasLocalCompatReceiptTuple` -> `projectLocalEffectReceipt`, `endpoint-evidence-ingest.service.ts:1772, 1788`). Risk is spool volume on a noisy endpoint; the taint gate makes it rare. **Nobody's tool call is blocked, held or altered by this task** - the taint write and the hold it drives are untouched.

**ROLLBACK:** pass `untranslatedHookCertification(..., EffectAuditOnly)` again at `ai_ingress.go:874-878` and delete `ai_posttool_obligations.go`. The taint write and the hold are untouched either way.

**EXIT:**

```bash
go test ./internal/daemon/... -run 'TestPostToolObligations' -v
# TestPostToolObligations_CatalogRowsHaveAnExecutor MUST report 86 rows covered, up from 0.
```

---

## Task 6: Derive the E0-E3 effect-assurance level on the READ side, from axes already stored

**Files:**
- new `Backend/src/ai-governance/services/ai-effect-assurance.util.ts`
- new `Backend/src/ai-governance/services/ai-effect-assurance.util.spec.ts`
- `Backend/src/ai-governance/services/ai-query.service.ts` (the shared static `projectReceiptIdentity`, `:5158-5183`, and its two call sites at `:3737` and `:5961`)
- `Frontend/app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/__tests__/obligation-axes.test.tsx`

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Backend && git fetch origin
git rev-parse origin/main
# MUST print: 0cf9021e944b72ef2a3024e8687f4114db1f2468
cd /c/Users/Owner/Documents/Ceragon/Frontend && git fetch origin
git rev-parse origin/main
# MUST print: cac574ae063b4e91ec38ddb205ec5abe4cbc3dff

cd /c/Users/Owner/Documents/Ceragon/Backend
git show origin/main:src/ai-governance/services/ai-query.service.ts | sed -n '5127,5137p'
# MUST contain: "`enforcementReceiptV2` is null on 100% of rows in every tenant, permanently"
# READ THIS. It is why the derivation must NOT read e.enforcementReceiptV2.

git show origin/main:src/ai-governance/services/ai-query.service.ts | sed -n '5158,5183p'
# MUST show static projectReceiptIdentity(e: AiEvent), reading e.metadata and
# gating on hasLocalCompatReceiptTuple(m) and RECEIPT_ASSURANCES.has(assurance).

git show origin/main:src/ai-governance/services/ai-local-receipt-compat.util.ts | sed -n '53,67p'
# MUST show RECEIPT_WIRE_FIELDS with the four axes:
#   requestedEffect, adapterExpressedEffect, translationDisposition,
#   observedActualEffect, actualEffectObserver, governanceDisposition, securityOutcome

git show origin/main:src/ai-governance/services/ai-local-receipt-compat.util.ts | sed -n '74,86p'
# MUST show RECEIPT_METADATA_FIELDS — the keys the fold OWNS and strips from caller metadata.

git show origin/main:src/ai-governance/ai-enforcement-receipt-v2.ts | sed -n '1385p'
# MUST print a line containing: receiptAssurance: 'VERIFIED_ENDPOINT_REPORT',
git show origin/main:src/ai-governance/ai-enforcement-receipt-v2.ts | sed -n '1121,1125p'
# MUST show fail('self-asserted-independent-proof', ...)
```

### LANDMINES

- **The four axes live in `e.metadata`, NOT in `e.enforcementReceiptV2`.** `enforcementReceiptV2` is null on 100% of rows in every tenant, permanently, because no shipped agent emits a protocol-2 envelope - the Backend says so in its own comment at `ai-query.service.ts:5127-5137` and the Installers side confirms it (`git grep enforcementReceiptV2` over Go returns three unrelated hits). An implementation that reads `e.enforcementReceiptV2` derives **E0 for every row in the fleet** and every unit test built on synthetic objects still passes. This is the single way this task ships wrong.
- **Read the axes the way `projectReceiptIdentity` does**: `const m = (e.metadata ?? {}) as Record<string, unknown>`, gated by `hasLocalCompatReceiptTuple(m)` (`ai-local-receipt-compat.util.ts:93-98`) - the same predicate the write path uses. Put the derivation in the same static so the three console surfaces cannot disagree.
- **`receiptAssurance` is server-derived from the transport, never from the request body.** The fold strips an identically named caller key before restoring the trusted value (`RECEIPT_METADATA_FIELDS`, `:74-86`). Do not read an assurance from anywhere else, and do not default it.
- **E3 is unreachable by construction today, and the UI must say so rather than leave a blank.** `validateAndDeriveAiReceiptV2` hardcodes `receiptAssurance: 'VERIFIED_ENDPOINT_REPORT'` on the endpoint route (`ai-enforcement-receipt-v2.ts:1385`) and `resolveProofs` refuses a self-asserted independent manifest (`:1121-1125`). No producer of `INDEPENDENTLY_OBSERVED` exists anywhere.
- **This task widens no agent-wire contract**, so the Backend-deployed-before-agent-release rule creates no constraint here, and the programme rule that Wave 8 Task 5 must be the first Backend change applies to the three tasks that **do** widen `runtimeAdapters[]` (Wave 1 T8, Wave 4 T12, Wave 8 T8) - not to this one. Deploying still needs a fresh explicit owner ask like anything else.
- The Frontend's comment at `obligation-axes.tsx:142` says `receiptProtocolVersion` "has zero producers". At `origin/main` the Backend **does** project it (`ai-query.service.ts:3737, 5961`). Trust the Backend source, not the stale Frontend comment.

### DO NOT

- Do not store the level. Nothing new is written; the level is computed at read from columns the fold already validated.
- Do not add a column, a migration, or a metadata key. `TestEffectAssurance_NothingIsStored` pins this.
- Do not touch the ingest path, `foldLocalCompatReceipt`, or `RECEIPT_METADATA_FIELDS`.
- Do not use the words "proven", "prevented" or "enforced" as a claim about the outcome on any row below E3.
- Do not change the existing post-tool phrasing at `obligation-axes.tsx:14-15`. It is correct and it is one of the things this wave must not "fix".

### The derivation

| Level | Derivation from stored `metadata` keys |
|---|---|
| **E0 Intended** | `requestedEffect` present, `translationDisposition == 'NOT_APPLICABLE'`, `adapterExpressedEffect` null |
| **E1 Emitted** | `translationDisposition == 'EXPRESSED'` and `adapterExpressedEffect` non-null |
| **E2 Observed** | `actualEffectObserver != 'NONE'` and `observedActualEffect` non-null |
| **E3 Independently witnessed** | `receiptAssurance == 'INDEPENDENTLY_OBSERVED'` **and** E2 holds |

A row with no V1 tuple at all (`hasLocalCompatReceiptTuple(m) === false`) carries **no level**, not E0. An absent receipt is not an intended effect.

The render for E0/E1/E2 must read "not independently witnessed".

### Tests to write (failing first)

- [ ] `deriveEffectAssurance.spec` — a table test over all combinations of (`translationDisposition` x `actualEffectObserver` x `securityOutcome`) asserting exactly one level, with an explicit case for every impossible combination the fold already rejects, and an explicit case for a row with **no tuple at all** (inert-shape 4). Failing test first.
- [ ] `TestEffectAssurance_E3RequiresIndependentAssurance` — a receipt with `actualEffectObserver: 'FINAL_STATE_GRADER'` and `receiptAssurance: 'VERIFIED_ENDPOINT_REPORT'` derives **E2**, never E3.
- [ ] `TestEffectAssurance_ReadsMetadataNotV2Envelope` — an event with a populated `metadata` V1 tuple and a **null** `enforcementReceiptV2` derives its real level. This is the pin against the failure mode named in the landmines; without it the whole task can ship inert.
- [ ] `TestEffectAssurance_NoProvenBelowE3` (Frontend) — render each of E0/E1/E2 and assert the DOM contains none of "proven", "prevented" or "enforced" as a claim about the outcome.
- [ ] `TestEffectAssurance_PostToolNeverReadsPrevented` — an E1 row at `POST_TOOL_USE` renders the existing "flagged after the tool ran" phrasing, unchanged.
- [ ] `TestEffectAssurance_NothingIsStored` — the ingest spec asserts no new column and no new metadata key is written for any event shape.

### DEFEAT TEST

```bash
cd /c/cwt/w5-t6-backend
# 1. Mutate: derive E3 from the observer alone — delete the
#    `receiptAssurance === 'INDEPENDENTLY_OBSERVED' &&` conjunct from the E3 branch. Verify:
grep -c "INDEPENDENTLY_OBSERVED" src/ai-governance/services/ai-effect-assurance.util.ts
# MUST print 0. If it prints a positive number the mutation did not land — fix it, do not
# skip the defeat test.
# 2. Run:
npx jest src/ai-governance/services/ai-effect-assurance.util.spec.ts \
  -t "E3RequiresIndependentAssurance" 2>&1 | tee /tmp/w5t6-red.txt
# 3. The output MUST contain BOTH of these exact substrings:
grep -F 'Expected: "E2"' /tmp/w5t6-red.txt
grep -F 'Received: "E3"' /tmp/w5t6-red.txt
# 4. REVERT:
git checkout -- src/ai-governance/services/ai-effect-assurance.util.ts
git diff --exit-code src/ai-governance/services/ai-effect-assurance.util.ts   # MUST exit 0
```

Frontend leg (note the literal square brackets in the path — quote it):

```bash
cd /c/cwt/w5-t6-frontend
npx jest "app/ai-control-plane/ai-sessions/[id]/__tests__/obligation-axes.test.tsx" \
  -t "NoProvenBelowE3"
# Use npx jest directly, NOT `npm test` — the repo's `pretest` script runs two
# unrelated contract checks first and will mask the result.
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** read-side only, on one shared projection static and one console panel. Wrong output is a wrong label on an events page - visible to a console user, invisible to every endpoint. No endpoint behaviour, no enforcement, no ingest, no stored data.

**ROLLBACK:** revert three files. No stored data was touched, so rollback is total and instantaneous.

**DEPLOY ORDER:** Backend and Frontend only; no agent release is involved, so the Backend-before-agent rule has nothing to order here. Deploying needs a fresh explicit owner ask.

**EXIT:**

```sql
-- against a rig backend, after the projection lands:
-- every rendered AI-security event carries exactly one of E0/E1/E2/E3, and:
SELECT count(*) FROM ai_events WHERE metadata->>'receiptAssurance' = 'INDEPENDENTLY_OBSERVED';
-- MUST be 0 until an independent observer exists (Wave 6). That is the honest number.
```

---

## Task 7: DELETED — the canary receipt sink is owned by **Wave 6 Task 5**

This wave used to carry a "wire the canary receipt sink" task. It is deleted, not deferred. Wave 6 Task 5 is the same task and is correct on all three points where the two versions disagreed (RECONCILIATION §1 C5/C6, §2 D1):

| | The deleted W5 version | **Wave 6 Task 5 (authoritative)** |
|---|---|---|
| Composition root | `internal/daemon/server.go` | `internal/daemon/ai_integrity_wiring.go` — verified: the seam assignments are at `:627-631` inside `(*integrityWiring).bindCanaryChallenges` (`:615-632`). RECONCILIATION names this function `bindIntegrityCanaryLoop`; the file and line range are right, the identifier at that location is `bindCanaryChallenges`. |
| Backend client method | "the daemon's existing request-signing backend client" | Wave 6 Task 4 **builds** `RecordCanaryReceipt`. Verified: `internal/core/backend/ai_canary_challenge.go` has exactly three `Client` methods — `RequestCanaryChallenge:105`, `ConsumeControlArtifact:187`, `postSignedControlAuthority:228`. **No receipt method exists.** |
| Unwired seams | one (`Receipts`) | **four** — `ai_integrity_wiring.go:627-631` assigns four seams and leaves `Ledger`, `Receipts` and `Applied.{BundleRevision,BundleDigest,ProjectionHash}` unset. Two of them fail *before* the sink is reached: Codex dies at `canary-challenge-wrong-bundle`, Claude at `canary-ledger-unavailable`. |

**Do not implement a canary receipt sink from this wave.** If you were assigned "Wave 5 Task 7", the task no longer exists - report that and stop.

Two facts to carry to Wave 6 so they are not re-learned:

- `Receipts:` is assigned in exactly four places at `origin/main`, all test files: `internal/airuntimeintegrity/maintenance_test.go:64`, `internal/codexmanaged/canary_host_test.go:289`, `internal/codexmanaged/canary_live_test.go:74`, `internal/codexmanaged/canary_test.go:111`. (Wave 8 miscites these as `providers/claude/canary.go:55-59, :335-343`, which are `errNoReceiptSink` and `emitReceipt`. Wave 8's conclusion is right; only its citation is wrong — RECONCILIATION §1 C7.)
- The deleted task's exit criterion claimed that a wired sink would give `internal/liveproof/register.json`'s `evidence-event-traced-end-to-end` entry "its endpoint half". **That is not achievable and the register says so.** That entry is `observed: false` and quarantined with the note: the final re-check is "explicitly against PRODUCTION's own numbers … A local backend starts at zero and has no gap history, so the check is vacuous there by construction … **Do not report it as closeable by the local rig.**" Wave 6 Task 5 must not inherit that exit criterion.

The Wave 5 exit criterion that referenced this task now points at Wave 6 (see criterion 7 below).

---

## Task 8: Build the side-effect witness as code, scoped to the canary rig

**Files:**
- new `internal/aicanary/sideeffect.go`
- new `internal/aicanary/sideeffect_test.go`
- `docs/ai-security/LIVE_PROOF_PROCEDURE.md` (point the manual procedure at the code)

### PRECONDITIONS

**If any fails, STOP AND REPORT.**

```bash
cd /c/Users/Owner/Documents/Ceragon/Installers && git fetch origin
git rev-parse origin/main
# MUST print: 5b12952307db9903fa166d5d9ce1a0c058e0ad77

git show origin/main:internal/liveproof/register.json | \
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).proofs;const p=a.find(x=>x.id==='pretooluse-deny-stops-side-effect');console.log(p.observed, p.evidence.observedAt);})"
# MUST print: true 2026-08-26T17:11:57Z
# The same entry's evidence.endpoint MUST name the sandbox: ProgramData=C:\w47rig\pd,
# USERPROFILE/HOME=C:\w47rig\home, CLAUDE_CONFIG_DIR=C:\w47rig\claudecfg, and record that
# "The real machine scope C:\ProgramData\devoid was never created."

git show origin/main:cmd/devoid/ai_hook_runner.go | sed -n '153,163p'
# MUST show fieldObsDir — the hermeticity seam this task's path guard mirrors.

git show origin/main:cmd/devoid-msi-root-guard/guard_windows.go | sed -n '624,629p'
# MUST show boundaryChildNames = {"bin","config","logs","evidence","doctor", activationStoreDirName}
# READ THIS EVEN THOUGH THIS TASK ADDS NOTHING TO THE MACHINE ROOT — see LANDMINES.
```

### LANDMINES

- **The path guard is the safety-critical part of this task, not the truth table.** If `MarkerDir` validation is wrong, this package writes marker files into a real user profile or into `%ProgramData%\devoid`. The 2026-08-26 run could be trusted precisely because the rig was fully sandboxed and "the real machine scope `C:\ProgramData\devoid` was never created". Validate before any I/O, and test the guard on its own.
- **Never create an entry under the machine root from here.** If any future change makes this package write under `%ProgramData%\devoid`, the SAME COMMIT must add the directory name to `boundaryChildNames` (`cmd/devoid-msi-root-guard/guard_windows.go:624-629`), with its `createBoundaryChildren` (`:607`) and `boundaryChildRead` (`:634`) entries, or `inspectRootEntries` (`:1047`) returns `machine root contains unknown entry` and the MSI dies **1722 -> 1603, rolling back the upgrade on every ENROLLED endpoint** while every clean-box test stays green. It has fired three times: `.staging`, `aitrust`, `endpoint-identity.json`. The guard's own comment at `:1014` says so.
- **A deny that stops everything because the rig is broken proves nothing.** The witness is the pair - the deny run *and* the allow twin on the identical rig - which is exactly what the register's `surfaceLine` records: `DENY_SIDE_EFFECT.txt DID NOT EXIST afterwards` **and** `ALLOW CONTROL on the identical rig, same hooks, same daemon, same client: "permission_denials":[] and ALLOW_SIDE_EFFECT.txt WAS created`.
- **This certifies a mechanism on a rig at a moment in time. It cannot promote a customer event to E3.** Per-event assurance stays E1 or E2 (Task 6), and a recent green witness must never change a stored event's level. The strategy says this itself: "a recent E3 semantic canary can certify that the exact mechanism is currently working, but it does not magically turn every unrelated event into independently witnessed proof."
- This task widens no agent-wire contract and has no production caller in this wave, so there is no Backend deploy ordering.

### DO NOT

- Do not give the package a production caller in this wave. Wave 6 Task 7's `pre-action-effect` claim is its consumer (RECONCILIATION §2 D2); without that, this ships dead, and that is Wave 6's item to close, not a reason to wire it here.
- Do not weaken `TestSideEffectWitness_RefusesRealMachineRoots` or make the guard advisory. If the guard blocks a test fixture, the fixture is wrong.
- Do not have `Witnessed` return true on any combination other than both. There is no "partial" witness.
- Do not touch `internal/liveproof/register.json`. Its entries are observation records, not code state.

### The design

```go
type SideEffectWitness struct {
    MarkerDir string // rig-scoped; MUST refuse a path under the real ProgramData or user home
}

type WitnessResult struct {
    DenyMarkerAbsent   bool
    AllowMarkerPresent bool
    Witnessed          bool // both, and only both
    Reason             string // named, closed vocabulary; "" only when Witnessed
}
```

`Witnessed` is `DenyMarkerAbsent && AllowMarkerPresent`. Any other combination is `false` with a named reason - `allow-twin-did-not-run` is not a deny proof.

### Tests to write (failing first)

- [ ] `TestSideEffectWitness_DenyAloneIsNotProof` — deny marker absent, allow marker also absent -> `Witnessed == false`, `Reason == "allow-twin-did-not-run"`. Failing test first.
- [ ] `TestSideEffectWitness_BothConditionsRequired` — the full truth table, four cases, each with its own named reason.
- [ ] `TestSideEffectWitness_RefusesRealMachineRoots` — a `MarkerDir` under `%ProgramData%\devoid` **or** under the invoking user's home is rejected **before any file is touched**. Assert no file was created (inert-shape 5: a guard that runs after the write is not a guard).
- [ ] `TestSideEffectWitness_DoesNotSetEventAssurance` — a green witness leaves every stored event's derived assurance unchanged. This is the pin against the "one canary proves everything" lie.

### DEFEAT TEST

```bash
cd /c/cwt/w5-t8
# 1. Mutate: make Witnessed depend on the deny half alone — drop the `&& allowPresent`
#    conjunct (whatever your local names are) from the Witnessed assignment. Verify:
grep -n 'Witnessed' internal/aicanary/sideeffect.go
# The Witnessed assignment MUST now reference only the deny-marker term. If it still
# references the allow-marker term the mutation did not land — fix it, do not skip the
# defeat test.
# 2. Run:
go test ./internal/aicanary/... -run TestSideEffectWitness_DenyAloneIsNotProof 2>&1 | tee /tmp/w5t8-red.txt
# 3. The output MUST contain this exact substring:
grep -F 'want Witnessed=false reason="allow-twin-did-not-run", got Witnessed=true' /tmp/w5t8-red.txt
# 4. REVERT:
git checkout -- internal/aicanary/sideeffect.go
git diff --exit-code internal/aicanary/sideeffect.go   # MUST exit 0
```

If step 3 finds nothing, the test is inert. Do not proceed; report.

**BLAST RADIUS:** none in the customer path. The package is invoked only by the canary rig and by tests; it writes only inside a rig-scoped directory it validated first. If the path guard is wrong it could write a marker file into a real profile - which is why that guard has its own test and runs before any I/O.

**ROLLBACK:** delete the package. It has no production caller in this wave; Wave 6 Task 7 adds one.

**EXIT:**

```bash
go test ./internal/aicanary/... -run 'TestSideEffectWitness' -v   # 4 tests + the 4-case truth table PASS
grep -n 'aicanary.SideEffectWitness' docs/ai-security/LIVE_PROOF_PROCEDURE.md
# MUST print at least one line: step 4b names the function instead of describing it in prose.
```

---

## Wave exit criteria

Each is a command or a number, not a judgement.

1. **No obligation capability returns `nil` without consulting a resolver.**
   ```bash
   git grep -n 'func() error { return nil }' -- 'internal/daemon/ai_oracle_receipt.go' 'internal/proxy/failure_oracle_route.go'
   # MUST return exactly ONE line: internal/proxy/failure_oracle_route.go:80 (the auditProbe, which stays).
   ```
   Defeat: `TestPromptDenyCapability_UnexpressibleRecordsFailed` (Task 2), `TestProxyConfirm_EmitsTrustedConfirmationUnavailable` (Task 3).
2. **Every desired effect resolves through one table.** `go test ./internal/airuntime/... -run TestResolveEffect -v` reports **264** passing sub-cases across both adapters, agreeing with `TranslateDecision`. Defeat: `TestResolveEffect_CodexMatrixMatchesTranslateDecision` (Task 1).
3. **An unknown adapter or checkpoint cannot report a successful effect.** Defeat: `TestResolveEffect_UnknownAdapterIsUnsupported` (Task 1).
4. **86 pinned `RUNTIME_ADAPTER x POST_TOOL` catalog rows have an executor, up from 0**, and every prevention-class kind at a post checkpoint carries `Outcome.Detail == "POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM"`. Defeat: `TestPostToolObligations_PreventionKindsAreUnsupported` (Task 5).
5. **`observed` appears on no capability row without a runtime acknowledgement.** `devoid ai certify claude-code | grep -c ' observed'` and the codex equivalent both print `0` on a rig with none. Defeat: `TestFieldObs_EmittedDoesNotRaiseObserved` (Task 4).
6. **Every rendered event carries exactly one of E0/E1/E2/E3, and the E3 count is 0** until an independent observer exists. No event below E3 renders the word "proven". Defeat: `TestEffectAssurance_E3RequiresIndependentAssurance`, `TestEffectAssurance_ReadsMetadataNotV2Envelope` and `TestEffectAssurance_NoProvenBelowE3` (Task 6).
7. **The canary receipt sink is `Wave 6 Task 5`'s criterion, not this wave's.** Wave 5 asserts nothing about `Receipts:`. Its four current assignment sites are all test files and Wave 6 owns changing that.
8. **A deny with no allow twin is not a witness.** Defeat: `TestSideEffectWitness_DenyAloneIsNotProof` (Task 8).
9. **Clean allow still works.** A full local Docker stack run plus a real Claude Code and a real Codex session on the rig complete an ordinary allow at every checkpoint with no new hold, no new deny and no new prompt. This is the anti-brick gate and it is not optional: an uninstalled control protects nobody.

### Release ordering for the whole wave

Tasks 1-5 and 8 are agent-only and add no wire field, no vocabulary member and no DTO key. Verified: `restrict-capability` is already the 12th member in Go (`vocab.go:109`), on the heartbeat wire (`controls/attestation.go:425`) and in TypeScript (`ai-security-portable.generated.d.ts:72`), and the receipt shape Task 5 emits is one the Backend already accepts. Task 6 is Backend- and Frontend-only and touches no contract. **No contract widens in this wave, so no Backend-before-agent ordering constraint is created.** That is a deliberate design goal, not luck: it is what makes the wave rollback-per-task instead of rollback-in-sequence.

Two ordering constraints do apply and neither is internal to this wave:

- **Task 4 must ship in the same release as Wave 6 Tasks 1-5.** Task 4 removes `observed` fleet-wide; Wave 6 is what can legitimately restore it. (RECONCILIATION §3 item 16.)
- **Land Wave 8 Task 6 before Task 4.** Task 4, Wave 4 Task 8 and Wave 8 Task 6 each turn a green surface red; all three are correct and none changes enforcement, but landing them together turns every coverage dashboard red at once and the predictable response is a rollback request for a plan working as designed. Wave 8 Task 6 is the one that explains the other two. (RECONCILIATION §4 R7.)

Deploying anything still needs a fresh explicit owner ask.

---

## What this wave deliberately does NOT do

**It does not emit a V2 enforcement receipt for prompt or tool actions.** The Backend's V2 lane is complete and hardened, but `prepareReceipt` rejects any receipt whose decision the server does not already know (`ai-enforcement-receipt.service.ts:158-170`, `unknown-causal-decision`), and the only production producer of registered decisions mints one per issued policy bundle (`ai-enforcement-decision-producer.service.ts:162-174`, minting at `:182-215`). Ten fields must match, including a server-keyed HMAC `proposalFingerprint` the endpoint cannot compute (`:211`, `:243`; the file says so at `:58`). Getting a server-known decision per prompt would put a backend round-trip in front of every checkpoint - the exact dependency that produced six leaked private keys in ten runs (SOT §15.1). **The unblocking change is a Backend one and belongs to a later wave:** accept an endpoint-authored `AiDecisionV2` delivered inside the same receipt envelope, with a distinct `proposalFingerprint` keyId label so a server-minted and an endpoint-minted decision can never be confused, keeping `receiptAssurance: VERIFIED_ENDPOINT_REPORT` and `certifiedSecurityOutcome: UNKNOWN`. Until then the V1 four-axis compatibility receipt plus Task 6's derived assurance carries the same information with none of the risk.

**It does not create an `INDEPENDENTLY_OBSERVED` producer.** The receipt validator correctly refuses an endpoint to self-assert independence (`ai-enforcement-receipt-v2.ts:1121-1125`). Producing that value needs a second authenticated principal that is not the endpoint - a new identity, a new key, a new trust root. That is the identity/tamper workstream's territory. The seam is named here so a later wave can pick it up: `validateAndDeriveAiReceiptV2`'s hardcoded `'VERIFIED_ENDPOINT_REPORT'` at `:1385` is the single line that would become transport-derived.

**It does not build a general E3 witness for arbitrary customer side effects.** The strategy is explicit that E3 is not achievable for every arbitrary side effect on an ordinary endpoint, and it is right. The witnesses it lists - a controlled upstream that received no request, a WFP-recorded connection denial, a provider gateway proving no upstream write began - each require infrastructure this wave does not own (forced egress, the gateway, the firewall lane). Task 8 builds the one witness that needs nothing outside the box, and says out loud that it certifies a mechanism rather than an event.

**It does not add a `PLANNED` obligation state.** `AI_OBLIGATION_STATES` is a generated, ordered, cross-language tuple with six members (`ai-security-portable.generated.d.ts:41` — `REQUIRED, SATISFIED, UNSATISFIED, UNSUPPORTED, SUPERSEDED, FAILED`) validated with `@IsIn` on the ingest DTO. Appending a member would touch all three `shared-contracts` copies, the Backend DTO and the Go tuple, and would have to deploy **Backend-first** or the agent's new token would be silently dropped by `AgentIngestValidationPipe` - no 400, no log, no data. The strategy's requirement - "a capability callback that returns success without doing anything may record **planned**, never **satisfied**" - is met more cheaply and more honestly by Tasks 2 and 3: a capability that does nothing now reports `FAILED` with a named cause, or is `nil` and reports `UNSUPPORTED` with a pinned trigger. Both are existing states with existing meanings, and both are strictly stronger than `PLANNED`, which would still read as partial credit.

**It does not narrow the capability tables by runtime version or binary digest.** `CapabilityKey` carries `RuntimeVersion` and `HookDialect` and the resolver returns `VersionRange: "*"`, because the shipped tables were derived per checkpoint and not per version, and the product has been burned before by a pin that claimed more than was measured (SOT §16.1 C1: do not widen the Codex dialect pin without two vendor artefacts per family). Populating real version ranges is the certification-factory wave's job, feeding this same struct. Claiming a version-specific capability we never measured would be the same defect one level up.

**It does not touch the daemon decision budget, the 60-second hook timeout, or any fail-open branch.** Those are the inline-decision-core wave's. Nothing in Wave 5 can make a decision arrive faster or more reliably; it only makes the record of what happened afterwards honest. Worth saying plainly, because a reader could otherwise mistake "Ability to enforce once a decision is reached" for a fix to "Reliability of reaching the decision engine". They are different rows and this wave moves only the first. (Waves 1, 6 and 8 carry the same disclaimer and all four are consistent — no wave fixes it here.)

**It does not weaken any existing guard.** Every change is stricter or neutral: three no-op capabilities become checked, one certification rung becomes harder to reach, one class of catalog row gains an executor it never had, and one assurance level is derived and displayed where nothing was displayed before. The one place a task could over-block - Task 2's escalation on the 25 `HOLD` and 11 `REQUIRE_CONFIRMATION` prompt rows - is bounded by `MoreRestrictive`, gated on a purely local table lookup, and reachable only on a prompt DeVoid already failed to evaluate. **If a guard blocks a task in this wave, the task is wrong. Report it; never weaken the guard to fit.**
