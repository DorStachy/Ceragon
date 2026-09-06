## Stage 1, second pass (2026-09-06): six more lanes, and the one finding that changes the stage-2 plan

Same rig as the first pass (`.codesec-e2e/*-p47.*`), same integration commits under test: Backend
`p47/integration-backend` 1ff37f3f, Frontend `p47/w6-frontend` 486730db, Installers `p47/fix-system-exfil`
951d790a, Static-Worker `p47/w7b-static` fb8b990f, Sandbox-Worker `p47/w7c-containment` 0c34e95. Five lanes
ran as parallel agents against the shared stack, each with its own evidence directory and FINDINGS.md under
`.plans/m47a-20260822/stage1-evidence/`; the sixth (receipt) was run by hand. Every lane carried its benign
twins; every claim below points at a file.

### The finding first: the policy loop closes once, then bricks the endpoint

The first pass ended with the loop "closed after ring promotion". The second pass shows what that closure
was worth: exactly one activation. The chain, each link proven on the isolated endpoint
(`stage1-evidence/receipt/FINDINGS.md`, `RECOVERY_AND_CHAIN.md`):

1. **A restart overlap poisoned the endpoint's evidence log.** The old daemon kept draining an inventory
   walk for 82 s after its graceful stop and wrote one last record with a stale sequence number, 1 ms
   before `Daemon stopped`; the new daemon had already written that sequence. Nothing locks the log,
   nothing re-reads it before an append. Reproduced deterministically in a throwaway test.
2. **A poisoned log is permanent and silent.** The loader refuses the duplicate on every start, nothing
   quarantines or repairs the file, the daemon logs "not enrolled" instead of the real error, and the
   backend's evidence-health row says *healthy*. Evidence was dropped for two hours (blocked MCP servers,
   audit obligations on decisions) with no signal anywhere.
3. **No evidence log means no application receipt.** The endpoint activated the promoted bundle
   (revision 37) with `applicationReceipt=false`, and only a receipt puts the applied revision into the
   heartbeat.
4. **The backend then reads "reported, no applied digest" as "holds no floor"** and issues every later
   bundle genesis-shaped (revisions 38-41 all carry no predecessor). The endpoint has a floor, so it
   refuses each one with `chain-discontinuity`. Neither side can break the cycle.
5. **One hour later the activated bundle expired** (the backend caps bundles at one hour) and the daemon
   failed closed on everything: `GET /v1/ai/policy` 502, and every decision, including a benign prompt
   ("please summarise the release notes"), answered `block` with `policy-expired:deny`. The developer on
   that machine could not use Claude Code or Codex at all. The backend still said healthy; the canary
   loop got 409 "has not reported an applied bundle" every two minutes.

Links 3-5 do not need link 1. Any endpoint that activates without a receipt (no evidence spool, a policy
body without prompt-evidence key generations, or no governed runtime binding) walks the same path.
Production has never promoted its ring, so no production endpoint has a floor yet, and the last check of
the production task definition (2026-08-01) found the prompt-evidence keys absent, which means production
endpoints cannot produce receipts. **Promoting the production ring in that state would fail every enrolled
endpoint closed about an hour after activation.** This is the stage-2 gate: verify the keys and this whole
chain on one real endpoint before any promotion.

**Recovery, and the steady state, proven.** Stopped the daemon and waited for `Daemon stopped`,
quarantined the poisoned log (kept), reset the activation floor (the state a re-enrolment leaves), started
once. The daemon activated revision 41 as genesis with `applicationReceipt=true`; the backend recorded the
receipt and the applied revision within 2 s and flagged the evidence stream as *degraded /
unexpected-stream-rotation* (the first honest signal in the story, and it fires only on the rotation). Then
two console policy changes: revision 42 chained to 41 and activated 80 s after the PUT with a second
receipt chained to the first; the restore produced revision 43 and a third receipt. A synthetic AWS key
blocks, a benign prompt is allowed, the daemon serves exactly what the console holds. A fresh endpoint from
the wire lane produced receipts with no intervention, which is the positive control.

### What each lane proved and what it found

