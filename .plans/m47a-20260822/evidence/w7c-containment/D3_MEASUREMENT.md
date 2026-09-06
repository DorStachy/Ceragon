# W7C Task 2 Step 1 — the D3 measurement: `UNKNOWN`

Recorded 2026-09-04. D3 says measure the cost before making the trade. The measurement could not be
taken. **It is recorded `UNKNOWN`. No estimate has been substituted, and no number below was
inferred.**

## What was asked for

For the last complete window, per ecosystem and per `sandboxMode`:

| Quantity | Value |
|---|---|
| runs executed in `direct`, per ecosystem | `UNKNOWN` |
| runs executed in `strace`, per ecosystem | `UNKNOWN` |
| of those, how many produced a `BLOCK` via `decideDegradedRouting` branch 1 (`verdict-routing.ts:185-187`) | `UNKNOWN` |

That last row is the entire benefit that refusing a weak-mode run would trade away. It is the number
the decision in `STEP5_DECISION.md` would have turned on, and it does not exist.

## Why it could not be taken

1. **There is no window.** The ECS worker services have been at **0/0 since the 2026-06-26
   power-off**. There is no "last complete window" of production runs to summarise, because no runs
   happened. This is not a retrieval failure; the data was never generated.
2. **Production is out of bounds for this wave.** The assignment forbids touching AWS or running
   anything against production, so even a CloudWatch read was not attempted.
3. **There is no local corpus to replay.** Checked in the Sandbox-Worker worktree
   (`C:\cwt\p47-w7c-sbx`): no corpus, results or replay directory exists, and no fixture anywhere
   under `tests/fixtures` or `examples` records a `sandboxMode` per run. There is nothing to replay
   over.

## Why this is `UNKNOWN` and not `0`

A zero here would say we looked at the weak-mode runs and none of them ever produced a BLOCK — which
would make refusing them obviously free. Nobody looked. The runs did not occur. Recording `0` would
manufacture the exact justification the decision needed, out of the absence of the evidence for it.

This is the house rule the programme exists to enforce: **absence is not zero.** A missing
measurement is NULL and forces UNKNOWN.

## What was decided in the absence of the number

Step 5 of the wave file is explicit about this case: *"If the numbers are `UNKNOWN`, ship (i) and
record (ii) as an open owner decision"* — because option (i) is defensible without a measurement
(nothing usable is lost) and option (ii) is not. That is what shipped. See `STEP5_DECISION.md`.

## Re-opening this

The measurement becomes takeable again the moment the sandbox worker services carry traffic. Until
then this row stays `UNKNOWN` in every artifact that cites it. It must not be rendered as a blank, a
dash or a zero — an unmeasured surface read as a clean one is the single most repeated defect in this
codebase.
