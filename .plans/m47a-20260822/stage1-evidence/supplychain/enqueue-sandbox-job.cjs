/* P47 stage-1 supply-chain lane — enqueue one SandboxJob (the backend's own wire
 * contract, src/schemas/sandbox-job.schema.ts) onto the p47 elasticmq sandbox queue.
 * Usage: node enqueue-sandbox-job.cjs <label>
 */
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');
const label = process.argv[2] || 'probe';
const staticScore = Number(process.argv[3] ?? 75);
const QUEUE = 'http://localhost:9526/000000000000/cera-sandbox_jobs-local';
const c = new SQSClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:9526',
  credentials: { accessKeyId: 'localminio', secretAccessKey: 'localminio123456' },
});
const jobId = crypto.randomUUID();
const body = {
  schemaVersion: '1.0.0',
  jobType: 'SANDBOX',
  intent: 'INSTALL',
  ecosystem: 'npm',
  tool: 'npm',
  tenantId: 'cdcde8a7-7aea-4128-be1a-6ff3dec52348',
  agentId: '9cc7bb95-78ec-4bcd-9c08-15de21a1c625',
  siteId: '95937361-828f-4737-9c74-64defab9f5c6',
  correlationId: `p47-sc-${label}-${Date.now()}`,
  id: jobId,
  target: {
    name: 'p47-uncontainable-probe',
    version: '1.0.0',
    sha256: 'bfafc2445d0cac3ae646bfdebde5272a49cdc3f8cd0a32e79d5288154452b18d',
    filename: 'p47-uncontainable-probe-1.0.0.tgz',
  },
  evidence: {
    artifactS3Key: 'artifacts/npm/p47-uncontainable-probe/1.0.0/p47-uncontainable-probe-1.0.0.tgz',
  },
  createdAt: new Date().toISOString(),
  attempts: 0,
  priority: 0,
  fetchContext: {
    staticRiskScore: staticScore,
    staticFindings: staticScore >= 50 ? [ { code: 'INSTALL_SCRIPT', description: 'postinstall lifecycle script present', severity: 'HIGH' } ] : [],
    escalationReasons: ['SUSPICIOUS_HIGH_SCORE'],
  },
  context: { os: 'linux', arch: 'x64', isInteractive: false },
};
c.send(new SendMessageCommand({ QueueUrl: QUEUE, MessageBody: JSON.stringify(body) }))
  .then((r) => console.log(JSON.stringify({ sent: true, jobId, correlationId: body.correlationId, messageId: r.MessageId })))
  .catch((e) => { console.error('SEND FAILED', e); process.exit(1); });
