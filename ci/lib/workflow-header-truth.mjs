#!/usr/bin/env node
// @workspace-check workflow-header-truth
/** Fail when a workflow header asserts a trigger its `on:` block does not have. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPOS = [
  'Backend',
  'Frontend',
  'Installers',
  'Ceragon-Intelligence',
  'Static-Worker',
  'Sandbox-Worker',
  'GithubApp-Bot-Scanner-Worker',
];

const futureOrNegative =
  /\b(?:when|once|if|until|before|after|add|restore|restoring|removed|without|not|never|would|could|should|will|decision)\b/i;
const claims = [
  {
    key: 'push',
    label: 'a push trigger',
    present: /\b(?:runs?|triggers?|triggered)\b[^\n]*\bpush(?:es)?\b|\bpush(?:es)?\b[^\n]*\b(?:runs?|triggers?)\b/i,
  },
  {
    key: 'pull_request',
    label: 'a pull_request trigger',
    present:
      /\b(?:runs?|triggers?|triggered)\b[^\n]*\b(?:pull[_ -]?request|every pr)\b|\b(?:pull[_ -]?request|every pr)\b[^\n]*\b(?:runs?|triggers?)\b/i,
  },
  {
    key: 'schedule',
    label: 'a schedule trigger',
    present: /\b(?:runs?|triggers?|triggered)\b[^\n]*\b(?:nightly|daily|weekly|schedule[dn]?)\b/i,
  },
  {
    key: 'workflow_dispatch',
    label: 'a workflow_dispatch trigger',
    present: /\b(?:runs?|triggers?|triggered)\b[^\n]*\b(?:manual(?:ly)?|workflow_dispatch)\b/i,
  },
];

function workflowFiles() {
  const explicit = process.argv.slice(2);
  if (explicit.length) return explicit.map((p) => resolve(p));
  const files = [];
  for (const repo of REPOS) {
    const dir = join(ROOT, repo, '.github', 'workflows');
    if (!existsSync(dir)) {
      process.stderr.write(`workflow-header-truth: NOT CHECKED — missing ${dir}\n`);
      process.exit(2);
    }
    for (const name of readdirSync(dir)) {
      if (/\.ya?ml$/.test(name)) files.push(join(dir, name));
    }
  }
  return files.sort();
}

let errors = 0;
let checked = 0;
for (const file of workflowFiles()) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const onLine = lines.findIndex((line) => /^on:\s*(?:#.*)?$/.test(line)) + 1;
  let parsed;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    process.stderr.write(`${file} does not parse: ${error.message}\n`);
    errors += 1;
    continue;
  }
  const triggers = parsed?.on && typeof parsed.on === 'object' ? parsed.on : {};
  const header = [];
  for (let i = 0; i < lines.length && header.length < 20; i += 1) {
    if (/^\s*#/.test(lines[i])) header.push({ line: i + 1, text: lines[i].replace(/^\s*#\s?/, '') });
    if (onLine && i + 1 >= onLine) break;
  }
  for (const row of header) {
    if (futureOrNegative.test(row.text)) continue;
    for (const claim of claims) {
      if (!claim.present.test(row.text) || claim.key in triggers) continue;
      process.stderr.write(
        `${basename(file)}:${row.line} claims ${claim.label}; on: at :${onLine || '?'} has none\n`,
      );
      errors += 1;
    }
  }
  checked += 1;
}

if (errors) process.exit(1);
process.stdout.write(`workflow-header-truth: PASS (${checked} workflows)\n`);
