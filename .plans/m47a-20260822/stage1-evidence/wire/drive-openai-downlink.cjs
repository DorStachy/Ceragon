'use strict';
/* Response-direction probe on the Codex wire lane: benign uplink, poisoned downlink. */
const fs = require('fs'); const path = require('path'); const http = require('http'); const crypto = require('crypto');
const DIR = __dirname;
const KEY = 'sk-proj-P47WIRELANEFAKECODEXCREDENTIAL0000000000000000';
function post(bodyStr, session) {
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + KEY, 'openai-beta': 'responses=experimental',
    accept: 'text/event-stream', 'user-agent': 'codex_cli_rs/0.44.0 (Windows 11)', 'session-id': session, 'thread-id': session,
    'content-length': String(Buffer.byteLength(bodyStr)) };
  return new Promise((res) => {
    const req = http.request({ host: '127.0.0.1', port: 19391, path: '/proxy/openai/v1/responses', method: 'POST', headers }, (r) => {
      const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(b).toString('utf8') }));
    });
    req.on('error', (e) => res({ status: 0, body: 'ERR ' + e.message })); req.write(bodyStr); req.end();
  });
}
(async () => {
  const S = JSON.parse(fs.readFileSync(path.join(DIR, 'synthetic-secrets.json'), 'utf8'));
  const session = crypto.randomUUID();
  const body = JSON.stringify({ model: 'gpt-5-codex', instructions: 'You are Codex, a coding agent.',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Refactor the pagination hook so the page number survives a reload.' }] }], stream: true, store: false });
  const turn1 = await post(body, session);
  // second turn on the SAME session, to see whether the poisoned downlink changed the uplink posture
  const body2 = JSON.stringify({ model: 'gpt-5-codex', instructions: 'You are Codex, a coding agent.',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Now add a unit test for that hook.' }] }], stream: true, store: false });
  const turn2 = await post(body2, session);
  const txt = (sse) => sse.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)); } catch { return null; } })
    .filter(Boolean).filter((j) => j.type === 'response.output_text.delta').map((j) => j.delta).join('');
  const out = { session,
    turn1: { status: turn1.status, reassembled: txt(turn1.body), rawStripe: turn1.body.includes(S.stripe), reassembledStripe: txt(turn1.body).includes(S.stripe), injection: /ignore previous instructions/i.test(txt(turn1.body)), head: turn1.body.slice(0, 1200) },
    turn2: { status: turn2.status, reassembled: txt(turn2.body), head: turn2.body.slice(0, 900) } };
  fs.writeFileSync(path.join(DIR, 'results-openai-downlink.json'), JSON.stringify(out, null, 2));
  console.log('turn1 status', out.turn1.status, '| secret reaches client:', out.turn1.reassembledStripe, '| injection reaches client:', out.turn1.injection);
  console.log('turn1 text:', JSON.stringify(out.turn1.reassembled).slice(0, 300));
  console.log('turn2 status', out.turn2.status, '| text:', JSON.stringify(out.turn2.reassembled).slice(0, 300));
  console.log('turn2 head:', out.turn2.head.slice(0, 300).replace(/\n/g, '\n'));
})();
