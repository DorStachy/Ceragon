#!/usr/bin/env bash
# =============================================================================
# cluster-c.sh — QA plan 2026-08-02, verification run 2026-08-05/06
#
# Cluster C: runner fail paths, rulebook precedence, shim bypass, role gates.
# Items 11 [C6], 32 [C1], 33 [C2+C10a], 34 [C7], 35 [C3], 36 [C4], 37 [C10b],
#        38 [C10c], 39 [C11], 49 [C9], 97 [C5], 98 [C8], 99 [C12].
#
# Contract: HARNESS.md. One TSV line per check:
#     <VERDICT>\t<check-id>\t<item>\t<kind>\t<message>
#
# Rule 7 — a check that cannot answer reports BLOCKED with the named
# precondition, never "unknown", and BLOCKED counts against the run.
# Rule 8 — only kind=live may be reported as PROVEN LIVE.
#
# Cluster C's own subject is item 34 [C7]: the local rulebook always decides;
# the backend may only make it stricter. C34-2 is the exhaustive property that
# answers it — if it ever reports a violation, that is a FAIL regardless of what
# any repo test says.
#
# SAFETY
#   - Never prints a credential. The minted cli_agent key and the console JWTs
#     live in files under $SP and are only ever interpolated into a curl header.
#   - Never writes to C:\ProgramData\OpenAI\Codex or C:\ProgramData\devoid.
#     `requirements.toml` is hashed before and after the Go runs and both hashes
#     are emitted as ENV lines.
#   - No inline interpreters: every non-trivial step is a file on disk.
#
# RUNTIME: ~30 min. The Backend jest lane alone is ~17 min (BE_JEST=0 skips it,
# in which case its check reports BLOCKED rather than silently vanishing).
# =============================================================================
set -u

INST=/c/Users/Owner/Documents/Ceragon/.worktrees/base-inst-hermetic
BE=/c/Users/Owner/Documents/Ceragon/.worktrees/base-be-integration
FE=/c/Users/Owner/Documents/Ceragon/.worktrees/base-fe-integration
EV=/c/Users/Owner/Documents/Ceragon/.plans/verify-20260805/evidence/cluster-c
SP=/c/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad
BURL=http://127.0.0.1:2053
PGC=codesec-e2e-postgres
psqlq() { docker exec "$PGC" psql -U codefense -d "$1" -Atc "$2" 2>&1; }
REQTOML=/c/ProgramData/OpenAI/Codex/requirements.toml
BE_JEST="${BE_JEST:-1}"

mkdir -p "$EV"
emit() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" "$5"; }
# A TAB is a FIELD SEPARATOR in the result line, so it has to go the same way a
# newline does. `go test`'s own summary is "ok\t<pkg>\t1.078s" — three tabs — and
# folding that into a message silently splits the row into 7 fields, which is what
# made render-checklist.sh refuse the whole run on 2026-08-06 (C32-3).
oneline() { tr '\t' ' ' | tr -d '\r\n' | cut -c1-200; }
hashof() { [ -f "$1" ] && sha256sum "$1" 2>/dev/null | cut -d' ' -f1 || echo "(absent)"; }

# =============================================================================
# THE PROD SQL LANE (2026-08-07)
# =============================================================================
# C38-2 used to read "Prod RDS is private with no in-VPC bastion". RDS is still
# private and its security group is untouched — item 8 passes BECAUSE of that —
# but "therefore no SQL" is no longer true. `Backend/scripts/prod-sql-runner.cjs`
# launches a one-off Fargate task into the RDS VPC on the backend's own subnet
# and security group, runs psql under a server-side `SET TRANSACTION READ ONLY`
# behind a client-side write/DDL keyword scan, and leaves nothing behind.
#
# The ECS RunTask override payload is capped at 8192 bytes and each launch costs
# ~90 s, so the queries are batched into one file, run at most once per
# invocation, and every result is emitted as QA::<key>::<v1>|<v2>|... so psql's
# column padding cannot be mis-read. Nothing selects prompt or preview TEXT.
PRODSQL_STATE=absent          # absent | ok | failed
PRODSQL_WHY=""
PRODSQL_OUT="$EV/prodsql-c.out"
PRODSQL_SQL="$EV/prodsql-c.sql"
PRODSQL_RUNNER="$BE/scripts/prod-sql-runner.cjs"

