#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * P1-3 (2026-05-14 stabilization): post-deploy ECS image SHA verifier.
 *
 * Given a list of {cluster, service, expectedSha} triples, for each:
 *   1. DescribeServices → resolve the current task definition ARN
 *   2. DescribeTaskDefinition → assert every containerDefinitions[*].image
 *      contains expectedSha
 *   3. ListTasks + DescribeTasks → assert every RUNNING task's container
 *      imageDigest matches the digest of the expected image tag in ECR
 *
 * Exits 0 on PASS, 1 on FAIL.
 *
 * Usage (from a retest harness):
 *
 *   node scripts/verify-ecs-image-shas.cjs '[
 *     {"cluster":"cera-prod","service":"backend","expectedSha":"abc123"},
 *     {"cluster":"cera-prod","service":"static-worker","expectedSha":"abc123"}
 *   ]'
 *
 * Requires:
 *   AWS_REGION  (env)
 *   aws sdk v3 clients in node_modules: @aws-sdk/client-ecs, @aws-sdk/client-ecr
 *   The caller has IAM perms for ECS Describe* + ECR BatchGetImage on the
 *   referenced repos.
 *
 * Intentionally minimal: no retries, no caching, fail-fast. The release
 * gate (P1-7) wraps this script.
 */

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error(
    'usage: node verify-ecs-image-shas.cjs \'[{"cluster":"...","service":"...","expectedSha":"..."}, ...]\'',
  );
  process.exit(1);
}

