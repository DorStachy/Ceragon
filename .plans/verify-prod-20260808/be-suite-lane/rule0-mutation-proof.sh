#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RULE 0 — a green run you cannot make red is NOT-RUN, not PASS.
#
# Proves this lane actually compiles and executes the PRODUCTION source shipped
# in the image, rather than reporting green off a stale artifact, a cached
# transform, or a spec that never loads its subject.
#
# Target: src/common/csv.util.ts, the CSV-injection formula guard —
#
#     if (FORMULA_LEAD.test(s)) s = `'${s}`;
#
# a one-line, security-relevant production statement whose absence is asserted
# by src/common/csv.util.spec.ts:28 ("neutralizes a leading formula trigger on
# STRING cells only"). Deleting it must turn the suite red; restoring it must
# turn it green again.
#
# All three phases run in ONE container so the before/after is the same process
# tree, the same image layer and the same jest binary. The mutation is made to
# the container's copy and dies with the container — the Backend worktree on the
# host is never written to.
#
#   bash rule0-mutation-proof.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

IMAGE="${IMAGE:-ceragon-be-suite:int-gate-backend}"
TARGET=src/common/csv.util.ts
SPEC=src/common/csv.util.spec.ts

export MSYS_NO_PATHCONV=1

docker run --rm --memory=3g --memory-swap=3g \
  -e JWT_SECRET=ci-test-only-jwt-secret \
  "$IMAGE" bash -c "
set -u
J='node --max-old-space-size=2048 node_modules/jest/bin/jest.js --ci --maxWorkers=1'

echo '########## PHASE 1 — BASELINE (unmodified production source) ##########'
\$J $SPEC 2>&1 | tail -12
echo \"PHASE1_EXIT=\${PIPESTATUS[0]}\"

echo ''
echo '########## PHASE 2 — MUTATE: delete the CSV-injection formula guard ##########'
cp $TARGET /tmp/csv.util.ts.orig
grep -n 'FORMULA_LEAD.test' $TARGET
sed -i '/if (FORMULA_LEAD.test(s)) s = /d' $TARGET
echo '--- line is gone: ---'
grep -c 'FORMULA_LEAD.test' $TARGET
\$J $SPEC 2>&1 | tail -25
echo \"PHASE2_EXIT=\${PIPESTATUS[0]}\"

echo ''
echo '########## PHASE 3 — RESTORE ##########'
cp /tmp/csv.util.ts.orig $TARGET
diff -q /tmp/csv.util.ts.orig $TARGET && echo 'source restored byte-for-byte'
\$J $SPEC 2>&1 | tail -12
echo \"PHASE3_EXIT=\${PIPESTATUS[0]}\"
"
