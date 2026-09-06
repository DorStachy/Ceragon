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
