# P47 stage 1 — CONSOLE lane (triage + adjudication + certificate panel)

Rig: console http://localhost:3201 (worktree /c/cwt/p47-final-frontend-20260830, branch p47/w6-frontend),
backend http://127.0.0.1:2353 (/c/cwt/p47-w4b-be, p47/integration-backend), postgres localhost:5643.
Driven with Playwright as demo@cera.io. Written 2026-09-06.

## Intended triage rules, read from the code BEFORE testing (10 lines)

1. Triage is a SIDECAR: `ai_event_triage` (current state, 1:1 with `ai_events.id`, created lazily) plus the
   append-only ledger `ai_event_triage_transitions`. Nothing ever writes to `ai_events`; nothing deletes.
2. ONE mutation route, `POST /api/v1/ai/events/:id/triage`, `@AuthMember` + `@ActAsReaderBlocked`. Cross-field
   rules are evaluated on the MERGED post-state inside a pessimistic row lock, never on the request alone.
3. An ABSENT triage row is the default state — status `new`, classification `not_set`,
   adjudicationStatus `NOT_REQUIRED` — so "never touched" and "touched but undisputed" read identically.
4. RESOLVING requires BOTH a `resolutionReason` and a `note`; the reason is backstopped by a DB CHECK, the
   note can only be enforced in the service because it lives in the ledger.
5. A body that changes nothing AND carries no note is refused (`no triage change requested`). A note ON ITS
   OWN is therefore legal and must not move status — that is the T3 "note without resolving" path.
6. `assigneeId` is a bare UUID; the console names people by matching it against `GET /api/users`
   (`assignee-roster.ts`). An id not in the roster renders as `user id <8 chars>…`, never as a name.
7. `hidden` is a VIEW FILTER that retains the record. `secondsToTriaged`/`secondsToResolved` are set ONCE so
   MTTT cannot be gamed by reopening.
8. BULK (`POST /api/v1/ai/events/bulk-triage`) takes GROUP KEYS, not ids; refuses outright above 500 rather
   than acting in part; answers `selected/applied/unchanged/failed` + a per-failure reason.
   `applied+unchanged+failed == selected`. `unchanged` is a third outcome, not a success or a failure.
9. ADJUDICATION (Wave 6 T9) is per-event, derived: labelers = distinct `actor_id` over ledger transitions that
   CHANGED `to_classification`. Second distinct labeler agreeing -> `AGREED`; disagreeing -> `THIRD_REVIEW`
   and THE ROW KEEPS THE FIRST VERDICT with the rival in `disputed_classification`. An adjudicator must be
   neither labeler (400 otherwise); `reviewed_unknown` from the adjudicator -> `UNRESOLVED`, not `AGREED`.
10. "Null is not zero": `readBulkOutcome` returns null rather than defaulting a missing count, and the bar
   prints BULK_OUTCOME_UNREPORTED instead of "0 updated". Audit is SECONDARY (14-day retention) to the ledger.

## Results