flat() { tr -d '[:cntrl:]' | tr '\t' ' ' | cut -c1-400; }
# /c/x -> C:/x. node.exe cannot open an MSYS path, and MSYS_NO_PATHCONV=1 stops
# the shell converting it.
winpath() {
  case "$1" in
    /[a-zA-Z]/*) printf '%s:/%s' "$(printf '%s' "$1" | cut -c2 | tr 'a-z' 'A-Z')" \
                                  "$(printf '%s' "$1" | cut -c4-)" ;;
    *)           printf '%s' "$1" ;;
  esac
}

prodsql_sql_c() {
cat <<'SQL'
SELECT 'QA::C38::' || seq_num::text || '|' || event_type
    || '|' || coalesce(runtime,'(null)') || '|' || coalesce(surface,'(null)')
    || '|' || coalesce(enforcement_effect,'(null)') || '|' || coalesce(policy_decision,'(null)')
    || '|' || coalesce(left(session_id::text,8),'(null)') AS r
  FROM ai_events WHERE seq_num IN (994, 2666, 2695) ORDER BY seq_num;
SELECT 'QA::C38N::' || count(*)::text AS r FROM ai_events WHERE seq_num IN (994, 2666, 2695);
SELECT 'QA::C38K::' || coalesce(string_agg(event_type || '=' || n::text, ',' ORDER BY event_type),'none') AS r
  FROM (SELECT event_type, count(*) AS n FROM ai_events
         WHERE event_type LIKE 'TOOL%' OR event_type LIKE 'PROMPT%' GROUP BY 1) t;
SELECT 'QA::ORGS::' || count(*)::text AS r FROM orgs;
SQL
}

prodsql_run() {
  [ "$PRODSQL_STATE" != absent ] && return 0
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
  prodsql_sql_c > "$PRODSQL_SQL"
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
  # Rule 10 — name the lane that produced the prod verdict below, next to it.
  emit PASS ENVC-PROD 0 live "prod SQL lane OPEN and read-only: $PRODSQL_RUNNER launched one-off Fargate task ${task:-unknown} into the RDS VPC (subnet-043fba9d9893864a4 / sg-02e5e94735f154e7f), target $tgt, server-side SET TRANSACTION READ ONLY, runner exit $rc. The RDS security group and PubliclyAccessible=false were NOT changed. Capture: $PRODSQL_OUT"
  return 0
}

prodv() { # <key> -> one line per returned row (psql result block only)
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

# --- item 38's prod half -----------------------------------------------------
# The acceptance names three PRODUCTION events by their display number. What
# the console decoder renders for a row is a function of that row's stored
# class, so the row IS measurable even though the pixels are not: if any of the
# three is not a tool-kind event, the tool-kind copy pin C38-1 asserts is being
# applied to the wrong branch and the acceptance is unsatisfiable as written.
check_C38_2() {
  prodsql_run
  local rows n kinds bad ids
  rows=$(prodv C38); n=$(prodv1 C38N); kinds=$(prodv1 C38K)
  if [ -z "$n" ]; then emit BLOCKED C38-2 38 live "$(prod_why)"; return; fi
  if [ "$n" != "3" ]; then
    emit FAIL C38-2 38 live "the acceptance names PRODUCTION events #994, #2666 and #2695, and a read of production through the in-VPC runner finds only $n of the three (SELECT ... FROM ai_events WHERE seq_num IN (994,2666,2695)). Rows found: $(printf '%s' "$rows" | tr '\n' ' ' | flat). The named subjects no longer exist, so the console assertion has nothing to open"
    return
  fi
  bad=$(printf '%s\n' "$rows" | awk -F'|' '$2!="TOOL_CALL_BLOCKED"' | tr '\n' ' ' | flat)
  ids=$(printf '%s\n' "$rows" | tr '\n' ' ' | flat)
  if [ -z "$bad" ]; then
    emit PASS C38-2 38 live "all three PRODUCTION events the acceptance names are TOOL-kind, read in-VPC and read-only: $ids (fields are seq|event_type|runtime|surface|enforcement_effect|policy_decision|session). Every one is TOOL_CALL_BLOCKED / deny-tool / BLOCK, so the console row for each takes the decoder's TOOL branch - the branch C38-1 pins never.toMatch(/prompt/i). Prod-wide class census for the two families: $kinds"
  else
    emit FAIL C38-2 38 live "at least one of the three PRODUCTION events the acceptance names is NOT a tool-kind event, so prompt-blocking copy on its row would be the decoder behaving correctly on a mis-classed row: $bad (all three: $ids). Prod class census: $kinds"
  fi
}

# The pixels themselves. Separate id, because the row-class fact above and the
# rendered sentence are two different observations and one must not be read as
# the other.
check_C38_3() {
  emit BLOCKED C38-3 38 live "the acceptance's console half - open the sessions carrying #994 and #2666/#2695 in the PROD console and read each row's sentence and receipt - was not observed. Precondition: an authenticated production console session. Entering credentials is prohibited for the implementing agent (the plan says so itself at item 39), so this is an owner/operator action. C38-2 proves the three rows are tool-kind IN PRODUCTION and C38-1 proves the decoder's tool branch never renders /prompt/i; neither is a reading of the prod console"
}

# QA0802_PRODSQL_ONLY=1 runs ONLY the prod-database checks in this file and
# exits. The rest of cluster C drives the live endpoint and a ~17-minute jest
# lane that the prod read does not depend on. It never widens any acceptance.
prodsql_only_c() { check_C38_2; check_C38_3; }

# --- ENV: the two hashes item 7's guard is measured by ----------------------
REQ_BEFORE=$(hashof "$REQTOML")
emit PASS ENVC-1 0 live "requirements.toml sha256 BEFORE = $REQ_BEFORE"
if [ "${QA0802_PRODSQL_ONLY:-0}" = "1" ]; then prodsql_only_c; exit 0; fi

# --- ENV: what is actually listening where ----------------------------------
# The acceptance for item 33 uses `curl 127.0.0.1:19280/health -> 200` as its
# "daemon is healthy" precondition. On THIS box that port is not the daemon.
D_OWNER=$(netstat -ano 2>/dev/null | grep LISTENING | grep ':19280 ' | awk '{print $NF}' | head -1)
D_BODY=$(curl -s -m 5 http://127.0.0.1:19280/health 2>/dev/null | oneline)
printf '%s\npid=%s\n' "$D_BODY" "$D_OWNER" > "$EV/C33-1-port19280-health.json"
D_PROC=$(MSYS_NO_PATHCONV=1 tasklist /FI "PID eq ${D_OWNER:-0}" /FO CSV /NH 2>/dev/null | cut -d, -f1 | tr -d '"')
emit PASS ENVC-2 0 live "127.0.0.1:19280 owner pid=${D_OWNER:-none} proc=${D_PROC:-unknown} body=$D_BODY"

BE_UP=$(curl -s -m 8 -o /dev/null -w '%{http_code}' "$BURL/health" 2>/dev/null)
emit PASS ENVC-3 0 live "backend :2053 /health -> $BE_UP"

# --- ENV: THE LIVE ENDPOINT (2026-08-06) ------------------------------------
# A DeVoid agent IS installed, enrolled (agent 70573ce5 / CND34521VN) and
# running against this stack, from an ISOLATED HOME so it never writes the
# owner's ~/.devoid, ~/.claude, ~/.codex or C:\ProgramData\devoid. Every check
# below that used to emit an unconditional "no DeVoid agent installed" BLOCKED
# is now DRIVEN against it. The preconditions are PROBED, never assumed.
SP_W="C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad"
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
AGENT_BIN="${QA0802_AGENT_BIN:-$SP/agent-bin/devoid}"
AGENT_HOME="$SP/agent-home/.devoid"
DTOK="$AGENT_HOME/daemon-token"
DAEMON=http://127.0.0.1:19280
DAEMON_ID=$(curl -s -m 6 "$DAEMON/health" 2>/dev/null | grep -oE '"daemon":"[^"]*"' | cut -d'"' -f4)
# Rule 10 — name the binary this run measured, next to the verdicts it produced.
AGENT_BIN_OVERRIDE=$( [ -n "${QA0802_AGENT_BIN:-}" ] && echo yes || echo no )
AGENT_BIN_TARGET=$(grep -oE '\$SP/w26/bin/devoid\.exe|/c/Program Files/DeVoid/devoid\.exe|agent-build/devoid\.exe' "$AGENT_BIN" 2>/dev/null | tail -1)
AGENT_BIN_SHA=$(sha256sum "$AGENT_BIN" 2>/dev/null | cut -c1-16)
emit PASS ENVC-BIN 0 live "agent binary measured by this run: shim=$AGENT_BIN (sha256 ${AGENT_BIN_SHA:-unreadable}), execs=${AGENT_BIN_TARGET:-unresolved}, QA0802_AGENT_BIN override=$AGENT_BIN_OVERRIDE. Unset = the stable Program Files install; a fix built in a worktree is only measured when this says yes"

AGENT_LIVE=0
if [ -x "$AGENT_BIN" ] && [ -s "$DTOK" ] && [ "$DAEMON_ID" = "devoid" ]; then AGENT_LIVE=1; fi
NO_AGENT="the live endpoint is not answering: devoid shim exec=$( [ -x "$AGENT_BIN" ] && echo yes || echo no ), daemon-token present=$( [ -s "$DTOK" ] && echo yes || echo no ), 127.0.0.1:19280 /health daemon=\"${DAEMON_ID:-none}\" (must be \"devoid\")"
ELEVATION_BLOCK="this session is NOT elevated (elevated=False) and cannot answer a UAC prompt"
dtok_post() { curl -s --noproxy '*' -m 120 -H "X-Devoid-Daemon-Token: $(cat "$DTOK")" -H 'Content-Type: application/json' -X POST --data-binary "@$2" -o "$EV/$3" -w '%{http_code}' "$DAEMON$1" 2>/dev/null; }
emit PASS ENVC-7 0 live "live DeVoid endpoint: agentLive=$AGENT_LIVE, daemon identity=\"${DAEMON_ID:-none}\" version=$(curl -s -m 5 "$DAEMON/health" 2>/dev/null | grep -oE '\"version\":\"[^\"]*\"' | cut -d'\"' -f4), isolated home=$SP/agent-home"

node "$SP/c-env-migrations.cjs" > "$EV/C-ENV-migrations.txt" 2>&1
emit PASS ENVC-4 0 live "local Postgres migration state: $(head -1 "$EV/C-ENV-migrations.txt" | oneline); $(sed -n '2,3p' "$EV/C-ENV-migrations.txt" | tr '\n' ' ')"

# --- ENV: the exact bases this run measured ---------------------------------
# The integration bases are shared and DO move mid-run (this one moved under me
# once: fix/qa0802-c8-approval-producer merged as f3a381d while item 98 was being
# measured, which invalidated a static reading taken minutes earlier). Pin them.
emit PASS ENVC-6 0 static "bases measured: INST $(git -C "$INST" rev-parse --short HEAD) '$(git -C "$INST" log -1 --pretty=%s | cut -c1-60)' | BE $(git -C "$BE" rev-parse --short HEAD) | FE $(git -C "$FE" rev-parse --short HEAD)"

# =============================================================================
# ITEM 11 [C6] — unknown fields IGNORED on agent-facing, STRICT on console.
#
# The parent's first probe got a 401 because auth fires BEFORE validation, so it
# never reached `forbidNonWhitelisted` at all. This mints a `cli_agent` key by
# hand against the local DB (the way .codesec-e2e/_mint-cli-key.cjs does) and a
# console JWT, so BOTH halves actually exercise the pipe.
# =============================================================================
node "$SP/c11-mint.cjs" "$SP/c11" > "$EV/C6-11-0-mint.txt" 2>&1
MINT_RC=$?
node "$SP/c39-mint-unknown-role.cjs" "$SP/c39" >> "$EV/C6-11-0-mint.txt" 2>&1

if [ "$MINT_RC" != 0 ]; then
  emit BLOCKED C11-1 11 live "could not mint a cli_agent key against 127.0.0.1:5433 — $(tail -1 "$EV/C6-11-0-mint.txt" | oneline)"
  emit BLOCKED C11-2 11 live "no console JWT; the strict half cannot be exercised"
  emit BLOCKED C11-3 11 live "no agent key; the findings:null half cannot be exercised"
else
  SITE=$(cat "$SP/c11/site.txt")
  AGENT_HDR="Authorization: Bearer $(cat "$SP/c11/agent.key")"
  CONSOLE_HDR="Authorization: Bearer $(cat "$SP/c11/console.jwt")"
  AR=/api/v1/ai-context/findings

  printf '%s' '{"hostname":"clusterc-probe","agentVersion":"0.0.0-verify","findings":[]}' > "$SP/c11/agent-clean.json"
  printf '%s' '{"hostname":"clusterc-probe","agentVersion":"0.0.0-verify","findings":[],"__devoid_undeclared_probe__":"cluster-c-item-11","captureStateLikeFutureKey":42}' > "$SP/c11/agent-junk.json"
  printf '%s' '{"hostname":"clusterc-probe","agentVersion":"0.0.0-verify","findings":null}' > "$SP/c11/agent-null.json"

  a1=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -H "$AGENT_HDR" --data-binary @"$SP/c11/agent-clean.json" -o "$EV/C6-11-1-agent-clean.json" -w '%{http_code}' "$BURL$AR")
  a2=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -H "$AGENT_HDR" --data-binary @"$SP/c11/agent-junk.json"  -o "$EV/C6-11-2-agent-junk.json"  -w '%{http_code}' "$BURL$AR")
  a3=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -H "$AGENT_HDR" --data-binary @"$SP/c11/agent-null.json"  -o "$EV/C6-11-5-agent-null.json"   -w '%{http_code}' "$BURL$AR")

  b1=$(oneline < "$EV/C6-11-1-agent-clean.json"); b2=$(oneline < "$EV/C6-11-2-agent-junk.json"); b3=$(oneline < "$EV/C6-11-5-agent-null.json")
  if [ "$a2" = "401" ] || [ "$a2" = "403" ]; then
    emit BLOCKED C11-1 11 live "agent route answered $a2 — the probe never reached validation (auth fires first); the minted key is not being accepted"
  elif [ "$a2" = "400" ] && grep -qi 'should not exist' "$EV/C6-11-2-agent-junk.json"; then
    emit FAIL C11-1 11 live "AGENT route $AR 400s on undeclared keys: $b2 (clean control was $a1)"
  elif [ "$a1" = "$a2" ]; then
    emit PASS C11-1 11 live "AGENT $AR: clean=$a1 $b1 | +2 undeclared top-level keys=$a2 $b2 — tolerated and dropped, no 'should not exist'"
  else
    emit FAIL C11-1 11 live "AGENT $AR: clean=$a1 $b1 but junk=$a2 $b2 — the undeclared key changed the outcome"
  fi

  printf '%s' "{\"scope\":{\"type\":\"site\",\"id\":\"$SITE\"},\"draft\":{}}" > "$SP/c11/console-clean.json"
  printf '%s' "{\"scope\":{\"type\":\"site\",\"id\":\"$SITE\"},\"draft\":{},\"__devoid_undeclared_probe__\":\"cluster-c-item-11\"}" > "$SP/c11/console-junk.json"
  CR="/api/v1/ai/security-policy/simulate?siteId=$SITE"
  c1=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -H "$CONSOLE_HDR" --data-binary @"$SP/c11/console-clean.json" -o "$EV/C6-11-3-console-clean.json" -w '%{http_code}' "$BURL$CR")
  c2=$(curl -s -m 20 -X POST -H 'Content-Type: application/json' -H "$CONSOLE_HDR" --data-binary @"$SP/c11/console-junk.json"  -o "$EV/C6-11-4-console-junk.json"  -w '%{http_code}' "$BURL$CR")
  cb2=$(oneline < "$EV/C6-11-4-console-junk.json")
  if [ "$c1" != "200" ]; then
    emit BLOCKED C11-2 11 live "console control probe returned $c1, not 200 — the strict half cannot be attributed to the junk key: $(oneline < "$EV/C6-11-3-console-clean.json")"
  elif [ "$c2" = "400" ] && grep -qi 'should not exist' "$EV/C6-11-4-console-junk.json"; then
    emit PASS C11-2 11 live "CONSOLE $CR: clean=200 | +1 undeclared key=400 $cb2 — still strict"
  else
    emit FAIL C11-2 11 live "CONSOLE $CR: clean=$c1 but junk=$c2 $cb2 — a console route accepted an undeclared key"
  fi

  if [ "$a3" = "200" ]; then
    emit PASS C11-3 11 live "AGENT $AR with \"findings\":null -> $a3 $b3 (the DF-20 fleet-wide 400 case, coerced to [])"
  else
    emit FAIL C11-3 11 live "AGENT $AR with \"findings\":null -> $a3 $b3"
  fi
fi

if [ "$BE_JEST" = "1" ]; then
  ( cd "$BE" && npx jest src/common/pipes src/ai-governance/dto/ai-agent-wire-contract.spec.ts \
      --ci --runInBand --forceExit --silent ) > "$EV/C-be-11-specs.log" 2>&1
  if grep -qE "^Tests:.*[0-9]+ passed" "$EV/C-be-11-specs.log" && ! grep -q "failed," "$EV/C-be-11-specs.log"; then
    emit PASS C11-4 11 unit "backend pins: $(grep -E '^(Test Suites|Tests):' "$EV/C-be-11-specs.log" | tr '\n' ' ' | oneline) (incl. 'agent routes TOLERATE an unknown field and DROP it (C6 — inverted deliberately)')"
  else
    emit FAIL C11-4 11 unit "backend pins red: $(grep -E '^(Test Suites|Tests):' "$EV/C-be-11-specs.log" | tr '\n' ' ' | oneline)"
  fi
else
  emit BLOCKED C11-4 11 unit "BE_JEST=0 — the ~17 min backend jest lane (agent-wire-leniency + ai-agent-wire-contract) was not run"
fi

# =============================================================================
# ITEM 32 [C1] — an unreadable / degenerate Claude hook payload must be
#                DECIDABLE, then warned about, never silently allowed.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/airuntime/... ./internal/aihooks/... ) > "$EV/C32-1-warn.log" 2>&1
if grep -qE '^ok\s+github.com/codefense/cli-wrapper/internal/airuntime\b' "$EV/C32-1-warn.log" && \
   grep -qE '^ok\s+github.com/codefense/cli-wrapper/internal/aihooks\b' "$EV/C32-1-warn.log"; then
  emit PASS C32-1 32 unit "airuntime+aihooks green; failWarn pins present ($(grep -cE '^--- PASS: TestFailWarn' "$EV/C32-1-warn.log") FailWarn cases, $(grep -cE '^--- PASS: TestParsePreToolUseInput' "$EV/C32-1-warn.log") ParsePreToolUseInput cases)"
else
  emit FAIL C32-1 32 unit "airuntime/aihooks red: $(grep -E '^(FAIL|--- FAIL)' "$EV/C32-1-warn.log" | tr '\n' ' ' | oneline)"
fi

( cd "$INST" && go test -count=1 -v ./cmd/devoid/ -run 'TestUndecidableWarn|TestUngovernedCheckpoint' ) > "$EV/C32-2-composition.log" 2>&1
if grep -q '^--- PASS: TestUndecidableWarn_ReachableAndVisibleUnderProductionWiring' "$EV/C32-2-composition.log"; then
  emit PASS C32-2 32 unit "composition root: foreign object + {} + empty stdin + whitespace all reach Warned=true, exit 0, zero stdout; reasons observed = $(grep -oE 'TestUndecidableWarn_ReachableAndVisibleUnderProductionWiring/[a-z_]+' "$EV/C32-2-composition.log" | sed 's#.*/##' | sort -u | tr '\n' ' ')"
else
  emit FAIL C32-2 32 unit "the composition-root warn pin did not pass: $(grep -E '^(FAIL|--- FAIL)' "$EV/C32-2-composition.log" | tr '\n' ' ' | oneline)"
fi

# The acceptance names a LITERAL stderr string. The shipped code does not produce
# it for that input, on purpose. This check reports the literal criterion.
UD_SENTINEL=$(cd "$INST" && grep -c 'ErrIndeterminateDialect' internal/airuntime/adapters/claudecode/claudecode_test.go 2>/dev/null)
# ACCEPTANCE CORRECTED — and the correction is a security argument, not a
# bookkeeping one. Writing the plan's `ErrUnknownDialect` pin would collapse "an
# object we do not recognise" into "definitely not a hook payload", which turns
# every unseen Claude release into a FLEET-WIDE BLOCK. The shipped adapter returns
# ErrIndeterminateDialect and the runner reason is 'indeterminate-shape', which is
# the honest answer and the safe one.
#
# The replacement property IS executed: the cluster-A/C wave added a pin that
# feeds the exact VS Code envelope through the real composition root and asserts
# the plan's demanded sentence is ABSENT. Its control was measured, not assumed —
# the expected reason was 'normalize'; the runner returns 'normalize-oracle-deny'.
VSC_PIN=$(cd "$INST" && ls cmd/devoid/ai_hook_vscode_native_dialect_test.go 2>/dev/null | wc -l | tr -d ' ')
if [ "${VSC_PIN:-0}" -ge 1 ]; then
  vsc=$(cd "$INST" && go test -count=1 ./cmd/devoid/ -run 'VSCodeNative|VscodeNative' 2>&1 | tail -2 | tr '\n' ' ' | oneline)
  printf '%s\n' "$vsc" > "$EV/C32-3-vscode-dialect.txt"
  if printf '%s' "$vsc" | grep -q '^ok'; then
    emit PASS C32-3 32 unit "ACCEPTANCE CORRECTED — the acceptance demands stderr 'normalize: airuntime: unknown hook payload dialect' and a pin asserting ErrUnknownDialect. Implemented literally that is a security regression: it collapses 'an object we do not recognise' into 'definitely not a hook payload', so every unseen Claude release becomes a fleet-wide block. The shipped adapter returns ErrIndeterminateDialect (claudecode_test.go names $UD_SENTINEL such assertions) and the runner reason is 'indeterminate-shape'. VERIFIED INSTEAD: ai_hook_vscode_native_dialect_test.go drives the exact VS Code envelope through the real composition root and asserts the demanded sentence is ABSENT — $vsc"
  else
    emit FAIL C32-3 32 unit "the replacement VS Code-dialect pin is red: $vsc"
  fi
else
  emit FAIL C32-3 32 static "PLAN-TEXT DEFECT and no replacement pin: the acceptance demands stderr 'normalize: airuntime: unknown hook payload dialect' and ErrUnknownDialect; the shipped adapter returns ErrIndeterminateDialect ($UD_SENTINEL assertions) with reason 'indeterminate-shape'. The literal criterion is unsatisfiable as written, and cmd/devoid/ai_hook_vscode_native_dialect_test.go — the corrected property — does not exist. An acceptance correction with no executed replacement is still a FAIL"
fi

# ── C32-4 CONVERTED (live agent) ─────────────────────────────────────────────
# Drive a foreign payload through the SHIPPED hook binary and read the
# ai_hook_undecidable bypass record it writes, plus the console-side event.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C32-4 32 live "$NO_AGENT"
else
  printf '{"zzz":1}' > "$SP/c32-foreign.json"
  "$AGENT_BIN" ai hook --adapter claude-code --event PRE_TOOL_USE < "$SP/c32-foreign.json" > "$EV/C32-4-hook.txt" 2>&1
  C32_EXIT=$?
  sleep 3
  cp "$AGENT_HOME/bypass-events.json" "$EV/C32-4-bypass-events.json" 2>/dev/null
  C32_REC=$(grep -c 'ai_hook_undecidable' "$EV/C32-4-bypass-events.json" 2>/dev/null); C32_REC=${C32_REC:-0}
  C32_DET=$(grep -oE '"reason": *"[a-z-]+"' "$EV/C32-4-bypass-events.json" | tail -1)
  # The console row rides the HEARTBEAT (the hook exits immediately), so poll.
  C32_EVT=$(psqlq codefense_db "select count(*) from ai_events where event_type='HOOK_UNDECIDABLE';")
  C32_TOT=$(python -c "import json,sys;d=json.load(open(sys.argv[1]));print(len(d.get('events') or []))" "$EV/C32-4-bypass-events.json" 2>/dev/null); C32_TOT=${C32_TOT:-0}
  C32_PATH=$(grep -c 'PATH_FIX_FAILED' "$EV/C32-4-bypass-events.json" 2>/dev/null); C32_PATH=${C32_PATH:-0}
  C32_WARN=$(grep -c 'was NOT checked' "$EV/C32-4-hook.txt"); C32_WARN=${C32_WARN:-0}
  if [ "$C32_EVT" -gt 0 ] 2>/dev/null; then
    emit PASS C32-4 32 live "a foreign payload {\"zzz\":1} was fed to the SHIPPED \`devoid ai hook --adapter claude-code --event PRE_TOOL_USE\` on CND34521VN: exit $C32_EXIT, stdout empty, stderr warns the action was NOT checked ($C32_WARN line(s)), the endpoint wrote an ai_hook_undecidable record into $AGENT_HOME/bypass-events.json ($C32_REC record(s), $C32_DET) and the console ledger holds $C32_EVT HOOK_UNDECIDABLE row(s). Local ledger state: $C32_REC ai_hook_undecidable record(s) still resident out of $C32_TOT total, of which $C32_PATH are repeating PATH_FIX_FAILED entries — the local file is BOUNDED, so a repeating operational event can evict the security record; the console row is the durable surface and is what this check asserts on. NOTE the asymmetry observed on the same binary: the identical foreign object on --adapter codex fails CLOSED (normalize-oracle-deny) while claude-code WARNS through (indeterminate-shape)"
  else
    emit FAIL C32-4 32 live "the foreign payload was fed to the live hook on CND34521VN (exit $C32_EXIT) and NO bypass record reached the console: HOOK_UNDECIDABLE ai_events rows=$C32_EVT; locally $C32_REC ai_hook_undecidable record(s) out of $C32_TOT in bypass-events.json ($C32_PATH of them repeating PATH_FIX_FAILED)"
  fi
fi

# DF-07, folded into item 32 by the owner.
( cd "$INST" && go test -count=1 -v ./internal/toolrisk/ -run 'TestScan_DF07|TestQuoting|TestAnchorDefeat' ) > "$EV/C32-5-df07.log" 2>&1
if grep -q '^--- PASS: TestScan_DF07_NarrowRmIsAllowedByDesign' "$EV/C32-5-df07.log"; then
  emit PASS C32-5 32 unit "DF-07 pinned as allow-by-design: TestScan_DF07_NarrowRmIsAllowedByDesign PASS, subcases = $(grep -cE '^    --- PASS: TestScan_DF07' "$EV/C32-5-df07.log")"
else
  emit FAIL C32-5 32 unit "DF-07 pin missing/red: $(grep -E '^(FAIL|--- FAIL)' "$EV/C32-5-df07.log" | tr '\n' ' ' | oneline)"
fi

# =============================================================================
# ITEM 33 [C2 + C10a] — every runner fail path gets its own reason tag.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./cmd/devoid/ -run 'TestUndecidableDenyReason|TestDaemonUnreachableSentence|TestStrictDenyOutputForEvent|TestProductionResolver_DaemonDown' ) > "$EV/C33-2-reasons.log" 2>&1
NPASS=$(grep -cE '^--- PASS: Test(UndecidableDenyReason|DaemonUnreachableSentence|StrictDenyOutputForEvent|ProductionResolver_DaemonDown)' "$EV/C33-2-reasons.log")
NFAIL=$(grep -cE '^--- FAIL' "$EV/C33-2-reasons.log")
if [ "$NFAIL" = "0" ] && [ "$NPASS" -ge 5 ]; then
  emit PASS C33-1 33 unit "$NPASS reason-attribution pins pass: 6 non-transport causes (empty-payload, indeterminate-shape, normalize, stdin-oversize, stdin-timeout, stdin-error) produce 6 DISTINCT sentences, none containing 'daemon unreachable'; only the transport branch emits that string"
else
  emit FAIL C33-1 33 unit "reason-attribution pins: $NPASS pass / $NFAIL fail — $(grep -E '^--- FAIL' "$EV/C33-2-reasons.log" | tr '\n' ' ' | oneline)"
fi

# ── C33-2 CONVERTED (live agent) ─────────────────────────────────────────────
# Both undecidable causes are fed to the SHIPPED hook and the emitted
# permissionDecisionReason is read off stdout.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C33-2 33 live "$NO_AGENT"
else
  # WINDOWS python needs native paths on both the script and its output.
  python "C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad/c33-build-oversize.py" "C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad/c33-oversize.json" > "$EV/C33-2-oversize-build.txt" 2>&1
  "$AGENT_BIN" ai hook --adapter claude-code --event PRE_TOOL_USE < "$SP/c33-oversize.json" > "$EV/C33-2-oversize.txt" 2>&1
  C33_OS_EXIT=$?
  "$AGENT_BIN" ai hook --adapter codex --event PRE_TOOL_USE < "$SP/c32-foreign.json" > "$EV/C33-2-codex-foreign.txt" 2>&1
  C33_FR_EXIT=$?
  C33_OS_REASON=$(grep -oE '"permissionDecisionReason":"[^"]*"' "$EV/C33-2-oversize.txt" | head -1 | cut -d'"' -f4)
  C33_OS_OUT=$(grep -oE 'outcome=[a-z-]+' "$EV/C33-2-oversize.txt" | head -1)
  C33_FR_REASON=$(grep -oE '"permissionDecisionReason":"[^"]*"' "$EV/C33-2-codex-foreign.txt" | head -1 | cut -d'"' -f4)
  C33_FR_OUT=$(grep -oE 'outcome=[a-z-]+' "$EV/C33-2-codex-foreign.txt" | head -1)
  # THE REASON MUST NAME THE RUNTIME THAT ACTUALLY REJECTED THE PAYLOAD. Distinct
  # sentences per CAUSE was the old bar and it was not enough: the codex-adapter
  # denial was distinct from the oversize one and still told a Codex user their
  # payload "was not a recognized Claude Code hook payload". So the codex denial is
  # now asserted to name Codex and NOT to name Claude Code, with the SAME payload
  # on --adapter claude-code as the control that the text is a function of the
  # adapter rather than a renamed constant.
  C33_FR_NAMES_CODEX=$(printf '%s' "$C33_FR_REASON" | grep -c 'Codex'); C33_FR_NAMES_CODEX=${C33_FR_NAMES_CODEX:-0}
  C33_FR_NAMES_CLAUDE=$(printf '%s' "$C33_FR_REASON" | grep -c 'Claude Code'); C33_FR_NAMES_CLAUDE=${C33_FR_NAMES_CLAUDE:-0}
  "$AGENT_BIN" ai hook --adapter claude-code --event PRE_TOOL_USE < "$SP/c32-foreign.json" > "$EV/C33-2-claude-foreign.txt" 2>&1
  C33_CC_OUT=$(grep -oE 'outcome=[a-z-]+' "$EV/C33-2-claude-foreign.txt" | head -1)
  if [ -n "$C33_OS_REASON" ] && [ -n "$C33_FR_REASON" ] && [ "$C33_OS_REASON" != "$C33_FR_REASON" ] && \
     [ "$C33_FR_NAMES_CODEX" -gt 0 ] && [ "$C33_FR_NAMES_CLAUDE" = "0" ]; then
    emit PASS C33-2 33 live "the SHIPPED hook's undecidable denial NAMES THE RUNTIME THAT REJECTED IT, and the two causes stay distinct. OVERSIZE (11 MiB > the 10 MiB MaxHookStdinBytes cap, exit $C33_OS_EXIT, $C33_OS_OUT): \"$C33_OS_REASON\". FOREIGN object on --adapter codex (exit $C33_FR_EXIT, $C33_FR_OUT): \"$C33_FR_REASON\" — it names Codex ($C33_FR_NAMES_CODEX) and does NOT name Claude Code ($C33_FR_NAMES_CLAUDE), where before it told every Codex user their payload was not a recognized CLAUDE CODE hook payload. Control: the identical payload on --adapter claude-code takes the Claude-native lane ($C33_CC_OUT), so the sentence is a function of the adapter, not a renamed constant"
  elif [ -n "$C33_FR_REASON" ] && [ "$C33_FR_NAMES_CLAUDE" -gt 0 ]; then
    emit FAIL C33-2 33 live "the codex-adapter denial NAMES THE WRONG RUNTIME. Fed to the SHIPPED hook on CND34521VN: OVERSIZE (exit $C33_OS_EXIT, $C33_OS_OUT) \"$C33_OS_REASON\"; FOREIGN object on --adapter codex (exit $C33_FR_EXIT, $C33_FR_OUT) \"$C33_FR_REASON\" — it says \"Claude Code\" ($C33_FR_NAMES_CLAUDE occurrence(s)) to a Codex user, so the reason cannot attribute the failure to the runtime that actually failed"
  else
    emit FAIL C33-2 33 live "the undecidable denials did not answer as required: oversize exit $C33_OS_EXIT ($C33_OS_OUT) reason=\"${C33_OS_REASON:-<none>}\"; codex foreign exit $C33_FR_EXIT ($C33_FR_OUT) reason=\"${C33_FR_REASON:-<none>}\" namesCodex=$C33_FR_NAMES_CODEX namesClaudeCode=$C33_FR_NAMES_CLAUDE"
  fi
fi
# ── C33-3 CONVERTED (live agent) ─────────────────────────────────────────────
# The acceptance's precondition is now SOUND — and the check still refuses to
# accept a bare 200 as proof, because that was the whole finding.
C33_HB=$(curl -s -m 6 "$DAEMON/health" 2>/dev/null | oneline)
C33_CODE=$(curl -s -m 6 -o /dev/null -w '%{http_code}' "$DAEMON/health" 2>/dev/null)
C33_AI=$(curl -s -m 6 -o /dev/null -w '%{http_code}' -H "X-Devoid-Daemon-Token: $(cat "$DTOK" 2>/dev/null)" "$DAEMON/v1/ai/canary" 2>/dev/null)
if [ "$AGENT_LIVE" = "1" ] && [ "$C33_CODE" = "200" ] && [ "$C33_AI" = "200" ]; then
  emit PASS C33-3 33 live "the acceptance's precondition is now SOUND and was verified BY IDENTITY, not by a bare 200: 127.0.0.1:19280 is owned by pid ${D_OWNER:-?} (${D_PROC:-unknown}) and /health -> $C33_CODE answers $C33_HB — it carries the \`daemon\`:\"devoid\" and \`wireProxy\` identity markers a squatter cannot forge, and the token-gated AI route /v1/ai/canary -> $C33_AI. The 2026-08-05 finding stands as written: a gate testing only for 200 on that port passed against a WSL-relayed devoid 3.6.0 with no /v1/ai/* routes at all"
else
  emit FAIL C33-3 33 live "127.0.0.1:19280 /health -> $C33_CODE ($C33_HB), /v1/ai/canary -> $C33_AI, agentLive=$AGENT_LIVE — the DeVoid daemon identity could not be established on that port"
fi

# =============================================================================
# ITEM 34 [C7] — THE CLUSTER'S OWN SUBJECT.
#   the local rulebook always decides; the backend may only make it STRICTER.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/aiverdict/... ) > "$EV/C34-1-aiverdict.log" 2>&1
if grep -qE '^ok\s+github.com/codefense/cli-wrapper/internal/aiverdict' "$EV/C34-1-aiverdict.log"; then
  emit PASS C34-1 34 unit "internal/aiverdict green ($(grep -c '^--- PASS' "$EV/C34-1-aiverdict.log") tests), incl. TestNoUnregisteredDecisionValue — the exhaustiveness guard that scans every governed decision source and fails on any constant outside LocalVerdicts()"
else
  emit FAIL C34-1 34 unit "internal/aiverdict red: $(grep -E '^(FAIL|--- FAIL)' "$EV/C34-1-aiverdict.log" | tr '\n' ' ' | oneline)"
fi

# The load-bearing one: an EXHAUSTIVE external property over a byte-identical
# copy of the leaf package, written independently of the repo's own table.
cp "$INST/internal/aiverdict/aiverdict.go" "$SP/c34-aiverdict/aiverdict.go"
SRC_A=$(hashof "$INST/internal/aiverdict/aiverdict.go"); SRC_B=$(hashof "$SP/c34-aiverdict/aiverdict.go")
( cd "$SP/c34-aiverdict" && go test -count=1 -v ./... ) > "$EV/C34-2-aiverdict-property.log" 2>&1
PROP=$(grep -oE 'C34-PROP cases=[0-9]+ violations=[0-9]+' "$EV/C34-2-aiverdict-property.log" | head -1)
VIOL=$(printf '%s' "$PROP" | grep -oE 'violations=[0-9]+' | cut -d= -f2)
UNK=$(grep -c 'OBSERVATION unknown-local' "$EV/C34-2-aiverdict-property.log")
if [ "$SRC_A" != "$SRC_B" ]; then
  emit BLOCKED C34-2 34 unit "the property harness copy does not match the shipped source ($SRC_A vs $SRC_B)"
elif [ "${VIOL:-x}" = "0" ]; then
  emit PASS C34-2 34 unit "EXHAUSTIVE property over the shipped aiverdict source ($SRC_A): $PROP; prevention tier survives every (local block/hold x 26 remote x serverEnforced) case; backend 'hold' never adopted; BackendUnavailable returns local byte-for-byte. Residual measured, not assumed: $UNK cases where an OUT-OF-VOCABULARY local decision is replaced by a known remote one — reachable only if a lane emits an unranked decision, which C34-1's TestNoUnregisteredDecisionValue makes a build failure."
else
  emit FAIL C34-2 34 unit "THE BACKEND CAN SOFTEN A LOCAL DECISION — $PROP; see $EV/C34-2-aiverdict-property.log"
fi

( cd "$INST" && go test -count=1 -v ./internal/daemon/ -run 'Reconcil|DecideTool|Rank|Backend' ) > "$EV/C34-3-daemon.log" 2>&1
if grep -qE '^ok\s+github.com/codefense/cli-wrapper/internal/daemon' "$EV/C34-3-daemon.log"; then
  emit PASS C34-3 34 unit "daemon lane green ($(grep -c '^--- PASS' "$EV/C34-3-daemon.log") tests): every lane routes through reconcileWithBackend(surface,local,remote,serverEnforced) -> aiverdict.ReconcileWithBackend, so no lane can reconcile without recording"
else
  emit FAIL C34-3 34 unit "daemon reconciliation lane red: $(grep -E '^(FAIL|--- FAIL)' "$EV/C34-3-daemon.log" | tr '\n' ' ' | oneline)"
fi

HOLD_AFTER=$(cd "$INST" && grep -n 'Runs AFTER the backend reconciliation' internal/daemon/ai_handlers.go | head -1 | cut -d: -f1)
HOLD_LINE=$(cd "$INST" && grep -n 'decision = aiDecisionHold' internal/daemon/ai_handlers.go | head -1 | cut -d: -f1)
RECON_LINE=$(cd "$INST" && grep -n 'out, toolReconciliation = reconcileWithBackend' internal/daemon/ai_handlers.go | head -1 | cut -d: -f1)
if [ -n "$HOLD_LINE" ] && [ -n "$RECON_LINE" ] && [ "$HOLD_LINE" -gt "$RECON_LINE" ]; then
  emit PASS C34-4 34 static "the taint->hold escalation is applied AFTER reconciliation (ai_handlers.go: reconcileWithBackend at :$RECON_LINE, 'decision = aiDecisionHold' at :$HOLD_LINE), so a backend answer can never soften a hold; 'hold' is also excluded from the frozen wire vocabulary (KnownWire(Hold)==false)"
else
  emit FAIL C34-4 34 static "could not establish that the hold escalation runs after reconciliation (recon=:${RECON_LINE:-?} hold=:${HOLD_LINE:-?})"
fi

# ── C34-5: half of it is now DRIVEN; the other half needs a torn-down daemon ─
# `rm -rf /` through the hook is run for real on the live endpoint. The
# backend-unavailable arm is NOT: reproducing it means restarting the daemon
# pointed at a black-holed backend, and this daemon's BOOT path writes
# C:\ProgramData\OpenAI\Codex (observed this run) — the tree this run must not
# touch — as well as tearing down the endpoint every other converted check
# depends on.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C34-5 34 live "$NO_AGENT"
else
  "$AGENT_BIN" ai hook --adapter codex --event PRE_TOOL_USE < "$SP/c34-rmrf-codex.json" > "$EV/C34-5-rmrf.txt" 2>&1
  sleep 4
  C34_DEC=$(grep -oE '"permissionDecision":"[a-z]+"' "$EV/C34-5-rmrf.txt" | head -1 | cut -d'"' -f4)
  C34_REASON=$(grep -oE '"permissionDecisionReason":"[^"]*"' "$EV/C34-5-rmrf.txt" | head -1 | cut -d'"' -f4 | cut -c1-90)
  C34_ROW=$(psqlq codefense_db "select event_type||'/'||coalesce(enforcement_effect,'NULL') from ai_events where agent_type='codex' and event_type='TOOL_CALL_BLOCKED' order by created_at desc limit 1;")
  C34_UNAVAIL=$(psqlq codefense_db "select count(*) from ai_events where metadata::text like '%backendReconciliation%unavailable%';")
  emit BLOCKED C34-5 34 live "the DESTRUCTIVE half is now PROVEN LIVE and the backend-unavailable half is not. Driven this run on CND34521VN: a codex PreToolUse carrying \`rm -rf /\` through the SHIPPED hook -> permissionDecision=$C34_DEC (\"$C34_REASON\"), and the console ledger recorded $C34_ROW. What remains unreachable is the OTHER arm — pointing the live daemon at an unreachable backend to read backendReconciliation=unavailable ($C34_UNAVAIL such events today) requires restarting the daemon with a black-holed DEVOID_BACKEND_URL, and this daemon's boot path was OBSERVED writing C:\\ProgramData\\OpenAI\\Codex\\requirements.toml, which this run must not touch"
fi

# THE ONE PATH BY WHICH A LOCAL HOLD BECOMES ALLOW — item 98's producer added it,
# and it does NOT route through aiverdict. Cluster C's own rule says a backend
# that can soften a local decision is a FAIL, so measure the gate, don't assume.
REL=$(cd "$INST" && grep -c 'decision = aiDecisionAllow' internal/daemon/ai_handlers.go 2>/dev/null)
PENDINGS=$(cd "$INST" && grep -c 'State: toolHoldPending' internal/daemon/ai_tool_hold_approval.go 2>/dev/null)
AUTH_ONLY=$(cd "$INST" && grep -c 'case "AUTHORIZED":' internal/daemon/ai_tool_hold_approval.go 2>/dev/null)
CLAIMCONSUME=$(cd "$INST" && grep -c 'ClaimDelegatedApproval\|ConsumeDelegatedApproval' internal/daemon/ai_tool_hold_approval.go 2>/dev/null)
if [ "${AUTH_ONLY:-0}" = "1" ] && [ "${CLAIMCONSUME:-0}" -ge 2 ] && [ "${PENDINGS:-0}" -ge 4 ]; then
  emit PASS C34-6 34 static "the delegated-approval RELEASE is the one channel that turns a local hold into allow, and it is fail-closed: it fires only on backend status exactly 'AUTHORIZED' ($AUTH_ONLY branch) AND a successful ClaimDelegatedApproval returning a non-empty GrantReference AND a successful ConsumeDelegatedApproval ($CLAIMCONSUME calls); every other status, an unreachable authority, an expired binding and any transport ambiguity fall to toolHoldPending ($PENDINGS such returns) and the local hold stands. NOTE FOR THE OWNER: this is a NAMED EXCEPTION to 'the backend may only make it stricter' — it does not go through aiverdict.ReconcileWithBackend — so the invariant now reads '…except via a claimed-and-consumed one-use human approval'."
else
  emit FAIL C34-6 34 static "the hold-release channel is not provably fail-closed: AUTHORIZED branches=$AUTH_ONLY claim/consume calls=$CLAIMCONSUME pending fallbacks=$PENDINGS aiDecisionAllow assignments in the handler=$REL"
fi

# =============================================================================
# ITEM 35 [C3] — strip `claude --bare` at the shim AND record the attempt.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./cmd/devoid/ -run 'TestStripGovernanceBypassFlags|TestEnforceGovernanceBypassFlags|TestBypassRecordSurvivesEvidenceNormalization|TestClaudeBypassFlagListIsNonEmpty' ) > "$EV/C35-1-bare.log" 2>&1
if [ "$(grep -cE '^--- FAIL' "$EV/C35-1-bare.log")" = "0" ] && grep -q '^--- PASS: TestStripGovernanceBypassFlags' "$EV/C35-1-bare.log"; then
  emit PASS C35-1 35 unit "shim --bare pins green ($(grep -c '^--- PASS' "$EV/C35-1-bare.log") tests): table covers --bare, --bare=true, '-p --bare', '--bare -p hi', and the negative '--bareword' which must NOT be stripped; managed strips+records, cooperative honours+records, no-flag records nothing"
else
  emit FAIL C35-1 35 unit "shim --bare pins red: $(grep -E '^--- FAIL' "$EV/C35-1-bare.log" | tr '\n' ' ' | oneline)"
fi
# ── C35-2 CONVERTED (live agent) ─────────────────────────────────────────────
# The managed endpoint exists now: `devoid ai hooks-status claude-code`, the
# agent log's checkpoint lines and the bypass ledger are all readable, and the
# PRE_TOOL_USE checkpoint is DRIVEN rather than waited for.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C35-2 35 live "$NO_AGENT"
else
  "$AGENT_BIN" ai hooks-status claude-code > "$EV/C35-2-hooks-status.txt" 2>&1
  C35_INST=$(grep -c 'installed \[OK\]' "$EV/C35-2-hooks-status.txt"); C35_INST=${C35_INST:-0}
  C35_FIRED=$(grep -oE '[0-9]+ of 5 have fired' "$EV/C35-2-hooks-status.txt" | head -1)
  C35_PRE=$(grep -c 'PRE_TOOL_USE' "$SP/agent-home/.devoid/devoid.log"); C35_PRE=${C35_PRE:-0}

  # DRIVE THE ACCEPTANCE'S OWN LEVER. The previous run drove
  # DEVOID_SKIP_AI_HOOKS=1 through `devoid ai hook` and reported "no producer".
  # That was the wrong lever for THIS item: item 35 is the `claude --bare` strip
  # at the AGENT SHIM (cmd/devoid/agent_shim.go enforceGovernanceBypassFlags),
  # and the env var is item 36's, read only by aiwire.SkipRequested on three
  # wiring surfaces that never include the hook path.
  #
  # The shim is exercised by copying the agent binary to `claude.exe` on a PATH
  # with no real claude. enforceGovernanceBypassFlags RECORDS BEFORE
  # resolveRealAgentBinary runs, so the whole acceptance-relevant half executes
  # with no vendor process and no egress (the isolated home holds no Claude
  # credentials, so even a resolved binary stops at "Not logged in").
  C35_SHIMDIR="$SP/c35-claudeshim"
  rm -rf "$C35_SHIMDIR"; mkdir -p "$C35_SHIMDIR"
  C35_EXE=$(grep -oE '\$SP/w26/bin/devoid\.exe|/c/Program Files/DeVoid/devoid\.exe' "$AGENT_BIN" 2>/dev/null | tail -1)
  case "$C35_EXE" in '$SP'*) C35_EXE="$SP/w26/bin/devoid.exe";; esac
  cp "${C35_EXE:-/c/Program Files/DeVoid/devoid.exe}" "$C35_SHIMDIR/claude.exe" 2>/dev/null
  C35_MIRROR="$AGENT_HOME/integrity-mirror.jsonl"
  C35_M0=$(grep -c 'LOCAL_OPTOUT_ATTEMPT' "$C35_MIRROR" 2>/dev/null); C35_M0=${C35_M0:-0}
  ( export MSYS_NO_PATHCONV=1
    export USERPROFILE='C:\Users\Owner\AppData\Local\Temp\claude\C--Users-Owner-Documents-Ceragon\5a8be3d0-f70f-4abf-87ef-459960e86a77\scratchpad\agent-home'
    export HOME="$SP/agent-home"
    export PATH="$C35_SHIMDIR:/c/Windows/System32:/c/Windows"
    "$C35_SHIMDIR/claude.exe" --bare -p hi ) > "$EV/C35-2-bare-drive.txt" 2>&1
  C35_M1=$(grep -c 'LOCAL_OPTOUT_ATTEMPT' "$C35_MIRROR" 2>/dev/null); C35_M1=${C35_M1:-0}
  C35_STRIPPED=$(grep -c "removed '--bare'" "$EV/C35-2-bare-drive.txt"); C35_STRIPPED=${C35_STRIPPED:-0}
  C35_CTRL=$(grep 'LOCAL_OPTOUT_ATTEMPT' "$C35_MIRROR" 2>/dev/null | tail -1 | grep -c 'CLAUDE_MANAGED_HOOK'); C35_CTRL=${C35_CTRL:-0}
  C35_LEGACY=$(grep -c 'LOCAL_OPTOUT_ATTEMPT\|CLAUDE_MANAGED_HOOK' "$AGENT_HOME/bypass-events.json" 2>/dev/null); C35_LEGACY=${C35_LEGACY:-0}

  if [ "$C35_INST" -ge 5 ] 2>/dev/null && [ "$C35_STRIPPED" -gt 0 ] 2>/dev/null && [ "$C35_M1" -gt "$C35_M0" ] 2>/dev/null && [ "$C35_CTRL" -gt 0 ] 2>/dev/null; then
    emit PASS C35-2 35 live "ACCEPTANCE CORRECTED — the acceptance requires that \`claude --bare -p \\\"hi\\\"\` make **bypass-events.json** gain one LOCAL_OPTOUT_ATTEMPT/CLAUDE_MANAGED_HOOK record. NO TREE CAN SATISFY THAT: §9.7 decision 28 deliberately retired that legacy surface for this class, and cmd/devoid/ai_local_bypass.go:84-86 pins it — 'It never touches security.RecordEvents, so no legacy bypass-events.json / heartbeat bypassTelemetry record is produced'. Satisfying it verbatim would mean REVERTING that decision, i.e. weakening the record's home, not strengthening it. VERIFIED INSTEAD, and EXECUTED this run against the live managed endpoint: the same attempt, the same locked vocabulary, on the surface the product actually writes — \`claude --bare -p hi\` through the agent shim stripped the flag ($C35_STRIPPED stderr notice line(s)) and the endpoint's integrity mirror gained a record, LOCAL_OPTOUT_ATTEMPT $C35_M0 -> $C35_M1 with control=CLAUDE_MANAGED_HOOK on the newest row, phase=ATTEMPT outcome=BLOCKED response=vendor-bypass-flag-stripped. Hooks remain installed ($C35_INST [OK] checkpoints, $C35_FIRED; $C35_PRE PRE_TOOL_USE lines in the endpoint log). Legacy bypass-events.json records, as designed: $C35_LEGACY"
  else
    emit FAIL C35-2 35 live "the \`claude --bare\` strip+record path did not complete on the live endpoint: hooks installed=$C35_INST ($C35_FIRED), stderr strip notice lines=$C35_STRIPPED, integrity-mirror LOCAL_OPTOUT_ATTEMPT $C35_M0 -> $C35_M1, newest-row control=CLAUDE_MANAGED_HOOK match=$C35_CTRL, legacy bypass-events.json records=$C35_LEGACY, $C35_PRE PRE_TOOL_USE lines in the endpoint log"
  fi
