# How to implement from these specs

Each `<CLUSTER>.md` file contains the fix specs **and** an adversarial reviewer's objections inlined under every
spec. They sometimes contradict each other. This file resolves the contradictions that apply across the whole set,
so you do not have to re-derive them per finding.

## Rule 0
**The reviewer overrides the spec.** 43 of 50 specs were returned NEEDS_REVISION and 1 outright WRONG; the
objections are usually right. But the reviewer is not automatically right either — where source disproves an
objection, keep the original approach and record why. **Verify every file:line you carry forward.** Both sides
quoted stale lines in places.

## Corrections that apply to EVERY cluster

1. **"Sync all three shared-contract mirrors" is WRONG** in F39, F7d and F38. The workspace and Ceragon-Intelligence
   mirrors contain no `ai-governance-contract.ts`, `runtime-adapter-contract.ts`, `policy-tamper-evidence-contract.ts`,
   `ai-context-findings-contract.ts`, `prompt-evidence-*` or `integrity-canary-*`. Those live **only** in
   `Backend/packages/shared-contracts`. Strike every three-mirror instruction except **F37's
   `package-intelligence/`** — the one real three-way mirror, whose copies are *already divergent*, so a blind
   copy-paste renames Intel S3 buckets to ones that do not exist.

2. **"Backend must ship first or `forbidNonWhitelisted` 400s the agent" is FALSE** for F3, F25, F40 and F2.
   `AgentIngestValidationPipe` sets `forbidNonWhitelisted: false` for `@AuthApiAgent()` routes. The one genuinely
   strict route is F24's delegated-approval controller — fix that with `@AgentWireDto()` and the class is closed.

3. **The real deploy hazard is backend → OLD FRONTEND / OLD EXTENSION**, the reverse of the usual rule. Frontend
   allowlists and enum-acceptance ship **before** the backend emits a new value. Applies to F3
   (`MASKED_PREVIEW` vs the `PROMPT_TEXT_SOURCES` allowlist), F39 (key the ladder on `ruleCountSource`, never on
   `ruleCount === 0`, or the whole fleet renders red) and F15 (widen the `@IsIn` enum first).

4. **Never boot-assert** `AI_CORRELATION_KEY_MASTER_KEY` / `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY`. Absent keys degrade
   a lane; they never block startup.

5. **No feature flags.** Fixes ship ON. If a spec proposes an env gate or off-by-default, that part is rejected.

6. **Preserve the honesty discipline.** Never fix a finding by making a truthful negative surface look positive.
   Protected copy: "measured absence, not a pass" · "required evidence missing" · "EFFECT EXPRESSED" ·
   "NOT MEASURED" · "an uncertified action is reported honestly as unknown, never as prevented or safe".

7. **Do not regress the six capabilities proven working live**: command-lane blocking *and discrimination* · DLP
   across 14 data classes · browser masking before send · Codex wire blocking · signed-bundle propagation and
   anti-rollback · the supply-chain package gate.

## Verdict overrides — do NOT implement these as written

| Spec | Override |
|---|---|
| **F34** | Reviewer verdict **WRONG**. The change is a *membership* change, not a severity change: `buildDetectionsQuery` admits a tamper row only via `e.severity IS NOT NULL`, so dropping the stored severity silently removes rows from the detections surface. Ship **with F33 in one PR**, one test matrix. |
| **F3b** | **Defer entirely.** Its own change list instructs the fleet-wedging failure it warns about. F3's masked lane delivers the outcome with no new secret. Do not provision the correlation keys in this wave. |
| **F29 (backend)** | **Drop.** Ship **F29-render** instead — frontend-only, no deploy, and it preserves `sessionLabelOrNull`, which the backend fix silently breaks for every activity and detections row. |
| **F32-render** | The `showsPromptBlock` reorder is **self-defeating** — it deletes the honest NOT_PROMPT_BEARING sentence for 17 event types. Gate the three `PromptEvidencePanel` mounts only. |
| **F4 part 2** | **Drop.** `omitempty` has no effect on struct types, so `source_surface` silently becomes `''` fleet-wide. Ship part 1 (append the vocabulary member) plus a round-trip test. |
| **F16b** | **Descope.** `expectedACEs` dispatches on string equality, so a templated SDDL hits "unknown descriptor" → `hardenSecret` errors → empty daemon token → the guard fails **OPEN** (the 7.8.14 incident). F16 alone removes the private key from the Users-readable boundary; that is the CRITICAL. |
| **F40** | **Do not change `driftFailMode`.** It governs LOW_IMPACT composer sends only and never site access; electing `closed` blocks every send on a drifted site for days. Ship visibility only. |
| **F8b** | `shell-not-analyzed` must be a **coverage attribute on the decision**, not a Finding class — as a class it trips `ai_handlers.go:2588` and starts shipping redacted command previews for most Windows traffic, reversing a locked decision. |
| **F19** | Finding was **2/3 wrong**: audit and delivery-log retention are already deleting in prod. Only threat-intel is gated off. The deliverable is a boot warning naming the implicit 30-day cut — **not** a boot assertion. |
| **F9 / F11** | **Do not fix in code.** F9: ECS 0/0 is correct, the pipeline runs on Hetzner; fix the *reporting* (M5), not the pipeline. F11: no gate is off — settle by inspection and restate the finding if no work arrived. |
| **F1 change B** | **Hold** until a console surface is confirmed to render `PolicyIntegrityReport.Containment`. Change C (the bounded emitted-key set) is independently correct and ships alone. |

