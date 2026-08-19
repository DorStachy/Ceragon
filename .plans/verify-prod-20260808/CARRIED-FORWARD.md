# Carried forward — noticed during a scoped fix, deliberately NOT fixed

One line per item: `- [severity] file:line — one sentence`.
A carried-forward item is a success of the pass that recorded it, not a failure.

**THIS FILE IS NOT A CLEAN BILL OF HEALTH.** Closing a line means one specific defect was
fixed and defeated; it says nothing about the rest of the surface that defect lived on.
Every line still carrying a severity is still OPEN. Items marked `[CLOSED <sha>]` keep
their original wording so a later reader can see what was actually claimed and check it,
with the resolution appended in bold.

Close-out pass of 2026-08-19 (branch `fix/go-carried-remainder`, off `integ/gate-go`)
closed eight of these lines, annotated five it deliberately left open with the exact
observation that would settle each, and added one new one. Six lines were out of that
worktree's repo (two Backend `[high]`, two Frontend, one `[info]`) and were not touched.
**Nothing was pushed and nothing was deployed** — every SHA named here is a local commit.

## From fix/go-flap-route4 (the fourth five-minute rewrite-and-flap door), 2026-08-19

- [CLOSED c6608646] ~~[medium]~~ Installers/cmd/devoid/setup_installer.go:497 — `governedAgents` still omits `res.InstalledUnattested`, so the enrolment's last line can read "No AI agents detected to wire (homes absent)" over a Codex that is installed and egress-governed but whose hook-trust dialect could not be attested (the unmerged branch `fix/go-flap-second-verdict`, commit c6608646, fixes this class generically from disk presence — do not fix it twice). **CLOSED by that branch, which is NOW an ancestor of `integ/gate-go`. Verified by reading, not by re-running an enrolment: `reportAIWireSummary` gates on `aiwire.GovernedAgents(res)`, and `governedWireBuckets` (internal/aiwire/ungoverned_window.go:193) carries `res.InstalledUnattested` and `res.WiredDesktop` alongside `Wired`/`AlreadyCompliant`. Not fixed twice, as instructed.**
- [CLOSED — the claim went stale] ~~[info]~~ integ/gate-go — the brief stated two flap doors were already closed on this branch, but only one is: `130220ea` (hook-trust dialect) is an ancestor; `cfba9caa`/`c6608646`/`16a0e454` (the `diverged` and redirected-CODEX_HOME doors, plus `internal/aiwire/reconcile_decision.go` which centralises the whole decision) are still on the unmerged branch `fix/go-flap-second-verdict` — this route-4 fix was therefore built on the pre-centralisation two-branch shape and will need a small merge onto `reconcile_decision.go` when that branch lands. **No longer true. All four of `130220ea`, `cfba9caa`, `c6608646`, `16a0e454` are ancestors of `integ/gate-go`, each checked individually with `git merge-base --is-ancestor`. The predicted merge onto `reconcile_decision.go` has happened.**
- [low] Installers/internal/codexmanaged/requirements.go:733 — `knownTrustLevel` is a hard-coded closed vocabulary (`trusted`/`untrusted`/`none`/empty) with no telemetry, so a vendor adding a fifth word degrades every endpoint's hook-lane attestation to unreadable with nothing counting how many endpoints it hit. **STILL OPEN — UNRESOLVABLE IN THIS PASS. `internal/codexmanaged` is a pure library with no counter, heartbeat field or daemon handle, so "count how many endpoints it hit" needs a NEW wire field, and widening the heartbeat contract at close-out is the wrong trade. THE OBSERVATION THAT SETTLES IT WITHOUT BUILDING ANYTHING: a fleet query for endpoints landing in the `InstalledUserConfigOpaque` bucket for codex. That bucket is already the surface this condition reaches — setup_installer.go:499 prints "a trust_level word it does not model" for exactly it — so a non-zero count there IS the missing telemetry, read off the enrolment path instead of a new one. If that count is zero across the fleet, no vendor has added a fifth word yet and this line can be closed as unexercised rather than built.**

