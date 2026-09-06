#!/usr/bin/env node
/*
 * P47 stage-1 WIRE lane driver.
 * Sends each fixture through the daemon's provider proxy
 * (POST http://127.0.0.1:19391/proxy/anthropic/v1/messages) as a realistic
 * Anthropic Messages request, and records BOTH sides:
 *   - what the client saw (status + body),
 *   - what the fake upstream actually received (raw bytes + sha256), or NONE.
 *
 * Usage: node drive-wire.cjs [--interactive] [--stream] [--tag NAME] [--only fixtureName]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const DIR = __dirname;
const CAP = path.join(DIR, 'upstream-capture.jsonl');
const PORT = 19391;
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const TAG = val('--tag', 'main');
const ONLY = val('--only', null);
const STREAM = has('--stream');
const INTERACTIVE = has('--interactive');
const FAKE_CLIENT_KEY = 'sk-ant-api03-P47WIRELANE-FAKE-CLIENT-CREDENTIAL-000000';

function capCount() { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } }
function capFrom(n) { try { return fs.readFileSync(CAP, 'utf8').split('\n').filter(Boolean).slice(n).map((l) => JSON.parse(l)); } catch { return []; } }

function post(pathname, bodyStr, headers) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'POST', headers }, (res) => {
      const bufs = [];
      res.on('data', (d) => bufs.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(bufs).toString('utf8') }));
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: `ERROR ${e.message}` }));
    req.setTimeout(180000, () => { req.destroy(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const fixtures = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.b64.json'), 'utf8'));
  const results = [];
  for (const f of fixtures) {
    if (ONLY && f.name !== ONLY) continue;
    const text = Buffer.from(f.b64, 'base64').toString('utf8');
    const bodyObj = {
      model: 'claude-sonnet-4-5-20260929',
      max_tokens: 1024,
      system: 'You are a helpful coding assistant.',
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    };
    if (STREAM) bodyObj.stream = true;
    const bodyStr = JSON.stringify(bodyObj);
    const sent = { len: Buffer.byteLength(bodyStr), sha256: crypto.createHash('sha256').update(bodyStr).digest('hex') };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': FAKE_CLIENT_KEY,
      'anthropic-version': '2023-06-01',
      'user-agent': 'claude-cli/2.0.30 (external, cli)',
      'content-length': String(Buffer.byteLength(bodyStr)),
    };
    if (INTERACTIVE) { headers['x-devoid-interactive'] = 'true'; headers['x-devoid-warn-session'] = crypto.randomBytes(16).toString('hex'); }
    const before = capCount();
    const t0 = Date.now();
    const resp = await post('/proxy/anthropic/v1/messages', bodyStr, headers);
    const ms = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 400));
    const received = capFrom(before);
    results.push({
      tag: TAG, fixture: f.name, expect: f.expect, stream: STREAM, interactive: INTERACTIVE,
      sentSha256: sent.sha256, sentLen: sent.len, sentBody: bodyStr,
      clientStatus: resp.status, clientMs: ms, clientBody: resp.body.slice(0, 4000),
      upstreamHits: received.length,
      upstream: received.map((r) => ({ url: r.url, bodySha256: r.bodySha256, bodyLen: r.bodyLen, body: r.body.slice(0, 6000), authHeader: r.headers['x-api-key'] || r.headers.authorization || null, forwardedHeaders: r.headers })),
      byteIdentical: received.length === 1 && received[0].bodySha256 === sent.sha256,
    });
    process.stdout.write(`${f.name}: client=${resp.status} upstreamHits=${received.length} identical=${received.length === 1 && received[0].bodySha256 === sent.sha256}\n`);
  }
  const out = path.join(DIR, `results-${TAG}.json`);
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log('wrote ' + out);
}
main();
