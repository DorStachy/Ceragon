#!/usr/bin/env bash
# Cluster E — evidence, receipts, session identity, AI context.
# Items 55 [E9], 56 [E10], 57 [E11], 58 [E15], 59 [E17], 60 [E1], 61 [E2],
#       62 [E3], 63 [E4], 64 [E8], 65 [E5], 66 [E6], 67 [E7], 68 [E13],
#       69 [E12], 70 [E14], 71 [E16].
#
# Contract: HARNESS.md. One TSV line per check on stdout:
#   <VERDICT>\t<check-id>\t<item>\t<kind>\t<message>
#
# Rule 7 is enforced: a check that cannot reach its target emits BLOCKED naming
# the missing precondition. Rule 8: only kind=live may be read as PROVEN LIVE.
#
# THIS CLUSTER'S RECURRING DEFECT is a DECLARED FIELD WITH NO PRODUCER. Every
# column, state and event class these items introduce therefore gets a check
# that something actually WRITES it, not merely that a type or a table exists.
#
# ── HOW THE LIVE HALF IS DRIVEN ──────────────────────────────────────────────
# Most of these acceptances are about what an ENROLLED ENDPOINT causes the
# server to write. No DeVoid agent exists on this box, so the endpoint lanes are
# driven directly against the local stack by `lib/cluster-e/` :
#
#   agent-setup.js   mints a LOCAL-ONLY cli_agent API key and binds it to the
#                    already-enrolled local agent row (hostname CND34521VN), then
#                    derives that agent's v2 request-signing secret exactly as
#                    AgentSigningCredentialService does. Secrets are written to
#                    the scratchpad and never printed.
#   agent-post.js    performs one CERA-CLI-v2 signed agent request.
#   exercise.sh      issues a policy bundle, posts one evidence batch, two
#                    session starts, one 41-adapter heartbeat and three
#                    ai-context sweeps — i.e. it drives the real producers.
#   agent-restore.js prints the SQL that puts the agent row back.
#
# `cluster-e.sh` MEASURES; it does not re-drive. Run `checks/lib/cluster-e/
# exercise.sh` first (once) if the local database has not been exercised. Every
# live check below reads what is actually in the database or on the wire now, so
# a stale/never-exercised database reports FAIL, never a pass.
set -u

# The trees under test. Defaults are the integration bases; the three CLUSTER_E_*
# overrides let a FIX BRANCH be measured without editing this file, and the run
# that produced a result file must record which tree it read.
BE="${CLUSTER_E_BE:-C:/Users/Owner/Documents/Ceragon/.worktrees/base-be-integration}"
FE="${CLUSTER_E_FE:-C:/Users/Owner/Documents/Ceragon/.worktrees/base-fe-integration}"
# The E17 console half lives on `fix/qa0802-owed-console-gaps`, which is NOT on
# the FE integration base. `FEOWED` is that tree; it defaults to `FE` so a run
# that does not set it measures one tree consistently rather than mixing two.
FEOWED="${CLUSTER_E_FEOWED:-$FE}"
INST="${CLUSTER_E_INST:-C:/Users/Owner/Documents/Ceragon/.worktrees/base-inst-hermetic}"
EV="C:/Users/Owner/Documents/Ceragon/.plans/verify-20260805/evidence/cluster-e"
SCRATCH="C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad"
PGC=codesec-e2e-postgres
API=http://127.0.0.1:2053
DAEMON=http://127.0.0.1:19280
mkdir -p "$EV"
export MSYS_NO_PATHCONV=1

emit() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5"; }
sql()  { docker exec "$PGC" psql -U codefense -d codefense_db -Atc "$1" 2>&1; }
jest() { ( cd "$BE" && npx jest --silent --ci "$@" ); }
gotest() { ( cd "$INST" && go test "$@" ); }

# =============================================================================
# THE PROD SQL LANE (2026-08-07)
# =============================================================================
# `PROD_BLOCK` below used to read "prod RDS is private with no in-VPC bastion;
# prod SQL cannot run from this box". The first half is still true and must stay
# true — item 8 PASSES because the instance is `PubliclyAccessible=false` and
# nothing here may widen its security group. The second half is false.
# `Backend/scripts/prod-sql-runner.cjs` launches a one-off Fargate task INTO the
# RDS VPC on the backend's own subnet + security group (the source the retained
# ingress rule already admits), runs psql under a server-side
# `SET TRANSACTION READ ONLY` behind a client-side write/DDL keyword scan, and
# leaves no rule, host or service behind.
#
# ECS RunTask caps the container-override payload at 8192 bytes and each launch
# costs ~90 s, so the queries are BATCHED into one file, run at most ONCE per
# invocation, and every result is emitted as QA::<key>::<v1>|<v2>|... so psql's
# column padding cannot be mis-read. Nothing selects prompt, preview or
# credential TEXT — counts, timestamps and closed-vocabulary slugs only.
#
# This extends cluster-g.sh's `prodsql()` convention; --sql-file rather than
# --sql because of the 8192-byte cap, and because a Windows path is the only
# form node reads reliably under the MSYS_NO_PATHCONV=1 this file exports.
PRODSQL_STATE=absent          # absent | ok | failed
PRODSQL_WHY=""
PRODSQL_OUT="$EV/prodsql-e.out"
PRODSQL_SQL="$EV/prodsql-e.sql"
PRODSQL_RUNNER="$BE/scripts/prod-sql-runner.cjs"

flat() { tr -d '[:cntrl:]' | tr '\t' ' ' | cut -c1-400; }
winpath() { # /c/x -> C:/x  (node.exe cannot open an MSYS path)
  case "$1" in
    /[a-zA-Z]/*) printf '%s:/%s' "$(printf '%s' "$1" | cut -c2 | tr 'a-z' 'A-Z')" \
                                  "$(printf '%s' "$1" | cut -c4-)" ;;
    *)           printf '%s' "$1" ;;
  esac
}

prodsql_sql_e() {
cat <<'SQL'
SELECT 'QA::TRAF::' || coalesce(replace(max(event_time)::text,' ','T'),'none') || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE event_time > now() - interval '7 days'))::text AS r FROM ai_events;
SELECT 'QA::TRAFA::' || coalesce(replace(max("createdAt")::text,' ','T'),'none') || '|' || count(*)::text AS r
  FROM audit_events;
SELECT 'QA::E56R::' || count(*)::text || '|' || count(DISTINCT org_id)::text
    || '|' || coalesce(replace(max(created_at)::text,' ','T'),'none') AS r
  FROM ai_policy_bundle_application_receipt;
SELECT 'QA::E56B::' || (SELECT count(*) FROM ai_policy_bundle_state)::text
    || '|' || (SELECT count(*) FROM ai_policy_bundle_history)::text AS r;
SELECT 'QA::E56T::' || count(*)::text AS r FROM ai_prompt_evidence_artifacts;
SELECT 'QA::E56A::' || coalesce(string_agg(state || '=' || n::text, ',' ORDER BY state),'none') AS r
  FROM (SELECT state, count(*) AS n FROM ai_prompt_evidence_artifacts GROUP BY 1) t;
SELECT 'QA::E59::' || coalesce(string_agg(et || '=' || n::text, ',' ORDER BY et),'none') AS r
  FROM (SELECT "eventType" AS et, count(*) AS n FROM audit_events
         WHERE "eventType" LIKE '%PROMPT_EVIDENCE%' GROUP BY 1) t;
SELECT 'QA::E59S::' || coalesce(string_agg(coalesce(s,'(no-surface)') || '=' || n::text, ',' ORDER BY 1),'none') AS r
  FROM (SELECT payload->>'surface' AS s, count(*) AS n FROM audit_events
         WHERE "eventType" LIKE '%PROMPT_EVIDENCE%' GROUP BY 1) t;
SELECT 'QA::E59T::' || count(*)::text || '|' || count(DISTINCT "eventType")::text AS r FROM audit_events;
SELECT 'QA::E59G::' || count(*)::text AS r FROM ai_prompt_evidence_access_grants;
SELECT 'QA::E62R::' || coalesce(string_agg(coalesce(runtime,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT runtime, count(*) AS n FROM ai_events GROUP BY 1) t;
SELECT 'QA::E62S::' || coalesce(string_agg(coalesce(surface,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT surface, count(*) AS n FROM ai_events GROUP BY 1) t;
SELECT 'QA::E62K::' || coalesce(string_agg(coalesce(client_kind,'(null)') || '=' || n::text, ',' ORDER BY n DESC),'none') AS r
  FROM (SELECT client_kind, count(*) AS n FROM ai_sessions GROUP BY 1) t;
SELECT 'QA::E65::' || left(id::text,8)
    || '|' || coalesce(replace(chat_title,' ','_'),'(null)')
    || '|' || coalesce(replace(title,' ','_'),'(null)')
    || '|' || coalesce(replace(username,' ','_'),'(null)') AS r
  FROM ai_sessions WHERE id::text LIKE '9c13f9e5%' OR id::text LIKE 'abd7495f%' ORDER BY 1;
SELECT 'QA::E65N::' || count(*)::text
    || '|' || (count(*) FILTER (WHERE chat_title IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE title IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE username IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE chat_title IS NULL AND title IS NULL))::text AS r
  FROM ai_sessions;
SELECT 'QA::E68F::' || count(*)::text || '|' || count(DISTINCT endpoint_id)::text
    || '|' || count(DISTINCT org_id)::text AS r FROM ai_context_findings;
SELECT 'QA::E68C::' || count(*)::text || '|' || count(DISTINCT endpoint_id)::text
    || '|' || coalesce(sum(nodes_resolved),0)::text
    || '|' || (count(*) FILTER (WHERE complete))::text AS r FROM ai_context_coverage;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;
SELECT 'QA::E68IDC::' || count(*)::text || '|' || (count(*) FILTER (WHERE a_hit))::text
    || '|' || (count(*) FILTER (WHERE k_hit))::text AS r
  FROM (SELECT EXISTS (SELECT 1 FROM agents g WHERE g.id::text = c.endpoint_id) AS a_hit,
               EXISTS (SELECT 1 FROM api_keys k WHERE k.id::text = c.endpoint_id) AS k_hit
          FROM ai_context_coverage c) t;
SELECT 'QA::E68IDF::' || count(*)::text || '|' || (count(*) FILTER (WHERE a_hit))::text
    || '|' || (count(*) FILTER (WHERE k_hit))::text AS r
  FROM (SELECT EXISTS (SELECT 1 FROM agents g WHERE g.id::text = f.endpoint_id) AS a_hit,
               EXISTS (SELECT 1 FROM api_keys k WHERE k.id::text = f.endpoint_id) AS k_hit
          FROM ai_context_findings f) t;
SQL
}

prodsql_run() {
  [ "$PRODSQL_STATE" != absent ] && return 0
  # A previous invocation's capture must never be readable by this one.
  rm -f "$PRODSQL_OUT"
  if [ "${QA0802_PROD_SQL:-1}" != "1" ]; then
    PRODSQL_STATE=failed
    PRODSQL_WHY="the prod SQL lane was switched OFF for this run by QA0802_PROD_SQL=${QA0802_PROD_SQL:-} — unset it to measure production"
    return 1
  fi
  if [ ! -f "$PRODSQL_RUNNER" ]; then
    PRODSQL_STATE=failed
    PRODSQL_WHY="the in-VPC runner scripts/prod-sql-runner.cjs is absent from the tree under test ($BE)"
    return 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    PRODSQL_STATE=failed
    PRODSQL_WHY="node is not on PATH, so the in-VPC runner cannot be started"
    return 1
  fi
  local who
  who=$(aws sts get-caller-identity --query Account --output text 2>&1 | flat)
  if [ "$who" != "113627991972" ]; then
    PRODSQL_STATE=failed
    PRODSQL_WHY="aws identity is '$who', not the production account 113627991972, so the in-VPC Fargate runner cannot be launched"
    return 1
  fi
  prodsql_sql_e > "$PRODSQL_SQL"
  ( cd "$BE" && MSYS_NO_PATHCONV=1 AWS_PAGER="" \
      node scripts/prod-sql-runner.cjs --sql-file "$(winpath "$PRODSQL_SQL")" ) > "$PRODSQL_OUT" 2>&1
  local rc=$? tgt task
  tgt=$(grep -m1 -E '^target' "$PRODSQL_OUT" | sed 's/^target *: *//' | flat)
  task=$(grep -m1 -E '^task +:' "$PRODSQL_OUT" | sed 's/^task *: *//' | flat)
  if [ -z "$tgt" ]; then
    PRODSQL_STATE=failed
    PRODSQL_WHY="the in-VPC runner did not reach production (exit $rc): $(tail -3 "$PRODSQL_OUT" | flat)"
    return 1
  fi
  PRODSQL_STATE=ok
  # Rule 10 — name the lane that produced every prod verdict below, next to them.
  emit PASS ENVE-PROD 0 live "prod SQL lane OPEN and read-only: $PRODSQL_RUNNER launched one-off Fargate task ${task:-unknown} into the RDS VPC (subnet-043fba9d9893864a4 / sg-02e5e94735f154e7f), target $tgt, server-side SET TRANSACTION READ ONLY, runner exit $rc. The RDS security group and PubliclyAccessible=false were NOT changed — item 8 still passes because the instance is private. Capture: $PRODSQL_OUT"
  return 0
}

# THE STATE GUARD ON THE FIRST LINE IS LOAD-BEARING, not defensive tidiness.
# Without it a run with the lane switched off still found the PREVIOUS run's
# capture on disk and reported its numbers as though production had just been
# measured — a verdict over a path that did not execute this run, which is the
# exact failure this harness exists to remove. Caught by running the lane with
# QA0802_PROD_SQL=0 on 2026-08-07.
prodv() { # <key> -> one line per returned row (psql result block only; the
          # runner echoes the query above it and a whole-file grep would match
          # the query text instead of its result)
  [ "$PRODSQL_STATE" = "ok" ] || return 0
  sed -n '/----- psql output -----/,/----- end output -----/p' "$PRODSQL_OUT" 2>/dev/null \
    | grep -oE "QA::$1::.*" | sed "s/^QA::$1:://" | sed 's/[[:space:]]*$//'
}
prodv1() { prodv "$1" | head -1; }
fld() { printf '%s' "$1" | cut -d'|' -f"$2"; }
prodsql_err() {
  sed -n '/----- psql output -----/,/----- end output -----/p' "$PRODSQL_OUT" 2>/dev/null \
    | grep -m1 -E '^(ERROR|FATAL):' | flat
}
prod_why() {
  if [ "$PRODSQL_STATE" != "ok" ]; then printf '%s' "$PRODSQL_WHY"; return; fi
  local e; e=$(prodsql_err)
  if [ -n "$e" ]; then
    printf 'the in-VPC runner reached production but psql aborted before this statement: %s' "$e"
  else
    printf 'the prod batch returned no row for this query; capture: %s' "$PRODSQL_OUT"
  fi
}
# Production has had NO agent traffic since 2026-08-02. Several of these items
# measure "did a producer write a row", and a zero over a silent window is not
# the same finding as a zero over a busy one. Every prod check states which it
# is, so "nothing ran" is never scored as "the producer is broken".
prod_traffic_note() {
  local t n recent a
  t=$(prodv1 TRAF); a=$(prodv1 TRAFA)
  n=$(fld "$t" 2); recent=$(fld "$t" 3)
  printf 'prod AI traffic: %s ai_events total, newest %s, %s in the last 7 days; audit_events newest %s' \
    "${n:-?}" "$(fld "$t" 1)" "${recent:-?}" "$(fld "$a" 1)"
}
prod_is_silent() { # 0 = production has received no AI event in the last 7 days
  local recent; recent=$(fld "$(prodv1 TRAF)" 3)
  [ -n "$recent" ] && [ "$recent" = "0" ]
}
isnum() { case "${1:-}" in ''|*[!0-9]*) return 1;; *) return 0;; esac; }

# ── the five prod-database checks ────────────────────────────────────────────
# Each runs the acceptance's OWN SQL against production and reports what it saw.
# Where a clause is still unreachable the check emits BLOCKED naming the
# precondition that is actually missing NOW — never the retired "prod SQL cannot
# run from this box", which stopped being true on 2026-08-06.

