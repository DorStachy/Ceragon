# Fix specs - cluster TAMPER

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

ONE PRODUCER, THREE CONSUMER FAILURES. All four findings trace to a single event stream: the RA-5 semantic-integrity controller's spool sink (Installers/internal/daemon/ai_integrity_subsystem.go:52-67), the ONLY endpoint producer of AGENT_CONTROL_TAMPER. F1 is why that stream exists and why it repeats; F4 is the envelope field it stamps; F33 is the read-side projection that never lands; F34 is the band the write side stamps. Fixing F1 alone stops the noise but leaves a real tamper event just as uninvestigable; fixing F33+F34 alone makes the noise legible but keeps ~2 events/minute of it. All four are needed; they share no file, so they can land in parallel (F33 and F34 share one new helper and should land together).

WHAT I PROVED THAT THE WRITEUP DID NOT KNOW:
1. ContainmentCoordinator and both containment providers (WFPContainment, ExternalEgressContainment) are constructed ONLY in *_test.go. `grep -rn "ContainmentCoordinator{" --include=*.go` returns 7 hits, all tests. integrityControllerOptions() (ai_integrity_subsystem.go:314-330) never sets the Containment field. So opts.Containment is a nil pointer in every shipped daemon, every Engage is a nil-receiver call returning unsupported("no-provider"), and recordContainment turns that into a HIGH tamper event. F1's hypothesis is CONFIRMED at file:line. This is the "green-but-inert DI" class: every containment test injects a fake provider, so the suite is green over a path that cannot exist in production.
2. The single-slot dedupe. TargetRecord.LastTransitionKey is ONE string, compared at controller.go:810. Any path emitting two DIFFERENT transition keys per sweep alternates the slot and both emit forever. containOnStateCorruption (controller.go:379-406) is exactly that shape: it emits DETECT unconditionally (no fresh-guard, unlike openEpisode at :707-736) then CONTAIN. Two transitions per 60s±10s sweep = one every ~35s. Measured: 61 events / 2163 s = 35.5 s.
3. The lifecycle brackets are the INTENT RELAY, not containment. serverIntentRelay starts EMPTY (ai_integrity_intents.go:78-80); with no intent reconcileTarget returns at the unmanaged branch (controller.go:426-436) and emits NOTHING. Accept REPLACES the whole set on any non-nil list (:108-140). So: silence until the Backend first names a control target on a heartbeat (the 16-minute gap), storm while named, silence again the moment a heartbeat stops naming it (the unexplained stop). Both transitions are completely silent — no event, no log, no console signal. emittedAt is stamped at enqueue (ai_integrity_subsystem.go:61) and the Backend stores eventTime = new Date(input.emittedAt), so delivery lag is RULED OUT: the controller genuinely emitted only inside that window.
4. Severity IS server-derived, contrary to F34's framing — but AGENT_CONTROL_TAMPER carries an unconditional 'high' type-base (ai-event-severity.util.ts:71, applied :293-296) that fires with zero substantiating facts, and the alert lane stamps a SECOND, independent static CRITICAL (alert-outbox-enqueue.ts:98-100, ~204).
5. packages/shared-contracts/src/policy-tamper-evidence-contract.ts holds the full TS half including normalizePolicyTamperEvidence — and NOTHING under Backend/src imports it. The Go comment "Ingestion validates it" (tamper.go:147) is false. The Frontend ships a complete TamperTimeline renderer (detections-content.tsx:765-880) bound to row.tamper, and no Backend DTO has a tamper field. A finished renderer over a field the server never sends.

MIRROR SCOPE (narrower than the brief assumes): ai-governance-contract.ts and policy-tamper-evidence-contract.ts exist ONLY in Backend/packages/shared-contracts/src/. I listed both other copies — Ceragon/packages/shared-contracts/src/ and Ceragon-Intelligence/packages/shared-contracts/src/ — and neither carries either file. Contract edits in this cluster touch ONE mirror, not three. The genuine twins to keep in parity are Backend/src/ai-governance/ai-source-surface.ts (its own header demands byte-identity) and the Go twin Installers/internal/clientkind/clientkind.go.