## From fix/go-enum-unreadable (the shared WSL distro enumerator dropped rows it could not read), 2026-08-19

- [CLOSED 82dca031] ~~[high]~~ Installers/internal/wsldistro/rows.go:110 — a non-distro subkey under the user-writable `HKCU\...\Lxss` (Windows/Store can create `AppxInstallerCache` there, which has no `DistributionName`) is now a name-missing row, so this fix escalates it to a whole-read failure and every WSL surface on such a host would report UNKNOWN with exit 31 permanently; not observed on the verification box (both subkeys were GUID-named distros) and `airuntimeinventory.DefaultWSLDistros` already emits `wsl-distro-name-missing` for the same key today, but the escalation is new and wants a live sweep before release. **CLOSED by widening the contract, NOT by weakening the failed-read rule. `subkeyOpener` went from `(name string, ok bool)` — which could not express "no DistributionName value present" versus "present but empty" — to `(name string, finding subkeyFinding)`, and the judgement moved into `classifySubkeyRead` over a platform-free `subkeyRead`. Only a DEFINITIVELY ABSENT `DistributionName` exonerates a subkey (not counted, does not poison); an unopenable subkey, an unreadable value, a wrong-typed value and a present-but-blank value all stay FAILED READS, which is the honesty property the lane exists for. The paired control `TestNamesFromRows_ExoneratingANonRegistrationDidNotWeakenTheFailedReadRule` goes red if that rule is relaxed to buy the fix. STILL OWED, and this line's own request: the escalation remains source-derived — no host with a non-distro Lxss subkey was available, so the live sweep before release has NOT been done.**
- [medium] Installers/internal/wsldistro/wsldistro.go:133 — `Enumerate`'s `([]Registration, bool)` seam has no channel for a per-row failure, so on a partial read the readable distro names are discarded and the operator is told only "cannot tell", where the sibling `airuntimeinventory.DefaultWSLDistros` returns the readable observations BESIDE the errors; widening the seam touches cmd/devoid, internal/pathfix and ~10 test files and was left out of a scoped fix. **STILL OPEN, and deliberately not attempted at close-out: it changes what three shipped commands print immediately before hardware testing, and it is in direct tension with the merged design note in rows.go — "a partial list handed back with ok=false is a list a future caller can be tempted to render, and the whole defect above is a partial list being rendered as a total". THE OBSERVATION THAT SETTLES IT: on a host with a genuinely partial registration, whether an operator handed the readable names ALONGSIDE "and one more could not be read" takes a different action than one handed "cannot tell". If the action is identical, this should be closed as won't-fix rather than built, and the seam should stay narrow.**
- [medium] Installers/internal/wsldistro/rows.go:52 — the `wsl-distro-unreadable` vs `wsl-distro-name-missing` reason slugs are computed correctly and then discarded at that same `ok bool` boundary, so no surface can tell the operator which of the two repairs applies; blocked on the same seam widening. **STILL OPEN and still blocked on the item above. Changed by 82dca031 only in that a THIRD outcome now exists behind that boundary (not-a-registration) which is NOT discarded — it is acted on — so the boundary now hides two reasons where it hid two before out of two.**
- [low] Installers/internal/wsldistro/host_windows.go:44 — `openLxssSubkey` is the one branch of this scan with no test, because covering it means writing fake subkeys into the user's live WSL registration; it is five lines with no branching beyond the two conditions its return values encode, but it is untested residue and should be recorded as such. **MOSTLY CLOSED by 82dca031: the branching is no longer in there. The whole judgement is now `classifySubkeyRead`, tested exhaustively over all eight shapes of `subkeyRead` on every platform, with a standing guard that exactly ONE of the eight may exonerate a subkey. RESIDUAL, still untested and now more load-bearing than before: the registry calls that BUILD the `subkeyRead` — specifically the mapping of `registry.ErrNotExist` from `GetStringValue` onto `NameAbsent`, which is the discriminator's only input. That single line is what a live sweep on a host with an `AppxInstallerCache` subkey would exercise.**

