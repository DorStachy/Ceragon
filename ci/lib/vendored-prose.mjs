#!/usr/bin/env node
/**
 * VENDORED PROSE GUARD — the two extracts Installers carries as testdata equal
 * the documents they were cut from.
 *
 * Wave 8 Task 11 (M4.7A) binds the certificate's claim renderer to the plan's
 * fenced forbidden-claims checklist and the system card's per-surface rows.
 * Those two documents live in OTHER repositories (the workspace meta-repo and
 * `docs/`), so `Installers/internal/certificate/claim_test.go` reads them in
 * this order: an explicit env var, the sibling workspace checkout, and — only
 * when neither is reachable, as in a standalone checkout or the hosted
 * `internal-candidate.yml` `go test ./...` — a VENDORED COPY under
 * `internal/certificate/testdata/`. That copy is what makes the certificate
 * tests runnable outside a side-by-side workspace (ship-ledger debt item 5).
 *
 * A vendored copy is a measurement only while it equals its source. This guard
 * is the half that proves it: it re-derives each extract from the source
 * document with the SAME rule the Go tests use, and compares bytes after
 * CRLF->LF normalisation (the card is CRLF on disk; the extracts are LF).
 *
 *   plan-checklist-rows.md   = every `<!-- forbidden-claims:begin ... -->` ...
 *                              `<!-- forbidden-claims:end -->` region of the
 *                              plan (marker lines included), in document order,
 *                              joined with one newline, plus a final newline.
 *   system-card-surfaces.md  = the `## Per-surface results` section of the
 *                              system card, from its heading to the line
 *                              before the next `## ` heading, trailing blank
 *                              lines dropped, plus a final newline.
 *
 * Exit codes follow the sibling guards: 0 equal, 1 drift (naming the file and
 * the first differing offset), 2 NOT MEASURED (a source or a copy is missing —
 * which is never a pass; a copy nobody compared is not a copy that matched).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { META_ROOT, findWorkspaceRoot } from './workspace-root.mjs';

export const EXIT_OK = 0;
export const EXIT_DRIFT = 1;
export const EXIT_NOT_MEASURED = 2;

export const PLAN_REL = '.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md';
export const CARD_REL = 'docs/ai-security/DEVOID_SYSTEM_CARD.md';
export const CHECKLIST_COPY_REL = 'Installers/internal/certificate/testdata/plan-checklist-rows.md';
export const CARD_COPY_REL = 'Installers/internal/certificate/testdata/system-card-surfaces.md';
export const CARD_SECTION_HEADING = '## Per-surface results';

const lf = (text) => text.replace(/\r\n/g, '\n');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * The plan's fenced forbidden-claims regions, marker lines included, in
 * document order, joined by one newline. Mirrors claim_test.go's fence walk:
 * markers match by PREFIX so an opening marker may carry its reason; a second
 * opening while one is open, or an unterminated fence, is an error, never a
 * silent exemption.
 */
export function extractChecklistRegions(planText) {
  const lines = lf(planText).split('\n');
  const regions = [];
  const errors = [];
  let current = null;
  let openedAt = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (current === null) {
      if (trimmed.startsWith('<!-- forbidden-claims:begin')) {
        current = [lines[i]];
        openedAt = i + 1;
      }
      continue;
    }
    if (trimmed.startsWith('<!-- forbidden-claims:begin')) {
      errors.push(
        `the fence opened at line ${openedAt} is still open when another opens at line ${i + 1}`,
      );
    }
    current.push(lines[i]);
    if (trimmed.startsWith('<!-- forbidden-claims:end')) {
      regions.push(current.join('\n'));
      current = null;
    }
  }
  if (current !== null) errors.push(`unterminated forbidden-claims fence opened at line ${openedAt}`);
  if (regions.length === 0) errors.push('the plan carries no forbidden-claims fence at all');
  return { text: `${regions.join('\n')}\n`, regions: regions.length, errors };
}

/** The `## Per-surface results` section of the card, trailing blanks dropped. */
export function extractCardSection(cardText, heading = CARD_SECTION_HEADING) {
  const lines = lf(cardText).split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return { text: null, errors: [`the system card has no "${heading}" heading`] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start, end).join('\n').replace(/\n+$/, '');
  return { text: `${body}\n`, errors: [] };
}

