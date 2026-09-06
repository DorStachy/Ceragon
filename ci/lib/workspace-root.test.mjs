#!/usr/bin/env node
/**
 * MUTATION PROOF for `workspace-root.mjs`.
 *
 * Four checks now ask this module where the other repositories are, so a wrong
 * answer here does not produce an error -- it produces a check that compares the
 * wrong trees, or reports a file missing that is not. Each resolution step is
 * therefore exercised against a workspace built on disk, including the two that
 * a normal run never reaches: the upward walk, and the refusal.
 *
 *   node ci/lib/workspace-root.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { COMPONENT_REPOS, findWorkspaceRoot, looksLikeWorkspace, presentRepos, workspaceRootOr } from './workspace-root.mjs';

let failures = 0;
let cases = 0;

function assert(condition, message) {
  cases += 1;
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures += 1;
  }
}

/** A directory that looks like this workspace: the manifest plus one component. */
function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'workspace-root-'));
  mkdirSync(join(root, 'ci'), { recursive: true });
  writeFileSync(join(root, 'ci', 'gates.json'), '{"repos":{}}', 'utf8');
  mkdirSync(join(root, 'Backend'), { recursive: true });
  return root;
}

console.log('case 1: what makes a directory a workspace');
{
  const ws = makeWorkspace();
  assert(looksLikeWorkspace(ws), 'ci/gates.json plus one component checkout');
  assert(presentRepos(ws).length === 1, 'and it reports which components it found');

  const manifestOnly = mkdtempSync(join(tmpdir(), 'workspace-root-'));
  mkdirSync(join(manifestOnly, 'ci'), { recursive: true });
  writeFileSync(join(manifestOnly, 'ci', 'gates.json'), '{}', 'utf8');
  assert(
    !looksLikeWorkspace(manifestOnly),
    'the manifest ALONE is not enough — that is every worktree, and mistaking one for a workspace is the bug this module exists for'
  );

  const reposOnly = mkdtempSync(join(tmpdir(), 'workspace-root-'));
  mkdirSync(join(reposOnly, 'Backend'), { recursive: true });
  assert(!looksLikeWorkspace(reposOnly), 'a stray Backend directory alone is not a workspace either');

  rmSync(ws, { recursive: true, force: true });
  rmSync(manifestOnly, { recursive: true, force: true });
  rmSync(reposOnly, { recursive: true, force: true });
}

console.log('\ncase 2: the override wins, and a bad override is an ERROR');
{
  const ws = makeWorkspace();
  const found = findWorkspaceRoot({ start: tmpdir(), env: ws });
  assert(found.root === resolve(ws), 'CERAGON_WORKSPACE_ROOT is used when it names a workspace');
  assert(found.how === 'CERAGON_WORKSPACE_ROOT', 'and the report says the override supplied it');

  const nowhere = findWorkspaceRoot({ start: ws, env: join(ws, 'no-such-dir') });
  assert(nowhere.root === null, 'an override pointing at nothing does NOT silently fall through');
  assert(/does not exist/.test(nowhere.reason), 'and the reason says so');

  const notAWorkspace = findWorkspaceRoot({ start: ws, env: tmpdir() });
  assert(notAWorkspace.root === null, 'an override pointing at a directory that is not a workspace fails too');
  assert(/not a workspace/.test(notAWorkspace.reason), 'and says which markers were missing');

  rmSync(ws, { recursive: true, force: true });
}

console.log('\ncase 3: the upward walk');
{
  const ws = makeWorkspace();
  const deep = join(ws, 'Backend', 'src', 'nested');
  mkdirSync(deep, { recursive: true });
  const found = findWorkspaceRoot({ start: deep, env: '' });
  assert(found.root === ws, 'a nested starting point walks up to the workspace');
  assert(/walked up/.test(found.how), 'and the report says it walked');

  const itself = findWorkspaceRoot({ start: ws, env: '' });
  assert(itself.root === ws, 'a starting point that IS the workspace is used directly');
  assert(/runs from/.test(itself.how), 'and is reported as such rather than as a walk');

  rmSync(ws, { recursive: true, force: true });
}

console.log('\ncase 4: the main worktree of a linked worktree');
{
  // The case the whole module was written for, built out of real git objects:
  // a workspace holding a repo, a linked worktree of that repo somewhere else,
  // and a resolution that has to cross from one to the other.
  const ws = makeWorkspace();
  const repo = join(ws, 'meta');
  mkdirSync(repo, { recursive: true });
  const git = (args, cwd) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.invalid'], repo);
  git(['config', 'user.name', 'test'], repo);
  mkdirSync(join(repo, 'ci'), { recursive: true });
  writeFileSync(join(repo, 'ci', 'gates.json'), '{}', 'utf8');
  git(['add', '-A'], repo);
  git(['commit', '-qm', 'init'], repo);
  // The component checkouts sit BESIDE the main worktree and are not tracked by
  // it — that is the real layout, and the reason a worktree cannot see them.
  mkdirSync(join(repo, 'Backend'), { recursive: true });

  // The linked worktree carries ci/gates.json and NO component repos — which is
  // exactly the shape that used to be mistaken for a workspace. `--detach`
  // because `main` is already checked out in the main worktree.
  const linked = join(mkdtempSync(join(tmpdir(), 'workspace-root-wt-')), 'wt');
  git(['worktree', 'add', '-q', '--detach', linked, 'main'], repo);
  assert(!looksLikeWorkspace(linked), 'the linked worktree is correctly NOT a workspace');

  const found = findWorkspaceRoot({ start: linked, env: '' });
  assert(found.root === repo, `resolution crosses to the main worktree (saw ${found.root})`);
  assert(/main worktree/.test(found.how), 'and says it derived it from the main worktree');

  git(['worktree', 'remove', '--force', linked], repo);
  rmSync(ws, { recursive: true, force: true });
}

console.log('\ncase 5: no workspace anywhere');
{
  const barren = mkdtempSync(join(tmpdir(), 'workspace-root-'));
  const none = findWorkspaceRoot({ start: barren, env: '' });
  assert(none.root === null, 'nothing is invented when there is no workspace');
  assert(none.reason.includes('ci/gates.json'), 'the reason names what was looked for');
  assert(
    COMPONENT_REPOS.every((r) => none.reason.includes(r)),
    'and lists every component checkout it would have accepted'
  );

  const fell = workspaceRootOr('/fallback', { start: barren, env: '' });
  assert(fell.root === '/fallback', 'workspaceRootOr hands back the caller’s own answer');
  assert(fell.fellBack === true, 'and FLAGS that it did, so a caller can say so');
  assert(/fallback:/.test(fell.how), 'the reason travels with it rather than being swallowed');

  rmSync(barren, { recursive: true, force: true });
}

console.log(`\n${cases - failures} of ${cases} assertions held`);
console.log(failures === 0 ? 'workspace-root.test: PASS' : 'workspace-root.test: FAIL');
process.exit(failures === 0 ? 0 : 1);
