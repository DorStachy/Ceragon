# Paste this entire prompt into a fresh coding-agent chat

You are taking over the P47 / M4.7A detection-quality programme for the DeVoid/Ceragon security
product. Work as the lead implementation and verification engineer. Do not rely on a summary from a
human; reconstruct current truth from Git, GitHub, the committed handoff, the plan, and executable
tests before changing source.

## Objective

Safely carry the completed-but-stacked Wave 3 source through its remaining external dependency and
merge gates, reproduce the exact evidence on a machine/VM with Docker, and then continue with Wave 3B
in the roadmap's declared order. Preserve truthful `UNKNOWN` states. Do not turn missing, degraded,
stale, mixed, or zero-denominator evidence into a number or a pass.

## Start here

The workspace is a collection of independent repositories. The root planning repository is
`https://github.com/DorStachy/Ceragon.git` with default branch `master`. The Wave 3 source repository
is `https://github.com/Ceragon-Prod/Installers.git` with default branch `main`. Frontend dependency
state is in `https://github.com/Ceragon-Prod/Frontend.git`.

Use clean clones or dedicated worktrees. Existing dirty checkouts belong to the owner and other
programmes. Never reset, clean, discard, stash, or broadly stage their work. Fetch first, and re-read
all live PR states because they may have changed after this handoff.

Pull root `master`, then read these files completely in order:

1. `.plans/m47a-20260822/P47_WAVE3_HANDOFF_2026-08-30.md`
2. `.plans/m47a-20260822/v2-waves/W3_RUN_LOG.md`
3. `.plans/m47a-20260822/P47_EXECUTION_GUARDRAIL.md`
4. `.plans/PARALLEL_EXECUTION_CONTRACT.md`
5. `.plans/PARALLEL_HANDSHAKE.md`, newest entries at the bottom
6. `.plans/m47a-20260822/v2-waves/00_spine.md`, especially O-1 through O-19
7. `.plans/m47a-20260822/v2-waves/w3_measurement_substrate.md`
8. `.plans/m47a-20260822/v2-waves/w3b_corpus_governance.md`
9. `.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` for cross-wave dependencies

Treat documents as a map and GitHub/default-branch source as current operational truth.

## Frozen checkpoint to verify, not blindly assume

The dependency-preserving source graph at handoff was:

`Frontend #197` → `Installers #249` → `#251` → `#252` → `#253` → `#254` → `#255` → `#256`.

Expected exact heads at that checkpoint:

- Frontend #197: `3520da478d698a636dcaf43d66224344eb478aed`
- Installers #249: `8d28775231bcf8cc1542bd50541d67ed00416c3a`
- Installers #251: `5b3015919811c5f31e7761c2856fccd93e441396`
- Installers #252: `2ec58b7c306aa3af91e4e8a025092f051de7d60c`
- Installers #253: `178eb31b12c5418b75afa4dd69ea9f98474034b6`
- Installers #254: `2ef587666d1c0c5d7497815e5d264531933a49a7`
- Installers #255: `830e2e892400213a4618085b5870ff57a7c2934c`
- Installers #256 final candidate: `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`

At handoff, #197 was source-approved and mergeable but `UNSTABLE` solely because the required Vercel
context failed with the private-GitHub-organization-to-Hobby billing restriction. #249 was clean and
source-approved but deliberately not merged ahead of that pinned Frontend consumer. #251–#256 were a
draft stacked chain. Exact #256 received an independent `APPROVED`; all four earlier adversarial
blockers were fixed. Re-read everything before acting.

## What Wave 3 already implemented

Do not redo this work:

- Tasks 1–3: an in-memory scorer harness, live producer union, per-surface/per-class opportunities,
  mixed-lane refusal, and UNKNOWN rather than fabricated zero rates.
- Task 6: bounded inspection/completeness instrumentation and the first production consumer of the
  degraded-inspection signal.
- Task 7: bounded local-only per-`(lane,class)` shadow evidence with strict independent validation,
  drop accounting, behavior invariance, atomic store replacement, and durable incomplete-write
  invalidation across restart.
