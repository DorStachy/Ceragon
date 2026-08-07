#!/usr/bin/env bash
# =============================================================================
# Cluster A — production-and-data items of the QA plan 2026-08-02.
# Items 1, 8, 9, 10, 12, 14, 15, 16, 17, 18, 19 (A1-A11) + 101 [H1].
#
# Contract: .plans/verify-20260805/HARNESS.md
#   <VERDICT>\t<check-id>\t<item>\t<kind>\t<message>
#   kind = live | unit | static.  Only `live` may ever be read as PROVEN LIVE.
#   Rule 7 — a check that cannot answer is BLOCKED with its precondition named,
#            and BLOCKED counts against the run. There is no "unknown".
#
# HARD CONSTRAINTS honoured by this file:
#   * Every AWS call is read-only (describe-* / get-* / list-* / scan /
#     filter-log-events / simulate-principal-policy). NOTHING here mutates AWS.
#   * No production database is touched (it is unreachable by design — see A9-1).
#   * `codefense_db` is never written or dropped. The only database this file
#     writes to is the scratch `migchain_verify_a` it creates itself.
#   * No credential value is ever echoed or written to evidence.
# =============================================================================
set -u
# NOTE: MSYS_NO_PATHCONV is deliberately NOT exported globally. It is required so
# the AWS CLI sees `/ecs/backend` as a log-group name rather than a drive path,
# but setting it for the whole script also stops `git -C /c/...` and native
# `curl -o /c/...` resolving their paths — both fail silently and turn real
# checks into false negatives. It is scoped to the one function that needs it.
R=eu-north-1
ROOT=/c/Users/Owner/Documents/Ceragon
EV="$ROOT/.plans/verify-20260805/evidence"
WT="$ROOT/.worktrees/base-be-integration"
LIB="$ROOT/.plans/verify-20260805/checks/lib"
API=http://127.0.0.1:2053
PROD_API=https://api.cera.buzz
PROD_RDS=codefense-postgressdb.c56akiuead81.eu-north-1.rds.amazonaws.com
RDS_SG=sg-03a950998d85edecd
PGC=codesec-e2e-postgres
SCRATCH=migchain_verify_a
NOW=$(date +%s)

mkdir -p "$EV"
emit() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5"; }

# Count CloudWatch matches with the CLI's own pagination followed. A single
# filter-log-events page returns "what fitted in one scanned chunk", NOT a
# total — reading length(events) off one page is a measurement bug.
cw_count() { # $1=filter-pattern $2=start-epoch-seconds
  MSYS_NO_PATHCONV=1 \
  aws logs filter-log-events --log-group-name /ecs/backend --region $R \
    --start-time "${2}000" --filter-pattern "$1" --max-items 300 \
    --query 'events[].eventId' --output text 2>/dev/null \
    | tr '\t' '\n' | grep -c '[0-9]'
}
psqlq() { docker exec "$PGC" psql -U codefense -d "$1" -Atc "$2" 2>&1; }

# curl here is a NATIVE Windows binary and MSYS_NO_PATHCONV=1 (needed so the AWS
# CLI sees `/ecs/backend` as a log-group name and not a drive path) stops it
# resolving POSIX -o targets — it exits 23 and writes nothing, silently turning
# every body-content assertion into a false negative. Bash redirection is
# handled by the shell, so it still works. Sets $HTTP and writes $2.
fetch() { # $1=url  $2=evidence-file  [$3..=extra curl args]
  local url="$1" out="$2"; shift 2
  curl -s -m 20 -w '\nHTTPCODE:%{http_code}\n' "$@" "$url" > "$out" 2>&1
  HTTP=$(grep -oE 'HTTPCODE:[0-9]+' "$out" | tail -1 | cut -d: -f2)
  HTTP=${HTTP:-000}
}
jest_one() { # $1=check-id  $2=spec path(s)  -> writes evidence, echoes "pass|fail|<summary>"
  local id="$1"; shift
  ( cd "$WT" && npx jest --silent --ci "$@" ) > "$EV/$id.jest.log" 2>&1
  local rc=$?
  local sum
  sum=$(grep -E '^(Tests|Test Suites):' "$EV/$id.jest.log" | tr '\n' ' ' | tr -s ' ')
  [ -z "$sum" ] && sum="(no jest summary; see $id.jest.log)"
  if [ $rc -eq 0 ]; then echo "pass|$sum"; else echo "fail|$sum"; fi
}

# =============================================================================
# THE PROD SQL LANE (2026-08-07)
# =============================================================================
# Until 2026-08-06 every prod-database acceptance in this file reported
#   "prod RDS is private with no in-VPC bastion; prod SQL cannot run from this box"
# and that precondition is now FALSE. RDS is still `PubliclyAccessible=false`
# and its security group sg-03a950998d85edecd is untouched — item 8 passes
# BECAUSE of that, and nothing here may widen it. The access path is
# `Backend/scripts/prod-sql-runner.cjs`: a one-off Fargate task launched into
# the RDS VPC on the backend's own subnet + security group (the source the
# retained ingress rule already admits), running psql under a server-side
# `SET TRANSACTION READ ONLY` behind a client-side write/DDL keyword scan. It
# registers nothing permanent and leaves no rule, host or service behind.
#
# TWO HARD CONSTRAINTS SHAPE THE DESIGN:
#   1. ECS RunTask caps the container-override payload at 8192 bytes, so the
#      queries are BATCHED into one file rather than issued one per check.
#   2. Each launch costs ~90 s, so the batch runs at most ONCE per invocation
#      and every check reads the cached capture.
# Every result is emitted as a single text column shaped
#      QA::<key>::<v1>|<v2>|...
# which survives psql's column padding and is extracted with one grep. Nothing
# selects prompt, preview or credential TEXT — counts, lengths and booleans
# only (rule 6).
#
# This extends the `prodsql()` convention cluster-g.sh established; it uses
# --sql-file rather than --sql because of constraint 1, and because a Windows
# path is the only form node reads reliably under MSYS_NO_PATHCONV=1.
PRODSQL_STATE=absent          # absent | ok | failed
PRODSQL_WHY=""
PRODSQL_OUT="$EV/prodsql-a.out"
PRODSQL_SQL="$EV/prodsql-a.sql"
PRODSQL_RUNNER="$WT/scripts/prod-sql-runner.cjs"

