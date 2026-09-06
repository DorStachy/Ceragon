#!/usr/bin/env node
// P47 stage 1 CODEX lane, part C: the CONFIG lane.
//
// Question: do the Codex enforcement files DeVoid writes into CODEX_HOME reflect the ORG
// policy the admin sets in the console, or are they compiled-in constants?
//
// Method: hash config.toml + managed_config.toml + requirements.toml, change the org DLP
// policy through the SAME backend API the console uses (login -> PUT
// /api/v1/ai/security-policy?siteId=), wait for the daemon to pick it up, hash again,
// then RESTORE the exact prior config object and prove the restore by diffing
// GET /v1/ai/policy before vs after.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash as hash } from 'node:crypto';

const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const SITE = '95937361-828f-4737-9c74-64defab9f5c6';
const BE = 'http://127.0.0.1:2353';
const DAEMON = 'http://127.0.0.1:19390';
const DTOKEN = readFileSync(ISO + '/home/.devoid/daemon-token', 'utf8').trim();

const FILES = {
  'config.toml': ISO + '/home/.codex/config.toml',
  'managed_config.toml': ISO + '/home/.codex/managed_config.toml',
  'requirements.toml': ISO + '/progdata/OpenAI/Codex/requirements.toml',
};
const sha = (p) => { try { return hash('sha256').update(readFileSync(p)).digest('hex'); } catch (e) { return 'ERR:' + e.code; } };
const snapshot = () => Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, sha(p)]));

async function daemonPolicy() {
  const r = await fetch(DAEMON + '/v1/ai/policy', { headers: { 'X-Devoid-Daemon-Token': DTOKEN } });
  return await r.json();
}
async function login() {
  const r = await fetch(BE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@cera.io', password: 'Test1234!' }) });
  const j = await r.json();
  return j.accessToken;
}
async function getPolicy(tok) {
  const r = await fetch(`${BE}/api/v1/ai/security-policy?siteId=${SITE}`, { headers: { Authorization: 'Bearer ' + tok } });
  return await r.json();
}
async function putPolicy(tok, config, revision) {
  const h = { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
  if (revision !== undefined && revision !== null) h['If-Match'] = String(revision);
  const r = await fetch(`${BE}/api/v1/ai/security-policy?siteId=${SITE}`, { method: 'PUT', headers: h, body: JSON.stringify(config) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 400) }; }
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stable = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.updatedAt; delete c.updatedBy; return JSON.stringify(c, Object.keys(c).sort()); };

const log = [];
const say = (s) => { console.log(s); log.push(s); };

const tok = await login();
say('logged in as demo@cera.io (admin), token len ' + tok.length);

const before = await getPolicy(tok);
const beforeCfg = before.config;
const beforeRev = before.revision;
writeFileSync(EV + '/config-lane/backend-policy-before.json', JSON.stringify(before, null, 2));
say('backend policy revision=' + beforeRev + '  dlp.actions["stripe-live"]=' + beforeCfg.dlp.actions['stripe-live']);

const dpBefore = await daemonPolicy();
writeFileSync(EV + '/config-lane/daemon-policy-before.json', JSON.stringify(dpBefore, null, 2));
say('daemon /v1/ai/policy stripe-live=' + dpBefore.dlp.actions['stripe-live']);

const snapBefore = snapshot();
say('codex file hashes BEFORE: ' + JSON.stringify(snapBefore, null, 0));

// ── the change: stripe-live redact -> block ────────────────────────────────
const changed = JSON.parse(JSON.stringify(beforeCfg));
changed.dlp.actions['stripe-live'] = 'block';
const put = await putPolicy(tok, changed, beforeRev);
say('PUT stripe-live=block -> http ' + put.status + ' revision=' + (put.json.revision ?? '?'));
if (put.status < 200 || put.status >= 300) { say('PUT FAILED: ' + JSON.stringify(put.json).slice(0, 300)); process.exit(1); }

// ── wait for the daemon to pick it up (heartbeat ~60s) ─────────────────────
let picked = null, waited = 0;
while (waited < 150000) {
  await sleep(5000); waited += 5000;
  const dp = await daemonPolicy();
  if (dp.dlp.actions['stripe-live'] === 'block') { picked = dp; say('daemon picked up the change after ~' + (waited / 1000) + 's'); break; }
}
if (!picked) say('daemon did NOT pick up the change within ' + (waited / 1000) + 's');
else writeFileSync(EV + '/config-lane/daemon-policy-changed.json', JSON.stringify(picked, null, 2));

// give any config writer a further grace period, then re-hash
await sleep(20000);
const snapAfter = snapshot();
say('codex file hashes AFTER : ' + JSON.stringify(snapAfter, null, 0));
const moved = Object.keys(FILES).filter((k) => snapBefore[k] !== snapAfter[k]);
say(moved.length ? 'CHANGED FILES: ' + moved.join(', ') : 'NO Codex config file changed in response to the org policy change');

// ── restore ────────────────────────────────────────────────────────────────
const mid = await getPolicy(tok);
const restore = await putPolicy(tok, beforeCfg, mid.revision);
say('RESTORE PUT -> http ' + restore.status + ' revision=' + (restore.json.revision ?? '?'));
let restored = null; waited = 0;
while (waited < 150000) {
  await sleep(5000); waited += 5000;
  const dp = await daemonPolicy();
  if (dp.dlp.actions['stripe-live'] === dpBefore.dlp.actions['stripe-live']) { restored = dp; say('daemon back to the original after ~' + (waited / 1000) + 's'); break; }
}
if (!restored) { say('RESTORE NOT YET VISIBLE at the daemon after ' + (waited / 1000) + 's'); restored = await daemonPolicy(); }
writeFileSync(EV + '/config-lane/daemon-policy-after-restore.json', JSON.stringify(restored, null, 2));

const same = stable(dpBefore) === stable(restored);
say('daemon /v1/ai/policy before === after restore (ignoring updatedAt/updatedBy): ' + same);
if (!same) {
  const a = JSON.parse(stable(dpBefore)), b = JSON.parse(stable(restored));
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) say('  differs at "' + k + '"');
}
const finalBe = await getPolicy(tok);
writeFileSync(EV + '/config-lane/backend-policy-after-restore.json', JSON.stringify(finalBe, null, 2));
say('backend policy after restore: revision=' + finalBe.revision + ' stripe-live=' + finalBe.config.dlp.actions['stripe-live']);
say('backend config object identical to the original: ' + (JSON.stringify(finalBe.config) === JSON.stringify(beforeCfg)));

writeFileSync(EV + '/config-lane/policy-cycle.log', log.join('\n') + '\n');
console.log('\n-> ' + EV + '/config-lane/policy-cycle.log');
