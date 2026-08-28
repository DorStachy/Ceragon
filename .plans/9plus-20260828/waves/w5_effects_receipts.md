# Wave 5 - Make the effect honest and separate the decision receipt from the effect receipt

**Scorecard rows this moves:** Ability to enforce once a decision is reached 7.0 -> 9.5 (Workstream 6); Proof that enforcement happened 3.5 -> 9.6 (Workstream 7, this wave carries the receipt-separation, assurance-level and no-op-satisfaction half; the E3 canary half belongs to the canary wave)
**Depends on:** the contract-freeze wave (Workstream 1) for the frozen normalized-action / requested-effect / receipt contracts, and the inline local decision core wave (Workstream 2) so there is a decision to enforce without a backend hop. Tasks 1-5 and 7 can be built against `origin/main` as it stands today; only the exit gate needs the earlier waves.
**Phase:** 3

---

## What exists today

Every path below was read at `origin/main` on 2026-08-28: Installers `5b129523`, Backend `0cf9021e` (ECS td 322), Frontend `cac574ae`. Line numbers are from `git show origin/main:<path>`.

### The four-axis effect truth is BUILT and WIRED, end to end

This is the single most important fact for this wave, and it inverts the obvious plan. DeVoid already has the vocabulary Workstream 6 asks for and the receipt separation Workstream 7 asks for. Most of what follows is connecting, not building.

- `internal/airuntime/effect_truth.go:76-119` — `FourAxisEffectTruth` keeps **requested / adapter-expressed / observed-actual / graded outcome** on four independent axes, with `ValidateFourAxisEffectTruth` enforcing "EXPRESSED iff an expressed effect is present" and "observed present iff observer != NONE".
- `internal/airuntime/effect_truth.go:11-29` — `ActualEffectObserver` is a closed set: `NONE`, `RUNTIME_ACK`, `BROWSER_CHECKPOINT`, `PROXY_CHECKPOINT`, `MCP_BROKER`, `FINAL_STATE_GRADER`.
- `internal/airuntime/effect_truth.go:44-52` — `SecurityOutcome` is the independently graded axis; `UNKNOWN` is required with no proof.
- `internal/airuntime/effect_receipt.go:107-148` — `Validate` enforces the **local writer boundary**: this endpoint may not assert an observed actual effect (`:133-135`) and may not certify a security outcome (`:136-138`). That is already the honest floor Workstream 7 demands.
- `internal/airuntime/vocab.go:92-136` — the twelve-member `EnforcementEffect` tuple, including `restrict-capability`. It is **APPEND-ONLY and pinned three ways**: `airuntime` (typed) == `internal/controls` wire == the TypeScript `AI_SECURITY_PORTABLE_ORDERED_TUPLES` tuples (`vocab.go:15-31`, `vocab_parity_test.go`). Verified identical in `Backend/packages/shared-contracts/dist/generated/ai-security-portable.generated.d.ts:72`.
- The tuple already separates pre- from post-action effects by name: `deny-tool` vs `replace-output` vs `replace-tool-result-with-feedback-and-continue`. There is **no generic `block`**. The strategy's "one generic block value" defect does not exist here.
- Backend persists all four axes (`src/ai-governance/services/ai-local-receipt-compat.util.ts:53-86, 129-140`), and Frontend renders them as four distinct rows with post-tool honesty already built in (`app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx:1-58`; `:14-16` "A `POST_TOOL_USE` checkpoint means the tool ALREADY RAN - such a row is never phrased as 'prevented'").

### The obligation machinery is BUILT and correct, and two producers hand it lies

`internal/obligation/obligation.go` is a careful, honest executor: a nil capability is `UNSUPPORTED` with a pinned O01 trigger (`:344-347`), every prevention-class kind at a post checkpoint is forced `UNSUPPORTED` with `POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM` (`:215-239`), and `ExecuteWithEscalation` (`:366-388`) escalates once and folds most-restrictive so an escalated terminal is never weaker.

It has exactly two production callers and **both hand it no-op capabilities that always return nil**:

| Site | Capability | Line | What `SATISFIED` then attests |
|---|---|---|---|
| `internal/daemon/ai_oracle_receipt.go:82` | `Deny` | `func() error { return nil }` | The SOT §14.8 finding, confirmed. The real deny happens downstream in the hook's handling of the block response, so `obligation:deny:SATISFIED` attests a **plan**. |
| `internal/proxy/failure_oracle_route.go:64` | `Deny` | `func() error { return nil }` | Same shape at `LOCAL_PROXY`. The proxy does write its own refusal, so the plan is usually kept - but nothing in the receipt says so. |
| `internal/proxy/failure_oracle_route.go:65` | `Quarantine` | `func() error { return nil }` | Records `hold-placed` with no hold mechanic invoked. |
| `internal/proxy/failure_oracle_route.go:66` | `Confirm` | `func() error { return nil }` | **New finding, not in the SOT.** The file's own header (`:8-11`) states that a confirm terminal this surface cannot satisfy "is executed as the HOLD ... never a faked confirmation ... (O01 TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE)". Because `Confirm` is non-nil, `runSimple` returns `REQUIRED` / `hold-placed-awaiting-confirmation` and the `TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE` trigger is **never emitted**, and `REQUIRED` does not set `Escalate` (`obligation.go:207-210`). The comment describes behaviour the code does not have. |

`RestrictCapability`, `Sanitize` and `Notify` are nil at both producers.

### The F01 catalog's whole post-effect half has no executor

The pinned closed-world catalog is 882 rows (`internal/aipolicycontract/embedded/0.5.0/portable-contract.v1.jcs.json`, `failureOracle.catalog.rows`), counted directly:

```
RESTRICT_CAPABILITY 344   DENY 250   HOLD 125   PROCEED_OBSERVED_ONLY 108   REQUIRE_CONFIRMATION 55
```

All 344 `RESTRICT_CAPABILITY` rows sit at the four `POST_*` checkpoints (86 each at `POST_TOOL`, `POST_SUBMIT`, `POST_UPSTREAM_RESPONSE`, `POST_UPLOAD_DISPATCH`) and every one carries `requestedEffect: restrict-capability`. **Nothing executes them.** `obligation.ExecuteWithEscalation` has exactly two non-test callers, both at pre-checkpoints (`ai_oracle_receipt.go:155`, `failure_oracle_route.go:84`). On the hook lane a `VerbRestrict` terminal produces only a reason suffix and `FailClosed: false` (`cmd/devoid/ai_failure_resolver.go:161-170`) - no obligation, no capability drop, no receipt.

