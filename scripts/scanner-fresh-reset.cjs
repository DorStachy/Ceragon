#!/usr/bin/env node
'use strict';

// Canonical dependency-scanner fresh reset utility.
//
// Defaults to dry-run. Use --apply to delete. RDS rows are backed up before
// deletion. Shared caches require --include-shared-cache plus exact
// coordinates to avoid erasing production-wide evidence by accident.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1';

const UI_TABLES = [
  'github_scan_result_chunks',
  'github_findings',
  'github_llm_enrichment_tasks',
  'github_suppressions',
  'github_scan_runs',
  'github_baseline_fingerprints',
  'github_baseline_versions',
  'github_baselines',
  'github_install_sessions',
  'repo_dependency_sync_runs',
  'repo_dependencies',
  'alerts',
  'alert',
  'findings',
  'finding',
  'script_forensics',
  'script_records',
  'script_record',
  'license_issues',
  'inventory_events',
  'policy_exceptions',
  'tenant_decisions',
  'sandbox_jobs',
  'fetch_jobs',
  'analysis',
  'analyses',
];

const SHARED_COORDINATE_TABLES = [
  'package_forensics',
  'global_artifact_cache',
];

function usage() {
  console.log(`
Usage:
  node scripts/scanner-fresh-reset.cjs [options]

Safe defaults:
  Dry-run is the default. Nothing is deleted unless --apply is present.

Required scope:
  --full-demo-site --org-id <uuid> --site-id <uuid>
  --correlation-prefix <prefix>
  --coordinates-file <json-or-lines> --include-shared-cache
  or at least one explicit S3/DDB/SQS scope.

Core options:
  --apply                         Delete matching state after backup.
  --org-id <uuid>                 Organization/account id.
  --site-id <uuid>                Site id.
  --full-demo-site                Clear all UI-backed scanner rows for org/site.
  --correlation-prefix <prefix>   Clear rows with matching correlation id prefix.
  --coordinates-file <path>       Exact package coordinates for shared caches.
  --include-shared-cache          Allow coordinate-scoped shared cache deletes.
  --backup-dir <path>             Backup directory. Default scripts/scanner-fresh-reset-<timestamp>.

AWS options:
  --env production|staging        SSM namespace helper. Production currently maps to staging namespace.
  --s3-prefix s3://bucket/prefix  Back up and optionally delete S3 keys under prefix.
  --ddb-key-file <path>           JSON array of DynamoDB keys to back up/delete.
  --sqs-queue-url <url>           Inspect queue attributes.
  --purge-sqs                     With --apply, purge listed SQS queues.

Examples:
  node scripts/scanner-fresh-reset.cjs --full-demo-site --org-id <org> --site-id <site>
  node scripts/scanner-fresh-reset.cjs --apply --full-demo-site --org-id <org> --site-id <site>
  node scripts/scanner-fresh-reset.cjs --apply --correlation-prefix fresh-retest-20260512
`.trim());
}

function parseArgs(argv) {
  const out = {
    apply: false,
    help: false,
    fullDemoSite: false,
    includeSharedCache: false,
    purgeSqs: false,
    env: process.env.CERAGON_ENV || process.env.CERA_ENV || 'production',
    orgId: process.env.CERAGON_ORG_ID || '',
    siteId: process.env.CERAGON_SITE_ID || '',
    correlationPrefix: '',
    coordinatesFile: '',
    ddbKeyFile: '',
    backupDir: '',
    s3Prefixes: [],
    sqsQueueUrls: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };

    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--apply') out.apply = true;
    else if (arg === '--dry-run') out.apply = false;
    else if (arg === '--full-demo-site') out.fullDemoSite = true;
    else if (arg === '--include-shared-cache') out.includeSharedCache = true;
    else if (arg === '--purge-sqs') out.purgeSqs = true;
    else if (arg === '--org-id') out.orgId = next();
    else if (arg.startsWith('--org-id=')) out.orgId = arg.slice('--org-id='.length);
    else if (arg === '--site-id') out.siteId = next();
    else if (arg.startsWith('--site-id=')) out.siteId = arg.slice('--site-id='.length);
    else if (arg === '--correlation-prefix') out.correlationPrefix = next();
    else if (arg.startsWith('--correlation-prefix=')) out.correlationPrefix = arg.slice('--correlation-prefix='.length);
    else if (arg === '--coordinates-file') out.coordinatesFile = next();
    else if (arg.startsWith('--coordinates-file=')) out.coordinatesFile = arg.slice('--coordinates-file='.length);
    else if (arg === '--ddb-key-file') out.ddbKeyFile = next();
    else if (arg.startsWith('--ddb-key-file=')) out.ddbKeyFile = arg.slice('--ddb-key-file='.length);
    else if (arg === '--backup-dir') out.backupDir = next();
    else if (arg.startsWith('--backup-dir=')) out.backupDir = arg.slice('--backup-dir='.length);
    else if (arg === '--env') out.env = next();
    else if (arg.startsWith('--env=')) out.env = arg.slice('--env='.length);
    else if (arg === '--s3-prefix') out.s3Prefixes.push(next());
    else if (arg.startsWith('--s3-prefix=')) out.s3Prefixes.push(arg.slice('--s3-prefix='.length));
    else if (arg === '--sqs-queue-url') out.sqsQueueUrls.push(next());
    else if (arg.startsWith('--sqs-queue-url=')) out.sqsQueueUrls.push(arg.slice('--sqs-queue-url='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  out.env = String(out.env || 'production').trim().toLowerCase();
  if (!['production', 'staging'].includes(out.env)) {
    throw new Error(`Invalid --env "${out.env}". Expected production or staging.`);
  }
  return out;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '').replace(/-/g, '').slice(0, 15) + 'Z';
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadPgClient() {
  const candidates = [
    path.join(__dirname, '..', 'Backend', 'node_modules', 'pg'),
    'pg',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate).Client;
    } catch (_) {
      // Try the next candidate.
    }
  }
  return null;
}

