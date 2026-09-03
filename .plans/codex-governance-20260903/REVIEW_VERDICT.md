# Verdict: `codex-governance-20260903/PLAN.md`

**Note on inputs:** the fact-check and adversarial-critique clusters you handed me are non-functional — every entry is literal placeholder text (`"problem": "test"`) with no citation, and both refutations of them were correct. Only the completeness critic produced real content. I independently re-verified its six points against PLAN.md, `PARALLEL_HANDSHAKE.md`, `PARALLEL_EXECUTION_CONTRACT.md`, and the Installers/Backend/Frontend source, and did a fresh pass of my own (~30 file:line citations, all six `evidence/*.txt` files, the git history). Findings below are mine, verified directly — not carried over from either input.

## 1. Should work start from this plan?

**YES AFTER THE BLOCKING FIXES.** The diagnosis (F1–F9) is unusually well-grounded — I independently checked roughly 30 file:line citations across three repos and every one held, most exactly to the cited line, including four-for-four exact line matches on F9 alone. But W1, the wave the plan says can "start now" with "no external dependency," edits a file a live sibling programme exclusively owns under a binding contract already sitting in this repo, and F7's own cited evidence file currently shows the opposite of what F7 claims. Fix both before W1 starts; nothing else needs to block.

## 2. Corrections the plan MUST make

**C1 — F7 is contradicted by its own evidence file.** PLAN.md §0 F7 says: *"`LastTaskResult 0x800710E0`... every 5 minutes."* `evidence/reconcile-task.txt`, as committed, says:
```
LastRunTime: 09/03/2026 11:40:01
LastTaskResult: 0 (0x00000000)
```
That's success, not the claimed refusal code. Either re-capture the evidence at the moment the failure is actually observed (Task Scheduler's Operational log is disabled, so a point-in-time capture can catch the task mid-recovery), or note in the prose that the failure is intermittent and this snapshot happened to land on a good run. As written, a reader who opens the file will conclude F7 is unsupported. This is what W5 T4 is built to chase — fix the evidence before that task starts.

**C2 — F1's headline numbers are stale relative to its own evidence, and two independent evidence files agree with each other, not with the prose.** F1 says "1,571 `daemon-error`" / POST_TOOL_USE "decides fine (1,537)." The actual figures, captured ~3.5 hours later at 11:42–11:43 (both `evidence/hook-rollup-post-install-histogram.txt` and `evidence/doctor.txt`):

| metric | prose (F1) | histogram evidence | doctor.txt evidence |
|---|---|---|---|
| PRE_TOOL_USE non-decided | 1,628 (1571+57) | 1,843 (1786+57) | 1,845 |
| POST_TOOL_USE decided | 1,537 | 1,751 | 1,753 |
| USER_PROMPT_SUBMIT daemon-error | 7 | 8 | (n=8 no-decision) |

The two evidence files agree with each other within measurement noise; the prose is the outlier. Regenerate F1's numbers from the committed evidence rather than from whatever live count was on screen when §0 was drafted. The 96% fail-open conclusion is unaffected (it's actually slightly worse at the real numbers) — only the cited absolutes are wrong.

**C3 — F4 says "7 projects marked trusted"; `evidence/ai-status-codex.txt` lists 6.** Count the `[i] foreign governance key: projects.*` lines yourself — there are six distinct project hashes (`25f9ea9…`, `27ec468…`, `7e96183…`, `c25bb17…`, `cf82d53…`, `da808c1…`), one of them `system-dir` (that part is correct). Fix "7" to "6."

**C4 — F5 says "3,536 delivered decisions"; the evidence line says 3,733.** `evidence/ai-status-codex.txt`: `[i] vendor hook fail-open: measured zero, over 3733 delivered decision(s)`. Same stale-snapshot pattern as C2.

