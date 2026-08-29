#!/usr/bin/env node
/**
 * CROSS-REPO DRIFT CHECK for the tool-risk and DLP detector vocabularies.
 *
 * ── What this exists to catch ────────────────────────────────────────────────
 *
 * Each governed detector vocabulary lives as three hand-copied files in three
 * separate git repositories:
 *
 *   producer  Installers/parity-vectors/toolrisk-classes.v1.json
 *   consumer  Backend/packages/shared-contracts/toolrisk-classes.v1.json
 *   consumer  Frontend/types/vendored/toolrisk-classes.v1.json
 *
 *   producer  Installers/parity-vectors/dlp-classes.v1.json
 *   consumer  Backend/packages/shared-contracts/dlp-classes.v1.json
 *   consumer  Frontend/types/vendored/dlp-classes.v1.json
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
 *   DLP_VOCAB_INSTALLERS=<spec>
 *   DLP_VOCAB_BACKEND=<spec>
 *   DLP_VOCAB_FRONTEND=<spec>
 * A bare ref must be written `@<ref>` (e.g. `@HEAD`) so it cannot be confused
 * with a relative path.
 *
 * Exit status:
 *   0  PASS         all six files compared, and each three-copy vocabulary agrees
 *   1  DRIFT        all six files compared, and at least one vocabulary disagrees
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
 * THE TWO VOCABULARIES AND THEIR THREE COPIES EACH.
 *
 * These paths are the one thing that cannot be derived: there is no registry
 * anywhere in the workspace that records where the vocabulary was copied to.
 * Stating them here is the point of the file -- a copy this list does not name
 * is a copy nothing checks, so adding a fourth consumer means adding a line
 * here. `role` is informational: it lets the report say "the producer has it and
 * the consumers do not", which is the direction that hurts.
 */
export const VOCABULARIES = Object.freeze({
  toolrisk: Object.freeze({
    label: 'tool-risk',
    expectedFormat: 'ceragon.ai-security.toolrisk-class-catalog',
    minFormatVersion: 2,
    shape: 'tiers',
  }),
  dlp: Object.freeze({
    label: 'DLP',
    expectedFormat: 'ceragon.ai-security.dlp-class-catalog',
    minFormatVersion: 1,
    shape: 'catalog',
  }),
});

export const COPIES = [
  {
    vocabulary: 'toolrisk',
    key: 'Installers',
    role: 'producer',
    repoDir: 'Installers',
    filePath: 'parity-vectors/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_INSTALLERS',
    regenerate: 'TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/',
  },
  {
    vocabulary: 'toolrisk',
    key: 'Backend',
    role: 'consumer',
    repoDir: 'Backend',
    filePath: 'packages/shared-contracts/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_BACKEND',
    regenerate: 'copy the producer file here, then update AI_TOOL_RISK_*_CLASSES',
  },
  {
    vocabulary: 'toolrisk',
    key: 'Frontend',
    role: 'consumer',
    repoDir: 'Frontend',
    filePath: 'types/vendored/toolrisk-classes.v1.json',
    env: 'TOOLRISK_VOCAB_FRONTEND',
    regenerate: 'copy the producer file here, then update AI_TOOL_RISK_CLASSES + AI_TOOL_RISK_CLASS_META',
  },
  {
    vocabulary: 'dlp',
    key: 'Installers',
    role: 'producer',
    repoDir: 'Installers',
    filePath: 'parity-vectors/dlp-classes.v1.json',
    env: 'DLP_VOCAB_INSTALLERS',
    regenerate: 'DLP_CLASSES_UPDATE=1 go test ./internal/dlp/',
  },
  {
    vocabulary: 'dlp',
    key: 'Backend',
    role: 'consumer',
    repoDir: 'Backend',
    filePath: 'packages/shared-contracts/dlp-classes.v1.json',
    env: 'DLP_VOCAB_BACKEND',
    regenerate: 'copy the producer file here, then update AI_SECURITY_DLP_CLASSES + metadata',
  },
  {
    vocabulary: 'dlp',
    key: 'Frontend',
    role: 'consumer',
    repoDir: 'Frontend',
    filePath: 'types/vendored/dlp-classes.v1.json',
    env: 'DLP_VOCAB_FRONTEND',
    regenerate: 'copy the producer file here, then update AI_DLP_CLASSES + AI_DLP_CLASS_META',
  },
];

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

