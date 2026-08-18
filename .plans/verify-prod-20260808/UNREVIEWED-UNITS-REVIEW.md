# Unreviewed units — adversarial review register

Date: 2026-08-18
Scope: the 7 code units that had never been through an adversarial review.

| Unit | SHA | Area | Worktree |
|---|---|---|---|
| go-cxhooks | 47c74d7b | Go / Codex readiness surface | C:/cwt/fixgo-cxhooks |
| go-cred2 | 6a870882 | Go / Windows credential ACL self-heal | C:/cwt/fixgo-cred2 |
| go-optout | 12674b04 | Go / aiwire ungoverned-window ordering | C:/cwt/fixgo-optout |
| go-wsl | ae74cd8a | Go / WSL doctor roll-up (test-only commit) | C:/cwt/fixgo-wsl |
| go-creds | 7e000113 | Go / credential mint guard | C:/cwt/fixgo-creds |
| be-allowlist | 59e76f5f | Backend / opt-out allowlist | C:/cwt/int-be |
| be-optout-runtime | 2fe41f0d + 08d24367 | Backend / opt-out contract coupling | C:/cwt/int-be |

Every finding below already survived at least one attempt to refute it. Findings that all
refuters killed were discarded before this document was written and do not appear here.

---

## 1. Verdict

**2 CONFIRMED, 2 PLAUSIBLE, across 7 units. 3 units came back with no finding that survived
verification. 13 further items were reported but never adversarially verified — they were
capped, not cleared.**

- **CONFIRMED (2)** — each reproduced independently by two reviewers using different methods,
  both of whom ran code rather than only reading it:
  - go-optout 12674b04 — a config-rewrite-and-flap loop that fires every 5 minutes forever on a
    real, healthy endpoint.
  - go-wsl ae74cd8a — `devoid doctor --strict` prints a green all-clear and exits 0 when it
    cannot read the WSL registration at all.
- **PLAUSIBLE (2)** — survived refutation but the two lenses disagreed, or the environment
  needed to settle it was not available:
  - go-creds 7e000113 — the credential mint guard still destroys a live endpoint signing key on
    a write-loosened file. One reviewer reproduced the key being overwritten on real Windows
    permissions; a second reviewer argues the state is a deliberate design decision.
    **Unrecoverable failure mode, so it is listed first in section 2 regardless of the split.**
  - be-allowlist 59e76f5f — the shipped behaviour is correct today; what is broken is that no
    test can tell the safe version from an unsafe one.
- **No verified defect (3)** — go-cxhooks 47c74d7b, go-cred2 6a870882, be-optout-runtime
  2fe41f0d. This is not the same as clean: all three carry capped items (section 5), and
  go-cred2's capped item describes a fleet-wide `npm install` brick.

### Safe to merge / not safe

**NOT safe to push as they stand:**

- **go-creds 7e000113** — the mint guard can permanently brick an endpoint. Nothing else in this
  register has an unrecoverable failure mode. Needs an owner decision before it moves.
- **go-optout 12674b04** — ships a live flap that rewrites the user's Codex config on every tick
  and evicts tamper evidence from the 500-record spool. The commit asserts this window is closed;
  it is not, for a real population.
- **go-wsl ae74cd8a** — a test-only commit whose own headline claim (three roll-up surfaces now
  agree) is false on the branch it does not test, and the disagreement is a false green on a
  security gate.

**Safe to merge with a follow-up ticket, not a code change:**

- **be-allowlist 59e76f5f** — runtime behaviour is byte-for-byte identical to what it replaced
  and the fail-safe default is correct. The single fixture that would make the gate testable is a
  one-line addition.
- **be-optout-runtime 2fe41f0d + 08d24367** — no verified defect. Two capped items concern a
  shared contract that was reordered for a property nothing reads, and a commit message that
  overstates what its test gained.

**No verified defect, but do not read that as verified-correct:**

