#!/usr/bin/env node
/**
 * Retest readiness gate (O1/M9/M10).
 *
 * Implements the hard pre-retest gate from
 * docs/CERAGON_POST_SCHEMA_RETEST_ISSUE_FIX_PLAN_2026-05-07.md §O1:
 *
 *   1. Enumerate every DLQ that can affect scanner verdicts.
 *   2. If ANY enumerated DLQ has visible count > 0, abort the retest.
 *   3. Check the cera-sandbox-intel-asg ASG suspended-process state.
 *      If any process is suspended AND --require-intel-sandbox is set,
 *      abort. Otherwise the report records the carve-out explicitly.
 *   4. Emit `RETEST_ABORTED_INFRA_NOT_CLEAN.md` on abort, capturing the
 *      offending state. Emit `retest-readiness-state.json` always.
 *
 * Usage:
 *   node scripts/retest-readiness-gate.cjs [--require-intel-sandbox]
 *                                          [--evidence-dir <path>]
 *                                          [--region eu-north-1]
 *                                          [--account 113627991972]
 *
 * Exit codes:
 *   0 — gate passed, retest may proceed
 *   2 — gate failed, retest aborted (RETEST_ABORTED_INFRA_NOT_CLEAN.md emitted)
 *   3 — runtime error (AWS unreachable, missing credentials, etc.)
 *
 * AWS read-only: only DescribeAutoScalingGroups, GetQueueUrl,
 * GetQueueAttributes, ReceiveMessage with VisibilityTimeout=0 (the
 * receive is non-destructive when paired with VisibilityTimeout=0;
 * messages return to visible-state immediately and are NOT deleted).
 *
 * Verified live during third advisory review (2026-05-07): all 8
 * enumerated DLQs exist; cera-sandbox-intel-asg has 8 processes
 * User-Suspended since 2026-04-12T21:57:43Z.
 */
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execFileAsync = util.promisify(execFile);

// ── Constants ────────────────────────────────────────────────────────────
// The 8 DLQs that can affect scanner verdicts. From the retest plan §O1 #2.
// Adding a new DLQ to this list is a deliberate decision: every entry must
// drain to 0 before retest. Any future queue whose name contains `dlq` and
// whose source queue contributes to dependency verdicts SHOULD be added.
const ENUMERATED_DLQS = [
  'cera-sandbox_jobs_dlq-staging',
  'cera-fetch_jobs_dlq-staging',
  'ceragon-production-analysis-static-background-dlq',
  'ceragon-production-analysis-dynamic-urgent-dlq',
  'ceragon-production-analysis-dynamic-background-dlq',
  'ceragon-production-artifact-fetch-background-dlq',
  'ceragon-production-hotset-events-dlq',
  'ceragon-production-intel-dynamic-jobs-dlq',
];

// The ASG that backs the intel-sandbox capacity provider. See
// AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md §5.2 — the capacity provider name
// is `cera-sandbox-intel-baremetal` but the ASG itself (third-review fix
// Amendment C) is `cera-sandbox-intel-asg`.
const INTEL_SANDBOX_ASG = 'cera-sandbox-intel-asg';

// ── Arg parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    requireIntelSandbox: false,
    evidenceDir: path.join(process.cwd(), 'docs', 'test-evidence', 'retest-' + retestSlug()),
    region: process.env.AWS_REGION || 'eu-north-1',
    account: '113627991972',
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--require-intel-sandbox') args.requireIntelSandbox = true;
    else if (a === '--evidence-dir') args.evidenceDir = argv[++i];
    else if (a === '--region') args.region = argv[++i];
    else if (a === '--account') args.account = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      printUsage();
      process.exit(3);
    }
  }
  return args;
}

function printUsage() {
  console.error([
    'Usage: node scripts/retest-readiness-gate.cjs [options]',
    '',
    '  --require-intel-sandbox   Abort if cera-sandbox-intel-asg has any',
    '                            suspended processes (default: warn only).',
    '  --evidence-dir <path>     Where to write retest-readiness-state.json',
    '                            and RETEST_ABORTED_INFRA_NOT_CLEAN.md.',
    '  --region <region>         AWS region (default eu-north-1).',
    '  --account <account>       AWS account ID (default 113627991972).',
    '  --dry-run                 Skip ReceiveMessage triage; only check counts.',
    '',
    'Exit codes: 0 = gate passed, 2 = gate failed, 3 = runtime error.',
  ].join('\n'));
}

function retestSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ── AWS helpers (read-only) ──────────────────────────────────────────────
async function aws(args) {
  // We invoke `aws` via execFile so an attacker who controlled an env var
  // can't inject a shell metacharacter. All args are arrays.
  try {
    const { stdout } = await execFileAsync('aws', args, { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    throw new Error(`aws ${args.join(' ')} failed: ${msg.split('\n')[0]}`);
  }
}

async function getQueueUrl(name, region, account) {
  return aws([
    'sqs', 'get-queue-url',
    '--queue-name', name,
    '--queue-owner-aws-account-id', account,
    '--region', region,
    '--output', 'json',
  ]).then((r) => r.QueueUrl);
}

async function getQueueAttributes(url, region) {
  return aws([
    'sqs', 'get-queue-attributes',
    '--queue-url', url,
    '--attribute-names', 'ApproximateNumberOfMessages',
    'ApproximateNumberOfMessagesNotVisible',
    'ApproximateNumberOfMessagesDelayed',
    '--region', region,
    '--output', 'json',
  ]).then((r) => r.Attributes || {});
}

async function describeAsgSuspendedProcesses(name, region) {
  const r = await aws([
    'autoscaling', 'describe-auto-scaling-groups',
    '--auto-scaling-group-names', name,
    '--region', region,
    '--output', 'json',
  ]);
  if (!r.AutoScalingGroups || r.AutoScalingGroups.length === 0) {
    return { exists: false, suspended: [] };
  }
  return {
    exists: true,
    suspended: (r.AutoScalingGroups[0].SuspendedProcesses || []).map((p) => ({
      processName: p.ProcessName,
      reason: p.SuspensionReason,
    })),
  };
}

// ── Time-window classification (Amendment F) ─────────────────────────────
//
// Triage signature requires every existing DLQ message to be classified
// as PRE_RETEST or IN_RETEST. Only PRE_RETEST may be 'ignored'.
//
// We sample (non-destructively, VisibilityTimeout=0) the oldest visible
// messages on a non-empty DLQ and record SentTimestamp; the harness
// caller decides ignore/root-cause based on whether the timestamp is
// before or after retestStart.
async function sampleDlqMessages(url, region, max = 10) {
  const r = await aws([
    'sqs', 'receive-message',
    '--queue-url', url,
    '--max-number-of-messages', String(Math.min(max, 10)),
    '--visibility-timeout', '0',
    '--message-attribute-names', 'All',
    '--attribute-names', 'SentTimestamp',
    '--region', region,
    '--output', 'json',
  ]);
  return (r.Messages || []).map((m) => ({
    messageId: m.MessageId,
    sentTimestampMs: Number(m.Attributes && m.Attributes.SentTimestamp) || null,
    body: typeof m.Body === 'string' ? m.Body.slice(0, 500) : null,
  }));
}

// ── Gate logic ───────────────────────────────────────────────────────────
async function runGate(args) {
  const startedAt = new Date().toISOString();
  fs.mkdirSync(args.evidenceDir, { recursive: true });

  const dlqResults = [];
  for (const name of ENUMERATED_DLQS) {
    const entry = { queue: name, exists: false, visible: 0, notVisible: 0, delayed: 0, samples: [], error: null };
    try {
      const url = await getQueueUrl(name, args.region, args.account);
      entry.exists = true;
      entry.queueUrl = url;
      const attrs = await getQueueAttributes(url, args.region);
      entry.visible = Number(attrs.ApproximateNumberOfMessages || 0);
      entry.notVisible = Number(attrs.ApproximateNumberOfMessagesNotVisible || 0);
      entry.delayed = Number(attrs.ApproximateNumberOfMessagesDelayed || 0);
      // Only sample messages when there are visible ones AND we're not in dry-run.
      if (entry.visible > 0 && !args.dryRun) {
        try {
          entry.samples = await sampleDlqMessages(url, args.region, 10);
        } catch (sampleErr) {
          entry.sampleError = String(sampleErr.message || sampleErr);
        }
      }
    } catch (err) {
      entry.error = String(err.message || err);
    }
    dlqResults.push(entry);
  }

  let asgInfo = { name: INTEL_SANDBOX_ASG, exists: false, suspended: [], error: null };
  try {
    const a = await describeAsgSuspendedProcesses(INTEL_SANDBOX_ASG, args.region);
    asgInfo.exists = a.exists;
    asgInfo.suspended = a.suspended;
  } catch (err) {
    asgInfo.error = String(err.message || err);
  }

  // Decide pass/fail.
  // Codex blocker #8: missing-queue and AWS-error are HARD failures, not
  // pass-through "we couldn't check". A queue we can't reach is a queue
  // we can't certify is empty; treating it as silently-ok was the exact
  // false-negative class that produced the original retest report.
  const dlqQueueErrors = dlqResults.filter((d) => !d.exists || d.error);
  const dlqFailures = dlqResults.filter((d) => d.visible > 0);
  const asgError = asgInfo.error || (!asgInfo.exists && args.requireIntelSandbox);
  const asgSuspended = asgInfo.suspended.length > 0;
  const intelSandboxBlocked = args.requireIntelSandbox && asgSuspended;

  const passed =
    dlqFailures.length === 0 &&
    dlqQueueErrors.length === 0 &&
    !intelSandboxBlocked &&
    !asgError;

  const state = {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    region: args.region,
    account: args.account,
    requireIntelSandbox: args.requireIntelSandbox,
    dlqs: dlqResults,
    intelSandboxAsg: asgInfo,
    decision: passed ? 'PASS' : 'FAIL',
    failures: {
      dlqDepthAboveZero: dlqFailures.map((d) => ({ queue: d.queue, visible: d.visible })),
      dlqUnreachable: dlqQueueErrors.map((d) => ({
        queue: d.queue,
        exists: d.exists,
        error: d.error,
      })),
      intelSandboxAsgSuspended: intelSandboxBlocked,
      intelSandboxAsgError: asgError ? (asgInfo.error || 'ASG missing') : null,
    },
  };

  const stateFile = path.join(args.evidenceDir, 'retest-readiness-state.json');
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  process.stdout.write(`Wrote ${stateFile}\n`);

  if (!passed) {
    const md = renderAbortMd(state);
    const abortFile = path.join(args.evidenceDir, 'RETEST_ABORTED_INFRA_NOT_CLEAN.md');
    fs.writeFileSync(abortFile, md);
    process.stdout.write(`Wrote ${abortFile}\n`);
    process.stderr.write(`\nRetest aborted: ${dlqFailures.length} DLQ(s) with visible > 0` +
      (intelSandboxBlocked ? `; intel-sandbox ASG has suspended processes` : '') + `.\n`);
    return 2;
  }

  // Pass branch — also record the carve-out if intel-sandbox is suspended
  // but not required.
  if (asgSuspended && !args.requireIntelSandbox) {
    process.stdout.write(`\nNote: intel-sandbox ASG has ${asgInfo.suspended.length} suspended ` +
      `process(es); --require-intel-sandbox not set, treating as carve-out.\n`);
  }
  process.stdout.write(`\nGate passed.\n`);
  return 0;
}

function renderAbortMd(state) {
  const lines = [];
  lines.push(`# Retest aborted — infra not clean`);
  lines.push('');
  lines.push(`Generated: ${state.finishedAt}`);
  lines.push(`Region: ${state.region}, Account: ${state.account}`);
  lines.push('');
  lines.push(`See \`docs/CERAGON_POST_SCHEMA_RETEST_ISSUE_FIX_PLAN_2026-05-07.md\` §O1.`);
  lines.push('');
  lines.push(`## DLQ depth check`);
  lines.push('');
  lines.push('| Queue | Exists | Visible | NotVisible | Delayed |');
  lines.push('|---|---|---|---|---|');
  for (const d of state.dlqs) {
    lines.push(`| \`${d.queue}\` | ${d.exists ? 'yes' : 'NO'} | ${d.visible} | ${d.notVisible} | ${d.delayed} |`);
  }
  lines.push('');
  if (state.failures.dlqUnreachable && state.failures.dlqUnreachable.length > 0) {
    lines.push(`## ❌ DLQ unreachable (cannot certify clean)`);
    lines.push('');
    for (const f of state.failures.dlqUnreachable) {
      lines.push(`- \`${f.queue}\` — exists=${f.exists}, error=${f.error || '(missing)'}`);
    }
    lines.push('');
    lines.push(
      'A DLQ we cannot reach is a DLQ we cannot certify is empty. Fix AWS ' +
        'access (IAM, region, VPC endpoint) and re-run the gate.',
    );
    lines.push('');
  }
  if (state.failures.intelSandboxAsgError) {
    lines.push(`## ❌ Intel-sandbox ASG check failed`);
    lines.push('');
    lines.push(`- error: ${state.failures.intelSandboxAsgError}`);
    lines.push('');
  }
  if (state.failures.dlqDepthAboveZero.length > 0) {
    lines.push(`## ❌ DLQ failures (visible > 0)`);
    lines.push('');
    for (const f of state.failures.dlqDepthAboveZero) {
      lines.push(`- \`${f.queue}\` has ${f.visible} visible message(s).`);
    }
    lines.push('');
    lines.push(`### Triage classification (Amendment F)`);
    lines.push('');
    lines.push('Each visible message MUST be classified as:');
    lines.push('- **PRE_RETEST** — `SentTimestamp < retestStart`. May be `ignore`d when documented.');
    lines.push('- **IN_RETEST** — `SentTimestamp >= retestStart`. MUST be root-caused.');
    lines.push('');
    lines.push(`Sampled message timestamps (first 10 per queue):`);
    lines.push('');
    for (const d of state.dlqs.filter((x) => x.samples && x.samples.length > 0)) {
      lines.push(`#### \`${d.queue}\``);
      lines.push('');
      lines.push('| MessageId | SentTimestamp (ms) | SentTimestamp (UTC) |');
      lines.push('|---|---|---|');
      for (const m of d.samples) {
        const iso = m.sentTimestampMs ? new Date(m.sentTimestampMs).toISOString() : '?';
        lines.push(`| \`${m.messageId}\` | ${m.sentTimestampMs || '?'} | ${iso} |`);
      }
      lines.push('');
    }
  }
  if (state.failures.intelSandboxAsgSuspended) {
    lines.push(`## ❌ Intel-sandbox ASG suspended`);
    lines.push('');
    lines.push(`\`${state.intelSandboxAsg.name}\` has ${state.intelSandboxAsg.suspended.length} suspended process(es):`);
    lines.push('');
    for (const p of state.intelSandboxAsg.suspended) {
      lines.push(`- \`${p.processName}\` — ${p.reason}`);
    }
    lines.push('');
    lines.push(`The retest was launched with \`--require-intel-sandbox\` so this is a hard block. Resume the suspended processes (\`aws autoscaling resume-processes\`) before re-running, OR drop \`--require-intel-sandbox\` and document the carve-out.`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── Entry point ─────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const code = await runGate(args);
    process.exit(code);
  } catch (err) {
    process.stderr.write(`runtime error: ${err.message || err}\n`);
    process.exit(3);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ENUMERATED_DLQS,
  INTEL_SANDBOX_ASG,
  parseArgs,
  renderAbortMd,
  // Exported for unit tests: pure function on a state shape, no AWS calls.
  decideFromState,
};

/**
 * Pure decision function broken out for unit testing. Mirrors the
 * decision branch inside runGate so tests can simulate AWS failure modes
 * without invoking the AWS CLI.
 */
function decideFromState(state, args) {
  const dlqQueueErrors = state.dlqs.filter((d) => !d.exists || d.error);
  const dlqFailures = state.dlqs.filter((d) => d.visible > 0);
  const asgError = state.asg.error || (!state.asg.exists && args.requireIntelSandbox);
  const asgSuspended = state.asg.suspended.length > 0;
  const intelSandboxBlocked = args.requireIntelSandbox && asgSuspended;
  const passed =
    dlqFailures.length === 0 &&
    dlqQueueErrors.length === 0 &&
    !intelSandboxBlocked &&
    !asgError;
  return {
    passed,
    dlqDepthAboveZero: dlqFailures,
    dlqUnreachable: dlqQueueErrors,
    intelSandboxAsgSuspended: intelSandboxBlocked,
    intelSandboxAsgError: asgError ? (state.asg.error || 'ASG missing') : null,
  };
}
