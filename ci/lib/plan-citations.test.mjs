#!/usr/bin/env node
/**
 * MUTATION PROOF for `plan-citations.mjs`. (M4.7A Wave -1 Task 4's defeat test.)
 *
 * A citation resolver nobody has made go red is a citation resolver that has not
 * been run. Every case below writes a document on disk, points it at the REAL
 * repositories, and asserts the verdict AND the words in the output.
 *
 * NOTHING HERE HARD-CODES A LINE COUNT. The plan's own version of this defeat
 * test did: it said the resolver must print `internal/dlp/dlp.go has 1510 lines`
 * when handed `dlp.go:1519`. The file has since grown to 1572, so line 1519 is
 * no longer past its end and the specified defeat test would have PASSED — the
 * exact failure this whole task is about, committed by the task's own defeat
 * test. So the expected number is MEASURED from `origin/main` at run time and
 * the citation is built from it.
 *
 *   node ci/lib/plan-citations.test.mjs
 *
 * Exit 0 = every case behaved as stated. Exit 1 = at least one did not.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT, PLAN, check, classify, extractCitations, lineCount } from './plan-citations.mjs';
import { findWorkspaceRoot } from './workspace-root.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'plan-citations.mjs');

let failures = 0;
let cases = 0;

function assert(condition, message) {
  cases += 1;
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures += 1;
  }
}

/**
 * The workspace, resolved the way the resolver resolves it. If there is none,
 * this suite FAILS -- it does not skip. A precondition that quietly skips its
 * assertions is one of the inert shapes this programme exists to stamp out.
 */
const workspace = findWorkspaceRoot();
if (!workspace.root) {
  console.log(`  FAIL no workspace to test against: ${workspace.reason}`);
  console.log('\nplan-citations.test: FAIL');
  process.exit(1);
}

/** Line count of a file on Installers origin/main, measured now. */
function eofOnMain(repo, relPath) {
  const text = execFileSync('git', ['show', `origin/main:${relPath}`], {
    cwd: resolve(workspace.root, repo),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return lineCount(text);
}

const DLP_REL = 'internal/dlp/dlp.go';
const DLP_EOF = eofOnMain('Installers', DLP_REL);

function withDoc(body) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-citations-'));
  const docPath = join(dir, 'doc.md');
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath };
}