| lane | proven (with benign twins) | gaps | file |
|---|---|---|---|
| **Wire** (provider proxy) | Redaction is real on the egress wire: block-tier prompts (synthetic AWS pair, throwaway PEM, system-prompt exfil) produce **zero** upstream requests; redact-class secrets (Stripe, Slack) arrive as `[REDACTED:<class>]`; a benign prompt arrives byte-identical (hash-equal) and its response returns unchanged; all of it survives SSE streaming; hook lane, Anthropic wire and Codex wire agree on all six fixtures under one policy revision. The proxy's upstream is hardcoded, so the proof needed a loopback-only harness seam kept on its own branch (`p47/wire-lane-harness`, uncommitted, unpushed); nothing reached the internet. | No response-side inspection on either provider lane: a secret and an injected instruction in the model's reply reach the developer verbatim, streamed or not. A `warn` class is not a wire control for automation: without the client's interactive header the body is forwarded byte-identical (documented "degrade to monitor" design; a policy question, not a defect). Ledger rows contradict each other for the same prompt (hook: BLOCK; wire: ALLOW/REDACTED_THEN_SENT), wire blocks record `enforcement_effect=none`, a clean Anthropic allow writes no row. | `wire/FINDINGS.md` |
| **Codex** (hook + config) | The installed shim under real Codex stdin: 21 invocations, exit 0 on every one, 8 enforcing denies in the right shapes, so the inverted contract holds. All 19 fixtures as `agentType=codex`: 0 divergences from the Claude Code lane. **Proven live on the real `codex-cli 0.147.0`**: the jailbreak fixture blocked at UserPromptSubmit, its benign twin completed, no API key entered. The 0.134-vs-0.144 dialect defect is fixed (a 0.134-shaped payload still reaches a class-named block; an unverified marker fails closed). Policy restore proven byte-identical. | R1-R4 in the Codex profile are Go constants; the managed config is byte-identical across an org policy change, so an admin cannot set Codex network / web-search / computer-use / approvals from the console (the known defect, now with a live proof). Self-defence misses, identical on both lanes: service **delete** alone, deleting the binary, removing the ProgramData root; only stop/taskkill fire. Codex warn tier = 30 s stall then hard deny. Codex loses redacted tool output entirely. The lane's "console change never reached the endpoint" is link 4 above. | `codex/FINDINGS.md` |
| **MCP** (control tower) | Writing MCP servers into the isolated Claude config fired the watcher in about 1 s; three rows with the predicted verdicts (benign filesystem: allow; token-shaped env var: block; unknown remote URL: warn); only the wire-safe projection left the box. Console count equals API count. Approving and blocking through the console's own route: the blocked server was **removed from the developer's config** (timestamped backup + stash) and `mcp__<server>__<tool>` calls answered block; the full approval-status matrix matched the documented table. Empty config: no rows, nothing posted. | The real-time watcher parses JSON only, so a **Codex TOML config is invisible** until the six-hourly sweep (confirmed in `mcpgov.DiscoverServersInFile`). `clientId`/`configScope` always NULL; discovery coverage computed but never posted; the console's "runtime effect enforced" column is derived from approval status alone (would read Quarantined for an offline endpoint); removing entries leaves rows live and unmarked; the first tool call per 5-minute window defers when no mode is set. The dropped `MCP_QUARANTINE_APPLIED` evidence is link 2 above. | `mcp/FINDINGS.md` |
| **Console** (triage + certificate) | Note without resolving (stays open, persists, authored); assign to a second admin created through the UI; bulk triage on the backend route reports `selected/applied/unchanged/failed` with `applied+unchanged+failed == selected` and never drops a row; adjudication with two real reviewers plus a third: disagreement keeps the first verdict and marks THIRD_REVIEW, agreement gives AGREED, self-adjudication 400, third actor settles; all 20 writes hash-chained in the audit log; every visible `0` is a measured zero and unknowns read `+11 unknown` / `not graded`. A certificate manifest generated from this stack's real digests renders NOT MEASURED for nulls and UNKNOWN when expired. | **Bulk triage is dead from the console**: the page posts to `events/triage/bulk`, the backend serves `events/bulk-triage` (confirmed in both trees); the console fails honestly with a 404. Wave 6 T9 has **no UI**: a disagreeing reviewer sees no error and no dispute. The certificate panel is **mounted nowhere** (imported only by its own test). Tamper cannot be detected (no signature in schema v2, no verifier). The panel shows a green PASS over five NOT MEASURED bounds. Activity log shows no note author. | `console/FINDINGS.md` |
| **Supply chain** (install gate) | Through the isolated shim against the real workers built from the integration branches: left-pad ALLOW, exit 0, actually installed (real npm fetch, OSV+GHSA+npm scan, 8 s); lodash@4.17.4 BLOCK, exit 1, nothing installed, citing GHSA-jf85-cpcp-j695 (23 s); rows in `analysis`, `fetch_jobs`, `global_artifact_cache` and four DynamoDB cache items; second run is a cache hit (23 s to 1 s, no new worker job). Wave 7C T2 both ways: contained detonation ran 82 telemetry events; uncontained (`direct`) refused with zero execution lines and INCONCLUSIVE / SANDBOX_NO_ISOLATION. No registry token needed. | Cache row for a blocked package reads `verdict ALLOW, riskScore 0` (block re-derived per tenant from cached CVEs; correct, misleading to a reader). No org policy existed, so every verdict used the product default. Local signing off in three places that production enforces. Shim-to-sandbox escalation not exercised: both packages hit the escalator's TRUSTED_CLEAN skip rule (it scores static behaviour and reputation, not CVE severity; by design, badly named), so the sandbox was driven at its own queue with a synthetic tarball. | `supplychain/FINDINGS.md` |
| **Receipt** (by hand) | See above. | Links 1-5 above; the 558-event CRITICAL `PATH_FIX_FAILED` flood in the local tamper ledger for a user whose PATH exceeds 2047 chars (never reaches the backend). | `receipt/FINDINGS.md` |