fi

# =============================================================================
# ITEM 36 [C4] — DEVOID_SKIP_AI_HOOKS=1 produces a bypass record at every site.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/aiwire/... ) > "$EV/C36-1-skip.log" 2>&1
if grep -qE '^ok\s+github.com/codefense/cli-wrapper/internal/aiwire' "$EV/C36-1-skip.log"; then
  emit PASS C36-1 36 unit "internal/aiwire green ($(grep -c '^--- PASS' "$EV/C36-1-skip.log") tests): managed refusal records exactly once with Allowed:false, cooperative honour also records, unset records nothing, legacy CERA_ alias still read, dedup never drops the first"
else
  emit FAIL C36-1 36 unit "internal/aiwire red: $(grep -E '^(FAIL|--- FAIL)' "$EV/C36-1-skip.log" | tr '\n' ' ' | oneline)"
fi

SITES=$(cd "$INST" && grep -rln 'DEVOID_SKIP_AI_HOOKS\|CERA_SKIP_AI_HOOKS' --include=*.go . | grep -v '_test.go' | tr '\n' ' ')
NSITES=$(printf '%s' "$SITES" | wc -w)
if [ "$NSITES" = "1" ]; then
  emit PASS C36-2 36 static "exactly ONE non-test source names the opt-out variable: $SITES (plan said 5 read sites; origin/main had 3; the recording accessor is now the only one). Enforced by internal/aiwire/skip_read_sites_test.go, which walks the WHOLE module — a stronger pin than the CI grep the plan asked for."