let targets;
try {
  targets = JSON.parse(args[0]);
} catch (err) {
  console.error(`FAIL: argv[1] is not valid JSON: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(targets) || targets.length === 0) {
  console.error('FAIL: targets must be a non-empty JSON array');
  process.exit(1);
}

const REGION = process.env.AWS_REGION || 'eu-north-1';

let ECSClient;
let DescribeServicesCommand;
let DescribeTaskDefinitionCommand;
let ListTasksCommand;
let DescribeTasksCommand;
let ECRClient;
let BatchGetImageCommand;
try {
  ({
    ECSClient,
    DescribeServicesCommand,
    DescribeTaskDefinitionCommand,
    ListTasksCommand,
    DescribeTasksCommand,
  } = require('@aws-sdk/client-ecs'));
  ({ ECRClient, BatchGetImageCommand } = require('@aws-sdk/client-ecr'));
} catch (err) {
  console.error(
    `FAIL: AWS SDK v3 modules not installed (npm i @aws-sdk/client-ecs @aws-sdk/client-ecr). ${err.message}`,
  );
  process.exit(1);
}

const ecs = new ECSClient({ region: REGION });
const ecr = new ECRClient({ region: REGION });

async function verifyTarget(target) {
  const { cluster, service, expectedSha } = target;
  if (!cluster || !service || !expectedSha) {
    return `target missing required key(s): ${JSON.stringify(target)}`;
  }

  const desc = await ecs.send(
    new DescribeServicesCommand({ cluster, services: [service] }),
  );
  const svc = desc.services?.[0];
  if (!svc) return `service not found: cluster=${cluster}, service=${service}`;
  const taskDefArn = svc.taskDefinition;
  if (!taskDefArn) return `service ${service} has no taskDefinition`;

  const td = await ecs.send(
    new DescribeTaskDefinitionCommand({ taskDefinition: taskDefArn }),
  );
  const containers = td.taskDefinition?.containerDefinitions ?? [];
  if (containers.length === 0) return `task def ${taskDefArn} has zero containers`;

  for (const c of containers) {
    if (typeof c.image !== 'string' || !c.image.includes(expectedSha)) {
      return (
        `container '${c.name}' image '${c.image}' does not contain expected SHA ` +
        `'${expectedSha}' (task def ${taskDefArn})`
      );
    }
  }

  // Resolve the ECR digest for the expectedSha tag (first container's
  // repo). We trust that all containers point at the same repo; if not,
  // the per-container scan above already pinned image strings.
  const firstImage = containers[0].image;
  const ecrInfo = parseEcrImage(firstImage);
  if (ecrInfo) {
    const batch = await ecr.send(
      new BatchGetImageCommand({
        repositoryName: ecrInfo.repository,
        imageIds: [{ imageTag: ecrInfo.tag }],
      }),
    );
    const ecrDigest = batch.images?.[0]?.imageId?.imageDigest;
    if (!ecrDigest) {
      return `ECR tag ${ecrInfo.tag} not found in repo ${ecrInfo.repository}`;
    }

    // P1-3 (Codex HIGH follow-up): paginate ListTasks. Without
    // pagination, a service with many running tasks would silently
    // skip later pages and leave stale images undetected.
    let nextToken;
    const allTaskArns = [];
    do {
      const taskList = await ecs.send(
        new ListTasksCommand({
          cluster,
          serviceName: service,
          desiredStatus: 'RUNNING',
          nextToken,
        }),
      );
      for (const arn of taskList.taskArns ?? []) {
        allTaskArns.push(arn);
      }
      nextToken = taskList.nextToken;
    } while (nextToken);

    // P1-3 (Codex HIGH follow-up): fail closed when ZERO RUNNING tasks.
    // A scaled-to-zero service would otherwise satisfy the gate after
    // only the task-def image check, without ever proving a live task
    // runs the expected image. Operators who want zero-task tolerance
    // must opt in with the literal boolean true; truthy strings like
    // "false" or "0" are rejected as misconfiguration.
    if ('allowZeroRunning' in target && target.allowZeroRunning !== true) {
      return (
        `target.allowZeroRunning must be boolean true if set (got ${JSON.stringify(target.allowZeroRunning)}). ` +
        'Strings like "false" / "0" are rejected as misconfiguration.'
      );
    }
    if (allTaskArns.length === 0 && target.allowZeroRunning !== true) {
      return (
        `service ${service} has zero RUNNING tasks. Set allowZeroRunning=true ` +
        '(boolean) on the target if this is intentional (off-hours / scaled-down).'
      );
    }

    // DescribeTasks accepts up to 100 ARNs per call; batch.
    // P1-3 (Codex HIGH follow-up): fail closed on failures[] entries
    // OR on missing ARNs in the response. Otherwise an API race could
    // silently skip a stale task.
    for (let i = 0; i < allTaskArns.length; i += 100) {
      const batchArns = allTaskArns.slice(i, i + 100);
      const tasks = await ecs.send(
        new DescribeTasksCommand({ cluster, tasks: batchArns }),
      );
      if (Array.isArray(tasks.failures) && tasks.failures.length > 0) {
        const summary = tasks.failures
          .map((f) => `${f.arn ?? '<no-arn>'}: ${f.reason ?? '<no-reason>'}`)
          .join('; ');
        return `DescribeTasks returned failures: ${summary}`;
      }
      const returnedArns = new Set((tasks.tasks ?? []).map((t) => t.taskArn));
      for (const expected of batchArns) {
        if (!returnedArns.has(expected)) {
          return `DescribeTasks did not return task ${expected} that was listed as RUNNING`;
        }
      }
      for (const task of tasks.tasks ?? []) {
        for (const tc of task.containers ?? []) {
          if (!tc.imageDigest) {
            return (
              `running task ${task.taskArn} container ${tc.name} has no imageDigest yet ` +
              `(task likely still starting). Re-run after deployment stabilizes.`
            );
          }
          if (tc.imageDigest !== ecrDigest) {
            return (
              `running task ${task.taskArn} container ${tc.name} has imageDigest ` +
              `'${tc.imageDigest}' but ECR tag ${ecrInfo.tag} resolves to '${ecrDigest}'`
            );
          }
        }
      }
    }
  }

  return null; // PASS
}

function parseEcrImage(image) {
  // Shape: <acct>.dkr.ecr.<region>.amazonaws.com/<repo>:<tag>
  const m = image.match(/^[^/]+\/(.+):(.+)$/);
  if (!m) return null;
  return { repository: m[1], tag: m[2] };
}

(async () => {
  const failures = [];
  for (const target of targets) {
    try {
      const err = await verifyTarget(target);
      if (err) failures.push(`[${target.service}] ${err}`);
    } catch (err) {
      failures.push(`[${target.service}] ${err.message}`);
    }
  }
  if (failures.length === 0) {
    console.log(`verify-ecs-image-shas: PASS (${targets.length} targets)`);
    process.exit(0);
  }
  console.error('verify-ecs-image-shas: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
})().catch((err) => {
  console.error(`FAIL: unhandled error: ${err.message}`);
  process.exit(1);
});
