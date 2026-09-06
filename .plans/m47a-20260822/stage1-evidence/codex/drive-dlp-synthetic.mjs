#!/usr/bin/env node
// P47 stage 1 CODEX lane, part F: the shared corpus' AWS-key prompt fixture uses AWS's
// DOCUMENTED EXAMPLE KEY, which the detector grades non-enforcing on purpose (brief rule 5),
// so "allow" there proves nothing either way. This re-runs the DLP prompt lane with
// SYNTHETIC secrets - a random AKIA + 40-char secret and a freshly generated throwaway
// RSA key - through the daemon (claude-code and codex, back to back) and through the
// INSTALLED Codex hook shim, with two benign twins.
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
  ...process.env, USERPROFILE: w(ISO + '/home'), HOMEDRIVE: 'C:',
  HOMEPATH: w('/Users/Owner/AppData/Local/Temp/devoid-p47-iso/home'), HOME: w(ISO + '/home'),
  ProgramData: w(ISO + '/progdata'), PROGRAMDATA: w(ISO + '/progdata'),
  CODEX_HOME: w(ISO + '/home/.codex'), DEVOID_DAEMON_PORT: '19390', CODEX_ENTRYPOINT: 'cli',
};
try { mkdirSync(ISO + '/work', { recursive: true }); } catch {}

const post = async (p, b) => {
  const r = await fetch('http://127.0.0.1:19390' + p, { method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Devoid-Daemon-Token': DTOKEN }, body: JSON.stringify(b) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  return j;
};
const runShim = (event, stdinJSON) => new Promise((resolve) => {
  const p = spawn(COMSPEC, ['/d', '/c', SHIM, event, markers[event]], { env: ENV, cwd: w(ISO) });
  let o = '', e = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d));
  p.on('error', (x) => resolve({ exit: -1, stdout: '', stderr: String(x) }));
  p.on('close', (c) => resolve({ exit: c, stdout: o, stderr: e }));
  p.stdin.end(stdinJSON);
});
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
const fx = JSON.parse(readFileSync(EV + '/dlp-synthetic-fixtures.b64.json', 'utf8'));
const IDS = {
  'claude-code': { agentType: 'claude-code', provider: 'anthropic', clientKind: 'claude-code' },
  codex: { agentType: 'codex', provider: 'openai', clientKind: 'codex-cli' },
};
const sessions = {};
for (const k of Object.keys(IDS)) {
  const s = await post('/v1/ai/session/start', { ...IDS[k], surface: 'cli', osUser: 'e2e', clientSessionId: 'dlp-' + k + '-' + Date.now(), title: 'stage-1 synthetic DLP ' + k });
  sessions[k] = s.sessionId || '';
}
const WORK = w(ISO + '/work');
const TP = w(ISO + '/home/.codex/sessions/rollout-p47-codex.jsonl');
const rows = [];
for (const f of fx) {
  const text = dec(f.p);
  const rec = { name: f.name, expect: f.expect };
  for (const k of Object.keys(IDS)) {
    const r = await post('/v1/ai/prompt-check', { ...IDS[k], surface: 'cli', osUser: 'e2e', sessionId: sessions[k], cwd: 'C:/cwt/p47-e2e-project', text });
    rec[k] = { decision: r.decision ?? null, findings: (r.findings || []).map((x) => x.class + 'x' + x.count).join(','),
               serverEnforced: r.serverEnforced ?? null, redacted: r.redactedText !== undefined && r.redactedText !== text,
               reason: (r.reason || '').slice(0, 200) };
  }
  const sr = await runShim('USER_PROMPT_SUBMIT', JSON.stringify({
    session_id: '019f5c0f-8975-7293-a88a-c48fd03e0555', turn_id: '019f5c0f-8a72-7963-9c90-a8e6c717dddd',
    transcript_path: TP, cwd: WORK, hook_event_name: 'UserPromptSubmit', model: 'gpt-5.6-sol',
    permission_mode: 'bypassPermissions', prompt: text }));
  rec.shim = { exit: sr.exit, blocks: denyEnforces(sr), stdout: sr.stdout.slice(0, 400) };
  rec.diverge = rec['claude-code'].decision !== rec.codex.decision;
  rows.push(rec);
  console.log((rec.diverge ? 'DIVERGE ' : '        ') +
    'claude=' + String(rec['claude-code'].decision).padEnd(6) + ' codex=' + String(rec.codex.decision).padEnd(6) +
    ' shim=' + (rec.shim.blocks ? 'BLOCKS' : 'opens ') + '  ' + f.name);
  console.log('           findings: ' + (rec.codex.findings || '(none)') + '  serverEnforced=' + rec.codex.serverEnforced);
  if (rec.codex.reason) console.log('           reason: ' + rec.codex.reason);
}
for (const k of Object.keys(IDS)) await post('/v1/ai/session/end', { ...IDS[k], sessionId: sessions[k], reason: 'dlp done' });
writeFileSync(EV + '/dlp-synthetic-results.json', JSON.stringify({ sessions, rows }, null, 2));
console.log('\n-> ' + EV + '/dlp-synthetic-results.json');