`airuntime.EffectRestrictCapability` has **zero producers** anywhere outside the two vocabulary tuples (`vocab.go:109`, `vocab.go:125`, `controls/attestation.go:425`, `:434`).

The catalog itself is well-formed and I found no defect in it: it contains no prevention-class outcome at any `POST_*` checkpoint, so `verbForRow`'s post-checkpoint refusal (`internal/failureoracle/failureoracle.go:250-267`) never fires on the shipped catalog.

### There IS a per-checkpoint capability model, but it is per-adapter, checkpoint-only, and has no shared resolver

- Codex: `internal/airuntime/adapters/codex/effects.go:44-50` — a frozen `effectSets` map, checkpoint -> ordered strongest-to-weakest effects, with a **closed `codexEffect` type** (`:18-29`) so an unsupported effect has no name to reference. `selectStrongestSupported` (`:117-137`) degrades to `none` rather than fabricating. This is genuinely good work and is the model to generalize.
- Claude: `internal/airuntime/adapters/claudecode/detect.go:25-34` — `mediatedCheckpoints`, a flat checkpoint -> single-effect list.
- Neither is keyed by runtime version, binary digest, host, OS, hook dialect or managed source. There is no cross-adapter resolver: `EffectSet` is exported from the codex package only, and resolution happens inside each adapter's `TranslateDecision`.
- Nothing checks a policy's `requestedEffect` against a capability before acting on it. `spoolPromptOracleReceipt` (`ai_oracle_receipt.go`) only checks `airuntime.IsEnforcementEffect` - vocabulary membership, not capability.
- `internal/airuntime.Registry` (`registry.go:315-375`) is an adapter-id lookup only.
- `controls.AdapterCapabilityCertificate` (`internal/controls/attestation.go:650-663`) is the release-level certificate the strategy wants, keyed by adapter/version/contract/runtime/host/platform/hookDialect/runtimeVersionRange/checkpoint. **It has no producer**: the only non-test references are its declaration, the type alias at `airuntime/envelope.go:28`, and `normalizeCertificate` on the wire-normalize path (`attestation.go:1195`).

### The field-observation ledger records EMITTED and the ladder reads it as OBSERVED

`internal/fieldobs` is a well-built, content-free, closed-vocabulary ledger of controls that really fired, and it is wired (`cmd/devoid/ai_hook_runner.go:136`, `internal/daemon/ai_transport_observation.go:65`).

But `recordFieldObservation` (`cmd/devoid/ai_hook_runner.go:190-203`) writes when `out.TranslationDisposition == airuntime.TranslationExpressed` - i.e. when **DeVoid put deny bytes on stdout**. Nothing confirms the runtime honoured them. And `capabilitiesFromStatus` (`internal/airuntime/adapters/claudecode/detect.go:159-168`) raises the certification rung to `CertObserved` on exactly that record.

That is the strategy's "treating hook stdout as proof the vendor honored it", live. It matters most on Codex, where the product's own code records that a deny it emitted was **not honoured**: `internal/airuntime/registry.go:220-224` says the stderr deny channel was measured on codex-cli 0.147.0 and "the client allowed the tool", and `DenyOnExit` (`:227-243`) carries the same lesson for exit codes. SOT §13.1 adds that a Codex hook failure fails open at the vendor.

### Workstream 7's V2 lane exists ALMOST ENTIRELY on the Backend and not at all on the endpoint

`Backend/src/ai-governance/ai-enforcement-receipt-v2.ts` is a complete, hardened implementation of exactly what Workstream 7 specifies:

- `AiDecisionV2` (`:30-54`) — the **Decision Receipt**: policy/detector/normalizer digests, obligations, requested effect, evaluator identity, expiry, decision digest.
- `AiEnforcementReceiptWireV2` (`:89-120`) — the **Effect Receipt**: expressed effect, translation disposition, observed actual effect, observer, `actualEffectProof`, obligation results with proof refs, before/after payload digests, `finalStateObservationRef`.
- `AiProofManifestV1` (`:65-82`) with `observerAssurance`, and `AiReceiptAssuranceV2 = UNVERIFIED_LEGACY | VERIFIED_ENDPOINT_REPORT | INDEPENDENTLY_OBSERVED` (`:9-10`).
- `validateCausalBinding` (`:1063-1088`) pins ten fields between receipt and decision.
- `resolveProofs` (`:1121-1125`) **refuses endpoint self-assertion of independent assurance** - the exact property Workstream 7 needs.
- `deriveCertifiedOutcome` (`:1162-1210`) refuses impossible claims (a `PREVENTED` with a non-null after-digest, a `SANITIZED` with no digest change) and returns `UNKNOWN` on the endpoint-authenticated route because "this endpoint-authenticated route has no independently authenticated observer correlation" (`:1176-1178`).
- The transport exists: `EndpointEnforcementReceiptV2Dto` on the evidence batch (`src/ai-governance/dto/endpoint-evidence-batch.dto.ts:53-61, 151-154`), ingest (`endpoint-evidence-ingest.service.ts:1310-1401`), storage (migration `1786700000000-AddAiEnforcementReceiptsV2.ts`), read projection (`ai-query.service.ts:3730, 5954`), and console render (`obligation-axes.tsx:83-87`).

**The endpoint has never emitted one.** `git grep enforcementReceiptV2` over Installers Go returns only three unrelated hits in `internal/promptevidence/validate.go:1383-1425`. `internal/daemon/ai_oracle_receipt.go`'s own header says why: "the production V2/HMAC receipt writers stay DISABLED (custody prerequisites unmet)."

**And there is a hard structural blocker, not a wiring gap.** `prepareReceipt` (`src/ai-governance/services/ai-enforcement-receipt.service.ts:158-170`) rejects any receipt whose `decisionId` is not already a server-registered decision (`unknown-causal-decision`). The only production producer of registered decisions is `AiEnforcementDecisionProducerService`, which mints exactly one decision per issued policy bundle - the authorization to *apply that bundle* (`ai-enforcement-decision-producer.service.ts:11-68, 182-200`). There is no per-action decision, and `proposalFingerprint` is a server-keyed HMAC the endpoint cannot compute. Making a prompt or tool decision server-known first would reintroduce the backend round-trip that produced the 6-in-10 private-key leak (SOT §15.1). Task 6 and the "does NOT do" section handle this honestly.

