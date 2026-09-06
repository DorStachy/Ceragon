#!/usr/bin/env node
/**
 * PLAN CITATION RESOLVER. (M4.7A Wave -1 Task 4's defeat test.)
 *
 * ── What this exists to catch ────────────────────────────────────────────────
 *
 * The plan is 12,495 lines and it argues from evidence: nearly every claim in it
 * points at a file and a line. Two things go wrong with that, and both of them
 * are silent.
 *
 *   1. A BARE BASENAME. `main.ts:429`, `constants.ts:150-165`, `server.go:365`.
 *      There are four `main.ts` files in this workspace and eleven `constants.ts`.
 *      A reader cannot check the claim, and neither can a script, so the claim
 *      is unfalsifiable in practice while looking like the most precise kind of
 *      evidence there is.
 *   2. A LINE NUMBER THAT DRIFTED. The plan's own Task 4 says
 *      `dlp.go:1519-1520` is `func Redact`. On origin/main today `func Redact`
 *      is at line 1541, and the plan's expected failure message for THIS script
 *      says the file "has 1510 lines" when it has 1572. Every one of those was
 *      true when it was written. That is the point: a line number is a claim
 *      with an expiry date and nothing was checking it.
 *
 * So: every `path:line` and `path:line-line` citation must carry a REPO
 * QUALIFIER, and the line must exist in that repo's `origin/main`.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────
 *
 * It does not check that the cited line SAYS what the plan claims it says. It
 * cannot; that is a reading, not a measurement. `line <= EOF` plus a qualifier
 * is the part a machine can hold, and the plan's own remedy for the rest is the
 * one this file recommends in its output: cite a SYMBOL and a `git grep -n`
 * that returns one hit, because a symbol does not drift when a file grows.
 *
 * Two categories are reported and NOT gated, each with its reason printed, so
 * that nobody reads a green run as covering them:
 *
 *   - FENCED BLOCKS. A ```-fenced block holds commands and transcripts. `grep`
 *     output legitimately contains `file.go:123:` and is not a citation.
 *   - BARE `:NN` FRAGMENTS. The plan writes "`holdout-score.yml:6` and `:13`".
 *     A fragment carries no path of its own; guessing which file it continues
 *     is exactly the kind of inference this instrument refuses to make. They are
 *     COUNTED and reported as NOT MEASURED.
 *
 * ── Where the other repos come from ──────────────────────────────────────────
 *
 * `ci/lib/workspace-root.mjs`. Run from a worktree of the workspace meta-repo,
 * the component checkouts are not beside this script -- they are separate
 * repositories -- so the resolver finds the workspace the worktree belongs to
 * and reads `origin/main` from there. A missing checkout is exit 2, NOT a pass:
 * a citation nobody could resolve is not a citation that resolved.
 *
 *   node ci/lib/plan-citations.mjs            # the plan
 *   node ci/lib/plan-citations.mjs --all      # every occurrence, not a summary
 *   node ci/lib/plan-citations.mjs <file.md>  # any other document
 *
 * EXIT CODES
 *   0  every citation carries a qualifier and resolves within its file
 *   1  at least one does not
 *   2  the question could not be asked (no workspace, no checkout, no origin/main)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { COMPONENT_REPOS, META_ROOT, findWorkspaceRoot } from './workspace-root.mjs';

export const PLAN = join(META_ROOT, '.plans', 'm47a-20260822', 'M47A_IMPLEMENTATION_PLAN.md');

/**
 * Top-level directories of the workspace meta-repo itself. A citation into one
 * of these is qualified: there is exactly one place it can mean.
 */
export const META_DIRS = ['ci', '.plans', 'packages', 'scripts', 'fixtures', 'legal'];

export const EXIT = { OK: 0, VIOLATION: 1, NOT_MEASURED: 2 };

/**
 * A citation is `<path><colon><line>` or `<path><colon><line>-<line>`, where the
 * path's last segment carries a file extension. The extension is what keeps
 * this off section numbers, ratios and clock times, all of which are `n:n`.
 *
 * The lookbehind stops the regex from matching the tail of a longer path, so
 * `Installers/internal/dlp/dlp.go:12` is one citation and not also `dlp.go:12`.
 */
const CITATION = /(?<![A-Za-z0-9_./\\-])([A-Za-z0-9_.][A-Za-z0-9_./-]*\.[A-Za-z0-9]{1,6}):(\d+)(?:-(\d+))?(?![0-9])/g;

