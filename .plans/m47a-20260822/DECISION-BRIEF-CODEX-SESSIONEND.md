# Decision brief — should Codex get a "session ended" hook?

**Written 2026-08-26. This is a brief, not a decision. Nothing has been changed.**
Master checklist item §3.9. It is currently written there as *"owner decision: confirm won't-fix"* —
this document exists so that confirmation can be an informed one instead of a rubber stamp.

---

## The one-paragraph version

When one of your developers finishes a Codex session, the console does show the session as ended.
But it labels that ending **"we worked it out"** rather than **"the tool told us"** — because DeVoid
does not have a hook on Codex's session-end event, so nothing hears the session close first-hand.
Adding that hook would upgrade the label and tighten the timing. It would add **no new blocking, no
new detection, and no new enforcement** — session-end is a notification, not a checkpoint, so there
is nothing about it to enforce. The reason it was left out is that the way DeVoid installs hooks
today would stamp a setting on it that the vendor's own rules forbid, on every endpoint.

---

## What you would actually see, either way

### Today

- A Codex session that ends normally is recorded as ended, on the endpoint and in the console.
- The ending carries the label **"ended, visibly inferred"** — DeVoid noticed the session was gone
  and closed the record.
- If a laptop loses power, is force-killed, or the DeVoid service is killed outright, that session
  can sit reading **ACTIVE** until a backend timer sweeps it closed later.
- Every other AI runtime that does have a native session-end hook can be recorded as **"ended,
  natively attested"**. Codex never can.

### With a session-end hook

- The ending would be reported by Codex itself, at the moment it happens.
- The label would become **"ended, natively attested"** — the strongest form of that record.
- The power-loss and force-kill cases would still fall back to today's behaviour, because a machine
  that dies does not run hooks either. So this improves the ordinary case, not the worst case.

### What you would NOT get

- No extra protection. Session-end fires *after* everything the session did. There is nothing left
  to allow or deny.
- No extra detection. Nothing new is inspected.
- No coverage number goes up in a way that means more of the endpoint is guarded.

**This is a record-accuracy question, not a security question.** That is the single most important
sentence in this brief, and it should probably drive the answer.

---

## Why it was left out — the four reasons, in plain terms

All four were measured against the code, not assumed. Codex allows a session-end hook **one second**
by default and **three seconds** at absolute maximum, because it treats it as a fire-and-forget
notification while the tool is shutting down.

1. **DeVoid's own hooks are allowed four seconds to reach a decision.** That budget is a single
   global setting, not per-event. Four seconds is more than the entire three-second ceiling.
2. **Just reading the incoming data is allowed two seconds.** Before any work starts, DeVoid can
   already have spent double the one-second default allowance.
3. **DeVoid's session-end handler calls home.** It makes a real network round trip to the DeVoid
   service on the machine before it finishes. The vendor's rule for this event is explicitly
   "fire-and-forget, no round trip".
4. **The timeout DeVoid would write is not legal for this event.** Every hook group DeVoid installs
   is stamped with a thirty-second timeout. Thirty is more than the three-second maximum. The only
   ceiling DeVoid currently checks against is one hundred and twenty seconds — a *per-event* ceiling
   does not exist in the code at all.

Reason 4 is the one that makes this more than a tidiness argument. **Adding the hook without first
building a per-event timeout ceiling would write an illegal setting onto every managed endpoint**,
on a hook that could not finish in time anyway. That is a fleet-wide change with a known-bad value in
it, in exchange for a nicer label.

### One correction worth knowing about

An earlier note in this codebase said Codex has no session-end event at all. **That was true of the
build it was measured on and is false now.** The installed vendor client on the reference machine
(version 0.147) does have it. The note was corrected in place rather than left to be re-discovered.
So the honest statement today is *"the client has it, DeVoid does not use it"* — not *"it does not
exist"*.

---

## What it would take to add

Roughly, in order — none of these is a one-line change:

1. **Build a per-event timeout ceiling.** Today one timeout value is written onto every hook group.
   Session-end needs its own, and the code that validates hook settings needs to learn that different
   events have different legal maximums. This is the prerequisite for everything else.
2. **Make the session-end handler stop calling home.** It needs to hand the fact off without waiting
   for an answer.
3. **Bring the read and decide budgets under one second for this event.** Both are currently global.
4. **Decide what happens on older clients.** Session-end only exists from version 0.147 onward. The
   reference machine has 0.130, 0.131, 0.134, 0.147 and 0.149 installed side by side. On the older
   ones the hook would simply not be there, so the endpoint would need to say so rather than look
   like a failure.

Steps 1 and 3 touch how *every* hook on *every* runtime is configured, which is why this is not a
small piece of work for the size of the benefit.

---

## What already stops this from being a silent gap

This matters because it changes the question from "is something broken?" to "do we want a nicer
record?".

- **The endpoint does not claim a session-end hook exists.** It used to show a session-end row marked
  "never fired", which reads as a hook that is installed and broken. That was wrong and was fixed:
  the row is gone.
- **The coverage count does not include it.** The "N of N checkpoints have fired" figure counts only
  the checkpoints DeVoid actually installs, so a perfectly healthy endpoint can now reach its own
  total. Previously it could not.
- **The endings DeVoid infers are labelled as inferred**, never as attested. Nothing is dressed up.
- **The endpoint writes its own record** of every session start and end, so the console's rows can be
  corroborated on the box rather than taken on trust.

---

## The two options

**Option A — confirm won't-fix.** Record that Codex sessions end with an inferred label by design,
and that this is accepted. Nothing to build. The cost is permanent: the "natively attested" label is
never available for Codex, and the ordinary-case end timing stays approximate.

**Option B — build it.** Accept a piece of work that touches the timeout handling for every hook on
every runtime, in exchange for a more accurate ending record and no new protection.

There is a third shape — build only the per-event timeout ceiling now, without the hook, so this is
cheap to revisit later. It has not been costed and is not being recommended here; it is noted so it
is not mistaken for unavailable.

---

## Confidence

**PROVEN — read directly from the code and the vendor binary on this machine:**

- The four budget reasons: all four values, the round trip, and the thirty-second stamp.
- That the installed vendor client (0.147) does list a session-end event.
- That DeVoid installs five Codex hook events, and session-end is not one of them.
- That inferred endings are labelled inferred and never certified as native.
- That the surface no longer shows a phantom session-end row, and the coverage total is reachable.

**NOT EXERCISED — nobody has watched this happen on a real enrolled endpoint:**

- Whether a real Codex session's inferred ending is timely enough in practice to be useful. Nobody
  has measured the gap between a session actually ending and the record closing.
- Whether the "inferred" versus "attested" distinction is visible to a console reader at all. The
  labels exist in the data; whether the console renders that difference has not been checked here,
  and a closely related gap is already open on the checklist (§3.8 — the console does not render the
  endpoint's attestation profile).
- No count exists of how many endpoints in the fleet are on a client old enough to lack the event.

Two of those three unknowns are cheap to settle and would sharpen this decision. None of them
blocks it.
