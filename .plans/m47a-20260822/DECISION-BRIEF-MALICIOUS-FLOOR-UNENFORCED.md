# Decision brief — the malicious floor is not enforced on the path admins actually use

**Written 2026-08-26. This is a brief, not a decision. Nothing has been changed.**
Found while implementing §3.3 (F41 / decision D4). It is not part of that fix and was deliberately
left alone, because every way of closing it has a blast radius that is yours to choose, not mine.

---

## The one-paragraph version

We have a rule called the **malicious floor**: a short list of things an AI agent must never be
allowed to do, whatever an administrator sets — start a reverse shell, wipe a disk, read cloud
credentials, disable DeVoid itself. The product describes this floor as absolute. **It is not.** An
administrator can lower a floor item today, through the ordinary settings page, and the endpoint
will obey them. The floor is only re-applied when someone clicks a **preset** — and clicking a
preset is a different action from changing a setting. So the floor holds for the admin who uses the
presets and quietly does not hold for the admin who edits the board directly.

---

## What an administrator can do today that they should not be able to do

An administrator with normal console access can:

1. Open the AI Security board.
2. Move **Reverse shell** — or **Disable DeVoid**, or **Read cloud credentials** — from Block down
   to Monitor.
3. Save.

The setting is accepted, stored, and sent to every endpoint in that scope. The agent stops blocking
it. Nothing warns them, nothing logs it as unusual, and nothing puts it back.

That is not the behaviour the product claims. Our own description of the floor says it exists so
that the most permissive preset is still safe, and that the console should render floor items
**locked, with a reason**, precisely so an administrator who tries this sees why it snapped back.
Today there is nothing to snap back from, because nothing snaps.

**Two things make it less alarming than it sounds, and neither makes it acceptable:**

- It takes a deliberate act by someone who already has permission to change security policy. This is
  not a privilege-escalation hole; it is a guardrail that is missing.
- If that same administrator later clicks any preset, the floor is re-applied and their change is
  silently reverted. So the current behaviour is not merely "unenforced" — it is **inconsistent**,
  which is worse for the person using it. Their setting works until the day it doesn't, and nothing
  tells them why it changed.

**What made this hard to notice:** the code that enforces the floor on every read has been written
and has been sitting there for months, complete and correct, with a comment at the top stating that
it runs on every policy assembly for every tenant. It has never been connected to anything. Only the
tests call it. That comment is the reason this was not found sooner — it is the same class of defect
the floor module itself was created to fix, repeated one level up. I have corrected the comment;
that change is in the F41 branch and is safe on its own.

---

## What turning it on would break

The obvious fix is to connect the existing check to the policy read path — one line, and the
enforcement it describes starts happening.

**That one line would take some organisations offline.**

The check does not repair a bad value. It **refuses to serve the policy at all** and raises an
error. So for any organisation whose stored settings are already below the floor:

- Their endpoints stop receiving policy.
- Endpoints fall back to their last known good policy, which is the safe direction — but they are
  now frozen, and they will not pick up anything new.
- The console cannot load that organisation's AI Security page either, because it assembles the
  same policy to display it.
- Recovery needs someone with database access, not an administrator with a browser.

**How many organisations is that? I do not know, and I did not look.** Answering it means querying
the production database, which I did not do and would not do without you asking. It is a single
read-only query and it is the first thing anyone should run before choosing between the options
below.

There is a second, quieter cost: some organisations may be *deliberately* below the floor. If
someone lowered an item for a real reason months ago and it has worked ever since, turning this on
takes their decision away with an outage rather than a conversation.

---

## The options

### Option 1 — Do nothing, and correct the claim

Leave the behaviour. Fix the documentation and the console so neither claims the floor is absolute.

- **Cost:** the guardrail stays missing. An administrator can still turn off reverse-shell blocking
  and it will stick until they touch a preset.
- **Gains:** no risk to anyone, today.
- **Honest name for this:** accepting that the malicious floor is a *preset* feature, not a floor.

### Option 2 — Repair on read instead of refusing

Instead of erroring, quietly raise any below-floor value back to its minimum when the policy is
assembled, and record that it happened.

- **Cost:** an administrator's stored setting and the setting that is actually enforced disagree —
  the console shows Monitor, the endpoint blocks. That is the exact "console says X, endpoint does
  Y" pattern that has caused most of the findings in this programme. It would need the console to
  render the lock and the reason at the same time, or it makes things worse rather than better.
- **Gains:** no outage, floor genuinely enforced everywhere, immediate.
- **This is the option I would pick**, paired with the console change, and not shipped without it.

### Option 3 — Migrate first, then refuse

Run a one-off correction that raises every stored below-floor value to its minimum, then connect the
check. After the migration there are no violating rows, so nothing errors.

- **Cost:** a migration that silently overwrites administrators' settings, and you would want to
  know who and what first. Two steps and two deploys.
- **Gains:** ends with the strictest, simplest guarantee — nothing below the floor can exist
  anywhere, and any future attempt fails loudly instead of quietly.

### Option 4 — Refuse the write instead of the read

Block the save at the point an administrator tries to lower a floor item, and leave existing rows
alone.

- **Cost:** does not fix any organisation that is already below the floor — they stay there for
  ever. Stops the bleeding, does not treat the wound.
- **Gains:** no outage, no overwriting, and the administrator gets an immediate, explainable error
  at the moment they try — which is the best possible place to tell them.
- Combines naturally with Option 2 or 3 as the second half of a proper fix.

---

## What I would ask you to decide

1. **Run the read-only count first.** How many organisations are below the floor today, and on which
   items? Every option below reads differently depending on whether that number is zero, three, or
   three hundred. If it is zero, Option 3 is free and this becomes an easy call.
2. **Then pick between "repair quietly" (2) and "migrate then refuse" (3)**, with Option 4 layered
   on either so new violations cannot be created.
3. **Option 1 is a real answer** if you would rather the ladder stayed simple — but then the word
   "floor" has to come out of the product and the docs.

**None of this is urgent in the way F41 was.** F41 was interrupting every developer every day. This
one has, as far as we know, never actually been used to lower anything — but we cannot say that with
confidence until the count in step 1 has been run.

---

## Scope note

This brief is about the tool-risk and DLP floor items only. The agent keeps its **own** independent
self-defence floor on the endpoint, in code, which no policy can lower — so "disable DeVoid" is
still refused locally even if the server-side floor item is set to Monitor. That local floor is
untouched by every option above and should stay that way.
