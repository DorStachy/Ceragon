| repository | integration branch | before -> after | conflicts | verification on the merged tree |
|---|---|---|---|---|
| Backend | `p47/integration-backend` | 1ff37f3f -> 6453bc02 (9 commits) | 1: `src/common/errors/error-code.ts`, both sides appended codes; both kept. Git hoisted the shared `/**` line above the block, so a naive concatenation dropped one comment opener; caught by tsc, fixed, amended | tsc clean; jest on src/agents, src/common, src/auth, src/audit, the bundle service spec and the contracts guard: 107 suites, 1,588 tests, 0 failures |
| Frontend | `p47/w6-frontend` | 486730db -> 3ad35a28 (5 commits, brings the delivery-ring surface and the shared uninstall modal) | none | tsc clean; jest on app/endpoints, app/admin, components/admin, app/api/ai-control-plane: 135 suites, 1,256 tests, 0 failures (one suite failed once under load, passed alone and on the rerun) |
| Installers | `p47/fix-system-exfil` | 951d790a -> f6148c37 (38 commits: Codex hardening, self-uninstall on a deregistered heartbeat, Windows daemon self-repair, install-brick fixes) | none | go build ok; go test on daemon, codexmanaged, uninstall, core, evidencespool, proxy, mcpgov, cmd/devoid: first run red only where the box was saturated (a 10-minute package timeout, timing tests); every red package passes when rerun alone |
| Static-Worker | `p47/w7b-static` | fb8b990f -> de656fae (1 commit: sha256 as raw hex, the artifact cache key) | none | jest 4,192 of 4,193; the one red is the veto gate refusing this branch's re-banked recall baseline (CATCH_BASELINE.json), which is the human decision already on the owner list |
| Sandbox-Worker | `p47/w7c-containment` | 0c34e95, already at main | none | not re-run (nothing changed) |
| Scanner worker | `p47/integration-scanner` | 04309b9, already at main | none | not re-run (nothing changed) |
| Ceragon-Intelligence | `p47/w7c-platform` | 93c818c -> ff424a6 (3 commits: hot-set gates) | none | jest: 66 suites red on the merged tree AND 4 of 4 sampled suites red on origin/main alone in this environment, so not a merge effect; the vendored contracts need a rebuild after the merge |
| docs | `p47/w8-claim-docs` | e26ac2f -> e1528aa (2 commits) | none | documentation only |
| workspace root | `feat/push-depth-cli-ui`, on throwaway branch `p47/root-main-merge` | ec6dd8f + origin/master 6141077 -> d942cd4 (66 commits) | 26 files, all add/add: both branches created `ci/` and `.plans/m47a-20260822` independently. Resolved from an approximate three-way merge; the two claim-contract programs are different tools with one name, so master's guard lives on as `ci/lib/claim-contract-guard.mjs`; our rebase-manifest generator gained master's CLI flags so master's self-test passes | with the seven repositories junctioned beside the worktree: drift, vocab-parity (+test), claim-contract-guard (+test), both rebase-manifest self-tests, vendored-engine-parity, standards-schema, plan-citations, workflow-header-truth self-test all pass; our own claim-contract guard fails exactly as before the merge (Wave 8 Task 11's renderer is not on Installers main); workflow-header-truth reports three stale trigger claims in Installers workflow headers |

Nothing was pushed, merged to any main, or deployed. The throwaway root branch cannot be fast-forwarded
into the live checkout until the other session commits or drops its edits to `W1_CALLSITE_AUDIT.md`,
which the merge also touches.

One accident to own: removing three temporary baseline worktrees followed their `node_modules` junctions
(the exact hazard already on record) and emptied two dependency trees, one of them in the live
Ceragon-Intelligence checkout together with its vendored contracts directory (29 tracked files). Both
were restored, from the lockfiles and from git, before the verification runs above; the Frontend batch
was rerun after the reinstall.
