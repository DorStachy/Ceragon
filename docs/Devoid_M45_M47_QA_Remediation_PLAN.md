# DeVoid M4.5–4.7 QA Remediation Plan

**Status:** DRAFT for owner approval. No code written yet.
**Source:** owner QA (`Downloads/QA.docx`, 13 screenshots) + five read-only code investigations.
**Date:** 2026-07-25

---

## 0. Provenance and why this is trustworthy

Five parallel investigations were run against **`origin/main` of each repo**, not the local
working trees, because every local checkout is badly stale:

| Repo | local HEAD | behind `origin/main` |
|---|---|---|
| `Frontend` | `b78460d` (`feat/font-geist`) | **81 commits** |
| `Backend` | `15dd89b` | **142 commits** |
| `Installers` | `8e49a62` | **254 commits** — many files absent locally |

The authoritative Installers tree is the worktree `.worktrees/Installers-extinstall`
(`6ceaca8`, ext `0.5.3` = the deployed build). Every `file:line` below is from
`git show origin/main:<path>` or that worktree.

Two investigations independently reported that **our own wire DLP redacted their tool
output** mid-transcript (`[REDACTED:…]` markers injected into strings that are clean in the
source files). Any verbatim quote of an affected line must be re-read on a non-governed
path before being treated as exact. This is the same phenomenon seen in the M4.8 doc work.

---

## 1. Locked decisions (owner, this session)

| # | Decision | Answer |
|---|---|---|
| 1 | Command shape in the console | **YES** — `Bash · git push origin main`, literals stripped |
| 2 | Session title | **`repo / branch`** |
| 3 | Warn model | **`ALLOW` + `warned` flag + reason** (no new enum member) |
| 4 | Extension policy channel | **Wire the existing unsigned daemon path** |
| 5 | Events IA | **Split: Detections + Event search** |
| 6 | Receipts | **Fold into the event they certify; drop the standalone rows** |
| 7 | Assurance copy | **Honour `VERIFIED_ENDPOINT_REPORT`**; hedge only when genuinely unverified |
| 8 | Held-send UI | **In-page modal, controls in an extension-origin iframe** |
| 9 | Prompt text | **Redacted preview, findings-only**, 4KB cap |
| 10 | Existing prod data | **Purge AI-plane data at cutover** |
| 11 | Detections primary user | **Security analyst** |
| 12 | Session continuity | **Two rows, chained by `thread_id`** |
| 13 | Data-movement band | **Replace with a truthful outcome strip** |
| 14 | Ship cadence | **One release, everything at once** |
| 15 | Paste vs send | **The SEND is the event.** A paste-time redaction is carried forward onto that send's event. No paste-only rows. |
| 16 | Codex | **Full parity in this wave**, including the desktop-app no-hook profile |
| 17 | Governed signal | **Small persistent page badge**, collapsed by default |
| 18 | Own key format | **Add `devoid-api-key` → block**, plus a generic mechanism *only if research says it is simple and useful* |
| 19 | Who may read prompt previews and command shape | **OWNER + ORGANIZATION_ADMIN only.** MEMBER sees finding, classes and decision but not the text. Adds an org-level "store previews" toggle and a retention window. |
| 20 | D01 resume-bypass hotfix | **Stays in the single release** — owner declined a separate ship. Exposure is therefore live until cutover; recorded deliberately, not overlooked. |
| 21 | Prod readiness | **Not a blocker** — verified directly (see §6). Everything this plan needs is 1/1. |

---

## 2. Defect register

Severity: **S0** = security or false statement in the ledger · **S1** = data never captured or
destroyed · **S2** = UI/UX.

### S0 — security

| id | defect | root cause |
|---|---|---|
| D01 | **Resuming a held send transmits the secret unredacted.** Policy said *redact* for `aws-access-key`; resume skips it. | `browser-extension/src/content/index.js:400-406` — the `resumePermit` early return precedes the redact branch at `:542`. Owner hit this live. |
| D02 | **The extension never receives a policy in production.** Provider blocks and navigation blocks are wholly non-functional; the degraded-inspection floor fires on every send. | `internal/aipolicycontract/contract.go:152-154` hard-returns `RuntimeActivatable:false, SignedRuntimePolicyBundle:false, V2WriterEnabled:false`; `internal/daemon/ai_policy_activate.go:26-28` therefore false; `ai_policy_serve.go:115-138` answers `503 no-bundle`. Tier-2 unsigned fallback (`src/policy.js:272`) is **dead code — zero call sites**. |
| D03 | Our own credential format `cf_api_<uuid>_<hex>` matches **no detector**. **The entropy threshold was never the cause** — the token scores 4.235 against a 4.0 bar and passes length and tokenisation, then is *suppressed* by the D-FP-06 benign-identifier guard `KEBAB_SNAKE_ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/`, whose rationale ("a purely lowercase word-separated run is an identifier, not a credential") our own format falsifies. **Case-dependent** — the uppercase/mixed variants DO fire; only the real lowercase form is invisible. | `browser-extension/src/dlp.js:237` + `isBenignIdentifierShape` `:239-257`; byte-identical Go mirror `internal/dlp/dlp.go:276`, `:1025-1057` — a shared design decision, not drift |
| D51 | **We are mathematically blind to every pure-hex credential.** Hex has 16 symbols so its entropy ceiling is exactly `log2(16) = 4.000`; over 20,000 random 64-char hex strings the maximum observed was **3.9727**, below the 4.0 bar. `hexIdentifierRe` additionally excludes pure hex outright. No pure-hex secret of any length can trip `high-entropy`. | `HIGH_ENTROPY_THRESHOLD = 4.0` `dlp.js:43` / `highEntropyMinEntropy` `dlp.go:300`; `hexIdentifierRe` `dlp.go:273` |
| D52 | Bare `Bearer <token>` without an `Authorization:` prefix resolves to Tier C → **allow**, so `Bearer cf_api_…` in free text is silently permitted. Intent unconfirmed. | `bearer-auth-token` Tier C |
| D53 | `cf_api_` has **zero test coverage** — absent from `parity-vectors/dlp-findings.json` and every test under `internal/dlp/` and `browser-extension/test/`. | — |
| D50 | `isProviderExcepted` is a hard `return false` stub. | `src/policyeval.js:467-471` |

