# Owner decision, 2026-09-04 — the external dependencies are withdrawn from scope

**Decided by the owner. Not an engineering judgement and not reversible by one.**

The programme carried six items that were neither code nor owner-decisions, but purchases,
contracts or third-party artefacts. They are **withdrawn from the plan's scope**:

| Withdrawn | Was gating |
|---|---|
| Contracted red-team time | E2 — Suite 4's adaptive arm |
| A named independent evaluator who is not a detector author | E4 — Suite 5b custody, `proof.independentReview` |
| The consented benign-replay data programme (29,956 opportunities; 51 exist) | E1 — Suite 3, the false-positive denominator |
| Codex vendor artefacts (release model + system-prompt version) | E3 — the safeguards-on column |
| A KMS / HSM / TPM key ceremony | Wave 8 Task 10 (F16) |
| GitHub CI billing | Wave −1 Task 5; branch protection across six repos |

## What this changes, stated so nobody re-discovers it

**Withdrawn is not "blocked". Blocked means later; withdrawn means never, unless the owner
re-opens it.** Every criterion below is now permanently unclaimable and must read that way in any
artifact that mentions it — not `BLOCKED`, not `PENDING`, not an empty field awaiting a value.

1. **The ≤1% false-positive bound is unreachable.** It needs 299 independent benign clusters per
   class at zero errors; the corpus holds far fewer. The FP figure stays whatever the corpus
   actually buys, published with its own denominator beside it.
2. **Adaptive attack-success-rate stays `null`.** Not `0`. A null ASR with no adaptive arm is the
   honest reading; a zero would claim an evaluation that never ran.
3. **`proof.independentReview` stays empty**, and every rate this programme publishes is
   author-measured. Where a detector's author also wrote its corpus, the artifact says TUNED.
4. **F16 stays NOT_READY**, and with it R1, R3, R4 and the shared trust gate.
5. **The Codex safeguards-on column stays UNKNOWN.** Publish the safeguards-off column and say
   which it is.
6. **Nothing runs automatically on merge.** The 52 mirrored gate legs run locally in Docker; that
   is the whole CI story and `ci/README.md` is the runbook.

## What it does NOT change

The four engineering-assurance dimensions this packet actually delivers — scanner execution truth,
tool-risk policy authority and catalog totality, measurement-substrate integrity, console truth —
are **untouched**. None of them ever depended on a purchase. D17 already said the programme delivers
dimensions rather than risk certificates; this decision removes the items that were keeping five
certificate rows in a permanent "coming soon" state and makes their real status legible.

**The order of work is now: finish the code, then run the evidence.** Any exit criterion whose only
remaining blocker appears in the table above is satisfied by recording it as withdrawn — not by
waiting, and not by substituting a weaker measurement and calling it the same thing.