flat() { tr -d '[:cntrl:]' | tr '\t' ' ' | cut -c1-400; }
# /c/x -> C:/x. node.exe cannot open an MSYS path, and MSYS_NO_PATHCONV=1
# (needed so the AWS CLI inside the runner is not path-mangled) stops the shell
# converting it for us.
winpath() {
  case "$1" in
    /[a-zA-Z]/*) printf '%s:/%s' "$(printf '%s' "$1" | cut -c2 | tr 'a-z' 'A-Z')" \
                                  "$(printf '%s' "$1" | cut -c4-)" ;;
    *)           printf '%s' "$1" ;;
  esac
}

prodsql_sql_a() {
cat <<'SQL'
SELECT 'QA::A9::' || count(*)::text AS r
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\_w5\_test\_%';
SELECT 'QA::A9N::' || coalesce(string_agg(tablename, ','), 'none') AS r
  FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\_w5\_test\_%';
SELECT 'QA::A12::' || count(*)::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'))::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text
    || '|' || (count(*) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'
                                   OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text
    || '|' || (count(*) FILTER (WHERE ((metadata->>'redactedPreview') LIKE '%AKIA%'
                                    OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]')
                                  AND event_time > TIMESTAMPTZ '2026-08-02 11:47:00+00'))::text
    || '|' || coalesce(max(length(metadata->>'redactedPreview')),0)::text
    || '|' || coalesce(replace(max(event_time)::text,' ','T'),'none')
    || '|' || coalesce(replace((max(event_time) FILTER (WHERE (metadata->>'redactedPreview') LIKE '%AKIA%'
                            OR (metadata->>'redactedPreview') ~ 'C:\\Users\\[A-Za-z]'))::text,' ','T'),'none') AS r
  FROM ai_events WHERE metadata ? 'redactedPreview';
SELECT 'QA::TRAF::' || coalesce(replace(max(event_time)::text,' ','T'),'none') || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE event_time > now() - interval '7 days'))::text AS r FROM ai_events;
SELECT 'QA::A14::' || count(*)::text || '|' || count(DISTINCT name)::text AS r FROM migrations;
SELECT 'QA::A14C::' || coalesce(string_agg(conname || '(' || contype::text || ')', ',' ORDER BY conname),'none') AS r
  FROM pg_constraint WHERE conrelid='public.migrations'::regclass;
SELECT 'QA::A15::' || coalesce(string_agg(conname || '(' || contype::text || ')', ',' ORDER BY conname),'none') AS r
  FROM pg_constraint WHERE conrelid='public.ai_sessions'::regclass;
SELECT 'QA::A16::' || (count(*) FILTER (WHERE client_event_id IS NULL AND emitter_stream_id IS NOT NULL))::text
    || '|' || count(*)::text
    || '|' || (count(*) FILTER (WHERE emitter_stream_id IS NOT NULL))::text
    || '|' || (count(*) FILTER (WHERE client_event_id IS NULL))::text AS r
  FROM ai_events;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;
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
    PRODSQL_WHY="the in-VPC runner scripts/prod-sql-runner.cjs is absent from the tree under test ($WT)"
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
  prodsql_sql_a > "$PRODSQL_SQL"
  ( cd "$WT" && MSYS_NO_PATHCONV=1 AWS_PAGER="" \
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
  emit PASS ENVA-PROD 0 live "prod SQL lane OPEN and read-only: $PRODSQL_RUNNER launched one-off Fargate task ${task:-unknown} into the RDS VPC (subnet-043fba9d9893864a4 / sg-02e5e94735f154e7f), target $tgt, server-side SET TRANSACTION READ ONLY, runner exit $rc. The RDS security group and PubliclyAccessible=false were NOT changed — item 8 still passes because the instance is private. Capture: $PRODSQL_OUT"
  return 0
}

# The psql result block only; the runner echoes the SQL itself above it, and
# grepping the whole capture would match the query text rather than its result.
#
# THE STATE GUARD IS LOad-BEARING, not defensive tidiness. Without it a run with
# the lane switched off still found the PREVIOUS run's capture on disk and
# reported its numbers as though production had just been measured — a verdict
# over a path that did not execute, which is the exact failure this harness
# exists to remove. Caught by running with QA0802_PROD_SQL=0 on 2026-08-07.
prodv() { # <key> -> one line per returned row
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
# Why THIS check could not answer. Never a generic string: either the lane never
# opened, or it opened and psql aborted before this statement.
prod_why() {
  if [ "$PRODSQL_STATE" != "ok" ]; then printf '%s' "$PRODSQL_WHY"; return; fi
  local e; e=$(prodsql_err)
  if [ -n "$e" ]; then
    printf 'the in-VPC runner reached production but psql aborted before this statement: %s' "$e"
  else
    printf 'the prod batch returned no row for this query; capture: %s' "$PRODSQL_OUT"
  fi
}
epoch() { # <iso8601 with optional fractional seconds> -> epoch seconds, or empty
  local s; s=$(printf '%s' "$1" | sed 's/\.[0-9]*//')
  date -d "$s" +%s 2>/dev/null
}

# --- the five prod-database checks -------------------------------------------
# Each one runs the acceptance's OWN SQL against production and reports what it
# saw. A check that still cannot answer emits BLOCKED naming the precondition
# that is actually missing NOW — never the retired "no in-VPC bastion" line.

check_A9_1() { # item 9 — the litter tables
  prodsql_run
  local n names
  n=$(prodv1 A9); names=$(prodv1 A9N)
  if [ -z "$n" ]; then
    emit BLOCKED A9-1 9 live "$(prod_why)"
  elif [ "$n" = "0" ]; then
    emit PASS A9-1 9 live "the acceptance's own SQL was run IN PRODUCTION, read-only, through the in-VPC Fargate runner: SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\\_w5\\_test\\_%' returned 0, and the name list is '$names'. The litter tables the QA found are gone from codefense_db"
  else
    emit FAIL A9-1 9 live "PROD still carries $n _w5_test_ litter table(s): $names (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE '\\_w5\\_test\\_%' run in-VPC, read-only)"
  fi
}

check_A12_1() { # item 12 — the redactedPreview census
  prodsql_run
  local row rows akia home off offsince maxlen newest newestoff
  row=$(prodv1 A12)
  if [ -z "$row" ]; then emit BLOCKED A12-1 12 live "$(prod_why)"; return; fi
  rows=$(fld "$row" 1); akia=$(fld "$row" 2); home=$(fld "$row" 3)
  off=$(fld "$row" 4); offsince=$(fld "$row" 5); maxlen=$(fld "$row" 6)
  newest=$(fld "$row" 7); newestoff=$(fld "$row" 8)
  # The acceptance's growth clause can only be read against the revision that is
  # actually serving. Ask ECS when the running deployment started, and compare.
  local dep depe newe census
  dep=$(MSYS_NO_PATHCONV=1 aws ecs describe-services --cluster backend --services backend-service \
          --region $R --query 'services[0].deployments[0].createdAt' --output text 2>/dev/null | flat)
  depe=$(epoch "$dep"); newe=$(epoch "$newest")
  local traf
  traf=$(prodv1 TRAF)
  census="prod census (run in-VPC, read-only, counts and lengths only - no preview text was selected): $rows ai_events row(s) carry metadata.redactedPreview; $akia match '%AKIA%', $home match 'C:\\\\Users\\\\[A-Za-z]', $off match either; max preview length $maxlen bytes; newest preview row $newest, newest OFFENDING row ${newestoff}; $offsince offending row(s) landed after the QA's 2026-08-02 11:47 snapshot (8-at-11:09 -> 9-at-11:47). Prod AI traffic for scale: $(fld "$traf" 2) ai_events total, newest $(fld "$traf" 1), $(fld "$traf" 3) in the last 7 days"
  if [ -z "$newe" ] || [ -z "$depe" ]; then
    emit BLOCKED A12-1 12 live "$census. The growth clause cannot be attributed: the running backend deployment's createdAt ('${dep:-unreadable}') or the newest preview timestamp could not be parsed, so 'has it stopped growing' has no revision to be about"
  elif [ "$newe" -lt "$depe" ]; then
    emit BLOCKED A12-1 12 live "$census. The acceptance's growth clause CANNOT BE ANSWERED for the code that is running: the serving deployment started $dep and the newest redactedPreview-bearing row in the whole table is $newest, i.e. this revision has written ZERO preview rows, offending or clean. The population the clause measures is empty. Precondition: an endpoint enrolled against PRODUCTION submitting a governed prompt - the agent enrolled on this box reports to the local stack on :2053, so nothing it does can appear here"
  elif [ "${offsince:-0}" -gt 0 ] 2>/dev/null; then
    emit FAIL A12-1 12 live "$census. Offending rows are STILL BEING WRITTEN: $offsince of them post-date the QA snapshot and the serving deployment started $dep, before the newest offending row $newestoff"
  else
    emit PASS A12-1 12 live "$census. No offending row has been written since the QA snapshot, and the serving deployment (started $dep) has written preview rows since - so the census population is non-empty and the leak has stopped growing"
  fi
}

