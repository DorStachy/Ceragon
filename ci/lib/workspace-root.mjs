/**
 * WHERE THE OTHER REPOS ARE.
 *
 * Every check under `ci/lib/` that is worth having looks at more than one
 * checkout at once — that is the whole reason they live here instead of inside
 * a repo's own CI. So each of them needs an answer to one question: given this
 * script's location, where is the workspace that holds `Backend/`, `Frontend/`,
 * `Installers/` and the rest?
 *
 * `resolve(__dirname, '..', '..')` was that answer, and it is right exactly
 * once: when the script runs from the workspace's own checkout. Run the same
 * script from a git WORKTREE of the workspace meta-repo — which is how every
 * agent in this programme works — and it resolves to a directory that carries
 * `ci/` and `packages/` and NO component repos at all, because those are
 * separate repositories that a worktree of the meta-repo does not clone.
 *
 * What that produced, measured on 2026-09-06 from C:\cwt\p47b-root:
 *
 *   node ci/lib/drift.mjs   ->  7 x "no workflows readable on origin/main --
 *                               run: git -C Backend fetch origin"
 *   node ci/lib/claim-contract.mjs
 *                           ->  "renderer entries: ABSENT — the file does not
 *                               exist", while the renderer sits on main in the
 *                               live Installers checkout carrying 15 entries.
 *
 * Both of those are a guard reporting a fact about its own invocation as though
 * it were a fact about the tree. drift's advice ("fetch origin") names a cause
 * that is not the cause. claim-contract's ABSENT is worse: it is the exact
 * "measurement nobody took" this workspace keeps failing on, and it was being
 * printed about a file that exists.
 *
 * THE RESOLUTION ORDER, and why each step is there:
 *
 *   1. CERAGON_WORKSPACE_ROOT — an explicit answer always wins. Pointing it at
 *      something that is not a workspace is an ERROR, never a silent fallback:
 *      an override that quietly degrades to "unmeasured" is the defect this
 *      module exists to end, wearing a different hat.
 *   2. The starting directory itself, when the component repos are beside it.
 *      This is the ordinary live-checkout case and it stays first among the
 *      guesses, so nothing changes for anyone running from the real workspace.
 *   3. The MAIN worktree of the meta-repo. `git rev-parse --git-common-dir` from
 *      a linked worktree points at the main checkout's `.git`, and the parent of
 *      that is the live workspace — the one place the component repos are known
 *      to be cloned. This is a derivation, not a guess.
 *   4. A walk upward, for a nested layout neither of the above covers.
 *
 * When none of them answers, the caller is handed `{ root: null, reason }` and
 * must print the reason and fail. There is no step that returns a plausible
 * directory it has not verified.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The component checkouts a workspace is expected to hold. */
export const COMPONENT_REPOS = [
  'Backend',
  'Frontend',
  'Installers',
  'Ceragon-Intelligence',
  'GithubApp-Bot-Scanner-Worker',
  'Sandbox-Worker',
  'Static-Worker',
  'docs',
];

/** `ci/lib` -> `ci` -> the meta-repo checkout this file belongs to. */
export const META_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A workspace is a directory that carries the meta-repo's own `ci/gates.json`
 * AND at least one component checkout. Both halves matter: the manifest alone
 * is true of every worktree (which is the bug), and a component directory alone
 * would match some unrelated parent.
 */
export function looksLikeWorkspace(dir) {
  if (!dir || !existsSync(resolve(dir, 'ci', 'gates.json'))) return false;
  return COMPONENT_REPOS.some((repo) => isDir(resolve(dir, repo)));
}

/** Which of the component checkouts `dir` actually holds. */
export function presentRepos(dir) {
  return COMPONENT_REPOS.filter((repo) => isDir(resolve(dir, repo)));
}

/** The main worktree of the git repository containing `start`, or null. */
function mainWorktreeOf(start) {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!commonDir) return null;
    const abs = resolve(start, commonDir);
    // `<checkout>/.git` -> `<checkout>`. Anything else is not a worktree layout
    // this can reason about, so it declines rather than guessing.
    return /[\\/]\.git$/.test(abs) ? dirname(abs) : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.start] Where to start looking. Defaults to the meta-repo
 *   checkout this file lives in.
 * @param {string} [opts.env] The override value. Defaults to
 *   `process.env.CERAGON_WORKSPACE_ROOT`.
 * @returns {{root: string, how: string} | {root: null, reason: string}}
 */
export function findWorkspaceRoot(opts = {}) {
  const start = opts.start ?? META_ROOT;
  const override = opts.env ?? process.env.CERAGON_WORKSPACE_ROOT;

  if (override && override.trim()) {
    const root = resolve(override.trim());
    if (!existsSync(root)) {
      return { root: null, reason: `CERAGON_WORKSPACE_ROOT=${override} does not exist` };
    }
    if (!looksLikeWorkspace(root)) {
      return {
        root: null,
        reason:
          `CERAGON_WORKSPACE_ROOT=${override} is not a workspace: it needs ci/gates.json ` +
          `and at least one of ${COMPONENT_REPOS.join(', ')}`,
      };
    }
    return { root, how: 'CERAGON_WORKSPACE_ROOT' };
  }

  if (looksLikeWorkspace(start)) {
    return { root: start, how: 'the checkout this script runs from' };
  }

  const main = mainWorktreeOf(start);
  if (main && main !== start && looksLikeWorkspace(main)) {
    return { root: main, how: `the main worktree of this repo (git rev-parse --git-common-dir) at ${main}` };
  }

  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
    if (looksLikeWorkspace(dir)) {
      return { root: dir, how: `walked up from ${start} to ${dir}` };
    }
  }

  return {
    root: null,
    reason:
      `no workspace found from ${start}. Looked at: the directory itself, the main ` +
      'worktree of this repo, then every parent. A workspace carries ci/gates.json and ' +
      `at least one of ${COMPONENT_REPOS.join(', ')}. Set CERAGON_WORKSPACE_ROOT to name one.`,
  };
}

/**
 * The same answer for callers that would otherwise keep their old behaviour: a
 * resolved workspace when there is one, and the fallback when there is not. The
 * fallback is RETURNED, not hidden — `how` says which one you got, so a caller
 * can still print it.
 */
export function workspaceRootOr(fallback, opts = {}) {
  const found = findWorkspaceRoot(opts);
  if (found.root) return found;
  return { root: fallback, how: `fallback: ${fallback} (${found.reason})`, fellBack: true };
}
