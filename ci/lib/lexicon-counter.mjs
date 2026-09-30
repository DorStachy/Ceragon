#!/usr/bin/env node
/**
 * LEXICON COUNTER: plan rule 6, KC-43.
 *
 * "Net growth per round <= 8 regexes and <= 75 lexicon forms across promptrisk
 * and its browser twin, whoever commits ... A CI script counts entries against
 * the recorded baseline; every entry carries provenance." The prompt lane grew
 * from 38 to 147 regexes while the unseen miss rate stayed flat; this is the
 * counter that makes the next 100 visible before they land.
 *
 * WHAT IS COUNTED (gates.v1.json `lexicon.sources`, signed with the gates):
 *   go.regexes       call sites of regexp.{MustCompile,Compile,MustCompilePOSIX,CompilePOSIX}
 *                    in the non-test .go files under internal/promptrisk/ (comments and
 *                    strings excluded). 147 at the plan's count, reproduced exactly.
 *   go.forms         every string in every array of internal/promptrisk/lexicon/prompt-lexicon.v1.json.
 *                    1,471 at 6bfb3d82, reproduced exactly.
 *   browser.regexes  regex literals plus RegExp(...) call sites in browser-extension/src/promptrisk.js
 *   browser.forms    the same rule over the generated lexicon block embedded in that file
 * The cap applies to each engine: a regex mirrored into the twin is counted once
 * per engine, never twice against one cap, and a regex added to only one engine
 * still counts against that engine.
 *
 * AGAINST WHAT: the current round's Installers base commit (gates.v1.json
 * rounds.<R>.base.Installers). The counts at that base are recomputed on every
 * run and must equal rounds.<R>.lexiconBaseline, so a changed counting rule or a
 * moved base is caught rather than silently resetting the budget.
 *
 * PROVENANCE: every entry present at the ref and absent at the base (a multiset
 * difference, so a moved regex is not new) needs a line in the provenance file
 * naming the round, the unit and its source (a brief, a family-level miss, a
 * defect). An entry without one fails, whoever committed it.
 *
 *   node ci/lib/lexicon-counter.mjs [--root <ws>] [--repo Installers=<path>[@ref]] [--ref <ref>] [--json]
 *
 * Exit: 0 within cap and every new entry provenanced; 1 over cap or an entry
 * without provenance (KC-43: the round's release candidate is refused); 2 NOT
 * CHECKED (a source, the base or the recorded baseline is missing); 3 usage.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT,
  UsageError,
  listTree,
  loadCoordination,
  parseArgs,
  parseStrictJSON,
  readBlobs,
  readLedger,
  resolveCheckouts,
  resolveCommit,
  roundOf,
  scoreboardDirOf,
  sha256,
  git,
  utcDay,
} from './coordination.mjs';

// ─── lexers ──────────────────────────────────────────────────────────────────

/** Go source -> ordered segments {kind: code|str|comment, start, end}. */
export function lexGo(src) {
  const segs = [];
  const n = src.length;
  let i = 0;
  let codeStart = 0;
  const flush = (end) => {
    if (end > codeStart) segs.push({ kind: 'code', start: codeStart, end });
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      flush(i);
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      segs.push({ kind: 'comment', start: i, end });
      i = codeStart = end;
    } else if (c === '/' && src[i + 1] === '*') {
      flush(i);
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      segs.push({ kind: 'comment', start: i, end });
      i = codeStart = end;
    } else if (c === '"' || c === "'") {
      flush(i);
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      segs.push({ kind: 'str', start: i, end: j + 1 });
      i = codeStart = j + 1;
    } else if (c === '`') {
      flush(i);
      const e = src.indexOf('`', i + 1);
      const end = e < 0 ? n : e + 1;
      segs.push({ kind: 'str', start: i, end });
      i = codeStart = end;
    } else i += 1;
  }
  flush(n);
  return segs;
}

