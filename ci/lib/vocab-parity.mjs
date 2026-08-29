#!/usr/bin/env node
/**
 * CROSS-REPO DRIFT CHECK for the tool-risk detector vocabulary.
 *
 * ── What this exists to catch ────────────────────────────────────────────────
 *
 * The list of "risky things an AI agent might do" is one vocabulary living as
 * three hand-copied files in three separate git repositories:
 *
 *   producer  Installers/parity-vectors/toolrisk-classes.v1.json
 *   consumer  Backend/packages/shared-contracts/toolrisk-classes.v1.json
 *   consumer  Frontend/types/vendored/toolrisk-classes.v1.json
 *
 * A new high-severity class added in the agent and never copied across starts
 * interrupting developers fleet-wide with NO CONSOLE CONTROL TO TURN IT OFF: an
 * administrator cannot set a policy for a class the Backend's registered tuple
 * does not contain, because `assertClosedActionMap` rejects any action-map key
 * outside it. The only remedy anyone can find is uninstalling us.
 *
 * That has already happened once. `Installers/internal/toolrisk/class_catalog.go`
 * records it by name: `interpreter-exec`, `fetch-then-exec` and
 * `substitution-exfil` were emitted by the detector since M4 and were absent
 * from BOTH consumer registries for months.
 *
 * ── Why the existing guards cannot catch it ──────────────────────────────────
 *
 * Three guards were added after that incident, one per repo:
 *
 *   Installers  internal/toolrisk/class_catalog_test.go
 *               (live Go rule tables  vs  Installers' OWN vector)
 *   Backend     src/ai-security-policy/ai-security-policy.tool-risk-class-parity.spec.ts
 *               (AI_TOOL_RISK_*_CLASSES  vs  BACKEND'S OWN vendored copy)
 *   Frontend    components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts
 *               (AI_TOOL_RISK_CLASSES    vs  FRONTEND'S OWN vendored copy)
 *
 * Every one of them compares a repo against a copy inside that same repo. So the
 * Installers half is sound — add a rule, forget to regenerate, Go goes red. But
 * regenerate the vector in Installers and never copy it: Installers is green
 * (its vector matches its rules), Backend is green (its tuple matches its stale
 * copy), Frontend is green (same). Three green repos, one divergent vocabulary,
 * and nobody is looking at all three at once.
 *
 * This script is the thing that looks at all three at once. It reads the three
 * files OUT OF THE THREE REPOSITORIES and compares them TO EACH OTHER.
 *
 * ── It refuses to pass when it cannot compare ────────────────────────────────
 *
 * A cross-repo checker that shrugs and exits 0 when a sibling checkout is
 * missing is the same defect wearing a different hat. There is no degraded mode
 * here: a missing repo, a missing file, an unreadable ref or unparseable JSON
 * all produce `NOT CHECKED` and a non-zero exit. Modelled on
 * `Frontend/scripts/check-response-only-fields.cjs`, which used to print
 * "OK - digest verified" while noting that the drift it existed to detect "was
 * NOT checked", and now reports NOT CHECKED instead of OK.
 *
 * Deliberately NOT a digest-only fallback like that script's second mode. A
 * self-digest answers "was this file hand-edited", which is the question the
 * three existing per-repo guards already answer. The only question this script
 * exists for needs all three files present.
 *
 * ── It is not a hand-written list of class names ─────────────────────────────
 *
 * Nothing below enumerates a class. The vocabulary, the tier grouping, the class
 * count and the canonical digest are all DERIVED from whichever bytes are on
 * disk, then compared across repos. Feed it a class name none of the three has
 * ever seen and it reports exactly which repos are missing it -- there is no
 * closed set to fall outside of. `vocab-parity.test.mjs` proves that against a
 * fabricated class.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node ci/lib/vocab-parity.mjs                 # each repo's best available copy
 *   node ci/lib/vocab-parity.mjs --ref origin/main   # pin all three to one ref
 *   node ci/lib/vocab-parity.mjs --json
 *   node ci/lib/vocab-parity.mjs --root <workspace>
 *
 * Per-repo source override (path, ref, or path@ref):
 *   TOOLRISK_VOCAB_INSTALLERS=<spec>
 *   TOOLRISK_VOCAB_BACKEND=<spec>
 *   TOOLRISK_VOCAB_FRONTEND=<spec>
 * A bare ref must be written `@<ref>` (e.g. `@HEAD`) so it cannot be confused
 * with a relative path.
 *
 * Exit status:
 *   0  PASS         all three compared, and they agree
 *   1  DRIFT        all three compared, and they do not agree
 *   2  NOT CHECKED  the comparison could not be made
 *   3  usage error
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * THE THREE COPIES.
 *
 * These paths are the one thing that cannot be derived: there is no registry
 * anywhere in the workspace that records where the vocabulary was copied to.
 * Stating them here is the point of the file -- a copy this list does not name
 * is a copy nothing checks, so adding a fourth consumer means adding a line
 * here. `role` is informational: it lets the report say "the producer has it and
 * the consumers do not", which is the direction that hurts.
 */