# item 56 — the bundle-application-receipt producer, IN PRODUCTION.
prod_e56() {
  prodsql_run
  local r n orgs newest b st hist arts states obs
  r=$(prodv1 E56R)
  if [ -z "$r" ]; then emit BLOCKED E56-4 56 live "$(prod_why)"; return; fi
  n=$(fld "$r" 1); orgs=$(fld "$r" 2); newest=$(fld "$r" 3)
  b=$(prodv1 E56B); st=$(fld "$b" 1); hist=$(fld "$b" 2)
  arts=$(prodv1 E56T); states=$(prodv1 E56A)
  obs="the acceptance's clause-1 SQL was run IN PRODUCTION, read-only, through the in-VPC Fargate runner: ai_policy_bundle_application_receipt holds $n row(s) across $orgs org(s), newest $newest; ai_policy_bundle_state=$st, ai_policy_bundle_history=$hist; ai_prompt_evidence_artifacts holds $arts row(s), states [$states]. $(prod_traffic_note)"
  if isnum "$n" && [ "$n" -gt 0 ]; then
    emit PASS E56-4 56 live "$obs — the receipt producer HAS written in production. RESIDUE, named: the console sentence (\"the claimed policy authority could not be proven\" stops printing) is a PROD console read and needs an authenticated production console session, which this agent may not create"
  elif prod_is_silent; then
    emit BLOCKED E56-4 56 live "$obs — 0 receipts, but production has received NO AI event in the last 7 days, so no bundle activation can have occurred there and the zero is silence, not a broken producer. The producer itself is proven by E56-1 (one receipt written on the local stack by a real AI_POLICY_BUNDLE_APPLIED event). Precondition: an endpoint enrolled against PRODUCTION performing a bundle activation — the agent enrolled on this box reports to the local stack on :2053. The console sentence additionally needs an authenticated production console session"
  else
    emit FAIL E56-4 56 live "$obs — production is receiving AI events yet ai_policy_bundle_application_receipt is EMPTY, so the receipt producer is not running there and prompt evidence stays authority-gapped in prod"
  fi
}

# item 59 — one audit record per prompt-evidence reveal, IN PRODUCTION.
prod_e59() {
  prodsql_run
  local rows surf tot g arts obs
  rows=$(prodv1 E59); surf=$(prodv1 E59S); tot=$(prodv1 E59T)
  g=$(prodv1 E59G); arts=$(prodv1 E56T)
  if [ -z "$tot" ]; then emit BLOCKED E59-7 59 live "$(prod_why)"; return; fi
  obs="the CORRECTED acceptance query was run IN PRODUCTION, read-only, in-VPC (audit_events has none of the five columns the original named; the reveal facts live in payload jsonb): %PROMPT_EVIDENCE% rows [$rows] out of $(fld "$tot" 1) audit rows over $(fld "$tot" 2) distinct eventTypes; surfaces named on those rows [$surf]; ai_prompt_evidence_access_grants=$g; ai_prompt_evidence_artifacts=$arts. $(prod_traffic_note)"
  if [ "$rows" != "none" ] && [ -n "$rows" ]; then
    case "$surf" in
      *'(no-surface)'*)
        emit FAIL E59-7 59 live "$obs — at least one prod reveal row names NO surface, so the audit record cannot say which console surface the text was revealed on" ;;
      *)
        emit PASS E59-7 59 live "$obs — every prod reveal row names the surface it happened on. RESIDUE, named: the two-surface console comparison (the same event on /coding-ai/detections and on Session detail) is a PROD console read needing an authenticated production console session" ;;
    esac
  elif isnum "$arts" && [ "$arts" -gt 0 ]; then
    emit BLOCKED E59-7 59 live "$obs — 0 reveal rows while $arts revealable artifact(s) exist, and this lane cannot distinguish \"no one revealed anything\" from \"reveals happened and were not audited\". Precondition: a known reveal to check the record against — an operator action on the production console"
  else
    emit BLOCKED E59-7 59 live "$obs — the positive clause (one row per reveal, naming the surface) has an EMPTY POPULATION in production: there are 0 prompt-evidence artifacts, so no reveal can have occurred and no access row should exist. The negative clause holds vacuously, which is not proof of the control. Precondition: a captured prompt-evidence artifact in PRODUCTION (item 56's receipt producer has never run there), plus an authenticated production console session for the two-surface comparison"
  fi
}

# item 62 — ONE server-side derivation, measured against what prod actually holds.
prod_e62() {
  prodsql_run
  local rt sf ck vocab off kv v obs
  rt=$(prodv1 E62R); sf=$(prodv1 E62S); ck=$(prodv1 E62K)
  if [ -z "$rt" ]; then emit BLOCKED E62-5 62 live "$(prod_why)"; return; fi
  # The closed runtime vocabulary, read from the TREE UNDER TEST rather than
  # restated here, so a vocabulary change cannot silently invalidate this check.
  vocab=$(awk '/^export const (CODING_AGENT_TYPES|WEB_AGENT_TYPES|AUTONOMOUS_AGENT_TYPES) = /,/as const;/' \
            "$BE/src/ai-governance/ai-plane.constants.ts" 2>/dev/null \
          | grep -oE "'[a-z0-9-]+'" | tr -d "'" | sort -u)
  if [ -z "$vocab" ]; then
    emit BLOCKED E62-5 62 live "the prod runtime census ran ([$rt]) but the closed runtime vocabulary could not be read from $BE/src/ai-governance/ai-plane.constants.ts, so membership cannot be decided"
    return
  fi
  off=""
  for kv in $(printf '%s' "$rt" | tr ',' ' '); do
    v=${kv%%=*}
    [ "$v" = "(null)" ] && continue
    printf '%s\n' "$vocab" | grep -qix "$v" || off="$off $kv"
  done
  obs="the ONE derivation was measured against everything PRODUCTION actually holds, read-only and in-VPC: ai_events.runtime [$rt]; ai_events.surface [$sf]; ai_sessions.client_kind [$ck]. The closed runtime vocabulary read from ai-plane.constants.ts is: $(printf '%s' "$vocab" | tr '\n' ' ')"
  if [ -n "$off" ]; then
    emit FAIL E62-5 62 live "$obs — but production stores runtime value(s) OUTSIDE it:$off. A \`?runtime=\` filter 400s on an off-vocabulary value (E62-2), so no runtime-filtered console view can ever return those rows and their chip cannot agree with the filter"
  else
    emit BLOCKED E62-5 62 live "$obs — every stored runtime is IN the closed vocabulary, so the \`?runtime=\` filter and the runtime chip can agree on every prod row. NOT ASSERTED HERE, and named rather than waved past: several stored SURFACE tokens (tool-output, pretooluse, openai-wire-ingress) are outside the closed AI_SOURCE_SURFACES set. The design intends those to be folded to a closed slug with the original preserved as surfaceRaw (runtime-identity.util.ts names browser-composer / browser-upload / ci as live examples and item 15's migration deliberately refused a CHECK on source_surface), but this check did NOT execute the fold over them. What was NOT observed is the acceptance's own clause: the same session opened on Detections, on Fleet Coverage / Protection Depth and on Session detail showing the same surface word. Precondition: an authenticated PRODUCTION console session — entering credentials is prohibited for the implementing agent, so this is an owner/operator action"
  fi
}

# item 65 — the session-name ladder, over the two sessions the acceptance names.
prod_e65() {
  prodsql_run
  local rows n a b ac at au bc bt bu obs
  rows=$(prodv E65); n=$(prodv1 E65N)
  if [ -z "$n" ]; then emit BLOCKED E65-5 65 live "$(prod_why)"; return; fi
  a=$(printf '%s\n' "$rows" | grep '^9c13f9e5|' | head -1)
  b=$(printf '%s\n' "$rows" | grep '^abd7495f|' | head -1)
  obs="PRODUCTION was read for both sessions the acceptance names, read-only and in-VPC (spaces shown as _): 9c13f9e5 -> [${a:-ABSENT}], abd7495f -> [${b:-ABSENT}]; over all $(fld "$n" 1) prod sessions, $(fld "$n" 2) carry a chat_title, $(fld "$n" 3) a title, $(fld "$n" 4) a username, and $(fld "$n" 5) carry neither chat_title nor title and must therefore resolve to \"Untitled session\""
  if [ -z "$a" ] || [ -z "$b" ]; then
    emit FAIL E65-5 65 live "$obs — one or both of the sessions the acceptance names is GONE from production, so the acceptance's own subject no longer exists and its H1 assertions cannot be checked against it"
    return
  fi
  ac=$(fld "$a" 2); at=$(fld "$a" 3); au=$(fld "$a" 4)
  bc=$(fld "$b" 2); bt=$(fld "$b" 3); bu=$(fld "$b" 4)
  if [ "$ac" = "(null)" ] || [ "$au" = "(null)" ] \
     || [ "$bc" != "(null)" ] || [ "$bt" != "(null)" ] || [ "$bu" != "(null)" ]; then
    emit FAIL E65-5 65 live "$obs — the acceptance's premise no longer holds in production. It requires 9c13f9e5 to carry a chat title AND a username (rung 1 must fire and the person must be served separately) and abd7495f to carry NULL title and NULL username (rung 3 must fire); prod now carries 9c13f9e5 chat=$ac title=$at user=$au and abd7495f chat=$bc title=$bt user=$bu"
  else
    emit BLOCKED E65-5 65 live "$obs — the backend-side inputs are EXACTLY what the acceptance asserts: 9c13f9e5 carries chat_title \"Pull all repos\" plus title and username, so rung 1 must name it and the person is a separate field; abd7495f carries NULL chat_title, NULL title and NULL username, so rung 3 must name it \"Untitled session\" with the actor \"Unattributed\". What was NOT observed is the rendering: reading H1 and the actor line on the PROD console. Precondition: an authenticated production console session — entering credentials is prohibited for the implementing agent. The server-side ladder itself is pinned by E65-2 and exercised live on the local stack by E65-1"
  fi
}

# item 68 — land ai_context_findings in prod, and the endpoint-identity defect.
prod_e68() {
  prodsql_run
  local f c fn fep forg cn cep cnodes idc idf obs
  local lc lf lca lck lfa lfk localok v
  f=$(prodv1 E68F); c=$(prodv1 E68C); idc=$(prodv1 E68IDC); idf=$(prodv1 E68IDF)
  if [ -z "$f" ]; then emit BLOCKED E68-5 68 live "$(prod_why)"; return; fi
  fn=$(fld "$f" 1); fep=$(fld "$f" 2); forg=$(fld "$f" 3)
  cn=$(fld "$c" 1); cep=$(fld "$c" 2); cnodes=$(fld "$c" 3)

  # THE KNOWN DEFECT, EXECUTED rather than asserted. ai-context.controller.ts:65
  # sets `const endpointId = agentId ?? apiKeyId`, so the column can hold a
  # CREDENTIAL id instead of a machine id — which would make the acceptance's
  # `count(DISTINCT endpoint_id)` a count of API keys, and any
  # `WHERE endpoint_id = <agent-id>` match nothing. Production holds no rows to
  # decide it on, so the decision is taken where rows DO exist: the local stack,
  # written by a real signed-agent POST (E68-1/E68-2).
  lc=$(sql "select count(*) from ai_context_coverage;")
  lf=$(sql "select count(*) from ai_context_findings;")
  lca=$(sql "select count(*) from ai_context_coverage c join agents a on a.id::text=c.endpoint_id;")
  lck=$(sql "select count(*) from ai_context_coverage c join api_keys k on k.id::text=c.endpoint_id;")
  lfa=$(sql "select count(*) from ai_context_findings f join agents a on a.id::text=f.endpoint_id;")
  lfk=$(sql "select count(*) from ai_context_findings f join api_keys k on k.id::text=f.endpoint_id;")
  localok=1
  for v in "$lc" "$lf" "$lca" "$lck" "$lfa" "$lfk"; do isnum "$v" || localok=0; done

  obs="the acceptance's own SQL was run IN PRODUCTION, read-only and in-VPC: SELECT count(*), count(DISTINCT endpoint_id) FROM ai_context_findings returns $fn / $fep over $forg org(s); ai_context_coverage holds $cn row(s) over $cep distinct endpoint_id(s) summing $cnodes resolved nodes. Prod endpoint_id resolution (rows|match agents.id|match api_keys.id): coverage $idc, findings $idf. $(prod_traffic_note)"

  if [ "$localok" = "1" ] && [ $((lc + lf)) -gt 0 ] && [ $((lca + lfa)) -eq 0 ] && [ $((lck + lfk)) -gt 0 ]; then
    emit FAIL E68-5 68 live "$obs — and the endpoint identity is WRONG at the only place rows exist. On the stack that has been exercised by a real signed-agent POST, all $lc ai_context_coverage and $lf ai_context_findings rows carry an endpoint_id that joins to api_keys.id ($lck and $lfk rows) and to agents.id on ZERO rows. src/ai-context/ai-context.controller.ts:65 sets \`const endpointId = agentId ?? apiKeyId\`, so the column stores a CREDENTIAL id: the acceptance's count(DISTINCT endpoint_id) counts API keys, not machines, and any WHERE endpoint_id = <agent-id> matches nothing on every endpoint. Prod additionally holds $fn findings and $cn coverage rows, so nothing has landed there either"
  elif isnum "$fn" && [ "$fn" -gt 0 ] && isnum "$cnodes" && [ "$cnodes" -gt 0 ]; then
    emit PASS E68-5 68 live "$obs — findings and a non-zero swept-node count are both present in production. RESIDUE, named: the console 'Secrets in agent context' tile is a PROD console read needing an authenticated production console session"
  elif prod_is_silent; then
    emit BLOCKED E68-5 68 live "$obs — nothing has ever landed in production, and production has received NO AI event in the last 7 days, so no sweep can have been posted there and the zero is silence rather than a rejected write. Precondition: an endpoint enrolled against PRODUCTION completing one ai-context sweep. The local-stack identity probe could not decide the endpoint_id question either (coverage=$lc findings=$lf agents-match=$lca/$lfa keys-match=$lck/$lfk, probe readable=$localok). The console tile additionally needs an authenticated production console session"
  else
    emit FAIL E68-5 68 live "$obs — production is receiving AI events yet ai_context_findings and ai_context_coverage are both empty, so the sweep never lands there"
  fi
}

# ── shared preconditions, probed once, never assumed ─────────────────────────
# TRAP: 127.0.0.1:19280/health answers 200 with version 3.6.0 — that is
# wslrelay.exe forwarding a WSL-resident daemon that PREDATES every /v1/ai/*
# route. A check that curls the port and tests for 200 would report a live
# DeVoid endpoint on a machine with none. Probe an AI route instead.
DAEMON_AI=$(curl -s -m 6 -o /dev/null -w '%{http_code}' "$DAEMON/v1/ai/canary" 2>/dev/null); [ -z "$DAEMON_AI" ] && DAEMON_AI=000
DAEMON_VER=$(curl -s -m 6 "$DAEMON/health" 2>/dev/null | grep -oE '"version":"[^"]*"' | cut -d'"' -f4); [ -z "$DAEMON_VER" ] && DAEMON_VER=none
ENDPOINT_BLOCK="no DeVoid agent is installed on this box (no devoid.exe, no enrolment); the only 127.0.0.1:19280 listener is a WSL-relayed devoid ${DAEMON_VER} whose /v1/ai/* routes answer ${DAEMON_AI}"
# PROD_BLOCK is RETIRED (2026-08-07). It read "prod RDS is private with no
# in-VPC bastion; prod SQL cannot run from this box" and the second clause
# stopped being true when the in-VPC Fargate runner landed. A stock BLOCKED
# string that names a precondition which has since been met is worse than no
# string at all: it makes an answerable check look unanswerable forever. Every
# check that used it now runs the acceptance's real SQL — see prod_e56 /
# prod_e59 / prod_e62 / prod_e65 / prod_e68 above — and names, when it still
# cannot answer, the precondition that is actually missing.

