#!/usr/bin/env node
/**
 * MUTATION PROOF for `vocab-parity.mjs`.
 *
 * A drift checker nobody has ever made go red is a drift checker that has not
 * been run. Every case below fabricates a three-repo trio on disk, mutates it,
 * and asserts the checker's exit status AND the words in its output.
 *
 * The fixtures are NOT hand-written. The base document is the real vector read
 * out of the real Installers checkout through the checker's own resolver, then
 * mutated. If it cannot be read the suite FAILS -- it does not skip, because a
 * precondition that silently skips the assertion is one of the inert shapes this
 * whole wave exists to stamp out.
 *
 *   node ci/lib/vocab-parity.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COPIES,
  canonicalCatalogDigest,
  canonicalDlpCatalogDigest,
  check,
} from './vocab-parity.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(CI_DIR, 'lib', 'vocab-parity.mjs');
const WORKSPACE = resolve(CI_DIR, '..');

const E = String.fromCharCode(27);
const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s) => (colour ? `${E}[31m${s}${E}[0m` : s);
const green = (s) => (colour ? `${E}[32m${s}${E}[0m` : s);
const dim = (s) => (colour ? `${E}[2m${s}${E}[0m` : s);

let failures = 0;
let ran = 0;

function testCase(name, fn) {
  ran++;
  try {
    fn();
    process.stdout.write(`  ${green('ok')}   ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  ${red('FAIL')} ${name}\n`);
    process.stdout.write(`       ${red(String(err.message).replace(/\n/g, '\n       '))}\n`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ── the real document, read the same way the checker reads it ────────────────

const live = check();
function producerBytes(vocabulary) {
  const producer = live.resolved.find(
    (copy) => copy.vocabulary === vocabulary && copy.role === 'producer',
  );
  if (!producer?.bytes) {
    process.stderr.write(
      `${red('CANNOT RUN')} -- the real ${vocabulary} Installers vector could not be read ` +
        `(${producer?.problem || 'producer copy was not registered'}).\n` +
        'This suite derives its fixtures from it and refuses to run against a hand-typed substitute.\n',
    );
    process.exit(1);
  }
  return producer.bytes;
}
const BASE = JSON.parse(producerBytes('toolrisk').toString('utf8'));
const DLP_BASE = JSON.parse(producerBytes('dlp').toString('utf8'));

// ── fixture helpers ──────────────────────────────────────────────────────────

/** Deep clone, so a mutation in one case cannot leak into the next. */
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Re-derive the fields a legitimate regeneration would re-derive: the sorted
 * class list, the count, and the canonical digest. This is what the producer's
 * Go test does. Used to build the "properly synced everywhere" fixtures, so a
 * PASS in those cases proves the checker reads content rather than recognising
 * a memorised 40-name set.
 */
function reseal(doc) {
  const all = new Set();
  for (const names of Object.values(doc.tiers)) for (const n of names) all.add(n);
  doc.classes = [...all].sort();
  doc.classCount = doc.classes.length;
  doc.sha256 = canonicalCatalogDigest(doc.tiers);
  return doc;
}

function addClass(doc, cls, tier) {
  doc.tiers[tier] = [...doc.tiers[tier], cls].sort();
  return reseal(doc);
}

function resealDlp(doc) {
  doc.catalog = [...doc.catalog].sort((a, b) => a.class.localeCompare(b.class));
  doc.classes = doc.catalog.map((row) => row.class);
  doc.classCount = doc.classes.length;
  doc.sha256 = canonicalDlpCatalogDigest(doc.catalog);
  return doc;
}

function addDlpClass(doc, row) {
  doc.catalog.push(row);
  return resealDlp(doc);
}

function removeClasses(doc, names) {
  const drop = new Set(names);
  for (const tier of Object.keys(doc.tiers)) {
    doc.tiers[tier] = doc.tiers[tier].filter((n) => !drop.has(n));
  }
  return reseal(doc);
}

