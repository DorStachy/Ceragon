# P47 Wave 3 run log

Last updated: 2026-08-30 (Asia/Jerusalem)

This log records source implementation and evidence only. It is not a deployment, release,
production-verification, detector-quality certification, 9+ score, or zero-false-positive claim.

## Checkpoint state

Wave 3's engineering tasks are implemented as a stacked Installers PR chain. Tasks 4 and 5 are
intentional headstones moved to Wave 3B, and Task 11 is owned by Wave −1 Task 5; they were not silently
reimplemented here.

| Plan work | Source state | Exact candidate / PR | What is proven |
|---|---|---|---|
| Tasks 1–3 — scorer harness, per-surface opportunities, UNKNOWN-not-zero | Implemented, pushed, draft | `5b3015919811c5f31e7761c2856fccd93e441396`, Installers #251 | Live 105-class producer union; per-surface benign/attack exposure; no zero-denominator rate fabrication. |
| Tasks 4–5 | Moved, not a Wave 3 implementation task | Wave 3B Tasks 1–2 | Mandatory engine version and complete system tuple remain inherited exits. |
| Task 6 — bounded inspection/completeness consumer | Implemented, pushed, draft | `2ec58b7c306aa3af91e4e8a025092f051de7d60c`, Installers #252 | The Task 6 aggregate run exposed EGRESS 0 complete / 39 degraded and INGRESS 0 / 28. At the final head, EGRESS is truthfully split into prompt 0/12 and auxiliary DLP 0/27. Unenforced item/wall dimensions remain explicit. |
| Task 7 — per-class local shadow | Implemented, pushed, draft | `178eb31b12c5418b75afa4dd69ea9f98474034b6`, Installers #253 | Per-(lane,class) eligible counts, bounded/dropped evidence, canonical identity/cohort, strict store loading, behavior invariance. Independent exact-SHA review approved. |
| Task 8 — four lane seams | Implemented, pushed, draft | `2ef587666d1c0c5d7497815e5d264531933a49a7`, Installers #254 | A/B/C/D declarations; A is prompt-only 6/5, B 18/8, C synthetic only and UNKNOWN, D NOT_INSTRUMENTED. |
| Task 9 — named report/promotion predicate | Implemented, pushed, draft | `830e2e892400213a4618085b5870ff57a7c2934c`, Installers #255 | Strict local report, terminal UNKNOWN, single promotion predicate, nightly/manual artifact with no new paid trigger. |
| Task 10 — shared invalidation | Implemented, pushed, independently approved | `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`, Installers #256 | Eight shared triggers, two callers, terminal UNKNOWN with no serialized rate, actual prompt-only execution/reporting, separate DLP diagnostics, exact 6/5 prompt seam, and durable failed-write invalidation. |
| Task 11 | Moved | Wave −1 Task 5 | Trigger-cost decision remains owner-blocked; no push/PR trigger was added. |

The short hashes in this table are navigation aids only where a full SHA is not yet frozen by the
final review. Re-read remote PR heads before merging.

## Dependency and merge state

The source chain is:

`Frontend #197` → `Installers #249` → `#251` → `#252` → `#253` → `#254` → `#255` → `#256`.

Frontend #197 is source-approved but its required Vercel context fails because a private GitHub
organization is connected to a Hobby account. Installers #249 deliberately remains unmerged so its
source does not land ahead of that consumer. Consequently the Wave 3 stack is publishable and
reviewable but must not be merged into Installers `main` by bypassing #197 or by changing bases to
hide the dependency.

## Final-review corrections

The complete-stack adversarial review found four blockers and they were repaired at the Task 10 head:

1. An invalid holdout previously serialized detector and aggregate rates computed before
   invalidation. All derived FP/FN/recall/interruption/uncertainty rates now flow through
   `InvalidationResult.Rate`; `UNKNOWN` artifacts retain diagnostic counts but omit every rate key.
2. The EGRESS lane seam previously counted all DLP plus prompt rows (23/12). The scorer now filters
   actual execution, results, totals, and detector accumulation through the executable surface seam.
   The official prompt report contains 12 prompt-risk cases with 6 benign / 5 attack, while a separate
   auxiliary DLP report contains 27 cases with 17 benign / 7 attack. Neither population is folded into
   the other.
3. A failed local-store write previously existed only in memory and vanished on restart. The writer
   now arms a private atomic incomplete-write sidecar before replacement, clears it only after a
   successful atomic store write, and both restart and the independent report fail closed while it
   exists.
4. The lane report step previously sat after a currently stale seed check. It now runs before that
   fallible chain, while artifact upload remains `if: always()`.

RED evidence was captured for the first, second, and workflow defects. The failed-write defeat
persists a valid prefix, forces the next save to fail, restarts the store, and proves the prefix cannot
be presented as lossless.

## Verification

- Relevant command, neutral-evaluation, report, daemon, contract, and local-decision tests: PASS.
- Relevant and repository-wide `go vet`: PASS.
- C04 inertness guard: PASS with four narrowly audited read-only measurement consumers.
- P9 frozen decision replay: PASS, exactly `strict=2717 drifted=0 tool=125`; the golden was not
  regenerated.
- Official prompt EGRESS artifact: 12 executed/results rows, `surface=promptrisk`,
  `status=UNKNOWN`, reasons include zero eligible denominator and degraded inspection, prompt seam
  `6/5`, completeness `0/12`, and zero detector, aggregate, or uncertainty rate keys.
- Auxiliary DLP EGRESS artifact: 27 executed/results rows, `surface=dlp`, `status=UNKNOWN`, seam
  `17/7`, completeness `0/27`, and zero detector, aggregate, or uncertainty rate keys.
- Final independent complete-stack review: **APPROVED** at exact head
  `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`.
- Full `go test ./... -count=1`: **PASS** at exact head
  `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`.

## Honest measurement state

- Current EGRESS and INGRESS rates are not certifying evidence because inspection is entirely
  degraded/unproven under the present completeness contract.
- TOOL has four public synthetic seed cases only. The observed seed counts (2/2 attack detections and
  no benign interruption in 2 benign cases) are regression evidence, not a false-positive bound.
- The frozen detector spine has zero TOOL classes; current TOOL rows are `UNCATALOGED`,
  `PARTIAL_WAVE3B_PENDING`, and `BUDGET_EXCEEDED`, hence `UNKNOWN` and never promotable.
- Lane D (LLM code scanner) is `NOT_INSTRUMENTED` pending Wave 7B and exact vendor model/system-prompt
  artifacts.
- The committed ingress corpus is currently stale relative to its generator, and Docker Desktop was
  unavailable on this host. The lane-shadow artifact now still publishes UNKNOWN before that failure;
  no stale corpus was silently regenerated.
- Wave 3B still owns engine/system tuple completion, the six-suite registry, contamination controls,
  adjudication, and the consented 29,956-benign-opportunity TOOL programme needed for a Tier-A bound.

## Production state

No Backend deploy, agent release, installer publication, AWS mutation, IAM change, task-definition
change, billing change, repository-secret creation, or production verification occurred in this
Wave 3 source pass.
