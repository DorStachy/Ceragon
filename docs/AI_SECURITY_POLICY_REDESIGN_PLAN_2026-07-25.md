# AI Security Policy — Redesign Implementation Plan

**Date:** 2026-07-25
**Status:** APPROVED (design accepted by owner 2026-07-25); implementation not started
**Design proposal:** https://claude.ai/code/artifact/aa2f8cb6-cf66-4de9-8424-440942adfd98
**Supersedes the page shipped by:** BE #205/#206, FE #126/#127 (calm redesign, 2026-07-24/25)

---

## 0. Decisions this plan assumes

The owner accepted the proposal as presented. That includes the three open decisions, resolved
as recommended. **If any of these is wrong, stop and correct it before Wave 1 — everything
downstream depends on them.**

| # | Decision | Resolution |
|---|---|---|
| D1 | What does **Warn** do? | Warn interrupts and offers a **recorded override in place**. On a surface that cannot interrupt (non-interactive CLI, CI, `codex exec`), Warn **degrades to Monitor and says so in the evidence record** — it never silently becomes a block. |
| D2 | Does **redaction** stay in the admin vocabulary? | **No.** `Block` means "this must not leave". The engine picks the least-disruptive guaranteed enforcement: strip the span when cleanly extractable, stop the request when not. The evidence record keeps distinguishing `REDACTED_THEN_SENT` from `BLOCKED_BEFORE_EGRESS`. |
| D3 | Five rungs or three? | **Three** — Observe / Protect / Strict — with rollout state (simulate vs enforce) as a separate switch, not a rung. |

**Admin-facing vocabulary after this work is exactly three tokens: `monitor` \| `warn` \| `block`.**

---

## 0b. Decisions forced by implementation (2026-07-25, after Wave 0A + Wave 1 landed)

| # | Question | Resolution |
|---|---|---|
| D4 | **Where does the interactivity signal come from?** D1 says warn degrades to Monitor when non-interactive — but the AI proxy runs *inside the daemon* and has no TTY of its own, so it cannot observe the calling CLI. | The CLI shim / agent hook sends an explicit interactivity hint (`X-Devoid-Interactive`) set from its own stdin TTY check. Absent header ⇒ treat as **non-interactive** ⇒ degrade to Monitor and record. **Spoofability is acceptable here by construction:** warn is a friction/coaching boundary, not a security boundary — a caller that lies only loses the prompt and the recorded reason, never an enforcement. Anything that must actually be stopped belongs at Block, which has no override. |
| D5 | **Block→redact silently relaxes the strictest baselines.** Under D2 a stored `block` on the 6 extractable classes wires as `redact`, so `Regulated` / the Restricted-Contractor preset now *sanitize and send* where they previously stopped the request. | The substitution is a property of the **baseline**, not a global rule. Add `blockStyle` derived from the rung: `sanitize-if-possible` for Observe/Open Tools/Protect/Contained, **`hard-stop` for Regulated**. At Regulated, Block means the request does not happen at all. This keeps D2's calm behaviour where it belongs and preserves the contractor guarantee. |
| D6 | **`INGRESS_MONITORED` would be rejected in production.** Verified: `AI_EVENT_TYPES` is a 29-item digest-pinned tuple enforced by `@IsIn` in `AppendAiEventDto`, and does not contain it. | Add the event type to the portable ordered tuple and regenerate the pinned artifact **as part of the Backend wave**, and enforce the ordering rule below. |

**Hard sequencing rule (violating it 400s every monitored ingress event in production):**
the Backend carrying `INGRESS_MONITORED` must be deployed **before** any agent build that emits it.
Backend first, agent last — as already sequenced in §4.

---

## 1. The architectural spine

**The wire does not change.** We already own a stored→wire translation seam
(`assembleEffectiveDto` in `Backend/src/ai-security-policy/ai-security-policy.service.ts`), built
for the calm-monitor lane: the stored `monitor` token is translated to wire `allow` +
`monitorClasses` and never reaches an agent.

This plan reuses that seam for the whole collapse:

```
ADMIN / STORED  →  translation (backend)  →  WIRE (unchanged)  →  agent + extension
monitor                                      allow + monitorClasses
warn                                         warn
block               extractable class?  →    redact
                    otherwise          →     block
```