### Gaps, ranked

P0, blocks stage 2:
- The receipt / chain / expiry deadlock (links 3-5). Fix shape: the endpoint must report its applied
  floor even without a receipt (the posture tuple already exists; it is only filled when a receipt
  exists), and the backend must stop reading "no digest" as "no floor" when the endpoint keeps refusing
  with chain-discontinuity. Whether an expired bundle should fail closed on a benign prompt is an owner
  decision; today it bricks the developer.
- The evidence log poisoning and its silence (links 1-2). Fix shape: an OS-level lock on the spool for
  the life of the handle; quarantine-and-reinitialise on `conflicting event ids`; log the real error;
  carry the spool cause in the heartbeat so the health row can say `spool-unavailable`.
- Bulk triage 404 (one path string on one side).

P1, ship-blocking for the feature they belong to:
- No response-side inspection on the provider proxy.
- Codex R1-R4 constants (console cannot set them).
- Self-defence: delete verbs unguarded on both lanes (plus `rm -rf "$HOME"` from the first pass).
- Codex TOML MCP configs invisible to the watcher.
- Wave 6 T9 without a UI; certificate panel unmounted and unverifiable.

P2, correctness of what the console shows:
- Ledger contradictions between hook and wire rows; wire blocks with `enforcement_effect=none`.
- MCP rows never marked removed; runtime-effect column inferred from approval status.
- Certificate PASS over NOT MEASURED; no note author in the activity log.
- Cache rows reading ALLOW for blocked packages; TRUSTED_CLEAN naming.

### Not exercised in the second pass

Real TLS interception on the wire (needs a machine-root CA); `failMode=open`, uploads, egress allowlist,
allow-once; the WebSocket transport (426 by design); Codex PreToolUse under a real `codex exec` (403 at
the proxy without credentials; the shim covered it); `surfaces.mcp=block`, allowlist mode, auto-enforce
HOLD, restore-on-drift, IDE-extension quarantine; bulk triage through the UI (dead route); tamper
rejection of a certificate (nothing to verify against); canary proof after recovery (15-minute cooldown
not reached); whether the PATH flood is meant to stay local.

### Repositories pulled and integration branches brought up to main

All eight `main` branches were fast-forwarded to `origin/main` without switching any live checkout
(Backend and Frontend live checkouts sit on other people's branches; their `main` refs were updated in
place). Each integration branch then received `origin/main` as a merge commit in its own worktree:

