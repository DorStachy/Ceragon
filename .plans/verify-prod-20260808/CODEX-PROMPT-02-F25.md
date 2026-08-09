# Prompt for Codex — close out F24, then implement F25

> **ARCHIVED — DO NOT RUN.** F24 and F25 are merged in Backend PRs
> [#240](https://github.com/Ceragon-Prod/Backend/pull/240) and
> [#241](https://github.com/Ceragon-Prod/Backend/pull/241). This file is retained only as implementation history.

```bash
codex exec -m gpt-5.6-sol -s workspace-write -c 'sandbox_permissions=["disk-full-read-access"]' - < CODEX-PROMPT-02-F25.md
```

Copy everything below the line.

---

Your F24 work was independently reviewed against the source. **Verdict: APPROVED.**

The reviewer confirmed the clamp preserves shorter expiries, clamps longer ones, and still rejects past/invalid; that
your three corrections to the original task were right (marker on the body DTO metatypes not the controller, five
raw-guard routes not four, four live occurrences not five); and that the leniency risk from `@AgentWireDto()` is low
because only `bundleDigest` and `destinationRef` are optional while every security-bearing field stays required with
nested validation on `obligations`.

The reviewer also checked something you did not mention and it came out clean, so **write it into the PR description
so nobody "fixes" it later**: `deriveGrantReference` HMACs `request.expiresAt.toISOString()`, but every derivation
path (`:187` from `saved`, `:207` from `live`) uses the **stored** row and the agent receives the reference rather
than recomputing it — so dropping expiry from `matchesCreate` cannot desynchronise the grant reference.

## Part 1 — three follow-ups on the F24 branch, then ship it

Stay on `fix/rem-f24-approval-ttl-clamp` in `C:\cwt\rem-f24`.

1. **Make `context` a required parameter** of `normalizeCreate`, not optional. There is exactly one caller and it
   always passes it, so nothing changes today — but an optional parameter invites a future caller that clamps
   silently with no WARN.
2. **Record in the PR description that F24 is NOT fully closed.** An endpoint whose clock is **behind** by more than
   900 seconds still hits `requestedExpiresAt <= nowMs` and gets `400 expiresAt must be future`. Ahead-skew is fixed;
   behind-skew is not. The clean fix is the duration-based `ttlSeconds` contract scheduled for Wave 3. Do not
   implement it now — just state the residual so the finding is not marked done.
3. **Record the agent-side residual.** The server now returns the stored (possibly clamped) expiry at `:560`, but the
   agent still holds its own local 900-second TTL. Under ahead-skew the local hold outlives the server row by the
   skew, leaving a window where the agent believes the hold is live and approval returns 409 "has expired". That is
   the Wave 4 agent-margin item — reference it so it is not lost.

Then **commit and open the PR**. Commit message body must carry: the mechanism, the eight defeat steps and their
observed-red results, the grant-reference note above, and the two residuals. Do not squash away the defeat evidence.

## Part 2 — F25: AI-context findings are never delivered

Spec: `.plans\verify-prod-20260808\fix-specs\DELIVERY.md`. Read the spec **and the adversarial reviewer's objections
inlined beneath it** before writing code. New branch, new worktree, forked from `origin/main`:
`fix/rem-f25-per-item-batch`.

### The defect
The agent emits `redactedContext` longer than the backend DTO's 4096-character bound, and class-validator rejects the
**whole batch** on one bad item. Three sweeps were dropped entirely — 85, 48 and 25 items, `postedSoFar=0` every
time — including **25 detected secrets that never reached the console**. The failure is invisible to both the
database and the code; it exists only in the agent log.

This is the third time this defect class has shipped in this codebase. Fix the mechanism, not the instance.

### Scope for this branch — backend only
Implement **layers 1 and 3**. The agent-side producer clamp is layer 2 and belongs to the Wave 4 agent release; do
not touch `Installers/` on this branch.

1. **Layer 1 — extract `src/common/validation/per-item-batch.ts`** from the existing
   `EndpointController.validateInventoryItems`. That code already does per-item rejection correctly; the point is to
   make it a shared, reusable primitive rather than a one-off, so the other batch endpoints can adopt it.
2. **Layer 3 — the evidence-batch `rejectedEventIds` channel.** A batch containing one malformed item must persist
   the good items, return the rejected ids, and the write-ahead log must advance past the accepted ones.

### Three reviewer objections that override the spec — do not skip these
- **The prescribed DTO change is a compile error.** `src/ai-context/dto/ai-context-ingest.dto.ts:222` declares
  `AiContextIngestDto implements AiContextBatchWire`, and
  `packages/shared-contracts/src/ai-context-findings-contract.ts:189` declares the corresponding field. Changing one
  without the other will not build. Resolve the contract and the DTO together.
- **`AcknowledgeThrough` must never advance the watermark past a gap.** Deleting a rejected id to unblock the queue
  leaves a permanent hole in the signed contiguous floor, because contiguity is computed from persisted `ai_events`
  rows. Record the loss on `Health()` instead — a visible, honest gap beats a silently-advanced watermark.
- **The producer-loop fix "always attempt the coverage-bearing chunk 0" is a no-op.** Chunk 0 is attempted first and
  chunk 0 is the one that 400s. Do not implement it as written.

### Also deliver
Enumerate every **other** agent-to-backend batch endpoint that still uses whole-batch validation and list them in the
PR description. You do not have to convert them on this branch, but the list is the deliverable that stops this class
recurring a fourth time.

### Why this one is sequenced here
F25 unblocks **F2** (the durable evidence twin cannot ship safely without per-item rejection, or it wedges the whole
spool at max backoff) and **F17** (that lane 400s on every batch today, so F17's migration would delete rows on a
promise nothing can keep). Everything else waits behind it.

## Binding rules — unchanged

- Fork from `origin/main`. Never branch, checkout or `git add -A` in the shared `Backend/`, `Frontend/`,
  `Installers/` checkouts. Never `npm install` / `npm ci` inside a worktree — it prunes the shared
  `@ceragon/shared-contracts` junction and breaks concurrent sessions with TS2307.
- **No feature flags.** Fixes ship ON.
- **Never render an unknown as zero or as success.**
- **Backend must tolerate the installed old-agent fleet.** Additive, optional fields only.
- **Never boot-assert** `AI_CORRELATION_KEY_MASTER_KEY` or `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY`.
- Do not regress: command-lane blocking and discrimination · DLP across 14 data classes · browser masking before
  send · Codex wire blocking · signed-bundle propagation and anti-rollback · the supply-chain package gate.
- **Do not touch** `ai-query.service.ts` or `ai-security-policy.constants.ts` — both are shared with a concurrent
  Design wave and need a go-ahead, not just a green test. See the PARALLEL EXECUTION CONTRACT at the top of the plan.

## Every change needs a DEFEAT STEP

Write the test, then perform the action that must make it fail, and record that it failed. A check whose defeat step
does not turn it red is **NOT-RUN**, not PASS. For F25 the defeat that matters most: **submit a batch with one
oversized item and confirm the good items are still persisted** — then restore whole-batch validation and confirm
that test goes red.

Your F24 defeat evidence was the strongest part of that submission. Keep that standard.

## Report format
Branch and diff summary · objections applied and any rejected with the source evidence that overturns them · each
test with its defeat step and observed result · what you did **not** do and why · anything in the spec you found to
be wrong. Never "all working" — **PROVEN** (with evidence) plus **NOT EXERCISED** (with the reason).

Stop after F25 and report. Do not continue to F12/F13/F19 without a review.