## From fix/go-wsl-remainder (the §2.1 WSL-lane remainders), 2026-08-19

- [CLOSED 83b6e557] ~~[high]~~ Installers/.github/workflows/pr-checks.yml — `./internal/wsldistro` and `./internal/wslcodex` are named in NO job of ANY of the five workflow files (every `go test` invocation was enumerated), so the package defining the failed-read contract and the package defining the covered/uncovered/unknown vocabulary both ship with their own tests never having run on a pull request; not fixed here because this brief excluded editing CI. **CLOSED: a step in `wire-lane-tests` (ubuntu) now runs both packages. RE-VERIFIED during the close-out that the pin is not inert in the way this campaign has shipped five times — the six tests 82dca031 adds are present by name inside a `GOOS=linux` test binary, so they execute on that runner rather than being silently skipped as Windows-only.**
- [CLOSED 96f127cf] ~~[medium]~~ Installers/.github/workflows/pr-checks.yml:183 — the `pathfix` step added by 24bdbcd1 is the LAST step of `cli-entrypoint-tests` with no `if: always()`, sitting behind a 25-minute `go test ./cmd/devoid/...` step, so the strict-gate lane reports nothing whenever that suite goes red or times out; the `if: always()` idiom is already used twice in the same file (lines 276, 504); not fixed here because this brief excluded editing CI. **CLOSED: `if: always()` added. The failing cmd/devoid step still fails the job — this only stops it SILENCING an independent gate, in exactly the situation where a reviewer is already looking at a red run. Verified by parsing the workflow and printing every step of that job with its `if`: the pathfix step has `always()`, every other step has none.**
- [medium] Installers/cmd/devoid/ai_status.go:59 — `codexMachineLayerVerdict`'s own comment records that the machine layer reports false on EVERY endpoint in the fleet today (`Provider.CloudRequirements` is nil in production by design), which means `devoid ai status codex` exits non-zero on every healthy endpoint too, so its exit code cannot presently be used as a fleet health signal; noticed while choosing the exit-code precedence and deliberately not touched. **STILL OPEN, and it is one of the decisions this pass is handing to a human: whether DeVoid should be able to observe the CLOUD_REQUIREMENTS tier at all is a product question, not something to settle by editing code at close-out. WHAT DID CHANGE (94a05b45): the one runbook that told a live-proof operator this command "must exit 0" now states that 1 is the expected answer on a healthy endpoint and why, so while the defect is open it no longer causes a valid proof to be abandoned on step 1.**
- [info] Frontend/app/mcp/mcp-governance-content.tsx — §6 findings 7 (NaN count line silencing its own "coverage incomplete" banner) and 8 (the false server-disagreement accusation when a summary is served with no rows) were found ALREADY FIXED, uncommitted, in the concurrent Frontend worktree `C:/cwt/w2-fe` on branch `fix/fe-summary-vs-rows` (`toCount` is now applied to `summary.sourcesTotal`, and `rowsAreWholeScope` gates the comparison); not touched from this Go worktree, which does not contain those files.

## From fix/go-enrol-summary (the enrolment closing summary), 2026-08-19

