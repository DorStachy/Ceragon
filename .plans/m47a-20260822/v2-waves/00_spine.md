> ## ⚠ READ FIRST — THIS PROGRAMME RUNS IN PARALLEL WITH ANOTHER ONE
>
> A second plan is being implemented **at the same time, by a different agent team, in a different
> chat session.** The two plans share **28 source files** and several resources that have no file
> conflict at all and will still destroy each other's work: one agent release channel, one production
> Backend, one live-proof register, one `pr-checks.yml`.
>
> **Before your first task, read
> [`.plans/PARALLEL_EXECUTION_CONTRACT.md`](../../PARALLEL_EXECUTION_CONTRACT.md).** It names the owner
> of every shared file, the append-only protocol for the shared scoreboards, the serialised
> owner-gated release procedure, and the handshake file for anything you need from the other side.
>
> Three rules that will not be obvious from inside a task:
> 1. **If your task seems to need a file this programme does not own, it does not.** Post a seam
>    request to the handshake and switch tasks. Do not make "a small edit" in the other programme's
>    directory.
> 2. **Never cut an agent release or request a Backend deploy on your own authority.** A release now
>    carries both programmes' merged work. One team releasing alone ships the other team's
>    half-finished work to every endpoint.
> 3. **Append, never rewrite,** in `internal/liveproof/register.json`, the Codex ledger, and
>    `pr-checks.yml`. A reformat by one team turns every later diff into a conflict.
>

# M4.7A — Runtime AI Security Protection and Detection Engine: Implementation Plan (v2)

**Supersedes:** `M47A_IMPLEMENTATION_PLAN.md` (v1, 2026-08-22, 17,538 lines), which its own
commissioned review disposed as *"do not begin detection-enforcement implementation from the current
plan."* This is the refactor that review demanded, not an appendix to it.

**Revised:** 2026-08-27
**Evidence base:** v1's two adversarially-verified audits, plus the 2026-08-23 independent
detection-quality review (19 P0, 12 P1), plus a 2026-08-27 disposition pass that re-measured every
finding against current `origin/main` and found **17 substantive errors in the review itself.**

---

## Rebase manifest

Every line-level instruction in this plan was verified against these revisions. **If your `git fetch`
disagrees with this table, the instructions below are invalid until revalidated** — that is a standing
rule, not a courtesy. The 2026-08-27 disposition pass was handed a SHA list built from local
checkouts and four of seven were stale; it caught the error by fetching first. Do the same.

| Repository | `origin/main` @ 2026-08-27 | Moved since the review? |
|---|---|---|
| Backend | `0cf9021e` — **deployed as ECS task definition 322** | yes, from `787b71dc` |
| Frontend | `cac574ae` — deployed as task definition 378 | yes, from `471658a7` |
| Installers | `5b129523` — **agent 7.10.6 stable**, built from `9503094e` | yes, from `f29d6644` |
| Static-Worker | `44d7aabb` | yes, from `e4c6069f` |
| Sandbox-Worker | `2831997d` | yes, from `d68ee58d` |
| GithubApp-Bot-Scanner-Worker | `3d4116a5` | **no — review findings are current** |
| Ceragon-Intelligence | `deb70e64` | yes, from `08a58981` |

`lastRebasedAt: 2026-08-28`

⚠️ **This table drifted inside a single working session, and that is the point of the rule.** It was
written on 2026-08-27 pinning Ceragon-Intelligence at `486d937b`. By 2026-08-28 `origin/main` was
`deb70e64` — **5 commits, 36 files, +12,372 insertions, 31 of them under `fp-agent/`**, all marked
`[skip ci]`. That is a coworker actively building an autonomous false-positive-review agent: the exact
subject of Wave 6 Task 13, moving faster than the plan that inventories it.

Their commits are theirs and are not held for this packet. But **anyone starting a wave re-runs the
fetch and re-reads their own wave's citations first.** A wave file is a set of claims about a tree.

---

## The goal, stated as a claim this packet can actually make

v1's goal was *"all the rules working, all the detections, zero false positives, high quality
detections, smart one, with severities right and smart and correct."* That is the right product
ambition and it is not a claim any packet can certify. Restated:

> **Deliver a runtime AI security protection and detection engine in which: every class the endpoint
> can emit is visible and settable by an administrator; ordinary developer work is not interrupted;
> every class that interrupts carries a measured recall and a bounded false-positive rate on a corpus
> its detector authors did not tune against; a consequential action cannot occur without passing an
> authoritative checkpoint; and every number the console shows traces to a manifest naming the build
> that produced it.**

### What "zero false positives" means here

A universal zero-false-positive claim is not provable and this plan does not attempt one. The
defensible form, and the only one this plan will make:

> Zero observed false interventions in a named, versioned, representative, independently governed
> corpus and production window, with a predeclared one-sided confidence bound, explicit coverage
> limits, and no known unresolved benign hard block.

**Today there IS a known unresolved benign hard block** (Wave 0A). Until it is closed, the phrase is
unavailable to us at any sample size.

### Which risk lanes this packet can certify

**None of the five.** That belongs here in the goal statement, not in a footnote.

| Risk | State after this packet | The blocker that keeps it there |
|---|---|---|
| R1 secrets / company data | `NOT_READY` | 51 of 81 DLP classes ungovernable; two published FN residuals; no pre-egress boundary on every provider route; F16 key custody absent |
| R2 insecure code reaching a protected branch | `NOT_READY` (execution-truth *dimension* can PASS) | no CWE x language x framework precision/recall programme; **branch protection impossible on the current GitHub plan — all six repos 403** |
| R3 malicious dependency / artifact | `NOT_READY` | permissive artifact-admission transport; sandbox executes the untrusted package before the inconclusive verdict is written; M5.2 mandatory; F16 |
| R4 dangerous command / production action | `NOT_READY` | a known-benign command hard-blocked with no admin override (0A); `chmod-broad-777` at 0% recall; no effect resolver; F16 |
| R5 prompt injection | `NOT_READY` | sealed recall 75%, `injection-system-exfil` 0%; no adaptive evaluation; **the lexical classifier is structurally ineligible as an enforcing tier (D16)** |

**What CAN reach PASS**, as bounded engineering-assurance *dimensions* rather than risk certificates:
scanner **execution** truth; tool-risk **policy authority and catalog totality**; **measurement-substrate
integrity**; **console truth**. Each is a real deliverable. None is a risk lane. Say so to customers.

---

## Decisions this plan implements

D1-D14 were resolved with the owner on 2026-08-22. Four are **reversed or rewritten** below because
the code moved or the reasoning did not survive measurement. D15-D18 are new.

| # | Decision | Status |
|---|---|---|
| D1 | Pull both `ALLOW_MINIMAL` vars; restore depth by setting `STANDARD` only where consent is real | unchanged |
| D2 | Enable ECS Exec on the backend service so production becomes verifiable | unchanged |
| D3 | Build FP measurement **before** turning any rule on | unchanged, and see D18 |
| D4 | Decision-level shadow: strict candidate evaluated beside calm active, deltas only | **amended** — lane-specific, not tool-only. A tool shadow is not prompt evidence (P0-03) |
| D5 | Reinstall on a capture build that surfaces nothing | unchanged |
| D6 | "Zero FP = nothing the developer or SOC sees fires on legitimate work. Silent telemetry is fine" | **rewritten** — see below |
| D7 | Severity is two axes: IMPACT and CONFIDENCE. Weak evidence structurally cannot block | unchanged |
| D8 | One product-wide scale: `INFO/LOW/MEDIUM/HIGH/CRITICAL` | unchanged |
| D9 | Forward-only storage plus read-time translation | unchanged |
| D10 | Impact declared in per-detector digest-pinned catalogs; Backend table generated from them | unchanged, largely delivered |
| D11 | Port `deriveCombos` to tool-risk | **REVERSED** — see below |
| D12 | Add cloud/production destruction classes, only the unmistakable ones | **rewritten** — see below |
| D13 | Pattern-only on Windows for now | **rewritten** — see below |
| D14 | Keep fail-open, make it force non-green | unchanged; observer shipped in 7.10.6 |
| D15 | **The floor is absolute; the rule gets narrowed** | new |
| D16 | **A lexical classifier cannot be an enforcing tier** | new |
| D17 | **This packet delivers dimensions, not risk certificates** | new |
| D18 | **The instruments are repaired before any measurement is taken** | new |

