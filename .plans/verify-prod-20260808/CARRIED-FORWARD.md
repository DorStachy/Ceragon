# Carried forward — noticed during a scoped fix, deliberately NOT fixed

One line per item: `- [severity] file:line — one sentence`.
A carried-forward item is a success of the pass that recorded it, not a failure.

## From fix/go-flap-route4 (the fourth five-minute rewrite-and-flap door), 2026-08-19

- [medium] Installers/cmd/devoid/setup_installer.go:497 — `governedAgents` still omits `res.InstalledUnattested`, so the enrolment's last line can read "No AI agents detected to wire (homes absent)" over a Codex that is installed and egress-governed but whose hook-trust dialect could not be attested (the unmerged branch `fix/go-flap-second-verdict`, commit c6608646, fixes this class generically from disk presence — do not fix it twice).
- [info] integ/gate-go — the brief stated two flap doors were already closed on this branch, but only one is: `130220ea` (hook-trust dialect) is an ancestor; `cfba9caa`/`c6608646`/`16a0e454` (the `diverged` and redirected-CODEX_HOME doors, plus `internal/aiwire/reconcile_decision.go` which centralises the whole decision) are still on the unmerged branch `fix/go-flap-second-verdict` — this route-4 fix was therefore built on the pre-centralisation two-branch shape and will need a small merge onto `reconcile_decision.go` when that branch lands.
- [low] Installers/internal/codexmanaged/requirements.go:733 — `knownTrustLevel` is a hard-coded closed vocabulary (`trusted`/`untrusted`/`none`/empty) with no telemetry, so a vendor adding a fifth word degrades every endpoint's hook-lane attestation to unreadable with nothing counting how many endpoints it hit.

## From fix/go-enum-unreadable (the shared WSL distro enumerator dropped rows it could not read), 2026-08-19

- [high] Installers/internal/wsldistro/rows.go:110 — a non-distro subkey under the user-writable `HKCU\...\Lxss` (Windows/Store can create `AppxInstallerCache` there, which has no `DistributionName`) is now a name-missing row, so this fix escalates it to a whole-read failure and every WSL surface on such a host would report UNKNOWN with exit 31 permanently; not observed on the verification box (both subkeys were GUID-named distros) and `airuntimeinventory.DefaultWSLDistros` already emits `wsl-distro-name-missing` for the same key today, but the escalation is new and wants a live sweep before release.
- [medium] Installers/internal/wsldistro/wsldistro.go:133 — `Enumerate`'s `([]Registration, bool)` seam has no channel for a per-row failure, so on a partial read the readable distro names are discarded and the operator is told only "cannot tell", where the sibling `airuntimeinventory.DefaultWSLDistros` returns the readable observations BESIDE the errors; widening the seam touches cmd/devoid, internal/pathfix and ~10 test files and was left out of a scoped fix.
- [medium] Installers/internal/wsldistro/rows.go:52 — the `wsl-distro-unreadable` vs `wsl-distro-name-missing` reason slugs are computed correctly and then discarded at that same `ok bool` boundary, so no surface can tell the operator which of the two repairs applies; blocked on the same seam widening.
- [low] Installers/internal/wsldistro/host_windows.go:44 — `openLxssSubkey` is the one branch of this scan with no test, because covering it means writing fake subkeys into the user's live WSL registration; it is five lines with no branching beyond the two conditions its return values encode, but it is untested residue and should be recorded as such.

## From fix/go-wsl-remainder (the §2.1 WSL-lane remainders), 2026-08-19

- [high] Installers/.github/workflows/pr-checks.yml — `./internal/wsldistro` and `./internal/wslcodex` are named in NO job of ANY of the five workflow files (every `go test` invocation was enumerated), so the package defining the failed-read contract and the package defining the covered/uncovered/unknown vocabulary both ship with their own tests never having run on a pull request; not fixed here because this brief excluded editing CI.
- [medium] Installers/.github/workflows/pr-checks.yml:183 — the `pathfix` step added by 24bdbcd1 is the LAST step of `cli-entrypoint-tests` with no `if: always()`, sitting behind a 25-minute `go test ./cmd/devoid/...` step, so the strict-gate lane reports nothing whenever that suite goes red or times out; the `if: always()` idiom is already used twice in the same file (lines 276, 504); not fixed here because this brief excluded editing CI.
- [medium] Installers/cmd/devoid/ai_status.go:59 — `codexMachineLayerVerdict`'s own comment records that the machine layer reports false on EVERY endpoint in the fleet today (`Provider.CloudRequirements` is nil in production by design), which means `devoid ai status codex` exits non-zero on every healthy endpoint too, so its exit code cannot presently be used as a fleet health signal; noticed while choosing the exit-code precedence and deliberately not touched.
- [info] Frontend/app/mcp/mcp-governance-content.tsx — §6 findings 7 (NaN count line silencing its own "coverage incomplete" banner) and 8 (the false server-disagreement accusation when a summary is served with no rows) were found ALREADY FIXED, uncommitted, in the concurrent Frontend worktree `C:/cwt/w2-fe` on branch `fix/fe-summary-vs-rows` (`toCount` is now applied to `summary.sourcesTotal`, and `rowsAreWholeScope` gates the comparison); not touched from this Go worktree, which does not contain those files.

