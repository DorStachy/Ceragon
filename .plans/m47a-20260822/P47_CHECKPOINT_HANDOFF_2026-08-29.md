# P47 / M4.7A checkpoint handoff — 2026-08-29

This is the operational handoff for the next engineer and the next fresh agent session. It records
what is actually merged, what is technically implemented but unmerged, what is blocked, and the
exact safe place to resume. It is deliberately credential-free.

## 1. Executive state

The programme is **not finished**. The clean checkpoint is:

- Wave −1 has a merged root evidence foundation, but its Frontend trigger-decision half remains open.
- Wave 0 has three source PRs merged; live AWS mutation and live verification remain owner-gated.
- Wave 0A is technically approved but intentionally unmerged pending an owner decision on one missing
  Docker mirror proof. No agent release occurred.
- Wave 1's Installers producer and Backend authority are merged. Its Frontend governance UI remains
  open because the repository's only GitHub context is a Vercel private-organization Hobby billing
  failure. The root three-repository parity gate is merged.
- Wave 2 has several completed source slices, but the wave is not complete and no Wave 4 enforcement
  work may start. Backend Task 1 and the Installers half of Task 6 are merged. Frontend Tasks 1, 3,
  and the Task 6 consumer are source-approved but Vercel-blocked. Task 2 is technically green and
  open as Backend PR #300, but must not merge until P9 grants one additive edit to its owned DTO.
- Waves 3 through 8 remain to be implemented under their ordering and owner gates.

Do not report this as “almost done,” “9+,” “zero false positives,” or certified. The plan's claim
contract, Wave 3/3B denominators, live proof, and Wave 8 certificate decide what can be said.

## 2. Authoritative reading order

Read these before touching code, in this order:

1. `.plans/m47a-20260822/P47_EXECUTION_GUARDRAIL.md`
2. `.plans/PARALLEL_EXECUTION_CONTRACT.md`
3. `.plans/PARALLEL_HANDSHAKE.md` — newest entries are at the bottom
4. `.plans/m47a-20260822/v2-waves/00_spine.md` — especially O-1 through O-19
5. `.plans/m47a-20260822/v2-waves/w2_evidence_severity.md` — current active wave
6. The later wave file only when its dependency gate is actually open

`M47A_IMPLEMENTATION_PLAN.md` is the assembled plan. The split files under `v2-waves/` are easier to
review and are authoritative for reconciled task text. `99_audit.md` and `99_reconciliation.md` are
history and rationale, not replacement checklists where they conflict with the reconciled wave.

## 3. Repositories are independent

This workspace is not one monorepo. The root repository carries plans and cross-repo gates; each
component has its own Git history and `main` branch. At this checkpoint, remote tips were:

| Repository | Default branch | Remote tip at checkpoint |
|---|---|---|
| root plans (`DorStachy/Ceragon`) | `master` | `a1d28532b4b1db843bf48d873f696614c234983c` before this handoff PR |
| Backend | `main` | `e6fde84572e345c485537b087e35782d186fc553` |
| Frontend | `main` | `fd15d8b9e80a93b2f913990dd2982157b01b5221` |
| Installers | `main` | `9c0f2e1e9e9cc0a71c034e307827d46fbc2eaf5a` |

Fetch each repository independently. On Windows, a safe starting sequence is:

```powershell
git -C C:\Users\Owner\Documents\Ceragon fetch origin
git -C C:\Users\Owner\Documents\Ceragon\Backend fetch origin
git -C C:\Users\Owner\Documents\Ceragon\Frontend fetch origin
git -C C:\Users\Owner\Documents\Ceragon\Installers fetch origin
git -C C:\Users\Owner\Documents\Ceragon\GithubApp-Bot-Scanner-Worker fetch origin
```

Do not pull or switch the existing shared checkout: it may be dirty or on an unrelated feature
branch. Read the newly fetched handoff from a disposable root worktree, and create each task branch
directly from its fetched remote default branch. For example (choose unused paths and branch names):

