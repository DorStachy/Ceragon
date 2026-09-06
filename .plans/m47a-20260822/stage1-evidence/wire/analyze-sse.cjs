'use strict';
const fs = require('fs'); const path = require('path');
const DIR = __dirname;
const S = JSON.parse(fs.readFileSync(path.join(DIR, 'synthetic-secrets.json'), 'utf8'));
const R = JSON.parse(fs.readFileSync(path.join(DIR, `results-${process.argv[2]}.json`), 'utf8'));
function reassemble(sse) {
  let out = '';
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue;
    let j; try { j = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (j.type === 'content_block_delta' && j.delta && typeof j.delta.text === 'string') out += j.delta.text;
  }
  return out;
}
for (const r of R) {
  const text = reassemble(r.clientBody);
  console.log('=====', r.fixture, 'clientStatus', r.clientStatus, 'upstreamHits', r.upstreamHits);
  console.log('  reassembled assistant text:', JSON.stringify(text).slice(0, 420));
  console.log('  reassembled contains RAW stripe secret:', text.includes(S.stripe));
  console.log('  reassembled contains injected instruction:', /ignore previous instructions/i.test(text));
}
