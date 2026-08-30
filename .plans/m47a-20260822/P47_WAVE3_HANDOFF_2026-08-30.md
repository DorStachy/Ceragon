# P47 / M4.7A Wave 3 implementation handoff

Checkpoint date: 2026-08-30 (Asia/Jerusalem)

Audience: the owner's coworker and the fresh coding agent continuing the programme.

## 1. Executive handoff

Wave 3's source implementation is complete through the final engineering task. The work repairs the
measurement substrate; it does **not** prove that the security product has zero false positives, is
9+, or is certified against the five product risks.

The implementation is published as a dependency-preserving Installers PR stack:

`Frontend #197` → `Installers #249` → `#251` → `#252` → `#253` → `#254` → `#255` → `#256`.

The Wave 3 source PRs are intentionally draft while their base chain is blocked. Frontend #197 is
source-approved but has one required failing Vercel context caused by private-organization-to-Hobby
billing. Installers #249 is therefore deliberately open: merging it first would land the source ahead
of the pinned Frontend consumer. The Wave 3 PRs inherit that dependency and must not be admin-merged,
rebased directly to `main`, or squash-copied around it merely to say they merged.

What the coworker receives:

- the full assembled M4.7A plan and split wave packets on root `master`;
- a Wave 3 run log with exact candidates and evidence;
- this handoff and a paste-ready fresh-chat prompt;
- every Wave 3 source commit pushed to GitHub in an explicit PR chain;
- no hidden local-only source needed to continue.

No service was deployed, no agent/installer was released, no AWS/IAM/task-definition state was
changed, and no production verification is claimed.

## 2. Read this first: four different states

Do not collapse these into “done” or “not done.”

1. **Merged:** present on a repository's default branch.
2. **Implemented but unmerged:** committed, pushed, reviewable source behind an open PR.
3. **Blocked:** technically ready work that needs an external account/owner/dependency action.
4. **Not started or intentionally moved:** work whose named owner is a later wave.

At this checkpoint:

- Wave 3 engineering source is **implemented but unmerged**.
- Root plan/run-log/handoff documentation is **committed on `codex/p47-final-handoff` for publication
  and merge into root `master`**; re-read the root PR/default branch for the live merge state.
- The Frontend/Vercel dependency is **blocked**.
- Wave 3B corpus governance is **not started by this handoff** and is the next programme stage.
- Production deployment/release is **not authorized**.

## 3. Repository and remote truth

The workspace is a collection of repositories, not one monorepo. Run Git and build commands from the
component being changed.

| Repository | Remote/default | Fetched default tip at checkpoint | Notes |
|---|---|---|---|
| Root plans/workspace | `https://github.com/DorStachy/Ceragon.git`, `master` | `72b0e9711603b153b9317ed513a3b8242bc39f37` before this handoff PR | The clean handoff branch is `codex/p47-final-handoff`. |
| Installers | `https://github.com/Ceragon-Prod/Installers.git`, `main` | `a9b987072b7c952085c1733207711db55fcf8891` | Contains the earlier P9 merges and P47 Wave 2 Task 9. |
| Frontend | `Ceragon-Prod/Frontend`, `main` | Verify afresh | #197 is the immediate external gate. |
| Backend | `Ceragon-Prod/Backend`, `main` | Verify afresh | No Wave 3 source change in this checkpoint. |

The owner's shared checkout at `C:\Users\Owner\Documents\Ceragon` was dirty with unrelated/user and
parallel-programme changes. It was not cleaned, switched, reset, stashed, or committed. All work was
performed in dedicated worktrees under `C:\cwt`. A new engineer must preserve the same rule.

## 4. Exact PR and commit graph

Re-read these with `gh pr view` before acting; exact heads are immutable review identities, but GitHub
state can change after this document is written.

