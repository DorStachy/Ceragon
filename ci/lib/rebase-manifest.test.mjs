#!/usr/bin/env node
// @workspace-check w-1-rebase-manifest-selftest
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./rebase-manifest.mjs', import.meta.url));
const repos = [
  'Backend',
  'Frontend',
  'Installers',
  'Ceragon-Intelligence',
  'Static-Worker',
  'Sandbox-Worker',
  'GithubApp-Bot-Scanner-Worker',
];
const scratch = mkdtempSync(join(tmpdir(), 'w-1-rebase-manifest-'));
const manifest = join(scratch, 'REBASE_MANIFEST.md');

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

try {
  for (const repo of repos) {
    const dir = join(scratch, repo);
    mkdirSync(dir);
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.name', 'manifest-test');
    git(dir, 'config', 'user.email', 'manifest-test@example.invalid');
    writeFileSync(join(dir, 'README.md'), `${repo}\n`);
    git(dir, 'add', 'README.md');
    git(dir, 'commit', '-q', '-m', 'fixture');
    git(dir, 'branch', '-M', 'main');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  }

  const write = spawnSync(
    process.execPath,
    [script, '--write', '--workspace-root', scratch, '--manifest', manifest],
    { encoding: 'utf8' },
  );
  assert.equal(write.status, 0, write.stderr);
  const first = readFileSync(manifest, 'utf8');
  assert.equal(first.split(/\r?\n/).filter((line) => /^\| `[^`]+` \|/.test(line)).length, 7);

  const rewrite = spawnSync(
    process.execPath,
    [script, '--write', '--workspace-root', scratch, '--manifest', manifest],
    { encoding: 'utf8' },
  );
  assert.equal(rewrite.status, 0, rewrite.stderr);
  assert.equal(readFileSync(manifest, 'utf8'), first, 'generator must be byte-identical');

  const actual = git(join(scratch, 'Installers'), 'rev-parse', 'origin/main');
  const edited = `${actual.slice(0, -1)}${actual.endsWith('0') ? '1' : '0'}`;
  writeFileSync(
    manifest,
    first.replace(
      `| \`${actual}\` | \`${actual}\` | 0 |`,
      `| \`${actual}\` | \`${edited}\` | 0 |`,
    ),
  );
  const stale = spawnSync(
    process.execPath,
    [script, '--workspace-root', scratch, '--manifest', manifest],
    { encoding: 'utf8' },
  );
  assert.equal(stale.status, 1);
  assert.match(
    stale.stderr,
    new RegExp(`REBASE_MANIFEST\\.md is stale: Installers records ${edited} but origin/main is ${actual}`),
  );

  process.stdout.write('w-1-rebase-manifest self-test: PASS\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