WHAT I COULD NOT DETERMINE, STATED PLAINLY: the exact repeat driver for F1 is one of two source-proven loops — the containOnStateCorruption DETECT/CONTAIN flip-flop, or per-sweep REPAIR-attempt churn on a wedged target (controller.go:499-541, where RepairAttempt makes each key distinct). The first predicts a 50/50 POLICY_STATE_CORRUPT / CONTAINMENT_FAILED reason mix; the evidence records 100% CONTAINMENT_FAILED, which fits neither cleanly. The discriminator is one query — SELECT metadata->>'reason', metadata->>'phase', count(*) FROM ai_events WHERE event_type='AGENT_CONTROL_TAMPER' GROUP BY 1,2 — which I could not run. The endpoint-side discriminator (integrity/state.json) is unreadable: the daemon runs as SYSTEM (`%WINDIR%\System32\config\systemprofile\.devoid` exists but is access-denied; the interactive user's `%USERPROFILE%\.devoid` has NO integrity/ directory), so it needs elevation. The F1 fix closes BOTH loops with one change, so the ambiguity does not block implementation — but the cadence must not be recorded as "explained" without that query.


---

## F1 - A missing containment CAPABILITY is emitted as a repeating HIGH tamper EVENT, and it overwrites the real finding

- **Severity**: HIGH
- **Side**: agent   **Effort**: M   **Root cause verdict**: CONFIRMED

### Root cause

Three defects compose into the storm.

(1) NO CONTAINMENT PROVIDER IS EVER WIRED — the hypothesis, confirmed. `Server.integrityControllerOptions()` (Installers/internal/daemon/ai_integrity_subsystem.go:314-330) builds ControllerOptions with Budget/EndpointScopeHash/Providers/Instances/Intents/Canaries/Authority and NEVER sets `Containment`. `grep -rn "ContainmentCoordinator{" --include=*.go` over the whole repo returns 7 hits, ALL in *_test.go; `WFPContainment{` and `ExternalEgressContainment{` likewise only in containment_test.go. So `c.opts.Containment` is a nil *ContainmentCoordinator in every shipped daemon. `Engage` handles the nil receiver (containment.go:226-229) and returns `unsupported("no-provider")` + ErrContainmentUnsupported.

(2) THE CAPABILITY GAP IS LAUNDERED INTO THE MOST ALARMING REASON IN THE VOCABULARY. `recordContainment` (controller.go:753-796) switches on `st.State`: ContainmentUnsupported and ContainmentFailed BOTH map to `outcome = OutcomeFailed` and, critically, `tamperReason = "CONTAINMENT_FAILED"` (:759-761 and :764-765), DISCARDING the `reason` argument the caller passed. Every call site passes the real finding — "UNSUPPORTED_RUNTIME_VERSION" (:476), the drift reason (:495, :538), "CANARY_FAILED" (:588), "POLICY_STATE_CORRUPT" (:405) — and all of them are thrown away. The emitted event therefore says CONTAINMENT_FAILED and nothing about WHAT was tampered with. It also collapses two different facts: "this platform/config cannot contain" (UNSUPPORTED) and "we tried to contain and it failed" (FAILED). The target is also driven to StateFailed (:772-775), which `aggregateIntegrityState` (ai_integrity_subsystem.go:573-629) rolls up pessimistically, so the whole endpoint reports integrity=failed on the heartbeat because of a capability that was never installed.

(3) IT REPEATS BECAUSE THE DEDUPE IS A SINGLE SLOT. `emit` (controller.go:802-830) suppresses only when `rec.LastTransitionKey == key` — ONE remembered key per target. `containOnStateCorruption` (:379-406) emits DETECT unconditionally (no `fresh` guard, unlike `openEpisode` at :707-736 which explicitly returns early when `!fresh`) and then CONTAIN. Two distinct keys alternate in the one slot, so BOTH re-emit every sweep, forever. `SweepInterval` is 60s with `SweepJitter` 10s (:46-50) — 2 events per ~65-70s = one every ~35s. Measured: 61 events over 16:20:49→16:56:52 = 2163s = 35.5s apart. The same weakness lets the repair path churn (`RepairAttempt` is inside `transitionKey` at :967-975, so attempts 1,2,3 are three distinct keys that recycle as stamps age out of the 5-minute window, episode.go:109-133).

THE 16-MINUTE LATE START AND THE UNEXPLAINED STOP ARE THE INTENT RELAY, NOT CONTAINMENT. `serverIntentRelay` starts EMPTY by design (ai_integrity_intents.go:78-80); `IntentFor` answers ok=false for any key the server has not named (:87-98); `reconcileTarget` then takes the unmanaged branch and returns BEFORE any Compile/Inspect/emit (controller.go:426-436). A freshly-booted daemon emits nothing at all until a heartbeat response first carries a readable `runtimeIntegrityIntents` entry for one of its control targets — that is the 16-minute gap. `Accept` REPLACES the entire set on any non-nil list (:108-140), so the first heartbeat whose list no longer names that key returns the target to unmanaged and the stream stops dead — that is the unexplained stop, ~2.5 min after revision 2 activated (18:54:31 local per the daemon log; storm ends 18:56:52 local; NO daemon restart in that window). Both transitions are SILENT: no event, no log line (`acceptRuntimeIntegrityIntents` warns only when entries are REJECTED, :249-251), nothing in the console. Delivery lag is ruled out: `EmitTransition` stamps `EmittedAt: now()` at enqueue (ai_integrity_subsystem.go:61) and the Backend stores `eventTime = new Date(input.emittedAt)`, so the observed window IS the emission window.

WHAT I COULD NOT DETERMINE: which repeat loop actually ran. The flip-flop predicts a 50/50 POLICY_STATE_CORRUPT / CONTAINMENT_FAILED mix; the evidence records 100% CONTAINMENT_FAILED. The repair-churn loop predicts a majority of drift-reason REPAIR rows. Neither matches a pure CONTAINMENT_FAILED stream, so either the sample was filtered or a third target-key-churn path is involved. The on-endpoint discriminator is unreadable without elevation (SYSTEM profile), and the server-side discriminator is one GROUP BY query I could not run. The fix closes both loops, so this does not block implementation — but it must not be recorded as fully explained.

### Evidence (read at origin/main)

- `Installers/internal/daemon/ai_integrity_subsystem.go:314-330 — integrityControllerOptions() omits the Containment field entirely`
- `Installers/internal/airuntimeintegrity/containment.go:226-229 — Engage: `if c == nil || c.Provider == nil { return c.unsupported("no-provider"), ErrContainmentUnsupported }``
- `Installers/internal/airuntimeintegrity/containment.go:164-170 — ContainmentCoordinator; constructed only at containment_test.go:256,276,313 / controller_test.go:238,499,631 / state_test.go:107`
- `Installers/internal/airuntimeintegrity/controller.go:753-796 — recordContainment; :759-761 and :764-765 overwrite tamperReason with "CONTAINMENT_FAILED"; :772-775 forces StateFailed; :785-795 emits`
- `Installers/internal/airuntimeintegrity/controller.go:802-830 — emit(); :810 single-slot `rec.LastTransitionKey == key` dedupe`
- `Installers/internal/airuntimeintegrity/controller.go:379-406 — containOnStateCorruption emits DETECT with no fresh-guard, then CONTAIN`
- `Installers/internal/airuntimeintegrity/controller.go:707-736 — openEpisode, which DOES have the fresh-guard the above lacks`
- `Installers/internal/airuntimeintegrity/controller.go:46-50 — SweepInterval 60s, SweepJitter 10s`
- `Installers/internal/airuntimeintegrity/controller.go:426-436 — the unmanaged early-return that produces total silence`
- `Installers/internal/airuntimeintegrity/controller.go:967-975 — transitionKey includes repairAttempt`
- `Installers/internal/daemon/ai_integrity_intents.go:78-80,87-98,108-140,249-251 — relay starts empty; whole-set replacement; warn only on rejection`
- `Installers/internal/daemon/ai_integrity_subsystem.go:52-67 — the sole spool producer; EmittedAt stamped at enqueue`
- `Installers/internal/airuntimeintegrity/episode.go:160-172 — criticalTransition(), the existing Go predicate for genuinely critical transitions`
- `C:/ProgramData/devoid/logs/devoid.log:18 — "AI policy: signed authority activated revision=1" at 18:04:48+03:00; :250 revision=2 at 18:54:31; no restart between`

### Fix

ONE PRINCIPLE: a capability this endpoint does not have is POSTURE, reported once and continuously; only an actual attempt that failed is an EVENT. Four surgical changes, all in Installers.

A. WIRE THE COORDINATOR EXPLICITLY. In integrityControllerOptions() set `Containment: s.integrityContainment()`, a new constructor returning `&airuntimeintegrity.ContainmentCoordinator{Provider: nil, ...}` where no provider can honestly be built. This changes no behaviour on its own — it makes the absence a DECLARED, testable fact instead of a forgotten field, and gives one seam to plug a real provider into later. Do NOT invent a provider to make the gap go away; the honesty rules at containment.go:10-30 are correct.

B. STOP TURNING A MISSING CAPABILITY INTO AN EVENT. In recordContainment, split the two states that are currently fused:
   - ContainmentUnsupported (the shipped reality): persist `r.Containment = ContainmentUnsupported` and `r.State = StateFailed` as today, but emit NO transition; return early. The fact still reaches the server on every heartbeat via `PolicyIntegrityReport.Containment`, which aggregateIntegrityState already populates — a continuous posture field, not 138 alerts.
   - ContainmentFailed / default after a real Engage: emit as today, but STOP overwriting the reason. Keep `Reason: nonEmptyReason(reason)` — the caller's real finding — and carry the containment failure in the already-present `Response: shortSlug(st.ReasonSlug)`, which the console renders. CONTAINMENT_FAILED stays in the vocabulary for its actual meaning: the containment CONTROL itself was tampered with (Control: CONTAINMENT_CONTROL).
   This needs no contract change: reason vocabulary, phase/outcome matrix and response slug all already exist.

C. KILL THE REPEAT LOOP AT ITS MECHANISM, NOT AT ONE CALL SITE. Replace the single LastTransitionKey slot with a bounded per-episode emitted-key SET on TargetRecord (`EmittedTransitionKeys []string`, cap ~32, drop-oldest, cleared wherever ActiveEpisodeID is cleared). `emit` checks membership instead of equality. Strictly stronger than today and swallows nothing legitimate: REPAIR transitions carry repairAttempt in the key so genuine retries stay distinct, and re-emitting an identical (episode, phase, outcome, reason, control, attempt) tuple is a duplicate by §9.7's own definition. Additionally give containOnStateCorruption the same `fresh` guard openEpisode has, so it cannot emit a second DETECT into an already-open episode.

D. MAKE THE MANAGED→UNMANAGED TRANSITION AUDIBLE. In serverIntentRelay.Accept, when a key present in the previous set is absent from the new one, log at INFO with the count ("N runtime-integrity control targets are no longer scoped by the server; they revert to unmanaged"). No event, no episode — a revocation is not tamper — but the operator must be able to see why reconciliation stopped. This is what makes "it stopped, unexplained" impossible next time.

WHY NOT the alternatives: adding a CONTAINMENT_UNSUPPORTED reason to PolicyTamperReasons is a locked-vocabulary change requiring the Go tuple, the TS contract, the cross-language fixture corpus, Backend severity/grouping copy and Frontend copy (tamper.go:61-63 says so) — all to describe something that is not an event. Rate-limiting the emitter would hide the loop rather than remove it, and would equally suppress a real repeated attack.

### Changes

**Installers** - `internal/daemon/ai_integrity_subsystem.go`

In integrityControllerOptions() (~:314-330) add `Containment: s.integrityContainment()`. Add `func (s *Server) integrityContainment() *airuntimeintegrity.ContainmentCoordinator` returning a coordinator with a nil Provider on every platform where none can be honestly constructed, with a comment naming exactly what would have to exist to make it non-nil (a WFPEngine, or an ExternalEgressAuthority). A nil Provider must remain a legal, honest UNSUPPORTED — do not fabricate one.

**Installers** - `internal/airuntimeintegrity/controller.go`

recordContainment (:753-796): split the switch. For ContainmentUnsupported, persist Containment/State and RETURN WITHOUT EMITTING. For ContainmentFailed and the default branch, keep emitting but DELETE the two `tamperReason = "CONTAINMENT_FAILED"` assignments (:761, :765) so Reason stays nonEmptyReason(reason), with the containment failure carried in the existing Response: shortSlug(st.ReasonSlug). emit (:802-830): change the `rec.LastTransitionKey == key` check to membership in the new bounded key set; append on success. containOnStateCorruption (:379-406): capture `fresh := rec.ActiveEpisodeID == ""` from the MutateTarget and skip the DETECT emit when !fresh, mirroring openEpisode (:707-736). Clear the key set everywhere ActiveEpisodeID is cleared (:636-646, :860-865).

**Installers** - `internal/airuntimeintegrity/state.go`

TargetRecord: add `EmittedTransitionKeys []string` with json omitempty, bounded to ~32 entries (drop-oldest). Add it to targetsEqual (:377-389) via the existing stringsEqual helper so a no-op sweep still does not fsync. Keep LastTransitionKey for one release so an in-place upgrade reading an older state.json degrades to current behaviour rather than re-emitting a burst.

**Installers** - `internal/daemon/ai_integrity_intents.go`

Accept (:108-140): before swapping `r.byKey = next`, diff old-vs-new keys and log at INFO the count of targets that left the set, naming the consequence ("revert to unmanaged; reconciliation stops for them"). Do not emit an event and do not open an episode — a revocation is an administrative act, not tamper.

### Tests (each carries a defeat step)

- GO UNIT — no-provider containment emits ZERO transitions. Drive Controller.Sweep with an unsupported-dialect target and `Containment: &ContainmentCoordinator{}` (nil Provider, exactly production). Assert the sink received the DETECT transition and NOTHING with Phase=CONTAIN, and that the target record carries Containment=UNSUPPORTED and State=FAILED. DEFEAT STEP: swap in `&ContainmentCoordinator{Provider: &fakeContainment{}}` whose Activate returns ContainmentFailed — the test must now see exactly one CONTAIN/FAILED transition. If both variants produce the same transition count, the branch is not being taken and the test is vacuous.
- GO UNIT — the real finding survives a genuine containment failure. With a fake provider returning ContainmentFailed, drive the unsupported-dialect path and assert the emitted CONTAIN transition has Reason=="UNSUPPORTED_RUNTIME_VERSION" (NOT "CONTAINMENT_FAILED") and Response==the provider's slug. DEFEAT STEP: revert the two deleted assignments in recordContainment; the Reason assertion must fail. A test asserting only Response is vacuous — it passes with the overwrite still in place.
- GO UNIT — the storm cannot recur. Run 20 consecutive Sweeps against a store latched into recovery (so containOnStateCorruption runs every sweep) and assert total transitions == 2 (one DETECT, one CONTAIN) not 40. DEFEAT STEP: revert ONLY the emitted-key-set change and keep the fresh-guard — count must be ~21; revert ONLY the fresh-guard and keep the set — count must be 2; revert both — count must be 40. Any variant yielding 2 with a revert applied means the loop is not being exercised (check RecoveryRequired actually latches in the fixture).
- GO UNIT — the key set does not swallow legitimate repairs. Drive three repair attempts inside the budget window against a target whose Apply keeps failing; assert three distinct REPAIR transitions with repairAttempt 1,2,3 are all emitted. DEFEAT STEP: remove `attempt` from transitionKey (:967-975) — the test must collapse to one transition. Without this test the dedupe fix silently deletes the retry audit trail.
- GO UNIT — unmanaged→managed→unmanaged is silent for events and audible in the log. Sweep with an empty relay (assert zero transitions), Accept an intent naming the target (assert transitions appear), Accept an empty non-nil list (assert transitions stop AND the new INFO log fired). DEFEAT STEP: pass nil instead of &[] for the third step — the relay must KEEP the intent and transitions must continue, proving the test distinguishes the contract's null-vs-[] rule rather than merely observing silence.
- LIVE — after deploying the agent, query prod: SELECT date_trunc('minute',event_time), count(*) FROM ai_events WHERE event_type='AGENT_CONTROL_TAMPER' AND endpoint_id=<ENDPOINT_ID> GROUP BY 1 ORDER BY 1 DESC LIMIT 60. Expect no minute with a sustained 2/min cadence. DEFEAT STEP: this is only meaningful if the endpoint is actually MANAGED at the time — first confirm the heartbeat response carries a runtimeIntegrityIntents entry for one of its control targets, otherwise a silent unmanaged endpoint reads identical to a fixed one, which is precisely the failure this cluster is about.

### Risks

AGENT-ONLY — no contract, no Backend, no deploy-order constraint; a new agent works against the currently-deployed Backend unchanged, and an old agent keeps behaving as today.

The real risk is INFORMATION LOSS if change B is misread. Suppressing the UNSUPPORTED transition removes the only EVENT that currently says containment is unavailable. That is acceptable strictly because the same fact continues to ride every heartbeat in PolicyIntegrityReport.Containment — but the Backend must actually surface it. Verify before shipping that endpoint_control_state carries the containment value and that some console surface renders it; if not, this trades 138 useless alerts for zero signal, which is worse. If that check fails, land B in the same PR as the console posture field — NOT behind a flag, as a completed pair.

The state.json addition is additive and omitempty, so an older agent reading a newer file ignores it and an in-place downgrade degrades to current single-slot behaviour (a brief re-emit burst, bounded by the episode).

Operator-visible consequence: this endpoint stops reporting FAILED integrity caused by a capability it never had. Anyone reading that as "integrity got better" is wrong and the release note must say so — nothing was fixed on the endpoint, we stopped mislabelling a gap as a failure. Containment genuinely IS unavailable; wiring a real provider is separate, larger work.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- MECHANISM (3) IS REFUTED AT SOURCE. The spec's flagship repeat loop — containOnStateCorruption emitting DETECT then CONTAIN, 'two distinct keys alternate in the one slot' — cannot happen. containOnStateCorruption (C:/cwt/Installers/internal/airuntimeintegrity/controller.go:379-406) uses ControlTargetKey("state-corrupt"); recordContainment stamps TargetHash: string(rec.Key) (controller.go:786) = the literal "state-corrupt"; NormalizePolicyTamperEvidence rejects any TargetHash that is not a bare sha-256 (tamper.go:243-266, `if !controls.IsBareSha256(*f.src) { return nil }`, regex at internal/controls/policy_integrity.go:162). NewTransition therefore returns ok=false and emit() (controller.go:806-809) appends 'transition-rejected:CONTAIN/FAILED' and emits NOTHING. That path can emit at most ONE transition (the DETECT, which sets no TargetHash), which the single-slot dedupe then suppresses forever. It also cannot be the source of a 100%-CONTAINMENT_FAILED stream, because its only emittable transition carries reason POLICY_STATE_CORRUPT.
- THE SECOND CANDIDATE LOOP IS ALSO REFUTED. The spec asserts the repeat is inherent to the single slot. On the reconcileTarget paths that DO produce CONTAINMENT_FAILED (controller.go:474-477 unsupported, :492-496 budget-exhausted, :534-540 repair-failed, :585-589 canary), openEpisode does NOT clear LastTransitionKey on a re-entry — the clear at controller.go:714 sits inside `if r.ActiveEpisodeID == ""`, and openEpisode returns early at :731-735 when !fresh. So sweep N+1 re-derives the SAME CONTAIN key (same episodeId/phase/outcome/reason/control, no repairAttempt) and emit() suppresses it at :810. No source-proven loop in this file yields the measured 2-transitions-per-sweep at 100% CONTAINMENT_FAILED. The spec's 'the fix closes BOTH loops' is therefore closing one loop that cannot run and one that already self-suppresses — the actual driver (most plausibly a failing Store.MutateTarget in emit() at :823-827, which silently drops the key persist and makes EVERY transition re-emit, or multiple distinct target keys) is unidentified and untested for.
- THE FLAGSHIP TEST IS WRONG AS WRITTEN. 'Run 20 consecutive Sweeps against a store latched into recovery and assert total transitions == 2 (one DETECT, one CONTAIN)' cannot pass on any build: the CONTAIN is validator-rejected before the fix and suppressed after it. Its defeat-step expectations (40 / ~21 / 2) are all unreachable, so the test would be debugged into vacuity rather than proving the fix.
- CHANGE B REMOVES THE ONLY EVENT-SIDE SIGNAL FOR A REAL CONTAINMENT GAP AND THE STATED MITIGATION IS UNVERIFIED. The heartbeat does carry it (ai_integrity_subsystem.go:446 `Containment: containment`, folded pessimistically by aggregateIntegrityState at :573-612), but the spec itself concedes it did not verify any console surface renders endpoint containment. Landing B without that check trades 138 alerts for zero signal — an honesty regression, not a fix.
- EVIDENCE ARITHMETIC DOES NOT RECONCILE. The spec cites devoid.log 'revision=1 at 18:04:48+03:00' and 'revision=2 at 18:54:31' against a storm window FINDINGS.md:60-61 records in UTC (16:20:49Z-16:56:52Z). 18:04:48+03:00 is 15:04:48Z, not the 16:04:48Z FINDINGS uses; the 16-minute gap only holds if both are read as local (implying +02:00). The offset must be re-derived before the log line is cited as proof of the intent-relay narrative.
- THE INTENT-RELAY EXPLANATION IS INCOMPATIBLE WITH THE SPEC'S OWN PRIMARY LOOP. Sweep runs the recovery branch and RETURNS at controller.go:340-348, before any Instances/Providers/intent work. If the driver were containOnStateCorruption the relay could not gate it at all, so 'start/stop = intent relay' and 'repeat = state-corruption flip-flop' cannot both be true. Only the reconcileTarget family is intent-gated (:426-436).

**Corrected root cause**: CONFIRMED, unchanged: (a) no containment provider is ever wired — integrityControllerOptions (Installers/internal/daemon/ai_integrity_subsystem.go:314-330) sets Budget/EndpointScopeHash/Providers/Instances/Intents/Canaries/Authority and never Containment; every ContainmentCoordinator literal in the repo is in a _test.go (containment_test.go:256,276,313; controller_test.go:238,499,631; state_test.go:107); Engage returns unsupported("no-provider") on the nil receiver (containment.go:176-179). (b) recordContainment fuses UNSUPPORTED with FAILED and discards the caller's real finding — controller.go:759-766 overwrites tamperReason with "CONTAINMENT_FAILED" for both, and :773-776 forces StateFailed, which aggregateIntegrityState rolls up to endpoint integrity=failed.

REVISED, and this is the part the spec gets wrong: the emitted-cadence mechanism is NOT established. The single LastTransitionKey slot is a real weakness, but on every path that can actually produce a CONTAINMENT_FAILED row it currently SUPPRESSES the repeat rather than causing it (openEpisode's clear is inside the fresh branch at :711-715 and it early-returns at :731-735 when !fresh; the CONTAIN key is byte-identical sweep to sweep). The one source-proven way to get a per-sweep repeat of an identical key is emit()'s key persist failing: emit calls Store.MutateTarget at :823-827 and, on error, leaves rec/LastTransitionKey unchanged with NO res.Errors entry — a silently non-persisting state.json (the endpoint's is under the SYSTEM profile and was unreadable in this engagement) reproduces exactly the observed monotonous 100%-CONTAINMENT_FAILED stream at ~1-2/sweep. The competing candidate is multiple distinct control-target keys each contributing one CONTAIN. Both are discriminated by the same one query the spec already names, PLUS `metadata->>'targetHash'` and `metadata->>'episodeId'` in the GROUP BY: distinct targetHashes prove multi-target; one targetHash with one episodeId repeating proves the persist-failure path.


**Corrected approach**: Keep A, B and D as specified. Rewrite C, and add a fifth change.

C (rewritten): the bounded EmittedTransitionKeys set is still the right primitive and should land — but it is a HARDENING, not the cure, and must not be sold as the thing that stops the storm. Add the fresh-guard to containOnStateCorruption only as tidiness (it is currently harmless because its second transition is validator-rejected).

C2 (NEW, the actual mechanism fix): make emit() fail loudly when it cannot remember what it emitted. At controller.go:823-827, when Store.MutateTarget returns err, append res.Errors 'transition-key-persist:'+boundedReason(err) — today the error is discarded, which is precisely how an endpoint can re-emit the same transition every 60s with nothing anywhere saying why. Do the same for the 'transition-rejected' path at :806-809: it already records into res.Errors but nothing logs res.Errors at WARN, so a permanently-rejected transition (see C3) is invisible.

C3 (NEW, a defect this cluster surfaced and nobody owns): containOnStateCorruption and RecordWatcherOverflow mint synthetic ControlTargetKeys ('state-corrupt', 'watcher-overflow') and recordContainment stamps them into TargetHash, which the §9.7 normalizer rejects outright. Every CONTAIN transition for a corrupt store is silently dropped today. Either stop setting TargetHash when rec.Key is not a bare sha-256, or hash the synthetic key with the same domain separator the providers use (providers/claude/provider.go:274 NewControlTargetKey). Without this, a genuinely corrupt state.json produces one DETECT and then eternal silence.

TESTS: replace the '20 sweeps == 2 transitions' test with two honest ones. (i) GO UNIT — a synthetic-key CONTAIN is currently DROPPED: assert res.Errors contains 'transition-rejected:CONTAIN/FAILED' on today's code and that after C3 the transition is accepted. DEFEAT STEP: set TargetHash to a real 64-hex value in the fixture — the rejection must disappear, proving the assertion keys on the hash rule and not on the phase. (ii) GO UNIT — a non-persisting store re-emits forever: inject a Store whose MutateTarget errors, run 20 sweeps on an unsupported-dialect target, assert 20 identical CONTAIN transitions today and, after C2, 20 res.Errors entries naming the persist failure. DEFEAT STEP: make MutateTarget succeed — the count must drop to 1, proving the loop is the persist path and not the dedupe comparison.

Before any of this is called 'the storm explained', run the GROUP BY the spec names, extended with targetHash and episodeId. Do not let the wave record F1 as root-caused on the strength of the state-corruption story.


**Missing changes the reviewer found**:

- **Installers** `internal/airuntimeintegrity/controller.go` - emit() :823-827 — record the key-persist failure into res.Errors instead of discarding `err`; today a store that cannot persist LastTransitionKey produces an unbounded re-emit with zero diagnostics anywhere. Same function :806-809 — ensure the existing 'transition-rejected' error actually reaches a WARN log, not just SweepResult.
- **Installers** `internal/airuntimeintegrity/controller.go` - containOnStateCorruption :379-406 and RecordWatcherOverflow (~:830-870) — the synthetic ControlTargetKeys 'state-corrupt' / 'watcher-overflow' flow into recordContainment's `TargetHash: string(rec.Key)` (:786) and are rejected by IsBareSha256 (tamper.go:262), so the CONTAIN transition for a corrupt store is silently dropped on every build. Either omit TargetHash for synthetic keys or hash them.
- **Installers** `internal/daemon/ai_integrity_subsystem.go` - The sweep loop that calls Controller.Sweep must log SweepResult.Errors at WARN. res.Errors is currently the only record that a transition was rejected or a key failed to persist and nothing surfaces it.

**Collateral risk**: Low for the agent-local changes; nothing here touches command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation/anti-rollback, the package gate, or MCP discovery. Two real hazards. (1) Change B silences the only tamper EVENT that says containment is unavailable while the endpoint keeps reporting integrity=failed on the heartbeat (ai_integrity_subsystem.go:446); if no console surface renders endpoint_control_state.containment, this converts a loud-but-useless signal into no signal — verify the render before merging, as the spec says, and treat that verification as a gate rather than a note. (2) The EmittedTransitionKeys set is a suppression primitive on the evidence channel; capping at 32 with drop-oldest means a long episode with >32 distinct transitions can re-emit an aged-out key. Bound it per-episode (cleared with ActiveEpisodeID at controller.go:641, :714, :864) rather than globally, and keep the REPAIR-attempt test the spec already specifies.

**Effort correction**: M is credible for the spec as written (four files, five Go suites). With C2+C3 added and the cadence query run first, M-to-L. Do not schedule the live cadence check as part of M — it depends on the endpoint being MANAGED at the time, which the spec itself flags.


---

## F33 - The console has a finished tamper-episode renderer bound to a field the Backend never sends

- **Severity**: HIGH
- **Side**: multi   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

NOT a copy problem, and not merely "the aggregate cost of F1+F3+F5". The console is READY and the server never speaks. Four concrete gaps.

(1) THE PROJECTION DOES NOT EXIST. The Frontend declares `tamper?: AiPolicyTamperTransition | null` on AiDetectionRow (Frontend/types/ai-governance.ts:1219, type at :4070-4090) and ships a complete renderer — TamperTimeline (detections-content.tsx:834-880) and TamperTransitionLine (:765-831) — printing phase→outcome, reason, control, repair attempt and episode id, and even flagging a phase/outcome pair outside the §9.7 matrix as "Contradictory transition". The Backend has NO such field: AiDetectionRowDto (Backend/src/ai-governance/dto/ai-response.dto.ts:1566-1587) extends AiActivityItemDto and adds only triage/groupKey/repeatCount/memberEventIds, and toActivityItem (ai-query.service.ts:3272-3322) projects no tamper block. `grep -rn "tamper" src/ai-governance/services/ai-query.service.ts` returns NOTHING. row.tamper is undefined in production, TamperTimeline returns null at its first line (:842), and the pane collapses to boilerplate.

(2) THE SHARED CONTRACT IS UNUSED SERVER-SIDE. Backend/packages/shared-contracts/src/policy-tamper-evidence-contract.ts contains the full TS half — POLICY_TAMPER_PHASES/OUTCOMES/REASONS, the phase→outcome matrix (:138), normalizePolicyTamperEvidence (:298), policyTamperDedupeKey (:244) — and NOTHING under Backend/src imports it. The only Backend code reading the tamper block is the alert outbox (readTamperBlock, alert-outbox-enqueue.ts:107-120), and it reads raw `unknown` fields for a dedupe key. The Go comment "Ingestion validates it, then flattens the approved scalars" (Installers/internal/airuntimeintegrity/tamper.go:147-148) is FALSE for the ingest half: endpoint-evidence-ingest.service.ts copies metadata through projectEndpointEvidenceMetadata with no tamper-specific validation.

(3) THE OUTCOME MAPPER IGNORES THE ONE OUTCOME THE BACKEND ALREADY DERIVES. deriveEventOutcome (ai-event-outcome.util.ts:392-393) DOES answer for this type: summaryKey:'agent-control-tamper', actual:'flagged', certification:'self-evident'. It rides the timeline DTO (ai-query.service.ts:1723) — but the Detections pane never looks at it. outcomeOf (Frontend detections-content.tsx:366-434) reads ONLY row.disposition, row.policyDecision and row.warned; a tamper event has all three null, so it falls off the end at :433 and whatHappened (:628-630) prints "no outcome fact was recorded" while the server holds a perfectly good one.

(4) EVERY EVENT IS ITS OWN ROW. DETECTION_GROUP_KEY_SQL (ai-query.service.ts:301-305) groups on severity_basis->>'class', which is NULL for tamper (no governing finding — see F34), so the key degrades to `e:<id>`. 138 tamper events = 138 separate rows, each individually empty. Grouping is why the surface reads as broken even before the copy does.

### Evidence (read at origin/main)

- `Frontend/types/ai-governance.ts:1219 — `tamper?: AiPolicyTamperTransition | null` on AiDetectionRow`
- `Frontend/types/ai-governance.ts:4070-4090 — AiPolicyTamperTransition: episodeId/phase/outcome/reason/control/runtimeInstanceId/hashes/revisions/actorSource/actorAssurance/repairAttempt`
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:765-831 — TamperTransitionLine, including the §9.7 impossible-pair guard`
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:834-843 — TamperTimeline: `const tamper = row.tamper ?? null; if (!tamper) return null``
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:366-434 — outcomeOf reads only disposition/policyDecision/warned; returns null at :433`
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:612-631 — whatHappened; :618 "no finding class was recorded", :629 "no outcome fact was recorded"`
- `Backend/src/ai-governance/dto/ai-response.dto.ts:1566-1587 — AiDetectionRowDto has no tamper field`
- `Backend/src/ai-governance/services/ai-query.service.ts:3272-3322 — toActivityItem projects no tamper block`
- `Backend/src/ai-governance/services/ai-query.service.ts:301-305 — DETECTION_GROUP_KEY_SQL degrades to e:<id> when severity_basis->>'class' is null`
- `Backend/src/ai-governance/services/ai-event-outcome.util.ts:392-393 — the tamper outcome fact the Detections pane never reads`
- `Backend/packages/shared-contracts/src/policy-tamper-evidence-contract.ts:138,161-181,244,298 — matrix, typed block, dedupe key, normalizer; imported by nothing under Backend/src`
- `Backend/src/notifications/outbox/alert-outbox-enqueue.ts:107-120,160-182 — readTamperBlock proves the flattened keys sit at top level in metadata; buildAiAlertTransitionKey is the existing episode-tuple dedupe`

### Fix

PROJECT WHAT WE ALREADY HAVE, THROUGH THE CONTRACT WE ALREADY WROTE. The console needs no new copy and almost no new code — it needs the field.

A. BACKEND: project the tamper block. In toActivityItem, when deriveActivityKind(e)==='tamper', build `tamper` by feeding the FLATTENED metadata keys (episodeId/phase/outcome/reason/control/targetHash/expected+observedProjectionHash/issued+appliedRevision/response/actorSource/actorAssurance/repairAttempt — exactly what integrityMetadata writes at Installers/internal/daemon/ai_integrity_subsystem.go:73-110) through normalizePolicyTamperEvidence from the shared contract. A block that does not normalize projects null, which the Frontend already renders as "a legacy tamper row whose transition is unknown" — the honest answer, copy already written. Add `tamper` to AiActivityItemDto so the timeline gets it too.

B. BACKEND: give the pane the outcome fact it is missing. deriveEventOutcome already answers for AGENT_CONTROL_TAMPER; project `outcome` onto AiActivityItemDto the way the timeline already does (ai-query.service.ts:1723). Then extend the Frontend outcomeOf with ONE branch placed AFTER every disposition/decision branch so it can never override a real one: if row.outcome?.summaryKey==='agent-control-tamper' AND a readable row.tamper exists, derive the label from the tamper OUTCOME — Blocked (ATTEMPT/BLOCKED), Contained, Repair failed, Restored, Open (UNRESOLVED). If there is no readable block, KEEP returning null and keep printing "not recorded": that is a true statement about a row that really carries nothing and must not be papered over.

C. BACKEND: group the episode. Extend DETECTION_GROUP_KEY_SQL with a tamper branch ABOVE the class branch: when event_type='AGENT_CONTROL_TAMPER' and metadata->>'episodeId' is present, key on `'t:' || episodeId || '|' || COALESCE(metadata->>'phase','') || '|' || COALESCE(metadata->>'outcome','')`. That is byte-for-byte the §9.7 transition tuple the alert lane already dedupes on (alert-outbox-enqueue.ts:160-182) and that policyTamperDedupeKey defines in the contract — ONE definition, three readers. 138 rows become one row with repeatCount 138, expandable via the existing ?groupKey= path. Rows with no episodeId keep e:<id> and are never guessed together.

D. FRONTEND: one clause in whatHappened. When the row has a tamper block, replace the bare "no finding class was recorded" with the control and reason it actually carries ("control claude managed settings · managed config modified"), reusing the humanization TamperTransitionLine already uses at :814-822. With no block, the existing honest sentence stands unchanged.

THIS ALSO RETRO-FIXES HISTORY. metadata is stored and the projection is derived on READ, so the 138 existing rows become informative and grouped the moment the Backend deploys — without touching a hash-covered column or rewriting a single stored event.

Rejected: writing new console copy for the empty state (the emptiness is the defect, not the wording); having the Frontend parse row.metadata directly (it is already sent, but that would be an eleventh independent derivation of a server-owned fact and would bypass the contract normalizer that rejects an impossible phase/outcome pair — exactly the validation the console's "Contradictory transition" warning depends on).

### Changes

**Backend** - `src/ai-governance/services/ai-query.service.ts`

Import normalizePolicyTamperEvidence from @ceragon/shared-contracts (add a worktree-local runtime mirror if the vendored dist does not export it yet — same pattern as ai-source-surface.ts). In toActivityItem (~:3272-3322) add `tamper: this.projectTamperTransition(e)` and `outcome: deriveEventOutcome(e)`. Add private helper projectTamperTransition(e: AiEvent) returning null unless deriveActivityKind(e)==='tamper', otherwise normalizing the flattened metadata keys. Extend DETECTION_GROUP_KEY_SQL (:301-305) with the tamper episode branch ABOVE the existing class branch.

**Backend** - `src/ai-governance/dto/ai-response.dto.ts`

Add `tamper: AiPolicyTamperTransitionDto | null` and `outcome: AiEventOutcomeDto | null` to AiActivityItemDto (~:1374), inherited by AiDetectionRowDto (:1566). Declare AiPolicyTamperTransitionDto field-for-field identical to the Frontend's AiPolicyTamperTransition (Frontend/types/ai-governance.ts:4070-4090), all fields optional/nullable so a legacy row projects null rather than a partial object.

**Backend** - `packages/shared-contracts/src/policy-tamper-evidence-contract.ts`

Add the READ-SIDE projection type (the nullable-field transition the console consumes) beside the existing strict PolicyTamperEvidence, and export projectPolicyTamperTransition(metadata: Record<string,unknown>) which runs the flattened bag through normalizePolicyTamperEvidence. This is the one place the flat→typed adaptation may live, and F34 consumes the same helper. MIRROR SCOPE: this file exists ONLY in Backend/packages/shared-contracts/src/ — I listed both other copies (Ceragon/packages/shared-contracts/src/ and Ceragon-Intelligence/packages/shared-contracts/src/) and neither carries ai-governance-contract.ts or policy-tamper-evidence-contract.ts. No three-way mirror sync is required.

**Frontend** - `app/ai-control-plane/detections/detections-content.tsx`

outcomeOf (:366-434): add a tamper branch immediately before the final `return null` at :433, keyed on row.outcome?.summaryKey==='agent-control-tamper' AND a readable row.tamper, mapping the §9.7 outcome to a label+tone. It must be LAST so no disposition or decision can be overridden. whatHappened (:612-631): when row.tamper is present, emit control+reason instead of the "no finding class" clause, reusing the :814-822 humanization. Leave both honest-absence strings intact for rows that genuinely carry nothing.

**Frontend** - `types/ai-governance.ts`

Add `outcome?: AiEventOutcomeFact | null` to AiActivityItem so the new Backend field is typed. AiDetectionRow already declares tamper (:1219) — no change needed there, which is the whole point of this finding.

### Tests (each carries a defeat step)

- BACKEND UNIT — projection round-trips a real transition. Feed toActivityItem an AiEvent whose metadata is the EXACT map integrityMetadata produces (copy the key list from Installers/internal/daemon/ai_integrity_subsystem.go:73-110) and assert every field of the resulting `tamper` matches. DEFEAT STEP: change one key's case (`Phase` instead of `phase`) — the projection must return null, not a partial object. A test asserting only non-null passes over a projection that dropped four fields.
- BACKEND UNIT — an impossible pair is refused, not laundered. Project a block with phase=DETECT and outcome=RESTORED (outside the matrix at policy-tamper-evidence-contract.ts:138). Assert tamper is null. DEFEAT STEP: bypass normalizePolicyTamperEvidence and copy the fields directly — the assertion must fail. Without this the console's "Contradictory transition" guard has nothing to guard.
- BACKEND LIVE-PG — grouping collapses a storm. Insert 40 AGENT_CONTROL_TAMPER rows sharing one episodeId/phase/outcome plus 3 with a different phase, query detections, assert 2 rows with repeatCount 40 and 3. DEFEAT STEP: null out metadata->>'episodeId' on half the rows — those must split back to individual e:<id> rows, proving the branch keys on the episode and is not accidentally grouping by event_type. Also assert ?groupKey=t:... expands to the 40 members, or the grouping hides data.
- FRONTEND JSDOM — the pane stops being empty. Render the detail pane for a row carrying a CONTAIN/FAILED tamper block; assert the text contains the control and the reason and does NOT contain "no finding class was recorded" or "no outcome fact was recorded". DEFEAT STEP: set row.tamper=null on the same fixture — BOTH honest-absence strings must come back. The existing assertions at Frontend/app/ai-control-plane/__tests__/detections-truth-console.test.tsx:470-471 must be kept and re-pointed at the no-block fixture, not deleted.
- FRONTEND JSDOM — the tamper branch cannot override a real outcome. Render a row with BOTH a tamper block and disposition='BLOCKED_BEFORE_EGRESS'; assert the pill reads "Blocked". DEFEAT STEP: move the new branch above the disposition checks — the assertion must fail. This is the guard against the fix quietly relabelling real enforcement.
- LIVE — after Backend deploy, GET /api/v1/ai/detections?eventTypes=AGENT_CONTROL_TAMPER for org `<ORG_ID>` and assert rows carry a non-null tamper and repeatCount > 1. DEFEAT STEP: confirm at least one returned row's stored metadata actually contains an episodeId first — if the historical rows lack it, the projection is correctly null and the live check proves nothing about the new code.

### Risks

BACKEND FIRST, then Frontend — both halves independently safe. A new Backend sending `tamper` to an old console is ignored (unknown JSON field). A new console reading row.tamper===undefined from an old Backend renders exactly today's behaviour (TamperTimeline already returns null; the new outcomeOf branch is gated on the field). No agent change, so old and new agents are equally covered.

The grouping change alters the pagination denominator for tenants with tamper rows: `total` counts groups, so a tenant showing 138 detections may show ~3 after deploy. That is the correct number and must be called out in the release note, or it reads as data loss. Member ids remain reachable via ?groupKey=, and the underlying events are untouched — the hash chain is never rewritten.

The one genuine hazard is scope creep into dishonesty: the tamper branch in outcomeOf must NEVER produce a label for a row with no readable block. If an implementer "helpfully" defaults to "Flagged", we convert a true "not recorded" into a fabricated outcome — the exact failure this programme exists to stop. The FRONTEND JSDOM defeat step is what catches that; do not let it be dropped.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE PROJECTION AS SPECIFIED RETURNS NULL FOR THE MOST INFORMATIVE ROWS. The fix says to feed 'the FLATTENED metadata keys ... through normalizePolicyTamperEvidence'. The Go producer writes every metadata value as a STRING, including `md["repairAttempt"] = strconv.Itoa(*e.RepairAttempt)` (Installers/internal/daemon/ai_integrity_subsystem.go:104-106). normalizePolicyTamperEvidence rebuilds field-by-field against PolicyTamperEvidence, whose repairAttempt is `number` (Backend/packages/shared-contracts/src/policy-tamper-evidence-contract.ts:186), and the normalizer fails CLOSED on a type mismatch (:290-296 'returns null ... on an out-of-range repair attempt'). Every REPAIR transition — the rows that carry attempt 1,2,3 and are the whole point of the timeline — would project null. The spec needs an explicit flat→typed coercion layer (string decimal → number), not a straight pass-through.
- SECOND NULLING PATH, SAME CAUSE. normalizePolicyTamperEvidence requires `isIntegrityUuid(src.episodeId)` (:320) and a bare-sha256 targetHash. The state-corruption path stamps TargetHash='state-corrupt' (controller.go:786 with ControlTargetKey("state-corrupt") at :380), and the server-authored went-dark row carries `darkEpisodeId`, not `episodeId` (ai-agent-liveness.service.ts:~336-340). Both project null under the spec's rule. That may be the honest answer, but the spec presents 'a block that does not normalize projects null' as a rare legacy case when it is in fact the common case for two named producers — the release note and the test matrix must say so.
- THE FIX PROSE AND THE DTO CHANGE DISAGREE ON THE FIELD LIST. The fix says to feed targetHash and response into the projection; the changes entry says to declare AiPolicyTamperTransitionDto 'field-for-field identical to the Frontend's AiPolicyTamperTransition (Frontend/types/ai-governance.ts:4070-4090)', and that interface has NO targetHash and NO response (verified: episodeId/phase/outcome/reason/control/runtimeInstanceId/expected+observedProjectionHash/issued+appliedRevision/actorSource/actorAssurance/repairAttempt). Pick one; if targetHash/response are wanted the Frontend type is the file that must change too.
- F33 IS NOT INDEPENDENT OF F34 AND THE SPEC SAYS IT IS. buildDetectionsQuery admits a row only when `e.severity IS NOT NULL OR warned OR non-allow policy_decision OR non-empty data_classes OR RELEASED_ONCE` (Backend/src/ai-governance/services/ai-query.service.ts:3664-3672). A tamper row satisfies exactly one of those — the stored severity that F34 proposes to stop writing. If F34 ships as specified, the rows this whole finding renders drop out of the Detections surface entirely and the projection has nothing to project. Sequence and test them together, or F33 deploys into an empty page.
- CITATION DRIFT (minor, but the implementer will open the wrong lines). TamperTimeline is at Frontend/app/ai-control-plane/detections/detections-content.tsx:840-887 (not 834-880) and its `if (!tamper) return null` is at :848 (not :842); whatHappened is :593-631 (not :612-631) with the honest-absence strings at :618 and :628; the FE regression assertions are at app/ai-control-plane/__tests__/detections-truth-console.test.tsx:469-470 (not 470-471). AiDetectionRowDto is an intersection type alias at src/ai-governance/dto/ai-response.dto.ts:1566, not a class that 'extends' AiActivityItemDto (interface at :1374).

**Corrected root cause**: Verified and CONFIRMED as stated, with the four gaps intact: (1) the Frontend declares `tamper?: AiPolicyTamperTransition | null` (Frontend/types/ai-governance.ts:1219, type at :4070-4090) and ships the full renderer (detections-content.tsx:766-838 TamperTransitionLine, :840-887 TamperTimeline) while toActivityItem (Backend/src/ai-governance/services/ai-query.service.ts:3238-3322) projects no tamper block — `grep -n tamper` over that file returns nothing, confirmed. (2) Nothing under Backend/src imports policy-tamper-evidence-contract.ts; the only importer in the repo is the fixture spec src/ai-governance/runtime-integrity-contract.fixtures.spec.ts:59-61 — confirmed. (3) deriveEventOutcome answers for AGENT_CONTROL_TAMPER (ai-event-outcome.util.ts:391-392) and rides the timeline at ai-query.service.ts:1723 but not the activity/detection projection; outcomeOf (detections-content.tsx:366-434) reads only atRest/disposition/policyDecision/warned and returns null at :433. (4) DETECTION_GROUP_KEY_SQL (:301-305) keys on severity_basis->>'class', which is null on a tamper row, so every event is its own e:<id> group. MIRROR SCOPE ALSO CONFIRMED: I listed both other shared-contracts copies — `<WORKSPACE>/packages/shared-contracts/src/` and the Ceragon-Intelligence worktree copy — and neither contains policy-tamper-evidence-contract.ts or ai-governance-contract.ts. One mirror, not three.


**Corrected approach**: Keep A-D. Three corrections.

A (corrected): do NOT pass the raw flat bag to normalizePolicyTamperEvidence. Put projectPolicyTamperTransition(metadata) in the contract file as the spec says, but have it (i) build a typed candidate from the named keys, coercing repairAttempt from its canonical decimal STRING to a number and rejecting anything that is not `^(0|[1-9][0-9]{0,2})$` within POLICY_TAMPER_REPAIR_ATTEMPT_MAX (:154), (ii) then run the candidate through normalizePolicyTamperEvidence for the enum/matrix/hash checks. Note the normalizer's real signature — normalizePolicyTamperEvidence(input, utf8ByteLength) (:298-301) — it needs a byte-length function; use the same one the fixture spec passes at runtime-integrity-contract.fixtures.spec.ts:311.

A2: for the SERVER-authored went-dark row, accept `darkEpisodeId` as the episodeId source in the projection exactly as the alert lane already does (alert-outbox-enqueue.ts:~168-176 `scalar(block.episodeId) ?? scalar(block.darkEpisodeId)`). One definition of 'which episode is this', three readers — the argument the spec already makes for grouping applies here too.

C (corrected): extend the same fallback into DETECTION_GROUP_KEY_SQL — `COALESCE(metadata->>'episodeId', metadata->>'darkEpisodeId')` — or a repeated liveness sweep against one dark endpoint stays 138 ungrouped rows, which is the same defect pointed at the server-authored producer.

Sequencing: land F34's detection-membership fix in the same Backend PR (see that review), or gate F33's deploy behind it. Add one test: BACKEND UNIT — a REPAIR row with metadata.repairAttempt='2' projects tamper.repairAttempt === 2. DEFEAT STEP: pass the string straight to normalizePolicyTamperEvidence — the assertion must fail with tamper === null, proving the coercion layer is load-bearing and not decoration.


**Missing changes the reviewer found**:

- **Backend** `packages/shared-contracts/src/policy-tamper-evidence-contract.ts` - projectPolicyTamperTransition must own the flat→typed COERCION, not just the adaptation: metadata values are all strings (Installers/internal/daemon/ai_integrity_subsystem.go:73-110), so repairAttempt arrives as '2' and must be parsed before normalizePolicyTamperEvidence (:298) can accept it. Also thread the required utf8ByteLength argument.
- **Backend** `src/ai-governance/services/ai-query.service.ts` - DETECTION_GROUP_KEY_SQL (:301-305) — use COALESCE(metadata->>'episodeId', metadata->>'darkEpisodeId') so the SERVER-authored went-dark rows (ai-agent-liveness.service.ts:~336, which write darkEpisodeId only) group too, matching buildAiAlertTransitionKey's existing fallback.
- **Frontend** `types/ai-governance.ts` - If targetHash/response are to be projected (the fix prose says so, the changes list does not), AiPolicyTamperTransition (:4070-4090) must gain them — it currently has neither, so a DTO declared 'field-for-field identical' cannot carry them.

**Collateral risk**: Read-side only; nothing here can regress command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation, the package gate, or MCP discovery. Two things to watch. (1) The grouping change moves the pagination denominator: `total` counts DISTINCT groups (ai-query.service.ts:3872) so a tenant showing 138 detections shows ~3 — the spec calls this out and the release note must too, or it reads as data loss. (2) The spec's own warning is the real one: the new outcomeOf branch must never label a row with no readable block. The honest-absence strings at detections-content.tsx:618/:628 and the existing assertions at __tests__/detections-truth-console.test.tsx:469-470 must be re-pointed at a no-block fixture, never deleted.

**Effort correction**: M is credible for the Backend half plus the two Frontend clauses, but only after the coercion layer is written into the plan — 'run the flat bag through the normalizer' would have been a half-day of debugging null projections. M stands with the correction; M/L if the grouping change forces updates to the detections pagination/count specs.


---

## F34 - AGENT_CONTROL_TAMPER carries an unconditional HIGH type-base (and a second, independent static CRITICAL on the alert lane)

- **Severity**: MEDIUM
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

THE FRAMING IS WRONG IN A WAY THAT MATTERS. Severity is NOT "a static per-event-type constant": deriveAiEventSeverity (Backend/src/ai-governance/services/ai-event-severity.util.ts:239-382) is a real derivation over finding class, evidence tier, rule id, decision and disposition, computed server-side at WRITE time and stored with its basis (AiEventService.deriveSeverityColumns, ai-event.service.ts:1694-1720, called at :1623 and :1984). The console copy "from stored severityBasis, never recomputed" (Frontend detections-content.tsx:1282-1317) is a statement that the CLIENT does not re-derive — correct discipline, not the bug.

THE ACTUAL DEFECT IS ONE MAP ENTRY: SECURITY_SIGNIFICANT_EVENT_BASE = { AGENT_CONTROL_TAMPER: 'high', ... } (:70-74), applied at :293-296 as an unconditional base-or-floor whenever input.eventType matches, pushing adjustments 'event-type-base'. It fires with zero substantiating facts. A tamper row has no metadata.findings and no data_classes (the Go emitter writes neither — Installers/internal/daemon/ai_integrity_subsystem.go:73-110 emits only hashes, enums and slugs) and no policy_decision, so `governing` stays null, `base` becomes 'high' from the type alone, basis.class is null, and adjustments is exactly ['event-type-base'] — byte-for-byte the "WHY HIGH: base high · event-type-base" the owner screenshotted.

The file's own comment (:57-63) admits the reasoning was thin: "the bands are the honest reading of each type", justified by "Already an always-alert in fanOutAiAlert; high restates that", measured against a corpus of 5 tamper rows. At 138 self-inflicted rows the justification inverts.

AND THE FIX PATTERN IS ALREADY IN THIS FILE. POLICY_RESTRICTION_BLOCK_EVENT_TYPES (:43) with the 'policy-restriction-block-floor-skipped' adjustment (:354-359) does exactly this for WEB_NAV_BLOCKED, for exactly this reason: "the outcome floor stamped every one of these rows high, which is how the Detections surface filled with high-severity rows that carry no finding, no session and no action an analyst can take". Same defect, same file, one event type later.

SECOND, INDEPENDENT STATIC BAND — not in the writeup at all. deriveAlertSeverity(isWarnTier) (Backend/src/notifications/outbox/alert-outbox-enqueue.ts:98-100) returns CRITICAL for everything that is not a Web-Guard warn tier, and buildAiAlertOutboxRow (:199-227) admits every AGENT_CONTROL_TAMPER because it is in CONTROL_FAILURE_EVENT_TYPES (:32). So the console says HIGH and the customer's webhook/email says CRITICAL for the same containment-capability gap. Two static bands, neither reading the finding.

MATERIAL CONSTRAINT: severity is inside the event hash and is NEVER backfilled (:64-68; severityStatusOf at ai-query.service.ts:3335-3338 exists precisely to explain null bands honestly). The 138 stored HIGH rows stay HIGH forever. Any fix helps NEW rows only; the read side must be made informative (F33) rather than re-banded.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/ai-event-severity.util.ts:70-74 — SECURITY_SIGNIFICANT_EVENT_BASE.AGENT_CONTROL_TAMPER = 'high'`
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:260-261,293-296 — typeBase applied unconditionally, pushing 'event-type-base'`
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:43,354-359 — the WEB_NAV_BLOCKED precedent and its 'policy-restriction-block-floor-skipped' adjustment`
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:64-68 — severity is hash-covered and never backfilled`
- `Backend/src/ai-governance/services/ai-event-severity.util.ts:25 — AI_EVENT_SEVERITY_FORMULA_VERSION and the re-derivability discipline`
- `Backend/src/ai-governance/services/ai-event.service.ts:1694-1720 — deriveSeverityColumns; call sites :1623 and :1984`
- `Backend/src/notifications/outbox/alert-outbox-enqueue.ts:98-100 — deriveAlertSeverity: CRITICAL for every non-warn-tier alert`
- `Backend/src/notifications/outbox/alert-outbox-enqueue.ts:32,199-227 — every AGENT_CONTROL_TAMPER is admitted and banded CRITICAL`
- `Backend/src/ai-governance/services/ai-query.service.ts:3335-3338 — severityStatusOf: 'derived' | 'not-captured' | 'not-applicable'`
- `Installers/internal/airuntimeintegrity/episode.go:160-172 — criticalTransition(), the endpoint's own predicate for genuinely critical transitions`
- `Installers/internal/daemon/ai_integrity_subsystem.go:73-110 — integrityMetadata: no findings[], no dataClasses, no policyDecision`
- `Backend/src/ai-governance/services/ai-agent-liveness.service.ts:335 — the server-authored AGENT_WENT_DARK emit that legitimately has no phase/outcome/finding`
- `Frontend/app/ai-control-plane/detections/detections-content.tsx:1282-1317 — the "WHY HIGH ... never recomputed" copy (a client-side statement, not the bug)`

### Fix

BAND FROM THE §9.7 TRANSITION, WHICH THE ROW ALREADY CARRIES. Replace the unconditional entry with a substantiation-gated derivation following the shape this file already established for WEB_NAV_BLOCKED, and MIRROR THE ENDPOINT'S OWN PREDICATE so the two halves cannot disagree.

The rule, evaluated in order (the ordering IS the anti-downgrade guard the brief asks for):
 1. REASON-DRIVEN HIGH regardless of phase/outcome, for reasons that ARE a control loss on their own — the exact set criticalTransition uses at Installers/internal/airuntimeintegrity/episode.go:166-167 (POLICY_SIGNATURE_INVALID, POLICY_STATE_CORRUPT, AGENT_WENT_DARK, AUDIT_LOG_CLEARED, CLOCK_ROLLBACK) plus LOCAL_UNINSTALL_ATTEMPT and CONTROL_ACL_WIDENED. This branch protects AGENT_WENT_DARK, which is SERVER-authored by the liveness sweep (ai-agent-liveness.service.ts:335) and legitimately carries no phase, no outcome and no finding class. It must not be downgraded.
 2. OUTCOME-DRIVEN otherwise: CONTAINED or FAILED → high (a control was lost or could not be restored). ATTEMPT/BLOCKED → medium (we stopped it; nothing was lost). DETECT/REPAIR + UNRESOLVED → medium (episode open, in flight). RESOLVE/RESTORED → low (fixed; retained for audit).
 3. NO READABLE TYPED BLOCK AT ALL — no reason, no phase, no outcome → NO type base. The row then bands only from findings/decision, i.e. usually not at all, and deriveAiEventSeverity returns null. severityStatusOf already renders that as an explicit not-captured/not-applicable and the console already prints an explicit unknown rather than a dash. THIS IS THE F33 RULE ENFORCED AT THE WRITE SIDE: an event with no finding class and no outcome fact cannot render HIGH, and it renders as an honest unknown rather than as a low-severity nothing.
Record the driver in basis.adjustments — 'tamper-reason-critical', 'tamper-outcome-<outcome>', 'tamper-no-transition-no-base' — so the console's WHY line explains itself, and bump AI_EVENT_SEVERITY_FORMULA_VERSION to 3 so rows banded under v2 stay re-derivable from their own stored basis (:25 documents exactly this discipline).

SECOND HALF, non-optional: make the alert lane read the derived band. In buildAiAlertOutboxRow, use event.severity when the event carries one, falling back to deriveAlertSeverity(isWarnTier) only when null. Otherwise the console says MEDIUM while the webhook shouts CRITICAL about the same row — we would have fixed the surface the owner looked at and left the surface the customer's SOC sees.

Plumbing: deriveSeverityColumns already receives metadata, so the flattened tamper block is in hand — pass it as a new optional tamperTransition input on AiEventSeverityInput, normalized with the shared contract's helper (the same one F33 introduces; the two findings share it, which is the argument for landing them together).

Rejected: deleting the AGENT_CONTROL_TAMPER entry outright — that silently downgrades AGENT_WENT_DARK and every genuine control loss to null, precisely the mistake the brief warns against. Rejected: backfilling the 138 stored rows — severity is hash-covered; rewriting it would break the chain and would be exactly the dishonesty this codebase is built to prevent. The honest treatment of history is F33's grouping and projection.

### Changes

**Backend** - `src/ai-governance/services/ai-event-severity.util.ts`

Bump AI_EVENT_SEVERITY_FORMULA_VERSION to 3 (:25) with a v3 note. Remove AGENT_CONTROL_TAMPER from SECURITY_SIGNIFICANT_EVENT_BASE (:70-74) — INGRESS_REDACTED/INGRESS_MONITORED stay. Add TAMPER_CRITICAL_REASONS mirroring Installers/internal/airuntimeintegrity/episode.go:166-167 plus LOCAL_UNINSTALL_ATTEMPT and CONTROL_ACL_WIDENED, with a comment naming that file as the twin. Add `tamperTransition?: {reason,phase,outcome} | null` to AiEventSeverityInput (:166-194) and a tamperTypeBase(t) helper implementing the ordered rule; feed its result into the existing typeBase slot at :260-261 so all downstream raise/cap/floor logic is untouched. Push the new adjustment strings.

**Backend** - `src/ai-governance/services/ai-event.service.ts`

deriveSeverityColumns (:1694-1720): extract the tamper transition from args.metadata via the shared-contract helper (the one F33 adds) and pass it as tamperTransition to deriveAiEventSeverity. No change at the two call sites (:1623, :1984) — metadata is already threaded.

**Backend** - `src/notifications/outbox/alert-outbox-enqueue.ts`

buildAiAlertOutboxRow (~:204): replace `const severity = deriveAlertSeverity(isWarnTier)` with the stored event.severity (uppercased to the Severity enum) when non-null, else deriveAlertSeverity(isWarnTier). Keep the gating predicate (:199-212) exactly as is — WHETHER we alert is a separate question from HOW LOUD, and narrowing the gate here would suppress real control-loss alerts.

**Backend** - `packages/shared-contracts/src/policy-tamper-evidence-contract.ts`

No vocabulary change. Export the flat-metadata→typed-transition helper that both this finding and F33 consume (one implementation, two readers). MIRROR SCOPE: this file exists only in Backend/packages/shared-contracts/src/ — verified absent from both Ceragon/packages/shared-contracts/src/ and Ceragon-Intelligence/packages/shared-contracts/src/ — so no cross-mirror sync is needed.

### Tests (each carries a defeat step)

- BACKEND UNIT — a contentless tamper event gets NO band. deriveAiEventSeverity({eventType:'AGENT_CONTROL_TAMPER', findings:[], dataClasses:[], policyDecision:null, tamperTransition:null}) must return null. DEFEAT STEP: restore the AGENT_CONTROL_TAMPER entry in SECURITY_SIGNIFICANT_EVENT_BASE — the assertion must flip to severity 'high' with adjustments ['event-type-base']. A test asserting only `severity !== 'high'` is vacuous: it also passes if the row was banded 'low', which is the downgrade failure mode.
- BACKEND UNIT — the anti-downgrade guard. tamperTransition {reason:'AGENT_WENT_DARK', phase:null, outcome:null} must band 'high' with adjustment 'tamper-reason-critical'. Repeat for POLICY_SIGNATURE_INVALID and AUDIT_LOG_CLEARED. DEFEAT STEP: reorder the rule so the outcome branch runs before the reason branch — these must drop to null or medium, proving the ordering is load-bearing and not incidental.
- BACKEND UNIT — table-driven over the FULL vocabulary. Iterate every member of POLICY_TAMPER_REASONS × the §9.7 accepted phase/outcome pairs and assert every combination yields a defined band or a documented null, with no combination reaching 'critical'. DEFEAT STEP: append a fabricated reason to the test's local copy of the vocabulary — the test must fail loudly rather than silently banding it medium. This is the guard that stops the next vocabulary append from re-creating this defect.
- BACKEND CROSS-LANGUAGE — the critical-reason set matches the endpoint. Assert TAMPER_CRITICAL_REASONS is a superset of the reasons in criticalTransition (Installers/internal/airuntimeintegrity/episode.go:166-167), pinned as a literal with a comment pointing at the Go file. DEFEAT STEP: delete one member from the TS set — the test must fail. Without this the two halves drift and the endpoint queues a row as critical that the server bands medium.
- BACKEND UNIT — the two lanes agree. Build an AiEvent with severity='medium' from a RESOLVE/RESTORED transition and assert buildAiAlertOutboxRow emits severity 'medium', not 'critical'. DEFEAT STEP: null out event.severity — the row must fall back to CRITICAL, proving the fallback path is still reachable for legacy rows and pre-derivation events.
- BACKEND REGRESSION — the WEB_NAV_BLOCKED precedent is untouched. Re-run ai-event-severity.detections-truth.spec.ts unchanged. DEFEAT STEP: none needed beyond keeping it green — but it MUST be run, because this change edits the same typeBase slot that governs it, and a regression there re-fills the Detections page with the exact rows the v2 fix removed.

### Risks

BACKEND-ONLY. No agent change, no contract vocabulary change, no deploy-order constraint in either direction.

THE REAL RISK IS DOWNGRADING SOMETHING THAT MATTERS. The reason-first ordering plus the cross-language superset test are the mitigations; do not accept this change without both. The scenario to fear: a future PolicyTamperReasons append (the vocabulary is explicitly extensible — Installers/internal/airuntimeintegrity/tamper.go:61-63) that is genuinely severe but absent from TAMPER_CRITICAL_REASONS would band from its outcome instead. That is acceptable — an outcome of CONTAINED or FAILED still reaches high — but the table-driven test must be re-run on every append, and the Go tuple's own comment already requires a coordinated three-repo change.

HISTORY DOES NOT MOVE. The 138 stored HIGH rows keep their band; severity is hash-covered and never backfilled (:64-68). Anyone expecting the console to look fixed immediately after this deploy will be disappointed — the visible improvement for existing rows comes from F33's grouping and projection, and the release note must say which finding delivers which effect or the fix will be judged inert.

Second-order: severityStatus will start returning 'not-applicable' for contentless tamper rows, so they may leave the Detections surface entirely (isDetectionEvent keys on warned / non-allow decision / non-empty data classes / RELEASED_ONCE). Verify they remain reachable on the Events feed and via an explicit ?eventTypes=AGENT_CONTROL_TAMPER query before shipping. A control-plane event must never become unreachable — being un-banded is honest, being invisible is not.

### ADVERSARIAL REVIEW - verdict: WRONG

- THE CHANGE SILENTLY REMOVES ROWS FROM THE DETECTIONS SURFACE — it is a MEMBERSHIP change, not a severity change, and the spec does not know it. buildDetectionsQuery admits a row only when `e.severity IS NOT NULL OR e.warned = true OR (policy_decision NOT IN allow) OR non-empty data_classes OR data_disposition = 'RELEASED_ONCE'` (Backend/src/ai-governance/services/ai-query.service.ts:3664-3672). A tamper row has none of the last four (the Go producer writes no findings, no dataClasses, no policyDecision — Installers/internal/daemon/ai_integrity_subsystem.go:73-110). Its ONLY ticket onto that page is the stored severity this fix stops writing. Every row that lands on the spec's rule 3 disappears from Detections entirely. isDetectionEvent (src/ai-governance/services/activity-kind.util.ts:344-355) reads the SAME map at :351-354, so severityStatus flips to 'not-applicable' — the console would print 'not applicable' about a control-plane tamper event, which is a false statement and an honesty-discipline violation.
- THE ANTI-DOWNGRADE GUARD IS ILLUSORY AND ITS TEST IS VACUOUS. The spec's rule 1 exists to protect AGENT_WENT_DARK. The server-authored producer writes `metadata: { reason: 'agent_went_dark', detectedBy: 'backend_liveness_sweep', darkEpisodeId, ... }` (src/ai-governance/services/ai-agent-liveness.service.ts:~336-341) — LOWERCASE, not the Go vocabulary token, with no phase, no outcome and no `episodeId`. normalizePolicyTamperEvidence rejects it (isPolicyTamperReason is a membership test over the UPPERCASE tuple, policy-tamper-evidence-contract.ts:~320-326), so tamperTransition is null, rule 1 never fires, rule 3 applies, the band goes null, and per the previous objection the went-dark row LEAVES the Detections page. The spec's own unit test hand-feeds `{reason:'AGENT_WENT_DARK'}` — a value no producer ever writes — so it passes green over the exact path that is broken. That is the vacuous-green failure mode this programme exists to eliminate, reproduced inside the fix that claims to prevent it.
- THE CROSS-LANGUAGE TEST CONTRADICTS THE RULE IT IS MEANT TO PIN. The spec defines TAMPER_CRITICAL_REASONS as 'the exact set criticalTransition uses at episode.go:166-167' and lists five members. The actual Go predicate (C:/cwt/Installers/internal/airuntimeintegrity/episode.go:158-172) has SIX reasons — it includes CONTAINMENT_FAILED — and additionally returns true for OutcomeContained/OutcomeFailed at :160-163 and for DETECT/UNRESOLVED at :171. A test asserting TAMPER_CRITICAL_REASONS is a SUPERSET of criticalTransition's reason set therefore forces CONTAINMENT_FAILED into the high branch, which re-bands every single one of the 138 noise rows 'high' and undoes the finding. The spec's stated set and its stated test cannot both be satisfied.
- THE ALERT-LANE HALF CANNOT DISTINGUISH THE TWO NULLS, SO THE NOISE STILL PAGES CRITICAL. deriveSeverityColumns returns `{}` when the derivation yields null (src/ai-governance/services/ai-event.service.ts:1716-1717), leaving BOTH severity and severityBasis null — identical to a legacy pre-derivation row. The proposed `event.severity ?? deriveAlertSeverity(isWarnTier)` therefore falls back to CRITICAL for exactly the contentless rows the finding is about. The console would say 'not assessed' while the customer's webhook shouts CRITICAL — the same two-lane disagreement the spec set out to close, moved one step sideways.
- THE FRAMING CORRECTION IS RIGHT AND WELL-CITED, and I am not disputing it: SECURITY_SIGNIFICANT_EVENT_BASE.AGENT_CONTROL_TAMPER = 'high' at ai-event-severity.util.ts:70-74 applied unconditionally at :293-296 pushing 'event-type-base'; the WEB_NAV_BLOCKED precedent at :43/:354-360; hash-covered, never backfilled at :64-68; deriveAlertSeverity returning CRITICAL for everything non-warn at src/notifications/outbox/alert-outbox-enqueue.ts:98-100 with every tamper admitted via CONTROL_FAILURE_EVENT_TYPES at :29-36 and :199-212. All verified. The defect is in the FIX, not the diagnosis.

**Corrected root cause**: The diagnosis stands (see the last problem entry) with one addition the spec missed: SECURITY_SIGNIFICANT_EVENT_BASE is not only a severity table, it is the tail of the DETECTION-MEMBERSHIP predicate. activity-kind.util.ts:1 imports it and isDetectionEvent :351-354 falls back to it, and the SQL twin of that predicate (ai-query.service.ts:3664-3672) has no event-type branch at all — it relies entirely on the stored severity the map produces. So 'AGENT_CONTROL_TAMPER: high' is doing two jobs: stating a band (the defect) and admitting the row to the analyst surface (load-bearing). Any fix that removes the entry must replace the second job explicitly or it deletes control-plane events from the console.


**Corrected approach**: Keep the ordered substantiation-gated derivation. Change four things.

1. SEPARATE MEMBERSHIP FROM BAND. Introduce SECURITY_SIGNIFICANT_EVENT_TYPES (the set) alongside SECURITY_SIGNIFICANT_EVENT_BASE (the band map) in ai-event-severity.util.ts. Point isDetectionEvent (activity-kind.util.ts:351-354) at the SET, and add `OR e.event_type IN (:...detSignificantTypes)` to buildDetectionsQuery's admission clause (ai-query.service.ts:3664-3672). Only then may AGENT_CONTROL_TAMPER leave the band map. Without this the fix deletes rows.

2. FIX THE PRODUCER, NOT JUST THE READER. Change ai-agent-liveness.service.ts:~336 to emit the canonical vocabulary token `reason: 'AGENT_WENT_DARK'` plus `phase: 'DETECT'`, `outcome: 'UNRESOLVED'` and `episodeId` alongside the existing darkEpisodeId (Backend-only, no agent, no contract vocabulary change — all three values are already members). Then rule 1 fires for real. Keep a case-insensitive compare in tamperTypeBase as belt-and-braces, and add a test that feeds the ACTUAL metadata object the liveness sweep builds — copy it from the service, do not hand-write it. DEFEAT STEP: revert the producer to 'agent_went_dark' and drop the case-insensitive compare — the band must fall to null, proving the test reads the real producer shape.

3. REDEFINE THE CROSS-LANGUAGE PIN. Do not assert a superset of criticalTransition's reason list — that list includes CONTAINMENT_FAILED (episode.go:165-168) and would re-create the noise. Pin instead: TAMPER_CRITICAL_REASONS == criticalTransition's reason set MINUS {CONTAINMENT_FAILED} PLUS {LOCAL_UNINSTALL_ATTEMPT, CONTROL_ACL_WIDENED}, written as an explicit literal with a comment stating WHY CONTAINMENT_FAILED is excluded (it is a capability statement, F1) and pointing at the Go file. DEFEAT STEP: add CONTAINMENT_FAILED to the TS set — the test must fail, proving the exclusion is asserted and not merely absent.

4. MAKE THE ALERT LANE DERIVE, NOT INHERIT. `event.severity ?? CRITICAL` cannot tell 'derived to null' from 'legacy'. In buildAiAlertOutboxRow, for AGENT_CONTROL_TAMPER call the SAME tamperTypeBase helper on the event's metadata; fall back to deriveAlertSeverity(isWarnTier) only when the event predates the formula (severityBasis null AND no readable transition). Keep the admission predicate at :199-212 untouched, as the spec correctly says.

Finally: state plainly in the plan that F34 must ship in the same Backend deploy as F33, because F33's projection is what makes the rows this change de-escalates still legible.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/activity-kind.util.ts` - isDetectionEvent :344-355 currently derives detection MEMBERSHIP from SECURITY_SIGNIFICANT_EVENT_BASE (import at :1, use at :351-354). Removing AGENT_CONTROL_TAMPER from that map silently drops tamper rows out of detection-ness and flips severityStatus to 'not-applicable'. Point this at a new SECURITY_SIGNIFICANT_EVENT_TYPES set that keeps AGENT_CONTROL_TAMPER.
- **Backend** `src/ai-governance/services/ai-query.service.ts` - buildDetectionsQuery admission clause :3664-3672 — a tamper row qualifies ONLY via `e.severity IS NOT NULL`. Add `OR e.event_type IN (:...detSignificantTypes)` before any band is removed, or every un-banded tamper row vanishes from the Detections page.
- **Backend** `src/ai-governance/services/ai-agent-liveness.service.ts` - emitWentDark ~:336-341 writes metadata.reason = 'agent_went_dark' (lowercase, off-vocabulary), no phase, no outcome, and darkEpisodeId instead of episodeId. Emit the canonical 'AGENT_WENT_DARK' + phase 'DETECT' + outcome 'UNRESOLVED' + episodeId so the reason-first guard the spec relies on can actually fire.

**Collateral risk**: As specified: HIGH and the worst kind — it removes AGENT_WENT_DARK and every contentless tamper row from the Detections surface while the console reports 'not applicable', i.e. an honest-negative turned into a false negative. Nothing here touches the proven-working lanes (command-lane blocking, DLP classes, browser masking, Codex wire blocking, signed-bundle/anti-rollback, package gate, MCP discovery) — the blast radius is entirely the analyst surface, which is precisely where this engagement's credibility lives. With the corrections above the risk drops to: WEB_NAV_BLOCKED regression (the same typeBase slot at :293-296 governs it — re-run ai-event-severity.detections-truth.spec.ts, as the spec already requires) and the one-way nature of the formula-version bump. Deploy order is fine: Backend-only, no agent dependency in either direction, and history genuinely does not move (severity is hash-covered, :64-68).

**Effort correction**: M is understated. The spec's own scope is M, but the mandatory additions — splitting membership from band across two files plus the detections SQL, changing the liveness producer's metadata shape, and re-deriving the alert band rather than inheriting it — plus the regression surface around isDetectionEvent/severityStatus put this at L (3-5d), most of it in tests that must be written against real producer payloads rather than hand-built fixtures.


---

## F4 - Two spool producers stamp surface="runtime-adapter", a token outside the closed vocabulary both halves already share

- **Severity**: MEDIUM
- **Side**: multi   **Effort**: S   **Root cause verdict**: CONFIRMED
- **Depends on**: F33

### Root cause

THE VOCABULARY IS SHARED AND PINNED. THE PRODUCERS JUST BYPASS IT.

The Go half exists: Installers/internal/clientkind/clientkind.go:88-108 declares the closed source_surface set (cli / ide / desktop / browser / web-ai-proxy / mcp / unknown), :117-122 closedSurfaceSet, :126-131 ValidSurface, :155+ FoldSurface; and internal/clientkind/surface_fold_test.go:21-37 (TestSurfaceVocabularyMatchesBackend) pins it member-for-member against the Backend's AI_SOURCE_SURFACES with a comment stating the exact consequence: "a Go-only slug would silently become `unknown` in the console — visible as data loss, not as a build failure". That prediction came true.

TWO PRODUCERS WRITE A BARE LITERAL INSTEAD:
  - Installers/internal/daemon/ai_integrity_subsystem.go:63 — `Surface: "runtime-adapter"` on every AGENT_CONTROL_TAMPER spool event.
  - Installers/internal/daemon/ai_prompt_capture.go:387 — `Surface: "runtime-adapter"` on the prompt-capture lane (the same defect on a second lane, not mentioned in the writeup).
Every other producer routes through clientkind.FoldSurface (ai_handlers.go:1375, 2598, 3013) or a safeSurface helper (ai_oracle_receipt.go:358, 429; evidence_delivery.go:381). These two do not, because evidencespool.EventInput.Surface is a plain `string` (spool.go:182, 868) and a string literal compiles.

THE BACKEND STORES IT VERBATIM AND COLLAPSES IT ON READ. Ingest does not normalize at all: endpoint-evidence-ingest.service.ts writes `surface: input.surface ?? null` — no fold, no collapse. That is deliberate and correct for this lane (ai-source-surface.ts:22-37 explains the two-operation split: the evidence-batch lane must preserve browser-composer / browser-upload). The read side then runs deriveRuntimeIdentity (runtime-identity.util.ts:273-298): surfaceRaw = foldSourceSurface(...) keeps "runtime-adapter", and canonicalSurface (:256-260) finds it is neither a known surface nor a WEB_SURFACE and returns 'unknown' → surfaceLabel 'Unknown surface' from SURFACE_LABELS (:159-167). Exactly the observed {surface:'unknown', surfaceLabel:'Unknown surface', surfaceRaw:'runtime-adapter'}. The read side is behaving correctly; the token is genuinely not in the vocabulary.

WHY runtime/clientKind/host are ALSO null: integrityMetadata (ai_integrity_subsystem.go:73-110) emits none of them, and this producer's EventInput sets no agentType/host/clientKind. The reconciler is a daemon subsystem, not a client session — it has no runtime to report. That part is honest and must stay null.

WHY THE SHARED CONTRACT DID NOT CATCH IT — the structural answer. The parity test pins SET against SET; nothing pins a PRODUCER to the set. Three compounding gaps: (a) the field is `string`, so any literal type-checks; (b) ValidSurface exists but no choke point calls it on the spool write path; (c) the Backend deliberately does not 400 an off-vocabulary surface (ai-source-surface.ts:10-20 documents that a closed enum on an agent-supplied scalar has caused three separate incidents by 400-rejecting whole reports). Silence on the wire is the RIGHT call — the missing piece is a compile-time constraint on the producer, not a runtime rejection.

### Evidence (read at origin/main)

- `Installers/internal/daemon/ai_integrity_subsystem.go:60-66 — EventInput{... Surface: "runtime-adapter" ...}`
- `Installers/internal/daemon/ai_prompt_capture.go:387 — the second, unreported occurrence of the same literal`
- `Installers/internal/clientkind/clientkind.go:88-108 — the closed source_surface constants, with the comment that Go-only slugs are collapsed server-side silently`
- `Installers/internal/clientkind/clientkind.go:117-131 — closedSurfaceSet and ValidSurface, never called on the spool path`
- `Installers/internal/clientkind/surface_fold_test.go:21-37 — TestSurfaceVocabularyMatchesBackend: set-vs-set only, with a hand-copied backend literal at :24`
- `Installers/internal/evidencespool/spool.go:182,868 — EventInput.Surface / Event.Surface are plain strings`
- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:1069 — `surface: input.surface ?? null`, stored verbatim`
- `Backend/src/ai-governance/ai-source-surface.ts:73-81 — AI_SOURCE_SURFACES, no runtime-adapter`
- `Backend/src/ai-governance/ai-source-surface.ts:10-37,47-52,70-72 — why the wire deliberately does not reject; the byte-identity requirement; APPEND-ONLY`
- `Backend/src/ai-governance/services/runtime-identity.util.ts:256-260 — canonicalSurface returns 'unknown' for anything unrecognised`
- `Backend/src/ai-governance/services/runtime-identity.util.ts:159-167,288-297 — SURFACE_LABELS.unknown = 'Unknown surface'; the derivation that produced the observed triple`
- `Backend/packages/shared-contracts/src/ai-governance-contract.ts:732-742 — the contract home of AI_SOURCE_SURFACES`

### Fix

TWO PARTS: name the surface honestly (immediate), then make the class impossible (structural).

PART 1 — APPEND THE MEMBER. `runtime-adapter` is a legitimate, descriptive observation surface: the on-box RA-5 reconciler, which is genuinely not a CLI, a browser, an IDE, a desktop app, a wire proxy or an MCP server. Collapsing it to 'unknown' destroys information; re-labelling it 'cli' would be a fabrication (ai-source-surface.ts:92-101 makes exactly this argument about defaulting to cli). AI_SOURCE_SURFACES is documented APPEND-ONLY (:70-72), so append 'runtime-adapter' in lockstep across the four places that must stay identical:
  - Backend/packages/shared-contracts/src/ai-governance-contract.ts:732 (contract home)
  - Backend/src/ai-governance/ai-source-surface.ts:73 (the deliberate runtime mirror; its header requires byte-identity)
  - Backend/src/ai-governance/services/runtime-identity.util.ts:159-167 (SURFACE_LABELS — add "Runtime adapter"; the Record type makes omitting it a compile error, which is the mechanism working)
  - Installers/internal/clientkind/clientkind.go:88-108 + closedSurfaceSet, and the hand-copied literal in surface_fold_test.go:24
BECAUSE CANONICALISATION HAPPENS ON READ, THIS RETRO-FIXES ALL 138 STORED ROWS the moment the Backend deploys — surface is stored raw, so re-deriving is all it takes. No migration, no backfill, no hash touched.

PART 2 — MAKE THE CLASS IMPOSSIBLE. A parity test between two sets cannot catch a producer that references neither. Close it at the type level: change evidencespool.EventInput.Surface from `string` to a named struct type clientkind.Surface (an opaque `struct{ s string }` with a String() method and exported package-level vars SurfaceCLI/SurfaceIDE/.../SurfaceRuntimeAdapter/SurfaceUnknown, plus clientkind.SurfaceFromWire(string) Surface doing fold-then-collapse for untrusted input). A STRUCT — not a named string type — is what makes `Surface: "runtime-adapter"` a COMPILE ERROR; a named string type would still accept an untyped constant. Every producer must then name a declared member or explicitly convert an untrusted wire value, and a future third producer physically cannot invent a token.
  Complement it with a ROUND-TRIP test on the Backend: for every member of AI_SOURCE_SURFACES, assert deriveRuntimeIdentity({surface:m}).surface === m and .surfaceLabel is non-null — i.e. every value a producer can emit survives canonicalisation. That is the test that would have failed the day runtime-adapter shipped, and it is the one the existing set-vs-set parity test cannot express.

Rejected: teaching canonicalSurface to fold runtime-adapter into an existing member (loses the distinction and invites a growing fold table); making the wire reject off-vocabulary surfaces (re-litigating a decision that cost three incidents — ai-source-surface.ts:10-20); leaving the producer alone and widening only the FE label (the console would still filter and group on a canonical 'unknown').

### Changes

**Backend** - `packages/shared-contracts/src/ai-governance-contract.ts`

Append 'runtime-adapter' to AI_SOURCE_SURFACES (:732-742), after 'mcp' and before 'unknown', with a comment naming the producer (the RA-5 semantic-integrity reconciler's evidence-spool lane). APPEND-ONLY: do not reorder. MIRROR SCOPE — I listed both other shared-contracts copies: Ceragon/packages/shared-contracts/src/ and Ceragon-Intelligence/packages/shared-contracts/src/ contain no ai-governance-contract.ts at all, so this is a single-mirror edit. The genuine twin is the Backend runtime mirror below.

**Backend** - `src/ai-governance/ai-source-surface.ts`

Append 'runtime-adapter' to AI_SOURCE_SURFACES (:73-81) identically. This file's header (:47-52) states it must stay byte-identical to the contract; keep the two diffable.

**Backend** - `src/ai-governance/services/runtime-identity.util.ts`

Add `'runtime-adapter': 'Runtime adapter'` to SURFACE_LABELS (:159-167). The Record<AiSourceSurface,string> type makes this a compile error if forgotten — leave it that way; do not loosen the type.

**Installers** - `internal/clientkind/clientkind.go`

Add `SurfaceRuntimeAdapter = "runtime-adapter"` to the constant block (:88-108) with the same comment shape used for SurfaceWebAIProxy/SurfaceMCP ("no clientKind derives it"), and add it to closedSurfaceSet (:117-122). Then introduce the opaque `type Surface struct{ s string }` with String(), exported vars for each member, and SurfaceFromWire(string) Surface performing FoldSurface + collapse-to-unknown for untrusted input. Keep the existing string-based ValidSurface/FoldSurface for the wire-facing callers.

**Installers** - `internal/evidencespool/spool.go`

Change EventInput.Surface and Event.Surface (:182, :868) to clientkind.Surface, serialising via String() at the wire and on-disk boundaries. This is the compile-time choke point: after it, a bare string literal will not build.

**Installers** - `internal/daemon/ai_integrity_subsystem.go`

Line 63: `Surface: clientkind.SurfaceRuntimeAdapter` (the declared var, not the literal).

**Installers** - `internal/daemon/ai_prompt_capture.go`

Line 387: same replacement. This second occurrence is not in the writeup and must not be missed — the prompt-capture lane has been stamping the same off-vocabulary token.

**Installers** - `internal/clientkind/surface_fold_test.go`

Line 24: add "runtime-adapter" to the hand-copied backend literal, in the SAME commit as the Backend append (the comment at :22-23 demands it). Consider replacing the literal with a checked-in fixture generated from the TS tuple so the two cannot drift by hand.

### Tests (each carries a defeat step)

- BACKEND UNIT (the missing round-trip) — for every member m of AI_SOURCE_SURFACES: assert deriveRuntimeIdentity({surface:m}).surface === m and .surfaceLabel is non-null. DEFEAT STEP: remove 'runtime-adapter' from SURFACE_LABELS only — the label assertion must fail; remove it from AI_SOURCE_SURFACES only — the identity assertion must fail with surface==='unknown'. If either removal leaves the test green, it is iterating the wrong tuple.
- BACKEND UNIT — 'unknown' is still reachable for a genuinely unknown token. deriveRuntimeIdentity({surface:'totally-made-up'}) must give surface 'unknown', surfaceLabel 'Unknown surface', surfaceRaw 'totally-made-up'. DEFEAT STEP: none of the above changes may alter this; if the collapse stops working the fix has widened the vocabulary into an open set, which is a text-injection channel into a security console (runtime-identity.util.ts:71-79).
- BACKEND UNIT — the browser sub-surfaces still fold. deriveRuntimeIdentity({surface:'browser-composer'}).surface === 'browser' with surfaceRaw preserved. DEFEAT STEP: reorder canonicalSurface so the isKnownSourceSurface check runs after the WEB_SURFACES check — behaviour must be unchanged, proving the new member did not disturb the existing fold precedence.
- GO COMPILE-TIME — the class is closed. Verify by experiment during implementation: temporarily revert EventInput.Surface to `string` and re-add the literal at ai_integrity_subsystem.go:63 — the build must succeed; restore the struct type — the build must FAIL. DEFEAT STEP is the revert itself: if the build fails in both directions the error is coming from something else (an unused import, a lint rule someone can disable) and the type is not doing the work.
- GO UNIT — the parity test still binds. Run TestSurfaceVocabularyMatchesBackend after adding the member to only ONE side. DEFEAT STEP: add to clientkind.go but not to the test literal — the length check at surface_fold_test.go:32-36 must fail. That length assertion is the whole test; verify it actually fires before trusting it.
- GO UNIT — spool wire/disk compatibility. Decode a spool file written by the previous build (string surface) with the new struct-typed field and assert every event round-trips with its surface intact. DEFEAT STEP: change String() to emit a prefixed form — the decode must fail. This is the one part of the change that can destroy queued evidence.
- LIVE — after Backend deploy (agent not yet required), GET a stored AGENT_CONTROL_TAMPER row and assert identity.surface === 'runtime-adapter' and identity.surfaceLabel === 'Runtime adapter'. DEFEAT STEP: also check a row emitted BEFORE the deploy — both must now render identically. If only new rows render correctly, canonicalisation is not happening on read and something is persisting the derived value.

### Risks

DEPLOY ORDER: BACKEND FIRST, and it is genuinely independent. The Backend append alone fixes every existing and future row, because canonicalisation happens on READ from a raw-stored column — the agent change is hygiene, not a dependency. A new agent against an old Backend behaves exactly as today ('unknown' with surfaceRaw preserved); an old agent against a new Backend is fully fixed. There is no window in which anything is worse.

Appending to a vocabulary that is documented APPEND-ONLY and consumed by plane-resolution rules is the one place to be careful: check every switch and Record<AiSourceSurface, ...> over the tuple before merging. The Record types surface most of them as compile errors — that is the mechanism working, do not silence it with a default branch. Specifically verify the plane-resolution SQL and any WEB_SURFACES membership logic do not now mis-bucket the new member.

The EventInput.Surface type change touches the spool's persisted JSON shape. Serialise via String() so on-disk and wire encodings are byte-identical to today; otherwise an in-place agent upgrade cannot read its own un-drained spool and queued evidence is lost. The decode test above is mandatory.

Finally: fixing the label does NOT make these events useful. A correctly-labelled row that still says "no finding class, no outcome" is the same bad surface with a better chip. F4 is only worth shipping alongside F33 and F1; on its own it is cosmetic, and the release note should not claim otherwise.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE DECLARATIONS ARE IN A FILE THE CHANGE LIST DOES NOT NAME. EventInput.Surface and Event.Surface are declared at C:/cwt/Installers/internal/evidencespool/types.go:30 and :83 (`Surface string \`json:"surface,omitempty"\``). spool.go:182 and :868 — the two lines the changes entry tells the implementer to edit — are ASSIGNMENTS (`Surface: input.Surface,`), not type declarations. types.go is absent from the change list entirely.
- THE STRUCT TYPE BREAKS THE WIRE AND ON-DISK SHAPE, WHICH THE SPEC ITSELF FORBIDS. encoding/json's `omitempty` has no effect on struct types — a struct field is never considered empty. Today, events that set no surface (e.g. internal/promptevidencegate/bundle.go:158-161, which constructs EventInput with only EventType and EmittedAt) omit the key entirely. After the change every such record emits `"surface":""`. The Backend accepts it (endpoint-evidence-batch.dto.ts:206-209 is @IsOptional @IsString @MaxLength(32)) and endpoint-evidence-ingest.service.ts:1069 stores '' — but :882 and :1325 do `sourceSurface: input.surface ?? 'CLI'`, and '' is not nullish, so the SESSION's source_surface silently becomes the empty string instead of 'CLI' for every lane that omits a surface. That is a fleet-wide data regression introduced by a hygiene change, and it is exactly the 'on-disk and wire encodings byte-identical' invariant the spec's own risks section demands. A pointer field or a custom MarshalJSON that the encoder can still omit is required, and the spec does not mention either.
- THE CLOSED TYPE COLLIDES WITH A DELIBERATELY OPEN LANE AND WOULD REGRESS BROWSER EVIDENCE. internal/daemon/browser_receipt.go:320-324 computes `Surface: strings.ToLower(strings.ReplaceAll(r.Surface, "_", "-"))` and legitimately produces `browser-composer` / `browser-upload`. Those are NOT members of the closed vocabulary and are preserved ON PURPOSE: Backend/src/ai-governance/ai-source-surface.ts:22-37 documents the two-operation split, ai-plane.constants.ts:24 makes them live WEB_SURFACES members, migration 1788600000000-AiTenancyConstraints.ts:73-82 names them as production values that must survive, and toActivityItem projects surfaceRaw specifically so 'browser-composer is not flattened away' (ai-query.service.ts:~3286-3289). Routing that call site through SurfaceFromWire (fold-then-collapse) destroys the distinction AT THE PRODUCER, where surfaceRaw cannot rescue it — a regression on the browser/web-guard lane, one of the capabilities proven working in this engagement. The opaque type therefore needs an explicit passthrough constructor for the browser sub-surfaces, at which point it is not much stronger than the FoldSurface discipline every other producer already follows.
- EFFORT S IS NOT CREDIBLE FOR PART 2. `grep -rn 'evidencespool.EventInput{'` returns 15 construction sites across 8 non-test files (ai_integrity_subsystem.go, ai_oracle_receipt.go, ai_prompt_capture.go, browser_receipt.go, evidence_delivery.go, promptevidencegate/bundle.go, promptevidencegate/gate.go) plus 7 in tests, and the type change also touches the length-bound validator (spool.go:730 `{"surface", input.Surface, 32}` takes a string), the Event↔EventInput round-trip at spool.go:860-880, and every JSON encode/decode of the WAL (spool.go:466, :594, :639). Part 1 alone is S; Part 2 is M at least.
- dependsOn: [F33] is not a technical dependency. Part 1 is a pure Backend read-side append that retro-labels all 138 stored rows on deploy with no agent involvement; it neither requires nor is required by F33. State it as a shipping-VALUE sequencing note (which the risks section already does well) rather than a blocking edge, or the wave planner will serialise two independent changes.

**Corrected root cause**: CONFIRMED, and the citations hold. Both producers verified: Installers/internal/daemon/ai_integrity_subsystem.go:63 and internal/daemon/ai_prompt_capture.go:387 both write the bare literal `Surface: "runtime-adapter"`, while every other producer routes through clientkind.FoldSurface (ai_handlers.go:1375, 2598, 3013) or safeSurface (ai_oracle_receipt.go:358, 429; evidence_delivery.go:381). The Go vocabulary is at internal/clientkind/clientkind.go:88-108 with closedSurfaceSet at :117-122 and ValidSurface at :126-131, and the parity test pins SET-vs-SET only, against a hand-copied literal at surface_fold_test.go:24 — confirmed, and its own comment predicts precisely this silent collapse. Backend side: ingest stores verbatim (endpoint-evidence-ingest.service.ts:1069), canonicalSurface collapses anything unrecognised to 'unknown' (runtime-identity.util.ts:256-260), SURFACE_LABELS.unknown = 'Unknown surface' (:159-167), and deriveRuntimeIdentity produces exactly the observed {surface:'unknown', surfaceLabel:'Unknown surface', surfaceRaw:'runtime-adapter'} triple (:288-297). The structural explanation — the field is a plain string, no choke point calls ValidSurface on the spool path, and the wire deliberately does not reject (ai-source-surface.ts:10-20) — is correct. TWO ADDITIONAL FACTS THE SPEC DID NOT CLAIM BUT THAT MATTER: there is NO CHECK constraint on ai_sessions.source_surface (migration 1788600000000-AiTenancyConstraints.ts:69-90 declines it explicitly, naming browser-composer/browser-upload/ci as values that must survive), so the append needs no migration; and the mirror-scope claim is verified — neither `<WORKSPACE>/packages/shared-contracts/src/` nor the Ceragon-Intelligence worktree copy contains ai-governance-contract.ts, so this is a single-mirror edit plus the Backend runtime twin.


**Corrected approach**: SPLIT THE SPEC IN TWO AND SHIP PART 1 AS ITS OWN CHANGE. Part 1 (append 'runtime-adapter' to AI_SOURCE_SURFACES in packages/shared-contracts/src/ai-governance-contract.ts:732-742 and src/ai-governance/ai-source-surface.ts:73-81, add 'Runtime adapter' to SURFACE_LABELS at runtime-identity.util.ts:159-167, add SurfaceRuntimeAdapter to clientkind.go:88-122 and to the hand-copied literal at surface_fold_test.go:24, and replace both bare literals with the constant) is SOUND, single-mirror, migration-free, retro-fixes stored rows on read, and is S. Ship it.

Part 2 (the opaque type) needs three corrections before it is safe:
(a) Edit internal/evidencespool/types.go:30 and :83, not spool.go:182/868.
(b) Preserve the omitted-key encoding. Either make the field a pointer (`*clientkind.Surface` with omitempty, which the encoder DOES omit when nil) or keep the wire struct's field a plain string populated from Surface.String() at the types.go boundary while the constructor argument is typed. Add a test that byte-compares a WAL record written by the previous build against one written by the new build for an EventInput with no surface — the bytes must be identical. DEFEAT STEP: drop the omit handling and re-run; the comparison must fail with `"surface":""` present, proving the assertion reads the encoded bytes and not the struct.
(c) Give clientkind an explicit, documented passthrough for the browser sub-surfaces — e.g. SurfaceFromBrowserLane(string) that folds but does NOT collapse — and route browser_receipt.go:320-324 through it, with a comment naming ai-plane.constants.ts:24 and the migration note as the reason. A blanket SurfaceFromWire on that call site is a data-loss regression on a proven-working lane.

Also add the missing FE check: verify no Frontend surface tuple/label map needs the new member (plane-view.tsx keys on WEB_SURFACES and agent identity, so it is unaffected — confirm rather than assume).


**Missing changes the reviewer found**:

- **Installers** `internal/evidencespool/types.go` - THE ACTUAL DECLARATION SITE, absent from the spec: EventInput.Surface at :30 and Event.Surface at :83, both `string` with `json:"surface,omitempty"`. Any type change happens here; spool.go:182/868 are only assignments. Preserve key-omission for events that set no surface (pointer field or a string-typed wire struct), or the WAL/wire shape changes for every producer.
- **Installers** `internal/daemon/browser_receipt.go` - :320-324 computes a surface dynamically and legitimately emits browser-composer / browser-upload, which are NOT vocabulary members and are deliberately preserved end-to-end. It needs a fold-without-collapse constructor; routing it through SurfaceFromWire would collapse them to 'unknown' at the producer and destroy the web-plane distinction.
- **Installers** `internal/evidencespool/spool.go` - :730 `{"surface", input.Surface, 32}` — the bounded-length validator takes the field as a string and must be adapted alongside the type change; the spec does not mention it.
- **Backend** `src/ai-governance/services/endpoint-evidence-ingest.service.ts` - Verification (no edit expected if Part 2 preserves omission): :882 and :1325 do `sourceSurface: input.surface ?? 'CLI'`. Empty-string surfaces bypass the nullish default and write '' into ai_sessions.source_surface. Confirm the encoding change cannot produce '' before merging Part 2.

**Collateral risk**: Part 1: none identified. The append is to a documented APPEND-ONLY tuple with no DB CHECK, the Record<AiSourceSurface,string> type at runtime-identity.util.ts:159 turns a forgotten label into a compile error (leave it that way), plane resolution is unaffected (WEB_SURFACES membership and agent-type branches are untouched — ai-plane.constants.ts:20-40), and old-agent/new-Backend and new-agent/old-Backend both behave correctly because canonicalisation is a READ-side derivation over a raw-stored column.

Part 2 as written: MODERATE-TO-HIGH. Two concrete regressions, both named above — the `"surface":""` encoding change corrupting ai_sessions.source_surface for every lane that omits a surface, and collapsing browser-composer/browser-upload at the producer, which would degrade browser masking / Web AI Guard evidence attribution. Neither touches enforcement itself, but the second regresses the console evidence for a capability this engagement proved working, which is the outcome the brief ranks worst.

**Effort correction**: Part 1 = S (credible). Part 2 = M, not S: 15 EventInput construction sites, a WAL encode/decode compatibility test, the spool.go:730 string-bound validator, and the browser-lane passthrough. The spec's single S rating for both halves would have under-planned the wave.