| Dependency order | Repository / PR | Branch → base | Exact head at checkpoint | State and reason |
|---:|---|---|---|---|
| 0 | Frontend #197 | `codex/p47-w2-t5-mechanism-copy` → `main` | `3520da478d698a636dcaf43d66224344eb478aed` | Open, source-approved, `UNSTABLE`; only reported check is Vercel FAILURE for private-org Hobby billing. |
| 1 | Installers #249 | `codex/p47-w2-t10-grade-fallback` → `main` | `8d28775231bcf8cc1542bd50541d67ed00416c3a` | Open/clean/source-approved. Must follow #197. |
| 2 | Installers #251 | `codex/p47-w3-t1` → #249 branch | `5b3015919811c5f31e7761c2856fccd93e441396` | Draft/clean. Wave 3 Tasks 1–3. |
| 3 | Installers #252 | `codex/p47-w3-t6` → #251 branch | `2ec58b7c306aa3af91e4e8a025092f051de7d60c` | Draft/clean. Wave 3 Task 6. |
| 4 | Installers #253 | `codex/p47-w3-t7` → #252 branch | `178eb31b12c5418b75afa4dd69ea9f98474034b6` | Draft/clean; independently approved at exact SHA. Task 7. |
| 5 | Installers #254 | `codex/p47-w3-t8` → #253 branch | `2ef587666d1c0c5d7497815e5d264531933a49a7` | Draft/clean. Task 8. |
| 6 | Installers #255 | `codex/p47-w3-t9-lane-shadow-report` → #254 branch | `830e2e892400213a4618085b5870ff57a7c2934c` | Draft/clean. Task 9. |
| 7 | Installers #256 | `codex/p47-w3-t10-invalidation` → #255 branch | `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf` | Draft/clean; independently **APPROVED** at this exact head. Task 10 plus complete-stack corrections. |
| docs | Root publication PR (read current GitHub state) | `codex/p47-final-handoff` → `master` | Read the PR head | Plan status, Wave 3 run log, handoff, fresh-chat prompt, and append-only handshake receipt. |

Useful URLs:

- Frontend #197: <https://github.com/Ceragon-Prod/Frontend/pull/197>
- Installers #249: <https://github.com/Ceragon-Prod/Installers/pull/249>
- Installers #251: <https://github.com/Ceragon-Prod/Installers/pull/251>
- Installers #252: <https://github.com/Ceragon-Prod/Installers/pull/252>
- Installers #253: <https://github.com/Ceragon-Prod/Installers/pull/253>
- Installers #254: <https://github.com/Ceragon-Prod/Installers/pull/254>
- Installers #255: <https://github.com/Ceragon-Prod/Installers/pull/255>
- Installers #256: <https://github.com/Ceragon-Prod/Installers/pull/256>

## 5. What Wave 3 implemented, in plain English

### Tasks 1–3: make the scorer tell the truth

Before this work, a class could appear to have perfect recall because it had zero attack examples,
and false-positive denominators were shared across classes that never saw the same inputs. The new
scorer:

- has a real in-memory defeat harness;
- rejects mixed measurement lanes;
- gives each class only the benign and attack opportunities from surfaces where its producer can
  actually run;
- emits absent/UNKNOWN rates for absent denominators instead of numeric zero;
- inventories the live producer union (105 rows in this branch), including classes missing from the
  frozen 55-class spine;
- makes wrong-surface, forged, exhausted, or unexecutable cases errors rather than passes.

Tasks 4 and 5 are intentionally moved to Wave 3B. Mandatory engine-version capture and the complete
system-under-test tuple are inherited exit conditions, not work that Wave 3 pretends to close.

### Task 6: measure whether content was actually inspectable

The DLP and tool-risk engines now expose resource-budget/completeness facts. The OpenAI response path
consumes degraded inspection and enters a sticky fail-closed hold for malformed, truncated,
unreconciled, or otherwise uninspectable authoritative response streams. The instrumentation does
not falsely claim that all dimensions are enforced.

Measured current truth at the final head:

- prompt EGRESS report: 0 complete / 12 degraded;
- auxiliary DLP EGRESS report: 0 complete / 27 degraded;
- INGRESS: 0 complete / 28 degraded;
- DLP package-wide total bytes/items/wall work remains unproven;
- tool-risk parser item and wall-clock bounds remain unproven.

Those facts invalidate a clean rate; they are not a reason to hide the counts.

### Task 7: record per-class live opportunities without changing behavior

The daemon now keeps local-only rows keyed by `(lane, classId)`, including eligible opportunities,
active/candidate triggers, agreements, deltas, UNKNOWN/dropped counts, bounded hashed session and
endpoint cardinality, windows, runner/provenance/cohort identity, inspection status, lifecycle, and a
bounded sample list.

Important safety properties:

