#!/usr/bin/env bash
# Snapshot P47 supply-chain state: SQS queue depths + DDB cache item count + PG rows.
source /c/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/supplychain/p47-aws-env.sh
label="${1:-snap}"
echo "=== $label  $(date -u +%FT%TZ) ==="
echo "--- SQS ---"
for q in cera-fetch_jobs-local cera-fetch_jobs_exec_now-local cera-sandbox_jobs-local cera-sandbox_jobs_exec_now-local cera-fetch_jobs-local-dlq; do
  a=$(aws sqs get-queue-attributes --endpoint-url $SQS_EP \
       --queue-url "http://localhost:9526/000000000000/$q" \
       --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
       --output text --query 'Attributes.[ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible]' 2>/dev/null)
  echo "$q  visible/inflight = ${a:-ERR}"
done
echo "--- DynamoDB ceragon-local-artifact-cache ---"
aws dynamodb scan --endpoint-url $DDB_EP --table-name ceragon-local-artifact-cache \
  --select COUNT --output text --query 'Count' 2>/dev/null
echo "--- Postgres ---"
docker exec codesec-e2e-p47-postgres psql -U codefense -d codefense_db -tAc \
 "select 'analysis='||count(*) from analysis union all select 'fetch_jobs='||count(*) from fetch_jobs union all select 'sandbox_jobs='||count(*) from sandbox_jobs union all select 'global_artifact_cache='||count(*) from global_artifact_cache union all select 'tenant_decisions='||count(*) from tenant_decisions" 2>/dev/null
