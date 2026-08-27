# Independent Detection-Quality Review of M4.7A

**Review date:** 2026-08-23  
**Plan reviewed:** [M4.7A — AI Security Product Quality: Implementation Plan](./M47A_IMPLEMENTATION_PLAN.md)  
**Roadmap authority:** [DeVoid Roadmap to Finished Product](../../docs/Devoid_Roadmap_To_Finished_Product.md), especially M4.7A at lines 731–949  
**Numeric detection authority:** [AI Security Detection, DLP, and Enforcement Master Plan](../../docs/superpowers/plans/2026-07-15-ai-security-detection-enforcement-master-plan.md), especially lines 695–829  
**Disposition:** **REQUEST CHANGES — NOT APPROVED for the stated zero-false-positive, evasive-detection, or 9+ outcome**  
**Implementation status:** This is a plan review, not a statement that the plan has been implemented or production-certified.

> **Action requested from Claude, the plan author:** Rebase and refactor the original implementation plan to resolve every P0, disposition every P1 with evidence, and return the artifacts required by §20. Do not begin detection-enforcement implementation from the current plan. The original plan was intentionally left unchanged by this review.

---

## 1. Executive decision

The plan is unusually strong at deployment sequencing, making unknown states visible, test defeatability, cross-repository parity, local-only shadow capture, UI truth, triage mechanics, and scanner execution truth. Those parts should be preserved.

It is not yet a sufficient detection-quality or high-assurance plan. If executed exactly as written, it can finish while all of the following are still true:

1. A tool-only shadow is used as the sole evidence gate for prompt and ingress classes that can never appear in that shadow.
2. Even the tool shadow has a global denominator, not a per-class exposure denominator, so “zero deltas for this class” can mean “the class never ran.”
3. A known benign HIGH hard block is explicitly banked and never repaired.
4. The recall gate passes if only one of ten attacks is interrupted, so 10% aggregate recall passes.
5. The corpora are too small, too mechanically related, and too visible to detector authors to prove the stated false-positive or evasive-detection claims.
6. The plan is stale against current `Installers/origin/main`: it omits 51 newly emitted DLP classes and proposes shallow DLP calls that current CI explicitly forbids.
7. New cloud rules infer malicious production impact from command spelling without resolving environment, resource, authorization, or actual effect.
8. PowerShell and `cmd.exe` structural evasions are explicitly deferred even though the roadmap requires supported Bash, PowerShell, cmd, and direct-argv semantics for Risk 4.
9. The proposed tool “corroboration” combines unrelated findings anywhere in one scan instead of proving a semantic or causal relationship.
10. Monitor findings are SOC-visible. On an independently tainted session, a non-INFO raw finding from a monitor-policy class can also turn that same call’s local allow into HOLD, so immediate untainted “allow” tests do not prove zero developer-visible impact.
11. Wave 7 proves that scanners ran; it does not prove that those scanners find vulnerabilities accurately.
12. The existing LLM code-scanner prompt-injection defenses are real but are not subjected to adaptive, end-to-end, model-version-specific evaluation.
13. Effect-bound approval remains disconnected and fail-open remains allowed. Separately, artifact-admission transport remains permissive and the roadmap’s F16 endpoint-signing custody prerequisite remains unresolved. A detector cannot compensate for a missing authoritative execution or trust boundary.

The correct verdict is therefore:

> **Approve the plan as a valuable remediation foundation only after a current-main rebase. Do not approve it as the final M4.7A detection-quality or 9+ program until the P0 findings in this review are resolved in the plan itself.**

### Plain-English bottom line

The plan is good at making the product more honest and operable. It is not yet good enough at proving that the detections are accurate. Its biggest mistake is treating a small set of regression tests and a tool-only shadow as if they were evidence for every detector family. Its second-biggest mistake is treating dangerous-looking text as proof of an unauthorized dangerous effect. Both must change.

---

## 2. What this review does and does not certify

### In scope

This review focuses on the detection and enforcement quality needed for:

- Risk 1: secrets and company-data exposure.
- Risk 2: insecure or vulnerable code reaching a protected branch or release.
- Risk 3: malicious dependencies and executable packages. Skills, plugins, and MCP-specific breadth remain deferred.
- Risk 4: dangerous commands or production actions.
- Risk 5: direct or indirect prompt injection hijacking an agent.
- Cross-cutting severity, confidence/evidence strength, policy, UX, measurement, rollout, evidence integrity, and operational proof.

The owner explicitly asked to leave skills, plugins, and MCP-specific work for a later track. This review respects that boundary. However, when a deferred dependency is required for a broader high-assurance claim, the certificate must remain `NOT_READY`; exclusion does not turn the dependency into completed protection.

### Out of scope

- Implementing the plan.
- Running destructive cloud or production probes.
- Certifying the current deployed fleet or AWS environment.
- Re-scoring Risk 3’s deferred skills/plugins/MCP breadth.
- Claiming universal security or a literal mathematical guarantee of zero false positives.

### Meaning of “zero false positives” in this review

A universal zero-false-positive claim is not provable. The defensible form is:

> Zero observed false interventions in a named, versioned, representative, independently governed corpus and production window, together with a predeclared one-sided confidence bound, explicit coverage limits, and no known unresolved benign hard block.

Broad ambiguous detection can remain useful in silent or advisory modes. Automatic block/redact requires much narrower, better-proven evidence.

---

## 3. Review method and evidence baseline

### Materials examined

- The complete 17,538-line implementation plan.
- M4.7A roadmap claim contract, five risk lanes, shared gate, ownership, and current baseline.
- The numeric evaluation and release SLO authority named by the roadmap.
- Current `origin/main` code in Backend, Frontend, Installers, Static-Worker, Sandbox-Worker, GitHub scanner/action, and Ceragon Intelligence.
- Current DLP registry, full-depth scan guard, tool-risk/taint path, prompt-risk correlations, code-scanner LLM prompts, prompt sanitizer, scanner execution contract, and representative tests.
- Primary standards/research and current official product documentation listed in §18.
- Three independent specialist reviews: code reality, detection science, and market/standards. Their conclusions were independently reconciled against the source before inclusion.

### Current source revisions used

| Repository | `origin/main` reviewed on 2026-08-23 |
|---|---|
| Backend | `787b71dc534d572ad937a908feef9fcbd46cc7b4` |
| Frontend | `471658a7911442434beae20965bb9d106a0c78d5` |
| Installers | `f29d66449679ec9c8753ef6d2d321a12d348c2ab` |
| Static-Worker | `e4c6069fa34e9a412f7b7063f58933b2e3f90084` |
| Sandbox-Worker | `d68ee58d28ebd97e78122f2a7a41224be5443022` |
| GitHub App / scanner worker | `3d4116a5e5b1f48a9a9e33f487e490133fba47d9` |
| Ceragon Intelligence | `08a58981a9cf00c3b5bdacb6b61f0400f742bc00` |

The plan pins Installers at `6dab6ccc` in Wave 3 and Wave 7. Current Installers `origin/main` is 26 commits later over that range, with 117 files changed and approximately 15,176 insertions / 457 deletions. This is material, not editorial drift.

### Evidence classification used

| Label | Meaning |
|---|---|
| Verified defect | The plan’s own code/exit criteria allow the bad outcome, or current source directly conflicts with the proposed step. |
| Proof gap | The proposed implementation may help, but its test/evidence cannot establish the stated claim. |
| Architecture dependency | Detection alone cannot provide the outcome without an authoritative boundary or external prerequisite. |
| Recommended hardening | Valuable for mature assurance, but not by itself a blocker to the narrower remediation slice. |

No live-AWS or production result is inferred from source. “Exists,” “reachable,” “default,” “deployed,” and “proven live” remain separate states.

---

## 4. Roadmap contract the plan must satisfy

The roadmap is stricter than the implementation plan’s current exit criteria.

M4.7A lines 745–767 define a 9+ claim as a bounded engineering-assurance certificate. It requires:

- Weighted score at least 9.0 and no dimension below 8.5.
- No open critical or high bypass in the certified boundary.
- Every path enforced, technically unavailable, or explicitly excluded and non-green.
- Product and external controls deployed, not merely present in source.
- Positive, negative, degraded, rollback, replay, and bypass tests against the exact release candidate and a representative managed endpoint.
- A fresh live canary that proves the intended effect.
- Independent reproduction of the highest-impact defeat tests.
- Automatic expiry/downgrade after relevant client, policy, model, parser, dependency, artifact, or infrastructure change.
- A machine-readable evidence manifest as the score authority.

The numeric master plan at lines 695–829 adds the missing evaluation contract:

- Public regression, transform/property, representative benign replay, end-to-end, private adaptive holdout, and incident suites are distinct.
- Semantic families must remain in the same split and near-duplicates must be removed before splitting.
- Ambiguous labels need two independent reviewers, adjudication, and inter-rater measurement.
- Final system state should be graded where possible; a model judge cannot be the sole critical-outcome gate.
- Release metrics require one-sided confidence bounds, not point estimates.
- Promotion proceeds offline → internal shadow → design-partner shadow → safe transform → notify/confirm → narrow denial → canary → broader enforcement.
- Rollback is automatic on a privacy violation, critical bypass, destructive false block, coverage/integrity regression, or material utility/friction regression.

### Consequence for the current plan

The reviewed document can be a bounded **M4.7A detection/UX/execution-truth remediation slice**. It cannot honestly call its current eight waves the full M4.7A completion plan while leaving effect-bound authority, permissive artifact-admission transport, live scanner-transport proof, required Windows semantics, provider/data-boundary work, and endpoint/evidence key custody outside the plan. Those may remain companion tracks, but the risk certificate must remain non-green until they are deployed and proven.

---

## 5. Strengths that Claude should preserve

These are substantive strengths, not politeness. Rewriting the plan must not lose them.

### 5.1 Truth and evidence discipline

- The plan repeatedly separates existence, reachability, default configuration, deployment, and proof.
- Missing evidence is intended to read as `UNKNOWN`, not zero or green.
- Wave 5 and Wave 7 explicitly repair misleading green states.
- The W7 execution manifest design distinguishes requested, succeeded, partial, failed, skipped, and required scanners.
- The plan requires tests that can be demonstrated red before implementation.

### 5.2 Safe rollout mechanics

- Backend-before-agent ordering is explicit where wire enums and DTOs would otherwise reject clients.
- One-class-at-a-time prompt rollout limits blast radius.
- Active and candidate policy are separated.
- Shadow evaluation is intended to be behavior-invariant.
- Rollback and per-commit evidence are treated as first-class engineering work.

### 5.3 Privacy-aware measurement

- Tool shadow evidence is local-only and deliberately avoids the SOC/tamper upload path.
- The store records dropped data and storage failure rather than silently pretending evidence is complete.
- The preview path attempts to redact before retaining a diagnostic example.

### 5.4 Product and operator honesty

- Impact and evidence/confidence are meant to be separate dimensions.
- The console work attempts to stop truncated or narrowed populations from being labeled as totals.
- Triage work adds status, notes, ownership, activity history, and honest pivots.
- Fail-open is intended to become visible and non-green rather than masquerading as protection.

### 5.5 Useful existing code foundations found during review

- Current Installers has a canonical `dlp.ScanAll` / `ScanAllAtRest` depth contract and a source-level drift guard.
- Current DLP has an enumerated registry and a large provider-pattern expansion.
- Current tool taint/hold and exact approval state machinery are real foundations, even though the final authoritative effect path is incomplete.
- The LLM scanner already instructs the model to treat sentinel-fenced repository content as untrusted, escapes sentinel sequences, strips bidi/control characters, logs injection markers, and validates structured output. This defense exists and must be credited.
- Scanner execution aggregation and `COVERAGE_FAILED` concepts already exist; W7 mostly connects truth that the system already produces.
- The scanner repository already has labelled quality foundations under `github-action/configs/quality-corpus`, `github-action/configs/corpus`, `github-action/configs/ai-corpus`, `.github/workflows/quality-precision-gate.yml`, and `scanner-worker/bench/recall-6`. They should be inventoried and extended; the gap is representativeness, independent holdout governance, strata, effective support, and statistical proof—not the total absence of quality assets.

---

## 6. Blocking findings — P0

Every P0 below must be accepted and resolved in the revised plan, or explicitly rebutted with current code and a defeat test that disproves the finding. A prose disagreement is not enough.

### P0-01 — The current measured detector failures are omitted from the plan

**Type:** Verified defect and proof gap  
**Affected claims:** zero visible false positives, high recall, Risk 1, Risk 5

Current Installers contains a committed, lane-separated scorer report at `parity-vectors/neutral/HOLDOUT_REPORT.md`. The current scorer was also rerun during this review. Its residuals are:

| Lane | Current measured result | Named residuals |
|---|---:|---|
| Egress benign interruptions | 2 / 23 = 8.7% | `qa-fp-migration-timestamps`; `qa-fp-detections-finding-name` |
| Egress attack recall | 9 / 12 = 75.0% | `attack-private-key-block`; `attack-prod-db-connection-string`; `attack-system-prompt-exfil` |
| Ingress attack recall | 7 / 8 = 87.5% | `ingress-attack-private-key-in-tool-output` |

The report explains the failure modes in detail:

- A Luhn-valid migration timestamp produces a `payment-card` warning.
- A UI string containing the finding name `jailbreak-persona` produces a prompt-risk warning.
- A parser-degraded private-key block produces inconclusive or no finding depending on lane.
- Special characters in a database URL password defeat the connection-string detector.
- A textbook request to reveal the system prompt passes clean.
- A private key in a tool result can reach the model because the ingress redactor consumes findings but not the failure-oracle evidence.

None of these six fixture names appears in the 17,538-line implementation plan. Wave 4 adds/demotes/promotes other tool and prompt classes without first closing the measured residuals the repository already publishes.

**Why this blocks approval:** A quality program cannot claim completion while ignoring its own named false positives and false negatives. New rule work does not substitute for closing known failures.

**Required plan change:** Add a first Wave 4 task named **Close the published neutral-scorer residuals**. It must:

1. Reproduce the current report from the exact rebased commit.
2. Add a red test for each named residual on its actual lane.
3. Fix the detector/evidence/posture behavior without deleting or weakening the case.
4. Assert the expected class, decision, enforcement result, and final system state for each attack—not merely “some interruption occurred.”
5. Require the known benign-interruption bank to be empty before the detection-quality slice can complete.
6. Preserve the cases permanently in the incident/regression suite.