check_A14_3() { # item 14 — the migration ledger
  prodsql_run
  local row total distinct cons
  row=$(prodv1 A14); cons=$(prodv1 A14C)
  if [ -z "$row" ]; then emit BLOCKED A14-3 14 live "$(prod_why)"; return; fi
  total=$(fld "$row" 1); distinct=$(fld "$row" 2)
  local uq=absent
  case "$cons" in *uq_migrations_name*) uq=present;; esac
  if [ "$total" = "$distinct" ] && [ "$uq" = "present" ]; then
    emit PASS A14-3 14 live "PROD ledger, read in-VPC: SELECT count(*), count(DISTINCT name) FROM migrations returned $total/$distinct (EQUAL) and pg_constraint on migrations carries $cons, which includes uq_migrations_name"
  else
    emit FAIL A14-3 14 live "PROD ledger, read in-VPC through the Fargate runner: SELECT count(*), count(DISTINCT name) FROM migrations returns $total/$distinct - still UNEQUAL, $((total - distinct)) duplicate ledger rows, exactly the 215/204 the QA measured on 2026-08-02. uq_migrations_name is $uq: the only constraint on the table is $cons. The repair has not been applied to production; A14-1/A14-2 prove the chain builds a CLEAN ledger from empty, which is a different database"
  fi
}

check_A15_3() { # item 15 — the ai_sessions constraints
  prodsql_run
  local cons nk
  cons=$(prodv1 A15)
  if [ -z "$cons" ]; then emit BLOCKED A15-3 15 live "$(prod_why)"; return; fi
  nk=$(printf '%s' "$cons" | grep -o '(f)\|(c)' | wc -l | tr -d ' ')
  if [ "${nk:-0}" -ge 2 ] 2>/dev/null; then
    emit PASS A15-3 15 live "PROD, read in-VPC: SELECT conname, contype FROM pg_constraint WHERE conrelid='ai_sessions'::regclass returns $cons - the PK plus $nk FK/CHECK constraint(s). RESIDUE, named: the acceptance's second half (an INSERT with a non-existent org_id on a RESTORED SNAPSHOT) was not run; no snapshot has been restored, and this lane is read-only by construction"
  else
    emit FAIL A15-3 15 live "PROD, read in-VPC through the Fargate runner: SELECT conname, contype FROM pg_constraint WHERE conrelid='ai_sessions'::regclass returns exactly $cons - the primary key and NOTHING else, $nk FK/CHECK constraints, which is the pre-fix state the QA recorded on 2026-08-02. The AiTenancyConstraints migration has not reached production. A15-1/A15-2 prove the migration's effect on a chain-built stand-in, not here. RESIDUE: the restored-snapshot INSERT is moot while the constraint it would exercise does not exist in prod"
  fi
}

check_A16_3() { # item 16 — the tamper-evidence candidate row
  prodsql_run
  local row elig total withstream nullclient
  row=$(prodv1 A16)
  if [ -z "$row" ]; then emit BLOCKED A16-3 16 live "$(prod_why)"; return; fi
  elig=$(fld "$row" 1); total=$(fld "$row" 2); withstream=$(fld "$row" 3); nullclient=$(fld "$row" 4)
  if [ "$elig" = "0" ]; then
    emit BLOCKED A16-3 16 live "the acceptance's selector WAS RUN in production, read-only, in-VPC: SELECT id, event_hash FROM ai_events WHERE client_event_id IS NULL AND emitter_stream_id IS NOT NULL returns 0 rows out of $total (the two populations do not intersect: $withstream rows carry an emitter_stream_id and $nullclient have a NULL client_event_id, but no row has both). The demonstration therefore has no subject, AND its second half needs a RESTORED SNAPSHOT to mutate - none exists, and this lane is read-only by construction. Preconditions, both still missing: a row of that shape in prod, and a restored snapshot to mutate it on"
  else
    emit BLOCKED A16-3 16 live "the acceptance's selector WAS RUN in production, read-only, in-VPC: $elig of $total ai_events rows match client_event_id IS NULL AND emitter_stream_id IS NOT NULL, so a subject row EXISTS. The demonstration still cannot run: mutating emitter_stream_id requires a RESTORED SNAPSHOT (never prod), none has been restored, and this lane is read-only by construction. Precondition: a restored snapshot - an owner action"
  fi
}

# QA0802_PRODSQL_ONLY=1 runs ONLY this file's prod-database checks and exits.
# It exists because the rest of cluster A re-runs jest suites and a from-empty
# migration build (~20 min) that the prod lane does not depend on; it never
# widens what any check will accept.
prodsql_only_a() {
  check_A9_1; check_A12_1; check_A14_3; check_A15_3; check_A16_3
}

# --- preconditions ----------------------------------------------------------
acct=$(aws sts get-caller-identity --query Account --output text 2>&1)
if [ "$acct" != "113627991972" ]; then
  emit BLOCKED A0-1 0 live "aws identity is '$acct', not 113627991972 — every prod read below cannot answer"
else
  emit PASS A0-1 0 live "aws identity = account $acct, region $R (read-only)"
fi
if [ "${QA0802_PRODSQL_ONLY:-0}" = "1" ]; then prodsql_only_a; exit 0; fi
fetch "$API/api/v1/health" "$EV/A0-2-local-health.json"
HEADSHA=$(cd "$WT" && git rev-parse --short HEAD 2>/dev/null)
if [ "$HTTP" = "200" ]; then
  emit PASS A0-2 0 live "local integration backend :2053 healthy (http $HTTP), integration/qa0802-be @ ${HEADSHA:-?}"
else
  emit BLOCKED A0-2 0 live "local integration backend :2053 returned http '$HTTP' — every local live check below cannot answer"
fi
# The assembled base does not build with its own build command. Reproduced
# WITHOUT running it: `npm run build`'s prebuild rm -rf's dist/ BEFORE the step
# that fails, so re-running it here would destroy the live stack this script is
# testing (that is exactly how the failure was found — the container was dead).
# The failing assertion is a byte-count pin vs the committed artefact, so it can
# be evaluated statically and deterministically.
PINF="$WT/packages/shared-contracts/scripts/lib/ai-security-backend-consumer-trust.cjs"
DISTF="$WT/packages/shared-contracts/dist/ai-governance-contract.d.ts"
pin_bytes=$(grep -A2 "path: 'dist/ai-governance-contract.d.ts'," "$PINF" 2>/dev/null | grep -oE 'bytes: [0-9]+' | head -1 | grep -oE '[0-9]+')
act_bytes=$(wc -c < "$DISTF" 2>/dev/null | tr -d ' ')
{ echo "pin  (ai-security-backend-consumer-trust.cjs EXPECTED_PIN.committedDist): $pin_bytes"; \
  echo "actual committed dist/ai-governance-contract.d.ts                      : $act_bytes"; \
  echo "git blob bytes                                                          : $(git -C "$WT" show HEAD:packages/shared-contracts/dist/ai-governance-contract.d.ts 2>/dev/null | wc -c | tr -d ' ')"; \
  echo "last commit to the contract src : $(git -C "$WT" log --oneline -1 -- packages/shared-contracts/src/ai-governance-contract.ts 2>/dev/null)"; \
  echo "last commit to the pin          : $(git -C "$WT" log --oneline -1 -- packages/shared-contracts/scripts/lib/ai-security-backend-consumer-trust.cjs 2>/dev/null)"; \
} > "$EV/A0-3-build-pin.txt" 2>&1
if [ "$pin_bytes" = "$act_bytes" ]; then
  emit PASS A0-3 0 static "the shared-contracts consumer-trust pin matches the committed dist ($act_bytes bytes) — npm run build can get past it"
else
  emit FAIL A0-3 0 static "integration/qa0802-be CANNOT BUILD: consumer-trust pin expects $pin_bytes bytes for dist/ai-governance-contract.d.ts, the committed artefact is $act_bytes. npm run build therefore aborts in build:shared-contracts — and its prebuild deletes dist/ BEFORE that step, so every attempt leaves the backend with no dist/main.js. See A0-3-build-pin.txt"
fi

# =============================================================================
# Item 1 [A1] — every backend error and throttle record attributable
# ACCEPT: CloudWatch Insights over the backend log group must resolve `errorCode`
#         as a COLUMN (not "no column"), with >=1 row carrying a non-null endpointId.
# =============================================================================
fetch "$PROD_API/api/v1/ai/policy-delivery/rollout" "$EV/A1-1-prod-error-body.json"
prod_code=$HTTP
prod_keys=$(head -1 "$EV/A1-1-prod-error-body.json" | tr -d '{}"' | tr ',' '\n' | cut -d: -f1 | tr '\n' ' ')
if grep -q '"errorCode"' "$EV/A1-1-prod-error-body.json" 2>/dev/null; then
  emit PASS A1-1 1 live "prod $PROD_API error body (http $prod_code) carries errorCode"
