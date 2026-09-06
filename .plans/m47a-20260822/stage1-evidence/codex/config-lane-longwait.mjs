#!/usr/bin/env node
// CONFIG lane, longer window. The 150s run showed no pickup and no refresh attempt in the
// daemon log at all, which is not long enough to call it. This one flips ONE DLP class,
// then polls the daemon policy AND tails devoid.log for new policy/bundle lines for 8
// minutes, and restores whatever happens.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const LOG = ISO + '/home/.devoid/devoid.log';
const SITE = '95937361-828f-4737-9c74-64defab9f5c6';
const BE = 'http://127.0.0.1:2353';
const DAEMON = 'http://127.0.0.1:19390';
const DTOKEN = readFileSync(ISO + '/home/.devoid/daemon-token', 'utf8').trim();
const CLASS = 'stripe-live';

const FILES = {
  'managed_config.toml': ISO + '/home/.codex/managed_config.toml',
  'requirements.toml': ISO + '/progdata/OpenAI/Codex/requirements.toml',
  'config.toml': ISO + '/home/.codex/config.toml',
};
const sha = (p) => { try { return createHash('sha256').update(readFileSync(p)).digest('hex'); } catch (e) { return 'ERR'; } };
const snap = () => Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, sha(p)]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const say = (s) => { console.log(s); out.push(s); };

const dPolicy = async () => (await fetch(DAEMON + '/v1/ai/policy', { headers: { 'X-Devoid-Daemon-Token': DTOKEN } })).json();
const login = async () => (await (await fetch(BE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@cera.io', password: 'Test1234!' }) })).json()).accessToken;
const getP = async (t) => (await fetch(`${BE}/api/v1/ai/security-policy?siteId=${SITE}`, { headers: { Authorization: 'Bearer ' + t } })).json();
async function putP(t, cfg, rev) {
  const h = { Authorization: 'Bearer ' + t, 'content-type': 'application/json' };
  if (rev != null) h['If-Match'] = String(rev);
  const r = await fetch(`${BE}/api/v1/ai/security-policy?siteId=${SITE}`, { method: 'PUT', headers: h, body: JSON.stringify(cfg) });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 300) }; }
  return { status: r.status, json: j };
}

const logSizeAt = () => { try { return statSync(LOG).size; } catch { return 0; } };
const newLogSince = (off) => { try { const b = readFileSync(LOG); return b.slice(off).toString('utf8'); } catch { return ''; } };

const tok = await login();
const p0 = await getP(tok);
const cfg0 = p0.config, rev0 = p0.revision;
const was = cfg0.dlp.actions[CLASS];
const to = was === 'block' ? 'redact' : 'block';
say(`backend revision=${rev0}  dlp.actions["${CLASS}"]=${was} -> ${to}`);

const dp0 = await dPolicy();
say(`daemon /v1/ai/policy ${CLASS}=${dp0.dlp.actions[CLASS]}`);
const s0 = snap();
say('codex hashes BEFORE: ' + JSON.stringify(s0));
const logOff = logSizeAt();

const changed = JSON.parse(JSON.stringify(cfg0));
changed.dlp.actions[CLASS] = to;
const put = await putP(tok, changed, rev0);
say(`PUT -> http ${put.status} revision=${put.json.revision ?? '?'} at ${new Date().toISOString()}`);

let picked = false;
for (let i = 1; i <= 48; i++) {           // 48 * 10s = 8 minutes
  await sleep(10000);
  const dp = await dPolicy();
  if (dp.dlp.actions[CLASS] === to) { say(`daemon PICKED UP the change after ~${i * 10}s`); picked = true; break; }
  if (i % 6 === 0) say(`  ...${i * 10}s: daemon still says ${CLASS}=${dp.dlp.actions[CLASS]}`);
}
if (!picked) say('daemon did NOT pick up the org policy change within 480s');

const s1 = snap();
say('codex hashes AFTER : ' + JSON.stringify(s1));
const moved = Object.keys(FILES).filter((k) => s0[k] !== s1[k]);
say(moved.length ? 'CHANGED: ' + moved.join(', ') : 'NO Codex config file changed');

const newLines = newLogSince(logOff).split('\n').filter((l) => /policy|bundle|activat|chain|heartbeat/i.test(l));
say(`daemon log lines mentioning policy/bundle/activation during the window: ${newLines.length}`);
for (const l of newLines.slice(0, 25)) say('  | ' + l.slice(0, 260));
writeFileSync(EV + '/config-lane/daemon-log-during-change.txt', newLines.join('\n') + '\n');

// restore
const mid = await getP(tok);
const r = await putP(tok, cfg0, mid.revision);
say(`RESTORE -> http ${r.status} revision=${r.json.revision ?? '?'}`);
const fin = await getP(tok);
say(`backend after restore: revision=${fin.revision} ${CLASS}=${fin.config.dlp.actions[CLASS]}`);
say('backend config identical to original: ' + (JSON.stringify(fin.config) === JSON.stringify(cfg0)));
const dpF = await dPolicy();
writeFileSync(EV + '/config-lane/daemon-policy-final.json', JSON.stringify(dpF, null, 2));
const stable = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.updatedAt; delete c.updatedBy; return JSON.stringify(c); };
say('daemon /v1/ai/policy identical before vs final: ' + (stable(dp0) === stable(dpF)));

writeFileSync(EV + '/config-lane/longwait.log', out.join('\n') + '\n');
console.log('\n-> ' + EV + '/config-lane/longwait.log');