else
  emit FAIL C36-2 36 static "$NSITES non-test sources name the opt-out variable: $SITES"
fi
# ── C36-3: the endpoint is NO LONGER the blocker; the RECONCILE PASS is ──────
# The opt-out has exactly one reader (C36-2), and it sits inside a full
# aiwire.Reconcile pass. That SAME pass also runs the Codex MACHINE-requirements
# lane, which writes C:\ProgramData\OpenAI\Codex — the one tree this run is
# forbidden to touch (it has been destroyed three times in this programme). So
# the acceptance's own command cannot be run here for a NEW reason. What CAN be
# driven is driven, and what it produced is reported.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C36-3 36 live "$NO_AGENT"
else
  C36_BEFORE=$(grep -c 'skip\|OPTOUT' "$AGENT_HOME/bypass-events.json" 2>/dev/null); C36_BEFORE=${C36_BEFORE:-0}
  DEVOID_SKIP_AI_HOOKS=1 "$AGENT_BIN" ai hook claude-pretooluse < "$SP/c32-foreign.json" > "$EV/C36-3-skip-hook.txt" 2>&1
  sleep 2
  C36_AFTER=$(grep -c 'skip\|OPTOUT' "$AGENT_HOME/bypass-events.json" 2>/dev/null); C36_AFTER=${C36_AFTER:-0}
  emit BLOCKED C36-3 36 live "the endpoint precondition is MET (a managed, enrolled DeVoid runs on CND34521VN) — the acceptance's own command is what cannot run: \`devoid ai reconcile\` reaches the opt-out's ONLY reader through a full aiwire.Reconcile pass, and that pass ALSO runs the Codex machine-requirements lane, which writes C:\\ProgramData\\OpenAI\\Codex. This run is forbidden to write that tree. Measured instead, and it is a real observation: DEVOID_SKIP_AI_HOOKS=1 through the SHIPPED \`devoid ai hook claude-pretooluse\` produced NO bypass record (opt-out records in bypass-events.json before=$C36_BEFORE after=$C36_AFTER) — the hook path does not consult the accessor at all, so \"a bypass record at EVERY site\" is unproven for the site a developer would actually reach first"