**Required defeat tests:** Revert each individual fix and prove its exact fixture fails again. A broad aggregate-rate assertion is not a sufficient defeat test.

---

### P0-02 — Mandatory Wave −1 rebase: the plan is stale and will encode current drift

**Type:** Verified source conflict  
**Affected claims:** catalog totality, DLP depth, severity totality, reproducible implementation

The plan states at line 22 that every path and signature was verified against `origin/main`, then pins Installers `6dab6ccc` at lines 4581 and 15284. Current Installers `origin/main` is `f29d66449679ec9c8753ef6d2d321a12d348c2ab`, 26 commits later over this range.

Two direct conflicts make implementation unsafe:

#### A. The producer now registers 81 DLP classes, while the plan and consumers govern 30

Current producer reality:

- `Installers/internal/dlp/registry.go` contains 33 core registered classes when the `ClassHighEntropy` constant row is included.
- `Installers/internal/dlp/codesecurity_rules.go` contributes 48 additional parity classes.
- `RegisteredClasses()` returns the unique producer-owned set.
- Current Backend portable contracts still list only 30 DLP classes at `packages/shared-contracts/src/generated/ai-security-portable.generated.ts:54–85`.
- The neutral policy catalog still contains only 55 total `ClassID` rows across all families.

The plan’s W2 impact generation and W4 denominator remain hard-coded to 30 DLP classes and a 114-class total (`M47A_IMPLEMENTATION_PLAN.md:4302–4323`, `4566`, `9255–9261`, `9654`). Executing that design would leave 51 currently emitted DLP classes outside the promised impact/governance inventory and would make unknown-class fallback look like a completed catalog.

#### B. Proposed plan code violates the current full-depth DLP guard

The plan adds production calls to `dlp.Scan(original)` and `dlp.Scan(out)` at lines 5780 and 5789. Current `Installers/internal/dlp/scan_depth_guard_test.go` explicitly bans shallow DLP entry points outside `internal/dlp`, except one narrowly documented exact-span validation. Production surfaces must use `ScanAll` or `ScanAllAtRest`.

The plan as written should turn current CI red. Weakening the new guard would be a regression.

**Required plan change:** Add a mandatory **Wave −1 — Current-main rebaseline and authority regeneration** before any implementation task:

- Fetch and record every repository’s current `origin/main` SHA.
- Re-run every discovery command and replace stale line references/signatures.
- Generate one producer-owned DLP class artifact from `RegisteredClasses()` with class, family, default posture, evidence properties, base impact, producer version, and digest.
- Vendor/generated-copy that artifact into Backend, Frontend, neutral evaluation, and shared contracts.
- Add no-sibling-checkout-independent digest and totality gates.
- Replace proposed shallow calls with the canonical full-depth result and re-audit redaction behavior.
- Recompute every detector denominator dynamically from versioned producer catalogs; no handwritten `114` exit criterion.
- Preserve current `ScanAll`, registry, scan-depth, and posture work.

**Required defeat tests:** Add one temporary producer class and prove every consumer parity gate turns red. Replace one shipping `ScanAll` with `Scan` and prove the depth guard turns red.

---

### P0-03 — Wave 4’s prompt promotion gate reads the wrong measurement lane

**Type:** Verified gating contradiction  
**Affected claims:** prompt detection precision, safe rollout, Risk 5

The contradiction is internal to the plan:

- Wave 3’s stated goal is the enforcing **tool-call detector lane** (`M47A_IMPLEMENTATION_PLAN.md:4571–4575`).
- `recordToolShadow` accepts `[]toolrisk.Finding` and is wired at the tool-decision path (`5235–5243`, `5538–5558`).
- Wave 4 admits there are only five prompt-risk corpus cases and says all six prompt/ingress class moves are gated on the Wave 3 decision-level shadow “and on nothing else” (`9391–9400`, `9487–9491`, `9553–9568`).

Prompt-risk and ingress class IDs cannot appear in `[]toolrisk.Finding`. Therefore the required report cannot exist from the proposed instrument.

There are only two possible implementations of the current text, and both are failures:

1. The implementer follows the stated `no data → do not move` rule, so every prompt class stays monitor-only and the plan exits without improving prompt protection.
2. The implementer mistakes unrelated tool data for prompt evidence and promotes classes on invalid evidence.

Exit criterion 9655 calls no-data classes staying monitor a “pass.” That may be an honest rollout stop, but it is not a detection-quality completion or Risk 5 certificate.

**Required plan change:** Build separate measurement seams for:

- Prompt egress policy decisions.
- Ingress/tool-result redaction decisions.
- Tool-call policy decisions.
- LLM code-scanner advisory verdicts.

Each lane needs its own eligibility definition, denominator, candidate decision, active decision, user/SOC-visible outcome, final security outcome, runtime/version cohort, and evidence freshness.

**Required defeat tests:** A prompt fixture must increment the prompt class denominator and must not increment the tool denominator. An ingress fixture must do the inverse appropriate to its lane. Cross-lane data must be rejected, not averaged.

---

### P0-04 — The shadow cannot compute the per-class rate Wave 4 asks it to use

**Type:** Verified measurement defect  
**Affected claims:** per-class zero-delta promotion, statistical evidence

The proposed `toolShadowFile` stores:

- One global `Observed` count.
- One global `Dropped` count.
- A maximum of 500 disagreement records.
- Class names only on disagreements.

Agreements increment `Observed` and discard the class context (`M47A_IMPLEMENTATION_PLAN.md:5032–5059`, `5096–5117`). There is no per-class opportunity count, candidate-trigger count, active-trigger count, unique-session count, adjudication state, report generator, or versioned observation window.

Consequently these two realities are indistinguishable:

- Class X was eligible 50,000 times, triggered in candidate 200 times, and caused zero bad deltas.
- Class X was never eligible and never evaluated.

The file also drops new disagreement details after 500 while continuing the denominator. Recording `Dropped` is honest, but a nonzero dropped count must invalidate a per-class quality gate because the missing records may belong to the class being promoted.

**Required plan change:** Replace the store/report contract with at least:

| Field | Required semantics |
|---|---|
| `lane` | Prompt, ingress, tool, scanner, DLP, or package lane; never mixed. |
| `classId` | Canonical producer class and catalog digest. |
| `eligible` | Opportunities on which this class could have fired. |
| `candidateTriggers` | Candidate findings/decisions for this class. |
| `activeTriggers` | Active findings/decisions for this class. |
| `agreements` | Same user-visible outcome. |
| `deltas` | Different user-visible or security outcome. |
| `unknown` | Parser, version, data, policy, or outcome unknown. |
| `dropped` | Missing evidence count; any nonzero value invalidates promotion. |
| `uniqueSessions` / `uniqueEndpoints` | Prevent one noisy loop from masquerading as representative evidence. |
| `windowStart` / `windowEnd` | Explicit observation period and freshness. |
| version tuple | Detector, normalizer, parser, policy, runtime, model/prompt where applicable. |
| adjudication | TP, FP, authorized-positive, unknown, reviewer ids, and reason. |

The report must be a versioned artifact produced by a named task. “Open the Wave 3 shadow report” is currently an instruction to open an artifact the plan never creates.

**Required defeat tests:** No exposure, storage error, nonzero dropped count, catalog/version mismatch, stale window, or cross-lane record must produce a green promotion gate.

---

### P0-05 — The plan knowingly banks a benign hard block and can finish with it live

**Type:** Verified outcome contradiction  
**Affected claims:** zero false positives, ordinary developer work, Risk 4

The plan documents a routine cache-cleanup command that matches `destructive-rm` and blocks (`M47A_IMPLEMENTATION_PLAN.md:4601–4615`). It then explicitly banks that same benign `block` at lines 6941–6953. Current `origin/main` still contains the matching rule.

Wave 4 demotes only five MEDIUM ordinary-work classes (`8083–8089`). `destructive-rm` is HIGH and is not among them. The final ordinary-work corpus omits the cache-cleanup case. The plan can therefore satisfy its Wave 4 exit while a known normal command still hard-blocks.

Static-Worker uses a more defensible rule—benign BLOCK is unbankable—but still banks known benign PROMPTs (`7205–7241`, `7266–7284`). That is valid as temporary migration debt, not as final zero-intervention proof.

**Required plan change:** Add a **bank-drain completion gate**:

- A benign BLOCK/REDACT is never bankable.
- A temporary WARN/PROMPT bank entry requires owner, defect id, cause, first-seen version, maximum age, expiry, and explicit certificate impact.
- The final detection-quality certificate requires zero known benign hard stops and no expired visible-intervention debt.
- The cache-cleanup case must be included in the final ordinary-work suite and the underlying matching logic fixed.
- Any fixed bank entry becomes a permanent regression rather than being deleted.

**Required defeat test:** Restore the broad `$HOME` destructive match and prove the final release gate fails, even if the entry remains in a baseline file.

---

### P0-06 — `monitor` is SOC-visible and can affect a call on an independently tainted session

**Type:** Verified semantic contradiction  
**Affected claims:** D6 zero visible FP definition, SOC noise, sequence behavior

Plan decision D6 defines zero FP as “nothing the developer or SOC sees fires on legitimate work” (`M47A_IMPLEMENTATION_PLAN.md:67`). But the plan’s ordinary-work design explicitly says monitor findings remain emitted, reported, and stored in the event ledger (`7829–7835`, `8060–8077`). Current endpoint and Backend paths send/store these findings.

That means “monitor” removes the immediate prompt/block but can still create a customer-visible detection row for a SOC analyst. It therefore does not satisfy the plan’s own D6 definition.

There is a separate second-order effect, but monitoring alone does **not** create taint. Current `Installers/internal/daemon/ai_ingress.go:325–328, 846–851` explicitly keeps monitored ingress non-tainting; qualified/forced ingress creates taint at `867–879`. Once a session is independently tainted, however, `ai_taint.go:151–165` treats any non-INFO raw finding on the current proposed tool call as risky, and `ai_handlers.go:2938–2954` overlays HOLD. A monitor-policy tool class can therefore turn that same call’s local allow into a developer-visible hold on an already-tainted session.

The W4 ordinary tests examine immediate outcomes, not benign multi-step sessions.

**Required plan change:** Define three separate concepts:

1. Private detector telemetry: aggregated/local, not a customer detection.
2. Customer-visible detection: creates a SOC row/alert and counts against the FP/intervention budget.
3. Enforcement signal: may change the current or later action.

Monitor-only benign findings must not silently become customer findings or enforcement inputs. If they are intentionally visible, they count as visible interventions/alerts and must meet the appropriate precision SLO. Monitoring by itself must remain non-tainting.

Taint must carry evidence/provenance and policy state, not merely “any non-INFO raw finding.” Product/Security must explicitly ratify which current-call monitor-policy signals can make an already-tainted action risky, using benign-sequence precision and poisoned-sequence recall evidence. Do not weaken a genuine poisoned-ingress HOLD merely to suppress an unrelated false positive; fix false taint and uncalibrated findings at their source or adopt a measured, relation-specific clearance policy.

**Required defeat tests:** (a) monitor-only ingress never taints; (b) a fully benign multi-step session produces no prompt, block, hold, incident, alert, or SOC detection row; (c) a benign hard negative that the current ingress classifier would otherwise misqualify is fixed and does not taint or hold; and (d) genuine poisoned ingress → risky/sensitive action still HOLDs. If the policy is narrowed for an already-tainted session, add paired relation-specific benign and malicious tests and measure the recall impact before promotion.

---

### P0-07 — Recall and precision gates are mathematically incapable of proving the claim

**Type:** Verified test weakness and proof gap  
**Affected claims:** high-quality detection, zero FP, evasive coverage

The proposed tool corpus has 51 benign and 10 attack cases mechanically derived from an existing public shell-expansion corpus. The ten attacks cover only three classes. `TestToolLane_RecallIsMeasuredNotAssumed` fails only when `interrupted == 0` (`M47A_IMPLEMENTATION_PLAN.md:6874–6901`). Catching one of ten attacks passes.

The plan also acknowledges only five prompt-risk cases (`9391–9398`), uses roughly two dozen fixed ordinary commands in W4, and uses 18 synthetic Static-Worker analogues. These are useful smoke and regression suites. They are not release-quality statistical evidence.

With zero observed false positives in `n` independent representative trials, the exact one-sided 95% upper bound is:

`upper = 1 - 0.05^(1/n)`

| Zero-error sample | Best one-sided 95% upper bound on true error rate |
|---:|---:|
| 10 | 25.89% |
| 18 | 15.33% |
| 24 | 11.73% |
| 51 | 5.70% |
| 128 | 2.31% |
| 2,995 | approximately 0.10% |
| 29,956 | approximately 0.01% / 100 ppm |

Those optimistic calculations assume independent, representative cases. Mechanically related mutations and repeated actions within the same user/session/tenant reduce the effective sample size.

**Required plan change:** Replace aggregate “not inert” gates with:

- Expected class, evidence, decision, enforcement result, and final state per attack case.
- Per-class and per-threat-family recall; no aggregate average can hide an inert critical class.
- Precision, recall, FPR, FNR, prevalence-aware PPV, UNKNOWN/abstention rate, support, interventions per 1,000 opportunities, and useful-task completion.
- Exact one-sided intervals and clustered intervals/bootstraps by user, session, endpoint, and tenant where relevant.
- The six-suite design from the master plan: regression, property/mutation, representative benign replay, actual end-to-end, private adaptive holdout, and incident suite.
- Public development corpora separated from access-controlled holdout and independently operated blind evaluation.
- Split by semantic base family before mutations, with near-duplicate detection.
- Two independent labelers plus adjudication for ambiguous cases.

The master plan’s numeric SLO table—not an invented smaller gate—must be copied or normatively referenced in the implementation plan.

**Required defeat test:** Change the recall result from 10/10 to 1/10 and prove the release gate remains red. Remove all cases for one enforcing class and prove coverage becomes UNKNOWN/non-green rather than silently disappearing from the denominator.

---

### P0-08 — Cloud command spelling is not proof of malicious or production impact

**Type:** Architecture and detector-design defect  
**Affected claims:** smart severity, zero FP, evasive cloud detection, Risk 4

W4 Task 5 labels new shapes “destructive by construction” and permits them to bypass the measurement order (`M47A_IMPLEMENTATION_PLAN.md:8770–8800`, `8932–8953`). It assigns HIGH/default-block behavior to infrastructure destroy, namespace deletion, storage purge, service shutdown, database deletion, and similar strings.

