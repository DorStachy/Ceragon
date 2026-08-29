# Final pass — closing register

**Date:** 2026-08-19
**Scope of the ask:** finish everything **except push and deploy**.
**Push:** not done, by instruction. **Deploy:** not done, by instruction. No branch was pushed, no
release was cut, no production system was changed by this pass.

Every statement below is either **PROVEN** (the evidence is named) or **NOT EXERCISED** (the reason is
named). Nothing here says "working".

---

## 1. Is it done?

| Lane | Verdict |
|---|---|
| WSL gate and status agreement | **PARTIALLY CLOSED** — the reported hole is shut and proven; the reviewer found the same hole still open one branch over, and found the shared distro enumerator hides distros it cannot read |
| Opt-out five-minute rewrite flap | **NOT CLOSED** — the reviewer reproduced the same rewrite-every-five-minutes behaviour through a fourth route that this work does not cover, and the enrolment summary fix introduced a new false alarm |
| Findings-array cap test | **CLOSED and proven** — the reviewer reproduced the defeat step independently and agreed |
| Console render failures (five surfaces) | **PARTIALLY CLOSED** — three of five reproduced clean by the reviewer; one of the five is fixed on only one of its two branches, and two new display faults were found in the fixed code |
| C5 / C12 (never previously run) | **PARTIALLY CLOSED** — C5 passes with two declared limits; C12 does **not** pass: the reviewer's independent command list interrupts 6 of 36 ordinary developer commands |

**No — everything except push and deploy is not finished.** What is not finished:

1. The opt-out lane still rewrites the endpoint's configuration on every five-minute pass and still
   fills the local evidence spool, through a route this pass did not close (measured: 4 rewrites and 8
   records over 4 identical healthy passes, on both the command-line and desktop branches).
2. A change made in this pass makes the disk-format command class stop firing whenever its target is a
   variable, a command substitution, or anything the parser cannot read. That is a live loss of a
   blocking control, and it is not covered by any test.
3. C12's bar is zero interruptions during ordinary work. It is not met.
4. The enrolment summary now prints "AI agents are installed here and none is governed" on machines
   that this same pass just governed.
5. Two of the tests presented as evidence in the C5/C12 results file cannot fail — they only print.
6. On the credential path, a machine secret whose permissions have been narrowed stays narrowed, and
   nobody has established whether a non-elevated install then blocks or proceeds. See §6.

---

## 2. Per lane

### 2.1 WSL gate and status agreement — PARTIALLY CLOSED

**Commits (local only):** `06d3da9b`, `fae2bc3f`, `24bdbcd1`

**What changed.** When the endpoint cannot read its WSL registration, all three surfaces of the same
binary now answer non-zero in one process: the distro list, the strict doctor gate, and the Codex
status command. Previously the first two failed and the third reported the endpoint as fine. A step
that runs the path-repair package's tests was added to the pull-request checks.

**Defeat step.** Two production lines were reverted, one at a time.

* Reverting the strict-gate condition made `TestDoctorStrict_UnreadableRegistrationFailsTheGate` and
  `TestWSLSurfacesAgreeOnAnUnreadableRegistration` fail. **Controls that stayed green:**
  `TestDoctorStrict_ReadableRegistrationDoesNotClaimTheWSLGate` and
  `TestDoctorRollUp_UnreadableRegistrationRendersUnknownNeverGoverned`.
* Removing the new veto from the status verdict made
  `TestAIStatusCodex_UnreadableWSLRegistrationDropsTheProcessVerdict` and the three-surface agreement
  test fail. **Controls that stayed green:** `TestAIStatusCodex_ExpiredOptOutDoesNotDropTheVerdict`,
  `TestReportCodexWSLSurfaces_ReadableHostNeverRaisesTheUnknownSignal`.

Both lines were restored and re-run green. The reviewer repeated both mutations independently and
confirmed the same red/green split.

**Recorded as proof that the old tests could not see this:** at the base commit, with the gate deleted,
all four pre-existing tests in the command package passed.

**Deliberately not fixed.**