- producer-owned eligibility is derived from the live tool-risk tables;
- clean applicable calls advance the denominator;
- irrelevant/unknown tools do not invent opportunities;
- invalid/cohort-mismatched observations never enter the eligible denominator;
- new samples are dropped at the 500-sample cap; old history is never evicted;
- session/endpoint identity sets cap at 1,024 per row and saturation increments UNKNOWN/dropped;
- the store validates duplicate rows, canonical lanes/classes/identities, digests, lifecycle/catalog
  truth, counters, windows, samples, caps, and identity cardinality;
- rows are batched under one lock and one persistence write per tool call;
- the shadow is behavior-invariant when armed, disarmed, or broken.

The final review added a durable persistence contract. Before a store replacement the daemon writes
an atomic private incomplete-write sidecar. It clears that sidecar only after the store is atomically
replaced. A crash, failed save, failed marker clear, restart, or independent read while that marker
exists is terminal UNKNOWN; an old valid prefix can no longer masquerade as a lossless suffix.

### Task 8: declare four separate evidence lanes

The registry declares seven interpretation axes for each lane: eligibility, denominator,
candidate/active decision, user-visible outcome, security outcome, runtime/version cohort, and
freshness.

| Lane | Current denominator/evidence | Honest status |
|---|---|---|
| A — prompt egress | `surface=promptrisk`, 6 benign / 5 attack in the sealed EGRESS corpus | Measured counts, but final report UNKNOWN while inspection/coverage invalidations exist. |
| B — ingress/tool-result redaction | 18 benign / 8 attack | Measured counts, currently degraded; not certifying. |
| C — tool-call policy | Four public synthetic seed cases (2 benign / 2 attack) | UNKNOWN: no frozen TOOL catalog rows, partial tuple, degraded/unbounded dimensions, no certifying replay corpus. |
| D — LLM code-scanner advisory | No `neutraleval` execution | NOT_INSTRUMENTED; Wave 7B plus vendor model/system-prompt artifacts own it. |

The complete-stack review caught that lane A was overwritten with all same-lane DLP plus prompt
labels (23/12). The scorer now filters actual execution, results, totals, and detector accumulation
through the selected surface seam. The official prompt artifact contains 12 prompt-risk cases and
reports exactly 6/5 for lane A. DLP runs separately as an explicitly auxiliary 27-case report with a
17/7 denominator; it is never folded into lane A.

### Task 9: create the report and executable promotion predicate

`cmd/ai-lane-shadow-report` reads the local store, validates it independently, writes deterministic
per-class JSON, and exports one promotion predicate. A class cannot promote if the report/store is
invalid, stale, lossy, mixed, unversioned, uncataloged, incomplete, degraded, UNKNOWN, or has a
developer-visible delta.

The nightly/manual workflow adds no push or pull-request trigger. The TOOL report now runs before the
currently fallible corpus-seed/scoring chain, and artifact upload remains `if: always()`. A hosted
runner with no endpoint store publishes UNKNOWN rather than zero or clean.

### Task 10: make invalidity terminal

One shared function is called by both holdout and lane-shadow producers. Exactly eight triggers force
terminal UNKNOWN:

1. dropped evidence;
2. any store error;
3. detector-catalog digest mismatch;
4. version/system-tuple mismatch inside one report;
5. stale or materially future window;
6. mixed lanes;
7. any zero eligible class denominator;
8. degraded inspection.

`InvalidationResult.Rate` is the only route to a derived rate. Unless status is explicitly VALID and
the denominator is positive, it returns no number. An UNKNOWN JSON artifact keeps diagnostic counts
but omits detector FP/FN rates, aggregate interruption/recall rates, and inspection uncertainty. The
human summary leads with UNKNOWN and its reasons and prints no number.

Task 11 remains with Wave −1 Task 5. The owner has not authorized restoring paid push/PR triggers.

## 6. Verification evidence

### Exact behavior/parity guard

P9's immutable local-decision replay was never regenerated. At the final Wave 3 source head it reports:

```text
strict=2717 drifted=0 tool=125
```

That is 2,842 recorded daemon decisions with zero drift. If a later detector/disposition change makes
it red, inspect the row diff as a behavioral changelog. Regenerate only from a pristine worktree at
the commit immediately before the intentional semantic change, never from the changed tree.

### TDD and defeat evidence

- Task 7: early-returning on agreement loses eligible opportunities and makes the denominator defeat
  red; corrupt history, invalid identity/cohort, cap overflow, and behavior-invariance defeats pass.