- **go-cxhooks 47c74d7b** — the new classification works in the direction it is tested in. The
  opposite direction is untested to the point that replacing the whole predicate with `return
  true` leaves every test green.
- **go-cred2 6a870882** — the permission-loosening class it targets really is closed and the
  descriptor table really is breakable. Its capped item (the daemon token) is the item in this
  register with the widest fleet impact after the mint guard.

---

## 2. Must fix before push

Ordered by blast radius. The credential path comes first because that class of failure cannot be
undone from the endpoint.

### 2.1 — go-creds 7e000113 — a write-loosened permission on the endpoint's own key file makes DeVoid overwrite the real signing key

`internal/core/config/endpoint_identity.go:136`
Verdict: **PLAUSIBLE (split)** — one reviewer reproduced the key being overwritten on real
Windows permissions; a second reviewer holds that the behaviour is the commit's stated design.
Placed first because if it is real, the endpoint is bricked with no client-side recovery. Do not
push this unit until an owner rules on it.

**What happens, in plain English.** The commit gave the permission check four possible answers
(ours / unknown / read-loosened / foreign). The one caller then throws three of them away and
asks a single question: is it "foreign"? "Foreign" means "return nothing", and "nothing" is
exactly the signal that tells DeVoid the endpoint has no key yet and should mint one. The check
answers "foreign" for *any* write-type permission granted to a non-privileged account — even when
the file is owned by LocalSystem, which an ordinary user cannot fake. So a permission change on a
file that is provably ours is treated as evidence the file is somebody else's plant, and the
response to a plant is to overwrite it.

**Failure scenario (reproduced).** A healthy migrated Windows endpoint. `endpoint-identity.json`
is owned by LocalSystem and holds the key the backend row is bound to. An admin, a group policy
pass, an EDR or backup tool, or an operator "fixing permissions" grants the local Users group
Modify on that file. On the next start DeVoid reads the file as foreign, reports no identity,
mints a brand-new key over the top of the real one, and sends it to a backend row still bound to
the original. The backend answers "Endpoint signing-key rotation requires the approved rotation
protocol" — a 409, forever, with no way to recover from the endpoint. A second sink does the same
thing more directly: `MigrateMachineEndpointIdentity` deletes the file and reports success.
The reviewer reproduced both on real Windows permissions by changing one character in the
commit's own test fixture (read-and-execute becomes modify): the identity file's key changed from
the pre-planted value to a freshly minted one, and one bootstrap call was made presenting the new
key ID.

**Where the two reviewers disagree.** The refuting reviewer measured this box's real inheritance
and found that the ordinary paths (a permission reset, a group policy re-apply, a restore that
re-applies inheritance) grant the Users group read-and-execute on a *file* — read only, which this
commit does handle correctly. Reaching the destructive state on Windows needs a deliberate broad
write grant. That narrows the population; it does not change the outcome when it happens. The
Linux/WSL half is easier to reach (a world-writable restore or a recursive mode change under
`/etc/devoid`) and was confirmed by source reading only.

**Fix.** Make the answer depend on who owns the file, not only on the permission mask. Add a
fourth standing for "privileged owner, non-privileged write grant" and have the reader report it
as a credential-read denial — the same answer it already uses for a file that is present but
unparseable. Reserve "foreign means absent, go ahead and mint" for the one state an attacker can
actually produce: a non-privileged **owner**. A loudly degraded endpoint can be repaired; a minted
endpoint cannot.

### 2.2 — go-optout 12674b04 — the window this commit says it closed still opens and closes twice every five minutes, and rewrites the user's config each time

`internal/aiwire/aiwire.go:410`
Verdict: **CONFIRMED** — reproduced independently by two reviewers on the commit's own tree, with
a discriminating control that produced zero events.

**What happens, in plain English.** Before writing, the reconcile asks "is this box already in
order?" and accepts only two answers as "yes". When the installed Codex version is one whose hook
behaviour we have not confirmed, two requirement rows come back unknown and the overall answer
becomes a third value — which is never on the accept list. That answer cannot be repaired by
writing files, because it describes the installed client, not our config. So every pass decides
the box needs wiring, rewrites the profile, reports "I just wired this", and the ledger records
that governance was lost and then restored. Nothing changed on the box.