* The status command exits 1 where the other two exit 31. The three surfaces now agree on non-zero,
  which is what a script reads, but not on the number.
* A distro that the product can see but cannot probe still does not drop the status verdict.
* The path-repair package's second copy of the gate is unreachable for this input and was left in place.
* The other three packages that share the same path-filtered-only test lane were not audited.

**Residual risk on a real endpoint.** NOT EXERCISED: nobody has run this on a machine whose registration
is genuinely unreadable. The state is injected at the product's own enumeration point. What is pinned is
"given a failed read, every surface is honest" — not "the read fails when it should". No binary was
built or run. The new pull-request step has never executed on a hosted runner. Behaviour change to
expect: an endpoint whose WSL registration cannot be read now makes the status command exit non-zero
where it previously exited 0; a readable machine is unaffected.

**Reviewer verdict:** PARTIALLY CLOSED. See findings 3, 4, 9 and 12 in §6.

---

### 2.2 Opt-out five-minute rewrite flap — NOT CLOSED

**Commits (local only):** `cfba9caa`, `00cb8111`, `c6608646`, `16a0e454`

**What changed.** On a command-line-only machine at a confirmed client version, four identical healthy
passes now produce zero configuration rewrites and zero evidence records, down from four rewrites and
eight records. A redirected home is recorded once and named, instead of being rewritten every pass.
Repairs still happen: a drifted always-on control, a deleted route and a removed hook set are all still
fixed. The enrolment summary no longer claims no AI agent is installed when one is present.

**Defeat step.** Five mutations. The discriminating one reverted the decision to the shipped list:
`TestReconcile_DivergedCLIBoxDoesNotChurnTheProfileOrTheLedger` failed, while
`TestReconcile_DivergedDesktopBoxRemainsAZeroEventNoOp`,
`TestReconcile_RedirectedHomeIsNotRewrittenEveryPass` and both pre-existing dialect tests stayed green.
A mutation that stopped all repairs was also run and correctly turned five tests red, so a
never-writes over-correction cannot ship green.

**Reviewer's independent result — this is why the lane is not closed.** The reviewer reproduced the
original symptom through a fourth route: when the user's own configuration table cannot be read (a
mistyped value, or a trust level the product's vocabulary does not recognise), two rows are stamped as
tampered, and the decision then sends the machine to the installer on every pass. Measured over four
identical healthy passes: **4 rewrites, 8 records**, on both the command-line and the desktop branch.
Two triggers were confirmed. One of them — a vendor changing a trust-level word — would fire across
the whole fleet, not on one machine.

**Deliberately not fixed.**

* Coverage downgrade from an unknown binary or an unreadable home still routes to the installer.
* A redirected home is recorded honestly but the wiring is not moved to the home the client reads, so
  that endpoint stays ungoverned.
* The machine-scope reconcile path was not audited for the same shape.
* The bucket set used by the enrolment summary was not corrected.

**Residual risk on a real endpoint.** NOT EXERCISED: nothing ran on a real machine. No daemon was
started, no five-minute pass was observed, no evidence spool was inspected. All numbers come from
fixtures. PROVEN in fixtures: the ordinary case — a machine with a user-installed model-context server —
stops rewriting and stops evicting tamper evidence. Behaviour to watch: on the command-line branch a
diverged machine now counts as compliant in the enrolment summary, so an operator reading only that
summary loses a signal that the doctor and posture commands still print.

**Reviewer verdict:** NOT CLOSED. See findings 2, 5, 10 and 13 in §6.

---

### 2.3 Findings-array cap test — CLOSED and proven

**Commits (local only):** `0e187592`, `904a07b4`, `fed50003`, `24847915`

**What changed.** The 100-entry cap on the findings array that reaches the console had no test that
could fail. It now has one, for both reader roles, plus controls for each per-entry rule and a test
that documents an ordering gap.

**Defeat step.** Removing the cap from the production line produced 8 failed / 13 passed: four named
cases red in both reader roles, with exact numbers in the output (expected 100, received 5000). **Ten
in-file controls and an entire external control suite stayed green.** Restored; the production file was
byte-identical afterwards.

