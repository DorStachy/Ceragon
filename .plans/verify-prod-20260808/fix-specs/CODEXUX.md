# Fix specs - cluster CODEXUX

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

ONE SHARED MECHANISM LINKS F22 AND F6. The "mask the offending span in resent history instead of blocking the whole request" fix the brief asks for is ALREADY IMPLEMENTED and shipped: internal/proxy/ai_context_replay.go:130-164 (replayContextDecision) + internal/proxy/openai_decision.go:320-336 redact every gating DLP span that lies OUTSIDE the current prompt, re-extract, and re-run the full decision engine. It is dead code on Codex desktop because its enabling input — a current-turn boundary — is obtained ONLY from lookupCurrentPromptSpan (ai_context_replay.go:86-128), which requires a hit in daemon/ai_recent_prompt.go, which is populated ONLY at daemon/ai_handlers.go:1608-1610 from the /ai/prompt/check HOOK route. Codex 0.134.0 fires zero hooks (F6), so the store is permanently empty for (codex, openai), promptMatched is permanently false, and the sanitizer never runs. F22 is therefore a CONSEQUENCE of F6, not an independent defect, and the single change in spec F22 (derive the boundary structurally from the request body, which already carries the conversation structure) closes it on both the Codex wire lane and the Anthropic lane without touching the hook lane at all.

SECOND CROSS-CUTTING FACT: three of the four findings are surfaces that report something DIFFERENT from what actually happened, in three different directions. F23 logs "holding request" and tells the user "it was not sent to OpenAI" for a request that WAS sent and partially answered (a false negative-egress claim — the most dangerous direction). F21's daemon toast is created by a SYSTEM-session PowerShell that cannot render on the interactive desktop; cmd/devoid/ai_hook_notify.go:24-26 ALREADY documents this exact defect ("structurally undeliverable because the daemon runs as SYSTEM (session 0) — verified on the live endpoint, its PowerShell call failed on every block and only wrote a log line no one reads") and fixed it for the hook lane by moving the toast into a user-session process — the wire lane never got that treatment. F6 prints "Codex binary unknown" when the binary version was read perfectly well (0.134.0) and the actual reason is ReasonHookTrustDialectUnverified. Each is a copy/attribution fix on top of a correctly-working control.

THIRD: internal/daemon/server.go:1160 hardcodes "wireProxy": true in the /health document. cmd/devoid/setup_installer.go:729-753 (daemonWireProxyHealthy) gates writing the Codex R5 provider route on that literal, and internal/daemon/server.go:2096 passes DaemonHealthy: func() bool { return true } to the in-daemon reconcile "because this reconcile runs INSIDE the serving daemon process, so the loopback wire proxy is up by construction". None of those three is a measurement of whether the wire lane WORKS — they only prove the mount is compiled in and the process is alive. That is exactly why the daemon "already knows how to do (c)" but cannot: the health signal it would reuse is a constant. F23's change replaces that constant with a real outcome-derived predicate, which is what makes reuse possible.

NO SHARED-CONTRACT CHANGE. Every change in this cluster is endpoint-side Go (Installers) plus CLI copy. Nothing touches packages/shared-contracts, so no three-way mirror sync is required. The one adjacent item that WOULD touch contracts — giving Codex wire decisions a server-side session so the console can show them (F26) — is deliberately out of scope here and is the reason F21's fix builds an ENDPOINT-side attribution surface rather than a console one.

DEPLOY ORDER: none of these four require a backend change, so agent-only deploys are safe and old-agent/new-backend compatibility is unaffected. F21's optional X-Devoid-* response headers are loopback-only and never reach a backend.


---

## F23 - The SSE handler's blanket recover() converts a post-egress transport abort into a non-retryable fatal, and lies about it

- **Severity**: HIGH
- **Side**: agent   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

