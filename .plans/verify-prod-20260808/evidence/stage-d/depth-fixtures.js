// Stage D - F38 enforcement proof render (protection depth panel).
const fs = require('fs')
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()

const INTEG = (o) => ({
  runtimeInstanceId: 'ri-1', integrityState: 'converged', containment: 'endpoint',
  lastCheckedAt: iso(now - 60e3), ...o,
})
const AD = (id, runtime, integrity) => ({
  adapterId: id, runtime, host: 'DESKTOP-QA01', executionLocation: 'windows',
  coverageDepth: 'runtime-native', overall: 'active', deploymentAssurance: 'tamper-resistant',
  checkpoints: [], mcpRows: [], integrity,
})

const adapters = [
  // A real proof: receipt held, observation instant present, expiry in the future.
  AD('a-proven', 'claude-code', INTEG({ runtimeInstanceId: 'ri-proven', enforcementProof: 'proven', serverHoldsReceipt: true, enforcementTestedAt: iso(now - 300e3), proofExpiresAt: iso(now + 3600e3) })),
  // THE F38-a LIE: 'proven' on the wire with NO receipt. Must demote.
  AD('a-noreceipt', 'claude-code', INTEG({ runtimeInstanceId: 'ri-noreceipt', enforcementProof: 'proven', serverHoldsReceipt: false, enforcementTestedAt: iso(now - 300e3), proofExpiresAt: iso(now + 3600e3) })),
  // 'proven' with a receipt but NO observation instant. Must demote.
  AD('a-noinstant', 'codex', INTEG({ runtimeInstanceId: 'ri-noinstant', enforcementProof: 'proven', serverHoldsReceipt: true, enforcementTestedAt: null, proofExpiresAt: iso(now + 3600e3) })),
  // 'proven' whose expiry has passed.
  AD('a-expired', 'codex', INTEG({ runtimeInstanceId: 'ri-expired', enforcementProof: 'proven', serverHoldsReceipt: true, enforcementTestedAt: iso(now - 7200e3), proofExpiresAt: iso(now - 60e3) })),
  // A measured gap.
  AD('a-gap', 'cursor', INTEG({ runtimeInstanceId: 'ri-gap', enforcementProof: 'not-proven', serverHoldsReceipt: true, enforcementTestedAt: iso(now - 120e3) })),
  // Never tested.
  AD('a-never', 'cursor', INTEG({ runtimeInstanceId: 'ri-never', enforcementProof: 'never-tested' })),
  // A token this build has never heard of.
  AD('a-future', 'windsurf', INTEG({ runtimeInstanceId: 'ri-future', enforcementProof: 'ENFORCED_OK', serverHoldsReceipt: true, enforcementTestedAt: iso(now - 60e3), proofExpiresAt: iso(now + 3600e3) })),
  // Pre-F38 Backend: integrity block with no proof keys at all.
  AD('a-notserved', 'windsurf', INTEG({ runtimeInstanceId: 'ri-notserved' })),
  // No integrity block at all - must be in NO bucket and be called out.
  AD('a-noblock', 'aider', null),
]

const body = {
  runtimes: [],
  endpoints: [{
    endpointId: 'ep-1', agentId: 'ag-1', hostname: 'DESKTOP-QA01',
    lastAttestedAt: iso(now - 60e3), adapters,
  }],
  summary: {
    endpoints: 1, adapters: 9, adaptersReported: 9,
    states: { active: 9 }, active: 9, observed: 0, stale: 0, drifted: 0, unknown: 0,
  },
}

const P = '^/api/v1/ai/protection-depth'
const scenarios = {
  'depth-proof': [{ pattern: P, body }],
  'depth-empty': [{ pattern: P, body: { runtimes: [], endpoints: [], summary: { endpoints: 0, adapters: 0, adaptersReported: 0, states: {}, active: 0, stale: 0, drifted: 0, unknown: 0 } } }],
  'depth-error': [{ pattern: P, status: 500, body: { message: 'protection depth read failed' } }],
}
const name = process.argv[2]
if (!scenarios[name]) { console.error('known:', Object.keys(scenarios).join(', ')); process.exit(1) }
fs.writeFileSync(__dirname + '/depth-frag.json', JSON.stringify(scenarios[name], null, 2))
console.log('depth fragment ->', name)
