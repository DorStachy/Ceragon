/**
 * THE DETECTION PROGRAMME'S COORDINATION DATA, read once for three audits.
 *
 * COORD-01 (plan §10, rules 2, 3, 6 and 8) gives the detection programme and the
 * runtime/readiness programme one ownership table, one shared ratchet, freeze
 * windows and a builder roster. The data lives in the Installers checkout, next
 * to the signed gates file:
 *
 *   Installers/scoreboard/gates.v1.json            detectorPackages, rounds, lexicon (owner-signed via gates-ledger)
 *   Installers/scoreboard/ownership.json           package/seam -> owner programme, reviewer, freeze behaviour
 *   Installers/scoreboard/roster.v1.json           per-round builder roster (distinct git identities)
 *   Installers/scoreboard/freeze.v1.json           freeze windows (2-4 days per round)
 *   Installers/scoreboard/coordination-ledger.v1.jsonl   human signatures over the three files above
 *   Installers/scoreboard/ratchet-ledger.v1.jsonl  commit -> ratchet-pass record
 *
 * The audits that use it are `roster-audit.mjs`, `ratchet-audit.mjs` and
 * `lexicon-counter.mjs`. They share this module so that the three never disagree
 * about which commits are detector commits, which round a commit belongs to, or
 * whether a file is signed.
 *
 * Exit contract (run.mjs, "workspaceChecks"): 0 pass, 1 fail, 2 NOT CHECKED
 * (the check could not be made; never a pass), 3 usage error.
 *
 * NOTHING HERE WRITES A SIGNATURE. A file is signed only when the ledger holds a
 * line for its current digest from every required signer, and the production
 * signer ids are fixed in this module, never read from the file being signed
 * (a file that named its own signers could name nobody).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { findWorkspaceRoot } from './workspace-root.mjs';

export const EXIT = { PASS: 0, FAIL: 1, NOT_CHECKED: 2, USAGE: 3 };

export const SCOREBOARD_DIR = 'scoreboard';
export const FILES = {
  gates: 'gates.v1.json',
  ownership: 'ownership.json',
  roster: 'roster.v1.json',
  freeze: 'freeze.v1.json',
  ledger: 'coordination-ledger.v1.jsonl',
  ratchetLedger: 'ratchet-ledger.v1.jsonl',
};

/** Who must sign each coordination file (C11: owner and coworker sign the table). */
export const REQUIRED_SIGNERS = {
  [FILES.ownership]: ['human:owner', 'human:coworker'],
  [FILES.roster]: ['human:owner'],
  [FILES.freeze]: ['human:owner', 'human:coworker'],
};

/** Plan rule 3: a detector commit from these names fails, whoever is on the roster. */
export const FORBIDDEN_IDENTITY_NAMES = ['unknown', 'owner'];

export const PROGRAMMES = ['detection', 'runtime'];
export const FREEZE_BEHAVIOURS = ['frozen', 'not-frozen'];
export const ENTRY_KINDS = ['package', 'seam', 'file', 'area'];
export const ROSTER_ROLES = ['builder', 'owner', 'custodian', 'labeler', 'red-team', 'reviewer', 'gatherer'];
export const FREEZE_KINDS = ['round-exit', 'certification'];
export const FREEZE_MIN_DAYS = 2;
export const FREEZE_MAX_DAYS = 4;

