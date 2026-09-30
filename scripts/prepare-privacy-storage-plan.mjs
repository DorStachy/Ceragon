#!/usr/bin/env node
// Prepare a reviewable S3 lifecycle delta from read-only inventory. Never applies it.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryFile = resolve(root, 'local-stack/.runtime/privacy-release-inventory.json');
const raw = readFileSync(inventoryFile);
const inventory = JSON.parse(raw);
const artifactBuckets = new Set();
for (const cluster of inventory.fleet) for (const definition of cluster.definitions || []) {
  for (const container of definition.value?.containers || []) for (const item of container.configuration || []) {
    if (item.name === 'S3_ARTIFACT_BUCKET') artifactBuckets.add(item.value);
  }
}
const changes = [];
for (const bucket of artifactBuckets) {
  const found = inventory.storage.find(item => item.bucket === bucket);
  if (!found || (found.lifecycle.status !== 'observed' && found.lifecycle.reason !== 'NoSuchLifecycleConfiguration')) {
    throw new Error('Cannot prepare a preserving lifecycle merge without observed current rules');
  }
  const before = found.lifecycle.value || { Rules: [] };
  const rules = [...before.Rules];
  for (const [prefix, id] of [
    ['local-artifacts/', 'PrivacyLocalArtifactBackstopV1'],
  ]) {
    if (rules.some(rule => [id, `${id}DeleteMarkers`].includes(rule.ID))) {
      throw new Error('A proposed rule ID already exists; reconcile manually');
    }
    rules.push({ ID: id, Status: 'Enabled', Filter: { Prefix: prefix }, Expiration: { Days: 1 },
      NoncurrentVersionExpiration: { NoncurrentDays: 1 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } });
    rules.push({ ID: `${id}DeleteMarkers`, Status: 'Enabled', Filter: { Prefix: prefix },
      Expiration: { ExpiredObjectDeleteMarker: true } });
  }
  changes.push({ bucket, previousConfigurationSha256: createHash('sha256').update(JSON.stringify(before)).digest('hex'),
    priorRuleCount: before.Rules.length, proposedLifecycleConfiguration: { Rules: rules } });
}
const output = { preparedAt: new Date().toISOString(), inventoryRecordedAt: inventory.recordedAt,
  inventorySha256: createHash('sha256').update(raw).digest('hex'),
  status: 'requires_operator_review_and_fresh_inventory_before_apply',
  limitations: ['Existing objects under these prefixes can expire after applying these rules; review historical ownership first',
    'S3 lifecycle is an asynchronous backstop, not an exact 24-hour deadline',
    'Do not expire all private-artifacts/: it also contains retained structured telemetry summaries',
    'private-artifacts/<tenant>/handoff/ requires the configured raw-only sweep plus monitored failure handling; a lifecycle backstop needs a reviewed per-tenant prefix or dedicated object tag design',
    'No changes to global telemetry, forensic retention or cleanup-backup retention are inferred',
    'Preserve TransitionDefaultMinimumObjectSize separately when using the S3 API',
    'A successful API call does not attest IAM, other hosts, provider retention or cleanup alarms'], changes };
const path = resolve(root, 'local-stack/.runtime/privacy-storage-plan.json');
writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
console.log(`Prepared preserving lifecycle deltas for ${changes.length} observed buckets. No AWS writes.`);
console.log(path);