export const COPIES = [
  {
    key: 'Installers',
    role: 'producer',
    repoDir: 'Installers',
    filePath: 'parity-vectors/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_INSTALLERS',
    regenerate: 'TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/',
  },
  {
    key: 'Backend',
    role: 'consumer',
    repoDir: 'Backend',
    filePath: 'packages/shared-contracts/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_BACKEND',
    regenerate: 'copy the producer file here, then update AI_TOOL_RISK_*_CLASSES',
  },
  {
    key: 'Frontend',
    role: 'consumer',
    repoDir: 'Frontend',
    filePath: 'types/vendored/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_FRONTEND',
    regenerate: 'copy the producer file here, then update AI_TOOL_RISK_CLASSES + AI_TOOL_RISK_CLASS_META',
  },
];

/** The schema tag, not part of the vocabulary. A copy that is not this document is not comparable. */
const EXPECTED_FORMAT = 'ceragon.ai-security.toolrisk-class-catalog';
/** formatVersion 2 added the `wire` block. Older documents lack fields this compares. */
const MIN_FORMAT_VERSION = 2;

const E = String.fromCharCode(27);
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColour ? `${E}[${code}m${s}${E}[0m` : s);
const red = (s) => c('31', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const dim = (s) => c('2', s);
const bold = (s) => c('1', s);

/**
 * LINE ENDINGS ARE NOT VOCABULARY.
 *
 * `.gitattributes` pins these files `text eol=lf` in all three repos, but a
 * checkout that predates the pin has CRLF in the working tree with LF in the
 * index. The Go guard learned this the hard way on 2026-08-06: it went red on
 * every Windows worktree while the committed bytes were sha256-identical. Only
 * git's own autocrlf transformation is undone here -- an added class, a changed
 * tier or a different digest all still fail.
 */
const normalizeEOL = (s) => s.replace(/\r\n/g, '\n');

/**
 * Reimplementation of Go's `canonicalCatalogDigest` (class_catalog_test.go).
 * Tier names sorted, each followed by its sorted classes at two-space indent,
 * every line LF-terminated. Computed from the tiers in the file being checked,
 * never from a literal -- so it detects a copy whose recorded digest no longer
 * describes its own contents (a partial hand edit).
 */
export function canonicalCatalogDigest(tiers) {
  let sb = '';
  for (const tier of Object.keys(tiers).sort()) {
    sb += `${tier}\n`;
    for (const cls of [...tiers[tier]].sort()) sb += `  ${cls}\n`;
  }
  return `sha256:${createHash('sha256').update(sb, 'utf8').digest('hex')}`;
}

/** Parse `path`, `@ref`, or `path@ref`. */
function parseSourceSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at === 0) return { dir: null, ref: spec.slice(1) };
  if (at > 0) return { dir: spec.slice(0, at), ref: spec.slice(at + 1) };
  return { dir: spec, ref: null };
}