### S0 — ledger integrity (the product contradicts its own stated principle)

The console prints *"Only server-certified facts are shown; an uncertified action is reported
honestly as unknown, never as prevented or safe."* It then does the opposite:

| id | defect | root cause |
|---|---|---|
| D04 | A resumed send stays recorded as `securityOutcome: PREVENTED`, `dataDisposition: HELD`, `localDecision: block` — the console asserts "the secret was not sent" for something that *was* sent. The resumed dispatch emits no receipt and no daemon report. | `content/index.js:400-406` + `:716-732` |
| D05 | **"Everything stayed on your machine" is printed for sessions whose prompt was sent, and for sessions with zero events.** | `data-movement.tsx:190-218` returns `null` for `NEVER_LEFT` *before* the `ALLOW` check; headline at `:226-230` fires on total 0; the band renders outside the empty-state branch (`session-timeline-content.tsx:1409`). **A shipped test asserts the wrong behaviour: `__tests__/session-story-band.test.tsx:133-151`.** |
| D06 | A redacted-and-sent prompt reports `Prompt checked and allowed` + `Effect applied: No effect`. | consequence of D08 + `enforcement_effect: 'none'` on allow |
| D07 | Every event prints *"DeVoid has not received an independent attestation"* — permanently, because the certified branch is unreachable in prod. | `ai-enforcement-receipt.service.ts:28-33` + `:114-126` require a decision registered by a method with **no controller and no non-test caller**; `AI_SECURITY_V2_WRITER_ENABLED = false`. `enforcement_receipt_v2` is NULL on every prod row. |
| D48 | On ProseMirror/rich-textarea hosts (Claude, Gemini) the redaction write may not stick; the receipt then degrades `SANITIZED → UNKNOWN` while still claiming `REDACTED_THEN_SENT`. | `src/content/sites.js:111-115`; `src/receipts.js:246-249` |

### S1 — data never captured, or captured then destroyed

