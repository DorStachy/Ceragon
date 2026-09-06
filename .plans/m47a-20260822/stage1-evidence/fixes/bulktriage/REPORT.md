# Fix: bulk triage reaches the backend (Frontend)

Branch `p47/fix-bulk-triage`, commit e93dcb12 (base 3ad35a28), merged into `p47/w6-frontend` as
0e8b730e. Written by the orchestrator from the fix agent's findings; raw evidence beside this file
(`bulk-triage-live.txt`, `bulk-triage-path-probe.sh`).

## What was wrong

The console posts to its own proxy at `/api/ai-control-plane/events/triage/bulk`, whose route forwarded
to the backend path `/api/v1/ai/events/triage/bulk`. The backend controller is
`@Controller('api/v1/ai/events')` + `@Post('bulk-triage')` with no global prefix, so the real path is
`/api/v1/ai/events/bulk-triage`. Every bulk action from the console 404'd (console lane, gap 1).

## What is now true

| file | change |
|---|---|
| `lib/api/endpoints.ts` | `EVENT_TRIAGE_BULK` = `/api/v1/ai/events/bulk-triage`; the stale "route not present" note replaced |
| `app/api/ai-control-plane/events/triage/bulk/route.ts` | comments only: names the backend path and states that the console-facing and backend paths differ on purpose |
| `lib/api/__tests__/event-triage-bulk-endpoint.test.ts` (new) | pins the backend literal, refuses the old `triage/bulk` shape, and fails if the proxy ever inlines an `/api/v1/` literal instead of the constant |

Every remaining `triage/bulk` hit in the tree is the console-facing proxy address (page, its test,
the route's own path), which is correct.

## Tests

Defeat step: with the old value 3 of 8 assertions fail; restored, 8 pass. `tsc --noEmit` clean.
`jest --ci` on the events proxy, the detections page and lib/api: 37 suites, 587 tests, 0 failures.

## Live proof against the backend (no console)

Group `k:private-key|private-key|9cc7bb95…`, three members. Old path: 404 `Cannot POST
/api/v1/ai/events/triage/bulk`. Corrected path: 201 `{"selected":3,"applied":2,"unchanged":1,"failed":0}`;
a repeat answers `unchanged:3`; resolve-without-note answers `failed:3` with per-event reasons. The
rig's rows were restored to `new`. Two things worth knowing: the DTO takes group keys, not event ids,
and a `note` in the body makes every member `applied`, which hides `unchanged`.

## Not done

The console proof through the UI runs after the console rebuild (the running server is a prebuilt
standalone bundle). The over-500 cap refusal was not exercised.

## Console proof (orchestrator, after the console rebuild at 0e8b730e, 2026-09-06 10:40)

Logged in as the demo admin, opened Coding AI > Detections, ticked "Select all signals on this page"
(50 groups, 122 detections) and pressed "Mark investigating".

| what | observed |
|---|---|
| request | `POST /api/ai-control-plane/events/triage/bulk` -> 200 |
| status line on the page | `122 detections updated, 10 already had this value, 0 could not be changed.` |
| triage tabs | New 34 in 16 groups; Investigating 132 |
| screenshot | `console-bulk-mark-investigating.png` |

The rig's rows were left in the investigating state on purpose; later probes create their own
events. VERIFIED.
