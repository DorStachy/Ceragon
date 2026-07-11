const assert = require('node:assert/strict');
const { evaluatePosture } = require('./verify-live-posture.cjs');

const now = new Date('2026-07-10T12:00:00.000Z');
const managedSecrets = [
  { name: 'INTERNAL_EVENTS_API_KEY', valueFrom: 'arn:aws:ssm:eu-north-1:123456789012:parameter/events' },
  { name: 'CLI_AGENT_SIGNING_KEYS', valueFrom: 'arn:aws:secretsmanager:eu-north-1:123456789012:secret:keyring' },
];
const green = {
  rds: {
    StorageEncrypted: true,
    PubliclyAccessible: false,
    BackupRetentionPeriod: 7,
    DeletionProtection: true,
  },
  bucketVersioning: {
    'installers-prod': 'Enabled',
    'installer-binaries-prod': 'Enabled',
  },
  backendTaskDefinition: {
    containerDefinitions: [{ name: 'backend', environment: [], secrets: managedSecrets }],
  },
  resultAggregatorLambdaEnvironment: [],
  internalEventsParameterType: 'SecureString',
  agentSigningParameterType: 'SecureString',
  iam: {
    backendInternalEvents: 'allowed',
    backendSigningKeyring: 'allowed',
    intelligenceInternalEvents: 'allowed',
  },
  restoreDrill: {
    completedAt: '2026-07-09T12:00:00.000Z',
    sourceDbIdentifier: 'codefense-postgressdb',
    snapshotArn: 'arn:aws:rds:eu-north-1:123456789012:snapshot:m41-restore-drill',
    restoredDbIdentifier: 'm41-restore-drill-temporary',
    restoredEncrypted: true,
    applicationProbePassed: true,
    deletedAfterVerification: true,
    operator: 'test-operator',
  },
};

assert.equal(evaluatePosture(green, now).ready, true);

const red = structuredClone(green);
red.rds.PubliclyAccessible = true;
red.rds.BackupRetentionPeriod = 1;
red.rds.DeletionProtection = false;
red.bucketVersioning['installers-prod'] = 'Unset';
red.backendTaskDefinition.containerDefinitions[0].environment.push({
  name: 'INTERNAL_EVENTS_API_KEY',
  value: 'never-print-me',
});
red.resultAggregatorLambdaEnvironment.push({ name: 'INTERNAL_EVENTS_API_KEY' });
const failed = evaluatePosture(red, now);
assert.equal(failed.ready, false);
for (const id of [
  'rds.private',
  'rds.backups',
  'rds.deletion-protection',
  's3.installers-prod.versioning',
  'ecs.internal-events-managed',
  'lambda.no-plaintext-internal-events-key',
]) {
  assert.equal(failed.checks.find((check) => check.id === id)?.ok, false, id);
}
assert.doesNotMatch(JSON.stringify(failed), /never-print-me/);

console.log('m4.1 live-posture verifier: ok');
