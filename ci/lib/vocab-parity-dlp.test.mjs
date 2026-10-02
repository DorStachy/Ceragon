#!/usr/bin/env node
/**
 * MUTATION PROOF for the DLP leg of `vocab-parity.mjs` (DD3-W3-04).
 *
 * The DLP class catalogue lives as three copies in three repositories:
 *
 *   producer  Installers/parity-vectors/dlp-classes.v1.json
 *   consumer  Backend/packages/shared-contracts/dlp-classes.v1.json
 *   consumer  Frontend/types/vendored/dlp-classes.v1.json
 *
 * Every case below lays a trio down in a temp directory, mutates it, runs the
 * checker as a real process with `--vocab dlp`, and asserts the exit status AND
 * the words in its output. The base document is the real producer vector read
 * through the checker's own resolver; if it cannot be read the suite FAILS
 * rather than falling back to a hand-typed substitute.
 *
 *   node ci/lib/vocab-parity-dlp.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COPIES, DLP_COPIES, canonicalDlpCatalogDigest, check } from './vocab-parity.mjs';

const CI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(CI_DIR, 'lib', 'vocab-parity.mjs');

let failures = 0;
let ran = 0;

function testCase(name, fn) {
  ran++;
  try {
    fn();
    process.stdout.write(`  ok   ${name}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  FAIL ${name}\n       ${String(err.message).replace(/\n/g, '\n       ')}\n`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// ── the real document ────────────────────────────────────────────────────────

const live = check({ vocab: 'dlp' });
if (!live.resolved[0].bytes) {
  process.stderr.write(
    `CANNOT RUN -- the real Installers DLP vector could not be read (${live.resolved[0].problem}).\n` +
      'This suite derives its fixtures from it and refuses to run against a hand-typed substitute.\n',
  );
  process.exit(1);
}
const BASE = JSON.parse(live.resolved[0].bytes.toString('utf8'));
if (!Array.isArray(BASE.catalog) || BASE.catalog.length < 2) {
  process.stderr.write('CANNOT RUN -- the real DLP vector has no usable catalog.\n');
  process.exit(1);
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** What a legitimate regeneration re-derives: sorted rows, classes, count, digest. */
function reseal(doc) {
  doc.catalog.sort((a, b) => (a.class < b.class ? -1 : a.class > b.class ? 1 : 0));
  doc.classes = doc.catalog.map((r) => r.class);
  doc.classCount = doc.classes.length;
  doc.sha256 = canonicalDlpCatalogDigest(doc.catalog);
  return doc;
}

const withoutClass = (doc, cls) => {
  doc.catalog = doc.catalog.filter((r) => r.class !== cls);
  return reseal(doc);
};

const serialize = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/**
 * `docs` maps repo key to a document, raw text, `null` (repo directory exists,
 * file does not) or leaves the key out (repo directory does not exist).
 */
const temps = [];
function trio(docs) {
  const root = mkdtempSync(join(tmpdir(), 'vocab-parity-dlp-'));
  temps.push(root);
  for (const copy of DLP_COPIES) {
    if (!(copy.key in docs)) continue;
    const repoDir = join(root, copy.repoDir);
    mkdirSync(repoDir, { recursive: true });
    const value = docs[copy.key];
    if (value === null) continue;
    const file = join(repoDir, copy.filePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof value === 'string' ? value : serialize(value));
  }
  return root;
}

