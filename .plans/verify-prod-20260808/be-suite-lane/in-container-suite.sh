#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Runs INSIDE the ceragon-be-suite container. Everything it touches is either
# container-local overlayfs (/app) or a named volume (/out). Nothing is read
# from, or written to, the Windows host filesystem during the run.
#
# Mirrors pr-checks.yml's `full_test` job step-for-step: same preparation, same
# env, same shard count, same suite gate afterwards. The only deliberate
# differences are recorded inline.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SHARDS="${SHARDS:-4}"
WORKERS="${WORKERS:-2}"
IDLE_LIMIT="${IDLE_LIMIT:-1024MB}"
FIRST_SHARD="${FIRST_SHARD:-1}"
OUT=/out

mkdir -p "$OUT"

say() { echo ""; echo "=== $* ==="; }

# ── Phase 0: the three Postgres servers ─────────────────────────────────────
# Addressed on LOOPBACK, exactly as CI addresses them. That is not cosmetic:
# src/__test-utils__/assert-non-production-db.ts (a `setupFiles` entry, so it
# runs in every worker before any spec loads) REFUSES a non-loopback
# DATABASE_HOST unless ALLOW_NONLOCAL_TEST_DB=true. Putting the servers in this
# container's own network namespace means the lane satisfies that guard instead
# of switching it off.
say "waiting for postgres"
for spec in "5432:codefense" "55432:aicp" "55433:aicp"; do
  port="${spec%%:*}"; user="${spec##*:}"
  for _ in $(seq 1 60); do
    if pg_isready -h 127.0.0.1 -p "$port" -U "$user" >/dev/null 2>&1; then
      echo "  postgres ready on 127.0.0.1:$port"
      break
    fi
    sleep 2
  done
  pg_isready -h 127.0.0.1 -p "$port" -U "$user" || { echo "FATAL: no postgres on $port"; exit 1; }
done

# ── Shared env, copied from pr-checks.yml `full_test` ───────────────────────
export DATABASE_HOST=127.0.0.1
export DATABASE_PORT=5432
export DATABASE_USER=codefense
export DATABASE_PASSWORD=codefense
export DATABASE_NAME=codefense_db
export JWT_SECRET=ci-test-only-jwt-secret

export RUN_INTEGRATION_TESTS=true
export RUN_LIVE_PG_TESTS=true
export RUN_LICENSE_INTEGRATION_TESTS=true

export AI_POLICY_MIGRATION_E2E=1
export AI_POLICY_PGHOST=127.0.0.1
export AI_POLICY_PGPORT=5432
export AI_POLICY_PGUSER=codefense
export AI_POLICY_PGPASS=codefense
export AI_POLICY_PGDB=codefense_db

export M47_MIGRATION_E2E=1
export M47_MIGRATION_PGHOST=127.0.0.1
export M47_MIGRATION_PGPORT=5432
export M47_MIGRATION_PGUSER=codefense
export M47_MIGRATION_PGPASS=codefense
export M47_MIGRATION_PGDB=codefense_db

# Each AICP spec calls DataSource.synchronize(true) — DROP AND RECREATE EVERY
# TABLE — so they get one throwaway server each and never the prepared one.
export AICP_M1_E2E=1
export AICP_M1_PGHOST=127.0.0.1
export AICP_M1_PGPORT=55432
export AICP_M1_PGUSER=aicp
export AICP_M1_PGPASS=aicp
export AICP_M1_PGDB=aicp

export AICP_M2_E2E=1
export AICP_M2_PGHOST=127.0.0.1
export AICP_M2_PGPORT=55433
export AICP_M2_PGUSER=aicp
export AICP_M2_PGPASS=aicp
export AICP_M2_PGDB=aicp

