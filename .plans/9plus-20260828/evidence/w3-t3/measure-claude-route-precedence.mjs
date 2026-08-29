// measure-claude-route-precedence.mjs
//
// P9 W3 T3 — measures which configuration scope actually supplies
// env.ANTHROPIC_BASE_URL to the certified Claude Code binary, across the full
// 2^5 = 32-cell present/absent matrix over five sources.
//
// It is a MEASUREMENT, not an inference: each scope is planted with a distinct
// loopback sentinel URL that differs only in its path segment, and the winner is
// whichever sentinel path the vendor binary actually connects to. Nothing about
// the vendor's documented order is assumed.
//
// Isolation: every scope is a fresh temp fixture. Nothing on the host's real
// Claude configuration is read or written — not %USERPROFILE%\.claude, not
// C:\Program Files\ClaudeCode, not %ProgramData%. The machine scope is reached
// through the vendor's own CLAUDE_CODE_MANAGED_SETTINGS_PATH seam.
//
// Usage:
//   node measure.mjs --binary <path-to-claude> --out <dir> [--port 19341] [--cells 0,1,...]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

// ─── the five sources, in fixture order (bit 0 .. bit 4) ────────────────────
// Each id is the sentinel path segment AND the name used in the emitted matrix.
const SOURCES = [
  { key: 'process',       label: 'process environment',                  bit: 0 },
  { key: 'machine',       label: 'machine managed-settings.d/90-devoid.json', bit: 1 },
  { key: 'user',          label: '~/.claude/settings.json env',          bit: 2 },
  { key: 'project',       label: '<proj>/.claude/settings.json env',     bit: 3 },
  { key: 'projectlocal',  label: '<proj>/.claude/settings.local.json env', bit: 4 },
];

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { port: 19341, cells: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--binary') o.binary = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--port') o.port = Number(a[++i]);
    else if (a[i] === '--cells') o.cells = a[++i].split(',').map(Number);
    else if (a[i] === '--timeout') o.timeoutMs = Number(a[++i]);
    else if (a[i] === '--machine-mode') o.machineMode = a[++i];
  }
  if (!o.binary || !o.out) {
    console.error('usage: node measure.mjs --binary <claude.exe> --out <dir> [--port N] [--cells a,b,c]');
    process.exit(2);
  }
  o.timeoutMs = o.timeoutMs || 40000;
  o.machineMode = o.machineMode || 'dropin';
  return o;
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

// ─── fixture construction ───────────────────────────────────────────────────

let MACHINE_MODE = 'dropin';

function sentinel(port, key) { return `http://127.0.0.1:${port}/s-${key}`; }

function buildCell(root, cellIdx, port) {
  const dir = path.join(root, `cell-${String(cellIdx).padStart(2, '0')}`);
  fs.rmSync(dir, { recursive: true, force: true });

  const home = path.join(dir, 'home');
  const proj = path.join(dir, 'proj');
  const managedDir = path.join(dir, 'machine');
  const dropInDir = path.join(managedDir, 'managed-settings.d');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.mkdirSync(dropInDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(home, 'AppData', 'Roaming'), { recursive: true });
  fs.mkdirSync(path.join(home, 'AppData', 'Local'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'README.md'), 'w3t3 measurement fixture\n');

  const present = k => (cellIdx & (1 << SOURCES.find(s => s.key === k).bit)) !== 0;

  // The vendor requires managed-settings.json to exist as the merge BASE; the
  // .d fragment is what DeVoid actually owns (provider.go dropInLocation).
  const machineBody = present('machine') && MACHINE_MODE !== 'dropin'
    ? { env: { ANTHROPIC_BASE_URL: sentinel(port, 'machine') } } : {};
  fs.writeFileSync(path.join(managedDir, 'managed-settings.json'), JSON.stringify(machineBody, null, 2));
  if (present('machine') && MACHINE_MODE !== 'base') {
    fs.writeFileSync(path.join(dropInDir, '90-devoid.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: sentinel(port, 'machine') } }, null, 2));
  }
  if (present('user')) {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: sentinel(port, 'user') } }, null, 2));
  }
  if (present('project')) {
    fs.writeFileSync(path.join(proj, '.claude', 'settings.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: sentinel(port, 'project') } }, null, 2));
  }
  if (present('projectlocal')) {
    fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: sentinel(port, 'projectlocal') } }, null, 2));
  }

  const env = {
    SystemRoot: process.env.SystemRoot,
    windir: process.env.windir,
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS,
    TEMP: path.join(dir, 'tmp'), TMP: path.join(dir, 'tmp'),
    USERPROFILE: home, HOME: home,
    HOMEDRIVE: home.slice(0, 2), HOMEPATH: home.slice(2),
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    ANTHROPIC_API_KEY: 'sk-ant-w3t3-measurement-not-a-real-key',
    CLAUDE_CODE_MANAGED_SETTINGS_PATH: path.join(managedDir, 'managed-settings.json'),
    CI: '1',
  };
  if (present('process')) env.ANTHROPIC_BASE_URL = sentinel(port, 'process');

  return { dir, proj, env, present: SOURCES.filter(s => present(s.key)).map(s => s.key) };
}