function runAws(args, input) {
  const env = { ...process.env, AWS_REGION: REGION, AWS_DEFAULT_REGION: REGION };
  return execFileSync('aws', args, {
    encoding: 'utf8',
    input,
    env,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function backendSsmNamespace(env) {
  // Production services still read the historical staging SSM namespace.
  return env === 'production' ? 'staging' : env;
}

function getDatabaseUrl(env) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const ssmEnv = backendSsmNamespace(env);
  try {
    return runAws([
      'ssm', 'get-parameter',
      '--name', `/cera/${ssmEnv}/backend/DATABASE_URL`,
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text',
      '--region', REGION,
    ]);
  } catch (err) {
    return '';
  }
}

function getDatabasePassword(env, fallback) {
  const ssmEnv = backendSsmNamespace(env);
  try {
    const value = runAws([
      'ssm', 'get-parameter',
      '--name', `/cera/${ssmEnv}/backend/DATABASE_PASSWORD`,
      '--with-decryption',
      '--query', 'Parameter.Value',
      '--output', 'text',
      '--region', REGION,
    ]);
    return value || fallback;
  } catch (_) {
    return fallback;
  }
}

function assertIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table],
  );
  return result.rowCount > 0;
}

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function pickColumn(columns, candidates) {
  return candidates.find((candidate) => columns.has(candidate)) || '';
}

function parseCoordinates(file) {
  if (!file) return [];
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    return JSON.parse(raw).map((row) => ({
      ecosystem: String(row.ecosystem || '').trim(),
      name: String(row.name || row.packageName || row.package_name || '').trim(),
      version: String(row.version || row.packageVersion || row.package_version || '').trim(),
    })).filter((row) => row.ecosystem && row.name);
  }

  return raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [ecosystem, rest = ''] = line.split(':', 2);
      const at = rest.lastIndexOf('@');
      const hasVersion = at > 0;
      return {
        ecosystem: ecosystem.trim(),
        name: (hasVersion ? rest.slice(0, at) : rest).trim(),
        version: (hasVersion ? rest.slice(at + 1) : '').trim(),
      };
    })
    .filter((row) => row.ecosystem && row.name);
}

function buildCoordinatePredicate(columns, coordinates, params) {
  if (coordinates.length === 0) return '';
  const ecosystemCol = pickColumn(columns, ['ecosystem']);
  const nameCol = pickColumn(columns, ['package_name', 'packageName', 'name']);
  const versionCol = pickColumn(columns, ['package_version', 'packageVersion', 'version']);
  if (!ecosystemCol || !nameCol) return '';

  const clauses = [];
  for (const coordinate of coordinates) {
    const local = [];
    params.push(coordinate.ecosystem);
    local.push(`${assertIdentifier(ecosystemCol)} = $${params.length}`);
    params.push(coordinate.name);
    local.push(`${assertIdentifier(nameCol)} = $${params.length}`);
    if (versionCol && coordinate.version) {
      params.push(coordinate.version);
      local.push(`${assertIdentifier(versionCol)} = $${params.length}`);
    }
    clauses.push(`(${local.join(' AND ')})`);
  }
  return clauses.length > 0 ? `(${clauses.join(' OR ')})` : '';
}