# ── Phase 1: build the schema the way production builds it ──────────────────
if [ "${SKIP_PREPARE:-0}" != "1" ]; then
  say "prepare live-pg schema (migration chain on an empty database)"
  ALLOW_TEST_DB_SCHEMA_SYNC=true npm run --silent testdb:prepare-live-pg 2>&1 | tee "$OUT/prepare.log"
  prep=${PIPESTATUS[0]}
  echo "prepare exit=$prep" | tee -a "$OUT/prepare.log"
  [ "$prep" -eq 0 ] || { echo "FATAL: schema preparation failed"; exit 1; }

  say "verify migration ledger is clean"
  npm run --silent migration:run 2>&1 | tee "$OUT/migration-run.log"
  echo "migration:run exit=${PIPESTATUS[0]}" | tee -a "$OUT/migration-run.log"
fi

# ── Phase 2: the suite, sharded, sequential ─────────────────────────────────
#
# Sharded and SEQUENTIAL rather than one wide run, for two reasons:
#   * memory — peak is bounded by WORKERS, and WORKERS is what got over-
#     subscribed the last time this was attempted (6 x 2560 MB in a 7.4 GiB VM
#     wedged the engine);
#   * resumability — a shard that completes leaves a summary on the /out named
#     volume, so a run that dies at shard 3 has not thrown away shards 1 and 2.
#     FIRST_SHARD=3 resumes.
#
# NEVER `npx jest` — the DeVoid tool-risk guard is a control we run under, not
# an obstacle to route around. `node node_modules/jest/bin/jest.js` is the same
# binary by its real path.
#
# NOTE-PRETEST: `npm test` would fire the `pretest` hook
# (`build:shared-contracts` -> check:ai-security-consumer + the packed probe).
# Invoking the jest binary directly SKIPS those. They are separate checks, not
# part of the suite; the vendored dist they would rebuild is committed.
for i in $(seq "$FIRST_SHARD" "$SHARDS"); do
  say "shard $i/$SHARDS  (maxWorkers=$WORKERS, workerIdleMemoryLimit=$IDLE_LIMIT)"
  start=$(date +%s)
  node --max-old-space-size="${HEAP_MB:-1536}" node_modules/jest/bin/jest.js \
    --maxWorkers="$WORKERS" \
    --workerIdleMemoryLimit="$IDLE_LIMIT" \
    --shard="$i/$SHARDS" \
    --ci \
    --json --outputFile "$OUT/jest-summary-shard-$i.json" \
    2>&1 | tee "$OUT/shard-$i.log"
  rc=${PIPESTATUS[0]}
  echo "shard $i exit=$rc elapsed=$(( $(date +%s) - start ))s" | tee -a "$OUT/shard-$i.log"
  echo "$rc" > "$OUT/shard-$i.exit"
done

# ── Phase 3: the e2e lane, which is a SEPARATE config ───────────────────────
# `test/jest-e2e.json` matches `*.e2e-spec.ts` (dash). `jest.config.js` matches
# `.*\.spec\.ts$`, which a `-spec.ts` filename does not satisfy — so this lane
# is invisible to the sharded run above and to its suite gate. It also carries
# `passWithNoTests: true`, so it reports green on discovering nothing.
say "e2e lane (test/jest-e2e.json)"
node --max-old-space-size="${HEAP_MB:-1536}" node_modules/jest/bin/jest.js \
  --config ./test/jest-e2e.json \
  --maxWorkers=1 --ci \
  --json --outputFile "$OUT/jest-summary-e2e.json" \
  2>&1 | tee "$OUT/e2e.log"
echo "e2e exit=${PIPESTATUS[0]}" | tee -a "$OUT/e2e.log"

# ── Phase 4: the repo's OWN gate, per shard ─────────────────────────────────
say "assert-suites-executed (the repo's gate) per shard"
for i in $(seq 1 "$SHARDS"); do
  [ -f "$OUT/jest-summary-shard-$i.json" ] || continue
  node scripts/assert-suites-executed.js "$OUT/jest-summary-shard-$i.json" \
    --label "be-suite-lane shard $i/$SHARDS" 2>&1 | tee -a "$OUT/suite-gate.log"
  echo "gate shard $i exit=${PIPESTATUS[0]}" | tee -a "$OUT/suite-gate.log"
done

say "done"
