#!/usr/bin/env bash
# P47 stage-1 fix lane — prove the CORRECTED bulk-triage path is the one the
# backend serves, without going through the console.
#
# The console at :3201 is a prebuilt standalone server from a different
# worktree, so it still carries the OLD path. This script talks to the backend
# directly, exactly as the corrected proxy will once the console is rebuilt.
#
# Run from anywhere:  bash bulk-triage-path-probe.sh
# Writes:  bulk-triage-live.txt (transcript), and leaves the rig as found.
set -u

BE=http://127.0.0.1:2353
ORIGIN=http://localhost:3201
OUT="$(cd "$(dirname "$0")" && pwd)/bulk-triage-live.txt"
PSQL="docker exec codesec-e2e-p47-postgres psql -U codefense -d codefense_db -tAc"

OLD_PATH=/api/v1/ai/events/triage/bulk   # what the Frontend sent until 2026-09-06
NEW_PATH=/api/v1/ai/events/bulk-triage   # what the controller declares

say() { echo "$@" | tee -a "$OUT"; }

: > "$OUT"
say "== P47 bulk-triage path proof — $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
say ""

TOK=$(curl -s -X POST "$BE/api/v1/auth/login" \
  -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"email":"demo@cera.io","password":"Test1234!"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).accessToken))")
[ -n "$TOK" ] || { say "LOGIN FAILED"; exit 1; }
say "1. logged in as demo@cera.io directly against the backend (no console)."
say ""

# --- pick a small repeat group through the console's own read model ----------
GROUP_JSON=$(curl -s "$BE/api/v1/ai/detections?limit=60" -H "Authorization: Bearer $TOK" \
  | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const rows=JSON.parse(d).items||[];
  const g=rows.find(r=>r.groupKey==='k:private-key|private-key|9cc7bb95-78ec-4bcd-9c08-15de21a1c625');
  if(!g){process.stdout.write('{}');return;}
  process.stdout.write(JSON.stringify({key:g.groupKey,members:g.memberEventIds}));
});")
KEY=$(echo "$GROUP_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).key||''))")
MEMBERS=$(echo "$GROUP_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write((JSON.parse(d).members||[]).join(' ')))")
[ -n "$KEY" ] || { say "group not found"; exit 1; }
say "2. target group key (from GET /api/v1/ai/detections, the console's own read model):"
say "   $KEY"
say "   members: $MEMBERS"
say ""

say "3. triage rows for those members BEFORE anything (psql):"
for m in $MEMBERS; do
  say "   $m -> $($PSQL "select coalesce((select status from ai_event_triage where event_id='$m'),'<no row>')")"
done
say ""

# --- put ONE member already in the target state ------------------------------
FIRST=$(echo "$MEMBERS" | awk '{print $1}')
say "4. pre-set ONE member to 'investigating' through the SINGLE-event route, so"
say "   the bulk action has a member it cannot change (the 'unchanged' outcome):"
say "   POST $BE/api/v1/ai/events/$FIRST/triage"
say "   member $FIRST"
PRE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BE/api/v1/ai/events/$FIRST/triage" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"status":"investigating","note":"P47 fix lane: pre-state for the bulk-triage path proof."}')
say "   -> HTTP $PRE"
say ""

# NO NOTE in this body, deliberately. A note is itself a change — it appends a
# ledger row — so a bulk body carrying one makes EVERY member `applied` and the
# third outcome can never be observed. Without it, the member already in the
# target state is refused as "no triage change requested" and counted
# `unchanged`, which is the property worth proving.
BODY='{"groupKeys":["'"$KEY"'"],"status":"investigating"}'

# --- the OLD path (what the console sent) ------------------------------------
say "5. THE OLD PATH the Frontend used to send — same body, same token:"
say "   POST $BE$OLD_PATH"
OLD_RES=$(curl -s -w '\n__HTTP__%{http_code}' -X POST "$BE$OLD_PATH" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$BODY")
say "   -> $(echo "$OLD_RES" | tr -d '\r' | tr '\n' ' ')"
say ""

# --- the CORRECTED path ------------------------------------------------------
say "6. THE CORRECTED PATH (lib/api/endpoints.ts EVENT_TRIAGE_BULK) — same body:"
say "   POST $BE$NEW_PATH"
NEW_RES=$(curl -s -w '\n__HTTP__%{http_code}' -X POST "$BE$NEW_PATH" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$BODY")
say "   -> $(echo "$NEW_RES" | tr -d '\r' | tr '\n' ' ')"
say "   expected selected=3 applied=2 unchanged=1 failed=0 — the pre-set member"
say "   is refused as a no-op and reported as the THIRD outcome, not a success."
say ""

say "6b. negative control — the SAME action again on the corrected path. Every"
say "    member is now in the target state, so nothing should move:"
REPEAT_RES=$(curl -s -w '\n__HTTP__%{http_code}' -X POST "$BE$NEW_PATH" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$BODY")
say "    -> $(echo "$REPEAT_RES" | tr -d '\r' | tr '\n' ' ')"
say ""

# --- a member the action CANNOT be applied to -------------------------------
say "7. negative control on the same corrected path — resolve with NO note, which"
say "   the service refuses per member (expect failed == selected):"
FAIL_RES=$(curl -s -w '\n__HTTP__%{http_code}' -X POST "$BE$NEW_PATH" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"groupKeys":["'"$KEY"'"],"status":"resolved","resolutionReason":"false_positive"}')
say "   -> $(echo "$FAIL_RES" | tr -d '\r' | tr '\n' ' ')"
say ""

say "8. triage rows AFTER the bulk action (psql):"
for m in $MEMBERS; do
  say "   $m -> $($PSQL "select coalesce((select status from ai_event_triage where event_id='$m'),'<no row>')")"
done
say ""

# --- restore -----------------------------------------------------------------
say "9. RESTORE — every member back to 'new' through the SINGLE-event route:"
for m in $MEMBERS; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BE/api/v1/ai/events/$m/triage" \
    -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
    -d '{"status":"new","note":"P47 fix lane: restoring the rig after the bulk-triage path proof."}')
  say "   POST /api/v1/ai/events/$m/triage {status:new} -> HTTP $CODE ; now $($PSQL "select coalesce((select status from ai_event_triage where event_id='$m'),'<no row>')")"
done
say ""
say "NOTE: triage is a SIDECAR and append-only. The status is restored; the"
say "ai_event_triage rows and their ai_event_triage_transitions ledger entries"
say "remain by design (nothing deletes). ai_events itself was never written."
say ""
say "written to $OUT"
