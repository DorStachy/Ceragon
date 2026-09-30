#!/usr/bin/env node
/**
 * MUTATION PROOF for ci/lib/lexicon-counter.mjs (rule 6, KC-43).
 *
 * The lexers are held to hand-checked corpora of the cases that break naive
 * counters (division versus regex, regexes inside template expressions, call
 * text inside strings and comments). The counting rule is held to two numbers
 * this code did not produce: F0 section F3's 147 regexp.MustCompile sites and
 * the 1,471 forms commit 6bfb3d82 declared. The check runs over a fixture
 * repository whose base is a byte copy of the real promptrisk sources at the
 * real R0 base, so the recorded baseline in the real gates file must hold there
 * too, and every mutation (cap, provenance, baseline, missing block) is shown
 * to turn it red.
 *
 *   node ci/lib/lexicon-counter.test.mjs      (exit 0 = every case held)
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { FILES, listTree, parseArgs, readBlobs } from './coordination.mjs';
import { makeWorkspace, realInstallersDir, realScoreboard, runScript } from './coordination-fixture.mjs';
import { check, collectForms, countAt, extractBrowserLexicon, goRegexSites, jsRegexSites } from './lexicon-counter.mjs';

const gates = realScoreboard(FILES.gates);
const SOURCES = gates.lexicon.sources;
const REAL_BASE = gates.rounds.R0.base.Installers;

// ── lexers ───────────────────────────────────────────────────────────────────

test('JS lexer: regex versus division, templates, strings and comments', () => {
  const src = [
    'const a = b / c / d;',
    'const e = /x\\/y[/]z/g.test(s);',
    'const f = `pre ${ /inside/.source } mid ${ `nested ${ /deep/ } t` } end`;',
    '// const no = /comment/;',
    "const g = '/not a regex/' + \"new RegExp('x')\";",
    'const h = arr[0] / 2 + (x) / 3 + 4 / 5;',
    'if (ok) { return /ret/.test(v); }',
    'const i = cond ? /q1/ : [/q2/, !/q3/];',
    'const j = new RegExp(String.raw`\\b${word}\\b`, "gi");',
    'const k = RegExp(pattern);',
    'x = typeof /t/;',
    '/* /block/ */ y = z;',
  ].join('\n');
  const sites = jsRegexSites(src);
  const lines = sites.map((s) => s.line);
  // e(1) f(2) return(1) i(3) j(1) k(1) typeof(1) = 10 sites
  assert.equal(sites.length, 10, JSON.stringify(sites));
  assert.deepEqual(lines, [2, 3, 3, 7, 8, 8, 8, 9, 10, 11]);
});

test('Go lexer: only real call sites, not strings or comments', () => {
  const src = [
    'package p',
    'var a = regexp.MustCompile(`(?i)a(b)`)',
    '// regexp.MustCompile("commented")',
    'var s = "regexp.MustCompile(inside a string)"',
    'var b, _ = regexp.Compile("x" +',
    '    "y")',
    'var c = regexp . MustCompilePOSIX ( `c` )',
    'var d = regexp.MustCompile(`(?i)a(b)`) // same pattern as a',
  ].join('\n');
  const sites = goRegexSites(src);
  assert.deepEqual(sites.map((s) => [s.line, s.fn]), [[2, 'MustCompile'], [5, 'Compile'], [7, 'MustCompilePOSIX'], [8, 'MustCompile']]);
  assert.equal(sites[0].id, sites[3].id, 'the same pattern must have the same identity (a moved regex is not new)');
  assert.notEqual(sites[0].id, sites[1].id);
});

// ── the counting rule against independent numbers ────────────────────────────

