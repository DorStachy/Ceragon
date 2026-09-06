#!/usr/bin/env node
// P47 stage 1 CODEX lane, part B: drive the INSTALLED hook shim exactly as codex-cli
// would - spawn ~/.devoid/codex-hooks/devoid-codex-hook.cmd <EVENT> <marker> with the
// Codex hook stdin JSON on stdin, capture stdout + exit code, and evaluate the result
// with the product's OWN enforcement predicate (DenyEnforces, adapters/codex/response.go):
// exit 0 + deny JSON with a NON-EMPTY reason BLOCKS; everything else fails OPEN.
//
// Env mirrors run-daemon-p47.sh so the hook resolves the ISOLATED home and daemon :19390.
// No attack text lives in this file: fixtures stay base64 in drive-fixtures.b64.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BS = String.fromCharCode(92); // avoid literal backslash escapes entirely
const w = (p) => p.split('/').join(BS);

const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const ISO_W = w(ISO);
const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const SHIM = w(ISO + '/home/.devoid/codex-hooks/devoid-codex-hook.cmd');
const COMSPEC = process.env.ComSpec || process.env.COMSPEC || 'C:/Windows/System32/cmd.exe';
const CFG = readFileSync(ISO + '/home/.codex/config.toml', 'utf8');

// Markers come from the INSTALLED config.toml - the same argv codex-cli would use.
const markers = {};
for (const m of CFG.matchAll(/devoid-codex-hook\.cmd ([A-Z_]+) ([0-9a-f]{32})/g)) markers[m[1]] = m[2];

const ENV = {
  ...process.env,
  USERPROFILE: w(ISO + '/home'),
  HOMEDRIVE: 'C:',
  HOMEPATH: w('/Users/Owner/AppData/Local/Temp/devoid-p47-iso/home'),
  HOME: w(ISO + '/home'),
  ProgramData: w(ISO + '/progdata'),
  PROGRAMDATA: w(ISO + '/progdata'),
  CODEX_HOME: w(ISO + '/home/.codex'),
  DEVOID_DAEMON_PORT: '19390',
  CODEX_ENTRYPOINT: 'cli',
};

const WORK = w(ISO + '/work');
try { mkdirSync(ISO + '/work', { recursive: true }); } catch {}
const TRANSCRIPT = w(ISO + '/home/.codex/sessions/rollout-p47-codex.jsonl');
const SID = '019f5c0f-8975-7293-a88a-c48fd03e0999';
const TID = '019f5c0f-8a72-7963-9c90-a8e6c717aaaa';

const EVENT_NAMES = {
  PRE_TOOL_USE: 'PreToolUse',
  USER_PROMPT_SUBMIT: 'UserPromptSubmit',
  POST_TOOL_USE: 'PostToolUse',
  SESSION_START: 'SessionStart',
  PERMISSION_REQUEST: 'PermissionRequest',
};

function payload(event, extra) {
  const base = {
    session_id: SID, transcript_path: TRANSCRIPT, cwd: WORK,
    hook_event_name: EVENT_NAMES[event], model: 'gpt-5.6-sol',
    permission_mode: 'bypassPermissions',
  };
  if (event !== 'SESSION_START') base.turn_id = TID;
  return JSON.stringify({ ...base, ...extra });
}

function runShim(event, stdinJSON, markerOverride) {
  const marker = markerOverride !== undefined ? markerOverride : markers[event];
  const args = marker === null ? [event] : [event, marker];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(COMSPEC, ['/d', '/c', SHIM, ...args], { env: ENV, cwd: ISO_W });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ event, marker, exit: -1, stdout: '', stderr: String(e), ms: Date.now() - t0 }));
    p.on('close', (code) => resolve({ event, marker, exit: code, stdout: out, stderr: err, ms: Date.now() - t0 }));
    p.stdin.end(stdinJSON);
  });
}