| repository | integration branch | before -> after | conflicts | verification on the merged tree |
|---|---|---|---|---|
| Backend | `p47/integration-backend` | 1ff37f3f -> 6453bc02 (9 commits) | 1: `src/common/errors/error-code.ts`, both sides appended codes; both kept. Git hoisted the shared `/**` line above the block, so a naive concatenation dropped one comment opener; caught by tsc, fixed, amended | tsc clean; jest on src/agents, src/common, src/auth, src/audit, the bundle service spec and the contracts guard: 107 suites, 1,588 tests, 0 failures |
| Frontend | `p47/w6-frontend` | 486730db -> 3ad35a28 (5 commits, brings the delivery-ring surface and the shared uninstall modal) | none | tsc clean; jest on app/endpoints, app/admin, components/admin, app/api/ai-control-plane: 135 suites, 1,256 tests, 0 failures (one suite failed once under load, passed alone and on the rerun) |
| Installers | `p47/fix-system-exfil` | 951d790a -> f6148c37 (38 commits: Codex hardening, self-uninstall on a deregistered heartbeat, Windows daemon self-repair, install-brick fixes) | none | go build ok; go test on daemon, codexmanaged, uninstall, core, evidencespool, proxy, mcpgov, cmd/devoid: first run red only where the box was saturated (a 10-minute package timeout, timing tests); every red package passes when rerun alone |
| Static-Worker | `p47/w7b-static` | fb8b990f -> de656fae (1 commit: sha256 as raw hex, the artifact cache key) | none | jest 4,192 of 4,193; the one red is the veto gate refusing this branch's re-banked recall baseline (CATCH_BASELINE.json), which is the human decision already on the owner list |
| Sandbox-Worker | `p47/w7c-containment` | 0c34e95, already at main | none | not re-run (nothing changed) |
| Scanner worker | `p47/integration-scanner` | 04309b9, already at main | none | not re-run (nothing changed) |
| Ceragon-Intelligence | `p47/w7c-platform` | 93c818c -> ff424a6 (3 commits: hot-set gates) | none | jest: 66 suites red on the merged tree AND 4 of 4 sampled suites red on origin/main alone in this environment, so not a merge effect; the vendored contracts need a rebuild after the merge |
| docs | `p47/w8-claim-docs` | e26ac2f -> e1528aa (2 commits) | none | documentation only |
| workspace root | `feat/push-depth-cli-ui`, on throwaway branch `p47/root-main-merge` | ec6dd8f + origin/master 6141077 -> d942cd4 (66 commits) | 26 files, all add/add: both branches created `ci/` and `.plans/m47a-20260822` independently. Resolved from an approximate three-way merge; the two claim-contract programs are different tools with one name, so master's guard lives on as `ci/lib/claim-contract-guard.mjs`; our rebase-manifest generator gained master's CLI flags so master's self-test passes | with the seven repositories junctioned beside the worktree: drift, vocab-parity (+test), claim-contract-guard (+test), both rebase-manifest self-tests, vendored-engine-parity, standards-schema, plan-citations, workflow-header-truth self-test all pass; our own claim-contract guard fails exactly as before the merge (Wave 8 Task 11's renderer is not on Installers main); workflow-header-truth reports three stale trigger claims in Installers workflow headers |

Nothing was pushed, merged to any main, or deployed. The throwaway root branch cannot be fast-forwarded
into the live checkout until the other session commits or drops its edits to `W1_CALLSITE_AUDIT.md`,
which the merge also touches.

One accident to own: removing three temporary baseline worktrees followed their `node_modules` junctions
(the exact hazard already on record) and emptied two dependency trees, one of them in the live
Ceragon-Intelligence checkout together with its vendored contracts directory (29 tracked files). Both
were restored, from the lockfiles and from git, before the verification runs above; the Frontend batch
was rerun after the reinstall.

The workspace root's own branch (`feat/push-depth-cli-ui`, 153 ahead / 66 behind `origin/master`)
conflicts on seven plan files that both sides added, and its live checkout carries other sessions'
uncommitted work, so that merge was done on a throwaway branch in a separate worktree; see the table.
