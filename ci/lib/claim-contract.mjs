#!/usr/bin/env node
/**
 * CLAIM-CONTRACT GUARD.
 *
 * ── What this exists to catch ────────────────────────────────────────────────
 *
 * This programme cannot certify any of its five risk lanes, and it says so in
 * its own goal statement. What it CAN do is stop a sentence that overstates the
 * result from reaching a customer. Fifteen such sentences are named — eight
 * forbidden outright by the source material's §7, seven forbidden by published
 * research about this class of product.
 *
 * A list of sentences a human is asked to remember is not a control. This is the
 * control: it greps the plan and any release note for the forbidden strings and
 * fails naming the file and line.
 *
 * ── The fenced block, and why it exists ──────────────────────────────────────
 *
 * The checklist has to QUOTE the sentences it bans, so a naive grep over the
 * plan finds fifteen "violations" in the one place they belong. Text between
 *
 *     <!-- forbidden-claims:begin -->   ...   <!-- forbidden-claims:end -->
 *
 * (or inside a ```forbidden fenced code block) is therefore exempt. Nothing else
 * is. Quoting a banned sentence outside that block — in a release note, in a
 * README, in a marketing line pasted into the plan — is the thing being caught.
 *
 * ── The half this guard REFUSES to fake ──────────────────────────────────────
 *
 * The plan's prose checklist and Wave 8 Task 11's Go renderer are deliberately
 * two artifacts, and the exit criterion is that their counts are EQUAL. The Go
 * renderer does not exist yet. This guard therefore reports the renderer side as
 * ABSENT and exits non-zero on `--require-renderer`.
 *
 * It does NOT report the renderer as holding zero entries and it does NOT report
 * 0 == 0 as agreement. A measurement nobody took is not a measurement that came
 * back empty, and an equality between a real list and a missing one is not an
 * equality. That distinction is the single most repeated defect in this
 * codebase, and a guard built to enforce honesty must not commit it itself.
 *
 *   node ci/lib/claim-contract.mjs                    # scan plan + release notes
 *   node ci/lib/claim-contract.mjs --require-renderer # also demand the Go side
 *
 * Exit 0 = no forbidden claim found outside the fence. Exit 1 = at least one was,
 * or the renderer was demanded and is absent.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PLAN = join(REPO_ROOT, '.plans', 'm47a-20260822', 'M47A_IMPLEMENTATION_PLAN.md');
export const RENDERER = join(REPO_ROOT, 'Installers', 'internal', 'certificate', 'claim_test.go');

/**
 * How much of the plan is in scope.
 *
 * The plan's TASK BODIES name every banned sentence on purpose — they are the
 * specification of this guard. Scanning them makes the guard fire on its own
 * specification, which is how a control ends up switched off. The region that
 * matters is the one a release note is written FROM: the goal statement, which
 * runs from the top of the file to the first `## Decisions this plan implements`
 * heading. Wave -1 Task 2's defeat test is stated against exactly that region.
 *
 * A release note passed on the command line is scanned in FULL. It has no
 * specification text and no reason to quote a banned sentence at all.
 */
export const PLAN_SCOPE_END = '## Decisions this plan implements';

/** Truncate a document at the scope marker. Returns the whole text if absent. */
export function planScope(text, marker = PLAN_SCOPE_END) {
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => line.trim() === marker);
  return end === -1 ? text : lines.slice(0, end).join('\n');
}

/**
 * The forbidden strings, as they would actually appear in a release note.
 *
 * These are SUBSTRINGS matched case-insensitively, not the full checklist rows.
 * A release note does not write out "43 of 55 detector classes report fnRate: 0
 * on zero attack cases" — it writes "all our detections are high quality". So
 * each entry is the shortest phrase that cannot be innocent, paired with the
 * checklist row it belongs to.
 *
 * `row` is the row number in the plan's checklist. Two entries may share a row
 * when one claim has two common spellings; `checklistRows()` counts DISTINCT
 * rows, so a second spelling never inflates the count the equality test uses.
 */
export const FORBIDDEN = [
  { row: 1, phrase: 'zero false positives' },
  { row: 1, phrase: 'no false positives' },
  { row: 2, phrase: 'all detections are high quality' },
  { row: 2, phrase: 'all our detections' },
  { row: 3, phrase: 'evasive attacks are covered' },
  { row: 4, phrase: 'high-assurance' },
  { row: 5, phrase: 'all dlp classes are governed' },
  { row: 6, phrase: 'a green scan proves' },
  { row: 7, phrase: 'dangerous production actions are prevented' },
  { row: 8, phrase: 'm4.7a is complete' },
  { row: 8, phrase: '9/10' },
  { row: 8, phrase: '9+/10' },
  { row: 9, phrase: 'proven against adaptive' },
  { row: 10, phrase: 'prompt injection success rate across' },
  { row: 11, phrase: 'protected from the moment it is installed' },
  { row: 12, phrase: 'uncontaminated corpus' },
  { row: 13, phrase: 'certified false-positive rate' },
  { row: 14, phrase: 'the classifier blocks' },
  { row: 15, phrase: 'independently validated detection' },
];

/**
 * Fence markers, matched by PREFIX so an opening marker can carry its reason:
 *
 *     <!-- forbidden-claims:begin - this passage quotes the claim to refuse it -->
 *
 * An exact-equality match would reject that line, and a fence that only works
 * when it is silent is one people open without saying why.
 */
const FENCE_PAIRS = [
  ['<!-- forbidden-claims:begin', '<!-- forbidden-claims:end'],
  ['```forbidden', '```'],
];

/**
 * Returns the set of 1-based line numbers that sit inside a forbidden fence.
 * An unterminated fence swallows the rest of the file, which would silence the
 * guard, so it is reported as an error rather than honoured.
 */