| id | defect | root cause |
|---|---|---|
| D08 | `policy_decision` is written **only for BLOCK**. Allow *and* warn both persist NULL — which is why the Decision column is a column of `-`. | `ai-agent.controller.ts:283` (prompt), `:500` (tool) |
| D09 | Warn is byte-identical to allow on the wire; there is no `WARN` member in `AI_POLICY_DECISIONS`. | `internal/daemon/ai_handlers.go:849-860` |
| D10 | **Browser sends never emit an AI event at all.** | `ai_handlers.go:378-382` — `EmitSubmitEvent` is documented as left false by the browser; confirmed absent in `src/daemon-body.js:39-66` |
| D11 | Extension session ids are `br-<base36>`, which fail the UUID gate, so browser events land session-less. | `content/index.js:299-311`; `internal/daemon/evidence_delivery.go:88-92` |
| D12 | `metadata.findings[]` (class, ruleId, count, severity) is built on every event then **silently dropped** by a sanitizer that discards arrays. Makes `topFindingClasses` in the weekly report structurally always empty. | `ai-event.service.ts:1330-1332`; dead consumer at `ai-query.service.ts:2429-2431` |
| D13 | **Session proliferation.** `SessionStart` sends no `clientSessionId` and the daemon's minted id is discarded by the caller; the backend then salts a correlation id with `Date.now()`, so every firing creates an orphan row. Claude Code fires `SessionStart` on launch, `--resume`, `/clear` and post-compaction. | `cmd/devoid/ai_hook_runner.go:671-678`; `cmd/devoid/ai.go:1043-1058`; `ai-agent.controller.ts:574-577` |
| D14 | A day-bucketed generation loop mints a **new** row each time an ended session reports again, amplified by a 30-minute idle sweep. | `ai-session-correlator.service.ts:147-159`; `ai-session-lifecycle.service.ts:10` |
| D15 | `title` is only accepted on `session/start`; sessions born from a prompt/tool checkpoint are permanently title-less. | `ai-agent.controller.ts:146-162`, `:343-381` |
| D16 | Backend falls back `username ?? deviceName`, so the hostname becomes the headline — and the FE prints `deviceName` (same hostname) directly beneath it. That is the `CND34521VN` twice. | `ai-query.service.ts:406`; `ai-sessions-content.tsx:151-164` |
| D17 | Command shape reaches the console at **no** evidence tier: not on the wire (field allowlist permits only `permission_mode, dry_run, recursive, timeout, limit, offset, sandbox`) and deliberately withheld on read. | `internal/daemon/ai_handlers.go:1667-1670`; `ai-query.service.ts:802-810` |
| D18 | **`FULL_WITH_APPROVAL` is a no-op server-side** — stores nothing beyond `HASH_ONLY`; the out-of-band store is absent and `evidence_ref` is hardcoded null. | `ai-event.service.ts:1014`, `:1271`, `:1244-1248` |
| D19 | `intended_effect` / `actual_effect` are schema-only; nothing writes them. | `ai-event.entity.ts:161-172` |
| D20 | One `ENFORCEMENT_RECEIPT_RECORDED` per **hook invocation**, unconditionally, with no session id and no tool name → the 278 unjoinable rows. | `cmd/devoid/ai.go:375-397`; `internal/daemon/ai_effect_receipt.go:53-71` |
| D21 | `toolUseId` is silently stripped by the metadata allowlist, so PostToolUse cannot be joined to PreToolUse. | `ai_ingress.go:283`; `evidence_delivery.go:16-48` |
| D22 | **Codex: only a PreToolUse hook.** No prompt gate, no post-tool, no session lifecycle → no Codex session, no title, ever. On a box with the Codex desktop app the default profile installs **no hook at all**. | `internal/codexmanaged/script.go:42-44`; `cmd/devoid/ai_codex_hooks.go:114-117` |
| D23 | Codex `PermissionRequest` decisions are computed and never reported. | `internal/daemon/ai_permission.go:89-94` |
| D24 | `AppendAIEventRequest` has **no `toolName` field** — the spool stream structurally cannot carry a tool name. | `internal/core/backend/ai_events.go:68-92` |
| D47 | Non-UUID session ids are silently nulled and the event kept unlinked. | `ai-event.service.ts:918-924` |
| D45 | Enum drift: `WEB_ADAPTER_DRIFT`, `WEB_NAV_BLOCKED`, `ENFORCEMENT_RECEIPT_RECORDED`, `BROWSER_ENFORCEMENT_RECEIPT_RECORDED`, `EXCEPTION_*` are written but absent from `AI_EVENT_TYPES`. | `ai-agent.controller.ts:624`, `:660`; `endpoint-evidence-batch.dto.ts:32-36` |

### S2 — UI / UX

| id | defect | root cause |
|---|---|---|
| D25 | The Events search box filters **client-side over the 50 loaded rows only**. There is no free-text param on the activity API at all. | `events-content.tsx:631-650`; `ListAiActivityDto` has no `q` |
| D26 | No endpoint column, no endpoint input; `endpointId` is a UUID, so typing a hostname can never match. | `events-content.tsx` header `:460-472` |
| D27 | No absolute time filter — five relative presets only — although the backend validates `until`. | `events-content.tsx:872-877`; `ListAiActivityDto.until:122-128` |
| D28 | Row click carries **no event identity**; the session page then auto-selects the *severest* event, so you land on a different one. | `events-content.tsx:444-455`; `session-timeline-content.tsx:1191-1203` |
| D29 | `Export` exports only the current page. | `events-content.tsx:843-852` |
| D30 | Refine-kind totals are approximate (5,000-row scan cap) but rendered as exact numbered pages — breaks our pagination honesty rule. | `ai-query.service.ts:2305-2327` vs `pagination.tsx:109` |
| D31 | `clearAllFilters` hardcodes `/ai-control-plane/events`, navigating you off the plane page. | `events-content.tsx:765-774` |
| D32 | Backend sends `dataClasses` and `enforcementReceiptV2`; the FE `AiActivityItem` type omits both, so they are dropped. | `types/ai-governance.ts:759-785` vs `ai-response.dto.ts:730-742` |
| D33 | The ledger never reads `metadata` — `tool`, `reason`, `riskScore`, `redactedPreview`, `redactedCount` all delivered and discarded. | `events-content.tsx` |
| D34 | The timeline rail shows no tool name; tool identity lives only inside collapsed "Technical details". | `session-timeline-content.tsx:559-560`, `:1119-1135` |
| D35 | `RELEASED_ONCE` folds into the `allowed` bucket; no event type, no `summaryKey`, no approver or approval-time field → a user-resumed send is unrepresentable. | `data-movement.tsx:207`; `EVENT_TYPE_LABELS:69-101` |
| D36 | Four parallel, unreconciled disposition-label systems. | `session-timeline-content.tsx:369-413`; `obligation-axes.tsx:122-130`; `certified-outcome.tsx:53-62` |
| D37 | `PENDING` / `INCONCLUSIVE` render grey — visually identical to an unrecognised token. | `shared.tsx:157-163` |
| D38 | The held-send confirmation opens a **focused new tab**. | `background.js:131-156` (`chrome.tabs.create`, no `active:false`) |
| D39 | The banner is transient by construction with only a dismiss control, and prints `Blocked:` for a hold — `TERMINAL_ACTION` maps `CONFIRM_TRUSTED_SURFACE`, `HOLD` and `DENY` all to `'block'`. | `ui/banner.js:16`, `:27`, `:104`; `failure-oracle.js:57-63` |
| D40 | The first-run notice fires **once ever** per browser profile → no persistent governed indicator. | `content/index.js` `maybeShowFirstRunNotice` |
| D41 | The manifest ships **no icons and no `default_popup`**, so the banner's instruction to "open the DeVoid confirmation" names an affordance that does not exist. | `manifest.json` `action` block |
| D42 | Perplexity is the only provider keyed on a `www.` host, so the apex `perplexity.ai` is in no manifest entry — and the guard test that should catch it has an **inverted** subdomain check, so it passes. | `manifest.json:61-78`; `blockhosts.js:38`, `:60-62`; `test/sites-coverage.test.mjs:26-30` |
| D43 | The extension discards the daemon's authoritative verdict (`// ignore response`). | `content/index.js:794-801` |
| D49 | The `AUTHORIZED` intervention state is declared but unreachable. | `trusted-intervention.js:51-58` |

