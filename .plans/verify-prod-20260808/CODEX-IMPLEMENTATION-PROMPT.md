# Prompt for Codex — implement Wave 1 of the remediation plan

> **CHECKPOINT:** F24 and F25 are already merged. Start a fresh continuation from
> [`HANDOFF_20260809.md`](HANDOFF_20260809.md) and
> [`COWORKER_FRESH_CHAT_PROMPT.md`](COWORKER_FRESH_CHAT_PROMPT.md); do not rerun this prompt verbatim.

Run it from a worktree, not a shared checkout. Suggested invocation:

```bash
codex exec -m gpt-5.6-sol -s workspace-write -c 'sandbox_permissions=["disk-full-read-access"]' - < CODEX-IMPLEMENTATION-PROMPT.md
```

Copy everything below the line into Codex.

---

You are implementing **Wave 1** of a production defect-remediation plan for the DeVoid / Ceragon security platform.
This is real production code with an installed customer fleet. Precision matters more than speed.

## Read these first, in this order — do not start coding until you have

1. `.plans/verify-prod-20260808/IMPLEMENTATION_PLAN.md`
   — start at the top: the **PARALLEL EXECUTION CONTRACT** (a second wave is running concurrently in another chat
   and owns some of these files), then §4 Wave 1, §5 the risk register, and §10 the pre-deploy gate.
2. `.plans/verify-prod-20260808/fix-specs/READ-THIS-FIRST.md`
   — seven corrections that apply to every spec, eleven verdict overrides (specs you must NOT implement as written),
   eight hard orderings, and the per-finding traps.
3. The relevant `fix-specs\<CLUSTER>.md` for each finding you pick up. **Each spec has an adversarial reviewer's
   objections inlined underneath it. The reviewer overrides the spec** unless you can disprove the objection from
   source — in which case say so, cite the line, and record it in your PR description.

## Where to work

- **Fork every branch from `origin/main`.** The local checkouts are 403 (Backend), 183 (Frontend) and 625
  (Installers) commits stale. A branch cut from one silently reverts other people's merged work.
- **Never branch, checkout, or `git add -A` in `Ceragon/Backend`, `Ceragon/Frontend`, `Ceragon/Installers`.**
  Concurrent sessions use them. Use `git worktree add` from a short path.
- **Never run `npm install` or `npm ci` inside a worktree.** It prunes the shared `@ceragon/shared-contracts`
  junction and breaks every concurrent session with TS2307. Junction `node_modules` instead. When tearing a worktree
  down, delete the junction **before** `git worktree remove` — removal follows junctions.
- Branch naming: `fix/rem-<finding-id>-<slug>`, e.g. `fix/rem-f24-approval-ttl-clamp`.
- One finding per branch and per PR. Do not batch unrelated findings.

## Wave 1 — backend only, no agent release, no reinstall

Implement in this order. Stop and report after each one; do not chain them into a single PR.

**1. F24 — every hold-for-approval is unactionable.** *Start here; it is the highest-value fix in the wave.*
Spec: `fix-specs\DELIVERY.md`. The agent sets `ExpiresAt = now + exactly 900s`
(`Installers/internal/daemon/ai_tool_hold_approval.go:64`) and the backend rejects with a **strict `>`** at
900000ms (`Backend/src/ai-governance/services/ai-delegated-approval-authority.service.ts:437`). Zero margin, so any
endpoint-ahead clock skew 400s and no approval row is ever created. Five live occurrences; the entire
hold-for-approval workflow is dead in production.
The backend fix alone un-bricks the **whole installed fleet** with no agent change — that is why it is first.
Do the server-side clamp **and** `@AgentWireDto()` on `ai-delegated-approval.controller.ts` (it is the one agent
route that uses raw `@UseGuards(ApiKeyGuard, CliSignatureGuard)` and therefore never gets the
`forbidNonWhitelisted:false` marker). Read the reviewer's objection about `matchesCreate` — the clamp alone leaves a
permanently-unactionable path.

**2. F25 — AI-context findings are never delivered.** Spec: `fix-specs\DELIVERY.md`.
An unbounded producer preview meets a 4096-char per-item cap under whole-batch nested validation, so one oversized
item drops the entire batch — three sweeps dropped whole, including 25 detected secrets that never reached the
console. Implement **layers 1 and 3** here (backend only): extract `src/common/validation/per-item-batch.ts` from
`EndpointController.validateInventoryItems`, and add the evidence-batch `rejectedEventIds` channel. Reject the
**item**, never the batch.
Heed the reviewer: the prescribed DTO change as written is a **compile error**, and layer 3's
`AcknowledgeThrough` must **never advance the watermark past a gap**.
This unblocks F2 and F17 — do it before either.