function gitShow(repoDir, ref, filePath) {
  const r = spawnSync('git', ['-C', repoDir, 'show', `${ref}:${filePath}`], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

function isGitRepo(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--git-dir'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

/**
 * Resolve one copy to bytes, and SAY WHERE THEY CAME FROM.
 *
 * Order: explicit override, then working tree, then HEAD, then origin/main.
 * The fallback chain exists because every checkout in this workspace is
 * hundreds of commits behind its remote and several do not have the file on
 * disk at all -- but a fallback that is not announced is a lie about what was
 * compared, so `sourceLabel` is printed for every copy on every run, pass or
 * fail, and a fall past the working tree is called out by name.
 */
function resolveCopy(copy, opts) {
  const out = {
    key: copy.key,
    role: copy.role,
    filePath: copy.filePath,
    regenerate: copy.regenerate,
    bytes: null,
    sourceLabel: null,
    notes: [],
    problem: null,
  };

  const override = process.env[copy.env];
  let repoDir = resolve(opts.root, copy.repoDir);
  let forcedRef = opts.ref || null;

  if (override) {
    const spec = parseSourceSpec(override);
    if (spec.dir) repoDir = isAbsolute(spec.dir) ? spec.dir : resolve(opts.root, spec.dir);
    if (spec.ref) forcedRef = spec.ref;
    out.notes.push(`source overridden by ${copy.env}=${override}`);
  }
  out.repoDir = repoDir;

  if (!existsSync(repoDir)) {
    out.problem = `checkout not found at ${repoDir}`;
    return out;
  }

  const onDisk = join(repoDir, copy.filePath);

  if (forcedRef) {
    if (forcedRef === 'WORKTREE') {
      if (!existsSync(onDisk)) {
        out.problem = `${copy.filePath} is not in the working tree of ${repoDir}`;
        return out;
      }
      out.bytes = readFileSync(onDisk);
      out.sourceLabel = `${repoDir} (working tree)`;
      return out;
    }
    if (!isGitRepo(repoDir)) {
      out.problem = `${repoDir} is not a git repository, so ref '${forcedRef}' cannot be read`;
      return out;
    }
    const bytes = gitShow(repoDir, forcedRef, copy.filePath);
    if (!bytes) {
      out.problem = `${copy.filePath} is not present at ref '${forcedRef}' in ${repoDir}`;
      return out;
    }
    out.bytes = bytes;
    out.sourceLabel = `${repoDir}@${forcedRef}`;
    return out;
  }

  if (existsSync(onDisk)) {
    out.bytes = readFileSync(onDisk);
    out.sourceLabel = `${repoDir} (working tree)`;
    return out;
  }

  if (!isGitRepo(repoDir)) {
    out.problem =
      `${copy.filePath} is not in the working tree of ${repoDir}, ` +
      'and that directory is not a git repository, so no committed copy can be read';
    return out;
  }

  for (const ref of ['HEAD', 'origin/main']) {
    const bytes = gitShow(repoDir, ref, copy.filePath);
    if (bytes) {
      out.bytes = bytes;
      out.sourceLabel = `${repoDir}@${ref}`;
      out.notes.push(
        `working tree has no copy of ${copy.filePath}; fell back to ${ref}. ` +
          'This run did NOT check your working tree for this repo.',
      );
      return out;
    }
  }

  out.problem =
    `${copy.filePath} could not be found in ${repoDir} -- not in the working tree, ` +
    'not at HEAD, not at origin/main';
  return out;
}

/** Structural read of one copy. Everything is taken from the bytes. */
function interpret(copy) {
  const text = normalizeEOL(copy.bytes.toString('utf8'));
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    return { problem: `${copy.sourceLabel}: not valid JSON (${err.message})` };
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { problem: `${copy.sourceLabel}: expected a JSON object` };
  }
  if (doc.format !== EXPECTED_FORMAT) {
    return {
      problem: `${copy.sourceLabel}: format is ${JSON.stringify(doc.format)}, expected ${JSON.stringify(EXPECTED_FORMAT)}`,
    };
  }
  if (!Number.isInteger(doc.formatVersion) || doc.formatVersion < MIN_FORMAT_VERSION) {
    return {
      problem: `${copy.sourceLabel}: formatVersion is ${JSON.stringify(doc.formatVersion)}, expected an integer >= ${MIN_FORMAT_VERSION}`,
    };
  }
  if (!Array.isArray(doc.classes) || doc.classes.some((x) => typeof x !== 'string')) {
    return { problem: `${copy.sourceLabel}: 'classes' is not an array of strings` };
  }
  if (doc.tiers === null || typeof doc.tiers !== 'object' || Array.isArray(doc.tiers)) {
    return { problem: `${copy.sourceLabel}: 'tiers' is not an object` };
  }
  for (const [tier, names] of Object.entries(doc.tiers)) {
    if (!Array.isArray(names) || names.some((x) => typeof x !== 'string')) {
      return { problem: `${copy.sourceLabel}: tier '${tier}' is not an array of strings` };
    }
  }

  const tierOf = new Map();
  const duplicated = [];
  for (const [tier, names] of Object.entries(doc.tiers)) {
    for (const cls of names) {
      if (tierOf.has(cls) && tierOf.get(cls) !== tier) duplicated.push(cls);
      tierOf.set(cls, tier);
    }
  }

  return {
    text,
    doc,
    classes: new Set(doc.classes),
    tierOf,
    duplicated,
    classCount: doc.classCount,
    recordedDigest: doc.sha256,
    computedDigest: canonicalCatalogDigest(doc.tiers),
    wire: doc.wire,
  };
}

/** A copy that disagrees with ITSELF is not usable as a reference for the others. */
function selfConsistencyProblems(copy, view) {
  const out = [];
  const listed = [...view.classes].sort();
  const grouped = [...view.tierOf.keys()].sort();
  if (view.doc.classes.length !== view.classes.size) {
    out.push(`${copy.key}: 'classes' contains duplicate entries`);
  }
  if (view.duplicated.length) {
    out.push(`${copy.key}: ${view.duplicated.sort().join(', ')} appear(s) in more than one tier`);
  }
  const onlyInClasses = listed.filter((x) => !view.tierOf.has(x));
  const onlyInTiers = grouped.filter((x) => !view.classes.has(x));
  if (onlyInClasses.length) {
    out.push(`${copy.key}: in 'classes' but in no tier: ${onlyInClasses.join(', ')}`);
  }
  if (onlyInTiers.length) {
    out.push(`${copy.key}: in a tier but not in 'classes': ${onlyInTiers.join(', ')}`);
  }
  if (view.classCount !== view.classes.size) {
    out.push(`${copy.key}: classCount says ${view.classCount}, 'classes' holds ${view.classes.size}`);
  }
  if (view.recordedDigest !== view.computedDigest) {
    out.push(
      `${copy.key}: recorded sha256 does not describe this file's own tiers (hand-edited?)\n` +
        `      recorded: ${view.recordedDigest}\n` +
        `      computed: ${view.computedDigest}`,
    );
  }
  return out;
}

function firstDifference(a, b, leftName, rightName) {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) {
      return [
        `first difference at line ${i + 1}:`,
        `  ${leftName}: ${left[i] === undefined ? '(end of file)' : left[i]}`,
        `  ${rightName}: ${right[i] === undefined ? '(end of file)' : right[i]}`,
      ].join('\n');
    }
  }
  return 'files differ only in trailing bytes';
}

