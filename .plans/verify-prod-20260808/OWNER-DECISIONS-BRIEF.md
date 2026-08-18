# Owner decisions — the seven calls blocking the push

Section B of [OPEN-REGISTER-TO-DONE.md](OPEN-REGISTER-TO-DONE.md), plus one item raised after that register was
written. Each is blocked on a judgement call, not on work.

Read the bold line under each **Recommendation** if you read nothing else. Every option below already respects the
standing rules: **no feature flags** (nothing ships off, gated, or in shadow), **no capacity spend and no latency
gate** at pre-customer stage, **a screen never claims more than it knows**, and **no in-house rationale in the UI**.

**Three of the seven turned out to be already decided in the repo.** Those are marked ALREADY DECIDED and need a
confirmation, not a decision.

| # | Item | Blocks the push? | One-line recommendation |
|---|---|---|---|
| 1 | Shared-contract parity | No | Take Intel's value on all three real divergences; delete the orphan copy |
| 2 | F36 Stage 2 | No | Ship Stage 1; build the corrected Stage 2 already written in the spec |
| 3 | F16 credential split | No — **blocks the MSI** | Elevation-gate the mint; do not split the credential this wave |
| 4 | C11d-2 abandoned queue | No | Add the one alarm that needs no threshold |
| 5 | F11 | No | ALREADY DECIDED — do not fix in code; confirm and close |
| 6 | overview-strip / guard-health | No | Draft spec below; seven assumptions need your ruling |
| 7 | `actor` raw or hashed | No | Keep it raw; it is not what the contract forbids |

**None of the seven blocks the push.** Item 3 is the one that must be settled before the agent MSI is cut, and it is
the only item that can cause permanent damage in the field.

---

## 1. Shared-contract parity — which of the nine divergences are intended?

**The question.** Nine mirrored contract files differ between the two copies of `@ceragon/shared-contracts` — which
differences are deliberate design, and which are accidents to be corrected?

**Why it is open.** The project treats the two copies as a mirror that must be kept in step, but nobody has ruled on
what the current differences mean. In fact **six of the nine differ only in comment banners and line endings**, and
**there is a third copy nobody accounted for** — `packages/shared-contracts/` at the workspace root, which
`Backend/package.json:59` does *not* use (Backend builds `Backend/packages/shared-contracts/` via
`Backend/package.json:6`) and which no other manifest in the workspace references either.

### What actually differs

Comparing the two copies that really ship — `Backend/packages/shared-contracts/` and
`Ceragon-Intelligence/packages/shared-contracts/` — and ignoring comments and line endings, **only three files
differ, and only three lines in total**:

| File | Intel says | Backend says | Which is right |
|---|---|---|---|
| `package-intelligence/s3-layout.ts` | buckets end `-raw` / `-meta` / `-snap` | `-raw-artifacts` / `-extracted-metadata` / `-verdict-snapshots` | **Intel** |
| `package-intelligence/verdict.types.ts` | `current: 'Y' \| 'N'` | `current: boolean` | **Intel** |
| `package-intelligence/engine-generation.ts` | `CursorRow.version?: number` | field absent | **Intel** |

The other six — `alias.types.ts`, `hotset.types.ts`, `index.ts`, `install-state.ts`, `queue-messages.ts`,
`table-names.ts` — are **byte-for-byte equivalent in meaning**. Their only differences are decorative comment
banners and CRLF-vs-LF line endings.

### Why Intel is right on all three, and why this is not a design disagreement

Git dates settle it. Backend's entire copy was created in a **single** commit — `ef1584e9`, 2026-06-08, *"vendor
@ceragon/shared-contracts so Backend builds standalone (unblocks deploy)"*. Intel's three files each carry a
deliberate, dated fix that is **older** than that vendoring:

- `s3-layout.ts` — `3a9a83c`, 2026-04-03, *"align S3 bucket suffixes with Terraform"*.
- `verdict.types.ts` — `a3fa4d2`, 2026-06-03, *"race-safe single-pointer verdict-of-record + **string Y across all
  writers/readers**"*.
- `engine-generation.ts` — `6a980ba`, 2026-04-08, CVE-watchdog advisory-sync fixes.

So the June vendoring should have picked all three up and did not — because it copied from the **workspace-root
orphan**, not from Intel. That is confirmable: the orphan is semantically identical to Backend's copy on all nine
files. **None of the three divergences is an intended design difference. All three are the same accident — one
snapshot taken from the wrong source.**

Each of the three is independently corroborated:

- **Bucket names.** `docs/Ceragon_Intel/09_S3_BUCKETS.md:17,25,34` names the real production buckets
  `…-production-raw`, `…-production-meta`, `…-production-snap`. Backend's longer names describe buckets that do not
  exist.