/** `plan:15290` — a self-reference, written without backticks throughout. */
const PLAN_REF = /(?<![A-Za-z0-9_./-])plan:(\d+)(?:-(\d+))?(?![0-9])/g;

/** A line number with no path: "`:6` and `:13`". Counted, never guessed at. */
const FRAGMENT = /`:(\d+)(?:-(\d+))?`/g;

/** Inline code spans. Citations live in these; prose mentions the plan itself. */
const CODE_SPAN = /`([^`\n]+)`/g;

/**
 * Pull every citation out of a document.
 *
 * @returns {{citations: object[], fenced: number, fragments: number}}
 */
export function extractCitations(text) {
  const lines = text.split(/\r?\n/);
  const citations = [];
  let fenced = 0;
  let fragments = 0;
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      // Counted, not scanned. A fenced block is commands and transcripts, and a
      // backtick inside one is a shell quote rather than a code span -- so the
      // raw line is scanned ONCE. Counting the spans as well double-counted
      // every fenced citation, which is a small lie in the one number that says
      // how much this instrument did not look at.
      for (const _ of line.matchAll(CITATION)) fenced += 1;
      continue;
    }

    for (const m of line.matchAll(FRAGMENT)) {
      void m;
      fragments += 1;
    }

    for (const span of line.matchAll(CODE_SPAN)) {
      const inner = span[1];
      // A URL is not a file citation, and `https://x/y.md:12` would look like
      // one. Skipping the whole span is right: a span holding a URL is a link.
      if (inner.includes('://')) continue;
      for (const m of inner.matchAll(CITATION)) {
        citations.push({
          raw: m[0],
          path: m[1],
          start: Number(m[2]),
          end: m[3] ? Number(m[3]) : Number(m[2]),
          planLine: lineNo,
        });
      }
    }

    // `plan:NNN` is written as prose, not as code, so it is scanned on the raw
    // line. Backticked forms are caught here too and de-duplicated by position.
    for (const m of line.matchAll(PLAN_REF)) {
      citations.push({
        raw: m[0],
        path: 'plan',
        start: Number(m[1]),
        end: m[2] ? Number(m[2]) : Number(m[1]),
        planLine: lineNo,
      });
    }
  }

  return { citations, fenced, fragments };
}

/**
 * Which repository does this path name?
 *
 * @returns {{kind:'plan'} | {kind:'component', repo:string, rest:string}
 *   | {kind:'meta', rest:string} | {kind:'unqualified'}}
 */
