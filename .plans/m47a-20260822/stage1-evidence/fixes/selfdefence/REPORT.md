# P47 stage 1 — self-defence + destructive-rm home coverage

Worktree `C:\cwt\p47-fix-selfdef`, Installers repo, branch `p47/fix-selfdefence`, base `f6148c37`.
Measured 2026-09-06.

Two defects. **A**: the `devoid-self-disable` class fired on the stop verbs and on
`devoid uninstall`, and on nothing else — deleting the service registration, deleting the agent's
own binaries and install tree, and the product's own `daemon stop` verb were all allowed.
**B**: Wave 0A residual — a `$HOME` reference inside double quotes produced no finding at all,
while every unquoted spelling of the same target blocked.

## Measured before / after

Full baseline: `red-before-base-f6148c37.txt` (the new tests run against the base commit in a
throwaway worktree — 51 attack subtests red). After: `green-after.txt` (92 subtests pass).
Raw scanner output for both defects across 55 commands: `probe-after.txt`, re-runnable with
`probe.go.txt` (drop it into a `main` package inside the repo and `go run` it).

| probe | before (f6148c37) | after | benign twin (unchanged) |
|---|---|---|---|
| `sc delete devoid` | none | devoid-self-disable HIGH | `sc query devoid` -> none |
| `sc.exe delete "Devoid Daemon"` | none | devoid-self-disable HIGH | `sc delete spooler` -> none |
| `Remove-Service devoid` | none | devoid-self-disable HIGH | `Get-Service devoid` -> none |
| `schtasks /Delete /TN "Devoid Daemon" /F` | none | devoid-self-disable HIGH | `schtasks /Query /TN ...` -> none |
| `Unregister-ScheduledTask -TaskName "Devoid Daemon"` | none | devoid-self-disable HIGH | `Get-ScheduledTask ...` -> none |
| `del "C:\Program Files\Devoid\devoid.exe"` | none | devoid-self-disable HIGH | `del build\*.obj` -> none |
| `del C:\ProgramData\Devoid\devoid-daemon.exe` | none | devoid-self-disable HIGH | `Remove-Item .\dist -Recurse` -> none |
| `rd /s /q "C:\Program Files\Devoid"` | none | devoid-self-disable HIGH | `Remove-Item -Recurse "C:\Program Files\nodejs"` -> none |
| `Remove-Item -Recurse -Force C:\ProgramData\Devoid` | none | devoid-self-disable HIGH | `Remove-Item -Recurse -Force node_modules` -> none |
| `rm -rf ~/.devoid`, `$HOME/.devoid`, `"${HOME}/.devoid"` | none | devoid-self-disable HIGH | `rm -rf "$HOME/.cache/pip"` -> none |
| `rm -rf /opt/devoid`, `/usr/local/bin/devoid`, `/var/lib/devoid` | destructive-rm only (**relaxable**) | + devoid-self-disable HIGH | `rm -rf /usr/local/lib/node_modules` -> destructive-rm only, as before |
| `devoid daemon stop` | none | devoid-self-disable HIGH | `devoid daemon status` / `start` / `devoid status` -> none |
| `devoid setup remove-daemon` / `cleanup` / `unpatch-profile` | none | devoid-self-disable HIGH | `devoid setup enroll` -> none |
| `rm -rf "$HOME"` | none | destructive-rm HIGH | `rm -rf "$HOME/.cache/pip"` -> none |
| `rm -rf "$HOME/"`, `"${HOME}"`, `"${HOME}/"` | none | destructive-rm HIGH | `rm -rf ./dist` -> none |
| `rm -rf "$HOME/.ssh"`, `"$HOME/.aws/credentials"` | none | destructive-rm HIGH | `rm -rf "$HOME/projects/scratch"` -> none |
| `rm -rf "$HOME"/*` (glob outside quotes) | none | destructive-rm HIGH | `rm -rf "$HOME/*"` (glob inside quotes) -> none |

`rm -rf ~/`, `rm -rf $HOME/`, `rm -rf ${HOME}` and `Remove-Item -Recurse $env:USERPROFILE` were
named in the brief as part of defect B but **already blocked on this base** — the residual was the
double-quoted family only. Recorded so the fix is not credited with work that was already done.

`/opt/devoid` matters more than it looks: it blocked, but as `destructive-rm`, a class an
administrator may relax to allow. `devoid-self-disable` is one of the two classes
`localdecide.toolRiskSelfDefenseClasses` floors at warn. Same act, wrong floor.

## What was wrong, and what is now true

**A — `internal/toolrisk/toolrisk.go`, three new rules in the existing `devoid-self-disable` class**
(no new class, no vocabulary change):

1. *Service and scheduled-task removal.* `sc [\\host] delete`, `Remove-Service`,
   `schtasks /Delete|/End`, `Unregister-/Disable-/Stop-ScheduledTask`, each requiring the brand
   token. The Task Scheduler arms are included because on Windows the daemon's persistence **is**
   a scheduled task named "Devoid Daemon" (`cmd/devoid/setup_installer.go`) and our own teardown
   removes it that way; covering the SCM door alone would have left the more likely door open.
   This is the one addition beyond the brief's literal list.
