'use strict';

const path = require('node:path');
const {
  IntegrationGateError,
  runReviewedIntegrationGate,
} = require('./lib/ai-security-integration-gate.cjs');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const ROOT_FLAGS = Object.freeze({
  '--canonical-root': 'canonical',
  '--prior-canonical-root': 'priorCanonical',
  '--backend-root': 'backend',
  '--installer-root': 'installer',
  '--browser-root': 'browser',
  '--frontend-root': 'frontend',
});
const RUNTIME_FLAGS = Object.freeze({
  '--frontend-dependency-image-id': 'frontendDependencyImageId',
  '--frontend-dependency-image-config-sha256': 'frontendDependencyImageConfigSha256',
});
const FLAGS = Object.freeze({ ...ROOT_FLAGS, ...RUNTIME_FLAGS });

function parseArguments(argv) {
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!Object.hasOwn(FLAGS, flag)) {
      throw new IntegrationGateError('INVALID_ARGUMENT', 'unknown integration gate argument');
    }
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new IntegrationGateError('INVALID_ARGUMENT', `missing value for ${flag}`);
    }
    const key = FLAGS[flag];
    if (Object.hasOwn(values, key)) {
      throw new IntegrationGateError('INVALID_ARGUMENT', `duplicate integration input ${key}`);
    }
    values[key] = value;
  }
  for (const key of Object.values(FLAGS)) {
    if (!Object.hasOwn(values, key)) {
      throw new IntegrationGateError('INVALID_ARGUMENT', `missing required integration input ${key}`);
    }
  }
  const roots = Object.fromEntries(
    Object.values(ROOT_FLAGS).map((key) => [key, values[key]]),
  );
  const runtimeInputs = {
    frontendDependencyImage: {
      id: values.frontendDependencyImageId,
      configSha256: values.frontendDependencyImageConfigSha256,
    },
  };
  return Object.freeze({ roots, runtimeInputs });
}

async function main() {
  const { roots, runtimeInputs } = parseArguments(process.argv.slice(2));
  const result = await runReviewedIntegrationGate(PACKAGE_ROOT, roots, runtimeInputs);
  process.stdout.write(result.evidenceBytes);
}

main().catch((error) => {
  const code = error instanceof IntegrationGateError ? error.code : 'INTEGRATION_GATE_FAILED';
  const message = error instanceof IntegrationGateError
    ? error.message
    : 'P0-C07 integration gate failed closed';
  process.stderr.write(`${JSON.stringify({
    format: 'ceragon.ai-security.integration-error',
    formatVersion: 1,
    packetId: 'P0-C07',
    code,
    message,
  })}\n`);
  process.exitCode = 1;
});