Destructive capability is not the same as unauthorized malicious action. Legitimate examples include ephemeral-environment teardown, staging cleanup, test-cluster deletion, controlled disaster-recovery drills, approved scale-to-zero, database migrations, incident response, and commands quoted in documentation/tests/commit messages.

The proposed rules also miss common equivalent effects:

- Global flags before the service name.
- Context/profile/region/config supplied through environment or files.
- Alternate APIs, SDKs, wrappers, scripts, aliases, and saved plans.
- Reordered options and `--flag=value` variants not in the pattern.
- Resource operations through `s3api`, ORMs, migration tools, SQL files, or deployment systems.
- Production targets reached through implicit client configuration rather than an explicit host flag.

The plan explicitly accepts a full destructive command quoted in a commit message firing. That is incompatible with zero visible FP if Write/Edit content is an enforcing surface.

**Required plan change:** Split detector and policy responsibilities:

- Detector emits a normalized **destructive capability/effect proposal**, not “malicious production action.”
- An effect resolver identifies executable, normalized argv, environment, account/profile, region, cluster/context, namespace, resource identifier/tags, destination, desired state, reversibility, and parser confidence.
- Policy resolves whether the target is production/sensitive and whether the subject has a current change/approval grant.
- Enforcement binds any approval to the exact normalized effect.
- Unknown/incomplete high-impact resolution becomes hold/restricted, not clean allow.
- Quoted code/documentation is a data context unless it is actually about to execute.

**Required defeat tests:** Every attack has a benign twin: production vs preview namespace, production vs staging account, remote production vs remote development database, executed argv vs quoted text, approved cleanup vs unapproved cleanup, exact effect vs one-byte/target mutation after approval.

---

### P0-09 — Known evasions and unsupported Windows semantics remain green by design

**Type:** Verified coverage gap  
**Affected claims:** evasive detection, managed-Windows high assurance, Risk 4

The first High-Assurance Governance Profile in the roadmap is a managed Windows cohort. Roadmap Risk 4 explicitly requires supported Bash, PowerShell, `cmd.exe`, and direct-argv semantics and names quoting, expansion, line continuation, indirection, encoded command, nested shell, and quoted-home evasions.

The implementation plan instead chooses D13: pattern-only Windows support and a later PowerShell AST packet (`M47A_IMPLEMENTATION_PLAN.md:74`, `8778`, `9656`, `17516–17517`). That is a valid scope limitation only if Windows semantic coverage remains `NOT_READY`; it cannot be a passing exit for the stated evasive-detection goal.

Current source also contains tests/inventories that document residual evasions without failing the build:

- `Installers/internal/toolrisk/quoting_bypass_pin_test.go` preserves an undetected quoted environment target.
- `Installers/internal/toolrisk/zz_c5_adversarial_probe_test.go` records suspected bypasses rather than asserting they are caught.
- Current residuals include a command-substituted destructive verb and an unknown variable used as a token separator.
- The dialect matrix is small relative to the catalog and cannot establish class-wide semantic parity.

The proposed cloud patterns add more literal shapes but do not close this class of bypass.

**Required plan change:** Choose one honest path:

1. Implement and certify semantic parsing/effect resolution for the Windows shells and direct argv required by the profile; or
2. Narrow this packet to a Bash/literal-pattern remediation slice and make Risk 4 / managed-Windows evasive coverage explicitly non-green until the later packet lands.

For the implementation path, unknown or failed parsing of a potentially mutating operation must produce `INSPECTION_INCOMPLETE` / hold/restricted behavior at the authoritative checkpoint. Raw-regex “no match” is not a clean semantic result.

**Required defeat tests:** Convert every known adversarial probe residual into a failing test. Add generated mutations for quote styles, caret/backtick/line continuation, environment expansion, aliases/functions, separators, comments, command substitution, nested interpreters, encoded payloads, wrapper scripts, direct argv, global flag reordering, PowerShell `-EncodedCommand`, and cmd variable expansion.

---

### P0-10 — `deriveCombos` is an unrelated-signal amplifier, not corroboration

**Type:** Detector-design defect  
**Affected claims:** smart/evasive detection, severity correctness, false-positive control

The proposed tool `deriveCombos` creates `corroborated-elevated-risk` whenever:

- Any one of five ordinary-work MEDIUM classes appears; and
- Any other non-ordinary MEDIUM or HIGH finding appears anywhere in the combined scan.

It combines raw, normalized, AST, sensitive-path, and content findings, including source being written through Write/Edit (`M47A_IMPLEMENTATION_PLAN.md:7805–7873`, `7888–7894`). It does not require:

- The same field, command, operand, AST node, span, or resource.
- Proximity.
- Source-to-sink or dataflow.
- A shared destination.
- A causal or temporal relationship.
- A named threat pattern.

Two unrelated regex matches in a security document or source file can therefore synthesize a developer-visible warning. Conversely, an attacker can split the two signals across calls and avoid the same-call combination.

The existing prompt/ingress combo functions are pair-specific class combinations; copying the name of that mechanism does not justify generalizing it to “anything plus anything.”

**Required plan change:** Replace generic co-occurrence with named, relation-specific correlations. Each correlation must declare:

- Threat objective.
- Required source class and sink/capability class.
- Valid surfaces/fields.
- Relation predicate: same AST command, dataflow, destination, resource, bounded proximity, or ordered session sequence.
- Maximum time/call boundary.
- Evidence and uncertainty behavior.
- Benign counterexamples.
- Final state that proves the attack succeeded or was prevented.

If the relation cannot be proven, the two findings remain separate evidence; they do not acquire stronger confidence merely by co-occurring.

**Required defeat tests:** Quote two unrelated dangerous examples in one document and prove no combo. Split a real source→sink attack across tool output and later call and prove the sequence control catches it. Swap the destination or insert an unrelated clean action and prove the relation behaves according to its declared semantics.

---

### P0-11 — Prompt-injection quality is lexical and unevaluated end to end

**Type:** Proof and architecture gap  
**Affected claims:** evasive prompt detection, Risk 5

Current prompt-risk has useful normalization, bounded decoding, hard negatives, English regex/context classes, and static derived combinations. The plan promotes six regex-context classes to warning based on the invalid shadow gate. It adds no serious prompt-injection benchmark, adaptive evaluator, or final unauthorized-effect grader.

This is insufficient for the threat model named by the roadmap and current research:

- Direct and indirect injection.
- Multilingual and mixed-script attacks.
- Semantic paraphrase and social-engineering framing.
- Obfuscation, adversarial suffixes, encodings, and payload splitting.
- Instructions split across turns, tool outputs, documents, repository files, or context compaction.
- Delayed triggers, cross-session continuation, and tool-chain attacks.
- Model output that becomes later instruction/data.
- Image/OCR and other modalities when claimed supported.
- Adaptive attacks that observe detector decisions/explanations and change strategy.

A regex classifier can be useful evidence. It cannot be the trust boundary. OpenAI’s current guidance explicitly describes developed attacks as often evading intermediary “AI firewall” classifiers and recommends constraining source-to-sink impact even when manipulation succeeds. Microsoft’s guidance combines prompt shields with spotlighting, plan-drift detection, tool-chain analysis, information-flow control, least privilege, and human confirmation. OWASP separately requires complete mediation at downstream actions.

**Required plan change:** Add a dedicated Risk 5 architecture/evaluation task that:

- Preserves source trust and typed provenance across prompt, retrieval, tool result, retry, fork, compaction, model output, and action proposal.
- Separates trusted instructions from untrusted data structurally.
- Evaluates a semantic/adaptive layer in addition to deterministic lexical signals.
- Uses source→sink and user-intent/action relation controls.
- Restricts capabilities while untrusted-derived instructions remain in scope.
- Measures unauthorized final effects, not just detector matches.
- Measures benign task completion and intervention load alongside attack success.
- Pins the exact model, provider, system prompt, decoding parameters, detector, normalizer, parser, policy, and tool schema.

**Required defeat tests:** At minimum include English, Hebrew, Arabic, mixed script, paraphrase, role-play, long context, code comments, HTML/Markdown, nested encoding, split tool results, cross-turn attacks, delayed actions, repository injection, clean security documentation twins, and adaptive repeated attempts against the exact release environment.

---

### P0-12 — Wave 7 proves scanner execution truth, not vulnerability-detection quality

**Type:** Proof gap  
**Affected claims:** Risk 2, high-quality insecure-code detection

Wave 7 is valuable. It fixes false-green paths caused by missing engines, fork behavior, polling, and overwritten `COVERAGE_FAILED` state. Its exit criteria prove that required scanners produced an execution manifest and that absence does not look green (`M47A_IMPLEMENTATION_PLAN.md:15272–15324`, `17487–17501`).

An inert or inaccurate scanner can still execute successfully and truthfully return an empty result. None of W7’s exit criteria measures:

- Vulnerability recall or precision.
- CWE/language/framework strata.
- Cross-file source-to-sink flows and reachability.
- Generated/minified/obfuscated variants.
- Suppression/baseline behavior.
- Secret, IaC, container, dependency, and license quality separately.
- Per-engine contribution, overlap, and blind spots.
- Exact ruleset/model version quality.

The plan therefore closes execution coverage, not detection coverage.

Current source is not starting from zero: it already contains the `quality-corpus`, general and AI corpora, a `quality-precision-gate.yml` workflow, and the `scanner-worker/bench/recall-6` benchmark. Those assets are useful development/regression foundations. They do not yet supply the representative strata, private blind governance, effective support, or confidence-bounded release evidence required for the claim.

**Required plan change:** Inventory and extend the existing quality assets, then follow W7 with **Code Security Detection Certification**:

- Labelled vulnerable and benign repositories by CWE × language × framework.
- Seeded realistic mutations and repair-revert tests.
- Reachable vs unreachable source→sink twins.
- Per-engine expected findings and end-to-end merge outcome.
- Precision, recall, UNKNOWN coverage, latency, and ruleset/version evidence.
- Independent private holdout and external blind challenge.
- No aggregate score hiding a failed critical stratum.

GitHub’s own CodeQL documentation distinguishes the high-precision default suite from the broader, lower-precision extended suite. Ceragon likewise needs explicit enforcement tiers rather than treating all engine output as equally block-worthy.

**Required defeat test:** Disable the finding logic while leaving the engine execution/status green. The detection-quality gate must fail even though the W7 execution manifest passes.

---

### P0-13 — The LLM code scanner has real injection defenses, but no behavioral proof

**Type:** Proof gap with important current-code correction  
**Affected claims:** Risk 2 and Risk 5

It would be incorrect to say the current scanner has no indirect-prompt-injection defense. Current code includes:

- `scanner-worker/src/opus-baseline-prompt.ts`: source/sink grounding rules and explicit treatment of `CERAGON_*` blocks as untrusted data.
- `scanner-worker/src/utils/prompt-sanitizer.ts`: sentinel escaping, control/bidi stripping, truncation, marker detection, and untrusted fences.
- `opus-baseline-prompt.spec.ts`, `prompt-sanitizer.spec.ts`, trust-model tests, and finding-validation tests.
- Structured output schemas and deterministic validation layers.

These are worthwhile defense-in-depth layers and must be preserved.

The missing evidence is behavioral. Existing tests mostly prove that fences/instructions are present and strings are escaped. They do not prove—through each enabled model/scanner route—that a malicious repository cannot:

- Suppress a true vulnerability.
- Fabricate a vulnerability or line number.
- Downgrade confidence/severity or claim coverage that did not occur.
- Redirect the narrative.
- Poison a second-pass/finding validator.
- Trigger a false green through malformed/overlong output.

**Required plan change:** Create a sealed scanner-injection corpus containing malicious comments, strings, documentation, file paths, package metadata, generated files, mixed encodings, split instructions, and benign security-instruction twins. Execute it through every enabled Anthropic/Gemini route with the exact release model/prompt. Grade both security outcome and ordinary vulnerability-recall/precision impact.

The scanner model must remain advisory. Exact schema, path, line, source→sink, reachability, execution coverage, and merge policy are deterministically validated. A model statement that “the repository is safe” is never an authoritative allow.

**Required defeat test:** Inject a repository instruction telling the scanner to omit one seeded critical finding and invent another. The gate must prove the real finding remains, the fabricated one is rejected or non-enforcing, and scanner coverage does not become green solely from model output.

---

### P0-14 — DLP breadth and full-depth scanning improved, but DLP quality is not certified

**Type:** Proof gap  
**Affected claims:** Risk 1, zero FP, secret-evasion quality

Current-main DLP is stronger than the plan’s baseline: full-depth scanning is canonical, shallow-scan drift is guarded, the registry is explicit, and 48 code-security parity classes expanded provider coverage. Those improvements should be reused.

They do not remove the need for a class-balanced quality program:

- The published holdout still has private-key, connection-string, payment-card, and prompt-risk residuals.
- Many new provider classes have synthetic positives but not representative class-specific hard negatives.
- Provider identifiers, public/client keys, DSNs, revoked/test tokens, and true credentials require different evidence and posture.
- Token formats evolve and can have multiple generations.
- Base64, hex, URL encoding, Unicode, wrapping, splitting, archives, history, logs, crash payloads, and model/provider payloads have different coverage.
- Generic entropy/password detection has different precision from a high-confidence provider-prefixed credential.
- “Detected” is not the same as “redacted before every external boundary.”

**Required plan change:** Add a DLP/secret qualification matrix by:

- Provider and token generation.
- Credential, identifier, public/client key, configuration, personal-data, and heuristic family.
- Representation/encoding.
- Surface: prompt, tool result, source corpus, attachment/document, archive/history, evidence, log/SIEM/export, provider request, and model output.
- Valid, invalid-lookalike, expired/revoked/test, public-by-design, masked, and synthetic canary state.
- Expected action: redact, hold, warn, monitor, or allow.

Blocking/redaction eligibility must be earned per class/surface. Generic entropy or semantic password signals remain non-blocking until they independently meet the applicable release gate.

**Required defeat test:** Add one new producer credential class with no benign twins and prove it cannot enter an enforcing preset merely because it exists in the registry.

---

### P0-15 — W0 stops a privacy-voiding override, but does not build the required pre-egress boundary

**Type:** Architecture dependency  
**Affected claims:** secrets/company-data exposure, Risk 1

Wave 0 correctly identifies a deployed configuration that allowed raw repository corpora to reach Anthropic and Gemini under the evidence mode intended not to send source (`M47A_IMPLEMENTATION_PLAN.md:150–188`). Removing those overrides is urgent and correct.