**Failure scenario (measured).** A shared-core box — the Codex desktop app, or the VS Code /
Cursor extension — with Codex CLI 0.134.0 installed through npm global, daemon healthy, profile
already wired and untouched. Four identical healthy passes produced 8 events
(`opened managed-route-missing` / `closed managed-route-repaired`, four times) and the config
file's timestamp advanced on every pass. The identical fixture with version 0.144.0 produced
"already compliant" on all four passes and zero events, so the version check is the trigger and
not the fixture. At the daemon's 5-minute cadence that is roughly 576 records a day from a single
caller — more than the commit's own stated worst case — into a spool that keeps only the newest
500, so genuine tamper evidence is pushed out within a day. 0.134.0 is the version this project's
own reference box reports.

**Scope note, stated plainly.** Both reviewers checked and this flap is not introduced by the
diff — it pre-dates it, and the health/drift reorder is a no-op for this case. What the commit
does is declare the window closed while its own regression test plants no version file at all, so
the check never fires and the test cannot go red for the flap that remains.

**Fix.** Separate "the managed layer is installed" from "the posture can be attested". Either add
a no-churn arm for the case where the only non-installed rows are the two unknown-dialect ones
(record it, do not rewrite), or gate the rewrite on an actual requirement being missing or
tampered rather than on the roll-up answer.

### 2.3 — go-wsl ae74cd8a — the doctor reports "1/1 distros governed" when it cannot read the WSL registration, and `--strict` exits 0

`cmd/devoid/doctor_fix_render.go:525` (producer at `internal/pathfix/pathfix_windows.go:373`)
Verdict: **CONFIRMED** — one reviewer traced every gate in source, a second drove the real
producer and the real renderer and captured the output.

**What happens, in plain English.** When the WSL registration cannot be read, the producer returns
one placeholder row whose distro name is "(enumeration)" and whose message says the registration
could not be read. That row leaves two fields at their default values — "installed" is false and
the exit code is zero — and every downstream check keys on exactly those two fields. So the
summary counts it as fully governed, the detail row prints a green tick next to the words "could
not be read", the critical-issues section skips it, and the strict gate contributes no failure.
The WSL package's own contract says this state means "cannot tell, and must never be rendered as
zero distros"; the doctor renders it as full governance, which is worse than zero.

**Failure scenario (reproduced).** A Windows host where the WSL registry key exists but cannot be
opened or enumerated — a permission-restricted key, or a corrupt or roaming profile hive. Captured
output: summary row `WSL  [tick]  1/1 distros governed (enrolled + daemon answering)`, detail row
`[tick] (enumeration)  the WSL registration could not be read`, zero WSL entries in the critical
list, and no failure contributed to `--strict`. A real registered, ungoverned Ubuntu on that box
is reported as governed. On the same input `devoid wsl list` prints "COULD NOT BE READ" and
`devoid ai status codex` prints UNKNOWN — so the three surfaces disagree, which is the exact claim
this commit makes they no longer do.

**Scope note.** The placeholder row's shape pre-dates this commit; what this commit adds is a
parity claim plus tests that only ever traverse the branch where enumeration succeeds. One
reviewer would file it medium on reachability grounds; the other confirmed the whole consequence
chain. It is live on this branch either way.

**Fix.** Make the placeholder row non-green: mark it installed with a non-zero exit code, or add
an explicit "enumeration unknown" flag, and give the summary an explicit unknown branch that
returns a dim "?" with the "cannot say which distros exist" text before it can reach the
"N/N governed" line. Then add a fourth case to `cmd/devoid/wsl_rollup_join_windows_test.go` whose
fixture returns "could not read" and assert the roll-up says UNKNOWN and never the word
"governed".

---

## 3. Plausible — needs a human call