---

## 3. Build waves (single release)

Ordering is by dependency, not by severity — the truth primitives must land before any UI can
render them. Nothing deploys until W8.

### W1 — Truth primitives (contracts + backend write path)

* Persist `policy_decision` on **every** decision, not only block (D08).
* Add `warned: boolean` + `warnReason` to the event write path and read DTOs; `ALLOW` + `warned`
  is the representation (decision 3, D09).
* Write `AI_DATA_DISPOSITIONS` on every applicable event — `SENT_ALLOWED`,
  `REDACTED_THEN_SENT`, `BLOCKED_BEFORE_EGRESS`, `HELD`, `NEVER_LEFT`, `RELEASED_ONCE` (D04, D06).
* Fix the metadata sanitizer to carry structured `findings[]` (D12); re-enable `topFindingClasses`.
* Honour `VERIFIED_ENDPOINT_REPORT` as a real assurance tier; restrict the "no attestation"
  hedge to genuinely unverified rows (D07, decision 7).
* Add the missing event types to `AI_EVENT_TYPES` and stop the drift (D45).
* Write `intended_effect` / `actual_effect`, or delete the columns — no schema-only fields (D19).

**Two fields the mockups require that do not exist today (decision 22, 23):**

**Severity — derived, never declared.** Computed at write time from the finding class and the
evidence tier, so it is always explainable and never needs a maintained table:

```
base by class:      private-key, aws-secret-key, devoid-api-key   -> critical
                    aws-access-key, github-token, stripe-live, …  -> high
                    high-entropy, db-connection-string, kubeconfig -> medium
                    (no finding, non-allow outcome only)          -> low

tier adjustment:    evidenceTier A / tier=validated  -> raise one step (cap critical)
                    evidenceTier B                   -> unchanged
                    evidenceTier C / heuristic       -> cap at medium
                    enforcementEligible=false        -> cap at medium

outcome floor:      a BLOCK never renders below high; a released-after-hold never below high
```
Store `severity` **and** `severityBasis` (the class and tier that produced it) so the UI can
answer "why is this High" without recomputing. This is the fix for the corpus finding that all
76 HIGH+CRITICAL scanner findings were non-true-positives — a heuristic guess can no longer
present as a validated match.

**Triage state — four fields, not one** (the single most common way a security table becomes
unreadable is collapsing outcome, severity and triage into one "Status"):

```
status            new | investigating | resolved
classification    not_set | true_positive | benign_expected | false_positive   (default not_set)
resolutionReason  issue_fixed | false_positive | exception | wont_fix | no_longer_present
                  ^ REQUIRED when status -> resolved
assignee          userId | null            (null by default; we do not notify, so do not imply it)
```
Plus: a **resolution note is mandatory** at resolve time and is written to an activity log; store
`secondsToTriaged` / `secondsToResolved` on transition so MTTT is a field, not a report. Three
suppression verbs, all of which **retain the record**: hide the row, resolve it, or reclassify the
detector as behaviour-only. Never delete. This maps onto the existing FP-exception loop.

**Exit:** a unit test per disposition proving the stored row matches the action taken; a test
asserting no code path can write `NULL` policy_decision; a table test for the severity derivation
including every cap and floor; a test that `resolved` without a reason and note is rejected.

### W2 — Agent emission

* Send `clientSessionId` on **every** hook including `SessionStart`; stop discarding the
  daemon's response (D13). Populate `thread_id` to chain resume/compaction (decision 12).
* Derive and send `repo / branch` from `cwd` as the session title, on the first event, for both
  runtimes (decision 2, D15).
* Add `command_shape` to the tool-input allowlist — `argv[0]` + subcommand + flags, literals
  stripped; never raw argument values (decision 1, D17).