/** Rows the table must carry (plan §10 rule 1 and K5 §5). Absence is refused, not read as "nothing to own". */
export const REQUIRED_COWORKER_PACKAGES = ['promptrisk', 'toolrisk', 'shellast', 'airuntime', 'aicanary', 'proxy'];
export const REQUIRED_SEAMS = [
  'seam:ai-taint',
  'seam:ai-proxy-masking',
  'seam:wire-tools',
  'seam:wire-session-key',
  'seam:backend-preset-contents',
  'seam:vocabulary-files',
];
export const REQUIRED_ROWS = [
  { repo: 'Installers', path: 'internal/policyeval/' },
  { repo: 'Installers', path: 'internal/localdecide/' },
  { repo: 'Installers', path: 'browser-extension/src/' },
  { repo: 'Installers', path: 'cmd/rc4-holdout-eval/' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA40 = /^[0-9a-f]{40}$/;
const ROUND_ID = /^R[0-9][a-c]?$/;

// ─── strict JSON, and the canonical digest the Go side computes ──────────────

/**
 * JSON.parse keeps the LAST of two duplicate keys; Go's canonicaliser refuses
 * the document. A coordination file that shows a person one value and a parser
 * another is refused here too.
 */
export function parseStrictJSON(text, label) {
  const value = JSON.parse(text);
  const dup = findDuplicateKey(text);
  if (dup) throw new Error(`${label}: duplicate key ${JSON.stringify(dup)}`);
  return value;
}

function findDuplicateKey(text) {
  const stack = [];
  let i = 0;
  let expectKey = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const raw = text.slice(i, j + 1);
      i = j + 1;
      const top = stack[stack.length - 1];
      if (top && top.type === 'object' && expectKey) {
        const key = JSON.parse(raw);
        if (top.keys.has(key)) return key;
        top.keys.add(key);
        expectKey = false;
      }
      continue;
    }
    if (ch === '{') {
      stack.push({ type: 'object', keys: new Set() });
      expectKey = true;
    } else if (ch === '[') {
      stack.push({ type: 'array' });
      expectKey = false;
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      expectKey = false;
    } else if (ch === ',') {
      const top = stack[stack.length - 1];
      expectKey = Boolean(top && top.type === 'object');
    }
    i += 1;
  }
  return null;
}

const compareUtf8 = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));

function quoteJCS(s) {
  // Go's encoding/json (SetEscapeHTML(false)) additionally escapes U+2028/U+2029.
  return JSON.stringify(s).split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
}

/**
 * Canonical JSON with Go parity (Installers internal/scoreboard canonicalJCS):
 * object keys ordered by UTF-8 bytes (Go's sort.Strings; RFC 8785 says UTF-16,
 * and the two differ only past the BMP), numbers in the ES6 form with Go's
 * unsigned exponent, U+2028/U+2029 escaped. ci/lib/coordination.test.mjs and
 * Go's TestJCSDigestParityPin pin the same digest for the same document.
 */
