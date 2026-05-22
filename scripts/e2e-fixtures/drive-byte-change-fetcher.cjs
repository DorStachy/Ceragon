// scripts/e2e-fixtures/drive-byte-change-fetcher.cjs
//
// E2E driver: exercises the Ceragon-Intelligence artifact-fetcher against
// dynamo-local in the .codesec-e2e stack to prove the same-version byte
// change pipeline correctly persists sticky integrity evidence.
//
// Phases:
//   1. Seed an ARTIFACT_ALIAS row with an "old" SHA.
//   2. Construct an ArtifactFetcher pointed at the local emulators, with
//      `fetch` monkey-patched to return our "new bytes" fixture.
//   3. Invoke processArtifact() for the same alias key.
//   4. Assert the alias row now reports:
//        - immutabilityViolation: true
//        - integrityThreat.kind: same_version_byte_change
//        - integrityThreat.previousArtifactSha256 === oldSha
//        - recentPreviousArtifactSha256s[0] === oldSha
//        - immutabilityViolationFirstDetectedAt is non-null
//        - aliasHistoryCount === 1
//   5. Re-run processArtifact() against the same (now-stable) sha.
//   6. Assert the sticky semantic:
//        - immutabilityViolation stays true
//        - immutabilityViolationFirstDetectedAt unchanged
//        - aliasHistoryCount stays at 1 (no new violation observed)
//
// Args:
//   --aliasKey "<ecosystem#package#version#filename>"   (required)
//   --intelEndpoint "http://localhost:8000"             (DDB)
//   --sqsEndpoint   "http://localhost:9324"             (ElasticMQ)
//   --tablePrefix   "ceragon-staging"                   (matches CERAGON_ENV)
//
// Exit codes: 0 on full pass, 1 on any assertion failure or infra error.

const path = require('node:path');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, GetItemCommand, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { S3Client } = require('@aws-sdk/client-s3');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const args = parseArgs(process.argv.slice(2));
const aliasKey = required(args, 'aliasKey');
const intelEndpoint = args.intelEndpoint ?? 'http://localhost:8000';
const sqsEndpoint = args.sqsEndpoint ?? 'http://localhost:9324';
const tablePrefix = args.tablePrefix ?? 'ceragon-staging';

const ALIAS_TABLE = `${tablePrefix}-artifact-alias`;
const CATALOG_TABLE = `${tablePrefix}-artifact-catalog`;

const intelRoot = path.resolve(__dirname, '..', '..', 'Ceragon-Intelligence');
process.env.CERAGON_ENV = tablePrefix.replace(/^ceragon-/, '');
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'dummy';
process.env.AWS_SECRET_ACCESS_KEY = 'dummy';
process.env.AWS_ENDPOINT_URL_DYNAMODB = intelEndpoint;
process.env.STATIC_BG_QUEUE_URL = `${sqsEndpoint}/000000000000/cera-fetch_jobs-local`;
process.env.STATIC_URGENT_QUEUE_URL = process.env.STATIC_BG_QUEUE_URL;
process.env.DYNAMIC_BG_QUEUE_URL = process.env.STATIC_BG_QUEUE_URL;
process.env.DYNAMIC_URGENT_QUEUE_URL = process.env.STATIC_BG_QUEUE_URL;
process.env.OPERATOR_REVIEW_QUEUE_URL = process.env.STATIC_BG_QUEUE_URL;

const { ArtifactFetcher } = require(path.join(intelRoot, 'dist', 'workers', 'artifact-fetcher.js'));

const ddb = new DynamoDBClient({ region: 'us-east-1', endpoint: intelEndpoint });
const sqs = new SQSClient({ region: 'us-east-1', endpoint: sqsEndpoint });
const s3 = new S3Client({ region: 'us-east-1', endpoint: intelEndpoint, forcePathStyle: true });

