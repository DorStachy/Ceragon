#!/usr/bin/env node
/* eslint-disable no-console */

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');

const REGION = process.env.AWS_REGION || 'eu-north-1';
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || '113627991972';
const INTERNAL_EVENTS_PARAMETER =
  'arn:aws:ssm:eu-north-1:113627991972:parameter/ceragon/production/intel/INTERNAL_EVENTS_API_KEY';

function aws(args) {
  const output = execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return output ? JSON.parse(output) : {};
}

function names(entries) {
  return new Set((entries || []).map((entry) => entry && entry.name).filter(Boolean));
}

function managedSecretCheck(taskDefinition, name) {
  const container = (taskDefinition.containerDefinitions || []).find((item) => item.name === 'backend');
  if (!container) return { ok: false, detail: 'backend container missing' };
  const environment = (container.environment || []).filter((entry) => entry.name === name);
  const secrets = (container.secrets || []).filter((entry) => entry.name === name);
  const managedArn = secrets.length === 1 &&
    /^arn:aws[a-z-]*:(?:ssm|secretsmanager):/.test(secrets[0].valueFrom || '');
  return {
    ok: environment.length === 0 && secrets.length === 1 && managedArn,
    detail:
      environment.length > 0
        ? `${name} remains in plaintext environment`
        : secrets.length !== 1
          ? `${name} must have exactly one managed-secret reference`
          : managedArn
            ? 'managed-secret reference present'
            : `${name} reference is not SSM/Secrets Manager`,
  };
}

function evaluatePosture(state, now = new Date()) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
  const rds = state.rds || {};
  add('rds.encrypted', rds.StorageEncrypted === true, 'storage encryption enabled');
  add('rds.private', rds.PubliclyAccessible === false, 'publiclyAccessible must be false');
  add(
    'rds.backups',
    Number(rds.BackupRetentionPeriod) >= 7,
    `backup retention=${Number(rds.BackupRetentionPeriod) || 0} days (minimum 7)`,
  );
  add(
    'rds.deletion-protection',
    rds.DeletionProtection === true,
    'deletion protection enabled',
  );

  for (const bucket of ['installers-prod', 'installer-binaries-prod']) {
    add(
      `s3.${bucket}.versioning`,
      state.bucketVersioning?.[bucket] === 'Enabled',
      `versioning=${state.bucketVersioning?.[bucket] || 'Unset'}`,
    );
  }

  const internalEvents = managedSecretCheck(state.backendTaskDefinition || {}, 'INTERNAL_EVENTS_API_KEY');
  add('ecs.internal-events-managed', internalEvents.ok, internalEvents.detail);
  const signingKeyring = managedSecretCheck(state.backendTaskDefinition || {}, 'CLI_AGENT_SIGNING_KEYS');
  add('ecs.agent-signing-keyring-managed', signingKeyring.ok, signingKeyring.detail);

  const lambdaNames = names(state.resultAggregatorLambdaEnvironment);
  add(
    'lambda.no-plaintext-internal-events-key',
    !lambdaNames.has('INTERNAL_EVENTS_API_KEY'),
    lambdaNames.has('INTERNAL_EVENTS_API_KEY')
      ? 'plaintext key remains on result-aggregator Lambda'
      : 'unused plaintext key absent',
  );

  add(
    'ssm.internal-events-secure-string',
    state.internalEventsParameterType === 'SecureString',
    `parameter type=${state.internalEventsParameterType || 'missing'}`,
  );
  add(
    'ssm.agent-signing-keyring-secure-string',
    state.agentSigningParameterType === 'SecureString',
    `parameter type=${state.agentSigningParameterType || 'missing'}`,
  );
  add(
    'iam.backend-internal-events-read',
    state.iam?.backendInternalEvents === 'allowed',
    `decision=${state.iam?.backendInternalEvents || 'missing'}`,
  );
  add(
    'iam.backend-signing-keyring-read',
    state.iam?.backendSigningKeyring === 'allowed',
    `decision=${state.iam?.backendSigningKeyring || 'missing'}`,
  );
  add(
    'iam.intelligence-internal-events-read',
    state.iam?.intelligenceInternalEvents === 'allowed',
    `decision=${state.iam?.intelligenceInternalEvents || 'missing'}`,
  );

  const drill = state.restoreDrill;
  const drillAt = drill && Date.parse(drill.completedAt);
  const drillFresh = Number.isFinite(drillAt) && now.getTime() - drillAt <= 180 * 24 * 60 * 60 * 1000;
  add(
    'rds.restore-drill',
    Boolean(
      drill &&
        drillFresh &&
        drill.sourceDbIdentifier === 'codefense-postgressdb' &&
        /^arn:aws[a-z-]*:rds:[a-z0-9-]+:\d{12}:snapshot:[a-zA-Z0-9._:-]+$/.test(
          drill.snapshotArn || '',
        ) &&
        typeof drill.restoredDbIdentifier === 'string' &&
        drill.restoredDbIdentifier.length > 0 &&
        drill.restoredEncrypted === true &&
        drill.applicationProbePassed === true &&
        drill.deletedAfterVerification === true &&
        typeof drill.operator === 'string' &&
        drill.operator.length > 0,
    ),
    drillFresh ? 'fresh restore proof supplied' : 'fresh restore proof (<=180 days) missing',
  );

  return {
    schemaVersion: 1,
    profileId: 'cera-pilot-windows-web-code-security-v1',
    capabilityId: 'infrastructure.customer-data',
    checkedAt: now.toISOString(),
    ready: checks.every((check) => check.ok),
    checks,
  };
}

