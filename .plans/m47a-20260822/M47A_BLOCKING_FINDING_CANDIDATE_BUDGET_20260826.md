# M4.7A blocking finding — the sweep's denominator is measured against a sweep that cannot see

**Filed:** 2026-08-26 · **Severity:** P0 for M4.7A (not a data-loss defect; a MEASUREMENT defect)
**Status:** MEASURED on a real endpoint with the real resolver. **Not fixed — owner decision.**
**Affects:** W3 (measure), W4 (turn rules on), and decision **D3** directly.

> This is not in `M47A_DETECTION_QUALITY_REVIEW_20260823.md`. It was found on 2026-08-26 while
> fixing an unrelated data-loss P0, and it undermines the premise of the plan's central decision.

## Why this blocks M4.7A specifically

**D3: "Build FP measurement before turning any rule on."**
**Ordering constraint 6: "W3 before W4. Turning rules on without a measured denominator is exactly
what D3 forbids."**

The denominator is currently measured against a sweep that never looks at most of the surface. A
false-positive rate computed now would be a rate over an arbitrary 1% sample, chosen by
**alphabetical walk order**, and it would look excellent — because the files where credentials
actually live are not in it.

An FP rate that is low because nothing was inspected is the same false-green this milestone exists
to abolish.

## The measurement

Real resolver (`aicontext.Resolve`), real default options (`sweep.go:167` passes none, so
`MaxCandidates = 200`, `MaxNodes = 5000`, depth 8), real home directory, 2026-08-26:

```
nodes = 1038      candidates SEEN = 18299      truncated = false
```

**18,299 candidate files were seen. 200 were kept. 18,099 were discarded.**

Where the 200 slots went:

| root | slots | share |
|---|---|---|
| `.claude/plugins` | **193** | **96.5%** |
| `.claude/cache` | 2 | |
| `.claude/.credentials.json` | 1 | |
| `.claude/.last-update-result.json` | 1 | |
| `.claude/be-diff.txt` | 1 | |
| `.claude/jobs` | 1 | |
| `.claude/mcp-needs-auth-cache.json` | 1 | |

Classified rows are uncapped and unaffected (`.claude/skills` 497, `.claude/projects` 331, plus ~12
named files).

**Nodes under `.codex/sessions`: 0.** Codex session rollouts — 188 files, 408 MB, the exact analogue
of `.claude/projects/*/*.jsonl` — are **never scanned for credentials at all**.

## The mechanism, and why it is an accident rather than a policy

`matchSurface` (`resolve.go:251-283`) runs classified rows first (uncapped), then candidate rows,
first match wins. Candidate slots fill in Go's lexical walk order. `"cache" < "plugins" <
"projects"`, and `.claude` sorts before `.codex` and `.cursor`, so:

- `.claude/plugins` exhausts the budget before the walk reaches `.claude/projects`
- `.codex/**` and `.cursor/**` candidates receive **zero** budget on every run

Nobody decided this. It is the alphabet. It also **flips silently**: clear or rename
`.claude/plugins` and the budget lands somewhere entirely different, changing what the product
inspects with no code change and no signal.

## Why "we scan 193 plugin files" is not coverage

193 of 11,512 plugin-cache files is a 1.7% sample. This repository already has a recorded incident
whose root cause was this exact shape — see `project_jscrambler_miss_diagnosis`:
*coverage-sampling + value-gate import-only blind spot*. A sampled surface reports as a covered
surface, and the report is what people act on.

## The interaction with the 2026-08-23 data-loss fix

`catalog.go` now marks transcripts, subagent transcripts, Codex rollouts and agent memory
`Irreplaceable`, so a block-mode policy can no longer replace them. That protection does **not**
depend on the budget: `PathIsIrreplaceable` is consulted on every `replaceFile` regardless of
whether the file was ever a node.

So the two findings are independent and both true:
- the product can no longer **destroy** those files
- the product also does not **read** most of them

The tier note on `TierTranscript` calls transcripts "the largest at-rest secret store measured".
Both halves of that sentence deserve to be acted on.

## Options, with the tradeoff each one actually makes

| # | Change | Effect | Cost / risk |
|---|---|---|---|
| A | Give `.claude/plugins/**` (and `.codex/plugins`, `.cursor/extensions`) their own **classified** row | Frees the entire candidate budget for real surfaces; plugins scanned uncapped | Scans ~11.5k more files every sweep. Slowest option, most complete |
| B | Add the marketplace caches to `walkExcludes` | Frees the budget at zero scan cost | The product stops looking at plugin files entirely — wrong if a poisoned plugin is in scope. **M4.8/M5.2 own plugin governance, and a coworker owns that lane**, so this may be correct *here* and covered *there* |
| C | Order candidate selection by value instead of walk order | Deterministic, keeps some plugin coverage | Needs a value ranking nobody has defined yet; new mechanism, which the plan warns against |
| D | Raise `MaxCandidates` | Trivial | Does not fix ordering. `.codex` still last. Buys headroom, not correctness |

**Recommendation: B, with A as the follow-up owned by the plugin lane.** It is the only option that
is both cheap and honest, and the roadmap already assigns plugin/skill runtime governance to
M4.8/M5.2 rather than to M4.7A. Whatever is chosen, the choice should be **recorded as a decision**,
because today's behaviour is the alphabet's decision, not anyone's.

## What must NOT happen

Do not fix this by raising the cap alone and declaring the surface covered. The ordering bug
survives that, `.codex/sessions` still gets nothing, and the resulting denominator is still wrong —
while now *looking* deliberate.

## Reproduction

Run `aicontext.Resolve(Options{Home: <a developer home>})` and group `rep.Nodes` by tier and by
first two path segments. Compare `rep.CandidateCount` (seen) against the count of nodes at
`TierCandidate` (kept). Read-only; the resolver walks and reads and never writes.