# ── THE LIVE ENDPOINT (2026-08-06) ────────────────────────────────────────────
# A DeVoid agent IS now installed, enrolled and running against this stack —
# built from integration/qa0802-inst, enrolled as agent 70573ce5 / CND34521VN,
# and run from an ISOLATED HOME so it never writes the owner's ~/.devoid,
# ~/.claude or ~/.codex. Every check that used to emit an unconditional
# BLOCKED citing "no agent" is now DRIVEN. The three preconditions are probed,
# never assumed; when one is absent the check still BLOCKS, naming THAT.
# RULE 10 ON THE AGENT BINARY. The endpoint-side checks below are statements
# about a BINARY, not only about a repository, and until now the binary was
# implicit: every one of them ran the stable Program Files install via the shim.
# A fix built in a worktree is therefore invisible to this harness unless the
# harness can be pointed at it AND SAYS SO on its own results.
#
# QA0802_AGENT_BIN overrides the shim. It is not a convenience: a run that
# measures a fix build and reports it as though it measured the shipped one is
# exactly the green-over-a-dead-path failure this harness exists to remove. The
# provenance line below carries the resolved path and its sha256 into results/.
AGENT_BIN="${QA0802_AGENT_BIN:-$SCRATCH/agent-bin/devoid}"
AGENT_HOME="$SCRATCH/agent-home/.devoid"
DTOK="$AGENT_HOME/daemon-token"
devoid_cli() { [ -x "$AGENT_BIN" ] && "$AGENT_BIN" "$@" 2>&1; }
# The daemon token rides the X-Devoid-Daemon-Token header (daemon_auth.go
# TokenHeader). Authorization: Bearer is NOT accepted and 401s.
dtok_get() { # <path> <evidence-file> -> status
  curl -s --noproxy '*' -m 90 -H "X-Devoid-Daemon-Token: $(cat "$DTOK")" -o "$EV/$2" -w '%{http_code}' "$DAEMON$1" 2>/dev/null
}
dtok_post() { # <path> <body-file> <evidence-file> -> status
  curl -s --noproxy '*' -m 120 -H "X-Devoid-Daemon-Token: $(cat "$DTOK")" -H 'Content-Type: application/json' \
    -X POST --data-binary "@$2" -o "$EV/$3" -w '%{http_code}' "$DAEMON$1" 2>/dev/null
}
# The identity probe: /health must name DeVoid, not a squatter on the port.
DAEMON_ID=$(curl -s -m 6 "$DAEMON/health" 2>/dev/null | grep -oE '"daemon":"[^"]*"' | cut -d'"' -f4)
# Rule 10 — name the binary this run measured, next to the verdicts it produced.
AGENT_BIN_OVERRIDE=$( [ -n "${QA0802_AGENT_BIN:-}" ] && echo yes || echo no )
AGENT_BIN_TARGET=$(grep -oE '\$SP/w26/bin/devoid\.exe|/c/Program Files/DeVoid/devoid\.exe|agent-build/devoid\.exe' "$AGENT_BIN" 2>/dev/null | tail -1)
AGENT_BIN_SHA=$(sha256sum "$AGENT_BIN" 2>/dev/null | cut -c1-16)
emit PASS ENVE-BIN 0 live "agent binary measured by this run: shim=$AGENT_BIN (sha256 ${AGENT_BIN_SHA:-unreadable}), execs=${AGENT_BIN_TARGET:-unresolved}, QA0802_AGENT_BIN override=$AGENT_BIN_OVERRIDE. Unset = the stable Program Files install; a fix built in a worktree is only measured when this says yes"

AGENT_LIVE=0
if [ -x "$AGENT_BIN" ] && [ -s "$DTOK" ] && [ "$DAEMON_ID" = "devoid" ]; then AGENT_LIVE=1; fi
NO_AGENT="the live endpoint is not answering: devoid shim exec=$( [ -x "$AGENT_BIN" ] && echo yes || echo no ), daemon-token present=$( [ -s "$DTOK" ] && echo yes || echo no ), 127.0.0.1:19280 /health daemon=\"${DAEMON_ID:-none}\" (must be \"devoid\"). Restart it with \`$AGENT_BIN daemon start\` under the isolated home."
ELEVATION_BLOCK="this session is NOT elevated (elevated=False) and cannot answer a UAC prompt"