const JS_REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await',
]);

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.type === 'word') return JS_REGEX_KEYWORDS.has(prev.value);
  if (prev.type === 'punct') return prev.value !== ')' && prev.value !== ']';
  return false; // a number, or the end of a string/template/regex
}

/**
 * JavaScript source -> ordered segments {kind: code|str|comment|regex}. A
 * template literal's text is `str` and each `${...}` inside it is `code` again,
 * so a regex written inside a template expression is still seen. A `/` is a
 * regex when the previous significant token cannot end an expression.
 */
export function lexJs(src) {
  const segs = [];
  const n = src.length;
  const exprDepth = []; // brace depth inside each open ${ ... }
  let i = 0;
  let codeStart = 0;
  let mode = 'code';
  let prev = null;
  const flush = (end) => {
    if (end > codeStart) segs.push({ kind: 'code', start: codeStart, end });
  };
  while (i < n) {
    if (mode === 'template') {
      let j = i;
      while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      if (j >= n) {
        segs.push({ kind: 'str', start: i, end: n });
        i = n;
        break;
      }
      if (src[j] === '`') {
        segs.push({ kind: 'str', start: i, end: j + 1 });
        i = codeStart = j + 1;
        mode = 'code';
        prev = { type: 'close' };
      } else {
        segs.push({ kind: 'str', start: i, end: j + 2 });
        exprDepth.push(0);
        i = codeStart = j + 2;
        mode = 'code';
        prev = { type: 'punct', value: '{' };
      }
      continue;
    }
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      flush(i);
      const e = src.indexOf('\n', i);
      const end = e < 0 ? n : e;
      segs.push({ kind: 'comment', start: i, end });
      i = codeStart = end;
    } else if (c === '/' && src[i + 1] === '*') {
      flush(i);
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      segs.push({ kind: 'comment', start: i, end });
      i = codeStart = end;
    } else if (c === '"' || c === "'") {
      flush(i);
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      segs.push({ kind: 'str', start: i, end: j + 1 });
      i = codeStart = j + 1;
      prev = { type: 'close' };
    } else if (c === '`') {
      flush(i);
      codeStart = i;
      i += 1;
      mode = 'template';
      // the opening backtick belongs to the first template text segment
      const last = { start: codeStart };
      let j = i;
      while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      if (j >= n) {
        segs.push({ kind: 'str', start: last.start, end: n });
        i = n;
      } else if (src[j] === '`') {
        segs.push({ kind: 'str', start: last.start, end: j + 1 });
        i = codeStart = j + 1;
        mode = 'code';
        prev = { type: 'close' };
      } else {
        segs.push({ kind: 'str', start: last.start, end: j + 2 });
        exprDepth.push(0);
        i = codeStart = j + 2;
        mode = 'code';
        prev = { type: 'punct', value: '{' };
      }
    } else if (c === '/') {
      if (regexAllowed(prev)) {
        flush(i);
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const ch = src[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '\n') break;
          if (inClass) {
            if (ch === ']') inClass = false;
          } else if (ch === '[') inClass = true;
          else if (ch === '/') break;
          j += 1;
        }
        j += 1;
        while (j < n && /[a-z]/i.test(src[j])) j += 1;
        segs.push({ kind: 'regex', start: i, end: j });
        i = codeStart = j;
        prev = { type: 'close' };
      } else {
        prev = { type: 'punct', value: '/' };
        i += 1;
      }
    } else if (c === '{') {
      if (exprDepth.length) exprDepth[exprDepth.length - 1] += 1;
      prev = { type: 'punct', value: '{' };
      i += 1;
    } else if (c === '}') {
      if (exprDepth.length && exprDepth[exprDepth.length - 1] === 0) {
        flush(i);
        exprDepth.pop();
        // the closing brace is template syntax, part of the next text segment
        i += 1;
        let j = i;
        while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
        if (j >= n) {
          segs.push({ kind: 'str', start: i - 1, end: n });
          i = codeStart = n;
        } else if (src[j] === '`') {
          segs.push({ kind: 'str', start: i - 1, end: j + 1 });
          i = codeStart = j + 1;
          prev = { type: 'close' };
        } else {
          segs.push({ kind: 'str', start: i - 1, end: j + 2 });
          exprDepth.push(0);
          i = codeStart = j + 2;
          prev = { type: 'punct', value: '{' };
        }
        continue;
      }
      if (exprDepth.length) exprDepth[exprDepth.length - 1] -= 1;
      prev = { type: 'punct', value: '}' };
      i += 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j += 1;
      prev = { type: 'word', value: src.slice(i, j) };
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) j += 1;
      prev = { type: 'num' };
      i = j;
    } else if (/\s/.test(c)) {
      i += 1;
    } else {
      prev = { type: 'punct', value: c };
      i += 1;
    }
  }
  flush(n);
  return segs;
}

