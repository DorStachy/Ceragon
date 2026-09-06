/* P47 stage-1 lane `mcp` — plant / clear / remove MCP server entries in the
 * ISOLATED home only. Never touches the real ~/.claude.json, ~/.codex or ~/.cursor.
 *
 * Usage:  node plant-mcp.cjs plant | empty | remove
 *   plant  - three servers in Claude Code (.claude.json), three in Codex
 *            (config.toml [mcp_servers]), one in Cursor (~/.cursor/mcp.json)
 *   empty  - a config with NO mcp servers at all (negative control)
 *   remove - restore every file to its pre-test state and delete what we created
 *
 * The synthetic secret is assembled from fragments at runtime so no attack-shaped
 * literal is ever written by an editor tool. It is NOT a real credential.
 */
const fs = require('fs');
const path = require('path');

const ISO = 'C:/Users/Owner/AppData/Local/Temp/devoid-p47-iso';
const HOME = path.join(ISO, 'home');
const CLAUDE_JSON = path.join(HOME, '.claude.json');
const CODEX_TOML = path.join(HOME, '.codex', 'config.toml');
const CURSOR_DIR = path.join(HOME, '.cursor');
const CURSOR_JSON = path.join(CURSOR_DIR, 'mcp.json');
const EVID = __dirname;
const CODEX_BAK = path.join(EVID, 'codex-config.toml.pre-p47mcp.bak');

// synthetic, generated for this test only — assembled so no literal exists on disk
const synthSecret = ['sk', 'live', Buffer.from('UDQ3U1lOVEhFVElDTk9UUkVBTA==', 'base64').toString()].join('_');

const MARK_BEGIN = '# >>> p47-mcp-lane test entries >>>';
const MARK_END = '# <<< p47-mcp-lane test entries <<<';

const benignArgs = ['-y', '@modelcontextprotocol/server-filesystem@2025.8.21',
  path.join(HOME, 'Documents')];

function claudePayload(withServers) {
  return {
    // bounded project-root map the registry reads for project-scope discovery
    projects: {},
    mcpServers: withServers ? {
      'p47-fs-benign': { command: 'npx', args: benignArgs },
      'p47-unknown-harvester': {
        command: 'npx',
        args: ['-y', 'mcp-quick-notes-sync@0.0.3'],
        env: { NOTES_SYNC_API_TOKEN: synthSecret }
      },
      'p47-remote-tower': { type: 'http', url: 'https://mcp.p47-not-a-real-host.example/mcp' }
    } : {}
  };
}

function codexBlock() {
  return [
    MARK_BEGIN,
    '[mcp_servers.p47-codex-fs-benign]',
    'command = "npx"',
    'args = ' + JSON.stringify(benignArgs),
    '',
    '[mcp_servers.p47-codex-harvester]',
    'command = "npx"',
    'args = ["-y", "mcp-quick-notes-sync@0.0.3"]',
    '',
    '[mcp_servers.p47-codex-harvester.env]',
    'NOTES_SYNC_API_TOKEN = ' + JSON.stringify(synthSecret),
    '',
    '[mcp_servers.p47-codex-remote]',
    'url = "https://mcp.p47-not-a-real-host.example/sse"',
    MARK_END,
    ''
  ].join('\n');
}

function stripCodexBlock(text) {
  const i = text.indexOf(MARK_BEGIN);
  if (i < 0) return text;
  const j = text.indexOf(MARK_END);
  if (j < 0) return text.slice(0, i);
  return text.slice(0, i) + text.slice(j + MARK_END.length).replace(/^\r?\n/, '');
}

const mode = process.argv[2] || 'plant';

if (mode === 'plant' || mode === 'empty') {
  fs.writeFileSync(CLAUDE_JSON, JSON.stringify(claudePayload(mode === 'plant'), null, 2) + '\n');
  console.log('wrote', CLAUDE_JSON);

  if (fs.existsSync(CODEX_TOML)) {
    if (!fs.existsSync(CODEX_BAK)) {
      fs.copyFileSync(CODEX_TOML, CODEX_BAK);
      console.log('backed up codex config.toml ->', CODEX_BAK);
    }
    const cur = stripCodexBlock(fs.readFileSync(CODEX_TOML, 'utf8'));
    fs.writeFileSync(CODEX_TOML, mode === 'plant' ? cur.replace(/\s*$/, '\n') + '\n' + codexBlock() : cur);
    console.log('updated', CODEX_TOML, mode === 'plant' ? '(+3 mcp_servers)' : '(mcp_servers removed)');
  }

  fs.mkdirSync(CURSOR_DIR, { recursive: true });
  fs.writeFileSync(CURSOR_JSON, JSON.stringify({
    mcpServers: mode === 'plant'
      ? { 'p47-cursor-fs-benign': { command: 'npx', args: benignArgs } }
      : {}
  }, null, 2) + '\n');
  console.log('wrote', CURSOR_JSON);
} else if (mode === 'remove') {
  for (const f of [CLAUDE_JSON, CURSOR_JSON]) {
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('deleted', f); }
  }
  if (fs.existsSync(CURSOR_DIR)) { try { fs.rmdirSync(CURSOR_DIR); console.log('rmdir', CURSOR_DIR); } catch (e) {} }
  if (fs.existsSync(CODEX_BAK)) {
    fs.copyFileSync(CODEX_BAK, CODEX_TOML);
    console.log('restored codex config.toml from backup');
  } else if (fs.existsSync(CODEX_TOML)) {
    fs.writeFileSync(CODEX_TOML, stripCodexBlock(fs.readFileSync(CODEX_TOML, 'utf8')));
    console.log('stripped p47 block from codex config.toml');
  }
} else {
  console.error('unknown mode', mode); process.exit(2);
}
