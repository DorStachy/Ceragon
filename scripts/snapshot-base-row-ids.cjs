#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */

// 2026-05-20 R5 gap-closure: snapshot-base-row-ids.cjs
// Captures per-base-fixture `analysis.id` values to a JSON object so the
// degraded-mode phase can assert no base row was overwritten. Atomic
// write via temp+rename. Hard-fails if any required base coordinate has
// no row yet.

const fs = require('fs');
const path = require('path');

const repoRootIdx = process.argv.indexOf('--repo-root');
const repoRoot = repoRootIdx >= 0
  ? path.resolve(process.argv[repoRootIdx + 1])
  : path.resolve(__dirname, '..');
const pgPath = path.join(repoRoot, 'Backend', 'node_modules', 'pg');
if (!fs.existsSync(pgPath)) {
  console.error(`pg dependency not found at ${pgPath}. Run \`npm install\` in ${repoRoot}/Backend.`);
  process.exit(2);
}
// eslint-disable-next-line global-require, import/no-dynamic-require
const { Client } = require(pgPath);

const outIdx = process.argv.indexOf('--out');
const coordsIdx = process.argv.indexOf('--coords');
if (outIdx < 0) { console.error('--out <path> required'); process.exit(2); }
if (coordsIdx < 0) { console.error('--coords <json-path> required (resolved BASE_FIXTURES)'); process.exit(2); }

const outPath = process.argv[outIdx + 1];
const coordsPath = process.argv[coordsIdx + 1];
let resolvedFixtures;
try {
  resolvedFixtures = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));
} catch (e) {
  console.error(`Failed to read --coords ${coordsPath}: ${e.message}`); process.exit(2);
}
if (!Array.isArray(resolvedFixtures) || resolvedFixtures.length === 0) {
  console.error('--coords must be a non-empty array of {ecosystem, name, version}'); process.exit(2);
}
for (const f of resolvedFixtures) {
  if (!f.ecosystem || !f.name || !f.version ||
      f.name.startsWith('__') || f.version.startsWith('__')) {
    console.error(`Unresolved fixture placeholder in --coords: ${JSON.stringify(f)}`); process.exit(2);
  }
}

async function main() {
  const c = new Client({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 5433),
    user: process.env.DATABASE_USER || 'codefense',
    password: process.env.DATABASE_PASSWORD || 'localtest123',
    database: process.env.DATABASE_NAME || 'codefense_db',
  });
  await c.connect();
  const snapshot = {};
  const missing = [];
  for (const f of resolvedFixtures) {
    const { rows } = await c.query(
      `SELECT id::text
         FROM analysis
        WHERE ecosystem=$1 AND "packageName"=$2 AND "packageVersion"=$3
        ORDER BY "createdAt" DESC LIMIT 1`,
      [f.ecosystem, f.name, f.version],
    );
    const key = `${f.ecosystem}:${f.name}@${f.version}`;
    if (rows.length) snapshot[key] = rows[0].id;
    else missing.push(key);
  }
  await c.end();

  if (missing.length > 0) {
    console.error(
      `Base-row snapshot REFUSING to write — ${missing.length} required base ` +
      `fixture(s) have no analysis row yet: ${missing.join(', ')}. ` +
      `Rerun the base install loop before invoking the degraded phase.`,
    );
    process.exit(1);
  }

  // Atomic write: temp + rename.
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
  fs.renameSync(tmp, outPath);
  console.log(`Wrote ${Object.keys(snapshot).length} base row IDs to ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