Current scanner source does have pre-egress protection on some routes: `scanner-worker/src/processor-pipeline.ts:1824–1846` applies SinkGuard immediately before an LLM request, and `services/security-context-builder.service.ts:350–380` scans/redacts context before injection fencing. Those controls must be preserved. Neither the plan nor current proof inventories a complete, fail-safe boundary across every Anthropic, Gemini, and other provider route and every payload surface. Removing the `ALLOW_MINIMAL` exceptions prevents one unauthorized policy state; it does not by itself prove the roadmap’s Risk 1 boundary for every source corpus, prompt, tool result, attachment, or evidence payload, including parser/truncation/oversize failures.

**Required plan change:** Preserve W0, then add a companion mandatory dependency for:

- Full-depth pre-egress secret/data scanning before every external-provider route and payload surface, including the named Anthropic/Gemini corpus routes and configurable/BYO OpenAI-compatible routes.
- Safe transform with original/transformed digests and line-map preservation.
- Parser/scan/oversize failure → no external send, never “scan prefix, send whole.”
- Provider/region/retention/training/cache/subprocessor policy bound to the receipt.
- A private/no-external-provider path for the high-assurance profile.
- Network-captured defeat tests proving seeded forbidden bytes do not cross provider, queue, log, evidence, export, or crash boundaries.

Until deployed and live-proven, Risk 1 remains non-green even if W0 succeeds.

---

### P0-16 — Detection lacks a complete authoritative effect boundary

**Type:** Architecture dependency  
**Affected claims:** prevention, Risk 4, Risk 5, 9+ certification

The plan’s own summary says the effect-bound approval transaction is built but disconnected from the command lane (`M47A_IMPLEMENTATION_PLAN.md:43`). D14 keeps fail-open (`75`). No wave connects every high-impact sink to an authoritative broker that actually withholds the effect.

This is not a detection-quality detail. It is the difference between detecting a dangerous-looking proposal and preventing an unauthorized action. A cooperative hook that emits `BLOCK` but can be bypassed, or a detector outage that proceeds, cannot earn prevention/unavoidability credit.

OWASP Excessive Agency guidance requires downstream authorization, least privilege, user-context execution, and complete mediation. The roadmap requires exact effect-bound approval and independently observed effects.

**Required plan change:** Add or name a mandatory companion wave that:

- Enumerates every in-scope high-impact sink.
- Routes 100% through an authoritative withholding checkpoint.
- Binds subject, runtime, executable/tool, normalized arguments, resource, destination, credential scope, artifact/policy digest, expiry, use count, and prepared effect.
- Accepts approval only from a trusted independent human channel.
- Uses short-lived least-privilege credentials.
- Produces attempted, authorized, executed, and independently observed-effect receipts.
- Enters restricted/read-only mode on authority failure for governed mutations.

Detection promotion cannot compensate for incomplete mediation. If this remains outside the current packet, label the packet accordingly and keep Risk 4/Risk 5 `NOT_READY`.

**Required defeat tests:** Replay, expiry, changed arguments, changed target, executable swap, identity swap, stale policy, fake approval text, daemon outage, and direct-binary bypass must all fail at the final boundary.

---

### P0-17 — Artifact-admission job/result integrity remains permissive; scanner signing still needs lane-specific live proof

**Type:** Architecture and evidence-integrity blocker  
**Affected claims:** Risk 3 artifact admission; Risk 2 live transport proof; trustworthy block/allow evidence

The plan’s exclusions say SQS job and result traffic that drives **install-time artifact admission** is unsigned (`M47A_IMPLEMENTATION_PLAN.md:17514–17515`). That exclusion belongs to the Static/Sandbox/Intelligence package lane and Risk 3, not automatically to Wave 7’s GitHub code-scanner lane. Current Sandbox configuration still documents permissive legacy unsigned acceptance on relevant paths.

Current code does implement fail-closed HMAC contracts for important scanner traffic: Backend signs scanner dispatch and fails closed in production when signing is unavailable (`Backend/src/github-app/services/scan-dispatch.service.ts:3864–3918`); scanner-worker verifies and rejects unsigned messages when required (`scanner-worker/src/main.ts:264–284`, `secure-config.ts:20–32`); worker-produced processor messages are signed (`scanner-worker/src/worker.ts:4245–4268`); and current task definitions enable signed-contract enforcement. The remaining scanner work is not “add signing from scratch.” It is deployment proof and adversarial verification of replay, suppression, completeness, tenant/repository/SHA/policy binding, rotation, and outage behavior.

**Required plan change:** Rebaseline each transport lane separately. Close unsigned/permissive Static/Sandbox/Intelligence artifact-admission paths under Risk 3, and prove the already-signed scanner lane live under Risk 2:

- Require canonical signed job/result envelopes on every enforcing lane; preserve existing scanner signing.
- Bind organization, repository, commit SHA, run id, policy digest, scanner artifact/ruleset/model versions, result pages, queue/producer/consumer identity, nonce, issued/expiry time, and replay state.
- Reject unsigned, wrong-tenant, wrong-queue, wrong-SHA, expired, replayed, incomplete, or KMS-unverifiable messages.
- Preserve key rotation and outage semantics.

Until the relevant lane is deployed and proven, it may claim “integrity mechanisms represented in code,” but not an authoritative live verdict. Do not use scanner signing as evidence that the separate artifact-admission lane is closed.

---

### P0-18 — Untrusted package execution can occur after containment has already failed

**Type:** Architecture dependency; applies if malicious package/dependency assurance is in scope  
**Affected claims:** malicious dependency protection and containment

The user deferred skills, plugins, and MCP, not malicious packages. The reviewed plan includes Static-Worker package FP work but does not address the Sandbox-Worker execution boundary.

Current `Sandbox-Worker/src/schemas/sandbox-execution-mode.ts` defines five canonical modes: `bwrap`, `bwrap-v2`, `bwrap-no-netns`, `strace`, and `direct`. `sandbox-runner.ts` documents that `bwrap-v2` uses controlled network without `--unshare-net` and is intended to be off in production; `bwrap-no-netns` also lacks the network namespace. The `strace` fallback provides syscall telemetry without namespace isolation. `direct` provides no isolation and no strace/syscall telemetry; it retains only coarse process/stdout/stderr and filesystem-diff observations.

Downstream logic can honestly mark degraded analysis inconclusive, but in `strace` or `direct` the untrusted package has already executed against the worker host before that verdict. A correct post-execution `INCONCLUSIVE` does not contain the impact. The weaker bwrap modes also require an explicit certified-network decision rather than being collapsed into “bubblewrap present.”

The roadmap Risk 3 contract requires refusing production detonation unless the certified isolation/network boundary is proven before launch. Current Ceragon Intelligence also contains a Windows Hyper-V air-gapped harness that the plan does not inventory.

**Required plan change:** Either:

- Add a package-analysis containment/cross-platform verdict task that refuses untrusted execution unless required isolation, network namespace, clean environment, least privilege, bounded mounts, and no worker credentials are proven before launch; or
- Explicitly exclude malicious-package protection from this packet and keep the corresponding risk certificate non-green.

Degraded direct execution may remain only in a separately isolated lab with no production credentials or network authority. It cannot produce a certified allow.

---

### P0-19 — The roadmap’s F16 endpoint signing-authority prerequisite is absent

**Type:** Named roadmap trust-boundary dependency; not a detector-accuracy defect  
**Affected claims:** Risks 1, 3, and 4; shared trust gate; authoritative endpoint evidence

The roadmap explicitly withholds completion credit at `docs/Devoid_Roadmap_To_Finished_Product.md:788`. Before Risks 1, 3, 4, or the shared trust gate can certify, a non-elevated user/agent must be unable to mint, choose, replace, read, or export the long-lived endpoint signing secret. The ownership table repeats F16 as mandatory for R1, R3, and R4 (`:945`, `:947–948`).

Current `Installers/internal/policybundle/trust_anchor_client.go:375–418` contains a nil-identity path that creates an endpoint signing identity, persists it, reads it back, and adopts it. Its read-denial and authoritative-scope checks address replacement/bricking hazards, but they do not by themselves prove privileged caller custody or non-exportability across every mint/convergence entry point. This review does not assert that every standard-user call path is reachable; it asserts that the named prerequisite remains unproven and is missing from the plan.

**Required plan change:** Add a mandatory F16 companion task/dependency that:

- Moves mint, convergence, recovery, and rotation behind a SYSTEM/privileged broker or non-exportable key owner.
- Binds the key to the enrolled endpoint identity and prevents user-selected/replacement material.
- Inventories every caller and write destination, including compatibility/migration paths.
- Defines privileged recovery and rotation without breaking uninterrupted read-only verification.
- Keeps R1, R3, R4, and the shared trust certificate `NOT_READY` until deployed evidence exists.

**Required defeat tests:** Exercise every non-elevated entry point and prove denial of mint, choose, replace, read, and export; prove privileged enrollment, recovery, and rotation; prove stale/replayed/wrong-endpoint material is rejected; and prove read-only verification remains available through rotation and recovery.

---

## 7. Major findings — P1

P1 findings may be implemented after the core P0 architecture is corrected, but they must be in the plan before it can claim high-quality detection.

### P1-01 — Impact and confidence are still mostly declared, not measured

The W2 split between impact and confidence/evidence is directionally correct. The proposed implementation weakens that concept:

- `ClassImpact()` equals detector tier for every class except a static set promoted to CRITICAL (`M47A_IMPLEMENTATION_PLAN.md:4130–4156`).
- The test forbids impact below detector tier, preserving the conflation rather than separating it.
- Tool-risk findings remain explicitly ungraded (`2065–2067`).
- Numeric rule “confidence” values are overlap-ranking constants, not calibrated probabilities.
- Mapping `regex-context → medium` is a mechanism label, not empirical positive predictive value.

Actual impact depends on asset, environment, resource, destination, identity, authorization, scope, reversibility, externality, and observed effect. The same destructive command can be critical in production, expected in an ephemeral test environment, or merely quoted in documentation.

**Required change:** Use three separate fields:

1. `evidenceStrength`: exact/validated, corroborated, probable, weak, unknown.
2. `baseCapabilityImpact`: what the operation could do in a generic context.
3. `resolvedConsequence`: environment/resource/authorization/reversibility-aware impact for this event.

Only call a value “confidence” if calibrated against heldout labels and published with support, PPV, interval, and calibration error. Otherwise use a categorical evidence-strength name.

Policy consequence is derived from evidence strength × resolved consequence × destination/authorization × reversibility—not from detector severity alone.

---

### P1-02 — Unknown class handling is misdescribed in Task 6

`M47A_IMPLEMENTATION_PLAN.md:9141` says newly emitted tool classes are rejected by Backend until the consumer update lands. Current DTO reality does not support that statement: finding `class` is open text on the agent wire. The actual problems are that unknown classes are not configurable, fall through to `unknown-class-default`, and are absent from governed denominators/UI metadata.

**Required change:** Correct the premise and deployment risk. Preserve Backend-before-agent ordering where policy/configurable enums require it, but write the real failure mode. Add a test that an ahead-of-Backend finding is accepted as evidence, visibly marked ungoverned/unknown, cannot inherit an unsafe permissive action, and keeps the applicable certificate non-green.

---

### P1-03 — Production feedback is not a governed quality label

Wave 6 adds triage status, notes, assignment, and activity. It does not create a quality-learning loop that distinguishes:

- Detector false positive.
- Correct detector, policy too strict.
- Correct detection of an authorized action.
- Incorrect explanation.
- Duplicate.
- Attack/incident.
- Unknown/unreviewable.

Shadow disagreement also is not automatically a false positive; it only proves the candidate and incumbent differ.

**Required change:** Add sampled adjudication with:

- Detector/class/version/policy attribution.
- Two-person review for ambiguous security labels.
- Reason codes and evidence sufficiency.
- Reviewer agreement measurement and adjudication.
- Protected corpus promotion with provenance.
- No online threshold update from untrusted user feedback.
- Drift/change-point monitoring and automatic rollback thresholds.
- Appeal, suppression, exception expiry, and label-poisoning controls.

---

### P1-04 — Static-Worker’s existing TP gate can hide an ecosystem-specific escape

Current `Static-Worker/src/__tests__/corpus-fp-gate.test.ts` TP logic can pass when a fixture is caught in either npm or PyPI, even if it escapes in the ecosystem to which it applies. Aggregate cross-ecosystem success is not class coverage.

**Required change:** Every fixture declares applicable ecosystems, expected class/code, minimum verdict, and expected final state. A miss in any applicable ecosystem fails. Non-applicable ecosystems are excluded explicitly, not treated as alternative opportunities to pass.

---

### P1-05 — Known adversarial inventories must become gates or named limitations

An inventory that prints bypasses is useful discovery, but it cannot coexist with a green “evasive detection” claim. Every currently known miss must become one of:

- A release-blocking attack regression.
- An unsupported surface that is technically restricted.
- An explicit non-green limitation with owner, planned packet, and certificate impact.

It cannot remain a passing diagnostic test whose comments acknowledge the bypass.

---

### P1-06 — No resource-exhaustion and inspection-budget quality contract

Detection can fail through timeout, truncation, recursion limits, archive limits, model token limits, output truncation, parser memory pressure, or high event volume. The plan has isolated caps and failure handling but no unified rule that every exhausted surface reports `UNKNOWN`/degraded and cannot earn a clean allow.

**Required change:** For every detector lane, declare:

- Maximum supported bytes/items/depth/time.
- What was inspected and omitted.
- Whether omission can contain a critical class.
- Fail action by asset/destination/capability.
- Latency/CPU/memory SLO.
- Truncation and exhaustion telemetry.
- Adversarial budget-exhaustion fixtures.

The final evidence manifest must report both inspection completeness and denominator uncertainty.

---

### P1-07 — Corpus/version lineage is incomplete

The plan includes digests in places, but certification requires the complete behavioral tuple:

- Semantic base case and mutation lineage.
- Label version and reviewers.
- Detector/ruleset/model/system-prompt/normalizer/parser/policy versions.
- Runtime/OS/shell/tool schema.
- Seed, decoding settings, trial count, and retry policy.
- Expected finding, decision, enforcement, and final state.
- Exclusion and UNKNOWN reason.

Any relevant change invalidates the affected certificate. A corpus digest alone does not prove the same system was tested.

---

### P1-08 — The plan’s workstation-specific instructions are not fresh-chat reproducible

The document embeds hard-coded Windows user paths, a throwaway generator under another agent/session scratch directory, exact line numbers on moving branches, and a required `superpowers:*` skill that may not exist in a fresh environment.