export function canonicalJSON(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical JSON: non-finite number');
    // Go's canonicalNumber writes the exponent without a sign for positive
    // exponents ("1e21", where ES6 writes "1e+21"); parity with Go wins.
    return JSON.stringify(value).replace('e+', 'e');
  }
  if (typeof value === 'string') return quoteJCS(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareUtf8);
    return `{${keys.map((k) => `${quoteJCS(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  throw new Error(`canonical JSON: unsupported ${typeof value}`);
}

export function sha256(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function digestOf(value) {
  return sha256(canonicalJSON(value));
}

// ─── git ─────────────────────────────────────────────────────────────────────

export function git(dir, args, { input, buffer = false } = {}) {
  const r = spawnSync('git', ['-C', dir, ...args], {
    input: input === undefined ? undefined : Buffer.from(input, 'utf8'),
    ...(buffer ? {} : { encoding: 'utf8' }),
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    ok: !r.error && r.status === 0,
    stdout: r.stdout,
    stderr: r.error ? String(r.error.message) : String(r.stderr || ''),
  };
}

export function isCheckout(dir) {
  try {
    return statSync(dir).isDirectory() && existsSync(join(dir, '.git'));
  } catch {
    return false;
  }
}

export function resolveCommit(dir, ref) {
  const r = git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.ok ? r.stdout.trim() : null;
}

export function isAncestor(dir, a, b) {
  return git(dir, ['merge-base', '--is-ancestor', a, b]).ok;
}

/** Every blob path under `prefix` at `ref` (a file path lists itself). */
export function listTree(dir, ref, prefix) {
  const r = git(dir, ['ls-tree', '-r', '--name-only', ref, '--', prefix.replace(/\/$/, '')]);
  if (!r.ok) return null;
  return r.stdout.split('\n').filter(Boolean);
}

export function pathExistsAt(dir, ref, path) {
  return missingPaths(dir, ref, [path]).length === 0;
}

/** The subset of `paths` absent at `ref`, through one `git cat-file --batch-check`. */
export function missingPaths(dir, ref, paths) {
  if (!paths.length) return [];
  const specs = paths.map((p) => `${ref}:${p.replace(/\/$/, '')}`);
  const r = git(dir, ['cat-file', '--batch-check'], { input: `${specs.join('\n')}\n` });
  if (!r.ok) throw new Error(`git cat-file --batch-check failed in ${dir}: ${r.stderr}`);
  const lines = r.stdout.split('\n');
  return paths.filter((_, i) => (lines[i] || '').endsWith(' missing'));
}

/** Read many blobs at one ref through one `git cat-file --batch`. Missing paths map to null. */
export function readBlobs(dir, ref, paths) {
  const out = new Map();
  if (!paths.length) return out;
  const r = git(dir, ['cat-file', '--batch'], { input: paths.map((p) => `${ref}:${p}`).join('\n') + '\n', buffer: true });
  if (!r.ok) throw new Error(`git cat-file --batch failed in ${dir}: ${r.stderr}`);
  const buf = r.stdout;
  let pos = 0;
  for (const p of paths) {
    const nl = buf.indexOf(0x0a, pos);
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      out.set(p, null);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    out.set(p, buf.subarray(pos, pos + size));
    pos += size + 1;
  }
  return out;
}

export function utcDay(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Non-merge commits in base..ref that touch any pathspec. `--full-history`
 * because the default history simplification can drop a side-branch commit
 * whose change a merge later discarded, and an audit that skips a commit
 * because its change did not survive is an audit with a hole.
 */
export function detectorCommits(dir, base, ref, pathspecs) {
  if (!pathspecs.length) return [];
  const r = git(dir, [
    'log',
    '--no-merges',
    '--full-history',
    '--no-renames',
    '--format=%x1e%H%x1f%an%x1f%ae%x1f%cI%x1f%s',
    '--name-only',
    `${base}..${ref}`,
    '--',
    ...pathspecs.map((p) => p.replace(/\/$/, '')),
  ]);
  if (!r.ok) throw new Error(`git log ${base}..${ref} failed in ${dir}: ${r.stderr.trim()}`);
  const commits = [];
  for (const rec of r.stdout.split('\x1e')) {
    if (!rec.trim()) continue;
    const [head, ...rest] = rec.split('\n');
    const [sha, authorName, authorEmail, committerDate, subject] = head.split('\x1f');
    commits.push({
      sha,
      authorName,
      authorEmail,
      committerDate,
      day: utcDay(committerDate),
      subject,
      files: rest.map((l) => l.trim()).filter(Boolean),
    });
  }
  return commits;
}

/** A path matches a spec when equal, or when the spec is a directory ("x/") containing it. */
export function pathMatches(spec, path) {
  return spec.endsWith('/') ? path.startsWith(spec) || path === spec.slice(0, -1) : path === spec;
}

// ─── arguments and checkouts ─────────────────────────────────────────────────

/**
 * Shared flags:
 *   --root <workspace>        the workspace (default: workspace-root.mjs resolution)
 *   --repo Name=path[@ref]    one repository's checkout (and ref); repeatable
 *   --ref <ref>               the ref audited in every repo without its own @ref (default HEAD)
 *   --json                    machine output
 */
export function parseArgs(argv, extraFlags = {}) {
  const opts = { root: null, repos: {}, ref: 'HEAD', json: false, extra: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--repo') {
      const spec = argv[++i] || '';
      const eq = spec.indexOf('=');
      if (eq <= 0) throw new UsageError(`--repo wants Name=path[@ref], got ${JSON.stringify(spec)}`);
      const name = spec.slice(0, eq);
      const rest = spec.slice(eq + 1);
      const at = rest.lastIndexOf('@');
      opts.repos[name] = at > 0 ? { dir: rest.slice(0, at), ref: rest.slice(at + 1) } : { dir: rest, ref: null };
    } else if (Object.prototype.hasOwnProperty.call(extraFlags, a)) {
      const kind = extraFlags[a];
      opts.extra[a] = kind === 'bool' ? true : argv[++i];
    } else throw new UsageError(`unknown flag ${a}`);
  }
  return opts;
}

export class UsageError extends Error {}

/**
 * Where each repository is. A missing checkout is reported, never skipped:
 * the caller turns it into NOT CHECKED for that repository.
 */
export function resolveCheckouts(opts, repoNames) {
  let root = opts.root ? resolve(opts.root) : null;
  let how = '--root';
  if (!root) {
    const found = findWorkspaceRoot();
    if (!found.root) return { root: null, reason: found.reason, checkouts: {} };
    root = found.root;
    how = found.how;
  }
  const checkouts = {};
  for (const name of new Set(['Installers', ...repoNames, ...Object.keys(opts.repos)])) {
    const o = opts.repos[name];
    const dir = o ? (isAbsolute(o.dir) ? o.dir : resolve(root, o.dir)) : join(root, name);
    const ref = (o && o.ref) || opts.ref;
    checkouts[name] = isCheckout(dir) ? { dir, ref } : { dir, ref, missing: `no checkout at ${dir}` };
  }
  return { root, how, checkouts };
}

// ─── the coordination bundle ─────────────────────────────────────────────────

function readJSONFile(path, label) {
  return parseStrictJSON(readFileSync(path, 'utf8').replace(/^﻿/, ''), label);
}

export function readLedger(path, label, keys) {
  if (!existsSync(path)) throw new Error(`${label}: missing (${path})`);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let v;
    try {
      v = parseStrictJSON(line, `${label}:${i + 1}`);
    } catch (e) {
      throw new Error(`${label}:${i + 1}: not JSON (${e.message})`);
    }
    const have = Object.keys(v).sort().join(',');
    if (keys && have !== [...keys].sort().join(',')) {
      throw new Error(`${label}:${i + 1}: keys {${have}}, want exactly {${[...keys].sort().join(',')}}`);
    }
    out.push(v);
  });
  return out;
}

/**
 * Load every coordination file from one scoreboard directory. A file that is
 * missing or does not parse is an error the caller reports as NOT CHECKED:
 * without it the audit cannot be made.
 */
export function loadCoordination(scoreboardDir) {
  const b = { dir: scoreboardDir, errors: [], digests: {} };
  const load = (key) => {
    const p = join(scoreboardDir, FILES[key]);
    try {
      b[key] = readJSONFile(p, FILES[key]);
      b.digests[FILES[key]] = digestOf(b[key]);
    } catch (e) {
      b.errors.push(`${FILES[key]}: ${e.code === 'ENOENT' ? 'missing' : e.message}`);
    }
  };
  for (const key of ['gates', 'ownership', 'roster', 'freeze']) load(key);
  try {
    b.ledger = readLedger(join(scoreboardDir, FILES.ledger), FILES.ledger, ['date', 'file', 'digest', 'signer']);
  } catch (e) {
    b.errors.push(e.message);
  }
  if (!b.errors.length) b.errors.push(...validateBundle(b));
  return b;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);

function validRelPath(p) {
  if (typeof p !== 'string' || !p || p.startsWith('/') || p.includes('\\')) return false;
  return p.replace(/\/$/, '').split('/').every((s) => s && s !== '.' && s !== '..');
}

/** The gates sections the audits need, checked the way Go's validateCoordination checks them. */
export function validateGatesCoordination(gates) {
  const errs = [];
  const dp = gates && gates.detectorPackages;
  if (!isObj(dp) || !isObj(dp.repos) || !Object.keys(dp.repos).length) {
    errs.push('gates.v1.json: detectorPackages.repos is missing: no audit can tell a detector commit from any other');
  } else {
    for (const [repo, rp] of Object.entries(dp.repos)) {
      const all = [...(rp.paths || []), ...(rp.planned || [])];
      if (!all.length) errs.push(`gates.v1.json: detectorPackages.repos.${repo} lists no path`);
      for (const p of all) if (!validRelPath(p)) errs.push(`gates.v1.json: detector path ${repo}:${JSON.stringify(p)} is not a relative path`);
    }
  }
  if (!isObj(gates && gates.rounds) || !Object.keys(gates.rounds).length) {
    errs.push('gates.v1.json: rounds is missing: the audits have no starting commit per repository');
  } else {
    for (const [id, r] of Object.entries(gates.rounds)) {
      if (!ROUND_ID.test(id)) errs.push(`gates.v1.json: round id ${id} is not R<n>[a-c]`);
      if (!isObj(r) || !DATE.test(r.start || '')) errs.push(`gates.v1.json: round ${id} start is not YYYY-MM-DD`);
      for (const [repo, sha] of Object.entries((r && r.base) || {})) {
        if (!SHA40.test(sha)) errs.push(`gates.v1.json: round ${id} base ${repo} is not a 40-hex commit`);
      }
    }
  }
  return errs;
}

export function validateOwnership(own, gates) {
  const errs = [];
  if (!isObj(own) || own.format !== 'devoid.scoreboard.ownership' || own.formatVersion !== 1) {
    return ['ownership.json: format must be devoid.scoreboard.ownership v1'];
  }
  if (!isObj(own.programmes) || PROGRAMMES.some((p) => !isObj(own.programmes[p])) || Object.keys(own.programmes).length !== 2) {
    errs.push(`ownership.json: programmes must be exactly ${PROGRAMMES.join(' and ')}`);
  } else {
    const series = PROGRAMMES.map((p) => own.programmes[p].series);
    if (series[0] !== 'Detection score /10' || series[1] !== 'Scenario readiness %') {
      errs.push('ownership.json: the two named series are "Detection score /10" (detection) and "Scenario readiness %" (runtime), never merged (rule 11)');
    }
  }
  if (!Array.isArray(own.entries) || !own.entries.length) return [...errs, 'ownership.json: entries is empty'];
  const ids = new Set();
  for (const e of own.entries) {
    const at = `ownership.json entry ${JSON.stringify(e && e.id)}`;
    if (!isObj(e) || typeof e.id !== 'string' || !e.id) {
      errs.push(`${at}: no id`);
      continue;
    }
    if (ids.has(e.id)) errs.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!ENTRY_KINDS.includes(e.kind)) errs.push(`${at}: kind ${JSON.stringify(e.kind)} is not one of ${ENTRY_KINDS.join('|')}`);
    if (typeof e.repo !== 'string' || !e.repo) errs.push(`${at}: no repo`);
    if (!strArr(e.paths) || !e.paths.every(validRelPath)) errs.push(`${at}: paths must be relative paths`);
    if (!PROGRAMMES.includes(e.owner)) errs.push(`${at}: owner must be a programme (${PROGRAMMES.join('|')})`);
    if (![...PROGRAMMES, 'both'].includes(e.reviewer)) errs.push(`${at}: reviewer must be detection|runtime|both`);
    if (typeof e.detector !== 'boolean') errs.push(`${at}: detector must be true or false`);
    if (!FREEZE_BEHAVIOURS.includes(e.freeze)) errs.push(`${at}: freeze must be ${FREEZE_BEHAVIOURS.join('|')}`);
    if (typeof e.signOff !== 'boolean') errs.push(`${at}: signOff must be true or false`);
    if (e.detector === true && e.freeze !== 'frozen') errs.push(`${at}: a detector entry must be frozen inside freeze windows (KC-44)`);
    if (e.detector === true && e.reviewer === 'runtime') errs.push(`${at}: a detector entry is reviewed by the detection programme`);
  }
  for (const s of REQUIRED_SEAMS) {
    const e = own.entries.find((x) => x.id === s);
    if (!e) errs.push(`ownership.json: no row for the named seam ${s} (plan §10 rule 1)`);
    else if (e.kind !== 'seam') errs.push(`ownership.json: ${s} must be kind seam`);
  }
  for (const pkg of REQUIRED_COWORKER_PACKAGES) {
    const e = own.entries.find((x) => x.repo === 'Installers' && strArr(x.paths) && x.paths.includes(`internal/${pkg}/`));
    if (!e) errs.push(`ownership.json: no row for the coworker-owned package internal/${pkg}/`);
    else if (e.owner !== 'runtime' || e.signOff !== true) {
      errs.push(`ownership.json: internal/${pkg}/ is coworker-owned: owner runtime, signOff true (a detection unit edits it only after this table is signed)`);
    }
  }
  for (const req of REQUIRED_ROWS) {
    if (!own.entries.some((x) => x.repo === req.repo && strArr(x.paths) && x.paths.includes(req.path))) {
      errs.push(`ownership.json: no row for ${req.repo}:${req.path} (K5 §5: it had none)`);
    }
  }
  const folded = Array.isArray(own.folded) ? own.folded.find((f) => f && f.id === 'coworker-engine-residuals') : null;
  if (!folded || folded.foldedInto !== 'SC1-01') {
    errs.push('ownership.json: the coworker engine-residual batch must be recorded as folded into SC1-01 (plan §10 rule 4)');
  }
  // Every detector path has a detector row: no detector commit is unattributable.
  const dp = gates && gates.detectorPackages && gates.detectorPackages.repos;
  if (isObj(dp)) {
    for (const [repo, rp] of Object.entries(dp)) {
      for (const p of [...(rp.paths || []), ...(rp.planned || [])]) {
        const covered = own.entries.some(
          (e) => e.repo === repo && e.detector === true && strArr(e.paths) && e.paths.some((ep) => pathMatches(ep, p)),
        );
        if (!covered) errs.push(`ownership.json: detector path ${repo}:${p} has no detector row (owner, reviewer, freeze)`);
      }
    }
    for (const e of own.entries) {
      if (e.detector !== true || !strArr(e.paths)) continue;
      const listed = [...((dp[e.repo] || {}).paths || []), ...((dp[e.repo] || {}).planned || [])];
      for (const ep of e.paths) {
        if (!listed.some((p) => pathMatches(ep, p) || pathMatches(p, ep))) {
          errs.push(`ownership.json: ${e.id} marks ${e.repo}:${ep} as detector code, but gates.v1.json detectorPackages does not list it`);
        }
      }
    }
  }
  return errs;
}

