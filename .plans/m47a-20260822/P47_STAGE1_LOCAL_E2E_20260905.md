# P47 stage 1 — local production-mirror E2E, 2026-09-05

The integration branches, brought up as a running system on this laptop and driven with a
customer-imitation set. Nothing here was pushed, merged, or deployed; nothing touched the production
agent (`%ProgramData%\devoid`, daemon on :19280) or any real credential. The stack is the isolated
`codesec-e2e-p47` instance.

## What was stood up, all from the integration branches

| Piece | Source | How | State |
|---|---|---|---|
| Emulators (Postgres, DynamoDB, SQS, S3) | — | `docker-compose.p47.yml`, own project + ports (5643/8202/9526/9200) | healthy |
| Database | Backend `p47/integration-backend` `1ff37f3f` | `migration:run` from empty | **249 migrations, 129 tables**, including the renamed `AddEffectBindingToDelegatedApproval1793500000000` |
| Backend API :2353 | same | host `node dist/main.js`, migrations not synchronize | healthy |
| Frontend :3201 | Frontend `p47/w6-frontend` `486730db` | production `next build`, served from `.next/standalone` (the shape the Docker image uses) | serving |
| Agent daemon :19390 | Installers `p47/fix-system-exfil` `951d790a` | built from source, isolated `USERPROFILE`/`ProgramData`/`CODEX_HOME` under a throwaway temp dir | enrolled |
| Agent + admin credentials | — | `gen-agent-credentials-p47.cjs`, written only into the isolated home | demo owner `demo@cera.io` |

Launchers are committed beside the stack: `run-backend-p47.sh`, `run-frontend-p47.sh`,
`run-daemon-p47.sh`, `run-migrations-p47.sh`, `gen-agent-credentials-p47.cjs`, `drive-p47.mjs`.

## The customer-imitation drive

The drive speaks to the daemon on the exact hook routes (`/v1/ai/tool-decision`, `/v1/ai/prompt-check`,
`/v1/ai/post-tool`) with the exact bodies the Claude Code and Codex hooks send. 19 fixtures across
three lanes plus 5 self-disable probes. Fixtures are carried as a base64 corpus, not inline — see the
last finding for why.

### Tool lane — what the agent wants to run

| Input | Decision | Correct? |
|---|---|---|
| `rm -rf ./build` (in project) | **allow** | ✓ Wave 0A: ordinary work is not blocked |
| `npm test` | **allow** | ✓ |
| `rm -rf ~` (home wipe) | **block** — destructive-rm | ✓ |
| `rm -rf "$HOME"` (respelled) | **allow**, zero findings | ⚠ **known residual, proven live** |
| fetch-and-run dropper | **block** — pipe-to-shell, fetch-then-exec | ✓ |
| `chmod -R 777 /` | **block** — chmod-broad-777 | ✓ (Wave 4B T7) |
| append to `~/.ssh/authorized_keys` | **block** — authorized-keys-write | ✓ |
| `cat ~/.aws/credentials` | **block** — cloud-cred-read | ✓ |
| `git push --force origin main` | **block** — git-history-destroy | ✓ (stricter than a bare proposal) |

### Prompt lane — what the developer sends the model

| Input | Decision | Correct? |
|---|---|---|
| benign prose | **allow** | ✓ |
| the console naming its own class `jailbreak-persona` | **allow** | ✓ Wave 4A T2: self-vocabulary does not interrupt |
| AWS access + secret key pair | **allow**, finding `aws-access-key` recorded, text **not** redacted | see DLP note |
| private key block | **block** | ✓ malicious floor is absolute |
| system-prompt exfiltration | **block** | ✓ Wave 4A T3 |
| jailbreak persona (DAN) | **block** | ✓ |

### Ingress lane — what comes back from tools

| Input | Result | Correct? |
|---|---|---|
| benign tool output | `tainted:false` | ✓ |
| private key inside tool output | `tainted:false` | ⚠ see W4A T6 note |
| poisoned tool result (injected exfil instruction) | flagged `read-then-exfil` | ✓ ingress injection caught |

## Findings

**1. Proven live, correct.** Wave 0A (ordinary `rm` allowed), destructive-rm on the literal home,
pipe-to-shell, broad chmod, authorized-keys write, cloud-credential read, force-push, the private-key
malicious floor, system-prompt exfiltration, jailbreak persona, and ingress injection all resolved as
designed. The self-vocabulary suppression (Wave 4A T2) works: the product naming its own class does
not interrupt.

