// Phase 7 schema survey — list every public table with row count.
// Read-only. Used to build the precise wipe list with the operator.

const { execSync } = require('child_process');
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'Backend', 'node_modules', 'pg'));

async function getDbConfig() {
  const url = execSync(
    'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_URL" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text',
    { encoding: 'utf8', shell: true },
  ).trim();
  const u = new URL(url);
  let password = decodeURIComponent(u.password);
  try {
    password = execSync(
      'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_PASSWORD" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text',
      { encoding: 'utf8', shell: true },
    ).trim() || password;
  } catch (_) {}
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    database: u.pathname.replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(u.username),
    password,
    ssl: { rejectUnauthorized: false },
  };
}

async function main() {
  const client = new Client(await getDbConfig());
  await client.connect();

  const tables = (await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )).rows.map((r) => r.table_name);

  const counts = [];
  for (const t of tables) {
    try {
      const r = await client.query(`SELECT COUNT(*) AS c FROM "${t}"`);
      counts.push({ table: t, rows: parseInt(r.rows[0].c, 10) });
    } catch (e) {
      counts.push({ table: t, rows: -1, error: e.message });
    }
  }
  await client.end();

  // Print sorted by row count descending so the heavy tables are obvious.
  counts.sort((a, b) => b.rows - a.rows);
  console.log(`Found ${tables.length} tables in public schema.\n`);
  console.log('Table'.padEnd(45) + 'Rows');
  console.log('-'.repeat(60));
  for (const c of counts) {
    console.log(c.table.padEnd(45) + (c.rows < 0 ? `ERR: ${c.error}` : c.rows));
  }
  const totalRows = counts.reduce((s, c) => s + Math.max(0, c.rows), 0);
  console.log(`\nTotal rows across all public tables: ${totalRows}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
