/**
 * Stage D fixture switcher.
 *
 * `node fx.cjs <scenario>` rewrites overrides.json; the stub reloads it on the
 * next request, so a scenario change costs no restart of either server.
 */
const fs = require('fs')
const path = require('path')

const READINESS_BASE = {
  summary: {
    scope: 'site',
    overall: 'ready',
    counts: { ready: 2, 'at-risk': 0, 'not-ready': 0, unknown: 0 },
    totalEndpoints: 2,
    teams: [],
    generatedAt: new Date().toISOString(),
  },
  endpoints: [],
}

const ROW = (o) => ({
  endpointId: null, hostname: null, runtime: null, state: 'NOT_REPORTED',
  actor: null, reason: null, lever: null, expiresAt: null, observedAt: null, ...o,
})

const OPTOUT_POPULATED = {
  rows: [
    ROW({
      endpointId: 'ep-1', hostname: 'DESKTOP-QA01', runtime: 'codex',
      state: 'SKIPPED_AUTHORIZED', actor: 'CORP\\maya', lever: 'pause',
      reason: 'Debugging a false positive on the release branch',
      expiresAt: new Date(Date.now() + 3600e3).toISOString(),
      observedAt: new Date(Date.now() - 600e3).toISOString(),
    }),
    ROW({
      endpointId: 'ep-2', hostname: 'DESKTOP-QA02', runtime: 'claude-code',
      state: 'OPTOUT_EXPIRED', actor: 'CORP\\ariel', lever: 'uninstall-hooks',
      reason: null,
      expiresAt: new Date(Date.now() - 7200e3).toISOString(),
      observedAt: new Date(Date.now() - 5400e3).toISOString(),
    }),
    ROW({
      endpointId: 'ep-3', hostname: 'DESKTOP-QA03', runtime: 'codex',
      state: 'COVERED', actor: 'CORP\\maya', lever: 'pause',
      observedAt: new Date(Date.now() - 300e3).toISOString(),
    }),
    // The coordinator's live finding, in row form: a runtime SPOKE and the
    // backend could not read what it said. Must NOT read as governed.
    ROW({ endpointId: 'ep-4', hostname: 'DESKTOP-QA04', runtime: 'wsl:Ubuntu-22.04', state: 'NOT_REPORTED' }),
    // An endpoint that never spoke at all: no runtime to name.
    ROW({ endpointId: 'ep-5', hostname: 'DESKTOP-QA05' }),
  ],
  summary: { endpoints: 5, skippedAuthorized: 1, expired: 1, notReported: 2 },
  total: 5,
}

const OPTOUT_ALL_UNMEASURED = {
  rows: [
    ROW({ endpointId: 'ep-1', hostname: 'DESKTOP-QA01' }),
    ROW({ endpointId: 'ep-2', hostname: 'DESKTOP-QA02' }),
  ],
  summary: { endpoints: 2, skippedAuthorized: 0, expired: 0, notReported: 2 },
  total: 2,
}

const OPTOUT_EMPTY = {
  rows: [],
  summary: { endpoints: 0, skippedAuthorized: 0, expired: 0, notReported: 0 },
  total: 0,
}

// Defeat shape: an UNKNOWN state token the wire type does not name. The panel
// must degrade to NOT_REPORTED, never invent a green.
const OPTOUT_UNKNOWN_TOKEN = {
  rows: [
    ROW({ endpointId: 'ep-9', hostname: 'DESKTOP-QA09', runtime: 'codex', state: 'GOVERNED_OK' }),
    ROW({ endpointId: 'ep-10', hostname: 'DESKTOP-QA10', runtime: 'codex', state: null }),
  ],
  summary: { endpoints: 2, skippedAuthorized: 0, expired: 0, notReported: 0 },
  total: 2,
}

const OPTOUT = '^/api/v1/ai/optout-coverage'
const READY = '^/api/v1/endpoint/readiness$'

const SCENARIOS = {
  // Baseline: a readiness envelope the dashboard can render at all.
  base: [{ pattern: READY, body: READINESS_BASE }],
  'optout-populated': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: OPTOUT_POPULATED },
  ],
  'optout-unmeasured': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: OPTOUT_ALL_UNMEASURED },
  ],
  'optout-empty': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: OPTOUT_EMPTY },
  ],
  'optout-error': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, status: 503, body: { message: 'opt-out coverage read failed: upstream unavailable' } },
  ],
  'optout-slow': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: OPTOUT_POPULATED, delayMs: 60000 },
  ],
  'optout-unknown-token': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: OPTOUT_UNKNOWN_TOKEN },
  ],
  // Defeat: strip the summary entirely — the type says it is required, so this
  // is the "hand it a shape the wire could produce from an older backend" probe.
  'optout-no-summary': [
    { pattern: READY, body: READINESS_BASE },
    { pattern: OPTOUT, body: { rows: OPTOUT_POPULATED.rows, total: 5 } },
  ],
}

const name = process.argv[2]
const extra = process.argv[3]
if (!SCENARIOS[name]) {
  console.error('unknown scenario:', name, '\nknown:', Object.keys(SCENARIOS).join(', '))
  process.exit(1)
}
let list = SCENARIOS[name]
if (extra) list = list.concat(JSON.parse(fs.readFileSync(extra, 'utf8')))
fs.writeFileSync(path.join(__dirname, 'overrides.json'), JSON.stringify(list, null, 2))
console.log('scenario ->', name, '(' + list.length + ' overrides)')