- **`current`.** Intel writes the literal string `'Y'` because it is a DynamoDB sparse-index key — a boolean cannot
  be one (`Ceragon-Intelligence/src/runtime/write-current-verdict.ts:15`). Backend's own runtime code already knows
  this and works around its own contract: `Backend/src/package-intelligence/services/verdict-alias-lookup.service.ts:124-125`
  hand-rolls a local duplicate declaring `current: 'Y' | 'N'`, with a comment saying it *"Mirrors
  @ceragon/shared-contracts ArtifactVerdictRow"* — which it does not, because the contract next to it says
  `boolean`.
- **`CursorRow.version`.** Intel uses it for optimistic concurrency
  (`Ceragon-Intelligence/src/advisory/advisory-sync-runner.ts:141,199,440`). It is an additive optional field;
  Backend consumes neither `CursorRow` nor `ArtifactVerdictRow` from the shared package at all.

**Nothing is on fire.** Only Intel imports `S3_BUCKETS`, so Backend's wrong bucket names are unreachable today, and
Backend's `boolean` is already routed around. This is a live landmine, not a live outage.

### Options

**Option A — Take Intel's value on all three; delete the workspace-root orphan.**
Cost: three one-line edits in `Backend/packages/shared-contracts/`, plus deleting a directory nothing builds.
Risk: near zero. The `boolean` → `'Y' | 'N'` change makes Backend's contract agree with the local duplicate its own
code already uses, so no behaviour moves. Deleting the orphan removes the source that caused this.

**Option B — Take Intel's value on the three, keep the orphan.**
Cost: the three edits only. Risk: the next person who vendors from the workspace root re-introduces all three
divergences, exactly as June did. This defect returns.

**Option C — Declare the three intended and write them down.**
Cost: a paragraph. Risk: you would be declaring that Backend should name buckets that do not exist and type a
sparse-index key as a boolean. Not defensible on the evidence.

**Option D — Do nothing.**
Cost: none now. Risk: the day anything in Backend reads `S3_BUCKETS` or the shared `ArtifactVerdictRow`, it silently
addresses non-existent buckets or mis-reads every verdict row's currency flag.

### Recommendation

**Option A. All three divergences trace to one commit that copied from the wrong source, so there is no design
question to settle — only a stale snapshot to correct and an orphan to remove so it cannot happen a third time.**

Also worth correcting while you are here: `CLAUDE.md` states `packages/shared-contracts/` is *"used by Backend"*.
It is not, and that sentence is what makes the orphan look authoritative.

### What happens if we defer

**Does not block the push.** No shipping code reads the three divergent values today. But do not defer the *orphan
deletion* past this wave — the orphan is the mechanism, and leaving it means re-litigating this.

---

## 2. F36 Stage 2 — the console panel that would show a wrong answer

**The question.** F36 Stage 2 would tell you, per endpoint, whether the policy it is enforcing matches the policy you
authored. Written as specified it computes that answer incorrectly and performs a write inside a read. Do we drop it,
build it as written, or build the corrected version?

**Why it is open.** `IMPLEMENTATION_PLAN.md:359-360` records the objection — Stage 2 calls
`getPolicyForOrg(..., null)`, which *"drops the team fold and calls `ensureAckSigner` — a key-mint **write** — inside
a `GET`"* — and no one ruled on what to build instead, so the item sat.

### What I could and could not confirm in the current source

**The team-fold defect is confirmed.** `Backend/src/ai-governance/services/ai-policy.service.ts:249-267` takes an
`agentId` and passes it straight to `resolveEffectiveForEndpoint(orgId, siteId, agentId)`. Its own comment at
`:254-259` says that argument is what *"fold[s] the endpoint's Team tiers strictest-wins"*, and that omitting it
*"resolves to the site policy exactly as today"*. So passing `null` provably computes the **wrong** policy for any
endpoint that belongs to a team — it computes the site policy and then compares it against what the endpoint is
actually enforcing, which is the team-folded one. Those will not match, and the panel will show a mismatch that is
not real.

**The key-mint-write defect I could not verify here, and you should know that.** `ensureAckSigner` does not exist
anywhere in `Backend/src`, `ai-policy.service.ts` is 301 lines long (the objection cites line 564), and there is no
`protection-depth` route in this checkout. The Backend working copy sits on `fix/remote-uninstall-command-timeout`,
so that code is presumably on one of the twelve unmerged branches. Treat that half as asserted-not-verified.

**Neither is the strongest reason to change course.** The spec's own reviewer found a third problem that stands on
its own, at `fix-specs/FRONTEND.md:281`: the digest Stage 2 would compare **is not byte-comparable** with the one the
minter produces, because the minter resolves per-endpoint and Stage 2 resolves per-scope. The panel would therefore
render a **permanent false red** — every endpoint reported as diverged, forever, on a fleet that is actually fine.
And `FRONTEND.md:282` notes the spec contradicts itself on cost: the only correct form is per-endpoint, while the
spec instructs computing it once per response.

**A corrected design already exists and is fully written.** `fix-specs/FRONTEND.md:290` specifies replacing the
digest comparison with a freshness comparison: serve each endpoint's effective-policy `updatedAt` for the scope that
endpoint actually resolves to, and compare it against `receivedAt`, which the view already carries. It needs no
digest, no policy re-resolution, no write, and no join — and it *"can only err toward not-proven, which is the safe
direction under the honesty rule."*

