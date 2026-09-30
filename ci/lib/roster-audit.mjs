#!/usr/bin/env node
/**
 * ROSTER AND IDENTITY AUDIT: plan rule 3, section 9, KC-44 (ledger rows C2, C11).
 *
 * "Builders are identified, not assumed." On 2026-09-29, 38 of 41 non-merge
 * commits to eight detector packages since 09-11 were authored by `unknown` and
 * 3 by `Owner`: nobody could say who had written the detector code a sealed
 * result was about to be read against. This audit reads every non-merge commit
 * that touches a detector path (gates.v1.json detectorPackages) in each
 * repository, from the programme's base commit (gates.v1.json rounds) to the
 * audited ref, and fails when its author is:
 *
 *   - `unknown` or `Owner` (refused by name, whatever the roster says),
 *   - not on the roster of the round the commit landed in (roster.v1.json), or
 *   - on it without the builder role (the owner is a declared non-builder).
 *
 * It also fails while roster.v1.json or ownership.json is UNSIGNED (the owner
 * signs the roster; the owner and the coworker sign the table), and when an
 * ownership row names a path that does not exist in its repository.
 *
 * A repository whose checkout is missing, whose base commit is not in the
 * checkout, or whose ref does not resolve is NOT CHECKED, never passed.
 *
 *   node ci/lib/roster-audit.mjs [--root <ws>] [--repo Name=<path>[@ref]] [--ref <ref>]
 *                                [--coordination <scoreboard dir>] [--json]
 *
 * The post-push form audits what is on the remote: `--ref origin/main` after a
 * read-only `git fetch` in each checkout.
 *
 * Exit: 0 pass; 1 a failing commit or an unsigned file; 2 NOT CHECKED; 3 usage.
 */

import { fileURLToPath } from 'node:url';

import {
  EXIT,
  FILES,
  FORBIDDEN_IDENTITY_NAMES,
  UsageError,
  auditRange,
  combine,
  detectorCommits,
  detectorPathspecs,
  exitFor,
  identityKey,
  loadCoordination,
  parseArgs,
  missingPaths,
  resolveCheckouts,
  roundOf,
  scoreboardDirOf,
  signatureState,
} from './coordination.mjs';

/** Is this commit's author a builder on its round's roster? */
export function classifyAuthor(commit, rosterRound, roundId) {
  const name = String(commit.authorName || '').trim();
  if (FORBIDDEN_IDENTITY_NAMES.includes(name.toLowerCase())) {
    return { ok: false, why: `author "${name}" identifies nobody (rule 3 refuses it by name)` };
  }
  if (!rosterRound) return { ok: false, why: `round ${roundId} has no roster in roster.v1.json` };
  const key = identityKey({ name, email: commit.authorEmail });
  const member = rosterRound.members.find((m) => (m.gitIdentities || []).some((i) => identityKey(i) === key));
  if (!member) return { ok: false, why: `author ${name} <${commit.authorEmail}> is not on the round ${roundId} roster` };
  if (!(member.roles || []).includes('builder')) {
    return { ok: false, why: `${member.id} (${name}) is a declared non-builder in round ${roundId}` };
  }
  return { ok: true, member: member.id };
}

/**
 * @param opts   parsed flags (coordination.parseArgs)
 * @param seams  { matches } signer predicate; production compares ids exactly
 */
