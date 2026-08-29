# Fix-and-review round 2 — register

Date: 2026-08-19. Scope: two fixes (`wsl-doctor-honesty`, `optout-reconcile-churn`) and two review units
covering work that had not been reviewed before (`merge-resolutions`, `safemetadata-sweep`).

Every claim below is either PROVEN (the evidence is named) or NOT EXERCISED (the reason is given).
Nothing here is described as working without evidence.

---

## 1. Verdict

**One of the two defects is fixed and proven with a defeat step that discriminates. One is fixed in the
product but weakly proven, and the goal it was written against — three surfaces of one binary giving the
same answer — is still not met. Separately, the review of previously-unreviewed work found a live
Windows credential-path defect that lets an unprivileged user's planted signing key become the
endpoint's own identity.**

| Unit | Verdict |
|---|---|
| `optout-reconcile-churn` (42f59f49, 130220ea, 7e3e9963) | **Fixed and PROVEN.** Five defeat runs; the reviewer independently broke the one production line and got exactly the new tests red with the named controls green. The same churn is still live on a second code path the fix did not touch — measured, not inferred. |
| `wsl-doctor-honesty` (63d64945, 9375d226) | **Fixed but WEAKLY PROVEN, and not closed.** The product code is correct, but three of the four new gate tests measure a copy of the gate that production never runs — proven by reverting the real gate and watching them all stay green. A third surface, `devoid ai status codex`, still exits 0 on the same host. |
| `merge-resolutions` (583eb76f) — review only | **A live regression on the Windows credential path**, reproduced twice by two independent lenses. See finding C-1. |
| `safemetadata-sweep` (12507584, 09ceb8cb) — review only | The sweep itself is complete for the string channel. Its headline claim — the findings array is bounded — **has no test that can fail**, proven by deleting the bound and watching the suite stay green. |

Must fix, in blast-radius order:

1. **C-1 — a planted endpoint identity survives startup self-heal and is then stamped with the machine
   secret's own permissions** (`internal/core/config/machine_secret_hardening_windows.go:57`). Credential
   path. An unprivileged local user's signing key becomes the endpoint's identity.
2. **F1-A — the doctor's strict-gate tests cannot fail when the real strict gate is reverted**
   (`cmd/devoid/wsl_enumeration_unknown_windows_test.go:168`), and the lane that runs in CI does not run
   the package that does pin the real gate.
3. **F1-B — `devoid ai status codex` still exits 0 on a host whose WSL registration cannot be read**
   (`cmd/devoid/ai_status_wsl.go:54`).
4. **F2-A — the 5-minute rewrite-and-flap is still live on the CLI branch** through a second verdict
   (`internal/aiwire/aiwire.go:359`); measured at 4 rewrites and 8 ledger events over 4 healthy passes.
5. **R2-A — the findings-array bound has no failing test** (`ai-query.service.ts:2421`).

---

## 2. The fixes

### 2.1 `wsl-doctor-honesty` — commits 63d64945, 9375d226

**What it changes.** When Windows will not let DeVoid read the list of installed WSL distributions, the
product used to report the box as governed anyway. After the fix, that state renders as UNKNOWN with a
"?" marker, raises a critical line, and makes `--strict` exit non-zero instead of exiting 0. The producer
now carries an explicit `EnumerationUnknown` flag so downstream code can branch on the fact rather than
on the wording of a message.

**The defeat step (what was broken, and what went red).**

- Baseline, before the fix: the summary printed `WSL v 1/1 distros governed`, the footer printed
  `Exit 0`, and four new tests failed.
- Defeat 1 — flipped the producer's `EnumerationUnknown: true` to `false` in
  `internal/pathfix/pathfix_windows.go:381` and nothing else. Three tests went red, including the roll-up
  test, which proves the roll-up test reads the real producer and not a hand-built value.
- Defeat 2 — deleted only the renderer's unknown branch. The original headline reappeared verbatim and
  exactly one test went red.