### The canary receipt sink is unwired, and the Backend route it needs already exists

- `internal/airuntimeintegrity/providers/claude/canary.go:332-344` — a nil `Receipts` sink is an explicit delivery FAILURE, which demotes proven to error. `Receipts:` is assigned in exactly four places and all four are test files (`airuntimeintegrity/maintenance_test.go:64`, `codexmanaged/canary_host_test.go:289`, `canary_live_test.go:74`, `canary_test.go:111`). Re-verified at `origin/main` 2026-08-28.
- The destination exists and is signature-gated: `POST /api/v1/ai/policy-delivery/canary-receipt` (`Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:758-779`), requiring `req.requestSigningVerifiedAgentId`.

### The E3 witness exists only as a human procedure

The one E3-grade observation in the product - "the marker file was never created while the allow twin created it" - lives in `internal/liveproof/register.json` (`pretooluse-deny-stops-side-effect`, observed 2026-08-26T17:11:57Z) and `docs/ai-security/LIVE_PROOF_PROCEDURE.md`. It is an operator runbook recorded as JSON in a test-only package. No code performs it.

### What is honest already, and must not be "fixed"

- Post-effect labelling is correct on both surfaces: `obligation-axes.tsx:14-16, 56-57`, the failure-oracle post-checkpoint rule (`failureoracle.go:57-62`), `oracleCheckpointFor` (`cmd/devoid/ai_failure_resolver.go:42-57`), and the effect labels (`Frontend/types/ai-governance.ts:3374-3387`, "Replaced output", not "Blocked").
- The PostToolUse path stamping `DispositionRedactedThenSent` (`internal/daemon/ai_ingress.go:864`) is **accurate**, not an overclaim: the redacted tool result is what enters model context and later travels the wire. The strategy's enforceable guarantee - "poisoned bytes never become model context" - is what `updatedToolOutput` delivers. Do not change it.
- The console's enforcement-proof panel demotes "proven" three ways and never upward (`Frontend/app/ai-control-plane/protection-depth.tsx:850-861`).
- The human-permit machinery is strong: `devoid ai allow-once` requires a TTY on stdin *and* stdout, refuses any process classified as an AI runtime, and reads one keypress from the controlling terminal rather than stdin (`cmd/devoid/ai_allow_once_human.go:14-92`), after a measured incident where an agent released its own hold. Workstream 6's "the agent cannot mint or consume its own permit" is **already satisfied**; do not rebuild it.
- A trusted confirmation surface does exist on the tool lane (warn only, three required conditions, every failure lands on block): `cmd/devoid/ai_tool_warn_confirm.go:14-74`.

---

## Task 1: Build one capability resolver, derived from what the adapters already declare

**Files:**
- new `internal/airuntime/capability.go`
- new `internal/airuntime/capability_test.go`
- `internal/airuntime/adapters/codex/effects.go` (add an exported adapter method; the table itself is untouched)
- `internal/airuntime/adapters/claudecode/detect.go` (same)

**What it is.** An optional adapter interface plus a pure resolver. No wire change, no vocabulary change, no behaviour change on its own - Task 1 ships a function nobody calls yet, and Tasks 2, 3 and 5 are its consumers.

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

The codex adapter implements `SupportedEffects` by returning `EffectSet(checkpoint)` verbatim. The claude adapter returns the single effect from `mediatedCheckpoints`. **The tables are the same tables the adapters already translate from**, so a resolution can never disagree with what `TranslateDecision` will emit - that shared source is the whole point.

Ordering rule for `ResolvedStricter`: within one checkpoint's declared list, earlier is stricter (both existing tables are already documented strongest-to-weakest). Never promote across checkpoints.

- [ ] `TestResolveEffect_UnknownAdapterIsUnsupported` — a `CapabilityKey` naming an unregistered adapter resolves `UNSUPPORTED` with `Resolved == EffectNone`. Write it first; it fails to compile, then fails, then passes.
- [ ] `TestResolveEffect_AdapterWithoutEffectCapableIsUnsupported` — an adapter that does not implement `EffectCapable` never reports a supported effect.
- [ ] `TestResolveEffect_CodexMatrixMatchesTranslateDecision` — for every (checkpoint x effect) pair in `EnforcementEffects` x `CanonicalEvents`, assert `ResolveEffect(...).Resolved` equals the `AdapterExpressedEffect` that `codex.TranslateDecision` actually produces for that pair (or `EffectNone` when the translation is not `EXPRESSED`). 11 checkpoints x 12 effects = 132 pairs, exhaustive.
- [ ] `TestResolveEffect_ClaudeMatrixMatchesTranslateDecision` — the same 132 pairs against the claude adapter.
- [ ] `TestResolveEffect_NeverPromotesAcrossCheckpoints` — a `deny-tool` request at `POST_TOOL_USE` never resolves to `deny-tool`.
- [ ] `TestResolveEffect_VersionRangeIsStarUntilMeasured` — every resolution the shipped tables produce carries `VersionRange == "*"`. This is the pin that stops a later wave silently inventing a version-specific capability claim.

**Defeat test:** `TestResolveEffect_CodexMatrixMatchesTranslateDecision` — revert by adding `effDenyTool` to `effectSets[airuntime.EventPostToolUse]` in `internal/airuntime/adapters/codex/effects.go:47`, expect RED with `POST_TOOL_USE/deny-tool: resolver says deny-tool, TranslateDecision expressed ""`.

**Blast radius:** none at runtime - nothing calls `ResolveEffect` after Task 1. The only risk is a compile break in the two adapter packages. Everyone notices immediately (the Go build gate).

**Rollback:** delete `capability.go` and the two adapter methods. Nothing else references them.

**Exit:** 264 exhaustive (checkpoint x effect) pairs pass against both adapters, and `ResolveEffect` has zero production callers at merge time.

---

## Task 2: Replace the prompt checkpoint's no-op `Deny` with a resolution-backed capability

**Files:**
- `internal/daemon/ai_oracle_receipt.go` (`promptObligationCaps`, `:80-97`)
- `internal/daemon/ai_oracle_receipt_test.go`

This is SOT §14.8. `Deny: func() error { return nil }` becomes a closure that asks Task 1's resolver whether the routed adapter can express `deny-prompt` at `USER_PROMPT_SUBMIT`, and returns a tagged error when it cannot:

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

