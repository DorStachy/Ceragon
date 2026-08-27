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
| Ceragon-Intelligence | `486d937b` | yes, from `08a58981` |

`lastRebasedAt: 2026-08-27`

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

## Hard ordering constraints

Several tasks are safe alone and destructive in the wrong order.

1. **Wave 0A ships before anything else.** It is the only live customer impact. It needs an agent
   release; it does **not** need a Backend deploy, because floor membership does not change.
2. **Backend deploys before any agent release** whenever a contract widens. Breaking this has taken
   production down here before. The 51-class DLP widening (Wave 1) is exactly this shape: the enum
   widens on the policy write path, so the Backend goes first or the console 400s.
3. **Wave 3 before any promotion decision anywhere.** D18. An unrepaired instrument produces numbers
   that look like evidence.
4. **Wave 3B's benign-replay corpus gates every false-positive claim.** It is a data-collection
   programme measured in months, not an engineering task, and no amount of engineering shortens it.
5. **Wave 2 before Wave 4's enforcement changes** — the severity spine decides what may block at all.
6. **`deriveCombos` is deleted before Wave 4B ships, not after.**
7. **Deploying needs a fresh explicit owner ask every time.** Merging is not deploying and a green
   local run is not permission.

---

## Standing rules for anyone executing this plan

- **`git fetch` first.** Every line-level instruction is invalid against a moved tree.
- **A test you cannot make red has not run.** Every task names its defeat test and the exact mutation.
  If a mutation does not produce the stated failure text, the task is not done.
- **Never weaken an existing guard to fit this plan.** If a guard blocks a task, the task is wrong.
- **An absent measurement is `UNKNOWN`, never zero.** A missing denominator never renders as a rate.
- **Report verified separately from unverified.** Every status is PROVEN (with evidence) or
  NOT EXERCISED. There is no third category, and "should work" is not one.
