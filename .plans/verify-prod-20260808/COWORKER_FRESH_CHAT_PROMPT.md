# Fresh-chat prompt — continue Ceragon remediation Wave 1

Copy everything below the line into a new Codex task.

---

You are continuing a production defect-remediation programme for the DeVoid/Ceragon security platform. Do not start from memory and do not reimplement completed work.

First, obtain the current repositories:

- plan/handoff: `DorStachy/Ceragon`, branch `master`
- Backend: `Ceragon-Prod/Backend`, branch `main`
- Frontend: `Ceragon-Prod/Frontend`, branch `main`
- Installers: `Ceragon-Prod/Installers`, branch `main`
- Intelligence: `Ceragon-Prod/Ceragon-Intelligence`, branch `main`
- source-of-truth docs: `Ceragon-Prod/docs`, branch `main`

If a repository already exists locally, do not mutate a dirty shared checkout. Fetch its remote and create a fresh worktree from the current remote base. If it does not exist, clone it into an approved workspace. Confirm `gh auth status` before GitHub operations.

Read these files completely, in order:

1. `.plans/verify-prod-20260808/HANDOFF_20260809.md`
2. `.plans/verify-prod-20260808/IMPLEMENTATION_PLAN.md`
3. `.plans/verify-prod-20260808/fix-specs/READ-THIS-FIRST.md`
4. The relevant finding spec
5. Each repository's `AGENTS.md`

Current completed state:

- F24 is merged in Backend PR #240, merge `cb5dbf9827a20ec826657720289e588cc5484679`.
- F25 is merged in Backend PR #241, merge `1d9b5d15abcdc11a5b9c8e46bfe30f75bbe3a28f`.
- The seven refreshed SOTs are merged in docs PR #145, merge `bb7a349b8dbddaa0c2015fdf93d1395ea250a026`.
- Wave 1 is 2/13 complete. No application deployment or post-merge production rollout verification has been claimed; the SOT refresh did include a dated read-only AWS inventory inspection.

Proceed with the remaining Wave 1 work one finding and one PR at a time. Start with **F12 build identity** unless current `origin/main`, an open PR, or the handoff shows it has already landed. After F12, the safe independent order is F19, F13, then F17. Re-read remote state before every branch so you never duplicate another person's work.

Before shared-file work, obey these gates:

- M2/F27+F32 backend must land before F26 and before Design T-L13.
- F8b + F41 must be one coordinated constants edit.
- F36 frontend render belongs to the Design plan.
- Obtain the current local Design plan before crossing a Design coordination gate.
- F11 has an unresolved planner contradiction; stop and request a decision instead of guessing.

Critical F10 correction: `ApproximateAgeOfOldestMessage` is a CloudWatch SQS metric, not a `GetQueueAttributes` attribute. Re-derive F10 using official AWS API semantics, specify measurement lag/freshness/`NOT_MEASURED`, and add the correct IAM before coding. Do not implement the older spec literally.

Non-negotiable invariants:

- Do not set `forbidUnknownValues` on the global Nest `AgentIngestValidationPipe`.
- Keep F25 per-item options isolated.
- Keep evidence rejection tombstones content-free and transactional.
- Never advance a signed contiguous floor across a missing sequence.
- Old agents still cannot drain rejected-only batches; that residual belongs to Wave 4.
- Do not hand-edit digest-pinned generated security types; regenerate them.
- AWS actions are read-only unless a separate approved ops step explicitly authorizes mutation.

Implementation discipline:

- Use CodeGraph first for structural questions, then inspect only the surfaced files.
- Use TDD: show an observed-red regression/defeat test before implementation, then focused green evidence.
- For DB claims, use a fresh disposable Postgres; never point destructive integration tests at a shared E2E or production database.
- Run relevant focused tests, build/typecheck/lint, and fixed-point review.
- Stage explicit files only; never `git add -A` in a shared workspace.
- Push one focused branch and create one PR per finding. Merge only after required checks and independent review are green.
- Update `.plans/verify-prod-20260808/HANDOFF_20260809.md` after every merged package so the next task can continue without archaeology.

Suggested skills: `diagnose`, `tdd`, `review`, `supabase-postgres-best-practices`, `github:gh-address-comments`, `github:yeet`, and `handoff`.

Begin now by checking GitHub for already-open or newly merged F12 work, fetching the current Backend `origin/main`, and creating a clean F12 worktree if no duplicate exists. Continue autonomously within the plan's authority, but stop at the named planner and cross-wave coordination gates.