- Task 8: four declared evidence seams. Prompt EGRESS is actually filtered to 12 prompt cases with a
  6-benign/5-attack denominator; DLP is a separate auxiliary 27-case report with 17/7. INGRESS and
  TOOL remain separate. CODE_SCANNER is explicitly NOT_INSTRUMENTED.
- Task 9: deterministic lane-shadow report, a single promotion predicate, and nightly/manual artifact
  ordering that publishes TOOL UNKNOWN even when a later seed check fails.
- Task 10: one shared eight-trigger invalidation contract used by holdout and shadow reporting. An
  invalid artifact retains diagnostic counts but emits no detector, aggregate, or uncertainty rates.

Tasks 4 and 5 are intentional headstones owned by Wave 3B. Task 11 is owned by Wave −1 Task 5. Do not
count those as omitted Wave 3 work and do not implement a duplicate.

## First actions

1. Fetch all three remotes and inspect PRs #197, #249, and #251–#256 with `gh pr view`, including
   `state`, `isDraft`, `headRefOid`, `baseRefName`, `mergeable`, `mergeStateStatus`, reviews, and checks.
2. Confirm the exact commit graph and read every diff in the stack. If a head moved, stop treating the
   prior approval as applying and obtain a new exact-SHA review after tests.
3. Inspect the newest parallel handshake before editing shared files. Claim any shared-file or
   Backend-migration seam before writing it.
4. Run the exact final Installers head in a clean worktree:

```powershell
git fetch origin --prune
git worktree add C:\cwt\p47-w3-review origin/codex/p47-w3-t10-invalidation
cd C:\cwt\p47-w3-review
git rev-parse HEAD
git status --short --branch
go test ./... -count=1
go vet ./...
go test ./internal/aipolicycontract -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1
go test ./internal/localdecide -run TestExtractedCoreReproducesTheDaemonDecisionsExactly -count=1 -v
go run ./cmd/ai-security-holdout-seed --check
```

The immutable P9 replay must report exactly `strict=2717 drifted=0 tool=125`. It was not regenerated
for Wave 3. If it changes, inspect the row diff as a behavior changelog; never regenerate from the
changed tree to hide drift.

The ingress seed check was stale at handoff. A failure there is a named blocker, not permission to
silently regenerate or relabel the sealed corpus.

## Required VM/Docker proof

Use a disposable VM with Docker available to reproduce the workspace gate at the exact #256 head.
The runner resolves components as children of the root workspace, so create a clean layout like this:

```text
C:\vm\Ceragon\ci\lib\run.mjs
C:\vm\Ceragon\Installers\   # exact Installers #256 checkout
```

Clone/fetch the root repository at `C:\vm\Ceragon`; clone/fetch Installers into exactly its
`Installers` child and detach it at `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`. Before running the
gate, verify both paths and the source identity:

```powershell
cd C:\vm\Ceragon
Test-Path .\ci\lib\run.mjs
git -C .\Installers rev-parse HEAD
node ci/lib/run.mjs Installers holdout-score:score
```

The SHA command must print `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`. Do not invoke the
workspace runner from the standalone Installers worktree; it has no root `ci/lib/run.mjs`.

Preserve the exact failing stage and produced artifacts. The expected prompt report has 12 executed
and 12 result rows, `surface=promptrisk`, denominator 6/5, inspection 0/12, terminal UNKNOWN, and no
derived rate keys. The separate DLP report has 27 rows, `surface=dlp`, denominator 17/7, inspection
0/27, terminal UNKNOWN, and no derived rate keys. A missing TOOL store must produce an auditable
UNKNOWN artifact before the stale seed gate stops the job.

Do not upload real customer prompts, tool inputs, raw identifiers, secret material, or endpoint-local
evidence. Use synthetic/consented disposable data only.

## Merge choreography

Do not admin-bypass, merge #256 first, rebase the stack directly onto `main` to hide dependencies, or
copy commits around the reviewed graph.

