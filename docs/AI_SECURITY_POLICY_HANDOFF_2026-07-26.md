# AI Security Policy Redesign — Publication Checkpoint

Date: 2026-07-26

## Start here

Read these files in order before changing code:

1. `docs/AI_SECURITY_POLICY_HANDOFF_2026-07-25.md`
2. `docs/AI_SECURITY_POLICY_REDESIGN_PLAN_2026-07-25.md`
3. This checkpoint

The first two documents remain the source of truth for the problem, locked decisions D1-D6, execution order, environment traps, and definition of done. This file records only what changed at the publication checkpoint and what remains.

## Published work

| Repository | Base | Pull request | Key commits |
|---|---|---|---|
| `DorStachy/Ceragon` | `master` | https://github.com/DorStachy/Ceragon/pull/6 | `d366f5f`, `c659d95`, `7b2d5b9` |
| `Ceragon-Prod/Backend` | `main` | https://github.com/Ceragon-Prod/Backend/pull/210 | `edc5dc4`, `ca3e05c`, `2bf36c5` |
| `Ceragon-Prod/Installers` | `main` | https://github.com/Ceragon-Prod/Installers/pull/133 | `b0647ec`, `1cbae95` |

The contract publishes immutable portable artifact `0.4.1`, digest `sha256:29006c25daa64c557a21bd35f43f011a2de2502eeeb373219f818b86884f96d3`, and append-only event type `INGRESS_MONITORED`. Backend accepts that event, removing the production-400 blocker. Installer implements consistent Warn interruption/release semantics and Monitor evidence across the CLI, daemon, and browser extension.

## Verified evidence

- Contracts: portable artifact generation/digest verification and append-only tuple regression passed.
- Backend: TypeScript typecheck passed; AI-security suite 26 suites / 810 tests; governance 2 suites / 20 tests; portable reader 389 / 389; consumer and adversarial packed-consumer checks passed.
- Installer: `go test ./... -count=1` passed; browser 947 / 947; browser consumer check and production build passed.
- Worktrees were clean at publication. No dependency installation was run in a worktree.

## Hard release gate — D6

Code merge is safe because Backend deployment and Installer release workflows are manual. Do not build or release an agent that emits `INGRESS_MONITORED` until:

1. the contract is merged;
2. Backend is merged and deployed to production;
3. an authenticated production ingress probe proves `INGRESS_MONITORED` is accepted and persisted without a 400.

Only then may an Installer release/candidate be built. Record the Backend deployment identifier and probe evidence in the next handoff.

## Remaining implementation

Continue with plan section 6.3, then 6.4 and 6.5:

- 6.3: archive-first migration; remove obsolete stored-model paths; wire upload Monitor; implement locked `blockStyle` behavior; complete simulation behavior.
- 6.4: implement the two-axis baselines and their migrations/tests.
- 6.5: finish the risk-group Frontend and remaining agent/contract integration.
- Run live customer-path E2E against real Chrome, Claude Code, and local Docker; finish docs/roadmap; deploy and run production probes.

The redesign is not yet deploy-ready end to end. The commits above are verified increments, not completion of the full definition of done.

## Exact next steps

1. Confirm all three pull requests are merged and the default branches contain the key commits.
2. Deploy Backend from merged `main`; run and preserve the authenticated ingress probe required by D6.
3. Begin section 6.3 in fresh isolated worktrees created from updated default branches.
4. Do not cut an Installer candidate until step 2 is evidenced.
5. Re-run repository-local focused and full suites after each vertical slice; finish with the live E2E matrix in the plan.

## Environment traps

- Work only in isolated worktrees. The shared `Backend/` and `Installers/` checkouts may be in use by other sessions.
- Never run `npm install` or `npm ci` inside a worktree. Use the configured shared dependency runtime.
- The workspace root is not a monorepo and may contain unrelated dirty state; never stage from it.
- Windows checkout conversion can invalidate byte-pinned contract artifacts. Preserve explicit LF attributes and run the adversarial packed-consumer check after checkout/rebase.
- Preserve D1-D6 exactly; do not reinterpret Warn as Allow or Monitor, and do not release around D6.

## Suggested skills

- `tdd` for migrations and event-path slices.
- `diagnose` for hard integration or production-probe failures.
- `github:gh-fix-ci` if a pull-request check fails.
- `github:gh-address-comments` for review feedback.
- `ui-ux-pro-max` and `vercel-react-best-practices` for the remaining Frontend redesign.
- `handoff` before the next context transfer.