**C5 — W1's own precondition doesn't pass as written.** `grep -rn "IsSystemInstall()" --include=*.go internal/ cmd/ | grep -v _test | wc -l` is specified to print 19; on this checkout it prints **21** (10 files, matching the parenthetical — file count is right, occurrence count isn't). The pattern also matches doc-comment references to `IsSystemInstall()` (confirmed in `internal/aikeystore/location.go`, which has 3 comment mentions and 2 real calls), not just call sites, so the count is a fragile instrument regardless of the exact number. Tighten the grep (e.g. anchor on `config.IsSystemInstall()` used as a call, or `-w` plus context) before using it as a gate, and re-establish the real number.

## 3. Blocking findings — must change before W1 starts

**B1 — W1 T2 edits a file a concurrently-running programme exclusively owns.** T2's file list includes `internal/daemon/server.go:1700` (confirmed real — `sendHeartbeat()` calling `security.DefaultPaths()` sits exactly there). `PARALLEL_EXECUTION_CONTRACT.md` §2 assigns that file, unambiguously, to **P9**: *"Route registration and the service boundary... The non-owner must not edit these files at all — not a line, not an import."* P9 is not a retired programme — the git log at the top of this session shows a P9 commit (`787a770 p9(w7-t4)`) immediately adjacent to this plan's own commit (`0692a10 plan(codex-governance)`), and `PARALLEL_HANDSHAKE.md`'s newest entries are timestamped **this same morning** (04:12 and 10:07 on 2026-09-03). Fix: post a `SEAM REQUEST` to `.plans/PARALLEL_HANDSHAKE.md` for the specific accessor T2 needs at server.go (the same pattern the contract prescribes for `ai_handlers.go`, §2.1) before T2 is written, or get an explicit owner ruling on how this third programme relates to the two-party contract.

**B2 — §2's file-ownership check is incomplete, and it's not just server.go.** PLAN.md §2 excludes only 3 files (`ai_handlers.go`, `pr-checks.yml`, `release.yml`) from `PARALLEL_EXECUTION_CONTRACT.md`'s 28-row table. Two more of this plan's own files are on that table with a single named owner other than this plan:
- `cmd/devoid/main.go` (W2 T1, "service-install" branch — confirmed present at line 499) — **P9-owned**, 1/1 reference, "the uppercase-extension dispatch fix." P9 already has a live change in this exact file (`normalizeName`, commit `bce84aa0`, merged via Installers#180). PLAN.md never mentions P9 in connection with this edit.
- `internal/codexmanaged/*` — the primary surface for W2 T1/T2, all of W3, and all of W4 (`provider.go`, `hookdialect147_oracle_test.go`, `testdata/liveproof/ledger.json`, `machine_projection.go`, `machine_effective.go`, `requirements.go`, `capability_disposition.go`, `testdata/scfg/managed/probes/`) — is **contested and unresolved**. P47 wrote to the handshake this morning at 04:12: *"`internal/codexmanaged` is in neither programme's directory list... We are treating it as P47's... Correct us if that is wrong."* No correction has been posted as of the newest entry (10:07). A third programme editing six files under that path with zero handshake entry is exactly the failure mode the contract's own §7 warns about ("two correct changes that are wrong together"), and P47 has already had to write up one prior instance of exactly this ("a P9 commit inside a P9 directory... not flagged at the time... reported rather than left to be found").

Fix: before W1 (for main.go/server.go) and before W2/W3/W4 (for codexmanaged), cross-check every file in every wave's file list against the contract's 28-row table, not just the 3 named exclusions, and post the resulting seam requests / ownership questions to the handshake.

## 4. Major findings — rework risk per wave

**W1** — T1's `IsSystemInstall()` change turns a single AND-like check into an OR of three signals. Every DEFEAT test (`TestSystemInstallScopeDoesNotDependOnCredentials`, `TestDaemonTokenIsUserReadableOnMachineScopeInstall`, `TestEnrollRestartsAListeningDaemon`) proves the false-negative direction only. None proves that a standard/non-admin process cannot forge or trigger one of the three OR-conditions (credentials.json, the HKLM `SecurityBoundary` marker, or landing a binary under the hardened machine `bin`) to get itself treated as machine-scope. This is exactly the kind of gap rule 7 ("a check that cannot answer FAILS") exists to catch, applied to the check itself. Add a DEFEAT test proving the adversarial direction before T1 lands, even if the answer turns out to be "no, all three require admin already" — that's a claim the plan currently only assumes.

**W2** — EXIT depends on D2 (advance a *production* org's rollout ring to `CANARY`) having actually fired, but D2 specifies no cohort-size floor ("cohort > 0" permits 1), no task to roll a cohort back out of CANARY if the machine-baseline write misbehaves on real endpoints, and W2 T4 only adds static ring *visibility* — no alerting tied to the moment the ring is advanced. Given W2 T2 is a boot-time daemon now writing files on real machines the moment D2 fires, this needs a rollback + minimum-monitoring task, not just a console row.

**W4** — EXIT claims *"the four foreign-key facts from F4 appear as events in the console"* but the explicit T1–T5 task list only builds escalation machinery for 2 of the 4: `network_access` (T3/T4) and `projects.*.trust_level` (T2/T4). Nothing in T1–T5 addresses the un-attested MCP servers (`cua_repl`, `node_repl`) or the un-pinned feature override (`js_repl`) — T1 covers `tools.web_search`/`features.computer_use`, which are F6/desktop-safe-recovery items, not F4's MCP/feature-override facts. Either add tasks for those two remaining key classes or correct EXIT to name only the two actually covered, with the other two explicitly deferred and why.

**W4/W6** — D7 ("the coworker's VM qualifies") is asserted with no check against the fact that Windows VM capacity is *already* a contended, failing resource in this same workspace for the two other live programmes: the handshake records `"THE MACHINE SCOPE IS NOT MEASURABLE ON ANY HOST WITHOUT A VM"` and a VM provisioning failure (`HCS/0x800705aa — insufficient system resources`). Not proven to be the identical machine, but confirm availability before scheduling W4/W6 rather than assuming it.

## 5. What the review found the plan got RIGHT

- **Citation precision is real, not decorative.** I independently checked ~30 file:line citations spanning `config.go`, `daemon_auth.go`, `paths.go`, `server.go`, `ai_daemon_ask.go`, `credential_reachability.go`, `codex_machine_migration.go`, `controller.go`, `hookdialect.go`, `summary.go`, `release_check.go`, `endpoint-policy-integrity-read.service.ts`, `ai-runtime-integrity-policy.ts`, and `ai-security-policy-section.tsx`. Every one held, and several were exact — F9's four line numbers (1251, 1289, 1700, 1795) matched my grep output digit-for-digit; `BoundaryRegistryPath`'s value matched verbatim; the quoted `codex_machine_migration.go` "not an installer" text is real and in the right place.
- **The diagnostic chain F1→F2→F3→F3b→F4 is mechanistically coherent**, and each link is independently verified in code, not asserted: `IsSystemInstall()` really is a bare `Stat`, `daemonTokenWriteTarget` really does branch on it into a SYSTEM-scoped path, `server.go`'s heartbeat really does resolve via `DefaultPaths()`→`os.UserHomeDir()`, the `!managed` branch in `controller.go` really does persist `UNKNOWN` before returning, and `endpoint-policy-integrity-read.service.ts` really does return `CODEX_REQUIREMENTS`/`MACHINE_FILE` unconditionally for `provider === 'codex'`.
- **§2.4's frozen-dialect rule and §6's stated restraints are honored throughout** — I found no task that adds a dialect row, writes `sandbox_mode`, writes `network_access` before an egress measurement, or rewrites a user-tier key.
- **F8's doctor-row claim is exact**: `evidence/doctor.txt` shows `+ Daemon reachable` immediately above `x Daemon persistence ... daemon unreachable` and `x Daemon service ... daemon unreachable`, matching the plan's citation verbatim.
- **The append-only discipline for `liveproof/register.json` is followed by W2 T5 even without an explicit cross-reference** to the contract — good instinct, just needs to be made explicit given B2.
- **DEFEAT-first discipline is real**: several DEFEAT descriptions I checked target the actual named mechanism (e.g., `TestDaemonEnsureNeverOverwritesAForeignBaseline` against the real `isLegacyArgvCommand` discipline), not a straw-man test.

## 6. Gaps to add

- **New, before W1**: a parallel-programme reconciliation pass — cross-check every file in every wave against `PARALLEL_EXECUTION_CONTRACT.md`'s 28-row table (not just the 3 named exclusions), post seam requests for `server.go` (W1) and `main.go` (W2), and get the `internal/codexmanaged` ownership question P47 raised this morning resolved before W2/W3/W4 start. Can run in parallel with W0.
- **W1**: an adversarial-direction DEFEAT test for T1 (see §4).
- **W2**: a D2 rollback task (revert a cohort / the whole ring) and a minimum monitoring/alerting task tied to the ring-advance moment, not just the T4 visibility row.
- **W4**: tasks (or an explicit, reasoned deferral) for MCP-server attestation (`cua_repl`, `node_repl`) and feature-override pinning (`js_repl`) — the two F4 facts T1–T5 currently don't touch.
- **W0 or W5**: a one-time fleet-wide query (whatever telemetry surface Backend exposes — heartbeats, the artifact/endpoint tables) counting how many currently-installed, non-test endpoints show the F1/F2 fail-open pattern right now. Every EXIT bar in the plan is scored against one test box or one VM; the P0 ranking is justified by customer harm that is never quantified at fleet scale.

## 7. Revised wave order

No change to wave content order (W0→W1→W5→W2→W3→W4→W6 remains right). Insert the **reconciliation pass from §6** as a gate between W0 and W1 — it can be requested in parallel with W0's owner asks (D1/D2) since it's also owner/handshake-bound, but W1 must not start writing to `server.go` until it clears.