The reviewer repeated the mutation, got the identical split, and agreed the defect is closed.

**Deliberately not fixed.** The cap is applied before entries are validated, so 100 droppable entries in
front push real findings out. This was left as-is and documented by a passing test; changing it would
move per-item work from a fixed 100 to an unbounded number driven by the request body.

**Residual risk on a real endpoint.** NOT EXERCISED: nothing in this lane ran against a database, an
HTTP route or a console. A test that pins the cap on both read surfaces compiles and registers but has
never executed; CI will be its first run.

**Correction the reviewer proved, which changes what this lane's own write-up claimed.** The write-up
said the stored array is unbounded and that the severity band is derived from the full array, so a row
could show a critical band over an empty findings panel. That is wrong on the shipping write path: the
single write gate caps the stored array at 32 entries and 8192 bytes, and the band is derived from that
same capped array. Measured by the reviewer against the real private method: 5,000 findings in, 32 out,
4452 bytes. The read-side cap is a second line of defence, not the only one. **Do not spend the next
lane's budget on the cross-derivation test that write-up asked for.**

**Reviewer verdict:** CLOSED.

---

### 2.4 Console render failures (five surfaces) — PARTIALLY CLOSED

**Commits (local only):** `ecf515fc`, `12154f8a`, `09b9f12e`, `949bfe57`, `6857bb88`, `95764d66`

**What changed.** Five surfaces stopped repeating a server number that disagrees with the rows drawn
underneath it, or stopped rendering a failed read as a clean result:

* The opt-out strip counts the rows it drew, and names the disagreement rather than picking a side.
* The model-context coverage line counts the rows, so a machine that answers with a word this build
  does not know is counted as unanswered.
* The enforcement-proof roll-up renders a "not served" bucket instead of eight silent zeros.
* The unresolved-detections number reads as absent rather than printing a non-number.
* The web-guard panel keeps its section on the page and names the failure when the read fails, instead
  of disappearing.

**Defeat step.** Each fix was reverted individually. Example, the coverage line: reverting one
assignment turned 5 named tests red while the entire 14-test pre-existing coverage suite stayed green.
The reviewer independently reproduced three of the five defeats and got the exact same red/green
splits, then restored and confirmed 96 of 96 green across eight suites.

**Deliberately not fixed.** The backend halves of two of these (a machine state counted as answered on
the server but not in the console; no endpoint anywhere serving an enforcement-proof state); a status
column that reads "Active" beside an unmeasured guard; the six checks in the plan that need a live
tenant.

**Residual risk on a real endpoint.** NOT EXERCISED: the harness is a shaped stub. None of this is
evidence that any backend produces these shapes. Specific risks: a legitimate but differently-shaped
success response from the web-coverage route will now draw a loud "could not be read" banner on a
healthy fleet; the "not served" bucket will read as the whole fleet the moment this ships, because no
backend serves that state today; and the layout was checked at desktop width only — the narrow-width
sweep was not re-run over the changed panels.

**Reviewer verdict:** PARTIALLY CLOSED. See findings 6, 7, 8 and 14 in §6.

---

### 2.5 C5 / C12 — see §3.

---

## 3. C5 and C12 — first execution

These two checks had never been run before this pass.

### C5 — command-guard bypass matrix: **PASS, with two declared limits**

**PROVEN.** Every named obfuscation of a dangerous command reaches the same verdict as the plain
version: field-splitting via the separator variable (braced, unbraced, in an operator position, via a
substring expansion), a backslash inside the verb, and a line continuation. Evidence: the matrix rows in
`internal/toolrisk` print verdict and class per transform, with the plain-text control asserted first,
so a matrix that silently selected nothing cannot pass.

**Three defeats, each discriminating.**

* Neutering the field split flipped only the separator rows to allow; the backslash and continuation
  rows stayed blocked; four named benign-corpus controls stayed green.