```powershell
git -C C:\Users\Owner\Documents\Ceragon worktree add --detach C:\cwt\p47-handoff-read origin/master
git -C C:\Users\Owner\Documents\Ceragon\Backend worktree add -b p47/w2-t6-backend C:\cwt\p47-w2-t6-backend origin/main
```

Never use `git stash`; it is shared across worktrees. Before creating a named task branch, verify
that the name is unused locally and remotely.

## 4. Merged P47 work

### Wave −1 / root foundation

- Root PR #10 is present on `master` as `be5c7ba` and establishes the Wave −1 evidence guards.
- Root PR #11 merged at `a1d28532b4b1db843bf48d873f696614c234983c`. It is the authoritative
  root parity gate for two vocabularies across three repositories.
- The root parity mutation harness passed 31/31 cases. The live split-worktree check passed
  2 vocabularies × 3 copies = 6 files.

### Wave 0 source work

- Scanner PR #42 merged at `2e33812`: committed task-definition privacy invariant and removal.
- Scanner PR #43 merged at `b4f6067`: isolated dependency-audit remediation.
- Scanner PR #44 merged from source tip `4dcbef8`: provider pre-egress assertion and Risk 1 input.
- These merges did not mutate production. The sanitized run log is
  `v2-waves/W0_RUN_LOG.md`.

### Wave 1

- Installers PR #229 merged at `1975585e64f76dccb31ef85ddaddc249af1e60d8`.
  It publishes all 81 DLP classes. Catalog digest:
  `sha256:6dd17f98d86eac0260e03abba61a06532d1a9c69c2ff81b059e4500ac2aebac6`.
- Backend PR #298 merged at `2551ec4fb9e967f7d793c44fd3d92f4b1f4f3b75` after exact-SHA review.
  New writes cannot disable DLP or prompt risk; legacy disabled rows remain editable and are raised
  only on the served clone. The full policy tree passed 73/73 suites, and the explicit live-Postgres
  boundary passed 11/11.
- Root PR #11, listed above, makes producer-only and consumer-only vocabulary drift visible across
  Installers, Backend, and Frontend.

### Wave 2

- Backend Task 1 PR #299 merged at `e6fde84572e345c485537b087e35782d186fc553`.
  Approved exact source SHA was `574b4bef6ab37e4850a40ce92ae722692fa59995`. It establishes the canonical
  `severityBasis` contract, removes the Backend duplicate, and pins reproducible committed dist.
- Installers Task 6 producer PR #246 merged at
  `9c0f2e1e9e9cc0a71c034e307827d46fbc2eaf5a`; approved source SHA was
  `9f76dae37a2d314976156853f031dcb4f136e52b`. It adds independent grades for all 40
  tool-risk classes. Evidence strength is 3 corroborated / 37 probable / 0 validated; all 40
  resolved consequences remain `unresolved`; `proposalKind` is absent; vector format is 3; the
  existing tier digest remains
  `sha256:2cc7caeff31a09169d5d947fddf805f5d1f4f7eddcfcc984be5f83e69d1af922`.

## 5. Implemented or approved, but not merged

### Installers PR #221 — Wave 0A

- URL: `https://github.com/Ceragon-Prod/Installers/pull/221`
- Exact SHA: `14e19b23faed4a74a5385fa35d4f1872daf0c592`
- Source verdict: independently approved.
- Evidence: affected gates, C12, the 2,842-decision golden with delta 0, vet, and clean paired
  performance are green.
- Blocker: Docker Desktop/WSL could not provide the final mirror run. The owner must explicitly
  accept that evidence exception or provide a capable host. Do not merge by pretending the proof ran.
- After merge, do not release automatically. The combined P9/P47 agent release needs a fresh owner
  ask, and the after-observation on a real enrolled endpoint remains required.

### Frontend PR #189 — Wave −1 trigger truth

- URL: `https://github.com/Ceragon-Prod/Frontend/pull/189`
- Exact SHA: `02650372562a3baa4fe2af75dffb85c3a8816cf9`
- Purpose: records the vendored-upstream pull-request trigger/spend decision without inventing a
  billing authorization.
