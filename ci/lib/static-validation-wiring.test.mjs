import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { planJob } from './workflow.mjs';

const workflow = parse(readFileSync(new URL('../../Static-Worker/.github/workflows/build-and-deploy.yml', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../gates.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../../Static-Worker/package.json', import.meta.url), 'utf8'));
const checksGuard = "${{ github.event_name == 'workflow_dispatch' && inputs.checks_only == true }}";
const deployGuard = "${{ github.event_name != 'workflow_dispatch' || inputs.checks_only != true }}";
const concurrency = "${{ github.event_name == 'workflow_dispatch' && inputs.checks_only == true && format('static-worker-checks-{0}', github.ref) || 'static-worker-deploy' }}";

// The input is explicitly boolean. Only these reviewed boolean guards are
// accepted; this is not a general GitHub expression interpreter.
function selected(guard, event, value) {
  assert.ok(guard === checksGuard || guard === deployGuard, 'Unexpected job selection expression');
  const checksOnly = event === 'workflow_dispatch' && value === true;
  return guard === checksGuard ? checksOnly : !checksOnly;
}

test('manual true isolates validation; false and omitted inputs preserve deployment selection', () => {
  assert.deepEqual(workflow.on.push, { branches: ['main'] });
  assert.equal(workflow.on.pull_request, undefined);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.checks_only, {
    description: 'Run validation only; do not publish, deploy, or dispatch Intel updates',
    type: 'boolean', default: false,
  });
  assert.equal(workflow.jobs.checks_only.if, checksGuard);
  assert.equal(workflow.jobs.build_and_deploy.if, deployGuard);
  for (const event of ['workflow_dispatch', 'push', 'repository_dispatch']) {
    for (const value of [true, false, undefined]) {
      const checksOnly = event === 'workflow_dispatch' && value === true;
      assert.equal(selected(workflow.jobs.checks_only.if, event, value), checksOnly);
      assert.equal(selected(workflow.jobs.build_and_deploy.if, event, value), !checksOnly);
    }
  }
  assert.equal(workflow.jobs.dispatch_intel_bump.needs, 'build_and_deploy');
  assert.doesNotMatch(workflow.jobs.dispatch_intel_bump.if, /always\(|!cancelled\(/);
  assert.ok(workflow.jobs.dispatch_intel_bump.if.startsWith("(github.event_name != 'workflow_dispatch' || inputs.checks_only != true) &&"));
});

test('checks-only cancellation cannot cancel an in-progress deployment', () => {
  assert.equal(workflow.concurrency.group, concurrency);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  const ref = 'refs/heads/codex/customer-data-privacy';
  for (const event of ['workflow_dispatch', 'push', 'repository_dispatch']) {
    for (const value of [true, false, undefined]) {
      const group = selected(checksGuard, event, value) ? `static-worker-checks-${ref}` : 'static-worker-deploy';
      assert.equal(group === 'static-worker-deploy', !(event === 'workflow_dispatch' && value === true));
    }
  }
});

test('manual validation has no elevated token permission, cloud action, secret, or deployment step', () => {
  const job = workflow.jobs.checks_only;
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.environment, undefined);
  assert.equal(job.needs, undefined);
  assert.doesNotMatch(JSON.stringify(job.steps), /secrets\.|id-token|aws-actions\/|repository_dispatch|workflow_dispatch/);
  const credentialStep = workflow.jobs.build_and_deploy.steps.findIndex(step => step.uses?.startsWith('aws-actions/configure-aws-credentials@'));
  assert.ok(credentialStep > 0);
  const commands = steps => steps.map(({ uses, with: options, run, env, 'working-directory': cwd }) => ({ uses, options, run, env, cwd }));
  assert.deepEqual(commands(job.steps), commands(workflow.jobs.build_and_deploy.steps.slice(0, credentialStep)));
  assert.equal(packageJson.packageManager, 'pnpm@10.28.0');
  assert.equal(job.steps.at(-1).run.trim(), 'pnpm run prepare:production\ngit diff --exit-code pnpm-lock.yaml');
  assert.ok(job.steps.some(step => step.run === 'pnpm exec jest --runInBand'));
  assert.ok(job.steps.some(step => step.run === 'pnpm audit --prod --audit-level=critical'));
});

test('the local mirror registers every Static validation step and Sandbox production preparation', () => {
  const config = manifest.repos['Static-Worker'].mirrored['build-and-deploy:checks_only'];
  assert.deepEqual(config.inputs, { checks_only: true });
  // The local mirror selects a named job directly; it does not evaluate job-if.
  // This assertion proves command coverage, not GitHub job eligibility.
  const plan = planJob(workflow, 'checks_only', {}, { inputs: config.inputs, github: { event_name: 'workflow_dispatch' } });
  assert.equal(plan.steps.filter(step => step.kind === 'run').length, workflow.jobs.checks_only.steps.filter(step => step.run).length);
  assert.equal(plan.steps.some(step => step.kind === 'cloud-fence' || step.kind === 'skipped'), false);

  const sandbox = parse(readFileSync(new URL('../../Sandbox-Worker/.github/workflows/pr-checks.yml', import.meta.url), 'utf8'));
  assert.ok(manifest.repos['Sandbox-Worker'].mirrored['pr-checks:checks']);
  assert.equal(sandbox.jobs.checks.steps.at(-1).run.trim(), 'node scripts/prepare-production.mjs');
});