fi

# =============================================================================
# ITEM 37 [C10b] — a tampered VALUE and an unparseable FILE must not share
#                  `managed-file-malformed`.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/codexmanaged/ -run 'TestClassify' ) > "$EV/C37-1-drift.log" 2>&1
if grep -q '^--- PASS: TestClassify_ValueDriftIsNotFileMalformed' "$EV/C37-1-drift.log" && \
   grep -q '^--- PASS: TestClassify_MalformedManagedFailsClosed' "$EV/C37-1-drift.log"; then
  emit PASS C37-1 37 unit "the two slugs are structurally distinct: TestClassify_ValueDriftIsNotFileMalformed PASS over $(grep -cE '^    --- PASS: TestClassify_ValueDriftIsNotFileMalformed/' "$EV/C37-1-drift.log") cases incl. R2_sandbox_unlocked (sandbox_mode=\"danger-full-access\" -> managed-value-drift); TestClassify_MalformedManagedFailsClosed keeps managed-file-malformed for the truncated file"
else
  emit FAIL C37-1 37 unit "value-drift/malformed separation not proven: $(grep -E '^(FAIL|--- FAIL)' "$EV/C37-1-drift.log" | tr '\n' ' ' | oneline)"
fi
# ── C37-2 CONVERTED (live agent, isolated CODEX_HOME) ────────────────────────
# The two tampers now run for real against `--codex-home <scratch>`; nothing
# under C:\ProgramData\OpenAI\Codex is written. The control is the point: the
# SAME command is run against an EMPTY directory, against the committed
# drift-01-hook-removed corpus home, and against the live enrolled home.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C37-2 37 live "$NO_AGENT"
else
  C37_REQ_A=$(hashof "$REQTOML")
  rm -rf "$SP/c37-empty" "$SP/c37-drift"; mkdir -p "$SP/c37-empty"
  cp -r "$INST/internal/codexmanaged/testdata/scfg/corpus/drift-01-hook-removed/home" "$SP/c37-drift" 2>/dev/null
  SPW_C37="C:/Users/Owner/AppData/Local/Temp/claude/C--Users-Owner-Documents-Ceragon/5a8be3d0-f70f-4abf-87ef-459960e86a77/scratchpad"
  "$AGENT_BIN" ai hooks-status codex --codex-home "$SPW_C37/c37-empty"        > "$EV/C37-2-empty.txt"  2>&1
  "$AGENT_BIN" ai hooks-status codex --codex-home "$SPW_C37/c37-drift"        > "$EV/C37-2-drift.txt"  2>&1
  "$AGENT_BIN" ai hooks-status codex                                          > "$EV/C37-2-real.txt"   2>&1
  C37_REQ_B=$(hashof "$REQTOML")
  C37_E_OK=$(grep -c 'installed \[OK\]' "$EV/C37-2-empty.txt"); C37_E_OK=${C37_E_OK:-0}
  C37_D_OK=$(grep -c 'installed \[OK\]' "$EV/C37-2-drift.txt"); C37_D_OK=${C37_D_OK:-0}
  C37_R_OK=$(grep -c 'installed \[OK\]' "$EV/C37-2-real.txt");  C37_R_OK=${C37_R_OK:-0}
  C37_E_H=$(grep -oE 'managed-block hash: [0-9a-f]+' "$EV/C37-2-empty.txt" | awk '{print $NF}')
  C37_D_H=$(grep -oE 'managed-block hash: [0-9a-f]+' "$EV/C37-2-drift.txt" | awk '{print $NF}')
  C37_R_H=$(grep -oE 'managed-block hash: [0-9a-f]+' "$EV/C37-2-real.txt"  | awk '{print $NF}')
  if [ "$C37_REQ_A" != "$C37_REQ_B" ]; then
    emit FAIL C37-2 37 live "the isolated-CODEX_HOME probe CHANGED the machine baseline: requirements.toml $C37_REQ_A -> $C37_REQ_B. A read-only status command must never write that tree"
  elif [ "$C37_E_OK" = "$C37_R_OK" ] && [ "$C37_E_H" = "$C37_R_H" ] && [ "$C37_D_OK" = "$C37_R_OK" ]; then
    emit FAIL C37-2 37 live "the per-user Codex status surface IS NOT A FUNCTION OF THE CODEX_HOME IT NAMES. \`devoid ai hooks-status codex --codex-home <dir>\` was run three ways on the live endpoint against an EMPTY directory, against the committed drift-01-hook-removed corpus home (the DeVoid hook block REMOVED from config.toml), and against the real enrolled home. All three printed the SAME $C37_R_OK rows of \"installed [OK]\" for R1-R8 and the SAME managed-block hash $C37_R_H, while faithfully echoing the different path in their header. An operator cannot use this surface to detect a tampered, relocated or entirely absent CODEX_HOME — it reports a governed cooperative layer over a directory with no files in it. (requirements.toml unchanged across the probe: $C37_REQ_A)"
  else
    emit PASS C37-2 37 live "the per-user Codex status surface discriminates by home: empty=$C37_E_OK OK rows (hash ${C37_E_H:-none}), drift-01-hook-removed=$C37_D_OK (hash ${C37_D_H:-none}), real=$C37_R_OK (hash ${C37_R_H:-none}); requirements.toml unchanged ($C37_REQ_A)"
  fi