/** Reimplementation of Go's `canonicalDlpCatalogDigest` (class_catalog_test.go). */
export function canonicalDlpCatalogDigest(catalog) {
  let body = '';
  for (const row of [...catalog].sort((a, b) => a.class.localeCompare(b.class))) {
    body +=
      `${row.class}\n` +
      `  family=${row.family}\n` +
      `  confidence=${row.confidence}\n` +
      `  defaultAction=${row.defaultAction}\n`;
  }
  return `sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}`;
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
    vocabulary: copy.vocabulary,
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
  const definition = VOCABULARIES[copy.vocabulary];
  if (!definition) return { problem: `${copy.sourceLabel}: unknown vocabulary '${copy.vocabulary}'` };
  if (doc.format !== definition.expectedFormat) {
    return {
      problem: `${copy.sourceLabel}: format is ${JSON.stringify(doc.format)}, expected ${JSON.stringify(definition.expectedFormat)}`,
    };
  }
  if (!Number.isInteger(doc.formatVersion) || doc.formatVersion < definition.minFormatVersion) {
    return {
      problem: `${copy.sourceLabel}: formatVersion is ${JSON.stringify(doc.formatVersion)}, expected an integer >= ${definition.minFormatVersion}`,
    };
  }
  if (!Array.isArray(doc.classes) || doc.classes.some((x) => typeof x !== 'string')) {
    return { problem: `${copy.sourceLabel}: 'classes' is not an array of strings` };
  }
  const descriptionOf = new Map();
  const duplicated = [];

  let computedDigest;
  let descriptionName;
  if (definition.shape === 'tiers') {
    if (doc.tiers === null || typeof doc.tiers !== 'object' || Array.isArray(doc.tiers)) {
      return { problem: `${copy.sourceLabel}: 'tiers' is not an object` };
    }
    for (const [tier, names] of Object.entries(doc.tiers)) {
      if (!Array.isArray(names) || names.some((x) => typeof x !== 'string')) {
        return { problem: `${copy.sourceLabel}: tier '${tier}' is not an array of strings` };
      }
      for (const cls of names) {
        if (descriptionOf.has(cls)) duplicated.push(cls);
        descriptionOf.set(cls, tier);
      }
    }
    computedDigest = canonicalCatalogDigest(doc.tiers);
    descriptionName = 'tier';
  } else {
    if (!Array.isArray(doc.catalog)) {
      return { problem: `${copy.sourceLabel}: 'catalog' is not an array` };
    }
    for (const [index, row] of doc.catalog.entries()) {
      if (
        row === null ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        typeof row.class !== 'string' ||
        typeof row.family !== 'string' ||
        !Number.isInteger(row.confidence) ||
        typeof row.defaultAction !== 'string'
      ) {
        return {
          problem:
            `${copy.sourceLabel}: catalog row ${index} must have string class/family/defaultAction ` +
            'and integer confidence',
        };
      }
      if (descriptionOf.has(row.class)) duplicated.push(row.class);
      descriptionOf.set(
        row.class,
        JSON.stringify({
          family: row.family,
          confidence: row.confidence,
          defaultAction: row.defaultAction,
        }),
      );
    }
    computedDigest = canonicalDlpCatalogDigest(doc.catalog);
    descriptionName = 'catalog row';
  }

  return {
    text,
    doc,
    classes: new Set(doc.classes),
    descriptionOf,
    descriptionName,
    duplicated,
    classCount: doc.classCount,
    recordedDigest: doc.sha256,
    computedDigest,
    wire: doc.wire,
  };
}

