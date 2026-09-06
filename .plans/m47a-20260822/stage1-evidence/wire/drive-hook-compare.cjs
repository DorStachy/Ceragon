#!/usr/bin/env node
/* Step 7 — run the SAME synthetic fixtures through the HOOK lane
 * (POST /v1/ai/prompt-check on this lane's own daemon) so hook decision and
 * wire behaviour can be compared for identical inputs. */
'use strict';
const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const DIR = __dirname;
const TOKEN = fs.readFileSync('C:/Users/Owner/AppData/Local/Temp/devoid-p47-wire/home/.devoid/daemon-token', 'utf8').trim();
function post(p, obj) {
  const body = JSON.stringify(obj);
  return new Promise((res) => {
    const req = http.request({ host: '127.0.0.1', port: 19391, path: p, method: 'POST',
      headers: { 'content-type': 'application/json', 'x-devoid-daemon-token': TOKEN, 'content-length': Buffer.byteLength(body) } },
      (r) => { const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(b).toString('utf8') })); });
    req.on('error', (e) => res({ status: 0, body: String(e) })); req.write(body); req.end();
  });
}
(async () => {
  const AGENT = { agentType: 'claude-code', provider: 'anthropic', surface: 'cli', clientKind: 'claude-code', osUser: 'e2e' };
  const start = await post('/v1/ai/session/start', { ...AGENT, clientSessionId: 'wire-' + Date.now(), title: 'wire lane hook compare' });
  let sessionId; try { sessionId = JSON.parse(start.body).sessionId; } catch {}
  const fixtures = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.b64.json'), 'utf8'));
  const out = [];
  for (const f of fixtures) {
    const text = Buffer.from(f.b64, 'base64').toString('utf8');
    const r = await post('/v1/ai/prompt-check', { ...AGENT, sessionId, cwd: 'C:/cwt/p47-e2e-project', text });
    let j; try { j = JSON.parse(r.body); } catch { j = { raw: r.body }; }
    out.push({ fixture: f.name, expect: f.expect, status: r.status, decision: j.decision, findings: j.findings, reasons: j.reasons, redactedTextPrefix: (j.redactedText || '').slice(0, 200) });
    console.log(`${f.name}: hook decision=${j.decision} findings=${JSON.stringify((j.findings || []).map((x) => x.class))}`);
  }
  fs.writeFileSync(path.join(DIR, 'results-hooklane.json'), JSON.stringify({ sessionId, out }, null, 2));
  await post('/v1/ai/session/end', { ...AGENT, sessionId, reason: 'done' });
})();