The recorded hypothesis ("the request is HELD after the panic", "fail-closed", root cause = the daemon's 30s WriteTimeout) is wrong on all three counts.

(1) NOTHING IS HELD. internal/proxy/openai_sse.go:77-83 installs one deferred recover over the WHOLE of ServeHTTP, including h.forward at :211. By the time forward can panic, the decision has already been made (UplinkRelay/UplinkRedact), the prompt has ALREADY egressed to OpenAI, and the response is ALREADY committed: I read Go's httputil at C:/Program Files/Go/src/net/http/httputil/reverseproxy.go:531 — `rw.WriteHeader(res.StatusCode)` runs BEFORE `p.copyResponse(...)` at :533, and only a copyResponse error panics (`panic(http.ErrAbortHandler)` at :543). So at recover time the client has already received HTTP 200 + text/event-stream + N bytes of the model's answer.

(2) THE RECOVERY IS WHAT KILLS THE TURN. h.writeHold(w,"panic") (openai_sse.go:81 -> :294-297 -> writeFatalSSE :405-421) then calls w.WriteHeader(200) (a no-op "superfluous WriteHeader" on a committed response) and APPENDS `event: response.failed / data: {..."error":{"code":"invalid_prompt",...}}` into the middle of a live SSE stream. writeHold's own doc comment (:290-293) states invalid_prompt maps to ApiError::InvalidRequest with is_retryable()==false. So we hand the client a NON-RETRYABLE fatal for what was a plain transport abort. Without the recover, net/http's documented ErrAbortHandler contract closes the connection silently and the client's ordinary stream-disconnect retry applies. We manufacture the terminal failure.

(3) THE MESSAGE IS FALSE. writeHold sends "Held by Devoid: could not scan this request (panic), so it was not sent to OpenAI". On this path it WAS scanned, WAS allowed, WAS sent, and was partially answered. This is a shipped false negative-egress claim and directly violates the honesty discipline.

(4) WriteTimeout IS NOT THE (REMAINING) TRIGGER. It is already cleared TWICE per request: internal/daemon/openai_wire.go:179 (clearStreamDeadlines) and internal/proxy/openai_sse.go:251 (clearStreamWriteDeadline), and clearStreamWriteDeadline WARNs loudly if it fails (stream_deadline.go:40-45). The read deadline is not the trigger either: Go's connReader.startBackgroundRead (net/http/server.go:687-698) CLEARS the read deadline once the request body hits EOF, and the handler reads the body to EOF at openai_sse.go:129. The residual triggers are the ordinary ones — the Codex client cancelling/closing a turn, or an upstream stream reset — and Go DISCARDS the underlying error (reverseproxy.go:539-543 keeps it only for the test path), which is why nobody has been able to name it. That invisibility is itself part of the root cause and is fixed here.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/proxy/openai_sse.go:77-83 (blanket recover over all of ServeHTTP, incl. forward)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:199-211 (UplinkRelay/Redact -> h.forward: egress already decided and performed)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:230-266 (forward -> clearStreamWriteDeadline -> reverseProxyToDNSBound)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:286-297 (writeHold: 'so it was not sent to OpenAI' + non-retryable invalid_prompt)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:405-421 (writeFatalSSE sets headers + WriteHeader(200) + writes one event)`
- `C:/Program Files/Go/src/net/http/httputil/reverseproxy.go:531-543 (WriteHeader BEFORE copyResponse; copy error -> panic(ErrAbortHandler); underlying error discarded in prod)`
- `C:/Program Files/Go/src/net/http/httputil/reverseproxy.go:653-681 (copyBuffer: read errors go to p.logf, write errors are returned silently)`
- `C:/Program Files/Go/src/net/http/server.go:687-698 (startBackgroundRead clears the read deadline at body EOF — rules out ReadTimeout)`
- `C:/cwt/Installers/internal/daemon/server.go:655-658 (daemon http.Server ReadTimeout/WriteTimeout 30s)`
- `C:/cwt/Installers/internal/daemon/openai_wire.go:176-180 + internal/proxy/stream_deadline.go:38-46 (WriteTimeout already cleared twice, with a WARN tripwire)`
- `C:/cwt/Installers/internal/daemon/server.go:1160 ('wireProxy': true is a hardcoded literal, not a health measurement)`
- `C:/cwt/Installers/cmd/devoid/setup_installer.go:729-753 (daemonWireProxyHealthy trusts that literal)`
- `C:/cwt/Installers/internal/daemon/server.go:2090-2096 (in-daemon reconcile passes DaemonHealthy: func() bool { return true })`

### Fix

Scope the recover to the phase where a hold is both possible and truthful, and let the transport abort be a transport abort.

A. Track egress explicitly. Introduce a local `egressed bool` in ServeHTTP, set to true on the line immediately before every h.forward call (:115 passthrough, :138 fail-open, :153 fail-open, :211 relay/redact). In the deferred recover: if egressed, do NOT write anything (the response is committed and anything written corrupts the stream) — log WARN "openai sse: upstream stream aborted AFTER egress; the request was NOT held" with the captured copy error, emit an evidence record, and re-panic the recovered value so net/http performs its documented clean abort (ErrAbortHandler suppresses the stack trace and closes the connection; the client then retries as it would for any dropped stream). If NOT egressed, keep today's behavior exactly — hold, plus the emitWireHeld the panic path is missing today.

Why re-panic rather than 'return quietly': returning would let net/http finish the response normally and send a well-formed but TRUNCATED stream with no terminal event, which some clients hang on. ErrAbortHandler is the contract net/http defines for exactly this, and the panic value is already it.

B. Make the trigger measurable. Wrap the ResponseWriter in a small streamTap that records (bytesWritten, firstWriteError) and — critically — implements `Unwrap() http.ResponseWriter` so clearStreamWriteDeadline keeps working (the exact lesson already written down at internal/proxy/ai_notice.go:102-114). Separately set rp.ErrorLog in reverseProxyToWithTransport to a *log.Logger bridged to our structured logger, which captures Go's own 'httputil: ReverseProxy read error during body copy' line. Between the two, every future abort names whether the CLIENT or the UPSTREAM went away. Do not use rp.ModifyResponse for this: reverseProxyToWithTransport deletes Accept-Encoding whenever modify != nil (proxy_stream.go:50-54), which would silently change the wire behaviour.

C. Make proxy health a MEASUREMENT, then reuse it. Replace the hardcoded "wireProxy": true (server.go:1160) with a value derived from a small wireLaneHealth counter fed by the SSE handler: pre-egress panics, post-egress aborts, and successful completions over a rolling window. Publish `wireProxy` (mount present — unchanged semantics for old callers) PLUS a new `wireProxyDegraded` bool + `wireProxyDegradedReason` string. daemonWireProxyHealthy (setup_installer.go:729) must additionally refuse to WRITE a fresh R5 route when wireProxyDegraded is true, and server.go:2096's `DaemonHealthy: func() bool { return true }` must become the same predicate.

D. EXPLICIT RECOMMENDATION ON FAILING OPEN — the brief asks for a decision, here it is, with three parts:
  (i) A panic BEFORE the decision must keep failing CLOSED. That is where an unscanned prompt could leak; no change.
  (ii) A panic AFTER the decision is not a fail-open at all and must not be treated as one. The security decision already ran and returned ALLOW; the prompt is already at OpenAI. Letting the transport abort cleanly protects nothing less than today and restores the client's retry. This is the whole of the availability fix and it costs zero enforcement.
  (iii) DO NOT auto-unwire the R5 route on proxy unhealth, and do not fall back to direct-provider egress. The wire lane is the ONLY control covering Codex desktop on this endpoint — the hook lane is measurably dead (F6) — so silently removing the route converts a transient availability incident into a permanent, invisible enforcement hole, which is the precise defect class this programme exists to eliminate. Instead: surface the degraded state loudly (health document + `devoid ai status` + a governance event), refuse to write NEW routes while degraded (C above), and require an explicit operator action (`devoid ai wire disable --reason <text>`) that records who removed governance and why. Availability is restored by A, not by removing the control.

### Changes

**Installers** - `internal/proxy/openai_sse.go`

ServeHTTP (:77): add `egressed := false` before the defer; set `egressed = true` immediately before each h.forward call (:115, :138, :153, :211). Rewrite the deferred func: on recover, if egressed -> logger.Warn("openai sse: upstream stream aborted AFTER egress; the request was NOT held (it was allowed and already sent)", "recover", rec, "bytesDelivered", tap.Written(), "writeError", tap.Err()), emit a content-free wire observation, then `panic(rec)`; if !egressed -> keep logger.Warn("openai sse: recovered panic BEFORE egress; holding request") + ADD the currently-missing emitWireHeld(h.cfg, sess, "panic") (guard for a nil sess: a panic before :122 has none) + h.writeHold(w, "panic"). Do NOT change writeHold's text — with this change it can only run pre-egress, where the claim 'it was not sent to OpenAI' becomes true again.

**Installers** - `internal/proxy/openai_sse.go`

forward (:230): wrap w in the new streamTap before calling reverseProxyToDNSBound, and clear the write deadline on the TAP (not the raw w) so the Unwrap chain is exercised in production exactly as in test. Keep clearStreamWriteDeadline's WARN tripwire.

**Installers** - `internal/proxy/stream_tap.go`

NEW FILE. type streamTap struct{ http.ResponseWriter; n int64; err error }. Implement Write (record first error + byte count), WriteHeader, Flush (delegate to the inner Flusher), and — mandatory — Unwrap() http.ResponseWriter, plus accessors Written()/Err(). Mirror the contract documented on noticeInjectingWriter.Unwrap (ai_notice.go:102-117): a wrapper without Unwrap makes clearStreamWriteDeadline inert.

**Installers** - `internal/proxy/proxy_stream.go`

reverseProxyToWithTransport (:28): set rp.ErrorLog = a *log.Logger whose Writer forwards to internal/logger at Warn. This captures Go's own 'httputil: ReverseProxy read error during body copy' (reverseproxy.go:661) which is today swallowed into the stdlib default logger. Do not add a ModifyResponse — the modify != nil branch at :50-54 deletes Accept-Encoding and would change wire behaviour.

**Installers** - `internal/proxy/wire_health.go`

NEW FILE. A small mutex-guarded rolling window (e.g. last 20 SSE dispatches) recording preEgressPanic / postEgressAbort / completed. Expose Snapshot() {Degraded bool, Reason string, Recent counts}. Degraded when post-egress aborts exceed a threshold (e.g. >=3 in the window) or any pre-egress panic occurred. Fed from openai_sse.go's recover and from the normal completion path.

**Installers** - `internal/daemon/server.go`

handleHealth (~:1154-1160): keep "wireProxy": true as the mount-present marker (old callers depend on it) and ADD "wireProxyDegraded" (bool) + "wireProxyDegradedReason" (string) from proxy.WireHealthSnapshot(). Add both keys to healthLivenessKeys (:1137) so the split /health document still carries them token-free — they are posture-neutral (no counts, no content), which is why they may live on the open body.

**Installers** - `internal/daemon/server.go`

aiWireReconcile (:2090-2096): replace `DaemonHealthy: func() bool { return true }` with a predicate that ALSO requires !proxy.WireHealthSnapshot().Degraded, and update the comment — 'the process is serving' is not 'the lane works', which is precisely how a degraded lane kept getting fresh R5 routes written at it.

**Installers** - `cmd/devoid/setup_installer.go`

daemonWireProxyHealthy (:729-753): decode the two new fields and return false when WireProxyDegraded is true. Extend the doc comment: the old check proved only that a devoid daemon of the right version had the mount compiled in.

**Installers** - `cmd/devoid/ai_status.go`

Print the wire-lane health line in `devoid ai status`: 'wire egress lane: healthy' or 'DEGRADED — <reason>; Codex turns may fail. Governance is still ENFORCED; the route has NOT been removed.' Never phrase a degraded lane as reduced enforcement.

### Tests (each carries a defeat step)

- Go unit, internal/proxy: TestSSEPostEgressAbortIsNotHeldAndNotWrittenTo — build the handler against an in-process fake upstream (the injectable upstreamFor seam at openai_sse.go:54) that writes 200 + a few SSE bytes, flushes, then panics http.ErrAbortHandler from its own handler goroutine to force a copy error. Assert: (a) the client-visible body contains the upstream's bytes and does NOT contain the substring "invalid_prompt" or "Held by Devoid"; (b) the handler re-panics with http.ErrAbortHandler (recover in the test's own wrapping handler). DEFEAT STEP: revert only the `egressed` guard (restore the unconditional h.writeHold) and re-run — the test MUST fail on assertion (a) by finding "invalid_prompt" appended after the upstream bytes. If it still passes, the fake upstream is not producing a real copy error and the test is vacuous.
- Go unit, internal/proxy: TestSSEPreEgressPanicStillHoldsAndEmitsEvidence — inject a Decide that panics, assert the reply is the invalid_prompt fatal, assert NOTHING was forwarded (fake upstream records zero requests), and assert exactly one emitWireHeld observation with reason "panic" reached the AlertObserver. DEFEAT STEP: delete the new emitWireHeld call and re-run — the observer assertion must fail; today's code emits no evidence at all on the panic path, so a test that passes before the change is testing nothing.
- Go unit, internal/proxy: TestStreamTapUnwrapKeepsWriteDeadlineClearable — call clearStreamWriteDeadline(streamTap{ResponseWriter: realResponse}) against a live httptest server with WriteTimeout 100ms and stream past it (the existing TestStreamOutlivesServerWriteTimeout harness at stream_deadline_test.go:27 is the template). DEFEAT STEP: delete streamTap.Unwrap and re-run — the test must fail AND the WARN from stream_deadline.go:41 must appear in the captured log. This is the exact regression ai_notice.go:102-114 was written about.
- Go unit, internal/proxy: TestWireHealthDegradesOnRepeatedPostEgressAborts — drive N synthetic post-egress aborts through the counter, assert Snapshot().Degraded flips at the threshold and clears after the window fills with completions. DEFEAT STEP: hard-code Degraded=false and re-run; the test must fail. Then assert the daemon /health document actually carries the flipped value (integration, below) — a counter nobody reads is the failure mode this whole programme is about.
- Go integration, internal/daemon: TestDegradedWireProxyRefusesNewR5Route — start a daemon test server whose wire health reports Degraded, call daemonWireProxyHealthy's decoder against its /health, assert false, and assert aiwire.Reconcile lands the agent in SkippedDesktop rather than WiredDesktop. DEFEAT STEP: set Degraded=false in the fixture and re-run — the agent must move to WiredDesktop. Without that flip the test cannot distinguish the new gate from the pre-existing wireProxy gate.
- Manual/lab (REQUIRED before merge, recorded in the evidence file): run Codex desktop 0.134.0 against a local daemon whose fake upstream aborts mid-stream on turn 3 of 5. Record whether the client retries and recovers (expected after the fix) versus dying with 'task encountered a system error' (today). DEFEAT STEP: run the same script against the pre-fix binary and confirm the failure reproduces — an unreproduced control makes the post-fix pass meaningless.

### Risks

Re-panicking means net/http closes the connection with no terminal SSE event. A client that hangs on a truncated stream instead of retrying would trade one failure for a worse one — this is why the lab test on the INSTALLED 0.134.0 client is a merge gate, not a follow-up. Mitigation if 0.134 hangs: emit a single `response.failed` with a RETRYABLE code before re-panicking (never invalid_prompt/cyber_policy, which are pinned non-retryable at openai_sse.go:290-296) — but only on evidence, never speculatively.

The two new /health keys are additive; old CLIs decode into a struct with three fields and ignore them (setup_installer.go:740-744 uses a narrow anonymous struct), so an old CLI against a new daemon keeps today's behaviour. A NEW CLI against an OLD daemon sees the fields absent -> zero value false -> not degraded -> today's behaviour. Both directions are safe, which is required because the daemon and the CLI ship in the same binary but are not always the same version on a box mid-upgrade.