function buildScopePredicate(table, columns, options, coordinates) {
  const params = [];
  const andClauses = [];

  if (options.fullDemoSite) {
    const orgCol = pickColumn(columns, table === 'fetch_jobs'
      ? ['tenant_id', 'org_id', 'orgId', 'tenantId']
      : ['org_id', 'orgId', 'tenant_id', 'tenantId']);
    const siteCol = pickColumn(columns, ['site_id', 'siteId']);
    if (options.orgId && orgCol) {
      params.push(options.orgId);
      andClauses.push(`${assertIdentifier(orgCol)} = $${params.length}`);
    }
    if (options.siteId && siteCol) {
      params.push(options.siteId);
      andClauses.push(`${assertIdentifier(siteCol)} = $${params.length}`);
    }
  }

  if (options.correlationPrefix) {
    const correlationCol = pickColumn(columns, ['correlation_id', 'correlationId']);
    if (correlationCol) {
      params.push(`${options.correlationPrefix}%`);
      andClauses.push(`${assertIdentifier(correlationCol)} LIKE $${params.length}`);
    }
  }

  const coordinatePredicate = buildCoordinatePredicate(columns, coordinates, params);
  if (coordinatePredicate) {
    andClauses.push(coordinatePredicate);
  }

  if (andClauses.length === 0) return null;
  return { sql: andClauses.join(' AND '), params };
}

function tableHasSelectedTenantScope(table, columns, options) {
  if (options.fullDemoSite) {
    const orgCol = pickColumn(columns, table === 'fetch_jobs'
      ? ['tenant_id', 'org_id', 'orgId', 'tenantId']
      : ['org_id', 'orgId', 'tenant_id', 'tenantId']);
    const siteCol = pickColumn(columns, ['site_id', 'siteId']);
    if ((options.orgId && orgCol) || (options.siteId && siteCol)) return true;
  }

  if (options.correlationPrefix) {
    const correlationCol = pickColumn(columns, ['correlation_id', 'correlationId']);
    if (correlationCol) return true;
  }

  return false;
}

async function selectRows(client, table, predicate) {
  const result = await client.query(
    `SELECT * FROM ${assertIdentifier(table)} WHERE ${predicate.sql}`,
    predicate.params,
  );
  return result.rows;
}

async function countRows(client, table, predicate) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM ${assertIdentifier(table)} WHERE ${predicate.sql}`,
    predicate.params,
  );
  return Number(result.rows[0]?.count || 0);
}

async function deleteRows(client, table, predicate) {
  const result = await client.query(
    `DELETE FROM ${assertIdentifier(table)} WHERE ${predicate.sql}`,
    predicate.params,
  );
  return result.rowCount || 0;
}

async function processRds(options, backupDir, manifest) {
  const Client = loadPgClient();
  if (!Client) {
    manifest.rds.skipped = 'pg module not found. Run npm install in Backend or set NODE_PATH to pg.';
    return;
  }

  const databaseUrl = getDatabaseUrl(options.env);
  if (!databaseUrl || !databaseUrl.startsWith('postgres')) {
    manifest.rds.skipped = 'DATABASE_URL not set and SSM DATABASE_URL could not be read.';
    return;
  }

  const parsed = new URL(databaseUrl);
  const client = new Client({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(parsed.username),
    password: getDatabasePassword(options.env, decodeURIComponent(parsed.password)),
    ssl: { rejectUnauthorized: false },
  });

  const rdsDir = ensureDir(path.join(backupDir, 'rds'));
  const coordinates = parseCoordinates(options.coordinatesFile);
  const hasTenantScope = options.fullDemoSite || Boolean(options.correlationPrefix);
  manifest.rds.coordinates = coordinates;

  await client.connect();
  try {
    const tables = [...UI_TABLES];
    if (options.includeSharedCache) tables.push(...SHARED_COORDINATE_TABLES);

    for (const table of tables) {
      const exists = await tableExists(client, table);
      if (!exists) {
        manifest.rds.tables[table] = { exists: false };
        continue;
      }

      const columns = await tableColumns(client, table);
      const isShared = SHARED_COORDINATE_TABLES.includes(table);
      if (isShared && coordinates.length === 0) {
        manifest.rds.tables[table] = {
          exists: true,
          skipped: 'shared cache table requires --coordinates-file',
        };
        continue;
      }
      if (!isShared && !hasTenantScope) {
        manifest.rds.tables[table] = {
          exists: true,
          skipped: 'tenant/UI table requires --full-demo-site or --correlation-prefix',
        };
        continue;
      }
      if (!isShared && !tableHasSelectedTenantScope(table, columns, options)) {
        manifest.rds.tables[table] = {
          exists: true,
          skipped: 'no tenant or correlation columns match the selected reset scope',
        };
        continue;
      }

      const predicateCoordinates = isShared ? coordinates : (hasTenantScope ? coordinates : []);
      const predicate = buildScopePredicate(table, columns, options, predicateCoordinates);
      if (!predicate) {
        manifest.rds.tables[table] = {
          exists: true,
          skipped: 'no matching scope columns for selected reset scope',
        };
        continue;
      }

      const rows = await selectRows(client, table, predicate);
      const backupFile = path.join(rdsDir, `${table}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2));

      const entry = {
        exists: true,
        before: rows.length,
        backupFile,
        deleted: 0,
        after: undefined,
      };
      manifest.rds.tables[table] = entry;

      if (options.apply && rows.length > 0) {
        entry.deleted = await deleteRows(client, table, predicate);
        entry.after = await countRows(client, table, predicate);
      }
    }
  } finally {
    await client.end();
  }
}