async function main() {
  const parts = aliasKey.split('#');
  if (parts.length !== 4) {
    fail(`aliasKey must be ecosystem#package#version#filename; got ${aliasKey}`);
  }
  const [ecosystem, packageName, version, filename] = parts;

  const oldSha = 'a'.repeat(64);
  const newBytes = Buffer.from(`e2e-byte-change-${Date.now()}`);
  const expectedNewSha = require('node:crypto').createHash('sha256').update(newBytes).digest('hex');

  console.log(`[setup] alias=${aliasKey}`);
  console.log(`[setup] oldSha=${oldSha}`);
  console.log(`[setup] expectedNewSha=${expectedNewSha}`);

  await ensureTable(ALIAS_TABLE);
  await ensureTable(CATALOG_TABLE);
  await clearAlias(aliasKey);
  await seedOldAlias(ecosystem, packageName, version, filename, oldSha);

  // Monkey-patch global fetch so the fetcher receives our fixture bytes.
  // This is the cheapest way to exercise the real ArtifactFetcher flow.
  global.fetch = async (url) => {
    return makeFakeResponse(newBytes);
  };

  const fetcher = new ArtifactFetcher(
    ddb,
    s3,
    sqs,
    process.env.STATIC_BG_QUEUE_URL,
    {
      staticBackground: process.env.STATIC_BG_QUEUE_URL,
      staticUrgent: process.env.STATIC_URGENT_QUEUE_URL,
      dynamicBackground: process.env.DYNAMIC_BG_QUEUE_URL,
      dynamicUrgent: process.env.DYNAMIC_URGENT_QUEUE_URL,
      operatorReview: process.env.OPERATOR_REVIEW_QUEUE_URL,
    },
    1,
  );

  const fetchMessage = {
    messageType: 'artifact-fetch.v1',
    idempotencyKey: 'e2e-id-1',
    ecosystem,
    packageName,
    version,
    filename,
    upstreamUrl: 'https://example.invalid/new.tgz',
    upstreamDigestType: null,
    upstreamDigestValue: null,
    sourceCursor: 'e2e-cursor-1',
    priorityClass: 'background-high',
    preFetchScore: 50,
  };

  console.log('\n[phase 2] driving artifact-fetcher (boundary observation)');
  try {
    await fetcher.processArtifact(fetchMessage, 'e2e-receipt-1');
  } catch (err) {
    // The fetcher tries to dispatch to SQS queues; ElasticMQ may return an
    // error if the queue does not exist. That is non-fatal for this test
    // (we only care about alias persistence). Log and continue.
    console.warn(`[phase 2] fetcher returned: ${err.message}`);
  }

  console.log('\n[phase 3] reading alias row');
  const aliasAfter = await readAlias(aliasKey);
  if (!aliasAfter) fail('alias row missing after fetcher run');
  console.log(`[phase 3] alias=${JSON.stringify(aliasAfter, null, 2)}`);

  assertEq(aliasAfter.immutabilityViolation, true, 'immutabilityViolation');
  assertEq(aliasAfter.currentArtifactSha256, expectedNewSha, 'currentArtifactSha256');
  assertEq(aliasAfter.integrityThreat?.kind, 'same_version_byte_change', 'integrityThreat.kind');
  assertEq(aliasAfter.integrityThreat?.previousArtifactSha256, oldSha, 'integrityThreat.previousArtifactSha256');
  assertEq(aliasAfter.recentPreviousArtifactSha256s?.[0], oldSha, 'recentPreviousArtifactSha256s[0]');
  assertEq(aliasAfter.aliasHistoryCount, 1, 'aliasHistoryCount');
  if (!aliasAfter.immutabilityViolationFirstDetectedAt) {
    fail('immutabilityViolationFirstDetectedAt is null after violation');
  }
  console.log('[phase 3] PASSED');

  const firstDetectedSnapshot = aliasAfter.immutabilityViolationFirstDetectedAt;

  console.log('\n[phase 6] sticky-persistence re-run');
  global.fetch = async () => makeFakeResponse(newBytes);
  try {
    await fetcher.processArtifact({ ...fetchMessage, idempotencyKey: 'e2e-id-2', sourceCursor: 'e2e-cursor-2' }, 'e2e-receipt-2');
  } catch (err) {
    console.warn(`[phase 6] fetcher returned: ${err.message}`);
  }

  const aliasSticky = await readAlias(aliasKey);
  if (!aliasSticky) fail('alias row missing after sticky re-run');

  assertEq(aliasSticky.immutabilityViolation, true, 'sticky immutabilityViolation');
  assertEq(aliasSticky.immutabilityViolationFirstDetectedAt, firstDetectedSnapshot, 'firstDetectedAt unchanged on stable observation');
  assertEq(aliasSticky.aliasHistoryCount, 1, 'aliasHistoryCount unchanged on stable observation');
  console.log('[phase 6] PASSED');

  console.log('\n[phase 4] alias state ready for Backend FastGate read');
  console.log('  Set PRECOMPUTED_VERDICT_ENABLED=true and IMMUTABILITY_VIOLATION_BLOCK_MODE=hard');
  console.log('  on the Backend container, then POST /api/v1/packages/check-packages with');
  console.log(`  ecosystem=${ecosystem} name=${packageName} version=${version}.`);
  console.log('  Backend should return action=BLOCK, decisionSource=PRECOMPUTED_VERDICT.');
  console.log('  (HTTP round-trip is operationally tested, not asserted by this script.)');

  console.log('\nE2E byte-change driver PASSED');
}