function run(root, extraArgs = [], env = {}) {
  const base = { ...process.env, NO_COLOR: '1', ...env };
  for (const copy of [...COPIES, ...DLP_COPIES]) if (!(copy.env in env)) delete base[copy.env];
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--vocab', 'dlp', '--root', root, ...extraArgs], {
      encoding: 'utf8',
      env: base,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const VICTIM = BASE.catalog[Math.floor(BASE.catalog.length / 2)].class;

process.stdout.write('\nvocab-parity DLP leg mutation proof\n\n');

testCase('identical trio -> PASS (exit 0) and the count follows the file', () => {
  const r = run(trio({ Installers: BASE, Backend: BASE, Frontend: BASE }));
  assert(r.code === 0, `expected exit 0, got ${r.code}:\n${r.out}`);
  assert(/\bPASS\b/.test(r.out), `expected PASS:\n${r.out}`);
  assert(r.out.includes(`${BASE.classCount} classes`), `must report the file's own count:\n${r.out}`);
});

testCase('one class deleted from the FRONTEND copy -> DRIFT naming the class and Frontend', () => {
  const r = run(trio({ Installers: BASE, Backend: BASE, Frontend: withoutClass(clone(BASE), VICTIM) }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(/\bDRIFT\b/.test(r.out), `expected DRIFT:\n${r.out}`);
  assert(
    r.out.includes(`class '${VICTIM}' is in Installers + Backend but MISSING from Frontend`),
    `must name the class and the repo missing it:\n${r.out}`,
  );
});

testCase('a class added in the AGENT only -> DRIFT, NO CONSOLE CONTROL, both consumers named', () => {
  const agent = clone(BASE);
  agent.catalog.push({ class: 'zz-agent-only-key', family: 'credential', confidence: 90, defaultAction: 'warn' });
  const r = run(trio({ Installers: reseal(agent), Backend: BASE, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(/MISSING from Backend \+ Frontend/.test(r.out), `must name both consumers:\n${r.out}`);
  assert(/NO CONSOLE CONTROL EXISTS/.test(r.out), `must state the consequence:\n${r.out}`);
});

testCase('the Frontend FILE missing (repo present, no git) -> NOT CHECKED (exit 2), never PASS', () => {
  const r = run(trio({ Installers: BASE, Backend: BASE, Frontend: null }));
  assert(r.code === 2, `expected exit 2, got ${r.code}:\n${r.out}`);
  assert(/NOT CHECKED/.test(r.out), `expected NOT CHECKED:\n${r.out}`);
  assert(!/\bPASS\b/.test(r.out), `must not print PASS:\n${r.out}`);
  assert(/types\/vendored\/dlp-classes\.v1\.json is not in the working tree/.test(r.out), `must name the file:\n${r.out}`);
});

testCase('the Backend checkout absent -> NOT CHECKED naming it', () => {
  const r = run(trio({ Installers: BASE, Frontend: BASE }));
  assert(r.code === 2, `expected exit 2, got ${r.code}:\n${r.out}`);
  assert(/Backend: checkout not found/.test(r.out), `must name the missing repo:\n${r.out}`);
});

testCase('a default action changed in one consumer (resealed) -> DRIFT naming both rows', () => {
  const backend = clone(BASE);
  const row = backend.catalog.find((r) => r.class === VICTIM);
  row.defaultAction = row.defaultAction === 'block' ? 'warn' : 'block';
  const r = run(trio({ Installers: BASE, Backend: reseal(backend), Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(
    r.out.includes(`class '${VICTIM}' has a different catalog row across repos`),
    `must name the class:\n${r.out}`,
  );
  assert(r.out.includes(`Backend=family=${row.family}`), `must show the Backend row:\n${r.out}`);
  assert(r.out.includes('Installers+Frontend='), `must show the other row:\n${r.out}`);
});

testCase('a row removed without refreshing the digest -> DRIFT (hand edit)', () => {
  const edited = clone(BASE);
  edited.catalog = edited.catalog.filter((r) => r.class !== VICTIM);
  edited.classes = edited.classes.filter((c) => c !== VICTIM);
  edited.classCount = edited.classes.length;
  const r = run(trio({ Installers: BASE, Backend: BASE, Frontend: edited }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(/recorded sha256 does not describe this file's own catalog rows/.test(r.out), `expected a digest callout:\n${r.out}`);
});

testCase("a class listed in 'classes' with no catalog row -> DRIFT", () => {
  const edited = clone(BASE);
  edited.catalog = edited.catalog.filter((r) => r.class !== VICTIM);
  edited.sha256 = canonicalDlpCatalogDigest(edited.catalog);
  const r = run(trio({ Installers: BASE, Backend: edited, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(r.out.includes(`in 'classes' but has no 'catalog' row: ${VICTIM}`), `must name the orphan:\n${r.out}`);
});

testCase('a non-vocabulary field edited in one copy -> DRIFT with the first differing line', () => {
  const r = run(trio({ Installers: BASE, Backend: { ...clone(BASE), note: 'edited by hand' }, Frontend: BASE }));
  assert(r.code === 1, `expected exit 1, got ${r.code}:\n${r.out}`);
  assert(/not byte-identical/.test(r.out) && /first difference at line/.test(r.out), `expected a byte callout:\n${r.out}`);
});

testCase('CRLF-only difference -> PASS (not a false red)', () => {
  const r = run(trio({ Installers: BASE, Backend: serialize(BASE).replace(/\n/g, '\r\n'), Frontend: BASE }));
  assert(r.code === 0, `expected exit 0, got ${r.code}:\n${r.out}`);
});

testCase('the tool-risk document under the DLP filename -> NOT CHECKED, not a silent pass', () => {
  const r = run(trio({ Installers: BASE, Backend: BASE, Frontend: { format: 'ceragon.ai-security.toolrisk-class-catalog', formatVersion: 2, classes: [] } }));
  assert(r.code === 2, `expected exit 2, got ${r.code}:\n${r.out}`);
  assert(/format is/.test(r.out), `expected a format callout:\n${r.out}`);
});

testCase('DLP_VOCAB_FRONTEND pointing at nothing -> NOT CHECKED, and the override is printed', () => {
  const root = trio({ Installers: BASE, Backend: BASE, Frontend: BASE });
  const r = run(root, [], { DLP_VOCAB_FRONTEND: join(root, 'no-such-dir') });
  assert(r.code === 2, `expected exit 2, got ${r.code}:\n${r.out}`);
  assert(/source overridden by DLP_VOCAB_FRONTEND/.test(r.out), `the override must be visible:\n${r.out}`);
});

testCase('--vocab all: a trio with only DLP files is NOT CHECKED overall (the tool-risk leg cannot compare)', () => {
  const root = trio({ Installers: BASE, Backend: BASE, Frontend: BASE });
  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [SCRIPT, '--vocab', 'all', '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    code = err.status;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert(code === 2, `expected exit 2 (worst leg), got ${code}:\n${out}`);
  assert(/DLP class vocabulary -- cross-repo parity/.test(out) && /\bPASS\b/.test(out), `the DLP leg must still report:\n${out}`);
  assert(/NOT CHECKED/.test(out), `the tool-risk leg must say NOT CHECKED:\n${out}`);
});

testCase("canonicalDlpCatalogDigest reproduces the Go producer's recorded value", () => {
  assert(
    canonicalDlpCatalogDigest(BASE.catalog) === BASE.sha256,
    `computed ${canonicalDlpCatalogDigest(BASE.catalog)}, recorded ${BASE.sha256}`,
  );
});

testCase('the checker reaches a verdict on the real three repos (not NOT_CHECKED)', () => {
  assert(live.status !== 'NOT_CHECKED', `real repos were not compared: ${live.reasons.join('; ')}`);
});

for (const t of temps) rmSync(t, { recursive: true, force: true });
process.stdout.write(`\n${ran} cases, ${failures ? `${failures} FAILED` : 'all as stated'}\n`);
process.exit(failures ? 1 : 0);