- Blocker: Vercel private-organization Hobby billing check.

### Frontend PR #192 — Wave 1 console governance

- URL: `https://github.com/Ceragon-Prod/Frontend/pull/192`
- Exact SHA: `2535221dfa6f796f5338e586fbf5bbea4045e118`
- Source state: approved after closing the Block-by-default typed-confirmation bypass, including
  `chmod-broad-777` and `chmod-sensitive`.
- Blocker: sole Vercel context fails because a private organization repository cannot deploy on the
  configured Hobby plan.
- Separate owner dependency: `INSTALLERS_READ_TOKEN` is not configured, so the scheduled remote
  mirror reports NOT CHECKED. The merged root parity gate is still authoritative locally.

### Frontend PR #194 — Wave 2 Task 1 consumer

- URL: `https://github.com/Ceragon-Prod/Frontend/pull/194`
- Exact SHA: `da41d96efb4de0cec63be0fdbc1ef765b911e682`
- Independently approved. It consumes and renders the canonical `severityBasis` contract.
- Blocker: only the Vercel billing context.

### Frontend PR #195 — Wave 2 Task 6 tool-grade consumer

- URL: `https://github.com/Ceragon-Prod/Frontend/pull/195`
- Exact SHA: `def83544c1bb0f90c755a5b3a98e3480e5dfb11d`
- Independently approved. The vendored vector is byte-identical to the merged Installers producer.
- Blocker: only the Vercel billing context.

### Frontend PR #196 — Wave 2 Task 3 translator

- URL: `https://github.com/Ceragon-Prod/Frontend/pull/196`
- Exact SHA: `4f491caf0d95f7dba6871d6f7ef84ed417fc69b1`
- Independently approved after a real regression was found and fixed. The first version used a
  display sanitizer to compare wire tokens, allowing bidi/control-tainted lookalikes to collapse
  into a known severity. The fixed translator performs raw trim + lowercase + exact membership;
  bidi override, zero-width, and NUL-tainted values remain `unknown`.
- O-6 remains preserved: query/facet/bar continue consuming only the four-band subset. Task 4 has
  not been smuggled into this PR.
- Blocker: only the Vercel billing context.

### Backend PR #300 — Wave 2 Task 2 five-band server

- URL: `https://github.com/Ceragon-Prod/Backend/pull/300`
- Exact SHA: `898b6c951d80a5d47cf694e625db42f903c05000`
- Technical verdict: green and independently reviewed.
- Governance verdict: **BLOCKED; DO NOT MERGE YET.**
- It correctly widens the canonical tuple to `info`, `low`, `medium`, `high`, `critical`; admits and
  filters info; ranks it as 0; keeps unassessed `NULL` out of every band; returns five aggregate
  counts; and widens only the Postgres CHECK constraint without rewriting hash-covered rows.
- Proof: two consecutive shared-contract clean-build/reproducibility runs; packed-package and
  adversarial consumer gates; focused Jest 3/3; typecheck; migration lint; focused ESLint; real
  PostgreSQL suite 19/19 with 1 live suite executed and 0 skipped.
- Defeat proof: restoring the old four-band CHECK made the real info INSERT fail with
  `CHK_ai_events_severity`; restoring the current migration returned the suite to 19/19.
- One broad Backend run reported 220 suites passed, 37 gated skips, and one unrelated pre-existing
  parity failure in `coverage-posture-contract.snapshot.parity.spec.ts` naming
  `ai-security-policy/dlp-governance-gap.ts`. Do not hide this baseline red and do not fix it inside
  Task 2.
- Coordination blocker 1: `Backend/src/ai-governance/dto/ai-response.dto.ts` is P9-owned under the
  execution contract. The PR's additive `info: number` plus comment update needs an explicit P9 grant.