export function identityKey(idn) {
  return `${String(idn.name)}\u0000${String(idn.email).toLowerCase()}`;
}

export function validateRoster(roster, gates) {
  const errs = [];
  if (!isObj(roster) || roster.format !== 'devoid.scoreboard.roster' || roster.formatVersion !== 1) {
    return ['roster.v1.json: format must be devoid.scoreboard.roster v1'];
  }
  if (!Array.isArray(roster.rounds) || !roster.rounds.length) return ['roster.v1.json: rounds is empty'];
  const seenRounds = new Set();
  for (const r of roster.rounds) {
    const at = `roster.v1.json round ${JSON.stringify(r && r.round)}`;
    if (!isObj(r) || typeof r.round !== 'string') {
      errs.push(`${at}: malformed`);
      continue;
    }
    if (seenRounds.has(r.round)) errs.push(`${at}: listed twice`);
    seenRounds.add(r.round);
    if (!gates || !isObj(gates.rounds) || !gates.rounds[r.round]) errs.push(`${at}: not a round in gates.v1.json`);
    if (!Array.isArray(r.members)) {
      errs.push(`${at}: members must be an array`);
      continue;
    }
    const seenIds = new Set();
    const seenIdn = new Map();
    for (const m of r.members) {
      const mat = `${at} member ${JSON.stringify(m && m.id)}`;
      if (!isObj(m) || typeof m.id !== 'string' || !/^(person|agent):[a-z0-9][a-z0-9.-]*$/.test(m.id)) {
        errs.push(`${mat}: id must be person:<name> or agent:<name> (never a labeller id)`);
        continue;
      }
      if (seenIds.has(m.id)) errs.push(`${mat}: listed twice`);
      seenIds.add(m.id);
      if (!['person', 'agent'].includes(m.kind)) errs.push(`${mat}: kind must be person or agent`);
      if (!strArr(m.roles) || !m.roles.length || m.roles.some((x) => !ROSTER_ROLES.includes(x))) {
        errs.push(`${mat}: roles must be drawn from ${ROSTER_ROLES.join('|')}`);
        continue;
      }
      const builder = m.roles.includes('builder');
      const conflict = m.roles.filter((x) => ['owner', 'custodian', 'labeler', 'red-team'].includes(x));
      if (builder && conflict.length) errs.push(`${mat}: a builder cannot also be ${conflict.join('/')} in the same round (rule 3)`);
      if (!Array.isArray(m.gitIdentities)) {
        errs.push(`${mat}: gitIdentities must be an array`);
        continue;
      }
      if (builder && !m.gitIdentities.length) errs.push(`${mat}: a builder needs at least one distinct git identity`);
      for (const idn of m.gitIdentities) {
        if (!isObj(idn) || typeof idn.name !== 'string' || !idn.name || typeof idn.email !== 'string' || !idn.email.includes('@')) {
          errs.push(`${mat}: a git identity needs a name and an email`);
          continue;
        }
        if (FORBIDDEN_IDENTITY_NAMES.includes(idn.name.trim().toLowerCase())) {
          errs.push(`${mat}: the identity name ${JSON.stringify(idn.name)} can never identify anyone (rule 3)`);
        }
        const k = identityKey(idn);
        if (seenIdn.has(k)) errs.push(`${mat}: identity ${idn.name} <${idn.email}> is also ${seenIdn.get(k)}: identities are distinct`);
        seenIdn.set(k, m.id);
      }
      for (const f of ['osAccounts', 'profiles']) {
        if (m[f] !== undefined && !strArr(m[f])) errs.push(`${mat}: ${f} must be an array of strings`);
      }
    }
  }
  return errs;
}