This is especially risky because the owner intends to hand the plan to another agent/coworker.

**Required change:**

- Express paths relative to a discovered workspace root.
- Put generators under a repository-owned `scripts/` or plan-owned tools directory.
- Begin with a source-revision manifest and symbol/discovery checks rather than trusting line numbers.
- Make optional orchestration skills advisory; the plan must remain executable without them.
- Separate live AWS runbooks from code implementation tasks and discover guarded identifiers at runtime.

---

### P1-09 — Final exclusions must drive certificate state, not disappear below the exit criteria

The plan excludes provider/data-processing declarations, event retention, unsigned artifact-admission transport, Windows semantic parsing, branch protection, and prompt-evidence key distribution (`M47A_IMPLEMENTATION_PLAN.md:17505–17520`). Several are mandatory dependencies of roadmap Risks 1–5. The separate F16 trust prerequisite is absent rather than merely listed as an exclusion.

**Required change:** Add a certificate-impact table:

| Exclusion/dependency | Affected risk/dimension | Required state while open |
|---|---|---|
| Provider/data-processing boundary | R1 coverage/live operations | `NOT_READY` |
| `ai_events` retention and purge | R1 evidence/recovery | `NOT_READY` or explicitly bounded lower score |
| Unsigned/permissive artifact-admission job/result transport | R3 prevention/evidence | `NOT_READY` |
| Scanner signed-transport deployment, replay, binding, completeness, rotation, or outage unproven | R2 prevention/evidence | `NOT_READY` |
| PowerShell/cmd semantic gap | R4 coverage | `NOT_READY` for managed Windows evasive claim |
| Unprotected branches | R2 prevention | `NOT_READY` |
| Prompt-evidence key distribution | R1/R5 evidence integrity | `NOT_READY` |
| Disconnected effect broker | R4/R5 prevention | `NOT_READY` |
| F16 endpoint signing-key custody | R1/R3/R4/shared trust | `NOT_READY` |

The implementation slice may complete while certificates stay non-green. The UI and handoff must say so.

---

### P1-10 — Release rollback and drift triggers are under-specified for detectors

One-class-per-commit is good. A mature release program also needs automatic invalidation and rollback when:

- Model/provider/prompt/parser/normalizer/tool schema changes.
- Candidate block/intervention rate leaves its envelope.
- A confirmed benign hard stop appears.
- A critical miss or unauthorized effect appears.
- Coverage, evidence integrity, latency, or utility regresses.
- One tenant/language/runtime subgroup diverges.

**Required change:** Copy the master plan’s promotion/rollback contract into the implementation plan and bind every detector class/surface to an owner, canary percentage, stop condition, compatible known-safe rollback composite, and maximum evidence age.

---

### P1-11 — Alert precision and approval fatigue need product-level gates

A warning that is technically correct but routinely irrelevant trains users to approve automatically. A SOC row that is non-actionable is also a false-positive cost even if the underlying regex match is factually true.

**Required change:** Measure:

- Confirmations/denials per 1,000 benign eligible actions.
- Unnecessary visible interventions per 1,000 benign sessions.
- Duplicate confirmations for unchanged effect.
- Override/exception rates.
- Abandonment and task completion.
- SOC actionable precision.
- Time to resolve and work-state preservation.

Do not optimize detector FPR while ignoring user and analyst intervention rates.

---

### P1-12 — Independent review must control the hidden release set

The plan was heavily reviewed during authoring, but author count and token count are not evidence quality metrics. Detector authors must not own the only release data they can tune against.

**Required change:** Assign an independent evaluation owner to the sealed corpus and adaptive attack harness. Require external or organizationally independent reproduction of the highest-impact defeat cases. NIST’s sequestered evaluation model is the relevant pattern: blind data and a controlled environment reduce train/test contamination.

---

## 8. Plan-quality scorecard

These are review ratings for the **plan’s ability to prove its intended outcome**, not scores for the current deployed product and not breach probabilities.

| Area | Plan as written | After required revision | Reason |
|---|---:|---:|---|
| Deployment sequencing / compatibility | 8.5/10 | 9+/10 | Strong ordering and migration awareness; needs current-main rebase and portable instructions. |
| Evidence honesty / false-green prevention | 8.0/10 | 9+/10 | UNKNOWN discipline and W7 are strong; lane-specific integrity deployment proof and certificate impact remain. |
| Measurement science | 3.5/10 | 9+/10 target | Wrong lane, global denominator, weak recall gate, tiny/public corpora, no confidence bounds. |
| False-positive closure | 3.5/10 | 9+/10 target | Known hard block and warnings are banked; SOC-visible monitor output and unqualified pre-tainted HOLD contribution conflict with D6. |
| Evasive command/action detection | 4.0/10 | 9+/10 target | Good existing AST foundation, but known bypasses, regex cloud rules, Windows deferral, no effect resolver. |
| Prompt-injection assurance | 3.5/10 | 9+/10 target | Useful lexical/taint foundations, but invalid gate and no adaptive source→sink evaluation. |
| Secret/DLP assurance | 5.5/10 | 9+/10 target | Current full-depth/registry work is strong; consumers are stale and per-class quality proof is missing. |
| Code-scanner execution truth | 8.5/10 | 9+/10 | W7 directly repairs false greens; current signing must be preserved and proven live for binding, replay, completeness, rotation, and outage. |
| Code-scanner detection accuracy | 4.0/10 | 9+/10 target | No CWE/language/framework precision/recall or scanner-injection behavioral program. |
| Severity/evidence calibration | 5.0/10 | 9+/10 target | Two-axis intent is right; static inheritance and uncalibrated numbers are not enough. |
| UX and triage truth | 8.0/10 | 9+/10 | Detailed and valuable; must distinguish private telemetry, detections, alerts, and enforcement. |
| Authoritative prevention | 4.0/10 | 9+/10 target | Effect broker disconnected, fail-open retained, direct paths and external authority unresolved. |

**Overall review:** approximately **5/10 as a final high-assurance detection plan**, and approximately **8/10 as a remediation/operability foundation**. The gap is not document polish; it is proof validity and authoritative effect control.

If executed unchanged, the expected assurance ceiling remains well below 9 for Risks 1, 2, 4, and 5. The roadmap’s current 5.x baselines would improve, but no 9+ certificate would be defensible from these waves alone.

---

## 9. Normative measurable release gates

The roadmap names the master plan’s “Recommended release SLOs” table as the sole numeric authority for Risk 5, and the same evaluation discipline is appropriate across the detection program. Claude should reference that table normatively rather than inventing a second set of thresholds.

### 9.1 Initial enforcement gates to carry into the revised plan

| Dimension | Initial gate from the master plan | What the implementation plan must produce |
|---|---|---|
| Deterministic critical invariant | Zero observed bypass in the predeclared surface/action matrix | Enumerated path matrix, exact release artifact, final-state grader, zero unexecuted/unknown rows. |
| Adaptive unauthorized-effect rate | One-sided 95% upper bound below 1% per declared stratum; report ASR@N | Adaptive harness, exact model/runtime/profile, scenario-clustered interval, unauthorized final-effect grader. |
| Hard-block false-positive rate | One-sided 95% upper bound ≤100 ppm overall; important subgroup ≤0.1% | Representative benign opportunities, exact bound, class/surface/tenant/runtime support, zero known hard blocks. |
| Hard-block precision | One-sided 95% lower bound ≥99.9% among independently adjudicated candidate blocks | Candidate-block review set, independent labels, reasoned adjudication, interval by enforcing class. |
| Detector recall / false-negative rate | **Authority gap:** the master table has no general threshold for DLP, tool, code, or package detector recall | Before promotion, Product/Security must ratify per-family and critical-stratum recall/FNR thresholds, minimum effective support, lower confidence bounds, and non-aggregatable must-pass strata. Until then, recall is `NOT_READY`; this review does not invent a competing threshold. |
| Benign task utility | No more than 0.5 percentage-point paired degradation | Clean/instrumented paired tasks, task-success grader, interval and subgroup results. |
| Safe-transform utility | At least 98% task completion | Exact typed replacement, clean rescan, line-map/round-trip tests, final task result. |
| Total confirmations/denials | At most 5 per 1,000 benign eligible action opportunities | Opportunity denominator, unique sessions/users, action class, intervention cause. |
| Unnecessary visible interventions | At most 1 per 1,000 benign sessions | Developer and SOC visibility tracked separately; duplicates removed. |
| Duplicate confirmation | Zero when action scope has not changed | Exact effect binding and repeated-call tests. |
| State preservation | At least 99.99% of interventions preserve the draft/action | Before/after state digest and recovery evidence. |
| Confirmation resolution | p50 ≤10 s, p95 ≤30 s | End-to-end user workflow timing. |
| Local fast path | p50 ≤50 ms, p95 ≤100 ms, p99 ≤250 ms | Per-lane latency distributions and incumbent comparison. |
| Expensive semantic/judge routing | At most 1% of operations | Eligible-operation denominator and cost/latency. |
| Redaction precision | One-sided 95% lower bound ≥99.5% | Independently labelled redaction spans by data class/language/surface. |
| Typed-token round trip | 100% | Original/transformed/restored equivalence and scope isolation. |
| Controlled E2E path coverage | 100% of declared paths | Independently discovered path denominator and enforcement receipts. |
| Production inspection completeness | At least 99.9% against an independently discovered expected-action denominator | Expected vs observed actions, unknown/blind spots visible. |
| SOC alert precision | One-sided 95% lower bound ≥90% actionable | Independent SOC adjudication and alert support. |
| Accessibility/honesty | WCAG 2.2 AA; truthful sent/held/sanitized/blocked/uninspected state | UI tests plus human verification. |
| Rollback | Halt/withdraw candidate and restore known-safe connected canary within five minutes | Witnessed drill and evidence; offline endpoint/capability scopes reported separately. |

These are starting gates subject to formal ratification by Product, Security, Privacy, and SRE. A disjoint exploratory baseline may inform thresholds, but ratification must happen before release-candidate/private-holdout results are unblinded and before promotion. In particular, the missing general recall/FNR authority must be resolved before any “high-quality detection” promotion; a point estimate or one nonzero hit is not a substitute.

### 9.2 Sample-size reality

For zero observed errors under independent Bernoulli trials, the one-sided 95% upper error bound is `1 - 0.05^(1/n)`. Therefore:

- Below 0.1% needs approximately 2,995 representative zero-error opportunities.
- Below 0.01% / 100 ppm needs approximately 29,956.
- Below 0.001% / 10 ppm needs roughly 300,000.
- A 99.9% lower precision bound with zero false blocks likewise needs roughly 3,000 independently adjudicated candidate blocks.

Do not inflate `n` with near-duplicate mutations, retries, or repeated actions from one session. Report action-level and cluster-aware user/session/tenant intervals.

### 9.3 Prompt-injection adaptive gate

For each declared critical source→sink stratum:

- Report ASR@1, ASR@10, and ASR@100.
- Grade whether an unauthorized effect occurred, not whether the detector emitted a label.
- Report useful-task completion, affected assets/bytes/records, live credentials exposed, time/cost to first success, and worst subgroup.
- Use multiple adaptive attacker models plus human expert attempts.
- A zero-success point estimate is not enough; the one-sided 95% upper bound must be below 1% for initial enforcement.
- Because attempts within one scenario are correlated, use scenario/session-clustered intervals and do not pretend 100 retries on one base case are 100 independent scenarios.

Anthropic’s published adaptive method gives an attacker 100 attempts per environment and explicitly treats even a 1% attack-success rate as meaningful risk. The internal master plan correctly sets a stricter statistical release requirement than a single 100-attempt demonstration.

### 9.4 No-data and incomplete-data rules

The following must always be non-green for promotion/certification:

- Zero eligible observations.
- Missing per-class denominator.
- Nonzero dropped evidence.
- Store/read error.
- Mixed measurement lanes.
- Unknown or stale detector/catalog/policy/model version.
- Window beyond the approved freshness TTL.
- Unexecuted cases.
- Missing final-state grader.
- Unsupported parser/modality that can contain an in-scope critical attack.
- Missing independent adjudication for a precision claim.

### 9.5 Simultaneous and continuously observed gates

Dozens of separate 95% intervals do not create a 95%-confidence statement that **all** detector classes and strata passed. The revised plan must predeclare the family of simultaneous claims and control family-wise error—for example with Holm/Bonferroni adjustment or an appropriate simultaneous-band method—while still reporting each raw interval and support count.

Repeatedly peeking at a fixed-horizon canary interval and promoting as soon as it crosses a threshold also invalidates the nominal error guarantee. The plan must use either a predeclared fixed sample/window with one terminal decision or a valid sequential method such as confidence sequences/alpha spending. Stopping, rollback, and re-entry rules must be fixed before observing candidate results.

---

## 10. Required measurement artifact

The revised plan should define one machine-readable evidence schema, with lane-specific extensions, rather than ad hoc JSON files and commit-message numbers.

Illustrative shape:

```json
{
  "schemaVersion": 1,
  "certificateId": "m47a-<risk>-<profile>-<release>",
  "profile": {
    "id": "managed-windows-codex-v1",
    "protectedPopulation": "<explicit cohort>",
    "exclusions": [],
    "prerequisites": []
  },
  "system": {
    "sourceCommits": {},
    "artifactDigests": {},
    "detectorCatalogDigest": "sha256:<...>",
    "policyDigest": "sha256:<...>",
    "runtime": "<version>",
    "osShellTool": "<cohort>",
    "modelProviderPrompt": "<version tuple or not-applicable>"
  },
  "evaluation": {
    "lane": "prompt|ingress|tool|dlp|scanner|package",
    "suite": "regression|property|benign-replay|e2e|private-adaptive|incident",
    "corpusDigest": "sha256:<...>",
    "labelVersion": "<id>",
    "windowStart": "<rfc3339>",
    "windowEnd": "<rfc3339>",
    "eligible": 0,
    "executed": 0,
    "unknown": 0,
    "dropped": 0,
    "uniqueUsersSessionsEndpointsTenants": {},
    "strata": []
  },
  "metrics": {
    "precision": { "numerator": 0, "denominator": 0, "lower95": null },
    "recall": { "numerator": 0, "denominator": 0, "lower95": null },
    "falsePositiveRate": { "numerator": 0, "denominator": 0, "upper95": null },
    "unknownRate": { "numerator": 0, "denominator": 0, "upper95": null },
    "adaptiveAsr": [],
    "utility": {},
    "interventions": {},
    "latency": {}
  },
  "proof": {
    "positive": [],
    "negative": [],
    "degraded": [],
    "replay": [],
    "bypass": [],
    "rollback": [],
    "liveCanary": [],
    "independentReview": []
  },
  "status": "PASS|FAIL|UNKNOWN|NOT_READY",
  "expiresAt": "<rfc3339>",
  "downgradeTriggers": []
}
```