function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Compare both extracts against both copies.
 *
 * @param {object} opts
 * @param {string} [opts.workspaceRoot]  where Installers/ and docs/ live
 * @param {string} [opts.planPath]       overrides the plan location
 * @param {string} [opts.cardPath]
 * @param {string} [opts.checklistCopyPath]
 * @param {string} [opts.cardCopyPath]
 */
export function check(opts = {}) {
  const lines = [];
  let workspaceRoot = opts.workspaceRoot ?? null;
  if (!workspaceRoot) {
    const found = findWorkspaceRoot();
    if (!found.root) {
      lines.push(`NOT MEASURED — ${found.reason}`);
      return { status: 'NOT_MEASURED', code: EXIT_NOT_MEASURED, lines };
    }
    workspaceRoot = found.root;
    lines.push(`workspace: ${workspaceRoot} (${found.how})`);
  }

  const pairs = [
    {
      name: 'plan-checklist-rows.md',
      source: opts.planPath ?? resolve(META_ROOT, PLAN_REL),
      copy: opts.checklistCopyPath ?? resolve(workspaceRoot, CHECKLIST_COPY_REL),
      extract: (text) => {
        const out = extractChecklistRegions(text);
        return { text: out.errors.length ? null : out.text, errors: out.errors, note: `${out.regions} fenced region(s)` };
      },
    },
    {
      name: 'system-card-surfaces.md',
      source: opts.cardPath ?? resolve(workspaceRoot, CARD_REL),
      copy: opts.cardCopyPath ?? resolve(workspaceRoot, CARD_COPY_REL),
      extract: (text) => {
        const out = extractCardSection(text);
        return { text: out.text, errors: out.errors, note: `section "${CARD_SECTION_HEADING}"` };
      },
    },
  ];

  let notMeasured = 0;
  let drift = 0;
  for (const pair of pairs) {
    if (!existsSync(pair.source)) {
      notMeasured += 1;
      lines.push(`${pair.name}: NOT MEASURED — source missing: ${pair.source}`);
      continue;
    }
    if (!existsSync(pair.copy)) {
      notMeasured += 1;
      lines.push(
        `${pair.name}: NOT MEASURED — vendored copy missing: ${pair.copy} ` +
          '(the Installers checkout may predate Wave 8 Task 11; a copy nobody compared is not a copy that matched)',
      );
      continue;
    }
    const extracted = pair.extract(readFileSync(pair.source, 'utf8'));
    if (extracted.text === null) {
      notMeasured += 1;
      lines.push(`${pair.name}: NOT MEASURED — ${extracted.errors.join('; ')}`);
      continue;
    }
    const copy = lf(readFileSync(pair.copy, 'utf8'));
    if (copy === extracted.text) {
      lines.push(
        `${pair.name}: equal (${extracted.note}, ${copy.length} bytes LF, sha256 ${sha256(copy).slice(0, 12)}…)`,
      );
      continue;
    }
    drift += 1;
    const at = firstDifference(copy, extracted.text);
    lines.push(
      `${pair.name}: DRIFT — the vendored copy (${copy.length} bytes) differs from the source extract ` +
        `(${extracted.text.length} bytes) at offset ${at}: copy ${JSON.stringify(copy.slice(at, at + 60))} ` +
        `vs source ${JSON.stringify(extracted.text.slice(at, at + 60))}. Re-vendor from the source; never edit the copy by hand.`,
    );
  }

  if (drift > 0) return { status: 'DRIFT', code: EXIT_DRIFT, lines };
  if (notMeasured > 0) return { status: 'NOT_MEASURED', code: EXIT_NOT_MEASURED, lines };
  return { status: 'PASS', code: EXIT_OK, lines };
}

function main() {
  const result = check();
  for (const line of result.lines) console.log(line);
  console.log(
    result.status === 'PASS'
      ? 'PASS — both vendored prose extracts equal their sources.'
      : result.status === 'DRIFT'
        ? 'FAIL — a vendored prose extract has drifted from its source.'
        : 'NOT MEASURED — a source or a vendored copy could not be compared.',
  );
  process.exit(result.code);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
