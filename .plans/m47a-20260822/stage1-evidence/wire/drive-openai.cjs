#!/usr/bin/env node
/* Codex↔OpenAI wire lane (/proxy/openai). Same fixtures, Responses-API shape. */
'use strict';
const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const DIR = __dirname; const CAP = path.join(DIR, 'upstream-capture.jsonl'); const PORT = 19391;
const capCount = () => { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
const capFrom = (n) => { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).slice(n).map(JSON.parse); } catch { return []; } };
const KEY = 'sk-proj-P47WIRELANEFAKECODEXCREDENTIAL0000000000000000';
let SESSION = crypto.randomUUID();
function post(p, bodyStr, extra) {
  const headers = Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + KEY,
    'openai-beta': 'responses=experimental', accept: 'text/event-stream',
    'user-agent': 'codex_cli_rs/0.44.0 (Windows 11)', 'session-id': SESSION, 'thread-id': SESSION, 'content-length': String(Buffer.byteLength(bodyStr)) }, extra || {});
  return new Promise((res) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers }, (r) => {
      const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString('utf8') }));
    });
    req.on('error', (e) => res({ status: 0, headers: {}, body: 'ERR ' + e.message }));
    req.setTimeout(120000, () => req.destroy(new Error('timeout')));
    req.write(bodyStr); req.end();
  });
}
(async () => {
  const fixtures = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.b64.json'), 'utf8'));
  const out = [];
  for (const f of fixtures) {
    const text = Buffer.from(f.b64, 'base64').toString('utf8');
    const body = JSON.stringify({ model: 'gpt-5-codex', instructions: 'You are Codex, a coding agent.',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }], stream: true, store: false });
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    SESSION = crypto.randomUUID(); // fresh conversation per fixture: the wire lane's deny store is per-session
    const before = capCount();
    const r = await post('/proxy/openai/v1/responses', body);
    await new Promise((res) => setTimeout(res, 500));
    const got = capFrom(before);
    out.push({ fixture: f.name, expect: f.expect, sentSha256: sha, sentBody: body, clientStatus: r.status,
      clientBody: r.body.slice(0, 4000), upstreamHits: got.length,
      upstream: got.map((g) => ({ url: g.url, bodySha256: g.bodySha256, body: g.body.slice(0, 4000), auth: g.headers.authorization || null })),
      byteIdentical: got.length === 1 && got[0].bodySha256 === sha });
    console.log(`${f.name}: client=${r.status} hits=${got.length} identical=${got.length === 1 && got[0].bodySha256 === sha}`);
  }
  fs.writeFileSync(path.join(DIR, 'results-openai.json'), JSON.stringify(out, null, 2));
})();
