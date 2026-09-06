# Receipt lane — the durable bundle-application receipt, and why this endpoint never produced one

Lane owner: main session (not an agent). Rig: the P47 stage-1 stack (backend :2353, daemon :19390 from
p47/fix-system-exfil, isolated home %TEMP%\devoid-p47-iso). Date: 2026-09-06.

## What was being tested

Stage 1 closed the policy loop (console policy -> ring promotion -> endpoint enforces) but the backend
still could not say WHICH revision the endpoint enforces: `endpoint_control_state.ai_policy_applied_revision`
stayed NULL, `ai_policy_bundle_application_receipt` had 0 rows, and canary challenges answered 409
AI_CANARY_NO_APPLIED_BUNDLE. The daemon logged at every activation:

    AI policy: applying a signed bundle WITHOUT a durable application receipt
      reason="no prompt-evidence ordering gate on this endpoint"

## Findings

| probe | expected | observed | verdict | evidence |
|---|---|---|---|---|
| Receipt preconditions in the issued policy (macKeyVersion, ackKeySetVersion >= 1) | present | present: macKeyVersion 1, ackKeySetVersion 1, ackVerificationKeys object | VERIFIED | GET /v1/ai/policy promptEvidence |
| Ordering gate exists on the endpoint | gate constructed from the evidence spool | gate is nil because `s.evidenceSpool == nil` (ai_prompt_capture_wiring.go ensurePromptCaptureGate) | GAP (consequence of the next row) | devoid-log-excerpt.txt |
| Endpoint evidence spool opens | opens | refuses to open on every retry since 22:38:12 on 2026-09-05: `load endpoint evidence WAL: endpoint evidence WAL sequence has conflicting event ids` | GAP | probe-open-and-repro.md |
| WAL content | one event per sequence | sequence 4 is held by two different events (MCP_SERVER_BLOCKED at 19:06:16.570Z and at 19:07:05.331Z) | GAP | wal-sequences.txt, endpoint-evidence.wal.poisoned-copy |
| Who wrote the duplicate | one writer per WAL | two daemon processes shared the WAL for 50 s during a graceful restart: old pid 7772 (unstamped build) was asked to stop at 22:05:43, was still walking the inventory at 22:06:33 (`agentVersion=dev`), wrote its last evidence record at 22:07:05.331 with a stale in-memory counter, and logged `Daemon stopped` at 22:07:05.332; new pid 15588 had been serving since 22:06:15 and had already written sequence 4 at 22:06:16 | GAP | devoid-log-excerpt.txt |
| Reproduction | deterministic | two `Open` handles on one directory, three enqueues, third `Open` fails with the same error (temporary Go test, passed, removed) | VERIFIED (defect reproduced) | probe-open-and-repro.md |
| What the daemon says about it | the cause | `endpoint evidence spool unavailable reason=agent-not-enrolled-or-spool-unavailable` every 30 s (>300 times); the load error text is discarded in initEvidenceDelivery | GAP (diagnosability) | devoid-log-excerpt.txt |
| What the backend says about it | the endpoint is evidence-dark | `endpoint_evidence_health.status = healthy, chain_status = healthy`, last_verified_at 21:00Z, while the endpoint has been unable to record any evidence since 19:07Z | GAP (console would show a healthy chain) | backend-rows.txt |
| Evidence lost meanwhile | none | every MCP_SERVER_BLOCKED event since 22:38 dropped: `mcp governance: evidence enqueue failed ... spool-not-enrolled`; post-tool and oracle obligations report the same cause | GAP | devoid-log-excerpt.txt |
| The stage-1 drive already carried the symptom | audit obligation satisfied on every decision | the private-key egress decision (prompt-check, 2026-09-05 drive) answered `obligation:audit:FAILED:spool-not-enrolled` beside `failure-oracle:deny`: the block held (fail-closed) but the audit duty was unmet and nothing flagged it at the time | GAP | %TEMP%devoid-p47-isodrive-results.json |
| Receipt after the spool is healthy | produced on the next activation | PRODUCED: see the recovery and chain section below (three chained receipts, console change reached the endpoint in 80 s) | VERIFIED | RECOVERY_AND_CHAIN.md, recovery-run-*.log, chain-run-*.log |

## Recovery and chain proof (2026-09-06, 00:46-00:52 local)

Scripts: `.codesec-e2e/receipt-recovery-p47.sh` (stop, quarantine, reset floor, start, first receipt) and
`.codesec-e2e/receipt-chain-p47.sh` (two console policy changes, chain, receipts 2 and 3).
Logs: `recovery-run-20260906-004629.log`, `chain-run-*.log`. Everything below is from those logs and psql.

