const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:bybLKkFf5wQVNq8ex@codefense-postgressdb.c56akiuead81.eu-north-1.rds.amazonaws.com:5432/codefense_db',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT id, name, version, status, correlation_id AS "correlationId", attempts, "createdAt", "updatedAt", "processedAt"
    FROM fetch_jobs
    WHERE (name, version) IN (( 'fastify', '5.8.2' ), ( 'axios', '1.13.6' ), ( 'yargs-parser', '22.0.0' ))
    ORDER BY "createdAt" ASC
  `);

  for (const row of res.rows) {
    console.log(JSON.stringify(row));
  }

  await client.end();
}

run().catch(async (error) => {
  console.error(error);
  try { await client.end(); } catch {}
  process.exit(1);
});