- [low] Installers/cmd/devoid/setup_installer.go:525 — the closing alarm is gated on "NO agent is governed", so a MIXED box (one runtime governed, a second one deferred/failed/opted out) ends enrolment with no rollup naming the ungoverned one at all; each runtime's own row above still states its outcome, and the gate matches the alarm's own "NONE is governed" wording, so this is pre-existing behaviour left untouched rather than something this fix introduced. **STILL OPEN, re-confirmed by reading at close-out: the gate is still `len(aiwire.GovernedAgents(res)) == 0`. Not fixed because the fix is a NEW line of enrolment output whose wording is a product choice, and because this exact function was rewritten one merge ago by c6608646 — rewriting the same closing summary twice in one week is how a regression gets in. THE OBSERVATION THAT SETTLES IT: enrol a box with Codex governed and Claude Code deferred, and read the last line. If a reader of only that line would believe the endpoint is fully governed, the rollup is needed; if the per-runtime rows above it already stop that belief, this closes as won't-fix.**
- [CLOSED — verified] ~~[high]~~ Installers integ/gate-go — the §2.1 lane's three commits (`06d3da9b`, `fae2bc3f`, `24bdbcd1`, branch `fix/go-wsl-gate-truth`) are NOT ancestors of `integ/gate-go`; `fix/go-wsl-remainder` fast-forwarded them in so its own fix could build on them, so merging that one branch brings all four, and merging `fix/go-wsl-gate-truth` alone would leave the exit-code half behind. **No longer true. All three are ancestors of `integ/gate-go`, checked individually with `git merge-base --is-ancestor` rather than inferred from a merge message. The `fix/go-wsl-remainder` merge brought them as predicted, so the exit-code half is in.**

## From fix/fe-summary-vs-rows (the console render remainders, §2.4 / §6 items 7, 8, 10, 14), 2026-08-19

**The two `[high]` entries below are BACKEND-SIDE and live on branches in a different
worktree. The 2026-08-19 close-out pass ran in the Go/Installers worktree and did NOT
touch them; they remain open and need the Backend lane.** The two Frontend entries under
them are likewise not in that repo.

- [high] Backend (not in this worktree) — §6 #9, "a stored key that a console panel reads is discarded before it is written", is a Backend write-time sanitiser defect and could not be touched from the Frontend worktree `C:/cwt/w2-fe`; `guardHealth` also does not exist anywhere in `Backend/src` on the shared checkout's current branch, so the code lives on a Backend feature branch in another agent's worktree and needs that lane, not this one.
- [high] Backend (not in this worktree) — §6 #11, the silent order-dependent 32-entry write-time cap on stored findings, is likewise Backend-side; the only `32` in the shared Backend checkout is `scan-dispatch.service.ts:3122` (`normalizeStringArray(summary.riskyPaths, 32)`), which is a different array, so the reported cap is on an unmerged Backend branch and was not confirmed here.
- [low] Frontend/components/ui/summary-vs-rows-note.tsx:41 — the shared sentence ends "the count shown is the one that claims less", which reads naturally when the smaller number is displayed (`sourcesAnswered`) but is confusing when the LARGER number is displayed because the larger number is the one claiming less coverage (`notReported`, `sourcesUnanswered`); the wording is load-bearing in four existing tests and was left alone in a scoped fix.
- [info] Frontend/app/admin/endpoints/ai-optout-coverage-panel.tsx — the panel's `total` is the only signal that the row list is a subset; if a Backend ever omits `total` while capping the list, the panel silently reverts to treating a capped page as the whole scope and can then report a false disagreement in the reported > rendered direction. No backend behaviour was checked; this is a contract risk, not an observed defect.

## From the regression check of fix/go-wsl-remainder, 2026-08-19

- [CLOSED 94a05b45] ~~[low]~~ Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md:52 — the one document in the repo that states this command's exit contract still reads "must exit 0. Exit 1 means a layer is genuinely unclean", which abf7f408 makes incomplete: an unreadable WSL registration now exits 31, and a live-proof operator following this runbook would read 31 as an unrecognised failure; no CI job, install script or packaging step reads this command's exit code (all five workflows plus install-scripts/, packaging/, windows-installer/ and scripts/ were grepped), so nothing automated breaks. **CLOSED — and the line was wrong TWICE, not once. Besides 31, "must exit 0" is itself false today: 1 is what a HEALTHY endpoint returns, because the rollup's machine term is a measured constant false fleet-wide (see the ai_status.go:59 item above). An operator obeying the old line abandons a valid proof on step 1. The runbook now states what 0, 1 and 31 each mean here and which two commands actually discriminate. DOCUMENTATION ONLY: no exit code was changed, because which of them is right is a product decision.**
- [CLOSED 45efc9e3] ~~[low]~~ Installers/cmd/devoid/ai_status.go:210 — the exit-code precedence puts `wslUnknown` ahead of `excluded` while the render switch above puts `excluded` first, so a host carrying an authorized opt-out AND an unreadable registration prints the opt-out headline and exits 31; both states are truthfully non-zero and layer 3/3 still prints the unknown rows, but the number and the headline name different repairs on that one combination. **CLOSED without moving EITHER ordering — both are deliberate and both are documented in the source. The `excluded` branch now also names the unreadable registration when it holds, and says that is what the 31 refers to. The load-bearing half is the CONTROL test: on a readable host the new sentence must NOT appear and the code must stay 1. Writing that control caught a too-broad assertion in itself — layer 1/3 legitimately prints "codex client version could not be read" on the same box — which is the "check measures the wrong thing" trap caught before it shipped rather than after.**

