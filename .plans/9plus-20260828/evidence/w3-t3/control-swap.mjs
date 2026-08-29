// control-swap.mjs — guards against a fixture-writer artifact.
//
// In the matrix, the user file always carries the "user" sentinel. If the
// harness had a bug that made the *string* win rather than the *file*, the
// matrix would still look self-consistent. This control swaps the payloads:
// the user file gets the "project" sentinel and the project file gets the
// "user" sentinel. The winning FILE is still expected to be the user file, so
// the reported label must FLIP to "project".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';

const PORT = Number(process.argv[2] || 19370);
const BIN = 'C:/Users/Owner/.local/bin/claude.exe';
const cases = [
  { name: 'user+project, payloads SWAPPED', userVal: 'project', projVal: 'user', expectLabel: 'project' },
  { name: 'user+project, payloads NORMAL', userVal: 'user', projVal: 'project', expectLabel: 'user' },
];

let hit = null, onHit = null;
const srv = http.createServer((req, res) => {
  const m = /^\/s-([a-z]+)\//.exec(req.url);
  if (m && hit === null) { hit = m[1]; if (onHit) onHit(m[1]); }
  res.writeHead(401, { 'content-type': 'application/json', connection: 'close' });
  res.end('{"type":"error","error":{"type":"authentication_error","message":"w3t3"}}');
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

for (const c of cases) {
  const root = path.join(process.env.SCRATCH, 'control-' + c.userVal);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  const home = path.join(root, 'home'), proj = path.join(root, 'proj');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(home, 'AppData', 'Roaming'), { recursive: true });
  fs.mkdirSync(path.join(home, 'AppData', 'Local'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'README.md'), 'w3t3\n');
  const url = k => `http://127.0.0.1:${PORT}/s-${k}`;
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: url(c.userVal) } }, null, 2));
  fs.writeFileSync(path.join(proj, '.claude', 'settings.json'),
    JSON.stringify({ env: { ANTHROPIC_BASE_URL: url(c.projVal) } }, null, 2));

  const env = {
    SystemRoot: process.env.SystemRoot, windir: process.env.windir,
    PATH: process.env.PATH, PATHEXT: process.env.PATHEXT,
    TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'),
    USERPROFILE: home, HOME: home, HOMEDRIVE: 'C:', HOMEPATH: home.slice(2),
    APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    ANTHROPIC_API_KEY: 'sk-ant-w3t3-measurement-not-a-real-key', CI: '1',
  };
  hit = null;
  const child = cp.spawn(BIN, ['-p', 'hi'], { cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  const got = await new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; try { child.kill('SIGKILL'); } catch {} res(v); } };
    onHit = fin;
    const t = setTimeout(() => fin(null), 35000);
    child.on('close', () => { clearTimeout(t); fin(hit); });
  });
  onHit = null;
  console.log(`${c.name}: sentinel=${got} expected=${c.expectLabel} ${got === c.expectLabel ? 'OK' : 'MISMATCH'}`);
}
srv.close();