## From fix/go-enrol-summary (the enrolment closing summary), 2026-08-19

- [low] Installers/cmd/devoid/setup_installer.go:525 — the closing alarm is gated on "NO agent is governed", so a MIXED box (one runtime governed, a second one deferred/failed/opted out) ends enrolment with no rollup naming the ungoverned one at all; each runtime's own row above still states its outcome, and the gate matches the alarm's own "NONE is governed" wording, so this is pre-existing behaviour left untouched rather than something this fix introduced.
- [high] Installers integ/gate-go — the §2.1 lane's three commits (`06d3da9b`, `fae2bc3f`, `24bdbcd1`, branch `fix/go-wsl-gate-truth`) are NOT ancestors of `integ/gate-go`; `fix/go-wsl-remainder` fast-forwarded them in so its own fix could build on them, so merging that one branch brings all four, and merging `fix/go-wsl-gate-truth` alone would leave the exit-code half behind.

## From fix/fe-summary-vs-rows (the console render remainders, §2.4 / §6 items 7, 8, 10, 14), 2026-08-19

- [high] Backend (not in this worktree) — §6 #9, "a stored key that a console panel reads is discarded before it is written", is a Backend write-time sanitiser defect and could not be touched from the Frontend worktree `C:/cwt/w2-fe`; `guardHealth` also does not exist anywhere in `Backend/src` on the shared checkout's current branch, so the code lives on a Backend feature branch in another agent's worktree and needs that lane, not this one.
- [high] Backend (not in this worktree) — §6 #11, the silent order-dependent 32-entry write-time cap on stored findings, is likewise Backend-side; the only `32` in the shared Backend checkout is `scan-dispatch.service.ts:3122` (`normalizeStringArray(summary.riskyPaths, 32)`), which is a different array, so the reported cap is on an unmerged Backend branch and was not confirmed here.
- [low] Frontend/components/ui/summary-vs-rows-note.tsx:41 — the shared sentence ends "the count shown is the one that claims less", which reads naturally when the smaller number is displayed (`sourcesAnswered`) but is confusing when the LARGER number is displayed because the larger number is the one claiming less coverage (`notReported`, `sourcesUnanswered`); the wording is load-bearing in four existing tests and was left alone in a scoped fix.
- [info] Frontend/app/admin/endpoints/ai-optout-coverage-panel.tsx — the panel's `total` is the only signal that the row list is a subset; if a Backend ever omits `total` while capping the list, the panel silently reverts to treating a capped page as the whole scope and can then report a false disagreement in the reported > rendered direction. No backend behaviour was checked; this is a contract risk, not an observed defect.

## From the regression check of fix/go-wsl-remainder, 2026-08-19

- [low] Installers/internal/codexmanaged/LIVE_PROOF_RUNBOOK.md:52 — the one document in the repo that states this command's exit contract still reads "must exit 0. Exit 1 means a layer is genuinely unclean", which abf7f408 makes incomplete: an unreadable WSL registration now exits 31, and a live-proof operator following this runbook would read 31 as an unrecognised failure; no CI job, install script or packaging step reads this command's exit code (all five workflows plus install-scripts/, packaging/, windows-installer/ and scripts/ were grepped), so nothing automated breaks.
- [low] Installers/cmd/devoid/ai_status.go:210 — the exit-code precedence puts `wslUnknown` ahead of `excluded` while the render switch above puts `excluded` first, so a host carrying an authorized opt-out AND an unreadable registration prints the opt-out headline and exits 31; both states are truthfully non-zero and layer 3/3 still prints the unknown rows, but the number and the headline name different repairs on that one combination.

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