- Coordination blocker 2: migration `1793100000000` was the timestamp P9 told P47 to use, so no
  collision exists, but P47 failed to post the formal claim before writing it. This handoff PR posts
  the retroactive claim. That corrects the record but does not manufacture a P9 DTO grant.
- After the grant, re-review the exact source SHA plus the merged handshake state, then merge #300.
  Merge is not deployment. Task 4 remains blocked until a fresh owner-authorized production deploy
  succeeds and the **Deploy-to-ECS job**, not merely its workflow wrapper, is confirmed green.

## 6. Current Wave 2 ledger

### Task 1 — one severityBasis shape

- Backend is merged.
- Frontend PR #194 is approved but billing-blocked.
- Remaining: resolve the Vercel account gate, rebase/recheck if `main` moved, merge #194, and run the
  final single-declaration and tooltip exits.

### Task 2 — five Backend bands

- Source is implemented in #300 and technically proven.
- Remaining: P9 DTO grant, exact-SHA/docs re-review, source merge, then owner-authorized Backend
  deployment and Deploy-to-ECS job confirmation.
- Task 4 cannot start before that deployment.

### Task 3 — one read-time translator

- Implemented and approved in Frontend #196.
- Remaining: resolve Vercel billing and merge.
- Keep RunRiskBand and queue severities out of scope.

### Task 4 — fifth band in filter, bar, and row spine

- Not started and intentionally not startable before Task 2 is deployed.
- After the deploy, add Info to the query/facet/bar, URL serialization, CSS spine, and row meter.
- `readSeverityCounts` must return `null` on a four-member aggregate. Missing means NOT MEASURED,
  never zero.

### Task 5 — retire “confidence”

- Remaining in full.
- Rename the mechanism-tier symbols and customer copy without changing one preset action byte.
- Add the uncalibrated-confidence copy guard. Evidence strength and capability impact stay separate.

### Task 6 — three independent grades

- Installers producer is merged; Frontend consumer #195 is approved and open.
- Remaining Backend half: consume format 3, generate `dlp-classes-grades.v1.json`, build and pin
  `AI_EVENT_IMPACT_BY_CLASS`, cover the post-Wave-1 producer vocabularies, delete `BASE_BY_CLASS`,
  re-vendor byte-identically, and run root parity.
- Do not add `proposalKind`; Wave 4B owns it at format 4.

### Task 7 — grades cross both ingest lanes

- Remaining in full.
- P9 W8 Task 5's field-drop counter is merged but recorded as **not deployed**. Confirm current live
  state; do not assume it changed.
- Implement Backend DTO/storage/both controller mappers first, deploy Backend, and only then release
  agent finding/wire/fold changes. Agent first silently loses fields because whitelist stripping is
  lenient.
- Duplicate findings fold to the weakest evidence and false eligibility if any occurrence is false.

### Task 8 — neutral evidence mark

- Remaining after Tasks 6 and 7.
- Render evidence as an uncolored word beside impact. An ungraded row says `not graded`; it never
  becomes Weak and never carries `data-sev`.

### Task 9 — monitor concepts and taint attribution

- 9a, 9b, and 9c remain: disposition vocabulary docs, SHADOW-never-interrupts tool/taint gates, and
  structured taint reason.
- 9d is deliberately NOT_READY. “Monitoring alone is non-tainting” belongs to Wave 4B and requires a
  named Product/Security ratification plus paired benign-sequence precision and poisoned-sequence
  recall. Do not narrow it through code alone.

### Task 10 — no enforcement purely from detector severity

- Remaining in full.
- Authoritative decision bodies now live in `Installers/internal/localdecide`.
- Repoint tool fallback, Go/JS ladder twin, and prompt replay to the generated grade predicate; prove
  0/40 relax; keep weak/unknown evidence from blocking alone; correct the self-defense floor so an
  unspecified high finding follows fallback instead of being lowered to warn.
- Reconcile the 2,842-row P9 decision golden exactly as described in section 8 below.

### Wave 2 exit

Wave 2 exits only when all 18 numbered criteria in `w2_evidence_severity.md` have evidence. O-14
blocks all Wave 4 enforcement changes until then.