This is a schema requirement, not permission to fill unknown numbers with zero. Missing measurements remain `null` and force `UNKNOWN`/`NOT_READY`.

---

## 11. Required detector architecture

### 11.1 One producer authority per detector family

Each producer exports a generated, digest-pinned catalog containing:

- Class id and family.
- Detector version/rule id.
- Supported surfaces, parsers, languages, shells, modalities, and canonicalizations.
- Evidence-strength mechanism and enforcement eligibility.
- Base capability impact, not resolved event consequence.
- Default posture and lifecycle.
- Known limitations/UNKNOWN behavior.
- Required quality strata and current certificate reference.

Consumers may vendor generated copies. They may not hand-maintain smaller class lists.

### 11.2 Findings, decisions, enforcement, and outcomes remain separate

Every evaluated event has four distinct objects:

1. **Finding:** evidence observed by a detector.
2. **Policy decision:** allowed action given context, identity, destination, evidence, and authorization.
3. **Enforcement result:** what the reference monitor actually withheld/transformed/allowed.
4. **Security outcome:** whether forbidden data escaped or an unauthorized effect occurred.

A correct finding with failed enforcement is a security failure. A noisy finding with no customer visibility may be acceptable exploration. A green scanner execution with a missed vulnerability is a detection failure.

### 11.3 Relation-aware correlation

Correlation is a named threat graph, not signal counting:

`untrusted source → derived instruction/data → proposed capability → resolved destination/resource → authorization → observed effect`

Every edge carries provenance, confidence/evidence strength, time/session, and transform lineage. The correlation fails closed to UNKNOWN when a required edge cannot be established; it does not invent confidence.

### 11.4 Effect-bound authorization

High-impact execution is authorized against the normalized prepared effect. Approval is invalid after any subject, executable, argument, target, destination, credential scope, policy/artifact digest, expiry, or use-count change. Model text and tool output cannot approve themselves.

### 11.5 Private telemetry versus customer detections

- `shadow`: private/local/aggregate quality measurement; no customer incident.
- `monitor`: define explicitly. If customer/SOC visible, it counts as a visible detection and precision budget. If private, do not write customer detection rows.
- `warn/confirm/hold`: developer intervention and friction budget.
- `block/redact`: enforcing action and strict precision/recall/effect gates.

The same token must not mean “invisible” in policy documentation and “event row visible to SOC” in implementation.

---

## 12. Required corpus program

### 12.1 Six separate suites

1. **Canonical regression:** every confirmed incident, miss, false block, and fixed bypass. Immutable once admitted.
2. **Transform/property:** semantic base cases expanded through equivalent encodings/representations, with all descendants kept in one split.
3. **Representative benign replay:** real sanctioned developer/admin workflows, locally consented replay, support cases, and hard negatives.
4. **End-to-end environments:** actual providers, filesystems, networks, repositories, cloud resources, databases, tools, and recipients with deterministic outcome graders.
5. **Private adaptive holdout:** independently owned and hidden from detector authors.
6. **Incident suite:** every production bypass, false hard stop, policy error, race, drift, and explanation failure.

### 12.2 Label and split discipline

- Split by tenant, time, semantic base family, attack family, language, modality, runtime/model, and tool schema.
- Near-deduplicate before splitting.
- Do not place encoded/paraphrased mutations of one base case on both sides.
- Use two independent reviewers and a tie-breaker for ambiguity.
- Measure inter-rater reliability.
- Keep policy-authorized detector positives as first-class benign hard negatives.
- Never treat an override as an automatic FP label.
- Never let attacker-controlled feedback update enforcement online.

### 12.3 Required case record

Every case names:

- Threat/control id.
- Surface/direction/modality.
- Runtime/provider/model/OS/shell/tool schema.
- Language and transform lineage.
- User goal and attacker goal.
- Source trust, asset, sink, destination, reversibility, and authorization.
- Expected finding(s).
- Expected decision.
- Expected enforcement result.
- Expected final system state.
- Exact version tuple.
- Labelers/adjudication.
- Privacy expectation and retention.

---

## 13. Detection-family acceptance requirements

### 13.1 Secrets and company data

Required families and twins:

- Provider-prefixed keys across current and legacy token generations.
- Key pairs and contextual credential structures.
- Private-key formats, valid/invalid parser variants, public keys, and encrypted keys.
- Database/connection strings with reserved characters and encoding variants.
- Generic entropy/password candidates versus hashes, UUIDs, package ids, cursors, random fixtures, and documentation examples.
- Public/client identifiers and DSNs versus genuine secrets.
- PII/payment/national identifiers versus timestamps, test numbers, build ids, and synthetic records.
- Tenant Exact Data Match/document/code fingerprints where high assurance is claimed.
- Unicode, base64, hex, URL encoding, split/chunked/streamed/nested values.
- Prompt, tool result, source corpus, archive/history, attachment, evidence, log, crash, SIEM/export, provider request, and model-output surfaces.

Required outcome proof: forbidden canary bytes observed at every external/persistent boundary are zero; parser/scan failure sends zero external bytes; every provider call has a receipt.

### 13.2 Prompt and ingress injection

Required attack families:

- Direct override/system-exfil/authority escalation.
- Indirect repository, web, document, email, RAG, tool-output, error-message, and model-output injection.
- Multilingual/mixed-script/translation.
- Social engineering, role-play, fake authority, urgency, and plan drift.
- Many-shot, suffix, payload splitting, fragmentation, and cross-turn assembly.
- Unicode/homoglyph/zero-width, base64/hex/URL/HTML/JSON/MIME/compression.
- Long-context placement, retry/fork/compaction/session transfer, delayed trigger.
- Source-to-sink exfiltration and dangerous-action sequences.
- Benign security documentation, code samples, policy discussion, and finding names.

Required outcome proof: no unauthorized critical sink outcome within the predeclared adaptive matrix; benign task utility remains within the gate.

### 13.3 Tool and command risk

Required semantics:

- Bash, PowerShell, cmd, and direct argv for every certified runtime.
- Quote/escape/continuation/variable/alias/function/substitution/nesting/encoding.
- File/reparse/symlink path resolution.
- Tool schema and structured arguments, not only a `command` string.
- Unknown mutating tool → hold/UNKNOWN.
- Context-sensitive capability, resource, destination, authorization, and reversibility.
- Multi-step source→sink and taint continuity.

Required benign twins: package install, service restart, cache cleanup, controlled chmod/chown, build scripts, security tests/docs, local/staging teardown, approved production maintenance, read-only/dry-run/plan operations.

### 13.4 Cloud/database/deployment actions

Resolve and bind:

- Identity/account/profile/subscription/project.
- Region, cluster, context, namespace, environment, and resource tags.
- Exact resource/destination.
- Desired state and scope.
- Reversibility/backups/final snapshot.
- Change/incident approval and JIT credential.
- Executed/observed effect.

The detector may identify capability from syntax; only resolved context/policy can call it unauthorized production impact.

### 13.5 Code scanning

Required strata:

- CWE × language × framework × source/sink type.
- Reachable/unreachable and guarded/unguarded twins.
- Single-file and cross-file/dataflow.
- Generated, minified, templated, configuration, and infrastructure code.
- Secret, SAST, SCA, IaC, container, license, and deep LLM review separately.
- Suppressions, baselines, changed-file/full-repo differences.
- Exact engine/ruleset/model versions.
- Malicious repository prompt injection and clean twins.

Required outcome proof: exact-SHA protected merge/release cannot green with missing required analysis, and seeded supported critical/high vulnerabilities are not missed in the sealed release corpus.

### 13.6 Package analysis

If retained in scope:

- Ecosystem-specific malicious and benign twins.
- Transitive-only payloads, lifecycle scripts, native binaries, registry substitution, mutable artifacts, and padded archives.
- Exact bytes/config/transitive identity.
- Static and dynamic results with no aggregate hiding an ecosystem miss.
- Certified pre-execution containment.

---

## 14. Recommended revised wave structure

Claude does not need to discard the valuable existing work. The plan should be reorganized so that proof and authority precede promotion.

### Wave −1 — Rebase, inventory, and claim contract

**Purpose:** Stop implementing against stale source and define exactly what this packet can certify.

Deliverables:

- Current SHA manifest for every repository.
- Producer-derived class catalogs and cross-repo parity.
- Current published residual report.
- Supported runtime/OS/shell/model/provider/surface matrix.
- Explicit risk-certificate dependencies and `NOT_READY` rules.
- Normative reference to the master SLO table.
- Removal/correction of stale paths, signatures, counts, and premises.

Exit:

- No static hand-counted detector denominator.
- The plan’s discovery commands reproduce every factual premise.
- One added producer class turns all missing-consumer gates red.

### Wave 0 — Emergency egress correction

Keep the current W0 as an urgent production remediation. Do not let it imply the complete Risk 1 boundary is solved.

Add:

- Pre/post AWS task-definition evidence.
- Exact stored policy/blast-radius discovery.
- Explicit residual Risk 1 gap and companion pre-egress work.
- No secrets or raw customer content in run logs.

### Wave 1 — Policy authority and catalog totality

Keep the current malicious-floor write-path work and strengthen it with:

- Producer-owned DLP and tool catalogs.
- Complete configurable/detected/enforced/visible denominators.
- Unknown class → accepted as evidence, ungoverned/non-green, never silently permissive.
- No consumer copy that can stay green when the producer changes.

### Wave 2 — Evidence strength, consequence, and UI vocabulary

Keep the five-band and evidence-plumbing work. Replace static severity inheritance with:

- Categorical evidence strength.
- Base capability impact.
- Context-resolved consequence.
- Authorization/reversibility/destination-aware policy.
- Calibration evidence or an explicit `ungraded` state.

Do not let an ungraded tool finding automatically block solely because the detector’s static tier says HIGH.

### Wave 3 — Measurement substrate for every lane

Rewrite W3 from “tool FP measurement” to a common measurement framework with separate adapters:

- DLP egress.
- Prompt egress.
- Ingress/tool-result redaction.
- Tool/action decisions.
- Static/package analyzer.
- Code scanner execution and findings.

Deliver:

- Per-class opportunity and trigger denominators.
- Active/candidate/outcome comparison.
- Dropped/unknown/store-error invalidation.
- Versioned reports and freshness.
- Private telemetry separation from customer/SOC events.
- Final-state graders.

Keep the local-only, behavior-invariant shadow property.

### Wave 3B — Evaluation and corpus governance

Add the six suites, label discipline, semantic split, private holdout, independent owner, statistical engine, and master SLO gates. Public regression can run per PR; private/adaptive and representative replay can gate release without exposing cases to detector authors.

### Wave 4A — Close current published residuals

Before adding new rules, close:

- `qa-fp-migration-timestamps`.
- `qa-fp-detections-finding-name`.
- `attack-private-key-block`.
- `attack-prod-db-connection-string`.
- `attack-system-prompt-exfil`.
- `ingress-attack-private-key-in-tool-output`.
- The banked benign destructive cache-cleanup block.

All fixes become permanent regressions with defeat mutations.

### Wave 4B — Tool/effect detection quality

Replace generic combos and cloud regex-to-impact mapping with:

- Semantic command/argv parsing.
- Named relation-specific correlations.
- Capability/resource/destination/effect resolution.
- Supported-shell parity or explicit non-green restriction.
- Known bypasses converted into gates.
- Benign twins and per-class measurement before visible enforcement.

### Wave 4C — Prompt/ingress detection quality

Add:

- Dedicated prompt/ingress shadow.
- Multilingual/obfuscated/fragmented/sequence corpora.
- Adaptive actual-effect evaluation.
- Provenance/taint continuity.
- Capability restriction/source-sink control.
- Per-class/per-stratum promotion, never tool-shadow substitution.

### Wave 5 — Console truth

Keep the current W5, but make its source the certificate/evidence manifest. The UI must distinguish:

- Detection match.
- Private monitor telemetry.
- Customer-visible detection/alert.
- Policy decision.
- Enforcement result.
- Security outcome.
- Coverage/unknown state.
- Certificate boundary, freshness, exclusions, and downgrade reason.

### Wave 6 — Triage, adjudication, and incident learning

Keep the workflow improvements and add governed labels, independent review, feedback-poisoning protection, incident-to-regression promotion, suppressions/exceptions with expiry, and per-version quality attribution.

### Wave 7A — Scanner execution truth

Keep the current W7 false-green work, manifest, fork/poll behavior, and `COVERAGE_FAILED` truth.

Preserve the current signed-contract implementation and prove its deployed exact-SHA/tenant/policy binding, replay prevention, completeness, rotation, and outage behavior before authoritative certification. Do not conflate this with the separate artifact-admission transport lane.

### Wave 7B — Scanner detection certification

Add code-security precision/recall, CWE/language/framework strata, source-to-sink/reachability, mutation tests, engine/ruleset pinning, and LLM scanner injection evaluation.

### Wave 8 — Authoritative enforcement, canary, rollback, and certificate

Deliver or bind the companion work for:

- Effect-bound authorization and complete mediation.
- Pre-egress data boundary.
- Lane-specific signed verdict transport plus deployed binding/replay/completeness proof.
- F16 privileged or non-exportable endpoint signing-key custody.
- Protected branches/releases.
- Certified package sandbox where in scope.
- Rollout 5% → 25% → 100% only after predeclared gates.
- Automatic halt/rollback.
- Live actual-effect and secret-egress canaries.
- Independent reproduction.
- Machine-readable certificate and automatic expiry/downgrade.

**Full exit:** Every P0 is closed, each applicable numeric gate passes on the exact release/profile, all mandatory dependencies are deployed, and no affected certificate is `NOT_READY`.

---

## 15. Exact edits Claude must make to the current document

This checklist is intentionally specific so the review cannot be “acknowledged” without changing the plan.