function parseS3Prefix(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('empty S3 prefix');
  if (trimmed.startsWith('s3://')) {
    const without = trimmed.slice('s3://'.length);
    const slash = without.indexOf('/');
    return {
      bucket: slash >= 0 ? without.slice(0, slash) : without,
      prefix: slash >= 0 ? without.slice(slash + 1) : '',
    };
  }
  const slash = trimmed.indexOf('/');
  if (slash < 0) throw new Error(`S3 prefix must be s3://bucket/prefix or bucket/prefix: ${value}`);
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

function listS3Objects(bucket, prefix) {
  const keys = [];
  let token = '';
  do {
    const args = [
      's3api', 'list-objects-v2',
      '--bucket', bucket,
      '--prefix', prefix,
      '--output', 'json',
      '--region', REGION,
    ];
    if (token) args.push('--continuation-token', token);
    const parsed = JSON.parse(runAws(args) || '{}');
    for (const item of parsed.Contents || []) {
      if (item.Key) keys.push(item.Key);
    }
    token = parsed.NextContinuationToken || '';
  } while (token);
  return keys;
}

function deleteS3Objects(bucket, keys, backupDir) {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const payload = {
      Objects: chunk.map((Key) => ({ Key })),
      Quiet: true,
    };
    const payloadFile = path.join(backupDir, `s3-delete-${bucket}-${i}.json`);
    fs.writeFileSync(payloadFile, JSON.stringify(payload));
    runAws([
      's3api', 'delete-objects',
      '--bucket', bucket,
      '--delete', `file://${payloadFile}`,
      '--region', REGION,
    ]);
    deleted += chunk.length;
  }
  return deleted;
}

