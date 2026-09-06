'use strict';
const fs = require('fs'); const path = require('path');
const DIR = __dirname;
const S = JSON.parse(fs.readFileSync(path.join(DIR, 'synthetic-secrets.json'), 'utf8'));
const tag = process.argv[2];
const R = JSON.parse(fs.readFileSync(path.join(DIR, `results-${tag}.json`), 'utf8'));
const flat = (s) => s.replace(/[^A-Za-z0-9_+/=-]/g, '');
for (const r of R) {
  console.log('=====', r.fixture, 'status', r.clientStatus, 'upstreamHits', r.upstreamHits, 'byteIdentical', r.byteIdentical);
  console.log('  client body head:', r.clientBody.slice(0, 260).replace(/\n/g, '\n'));
  console.log('  CLIENT: raw stripe?', r.clientBody.includes(S.stripe), '| stripe across frames?', flat(r.clientBody).includes(S.stripe),
    '| akia?', r.clientBody.includes(S.akia), '| injection text?', /ignoreprevInstructions|ignorepreviousinstructions/i.test(r.clientBody.replace(/[^A-Za-z]/g, '')));
  for (const u of r.upstream) {
    console.log('  UPSTREAM', u.url, 'len', u.bodyLen);
    console.log('    body head:', u.body.slice(0, 320).replace(/\n/g, '\n'));
    console.log('    UPSTREAM: akia?', u.body.includes(S.akia), '| stripe?', u.body.includes(S.stripe), '| slack?', u.body.includes(S.slack), '| BEGIN PRIVATE KEY?', u.body.includes('BEGIN PRIVATE KEY'));
  }
}
