// @workspace-check claim-contract-guard-selftest
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const plan = readFileSync('.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md', 'utf8');
let run = spawnSync(process.execPath, ['ci/lib/claim-contract.mjs'], { encoding: 'utf8' });
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const dir = mkdtempSync(join(tmpdir(), 'claim-contract-'));
const bad = join(dir, 'bad.md');
writeFileSync(bad, plan.replace('| FC-15 ', '| REMOVED '));
run = spawnSync(process.execPath, ['ci/lib/claim-contract.mjs', bad], { encoding: 'utf8' });
if (run.status === 0 || !`${run.stderr}${run.stdout}`.includes('expected 15')) throw new Error('defeat mutation did not go RED');
console.log('claim-contract-guard self-test: PASS');
