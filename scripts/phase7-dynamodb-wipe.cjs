// Phase 7 DynamoDB wipe — scan + batch-delete every item from listed tables.
// Preserves table schema (don't recreate — we'd lose indexes/streams config).
// Default DRY-RUN, --apply triggers actual deletes.
//
// User instruction "APPLY ALL" — wipes both cache tables AND intelligence-plane.

const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const REGION = 'eu-north-1';

const TABLES = [
  'cera-artifact_analysis_cache-staging',
  'cera-artifact_analysis_cache-production',
  // Intelligence-plane (per "APPLY ALL")
  'ceragon-staging-artifact-verdict',
  'ceragon-production-artifact-verdict',
  'ceragon-staging-artifact-catalog',
  'ceragon-production-artifact-catalog',
  'ceragon-staging-artifact-alias',
  'ceragon-production-artifact-alias',
];

function awsCli(args) {
  return execSync(`aws ${args}`, { encoding: 'utf8', shell: true, maxBuffer: 50 * 1024 * 1024 });
}

function describeKey(table) {
  const out = JSON.parse(awsCli(`dynamodb describe-table --table-name "${table}" --region ${REGION} --query "Table.KeySchema" --output json`));
  return out; // [{AttributeName, KeyType}]
}

function scanAllKeys(table, keySchema) {
  const projection = keySchema.map((k) => `#${k.AttributeName}`).join(',');
  const exprNames = keySchema.reduce((m, k) => ({ ...m, [`#${k.AttributeName}`]: k.AttributeName }), {});
  const exprNamesStr = JSON.stringify(exprNames).replace(/"/g, '\\"');

  const items = [];
  let exclusiveStart = null;
  let pages = 0;
  do {
    const startArg = exclusiveStart ? ` --exclusive-start-key '${JSON.stringify(exclusiveStart)}'` : '';
    const out = JSON.parse(awsCli(
      `dynamodb scan --table-name "${table}" --region ${REGION} --projection-expression "${projection}" --expression-attribute-names "${exprNamesStr}" --output json${startArg}`,
    ));
    if (out.Items) items.push(...out.Items);
    exclusiveStart = out.LastEvaluatedKey || null;
    pages++;
  } while (exclusiveStart);
  return { items, pages };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function batchDelete(table, items) {
  // Write the request body to a temp file and use file:// input — bypasses
  // Windows cmd.exe single-quote handling that mangles inline JSON.
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const batches = chunk(items, 25);
  let deleted = 0;
  for (const batch of batches) {
    const requestItems = {
      [table]: batch.map((Key) => ({ DeleteRequest: { Key } })),
    };
    const tmpFile = path.join(os.tmpdir(), `phase7-ddb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(requestItems));
    try {
      awsCli(`dynamodb batch-write-item --request-items file://${tmpFile.replace(/\\/g, '/')} --region ${REGION}`);
      deleted += batch.length;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }
  return deleted;
}

function main() {
  console.log(`[phase7-ddb] Mode: ${APPLY ? 'APPLY (will DELETE)' : 'DRY-RUN'}`);
  const report = { tables: [] };

  for (const table of TABLES) {
    let keySchema, items;
    try {
      keySchema = describeKey(table);
      ({ items } = scanAllKeys(table, keySchema));
    } catch (e) {
      console.error(`  ${table}: scan FAILED — ${e.message.split('\n')[0]}`);
      report.tables.push({ table, error: e.message });
      continue;
    }
    console.log(`  ${table}: ${items.length} items`);
    if (APPLY && items.length > 0) {
      const deleted = batchDelete(table, items);
      console.log(`    deleted ${deleted}`);
      report.tables.push({ table, before: items.length, deleted });
    } else {
      report.tables.push({ table, before: items.length, deleted: 0 });
    }
  }

  // Verify counts (approximate — DynamoDB ItemCount updates every ~6 hours,
  // so we re-scan to confirm).
  if (APPLY) {
    console.log('\n[phase7-ddb] Verifying with fresh scan ...');
    for (const t of report.tables) {
      if (t.error) continue;
      try {
        const k = describeKey(t.table);
        const { items } = scanAllKeys(t.table, k);
        t.after = items.length;
        console.log(`  ${t.table}: ${items.length} items`);
      } catch (e) {
        t.afterError = e.message;
      }
    }
  }

  const fs = require('fs');
  const path = require('path');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(__dirname, `phase7-dynamodb-report-${ts}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n[phase7-ddb] Report: ${reportFile}`);
}

try {
  main();
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(1);
}