## 7. Later programme work

The details and defeat tests live in the named wave files; this is the navigation map.

- **Wave 3 — measurement substrate:** repair the scorer, per-class opportunity denominators,
  UNKNOWN-not-zero, inspection budgets, lane records, generated report, and shared invalidation.
  O-8: no promotion decision may use pre-Wave-3 numbers.
- **Wave 3B — corpus governance:** version the system under test; establish one report, six-suite
  registry, immutable regression/transform/benign/E2E/private/incident corpora, two-labeler
  adjudication, and vocabulary reconciliation. O-13: registry before 4A/4B/4C/7B exit claims.
- **Wave 4A — published residuals:** close DLP/prompt residuals and keep private-key posture decisions
  explicitly owner-blocked. Must precede 4C.
- **Wave 4B — tool/effect quality:** proposal vocabulary at vector v4, effect resolver, executed vs
  data context, effect-bound approval, delete `deriveCombos`, close C5/chmod gaps, catalog/D4
  totality, and evidence-gated taint narrowing. O-16: resolver before Wave 8 binding.
- **Wave 4C — prompt/ingress quality:** policy-aware measurement, byte provenance, unauthorized-effect
  truth, over-defense denominator, gated promotion, larger corpus, per-agent-surface reporting, and
  contracted adaptive red-team work. This wave owns the current `ingress.enabled=false` whole-lane
  bypass and its real HTTP/Postgres defeat proof.
- **Wave 5 — console truth:** render-harness gate, failed reads not empty fleet, honest counts and
  filters, endpoint-authored state, daemon 401 semantics, action-specific confirmations, vendored
  drift, and certificate null → NOT MEASURED.
- **Wave 6 — triage and learning:** persistent pagination, notes/assignees, Backend-before-Frontend
  bulk triage, identity-rich drawer, all AI queues, seven-state taxonomy, second reviewer,
  adjudication, detector/version/policy attribution, poisoning controls, storm threshold, and the
  autonomous-review boundary.
- **Wave 7A — scanner execution truth:** manifest and one verdict per lane. Deploy exactly action
  release tag → Backend → worker Task 6 → worker Task 7; inversion can fail every scan closed.
- **Wave 7B — scanner certification:** restore quality CI, strata, reachable twins, per-engine
  attribution, sealed injection corpus, signing proof, ecosystem TP contracts, and R2 certificate.
- **Wave 7C — containment:** pin platform routing and refuse execution when the sandbox cannot
  contain an untrusted package.
- **Wave 8 — authoritative enforcement/certificate:** sink inventory, widened approval binding,
  mediation of every effect-permitting sink, fail-open non-green state, P9 canary fix adoption,
  certificate schema/generator, controls mapping, rings/halt/rollback, live independent canaries,
  non-exportable signing keys, system card, and executable defeat matrix.

## 8. P9 coordination landmines

These are execution rules, not optional context.

1. **Ownership table first.** A technically correct edit to a P9-owned file is blocked until a seam
   is granted. Backend #300 is the current example.
2. **Decision golden.** P9 extracted prompt/tool decision logic into `internal/localdecide`. The
   golden replays 2,842 daemon decisions. Detector/disposition changes can turn it red. Treat the
   row diff as a behavioral changelog, inspect every moved row, and regenerate only from a pristine
   worktree at the commit immediately before the change—never from the changed tree. Post matched,
   skipped, and row-count deltas to the handshake.
3. **Canary fix ownership.** Do not raise a shared `WaitDelay` or restore P47's discarded design.
   P9 W6 Task 1 shipped bounded per-call-site I/O grace; cite and preserve it.
4. **Detector catalog.** P47 owns which classes exist and what fires. P9 may widen generated
   projection fields only under its recorded seam. Preserve the frozen consumer identity unless a
   semantic class change is intended; after regeneration, post the new `DetectorCatalogDigest`.