- Task 8: a zero denominator for NOT_INSTRUMENTED lane D fails; exact official lane A is 6/5.
- Task 9: ignoring `dropped=3` makes promotion incorrectly pass and its named defeat red.
- Task 10: eight table rows prove eight distinct invalidation reasons; removing any trigger makes only
  its row red; a zero-value/UNKNOWN result cannot be coerced to 0.8.
- Final review defeat: an UNKNOWN tool artifact previously serialized rate keys. It now serializes
  none.
- Final review defeat: a same-lane DLP+prompt in-memory corpus previously published the whole 3/2 as
  the prompt seam; it now publishes prompt-only 1/1.
- Final review defeat: a valid store prefix plus a forced next-save failure survives restart as a
  durable store error and zero reportable rows.
- Workflow defeat: the TOOL report step must occur before the seed check and upload must be
  `if: always()`.

### Gates

- Focused command/report/neutraleval/daemon/aipolicycontract/localdecide suites: PASS.
- Relevant and full `go vet ./...`: PASS.
- C04 inertness guard: PASS.
- Exact official holdout reproduction after fixes:

```text
status=UNKNOWN
reasons=zero-eligible-denominator,degraded-inspection
caseCount=12 results=12
laneSeam benign=6 attack=5
surfaces=promptrisk
inspection complete=0 degraded=12
detector rate keys=0
aggregate rate keys=0
inspection uncertainty key absent
```

The separate auxiliary DLP reproduction is also `UNKNOWN`: `caseCount=27`, `results=27`,
`surfaces=dlp`, denominator `17/7`, inspection `0/27`, and no derived rate keys.

- Full repository `go test ./... -count=1`: **PASS** at exact head
  `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`.
- Final independent complete-stack review: **APPROVED** at exact head
  `44d86b58d02ec51cf8657cf6a652b7f936f0c8cf`; all four prior blockers were resolved.

## 7. What is still UNKNOWN or externally blocked

Wave 3 repaired the ruler. It did not manufacture the population needed to make strong claims.

### Measurement/corpus blockers

- TOOL's certifying benign denominator is not four synthetic cases. Wave 3B owns a consented,
  de-duplicated, six-stratum programme of 29,956 zero-error enforcing-eligible opportunities for the
  Tier-A bound. This is an operational data programme measured in months.
- The frozen detector spine has no TOOL classes. Current tool rows are intentionally `UNCATALOGED`,
  `PARTIAL_WAVE3B_PENDING`, `BUDGET_EXCEEDED`, and unpromotable.
- The committed ingress corpus is stale relative to the current generator. On this host,
  `go run ./cmd/ai-security-holdout-seed --check` exits nonzero. Do not overwrite it blindly: inspect
  the deterministic diff in an isolated worktree and reconcile ownership/labels.
- Docker Desktop was unavailable here, so the exact workspace Docker mirror
  `node ci/lib/run.mjs Installers holdout-score:score` was not completed at the final head.
- Lane D needs exact enabled Anthropic/Gemini model and system-prompt versions and Wave 7B's scanner
  evidence programme.
- Wave 3B must still add mandatory engine version, the complete system tuple, six-suite registry,
  contamination/near-duplicate rules, immutable regression index, two-labeler adjudication, and
  cross-lane refusal coverage.

### GitHub/account blockers

- Frontend #197's required Vercel check fails because the private organization is attached to a Hobby
  account. Do not use an administrator bypass. The owner/account administrator must resolve billing
  or supply an explicitly approved alternative required-check decision.
- The owner has not authorized a paid push/pull-request trigger for `holdout-score.yml`; nightly and
  manual dispatch remain the recorded choice.

### Product/certificate blockers

- No artifact supports “zero false positives.”
- No artifact supports a 9+ score on all five risks.
- R1–R5 remain subject to the later residual, corpus, scanner, enforcement, key-custody, live-canary,
  and certificate work named in the roadmap.
- `ingress.enabled=false` is still a whole-lane bypass owned by Wave 4C.
- F16 non-exportable endpoint signing-key custody remains an external design/procurement/key-ceremony
  dependency.
- Merge is not deployment; source proof is not production proof.

## 8. Safe continuation on the coworker's machine

### Fetch without touching a dirty checkout

Use clean clones or dedicated worktrees. Example PowerShell sequence after cloning/finding the repos:

```powershell
cd C:\path\to\Ceragon
git fetch origin --prune

cd C:\path\to\Installers
git fetch origin --prune
gh pr view 256 --json state,isDraft,mergeable,mergeStateStatus,headRefName,headRefOid,baseRefName,statusCheckRollup,url
git worktree add C:\cwt\p47-w3-review origin/codex/p47-w3-t10-invalidation
cd C:\cwt\p47-w3-review
git status --short --branch
```

Do not run `git reset --hard`, `git clean`, `git checkout --` on the owner's shared workspace, or
stage everything with `git add -A`.

### Reproduce the exact source gates

```powershell
cd C:\cwt\p47-w3-review
go test ./... -count=1
go vet ./...
go test ./internal/aipolicycontract -run TestPackageRemainsInertOutsideItsOwnToolingTree -count=1
go test ./internal/localdecide -run TestExtractedCoreReproducesTheDaemonDecisionsExactly -count=1 -v
go run ./cmd/ai-security-holdout-seed --check
```

Expected golden line is exactly `strict=2717 drifted=0 tool=125`.

The seed check is expected to expose the inherited stale-ingress issue until reconciled. Do not call
that green, and do not regenerate from a dirty or semantically changed tree just to make it pass.

### Use the VM for the missing Docker/workspace proof

On a disposable VM with Docker available:

1. Fetch the exact PR #256 head and verify its SHA.
2. Clone/fetch the root workspace so its `ci/lib/run.mjs` and component layout match the plan.
3. Run `node ci/lib/run.mjs Installers holdout-score:score`.
4. Preserve the failing stage and artifacts. If the stale ingress seed is the only failure, inspect
   the generated diff; do not hand-edit case digests or labels.
5. Run the TOOL report separately with no store and verify it creates an UNKNOWN JSON artifact.
6. If a real local endpoint store is supplied, copy it from a consented disposable test endpoint;
   never upload customer prompts, tool inputs, raw session ids, or secret content.

### Disposable PostgreSQL proof, when later Backend work needs it

The coworker's VMs can run PostgreSQL 16 bound only to loopback on a nonstandard port. Create a fresh
test-only database/user/password and do not put the credential in Git or this handoff.

Set:

```text
NODE_ENV=test
DATABASE_SSL=false
ALLOW_TYPEORM_SYNCHRONIZE=false
RUN_INTEGRATION_TESTS=true
RUN_LIVE_PG_TESTS=true
REQUIRE_LIVE_PG=true
```

Set `ALLOW_TEST_DB_SCHEMA_SYNC=true` only for `npm run testdb:prepare-live-pg`, then unset it for the
actual suites. Require the reporter to say the live suites executed with zero skips. Never point the
preparer, cleanup, or defeat mutation at RDS, production, a shared database, or a non-loopback host.

## 9. Merge choreography after the external gate is fixed

Do not start by merging #256. Work from the bottom dependency upward:

1. Fetch and re-read Frontend #197 exact head/checks. Resolve the Vercel account gate without bypass.
2. Re-run its exact source tests. Merge #197 only if required checks are green and the source approval
   still applies to that exact head.
3. Re-fetch Installers #249, verify its consumer lock still pins the approved Frontend/Installers
   source pair, rerun its documented gates, then merge #249.
4. For each of #251, #252, #253, #254, #255, and #256 in order:
   - fetch;
   - verify base/head SHA and mergeability;
   - resolve any `main` movement by rebasing the whole remaining stack, never by dropping commits;
   - rerun the task's focused defeats plus full Go test/vet at the final stack head;
   - obtain a new exact-SHA review if the head changes;
   - mark ready and merge only after its base is present on `main`.
5. After each merge, rebase/retarget the next PR to the new `main` only if GitHub does not do so
   cleanly. Keep one task per PR and preserve the test history in the body.
6. Pull the final Installers `main` into a fresh worktree and run full tests, vet, inertness, golden,
   seed check, and the VM Docker mirror.
7. Do not release an agent merely because the source stack merged. Follow the combined P9/P47 release
   protocol, post exact combined SHAs to the handshake, run required workflows on exact `main`, wait
   for the parallel programme's response, and ask the owner freshly.

If the external gate is still unresolved, leave the PR stack open and move to dependency-safe Wave
3B planning/implementation that does not require claiming the Wave 3 merge. Never rewrite history to
create a cosmetic “merged” state.

## 10. Exact next programme work: Wave 3B

