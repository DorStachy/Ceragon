#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalizeJcs } = require('./lib/ai-security-neutral-contract-v2.cjs');
const { parseStrictJsonBytes } = require('./lib/strict-json.cjs');
const { scoreRecords } = require('./lib/ai-security-neutral-scorer.cjs');

function usage() {
  return 'usage: node scripts/score-ai-security-neutral-evaluation.cjs --cases <json|jsonl> --results <json|jsonl> [--pretty]\n';
}
function parseArguments(argv) {
  const options = { cases: null, results: null, pretty: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--pretty') options.pretty = true;
    else if (argument === '--cases' || argument === '--results') {
      const value = argv[++index];
      if (!value) throw new Error(`missing value for ${argument}`);
      options[argument.slice(2)] = value;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.cases || !options.results) throw new Error('both --cases and --results are required');
  return options;
}

function flattenJson(value, kind) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value[kind])) return value[kind];
    const singular = kind === 'cases' ? 'case' : 'result';
    if (value[singular]) return [value[singular]];
  }
  return [value];
}

function readRecords(file, kind) {
  const absolute = path.resolve(file);
  const bytes = fs.readFileSync(absolute);
  if (absolute.toLowerCase().endsWith('.jsonl')) {
    return bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim() !== '').map((line) =>
      parseStrictJsonBytes(Buffer.from(line, 'utf8')));
  }
  return flattenJson(parseStrictJsonBytes(bytes), kind);
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
  const report = scoreRecords(readRecords(options.cases, 'cases'), readRecords(options.results, 'results'));
  process.stdout.write(options.pretty ? `${JSON.stringify(report, null, 2)}\n` : `${canonicalizeJcs(report)}\n`);
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  process.stderr.write(`neutral scorer failed: ${error.message}\n`);
  process.exitCode = 65;
}