Making DaemonHealthy conditional in the in-daemon reconcile means a genuinely degraded lane stops getting its route REFRESHED. It does not remove an existing route (aiwire.Reconcile is drift-aware and SkippedDesktop writes nothing), so an already-wired box stays wired and stays governed — verify this explicitly in the integration test rather than assuming it.

rp.ErrorLog is process-global-ish in effect (one logger per proxy instance, and reverseProxyToWithTransport builds a fresh one per request) — confirm the bridged logger allocation is not on a hot path large enough to matter; it is one small struct per model turn.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- ROOT CAUSE IS PROVEN AND THE CITATIONS HOLD — I re-read every one. openai_sse.go:77-82 is a blanket recover over all of ServeHTTP; h.forward is at :115/:138/:153/:211 exactly as claimed; forward() is :230 with clearStreamWriteDeadline(w) at :251; writeHold at :294-296 emits invalid_prompt with the literal text 'so it was not sent to OpenAI'; writeFatalSSE at :405-421 sets headers + WriteHeader(200) + one event. Go stdlib confirms the ordering claim: httputil/reverseproxy.go rw.WriteHeader(res.StatusCode) runs BEFORE p.copyResponse, and only a copy error reaches panic(http.ErrAbortHandler) (~:531-543 in the installed Go). Since ErrAbortHandler is reachable ONLY after WriteHeader, the observed recover value proves the response was already committed and the prompt already egressed. Points (1)(2)(3) are correct and the honesty violation is real.
- CHANGE C VIOLATES A PINNED, DELIBERATELY CLOSED INVARIANT. The spec adds 'wireProxyDegraded'/'wireProxyDegradedReason' to the OPEN /health body and to healthLivenessKeys. internal/daemon/server.go:1131-1136 declares that list 'a closed list on purpose: every key here is readable by any local process ... Diagnostic and posture detail belongs on GET /v1/health/detail' and is 'Pinned by TestHealthOpenBody_ExactlyLivenessKeys'. That test lives at internal/daemon/health_split_test.go:46-68 and fails with 'posture detail must live on /v1/health/detail'. server.go:1188+ documents the F14/DF-72 split precisely to stop an unprivileged local process reading 'exactly which controls were degraded ... the reconnaissance step before acting unreported'. 'wireProxyDegraded=true' IS a degraded-control disclosure; the spec's justification ('posture-neutral, no counts, no content') is wrong on its own terms.
- CHANGE C's RECONCILE GATE CONTRADICTS THE SPEC'S OWN FIX D(iii). Making internal/daemon/server.go:2096 DaemonHealthy conditional on !Degraded disables the DRIFT-REPAIR path, not just fresh writes. aiwire.Reconcile is what restores an R5 route that Codex, an upgrade, or a user removed. During a degraded window a removed route is NOT repaired, so Codex silently loses the only lane that governs it — the exact outcome D(iii) says must never happen ('silently removing the route converts a transient availability incident into a permanent, invisible enforcement hole'). Worse, the proposed integration test (TestDegradedWireProxyRefusesNewR5Route asserting SkippedDesktop) ASSERTS the hole rather than catching it. This is the one place in this cluster that can regress a capability PROVEN WORKING in this engagement (Codex wire blocking).
- THE `egressed` BOOL IS THE WRONG PREDICATE AND THE SPEC ALREADY BUILDS THE RIGHT ONE. Two distinct facts are conflated: (a) the prompt left the box, which is what makes writeHold's 'it was not sent to OpenAI' a lie; and (b) the response is COMMITTED, which is what makes any further write corrupt the stream. A hand-placed flag before h.forward answers neither precisely — a panic inside forward before dispatch is misclassified as post-egress and silently loses the evidence emit. Change B introduces a streamTap that knows (b) exactly and then never uses it for the decision.
- emitWireHeld(h.cfg, sess, "panic") WILL NOT COMPILE AS SPECIFIED. The deferred closure is installed at openai_sse.go:78-82, BEFORE `sess := NewWSSession(...)` at :122, so `sess` is not in the closure's scope. emitWireHeld's signature is internal/proxy/openai_evidence.go:201 func(cfg OpenAIProxyConfig, sess *WSSession, reason string). The change entry says 'guard for a nil sess' but never states that `var sess *WSSession` must be hoisted above the defer and the :122 line changed from `:=` to `=`.
- MERGE-ORDER COUPLING WITH F21 IS UNSTATED. F21 change A sets X-Devoid-* headers inside writeFatalSSE. On today's post-egress path writeFatalSSE runs against an already-committed response, so those headers are silently dropped. F23 must land first or F21's attribution channel is inert on exactly the path that most needs it.
- EFFORT IS UNDER-ESTIMATED. Two new files, edits across four packages, a redesign of change C after the /health objection, five unit tests, one daemon integration test, plus a REQUIRED pre-merge lab driving the installed Codex desktop 0.134.0 through 5 turns against a fake upstream that aborts mid-stream on turn 3. That lab harness alone (isolated CODEX_HOME, scripted fake upstream, pre-fix reproduction control) is most of a day.


---

## F22 - One blocked secret bricks a Codex thread forever because the replayed-history sanitizer is gated on a hook that never fires

- **Severity**: CRITICAL
- **Side**: agent   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

The brief asks us to build a behaviour that ALREADY EXISTS and is dead. internal/proxy/openai_decision.go:318-336 already does exactly the recommended thing: replayContextDecision selects the gating DLP findings lying OUTSIDE the current prompt, redactBodyOpenAI rewrites those spans, the body is re-extracted, and the COMPLETE decision engine is re-run over the rewritten bytes; on success the turn forwards as UplinkRedact with DispositionRedactedThenSent. Its doc (ai_context_replay.go:130-139) states the intent verbatim: replayed context 'should not permanently turn a later harmless prompt into a sticky BLOCK'.

It never runs on Codex desktop. replayContextDecision returns (zero,false) whenever currentKnown is false (ai_context_replay.go:144-146). currentKnown comes from lookupCurrentPromptSpan (:86-128), which returns false immediately when the RecentPromptLookup misses. That lookup is daemon/ai_recent_prompt.go:98-106 over a store written in exactly ONE place: daemon/ai_handlers.go:1608-1610, inside the /ai/prompt/check HOOK handler, gated on body.EmitSubmitEvent. Codex 0.134.0 fires zero hook checkpoints (F6, measured live: '0 of 4 checkpoints have fired'), so the (codex, openai) partition of that store is permanently empty, promptMatched is permanently false, and the sanitizer is unreachable. Every replay of the poisoned history therefore re-runs the full-conversation decision, re-finds aws-access-key, and re-blocks — forever.

I DISPROVED the obvious alternative mechanism. The DenyStore is NOT what bricks the thread: TurnKey (openai_denystore.go:119-128) keys on firstTurnInputHashFor (openai_decision.go:539-548), which hashes instructions + EVERY input item. Codex replays a GROWING input array, so the hash differs on every turn and IsDenied never matches a new turn — the persisted deny correctly covers only byte-identical resends. That matches the observed log, which shows three fresh `verdict=block ... findings=aws-access-key:block` decisions rather than persisted-deny lines.