// The product's own predicate, transcribed from adapters/codex/response.go DenyEnforces.
export function denyEnforces(r) {
  if (r.exit !== 0) return false;
  const s = (r.stdout || '').trim();
  if (!s) return false;
  let j;
  try { j = JSON.parse(s); } catch { return false; }
  const hso = j.hookSpecificOutput;
  if (hso && hso.permissionDecision === 'deny' && String(hso.permissionDecisionReason || '').trim() !== '') return true;
  if (hso && hso.decision && hso.decision.behavior === 'deny' && String(hso.decision.message || '').trim() !== '') return true;
  if (j.decision === 'block' && String(j.reason || '').trim() !== '') return true;
  return false;
}

const fixtures = JSON.parse(readFileSync(ISO + '/drive-fixtures.b64.json', 'utf8'));
const dec = (b) => Buffer.from(b, 'base64').toString('utf8');
const results = [];

console.log('shim   =', SHIM);
console.log('comspec=', COMSPEC);
console.log('markers from installed config.toml:', JSON.stringify(markers));

const ss = await runShim('SESSION_START', payload('SESSION_START', { source: 'startup' }));
results.push({ name: 'SESSION_START', event: 'SESSION_START', exit: ss.exit, ms: ss.ms, stdout: ss.stdout, stderr: ss.stderr.slice(0, 400), blocks: denyEnforces(ss) });
console.log('exit=' + ss.exit + ' ' + ss.ms + 'ms SESSION_START -> stdout=' + JSON.stringify(ss.stdout.slice(0, 160)) + ' stderr=' + JSON.stringify(ss.stderr.slice(0, 200)));

let lane = '';
for (const f of fixtures) {
  if (f.lane !== lane) { lane = f.lane; console.log('\n--- ' + lane + ' lane (shim) ---'); }
  const text = dec(f.p);
  let ev, extra;
  if (f.lane === 'tool') {
    ev = 'PRE_TOOL_USE';
    extra = { tool_name: 'Bash', tool_input: { command: text }, tool_use_id: 'exec-' + Math.random().toString(36).slice(2, 10) };
  } else if (f.lane === 'prompt') {
    ev = 'USER_PROMPT_SUBMIT';
    extra = { prompt: text };
  } else {
    ev = 'POST_TOOL_USE';
    extra = { tool_name: 'Bash', tool_input: { command: 'cat notes.txt' }, tool_response: text, tool_use_id: 'exec-' + Math.random().toString(36).slice(2, 10) };
  }
  const r = await runShim(ev, payload(ev, extra));
  const blocks = denyEnforces(r);
  results.push({ name: f.name, lane: f.lane, expect: f.expect, event: ev, exit: r.exit, ms: r.ms, stdout: r.stdout, stderr: r.stderr.slice(0, 400), blocks });
  console.log('exit=' + r.exit + ' ' + String(r.ms + 'ms').padEnd(7) + ' ' + (blocks ? 'BLOCKS ' : 'opens  ') + ' ' + f.name.padEnd(50) + ' ' + JSON.stringify(r.stdout.slice(0, 170)));
}

const authFix = fixtures.find((f) => f.name.includes('authorized_keys'));
const pr = await runShim('PERMISSION_REQUEST', payload('PERMISSION_REQUEST', { tool_name: 'Bash', tool_input: { command: dec(authFix.p) }, permission_mode: 'on-request' }));
results.push({ name: 'PERMISSION_REQUEST authorized_keys', event: 'PERMISSION_REQUEST', exit: pr.exit, ms: pr.ms, stdout: pr.stdout, stderr: pr.stderr.slice(0, 400), blocks: denyEnforces(pr) });
console.log('\nexit=' + pr.exit + ' PERMISSION_REQUEST -> ' + JSON.stringify(pr.stdout.slice(0, 250)));

writeFileSync(EV + '/codex-shim-results.json', JSON.stringify(results, null, 2));
console.log('\n' + results.length + ' shim invocations -> ' + EV + '/codex-shim-results.json');