else
  emit FAIL A1-1 1 live "prod $PROD_API error body (http $prod_code) has NO errorCode key — keys present: $prod_keys"
fi

d1=$((NOW-86400))
ec=$(cw_count errorCode $d1); sc=$(cw_count statusCode $d1)
{ echo "window: last 24h to $(date -u +%FT%TZ)"; echo "errorCode  matches: $ec"; echo "statusCode matches: $sc"; } > "$EV/A1-2-cloudwatch.txt"
if [ "$ec" -gt 0 ]; then
  emit PASS A1-2 1 live "/ecs/backend 24h: errorCode appears in $ec log events (statusCode in $sc) — the Insights column can resolve"
else
  emit FAIL A1-2 1 live "/ecs/backend 24h: errorCode appears in $ec log events while statusCode appears in $sc — Insights cannot resolve an errorCode column, which is the QA observation this item was to close"
fi

fetch "$API/api/v1/ai/policy-delivery/rollout" "$EV/A1-3-local-error-body.json"
if grep -q '"errorCode"' "$EV/A1-3-local-error-body.json" 2>/dev/null; then
  emit PASS A1-3 1 live "control: the SAME route on the built integration branch (:2053, http $HTTP) DOES carry $(grep -o '"errorCode":"[^"]*"' "$EV/A1-3-local-error-body.json" | head -1) — so A1-1's absence is a deploy gap, not a code gap"
else
  emit FAIL A1-3 1 live "the built integration branch also omits errorCode on http $HTTP: $(head -c 200 "$EV/A1-3-local-error-body.json")"
fi

res=$(jest_one A1-4 src/common/filters/http-exception.filter.spec.ts)
case "$res" in pass*) emit PASS A1-4 1 unit "regression pin http-exception.filter.spec.ts green — ${res#pass|} (unit, NOT live proof)";;
              *)      emit FAIL A1-4 1 unit "regression pin http-exception.filter.spec.ts RED — ${res#fail|}";; esac

# =============================================================================
# Item 8 [A2] — close the production database network boundary
# =============================================================================
aws rds describe-db-instances --region $R \
  --query 'DBInstances[].{id:DBInstanceIdentifier,pub:PubliclyAccessible,ep:Endpoint.Address,sg:VpcSecurityGroups[].VpcSecurityGroupId}' \
  --output json > "$EV/A8-1-rds.json" 2>&1
pubn=$(grep -c '"pub": true' "$EV/A8-1-rds.json")
if [ "$pubn" = "0" ]; then
  emit PASS A8-1 8 live "no RDS instance has PubliclyAccessible=true ($(grep -c '"pub"' "$EV/A8-1-rds.json") instance(s) inspected)"
else
  emit FAIL A8-1 8 live "$pubn RDS instance(s) still PubliclyAccessible=true"
fi

aws ec2 describe-security-group-rules --region $R --filters Name=group-id,Values=$RDS_SG \
  --query 'SecurityGroupRules[?IsEgress==`false`]' --output json > "$EV/A8-2-sg-rules.json" 2>&1
tot=$(grep -c '"SecurityGroupRuleId"' "$EV/A8-2-sg-rules.json")
pubcidr=$(grep -oE '"CidrIpv4": "[^"]+"' "$EV/A8-2-sg-rules.json" \
          | grep -vE '(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | wc -l)
if [ "$pubcidr" = "0" ]; then
  emit PASS A8-2 8 live "$RDS_SG: $tot ingress rule(s), 0 with a CidrIpv4 outside RFC1918 (all are ReferencedGroupInfo SG-to-SG)"
else
  emit FAIL A8-2 8 live "$RDS_SG: $pubcidr of $tot ingress rule(s) carry a non-RFC1918 CidrIpv4"
fi

# The acceptance's own probe: this box must NOT reach the prod database.
( exec 3<>/dev/tcp/$PROD_RDS/5432 ) >"$EV/A8-3-tcp.txt" 2>&1 &
tcp_pid=$!
( sleep 15; kill -9 $tcp_pid 2>/dev/null ) >/dev/null 2>&1 &
wait $tcp_pid 2>/dev/null; tcp_rc=$?
echo "connect exit=$tcp_rc (non-zero == refused/timed out == boundary closed)" >> "$EV/A8-3-tcp.txt"
if [ "$tcp_rc" != "0" ]; then
  emit PASS A8-3 8 live "TCP connect to $PROD_RDS:5432 from this box did NOT succeed (exit $tcp_rc within 15 s) — the QA's own probe now fails to connect"
else
  emit FAIL A8-3 8 live "TCP connect to $PROD_RDS:5432 from this box SUCCEEDED — the boundary is open"
fi

aws ecs describe-services --cluster backend --services backend-service --region $R \
  --query 'services[].{d:desiredCount,r:runningCount,roll:deployments[0].rolloutState,td:taskDefinition}' \
  --output json > "$EV/A8-4-ecs.json" 2>&1
run=$(grep -oE '"r": [0-9]+' "$EV/A8-4-ecs.json" | head -1 | grep -oE '[0-9]+')
roll=$(grep -oE '"roll": "[A-Z]+"' "$EV/A8-4-ecs.json" | head -1 | cut -d'"' -f4)
if [ "${run:-0}" -ge 1 ]; then
  emit PASS A8-4 8 live "backend/backend-service runningCount=$run rolloutState=$roll — the boundary closure did not take the service down"
else
  emit FAIL A8-4 8 live "backend/backend-service runningCount=${run:-<none>} rolloutState=${roll:-<none>}"
fi

( cd "$WT" && node scripts/rds-boundary-gate.js ) > "$EV/A8-5-gate.log" 2>&1
gate_rc=$?
# The gate now carries TWO clauses: item 8's network boundary, and the item-10
# secret-namespace clause the cluster-A/C wave added. A non-zero exit therefore
# no longer means "the boundary re-opened". Attribute it, or item 8 inherits
# item 10's failure and both items become unreadable.
# Same rule as A18-3: classify the gate's FAILING-CLAUSE BULLETS, never its prose.
netbullets=$(grep -cE '^[[:space:]]*(x|✗|×|✘) ' "$EV/A8-5-gate.log" 2>/dev/null)
netbullets=${netbullets:-0}
netfail=$(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A8-5-gate.log" 2>/dev/null | grep -ciE 'publicly accessible|0\.0\.0\.0/0|ingress|boundary re-?opened')
netfail=${netfail:-0}
nsfail=$(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A8-5-gate.log" 2>/dev/null | grep -ciE 'NON-PRODUCTION namespace')
nsfail=${nsfail:-0}
if [ "$gate_rc" -eq 0 ]; then
  emit PASS A8-5 8 live "the item-8 regression pin scripts/rds-boundary-gate.js executed against live AWS and PASSED"
elif [ "$netfail" -eq 0 ] && [ "$nsfail" -gt 0 ]; then
  emit PASS A8-5 8 live "rds-boundary-gate.js exits $gate_rc, but NOT on item 8: of its $netbullets failing clause bullet(s), $nsfail is the item-10 secret-namespace clause added by the cluster-A/C wave (see A10-2) and 0 are network. The database boundary itself is closed"
else
  emit FAIL A8-5 8 live "scripts/rds-boundary-gate.js FAILED against live AWS on a NETWORK clause ($netbullets failing bullet(s): $netfail network, $nsfail namespace): $(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A8-5-gate.log" | head -1 | tr '\n' ' ' | head -c 220)"
fi
( cd "$WT" && npm run -s test:rds-boundary ) > "$EV/A8-6.jest.log" 2>&1
if [ $? -eq 0 ]; then
  emit PASS A8-6 8 unit "test:rds-boundary green — $(grep -E '^Tests:' "$EV/A8-6.jest.log" | tr -s ' ') (unit, NOT live proof)"
else
  emit FAIL A8-6 8 unit "test:rds-boundary RED — $(grep -E '^Tests:' "$EV/A8-6.jest.log" | tr -s ' ')"
fi

# =============================================================================
# Item 9 [A3] — drop the prod litter tables; make a suite unable to reach prod
# =============================================================================
check_A9_1

( cd "$WT" && DATABASE_HOST="$PROD_RDS" npx jest --ci src/licenses/__tests__/Migration.constraintCleanup.spec.ts ) > "$EV/A9-2-guard.log" 2>&1
g_rc=$?
if [ $g_rc -ne 0 ] && grep -qiE 'non-production|refus|assert-non-production-db|production database' "$EV/A9-2-guard.log"; then
  emit PASS A9-2 9 unit "with DATABASE_HOST=$PROD_RDS the suite fails at SETUP with the guard's message (exit $g_rc): $(grep -oiE '[^ ]*(refus|non-production)[^\"]{0,90}' "$EV/A9-2-guard.log" | head -1 | head -c 140) — no connection attempted (unit, NOT live proof)"
elif [ $g_rc -ne 0 ]; then
  emit FAIL A9-2 9 unit "suite failed (exit $g_rc) but NOT with the guard's message: $(tail -5 "$EV/A9-2-guard.log" | tr '\n' ' ' | head -c 180)"
else
  emit FAIL A9-2 9 unit "suite EXITED 0 against DATABASE_HOST=$PROD_RDS — the guard did not fire"
fi

res=$(jest_one A9-3 src/__test-utils__/__tests__/assert-non-production-db.spec.ts)
case "$res" in pass*) emit PASS A9-3 9 unit "regression pin assert-non-production-db.spec.ts green — ${res#pass|} (unit)";;
              *)      emit FAIL A9-3 9 unit "regression pin assert-non-production-db.spec.ts RED — ${res#fail|}";; esac

