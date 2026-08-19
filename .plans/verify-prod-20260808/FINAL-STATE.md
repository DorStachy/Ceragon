# Final state — campaign verify-prod-20260808

Date: 2026-08-19. **Nothing in this campaign was pushed and nothing was deployed.** Every SHA
below is a local commit in a worktree on this box.

---

## 1. Is the blocker cleared?

**Yes — both of them, and each was defeated rather than asserted.**

**The `[BLOCKER]` on the trust-anchor path (storageAssurance non-deterministic on the signed ack)
is SETTLED in `1eaee322`, branch `fix/go-assurance-determinism`.** PROVEN: the cause was an
ordering defect — convergence measured the credential store, then wrote it (which stamps a new
DACL), then signed, so ack #1 described a store that no longer existed and ack #2 carried different
bytes and a different signature. The fix re-measures after the pass's own write and persists the
settled value. Three discriminating defeats, each with a named control left green: (A) delete the
settle step, and the two byte-identity tests go red; (B) the forbidden fix — freeze the value to a
constant — run in **both** directions, and `TestConvergenceAckAssuranceMovesWithTheCredentialStore`
goes red either way, so register #4 cannot be reintroduced silently; (C) disable the owner branch in
the classifier, and the corrected expectation goes red while
`TestClassifyDescriptorOnTheShippedMachineDescriptors` stays green, so the corrected test is not
vacuous. The regression check added a fourth: the settle branch was instrumented and **measured** to
fire exactly once on a machine-scope first convergence and zero times on user scope — the "one
correction, not one per pass" claim is measured, not reasoned.

The second half was the test being stale, not the code: an unprivileged process owns the file it
hardens, and an owner holds WRITE_DAC however the DACL reads (the test's own cleanup proves it by
running `icacls /grant` successfully against that DACL). The identical assertion had already been
corrected one layer down in `winacl` by `930dac43`, with the note there that it "PINNED A
FAIL-OPEN"; the `policybundle` copy was missed. `OS_PROTECTED` is still pinned on the descriptor the
product actually writes.

**The Frontend lane's DO-NOT-MERGE is also cleared.** `fix/fe-summary-vs-rows` reddened the required
`Typecheck (tsc --noEmit)` gate at `c5e5ddd4`; `cd7594ab` fixes the fixture factory (test-only, no
production change). PROVEN by me in this pass rather than taken from the commit message: `node
node_modules/typescript/bin/tsc --noEmit` at HEAD `cd7594ab` in `C:/cwt/w2-fe` — exit 0, no output.

**What still fails, and whether it blocks a release.** Nothing fails. Two things gate the release
without failing a test: (a) the backend must widen and **deploy** `AI_TRUST_ANCHOR_STORAGE_ASSURANCES`
before any agent that can emit a measured level ships, or every ack 400s and the fleet parks in
V1_DEGRADED — unchanged by this pass and NOT EXERCISED here, because the deployed backend was not
checked; (b) the WSL escalation fix is still source-derived, which is a hardware item — see §5.

---

## 2. Branches to merge, in order

All four earlier Go lanes are already in. Ancestry was checked individually with
`git merge-base --is-ancestor`, not read off a merge message: `06d3da9b`, `fae2bc3f`, `24bdbcd1`,
`130220ea`, `cfba9caa`, `c6608646`, `16a0e454` and `83b6e557` are all ancestors of `integ/gate-go`
(HEAD `83b6e557`).

1. **`fix/go-carried-remainder`** into `integ/gate-go`. Four commits (`82dca031`, `96f127cf`,
   `94a05b45`, `45efc9e3`). PROVEN a clean fast-forward from `integ/gate-go`. Reviewed
   SAFE_TO_MERGE: the AppxInstallerCache fix was bought by widening the read contract, not by
   weakening the failed-read rule, and each of the two properties was reded independently while the
   other one's named control stayed green.
2. **`fix/go-assurance-determinism`** into `integ/gate-go`. One commit (`1eaee322`). Also a
   fast-forward from the same base, so after step 1 it becomes a real merge. The two branches touch
   disjoint files (`internal/policybundle` versus `internal/wsldistro`, `cmd/devoid/ai_status.go` and
   CI), so no conflict is expected — but **the composition has NOT been compiled or run.** Re-run
   `internal/policybundle`, `internal/winacl`, `internal/wsldistro`, `internal/wslcodex` and
   `cmd/devoid` after the merge.
3. **`fix/fe-summary-vs-rows`** into `integ/gate-fe-all`. Now mergeable (§1). It is not an ancestor of
   that branch today.

**Must not:** do not push and do not deploy — both are outside this campaign's scope. Do not cut an
agent release before the backend storage-assurance widening is deployed (§1). Do not merge
`fix/go-wsl-gate-truth` on its own — it would leave the exit-code half behind; it is already an
ancestor, so this is a caution against cherry-picking rather than an open action.

---

## 3. Carried forward

