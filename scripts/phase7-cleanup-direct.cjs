// ─────────────────────────────────────────────────────────────────────────
// Phase 7 (P7 fix-plan 2026-05-06): direct RDS cleanup via pg.
//
// Connects to RDS via DATABASE_URL from SSM, counts/deletes data per
// the operator-chosen scope. Built to replace the .ps1 runbook for
// environments where psql isn't installed locally.
//
// ALL OPERATIONS DEFAULT TO DRY-RUN. Pass --apply to actually DELETE.
//
// Usage:
//   node scripts/phase7-cleanup-direct.cjs                  # dry-run all
//   node scripts/phase7-cleanup-direct.cjs --apply          # APPLY all
//   node scripts/phase7-cleanup-direct.cjs --apply --keep-shared
//                                                           # preserve package_forensics
//
// Operator-chosen scope (per user 2026-05-07):
//   1. ALL tenants
//   2. NO time window
//   3. INCLUDE shared package_forensics (option 3.b)
//   4. (DynamoDB handled separately)
//   5. NO worker drain (queues empty)
// ─────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const { Client } = require(require('path').join(__dirname, '..', 'Backend', 'node_modules', 'pg'));

const APPLY = process.argv.includes('--apply');
const KEEP_SHARED = process.argv.includes('--keep-shared');

// Tables to clean, in DELETE dependency order (children before parents).
// Curated against the actual production schema (see phase7-schema-survey.cjs).
// User instruction "APPLY ALL" — full wipe of user-facing data; auth/config/
// intelligence tables preserved (see Phase 7 final confirmation message).
const TENANT_TABLES = [
  // github-app scan-result chain (children → parents)
  'github_scan_result_chunks',
  'github_findings',
  'github_llm_enrichment_tasks',
  'github_suppressions',
  'github_scan_runs',
  'github_baseline_fingerprints',
  'github_baseline_versions',
  'github_baselines',
  'github_install_sessions',
  // dependency sync chain
  'repo_dependency_sync_runs',
  'repo_dependencies',
  // analysis-side
  'license_issues',
  'inventory_events',
  'policy_exceptions',
  'tenant_decisions',
  'analysis',
  'sandbox_jobs',
  'fetch_jobs',
  'global_artifact_cache',
];

// Shared intelligence — deleted because user chose option 3.b (include
// shared package_forensics in the wipe).
const SHARED_TABLES = [
  'package_forensics',
];

async function getDatabaseUrl() {
  // Read from SSM via aws CLI. Node spawns the AWS CLI in the native shell
  // (cmd.exe on Windows, /bin/sh on POSIX) so the SSM path /cera/... is
  // not mangled by Git Bash MSYS path conversion.
  const cmd = 'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_URL" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text';
  const out = execSync(cmd, { encoding: 'utf8', shell: true }).trim();
  if (!out || !out.startsWith('postgres')) {
    throw new Error('DATABASE_URL not retrievable from SSM');
  }
  return out;
}

async function tableExists(client, table) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table],
  );
  return res.rowCount > 0;
}

async function countRows(client, table) {
  if (!(await tableExists(client, table))) return null;
  const res = await client.query(`SELECT COUNT(*) AS c FROM "${table}"`);
  return parseInt(res.rows[0].c, 10);
}

async function deleteAll(client, table) {
  if (!(await tableExists(client, table))) return 0;
  // Use DELETE not TRUNCATE — TRUNCATE bypasses triggers/audit rules.
  const res = await client.query(`DELETE FROM "${table}"`);
  return res.rowCount;
}

async function main() {
  const url = await getDatabaseUrl();
  const u = new URL(url);
  // Read the canonical password from the dedicated SSM parameter rather than
  // decoding from the URL — avoids URL-encoding edge cases that caused
  // "password authentication failed" on the URL-parsed form.
  let password = decodeURIComponent(u.password);
  try {
    const cmd = 'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_PASSWORD" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text';
    const fromSsm = execSync(cmd, { encoding: 'utf8', shell: true }).trim();
    if (fromSsm) password = fromSsm;
  } catch (_) {
    // Fall back to URL-derived password.
  }

  const client = new Client({
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    database: u.pathname.replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(u.username),
    password,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`[phase7] Connected to RDS as user ${url.match(/^postgres(?:ql)?:\/\/([^:]+):/)[1]}`);
  console.log(`[phase7] Mode: ${APPLY ? 'APPLY (will DELETE)' : 'DRY-RUN (no writes)'}`);
  console.log(`[phase7] keep-shared: ${KEEP_SHARED}`);

  const report = {
    capturedAt: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    keepShared: KEEP_SHARED,
    tenantTables: {},
    sharedTables: {},
    errors: [],
  };

  // Phase 1: count BEFORE
  console.log('\n--- Pre-delete counts ---');
  for (const t of TENANT_TABLES) {
    try {
      const c = await countRows(client, t);
      report.tenantTables[t] = { before: c };
      console.log(`  ${t}: ${c === null ? '(table does not exist)' : c}`);
    } catch (e) {
      report.errors.push(`count ${t}: ${e.message}`);
    }
  }
  for (const t of SHARED_TABLES) {
    try {
      const c = await countRows(client, t);
      report.sharedTables[t] = { before: c };
      console.log(`  [SHARED] ${t}: ${c === null ? '(table does not exist)' : c}`);
    } catch (e) {
      report.errors.push(`count ${t}: ${e.message}`);
    }
  }

  // Phase 2: DELETE if --apply
  if (APPLY) {
    console.log('\n--- DELETING tenant-scoped tables ---');
    for (const t of TENANT_TABLES) {
      try {
        const deleted = await deleteAll(client, t);
        report.tenantTables[t].deleted = deleted;
        console.log(`  ${t}: deleted ${deleted}`);
      } catch (e) {
        report.errors.push(`delete ${t}: ${e.message}`);
        console.error(`  ${t}: FAILED — ${e.message}`);
      }
    }
    if (!KEEP_SHARED) {
      console.log('\n--- DELETING shared intelligence tables ---');
      for (const t of SHARED_TABLES) {
        try {
          const deleted = await deleteAll(client, t);
          report.sharedTables[t].deleted = deleted;
          console.log(`  ${t}: deleted ${deleted}`);
        } catch (e) {
          report.errors.push(`delete ${t}: ${e.message}`);
          console.error(`  ${t}: FAILED — ${e.message}`);
        }
      }
    } else {
      console.log('\n--- SHARED tables preserved (--keep-shared) ---');
    }
  }

  // Phase 3: count AFTER
  if (APPLY) {
    console.log('\n--- Post-delete counts ---');
    for (const t of TENANT_TABLES) {
      try {
        const c = await countRows(client, t);
        if (report.tenantTables[t]) report.tenantTables[t].after = c;
        console.log(`  ${t}: ${c === null ? '(table does not exist)' : c}`);
      } catch (e) {
        report.errors.push(`count after ${t}: ${e.message}`);
      }
    }
    for (const t of SHARED_TABLES) {
      try {
        const c = await countRows(client, t);
        if (report.sharedTables[t]) report.sharedTables[t].after = c;
        console.log(`  [SHARED] ${t}: ${c === null ? '(table does not exist)' : c}`);
      } catch (e) {
        report.errors.push(`count after ${t}: ${e.message}`);
      }
    }
  }

  await client.end();

  const fs = require('fs');
  const path = require('path');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(__dirname, `phase7-cleanup-report-${ts}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n[phase7] Report written: ${reportFile}`);
  if (report.errors.length > 0) {
    console.error(`[phase7] ${report.errors.length} error(s) — review report.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[phase7] FATAL:', e.message);
  process.exit(1);
});
