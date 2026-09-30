import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { planJob, evaluateIf } from './workflow.mjs';
import { assertTrustedPrivacyFixtureSource, privacyFixtureHostEnvironment } from './privacy-fixture-trust.mjs';

const manifest = JSON.parse(readFileSync(new URL('../gates.json', import.meta.url), 'utf8'));
for (const [workflow, job, combo] of [
  ['pr-checks', 'full_test', { shard: 1 }],
  ['build', 'build_and_test', { 'node-version': '24.x' }],
]) {
  test(`${workflow}:${job} executes real privacy stores in the mandatory semantic full suite`, () => {
    const wf = parse(readFileSync(new URL(`../../Backend/.github/workflows/${workflow}.yml`, import.meta.url), 'utf8'));
    const plan = planJob(wf, job, combo, { github: { sha: 'fixture', ref: 'main', event_name: 'workflow_dispatch' } });
    const fixtureSource = readFileSync(new URL('../../Backend/scripts/privacy-store-fixtures.cjs', import.meta.url));
    const pin = manifest.repos.Backend.mirrored[`${workflow}:${job}`].privacyStoreFixtures.helperSha256;
    assert.doesNotThrow(() => assertTrustedPrivacyFixtureSource(fixtureSource, pin));
    assert.throws(() => assertTrustedPrivacyFixtureSource(`${fixtureSource}\nconsole.log('candidate edit');`, pin), /trusted CI pin/);
    assert.throws(() => assertTrustedPrivacyFixtureSource(fixtureSource.toString('utf8').replace(/\n/g, '\r\n'), pin), /trusted CI pin/);
    const start = plan.steps.findIndex(step => step.run?.trim() === 'node scripts/privacy-store-fixtures.cjs start');
    const stop = plan.steps.findIndex(step => step.run?.trim() === 'node scripts/privacy-store-fixtures.cjs stop');
    const full = plan.steps.findIndex(step => step.run?.startsWith('npm test -- --maxWorkers='));
    const asserted = plan.steps.findIndex(step => step.run?.startsWith('node scripts/assert-suites-executed.js'));
    assert.ok(start >= 0 && full > start && asserted > full && stop > asserted);
    assert.equal(plan.steps[asserted].kind, 'run');
    const env = plan.steps[full].env;
    assert.equal(env.RUN_PRIVACY_STORE_TESTS, 'true');
    assert.equal(env.RUN_INTEGRATION_TESTS, 'true');
    assert.equal(env.RUN_LICENSE_INTEGRATION_TESTS, 'true');
    assert.equal(env.AWS_ACCESS_KEY_ID, 'privacyfixture');
    assert.equal(plan.services.postgres.env.POSTGRES_DB, 'privacy_root');
    assert.deepEqual(plan.services.postgres.ports, ['15432:5432']);
    assert.equal(env.DATABASE_PORT, '15432');
    assert.equal(env.AI_POLICY_PGPORT, '15432');
    assert.equal(env.M47_MIGRATION_PGPORT, '15432');
    for (const name of ['DATABASE_NAME', 'AI_POLICY_PGDB', 'M47_MIGRATION_PGDB']) {
      assert.equal(env[name], 'privacy_root');
    }
    assert.ok(env.VERDICT_SQL_TEST_DATABASE_URL.endsWith(':15432/privacy_root'));
    assert.equal(plan.services.postgres_aicp_m1.env.POSTGRES_DB, 'aicp');
    assert.equal(plan.services.postgres_aicp_m2.env.POSTGRES_DB, 'aicp');
    assert.deepEqual(plan.services.postgres_aicp_m1.ports, ['55432:5432']);
    assert.deepEqual(plan.services.postgres_aicp_m2.ports, ['55433:5432']);
    assert.equal(env.AICP_M1_PGPORT, '55432');
    assert.equal(env.AICP_M2_PGPORT, '55433');
    assert.ok(!plan.steps[full].run.includes('jest.config.privacy'));
    assert.equal(wf.jobs[job].steps.find(step => step.name === 'Stop privacy store fixtures').if, 'always()');
  });
}

test('the normal executed-suite assertion condition is understood by the mirror', () => {
  assert.equal(evaluateIf('${{ !cancelled() }}', {}), true);
  assert.equal(evaluateIf('${{ cancelled() }}', {}), false);
  assert.equal(evaluateIf('${{ unknown_condition() }}', {}), undefined);
});

test('Git preserves the raw helper pin with both Windows and Linux checkout conversion', () => {
  const base = fileURLToPath(new URL('../../Backend/scripts/.runtime/', import.meta.url));
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'fixture-checkout-'));
  const fixture = 'scripts/privacy-store-fixtures.cjs';
  const expected = readFileSync(new URL(`../../Backend/${fixture}`, import.meta.url));
  const pin = manifest.repos.Backend.mirrored['pr-checks:full_test'].privacyStoreFixtures.helperSha256;
  try {
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(join(directory, '.gitattributes'), readFileSync(new URL('../../Backend/.gitattributes', import.meta.url)));
    writeFileSync(join(directory, fixture), expected);
    const git = (...args) => execFileSync('git', args, { cwd: directory, windowsHide: true, stdio: 'pipe' });
    git('init', '--quiet');
    git('-c', 'core.autocrlf=true', 'add', '.gitattributes', fixture);
    for (const autocrlf of ['true', 'false']) {
      rmSync(join(directory, fixture));
      git('-c', `core.autocrlf=${autocrlf}`, 'checkout-index', '--force', '--', fixture);
      const checkedOut = readFileSync(join(directory, fixture));
      assert.deepEqual(checkedOut, expected);
      assertTrustedPrivacyFixtureSource(checkedOut, pin);
    }
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(base) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('host fixture environment strips cloud/provider credentials and Node preload hooks', () => {
  const environment = privacyFixtureHostEnvironment({ PATH: 'tools', SystemRoot: 'windows',
    DOCKER_CONTEXT: 'desktop-linux', AWS_SECRET_ACCESS_KEY: 'do-not-pass', GH_TOKEN: 'do-not-pass',
    GEMINI_API_KEY: 'do-not-pass', NODE_OPTIONS: '--require untrusted.cjs',
  }, 'owned-scope', 'container:devoidci-pod-Backend');
  assert.deepEqual(environment, { PATH: 'tools', SystemRoot: 'windows', DOCKER_CONTEXT: 'desktop-linux',
    PRIVACY_FIXTURE_SCOPE: 'owned-scope', PRIVACY_FIXTURE_NETWORK: 'container:devoidci-pod-Backend' });
});