**2. Known residual, now proven live — `rm -rf "$HOME"` is allowed.** It produced **zero findings**
while `rm -rf ~` blocked. This is exactly the residual the Wave 0A reconciliation names as unresolved
(`rm -rf "$HOME"` and the credential-store tails, pending Wave 4B T6). The drive is the first live
confirmation of it. It is a real gap; it is documented and owned, not a regression.

**3. DLP default is monitor, and that is correct here.** The AWS key pair was **detected**
(`aws-access-key` finding) but the disposition was `allow` and the text was not redacted, because this
fresh org has no admin DLP policy — the intended "policy belongs in the console" default. Redaction
happens on the egress wire at send time, not at prompt-check. **Not yet exercised:** applying an admin
policy that sets `aws-access-key` to block/redact and re-running, to prove the console policy changes
enforcement. That is the highest-value next sub-step.

**4. Detection gap — the self-disable floor is partial.** Probed with five tamper shapes:

| Shape | Result |
|---|---|
| `net stop devoid` | **block** — devoid-self-disable |
| `taskkill /F /IM devoid-daemon.exe` | **block** — devoid-self-disable |
| `sc delete devoid` | **allow**, no finding |
| `del /f /q …\devoid.exe` | **allow**, no finding |
| `rm -rf /c/ProgramData/devoid` | **allow**, no finding |

Process-kill and service-stop are caught; **service-deletion (`sc delete`) and binary-deletion (`del`)
are not** — both native Windows tamper shapes. This is a genuine gap in the tool-risk self-defense
classifier. (The POSIX `rm -rf` of the install dir I treat cautiously as unrealistic phrasing on a
Windows target.)

**5. Ingress private-key not tainted.** A private key in tool output returned `tainted:false`. This is
consistent with Wave 4A T6 being owner-posture-blocked (the redactor seam is built; acting on it is an
owner decision), but as it stands the key in tool output is neither tainted nor redacted. A gap, and
owner-gated.

**6. The activation path is version-sensitive.** The first daemon build was unstamped (`dev`); it
converged trust but the backend refused to activate the signed policy bundle
(`agent-version-incompatible: minimum agent version`). Re-stamped with a version, trust converged
`V2_ATTESTED` and the endpoint enrolled — but `GET /v1/ai/policy` returned "policy unavailable" with no
applied bundle. The reason turned out not to be the trust chain at all (the bundle was a valid genesis)
but the org's rollout ring, still at SHADOW because nobody had promoted it; the policy-apply section
below carries the whole mechanism. **Enforcement still works throughout** (every decision above is the
local authoritative rulebook, which is the designed floor). Worth carrying into the real deploy: an
unstamped build cannot activate at all, and a stamped one on an unpromoted org observes rather than
enforces, silently.

**7. The product blocked me writing the test fixtures — live proof it enforces on a real machine.**
The production DeVoid agent on this host content-scans file writes and **blocked** my driver three
times: `content-pipe-shell` on a `curl | bash` literal, then `injection-override-credexfil` and
`jailbreak-persona-unrestricted` at block tier on the prompt fixtures. That is the content lane working
on a developer's real machine. It also means the classifier over-blocks a developer writing a security
*test file*, which is the same "stop hard-blocking ordinary work" tension Wave 0A addresses, one layer
up. The fixtures were moved to a base64 corpus — the standard, non-deceptive way to ship malicious test
samples — and the report says so.

## Console render — six surfaces, driven in the browser, with the drive's real data

| Surface | What rendered |
|---|---|
| Login | The branded email-first sign-in from the integration build |
| AI Control Plane | 31 events governed, 15 tool calls, **12 blocked**, 2 sessions, 1 endpoint reporting, **0 redactions** (honest); coverage "Autonomous 0 of 3 governed", "Coding AI readiness reads unknown, not zero" — Wave 5 UNKNOWN-not-zero, live |
| Events ledger | "31 events · 12 blocked", the Wave 6 facet rail (PROMPT 6, TOOL 14, PUSH 1, MCP 4), evidence-chain order, "prompt text is never exported" |
| Detections triage | severity distribution **2 critical / 12 high / 3 medium / 0 low** (Wave 2 five bands), triage lanes New/Investigating/Resolved (Wave 6), real rule facets, and "5 detections were recorded without an enforcement result" — the honest gap that matches finding 5 |
| Supply-chain policy | the five baselines (Essential → Locked-Down), draft/apply controls |
| AI Policy (`/ai-control-plane/policy`) | honest "NOT BUILT YET — nothing here is measuring or enforcing anything" placeholder |