**Why this condition is provable, which the July-2026 brick was not.** The condition is "the routed adapter's own pinned effect table, the same table it translates from, contains `deny-prompt` at this checkpoint". It is a local, offline, deterministic table lookup with no network, no clock, no filesystem and no vendor cooperation. It cannot be made unprovable by load, by a dead daemon, or by an unenrolled endpoint - the three conditions that have caused availability failures here before.

**Why the failure direction is safe.** `obligation.ExecuteWithEscalation` (`obligation.go:366-370`) never escalates a `VerbDeny` terminal, so on the 50 `DENY` rows at `RUNTIME_ADAPTER x PRE_PROMPT` a wrong answer records loudly and changes nothing. On the 25 `HOLD` and 11 `REQUIRE_CONFIRMATION` rows it escalates through `MoreRestrictive`, which is never weaker. The direction of any error is stricter, never open.

- [ ] `TestPromptDenyCapability_UnexpressibleRecordsFailed` — with a registry holding an adapter whose `SupportedEffects(USER_PROMPT_SUBMIT)` omits `deny-prompt`, `finalizePromptOracle` produces an outcome `{Kind: DENY, State: FAILED, Detail: "deny-not-expressible"}` and the reason token is `obligation:deny:FAILED:deny-not-expressible`. Failing test first.
- [ ] `TestPromptDenyCapability_ExpressibleStaysSatisfied` — with the real claude adapter registered, the outcome is `{DENY, SATISFIED}` and the emitted receipt is byte-identical to today's for the same input.
- [ ] `TestPromptDenyCapability_NeverWeakensATerminal` — over all 98 `RUNTIME_ADAPTER x PRE_PROMPT` catalog rows, assert `verbRank(after) >= verbRank(before)` for both an expressible and an unexpressible adapter.
- [ ] `TestPromptDenyCapability_NoNetworkNoClock` — the capability closure is exercised with a nil `appCfg` and a nil backend client and still answers; the daemon being offline may not change the answer.

**Defeat test:** `TestPromptDenyCapability_UnexpressibleRecordsFailed` — revert `internal/daemon/ai_oracle_receipt.go` line 82 to `Deny: func() error { return nil }`, expect RED with `want obligation:deny:FAILED:deny-not-expressible, got obligation:deny:SATISFIED`.

**Blast radius:** the F01 degraded-inspection path at the prompt checkpoint only - the path that runs when a prompt could not be evaluated. A wrong "unexpressible" answer for a runtime that can in fact deny turns a `HOLD` into a `DENY` on a prompt DeVoid already could not evaluate. A developer sees a blocked prompt with `failure-oracle:` reason tokens instead of a hold. Nobody's clean prompt is affected: this code is unreachable when inspection succeeds.

**Rollback:** one line, back to `func() error { return nil }`. No data, no wire, no migration.

**Exit:** `obligation:deny:SATISFIED` is emitted by zero code paths that did not consult `ResolveEffect`, proven by `TestPromptDenyCapability_UnexpressibleRecordsFailed` plus a grep gate in `capability_test.go` asserting `promptObligationCaps` has no `return nil` literal in its `Deny` arm.

---

## Task 3: Fix the proxy's three no-op capabilities, and make `Confirm` honestly nil

**Files:**
- `internal/proxy/failure_oracle_route.go` (`proxyObligationCaps`, `:56-70`; header comment `:1-11`)
- `internal/proxy/failure_oracle_route_test.go`

Three separate changes, and the third is the one with real behaviour:

1. `Deny` — becomes a closure over the handler's own refusal writer, returning an error when the handler has no writer bound. At `LOCAL_PROXY` the deny genuinely is deterministic (the proxy writes the refusal itself at `internal/proxy/ai_proxy.go:568-581, 611+`), so the provable condition is "a refusal writer is bound to this handler".
2. `Quarantine` — same, over the hold writer.
3. `Confirm` — becomes **nil**. The proxy has no trusted confirmation surface. Today the no-op yields `REQUIRED` / `hold-placed-awaiting-confirmation`, which does not set `Escalate` (`obligation.go:207-210`), so the pinned `TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE` trigger the file's own header promises has never been emitted. With `Confirm: nil` it becomes `UNSUPPORTED` with that trigger, `Escalate` is set, and the terminal escalates through `MoreRestrictive` to hold or deny - which is what the header already claims happens.

Also delete the now-false half of the header comment at `:8-11` and replace it with what the code does.

- [ ] `TestProxyConfirm_EmitsTrustedConfirmationUnavailable` — for a `REQUIRE_CONFIRMATION` terminal at `LOCAL_PROXY x PRE_UPSTREAM_DISPATCH`, the outcome tokens contain `obligation:require_confirmation:UNSUPPORTED` and the detail is exactly `TRUSTED_CONFIRMATION_SURFACE_UNAVAILABLE`. Failing test first.
- [ ] `TestProxyConfirm_EscalatedTerminalIsNeverWeaker` — for all 11 `REQUIRE_CONFIRMATION` rows at that surface/checkpoint, `verbRank(after) >= verbRank(VerbConfirmTrustedSurface)`.
- [ ] `TestProxyConfirm_NothingIsForwarded` — drive the real handler for each of those 11 rows and assert the upstream transport received zero requests, before and after the change. This is the customer-visible invariant: the escalation must not change what leaves the box.
- [ ] `TestProxyDeny_UnboundWriterRecordsFailed` — with no refusal writer bound, the `DENY` outcome is `FAILED`, not `SATISFIED`.

**Defeat test:** `TestProxyConfirm_EmitsTrustedConfirmationUnavailable` — revert `internal/proxy/failure_oracle_route.go:66` to `Confirm: func() error { return nil }`, expect RED with `want obligation:require_confirmation:UNSUPPORTED, got obligation:require_confirmation:REQUIRED`.

**Blast radius:** 11 pinned catalog rows at the proxy pre-dispatch checkpoint. Behaviourally the proxy already holds on all of them, so the developer-visible change is the reason text and, on a subset, a hold that becomes a deny. Nothing is forwarded either way - pinned by `TestProxyConfirm_NothingIsForwarded`. Whoever notices is a developer reading a proxy refusal message.

**Rollback:** restore the three closures. One commit revert; no state.

---

## Task 4: Stop the field-observation ledger calling EMITTED "observed"