/**
 * THE CROSS COMPARISON. Every check below reads two or three different repos.
 * `resolved` is the output of resolveCopy for each entry in COPIES.
 */
export function compare(resolved) {
  const blocked = resolved.filter((r) => r.problem);
  if (blocked.length) {
    return {
      status: 'NOT_CHECKED',
      reasons: blocked.map((r) => `${r.key}: ${r.problem}`),
      drift: [],
    };
  }

  const views = new Map();
  const unreadable = [];
  for (const r of resolved) {
    const v = interpret(r);
    if (v.problem) unreadable.push(v.problem);
    else views.set(r.key, v);
  }
  if (unreadable.length) {
    return { status: 'NOT_CHECKED', reasons: unreadable, drift: [] };
  }

  const drift = [];

  // A copy that contradicts itself first: comparing against it would be noise.
  for (const r of resolved) {
    drift.push(...selfConsistencyProblems(r, views.get(r.key)));
  }
  if (drift.length) return { status: 'DRIFT', reasons: [], drift, views };

  // 1. VOCABULARY. The union across all three, then who is missing what. This is
  //    the "added in the agent, never copied" case, and it is stated in the
  //    direction that matters: the class exists somewhere, and these repos do
  //    not have it.
  const union = new Set();
  for (const v of views.values()) for (const cls of v.classes) union.add(cls);

  const missing = [];
  for (const cls of [...union].sort()) {
    const has = resolved.filter((r) => views.get(r.key).classes.has(cls)).map((r) => r.key);
    const lacks = resolved.filter((r) => !views.get(r.key).classes.has(cls)).map((r) => r.key);
    if (lacks.length) missing.push({ cls, has, lacks });
  }
  for (const m of missing) {
    drift.push(
      `class '${m.cls}' is in ${m.has.join(' + ')} but MISSING from ${m.lacks.join(' + ')}` +
        (m.has.includes('Installers') && m.lacks.length === resolved.length - 1
          ? ' -- the detector can emit it and NO CONSOLE CONTROL EXISTS for it'
          : ''),
    );
  }

  // 2. SEVERITY. A class every repo knows, filed under a different tier in one of
  //    them, means the console offers a control whose default contradicts what
  //    the endpoint enforces.
  for (const cls of [...union].sort()) {
    const tiers = new Map();
    for (const r of resolved) {
      const t = views.get(r.key).tierOf.get(cls);
      if (t === undefined) continue;
      if (!tiers.has(t)) tiers.set(t, []);
      tiers.get(t).push(r.key);
    }
    if (tiers.size > 1) {
      const parts = [...tiers.entries()].sort().map(([t, keys]) => `${keys.join('+')}=${t}`);
      drift.push(`class '${cls}' has different severity tiers across repos: ${parts.join(', ')}`);
    }
  }

  // 3. WIRE KEY PATH. The class names and the policy-body key the section travels
  //    on are separate contracts; both have silently died before. `encoding/json`
  //    drops an unrecognised key, so a rename leaves the section at its zero
  //    value (`enabled: false`) with every suite in both repos green.
  const wireOf = (k) => JSON.stringify(views.get(k).wire ?? null);
  const wireRef = resolved[0];
  for (const r of resolved.slice(1)) {
    if (wireOf(r.key) !== wireOf(wireRef.key)) {
      drift.push(
        `the 'wire' block differs between ${wireRef.key} and ${r.key}:\n` +
          `      ${wireRef.key}: ${wireOf(wireRef.key)}\n` +
          `      ${r.key}: ${wireOf(r.key)}`,
      );
    }
  }

  // 4. RESIDUAL BYTES. Everything the structured checks above do not name --
  //    producer string, note, format version, key order. These files are copies,
  //    so anything other than identical is drift; the checks above exist to make
  //    the common failures readable, not to replace this one.
  const ref = resolved[0];
  for (const r of resolved.slice(1)) {
    if (views.get(r.key).text !== views.get(ref.key).text) {
      drift.push(
        `the ${r.key} copy is not byte-identical to the ${ref.key} copy (after CRLF normalisation)\n` +
          '      ' +
          firstDifference(
            views.get(ref.key).text,
            views.get(r.key).text,
            ref.key,
            r.key,
          ).replace(/\n/g, '\n      '),
      );
    }
  }

  return { status: drift.length ? 'DRIFT' : 'PASS', reasons: [], drift, views };
}

