#!/usr/bin/env node
'use strict';

// P1-E07 — cross-engine differential report driver.
//
// This is the multi-engine sibling of score-ai-security-neutral-evaluation.cjs
// (the single-engine exact scorer, which is frozen in the contract-spine tooling
// provenance and therefore left byte-for-byte unchanged). It runs the migrated
// neutral corpus through EACH engine and emits a content-free composite report
// with PER-ENGINE confusion + cluster-aware n_eff and CROSS-ENGINE differential.
// It reuses the exact scorer library, so a match still requires span + tier +
// eligibility + credential-role + validation + decision + obligation — never a
// class-multiset-only pass.
//
// Modes:
//   ingest      : --cases <cases.jsonl> --results <engineId>=<file> [--results ...]
//   orchestrate : --corpus <entries.jsonl> --installers-dir <dir> [--results <engineId>=<file>]
//                 (spawns the Go cmd/ai-security-neutral engine over the shared
//                  surfaces and the browser emit-neutral-results engine over all
//                  entries; extra --results ingest e.g. a Backend engine result set)

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { canonicalizeJcs } = require('./lib/ai-security-neutral-contract-v2.cjs');
const { parseStrictJsonBytes } = require('./lib/strict-json.cjs');
const { computeDifferentialReport } = require('./lib/ai-security-neutral-differential.cjs');

const PLACEHOLDER_DIGEST = 'sha256:' + 'a'.repeat(64);
const RUNNER_CORPUS_FORMAT = 'ceragon.ai-security.neutral-evaluation-runner-corpus';

function usage() {
  return [
    'usage:',
    '  ingest      : node scripts/score-ai-security-neutral-differential.cjs --cases <cases.jsonl> --results <engineId>=<file> [--results ...] [--pretty]',
    '  orchestrate : node scripts/score-ai-security-neutral-differential.cjs --corpus <entries.jsonl> --installers-dir <dir> [--results <engineId>=<file>] [--pretty]',
    '',
  ].join('\n');
}

function parseArguments(argv) {
  const options = { cases: null, results: [], pretty: false, corpus: null, installersDir: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--pretty') options.pretty = true;
    else if (argument === '--cases' || argument === '--corpus' || argument === '--installers-dir') {
      const value = argv[++index];
      if (!value) throw new Error(`missing value for ${argument}`);
      if (argument === '--cases') options.cases = value;
      else if (argument === '--corpus') options.corpus = value;
      else options.installersDir = value;
    } else if (argument === '--results') {
      const value = argv[++index];
      if (!value) throw new Error('missing value for --results');
      options.results.push(value);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function readRecords(file) {
  const absolute = path.resolve(file);
  const bytes = fs.readFileSync(absolute);
  if (absolute.toLowerCase().endsWith('.jsonl')) {
    return bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim() !== '')
      .map((line) => parseStrictJsonBytes(Buffer.from(line, 'utf8')));
  }
  const parsed = parseStrictJsonBytes(bytes);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readEntries(file) {
  const absolute = path.resolve(file);
  const text = fs.readFileSync(absolute, 'utf8');
  if (absolute.toLowerCase().endsWith('.jsonl')) {
    return text.split(/\r?\n/).filter((line) => line.trim() !== '').map((line) => parseStrictJsonBytes(Buffer.from(line, 'utf8')));
  }
  const parsed = parseStrictJsonBytes(Buffer.from(text, 'utf8'));
  if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function runGoEngine(entries, installersDir) {
  const goEntries = entries.filter((entry) => entry.surface !== 'upload');
  if (goEntries.length === 0) return null;
  const bin = path.join(os.tmpdir(), process.platform === 'win32' ? 'ai-security-neutral-diff.exe' : 'ai-security-neutral-diff');
  const build = spawnSync('go', ['build', '-o', bin, './cmd/ai-security-neutral'], {
    cwd: installersDir, encoding: 'utf8',
    env: { ...process.env, GOCACHE: process.env.GOCACHE || 'C:/tmp/ceragon-m47-go-cache' },
    maxBuffer: 64 * 1024 * 1024, timeout: 300000,
  });
  if (build.status !== 0) throw new Error(`go build failed: ${build.stderr || build.error}`);
  const corpusFile = path.join(os.tmpdir(), 'neutral-diff-go-corpus.json');
  fs.writeFileSync(corpusFile, JSON.stringify({ format: RUNNER_CORPUS_FORMAT, formatVersion: 2, entries: goEntries }));
  const run = spawnSync(bin, ['--input', corpusFile, '--artifact-digest', PLACEHOLDER_DIGEST], {
    cwd: installersDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000,
  });
  if (run.status !== 0) throw new Error(`go runner failed: ${run.stderr || run.error}`);
  return { engineId: 'go-ai-security-module', runnerId: 'go-module-v2', results: JSON.parse(run.stdout) };
}

function runBrowserEngine(corpusPath, installersDir) {
  const script = path.join('browser-extension', 'scripts', 'emit-neutral-results.mjs');
  const run = spawnSync('node', [script, path.resolve(corpusPath), '--artifact-digest', PLACEHOLDER_DIGEST], {
    cwd: installersDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 300000,
  });
  if (run.status !== 0) throw new Error(`browser emitter failed: ${run.stderr || run.error}`);
  return { engineId: 'browser-ai-security-module', runnerId: 'browser-module-v2', results: JSON.parse(run.stdout) };
}

function ingestResultEngines(specs) {
  return specs.map((spec) => {
    const eq = spec.indexOf('=');
    if (eq < 0) throw new Error(`--results must be <engineId>=<file>, got ${spec}`);
    const engineId = spec.slice(0, eq);
    const results = readRecords(spec.slice(eq + 1));
    const runnerId = results.length && results[0].runner ? results[0].runner.runnerId : engineId;
    return { engineId, runnerId, results };
  });
}

function build(options) {
  const engines = [];
  let cases;
  if (options.corpus) {
    if (!options.installersDir) throw new Error('--corpus requires --installers-dir to run the Go/browser engines');
    const entries = readEntries(options.corpus);
    cases = entries.map((entry) => entry.case);
    const go = runGoEngine(entries, options.installersDir);
    if (go) engines.push(go);
    engines.push(runBrowserEngine(options.corpus, options.installersDir));
    engines.push(...ingestResultEngines(options.results));
  } else {
    if (!options.cases) throw new Error('ingest mode requires --cases (or --corpus for orchestration)');
    cases = readRecords(options.cases);
    engines.push(...ingestResultEngines(options.results));
  }
  if (engines.length === 0) throw new Error('need at least one engine (via --corpus orchestration or --results <engineId>=<file>)');
  engines.sort((a, b) => (a.engineId === 'go-ai-security-module' ? -1 : b.engineId === 'go-ai-security-module' ? 1 : a.engineId.localeCompare(b.engineId)));
  return computeDifferentialReport(cases, engines);
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n${usage()}`);
  process.exitCode = 64;
  return;
}

try {
  const report = build(options);
  process.stdout.write(options.pretty ? `${JSON.stringify(report, null, 2)}\n` : `${canonicalizeJcs(report)}\n`);
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  process.stderr.write(`neutral differential failed: ${error.message}\n`);
  process.exitCode = 65;
}