- Defeat 3 — reverted only the command-layer gate. Three tests went red.

**Controls that stayed green.** `TestGovernedDistroStillPassesBothStrictGates` (so the change fails
closed on the unknown case, not on every case), `TestUnreadableRegistration_DoesNotFailTheNonStrictRun`,
`TestDoctorRollUp_NothingExcludedRendersNoExclusionLine`, and in defeat 3 the roll-up render test —
which is itself the tell that a render test cannot substitute for a gate test.

**What the fixer deliberately did not fix.** The background path watcher still does not treat "cannot
tell" as something to repair, on the stated ground that `doctor --fix` cannot make the registry readable
and would otherwise re-run forever with no effect. `devoid ai status codex` was left untouched as
"already correct". No unknown bucket was added to any JSON output. The exit code for unknown reuses the
existing WSL code rather than getting its own.

**Residual risk on a real endpoint (NOT EXERCISED, reasons given).** The real binary was never run
against this box's real registry — the only enrolled agent here points at production and was not touched.
So the unknown branch has only ever been observed through an injected seam. On a real endpoint, any
registry error other than "key does not exist" now produces UNKNOWN, including a run under a service
account whose own registry hive legitimately has no WSL key; if an installer or CI step calls
`doctor --strict` from such a context it will start failing where it previously passed. Boxes with a
registered distribution that is present but not enrolled now count as critical in the footer where they
previously counted as a pass.

**The review of this fix, and whether the reviewer agreed it is closed.**
**The reviewer did not agree it is closed.** Two high findings and two medium.

- **F1-A (high) — the command-layer "gate" tests stay green when the real gate is reverted.**
  `cmd/devoid/wsl_enumeration_unknown_windows_test.go:168`. `doctor --strict` takes its WSL verdict from
  `pathfix.computeInspectExit`; the command-layer gate only runs when that already returned 0, so its WSL
  branch is unreachable in production. Measured: reverting `internal/pathfix/pathfix.go:475` to the old
  predicate — the exact line the product executes, defect restored — left
  `TestDoctorStrict_UnreadableRegistrationFailsTheGate` PASSing at 15.82s and the whole command package
  green. The one end-to-end assertion (`ExitCode == 0`) is satisfied by an unrelated failure that
  contributes exit 30 on any box whose shim is not on the path. Compounding it: the CI job runs
  `go test ./cmd/devoid/...` only; `internal/pathfix`, the package that does pin the live gate, runs in no
  job on that lane. *Fix:* assert on the message text, which the unrelated failure cannot produce, and on
  the exact exit code; assert the report returned by `pathfix.Fix` itself rather than re-running the
  inspect gate over its rows; add a control where enumeration succeeds and the other check fails.
- **F1-B (high) — `devoid ai status codex` still exits 0 on the same host.**
  `cmd/devoid/ai_status_wsl.go:54`. It prints "this is an UNKNOWN, not a clean result" and then returns
  "nothing uncovered", so the caller's verdict is true, the banner says both layers are clean, and the
  process exits 0. The test the fixer cited as evidence it was "already correct" asserts the printed word
  and never the returned value or the exit code. After this fix, on the same box: `devoid wsl list` exits
  31, `doctor --strict` exits 31, `ai status codex` exits 0. *Fix:* return the unknown as its own value
  and drop the verdict on it; assert the return, not the text.
- **F1-C (medium) — the doctor footer has no test at all.** `cmd/devoid/doctor_fix_render.go:845`. The
  function that produces "N critical / N warnings / N passed" is referenced by no test. Measured:
  deleting the unknown case reddens nothing, and on an otherwise-clean Windows box the footer then prints
  zero criticals directly beneath a critical line saying the registration could not be read — the
  original defect, one line lower, with the suite green. *Fix:* assert the counts computed from the real
  producer's rows, scoped to the WSL rows so unrelated criticals cannot satisfy it.