* Disabling escape stripping flipped only the backslash rows.
* Removing the opaque placeholder for values the product cannot resolve took benign commands
  interrupted from 2 to 10 — this is the false-positive half, and it names the eight ordinary build
  commands that would start blocking.

**Two limits, stated plainly.** A verb supplied by a command substitution, and an unknown expansion used
as a separator, are both still not caught. Both are on the known-limit side of the stated depth of this
control.

**What C5 does not mean.** C5 proves the guard **sees** these commands. Under the proposed re-baseline
one of them is set to monitor, so the obfuscated form is seen, recorded, and **allowed to run**. C5 PASS
must not be read as "the obfuscated command is blocked in production".

**Unfalsifiable as specified.** `TestC5_UnknownTransforms_Inventory` — the source of the "20 of 22
shapes caught" number — has no assertions beyond its plain-text control. Every one of the 22 rows could
flip from caught to not-caught and it would still report pass. It is listed in the results file among
tests that do assert. It must be split: assert the 20 caught shapes, keep only the two declared limits
as prints.

### C12 — zero interruptions during ordinary work: **FAIL**

**One real false positive was found and fixed locally.** The disk-format rule required no operand, so
merely mentioning the class name blocked at high severity. It blocked, on this machine, against the
enrolled agent, four times while the check was being written: twice while authoring a test file, once
while searching the source tree for the class name, and once on the commit message describing the fix.
Every one was ordinary developer work.

**PROVEN.** Reverting that one rule turns `TestC12_OrdinaryWork_ZeroInterruptions` red with four named
rows in both measured lanes, while `TestC12_DangerProbesStillCaught` and both C5 tests stay green.

**But C12 does not pass, for three reasons.**

1. **The reviewer's independent list of 36 ordinary commands interrupts 6.** Under the no-policy lane:
   a recursive force-delete of a build cache under the home directory blocks; three ordinary
   privilege-elevated package and service commands warn; two shell-hook evaluations warn. A warn is an
   approval prompt the developer sees. Under the proposed re-baseline, one still interrupts. Neither
   measured lane is the posture actually enforced on endpoints today — the two lanes bracket it without
   measuring it.
2. **Seven of eight high-severity command classes fire on a mere mention** inside an unrelated command.
   The eighth escapes only by accident of where its pattern ends — the reviewer showed it does fire when
   the delete target is a home-directory path, which is the common case. So it is 8 of 8, not 7 of 8.
   This was measured and reported, not fixed: adding a command-word anchor to the flat pattern pass
   changes detection across the whole fleet and needs the owner.
3. **The end-to-end agent session (C12-b) was not run.** Reason: no local stack was up, four other
   agents were working in parallel, and the only guard daemon on this machine points at production.

**Unfalsifiable as specified.** `zz_c12_mention_fp_test.go` contains zero assertions — it only prints,
yet its table is reproduced in the results file as a measurement and the test is listed as passing. It
also under-reports, because it ignores one of its own three mention shapes when deciding whether a class
fires.

**The fix made for C12 caused a detection loss — see finding 2 in §6. It is the most severe item on this
page after the credential path.**

---

## 4. Capped items, now settled

### 4.1 Command-line / agent items

**CONFIRMED**

| Item | Finding |
|---|---|
| C1 | A roll-up line states as fact something the line directly below it calls unknown. Low harm: in that branch nothing is lost by acting on it. |
| C2 | A predicate hard-wired to true leaves the **entire** command-package suite green (103s green before, 95s green after). On an ordinary machine with no machine baseline, production prints "cooperative, user-owned" and the wired-true version prints "governed by the machine baseline". Production code is correct; this is a coverage hole. |
| C4 | The guard's only test is satisfied by a missing path, not by the guard. Deleting the guard leaves the named test and the whole package green. |
| C5 (capped list) | On a machine-scope install the daemon-side caller returns before the call in question, so the "two disagreeing callers" premise does not describe that population. |
| C6 | A refusal branch runs before the call that clears a durable opt-out, and its message tells the operator the daemon will wire the route automatically. It does not: with the stranded opt-out in place the reconcile skips the agent. The function has no test coverage and no seam, so its refusal path cannot be tested in-process. |
| C8 | A negative control searches for a copied prose string. Change one word in the producer and three roll-up tests stay green, including the control, which can then never fail. |
| C9 | Replacing the entire non-Windows identity check with a constant leaves the full package suite green under WSL, and all five denial tests green. Two of the three outcome branches are unreachable by any test. |
| R2-1 | A dropped-key report names two keys on the commonest transition, which nobody chose. Correction to the earlier write-up: the pair is the actor and the lever, not two identity keys. |
| R2-2 | A capped report is producer-choosable: 16 short invented names evict the one real key, and nothing on the record marks that truncation happened. |