* Add `toolName` to `AppendAIEventRequest` (D24) and allowlist `toolUseId` (D21).
* Emit `redactedPreview` on findings-only events, 4KB cap (decision 9). Either make
  `FULL_WITH_APPROVAL` mean something or remove the tier (D18).
* Stop emitting a receipt per hook invocation; emit one **correlated** to the event it certifies,
  carrying session id and tool name (D20, decision 6).

**Exit:** one real chat produces exactly one session row with a `repo/branch` title and every
event joined to it. A `/clear` produces a second row chained by `thread_id`.

### W3 — Web AI plane

* **D01 first, standalone commit:** resume must re-enter the redact path. A resume authorises
  *sending the sanitised text*, never sending the raw secret.
* Wire the unsigned daemon policy channel over the native host; give `loadPolicy`/`applyPolicy`
  their call sites (D02, decision 4). Verify the F01 floor stops firing on healthy boxes.
* Stop discarding the daemon verdict (D43).
* Emit real AI events for browser sends — set `EmitSubmitEvent` (D10); mint **UUID** session ids
  (D11, D47). Carry a paste-time redaction forward onto the send's event (decision 15).
* Separate `HOLD` from `BLOCK` in `TERMINAL_ACTION` and in every user-facing string (D39).
* In-page modal with controls in an extension-origin iframe; keep the trusted-origin guarantee
  (D38, decision 8). Add icons + popup so the copy names something real (D41).
* Persistent collapsed governed badge on covered sites (D40, decision 17).
* Add the Perplexity apex host; fix the inverted coverage test (D42).
* **Detector work (D03, D51, D52, D53), measured over 263 MB of our own code:**
  1. Exact rule for our own format → block. Zero-FP by construction. Emit
     `class: 'generic-api-key'` with `ruleId: 'devoid-api-key'` to avoid a catalog
     regeneration and a consumer-pin bump.
  2. **Generic mechanism = vendor-prefix shape, NOT keyword proximity.** Match
     `^([a-z][a-z0-9]{1,11}(?:_[a-z0-9]{1,11}){0,2})_([A-Za-z0-9][A-Za-z0-9_-]{23,})$`;
     reject digest prefixes (`sha256`, `md5`, `blake3`, …); require body digit density
     ≥ 0.15 **and** body entropy ≥ 3.9; exempt matches from the D-FP-06 identifier guard.
     Both conditions are load-bearing — entropy alone yields 1,069 hits (English
     snake_case), digit density alone yields 397 (trailing numeric codes), the
     conjunction yields **106 (22 distinct, ~19 of them our own secret fixtures,
     3 genuine FPs)**. Emit `severity: medium`, `evidenceTier: B`,
     `enforcementEligible: false` — warn, never block.
  3. **Rejected: keyword-adjacency** (10,123 hits — a flood of env-var *names*), and
     **rejected: moving the entropy threshold** (3.5 adds 32,584 hits and still misses
     `cf_api_`, because the guard was the blocker, not the bar).
  4. **Rejected: live credential verification.** It inverts the product — we would
     transmit a candidate secret to a third party, to an endpoint selected by
     pattern-matching attacker-influenceable text, making our own agent the exfiltration
     channel. It also cannot work for unknown formats by definition, and it fires real
     auth attempts against the customer's own accounts. GitHub ("validity checks are not
     supported for generic patterns") and GitGuardian ("Validity Check: False") both
     refuse it for generic types. Extend the local Tier A/B/C evidence ladder instead.
  5. Must land in **both** engines (Go serves the daemon AI-wire path, JS the extension)
     or the parity gate fails. Add `cf_api_` corpus cases — currently zero coverage.
* Verify the redaction write actually stuck on ProseMirror/rich-textarea before claiming
  `SANITIZED` (D48).

**Exit:** live E2E on all six providers — a blocked provider is actually blocked; a redact is
redacted, reported once, and joined to a session; a resume sends the **sanitised** text and the
console says `RELEASED_ONCE`, never `PREVENTED`.

### W4 — Codex parity (owner chose full)

* Install the session lifecycle and prompt gate; report `PermissionRequest` decisions (D22, D23).
* Solve the desktop-app profile that currently installs no hook.
* **Risk to watch:** Codex hook semantics are inverted vs Claude — deny fails open and needs
  exit 0. Every gate needs its own live test; do not assume Claude Code behaviour transfers.

**Exit:** a Codex session appears with a title and an inspected prompt; a denied tool is
actually denied, proven live.

### W5 — Read APIs

* Add free-text `q` to the activity API and make the Events search server-side (D25).
* Accept and index an endpoint **hostname**, not only a UUID (D26).
* Wire `until` for absolute ranges (D27).
* Add a get-single-event route, or make the timeline addressable by `seqNum` (D28).
* Project `dataClasses`, `enforcementReceiptV2`, `tool`, `reason`, `riskScore`,
  `command_shape` onto the activity item (D32, D33).
* Honest pagination when a refine-kind cap applies (D30).

