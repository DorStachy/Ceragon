#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# classify-failures — separate REAL red from CONTENTION red.
#
# The full run is deliberately parallel and deliberately memory-capped, so some
# of its red is manufactured by the harness rather than found in the code: a
# worker recycled mid-assignment reports its file as "failed to run", and a
# 5-second `beforeAll` hook can time out purely because three ts-jest workers
# and a Postgres are sharing 12 vCPUs.
#
# Those two look identical in a summary. The way to tell them apart is to re-run
# ONLY the red suites with the contention removed: one container, `--runInBand`
# (a single process, no worker pool at all), a 3 GiB heap, nothing else running.
#
#   still red here  -> a real finding: (a) defect in the merged Backend, or
#                      (b) pre-existing failure. Read the message to decide.
#   green here      -> (c) environmental/flaky under the parallel lane.
#
# Run it with the suite NOT running, or it re-creates the contention it exists
# to rule out.
#
#   bash classify-failures.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

IMAGE="${IMAGE:-ceragon-be-suite:int-gate-backend}"
PG_MAIN="${PG_MAIN:-be-suite-pg}"
VOL_OUT="${VOL_OUT:-be-suite-out}"

export MSYS_NO_PATHCONV=1

docker rm -f be-suite-classify >/dev/null 2>&1

docker run --rm --name be-suite-classify \
  --network="container:$PG_MAIN" \
  --memory=4g --memory-swap=4g \
  -v "$VOL_OUT:/out" \
  "$IMAGE" bash -c '
set -u

# Same env as the full run — a live-pg suite re-run without it would self-skip
# and look "fixed".
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=5432 DATABASE_USER=codefense \
       DATABASE_PASSWORD=codefense DATABASE_NAME=codefense_db \
       JWT_SECRET=ci-test-only-jwt-secret \
       RUN_INTEGRATION_TESTS=true RUN_LIVE_PG_TESTS=true \
       RUN_LICENSE_INTEGRATION_TESTS=true \
       AI_POLICY_MIGRATION_E2E=1 AI_POLICY_PGHOST=127.0.0.1 AI_POLICY_PGPORT=5432 \
       AI_POLICY_PGUSER=codefense AI_POLICY_PGPASS=codefense AI_POLICY_PGDB=codefense_db \
       M47_MIGRATION_E2E=1 M47_MIGRATION_PGHOST=127.0.0.1 M47_MIGRATION_PGPORT=5432 \
       M47_MIGRATION_PGUSER=codefense M47_MIGRATION_PGPASS=codefense M47_MIGRATION_PGDB=codefense_db \
       AICP_M1_E2E=1 AICP_M1_PGHOST=127.0.0.1 AICP_M1_PGPORT=55432 \
       AICP_M1_PGUSER=aicp AICP_M1_PGPASS=aicp AICP_M1_PGDB=aicp \
       AICP_M2_E2E=1 AICP_M2_PGHOST=127.0.0.1 AICP_M2_PGPORT=55433 \
       AICP_M2_PGUSER=aicp AICP_M2_PGPASS=aicp AICP_M2_PGDB=aicp

node -e "
const fs=require(\"fs\");
const out=new Set();
for (const f of fs.readdirSync(\"/out\").filter(n=>n.startsWith(\"jest-summary-\")&&n.endsWith(\".json\"))) {
  let s; try { s=JSON.parse(fs.readFileSync(\"/out/\"+f,\"utf8\")); } catch { continue; }
  for (const r of s.testResults||[]) if (r.status===\"failed\") out.add(r.name.replace(/^.*?\\/app\\//,\"\"));
}
fs.writeFileSync(\"/tmp/failed.txt\",[...out].sort().join(\"\n\")+\"\n\");
console.error(\"red suites to re-check: \"+out.size);
"

echo "===== SUITES BEING RE-RUN SERIALLY ====="
cat /tmp/failed.txt
echo "========================================"

# --runInBand: no worker pool, so "worker terminated" cannot happen by
# construction. If a suite is still red here, the harness is not why.
#
# NO `--json --outputFile` here, deliberately. Jest 29.7.0 crashes writing that
# file when one of these suites fails:
#
#   TypeError: Converting circular structure to JSON
#       --- property 'error' closes the circle
#       at processResults (/app/node_modules/@jest/core/build/runJest.js:194:17)
#
# It throws AFTER every test has already run, so the summary is never written
# and the reporter output is the only record of the result. Keep the FULL
# reporter output -- an earlier cut piped it through `tail -80` and threw away
# the very list this script exists to produce.
node --max-old-space-size=3072 node_modules/jest/bin/jest.js \
  --ci --runInBand \
  $(tr "\n" " " < /tmp/failed.txt) 2>&1
echo "reclassify exit=$?"
'
