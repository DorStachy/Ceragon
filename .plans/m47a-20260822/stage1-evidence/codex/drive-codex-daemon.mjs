#!/usr/bin/env node
// P47 stage 1 CODEX lane, part A: the SAME 19 fixtures the claude-code drive ran,
// re-sent to the isolated daemon with the CODEX identity (agentType=codex,
// provider=openai, clientKind=codex-cli) on the same routes/bodies the Codex hook
// builds in cmd/devoid/ai.go. Attack text stays base64 in drive-fixtures.b64.json
// and is decoded at runtime (see drive-p47.mjs header for why).
import { readFileSync, writeFileSync } from 'node:fs';

const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const BASE = process.env.DAEMON_BASE || 'http://127.0.0.1:19390';
const TOKEN = readFileSync(`${ISO}/home/.devoid/daemon-token`, 'utf8').trim();
const AGENT = { agentType: 'codex', provider: 'openai', surface: 'cli', clientKind: 'codex-cli', osUser: 'e2e' };
const CWD = 'C:/cwt/p47-e2e-project';
const fixtures = JSON.parse(readFileSync(`${ISO}/drive-fixtures.b64.json`, 'utf8'));
const dec = (b64) => Buffer.from(b64, 'base64').toString('utf8');
const uid = () => 'exec-' + Math.random().toString(36).slice(2, 8);
const results = [];

async function call(path, body) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Devoid-Daemon-Token': TOKEN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  return { status: res.status, ms: Date.now() - t0, json };
}
function summary(j) {
  const keys = ['decision', 'verdict', 'action', 'disposition', 'localDecision', 'holdId', 'redacted',
    'redactedCount', 'redactedClasses', 'classes', 'findingClasses', 'classIds', 'monitored', 'reason', 'error'];
  const s = keys.map((k) => (j && j[k] !== undefined ? `${k}=${JSON.stringify(j[k]).slice(0, 60)}` : null)).filter(Boolean).join(' ');
  return s || JSON.stringify(j).slice(0, 160);
}
async function run(name, path, body, expect) {
  const r = await call(path, body);
  results.push({ name, path, expect, status: r.status, ms: r.ms, json: r.json });
  console.log(`${String(r.status).padEnd(4)} ${(r.ms + 'ms').padEnd(7)} ${name.padEnd(52)} ${summary(r.json)}`);
  return r.json;
}

const start = await run('session start', '/v1/ai/session/start',
  { ...AGENT, clientSessionId: 'codex-e2e-' + Date.now(), title: 'stage-1 codex drive' });
const sessionId = start.sessionId || start.id || start.session?.id || '';
console.log('sessionId=' + sessionId);
const S = { ...AGENT, sessionId, clientSessionId: sessionId, cwd: CWD };
const PATHS = { tool: '/v1/ai/tool-decision', prompt: '/v1/ai/prompt-check', post: '/v1/ai/post-tool' };
let lane = '';
for (const f of fixtures) {
  if (f.lane !== lane) { lane = f.lane; console.log(`\n--- ${lane} lane ---`); }
  const payload = dec(f.p);
  let body;
  if (f.lane === 'tool') body = { ...S, toolName: 'Bash', toolUseId: uid(), toolInput: { command: payload } };
  else if (f.lane === 'prompt') body = { ...S, text: payload };
  else body = { ...S, toolName: 'Bash', toolUseId: uid(), output: payload };
  await run(f.name, PATHS[f.lane], body, f.expect);
}
await run('session end', '/v1/ai/session/end', { ...AGENT, sessionId, reason: 'stage-1 codex drive complete' });
writeFileSync(`${EV}/codex-daemon-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length} calls recorded -> ${EV}/codex-daemon-results.json`);