Consequences, and why this ordering is the cheap one:

- **No deployed agent breaks.** 7.8.13 in the field keeps receiving the vocabulary it already
  understands. The redesign is shippable Backend+Frontend first.
- **Redaction survives as behaviour** without an admin ever choosing it (D2).
- **Simulate mode is a translation rule, not an agent feature**: in `simulate`, every class is
  emitted as `allow + monitorClasses` regardless of stored disposition.
- The agent work (Wave 5) is then only about *honesty* — making Warn mean one thing and making
  ingress Monitor actually record — not about understanding a new vocabulary.

**Non-negotiable invariants** (each gets a test that fails loudly):

1. The literal token `monitor` never appears on the wire.
2. No policy state can produce "a real secret leaves with no record". Monitor records; Block stops
   or strips; Warn records the override.
3. `resolveStrictestPolicy` fold order is `block > warn > monitor`, total and commutative.
4. Go `internal/policyeval` and `browser-extension/src/policyeval.js` stay byte-for-byte
   behaviourally identical, enforced by the shared golden-vector corpora.
5. Cold start / no policy keeps the existing conservative floor. **Absent policy is not Monitor.**

---

## 2. Waves

Waves 0 and 1 are independently shippable and carry their own value. Do not start Wave 2 until
Wave 0 is deployed.

### Wave 0 — Fix the two defects (ships alone, no UI change)

The collapse is not safe until these are true. Both are bugs today.

**0A. Ingress Monitor actually records** *(live security bug)*
Backend translates stored ingress `monitor` → wire `off` + `ingress.monitorClasses`
(`ai-security-policy.service.ts:838-863`), but the agent never reads that field —
`ingressConfigFromPolicy` consults only `Enabled/Actions/TaintHold`
(`Installers/internal/daemon/ai_ingress.go:95-130`), and `off` hard-skips the finding before it is
appended (`internal/proxy/ai_ingress.go:333-360`). CORE ships `ingress-exfil-verb` at monitor
(`ai-security-policy.constants.ts:423`), so **the console promises observation and delivers
silence.**

- Consume `MonitorClasses` in `ingressConfigFromPolicy`; a monitored ingress class is evaluated,
  recorded, and never redacts or taints.
- Parity: mirror in the browser ingress path; regenerate `parity-vectors/neutral/*`.
- Test: a monitored ingress class produces exactly one recorded finding and zero mutations.
- **Ships in the next agent release.** Does not wait for the redesign.

**0B. Warn means one thing** *(behaviour change — highest risk in the plan)*
Today: proxy/CLI warn = **hold** until `devoid ai allow-once` (`internal/proxy/ai_proxy.go:443-450,
615-680`); browser composer and upload warn = banner, **send proceeds**
(`browser-extension/src/content/index.js:627-670, 1216-1237`); `UserPromptSubmit` hook warn =
explicitly non-gating (`internal/aihooks/promptsubmit.go:41-44`).

Target semantics (D1), per surface:

| Surface | Warn behaviour |
|---|---|
| Browser composer / uploads | Interrupt inline; "Send anyway" requires a reason; recorded. |
| Proxy + interactive CLI (TTY) | Hold, prompt in place, one keystroke to continue with reason. |
| Non-interactive (CI, `codex exec`, hooks) | **Degrade to Monitor**, stamped `warn_degraded_noninteractive` in evidence. |

Precedent: Nightfall documents blocking capability per hook (some hooks are monitor-only);
Microsoft ASR's Warn lets the user bypass, with an expiry. We are matching a real pattern, not
inventing one.

- Add `overrideReason` to the warn-release evidence event.
- Retire `devoid ai allow-once` as the *primary* release path (keep as a fallback for headless).

### Wave 1 — Contract + stored-model collapse (Backend + shared-contracts)

- `packages/shared-contracts`: add `AiPolicyDisposition = 'monitor' | 'warn' | 'block'` as the
  stored/admin union. **Leave the V1 wire unions untouched.** Mirror into
  `Ceragon-Intelligence/packages/shared-contracts` (transitional bridge rule) and regenerate the
  byte-exact dist pins (`npm run build:shared-contracts`).
