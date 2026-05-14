#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * P1-6 / P1-7 (2026-05-14 stabilization): SQS queue-empty verifier.
 *
 * Reads queue URLs from argv (or a JSON config file) and asserts each
 * queue's ApproximateNumberOfMessages + ApproximateNumberOfMessagesNotVisible
 * are both zero. Used by the release-readiness gate and the fresh-retest
 * cleanup harness.
 *
 * Usage:
 *   node scripts/verify-queues-empty.cjs <queueUrl1> [<queueUrl2> ...]
 *   node scripts/verify-queues-empty.cjs --config queues.json
 *
 * Exit codes:
 *   0 — all queues empty
 *   1 — at least one queue is non-empty
 *   2 — invocation error
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node verify-queues-empty.cjs <queueUrl1> [<queueUrl2> ...]');
  console.error('   or: node verify-queues-empty.cjs --config <path-to-json-array>');
  process.exit(2);
}

let queueUrls;
if (args[0] === '--config') {
  if (args.length !== 2) {
    console.error('usage: --config <path>');
    process.exit(2);
  }
  const cfgPath = path.resolve(process.cwd(), args[1]);
  try {
    queueUrls = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (err) {
    console.error(`FAIL: config JSON parse error: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(queueUrls)) {
    console.error('FAIL: config must be a JSON array of queue URLs');
    process.exit(2);
  }
  // P1-6 (Codex MEDIUM follow-up): reject an empty array. A miswired
  // config would otherwise PASS with zero queues checked.
  if (queueUrls.length === 0) {
    console.error('FAIL: config has zero queue URLs; this would silently green-light a release.');
    process.exit(2);
  }
  // Normalize and reject empty / non-string entries so an array of
  // [null, "", "  "] cannot pass-by-default.
  queueUrls = queueUrls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 0);
  if (queueUrls.length === 0) {
    console.error('FAIL: config has no non-empty queue URL entries after normalization.');
    process.exit(2);
  }
} else {
  queueUrls = args;
}

const REGION = process.env.AWS_REGION || 'eu-north-1';
let SQSClient;
let GetQueueAttributesCommand;
try {
  ({ SQSClient, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs'));
} catch (err) {
  console.error(`FAIL: @aws-sdk/client-sqs not installed: ${err.message}`);
  process.exit(2);
}

const sqs = new SQSClient({ region: REGION });

// P1-6 (Codex MEDIUM follow-up): also poll Delayed messages and run a
// short quiet-period loop. A single sample can pass during a transient
// empty window — repeated zero readings over a short interval are a
// stronger signal that the producers are actually paused.
//
// P1-6 (Codex HIGH follow-up): validate the env-supplied tuning values.
// QUEUE_QUIET_SAMPLES=0 / negative / non-integer would otherwise
// short-circuit the sampling loop and let a non-empty queue pass.
function parseStrictPositiveInt(name, raw, defaultValue) {
  const value = raw === undefined || raw === '' ? defaultValue : raw;
  const s = typeof value === 'string' ? value.trim() : String(value);
  if (!/^\d+$/.test(s)) {
    console.error(`FAIL: env ${name} must be a non-negative integer (got '${raw}')`);
    process.exit(2);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) {
    console.error(`FAIL: env ${name} must be >= 1 (got '${raw}')`);
    process.exit(2);
  }
  return n;
}
function parseStrictNonNegativeInt(name, raw, defaultValue) {
  const value = raw === undefined || raw === '' ? defaultValue : raw;
  const s = typeof value === 'string' ? value.trim() : String(value);
  if (!/^\d+$/.test(s)) {
    console.error(`FAIL: env ${name} must be a non-negative integer (got '${raw}')`);
    process.exit(2);
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) {
    console.error(`FAIL: env ${name} must be >= 0 (got '${raw}')`);
    process.exit(2);
  }
  return n;
}
const QUIET_PERIOD_SAMPLES = parseStrictPositiveInt(
  'QUEUE_QUIET_SAMPLES',
  process.env.QUEUE_QUIET_SAMPLES,
  '3',
);
const QUIET_PERIOD_MS = parseStrictNonNegativeInt(
  'QUEUE_QUIET_MS',
  process.env.QUEUE_QUIET_MS,
  '5000',
);

async function sampleQueueOnce(url) {
  const res = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: url,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed',
      ],
    }),
  );
  const visible = parseInt(res.Attributes?.ApproximateNumberOfMessages ?? '0', 10);
  const inflight = parseInt(
    res.Attributes?.ApproximateNumberOfMessagesNotVisible ?? '0',
    10,
  );
  const delayed = parseInt(
    res.Attributes?.ApproximateNumberOfMessagesDelayed ?? '0',
    10,
  );
  return { visible, inflight, delayed };
}

async function checkQueue(url) {
  let last = { visible: 0, inflight: 0, delayed: 0 };
  for (let i = 0; i < QUIET_PERIOD_SAMPLES; i++) {
    last = await sampleQueueOnce(url);
    if (last.visible > 0 || last.inflight > 0 || last.delayed > 0) {
      return { url, ...last, ok: false };
    }
    if (i < QUIET_PERIOD_SAMPLES - 1) {
      await new Promise((r) => setTimeout(r, QUIET_PERIOD_MS));
    }
  }
  return { url, ...last, ok: true };
}

(async () => {
  const results = [];
  for (const url of queueUrls) {
    try {
      results.push(await checkQueue(url));
    } catch (err) {
      results.push({ url, error: err.message, ok: false });
    }
  }
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.error) {
      console.error(`  ✖  ${r.url}: ${r.error}`);
    } else {
      const tag = r.ok ? '✔' : '✖';
      console.log(
        `  ${tag}  ${r.url}: visible=${r.visible} inflight=${r.inflight} delayed=${r.delayed}`,
      );
    }
  }
  if (failed.length === 0) {
    console.log(`verify-queues-empty: PASS (${results.length} queues)`);
    process.exit(0);
  }
  console.error(`verify-queues-empty: FAIL (${failed.length}/${results.length} non-empty)`);
  process.exit(1);
})().catch((err) => {
  console.error(`FAIL: unhandled error: ${err.message}`);
  process.exit(2);
});