### 3.1 — go-creds 7e000113 — the mint guard (full write-up in section 2.1)

`internal/core/config/endpoint_identity.go:136`

**Why it could not be confirmed.** The two lenses reached opposite conclusions on the same
evidence. One reviewer *did* observe the destructive outcome on real Windows permissions — the key
on disk was replaced and a bootstrap call presented the new key ID — so the mechanism is not in
doubt. The disagreement is about whether the state is reachable outside a deliberate act, and
whether treating it as a plant is the intended design: this box's real inheritance grants the
Users group read-and-execute on files, which is read-only, and the commit does document the write
case as deliberate. The Linux/WSL half (`internal/core/config/endpoint_identity_unix.go:61`) was
asserted from source only and never run.

**What would settle it.**
1. Take a real migrated Windows endpoint and enumerate what its `endpoint-identity.json`
   permissions actually look like after each of: an MSI repair, a group policy permission
   re-apply, a permission reset to inherited defaults, an EDR quarantine-and-restore, and a
   file-level backup restore. If none of them produces a non-privileged **write** grant, the
   population is "deliberate act only" and this drops to medium. If any one of them does, it is
   high and blocking.
2. Run the same fixture on Linux/WSL with a root-owned identity file that is group- and
   world-writable, and confirm whether the key is destroyed there too — the Unix half is far
   easier to reach and is untested on every platform (see 4.5).
3. Confirm with the backend whether a minted-over endpoint has *any* recovery path other than a
   manual database edit. If the answer is no, the fix in 2.1 should land regardless of how narrow
   the population turns out to be.

### 3.2 — be-allowlist 59e76f5f — no test can tell the safe list apart from an unsafe one

`src/ai-governance/services/ai-optout-coverage.service.ts:518`
Verdict: **PLAUSIBLE.** Both reviewers agree on the facts; they disagree on severity.

**What happens, in plain English.** The service decides whether an opt-out event is one it
recognises. If it does not recognise the slug, it falls back to "not reported", which is the safe
answer. That fallback is the whole point of the code. But every test fixture in all three
opt-out suites either uses one of the three known slugs or leaves the field out entirely — and
"left out" takes a different code path than "present but unrecognised". So the one input that
exercises the fallback is never supplied. Rewriting the lookup as a fail-open rule that promotes
any future `ai-optout-*` slug straight to "governed" leaves all 25 live-Postgres tests green.

**Why it could not be confirmed.** Neither reviewer could run the suites: all three are skipped
unless `RUN_INTEGRATION_TESTS` is set and a live Postgres is available, and containers were not
permitted. The "25 tests still pass" claim rests on exhaustive enumeration of every
`details.transition` literal in the repo plus a deterministic simulation of the pure function,
which for a function with no I/O and a finite enumerated input set is solid — but it is not a run.
The second reviewer also notes the write-up's failure scenario overstates the production risk:
the shipped code is fail-safe today, and the union type would fail the build if a fourth slug were
added to the contract. The residual is a test-strength gap, not a live defect.

**What would settle it.** Start the live-Postgres lane once, add one seeded row carrying
`details.transition: 'ai-optout-invented'` on its own endpoint/runtime, and assert it reads
`NOT_REPORTED` with actor, lever and expiry all null. Add a second such row newer than a readable
take row on the same runtime and assert the take survives. If both pass, the gate is defended in
both directions and this closes.

---

## 4. Test-quality assessment per unit

On this project a test that cannot be made to fail is **NOT-RUN**, not PASS. Five of the seven
units contain at least one such test or one untested direction that matters.

### 4.1 go-cxhooks 47c74d7b — half tested. **The false direction is NOT-RUN.**

PROVEN: the new test can go red for the right reason. Neutering the new term at
`cmd/devoid/ai_codex_lanes.go:150` makes
`TestHooksStatusCodex_UnknownPinWithDeVoidMachineHookSet_NamesTheLaneThatGoverns` fail at its
"cooperative, user-owned" assertion. The fixture is honest — production renderer bytes with only
the pin's value rewritten, real verification, real printer — and its four preconditions fail
loudly rather than skipping.