### What the endpoint looked like before (bricked)

| fact | value | evidence |
|---|---|---|
| activated floor | revision 37, issued 20:31:06Z, expired 21:31:06Z (one-hour cap) | aitrust/lkg-bundle.json |
| every bundle issued after it (38-41) | previousApprovedBundleDigest = NULL (genesis-shaped) | ai_policy_bundle_history |
| why the backend issued genesis shapes | endpoint_control_state: report_sequence 55 (reported), applied digest NULL; the backend reads "reported + no digest" as "holds no floor" (ai-policy-bundle.service.ts endpointActivationFloor) | backend-rows.txt, bricked-state-before-recovery.txt |
| why the applied digest was NULL | the activation at 23:31 ran without a receipt (poisoned spool, no ordering gate); the heartbeat only carries the applied tuple when a receipt exists | ai_policy_bundle_receipt.go, ai_integrity_subsystem.go |
| what the daemon did with bundles 38-41 | refused each: `chain-discontinuity: non-genesis activation requires a previous digest` | devoid.log |
| what happened when 37 expired | GET /v1/ai/policy 502 `policy unavailable`; every decision `policy-expired:deny`, including a benign prompt (`please summarise the release notes`) | bricked-state-before-recovery.txt |
| what the backend showed meanwhile | endpoint_evidence_health healthy/healthy; canary requests 409 "has not reported an applied signed bundle" every 2 min | backend-rows.txt, backend.log |

### Recovery, sequenced as an operator would have to

| step | expected | observed | verdict |
|---|---|---|---|
| graceful stop, WAIT for `Daemon stopped` before anything else | old process exits before the new one loads the WAL | `Daemon stopped` after 7 s (no inventory walk in flight this time); port released | VERIFIED |
| quarantine the poisoned WAL (renamed, kept) | fresh WAL on next start | new `endpoint-evidence.wal`, new stream id | VERIFIED |
| reset the activation floor (aitrust/ renamed, kept) = the state a re-enrolment leaves | daemon requests genesis recovery | `contained endpoint attempting genesis recovery fetch: no activation floor on disk` | VERIFIED |
| genesis activation WITH a receipt | `applicationReceipt=true` | `signed authority activated revision=41 phase=ENFORCE applicationReceipt=true` at 00:46:40.624, 0.3 s after start | VERIFIED |
| receipt reaches the backend | row in ai_policy_bundle_application_receipt, applied tuple on the endpoint row | within 2 s: receipt (revision 41, emitter sequence 1), `ai_policy_applied_revision=41`, applied digest set | VERIFIED |
| backend notices the evidence stream changed | some signal | `endpoint_evidence_health = degraded / unexpected-stream-rotation` (the first honest signal in this whole story, and it fires only on the rotation, not on the outage) | VERIFIED (partial signal) |
| endpoint un-bricked | benign allowed, secrets blocked, policy readable | benign `allow`; synthetic AWS pair `block` (aws-access-key:block, aws-credential-pair:block); GET /v1/ai/policy 200 | VERIFIED |

### Chain proof: does a console change now reach the endpoint?

| step | expected | observed | verdict |
|---|---|---|---|
| PUT slack-token redact -> block (console API, admin session) | new revision chained to the APPLIED digest | revision 42 issued with previous = digest of 41 | VERIFIED |
| endpoint activates it | no chain-discontinuity, receipt | `signed authority activated revision=42 applicationReceipt=true` 80 s after the PUT; receipt 2 with previous_application_receipt_id = receipt 1 | VERIFIED |
| endpoint serves the change | slack-token = block | `daemon serves slack-token = block` | VERIFIED |
| restore the original policy | revision 43 chained to 42, receipt 3 | revision 43 (previous = digest of 42) activated 90 s after the PUT; receipt 3 chains to receipt 2; `slack-token = redact` again | VERIFIED |
| decisions with the restored policy | AWS blocks, benign allowed | as expected | VERIFIED |
| positive control from another lane | receipts work on a fresh endpoint | the wire lane's own daemon (endpoint 2c5bf33c, fresh spool) produced receipts for revisions 1-4 and its applied digest is set, with no intervention | VERIFIED |
| transient inconsistency | applied revision and digest move together | at +96 s the endpoint row showed applied_revision 41 beside the digest of 42 for a few seconds; consistent at +190 s | observation |
| canary proof | an endpoint with an applied bundle redeems a challenge | rollup: 16 challenges issued, 0 consumed, 0 endpoints with proof; the daemon's canary loop has a 15-minute cooldown and had not re-requested by the end of the run | NOT EXERCISED |

