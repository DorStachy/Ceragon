# Remediation plan — production verification 2026-08-08

> **SUPERSEDED by [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (2026-08-09).** That plan re-derived every root
> cause against origin/main and overturned six of the findings below (F9, F19, F11, F40, F21, F36). Kept for history;
> do not implement from this file.

38 findings, live-measured or source-proven, each root cause run through an adversarial refute pass. Grouped by ROOT
CAUSE (not by phase), because most findings are a few underlying defects wearing many faces. The sensitive live
evidence ledger is retained in the authorized local workspace and is intentionally not published; its corrected
conclusions are incorporated into `IMPLEMENTATION_PLAN.md` and `fix-specs/`.

## The one-line story
**Enforcement works. Everything downstream of the block — evidence, attribution, recovery, signal — does not.**
Blocks fire and discriminate (command lane, DLP, web redaction, Codex wire, signed policy propagation all PROVEN LIVE).
But when the product acts, the user often can't tell it was us, can't recover, can't investigate what was caught, and
the real signal is buried under self-generated noise.

## Deploy rules (from memory, binding)
- **Backend before agent, always.** Agent releases ship only after the backend they depend on is live.
- **Never boot-assert** `AI_CORRELATION_KEY_MASTER_KEY` / `AI_PROMPT_EVIDENCE_TENANT_MAC_KEY` (bricked a deploy before).
- Two unsafe fixes were already rejected by the refute pass: a warmed HTTP transport for F2 (no-op), and adding
  `${IFS}` as a regex for F8 (whack-a-mole). Do not resurrect them.

---

## THEME 1 — The evidence layer is dead downstream of the block  [highest customer impact]
A blocked AWS key cannot be investigated: "REVEAL PROMPT" → "nothing here to view". This is the theme the owner hit hardest.

| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F3/F30 | HIGH | prompt-evidence lane inert; blocked-credential incidents un-investigable | **(a)** agent: add `PromptEvidence` field to the outbound evidencespool `Event`/`EventInput` (`Installers/internal/evidencespool/types.go:126`) + set it in `ai_prompt_capture.go:388` from `out.Prepared.Descriptor`. **(b)** backend read-path: stop fabricating `OFF`/`ASSIGNED_AUTHORITY_MISMATCH` when the artifact is merely absent (`prompt-evidence-projection.service.ts:198`). **(c)** provision the two correlation keys in SSM (NEVER boot-assert) — required for FULL upload. **PRIORITISE the masked `redactedPreview` path, which needs NO keys** and makes incidents investigable now. | agent + backend + SSM |
| F5 | MED | `enforcementReceiptV2` null on tool-call events (prompt lane DOES render a receipt) | attach the V2 receipt (revision/digest/signing-key/applied-at) to tool-call events, not just prompt events | backend |
| F25 | HIGH | AI-context findings never delivered — 158 dropped incl. 25 detected secrets (producer-side 400, `redactedContext > 4096`) | clamp `redactedContext` agent-side to the contract bound; backend reject the over-long ITEM, not the whole batch | agent + backend |
| F38 | HIGH | deny-canary has NEVER run; backend exposes no canary route | make the canary run per-instance on a schedule (emit PROVEN/NOT_PROVEN); add a backend route so the console can show proofs | agent + backend |

## THEME 2 — The product breaks / obscures the tools it governs  [the "I can't use it" theme]
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F23 | HIGH | OpenAI SSE proxy panics on SOME turns → those turns fail closed (intermittent, not total) | fix the panic in the SSE handler; on a proxy panic, fail OPEN to direct egress or surface an unmistakable DeVoid error; add a runtime proxy-health check that bypasses the route if unhealthy (the wire-time check exists — run it continuously) | agent |
| F22 | CRIT-UX | one blocked secret permanently bricks the whole Codex conversation (history resent every turn) | mask/redact the offending span in resent history (policy already supports SANITIZE) instead of blocking the whole turn; distinguish "violation is in prior history" from "in this turn" | agent |
| F21 | CRIT-UX | a DeVoid block renders as OpenAI's own refusal; user can't tell it was us or what to do | wire proxy must return a response the client renders as OUR message (or an unmistakable in-app signal); fix notification copy ("see your terminal" while in a GUI) | agent |
| F26 | MED | Codex wire activity has no SESSION in the console (events ARE enqueued) | open/attribute a session for wire-lane activity so Codex governance is findable | agent + backend |

## THEME 3 — Noise drowns signal
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F1/F33 | HIGH | 138+ self-referential "Agent control tampering" HIGH alerts (containment provider not wired → CONTAINMENT_FAILED on the tamper channel) | wire a real containment provider OR report "containment unavailable" as a non-tamper capability state; do NOT emit AGENT_CONTROL_TAMPER for a capability gap; require a finding-class + outcome before rendering HIGH | agent (+backend severity) |
| F34 | MED | severity is a static per-event-type constant ("from stored severityBasis, never recomputed") → contentless events render HIGH | derive severity from the finding class/outcome; an event with "no finding class" cannot be HIGH | backend |
| F27 | HIGH | session list inflated ~5× by <2s ephemeral process startups promoted to first-class sessions | don't materialise a session until it has a substantive event; exclude start/end-only sessions from default view + counts | backend |
| F28 | MED | `fork`/`compact` create duplicate sessions inheriting the parent name | link forked/compacted sessions to the parent as one logical session | agent + backend |
| F29 | MED | a git repo/branch is shown in the chat-title slot (`nameSource:"repo"`) | never render repo/branch as a chat title; show as a separate scope field | backend/frontend |
| F32 | MED | `BROWSER_ENFORCEMENT_RECEIPT_RECORDED` is a receipt-about-a-receipt rendered as a user event | make it internal/diagnostic; exclude from the user timeline or fold into the event it certifies | backend |
| F31 | HIGH | web-AI session "Untitled · Unattributed" + no prompt shown | attribute browser sessions to the user; title from site + first prompt (subject to redaction) | agent + backend |

## THEME 4 — Command-guard evasion (systemic tokenizer class)
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F8 | CRIT | `${IFS}` / `$IFS` / `${IFS%??}` / backslash-hidden verb / line-continuation all bypass EVERY whitespace-structural command rule; the tokenizer skips segments it judges "byte-equivalent to raw" | replace the regex/skip-gate with a real POSIX shell-word parser; match rules on the EXPANDED argv; fail CLOSED on parse failure. A per-trick regex cannot close this class. Content + PowerShell lanes unaffected. | agent |

## THEME 5 — Credential / trust hardening
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F16 | HIGH | endpoint signing private key + API bearer + daemon-token readable by BUILTIN\Users (`(A;;FR;;;BU)`) — OS_PROTECTED attestation is FALSE on this box | ACL-harden step must REMOVE the Users-Read ACE on credential/key files (SYSTEM+Admins only); verify it runs in `install-mode=lite` (likely the regression) | agent/installer |
| F15 | MED | `storageAssurance=OS_PROTECTED` is a verbatim self-report, never verified server-side | verify the DACL excludes Users before asserting OS_PROTECTED (agent at emit or backend at ack) | agent + backend |

## THEME 6 — Delivery reliability
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F2 | HIGH | tool-decision events lost on backend blip; loss indistinguishable from success; durable-delivery self-reports DEGRADED | spool the failed tool-check post into the existing durable evidence spool (`ai_handlers.go:2664`), stamped `backendReconciliation=unavailable`. Do NOT raise the 1500ms budget; do NOT add a warmed transport (rejected). | agent |
| F24 | HIGH | every hold-for-approval is unactionable (agent requests exactly 900s TTL; backend rejects with strict `>`) | agent requests TTL below the ceiling (e.g. 870s) OR backend uses `>=` with a small grace | agent or backend |
| F14 | MED | release-manifest inert (`RELEASE_MANIFEST_PATH` unset) → drift detection has no baseline | assemble a loadable manifest in the release pipeline; set the env in taskdef | pipeline + config |

## THEME 7 — Coverage / correctness gaps
| # | Sev | Defect | Fix | Side |
|---|---|---|---|---|
| F37 | HIGH | package verdict cache EMPTY in prod (alias=0, catalog=0) → installs over-BLOCK (fall through to 0/0 workers); forensics-cache env points at STAGING | repopulate the alias/catalog cache (needs the intel pipeline on — see F9); fix the forensics-cache env to the prod table | ops + config |
| F7 | MED | MCP discovery misses Claude project-scope + Codex config.toml (node_repl code-REPL undiscoverable — 3 ways) | add `.claude.json` projects[].mcpServers + `~/.codex/config.toml` (dir + allow-list + TOML parser) to the scanner | agent |
| F17 | MED | K1 identity map: `ai-context.controller.ts:65` writes endpoint_id = api-key id | write the real agent/endpoint id | backend |
| F39 | HIGH | 20 blocked providers in policy but extension `navBlockRules=0` — blocklist may not enforce | confirm blocked-provider list materialises into nav-block rules; (owner one-step: navigate to deepseek) | agent/extension |
| F13 | MED | Windows EXE/MSI download broken (backend still uses Cera* names) | update allowlist + `resolveInstallerReleaseKey` to Devoid* names | backend |
| F18/F40 | MED | CLI hook + web guard fail OPEN when daemon down / policy drifts (ungoverned window) | bounded grace-vs-gone distinction; visible "degraded/failing-open" state, not silent allow (owner decision) | agent |
| F6 | MED | Codex hooks not attestable (dialect pinned '0.144.', client 0.134.0) | widen accepted dialect / re-pin; wire lane already covers the floor | agent |
| F36 | MED | console shows no enforced-vs-staged signal (can't see the ~5–30min propagation state or a lagging endpoint) | surface the on-disk activation ledger (issued digest vs applied digest) in the policy UI | backend + frontend |

## THEME 8 — Operational (no code; owner/ops)
- **F9** intel cluster 0/0 (power-on when needed) · **F10** dead fullrepo consumer · **F11** scanner producer dead 14d ·
  **F12** buildSha undefined in taskdef · **F19** retention crons inert (enable flags absent) · **F20** no prompt-evidence
  purge job (ties to F3's artifact lane).

---

## Keep — honestly-built surfaces (do NOT "fix" these)
- `serverEnforced=false` everywhere = documented local-authoritative design.
- "measured absence, not a pass" (canary), "required evidence missing" (dead lane), "EFFECT EXPRESSED" (real vs logged
  block), "NOT MEASURED" FP labels, "uncertified action reported as unknown, never as prevented or safe". This honesty
  discipline is the product's best quality — every fix must preserve it.

## Disproven / retracted (were wrong)
- **F35** ("editing policy is decoupled/cosmetic") — DISPROVEN: propagation PROVEN end-to-end (~5min, digest changed
  09f28b→b62ac8f, rev 8, ENFORCE+receipt). My over-claim; the refute pass + a proper re-test overturned it.

## The checklist gap the owner identified (add before re-verify)
A whole PHASE is missing: **"the product does not break the tools it governs, and when it intervenes the user can tell
it was us and can recover."** Per governed runtime (Claude Code, Codex desktop, Codex CLI, VS Code ext, browser):
send a prompt → confirm a reply returns; trigger a block → confirm it's attributed to DeVoid and there's a recovery
path. F21/F22/F23/F30/F33 would all have been caught day one by this.

---

## Suggested wave order (backend-first, one agent re-release)
1. **Backend-only, no reinstall** (ship first): F3(b) read-path + F5 receipt + F25 backend + F17 + F13 + F27 + F29 +
   F32 + F34 + F36 + F14 + F38 backend route. + F24 (backend `>=` grace).
2. **Config/ops**: F19 enable flags, F12 buildSha, F37 forensics-cache env + intel power-on, correlation keys for F3(c).
3. **Agent 7.8.31** (one release, one reinstall): F8 parser, F2 spool, F3(a) descriptor, F16 ACL, F21/F22/F23 Codex UX,
   F7 MCP, F25 agent clamp, F31/F26 sessions, F39 nav-block, F6 dialect, F18/F40 fail-open, F38 canary runner.
4. **Re-verify** against a clean install, including the NEW break/attribution/recovery phase, then UN + PL-canary live.
