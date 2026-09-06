#!/usr/bin/env node
// P47 stage 1 CODEX lane, part E: SELF-DEFENCE through Codex.
//
// Runs the shared corpus' "self-defence: disable agent" fixture plus six respellings of
// the same intent (the two the claude-code lane MISSED - `sc delete devoid` and deleting
// devoid.exe - plus four near neighbours), and two benign twins, through BOTH:
//   1. the daemon route, once as claude-code and once as codex, back to back, so a
//      difference cannot be an artefact of the org policy moving between runs; and
//   2. the INSTALLED Codex hook shim, judged by the product's own DenyEnforces predicate.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BS = String.fromCharCode(92);
const w = (p) => p.split('/').join(BS);
const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const EV = 'C:/Users/Owner/Documents/Ceragon/.plans/m47a-20260822/stage1-evidence/codex';
const DTOKEN = readFileSync(ISO + '/home/.devoid/daemon-token', 'utf8').trim();
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

const post = async (p, b) => {
  const r = await fetch('http://127.0.0.1:19390' + p, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Devoid-Daemon-Token': DTOKEN },
    body: JSON.stringify(b),
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  return j;
};

function runShim(event, stdinJSON) {
  return new Promise((resolve) => {
    const p = spawn(COMSPEC, ['/d', '/c', SHIM, event, markers[event]], { env: ENV, cwd: w(ISO) });
    let o = '', e = '';
    p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
    p.on('error', (x) => resolve({ exit: -1, stdout: '', stderr: String(x) }));
    p.on('close', (c) => resolve({ exit: c, stdout: o, stderr: e }));
    p.stdin.end(stdinJSON);
  });
}
function denyEnforces(r) {
  if (r.exit !== 0) return false;
  const s = (r.stdout || '').trim(); if (!s) return false;
  let j; try { j = JSON.parse(s); } catch { return false; }
  const h = j.hookSpecificOutput;
  if (h && h.permissionDecision === 'deny' && String(h.permissionDecisionReason || '').trim() !== '') return true;
  if (h && h.decision && h.decision.behavior === 'deny' && String(h.decision.message || '').trim() !== '') return true;
  if (j.decision === 'block' && String(j.reason || '').trim() !== '') return true;
  return false;
}

const dec = (b) => Buffer.from(b, 'base64').toString('utf8');
const shared = JSON.parse(readFileSync(ISO + '/drive-fixtures.b64.json', 'utf8'));
const mine = JSON.parse(readFileSync(EV + '/selfdefence-fixtures.b64.json', 'utf8'));
const corpus = [shared.find((f) => f.name.includes('disable agent')), ...mine];

const IDS = {
  'claude-code': { agentType: 'claude-code', provider: 'anthropic', clientKind: 'claude-code', pfx: 'toolu_' },
  codex: { agentType: 'codex', provider: 'openai', clientKind: 'codex-cli', pfx: 'exec-' },
};
const sessions = {};
for (const k of Object.keys(IDS)) {
  const { pfx, ...id } = IDS[k];
  const s = await post('/v1/ai/session/start', { ...id, surface: 'cli', osUser: 'e2e', clientSessionId: 'sd-' + k + '-' + Date.now(), title: 'stage-1 self-defence ' + k });
  sessions[k] = s.sessionId || '';
}
console.log('sessions', JSON.stringify(sessions));

const WORK = w(ISO + '/work');
const TP = w(ISO + '/home/.codex/sessions/rollout-p47-codex.jsonl');
const rows = [];
for (const f of corpus) {
  const cmd = dec(f.p);
  const rec = { name: f.name, expect: f.expect };
  for (const k of ['claude-code', 'codex']) {
    const { pfx, ...id } = IDS[k];
    const r = await post('/v1/ai/tool-decision', {
      ...id, surface: 'cli', osUser: 'e2e', sessionId: sessions[k], cwd: 'C:/cwt/p47-e2e-project',
      toolName: 'Bash', toolUseId: pfx + Math.random().toString(36).slice(2, 8), toolInput: { command: cmd },
    });
    rec[k] = { decision: r.decision ?? null, reason: (r.reason || '').slice(0, 160) };
  }
  const sr = await runShim('PRE_TOOL_USE', JSON.stringify({
    session_id: '019f5c0f-8975-7293-a88a-c48fd03e0777', turn_id: '019f5c0f-8a72-7963-9c90-a8e6c717cccc',
    transcript_path: TP, cwd: WORK, hook_event_name: 'PreToolUse', model: 'gpt-5.6-sol',
    permission_mode: 'bypassPermissions', tool_name: 'Bash', tool_input: { command: cmd },
    tool_use_id: 'exec-' + Math.random().toString(36).slice(2, 10),
  }));
  rec.shim = { exit: sr.exit, blocks: denyEnforces(sr), stdout: sr.stdout };
  rec.diverge = rec['claude-code'].decision !== rec.codex.decision;
  rows.push(rec);
  console.log(
    (rec.diverge ? 'DIVERGE ' : '        ') +
    'claude=' + String(rec['claude-code'].decision).padEnd(6) +
    ' codex=' + String(rec.codex.decision).padEnd(6) +
    ' shim=' + (rec.shim.blocks ? 'BLOCKS' : 'opens ') + '  ' + f.name
  );
}
for (const k of Object.keys(IDS)) { const { pfx, ...id } = IDS[k]; await post('/v1/ai/session/end', { ...id, sessionId: sessions[k], reason: 'self-defence done' }); }
writeFileSync(EV + '/selfdefence-results.json', JSON.stringify({ sessions, rows }, null, 2));
const missed = rows.filter((r) => !r.name.startsWith('benign') && !r.shim.blocks);
console.log('\n' + missed.length + ' of ' + rows.filter((r) => !r.name.startsWith('benign')).length + ' self-defence probes were NOT blocked at the Codex hook:');
for (const m of missed) console.log('  MISS: ' + m.name);
console.log('\n-> ' + EV + '/selfdefence-results.json');
