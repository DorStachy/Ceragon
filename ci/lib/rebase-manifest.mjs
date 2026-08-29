#!/usr/bin/env node
// @workspace-check w-1-rebase-manifest
/** Generate or validate the seven-repository source-authority manifest. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPOS = [
  'Backend',
  'Frontend',
  'Installers',
  'Ceragon-Intelligence',
  'Static-Worker',
  'Sandbox-Worker',
  'GithubApp-Bot-Scanner-Worker',
];

function options(argv) {
  const out = {
    write: false,
    workspaceRoot: SCRIPT_ROOT,
    manifest: join(SCRIPT_ROOT, '.plans', 'm47a-20260822', 'v2-waves', 'REBASE_MANIFEST.md'),
    fetchObservation: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--write') out.write = true;
    else if (argv[i] === '--workspace-root') out.workspaceRoot = resolve(argv[++i]);
    else if (argv[i] === '--manifest') out.manifest = resolve(argv[++i]);
    else if (argv[i] === '--fetch-observation') out.fetchObservation = resolve(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

function git(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    process.stderr.write(`${repoPath}: git ${args.join(' ')} failed\n${error.stderr || ''}`);
    process.exit(2);
  }
}

function liveRows(workspaceRoot) {
  return REPOS.map((repo) => {
    const path = join(workspaceRoot, repo);
    if (!existsSync(path)) {
      process.stderr.write(`REBASE_MANIFEST.md NOT CHECKED: missing ${path}\n`);
      process.exit(2);
    }
    return {
      repo,
      branch: git(path, ['rev-parse', '--abbrev-ref', 'HEAD']),
      head: git(path, ['rev-parse', 'HEAD']),
      originMain: git(path, ['rev-parse', 'origin/main']),
      behind: Number(git(path, ['rev-list', '--count', 'HEAD..origin/main'])),
    };
  });
}

function parseRows(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\| `([^`]+)` \| `([^`]*)` \| `([0-9a-f]{40})` \| `([0-9a-f]{40})` \| (\d+) \| (.+) \|$/,
    );
    if (!match) continue;
    rows.set(match[1], {
      repo: match[1],
      branch: match[2],
      head: match[3],
      originMain: match[4],
      behind: Number(match[5]),
      fetchMoved: match[6],
    });
  }
  return rows;
}

function render(rows, prior, observation) {
  const out = [
    '# Rebase manifest',
    '',
    '**Generated; never hand-edit.** Run `node ci/lib/rebase-manifest.mjs` to validate and',
    '`node ci/lib/rebase-manifest.mjs --write` to regenerate after a required seven-repo fetch.',
    '',
    'Every `path:line` claim in the M4.7A plan is a claim about `origin/main` at the SHA',
    'below. Resolve citations with `git show origin/main:<path>`, never from the working tree.',
    'A SHA list handed to an implementer is not evidence; the required fetch is.',
    '',
    '| Repository | Local branch | Local HEAD | `origin/main` | Behind | Required fetch moved `origin/main`? |',
    '|---|---|---|---|---:|---|',
  ];
  for (const row of rows) {
    let fetchMoved = prior.get(row.repo)?.fetchMoved || 'not recorded';
    const observed = observation?.repos?.[row.repo];
    if (observed) {
      if (observed.after !== row.originMain) {
        throw new Error(
          `fetch observation for ${row.repo} ends at ${observed.after} but origin/main is ${row.originMain}`,
        );
      }
      fetchMoved =
        observed.before === observed.after
          ? 'no'
          : `yes (${observed.before.slice(0, 12)} → ${observed.after.slice(0, 12)})`;
    }
    out.push(
      `| \`${row.repo}\` | \`${row.branch}\` | \`${row.head}\` | \`${row.originMain}\` | ${row.behind} | ${fetchMoved} |`,
    );
  }
  out.push('');
  return out.join('\n');
}

const opts = options(process.argv.slice(2));
const live = liveRows(opts.workspaceRoot);
const existingText = existsSync(opts.manifest) ? readFileSync(opts.manifest, 'utf8') : '';
const existing = parseRows(existingText);

if (opts.write) {
  const observation = opts.fetchObservation
    ? JSON.parse(readFileSync(opts.fetchObservation, 'utf8'))
    : null;
  const next = render(live, existing, observation);
  writeFileSync(opts.manifest, next);
  process.stdout.write(`REBASE_MANIFEST.md: wrote ${live.length} rows\n`);
  process.exit(0);
}

if (existing.size !== REPOS.length) {
  process.stderr.write(
    `REBASE_MANIFEST.md is stale: records ${existing.size} repositories but ${REPOS.length} are required\n`,
  );
  process.exit(1);
}
for (const row of live) {
  const recorded = existing.get(row.repo);
  if (!recorded) {
    process.stderr.write(`REBASE_MANIFEST.md is stale: missing ${row.repo}\n`);
    process.exit(1);
  }
  if (recorded.originMain !== row.originMain) {
    process.stderr.write(
      `REBASE_MANIFEST.md is stale: ${row.repo} records ${recorded.originMain} but origin/main is ${row.originMain}\n`,
    );
    process.exit(1);
  }
  for (const key of ['branch', 'head', 'behind']) {
    if (recorded[key] !== row[key]) {
      process.stderr.write(
        `REBASE_MANIFEST.md is stale: ${row.repo} ${key} records ${recorded[key]} but live is ${row[key]}\n`,
      );
      process.exit(1);
    }
  }
}
process.stdout.write(`REBASE_MANIFEST.md: PASS (${live.length} repositories)\n`);
