#!/usr/bin/env node
// Read-only metadata inventory. No secret values, object bodies, customer rows or mutations.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const region = 'eu-north-1';
const account = '113627991972';
const out = resolve(root, 'local-stack/.runtime/privacy-release-inventory.json');
const common = ['--region', region, '--output', 'json', '--no-cli-pager', '--cli-connect-timeout', '5', '--cli-read-timeout', '10'];
async function aws(args, query) {
  try {
    const { stdout } = await exec('aws', [...args, ...query ? ['--query', query] : [], ...common], {
      windowsHide: true, timeout: 25000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, AWS_MAX_ATTEMPTS: '1' },
    });
    return { status: 'observed', value: JSON.parse(stdout) };
  } catch (error) {
    // Persist the bounded AWS error code, never request credentials or raw responses.
    return { status: 'unavailable', reason: error.stderr?.match(/\(([A-Za-z0-9]+)\)/)?.[1] || 'request_failed' };
  }
}
const identity = await aws(['sts', 'get-caller-identity'], 'Account');
if (identity.value !== account) throw new Error('Expected account metadata access is unavailable');
const clusters = ['backend', 'frontend', 'cera-workers-staging', 'ceragon-intelligence-production'];
const safeValues = ['SOURCE_PRIVACY_PROTOCOL_VERSION', 'PRIVACY_RESTORE_MODE', 'ORG_DELETE_PURGE_MODE',
  'ORG_DELETE_S3_INVENTORY_CONFIRMED', 'ORG_DELETE_DYNAMODB_INVENTORY_CONFIRMED', 'ORG_DELETE_WORKER_FLEET_CONFIRMED',
  'LLM_SOURCE_OPT_IN', 'S3_ARTIFACT_BUCKET', 'GITHUB_LOCAL_SCAN_ARTIFACT_BUCKET', 'CODE_SCAN_FORENSICS_BUCKET',
  'S3_TELEMETRY_BUCKET', 'S3_SAMPLES_BUCKET', 'S3_RESULT_OFFLOAD_BUCKET', 'GITHUB_SCAN_CACHE_TABLE',
  'CODEFENCE_SCAN_CACHE_TABLE', 'CODEFENCE_SCAN_RESULT_CACHE_TABLE', 'GITHUB_LLM_RESPONSE_CACHE_TABLE', 'CODEFENCE_LLM_RESPONSE_CACHE_TABLE',
  'LLM_RESPONSE_CACHE_TABLE'];
const valuesQuery = `[${safeValues.map(name => `'${name}'`).join(',')}]`;
const fleet = [];
for (const cluster of clusters) {
  const list = await aws(['ecs', 'list-services', '--cluster', cluster], 'serviceArns');
  if (list.status !== 'observed') { fleet.push({ cluster, ...list }); continue; }
  if (!list.value.length) { fleet.push({ cluster, services: [] }); continue; }
  const batches = [];
  for (let start = 0; start < list.value.length; start += 10) {
    batches.push(await aws(['ecs', 'describe-services', '--cluster', cluster, '--services', ...list.value.slice(start, start + 10)],
      '{services:services[].{name:serviceName,desired:desiredCount,running:runningCount,pending:pendingCount,taskDefinition:taskDefinition,deployments:deployments[].{id:id,status:status,taskDefinition:taskDefinition,desired:desiredCount,running:runningCount,pending:pendingCount,rolloutState:rolloutState}},failures:failures[].{arn:arn,reason:reason}}'));
  }
  const serviceRows = batches.flatMap(batch => batch.value?.services || []);
  const failures = batches.flatMap(batch => batch.value?.failures || []);
  const services = { status: batches.every(batch => batch.status === 'observed') && !failures.length ? 'observed' : 'incomplete',
    value: serviceRows, failures, unavailableBatches: batches.filter(batch => batch.status !== 'observed'),
    scope: 'Service and deployment metadata only; does not enumerate standalone or actual running tasks' };
  const definitions = [];
  for (const arn of new Set(serviceRows.flatMap(service => [service.taskDefinition,
    ...(service.deployments || []).map(deployment => deployment.taskDefinition)]).filter(Boolean))) {
    definitions.push(await aws(['ecs', 'describe-task-definition', '--task-definition', arn],
      `taskDefinition.{arn:taskDefinitionArn,taskRole:taskRoleArn,executionRole:executionRoleArn,containers:containerDefinitions[].{name:name,image:image,environmentNames:environment[].name,secretNames:secrets[].name,configuration:environment[?contains(${valuesQuery},name)]}}`));
  }
  fleet.push({ cluster, services, definitions });
}
const configuredBuckets = fleet.flatMap(cluster => (cluster.definitions || []).flatMap(definition =>
  (definition.value?.containers || []).flatMap(container => (container.configuration || [])
    .filter(item => /_BUCKET$/.test(item.name)).map(item => item.value))));