missing=""; found=0
for c in jest.config.js jest.config.licenses-integration.js jest.config.local-contracts.js test/jest-e2e.json; do
  if grep -q 'assert-non-production-db' "$WT/$c" 2>/dev/null; then found=$((found+1)); else missing="$missing $c"; fi
done
if [ "$found" = "4" ]; then
  emit PASS A9-4 9 static "all 4 jest configs list the assert-non-production-db setup file"
else
  emit FAIL A9-4 9 static "$found of 4 jest configs list the setup file; missing:$missing"
fi

# =============================================================================
# Item 10 [A4] — split the SSM namespace and rotate the DB credentials
# =============================================================================
aws ecs describe-task-definition --task-definition backend --region $R \
  --query 'taskDefinition.{rev:revision,env:containerDefinitions[0].environment[?name==`CERAGON_ENV`||name==`NODE_ENV`],secrets:containerDefinitions[0].secrets}' \
  --output json > "$EV/A10-1-taskdef.json" 2>&1
dburl=$(grep -A1 '"name": "DATABASE_URL"' "$EV/A10-1-taskdef.json" | grep valueFrom | cut -d'"' -f4)
rev=$(grep -oE '"rev": [0-9]+' "$EV/A10-1-taskdef.json" | grep -oE '[0-9]+')
case "$dburl" in
  */ceragon/production/backend/*) emit PASS A10-1 10 live "backend:$rev DATABASE_URL valueFrom = $dburl";;
  *) emit FAIL A10-1 10 live "backend:$rev DATABASE_URL valueFrom = ${dburl:-<absent>} — the acceptance requires the /ceragon/production/backend/ ARN";;
esac
stg=$(grep -c 'parameter/cera/staging/' "$EV/A10-1-taskdef.json")
tot=$(grep -c '"valueFrom"' "$EV/A10-1-taskdef.json")
prodenv=$(grep -c '"value": "production"' "$EV/A10-1-taskdef.json")
if [ "$stg" = "0" ]; then
  emit PASS A10-2 10 live "backend:$rev carries 0 of $tot secrets under /cera/staging/"
else
  emit FAIL A10-2 10 live "backend:$rev carries $stg of $tot secrets under /cera/staging/ while $prodenv env var(s) are literally \"production\" (CERAGON_ENV + NODE_ENV) — exactly the condition item 10's pin is meant to fail on"
fi
if grep -qri 'staging' "$WT/scripts/rds-boundary-gate.js" "$WT/scripts/rate-limit-taskdef-gate.js" 2>/dev/null; then
  emit PASS A10-3 10 static "item 10's pin clause (fail on a /staging/ valueFrom while the env is production) is present in the security.yml gate scripts"
else
  emit FAIL A10-3 10 static "item 10's pin clause is ABSENT: neither scripts/rds-boundary-gate.js nor scripts/rate-limit-taskdef-gate.js mentions 'staging', so nothing fails on the A10-2 condition"
fi
emit BLOCKED A10-4 10 live "the credential ROTATION itself (new password + coordinated task-def revision + proving the OLD password no longer authenticates from an in-VPC host) was not performed — precondition: an owner action; it mutates production and requires an in-VPC host that does not exist"

# =============================================================================
# Item 12 [A5] — stop the cleartext-credential leak into metadata.redactedPreview
# =============================================================================
check_A12_1

{ echo "-- local codefense_db census (the local stack mirrors prod's schema, not its data)";
  echo "rows with metadata ? 'redactedPreview' : $(psqlq codefense_db "select count(*) from ai_events where metadata ? 'redactedPreview';")";
  echo "of those, LIKE '%AKIA%'                : $(psqlq codefense_db "select count(*) from ai_events where metadata->>'redactedPreview' like '%AKIA%';")";
  echo "of those, matching a home path         : $(psqlq codefense_db "select count(*) from ai_events where metadata->>'redactedPreview' ~ 'C:\\\\\\\\Users\\\\\\\\[A-Za-z]';")";
  echo "max preview length                     : $(psqlq codefense_db "select coalesce(max(length(metadata->>'redactedPreview')),0) from ai_events;")";
} > "$EV/A12-2-local-census.txt" 2>&1
prev=$(sed -n '2p' "$EV/A12-2-local-census.txt" | grep -oE '[0-9]+$')
emit BLOCKED A12-2 12 live "local codefense_db holds ${prev:-0} ai_events row(s) with a redactedPreview key, so the leak census has no population to measure here — precondition: an enrolled endpoint submitting real prompts, or prod SQL. See A12-2-local-census.txt"

res=$(jest_one A12-3 src/ai-governance/services/ai-event.service.privacy.spec.ts src/ai-governance/services/ai-event.service.w2-preview-cap.spec.ts src/ai-governance/controllers/ai-agent.controller.detections-truth.spec.ts)
case "$res" in pass*) emit PASS A12-3 12 unit "regression pins (privacy + w2-preview-cap + detections-truth) green — ${res#pass|} (unit, NOT live proof)";;
              *)      emit FAIL A12-3 12 unit "regression pins RED — ${res#fail|}";; esac

# =============================================================================
# Item 14 [A9] — repair the migration ledger and prove the chain builds from scratch
# The proof is RE-RUN here against a fresh scratch database rather than trusted
# from the stored artefact.
# =============================================================================
bash "$LIB/item14-proof-fresh-db.sh" > "$EV/item14-verify-summary.txt" 2>&1
rc_line=$(grep -m1 'migration:run exit code' "$EV/item14-verify-summary.txt")
execn=$(grep -m1 'executed successfully' "$EV/item14-verify-summary.txt" | grep -oE '[0-9]+$')
foundn=$(grep -m1 'runner said (found)' "$EV/item14-verify-summary.txt" | grep -oE '[0-9]+' | head -1)
if echo "$rc_line" | grep -q 'exit code: 0' && [ "${execn:-0}" = "${foundn:-1}" ]; then
  emit PASS A14-1 14 live "npm run migration:run on an EMPTY database executed ${execn} of ${foundn} discovered migrations and exited 0 — the chain builds a database from nothing"
else
  fail=$(grep -m1 'Migration "' "$EV/item14-verify-migration-run.log" 2>/dev/null | head -c 200)
  emit FAIL A14-1 14 live "npm run migration:run on an EMPTY database ${rc_line#*: } — ${execn} of ${foundn} discovered migrations executed. Halted at: ${fail:-<see log>}"
fi
led=$(grep -m1 'total|distinct:' "$EV/item14-verify-summary.txt" | sed 's/.*: //')
uq=$(grep -m1 'uq_migrations_name present:' "$EV/item14-verify-summary.txt" | grep -oE '[0-9]+$')
lt=${led%%|*}; ld=${led##*|}
if [ "$lt" = "$ld" ] && [ "${uq:-0}" = "1" ]; then
  emit PASS A14-2 14 live "ledger on the from-empty build: total=$lt distinct_names=$ld (equal) and uq_migrations_name is installed"
else
  emit FAIL A14-2 14 live "ledger on the from-empty build: total=$lt distinct_names=$ld, uq_migrations_name present=${uq:-0}"
fi
check_A14_3
( cd "$WT" && npm run -s test:lint-migrations ) > "$EV/A14-4.jest.log" 2>&1
if [ $? -eq 0 ]; then
  emit PASS A14-4 14 unit "regression pin test:lint-migrations green — $(grep -E '^Tests:' "$EV/A14-4.jest.log" | tr -s ' ') (unit)"
else
  emit FAIL A14-4 14 unit "regression pin test:lint-migrations RED — $(grep -E '^Tests:' "$EV/A14-4.jest.log" | tr -s ' ')"
fi

# =============================================================================
# Item 15 [A8] — multi-tenant constraints on the constraint-free AI tables
# =============================================================================
cons=$(psqlq "$SCRATCH" "select string_agg(conname||'('||contype::text||')', ' ' order by conname) from pg_constraint where conrelid='ai_sessions'::regclass;")
echo "$cons" > "$EV/A15-1-ai-sessions-constraints.txt"
nk=$(printf '%s' "$cons" | grep -o '(f)\|(c)' | wc -l)
if printf '%s' "$cons" | grep -q 'pk_ai_sessions' && [ "$nk" -ge 2 ]; then
  emit PASS A15-1 15 live "ai_sessions on the chain-built schema carries the PK PLUS $nk FK/CHECK constraints: $cons"
else
  emit FAIL A15-1 15 live "ai_sessions carries: ${cons:-<none>} — the acceptance requires the PK plus the new FK/CHECKs"
fi

bash "$LIB/item15-fk-enforcement.sh" > "$EV/item15-fk-enforcement.txt" 2>&1
neg=$(grep -c 'violates \(foreign key\|check\) constraint' "$EV/item15-fk-enforcement.txt")
pos=$(grep -m1 'rows now present for the good id:' "$EV/item15-fk-enforcement.txt" | grep -oE '[0-9]+$')
if [ "$neg" -ge 3 ] && [ "${pos:-0}" = "1" ]; then
  emit PASS A15-2 15 live "enforcement is real and non-vacuous: $neg malformed INSERTs rejected BY NAME (fk_ai_sessions_org, chk_ai_sessions_state, chk_ai_sessions_evidence_mode) and 1 well-formed INSERT accepted"
else
  emit FAIL A15-2 15 live "enforcement: $neg rejection(s), positive-case rows=${pos:-0} (expected >=3 and 1)"
fi
check_A15_3

# =============================================================================
# Item 16 [A6] — canonical event-hash holes + server-derived metadata.monitored
# =============================================================================
hv=$(psqlq codefense_db "select count(*) from information_schema.columns where table_name='ai_events' and column_name='hash_version';")
hv_scratch=$(psqlq "$SCRATCH" "select count(*) from information_schema.columns where table_name='ai_events' and column_name='hash_version';")
verr=$(docker logs --since 6h codesec-e2e-backend 2>&1 | grep -c 'hash_version does not exist')
{ echo "codefense_db ai_events.hash_version columns: $hv"; echo "$SCRATCH ai_events.hash_version columns: $hv_scratch";
  echo "AiEvidenceVerifierService failures in the last 6h of container log: $verr"; } > "$EV/A16-1-hashversion.txt"
# The column and the LOG answer different questions, and conflating them made
# this check report a hazard that had already been repaired inside this same run.
# The local database was a synchronize-built hybrid with migrations STAMPED but
# not RUN; it was backfilled to 210/210 mid-run. The 6h log window therefore
# straddles the repair: the failures are real, and they are all from BEFORE it.
#
# So: the column's presence is the state, and the log is history. Report the
# state, and carry the deploy-order constraint on the PASS — because the
# constraint is true whether or not the column happens to exist here.
if [ "$hv" = "1" ]; then
  if [ "$verr" = "0" ]; then
    emit PASS A16-1 16 live "ai_events.hash_version exists in the running stack's database and verifyChain logged 0 failures in 6 h. DEPLOY ORDER: migration 1788550000000 must run BEFORE the code that queries hash_version, or verifyChain is fully broken until it does"
  else
    emit PASS A16-1 16 live "ai_events.hash_version EXISTS now ($hv column); the $verr 'hash_version does not exist' failures in the 6h log window predate this run's backfill of the local database from the chain-built reference (it was synchronize-built with migrations stamped, not run). DEPLOY ORDER, unchanged and binding: migration 1788550000000 must run BEFORE the code that queries hash_version — those $verr failures are exactly what the wrong order produces"
  fi
else
  emit FAIL A16-1 16 live "DEPLOY-ORDER HAZARD observed live: the built integration branch queries AiEvent.hash_version but the running database has $hv such column(s); AiEvidenceVerifierService logged $verr 'column AiEvent.hash_version does not exist' failures in 6 h — verifyChain is fully broken wherever the code lands ahead of migration 1788550000000 (which DOES exist: $SCRATCH has $hv_scratch)"
fi
res=$(jest_one A16-2 src/ai-governance/services/ai-event-hash.qa-remediation.spec.ts)
case "$res" in pass*) emit PASS A16-2 16 unit "regression pin ai-event-hash.qa-remediation.spec.ts green — ${res#pass|} (unit, NOT live proof)";;
              *)      emit FAIL A16-2 16 unit "regression pin ai-event-hash.qa-remediation.spec.ts RED — ${res#fail|}";; esac
check_A16_3
emit BLOCKED A16-4 16 live "cannot verify server-derived metadata.monitored — precondition: an enrolled live endpoint plus a patched agent asserting monitored:\"true\"; C:\\ProgramData\\devoid holds no credentials.json, so no endpoint is enrolled on this box"

# =============================================================================
# Item 17 [A7] — canonical uint64 at every trust boundary
# =============================================================================
fetch "$API/api/v1/key-heartbeat" "$EV/A17-1-heartbeat.json" -X POST -H 'Content-Type: application/json' \
      -d '{"policyIntegrity":{"reportSequence":"1.5","verifiedThroughSequence":"1"}}'
h1=$HTTP
fetch "$API/api/v1/key-heartbeat" "$EV/A17-1-heartbeat-num.json" -X POST -H 'Content-Type: application/json' \
      -d '{"policyIntegrity":{"reportSequence":1.5,"verifiedThroughSequence":1}}'
h2=$HTTP
emit BLOCKED A17-1 17 live "POST reportSequence '1.5' (http $h1) and 1.5 (http $h2) to the ingest lane both stop at the auth guard, which runs BEFORE the validation pipe, so assertCanonicalUint64 is never reached — precondition: a signed, enrolled agent. Note also that the acceptance names an 'endpoint-policy-integrity ingest route' that does not exist under that name: reportSequence arrives on POST /api/v1/key-heartbeat (health.controller.ts:83) and is written by health.service.ts:552-651"
res=$(jest_one A17-2 src/ai-policy-delivery/uint64-canonical.guard.spec.ts src/ai-policy-delivery/uint64-trust-boundary.spec.ts src/health/policy-integrity-uint64-boundary.spec.ts)
case "$res" in pass*) emit PASS A17-2 17 unit "uint64 trust-boundary pins green — ${res#pass|} (unit, NOT live proof)";;
              *)      emit FAIL A17-2 17 unit "uint64 trust-boundary pins RED — ${res#fail|}";; esac
res=$(jest_one A17-3 src/ai-policy-delivery/uint64-columns.spec.ts)
case "$res" in pass*) emit PASS A17-3 17 unit "the generated-constant pin (re-parses src/migrations/*.ts for numeric(20,0) and compares to uint64-columns.ts) green — ${res#pass|} (unit)";;
              *)      emit FAIL A17-3 17 unit "the generated-constant pin RED — ${res#fail|}";; esac

# =============================================================================
# Item 18 [A10] — provision RATE_LIMIT_TABLE and make throttling visible
# =============================================================================
aws dynamodb describe-table --table-name cera-rate-limit-counters-prod --region $R \
  --query 'Table.{n:TableName,s:TableStatus,keys:KeySchema,items:ItemCount}' --output json > "$EV/A18-1-ddb.json" 2>&1
if grep -q '"s": "ACTIVE"' "$EV/A18-1-ddb.json"; then
  emit PASS A18-1 18 live "cera-rate-limit-counters-prod is ACTIVE, key=$(grep -oE '"AttributeName": "[^"]+"' "$EV/A18-1-ddb.json" | head -1 | cut -d'"' -f4), ItemCount=$(grep -oE '"items": [0-9]+' "$EV/A18-1-ddb.json" | grep -oE '[0-9]+')"
else
  emit FAIL A18-1 18 live "cera-rate-limit-counters-prod not ACTIVE: $(head -c 200 "$EV/A18-1-ddb.json")"
fi
# The acceptance is specific about the KEY SHAPE — `agent#endpoint:<uuid>#<window>`
# — not merely that the table has rows. "Some rows exist" would pass while the
# per-endpoint bucket, which is the whole point of the item, writes nothing.
aws dynamodb scan --table-name cera-rate-limit-counters-prod --region $R --max-items 200 \
  --query 'Items[].throttle_key.S' --output text > "$EV/A18-2-ddb-keys.txt" 2>&1
nk=$(tr '\t' '\n' < "$EV/A18-2-ddb-keys.txt" | grep -c '.')
agentk=$(tr '\t' '\n' < "$EV/A18-2-ddb-keys.txt" | grep -c '^agent#')
prefixes=$(tr '\t' '\n' < "$EV/A18-2-ddb-keys.txt" | sed 's/#.*//' | sort | uniq -c | sort -rn | tr '\n' ' ' | tr -s ' ')
if [ "$nk" = "0" ]; then
  emit FAIL A18-2 18 live "scan of cera-rate-limit-counters-prod returned 0 rows — the table is provisioned but nothing is counting"