// ─── the run ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  MACHINE_MODE = opts.machineMode;
  const bin = opts.binary;
  const outDir = opts.out;
  fs.mkdirSync(outDir, { recursive: true });
  const root = path.join(outDir, 'fixtures');
  fs.mkdirSync(root, { recursive: true });

  const cp = await import('node:child_process');
  const version = (() => {
    try {
      const r = cp.execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 120000 });
      const m = /(\d+\.\d+\.\d+)/.exec(r);
      return m ? m[1] : 'unknown';
    } catch { return 'unknown'; }
  })();
  const digest = sha256(bin);

  let currentHit = null;
  let onHit = null;
  let allHits = [];
  const srv = http.createServer((req, res) => {
    const m = /^\/s-([a-z]+)\//.exec(req.url) || /^\/s-([a-z]+)$/.exec(req.url);
    if (m) allHits.push(req.url);
    if (m && currentHit === null) {
      currentHit = m[1];
      if (onHit) onHit(m[1]);
    }
    res.writeHead(401, { 'content-type': 'application/json', 'connection': 'close' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'w3t3 sentinel' } }));
  });
  await new Promise(r => srv.listen(opts.port, '127.0.0.1', r));

  const cells = opts.cells || Array.from({ length: 32 }, (_, i) => i);
  const results = [];

  for (const idx of cells) {
    const c = buildCell(root, idx, opts.port);
    currentHit = null;
    allHits = [];
    const child = cp.spawn(bin, ['-p', 'hi', '--model', 'claude-sonnet-4-5-20250929'],
      { cwd: c.proj, env: c.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    child.stdout.on('data', () => {});

    const winner = await new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; try { child.kill('SIGKILL'); } catch {} resolve(v); } };
      onHit = v => finish(v);
      const t = setTimeout(() => finish(null), opts.timeoutMs);
      child.on('close', () => { clearTimeout(t); finish(currentHit); });
      child.on('error', () => { clearTimeout(t); finish(null); });
    });
    onHit = null;

    const row = {
      cell: idx,
      present: c.present,
      winner: winner === null ? 'none' : winner,
      observedRequests: allHits.slice(0, 6),
    };
    results.push(row);
    console.error(`cell ${String(idx).padStart(2)}  present=[${c.present.join(',') || '-'}]  winner=${row.winner}`);
    try { fs.rmSync(c.dir, { recursive: true, force: true }); } catch { /* the killed child may still hold a handle */ }
  }

  srv.close();

  const out = {
    schema: 'devoid.claude-route-precedence.v1',
    measuredAt: new Date().toISOString(),
    binary: { product: 'claude-code', version, sha256: digest, path: bin },
    seam: {
      machineScope: `CLAUDE_CODE_MANAGED_SETTINGS_PATH -> <tmp>/machine/managed-settings.json (machineMode=${MACHINE_MODE}; 'dropin' plants <tmp>/machine/managed-settings.d/90-devoid.json, 'base' plants managed-settings.json itself)`,
      machineMode: MACHINE_MODE,
      observation: 'distinct loopback sentinel base URL per scope; winner = the sentinel path the binary connected to',
    },
    sources: SOURCES.map(s => ({ key: s.key, bit: s.bit, label: s.label })),
    cells: results,
  };
  fs.writeFileSync(path.join(outDir, 'measurement.json'), JSON.stringify(out, null, 2) + '\n');
  console.error(`\nwrote ${path.join(outDir, 'measurement.json')}`);
}

main();