- **F1-D (medium) — two gates in one binary now rank the same two failures differently.**
  `internal/pathfix/pathfix.go:474`. `doctor --strict` now checks WSL before the shim check;
  `doctor --fix --strict` still checks the shim first. A host with both problems now gets 31 from one and
  30 from the other, and the operator is pointed at the registration when the real blocker is the shim.
  The end-to-end workflow at `.github/workflows/finding-b-e2e.yml:530` accepts only 0 or 30 and will throw
  on 31. Neither new test pins the code. *Fix:* pick one order, apply it to all three gates, assert the
  code explicitly, and update the workflow arm.

### 2.2 `optout-reconcile-churn` — commits 42f59f49, 130220ea, 7e3e9963

**What it changes.** On a box running a Codex client version DeVoid has not confirmed, the reconcile loop
could not attest two of its checks, rolled the result up as a coverage downgrade, and rewrote the managed
profile on every pass — every 5 minutes, forever, opening and closing a ledger window each time. The fix
recognises "the route is installed, we simply cannot attest it" as a distinct state, records it as such,
and stops rewriting. Genuinely missing or drifted items are still repaired.

**The defeat step.** Reproduced first against unmodified code: 4 identical healthy passes produced 4
rewrites and 8 ledger events. After the fix, 0 and 0. Then:

- D1 — removed only the desktop branch's no-rewrite arm: exactly the two expected tests red, every other
  test in the package green.
- D2 — removing the guard for unknown states reddened nothing, which exposed a weakness in the fixer's
  own tests; two new tests were added (a drifted always-on control must still be repaired), and the
  re-run then produced exactly those two red.
- D3/D4 — removing either of two clauses individually reddened nothing; the two are redundant today. This
  was reported rather than claimed as strength.
- D5 — removing both: exactly the unknown-member test red.

**Controls that stayed green.** `TestReconcile_VerifiedDialectRemainsAZeroEventNoOp` (a confirmed client
version stays a zero-event no-op), the CLI-lane no-churn test whose arm was untouched, and every
pre-existing anti-thrash test. Their staying green is the direct proof the shipped suite could not have
caught this: none of those fixtures plants a version file, so the gate never arms.

**What the fixer deliberately did not fix.** The CLI-only path still accepts only one verdict as "in
order", so a box carrying foreign configuration keys re-writes the full profile every tick — flagged, not
touched. A redirected home plus an unconfirmed version still churns. No entry was added to the confirmed
client-version list, because there is no vendor evidence for it. Nothing about whether the hook layer
actually enforces on that client version changed — the fix only stops DeVoid pretending a rewrite repairs
it. Two time-boxed daemon tests failed once under parallel load and pass in isolation at HEAD and on an
untouched baseline; not treated as defects.

**Residual risk on a real endpoint (NOT EXERCISED, reasons given).** Nothing ran against a real box, the
real daemon loop, or the real spool — the enrolled agent here points at production. On first pass after
deploy an affected box's ledger value migrates silently; a box whose ledger cannot be read or written gets
no event by contract and that path is untested. Boxes installed through the vendor's third channel expose
no version to read, so the gate never arms and the fix is unverifiable on them. Any other cause of the
same downgrade — for example a home directory DeVoid cannot read — still churns identically. The only
witness for "did it rewrite" is the file timestamp. Affected endpoints remain unattestable; the report is
now stable and honest instead of oscillating, but the underlying coverage gap is unchanged and an operator
who reads the quieter ledger as "fixed" would be wrong.

**The review of this fix, and whether the reviewer agreed it is closed.**
**The reviewer agreed the desktop-lane defect is closed and discriminating** — they broke
`internal/aiwire/ungoverned_window.go:183` themselves and got both no-churn tests red with all four named
controls green, and confirmed the second breakable line in `internal/codexmanaged/nochurn.go:99`. They
then found the same failure still live elsewhere.