/** The source text of the call argument list opened at `openIdx`, comments dropped. */
function argumentText(src, segs, openIdx) {
  let depth = 0;
  let out = '';
  for (const seg of segs) {
    if (seg.end <= openIdx) continue;
    const from = Math.max(seg.start, openIdx);
    if (seg.kind === 'comment') continue;
    if (seg.kind !== 'code') {
      out += src.slice(from, seg.end);
      continue;
    }
    for (let k = from; k < seg.end; k += 1) {
      const ch = src[k];
      if (ch === '(') {
        depth += 1;
        if (depth === 1) continue;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) return out;
      }
      out += ch;
    }
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function lineOf(src, idx) {
  let line = 1;
  for (let k = 0; k < idx; k += 1) if (src.charCodeAt(k) === 10) line += 1;
  return line;
}

const GO_REGEXP_CALL = /\bregexp\s*\.\s*(MustCompilePOSIX|MustCompile|CompilePOSIX|Compile)\s*\(/g;
const JS_REGEXP_CALL = /(?:\bnew\s+)?\bRegExp\s*\(/g;

/** Regex call sites in one Go file: [{line, fn, id}] (id = digest of the argument source). */
export function goRegexSites(src) {
  const segs = lexGo(src);
  const out = [];
  for (const seg of segs) {
    if (seg.kind !== 'code') continue;
    const text = src.slice(seg.start, seg.end);
    for (const m of text.matchAll(GO_REGEXP_CALL)) {
      const open = seg.start + m.index + m[0].length - 1;
      out.push({ line: lineOf(src, open), fn: m[1], id: sha256(`go\u0000${norm(argumentText(src, segs, open))}`) });
    }
  }
  return out;
}

/** Regex literals and RegExp(...) call sites in one JS file. */
export function jsRegexSites(src) {
  const segs = lexJs(src);
  const out = [];
  for (const seg of segs) {
    if (seg.kind === 'regex') {
      out.push({ line: lineOf(src, seg.start), id: sha256(`js\u0000${src.slice(seg.start, seg.end)}`) });
    } else if (seg.kind === 'code') {
      const text = src.slice(seg.start, seg.end);
      for (const m of text.matchAll(JS_REGEXP_CALL)) {
        const open = seg.start + m.index + m[0].length - 1;
        out.push({ line: lineOf(src, open), id: sha256(`js\u0000RegExp(${norm(argumentText(src, segs, open))})`) });
      }
    }
  }
  return out;
}

/** Every string in every array of a lexicon document, with its key path. */
export function collectForms(doc) {
  const out = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string') out.push({ path, form: x });
        else walk(x, path);
      }
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}/${k}` : k);
    }
  };
  walk(doc, '');
  return out;
}

export const BROWSER_LEXICON_BEGIN = '// BEGIN GENERATED LEXICON v1';
export const BROWSER_LEXICON_END = '// END GENERATED LEXICON v1';

/** The lexicon document the browser twin embeds, or null when the block is absent or malformed. */
export function extractBrowserLexicon(src) {
  const b = src.indexOf(BROWSER_LEXICON_BEGIN);
  const e = src.indexOf(BROWSER_LEXICON_END);
  if (b < 0 || e < 0 || e < b) return null;
  const block = src.slice(b, e);
  const open = block.indexOf('{', block.indexOf('lexDeepFreeze('));
  const close = block.lastIndexOf('}');
  if (open < 0 || close < open) return null;
  try {
    return JSON.parse(block.slice(open, close + 1));
  } catch {
    return null;
  }
}

const formKey = (f) => `${f.path}\u0000${f.form}`;

/**
 * Count both engines at one commit. Returns { go, browser, problems } where
 * each engine is { regexes, forms, regexSites: [{file,line,id}], formList }.
 */
export function countAt(dir, ref, sources) {
  const problems = [];
  const files = listTree(dir, ref, sources.goPackage);
  if (!files) problems.push(`${sources.goPackage} is not readable at ${ref}`);
  const goFiles = (files || []).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
  if (files && !goFiles.length) problems.push(`${sources.goPackage} holds no Go source at ${ref}`);
  const blobs = readBlobs(dir, ref, [...goFiles, sources.goLexicon, sources.browser]);
  const go = { regexes: 0, forms: 0, regexSites: [], formList: [] };
  for (const f of goFiles) {
    for (const s of goRegexSites(blobs.get(f).toString('utf8'))) go.regexSites.push({ file: f, ...s });
  }
  go.regexes = go.regexSites.length;
  const lexBytes = blobs.get(sources.goLexicon);
  if (!lexBytes) problems.push(`${sources.goLexicon} is absent at ${ref}`);
  else {
    try {
      go.formList = collectForms(parseStrictJSON(lexBytes.toString('utf8'), sources.goLexicon));
      go.forms = go.formList.length;
    } catch (e) {
      problems.push(`${sources.goLexicon} at ${ref}: ${e.message}`);
    }
  }
  const browser = { regexes: 0, forms: 0, regexSites: [], formList: [] };
  const bBytes = blobs.get(sources.browser);
  if (!bBytes) problems.push(`${sources.browser} is absent at ${ref}`);
  else {
    const src = bBytes.toString('utf8');
    for (const s of jsRegexSites(src)) browser.regexSites.push({ file: sources.browser, ...s });
    browser.regexes = browser.regexSites.length;
    const doc = extractBrowserLexicon(src);
    if (!doc) problems.push(`${sources.browser} at ${ref}: the generated lexicon block is missing or does not parse`);
    else {
      browser.formList = collectForms(doc);
      browser.forms = browser.formList.length;
    }
  }
  return { go, browser, problems };
}

/** Items in `head` beyond their count in `base` (a multiset difference). */
function added(baseItems, headItems, key) {
  const count = new Map();
  for (const x of baseItems) count.set(key(x), (count.get(key(x)) || 0) + 1);
  const out = [];
  for (const x of headItems) {
    const k = key(x);
    const c = count.get(k) || 0;
    if (c > 0) count.set(k, c - 1);
    else out.push(x);
  }
  return out;
}

const PROVENANCE_KEYS_FORM = ['date', 'form', 'kind', 'path', 'round', 'source', 'unit'];
const PROVENANCE_KEYS_REGEX = ['date', 'engine', 'id', 'kind', 'round', 'source', 'unit'];

export function loadProvenance(path) {
  if (!existsSync(path)) throw new Error(`provenance file missing: ${path}`);
  const lines = readLedger(path, 'lexicon provenance', null);
  const errs = [];
  lines.forEach((l, i) => {
    const want = l.kind === 'regex' ? PROVENANCE_KEYS_REGEX : PROVENANCE_KEYS_FORM;
    if (Object.keys(l).sort().join(',') !== want.join(',')) errs.push(`line ${i + 1}: keys must be exactly ${want.join(',')}`);
    if (!/^R[0-9][a-c]?$/.test(l.round || '')) errs.push(`line ${i + 1}: round`);
    if (!/^[A-Z][A-Z0-9]*(-[A-Za-z0-9.]+)+$/.test(l.unit || '')) errs.push(`line ${i + 1}: unit must be a unit id (e.g. DD1-W1)`);
    if (!/^(brief|miss|defect):\S+$/.test(l.source || '')) errs.push(`line ${i + 1}: source must be brief:<path>, miss:<id> or defect:<id>`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date || '')) errs.push(`line ${i + 1}: date`);
    if (l.kind === 'regex' && !['go', 'browser'].includes(l.engine)) errs.push(`line ${i + 1}: engine must be go or browser`);
  });
  if (errs.length) throw new Error(`lexicon provenance: ${errs.join('; ')}`);
  return lines;
}

// ─── the check ───────────────────────────────────────────────────────────────

export function check(opts) {
  const res = { status: 'pass', findings: [], notChecked: [], engines: {}, round: null };
  const nc = (m) => {
    res.notChecked.push(m);
    res.status = 'not-checked';
    return res;
  };
  const ws = resolveCheckouts(opts, []);
  if (!ws.root && !opts.repos.Installers) return nc(`NOT CHECKED -- ${ws.reason}`);
  const inst = ws.checkouts.Installers;
  if (!inst || inst.missing) return nc(`Installers: NOT CHECKED -- ${inst ? inst.missing : 'no checkout'}`);
  const sbDir = scoreboardDirOf(ws.checkouts, opts.coordination);
  let gates;
  try {
    gates = loadCoordination(sbDir).gates;
  } catch (e) {
    return nc(`NOT CHECKED -- ${e.message}`);
  }
  if (!gates) return nc(`NOT CHECKED -- ${sbDir}/gates.v1.json does not load`);
  const lx = gates.lexicon;
  if (!lx || !lx.sources || !lx.capPerRound) return nc('NOT CHECKED -- gates.v1.json carries no lexicon rule');
  if (!gates.rounds || !Object.keys(gates.rounds).length) return nc('NOT CHECKED -- gates.v1.json records no rounds');
  const head = resolveCommit(inst.dir, inst.ref);
  if (!head) return nc(`NOT CHECKED -- ref ${inst.ref} does not resolve in ${inst.dir}`);
  const headDay = utcDay(git(inst.dir, ['show', '-s', '--format=%cI', head]).stdout.trim());
  const round = roundOf(gates, headDay);
  res.round = round.id;
  const base = round.base && round.base.Installers;
  if (!base) return nc(`NOT CHECKED -- round ${round.id} records no Installers base commit`);
  if (!resolveCommit(inst.dir, base)) return nc(`NOT CHECKED -- round ${round.id} base ${base.slice(0, 12)} is not in ${inst.dir}`);
  if (!round.lexiconBaseline) return nc(`NOT CHECKED -- round ${round.id} has no recorded lexicon baseline (recorded at round start, signed with the gates)`);

  const atBase = countAt(inst.dir, base, lx.sources);
  const atHead = countAt(inst.dir, head, lx.sources);
  if (atBase.problems.length || atHead.problems.length) {
    return nc(`NOT CHECKED -- ${[...atBase.problems.map((p) => `base: ${p}`), ...atHead.problems.map((p) => `ref: ${p}`)].join('; ')}`);
  }
  for (const eng of ['go', 'browser']) {
    const rec = round.lexiconBaseline[eng];
    if (!rec || rec.regexes !== atBase[eng].regexes || rec.forms !== atBase[eng].forms) {
      res.findings.push(
        `${eng}: the base ${base.slice(0, 12)} counts ${atBase[eng].regexes} regexes / ${atBase[eng].forms} forms, ` +
          `rounds.${round.id}.lexiconBaseline records ${rec ? `${rec.regexes} / ${rec.forms}` : 'nothing'}: ` +
          'the counting rule or the base changed under a signed baseline',
      );
    }
  }

  let provenance = [];
  const provPath = join(inst.dir, lx.provenance);
  try {
    provenance = loadProvenance(provPath);
  } catch (e) {
    return nc(`NOT CHECKED -- ${e.message}`);
  }
  const provRegex = new Set(provenance.filter((p) => p.kind === 'regex' && p.round === round.id).map((p) => `${p.engine}:${p.id}`));
  const provForm = new Set(provenance.filter((p) => p.kind === 'form' && p.round === round.id).map((p) => formKey(p)));

  for (const eng of ['go', 'browser']) {
    const b = atBase[eng];
    const h = atHead[eng];
    const netRegexes = h.regexes - b.regexes;
    const netForms = h.forms - b.forms;
    res.engines[eng] = { base: { regexes: b.regexes, forms: b.forms }, head: { regexes: h.regexes, forms: h.forms }, net: { regexes: netRegexes, forms: netForms } };
    if (netRegexes > lx.capPerRound.regexes) {
      res.findings.push(`${eng}: net +${netRegexes} regexes in round ${round.id}, cap ${lx.capPerRound.regexes} (rule 6; KC-43 refuses the round's release candidate)`);
    }
    if (netForms > lx.capPerRound.forms) {
      res.findings.push(`${eng}: net +${netForms} lexicon forms in round ${round.id}, cap ${lx.capPerRound.forms} (rule 6; KC-43 refuses the round's release candidate)`);
    }
    for (const s of added(b.regexSites, h.regexSites, (x) => x.id)) {
      if (!provRegex.has(`${eng}:${s.id}`)) {
        res.findings.push(`${eng}: new regex at ${s.file}:${s.line} has no provenance line (kind regex, engine ${eng}, id ${s.id}, round ${round.id})`);
      }
    }
    for (const f of added(b.formList, h.formList, formKey)) {
      if (!provForm.has(formKey(f))) {
        res.findings.push(`${eng}: new lexicon form ${JSON.stringify(f.form)} in ${f.path} has no provenance line (kind form, round ${round.id})`);
      }
    }
  }
  if (res.findings.length) res.status = 'fail';
  return res;
}