export function audit(opts, seams = {}) {
  const res = { status: 'pass', findings: [], notChecked: [], signatures: [], repos: {} };
  const ws = resolveCheckouts(opts, []);
  if (!ws.root && !Object.keys(opts.repos).length) {
    res.notChecked.push(`NOT CHECKED -- ${ws.reason}`);
    res.status = 'not-checked';
    return res;
  }
  const sbDir = scoreboardDirOf(ws.checkouts, opts.coordination);
  if (!sbDir) {
    res.notChecked.push(`NOT CHECKED -- no Installers checkout, so no coordination data (${ws.checkouts.Installers.missing})`);
    res.status = 'not-checked';
    return res;
  }
  const bundle = loadCoordination(sbDir);
  if (bundle.errors.length) {
    res.notChecked.push(...bundle.errors.map((e) => `NOT CHECKED -- ${e}`));
    res.status = 'not-checked';
    return res;
  }
  const { gates, roster, ownership } = bundle;
  const repos = Object.keys(gates.detectorPackages.repos);
  const { checkouts } = resolveCheckouts(opts, repos);

  for (const file of [FILES.roster, FILES.ownership]) {
    const st = signatureState(bundle, file, seams);
    res.signatures.push(st);
    if (!st.signed) {
      res.findings.push(`${file} is UNSIGNED at ${st.digest}: missing ${st.missing.join(' and ')} in ${FILES.ledger}`);
    }
  }

  const byRepo = new Map();
  for (const e of ownership.entries) {
    if (e.planned) continue;
    if (!byRepo.has(e.repo)) byRepo.set(e.repo, []);
    for (const p of e.paths) byRepo.get(e.repo).push({ id: e.id, path: p });
  }
  for (const [repo, rows] of byRepo) {
    const co = checkouts[repo] || resolveCheckouts(opts, [repo]).checkouts[repo];
    if (!co || co.missing) continue; // that repository is reported NOT CHECKED below when it has detector paths
    const missing = new Set(missingPaths(co.dir, co.ref, rows.map((r) => r.path)));
    for (const r of rows) {
      if (missing.has(r.path)) {
        res.findings.push(`ownership row ${r.id} names ${repo}:${r.path}, which does not exist at ${co.ref} (a row that owns nothing hides the path it meant)`);
      }
    }
  }

  const parts = [];
  for (const repo of repos) {
    const range = auditRange(gates, repo, checkouts[repo]);
    const rr = { commits: 0, failed: 0 };
    res.repos[repo] = rr;
    if (range.notChecked) {
      rr.status = 'not-checked';
      res.notChecked.push(range.notChecked);
      parts.push('not-checked');
      continue;
    }
    rr.range = `${range.base.slice(0, 12)}..${range.head.slice(0, 12)}`;
    const commits = detectorCommits(checkouts[repo].dir, range.base, range.head, detectorPathspecs(gates, repo));
    rr.commits = commits.length;
    for (const c of commits) {
      const round = roundOf(gates, c.day);
      const verdict = classifyAuthor(c, roster.rounds.find((r) => r.round === round.id), round.id);
      if (!verdict.ok) {
        rr.failed += 1;
        res.findings.push(`${repo} ${c.sha.slice(0, 12)} ${c.day} (${c.files.slice(0, 3).join(', ')}${c.files.length > 3 ? ', ...' : ''}): ${verdict.why}`);
      }
    }
    rr.status = rr.failed ? 'fail' : 'pass';
    parts.push(rr.status);
  }
  if (res.findings.length) parts.push('fail');
  res.status = combine(parts);
  return res;
}

function render(res) {
  const out = ['roster and identity audit (rule 3)'];
  for (const s of res.signatures) out.push(`  ${s.file}: ${s.signed ? 'signed' : `UNSIGNED (${s.digest})`}`);
  for (const [repo, r] of Object.entries(res.repos)) {
    if (r.status === 'not-checked') continue;
    out.push(`  ${repo.padEnd(15)} ${r.range}  ${r.commits} detector commit(s), ${r.failed} failing`);
  }
  for (const m of res.notChecked) out.push(`  ${m}`);
  for (const f of res.findings) out.push(`  FAIL ${f}`);
  out.push(res.status === 'pass' ? 'PASS' : res.status === 'fail' ? 'FAIL' : 'NOT CHECKED');
  return out.join('\n') + '\n';
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
    res = audit(opts);
  } catch (e) {
    res = { status: 'not-checked', findings: [], notChecked: [`NOT CHECKED -- ${e.message}`], signatures: [], repos: {} };
  }
  process.stdout.write(opts.json ? `${JSON.stringify(res, null, 2)}\n` : render(res));
  process.exit(exitFor(res.status));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
