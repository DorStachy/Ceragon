// @workspace-check standards-schema-declaration-selftest
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = JSON.parse(readFileSync('.plans/m47a-20260822/v2-waves/standards-schema-declaration.json', 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'standards-schema-'));
const check = (value, expected) => {
  const file = join(dir, `${Math.random()}.json`); writeFileSync(file, JSON.stringify(value));
  const run = spawnSync(process.execPath, ['ci/lib/standards-schema-declaration.mjs', file], { encoding: 'utf8' });
  if (run.status === 0 || !`${run.stderr}${run.stdout}`.includes(expected)) throw new Error(`defeat mutation did not reject: ${expected}`);
};
const blank = structuredClone(source); blank.system.standardsMapping.atlasRelease = ''; check(blank, 'standards mapping has no pinned ATLAS release');
const missing = structuredClone(source); delete missing.classColumns.atlasTechniques; check(missing, 'missing required class column atlasTechniques');
console.log('standards-schema-declaration self-test: PASS');
