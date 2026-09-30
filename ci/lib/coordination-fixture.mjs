/**
 * Test support for the COORD-01 audits (not a check). Builds a throwaway
 * workspace of real git repositories whose coordination files start as COPIES
 * OF THE REAL ONES, so every self-test also proves the committed files load.
 *
 * The real files are read from the Installers checkout named by
 * COORD_INSTALLERS_DIR, else from the resolved workspace's Installers. If that
 * checkout has no coordination data the self-tests FAIL: a precondition that
 * silently skips the assertion is one of the inert shapes this programme bans.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FILES, SCOREBOARD_DIR, digestOf } from './coordination.mjs';
import { findWorkspaceRoot } from './workspace-root.mjs';

export const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPOS = ['Installers', 'Backend', 'Frontend', 'Static-Worker', 'Sandbox-Worker'];
export const BASE_DATE = '2026-09-29T12:00:00Z';
export const TEST_SIGNER = (signer, required) => signer === required.replace(/^human:/, 'test:');

export function realInstallersDir() {
  const env = process.env.COORD_INSTALLERS_DIR;
  const dir = env ? resolve(env) : (() => {
    const ws = findWorkspaceRoot();
    return ws.root ? join(ws.root, 'Installers') : null;
  })();
  if (!dir || !existsSync(join(dir, SCOREBOARD_DIR, FILES.ownership))) {
    throw new Error(
      `no Installers checkout with ${SCOREBOARD_DIR}/${FILES.ownership} (looked at ${dir}); ` +
        'set COORD_INSTALLERS_DIR to the Installers tree that carries the COORD-01 files',
    );
  }
  return dir;
}

export function realScoreboard(name) {
  return JSON.parse(readFileSync(join(realInstallersDir(), SCOREBOARD_DIR, name), 'utf8'));
}

function run(dir, args, env = {}) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function touch(root, p, content) {
  const file = p.endsWith('/') ? join(root, p, '.fixture') : join(root, p);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content ?? `fixture ${p}\n`);
}

/**
 * @param {object} o
 * @param {string[]} [o.repos]       repositories to create (default all five)
 * @param {object}  [o.extraFiles]   { repo: { path: content } } committed in the base
 */
const templates = new Map();
process.on('exit', () => {
  for (const t of templates.values()) rmSync(t.root, { recursive: true, force: true });
});

/**
 * A fresh copy of a template workspace. Building one costs about twenty git
 * spawns (seconds on Windows); copying it costs a directory copy, so each
 * template (keyed by o.key) is built once per process.
 */
export function makeWorkspace(o = {}) {
  const key = o.key || 'default';
  if (!templates.has(key)) templates.set(key, buildTemplate(o));
  const t = templates.get(key);
  const root = mkdtempSync(join(tmpdir(), 'd9-coord-'));
  cpSync(t.root, root, { recursive: true });
  return bind(root, t.bases);
}

function buildTemplate(o) {
  const repos = o.repos || REPOS;
  const root = mkdtempSync(join(tmpdir(), 'd9-coord-tpl-'));
  mkdirSync(join(root, 'ci'));
  writeFileSync(join(root, 'ci', 'gates.json'), readFileSync(join(CI_DIR, 'gates.json')));
  const real = {};
  for (const k of ['gates', 'ownership', 'roster', 'freeze']) real[k] = realScoreboard(FILES[k]);

  const bases = {};
  for (const repo of repos) {
    const dir = join(root, repo);
    mkdirSync(dir);
    run(dir, ['init', '-q', '-b', 'main']);
    // One config write instead of four spawns (git on Windows costs ~50 ms a call).
    appendFileSync(
      join(dir, '.git', 'config'),
      ['[user]', '\tname = fixture', '\temail = fixture@fixture.invalid', '[commit]', '\tgpgsign = false', '[core]', '\tautocrlf = false', ''].join('\n'),
    );
    const rp = real.gates.detectorPackages.repos[repo] || { paths: [] };
    for (const p of rp.paths) touch(dir, p);
    for (const e of real.ownership.entries) if (e.repo === repo && !e.planned) for (const p of e.paths) touch(dir, p);
    for (const [p, content] of Object.entries((o.extraFiles || {})[repo] || {})) touch(dir, p, content);
    touch(dir, 'README.fixture');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '-qm', 'fixture base'], { GIT_AUTHOR_DATE: BASE_DATE, GIT_COMMITTER_DATE: BASE_DATE });
    bases[repo] = run(dir, ['rev-parse', 'HEAD']);
  }

  const ws = bind(root, bases);
  const gates = structuredClone(real.gates);
  for (const r of Object.values(gates.rounds)) {
    r.base = {};
    for (const repo of repos) r.base[repo] = bases[repo];
  }
  ws.write(FILES.gates, gates);
  ws.write(FILES.ownership, real.ownership);
  ws.write(FILES.roster, real.roster);
  ws.write(FILES.freeze, real.freeze);
  ws.write(FILES.ledger, '');
  ws.write(FILES.ratchetLedger, '');
  ws.write('lexicon-provenance.v1.jsonl', '');
  return { root, bases };
}

function bind(root, bases) {
  const ws = {
    root,
    bases,
    dir: (repo) => join(root, repo),
    sbDir: () => join(root, 'Installers', SCOREBOARD_DIR),
    write(name, value) {
      mkdirSync(ws.sbDir(), { recursive: true });
      writeFileSync(join(ws.sbDir(), name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
    },
    read(name) {
      return JSON.parse(readFileSync(join(ws.sbDir(), name), 'utf8'));
    },
    /** Commit `files` ({path: content|null}) as `author` ({name,email}) at `date` (ISO). */
    commit(repo, files, author = { name: 'fixture', email: 'fixture@fixture.invalid' }, date = '2026-10-01T12:00:00Z', message = 'change') {
      const dir = ws.dir(repo);
      for (const [p, content] of Object.entries(files)) {
        if (content === null) rmSync(join(dir, p), { force: true });
        else touch(dir, p, content);
      }
      run(dir, ['add', '-A', '--', ...Object.keys(files)]);
      run(dir, ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-qm', message], {
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      });
      return run(dir, ['rev-parse', 'HEAD']);
    },
    /** Sign the current digest of each named file with TEST ids (never human:). */
    signWithTestIds(files = [FILES.ownership, FILES.roster, FILES.freeze]) {
      const lines = [];
      for (const f of files) {
        const d = digestOf(ws.read(f));
        for (const s of ['test:owner', 'test:coworker']) lines.push(JSON.stringify({ date: '2026-09-30', file: f, digest: d, signer: s }));
      }
      writeFileSync(join(ws.sbDir(), FILES.ledger), `${lines.join('\n')}\n`);
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
  return ws;
}

/** node <script> args..., returning {code, out}. */
export function runScript(script, args, env = {}) {
  try {
    const out = execFileSync(process.execPath, [join(CI_DIR, 'lib', script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}