### D6, rewritten — four different things, not one

v1 collapsed private telemetry, a customer-visible detection, a SOC alert, and enforcement into one
word. They are four objects and they must be counted separately.

- **Private telemetry** — never leaves the endpoint. Free.
- **Customer detection row** — the console shows it. Monitored findings *do* produce these: they ride
  the raw slice to the Backend and become a row. Not free.
- **SOC alert** — pages a human. Monitored findings do **not** produce these:
  `alerts.service.ts:862-881` admits only `TOOL_CALL_BLOCKED`, `CODE_DIFF_FLAGGED`,
  `MCP_SERVER_BLOCKED`, `PACKAGE_INSTALL_BLOCKED` plus gated `PROMPT_*` and `WEB_NAV_BLOCKED`;
  `TOOL_CALL_REQUESTED` is absent. v1 and the review both got this wrong, in opposite directions.
- **Enforcement** — the developer is stopped.

**And monitoring must be non-tainting, which today it is not.** `taintRisky`
(`Installers/internal/daemon/ai_taint.go:159-166`) returns true on *any* non-INFO raw finding and is
never policy-filtered, so a class the administrator deliberately set to `monitor` still converts an
ALLOW into a HOLD on an independently tainted session. Closing that is Wave 2.

### D11, REVERSED — delete `deriveCombos`, do not port it

v1 decided to port `deriveCombos` from ingress/prompt into tool-risk. Measured on current main, it
combines any high/medium finding outside a five-member set with no field, span, AST, resource,
destination, proximity, dataflow or time constraint. A threat-model markdown quoting a piped-shell
example fires `content-pipe-shell` + `content-spawn-shell` and the combo goes true.

Under the shipped D4 posture both of those classes are on `monitor`. So the combo would not add a
warning beside existing ones — **it would manufacture the only interruption the developer sees, out of
two signals the product deliberately decided not to show them.** Delete it before it ships. Replace
with named relation-specific correlations over an explicit threat graph:

`untrusted source -> derived instruction/data -> proposed capability -> resolved destination/resource
-> authorization -> observed effect`

### D12, rewritten — a spelling is not an effect

v1 added cloud destruction classes by command spelling. Compiling its five regexes verbatim against
current main: **9 production-effect spellings produce no finding**, and **7 zero-impact benign twins
fire HIGH — including a git commit message and a runbook line.** No environment, resource or
authorization resolution exists anywhere: grepping `AWS_PROFILE`, `--profile`, `--region`, `KUBECONFIG`
across `internal/toolrisk` and `internal/shellast` returns zero matches.

Findings of this family are renamed **destructive capability/effect proposals** and are not
enforcement-eligible until an effect resolver answers *which environment, which resource, under whose
authorization, with what observed effect.* D12 is **not** exempt from measurement.

### D13, rewritten — two residuals, not a category

The review claimed broad Windows evasion exposure. Measured on current main, that overstates the open
set by roughly an order of magnitude: eighteen transform shapes are CAUGHT-SAME-CLASS, two more
CAUGHT-OTHER-CLASS, PowerShell `-EncodedCommand` is decoded and escalated to HIGH, and
`TestDialectMatrixHasNoParityGaps` reports **0 gaps over 14 both-dialect classes**.

**Exactly two shapes are NOT-CAUGHT** — `cmdsubst-verb` and `non-ifs-unknown-sep` — plus the pinned
`rm -rf "$HOME"` residue. Close those three. The absence of a PowerShell/cmd **semantic** parser
remains a correctly-scoped limitation and keeps Risk 4 non-green for Windows certification; that is a
stated limit, never an exit pass.

### D15, new — the floor is absolute; the rule gets narrowed

`destructive-rm` fires on **every** `rm -rf ~/<anything>` and `rm -rf $HOME/<anything>`. It is a
malicious-floor member at minimum `block`, and since the floor began holding on the read path
(deployed in task definition 322) **no administrator on any tenant can relax it.**

The floor is not the defect and does not move. The **rule's breadth** is the defect. `rm -rf $HOME`
and `rm -rf ~` stay blocked forever; `rm -rf $HOME/<narrow subpath>` stops being the same act. This is
Wave 0A and it is the only item in this plan with live customer impact today.