**REFUTED**

| Item | Why |
|---|---|
| C3 (as filed) | The skip is real and was reproduced, but the fleet-brick does not follow: moments later in the same daemon start the token permissions are re-applied unconditionally. Observed in one run: narrowed to a single user, still narrowed after the reconcile, then restored to the canonical set after the token load. **A residue survives — see §6, credential path.** |
| C7 | The test-only setter does not ship in the release binary; the linker drops it (0 hits in the release build, 2 in the test build). Two harmless residues: a comment claims an enforcement the language does not provide, and on non-Windows the setter writes a variable only the Windows file reads. |
| C10 | The startup reconciler does repair a read-loosened identity key — the extra read permission is removed and the bytes survive. **The window is one daemon start, not indefinite.** Two independent repairs cover it. Note on trust: the first run of this check reported the opposite, because the test process could not itself read the file it had planted — a broken precondition that silently produced a false confirmation. |

### 4.2 Backend items

| Item | Verdict | Evidence |
|---|---|---|
| Score field unchecked | **CONFIRMED** | Every other count is checked for being a whole non-negative number; this one is not. Against live database, both read surfaces: a negative, a fraction, an enormous value and an out-of-range value all came through as numbers. |
| Text gate passes a line-separator channel | **CONFIRMED** | The check covers only the low control range, so three Unicode line and direction characters pass on every text field. Same run: six such payloads came through; the two plain control characters were correctly refused. |
| Derived list typed loosely | **CONFIRMED (type) / REFUTED (exposure)** | A hand-written copy that omits a member, and one that also invents a member, both compile with zero errors. But a behavioural suite already catches the drift: 5 named tests go red, other suites stay green. |
| Cross-repository reordering | **CONFIRMED (nothing reads the order) / REFUTED (cross-repo risk)** | Reverting to the old order: 57 of 59 pass, zero red. A rename control turns 1 named test red. The contract file exists in only one of the three trees. |
| Commit message overstates the gain | **CONFIRMED** | Two older tests already asserted what the message claims is new; breaking the cited line turns 6 tests red including both. The real gain is the inverse: injecting a new contract key turns **only** the replacement red. |
| Browser-surface token | **Decision brief, not resolved** — left open by instruction | One correction that changes the arithmetic: the earlier note that the token pattern has no underscore is wrong; a byte-level read shows underscore is included, so the silent-drop objection to tightening does not apply. Both options cost exactly one red test over one fixture line. Recommended option ships on and does not block the push. |

**Incidental, on no list:** a mirror-drift check skips everywhere, including where its own header says it
runs, because it selects the copy by probing for a file that copy does not carry. The drift it exists to
catch is total, and totality is what disables it. Fix: probe for the directory, not a file inside it.

### 4.3 UNRESOLVABLE HERE — belongs in the real-box packet

| Item | What settles it |
|---|---|
| Whether the Go opt-out state list really mirrors the shared contract list | The local checkout does not carry those symbols on the branch on disk. Settles on a checkout carrying that work: list the symbols and compare membership (not order) against the contract's two lists. |
| Whether the narrowed machine credential file blocks a non-elevated install | Narrow the file to system-and-administrators only, then run a non-elevated package install **without restarting the daemon**, and record whether the shim blocks, degrades, or proceeds. |
| How wide the identity-key exposure window really is | Measure real daemon-restart intervals on a managed fleet (reboot, upgrade, crash-restart). The repair itself is proven; the interval is the exposure. |