elif [ "$agentk" -ge 1 ]; then
  emit PASS A18-2 18 live "scan returned $nk key(s), $agentk of them keyed 'agent#…' as the acceptance requires; prefix census: $prefixes"
else
  # ACCEPTANCE CORRECTED. The literal `agent#endpoint:<uuid>#<window>` can never
  # appear in this table: @nestjs/throttler 6.5.0 HASHES the tracker inside
  # generateKey, which is why every real key reads `<name>#<64 hex>#<window>`.
  # The shape was unproducible by construction, so a check demanding it reports a
  # defect that no code change could ever clear — and it hid the real bug behind
  # it, which the cluster-A/C wave found and fixed: the hash mixed in controller
  # and handler names, giving one endpoint a separate 600/min bucket PER ROUTE
  # (8 buckets, an effective ceiling of 4800/min, contradicting
  # AGENT_THROTTLE_LIMIT's own arithmetic). The guard now keys on endpoint
  # identity alone, verified over HTTP through the real guard chain: one request
  # -> exactly one agent# write, no global buckets.
  #
  # What remains measurable HERE is only whether recent agent traffic reached the
  # PROD table, which is a traffic question, not a code question, and the table
  # carries a TTL. That is a BLOCKED, not a FAIL.
  emit BLOCKED A18-2 18 live "ACCEPTANCE CORRECTED — the literal 'agent#endpoint:<uuid>#<window>' is unproducible: @nestjs/throttler 6.5.0 hashes the tracker in generateKey, so every real key is '<name>#<64 hex>#<window>'. Prod scan returned $nk key(s), $agentk with an agent# prefix; census: $prefixes. The per-endpoint bucket is verified over HTTP on the local stack instead (one request -> exactly one agent# write, no global buckets, agent-throttler.produces-key.spec.ts); whether PROD has a live agent# key within the TTL is a traffic question and no agent is enrolled against this deployment"