export function check(opts = {}) {
  const options = { root: opts.root || resolve(CI_DIR, '..'), ref: opts.ref || null };
  const resolved = COPIES.map((copy) => resolveCopy(copy, options));
  const result = compare(resolved);
  return { ...result, resolved, options };
}

function report(result, log) {
  log(`\n${bold('tool-risk vocabulary -- cross-repo parity')}\n`);
  for (const r of result.resolved) {
    const where = r.problem ? red('UNAVAILABLE') : dim(r.sourceLabel);
    log(`  ${r.key.padEnd(11)} ${dim(`(${r.role})`)} ${where}\n`);
    log(`  ${' '.repeat(11)} ${dim(r.filePath)}\n`);
    for (const n of r.notes) log(`  ${' '.repeat(11)} ${yellow(n)}\n`);
    if (r.problem) log(`  ${' '.repeat(11)} ${red(r.problem)}\n`);
  }
  log('\n');

  if (result.status === 'NOT_CHECKED') {
    log(`${red('NOT CHECKED')} -- the three copies could not be compared.\n`);
    for (const reason of result.reasons) log(`  ${red('!')} ${reason}\n`);
    log(
      dim(
        '\n  This is NOT a pass. The whole point of this check is comparing the three\n' +
          '  repositories to each other; with a copy missing there is nothing to compare.\n' +
          '  Point it at the checkouts with --root, --ref, or TOOLRISK_VOCAB_<REPO>.\n',
      ),
    );
    return;
  }

  if (result.status === 'DRIFT') {
    log(`${red('DRIFT')} -- the detector vocabulary is not the same in all three repos.\n\n`);
    for (const d of result.drift) log(`  ${red('x')} ${d}\n`);
    const producer = result.resolved.find((r) => r.role === 'producer');
    log(
      '\n' +
        dim('  Fix: regenerate the producer vector, then copy it to both consumers.\n') +
        dim(`    ${producer.key}: ${producer.regenerate}\n`),
    );
    for (const r of result.resolved.filter((x) => x.role === 'consumer')) {
      log(dim(`    ${r.key}: ${r.regenerate}\n`));
    }
    return;
  }

  const anyView = result.views.values().next().value;
  log(
    `${green('PASS')} -- all three repos carry the same ${anyView.classes.size} classes, ` +
      `the same tiers, and the same wire key path.\n`,
  );
}

const EXIT = { PASS: 0, DRIFT: 1, NOT_CHECKED: 2 };

function main(argv) {
  const opts = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = resolve(argv[++i]);
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a === '--json') json = true;
    else if (a === '-h' || a === '--help') {
      process.stdout.write(
        'usage: node ci/lib/vocab-parity.mjs [--root <workspace>] [--ref <git-ref>|WORKTREE] [--json]\n',
      );
      return 0;
    } else {
      process.stderr.write(`unknown argument: ${a}\n`);
      return 3;
    }
  }

  const result = check(opts);
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: result.status,
          reasons: result.reasons,
          drift: result.drift,
          sources: result.resolved.map((r) => ({
            repo: r.key,
            role: r.role,
            file: r.filePath,
            source: r.sourceLabel,
            problem: r.problem,
            notes: r.notes,
          })),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    report(result, (s) => process.stdout.write(s));
  }
  return EXIT[result.status];
}

// Run only when this file IS the entry point. Compared as resolved file URLs
// because on Windows `process.argv[1]` is a backslash path that never equals
// `import.meta.url`, and a suffix test would also fire for any other module
// whose name happens to end the same way.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main(process.argv.slice(2)));
}
