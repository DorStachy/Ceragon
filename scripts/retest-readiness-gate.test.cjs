#!/usr/bin/env node
'use strict';

// Lightweight test runner for retest-readiness-gate.cjs without pulling
// in jest at the workspace root. Runs `node scripts/retest-readiness-gate.test.cjs`.

const assert = require('assert');
const path = require('path');

const mod = require('./retest-readiness-gate.cjs');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    process.stdout.write(`FAIL  ${name}\n      ${err.message}\n`);
    process.exitCode = 1;
  }
}

test('ENUMERATED_DLQS contains the 8 queues from O1 §2', () => {
  assert.deepStrictEqual(mod.ENUMERATED_DLQS, [
    'cera-sandbox_jobs_dlq-staging',
    'cera-fetch_jobs_dlq-staging',
    'ceragon-production-analysis-static-background-dlq',
    'ceragon-production-analysis-dynamic-urgent-dlq',
    'ceragon-production-analysis-dynamic-background-dlq',
    'ceragon-production-artifact-fetch-background-dlq',
    'ceragon-production-hotset-events-dlq',
    'ceragon-production-intel-dynamic-jobs-dlq',
  ]);
});

test('INTEL_SANDBOX_ASG uses ASG name (Amendment C), not capacity-provider name', () => {
  assert.strictEqual(mod.INTEL_SANDBOX_ASG, 'cera-sandbox-intel-asg');
  assert.notStrictEqual(mod.INTEL_SANDBOX_ASG, 'cera-sandbox-intel-baremetal');
});

test('parseArgs defaults', () => {
  const a = mod.parseArgs([]);
  assert.strictEqual(a.requireIntelSandbox, false);
  assert.strictEqual(a.region, process.env.AWS_REGION || 'eu-north-1');
  assert.strictEqual(a.account, '113627991972');
});

test('parseArgs --require-intel-sandbox flips the flag', () => {
  const a = mod.parseArgs(['--require-intel-sandbox']);
  assert.strictEqual(a.requireIntelSandbox, true);
});

test('parseArgs --evidence-dir consumes the next argument', () => {
  const a = mod.parseArgs(['--evidence-dir', '/tmp/test-evidence']);
  assert.strictEqual(a.evidenceDir, '/tmp/test-evidence');
});

test('renderAbortMd lists every failing DLQ', () => {
  const state = {
    finishedAt: '2026-05-07T18:00:00Z',
    region: 'eu-north-1',
    account: '113627991972',
    dlqs: [
      { queue: 'cera-sandbox_jobs_dlq-staging', exists: true, visible: 2, notVisible: 0, delayed: 0, samples: [
        { messageId: 'abc', sentTimestampMs: 1715000000000, body: 'x' },
      ]},
      { queue: 'cera-fetch_jobs_dlq-staging', exists: true, visible: 0, notVisible: 0, delayed: 0, samples: [] },
    ],
    intelSandboxAsg: { name: 'cera-sandbox-intel-asg', exists: true, suspended: [] },
    failures: {
      dlqDepthAboveZero: [{ queue: 'cera-sandbox_jobs_dlq-staging', visible: 2 }],
      intelSandboxAsgSuspended: false,
    },
  };
  const md = mod.renderAbortMd(state);
  assert.ok(md.includes('cera-sandbox_jobs_dlq-staging'), 'should mention the failing queue');
  assert.ok(md.includes('PRE_RETEST'), 'should explain triage classification');
  assert.ok(md.includes('IN_RETEST'), 'should explain triage classification');
  assert.ok(md.includes('SentTimestamp'), 'should sample message timestamps');
});

test('renderAbortMd documents intel-sandbox ASG suspension when --require-intel-sandbox set', () => {
  const state = {
    finishedAt: '2026-05-07T18:00:00Z',
    region: 'eu-north-1',
    account: '113627991972',
    dlqs: [],
    intelSandboxAsg: {
      name: 'cera-sandbox-intel-asg',
      exists: true,
      suspended: [
        { processName: 'Launch', reason: 'User suspended at 2026-04-12T21:57:43Z' },
      ],
    },
    failures: {
      dlqDepthAboveZero: [],
      intelSandboxAsgSuspended: true,
    },
  };
  const md = mod.renderAbortMd(state);
  assert.ok(md.includes('cera-sandbox-intel-asg'), 'should name the ASG');
  assert.ok(md.includes('Launch'), 'should list the suspended process');
  assert.ok(md.includes('--require-intel-sandbox'), 'should explain how to bypass');
});

// Codex blocker #8 regression tests: missing-queue / error-queue / ASG-error
// must HARD-FAIL the gate. The original implementation only checked
// visible>0 and silently passed when an AWS call returned an error.
test('decideFromState: missing DLQ fails the gate', () => {
  const state = {
    dlqs: [
      { queue: 'cera-sandbox_jobs_dlq-staging', exists: true, visible: 0, error: null },
      { queue: 'cera-fetch_jobs_dlq-staging', exists: false, visible: 0, error: null },
    ],
    asg: { exists: true, suspended: [], error: null },
  };
  const r = mod.decideFromState(state, { requireIntelSandbox: false });
  assert.strictEqual(r.passed, false, 'missing DLQ must fail the gate');
  assert.strictEqual(r.dlqUnreachable.length, 1);
  assert.strictEqual(r.dlqUnreachable[0].queue, 'cera-fetch_jobs_dlq-staging');
});

test('decideFromState: AWS-error on a DLQ check fails the gate', () => {
  const state = {
    dlqs: [
      { queue: 'q1', exists: true, visible: 0, error: null },
      { queue: 'q2', exists: false, visible: 0, error: 'AccessDenied' },
    ],
    asg: { exists: true, suspended: [], error: null },
  };
  const r = mod.decideFromState(state, { requireIntelSandbox: false });
  assert.strictEqual(r.passed, false, 'AWS error must fail the gate');
  assert.strictEqual(r.dlqUnreachable.length, 1);
});

test('decideFromState: ASG describe error with --require-intel-sandbox fails', () => {
  const state = {
    dlqs: [{ queue: 'q1', exists: true, visible: 0, error: null }],
    asg: { exists: false, suspended: [], error: 'AccessDenied' },
  };
  const r = mod.decideFromState(state, { requireIntelSandbox: true });
  assert.strictEqual(r.passed, false, 'ASG error must fail when intel-sandbox is required');
  assert.ok(r.intelSandboxAsgError, 'asg error must be reported');
});

test('decideFromState: clean DLQs + clean ASG passes', () => {
  const state = {
    dlqs: [{ queue: 'q1', exists: true, visible: 0, error: null }],
    asg: { exists: true, suspended: [], error: null },
  };
  const r = mod.decideFromState(state, { requireIntelSandbox: false });
  assert.strictEqual(r.passed, true);
});

test('decideFromState: visible>0 still fails (existing contract preserved)', () => {
  const state = {
    dlqs: [{ queue: 'q1', exists: true, visible: 2, error: null }],
    asg: { exists: true, suspended: [], error: null },
  };
  const r = mod.decideFromState(state, { requireIntelSandbox: false });
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.dlqDepthAboveZero.length, 1);
});

if (process.exitCode) {
  process.stderr.write('\nFAILED\n');
} else {
  process.stdout.write('\nOK\n');
}