### D16, new — a lexical classifier cannot be an enforcing tier

Published guard models operate around **1% false-positive rate**. This product's own budget is
**at most 1 unnecessary visible intervention per 1,000 benign sessions (0.1%)** and **at most 5
confirmations per 1,000 benign opportunities (0.5%)**. The guard model is an order of magnitude away
from the budget before any of our own error is added.

This is arithmetic, not preference. `internal/promptrisk` — 38 regexes, no semantic layer,
English-only — is **structurally ineligible** to be an enforcing tier. It is evidence that feeds a
decision, and the decision needs provenance, destination and authorization. Recording this closes a
debate that has recurred for three milestones.

### D17, new — dimensions, not certificates

See the risk table above. Every external communication about this packet names a dimension and its
bound. No risk lane is described as complete, scored, or "9+".

### D18, new — repair the instruments before measuring

**43 of 55 detector classes currently report perfect recall on zero attack cases**, because `FNRate`
has no null and is written only when `expecting > 0`. Every class shares one corpus-wide false-positive
denominator. Every result ever produced is stamped with the constant string `"m4.7"`.

Every measurement taken before Wave 3 lands is invalid, including measurements this plan's own earlier
waves might otherwise produce. No promotion may cite a number produced by the unrepaired instrument.

---

## The waves

| Wave | Subject | File |
|---|---|---|
| −1 | Rebase, authority regeneration, claim contract | `w-minus-1_w0.md` |
| **0A** | **Stop hard-blocking ordinary work** — the only live customer impact | `w-minus-1_w0.md` |
| 0 | Emergency egress correction | `w-minus-1_w0.md` |
| 1 | Policy authority and catalog totality (30 → 81 DLP classes) | `w1_policy_authority.md` |
| 2 | Evidence strength, consequence, UI vocabulary | `w2_evidence_severity.md` |
| 3 | Measurement substrate | `w3_measurement_substrate.md` |
| 3B | Evaluation and corpus governance | `w3b_corpus_governance.md` |
| 4A | Close the published residuals | `w4a_w4b_tool_effect.md` |
| 4B | Tool/effect detection quality | `w4a_w4b_tool_effect.md` |
| 4C | Prompt/ingress detection quality | `w4c_prompt_ingress.md` |
| 5 | Console truth | `w5_w6_console_triage.md` |
| 6 | Triage, adjudication, incident learning | `w5_w6_console_triage.md` |
| 7A | Scanner execution truth | `w7_scanner.md` |
| 7B | Scanner detection certification | `w7_scanner.md` |
| 7C | Sandbox containment and the unguarded closures | `w7_scanner.md` |
| 8 | Authoritative enforcement, canary, rollback, certificate | `w8_enforcement_certificate.md` |

---

## Hard ordering constraints

Several tasks are safe alone and destructive in the wrong order. **O-5, O-7 and O-9 are fleet-wide
outage shaped** — read those three even if you read nothing else here.