THE SECURITY QUESTION, ANSWERED FROM SOURCE (the brief asked not to assume): masking history is safe. redactBodyOpenAI (openai_decision.go:612-668) requires EVERY finding to map into a segment and errors with errCouldNotFullyRedact otherwise (:656-663); the caller then preserves the ORIGINAL gate (:329-334). After a successful rewrite the caller re-extracts and re-decides over the rewritten body (:324-328), and only that body is forwarded. So the secret bytes never reach the transport, and an unrewritable or still-gating body still blocks. The redaction marker is the same typed [REDACTED:<class>] form the browser lane writes (browser-extension/src/dlp.js:1628) via the same contenttransform vocabulary — i.e. the browser precedent the brief cites is already the same mechanism, not a different one to port.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/proxy/openai_decision.go:306 (lookupCurrentPromptSpan -> promptMatched)`
- `C:/cwt/Installers/internal/proxy/openai_decision.go:318-336 (the replay sanitizer: redact-outside-current-prompt, re-extract, re-decide)`
- `C:/cwt/Installers/internal/proxy/ai_context_replay.go:140-146 (replayContextDecision returns false when !currentKnown)`
- `C:/cwt/Installers/internal/proxy/ai_context_replay.go:86-101 (lookupCurrentPromptSpan bails on a lookup miss)`
- `C:/cwt/Installers/internal/proxy/ai_context_replay.go:51-72 (latestUserSegments: the structural current-turn boundary already computed from the request body alone)`
- `C:/cwt/Installers/internal/daemon/ai_recent_prompt.go:41-66, 98-106 (the store and its lookup)`
- `C:/cwt/Installers/internal/daemon/ai_handlers.go:1606-1610 (the ONLY writer: the /ai/prompt/check hook route)`
- `C:/cwt/Installers/internal/daemon/openai_wire.go:107 (RecentPrompt wired for agentType codex / provider openai)`
- `C:/cwt/Installers/internal/proxy/openai_denystore.go:119-128 + internal/proxy/openai_decision.go:539-548 (TurnKey hashes the whole growing input -> DisPROVES the DenyStore hypothesis)`
- `C:/cwt/Installers/internal/proxy/openai_decision.go:612-668 (redactBodyOpenAI is fail-closed on any unmappable finding)`
- `C:/cwt/Installers/internal/proxy/openai_frame.go:70-116 (Responses extractor: input[i] developer message items vs Ingress tool output)`
- `C:/cwt/Installers/browser-extension/src/dlp.js:1618-1628 (the browser lane's [REDACTED:<class>] masking — same vocabulary)`
- `C:/cwt/Installers/internal/proxy/ai_proxy.go:391,445 (the Anthropic lane shares the identical gate)`

### Fix

Derive the current-turn boundary STRUCTURALLY from the request body when the hook correlation is unavailable, and feed it to the existing sanitizer. The provider request already carries the conversation structure — the hook only ever added the extra assurance that the last user item is the just-typed prompt. latestUserSegments (ai_context_replay.go:51-72) already computes that item today; only the byte-span arithmetic is missing.

Add structuralCurrentTurnSpan(segs []TextSegment) (promptSpan, bool): take latestUserSegments(segs); if empty return false; walk segs accumulating the same `len(text)+1` newline offset joinSegments uses (identical to the loop at ai_context_replay.go:119-126) and return the span from the first to the last byte of that latest item's segments. Then at BOTH call sites (openai_decision.go:320 and ai_proxy.go:445) use the hook span when promptMatched, else the structural span.

KEEP THE TWO CONCERNS SEPARATE — this is the load-bearing design constraint. decideForMatchedSurface (ai_context_replay.go:28-39) must CONTINUE to require the real hook match, because that is a claim about which SURFACE submitted the prompt and the structural boundary proves nothing about surface. Only the replay sanitizer gets the fallback. Confusing the two would let a structural guess silently select a different policy.

Security envelope after the change, all pre-existing and unchanged: a secret typed in the CURRENT turn is inside the span -> untouched -> still BLOCK (the live-proven behaviour from the CX phase is preserved exactly). A finding straddling the boundary is retained (the overlap test at ai_context_replay.go:149-151 is conservative). PromptFindings (injection/jailbreak) are never included (:161). An unmappable finding fails closed to the original gate. The rewritten body is re-decided end to end before anything is forwarded.

Second change, copy: buildBlockTextOpenAI (openai_warn.go:263-266) currently always says '...detected in this conversation (it may be from an earlier message)'. After the fix a BLOCK means the secret is in THIS turn, which is materially more actionable. Make the clause conditional on whether the sanitizer ran and still blocked, and add the remedy the user currently has no way to discover: 'Remove it from your message and resend — earlier messages in this thread have already been masked automatically.'

One change closes F22 on the Codex wire lane AND removes the same latent stickiness from the Anthropic lane (which is masked today only because Claude's hooks do fire).

### Changes

**Installers** - `internal/proxy/ai_context_replay.go`

Add `func structuralCurrentTurnSpan(segs []TextSegment) (promptSpan, bool)`: latestUserSegments(segs) -> if empty, false; else compute the joined-text byte span covering that item using the SAME offset walk as lookupCurrentPromptSpan (:119-126, `offset += len(segment.Text) + 1`). Return the span from the first matching segment's start to the last matching segment's end. Document that it is a STRUCTURAL boundary (which item is last), never a claim about surface, and is therefore used only by the replay sanitizer and never by decideForMatchedSurface.

**Installers** - `internal/proxy/openai_decision.go`

At :306-320, after `currentPrompt, promptMatch, promptMatched := lookupCurrentPromptSpan(...)`, add: `sanitizeSpan, sanitizeKnown := currentPrompt, promptMatched; if !promptMatched { sanitizeSpan, sanitizeKnown = structuralCurrentTurnSpan(segs) }`. Change :320 to `replayContextDecision(dec, sanitizeSpan, sanitizeKnown)`. Leave the decideForMatchedSurface call at :308-310 using promptMatch/promptMatched UNCHANGED.

**Installers** - `internal/proxy/ai_proxy.go`

Apply the identical two-line change at :391 and :445 so the Anthropic lane gets the same fallback. Same constraint: the surface-selection call keeps the hook-only gate.

**Installers** - `internal/proxy/openai_warn.go`

buildBlockTextOpenAI (:242-266): keep the load-bearing 'Blocked by Devoid: ' prefix (:256-262 explains why two tripwires pin it). Make the '(it may be from an earlier message)' clause conditional — emit it only when the sanitizer could not run or still blocked — and append the remedy sentence naming that prior history is masked automatically, so a user who hits a block knows the thread is not dead.

**Installers** - `internal/proxy/openai_decision.go`

At the redact/relay emit sites (:341-350), ensure the contextSanitized branch records reason 'replayed-context:redact' (already appended at ai_context_replay.go:162) so the console/evidence can distinguish 'we masked your history and sent the turn' from 'we allowed it clean'. No new field — the existing Reasons slice carries it.

### Tests (each carries a defeat step)

- Go unit, internal/proxy: TestWireThreadSurvivesAPoisonedHistoryWithoutAnyHook — build handleUplink with cfg.RecentPrompt = nil (exactly the Codex-desktop condition). Turn 1: input containing a synthetic AWS key in the latest user item -> assert UplinkDeny. Turn 2: the SAME input array plus a new trailing user item 'hello' -> assert UplinkRedact, assert the forwarded bytes contain '[REDACTED:aws-access-key]' and do NOT contain the key, and assert 'hello' is present verbatim. DEFEAT STEP: revert only the structuralCurrentTurnSpan fallback (restore `replayContextDecision(dec, currentPrompt, promptMatched)`) and re-run — turn 2 MUST return UplinkDeny. If it still passes, cfg.RecentPrompt is not actually nil in the fixture and the test proves nothing.
- Go unit: TestCurrentTurnSecretStillBlocksWithNoHook — RecentPrompt nil, the AWS key in the LATEST user item -> UplinkDeny, nothing forwarded. DEFEAT STEP: widen structuralCurrentTurnSpan to return an empty span (start=end=0) and re-run — the test must fail by returning UplinkRedact. This is the test that proves the fallback did not weaken enforcement, so it must be shown to be capable of failing.
- Go unit: TestStraddlingFindingIsNotSanitized — construct a finding whose span crosses the boundary between the previous item and the latest user item -> assert the original BLOCK is preserved (replayContextDecision's overlap rule at :149-151). DEFEAT STEP: change the overlap condition to a strict containment test and re-run — the test must fail.
- Go unit: TestUnmappableFindingPreservesTheOriginalGate — inject a finding whose offsets fall outside every segment so redactBodyOpenAI returns errCouldNotFullyRedact -> assert the turn still denies and the WARN 'replayed context could not be safely sanitized' is logged. DEFEAT STEP: make redactBodyOpenAI return the original body instead of the error and re-run — the test must fail by forwarding.
- Go unit: TestSurfaceSelectionStillRequiresARealHookMatch — RecentPrompt nil, DecideForSurface wired to a stub that records invocation -> assert DecideForSurface was NEVER called and the legacy Decide was. DEFEAT STEP: change decideForMatchedSurface's gate to use the structural span and re-run — the test must fail. This pins the one thing the fix must not do.
- Go unit, internal/proxy (Anthropic parity): the same poisoned-history scenario against aiProxyHandler with RecentPrompt nil. DEFEAT STEP: same — revert the ai_proxy.go:445 change only.
- Manual/lab on the live endpoint (record in the private evidence file): paste a synthetic AWS key into a Codex desktop thread (expect BLOCK with the new remedy copy), then send 'hello' in the SAME thread and confirm it completes and the daemon log shows a redact-then-sent decision carrying reason 'replayed-context:redact'. DEFEAT STEP: repeat on the pre-fix binary and confirm 'hello' still fails identically — the private evidence records repeated same-thread reproduction, so an unreproducible control means the test environment is wrong.

### Risks

BEHAVIOUR CHANGE THAT MUST BE STATED PLAINLY: a secret that was typed in an EARLIER turn now gets masked-and-sent instead of blocking every later turn. The secret still never egresses (proven in rootCause), but the conversation continues rather than dying — an operator reading the console will see REDACTED_THEN_SENT events where they previously saw repeated BLOCKs. That is the intended fix and matches the browser lane's proven behaviour, but it will change tenant metrics and must be called out in the release note, not discovered.

The structural boundary assumes the LAST developer/user item in input[] is the current turn. For the Codex Responses shape the extractor already excludes assistant output and marks tool output as Ingress (openai_frame.go:78-79, 106-110), so the assumption holds for every shape the extractor can see. A client that appends a synthetic user item AFTER the typed prompt would shift the boundary and could mask a just-typed secret — the mitigation is that the boundary only ever widens what gets MASKED, never what gets forwarded unmasked, and the re-decide still runs; but add a lab check against the installed 0.134.0 client's actual input ordering before relying on it.

An attacker cannot use this to launder a secret: to get a span sanitized it must be OUTSIDE the last user item, i.e. already in prior history, i.e. already blocked once and never sent. There is no ordering that gets a fresh secret out.

No backend or contract change; agent-only deploy, no ordering constraint.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE ROOT CAUSE IS PROVEN AND IS THE STRONGEST WORK IN THIS CLUSTER. Every citation checks out at the exact line: openai_decision.go:306 lookupCurrentPromptSpan, :307 decideForMatchedSurface, :320 replayContextDecision, :322-328 redact→re-extract→re-decide; ai_context_replay.go:144-146 returns false on !currentKnown; :86-101 bails on a lookup miss; :51-72 latestUserSegments; redactBodyOpenAI at openai_decision.go:612 with errCouldNotFullyRedact at :658 and :662 (fail-closed on any unmappable finding). The store's SINGLE writer is internal/daemon/ai_handlers.go:1608-1609 gated on body.EmitSubmitEvent inside the /ai/prompt/check hook handler; internal/daemon/openai_wire.go:107 wires the (codex, openai) lookup. F22 is genuinely a consequence of F6 and the fix genuinely closes it on both lanes with one mechanism. I could not break the security argument: a current-turn secret stays inside the span → contextFindings empty → replayContextDecision returns false → original BLOCK stands; a mixed turn re-decides to Block after masking history.
- THE DenyStore DISPROOF SURVIVES SCRUTINY BUT ITS STATED REASON IS INCOMPLETE. TurnKey (openai_denystore.go:119-128) is prev-keyed when PreviousResponseID is present and hash-keyed only otherwise, so 'the hash differs on every turn' holds ONLY for unchained turns. The disproof is nevertheless correct, and for a better reason: a persisted-deny hit logs the distinct line 'openai wire: turn denied by persisted deny-store; holding' at openai_decision.go:257 and emits emitWirePersistedDeny, whereas the live log shows three FRESH `verdict=block ... findings=aws-access-key:block` lines — which proves IsDenied returned false all three times, i.e. Codex sends no PreviousResponseID. State it that way.
- RESIDUAL THE FIX DOES NOT COVER. The persisted-deny consult at openai_decision.go:256 runs BEFORE extraction (:264) and therefore before the sanitizer can ever run. If any client (a future Codex build, the WS lane, a VS Code core) chains previous_response_id across a blocked turn, TurnKey is constant, IsDenied hits, and the thread bricks again with the new sanitizer unreachable. Needs an explicit pin.
- CHANGE 5 IS MIS-TARGETED. At openai_decision.go:341-347 (VerdictAllow + contextSanitized) the emit ALREADY passes contextDecision, whose Reasons already carry 'replayed-context:redact' (appended at ai_context_replay.go:162) — that half of the change is a no-op. The REAL gap is openai_decision.go:384 (VerdictRedact branch), which emits `dec` (the POST-sanitize decision), so the replayed-context reason is DROPPED exactly in the common case where masking history leaves another redactable class behind. The allow-once release path (~:404) has the same shape.
- TEST FIXTURE MISSTATES THE PRODUCTION CONDITION. 'cfg.RecentPrompt = nil (exactly the Codex-desktop condition)' is wrong: internal/daemon/openai_wire.go:107 wires a NON-nil closure (internal/daemon/ai_recent_prompt.go:98-105) that always misses. Both reach lookupCurrentPromptSpan's false so the test is not invalid, but the stated defeat step ('If it still passes, cfg.RecentPrompt is not actually nil in the fixture') would send an implementer chasing the wrong thing. Use a non-nil always-false lookup — that is the shipped shape.
- MISSING SIGNATURE CHANGE. buildBlockTextOpenAI is internal/proxy/openai_warn.go:242 func(dec policyeval.Decision, segs []TextSegment) string. Making the '(it may be from an earlier message)' clause conditional on whether the sanitizer ran requires a new parameter plus updates to every caller and to the two prefix tripwires named in the comment at :256-262. Not listed in `changes`.
- RISK FRAMING UNDERSTATES THE DIRECTION OF THE BEHAVIOUR CHANGE. 'the boundary only ever widens what gets MASKED, never what gets forwarded unmasked' is true but misleading: a misplaced structural boundary moves a directly-typed secret from BLOCK to REDACTED_THEN_SENT — a policy-ACTION downgrade for a class configured :block. It is not a leak (redactBodyOpenAI + the re-decide at :322-328 guarantee that), but it is an enforcement-fidelity change and must be named as one. Related and unstated: the top-level `instructions` segment can never be in latestUserSegments (userItemRoot matches only 'messages[' / 'input[', ai_context_replay.go:74-84), so a secret in Codex's system prompt / AGENTS.md also moves from BLOCK to mask-and-send.


---

## F21 - A DeVoid wire block has no attribution surface the user can actually see — and the OpenAI-refusal attribution is misdiagnosed

- **Severity**: HIGH
- **Side**: agent   **Effort**: L   **Root cause verdict**: REVISED

### Root cause

The recorded claim — 'a DeVoid block renders to the user as OPENAI'S OWN REFUSAL' — is not supported by source and is very likely wrong about causation.

(1) OUR BLOCK IS ALREADY ATTRIBUTED AND FORWARDS NOTHING. handleUplink returns UplinkDeny with a payload built by buildBlockTextOpenAI (openai_warn.go:242-266) whose FIRST WORDS are 'Blocked by Devoid: <class labels> detected in this conversation...'. openai_sse.go:177-179 writes exactly that string as response.error.message; nothing from OpenAI is fetched or relayed on this path. The verbatim OpenAI product copy the owner saw ('We take extra caution with cybersecurity requests... apply for Trusted Access') exists nowhere in our tree and cannot be synthesized by us — it can only have come from a real OpenAI response, i.e. from a turn we ALLOWED and that OpenAI itself refused. Codex desktop renders the whole thread, so that earlier refusal stays on screen while later DeVoid-blocked turns render as a terminal error. The user's experience is exactly as reported; the causal attribution in the finding is not.

(2) THE ACTUAL DEFECT IS THE ABSENCE OF ANY VISIBLE OUT-OF-BAND CHANNEL, and it is already written down in our own source as a solved problem on a different lane. cmd/devoid/ai_hook_notify.go:12-31 documents the identical failure ('An enforcement action the developer cannot observe is indistinguishable from a bug, and it is what made a working control look broken for a day') and its cause: 'the daemon's equivalent toast is structurally undeliverable because the daemon runs as SYSTEM (session 0) — verified on the live endpoint, its PowerShell call failed on every block and only wrote a log line no one reads.' The hook lane fixed this by firing the toast from the hook process, which runs in the developer's own session. The WIRE lane never got that fix: daemon/openai_wire.go:114 still wires Notifier: notify.Notify, which is notify.Notify -> osNotifier.Show -> exec powershell.exe (notify_windows.go:44-46, 60-66) from session 0. The observed 'notify: [HIGH] devoid blocked an AI request ... see your terminal' line is the LOG FALLBACK (notify.go:110-112) firing because the toast failed — which is itself the proof.

(3) THE IN-BAND RENDERING ON THE INSTALLED CLIENT IS GENUINELY UNPROVEN. openai_sse.go:278-281 and :311-334 pin the block/warn shapes against codex-cli 0.144.5 and 0.146.0-alpha.9.2 lab captures. The installed client is 0.134.0. Whether it renders response.error.message at all is not established by anything in this tree, and the honesty discipline forbids asserting it does.

(4) THE COPY POINTS AT THE WRONG SURFACE. openai_decision.go:353, :375 and :295-296 all end with 'see your terminal' on a lane whose entire population is a GUI desktop app and a VS Code extension. The comment at :354-360 even concedes the toast cannot render from SYSTEM and that the in-band reason 'is what actually reaches a Codex IDE developer' — while the toast text still says 'terminal'.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/proxy/openai_warn.go:242-266 (buildBlockTextOpenAI — 'Blocked by Devoid: ' prefix is already there and is tripwire-pinned)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:165-182 (UplinkDeny -> writeBlockNotice; nothing upstream is fetched or relayed)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:268-284, 390-421 (writeDeny/writeBlockNotice/writeFatalSSE — the exact emitted SSE shape)`
- `C:/cwt/Installers/internal/proxy/openai_sse.go:278-281, 311-322 (shape source-pinned to codex-cli 0.144.5 and 0.146.0-alpha.9.2; installed client is 0.134.0)`
- `C:/cwt/Installers/cmd/devoid/ai_hook_notify.go:12-31 (our own source states the SYSTEM/session-0 toast is structurally undeliverable and was verified so on the live endpoint)`
- `C:/cwt/Installers/internal/daemon/openai_wire.go:114 (wire lane still wired to the undeliverable notify.Notify)`
- `C:/cwt/Installers/internal/notify/notify.go:32-51, 110-112 (Notify -> New().Show, log fallback)`
- `C:/cwt/Installers/internal/notify/notify_windows.go:44-46, 60-66 (toast = exec powershell.exe; from session 0 it cannot reach the interactive desktop)`
- `C:/cwt/Installers/internal/proxy/openai_decision.go:295-296, 353, 375 ('see your terminal' on a GUI-only lane)`
- `C:/cwt/Installers/internal/proxy/openai_decision.go:354-360 (comment concedes SYSTEM cannot toast, yet the toast copy was not changed)`
- `C:/cwt/Installers/internal/aicanary/deelevate_windows.go:12-38, 62 (WTSQueryUserToken route from LocalSystem to the active interactive session — the existing, production-proven mechanism)`
- `C:/cwt/Installers/internal/aicanary/launch_windows.go:174, 295 (startAsUser / CreateProcessAsUser)`
- `C:/cwt/Installers/internal/aicanary/exec.go:66-77 (exported Runner/Run entry point)`
- `C:/cwt/Installers/cmd/devoid/ai_warn_dialog_windows.go:13-35 (the WPF consent window — proof a DeVoid-branded GUI surface already exists and works, from a user-session process)`

### Fix

Give the block THREE attribution channels with independent failure modes, none of which depends on a single Codex client version. Ordered by certainty, cheapest first.

A. RESPONSE HEADERS (zero client risk, always true). In writeFatalSSE / writeWarnNotice / writeBlockNotice, set X-Devoid-Decision (block|hold|warn), X-Devoid-Reason-Code (the closed reason slug), X-Devoid-Classes (class labels only, never a value) and X-Devoid-Agent (codex) BEFORE WriteHeader. No client renders these, but they make every wire decision machine-attributable for `devoid ai status`, for support captures, and for any future console lane. This is the channel that cannot break.

B. IN-BAND, VERSION-INDEPENDENT RENDERING. Today a block is ONE `response.failed` event and the user only sees our text if their client renders response.error.message. Emit the attribution ALSO as a leading assistant message item — the exact two-field shape writeWarnNotice already uses and that is lab-proven to render as ordinary assistant text on BOTH 0.144.5 and 0.146 (openai_sse.go:311-334) — and THEN the unchanged terminal `response.failed`/`cyber_policy`. Streamed content is the one thing every version of an SSE chat client renders. The terminal event is untouched, so the non-retryable guarantee and the non-zero `codex exec` exit code (openai_sse.go:368-385 explains why that must not become response.completed) are preserved by construction.

C. OUT-OF-BAND, GUI-VISIBLE. Stop wiring the wire lane's Notifier to a session-0 toast. Add a daemon notifier that launches the toast in the ACTIVE INTERACTIVE SESSION by reusing internal/aicanary's already-shipped de-elevation (WTSQueryUserToken -> CreateProcessAsUser, deelevate_windows.go:12-38 / launch_windows.go:295), running `devoid ai notify-block` with the title/body passed via the environment exactly as notify_windows.go:48-58 already does (no interpolation, no injection surface). Fall back to today's behaviour (log line) when no interactive session exists — a headless box has nobody to tell.

D. COPY. Replace 'see your terminal' at openai_decision.go:295-296, :353, :375 with surface-correct text that names DeVoid, the class, the fact that nothing was sent, and a real next step: 'DeVoid blocked a Codex request — aws-access-key. Nothing was sent to OpenAI. Run `devoid ai status` for details.' The lane knows AgentType (openai_wire.go:91) so this is derivable, not guessed.

WHAT THIS DOES NOT DO, deliberately: it does not create a Codex session or events server-side (that is F26 and would touch shared-contracts in three mirrors). The endpoint-side channels above are what make a block attributable TODAY without a backend deploy.

### Changes

**Installers** - `internal/proxy/openai_sse.go`

writeFatalSSE (:405) and writeWarnNotice (:342): add a small setDevoidAttributionHeaders(w, decision, reasonCode, classes, agent) called before WriteHeader. Classes come from gatingLabels(dec) (openai_warn.go:249) — labels only, never a matched value.

**Installers** - `internal/proxy/openai_sse.go`

writeBlockNotice (:390): before writeFatalSSE, write the SAME two-event assistant-message preamble writeWarnNotice builds at :350-362 (EventOutputItemDone carrying one assistant message whose text is the DeVoid block text) — but WITHOUT EventResponseCompleted, then the unchanged writeFatalSSE(w, "cyber_policy", text). Update the doc block at :368-389 to record that the terminal event and its code are deliberately unchanged and why.

**Installers** - `internal/proxy/openai_sse_test.go (and openai_block_notice_test.go)`

TestSSEDenyIsCyberPolicyFatalSSEEvent and TestSSEBlockShapeUnchangedByWarnPath currently pin the block stream as effectively one event. Re-pin them to the properties that actually matter: the TERMINAL event is response.failed with code cyber_policy, and the message retains the 'Blocked by Devoid: ' prefix. Do NOT relax the non-retryable-code discipline — the doc at :376-380 explains that flipping to response.completed would make `codex exec` exit 0 on a blocked secret.

**Installers** - `internal/notify/usersession_windows.go`

NEW FILE (plus a usersession_other.go no-op for non-Windows). NotifyInteractive(title, body) — resolve the active interactive session token via the aicanary de-elevation route, launch the toast helper as that user with DEVOID_TOAST_TITLE/DEVOID_TOAST_BODY in the environment (reuse winToastArgs/winToastEnv, notify_windows.go:44-58), and fall back to the existing log notifier when no interactive session/token is available. Never return an error to the caller; a toast is never worth a failed decision (notify.go:46-49).

**Installers** - `internal/daemon/openai_wire.go`

Line 114: replace `Notifier: notify.Notify` with the interactive-session notifier. Same change at internal/daemon/server.go:597 for the Anthropic mount — that lane has the identical session-0 problem for its proxy-path blocks.

**Installers** - `internal/proxy/openai_decision.go`

Lines 295-296, 353, 375, 492: replace the 'see your terminal' bodies with surface-correct, class-naming copy that states nothing was sent and names `devoid ai status` as the next step. Derive the agent name from cfg.agentType().

**Installers** - `cmd/devoid/ai_notify_block.go`

NEW FILE. A hidden `devoid ai notify-block` verb that reads DEVOID_TOAST_TITLE/DEVOID_TOAST_BODY from its environment and calls notify.New().Show. This is the process the daemon launches into the user session; keeping it a devoid verb rather than a raw powershell command keeps the signed-binary chain intact.

### Tests (each carries a defeat step)

- Go unit, internal/proxy: TestBlockStreamCarriesAssistantAttributionThenFatal — capture the bytes writeBlockNotice emits; assert the FIRST event is response.output_item.done with an assistant message containing 'Blocked by Devoid:', the LAST event is response.failed with code cyber_policy, and the X-Devoid-Decision header is 'block'. DEFEAT STEP: delete the preamble write and re-run — the first assertion must fail. Also assert the terminal event is byte-identical to today's, by comparing against a golden file generated from the pre-change binary; if that comparison cannot fail, the golden is not being read.
- Go unit: TestWarnAndHoldShapesUnchanged — regression over writeWarnNotice and writeHold, asserting their event sequences are unchanged by the header addition. DEFEAT STEP: add a stray event to writeHold and confirm the test fails; a shape test that tolerates extra events is not pinning anything.
- Go unit, internal/notify: TestNotifyInteractiveFallsBackWhenNoSession — inject a token resolver that returns 'no interactive session'; assert the log-notifier fallback ran and no process was spawned. DEFEAT STEP: make the resolver succeed with a stub launcher and assert the launcher IS invoked; if both paths produce the same observable, the seam is not injectable and the test is decorative.
- Go unit: TestBlockToastCopyNamesTheSurfaceAndNotTheTerminal — assert no notify body emitted from the wire lane contains the substring 'terminal', and that each contains the agent name and 'Nothing was sent'. DEFEAT STEP: restore one 'see your terminal' string and re-run — the test must fail. This is a grep-style test, so it must be scoped to the wire lane's notify call sites or it will pass vacuously.
- Manual/lab, REQUIRED BEFORE MERGE (the version-independence claim must be measured, not asserted): drive codex-cli/desktop 0.134.0 against a loopback fake upstream emitting exactly the new two-event block byte sequence, in an isolated CODEX_HOME — the same harness described at openai_sse.go:311-322. Record (a) what the user sees, (b) the exit code, (c) the POST count (must be exactly 1 — a reconnect storm means the shape is wrong for this version). DEFEAT STEP: run the same harness with today's single-event shape and record the 0.134 rendering; if 0.134 already renders response.error.message clearly, change B is unnecessary and only A/C/D ship. Do not ship B on the assumption that 0.134 behaves like 0.144.
- Manual/lab: trigger a real wire block on the live endpoint with the daemon running as SYSTEM and confirm a DeVoid-branded toast appears on the interactive desktop. DEFEAT STEP: confirm on the pre-fix binary that NO toast appears and only the log line is written — that is the documented current state (ai_hook_notify.go:24-26) and reproducing it is what makes the post-fix observation meaningful.

### Risks

CHANGE B IS THE RISKY ONE. Prepending an output item to a stream that terminates in response.failed is not a shape any lab has measured on any version; a client could render the attribution and then ALSO render a generic error, or could treat the item as a completed turn. This is why the 0.134 lab measurement is a merge gate. If the measurement is bad, ship A/C/D alone — they carry most of the value and have no client-facing risk.

Launching a process into another session from LocalSystem is privilege-sensitive. Reuse aicanary's existing route rather than writing a new one: it is already fenced (deelevate_windows.go:30-38 refuses service identities, refuses elevated linked tokens, and requires the linked token's user to be byte-identical) and already ships. Do NOT add a new token path.

The X-Devoid-* headers are visible to any local process that can reach the loopback proxy — that is already true of the whole lane, and the headers carry class labels only, never matched values. Confirm the class-label vocabulary contains no free text before shipping.

Agent-only change; no backend, no contract, no deploy ordering.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE ROOT-CAUSE RETRACTION IS CORRECT AND IS THE MOST VALUABLE PART OF THE SPEC. Verified: buildBlockTextOpenAI (internal/proxy/openai_warn.go:263-265) emits a string literally beginning 'Blocked by Devoid: '; openai_sse.go:165-181 answers UplinkDeny by writing that string and forwarding NOTHING upstream. The OpenAI 'Trusted Access' copy exists nowhere in the tree. The recorded claim 'a DeVoid block renders as OPENAI'S OWN REFUSAL' is not supported by source. Point (2) is verified verbatim at cmd/devoid/ai_hook_notify.go:22-26 and internal/daemon/openai_wire.go:113 (Notifier: notify.Notify — spec says :114, off by one) plus internal/daemon/server.go:597 for the Anthropic mount. Point (3) is verified: internal/proxy/openai_sse.go:311-322 and :376-386 pin the shapes to 0.144.5/0.146.0-alpha.9.2 only.
- DECISIVE DEFECT — CHANGE C's REUSE PLAN DOES NOT REACH THE INTERACTIVE SESSION AND WOULD SHIP THE SAME BROKEN TOAST. aicanary.Run (internal/aicanary/exec.go:77-101) de-elevates ONLY when VerifyExecutableTrust returns plan.Mode == LaunchAsTargetUser. decideLaunch (internal/aicanary/guard.go:246-277) returns LaunchAsIs whenever the leaf and every ancestor have NO foreign (non-admin) writers — which is exactly a correctly-installed devoid.exe under Program Files. So aicanary.Run from the SYSTEM daemon launches the toast helper with the CURRENT session-0 token and the toast is undeliverable, identically to today. The WTSQueryUserToken route the spec actually needs (targetUserToken, internal/aicanary/deelevate_windows.go:~62; startAsUser, internal/aicanary/launch_windows.go:174) is UNEXPORTED and reachable only through that plan. Change C therefore REQUIRES a new exported interactive-session launcher — precisely the 'new token path' the spec's own risks section forbids. The spec must either scope that export explicitly (with its guard: keep VerifyExecutableTrust on the target exe, keep the serviceAccountSIDs refusal at guard.go/deelevate_windows.go:40) or drop C.
- CHANGE B RELAXES TRIPWIRES THE SOURCE MARKS AS NON-RELAXABLE, AND PROPOSES AN UNMEASURED EVENT SEQUENCE. internal/proxy/openai_sse.go:376-380 states 'The pre-existing tripwires TestSSEDenyIsCyberPolicyFatalSSEEvent and TestSSEBlockShapeUnchangedByWarnPath pin this shape deliberately; they are NOT to be relaxed.' The lab record at :311-322 measured output_item.done → response.COMPLETED; the proposal is output_item.done → response.FAILED, which no lab has seen, and the same doc records that response.incomplete reconnect-stormed 6x and a top-level error retried 5x. The merge gate is the right instinct, but the `changes` entries do not mark B as CONDITIONAL on that measurement — an implementer working from `changes` alone will ship it.
- EFFORT IS OPTIMISTIC AT L GIVEN THE ABOVE. With a genuinely new CreateProcessAsUser-from-LocalSystem entry point (an LPE-adjacent surface — a SYSTEM-LPE was caught pre-merge on a comparable path in a prior wave), two hard merge-gate lab measurements (0.134 rendering; live SYSTEM-daemon toast on the interactive desktop), a new hidden CLI verb, and re-pinning two tripwires, this is XL unless B is dropped up front.
- MISSING: internal/notify today imports only internal/logger. Adding usersession_windows.go pulls golang.org/x/sys/windows and (if aicanary is reused) internal/aicanary into notify. There is no import cycle (internal/aicanary imports no internal/* package — I checked), but the new path must honour notify's documented contract at internal/notify/notify.go:36-50: never return an error, never block or gate the decision, always fall through to the log notifier.
- MISSING SEQUENCING NOTE: change A's headers are set inside writeFatalSSE, which on the post-egress panic path (F23) runs against an already-committed response and drops them silently. F23 must merge before F21.


---

## F6 - Codex attestation degrades a capability but names the wrong cause and ignores the lane that is actually governing

- **Severity**: MEDIUM
- **Side**: agent   **Effort**: M   **Root cause verdict**: REVISED

### Root cause

The core honesty behaviour is CORRECT and must be preserved, but three specific things around it are wrong.

(1) THE FAILURE PATH IS CONFIRMED AND IS RIGHT. On a shared-core box, Verify runs in ModeDesktop, whose attested set is exactly {R5-provider-route, R7-hook-cooperative, R8-hook-lifecycle} (requirements.go:263). Client 0.134.0 falls outside knownHookTrustDialects, which contains only the 0.144 family (hookdialect.go:90-99), so classifyHookLedger returns StatusUnknown / ReasonHookTrustDialectUnverified for R7 and R8 (verify.go:454-465), computeVerdict's `anyUnknown` arm fires first (verify.go:596-603), and hooks-status exits 1. That chain is exactly the anti-false-green design and stays.

(2) BUT THE PRINTED REASON IS FALSE. cmd/devoid/ai_codex_hooks.go's CoverageDowngrade branch prints 'Codex binary unknown — posture not attestable' for every unknown except ReasonCodexHomeUnreadable. The binary was NOT unknown: version_discovery read 0.134.0 from the vendor's own package.json, which is precisely how the dialect miss was detected. The operator is told to go looking for a missing binary when the real fact is 'this client build's hook-trust format has never been observed to work'. Those have completely different remedies. A surface that degrades honestly and then mislabels the degradation is still misleading.

(3) AND THE ROLL-UP IGNORES THE LANE THAT IS GOVERNING. The verdict is computed only from the cooperative requirement rows. On this box the WIRE lane (R5) is installed and demonstrably carrying decisions, and the transport-route observation is already computed and printed at ai_codex_hooks.go:363 — then discarded before the verdict. So the one command an operator runs to ask 'is Codex governed?' answers 'not attestable' about a box where the enforcing control is live. That is a lie in the pessimistic direction, and it is a large part of why the owner read the product as broken.

(4) THE 'wire egress route: no decision recorded IS STALE' SUB-CLAIM IS NOT SUPPORTED. I traced the path end to end: openai_wire.go:105-106 wraps BOTH decision seams with withTransportRouteFire/withTransportRouteFireSurface, each of which calls hookFires.record(RuntimeCodex, CheckpointTransportRoute, ...) after every verdict (observed_runtime.go:417-445); the record persists (observed_runtime.go:186-217) and is read live over GET /v1/health/observed (server.go:436). Runtime keys match ('codex', lower-cased on both sides). There is no staleness mechanism. The likelier explanation is chronological: hooks-status was run in the GT phase, hours BEFORE the first proven Codex wire decision at 21:19. Recorded as UNSUPPORTED rather than fixed.

(5) ONE REAL, SEPARATE DEFECT FOUND WHILE TRACING (4): hookFireStore.record calls persistLocked() -> saveHookFireFile() on EVERY decision (observed_runtime.go:216), i.e. a full MkdirAll + JSON marshal + whole-file WriteFile under the store mutex on the hot path of every AI turn on the box, both lanes. Worse, a single write failure sets storeErr, and snapshot() then WITHHOLDS ALL RECORDS (observed_runtime.go:301-308) — so one transient disk error blanks every hooks-status evidence claim on the machine simultaneously.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/codexmanaged/hookdialect.go:89-99 (knownHookTrustDialects = the 0.144 family only)`
- `C:/cwt/Installers/internal/codexmanaged/hookdialect.go:114-130 (hookTrustDialectFor: outside every dialect -> not ok)`
- `C:/cwt/Installers/internal/codexmanaged/verify.go:385-387, 454-465 (dialectClaimable -> StatusUnknown / ReasonHookTrustDialectUnverified)`
- `C:/cwt/Installers/internal/codexmanaged/verify.go:593-624 (computeVerdict: anyUnknown -> VerdictCoverageDowngrade, first arm)`
- `C:/cwt/Installers/internal/codexmanaged/requirements.go:263 (desktopRequirements = {R5, R7, R8})`
- `C:/cwt/Installers/cmd/devoid/ai_codex_hooks.go:394-401 (the CoverageDowngrade branch prints 'Codex binary unknown' for every reason except ReasonCodexHomeUnreadable)`
- `C:/cwt/Installers/cmd/devoid/ai_codex_hooks.go:363 (the wire-route observation is printed) vs :387-414 (the verdict never consults it)`
- `C:/cwt/Installers/cmd/devoid/doctor_observed.go:97-107 (transportRouteObservedSuffix)`
- `C:/cwt/Installers/internal/daemon/openai_wire.go:105-106 (both decision seams wrapped) + internal/daemon/observed_runtime.go:417-445 (record on every verdict)`
- `C:/cwt/Installers/internal/daemon/observed_runtime.go:186-217 (record -> persistLocked on every call)`
- `C:/cwt/Installers/internal/daemon/observed_runtime.go:299-308 (snapshot WITHHOLDS every record when storeErr is set)`
- `C:/cwt/Installers/internal/daemon/server.go:436 (GET /v1/health/observed, token-gated) + cmd/devoid/doctor_observed.go:26-49`

### Fix

Report TWO named lanes with TWO named states instead of one roll-up that can only describe the cooperative layer.

A. NAME THE ACTUAL REASON. In the VerdictCoverageDowngrade branch, dispatch on the reason carried by the unknown rows instead of assuming ReasonUnknownBinary. For ReasonHookTrustDialectUnverified print: 'Codex hook lane NOT attestable — client <observedVersion> is outside every hook-trust dialect DeVoid has observed (measured absence, not a failure). The hooks are installed and may or may not fire; DeVoid will not claim either.' Print rep.ObservedRuntimeVersion inline — the value is already on the Report and is today computed and discarded on this line.

B. MAKE THE WIRE LANE A FIRST-CLASS TERM OF THE VERDICT. reportCodexHooksStatus already has the transport-route record in hand at :363. Print a two-line summary before the verdict: 'hook lane: <state> (<reason>)' and 'wire lane: R5 provider route <installed|missing> · <last carried ts | no decision recorded>'. Then compose the verdict from both, and — critically — keep the exit code non-zero whenever a lane is not attestable, because 'unknown' must not exit 0. What changes is that the message can no longer say 'posture not attestable' full stop when one lane IS attested; it says which lane is which. This is a strictly more precise honest statement, not a softer one.

C. DO NOT WIDEN THE DIALECT PIN. hookdialect.go:30-38 already sets the bar for adding a dialect row (two independent vendor-artefact confirmations) and that bar must hold. The correct handling of version drift is exactly what the file already does — degrade the capability — plus (A) so the degradation names itself. If a 0.134 dialect is ever confirmed by the stated method, it is a data row, not a code change.

D. STOP THE WRITE-PER-DECISION AND STOP THE ALL-OR-NOTHING BLANKING. In hookFireStore, debounce persistence (dirty flag + a periodic flush, plus a flush on daemon shutdown) so a model turn does not carry a synchronous whole-file rewrite. And narrow storeErr's blast radius: a persist failure must not withhold the IN-MEMORY records the daemon observed this run — report the persist error as a distinct field alongside the records ('records are from this process only; the durable store could not be written') rather than converting every observed fire into NEVER FIRED. That preserves the honesty rule (do not present a broken store as evidence) while not destroying evidence the process actually holds.

E. FOREIGN GOVERNANCE KEYS. The 8 keys are already reported honestly at ai_codex_hooks.go:352-354 as '[i] foreign governance key ... (un-attested MCP server took effect)'. Keep the wording, but promote them out of the informational '[i]' marker into a named 'UN-ATTESTED GOVERNANCE IN EFFECT (N)' section — a code-exec MCP server that took effect outside our attestation is a finding, not a note. No logic change.

### Changes

**Installers** - `cmd/devoid/ai_codex_hooks.go`

reportCodexHooksStatus, the VerdictCoverageDowngrade branch (~:394-401): replace the binary `if rep.OverallReason == ReasonCodexHomeUnreadable / else 'Codex binary unknown'` with a switch over the reason actually carried by the unknown requirement rows, adding an explicit arm for codexmanaged.ReasonHookTrustDialectUnverified that names the observed client version (rep.ObservedRuntimeVersion) and states the hook lane — not the whole posture — is un-attestable.

**Installers** - `cmd/devoid/ai_codex_hooks.go`

reportCodexHooksStatus (~:355-370): add a LANES block printed above the verdict — one line for the hook lane (state + reason) and one for the wire lane, built from the R5 requirement row plus the already-computed transportRouteObservedSuffix(fires, daemon.RuntimeCodex) at :363. Compose the final verdict line from both terms. Keep exit 1 for any non-attestable lane; only the wording changes.

**Installers** - `cmd/devoid/ai_codex_hooks.go`

Foreign keys loop (:352-354): group under a 'UN-ATTESTED GOVERNANCE IN EFFECT (N)' header instead of per-line '[i]'. Same strings, same data, higher prominence.

**Installers** - `internal/daemon/observed_runtime.go`

hookFireStore: add a `dirty bool` and replace the unconditional persistLocked() at :216 (record) and :258 (stampDecision) with dirty=true; add Flush() driven by a ticker started in NewServer and called on shutdown. Change snapshot() (:299-308) to return the in-memory records ALONGSIDE a PersistError field instead of returning an empty record set, and update HookFireSnapshot accordingly.

**Installers** - `cmd/devoid/doctor_observed.go`

newHookFireIndex (:60-69): stop discarding all records when StoreError is set; build the index from the records and surface the persist error as a separate, printed caveat. Update the doc comment at :56-58 — 'the durable store could not be written' and 'nothing fired' are different facts and must stop rendering identically.

### Tests (each carries a defeat step)

- Go unit, cmd/devoid: TestHooksStatusNamesTheDialectReasonNotAMissingBinary — build a Report with R7/R8 = StatusUnknown/ReasonHookTrustDialectUnverified and ObservedRuntimeVersion '0.134.0'; assert stdout contains '0.134.0' and 'hook-trust dialect', and does NOT contain 'binary unknown'. DEFEAT STEP: set the reason to ReasonUnknownBinary and re-run — the output must flip to the binary wording. If both inputs produce the same line, the switch is not wired.
- Go unit: TestHooksStatusReportsTheWireLaneSeparately — fixture with R5 installed and a TransportRoute fire record present; assert stdout carries a 'wire lane' line with the timestamp AND a distinct 'hook lane' line, and assert the exit verdict is still false (non-zero) because the hook lane is unknown. DEFEAT STEP: remove the R5 row from the fixture and re-run — the wire line must change to 'missing'. And separately assert that making BOTH lanes attested does NOT flip an unknown hook lane to exit 0; that assertion must fail if someone later relaxes the exit code.
- Go unit: TestDialectPinIsNotWidened — assert knownHookTrustDialects still contains exactly the 0.144 entry and that hookTrustDialectFor('0.134.0') returns ok=false. DEFEAT STEP: add a 0.134 row and confirm the test fails. This is a deliberate tripwire against 'fixing' F6 by widening the pin, which hookdialect.go:16-21 explicitly identifies as the original defect.
- Go unit, internal/daemon: TestHookFirePersistFailureDoesNotBlankObservedFires — set a persistDir that cannot be written, record two fires, snapshot; assert both records are returned AND PersistError is non-empty. DEFEAT STEP: revert to the old withhold-everything behaviour and re-run — the record assertion must fail. Then assert the CLI prints the caveat; a field nobody renders is the same defect in a new place.
- Go unit: TestHookFireRecordDoesNotWritePerDecision — count filesystem writes across 50 record() calls with a stubbed writer; assert far fewer than 50 and that a Flush() produces the complete set. DEFEAT STEP: remove the dirty flag and re-run — the write count must jump to 50. If the stub writer is not actually intercepting saveHookFireFile the count will be 0 in both runs, which is the vacuity to watch for.
- Manual on the live endpoint: run `devoid ai hooks-status codex` and confirm the output names client 0.134.0, names the dialect as the reason, shows the wire lane separately with its last-carried timestamp, and still exits 1. DEFEAT STEP: run it BEFORE any Codex wire traffic in a fresh daemon and confirm the wire line honestly reads 'no decision recorded' — this is also the check that settles the 'stale surface' sub-claim empirically one way or the other.

### Risks

Changing the verdict COMPOSITION is the risk: if the wire-lane term is allowed to make hooks-status exit 0 while a lane is unknown, this fix would create exactly the false-green the file exists to prevent. The exit code must stay non-zero for any non-attestable lane, and the test above pins that. Reviewers should treat any diff that softens the exit code as a rejection.

Debouncing hook-fire persistence means a hard daemon kill can lose up to one flush interval of fire records, turning a checkpoint that fired into NEVER FIRED after restart — the exact loss seedFromDisk exists to prevent (observed_runtime.go:272-275). Keep the interval short (<=30s), flush on shutdown, and flush immediately on the FIRST fire for a given key (the transition from never-fired to fired is the only one worth a synchronous write).

Surfacing in-memory records alongside a persist error slightly relaxes the current all-or-nothing posture. It is still honest — the records are things this process observed — but the caveat string must be printed on every affected surface, not just one, or the relaxation becomes an unqualified claim.

Agent/CLI only; no backend, no contract, no deploy ordering. Old daemon + new CLI: the new PersistError field is absent -> zero value -> today's rendering. New daemon + old CLI: the extra field is ignored by the decoder. Both safe.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- CLAIMS (1), (2) AND (5) ARE PROVEN. Verified: desktopRequirements = {R5ProviderRoute, R7HookCoop, R8HookLifecycle} at internal/codexmanaged/requirements.go:263 (exact); knownHookTrustDialects holds only hookTrustDialect144 (hookdialect.go:~97); hookTrustDialectFor returns ok=false outside every dialect (:119-132); dialectClaimable → StatusUnknown/ReasonHookTrustDialectUnverified at verify.go:385-386 and :458-465; computeVerdict's anyUnknown arm fires first (verify.go:594-606); and cmd/devoid/ai_codex_hooks.go:392-399 prints 'Codex binary unknown — posture not attestable' for EVERY reason except ReasonCodexHomeUnreadable. hookFireStore.record calls persistLocked() on every fire (observed_runtime.go:216) and snapshot() withholds all records when storeErr is set (:301-306). Claim (4) (the 'stale wire route' sub-claim is UNSUPPORTED) is correctly recorded as unsupported.
- CLAIM (3) IS OVERSTATED AND WILL MISLEAD THE IMPLEMENTER. 'the roll-up ignores the lane that is governing / the verdict is computed only from the cooperative requirement rows' is false: R5ProviderRoute IS one of the three desktop requirements (requirements.go:263) and its row DOES feed computeVerdict (verify.go:594-624). What is actually discarded is the OBSERVED transport-route FIRE record — transportRouteObservedSuffix (cmd/devoid/doctor_observed.go:97-107), printed at ai_codex_hooks.go:363 and never consulted by the verdict. The fix (name two lanes, print the wire term) is right; the root-cause sentence must be corrected or someone will go looking for a missing R5 term that is already present.
- CITATION ERROR, REPEATED TWICE. The foreign-governance-key line is cmd/devoid/ai_codex_hooks.go:325 ('[i] foreign governance key: %s (%s)'). The spec cites :352-354 in both the evidence list and the change entry; :352-354 is the codexRows struct literal.
- FIX D CONTRADICTS THREE EXPLICIT DESIGN DECISIONS AND REOPENS A STATE A PRIOR WAVE DELIBERATELY REMOVED. internal/daemon/observed_runtime.go:299-302: 'a partially-readable store must not be presented as evidence that a checkpoint fired.' cmd/devoid/doctor_observed.go:55-58: 'a store failure must render NEVER FIRED and never a false last fired.' cmd/devoid/doctor_observed.go:83-86: 'A separate error state would re-open the neutral third answer this whole wave removes.' Surfacing in-memory records alongside a PersistError caveat IS that third answer. This is the honesty discipline the product's copy is built on; reject as written.
- FIX D's DEBOUNCE MAKES THE PROBLEM IT NAMES WORSE. persistLocked already CLEARS storeErr on the next successful write (observed_runtime.go:255), and today a write happens on every decision — so a transient disk error self-heals on the very next AI turn, not 'blanks every hooks-status evidence claim' indefinitely as claim (5) implies. Debouncing to a <=30s ticker LENGTHENS the blanking window to a full flush interval. The stated risk (a hard kill losing a fire record) is real too. The hot-path cost is worth fixing, but only with a design that keeps the first-fire-per-key write synchronous (which the spec already concedes) and does not extend storeErr's lifetime.
- MISSING CHANGE THAT IS THE ACTUAL INVISIBILITY BUG: observed_runtime.go:252 logs a persist failure at logger.Debug, and the daemon emits no Debug records at all — the identical lesson is already written down at internal/proxy/stream_deadline.go:30-36 ('it was originally logged at Debug, and the daemon emits no Debug records at all, so a silently inert deadline-clear looked exactly like a working one'). The same applies to seedFromDisk's Debug log at :288. Raise both to Warn; that, not the withhold relaxation, is what makes the blanking observable.
- FIX B AND FIX C ARE SOUND AND SHOULD BE KEPT VERBATIM. Fix C matches hookdialect.go:19-21 and :106-113 ('the answer is not to widen the pin ... it is to stop the pin from being able to claim things it has not observed'), and TestDialectPinIsNotWidened is a good tripwire. Fix B's insistence that exit stays non-zero for any non-attestable lane is the load-bearing constraint and the spec is right to say any diff softening it is a rejection.