All three are added to the real-box packet.

---

## 5. Still open

### Needs the owner

1. **Whether the disk-format rule keeps the narrowed pattern or moves to the anchored path.** The change
   made in this pass removes a blocking control for variable and unreadable targets (finding 2). The
   alternative was measured at 11 of 11 correct. This is a fleet-wide detection decision.
2. **Whether the flat pattern pass gets a command-word anchor.** All eight high-severity command classes
   fire on a mere mention. Fixing it changes detection across the whole fleet on the enforcement path.
3. **Whether a distro the product can see but cannot probe should drop the status verdict.** Reversing
   today's answer makes the command non-zero on every machine with a stopped distro.
4. **The status column that reads "Active" beside an unmeasured guard.** The fix is a column rename,
   which is visible to every operator.
5. **Which enforcement posture C12 is measured against.** Neither lane measured is the one enforced
   today.
6. **The browser-surface token decision** (§4.2, last row) — brief is ready, does not block the push.

### Needs a real box

* Nothing in any lane ran on a real endpoint. Named blockers: no local stack was up; four agents were
  working in parallel checkouts; the only guard daemon on this machine points at production.
* The three items in §4.3.
* The end-to-end agent session (C12-b), the approval-prompt transport, the 120-second unanswered-prompt
  hold, and the wording a developer actually reads when interrupted.
* Whether any backend produces the shapes the five console surfaces were fixed against.
* The narrow-width layout sweep over the changed console panels.

### Needs the push

* Every fix in this register sits on local branches. **The disk-format false positive is fixed on no
  endpoint** — every enrolled endpoint still blocks a developer who searches for, documents, or commits
  about that class.