- **F2-A (high) — the identical 5-minute rewrite-and-flap is still live on the CLI branch.**
  `internal/aiwire/aiwire.go:359`. That branch accepts only one verdict as "in order". Any user-owned
  configuration key the managed layer does not pin — including a directory the user marked as trusted,
  which Codex itself writes on approval — produces a second verdict which is equally unrepairable by
  writing, because the installer preserves that configuration by design. The desktop branch was given an
  exemption for exactly this; the CLI branch was not. Measured with a probe (since removed, tree clean):
  4 rewrites out of 4 passes, 8 ledger events, file timestamp advanced. At the 5-minute cadence that is
  roughly 576 records a day from one caller into a 500-record spool — genuine tamper evidence evicted
  inside a day, on a box where nothing is wrong. The population hit is boxes on a **confirmed** client
  version, i.e. exactly the population the fix's own named control declares zero-event. *Fix:* add the
  second verdict to the CLI branch's accept list with the desktop branch's existing justification, pin it
  with the probe's shape, and keep a negative that a genuinely missing item still reaches the installer.
- **F2-B (medium) — enrolment now prints "No AI agents detected to wire" over an installed, governed
  Codex.** `cmd/devoid/setup_installer.go:497`. The count of governed agents was never updated for the
  new state bucket, so a CLI-only box on an unconfirmed client version — profile installed, correct,
  daemon serving, traffic going through the proxy — reads that line at enrol time and in the log. The
  commit message claims the opposite. No test exercises that count. *Fix:* include the new bucket (and
  decide about the pre-existing desktop bucket, which has the same gap); assert the summary text against a
  real fixture.
- **F2-C (medium) — the no-rewrite test pins which reason may be unattestable but not which check.**
  `internal/codexmanaged/nochurn.go:95`. Today only two checks can carry that reason, so this is latent,
  not live. The moment a third check becomes version-dependent, a genuinely repairable always-on control
  would be absorbed into silence on every box outside the confirmed versions, with no test going red.
  *Fix:* pin the check identifier as well as the reason, and add the negative case that proves it.
- **F2-D (medium) — the distinct ledger wording the commit calls its operator-facing deliverable is
  asserted by no test.** `internal/aiwire/ungoverned_window.go:183`. The value appears in zero test files.
  Because a governed-to-governed value change emits no event by design, swapping it back to the "verified"
  wording keeps every test in the repository green — and every affected endpoint would then record
  "verified" over an attestation that could not run. *Fix:* read the ledger back after the steady passes
  and assert the stored value, plus the transition case when the version becomes confirmed.

---

## 3. Findings against the previously-unreviewed work — CONFIRMED

### C-1 (HIGH, CREDENTIAL PATH) — a planted endpoint identity survives startup self-heal, and is then stamped with the machine secret's own permissions

**Where.** `internal/core/config/machine_secret_hardening_windows.go:57`.

**Mechanism, plainly.** Commit 583eb76f wrapped the whole identity-migration call in a check on whether
the *credentials* file is already at least as strict as required. That migration does three separate
jobs, and the first one is deleting an endpoint-identity file that does not belong to this endpoint. When
the credentials file has been hardened past the shipped permissions — which is the state the product's own
"locally readable" report pushes operators into, and the state two of this commit's tests pin as
supported — the check fires and the planted-file deletion never runs. The loop immediately below then
finds the planted file, sees it is not strict enough, and rewrites its owner, group and permission list to
the machine-secret values. The planted file now looks like ours. The endpoint reads the attacker's signing
key back as its own identity.

The failure that motivated the gate is not reachable in production: the "Access is denied" error only
occurs to an unprivileged test process that removed itself from the file's permissions. The Windows daemon
runs as LocalSystem, which the machine-secret permissions grant full control, so that read succeeds in the
field. The commit's claim that "every startup pass reports Access is denied" does not hold for production.

**Failure scenario — PROVEN, twice, by two independent lenses, with a discriminating control.**
Using the repository's own fixture, which installs the real permissions through the real hardening call:

- Control — credentials file left as shipped, planted identity file present: the planted file **is
  removed**. PASS.
- Defect — same, but the credentials file first hardened past the shipped permissions (the exact shape a
  LocalSystem daemon sees, with the read still succeeding, asserted as a precondition, and a second
  precondition confirming the skip really fired): the planted file **survives**, and inspection now
  reports it as ours, carrying the machine-secret owner and permission list, still holding
  `{"aiEndpointSigning":{"keyId":"planted"}}`.
- Defeat — forcing the gate off flips the defect probe to PASS and turns exactly the two tests the commit
  cites red, with the three repair-direction tests green. So line 57 is the cause, and the two properties
  genuinely trade against each other in the current shape.

Reachability is operator-induced, not the shipped default: it requires the credentials file hardened past
the shipped permissions, plus a plant in the machine scope, which the code's own comments document as
reachable because ordinary users hold write and append rights on the containing directory. The elevated
installer path still removes the plant.

One reproduction went further and found the hole is **wider than this commit**: with no credentials file
at all — an unenrolled or first-run box — the migration returns early before the plant check, so the plant
survives and is hardened onto the secret boundary there too, and that probe fails identically with the
gate forced off. This commit added a second entrance to a pre-existing gap rather than creating the class.

**Suggested fix.** Do not gate one file's handling on another file's strictness. Split the migration so
the planted-file removal and the identity validation always run, and gate only the credentials rewrite —
the sole part whose exposure argument holds. Better still, move the plant check out of the migration and
into the hardening loop, keyed on the identity file itself, which also closes the no-credentials-file
entrance. If the goal is also to silence the unprivileged read error, tolerate access-denied on that one
read rather than skipping the pass. Then add the regression that is missing: a planted identity must be
removed by the startup reconcile in **both** credentials states.

**Also noted during reproduction:** a leftover probe file, `cmd/devoid/zz_probe_plant_windows_test.go`,
was still in the working tree and does not compile, which was failing `go vet ./cmd/devoid`. It was moved
out to scratchpad; the tree now vets clean.

**Items attacked and cleared in the same unit (each stated with its reason, not assumed):** the surviving
permissions helper — all nine callers pass exactly one path, so its output assertion spuriously fails
nobody, though it is fragile on a non-English Windows; the test-principal seam — every production caller
passes nil, the only non-nil producer is reachable solely behind a test override, and it can only suppress
a rewrite, never authorise one; and the allowlist equality test, which still enforces exact set equality —
though the merge message's stated reason for splitting it is wrong, and the cross-group check it added
guards only the test's own literals, not production.

### C-2 (HIGH) — the findings-array bound is the sweep's headline claim and no test can make it fail

**Where.** `src/ai-governance/services/ai-query.service.ts:2421`.

**Mechanism, plainly.** The commit introduced a cap of 100 on how many detector findings a stored row may
project to the console, and its message calls that proven. The only test covering it seeds 5,000 entries
where entry 0 is well-formed and entries 1–4,999 have an over-long class name. Those 4,999 are rejected by
the per-entry length check regardless of the cap, so the result is one entry either way. Both of the
test's assertions are satisfied identically with and without the cap. The constant appears in no test file
in the repository. Ingest does not bound the array either: the three DTOs that feed it declare no maximum
size, while sibling arrays on the same DTOs do — so the cap is load-bearing, not redundant.

A second, untested behaviour is bundled in: because the cap is applied before per-entry validation, an
array whose valid entries begin past index 100 projects nothing and the key disappears entirely — the
opposite of what the code comment says the cap is for.

**Failure scenario — PROVEN.** Driving the real function (not a copy): with the cap present, the seeded
payload projects 1 entry; with the cap deleted, it still projects 1 entry and both assertions still
evaluate true. The controls flip, which is what makes this evidence rather than noise: an all-valid 5,000
array goes 100 → 5,000, and a late-valid array goes key-absent → 4,800. So a later refactor that removes
or raises the cap ships a megabyte-scale array to both console read surfaces with CI green.