- Translation in `assembleEffectiveDto`: implement the `block → redact | block` split. The
  extractable set is the existing `CORE_SANITIZE_DLP_CLASSES`
  (`ai-security-policy.constants.ts:413-420`) generalised to a per-class `extractable: boolean`
  in `ai-class-metadata.ts`.
- **Migration** (stored configs, all orgs/teams):

  | Old | New |
  |---|---|
  | `allow` | `monitor` |
  | `redact` | `block` |
  | `hold` (ingress) | `block` |
  | `off` (ingress) | `monitor` |
  | `confirm` / `audit` (failure oracle) | `warn` / `monitor` |
  | `dlp.enabled=false` etc. | that group → `monitor` |

  Migration must be **idempotent and reversible**; write the pre-migration config to
  `ai_security_policy_archive` before rewriting.
- Delete from the stored model: `dlp.enabled`, `promptRisk.enabled`, `mcp.enabled`,
  `ingress.enabled`, `proxy.failMode`, `webGuard.driftFailMode`, `uploads.maxSizeKb`,
  `paths.*`, `exclusions.patterns`, `failureOracle.action`, `agents.enforcementTier`,
  MCP `off|enforce`. Fail-mode and path defaults become **vendor constants**, not config.
- `resolveStrictestPolicy`: simplify the fold to the 3-token order.

### Wave 2 — Presets: three rungs that actually govern everything

**Verified gap (2026-07-25).** Today's rungs are half-baselines. The shipped default `CORE`
(`= cloneRecommendedAiSecurityPolicy()`) leaves every governance axis empty:

```
providers:  { blocked: [], tolerated: [] }          ← no stance on any AI website
agents:     { allowed: [], mode: "" }               ← mode is the empty string
egress:     { mode: "", allowed: [], blocked: [] }  ← no destination stance
paths:      { blocked: [], allowed: [] }            ← no filesystem protection
exclusions: { allow: [], block: [], patterns: [] }
```

So CORE governs **detection only**. `ESSENTIAL` blocks no providers at all; `BALANCED`/`HARDENED`/
`LOCKED_DOWN` set `providers.blocked = SHADOW_AI_WEB_APPS` — a fixed blocklist — and every rung
leaves `agents.allowed`, `egress.allowed/blocked` and `paths.*` empty. `ESSENTIAL` and `BALANCED`
also omit `ingress` entirely.

**The missing primitive: there is no answer for an AI site we have never seen.** The provider model
is blocklist + `tolerated`; there is no allowlist and no default. A new AI web app that ships
tomorrow is therefore ungoverned at every rung. This is the gap the owner identified.

**Add `unknownDefault` to the governed catalogs** (`providers`, `agents`, `mcp`), taking the same
three tokens. This is what makes a baseline a baseline: a stance on the unknown, not a list of the
known. Market precedent — Palo Alto's Gen-AI-Best-Practice snippet ships exactly two rules,
"Sanctioned GenAI Access" (allow) and "Default GenAI App Access" (blocks Tolerated **and
Unsanctioned**).

#### Baselines are ideologies, not rungs (owner direction, 2026-07-25)

A single strictness ladder forces one posture across every axis, which is wrong: "let people use
any AI tool they like, but nothing sensitive leaves" and "our data handling is fine, but agents
must not act freely on the machine" are **different shapes, not different strictnesses**. Neither
is stricter than the other.

So the baseline model is **two dials plus a pinned floor**:

- **Axis A — Data protection.** What may leave: secrets and credentials, regulated personal data,
  file and screenshot uploads.
- **Axis B — AI autonomy.** What AI may do: which sites and tools are usable, agent actions, MCP
  servers, sensitive filesystem paths, egress destinations.
- **Floor — Attacks on your AI.** Prompt injection, jailbreaks and poisoned tool output are
  **not an ideology choice**. Nobody wants their agent hijacked, so this is pinned at `block` on
  every baseline except Observe. This is where we hold an opinion instead of offering a dial.

Named baselines are labelled points in that space:

| Baseline | Data | Autonomy | For |
|---|---|---|---|
| **Observe** | monitor | monitor | Rollout and pilots. See everything, interrupt nothing. |
| **Open Tools** | block | monitor | "Use any AI tool you like — but nothing sensitive leaves." |
| **Protect** *(default)* | block | warn | The balanced enterprise default. |
| **Contained** | warn | block | "Our data handling is fine; agents must not act freely." |
| **Regulated** | block | block | Regulated or contractor endpoints. |