function run(body, opts = {}) {
  const { dir, docPath } = withDoc(body);
  const result = check({ planPath: docPath, ...opts });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const said = (result, needle) => result.lines.some((line) => line.includes(needle));

// ── PRECONDITION ─────────────────────────────────────────────────────────────
console.log('precondition: the shipped plan resolves clean');
{
  const real = check();
  assert(real.status === 'PASS', `the plan passes as written (saw ${real.status})`);
  assert(real.counts.total > 500, `and it was measured over a real corpus (${real.counts.total} citations)`);
  assert(
    real.counts.unqualified === 0 && real.counts.unresolvable === 0 && real.counts.pastEOF === 0,
    `0 unqualified / 0 unresolvable / 0 past EOF (saw ${real.counts.unqualified}/${real.counts.unresolvable}/${real.counts.pastEOF})`
  );
  assert(real.counts.fragments > 0, 'the bare ":NN" fragments are counted, not dropped in silence');
  assert(
    said(real, 'NOT MEASURED, by design'),
    'and the output says in words what it did not measure'
  );
}

// ── CASE 1 — THE DEFEAT TEST THE PLAN SPECIFIES, both halves ────────────────
//
// The plan says: "Point one citation at `dlp.go:1519` and it must go RED." As
// written that is TWO different failures depending on how it is spelled, and
// only one of them is the past-EOF one. Both are asserted.
console.log('\ncase 1: the defeat test, as an unqualified basename');
{
  const result = run(`A claim about \`dlp.go:${DLP_EOF + 1}\`.\n`);
  assert(result.status === 'FAIL', 'a bare basename goes RED');
  assert(result.counts.unqualified === 1, 'and it is counted as UNQUALIFIED');
  assert(said(result, 'UNQUALIFIED'), 'the output names the category');
  assert(result.counts.pastEOF === 0, 'it is NOT counted as past-EOF — the file was never resolved');
}

console.log('\ncase 2: the defeat test, as a qualified citation past the end of the file');
{
  const result = run(`A claim about \`Installers/${DLP_REL}:${DLP_EOF + 1}\`.\n`);
  assert(result.status === 'FAIL', 'a line past EOF goes RED');
  assert(result.counts.pastEOF === 1, 'and it is counted as past-EOF');
  assert(
    said(result, `past EOF: ${DLP_REL} has ${DLP_EOF} lines`),
    `the message names the file and its MEASURED length (${DLP_EOF})`
  );
}

// ── CASE 3 — the boundary, so the check is not "always red" ─────────────────
console.log('\ncase 3: the last line of a file is not past its end');
{
  const ok = run(`Fine: \`Installers/${DLP_REL}:${DLP_EOF}\`.\n`);
  assert(ok.status === 'PASS', `citing line ${DLP_EOF} exactly passes`);
  const over = run(`Not fine: \`Installers/${DLP_REL}:${DLP_EOF}-${DLP_EOF + 1}\`.\n`);
  assert(over.status === 'FAIL', 'a RANGE whose end is past EOF still goes RED');
}

// ── CASE 4 — a file that does not exist ─────────────────────────────────────
console.log('\ncase 4: a citation into a file nobody has');
{
  const result = run('See `Installers/internal/dlp/there-is-no-such-file.go:3`.\n');
  assert(result.status === 'FAIL', 'an unresolvable path goes RED');
  assert(result.counts.unresolvable === 1, 'and is counted as UNRESOLVABLE, not as past-EOF');
  assert(said(result, 'UNRESOLVABLE'), 'the output names the category');
}

// ── CASE 5 — self-references ────────────────────────────────────────────────
console.log('\ncase 5: plan: self-references are resolved against the document itself');
{
  const short = run('One line only, and it cites `plan:900`.\n');
  assert(short.status === 'FAIL', 'a self-reference past this document goes RED');
  assert(short.counts.pastEOF === 1, 'counted as past-EOF');
  const fine = run('Line one.\nLine two cites `plan:1`.\n');
  assert(fine.status === 'PASS', 'a self-reference inside the document passes');
}

// ── CASE 6 — what is deliberately NOT scanned, and is still counted ─────────
//
// The two exemptions are the ones that could hide a real defect, so each is
// asserted twice: that it does not fail the run, and that it is REPORTED. An
// exemption nobody can see in the output is an exemption that becomes a hole.
console.log('\ncase 6: fenced blocks and bare fragments are exempt AND reported');
{
  const fenced = run(
    'Prose.\n\n```bash\ngrep -n foo `Installers/' + DLP_REL + ':999999`\n```\n\nMore prose.\n'
  );
  assert(fenced.status === 'PASS', 'a citation inside a fenced block does not fail the run');
  assert(fenced.counts.fenced === 1, 'but it IS counted');
  assert(said(fenced, 'inside fenced blocks'), 'and the exemption is printed');

  const fragment = run('The header at `Installers/' + DLP_REL + ':3` and `:99999`.\n');
  assert(fragment.status === 'PASS', 'a bare ":NN" fragment does not fail the run');
  assert(fragment.counts.fragments === 1, 'but it IS counted');
  assert(said(fragment, 'fragments'), 'and the exemption is printed');
}

// ── CASE 7 — a URL is not a citation ────────────────────────────────────────
console.log('\ncase 7: a URL that looks like a citation');
{
  const result = run('See `https://example.invalid/notes.md:9999` for background.\n');
  assert(result.status === 'PASS', 'a URL is not read as a file citation');
  assert(result.counts.total === 0, 'and it is not counted as one');
}

// ── CASE 8 — a missing checkout is NOT MEASURED, never a pass ───────────────
console.log('\ncase 8: a workspace without the repository the document cites');
{
  const empty = mkdtempSync(join(tmpdir(), 'plan-citations-ws-'));
  const result = run(`See \`Installers/${DLP_REL}:1\`.\n`, { workspaceRoot: empty });
  assert(result.status === 'NOT MEASURED', `an absent checkout is NOT MEASURED (saw ${result.status})`);
  assert(result.exit === EXIT.NOT_MEASURED, `and exits ${EXIT.NOT_MEASURED}, not 0`);
  assert(said(result, 'NOT a pass'), 'and says so rather than leaving it to the exit code');
  assert(result.counts === null, 'no counts are invented for a run that measured nothing');
  rmSync(empty, { recursive: true, force: true });
}

// ── CASE 9 — the qualifier vocabulary ───────────────────────────────────────
console.log('\ncase 9: what counts as a repo qualifier');
{
  assert(classify('Installers/internal/dlp/dlp.go').kind === 'component', 'a component repo qualifies');
  assert(classify('docs/Devoid_Roadmap_To_Finished_Product.md').kind === 'component', 'docs qualifies');
  assert(classify('ci/lib/plan-citations.mjs').kind === 'meta', 'a meta-repo directory qualifies');
  assert(classify('.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md').kind === 'meta', '.plans qualifies');
  assert(classify('plan').kind === 'plan', 'plan: is a self-reference');
  assert(classify('dlp.go').kind === 'unqualified', 'a bare basename does not qualify');
  assert(classify('internal/dlp/dlp.go').kind === 'unqualified', 'a repo-RELATIVE path does not qualify');
}

// ── CASE 10 — extraction shapes ─────────────────────────────────────────────
console.log('\ncase 10: what the extractor does and does not pick up');
{
  const { citations } = extractCitations(
    'A `foo/bar.go:12` and `foo/bar.go:12-19`, a version 1.2:3, a time 10:30, `plan:7`.\n'
  );
  const raws = citations.map((c) => c.raw);
  assert(raws.includes('foo/bar.go:12'), 'a single-line citation is found');
  assert(raws.includes('foo/bar.go:12-19'), 'a range citation is found');
  assert(raws.includes('plan:7'), 'a plan: self-reference is found outside code spans');
  assert(!raws.some((r) => r.includes('10:30')), 'a clock time is not a citation');
  assert(!raws.some((r) => r.includes('1.2:3')), 'a version number is not a citation');
  const range = citations.find((c) => c.raw === 'foo/bar.go:12-19');
  assert(range.start === 12 && range.end === 19, 'a range keeps both ends');
}

// ── CASE 11 — the CLI's exit codes ──────────────────────────────────────────
console.log('\ncase 11: exit codes, driven as a subprocess');
{
  const clean = withDoc(`Fine: \`Installers/${DLP_REL}:1\`.\n`);
  const bad = withDoc(`Broken: \`dlp.go:1\`.\n`);
  const runCli = (p) => spawnSync(process.execPath, [SCRIPT, p], { encoding: 'utf8' });

  const okRun = runCli(clean.docPath);
  assert(okRun.status === EXIT.OK, `a clean document exits ${EXIT.OK} (saw ${okRun.status})`);
  assert(/plan-citations: PASS/.test(okRun.stdout), 'and prints PASS');

  const badRun = runCli(bad.docPath);
  assert(badRun.status === EXIT.VIOLATION, `an unqualified citation exits ${EXIT.VIOLATION} (saw ${badRun.status})`);
  assert(/plan-citations: FAIL/.test(badRun.stdout), 'and prints FAIL');
  assert(!/plan-citations: PASS/.test(badRun.stdout), 'PASS is never printed for a failing document');

  rmSync(clean.dir, { recursive: true, force: true });
  rmSync(bad.dir, { recursive: true, force: true });
}

// ── CASE 12 — the plan under test is the real one ───────────────────────────
console.log('\ncase 12: the default document is the plan, not a fixture');
{
  assert(PLAN.endsWith('M47A_IMPLEMENTATION_PLAN.md'), 'the default target is the M4.7A plan');
  const missing = check({ planPath: join(tmpdir(), 'no-such-plan-xyz.md') });
  assert(missing.status === 'NOT MEASURED', 'a document that is not there is NOT MEASURED');
  assert(missing.exit === EXIT.NOT_MEASURED, 'and exits 2 rather than passing over nothing');
}

console.log(`\n${cases - failures} of ${cases} assertions held`);
console.log(failures === 0 ? 'plan-citations.test: PASS' : 'plan-citations.test: FAIL');
process.exit(failures === 0 ? 0 : 1);