### The finding, stated once

An endpoint that activates a signed bundle WITHOUT a receipt (no evidence spool, or no prompt-evidence key
generations in the policy, or no governed runtime binding) tells the backend nothing about its floor. The
backend then treats it as floor-less and issues genesis-shaped bundles, which the endpoint must refuse
because it does have a floor. Nothing can break the cycle from either side. One hour later the activated
bundle expires and the daemon fails closed on everything, with the backend still reporting a healthy
evidence chain. Two components, each behaving as designed, brick the developer.

Stage-2 implication: production has never promoted its ring, so no production endpoint has a floor yet.
The last verification of the production task definition (2026-08-01) found the prompt-evidence keys
absent, which means production endpoints cannot produce receipts. Promoting the production ring in that
state would put every enrolled endpoint on this exact path, and they would all fail closed about an hour
after activation. Re-verify the keys and this whole chain on one real endpoint before any promotion.

Local re-run of this rig is now healthy: floor at revision 43, three chained receipts, policy restored.

## The mechanism, in one paragraph

The evidence spool (internal/evidencespool) allocates sequence numbers from an in-memory counter that is
loaded once when the WAL is opened. Nothing takes an exclusive lock on the WAL, nothing re-reads the tail
before an append, and the only process guard is the daemon PID file, which is released when the listener
stops, not when the last background writer exits. A graceful stop lets in-flight sweeps drain (82 s here:
an inventory walk over 1,834 items), and the replacement daemon starts as soon as the port is free. Both
processes then append with independent counters. The loader is strict, so the first duplicate makes every
later `Open` fail, and nothing quarantines or repairs the file: the endpoint is evidence-dark from then on,
silently, with the heartbeat still reporting a healthy chain. Every restart the product performs itself
(self-update loop, MSI upgrade, crash-restart) is an instance of this window.

## Gaps (for the ledger)

1. Restart overlap on one evidence WAL poisons it (duplicate sequence). Two daemons can write the same
   spool; the draining process keeps writing after the replacement has loaded the WAL.
2. A poisoned WAL is permanent: no quarantine-and-reinitialise, no dedupe by event id, no repair path.
   The endpoint stays evidence-dark until someone deletes the file by hand.
3. The cause is dropped: log says "agent-not-enrolled-or-spool-unavailable"; the backend health row
   says healthy. Neither an operator nor the console can tell an evidence-dark endpoint from a healthy one.
4. Knock-on: no ordering gate, so no bundle-application receipt, so `ai_policy_applied_revision` stays
   NULL and canary challenges 409, and MCP governance evidence is lost.

Suggested fix shape (not built): take an OS-level exclusive lock on the WAL directory for the life of
the spool handle (fail Open while another live handle holds it); on `conflicting event ids` at load,
rename the WAL to `endpoint-evidence.wal.poisoned-<ts>` (kept for audit), reinitialise, and emit one
EVIDENCE_WAL_QUARANTINED event on the new stream; log the real load error; carry the spool cause in the
heartbeat so `endpoint_evidence_health.status` can say `spool-unavailable` instead of `healthy`.

## Observation (separate): PATH_FIX_FAILED flood

`tamper.log` in the isolated home grew to 285 KB in two hours: 558 `PATH_FIX_FAILED` CRITICAL events,
one every 11-13 s, message `PATH > 2047 chars on Environment\Path`. The pathwatcher polls the REAL
HKCU\Environment (the registry is not redirected by the rig), the pathfix refuses to write a value over
the Windows 2047-char cap (F-ONB-4, correct), and the watcher re-fires on every poll. A developer whose
user PATH is over 2047 chars would produce the same CRITICAL flood on a real endpoint. They did NOT reach
the backend in this rig: the structured daemon log has no PATH_FIX lines and no mirror post, `system-mirror-state.json`
still reads last_seq 0 with a zero hash, and `ai_events` holds no PATH event. The 558 CRITICAL records exist only in the
local tamper ledger, so on a real endpoint the console would never show them either; whether that is the intended
scope of the local ledger is a design question for the owner, not a rig artefact.

## Setup notes (how to re-run)

- Poisoned WAL copy: `endpoint-evidence.wal.poisoned-copy` (sequence 4 twice).
- Probe tests: see probe-open-and-repro.md; both were temporary files under internal/evidencespool in
  /c/cwt/p47-fix-exfil, run with `go test -count=1 -run TestZZ… ./internal/evidencespool/`, then deleted.
- Log: %TEMP%\devoid-p47-iso\home\.devoid\devoid.log (structured; the console log daemon.log is not it).
