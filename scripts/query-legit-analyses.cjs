const { Client } = require('pg');

const ids = [
  '3cff482c-5376-4c11-963f-88505ee88fae',
  '623c92ee-d258-4ccf-9769-9a5496954381',
  'b31eceef-d340-402c-8564-3c4ec6363dd0',
  '20a64e80-ebaa-4ec6-958c-892bd9225de9',
  '0a6546c4-cd63-4638-8983-368d2eb238a4',
  '6107066b-7a49-40f6-8bb3-39b1634e98d0',
  '3c5e881d-1367-4a87-b0e0-5d2cfadb26a6',
  '7170127d-b373-4241-abaf-beac1d0f59cc',
  '72e4b0dd-cbf2-4564-a618-dd99ee420550',
];

const client = new Client({
  connectionString: 'postgres://postgres:bybLKkFf5wQVNq8ex@codefense-postgressdb.c56akiuead81.eu-north-1.rds.amazonaws.com:5432/codefense_db',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT id, "packageName", "packageVersion", status, verdict, "riskScore", reason, "correlationId", "createdAt"
    FROM analysis
    WHERE id = ANY($1::uuid[])
    ORDER BY "createdAt" ASC
  `, [ids]);

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