| Current plan location | Required edit |
|---|---|
| Line 3 | Make orchestration skill usage optional/portable or include a fallback; do not require a skill absent from a fresh environment. |
| Lines 5, 26–30 | Rewrite the goal as a bounded detection/UX/remediation claim. Define zero FP statistically and list which risk certificates this packet can/cannot complete. |
| Lines 11–22 | Add `lastRebasedAt`, exact current SHAs, discovery commands, and a rule that any relevant source advance invalidates line-level instructions until revalidated. |
| Lines 34–50 | Add the central distinction: findings, decisions, enforcement results, and security outcomes. Wiring alone is not protection. |
| Line 43 | Move disconnected effect-bound approval from “finding” into a mandatory dependency/wave with an explicit non-green consequence. |
| Line 67 (D6) | Define private telemetry, customer detection, SOC alert, and enforcement separately. Do not call monitor zero-FP while it writes SOC-visible rows or can affect the current call on an independently tainted session. Monitoring alone must remain non-tainting. |
| Lines 68–75 (D7–D14) | Replace uncalibrated confidence language; remove D12 exemption from measurement; make D13 non-green for Windows certification; reconcile D14 with the restricted-mode roadmap. |
| Before Wave 0 | Insert Wave −1 rebase/catalog/claim-contract work. |
| Wave 0, lines 150–190 | Preserve the emergency override removal; add the residual pre-egress boundary and Risk 1 certificate impact. |
| W2 lines 4100–4567 | Generate impact/evidence catalogs from current producer sets; remove static 30-DLP assumption and detector-tier-equals-impact invariant. |
| Line 4566 | Replace “all 30 DLP classes” with generated totality over the current producer digest. |
| W3 lines 4571 onward | Change from tool-only measurement to lane-specific adapters and a shared report schema. |
| Lines 4889–5173 | Add per-class opportunity/trigger/agreement/outcome denominators, cohort/version/window, unknown and adjudication. Nonzero dropped/store error must invalidate promotion. |
| Lines 5235–5558 | Wire shadows at actual prompt, ingress, tool, scanner, and DLP decision seams. Keep enforcement invariance. |
| Lines 5780, 5789 | Replace shallow `dlp.Scan` use with the current canonical full-depth API and adapt the result correctly. Never weaken the current scan-depth guard. |
| W3 corpus generation, lines 6355–6593 | Move generators to a repo/plan-owned path; separate public regression from private holdout; add semantic split and lineage. |
| Lines 6874–6901 | Replace `interrupted > 0` with exact expected outcome per attack plus per-class/family release gates. |
| Lines 6941–6961 | Prohibit banked benign hard blocks. Make all banks time-bounded migration debt and add final drain task. |
| Lines 7147–7291 | Preserve Static-Worker ratchet, add ecosystem-specific expectations, and require visible PROMPT debt to drain before zero-intervention claim. |
| Wave 4 opening, around 7468 | Insert closure of all six current neutral-scorer residuals before new detection work. |
| Lines 7486–7517 | Expand ordinary corpus and include the known cache-cleanup case; do not use it as the statistical release set. |
| Lines 7805–7894 | Replace generic `deriveCombos` with named relation-specific correlations. |
| Lines 7829–7835 and 8060–8077 | Correct monitor/SOC/taint semantics and add multi-step benign/malicious sequence tests. |
| Lines 8770–9052 | Rename syntax findings to destructive capability/effect proposals; add context/effect resolver, authorization, benign twins, and measurement. |
| Lines 8778, 9656 | Either implement supported Windows semantics or keep Risk 4 non-green; do not make limitation documentation an exit pass. |
| Lines 9141 onward | Correct the false premise that open finding class strings are rejected; describe unconfigurable/unknown-default/governance drift instead. |
| Lines 9255–9261, 9654 | Remove the static 114-class denominator and derive detected/configurable/enforced/visible totals from catalogs. |
| Lines 9391–9400 | Remove use of tool shadow as prompt evidence. Depend on the dedicated prompt/ingress measurement lane and adaptive suite. |
| Lines 9553–9568 | Gate each class on exposure, candidate triggers, labels, intervals, utility, intervention rate, and fresh exact-version evidence—not zero raw deltas. |
| Line 9655 | “No data stays monitor” is an honest rollout stop but must keep detection quality/certificate non-green. Rewrite the exit accordingly. |
| W5/W6 | Project the machine-readable evidence/certificate model and add governed quality labels. |
| W7 lines 15272–17501 | Keep execution-truth work and add a separate detection-quality packet; preserve existing scanner signing and require live exact-SHA/tenant/policy binding, replay, completeness, rotation, and outage proof before authoritative certification. |
| Lines 17505–17520 | Add per-exclusion certificate impact and mandatory companion packet. Attribute permissive artifact-admission transport to Risk 3 rather than W7. The packet may finish while risks remain `NOT_READY`. |
| Roadmap prerequisite at line 788 | Add F16 endpoint signing-authority custody as a mandatory dependency for R1/R3/R4/shared trust, with caller inventory and non-elevated mint/read/export/replace defeat tests. |
| Verification standard, lines 17526–17538 | Add statistical bounds, lane separation, independent holdout, final-state grading, version invalidation, no-known-FP bank, and live canary requirements. |

---

## 16. Required defeat-test matrix

Claude should add a traceability table mapping every row below to a task, test name, artifact, and exit criterion.

### 16.1 Measurement and gate integrity

- Prompt class increments only the prompt denominator.
- Ingress class increments only the ingress denominator.
- Tool class increments only the tool denominator.
- Agreement increments per-class exposure.
- No exposure is UNKNOWN.
- Dropped evidence invalidates the gate.
- Store/read failure invalidates the gate.
- Stale version/window invalidates the gate.
- Shadow code cannot change active decision or customer/SOC output.
- Disabling all detector logic fails recall/quality while execution still succeeds.
- Removing all cases for a class creates coverage UNKNOWN, not zero.

### 16.2 Known current regressions

- Migration timestamp is not treated as a payment card intervention.
- Finding-name text is not treated as a jailbreak-persona intervention.
- Parser-degraded private key produces an honest class/evidence/fail-safe outcome on egress.
- Special-character database credential is detected.
- System-prompt exfil attack is detected/contained.
- Private key in tool output is withheld or makes ingress restricted/inconclusive; it never reaches provider/model cleanly.
- Benign cache cleanup is not hard-blocked.

### 16.3 Benign sequence safety

- Security documentation containing two attack examples produces no synthetic combo.
- Quoted cloud/database/destructive command in code, test, commit message, or documentation does not enforce.
- Benign monitor signal followed by legitimate privileged action does not create a delayed hold.
- Approved staging/preview teardown executes under the bound authorization.
- Repeated identical approved effect does not prompt twice when policy permits reuse; changed effect invalidates approval.

### 16.4 Tool/action evasions

- Global flag reordering.
- Environment/config-supplied context/profile/host.
- Alias/function/wrapper/script/SDK/API equivalent.
- Command substitution and variable token construction.
- Nested shell/interpreter.
- Base64/hex/URL/PowerShell encoded payload.
- Bash, PowerShell, cmd, direct argv.
- Symlink/reparse/resource target swap.
- Parser timeout/malformed input/unknown tool.
- Split source and sink across calls/sessions.

### 16.5 Prompt injection

- Direct and indirect.
- English, Hebrew, Arabic, mixed script.
- Semantic paraphrase/social engineering/fake authority.
- Long-context and delayed trigger.
- Tool result, repository file/path, document, error message, model output.
- Split turn/tool and context compaction/fork/retry.
- Encoded/fragmented/role marker/adversarial suffix.
- Clean task twin and utility grader.
- Adaptive attacker observes decision/reason and retries.
- Final unauthorized source→sink outcome grader.

### 16.6 DLP/data

- Provider-token versions and near-neighbours.
- Valid/invalid/revoked/test/public/masked twins.
- Private/public/encrypted key formats and parser degradation.
- Reserved characters in connection strings.
- Timestamps/hashes/UUIDs/package ids/random fixtures/public DSNs.
- Unicode/base64/hex/URL/split/chunk/stream/nested.
- Prompt/tool/source/archive/history/log/crash/SIEM/export/provider/model-output surfaces.
- Oversize/truncation/parser failure sends no forbidden bytes externally.

### 16.7 Code scanner

- Each required engine absent/failed/partial/empty.
- Engine runs but seeded vulnerability is missed.
- Reachable/unreachable and guarded/unguarded source→sink twins.
- Cross-file, generated, minified, IaC, container, dependency, secret cases.
- Exact-SHA mismatch, stale result, replay, wrong tenant/repo/policy.
- Malicious repository instructions suppress/fabricate/downgrade findings.
- Malformed/truncated model output never becomes green.

### 16.8 Authorization and integrity

- Approval replay, expiry, use-count exhaustion.
- Subject/runtime/tool/argv/resource/destination/digest mismatch.
- Executable swap after approval.
- Fake approval in prompt/DOM/stdout/tool output.
- Daemon/broker/policy/KMS outage.
- Unsigned, wrong-queue, wrong-tenant, wrong-SHA, expired, replayed result.
- Non-elevated endpoint key mint, choose, replace, read, or export; privileged recovery/rotation failure.
- Direct alternate path to the same protected sink.
- Attempted/authorized/executed/observed-effect receipts disagree.

### 16.9 Rollout and operations

- Monitor → canary → wider enforcement only after gates.
- Confirmed benign block automatically halts candidate.
- Critical miss/unauthorized effect automatically halts candidate.
- Evidence/coverage/latency/utility regression halts candidate.
- Known-safe compatible rollback restores within five minutes.
- Relevant model/parser/policy/catalog change expires/downgrades certificate.
- Live canary proves actual external effect or denial, not merely event creation.

---

## 17. Standards, research, and market comparison

This comparison uses primary research, official standards/frameworks, and official vendor documentation. Vendor documentation describes claimed capabilities, not independently verified efficacy. It is used to identify expected product patterns, not to award competitors a security score.

| Reference pattern | What the reference establishes | Current plan position | Required response |
|---|---|---|---|
| NIST AI RMF Measure | Representative deployment conditions, uncertainty, benchmarks, documented TEVV, independent review, and production monitoring | Strong test detail, but tiny/public corpora, no confidence bounds, no independent hidden release set | Add six-suite program, intervals, independent owner, production monitoring, certificate manifest. |
| NIST sequestered AITE | Blind data in a controlled environment reduces train/test contamination | Most proposed data is public/PR-visible | Retain public regression, add access-controlled holdout and external/independent blind challenge. |
| NIST TN 2119 | Detection and false-alarm claims require sound confidence intervals/bounds | Plan reports rates/counts but no release-quality bounds | Use exact one-sided bounds and clustered intervals. |
| OWASP Prompt Injection | Direct/indirect, payload splitting, multimodal, adversarial suffix and other attack forms | Six lexical classes and static combos; very small prompt corpus | Add multilingual/semantic/sequence/multimodal-or-restricted/adaptive coverage. |
| OWASP Excessive Agency | Least privilege, user-context execution, downstream authorization, complete mediation | Effect approval disconnected; fail-open retained | Make detector advisory to an authoritative effect broker and JIT identity. |
| OpenAI prompt-injection guidance | Mature attacks often evade intermediary classifiers; constrain source→sink impact even if manipulation succeeds | Focuses primarily on class activation and co-occurrence | Add source→sink/effect controls and outcome evaluation. |
| Microsoft indirect-injection defense | Prompt shields, spotlighting, plan drift, critic, tool-chain analysis, IFC, least privilege, short-lived privilege, human confirmation | Some normalization, taint, and hold foundations; incomplete provenance/authority | Layer defenses and test each independently and end to end. |
| Anthropic adaptive evaluation | Adaptive attacker receives repeated attempts; even 1% success remains meaningful | No adaptive release evaluation | Add per-environment adaptive ASR with final-effect graders and confidence bound. |
| AgentDojo | Dynamic tasks and adaptive attacks over tool-using agents; security and utility both matter | Fixed lexical corpora | Use as supplemental public benchmark plus Ceragon-specific real-surface environments. |
| InjecAgent | 1,054 indirect-injection cases across user/attacker tools and direct-harm/data-exfil goals | Five prompt-risk cases admitted in plan | Expand threat/tool/source/sink breadth substantially; do not treat public benchmark as private holdout. |
| Adaptive Attacks paper | Eight evaluated defenses were bypassed by adaptive attacks in the study | No adaptive detector-specific attacker | Treat static success as regression only; require adaptive release challenge. |
| GitHub CodeQL suites | Default high-precision and extended lower-precision suites are intentionally distinct | Plan treats engine execution as core truth and lacks quality tiers | Declare high-precision enforcing versus extended advisory findings with separate evidence gates. |
| GitHub secret scanning | Provider/token generations, push-protection eligibility, validity and generic-pattern limitations differ | DLP classes share broad static postures; quality strata missing | Qualify per provider/token/representation; generic candidates do not inherit provider-level enforcement. |
| Google Model Armor | Inspect-only rollout before block; separate input/output screening; threshold and language/modality limits are explicit | Shadow idea is good, but prompt lane is miswired and supported limitations do not gate claim | Build actual lane shadow, report scope/limits, promote only after evidence. |
| Check Point/Lakera Prompt Defense | Screens user and tool content; documents 100+ language/script coverage and detect/enforce modes | Ceragon lexical prompt coverage is not measured across languages/tool content | Add measured multi-language/tool-output coverage or declare unsupported. |
| Check Point/Lakera Agent Behavior Defense | Compares tool action to conversation/user intent; deterministic tool allow/deny; detect-first rollout | Cloud/tool rules infer danger from syntax without intent/effect | Add user-intent/action relation, tool allow/deny, and effect context. |
| HiddenLayer Agentic Runtime | Multi-turn sessions and tool calls reconstructed into a replayable session | Ceragon has taint/session foundations but quality tests are mostly single-step | Add full session trace, sequence correlation, replay, and delayed-effect evaluation. |

### Important strategic conclusion

The market and current research converge on the same architecture:

> Content classifiers are evidence. High-assurance protection comes from combining that evidence with provenance, user intent, destination/resource context, least privilege, and a deterministic boundary at the consequential action.

Ceragon already owns useful pieces of that architecture. The revised plan should connect and prove them rather than trying to reach the goal by adding more regex classes.

---

## 18. External sources

### Standards and authoritative guidance