| # | probe | expected | observed | verdict | evidence |
|---|---|---|---|---|---|
| 1 | T3a note WITHOUT resolving, event abaaac27-f808-4452-a0b1-313cd3a79fec | note stored, status stays `new` | POST /api/ai-control-plane/events/abaaac27-.../triage 200; ai_event_triage.status=`new`, classification=`not_set`; ledger seq 1 `new -> new` carrying the note | **VERIFIED** | t3-note-wire.json, 04-note-added.png |
| 2 | T3a note survives a FULL page reload | note re-renders from the server | after a fresh goto() the drawer shows: `#1 new - "P47-STAGE1 console lane: note added without resolving. Synthetic test note." - just now` | **VERIFIED** | t3-note-wire.json |
| 3 | T3a note shows its AUTHOR | author on the ledger line | wire carries actorType=`user`, actorId=`cc6c4681-...5439`; the rendered line is `#1 new - "..." - just now` with NO author at all. normalizeTriageActivity (detections-content.tsx:1396) drops both fields | **GAP** | t3-note-wire.json, 04-note-added.png |
| 4 | T3a note shows its TIME | a time the reader can act on | relative age only (`just now`); no absolute timestamp and no title attribute on the element | **GAP (minor)** | t3-note-wire.json |
| 5 | T3b ASSIGN, event 5c98e554-5132-4be7-9353-97257d9c380f | assignee stored and named | picker names `Robin Testsecond (p47-reviewer2@example.invalid)`; DB assignee_id=b65f9f1f-1e3c-4236-b67e-7d381fbf3822; ledger seq 1 carries it | **VERIFIED** | 05-assign-persisted.png |
| 6 | T3b assignment survives a full reload | picker still names the person | after reload the picker reads `Robin Testsecond (...)` | **VERIFIED** | 05-assign-persisted.png |
| 7 | T3b the chip beside the picker | one consistent claim | picker names the person; the chip beside it reads `assigned - user id b65f9f1f...` with the tooltip "This console is not served a display name for triage assignees", which the picker has disproved | **GAP (minor)** | 05-assign-persisted.png |
| 8 | T5 BULK triage from the console UI | the selected group moves | POST /api/ai-control-plane/events/triage/bulk returns **404**, {"error":"Cannot POST /api/v1/ai/events/triage/bulk"}. FE lib/api/endpoints.ts:347 says /api/v1/ai/events/triage/bulk; the backend controller declares @Post('bulk-triage'), i.e. /api/v1/ai/events/bulk-triage. EVERY bulk action in the console 404s | **GAP (breaks the feature)** | 06-bulk-404.png, t5-bulk-server.txt |
| 9 | T5 the console's own failure text | an honest failure, not a green one | the action bar keeps printing "Cannot POST /api/v1/ai/events/triage/bulk". No "0 updated", no fake success | **VERIFIED** | 06-bulk-404.png |
| 10 | T5 mixed selection on the REAL backend route | skipped rows reported, not dropped | {"selected":10,"applied":2,"unchanged":8,"failed":0} - the 8 already-`investigating` members are reported as `unchanged`; applied+unchanged+failed == selected | **VERIFIED (server only)** | t5-bulk-server.txt |
| 11 | T5 a member the action CANNOT be applied to | named and counted | resolve without a note gives {"selected":2,"applied":0,"unchanged":0,"failed":2,"failures":[{eventId, reason:"a resolution note is required to resolve an event"} x2]} | **VERIFIED (server only)** | t5-bulk-server.txt |
| 12 | T5 negative control: repeat the same action | every member `unchanged` | {"selected":8,"applied":0,"unchanged":8,"failed":0} | **VERIFIED (server only)** | t5-bulk-server.txt |
| 13 | T9 two reviewers DISAGREE (real second admin user, created through the UI) | first verdict kept, dispute recorded | demo -> true_positive, then reviewer2 -> false_positive: row KEEPS classification=`true_positive`, adjudication_status=`THIRD_REVIEW`, second_labeler_id=b65f9f1f, second_labeler_role=SECURITY_REVIEWER, disputed_classification=`false_positive`; ledger seq 2 records what reviewer2 actually said | **VERIFIED (backend)** | t9-adjudication-full.txt |
| 14 | T9 the CONSOLE view of that dispute | the disagreement is visible | wire carries adjudicationStatus=`THIRD_REVIEW` and disputedClassification=`false_positive`; the panel highlights **TP** (the FIRST verdict), shows no banner, no second labeler, no "awaiting a third review", and gave reviewer2 no error and no message when her FP did not take. grep -rn over app/ components/ lib/ for THIRD_REVIEW, adjudicationStatus, secondLabeler, disputedClassification returns ZERO hits in the whole Frontend | **GAP (the wave's user-visible half is absent)** | 08-third-review-invisible.png |
| 15 | T9 negative control: two reviewers AGREE | AGREED, verdict unchanged, no dispute | demo -> true_positive, reviewer2 -> true_positive: adjudicationStatus=`AGREED`, disputedClassification=null, classification unchanged | **VERIFIED (backend)** | t9-adjudication-full.txt |
| 16 | T9 self-adjudication refused | 400 for BOTH labelers | reviewer2 gets 400 "adjudicatorId b65f9f1f... is already a labeler on this event"; demo gets 400 "adjudicatorId cc6c4681... is already a labeler" | **VERIFIED (backend)** | t9-adjudication-full.txt |
| 17 | T9 a third, distinct actor settles it | AGREED, or UNRESOLVED on reviewed_unknown | adjudicator3 -> false_positive gives `AGREED`, adjudicatorId=4d387164, dispute cleared; on a second event adjudicator3 -> reviewed_unknown gives `UNRESOLVED`, not AGREED | **VERIFIED (backend)** | t9-adjudication-server.txt, t9-adjudication-full.txt |
| 18 | T9e every action reaches the AUDIT page | listed and readable | all 20 writes present as AI_EVENT_TRIAGE_CHANGED with their correlation ids; expanding a row shows the full payload incl. actorId, fromStatus, toStatus, classification, note | **VERIFIED** | 09-audit-log.png, 10-audit-triage-expanded.png |
| 19 | T9e every action reaches audit_events in psql | hash-chained rows | 20 rows, seq_num 567 to 687, correlation_id = ai-event-triage-EVENTID; rows quoted in audit-rows.txt | **VERIFIED** | audit-rows.txt |
| 20 | audit summary line is readable | says what changed | the Details column falls through summarizePayload's allowlist (audit-content.tsx:155-201) - no triage payload key is in it - so it prints the FIELD NAMES "note, hidden, actorId, eventId". Login rows get "userId: demo@cera.io - mfaUsed: false - ...". Values are one click away, not on the line | **GAP (minor)** | 09-audit-log.png |
| 21 | the audit record of a DISPUTING write | what the actor said | the audit_events row for reviewer2's false_positive write carries "classification": "true_positive" - the row's STORED value, not hers. Nothing in the payload says a dispute opened, and no adjudication field is in the payload at all. The ledger gets this right; the SIEM fan-out erases it | **GAP** | audit-rows.txt |
| 22 | null is not zero, on detections | unknowns named, not zeroed | "+11 unknown" beside "got through"; "11 detections were recorded without an enforcement result. The agent flagged them and never reported what it did about them."; "not graded" with "It is not a weak grade."; "Unknown client"; "app and provider not recorded"; null-severity rows excluded from the severity bar with the reason stated | **VERIFIED** | 12-detections-after-triage.png |
| 23 | null is not zero, on the triage tabs | unmeasured group counts not shown as 0 | "All 155 in - groups" / "Investigating 10 in - groups", tooltip: "This server states how many detections are in this state, but not how many groups they fall into. Only the open tab's group count is returned, so the others can't be stated." | **VERIFIED** | 12-detections-after-triage.png |
| 24 | zeros that ARE real | 0 only where measured | "Low: 0" (DB: zero events with severity=low), "Show hidden rows 0" (DB: zero hidden=true), "Resolved 0". All three are measured zeros | **VERIFIED** | 12-detections-after-triage.png |
| 25 | any 0 standing in for a null | none found | swept the detections screen, the tabs, the severity strip and the drawer: none. secondsToTriaged/secondsToResolved are carried in component state but rendered NOWHERE, so they cannot be zeroed | **VERIFIED** | - |
| 26 | T10 generate a manifest from THIS stack | a manifest keyed to this rig | devoid-certificate.exe -in cert-input-thisstack.json prints: `m47a-toolauthority-p47stage1-7.10.99  status=FAIL  expires=2026-12-04T21:22:19Z`. Digests are real sha256 of $ISO/devoid.exe, the live daemon policy and the drive corpus; counts are this stack's own (eligible 211 / executed 179 / unknown 32, read from ai_events) | **VERIFIED** | cert-input-thisstack.json, cert-manifest-thisstack.json, cert-generate.log |
| 27 | T10 generator's own answer with every bound null | UNKNOWN, not a green | the same input with my authored downgrade trigger removed gives `status=UNKNOWN`. The FAIL above came only from my own declared trigger, not from the generator over-claiming | **VERIFIED** | cert-generate-notrigger.log |
| 28 | T10 load the panel the way a CUSTOMER would | a page, an upload or an endpoint | there is NONE. components/admin/certificate-panel.tsx is imported by exactly one file - its own test. No route, no upload control, no app/api/** certificate endpoint, and no import of @/types/certificate outside the panel and that test | **GAP (unreachable feature)** | panel-thisstack.html, panels.html |
| 29 | T10a a manifest whose numbers are null | NOT MEASURED, never 0 | every null bound renders `NOT MEASURED` with data-not-measured="true"; the measured 211 renders as `211` | **VERIFIED** | 11-certificate-panels.png panels 1 and 2 |
| 30 | T10b an EXPIRED manifest | UNKNOWN | file says PASS, expiry 2026-08-01; the badge reads `UNKNOWN` plus "This certificate expired on 2026-08-01T00:00:00Z. It read PASS when it was issued; an expired certificate says nothing about the system today." | **VERIFIED** | 11-certificate-panels.png panel 3 |
| 31 | T10c a TAMPERED manifest (one byte changed after generation) | rejected with a visible reason | renders IDENTICALLY to the untampered file - same FAIL, same body, no warning. There is no signature: schema v2 has no signature/HMAC field (grep -ic signature schema.json returns 0) and neither internal/certificate nor the console holds any verification code. Nothing exists to detect the change, and the field that changed (the artifact digest) is not rendered by the panel | **GAP** | 11-certificate-panels.png panel 4, cert-tamper.log |
| 32 | panel status vs its own null rule | a PASS over null bounds must not read green | a manifest claiming PASS with all five bounds null renders a green **PASS** and "Why this is not green -> Nothing is holding this back", above five NOT MEASURED rows. effectiveStatus downgrades on expiry ONLY. The generator would never emit this (probe 27), so it is reachable only via a file the generator did not make - exactly the untrusted case a panel with no signature check must survive | **GAP** | 11-certificate-panels.png panel 2 |
| 33 | browser console + network on the console pages | clean | detections page: 0 console errors, 0 warnings, no 4xx/5xx. The only 4xx all session were the two bulk-triage 404s (probe 8) | **VERIFIED** | - |

## Gaps

1. **Bulk triage is broken end to end - a path mismatch between the two integration branches.** Frontend
   `p47/w6-frontend` sends `POST /api/v1/ai/events/triage/bulk` (lib/api/endpoints.ts:347, proxy
   app/api/ai-control-plane/events/triage/bulk/route.ts); Backend `p47/integration-backend` serves
   `POST /api/v1/ai/events/bulk-triage` (ai-event-triage.controller.ts:77). Every bulk action in the
   console 404s. The backend route itself is correct and complete - proven directly in probes 10-12.
   One of the two names has to move.

2. **Wave 6 T9's user-visible half does not exist.** The backend records disputes exactly as designed and
   puts adjudicationStatus / secondLabelerId / disputedClassification on the wire. The Frontend contains
   no reference to any of them. A second reviewer who disagrees gets no error, no banner and no sign that
   her verdict was recorded as a dispute - the panel keeps showing the first reviewer's call, highlighted.
   That is the "console says X, endpoint says Y" shape this programme exists to remove, and it is the
   sharpest finding in this lane.

3. **The certificate panel is unreachable.** CertificatePanel is mounted on no page and no route; nothing
   uploads, pastes or fetches a manifest. The component itself is good (probes 29 and 30) but no customer
   can see it.

4. **A tampered manifest is undetectable, by construction.** Schema v2 carries no signature and no code
   verifies one, so "reject a tampered manifest with a visible reason" is not implementable as written
   today. It needs a signature in the schema and a check in the panel, or the requirement needs restating.

5. **The panel will render a green PASS over five NOT MEASURED bounds.** effectiveStatus enforces freshness
   but not the null rule the same file's own docblock states. One clause - downgrade to UNKNOWN when a
   bound the status depends on is null - closes it.

6. **The triage activity log shows no author.** The wire carries actorType/actorId and the console already
   has a roster that names ids (the assignee picker uses it); normalizeTriageActivity drops both fields.
   In a two-reviewer workflow "who said this" is the point.

7. **The audit fan-out erases the disagreement the ledger preserves.** AiEventTriageService.update passes
   result.saved.classification to logAiEventTriageChanged, so a disputing write is audited as the value it
   did NOT set. A SIEM reading audit_events sees reviewer2 setting true_positive. The ledger's own comment
   says writing the row's value there "would erase the disagreement from history" - the audit lane does
   exactly that. The adjudication fields are absent from that payload too.

8. **Minor:** the assignee chip's tooltip claims the console has no display name for assignees while the
   picker beside it shows one; the audit page's Details column prints field names for triage rows; the
   activity log shows relative age only, with no absolute timestamp on hover.

## Setup notes (how to re-run)

Rig used as found: console http://localhost:3201, backend http://127.0.0.1:2353, postgres localhost:5643
(docker exec codesec-e2e-p47-postgres psql -U codefense -d codefense_db). Nothing shared was restarted.

Synthetic data created - all local, all disposable:

- Users, created through the console's own Admin > Users > Create user, then activated through
  /accept-invite?token=THE_USERS_EMAIL_VERIFICATION_TOKEN:
  - p47-reviewer2@example.invalid / Robin Testsecond / b65f9f1f-1e3c-4236-b67e-7d381fbf3822 (second reviewer)
  - p47-adjudicator3@example.invalid / Casey Adjudicator / 4d387164-5cda-48a3-a138-ef4956b1ead1 (adjudicator)
  Throwaway passwords are in t9-probe.sh. Both are organization_admin in org cdcde8a7-7aea-4128-be1a-6ff3dec52348.
- 15 ai_event_triage rows plus their ai_event_triage_transitions, and 20 audit_events rows, on
  pre-existing events. Nothing was deleted; ai_events is untouched, because triage is a sidecar.

Scripts here, all re-runnable:

- login.sh EMAIL PASSWORD - mints a backend access token against 127.0.0.1:2353.
- t9-probe.sh DISPUTE_EVENT_ID AGREE_EVENT_ID - the whole T9 matrix including the negative control.
- serve.cjs - the throwaway static server used to screenshot panels.html; started on 127.0.0.1:8791 and
  stopped again at the end of the run.
- cert-input-thisstack.json feeds devoid-certificate.exe -in ... -out cert-manifest-thisstack.json.
  Build the generator with:
  cd /c/cwt/p47-fix-exfil && go build -o ISO_DIR/devoid-certificate.exe ./cmd/devoid-certificate
  Digests in the input must carry the "sha256:" prefix or the schema check refuses them.
- cert-manifest-tampered.json is cert-manifest-thisstack.json with exactly one byte changed (the last hex
  character of the devoid.exe artifact digest); cert-tamper.log records the diff count.
- The panel HTML in panel-*.html was produced by rendering the REAL CertificatePanel through the Frontend
  worktree's own jest/jsdom, via a temporary test file that has since been deleted (the worktree is clean;
  git status --porcelain is empty). It is the product component, not a re-implementation. panels.html is
  the four states on one page.
