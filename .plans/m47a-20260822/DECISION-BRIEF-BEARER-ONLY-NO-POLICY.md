# Decision brief — endpoints that look healthy and are enforcing nothing

**Status:** finding, not a change. No auth behaviour has been altered. This is an owner call.
**Found:** 2026-08-26, by sending real HTTP requests to `GET /api/v1/ai/policy-bundle` for the first time.
**Evidence:** `Backend/src/ai-governance/controllers/ai-agent.policy-bundle.wire.spec.ts` (18 tests, live Postgres, genuine signatures).

---

## The consequence, first

An endpoint can sit in your console showing **Active**, **last seen two minutes ago**, running the
**current agent version** — and be enforcing **nothing at all**. Not a weaker policy. No policy.

Every time that machine asks the server for its rules, the server refuses. The machine keeps running,
keeps checking in, keeps looking healthy on the dashboard. The detection engine on it has never been
given anything to detect against.

There is currently **no screen, count, or alert anywhere in the product that distinguishes this machine
from a fully protected one.** If ten of your endpoints were in this state today, every dashboard would
still read 100% healthy.

That matters most right now because 4.7A ships a detection engine to endpoints. An endpoint in this
state receives the engine and never receives the rules it is supposed to enforce.

---

## Why the server refuses (this part is working as designed)

Rules are handed out per machine, and the server will only hand them to a machine that can **prove it is
that machine.**

The alternative would be to trust the site installation token. But that token is deliberately shared —
every machine at a site installs with the same one. If it were enough to fetch a policy, anyone holding
it could pull any endpoint's rules, and later, any endpoint's identity. So at enrolment each machine is
issued its own device key, and it signs every request with it.

A machine with no device key cannot prove who it is, so it gets nothing. **That refusal is correct.** The
defect is not the refusal — it is that the refusal is invisible, to the administrator and to the machine's
own status display.

---

## How a machine ends up with no device key

Four routes, all reachable in normal operation. None of them looks like a failure at the time.

1. **The server's key material was not configured when that machine enrolled.**
   If the signing keyring is missing or unset, enrolment still *succeeds* — it returns the machine an
   identity and simply no device key, logging "enrolment remains legacy/shadow compatible" and moving on.
   The machine has no idea anything is missing. Any endpoint that enrolled during a window where that
   configuration was absent is in this state permanently, and nothing retries.

2. **A reinstall wiped the machine's local key.**
   The machine re-enrols using only the shared site token. The server correctly refuses to re-issue the
   device key to a caller that cannot prove it is the same machine — that refusal is the anti-hijack
   protection and it should stay. But the outcome is a machine that is enrolled, active, and permanently
   keyless unless someone restores its credential backup by hand.

3. **It predates device signing** and has never re-enrolled.

4. **A remote uninstall or teardown cleared the key** and the machine came back without one.

Routes 1 and 2 are the ones that produce a *healthy-looking* endpoint. They are also the ones most likely
to affect many machines at once, because both follow from a single operator action — a configuration gap,
or a fleet reinstall.

---

## How many are in this state today

**Unknown. I did not query production, and this brief contains no production numbers.**

Worse: **the number cannot be read off any existing screen**, for two separate reasons.

- The endpoint record the console renders does not carry the fact at all. The API response for an
  endpoint has no field describing whether it holds a device key, so no console screen can show it
  without a backend change first.
- The one fleet-health figure that exists — the trust-anchor convergence number — counts a **different
  thing** (whether a machine has acknowledged storing its trust anchor). A machine can move that number
  and still be unable to fetch a policy. Reading it as "how much of the fleet is protected" over-reports.

A read-only query against the production database would answer it. It has **not** been run:

```sql
SELECT
  count(*) FILTER (WHERE status = 'active')                                     AS active_total,
  count(*) FILTER (WHERE status = 'active'
                     AND (request_signing_version IS DISTINCT FROM 2
                          OR request_signing_key_id IS NULL))                   AS cannot_fetch_policy,
  count(*) FILTER (WHERE status = 'active'
                     AND last_seen >= now() - interval '7 days'
                     AND (request_signing_version IS DISTINCT FROM 2
                          OR request_signing_key_id IS NULL))                   AS cannot_fetch_and_live
FROM agents;
```

The third column is the one that matters: machines that are **currently checking in** and cannot get a
policy. Those are the ones an administrator is actively being told are fine.

I recommend running this before choosing between the options below, because the right option depends
heavily on whether the answer is "three stragglers" or "a third of the fleet".

---

## Options

Presented so you can choose. None of these has been implemented.

**A. Do nothing.**
Cost: nothing today. Risk: the dashboard keeps saying "protected" about machines that are not, and the
first time anyone learns otherwise is after an incident on one of them. Given 4.7A ships enforcement to
endpoints, this is the option that most directly undermines the milestone's claim.

**B. Make it visible — no behaviour change.**
Surface the fact on the endpoint record, show it on the endpoint list and detail, and count it in fleet
health as its own number ("N endpoints are enrolled but cannot receive policy"). Backend change plus a
console change. Nothing about authentication moves; the refusal stays exactly as it is. This is the
smallest change that stops the product overstating its own coverage.

**C. Make the machine say it too.**
Have the agent report locally that it holds no policy, so someone at the keyboard sees it rather than
only someone at the console. Complements B; useful where endpoints are not centrally watched.

**D. Let affected machines heal themselves.**
Allow a keyless machine to obtain a device key again automatically. **This is the dangerous one.** The
refusal it removes is precisely what stops somebody holding only the shared site token from taking over
an existing endpoint's identity. If this is wanted, it needs its own security design — some proof that is
not the shared token — and should not be bundled with B or C.

**E. Alert on it.**
Route the condition to the customer's existing alert integrations rather than only to a dashboard. Cheap
once B exists, since the fact has to be computed anyway.

**Note on sequencing:** B is a prerequisite for C, D and E in practice — all three need the backend to
know and expose the fact. B alone changes no security behaviour and can be decided independently of D.

---

## What is proven and what is not

**PROVEN LIVE** (real HTTP, real Postgres, genuine device signatures, on this branch):
- An authenticated endpoint with no verified device signature receives `403` and no policy, every time.
- A valid device signature receives the policy, and the policy is bound to the cryptographically verified
  machine — never to anything the caller asks for.
- The endpoint record returned to the console carries no field describing device-key state.

**NOT EXERCISED / NOT KNOWN:**
- How many production endpoints are affected. Not queried.
- Whether any customer endpoint is currently in this state. Unknown.
- What the console actually renders for such an endpoint end to end — inferred from the backend response
  shape, not observed in a browser.