const buckets = [...new Set(['cera-artifacts-staging-113627991972-eu-north-1',
  'cera-telemetry-staging-113627991972-eu-north-1', 'cera-cleanup-backups-production', ...configuredBuckets])];
const storage = [];
for (const bucket of buckets) {
  const checks = await Promise.all([
    aws(['s3api', 'get-bucket-location', '--bucket', bucket]),
    aws(['s3api', 'get-bucket-versioning', '--bucket', bucket]),
    aws(['s3api', 'get-bucket-lifecycle-configuration', '--bucket', bucket]),
    aws(['s3api', 'get-public-access-block', '--bucket', bucket]),
    aws(['s3api', 'get-bucket-encryption', '--bucket', bucket]),
  ]);
  storage.push({ bucket, location: checks[0], versioning: checks[1], lifecycle: checks[2], publicAccess: checks[3], encryption: checks[4] });
}
const tableList = await aws(['dynamodb', 'list-tables'], 'TableNames');
const configuredCacheTables = [...new Set(fleet.flatMap(cluster => (cluster.definitions || []).flatMap(definition =>
  (definition.value?.containers || []).flatMap(container => (container.configuration || [])
    .filter(item => /_CACHE_TABLE$/.test(item.name)).map(item => item.value)))).filter(Boolean))];
const cacheTables = [...new Set([...configuredCacheTables,
  ...(tableList.value || []).filter(name => /scan.?cache|llm.*cache/i.test(name))])];
const caches = [];
for (const name of cacheTables) caches.push({ name,
  explicitlyConfigured: configuredCacheTables.includes(name),
  ttl: await aws(['dynamodb', 'describe-time-to-live', '--table-name', name]),
  schema: await aws(['dynamodb', 'describe-table', '--table-name', name], 'Table.{status:TableStatus,keySchema:KeySchema,itemCountEstimate:ItemCount}') });
const backups = await aws(['rds', 'describe-db-instances'],
  'DBInstances[].{id:DBInstanceIdentifier,status:DBInstanceStatus,encrypted:StorageEncrypted,publiclyAccessible:PubliclyAccessible,backupRetentionDays:BackupRetentionPeriod,latestRestorableTime:LatestRestorableTime,region:AvailabilityZone}');
const backendRole = fleet.find(cluster => cluster.cluster === 'backend')?.definitions?.[0]?.value?.taskRole;
// Bucket and object actions need different ARN shapes; mixing them produces
// expected denies on invalid resource/action pairs and a misleading aggregate.
const deletionPermissions = [];
const purgeBuckets = buckets.filter(bucket => bucket !== 'cera-cleanup-backups-production');
for (const [scope, actions, suffix] of [
  ['bucket', ['s3:ListBucket', 's3:ListBucketVersions', 's3:ListBucketMultipartUploads'], ''],
  ['object', ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:AbortMultipartUpload'], '/*'],
]) deletionPermissions.push({ scope, ...backendRole ? await aws(['iam', 'simulate-principal-policy',
  '--policy-source-arn', backendRole, '--action-names', ...actions,
  '--resource-arns', ...purgeBuckets.map(bucket => `arn:aws:s3:::${bucket}${suffix}`)],
  'EvaluationResults[].{action:EvalActionName,decision:EvalDecision,missingContext:MissingContextValues,resources:ResourceSpecificResults[].{resource:EvalResourceName,decision:EvalResourceDecision,missingContext:MissingContextValues}}')
  : { status: 'unavailable', reason: 'backend_role_not_observed' } });
const queuesList = await aws(['sqs', 'list-queues'], 'QueueUrls');
const queues = [];
for (const url of (queuesList.value || []).filter(url => /scanner|processor|sandbox|fetch/i.test(url))) {
  queues.push({ name: url.split('/').pop(), counts: await aws(['sqs', 'get-queue-attributes', '--queue-url', url,
    '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible',
    'ApproximateNumberOfMessagesDelayed', 'MessageRetentionPeriod']) });
}
const result = { recordedAt: new Date().toISOString(), account, region,
  scope: 'Read-only AWS control-plane metadata; no runtime-host, secret-value, provider-contract or customer-data inspection',
  fleet, storage, caches, cacheDiscovery: { status: tableList.status, reason: tableList.reason,
    configuredTableCount: configuredCacheTables.length,
    scope: 'Union of explicitly configured source-cache tables and name-based discovery in this account/region; external-host configuration remains unverified' },
  backups, deletionPermissions, queues, queueDiscovery: { status: queuesList.status, reason: queuesList.reason } };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`Recorded read-only metadata for ${fleet.length} clusters, ${storage.length} buckets and ${caches.length} caches.`);
console.log(out);