const serialize = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/**
 * Lay a trio down on disk. `docs` maps repo key to a document, to raw text, or
 * to `null` (repo directory exists but has no file) or `undefined` (repo
 * directory does not exist at all).
 */
function layout(docs, opts = {}, dlpDocs = null) {
  const root = mkdtempSync(join(tmpdir(), 'vocab-parity-'));
  const repoKeys = [...new Set(COPIES.map((copy) => copy.key))];
  for (const key of repoKeys) {
    if (!(key in docs)) continue;
    const copies = COPIES.filter((copy) => copy.key === key);
    const repoDir = join(root, copies[0].repoDir);
    mkdirSync(repoDir, { recursive: true });
    if (opts.git) {
      execFileSync('git', ['-C', repoDir, 'init', '-q'], { stdio: 'ignore' });
      execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'ci@local'], { stdio: 'ignore' });
      execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'ci'], { stdio: 'ignore' });
    }
    const written = [];
    for (const copy of copies) {
      const value =
        copy.vocabulary === 'toolrisk'
          ? docs[key]
          : dlpDocs
            ? dlpDocs[key]
            : docs[key] === null
              ? null
              : DLP_BASE;
      if (value === null) continue;
      const dest = join(repoDir, copy.filePath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, typeof value === 'string' ? value : serialize(value));
      written.push(dest);
    }
    if (opts.git) {
      execFileSync('git', ['-C', repoDir, 'add', '-A'], { stdio: 'ignore' });
      execFileSync('git', ['-C', repoDir, 'commit', '-qm', 'fixture'], { stdio: 'ignore' });
      if (opts.commitThenDelete) for (const dest of written) rmSync(dest);
    }
  }
  return root;
}

/**
 * Run the checker as a real process, so the exit status under test is the exit
 * status a gate would see -- not a return value from an in-process call that
 * could diverge from it.
 */