5. **Current catalog seam baseline.** Recorded pin: digest prefix `b252ee02`, class count 55,
   hard-stop-eligible count 4. Re-read the current full digest from the pin; do not rely on this
   abbreviated handoff value for a comparison.
6. **`ai_handlers.go`.** P47 owns it specially; P9 requests narrow behavior-neutral seams. The
   authoritative decision bodies are now delegated to `localdecide`, so find the actual source
   before editing.
7. **`neutraleval`.** P9's grant is only a narrow delegate to closed-world `localdecide` prompt
   decisions. It grants no detection/disposition authority and no plaintext capture.
8. **Append-only resources.** Live-proof register, Codex ledger, handshake, and `pr-checks.yml` must
   not be reformatted or reordered. Add one atomic entry/job.
9. **Backend migrations.** Claim timestamps in the handshake before writing; state if a migration is
   non-transactional. Do not renumber someone else's migration.
10. **Combined payloads.** A Backend deploy or agent release carries both programmes' merged work.
    Post the exact combined SHA list, wait for the other programme's pending/nothing response, run
    `pr-checks` and `security` on exact `main`, and ask the owner once.
11. **Known contract path typo.** The ownership table says two Frontend files end in `.ts`; they are
    `.tsx`. Match the basename stem until the table is corrected.
12. **Outstanding P9 ownership issue.** P9 disclosed 10 additive effect-assurance lines already on
    Backend main in P47-owned `ai-query.service.ts`. Do not silently normalize them. Record an
    explicit retro-grant or choose the offered revert/seam path in the handshake.
13. **Outstanding protection-depth seams.** Three `getProtectionDepth` seam requests remain open.
    Read the newest handshake before working on adjacent code.
14. **Frontend effect assurance.** P9 moved its declaration into a P9-owned file. Do not duplicate it
    into `Frontend/types/ai-governance.ts` without a fresh seam.

## 9. Product/security truths that must not be overclaimed

- The current 37-member malicious floor protects the lane-qualified `promptRisk` entry. It does not
  make the same class id safe on ingress.
- `ingress.enabled=false` is still a whole-lane bypass. Wave 4C owns the enable guard and live
  HTTP/Postgres proof. Ingress enforcement is NOT_READY.
- Wave 2's `evidenceStrength` is a declared grade, not calibrated statistical confidence.
- `resolvedConsequence` remains unresolved for tool classes until the Wave 4B resolver exists.
- Missing measurements are UNKNOWN, not zero.
- W0A source correctness does not prove released fleet behavior.
- Merged Backend source does not prove deployed schema/API behavior.
- No current artifact justifies a 9+ or zero-FP claim for all five risks.

## 10. Local PostgreSQL / VM proof

The prior session used disposable PostgreSQL 16 in Ubuntu WSL, bound only to `127.0.0.1` on a
nonstandard port. It was guarded as non-production, prepared through 245 migrations after Task 2,
and used no AWS/RDS connection. Its credential is intentionally omitted and should not be reused.

On the coworker's VM:

1. Provision a fresh disposable Postgres database and test-only user on loopback.
2. Choose a new local test password; do not copy one from a handoff or commit it.
3. Set `NODE_ENV=test`, loopback database host/port/user/name, `DATABASE_SSL=false`,
   `ALLOW_TYPEORM_SYNCHRONIZE=false`, `RUN_INTEGRATION_TESTS=true`, `RUN_LIVE_PG_TESTS=true`, and
   `REQUIRE_LIVE_PG=true`.
4. Set `ALLOW_TEST_DB_SCHEMA_SYNC=true` only for `npm run testdb:prepare-live-pg`; unset it for the
   actual suites.
5. Run the named `*.live-pg.spec.ts` with `REQUIRE_LIVE_PG=true` and verify the reporter says suites
   executed and zero skipped. A green container-less run is NOT-RUN.
6. Never point the preparer or destructive defeat mutation at production, RDS, a shared database,
   or a non-loopback host.

For Backend #300, the exact live suite is:

```powershell
npx jest src/ai-governance/services/ai-query.detections-aggregates.live-pg.spec.ts --runInBand
```

