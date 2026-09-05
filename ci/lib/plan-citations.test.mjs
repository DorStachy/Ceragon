// @workspace-check plan-citation-resolver-selftest
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = mkdtempSync(join(tmpdir(), 'citation-resolver-'));
const repo = join(root, 'Installers'); mkdirSync(repo);
const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
mkdirSync(join(repo, 'internal', 'dlp'), { recursive: true });
writeFileSync(join(repo, 'internal', 'dlp', 'dlp.go'), 'one\ntwo\n'); git('add', '.'); git('commit', '-qm', 'fixture');
git('branch', '-M', 'main'); git('remote', 'add', 'origin', repo); git('fetch', '-q', 'origin', 'main:refs/remotes/origin/main');
const plan = join(root, 'plan.md'); writeFileSync(plan, '`Installers/internal/dlp/dlp.go:1519`\n');
const run = spawnSync(process.execPath, ['ci/lib/plan-citations.mjs', plan, root], { encoding: 'utf8' });
if (run.status === 0 || !`${run.stderr}${run.stdout}`.includes('past EOF: internal/dlp/dlp.go has 2 lines')) throw new Error('past-EOF defeat did not go RED');
console.log('plan-citation-resolver self-test: PASS');
