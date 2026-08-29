/**
 * Render-remainder fixtures (register §6 findings 7, 8, 10, 14).
 * node rem.cjs <scenario>  -> writes overrides.json
 */
const fs = require('fs')
const path = require('path')
const now = new Date().toISOString()

const OPTOUT = '^/api/v1/ai/optout-coverage'
const READY = '^/api/v1/endpoint/readiness$'
const MCP = '^/api/v1/ai/mcp/servers'
const WEB = '^/api/v1/ai/web-coverage'

const READINESS_BASE = {
  summary: { scope: 'site', overall: 'ready', counts: { ready: 2, 'at-risk': 0, 'not-ready': 0, unknown: 0 }, totalEndpoints: 2, teams: [], generatedAt: now },
  endpoints: [],
}
const ROW = (o) => ({ endpointId: null, hostname: null, runtime: null, state: 'NOT_REPORTED', actor: null, reason: null, lever: null, expiresAt: null, observedAt: null, ...o })

// F10 — rows are a SUBSET of scope (total 5, two rows listed), and both rows
// carry a state token this build does not know, so both render "Not reported"
// while the server summary says notReported 0.
const OPTOUT_SUBSET_UNKNOWN = {
  rows: [
    ROW({ endpointId: 'ep-9', hostname: 'DESKTOP-QA09', runtime: 'codex', state: 'GOVERNED_OK' }),
    ROW({ endpointId: 'ep-10', hostname: 'DESKTOP-QA10', runtime: 'codex', state: null }),
  ],
  summary: { endpoints: 5, skippedAuthorized: 0, expired: 0, notReported: 0 },
  total: 5,
}
// CONTROL for F10 — same subset shape, but the server and the rows agree.
const OPTOUT_SUBSET_HONEST = {
  rows: [
    ROW({ endpointId: 'ep-9', hostname: 'DESKTOP-QA09', runtime: 'codex', state: 'NOT_REPORTED' }),
    ROW({ endpointId: 'ep-11', hostname: 'DESKTOP-QA11', runtime: 'codex', state: 'SKIPPED_AUTHORIZED', actor: 'CORP\maya', lever: 'pause', observedAt: now }),
  ],
  summary: { endpoints: 5, skippedAuthorized: 3, expired: 0, notReported: 2 },
  total: 5,
}

const SRV = (o) => ({ id: 'm1', serverName: 'filesystem', capabilities: ['fs.read'], riskFindings: [], staticVerdict: null, approvalStatus: 'pending', firstSeen: now, lastSeen: now, detectionCount: 1, clientId: null, configScope: null, ...o })
const COV = (o) => ({ id: 'c1', orgId: 'o', siteId: null, endpointId: 'ep-1', clientId: 'claude-code', scope: 'user', format: 'json', sourceFile: 'C:/Users/x/.claude.json', state: 'parsed', serverCount: 1, detail: null, answered: true, lastSeen: now, ...o })

// F7 — reported:true, but the wire carries no sourcesTotal / sourcesAnswered.
const MCP_NO_TOTAL = [{ pattern: MCP, body: {
  rows: [SRV({})], total: 1,
  coverage: [
    COV({ id: 'c1', state: 'parsed', serverCount: 2 }),
    COV({ id: 'c2', state: 'unreadable', answered: false, detail: 'permission-denied', sourceFile: 'C:/Users/other/.claude.json' }),
  ],
  coverageSummary: { reported: true, endpointsReporting: 1 },
} }]
// F8 — a full summary served with NO coverage row list at all.
const MCP_SUMMARY_NO_ROWS = [{ pattern: MCP, body: {
  rows: [SRV({})], total: 1, coverage: [],
  coverageSummary: { reported: true, sourcesTotal: 7, sourcesAnswered: 7, sourcesUnanswered: 0, endpointsReporting: 1 },
} }]
// CONTROL for F7/F8 — an honest, complete, fully-served coverage read.
const MCP_HONEST = [{ pattern: MCP, body: {
  rows: [SRV({})], total: 1,
  coverage: [COV({ id: 'c1', state: 'parsed', serverCount: 1 }), COV({ id: 'c2', state: 'empty', serverCount: 0, detail: 'no-servers-declared' }), COV({ id: 'c3', state: 'absent', serverCount: 0, detail: 'not-found' })],
  coverageSummary: { reported: true, sourcesTotal: 3, sourcesAnswered: 3, sourcesUnanswered: 0, endpointsReporting: 1 },
} }]

// F14 — the failure message the backend hands back carries a bidi override, a
// zero-width joiner, a raw newline and a tail far past the display cap.
const HOSTILE = 'read failed \u202Egnimialc\u200D si\u202C\nGUARD: HEALTHY \u0007' + 'x'.repeat(2400)
const WEB_HOSTILE = [{ pattern: WEB, status: 502, body: { message: HOSTILE } }]
const WEB_PLAIN = [{ pattern: WEB, status: 502, body: { message: 'web coverage read failed: upstream unavailable' } }]

const S = {
  'optout-subset-unknown': [{ pattern: READY, body: READINESS_BASE }, { pattern: OPTOUT, body: OPTOUT_SUBSET_UNKNOWN }],
  'optout-subset-honest': [{ pattern: READY, body: READINESS_BASE }, { pattern: OPTOUT, body: OPTOUT_SUBSET_HONEST }],
  'mcp-no-total': MCP_NO_TOTAL,
  'mcp-summary-no-rows': MCP_SUMMARY_NO_ROWS,
  'mcp-honest': MCP_HONEST,
  'web-hostile': [{ pattern: READY, body: READINESS_BASE }].concat(WEB_HOSTILE),
  'web-plain': [{ pattern: READY, body: READINESS_BASE }].concat(WEB_PLAIN),
}
const n = process.argv[2]
if (!S[n]) { console.error('known:', Object.keys(S).join(', ')); process.exit(1) }
fs.writeFileSync(path.join(__dirname, 'overrides.json'), JSON.stringify(S[n], null, 2))
console.log('scenario ->', n)