## Hard ordering (violating these produces the failure the finding describes)

- **F25 → F2.** F2's durable twin hits `AiEventIdentityConflictError` → 409 → non-retryable → the spool wedges at max
  backoff **forever**. F25's per-item rejection channel must land first, and F2 needs an explicit absorb branch keyed
  on `existing.emitterStreamId IS NULL` plus a decision on the reserved sequence, or the contiguity floor freezes.
- **F3 → F20.** F20 does *not* "sweep an empty table" — the table does not exist, so the SELECT raises `42P01` every
  10 minutes and the job reports healthy while doing nothing. **Never ship F20 first.**
- **F33 ⟺ F34** — one PR (see above).
- **F16 → F15.** And F16 carries the wave's only endpoint-bricking risk: a non-elevated shim reaching
  `ConvergeTrustAnchor` would mint a fresh key against a backend row holding the old one → permanent 409. Guards:
  a call-graph reader inventory as a test, `ENOENT` → mint but `EACCES` → refuse-and-degrade, and EACCES mapped to a
  typed non-fatal state.
- **F8a → F8c → F8b.** The dependency in the specs is inverted. The corpus instrument gates F8b's rollout, so it is
  built between them. Per owner decision D1 it is a shipped deliverable, not an optional gate.
- **F27 → F26, F28, F31, F32.** F26's "harmless alone" is false: dropping the title gate before F27's activity
  predicate *increases* phantom rows.
- **F23 → F21.** Headers set in `writeFatalSSE` are dropped on an already-committed response.
- **F17 after F25.** That lane 400s on every batch today, so F17's migration deletes rows on a promise nothing can
  keep until F25 lands.

## Per-finding gotchas the reviewer caught that are easy to miss

- **F3** — the `ck_apeag_source_artifact` CHECK needs a third branch; omitted by the spec and mandatory.
- **F5** — `receiptProtocolVersion` / `receiptAssurance` **do not exist**. Project from the four V1 columns that do.
  The readiness surface is `rollout-readiness.service.ts`, not `ai-readiness*.ts` (which does not exist).
- **F27** — `@Type(() => Boolean)` on the query param makes `?includeNonSubstantive=false` evaluate **true**.
- **F36** — Stage 2's digest must be `agentId`-scoped and side-effect free; the spec's version drops the team fold
  *and* calls `ensureAckSigner` (a key-mint **write**) inside a `GET`.
- **F37** — deleting the precompute flag turns on live BLOCK verdicts for MCP servers and editor extensions from
  1170 unreviewed rows. Gate deletion and the content review are **one work item**.
- **F8a** — the split rule must not apply when an unknown expansion is a *prefix* of an argument word, or ordinary
  destructive-cleanup commands with an unset variable in the path newly block.
- **F13** — the manifest is **not** signature-verified today: the verifier hashes pretty-printed JSON, the producer
  signs compact sorted JSON. Fix that before promoting the manifest to source of truth.
- **F14** — the read-side IAM is missing from the spec: the **backend ECS task role** needs `s3:GetObject`. Without
  it F14 ships and changes nothing.
- **F7** — with `mcp.autoEnforce` on, fixing discovery alone causes the daemon to start **editing** newly-discovered
  configs. Sequence the blast radius.

## Codex track
Superseded by plan sections 7b–7f and
`docs/CODEX_GOVERNANCE_PRODUCTION_DEFECT_INVESTIGATION.md`. Scope decided: build the **machine-hook lane** properly,
take the wire proxy off the critical path, no network-containment programme. The deny contract is **exit 2 +
non-empty stderr** (exit 1 never denies), use the **`commandWindows`** key, six deny-capable events, `SessionEnd`
exists but is notification-only with a 1s/3s timeout, and every WSL distro needs its own
`/etc/codex/requirements.toml`.