The admin picks a named baseline **or** moves the two dials directly — the named baselines are
presets over the same two values, not a separate mechanism. The five risk-group cards remain for
per-group refinement, and any card that departs from the baseline shows as a deviation.

This is why the collapse to three tokens matters: with one vocabulary, a two-dial model is
expressible at all. It is not expressible over nine tokens in eleven vocabularies.

**Every baseline takes a position on every axis. No omissions, no empty strings.**

| Axis | Observe | Protect (default) | Strict |
|---|---|---|---|
| Secrets and credentials | monitor | block | block |
| Attacks on your AI (prompt-risk + ingress) | monitor | block | block |
| Regulated personal data | monitor | warn | block |
| AI websites — sanctioned catalog | monitor | monitor | monitor |
| AI websites — known shadow-AI | monitor | block | block |
| **AI websites — unknown/new** | monitor | **warn** | **block** |
| Coding agents — known catalog | monitor | monitor | monitor |
| **Coding agents — unknown** | monitor | **warn** | **block** |
| MCP servers — known-bad verdict | monitor | block | block |
| **MCP servers — unknown** | monitor | warn | **block** |
| Uploads (files + images) | monitor | warn | block |
| Sensitive filesystem paths (`~/.ssh`, `~/.aws`, `/etc`, `%USERPROFILE%\.aws`) | monitor | block | block |
| Agent egress destinations | monitor | built-in defaults enforced | defaults enforced, unknown denied |
| Evidence capture | hash only | hash only | redacted preview |

- Ship the **sensitive-path list as a vendor constant** — every customer needs the same set, and
  today every rung ships it empty.
- `agents.mode` and `egress.mode` stop being empty strings; they derive from the rung.
- Rewrite `ai-policy-presets.ts` → `OBSERVE` / `PROTECT` (default) / `STRICT`.
- Rung mapping for existing orgs: `ESSENTIAL → OBSERVE`; `CORE`, `BALANCED → PROTECT`;
  `HARDENED`, `LOCKED_DOWN → STRICT`. Record the old rung in `presetMetadata.migratedFrom`.
- **Rungs are versioned objects** (Intune pattern): `presetVersion` + `lastPublished`, so a future
  rung change is an explicit adoption, not a silent redefinition.
- The 68 per-class dispositions live *here* and nowhere else.
- **Contract test: a rung with any unset governance axis fails CI.** This is what stops baselines
  silently regressing to half-baselines again.

**Migration caution.** `PROTECT` governs axes that were previously empty, so migrating a CORE org
to PROTECT is *not* behaviour-neutral: unknown AI sites begin to warn, sensitive paths begin to
block. Measure the blast radius against recorded events before applying (see §3), and land it in
`simulate` rollout state so the first thing an admin sees is what it *would* have done.

### Wave 3 — Risk groups + rollout state (Backend)

- Introduce five groups over existing class keys — **a view over the class map, not a new
  storage axis**: `secrets`, `attacks`, `tools`, `agents`, `regulated`.
- Group read = strictest member. Group write = set every member.
- `GET /ai-security-policy` returns per-group `{ value, baselineValue, deviates }`.
- New field `rolloutState: 'simulate' | 'enforce'` (default `enforce`; new orgs start `simulate`).
  In `simulate`, translation emits everything as `allow + monitorClasses`.
- Group membership is a contract test — a new detection class must land in exactly one group or CI
  fails. This is what stops the page regrowing to 68 rows.

### Wave 4 — Frontend rebuild

- Replace `components/admin/ai-security-policy-section.tsx` (2,956 lines) with a composed page:
  posture ladder, ladder key, five risk cards, footer. Target **≈9 controls**.
- New `Data handling` section: evidence capture mode + session titles (the two genuinely
  customer-specific privacy calls).
- Providers: one rule ("block everything not approved") + an exception list, replacing 25 selects.
- Delete: both action boards, all three sorters, drag-and-drop, the ghost simulator panel, the
  duplicate reset, "Add a custom provider", the hard-coded OpenAI coaching row.
- Per-group drill-down is **read-only**, with "request an exception" wired to the existing
  FP-report/approvals loop.
- Deviation badges + "Reset to baseline" (Intune pattern).