**3. F12 — `backendBuildSha` is undefined in prod.** Spec: `fix-specs\BACKENDOPS.md`. Small, isolated, verdict SOUND.
Three call sites read `BUILD_SHA`/`GITHUB_SHA` but the image actually carries `CF_BUILD_SHA`.

**4. F19 — retention.** Spec: `fix-specs\BACKENDOPS.md`. **The finding was 2/3 wrong** — audit and delivery-log
retention are already deleting in production; only threat-intel is gated off. Deliver the boot **warning** naming
the implicit 30-day cut, and delete the threat-intel gate. **Do not add a boot assertion.** Batch the prune like
`audit-retention.service.ts:164-188` — an unbounded delete on an accumulated backlog is a lock hazard.

**5. F13 — Windows EXE/MSI download is broken.** Spec: `fix-specs\BACKENDOPS.md`. The Cera→Devoid rename never
landed in the deployed backend. **First fix the manifest signature mismatch** (`installer.service.ts:643` hashes
pretty-printed JSON while the producer signs compact sorted JSON) — otherwise you swap one silent-trust defect for
another. Resolve both old and new artifact names during the transition.

**6. F17 — per-machine AI-context attribution.** Spec: `fix-specs\BACKENDOPS.md`. **Sequence after F25.**
`ai-context.controller.ts:65` writes `endpoint_id = the API-key id`, and `cli_agent` keys are fleet-shared, so every
endpoint collapses into one row.
**Do NOT ship the `UnauthorizedException`.** `CliSignatureGuard` is shadow-by-default, so
`requestSigningVerifiedAgentId` is unset for the pre-v2 fleet and every one of them would 401. Ship
`endpointId = verifiedAgentId ?? 'unattributed:' + apiKeyId` and render the sentinel as "endpoint not
device-verified". Batch the migration; never an unbounded `DELETE`.

**Then stop and report before touching M2 (`ai-query.service.ts`) or F41 (`ai-security-policy.constants.ts`).**
Both are **coordinate** files shared with the concurrent Design wave — see the PARALLEL EXECUTION CONTRACT at the top
of the plan. They need a go-ahead, not just a green test.

## Binding rules

1. **No feature flags.** Fixes ship ON. Never off-by-default, never shadow mode, never an env gate to enable a fix.
2. **Never render an unknown as zero or as success.** `—`, "not measured", "not reported" — never `0`, never a green
   tick.
3. **Preserve the honesty discipline.** Protected copy, do not "improve" it: "measured absence, not a pass" ·
   "required evidence missing" · "EFFECT EXPRESSED" · "NOT MEASURED" · "an uncertified action is reported honestly
   as unknown, never as prevented or safe". Never fix a finding by making a truthful negative surface look positive.
4. **Backend must tolerate the installed old-agent fleet.** Additive, optional fields only. Never remove or rename a
   field a deployed client still sends.
5. **Never boot-assert** `AI_CORRELATION_KEY_MASTER_KEY` or `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY`. Absent keys degrade
   a lane; they never block startup. Boot-asserting a secret has bricked a deploy here before.
6. **Do not regress these six capabilities**, each proven working live: command-lane blocking *and discrimination* ·
   DLP across 14 data classes · browser masking before send · Codex wire blocking · signed-bundle propagation and
   anti-rollback · the supply-chain package gate.
7. **Never hand-edit** `Frontend/types/generated/*.generated.ts` — digest-pinned, gate runs inside `lint`.

## Every change needs a test with a DEFEAT STEP

A test is not evidence unless you can show it going **red**. For each fix, write the test, then perform the action
that must make it fail, and record that it failed. A check whose defeat step does not turn it red is **NOT-RUN**,
not PASS.

This is not a formality. The previous remediation wave shipped green and was inert in production, and a Codex hook
lane sat completely dead for months behind passing attestation, because the attestation validated that an executable
resolved rather than that it did anything. Assume any check you write is lying until you have seen it fail.

## What to report per finding

- Branch name and the diff summary.
- The reviewer objections you **applied**, and any you **rejected** with the source evidence that overturns them.
- Each test, and **the defeat step you ran and its result**.
- What you did **not** do and why — an honest gap beats a silent one.
- Anything in the spec you found to be wrong. Several specs contain stale line numbers and at least one contains a
  factually false premise; if you find another, say so plainly rather than working around it.

Do not report "all working". Every report is **PROVEN** (with the evidence) plus **NOT EXERCISED** (with the reason).