function run(root, extraArgs = []) {
  const env = { ...process.env, NO_COLOR: '1' };
  for (const copy of COPIES) delete env[copy.env];
  const r = execFileSync(
    process.execPath,
    [SCRIPT, '--root', root, ...extraArgs],
    { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return { code: 0, out: r };
}

function runAllowingFailure(root, extraArgs = []) {
  try {
    return run(root, extraArgs);
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const temps = [];
function trio(docs, opts) {
  const root = layout(docs, opts);
  temps.push(root);
  return root;
}

function dlpTrio(docs, opts) {
  const toolriskDocs = Object.fromEntries(
    Object.keys(docs).map((key) => [key, docs[key] === null ? null : BASE]),
  );
  const root = layout(toolriskDocs, opts, docs);
  temps.push(root);
  return root;
}

// ── the cases ────────────────────────────────────────────────────────────────

process.stdout.write('\nvocab-parity mutation proof\n\n');

process.stdout.write(dim('  -- the direction that matters --\n'));

testCase('identical trio -> PASS (exit 0)', () => {
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: BASE, Frontend: BASE }));
  assert(r.code === 0, `expected exit 0, got ${r.code}\n${r.out}`);
  assert(/\bPASS\b/.test(r.out), `expected PASS in output:\n${r.out}`);
});

testCase('class added in the AGENT only -> DRIFT naming the class and both consumers', () => {
  const ghost = 'ghost-detector-4-7a';
  assert(!BASE.classes.includes(ghost), 'fixture invalid: the real vector already has this class');
  const producer = addClass(clone(BASE), ghost, 'high');
  const r = runAllowingFailure(trio({ Installers: producer, Backend: BASE, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1 (DRIFT), got ${r.code}\n${r.out}`);
  assert(/\bDRIFT\b/.test(r.out), `expected DRIFT:\n${r.out}`);
  assert(r.out.includes(ghost), `output must name '${ghost}':\n${r.out}`);
  assert(/MISSING from Backend \+ Frontend/.test(r.out), `output must name the repos missing it:\n${r.out}`);
  assert(
    /NO CONSOLE CONTROL EXISTS/.test(r.out),
    `producer-only drift must say what the customer loses:\n${r.out}`,
  );
});

testCase('DLP class added in the AGENT only -> DRIFT naming the class and both consumers', () => {
  const ghost = 'acme-token';
  assert(!DLP_BASE.classes.includes(ghost), 'fixture invalid: the real DLP vector already has this class');
  const producer = addDlpClass(clone(DLP_BASE), {
    class: ghost,
    family: 'credential',
    confidence: 91,
    defaultAction: 'warn',
  });
  const r = runAllowingFailure(
    dlpTrio({ Installers: producer, Backend: DLP_BASE, Frontend: DLP_BASE }),
  );
  assert(r.code === 1, `expected exit 1 (DRIFT), got ${r.code}\n${r.out}`);
  assert(r.out.includes(ghost), `output must name '${ghost}':\n${r.out}`);
  assert(/MISSING from Backend \+ Frontend/.test(r.out), `output must name the repos missing it:\n${r.out}`);
});

testCase('THE HISTORICAL CASE: interpreter-exec + fetch-then-exec + substitution-exfil absent from both consumers -> DRIFT naming all three', () => {
  const forgotten = ['interpreter-exec', 'fetch-then-exec', 'substitution-exfil'];
  for (const cls of forgotten) {
    assert(BASE.classes.includes(cls), `fixture invalid: '${cls}' is not in the real vector`);
  }
  const stale = removeClasses(clone(BASE), forgotten);
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: stale, Frontend: stale }));
  assert(r.code === 1, `expected exit 1 (DRIFT), got ${r.code}\n${r.out}`);
  for (const cls of forgotten) {
    assert(r.out.includes(cls), `output must name '${cls}':\n${r.out}`);
  }
  assert(/MISSING from Backend \+ Frontend/.test(r.out), `must name both consumers:\n${r.out}`);
});

testCase('class copied to ONE consumer only -> DRIFT naming just the repo that lacks it', () => {
  const ghost = 'half-copied-detector';
  const withGhost = addClass(clone(BASE), ghost, 'medium');
  const r = runAllowingFailure(trio({ Installers: withGhost, Backend: withGhost, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(
    new RegExp(`class '${ghost}' is in Installers \\+ Backend but MISSING from Frontend`).test(r.out),
    `expected a single-repo callout:\n${r.out}`,
  );
});

process.stdout.write(dim('\n  -- a closed set would fail these --\n'));

testCase('a class NONE of the three has ever seen, synced correctly to all three -> PASS', () => {
  const alien = 'zz-never-existed-anywhere';
  const synced = addClass(clone(BASE), alien, 'info');
  const r = runAllowingFailure(trio({ Installers: synced, Backend: synced, Frontend: synced }));
  assert(r.code === 0, `a properly synced new class must pass; got ${r.code}\n${r.out}`);
  assert(
    r.out.includes(`${BASE.classCount + 1} classes`),
    `the count must come from the file, not a memorised 40:\n${r.out}`,
  );
});

testCase('a class removed from ALL three consistently -> PASS (the checker has no fixed roster)', () => {
  const shrunk = removeClasses(clone(BASE), ['dynamic-eval']);
  const r = runAllowingFailure(trio({ Installers: shrunk, Backend: shrunk, Frontend: shrunk }));
  assert(r.code === 0, `expected exit 0, got ${r.code}\n${r.out}`);
  assert(r.out.includes(`${BASE.classCount - 1} classes`), `count must follow the file:\n${r.out}`);
});

testCase('new class in all three but the recorded digest not refreshed -> DRIFT (hand edit)', () => {
  const alien = 'zz-hand-typed';
  const tampered = addClass(clone(BASE), alien, 'high');
  tampered.sha256 = BASE.sha256; // what a hand edit leaves behind
  const r = runAllowingFailure(trio({ Installers: tampered, Backend: tampered, Frontend: tampered }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/recorded sha256 does not describe this file/.test(r.out), `expected a digest callout:\n${r.out}`);
});

testCase('classCount left stale while classes grew -> DRIFT', () => {
  const tampered = addClass(clone(BASE), 'zz-count-drift', 'medium');
  tampered.classCount = BASE.classCount;
  const r = runAllowingFailure(trio({ Installers: tampered, Backend: tampered, Frontend: tampered }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/classCount says/.test(r.out), `expected a classCount callout:\n${r.out}`);
});

process.stdout.write(dim('\n  -- the other two contracts in the same file --\n'));

testCase('same class filed under a different severity in one repo -> DRIFT naming the tiers', () => {
  const demoted = clone(BASE);
  demoted.tiers.high = demoted.tiers.high.filter((c) => c !== 'reverse-shell');
  demoted.tiers.info = [...demoted.tiers.info, 'reverse-shell'].sort();
  reseal(demoted);
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: demoted, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(
    /class 'reverse-shell' has different severity tiers across repos/.test(r.out),
    `expected a severity callout:\n${r.out}`,
  );
  assert(/Backend=info/.test(r.out) && /=high/.test(r.out), `must name both tiers:\n${r.out}`);
});

testCase('the wire key path renamed in one repo -> DRIFT', () => {
  const renamed = clone(BASE);
  renamed.wire.section = 'toolRiskV2';
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: BASE, Frontend: renamed }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/the 'wire' block differs/.test(r.out), `expected a wire callout:\n${r.out}`);
});

testCase('a non-vocabulary field edited in one repo -> DRIFT with the first differing line', () => {
  const edited = clone(BASE);
  edited.producer = 'Someone/else';
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: edited, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(/not byte-identical/.test(r.out), `expected a byte-level callout:\n${r.out}`);
  assert(/first difference at line/.test(r.out), `expected an actionable location:\n${r.out}`);
});

process.stdout.write(dim('\n  -- line endings are not vocabulary --\n'));

testCase('CRLF-only difference -> PASS (not a false red)', () => {
  const crlf = serialize(BASE).replace(/\n/g, '\r\n');
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: crlf, Frontend: BASE }));
  assert(r.code === 0, `a pure CRLF smudge must pass; got ${r.code}\n${r.out}`);
});

testCase('CRLF normalisation is NOT a wildcard: CRLF + a real added class -> DRIFT', () => {
  const drifted = serialize(addClass(clone(BASE), 'zz-hidden-by-crlf', 'high')).replace(/\n/g, '\r\n');
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: drifted, Frontend: BASE }));
  assert(r.code === 1, `normalisation swallowed a real drift; got ${r.code}\n${r.out}`);
  assert(r.out.includes('zz-hidden-by-crlf'), `must still name the class:\n${r.out}`);
});

process.stdout.write(dim('\n  -- it refuses to pass when it cannot compare --\n'));

testCase('a sibling repository ABSENT -> NOT CHECKED (exit 2), never PASS', () => {
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: BASE }));
  assert(r.code === 2, `expected exit 2 (NOT CHECKED), got ${r.code}\n${r.out}`);
  assert(/NOT CHECKED/.test(r.out), `expected NOT CHECKED:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
  assert(!/\bOK\b/.test(r.out), `must not print OK:\n${r.out}`);
  assert(/Frontend: checkout not found/.test(r.out), `must name the missing repo:\n${r.out}`);
});

testCase('two siblings absent -> NOT CHECKED naming both', () => {
  const r = runAllowingFailure(trio({ Installers: BASE }));
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/Backend: checkout not found/.test(r.out) && /Frontend: checkout not found/.test(r.out),
    `must name both:\n${r.out}`);
});

testCase('repo present, file missing, no git -> NOT CHECKED (exit 2)', () => {
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: BASE, Frontend: null }));
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/not a git repository/.test(r.out), `must say why it could not recover a copy:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

testCase('unparseable JSON in one copy -> NOT CHECKED (exit 2), never PASS', () => {
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: '{ this is not json', Frontend: BASE }));
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/not valid JSON/.test(r.out), `expected a JSON callout:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

testCase('a different document with the same filename -> NOT CHECKED, not a silent pass', () => {
  const impostor = { format: 'something.else', formatVersion: 2, classes: [], tiers: {} };
  const r = runAllowingFailure(trio({ Installers: BASE, Backend: impostor, Frontend: BASE }));
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(/format is/.test(r.out), `expected a format callout:\n${r.out}`);
});

testCase('an explicitly requested ref that does not exist -> NOT CHECKED (exit 2)', () => {
  const root = trio({ Installers: BASE, Backend: BASE, Frontend: BASE }, { git: true });
  const r = runAllowingFailure(root, ['--ref', 'refs/heads/no-such-branch']);
  assert(r.code === 2, `expected exit 2, got ${r.code}\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
});

process.stdout.write(dim('\n  -- the git-ref path is exercised, not just the on-disk one --\n'));

testCase('committed copies read at an explicit ref -> PASS, and the ref is printed', () => {
  const root = trio({ Installers: BASE, Backend: BASE, Frontend: BASE }, { git: true });
  const r = runAllowingFailure(root, ['--ref', 'HEAD']);
  assert(r.code === 0, `expected exit 0, got ${r.code}\n${r.out}`);
  assert(/@HEAD/.test(r.out), `the source of each copy must be printed:\n${r.out}`);
});

testCase('drift caught at an explicit ref too, not only in the working tree', () => {
  const producer = addClass(clone(BASE), 'zz-committed-only', 'high');
  const root = trio({ Installers: producer, Backend: BASE, Frontend: BASE }, { git: true });
  const r = runAllowingFailure(root, ['--ref', 'HEAD']);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  assert(r.out.includes('zz-committed-only'), `must name the class:\n${r.out}`);
});

testCase('file deleted from the working tree but present at HEAD -> falls back AND says so', () => {
  const root = trio(
    { Installers: BASE, Backend: BASE, Frontend: BASE },
    { git: true, commitThenDelete: true },
  );
  const r = runAllowingFailure(root);
  assert(r.code === 0, `expected exit 0, got ${r.code}\n${r.out}`);
  assert(
    /did NOT check your working tree/.test(r.out),
    `a fallback that is not announced is a lie about what was compared:\n${r.out}`,
  );
});

process.stdout.write(dim('\n  -- every way of naming a source, not just the default one --\n'));

testCase('TOOLRISK_VOCAB_<REPO> pointing at nothing -> NOT CHECKED, and the override is printed', () => {
  const root = trio({ Installers: BASE, Backend: BASE, Frontend: BASE });
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', TOOLRISK_VOCAB_FRONTEND: 'C:/no/such/checkout' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    code = err.status;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert(code === 2, `expected exit 2, got ${code}\n${out}`);
  assert(/source overridden by TOOLRISK_VOCAB_FRONTEND/.test(out), `the override must be visible:\n${out}`);
  assert(!/\bPASS\b/.test(out), `must not print PASS:\n${out}`);
});

testCase('TOOLRISK_VOCAB_<REPO> redirected to a real copy -> that copy is what gets compared', () => {
  const good = trio({ Installers: BASE, Backend: BASE, Frontend: BASE });
  const bad = trio({ Frontend: addClass(clone(BASE), 'zz-redirected', 'high') });
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--root', good], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', TOOLRISK_VOCAB_FRONTEND: join(bad, 'Frontend') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    code = err.status;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert(code === 1, `the redirected copy must be the one compared; got ${code}\n${out}`);
  assert(out.includes('zz-redirected'), `must name the class from the redirected copy:\n${out}`);
});

testCase('--json reports the same verdict and names every source', () => {
  const producer = addClass(clone(BASE), 'zz-json-shape', 'high');
  const r = runAllowingFailure(trio({ Installers: producer, Backend: BASE, Frontend: BASE }), ['--json']);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.out}`);
  const parsed = JSON.parse(r.out);
  assert(parsed.status === 'DRIFT', `expected DRIFT, got ${parsed.status}`);
  assert(parsed.sources.length === 6, `expected 6 sources, got ${parsed.sources.length}`);
  assert(
    parsed.drift.some((d) => d.includes('zz-json-shape')),
    `the machine-readable form must name the class too:\n${r.out}`,
  );
});

process.stdout.write(dim('\n  -- the digest reimplementation matches the producer --\n'));

testCase("canonicalCatalogDigest reproduces the Go producer's recorded value", () => {
  const computed = canonicalCatalogDigest(BASE.tiers);
  assert(
    computed === BASE.sha256,
    `the JS reimplementation of canonicalCatalogDigest has diverged from Go\n` +
      `  recorded by the producer: ${BASE.sha256}\n  computed here:            ${computed}`,
  );
});

testCase("canonicalDlpCatalogDigest reproduces the DLP Go producer's recorded value", () => {
  const computed = canonicalDlpCatalogDigest(DLP_BASE.catalog);
  assert(
    computed === DLP_BASE.sha256,
    `the JS reimplementation of canonicalDlpCatalogDigest has diverged from Go\n` +
      `  recorded by the producer: ${DLP_BASE.sha256}\n  computed here:            ${computed}`,
  );
});

testCase('the digest is sensitive to a tier move that leaves the class list identical', () => {
  const moved = clone(BASE);
  moved.tiers.high = moved.tiers.high.filter((c) => c !== 'fork-bomb');
  moved.tiers.medium = [...moved.tiers.medium, 'fork-bomb'].sort();
  const before = canonicalCatalogDigest(BASE.tiers);
  const after = canonicalCatalogDigest(moved.tiers);
  assert(before !== after, 'moving a class between tiers must change the digest');
  const classesBefore = [...BASE.classes].sort().join(',');
  const classesAfter = [...new Set(Object.values(moved.tiers).flat())].sort().join(',');
  assert(classesBefore === classesAfter, 'fixture invalid: the class list changed too');
});

process.stdout.write(dim('\n  -- the live workspace --\n'));

testCase('the checker reaches a verdict on the real three repos (not NOT_CHECKED)', () => {
  const r = live;
  assert(
    r.status === 'PASS' || r.status === 'DRIFT',
    `the real workspace should be comparable; got ${r.status}:\n${r.reasons.join('\n')}`,
  );
});

testCase('each vocabulary\'s three real copies are byte-identical after CRLF normalisation', () => {
  const r = live;
  assert(r.status !== 'NOT_CHECKED', `cannot verify: ${r.reasons.join('; ')}`);
  for (const vocabulary of ['toolrisk', 'dlp']) {
    const digests = r.resolved
      .filter((x) => x.vocabulary === vocabulary)
      .map((x) => ({
        key: x.key,
        sha: createHash('sha256')
          .update(x.bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
          .digest('hex'),
      }));
    const distinct = new Set(digests.map((d) => d.sha));
    assert(
      distinct.size === 1,
      `${vocabulary} copies differ:\n${digests.map((d) => `  ${d.key} ${d.sha}`).join('\n')}`,
    );
    process.stdout.write(`       ${dim(`${vocabulary} sha256 ${[...distinct][0]}`)}\n`);
  }
});

// ── teardown + verdict ───────────────────────────────────────────────────────

for (const t of temps) {
  try {
    rmSync(t, { recursive: true, force: true });
  } catch {
    /* a leftover temp directory is not a test failure */
  }
}

process.stdout.write(`\n${failures ? red(`${failures} of ${ran} FAILED`) : green(`${ran} cases, all as stated`)}\n\n`);
process.exit(failures ? 1 : 0);