### W6 — Detections + Event search (gated on mockup approval)

Analyst-first (decision 11). **Detections** = findings and non-allow outcomes only, with
severity, triage state, grouping of repeats, and one click to the exact event in context.
**Event search** = the full ledger with a real query bar. Receipt rows disappear (decision 6).
Fix `clearAllFilters` (D31) and make Export cover the result set or say it doesn't (D29).

**Design inputs from the competitor survey** (7 AI-security consoles; evidence tiers recorded
in the brief — no vendor screenshot was visually verified, so all of this is documentation-derived):

* **Lead the row with what fired, not when.** Nightfall's documented column order is
  `Finding · When · Integration · Policy & Rule · Risk · User · Status` — the detector first.
  Our current ledger leads with `Time · Seq`, which is machine-log ordering. Cross-vendor
  consensus shape: *when · who · where · what fired · how bad · what happened.*
* **Keep the triage-state enum small.** Nightfall carries ~29 statuses for content DLP but only
  **five** for AI-agent incidents: `Active, Blocked, Ignored, Resolved, Acknowledged`. Adopt a
  five-value set, not a larger one.
* **Confidence, not severity, is where colour belongs.** Nightfall is the only vendor that
  documents an encoding, and it is the crispest artefact in the survey: *Possible* (blue, dotted
  ring, 40–60%) / *Likely* (yellow, half-shaded ring, 61–80%) / *Very Likely* (red, solid ring,
  81–100%), with analyst annotations *True Positive* (green) / *False Positive* (grey) layered on
  top. Severity elsewhere is a bare Low/Med/High with **no documented colours anywhere**, and
  F5/CalypsoAI has no severity concept at all. We already carry `evidenceTier` A/B/C and
  `tier: validated` — map those to a confidence ring rather than inventing a severity palette.
* **Add TP/FP analyst annotation.** We have no equivalent. It feeds the FP-exception loop that
  already exists.
* **Snippet + context is the evidence primitive**, not a blob: Nightfall exposes `quote`,
  `pre_context`, `post_context` as first-class filterable fields; Pillar returns
  `start_idx`/`end_idx` offsets; Prisma AIRS returns ≤1000-char snippets, multiple per payload.
  Our `redactedPreview` should carry offsets and surrounding context, not just text.
* **Placeholder conventions in the wild**, for our redaction rendering: `[CREDIT_CARD_NUMBER]`
  (detector-name substitution), first-2-chars + `***`, and length-preserving `XXXX` with offset
  arrays. Ours is `[REDACTED:aws-access-key]` — consistent with the first pattern, keep it.

**Strategic finding — do not skip this.** Of seven incumbents, **none documents a working
per-session agent trace.** Nightfall captures the right five hook points (prompt, tool call +
params, tool response, model response, shell command) but its detail view is finding-centric with
no session stitching documented; Pillar claims "full attack transcripts" with zero published UI
evidence; only Prisma AIRS documents a link to full conversation context. The session timeline is
therefore the **highest-leverage differentiator in this whole plan**, not cleanup work.

**Vocabulary caution.** Every documented incumbent's agent-era action enum is small —
`Block|Monitor`, `allow|block`, `Block|Audit`, `Block|Warn|Allow`. We ship
allow/monitor/redact/hold/block, which is wider than all of them. Each verb must earn its place
in the copy or the UI reads as noise. This is part of what the owner was reacting to.

**No implementation before the owner approves mockups.** The EDR-console brief
(CrowdStrike/SentinelOne/Defender timeline + triage patterns) is still outstanding and folds in
here.

### W7 — Session timeline

* Replace the data-movement band with a truthful outcome strip; an empty session must state
  "nothing recorded", never assert safety (D05, decision 13). **Rewrite
  `session-story-band.test.tsx:133-151`, which currently locks in the false claim.**
* Surface tool name and command shape on the rail, not buried in Technical details (D34).
* Represent a resumed hold as a first-class outcome with approver and time (D35).
* Reconcile the four disposition-label systems into one (D36); give `PENDING`/`INCONCLUSIVE`
  a distinct treatment (D37).
* Deep-link `?event=<seq>` and honour it over the severest-first default (D28).

### W8 — Cutover

Migrations → purge `ai_events` + `ai_sessions` so the hash chain restarts clean (decision 10) →
deploy Backend, Frontend, agent, extension → live E2E per the exit gates above → SOT + roadmap
update.

---

## 4. Definition of done

Per the standing rule, "finished" means shipped ON, adversarially reviewed, proven by a real
customer-imitation E2E, deployed to prod, and documented. For this plan specifically:

1. No screen states an outcome the stored data does not support. Spot-checked on all 13 QA
   screenshots' scenarios, re-run live.
2. One chat = one session row, named `repo / branch`.
3. Decision is populated on every event; a warned allow is visibly distinct from a clean allow.
4. A resumed send transmits sanitised text and is recorded as `RELEASED_ONCE`.
5. Perplexity blocked in the browser, proven live.
6. Zero standalone receipt rows in the ledger.
7. Codex produces named sessions and inspected prompts.
8. Every claim in the final report split into **PROVEN LIVE** vs **NOT EXERCISED**.

