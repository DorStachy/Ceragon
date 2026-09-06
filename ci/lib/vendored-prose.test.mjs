/**
 * Mutation proof for ci/lib/vendored-prose.mjs.
 *
 * A guard that has never been made red has not been run. Each case below
 * builds a throwaway workspace on disk (plan, card, the two vendored copies),
 * mutates ONE thing, and asserts the verdict, the exit code and the words.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  EXIT_DRIFT,
  EXIT_NOT_MEASURED,
  EXIT_OK,
  PLAN_REL,
  check,
  extractCardSection,
  extractChecklistRegions,
} from './vendored-prose.mjs';
import { META_ROOT } from './workspace-root.mjs';

const META_ROOT_PLAN = resolve(META_ROOT, PLAN_REL);

const PLAN = [
  '# Plan',
  '',
  'Prose before the fence.',
  '<!-- forbidden-claims:begin — this passage QUOTES the claim in order to refuse it. -->',
  '',
  '| # | Claim |',
  '|---|---|',
  '| 1 | zero false positives |',
  '<!-- forbidden-claims:end -->',
  'Prose between.',
  '<!-- forbidden-claims:begin -->',
  '| 2 | fully covered |',
  '<!-- forbidden-claims:end -->',
  'Prose after.',
  '',
].join('\r\n');

const CARD = [
  '# Card',
  '',
  '## Summary',
  '',
  'x',
  '',
  '## Per-surface results',
  '',
  '| Surface | ASR |',
  '|---|---|',
  '| `codex` | `null` — NOT MEASURED |',
  '',
  '---',
  '',
  '',
  '## Next section',
  'y',
  '',
].join('\r\n');

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'vendored-prose-'));
  mkdirSync(join(root, 'ci'), { recursive: true });
  writeFileSync(join(root, 'ci', 'gates.json'), '{}');
  mkdirSync(join(root, 'Installers', 'internal', 'certificate', 'testdata'), { recursive: true });
  mkdirSync(join(root, 'docs', 'ai-security'), { recursive: true });
  const plan = join(root, 'plan.md');
  const card = join(root, 'docs', 'ai-security', 'DEVOID_SYSTEM_CARD.md');
  writeFileSync(plan, PLAN);
  writeFileSync(card, CARD);
  const checklistCopy = join(root, 'Installers', 'internal', 'certificate', 'testdata', 'plan-checklist-rows.md');
  const cardCopy = join(root, 'Installers', 'internal', 'certificate', 'testdata', 'system-card-surfaces.md');
  writeFileSync(checklistCopy, extractChecklistRegions(PLAN).text);
  writeFileSync(cardCopy, extractCardSection(CARD).text);
  return {
    root,
    plan,
    card,
    checklistCopy,
    cardCopy,
    run: () => check({ workspaceRoot: root, planPath: plan, cardPath: card, checklistCopyPath: checklistCopy, cardCopyPath: cardCopy }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('the checklist extract is every fence, markers included, in order, joined by one newline', () => {
  const out = extractChecklistRegions(PLAN);
  assert.equal(out.errors.length, 0);
  assert.equal(out.regions, 2);
  const lines = out.text.split('\n');
  assert.ok(lines[0].startsWith('<!-- forbidden-claims:begin'));
  assert.ok(lines.includes('| 1 | zero false positives |'));
  assert.ok(lines.includes('| 2 | fully covered |'));
  assert.ok(!out.text.includes('Prose between.'));
  assert.ok(out.text.endsWith('<!-- forbidden-claims:end -->\n'));
  assert.ok(!out.text.includes('\r'), 'LF-normalised');
});

test('the card extract runs from the heading to the next H2 with trailing blank lines dropped', () => {
  const out = extractCardSection(CARD);
  assert.equal(out.errors.length, 0);
  assert.ok(out.text.startsWith('## Per-surface results\n'));
  assert.ok(out.text.endsWith('---\n'), 'exactly one final newline after the last non-blank line');
  assert.ok(!out.text.includes('## Next section'));
  assert.ok(!out.text.includes('\r'));
});

test('equal copies PASS with exit 0 and name both files', () => {
  const ws = workspace();
  try {
    const r = ws.run();
    assert.equal(r.status, 'PASS');
    assert.equal(r.code, EXIT_OK);
    assert.ok(r.lines.some((l) => l.startsWith('plan-checklist-rows.md: equal')));
    assert.ok(r.lines.some((l) => l.startsWith('system-card-surfaces.md: equal')));
  } finally {
    ws.cleanup();
  }
});

test('one edited byte in a vendored copy is DRIFT, exit 1, naming the file and the offset', () => {
  const ws = workspace();
  try {
    const original = readFileSync(ws.checklistCopy, 'utf8');
    writeFileSync(ws.checklistCopy, original.replace('zero false positives', 'zero false negatives'));
    const r = ws.run();
    assert.equal(r.status, 'DRIFT');
    assert.equal(r.code, EXIT_DRIFT);
    const line = r.lines.find((l) => l.startsWith('plan-checklist-rows.md: DRIFT'));
    assert.ok(line, 'the drifted file is named');
    assert.match(line, /at offset \d+/);
    assert.match(line, /never edit the copy by hand/);
    assert.ok(r.lines.some((l) => l.startsWith('system-card-surfaces.md: equal')), 'the other pair still measures');
  } finally {
    ws.cleanup();
  }
});

test('a source that changed under an unchanged copy is DRIFT too', () => {
  const ws = workspace();
  try {
    writeFileSync(ws.card, CARD.replace('NOT MEASURED', 'PASS'));
    const r = ws.run();
    assert.equal(r.status, 'DRIFT');
    assert.ok(r.lines.some((l) => l.startsWith('system-card-surfaces.md: DRIFT')));
  } finally {
    ws.cleanup();
  }
});

test('a missing vendored copy is NOT MEASURED (exit 2), never a pass', () => {
  const ws = workspace();
  try {
    rmSync(ws.cardCopy);
    const r = ws.run();
    assert.equal(r.status, 'NOT_MEASURED');
    assert.equal(r.code, EXIT_NOT_MEASURED);
    assert.ok(r.lines.some((l) => /system-card-surfaces\.md: NOT MEASURED — vendored copy missing/.test(l)));
  } finally {
    ws.cleanup();
  }
});

test('an unterminated fence in the plan is NOT MEASURED, not a shorter extract', () => {
  const ws = workspace();
  try {
    writeFileSync(ws.plan, PLAN.replace('<!-- forbidden-claims:end -->\r\nProse after.', 'Prose after.'));
    const r = ws.run();
    assert.equal(r.status, 'NOT_MEASURED');
    assert.ok(r.lines.some((l) => /unterminated forbidden-claims fence/.test(l)));
  } finally {
    ws.cleanup();
  }
});

test('a card without the per-surface heading is NOT MEASURED', () => {
  const ws = workspace();
  try {
    writeFileSync(ws.card, CARD.replace('## Per-surface results', '## Per surface'));
    const r = ws.run();
    assert.equal(r.status, 'NOT_MEASURED');
    assert.ok(r.lines.some((l) => /has no "## Per-surface results" heading/.test(l)));
  } finally {
    ws.cleanup();
  }
});

test('the real plan in this checkout carries exactly the two fenced regions the fixture was cut from', () => {
  const out = extractChecklistRegions(readFileSync(META_ROOT_PLAN, 'utf8'));
  assert.equal(out.errors.length, 0, out.errors.join('; '));
  assert.equal(out.regions, 2);
  assert.equal(resolve(META_ROOT_PLAN).endsWith('M47A_IMPLEMENTATION_PLAN.md'), true);
});