export function dayCount(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export function validateFreeze(freeze) {
  const errs = [];
  if (!isObj(freeze) || freeze.format !== 'devoid.scoreboard.freeze' || freeze.formatVersion !== 1) {
    return ['freeze.v1.json: format must be devoid.scoreboard.freeze v1'];
  }
  if (!Array.isArray(freeze.windows)) return ['freeze.v1.json: windows must be an array'];
  const sorted = [];
  for (const w of freeze.windows) {
    const at = `freeze.v1.json window ${JSON.stringify(w && w.round)} ${w && w.from}..${w && w.to}`;
    if (!isObj(w) || !ROUND_ID.test(w.round || '')) {
      errs.push(`${at}: round must be R<n>[a-c]`);
      continue;
    }
    if (!FREEZE_KINDS.includes(w.kind)) errs.push(`${at}: kind must be ${FREEZE_KINDS.join('|')}`);
    if (!DATE.test(w.from || '') || !DATE.test(w.to || '')) {
      errs.push(`${at}: from/to must be YYYY-MM-DD`);
      continue;
    }
    const days = dayCount(w.from, w.to);
    if (days < FREEZE_MIN_DAYS || days > FREEZE_MAX_DAYS) {
      errs.push(`${at}: ${days} day(s); a freeze window is ${FREEZE_MIN_DAYS}-${FREEZE_MAX_DAYS} days (plan §10 rule 5)`);
    }
    if (w.candidate !== undefined) {
      if (!isObj(w.candidate) || Object.values(w.candidate).some((s) => !SHA40.test(s))) {
        errs.push(`${at}: candidate must map repositories to 40-hex commits`);
      }
    }
    sorted.push(w);
  }
  sorted.sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].from <= sorted[i - 1].to) errs.push(`freeze.v1.json: windows ${sorted[i - 1].round} and ${sorted[i].round} overlap`);
  }
  return errs;
}

