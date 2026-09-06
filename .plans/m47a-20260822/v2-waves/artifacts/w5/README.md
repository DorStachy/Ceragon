# Wave 5 render-harness run, banked 2026-09-03

`node scripts/render-harness/gate.mjs` on `p47/w5`, against the stub backend and
`next dev --webpack`. Reproduce with the two prerequisites in
`Frontend/scripts/render-harness/gate.mjs`'s header.

```
verdict: PASS
  self-check  exit 1  as expected   (no-such-route must be doc-status)
  self-check  exit 1  as expected   (broken-fixture must not grade a crashed page as OK)
  populated      exit 0   11 shots
  empty-tenant   exit 0   11 shots
  absent-data    exit 0   11 shots

TOTAL 33 shots | 0 FAIL | 0 shots with unfixtured upstream calls
```

## What this is evidence OF, and what it is not

Quoted from the harness README, because a report built on this run has to carry
it rather than paraphrase it:

> Nothing here talks to a real Backend. `stub-backend.cjs` answers with fixtures
> you wrote. A green run says the console renders honestly *given that wire
> state*; it says nothing about whether any Backend ever produces that state,
> and nothing about whether the data in production is correct.

Two further limits, also the README's:

- **No live-update channel.** The harness refuses the websocket token on
  purpose. Every screenshot is the console in its no-live-socket state — a real
  production state, but not the only one. Anything that appears only on a pushed
  update is **NOT EXERCISED**.
- **Dev-mode rendering.** It drives `next dev`, not a production build. Layout
  and copy match; build-time behaviour does not.

So: these are evidence about how the console looks around absent data. They are
not evidence that any Backend produces that state.

## The self-checks are the load-bearing part

Both must FAIL. On 2026-09-03 the second one was **green**: the page rendered
"500 / SOMETHING WENT WRONG" and `shoot.cjs` graded it `OK` with `failures: []`,
because a React error boundary catches the crash and the verdict had no arm for
it. The gate ran green over a broken console. `error-boundary` was added as a
failure and the marker it keys on is pinned by
`npm run check:render-harness-markers`.

That is why `gate.mjs` inverts them and refuses to run the scenarios at all if
either goes green: per the README, if a self-check passes, every other number in
the run is worthless.

## Two corrections this run forced on the plan's own route list

The plan verified its 11 routes by "page.tsx exists on `origin/main`". That is
not sufficient — a `page.tsx` that redirects is not a photographable route, and
three of the listed entries redirect:

```
endpoints                      -> /inventory
ai-control-plane               -> /
ai-control-plane/agent-posture -> /inventory     (probed as a replacement; also stale)
```

`endpoints` was dropped rather than followed, because it lands on a route already
in the list. `ai-control-plane/events` and `admin/policies/mcp` took the two free
slots; both resolve as themselves.

## One console defect this run found, and did not paper over

`/alerts` rendered its error boundary: `TypeError: Cannot read properties of
undefined (reading 'package')` at `alerts-content.tsx` `summaryCounts`. The
optional chain is on `summary` but not on `sourceCounts` — first hop guarded,
second hop not — so a summary arriving without `sourceCounts` throws.

`sourceCounts` is REQUIRED by the page's own declared type, so the fixture was
off-contract and the fixture was corrected. The page's behaviour on an
off-contract summary is recorded here rather than patched, because the tempting
one-character fix (`?.sourceCounts?.` plus `?? 0`) converts a crash into a green
zero — the exact false green this wave exists to remove. The honest repair is an
explicit could-not-load state, and it belongs to whoever owns that page.