### Options

**Option A — Ship Stage 1 only; drop Stage 2.**
Cost: none beyond what is built. Risk: the console shows what each endpoint applied and when, but never answers
"is that current?". During the normal 5–30 minute propagation window a reader cannot distinguish "still catching up"
from "stuck", so a genuinely stuck endpoint stays invisible.

**Option B — Ship Stage 1, then build the corrected Stage 2 from `FRONTEND.md:290`.**
Cost: one backend read-model addition (`updatedAt` per endpoint's resolved scope) plus the panel copy. No new write,
no digest computation, no per-endpoint policy resolution. Risk: a no-op policy edit that touches `updatedAt` reads as
"not yet proven current" — an over-cautious answer, never a falsely reassuring one.

**Option C — Build Stage 2 as written.**
Cost: the spec as drafted. Risk: concrete and severe — every team-scoped endpoint renders permanently diverged
(false red across the fleet), and a key-minting write lands inside an existing production GET.

**Option D — Build Stage 2 as written but fix only the digest to be per-endpoint.**
Cost: Stage 2 plus N policy resolutions per response on a route that previously did none. Risk: fixes the false red
and the team fold, but keeps the write-inside-a-GET, and is the one option that spends real work per request.

### Recommendation

**Option B. The corrected design is already specified at `fix-specs/FRONTEND.md:290`, it answers the same customer
question, and it is the only option that cannot produce a confidently wrong number.**

One gap to close when it is built: `FRONTEND.md:284` and `:296` flag that the panel's **read gate is unstated** — say
which roles see it, and make a reader without access see an explicit "not readable at your role" rather than an empty
panel that looks like a clean result.

### What happens if we defer

**Does not block the push.** Stage 1 is additive, read-only frontend on an already-deployed route and can ship alone;
it is described as *"the honest intermediate state"*. Stage 2 can follow in a later wave.

---

## 3. F16 — the credential split, and the one change that can permanently brick endpoints

**The question.** The endpoint's signing private key currently sits in a file any local user can read. F16 would move
it. Before that ships, someone must decide **where the key-minting code writes after the move** — and that decision
determines whether the fix is safe or bricks endpoints permanently.

**Why it is open.** `F16-SAFETY-ANALYSIS.md:338` closes with the verdict *"STILL OPEN"* and *"do not build F16 in
Wave 4 on the current understanding"*, because the design document specifies a new save function without saying
whether the mint site at `trust_anchor_client.go:248` is repointed at it — *"Nobody has decided this, so nobody can
currently say whether F16 bricks the fleet."*

### The failure mode, in plain terms — read this first

An endpoint proves who it is with a signing key. The backend stores that key against the endpoint's row. If an
endpoint ever mints a **new** key and presents it while the backend still holds the **old** one, the backend answers
**409** — "rotation requires the approved rotation protocol". And there is **no retry limit and no latch**
(`F16-SAFETY-ANALYSIS.md:2c`): the agent re-presents the same losing key **every 30 minutes forever**. That endpoint
can never re-establish trust again. Not degraded — **permanently dead**, recoverable only by touching the machine.

This is not hypothetical. It already happened: every MSI install/upgrade/repair used to wipe the key, and the
documented result was exactly this permanent 409 (`cmd/devoid/setup_installer.go:170-178`).

### What the analysis and the live measurement now agree on

They agree on the whole reachable path — the analysis predicted it, the production gate then measured it:

1. **The credential file is readable by any local user.** `MachineLocalReadSDDL` grants `BUILTIN\Users` read
   (`internal/winacl/machine_secret_windows.go:68`), and the gate measured a non-elevated user both **reading**
   `credentials.json` and **creating files in its directory**.
2. **Therefore the only gate in front of the mint passes.** `trust_anchor_client.go:223` admits a caller if
   `HasValidRequestSigningV2()` is true — and that checks the *request-signing* credential, which is the readable
   one. It says nothing about the AI signing key.
3. **A blocked read looks identical to "no key exists."** `Load()` swallows the permission error and returns success
   (`internal/core/config/config.go:374-376`), so the identity arrives `nil` — and `nil` is exactly the input that
   fires the mint at `trust_anchor_client.go:243`. The analysis flagged that the plan had this **wrong in the
   optimistic direction**; the gate confirmed the analysis.
4. **The number that would have exposed all of this is a constant.** `storageAssurance` is hardcoded `OS_PROTECTED`
   (`internal/core/config/ai_trust.go:17`), so the health measurement can only ever report "protected".

**The agreed conclusion: a non-elevated process can reach the mint today.** And critically — the split as currently
designed **does not close this**. Register A1 states it plainly: moving the key to a SYSTEM-only file while leaving
`credentials.json` readable *"still lets the non-elevated shim pass `:223` and arrive at `:243` with a nil identity.
It still mints."*

### The remaining fork

**Where does the mint's save call write after the split?** Three plausible wirings, three different outcomes:

| Wiring | What happens | Result |
|---|---|---|
| Save targets the SYSTEM-only file and fails cleanly | Mint fails before the key is presented | Safe — degrades, no 409 |
| Save writes one scope and fails the other | Half-written state, then presents | Partial — may 409 |
| Save succeeds locally and the key is presented | New key meets old backend row | **Permanent 409. Endpoint bricked.** |

Two further facts bound any option you pick. The reader inventory is **five** entry points, not the one the plan
names — `devoid install-package` and `devoid setup enroll` appear in neither the plan nor the design doc, so a guard
keyed on the shim alone **ships with two live holes**. And four of the five funnel through `performEnrollment`
(`cmd/devoid/main.go:6715`), which is the place a guard actually catches them.

### Options

**Option A — Ship the credential split as designed.**
Cost: the planned Wave 4 work. Risk: **the brick, and it does not even close the exposure.** The non-elevated path
still reaches the mint, and which of the three wirings you land on is currently undecided — so this is the one option
where nobody can state the outcome in advance. Endpoints that mint against a stale backend row die permanently.

**Option B — Elevation-gate the mint; do not split the credential this wave.**
Cost: **one line**, using a primitive that already exists a hundred lines away. `canPersistUnsignedEnrollmentRecovery`
(`cmd/devoid/main.go:6707-6713`) already makes exactly this decision for exactly this class of problem, via
`!config.IsSystemInstall() || uninstall.IsElevated()`. Applying it in front of the enrol-time convergence closes four
of the five reachable paths. Risk: on a machine-scope install, a non-elevated user no longer converges trust inline —
it happens on the daemon's next pass instead. That is a **latency** change, not a capability loss.

**Option C — Remove shim-side convergence entirely; let the daemon do it.**
Cost: nothing to build; the daemon path already exists and is tested
(`internal/daemon/ai_trust_converge_test.go:54`). Risk: convergence waits up to 30 minutes
(`internal/daemon/ai_trust_converge.go:26`) — **and if the daemon is not running, it never happens at all.** That
must be measured before choosing this, not assumed.

**Option D — Build the daemon broker (D3): the shim asks the privileged daemon to converge.**
Cost: a new route, a client helper, and a new IPC surface. Risk: the analysis is blunt that the broker's
authentication is **weaker than the boundary F16 is building** — the daemon token is itself readable by local users,
so the broker would become a local-user-triggerable mint. This option adds attack surface to fix an attack surface.

**Option E — Defer F16 entirely; change nothing.**
Cost: none. Risk: the endpoint signing private key stays readable by every local user on every installed machine.
No brick risk, but the CRITICAL stays open indefinitely.

### Recommendation

**Option B, plus one companion change: refuse to present a freshly minted key when the machine already shows a prior
attestation under a different key id. The elevation gate closes the paths that reach the mint; the refusal makes the
brick unreachable even if some future path gets there anyway.**

The single reason: **Option B is the only option that reduces the brick risk using a primitive already written and
reviewed in this codebase, and it does so without deciding the unanswered question at all.** The unresolved fork is
"where does the save write after the split" — Option B does not split, so the fork does not need answering this wave.

Two things to hold firm on if you pick B:

- **The guard must sit at `performEnrollment`, not at the shim.** Four of the five entry points funnel through it; a
  shim-keyed guard misses `install-package` and `setup enroll`.
- **Do not ship the split as a partial.** Register A1 is explicit that the five defects are one mechanism and that
  fixing them separately is cosmetic. Leaving the file readable while moving the key changes nothing.

### What happens if we defer

**This does not block pushing the existing commits — F16 was never built — but it does block cutting the agent MSI,
and it is the only item on the register that can cause permanent, unrecoverable damage in the field.**

Deferring is a legitimate choice (Option E) as long as it is chosen rather than drifted into. What is *not* safe is
shipping the split without answering the fork. Note also that the self-repair pass that would fix the file
permissions is reachable only through an admin-only subcommand (`cmd/devoid/main.go:8120`), and the **lite** install
mode is the one most likely to skip it — so the exposure does not heal on its own.

---

## 4. C11d-2 — a queue nobody is reading, and nothing says so

**The question.** The verification row for "an abandoned queue raises a signal" reports no verdict, on the correct
reasoning that a threshold guessed from two data points would be fake. Nothing else raises either. **Is a silent
abandoned lane acceptable?**

**Why it is open.** `S10-GATE-RESULTS.md:184-188` records the verdict as `NOT_EVALUATED` with a deliberately null
threshold, because a number from an n=2 sample would be *"a guess wearing a number's clothing"* — then adds
*"Defensible; but nothing else raises either, so the lane is silent."* Nobody ruled on whether that silence is
tolerable.

### What is actually true

**The reasoning behind the null threshold is right, and should not change.** The discriminating measurement is a
CloudWatch metric with no local substitute, and reporting it as not-measured rather than inventing an age is exactly
what the honesty rule requires. **Do not "fix" the verdict.**

**The silence is real and complete.** The lane is `codefence-scanner-fullrepo-jobs.fifo`; its only consumer, the ECS
service `codefence-scanner-worker-fullrepo`, is at **desired 0 / running 0**. Measured behaviour: two messages
enqueued 2026-07-29 sat until their age reached **16.3 hours** before anything received them. And:

- **No alarm covers it.** `AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:1067-1069`: *"There is no checked-in fullrepo DLQ
  alarm."* `:1080`: *"No composite alarm existed."* Nothing anywhere alarms on message age.
- **The one in-app age check is structurally dead.** `Backend/src/packages/services/fastgate.service.ts:130` has an
  oldest-age branch, but its only producer hardcodes the value to zero
  (`Backend/src/jobs/job-queue.service.ts:666`), and never even requests the age metric. That branch cannot fire.
  *(Separate defect, worth fixing cheaply.)*
- **The only liveness test in the whole path is a config fact.** `scan-dispatch.service.ts:931` asks whether a queue
  URL string is set — never whether anything is reading it.

**The customer-visible harm is worse than "delayed".** With `maxReceiveCount=3` and 96-hour retention, a message
that is never *received* never increments its receive count, so it **never reaches the dead-letter queue**. Past 96
hours the work is **silently discarded**. The DLQ protects against poison messages, not against an absent consumer.
A customer's full-repo scan disappears and nothing, anywhere, says so.

### The smallest change that makes an abandoned lane noisy without inventing a threshold

**Alarm on the conjunction of two measured facts: messages are visible **and** the consumer's running count is zero.**
That is not a threshold — it is a structural contradiction. "There is work queued and nothing is running to do it" is
a fact about the system's shape, and it needs no judgement about how long is too long. It cannot be tuned wrong
because there is nothing to tune. This is precisely the alarm `fix-specs/BACKENDOPS.md:827` already proposes, and the
one the infrastructure record confirms was never created.

One detail that matters: set it to treat missing data as **breaching**. The existing alarm set uses
`notBreaching`, which means silence reads as health — the exact failure being discussed.

### Options

**Option A — Accept the silence. Change nothing.**
Cost: none. Risk: a lane can stay abandoned indefinitely and quietly bin customer scans after four days. You would
find out from a customer, not from us.

**Option B — Add the consumer-less alarm (visible messages AND zero running consumers).**
Cost: one CloudWatch composite alarm; ops config, no code, no capacity. Risk: essentially none — it fires only on a
state that is unambiguously wrong. It will not tell you a *slow* lane, only a *dead* one.

**Option C — Add an oldest-message-age alarm at 900 seconds.**
Cost: one alarm, plus the metric actually being requested. Risk: 900s is a real choice, but it does **not** come from
the n=2 sample — `BACKENDOPS.md:799` derives it as *"well under the 16.3h observed and well above normal drain"*.
Still, it is a number someone picked, and a wrong pick either nags or sleeps.

**Option D — Both B and C.**
Cost: two alarms. Risk: B catches "nobody is home", C catches "home but not keeping up". Together they cover the
lane properly.

**Option E — Derive a threshold from the two observed messages.**
Cost: low. Risk: the thing the gate correctly refused to do. A number with no evidence behind it reads as measurement
and is not one.

### Recommendation

**Option B now, Option C when the age metric is actually being collected. The single reason: "there is work queued
and no consumer running" is a fact, not an estimate — so it is the one signal that makes an abandoned lane loud
without anyone inventing a number.**

Keep the `NOT_EVALUATED` verdict and the null threshold exactly as they are. They are honest, and the fix belongs in
the alerting, not in the verdict.

Worth knowing before you decide: the fullrepo service **cannot scale up even if alarmed** — its scaling maximum is
zero (`AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:1252`, `:1487`). The alarm tells you the lane is dead; restoring it is a
separate ops action.

### What happens if we defer

**Does not block the push.** This is alerting configuration, not shipped code, and it belongs with the other
owner-executed AWS items in section C of the register. The exposure is ongoing rather than new — the lane has already
been silent for weeks.

---

## 5. F11 — ALREADY DECIDED. The programme only *looks* like it contradicts itself.

**The question.** One document says settle F11 by inspection with no code; another lists it as a Wave 1 build item.
Which governs?

**Why it is open.** `fix-specs/READ-THIS-FIRST.md:57` says *"Do not fix in code… F11: no gate is off — settle by
inspection and restate the finding if no work arrived,"* while `IMPLEMENTATION_PLAN.md:235` lists *"F11 liveness
columns"* among the Wave 1 deliverables.

### This is already settled — in three places, twice in the same document

**The contradiction is internal to `IMPLEMENTATION_PLAN.md`, and that document resolves it against itself.** Line 235
is in §4, the wave plan. Line 377 is in **§6, "Do NOT fix these"** — a later section whose entire purpose is to
override the wave plan — and it says:

> **F11** — *"Owner settles it in one check with zero code. If arrivals are zero, **restate as "no work arrived"**
> rather than leaving a HIGH dead-producer claim."*

So the same file that lists F11 as a Wave 1 deliverable later removes it, in the section built for exactly that. And
a **third** document agrees: `REMEDIATION_PLAN.md:3-4` marks itself superseded and records that the newer plan
*"overturned six of the findings below (F9, F19, F11, F40, F21, F36)"* — F11 among them. The original finding was
*"scanner producer dead 14d"* (`REMEDIATION_PLAN.md:85`).

**Score: two documents and two sections say do-not-fix; one line in a superseded-by-its-own-§6 wave list says build
it.** Later, more specific, and more numerous all point the same way.

### The cost of each reading

**Reading it as "settle by inspection" (correct).** Cost: one check — did any work actually arrive in the window? If
zero arrived, restate the finding as "no work arrived" and close it. Zero code, zero deploy.

**Reading it as "build liveness columns" (incorrect).** Cost: backend schema change, a Wave 1 deploy slot, and
verification. But the real problem is not cost — **it would build the exact defect the same plan is trying to
eliminate.** `IMPLEMENTATION_PLAN.md:199` (M5) mandates the vocabulary *"PRODUCING / NOT PRODUCING / NOT MEASURED,
never a boolean healthy"* and says to alarm *"on a ratio between two measured facts, **never on `Sum == 0`**"* —
summarising *"Six findings, one defect class: a config fact reported as health."* Liveness columns that read zero
arrivals as a dead producer are `Sum == 0` reported as health. You would be shipping a seventh instance of the defect
class while fixing the other six.

### Options

**Option A — Confirm the do-not-fix ruling; settle by inspection.**
Cost: one check. Risk: if the producer really is dead, you have described it accurately rather than fixed it — but
the override states *"no gate is off"*, so nothing is being blocked in the meantime.

**Option B — Build the liveness columns.**
Cost: schema plus a Wave 1 deploy. Risk: creates a surface that reports "no work arrived" as "producer dead" —
the M5 defect class, in a wave whose stated purpose includes removing it.

**Option C — Delete the stale line.**
Cost: a one-line edit to `IMPLEMENTATION_PLAN.md:235`. Risk: none. This is bookkeeping, not a decision.

### Recommendation

**Option A, plus Option C. The one reason: §6 of the plan exists specifically to override the wave list, and it
already ruled on F11 — so there is nothing here to decide, only a stale line to delete so nobody re-opens this.**

### What happens if we defer

**Does not block the push.** Nothing is gated on F11 and no code depends on it. The only real cost of leaving it is
that a HIGH-severity "dead producer" claim stays on the register describing something that may simply have had no
work to do — which makes the register less trustworthy.

---

## 6. overview-strip / region guard-health — no spec exists, so here is the smallest one

**The question.** This item cannot be decided as written, because nothing anywhere says what it is. Below is the
smallest honest spec that would let it be built — **and seven assumptions I had to invent, each of which needs your
ruling before anyone starts.**

**Why it is open.** `OPEN-REGISTER-TO-DONE.md:79` says *"no spec exists"*, and
`REMEDIATION-PROGRESS.md:1004-1009` confirms it: *"It is a console surface whose acceptance criteria could not be
found. It needs a spec before it needs an implementer."*

### First — one correction that changes the size of this job

**The register concluded "nothing exists", but its own evidence was narrower than its conclusion.** The check it ran
searched only the Go module (`--include=*.go`). The surface is TypeScript, and **it is already built**:

- The strip: `Frontend/components/overview/coverage-strip.tsx`, mounted at `Frontend/app/page.tsx:354`.
- The region: `AiControlPlaneRegion` (`Frontend/components/overview/ai-control-plane-region.tsx:557`), mounted at
  `Frontend/app/page.tsx:853` under the comment *"AI Control Plane region"*.
- The feed: `GET /api/v1/ai/web-coverage` (`Backend/src/ai-governance/controllers/ai.controller.ts:146`), described
  in its own comment as *"Web AI Guard coverage/health: per-endpoint browser-extension presence"*.

So **"no spec" is right; "nothing built" is wrong.** This is a modification to a shipped surface, not a new feature.
That materially shrinks it.

Also note the full name in the source register is **`overview-strip / ai-plane region guard-health`** — the short
form on the open register dropped "ai-plane", which is the word that decodes the whole item.

> **Trap for whoever builds this:** the `Frontend` working copy is on `feat/font-geist`, and `coverage-strip.tsx`,
> `kpi-strip.tsx`, `components/ui/absent.tsx`, `components/ui/pill.tsx` and `lib/absence.ts` exist **only on
> `origin/main`**. Writing this against the working tree would re-invent components that already exist.

### Draft spec — smallest honest version

**Goal.** On the console landing page, inside the AI Control Plane region, the coverage strip states the health of
Web AI Guard across the fleet, and never implies a measurement it does not have.

**Feed.** The existing `GET /api/v1/ai/web-coverage`. No new route.

**Vocabulary.** Three states only, per `IMPLEMENTATION_PLAN.md:199` (M5) — **PROTECTED / NOT PROTECTED / NOT
REPORTED**. Never a boolean "healthy". Never a percentage computed on a zero denominator.

**States and what each renders.**

| Condition | Renders |
|---|---|
| Endpoint reports the guard installed, beaconing, not drifted | Protected |
| Endpoint reports the guard absent, or reports drift | Not protected, with which of the two |
| Endpoint has not reported guard coverage at all | **"Not reported"** — muted, never green, never red |
| Zero endpoints in the tenant | "No endpoints enrolled" — never `0%`, never `100%` |
| The feed itself failed | "Unavailable" — never zero, never hidden |

**Rules it must obey.**

1. Unknown is never folded into either side, and never dropped from the denominator. This is already the strip's
   stated contract (`coverage-strip.tsx:15-26`).
2. A failed source must always speak — never hidden, never drawn as 0% (`coverage-strip.tsx:291-292`).
3. It replaces the existing ladder at `Frontend/app/admin/endpoints/coverage-section.tsx:917-925`, which is a **live
   defect**: unknown currently falls through to "Active". `fix-specs/WEBGUARD.md:108` already requires this be
   removed. Anything built here that copies that ladder inherits the bug.
4. No in-house rationale in the copy — the strip states what is true of the fleet, never why we built it this way.

**Acceptance.** The existing criterion `CN-04`
(`PRODUCTION_VERIFICATION_CHECKLIST_20260808.md:1094-1103`) already covers this and should be the test:
*"Every element traces to data; every empty element says it is empty rather than implying a measured zero."* Its
stated false-pass is the exact trap — a coverage percentage computed as `covered / total` with `total = 0` rendering
as `100%` or `0%`. **Defeat step: point the console at a tenant with no data and read the raw numerator and
denominator out of the network response.**

### The seven assumptions I invented — each needs your ruling

1. **"Region" means a page region, not a geography.** I read it as `AiControlPlaneRegion`, the named UI section. There
   is no per-geography health concept anywhere in the product, and `ai-activity-region.tsx` confirms "region" is this
   codebase's word for a composed page section. **Confirm — if you meant AWS regions, this spec is wrong end to end.**
2. **"Guard" means Web AI Guard only.** It could instead mean all enforcement lanes — command guard, DLP, Codex wire.
   That would be a much larger surface with four feeds instead of one. **Which did you mean?**
3. **Extend the existing strip rather than add a new one.** Cheaper and avoids two strips making adjacent claims.
   **Confirm, or say you want a separate row.**
4. **The absence wording.** M9 (`IMPLEMENTATION_PLAN.md:202`) specifies the literal `"Not reported"` with `title=` and
   `data-absence=`. The **shipped** primitives disagree — `lib/absence.ts:22` renders `"-"` and
   `components/ui/absent.tsx` carries a caller-supplied reason and `data-testid`, not `title`/`data-absence`. The
   literal string `"Not reported"` does **not exist in the frontend today**. `HANDOVER-TO-DESIGN.md:80-84` flags this
   clash and suggests the components may be the better design *"in which case M9's wording should change rather than
   the components."* **Pick one. A spec cannot assume "Not reported" renders today, because it does not.**
5. **The backend already serves the fields.** It may not. The response type declares only
   `{ installed, online, stale }` (`Backend/src/ai-governance/dto/ai-response.dto.ts:380-388`), but the frontend
   already reads `summary.degraded` and per-endpoint `drifted` / `policyAgeMs`. **Someone must verify whether those
   are actually served, or this is a backend change too.** This is the one assumption that could change the size of
   the work.
6. **Fleet rollup, not per-endpoint.** The strip is a summary surface; per-endpoint detail already lives on the
   endpoints page. **Confirm the strip is a rollup only.**
7. **Read gate unstated.** Which roles see this? A reader without access must see an explicit "not readable at your
   role", never an empty panel that looks like a clean result. **Name the roles.**

### Recommendation

**Answer questions 1, 2 and 4 first — they are the only three that change what gets built. The other four can be
settled by whoever writes the spec.** Question 4 is the one most likely to cause rework, because the doctrine and the
shipped components currently specify different things and both are checked in.

### What happens if we defer

**Does not block the push.** Nothing depends on this and no code is waiting on it. But it sits inside Stage D — the
render-surface verification that **has never been run**, and which is where the previous wave died. Deferring the
spec means Stage D cannot close, so the definition of done cannot be met even if everything else lands.

---

## 7. Should the integrity record name the operator, or hash them?

**The question.** The opt-out record now carries `actor` — an operator's login name such as `HOST\user` — in plain
text, on a channel where every other identity field arrives hashed. Keep it readable, or hash it?

**Why it is open.** Commit `af4ebaaa` admits `actor` to the allowlist and flags the tension in its own message as
*"REVIEW NOTE, unresolved"*, because §10 register #15 requires the row to **name** the authorizing actor while the
file's header says the channel exists so a caller *"cannot leak a path, SID, command line, prompt or policy body
through it"*.

### The fact that decides it: this value does not leave the machine

I traced the mirror's second destination, since that was the thing that would have changed the answer. **It is a
local file.**

- The primary mirror writes to the operator's own config directory (`system_evidence_integrity.go:270-275`).
- The privileged spool writes to `%ProgramData%\Devoid\evidence\tamper.log` on Windows, or
  `/var/lib/devoid/evidence/tamper.log` on Linux and macOS (`system_evidence.go:45-56`). On Linux and macOS it
  travels over a local unix socket to a privileged service on the same box. **There is no network destination on
  either path.**
- The channel explicitly refuses the one queue that *does* leave — `system_evidence_integrity.go:280`: *"IT DOES NOT
  AND MUST NOT WRITE `Paths.EventQueuePath`"*, the queue that rides the heartbeat.

**And the channel that does leave the box does not carry `actor` at all today.** The durable, server-bound spool
gates on `internal/daemon/evidence_delivery.go:17`, and of the seven opt-out keys only `reason` is on that list.
`actor` is not. So as things stand, the raw name goes to two local files and nowhere else.

### The tension is smaller than it looks

Two things weaken the "everything else is hashed" premise:

1. **A login name is not one of the five things the contract forbids.** The header names *path, SID, command line,
   prompt, policy body*. The three hashed neighbours hash exactly those kinds — `actorSidHash` (a SID),
   `actorProcessPathHash` (a path), `actorSignerHash` (a signer). The hashing tracks the forbidden list; it is not a
   blanket rule about identity. Two other actor fields, `actorSource` and `actorAssurance`, are already unhashed.
2. **The value is bounded, not free text.** `integrityDetailMaxLen = 96` (`:139`), enforced at `:230`, with empty
   values and embedded newlines or tabs rejected at `:230` and `:238`. A producer cannot smuggle a prompt or a policy
   body through a 96-character, newline-free field.

**What the design intends.** `internal/aiwire/optout.go:165-170` names four gates that should key off the same
producer list: this local mirror, the durable spool, the Backend console projection, and the shared contract. Register
#15 wants the console row to say who authorized the transition. So the intended end state is that `actor` reaches the
console — the local mirror is the *least* exposed of the four, not the most.

### Options

**Option A — Admit `actor` raw, here and on the channels that will later carry it.**
Cost: nothing now; the code already does this. Risk: on a shared Windows machine the ProgramData spool is readable by
authenticated local users, so other users of that box can see who opted out. When the console gate opens, the login
name lands in the audit database.

**Option B — Hash `actor` everywhere.**
Cost: one change here, and hashed values on every future gate. Risk: **register #15 becomes unmeetable.** A hash
cannot name anybody. The audit row would record that *someone* authorized the transition and be permanently unable to
say who — which is the exact defect #15 exists to fix. Accountability is the whole point of the field.

**Option C — Raw locally, hashed on anything that leaves the box.**
Cost: a second representation and the code to switch between them. Risk: this is the worst of the three. The place
#15 actually needs a name is the **console** row, so hashing on egress fails the requirement precisely where it
matters — and it produces two different answers to "who authorized this?" for one transition, with the machine-local
copy the only one that can answer. An investigator reading the console would have to go to the endpoint to learn
anything.

**Option D — Keep it raw locally now; decide the egress form when the other gates are actually widened.**
Cost: nothing. Risk: the decision returns later. But it returns attached to the work that makes it real, rather than
being made now in the abstract.

### Recommendation

**Option A. The single reason: a login name is not one of the five content classes this channel forbids, and hashing
it would make the register requirement — name the authorizing actor — permanently impossible to satisfy.**

The bound is already enforced, the value already cannot carry a newline or exceed 96 characters, and the field is
already unable to reach the wire. If you want a smaller step, Option D is Option A with the decision deferred to the
moment it has consequences — the code needs no change either way.

One thing to know rather than to decide: the ProgramData spool grants read to authenticated users on that machine, so
on a shared box the opt-out names its author to other local users. Given that opting out of security governance is
exactly the sort of act that ought to be locally visible, I read that as acceptable — but it is a real property and
you should hear it before choosing.

### What happens if we defer

**Does not block the push.** The value is confined to two local files, is bounded, and cannot reach the wire — the
allowlist that would carry it off the box does not admit it. This can be settled whenever register A3 #15's remaining
work opens the spool and console gates.

---

## What this means for the push

**Nothing in section B blocks pushing the existing commits.** Items 1, 2, 4, 5, 6 and 7 are all either
already-decided, config rather than code, additive frontend, or confined to a local file.

**Item 3 (F16) is the one to settle before the agent MSI is cut**, not before the push. F16 was never built, so it is
not in the tree being pushed — but it is the only item on the whole register that can cause permanent,
unrecoverable damage in the field, and the credential it concerns is readable on every installed machine right now.

**The real gate on the definition of done is not in this list.** Stage D — the render-surface verification — has
never been run, and item 6 sits inside it. That is where the previous wave died.
