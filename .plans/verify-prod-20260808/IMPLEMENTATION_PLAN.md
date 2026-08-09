# Implementation plan — production verification remediation (2026-08-09)

Ready for an implementing AI agent. Every root cause was re-derived from **origin/main** (Backend@bded3919,
Frontend@1aed32f, Installers@55cd0ae, Intel@4179fd5), then attacked by an independent adversarial reviewer.

## Execution checkpoint — 2026-08-09

Wave 1 contains 13 work packages. Two are merged and must not be reimplemented:

- **F24** — delegated-approval TTL clamp and agent-wire DTO correction: [Backend PR #240](https://github.com/Ceragon-Prod/Backend/pull/240), merge `cb5dbf9827a20ec826657720289e588cc5484679`.
- **F25** — per-item AI-context/evidence validation, transactional rejection tombstones, and contiguous ACK-floor preservation: [Backend PR #241](https://github.com/Ceragon-Prod/Backend/pull/241), merge `1d9b5d15abcdc11a5b9c8e46bfe30f75bbe3a28f`.

Continue from [`HANDOFF_20260809.md`](HANDOFF_20260809.md), which records residuals, the remaining order, cross-wave gates, exact pull targets, and the fresh-chat bootstrap prompt. The older F25-specific prompt is retained only as implementation history.

Security note: the three raw Codex investigation dumps and the live endpoint evidence ledger remain in the authorized local workspace and are intentionally excluded from the published branch. Their reviewed conclusions are incorporated into this plan and the fix specs.

**Per-finding detail lives in [`fix-specs/`](fix-specs/)** — one file per cluster, containing the full root cause with
file:line evidence, concrete changes, rejected alternatives, tests with defeat steps, and the reviewer's objections
inlined. **The reviewer's objections override the spec wherever they conflict.** This document is the map, the
ordering, and the decisions. Do not implement from this file alone — open the cluster file for the item you are
building.

| Cluster file | Findings |
|---|---|
| [PE.md](fix-specs/PE.md) | F3, F30, F5, F20, F3b |
| [TAMPER.md](fix-specs/TAMPER.md) | F1, F33, F34, F4 |
| [SESSIONS.md](fix-specs/SESSIONS.md) | F27, F31, F26, F28, F29, F32 |
| [SHELL.md](fix-specs/SHELL.md) | F8a, F8b, F8c |
| [CODEXUX.md](fix-specs/CODEXUX.md) | F23, F22, F21, F6 |
| [DELIVERY.md](fix-specs/DELIVERY.md) | F2, F24, F25 |
| [CREDS.md](fix-specs/CREDS.md) | F16, F16b, F15 |
| [CANARY.md](fix-specs/CANARY.md) | F38 |
| [MCP.md](fix-specs/MCP.md) | F7, F7b, F7c, F7d |
| [WEBGUARD.md](fix-specs/WEBGUARD.md) | F39, F40, F18 |
| [BACKENDOPS.md](fix-specs/BACKENDOPS.md) | F13, F17, F14, F12, F19, F37, F9, F10, F11 |
| [FRONTEND.md](fix-specs/FRONTEND.md) | UX-01, F36, F29-render, F32-render, F31-render |
| **[CODEX-GOVERNANCE.md](fix-specs/CODEX-GOVERNANCE.md)** | CX-1…CX-13 (supersedes F21/F22/F23/F6/F43/F44) |
| **[DEFAULTS.md](fix-specs/DEFAULTS.md)** | F41, F42 |

---

# ⚠ PARALLEL EXECUTION CONTRACT — read before cutting any branch

**You are REMEDIATION.** A second wave is being implemented **concurrently in another chat** against the same repos:

**DESIGN W2** — `.design-mockups/v2/IMPLEMENTATION-PLAN.md`. Screen rebuilds (Detections, Sessions, Investigation),
the console design system and motion layer, the AI policy console, the policy engine, the O-9 defect, the R2/R3
wind-downs, and causality.

The two waves collide on `ai-query.service.ts`, `ai-response.dto.ts`, `ai-security-policy.constants.ts` and most of
the Frontend console. This section governs **ownership and ordering only** — it does not override either plan's
technical content. The identical section is present in the DESIGN W2 plan.

## Two facts DESIGN W2 established that bind this plan

1. **`.worktrees/FE-policy3` is on `feat/ai-policy-console-ui`** — measured 2026-08-09: HEAD `3139e9c`, **5 ahead /
   114 behind `origin/main`**, ~65 files changed, tree clean. Run their **T-G2** collision check before **any**
   Frontend branch here.
2. **`types/generated/ai-security-{portable,contract-spine,detector-catalog}.generated.ts` are digest-pinned**, and
   the pin gate runs inside `lint`. A hand edit fails build *and* test with an error that does not name the cause.
   This bites **F8b** (adding tool-risk classes) and **F41** (re-tiering them) — regenerate, never hand-edit.

Also: their DO-NOT #8 about `contract-spine.v1.jcs.json` being mirrored in three repos is **correct** and is a
*different* artifact from the `ai-governance-contract.ts` family, where our three-mirror correction applies.

## File ownership

**The OWNER lands first; the other wave rebases and does not edit the file until the owner's PR is on `origin/main`.**

| File | Owner | What the other wave does |
|---|---|---|
| `ai-security-policy.constants.ts` | **coordinate — highest risk** | **F8b + F41** re-tier 40 tool-risk classes and add 3, as **one edit, first**. DESIGN **T-E2** then derives from the final tiers; **T-U4/U9** build the board on them. If T-E2 lands first, F41 must be re-expressed as a derivation change, not a constant change. |
| `ai-class-metadata.ts` | **REMEDIATION** | F8b adds three META entries. A class in the tuple with no META entry **crashes the console board**. DESIGN rebases before Phase U. |
| `ai-query.service.ts` | **coordinate** | We own the **predicate** (`NON_SUBSTANTIVE_EVENT_TYPES` / M2) and **land first**. DESIGN owns the **shape** (T-L13 GROUP BY, T-L11 sort, T-B5/B21). Otherwise their rewrite counts phantom sessions and is redone. |
| `ai-response.dto.ts` | **coordinate — additive only** | Both add optional fields. Neither may remove or rename one. |
| `ai-event.service.ts` | **REMEDIATION** | F2 idempotency + twin-absorb, F34 severity, F31 title sanitisation. Their **T-X2** rebases onto F2. |
| `app/ai-control-plane/ai-sessions/**` | **DESIGN** | Phase B rebuilds it. **We ship no render work here.** |
| `session-timeline-content.tsx` | **DESIGN** | Phase I rebuilds it. |
| `prompt-preview.tsx` | **DESIGN** | Their **T-I41** owns it. |
| `plane-view.tsx` | **DESIGN** | Phase B — hand over our two edits to the same union. |
| `components/admin/ai-security-policy-section.tsx` | **DESIGN** | Phase U. |
| `components/top-bar.tsx` | **REMEDIATION** | UX-01. Zero DESIGN references — no coordination needed. |
| `app/admin/endpoints/coverage-section.tsx` | **REMEDIATION** | F39+F40 merged ladder; DESIGN rebases. |
| `overview-content.tsx` | **coordinate** | Their Phase H owns layout; we own the name-resolution helper it calls. |
| `types/generated/*.generated.ts` | **neither** | Digest-pinned. **Regenerate, never hand-edit.** |
| all of `Installers/` | **REMEDIATION** | F8a, F16, F2, F24, F25, F7, F38 and the whole Codex track. DESIGN touches it only at **T-M2** — coordinate that one task. |
| `Backend/src/ai-context/**`, installer/release/retention/queues | **REMEDIATION** | F17, F13, F14, F12, F19, F37, F9, F10, F11. No overlap. |

## Nine of our findings whose render half DESIGN now owns

**Do not implement these twice.** We keep the backend/producer half; the render half becomes a hard acceptance
criterion on the DESIGN task named. Their rebuilds replace these screens entirely, so shipping our version would be
thrown away and would guarantee a conflict.

| Our finding | We keep | They own |
|---|---|---|
| **F29-render** | nothing — render-only | **T-B14**. Do **not** delete the server `repo` rung; it feeds `sessionLabelOrNull` on activity and detections. |
| **F31-render** | **F31 agent half** — populate the two identity fields the wire already carries | **T-B14** |
| **F27** | **M2** predicate (lands first) | **T-B25/B26** |
| **F32-render** | backend exclusion via M2 | **T-I30/I31** |
| **F30** | **F3** masked-preview lane | **T-I41 + T-I5** |
| **F5** | backend projection from the four V1 columns that exist | **T-I40** |
| **F33** | **M3** `projectPolicyTamperTransition` + **F34** severity derivation | **T-I36…I42** |
| **F36** | backend read model (already on the wire) | **Phase U** + T-E13 |
| **UX-01** (policy-page half) | the `top-bar.tsx` half | **Phase U** |

Also: **their Phase D owns the absence primitives** (`Pill`, `AbsentLine`, `AbsentBlock` — T-D20/D21/D22). Our **M9**
absence doctrine **consumes** them rather than shipping a second set.

## Cross-wave ordering

| Lands first | Then | Why |
|---|---|---|
| **M2** (`NON_SUBSTANTIVE_EVENT_TYPES`) | their **T-L13** | Otherwise the GROUP BY rewrite counts phantoms. |
| **F8b + F41** (one edit) | their **T-E2**, **T-U4/U9** | Board and derivation build on the final class set and tiers. |
| **F25** (per-item batch rejection) | their **T-X1** | The ai-context lane 400s on *every* batch today; a new field on a wedged lane cannot be verified. |
| **F24** (`@AgentWireDto()`) | any DESIGN agent-wire addition | Closes the one strict agent route programme-wide. |
| their **Phase D** primitives | our **M9** tokens | One absence vocabulary, not two. |
| their **T-G2** | any Frontend branch here | FE-policy3 is 114 behind with ~65 files changed. |

## Merge protocol
Branches: REMEDIATION `fix/rem-<finding-id>-<slug>`, DESIGN `feat/w2-<task-id>-<slug>`. One file, one wave, at a
time — if you need a file the other wave owns, record the requirement and hand it over rather than editing.
**The later merger rebases** onto `origin/main`; never merge main into a feature branch. Additive-only on shared
DTOs and frozen tuples. Re-read the ownership row before merging anything that touches a *coordinate* file.

---

> **Read [fix-specs/READ-THIS-FIRST.md](fix-specs/READ-THIS-FIRST.md) before implementing anything.** The twelve
> original cluster files carry the adversarial reviewer's objections inlined under each spec, and the two sometimes
> contradict each other. That file resolves the contradictions once: seven corrections that apply to every cluster,
> eleven verdict overrides (specs you must NOT implement as written), eight hard orderings, and the per-finding
> traps that are easy to miss. `CODEX-GOVERNANCE.md` and `DEFAULTS.md` are already resolved — implement them directly.

---

## 0. Findings that were WRONG — read this before planning anything

The investigation overturned six of my own findings and three of my own planning instructions. Acting on the
original write-ups would have wasted a wave.

| Item | Original claim | Truth at origin/main |
|---|---|---|
| **F9** | "intel cluster is 0/0 / powered down; verdicts stale" | **ECS 0/0 is CORRECT.** The active pipeline runs on **Hetzner** (`deploy/hetzner/compose/intel-cluster.compose.yml`), not ECS. There is no outage. The real defect is that a *config fact* is reported as *health*. |
| **F19** | "three retention crons inert; unbounded growth" | **2/3 wrong.** Audit and delivery-log retention **are already deleting in production** (`isEnabled()` returns true when the flag is *undefined*). Only threat-intel is gated off. The live risk is the opposite of what I wrote: an implicit 30-day audit cut nobody was told about. |
| **F11** | "producer path dead for 14 days" (HIGH) | **DISPROVEN.** No code gate is off; every default is on. Nothing durable distinguishes "no webhook arrived" from "producer broken". Settle by inspection, not by code. |
| **F40** | "web guard fails open on drift" | Far narrower: `driftFailMode` governs **LOW_IMPACT composer sends only** and **never** governs site access. Every SENSITIVE_DATA / ACTIVE_SECRET / FORBIDDEN_DESTINATION row already denies. **Do not change it.** |
| **F21** | "the block wears OpenAI's face because we forward their refusal" | Misdiagnosed. `openai_warn.go:263-265` emits a string literally beginning **"Blocked by Devoid: "**. We *do* attribute. The real defect is that the attribution never reaches a surface the desktop user looks at. |
| **F5** | "receipt is null on tool-call events" | Stronger and different: `enforcementReceiptV2` **can never be non-null on any PROMPT_\* or TOOL_CALL_\* row by contract**, and **no agent produces one anywhere**. Three console surfaces read a field nobody writes. |
| **F36** | "console has no enforced-vs-staged signal; needs a new read model" | The read model **already exists, is already on the wire, and is already rendered by a shipped component** — it is simply absent from the policy page. Far cheaper than planned. |
| *my instruction* | "shared contracts are mirrored in three places; sync all three" | **Wrong for every contract in this wave except one.** The workspace and Intel mirrors contain no AI-governance contracts at all. **F37's `package-intelligence/` is the sole genuine three-way mirror** — and its copies are *already divergent*, so a blind copy-paste renames three S3 buckets in Intel to buckets that do not exist. |
| *my instruction* | "backend first or `forbidNonWhitelisted` 400s the agent batch" | False for every agent route but one. `AgentIngestValidationPipe` sets `forbidNonWhitelisted: false` for `@AuthApiAgent()` routes. The **one** strict route is F24's delegated-approval controller. |
| *my instruction* | "backend before agent is the deploy hazard" | The real hazard runs **backend → old frontend / old extension**. See §3. |

**One new CRITICAL surfaced by the investigation, which nobody had found:**

> **F38-a — the Claude deny-canary can self-certify `PROVEN` with no receipt anywhere.** `claude/canary.go:299-302`
> returns nil when `p.Receipts == nil`, and `:252-257` keeps `Outcome=CanaryProven` even on an upload error. A
> mechanism that exists to *prove* enforcement can currently report proof it never obtained. This is the exact
> manufactured-green pattern the whole programme exists to eliminate, sitting inside the assurance mechanism itself.
> Fix this before making the canary run more often — otherwise the wave scales up a lie.

---

## 1. Two findings added from live investigation (2026-08-09)

Found while diagnosing why the owner is interrupted during ordinary work.

### F41 [HIGH — UX/adoption] The default tool-risk posture warns on three classes that fire constantly, and nothing points at the dial
Live: 7 warns / 705 tool-checks. The enforced policy is **byte-for-byte `defaultToolRiskActions()`** — 25 block (HIGH
tier), 3 warn (MEDIUM tier), 12 allow (INFO tier), `exclusions` completely empty. The three warn classes are
`interpreter-exec`, `fetch-then-exec`, `substitution-exfil`, which fire on inline interpreters and command
substitution — i.e. on ordinary agent work, continuously.

The 2026-08-02 items 40/41 **did land and do work**: all three classes are registered
(`ai-security-policy.constants.ts:213/215/220`), carry real console metadata (`ai-class-metadata.ts:253-255`), are
pinned by a parity spec, and are live in the bundle. They *are* controllable. What did not change is the **default**,
and the product gives the operator no path from "I am being interrupted" to "here is the dial".

`ai_handlers.go:3227-3230` already describes this failure in our own words: *"NO console setting could suppress one.
Operators reasonably read a relaxed autonomy policy as 'stop asking me', set it, and saw no change."* The monitor
lane was built to fix that and the operator still hit the wall from a different direction.

**Fix**: resolved by owner decision **D4 (§7)** — a full re-baseline, not a three-class patch. Block only where there
is no legitimate developer reading; monitor pure structure now; re-promote the dual-use classes to *operand-gated*
warn/block once F8a's expander exists. Plus (b) name the exact class and dial in the interruption text and (c)
surface `exclusions.allow`. **Side**: backend defaults + agent copy. **Effort**: S (defaults) / M (copy + console).
**Depends on**: nothing for the re-baseline; F8a for the operand-gated promotion. Wave 1 + Wave 4.

### F42 [MEDIUM — unconfirmed mechanism] A tool call with zero findings is recorded as `warn`
Two of the seven warns were `toolName=StructuredOutput decision=warn findings=0`. `ai_tool.go:183` logs `findings`
from the **request** and `decision` from the **server reply**, so the two fields are not from the same side and the
log alone cannot attribute it. Same pathology family as F33/F34 (a decision with no finding behind it) but on the
*decision* path rather than the console. **Do not fix blind — instrument first**: log both the local and the
server decision at that site so the next occurrence is attributable. **Side**: agent. **Effort**: S.

---

## 2. Thirty-nine findings collapse into eleven mechanisms

This is the highest-leverage section of the plan. Build the mechanism, not the symptom list.

| # | One change | Closes | Why it is one change |
|---|---|---|---|
| **M1** | Widen the evidence-spool wire once (`evidencespool/types.go` + `spool.go` + `evidence_delivery.go:369`) | F2, F3 (agent half), F4 (pt 1) | Three specs each add a field to the same struct and the same `eventInputFromAppend`. One commit, one validator pass, **one agent release instead of three**. |
| **M2** | `NON_SUBSTANTIVE_EVENT_TYPES` + apply to `aggregateEventStats`, `listSessions`, overview, `getSessionTimeline` | F27, F32 (backend) | "Phantom sessions in the denominator" and "the W6 exclusion never reached the timeline" are the *same missing predicate on the same aggregate*. |
| **M3** | `projectPolicyTamperTransition(metadata)` — flat string bag → typed transition | F33, F34 | Both read the identical bag; one implementation, two readers. |
| **M4** | `winacl.MeasureSecretAssurance(path)` — one ACE walk + a POSIX sibling | F16, F15, F16b | F15 re-declares the primitive F16 also declares. Implement once, three consumers. |
| **M5** | Measured-liveness vocabulary: `PRODUCING / NOT PRODUCING / NOT MEASURED`, never a boolean `healthy`; alarm on a **ratio between two measured facts**, never on `Sum == 0`; `treatMissingData: 'breaching'` | F9, F10, F11, F38, F39, F37 | Six findings, one defect class: **a config fact reported as health**. No shared code, but they must share the vocabulary or the console states the same fact six different ways. |
| **M6** | `internal/mcpsources` declarative source registry | F7, F7b, F7c, F7d | Without it these are four more independent allow-lists — which *is* the defect. |
| **M7** | `shellast.ExpandWord` abstract POSIX expander | F8a (substrate for F8b, F8c) | One mechanism replaces the entire obfuscation transform family. |
| **M8** | `src/common/validation/per-item-batch.ts` + evidence-batch `rejectedEventIds` | F25, unblocks F2, pre-empts 9 more batch endpoints | Head-of-line wedging is *the* mechanism behind `evidence.durable-delivery: degraded`. |
| **M9** | Self-explaining-absence render doctrine: an absence token always carries `title=`, a muted class, `data-absence=`; a null capability renders "Not reported" — never green, never red | F30, F5, F29-render, F31-render, F32-render, F33, F39 | Seven frontend items are the same edit shape. |
| **M10** | Read the verified device identity, not the key id (`req.requestSigningVerifiedAgentId`) | F17 (same doctrine as F15, F36) | Never key a per-machine fact on a fleet-shared or self-asserted value. |
| **M11** | Delete two dead flags, do not add a third | F19 (threat-intel), F37 (precompute) | Both are off-by-default gates on correct shipped capability — but F37 carries a data-review precondition (§5.3). |

**Net: 39 findings → 11 mechanisms + ~14 standalone items** (F1, F6, F12, F13, F14, F18, F21, F22, F23, F24, F26,
F28, F36, UX-01).

---

## 3. The deploy-order rule for this wave is INVERTED

The usual rule is backend-before-agent. In this wave the dangerous direction is **backend → old frontend / old
extension**, because three backend changes make a *currently-working* surface worse on deploy day:

- **F3** — backend emits `source: 'MASKED_PREVIEW'`; the deployed console's allowlist (`types/ai-governance.ts:403`)
  rejects it and renders `WITHHELD / DECISION_UNAVAILABLE` on exactly the rows the wave exists to make investigable.
- **F39** — every 0.5.13 extension already reports a *measured* `ruleCount: 0`. Keying the new ladder on the count
  flips **the entire installed fleet red** for endpoints whose DNR rules are demonstrably armed. Key on
  `ruleCountSource === 'dnr-engine'`.
- **F15** — backend must widen the `@IsIn` enum before any agent can emit a truthful `OS_LOCAL_USER_READABLE`.

> **Rule: frontend allowlists and enum-acceptance ship BEFORE backend emits the new value.**

Four release trains, not three: **Backend**, **Frontend**, **Go agent (MSI — costs the owner a reinstall)**, and
**browser extension (Chrome Web Store — independent of the MSI)**. Target: **one MSI release, one extension release.**

---

## 4. Wave plan

### Wave 1 — Backend unblock *(no client change; fixes production today)*
F24(a) server-side TTL clamp · F25 layers 1+3 · **M2** (F27 + F32 backend) · F26 backend *(after M2, same deploy)* ·
F13 (+ the `:643` signature fix) · F12 · F19 · F14(a)+(c) · F17 *(sentinel, not 401)* · F10 preflight+reaper ·
F11 liveness columns · F36 Stage 1 · **F41 defaults**.

- **Unblocks**: every hold on every installed 7.8.30 agent becomes actionable **with zero agent work** — F24 is the
  single highest-value backend-only fix in the wave. F25 unblocks F2. M2 unblocks the whole SESSIONS console.
- **Proof**: a live delegated-approval create from an *unmodified* endpoint returns 200 with a server-computed expiry
  ≤900s (four consecutive 400s were measured 2026-08-08). Sessions-list `total` equals the rendered page count.
- **Bad wave if** F17 ships its `UnauthorizedException`: `CliSignatureGuard` is **shadow by default**, so
  `requestSigningVerifiedAgentId` is unset for the pre-v2 fleet and **every one of them 401s**. Ship
  `endpointId = verifiedAgentId ?? 'unattributed:'+apiKeyId`. Also bad if F17's migration ships as an unbounded
  `DELETE` — batch it like `audit-retention.service.ts:164-188`.

### Wave 2 — Frontend prepare *(inert; makes Wave 3 safe)*
`normalizePromptTextAccess` accepts `MASKED_PREVIEW` · `AiWebCoverageEndpoint` navBlock fields **keyed on
`ruleCountSource`** · UX-01 · **M9** absence tokens · **F29-render** *(replaces F29-backend)* · F5 console half ·
F32-render panel gates *(not the `showsPromptBlock` reorder)*.

- **Bad wave if** the F39 ladder keys on the count → whole fleet renders critical.

### Wave 3 — Backend declare *(widens every wire the agent release needs; inert alone)*
F2 idempotency + twin-absorb + contiguity · F3 migration + **the `ck_apeag_source_artifact` third branch (omitted by
the spec, mandatory)** · F20 · F30 · **F33+F34 as ONE PR** · F4 pt 1 · F15 enum + migration · F8b class tuples ·
F18 buckets · F38 receipt route + columns · F40 `guardDegraded` · F39 projection · F24 `ttlSeconds` +
`@AgentWireDto()` on the delegated-approval controller · F36 Stage 2 *(endpoint-scoped digest)* · F5 backend
projection *(from the four V1 columns that exist; `receiptProtocolVersion`/`receiptAssurance` **do not exist**)*.

- **Proof**: replay the *deployed* agent's exact bodies against the new backend — byte-identical outcomes, no 400s.

### Wave 4 — THE MSI agent release *(one reinstall; everything Go)*
**M1** · **F22** *(highest customer impact — a blocked secret currently bricks a Codex thread forever)* · F23 · F21
(A+D) · F1 (change C only) · F6 (B+C) · F18 · F26 · F28 · F31 · **F16** · F38 agent · **M6** · **M7** · F24 margin ·
F25 producer clamp · F41 copy · F42 instrumentation.

- **Not in this release**: F3b, F4 pt 2, F8b (gated on F8c), F16b, F15 agent-side if F16's non-elevated reader is
  unresolved.
- **Proof on a real box**: a blocked-secret Codex thread accepts the next turn · a Codex block renders attributed
  text · `AGENT_CONTROL_TAMPER` stops repeating · `devoid mcp scan` covers ≥8 sources and classifies `node_repl` as
  block · one session row per Codex conversation · the console reveals a masked preview end-to-end.
- **Bad wave if** F16 ships without resolving the non-elevated reader — **this is the one item that can permanently
  brick endpoints** (§5.1).

### Wave 5 — Extension release *(Chrome Web Store; independent)*
F39 A–D · F40 A+B *(visibility only)* · F31 extension half · F32 `decisionId` only if the `contentSha256` join is
disproven.
- **Bad wave if** `conversationTitle()` falls back to `document.title` unguarded — that writes the vendor brand
  ("ChatGPT") into `chat_title` as if it were a conversation name, the exact defect F29 exists to remove.

### Wave 6 — Frontend render
F30 banner · F33 console · F5 chips · F36 Stage 1 panel · F27 toggle · F28 continuation chip · F31-render ·
F32-render footnote · merged F39/F40 `webGuardState` ladder · F38 four-state canary panel · F7d coverage panel.

### Wave 7 — Ops / config *(owner-executed)*
`AUDIT_RETENTION_DAYS` explicit · `CERAGON_ENV=production` + prod artifact-cache table · `RELEASE_MANIFEST_PATH`
**plus the backend task-role `s3:GetObject`** *(missing from the spec and the likeliest way F14 ships and changes
nothing)* · CloudWatch alarms · Hetzner intel stack · **NOT** the two correlation keys (F3b deferred).

### Wave 4b — Codex governance *(same MSI as Wave 4; specs in [fix-specs/CODEX-GOVERNANCE.md](fix-specs/CODEX-GOVERNANCE.md))*
The Codex track is **agent-side**, so it rides the same reinstall as Wave 4 rather than costing a second one. Order
within it: **CX-1** (hook command grammar) → **CX-2** (exit-2 deny contract) → **CX-4** (attestation validates the
whole argv; zero canaries can never be MATCHED) → **CX-3** (field repair of already-deployed baselines) → **CX-5**
(pin `hooks=true` / `allow_managed_hooks_only`) → **CX-8** (never convert a transport abort into a policy hold) →
**CX-9** (drop the `cyber_policy` collision) → **CX-10** (replay — *requires CX-1/CX-2*) → **CX-7** + **CX-11**
(authorized opt-out made visible, plus the lesser levers) → **CX-6** (WSL distro coverage) → **CX-12** (demote the
wire proxy to defence-in-depth).

- **Unblocks:** F22 and F23 stop being criticals — once hooks govern at the decision point, a proxy fault is no
  longer a tool outage, and replay sanitation becomes reachable.
- **Deliberately excluded:** any network/WFP containment programme. Scope decided in §7f; residual stated honestly.
- **Bad wave if** CX-3 is skipped — a code fix without the compatibility dispatcher leaves the entire installed
  fleet dead until someone elevates on every machine.

### The release gate *(owner, 2026-08-09 — this replaces the MSI-count budget)*
> *"test everything locally … install it proper all locally … and ship only when everything is verified and tested
> and we are sure it will work now."*

**Nothing ships on a schedule. Things ship when §10 is green with evidence.** Concretely:
- Build the local harness first, including a **real Codex client driven against a locally-built daemon** (CX
  scenarios) and the local Docker stack that mirrors production for the Backend/Frontend waves.
- A wave is releasable only when every §10 row it touches is PASS **with its defeat step exercised**. A row whose
  defeat step does not turn it red is NOT-RUN, and NOT-RUN blocks the wave.
- Two release trains remain: **one agent MSI** (Waves 4 + 4b together) and **one extension** (Wave 5). Backend and
  Frontend ship independently and earlier.
- Deploy order is fixed regardless of readiness: frontend allowlists → backend → agent MSI → extension.

---

## 5. Risk register — the three most likely production incidents

### 5.1 F16 — a non-elevated shim mints a new signing key → permanent unrecoverable 409 fleet-wide
The spec asserts the private key has "zero non-elevated readers". **False.** `ConvergeTrustAnchor` is reached from
`main.go:4583` (`runShim`, the **non-elevated** governed-install path). After a SYSTEM+Admins-only split that path
cannot open the identity file, `cfg.AIEndpointSigning` resolves nil, and `trust_anchor_client.go:244-250` **mints a
fresh Ed25519 key** against a backend row holding the old one → the permanent 409 documented at
`setup_installer.go:170-178`. Compounded: `loadCredentials` has no non-fatal error channel, so EACCES is fatal and
**every non-elevated `devoid` command dies**.

**Guards (all three, non-negotiable):** (1) a **call-graph** reader inventory landed as a test that fails when a new
non-elevated caller appears — not a grep; (2) never mint when the identity file exists-but-is-unreadable — distinguish
`ENOENT` (mint) from `EACCES` (refuse, report `identity-unreadable`, degrade); (3) map EACCES to a typed non-fatal
degraded state.

### 5.2 F2 — the durable twin 409s and wedges the entire evidence lane permanently
NULL `emitterStreamId` on the synchronous row → `AiEventIdentityConflictError` → 409 → non-retryable →
`delivery.go:47-56` max backoff and **retain** → oldest-first → the WAL never advances until the 1,000,000-event
bound. Every timed-out governed decision (26/136 measured) triggers it. Even with the conflict relaxed, the skipped
emitter sequence is a **permanent contiguity gap** → `evidence.durable-delivery` stays degraded forever, which is the
symptom F2 is named after.

**Guards:** F25's `rejectedEventIds` lands first and `AcknowledgeThrough` **never advances the watermark past a gap** ·
the twin path is an explicit absorb branch keyed on `existing.emitterStreamId IS NULL` · decide the sequence
reservation and pin it with a live-PG test asserting the floor advances after a twin.

### 5.3 F37 — deleting the precompute flag turns on live BLOCK verdicts from 1170 unreviewed rows
`endpoint.service.ts:66` is a **second** consumer, for the `SYNTHETIC_SHA` ecosystems `mcp` and `editor-extension`.
Today the flag returns null → ALLOW. Delete it and every discovered MCP server and editor extension is adjudicated
against a table nobody validated — landing directly on **MCP discovery→console, a capability proven working**. Worse,
that path documents that infrastructure errors **propagate** (5xx), so the proposed production `throw` is not
contained.

**Guards:** gate deletion and the 1170-row content review are **one work item** · make the `CERAGON_ENV` resolver
throw lazily and only on the package-gate path · set `CERAGON_ENV=production` **before** the code lands.

*Narrowly missed the top three, guard anyway:* **F8a** (`rm -rf $DESTDIR/usr/lib` newly blocks — the split rule must
not apply when the unknown expansion is a *prefix* of an argument word) · **F39** (fleet-wide false red) · **F1
change B** (removes the only event-side containment signal before a console surface is confirmed to render it) ·
**F36 Stage 2** (`getPolicyForOrg(..., null)` drops the team fold *and* calls `ensureAckSigner` — a key-mint **write**
— inside a `GET`).

---

## 6. Do NOT fix these

| Item | Decision |
|---|---|
| **F3b — governed keyed artifact lane** | **Defer entirely.** Its own change list instructs the fleet-wedging failure it warns about. F3's masked lane delivers the customer-visible outcome with **no new secret and no key custody**. Do not provision the correlation keys in this wave. |
| **F5 protocol-2 receipt producer** | Do not build. State the capability gap once on `rollout-readiness.service.ts` and fix the three console surfaces to read the V1 tuple that exists. |
| **F29 backend (delete the `repo` rung)** | **Drop; ship F29-render instead.** The backend fix silently breaks `sessionLabelOrNull`, so every activity and detections row for a repo-only session loses its label, and churns ~8 fixtures. F29-render is frontend-only and preserves the label. |
| **F32-render's `showsPromptBlock` reorder** | Provably self-defeating — it deletes the honest NOT_PROMPT_BEARING sentence for all 17 non-prompt types. Gate the three `PromptEvidencePanel` mounts only. |
| **F4 part 2 (opaque `Surface` struct)** | `omitempty` has no effect on structs → `source_surface` silently becomes `''` fleet-wide. Ship part 1 and enforce with a **round-trip test**. |
| **F16b (local-group narrowing)** | **Descope.** XL, new syscall plumbing, and a fail-open landmine (`expectedACEs` dispatches on string equality → templated SDDL hits "unknown descriptor" → empty daemon token → guard fails **open**, per the 7.8.14 incident). F16 alone removes the private key from the Users-readable boundary — that is the CRITICAL. |
| **F40 `driftFailMode`** | Do not change. 48/392 rows are `policyFailOpenRequired`, **all LOW_IMPACT**; electing `closed` blocks every send on a drifted site, unfixable by the customer for days. Ship visibility + the recommendation. |
| **F8b `shell-not-analyzed` as a Finding class** | Would trip `ai_handlers.go:2588` and start shipping a redacted command preview for most Windows traffic — reversing a LOCKED decision. Implement as a **coverage attribute on the decision**. |
| **F9 ECS-vs-Hetzner** | The 0/0 is correct. No code fix; stop reporting a config fact as health (M5) and annotate `ceragon-power-on.ps1`. |
| **F11** | Owner settles it in one check with zero code. If arrivals are zero, **restate as "no work arrived"** rather than leaving a HIGH dead-producer claim. |
| **F1 change B** | Hold until a console surface is **confirmed** to render `PolicyIntegrityReport.Containment`. Landing it blind trades 138 alerts for zero signal — an honesty regression in the other direction. Change C is independently correct. |

---

## 7. Decisions taken (owner, 2026-08-09)

### D1 — F8: build the instrument, gate on measurement, iterate until polished
*Owner: "no real customers … do both and actually verify and gate everything and test and improve until we finish it."*

Sequence: **F8a ships in Wave 4** (the expander alone closes the field-separator, line-continuation and
backslash-hidden bypasses on every existing rule). **In parallel**, build the corpus instrument as a first-class
deliverable rather than a gate we cannot satisfy:

- A local, **endpoint-only, opt-in** command capture. Raw command text **never leaves the box** — the replay scorer
  runs locally and emits only counts and class names. This is deliberately the one place raw command text is
  retained, so it must be time-boxed (default 14 days), ACL'd SYSTEM+Admins, and purged on disable.
- `cmd/ai-shell-corpus-score` replays the captured corpus against the old and new analyzers and reports
  **newly-blocked-benign** and **newly-caught-attack** counts.
- **F8b's rollout gate**: it ships when a replay over ≥7 days of real traffic on the dev fleet shows **zero
  newly-blocked benign commands**, and the known-attack corpus (every confirmed transform plus the not-proven ones)
  is fully caught. If the gate fails, tune and re-measure — do not lower the gate.

F8b's `shell-not-analyzed` remains a **coverage attribute on the decision**, not a Finding class (§6).
**F8c is promoted from a blocked gate to a shipped instrument**, and it is the only reason F8b can be trusted.

### D2 — F15: scope the attestation to what it actually authenticates, and report the rest explicitly
*Owner: my call.*

`aiTrustStorageAssurance` is the **trust anchor's** claim, so it measures the **signing-key identity file only** —
that is the artifact the attestation authenticates with, and scoping it there makes `OS_PROTECTED` reachable once
F16 lands. A weakest-link reading would be honest but inert: with F16b descoped the bearer stays Users-readable, so
the field would report degraded forever and carry no signal at all.

To avoid hiding the bearer's real exposure, add a **separate measured field** for the credentials file
(`credentialStorageAssurance`). Two measured facts, each scoped and named; nothing averaged, nothing hidden. The
enum must carry a truthful degraded member (`OS_LOCAL_USER_READABLE`) and it ships **backend-first** (§3).

*Principle: an attestation states precisely what it covers. Never average two security properties into one word.*

### D3 — F16: broker convergence through the SYSTEM daemon; the key never leaves SYSTEM
*Owner: my call.*

The non-elevated shim stops reading key material entirely. It calls the **already-running SYSTEM daemon** over the
existing local IPC — which it already authenticates to with the daemon token — and asks it to perform trust
convergence. This is the standard key-isolation pattern (ssh-agent, CNG/DPAPI, TPM): *you never hand out the key,
you ask the holder to act.* It closes the class rather than the instance, so no future non-elevated code path can
reintroduce the read.

Cheaper alternatives rejected: splitting out a public-identity file adds a second artifact to keep in sync and still
leaves the private key readable by anything that later wants it; refuse-and-degrade prevents the brick but removes a
capability that works today.

**Mandatory regardless of approach** — these are the anti-brick guards, not options:
1. A **call-graph** reader inventory landed as a test that fails when a new non-elevated caller of
   `ConvergeTrustAnchor` / `ReadAITrustMaterial` appears. Not a grep.
2. **Never mint on an unreadable identity file.** `ENOENT` → mint. `EACCES` → refuse, report `identity-unreadable`,
   degrade. Minting against a backend row that holds the old key is the permanent-409 brick.
3. `loadCredentials` maps `EACCES` to a typed non-fatal degraded state — never to a fatal error.

### D4 — F41: re-baseline so the default is genuinely open, and earn the strictness back with F8a
*Owner: "make a baseline that is actually open and only block or warn on real malicious shit and let the ai work."*

Re-tier on one principle: **block only where there is no legitimate developer reading; warn only when a dual-use
shape carries a dangerous operand; monitor pure structure.**

| Tier | Rule | Classes |
|---|---|---|
| **BLOCK** | unambiguous intent — no legitimate reading in an agent context | `reverse-shell`, `content-reverse-shell`, `fork-bomb`, `destructive-mkfs`, `destructive-dd`, `destructive-devwrite`, `devoid-self-disable`, `sensitive-write-devoid`, `sudoers-edit`, `sensitive-write-sudoers`, `authorized-keys-write`, `sensitive-write-authkeys`, `firewall-disable`, `history-wipe`, `docker-socket-abuse` |
| **WARN** | dual-use, and only with a destructive / credential / exfil operand | `destructive-rm` (system paths), `cloud-cred-read`, `data-exfil`, `chmod-sensitive`, `git-history-destroy`, `untrusted-network-install` |
| **MONITOR** | structure only — fully evaluated, posted, in the ledger, never interrupts | `interpreter-exec`, `fetch-then-exec`, `substitution-exfil`, `pipe-to-shell`, `base64-pipe-shell`, `content-pipe-shell`, `powershell-download-exec`, `generic-pipe-shell`, `dynamic-eval`, `content-spawn-shell`, `chmod-broad-777`, `docker-cp-host`, `privilege-escalation`, `sensitive-write-git-hooks`, `sensitive-write-shell-hooks`, `sensitive-write-shellrc` |

**The cost, stated plainly:** moving `pipe-to-shell`, `base64-pipe-shell`, `powershell-download-exec`,
`chmod-broad-777` and `fetch-then-exec` to MONITOR **removes the exact blocks proven live in PL/CC-1**. Those five
paired trials were the demonstration that the command lane works and discriminates. Findings are still detected,
posted and rendered — but nothing is stopped.

That trade is right for a pre-customer dev tenant and **wrong as a permanent product default**. The WARN tier above
is written as *operand-gated*, which is not implementable today: judging "does this carry a network sink or a system
path" needs exactly the argv expander F8a builds. Therefore:

- **Now (Wave 1)**: the table ships as the default, with the five dual-use classes at MONITOR. The AI works.
- **After F8a (Wave 4+)**: re-promote the dual-use classes to operand-gated WARN/BLOCK — a fetch piped into an
  interpreter from an untrusted host warns; an ordinary local script run stays silent. Strictness is **earned back
  with precision**, not with structural shape.

`devoid-self-disable` keeps its self-defense floor (`ai_handlers.go:3328`) and can never relax below warn — by
design, do not touch it. Also ship F41(c): surface `exclusions.allow` in the console, and name the exact class and
the exact dial in every interruption.

**F42** rides along in Wave 4: log both the local and the server decision at `ai_tool.go:183` so the next
contentless warn is attributable.

---

## 7b. F43 [CRITICAL] — Codex is ungoverned RIGHT NOW, and our own availability guard is the reason

Measured 2026-08-09 01:37 local on the production endpoint. This supersedes the earlier "Codex desktop is PROVEN
COVERED via the wire lane" correction: it *was* covered, and it is not any more.

**What `devoid ai status codex` reports:**
```
R5-provider-route    missing (managed-file-absent)
R7-hook-cooperative  missing (hook-entry-absent)
R8-hook-lifecycle    missing (hook-entry-absent)
PreToolUse / PermissionRequest / SessionStart / SessionEnd :  NEVER FIRED
wire egress route:   last carried 2026-08-08T18:33:07Z
[!] NEITHER Codex layer is clean.
```

**Corroborated independently:** `~/.codex/managed_config.toml` **does not exist**. A live `codex exec` run reported
`provider: openai` (not `devoid`), produced **zero** daemon proxy log lines, and printed `hook: SessionStart Failed`
/ `hook: UserPromptSubmit Failed`. The daemon has recorded **no** `ai_proxy_decision` since 18:33Z yesterday — which
is the exact minute the owner was fighting the conversation our own block had bricked.

**Why it matters more than any other Codex finding:** the wire lane is the *only* lane that governs Codex (the hook
lane fails on every event and fails OPEN). With the provider route absent, Codex has **no enforcement, no detection
and no evidence** — while the product's own daemon log shows it *chose* this state:

> `AI-agent auto-wire skipped (desktop app present + daemon proxy not healthy — R5 route would brick it) agent=codex`

So our availability guard silently declines to install the only governing lane, and — on the evidence so far —
never restores it when health returns. Two candidate causes for the file's disappearance, not yet distinguished:
the owner removed it to get their tool back after F22 bricked a thread, or the agent removed/declined to rewrite it.
**Either cause is a product failure**, and the second is worse.

**Credit where due:** the CLI surface is *honest* — it says "missing", "NEVER FIRED", "NEITHER layer is clean". The
defect is that nothing **proactively** surfaces it: you must run a CLI command to discover that your AI governance is
off. The console shows no Codex coverage state at all.

**Fix directions** (being designed by the Codex-engine deep dive; results land in `codex-deep-dive/`):
1. The provider route is **owned state**, not fire-and-forget — detect absence/tamper and repair it, with a bounded
   retry when the proxy is unhealthy rather than a permanent silent skip.
2. **An ungoverned window must raise an event and a console state**, never just a log line. "Codex governance is OFF"
   is exactly the kind of fact that must reach the operator without being asked.
3. Fix the underlying reason the guard fires (F23's panic) so the guard stops needing to.
4. Determine whether the **CLI** was *ever* governed by the wire lane — if it ignores `managed_config.toml` this is
   a standing bypass rather than a regression, and it is the highest-severity item in the whole Codex programme.

**Do not "fix" this by force-wiring the route while the proxy is unhealthy** — that is precisely the brick the guard
exists to prevent. Repair belongs behind a health gate plus the F23 fix, not in front of it.

---

## 7c. F6 REWRITTEN [CRITICAL] — the Codex hook lane is dead because we generate the WRONG COMMAND LINE

Found by the Codex-engine deep dive (`gpt-5.6-sol`), 2026-08-09. The sensitive raw output is retained locally and is not published. **This replaces F6's root cause
entirely. The dialect-pin explanation we have carried since 2026-08-02 is a red herring.**

**The mechanism.** The machine baseline builds `HookCommand` as bare `os.Executable()`
(`cmd/devoid/ai_codex_machine.go:100`, `cmd/devoid/ai.go:1463`) and the projection appends only the canonical event
token plus a provenance marker (`internal/codexmanaged/machine_projection.go:623,630`). So
`requirements.toml` tells Codex to run:

```
devoid.exe SESSION_START <marker>
devoid.exe USER_PROMPT_SUBMIT <marker>
```

when the real entrypoint is `devoid.exe ai hook --adapter codex --event SESSION_START --provenance <marker>`.
`devoid.exe` does not recognise `SESSION_START` as a top-level command, prints `Unknown command:` and **exits 1**
(`cmd/devoid/main.go:341,428,430`). `runAIHook` is reachable only via the two-level `ai hook` dispatch
(`cmd/devoid/ai.go:36,81,584`) and is therefore **never entered**.

**Why that is total.** The Codex deny contract enforces a deny only when the hook exits 0 with a recognised non-empty
payload; `ExitCode != 0` returns false *before stdout is even inspected*
(`internal/airuntime/adapters/codex/response.go:276,283`). So every hook fails open. Our own committed 0.146 capture
already shows it: `SessionStart` / `UserPromptSubmit` / `PreToolUse` all print `Failed`, the tool still executes, and
Codex exits 0 (`testdata/shook/corpus/builds/0.146.0-alpha.9.2/capture-transcript.txt:14,37,41,43`).

**Compounding it:** `allow_managed_hooks_only=true` suppresses the user-scope hook fallback
(`machine_projection.go:338`), so the *correctly formed* cooperative scripts cannot compensate. Broken machine
command + suppressed fallback = **zero hook governance on every machine, on every Codex version, since this shipped**.

**Why our own surfaces never caught it:** structural attestation validates only that the first executable resolves,
not the full argv (`internal/codexmanaged/provider.go:441,477`) — it accepts a command that enters the wrong CLI
path. And machine status returns `true` when composition is clean while printing that enforcement is merely
`CANARY_PENDING` (`cmd/devoid/ai_codex_machine.go:284,289,294`) — a false green.

**The fix.**
1. Machine projection must render the real entrypoint (`ai hook --adapter codex --event <CANONICAL> --provenance
   <marker>`). The cooperative script already shows the correct Windows and Unix forms
   (`internal/codexmanaged/script.go:80,84,89`).
2. **Deployed baselines already carry the malformed short form**, so add a compatibility dispatcher in
   `cmd/devoid/main.go` recognising the five canonical event tokens and routing them into `runAIHook`. Without this,
   a code fix repairs nothing until every machine's `requirements.toml` is rewritten with elevation.
3. Attestation must validate the **complete argv**, not just that the executable exists.
4. Machine status must not report success before a live negative-control canary — tie this to F38.
5. Keep `allow_managed_hooks_only=true`, but only activate it alongside a *verified runnable* machine command.

**Corrections to our own status surface** (also from this pass):
- `SessionEnd` is **not in Codex's event enum** and can never fire as a hook; DeVoid relies on daemon
  shutdown/idle tracking. Listing it as a checkpoint is misleading (`internal/codexmanaged/hookset.go:15`).
- `PermissionRequest` does not fire under `codex exec` (approvals forced to `never`), so its absence in a CLI test
  is not evidence of the bug (`internal/airuntime/adapters/codex/codex.go:24`).
- The status list does not match the configured set: machine governance installs PreToolUse, UserPromptSubmit,
  PostToolUse, SessionStart, PermissionRequest; status reports PreToolUse, PermissionRequest, SessionStart and the
  nonexistent SessionEnd — **omitting two real events and inventing one** (`hookset.go:63` vs
  `cmd/devoid/ai_codex_hooks.go:346`).

**Two forward-looking risks surfaced in the same pass:**
- **Silent DLP blind spot.** The Responses request scanner tolerates unknown JSON fields, but unknown *input-item or
  content-part types are preserved without being scanned* (`internal/proxy/openai_frame.go:98,104,112,137`). If the
  vendor moves user text into a new content type, prompts stop being inspected **and nothing reports it**.
- **Our synthetic block/hold SSE protocol** is pinned to Codex recognising `response.failed`, `cyber_policy` and
  `invalid_prompt`, and was live-tested only on 0.144.5 and 0.146.0-alpha.9.2 (`internal/proxy/openai_sse.go:268,
  286,311,397`). Behaviour on a client that changes those semantics is UNPROVEN — this is F21's real fragility.
- Signed policy bundles **cannot** widen hook-trust today: the prefixes and identity algorithm are compiled, one of
  them a Go function pointer (`internal/codexmanaged/hookdialect.go:42,89,96`). Widening support without a binary
  release requires a bounded declarative dialect interpreter that does not exist yet.

---

## 7d. F44 — Codex egress-bypass inventory (and a CORRECTION to F43)

Codex-engine audit, 2026-08-09. The sensitive raw output is retained locally and is not published.

### CORRECTION to F43 — "it never restores the route" is NOT proven
HEAD **does** contain repair machinery, added after the permanent-unwired race was documented: a reconcile attempt
on every shim/agent invocation (`cmd/devoid/ai_wire_retry.go`), a per-user scheduled task that checks every 5 min
and acts when a 15-min throttle expires (`internal/aiwiretask/aiwiretask.go:140,156`), and a daemon pass every
5 min that repairs that task while correctly refusing to write user files as SYSTEM
(`internal/daemon/server.go:1942,1999`). So it is an **indefinite retry mechanism, not a permanent skip**.

What remains true and is the real defect: registration is **best-effort — its failure neither fails installation nor
prints anything** (`cmd/devoid/ai_wire_user_task.go:35`), the health-gated deferral is **Info-log-only**
(`ai_wire_retry.go:178`), and desktop / extension / raw-binary use need not invoke the shim at all. Whether *this*
endpoint carries the retry fix, has the task installed, or ever ran it is **UNPROVEN**.

### The CLI is NOT a standing bypass — hypothesis disproven
`managed_config.toml` is proven-consumed by the **CLI and headless `codex exec`**
(`testdata/scfg/FINDINGS_MANAGED.md:57`), the **desktop app** (`internal/aiwire/desktop_codex.go:9`) and the
**VS Code extension** (`internal/aiwire/codex_ide_extension.go:8`). So today's ungoverned CLI is the *absent file*
(F43), not a design hole. **But desktop/extension HOOK dispatch is UNPROVEN** — only CLI hook dispatch has ever been
demonstrated (`cmd/devoid/ai_codex_hooks.go:534`, `merge.go:206`).

### Real bypasses, ranked
| Path | Bypasses R5? | Note |
|---|---|---|
| Managed file absent | **Yes** | the current live state (F43) |
| Edit `model_provider`/`base_url` in the managed file | **Yes** | detected as tampering, but detection does not prevent the request before reconcile (`transport_route.go:71`) |
| **Alternate `CODEX_HOME`** | **Yes** | relocates *both* user config and the managed-file lookup; an empty alternate home is simply unwired (`FINDINGS_MANAGED.md:184`) |
| Foreign MCP process / HTTP server | **Yes (secondary)** | an MCP server makes its own provider call — never a Codex Responses request, so never reaches R5 |
| `sandbox_workspace_write.network_access=true` | **Yes (secondary)** | sandbox egress lets shell/REPL code contact a model independently of the route |
| Second provider entry, `-c` override, profiles, project config | only when R5 absent | the managed selector outranks all of them per key |
| `OPENAI_BASE_URL` | **UNPROVEN** for Codex itself | we recognise it but neither inject nor override |
| `CODEX_MODEL` | No | no effect in the tested build |
| WebSocket lane | No | managed config disables it; the daemon returns 426 and the client falls back to SSE |

### Four more defects worth their own rows
1. **No tamper event for deleting the managed file.** The filesystem watcher watches Codex `config.toml`, **not
   `managed_config.toml`** (`internal/daemon/server.go:1883`); user managed-file targets are inspect-only and the
   integrity controller stores them as unknown without entering the managed-target event path
   (`airuntimeintegrity/controller.go:426`). This is why F43 produced no event.
2. **The health gate is applied inconsistently.** Only the shared-core branch checks `DaemonHealthy`
   (`internal/aiwire/aiwire.go:295`); the **full CLI-only profile writes R5 with no health check** (`:269`) — the
   anti-brick guard has a hole in it.
3. **High-risk foreign governance rolls up as `[OK]` with exit 0** (`requirements_test.go:556`,
   `ai_codex_hooks.go:380`). Deliberate, to avoid fleet-red on ordinary foreign config — but wrong for executable
   MCP servers, trusted system/temp trees and live `network_access=true`. Those must be non-green.
4. **Wire coverage is text DLP, not upload inspection.** `input_image`, encrypted content and opaque/unknown items
   are deliberately not scanned (`internal/proxy/openai_frame.go:71,147`). Binary uploads transit R5 uninspected.
   Label it honestly rather than letting transport presence imply upload DLP.

### The user-facing message is actively misleading
Enrollment prints "CLI still governed via shim" when R5 is skipped (`cmd/devoid/setup_installer.go:399`). It must
say what is actually true: *launch policy may still apply through the shim; Codex model egress and DLP are NOT
governed until the healthy proxy route is restored.*

### The deliverable
A durable **`CODEX_WIRE_UNGOVERNED` episode**: opens when R5 goes missing/tampered or health-gated repair defers,
records reason + affected home/surface + start/last-attempt/next-retry, and closes only after health passes, the
rewrite succeeds, **and a fresh attestation observes the canonical route**. Plus retry liveness in status and
heartbeat (task present/correct, last run, last health result, consecutive failures, next retry), and treating an
alternate `CODEX_HOME` or an absolute bundled binary as a first-class runtime instance to report.

**Still not permitted:** wiring the route while the proxy is unhealthy. The correct behaviour in that window is
*available but explicitly ungoverned, durably recorded, prominently visible, and repaired only after the gate passes.*

---

## 7e. CODEX TRACK — superseded by the planner handoff

**[`fix-specs/CODEX-GOVERNANCE.md`](fix-specs/CODEX-GOVERNANCE.md)
is now the published authority for the entire Codex track** (derived from the private investigation and verified against installed revision `36ca1ad3`, `vcs.modified=false`).
It supersedes F21, F22, F23, F43 and F44 above where they conflict. Sections 7b–7d are retained only as the record of
how we got here. Its verdict on the question the owner asked:

> **No — not with the current architecture, and not by fixing only the six immediate defects.**

### It corrects five of my claims — read these before planning
1. **"Codex is ungoverned" was too broad.** True for Windows CLI/Desktop. The active **VS Code lane runs Codex in
   WSL**, and `/home/owner/.codex/managed_config.toml` *does* point at `127.0.0.1:19280` with a healthy probe. Our
   status conflates "Windows root missing" with "all Codex surfaces ungoverned" — a **wrong-namespace** bug.
2. **The route is not absent because of the health gate — there is a second cause.**
   `~/.devoid/aiwire-optout/codex_23ae6a2f462d7339.json` **exists** and matches the normalised Windows Codex-home
   hash, with **no** corresponding managed-authority seal. In cooperative mode reconcile honours that marker and
   returns *before* proxy health or file repair (`local_disablement.go:44`, `aiwire.go:232`).

   **Marker intent RESOLVED 2026-08-09 (was UNPROVEN):** written `2026-08-08T21:57:52Z` by the **owner**, running
   the un-brick command I gave them after F22 + F23 made Codex unusable. Verified: no subagent in this session ever
   executed the devoid binary (0 occurrences across all transcripts), and no other concurrent Claude session ran a
   governance-mutating command. So it is **deliberate and authorized** — not residue, not a rogue self-disable.

   **This is the most damning product finding in the Codex track, and it is a bigger deal than a mystery bug would
   have been.** The only remedy available to a customer whose AI tool our block had bricked was **to switch our
   security product off**. There is no lesser lever — no per-thread bypass, no time-boxed pause, no "disable for
   this conversation". And once off: nothing surfaces the state, nothing expires it, nothing ever asks to re-enable.
   A security product whose documented escape hatch is "uninstall the governance" converts one bad turn into
   permanent, silent non-coverage.

   **Required (extends the report's `SKIPPED_AUTHORIZED` recommendation):**
   (a) render authorized opt-out as **visibly missing + authorized**, never green and never as a fault to auto-repair;
   (b) opt-out must carry **who, when, why, and an expiry** — a default TTL after which the product asks again;
   (c) ship the **lesser levers** so disabling governance is never the only way out: a scoped one-turn bypass, a
   time-boxed pause, and a "this thread is poisoned — start a new one" affordance (which is the actual F22 remedy);
   (d) surface the opt-out in the console as an endpoint coverage state, not only in a local CLI command.

   **Do not auto-clear this marker as part of any fix.** Re-enabling the route while F22/F23 are unfixed simply
   re-bricks the owner's Codex — which is how we got here.
3. **The three panics did NOT kill their turns.** They fired 6.8–9.1s after ALLOW and client state shows the turns
   kept terminal/useful output — one executed a tool afterwards, another received `response.completed`. The defect is
   real but different: the catch-all recover **misclassifies an unknown transport copy failure as a policy hold**,
   producing false "held" telemetry. A *pre-terminal* abort could still kill a turn. F23's severity and framing were
   wrong.
4. **"Fails closed" is not accurate** — after headers are committed, a reclassified abort is not reliable fail-closed
   and may never reach the client.
5. **"Codex denies only on exit 0 JSON" is incomplete** — gating hooks also block on **exit 2 with non-empty
   stderr**. We exit 1, so the deployed hook still fails open. (This also corrects the earlier Codex run.)

### The dependency that reorders the whole Codex wave
**F22 (thread poisoning) is downstream of F6-REWRITTEN (dead hooks).** The deployed replay sanitizer is unreachable
because its only current-turn boundary oracle is the dead `UserPromptSubmit` hook: no `RecentPrompt` is written
(`ai_handlers.go:1603`), so `currentKnown=false` and sanitation is refused (`ai_context_replay.go:86`), so the
full-history decision re-blocks the historical secret. **Fix the hook grammar and replay recovery largely follows.**
Two further defects there: the correlation store is global, 30-minute, not session-bound and matched with
`strings.Contains` (`ai_recent_prompt.go:17`); and the `previous_response_id` deny-key collision is real but
**dormant** on the current SSE transport.

### F21's real mechanism — a reserved-code collision, not malformed SSE
We emit `error.code="cyber_policy"`; Codex preserves our message but classifies it as `CyberPolicy`, and the
TUI/Desktop/VS Code all branch on that classification to render **OpenAI's fixed cyber-safety surface instead of our
text**. The replacement contract: HTTP 200 SSE, a secret-free `response.output_item.done` assistant item naming
DeVoid plus an opaque decision id, then `response.failed` with non-retryable `invalid_prompt`; **never**
`response.completed`; headers for diagnostics only. Do not inject a system message upstream. Note the WS lane's
403/custom error is *retryable* in Codex and must not be enabled.

### New bypasses beyond F44
Direct upstream executable (npm wrappers / WindowsApps binaries bypass the shim entirely) · **remote app-server**
(`--remote` moves the model leg off-host) · the retry stamp is written **before** successful repair and is keyed too
broadly, so rotating `CODEX_HOME` evades repair within the interval (`ai_wire_retry.go:52-119`).

### The architectural verdict
`managed_config.toml` is **a high-precedence configuration file, not an enforcement boundary** — user-owned,
relocatable, avoidable via direct binaries or remote app-server, invisible across IDE/WSL namespaces. "100% of
traffic transits our proxy" is **false as an enforcement proposition** without independent egress authority. And
Windows WFP containment is **UNPROVEN** — only an abstraction exists in the repo, no production engine.

Also: Task Scheduler result 0 currently covers *all* of throttled / runtime-absent / opt-out / proxy-unhealthy /
write-failed / compliant / repaired. And the health gate reads **unauthenticated marker text** and is locally
spoofable (`setup_installer.go:709`).

### Unresolved contradiction between the two Codex runs — settle before implementing
The earlier run concluded `SessionEnd` is **not** in Codex's event enum and that listing it is misleading; this
report states Codex 0.147 **does** support `SessionEnd` and that DeVoid's managed list wrongly **omits** it. Both
cite source. Resolve against the 0.147 event list before touching `hookset.go`.

### Build order (from the handoff, adopted)
1. Close the live Windows bypass; define managed-vs-cooperative authority. 2. Independent egress containment — or
explicitly drop the hardened-enforcement claim. 3. Stable gateway / safety-floor split with a functional health
proof. 4. Repair legacy hooks + semantic canary attestation. 5. Fix stream abort classification, add directional
relay telemetry. 6. Session-bind replay correlation; move deny memory after sanitation. 7. Replace `cyber_policy`
attribution; certify every packaged client. 8. Replace the timestamp retry with a durable repair state machine.
9. Cross-surface runtime inventory (Windows, Desktop, VS Code, WSL, MCP, remote). 10. Run the full defeat-test matrix.

**This does not fit the single-MSI budget in §4.** The Codex track is now its own programme; re-plan Wave 4 around
items 4–7 only, and treat 1–3 as a separate architecture wave.

---

## 7f. HOW TO GOVERN CODEX LIKE CLAUDE — settled against OpenAI's own source

Codex-engine audit of `openai/codex` @ `rust-v0.147.0`, 2026-08-09. The sensitive raw output is retained locally and is not published. **This section supersedes
the "cooperative vs contained" framing in 7e** — the choice is narrower than it looked.

### The reframe: Claude's governance is ALSO cooperative
We govern Claude Code through hooks in `~/.claude/settings.json` — a **user-writable file** that any local user can
delete, and whose handler failing means the turn proceeds (F18). Claude is not a hard boundary either. So the goal
was never "make Codex as strong as Claude" — it was "stop governing Codex through a fragile network proxy and start
governing it at its decision points, the way we already do with Claude."

**Done right, Codex can be governed BETTER than Claude**, because Codex has something Claude does not: a
**machine-scope requirements file** that is SYSTEM-owned, ACL-protected, and — now proven — **survives `CODEX_HOME`
rotation and direct invocation of the same binary** (`config/src/loader/mod.rs:641-657`).

### What we must change to get there (all verified against vendor source)

1. **Exit 1 never denies. Exit 2 + non-empty stderr does.** Our handler exits 1, so even with a correct command line
   it would fail open. The portable deny path for the six block-capable events is **exit 2 with a non-empty trimmed
   `stderr`**, or exit 0 with event-specific JSON (`hooks/src/engine/output_parser.rs:338-356`).
2. **Use the `commandWindows` key.** On Windows Codex prefers it over `command` (`discovery.rs:458-469`), and it runs
   the string as `COMSPEC-or-cmd.exe /C "<entire command>"` with an extra raw outer quote pair
   (`command_runner.rs:168-218`) — **not** argv-split. Our command must be written to survive `cmd /C` quoting.
3. **The deny-capable set is six**, not the four our status surface reports: `PreToolUse`, `PermissionRequest`,
   `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`. `PreCompact`/`PostCompact`/`SessionStart` can only halt
   via exit-0 `{"continue":false}`. `SessionEnd` and `SubagentStart` are **not deny-capable at all**.
4. **`SessionEnd` DOES exist** — settles the contradiction in 7e. The earlier Codex audit was **wrong**; the enum has
   eleven events (`protocol/src/protocol.rs:1497-1511`). It is notification-only, and its timeout is **1s default /
   3s max**, unlike the 600s default elsewhere — our handler must be fast on that event or it is dropped.
5. **Pin `[features] hooks=true` and `allow_managed_hooks_only=true`** in the machine requirements. Without the
   feature pin, hook construction is gated off entirely (`core/src/session/mod.rs:4137-4167`).
6. **Deploy `/etc/codex/requirements.toml` inside every WSL distro.** Selection is compile-target based — a Windows
   binary reads ProgramData, a Linux binary reads the literal `/etc/codex`. There is **no** `/mnt/c` bridge
   (`loader/mod.rs:641-657`). Your VS Code lane runs Codex in WSL, so today it is entirely outside the machine lock.
7. **Protect the handler and its dependencies**, not just the requirements file — the command still runs through a
   **user-controlled `COMSPEC`**.

### What machine hooks still do NOT close (be honest about these)
- **Fail-open on handler failure** is deliberate in Codex: spawn error, timeout, crash, malformed output, exit 1, or
  any unexpected exit are recorded as failed and **allow**. A dead daemon is an ungoverned turn — the same property
  Claude has (F18), now confirmed structural on both.
- **`COMSPEC` is user-controlled**, so the hook is launched through a shell the user can replace.
- **Legacy-lane classification hole:** `$CODEX_HOME/managed_config.toml` hooks are classified as *managed*
  **regardless of actual ACL**, so `allow_managed_hooks_only` does not filter them
  (`config/src/loader/layer_io.rs:170-181`, `hooks/src/engine/discovery.rs:677-690`). A rotated `CODEX_HOME` can
  therefore inject hooks that survive the filter.
- **`--remote` escapes entirely** — the remote server's config governs, not the local machine file.
- **A patched/embedded binary** can set `ignore_managed_requirements`.
- **Desktop app coverage is UNPROVEN** — the tagged repo does not prove every desktop path uses this loader. CLI,
  `codex exec` and the VS Code extension (via app-server) are all **proven yes**.
- **`Stop` composition trap:** any handler returning `continue:false` suppresses *every* `decision:block`
  (`hooks/src/events/stop.rs:373-405`).

### The verdict, and what it means for scope
> *"Machine-scope hooks alone cannot give reliable, user-revert-proof governance… hooks are useful policy
> instrumentation, not a hard security boundary."*

But — and this is the decisive nuance — **network enforcement is NOT needed for the `CODEX_HOME` or direct-binary
cases**; the machine file already covers those. What network/OS enforcement would buy is only the adversarial tail:
a user who edits `COMSPEC`, patches the binary, or uses `--remote`.

**Recommended scope (supersedes the 7e options):** build the machine-hook lane properly — items 1–7 above. That
reaches parity-or-better with Claude, removes the wire proxy from the critical path (dissolving F22 and F23 as
*criticals*), and needs **no WFP programme**. Then state the residual honestly: *"governs the normal path on every
proven surface; not a hard boundary against a determined local administrator."* Revisit OS/network containment only
if a customer requires the adversarial guarantee — and price it as its own programme then.

---

## 8. Preserve — do not "fix" these

`serverEnforced=false` (documented local-authoritative design) · "measured absence, not a pass" · "required evidence
missing" · "EFFECT EXPRESSED" · "NOT MEASURED" · "an uncertified action is reported honestly as unknown, never as
prevented or safe" · the self-defense floor at `ai_handlers.go:3328` (`devoid-self-disable` can never relax below
warn).

**Six capabilities were PROVEN WORKING live and any regression in them is the worst outcome of this wave:**
command-lane blocking *and discrimination* · DLP across 14 data classes · browser masking before send · Codex wire
blocking · signed-bundle propagation and anti-rollback (~5 min, measured) · the supply-chain package gate.

---

## 9. The missing test phase (owner-identified, accepted)

The 165-test plan had no test for **"the product does not break the tools it governs"** and none for **"when we
intervene, the user can tell it was us and knows what to do"**. Per governed runtime (Claude Code, Codex desktop,
Codex CLI, VS Code extension, browser): send a prompt → confirm a reply returns; trigger a block → confirm it is
attributed to DeVoid and there is a recovery path. F21, F22, F23, F30, F33 and F41 would all have been caught on day
one by this phase. It runs at re-verify, against a clean install.

---

# 10. PRE-DEPLOY LOCAL CHECKLIST — the gate

**Why this exists (owner, 2026-08-09):** *"so we can go back after we finish the plan and you will remember to test
them all locally one by one before we deploy again and then find nothing is working like you just did to me with our
last QA remediation plan."*

The last wave shipped green and was inert in production. That happened because we verified that code *merged*, not
that behaviour *changed*. This checklist is the gate that makes a repeat impossible.

### Rule 0 — how to use it
- **Nothing deploys until its rows are green with pasted evidence.** A row with no evidence is NOT-RUN, not PASS.
- Every row has a **DEFEAT** step: an action that must make the check FAIL. **If the defeat step doesn't turn the
  row red, the row is NOT-RUN** — the check is sitting on a dead path and proves nothing. This is the single most
  important rule on the page; it is the exact failure mode of the last wave.
- Verdicts are PASS / FAIL / BLOCKED (name the blocker) / NOT-RUN. "Looks fine" is not a verdict.
- Run against the **local Docker stack that mirrors production** (`.codesec-e2e/`), not a unit-test mock. Known trap:
  a stale host backend on :2053 shadows the container — stop both and relaunch before starting.
- Run rows in order. Stage A gates Stage B, and so on.

---

### Stage A — build and contract gates *(fast, run first)*
- **A1** Backend, Frontend, Installers, extension all build clean. **DEFEAT:** revert one intentional change and
  confirm the build breaks.
- **A2** Full test suites pass in all four repos. **DEFEAT:** break one new assertion and confirm it fails.
- **A3** npm-audit gate passes in Backend and Frontend (allowlist is currently EMPTY in both — a stale entry fails
  repo-wide with no dependency change).
- **A4** Shared-contract parity: **only `package-intelligence/` is a genuine three-way mirror**, and its copies are
  already divergent. **DEFEAT:** confirm a deliberate mismatch is caught rather than silently accepted.
- **A5** Every new/changed agent→backend field is accepted by the **deployed** backend DTO shape, and every new
  backend-emitted enum value is accepted by the **deployed** frontend allowlist (§3 — this wave's hazard runs
  backend → old client). **DEFEAT:** send a body with the new field to the OLD backend and confirm you can predict
  the outcome; send the new enum to the OLD console and confirm it does not render `DECISION_UNAVAILABLE`.

### Stage B — local stack up and honest
- **B1** Stack up: backend, frontend, PG, worker container (needs `NPM_TOKEN`; bcrypt cost-14). Enrol a fresh
  endpoint against LOCAL, never prod.
- **B2** `devoid ai status codex`, `hooks-status claude-code`, and the readiness surface all render, and their
  claims match reality. **DEFEAT:** remove one hook entry and confirm the surface flips to missing.
- **B3** Policy round-trip: edit a dial in the console → the endpoint's on-disk `lkg-bundle` policy digest changes →
  `signed authority activated ... phase=ENFORCE applicationReceipt=true`. **DEFEAT:** offer a lower revision and
  confirm anti-rollback refuses it.

### Stage C — the twelve outcomes, one row each

**C1 — Investigate a blocked credential.** Block a synthetic secret in a prompt → open the event → **the masked
prompt is revealable**. **DEFEAT:** disable the preview carrier and confirm the console says required evidence
missing rather than showing a fabricated `OFF`/`ASSIGNED_AUTHORITY_MISMATCH`.

**C2 — Codex does not break.** Normal turn completes · long conversation completes · streaming and tool-calls work ·
**a blocked secret is stopped AND the very next turn still succeeds** · block is attributed to DeVoid in-app ·
simulated proxy panic does not kill the turn · daemon restart mid-turn degrades cleanly. **DEFEAT:** force a panic
on the SSE path and confirm the turn survives with an attributed error, not a silent hold.

**C3 — Provider route is owned state (F43).** Delete `managed_config.toml` → the agent detects it, repairs it behind
a health gate, and **raises an event plus a console state**. **DEFEAT:** make the proxy unhealthy and confirm it does
NOT force-wire (that is the brick), and that the ungoverned window is still recorded and visible.

**C2b — Codex hooks actually fire and actually deny (CX-1/CX-2/CX-4).** The single most important local gate in the
wave, because this lane has been dead since it shipped and every green surface said otherwise.
- Execute **every rendered hook command** through a real `cmd /C` with event fixtures — not a string comparison.
  **DEFEAT:** remove the `ai` token, change the event name, or corrupt the provenance marker; each must turn the
  check red. Assert a **resolvable executable with wrong arguments FAILS attestation** — that exact shape is what
  shipped and passed.
- Per-event deny contract table. **DEFEAT:** return exit 1 with valid JSON (must NOT deny), exit 2 with empty stderr
  (must NOT deny), and malformed exit-0 JSON (must NOT deny). If any of those denies, the contract is wrong.
- `SessionEnd` completes inside **1 second**. **DEFEAT:** add a backend round trip; the budget assertion must fail.
- Zero attempted canaries can **never** report `MATCHED`. **DEFEAT:** restore the optional-canary path; the
  assertion must fail.
- Legacy baseline + new binary repairs via the compatibility dispatcher (CX-3). **DEFEAT:** disable the dispatcher —
  the endpoint must report **legacy/unproven**, never governed.

**C2c — Codex stays usable (CX-8/CX-9/CX-10).** Normal turn completes · long conversation completes · streaming and
tool-calls work · **a blocked secret is stopped AND the next turn still succeeds** · the block renders as **ours**,
non-retryable, on every packaged client · daemon restart mid-turn degrades cleanly.
- **DEFEAT for CX-8:** reintroduce the catch-all hold for `ErrAbortHandler` — an upstream/client fault must then be
  misclassified as policy and fail the test.
- **DEFEAT for CX-9:** restore `error.code="cyber_policy"`, or remove the assistant item, or emit
  `response.completed` — the attribution and non-retry assertions must each fail.
- **DEFEAT for CX-10:** remove session binding or restore substring matching — cross-session correlation must be
  caught. Plus a **tripwire upstream** scanning every request byte, header, log, event and notification for the
  planted secret; bypassing the sanitizer must fire it.

**C2d — WSL is covered or honestly reported (CX-6).** Two distros, one with `/etc/codex/requirements.toml` and one
without → status reports exactly that, per surface. **DEFEAT:** delete the covered distro's file; its row must flip.
A Windows-only verdict that claims to speak for a WSL lane is a FAIL.

**C3b — Authorized opt-out is visible (CX-7).** Marker present → `SKIPPED_AUTHORIZED`, console coverage state shows
it, and an event exists for the transition. **DEFEAT:** delete the marker; the state must change and a second event
must fire. **Never green, never auto-repaired.**

**C4 — Console tells the truth.** Open exactly 2 chats → the list shows exactly 2 · no repo/branch in a title slot ·
fork/compact appear as one logical session · a receipt-about-a-receipt does not occupy a timeline slot ·
`AGENT_CONTROL_TAMPER` does not repeat · **an event with no finding class and no outcome cannot render HIGH**.
**DEFEAT:** inject a contentless tamper event and confirm it cannot reach HIGH; inject one WITH a finding class and
confirm it still can.

**C5 — Command guard cannot be trivially bypassed.** For every confirmed transform (field-separator braced and
unbraced, its operator form, backslash-hidden verb, line continuation): the obfuscated form gets the **same verdict**
as the literal form. **DEFEAT:** the paired benign twin of each must still be ALLOWED — a rule that blocks both
proves nothing. Plus the F8c replay: **zero newly-blocked benign commands** over the captured corpus.

**C6 — Credentials.** Fresh install, upgrade-over-existing, `install-mode=lite`, and re-enrol: the signing key's DACL
excludes `BUILTIN\Users` in all four. Startup self-heal repairs a deliberately-loosened ACL. `storageAssurance` is a
**measurement**. **DEFEAT:** loosen the ACL by hand and confirm the reported assurance degrades and the daemon
repairs it. **Plus the anti-brick check: a non-elevated `devoid` command still works, and never mints a new key** —
confirm `EACCES` refuses rather than minting.

**C7 — Nothing is silently lost.** A hold can be created and approved end-to-end · a batch with one oversized item
rejects **that item** and delivers the rest · a killed-backend window spools and reconciles without double-counting.
**DEFEAT:** kill the backend mid-post, restart, confirm the event lands exactly once and the contiguity floor
advances.

**C8 — Enforcement is provable.** The canary runs per instance on its schedule and produces a real proof.
**DEFEAT:** make the probe *not* be blocked and confirm the canary reports **NOT_PROVEN** — never `PROVEN` with a
missing receipt (this is the F38-a manufactured-green path; it must be impossible).

**C9 — MCP discovery is complete.** `devoid mcp scan` finds servers across all covered locations including
per-project Claude scope and Codex TOML, and classifies a code-execution REPL as risky. **DEFEAT:** add a server in
a location we claim to cover and confirm it is found; add one in an unknown format and confirm we say **"config not
understood"** rather than staying silent.

**C10 — Browser lane.** Masking-before-send still works · nav-block state reflects the DNR engine, not a bare count.
**DEFEAT:** a synthetic endpoint payload with `ruleCount: 0` and no `ruleCountSource` must render **"Not reported"**,
not "Blocks not armed" — this is the fleet-wide false-red trap.

**C11 — Housekeeping.** Windows EXE/MSI download resolves · the running backend build is identifiable · per-machine
AI-context rows key on the real device, not the shared API key · a queue with no consumer raises a signal.
**DEFEAT:** request an artifact by its old name and confirm the transition path still resolves it.

**C12 — DeVoid does not interrupt ordinary work (F41).** Run a realistic agent session end-to-end.
**PASS = zero interruptions**, and every genuinely dangerous probe still blocked. **DEFEAT:** run one unambiguous
malicious-shape probe and confirm it IS still blocked — an open baseline that blocks nothing is a failure, not a pass.

### Stage D — render surfaces *(hard gate; the last wave died here)*
- **D1** Grep **every** render file for the changed field — not just the one you edited.
- **D2** **Drive a browser to the customer's actual entry point** and look at each changed surface. Screenshot it.
- **D3** Check every state: populated, empty, loading, error, and **absent-capability** (must read "Not reported" —
  never green, never red).
- **D4** Mobile width for anything in the top bar or policy page.
- **DEFEAT for the whole stage:** point the console at a tenant with no data and confirm surfaces read honestly
  empty rather than silently green.

### Stage E — cannot be proven locally *(verify on a real box, and say so)*
- Real Codex desktop / VS Code extension rendering of our block shape on the installed client version.
- MSI install / upgrade / uninstall and the ACL outcome under a real elevated installer.
- The signed-bundle propagation latency (~5 min measured, up to the ~12–30 min refresh cadence).
- Cross-tenant isolation (needs a populated second org + a second principal).
- A second endpoint, a second non-admin Windows user, and the live nav-block of a real AI site.
- **Deploy verification:** the **Deploy-to-ECS job** is the truth — a workflow run's overall conclusion can be green
  while the deploy job failed.

### Sign-off
| Stage | Verdict | Evidence | Who | When |
|---|---|---|---|---|
| A — build/contract | | | | |
| B — stack honest | | | | |
| C1–C12 — outcomes | | | | |
| D — render surfaces | | | | |
| E — real-box items | | | | |

**Deploy order is fixed:** frontend allowlists → backend → agent MSI → extension. Backend must tolerate the
installed old-agent fleet at every step.
