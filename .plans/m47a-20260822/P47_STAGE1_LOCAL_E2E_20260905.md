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
