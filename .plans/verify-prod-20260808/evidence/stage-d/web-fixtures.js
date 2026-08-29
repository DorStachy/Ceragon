// Stage D — web-guard ladder (F39/F40) fixtures, generated into overrides fragments.
const fs = require('fs')
const EP = (o) => ({
  endpointId: 'wep-x', hostname: 'DESKTOP-X', version: '0.5.13',
  lastSeen: new Date(Date.now() - 60e3).toISOString(), online: true,
  policyAgeMs: 60000, drifted: false, driftedSites: [], ...o,
})
const MEASURED = 'dnr-engine'

const rows = [
  // THE C10 TRAP, verbatim from the checklist: a count of 0 with NO source.
  // Must read "Not reported", never "Blocks not armed".
  EP({ endpointId: 'wep-trap', hostname: 'TRAP-COUNT-0-NO-SOURCE', navBlockRuleCount: 0, navBlockRuleCountSource: null }),
  // A MEASURED disarm — the only shape allowed to produce the critical rung.
  EP({ endpointId: 'wep-disarm', hostname: 'MEASURED-DISARM', navBlockRuleCount: 0, navBlockRuleCountSource: MEASURED, navBlockArmed: false }),
  // A measured ARMED endpoint whose count is also 0 (the structural-zero case).
  EP({ endpointId: 'wep-armed', hostname: 'MEASURED-ARMED-COUNT-0', navBlockRuleCount: 0, navBlockRuleCountSource: MEASURED, navBlockArmed: true, guardHealth: 'HEALTHY', guardHealthReportedAt: new Date().toISOString() }),
  // F40 fail-open: outranks everything below it.
  EP({ endpointId: 'wep-failopen', hostname: 'GUARD-FAIL-OPEN', navBlockRuleCountSource: MEASURED, navBlockArmed: true, guardHealth: 'DEGRADED_FAIL_OPEN', guardFailOpenSendCount: 3, guardDegradedSince: new Date(Date.now() - 900e3).toISOString(), guardHealthReportedAt: new Date().toISOString(), guardDegradedEpisodes: [{ failure: 'selector-miss', surface: 'chat.openai.com', count: 3, sinceIso: new Date(Date.now() - 900e3).toISOString() }] }),
  // Guard state absent entirely (older backend): must NOT read healthy.
  EP({ endpointId: 'wep-silent', hostname: 'GUARD-KEY-ABSENT', navBlockRuleCountSource: MEASURED, navBlockArmed: true }),
  // Guard state a producer invented: must NOT land on the clean rung.
  EP({ endpointId: 'wep-unknown', hostname: 'GUARD-UNKNOWN-TOKEN', navBlockRuleCountSource: MEASURED, navBlockArmed: true, guardHealth: 'OK_PROBABLY', guardHealthReportedAt: new Date().toISOString() }),
  // Explicit NOT_REPORTED.
  EP({ endpointId: 'wep-nr', hostname: 'GUARD-NOT-REPORTED', navBlockRuleCountSource: MEASURED, navBlockArmed: true, guardHealth: 'NOT_REPORTED' }),
  // Offline: nothing is being measured.
  EP({ endpointId: 'wep-off', hostname: 'EXTENSION-MISSING', online: false, policyAgeMs: null }),
]

const scenarios = {
  'web-populated': [{ pattern: '^/api/v1/ai/web-coverage', body: { endpoints: rows, summary: { installed: 8, online: 7, stale: 0, degraded: 0, navBlockNotArmed: 1, guardFailOpen: 1, guardHealthNotReported: 5 } } }],
  // Older backend: the three F39/F40 summary keys absent entirely.
  'web-legacy-summary': [{ pattern: '^/api/v1/ai/web-coverage', body: { endpoints: rows, summary: { installed: 8, online: 7, stale: 0, degraded: 0 } } }],
  'web-empty': [{ pattern: '^/api/v1/ai/web-coverage', body: { endpoints: [], summary: { installed: 0, online: 0, stale: 0, degraded: 0, navBlockNotArmed: 0, guardFailOpen: 0, guardHealthNotReported: 0 } } }],
  'web-error': [{ pattern: '^/api/v1/ai/web-coverage', status: 502, body: { message: 'web coverage read failed' } }],
}
const name = process.argv[2]
if (!scenarios[name]) { console.error('known:', Object.keys(scenarios).join(', ')); process.exit(1) }
fs.writeFileSync(__dirname + '/web-frag.json', JSON.stringify(scenarios[name], null, 2))
console.log('web fragment ->', name)