### Wave 5 — Agent + extension alignment

Only what Waves 0–4 could not do behind the translation seam:

- Honour `warn_degraded_noninteractive` and emit the new evidence field.
- Ingress monitor consumption (from 0A) confirmed against the new corpora.
- Regenerate Go + JS golden vectors; **bump the extension version** (all five sources — a source
  change without a bump never reaches an installed extension).

### Wave 6 — Impact preview (the "smart" layer)

Today `simulate` only diffs config (`ai-security-policy.service.ts:1368`). It cannot say what a
change would have *done*.

- `POST /ai-security-policy/impact` — replay the last N days of recorded findings against a draft
  policy; return `{ wouldInterrupt, wouldBlock, wouldMonitor, topClasses[] }`.
- Render inline on the card being changed: *"In the last 7 days this would have interrupted 12
  sessions."*
- Requires monitored findings to be retained with enough fidelity to re-decide — validate before
  committing to this wave.

---

## 3. Risks

| Risk | Mitigation |
|---|---|
| **Event volume.** Deleting `allow` makes previously-silent classes emit events. | Measure first: count current `allow`-disposition classes × observed fire rates before Wave 1 ships. Aggregate monitor events; never alert on them. If ingestion cannot absorb it, sample monitor at the endpoint — never at the backend. |
| **0B changes live enforcement.** Proxy warn stops holding. | Ship 0B alone, behind no flag but with a dogfood-first release; verify on the box before promoting to stable. |
| **Migration corrupts a customer policy.** | Archive pre-migration config; make the migration idempotent; dry-run against a prod snapshot and diff every org before applying. |
| **Removing kill switches removes a support escape hatch.** | Replace with a time-boxed, audited support action (not a config field) that drops an org to `OBSERVE` with an expiry. |
| **Old agents + new stored model.** | The wire is unchanged by construction; add a contract test asserting a 7.8.13-shaped wire payload is still produced from a migrated config. |
| **The page regrows.** | The group-membership contract test in Wave 3 is the structural guard. |

---

## 4. Sequencing and definition of done

```
Wave 0A ──┐
Wave 0B ──┴─► agent release ─► Wave 1 ─► Wave 2 ─► Wave 3 ─► Wave 4 ─► Wave 5 ─► Wave 6
            (ship + verify)     (BE, wire unchanged)          (FE)      (agent)   (new)
```

Per the standing definition of done, a wave is finished only when **all** of:

- Ships **ON** — no feature flags, no off-by-default, no shadow mode.
- Self-reviewed (re-read the plan, verify types and paths), then adversarially reviewed for any
  wave touching code.
- **Real customer-imitation E2E** on a live box — not unit tests alone.
- Deployed to prod and verified with probes.
- Source-of-truth docs + roadmap updated.

Every report distinguishes **PROVEN LIVE** (with evidence) from **NOT EXERCISED**.

---

## 5. Evidence behind this plan

Counts and behaviour claims are code-grounded, not estimated:

- Control inventory: `Frontend/components/admin/ai-security-policy-section.tsx` — 78 interactive
  controls, 68 per-class pickers, 11 action vocabularies, 50 distinct class keys (18 configured
  twice).
- Vocabularies at runtime: DLP `block|redact|warn|allow`, prompt-risk `block|warn|allow`, ingress
  `redact|warn|hold|off`, uploads `block|warn|allow`, exclusions `allow|block`, MCP `off|enforce`,
  tiers `detect|strict` — plus the stored-only `monitor`.
- Enforcement truth read from `internal/policyeval/policyeval.go`, `internal/proxy/ai_proxy.go`,
  `internal/proxy/ai_ingress.go`, `internal/daemon/ai_ingress.go`,
  `browser-extension/src/content/index.js`.
- Market patterns cross-checked against vendor documentation (Microsoft Purview / Defender ASR /
  Intune, CrowdStrike AIDR + Falcon, Nightfall, Lakera, Netskope, Harmonic, Zenity, Palo Alto,
  Island). An adversarial verification pass discarded nine fabricated or misattributed claims.

**Not exercised:** the ingress-monitor defect (0A) is asserted from source and the agent's own
struct comment (`internal/core/backend/ai_prompt.go:324-333`); it has not been reproduced at
runtime. Reproduce it first — it is also the acceptance test for 0A.