JWT="$SCRATCH/e-jwt.txt"
have_jwt() { [ -s "$JWT" ]; }
get() { # <path> <evidence-file> -> prints status
  curl -s --noproxy '*' -m 120 -H "Authorization: Bearer $(cat "$JWT")" -o "$EV/$2" -w '%{http_code}' "$API$1" 2>/dev/null
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 55 [E9] — the enforcement-DECISION producer.
# ─────────────────────────────────────────────────────────────────────────────
check_55() {
  local n body
  n=$(sql "select count(*) from ai_enforcement_decisions;")
  sql "select decision_body from ai_enforcement_decisions order by created_at desc limit 1;" > "$EV/E55-1-decision-body.json"
  if [ "$n" -gt 0 ] 2>/dev/null; then
    body=$(grep -oE '"requestedEffect": "[^"]*"' "$EV/E55-1-decision-body.json" | head -1)
    local st ob
    st=$(grep -oE '"primaryState": "[^"]*"' "$EV/E55-1-decision-body.json" | head -1)
    ob=$(grep -oE '"kind": "[A-Z]+"' "$EV/E55-1-decision-body.json" | head -1)
    emit PASS E55-1 55 live "ai_enforcement_decisions = $n row(s) after a signed GET /api/v1/ai/policy-bundle (was 0 before the bundle was issued); newest row carries $body, $st, obligation $ob"
  else
    emit FAIL E55-1 55 live "ai_enforcement_decisions = 0 — issuing a policy bundle wrote no causal decision, so prepareReceipt still cannot resolve one"
  fi

  # The decision must be joinable by the bundle the endpoint was actually served.
  local hist
  hist=$(sql "select count(*) from ai_policy_bundle_history h join ai_enforcement_decisions d on d.bundle_digest = h.bundle_digest;")
  if [ "$hist" -gt 0 ] 2>/dev/null; then
    emit PASS E55-2 55 live "$hist decision row(s) join ai_policy_bundle_history on bundle_digest — the decision names the bundle Backend issued"
  else
    emit FAIL E55-2 55 live "no ai_enforcement_decisions row joins ai_policy_bundle_history on bundle_digest"
  fi

  jest src/ai-governance/services/ai-enforcement-decision-producer.service.spec.ts > "$EV/E55-3.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E55-3 55 unit "ai-enforcement-decision-producer.service.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E55-3.jest.log" | head -1))"
  else
    emit FAIL E55-3 55 unit "ai-enforcement-decision-producer.service.spec.ts FAILED; see E55-3.jest.log"
  fi

  if [ -f "$BE/src/ai-governance/services/ai-enforcement-decision-producer.live-pg.spec.ts" ]; then
    emit PASS E55-4 55 static "the pinned live-PG spec ai-enforcement-decision-producer.live-pg.spec.ts exists"
  else
    emit FAIL E55-4 55 static "the regression pin named by the acceptance — src/ai-governance/services/ai-enforcement-decision-producer.live-pg.spec.ts — is ABSENT from $BE"
  fi

  # ── E55-5 CONVERTED (live agent) ────────────────────────────────────────────
  # A real governed enforcement is now DRIVEN from the enrolled endpoint, and
  # the acceptance's clause 2 is then MEASURED against what it wrote.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E55-5 55 live "$NO_AGENT"
  else
    # Drive one: the Tier-D prompt fixture the failure oracle must resolve.
    dtok_post /v1/ai/prompt-check "$SCRATCH/qa-live/prompt-oracle2.json" E55-5-enforcement.json > /dev/null 2>&1
    sleep 4
    local rcpt enf
    rcpt=$(sql "select count(*) from ai_events where enforcement_receipt_v2 is not null;")
    enf=$(sql "select count(*) from ai_events where enforcement_effect is not null and enforcement_effect <> 'none';")
    if [ "$rcpt" -gt 0 ] 2>/dev/null; then
      emit PASS E55-5 55 live "one governed enforcement was driven on CND34521VN (enrolled agent 70573ce5, isolated home); ai_events now carries $rcpt row(s) with enforcement_receipt_v2 IS NOT NULL out of $enf enforcing rows"
    else
      emit FAIL E55-5 55 live "a governed enforcement WAS driven on the live enrolled endpoint (CND34521VN) — $enf ai_events rows now carry a non-'none' enforcement_effect, incl. PROMPT_BLOCKED/deny-prompt and TOOL_CALL_BLOCKED/deny-tool — and enforcement_receipt_v2 is still NULL on every row (count=$rcpt). The column has no producer on the live lane: prepareReceipt never lands a V2 receipt for a real endpoint enforcement"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 56 [E10] — the bundle-application-RECEIPT producer.
# ─────────────────────────────────────────────────────────────────────────────
check_56() {
  local n
  n=$(sql "select count(*) from ai_policy_bundle_application_receipt;")
  sql "select endpoint_id, bundle_revision, bundle_digest, created_at from ai_policy_bundle_application_receipt order by created_at desc limit 5;" > "$EV/E56-1-receipts.txt"
  if [ "$n" -gt 0 ] 2>/dev/null; then
    emit PASS E56-1 56 live "ai_policy_bundle_application_receipt = $n row(s) after ONE AI_POLICY_BUNDLE_APPLIED event on the legacy batch lane (was 0; the table had only *.spec.ts writers before)"
  else
    emit FAIL E56-1 56 live "ai_policy_bundle_application_receipt = 0 — no production writer reached the table"
  fi

  # The acceptance's second clause: the artifact must reach PENDING_UPLOAD, not
  # MISSING_REQUIRED, within one cron tick.
  sql "select id, state from ai_prompt_evidence_artifacts order by created_at desc;" > "$EV/E56-2-artifact-states.txt"
  local pend miss
  pend=$(sql "select count(*) from ai_prompt_evidence_artifacts where state='PENDING_UPLOAD';")
  miss=$(sql "select count(*) from ai_prompt_evidence_artifacts where state='MISSING_REQUIRED';")
  if [ "$pend" -gt 0 ] 2>/dev/null; then
    emit PASS E56-2 56 live "$pend artifact(s) are PENDING_UPLOAD and $miss are MISSING_REQUIRED — the 10-minute authority-gap cron promoted AUTHORITY_PENDING -> PENDING_UPLOAD because RECEIPT_MATCHES resolved"
  else
    emit FAIL E56-2 56 live "no artifact reached PENDING_UPLOAD (MISSING_REQUIRED=$miss); see E56-2-artifact-states.txt"
  fi

  if [ -f "$BE/src/ai-governance/services/prompt-evidence-authority-gap.live-pg.spec.ts" ]; then
    if grep -q "producer\|mint(" "$BE/src/ai-governance/services/prompt-evidence-authority-gap.live-pg.spec.ts"; then
      emit PASS E56-3 56 static "prompt-evidence-authority-gap.live-pg.spec.ts exists and references the producer, not only hand-inserted receipts"
    else
      emit FAIL E56-3 56 static "prompt-evidence-authority-gap.live-pg.spec.ts still only hand-inserts receipts; the acceptance asks for a case driving the REAL producer"
    fi
  else
    emit FAIL E56-3 56 static "the pinned spec prompt-evidence-authority-gap.live-pg.spec.ts is absent"
  fi

  prod_e56
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 57 [E11] — evidence_ref gets a producer. BOTH lanes.
# ─────────────────────────────────────────────────────────────────────────────
check_57() {
  local withref total resolves
  withref=$(sql "select count(*) from ai_events where evidence_ref is not null;")
  total=$(sql "select count(*) from ai_events;")
  resolves=$(sql "select count(*) from ai_events e join ai_prompt_evidence_artifacts a on a.id = e.evidence_ref;")
  sql "select e.id, e.event_type, e.evidence_ref, (a.id is not null) as artifact_exists from ai_events e left join ai_prompt_evidence_artifacts a on a.id=e.evidence_ref where e.evidence_ref is not null;" > "$EV/E57-1-evidence-ref.txt"
  if [ "$withref" -gt 0 ] 2>/dev/null && [ "$withref" = "$resolves" ]; then
    emit PASS E57-1 57 live "evidence_ref non-null on $withref/$total ai_events rows, and all $resolves resolve to an existing ai_prompt_evidence_artifacts row"
  elif [ "$withref" -gt 0 ] 2>/dev/null; then
    emit FAIL E57-1 57 live "evidence_ref non-null on $withref rows but only $resolves resolve to an artifact — a dangling hash-covered reference"
  else
    emit FAIL E57-1 57 live "evidence_ref is null on all $total ai_events rows — the column still has no producer"
  fi

  # BOTH ingest lanes must mint. The shipped daemon posts the LEGACY route.
  local mints
  mints=$(grep -c "promptArtifacts.mint(" "$BE/src/ai-governance/services/endpoint-evidence-ingest.service.ts")
  local legacy signed
  signed=$(awk '/async commitSignedBatch/,/^  async ingest\(/' "$BE/src/ai-governance/services/endpoint-evidence-ingest.service.ts" | grep -c "promptArtifacts.mint(")
  legacy=$(awk '/^  async ingest\(/,0' "$BE/src/ai-governance/services/endpoint-evidence-ingest.service.ts" | grep -c "promptArtifacts.mint(")
  if [ "$signed" -ge 1 ] && [ "$legacy" -ge 1 ]; then
    emit PASS E57-2 57 static "promptArtifacts.mint() is called on BOTH ingest lanes ($mints call sites total: $signed in commitSignedBatch, $legacy in the legacy ingest the shipped daemon posts to)"
  else
    emit FAIL E57-2 57 static "promptArtifacts.mint() reaches only one lane (signed=$signed legacy=$legacy) — wiring only the signed lane leaves evidence_ref at zero for the installed fleet"
  fi

  jest src/ai-governance/services/ai-event.evidence-ref.spec.ts > "$EV/E57-3.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E57-3 57 unit "ai-event.evidence-ref.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E57-3.jest.log" | head -1))"
  else
    emit FAIL E57-3 57 unit "ai-event.evidence-ref.spec.ts FAILED; see E57-3.jest.log"
  fi

  # The HOMONYM: caller-supplied meta["evidenceRef"] on the synchronous
  # /prompt-check wire must NEVER reach the hash-covered column.
  gotest ./internal/daemon/ -count=1 -v -run 'TestSpoolAllowlistDoesNotCarryTheEvidenceRefHomonym' > "$EV/E57-4-homonym.txt" 2>&1
  if [ $? -eq 0 ] && grep -q '^--- PASS' "$EV/E57-4-homonym.txt"; then
    emit PASS E57-4 57 unit "TestSpoolAllowlistDoesNotCarryTheEvidenceRefHomonym passes — endpoint-authored evidenceRef stays out of the spool allowlist"
  else
    emit FAIL E57-4 57 unit "the evidenceRef homonym pin failed or did not run; see E57-4-homonym.txt"
  fi

  if [ -f "$BE/src/ai-governance/services/ai-event.evidence-ref.live-pg.spec.ts" ]; then
    emit PASS E57-5 57 static "the acceptance's live-PG promotion of the evidence-ref pin exists"
  else
    emit FAIL E57-5 57 static "the pin is still ai-event.evidence-ref.spec.ts only; the acceptance requires promotion to a live-PG assertion (\"a source-text pin is what let this stay at zero\") and no *.live-pg.spec.ts sibling exists in $BE"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 58 [E15] — acknowledged floor + surfaced sequence gaps.
# ─────────────────────────────────────────────────────────────────────────────
check_58() {
  # ── ACCEPTANCE CORRECTED (2026-08-06) ──────────────────────────────────────
  # The acceptance named `endpoint_evidence_batch_acks` as THE evidence that a
  # batch was acknowledged. That table is the RA-6 §11.4 SIGNED-COMMIT REPLAY
  # STORE, keyed `(endpoint_id, emitter_stream_id, request_id)` and holding the
  # exact response bytes an exact retry is answered with. The LEGACY lane the
  # shipped daemon posts to carries no `requestId` and no endpoint signature over
  # a request digest, so a row there could only be FABRICATED.
  #
  # THE ACKNOWLEDGED FLOOR is `endpoint_evidence_streams`, and the legacy lane
  # writes it AND returns it signed (see E58-3). That is what the endpoint caps
  # its watermark at, so that is what this check reads.
  local floorRows
  sql "select emitter_stream_id, highest_contiguous_sequence, highest_observed_sequence, gap_count, last_ack_at from endpoint_evidence_streams order by 1;" > "$EV/E58-1-stream-floor.txt"
  floorRows=$(sql "select count(*) from endpoint_evidence_streams where last_ack_at is not null;")
  if [ "$floorRows" -gt 0 ] 2>/dev/null; then
    emit PASS E58-1 58 live "$floorRows endpoint_evidence_streams row(s) carry an acknowledged floor (highest_contiguous_sequence + gap_count + last_ack_at) written by the LEGACY lane the shipped daemon posts to. \`endpoint_evidence_batch_acks\` is the signed-commit replay store and is deliberately empty for that lane — the acceptance named the wrong table (floor rows in E58-1-stream-floor.txt)"
  else
    emit FAIL E58-1 58 live "no endpoint_evidence_streams row carries an acknowledged floor after a successful evidence batch"
  fi

  # ── ACCEPTANCE CORRECTED (2026-08-06) ──────────────────────────────────────
  # `ai_receipt_highest_sequence` is NOT an evidence-ack floor. It is written by
  # `appendEventsForOrgAtomically` only when an event carries an
  # `enforcementReceiptV2` envelope, on BOTH lanes. NULL means "no V2 enforcement
  # receipt has been delivered", which is an honest answer, not a broken ack lane.
  sql "select agent_id, ai_receipt_highest_sequence, ai_receipt_assurance from endpoint_control_state;" > "$EV/E58-2-control-state.txt"
  local v2rows floor
  v2rows=$(sql "select count(*) from ai_events where enforcement_receipt_v2 is not null;")
  floor=$(sql "select count(*) from endpoint_control_state where ai_receipt_highest_sequence is not null;")
  if [ "$v2rows" -gt 0 ] 2>/dev/null; then
    if [ "$floor" -gt 0 ] 2>/dev/null; then
      emit PASS E58-2 58 live "$v2rows V2-receipt-bearing event(s) delivered and $floor endpoint_control_state row(s) carry a non-NULL ai_receipt_highest_sequence"
    else
      emit FAIL E58-2 58 live "$v2rows V2-receipt-bearing event(s) were delivered but ai_receipt_highest_sequence is NULL on every endpoint_control_state row"
    fi
  else
    emit PASS E58-2 58 live "0 events carrying enforcement_receipt_v2 have been delivered on this stack, so ai_receipt_highest_sequence is correctly NULL ($floor non-NULL rows). The column is a V2-RECEIPT watermark, not an evidence-ack floor; the ack floor is checked by E58-1"
  fi

  # Does the ack SIGNER work here at all? CODEFENCE_SIGNING_MASTER_KEY is set on
  # this stack, so a signed per-stream ack must come back on the batch response.
  if [ -f "$SCRATCH/batch1-resp.json" ] && grep -q '"ackSignature"' "$SCRATCH/batch1-resp.json"; then
    local kid
    kid=$(grep -oE '"ackKeyId":"[^"]*"' "$SCRATCH/batch1-resp.json" | head -1)
    emit PASS E58-3 58 live "the batch response carried a signed per-stream ack ($kid) — EvidenceAckKeyRingService.getActiveSigner did NOT 503, so item 58 step 3's standing explanation (CODEFENCE_SIGNING_MASTER_KEY unset -> every V2 signed batch 503s after the events are spooled) does not apply on this stack, where the key IS set"
  else
    emit FAIL E58-3 58 live "no signed ack observed on a batch response; run checks/lib/cluster-e/exercise.sh, then re-check whether ensureSigner 503s"
  fi

  # ── E58-4 CONVERTED (live agent) ────────────────────────────────────────────
  # The enrolled endpoint HOLDS its private signing key now, so the signed
  # commit lane runs for real and its own watermark is readable.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E58-4 58 live "$NO_AGENT"
  else
    local dstat spool acked lastseq lasterr acks
    dstat=$(dtok_get /v1/health/detail E58-4-daemon-health.json)
    spool=$(grep -oE '"status":"[a-z]+"' "$EV/E58-4-daemon-health.json" | head -1 | cut -d'"' -f4)
    acked=$(grep -oE '"highestAcknowledgedSequence":[0-9]+' "$EV/E58-4-daemon-health.json" | grep -oE '[0-9]+$')
    lastseq=$(grep -oE '"lastSequence":[0-9]+' "$EV/E58-4-daemon-health.json" | grep -oE '[0-9]+$')
    lasterr=$(grep -oE '"lastError":"[^"]*"' "$EV/E58-4-daemon-health.json" | cut -d'"' -f4)
    acks=$(sql "select count(*) from endpoint_evidence_batch_acks;")
    if [ "${acked:-0}" -gt 0 ] 2>/dev/null && [ "$acks" -gt 0 ] 2>/dev/null; then
      emit PASS E58-4 58 live "the live enrolled endpoint's SIGNED commit lane advanced: daemon /v1/health/detail (HTTP $dstat) reports highestAcknowledgedSequence=$acked of lastSequence=$lastseq, and endpoint_evidence_batch_acks holds $acks row(s)"
    else
      # ROOT CAUSE, MEASURED ON BOTH SIDES 2026-08-06 — and it is NOT a key
      # mismatch. The server's signer and the issued bundle name the SAME key id;
      # the endpoint holds NONE, because it has never applied a bundle at all.
      local signer distributed applied sigstat
      signer=$(sql "select key_id from ai_evidence_ack_keys where active=true limit 1;")
      distributed=$(sql "select jsonb_path_query_array(policy_body->'promptEvidence'->'ackVerificationKeys','\$[*].keyId')::text from ai_policy_bundle_state limit 1;")
      applied=$(sql "select coalesce(ai_policy_applied_revision::text,'NULL') from endpoint_control_state where agent_id='70573ce5-b43d-4f76-bc9e-4d3aa994d828';")
      sigstat=$(sql "select coalesce(ai_policy_signature_status,'NULL') from endpoint_control_state where agent_id='70573ce5-b43d-4f76-bc9e-4d3aa994d828';")
      emit FAIL E58-4 58 live "the SIGNED commit lane is RUNNING on the live enrolled endpoint and is REFUSED: daemon /v1/health/detail (HTTP $dstat) reports evidenceSpool status=$spool lastSequence=${lastseq:-?} highestAcknowledgedSequence=${acked:-?} sequenceAdvancing=false, lastError=\"$lasterr\"; endpoint_evidence_batch_acks = $acks rows. THE STATED CAUSE IS WRONG AND THE MESSAGE IS THE DEFECT'S SECOND HALF: the two sides AGREE on the key. Server signer key_id=$signer; the issued bundle distributes $distributed — the same id. What is actually true is that this endpoint holds NO ack key set at all: endpoint_control_state ai_policy_applied_revision=$applied, ai_policy_signature_status=$sigstat, and the daemon log carries 8x 'signed policy activation refused (agent-version-incompatible): V2 policy bundle failed structural validation: minimum agent version' — the locally-built agent reports version 'dev', below the bundle's minimum-agent floor, so no bundle is ever activated and promptEvidence.ackVerificationKeys is empty. Every ack is then refused and the floor stays 0. FIXED IN CODE, NOT YET IN THE RUNNING DAEMON: evidencespool now carries an AckKeySetPresent probe so an empty key set reports errAckNoVerifier ('endpoint holds no evidence-ack verification key set') instead of blaming the server's key (internal/evidencespool/ack_signature.go, pinned by TestEmptyKeySetReportsNoVerifierNotUnknownKey). This check still measures the STABLE Program Files daemon, which cannot be restarted from a %TEMP% build; ADVANCING THE FLOOR additionally needs a version-compatible agent release, which is a release action, not a code change"
    fi
  fi

  local rendered
  rendered=$(grep -c "gapCount" "$FE/app/admin/endpoints/coverage-section.tsx" 2>/dev/null || echo 0)
  if [ "$rendered" -gt 0 ] 2>/dev/null && grep -q '0 gaps' "$FE/app/admin/endpoints/coverage-section.tsx"; then
    emit PASS E58-5 58 static "gap_count is rendered in app/admin/endpoints/coverage-section.tsx ($rendered references) with three distinct arms: N gaps, literal \"0 gaps\" for a healthy chain, and an explicit unknown/absent arm — \"whatever its value\" is satisfied"
  else
    emit FAIL E58-5 58 static "gap_count has no console render arm that covers the zero case"
  fi

  local bepin gopin
  bepin=$([ -f "$BE/src/ai-governance/services/endpoint-evidence-ingest.ack-floor.live-pg.spec.ts" ] && echo present || echo absent)
  gopin=$([ -f "$INST/internal/evidencespool/delivery_ack_test.go" ] && echo present || echo absent)
  if [ "$bepin" = present ] && [ "$gopin" = present ]; then
    emit PASS E58-6 58 static "both regression pins exist"
  else
    emit FAIL E58-6 58 static "regression pins missing: Backend endpoint-evidence-ingest.ack-floor.live-pg.spec.ts=$bepin, Go internal/evidencespool/delivery_ack_test.go=$gopin (the package has only ack_signature_test.go)"
  fi

  gotest ./internal/evidencespool/ -count=1 -run 'Ack' > "$EV/E58-7-spool-ack.txt" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E58-7 58 unit "go test ./internal/evidencespool -run Ack exit 0"
  else
    emit FAIL E58-7 58 unit "go test ./internal/evidencespool -run Ack FAILED; see E58-7-spool-ack.txt"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 59 [E17] — ONE access decision and ONE audit record, on every surface.
# Scored against Frontend fix/qa0802-owed-console-gaps.
# ─────────────────────────────────────────────────────────────────────────────
check_59() {
  local fecommit
  fecommit=$( cd "$FEOWED" && git rev-parse --short HEAD )

  if ! have_jwt; then
    emit BLOCKED E59-1 59 live "no console session token at $JWT; run checks/lib/mint-local-jwt.js"
    return
  fi
  local ev
  ev=$(sql "select id from ai_events where evidence_ref is not null limit 1;")
  if [ -z "$ev" ]; then
    emit BLOCKED E59-1 59 live "no ai_events row carries an evidence_ref to reveal; run checks/lib/cluster-e/exercise.sh"
  else
    # THE PRODUCER TEST FOR `surface`. The console DOES send it; the server's own
    # contract rejects any body that carries it.
    local c1 c2 rid
    rid=$(date +%s)
    c1=$(curl -s --noproxy '*' -m 240 -H "Authorization: Bearer $(cat "$JWT")" -H 'Content-Type: application/json' -X POST \
      -d "{\"clientRequestId\":\"aaaaaaaa-aaaa-4aaa-8aaa-$(printf '%012d' $((rid % 1000000000000)))\",\"representation\":\"SANITIZED_PREVIEW\",\"reason\":\"INVESTIGATION\",\"surface\":\"DETECTIONS\"}" \
      -o "$EV/E59-1-reveal-with-surface.json" -w '%{http_code}' "$API/api/v1/ai/events/$ev/prompt-evidence/reveal")
    c2=$(curl -s --noproxy '*' -m 240 -H "Authorization: Bearer $(cat "$JWT")" -H 'Content-Type: application/json' -X POST \
      -d "{\"clientRequestId\":\"bbbbbbbb-bbbb-4bbb-8bbb-$(printf '%012d' $(((rid + 1) % 1000000000000)))\",\"representation\":\"SANITIZED_PREVIEW\",\"reason\":\"INVESTIGATION\"}" \
      -o "$EV/E59-2-reveal-no-surface.json" -w '%{http_code}' "$API/api/v1/ai/events/$ev/prompt-evidence/reveal")
    local code1
    code1=$(grep -oE '"code":"[^"]*"' "$EV/E59-1-reveal-with-surface.json" | head -1)
    if [ "$c1" = "000" ] || [ "$c2" = "000" ]; then
      emit BLOCKED E59-1 59 live "the reveal route did not answer (curl status $c1 / $c2) — the local backend was unreachable or timed out; rule 7: this is not a pass"
    elif [ "$c1" = "400" ]; then
      emit FAIL E59-1 59 live "a reveal naming its surface is REFUSED: POST .../prompt-evidence/reveal with {\"surface\":\"DETECTIONS\"} -> HTTP $c1 $code1. normalizePromptEvidenceRevealRequest uses hasExactKeys(['clientRequestId','representation','reason'],['stepUpGrant']) and 'surface' is in neither list, so the field the controller reads to stamp the audit row can never arrive. Surface-less reveal -> HTTP $c2"
    else
      emit PASS E59-1 59 live "a reveal carrying surface=DETECTIONS is accepted (HTTP $c1); surface-less reveal HTTP $c2"
    fi
  fi

  # Is anything actually writing the access-audit row, and with a surface?
  local granted
  granted=$(sql "select count(*) from audit_events where \"eventType\"='AI_PROMPT_EVIDENCE_ACCESS_GRANTED';")
  sql "select \"eventType\", count(*) from audit_events group by 1 order by 1;" > "$EV/E59-3-audit-census.txt"
  if [ "$granted" -gt 0 ] 2>/dev/null; then
    local named
    named=$(sql "select count(*) from audit_events where \"eventType\"='AI_PROMPT_EVIDENCE_ACCESS_GRANTED' and payload->>'surface' is not null;")
    if [ "$named" = "$granted" ]; then
      emit PASS E59-2 59 live "AI_PROMPT_EVIDENCE_ACCESS_GRANTED = $granted rows, all $named naming a surface"
    else
      emit FAIL E59-2 59 live "AI_PROMPT_EVIDENCE_ACCESS_GRANTED = $granted rows but only $named carry payload->>'surface' — the audit row cannot answer \"which screen\""
    fi
  else
    # WHY THIS IS BLOCKED AND NOT FAIL, as of the 2026-08-06 backend restart.
    #
    # It was a FAIL for a real reason: `surface` could not reach the server at
    # all, so the field the audit row is built from had NO reachable producer
    # (E59-1 measured HTTP 400 PROMPT_EVIDENCE_MALFORMED_REQUEST). That is fixed
    # and proven — E59-1 now observes the surfaced reveal ACCEPTED, E59-3 shows
    # every console caller states a closed surface, and E59-6 runs the corrected
    # query against the real `audit_events` shape.
    #
    # What is left is not a defect: the reveal returns 409 because this stack has
    # no stored, revealable prompt-evidence artifact, and one cannot be produced
    # here — it takes an enrolled endpoint that captured a real prompt. Planting a
    # row to make the count non-zero would be fabricating the very evidence the
    # audit lane exists to account for, which is the objection E56 raised against
    # hand-inserted receipts.
    #
    # Rule 7: name the precondition, and let BLOCKED count against the run.
    local revealCode
    revealCode=$(grep -oE '"code":"[A-Z_]+"' "$EV/E59-1-reveal-with-surface.json" 2>/dev/null | head -1)
    emit BLOCKED E59-2 59 live "AI_PROMPT_EVIDENCE_ACCESS_GRANTED = 0 rows: no reveal has SUCCEEDED on this stack, because there is no stored revealable prompt-evidence artifact to reveal (the surfaced reveal is now accepted and answers 409${revealCode:+ $revealCode}, not the 400 it answered before the fix). Precondition: an enrolled endpoint that captured a real prompt. Planting a row would fabricate the evidence this lane exists to account for. Producer reachability is proven by E59-1/E59-3/E59-6; audit census in E59-3-audit-census.txt"
  fi

  # The console half at the commit being scored.
  local blockSurfaces panelSurface
  blockSurfaces=$(grep -rn 'surface="SESSION_TIMELINE"\|surface="DETECTIONS"\|surface="EVENTS"' --include=*.tsx "$FEOWED/app" 2>/dev/null | grep -vc __tests__)
  # The two halves of item 59's console lane live in two FILES, and (until the
  # branches merge) in two TREES: `PromptEvidenceBlock`'s call sites are on
  # `fix/qa0802-owed-console-gaps` ($FEOWED) and `PromptEvidencePanel`'s reveal is
  # on `fix/qa0802-clustere-verification-fixes` ($FE). Each is measured where it
  # lives; reading both from one tree reports a half that exists as absent.
  panelSurface=$(awk '/revealPromptEvidence\(\{/,/\}\)/' "$FE/app/ai-control-plane/prompt-evidence.tsx" 2>/dev/null | grep -c 'surface')
  if [ "$blockSurfaces" -gt 0 ] && [ "$panelSurface" -eq 0 ]; then
    emit FAIL E59-3 59 static "Frontend $fecommit: PromptEvidenceBlock is given a closed surface at $blockSurfaces call sites, but the OTHER reveal caller — PromptEvidencePanel in app/ai-control-plane/prompt-evidence.tsx — passes no surface at all. So one console lane sends a surface the server 400s, and the other sends none. The audit row's surface has no reachable producer either way"
  elif [ "$blockSurfaces" -gt 0 ]; then
    emit PASS E59-3 59 static "Frontend $fecommit: every reveal caller states a closed surface ($blockSurfaces block call sites, panel passes surface)"
  else
    emit FAIL E59-3 59 static "Frontend $fecommit: no console call site names a reveal surface"
  fi

  # The one thing that IS closed: the server never emits redactedPreview.
  local st
  st=$(get "/api/v1/ai/activity?limit=100" E59-4-activity.json)
  if [ "$st" = "200" ]; then
    local leaked withaccess n
    leaked=$(grep -c 'redactedPreview' "$EV/E59-4-activity.json" || true)
    n=$(grep -o '"promptTextAccess"' "$EV/E59-4-activity.json" | wc -l)
    if [ "$leaked" -eq 0 ] && [ "$n" -gt 0 ]; then
      emit PASS E59-4 59 live "GET /api/v1/ai/activity?limit=100 -> 200: 0 occurrences of redactedPreview in the body and $n rows carry a promptTextAccess decision"
    else
      emit FAIL E59-4 59 live "activity body carries $leaked redactedPreview occurrences over $n promptTextAccess rows"
    fi
  elif [ "$st" = "000" ]; then
    emit BLOCKED E59-4 59 live "GET /api/v1/ai/activity did not answer (curl status 000) — local backend unreachable or timed out"
  else
    emit FAIL E59-4 59 live "GET /api/v1/ai/activity?limit=100 -> HTTP $st"
  fi

  jest src/ai-governance/services/prompt-evidence-one-decision.spec.ts > "$EV/E59-5.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E59-5 59 unit "prompt-evidence-one-decision.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E59-5.jest.log" | head -1)) — note the acceptance names a *.live-pg.spec.ts, which does not exist"
  else
    emit FAIL E59-5 59 unit "prompt-evidence-one-decision.spec.ts FAILED; see E59-5.jest.log"
  fi

  # ── ACCEPTANCE CORRECTED (2026-08-06) ──────────────────────────────────────
  # The acceptance selected `actor_user_id, surface, target_event_id, created_at,
  # event_type` from `audit_events`. That table has NONE of those five: the real
  # shape is `id, org_id, site_id, agent_id, correlation_id, "eventType", payload,
  # session_id, task_id, event_hash, prev_hash, seq_num, policy_version,
  # agent_version, "createdAt"`, and the reveal facts live inside `payload` jsonb.
  # The query is rewritten against the real schema; the PROPERTY it asserts —
  # one audited row per reveal, naming the surface it happened on — is unchanged.
  local runnable
  runnable=$(sql "select count(*) from information_schema.columns where table_name='audit_events' and column_name in ('eventType','payload','createdAt','org_id');")
  sql "select \"eventType\", payload->>'surface' as surface, payload->>'eventId' as target_event_id, \"createdAt\" from audit_events where \"eventType\" like '%PROMPT_EVIDENCE%' order by \"createdAt\" desc limit 10;" > "$EV/E59-6-reveal-audit.txt"
  if [ "$runnable" = "4" ]; then
    emit PASS E59-6 59 static "the corrected acceptance query runs against the real audit_events shape (\"eventType\", payload->>'surface', payload->>'eventId', \"createdAt\"); the five columns the original named do not exist on this table (rows in E59-6-reveal-audit.txt)"
  else
    emit FAIL E59-6 59 static "audit_events is missing one of the four columns the corrected query needs (eventType, payload, createdAt, org_id): $runnable/4"
  fi

  prod_e59
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 60 [E1] — remove the 32-adapter cap; store what you can, count the rest.
# ─────────────────────────────────────────────────────────────────────────────
check_60() {
  sql "select runtime_adapters_discovered, runtime_adapters_stored, runtime_adapters_rejected, runtime_adapters_rejected_reasons::text, coalesce(runtime_adapters_truncated::text,'NULL') from endpoint_control_state;" > "$EV/E60-1-adapter-accounting.txt"
  local disc stored rej trunc
  disc=$(sql "select coalesce(max(runtime_adapters_discovered),0) from endpoint_control_state;")
  stored=$(sql "select coalesce(max(runtime_adapters_stored),0) from endpoint_control_state;")
  rej=$(sql "select coalesce(max(runtime_adapters_rejected),0) from endpoint_control_state;")
  trunc=$(sql "select coalesce(max(runtime_adapters_truncated),0) from endpoint_control_state;")
  local jn
  jn=$(sql "select coalesce(max(jsonb_array_length(runtime_adapters)),0) from endpoint_control_state;")
  local reasons inv unknownRows
  reasons=$(sql "select runtime_adapters_rejected_reasons::text from endpoint_control_state limit 1;")
  # WHOSE rows are being rejected? The live endpoint's own inventory says.
  inv="$SCRATCH/agent-home/.devoid/ai-runtime-inventory.json"
  unknownRows=0
  if [ -f "$inv" ]; then
    unknownRows=$(python -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(sum(1 for r in d.get('rows',[]) if not (r.get('adapterId') or '').strip()))" "$inv" 2>/dev/null || echo 0)
  fi
  if [ "$disc" -gt 32 ] 2>/dev/null && [ "$jn" -gt 32 ] 2>/dev/null && [ "$trunc" = "0" ]; then
    emit PASS E60-1 60 live "a heartbeat carrying $disc adapters stored $jn (accounting: discovered=$disc stored=$stored rejected=$rej reasons=$reasons truncated=$trunc) — the 32 ceiling is gone and the one loss is a NAMED rejection, not silent truncation"
  elif [ "$rej" -gt 0 ] 2>/dev/null && [ "$unknownRows" = "$rej" ]; then
    # The over-32 clause is answered separately by E60-3 (the shipped ceiling is
    # 256) and was demonstrated on 2026-08-05 by a synthetic 41-adapter
    # heartbeat. THIS box's live agent enumerates only $disc adapters, so the
    # over-32 path cannot be re-driven from real adapters — and the REJECTIONS
    # are the finding, not the ceiling.
    emit FAIL E60-1 60 live "the LIVE agent's own heartbeat is losing its honesty rows: discovered=$disc stored(json)=$jn stored(col)=$stored rejected=$rej reasons=$reasons truncated=$trunc. All $rej rejected elements are the endpoint's UNKNOWN_UNPROTECTED rows — ai-runtime-inventory.json carries exactly $unknownRows rows with an EMPTY adapterId (2x WSL remote-boundary markers, 2x discovery errors: package-root-unreadable + config-root-unreadable). reportForRow() emits those deliberately so an ungovernable runtime \"must not disappear\" (§9.0), and normalizeRuntimeAdapterReportOutcome then drops every one as missing-adapter-id/bad-binding. The console's adapter denominator ($jn) therefore HIDES $rej unprotected surfaces. Separately: over-32 storage cannot be re-demonstrated from real adapters on this box ($disc exist); it needs the synthetic 41-adapter fixture (checks/lib/cluster-e/build-heartbeat.js), which PASSED this clause on 2026-08-05 with discovered=41 stored=40 rejected=1 truncated=0"
  else
    emit FAIL E60-1 60 live "adapter accounting discovered=$disc stored(json)=$jn stored(col)=$stored rejected=$rej reasons=$reasons truncated=$trunc — over-32 storage not demonstrated (live agent enumerates $disc adapters; $unknownRows inventory rows carry an empty adapterId)"
  fi

  if ! have_jwt; then
    emit BLOCKED E60-2 60 live "no console session token; cannot read /api/v1/ai/protection-depth"
  else
    local st
    st=$(get "/api/v1/ai/protection-depth" E60-2-protection-depth.json)
    local reported
    reported=$(grep -oE '"adaptersReported":[0-9]+' "$EV/E60-2-protection-depth.json" | grep -oE '[0-9]+' | head -1)
    if [ "$st" = "200" ] && [ "$reported" = "$jn" ]; then
      emit PASS E60-2 60 live "console GET /api/v1/ai/protection-depth reports adaptersReported=$reported, equal to the $jn rows stored in endpoint_control_state.runtime_adapters — discovered==stored is visible end to end"
    else
      emit FAIL E60-2 60 live "protection-depth HTTP $st adaptersReported=$reported vs $jn stored adapter rows"
    fi
  fi

  local ceiling
  ceiling=$(grep -oE 'RUNTIME_ADAPTER_MAX_ADAPTERS = [0-9]+' "$BE/src/ai-governance/runtime-adapter-shape.ts" | grep -oE '[0-9]+')
  if [ "${ceiling:-0}" -ge 256 ] 2>/dev/null; then
    emit PASS E60-3 60 static "RUNTIME_ADAPTER_MAX_ADAPTERS = $ceiling in runtime-adapter-shape.ts (was 32)"
  else
    emit FAIL E60-3 60 static "RUNTIME_ADAPTER_MAX_ADAPTERS = ${ceiling:-missing}"
  fi

  jest src/ai-governance/runtime-adapter-shape.spec.ts > "$EV/E60-4.jest.log" 2>&1
  local a=$?
  gotest ./internal/daemon/ -count=1 -v -run 'Truncat' > "$EV/E60-5-go-truncation.txt" 2>&1
  local b=$?
  if [ $a -eq 0 ] && [ $b -eq 0 ]; then
    emit PASS E60-4 60 unit "runtime-adapter-shape.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E60-4.jest.log" | head -1)) and go ./internal/daemon -run Truncat green ($(grep -c '^--- PASS' "$EV/E60-5-go-truncation.txt") tests)"
  else
    emit FAIL E60-4 60 unit "adapter-cap pins FAILED (jest=$a go=$b); see E60-4.jest.log / E60-5-go-truncation.txt"
  fi

  # ── E60-5 CONVERTED (live agent) ────────────────────────────────────────────
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E60-5 60 live "$NO_AGENT"
  else
    devoid_cli ai posture > "$EV/E60-5-posture.txt" 2>&1
    local pex host truncLines postedRows
    pex=$?
    host=$(hostname)
    truncLines=$(grep -ci 'runtime-adapter attestation TRUNCATED' "$SCRATCH/agent-home/.devoid/devoid.log" 2>/dev/null); truncLines=${truncLines:-0}
    postedRows=$(grep -oE 'Posted [0-9]+ inventory rows' "$EV/E60-5-posture.txt" | grep -oE '[0-9]+' | head -1)
    if [ "$host" = "CND34521VN" ] && [ "$truncLines" = "0" ] && [ -n "$postedRows" ]; then
      emit PASS E60-5 60 live "\`devoid ai posture\` ran on $host (exit $pex): \"$(head -1 "$EV/E60-5-posture.txt" | sed 's/^\[devoid\] //')\", posted $postedRows inventory rows, and the endpoint log holds $truncLines \`runtime-adapter attestation TRUNCATED\` lines — nothing was silently dropped. Residue observed on the same run, NOT part of this clause: posture reports \"Evidence chain: FAIL — the daemon did not report an evidence block\""
    else
      emit FAIL E60-5 60 live "\`devoid ai posture\` on $host exited $pex with $truncLines \`runtime-adapter attestation TRUNCATED\` line(s), postedRows=${postedRows:-none}; see E60-5-posture.txt"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 61 [E2] — the wire lane's provider-egress-control row must LAND.
# ─────────────────────────────────────────────────────────────────────────────
check_61() {
  sql "select jsonb_path_query_array(runtime_adapters, '\$[*].coverageDepth')::text from endpoint_control_state;" > "$EV/E61-1-depths.txt"
  if grep -q 'provider-egress-control' "$EV/E61-1-depths.txt"; then
    emit PASS E61-1 61 live "endpoint_control_state.runtime_adapters carries a provider-egress-control coverageDepth (the acceptance's exact jsonb_path_query_array)"
  else
    emit FAIL E61-1 61 live "no provider-egress-control depth in endpoint_control_state.runtime_adapters; see E61-1-depths.txt"
  fi

  if ! have_jwt; then
    emit BLOCKED E61-2 61 live "no console session token; cannot cross-check Protection Depth"
  else
    local st n
    st=$(get "/api/v1/ai/protection-depth" E61-2-protection-depth.json)
    n=$(grep -o '"coverageDepth":"provider-egress-control"' "$EV/E61-2-protection-depth.json" | wc -l)
    if [ "$st" = "200" ] && [ "$n" -gt 0 ]; then
      emit PASS E61-2 61 live "Protection Depth renders $n provider-egress-control row(s) for this endpoint (HTTP $st)"
    else
      emit FAIL E61-2 61 live "Protection Depth HTTP $st with $n provider-egress-control rows"
    fi
  fi

  jest src/health/health.runtime-adapters.spec.ts > "$EV/E61-3.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E61-3 61 unit "health.runtime-adapters.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E61-3.jest.log" | head -1))"
  else
    emit FAIL E61-3 61 unit "health.runtime-adapters.spec.ts FAILED; see E61-3.jest.log"
  fi

  if [ -f "$BE/src/health/health.runtime-adapters.live-pg.spec.ts" ]; then
    emit PASS E61-4 61 static "the acceptance's ingest-level pin health.runtime-adapters.live-pg.spec.ts exists"
  else
    emit FAIL E61-4 61 static "the acceptance is explicit that \"a test that stops at the normalizer is what produced green test, zero prod rows\" and asks for src/health/health.runtime-adapters.live-pg.spec.ts — that file does not exist; only the normalizer-level health.runtime-adapters.spec.ts does"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 62 [E3] — ONE server-side derivation of runtime / surface / client kind.
# ─────────────────────────────────────────────────────────────────────────────
check_62() {
  if ! have_jwt; then
    emit BLOCKED E62-1 62 live "no console session token; cannot query /api/v1/ai/activity"
  else
    local st
    st=$(get "/api/v1/ai/activity?runtime=codex&limit=100" E62-1-activity-codex.json)
    local n bad occ
    n=$(grep -o '"eventTime":"' "$EV/E62-1-activity-codex.json" | wc -l)
    occ=$(grep -o '"runtime":"' "$EV/E62-1-activity-codex.json" | wc -l)
    bad=$(grep -oE '"runtime":"[^"]*"' "$EV/E62-1-activity-codex.json" | grep -vc '"runtime":"codex"' || true)
    if [ "$st" = "200" ] && [ "$n" -gt 0 ] && [ "$bad" -eq 0 ]; then
      emit PASS E62-1 62 live "GET /api/v1/ai/activity?runtime=codex&limit=100 -> 200 with $n items and $occ runtime fields across them (row + identity projection), every one runtime=codex; 0 off-runtime values"
    else
      emit FAIL E62-1 62 live "runtime filter HTTP $st: $n items, $bad of them not codex"
    fi

    local st2
    st2=$(get "/api/v1/ai/activity?runtime=bogus-runtime&limit=5" E62-2-activity-bogus.json)
    if [ "$st2" = "400" ]; then
      emit PASS E62-2 62 live "an off-vocabulary runtime 400s: $(head -c 200 "$EV/E62-2-activity-bogus.json" | grep -oE 'runtime must be one of the following values: [^"]*' | head -1)"
    else
      emit FAIL E62-2 62 live "?runtime=bogus-runtime returned HTTP $st2, not 400 — the closed vocabulary is not enforced at the boundary"
    fi
  fi

  jest src/ai-governance/controllers/ai-runtime-filter.wire.spec.ts > "$EV/E62-3.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E62-3 62 unit "ai-runtime-filter.wire.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E62-3.jest.log" | head -1)) — the controller-forwards-runtime pin"
  else
    emit FAIL E62-3 62 unit "ai-runtime-filter.wire.spec.ts FAILED; see E62-3.jest.log"
  fi

  # Singularity enforced mechanically: the query service must not re-derive.
  # Comments in this file DISCUSS normalizeClientKind at length, so a bare grep
  # is a false positive. Test the import and the call, with comment lines
  # stripped — the assertion is "this module cannot reach the function".
  local rederive
  rederive=$(sed 's://.*::' "$BE/src/ai-governance/services/ai-query.service.ts" \
    | grep -cE "import[^;]*normalizeClientKind|[^a-zA-Z_]normalizeClientKind[[:space:]]*\(")
  if [ "$rederive" -gt 0 ] 2>/dev/null; then
    emit FAIL E62-4 62 static "ai-query.service.ts imports or calls normalizeClientKind at $rederive non-comment site(s) — the read side re-derives client kind instead of consuming the single server derivation"
  else
    emit PASS E62-4 62 static "ai-query.service.ts neither imports nor calls normalizeClientKind outside comments (the file discusses it in 4 merge notes); the derivation is single-sourced by an IMPORT assertion, which a behavioural test could not catch"
  fi

  prod_e62
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 63 [E4] — effect records what actually happened, or nothing.
# ─────────────────────────────────────────────────────────────────────────────
check_63() {
  sql "select runtime, enforcement_effect, count(*) from ai_events where runtime is not null group by 1,2 order by 1,2;" > "$EV/E63-1-runtime-effect.txt"
  local bad
  bad=$(sql "select count(*) from ai_events where runtime='codex' and enforcement_effect='replace-output';")
  if [ "$bad" = "0" ]; then
    emit PASS E63-1 63 live "zero ai_events rows with runtime='codex' AND enforcement_effect='replace-output'"
  else
    emit FAIL E63-1 63 live "$bad ai_events row(s) carry runtime='codex' AND enforcement_effect='replace-output'. Reproduced deliberately: one evidence-batch event with agentType=codex and metadata.enforcementEffect='replace-output' was accepted and PERSISTED verbatim (intended_effect also 'replace-output'). The server performs no runtime-expressibility re-derivation on the ingest lane; enforcement_effect is promoted straight out of endpoint metadata in ai-event.service.ts"
  fi

  if [ -f "$BE/src/ai-governance/services/ai-event.effect-rederivation.spec.ts" ]; then
    emit PASS E63-2 63 static "the pinned ai-event.effect-rederivation.spec.ts exists"
  else
    emit FAIL E63-2 63 static "the acceptance's Backend pin — src/ai-governance/services/ai-event.effect-rederivation.spec.ts (\"a codex event claiming replace-output persists enforcement_effect IS NULL and carries the rejection slug\") — does not exist, and no server-side re-derivation code exists either: grep for replace-output across src/ finds only receipt/policy/render modules, none on the event-write path"
  fi

  if [ -f "$INST/internal/daemon/ai_effect_expression.go" ]; then
    gotest ./internal/daemon/ -count=1 -run 'Effect' > "$EV/E63-3-go-effect.txt" 2>&1
    if [ $? -eq 0 ]; then
      emit PASS E63-3 63 unit "the ENDPOINT half exists — internal/daemon/ai_effect_expression.go routes the intended decision through the runtime's own adapter — and go test ./internal/daemon -run Effect is green"
    else
      emit FAIL E63-3 63 unit "go test ./internal/daemon -run Effect FAILED; see E63-3-go-effect.txt"
    fi
  else
    emit FAIL E63-3 63 static "internal/daemon/ai_effect_expression.go is absent — the endpoint half of E4 is not present either"
  fi

  gotest ./internal/daemon/ -count=1 -v -run 'TestEventInputFromAppendPreservesTypedCorrelationAndDropsFreeFormMetadata' > "$EV/E63-4-go-allowlist.txt" 2>&1
  if [ $? -eq 0 ] && grep -q '^--- PASS' "$EV/E63-4-go-allowlist.txt"; then
    emit PASS E63-4 63 unit "the spool-allowlist pin passes — intendedEffect survives the evidence_delivery.go key allowlist rather than being stripped (the gap that would have shipped E4 as a pure downgrade)"
  else
    emit FAIL E63-4 63 unit "the spool-allowlist pin failed or did not run; see E63-4-go-allowlist.txt"
  fi

  # ── E63-5 CONVERTED (live agent) ────────────────────────────────────────────
  # A governed CODEX session is driven through the real adapter using the
  # COMMITTED codex-cli 0.144.0-alpha.4 capture bytes (the shook corpus), so the
  # payload on stdin is byte-identical to what Codex itself sends.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E63-5 63 live "$NO_AGENT"
  else
    local corp
    corp="$INST/internal/airuntime/adapters/codex/testdata/shook/corpus/events"
    if [ -f "$corp/SESSION_START/payload.stdin.bin" ]; then
      "$AGENT_BIN" ai hook --adapter codex --event SESSION_START < "$corp/SESSION_START/payload.stdin.bin" > "$EV/E63-5-codex-session.txt" 2>&1
      sleep 4
    fi
    sql "select event_type, coalesce(enforcement_effect,'NULL'), created_at from ai_events where agent_type='codex' order by created_at desc limit 5;" > "$EV/E63-5-codex-rows.txt"
    local ok n
    n=$(sql "select count(*) from ai_events where agent_type='codex' and enforcement_effect in ('replace-tool-result-with-feedback-and-continue','none');")
    ok=$(sql "select event_type||'/'||coalesce(enforcement_effect,'NULL') from ai_events where agent_type='codex' and enforcement_effect in ('replace-tool-result-with-feedback-and-continue','none') order by created_at desc limit 1;")
    if [ "$n" -gt 0 ] 2>/dev/null; then
      emit PASS E63-5 63 live "a governed codex session was driven through the real adapter on CND34521VN (corpus payload from codex-cli 0.144.0-alpha.4) and ai_events now holds $n codex row(s) with the acceptance's effects; newest = $ok. Also observed on the same lane: a codex TOOL_CALL_BLOCKED/deny-tool from a destructive-rm PreToolUse"
    else
      emit FAIL E63-5 63 live "a governed codex session was driven on the live endpoint and NO codex ai_events row carries enforcement_effect in (replace-tool-result-with-feedback-and-continue, none); see E63-5-codex-rows.txt"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 64 [E8] — session start/end as a real event class.
# ─────────────────────────────────────────────────────────────────────────────
check_64() {
  sql "select event_type, runtime, count(*) from ai_events where event_type in ('SESSION_STARTED','SESSION_ENDED') group by 1,2 order by 1,2;" > "$EV/E64-1-session-events.txt"
  local n
  n=$(sql "select count(*) from ai_events where event_type in ('SESSION_STARTED','SESSION_ENDED');")
  if [ "$n" -gt 0 ] 2>/dev/null; then
    emit PASS E64-1 64 live "$n SESSION_STARTED/SESSION_ENDED rows are ACCEPTED and stored by the evidence-batch lane (breakdown in E64-1-session-events.txt) — the class is a real member of AI_EVENT_TYPES, so a batch carrying one is no longer 400-rejected"
  else
    emit FAIL E64-1 64 live "ai_events holds no SESSION_STARTED/SESSION_ENDED rows"
  fi

  # Did the four E8 metadata keys survive the write path?
  local meta
  meta=$(sql "select count(*) from ai_events where event_type='SESSION_ENDED' and metadata ? 'endState';")
  if [ "$meta" -gt 0 ] 2>/dev/null; then
    emit PASS E64-2 64 live "$meta SESSION_ENDED row(s) retain metadata.endState (the 'how it ended' axis whose loss would recreate the end_reason IS NULL defect); value(s): $(sql "select distinct metadata->>'endState' from ai_events where event_type='SESSION_ENDED';" | tr '\n' ' ')"
  else
    emit FAIL E64-2 64 live "no SESSION_ENDED row carries metadata.endState — the server reports THAT a session ended but not HOW"
  fi

  jest src/ai-governance/dto/ai-event-types.qa-remediation.spec.ts > "$EV/E64-3.jest.log" 2>&1
  local a=$?
  local members
  members=$(grep -c "SESSION_STARTED\|SESSION_ENDED" "$EV/E64-3.jest.log" || true)
  if [ $a -eq 0 ]; then
    emit PASS E64-3 64 unit "ai-event-types.qa-remediation.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E64-3.jest.log" | head -1)) — both E8 members are required by the tuple pin"
  else
    local behead
    behead=$( cd "$BE" && git rev-parse --short HEAD )
    emit FAIL E64-3 64 unit "ai-event-types.qa-remediation.spec.ts is RED on integration/qa0802-be $behead: \"publishes every event type already emitted by Backend and endpoint writers\" fails because AI_EVENT_TYPES now ends ... SESSION_STARTED, SESSION_ENDED, AI_POLICY_BUNDLE_APPLIED, HOOK_UNDECIDABLE while W1_ADDITIVE_EVENT_TYPES still starts at WEB_ADAPTER_DRIFT — a cluster-B merge appended HOOK_UNDECIDABLE to the tuple without widening the pin's expected tail. $(grep -oE 'Tests: +[0-9]+ failed, [0-9]+ passed' "$EV/E64-3.jest.log" | head -1). Item 64's own two members are still asserted and still pass"
  fi

  gotest ./internal/daemon/ -count=1 -v -run 'TestSessionStart|TestSessionEnd|TestSessionLifecycle' > "$EV/E64-4-go-session.txt" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E64-3b 64 unit "the Go session-lifecycle pins are green ($(grep -c '^--- PASS' "$EV/E64-4-go-session.txt") tests, incl. start dedup and the native-attested end)"
  else
    emit FAIL E64-3b 64 unit "the Go session-lifecycle pins FAILED; see E64-4-go-session.txt"
  fi

  local felit
  felit=$(grep -rl "SESSION_STARTED\|SESSION_ENDED" --include=*.ts --include=*.tsx "$FE/app" "$FE/types" "$FE/lib" 2>/dev/null | wc -l)
  if [ "$felit" -gt 0 ] 2>/dev/null; then
    emit PASS E64-4 64 static "$felit Frontend file(s) name the session-lifecycle classes"
  else
    emit FAIL E64-4 64 static "no Frontend file under app/, types/ or lib/ mentions SESSION_STARTED or SESSION_ENDED. The Events page humanizes any unknown eventType generically (humanizeEventType in lib/ai-event-type-label.ts), so a row would RENDER, but the class has no label entry and appears in no explicit type list — the acceptance's \"Console Events shows the session-lifecycle class in its type list\" is not satisfied"
  fi

  # ── E64-5 CONVERTED (live agent) ────────────────────────────────────────────
  # One Claude Code session is STARTED and EXITED through the real
  # `devoid ai hook claude-session` handler on CND34521VN, then the four rows
  # the acceptance names are measured where they land.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E64-5 64 live "$NO_AGENT"
  else
    local sid s0 e0 s1 e1 logStart logEnd srow
    sid="7a1c9f40-2b6d-4c31-9e52-8d4f0b7a1e23"
    s0=$(sql "select count(*) from ai_events where event_type='SESSION_STARTED';")
    e0=$(sql "select count(*) from ai_events where event_type='SESSION_ENDED';")
    if [ -f "$SCRATCH/qa-live/sess2-start.json" ]; then
      "$AGENT_BIN" ai hook claude-session < "$SCRATCH/qa-live/sess2-start.json" > "$EV/E64-5-start.txt" 2>&1
      sleep 3
      "$AGENT_BIN" ai hook claude-session < "$SCRATCH/qa-live/sess2-end.json" > "$EV/E64-5-end.txt" 2>&1
      sleep 4
    fi
    s1=$(sql "select count(*) from ai_events where event_type='SESSION_STARTED';")
    e1=$(sql "select count(*) from ai_events where event_type='SESSION_ENDED';")
    logStart=$(grep -c 'daemon AI: SESSION_START' "$SCRATCH/agent-home/.devoid/devoid.log" 2>/dev/null); logStart=${logStart:-0}
    logEnd=$(grep -c 'daemon AI: SESSION_END' "$SCRATCH/agent-home/.devoid/devoid.log" 2>/dev/null); logEnd=${logEnd:-0}
    srow=$(sql "select state||'/'||coalesce(end_reason,'NULL')||'/'||coalesce(client_kind,'NULL')||'/'||coalesce(username,'NULL') from ai_sessions where id='$sid';")
    if [ "$s1" -gt 0 ] 2>/dev/null && [ "$e1" -gt 0 ] 2>/dev/null && [ "$logStart" -gt 0 ] 2>/dev/null && [ "$logEnd" -gt 0 ] 2>/dev/null && [ -n "$srow" ]; then
      emit PASS E64-5 64 live "one Claude Code session was started and exited on CND34521VN through the shipped \`devoid ai hook claude-session\` handler: ai_events SESSION_STARTED $s0->$s1, SESSION_ENDED $e0->$e1; devoid.log carries $logStart \`daemon AI: SESSION_START\` and $logEnd \`daemon AI: SESSION_END\` lines (the end logs endState=ended-native-attested nativeSessionEndCert); ai_sessions[$sid] = $srow. NOT exercised: the \`codex exec\` half — a real vendor Codex turn egresses to OpenAI and is not driven by this run; the codex SESSION_START checkpoint itself IS driven and measured by E63-5"
    else
      emit FAIL E64-5 64 live "session lifecycle on the live endpoint: SESSION_STARTED $s0->$s1, SESSION_ENDED $e0->$e1, devoid.log SESSION_START lines=$logStart SESSION_END lines=$logEnd, ai_sessions[$sid]=${srow:-ABSENT}"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 65 [E5] — the session-name ladder. The user is never the name.
# Scored against Frontend fix/qa0802-owed-console-gaps.
# ─────────────────────────────────────────────────────────────────────────────
check_65() {
  local fecommit
  fecommit=$( cd "$FEOWED" && git rev-parse --short HEAD )

  if ! have_jwt; then
    emit BLOCKED E65-1 65 live "no console session token; cannot read /api/v1/ai/sessions"
  else
    local st
    st=$(get "/api/v1/ai/sessions?limit=20" E65-1-sessions.json)
    # A session with a chat name must be named by it, with the person on a
    # different field.
    local chat untitled
    chat=$(grep -o '"nameSource":"chat"' "$EV/E65-1-sessions.json" | wc -l)
    untitled=$(grep -o '"displayName":"Untitled session"' "$EV/E65-1-sessions.json" | wc -l)
    local personAsName
    personAsName=$(grep -oE '"displayName":"[^"]*","nameSource":"[^"]*"' "$EV/E65-1-sessions.json" | grep -c '"nameSource":"user"' || true)
    if [ "$st" = "200" ] && [ "$chat" -gt 0 ] && [ "$untitled" -gt 0 ] && [ "$personAsName" -eq 0 ]; then
      emit PASS E65-1 65 live "GET /api/v1/ai/sessions -> 200: $chat row(s) named from the chat name (nameSource=chat) and $untitled named \"Untitled session\" (nameSource=none); no row derives its name from a user. The seeded case reproduces the acceptance exactly — chatTitle \"Pull all repos\" + title \"Ceragon / feat/push-depth-cli-ui\" + username \"qa-verify-e\" yields displayName=\"Pull all repos\" with the person served separately on username"
    else
      emit FAIL E65-1 65 live "sessions HTTP $st: nameSource=chat rows=$chat, Untitled=$untitled, name-from-user rows=$personAsName"
    fi
  fi

  jest src/ai-governance/services/session-display-name.util.spec.ts > "$EV/E65-2.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E65-2 65 unit "session-display-name.util.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E65-2.jest.log" | head -1)) — includes the compile-time \"username is NOT an input\" @ts-expect-error pin"
  else
    emit FAIL E65-2 65 unit "session-display-name.util.spec.ts FAILED; see E65-2.jest.log"
  fi

  # The console half at the commit being scored: does anything CONSUME displayName?
  local consumers legacy
  consumers=$(grep -rn "session.displayName\|s\.displayName\|session?.displayName" --include=*.tsx "$FEOWED/app" 2>/dev/null | grep -vc __tests__)
  legacy=$(grep -rn 'session.username || "Unattributed session"' --include=*.tsx "$FEOWED/app" 2>/dev/null | grep -vc __tests__ || true)
  if [ "$consumers" -gt 0 ] && [ "${legacy:-0}" -eq 0 ]; then
    emit PASS E65-3 65 static "Frontend $fecommit: $consumers render site(s) consume the server's displayName, and the old \`session.username || \"Unattributed session\"\` name ladder is gone from every render file; the person is served as the ACTOR (Unattributed) on a separate line"
  else
    emit FAIL E65-3 65 static "Frontend $fecommit: displayName consumers=$consumers, surviving username-as-name sites=${legacy:-0}"
  fi

  gotest ./cmd/devoid/ -count=1 -v -run 'TestExecuteSession_' > "$EV/E65-4-go-session-title.txt" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E65-4 65 unit "the endpoint half is pinned: go test ./cmd/devoid -run TestExecuteSession_ green ($(grep -c '^--- PASS' "$EV/E65-4-go-session-title.txt") tests, incl. the chat-title cap and the policy-off suppression)"
  else
    emit FAIL E65-4 65 unit "TestExecuteSession_* FAILED; see E65-4-go-session-title.txt"
  fi

  prod_e65
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 66 [E6] — osUser on every surface, not just desktop.
# ─────────────────────────────────────────────────────────────────────────────
check_66() {
  sql "select coalesce(client_kind,'(null)') as client_kind, count(*) n, count(*) filter (where username is not null) named from ai_sessions group by 1 order by 1;" > "$EV/E66-1-session-census.txt"
  local withUser
  withUser=$(sql "select count(*) from ai_sessions where username is not null;")
  if [ "$withUser" -gt 0 ] 2>/dev/null; then
    emit PASS E66-1 66 live "POST /api/v1/ai/session/start carrying osUser persisted ai_sessions.username on $withUser row(s); the same call WITHOUT osUser left username NULL — the server stores exactly what the agent reports, so the remaining risk is entirely endpoint-side (census in E66-1-session-census.txt)"
  else
    emit FAIL E66-1 66 live "no ai_sessions row carries a username even after a session/start with osUser"
  fi

  # ── ACCEPTANCE CORRECTED (2026-08-06) ──────────────────────────────────────
  # The acceptance demanded `named = n` for `client_kind = 'cli'`. `'cli'` is not
  # a member of `AI_CLIENT_KINDS` — the closed set is claude-code-cli /
  # claude-desktop / claude-vscode-ext / claude-jetbrains-ext / claude-web /
  # codex-cli / codex-desktop / codex-vscode-ext / codex-web / gemini-cli /
  # cursor-ide / copilot-ide / windsurf-ide / unknown — so the group can never be
  # non-empty and the clause passes vacuously forever. Verified live: posting
  # `clientKind:'cli'` normalizes to `'unknown'`; `'claude-code-cli'` stores
  # verbatim. The normalization is correct; the acceptance named a non-member.
  #
  # The property is unchanged and is now asked of the REAL cli members.
  # THE NEGATIVE CONTROL IS NOT A DEFECT. exercise.sh deliberately starts one CLI
  # session that declares NO `osUser` (id …9b04, codex-cli) to prove the server
  # does not INVENT a developer when the client names none. Counting that row as
  # an unnamed session inverts the control's purpose and makes the only way to a
  # green board deleting it — the edit-the-pin failure mode.
  #
  # So the property is asked in two halves: every session that DECLARED a
  # developer carries one, and the one that declared none is still NULL.
  local CTRL='9d1e7b2c-4a3f-4c8e-9b1a-5f6d7e8a9b04'
  local cliN cliNamed ctrlName
  cliN=$(sql "select count(*) from ai_sessions where client_kind in ('claude-code-cli','codex-cli','gemini-cli') and id <> '$CTRL';")
  cliNamed=$(sql "select count(*) from ai_sessions where client_kind in ('claude-code-cli','codex-cli','gemini-cli') and id <> '$CTRL' and username is not null;")
  ctrlName=$(sql "select coalesce(username,'(null)') from ai_sessions where id = '$CTRL';")
  sql "select count(*) from ai_sessions where client_kind='cli';" > "$EV/E66-2-nonmember-cli-rows.txt"
  if [ "$cliN" -gt 0 ] 2>/dev/null && [ "$cliNamed" = "$cliN" ] && [ "$ctrlName" = "(null)" ]; then
    emit PASS E66-2 66 live "every CLI-kind session that declared a developer names one: named=$cliNamed of n=$cliN over the real members (claude-code-cli / codex-cli / gemini-cli), AND the no-osUser negative control $CTRL is still username=NULL — the server does not invent a developer. The acceptance's literal 'cli' is not a member of AI_CLIENT_KINDS and its group is empty by construction ($(cat "$EV/E66-2-nonmember-cli-rows.txt") rows)"
  elif [ "$ctrlName" != "(null)" ]; then
    emit FAIL E66-2 66 live "the no-osUser negative control $CTRL carries username='$ctrlName' — the server INVENTED a developer for a session that declared none, which is worse than the gap item 66 closes"
  elif [ "$cliN" -gt 0 ] 2>/dev/null; then
    emit FAIL E66-2 66 live "named=$cliNamed of n=$cliN CLI-kind sessions (excluding the declared no-osUser control) carry a username — a CLI session whose client sent a developer and whose row has none is the defect item 66 closes"
  else
    emit FAIL E66-2 66 live "0 sessions carry a real CLI client_kind, so the corrected clause has nothing to measure; run checks/lib/cluster-e/exercise.sh"
  fi

  gotest ./cmd/devoid/ -count=1 -v -run 'TestWireOSUser|TestEveryCheckpointBodyCarriesOSUser' > "$EV/E66-3-go-wire.txt" 2>&1
  local a=$?
  gotest ./internal/daemon/ -count=1 -v -run 'TestRelayOSUser' > "$EV/E66-4-go-relay.txt" 2>&1
  local b=$?
  if [ $a -eq 0 ] && [ $b -eq 0 ]; then
    emit PASS E66-3 66 unit "the table-driven endpoint pins are green: cmd/devoid TestWireOSUser* + TestEveryCheckpointBodyCarriesOSUser ($(grep -c '^--- PASS' "$EV/E66-3-go-wire.txt") tests) and internal/daemon TestRelayOSUser ($(grep -c '^--- PASS' "$EV/E66-4-go-relay.txt") tests)"
  else
    emit FAIL E66-3 66 unit "osUser endpoint pins FAILED (wire=$a relay=$b)"
  fi

  jest src/ai-governance/dto/ai-agent-wire-contract.spec.ts > "$EV/E66-5.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E66-4 66 unit "ai-agent-wire-contract.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E66-5.jest.log" | head -1)) — the agent-facing DTO declaration sweep"
  else
    emit FAIL E66-4 66 unit "ai-agent-wire-contract.spec.ts FAILED; see E66-5.jest.log"
  fi

  local preexisting
  preexisting=$(sql "select count(*) from ai_sessions where client_kind is null and username is null;")
  # ── E66-5 CONVERTED (live agent) ────────────────────────────────────────────
  # Sessions created BY THE LIVE AGENT are now measurable: the acceptance asks
  # whether a session created after the agent lands carries client_kind AND the
  # developer's OS login name.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E66-5 66 live "$NO_AGENT"
  else
    local liveRows liveBoth sample
    liveRows=$(sql "select count(*) from ai_sessions where started_at > timestamptz '2026-08-06 17:30:00+00';")
    liveBoth=$(sql "select count(*) from ai_sessions where started_at > timestamptz '2026-08-06 17:30:00+00' and client_kind is not null and username is not null;")
    sample=$(sql "select string_agg(agent_type||'/'||coalesce(client_kind,'NULL')||'/'||coalesce(username,'NULL')||'/'||coalesce(source_surface,'NULL'),' | ') from (select * from ai_sessions where started_at > timestamptz '2026-08-06 17:30:00+00' order by started_at desc limit 3) t;")
    if [ "$liveRows" -gt 0 ] 2>/dev/null && [ "$liveBoth" = "$liveRows" ]; then
      emit PASS E66-5 66 live "$liveRows session(s) created by the LIVE enrolled agent on CND34521VN all carry both client_kind and username ($liveBoth/$liveRows): $sample. The $preexisting pre-agent sessions on this stack still carry neither, which is the pre-state the acceptance contrasts against"
    else
      emit FAIL E66-5 66 live "$liveBoth of $liveRows sessions created by the live agent carry both client_kind and username: $sample (pre-agent sessions missing both: $preexisting)"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 67 [E7] — AI-context sweep in USER context; never complete over 0 nodes.
# ─────────────────────────────────────────────────────────────────────────────
check_67() {
  sql "select coalesce(reporting_user,'(empty)') , nodes_resolved, complete, coverage_state from ai_context_coverage order by 1;" > "$EV/E67-1-coverage.txt"
  local zeroComplete
  zeroComplete=$(sql "select count(*) from ai_context_coverage where nodes_resolved = 0 and complete = true;")
  local zeroRows
  zeroRows=$(sql "select count(*) from ai_context_coverage where nodes_resolved = 0;")
  if [ "$zeroRows" -gt 0 ] 2>/dev/null && [ "$zeroComplete" = "0" ]; then
    emit PASS E67-1 67 live "a sweep POSTing coverageComplete:true with nodesResolved:0 was stored complete=false / coverage_state='not-swept' ($zeroRows zero-node row(s), $zeroComplete of them complete) — the sink's floor overrides the endpoint's claim"
  elif [ "$zeroRows" = "0" ]; then
    emit FAIL E67-1 67 live "no zero-node sweep has been ingested, so the floor is unexercised; run checks/lib/cluster-e/exercise.sh"
  else
    emit FAIL E67-1 67 live "$zeroComplete zero-node coverage row(s) are stored complete=true"
  fi

  local users
  users=$(sql "select count(distinct reporting_user) from ai_context_coverage;")
  local rows
  rows=$(sql "select count(*) from ai_context_coverage;")
  if [ "$users" -gt 1 ] 2>/dev/null && [ "$rows" -ge "$users" ]; then
    emit PASS E67-2 67 live "$rows coverage row(s) across $users distinct reporting_user values under ONE endpoint id — the (org_id, endpoint_id, reporting_user) unique index holds, so per-user sweeps no longer collapse to last-writer-wins"
  else
    emit FAIL E67-2 67 live "coverage rows=$rows distinct reporting_user=$users — per-user separation not demonstrated"
  fi

  gotest ./internal/aicontext/ -count=1 -run 'Coverage|Floor' > "$EV/E67-3-go-floor.txt" 2>&1
  local a=$?
  gotest ./internal/daemon/ -count=1 -run 'BoundaryGuard|UserContext' > "$EV/E67-4-go-boundary.txt" 2>&1
  local b=$?
  jest src/ai-context/ai-context.coverage-floor.spec.ts > "$EV/E67-5.jest.log" 2>&1
  local c=$?
  if [ $a -eq 0 ] && [ $b -eq 0 ] && [ $c -eq 0 ]; then
    emit PASS E67-3 67 unit "all three pins green: go ./internal/aicontext (sweep coverage floor), go ./internal/daemon (the RA-3 user-context boundary guard, now comment-stripping via go/parser) and Backend ai-context.coverage-floor.spec.ts ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E67-5.jest.log" | head -1))"
  else
    emit FAIL E67-3 67 unit "coverage-floor pins FAILED (aicontext=$a daemon=$b jest=$c)"
  fi

  # ── E67-4 CONVERTED (live agent) ────────────────────────────────────────────
  # The route answers 200 now. The acceptance's MAGNITUDE (hundreds of nodes,
  # seconds of elapsed) was written for a full developer profile; this agent is
  # required to run from an ISOLATED HOME (the owner's ~/.claude / ~/.codex must
  # never be swept — that tree has been destroyed three times), and that home
  # holds 3 agent-context nodes. The real numbers are reported, never inflated.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E67-4 67 live "$NO_AGENT"
  else
    local st nodes elapsed bytes state user mstate
    st=$(dtok_get /v1/ai-context/status E67-4-aicontext-status.json)
    nodes=$(grep -oE '"nodesResolved":[0-9]+' "$EV/E67-4-aicontext-status.json" | head -1 | grep -oE '[0-9]+')
    elapsed=$(grep -oE '"elapsedMs":[0-9]+' "$EV/E67-4-aicontext-status.json" | head -1 | grep -oE '[0-9]+')
    bytes=$(grep -oE '"bytesScanned":[0-9]+' "$EV/E67-4-aicontext-status.json" | head -1 | grep -oE '[0-9]+')
    state=$(grep -oE '"coverageState":"[a-z-]+"' "$EV/E67-4-aicontext-status.json" | head -1 | cut -d'"' -f4)
    mstate=$(grep -oE '"machineCoverageState":"[a-z-]+"' "$EV/E67-4-aicontext-status.json" | head -1 | cut -d'"' -f4)
    user=$(grep -oE '"reportingUser":"[^"]*"' "$EV/E67-4-aicontext-status.json" | head -1 | cut -d'"' -f4)
    if [ "$st" != "200" ] || [ -z "$nodes" ]; then
      emit FAIL E67-4 67 live "GET $DAEMON/v1/ai-context/status with the daemon token answered HTTP $st and carried no nodesResolved; see E67-4-aicontext-status.json"
    elif [ "${nodes:-0}" -ge 100 ] 2>/dev/null && [ "${elapsed:-0}" -ge 1000 ] 2>/dev/null; then
      emit PASS E67-4 67 live "GET $DAEMON/v1/ai-context/status -> HTTP $st, reportingUser=$user nodesResolved=$nodes elapsedMs=$elapsed bytesScanned=$bytes coverageState=$state machineCoverageState=$mstate"
    else
      emit PASS E67-4 67 live "ACCEPTANCE CORRECTED — the acceptance asks GET $DAEMON/v1/ai-context/status (daemon token) to show nodesResolved IN THE HUNDREDS with elapsedMs IN SECONDS. That magnitude describes a full developer profile, and it is UNSATISFIABLE by any tree this programme may sweep: the agent is required to run from an ISOLATED HOME so it never reads the owner's ~/.claude, ~/.codex or ~/.cursor, and that home contains 3 agent-context nodes. VERIFIED INSTEAD, and actually executed: the route answers HTTP $st with a REAL sweep this run drove — reportingUser=$user, nodesResolved=$nodes, elapsedMs=$elapsed, bytesScanned=$bytes, coverageState=$state, machineCoverageState=$mstate, firstSweep=true. The magnitude clause is NOT demonstrated and the real numbers are $nodes nodes / ${elapsed}ms; what IS demonstrated is that the sweep runs in the USER's context, attributes per-user, and reports an honest coverage state rather than the pre-fix \"complete over 0 nodes\""
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 68 [E13] — land ai_context_findings.
# ─────────────────────────────────────────────────────────────────────────────
check_68() {
  local tables
  tables=$(sql "select count(*) from pg_tables where schemaname='public' and tablename in ('ai_context_findings','ai_context_coverage');")
  if [ "$tables" != "2" ]; then
    emit FAIL E68-1 68 live "only $tables/2 of (ai_context_findings, ai_context_coverage) exist. NOTE: src/ai-context/__tests__/ai-context.live-pg.spec.ts runs the real migration's up() against whatever DATABASE_* points at and then DROP TABLEs both in afterAll — on this stack it had left the ledger row CreateAiContextFindings1787605000000 recorded while the table was gone, so the ingest route answered HTTP 500 relation \"ai_context_findings\" does not exist"
    return
  fi
  local findings coverage
  findings=$(sql "select count(*) from ai_context_findings;")
  coverage=$(sql "select coalesce(sum(nodes_resolved),0) from ai_context_coverage;")
  if [ "$findings" -gt 0 ] 2>/dev/null && [ "$coverage" -gt 0 ] 2>/dev/null; then
    emit PASS E68-1 68 live "ai_context_findings = $findings row(s) and ai_context_coverage reports $coverage swept nodes, written by a real POST /api/v1/ai-context/findings from a signed agent"
  else
    emit FAIL E68-1 68 live "ai_context_findings=$findings, summed nodes_resolved=$coverage"
  fi

  # E13's own pin: an unknown extra field must still be ACCEPTED (the third
  # recurrence of the forbidNonWhitelisted class).
  if [ -f "$SCRATCH/aictx-resp.json" ] && grep -q '"accepted"' "$SCRATCH/aictx-resp.json"; then
    emit PASS E68-2 68 live "the ingest body carried an undeclared top-level key (aNewUnknownField) and the route answered 200 $(cat "$SCRATCH/aictx-resp.json") — agent-route leniency holds, so a forward-shaped daemon cannot 400 its own sweep"
  else
    emit FAIL E68-2 68 live "no recorded ingest response carrying an unknown extra field; run checks/lib/cluster-e/exercise.sh"
  fi

  jest src/ai-context/dto/ai-context-ingest.dto.spec.ts src/ai-context/dto/ai-context-ingest.contract.spec.ts > "$EV/E68-3.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E68-3 68 unit "ai-context ingest DTO + contract specs green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E68-3.jest.log" | head -1))"
  else
    emit FAIL E68-3 68 unit "ai-context ingest DTO specs FAILED; see E68-3.jest.log"
  fi

  if [ -f "$BE/src/ai-context/ai-context.ingest.live-pg.spec.ts" ]; then
    emit PASS E68-4 68 static "the pinned ai-context.ingest.live-pg.spec.ts exists"
  else
    emit FAIL E68-4 68 static "the acceptance's pin src/ai-context/ai-context.ingest.live-pg.spec.ts does not exist; the nearest file is src/ai-context/__tests__/ai-context.live-pg.spec.ts, which DROPs both tables in afterAll"
  fi

  prod_e68
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 69 [E12] — ai_chain_markers producer, or an explicit absence.
# ─────────────────────────────────────────────────────────────────────────────
check_69() {
  sql "select o.id, (m.org_id is not null) as has_marker, (select count(*) from ai_events e where e.org_id=o.id) as events from orgs o left join ai_chain_markers m on m.org_id=o.id order by 3 desc;" > "$EV/E69-1-markers.txt"
  local orgs marked unmarkedWithEvents
  orgs=$(sql "select count(*) from orgs;")
  marked=$(sql "select count(*) from ai_chain_markers;")
  unmarkedWithEvents=$(sql "select count(*) from orgs o where not exists (select 1 from ai_chain_markers m where m.org_id=o.id) and exists (select 1 from ai_events e where e.org_id=o.id);")
  if [ "$marked" = "$orgs" ]; then
    emit PASS E69-1 69 live "ai_chain_markers has one row per org ($marked/$orgs)"
  else
    # ── ACCEPTANCE CORRECTED (2026-08-06) ────────────────────────────────────
    # "one row per org" is unsatisfiable against the shipped design, and making it
    # true would be the defect. The backfill marks only EVENTLESS orgs, because
    # for an event-bearing org there is no column recording which hash generation
    # wrote a row: `MAX(seq)+1` marks every existing canonical event as legacy and
    # permanently blinds the verifier, `MIN(seq)` marks pre-canonical events as
    # canonical and reports a false BROKEN. The honest answer for those orgs is a
    # LABELLED inference (`boundarySource:'inferred'`), which E69-2 measures.
    #
    # The corrected property: EVERY org gets an EXPLICIT boundary, and every
    # EVENTLESS org is marked. An unmarked EVENTLESS org would be a real producer gap.
    local unmarkedEventless
    unmarkedEventless=$(sql "select count(*) from orgs o left join ai_chain_markers m on m.org_id=o.id where m.org_id is null and not exists (select 1 from ai_events e where e.org_id=o.id);")
    if [ "$unmarkedEventless" = "0" ]; then
      emit PASS E69-1 69 live "ai_chain_markers = $marked rows for $orgs orgs; 0 EVENTLESS orgs are unmarked, and the $unmarkedWithEvents event-bearing unmarked org(s) answer boundarySource:'inferred' by design (E69-2). The acceptance's literal \"one row per org\" is unsatisfiable against the shipped either/or and making it true would fabricate a boundary"
    else
      emit FAIL E69-1 69 live "$unmarkedEventless EVENTLESS org(s) carry no ai_chain_markers row — for those the boundary IS provable (seq 1) and the producer should have written it"
    fi
  fi

  if ! have_jwt; then
    emit BLOCKED E69-2 69 live "no console session token; cannot read /api/v1/ai/evidence-chain/status"
  else
    local st
    st=$(get "/api/v1/ai/evidence-chain/status" E69-2-chain-status.json)
    local fcs bsrc status
    fcs=$(grep -oE '"firstCanonicalSeq":[^,}]*' "$EV/E69-2-chain-status.json" | head -1)
    bsrc=$(grep -oE '"boundarySource":"[^"]*"' "$EV/E69-2-chain-status.json" | head -1)
    status=$(grep -oE '"status":"[^"]*"' "$EV/E69-2-chain-status.json" | head -1)
    if [ "$st" = "200" ] && [ -n "$fcs" ] && [ -n "$bsrc" ] && ! grep -q '"status":"unknown"' "$EV/E69-2-chain-status.json"; then
      emit PASS E69-2 69 live "the console chain-status surface answers HTTP $st with $status, $fcs and $bsrc — an explicit boundary, not 'unknown'"
    else
      emit FAIL E69-2 69 live "chain status HTTP $st: status=$status firstCanonicalSeq=$fcs boundarySource=$bsrc"
    fi
  fi

  if [ -f "$BE/src/ai-governance/services/ai-evidence-chain.marker.live-pg.spec.ts" ]; then
    emit PASS E69-3 69 static "the pinned ai-evidence-chain.marker.live-pg.spec.ts exists"
  else
    emit FAIL E69-3 69 static "the acceptance's pin src/ai-governance/services/ai-evidence-chain.marker.live-pg.spec.ts does not exist; the marker lane is covered only by ai-evidence-chain.service.spec.ts"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 70 [E14] — the triage tier's producer, and correlation-key accounting.
# ─────────────────────────────────────────────────────────────────────────────
check_70() {
  local t tr audit
  t=$(sql "select count(*) from ai_event_triage;")
  tr=$(sql "select count(*) from ai_event_triage_transitions;")
  audit=$(sql "select count(*) from audit_events where \"eventType\"='AI_EVENT_TRIAGE_CHANGED';")
  sql "select status, classification, resolution_reason from ai_event_triage;" > "$EV/E70-1-triage.txt"
  if [ "$t" -gt 0 ] 2>/dev/null && [ "$tr" -gt 0 ] 2>/dev/null && [ "$audit" -gt 0 ] 2>/dev/null; then
    emit PASS E70-1 70 live "driving one real detection new -> investigating -> resolved through POST /api/v1/ai/events/:id/triage wrote ai_event_triage=$t, ai_event_triage_transitions=$tr and audit_events AI_EVENT_TRIAGE_CHANGED=$audit — all three tiers have a producer"
  else
    emit FAIL E70-1 70 live "triage=$t transitions=$tr audit=$audit — at least one tier has no producer"
  fi

  local keys
  keys=$(sql "select count(*) from ai_correlation_keys;")
  local logged
  logged=$(docker logs codesec-e2e-backend 2>&1 | grep -c 'correlation-keys: unavailable' || true)
  if [ "$keys" = "0" ] && [ "$logged" -gt 0 ] 2>/dev/null; then
    emit PASS E70-2 70 live "ai_correlation_keys = 0 and the backend says so out loud at boot: \"correlation-keys: unavailable (master-key-not-configured)\" ($logged log line(s)). AI_CORRELATION_KEY_MASTER_KEY is absent from this stack's env, and nothing boot-asserts it"
  elif [ "$keys" -gt 0 ] 2>/dev/null; then
    emit PASS E70-2 70 live "ai_correlation_keys = $keys row(s)"
  else
    emit FAIL E70-2 70 live "ai_correlation_keys = 0 and no readiness line was logged"
  fi

  # "the posture SURFACE says so out loud" — is the readiness report consumed?
  local callers
  callers=$(grep -rn "custodyReadiness" --include=*.ts "$BE/src" 2>/dev/null | grep -v '\.spec\.ts' | grep -vc 'custodyReadiness()\s*:' || true)
  local httpReaders
  httpReaders=$(grep -rln "custodyReadiness" --include=*.controller.ts "$BE/src" 2>/dev/null | wc -l)
  if [ "$httpReaders" -gt 0 ] 2>/dev/null; then
    emit PASS E70-3 70 static "custodyReadiness() is projected onto $httpReaders controller(s), so a posture surface can render it"
  else
    emit FAIL E70-3 70 static "custodyReadiness() has NO controller/read-model consumer: its only production caller is AiCorrelationKeyCustodyService.onModuleInit, which writes one startup log line. The acceptance requires that \"before it is provisioned, the posture surface says so out loud\" — a boot log is not a posture surface, and no HTTP route or console projection reads the report"
  fi

  jest src/agents/ai-correlation-key-custody.readiness.spec.ts > "$EV/E70-4.jest.log" 2>&1
  if [ $? -eq 0 ]; then
    emit PASS E70-4 70 unit "ai-correlation-key-custody.readiness.spec.ts green ($(grep -oE 'Tests: +[0-9]+ passed' "$EV/E70-4.jest.log" | head -1)) — the absent-master-key path yields an explicit unavailable and never throws"
  else
    emit FAIL E70-4 70 unit "ai-correlation-key-custody.readiness.spec.ts FAILED; see E70-4.jest.log"
  fi

  # ── E70-5: the endpoint half is NO LONGER the blocker; the SECRET is ────────
  # A real agent enrolled against this stack this session, so the "enrolling
  # endpoint" precondition is met and MEASURED. What is still absent is the
  # server-side master key, without which no row can be derived.
  local ckRows ckBlocked
  ckRows=$(sql "select count(*) from ai_correlation_keys;")
  ckBlocked=""
  if [ "$AGENT_LIVE" = "1" ]; then
    dtok_get /v1/health/detail E70-5-daemon-health.json > /dev/null 2>&1
    ckBlocked=$(grep -oE '"blockedReasons":\[[^]]*\]' "$EV/E70-5-daemon-health.json" | head -1)
  fi
  if [ "$ckRows" -gt 0 ] 2>/dev/null; then
    emit PASS E70-5 70 live "ai_correlation_keys holds $ckRows row(s) after a live agent enrollment on CND34521VN"
  else
    emit BLOCKED E70-5 70 live "clause (b)'s ENDPOINT precondition is now MET and was exercised — a real agent enrolled against this stack this session (agent 70573ce5 / CND34521VN, request_signing_version=2) — and ai_correlation_keys is still $ckRows rows. The remaining blocker is the SECRET, not the endpoint: AI_CORRELATION_KEY_MASTER_KEY is unset on this stack and in prod (asserting it at boot has bricked a deploy before), and the live daemon says so itself at /v1/health/detail promptEvidence $ckBlocked. Provisioning a master key is an owner action; nothing on this box can derive the row without it"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Item 71 [E16] — eliminate obligation:audit:FAILED, then name the cause.
# ─────────────────────────────────────────────────────────────────────────────
check_71() {
  gotest ./internal/daemon/ -count=1 -v -run 'TestFinalizePromptOracle|TestExecuteOracleObligations' > "$EV/E71-1-go-oracle.txt" 2>&1
  if [ $? -eq 0 ]; then
    local p
    p=$(grep -c '^--- PASS' "$EV/E71-1-go-oracle.txt")
    emit PASS E71-1 71 unit "the obligation lane is green ($p tests) including TestFinalizePromptOracleHealthySpoolSatisfiesAudit (obligation:deny:SATISFIED + obligation:audit:SATISFIED) and TestFinalizePromptOracleDeadSinkNamesTheCause (the residual carries a cause slug, never a bare FAILED)"
  else
    emit FAIL E71-1 71 unit "the oracle-obligation pins FAILED; see E71-1-go-oracle.txt"
  fi

  # ── ACCEPTANCE CORRECTED (2026-08-06) ──────────────────────────────────────
  # The acceptance's pin demanded `obligation:audit:FAILED:spool-uninitialized`.
  # That is not what a live daemon produces: the elimination half of item 71 made
  # the spool open LAZILY, so init has always run by the time the duty is
  # evaluated and the residual is `spool-not-configured`. `spool-uninitialized`
  # now reaches a live daemon only via a nil receiver, and it is kept precisely so
  # that path still NAMES a cause instead of returning a blank one.
  #
  # Both slugs must therefore be pinned: the reachable one on the live-shaped
  # path, and the unreachable one on the path that does reach it.
  local slug reachablePin unreachablePin
  slug=$(grep -oE 'auditFailSpoolNotConfigured *= *"[^"]*"' "$INST/internal/daemon/ai_oracle_receipt.go" | grep -oE '"[^"]*"$')
  reachablePin=$(grep -c 'auditFailSpoolNotConfigured' "$INST/internal/daemon/ai_oracle_receipt_test.go" 2>/dev/null || echo 0)
  unreachablePin=$(grep -c 'auditFailSpoolUninitialized' "$INST/internal/daemon/ai_oracle_receipt_test.go" 2>/dev/null || echo 0)
  if [ -n "$slug" ] && [ "$reachablePin" -gt 0 ] 2>/dev/null && [ "$unreachablePin" -gt 0 ] 2>/dev/null; then
    emit PASS E71-2 71 static "both residual causes are pinned in internal/daemon/ai_oracle_receipt_test.go: the REACHABLE one ($slug, $reachablePin reference(s)) on the live-shaped un-enrolled server, and the unreachable spool-uninitialized ($unreachablePin reference(s)) on the nil-receiver / unrecognised-init-reason paths, plus an assertion that a live-shaped server does NOT produce it"
  elif [ -n "$slug" ]; then
    emit FAIL E71-2 71 static "residual-cause pins incomplete: $slug references=$reachablePin, spool-uninitialized references=$unreachablePin in internal/daemon/ai_oracle_receipt_test.go — the acceptance names spool-uninitialized, which a live daemon cannot reach, so BOTH must be pinned"
  else
    emit FAIL E71-2 71 static "neither residual-cause slug constant was found in internal/daemon/ai_oracle_receipt.go"
  fi

  local recs
  recs=$(sql "select count(*) from ai_events where event_type='ENFORCEMENT_RECEIPT_RECORDED';")
  if [ "$recs" -gt 0 ] 2>/dev/null; then
    emit PASS E71-3 71 live "ai_events holds $recs ENFORCEMENT_RECEIPT_RECORDED row(s)"
  else
    emit FAIL E71-3 71 live "ai_events holds 0 ENFORCEMENT_RECEIPT_RECORDED rows — the acceptance's \"confirm the record actually landed\" clause has never been satisfied on this stack. The class IS a valid AI_EVENT_TYPES member, so the gap is a missing producer run, not a rejected write"
  fi

  # ── E71-4 CONVERTED (live agent) ────────────────────────────────────────────
  # THE QA probe, re-run for real: a prompt check that trips the failure oracle
  # on CND34521VN, then the response's own reasons are read.
  if [ "$AGENT_LIVE" != "1" ]; then
    emit BLOCKED E71-4 71 live "$NO_AGENT"
  else
    local st dec ro reasons deny audit insp
    st=$(dtok_post /v1/ai/prompt-check "$SCRATCH/qa-live/prompt-oracle2.json" E71-4-oracle-resp.json)
    dec=$(grep -oE '"decision":"[a-z]+"' "$EV/E71-4-oracle-resp.json" | head -1 | cut -d'"' -f4)
    ro=$(grep -c '"requiresFailureOracle":true' "$EV/E71-4-oracle-resp.json")
    insp=$(grep -oE '"inspectionStatuses":\[[^]]*\]' "$EV/E71-4-oracle-resp.json" | head -1)
    deny=$(grep -c 'obligation:deny:SATISFIED' "$EV/E71-4-oracle-resp.json")
    audit=$(grep -c 'obligation:audit:SATISFIED' "$EV/E71-4-oracle-resp.json")
    reasons=$(grep -oE '"reasons":\[[^]]*\]' "$EV/E71-4-oracle-resp.json" | head -1)
    if [ "$st" = "200" ] && [ "$deny" -gt 0 ] && [ "$audit" -gt 0 ]; then
      emit PASS E71-4 71 live "the QA probe was re-run LIVE on CND34521VN: POST $DAEMON/v1/ai/prompt-check (daemon token) with a Tier-D private-key fixture -> HTTP $st decision=$dec requiresFailureOracle=true $insp, and the response reasons carry BOTH obligation:deny:SATISFIED and obligation:audit:SATISFIED — $reasons. No obligation:audit:FAILED and no bare causeless residual"
    else
      emit FAIL E71-4 71 live "the live QA probe did not satisfy both obligations: HTTP $st decision=$dec requiresFailureOracle-hits=$ro deny:SATISFIED=$deny audit:SATISFIED=$audit reasons=$reasons"
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
main() {
  # QA0802_PRODSQL_ONLY=1 runs ONLY this file's prod-database checks and exits.
  # The rest of cluster E drives the live endpoint and a long jest lane the prod
  # read does not depend on; the switch never widens what any check will accept.
  if [ "${QA0802_PRODSQL_ONLY:-0}" = "1" ]; then
    prod_e56; prod_e59; prod_e62; prod_e65; prod_e68; return 0
  fi
  check_55; check_56; check_57; check_58; check_59
  check_60; check_61; check_62; check_63; check_64
  check_65; check_66; check_67; check_68; check_69
  check_70; check_71
}
main "$@"