**Files:**
- `internal/fieldobs/fieldobs.go` (record schema; bump `schemaVersion`)
- `cmd/devoid/ai_hook_runner.go` (`recordFieldObservation`, `:190-203`)
- `internal/airuntime/adapters/claudecode/detect.go` (`capabilitiesFromStatus`, `:159-168`)
- `internal/fieldobs/fieldobs_test.go`, `cmd/devoid/ai_hook_runner_test.go`

Add a closed `Assurance` field to the ledger record with two members today - `EMITTED` and `RUNTIME_ACKNOWLEDGED` - and record `EMITTED` at the existing call site, because that is all `TranslationDisposition == EXPRESSED` establishes. Then `capabilitiesFromStatus` raises the rung to `CertObserved` **only** on a `RUNTIME_ACKNOWLEDGED` record; an `EMITTED` record raises it to `CertLoaded` and no further.

`fieldobs` already treats an unknown `schemaVersion` as EMPTY rather than mis-parsing (`fieldobs.go:69-70`), so an older agent reading a newer ledger degrades to "never observed", which is the safe direction.

**This is the riskiest task in the wave and the reason is not technical.** It is a deliberate downgrade of a green surface. Every endpoint that shows `USER_PROMPT_SUBMIT: observed` in `devoid ai certify` and in the console's capability rows will show `loaded` after it ships, because no runtime-acknowledgement channel exists yet. Nothing enforcing changes; the claim changes. It must ship in the same release as the canary work that can legitimately restore `observed`, or an operator will read it as a regression and go looking for a rollback.

- [ ] `TestFieldObs_EmittedDoesNotRaiseObserved` — a ledger holding only `EMITTED` records leaves every checkpoint at `loaded`. Failing test first.
- [ ] `TestFieldObs_RuntimeAcknowledgedRaisesObserved` — a `RUNTIME_ACKNOWLEDGED` record raises exactly that checkpoint to `observed` and no other.
- [ ] `TestFieldObs_UnknownSchemaVersionIsEmpty` — regression pin on the existing behaviour, so the bump cannot silently promote garbage.
- [ ] `TestFieldObs_CodexEmittedDenyIsNotObserved` — the specific case the product measured: a codex adapter that expressed a deny records `EMITTED`, and `devoid ai certify codex` prints `loaded`, not `observed`.
- [ ] `TestFieldObs_LadderNeverDescends` — a checkpoint already at `enforcement-tested` is not pulled down by an `EMITTED` record (preserves the existing `detect.go:161` guard).

**Defeat test:** `TestFieldObs_EmittedDoesNotRaiseObserved` — revert `internal/airuntime/adapters/claudecode/detect.go:162` to the unconditional `cap.CertificationState = string(airuntime.CertObserved)`, expect RED with `USER_PROMPT_SUBMIT: want certificationState "loaded", got "observed"`.

**Blast radius:** every endpoint's certification display and the console's per-checkpoint capability rows. No enforcement path reads `CertificationState`. The people who notice are operators looking at coverage, and they will notice on day one. Ship the release note with it.

**Rollback:** revert `detect.go:159-168` to the current unconditional promotion. The ledger's new field is additive and harmless if unread.

**Exit:** `devoid ai certify claude-code` and `devoid ai certify codex` both print `loaded` for every checkpoint on a rig with no runtime acknowledgement, and `observed` appears on no surface without a `RUNTIME_ACKNOWLEDGED` ledger record.

---

## Task 5: Give the 344 post-checkpoint RESTRICT_CAPABILITY rows a real executor, by wiring the taint store that already restricts

**Files:**
- new `internal/daemon/ai_posttool_obligations.go`
- `internal/daemon/ai_ingress.go` (`handleAIPostTool`, `:796-891`)
- new `internal/daemon/ai_posttool_obligations_test.go`

The capability the catalog asks for is already implemented and wired - it just does not run through the obligation machinery or land in a receipt. `handleAIPostTool` taints the session on a high-confidence ingress signal (`ai_ingress.go:867-883`), and `handleAIToolDecision` reads that taint and holds the next risky action (`internal/daemon/ai_handlers.go:3054-3085`). That **is** `RESTRICT_CAPABILITY`: subsequent capability is narrowed after an effect that already happened.