export function validateBundle(b) {
  return [
    ...validateGatesCoordination(b.gates),
    ...validateOwnership(b.ownership, b.gates),
    ...validateRoster(b.roster, b.gates),
    ...validateFreeze(b.freeze),
  ];
}

/**
 * Is `file` signed at its current digest by every required signer? `matches`
 * is the signer predicate; production compares ids exactly. Tests pass another
 * predicate so the signed path is shown to say YES without any human id being
 * written anywhere.
 */
export function signatureState(bundle, file, { matches = (signer, required) => signer === required } = {}) {
  const digest = bundle.digests[file];
  const required = REQUIRED_SIGNERS[file] || [];
  const lines = (bundle.ledger || []).filter((l) => l.file === file && l.digest === digest);
  const missing = required.filter((r) => !lines.some((l) => matches(l.signer, r)));
  return { file, digest, signed: missing.length === 0 && required.length > 0, missing };
}

export function detectorPathspecs(gates, repo) {
  const rp = gates.detectorPackages.repos[repo];
  return rp ? [...(rp.paths || []), ...(rp.planned || [])] : [];
}

/** Detector paths plus every ownership row the table freezes (presets, vocabulary files, seams). */
export function frozenPathspecs(bundle, repo) {
  const set = new Set(detectorPathspecs(bundle.gates, repo));
  for (const e of bundle.ownership.entries) {
    if (e.repo === repo && e.freeze === 'frozen') for (const p of e.paths) set.add(p);
  }
  return [...set];
}

