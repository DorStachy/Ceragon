#!/usr/bin/env node
/* Extra wire-lane probes:
 *  1. count_tokens sibling with the AWS block fixture (must not leak);
 *  2. a WARN-tier secret (stripe-key: warn) from a NON-interactive caller;
 *  3. the same WARN-tier secret from an INTERACTIVE caller;
 *  4. benign request: prove request bytes AND response bytes are unchanged end to end.
 */
'use strict';
const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const DIR = __dirname; const CAP = path.join(DIR, 'upstream-capture.jsonl'); const PORT = 19391;
const KEY = 'sk-ant-api03-P47WIRELANE-FAKE-CLIENT-CREDENTIAL-000000';
const capCount = () => { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
const capFrom = (n) => { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).slice(n).map(JSON.parse); } catch { return []; } };
function post(p, bodyStr, extra) {
  const headers = Object.assign({ 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01',
    'user-agent': 'claude-cli/2.0.30 (external, cli)', 'content-length': String(Buffer.byteLength(bodyStr)) }, extra || {});
  return new Promise((res) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers }, (r) => {
      const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(b).toString('utf8') }));
    });
    req.on('error', (e) => res({ status: 0, headers: {}, body: 'ERR ' + e.message }));
    req.setTimeout(200000, () => req.destroy(new Error('timeout')));
    req.write(bodyStr); req.end();
  });
}
const build = (text, stream) => JSON.stringify(Object.assign({ model: 'claude-sonnet-4-5-20260929', max_tokens: 1024,
  system: 'You are a helpful coding assistant.', messages: [{ role: 'user', content: [{ type: 'text', text }] }] }, stream ? { stream: true } : {}));
(async () => {
  const main = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.b64.json'), 'utf8'));
  const extra = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures-extra.b64.json'), 'utf8'));
  const dec = (f) => Buffer.from(f.b64, 'base64').toString('utf8');
  const out = [];
  const probes = [
    { name: 'count_tokens-aws-block', path: '/proxy/anthropic/v1/messages/count_tokens', text: dec(main.find((f) => f.name === 'b-aws-pair')), hdr: {} },
    { name: 'count_tokens-benign', path: '/proxy/anthropic/v1/messages/count_tokens', text: dec(main.find((f) => f.name === 'a-benign')), hdr: {} },
    { name: 'warn-tier-noninteractive', path: '/proxy/anthropic/v1/messages', text: dec(extra[0]), hdr: {} },
    { name: 'warn-tier-interactive', path: '/proxy/anthropic/v1/messages', text: dec(extra[0]), hdr: { 'x-devoid-interactive': 'true', 'x-devoid-warn-session': crypto.randomBytes(16).toString('hex') } },
  ];
  for (const p of probes) {
    const body = build(p.text, false);
    const sha = crypto.createHash('sha256').update(body).digest('hex');
    const before = capCount(); const t0 = Date.now();
    const r = await post(p.path, body, p.hdr);
    const ms = Date.now() - t0;
    await new Promise((res) => setTimeout(res, 400));
    const got = capFrom(before);
    out.push({ probe: p.name, path: p.path, sentSha256: sha, sentBody: body, clientStatus: r.status, clientMs: ms, clientBody: r.body.slice(0, 3000),
      upstreamHits: got.length, upstream: got.map((g) => ({ url: g.url, bodySha256: g.bodySha256, body: g.body.slice(0, 3000) })), byteIdentical: got.length === 1 && got[0].bodySha256 === sha });
    console.log(`${p.name}: client=${r.status} ${ms}ms hits=${got.length} identical=${got.length === 1 && got[0].bodySha256 === sha}`);
  }
  fs.writeFileSync(path.join(DIR, 'results-extra.json'), JSON.stringify(out, null, 2));
})();