Build `postToolObligationCaps` supplying:
- `RestrictCapability` — performs the existing taint write and returns the closed list of restricted capability tokens (derived from `taintRisky`'s classification, not free text). Zero tokens returns an empty slice, which `obligation.go:260-262` correctly records as `UNSATISFIED` / `nothing-dropped`.
- `Audit` — the same `ensureEvidenceDelivery` probe `promptObligationCaps` uses.
- Every prevention-class capability stays **nil**. `obligation.Execute` forces them `UNSUPPORTED` with `POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM` at a post checkpoint anyway (`obligation.go:215-239`); nil makes that structural rather than incidental.

Then spool one four-axis receipt with `RequestedEffect: restrict-capability`, `TranslationDisposition: NOT_APPLICABLE` (no adapter was asked to express anything), `ActualEffectObserver: NONE`, `SecurityOutcome: UNKNOWN`, `GovernanceDisposition: devoid-mediated`.

`restrict-capability` is already the 12th member of the effect tuple in Go (`vocab.go:109`), on the heartbeat wire (`controls/attestation.go:425`) and in TypeScript (`ai-security-portable.generated.d.ts:72`). **No vocabulary append, no parity-pin change, no Backend deploy needed.** Verified.

Volume control: emit only inside the existing `tainted` branch, so a clean tool result produces no new event.

- [ ] `TestPostToolObligations_RestrictSatisfiedWithDroppedList` — a tainting tool result produces `obligation:restrict_capability:SATISFIED` with a non-empty, closed-vocabulary detail. Failing test first.
- [ ] `TestPostToolObligations_PreventionKindsAreUnsupported` — `DENY` and `QUARANTINE` at `POST_TOOL` record `UNSUPPORTED` with `POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM`, never `SATISFIED`.
- [ ] `TestPostToolObligations_NoTaintNoReceipt` — a clean tool result spools zero additional events. Assert the spool depth is unchanged.
- [ ] `TestPostToolObligations_ReceiptValidates` — the spooled receipt passes `airuntime.LocalEffectReceiptCompatibilityV1.Validate()`, including the local-writer boundary at `effect_receipt.go:133-138`.
- [ ] `TestPostToolObligations_SecurityOutcomeStaysUnknown` — the endpoint never certifies an outcome for a post-effect restriction.

**Defeat test:** `TestPostToolObligations_PreventionKindsAreUnsupported` — revert `internal/obligation/obligation.go:218-219` (drop the `if post` guard in the `KindDeny` arm), expect RED with `want obligation:deny:UNSUPPORTED:POST_CHECKPOINT_RETROACTIVE_PREVENTION_CLAIM, got obligation:deny:SATISFIED`.

**Blast radius:** one extra durable evidence row per tainted tool result, on the existing V1 spool with an existing event type and existing wire fields. The evidence spool is bounded and the Backend already accepts this exact shape (`hasLocalCompatReceiptTuple` -> `projectLocalEffectReceipt`, `endpoint-evidence-ingest.service.ts:1788-1793`). Risk is spool volume on a noisy endpoint; the taint gate makes it rare. Nobody's tool call is blocked, held or altered by this task.

**Rollback:** delete the call from `handleAIPostTool`. The taint write and the hold it drives are untouched either way - this task adds a receipt, not an enforcement.

**Exit:** 86 of the 344 pinned `RESTRICT_CAPABILITY` rows (the `RUNTIME_ADAPTER x POST_TOOL` block) have an executor, up from 0, proven by a test that walks the catalog and asserts a non-nil capability for each.

---

## Task 6: Derive the E0-E3 effect-assurance level on the READ side, from axes already stored

**Files:**
- new `Backend/src/ai-governance/services/ai-effect-assurance.util.ts`
- new `Backend/src/ai-governance/services/ai-effect-assurance.util.spec.ts`
- `Backend/src/ai-governance/services/ai-query.service.ts` (the two projections at `:3730` and `:5954`)
- `Frontend/app/ai-control-plane/ai-sessions/[id]/obligation-axes.tsx`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/__tests__/obligation-axes.test.tsx`

The strategy's assurance ladder is already latent in the four axes. Derive it; do not store it.

| Level | Derivation from stored columns |
|---|---|
| **E0 Intended** | `requestedEffect` present, `translationDisposition == NOT_APPLICABLE`, `adapterExpressedEffect` null |
| **E1 Emitted** | `translationDisposition == EXPRESSED` and `adapterExpressedEffect` non-null |
| **E2 Observed** | `actualEffectObserver != NONE` and `observedActualEffect` non-null |
| **E3 Independently witnessed** | `receiptAssurance == INDEPENDENTLY_OBSERVED` **and** E2 holds |

Two properties make this the cheapest safe win in the wave:

- **Zero endpoint change, zero wire change, zero migration.** Nothing new is written; the level is computed at read from columns the fold already validated (`ai-local-receipt-compat.util.ts:129-140`) and the ingest already refuses to let a body pre-seed (`RECEIPT_METADATA_FIELDS`, `:74-86`).
- **E3 is unreachable by construction today**, and the UI must say so rather than leave a blank. `validateAndDeriveAiReceiptV2` hardcodes `receiptAssurance: 'VERIFIED_ENDPOINT_REPORT'` on the endpoint route (`ai-enforcement-receipt-v2.ts:1385`) and `resolveProofs` refuses a self-asserted independent manifest (`:1121-1125`). No producer of `INDEPENDENTLY_OBSERVED` exists. The render for E0/E1/E2 must read "not independently witnessed", and no row below E3 may use the word "proven".

- [ ] `deriveEffectAssurance.spec` — a table test over all 4 x 6 x 7 combinations of (`translationDisposition` x `actualEffectObserver` x `securityOutcome`) asserting exactly one level, with an explicit case for every impossible combination the fold already rejects. Failing test first.
- [ ] `TestEffectAssurance_E3RequiresIndependentAssurance` — a receipt with `actualEffectObserver: FINAL_STATE_GRADER` and `receiptAssurance: VERIFIED_ENDPOINT_REPORT` derives **E2**, never E3.
- [ ] `TestEffectAssurance_NoProvenBelowE3` (Frontend) — render each of E0/E1/E2 and assert the DOM contains none of "proven", "prevented" or "enforced" as a claim about the outcome.
- [ ] `TestEffectAssurance_PostToolNeverReadsPrevented` — an E1 row at `POST_TOOL_USE` renders the existing "flagged after the tool ran" phrasing, unchanged.
- [ ] `TestEffectAssurance_NothingIsStored` — the ingest spec asserts no new column and no new metadata key is written for any event shape.

**Defeat test:** `TestEffectAssurance_E3RequiresIndependentAssurance` — revert `ai-effect-assurance.util.ts` to derive E3 from `actualEffectObserver !== 'NONE'` alone, expect RED with `expected "E2", received "E3"`.

**Blast radius:** read-side only, on two query projections and one console panel. Wrong output is a wrong label on an events page - visible to a console user, invisible to every endpoint. No endpoint behaviour, no enforcement, no ingest.

**Rollback:** revert three files. No stored data was touched, so rollback is total and instantaneous.

**Deploy order:** Backend and Frontend only; no agent release is involved, so the Backend-before-agent rule has nothing to order here. Deploy needs a fresh explicit owner ask like any other.

**Exit:** every AI-security event rendered in the console carries exactly one of E0/E1/E2/E3, and the count of events rendered at E3 is **0** until the canary wave lands an independent observer - a number, and the honest one.

---

## Task 7: Wire the canary receipt sink to the Backend route that already exists

**Files:**
- new `internal/daemon/canary_receipt_sink.go`
- `internal/daemon/server.go` (assign `Receipts` at the composition root where the claude integrity provider is constructed)
- `internal/codexmanaged` composition root (same, for its `CanaryConfig.Receipts`)
- new `internal/daemon/canary_receipt_sink_test.go`

One type implementing both `claude.ReceiptSink` (`internal/airuntimeintegrity/providers/claude/canary.go:150-153`) and `codexmanaged.ReceiptSink` (`internal/codexmanaged/canary.go:168-171`), POSTing through the daemon's existing request-signing backend client to `POST /api/v1/ai/policy-delivery/canary-receipt` (`Backend/src/ai-policy-delivery/endpoint-control-authority.controller.ts:758-779`).

The route, the DTO, the persistence, the byte-identical-replay no-op and the fleet rollup all exist. This is the downstream half of SOT §15.2 C9 and it is pure wiring.

**The direction of risk here is upward, which is unusual and needs guarding.** Today every canary errors because a nil sink is a delivery failure. After this task some canaries will prove. So the sink must confirm the server actually recorded the receipt - a 2xx with the recorded-receipt body - and treat anything else, including a network error, as delivery failure. A sink that returns nil on a dropped request would turn "no evidence anywhere" into "proven", which is the exact defect `errNoReceiptSink` was written to prevent (`canary.go:334-343`).

- [ ] `TestCanaryReceiptSink_NonSuccessIsDeliveryFailure` — 4xx, 5xx, a timeout and a truncated body each return an error, and the canary result stays `error` with `canary-receipt-undelivered`. Failing test first.
- [ ] `TestCanaryReceiptSink_UnsignedRequestIsRefused` — with request signing unavailable the sink returns an error rather than POSTing unsigned.
- [ ] `TestCanaryReceiptSink_ContentFree` — the marshalled body contains only the twelve `Receipt` fields (`canary.go:131-145`); a fuzz over hostile inputs asserts no path, prompt or credential can appear.
- [ ] `TestCanaryReceiptSink_RefusalOutcomesAreDeliveredToo` — a duplicate/expired/wrong-instance challenge still uploads its receipt, matching `emitReceipt`'s contract at `:329-331`.
- [ ] `TestCanaryReceiptSink_NilSinkStillFailsClosed` — the pre-existing behaviour is pinned so a future refactor cannot reintroduce a silent nil.

**Defeat test:** `TestCanaryReceiptSink_NonSuccessIsDeliveryFailure` — revert the sink's status check to `return nil` after the POST regardless of status, expect RED with `canary outcome: want "error"/canary-receipt-undelivered, got "proven"`.

**Blast radius:** one signed POST per canary run - a low-frequency path. If the sink is wrong in the "too strict" direction, canaries keep erroring exactly as they do today, which is a no-op. If it is wrong in the "too lenient" direction, a canary self-certifies with no server evidence - the failure this task exists to avoid, and the reason for the first two tests.

**Rollback:** leave `Receipts` nil at both composition roots. That restores today's behaviour byte for byte.

**Exit:** a canary run against a local Backend produces a row readable through `GET /api/v1/ai/policy-delivery/canary-rollup`, and `internal/liveproof/register.json`'s `evidence-event-traced-end-to-end` entry gains its endpoint half. `Receipts:` is assigned in at least one non-test file - a grep whose answer today is zero.

---

## Task 8: Build the side-effect witness as code, scoped to the canary rig

**Files:**
- new `internal/aicanary/sideeffect.go`
- new `internal/aicanary/sideeffect_test.go`
- `docs/ai-security/LIVE_PROOF_PROCEDURE.md` (point the manual procedure at the code)

Turn the one E3-grade observation the product has ever made into something that runs. `internal/liveproof/register.json`'s `pretooluse-deny-stops-side-effect` entry records the procedure exactly: a deny run whose tool input would create a marker file, and an **allow twin on the identical rig** whose marker must appear. The witness is the pair, not the deny alone - a deny that stops everything because the rig is broken proves nothing.

```go
type SideEffectWitness struct {
    MarkerDir string // rig-scoped; MUST refuse a path under the real ProgramData or user home
}

type WitnessResult struct {
    DenyMarkerAbsent bool
    AllowMarkerPresent bool
    Witnessed bool // both, and only both
}
```

`Witnessed` is `DenyMarkerAbsent && AllowMarkerPresent`. Any other combination is `false` with a named reason - "allow twin did not run" is not a deny proof.

**What this cannot do, stated in the code and in the console copy.** It certifies the *mechanism* on the rig at a moment in time. It cannot promote an ordinary customer event to E3. Per-event assurance stays E1 or E2 (Task 6), and a recent green witness must never change a stored event's level. The strategy says this itself: "a recent E3 semantic canary can certify that the exact mechanism is currently working, but it does not magically turn every unrelated event into independently witnessed proof."

- [ ] `TestSideEffectWitness_DenyAloneIsNotProof` — deny marker absent, allow marker also absent -> `Witnessed == false`, reason `allow-twin-did-not-run`. Failing test first.
- [ ] `TestSideEffectWitness_BothConditionsRequired` — the full truth table, four cases.
- [ ] `TestSideEffectWitness_RefusesRealMachineRoots` — a `MarkerDir` under `%ProgramData%\devoid` or under the invoking user's home is rejected before any file is touched. This is the hermeticity rule `fieldObsDir` already enforces (`cmd/devoid/ai_hook_runner.go:153-163`) and the reason the 2026-08-26 run could be trusted.
- [ ] `TestSideEffectWitness_DoesNotSetEventAssurance` — a green witness leaves every stored event's derived assurance unchanged. This is the pin against the "one canary proves everything" lie.

**Defeat test:** `TestSideEffectWitness_DenyAloneIsNotProof` — revert `Witnessed` to `DenyMarkerAbsent` alone, expect RED with `want Witnessed=false (allow-twin-did-not-run), got true`.

**Blast radius:** none in the customer path. The package is invoked only by the canary rig and by tests; it writes only inside a rig-scoped directory it validated first. If the path guard is wrong it could write a marker file into a real profile - which is why that guard has its own test and runs before any I/O.

**Rollback:** delete the package. It has no production caller in this wave; the canary wave adds one.

**Exit:** the four-case truth table passes, and `LIVE_PROOF_PROCEDURE.md` names the function that performs step 4b instead of describing it in prose.

---

## Wave exit criteria

1. **No obligation capability returns `nil` without consulting a resolver.** Zero occurrences of a bare `func() error { return nil }` in any `obligation.Capabilities` literal across the repo, enforced by a test that reads the two producer files. Defeat: `TestPromptDenyCapability_UnexpressibleRecordsFailed` (Task 2), `TestProxyConfirm_EmitsTrustedConfirmationUnavailable` (Task 3).
2. **Every desired effect resolves through one table.** 264 exhaustive (checkpoint x effect) pairs across both adapters agree between `ResolveEffect` and `TranslateDecision`. Defeat: `TestResolveEffect_CodexMatrixMatchesTranslateDecision` (Task 1).
3. **An unknown adapter or checkpoint cannot report a successful effect.** Defeat: `TestResolveEffect_UnknownAdapterIsUnsupported` (Task 1).
4. **86 pinned `RUNTIME_ADAPTER x POST_TOOL` catalog rows have an executor, up from 0**, and every prevention-class kind at a post checkpoint is `UNSUPPORTED`. Defeat: `TestPostToolObligations_PreventionKindsAreUnsupported` (Task 5).
5. **`observed` appears on no capability row without a runtime acknowledgement.** `devoid ai certify` prints `loaded` for every checkpoint on a rig with none. Defeat: `TestFieldObs_EmittedDoesNotRaiseObserved` (Task 4).
6. **Every rendered event carries exactly one of E0/E1/E2/E3, and the E3 count is 0** until an independent observer exists. No event below E3 renders the word "proven". Defeat: `TestEffectAssurance_E3RequiresIndependentAssurance` and `TestEffectAssurance_NoProvenBelowE3` (Task 6).
7. **`Receipts:` is assigned in at least one non-test file**, and a canary receipt is readable through the production canary rollup route. Defeat: `TestCanaryReceiptSink_NonSuccessIsDeliveryFailure` (Task 7).
8. **A deny with no allow twin is not a witness.** Defeat: `TestSideEffectWitness_DenyAloneIsNotProof` (Task 8).
9. **Clean allow still works.** A full local Docker stack run plus a real Claude Code and a real Codex session on the rig complete an ordinary allow at every checkpoint with no new hold, no new deny and no new prompt. This is the anti-brick gate and it is not optional: an uninstalled control protects nobody.

**Release ordering for the whole wave.** Tasks 1-5, 7 and 8 are agent-only and add no wire field, no vocabulary member and no DTO key - verified: `restrict-capability` is already the 12th member of the pinned tuple in Go, on the heartbeat wire and in TypeScript, and the receipt shape Task 5 spools is one the Backend already accepts. Task 6 is Backend- and Frontend-only and touches no contract. **No contract widens in this wave, so no Backend-before-agent ordering constraint is created.** That is a deliberate design goal, not luck: it is what makes the wave rollback-per-task instead of rollback-in-sequence. Deploying anything still needs a fresh explicit owner ask.

---

## What this wave deliberately does NOT do

**It does not emit a V2 enforcement receipt for prompt or tool actions.** The Backend's V2 lane is complete and hardened, but `prepareReceipt` rejects any receipt whose decision the server does not already know (`ai-enforcement-receipt.service.ts:158-170`, `unknown-causal-decision`), and the only production producer of registered decisions mints one per issued policy bundle (`ai-enforcement-decision-producer.service.ts:162-174`). Ten fields must match, including a server-keyed HMAC `proposalFingerprint` the endpoint cannot compute (`ai-enforcement-receipt-v2.ts:1063-1082`). Getting a server-known decision per prompt would put a backend round-trip in front of every checkpoint - the exact dependency that produced six leaked private keys in ten runs (SOT §15.1). **The unblocking change is a Backend one and belongs to a later wave:** accept an endpoint-authored `AiDecisionV2` delivered inside the same receipt envelope, with a distinct `proposalFingerprint` keyId label so a server-minted and an endpoint-minted decision can never be confused, keeping `receiptAssurance: VERIFIED_ENDPOINT_REPORT` and `certifiedSecurityOutcome: UNKNOWN`. Until then the V1 four-axis compatibility receipt plus Task 6's derived assurance carries the same information with none of the risk.

**It does not create an `INDEPENDENTLY_OBSERVED` producer.** The receipt validator correctly refuses an endpoint to self-assert independence (`ai-enforcement-receipt-v2.ts:1121-1125`). Producing that value needs a second authenticated principal that is not the endpoint - a new identity, a new key, a new trust root. That is the identity/tamper workstream's territory, not this one. The seam is named here so a later wave can pick it up: `validateAndDeriveAiReceiptV2`'s hardcoded `'VERIFIED_ENDPOINT_REPORT'` at `:1385` is the single line that would become transport-derived.

**It does not build a general E3 witness for arbitrary customer side effects.** The strategy is explicit that E3 is not achievable for every arbitrary side effect on an ordinary endpoint, and it is right. The witnesses it lists - a controlled upstream that received no request, a WFP-recorded connection denial, a provider gateway proving no upstream write began - each require infrastructure this wave does not own (forced egress, the gateway, the firewall lane). Task 8 builds the one witness that needs nothing outside the box, and says out loud that it certifies a mechanism rather than an event.

**It does not add a `PLANNED` obligation state.** `AI_OBLIGATION_STATES` is a generated, ordered, cross-language tuple (`Backend/packages/shared-contracts/dist/generated/ai-security-portable.generated.d.ts:41`) pinned three ways and validated with `@IsIn` on the ingest DTO. Appending a member would touch all three `shared-contracts` copies, the Backend DTO and the Go tuple, and would have to deploy Backend-first or the agent's new token would be silently dropped by `AgentIngestValidationPipe`. The strategy's requirement - "a capability callback that returns success without doing anything may record **planned**, never **satisfied**" - is met more cheaply and more honestly by Tasks 2 and 3: a capability that does nothing now reports `FAILED` with a named cause, or is `nil` and reports `UNSUPPORTED` with a pinned trigger. Both are existing states with existing meanings, and both are strictly stronger than `PLANNED`, which would still read as partial credit.

**It does not narrow the capability tables by runtime version or binary digest.** `CapabilityKey` carries `RuntimeVersion` and `HookDialect` and the resolver returns `VersionRange: "*"`, because the shipped tables were derived per checkpoint and not per version, and the product has been burned before by a pin that claimed more than was measured (SOT §16.1 C1: do not widen the Codex dialect pin without two vendor artefacts per family). Populating real version ranges is the certification-factory wave's job, feeding this same struct. Claiming a version-specific capability we never measured would be the same defect one level up.

**It does not touch the daemon decision budget, the 60-second hook timeout, or any fail-open branch.** Those are the inline-decision-core wave's. Nothing in Wave 5 can make a decision arrive faster or more reliably; it only makes the record of what happened afterwards honest. Worth saying plainly, because a reader could otherwise mistake "Ability to enforce once a decision is reached" for a fix to "Reliability of reaching the decision engine". They are different rows and this wave moves only the first.

**It does not weaken any existing guard.** Every change here is stricter or neutral: three no-op capabilities become checked, one certification rung becomes harder to reach, one class of catalog row gains an executor it never had, and one assurance level is derived and displayed where nothing was displayed before. The one place a task could over-block - Task 2's escalation on the 25 `HOLD` and 11 `REQUIRE_CONFIRMATION` prompt rows - is bounded by `MoreRestrictive`, gated on a purely local table lookup, and reachable only on a prompt DeVoid already failed to evaluate.