NOT EXERCISED: replacing the whole new predicate with `return true` leaves the entire
`./cmd/devoid` suite green. No test anywhere asserts that "(cooperative, user-owned)" is ever
printed — all three occurrences in the suite are negative assertions — and the one defeat row
checks only "hook lane: attested" and exit 0. The gate is only ever fed inputs it should admit.
Nothing covers the branch the capped finding describes (machine baseline governing while the
user-scope rows are absent), which is why a shipped mis-attribution measurable in 0.03s is red
nowhere.

### 4.2 go-cred2 6a870882 — mostly real. **One assertion is NOT-RUN, and one property is untested.**

PROVEN: the descriptor table is genuine — real permission strings parsed by Windows into the same
structure the production call returns, including trustees the allowlist does not know. Four
separate single-line breakages each turn a named row red
(`machine_secret_strictness_windows.go:184`, the protected-DACL check at :126, the owner check at
:158). The on-disk row has a real discriminating control, so a predicate that answered "yes" to
everything could not pass.

NOT-RUN: `machine_secret_strictness_windows_test.go:139` claims to prove that a nil principal must
never suppress a repair, but it passes a path that does not exist alongside the nil principal, so
the assertion is satisfied by the file-not-found failure alone. Delete the nil/validity guard at
`machine_secret_strictness_windows.go:71` and the assertion stays green.

NOT EXERCISED: no test anywhere asserts that the daemon can still **read** a descriptor the
predicate decides to leave alone. "Empty protected permission list grants nobody" is asserted as a
state that must be skipped; nothing checks that skipping it leaves a usable credential.

### 4.3 go-optout 12674b04 — real for its own target, blind to the defect that remains.

PROVEN: the new test discriminates. Both edges were reproduced from clean trees — the parent
commit produces "FLAPPING: 7 events", this commit produces a clean pass. Moving the health gate
back above the verification call makes it red with that exact signature. It drives the real
reconcile and reads the production observer seam, and its control (remove the route, require
exactly one window across three unhealthy ticks) does defeat a muted lane.

NOT EXERCISED (blind spot 1): the fixture never plants an `@openai/codex` package file, so the
observed version is empty and the version check always short-circuits to "fine". The test can
never go red for the flap that is still live (2.2). Adding the file with version 0.134.0 makes the
same steady, healthy box produce 8 flap events across 4 identical passes.

NOT EXERCISED (blind spot 2): of the three tests the new comment cites as pinning the protection,
two skip unless the OS is Windows, so on a Linux lane only one of the three actually runs and the
citation overstates the coverage.

Environment note: the worktree is dirty with later uncommitted work, and
`go test ./internal/aiwire/` in the worktree as it stands FAILS on
`TestASweepOfTheUserTreeCannotEraseTheMachineScopeMemory`. That failure is not this commit's — it
reproduces only with the uncommitted files present — but the commit's clean-run evidence is
verifiable only against the committed tree, not against the tree a reviewer will check out.

### 4.4 go-wsl ae74cd8a — the join is genuinely defended. **The failure branch is NOT-RUN.**

PROVEN: setting the producer line at `internal/pathfix/pathfix.go:261` back to the old call makes
both new tests red on the producer assertion; neutering the exclusion line at
`cmd/devoid/doctor_fix_render.go:699` makes them red on the render assertion. Both preconditions
are hard failures, not skips, so a host with no WSL cannot silently vacuum them.

NOT-RUN: both fixtures (`wsl_rollup_join_windows_test.go:64` and `:187`) return "enumeration
succeeded", so the failure branch — the one that produces the false green in 2.3 — is exercised by
no test in `cmd/devoid` at all. One fixture returning "could not read" is the single addition that
turns this suite into a defence of the route rather than of one branch of it.

Secondary: the negative control at line 209 searches for a hand-copied fragment of a sentence that
no positive test pins, so rewording the renderer silently disarms the test the commit calls its
discriminator.

