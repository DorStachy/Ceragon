# Decision brief — when DeVoid cannot read which Codex is installed, should it still vouch for the hooks?

**Written 2026-08-26. This is a brief, not a decision. Nothing has been changed, and the file this
is about was not touched — another agent owns it. Everything below was read, not edited.**
Master checklist item §3.7.

---

## The one-paragraph version

On some machines DeVoid cannot tell which version of Codex is installed. On those machines it
currently goes ahead and reports the two Codex hook rules as **installed** anyway — while printing,
right beside them, that it could not read the version and cannot confirm the hooks will be trusted
by that build. So the endpoint is not lying, but a reader who skims the row and not the note believes
more than we know. The alternative is to have those machines report **"cannot say"** instead — and
the catch is that "cannot say" is all-or-nothing: it would also throw away the six other things
DeVoid *did* successfully verify on that same machine.

---

## What you would actually see, either way

### Today

On a machine whose Codex version could not be read, the readiness output shows:

- The two hook rules: **installed**.
- Immediately underneath: *"codex client version could not be read, so the cooperative hooks'
  persisted trust format is NOT confirmed for this build — a live canary is what proves it."*
- The six other requirements DeVoid checks: whatever they actually are.

### If it were closed

The same machine would show:

- Overall verdict: **posture not attestable**.
- The six other requirements: **no longer counted as verified**, even though nothing about them
  changed and nothing about them depends on the Codex version.

That second bullet is the whole difficulty. The "cannot say" verdict is not applied to one row — it
is applied to the entire report. Closing this trades **one over-claim** for **six lost true
statements** on every affected machine.

---

## What is actually at risk if we leave it open

Concretely: DeVoid writes a small trust record into Codex's own settings, and Codex consults that
record before it will run a DeVoid hook. If the installed Codex expects that record in a different
shape than the one DeVoid writes, **Codex quietly declines to run the hook** — and today the endpoint
would still show that hook as installed.

Two things limit that exposure, and both are real:

- **It only affects one of the two ways DeVoid installs hooks.** Hooks installed at the machine level
  do not use that trust record at all. On a machine where the machine-level lane is genuinely doing
  the work, this question does not arise — and the code already checks for exactly that before
  granting the benefit of the doubt.
- **It is not granted below a minimum Codex version.** On a client too old to be trusted with the
  machine-level lane either, the row stays "unknown" rather than "installed". Two genuinely ancient
  builds on the reference machine are confirmed to lack the settings this depends on.

---

## Why it was built this way

Three reasons, all of them recorded in the code and all of them checkable:

1. **The gate is aimed at a different population.** It is designed to fire on a machine where DeVoid
   *did* read the version and that version is outside everything we have ever seen work. That is the
   case the quality pass found reporting green over hooks that may never fire. Leaving it out is not
   an oversight — it is the boundary of what the gate is for.
2. **The vendor has an install channel that leaves nothing on disk to read.** A machine installed
   that way has no version to find. Punishing it reports a fault on the endpoint when the gap is in
   our own discovery.
3. **It is instrumented, not silent.** Two separate facts are recorded and printed — that the version
   was not observed, and that the hook trust format is not confirmed. The standing rule in this
   codebase is that a fail-open nobody can count is just being ungoverned; this one is countable.

---

## What "cannot read the version" actually covers

Two distinct situations are treated the same way:

- DeVoid never went looking for the version on this run.
- DeVoid looked and got nothing back.

Both currently grant the benefit of the doubt. They are arguably not the same thing — "we did not
check" is a weaker excuse than "we checked and there was nothing there" — and separating them is a
smaller change than closing the gate outright. That is not a recommendation, just a shape nobody
has costed.

---

## The options

**Option A — keep it.** Record that an unread Codex version keeps the hook rows claimable, on the
grounds that the alternative destroys more truth than it protects, and that the endpoint already says
out loud what it could not confirm. Nothing to build.

**Option B — close it.** An unread version makes the hook rows unknown. Small code change; large
consequence, because the unknown verdict is whole-report and takes the six unrelated verified
requirements down with it. **Do not choose this without first deciding whether you accept losing
those six.**

**Option C — narrow the blast radius first, then close.** Change how the overall verdict is composed
so an unknown hook row no longer voids the whole report, then close the gate against a much cheaper
consequence. This is real work in a sensitive area and it must not accidentally let an endpoint
report itself clean while something is unobserved — that is a standing prohibition in this codebase
(§5) and it exists because that mistake has been made before.

**Option D — fix the cause instead.** Improve version discovery so fewer machines have an unreadable
version at all. Reduces the population rather than changing what we say about it.

---

## Two things to weigh alongside this

- **A related, larger item is open.** The list of Codex builds DeVoid has confirmed the hook trust
  format against currently contains **one** build. Real endpoints are on newer ones, so many machines
  are already being told their hooks are unverified for a *different* reason (master checklist §3.6).
  Closing the gate in this brief while that list is that narrow would widen the effect considerably.
  **Do not widen that list as a side effect of deciding this** — it is separately protected by a test
  and by a standing prohibition requiring two vendor artefacts first.
- **The thing that would settle it properly is a live canary** — running the hook on the actual build
  and watching whether it fires. The code says as much, in those words. That is a real-machine task
  and it is currently blocked, along with everything else in that class, on GitHub Actions being
  unblocked and an agent release being approved (§0.1 and §0.2).

---

## Confidence

**PROVEN — read directly from the code on `origin/main`:**

- That an unread or never-probed Codex version keeps the hook rows claimable.
- That the "unknown" verdict is whole-report and is described in the code as "posture NOT attestable".
- That both facts are recorded and both are printed on the endpoint, with the exact wording quoted
  above.
- That machine-level hooks do not depend on the trust record, and that the benefit of the doubt is
  refused below a minimum version.
- That two builds present on the reference machine are confirmed to lack the settings the
  machine-level lane needs.

**NOT EXERCISED — nobody has measured any of this in the field:**

- **How many endpoints are affected is unknown.** No count exists of machines whose Codex version
  could not be read. This is the single most useful number for making this decision and it has not
  been taken. Without it, both options are being weighed against an unknown population — it could be
  a handful of machines or most of the fleet.
- Nobody has observed a real endpoint where the version was unreadable *and* the hook then failed to
  fire. The risk is structurally real; it has not been caught happening.
- No live canary has been run on any build.