// ---- helpers ----

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = value;
        i++;
      }
    }
  }
  return out;
}

function required(args, name) {
  if (!args[name]) {
    fail(`missing required arg --${name}`);
  }
  return args[name];
}

function fail(msg) {
  console.error(`E2E FAIL: ${msg}`);
  process.exit(1);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`  ✓ ${label} === ${JSON.stringify(actual)}`);
}

function makeFakeResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-length') return String(bytes.length);
        if (name.toLowerCase() === 'content-type') return 'application/gzip';
        return null;
      },
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          cancel() {},
        };
      },
    },
  };
}

async function ensureTable(name) {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: name }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
    const keySchema = name.endsWith('artifact-alias')
      ? [{ AttributeName: 'aliasKey', KeyType: 'HASH' }]
      : [{ AttributeName: 'artifactSha256', KeyType: 'HASH' }];
    const attrDefs = name.endsWith('artifact-alias')
      ? [{ AttributeName: 'aliasKey', AttributeType: 'S' }]
      : [{ AttributeName: 'artifactSha256', AttributeType: 'S' }];
    await ddb.send(new CreateTableCommand({
      TableName: name,
      KeySchema: keySchema,
      AttributeDefinitions: attrDefs,
      BillingMode: 'PAY_PER_REQUEST',
    }));
    console.log(`[setup] created table ${name}`);
  }
}

async function clearAlias(aliasKey) {
  try {
    await ddb.send(new DeleteItemCommand({
      TableName: ALIAS_TABLE,
      Key: marshall({ aliasKey }),
    }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') {
      console.warn(`[setup] delete alias warning: ${err.message}`);
    }
  }
}

async function seedOldAlias(ecosystem, packageName, version, filename, oldSha) {
  const aliasKey = `${ecosystem}#${packageName}#${version}#${filename}`;
  await ddb.send(new PutItemCommand({
    TableName: ALIAS_TABLE,
    Item: marshall({
      aliasKey,
      ecosystemPackage: `${ecosystem}#${packageName}`,
      currentArtifactSha256: oldSha,
      currentContentHash: 'old-tree',
      registryCursor: 'seed-cursor',
      registryLastSeenAt: new Date().toISOString(),
      upstreamUrl: 'https://example.invalid/old.tgz',
      upstreamDigest: null,
      yanked: false,
      retracted: false,
      deleted: false,
      immutabilityViolation: false,
      immutabilityViolationFirstDetectedAt: null,
      lastIntegrityThreatAt: null,
      integrityThreat: { kind: 'none', detectedAt: null, previousArtifactSha256: null, currentArtifactSha256: oldSha, previousContentHash: null, currentContentHash: 'old-tree', reason: null },
      recentPreviousArtifactSha256s: [],
      aliasHistoryCount: 0,
      aliasHistoryPointer: null,
    }, { removeUndefinedValues: true }),
  }));
  console.log(`[setup] seeded alias row with oldSha=${oldSha}`);
}

async function readAlias(aliasKey) {
  const resp = await ddb.send(new GetItemCommand({
    TableName: ALIAS_TABLE,
    Key: marshall({ aliasKey }),
  }));
  return resp.Item ? unmarshall(resp.Item) : null;
}

main().catch((err) => {
  fail(`unhandled error: ${err.stack || err.message}`);
});