function processS3(options, backupDir, manifest) {
  const s3Dir = ensureDir(path.join(backupDir, 's3'));
  for (const raw of options.s3Prefixes) {
    const parsed = parseS3Prefix(raw);
    const id = `${parsed.bucket}/${parsed.prefix}`;
    try {
      const keys = listS3Objects(parsed.bucket, parsed.prefix);
      const backupFile = path.join(s3Dir, `${parsed.bucket}-${Buffer.from(parsed.prefix).toString('hex')}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(keys, null, 2));
      const entry = { bucket: parsed.bucket, prefix: parsed.prefix, keys: keys.length, backupFile, deleted: 0 };
      if (options.apply && keys.length > 0) {
        entry.deleted = deleteS3Objects(parsed.bucket, keys, backupDir);
      }
      manifest.s3[id] = entry;
    } catch (err) {
      manifest.s3[id] = { error: err.message };
    }
  }
}

function readDdbKeyFile(file) {
  if (!file) return [];
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('--ddb-key-file must contain a JSON array');
  return rows;
}

function processDdb(options, backupDir, manifest) {
  const ddbDir = ensureDir(path.join(backupDir, 'ddb'));
  const rows = readDdbKeyFile(options.ddbKeyFile);
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const table = row.table || row.TableName || row.tableName;
    const key = row.key || row.Key;
    const id = `${table || 'unknown'}#${i}`;
    if (!table || !key) {
      manifest.ddb[id] = { error: 'missing table or key' };
      continue;
    }

    try {
      const getOut = runAws([
        'dynamodb', 'get-item',
        '--table-name', table,
        '--key', JSON.stringify(key),
        '--output', 'json',
        '--region', REGION,
      ]);
      const backupFile = path.join(ddbDir, `${table}-${i}.json`);
      fs.writeFileSync(backupFile, getOut || '{}');
      const entry = { table, key, backupFile, deleted: false };
      if (options.apply) {
        runAws([
          'dynamodb', 'delete-item',
          '--table-name', table,
          '--key', JSON.stringify(key),
          '--region', REGION,
        ]);
        entry.deleted = true;
      }
      manifest.ddb[id] = entry;
    } catch (err) {
      manifest.ddb[id] = { table, key, error: err.message };
    }
  }
}

function processSqs(options, manifest) {
  for (const queueUrl of options.sqsQueueUrls) {
    try {
      const attrs = JSON.parse(runAws([
        'sqs', 'get-queue-attributes',
        '--queue-url', queueUrl,
        '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed',
        '--output', 'json',
        '--region', REGION,
      ]) || '{}');
      const entry = { queueUrl, attributes: attrs.Attributes || {}, purged: false };
      if (options.apply && options.purgeSqs) {
        runAws([
          'sqs', 'purge-queue',
          '--queue-url', queueUrl,
          '--region', REGION,
        ]);
        entry.purged = true;
      }
      manifest.sqs[queueUrl] = entry;
    } catch (err) {
      manifest.sqs[queueUrl] = { error: err.message };
    }
  }
}

function validateSafety(options) {
  const hasTenantRdsScope =
    (options.fullDemoSite && Boolean(options.orgId) && Boolean(options.siteId)) ||
    Boolean(options.correlationPrefix);
  const hasSharedCacheScope = options.includeSharedCache && Boolean(options.coordinatesFile);
  const hasExternalScope =
    options.s3Prefixes.length > 0 ||
    Boolean(options.ddbKeyFile) ||
    options.sqsQueueUrls.length > 0;

  if (options.fullDemoSite && (!options.orgId || !options.siteId)) {
    throw new Error('--full-demo-site requires both --org-id and --site-id');
  }
  if (options.includeSharedCache && !options.coordinatesFile) {
    throw new Error('--include-shared-cache requires --coordinates-file');
  }
  if (options.coordinatesFile && !options.includeSharedCache && !hasTenantRdsScope) {
    throw new Error('--coordinates-file without --include-shared-cache must be combined with --full-demo-site org/site or --correlation-prefix');
  }
  if (!hasTenantRdsScope && !hasSharedCacheScope && !hasExternalScope) {
    throw new Error('Refusing to run without a reset scope. Use --full-demo-site with org/site, --correlation-prefix, --coordinates-file with --include-shared-cache, --s3-prefix, --ddb-key-file, or --sqs-queue-url.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  validateSafety(options);

  const backupDir = ensureDir(options.backupDir || path.join(__dirname, `scanner-fresh-reset-${timestamp()}`));
  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'APPLY' : 'DRY_RUN',
    region: REGION,
    environment: options.env,
    backendSsmNamespace: backendSsmNamespace(options.env),
    scope: {
      orgId: options.orgId || null,
      siteId: options.siteId || null,
      fullDemoSite: options.fullDemoSite,
      correlationPrefix: options.correlationPrefix || null,
      coordinatesFile: options.coordinatesFile || null,
      includeSharedCache: options.includeSharedCache,
    },
    backupDir,
    rds: { tables: {} },
    s3: {},
    ddb: {},
    sqs: {},
  };

  console.log(`[fresh-reset] Mode: ${manifest.mode}`);
  console.log(`[fresh-reset] Backup dir: ${backupDir}`);

  const hasRdsWork = options.fullDemoSite || Boolean(options.correlationPrefix) || options.includeSharedCache;
  if (hasRdsWork) {
    await processRds(options, backupDir, manifest);
  } else {
    manifest.rds.skipped = 'no RDS reset scope selected';
  }
  processS3(options, backupDir, manifest);
  processDdb(options, backupDir, manifest);
  processSqs(options, manifest);

  const manifestFile = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`[fresh-reset] Manifest: ${manifestFile}`);

  let failedVerification = false;
  if (options.apply) {
    for (const [table, entry] of Object.entries(manifest.rds.tables)) {
      if (entry && typeof entry.after === 'number' && entry.after !== 0) {
        failedVerification = true;
        console.error(`[fresh-reset] Verification failed: ${table} still has ${entry.after} scoped rows`);
      }
    }
  }
  if (failedVerification) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[fresh-reset] FATAL: ${err.message}`);
  process.exit(1);
});