function render(res) {
  const lines = [];
  lines.push(`lexicon counter (rule 6)${res.round ? `, round ${res.round}` : ''}`);
  for (const [eng, e] of Object.entries(res.engines)) {
    lines.push(
      `  ${eng.padEnd(8)} regexes ${e.base.regexes} -> ${e.head.regexes} (net ${e.net.regexes >= 0 ? '+' : ''}${e.net.regexes})   ` +
        `forms ${e.base.forms} -> ${e.head.forms} (net ${e.net.forms >= 0 ? '+' : ''}${e.net.forms})`,
    );
  }
  for (const m of res.notChecked) lines.push(`  ${m}`);
  for (const f of res.findings) lines.push(`  FAIL ${f}`);
  lines.push(res.status === 'pass' ? 'PASS' : res.status === 'fail' ? 'FAIL' : 'NOT CHECKED');
  return lines.join('\n') + '\n';
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), { '--coordination': 'value' });
    opts.coordination = opts.extra['--coordination'];
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(e instanceof UsageError ? EXIT.USAGE : EXIT.NOT_CHECKED);
  }
  let res;
  try {
    res = check(opts);
  } catch (e) {
    res = { status: 'not-checked', findings: [], notChecked: [`NOT CHECKED -- ${e.message}`], engines: {} };
  }
  process.stdout.write(opts.json ? `${JSON.stringify(res, null, 2)}\n` : render(res));
  process.exit(res.status === 'pass' ? EXIT.PASS : res.status === 'fail' ? EXIT.FAIL : EXIT.NOT_CHECKED);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
