// Read DATABASE_URL+PASSWORD from SSM, connect to RDS, list applied
// migrations from the typeorm `migrations` table, compare against the
// repo's src/migrations/ directory, and APPLY any pending ones that
// haven't run. Default DRY-RUN; --apply to execute.
//
// Built urgently 2026-05-07 because the Phase 8 deploy never updated
// the ECS task definition, so the new code was never running, so
// `migration:run` was never invoked. Today's task-def roll exposed
// the gap when fresh analyses started failing with
// `column Analysis.failure_reason does not exist`.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Client } = require(path.join(__dirname, '..', 'Backend', 'node_modules', 'pg'));

const APPLY = process.argv.includes('--apply');

async function getCreds() {
  const url = execSync(
    'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_URL" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text',
    { encoding: 'utf8', shell: true }
  ).trim();
  const pwd = execSync(
    'aws ssm get-parameter --name "/cera/staging/backend/DATABASE_PASSWORD" --with-decryption --region eu-north-1 --query "Parameter.Value" --output text',
    { encoding: 'utf8', shell: true }
  ).trim();
  return { url, pwd };
}

function readRepoMigrations() {
  const dir = path.join(__dirname, '..', 'Backend', 'src', 'migrations');
  // TypeORM convention: `<timestamp>-<name>.ts`. The class name combines
  // <name><timestamp>, but `migrations` table stores `<timestamp>` and `name`
  // (where name = `<ClassName><timestamp>`). We match by extracting both.
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const m = file.match(/^(\d+)-(.+)\.ts$/);
    if (!m) continue;
    const ts = m[1];
    const human = m[2];
    out.push({ file, ts, human, expectedName: `${human}${ts}` });
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}

async function main() {
  const { url, pwd } = await getCreds();
  const u = new URL(url);
  const client = new Client({
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    database: u.pathname.replace(/^\//, '').split('?')[0],
    user: decodeURIComponent(u.username),
    password: pwd,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`[migr] Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // Read applied migrations.
  const applied = await client.query(
    `SELECT name, timestamp FROM migrations ORDER BY timestamp ASC`
  );
  const appliedSet = new Set(applied.rows.map((r) => String(r.timestamp)));
  console.log(`[migr] ${applied.rows.length} migrations already applied:`);
  for (const r of applied.rows) {
    console.log(`  - ${r.timestamp}  ${r.name}`);
  }

  // Compare against repo.
  const repoMigs = readRepoMigrations();
  const pending = repoMigs.filter((m) => !appliedSet.has(m.ts));
  console.log(`\n[migr] ${pending.length} migrations PENDING:`);
  for (const p of pending) {
    console.log(`  - ${p.ts}  ${p.human}  (file: ${p.file})`);
  }
  if (pending.length === 0) {
    console.log('[migr] Nothing to do.');
    await client.end();
    return;
  }

  if (!APPLY) {
    console.log('\n[migr] DRY-RUN — pass --apply to execute.');
    await client.end();
    return;
  }

  // Build each pending migration as inline SQL by reading the .ts source
  // and extracting the queryRunner.query(`...`) calls inside up().
  // Crude but handles the simple ALTER TABLE migrations we have.
  for (const p of pending) {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'Backend', 'src', 'migrations', p.file),
      'utf8'
    );
    const upMatch = src.match(/public async up\(queryRunner: QueryRunner\):[^{]+\{([\s\S]*?)\n  \}/);
    if (!upMatch) {
      console.error(`  ! Cannot parse up() in ${p.file} — skipping`);
      continue;
    }
    const upBody = upMatch[1];
    // Extract every queryRunner.query(`...`) call as a string.
    const queryRe = /queryRunner\.query\(\s*`([\s\S]*?)`\s*\)/g;
    const queries = [];
    let qm;
    while ((qm = queryRe.exec(upBody)) !== null) {
      queries.push(qm[1].trim());
    }
    if (queries.length === 0) {
      console.error(`  ! No queries found in up() of ${p.file} — skipping`);
      continue;
    }
    console.log(`\n[migr] Applying ${p.ts}  ${p.human}  (${queries.length} statement(s))`);
    try {
      await client.query('BEGIN');
      for (const q of queries) {
        console.log(`  > ${q.replace(/\s+/g, ' ').slice(0, 120)}${q.length > 120 ? '...' : ''}`);
        await client.query(q);
      }
      // Record in migrations table — must match TypeORM convention:
      // INSERT INTO migrations (timestamp, name) VALUES ($1, $2)
      // where name = `<ClassName><timestamp>` (matches the `name` field
      // declared inside the migration class).
      await client.query(
        'INSERT INTO migrations (timestamp, name) VALUES ($1, $2)',
        [p.ts, p.expectedName]
      );
      await client.query('COMMIT');
      console.log(`  ✓ Applied ${p.ts}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`  ✗ FAILED ${p.ts}: ${e.message}`);
      // Stop on first failure — migrations may have ordering deps.
      throw e;
    }
  }

  await client.end();
  console.log('\n[migr] All pending migrations applied.');
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
