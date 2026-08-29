// Stage D - MCP discovery coverage (F7d) fixtures.
const fs = require('fs')
const now = new Date().toISOString()
const SRV = (o) => ({
  id: 'm1', serverName: 'filesystem', capabilities: ['fs.read'], riskFindings: [],
  staticVerdict: null, approvalStatus: 'pending', firstSeen: now, lastSeen: now,
  detectionCount: 1, clientId: null, configScope: null, ...o,
})
const COV = (o) => ({
  id: 'c1', orgId: 'o', siteId: null, endpointId: 'ep-1', clientId: 'claude-code',
  scope: 'user', format: 'json', sourceFile: 'C:/Users/x/.claude.json', state: 'parsed',
  serverCount: 1, detail: null, answered: true, lastSeen: now, ...o,
})

const rowsFull = [
  COV({ id: 'c1', state: 'parsed', serverCount: 2, answered: true }),
  COV({ id: 'c2', state: 'empty', serverCount: 0, answered: true, detail: 'no-servers-declared', sourceFile: 'C:/Users/x/.codex/config.toml', format: 'toml', clientId: 'codex' }),
  COV({ id: 'c3', state: 'absent', serverCount: 0, answered: true, detail: 'not-found', sourceFile: 'C:/ProgramData/devoid/mcp.json', scope: 'machine' }),
  // The three unanswered states — none may read as a pass or as a defect.
  COV({ id: 'c4', state: 'unreadable', serverCount: 0, answered: false, detail: 'permission-denied', sourceFile: 'C:/Users/other/.claude.json' }),
  COV({ id: 'c5', state: 'unparseable', serverCount: 0, answered: false, detail: 'json-syntax-error', sourceFile: 'C:/repo/.mcp.json', scope: 'project' }),
  COV({ id: 'c6', state: 'unrecognized', serverCount: 0, answered: false, detail: 'no-reader-for-format', sourceFile: 'C:/repo/mcp.yaml', scope: 'project' }),
  // A state from a NEWER backend the console has never seen.
  COV({ id: 'c7', state: 'skimmed', serverCount: 0, answered: true, sourceFile: 'C:/repo/.future.json', scope: 'project' }),
]

const P = '^/api/v1/ai/mcp/servers'
const scenarios = {
  'mcp-populated': [{ pattern: P, body: {
    rows: [SRV({}), SRV({ id: 'm2', serverName: 'shell-repl', clientId: 'codex', configScope: 'project', capabilities: ['exec.run'] })],
    total: 2, coverage: rowsFull,
    coverageSummary: { reported: true, sourcesTotal: 7, sourcesAnswered: 4, sourcesUnanswered: 3, endpointsReporting: 1 },
  } }],
  // Every source answered: the count line is allowed to say N of N.
  'mcp-complete': [{ pattern: P, body: {
    rows: [SRV({})], total: 1, coverage: rowsFull.slice(0, 3),
    coverageSummary: { reported: true, sourcesTotal: 3, sourcesAnswered: 3, sourcesUnanswered: 0, endpointsReporting: 1 },
  } }],
  // THE TRAP: unanswered rows on screen, but the summary claims all answered.
  'mcp-lying-summary': [{ pattern: P, body: {
    rows: [SRV({})], total: 1, coverage: rowsFull,
    coverageSummary: { reported: true, sourcesTotal: 7, sourcesAnswered: 7, sourcesUnanswered: 0, endpointsReporting: 1 },
  } }],
  // Nothing in scope ever posted coverage.
  'mcp-unreported': [{ pattern: P, body: {
    rows: [], total: 0, coverage: [],
    coverageSummary: { reported: false, sourcesTotal: 0, sourcesAnswered: 0, sourcesUnanswered: 0, endpointsReporting: 0 },
  } }],
  // Older backend: no coverage keys at all.
  'mcp-not-served': [{ pattern: P, body: { rows: [], total: 0 } }],
  'mcp-error': [{ pattern: P, status: 500, body: { message: 'mcp read failed' } }],
}
const name = process.argv[2]
if (!scenarios[name]) { console.error('known:', Object.keys(scenarios).join(', ')); process.exit(1) }
fs.writeFileSync(__dirname + '/mcp-frag.json', JSON.stringify(scenarios[name], null, 2))
console.log('mcp fragment ->', name)