### 4.5 go-creds 7e000113 — partly real. **The new production branch and the entire Unix half are NOT-RUN.**

PROVEN: the live core is the permission-mask split. Changing the write-mask branch at
`internal/winacl/machine_secret_windows.go:657` makes the "write-only", "modify", "take-ownership"
and "delete" rows go red. The test runs in 2.25s against real permission grants and real
descriptor walks with asserted preconditions — not a source-text or struct-shape check. The
three-row trio in `cmd/devoid` is genuinely three-directional and asserts off the raw disk.

NOT-RUN (1): the new denial branch at `internal/core/config/endpoint_identity.go:147-165` — the
one that refuses when the file parses but holds no signing identity — has **zero** coverage in
either direction. No test in the repo writes a parsable identity file with a null or absent
signing block. Delete those 19 lines and the whole suite stays green even though they change what
the mint sees.

NOT-RUN (2): the entire Unix half is unreachable by any test on any platform. All three new test
files are Windows-only, there is no Unix test file for this area, and the two cross-platform
denial tests skip under root and otherwise fail at the file read before the check is ever reached.
The commit's own comment names `devoid wsl bootstrap` as a live deployment for exactly this state.

Worst shape: the tests **pin** the defect in 2.1 rather than catching it. The modify and write rows
assert "foreign", and the caller turns "foreign" into "absent", so the suite is green on the state
that mints over a real key.

### 4.6 be-allowlist 59e76f5f — no test added. **The gate this commit is about is NOT-RUN.**

PROVEN (partial): the suites are not wholly inert — changing one map value in
`ai-optout-coverage.service.ts:28` makes the "a lapsed opt-out reads OPTOUT_EXPIRED" live test go
red, because two rows then land in different readability partitions.

NOT-RUN: across all three opt-out suites (25 live tests plus 3 contract tests) every fixture
either uses a known slug or omits the field. No fixture ever carries an unrecognised non-null
slug, so the fail-safe default cannot be told apart from a fail-open one. Compounding this, all
three suites are skipped unless `RUN_INTEGRATION_TESTS` is set and there is no non-live spec
anywhere that constructs the service — so in the default `npm test` lane not one assertion
executes this code. The compiler is the only guard.

### 4.7 be-optout-runtime 2fe41f0d + 08d24367 — real for one slice. **Two "ladder order" checks are NOT-RUN.**

PROVEN: with the integration lane on, replacing the lever projection at
`ai-optout-coverage.service.ts:440` with null makes "carries every detail key the contract names"
report the missing key and fail. Replacing the contract re-export with a literal turns the
identity check red in any run.

NOT-RUN: the two order checks at `ai-optout-contract-drives-code.live-pg.spec.ts:82` and `:87` are
restatements of the implementation expression — the ladder is literally built by spreading the
tuple they compare against, so the assertion holds for every possible content and every possible
order. They fire only if a human retypes the spread, and cannot distinguish a right render order
from a wrong one. The runtime-versus-declared-type divergence of the detail-key constant is
invisible to every test in the unit.

Developer-local hazard, recorded but not filed as a finding: with `RUN_INTEGRATION_TESTS` unset,
the file reports "3 skipped, 4 passed" green while its own guard test named "never skips silently"
passes — that guard only throws when the variable is set to a wrong value, never when it is
absent. CI does set it to true, so this is a local hazard, not a CI hole.

---

## 5. Reported without adversarial verification (capped, not cleared)

The review ran to a verification cap. The 13 items below were written up and then never put in
front of a refuter. **None of them has been cleared.** They are neither confirmed nor refuted, and
an item's presence in this section says nothing about whether it is real. Treat each as an open
question, not as noise.

