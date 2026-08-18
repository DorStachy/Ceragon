#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# be-suite-lane — run the Ceragon Backend FULL Jest suite to completion in
# Docker, on a 7.4 GiB Docker VM, without wedging the engine.
#
#   bash run-be-suite.sh build           # build the image from a Backend tree
#   bash run-be-suite.sh up              # start the three Postgres servers
#   bash run-be-suite.sh run             # run the suite (long)
#   bash run-be-suite.sh report          # per-lane discovered-vs-executed
#   bash run-be-suite.sh down            # stop + remove EVERYTHING this created
#
# Environment knobs (all optional):
#   BE_SRC     Backend tree to test        default /c/cwt/int-be
#   SHARDS     jest shards, run in series  default 4
#   WORKERS    jest workers per shard      default 3
#   HEAP_MB    --max-old-space-size        default 1536
#   MEM        container memory cap        default 5g
#   FIRST_SHARD  resume from this shard    default 1
#
# ── WHY THE NUMBERS ARE THE NUMBERS ─────────────────────────────────────────
#
# The Docker VM has 7.413 GiB total. The previous attempt at this run used 6
# jest workers x 2560 MB — a 15 GiB ask against a 7.4 GiB VM — and wedged the
# engine hard enough to need a Docker Desktop restart.
#
# WORKERS=3, HEAP_MB=1536: the ceiling is 3 x 1536 MB of V8 heap plus the jest
# parent, so ~5.0 GiB worst case. MEM=5g puts a cgroup wall in front of that, so
# the failure mode of a bad estimate is "the kernel kills a worker inside this
# container" — a red run — instead of "the VM has no memory left" — a wedged
# engine. That containment is the point of the cap, not the exact figure.
#
# Shards run in SERIES, not parallel: four parallel shards would multiply the
# ceiling by four and put us back where the last attempt was. Sharding here buys
# resumability (each finished shard leaves a summary on the /out named volume),
# not concurrency.
#
# ── WHY THE SOURCE IS IN THE IMAGE ──────────────────────────────────────────
#
# Measured on this box, same tree, same jest, same `--shard=1/80` sample:
#   Windows host, node 25.2.1, maxWorkers=2 ......... 419 s  (~8.7 h projected)
#   container, source in image, node 24, ditto ...... see EVIDENCE.md
# `.dockerignore` already drops node_modules/ — which in the worktrees is a
# junction into the primary Backend checkout — so the container installs its
# own. NEVER run `npm install` in a worktree on the host: it prunes that
# junction and yields 335 phantom TS2305 errors.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BE_SRC="${BE_SRC:-/c/cwt/int-be}"
IMAGE="${IMAGE:-ceragon-be-suite:int-gate-backend}"
SHARDS="${SHARDS:-4}"
WORKERS="${WORKERS:-3}"
HEAP_MB="${HEAP_MB:-1536}"
IDLE_LIMIT="${IDLE_LIMIT:-1024MB}"
MEM="${MEM:-5g}"
MEMSWAP="${MEMSWAP:-6g}"
FIRST_SHARD="${FIRST_SHARD:-1}"

PG_MAIN=be-suite-pg
PG_M1=be-suite-pg-aicp-m1
PG_M2=be-suite-pg-aicp-m2
RUNNER=be-suite-runner
VOL_OUT=be-suite-out
VOL_PG_MAIN=be-suite-pgdata-main
VOL_PG_M1=be-suite-pgdata-aicp-m1
VOL_PG_M2=be-suite-pgdata-aicp-m2

export MSYS_NO_PATHCONV=1

say() { echo ""; echo "=== $* ==="; }

cmd_build() {
  say "build $IMAGE from $BE_SRC"
  docker build --progress=plain -f "$HERE/Dockerfile.suite" -t "$IMAGE" "$BE_SRC"
}

