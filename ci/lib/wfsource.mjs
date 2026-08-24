/**
 * Decides WHICH version of a workflow file the local run should execute.
 *
 * This is not a detail. Every checkout in this workspace sits on a long-lived
 * feature branch, and several are months behind `origin/main` on
 * `.github/workflows` specifically. Reading the working tree naively meant, when
 * this harness was first wired up: Backend's `full_test` and
 * `migration_chain_from_empty` gates did not exist, Backend's lint lane claimed
 * Node 20 when CI runs 24, and Frontend had no `pr-checks.yml` at all -- so
 * "Tests (jest)", "Typecheck" and the em-dash gate, the three checks that
 * actually run on every Frontend PR, would have been silently absent from a
 * green local report. A mirror that under-reports is worse than no mirror.
 *
 * The rule below is GitHub's own semantics rather than a workaround. A
 * `pull_request` run executes the workflow from the MERGE of head into base, so:
 *
 *   - if your branch has not touched a workflow since it forked, the merge
 *     result is `origin/main`'s copy -- use that, no matter how old your
 *     checkout's copy is;
 *   - if your branch HAS edited that workflow, the merge result is yours -- use
 *     the working tree, uncommitted edits included, because testing a workflow
 *     change you have not committed yet is the whole point.
 *
 * Either way the choice is reported, never silent.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function git(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * @returns {{text: string, source: 'origin/main'|'working-tree', note: string}|null}
 */
export function resolveWorkflowText(repoPath, relPath) {
  const abs = join(repoPath, relPath);
  const workingTree = existsSync(abs) ? readFileSync(abs, 'utf8') : null;

  const base = git(repoPath, ['show', `origin/main:${relPath}`]);
  if (base === null) {
    if (workingTree === null) return null;
    return {
      text: workingTree,
      source: 'working-tree',
      note: 'not present on origin/main',
    };
  }
  if (workingTree === null) {
    return { text: base, source: 'origin/main', note: 'absent from this checkout' };
  }

  const mergeBase = git(repoPath, ['merge-base', 'origin/main', 'HEAD'])?.trim();
  const atFork = mergeBase ? git(repoPath, ['show', `${mergeBase}:${relPath}`]) : null;

  const norm = (s) => (s === null ? null : s.replace(/\r\n/g, '\n'));
  const branchTouchedIt = atFork === null ? true : norm(workingTree) !== norm(atFork);

  if (branchTouchedIt) {
    return {
      text: workingTree,
      source: 'working-tree',
      note: 'your branch modifies this workflow',
    };
  }
  const behind = norm(workingTree) !== norm(base);
  return {
    text: base,
    source: 'origin/main',
    note: behind ? 'your checkout is behind main here' : 'identical to your checkout',
  };
}

/** Every workflow file on origin/main, for the drift check. */
export function listWorkflowsOnMain(repoPath) {
  const out = git(repoPath, ['ls-tree', '-r', '--name-only', 'origin/main', '--', '.github/workflows']);
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /\.ya?ml$/.test(s));
}

/**
 * How far this checkout has drifted from what a PR would actually test.
 *
 * A `pull_request` run tests the MERGE of your branch into `main`, not your
 * branch tip. When the branch is behind, those are different trees and the
 * difference is not cosmetic: the first real run of this harness failed
 * Frontend's em-dash gate with "Cannot find module
 * /w/scripts/check-no-em-dash.cjs", because main's workflow calls a fence
 * script that main has and the branch does not. GitHub would have found it
 * present. Reporting that as a gate failure without saying why would send
 * somebody hunting a bug that does not exist.
 */
export function branchState(repoPath) {
  const counts = git(repoPath, ['rev-list', '--left-right', '--count', 'origin/main...HEAD']);
  if (!counts) return null;
  const [behind, ahead] = counts.trim().split(/\s+/).map(Number);
  const dirty = (git(repoPath, ['status', '--porcelain']) || '').trim().length > 0;
  return { behind, ahead, dirty, branch: (git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim() };
}

/**
 * The tree a PR would really be tested against: origin/main merged with HEAD,
 * written to the object database without touching the working tree or the
 * index. Returns null if the merge conflicts, which is itself the answer --
 * GitHub does not run checks on a PR it cannot merge.
 *
 * Committed work only. Uncommitted edits are invisible to a merge, which is
 * why this is opt-in (`--merged`) and not the default.
 */
export function mergedTree(repoPath) {
  const out = git(repoPath, ['merge-tree', '--write-tree', 'origin/main', 'HEAD']);
  if (!out) return null;
  const sha = out.split(/\r?\n/)[0].trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

export function fetchedRecently(repoPath) {
  const head = join(repoPath, '.git');
  return existsSync(head);
}
