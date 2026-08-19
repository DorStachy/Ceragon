# Close-out — final round, campaign verify-prod-20260808

Date: 2026-08-19. Nothing in this campaign was pushed or deployed.

**One lane did not close.** `fix/fe-summary-vs-rows` (console render remainders) is fixed correctly
but is NOT mergeable as it stands: its own new test file reddens a required CI gate. Details below.
The other four lanes closed and are safe to merge.

## 1. Lane by lane

| Lane | Branch | Verdict |
|---|---|---|
| Fourth five-minute rewrite-and-flap door (F2-C) | `fix/go-flap-route4` | **Fixed, safe to merge.** PROVEN: 4 rewrites + 8 ledger records over four identical healthy passes → 0 and 0, both reconcile arms; two independent tear-out defeats each went red with named controls green. |
| WSL enumerator silently dropped rows it could not read | `fix/go-enum-unreadable` | **Fixed, safe to merge.** PROVEN: five separate defeats on production code, each discriminating; a partial read is now a failed read, not a shrunken denominator. Live registry on this box still enumerates cleanly. |
| Enrolment printed a "NONE is governed" alarm under its own success row | `fix/go-enrol-summary` | **Fixed, safe to merge.** PROVEN: the alarm is silenced only for `WiredDesktop` and `InstalledUnattested`; it still fires, case by case, for all five genuinely-ungoverned outcomes. |
| §2.1 WSL-lane remainders (exit-code disagreement, strict-gate pin) | `fix/go-wsl-remainder` | **Fixed, safe to merge.** PROVEN: all four surfaces of one binary now answer 31 on an unreadable registration; three mutations red, controls green. |
| Console render remainders (§6 items 7, 8, 10, 14) | `fix/fe-summary-vs-rows` | **Fixed but DO NOT MERGE.** The four render fixes are proven at 1440 px and 375 px with before/after/control captures. The blocker is the new test file `__tests__/render-remainders.test.tsx`: two TypeScript errors (TS2783 line 205, TS2322 line 313) turn the required `Typecheck (tsc --noEmit)` job red — green at the parent commit, red at HEAD `c5e5ddd4`. Two lines, fixable with the precedent already on the branch (commit `95764d66`); no production code needs to change. |

## 2. Merge order

Merge in this order, and merge each into `integ/gate-go` before starting the next — parallel unmerged
branches are what cost this campaign three days.

1. **`fix/go-enrol-summary`** first. It fast-forwards in the four commits of `fix/go-flap-second-verdict`,
   which centralise the reconcile decision into `internal/aiwire/reconcile_decision.go`.
2. **`fix/go-flap-route4`** second, and expect a small manual merge. It was built on the
   pre-centralisation two-branch shape and will conflict textually with `reconcile_decision.go`.
   The semantics compose; that composition has NOT been compiled or run.
3. **`fix/go-enum-unreadable`** and **`fix/go-wsl-remainder`** together, in one sitting, then re-run
   `cmd/devoid`, `internal/pathfix`, `internal/wsldistro`, `internal/wslcodex`. They change and drive the
   same `wsldistro.Enumerate` seam. `fix/go-wsl-remainder` carries `06d3da9b`, `fae2bc3f` and `24bdbcd1`;
   merging `fix/go-wsl-gate-truth` alone would leave the exit-code half behind.

**Do NOT merge `fix/fe-summary-vs-rows` into `integ/gate-fe-all`** until the two type errors are fixed.
It is not an ancestor of that branch today.

## 3. Carried forward — KNOWN AND NOT FIXED, deliberately

`CARRIED-FORWARD.md` holds **19 items**: 5 high, 5 medium, 6 low, 3 info.

This list is not a clean bill of health. Every item was found during a scoped fix and left alone on
purpose, so the fix stayed scoped. The five HIGH items are:

- The WSL fix escalates a non-distro subkey under `HKCU\...\Lxss` into a permanent whole-read failure
  (exit 31 forever) on any host that has one. NOT observed on this box; NOT swept across the fleet.
- `internal/wsldistro` and `internal/wslcodex` run in NO job of ANY of the five workflows — the packages
  defining the failed-read contract ship with their own tests never having run on a pull request.
- Backend §6 #9 (a stored key a console panel reads is discarded before it is written) — needs a Backend lane.
- Backend §6 #11 (silent order-dependent 32-entry write-time cap on stored findings) — needs a Backend lane.
- Branch topology: the §2.1 lane's commits are not ancestors of `integ/gate-go` (addressed by the order above).

## 4. What still needs the owner — decisions only

- **Wire-ledger polarity.** `managed-route-installed-user-config-opaque` is recorded as GOVERNED because the
  route was read off disk. If an unattested hook lane should instead open an ungoverned window, that is a
  one-line flip on an isolated slug. Judgement call, not a measurement.
- **A wire-visible exit-code change.** `devoid ai status codex` now exits 31, not 1, on an unreadable WSL
  registration. It is announced nowhere outside a commit message. Decide whether it needs a release note.
- **CI scope.** Whether to add `internal/wsldistro` / `internal/wslcodex` to PR CI, and whether the `pathfix`
  step gets `if: always()`. Both briefs excluded editing CI.
- **Backend lane ownership.** §6 #9 and #11 live on an unmerged Backend branch in another worktree. Someone
  has to own them or they stay open.
- **Whether the FE lane's two-line typecheck fix happens now or is handed to the next round.**

## 5. What still needs a real Windows box — see `REAL-BOX-PACKET.md`

- Registry sweep across real endpoints for non-distro subkeys under `HKCU\...\Lxss` — the one item that could
  brick every WSL surface on a real host. NOT EXERCISED: no fleet access.
- A real daemon at its live 5-minute cadence against a real `~/.codex` and a real evidence spool. NOT EXERCISED:
  the 0-rewrites result is measured on fixtures; the 576-records/day arithmetic is carried over, not re-measured.
- Confirm `os.Exit(31)` actually reaches a shell. NOT EXERCISED: no binary was built; `runAIStatus` cannot be
  unit-tested in-process.
- A live enrolment on a machine with the ChatGPT/Codex desktop app installed. NOT EXERCISED: the desktop case
  runs against a temp home shaped like a desktop install, and skips entirely on a Linux runner.
- Whether the production Backend always serves `sourcesTotal`. NOT EXERCISED: if it does not, every MCP page
  gains a new paragraph on a healthy fleet the moment the FE lane ships.