export function fencedLines(text) {
  const lines = text.split(/\r?\n/);
  const inside = new Set();
  const errors = [];
  for (const [open, close] of FENCE_PAIRS) {
    let openAt = null;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (openAt === null && line.startsWith(open)) {
        openAt = i;
        inside.add(i + 1);
        continue;
      }
      if (openAt !== null) {
        // A second opening marker while one is already open. Deleting a single
        // end-marker produces exactly this, and the next fence's end would
        // otherwise close it -- silently exempting everything in between.
        if (line.startsWith(open)) {
          errors.push(
            `"${open}" fence opened at line ${openAt + 1} is still open when another opens at ` +
              `line ${i + 1} - an end marker is missing and everything between them is exempt`
          );
        }
        inside.add(i + 1);
        if (line.startsWith(close)) openAt = null;
      }
    }
    if (openAt !== null) {
      errors.push(`unterminated "${open}" fence opened at line ${openAt + 1}`);
    }
  }
  return { inside, errors };
}

/** Scan one document for forbidden phrases outside the fence. */
export function scanText(text, label) {
  const { inside, errors } = fencedLines(text);
  const violations = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (inside.has(i + 1)) continue;
    const haystack = lines[i].toLowerCase();
    for (const entry of FORBIDDEN) {
      if (haystack.includes(entry.phrase)) {
        violations.push({
          file: label,
          line: i + 1,
          phrase: entry.phrase,
          row: entry.row,
          text: lines[i].trim(),
        });
      }
    }
  }
  return { violations, errors };
}

/**
 * Count the DISTINCT checklist rows the plan's fenced block declares, by reading
 * the leading `| <n> |` cell of each table row inside the fence. The count is
 * READ, never typed: a row added to the plan and not to the renderer is exactly
 * what the equality is for, and a literal here would hide it.
 */
export function checklistRows(text) {
  const { inside } = fencedLines(text);
  const lines = text.split(/\r?\n/);
  const rows = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!inside.has(i + 1)) continue;
    const m = /^\|\s*(\d+)\s*\|/.exec(lines[i].trim());
    if (m) rows.add(Number(m[1]));
  }
  return rows;
}

/**
 * Count the entries the Go renderer encodes.
 *
 * Returns `null` — NOT 0 — when the renderer does not exist. The caller must
 * distinguish the two. A renderer that has not been written and a renderer that
 * encodes nothing are different facts, and only one of them is a defect the
 * equality can speak to.
 */
export function rendererEntryCount(rendererPath = RENDERER) {
  if (!existsSync(rendererPath)) return null;
  const src = readFileSync(rendererPath, 'utf8');
  const matches = src.match(/^\s*\{\s*Row:\s*\d+\s*,/gm);
  return matches ? matches.length : 0;
}

/**
 * The whole check.
 *
 * @param {object} opts
 * @param {string[]} opts.documents   Absolute paths to scan. Defaults to the plan.
 * @param {boolean}  opts.requireRenderer  Fail if the Go renderer is absent.
 * @param {string}   opts.planPath    Which document carries the checklist.
 * @param {string}   opts.rendererPath
 */
export function check(opts = {}) {
  const planPath = opts.planPath ?? PLAN;
  const documents = opts.documents ?? [planPath];
  const rendererPath = opts.rendererPath ?? RENDERER;

  const out = [];
  let failed = false;

  const allViolations = [];
  for (const doc of documents) {
    if (!existsSync(doc)) {
      out.push(`MISSING  ${relative(REPO_ROOT, doc)} — asked to scan a document that is not there`);
      failed = true;
      continue;
    }
    const label = relative(REPO_ROOT, doc);
    // The plan is scanned only over its goal statement; a release note in full.
    const raw = readFileSync(doc, 'utf8');
    const body = doc === planPath ? planScope(raw) : raw;
    const { violations, errors } = scanText(body, label);
    for (const err of errors) {
      out.push(`FENCE    ${label}: ${err}`);
      failed = true;
    }
    allViolations.push(...violations);
  }

  for (const v of allViolations) {
    out.push(`FORBIDDEN ${v.file}:${v.line} — checklist row ${v.row}, "${v.phrase}"`);
    out.push(`          ${v.text}`);
    failed = true;
  }

  const planRows = existsSync(planPath) ? checklistRows(readFileSync(planPath, 'utf8')) : new Set();
  const rendererCount = rendererEntryCount(rendererPath);

  out.push(`checklist rows in ${relative(REPO_ROOT, planPath)}: ${planRows.size}`);
  if (rendererCount === null) {
    out.push(
      `renderer entries in ${relative(REPO_ROOT, rendererPath)}: ABSENT — the file does not exist. ` +
        'This is NOT zero and the counts are NOT equal; the second side of the equality has not ' +
        'been written. Wave 8 Task 11 owns it.'
    );
    if (opts.requireRenderer) failed = true;
  } else {
    out.push(`renderer entries in ${relative(REPO_ROOT, rendererPath)}: ${rendererCount}`);
    if (rendererCount !== planRows.size) {
      out.push(
        `DRIFT    the plan checklist carries ${planRows.size} rows; the renderer encodes ` +
          `${rendererCount}. Neither side may grow alone.`
      );
      failed = true;
    }
  }

  if (planRows.size === 0) {
    out.push('EMPTY    the plan carries no fenced checklist rows at all — the fence is missing or renamed');
    failed = true;
  }

  out.push(failed ? 'claim-contract: FAIL' : 'claim-contract: PASS');
  return { ok: !failed, lines: out, planRows: planRows.size, rendererCount };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = check({ requireRenderer: process.argv.includes('--require-renderer') });
  console.log(result.lines.join('\n'));
  process.exit(result.ok ? 0 : 1);
}