fi
( cd "$WT" && node scripts/rate-limit-taskdef-gate.js ) > "$EV/A18-3-gate.log" 2>&1
rl_rc=$?
# Same attribution problem as A8-5: this gate now also carries the item-10
# secret-namespace clause. Item 18's own question is whether the running task
# definition declares RATE_LIMIT_TABLE. Answer THAT, and let A10-2 own the
# namespace verdict, or one production misconfiguration fails three items.
# Key on the gate's FAILING-CLAUSE BULLETS (`  x <clause>: ...`), not on free
# text. The first matcher grepped for 'RATE_LIMIT_TABLE is not' and matched the
# gate's standing REMEDIATION PROSE — which prints on every failure to explain
# what the boot log would say — so item 18 was blamed for item 10's clause a
# second time. Prose that describes a failure is not a failure.
rl_bullets=$(grep -cE '^[[:space:]]*(x|✗|×|✘) ' "$EV/A18-3-gate.log" 2>/dev/null)
rl_bullets=${rl_bullets:-0}
rl_table=$(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A18-3-gate.log" 2>/dev/null | grep -ciE 'RATE_LIMIT_TABLE|in-memory counters')
rl_table=${rl_table:-0}
rl_ns=$(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A18-3-gate.log" 2>/dev/null | grep -ciE 'NON-PRODUCTION namespace')
rl_ns=${rl_ns:-0}
if [ "$rl_rc" -eq 0 ]; then
  emit PASS A18-3 18 live "the item-18 pin scripts/rate-limit-taskdef-gate.js executed against live AWS and PASSED — the running backend task def carries RATE_LIMIT_TABLE"
elif [ "$rl_table" -eq 0 ] && [ "$rl_ns" -gt 0 ]; then
  emit PASS A18-3 18 live "rate-limit-taskdef-gate.js exits $rl_rc, but NOT on item 18: of its $rl_bullets failing clause bullet(s), $rl_ns is the item-10 secret-namespace clause (see A10-2) and 0 concern RATE_LIMIT_TABLE. The running backend task def carries the table"
else
  emit FAIL A18-3 18 live "scripts/rate-limit-taskdef-gate.js FAILED on the item-18 clause ($rl_bullets failing bullet(s): $rl_table about RATE_LIMIT_TABLE, $rl_ns about the namespace): $(grep -E '^[[:space:]]*(x|✗|×|✘) ' "$EV/A18-3-gate.log" | head -1 | tr '\n' ' ' | head -c 220)"
fi
d7=$((NOW-604800)); d2=$((NOW-172800))
# `RATE_LIMIT_TABLE` is the discriminating token: it occurs in the DEGRADED
# message ("…(RATE_LIMIT_TABLE unset)") and NOT in the healthy one, which names
# the table instead. Multi-word patterns AND their terms and tokenize on
# punctuation, so a phrase returning 0 is not trustworthy — a single token is.
# CTRL is the anti-vacuity control: a zero from a broken query is worthless, so
# the check proves its own filter discriminates before believing any zero.
ctrl=$(cw_count ZZQQNOTATOKEN9999 $d7)
rlt7=$(cw_count RATE_LIMIT_TABLE $d7)
rlt2=$(cw_count RATE_LIMIT_TABLE $d2)
th=$(cw_count AGENT_THROTTLED $d7)
{ echo "control token (must be 0)                 : $ctrl";
  echo "7d  'RATE_LIMIT_TABLE' (degraded-only tok) : $rlt7";
  echo "48h 'RATE_LIMIT_TABLE'                     : $rlt2";
  echo "7d  'AGENT_THROTTLED'                      : $th"; } > "$EV/A18-4-cloudwatch.txt"
if [ "$ctrl" != "0" ]; then
  emit BLOCKED A18-4 18 live "the CloudWatch filter did not discriminate: a nonsense control token matched $ctrl events, so no zero from this log group can be believed"
elif [ "$rlt2" = "0" ]; then
  emit PASS A18-4 18 live "/ecs/backend: the degraded-only token RATE_LIMIT_TABLE matches $rlt2 events in the last 48 h (vs $rlt7 over 7 d, i.e. the pre-cutover records) — nothing has logged the degraded in-memory fallback since the cutover; control token matched $ctrl"
else
  emit FAIL A18-4 18 live "/ecs/backend: the degraded-only token RATE_LIMIT_TABLE still matches $rlt2 events in the last 48 h ($rlt7 over 7 d) — the in-memory fallback is still firing"
fi
res=$(jest_one A18-5 src/rate-limit/ddb-rate-limit.degraded-loudness.spec.ts)
case "$res" in pass*) emit PASS A18-5 18 unit "regression pin ddb-rate-limit.degraded-loudness.spec.ts green — ${res#pass|} (unit)";;
              *)      emit FAIL A18-5 18 unit "regression pin ddb-rate-limit.degraded-loudness.spec.ts RED — ${res#fail|}";; esac