* The new pull-request check step has never run on a hosted runner.
* The database-backed test that pins the cap on both read surfaces has never executed anywhere.
* ~~Two backend packages remain red on this branch for a reason unrelated to this work (storage-assurance
  and convergence). Proven pre-existing at the base commit in a throwaway checkout.~~
  **CORRECTED 2026-08-19 — THIS CLAIM WAS WRONG, AND FIXED IN `1eaee322` on `fix/go-assurance-determinism`.**
  The two reds are `internal/policybundle` (agent-side, not backend):
  `TestMeasuredStorageAssuranceMovesWithTheActualFile` and
  `TestConvergencePersistsBeforeAckAndRetriesByteIdentically`. They are NOT pre-existing.
  `d044aed6` ("measure storageAssurance instead of asserting it", register #4) replaced a
  hardcoded `OS_PROTECTED` constant with a real measurement; before it both tests passed
  trivially and could not have failed. The "throwaway checkout at the base commit" that
  produced the pre-existing verdict must have been at a base that already contained
  `d044aed6`, so it measured the same defect and read it as the floor.
  What they actually were: (a) the convergence took its ONE storage measurement BEFORE the
  same pass rewrote and re-hardened the credential file it was measuring, so the signed ack
  described a store the endpoint had already left and a retry was not byte-identical — a real
  defect on the signed-ack path; (b) the policybundle test still asserted `OS_PROTECTED` for a
  file whose OWNER is the unprivileged test user, the identical assertion review round 2
  (`930dac43`) had already corrected in `winacl` as a pinned fail-open, and which this copy
  missed. Both settled in `1eaee322`; see CARRIED-FORWARD.md.
* One console suite times out under full-suite load and passes 38 of 38 alone, so a CI run could show
  red for a reason unrelated to this branch.

---

## 6. New findings from this pass, not yet fixed

### Credential path — first, because this class can permanently disable endpoints

**1. A machine credential file narrowed by hand stays narrowed, and nobody knows what a non-elevated
install then does.**
The self-heal that runs at daemon start skips any machine secret whose permissions are already stricter
than canonical. For the daemon token that is harmless — the token permissions are re-applied
unconditionally moments later in the same start, which was observed directly. The credential file has
no second writer: its hardening only runs when the file is written. So a credential file narrowed to
system-and-administrators only stays narrowed across restarts. Proven in the same run with a
discriminating control: a genuinely loose set of permissions **is** repaired, so the skip is correctly
targeted and the credential file simply has nothing to re-widen it.

*What is not established:* whether a non-elevated install shim that cannot read that file fails open or
fails closed. That single observation decides whether this is cosmetic or a block on every package
install on that machine. It is the only part of this item that could not be settled here, and it is in
the real-box packet.

**Do not treat this as closed. Do not soften it. Nothing was changed here.**

**2. The endpoint identity key is exposed for one daemon start after its permissions are loosened, and
the width of that window is unmeasured.**
The repair is proven: the extra read permission is removed and the bytes survive. Two independent
repairs cover the same file, which is why the first attempt to defeat this test failed. The exposure is
exactly the interval between the loosening and the next daemon start, and that interval has never been
measured on a managed fleet. Also confirmed: the script install path calls the hardening command without
the flag whose branch contains the bulk-hardening step.

### Then, most severe first

**3. The disk-format class now stops firing whenever its target is not a literal device path — a
blocking control lost, with no test covering it.**
The false positive lived on the pattern pass that has no command-word anchor. The fix instead narrowed
the shared pattern to require a literal device operand, which weakens the anchored path too. Measured by
the reviewer against the shipped code: a variable target, a command-substitution target, an array-index
target, and any command the parser cannot read all now return **zero findings** and are allowed. The
commit message asserts nothing detectable is given up; that is false. The alternative — keep the pattern,
remove the class from the unanchored pass only — was measured at 11 of 11 correct, dropping all five
false positives and keeping all six attack shapes. *Failure it produces:* a provisioning step that reads
its target from the environment reformats a disk, the guard returns allow, and because allow
auto-approves it also bypasses the harness's own prompt. Nothing is recorded, not even a monitor-level
note.

**4. The five-minute rewrite is still live through a fourth route.**
When the user's own configuration table cannot be read — a mistyped value, or a trust-level word the
product's vocabulary does not recognise — two rows are stamped tampered, and the decision routes the
machine to the installer on every pass. Measured: 4 rewrites and 8 records over 4 identical healthy
passes, on both the command-line and the desktop branch. A vendor changing a trust-level word makes this
fleet-wide. At the five-minute cadence that is roughly 576 records a day into a 500-record spool, on both
branches.

**5. The shared distro enumerator drops registrations it cannot read and still reports success.**
A registration whose key cannot be opened, or whose name value is missing, vanishes from the set while
the enumerator still reports a good read. Every honesty fix in lane 2.1 keys on a **failed** read, so
this path reaches none of it. The same binary already handles the identical two conditions correctly in
a different enumerator, which emits explicit unreadable and name-missing errors instead of dropping the
row. *Failure it produces:* a machine with two registered distros, one unreadable, reports one distro,
"1 of 1 governed", and exit 0 on all three surfaces — an ungoverned agent in the hidden distro is
invisible, and the denominator shrank to hide it. The relevant registry location is user-writable, so
this is reachable without elevation. The function has no seam and no test.

**6. The enrolment summary now asserts that nothing is governed on machines it just governed.**
The new line fires whenever the governed list is empty and an agent home exists on disk. The governed
list excludes two buckets that are governed on the wire path. Captured verbatim, two adjacent lines on
one run: a success line saying desktop egress is governed for the agent, immediately followed by "AI
agents are installed here and none is governed after this pass. The reason for each is printed above" —
where the reason printed above is a success message. Before this change the same condition printed a
benign wrong line; it is now an active false alarm.

**7. A count line prints a non-number and silently drops its own warning banner.**
The coverage line bypasses the guard that exists to reject non-numeric values from the wire. When the
total is absent, the arithmetic produces a non-number, the page prints it, and — worse — the "coverage
incomplete" test evaluates false, so the banner goes silent while an unreadable row is on screen
directly below. Same fault class this pass fixed two commits later on a different surface.

**8. The coverage panel accuses the server of disagreeing with rows that were never served.**
The comparison runs with no scope guard, unlike its sibling panel. When a summary is served without a
matching row list, it compares a real number against zero and reports a disagreement in every bucket.
The note then promises the smaller number is shown, but the server's numbers are rendered unchanged.
Reproduced: a permanent page-level accusation on a healthy fleet, with nothing on screen backing it.

**9. A stored key that a console panel reads is discarded before it is written.**
Two array fields on a drift event are dropped by the write-time sanitiser, which keeps only simple
values. The read side then filters on one of those very fields being an array, so that filter can never
be true and the guard-health column can only ever read "not reported". The existing test cannot see it:
it asserts against a mocked write boundary, i.e. the object before sanitising. *Failure it produces:* an
endpoint's in-page guard fails open, the beacon is accepted with a success response, and the console
reads "not reported" for that endpoint forever.

**10. The opt-out strip is fixed on one of its two branches.**
The whole reconciliation is gated on the row list being the entire scope. When it is not, the code is
exactly as it was before the fix, and the only addition is a truncation note that never says the number
can contradict a row on screen. Reproduced against the real panel: a tile reading zero above a row
reading "not reported", with no disagreement note. The guard is broader than it needs to be — the rows
are a subset, so the row tally is a floor and the "show the smaller claim" rule is still sound there.

**11. The write-time cap on stored findings is 32, and it is silent and order-dependent.**
The first 32 raw entries survive, in the order the endpoint sent them, before any per-entry validation,
and each class name is cut to 64 characters. Nothing records that truncation happened, and because the
severity band is derived from the survivors, an entry past position 32 influences neither the rows nor
the band. *Failure it produces:* a scan yielding 40 finding classes with the most severe at position 35
shows 32 findings, no indication anything was dropped, and a band naming a lesser survivor. This is the
item worth building instead of reordering the read-side cap.

**12. Two producer packages that this work depends on run in no pull-request job at all.**
Every test invocation across all five workflow files was enumerated: neither of the two packages that
define the failed-read contract and the covered/uncovered/unknown vocabulary is named anywhere. One
workflow runs everything, but only on manual dispatch and on a platform where the Windows file does not
compile. A change to either package ships with its own tests never having run.

**13. The new pull-request step is not an unconditional lane.**
It was appended as the last step of a job, behind a 25-minute suite that contains a known flaky test,
with no always-run condition. When that suite goes red or times out, the new step reports nothing. The
idiom is already used twice elsewhere in the same file.

**14. The new failure banner renders backend-supplied text without the treatment its sibling panel
applies.** The panel one section below passes the same value through the console's text-neutralising
helper first. React escapes markup so this is not a script-injection issue, but control characters,
direction overrides and unbounded length are not handled on a newly created surface.

**15. A claim in one commit rests on a test that no production change can turn red.**
The clause presented as the general mechanism fires on nothing reachable today: every state the code can
actually produce is answered by an earlier clause. Disabling the clause turns exactly one test red — a
hand-built table — while all seven fixture-driven tests stay green. Related: the third route that commit
reports as measured live is not reachable by any shipped caller; the test only reaches it through a
test-only override.

---

## 7. State of the tree

* Local commits only, across five checkouts. **Nothing pushed. Nothing deployed. No branch switched in
  any shared checkout. Every staging used explicit paths.**
* Working trees clean at finish in every lane; every mutated production file was restored and verified
  (one compared byte-for-byte against a pre-mutation copy).
* ~~Known red, not caused by this work and proven pre-existing at the base commit: two tests in the
  agent-side policy-bundle package~~; one console suite that times out only under full-suite load.
  **CORRECTED 2026-08-19: the two policy-bundle reds were NOT pre-existing** — they were
  introduced by `d044aed6` in this campaign and are fixed in `1eaee322`. See section 5 above.
* Filter self-check was applied in every lane after four earlier failures in this campaign: every run
  used verbose output and the intended test names were read in the output, not just the totals; every
  scripted edit was confirmed on disk before the run and confirmed removed after.