export function classify(path) {
  if (path === 'plan') return { kind: 'plan' };
  const segments = path.split('/');
  if (segments.length > 1) {
    const head = segments[0];
    if (COMPONENT_REPOS.includes(head)) {
      return { kind: 'component', repo: head, rest: segments.slice(1).join('/') };
    }
    if (META_DIRS.includes(head)) return { kind: 'meta', rest: path };
  }
  return { kind: 'unqualified' };
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Line count of a text, not counting a trailing newline as a line of its own. */
export function lineCount(text) {
  if (text === '') return 0;
  const parts = text.split(/\r?\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

/**
 * Reads one file's length, from `origin/main` where there is one.
 *
 * `alsoTry` exists for the workspace meta-repo. Its `.plans/` tree carries files
 * that were never committed -- evidence written during a run and left in the
 * working directory -- so a WORKTREE of that repo does not have them while the
 * workspace checkout does. Reporting those citations as dead would be false: the
 * file is there, in the checkout the plan was written from. Both places are
 * searched and the answer says which one supplied it.
 *
 * @returns {{lines:number, source:string} | {error:string}}
 */
function readTarget(repoPath, relPath, { hasOriginMain, alsoTry = [] }) {
  if (hasOriginMain) {
    const shown = git(repoPath, ['show', `origin/main:${relPath}`]);
    if (shown !== null) return { lines: lineCount(shown), source: 'origin/main' };
  }
  for (const root of [repoPath, ...alsoTry]) {
    const abs = join(root, relPath);
    if (existsSync(abs)) {
      return {
        lines: lineCount(readFileSync(abs, 'utf8')),
        source: root === repoPath ? 'working tree' : `working tree of ${root}`,
      };
    }
  }
  const searched = [repoPath, ...alsoTry].join(' or ');
  return {
    error: hasOriginMain
      ? `not on origin/main and not in the working tree of ${searched}`
      : `not in the working tree of ${searched} (this repo has no origin/main)`,
  };
}

/**
 * The whole check.
 *
 * @param {object} opts
 * @param {string} [opts.planPath]      Document to scan.
 * @param {string} [opts.workspaceRoot] Where the component checkouts are.
 * @param {string} [opts.metaRoot]      The workspace meta-repo checkout.
 * @param {boolean} [opts.all]          Print every occurrence, not a summary.
 */
export function check(opts = {}) {
  const planPath = opts.planPath ?? PLAN;
  const metaRoot = opts.metaRoot ?? META_ROOT;
  const out = [];

  if (!existsSync(planPath)) {
    return {
      status: 'NOT MEASURED',
      exit: EXIT.NOT_MEASURED,
      lines: [`NOT MEASURED: no document at ${planPath}`],
      counts: null,
    };
  }

  let workspaceRoot = opts.workspaceRoot;
  if (!workspaceRoot) {
    const found = findWorkspaceRoot();
    if (!found.root) {
      return {
        status: 'NOT MEASURED',
        exit: EXIT.NOT_MEASURED,
        lines: [
          'NOT MEASURED: the component checkouts could not be found, so no citation was resolved.',
          `  ${found.reason}`,
          '  This is exit 2 and NOT a pass. A citation nobody could resolve is not a citation that resolved.',
        ],
        counts: null,
      };
    }
    workspaceRoot = found.root;
    out.push(`workspace: ${found.root}  (${found.how})`);
  } else {
    out.push(`workspace: ${workspaceRoot}  (given)`);
  }

  const text = readFileSync(planPath, 'utf8');
  const planLines = lineCount(text);
  const { citations, fenced, fragments } = extractCitations(text);

  // Which repos are on disk, and which of those have an origin/main. Both are
  // measured once, up front: a missing checkout must stop the run rather than
  // turn into a pile of "unresolvable" citations that read like plan defects.
  const repoState = new Map();
  const missing = [];
  for (const repo of COMPONENT_REPOS) {
    const path = resolve(workspaceRoot, repo);
    if (!existsSync(path)) {
      missing.push(repo);
      continue;
    }
    repoState.set(repo, {
      path,
      hasOriginMain: git(path, ['rev-parse', '--verify', 'origin/main']) !== null,
    });
  }
  repoState.set('(workspace)', {
    path: metaRoot,
    hasOriginMain: git(metaRoot, ['rev-parse', '--verify', 'origin/main']) !== null,
  });

  const usedRepos = new Set();
  for (const c of citations) {
    const cls = classify(c.path);
    if (cls.kind === 'component') usedRepos.add(cls.repo);
  }
  const missingUsed = missing.filter((r) => usedRepos.has(r));
  if (missingUsed.length) {
    return {
      status: 'NOT MEASURED',
      exit: EXIT.NOT_MEASURED,
      lines: [
        ...out,
        `NOT MEASURED: ${missingUsed.join(', ')} ${missingUsed.length === 1 ? 'is' : 'are'} cited by ` +
          `the plan but not checked out under ${workspaceRoot}.`,
        '  This is exit 2 and NOT a pass.',
      ],
      counts: null,
    };
  }

  const problems = { unqualified: [], unresolvable: [], pastEOF: [] };
  const workingTreeOnly = [];
  const cache = new Map();

  for (const c of citations) {
    const cls = classify(c.path);

    if (cls.kind === 'unqualified') {
      problems.unqualified.push(c);
      continue;
    }

    let key;
    let repoLabel;
    let repoPath;
    let relPath;
    let hasOriginMain;

    if (cls.kind === 'plan') {
      key = 'plan';
      repoLabel = 'plan';
      relPath = planPath;
    } else if (cls.kind === 'meta') {
      const state = repoState.get('(workspace)');
      key = `(workspace)/${cls.rest}`;
      repoLabel = '(workspace)';
      repoPath = state.path;
      relPath = cls.rest;
      hasOriginMain = state.hasOriginMain;
    } else {
      const state = repoState.get(cls.repo);
      key = `${cls.repo}/${cls.rest}`;
      repoLabel = cls.repo;
      repoPath = state.path;
      relPath = cls.rest;
      hasOriginMain = state.hasOriginMain;
    }

    let target = cache.get(key);
    if (target === undefined) {
      target =
        cls.kind === 'plan'
          ? { lines: planLines, source: 'this document' }
          : readTarget(repoPath, relPath, {
              hasOriginMain,
              // The meta-repo's uncommitted evidence lives in the workspace
              // checkout, not in a worktree of it. See readTarget.
              alsoTry: cls.kind === 'meta' && repoPath !== workspaceRoot ? [workspaceRoot] : [],
            });
      cache.set(key, target);
    }

    if (target.error) {
      problems.unresolvable.push({ ...c, repoLabel, relPath, reason: target.error });
      continue;
    }
    if (target.source === 'working tree' && cls.kind === 'component') {
      workingTreeOnly.push({ ...c, repoLabel, relPath });
    }
    const worst = Math.max(c.start, c.end);
    if (worst > target.lines) {
      problems.pastEOF.push({ ...c, repoLabel, relPath, eof: target.lines });
    }
  }

  const show = (list, render) => {
    if (opts.all) {
      for (const item of list) out.push(render(item));
      return;
    }
    // Grouped by the thing that has to be FIXED -- the path -- with the plan
    // lines that carry it. A list of 300 identical complaints is not a report.
    const groups = new Map();
    for (const item of list) {
      const k = `${item.path}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(item);
    }
    for (const [, items] of groups) {
      out.push(render(items[0], items));
    }
  };

  const where = (items) =>
    items.length === 1
      ? `plan:${items[0].planLine}`
      : `${items.length}x, plan:${items
          .slice(0, 5)
          .map((i) => i.planLine)
          .join(', ')}${items.length > 5 ? ', …' : ''}`;

  if (problems.unqualified.length) {
    out.push('');
    out.push('UNQUALIFIED — no repository, so nobody can check the claim:');
    show(problems.unqualified, (c, items = [c]) => `  ${c.raw.padEnd(52)} ${where(items)}`);
  }

  if (problems.unresolvable.length) {
    out.push('');
    out.push('UNRESOLVABLE — the file is not there:');
    show(
      problems.unresolvable,
      (c, items = [c]) => `  ${c.path.padEnd(52)} ${where(items)} — ${c.reason}`,
    );
  }

  if (problems.pastEOF.length) {
    out.push('');
    out.push('PAST EOF — the line does not exist in the file:');
    show(
      problems.pastEOF,
      (c, items = [c]) =>
        `  ${c.raw.padEnd(52)} ${where(items)} — past EOF: ${c.relPath} has ${c.eof} lines`,
    );
  }

  if (workingTreeOnly.length) {
    out.push('');
    out.push(
      `NOT ON origin/main (${workingTreeOnly.length}) — resolved from the working tree instead. ` +
        'Reported, not gated: a plan may cite work that has not merged yet.',
    );
    show(workingTreeOnly, (c, items = [c]) => `  ${c.path.padEnd(52)} ${where(items)}`);
  }

  const counts = {
    total: citations.length,
    unqualified: problems.unqualified.length,
    unresolvable: problems.unresolvable.length,
    pastEOF: problems.pastEOF.length,
    fenced,
    fragments,
    workingTreeOnly: workingTreeOnly.length,
  };

  out.push('');
  out.push(`document: ${planPath} (${planLines} lines)`);
  out.push(
    `citations: ${counts.total} resolved against origin/main   ` +
      `unqualified: ${counts.unqualified}   unresolvable: ${counts.unresolvable}   ` +
      `past EOF: ${counts.pastEOF}`,
  );
  out.push(
    `NOT MEASURED, by design: ${counts.fenced} inside fenced blocks (commands and transcripts), ` +
      `${counts.fragments} bare ":NN" fragments (no path of their own -- this does not guess ` +
      'which file they continue). Neither is a pass over them.',
  );

  const failed = counts.unqualified + counts.unresolvable + counts.pastEOF > 0;
  out.push(failed ? 'plan-citations: FAIL' : 'plan-citations: PASS');

  return {
    status: failed ? 'FAIL' : 'PASS',
    exit: failed ? EXIT.VIOLATION : EXIT.OK,
    lines: out,
    counts,
    problems,
  };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).toLowerCase().endsWith('plan-citations.mjs');
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const positional = args.filter((a) => !a.startsWith('--'));
  const result = check({ planPath: positional[0] ? resolve(positional[0]) : undefined, all });
  console.log(result.lines.join('\n'));
  process.exit(result.exit);
}