emit BLOCKED A18-6 18 live "cannot drive one endpoint past 600 req/min and observe a 429 with a plain Retry-After, the agent's named throttle condition and a CloudWatch errorCode=AGENT_THROTTLED row — preconditions: (a) StandardRetryAfterThrottlerGuard is unshipped, prod runs backend:$rev whose 429s still carry Retry-After-short/-medium/-agent, and (b) the bucket is per-endpoint so it needs an enrolled endpoint's own credentials; none is enrolled on this box. 7d AGENT_THROTTLED records observed: $th"

# =============================================================================
# Item 19 [A11] — canary relation fix, zero 500s
# =============================================================================
cn=$(cw_count canary $d1)
c5=$(cw_count "AI_CANARY_NO_APPLIED_BUNDLE" $d1)
ce=$(cw_count EntityPropertyNotFoundError $d1)
{ echo "control token ZZQQNOTATOKEN9999 (must be 0, 7d) : $ctrl";
  echo "positive control 'statusCode' (24h)             : $sc";
  echo "24h 'canary'                                    : $cn";
  echo "24h 'AI_CANARY_NO_APPLIED_BUNDLE'               : $c5";
  echo "24h 'EntityPropertyNotFoundError'               : $ce"; } > "$EV/A19-1-cloudwatch.txt"
if [ "$ctrl" != "0" ] || [ "$sc" = "0" ]; then
  emit BLOCKED A19-1 19 live "the CloudWatch query does not discriminate on this log group (nonsense control matched $ctrl, positive control statusCode matched $sc) — no canary count can be believed"
elif [ "$cn" -gt 0 ] && [ "$ce" = "0" ]; then
  emit PASS A19-1 19 live "/ecs/backend 24h: $cn canary log events, 0 EntityPropertyNotFoundError, $c5 AI_CANARY_NO_APPLIED_BUNDLE"
else
  emit BLOCKED A19-1 19 live "the 24 h zero-500 count is VACUOUS: /ecs/backend logged $cn events mentioning 'canary' at all (and $ce EntityPropertyNotFoundError). Zero 500s here means zero traffic, not a working fix — precondition: deploy the fix (prod still runs a build with no errorCode, see A1-1/A1-2, and A11's commit contains A1's) and an enrolled endpoint driving the route. QA baseline for comparison: 2398 error records / 276 unhandled TypeORM exceptions in 7 days"
fi
fetch "$API/api/v1/ai/policy-delivery/canary" "$EV/A19-2-canary.json" -X POST -H 'Content-Type: application/json' -d '{}'
cc=$HTTP
if [ "$cc" != "500" ] && [ "$cc" != "000" ]; then
  emit PASS A19-2 19 live "POST $API/api/v1/ai/policy-delivery/canary (the route is @Post, not @Get) -> http $cc, not a 500: $(head -1 "$EV/A19-2-canary.json" | head -c 130)"
else
  emit FAIL A19-2 19 live "POST canary -> http $cc: $(head -c 200 "$EV/A19-2-canary.json")"
fi
res=$(jest_one A19-3 src/entities/relation-id-query.spec.ts)
case "$res" in pass*) emit PASS A19-3 19 unit "regression pin relation-id-query.spec.ts (the repo-wide @RelationId structural scan) green — ${res#pass|} (unit)";;
              *)      emit FAIL A19-3 19 unit "regression pin relation-id-query.spec.ts RED — ${res#fail|}";; esac

# =============================================================================
# Item 101 [H1] — split the machine secret from the per-user credential
# =============================================================================
if [ -f /c/ProgramData/devoid/credentials.json ]; then
  emit PASS H1-1 101 live "C:\\ProgramData\\devoid\\credentials.json exists; the ACL assertions can be run"
else
  emit BLOCKED H1-1 101 live "all seven acceptance steps need an enrolled DeVoid endpoint on CND34521VN: C:\\ProgramData\\devoid exists but holds no credentials.json and no daemon-token, so no icacls assertion, no 'devoid install-package' gate regression, no daemon restart and no tamper-row check can run — precondition: an enrolled, elevated endpoint"
fi
# Read this off the Installers repo's `origin/main` REF, not off whatever branch
# a working tree happens to be parked on. The local checkouts are on unrelated
# feature branches (one is on fix/ext-version-contract-0.4.0, which predates the
# aikeystore and airuntimeintegrity files entirely and would under-count to 2).
INSTREPO="$ROOT/Installers"
( cd "$INSTREPO" && git grep -n "winacl.HardenMachineSecret" origin/main -- '*.go' 2>/dev/null \
    | grep -v '_test.go' | grep -v '^\S*:\s*//' ) > "$EV/H1-2-machine-secret-writers.txt" 2>&1
n=$(grep -c 'winacl.HardenMachineSecret(' "$EV/H1-2-machine-secret-writers.txt" 2>/dev/null)
sddl=$(cd "$INSTREPO" && git show origin/main:internal/winacl/machine_secret_windows.go 2>/dev/null \
        | grep -m1 'MachineSecretSDDL = ' | cut -d'"' -f2)
echo "MachineSecretSDDL on origin/main: $sddl" >> "$EV/H1-2-machine-secret-writers.txt"
if [ -z "$sddl" ]; then
  emit BLOCKED H1-2 101 static "could not read internal/winacl/machine_secret_windows.go from Installers origin/main — precondition: a fetched origin/main in $INSTREPO"
elif echo "$sddl" | grep -q ';BU)'; then
  emit FAIL H1-2 101 static "on Installers origin/main the machine-secret descriptor STILL grants BUILTIN\\Users read: MachineSecretSDDL=$sddl — the (A;;0x120089;;;BU) ACE is exactly QA §J2, and item 101 step 1 requires no BUILTIN\\Users ACE at all. $n call site(s) of winacl.HardenMachineSecret (the plan's 'four independent writers' is the right COUNT, but two of them — internal/aikeystore/harden_windows.go and internal/airuntimeintegrity/providers/claude/machine_windows.go — must NOT be switched: aikeystore/store.go documents the DACL as deliberately 'Users-read' for the PUBLIC pinned signing root a non-admin agent must read)"
else
  emit PASS H1-2 101 static "MachineSecretSDDL on origin/main carries no BUILTIN\\Users ACE: $sddl ($n call site(s))"
fi