Note on live risk: the shipped code is correct today. What is defective is the proof, and the exposure to
a silent regression.

**Suggested fix.** Seed more than 100 entries that are **all** well-formed and assert the length equals
the cap exactly. Add a second case whose valid entries start past the cap and assert the intended
behaviour explicitly — either the head is kept, or, if dropping the key is intended, say so in the comment
instead of claiming the row keeps its findings.

---

## 4. Plausible — needs a human call

### P-1 — `approvalSurface` was widened to free text, citing a test fixture that says the opposite

**Where.** `src/ai-governance/services/ai-query.service.ts:2488`.

**The disagreement, and why it could not be settled here.** Two independent lenses reached opposite
verdicts and both are partly right, so this is a judgement call, not a measurement gap.

Agreed facts, both proven: the comment justifying free text cites a fixture at
`ai-prompt-check.dto.browser-fields.spec.ts:144` which sits inside a test titled "rejects any other
surface claim, including free text" and asserts that exact string is **rejected**. The producer contract
allows one fixed value. The comment even contradicts itself four lines later. The new suite now writes the
producer-invalid sentence into its "must project" set, so correcting the gate turns that test red as if it
were a regression. Reproduction confirmed a 48-character string containing markup comes back verbatim from
the read surface, with a 72-character control going red — so the assertion is live and the pass is a real
projection. The lenient write path that reaches it is real: the ingest objects are declared as free-form
with no key allowlist.

Where they split: one lens holds this is not a defect at all, because the change **tightened** a
previously unbounded raw passthrough down to 64 characters with control characters refused — there is no
regression — and because the file carries a deliberate, uniformly applied decision against closed
vocabularies on the read side, on the ground that endpoints upgrade ahead of the server. It also showed
the suggested remedy does not stop the stated harm: an all-caps underscore or dash form still passes a
token check. The other lens holds the citation is inverted, the comment misleads the next reader, and the
producer-invalid value is now pinned as required output.

**What would settle it.** An owner decision on one question: should the read side gate this field to the
one value the producer can emit, accepting that a newer endpoint emitting a new value would be silently
dropped — or stay bounded-but-free and fix only the comment and the test fixture? Note for whoever
decides: the token pattern in this file has no underscore, so a naive tightening would drop the
lowercase-underscore form that appears in agent source, reintroducing exactly the silent-drop failure the
no-vocabulary decision exists to prevent.

Impact if left as is: a misleading approval label on the console, not script execution — no HTML sink was
demonstrated and the view layer escapes output.

---

## 5. Test quality per unit

On this project, a test that cannot be made to fail is NOT-RUN, not PASS. Flagged loudly:

- **`wsl-doctor-honesty` — THREE OF FOUR NEW GATE TESTS ARE NOT-RUN.** Reverting the line
  `doctor --strict` actually executes leaves all four command-package tests green (measured,
  `TestDoctorStrict_UnreadableRegistrationFailsTheGate` PASS 15.82s). The one end-to-end assertion is
  satisfied by an unrelated failure. The repair-path test never reads the exit code it claims to check.
  Only the `internal/pathfix` package pins the live gates, and that package is not in the CI job that runs
  on pull requests. The doctor footer has **zero** coverage: deleting its unknown case reddens nothing.
  Inert shapes present: one branch of a multi-branch route left untested, and an assertion satisfied by
  unrelated noise — the very contamination the fixer stated they had removed.
- **`optout-reconcile-churn` — tests are live and discriminating, with one named hole.** Two separate
  production lines were broken and produced exactly the expected reds with four named controls green. The
  fixer's own second defeat round found and fixed a weakness in their own tests. The remaining hole: the
  ledger wording at `ungoverned_window.go:183` is asserted nowhere, so swapping it for the misleading
  value keeps the whole repository green.