---

## 5. Explicit non-goals

* Not building the signed policy-bundle generator (decision 4 defers it; track separately).
* Not building the V2 independent-observer receipt path — `registerKnownDecision` stays
  uncalled. We honour endpoint-reported assurance instead (decision 7).
* Not adding OS-user attribution. `username` stops falling back to hostname and reads
  "Unattributed" until attribution is built as its own item.
* Not touching `app/login/**` or `spiral-seal*`.
* No feature flags. Everything ships ON.

---

## 6. Open unknowns (must not be papered over)

1. Whether migrations `1786700000000` (receipts v2) and `1786900000000` (session title) are
   applied in prod. Checkable only against the live DB.
2. Whether the deployed agent binary (7.8.12) matches `origin/main@6ceaca8`. Source was read,
   not the shipped binary.
3. Which mechanism produced the owner's Gemini result. The owner states the **send** produced no
   event, which the code confirms is always true for browser sends (D10) — but the receipt they
   saw is not explained by a paste-only interception. Residual unexplained.
4. Whether `perplexity.ai` 301s to `www.perplexity.ai` — decides whether the nav block engages
   on the redirect hop today.
5. Live DOM accuracy of the per-host composer/send selectors. Never exercised in a browser.
6. ~~All ECS worker services are at 0/0.~~ **RESOLVED 2026-07-25 by direct check** — everything
   this plan needs is running: `backend-service` 1/1, `frontend` 1/1,
   `codefence-scanner-worker` 1/1, `cera-fetch-worker-staging` 1/1,
   `cera-sandbox-worker-staging` 1/1. Not a blocker.
   Still at 0/0, and irrelevant to this plan but relevant to the artifact lane:
   `ceragon-multi-follower-production`, `ceragon-intelligence-artifact-fetcher-production`,
   `ceragon-intel-static-worker-production`, `ceragon-intel-sandbox-worker-production`,
   `codefence-scanner-worker-fullrepo`. **This is the likely explanation for the `Count 0`
   reads against the artifact verdict/alias tables recorded against M4.8 G15a** — the writers
   are not running, so there is nothing to read regardless of key encoding.

---

## 7. Execution model — maximum parallelism without collision

One orchestrating session verifies and tests; build agents run concurrently in **isolated
worktrees off `origin/main`**. Concurrent chats hold the Backend, Frontend and Installers
checkouts, so no agent may switch a branch or `git add -A` in a shared tree.

**The trick that buys the parallelism: define the contract first, then everyone builds against it.**

```
W0  CONTRACT (serial, small, blocking)
    severity + severityBasis · triage 4-tuple · warned+warnReason · dispositions ·
    commandShape · assurance tier · activity-item field additions
    Landed in BOTH shared-contracts copies (Backend's vendored + Ceragon-Intelligence's mirror).
    Nothing else starts until this is green.

then, fully parallel — four lanes, four worktrees, no shared files:

LANE A  Backend            W1 write path, severity derivation, triage, W5 read APIs
LANE B  Installers/Go      W2 emission (session id, title, command shape, receipts), W4 Codex
LANE C  Installers/ext     W3 P0 resume fix FIRST, policy channel, events, modal, badge,
                           Perplexity apex, detector rules      ← separate worktree from Lane B
LANE D  Frontend           W6 Detections + Event search, W7 session timeline + outcome strip

then serial again:
W8  INTEGRATION → local Docker prod-imitation stack → §8 checklist → deploy
```

**Collision rules, enforced:** Lanes B and C are the same repo and therefore get **two separate
worktrees**. The detector rule (D03) must land in **both** engines or the parity gate fails —
one agent owns both edits, not two. `cache-schema.ts` mirrors are owned by Lane A alone.
Frontend's checkout tracks 27 `node_modules` files, so commits there are explicit-path only.

---

## 8. Pre-deploy E2E checklist

Nothing deploys until every line below is checked on the **local Docker prod-imitation stack**
(`.codesec-e2e/`) and the UI is walked in a real browser. Any unchecked line blocks the release.
Mark each `PROVEN` with the evidence, or `NOT EXERCISED` — never leave a blank.

### 8.0 Preconditions

- [ ] Backend, Frontend, static worker and sandbox worker all running in the local stack
- [ ] Migrations applied; `ai_events` + `ai_sessions` purged; hash chain restarts at seq 1
- [ ] Agent built from the release commit and installed on the test box (not a stale binary)
- [ ] Extension built from the release commit, version bumped in all five version sources
- [ ] A test tenant with a policy that has `perplexity` blocked and `aws-access-key` set to redact

### 8.1 The P0 — do this first, and do it twice

- [ ] Paste an AWS access key into ChatGPT and press send → held, in-page modal, **no new tab**
- [ ] Choose **Send without the secret** → the composer text is masked before it leaves; the
      network request body contains `[REDACTED:aws-access-key]` and **not** the key
- [ ] Repeat and choose **Request approval** → nothing is sent; a justification is recorded
- [ ] **Confirm there is no control anywhere that sends the original value.** Read the request
      body on the wire, not the UI.
