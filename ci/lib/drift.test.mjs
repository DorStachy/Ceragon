import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkRepo } from './drift.mjs';

function workflow(jobs, trigger = 'push') {
  return JSON.stringify({ on: { [trigger]: {} }, jobs: Object.fromEntries(jobs.map(name => [name, {
    'runs-on': 'ubuntu-latest', steps: [{ run: 'echo synthetic-fixture' }],
  }])) });
}

function fixture(t, baseJobs = ['base'], extra = {}) {
  const parent = resolve(tmpdir());
  const root = mkdtempSync(join(parent, 'ceragon-drift-fixture-'));
  const repo = join(root, 'component');
  mkdirSync(join(repo, '.github/workflows'), { recursive: true });
  t.after(() => {
    if (!resolve(root).startsWith(parent + sep) || !root.includes('ceragon-drift-fixture-')) {
      throw new Error('Refusing unexpected fixture cleanup path');
    }
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (name, text) => writeFileSync(join(repo, `.github/workflows/${name}.yml`), text);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Drift fixture');
  git('config', 'user.email', 'drift-fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  write('build', workflow(baseJobs));
  for (const [name, text] of Object.entries(extra)) write(name, text);
  git('add', '.');
  git('commit', '-m', 'Synthetic upstream');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '-b', 'candidate');
  const check = (mirrored, cannotMirror = {}) => checkRepo('Fixture', true, {
    root, manifest: { repos: { Fixture: { path: 'component', mirrored, cannotMirror } } },
  });
  return { git, write, check };
}

test('a real selected working-tree job is explicitly candidate-only', t => {
  const f = fixture(t);
  f.write('build', workflow(['base', 'checks_only']));
  const result = f.check({ 'build:base': {}, 'build:checks_only': {} });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.candidateOnly.map(row => [row.id, row.source]), [['build:checks_only', 'working-tree']]);
  assert.deepEqual(result.cost.map(row => row.id), ['build:base']);
});

test('a mapped job absent from upstream and the selected candidate still fails', t => {
  const f = fixture(t);
  f.write('build', workflow(['base', 'different_job']));
  const result = f.check({ 'build:base': {}, 'build:removed': {} });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].msg, /build:removed.*neither origin\/main nor the selected candidate/);
  assert.deepEqual(result.candidateOnly, []);
});

test('an untouched stale checkout cannot resurrect a job removed from main', t => {
  const f = fixture(t, ['base', 'retired']);
  f.git('checkout', 'main');
  f.write('build', workflow(['base']));
  f.git('add', '.');
  f.git('commit', '-m', 'Remove retired upstream gate');
  f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  f.git('checkout', 'candidate');
  const result = f.check({ 'build:base': {}, 'build:retired': {} });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].msg, /build:retired/);
  assert.deepEqual(result.candidateOnly, []);
});

test('candidate acceptance preserves all upstream coverage, including manual-only jobs', t => {
  const f = fixture(t, ['base', 'uncovered_upstream'], { manual: workflow(['manual_gate'], 'workflow_dispatch') });
  // The candidate even omits an upstream gate: upstream must remain audited.
  f.write('build', workflow(['base', 'checks_only']));
  const result = f.check({ 'build:base': {}, 'build:checks_only': {} });
  assert.equal(result.problems.length, 2);
  assert.ok(result.problems.some(problem => problem.msg.includes('build:uncovered_upstream')));
  assert.ok(result.problems.some(problem => problem.msg.includes('manual:manual_gate')));
  assert.equal(result.candidateOnly[0].id, 'build:checks_only');
  const covered = f.check({ 'build:base': {}, 'build:checks_only': {} }, {
    'build:uncovered_upstream': 'Synthetic reason', 'manual:manual_gate': 'Synthetic reason',
  });
  assert.deepEqual(covered.problems, []);
});

test('invalid candidate YAML cannot satisfy a mirrored entry', t => {
  const f = fixture(t);
  f.write('build', 'jobs: [unterminated');
  const result = f.check({ 'build:base': {}, 'build:checks_only': {} });
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].msg, /candidate workflow does not parse/);
  assert.deepEqual(result.candidateOnly, []);
});