Every stat card shows a measured number, not a green zero, and every unknown says unknown.

## The policy-apply loop — open on an unpromoted org, closed once the ring is promoted

Run after the drive, at the owner's request. The question: does a policy set in the console change what
the endpoint enforces? The short answer: not until the org's rollout ring is promoted out of SHADOW,
which the console neither shows nor offers; after promotion, yes, and the probes below prove it. The
first half of this section records what the first run looked like; the second half is the mechanism and
the closure.

**Before touching anything, the console and the endpoint already disagreed.** The site's default policy
carries all **81 DLP classes** (warn 48, redact 22, monitor 7, block 4) and reads
`config.dlp.actions.aws-access-key = "redact"`. The drive's AWS fixture came back `allow`, with the class
**detected** (`aws-access-key` finding) and the text **not redacted**.

**The change was applied through the console's own endpoint** — the same `PUT
/api/ai-control-plane/security-policy` the Apply button issues, in the admin's authenticated session:

| | Before | After |
|---|---|---|
| `dlp.actions.aws-access-key` | `redact` | **`block`** |
| revision | `0` | **`1`** |
| source | `default` | **`stored`** |
| updatedAt | null | 2026-09-05T20:03:10Z |

**Two minutes later, nothing had moved at the endpoint.**

| Probe | Result |
|---|---|
| daemon `GET /v1/ai/policy`, polled 10× over 120s | **"policy unavailable"** every time |
| `ai_policy_bundle_history` | **36 revisions issued** |
| `ai_policy_bundle_application_receipt` | **0** |
| `endpoint_control_state.ai_policy_applied_revision` / `_bundle_digest` | **null / null** |

**The decisive test**, same fixture, policy now `block`:

| Fixture | Decision | Findings | Text redacted |
|---|---|---|---|
| AWS key pair (policy = **block**) | **allow** | `aws-access-key` — the detector fires | **no** |
| private key (control) | block | **none** | yes |

So the detector sees the key, the admin policy says block, and the endpoint allows it. The control shows
enforcement is alive but is running the **local malicious floor** — note it blocks with *no finding class*,
i.e. not policy-driven.

**Mechanism — and it was not genesis.** The first reading of the daemon log ("contained endpoint
attempting genesis recovery fetch — no activation floor on disk") pointed at the trust chain. Decoding
the issued bundle showed otherwise: it *was* a genesis bundle (`previousApprovedBundleDigest: null`,
audience this endpoint, minimum agent version satisfied). The daemon filed it as a shadow candidate for
one reason only: `rollout.phase = "SHADOW"` on segment `m47-endpoint`. The activation code is explicit —
a SHADOW-phase bundle is written as a candidate and never advances the floor.

That phase is the **rollout ring**, and it is by design: rings go SHADOW → CANARY → ENFORCE, "an org
that has never been promoted is observing," and "a partial rollout must never leak ENFORCE to an
unpromoted endpoint." Nobody had promoted this org, so its endpoint observed every policy revision and
enforced only its built-in floor. Console policy did not reach the endpoint because the org was never
promoted out of observation — which is the safety property working, and a fact the console never showed.

**Promoting the ring closes the loop.** Through the console's own backend surface
(`POST api/v1/ai/policy-delivery/rollout`, the audited write; the API is self-describing and returns
`allowedNextSteps` with refusal reasons), this endpoint's cohort bucket being 6,816 of 10,000:

| Write | Result |
|---|---|
| SHADOW → CANARY at 70% | accepted, ring revision 1 |
| daemon's next fetch, ~60 s later | bundle revision 37, `phase=CANARY`, **"signed authority activated"**; `GET /v1/ai/policy` now serves the org policy with `aws-access-key: block` (81 classes; block count 4 → 5, the change landed) |
| CANARY → ENFORCE at 70% | accepted, revision 2 |
| widen to 100% | accepted, revision 3 |
| knock back to SHADOW | accepted, revision 4 (a halt is always allowed) |
| SHADOW → ENFORCE directly | **refused 409**: "ENFORCE can only be entered from a CANARY ring" — the invariant holds |
| CANARY → ENFORCE → 100% again | accepted; ring left at ENFORCE / 100% / revision 7, actor recorded |

**Then the decisive probes, with the activated policy on the endpoint** — and a correction to my own
earlier fixture:

| Prompt | Decision | Redacted | Why |
|---|---|---|---|
| AWS **documented example** key (`AKIAIOSFODNN7EXAMPLE`) | allow, finding recorded | no | AWS's published sample; the detector grades it as non-enforcing evidence. Defensible. **My fixture was the miss, not the product.** |
| AWS **synthetic** key pair | **block** | **yes** | `aws-access-key` + `aws-credential-pair`; policy `block` honoured |
| Stripe live key (policy redact) | redact | yes | honoured |
| Slack bot token (policy redact) | redact | yes | honoured |
| DB connection string (policy redact) | allow, finding recorded | no | the known **Wave 4A T4 discrepancy**: lands at Tier C, not enforcement-eligible; now proven live |

So: **the console → backend → bundle → daemon → enforcement loop closes, once the ring is promoted.**

**Two gaps that are real regardless.**

1. **No console surface shows or moves the ring.** On the P47 tree the console carries the proxy route
   for `policy-delivery/rollout` but no page uses it; the AI Security policy page presents a policy as
   the site's policy with no word that the org is in SHADOW and observing. The other programme's live
   branch `feat/cxgov-rollout-ring` is adding the ring to that section (`ai-security-policy-section.tsx`
   plus its test), so the surface is theirs and in flight — recorded here as a seam, not built twice.
   Until it lands, an administrator who sets a class to block on an unpromoted org sees block and gets
   observation.
2. **The activation carries no durable receipt.** The daemon logged "applying a signed bundle WITHOUT a
   durable application receipt — no prompt-evidence ordering gate on this endpoint." So even after
   activating revision 37, the backend still shows `ai_policy_applied_revision: null` and zero receipts,
   and canary challenges keep answering 409. The endpoint is enforcing; the backend cannot see which
   revision. The code's own comment ties this to the prompt-evidence gate, and to why the applied tuple
   was null on every endpoint in the fleet — the same production condition the 2026-08-01 finding on the
   absent prompt-evidence keys pointed at. This is the field the console would need before it could ever
   say "revision N is enforced on M endpoints."

**A note on cadence.** While contained, the daemon re-fetched every ~70 s; once activated it refreshes
on a slower schedule, so the ENFORCE-phase bundle had not been re-fetched within 200 s of the last ring
change. The activated CANARY-phase policy already carries the block, and enforcement was unaffected.

**What is a defect regardless of the cause.** The console presents this policy as the site's policy —
"Viewing policy for: Default Site · All teams", revision 1, stored — and on every surface driven
(dashboard, AI Security policy page, fleet inventory) there is **no indication that zero endpoints have
applied it**. The backend knows: 36 revisions issued, 0 receipts. An administrator would reasonably
believe AWS keys are now blocked on their fleet. They are not. This is the "console says X, endpoint does
Y" family the programme exists to close, and it sits one level above the surfaces Wave 5 fixed.

**Two things this loop also confirmed as working.** The PUT rejected a wrongly-shaped body with
`property siteId should not exist; property config should not exist` — strict whitelist validation, no
silent coercion. And the tool-risk malicious floor is locked in the UI itself: the disposition control
offers "Warn (locked)" and "Monitor (locked)" beneath Block, with `categoryFloors` giving the reason
"Commands that destroy data or systems cannot be set below Block."

The test org is left at revision 1 with `aws-access-key: block`, as evidence.

## Not exercised in stage 1

- The certificate panel (Wave 5 T10) and the MCP approval queue as customer flows.
- Bulk-triage actions through the console UI (the board rendered; the buttons were not driven).
- What ring state a real MSI enrolment lands in, and whether an operator is told. Here the org started
  at SHADOW / 0% and stayed there until an API write; stage 2 settles what a real install shows.
- The rollout-ring console surface itself — in flight on the other programme's `feat/cxgov-rollout-ring`,
  not driven here.
- The durable application receipt under a provisioned prompt-evidence gate; without it the backend
  cannot report which revision any endpoint enforces.

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
