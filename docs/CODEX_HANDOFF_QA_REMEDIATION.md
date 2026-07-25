# QA Remediation Continuation Handoff

Date: 2026-07-26 (Asia/Jerusalem)

## Objective

Continue the locked M4.5–M4.7 QA remediation plan from the published checkpoint. Do not redesign the plan or repeat completed work.

## Read first

1. `docs/Devoid_M45_M47_QA_Remediation_PLAN.md` — locked source plan and acceptance checklist.
2. This handoff — completed scope, merge points, remaining work, and integration warnings.
3. Each component repository's `AGENTS.md` / `CLAUDE.md` before editing.

The workspace is a collection of separate repositories. Run commands from the component being changed.

## Published baseline

The remediation checkpoint is merged and available from the default branch of each production code repository:

| Repository | Pull request | Merge commit |
|---|---|---|
| Frontend (`main`) | https://github.com/Ceragon-Prod/Frontend/pull/130 | `3f77e9c80da8d865e78cd37fe2adca73c0446816` |
| Backend (`main`) | https://github.com/Ceragon-Prod/Backend/pull/209 | `9d52f3f2d62950d33a261dfb857faa9792df2706` |
| Installers (`main`) | https://github.com/Ceragon-Prod/Installers/pull/132 | `6ce7e6184e10791f4879e0ef4a473f5bfd8f51c6` |

Pull those default branches before continuing. The plan and this handoff live in `DorStachy/Ceragon` on its default branch, `master` (not `main`).

## Completed at this checkpoint

- Backend preserves warning/disposition truth, structured findings, canonical event types, allowlisted approval metadata, endpoint-report assurance, and intended/actual effects. Hostname is no longer fabricated as username.
- Frontend uses one disposition presentation model, renders sanitized tool/command shapes, distinguishes pending/inconclusive outcomes, removes duplicate hostname identity, and includes the client side of server-wide Event Search.
- Browser enforcement consumes live policy and daemon-authoritative verdicts, records one UUID-linked event per send, preserves paste-redaction truth, and reports trusted `RELEASED_ONCE` facts without fabricating an approver.
- Go agent evidence preserves thread identity, carries privacy-safe command shapes/tool correlation, and attaches four-axis receipts to daemon-owned terminal events instead of emitting a new standalone receipt row.
- Installers browser and Go changes were conflict-resolved into one integration branch before PR #132. The integration retained both `dataDisposition`/approval truth and title/warning/tool/receipt truth.

## Validation completed

- Frontend: TypeScript, targeted ESLint, 19 Events/Pagination tests, and the earlier focused session/timeline suites passed.
- Backend: focused suites (194 + 35 contract/parity; later 254 focused tests), full build, and shared-contract build/check/probe passed.
- Installers: repository-wide `go test ./...` ran. It exposed two stale corpus-count assertions and two merged test call signatures; those were corrected, and `internal/daemon` plus `internal/neutraleval` reran green.
- Browser extension: production build passed; full test suite passed `951/951`.

CI note at merge time: Frontend's external Vercel check failed only because a private organization repository cannot deploy on the linked Hobby plan; its npm audit passed. Several Backend live-Postgres jobs and the Installers Windows job were still running when the normal, non-admin merges completed. Check the three PR pages before treating CI as fully settled.

## Next work, in order

1. **Finish Backend W5 before relying on the new Event Search UI.** Add `q`, `hostname`, joined `endpointHostname`, `totalIsEstimate`, and exact-event/`seqNum` addressability. The merged Frontend already sends `q` and `hostname`; Backend's whitelist currently does not accept them, so do not call that UI slice complete until the API lands.
2. **Severity and triage truth.** Derive severity plus `severityBasis`; add the triage state model/transitions, mandatory reason, note/activity log, and seconds-based timing metrics from the plan.
3. **Finish agent evidence gaps.** Backend DTO/write paths still need `toolUseId`, `commandShape`, and top-level `toolName`, with atomic four-axis receipt persistence for direct tool/check events. Resolve `/clear` continuity; current hook payload lacks parent-session identity. `FULL_WITH_APPROVAL`/preview behavior remains untouched.
4. **Finish browser UX and enforcement breadth.** Modal, toolbar badge/icons, generic detector/default block behavior, and remaining provider-level live E2E are not done. Legacy F01/browser standalone receipt rows still need review.
5. **Complete Codex parity.** Install lifecycle/prompt gates, report permission decisions, solve the desktop profile, and prove deny semantics live; Codex fail-open behavior differs from Claude Code.
6. **Detections remains gated.** Do not implement the Detections surface until the owner explicitly approves mockups. After approval, implement exact-event links, non-allow/finding rows, outcome/severity/triage/grouping, and remove standalone receipt rows from analyst surfaces.
7. **Final operational proof.** Run the plan's six-provider live E2E, fresh agent/extension build-and-install tests, then request explicit authorization before deployment, purge, or destructive cutover.

## Important cautions

- The Frontend Event Search contract is ahead of the Backend API until W5 lands.
- Do not resurrect `username ?? deviceName`, page-local search, exact pagination from capped totals, or standalone receipt rows.
- Do not fabricate `approvedBy`. The browser flow has trusted `approvedAt` and `approvalSurface: BROWSER_EXTENSION`, but no genuine approver identity.
- Preserve user changes in the original dirty workspace. Use isolated worktrees and explicit staging.
- No deployment, tenant mutation, historical purge, or live-policy cutover was performed in this checkpoint.

## Suggested skills

- `diagnose` for live provider, daemon, or CI failures.
- `frontend-testing-best-practices` for Event Search and exact-event E2E coverage.
- `code-review-excellence` before the final cutover review.
- `ui-ux-pro-max` only after mockup approval for Detections/modal work.

## Suggested first session

Pull all four default branches, verify the three code PR checks have settled, then implement Backend W5 as one vertical slice with DTO validation, SQL/query coverage, response projection, and Frontend integration tests. Re-run the Events tests against the real API contract before moving to triage.
