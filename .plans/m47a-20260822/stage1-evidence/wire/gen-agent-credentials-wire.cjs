#!/usr/bin/env node
/*
 * P47 stage-1 WIRE lane — credential minter for THIS lane's OWN isolated daemon.
 * Copy of .codesec-e2e/gen-agent-credentials-p47.cjs with two changes:
 *   - ISO_HOME points at %TEMP%\devoid-p47-wire\home (not the shared p47-iso home);
 *   - daemonPort 19391, and it never creates/overwrites the demo admin user (it exists).
 * Never prints the token.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BACKEND = 'C:/cwt/p47-w4b-be';
const { Client } = require(path.join(BACKEND, 'node_modules', 'pg'));
const PEPPER = process.env.API_KEY_HMAC_PEPPER || 'ceragon-local-api-key-pepper';
const DEMO_EMAIL = 'demo@cera.io';
const ISO_HOME = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-wire/home';
const DB = { host: '127.0.0.1', port: 5643, user: 'codefense', password: 'localtest123', database: 'codefense_db' };

async function main() {
  const client = new Client(DB);
  await client.connect();
  const keyId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('hex');
  const token = `cf_api_${keyId}_${secret}`;
  const prefix = `cf_api_${keyId.slice(0, 8)}`;
  const keyHash = crypto.createHmac('sha256', PEPPER).update(token).digest('hex');

  const demo = (await client.query(
    'select id, org_id from users where lower(email) = lower($1) limit 1', [DEMO_EMAIL])).rows[0];
  if (!demo || !demo.org_id) throw new Error('demo user missing; run the shared minter first');
  const orgId = demo.org_id, userId = demo.id;
  const site = (await client.query(
    'select id from sites where org_id = $1 order by created_at asc limit 1', [orgId])).rows[0];
  if (!site) throw new Error('no site for org');
  const siteId = site.id;
  await client.query(
    `insert into api_keys (id, org_id, role, owner_user_id, created_by_user_id, name, key_type,
       site_id, is_site_token, prefix, key_hash, "createdAt")
     values ($1, $2, $3, $4, $4, $5, $6, $7, true, $8, $9, now())`,
    [keyId, orgId, 'owner', userId, 'p47-wire-lane-agent', 'cli_agent', siteId, prefix, keyHash]);

  const credentials = {
    apiKey: token,
    apiBaseUrl: 'http://127.0.0.1:2353',
    failOpen: false,
    daemonPort: 19391,
    requestSigningMode: 'enforce',
    gitHooks: { enabled: false, preCommit: false, prePush: false, strictLocalScan: false, failOpen: false, blockOnBypass: false, timeout: 45 },
  };
  const dir = path.join(ISO_HOME, '.devoid');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'credentials.json'), `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ success: true, orgId, siteId, userId, keyIdPrefix: keyId.slice(0, 8), wroteTo: path.join(dir, 'credentials.json') }));
  await client.end();
}
main().catch((e) => { console.log(JSON.stringify({ success: false, error: e.message })); process.exit(1); });
