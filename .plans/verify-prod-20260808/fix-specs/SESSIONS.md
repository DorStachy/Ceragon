# Fix specs - cluster SESSIONS

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

ONE mechanism explains most of this cluster: the read model has no server-side notion of "an event a customer should see" or "a session that has governed activity". `AiQueryService.aggregateEventStats` (Backend/src/ai-governance/services/ai-query.service.ts:661-689) counts EVERY row in `ai_events` for a session, and `getSessionTimeline` (:1783-1788) renders EVERY row — while the two ANALYST surfaces (`listActivity` :3459-3469, `listDetections` :3674-3676) already exclude the standalone-receipt bookkeeping types via `STANDALONE_RECEIPT_EVENT_TYPES` (:289). So the W6/decision-6 exclusion was applied to two of four read surfaces and missed the two the customer actually opens. Adding ONE shared constant (bookkeeping = standalone receipts + SESSION_STARTED/SESSION_ENDED) and applying it to (a) eventCount, (b) the session timeline, (c) a "has governed activity" EXISTS predicate on the session LIST + overview aggregates closes F27 outright, closes the EVENTS-2 inflation half of F31, and closes the timeline half of F32 — one change, three findings. Deliberately NOT applied inside `scopeSessions` (:587-598), because `loadOrgScopedSession` (:1265-1274) uses it and a direct link to a filtered session must still open (evidence is excluded from a default view, never deleted — the house rule already stated at :278-288).

SECOND cross-cutting fact, and the most load-bearing discovery in this cluster: a spooled evidence event only materialises a session header when it carries a TITLE. Both ingest lanes gate on `input.sessionId && input.title?.trim()` (Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:869 signed lane, :1311 legacy lane). Any lane that has a session id but no repo/branch label (the Codex wire lane, and any future lane) writes `ai_events.session_id` pointing at a row that is never created. `ai_events.session_id` has no FK (Backend/src/entities/ai-event.entity.ts:72-73), so this fails silently. F26 cannot be fixed agent-side alone because of this gate.

THIRD: the daemon is SYSTEM in session 0 on a machine-scope install, so it must never derive an OS user (pinned by internal/daemon/ai_user_context_boundary_test.go, documented at Installers/cmd/devoid/ai_os_user.go:10-32). Every attribution fix in this cluster therefore resolves identity in a USER-CONTEXT process (the hook, or the browser native-messaging host) and relays it through the daemon — never in internal/daemon.

DEPLOY ORDER for the whole cluster: every Backend change here (bookkeeping exclusion, activity predicate, dropping the title gate, dropping the repo rung, thread collapse) is safe with the currently-deployed 7.8.30 agent and must land FIRST. The agent changes (wire session id, browser osUser/title, compact/fork chaining) are additive on wire fields the deployed Backend already accepts (`osUser`, `metadata.sessionTitle`, `sessionId`, `threadId`) — no contract type changes, and NO shared-contracts mirror is touched by any spec in this cluster (`AiSessionNameSource` is Backend-local; `AI_EVENT_TYPES` in packages/shared-contracts is READ but not modified).


---

## F27 - Session list/counts inflate because the read model has no notion of "a session with governed activity" — fix on the read side, do NOT stop emitting

- **Severity**: HIGH - The Sessions list is the customer's primary view and is ~5x noise; every session count on overview/exposure tiles is wrong. It is a read-model defect with no data loss, so it is fixable without touching the audit chain — HIGH, not CRITICAL.
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED
- **Also closes**: F32

### Root cause

The recorded fix direction ("do not MATERIALISE a session until it has a substantive event") is wrong, and the recorded root cause is incomplete.

WHAT ACTUALLY HAPPENS. Claude Code fires its SessionStart hook for every process start, including non-conversational ones (source=startup). The hook posts /v1/ai/session/start (Installers/cmd/devoid/ai_hook_runner.go:1244-1282); the daemon forwards it and gets the persisted id back (Installers/internal/daemon/ai_handlers.go:3009-3022), then emits the E8 SESSION_STARTED evidence event USING THAT RETURNED ID (:3036-3044). Backend `startSession` -> `upsertSession` creates the row keyed on the runtime's own UUID (Backend/src/ai-governance/services/ai-session-correlator.service.ts:165-213, :363-416). So the row is REQUIRED: the audit event has no session id without it, and the /clear chain root (ai_session_chain.go RecordThreadRoot, called at ai_handlers.go:3029-3031) is keyed on it.

THE REAL DEFECT IS DOWNSTREAM. `listSessions` pages raw `ai_sessions` rows with no activity predicate at all (Backend/src/ai-governance/services/ai-query.service.ts:851-945), and `aggregateEventStats` counts EVERY event type (:661-689) — which is why a start/end-only session reports "EVENTS 2" instead of 0 and looks like a real session. `getOverview` repeats the same unfiltered session aggregates five times (:1855-1870 total+byAgentType, :1873-1877 providers/models, :1925-1929 top-risky, :1956+ state counts, :1991-1997 topProviders). Meanwhile the two analyst surfaces already know how to exclude bookkeeping rows (:3459-3469, :3674-3676) — the rule exists, it was just never applied to the session surfaces.