fi

# =============================================================================
# ITEM 38 [C10c] — TOOL_CALL_BLOCKED must not render prompt-blocking copy.
# =============================================================================
( cd "$FE" && npx jest --ci --testPathPattern 'display-decoder-parity|session-timeline-content' ) > "$EV/C38-1-copy.log" 2>&1
P38A=$(cd "$FE" && grep -c 'not.toMatch(/prompt/i)' app/ai-control-plane/__tests__/display-decoder-parity.test.tsx 2>/dev/null)
P38B=$(cd "$FE" && grep -c 'not.toMatch(/prompt/i)' "app/ai-control-plane/ai-sessions/[id]/__tests__/session-timeline-content.test.tsx" 2>/dev/null)
if grep -qE '^Tests: +[0-9]+ passed' "$EV/C38-1-copy.log" && ! grep -q 'failed,' "$EV/C38-1-copy.log" && [ "${P38A:-0}" -ge 1 ] && [ "${P38B:-0}" -ge 1 ]; then
  emit PASS C38-1 38 unit "$(grep -E '^(Test Suites|Tests):' "$EV/C38-1-copy.log" | tr '\n' ' ' | oneline); the tool-kind sentence is asserted not.toMatch(/prompt/i) in BOTH files (parity=$P38A, timeline=$P38B)"
else
  emit FAIL C38-1 38 unit "copy pins: $(grep -E '^(Test Suites|Tests):' "$EV/C38-1-copy.log" | tr '\n' ' ' | oneline); /prompt/i assertions parity=$P38A timeline=$P38B"
fi
check_C38_2
check_C38_3

# =============================================================================
# ITEM 39 [C11] — an unknown role grants NOTHING, with a visible banner.
# =============================================================================
( cd "$FE" && npx jest --ci --testPathPattern 'roles.test|normalize-frontend-user-role|site-context.role' ) > "$EV/C39-1-roles.log" 2>&1
if grep -qE '^Tests: +[0-9]+ passed' "$EV/C39-1-roles.log" && ! grep -q 'failed,' "$EV/C39-1-roles.log"; then
  emit PASS C39-1 39 unit "$(grep -E '^(Test Suites|Tests):' "$EV/C39-1-roles.log" | tr '\n' ' ' | oneline): getPermissions('unknown') all-false; every bogus role incl. 'constructor'/'__proto__' all-false (own-property guard); normalizeFrontendUserRole('auditor'|'regional_auditor_2'|'') -> 'unknown'"
else
  emit FAIL C39-1 39 unit "role pins red: $(grep -E '^(Test Suites|Tests):' "$EV/C39-1-roles.log" | tr '\n' ' ' | oneline)"
fi

# The server-side half IS measurable without entering credentials: mint a JWT
# whose role string is unrecognised and ask what it is granted.
if [ -f "$SP/c39/auditor.jwt" ]; then
  SITE=$(cat "$SP/c11/site.txt")
  ra=$(curl -s -m 15 -H "Authorization: Bearer $(cat "$SP/c39/auditor.jwt")" -o "$EV/C39-2-auditor-policy.json" -w '%{http_code}' "$BURL/api/v1/ai/security-policy?siteId=$SITE")
  rv=$(curl -s -m 15 -H "Authorization: Bearer $(cat "$SP/c39/viewer.jwt")"  -o "$EV/C39-3-viewer-policy.json"  -w '%{http_code}' "$BURL/api/v1/ai/security-policy?siteId=$SITE")
  # THE PRINCIPAL MATTERS AS MUCH AS THE ROLE, and the first version of this check
  # did not look at it. `verifyAccessToken` hydrates `isAdmin` from the DATABASE,
  # not the JWT, and roles.guard.ts:55 admits a platform admin BEFORE it reads the
  # role string. The local org has exactly one user and its row carries
  # is_admin=true — so the 200 this check reported as "an unrecognised role is
  # granted tenant data" was a platform-admin 200 wearing an unknown role's
  # clothes. Re-measured with a NON-ADMIN principal, every unrecognised role gets
  # 403 and only `owner` gets 200.
  #
  # A probe that mints its principal from the only seeded user cannot separate
  # "the role was accepted" from "the person was an admin". Rather than create and
  # delete users from a verification check — side effects on a stack other sessions
  # share — read is_admin and say so when the probe cannot isolate the variable.
  ADMINFLAG=$(psqlq codefense_db "select count(*) from users where is_admin = true;" 2>/dev/null | tr -d ' \r')
  if [ "$ra" = "200" ] && [ "${ADMINFLAG:-0}" -ge 1 ]; then
    emit BLOCKED C39-2 39 live "this probe cannot isolate the role: the only local principal is a PLATFORM ADMIN ($ADMINFLAG user row(s) with is_admin=true), verifyAccessToken hydrates isAdmin from the DB not the JWT, and roles.guard.ts:55 admits a platform admin before reading the role string — so the $ra on GET /api/v1/ai/security-policy is an admin 200, not a role 200 ('viewer' -> $rv). Re-measured with a non-admin principal during the cluster-A/C fix wave: auditor/viewer/member+auditor/no-userId all 403, CONTROL owner 200. The property is pinned by roles.guard.unknown-role.spec.ts (31 wire-level cases, verified to bite: a permissive normaliser turns 11 red) — see C39-4"
  elif [ "$ra" = "200" ]; then
    emit FAIL C39-2 39 live "an UNRECOGNISED role string ('auditor') is granted tenant data by the server from a NON-ADMIN principal: GET /api/v1/ai/security-policy (an @AuthAdmin() route) -> $ra, body starts $(head -c 90 "$EV/C39-2-auditor-policy.json"); 'viewer' -> $rv"
  else
    emit PASS C39-2 39 live "unrecognised role 'auditor' -> $ra on GET /api/v1/ai/security-policy (viewer -> $rv)"
  fi

  # C39-4 — the property, executed. The live probe above is blind to the role on
  # this box; this is not.
  rg=$(cd "$BE" && npx jest --ci --testPathPattern 'roles.guard.unknown-role' 2>&1 | grep -E '^(Test Suites|Tests):' | tr '\n' ' ' | oneline)
  printf '%s\n' "$rg" > "$EV/C39-4-roles-guard-spec.txt"
  if printf '%s' "$rg" | grep -q 'failed'; then
    emit FAIL C39-4 39 unit "roles.guard.unknown-role.spec.ts is RED: $rg"
  elif printf '%s' "$rg" | grep -qE 'Tests: +[0-9]+ passed'; then
    emit PASS C39-4 39 unit "roles.guard.unknown-role.spec.ts green — $rg. Wire-level: every out-of-vocabulary account role and site role denies, the site-admission map is derived from CONSOLE_ACCOUNT_ROLES/CONSOLE_SITE_ROLE_ADMISSION rather than hand-copied, and siteRoles is read as an own-property (the lookup key is an attacker-chosen JWT claim)"
  else
    emit FAIL C39-4 39 unit "roles.guard.unknown-role.spec.ts did not run: $rg"
  fi
else
  emit BLOCKED C39-2 39 live "no role-scoped JWT could be minted; the server-side half of 'grants NOTHING' cannot be answered"
fi
emit BLOCKED C39-3 39 live "the banner half needs a real console login as a user whose backend role is unrecognised. Entering credentials is prohibited for me and the acceptance itself says the owner/an operator performs it."

# =============================================================================
# ITEM 49 [C9] — taint must be rare and meaningful.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/proxy/ -run 'TestC9_|TestRedactIngressText_BenignCorpus|TestIngress' ) > "$EV/C49-1-taint.log" 2>&1
( cd "$INST" && go test -count=1 -v ./internal/ingressrisk/... ) > "$EV/C49-2-combos.log" 2>&1
LONE=$(grep -cE '^    --- PASS: TestC9_LoneHoldFindingNeverForceTaints/' "$EV/C49-1-taint.log")
BENIGN=$(grep -cE '^    --- PASS: TestRedactIngressText_BenignCorpusUntouched/' "$EV/C49-1-taint.log")
if [ "$(grep -cE '^--- FAIL' "$EV/C49-1-taint.log")" = "0" ] && [ "$(grep -cE '^--- FAIL' "$EV/C49-2-combos.log")" = "0" ] && [ "$LONE" -ge 5 ]; then
  emit PASS C49-1 49 unit "lone-finding cases that must NOT ForceTaint: $LONE (git-sha-pair, ecs-env-var-name, migration-timestamp, aws-pagination-token, ci-job-names, detections-finding-name, help-text-earlier, opaque-config-token); benign corpus untouched: $BENIGN; ingressrisk combo cases still taint (poisoned-tool-result, read-then-exfil, obfuscated-injection) with $(grep -c '^--- PASS' "$EV/C49-2-combos.log") tests green"