## Found during the close-out pass, 2026-08-19

- [low] Installers/internal/airuntimeinventory/sources_windows.go:167 — `DefaultWSLDistros` still collapses "DistributionName definitively ABSENT" into `wsl-distro-name-missing`, the distinction 82dca031 drew in `internal/wsldistro`, so a host with an `AppxInstallerCache` subkey grows one spurious unknown row on the inventory surface while `devoid wsl list` reads clean; it is NOT the fleet-wide brick that was fixed, because this channel returns per-row errors BESIDE a partial result so one bad row costs one row, but the two enumerators now classify the same registry subkey differently, which is §10 register #9's defect class in miniature. Not fixed in the close-out because the function has no seam and is untestable off a configured host, so any change would ship unverified; settled by one host carrying a non-distro Lxss subkey, comparing that surface's unknown-row count against `devoid wsl list`.

## BLOCKER found after the close-out — SETTLED 2026-08-19 in `1eaee322`

> **RESOLVED.** Both halves are fixed on `fix/go-assurance-determinism` (`1eaee322`), local
> commit only — NOT pushed, NOT deployed. The entry below is kept verbatim as the record of
> what was found; the resolution is appended after it.

- [BLOCKER] Installers/internal/policybundle + internal/winacl/assurance.go — the
  storageAssurance measurement added by `d044aed6` ("measure storageAssurance instead of
  asserting it", register #4) is BOTH wrong and NON-DETERMINISTIC on the trust-anchor ack,
  and the close-out's claim that these two reds are "pre-existing at the base commit" is
  incorrect: before d044aed6 the value was the hardcoded constant `OS_PROTECTED`, so both
  tests passed trivially and could not have failed.

  Measured on a QUIET box (the whole rest of the Go tree is green; the five other failures
  seen earlier were load artifacts of three concurrent jobs):

    TestMeasuredStorageAssuranceMovesWithTheActualFile
      a SYSTEM+Administrators-only credential measured "UNVERIFIED"; want "OS_PROTECTED"

    TestConvergencePersistsBeforeAckAndRetriesByteIdentically
      retry ack changed — the SAME state measured twice returned two different answers:
        first  storageAssurance "UNVERIFIED"
        second storageAssurance "OS_LOCAL_USER_READABLE"

  The second is the serious one and is a defect independent of which answer is correct: the
  ack is signed, so a value that changes between attempts changes the SIGNATURE, and the
  contract this test pins is that a retried convergence is byte-identical. A backend that
  de-duplicates on the ack bytes cannot do so; a backend that stores the first ack and the
  agent that retries now disagree about the endpoint's own storage posture.

  The first may be the TEST being stale rather than the code being wrong — a non-elevated
  process legitimately cannot verify a SYSTEM-only descriptor, and answering UNVERIFIED is
  the honest result. That question has to be settled before either is touched, because
  "make the test match the code" in the credential path is precisely how a real control was
  lost earlier in this campaign.

  NOT FIXED HERE deliberately. This is the trust-anchor/credential path — the one class on
  this register that can permanently disable endpoints — and a rushed fix at the end of a
  long session is how the planted-identity regression was introduced. It needs a fresh pass
  with the register's F16 analysis open beside it.

### Resolution (2026-08-19, `1eaee322`, branch `fix/go-assurance-determinism`)

Both halves settled. Instrumented, not reasoned from source.

**The non-determinism was an ORDERING defect, and the state really did change between the two
measurements.** `convergeTrustAnchorWithAPIClock` measured the credential store, THEN called
`config.SaveAITrustAnchor` — which on the machine scope rewrites `credentials.json` through
`writeCredentialsFileAtomic` and stamps `winacl.MachineLocalReadSDDL` onto it — and only THEN
signed the ack. Measured on a quiet box, same unchanged intent throughout: the file measured
`UNVERIFIED` before pass 1, `OS_LOCAL_USER_READABLE` after pass 1, so ack[0] was already false
when it was signed and ack[1] carried a different payload and signature. Fix: re-measure after
the pass's own write lands and persist the settled value, so the durable record and the signed
ack still carry one value and the next pass signs the identical payload. Not a freeze — the
value is still read from the real security descriptor every pass.

**The first failure WAS the test, and the reason is recorded in the test.**
`winacl.HardenSecretWithPrincipal` applies the `MachineSecretSDDL` *DACL* but assigns the current
UNPRIVILEGED USER as owner (an unprivileged process cannot assign LocalSystem), and an owner holds
READ_CONTROL and WRITE_DAC however the DACL reads — the test's own `t.Cleanup` proves it by
running `icacls <path> /grant *<me>:(F)` against that SY+BA-only DACL and succeeding. Review
round 2 (`930dac43`) taught the classifier to read the owner and corrected the IDENTICAL
assertion in `winacl` (`TestMeasureSecretAssuranceRefusesASYBAOnlyDACLThisUserOwns`), recording
there that it "PINNED A FAIL-OPEN"; the `policybundle` copy was missed. The expectation moved to
`UNVERIFIED` and the test was STRENGTHENED, not softened: it now checks the file's real owner as
a stated precondition, so `UNVERIFIED` reached for any other reason fails. `OS_PROTECTED` is still
pinned on the SYSTEM-owned descriptor the product actually writes, by
`winacl.TestClassifyDescriptorOnTheShippedMachineDescriptors`.

**Defeat step, discriminating.** (A) Delete the settle step: `TestConvergencePersistsBeforeAckAndRetriesByteIdentically` and
`TestConvergenceSignsTheAssuranceAsItStandsAfterItsOwnWrite` go RED while
`TestConvergenceAckAssuranceMovesWithTheCredentialStore`, `TestConvergenceSignsTheMeasuredStorageAssurance`
and `TestMeasuredStorageAssuranceMovesWithTheActualFile` stay GREEN. (B) Freeze the value to a
constant — the forbidden fix, register #4 reintroduced: the two byte-identity tests stay GREEN and
`TestConvergenceAckAssuranceMovesWithTheCredentialStore` goes RED. (C) Disable the owner branch in
`classifyDescriptor`: `TestMeasuredStorageAssuranceMovesWithTheActualFile` goes RED reporting
`OS_PROTECTED` while `TestClassifyDescriptorOnTheShippedMachineDescriptors` stays GREEN.

**Still open on this path:** nothing pushed, nothing deployed, and the backend widening of
`AI_TRUST_ANCHOR_STORAGE_ASSURANCES` must be deployed BEFORE any agent that can emit a measured
level, or every ack 400s and the fleet parks in V1_DEGRADED (`d044aed6`'s own deploy-order note).

- [low] Installers/internal/winacl/assurance.go:82 — `WeakestAssurance`, the aggregator that picks the single storageAssurance value the signed ack carries across every secret-material file, has no direct test anywhere in the tree, and after `1eaee322` no test at any layer proves `OS_PROTECTED` can still survive that aggregation (it is pinned only one layer below, on `classifyDescriptor(MachineSecretSDDL)`); pre-existing since `d044aed6`, not introduced by the assurance-determinism fix.
