#!/usr/bin/env node
/**
 * MUTATION PROOF for ci/lib/ratchet-audit.mjs over fabricated repositories.
 *
 * The check half: a detector commit needs a passing record from the leg the
 * REAL ci/gates.json marks requiredFor its repository; a missing record, a
 * recorded regression, a record from another leg, and any commit to a frozen
 * path inside a freeze window each fail; a missing marker fails; a repository
 * with no marked leg is NOT CHECKED. The --record half runs a stub scoreboard
 * (the seam for the real one) in a temporary worktree and must leave the audited
 * repository's refs and worktrees exactly as it found them.
 *
 *   node ci/lib/ratchet-audit.test.mjs      (exit 0 = every case held)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { FILES, parseArgs } from './coordination.mjs';
import { CI_DIR, TEST_SIGNER, makeWorkspace, runScript } from './coordination-fixture.mjs';
import { RECORD_FORMAT, check, record } from './ratchet-audit.mjs';

const FX = { key: 'ratchet', extraFiles: { Installers: { 'browser-extension/scripts/scoreboard-engine.mjs': '// fixture engine\n' } } };
const LEG = 'Installers/pr-checks:scoreboard';
const GATES = ['ratchet', 'parity-ratchet'];

function passLine(sha, over = {}) {
  return JSON.stringify({
    format: RECORD_FORMAT,
    repo: 'Installers',
    commit: sha,
    leg: LEG,
    gates: GATES,
    result: 'pass',
    gatesDigest: 'sha256:test',
    gatesSigned: false,
    rowSetDigest: 'sha256:rows',
    verdictSetDigest: 'sha256:verdicts',
    scoreboardTree: 'fixture',
    recordedAt: '2026-10-01T13:00:00Z',
    ...over,
  });
}

function addRecords(ws, ...lines) {
  writeFileSync(join(ws.sbDir(), FILES.ratchetLedger), `${lines.join('\n')}\n`);
}

const signedCheck = (ws, over = {}) => {
  ws.signWithTestIds();
  return check({ ...parseArgs(['--root', ws.root]), ...over }, { matches: TEST_SIGNER });
};

test('a detector commit with no record fails; a passing record from the marked leg passes', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const sha = ws.commit('Installers', { 'internal/toolrisk/zz.go': 'package toolrisk\n' });
  const bad = signedCheck(ws);
  assert.equal(bad.status, 'fail');
  assert.match(bad.findings.join('\n'), new RegExp(`Installers ${sha.slice(0, 12)} .*no ratchet-pass record`));
  addRecords(ws, passLine(sha));
  const ok = signedCheck(ws);
  assert.equal(ok.status, 'pass', [...ok.findings, ...ok.notChecked].join('\n'));
  assert.equal(ok.repos.Installers.detectorCommits, 1);
});

test('a recorded regression and a record from another leg fail', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const a = ws.commit('Installers', { 'internal/promptrisk/a.go': 'package promptrisk\n' });
  const b = ws.commit('Installers', { 'browser-extension/src/dlp.js': '// b\n' });
  addRecords(ws, passLine(a, { result: 'fail', detail: 'ratchet: row x lost tier-correctness' }), passLine(b, { gates: ['ratchet'] }));
  const res = signedCheck(ws);
  assert.equal(res.status, 'fail');
  const text = res.findings.join('\n');
  assert.match(text, new RegExp(`${a.slice(0, 12)} .*recorded a regression \\(ratchet: row x lost tier-correctness\\)`));
  assert.match(text, new RegExp(`${b.slice(0, 12)} .*not the marked ratchet ${LEG}`));
});

test('freeze windows: a detector or frozen-row commit inside one fails, a not-frozen path does not', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const inWin = '2026-10-26T09:00:00Z';
  const det = ws.commit('Installers', { 'internal/dlp/w.go': 'package dlp\n' }, undefined, inWin);
  const seam = ws.commit('Installers', { 'internal/proxy/ai_proxy.go': 'package proxy\n' }, undefined, inWin);
  ws.commit('Installers', { 'internal/airuntime/w.go': 'package airuntime\n' }, undefined, inWin);
  addRecords(ws, passLine(det));
  const res = signedCheck(ws);
  assert.equal(res.status, 'fail');
  const text = res.findings.join('\n');
  assert.match(text, new RegExp(`${det.slice(0, 12)} 2026-10-26: committed inside the R0 round-exit freeze`));
  assert.match(text, new RegExp(`${seam.slice(0, 12)} 2026-10-26: committed inside the R0 round-exit freeze`));
  assert.equal(res.findings.length, 2, text);
});

test('deleting the requiredFor marker from ci/gates.json fails; the real marker is present', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const manifest = JSON.parse(readFileSync(join(CI_DIR, 'gates.json'), 'utf8'));
  assert.deepEqual(manifest.repos.Installers.mirrored['pr-checks:scoreboard'].requiredFor.gates, GATES);
  delete manifest.repos.Installers.mirrored['pr-checks:scoreboard'].requiredFor;
  const path = join(ws.root, 'ci', 'gates.nomarker.json');
  writeFileSync(path, JSON.stringify(manifest));
  const res = signedCheck(ws, { ciManifest: path });
  assert.equal(res.status, 'fail');
  assert.match(res.findings.join('\n'), /marks no leg requiredFor detector commits/);
});

test('a detector commit in a repository with no marked leg is NOT CHECKED', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const sha = ws.commit('Backend', { 'src/ai-security-policy/zz.ts': 'x\n' });
  const res = signedCheck(ws);
  assert.equal(res.status, 'not-checked');
  assert.match(res.notChecked.join('\n'), new RegExp(`Backend ${sha.slice(0, 12)} .*no leg in ci/gates.json is marked requiredFor Backend`));
});

test('CLI: an unsigned freeze file keeps the audit red', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  const r = runScript('ratchet-audit.mjs', ['--root', ws.root]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /freeze\.v1\.json is UNSIGNED/);
});

// ── --record ─────────────────────────────────────────────────────────────────

const STUB = `
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (!existsSync(join(process.cwd(), 'scoreboard', 'OVERLAY_MARKER'))) { console.error('no overlay'); process.exit(2); }
const out = process.env.SCOREBOARD_OUT;
mkdirSync(out, { recursive: true });
const gates = (process.env.STUB_GATES || '').split(',').filter(Boolean).map((g) => { const [id, status] = g.split('='); return { id, enabled: true, status, detail: status === 'FAIL' ? ['row dd1-x lost tier-correctness'] : [] }; });
const report = { format: 'devoid.scoreboard.report/1', detectionScore: { name: 'Detection score /10', quotable: false, note: 'n' }, gates: { digest: 'sha256:g', signed: false }, rowSetDigest: 'sha256:r', verdictSetDigest: 'sha256:v', gateResults: gates };
if (process.env.STUB_MERGED) report.scenarioReadiness = { percent: 86 };
writeFileSync(join(out, 'scoreboard.json'), JSON.stringify(report));
process.exit(Number(process.env.STUB_EXIT || 0));
`;

function stub(t) {
  const dir = mkdtempSync(join(tmpdir(), 'd9-stub-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = join(dir, 'stub.mjs');
  writeFileSync(p, STUB);
  return `"${process.execPath}" "${p}"`;
}

const refsOf = (dir) =>
  execFileSync('git', ['for-each-ref'], { cwd: dir, encoding: 'utf8' }) + execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: dir, encoding: 'utf8' });

function recordRun(ws, runner, env) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  try {
    return record({ ...parseArgs(['--root', ws.root]), runner });
  } finally {
    for (const k of Object.keys(env)) if (prev[k] === undefined) delete process.env[k];
    Object.assign(process.env, prev);
  }
}

test('--record: a passing stub run appends a record the check then accepts; refs and worktrees untouched', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  writeFileSync(join(ws.sbDir(), 'OVERLAY_MARKER'), 'from the scoreboard tree\n');
  const sha = ws.commit('Installers', { 'internal/shellast/r.go': 'package shellast\n' });
  const before = refsOf(ws.dir('Installers'));
  const res = recordRun(ws, stub(t), { STUB_EXIT: '0', STUB_GATES: 'ratchet=PASS,parity-ratchet=PASS' });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.recorded, [{ commit: sha, result: 'pass' }]);
  assert.equal(refsOf(ws.dir('Installers')), before, 'record moved a ref or left a worktree behind');
  const line = JSON.parse(readFileSync(join(ws.sbDir(), FILES.ratchetLedger), 'utf8').trim());
  assert.equal(line.commit, sha);
  assert.equal(line.leg, LEG);
  assert.deepEqual(line.gates, GATES);
  assert.equal(line.gatesDigest, 'sha256:g');
  const ok = signedCheck(ws);
  assert.equal(ok.status, 'pass', [...ok.findings, ...ok.notChecked].join('\n'));
});

test('--record: a failing stub run records the regression and proposes a revert, pushing nothing', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  writeFileSync(join(ws.sbDir(), 'OVERLAY_MARKER'), 'x\n');
  const sha = ws.commit('Installers', { 'internal/dlp/r.go': 'package dlp\n' }, undefined, '2026-10-02T10:00:00Z', 'dlp: widen a pattern');
  const res = recordRun(ws, stub(t), { STUB_EXIT: '1', STUB_GATES: 'ratchet=FAIL,parity-ratchet=PASS' });
  assert.equal(res.status, 'fail');
  assert.match(res.findings.join('\n'), new RegExp(`REGRESSION at ${sha.slice(0, 12)} \\(dlp: widen a pattern\\): ratchet: row dd1-x lost tier-correctness.*git revert ${sha}. Nothing was pushed`));
  const after = signedCheck(ws);
  assert.match(after.findings.join('\n'), /recorded a regression/);
});

test('--record: an inconsistent or merged-series report records nothing', (t) => {
  const ws = makeWorkspace(FX);
  t.after(() => ws.cleanup());
  writeFileSync(join(ws.sbDir(), 'OVERLAY_MARKER'), 'x\n');
  ws.commit('Installers', { 'internal/policyeval/r.go': 'package policyeval\n' });
  const incon = recordRun(ws, stub(t), { STUB_EXIT: '0', STUB_GATES: 'ratchet=FAIL,parity-ratchet=PASS' });
  assert.match(incon.errors.join('\n'), /exited 0 but ratchet did not PASS/);
  const merged = recordRun(ws, stub(t), { STUB_EXIT: '0', STUB_GATES: 'ratchet=PASS,parity-ratchet=PASS', STUB_MERGED: '1' });
  assert.match(merged.errors.join('\n'), /readiness series/);
  assert.equal(readFileSync(join(ws.sbDir(), FILES.ratchetLedger), 'utf8').trim(), '', 'a record was appended');
});
