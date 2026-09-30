#!/usr/bin/env node
/**
 * MUTATION PROOF for ci/lib/roster-audit.mjs over fabricated repositories.
 *
 * Each case builds real git repositories (five, as the detector list names),
 * starting from copies of the real coordination files, commits as a given
 * identity, and asserts the audit's verdict AND its words. The signed path
 * uses test signer ids through the audit's signer seam; the CLI cases run the
 * production predicate, which must keep an unsigned roster red.
 *
 *   node ci/lib/roster-audit.test.mjs      (exit 0 = every case held)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import test from 'node:test';

import { FILES, parseArgs } from './coordination.mjs';
import { TEST_SIGNER, makeWorkspace, runScript } from './coordination-fixture.mjs';
import { audit } from './roster-audit.mjs';

const BUILDER = { name: 'd9 builder L1', email: 'l1@d9.invalid' };

function withBuilder(ws, roles = ['builder']) {
  const roster = ws.read(FILES.roster);
  roster.rounds[0].members.push({ id: 'agent:d9-l1', kind: 'agent', roles, gitIdentities: [BUILDER] });
  ws.write(FILES.roster, roster);
}

const signedAudit = (ws) => {
  ws.signWithTestIds();
  return audit(parseArgs(['--root', ws.root]), { matches: TEST_SIGNER });
};

test('an `unknown` commit to internal/promptrisk fails, naming the author and the file', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  ws.commit('Installers', { 'internal/promptrisk/zz.go': 'package promptrisk\n' }, { name: 'unknown', email: 'u@x.invalid' });
  const res = signedAudit(ws);
  assert.equal(res.status, 'fail');
  assert.equal(res.repos.Installers.commits, 1);
  assert.equal(res.findings.length, 1, res.findings.join('\n'));
  assert.match(res.findings[0], /author "unknown" identifies nobody/);
  assert.match(res.findings[0], /internal\/promptrisk\/zz\.go/);
});

test('a roster builder passes; the same commit by Owner fails by name', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  withBuilder(ws);
  ws.commit('Installers', { 'internal/dlp/zz.go': 'package dlp\n' }, BUILDER);
  const ok = signedAudit(ws);
  assert.equal(ok.status, 'pass', ok.findings.join('\n'));
  assert.equal(ok.repos.Installers.commits, 1, 'the builder commit was not even seen');
  ws.commit('Installers', { 'internal/dlp/zz2.go': 'package dlp\n' }, { name: 'Owner', email: 'owner@x.invalid' });
  const bad = signedAudit(ws);
  assert.equal(bad.status, 'fail');
  assert.match(bad.findings.join('\n'), /author "Owner" identifies nobody/);
});

test('an off-roster identity and a declared non-builder fail', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  withBuilder(ws, ['reviewer']);
  ws.commit('Backend', { 'src/ai-security-policy/zz.ts': 'x\n' }, BUILDER);
  ws.commit('Static-Worker', { 'src/analyzer/unicode-scanner.ts': 'y\n' }, { name: 'Someone', email: 's@x.invalid' });
  const res = signedAudit(ws);
  assert.equal(res.status, 'fail');
  const text = res.findings.join('\n');
  assert.match(text, /Backend .*agent:d9-l1 \(d9 builder L1\) is a declared non-builder/);
  assert.match(text, /Static-Worker .*Someone <s@x.invalid> is not on the round R0 roster/);
});

test('a commit that touches no detector path is not audited', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  ws.commit('Installers', { 'docs/notes.md': 'x\n', 'internal/airuntime/zz.go': 'package airuntime\n' }, { name: 'unknown', email: 'u@x.invalid' });
  const res = signedAudit(ws);
  assert.equal(res.status, 'pass', res.findings.join('\n'));
  assert.equal(res.repos.Installers.commits, 0);
});

test('a side-branch commit whose change a merge discarded is still audited', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  const dir = ws.dir('Installers');
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('switch', '-q', '-c', 'side');
  const side = ws.commit('Installers', { 'internal/promptrisk/side.go': 'package promptrisk\n' }, { name: 'unknown', email: 'u@x.invalid' });
  g('switch', '-q', 'main');
  ws.commit('Installers', { 'README.fixture': 'main moves\n' });
  g('-c', 'user.name=fixture', '-c', 'user.email=f@x.invalid', 'merge', '-q', '-s', 'ours', '--no-edit', 'side');
  const res = signedAudit(ws);
  assert.equal(res.status, 'fail');
  assert.match(res.findings.join('\n'), new RegExp(`Installers ${side.slice(0, 12)} .*author "unknown"`));
});

test('a missing repository is NOT CHECKED, never passed', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  rmSync(ws.dir('Sandbox-Worker'), { recursive: true, force: true });
  const res = signedAudit(ws);
  assert.equal(res.status, 'not-checked');
  assert.match(res.notChecked.join('\n'), /Sandbox-Worker: NOT CHECKED -- no checkout/);
  assert.equal(res.findings.length, 0);
});

test('a base commit the checkout does not have is NOT CHECKED', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  const gates = ws.read(FILES.gates);
  gates.rounds.R0.base.Frontend = 'f'.repeat(40);
  ws.write(FILES.gates, gates);
  const res = signedAudit(ws);
  assert.equal(res.status, 'not-checked');
  assert.match(res.notChecked.join('\n'), /Frontend: NOT CHECKED -- base ffffffffffff .* is not in/);
});

test('an ownership row naming a path that does not exist fails', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  const own = ws.read(FILES.ownership);
  own.entries.find((e) => e.id === 'frontend/console').paths = ['app/', 'componets/'];
  ws.write(FILES.ownership, own);
  const res = signedAudit(ws);
  assert.equal(res.status, 'fail');
  assert.equal(res.findings.length, 1, res.findings.join('\n'));
  assert.match(res.findings[0], /frontend\/console names Frontend:componets\/, which does not exist/);
});

test('CLI: the production signer predicate keeps an unsigned roster red, and --json reports it', (t) => {
  const ws = makeWorkspace();
  t.after(() => ws.cleanup());
  withBuilder(ws);
  ws.commit('Installers', { 'internal/dlp/zz.go': 'package dlp\n' }, BUILDER);
  ws.signWithTestIds();
  const r = runScript('roster-audit.mjs', ['--root', ws.root]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /roster\.v1\.json is UNSIGNED/);
  assert.match(r.out, /ownership\.json is UNSIGNED/);
  assert.doesNotMatch(r.out, /not on the round|identifies nobody/);
  const j = runScript('roster-audit.mjs', ['--root', ws.root, '--json']);
  const parsed = JSON.parse(j.out);
  assert.equal(parsed.status, 'fail');
  assert.equal(parsed.repos.Installers.commits, 1);
  const u = runScript('roster-audit.mjs', ['--bogus']);
  assert.equal(u.code, 3, u.out);
});