test('the rule reproduces F0 section F3 and commit 6bfb3d82, and the recorded R0 baseline', () => {
  const dir = realInstallersDir();
  const files = listTree(dir, REAL_BASE, SOURCES.goPackage).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  const blobs = readBlobs(dir, REAL_BASE, files);
  const byFn = {};
  for (const f of files) for (const s of goRegexSites(blobs.get(f).toString('utf8'))) byFn[s.fn] = (byFn[s.fn] || 0) + 1;
  assert.equal(byFn.MustCompile, 147, `F0 counted 147 regexp.MustCompile sites; the lexer finds ${JSON.stringify(byFn)}`);
  assert.equal(byFn.Compile, 3);
  const early = readBlobs(dir, '6bfb3d828bdabf58e28294de7e4867d3823e0c9e', [SOURCES.goLexicon]).get(SOURCES.goLexicon);
  assert.ok(early, 'commit 6bfb3d82 is not in the Installers checkout');
  assert.equal(collectForms(JSON.parse(early.toString('utf8'))).length, 1471, 'commit 6bfb3d82 declared 1,471 forms');
  const c = countAt(dir, REAL_BASE, SOURCES);
  assert.deepEqual(c.problems, []);
  assert.deepEqual(
    { go: { regexes: c.go.regexes, forms: c.go.forms }, browser: { regexes: c.browser.regexes, forms: c.browser.forms } },
    gates.rounds.R0.lexiconBaseline,
  );
});

// ── the check, over a byte copy of the real sources ──────────────────────────

let fixtureFiles;
function fx() {
  if (!fixtureFiles) {
    const dir = realInstallersDir();
    const files = listTree(dir, REAL_BASE, SOURCES.goPackage).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
    const blobs = readBlobs(dir, REAL_BASE, [...files, SOURCES.goLexicon, SOURCES.browser]);
    fixtureFiles = {};
    for (const [p, b] of blobs) fixtureFiles[p] = b.toString('utf8');
  }
  return { key: 'lexicon', repos: ['Installers'], extraFiles: { Installers: fixtureFiles } };
}

