const assert = require('node:assert/strict');

const {
  CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE,
  GOVERNANCE_CAPABILITY_IDS,
  deriveCapabilityTruth,
  evaluateGovernanceProfile,
} = require('../dist/governance-profile-contract.js');

const now = '2026-07-10T12:00:00.000Z';
const enabled = { enabled: true, required: true, minimumAssurance: 'mandatory' };
const disabled = { enabled: false, required: false, minimumAssurance: 'none' };
const certificate = { passed: true, expiresAt: '2026-07-11T12:00:00.000Z' };
const attestation = { observedAt: '2026-07-10T11:59:00.000Z', healthy: true };

assert.deepEqual(deriveCapabilityTruth(disabled, undefined, now), {
  state: 'unavailable',
  assurance: 'none',
  profileSatisfied: true,
  reason: 'disabled',
});

assert.equal(
  deriveCapabilityTruth(enabled, {
    supported: true,
    governed: true,
    assurance: 'mandatory',
    certificate,
    attestation,
  }, now).state,
  'active',
);

assert.equal(
  deriveCapabilityTruth(enabled, {
    supported: true,
    governed: true,
    assurance: 'mandatory',
    certificate,
    attestation: { ...attestation, evidenceGap: true },
  }, now).state,
  'degraded',
);

const cooperative = deriveCapabilityTruth(enabled, {
  supported: true,
  governed: true,
  assurance: 'cooperative',
  certificate,
  attestation,
}, now);
assert.equal(cooperative.state, 'active');
assert.equal(cooperative.profileSatisfied, false);
assert.equal(cooperative.reason, 'assurance-insufficient');

assert.equal(
  deriveCapabilityTruth(enabled, {
    supported: true,
    governed: true,
    assurance: 'mandatory',
    certificate: { ...certificate, expiresAt: '2026-07-09T12:00:00.000Z' },
    attestation,
  }, now).reason,
  'certificate-expired',
);

assert.equal(
  deriveCapabilityTruth(enabled, {
    supported: true,
    governed: true,
    assurance: 'mandatory',
    certificate,
    attestation: { ...attestation, observedAt: '2026-07-10T12:01:00.000Z' },
  }, now).reason,
  'attestation-stale',
);

const capabilities = Object.fromEntries(
  GOVERNANCE_CAPABILITY_IDS.map((id) => [id, disabled]),
);
capabilities['release.windows'] = enabled;
const profile = {
  schemaVersion: 1,
  id: 'cera-pilot-windows-web-code-security',
  version: 1,
  platforms: ['windows-amd64', 'chrome-managed'],
  capabilities,
};

const missing = evaluateGovernanceProfile(profile, {}, now);
assert.equal(missing.ready, false);
assert.deepEqual(missing.unsatisfiedRequired, ['release.windows']);

const ready = evaluateGovernanceProfile(profile, {
  'release.windows': {
    supported: true,
    governed: true,
    assurance: 'mandatory',
    certificate,
    attestation,
  },
}, now);
assert.equal(ready.ready, true);
assert.deepEqual(ready.unsatisfiedRequired, []);

assert.equal(CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE.version, 1);
assert.equal(
  CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE.capabilities['package.registry-fetch'].enabled,
  false,
);
assert.equal(
  CERA_PILOT_WINDOWS_WEB_CODE_SECURITY_PROFILE.capabilities['package.endpoint-lite'].minimumAssurance,
  'cooperative',
);

console.log('governance-profile-contract: ok');
