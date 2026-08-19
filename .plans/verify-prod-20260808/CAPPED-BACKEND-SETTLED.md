# Capped-not-cleared: the Backend / contract items, settled

Scope: every Backend/contract item in "Capped, not cleared" (`FIX-AND-REVIEW-ROUND2.md` §6) and in
"Reported without adversarial verification" (`UNREVIEWED-UNITS-REVIEW.md` §5), plus the owner-call item
**P-1**. Go items (§6 #1, #2 and C1–C10) are out of scope here.

Worktree: `C:/cwt/int-be`, branch `integ/gate-backend`, HEAD `fa815a37`. **No file in the worktree was
modified.** Every defeat step ran through an in-memory jest transformer + module shim living in the
scratchpad, which rewrites source text on the way into ts-jest and **throws loudly if its anchor is
absent** — so a mutation that failed to apply can never masquerade as a green run. That guard fired once
for real (CRLF vs LF in `ai-query.service.ts`) and caught what would otherwise have been a
zero-assertion "suite failed to run" reported as a defect.

Live Postgres: `codesec-e2e-postgres` on :5433.

---

## Verdict table

| Item | Verdict | Mechanism |
|---|---|---|
| **§6 #3 — `riskScore` unchecked** | **CONFIRMED** | `Number.isFinite` is the only numeric gate, so −1, 1.5, 1e308 and 101 all project verbatim; the hostile table feeds this key strings and objects only, so no test can see it. |
| **§6 #4 — text gate passes Unicode line forms** | **CONFIRMED** | `hasControlCharacter` tests `< 0x20` and `0x7f–0x9f` only. U+2028, U+2029 and U+202E (RLO) pass under every `boundedText` key; the ASCII forms (LF, ESC) are correctly refused. |
| **C11 — derived list typed loosely** | **CONFIRMED (type level) / REFUTED (exposure)** | A hand-written replacement really does compile — including one that omits a slug *and* invents one. But the drift is not silent: it turns 5 named live-PG tests red. |
| **C12 — cross-repo reorder** | **CONFIRMED (nothing reads the order) / REFUTED (cross-repo risk)** | Reverting to the pre-commit order leaves all 59 tests green; a rename control turns 1 named test red. There is no second copy to break — the file exists in exactly one of the three shared-contracts trees. |
| **C13 — commit message overstates the gain** | **CONFIRMED** | Breaking the exact line the message cites turns **6** tests red, including two that predate the replacement and hold the property the message claims was gained. |
| **P-1 — `approvalSurface`** | **DECISION BRIEF BELOW** (not resolved here, by instruction) | Both tightening options cost exactly one fixture line. One "note for whoever decides" in the original brief is **factually wrong** and is corrected below. |

Also found while settling C12, not on any list: **the cross-copy mirror guard cannot run anywhere.**
See "Incidental finding" at the end.

---

## §6 #3 — `riskScore` is the one numeric field left unchecked — **CONFIRMED**

**Where.** `src/ai-governance/services/ai-query.service.ts:2376–2382`.

```ts
} else if (typeof riskScore === 'number' && Number.isFinite(riskScore)) {
  out.riskScore = riskScore;
}
```

**Mechanism.** Every other count in this projection goes through `boundedCount`
(`ai-query.service.ts:212`), which is `Number.isSafeInteger(v) && v >= 0`. `riskScore` uses
`Number.isFinite`, which admits negatives, fractions and 1e308. The sweep's hostile table
(`ai-query.safe-metadata-gate-class.live-pg.spec.ts:544–547`) feeds this key **only** `'not-a-number'`,
a 10KB string, an object and a script payload — never a number — so the gap is invisible to the test
that swept it. The commit that introduced the sweep (`12507584`) names −1, 1.5 and 1e308 by name as the
counts defect it fixed.

**Evidence — measured on the real projection, live Postgres, both read surfaces.** Four numeric cases
appended to the real `HOSTILE` table in memory; the suite's own assertion reported them:

```
+   "PROBE riskScore/negative(-1)=LEAKED(type=number,len=2,head=\"-1\")",
+   "PROBE riskScore/float(1.5)=LEAKED(type=number,len=3,head=\"1.5\")",
+   "PROBE riskScore/huge(1e308)=LEAKED(type=number,len=6,head=\"1e+308\")",
+   "PROBE riskScore/over100(101)=LEAKED(type=number,len=3,head=\"101\")",
```

All four reach the console. `1e308` is the sharpest: a console that formats a risk score gets a
309-digit number out of a field the DTO describes as a score.

**Fix as filed still stands:** range-gate to 0–100 and put those values in the table.

---

## §6 #4 — the text gate does not close the forged-line channel it claims — **CONFIRMED**

**Where.** `src/ai-governance/services/ai-query.service.ts:166–175` (`hasControlCharacter`), reached by
`boundedText` at :183.

**Mechanism.** The gate refuses code points `< 0x20` and `0x7f–0x9f`. U+2028 (LINE SEPARATOR), U+2029
(PARAGRAPH SEPARATOR) and U+202E (RIGHT-TO-LEFT OVERRIDE) are all above that range. The comment four
lines up says the helper removes "the newline/CR/NUL/ESC injection channel that lets one stored value
forge extra lines in a log or a chip" — U+2028/U+2029 are exactly that channel in any viewer that
honours them, and U+202E makes a stored value display a different account name than its bytes say.

**Evidence — same run, with a discriminating ASCII control.** Same keys, same seeding path, same read
surface; only the payload differs:

```
+   "PROBE reason/U2028=LEAKED(type=string,len=22,...)",
+   "PROBE reason/U2029=LEAKED(type=string,len=22,...)",
+   "PROBE approvedBy/RLO(U202E)=LEAKED(type=string,len=10,head=\"alice‮root\")",
+   "PROBE actor/U2028=LEAKED(type=string,len=8,...)",
+   "PROBE commandShape/U2028=LEAKED(type=string,len=17,...)",
+   "PROBE approvalSurface/U2028=LEAKED(type=string,len=15,...)",
    "CONTROL reason/LF=<absent>",
    "CONTROL actor/ESC=<absent>",
```

The two ASCII controls stay dropped. That is what makes this a measurement rather than a claim: the
gate is live and working on the characters it knows about, and blind to the Unicode forms of the same
attack. This affects **every** `boundedText` key in the projection.

**Fix as filed still stands:** refuse those code points too (or narrow the comment to what is actually
refused), and add the payloads to the table. Note the fix is a two-line change to one shared helper.

---

## C11 — the derived list is typed loosely enough that a hand-written copy compiles

**Verdict: CONFIRMED at the type level. The implied exposure is REFUTED — the drift is caught at
runtime by five named tests.**

**Where.** `src/ai-governance/services/ai-optout-coverage.service.ts:148–149`.

```ts
private static readonly KNOWN_TRANSITIONS: readonly string[] =
  Object.keys(TRANSITION_STATE_TABLE);
```

**Is it true?** Yes. Typechecked in memory against the real `tsconfig.json`, whole-program, one file
overlaid:

| Variant | Result |
|---|---|
| unmodified (control) | 0 errors |
| hand-written copy, one slug **omitted** | **0 errors** |
| hand-written copy, omits one slug **and invents `'ai-optout-INVENTED'`** | **0 errors** |

`Object.keys()` returns `string[]`, and the annotation restates that, so the derivation carries no more
type information than a literal would.

**Does the drift matter?** Yes — `KNOWN_TRANSITIONS` is bound into the newest-wins SQL at
`:357–358`, where it partitions rows by membership. The file's own comment says so. So this is not a
cosmetic annotation.

**But it is not silent.** Applying the omitting drift and running the three CX-7 opt-out suites against
live Postgres:

```
baseline                        3 suites, 32 passed / 32
KNOWN_TRANSITIONS drifted       1 failed, 2 passed;  5 failed / 32
  ● is NEVER auto-repaired: an OLDER restore cannot turn an in-force opt-out green
  ● groups by (endpoint, RUNTIME): a sibling runtime being clear does not clear the other
  ● a NEWER restore does clear it, and COVERED needs an observed restore to exist
  ● IS NOT DISTINCT FROM: two runtime-less rows collapse to the NEWEST one
  ● the summary counts endpoints worst-state-first and counts never-reported over the whole fleet
```

Five named tests red; the other two suites stay green. That is a discriminating result, not "something
went red".

### The smallest type change that makes the drift a compile error

There is no single-token annotation that catches drift in **both** directions. Measured:

| Candidate | omitted slug | invented slug |
|---|---|---|
| `readonly string[]` (today) | compiles | compiles |
| `readonly AiOptOutTransition[]` (+ `as` on `Object.keys`) | **compiles** | **TS2322** |
| exhaustive permutation tuple (2-line type alias) | **TS2322** | **TS2322** |

- **Smallest change, catches invention only** — one identifier:
  `private static readonly KNOWN_TRANSITIONS: readonly AiOptOutTransition[] = Object.keys(TRANSITION_STATE_TABLE) as AiOptOutTransition[];`
  Error observed on the invented member: `TS2322 Type '"ai-optout-INVENTED"' is not assignable to type
  '"ai-optout-taken" | "ai-optout-restored" | "ai-optout-lapsed"'.`
- **Smallest change that makes *omission* a compile error too** — a two-line alias beside the table:
  ```ts
  type _TupleOf<U extends string, R extends unknown[] = []> =
    [U] extends [never] ? R : { [K in U]: _TupleOf<Exclude<U, K>, [K, ...R]> }[U];
  type ExhaustiveTransitions = _TupleOf<AiOptOutTransition>;
  ```
  with `KNOWN_TRANSITIONS: ExhaustiveTransitions`. Observed: omission →
  `Source has 2 element(s) but target requires 3`; invention → `Source has 4 element(s) but target
  allows only 3`. Residual weakness worth stating plainly: a **correct** hand-written list still
  compiles under it (`['ai-optout-taken','ai-optout-lapsed','ai-optout-restored']` → 0 errors). It
  bans drift, not duplication.

**Recommended weight: LOW, and this is a hygiene fix, not a hole.** The behaviour is guarded. Take the
one-identifier version if anything; the permutation tuple is more type machinery than a guarded
three-member list earns.

---

## C12 — a cross-repo shared contract reordered for a property nothing reads

**Verdict: CONFIRMED that nothing reads the order. REFUTED that this was a cross-repo risk — there is
no second copy of this file to break.**

**Where.** `packages/shared-contracts/src/ai-governance-contract.ts:1068`. Commit `2fe41f0d` changed
`AI_OPTOUT_STATES` from `['SKIPPED_AUTHORIZED','OPTOUT_EXPIRED']` to
`['OPTOUT_EXPIRED','SKIPPED_AUTHORIZED']`, justified as "ORDERED WORST-LAST … so the ladder it generates
keeps its render order".

### Does any consumer depend on the order?

**Measured: no.** Contract reverted to the pre-commit order at runtime, via a module shim that also
asserts the value it is replacing (so a stale shim cannot pass silently):

```
CONTRACT_MUTATION=c12_optout_states_old_order   → Test Suites: 1 skipped, 5 passed;  57 passed / 59
CONTRACT_MUTATION=c12_optout_states_renamed     → Test Suites: 1 failed,  4 passed;   1 failed / 59
  ● #15B the contract names the detail members a coverage row carries ›
      resolves the contract in-force slug onto an endpoint-reported rung
```

Suites covered: the two CX-7 live-PG coverage suites, `ai-optout-contract-drives-code.live-pg`, the
always-on `ai-governance-contract.parity`, the always-on `m3-contracts.parity`, and the cross-copy
mirror spec. Reorder → nothing. Rename → one named test. Discriminating.

**Why nothing reads it.** The single order-sensitive consumer is the spread at
`ai-response.dto.ts:2264`, `AI_OPTOUT_COVERAGE_STATES = ['NOT_REPORTED','COVERED', ...AI_OPTOUT_STATES]`.
Nothing sorts or ranks by that ladder: the service's worst-state-wins is a hardcoded `if
SKIPPED_AUTHORIZED … else if OPTOUT_EXPIRED` chain at `ai-optout-coverage.service.ts:~388`. The one
assertion that mentions the order (`ai-optout-contract-drives-code.live-pg.spec.ts:83–84`) compares the
ladder tail *to `AI_OPTOUT_STATES` itself* — both sides move together on a reorder, so it can catch a
restated copy but structurally cannot catch a reorder.

So the render-order property the reorder was made for is read by nothing today. It is a
forward-looking convention, and the commit message presents it as load-bearing.

### Is the cross-repo worry real? No — and for a reason worth knowing.

`ai-governance-contract.ts` exists in exactly **one** of the three shared-contracts trees:

| Copy | `ai-governance-contract.ts` |
|---|---|
| Backend-vendored (`Backend/packages/shared-contracts/src/`) | **present** |
| Workspace-root canonical (`Ceragon/packages/shared-contracts/src/`) | **absent** |
| Ceragon-Intelligence vendored mirror | **absent** |

And no consumer outside the Backend: zero matches for `AI_OPTOUT_STATES` / `SKIPPED_AUTHORIZED` /
`OPTOUT_EXPIRED` / `AiOptOutState` anywhere in `Frontend/`, and zero matches for `OptOut` anywhere in
`Installers/` — so the `internal/aiwire.OptOutState` the contract comment says it mirrors is not in the
local Installers checkout at all. (That last point is worth a separate look: **the mirror the comment
claims cannot be verified from this box.** See "unresolvable" note below.)

**Recommended weight: the reorder is safe. The commit message's justification is not true yet.** Either
make something read the ladder order, or say in the comment that the order is a convention nothing
enforces.

**UNRESOLVABLE-HERE, one sub-point.** Whether the Go endpoint's `internal/aiwire.OptOutState` matches
this tuple cannot be settled from this box — the local `Installers/` checkout contains no `OptOut`
symbols on the branch on disk. *What would settle it:* on a checkout of the Installers branch that
carries the CX-7 opt-out work, `grep -rn "OptOutState\|OptOutTransition" internal/aiwire/` and compare
the slug set and the state set to `AI_OPTOUT_STATES` / `AI_OPTOUT_TRANSITIONS`. Order is irrelevant to
Go; membership is not.

---

## C13 — the commit message overstates what the replacement check gained — **CONFIRMED**

**Where.** `src/ai-governance/services/ai-query.optout-details-allowlist.live-pg.spec.ts:225`
(the test "surfaces every key the shared contract names, read off a live console row"), added by
`08d24367`.

**The claim made.** The comment above the test (`:210–223`) says the replacement "now ALSO fails when
the projection stops surfacing a key the contract names, which is the thing the register row is about",
and cites the defeat: "with `lever` no longer projected the old check still passed and this one reported
`lever=<DROPPED>`".

**The property was already held.** Running that exact defeat — `out.lever` no longer assigned in
`ai-query.service.ts:2565` — turns **six** tests red, not one:

```
baseline                       12 passed / 12
lever no longer projected       6 failed / 12
  × projects all seven onto the ACTIVITY row                    <- predates the replacement
  × projects all seven onto the SESSION TIMELINE row            <- predates the replacement
  × surfaces every key the shared contract names…               <- the replacement itself
  × still drops an undeclared eighth key…
  × does not WARN for a bag whose every key is projected
  × carries an UNRECOGNISED but well-shaped slug on all four vocabulary keys
```

Tests 2 and 3 in the same file (`:178` and `:197`) already assert that every one of the seven keys
reaches the projection, on both read surfaces, and test 2 asserts the *value* as well. So the stated
gain was covered before the replacement landed. **Overclaim CONFIRMED.**

**What the replacement genuinely adds — and this half of it is real.** Its key list comes from the
CONTRACT rather than from the fixture's own keys, so it is the only test in the file that notices a key
added to `AI_OPTOUT_TRANSITION_METADATA_KEYS` that the producer fixture does not stamp. Measured, with
an eighth key injected into the contract at runtime:

```
1 failed / 12
  × surfaces every key the shared contract names, read off a live console row
  √ projects all seven onto the ACTIVITY row
  √ projects all seven onto the SESSION TIMELINE row
```

Exactly the inverse selection. So the test is worth keeping; only the sentence describing it is wrong.

**Suggested correction (comment only, no code):** say that the replacement's gain is that *the key list
is the contract's*, not that it is the first check to notice a dropped key.

---

## P-1 — DECISION BRIEF: `approvalSurface` widened to free text

*Not resolved here, per instruction. Presented in the shape of the owner brief.*

### The question, in one sentence

Should the read projection gate `approvalSurface` to the one value the producer can emit
(`BROWSER_EXTENSION`), or stay bounded-but-free and fix only the misleading comment and the test fixture
that pins a producer-invalid value?

### Why it is open

Two review lenses split, and both are partly right. The agreed facts, all re-verified:

1. **The justifying comment cites a fixture that says the opposite.**
   `src/ai-governance/services/ai-query.service.ts:2486–2492` says "the wire contract's own tests carry
   `approvalSurface: 'approved by the on-call engineer'`, i.e. this field legitimately holds a
   sentence." That string appears at `src/ai-governance/dto/ai-prompt-check.dto.browser-fields.spec.ts:144`,
   inside `it('rejects any other surface claim, including free text')`, asserting it is **rejected**.
2. **The comment contradicts itself six lines later.**
   `ai-query.service.ts:2497` ends "…`approvalSurface` is a slug." The gate applied at :2500 is
   `boundedText`, i.e. prose.
3. **The producer contract admits exactly one value.**
   `src/ai-governance/dto/ai-prompt-check.dto.ts:395` — `@IsIn(['BROWSER_EXTENSION'])`. The only route
   that writes `metadata.approvalSurface` from a body is
   `src/ai-governance/controllers/ai-agent.controller.ts:474`, behind that DTO.
4. **A lenient write path that bypasses that DTO is real.** `append-ai-event.dto.ts:177` and
   `endpoint-evidence-batch.dto.ts:307` both declare `metadata?: Record<string, unknown>` under a bare
   `@IsObject()` — no key allowlist — so an agent can put any string under this key and get a 200.
5. **The new suite pins the producer-invalid sentence as REQUIRED OUTPUT.**
   `ai-query.safe-metadata-gate-class.live-pg.spec.ts:618` puts
   `approvalSurface: 'approved by the on-call engineer'` in the `LEGITIMATE` "must project" set. So
   correcting the gate makes that test red **as if it were a regression**.
6. **A third fixture disagrees with the DTO in the other direction.**
   `ai-agent-wire-contract.spec.ts:147` carries `approvalSurface: 'browser_extension'` — lowercase,
   which `ai-prompt-check.dto.browser-fields.spec.ts:143` asserts is rejected.

**Correction to the original brief — this changes the arithmetic.** The note left for whoever decides
said: *"the token pattern in this file has no underscore, so a naive tightening would drop the
lowercase-underscore form that appears in agent source."* **That is wrong.** Byte-level read of
`ai-query.service.ts:180`: `const BOUNDED_TOKEN_RE = /^[A-Za-z0-9._:+/=-]+$/;` — the class is
`A–Z a–z 0–9 . _ : + / = -`, and it **does** contain an underscore. Measured: `BROWSER_EXTENSION` PASS,
`browser_extension` PASS, `CLI` PASS, `extension-modal` PASS, `approved by the on-call engineer`
REFUSED. So the silent-drop objection to a token-shaped tightening does not apply.

### The options, and what each actually costs

Cost measured, not estimated: each option applied to the real gate and the real suite re-run.

| Option | What it does | Measured cost | Residual risk |
|---|---|---|---|
| **A — closed set** `=== 'BROWSER_EXTENSION'` | Only the value the producer can emit reaches a console. | **1 test red: `still CARRIES a realistic value under every swept key — the sweep is not a wall`** (its fixture pins the sentence). 8/9 still pass. One fixture line to correct. | A newer endpoint emitting a new surface slug is silently dropped from the console. This is the failure mode the file's no-vocabulary decision exists to prevent, and it has bitten this projection twice. |
| **B — keep `boundedText`, fix the words** | 64 chars, control chars refused; correct the comment, correct the `LEGITIMATE` fixture, correct the wire fixture. | Zero code change. Three comment/fixture edits. | The console can display an attacker-chosen 64-character approval label. No script sink was demonstrated and the view layer escapes output, so the harm is a **misleading label**, not execution. |
| **C — `boundedToken`** | Same 64-char cap, slug alphabet, no vocabulary. | **Same 1 test red, same fixture line.** `BROWSER_EXTENSION` still projects. | Prose and markup are gone; `CLI`, `extension-modal` and any future slug still project. Narrows the channel without closing the vocabulary. |

Note that A and C cost **exactly the same one fixture line** — the "widening was already a tightening,
so leave it" argument does not buy anything that B does not also buy.

### Recommendation, and the one reason that decides it

**Option C.** The reason: `approvalSurface` is the only key in the projection whose own comment calls it
"a slug" while gating it as prose, and the shared token alphabet — measured, including the underscore —
admits every value the producer can emit and every plausible future one, while refusing the sentence
and the markup. It removes the whole prose channel at the cost of one fixture line and no vocabulary
lock-in, so it does not re-open the silent-drop failure mode that Option A does.

If the owner prefers A, the honest trade is: a newer endpoint's new approval surface disappears from the
console rather than reading as "the endpoint said this".

Whichever is chosen, three fixture/comment corrections are required regardless and are not optional:
`ai-query.service.ts:2486–2497` (the inverted citation and the self-contradiction),
`ai-query.safe-metadata-gate-class.live-pg.spec.ts:618` (a producer-invalid value pinned as required
output), and `ai-agent-wire-contract.spec.ts:147` (lowercase form the DTO rejects).

### Does it block the push?

**No.** Nothing here is a live regression: the change under review *tightened* a previously unbounded
raw passthrough down to 64 characters with control characters refused. The impact today is a misleading
approval label on the console. What must not ship unnoticed is item 5 — a test that pins a
producer-invalid value as required output will read as a regression the first time someone corrects the
gate. **Standing constraint check:** all three options ship ON by default; none needs a flag.

---

## Incidental finding (not on any list): the cross-copy mirror guard cannot run

Found while checking C12's "three copies" premise. Reporting it because it is the campaign's recurring
shape — a guard whose summary claims coverage the rows do not support — and because it is inert-test
shape 5, a precondition that silently skips the assertion.

`src/shared-contracts-guard/shared-contracts-mirror.dev.spec.ts` byte-compares the seven governance-domain
files (`m3-contracts.snapshot.ts:107–115`: `ai-governance-contract.ts`, `endpoint-controls-contract.ts`,
`team-autosort-contract.ts`, `rollout-readiness-contract.ts`, `rollout-readiness-fixtures.ts`,
`console-roles-contract.ts`, `rollout-strictness-contract.ts`) between the workspace copy and the
Backend-vendored copy. Its header says it skips only "in a standalone Backend CI checkout" and that
"when both copies ARE on disk (a developer's workspace), this catches drift the snapshot layer cannot
see on its own."

It skips on a developer's workspace too. `findCopy1()` (`:63–68`) selects a candidate directory by
probing for `endpoint-controls-contract.ts`. The workspace-root copy
`C:/Users/Owner/Documents/Ceragon/packages/shared-contracts/src/` carries **none of the seven** — so the
probe fails, `copy1` is `null`, and both checks skip. Observed in this run: `Test Suites: 1 skipped`,
`Tests: 2 skipped`.

The failure is self-reinforcing. Check #2 exists to catch "a file in one copy but not the other" — and
the drift it would catch is total (7 of 7 files present in copy #2, 0 of 7 in copy #1), which is
precisely the condition that makes its own sentinel file missing and turns the check off. The more
complete the drift, the more certainly the guard is silent about it.

The always-on `m3-contracts.parity.spec.ts` is unaffected and does pass — but it pins only
`AI_POLICY_SCOPES` out of `ai-governance-contract.ts`. Nothing pins `AI_OPTOUT_STATES` in either guard,
which is the mechanical reason the C12 reorder passed every gate.

*Suggested fix:* probe for the copy-1 **directory**, not for one file inside it; then a copy that exists
but carries none of the seven fails the directory-presence diff instead of disabling it.

---

## How the defeat steps were run (reproducible, non-destructive)

Scratchpad:
`C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/199b4ae9-ad56-4f6c-834b-084cdba0e20f/scratchpad/`

- `c11-typecheck.js` — `ts.createProgram` over the real `tsconfig.json` with one file overlaid in
  memory; reports diagnostics for that file only.
- `overlay-transformer.js` — subclasses `TsJestTransformer`, rewrites named source anchors before
  compilation. Line-ending agnostic; **throws if the anchor is absent.**
- `contract-shim.js` — stands in for `@ceragon/shared-contracts` via `moduleNameMapper`; asserts the
  value it is about to replace before replacing it.
- `jest.overlay.js` — the project jest config with those two wired in, `cache: false`.

Run shape:

```
DATABASE_PASSWORD=<from the local container> RUN_INTEGRATION_TESTS=true \
DATABASE_HOST=localhost DATABASE_PORT=5433 DATABASE_USER=codefense DATABASE_NAME=codefense_db \
OVERLAY_MUTATION=<name> CONTRACT_MUTATION=<name> \
node node_modules/jest/bin/jest.js -c <scratchpad>/jest.overlay.js --runTestsByPath <spec> --verbose
```

Worktree confirmed unchanged: `git status --porcelain` in `C:/cwt/int-be` shows the same three
pre-existing `packages/shared-contracts/dist/*` modifications and one pre-existing untracked probe spec
that were present at the start.