| # | Constraint | What breaks if inverted |
|---|---|---|
| **O-1** | Wave −1 Task 1 (fetch + manifest) before every other task | Every `path:line` in this packet is a claim about `origin/main`. Working trees here run 20–1,010 commits behind; the same `sed -n '122p'` returns a different line in a working tree than at `origin/main`. |
| **O-2** | **Wave 0A before anything else touching the endpoint** | The only live customer impact. Needs an agent release and **no** Backend deploy: `ClassCatalog()` reads `rl.class`/`rl.severity` and never `rl.re`, so a regex edit cannot move the 40-class vector, the D4 table, or floor membership. |
| **O-3** | Wave 0A before Wave 4B Task 6 | 4B inverts a pin on the alternation 0A rewrites. Inverted, both waves' benign tables disagree about `rm -rf "$HOME"`. |
| **O-4** | **Backend deploys before the Frontend 81-row board (Wave 1)** | `assertClosedActionMap` throws and `validateActionMap` 400s on any `dlp.actions` key outside the tuple. Console first ⇒ every policy PUT 400s. **This is Backend-before-*Frontend*, not before an agent release.** |
| **O-5** | **Wave 1's preset widening lands in the SAME COMMIT as the tuple widening** | `sanitizeStoredConfig` merges the stored document over the Recommended preset. Tuple widens and preset does not ⇒ `assertClosedActionMap` throws on the **read** path **for every tenant, fleet-wide**. Highest blast radius in the packet. |
| **O-6** | Wave 2 Task 2 (five-band Backend) deploys before Wave 2 Task 4 (console) | `?severity=info` 400s the *whole* request against a four-member `@IsIn`; an info-banded INSERT violates the CHECK constraint. |
| **O-7** | **Wave 2 Task 7 Backend steps deploy before the agent steps** | `AgentIngestValidationPipe` **drops** an undeclared key rather than 400ing. Agent first ⇒ the new fields vanish silently. No error, no data, and the fold looks like it works. |
| **O-8** | **Wave 3 before any promotion decision anywhere** (D18) | 43 of 55 classes report `fnRate: 0` on zero attack cases; every class shares one corpus-wide FP denominator; every artifact is stamped `"m4.7"`. Gates 4A, 4B, 4C and 7B. |
| **O-9** | **Wave 7A deploy sequence exactly: action release tag → Backend → worker Task 6 → worker Task 7** | Task 7 makes a manifest-less submission complete as `COVERAGE_FAILED`. Deployed before runners emit `metadata.runtime`, **every scan fails closed on deploy.** |
| **O-10** | `deriveCombos` is deleted before Wave 4B ships, not after (D11) | Both combining classes are on `monitor` today, so the combo would manufacture the only interruption the developer sees. |
| **O-11** | Wave 4B Task 8 adds any new class to `AI_TOOL_RISK_D4_TIERS` in the same edit as the severity tuple | `resolveToolRiskDefaults` **throws at module load** on a registered class with no tier. Backend does not boot, in every environment including the first importing test. |
| **O-12** | Wave 3 (per-class denominators) before Wave 3B Task 3 | Emitting first publishes the corpus-wide denominator into a schema-validated artifact. |
| **O-13** | Wave 3B Task 4 (suite registry) before 4A/4B/4C/7B declare exit numbers | Without `claimSupported` derived from independent clusters, every wave invents its own bound. |
| **O-14** | Wave 2 before Wave 4's enforcement changes | The severity spine decides what may block at all. |
| **O-15** | Wave 4A before Wave 4C | 4C's gate reads a prompt-lane report whose `injection-system-exfil` row 4A fixes. Gating first means gating on a class at 0% recall — the state the gate exists to refuse. |
| **O-16** | Wave 4B Task 2 (effect resolver) before Wave 8 Task 2 (widened binding) | `normalizedEffect` **is** the resolver's output. Without it the preimage still hashes raw tool input and a respelled command is a different grant. |
| **O-17** | Wave 8 Task 5 (canary honesty) before Task 9 (live canary evidence) | A 5s `WaitDelay` reported a real deny as a launch failure in 2 of 6 recorded runs. A canary that reports enforcement successes as errors cannot be the evidence lane. |
| **O-18** | Wave 8 Task 1 (sink inventory) → Task 3 (mediation) → Task 12 (defeat matrix) | The matrix cannot test "the same sink" before the inventory defines it. |
| **O-19** | **Deploying needs a fresh explicit owner ask, every time** | Merging is not deploying; a green local run is not permission. Deploy gates are fail-closed on MISSING runs, so `pr-checks` and `security` are dispatched on `main` first. |

Carried forward from v1 and still live, though no wave here touches them: the signed-queue two-sided
trap (consumers get the allowlist → Backend gets the key id → Intelligence signs → the reject flag
last); the scanner queue redrive policy changes in AWS before the task-def value ships, or the worker
refuses to boot; and the PROCESSING heartbeat reaches every deployed worker before the reaper
threshold is shortened.

---

## Standing rules for anyone executing this plan

- **`git fetch` first.** Every line-level instruction is invalid against a moved tree.
- **A test you cannot make red has not run.** Every task names its defeat test and the exact mutation.
  If a mutation does not produce the stated failure text, the task is not done.
- **Never weaken an existing guard to fit this plan.** If a guard blocks a task, the task is wrong.
- **An absent measurement is `UNKNOWN`, never zero.** A missing denominator never renders as a rate.
- **Report verified separately from unverified.** Every status is PROVEN (with evidence) or
  NOT EXERCISED. There is no third category, and "should work" is not one.