1. Resolve Frontend #197's required Vercel account/check issue through the owner/account administrator
   or another explicitly approved repository-policy decision. Do not change billing or required-check
   policy yourself without authorization.
2. Re-run #197's documented tests and merge it only when the exact head remains approved and every
   required check is green.
3. Verify #249's consumer lock still pins the approved source/consumer pair, rerun its gates, and merge
   #249.
4. Process #251, #252, #253, #254, #255, and #256 in order. For each: verify exact head/base, rerun its
   focused defeats, keep task boundaries intact, obtain exact-head review where necessary, mark ready,
   and merge only after its base is on `main`.
5. If `main` moved, rebase the remaining stack coherently. Never drop or duplicate a task commit. Any
   changed head invalidates the old exact-SHA approval until re-tested/re-reviewed.
6. From fresh final `main`, run full Go tests/vet, inertness, the immutable golden, seed check, and the
   VM Docker mirror. Record exact commands, SHAs, outputs, failures, and artifact identities in the
   append-only handshake/run log.

If #197 remains externally blocked, leave the source stack open. Continue only dependency-safe Wave
3B work and describe Wave 3 as implemented/unmerged, never merged or deployed.

## Continue with Wave 3B

Read `v2-waves/w3b_corpus_governance.md` completely and follow its internal ordering. The next stage
must establish version identity and corpus governance before later waves cite detector-quality rates:

- mandatory real engine version and complete system-under-test identity;
- one evidence manifest and six-suite registry;
- semantic-cluster and near-duplicate contamination prevention before splitting;
- append-only canonical regression/transform indexes;
- consented, provenance-bearing benign/attack/E2E/private/incident corpora;
- independent two-labeler adjudication;
- all registered cross-lane refusal defeats;
- TOOL catalog widening only through the upstream shared-contract generator and the coordinated
  Backend-before-agent re-vendoring seam.

The 29,956 benign TOOL opportunities needed for the planned Tier-A zero-error bound are a consented
operational data programme, not something to synthesize by retries or near-duplicate mutations. Do
not manufacture independence or call four public seed cases a false-positive rate.

## Parallel-programme landmines

- Authoritative prompt/tool decision bodies are in `internal/localdecide`; daemon handlers delegate.
- The 2,842-row P9 golden is immutable unless a separately reviewed intentional semantic change
  requires a pristine-before-change regeneration protocol.
- Keep P9's per-call-site aicanary bound; do not restore the discarded shared `WaitDelay` increase.
- P47 owns detector class membership and firing semantics. Field-only widening of the generated
  projection follows the explicit P9 seam and must preserve the pinned class membership unless a
  coordinated generator change says otherwise.
- Handshake and proof registers are append-only. Never reorder or rewrite history.
- Release/deployment must combine P9 and P47 payloads and requires a fresh owner decision after exact
  source, workflow, and canary evidence.

## Authority and safety boundary

This prompt authorizes source inspection, tests, local/VM evidence, PR maintenance, and safe merges
whose existing required checks and approvals are satisfied. It does not authorize:

- administrator bypass of a required check;
- Backend/worker deployment or installer/agent publication;
- AWS, ECS, IAM, RDS, queue, secret, task-definition, desired-count, billing, or production mutation;
- creation of GitHub/AWS/Vercel secrets;
- a live production canary;
- collection or upload of unconsented company/customer content;
- weakening a test or converting UNKNOWN to zero/green to make a gate pass.

Ask the owner freshly before any deployment, release, cloud/billing mutation, or live canary. A source
merge is not a deployment and is not production proof.

## Reporting contract

Keep the owner updated at meaningful checkpoints. Report four states separately: merged,
implemented-but-unmerged, externally blocked, and not-started/moved. Every completion claim must name
the repository, exact SHA, PR/merge commit, tests run, independent review result, and any skipped or
unavailable gate. Never claim zero false positives, 9+, certification, or production protection from
the current Wave 3 artifacts; they intentionally say UNKNOWN where evidence is insufficient.

Begin now by pulling root `master`, reading the handoff and newest handshake completely, and posting a
short reconstructed state before making changes.