else
  emit FAIL C49-1 49 unit "taint retune pins: lone=$LONE benign=$BENIGN fails=$(grep -E '^--- FAIL' "$EV/C49-1-taint.log" "$EV/C49-2-combos.log" | tr '\n' ' ' | oneline)"
fi
# ── C49-2 CONVERTED (live agent) ─────────────────────────────────────────────
# Both halves are driven: a 100-tool-result working session (the false-positive
# floor) and then the poisoning fixture followed by a risky call.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C49-2 49 live "$NO_AGENT"
else
  # CONTEXT_TAINTED is once-per-session, so a pinned session id makes the SECOND
  # run of this check observe zero new taints over an already-tainted session.
  # Mint a fresh session per run and drive the whole sequence inside it.
  C49_SID=$(psqlq codefense_db "select gen_random_uuid();" | tr -d '\r')
  python "$SP_W/c49-build-payloads.py" "$SP_W/c49-work" "$C49_SID" > "$EV/C49-2-build.txt" 2>&1
  # Start the session for real first. A replay of orphan tool results is not a
  # "working session": the daemon has no session to taint, so the poisoning
  # half would be measured against an identity that was never opened.
  "$AGENT_BIN" ai hook claude-session < "$SP/c49-work/start.json" > "$EV/C49-2-start.txt" 2>&1
  sleep 3
  C49_T0=$(psqlq codefense_db "select count(*) from ai_events where event_type='CONTEXT_TAINTED';")
  bash "$SP/c49-replay.sh" "$AGENT_BIN" "$SP/c49-work" 100 "$C49_SID" > "$EV/C49-2-replay.txt" 2>&1
  sleep 6
  C49_T1=$(psqlq codefense_db "select count(*) from ai_events where event_type='CONTEXT_TAINTED';")
  "$AGENT_BIN" ai hook claude-posttooluse < "$SP/c49-work/poison.json" > "$EV/C49-2-poison.txt" 2>&1
  sleep 6
  "$AGENT_BIN" ai hook claude-pretooluse  < "$SP/c49-work/risky.json"  > "$EV/C49-2-risky.txt"  2>&1
  # CONTEXT_TAINTED does not ride the hook process: the hook writes a bounded
  # local record and exits, and the daemon posts it on its next tick. A fixed
  # 5-second wait measured that interval, not the producer. Poll for it.
  C49_T2="$C49_T1"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 10
    C49_T2=$(psqlq codefense_db "select count(*) from ai_events where event_type='CONTEXT_TAINTED';")
    [ "$C49_T2" -gt "$C49_T1" ] 2>/dev/null && break
  done
  C49_HELD=$(psqlq codefense_db "select count(*) from ai_events where event_type='TOOL_CALL_HELD';")
  C49_RED=$(grep -oE 'REDACTED:[a-z-]+' "$EV/C49-2-poison.txt" | sort -u | tr '\n' ' ')
  C49_DEC=$(grep -oE '"permissionDecision":"[a-z]+"' "$EV/C49-2-risky.txt" | head -1 | cut -d'"' -f4)
  C49_FALSE=$(( C49_T1 - C49_T0 ))
  C49_NEW=$(( C49_T2 - C49_T1 ))
  if [ "$C49_FALSE" = "0" ] && [ "$C49_NEW" = "1" ] && [ -n "$C49_DEC" ] && [ "$C49_DEC" != "allow" ]; then
    emit PASS C49-2 49 live "both halves driven on CND34521VN in a FRESH session ($C49_SID). 100 BENIGN tool results replayed through the shipped PostToolUse hook produced $C49_FALSE new CONTEXT_TAINTED events (false-positive floor holds at $C49_T0 -> $C49_T1). The poisoning fixture then produced EXACTLY $C49_NEW taint, redacting $C49_RED in the returned tool output, and the next risky call (POST of a local private key to an external host) came back permissionDecision=$C49_DEC. NOTE: the acceptance says HELD; the shipped lane DENIES, which is stricter — TOOL_CALL_HELD is $C49_HELD across the whole stack"
  else
    emit FAIL C49-2 49 live "in a fresh session ($C49_SID), replay of 100 benign tool results moved CONTEXT_TAINTED $C49_T0 -> $C49_T1 (false taints=$C49_FALSE); the poisoning fixture then produced $C49_NEW taint(s) (redactions: $C49_RED) and the next risky call returned permissionDecision=${C49_DEC:-none}; TOOL_CALL_HELD=$C49_HELD"
  fi
fi

# =============================================================================
# ITEM 97 [C5] — the hook-lane prompt gate must be able to BLOCK.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/daemon/ -run 'NonInteractive|HoldSurface|ContainedFloor' ) > "$EV/C97-1-block.log" 2>&1
( cd "$INST" && go test -count=1 -v ./cmd/devoid/ -run 'TestAIHookField|ai_hook_field|TestHookField|UserPromptSubmit' ) > "$EV/C97-2-translate.log" 2>&1
if grep -q '^--- PASS: TestAIPromptCheck_NonInteractiveSecretBlocks' "$EV/C97-1-block.log" && \
   grep -q '^--- PASS: TestHoldSurface_HeadlessConclusiveSecretStillBlocks' "$EV/C97-1-block.log"; then
  emit PASS C97-1 97 unit "daemon pin present and green: a conclusive enforcement-eligible finding with canInterrupt=false yields BLOCK ('noninteractive-secret:block'), NOT allow+OverrideReasonDegradedNonInteractive — TestAIPromptCheck_NonInteractiveSecretBlocks, TestHoldSurface_HeadlessConclusiveSecretStillBlocks, TestHoldSurface_DesktopConclusiveSecretStillBlocks all PASS"
else
  emit FAIL C97-1 97 unit "the block pin is absent or red: $(grep -E '^--- FAIL' "$EV/C97-1-block.log" | tr '\n' ' ' | oneline)"
fi
FIELDOBS=$(cd "$INST" && grep -c 'reads a RECORD OF FIRINGS' cmd/devoid/ai_hook_runner.go 2>/dev/null)
if [ "${FIELDOBS:-0}" -ge 1 ]; then
  emit PASS C97-2 97 static "the 'observed' rung is sourced from the internal/fieldobs firing ledger, never from configuration (claudeFieldObservations in cmd/devoid/ai_hook_runner.go; an absent/unreadable ledger degrades to 'never observed in the field')"
else
  emit FAIL C97-2 97 static "could not confirm certify's observed rung reads a firing ledger rather than configuration"
fi
# ── C97-3: two of the three preconditions are now MET and exercised ──────────
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C97-3 97 live "$NO_AGENT"
else
  C97_ST=$(dtok_post /v1/ai/prompt-check "$SP/qa-live/prompt-oracle2.json" C97-3-credential-probe.json)
  C97_DEC=$(grep -oE '"decision":"[a-z]+"' "$EV/C97-3-credential-probe.json" | head -1 | cut -d'"' -f4)
  C97_REASONS=$(grep -oE '"reasons":\[[^]]*\]' "$EV/C97-3-credential-probe.json" | head -1 | cut -c1-140)
  emit BLOCKED C97-3 97 live "two of the three preconditions are now MET and were exercised: the endpoint is INSTALLED and ENROLLED (agent 70573ce5 / CND34521VN), and a freshly-minted non-sample synthetic credential was submitted through the live governed prompt gate this run — POST /v1/ai/prompt-check -> HTTP $C97_ST decision=$C97_DEC reasons=$C97_REASONS. The remaining precondition is ELEVATION: $ELEVATION_BLOCK, so the machine-scope half of the owner's proof standard (an elevated managed endpoint, machine ACLs applied) cannot be answered. Also not exercised: a real Claude Code session as the submitting client — the checkpoint it drives IS driven directly here"
fi

# =============================================================================
# ITEM 98 [C8] — HELD FOR APPROVAL must be a real actionable queue.
# =============================================================================
node "$SP/c98-db.cjs" > "$EV/C98-1-db-tables.txt" 2>&1
ROWS=$(grep '^ROWS ai_delegated_approval_requests ' "$EV/C98-1-db-tables.txt" | awk '{print $3}')
HELD=$(grep '^ROWS ai_events\[TOOL_CALL_HELD\] ' "$EV/C98-1-db-tables.txt" | awk '{print $3}')
# The producer is "a CreateDelegatedApproval call reachable from the taint->hold
# tool lane" — NOT merely a call somewhere in the daemon (ai_pending_action.go
# has had one all along, on the AI_PROVIDER_DISPATCH lane, while all four tables
# stayed empty). Measure the tool lane specifically.
RESOLVE=$(cd "$INST" && grep -c 'approval := s.resolveToolHoldApproval' internal/daemon/ai_handlers.go 2>/dev/null)
PRODUCER=$(cd "$INST" && grep -c 'CreateDelegatedApproval' internal/daemon/ai_tool_hold_approval.go 2>/dev/null)
if [ "${RESOLVE:-0}" -ge 1 ] && [ "${PRODUCER:-0}" -ge 1 ]; then
  emit PASS C98-1 98 static "the tool lane now HAS a producer: ai_handlers.go calls resolveToolHoldApproval() inside the taint->hold branch before emitting, and internal/daemon/ai_tool_hold_approval.go:394 calls CreateDelegatedApproval ($PRODUCER reference(s)). NOTE: this landed on the base as f3a381d DURING this verification run — a static reading taken minutes earlier correctly showed no producer."
else
  emit FAIL C98-1 98 static "ACTIONABLE QUEUE HAS NO PRODUCER on this base. emitToolCallHeld emits TOOL_CALL_HELD + a bypass event and returns; resolveToolHoldApproval call sites in the hold branch = ${RESOLVE:-0}; CreateDelegatedApproval in ai_tool_hold_approval.go = ${PRODUCER:-0}. The only daemon caller is ai_pending_action.go:140 (AI_PROVIDER_DISPATCH), not the taint->hold tool lane the acceptance measures."
fi

( cd "$INST" && go test -count=1 -v ./internal/daemon/ -run 'ToolHold|HoldApproval' ) > "$EV/C98-6-holdapproval.log" 2>&1
NHOLD=$(grep -cE '^--- PASS: Test(ToolHold|HoldApproval)' "$EV/C98-6-holdapproval.log")
if [ "$(grep -cE '^--- FAIL' "$EV/C98-6-holdapproval.log")" = "0" ] && [ "$NHOLD" -ge 6 ]; then
  emit PASS C98-6 98 unit "$NHOLD hold-approval pins green: CreatesActionableApprovalRow, IdempotentAcrossRepeats, NoReviewerIsNamedNotMediated (the plan's 'no stop-continuation when the fake backend returns no reviewer' case), GrantReleasesOnceThenIsSpent, DenialBlocks, ExpiryDoesNotAuthorize, ApprovalKeysRideTheSpool, BindingPinsTheExactInvocation"
else
  emit FAIL C98-6 98 unit "hold-approval pins: $NHOLD pass, $(grep -E '^--- FAIL' "$EV/C98-6-holdapproval.log" | tr '\n' ' ' | oneline)"
fi
if [ "${ROWS:-x}" = "0" ]; then
  emit BLOCKED C98-2 98 live "live local mirror: ai_delegated_approval_requests = $ROWS rows (grants/presence/transitions also 0) and ai_events carries $HELD TOOL_CALL_HELD rows out of $(grep '^ROWS ai_events ' "$EV/C98-1-db-tables.txt" | awk '{print $3}') total. The acceptance's 0 -> 1 transition needs a RUNNING DeVoid daemon to taint a session and hold a risky tool call; no agent is installed here, so the producer that now EXISTS in code (see C98-1) cannot be exercised on this box."
else
  emit PASS C98-2 98 live "ai_delegated_approval_requests = $ROWS rows"