function parameterTypeFromArn(arn) {
  if (!arn || !arn.includes(':parameter/')) return null;
  const name = `/${arn.split(':parameter/')[1]}`;
  try {
    return aws(['ssm', 'describe-parameters', '--parameter-filters', `Key=Name,Values=${name}`])
      .Parameters?.[0]?.Type || null;
  } catch {
    return null;
  }
}

function simulate(roleArn, resourceArn) {
  if (!roleArn || !resourceArn) return 'missing';
  try {
    return aws([
      'iam',
      'simulate-principal-policy',
      '--policy-source-arn', roleArn,
      '--action-names', 'ssm:GetParameters',
      '--resource-arns', resourceArn,
    ]).EvaluationResults?.[0]?.EvalDecision || 'missing';
  } catch {
    return 'missing';
  }
}

function collectLive(restoreDrillPath) {
  const service = aws([
    'ecs', 'describe-services', '--cluster', 'backend', '--services', 'backend-service',
  ]).services?.[0];
  const taskDefinition = aws([
    'ecs', 'describe-task-definition', '--task-definition', service.taskDefinition,
  ]).taskDefinition;
  const signingArn = process.env.M41_AGENT_SIGNING_KEYRING_SECRET_ARN || '';
  const restoreDrill = restoreDrillPath && existsSync(restoreDrillPath)
    ? JSON.parse(readFileSync(restoreDrillPath, 'utf8'))
    : null;
  const backendRole = taskDefinition.executionRoleArn;
  const intelligenceRole = `arn:aws:iam::${ACCOUNT_ID}:role/ceragon-intelligence-ecs-execution-production`;
  return {
    rds: aws(['rds', 'describe-db-instances', '--db-instance-identifier', 'codefense-postgressdb'])
      .DBInstances?.[0],
    bucketVersioning: Object.fromEntries(
      ['installers-prod', 'installer-binaries-prod'].map((bucket) => {
        const status = aws(['s3api', 'get-bucket-versioning', '--bucket', bucket]).Status || 'Unset';
        return [bucket, status];
      }),
    ),
    backendTaskDefinition: taskDefinition,
    resultAggregatorLambdaEnvironment: Object.entries(
      aws([
        'lambda', 'get-function-configuration', '--function-name',
        'ceragon-intel-result-aggregator-production',
      ]).Environment?.Variables || {},
    ).map(([name]) => ({ name })),
    internalEventsParameterType: parameterTypeFromArn(INTERNAL_EVENTS_PARAMETER),
    agentSigningParameterType: parameterTypeFromArn(signingArn),
    iam: {
      backendInternalEvents: simulate(backendRole, INTERNAL_EVENTS_PARAMETER),
      backendSigningKeyring: simulate(backendRole, signingArn),
      intelligenceInternalEvents: simulate(intelligenceRole, INTERNAL_EVENTS_PARAMETER),
    },
    restoreDrill,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const fixtureIndex = args.indexOf('--fixture');
  const drillIndex = args.indexOf('--restore-drill');
  const state = fixtureIndex >= 0
    ? JSON.parse(readFileSync(args[fixtureIndex + 1], 'utf8'))
    : collectLive(drillIndex >= 0 ? args[drillIndex + 1] : null);
  const result = evaluatePosture(state);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ready ? 0 : 1);
}

module.exports = { evaluatePosture, managedSecretCheck };