cmd_up() {
  say "postgres x3 (named volumes, shared network namespace)"
  # ONE network namespace for all four containers, created by PG_MAIN and joined
  # by the rest. This reproduces CI's addressing exactly — localhost:5432,
  # localhost:55432, localhost:55433 — which matters because
  # src/__test-utils__/assert-non-production-db.ts refuses a non-loopback
  # DATABASE_HOST outright. The lane therefore SATISFIES that guard rather than
  # setting its ALLOW_NONLOCAL_TEST_DB escape hatch.
  #
  # Named volumes for PGDATA, not bind mounts: Postgres on a virtiofs-backed
  # Windows bind mount is both slow and, for fsync semantics, not a thing to
  # rely on.
  docker volume create "$VOL_PG_MAIN" >/dev/null
  docker volume create "$VOL_PG_M1" >/dev/null
  docker volume create "$VOL_PG_M2" >/dev/null
  docker volume create "$VOL_OUT" >/dev/null

  docker run -d --name "$PG_MAIN" \
    -e POSTGRES_USER=codefense -e POSTGRES_PASSWORD=codefense -e POSTGRES_DB=codefense_db \
    -v "$VOL_PG_MAIN:/var/lib/postgresql/data" \
    --memory=512m \
    postgres:17 >/dev/null

  # The two AICP servers join PG_MAIN's namespace, so they cannot both sit on
  # 5432 — `-c port=` moves them to the ports CI publishes them on.
  docker run -d --name "$PG_M1" --network="container:$PG_MAIN" \
    -e POSTGRES_USER=aicp -e POSTGRES_PASSWORD=aicp -e POSTGRES_DB=aicp \
    -v "$VOL_PG_M1:/var/lib/postgresql/data" \
    --memory=384m \
    postgres:17 -c port=55432 >/dev/null

  docker run -d --name "$PG_M2" --network="container:$PG_MAIN" \
    -e POSTGRES_USER=aicp -e POSTGRES_PASSWORD=aicp -e POSTGRES_DB=aicp \
    -v "$VOL_PG_M2:/var/lib/postgresql/data" \
    --memory=384m \
    postgres:17 -c port=55433 >/dev/null

  docker ps --filter "name=be-suite-pg" --format "  {{.Names}}  {{.Status}}"
}

cmd_run() {
  say "suite: SHARDS=$SHARDS WORKERS=$WORKERS HEAP_MB=$HEAP_MB MEM=$MEM FIRST_SHARD=$FIRST_SHARD"
  docker rm -f "$RUNNER" >/dev/null 2>&1

  # The two lane scripts are handed in as base64 env vars and unpacked by a
  # three-line bootstrap. `docker cp` would need a created-but-not-started
  # container and a second start call; this is one container and one command.
  # `tr -d "\r"` matters: the files are authored on Windows and bash will not
  # run a script containing carriage returns.
  docker run --name "$RUNNER" \
    --network="container:$PG_MAIN" \
    --memory="$MEM" --memory-swap="$MEMSWAP" \
    -v "$VOL_OUT:/out" \
    -e SHARDS="$SHARDS" -e WORKERS="$WORKERS" -e HEAP_MB="$HEAP_MB" \
    -e IDLE_LIMIT="$IDLE_LIMIT" -e FIRST_SHARD="$FIRST_SHARD" \
    -e SKIP_PREPARE="${SKIP_PREPARE:-0}" \
    -e LANE_RUNNER_B64="$(base64 -w0 < "$HERE/in-container-suite.sh")" \
    -e LANE_ACCOUNTING_B64="$(base64 -w0 < "$HERE/lane-accounting.cjs")" \
    "$IMAGE" bash -c '
      mkdir -p /opt/lane
      echo "$LANE_RUNNER_B64" | base64 -d | tr -d "\r" > /opt/lane/in-container-suite.sh
      echo "$LANE_ACCOUNTING_B64" | base64 -d > /opt/lane/lane-accounting.cjs
      cp /opt/lane/lane-accounting.cjs /out/lane-accounting.cjs
      exec bash /opt/lane/in-container-suite.sh
    '
}

cmd_report() {
  say "per-lane discovered vs executed"
  docker run --rm -v "$VOL_OUT:/out" -w /out "$IMAGE" \
    bash -c 'node /out/lane-accounting.cjs /out/jest-summary-shard-*.json /out/jest-summary-e2e.json'
}

cmd_fetch() {
  local dest="${1:-$HERE/results}"
  mkdir -p "$dest"
  docker rm -f be-suite-fetch >/dev/null 2>&1
  docker create --name be-suite-fetch -v "$VOL_OUT:/out" "$IMAGE" true >/dev/null
  docker cp "be-suite-fetch:/out/." "$dest/"
  docker rm -f be-suite-fetch >/dev/null 2>&1
  echo "results -> $dest"
}

cmd_down() {
  say "teardown"
  docker rm -f "$RUNNER" "$PG_M2" "$PG_M1" "$PG_MAIN" be-suite-fetch >/dev/null 2>&1
  docker volume rm "$VOL_PG_MAIN" "$VOL_PG_M1" "$VOL_PG_M2" >/dev/null 2>&1
  echo "removed containers + pgdata volumes; kept $VOL_OUT (results) and the image"
}

case "${1:-}" in
  build) cmd_build ;;
  up) cmd_up ;;
  run) cmd_run ;;
  report) cmd_report ;;
  fetch) shift; cmd_fetch "$@" ;;
  down) cmd_down ;;
  *) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