After the Wave 3 stack is merged—or while it is open, only where dependency-safe—the next stage is
`v2-waves/w3b_corpus_governance.md`.

Start by reading the entire file, then execute its ordering rather than cherry-picking interesting
tasks. The key outcomes are:

- make engine version mandatory;
- complete RunnerIdentity/ResultProvenance with all declared system-under-test axes;
- define one evidence manifest and six-suite registry before any later wave invents exit numbers;
- enforce semantic-cluster/near-duplicate contamination rules before splitting;
- create append-only canonical regression and transform indexes;
- build legitimate benign, attack, E2E, private, and incident corpora with provenance and consent;
- require two-labeler adjudication for promotion evidence;
- add all registered lane-pair mixing defeats;
- widen TOOL catalog membership only through the upstream shared-contract generator and coordinated
  Backend-before-agent re-vendoring—never by hand-editing JCS or special-casing the scorer.

Wave 3B is not permission to collect customer data. The 29,956-opportunity programme requires
consent, retention/redaction rules, owner assignment, and enough time. Synthetic mutations or retries
from one semantic base case do not count as independent opportunities.

## 11. P9 / parallel-programme landmines

Read the newest `.plans/PARALLEL_HANDSHAKE.md` entries before every shared-file edit.

- Authoritative prompt/tool decision bodies live in `internal/localdecide`; daemon handlers delegate.
- The 2,842-decision golden is a behavior contract, not an annoyance. Never regenerate it to hide a
  detector change.
- P9's aicanary fix is per-call-site bounded grace. Do not restore P47's discarded shared `WaitDelay`
  increase.
- P47 owns which detector classes exist and what they fire on. P9 may widen generated projection
  fields under its recorded seam without changing frozen membership. Post any intentional new
  `DetectorCatalogDigest`.
- The frozen consumer identity at the earlier coordination point was digest prefix `b252ee02`, 55
  classes, four hard-stop-eligible classes. Re-read the full current pin; do not compare prefixes.
- `PARALLEL_HANDSHAKE.md`, live-proof registers, and other named ledgers are append-only. Do not
  reorder or rewrite history.
- Shared-file ownership and Backend migration timestamps require an explicit handshake claim/seam.
- Deployment/release combines both programmes' payloads. Post the exact list and wait for the other
  programme before asking the owner.

## 12. Security and authority boundaries

This handoff grants no permission to:

- deploy Backend or workers;
- publish/release an installer or agent;
- mutate AWS, ECS, IAM, RDS, task definitions, service desired counts, queues, secrets, or logs;
- change Vercel billing or required checks;
- create GitHub/AWS/Vercel secrets;
- upload local endpoint evidence containing customer/company content;
- weaken fail-closed tests, delete a failing gate, or mark a draft ready without exact-head review.

Fresh owner authorization is required for each deployment, release, billing, cloud, or live-canary
action. Read-only remote/production inventory does not authorize mutation.

## 13. Required reading order for a fresh agent

Read completely, in this order:

1. `.plans/m47a-20260822/P47_WAVE3_HANDOFF_2026-08-30.md`
2. `.plans/m47a-20260822/P47_WAVE3_FRESH_CHAT_PROMPT_2026-08-30.md`
3. `.plans/m47a-20260822/v2-waves/W3_RUN_LOG.md`
4. `.plans/m47a-20260822/P47_EXECUTION_GUARDRAIL.md`
5. `.plans/PARALLEL_EXECUTION_CONTRACT.md`
6. `.plans/PARALLEL_HANDSHAKE.md`, newest entries at the bottom
7. `.plans/m47a-20260822/v2-waves/00_spine.md`, especially O-1 through O-19
8. `.plans/m47a-20260822/v2-waves/w3_measurement_substrate.md`
9. `.plans/m47a-20260822/v2-waves/w3b_corpus_governance.md`

Then inspect the exact PR chain and source; documents are a map, not a substitute for current GitHub
state.

## 14. Separate work deliberately not claimed here

The older Installer, AI control plane, AWS infrastructure, data flows, code security, supply chain,
and MCP/IDE extension Source-of-Truth documents were not fully modernized by this Wave 3 pass. Some
historical worktrees or notes may exist locally, but they were not audited to the owner's requested
standard and are not silently included in these claims.

Treat SOT modernization as its own multi-repository evidence programme with redacted read-only AWS
inventory. Do not tell the owner those SOTs are current because this roadmap/handoff is current.