SO: the endpoint is telling the truth (a process really did start and end, and E8 exists precisely so the box can corroborate a console row). The product is wrong to promote that into a first-class session row and to count it.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/ai-query.service.ts:851-945 (listSessions — org/site scope + optional filters only; no activity predicate)`
- `Backend/src/ai-governance/services/ai-query.service.ts:661-689 (aggregateEventStats — COUNT(*) over all event types)`
- `Backend/src/ai-governance/services/ai-query.service.ts:1855-1870, 1925-1929, 1956-1960, 1991-1997 (overview session aggregates, all unfiltered)`
- `Backend/src/ai-governance/services/ai-query.service.ts:278-289 + 3459-3469 (the SAME exclusion rule, already applied on the activity feed, with the 'excluded, never deleted, reachable by explicit query' contract)`
- `Backend/src/ai-governance/services/ai-query.service.ts:587-598 (scopeSessions) and :1265-1274 (loadOrgScopedSession uses it — so the predicate must NOT live there)`
- `Installers/internal/daemon/ai_handlers.go:2990-3046 (handleAISessionStart: backend row first, THEN the SESSION_STARTED evidence event keyed on the returned id)`
- `Installers/internal/daemon/ai_session_lifecycle.go:12-48, 89-118 (E8: the log line + spool event are the deliberate audit record of a session's beginning/end)`
- `Installers/cmd/devoid/ai_hook_runner.go:1244-1282 (the hook posts session/start unconditionally; source is forwarded at :1267-1269)`

### Fix

Define ONE server-side vocabulary of bookkeeping (non-user-facing) event types and derive both "how many events does this session have" and "is this session worth listing" from it. Nothing stops being emitted; nothing is deleted; the rows stay reachable through an explicit query, exactly like the existing standalone-receipt exclusion.

1. `SESSION_BOOKKEEPING_EVENT_TYPES = ['SESSION_STARTED','SESSION_ENDED']` and `NON_SUBSTANTIVE_EVENT_TYPES = [...EVENT_TYPES_BY_KIND.receipt, ...SESSION_BOOKKEEPING_EVENT_TYPES]` in activity-kind.util.ts (the file that already owns event-type vocabularies).
2. `aggregateEventStats` counts and takes MAX(event_time) over substantive events ONLY. A start/end-only session then honestly reads EVENTS 0.
3. `listSessions` adds an EXISTS predicate ("this session has at least one substantive event") to `base` BEFORE getCount()/getMany(), so total, page and hasMore all agree. Suppressed by an explicit `includeNonSubstantive=true` filter.
4. The five overview session aggregates get the same predicate via one private helper `withGovernedActivity(qb)`. Do NOT put it in `scopeSessions` — `loadOrgScopedSession` must keep resolving a filtered session so a deep link/forensic query still opens it.
5. Frontend: a plain "Show sessions with no recorded activity" toggle on the Sessions list that sets the query param, so the exclusion is discoverable rather than silent (honesty discipline: this is a default-view narrowing, and the console must say so).

The start/end lifecycle events remain in the chain, remain visible via the Events feed and via an explicit eventTypes query, and the session row remains openable by id. Backend-only; fixes the whole installed fleet immediately with no agent release.

### Changes

**Backend** - `src/ai-governance/services/activity-kind.util.ts`

After EVENT_TYPES_BY_KIND (:99 defines the `receipt` kind) export `export const SESSION_BOOKKEEPING_EVENT_TYPES: readonly string[] = ['SESSION_STARTED','SESSION_ENDED'];` and `export const NON_SUBSTANTIVE_EVENT_TYPES: readonly string[] = [...EVENT_TYPES_BY_KIND.receipt, ...SESSION_BOOKKEEPING_EVENT_TYPES];` with a docblock stating: these are the rows the product records but does not present as user activity — session bookkeeping and receipts-about-receipts. Do NOT change EVENT_TYPES_BY_KIND or deriveActivityKind; the Events feed keeps showing lifecycle rows.

**Backend** - `src/ai-governance/services/ai-query.service.ts`

(a) Import NON_SUBSTANTIVE_EVENT_TYPES; keep STANDALONE_RECEIPT_EVENT_TYPES (:289) as-is so the activity/detections predicates are unchanged. (b) aggregateEventStats (:661-689): add `.andWhere('e.event_type NOT IN (:...nonSubstantive)', { nonSubstantive: [...NON_SUBSTANTIVE_EVENT_TYPES] })`. (c) New private helper `private withGovernedActivity(qb) { return qb.andWhere(`EXISTS (SELECT 1 FROM ai_events ge WHERE ge.session_id = s.id AND ge.org_id = s.org_id AND ge.event_type NOT IN (:...govTypes))`, { govTypes: [...NON_SUBSTANTIVE_EVENT_TYPES] }); }`. (d) listSessions (:855): apply `this.withGovernedActivity(base)` immediately after `scopeSessions` unless `filters.includeNonSubstantive === true`, i.e. before the `getCount()` at :906. (e) getOverview: apply the helper to the session query builders at :1855-1858, :1873-1877, :1925-1929, :1956-1958, :1991-1997. (f) AiSessionListFilters (:185-204): add `includeNonSubstantive?: boolean`.

**Backend** - `src/ai-governance/dto/list-ai-sessions.dto.ts`

Add `@IsOptional() @Type(() => Boolean) @IsBoolean() includeNonSubstantive?: boolean` with an ApiPropertyOptional describing it as the explicit forensic query for sessions that recorded only start/end bookkeeping — default false, rows are excluded from the default view and never deleted.

**Backend** - `src/ai-governance/controllers/ai.controller.ts`

In the `GET sessions` handler (route registered near :343 for the sessions group) pass `includeNonSubstantive: query.includeNonSubstantive === true` through into the AiSessionListFilters object handed to `listSessions`.

**Frontend** - `app/ai-control-plane/ai-sessions/ai-sessions-content.tsx`

Add a checkbox/toggle beside the existing state filter (`stateOptions`, :50-54) labelled "Include sessions with no recorded activity"; when on, append `includeNonSubstantive=true` to the sessions fetch URL and reset paging. Default off. Copy under it (or as a title attribute): these sessions recorded only a start and an end — no prompt and no tool call.

### Rejected alternatives

- Agent-side suppression (don't POST session/start until a substantive checkpoint): destroys the E8 audit record of a session's beginning (the whole point of internal/daemon/ai_session_lifecycle.go:12-26), breaks the /clear chain root recorded at ai_handlers.go:3029-3031, requires the short-lived hook process to hold state it cannot hold, and only helps endpoints that upgrade — the console would stay full of phantoms from the deployed fleet.
- Backend-side 'do not materialise the row until the first substantive event': the daemon needs the persisted id in the session/start RESPONSE to key its SESSION_STARTED evidence event (ai_handlers.go:3009-3044); withholding it would either strand that event session-less or force a synchronous re-lookup.
- Deleting or not persisting start/end events: an append-only hash-chained store must not lose the one record that proves a session existed.

### Tests (each carries a defeat step)

- Backend unit (ai-query.service.spec.ts): a session whose ONLY events are SESSION_STARTED+SESSION_ENDED is absent from listSessions and absent from the getCount total; a session with one PROMPT_SUBMITTED is present. DEFEAT: delete the `withGovernedActivity` call in listSessions and re-run — the test must fail with the phantom row present AND with total=2 (proving the predicate is applied to `base` before getCount, not to the page).
- Backend unit: aggregateEventStats returns eventCount 0 / lastEventAt null for a start+end-only session, and 1 for a session with one PROMPT_SUBMITTED plus a SESSION_STARTED. DEFEAT: remove the NOT IN clause — the counts become 2 and 2, failing both assertions (so the test cannot pass vacuously on an empty fixture).
- Backend live-pg (new ai-query.sessions-substantive.live-pg.spec.ts, following ai-query.activity-w5.live-pg.spec.ts): insert 5 start/end-only sessions + 2 real ones exactly as measured live, assert listSessions returns 2 and `total`=2, then re-query with includeNonSubstantive=true and assert 7. DEFEAT: assert the 5 rows are STILL SELECTable directly from ai_sessions and that GET /sessions/:id/timeline for one of them returns 200 with its 2 lifecycle events — proving exclusion, not deletion.
- Backend unit (overview): getOverview totalSessions/sessionsByAgentType/active+ended state counts exclude the phantoms. DEFEAT: point one assertion at a fixture where the phantom is the ONLY session of its agentType and assert that agentType key is absent from sessionsByAgentType — a helper applied to only some of the five aggregates fails this.
- Frontend (ai-sessions-content.test.tsx): toggling the new control puts `includeNonSubstantive=true` on the request URL. DEFEAT: assert the DEFAULT request has no such param — a hardcoded-true implementation fails.

### Risks

A live session that has started but not yet issued a prompt disappears from the list for the seconds before its first checkpoint. Accepted and honest (the list is 'governed activity', and the toggle exposes the rest), but it changes the meaning of the `state=active` filter slightly — call it out in the DTO docblock. The EXISTS subquery runs once per candidate row; `ix_ai_events_session` (Backend/src/entities/ai-event.entity.ts:25) covers it, but on an org with a very large ai_events table watch the overview query plan (five aggregates each gain the subquery) — if it regresses, materialise the flag instead (a `first_activity_at` column stamped on first substantive append), at the cost of a backfill migration. No agent change, no contract change: an old agent keeps posting exactly what it posts today.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- DTO coercion bug that silently defeats the fix: the spec prescribes `@Type(() => Boolean)`. class-transformer's Boolean() on the query string "false" yields TRUE, so `?includeNonSubstantive=false` would DISABLE the exclusion. The codebase already has the correct idiom at src/ai-governance/dto/list-ai-detections.dto.ts:155-156 (`@Transform(({ value }) => toBool(value))` + `@IsBoolean()`); the spec ignores it.
- Incomplete enumeration of inflated session counts. The severityRationale claims "every session count on overview/exposure tiles is wrong" but the changes cover only 5 of 7 session aggregates. ai-query.service.ts:2148-2158 (getProviderMatrix session rows: COUNT(*) per provider/model/agentType) and :2399-2403 (buildProviderMatrixRow sessionCount) are customer-facing provider counts that stay inflated by the phantoms.
- Wrong controller line reference: the spec says "route registered near :343 for the sessions group". The handler is `@Get('sessions')` at src/ai-governance/controllers/ai.controller.ts:136-155. :343 is unrelated.
- Deploy-order hazard not stated. The global pipe is strict for console DTOs (`forbidNonWhitelisted: true`, main.ts:63-68; only CLI_AGENT-stamped DTOs are tolerant per src/common/pipes/agent-wire-dto.ts:3-27). An unknown `includeNonSubstantive` query param 400s the WHOLE sessions request against a Backend that has not shipped the DTO. Blast radius is limited only because the FE appends the param solely when the toggle is on — that limitation is load-bearing and must be pinned in the change text, not left as a design detail.
- Under-stated read-model side effect: aggregateEventStats also feeds getSessionTimeline (:1789 → toDetail) and the overview topRisky stats (:1931), so the session DETAIL header EVENTS number changes as well. Consistent with F32 and correct, but unstated.
- Effort M is at the ceiling once the two provider-matrix sites, the live-pg spec and the FE toggle+test are counted; treat as M/L, not comfortable M.

**Corrected root cause**: Root cause CONFIRMED — I opened and verified every citation. scopeSessions is at ai-query.service.ts:587-598 (org/site only); listSessions at :851-945 applies q/agentType/state/endReason/from/to/plane/endpointId and NOTHING else before `const total = await base.getCount()` (:906); aggregateEventStats at :661-689 is a bare COUNT(*) + MAX(event_time) with only org+session-id predicates; loadOrgScopedSession at :1265-1274 does go through scopeSessions (so the spec is right not to put the predicate there); the STANDALONE_RECEIPT_EVENT_TYPES exclusion exists at :289 and is applied at :3459-3469 and :3674-3676 only. EVENT_TYPES_BY_KIND.receipt is at activity-kind.util.ts:99 and SESSION_STARTED/SESSION_ENDED are in NO kind (they fall to deriveActivityKind's `default: return 'other'` at :233), which confirms they are pure bookkeeping. On the agent side handleAISessionStart (ai_handlers.go:2991-3046) genuinely needs the persisted id back before it can emit the E8 SESSION_STARTED keyed on `res.SessionID`, so the 'do not materialise' direction really is unavailable. The five overview aggregates are at :1854-1861, :1873-1877, :1925-1929, :1956-1962, :1991-1997 as claimed. The mechanism and the read-side direction are right.


**Corrected approach**: Keep the design. Four repairs: (1) DTO — use the repo's own boolean-query idiom `@Transform(({ value }: { value: unknown }) => toBool(value))` + `@IsBoolean()` (the exact pattern at src/ai-governance/dto/list-ai-detections.dto.ts:155-156), NOT `@Type(() => Boolean)`. (2) Apply `withGovernedActivity` to SEVEN session aggregates, not five — add getProviderMatrix's session rollup (ai-query.service.ts:2148-2158) and buildProviderMatrixRow's per-provider `COUNT(*)` (:2399-2403). (3) Controller: the sessions handler is `@Get('sessions')` at ai.controller.ts:136-155; add `includeNonSubstantive: query.includeNonSubstantive === true` to the object built at :143-154. (4) State explicitly that aggregateEventStats is ALSO consumed by getSessionTimeline (:1789) and the overview topRisky (:1931), so the session DETAIL header's EVENTS count changes too — that is the intended consistency with F32, but an implementer must not be surprised by it.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/ai-query.service.ts` - Apply withGovernedActivity to getProviderMatrix's session rollup at :2148-2158 and to buildProviderMatrixRow's session COUNT(*)/MAX(started_at) at :2399-2403 — otherwise the provider matrix keeps counting start/end-only phantoms as sessions that used a provider.
- **Backend** `src/ai-governance/dto/list-ai-sessions.dto.ts` - Replace the prescribed `@Type(() => Boolean)` with `@Transform(({ value }: { value: unknown }) => toBool(value))` + `@IsBoolean()`, matching list-ai-detections.dto.ts:155-156. Import toBool from the same helper that DTO uses.

**Collateral risk**: Low and none of it touches a PROVEN-WORKING capability. The predicate is confined to session-scoped read queries — command-lane blocking, DLP, browser masking, Codex wire blocking, signed-bundle propagation/anti-rollback, the package gate and MCP discovery are all untouched (no write path, no enforcement path, no agent change). Honest-negative discipline is preserved: rows are excluded from a default view, never deleted, and the FE toggle makes the narrowing discoverable. Real but accepted: a live session disappears from the list until its first substantive event, which changes what `state=active` means on that surface — the spec calls this out. Watch the EXISTS plan on the five (now seven) overview aggregates: ix_ai_events_session (ai-event.entity.ts:25) is on sessionId alone, so the event_type NOT IN filter is applied after the index probe.

**Effort correction**: M/L — M is credible only if the two provider-matrix aggregates are dropped from scope; with them plus the live-pg spec it is at the L boundary.


---

## F31 - Browser sessions are Unattributed and Untitled because the two identity fields the wire already carries are never populated by the browser lane

- **Severity**: HIGH - The session in which a real AWS credential was caught and masked is anonymous and unnamed — the incident of record cannot be attributed to a person or recognised by an investigator. The wire and storage already support both fields, so this is unfilled plumbing, not a missing capability.
- **Side**: agent   **Effort**: M   **Root cause verdict**: CONFIRMED
- **Depends on**: F27

### Root cause

Two independent unfilled fields, both of which the deployed Backend already accepts.

ATTRIBUTION. The Backend fills `ai_sessions.username` from `body.osUser` on the prompt-check path (Backend/src/ai-governance/controllers/ai-agent.controller.ts:206, 247) and the daemon relays it (Installers/internal/daemon/ai_handlers.go:1379 `OsUser: safeOSUser(body.OsUser)`), but the browser lane never supplies one: the native-messaging host builds a FIXED daemonPromptCheckBody with no osUser field (Installers/cmd/devoid-prompt-guard-host/main.go:368-384), and the extension cannot know an OS user. The daemon must not derive it — it may be SYSTEM in session 0 (Installers/cmd/devoid/ai_os_user.go:10-32, pinned by internal/daemon/ai_user_context_boundary_test.go). The native host, however, IS launched by the browser in the developer's own session — it is the browser lane's exact analogue of the CLI hook process, and it is the only correct place to resolve this.

NAME. The Backend stores the runtime's own chat name from `metadata.sessionTitle` (ai-agent.controller.ts:223, 255) and the daemon already relays it (ai_handlers.go:1418-1420 via `clientIdentityMetadata(..., body.ClientKind, body.SessionTitle)`; the field is declared at :704-711). The extension never sends one: `buildDaemonBody` has no sessionTitle key (Installers/browser-extension/src/daemon-body.js:40-52), and the native host does not forward one. So `chat_title` and `title` are both NULL and the E5 ladder correctly returns `Untitled session`.

EVENTS 2 is a third, separate cause: PROMPT_SUBMITTED + BROWSER_ENFORCEMENT_RECEIPT_RECORDED both count (see F32/F27).

### Evidence (read at origin/main)

- `Installers/cmd/devoid-prompt-guard-host/main.go:348-390 (promptCheck proxy builds a fixed body: Text/AgentType/Provider/SessionID/Surface/LocalDecision/... — no osUser, no sessionTitle, no clientKind)`
- `Installers/browser-extension/src/daemon-body.js:40-52 (buildDaemonBody field list)`
- `Installers/browser-extension/src/content/index.js:340-343 (sessionId() = per-tab UUID from sessionStorage) and :515 / :1080 / :1650 (the three send sites that pass it)`
- `Installers/internal/daemon/ai_handlers.go:704-716 (aiPromptCheckBody already declares ClientKind, SessionTitle, OsUser as RELAY-ONLY fields the daemon must never derive)`
- `Installers/internal/daemon/ai_handlers.go:1376-1379 and 1418-1420 (daemon relays OsUser and stamps SessionTitle into metadata)`
- `Backend/src/ai-governance/controllers/ai-agent.controller.ts:194-231 (prompt-check creates the session with username=body.osUser, chatTitle=body.metadata?.sessionTitle)`
- `Backend/src/ai-governance/services/session-display-name.util.ts:70-76 (ladder returns Untitled session when both columns are null — correct behaviour on absent input)`
- `Installers/internal/core/backend/ai_prompt.go:641-649 (AiPolicy.SessionTitles is already delivered to the daemon's policy cache, so the browser lane can be gated by the same knob)`
- `Installers/cmd/devoid/ai_hook_runner.go:1418-1430 (sessionTitlesEnabled: the fail-closed gate semantics to mirror)`

### Fix

Fill the two fields from the only processes entitled to know them, and gate the text one.

1. ATTRIBUTION — the native-messaging host resolves the OS login name in-process (it runs in the developer's session, exactly like the CLI hook) and adds `osUser` to the proxied prompt-check body. Reuse `internal/osuser.Sanitize` so the bound/normalisation is identical to the CLI lane. Absent stays absent (no fabrication) — the row then still renders Unattributed, honestly.

2. NAME — the extension resolves the AI site's OWN conversation title (the vendor-rendered chat name, i.e. the browser analogue of Claude Code's transcript `custom-title`/`summary` that we already capture) and sends it as `sessionTitle`; the native host forwards it; the daemon relays it as it already does for the CLI. It is NOT derived from prompt text: deriving a title from the prompt would create an unpurgeable content lane in `ai_sessions.title`, which has no retention job (see F20) and is not covered by the prompt-evidence policy — a strictly worse privacy posture than the redacted-preview lane. Title = the site's conversation name; provider/site already render as their own chips.

3. GATE — the extension only reads it when the delivered policy says sessionTitles is not 'off', and the daemon independently drops `SessionTitle` on browser-surface bodies when its cached policy says off (defence in depth: an out-of-date or modified extension must not be able to bypass the org's title knob). Gate scoped to the browser surface so the CLI lane, which already gates client-side, is untouched.

All three ride wire fields the deployed Backend already accepts — no contract change, no shared-contracts mirror, and the change is inert against a Backend that ignores them.

### Changes

**Installers** - `cmd/devoid-prompt-guard-host/main.go`

Add `OsUser string \`json:"osUser,omitempty\"`` and `SessionTitle string \`json:"sessionTitle,omitempty\"`` to `daemonPromptCheckBody`, and `SessionTitle string \`json:"sessionTitle,omitempty\"`` to `hostRequest` (:120-146). In `promptCheck` (:368-384) set `OsUser: hostOSUser()` and `SessionTitle: req.SessionTitle`. Add `hostOSUser()`: `u, err := user.Current(); if err != nil || u == nil { return "" }; return osuser.Sanitize(u.Username)` with a docblock stating WHY it is here and not in internal/daemon (RA-3: the daemon may be SYSTEM in session 0; this process is launched by the browser in the developer's session). Import os/user + internal/osuser.

**Installers** - `browser-extension/src/daemon-body.js`

In buildDaemonBody add, after `findings`: `if (typeof p.sessionTitle === 'string' && p.sessionTitle) body.sessionTitle = p.sessionTitle;` — omitted when absent so an older daemon sees a byte-identical body.

**Installers** - `browser-extension/src/content/index.js`

Add `conversationTitle()` next to `sessionId()` (:340-343): returns the site's conversation title (prefer the site adapter's title selector from content/sites.js when SITE defines one, else document.title with the site suffix trimmed), control-stripped, whitespace-collapsed and capped at 120 UTF-8 bytes (same bound as sessiontitle.MaxTitleUTF8Bytes), '' when unavailable. Return '' when the delivered policy's sessionTitles is 'off' OR when no policy is available (fail closed, mirroring sessionTitlesEnabled). Pass `sessionTitle: conversationTitle()` at the three payload sites (:515, :1080, :1650).

**Installers** - `browser-extension/src/content/sites.js`

Add an optional `titleSelector` to each site descriptor where the vendor renders the conversation name in a stable element; absent means fall back to document.title. Do not invent selectors for sites you cannot verify — an absent selector is honest and yields the document title.

**Installers** - `internal/daemon/ai_handlers.go`

In handleAIPromptCheck, before building `req` (i.e. before the Metadata line at :1418-1420), add: when `body.Surface` folds to "browser", clear `body.SessionTitle` unless the cached policy allows title capture — a small helper `titleCaptureAllowedForBrowser()` reading `aiPolicy.snapshot().Policy()` and applying the same rule as cmd/devoid ai_hook_runner.go sessionTitlesEnabled (nil/unavailable policy => false; SessionTitles=="off" => false; else true). CACHE-ONLY read (no network) — this is the enforcement hot path.

### Tests (each carries a defeat step)

- Installers Go (cmd/devoid-prompt-guard-host/main_test.go): a promptCheck message produces a daemon body whose `osUser` equals the sanitized injected user and whose `sessionTitle` equals the forwarded value. DEFEAT: inject a currentUser stub that errors and assert the key is ABSENT (not empty-string) — a version that always stamps a value fails.
- Installers Go (internal/daemon): browser-surface prompt-check with policy sessionTitles="off" produces a request whose Metadata has NO sessionTitle key; with "observed" it has one; with an EMPTY/contained policy snapshot it has none (fail closed). DEFEAT: run the same three cases with Surface="cli" and assert the CLI value survives all three — proving the gate is scoped and did not regress the CLI lane.
- Installers Go: the existing internal/daemon/ai_user_context_boundary_test.go must still pass unchanged — it is the defeat step for 'someone resolved the OS user in the daemon instead'. Add an equivalent assertion that cmd/devoid-prompt-guard-host is ALLOWED to call user.Current so the boundary is stated in both directions.
- Extension node --test (browser-extension/test): buildDaemonBody omits sessionTitle for an absent/empty value and includes it when set; conversationTitle() returns '' when policy.sessionTitles==='off' and when no policy is loaded. DEFEAT: feed a 400-character document.title containing multi-byte characters and assert the emitted value is <=120 UTF-8 BYTES (not 120 chars) — an implementation using .slice(0,120) on the JS string fails.
- Backend live-pg: a prompt-check body carrying osUser + metadata.sessionTitle on surface=browser produces a session row with username and chat_title set, and the list projection renders displayName=chat title, username=the user. DEFEAT: omit only osUser and assert the row still renders Unattributed — proving the test reads the field under test and not an incidental default.

### Risks

osUser is stored and displayed in PLAINTEXT (owner decision D9); this makes browser sessions person-identifiable, which is the intended, already-accepted posture for the CLI lane and must be stated in the change. A vendor page title can be user-authored text: it is capped, control-stripped and gated by the same org knob as the CLI chat name, but it is stored in `ai_sessions.title`/`chat_title`, which no retention job purges (F20) — flag this to the owner as a knowing extension of an existing lane, not a new one. If the native host binary is older than the extension (partial upgrade), it simply drops the unknown sessionTitle field and the session stays Untitled — degradation, not breakage. No Backend change required for either half, so the fix works against the currently-deployed Backend.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- The sessionTitles gate is specified but not implementable from the listed changes, and the obvious implementation fails OPEN. `sessionTitles` does not exist anywhere in browser-extension/src. The value is reachable (daemon handleAIPolicy at ai_handlers.go:3137-3147 serves the whole AiPolicy; policy.js:218-227 caches the body verbatim), but currentPolicy() falls back to DEFAULT_POLICY (policy.js:262-264) which has no such key and which hasEnforceablePolicy() accepts — so a naive `policy.sessionTitles !== 'off'` captures titles on a box with no policy, inverting the CLI's documented fail-closed contract (ai_hook_runner.go:1418-1429).
- document.title fallback fabricates a name. On a not-yet-named conversation every AI site's document.title is the vendor brand, so the browser lane would start writing 'ChatGPT' into ai_sessions.chat_title as if it were a conversation name — the same class of defect F29 exists to remove (a non-name rendered in the name slot). The spec's `titleSelector`-absent-is-honest reasoning does not cover this case.
- The daemon-side defence-in-depth gate is described as reading `aiPolicy.snapshot().Policy()` and applying sessionTitlesEnabled's rule, but sessionTitlesEnabled lives in package main (cmd/devoid/ai_hook_runner.go:1422) and is not importable from internal/daemon. The rule has to be re-expressed in internal/daemon (or lifted to a shared package); the spec implies reuse that does not exist.
- Effort M is optimistic. Go host change + a content-script title resolver with a UTF-8 byte cap + per-site titleSelector work across the 8 enrolled sites + a daemon-side surface-scoped gate + 5 test suites (2 Go, 1 node --test, 1 backend live-pg) is L, not M.
- Minor: the spec cites the native host's promptCheck body as :368-384; it is :365-383, and hostRequest is :120-148 not :120-146. Immaterial but the implementer should not trust the offsets.

**Corrected root cause**: Root cause CONFIRMED on both halves, citations verified. The native host's promptCheck builds a fixed daemonPromptCheckBody at cmd/devoid-prompt-guard-host/main.go:365-383 with Text/AgentType/Provider/SessionID/Surface/LocalDecision/EmitSubmitEvent/DataDisposition/RedactedCount/PasteRedacted/RedactedClasses/ApprovedAt/ApprovalSurface/Monitored/SuppressedRepeat — no osUser, no sessionTitle, no clientKind. hostRequest (:120-148) has no SessionTitle field either. buildDaemonBody (browser-extension/src/daemon-body.js:41-52) has no sessionTitle key. sessionId() at content/index.js:340-343 is the per-tab UUID, passed at :515/:1080/:1650. The daemon declares ClientKind/SessionTitle/OsUser as explicit RELAY-ONLY fields (ai_handlers.go:704-716) and relays them (`OsUser: safeOSUser(body.OsUser)` :1379; `clientIdentityMetadata(..., body.ClientKind, body.SessionTitle)` :1418-1420). The Backend stores username=body.osUser and chatTitle=body.metadata?.sessionTitle on BOTH branches of the prompt-check session upsert (ai-agent.controller.ts:206/223 and :247/:255). The daemon-must-not-derive-OS-user boundary is real. So this is genuinely unfilled plumbing on wire fields the deployed Backend already accepts.


**Corrected approach**: Keep both halves. Two repairs the spec must absorb before an implementer starts. (A) THE GATE AS WRITTEN CANNOT BE IMPLEMENTED FROM THE LISTED CHANGES AND FAILS OPEN. `sessionTitles` appears nowhere under browser-extension/src today. It DOES reach the extension — handleAIPolicy writes the whole backend.AiPolicy struct verbatim (internal/daemon/ai_handlers.go:3137-3147; SessionTitles is a tagged field at internal/core/backend/ai_prompt.go:649) and policy.js caches the accepted body verbatim (`_cache = { policy: safe }`, policy.js:218-227) so `currentPolicy()` can see it. BUT `currentPolicy()` falls back to DEFAULT_POLICY (policy.js:262-264), which has NO sessionTitles key, and `hasEnforceablePolicy()` returns true for it — so `policy.sessionTitles !== 'off'` evaluates TRUE on a box that has never received a policy, i.e. the privacy gate fails OPEN, the exact inverse of the CLI's sessionTitlesEnabled contract (ai_hook_runner.go:1422-1429). Pin the gate as: capture ONLY when `policyReadState()` is ACCEPTED or DEGRADED (both already imported at content/index.js:20-27) AND the accepted body's `sessionTitles !== 'off'`; an absent field on an ACCEPTED body means 'observed' (matches ai_prompt.go:642-649); no accepted read at all → ''. (B) FORBID A FABRICATED TITLE. document.title on a fresh chat is the vendor brand ('ChatGPT', 'Claude'), so the document.title fallback would name an UNNAMED conversation after the vendor — a fabricated name in the name slot, which is precisely the F29 defect re-created on the browser lane. Require conversationTitle() to return '' when the resolved value equals the site descriptor's brand/default title; absent stays absent and the row honestly reads 'Untitled session'.


**Missing changes the reviewer found**:

- **Installers** `browser-extension/src/content/index.js` - conversationTitle() must gate on `policyReadState()` being ACCEPTED or DEGRADED (already imported at :20-27) before reading sessionTitles, and must return '' when no accepted read exists — otherwise DEFAULT_POLICY (policy.js:262-264, no sessionTitles key) makes the gate fail OPEN. It must also return '' when the resolved title equals the site's brand/default document.title, so an unnamed chat is never named after the vendor.
- **Installers** `internal/daemon/ai_session_titles_gate.go (new) or ai_handlers.go` - sessionTitlesEnabled is in package main (cmd/devoid/ai_hook_runner.go:1422) and cannot be imported by internal/daemon. Re-express the rule locally (nil/unavailable snapshot => false; SessionTitles=="off" => false; else true) or lift it into internal/core/backend next to AiPolicy.SessionTitles (ai_prompt.go:649) and have both callers use it, so the CLI and browser gates cannot drift.

**Collateral risk**: Nothing PROVEN-WORKING is at risk. The native host's promptCheck is a fail-safe recording proxy (main.go:344-352: any failure yields allow + daemon-unreachable) and the extension's local in-page DLP remains authoritative, so adding two fields cannot affect browser masking-before-send — the one lane FINDINGS records as fully proven end-to-end. Both fields are additive+omitempty so an older daemon sees a byte-identical body and an older Backend ignores them; a new host + old extension simply sends no title. One genuinely good property the spec does not claim: correlator backfillIdentity fills only NULL columns from non-null input (ai-session-correlator.service.ts docblock at :216-228), so EXISTING Unattributed/Untitled browser rows are repaired by the next prompt-check with no migration. The real risk is the privacy one: osUser in plaintext (owner decision D9, already the CLI posture) plus a user-authored page title landing in ai_sessions.title/chat_title, which F20 says no retention job purges — the spec flags this correctly and it needs an explicit owner ack.

**Effort correction**: L (3-5d), not M — the per-site title resolution and the two-sided gate are the bulk.


---

## F26 - Codex wire-lane activity has a stable session identity — the proxy computes it and then throws it away at the AlertObserver seam; and the spool would not create the header anyway

- **Severity**: MEDIUM - No evidence is lost (events are spooled and delivered) and enforcement is unaffected, but all Codex governance including 9 real blocks is unreachable from the product's primary view. Two small, well-localised changes make it visible.
- **Side**: multi   **Effort**: M   **Root cause verdict**: REVISED
- **Depends on**: F27

### Root cause

The recorded correction says "sessionID is deliberately empty string for the wire lane", i.e. the wire lane has no session concept. That is FALSE, and the code comment asserting it is stale.

The wire lane DOES compute a stable per-conversation identity: `sessionIDFromHeaders` (Installers/internal/proxy/openai_ws.go:375-390) derives it from X-Codex-Parent-Thread-Id / X-Codex-Installation-Id / X-Client-Request-Id / X-Codex-Window-Id specifically so it survives a reconnect for the same logical conversation, and `NewWSSession` is seeded with it at :105. Every wire record carries it: `WireObservation.SessionID` (internal/proxy/openai_evidence.go:76, populated by `newWireObservation` :239-253). It is used today to make a persisted deny survive a reconnect.

IT IS DISCARDED AT ONE LINE. `emitWire` (:99-107) delivers only `wo.Alert` — an `AlertRecord`, which has no session field — to the injected AlertObserver. The daemon's observer therefore has nothing, and passes the empty string explicitly: `ev := aiEventFromProxyAlert(rec, endpointID, "")` at internal/daemon/ai_handlers.go:2188, under a comment (:2178-2182) claiming "there is no per-request session on a proxy alert today" — true of the anthropic lane, false of the wire lane.

SECOND, INDEPENDENT BLOCKER (this is why an agent-only fix would look green and stay invisible): even with a session id stamped, the Backend would not create the session header. Both evidence-ingest lanes materialise a header ONLY for events that carry a TITLE — `if (input.sessionId && input.title?.trim())` at Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:869 (signed) and :1311 (legacy). A wire event has a session id and no repo/branch label, so it would write `ai_events.session_id` pointing at a row that never exists; there is no FK (Backend/src/entities/ai-event.entity.ts:72-73) so it fails silently and the Sessions list still shows nothing.

Third constraint: the spool drops any non-UUID session id (Installers/internal/daemon/evidence_delivery.go:369-374), so the header-derived key must be mapped to a UUID before it is enqueued.

### Evidence (read at origin/main)

- `Installers/internal/proxy/openai_ws.go:105 and :375-390 (sessionIDFromHeaders — stable across reconnect, by design)`
- `Installers/internal/proxy/openai_evidence.go:76 (WireObservation.SessionID), :239-253 (newWireObservation populates it), :99-107 (emitWire passes ONLY wo.Alert to the observer — the drop point)`
- `Installers/internal/proxy/ai_alert.go:50-95 (AlertRecord has no session field)`
- `Installers/internal/daemon/ai_handlers.go:2178-2204 (emitAIProxyEvent; :2188 passes "" with a now-stale justification comment)`
- `Installers/internal/daemon/evidence_delivery.go:369-382 (non-UUID session ids are silently dropped from the spool row)`
- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:861-886 (signed lane header creation gated on input.title) and :1299-1329 (legacy lane, same gate)`
- `Backend/src/entities/ai-event.entity.ts:72-73 (session_id is a plain nullable uuid — no FK, so an orphan is silent)`

### Fix

Carry the identity the wire lane already has across the one seam that drops it, and stop making session materialisation conditional on a repo label.

BACKEND FIRST (must deploy before the agent, and is harmless alone): drop the `input.title?.trim()` condition in BOTH ingest lanes so any spooled event carrying a sessionId materialises/refreshes its header through the existing idempotent `startSessionOnRunner`/`startSession`. Keep title/provider/agentType/surface pass-through exactly as now. This also fixes the latent orphan class for every future lane.

AGENT: add an in-process-only `SessionKey string \`json:"-"\`` to AlertRecord, set it in `emitWire` from `wo.SessionID` (json:"-" guarantees the raw Codex header value can never reach a log, the tamper store or the wire), and in `emitAIProxyEvent` map it to a deterministic UUIDv5 (`uuid.NewSHA1(devoidWireNamespace, []byte("devoid-wire|"+key))`) so the same conversation converges on one session across daemon restarts while the raw header value never leaves the process. Pass that UUID as the third argument at ai_handlers.go:2188. Leave the anthropic lane at "" (unchanged — it genuinely has no wire session; its hook lane already owns one).

The resulting session renders honestly: agentType codex, provider openai, surface web-ai-proxy, name "Untitled session" (Codex desktop exposes no thread name on this route — an absent fact stays absent), Unattributed actor (the daemon may be SYSTEM and must not guess a user). It groups the 9 blocks, which is the entire point.

### Changes

**Backend** - `src/ai-governance/services/endpoint-evidence-ingest.service.ts`

startSignedBatchSessions (:867-872): change the collection condition from `if (input.sessionId && input.title?.trim())` to `if (input.sessionId)`; keep last-wins so a titled event in the batch still supplies the title. finalizeLegacyBatch (:1309-1314): identical change. Update both docblocks: a session header is created for ANY event that names a session — gating on a repo/branch label left every lane without one (the Codex wire lane) writing events under a session row that was never created.

**Installers** - `internal/proxy/ai_alert.go`

Add to AlertRecord: `// SessionKey is the wire lane's stable per-conversation identity (see openai_ws.go sessionIDFromHeaders). IN-PROCESS ONLY — json:"-" so the raw client header value can never reach the tamper log, the bypass queue, the heartbeat or the backend wire; the daemon maps it to a derived UUID before anything is emitted.` then `SessionKey string \`json:"-"\``.

**Installers** - `internal/proxy/openai_evidence.go`

In emitWire (:99-107), after `rec := wo.Alert`, add `rec.SessionKey = wo.SessionID` so every wire record delivered to the AlertObserver carries the conversation identity. No other call site changes (all six emitWire* helpers go through it).

**Installers** - `internal/daemon/ai_handlers.go`

In emitAIProxyEvent (:2183-2204) replace `aiEventFromProxyAlert(rec, endpointID, "")` with `aiEventFromProxyAlert(rec, endpointID, wireSessionUUID(rec.SessionKey))`, and add `wireSessionUUID(key string) string` returning "" for an empty key, else `uuid.NewSHA1(wireSessionNamespace, []byte("devoid-wire|"+key)).String()` with a package-level fixed namespace UUID. Replace the stale comment at :2178-2182 with the truth: the wire lane HAS a stable conversation identity; the anthropic lane still has none and keeps "".

### Tests (each carries a defeat step)

- Installers Go (internal/proxy): drive two wire emissions on one WSSession and assert both delivered AlertRecords carry the SAME non-empty SessionKey; drive a second session with different headers and assert a different key. DEFEAT: assert `json.Marshal(rec)` output contains NO occurrence of the header value — proves json:"-" and that the raw id cannot leak.
- Installers Go (internal/daemon): a proxy alert with SessionKey set produces an enqueued spool event whose SessionID is a valid UUID and is IDENTICAL for two alerts with the same key; an alert with an empty key produces an empty SessionID. DEFEAT: run the same assertion through evidence_delivery.eventInputFromAppend and check the id SURVIVES — if the derivation returned a non-UUID it would be silently dropped at :371-374 and the test would still pass at the earlier layer, so the assertion must be made after that mapping.
- Backend live-pg (endpoint-evidence-ingest): ingest a batch with ONE event that has a sessionId and NO title; assert an ai_sessions row now exists with that id, the event's session_id resolves to it, and GET /sessions/:id/timeline returns the event. DEFEAT: run the identical batch against the pre-change condition and assert it produced NO session row — pins that the test exercises the removed gate, not the pre-existing titled path.
- End-to-end (local): with a Codex desktop turn blocked on the wire, the sessions list contains a codex/openai session grouping the block. DEFEAT: assert the SAME conversation across a proxy reconnect lands in ONE session (drop and re-establish the connection with the same Codex headers) — a per-connection random id would produce two rows and fail.

### Risks

Dropping the title gate makes the ingest path call startSession once per DISTINCT sessionId per batch instead of only for titled ones — more upserts per batch (bounded by distinct sessions in a 2 MiB batch; the upsert is idempotent and already runs on the committing runner in the signed lane). Watch batch latency on the busiest endpoint. It will also materialise headers for any other lane that stamps a session id today — that is the intended repair, but expect previously-invisible sessions to appear; the F27 activity predicate keeps the contentless ones out of the default view. Old agent + new Backend: no behaviour change (their events carry titles or no session id). New agent + old Backend: the wire events carry a sessionId that the old Backend will not materialise — same invisibility as today, no regression, which is why the Backend must ship first.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- The Backend change instruction is self-contradictory and would silently drop repo/branch titles. It says 'change the condition to `if (input.sessionId)`; keep last-wins so a titled event in the batch still supplies the title.' Under last-wins on `titledSessions.set(sessionId, input)` (endpoint-evidence-ingest.service.ts:867-872 and :1309-1314), a later UNTITLED event for the same session overwrites the titled one and the batch upserts title:null. Correlator backfillIdentity only fills NULLs and never overwrites (ai-session-correlator.service.ts:216-228), so nothing is permanently lost, but the title is delayed and the stated rationale is false as written.
- The 'stable per-conversation identity' premise is not proven for the fleet. openai_ws.go:379-390 falls through X-Client-Request-Id (per-request by name) to `"ws-"+uuid.NewString()` (:389, per-connection). If either is what Codex desktop actually supplies, the fix creates one ai_session per turn — turning an invisible lane into the worst instance of the very inflation F27 exists to fix. The spec treats this only as an e2e test; it must be a measured precondition.
- Concurrency escalation in the legacy lane is unmentioned. finalizeLegacyBatch uses `Promise.all` over the map (:1315-1329); the signed lane is deliberately sequential ('one QueryRunner is one connection', :852-858). Removing the gate widens the legacy fan-out, which the risks section describes only as 'more upserts'.
- The claim that the Backend change 'is harmless alone' is wrong in the stated deploy window. Dropping the title gate materialises headers for every lane that already stamps a sessionId, so if it lands before F27's activity predicate the Sessions list gets MORE phantom rows, not fewer. dependsOn F27 is declared, but the 'harmless alone' sentence contradicts it and an implementer sequencing by that sentence would regress the customer's primary view.

**Corrected root cause**: The core discovery is CORRECT and the recorded 'sessionID deliberately empty' correction really is stale. Verified: WireObservation.SessionID exists (internal/proxy/openai_evidence.go:76) and is seeded from sess.SessionID() in newWireObservation (:239-252); NewWSSession(sessionIDFromHeaders(r.Header)) at openai_ws.go:105; emitWire (:99-107) copies only `rec := wo.Alert` and calls emitAlert(c.AlertObserver, rec) — the SessionID never crosses; AlertRecord (internal/proxy/ai_alert.go:50-105) has no session field; emitAIProxyEvent passes "" at internal/daemon/ai_handlers.go:2188 under the stale comment at :2178-2182; eventInputFromAppend silently drops a non-UUID session id at internal/daemon/evidence_delivery.go:369-374; and BOTH ingest lanes gate header creation on `if (input.sessionId && input.title?.trim())` — endpoint-evidence-ingest.service.ts:869 (signed) and :1311 (legacy), with ai-event.entity.ts:72-73 confirming session_id is a plain nullable uuid with no FK. All four load-bearing facts hold.

ONE CLAIM IS OVERSTATED AND IS THE RISK THAT COULD MAKE THIS FIX BACKFIRE. sessionIDFromHeaders (openai_ws.go:379-390) returns the first non-empty of X-Codex-Parent-Thread-Id, X-Codex-Installation-Id, X-Client-Request-Id, X-Codex-Window-Id and otherwise `"ws-" + uuid.NewString()` (:389). Two of those are not per-conversation: X-Client-Request-Id is by name per-REQUEST, and the uuid fallback is per-CONNECTION. The docstring's 'stable across a reconnect' is an aspiration of the header ORDER, not a proven property of what Codex desktop actually sends. If the header actually present on this fleet is X-Client-Request-Id, the fix mints a NEW ai_session per turn and makes the F27 inflation strictly worse on a lane that currently creates zero rows.


**Corrected approach**: Same two changes, with three corrections. (1) MEASURE FIRST, then land: before the agent half ships, capture the handshake headers of a real Codex desktop connection on the dogfood box and confirm which of the four is present. Land the agent half ONLY if X-Codex-Parent-Thread-Id or X-Codex-Window-Id is the resolved source; if X-Client-Request-Id or the uuid fallback is what fires, derive the key from a per-conversation header the proxy already sees or ship nothing and record honest absence — a per-turn session is worse than no session. Make this a precondition, not a test. (2) FIX THE BACKEND CHANGE TEXT: `titledSessions.set(input.sessionId, input)` under `if (input.sessionId)` is LAST-WINS, so an untitled event later in the batch REPLACES the titled one and the title is dropped for that batch. The instruction must be: replace the stored entry only when the incoming input HAS a title, or when the stored one has none. Rename the map (it is no longer 'titled'). (3) BOUND THE LEGACY LANE: finalizeLegacyBatch fans the map out through `Promise.all` (:1315-1329). Dropping the gate multiplies the PARALLEL startSession calls, not just their count. Make it sequential (as startSignedBatchSessions already is at :872-885) or chunk it.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/endpoint-evidence-ingest.service.ts` - At :867-872 and :1309-1314, replace the naive last-wins `set()` with a title-preferring merge: store the input when the map has no entry, or when the incoming input has a non-empty trimmed title. Rename `titledSessions` to `sessionHeaders`. Also make the legacy lane's fan-out at :1315-1329 sequential (or chunked) to match the signed lane's deliberate serialization at :872-885.
- **Installers** `internal/proxy/openai_ws.go` - Precondition spike, not a code change: instrument/capture which of the four headers at :379-390 is actually present on a live Codex desktop handshake. If the resolved source is X-Client-Request-Id or the `"ws-"+uuid.NewString()` fallback at :389, the derived session key is per-turn/per-connection and the agent half must NOT ship as written.

**Collateral risk**: The agent half is well-contained and does not touch enforcement: SessionKey with `json:"-"` cannot reach the tamper log (recordAIProxyAlert builds its `details` map field-by-field at ai_handlers.go:2144-2158, so the key is not serialized there either), the bypass queue, or the wire. Codex wire BLOCKING — a PROVEN-WORKING capability — is untouched; only the post-decision evidence emission changes. The anthropic lane keeps "" as specified. The Backend half's blast radius is the ingest hot path: one extra idempotent upsert per distinct sessionId per batch, bounded by a 2 MiB batch, plus the unbounded-parallelism issue above. No contract type changes and no shared-contracts mirror is touched. Backend-first ordering is correct and a new agent against an old Backend degrades to today's invisibility, not breakage.

**Effort correction**: M is credible for the code, but add the header-measurement spike as a gating precondition (roughly half a day of live work on the dogfood box) before the agent half can be scheduled.


---

## F28 - compact/fork mint a new runtime session id and the hook chains it to ITSELF, so a continuation is stored as an unrelated row with the same name

- **Severity**: MEDIUM - Two identically-named rows for one conversation make the primary view untrustworthy and inflate session counts, but no evidence is lost and the correct linkage machinery already exists for /clear.
- **Side**: multi   **Effort**: L   **Root cause verdict**: REVISED
- **Depends on**: F27

### Root cause

The recorded cause ("fork and compact create DUPLICATE sessions inheriting the parent display name") is the symptom. The mechanism is a false assumption in one function plus a chain memory that is armed by only one kind of transition.

`sessionStartThreadID` (Installers/cmd/devoid/ai_hook_runner.go:1314-1330) returns the INCOMING session id as the threadId for source in {resume, compact}, documented as "the runtime identity that remains stable when Claude re-fires SessionStart for resume/compaction". Private live evidence disproves that for compact and fork: sid=`<COMPACT_SESSION_ID>` source=compact and sid=`<FORK_SESSION_ID>` source=fork are NEW ids, distinct from the parent. So the hook sends threadId == the child's own id.

That value then actively BLOCKS recovery. In handleAISessionStart the chain lookup runs only when the threadId is empty: `if threadID == "" && source == "clear" { threadID = s.aiChain.TakeCleared(...) }` (Installers/internal/daemon/ai_handlers.go:3002-3008) — a self-id is non-empty, so nothing is consulted. On the Backend, `startSessionOnRunner` skips the root stamp because `threadRootId === session.id` (Backend/src/ai-governance/services/ai-event.service.ts:798-806) and `createSession` stores thread_id = the row's own id (ai-session-correlator.service.ts:397). The parent keeps thread_id NULL. Two rows, no shared thread, no join.

Secondly, the chain memory only ever arms on a /clear: `RememberCleared` is called from handleAISessionEnd when reason=="clear" (ai_handlers.go:3075-3077). A compaction or fork does NOT end the parent, so there is nothing armed to consume.

Thirdly — and this is why an agent-only fix is not enough — nothing on the read side uses thread_id: the Backend serves it (ai-query.service.ts:756) and the Frontend declares it (types/ai-governance.ts:124, :264) and never reads it. Even a perfectly chained thread renders as two independent rows.

The inherited NAME is expected and correct: both rows read the same transcript, so `sessiontitle.Extract` yields the same chat name. The name is not the defect; the missing linkage and the missing collapse are.

### Evidence (read at origin/main)

- `Installers/cmd/devoid/ai_hook_runner.go:1314-1330 (sessionStartThreadID returns the child's own id for resume/compact, on a stability assumption the live data disproves)`
- `Installers/internal/daemon/ai_handlers.go:3002-3008 (chain lookup is skipped whenever threadId is non-empty, and only for source==clear)`
- `Installers/internal/daemon/ai_session_chain.go:11-43, 151-210 (the chain memory exists and is correct, but is armed ONLY by an end(reason=clear))`
- `Backend/src/ai-governance/services/ai-event.service.ts:789-807 (root stamp skipped when threadRootId === session.id)`
- `Backend/src/ai-governance/services/ai-session-correlator.service.ts:394-399 (createSession stores thread_id verbatim, so the child points at itself)`
- `Backend/src/ai-governance/services/ai-query.service.ts:756 (threadId is projected to the client)`
- `Frontend/types/ai-governance.ts:124 and :264 (threadId declared) — no consumer anywhere in app/ or lib/ (verified by search)`
- `Installers/cmd/devoid/ai_client_identity.go:83-89 + internal/sessiontitle/sessiontitle.go:69-111 (both rows read the same transcript, hence the same chat name)`

### Fix

Make the daemon — the only long-lived process that sees every SessionStart for a client — own continuation linkage for compact/fork exactly as it already owns it for /clear, and make the read side present a thread as ONE row.

AGENT (Installers):
1. `sessionStartThreadID` stops returning a self-id. It returns "" always; the daemon resolves the parent. (For a true `resume` the id is unchanged, so the Backend upserts the same row and the self-threadId added nothing.) Keep the function as the one place that decides, with the corrected docblock.
2. Defensively, the daemon treats `threadId == clientSessionId` as unset (a hook binary mid-upgrade still sends the old value).
3. Extend `aiSessionChain` with a per-client LAST-LIVE memory: `RememberLive(scopeKey, clientKey, sessionID)` called on every handleAISessionStart, storing {threadRoot: ThreadRootOf(sessionID), seenAt}, bounded like `cleared` and TTL'd at 12h (a compaction can happen hours into a session; /clear keeps its 2-minute TTL). `ContinuationRootFor(scopeKey, clientKey, newSessionID)` returns the remembered root when it exists, has not expired and names a DIFFERENT session id; "" otherwise. Peek-and-replace, not one-shot: a long session can compact repeatedly.
4. handleAISessionStart resolves threadId in this order: validated non-self hook value -> TakeCleared (source==clear, unchanged) -> ContinuationRootFor (source in {compact, fork, resume}) -> "" (unchained; an absent fact stays absent). Then RememberLive + the existing RecordThreadRoot.
The existing (scopeKey, clientKey) keying is exactly right here: clientKey is the AGENT PROCESS hash (ai_client_identity.go:219-234), and compaction/fork happen inside the same process, while two concurrent chats are two processes.

BACKEND: collapse a thread to one row in `listSessions`. Page over ROOTS only — `(s.thread_id IS NULL OR s.thread_id = s.id)` — and aggregate the thread's events (COUNT/MAX over events whose session belongs to the thread), adding `continuationCount` and `threadId` to the list item. The member rows stay individually addressable by id (loadOrgScopedSession is untouched), so nothing is hidden from a deep link or a forensic query.

FRONTEND: render the continuation fact on the collapsed row ("continued after compaction · N segments") so the customer learns why one conversation spans segments instead of seeing it silently merged.

### Changes

**Installers** - `cmd/devoid/ai_hook_runner.go`

sessionStartThreadID (:1321-1330): return "" unconditionally and rewrite the docblock — Claude Code mints a NEW session_id on compaction and fork (private measurement: sid `<COMPACT_SESSION_ID>` source=compact, sid `<FORK_SESSION_ID>` source=fork), so the incoming id is never the parent's; the daemon resolves continuation from its own per-client memory. Keep the call site at :1262-1264 (it simply stops setting body["threadId"]).

**Installers** - `internal/daemon/ai_session_chain.go`

Add `aiLiveContinuationTTL = 12 * time.Hour`, `maxAILiveClients = 256`, a `live map[string]aiLiveSession` field ({threadRoot, seenAt}), `RememberLive(scopeKey, clientKey, sessionID)` (records ThreadRootOf(sessionID), evict-expired-then-drop-new at cap, latest wins per key) and `ContinuationRootFor(scopeKey, clientKey, newSessionID) string` (returns "" for an empty/invalid key, an expired entry, or an entry whose remembered session id equals newSessionID). Reuse chainKey + validChainToken so the same bounded, content-free token discipline applies.

**Installers** - `internal/daemon/ai_handlers.go`

handleAISessionStart (:3002-3031): after `threadID := strings.TrimSpace(body.ThreadID)` also clear it when `threadID == strings.TrimSpace(body.ClientSessionID)` (old-hook self-id). Keep the clear branch. Add: `if threadID == "" { switch strings.ToLower(strings.TrimSpace(body.Source)) { case "compact", "fork", "resume": threadID = s.aiChain.ContinuationRootFor(body.ScopeKey, body.ClientKey, body.ClientSessionID) } }`. After the backend call, add `s.aiChain.RememberLive(body.ScopeKey, body.ClientKey, body.ClientSessionID)` alongside the existing RecordThreadRoot.

**Backend** - `src/ai-governance/services/ai-query.service.ts`

listSessions (:851-945): add `base.andWhere('(s.thread_id IS NULL OR s.thread_id = s.id)')` so only thread ROOTS are paged (skip when a new `filters.includeThreadMembers` is set). Add `aggregateThreadEventStats(scope, rootIds)` — same shape as aggregateEventStats but joining ai_events to ai_sessions and grouping on COALESCE(s2.thread_id, s2.id), with the same NON_SUBSTANTIVE_EVENT_TYPES exclusion from F27 — and use it in place of aggregateEventStats for the list. Add a `continuationCount` per root (COUNT of member rows minus one). toListItem (:691-760) projects `continuationCount` and keeps `threadId`.

**Backend** - `src/ai-governance/dto/ai-response.dto.ts`

Add `continuationCount: number` to AiSessionListItemDto with a docblock: how many additional runtime sessions (compaction/fork/clear continuations) are folded into this logical session; 0 for an unchained session. Additive and non-optional on the response, so no consumer breaks.

**Frontend** - `app/ai-control-plane/ai-sessions/ai-sessions-content.tsx`

In SessionRowCard, when `session.continuationCount > 0` render a quiet chip next to the state badge reading `+{n} continuation{s}` with a title explaining that compaction/fork start a new runtime session under one conversation. Add `continuationCount` to types/ai-governance.ts AiSessionListItem.

### Tests (each carries a defeat step)

- Installers Go (internal/daemon, ai_session_chain_test.go): start A (source=startup), then start B (source=compact, same scope+client, different id) -> B resolves threadId = A. Then start C (source=fork) -> C resolves threadId = A (root, not B). A different clientKey resolves "". An entry older than the TTL resolves "". DEFEAT: assert that a start whose source is `startup` resolves "" even with a live memory present — a version that chains everything to the last session would pass the first three and fail this one.
- Installers Go: a start whose body.ThreadID equals body.ClientSessionID (old hook binary) is treated as unset and still resolves the continuation root. DEFEAT: assert the forwarded backend request carries the PARENT id, not the child's own id — the pre-fix behaviour forwards the child's own and would fail.
- Installers Go (cmd/devoid): sessionStartThreadID returns "" for every source including resume/compact. DEFEAT: assert the session/start body has no `threadId` key at all (not an empty string) so the daemon's `threadID == ""` branch is genuinely reached.
- Backend live-pg (ai-session.thread-chain.live-pg.spec.ts extension): three sessions chained by thread_id, each with events; listSessions returns ONE item with continuationCount=2 and an eventCount equal to the SUM across the thread and lastEventAt equal to the MAX. DEFEAT: query the two member ids directly via GET /sessions/:id/timeline and assert both still return 200 with their own events — collapse must not hide a row from a deep link.
- Frontend (ai-sessions-content.test.tsx): a row with continuationCount 2 renders the chip; 0 renders nothing. DEFEAT: assert the chip text contains the count, so a hardcoded label cannot pass.

### Risks

Thread collapse changes the ordering semantics of the list: a thread now sorts by its ROOT's started_at, so a conversation compacted hours later stays at its original position. If the owner prefers recency, order roots by the thread's MAX(last event) instead — decide explicitly, do not leave it implicit. The 12h live memory is per daemon process: a daemon restart between parent and continuation yields an unchained row (honest absence, same posture as /clear today). Mis-chaining risk is bounded by the (workspace scope AND agent-process) key that was already introduced precisely to stop two chats in one repo from merging (ai_session_chain.go:28-35) — do not weaken it to scope-only. Backend collapse must ship BEFORE the agent chaining so newly chained rows are rendered correctly on arrival; the collapse is a no-op for today's data except for existing /clear chains, which it correctly folds.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- rootCause factual error: 'fork' is not handled by sessionStartThreadID (cmd/devoid/ai_hook_runner.go:1322-1328 switches on "resume", "compact" only), so the hook already sends no threadId for a fork. The claim that the self-id 'actively BLOCKS recovery' for fork is false; only compact is affected. This misdirects the defensive-test design in the spec's own second test case.
- Blocking ambiguity left unresolved: the risks section says thread collapse changes list ordering and 'decide explicitly, do not leave it implicit' — but the spec then leaves it implicit. An implementation-ready spec for the customer's primary list cannot ship with its ORDER BY undecided.
- aggregateThreadEventStats is under-specified for tenancy: the sketch joins ai_events to ai_sessions and groups on COALESCE(s2.thread_id, s2.id) with no scope predicate named on the joined session alias. scopeSessions (ai-query.service.ts:587-598) applies org AND the site-or-null narrowing; the thread aggregate must reproduce both or a site-scoped reader can see counts from a session outside their site.
- Frontend type breakage: AiSessionListItemDto gets a non-optional `continuationCount`, and the spec says to add it to types/ai-governance.ts AiSessionListItem without specifying optionality. Non-optional there breaks every existing session fixture in the FE test suite.
- No statement about existing data: sessions already split by compact/fork before the agent ships remain unchained forever (no backfill is proposed and none is really possible). That is the honest outcome but it must be stated, because the customer will still see the two 'Pull all repos' rows from 2026-08-08 after the fix lands.

**Corrected root cause**: The mechanism is CONFIRMED with one factual error. Verified: sessionStartThreadID (cmd/devoid/ai_hook_runner.go:1321-1330) returns the INCOMING session id for source in {resume, compact} only; handleAISessionStart consults the chain ONLY when the threadId is empty AND source==clear (internal/daemon/ai_handlers.go:3004-3007), so a non-empty self-id short-circuits recovery; RecordThreadRoot runs at :3028-3030; RememberCleared is armed exclusively from end(reason=clear) at ai_handlers.go:3078-3080 (ai_session_chain.go:151-183); startSessionOnRunner skips the root stamp when `threadRootId !== session.id` fails (ai-event.service.ts:798-806); createSession stores thread_id verbatim (ai-session-correlator.service.ts:396); threadId IS projected at ai-query.service.ts:756 and IS declared but NEVER consumed in the Frontend — I searched app/, lib/, types/ and components/ and the only two hits are the type declarations at types/ai-governance.ts:124 and :264.

THE ERROR: 'fork' is NOT in sessionStartThreadID's switch (:1322-1328), so for a fork the hook already sends NO threadId today. The self-id defect is COMPACT-only (and resume, where it is harmless because the id is unchanged so upsertSession finds the same row). The fork defect is purely the absence of a continuation memory. The fix is unaffected, but the rootCause text asserts the self-id blocks fork, and an implementer writing the 'old hook sends self-id' regression test for the fork path would be testing a state that cannot occur.


**Corrected approach**: Keep the design — the daemon really is the only process that sees every SessionStart, and the (scopeKey, clientKey) key is exactly right (ai_session_chain.go:28-42 documents why scope-only was a correctness bug; do not weaken it). Corrections: (1) Restate the rootCause: compact sends a self-id; fork sends nothing; both are unrecoverable today because RememberLive does not exist and the chain lookup is clear-only. (2) DECIDE THE ORDERING NOW. The spec leaves 'sort roots by started_at vs by thread MAX(last event)' as an open owner question inside an implementation-ready spec — that is a blocking ambiguity in the one query that renders the customer's primary view. Pick MAX(last event across the thread) so a compacted conversation does not sink below newer noise, and say so. (3) Scope the thread aggregate: `aggregateThreadEventStats` must apply the org (and site) scope to the JOINED ai_sessions alias, not only to ai_events, or a thread whose member row is org-scoped correctly but site-scoped differently leaks into the aggregate. (4) Frontend `continuationCount` must be optional (`continuationCount?: number`) in types/ai-governance.ts even though the Backend DTO makes it required, or every existing FE session fixture fails to typecheck. (5) State explicitly that pre-existing compact/fork rows are NOT backfilled — they stay unchained, which is honest absence, and no migration is proposed.


**Missing changes the reviewer found**:

- **Backend** `src/ai-governance/services/ai-query.service.ts` - aggregateThreadEventStats must apply the FULL read scope to the joined ai_sessions alias (org_id = :orgId AND, when a site is resolved, (site_id = :siteId OR site_id IS NULL)) — the same predicate scopeSessions applies at :587-598 — not just the org filter on ai_events. Also fix the list ORDER BY to a decided rule (recommend MAX(last substantive event) across the thread) rather than leaving it open.
- **Frontend** `types/ai-governance.ts` - Declare `continuationCount?: number` (optional) on AiSessionListItem even though the Backend DTO makes it required, or the existing session fixtures across app/ai-control-plane/ai-sessions/__tests__ and app/ai-control-plane/__tests__ stop typechecking.

**Collateral risk**: Enforcement is untouched — nothing here runs on a decision path. The genuine risk is MIS-CHAINING, i.e. welding two different people's activity into one session, which is the exact bug the (scope AND client) key was introduced to fix (ai_session_chain.go:28-42). RememberLive as specified is peek-and-replace with a 12h TTL rather than the one-shot 2-minute clear memory, which widens the window by ~360x; the containment is that only source in {compact,fork,resume} may consume it and that a `startup` start must resolve "" — the spec's own first defeat step is exactly right and must not be dropped. The second real risk is the collapse hiding a row: loadOrgScopedSession (:1265-1274) is deliberately untouched so deep links still open member sessions, and the spec's defeat step verifies it — keep that. Backend collapse before agent chaining is the correct order and is a no-op today except for existing /clear chains, which it correctly folds.

**Effort correction**: L is credible.


---

## F29 - A git repo/branch is rendered as a conversation title because the server-side name ladder has a `repo` rung

- **Severity**: MEDIUM - Cosmetic in mechanism but corrosive to trust: the customer reads a branch name as a chat they never opened, in the same slot and style as a real conversation title. Small, contained change.
- **Side**: multi   **Effort**: S   **Root cause verdict**: CONFIRMED

### Root cause

`sessionDisplayName` implements the ladder chat -> repo -> none and returns `nameSource:'repo'` for the middle rung (Backend/src/ai-governance/services/session-display-name.util.ts:70-76). The endpoint feeds that rung deliberately: `repoBranchTitle` builds "<repo> / <branch>" from git and sends it as `title` (Installers/cmd/devoid/ai_hook_runner.go:1399-1416, stamped at ai_client_identity.go:185-187), which the Backend stores in the separate `title` column (ai-agent.controller.ts:1071). Both facts are correctly modelled and correctly stored — the defect is purely that the read model promotes a SCOPE fact into the NAME slot.

And nothing else renders it: every console surface prints `displayName` in the title position (Frontend/app/ai-control-plane/ai-sessions/ai-sessions-content.tsx:162+215, .../[id]/session-timeline-content.tsx:1628-1632, overview-content.tsx:345-347 and :388-390), while the row sub-line is limited to deviceName/repoFullName (plane-view.tsx:96, :123-127) and the detail sub-line to username/agentType/deviceName/repoFullName (session-timeline-content.tsx:1635-1647). `title` appears in NO sub-line on any surface. So simply deleting the rung would silently drop the repo/branch scope from the console — the fix has to move it, not remove it.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/session-display-name.util.ts:37 (AiSessionNameSource union) and :70-76 (the repo rung)`
- `Backend/src/ai-governance/services/session-display-name.util.ts:112-116 (sessionLabelOrNull — same ladder, used for timeline row labels)`
- `Installers/cmd/devoid/ai_hook_runner.go:1396-1416 (repoBranchTitle) and cmd/devoid/ai_client_identity.go:185-187 (sent as `title`)`
- `Backend/src/ai-governance/controllers/ai-agent.controller.ts:1065-1072 (title and sessionTitle stored in two different columns — the facts are already separate)`
- `Frontend/app/ai-control-plane/ai-sessions/ai-sessions-content.tsx:162, 205-227 (displayName is the row heading; sub-line comes from secondaryFields only)`
- `Frontend/app/ai-control-plane/plane-view.tsx:96 and :123-127 (SessionSecondaryField is limited to deviceName | repoFullName — `title` is not renderable anywhere today)`
- `Frontend/app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx:1628-1647 (H1 = displayName; sub-line has no title)`
- `Backend/src/ai-governance/dto/ai-response.dto.ts:226-236 (the detail DTO docblock already ASSERTS the intended design: chatTitle is the name, title is the sub-line — the code never did it)`

### Fix

Delete the `repo` rung from the one ladder and render the repo/branch label as what it is — scope, on the identity sub-line, beside device and repo.

1. `sessionDisplayName` becomes chat -> none; `AiSessionNameSource` becomes `'chat' | 'none'`. Narrowing the union is the mechanical proof that no producer can reintroduce the rung — the same technique the file already uses to make `username` a compile error (:23-26). `sessionLabelOrNull` follows automatically (an unnamed session labels as null, which is already its documented contract for decoration surfaces).
2. The list and detail surfaces add `title` to the identity sub-line (the list via a new allowed `SessionSecondaryField`, the detail via the existing join at session-timeline-content.tsx:1640-1646), so a session that only has a repo/branch reads: `Untitled session` with `<user> · claude-code · <device> · Ceragon / feat/push-depth-cli-ui` underneath. Nothing is lost and nothing is misrepresented.
3. No agent change: repo/branch capture stays exactly as it is, still behind the sessionTitles gate.

### Changes

**Backend** - `src/ai-governance/services/session-display-name.util.ts`

Change `AiSessionNameSource` (:37) to `'chat' | 'none'`. In sessionDisplayName (:70-76) delete the `const repo = present(input.title); if (repo) return { name: repo, nameSource: 'repo' };` branch. Keep `title` on SessionDisplayNameInput (callers spread whole session rows) but document that it is NOT a name input: a repo/branch is the session's SCOPE and belongs on the identity sub-line — rendering it in the title slot showed customers a branch as a conversation they never opened (measured 2026-08-08). Update session-display-name.util.spec.ts and ai-query.session-display-name.spec.ts accordingly.

**Backend** - `src/ai-governance/dto/ai-response.dto.ts`

Update the nameSource docblocks (:150-154, :243-244, :627-628) from `chat | repo | none` to `chat | none`, and state in the `title` docblocks (:106-111, :226-230) that the console renders it on the identity sub-line, never as the name.

**Frontend** - `types/ai-governance.ts`

Narrow AiSessionNameSource to `"chat" | "none"` and update the ladder comments at :130-139, :151-159, :167 and :267-278 to match (chat name -> Untitled session; title is the repo/branch SCOPE).

**Frontend** - `app/ai-control-plane/plane-view.tsx`

Extend `SessionSecondaryField` (:96) to `"deviceName" | "repoFullName" | "title"` and append `"title"` to the `secondaryFields` of SESSION_VIEW_FULL (:126) and of the coding-plane config (leave the web config without it — browser sessions have no repo).

**Frontend** - `app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx`

In the identity sub-line array (:1640-1646) add `session.title` after `session.deviceName` so the detail header shows the repo/branch scope that the H1 no longer carries.

### Tests (each carries a defeat step)

- Backend unit (session-display-name.util.spec.ts): input {chatTitle:null, title:'Ceragon / feat/x'} yields {name:'Untitled session', nameSource:'none'}; {chatTitle:'Pull all repos', title:'Ceragon / feat/x'} yields the chat name. DEFEAT: assert the returned name does NOT contain '/' for the first case — an implementation that keeps the rung but relabels nameSource would still fail.
- Backend type-level: the removal of 'repo' from AiSessionNameSource must break compilation anywhere a producer still emits it (tsc is the test). DEFEAT: temporarily re-add `return { name: repo, nameSource: 'repo' }` and confirm the build fails — proving the union is the guard and not a comment.
- Frontend (ai-sessions-content.test.tsx): a session with title set and chatTitle null renders 'Untitled session' as the name AND the repo/branch string inside the actor/scope sub-line. DEFEAT: assert the repo/branch string is NOT inside the element with data-testid="session-name" — the pre-fix render puts it exactly there and fails.
- Frontend (session-timeline-content.test.tsx): same assertion for the detail H1 vs sub-line. DEFEAT: as above, scoped to the h1 element.

### Risks

Any saved console view, screenshot or test asserting `data-name-source="repo"` breaks — that is the intended, visible change. Sessions that previously read as a branch name now read 'Untitled session', which will make the Untitled population look larger for a moment; F27 keeps the contentless ones out of the default view and F31 gives the browser lane a real name, so ship them together. No wire/contract change, no agent change, no shared-contracts mirror (AiSessionNameSource is Backend-local and separately declared in the Frontend).

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- Missing surface: Frontend/app/ai-control-plane/overview-content.tsx:345 and :388 render `displayName` with data-name-source and have no `title` in their sub-lines. After the change those overview rows read 'Untitled session' and the repo/branch scope is not shown anywhere on that page — an information loss the spec does not acknowledge (it lists only ai-sessions-content.tsx and session-timeline-content.tsx).
- Missing consequence on the analyst feeds: sessionLabelOrNull (session-display-name.util.ts:112-116) is called at ai-query.service.ts:1829 and :3621. Removing the repo rung makes it return null, so every activity AND detections row belonging to a repo-only session loses its session label. The spec dismisses this as 'follows automatically ... already its documented contract for decoration surfaces', but the contract covers 'no name reported', not 'a name exists and we chose to stop showing it'. There is no compensating field on the activity projection.
- Missing change set: narrowing AiSessionNameSource breaks the Frontend test suite at compile time. Fixtures type `nameSource: "repo" as const` at app/ai-control-plane/ai-sessions/__tests__/ai-sessions-content.test.tsx:60, :98, :259, :309, app/ai-control-plane/ai-sessions/[id]/__tests__/session-timeline-content.test.tsx:86 and .../session-story-band.test.tsx:68. The spec names only the two Backend spec files.
- Imprecise Frontend citation: the type is declared at types/ai-governance.ts:172 and consumed at :159, :278 AND :781 (a third site the spec does not mention). The cited comment ranges (:130-139, :151-159, :167, :267-278) do not include the declaration line.
- Effort S (<0.5d) is under-estimated once the overview surface, the activity-label decision and ~8 FE fixtures are counted.

**Corrected root cause**: Root cause CONFIRMED, every citation verified verbatim. session-display-name.util.ts:37 is `export type AiSessionNameSource = 'chat' | 'repo' | 'none'`; the repo rung is :73-74; sessionLabelOrNull is :112-116; repoBranchTitle builds '<repo> / <branch>' at cmd/devoid/ai_hook_runner.go:1399-1416 and is sanitized through sessiontitle.Sanitize; ai-agent.controller.ts:221-223 and :253-255 store title and chatTitle in two separate columns with a docblock that already states the intended separation. plane-view.tsx:96 really does limit SessionSecondaryField to "deviceName" | "repoFullName", SESSION_VIEW_FULL is at :123-127, and the row renders `name` in data-testid="session-name" with the sub-line built only from secondaryFields (ai-sessions-content.tsx:162, :166-178, :205-227). `AiSessionNameSource` is Backend-local and separately declared in the Frontend at types/ai-governance.ts:172 — I confirmed it appears in NONE of the three shared-contracts mirrors. The diagnosis (a SCOPE fact promoted into the NAME slot; deleting the rung would drop the fact, so it must be MOVED) is exactly right.


**Corrected approach**: Keep the change — narrowing the union is the right mechanical guard. But the spec moves the repo/branch fact onto only TWO of the FOUR surfaces that render displayName, and it silently deletes it from a fifth. Add: (1) overview-content.tsx:345 and :388 both render `displayName` for top-risky/recent sessions and carry no `title` anywhere in their sub-lines — those rows go from 'Ceragon / feat/x' to 'Untitled session' with the repo fact nowhere on screen. Either add the repo/branch to those sub-lines or accept the loss explicitly. (2) sessionLabelOrNull is consumed at ai-query.service.ts:1829 (timeline row labels) and :3621 (activity AND detections rows — toDetectionItems calls toActivityItems). After the change it returns null for every repo-only session, so those feeds lose their session label entirely; the activity item has no `title` field to fall back to. Decide: project the repo/branch as an explicit scope chip on the activity projection, or state the loss. (3) Update the FE test fixtures typed `nameSource: "repo" as const` — narrowing the union is a compile break in the FE suite, not just the two Backend spec files.


**Missing changes the reviewer found**:

- **Frontend** `app/ai-control-plane/overview-content.tsx` - Rows at :345 (top-risky sessions) and :388 render displayName with no title-bearing sub-line. Add the repo/branch scope to those rows' secondary text, or record an explicit decision that the overview drops the repo fact — otherwise those rows lose it entirely.
- **Backend** `src/ai-governance/services/ai-query.service.ts` - Decide and implement what the activity/detections row label does for a repo-only session: sessionLabelOrNull at :1829 and :3621 will return null after the rung is removed, blanking the session label on both feeds. Either pass the repo/branch through toActivityItem as an explicit scope field, or document the blank as intended.
- **Frontend** `app/ai-control-plane/ai-sessions/__tests__/ai-sessions-content.test.tsx (+ [id]/__tests__/session-timeline-content.test.tsx, [id]/__tests__/session-story-band.test.tsx)` - Fixtures typed `nameSource: "repo" as const` (ai-sessions-content.test.tsx:60, :98, :259, :309; session-timeline-content.test.tsx:86; session-story-band.test.tsx:68) stop compiling once the union is narrowed; retarget them to the chat/none rungs and add the repo-in-sub-line assertion there.

**Collateral risk**: No enforcement, wire, agent or contract impact — AiSessionNameSource is Backend-local and separately declared in the Frontend, and I verified it is absent from all three shared-contracts mirrors, so no mirror parity work. Nothing PROVEN-WORKING is touched. The honest-negative discipline is IMPROVED, not weakened: a session with no chat name reads 'Untitled session' instead of borrowing a branch as a conversation name. The one real regression is informational, not a false positive: the repo/branch fact disappears from the overview rows and from the activity/detections session labels unless the two missing changes above are made. Ship with F27 and F31 as the spec says, otherwise the Untitled population visibly balloons.

**Effort correction**: M (1-2d), not S — the overview surface, the activity-label decision, and the FE fixture sweep are each larger than the util edit.


---

## F32 - BROWSER_ENFORCEMENT_RECEIPT_RECORDED is excluded from the analyst feeds but not from the session timeline or the event count — and it is currently the ONLY carrier of the browser lane's enforcement proof

- **Severity**: MEDIUM - One noise row per browser send, doubling a 1-prompt session's event count and importing evidence-missing boilerplate into the timeline. Bounded, but it makes the whole timeline read as broken, and the naive fix (delete the record) would destroy the browser lane's only four-axis enforcement proof.
- **Side**: backend   **Effort**: M   **Root cause verdict**: REVISED
- **Depends on**: F27

### Root cause

The recorded finding treats this as "an internal bookkeeping row rendered as a user event" and asks whether it has a compliance role. It does, and the exclusion decision was already taken and only half-applied.

HALF-APPLIED EXCLUSION. W6/decision 6 removed standalone receipt rows from the analyst surfaces: `STANDALONE_RECEIPT_EVENT_TYPES` (Backend/src/ai-governance/services/ai-query.service.ts:278-289) is applied in `listActivity` (:3459-3469) and `listDetections` (:3674-3676), and the Frontend test at Frontend/app/ai-control-plane/events/__tests__/events-content.test.tsx:245-270 pins the removal of the Receipt kind chip. It was NOT applied to `getSessionTimeline`, which selects every row for the session with no type filter (:1783-1788), nor to `aggregateEventStats` (:661-689). The session detail — the surface the customer actually opened — was missed.

THE COMPLIANCE ROLE IS REAL, AND THE INTENDED FOLD IS NOT HAPPENING. The decision assumed the receipt facts would ride on the event they certify via `enforcementReceiptV2`; live measurement (F5) found `enforcementReceiptV2` null on 200/200 events including every block. The browser lane still writes the standalone row (Installers/internal/daemon/browser_receipt.go:270-329) and there is no fold for it: the shared fold helper is for the LOCAL compat tuple attached to the certifying event (Backend/src/ai-governance/services/ai-local-receipt-compat.util.ts:6-32), and the browser receipt arrives on its own route AFTER the send, so it cannot be attached to an already-appended, hash-covered row. So today the standalone row is the only place the browser lane's requestedEffect/expressedEffect/observedActualEffect/securityOutcome + verified policy identity exist. Deleting or hiding it without a replacement carrier would be a genuine loss of enforcement evidence.

The boilerplate the owner saw ("required evidence missing", "no prompt to show") is correct behaviour for a row that is not a prompt — the defect is that the row is on the user timeline at all.

### Evidence (read at origin/main)

- `Backend/src/ai-governance/services/ai-query.service.ts:278-289 (STANDALONE_RECEIPT_EVENT_TYPES + the stated contract: excluded from analyst surfaces, retained, reachable by explicit query)`
- `Backend/src/ai-governance/services/ai-query.service.ts:3459-3469 and :3674-3676 (applied on activity + detections)`
- `Backend/src/ai-governance/services/ai-query.service.ts:1783-1788 (getSessionTimeline — no exclusion) and :661-689 (aggregateEventStats — no exclusion)`
- `Frontend/app/ai-control-plane/events/__tests__/events-content.test.tsx:245-270 (the locked decision: no standalone Receipt rows on analyst surfaces; facts ride the certified event)`
- `Installers/internal/daemon/browser_receipt.go:270-329 (the standalone event, carrying the four axes + verified policy identity + contentRef sha256 + optional sessionId)`
- `Backend/src/ai-governance/services/endpoint-evidence-ingest.service.ts:87, 1465-1470 (projectBrowserEffectReceipt — the row is projected as its own event, never folded)`
- `Backend/src/ai-governance/services/ai-local-receipt-compat.util.ts:6-32 (the fold that exists is for a tuple attached to the certifying event at write time — structurally unavailable to a post-send browser receipt)`
- `Installers/browser-extension/src/receipts.js:94-141 (contentRef.sha256 = 'sha256:<hex>' of the composer text) vs Installers/internal/daemon/ai_handlers.go:1344 (promptHash = sha256HexString(body.Text)) — a candidate exact join key between the receipt and the prompt event it certifies`

### Fix

Two steps, in this order. Step 1 alone removes the noise and can ship immediately; step 2 puts the proof where the analyst can see it, so the record is not merely hidden.

STEP 1 (Backend only, ships now): apply the EXISTING exclusion to the two surfaces that were missed — the session timeline and the event-count aggregate. This is the same shared constant introduced for F27 (NON_SUBSTANTIVE_EVENT_TYPES = standalone receipts + session lifecycle). The row stays in the chain, stays on the Events feed via an explicit eventTypes query, and stops occupying a user-timeline slot and inflating EVENTS.

STEP 2 (Backend read-time fold, no chain mutation): in `getSessionTimeline`, load the session's receipt rows separately and attach their four axes + verified policy identity to the timeline event they certify, as a read-time projection (the same pattern the file already uses for `promptEvidenceFor` and `withPromptTextAccess` at :1810, :1821-1837). Join key, in order of preference: (a) the receipt's `contentSha256` minus its `sha256:` prefix equals the prompt event's `metadata.promptHash` — VERIFY THIS FIRST against a real pair, since both are a SHA-256 of the composer text but the normalisation must be confirmed; (b) if (a) does not hold, plumb the extension's `decisionId` onto the prompt-check body so the PROMPT_* row carries it and join on (session_id, decisionId). Where no match is found, attach nothing and say nothing — an uncorrelated receipt stays reachable only through the explicit query, which is the honest outcome, not a fabricated certification.

Do NOT stop emitting the receipt and do NOT change the write path: it is the browser lane's only enforcement proof until enforcementReceiptV2 actually populates (F5).

### Changes

**Backend** - `src/ai-governance/services/ai-query.service.ts`

getSessionTimeline (:1783-1788): add `.andWhere('e.event_type NOT IN (:...nonSubstantive)', { nonSubstantive: [...NON_SUBSTANTIVE_EVENT_TYPES] })` to the events query, with a docblock pointing at the same decision-6 rationale as :278-288 — the session detail was the surface this exclusion was for and it was missed. `total` continues to be `events.length`, which now matches the rendered rows and the list's eventCount. (aggregateEventStats is already changed under F27.)

**Backend** - `src/ai-governance/services/ai-query.service.ts`

Step 2: add `private async browserReceiptsForSession(scope, sessionId)` loading the session's BROWSER_ENFORCEMENT_RECEIPT_RECORDED rows (this is the ONE place they are still read on a customer surface), and a pure `attachCertifiedReceipt(timelineEvent, receiptsByKey)` that stamps requestedEffect / expressedEffect / observedActualEffect / actualEffectObserver / securityOutcome / policyRevision+policyBundleDigest onto the certified event's projection under an explicit `certifiedBy: 'browser-receipt'` marker. Call it inside the existing events.map at :1821-1838. Unmatched receipts are dropped from the projection, never rendered as their own row.

**Frontend** - `app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx`

Render the attached receipt axes inside the existing ENFORCEMENT RECEIPT block of the certified event (the certified-outcome/obligation-axes components in this folder already model the four axes) when `certifiedBy === 'browser-receipt'`. When absent, change nothing — the existing honest copy stands.

**Installers** - `browser-extension/src/daemon-body.js`

Step 2 fallback ONLY (do not implement unless the contentSha256/promptHash join is disproven): forward `decisionId` on the prompt-check body when the caller supplies one, so the PROMPT_* row and the later receipt share an exact correlation key. Additive + omitted when absent.

### Rejected alternatives

- Stop emitting the browser receipt (the owner's first instinct, 'dont think it is needed to be recorded'): it is currently the ONLY carrier of the browser lane's four-axis enforcement proof and its verified policy identity, because enforcementReceiptV2 is null on every event in production (F5). Deleting it would trade visible noise for an invisible evidence gap.
- Fold the receipt into the certified event at WRITE time: the receipt arrives after the send, and the certified event is already appended into an append-only hash chain — mutating it is not available.

### Tests (each carries a defeat step)

- Backend live-pg (ai-prompt-browser-single-row.live-pg.spec.ts extension): a browser session with one PROMPT_SUBMITTED and one BROWSER_ENFORCEMENT_RECEIPT_RECORDED reports eventCount 1, and the timeline returns exactly 1 event with total 1. DEFEAT: assert the receipt row is STILL returned by an explicit `GET /activity?eventTypes=BROWSER_ENFORCEMENT_RECEIPT_RECORDED` query and still present in ai_events — proving exclusion, not deletion, and that the test would fail if someone implemented this by not writing the row.
- Backend unit: the shared NON_SUBSTANTIVE_EVENT_TYPES constant is the one used by the timeline, the count and the session-activity predicate. DEFEAT: a test that asserts adding a type to the constant changes ALL THREE query builders' parameters — a per-call-site copy of the array fails it.
- Backend unit (step 2): a receipt whose contentSha256 matches the prompt event's promptHash attaches its four axes to that event; a receipt whose digest matches nothing attaches to nothing and produces no row. DEFEAT: flip one character of the digest and assert the axes are ABSENT — this is also the verification that the join key is real rather than coincidentally passing on a single-event fixture.
- Frontend (session-timeline-content.test.tsx): with certifiedBy set, the receipt axes render inside the certified event's receipt block; without it, the existing 'not independently confirmed' copy is unchanged. DEFEAT: assert no standalone row titled 'Browser enforcement receipt recorded' appears in either case.

### Risks

Step 1 hides a row an existing operator may have learned to look for; mitigated because the same row is already absent from the Events feed and Detections, so this makes the surfaces CONSISTENT rather than introducing a new blind spot. Step 2's join key is unverified — if contentSha256 and promptHash are computed over differently-normalised text the fold silently never fires; the defeat step above is exactly what catches that, and the decisionId fallback exists for it. Do not let step 2 mutate or re-hash any stored event: the projection is read-time only. Backend-only for step 1; no agent change and no contract change, so it is safe against every deployed agent.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- The step-2 justification is factually wrong and, if believed, produces a worse fix. 'The standalone row is the ONLY carrier of the browser lane's four-axis enforcement proof' is disproved by internal/daemon/ai_handlers.go:1428-1435 + internal/daemon/ai_event_certification.go:103-120: the full tuple (including ObservedActualEffect, ActualEffectObserver, SecurityOutcome) is already stamped onto the synchronous PROMPT_* report and folded by the Backend at endpoint-evidence-ingest.service.ts:1477-1482. FINDINGS F30 corroborates a receipt rendering on the prompt lane. The same claim also drives the 'rejected' entry against not emitting the receipt, so that rejection rests on a false premise too (the receipt is still worth keeping — for its independent observation — but not for the stated reason).
- The decisionId fallback is under-specified to the point of being unimplementable as listed. The spec's only change for it is daemon-body.js 'forward decisionId when the caller supplies one'. No caller supplies one: composerReceiptBase (content/index.js:510-519) omits it and causalID mints a fresh UUID at receipt-build time (receipts.js:70-73, :266-268). A real fallback needs a decision id minted at the send-decision site and threaded into both the daemon body and the receipt draft.
- The contentSha256 join cannot cover the upload lane at all: emitReceipt is called with no text argument for uploads (content/index.js:1716, :1738), so contentRef is `unavailable` (receipts.js:104-107 / sanitizeContentRef:132-144). The spec presents (a) as a general join with one verification caveat; it is structurally partial.
- Sequencing risk the spec invites: it says 'Step 1 alone removes the noise and can ship immediately'. That is true only because of the corrected finding above — if the spec's own (false) premise held, shipping step 1 alone would delete the browser lane's only enforcement proof from every customer surface. Either fix the premise or forbid shipping step 1 alone.
- Effort M covers step 1 (S) plus a hand-wave at step 2. With the join verification, a new read-time projection with an explicit certifiedBy marker, the FE render and the possible decisionId plumbing, step 1+2 is L.

**Corrected root cause**: STEP 1's diagnosis is CONFIRMED. STANDALONE_RECEIPT_EVENT_TYPES is at ai-query.service.ts:289 with the retained-not-deleted contract at :278-288; it is applied in listActivity at :3459-3469 (and only when no kinds/eventTypes were named) and in listDetections at :3674-3676; getSessionTimeline selects every row for the session with org + session_id + ORDER BY seq_num and NO type filter (:1783-1788) and returns `total: events.length` (:1841); aggregateEventStats (:661-689) counts everything. The exclusion really was applied to two of four surfaces and missed the two the customer opens.

STEP 2's PREMISE IS FALSE AND IS THE MOST DANGEROUS SENTENCE IN THIS SPEC. The claim 'today the standalone row is the ONLY place the browser lane's requestedEffect/expressedEffect/observedActualEffect/securityOutcome + verified policy identity exist' does not survive the source. handleAIPromptCheck stamps the COMPLETE four-axis tuple onto the SYNCHRONOUS prompt report: `promptHookCertification(body.AgentType, promptWireDecision(localDecision), d.Reasons).applyToPromptCheck(req)` at internal/daemon/ai_handlers.go:1428-1435, and hookEventCertification.apply sets ActionID, DecisionID, ReceiptID, Checkpoint, RequestedEffect, AdapterExpressedEffect, TranslationDisposition, ObservedActualEffect, ActualEffectObserver, GovernanceDisposition and SecurityOutcome (internal/daemon/ai_event_certification.go:103-120). The Backend folds an event-attached tuple through hasLocalCompatReceiptTuple / projectLocalEffectReceipt (endpoint-evidence-ingest.service.ts:1477-1482), and FINDINGS F30 independently observed 'AN ENFORCEMENT RECEIPT rendered ... Effect expressed (runtime unverified)' on a prompt row. So step 1 does NOT delete the browser lane's four-axis proof.

WHAT IS ACTUALLY UNIQUE to the standalone browser receipt is narrower and still worth having: the BROWSER_CHECKPOINT-OBSERVED actual effect — the extension only claims prevention when the event was really cancelled (browser-extension/src/content/index.js:486-504) and only claims rewrite when the rewrite was observed (:874-882) — plus the extension's own policyRead/policyVerification identity (composerReceiptBase, :510-519). That is an INDEPENDENT observation the daemon structurally cannot make, and it is the correct justification for step 2.


**Corrected approach**: Split and re-justify. STEP 1 ships as written and is genuinely sound and low-risk: add the NON_SUBSTANTIVE_EVENT_TYPES exclusion to getSessionTimeline's events query (:1783-1788) so the timeline, its `total` and the list's eventCount all agree, and keep the retained/reachable-by-explicit-query contract. STEP 2 must be re-scoped: it is NOT 'restore the axes that would otherwise be lost' (they are already on the row) — it is 'attach the browser's INDEPENDENTLY OBSERVED actual effect to the event the daemon could only EXPRESS'. Written the spec's way an implementer will overwrite or duplicate axes already present on the prompt row, and could turn an honest 'Effect expressed (runtime unverified)' into a stronger claim — which is the banned failure mode. Pin it: the projection may ONLY add observedActualEffect / actualEffectObserver='BROWSER_CHECKPOINT' / securityOutcome when the receipt's observer is BROWSER_CHECKPOINT, and must never downgrade or restate what the row already carries. Also fix the join analysis: (a) the contentSha256 route is workable for composer sends — content/index.js:892 and :503 pass the ORIGINAL `text` to emitReceipt, and the daemon's promptHash is sha256 of the same original body.Text (ai_handlers.go:1344) — but the upload receipts pass no text at all (:1716, :1738) and can never join; (b) the decisionId fallback is NOT a plumb: composerReceiptBase supplies no decisionId (:510-519) so causalID mints a fresh secureUUID inside buildBrowserReceipt (receipts.js:70-73, :266-268), and it therefore has no counterpart anywhere. Making it a key requires minting ONE decision id at the send-decision site and passing it to BOTH forwardToDaemon and the receipt draft — a content-script change the spec does not list.


**Missing changes the reviewer found**:

- **Installers** `browser-extension/src/content/index.js` - Step-2 fallback only: mint a single decision id at the send-decision site (inside evaluateAndApply, alongside the existing forwardToDaemon/queueAuthoritativeSend calls) and pass it BOTH into the daemon prompt-check payload and into composerReceiptBase (:510-519) as `decisionId`, so causalID (receipts.js:70-73) keeps it instead of minting a fresh UUID. Without this the daemon-body.js change has nothing to forward.
- **Backend** `src/ai-governance/services/ai-query.service.ts` - attachCertifiedReceipt must be restricted to the axes the browser INDEPENDENTLY observed (observedActualEffect / actualEffectObserver='BROWSER_CHECKPOINT' / securityOutcome, plus the browser's policy identity) and must never overwrite or restate the requested/expressed axes the row already carries from promptHookCertification — otherwise the projection can strengthen an 'Effect expressed (runtime unverified)' row into a confirmed outcome.

**Collateral risk**: Step 1 is inert with respect to every PROVEN-WORKING capability. In particular it does NOT regress browser masking-before-send: the masking evidence rides the PROMPT_SUBMITTED/PROMPT_REDACTED row (dataDisposition REDACTED_THEN_SENT, redactedCount, the applyBrowserComposerEvidence block at ai_handlers.go:1425) and the console's '1 masked, then sent' comes from there, not from the standalone receipt. Backend-only, no agent change, no contract change, safe against every deployed agent. Step 2 carries the one real honesty hazard in this cluster: a read-time projection that stamps axes onto an event it did not certify would convert 'Outcome not independently confirmed' into a positive claim on a row whose join was coincidental — banned by invariant 3. The mitigations are the ones the spec already has (read-time only, never re-hash, attach nothing when unmatched, digit-flip defeat step); they must be kept and the 'only add the browser-observed axes' rule added. Watch the ordering with F27: the timeline exclusion and the eventCount exclusion must share ONE constant or the detail header and the timeline will disagree again.

**Effort correction**: Step 1 = S. Step 1 + step 2 = L, not M.
