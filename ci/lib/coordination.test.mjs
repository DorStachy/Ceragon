#!/usr/bin/env node
/**
 * PROOF for ci/lib/coordination.mjs, the module the three COORD-01 audits share.
 *
 * Every validator is shown to say YES on the real committed files and NO on each
 * mutated shape; the canonical digest is held to the SAME pinned value Go's
 * TestJCSDigestParityPin holds, over the SAME bytes read out of the Go test; and
 * the signed path is shown to say YES only for a matching digest from every
 * required signer, with test signer ids (no human id is ever written).
 *
 *   node ci/lib/coordination.test.mjs      (exit 0 = every case held)
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  FILES,
  SCOREBOARD_DIR,
  canonicalJSON,
  digestOf,
  loadCoordination,
  parseStrictJSON,
  signatureState,
  validateFreeze,
  validateGatesCoordination,
  validateOwnership,
  validateRoster,
} from './coordination.mjs';
import { TEST_SIGNER, realInstallersDir, realScoreboard } from './coordination-fixture.mjs';

const JCS_PARITY_DIGEST = 'sha256:6b3020c4c5099e020e9ebd098e69dcb5596b7e9052d889b7dbda17503f01abb4';

const real = () => ({
  gates: realScoreboard(FILES.gates),
  ownership: realScoreboard(FILES.ownership),
  roster: realScoreboard(FILES.roster),
  freeze: realScoreboard(FILES.freeze),
});

const has = (errs, needle) => errs.some((e) => e.includes(needle));

test('the real coordination files load, validate, and read as UNSIGNED', () => {
  const b = loadCoordination(join(realInstallersDir(), SCOREBOARD_DIR));
  assert.deepEqual(b.errors, []);
  for (const f of [FILES.ownership, FILES.roster, FILES.freeze]) {
    const st = signatureState(b, f);
    assert.equal(st.signed, false, `${f} reads as signed; nobody has signed it`);
    assert.ok(st.missing.length > 0);
  }
});

test('canonical digest matches the Go pin over the bytes of the Go test', () => {
  const goTest = readFileSync(join(realInstallersDir(), 'internal', 'scoreboard', 'coordination_test.go'), 'utf8');
  const doc = goTest.match(/const jcsParityDoc = `([^`]*)`/);
  const pin = goTest.match(/const jcsParityDigest = "([^"]+)"/);
  assert.ok(doc && pin, 'the Go parity pin was not found in internal/scoreboard/coordination_test.go');
  assert.equal(pin[1], JCS_PARITY_DIGEST, 'the Go and JS pins differ; change both together');
  assert.equal(digestOf(parseStrictJSON(doc[1], 'parity doc')), JCS_PARITY_DIGEST);
});

test('canonical JSON follows Go on key order, U+2028, exponents and -0', () => {
  const zz = String.fromCodePoint(0xff5a);
  const smile = String.fromCodePoint(0x1f600);
  const text = canonicalJSON({ [smile]: 1, [zz]: 2, b: [1e21, -0, 1.5e-7], a: `x${String.fromCharCode(0x2028)}y` });
  assert.ok(text.indexOf(zz) < text.indexOf(smile), 'keys must sort by UTF-8 bytes as Go sort.Strings does');
  assert.ok(text.includes('[1e21,0,1.5e-7]'), text);
  assert.ok(text.includes('x\\u2028y'), text);
});

test('duplicate keys are refused, a clean document is not', () => {
  assert.throws(() => parseStrictJSON('{"a":1,"b":{"c":1,"c":2}}', 'dup'), /duplicate key "c"/);
  assert.deepEqual(parseStrictJSON('{"a":1,"b":{"c":1,"d":"{\\"c\\":1,\\"c\\":2}"}}', 'ok'), { a: 1, b: { c: 1, d: '{"c":1,"c":2}' } });
});

test('signature state: YES only for the current digest from every required signer', () => {
  const b = loadCoordination(join(realInstallersDir(), SCOREBOARD_DIR));
  const d = b.digests[FILES.ownership];
  const line = (signer, digest = d) => ({ date: '2026-09-30', file: FILES.ownership, digest, signer });
  b.ledger = [line('test:owner'), line('test:coworker')];
  assert.equal(signatureState(b, FILES.ownership, { matches: TEST_SIGNER }).signed, true);
  assert.equal(signatureState(b, FILES.ownership).signed, false, 'production must refuse test signer ids');
  b.ledger = [line('test:owner')];
  assert.deepEqual(signatureState(b, FILES.ownership, { matches: TEST_SIGNER }).missing, ['human:coworker']);
  b.ledger = [line('test:owner', 'sha256:0'), line('test:coworker', 'sha256:0')];
  assert.equal(signatureState(b, FILES.ownership, { matches: TEST_SIGNER }).signed, false, 'a stale digest signed');
});

test('ownership: the real table passes, each hole is named', () => {
  const r = real();
  assert.deepEqual(validateOwnership(r.ownership, r.gates), []);
  const mut = (fn) => {
    const o = structuredClone(r.ownership);
    fn(o);
    return validateOwnership(o, r.gates);
  };
  assert.ok(has(mut((o) => (o.entries = o.entries.filter((e) => e.id !== 'seam:wire-session-key'))), 'seam:wire-session-key'));
  assert.ok(has(mut((o) => (o.entries = o.entries.filter((e) => e.id !== 'installers/promptrisk'))), 'internal/promptrisk/'));
  assert.ok(has(mut((o) => (o.entries.find((e) => e.id === 'installers/aicanary').signOff = false)), 'internal/aicanary/ is coworker-owned'));
  assert.ok(has(mut((o) => (o.entries.find((e) => e.id === 'installers/dlp').freeze = 'not-frozen')), 'must be frozen'));
  assert.ok(has(mut((o) => (o.entries = o.entries.filter((e) => e.id !== 'installers/dlp'))), 'Installers:internal/dlp/ has no detector row'));
  assert.ok(has(mut((o) => o.entries.find((e) => e.id === 'installers/dlp').paths.push('internal/notlisted/')), 'does not list it'));
  assert.ok(has(mut((o) => (o.entries = o.entries.filter((e) => e.id !== 'installers/localdecide'))), 'internal/localdecide/'));
  assert.ok(has(mut((o) => (o.folded = [])), 'SC1-01'));
  assert.ok(has(mut((o) => (o.programmes.runtime.series = 'Detection score /10')), 'never merged'));
  assert.ok(has(mut((o) => o.entries.push({ ...o.entries[0] })), 'duplicate id'));
});

test('roster: the real roster passes, each identity rule is enforced', () => {
  const r = real();
  assert.deepEqual(validateRoster(r.roster, r.gates), []);
  const mut = (fn) => {
    const o = structuredClone(r.roster);
    fn(o.rounds[0].members);
    return validateRoster(o, r.gates);
  };
  const builder = (id, name, email, roles = ['builder']) => ({ id, kind: 'agent', roles, gitIdentities: [{ name, email }] });
  assert.deepEqual(mut((m) => m.push(builder('agent:l1', 'd9 builder L1', 'l1@d9.invalid'))), []);
  assert.ok(has(mut((m) => m.push({ id: 'agent:l1', kind: 'agent', roles: ['builder'], gitIdentities: [] })), 'at least one distinct git identity'));
  assert.ok(has(mut((m) => m.push(builder('agent:l1', 'Owner', 'o@d9.invalid'))), 'can never identify anyone'));
  assert.ok(has(mut((m) => m.push(builder('agent:l1', 'unknown', 'u@d9.invalid'))), 'can never identify anyone'));
  assert.ok(
    has(mut((m) => m.push(builder('agent:l1', 'same', 's@d9.invalid'), builder('agent:l2', 'same', 'S@d9.invalid'))), 'identities are distinct'),
  );
  assert.ok(has(mut((m) => m.push(builder('agent:l1', 'x', 'x@d9.invalid', ['builder', 'labeler']))), 'cannot also be labeler'));
  assert.ok(has(mut((m) => m.push(builder('human:x', 'x', 'x@d9.invalid'))), 'never a labeller id'));
  const o = structuredClone(r.roster);
  o.rounds.push({ round: 'R9', members: [] });
  assert.ok(has(validateRoster(o, r.gates), 'not a round in gates.v1.json'));
});

test('freeze: 2-4 days, no overlap, real dates', () => {
  const r = real();
  assert.deepEqual(validateFreeze(r.freeze), []);
  const w = (from, to, round = 'R1a') => ({ round, kind: 'round-exit', from, to });
  const with_ = (...ws) => validateFreeze({ ...r.freeze, windows: ws });
  assert.deepEqual(with_(w('2026-11-01', '2026-11-02'), w('2026-11-10', '2026-11-13', 'R1b')), []);
  assert.ok(has(with_(w('2026-11-01', '2026-11-01')), '1 day(s)'));
  assert.ok(has(with_(w('2026-11-01', '2026-11-05')), '5 day(s)'));
  assert.ok(has(with_(w('2026-11-01', '2026-11-03'), w('2026-11-03', '2026-11-04', 'R1b')), 'overlap'));
  assert.ok(has(with_(w('01/11/2026', '2026-11-03')), 'YYYY-MM-DD'));
  assert.ok(has(with_({ ...w('2026-11-01', '2026-11-03'), candidate: { Installers: 'abc' } }), '40-hex'));
});

test('gates sections: missing or malformed is refused', () => {
  const r = real();
  assert.deepEqual(validateGatesCoordination(r.gates), []);
  const g = structuredClone(r.gates);
  delete g.detectorPackages;
  assert.ok(has(validateGatesCoordination(g), 'detectorPackages.repos is missing'));
  const g2 = structuredClone(r.gates);
  g2.rounds.R0.base.Installers = '52b5cb2a';
  assert.ok(has(validateGatesCoordination(g2), '40-hex'));
  const g3 = structuredClone(r.gates);
  g3.detectorPackages.repos.Installers.paths.push('../x/');
  assert.ok(has(validateGatesCoordination(g3), 'not a relative path'));
});