/** Rounds ordered by start date. */
export function orderedRounds(gates) {
  return Object.entries(gates.rounds)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

/** The round a day belongs to: the last round started on or before it (the first round for earlier days). */
export function roundOf(gates, day) {
  const rounds = orderedRounds(gates);
  let cur = rounds[0];
  for (const r of rounds) if (r.start <= day) cur = r;
  return cur;
}

/** The programme's starting commit for a repository: the earliest round that records one. */
export function programmeBase(gates, repo) {
  for (const r of orderedRounds(gates)) if (r.base && r.base[repo]) return { round: r.id, sha: r.base[repo] };
  return null;
}

export function freezeWindowFor(freeze, day) {
  return freeze.windows.find((w) => w.from <= day && day <= w.to) || null;
}

/**
 * Resolve the audit range for one repository: its programme base .. its ref.
 * Returns { base, head } or { notChecked: reason }.
 */
export function auditRange(gates, repo, co) {
  if (!co || co.missing) return { notChecked: `${repo}: NOT CHECKED -- ${co ? co.missing : 'no checkout'}` };
  const base = programmeBase(gates, repo);
  if (!base) return { notChecked: `${repo}: NOT CHECKED -- gates.v1.json rounds record no base commit for it` };
  // One spawn for both in the ordinary case; the reason is worked out only on failure.
  const both = git(co.dir, ['rev-parse', `${co.ref}^{commit}`, `${base.sha}^{commit}`]);
  const head = both.ok ? both.stdout.trim().split('\n')[0] : resolveCommit(co.dir, co.ref);
  if (!head) return { notChecked: `${repo}: NOT CHECKED -- ref ${co.ref} does not resolve in ${co.dir}` };
  if (!both.ok && !resolveCommit(co.dir, base.sha)) {
    return { notChecked: `${repo}: NOT CHECKED -- base ${base.sha.slice(0, 12)} (round ${base.round}) is not in ${co.dir}; fetch it` };
  }
  if (!isAncestor(co.dir, base.sha, head)) {
    return { notChecked: `${repo}: NOT CHECKED -- base ${base.sha.slice(0, 12)} is not an ancestor of ${co.ref} (${head.slice(0, 12)})` };
  }
  return { base: base.sha, head };
}

/** The Installers scoreboard directory the coordination data is read from. */
export function scoreboardDirOf(checkouts, override) {
  if (override) return resolve(override);
  const inst = checkouts.Installers;
  return inst && !inst.missing ? join(inst.dir, SCOREBOARD_DIR) : null;
}

/** Worst-first exit status over a list of per-part statuses. */
export function combine(statuses) {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('not-checked')) return 'not-checked';
  return 'pass';
}

export function exitFor(status) {
  return status === 'pass' ? EXIT.PASS : status === 'fail' ? EXIT.FAIL : EXIT.NOT_CHECKED;
}