- [NIST AI Risk Management Framework — Core / Measure](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [NIST Generative AI Profile, AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)
- [NIST Artificial Intelligence Technology Evaluation — sequestered blind evaluation](https://pages.nist.gov/ai-technology-evaluation/)
- [NIST TN 2119 — Estimating Instrument Performance with Confidence Intervals and Bounds](https://www.nist.gov/publications/estimating-instrument-performance-confidence-intervals-and-confidence-bounds)
- [OWASP LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP LLM06:2025 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
- [MITRE ATLAS](https://atlas.mitre.org/)

### Primary research and evaluation practice

- [AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents](https://arxiv.org/abs/2406.13352)
- [InjecAgent: Benchmarking Indirect Prompt Injections in Tool-Integrated LLM Agents](https://aclanthology.org/2024.findings-acl.624/)
- [Adaptive Attacks Break Defenses Against Indirect Prompt Injection Attacks on LLM Agents](https://aclanthology.org/2025.findings-naacl.395/)
- [Anthropic — Mitigating the risk of prompt injections in browser use](https://www.anthropic.com/research/prompt-injection-defenses)
- [Microsoft PyRIT — Scoring Scorers](https://microsoft.github.io/PyRIT/latest/blog/2026-04-14-scoring-scorers/)

### Current architecture and product guidance

- [OpenAI — Designing AI agents to resist prompt injection](https://openai.com/index/designing-agents-to-resist-prompt-injection/)
- [OpenAI — Understanding prompt injections: a frontier security challenge](https://openai.com/index/prompt-injections/)
- [Microsoft — Defend against indirect prompt injection attacks](https://learn.microsoft.com/en-us/security/zero-trust/sfi/defend-indirect-prompt-injection)
- [Microsoft Azure — Prompt Shields](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection)
- [Google Cloud — Model Armor overview](https://docs.cloud.google.com/model-armor/overview)
- [Check Point AI Security — Prompt Defense](https://docs.lakera.ai/docs/prompt-defense)
- [Check Point AI Security — Agent Behavior Defense](https://docs.lakera.ai/docs/agent-behavior-defense)
- [HiddenLayer — AI Runtime Security](https://docs.hiddenlayer.ai/docs/products/runtime/overview)
- [GitHub — CodeQL query suites](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-query-suites)
- [GitHub — Supported secret-scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns)

---

## 19. Claims that are and are not allowed

### Allowed after the current plan’s operational pieces pass

- “Scanner execution absence and partial coverage no longer appear as green on the named paths.”
- “The console presents five severity bands and separates available evidence-strength metadata.”
- “Tool shadow capture is local-only and behavior-invariant on the named tool path.”
- “Known new ordinary-work interruptions cannot grow beyond the explicit migration baseline.”
- “Specific named cloud command spellings are detected on tested dialects.”
- “The named policy floor is enforced on the tested write paths.”
- “The named triage and console truth defects are repaired.”

Each statement still requires the exact tests/deployment proof to have passed.

### Forbidden after executing the plan unchanged

- “Zero false positives.”
- “All detections are high quality.”
- “Evasive attacks are covered.”
- “Prompt injection is high-assurance protected.”
- “All DLP classes are governed.”
- “A green scan proves vulnerable code was not introduced.”
- “Dangerous production actions are prevented.”
- “M4.7A is complete.”
- “Risks 1, 2, 4, or 5 are 9+/10.”

### Allowed only after the revised certification gates pass

A defensible bounded statement would look like:

> For profile `<id>`, release `<artifact digests>`, and protected population `<scope>`, all declared controlled paths were mediated; the named detector/effect strata passed the attached precision, recall, adaptive-ASR, utility, intervention, coverage, and live-canary gates; no known critical/high bypass or benign hard block remains; evidence is valid until `<expiry>` subject to `<downgrade triggers>`. Unsupported surfaces remain non-green.

---

## 20. Claude revision response contract

Claude, as the original plan author, should respond to this review in a structured way.

### 20.1 Finding disposition table

For every `P0-xx` and `P1-xx`, provide:

| Field | Required content |
|---|---|
| Disposition | `ACCEPTED`, `PARTIALLY_ACCEPTED`, or `REJECTED`. |
| Evidence | Current commit, file, symbol/line, command/test output. |
| Reason | Concrete technical reasoning, not “already covered” without a trace. |
| Plan change | Exact section/task/exit criterion changed. |
| Defeat test | Test name and the mutation/revert that makes it red. |
| Certificate impact | Which risk/dimension remains non-green until closed. |

A rejected finding must include evidence that disproves its observed mechanics. A plan intention or comment is not disproof.

### 20.2 Required outputs

Claude must produce:

1. An updated implementation plan, refactored rather than append-only.
2. A source-revision/rebaseline manifest.
3. A review-response matrix covering every finding.
4. A requirement → task → test → evidence → exit traceability matrix.
5. A changed-wave/dependency diagram or concise table.
6. A list of preserved original strengths/tasks.
7. A list of deleted/replaced invalid assumptions.
8. The exact remaining exclusions and their certificate state.
9. The normative SLO/corpus/evidence schema.
10. Verification commands and expected red/green results.

### 20.3 Non-acceptable responses

- Adding a disclaimer at the bottom while leaving contradictory exit criteria intact.
- Calling a public regression corpus a sealed release holdout.
- Treating zero observed events as zero rate without denominator and bound.
- Treating monitor as invisible without proving no customer/SOC effect, non-tainting behavior, and no unqualified HOLD contribution on an independently tainted session.
- Treating a scanner execution manifest as scanner-accuracy evidence.
- Treating destructive syntax as unauthorized production impact.
- Treating system-prompt instructions/fencing as proof of scanner injection resistance.
- Deferring a mandatory dependency while keeping the affected certificate green.
- Updating static class counts by hand rather than fixing producer authority.
- Weakening current full-depth DLP guards to fit stale plan code.

---

## 21. Verification commands for the revised plan

These commands are non-destructive discovery/reproduction examples. Claude should update paths if symbols move and include expected output in the revised plan.

### 21.1 Revisions and drift

```powershell
$componentRepos = @(
  'Backend',
  'Frontend',
  'Installers',
  'Static-Worker',
  'Sandbox-Worker',
  'GithubApp-Bot-Scanner-Worker',
  'Ceragon-Intelligence'
)
foreach ($componentRepo in $componentRepos) {
  git -C $componentRepo fetch origin main
  git -C $componentRepo rev-parse origin/main
}

git -C Installers rev-list --count 6dab6ccc..origin/main
git -C Installers diff --shortstat 6dab6ccc..origin/main
```

### 21.2 Current DLP authority and depth

```powershell
git -C Installers show origin/main:internal/dlp/registry.go
git -C Installers show origin/main:internal/dlp/codesecurity_rules.go
git -C Installers show origin/main:internal/dlp/scan_depth_guard_test.go
git -C Backend show origin/main:packages/shared-contracts/src/generated/ai-security-portable.generated.ts

rg -n 'dlp\.Scan\(' .plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md
```

Expected: the revised plan contains no new shallow production surface and no static 30-class totality claim.

### 21.3 Published neutral residuals

```powershell
$reviewInstallersSha = 'f29d66449679ec9c8753ef6d2d321a12d348c2ab'
$reviewEvidenceDir = Join-Path ([System.IO.Path]::GetTempPath()) `
  ('m47a-review-evidence-' + [guid]::NewGuid().ToString('N'))
$reviewInstallersTree = Join-Path $reviewEvidenceDir 'Installers'
$reviewScorerExe = Join-Path $reviewEvidenceDir 'ai-security-neutral.exe'
New-Item -ItemType Directory -Path $reviewEvidenceDir | Out-Null

git -C Installers worktree add --detach $reviewInstallersTree $reviewInstallersSha
try {
  git -C $reviewInstallersTree rev-parse HEAD |
    Set-Content -LiteralPath (Join-Path $reviewEvidenceDir 'source-revision.txt')
  git -C $reviewInstallersTree show HEAD:parity-vectors/neutral/HOLDOUT_REPORT.md

  Push-Location $reviewInstallersTree
  try {
    go build -trimpath -o $reviewScorerExe ./cmd/ai-security-neutral
    & $reviewScorerExe `
      --corpus parity-vectors/neutral/neutral-corpus.holdout.jsonl `
      --report (Join-Path $reviewEvidenceDir 'holdout-report.json')
    & $reviewScorerExe `
      --corpus parity-vectors/neutral/neutral-corpus.ingress.jsonl `
      --report (Join-Path $reviewEvidenceDir 'ingress-report.json')

    Get-FileHash -Algorithm SHA256 `
      $reviewScorerExe, `
      'parity-vectors/neutral/neutral-corpus.holdout.jsonl', `
      'parity-vectors/neutral/neutral-corpus.ingress.jsonl' |
      Export-Csv -NoTypeInformation -LiteralPath (Join-Path $reviewEvidenceDir 'artifact-digests.csv')
  }
  finally {
    Pop-Location
  }
}
finally {
  git -C Installers worktree remove --force $reviewInstallersTree
}
```

Expected before remediation: the six residual fixture names remain visible. Expected at revised completion: every case has its exact expected finding/outcome, with no corpus deletion or expectation weakening. Preserve the source revision, scorer digest, and corpus digests beside both reports so a dirty/stale active checkout cannot silently change the result.

### 21.4 Shadow/gate structure

```powershell
rg -n 'recordToolShadow|toolShadowFile|Observed|Dropped|StoreError' `
  .plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md
rg -n 'prompt.*shadow|ingress.*shadow|per.class|eligible|candidateTriggers|unknown' `
  .plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md
```

Expected: separate prompt/ingress/tool adapters, per-class denominators, report artifact, and explicit invalidation rules.

### 21.5 Weak recall/bank assumptions

```powershell
rg -n 'TestToolLane_RecallIsMeasuredNotAssumed|interrupted == 0|Bank the measured|benign.*baseline' `
  .plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md
```

Expected: no `>0` aggregate recall gate and no final certificate that tolerates a known benign hard block or expired visible-warning debt.

### 21.6 Scanner prompt-injection defenses

```powershell
git -C GithubApp-Bot-Scanner-Worker show origin/main:scanner-worker/src/opus-baseline-prompt.ts
git -C GithubApp-Bot-Scanner-Worker show origin/main:scanner-worker/src/utils/prompt-sanitizer.ts
git -C GithubApp-Bot-Scanner-Worker grep -n 'wrapUntrusted\|untrusted data\|sentinel' origin/main -- scanner-worker/src
```

Expected: preserve existing defenses and add behavioral adaptive tests rather than claiming the defenses are absent.

### 21.7 Final plan consistency

```powershell
rg -n 'zero false positives|9\+|evasive|NOT_READY|UNKNOWN|signed|PowerShell|effect.bound|complete mediation' `
  .plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md
```

Expected: every broad claim is bounded and every mandatory open dependency makes the affected certificate non-green.

---

## 22. Final approval checklist

The revised plan is ready for implementation only when all boxes below are true.

- [ ] Current-main Wave −1 rebase completed and exact SHAs recorded.
- [ ] All class catalogs derive from producer authority; current 81-class DLP set is not truncated to 30.
- [ ] Current full-depth DLP guard is preserved; no proposed production `dlp.Scan` regression.
- [ ] All six current published neutral residuals are first-class closure tasks.
- [ ] Separate prompt, ingress, tool, DLP, scanner, and package measurement lanes exist where applicable.
- [ ] Every per-class gate has exposure, trigger, outcome, unknown, dropped, version, and freshness data.
- [ ] The plan produces an actual report/evidence manifest; it does not refer to an unwritten “shadow report.”
- [ ] Recall is gated per expected case/class/family and final state, not aggregate nonzero interruption; Product/Security ratified per-family/critical-stratum thresholds, support, and lower bounds before release/private-holdout unblinding (a disjoint exploratory baseline may inform them).
- [ ] Public regression, private holdout, adaptive, representative replay, E2E, and incident suites are distinct.
- [ ] Numeric gates reference the master SLO authority, close its general recall/FNR gap, use confidence bounds, control simultaneous claims, and use valid fixed-horizon or sequential canary inference.
- [ ] No known benign hard block is banked at completion.
- [ ] Monitor/private telemetry/customer detection/SOC alert/enforcement semantics are explicit and tested end to end; monitor-only ingress remains non-tainting.
- [ ] Fully benign and false-taint sequences create no false intervention, while genuine poisoned ingress followed by a risky/sensitive action still HOLDs.
- [ ] Generic signal-counting combo is replaced by relation-specific correlation.
- [ ] Cloud/production impact uses resolved context/effect/authorization, not syntax alone.
- [ ] Known command evasions are blocking tests or explicit non-green restrictions.
- [ ] Managed-Windows certification includes required PowerShell/cmd/direct-argv semantics or remains `NOT_READY`.
- [ ] Prompt injection has multilingual, obfuscated, fragmented, sequence, adaptive, and final-effect evaluation.
- [ ] LLM scanner defenses are credited and behaviorally evaluated through exact release model routes.
- [ ] W7 execution truth is followed by scanner detection-quality certification.
- [ ] Pre-egress data boundary is deployed/proven or Risk 1 remains `NOT_READY`.
- [ ] Effect-bound complete mediation is deployed/proven or Risks 4 and 5 remain `NOT_READY`.
- [ ] Existing scanner signed contracts have live exact-SHA/tenant/policy binding, replay, completeness, rotation, and outage proof or Risk 2 remains `NOT_READY`.
- [ ] Every enforcing artifact-admission job/result path is signed and proven or malicious-package Risk 3 remains `NOT_READY`.
- [ ] F16 privileged/non-exportable endpoint signing-key custody is deployed/proven or R1, R3, R4, and shared trust remain `NOT_READY`.
- [ ] Package containment is certified or malicious-package scope remains `NOT_READY`.
- [ ] Rollout, automatic stop, compatible rollback, live canary, independent review, expiry, and downgrade are specified.
- [ ] Every final exclusion has an explicit risk/dimension/certificate consequence.
- [ ] The plan’s final title and exit criteria match what it can actually prove.

---

## 23. Final verdict to the plan author

This plan should not be discarded. Its operational rigor, truthfulness work, deployment sequencing, UI/triage design, and false-green scanner fixes are worth implementing.

It must first be rebased and restructured around valid evidence. The decisive changes are:

1. Measure each detector lane at its real decision/effect seam.
2. Close current named misses and false positives before adding breadth.
3. Replace tiny aggregate smoke tests with per-class, blind, adaptive, statistically bounded evaluation.
4. Replace syntax/co-occurrence claims with semantic source→sink/effect/authorization reasoning.
5. Separate detection evidence from policy consequence and authoritative enforcement.
6. Keep every certificate non-green until its mandatory integrity, coverage, containment, and live-proof dependencies exist.

Once those changes are made, the original plan’s strengths become the delivery machinery for a genuinely high-quality security product. Without them, the plan can make the product look much more complete while leaving its core detection claims unproven.