/** A copy that disagrees with ITSELF is not usable as a reference for the others. */
function selfConsistencyProblems(copy, view) {
  const out = [];
  const listed = [...view.classes].sort();
  const described = [...view.descriptionOf.keys()].sort();
  if (view.doc.classes.length !== view.classes.size) {
    out.push(`${copy.key}: 'classes' contains duplicate entries`);
  }
  if (view.duplicated.length) {
    out.push(
      `${copy.key}: ${view.duplicated.sort().join(', ')} appear(s) in more than one ${view.descriptionName}`,
    );
  }
  const onlyInClasses = listed.filter((x) => !view.descriptionOf.has(x));
  const onlyInDescriptions = described.filter((x) => !view.classes.has(x));
  if (onlyInClasses.length) {
    out.push(`${copy.key}: in 'classes' but in no ${view.descriptionName}: ${onlyInClasses.join(', ')}`);
  }
  if (onlyInDescriptions.length) {
    out.push(
      `${copy.key}: in a ${view.descriptionName} but not in 'classes': ${onlyInDescriptions.join(', ')}`,
    );
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
function compareVocabulary(resolved) {
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

  // 2. PRODUCER ATTRIBUTES. A class every repo knows must carry the same tier or
  //    catalog metadata in each copy.
  for (const cls of [...union].sort()) {
    const descriptions = new Map();
    for (const r of resolved) {
      const description = views.get(r.key).descriptionOf.get(cls);
      if (description === undefined) continue;
      if (!descriptions.has(description)) descriptions.set(description, []);
      descriptions.get(description).push(r.key);
    }
    if (descriptions.size > 1) {
      const parts = [...descriptions.entries()]
        .sort()
        .map(([description, keys]) => `${keys.join('+')}=${description}`);
      const descriptionName = views.values().next().value.descriptionName;
      drift.push(
        `class '${cls}' has different ${
          descriptionName === 'tier' ? 'severity tiers' : 'catalog metadata'
        } across repos: ${parts.join(', ')}`,
      );
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

/** Compare each vocabulary only with copies carrying that vocabulary's exact schema tag. */
export function compare(resolved) {
  const byVocabulary = new Map();
  for (const vocabulary of Object.keys(VOCABULARIES)) {
    byVocabulary.set(
      vocabulary,
      compareVocabulary(resolved.filter((copy) => copy.vocabulary === vocabulary)),
    );
  }

  const notChecked = [...byVocabulary.entries()].filter(([, result]) => result.status === 'NOT_CHECKED');
  if (notChecked.length) {
    return {
      status: 'NOT_CHECKED',
      reasons: notChecked.flatMap(([vocabulary, result]) =>
        result.reasons.map((reason) => `[${vocabulary}] ${reason}`),
      ),
      drift: [],
      byVocabulary,
    };
  }

  const drift = [...byVocabulary.entries()].flatMap(([vocabulary, result]) =>
    result.drift.map((item) => `[${vocabulary}] ${item}`),
  );
  const views = new Map();
  for (const [vocabulary, result] of byVocabulary) {
    for (const [repo, view] of result.views) views.set(`${vocabulary}:${repo}`, view);
  }
  return {
    status: drift.length ? 'DRIFT' : 'PASS',
    reasons: [],
    drift,
    views,
    byVocabulary,
  };
}

export function check(opts = {}) {
  const options = { root: opts.root || resolve(CI_DIR, '..'), ref: opts.ref || null };
  const resolved = COPIES.map((copy) => resolveCopy(copy, options));
  const result = compare(resolved);
  return { ...result, resolved, options };
}

function report(result, log) {
  log(`\n${bold('detector vocabularies -- cross-repo parity')}\n`);
  for (const r of result.resolved) {
    const where = r.problem ? red('UNAVAILABLE') : dim(r.sourceLabel);
    const identity = `${r.vocabulary}/${r.key}`;
    log(`  ${identity.padEnd(24)} ${dim(`(${r.role})`)} ${where}\n`);
    log(`  ${' '.repeat(24)} ${dim(r.filePath)}\n`);
    for (const n of r.notes) log(`  ${' '.repeat(24)} ${yellow(n)}\n`);
    if (r.problem) log(`  ${' '.repeat(24)} ${red(r.problem)}\n`);
  }
  log('\n');

  if (result.status === 'NOT_CHECKED') {
    log(`${red('NOT CHECKED')} -- all six files could not be compared.\n`);
    for (const reason of result.reasons) log(`  ${red('!')} ${reason}\n`);
    log(
      dim(
        '\n  This is NOT a pass. Each vocabulary must be compared across all three\n' +
          '  repositories; with a copy missing there is nothing to compare.\n' +
          '  Point it at the checkouts with --root, --ref, or <VOCAB>_VOCAB_<REPO>.\n',
      ),
    );
    return;
  }

  if (result.status === 'DRIFT') {
    log(`${red('DRIFT')} -- at least one detector vocabulary differs across its three repos.\n\n`);
    for (const d of result.drift) log(`  ${red('x')} ${d}\n`);
    log('\n' + dim('  Fix: regenerate each drifting producer vector, then copy it to both consumers.\n'));
    for (const vocabulary of Object.keys(VOCABULARIES)) {
      const copies = result.resolved.filter((copy) => copy.vocabulary === vocabulary);
      const producer = copies.find((copy) => copy.role === 'producer');
      log(dim(`    ${vocabulary}/${producer.key}: ${producer.regenerate}\n`));
      for (const copy of copies.filter((item) => item.role === 'consumer')) {
        log(dim(`    ${vocabulary}/${copy.key}: ${copy.regenerate}\n`));
      }
    }
    return;
  }

  for (const [vocabulary, vocabularyResult] of result.byVocabulary) {
    const view = vocabularyResult.views.values().next().value;
    log(`  ${VOCABULARIES[vocabulary].label}: ${view.classes.size} classes across 3 identical copies\n`);
  }
  log(`${green('PASS')} -- 2 vocabularies x 3 copies = 6 files agree exactly.\n`);
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
            vocabulary: r.vocabulary,
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