| # | Unit | Severity as filed | File:line | Item |
|---|---|---|---|---|
| C1 | go-cxhooks | medium | `cmd/devoid/ai_codex_lanes.go:284` | The roll-up asserts "not by the user-scope block" one line above saying that fact is unknown |
| C2 | go-cxhooks | medium | `cmd/devoid/ai_codex_unknown_pin_surface_test.go:149` | A blanket-true predicate keeps every test green; on a box with no machine baseline the surface would point the operator at one |
| C3 | go-cred2 | medium | `internal/core/config/machine_secret_hardening_windows.go:29` | The admin-only rule is applied to the daemon token, whose boundary is deliberately user-readable |
| C4 | go-cred2 | low | `internal/winacl/machine_secret_strictness_windows_test.go:139` | The nil-principal guard's only test cannot fail (also in 4.2) |
| C5 | go-optout | medium | `internal/aiwire/aiwire.go:425` | The two disagreeing callers the commit is built around do not both run on a machine-scope install |
| C6 | go-optout | medium | `cmd/devoid/ai_codex_hooks.go:214` | A fourth writer still asks about health first, and its refusal strands a durable opt-out |
| C7 | go-wsl | medium | `internal/pathfix/wsl_api.go:40` | The test seam is exported production API in the shipped binary; the "test binary only" comment is not enforced |
| C8 | go-wsl | low | `cmd/devoid/wsl_rollup_join_windows_test.go:209` | The negative control searches a copied prose string (also in 4.4) |
| C9 | go-creds | medium | `internal/core/config/endpoint_identity_unix.go:40` | The rewritten Unix half has no test on any platform (also in 4.5) |
| C10 | go-creds | medium | `internal/core/config/endpoint_identity.go:129` | "Read-loosened" is a label nothing acts on, and the repair it points at never runs on a script install |
| C11 | be-allowlist | medium | `src/ai-governance/services/ai-optout-coverage.service.ts:148` | The derived list is typed loosely enough that re-introducing a hand-written copy still compiles |
| C12 | be-optout-runtime | medium | `packages/shared-contracts/src/ai-governance-contract.ts:1068` | A cross-repo shared contract was reordered for a render-order property nothing reads |
| C13 | be-optout-runtime | low | `src/ai-query.optout-details-allowlist.live-pg.spec.ts:225` | The commit message overstates what the replacement check gained; the property was already held |

Three of these deserve a second look before the others, on impact:

- **C3 (go-cred2, daemon token)** — the same "already strict enough, skip the repair" rule is
  applied to two files with opposite intended boundaries. The daemon token is deliberately
  readable by ordinary users because a non-elevated process reads it on every shim and hook call,
  and the daemon fails closed on a 401. If an operator or a hardening script narrows that file to
  admins only — the obvious response to a scanner flagging a world-readable file called
  "daemon-token" — the self-heal will now decline to widen it back, and every non-elevated
  `npm install` on that endpoint is blocked with no automatic recovery. The commit's stated
  consequences mention only the machine secret.
- **C10 (go-creds, read-loosened)** — the earlier brick was converted into a silent, indefinite
  exposure of the endpoint signing private key to every local user. The repair the comments point
  at is reachable only from the MSI custom action; the PowerShell script-install path never calls
  it, so on a script-installed endpoint nothing will ever narrow the permission back.
- **C7 (go-wsl, exported test seam)** — a setter that silences the WSL enumerator ships in every
  release binary and is callable from any package. Nothing in the tree enforces that its callers
  are test files, and on non-Windows builds it succeeds while doing nothing at all.

---

## Evidence index

- Reproduced on a real tree with a discriminating control: 2.2 (4 passes, 8 events at 0.134.0
  versus 4 passes, 0 events at 0.144.0), 2.3 (captured summary and detail rows plus a zero-entry
  critical list), 2.1 (identity file's key replaced, one bootstrap call presenting the new key ID).
- Reproduced by breaking one named line and observing a named test go red: 4.1, 4.2, 4.3, 4.4,
  4.5, 4.6, 4.7.
- Asserted from source and never observed running: the Unix half of 2.1/3.1, the reachability half
  of 3.1, the "25 tests still pass" claim in 3.2, and all 13 items in section 5.