2. *Deleting the agent's files.* `remove-item|rmdir|unlink|erase|del|rm|rd|ri` (one verb set: all
   are PowerShell aliases for `Remove-Item` as well as cmd.exe/POSIX commands) reaching either an
   agent `.exe` name or a **recognized install root** — `C:\Program Files\...`, `C:\ProgramData\...`,
   `%ProgramData%\`, `$env:LOCALAPPDATA\`, `C:\Users\<user>\[AppData\...\]`, `/opt/`, `/etc/`,
   `/var/{lib,log,cache}/`, `/usr/[local/]{bin,lib,libexec,share}/`, `/Library/Application Support/`,
   and `~`/`$HOME`/`${HOME}` — followed by the brand segment.
   The `.exe` suffix is **required** for the bare-binary arm and the root list is closed on purpose:
   keying on "any path containing a devoid segment" would block deleting anything under
   `C:\Users\Owner\Documents\Ceragon`, this workspace's own root. Pinned by the
   `workspace-file` / `workspace-subtree` benign rows.
3. *The product's own disable verbs.* `daemon stop`, `setup remove-daemon`, `setup cleanup`,
   `setup unpatch-profile` (verbs read from `cmd/devoid/main.go`), anchored at a real command
   position — start of the command text or a newline / `;` / `&` / `|` / `(` separator, through the
   transparent wrappers. Whitespace anchoring would have fired on
   `git commit -m "docs: explain the devoid daemon stop verb"`, and this class cannot be relaxed
   away by an admin, so a false positive here interrupts until the rule changes.

**B — new file `internal/toolrisk/quoted_home.go`**, hooked into `scanCommandASTWithStateAndHomeTrust`
beside the Wave 0A braced-HOME lane. It reports a directly executed, recursive `rm` that is the
**first statement**, with no prefix assignments and no redirections, whose operand is a
double-quoted ambient `"$HOME"` / `"${HOME}"` plus literal path text. The broad/bounded decision is
not re-implemented: the operand is masked to a token and handed to the existing
`recursiveRMHasBracedHomeOperand` grammar, so `"$HOME/.cache/pip"` stays allowed for exactly the
reason `${HOME}/.cache/pip` does. Anything the lane cannot read literally makes it decline.

One thing quoting genuinely changes is handled: quotes suppress pathname expansion, so a `*` or `?`
**inside** the quotes is neutralized before the grammar runs. `rm -rf "$HOME/cache/../*"` names one
file literally called `*` and stays silent; `rm -rf "$HOME"/*` is a real home-wide wipe and fires.

Why neither existing lane could reach it: the flat rule's `posixHomeTarget` begins at the
`~`/`$HOME` byte and RE2 has no lookbehind, so a leading quote puts it out of reach (the trailing
`posixHomeTerm` already consumed the *closing* quote, which is why the asymmetry was invisible);
and `braced_home.go`'s `activeHomeMarkers` deliberately skips a quoted `ParamExp`, because that
lane's proofs are about word splitting, globbing and IFS.

## Pins inverted (three, each of which had asked for exactly this)

`rm -rf "$HOME"` was a **deliberately recorded residue**, not an oversight, so closing it required
answering the banners that recorded it.

- `quoting_bypass_pin_test.go` / `TestScan_EnvironmentVariableTargetIsIncompleteNotEvaded` —
  inverted, with the record its banner demanded. The short answer: the scanner still does not read
  `os.Getenv` or resolve process-environment values, and this change adds no such capability. What
  is classified is the **reference**, which is the entire evidence the bare `rm -rf $HOME` has ever
  been classified on. Cost on a machine whose `$HOME` differs: none — the finding does not depend
  on the value, so it is identical everywhere, which is the determinism invariant the package
  header requires. And the disposition it closed into had **no enforcement effect**:
  `UnresolvedInvocations` is consumed only by `ScanWithCompleteness`, and no caller in
  `internal/daemon` or `internal/localdecide` reads `Result.Unresolved` — the tool decision runs on
  `ScanChecked`. Measured before this change: zero findings, allowed, which auto-approves without a
  prompt.
- `home_target_boundary_test.go` — invariant row **C4 promoted to attack row A31**. Counts updated
  (attacks 28->29, invariants 5->4, matrix still 50); the measured-delta assertion now expects
  additions `{A4, A31}` instead of `{A4}`.
- `unresolved_invocation_test.go` / `TestW4BT6_TheFiveRowsHoldTogether` row 4 — now wants
  `destructive-rm` instead of `INSPECTION_INCOMPLETE`. The incomplete record disappears by design:
  `coveredByEnforcingFinding` drops a record whose segment already produced an enforcing HIGH
  finding. That absence is pinned so a later reader cannot mistake it for the evasion returning.
- `.plans/m47a-20260822/v2-waves/W4B_WINDOWS_NOT_READY.json` — `parserSites` 14->15 and its
  `sitesNote`, because `quoted_home.go` adds one `LangBash` parser construction. The W4B test
  requires the record to be corrected, not the count to be hidden.

## Tests

New file `internal/toolrisk/zz_p47_selfdefence_test.go`. Attack strings are assembled by
concatenation because the production DeVoid agent content-scans `Write`/`Edit` on the authoring
machine; the assembled string is what the scanner under test receives.

| test | rows | red at f6148c37 |
|---|---|---|
| `TestP47SelfDisable_ServiceAndTaskRemovalIsBlocked` | 12 | 12 |
| `TestP47SelfDisable_ServiceInspectionStaysAllowed` (benign) | 7 | 0 — passed before and after |
| `TestP47SelfDisable_DeletingTheAgentsFilesIsBlocked` | 20 | 20 |
| `TestP47SelfDisable_OrdinaryDeletesStayAllowed` (benign) | 13 | 0 — passed before and after |
| `TestP47SelfDisable_ProductDisableVerbsAreBlocked` | 10 | 10 |
| `TestP47SelfDisable_ProductVerbMentionsAndReadsStayAllowed` (benign) | 9 | 0 — passed before and after |
| `TestP47QuotedHomeRoot_IsDestructive` | 9 | 9 |
| `TestP47QuotedHomeRoot_BoundedAndInertTwinsStayAllowed` (benign) | 11 | 0 — passed before and after |

51 attack subtests red before, all green after; 40 benign negative controls green in both states.
The attack assertions check the class **and** that it is at the block tier, so a finding that
appeared at a lower severity would still fail.

Benign twins named in the brief, all still allowed: `sc query devoid`, `taskkill /F /IM node.exe`,
`del build\*.obj`, `rm -rf ./dist`, `Remove-Item .\dist -Recurse`, `devoid status`.

## Mirrors

**None needed, and none touched.** The tool-risk vocabulary is mirrored three ways —
`parity-vectors/toolrisk-classes.v1.json` (producer), `Backend/src/ai-security-policy/*`
(`AI_TOOL_RISK_*_CLASSES`, `ai-class-metadata.ts`, `ai-malicious-floor.ts`) and
`Frontend/types/vendored/toolrisk-classes.v1.json` + `Frontend/types/ai-governance.ts`. This change
adds regex alternatives **inside** two existing classes (`devoid-self-disable`, `destructive-rm`)
and changes no class name, tier, grade or proposal kind, so the vector file is byte-identical
(`git diff parity-vectors/` is empty) and the producer-side pin
`internal/core/backend/ai_policy_toolrisk_wire_parity_test.go` passes unchanged.

## Gates run

    go build ./...                                                          OK
    go vet ./internal/toolrisk/ ./internal/localdecide/ ./internal/daemon/  OK
    go test ./internal/toolrisk/ ./internal/localdecide/...                 ok
    go test -run 'SelfDisable|SelfDefence|DestructiveRm|Home' ./internal/daemon/   ok
    go test ./internal/daemon/            (full package, 64s)               ok
    go test ./internal/core/backend/ ./internal/coveragetruth/ \
            ./internal/shellast/... ./internal/aigrade/ ./internal/effectresolve/   ok
    go test ./internal/certificate/                                         ok with M47A_PLAN set

`internal/certificate` fails in a bare worktree with "cannot find
`.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md` above the package directory" — that plan lives in
the workspace repo, not in Installers. It passes with
`M47A_PLAN=/c/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md`.
Environmental, pre-existing, unrelated to this change.

## Not done / limitations

- **Not exercised against a live daemon.** Everything here is package-level. The end-to-end claim —
  that a hook proposing `sc delete devoid` is blocked on the wire — is not proven by this work.
- **Legacy `cera*` service names are only partly covered.** The rules use `(?:devoid|ceragon)` plus
  an explicit `cera[\s-]daemon` for the task arms, matching the existing rules in the class. Bare
  `cera`, `cera-evidence-writer` and `brand.LegacyCommandName` from
  `uninstall.WindowsDaemonServiceNames()` are **not** covered. A bare `\bcera\b` was rejected on
  purpose: it matches `cera-artifact_analysis_cache-staging` and similar workspace strings.
- **`rm devoid.exe` in a build tree will now block.** The binary arm requires the `.exe` suffix but
  not an install path, per the brief. On a developer box that builds `devoid.exe` in-tree this is a
  false positive, and because the class is floored at warn an admin cannot relax it away. Named
  rather than silently traded off.
- **`rm -rf /opt/devoid-old`** (a renamed backup of the install dir) is not self-disable; the brand
  segment must terminate on a separator, quote, whitespace or end.
- **`cd /tmp && rm -rf "$HOME"`** is still not detected by the quoted-home lane: it only reads the
  first statement of a command, the same posture `braced_home.go` takes, because after any other
  command a function or trap may have rebound HOME.
- **Pre-existing false positives left alone**: `rm -rf '$HOME'` and `rm -rf "~"` both fire although
  neither expands. They are recorded residues of the AST reconstruction dropping quote provenance
  (`quotedTildeLiteralResidual` in `quoting_bypass_pin_test.go`) and are out of scope here.
- **Nothing pushed, nothing merged, nothing deployed.** The commit is on `p47/fix-selfdefence` only.