`CARRIED-FORWARD.md` now holds **15 open items: 2 high, 4 medium, 7 low, 2 info** (down from 19 at
the close-out), plus the `[BLOCKER]` line kept verbatim and marked SETTLED.

Closed in this pass, eight lines, each keeping its original wording with the resolution appended:
`c6608646` (the enrolment rollup omitted an installed-but-unattested agent — verified fixed by the
branch that landed, and deliberately not fixed twice), `82dca031` (non-distro Lxss subkey),
`83b6e557` (the two WSL packages ran in no CI job), `96f127cf` (the pathfix strict-gate step was
silenced by the step above it), `94a05b45` (the live-proof runbook's exit contract, wrong twice),
`45efc9e3` (opt-out plus unreadable registration named different repairs), and two whose claims had
gone stale and were closed by re-verifying ancestry rather than by an edit. The `[BLOCKER]` was
settled by `1eaee322`.

**The remaining 15 are KNOWN AND NOT FIXED.** This file is not a clean bill of health. Both `[high]`
items are Backend-side (§6 #9, a stored key a console panel reads is discarded before it is written;
§6 #11, a silent order-dependent 32-entry write-time cap on stored findings). Neither was touched:
they live on an unmerged Backend branch in another agent's worktree, and **nobody owns that lane
right now.** Five of the Go-side items were deliberately left open with the exact observation that
would settle each one written into the file, so the next reader does not have to re-derive it.

---

## 4. Waiting on the owner — two decisions

- **The command-word anchor on the flat pattern pass.** The raw flat regex lane has no command-word
  anchor at all, so all eight high-severity command classes fire on their pattern merely being
  *mentioned* inside an unrelated command (grep-quoted, echoed into a file, in a commit message); the
  one class that appears to escape does so by accident of where its regex ends. Adding the anchor
  changes detection fleet-wide on the enforcement path, so it was measured and reported rather than
  fixed by a verification lane. Detail: `C5-C12-RESULTS.md` and `FINAL-PASS-REGISTER.md` §5.
- **The `approvalSurface` widening, where two review lenses split.** Gate the read projection to the
  one value the producer can emit (**A**, closed set), keep bounded prose and fix only the misleading
  comment and two fixtures (**B**), or move to the slug alphabet (**C**, `boundedToken`). A and C cost
  **exactly the same one fixture line** — measured by applying each to the real gate and re-running
  the real suite — so "it was already a tightening, leave it" buys nothing that B does not. The
  recommendation is C; if A is chosen, the honest trade is that a newer endpoint's new approval
  surface vanishes from the console instead of reading as "the endpoint said this". Detail:
  `CAPPED-BACKEND-SETTLED.md` P-1.

---

## 5. Waiting on hardware

See **`REAL-BOX-PACKET.md`** — 15 items, ordered zero-risk first: **items 0–14 = 540 min = 9 h 00 m**
in one sitting (item 15 adds 20 min of active work but is calendar-blocked, not box-blocked).
**Recommended cut line: finish item 12 (items 0–12 = 6 h 30 m), and run 13–14 as a separate
destructive session (2 h 30 m)** — they destroy the VM, so stopping early costs nothing already
earned. Every entry carries a defeat step; where one could not be specified honestly, the entry says
UNFALSIFIABLE AS SPECIFIED.

**Irreversible — run last, on a VM you are willing to destroy, snapshot between modes:**

- **Item 13 — DACL across fresh / upgrade / lite / re-enrol (90 min).** Modes 2 and 4 are
  reinstall-class transactions. **A reinstall has permanently bricked the trust anchor before (409
  forever).**
- **Item 14 — Stage E: second endpoint, second non-admin user, cross-tenant, nav-block (60 min).**
  Enrolment consumes a token and creates a permanent endpoint row.
- Items **11** (daemon-token hardening brick) and **12** (read-loosened signing key, F16-adjacent) are
  marked DANGEROUS rather than irreversible — they can block installs on the box they run on.

**Standing guardrail, unchanged:** the only DeVoid agent enrolled on this workstation points at
**production**. Nothing may install, uninstall, re-enrol, re-key or run `harden-shims` against it, and
nothing under `C:\ProgramData\devoid` may be moved or overwritten — copy only. Never print a
credential value; presence, path, size and ACL only.

**The one hardware item this campaign's own fixes now depend on:** a registry sweep for a non-distro
subkey under `HKCU\...\Lxss` (packet item 4). NOT EXERCISED — no such host was available, so the
`AppxInstallerCache` escalation remains source-derived. The judgement is proven exhaustively over all
eight read shapes, and the `ErrNotExist` mapping was probed against the real registry on this box,
but whether a real `AppxInstallerCache` subkey is openable at all is unmeasured. It fails in the safe
direction — still UNKNOWN, never a false clean. Two more that are NOT EXERCISED for named reasons:
the SYSTEM-side path of the trust-anchor fix, because every test above ran as an ordinary user; and
whether `os.Exit(31)` actually reaches a shell, because no binary was built.