The coworker may need a local Jest/TypeScript config if `node_modules/@ceragon/shared-contracts`
points into another worktree. Do not commit such a harness; resolve it to the active worktree's
`packages/shared-contracts/dist` and delete it before staging.

## 11. Git and review discipline

- Fetch first and branch from `origin/main` (root uses `origin/master`).
- One dedicated worktree and branch per task under `C:\cwt`.
- `git add` explicit paths only; never `-A` in these noisy workspaces.
- Existing dirty files belong to the user or the parallel programme. Do not clean, reset, checkout,
  or overwrite them.
- Preserve RED → GREEN → defeat evidence in the PR body.
- Review exact immutable SHAs. If a finding is fixed, the old approval no longer applies.
- Merge source only after source, CI, and coordination gates pass.
- Do not deploy, release, create secrets, change billing, weaken branch checks, or mutate AWS without
  the named fresh owner authorization.

Recommended agent skills: `tdd` for implementation, `review` for exact-SHA review, `diagnose` for a
real failing gate, and `handoff` at the next checkpoint.

## 12. Owner-controlled blockers

The next engineer must surface these; code alone cannot close them:

- Vercel Pro/private-organization deployment billing for Frontend PRs #189, #192, #194, #195, #196.
- `INSTALLERS_READ_TOKEN` creation for the scheduled Frontend upstream mirror.
- P9 seam grant for Backend #300's additive `AiDetectionSeverityCountsDto.info` edit.
- Owner decision on W0A's missing Docker mirror evidence.
- Fresh authorization for every Backend deployment and agent release.
- Product/Security ratification for the later monitor→taint narrowing.
- Private-key posture decisions named by Wave 4A.
- Contracted adaptive red-team time and an eligible independent Codex measurement host.
- GitHub branch-protection capability, if the organization wants advisory CI to become enforcing.
- Non-exportable endpoint signing-key custody and live canary operations in Wave 8.
- Wave 0 AWS task-definition/IAM/service changes and power-on verification.

## 13. Exact next actions

1. Pull root `master` and all touched component `main` branches independently.
2. Read the newest appended handshake entries from this checkpoint.
3. Ask the P9 owner/session to grant exactly this Backend #300 seam: add `info: number` and update the
   immediately adjacent five-band/unassessed comments in `AiDetectionSeverityCountsDto`; no other
   P9-owned DTO change.
4. After the grant is committed to the handshake, re-review Backend #300 exact SHA
   `898b6c951d80a5d47cf694e625db42f903c05000` together with that docs state. If still clean, merge
   source only.
5. Do not deploy #300 until the combined Backend tip's `pr-checks` and `security` runs are present,
   the other programme confirms its payload, and the owner explicitly authorizes deployment.
6. Resolve the Frontend Vercel account gate. Re-run checks on current heads and merge the five P47
   Frontend PRs in dependency order: #189, #192, #194, #195, #196, unless `main` movement requires a
   rebase/fix. Do not admin-bypass the failing Vercel context.
7. If the owner accepts the W0A evidence exception, revalidate #221 at its exact SHA, merge, then use
   the serialized combined-release protocol. Otherwise run the missing mirror on the coworker's VM.
8. While owner gates are pending, continue dependency-safe Wave 2 work. The best next source task is
   the Backend half of Task 6, not Task 4 and not Task 7's agent half.
9. At each task boundary, update this four-state ledger and append the relevant handshake entry.

## 14. Scope not completed here

The user's earlier Source-of-Truth modernization request—Installer, AI control plane, AWS
infrastructure, data flows, code security, supply chain, and MCP/IDE protection—was not completed by
this P47 checkpoint. Some old SOT worktrees and partial docs exist locally, but they were not audited
to the standard requested and are not silently included in this merge. Treat that as a separate
programme after, or in parallel with, P47 using its own reviewed plan and redacted AWS evidence.

Do not tell the owner the SOTs are current merely because this roadmap and handoff are current.
