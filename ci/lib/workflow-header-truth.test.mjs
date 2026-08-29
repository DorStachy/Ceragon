#!/usr/bin/env node
// @workspace-check workflow-header-truth-selftest
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./workflow-header-truth.mjs', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'workflow-header-truth-'));

function run(name, body) {
  const path = join(scratch, name);
  writeFileSync(path, body);
  return spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
}

try {
  const stale = run(
    'holdout-score.yml',
    [
      'name: holdout',
      '# This runs on PUSH TO MAIN and NIGHTLY.',
      'on:',
      '  workflow_dispatch: {}',
      '  schedule:',
      "    - cron: '17 3 * * *'",
      'jobs: {}',
      '',
    ].join('\n'),
  );
  assert.equal(stale.status, 1);
  assert.match(
    stale.stderr,
    /holdout-score\.yml:2 claims a push trigger; on: at :3 has none/,
  );

  const future = run(
    'future.yml',
    [
      'name: future',
      '# WHEN T-M2 LANDS: add `pull_request:` to the triggers.',
      'on:',
      '  workflow_dispatch: {}',
      'jobs: {}',
      '',
    ].join('\n'),
  );
  assert.equal(future.status, 0, future.stderr);

  const accurate = run(
    'accurate.yml',
    [
      'name: accurate',
      '# This runs on push to main and manual dispatch.',
      'on:',
      '  push:',
      '    branches: [main]',
      '  workflow_dispatch: {}',
      'jobs: {}',
      '',
    ].join('\n'),
  );
  assert.equal(accurate.status, 0, accurate.stderr);

  process.stdout.write('workflow-header-truth self-test: PASS\n');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