- **`merge-resolutions` — the suite is live but measures the wrong thing.** Breaking line 57 does turn the
  two cited tests red with three controls green, so it is not inert — but both reds fire on an error
  string, not on any permissions assertion (their comparisons never execute), and that error is only
  producible by a test process that removed its own access. Nothing anywhere asserts the planted-file
  removal in the skipped state, which is why a fresh probe was needed. On the mirror side the shape is
  "precondition silently skips the assertion" plus "only known members of a closed set exercised": the
  dropped-key tests only ever run with an undeclared key present, and the window-row test asserts one key
  is absent while saying nothing about the dropped-key list — so the real producer's output cannot redden
  anything.
- **`safemetadata-sweep` — one headline test is NOT-RUN; the rest of the suite is red-capable.** The cap
  test cannot fail (section 3, C-2), and the constant appears in no test file. Against that: reverting the
  calendar check flips ten payloads across both keys and both read surfaces, and deleting the role wrapper
  flips the source pin — measured, because the nearest other occurrence of that identifier is 1,801
  characters away, well outside the pin's window. The suite also avoids the five known inert shapes: it
  asserts the stored row separately from the projection, its preconditions throw rather than skip, it
  feeds keys the projection has never heard of plus prototype names, and it exercises both read surfaces.
  Separately, the hypothesis that this suite does not execute in CI is **refuted**: the pattern selects it,
  two workflows enable integration runs with a live database, and a guard fails the run on any discovered
  suite that is skipped.

---

## 6. Capped, not cleared — UNVERIFIED, not clean

These were found and written up but not driven to a verdict. They are open, not absolved.

**From `merge-resolutions`:**

1. **The dropped-key report cries wolf on the most common row on the channel.**
   `internal/security/system_evidence_integrity.go:230`. A declared key whose value is empty is counted as
   dropped, and the command-side producer always sends two identity keys, empty on wire transitions. The
   daemon-side producer omits empty values; the command side was never brought into line. The resulting
   row reports both identity keys as dropped when the producer never supplied them — verified by feeding
   that exact map through the real normaliser, but the operator-facing consequence was not chased. *Fix:*
   treat an empty value as not supplied; report only genuinely refused keys; add the missing row to the
   mirror test.
2. **The dropped-key report is capped after sorting, so a hostile producer chooses what stays visible.**
   `internal/security/system_evidence_integrity.go:253`. Names are sorted alphabetically then truncated to
   16. Digits sort before letters, so sixteen short numeric names guarantee that the drop of a real
   declared key is evicted. Nothing records that truncation happened, so a truncated report is
   indistinguishable from a complete one. Verified by feeding a crafted record through the real
   normaliser. *Fix:* rank meaningful drops first, then fill; and mark the report when anything was
   elided.

**From `safemetadata-sweep`:**

3. **`riskScore` is the one numeric field left unchecked, and its test feeds only non-numbers.**
   `src/ai-governance/services/ai-query.service.ts:2380`. The commit names -1, 1.5 and 1e308 as the defect
   it fixed for counts, and every one of those still passes under this key — measured against the real
   projection. The hostile table feeds this key only strings and objects, never a number, so the gap is
   invisible to the test that swept it. *Fix:* range-gate to 0–100 and add those three values to the
   table.
4. **The text gate claims to close the forged-line channel but passes the Unicode form of it.**
   `src/ai-governance/services/ai-query.service.ts:171`. Newline and carriage return are refused;
   U+2028, U+2029 and the right-to-left override are not — measured as passing under three keys. A stored
   value can still render as two lines in any viewer that honours them, or display a different account
   name than the bytes say. Affects every text field in the projection. *Fix:* refuse those code points
   as well, or narrow the comment to say what is actually refused, and add the payloads to the table.

**Also carried forward from the two fixes, unverified for the stated reasons:** neither fix was run
against a real endpoint, because the only enrolled agent on this box points at production and was not
touched. Every endpoint-level consequence in section 2 is NOT EXERCISED.
