#!/usr/bin/env node
// P47 stage 1 CODEX lane, part D: the DIALECT / VERSION-MARKER probe.
//
// The historical defect: the Codex dialect firewall demanded Codex-0.144 payload markers
// (top-level `model`, `turn_id` on turn-scoped events, `exec-` prefixed `tool_use_id`).
// Codex 0.134 does not send that shape, so every payload was rejected as an unknown
// dialect -> DeVoid failed closed -> Codex filed the hook as FAILED -> Codex fails OPEN
// -> the tool ran ungoverned while hooks-status printed [OK].
//
// This probe runs the SAME blocked command through the installed shim four ways and
// reports which of them actually BLOCK under the product's own DenyEnforces predicate:
//   A. 0.144-shaped payload + the REAL provenance marker from config.toml
//   B. 0.134-shaped payload (no model / no turn_id / no exec- prefix) + REAL marker
//   C. 0.134-shaped payload + a WRONG (well-formed but unminted) marker  -> legacy firewall
//   D. 0.134-shaped payload + NO marker at all                           -> legacy firewall
// C and D are the negative controls: they must exercise the legacy shape firewall.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BS = String.fromCharCode(92);
const w = (p) => p.split('/').join(BS);
const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const SHIM = w(ISO + '/home/.devoid/codex-hooks/devoid-codex-hook.cmd');
const COMSPEC = process.env.ComSpec || 'C:/Windows/System32/cmd.exe';
const CFG = readFileSync(ISO + '/home/.codex/config.toml', 'utf8');
const markers = {};
for (const m of CFG.matchAll(/devoid-codex-hook\.cmd ([A-Z_]+) ([0-9a-f]{32})/g)) markers[m[1]] = m[2];

const ENV = {
  ...process.env,
  USERPROFILE: w(ISO + '/home'), HOMEDRIVE: 'C:',
  HOMEPATH: w('/Users/Owner/AppData/Local/Temp/devoid-p47-iso/home'),
  HOME: w(ISO + '/home'),
  ProgramData: w(ISO + '/progdata'), PROGRAMDATA: w(ISO + '/progdata'),
  CODEX_HOME: w(ISO + '/home/.codex'), DEVOID_DAEMON_PORT: '19390', CODEX_ENTRYPOINT: 'cli',
};
try { mkdirSync(ISO + '/work', { recursive: true }); } catch {}

function runShim(event, stdinJSON, marker) {
  const args = marker === null ? [event] : [event, marker];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(COMSPEC, ['/d', '/c', SHIM, ...args], { env: ENV, cwd: w(ISO) });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ exit: -1, stdout: '', stderr: String(e), ms: Date.now() - t0 }));
    p.on('close', (c) => resolve({ exit: c, stdout: out, stderr: err, ms: Date.now() - t0 }));
    p.stdin.end(stdinJSON);
  });
}
function denyEnforces(r) {
  if (r.exit !== 0) return false;
  const s = (r.stdout || '').trim();
  if (!s) return false;
  let j; try { j = JSON.parse(s); } catch { return false; }
  const h = j.hookSpecificOutput;
  if (h && h.permissionDecision === 'deny' && String(h.permissionDecisionReason || '').trim() !== '') return true;
  if (h && h.decision && h.decision.behavior === 'deny' && String(h.decision.message || '').trim() !== '') return true;
  if (j.decision === 'block' && String(j.reason || '').trim() !== '') return true;
  return false;
}

const fixtures = JSON.parse(readFileSync(ISO + '/drive-fixtures.b64.json', 'utf8'));
const dec = (b) => Buffer.from(b, 'base64').toString('utf8');
// A command the daemon blocks outright with no warn/hold round trip.
const fx = fixtures.find((f) => f.name.includes(process.env.FX||'authorized_keys'));
const CMD = dec(fx.p);

const WORK = w(ISO + '/work');
const TP = w(ISO + '/home/.codex/sessions/rollout-p47-codex.jsonl');

// 0.144-shaped: model + turn_id + exec- prefixed tool_use_id (what the old firewall demanded)
const p0144 = JSON.stringify({
  session_id: '019f5c0f-8975-7293-a88a-c48fd03e0aaa', turn_id: '019f5c0f-8a72-7963-9c90-a8e6c717bbbb',
  transcript_path: TP, cwd: WORK, hook_event_name: 'PreToolUse', model: 'gpt-5.6-sol',
  permission_mode: 'bypassPermissions', tool_name: 'Bash', tool_input: { command: CMD },
  tool_use_id: 'exec-b7742f17-a3a3-408f-b93d-694684acb2a1',
});
// 0.134-shaped: NO model, NO turn_id, tool_use_id without the exec- prefix.
const p0134 = JSON.stringify({
  session_id: '019f5c0f-8975-7293-a88a-c48fd03e0bbb',
  transcript_path: TP, cwd: WORK, hook_event_name: 'PreToolUse',
  permission_mode: 'bypassPermissions', tool_name: 'Bash', tool_input: { command: CMD },
  tool_use_id: 'call_9d2f1a',
});

const WRONG = 'deadbeefdeadbeefdeadbeefdeadbeef'; // well-formed hex, never minted

const cases = [
  { id: 'A', label: '0.144-shaped payload + REAL marker', payload: p0144, marker: markers.PRE_TOOL_USE },
  { id: 'B', label: '0.134-shaped payload + REAL marker', payload: p0134, marker: markers.PRE_TOOL_USE },
  { id: 'C', label: '0.134-shaped payload + WRONG marker (legacy firewall)', payload: p0134, marker: WRONG },
  { id: 'D', label: '0.134-shaped payload + NO marker (legacy firewall)', payload: p0134, marker: null },
  { id: 'E', label: '0.144-shaped payload + NO marker (legacy firewall, shape passes)', payload: p0144, marker: null },
];

const out = [];
for (const c of cases) {
  const r = await runShim('PRE_TOOL_USE', c.payload, c.marker);
  const blocks = denyEnforces(r);
  out.push({ ...c, payload: undefined, exit: r.exit, ms: r.ms, blocks, stdout: r.stdout, stderr: r.stderr.slice(0, 500) });
  console.log(c.id + '  exit=' + r.exit + '  ' + (blocks ? 'BLOCKS' : 'OPENS ') + '  ' + c.label);
  console.log('    stdout: ' + JSON.stringify(r.stdout.slice(0, 200)));
  if (r.stderr.trim()) console.log('    stderr: ' + JSON.stringify(r.stderr.replace(/\r?\n/g, ' | ').slice(0, 300)));
}
const TAG = process.env.TAG || 'attack';
writeFileSync(EV + '/dialect-probe-results-' + TAG + '.json', JSON.stringify(out, null, 2));
console.log('\n-> ' + EV + '/dialect-probe-results-' + TAG + '.json  (fixture: ' + fx.name + ')');