- [ ] Console records `REDACTED_THEN_SENT` for the first, `HELD` for the second. Neither says
      `PREVENTED` and neither says "the secret was not sent" unless it genuinely was not.

### 8.2 Every original QA complaint, as a test

Sessions:
- [ ] One chat produces **one** session row (not six), titled `repo / branch`
- [ ] `/clear` mid-chat produces a second row **chained by `thread_id`**, collapsed as one entry
- [ ] No session row shows the hostname as its title, and no row repeats its own label beneath it
- [ ] No zero-event session appears in the default list
- [ ] The timeline is ordered by **turn**, and each tool entry names its tool
- [ ] A `Bash` call shows its command **shape** (`git push origin main`), never a bare SHA
- [ ] A warned-then-allowed prompt renders `Allowed · warned`, visibly distinct from a clean allow
- [ ] The outcome strip counts match the timeline; an empty session says "nothing recorded" and
      makes **no** safety claim
- [ ] `session-story-band.test.tsx` has been rewritten and no longer asserts the false headline

Events / Detections:
- [ ] Zero standalone receipt rows anywhere in either surface
- [ ] Every Detections row has a non-empty Outcome; no column of dashes
- [ ] Search for a hostname returns matches from the **whole** result set, not the loaded page
- [ ] An absolute time range (`14:00 → 19:40`) filters server-side
- [ ] Clicking a detection opens **that** detection, not the severest one in its session
- [ ] `Export` covers the full result set, or its label says it covers the page
- [ ] A capped/estimated total never renders as exact numbered pages
- [ ] `Clear filters` from `/coding-ai/events` stays on that page

Web AI:
- [ ] Perplexity is genuinely unreachable on an enrolled endpoint — try the apex `perplexity.ai`
      **and** `www.perplexity.ai`
- [ ] A redaction on ChatGPT, Claude and Gemini each produce **one** event joined to a session
- [ ] A paste-time redaction shows up on the **send's** event, not as its own row
- [ ] The governed badge is visible on a governed site on the **second** visit, not just the first
- [ ] The banner never says "Blocked" for a hold
- [ ] Enforcement still works with the daemon stopped (the never-leak floor)

Codex:
- [ ] A Codex session appears with a title and an inspected prompt
- [ ] A denied Codex tool call is **actually denied** — verify the tool did not run, not just that
      a decision was recorded (deny fails **open** on Codex; this is the highest-risk check here)
- [ ] A box with the Codex desktop app installed still gets a hook

Detector:
- [ ] `cf_api_<uuid>_<hex>` in **lowercase** is detected and blocked
- [ ] The same key in uppercase and mixed case is also detected
- [ ] A pure-hex secret (`<32 hex>`) is detected
- [ ] `resp_<32hex>`, `sha256_<hex>` and a long English `snake_case_identifier` are **not** flagged
- [ ] Parity vectors updated; both engines agree; the parity gate is green

### 8.3 Honesty audit — the deal-breaker checks

- [ ] Walk all 13 original QA scenarios and confirm **no screen states an outcome the stored data
      does not support**
- [ ] A hook that failed renders `Hook failed · proceeded`, not a success label
- [ ] An unverified outcome renders as unknown, but `VERIFIED_ENDPOINT_REPORT` no longer prints
      the "no independent attestation" hedge
- [ ] Three visually distinct absences: `—` unknown (with a title saying why), `n/a` not
      applicable, skeleton loading. No `0`, no blank, no confident dash.
- [ ] A `MEMBER` role cannot see prompt previews or command shape; `OWNER`/`ORG_ADMIN` can
- [ ] Retention window and the org "store previews" toggle both take effect

### 8.4 UI walkthrough (real browser, Claude Chrome extension)

- [ ] Log into the local console as a real user and navigate by clicking only — no typed URLs
- [ ] Detections → flyout → `←`/`→` walk three detections without returning to the list
- [ ] Session → expand a turn → expand a finding → read the masked preview
- [ ] Event search → build a query → brush a time range → export
- [ ] Resolve a detection: reason + note required, both land in the activity log
- [ ] Light **and** dark theme on every surface
- [ ] Console has zero errors; no request 4xx/5xx during the walk
- [ ] Screenshot every surface for the owner's visual pass

### 8.5 Regression

- [ ] Full test suites green in all four repos
- [ ] `npm audit` gate passes in Backend and Frontend (brace-expansion allowlist expires
      **2026-08-24** — renew in both or the deploy fails)
- [ ] Install gate still blocks a known-malware package and still allows a clean one
- [ ] No feature flags introduced; everything ships ON

### 8.6 Deploy gates

- [ ] Owner has seen the screenshots and approved
- [ ] Merge order = dependency order: contracts → Backend → workers → Frontend → agent → extension
- [ ] For the Backend, watch the **Deploy-to-ECS job**, not the run conclusion
- [ ] Post-deploy: repeat §8.1 and §8.2 against prod, then re-run the honesty audit
- [ ] Final report split **PROVEN LIVE** vs **NOT EXERCISED**, every vector enumerated
