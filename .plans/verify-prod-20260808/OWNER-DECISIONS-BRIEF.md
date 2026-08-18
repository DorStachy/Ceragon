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
| 1 | Shared-contract parity | **No** | Take Intel's value on all three real divergences; delete the orphan copy |
| 2 | F36 Stage 2 | **No** | Ship Stage 1; build the corrected Stage 2 already written in the spec |
| 3 | F16 credential split | **YES** | Elevation-gate the mint; do not split the credential this wave |
| 4 | C11d-2 abandoned queue | **No** | Add the one alarm that needs no threshold |
| 5 | F11 | **No** | ALREADY DECIDED — do not fix in code; confirm and close |
| 6 | overview-strip / guard-health | **No** | Draft spec below; six assumptions need your ruling |
| 7 | `actor` raw or hashed | **No** | Keep it raw; it is not what the contract forbids |

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