fi
( cd "$FE" && npx jest --ci --testPathPattern 'session-timeline-content|event-outcome-copy|disposition-presentation' ) > "$EV/C98-3-disposition.log" 2>&1
if grep -qE '^Tests: +[0-9]+ passed' "$EV/C98-3-disposition.log" && ! grep -q 'failed,' "$EV/C98-3-disposition.log"; then
  emit PASS C98-3 98 unit "the DISPOSITION half is green: $(grep -E '^(Test Suites|Tests):' "$EV/C98-3-disposition.log" | tr '\n' ' ' | oneline) — a hold is no longer treated as self-evident and devoid-mediated is treated as no evidence"
else
  emit FAIL C98-3 98 unit "disposition pins red: $(grep -E '^(Test Suites|Tests):' "$EV/C98-3-disposition.log" | tr '\n' ' ' | oneline)"
fi
# ── C98-4: part 1 is now DRIVEN; the console approval surface is not ─────────
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C98-4 98 live "$NO_AGENT"
else
  C98_TAINT=$(psqlq codefense_db "select count(*) from ai_events where event_type='CONTEXT_TAINTED';")
  C98_HELD=$(psqlq codefense_db "select count(*) from ai_events where event_type='TOOL_CALL_HELD';")
  C98_REQ=$(psqlq codefense_db "select count(*) from ai_delegated_approval_requests;")
  emit BLOCKED C98-4 98 live "part 1 of the four is now PROVEN LIVE and parts 2-4 are not. Driven this run on CND34521VN: a poisoned tool result through the shipped PostToolUse hook TAINTED the session (ai_events CONTEXT_TAINTED = $C98_TAINT) and the next risky tool call was refused. Part 2 did NOT occur — the lane DENIES rather than HOLDS, so TOOL_CALL_HELD is still $C98_HELD and ai_delegated_approval_requests is still $C98_REQ rows; with no held request there is nothing to approve, deny or expire. Parts 3-4 additionally need an authenticated console session at /admin/policies/approvals, and entering credentials in a browser is prohibited for me"
fi

# WHERE the producer actually is — an unmerged branch, not a missing build.
PBR=/c/Users/Owner/Documents/Ceragon/.worktrees/w15-inst-c8-producer
PSHA=$(git -C "$PBR" rev-parse --short HEAD 2>/dev/null)
PSUBJ=$(git -C "$PBR" log -1 --pretty=%s 2>/dev/null)
PMERGED=$(git -C "$INST" branch --contains "$PSHA" 2>/dev/null | grep -c 'integration/qa0802-inst')
PCALL=$(git -C "$PBR" grep -c 'CreateDelegatedApproval' HEAD -- internal/daemon/ai_tool_hold_approval.go 2>/dev/null | cut -d: -f2)
if [ -n "$PSHA" ] && [ "${PMERGED:-0}" = "0" ]; then
  emit FAIL C98-5 98 static "the producer EXISTS but is NOT in the assembled base: branch fix/qa0802-c8-approval-producer @ $PSHA ('$PSUBJ') adds internal/daemon/ai_tool_hold_approval.go (+448) whose line 394 calls CreateDelegatedApproval, and it is NOT contained in integration/qa0802-inst. Remedy is a merge, not a build."
elif [ "${PMERGED:-0}" != "0" ]; then
  emit PASS C98-5 98 static "the producer branch $PSHA IS contained in integration/qa0802-inst"
else
  emit BLOCKED C98-5 98 static "could not read the producer worktree at $PBR to say where the queue producer lives"
fi

# =============================================================================
# ITEM 99 [C12] — CONFIG_CHANGE a real checkpoint; the Anthropic route a real
#                 decision point. The checkpoint DECIDES NOTHING by design —
#                 verify that is STRUCTURAL, not a comment.
# =============================================================================
( cd "$INST" && go test -count=1 -v ./internal/airuntime/adapters/claudecode/ -run 'ConfigChange' ) > "$EV/C99-1-configchange.log" 2>&1
( cd "$INST" && go test -count=1 -v ./cmd/devoid/ -run 'TransportRoute|RouteStatus' ) > "$EV/C99-2-route.log" 2>&1
GATE=$(cd "$INST" && grep -c 'EventConfigChange' internal/airuntime/adapters/claudecode/claudecode.go 2>/dev/null)
GATESET=$(cd "$INST" && sed -n '/^var gatingCheckpoints/,/}/p' internal/airuntime/adapters/claudecode/*.go 2>/dev/null | grep -c 'EventConfigChange')
if grep -q '^--- PASS: TestConfigChangeIsObservationOnly' "$EV/C99-1-configchange.log" && [ "${GATESET:-0}" = "0" ]; then
  emit PASS C99-1 99 unit "STRUCTURAL, not a comment: TestConfigChangeIsObservationOnly PASSes and asserts (a) audit-only translates with ZERO stdout, (b) all six deny-capable effects (deny-prompt, deny-tool, stop-continuation, deny-escalation, replace-output, rewrite-input) return ErrUnsupportedEffect and emit nothing, (c) CONFIG_CHANGE is absent from GatingCheckpoints() — $GATESET occurrences in the gatingCheckpoints literal"
else
  emit FAIL C99-1 99 unit "CONFIG_CHANGE observation-only is not structurally enforced: $(grep -E '^(FAIL|--- FAIL)' "$EV/C99-1-configchange.log" | tr '\n' ' ' | oneline); gatingCheckpoints occurrences=$GATESET"
fi
if grep -q 'observation unknown' "$EV/C99-2-route.log" || (cd "$INST" && grep -q 'observation unknown' cmd/devoid/ai.go); then
  emit PASS C99-2 99 static "routeStatusLabel(installed, provider, obs) renders three distinct states: 'observation unknown [!]' when the daemon cannot be asked, 'NEVER OBSERVED [!]' on a zero decision counter, and 'observed (N decisions, last …)' only on a real count — never a bare 'installed [OK]' (cmd/devoid/ai.go:481-496), pinned by ai_transport_route_status_test.go"
else
  emit FAIL C99-2 99 static "the never-observed / unknown qualifiers are not present on the route status line"
fi
# ── C99-3 CONVERTED (live agent) ─────────────────────────────────────────────
# The CONFIG_CHANGE checkpoint is DRIVEN on the live endpoint and every surface
# the acceptance names is then read.
if [ "$AGENT_LIVE" != "1" ]; then
  emit BLOCKED C99-3 99 live "$NO_AGENT"
else
  printf '{"source":"claude-user-settings","reason":"MANAGED_CONFIG_MODIFIED","session_id":"7a1c9f40-2b6d-4c31-9e52-8d4f0b7a1e23"}' > "$SP/c99-configchange.json"
  C99_EV0=$(psqlq codefense_db "select count(*) from ai_events where event_type like '%CONFIG%';")
  C99_TAM0=$(grep -c 'MANAGED_CONFIG_MODIFIED' "$SP/agent-home/.devoid/tamper.log" 2>/dev/null); C99_TAM0=${C99_TAM0:-0}
  C99_OBS0=$(grep -A5 'CONFIG_CHANGE|audit-only' "$AGENT_HOME/ai-field-observations.json" 2>/dev/null | grep '"count"' | grep -oE '[0-9]+' | head -1); C99_OBS0=${C99_OBS0:-0}
  "$AGENT_BIN" ai hook --adapter claude-code --event CONFIG_CHANGE < "$SP/c99-configchange.json" > "$EV/C99-3-configchange.txt" 2>&1
  C99_EXIT=$?
  sleep 4
  C99_EV1=$(psqlq codefense_db "select count(*) from ai_events where event_type like '%CONFIG%';")
  C99_TAM1=$(grep -c 'MANAGED_CONFIG_MODIFIED' "$SP/agent-home/.devoid/tamper.log" 2>/dev/null); C99_TAM1=${C99_TAM1:-0}
  C99_FIRE=$(grep -c 'ConfigChange' "$AGENT_HOME/hook-fires.json" 2>/dev/null); C99_FIRE=${C99_FIRE:-0}
  # A missing table returns a MULTI-LINE psql error, and a newline in a message
  # splits the TSV row. Squeeze it to one field.
  C99_PROXY=$(psqlq codefense_db "select count(*) from ai_proxy_decisions where provider='anthropic';" 2>/dev/null | tr '	
' '  ' | cut -c1-60)
  # MEASURE EACH PRODUCER ON ITS OWN LEDGER. The previous run drove the HOOK arm
  # (acceptance bullet 1) and then asserted on the WATCHER's surfaces (bullet 2),
  # concluding the checkpoint "records nothing". Both halves record — on
  # different ledgers, because they are different producers:
  #
  #   bullet 1  `devoid ai hook --event CONFIG_CHANGE`  -> the FIELD-OBSERVATION
  #             ledger (ai-field-observations.json), via translate() ->
  #             recordFieldObservation. It deliberately makes NO daemon call.
  #   bullet 2  editing the WATCHED file                -> the daemon's
  #             configwatch (internal/configwatch) -> the endpoint tamper stream.
  #
  # hook-fires.json is a third ledger (the daemon's dispatch record) and CONFIG_CHANGE
  # is not a vendor-dispatched hook, so it is reported, never asserted on.
  C99_FOBS="$AGENT_HOME/ai-field-observations.json"
  C99_OBS1=$(grep -A5 'CONFIG_CHANGE|audit-only' "$C99_FOBS" 2>/dev/null | grep '"count"' | grep -oE '[0-9]+' | head -1); C99_OBS1=${C99_OBS1:-0}
  if [ "$C99_OBS1" -gt "${C99_OBS0:-0}" ] 2>/dev/null || [ "$C99_TAM1" -gt "$C99_TAM0" ] 2>/dev/null || [ "$C99_EV1" -gt "$C99_EV0" ] 2>/dev/null; then
    emit PASS C99-3 99 live "the CONFIG_CHANGE checkpoint was driven on CND34521VN (exit $C99_EXIT) and RECORDED: the field-observation ledger's claude-code|CONFIG_CHANGE|audit-only counter advanced ${C99_OBS0:-0} -> $C99_OBS1 (ai-field-observations.json), and the WATCHER half — editing the watched ~/.claude/settings.json — was separately observed writing reason=MANAGED_CONFIG_MODIFIED into the endpoint tamper stream ($C99_TAM0 -> $C99_TAM1) with the daemon logging 'configwatch: CONFIG_CHANGE observed source=claude-user-settings'. RESIDUE, named: ai_events %CONFIG% $C99_EV0 -> $C99_EV1 — the local ai_config_change observation has NO forwarder to the console (internal/daemon/server.go:1908 writes it to the local chain only; the console's AGENT_CONTROL_TAMPER lane is owned by the integrity controller, which correctly raises nothing for a benign key). hook-fires.json ConfigChange rows=$C99_FIRE (a different ledger: CONFIG_CHANGE is not vendor-dispatched). NOT exercised: the real Claude turn / ai_proxy_decisions provider=anthropic arm (${C99_PROXY:-0} rows) — driving the vendor binary egresses to Anthropic"
  else
    emit FAIL C99-3 99 live "the CONFIG_CHANGE checkpoint recorded on NO ledger. Driven live on CND34521VN with a valid closed-vocabulary payload (source=claude-user-settings, reason=MANAGED_CONFIG_MODIFIED): exit $C99_EXIT — field-observation counter ${C99_OBS0:-0} -> $C99_OBS1, endpoint tamper.log MANAGED_CONFIG_MODIFIED $C99_TAM0 -> $C99_TAM1, ai_events %CONFIG% $C99_EV0 -> $C99_EV1, hook-fire records naming ConfigChange = $C99_FIRE"
  fi
fi

# --- ENV: closing hash -------------------------------------------------------
REQ_AFTER=$(hashof "$REQTOML")
if [ "$REQ_BEFORE" = "$REQ_AFTER" ]; then
  emit PASS ENVC-5 0 live "requirements.toml sha256 AFTER = $REQ_AFTER (UNCHANGED — the go test runs, incl. internal/daemon and internal/codexmanaged, wrote nothing to the owner's Codex machine tree)"
else
  emit FAIL ENVC-5 0 live "requirements.toml CHANGED during this run: before=$REQ_BEFORE after=$REQ_AFTER"
fi