const run = (ws) => check(parseArgs(['--root', ws.root]));
const prov = (ws, lines) => writeFileSync(join(ws.sbDir(), 'lexicon-provenance.v1.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
const regexProv = (engine, id) => ({ kind: 'regex', engine, id, round: 'R0', unit: 'DD1-W1', source: 'miss:DD1.F03-2026-10-01', date: '2026-10-01' });
const formProv = (path, form) => ({ kind: 'form', path, form, round: 'R0', unit: 'DD1-W1', source: 'brief:scoreboard/briefs/dd1-w1.md', date: '2026-10-01' });
const nineRegexes = (n) => `package promptrisk\n\nimport "regexp"\n\nvar added = []*regexp.Regexp{\n${Array.from({ length: n }, (_, i) => `\tregexp.MustCompile(\`zz-added-${i}\`),`).join('\n')}\n}\n`;

test('an unchanged tree passes against the recorded baseline', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  ws.commit('Installers', { 'README.fixture': 'touch\n' });
  const res = run(ws);
  assert.equal(res.status, 'pass', [...res.findings, ...res.notChecked].join('\n'));
  assert.deepEqual(res.engines.go.net, { regexes: 0, forms: 0 });
  const cli = runScript('lexicon-counter.mjs', ['--root', ws.root]);
  assert.equal(cli.code, 0, cli.out);
});

test('nine new regexes break the cap, and each lacks provenance', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  ws.commit('Installers', { 'internal/promptrisk/zz_added.go': nineRegexes(9) });
  const res = run(ws);
  assert.equal(res.status, 'fail');
  const text = res.findings.join('\n');
  assert.match(text, /go: net \+9 regexes in round R0, cap 8/);
  assert.equal(res.findings.filter((f) => f.includes('has no provenance line')).length, 9);
  const cli = runScript('lexicon-counter.mjs', ['--root', ws.root]);
  assert.equal(cli.code, 1, cli.out);
});

test('eight provenanced regexes pass; the same eight without provenance fail', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  const body = nineRegexes(8);
  ws.commit('Installers', { 'internal/promptrisk/zz_added.go': body });
  const missing = run(ws);
  assert.equal(missing.status, 'fail');
  assert.ok(!missing.findings.some((f) => f.includes('cap')), missing.findings.join('\n'));
  prov(ws, goRegexSites(body).map((s) => regexProv('go', s.id)));
  const ok = run(ws);
  assert.equal(ok.status, 'pass', ok.findings.join('\n'));
  assert.equal(ok.engines.go.net.regexes, 8);
});

test('a regex moved to another file is not new', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  const victim = Object.keys(fixtureFiles).find((p) => p.endsWith('.go') && goRegexSites(fixtureFiles[p]).length > 0);
  ws.commit('Installers', { [victim]: null, [victim.replace(/\.go$/, '_moved.go')]: fixtureFiles[victim] });
  const res = run(ws);
  assert.equal(res.status, 'pass', res.findings.join('\n'));
});

test('a new lexicon form needs provenance; 76 provenanced forms break the cap', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  const lex = JSON.parse(fixtureFiles[SOURCES.goLexicon]);
  lex.sets['neg.dryrun'].heads.push('for a tabletop exercise only');
  ws.commit('Installers', { [SOURCES.goLexicon]: JSON.stringify(lex, null, 2) });
  const bad = run(ws);
  assert.equal(bad.status, 'fail');
  assert.match(bad.findings.join('\n'), /new lexicon form "for a tabletop exercise only" in sets\/neg.dryrun\/heads has no provenance/);
  prov(ws, [formProv('sets/neg.dryrun/heads', 'for a tabletop exercise only')]);
  assert.equal(run(ws).status, 'pass');

  const many = Array.from({ length: 76 }, (_, i) => `zz form ${i}`);
  lex.sets['neg.dryrun'].heads.push(...many);
  ws.commit('Installers', { [SOURCES.goLexicon]: JSON.stringify(lex, null, 2) });
  prov(ws, [formProv('sets/neg.dryrun/heads', 'for a tabletop exercise only'), ...many.map((f) => formProv('sets/neg.dryrun/heads', f))]);
  const over = run(ws);
  assert.equal(over.status, 'fail');
  assert.match(over.findings.join('\n'), /go: net \+77 lexicon forms in round R0, cap 75/);
});

test('the browser twin is capped on its own', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  const extra = Array.from({ length: 9 }, (_, i) => `const ZZ_ADDED_${i} = /zz-added-${i}/i;`).join('\n');
  ws.commit('Installers', { [SOURCES.browser]: `${fixtureFiles[SOURCES.browser]}\n${extra}\n` });
  const res = run(ws);
  assert.equal(res.status, 'fail');
  assert.match(res.findings.join('\n'), /browser: net \+9 regexes in round R0, cap 8/);
  assert.equal(res.engines.go.net.regexes, 0);
});

test('an edited recorded baseline is caught', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  const g = ws.read(FILES.gates);
  g.rounds.R0.lexiconBaseline.go.forms += 75;
  ws.write(FILES.gates, g);
  const res = run(ws);
  assert.equal(res.status, 'fail');
  assert.match(res.findings.join('\n'), /the counting rule or the base changed under a signed baseline/);
});

test('a missing browser lexicon block or a malformed provenance line is NOT CHECKED', (t) => {
  const ws = makeWorkspace(fx());
  t.after(() => ws.cleanup());
  assert.ok(extractBrowserLexicon(fixtureFiles[SOURCES.browser]), 'the real twin carries the generated block');
  ws.commit('Installers', { [SOURCES.browser]: fixtureFiles[SOURCES.browser].replace('// BEGIN GENERATED LEXICON v1', '// begin') });
  const res = run(ws);
  assert.equal(res.status, 'not-checked');
  assert.match(res.notChecked.join('\n'), /generated lexicon block is missing/);
  const cli = runScript('lexicon-counter.mjs', ['--root', ws.root]);
  assert.equal(cli.code, 2, cli.out);

  const ws2 = makeWorkspace(fx());
  t.after(() => ws2.cleanup());
  writeFileSync(join(ws2.sbDir(), 'lexicon-provenance.v1.jsonl'), `${JSON.stringify({ kind: 'form', path: 'x', form: 'y', round: 'R0', unit: 'nobody', source: 'vibes', date: 'today' })}\n`);
  const res2 = run(ws2);
  assert.equal(res2.status, 'not-checked');
  assert.match(res2.notChecked.join('\n'), /unit must be a unit id/);
  assert.ok(readFileSync(join(ws2.sbDir(), 'lexicon-provenance.v1.jsonl'), 'utf8').includes('vibes'));
});
