# P47 stage 1 — supply-chain install-gate lane

Run: 2026-09-05 21:05-21:25 UTC against the P47 rig (backend :2353, elasticmq :9526,
minio :9200, dynamodb :8202, postgres :5643).

Question asked of this lane: does a package install through the shim customers use reach a
verdict for a clean package (ALLOW) and a known-bad one (BLOCK) via the local workers, and
does the Sandbox refuse what it cannot contain (Wave 7C T2)?

Code under test:

- Static-Worker branch p47/w7b-static @ fb8b990fcc941764bd5b30fb2c665d0b26832d25 (worktree /c/cwt/p47-w7b-static)
- Sandbox-Worker branch p47/w7c-containment @ 0c34e95afb23283ab5d073a21a3cd63e768ea614 (worktree /c/cwt/p47-w7c-sbx)
- Backend branch p47/integration-backend (worktree /c/cwt/p47-w4b-be), already running on :2353
- Shim: $ISO/devoid.exe 7.10.99, subcommand install-package. Its credentials.json carries
  apiBaseUrl=http://127.0.0.1:2353 and daemonPort 19390. The real ~/.devoid and
  %ProgramData%\devoid were never read or written. There is no npm/pip shim on this machine's
  PATH (C:\ProgramData\devoid\bin is on PATH but does not exist), so install-package IS the
  gate here and nothing was bypassed.

## Results

| probe | expected | observed | verdict | evidence file |
|---|---|---|---|---|
| P1 static worker builds from the p47 branch and consumes the P47 fetch queues | image builds, worker polls cera-fetch_jobs-local + _exec_now | built clean; dual-queue consumer started. NO NPM_TOKEN needed - it fetches from the public registry unauthenticated | VERIFIED | static-worker-build.log, log-static-worker-final.log, static-worker-HEAD.txt |
| P2 ALLOW through the shim: install-package --ecosystem npm --package left-pad | ALLOW and the package actually installs | `[devoid] ALLOW left-pad`, exit code 0, `npm added 1 package`, node_modules/left-pad/package.json version 1.3.0 present | VERIFIED | run-01-leftpad-allow.out, run-01-leftpad-installed.txt |
| P3 the ALLOW came from the local worker, not a stub | worker fetches from npm, scans, submits | worker fetched left-pad@1.3.0, OSV+GHSA+npm scan 0 issues, heuristic 0 findings, risk 0, verdict ALLOW, result POSTed to /api/v1/worker/results; fetch job COMPLETE in 8.21 s | VERIFIED | log-static-worker-01-leftpad.log, db-05-fetchjob-timings.txt |
| P4 BLOCK through the shim: lodash --version 4.17.4 | BLOCK, no install | `[devoid] BLOCK lodash (preliminary) (Critical vulnerability: GHSA-jf85-cpcp-j695 ...)`, exit code 1, node_modules never created; rules shown CRITICAL_CVE (BLOCK), MAX_RISK (WARN), HIGH_CVE (WARN). Wall clock 22719 ms | VERIFIED | run-02-lodash-block.out |
| P5 backend rows | analysis + fetch job + artifact cache rows written | analysis: left-pad ALLOW/0 "Risk score 0 is in your policy's ALLOW band (0-39) for INSTALL"; lodash BLOCK/70 with 5 triggeredPolicyRules. fetch_jobs: both COMPLETE (8.21 s / 22.02 s). global_artifact_cache: 2 rows, decisionSource=FRESH_ANALYSIS, lodash blockReason=vulnerability | VERIFIED | db-01-after-leftpad.txt, db-02-after-lodash.txt, db-03-all-analysis.txt |
| P6 DynamoDB artifact cache | items written for both packages | 4 rows: npm#sha256-hwwP4Q... + NV#npm#left-pad, npm#sha256-8Uv6RI... + NV#npm#lodash, each with a TTL. Backend log shows "Writing to DynamoDB cache: npm#sha256-... (score: 0)" twice | VERIFIED | ddb-01-artifact-cache-scan.json, log-backend-excerpt.txt |
| P7 cache re-run (the negative control for step 5) | second run faster, no new worker job | lodash 22719 ms -> 1086 ms; left-pad re-run 3355 ms and still installs. fetch_jobs stayed at 2 across both re-runs - no new worker job. Backend logged "DynamoDB cache HIT for npm:lodash@4.17.4" and "... npm:left-pad@1.3.0". The cached lodash run also drops the "(preliminary)" marker | VERIFIED | run-03-lodash-cached.out, run-04-leftpad-cached.out, log-backend-excerpt.txt |
| P8 sandbox worker builds from the p47 branch and probes its own containment | image builds, worker reports its mode | built clean; with --cap-add SYS_PTRACE --security-opt seccomp=unconfined it reports bwrapAvailable:true, straceAvailable:true, networkNamespaceAvailable:false, effectiveMode:"bwrap" | VERIFIED | sandbox-worker-build.log, log-sandbox-contained.log |
| P9 W7C T2 control - a sandbox that CAN contain still detonates | package runs, telemetry collected | ran under bwrap + strace: "Sandbox execution complete ... durationMs 11890, exitCode 0", telemetry 82 events / 24 process execs / 1 network conn / 1 file created, "npm import-trigger phase complete", verdict WARN riskScore 100, results submitted. Job wall time 12.47 s | VERIFIED | log-sandbox-contained.log |
| P10 W7C T2 - a sandbox that CANNOT contain refuses to run the package | no execution at all | a worker with no user namespaces and no strace reports effectiveMode:"direct"; the identical job produced "detonation SKIPPED - the sandbox cannot contain this run; refusing to execute the package in a mode we cannot contain - coverage gap -> INCONCLUSIVE". ZERO execution-phase log lines (Spawning process / Telemetry collected / Sandbox execution complete / import-trigger phase complete) against 8 in the contained run. Job wall time 360 ms vs 12.47 s | VERIFIED | log-sandbox-uncontained.log, run-06-sbx-uncontained-enqueue.txt |
| P11 the refusal actually reports INCONCLUSIVE | coverage gap -> INCONCLUSIVE | same job with fetchContext.staticRiskScore=5 (so no WARN floor): "Sandbox run degraded - reporting INCONCLUSIVE instead of ALLOW (B5)", reason SANDBOX_NO_ISOLATION. With staticRiskScore=75 the heuristic WARN floor is preserved instead - the documented "never weaken an evidence-anchored verdict" rule, not a miss | VERIFIED | log-sandbox-uncontained.log, run-07-sbx-uncontained-lowscore-enqueue.txt |
| P12 the npm import-trigger phase is behind the same gate (the "three call sites" defect the commit describes) | import-trigger skipped when uncontained | contained log contains "npm import-trigger phase complete"; uncontained log contains it ZERO times | VERIFIED | both sandbox logs |

Timings in one line: uncached ALLOW 8.2 s of worker time; uncached BLOCK 22.7 s end to end;
cached BLOCK 1.09 s; cached ALLOW 3.36 s including a 2 s npm install; contained detonation
12.5 s; refused detonation 0.36 s. The total shim wall clock for the FIRST left-pad run was not
captured (bc is absent from this Git Bash; the timing wrapper was fixed before the next run), so
the ALLOW cache comparison rests on the measured 3355 ms re-run plus the fetch-job evidence that
no second worker job was created.

## Gaps

GAP-1 (NOT EXERCISED) - nothing escalated from the shim into the sandbox, so the backend's
escalate-to-enqueue wiring was never driven. Both packages were skipped by the static worker's
escalator: left-pad skipReason TRUSTED_CLEAN; lodash@4.17.4 matchedSkipRules
["TRUSTED_CLEAN","BUNDLED_CODE"] - even carrying a CRITICAL CVE, because the escalator scores
reputation and code shape, not advisories. sandbox_jobs is still 0 rows and the sandbox queues
carried no backend-produced traffic. The sandbox lane was therefore driven at its own SQS input
boundary with a synthetic tarball (which the lane brief permits), using the backend's own
SandboxJob wire contract. JobQueueService.enqueueSandboxJobV2 and persistSandboxV2Binding remain
unexercised on this rig.

GAP-2 - the shared artifact-cache row for a blocked package records verdict ALLOW.
NV#npm#lodash (sk 4.17.4) and its digest row both hold verdict "ALLOW", riskScore "0", with only
blockReason "vulnerability" hinting otherwise; topFindings is "[]". The BLOCK is re-derived per
tenant by the policy engine from the cached CVE evidence - proven, because the cached re-run
still blocked, in 1086 ms. So the behaviour is correct, but the row is a trap for anyone reading
the cache table to answer "what did the product decide?". The same split shows in Postgres:
analysis.riskScore = 70 while global_artifact_cache.riskScore = 0 for the same package.

GAP-3 (rig, not product) - dynamodb-local runs without -sharedDb, so the AWS region is part of
the namespace. The lane brief says to use eu-north-1; the backend uses us-east-1 (backend.env
AWS_REGION). Scanning eu-north-1 returns an empty parallel database and reads as "the cache is
never written". The live namespace is us-east-1. A bootstrap run in the wrong region silently
creates a second, empty set of tables - I created one that way and deleted it again.

GAP-4 - no org package policy exists, so every verdict here came from the default policy. The
backend logged "No policy found for org cdcde8a7-7aea-4128-be1a-6ff3dec52348, using default
policy" on every gate call. The ALLOW band (0-39) and the CRITICAL_CVE block are product
defaults, not anything an admin set in the console.

GAP-5 (local divergence from production, recorded so it is not mistaken for a pass) - three
signing controls are off on this rig: the backend publishes fetch jobs legacy_unsigned
(signerConfigured=false); the sandbox worker accepts legacy_unsigned_worker_accept because
JOBS_SQS_REJECT_UNSIGNED=false; the static worker warns "CODEFENCE_RUNNER_SIGNING_SECRET is not
set; static-result POSTs will be unsigned". Production enforces all three, so message
authenticity was not tested by this lane at all.

GAP-6 - a sandbox result for an uploaded artifact never reaches an analysis row. Because my job
was published straight to SQS with no originalAnalysisId, the backend logged "No analysis found
for npm:p47-uncontainable-probe@1.0.0" and "SCORE FUSION SKIPPED". It then correctly refused to
pollute shared state: "Skipping DynamoDB cache write for local-artifact result ... verdict
applies only to the uploaded artifact, not registry coords", and the same for GlobalArtifactCache
and licence ingestion. Good hygiene - it does mean the containment refusal produced no
customer-visible row.

GAP-7 - coverage caveats on the analysis itself. GITHUB_TOKEN was unset, so the worker ran
unauthenticated GHSA at 60 requests/hour and logged "[GHSA_TOKEN_MISSING] ... severity HIGH"; it
still found all 10 lodash advisories in this run, but the ceiling is real. AI analysis was
disabled (ENABLE_AI_ANALYSIS=false, no LLM key supplied), so neither worker's AI lane ran.

## Setup notes (how to re-run)

Everything referenced below is in this directory.

1. p47-aws-env.sh - dummy credentials plus the three emulator endpoints. Region us-east-1 (GAP-3).

2. Emulator resources. The 4 SQS queues and 3 buckets already existed; the DynamoDB tables are
   in-memory and vanish whenever that container restarts, so re-create them with the repo's own
   bootstrap (one line, from the workspace root):

       AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=localminio AWS_SECRET_ACCESS_KEY=localminio123456
       AWS_SQS_ENDPOINT_URL=http://localhost:9526 AWS_S3_ENDPOINT_URL=http://127.0.0.1:9200
       AWS_DYNAMODB_ENDPOINT_URL=http://localhost:8202
       NODE_PATH=C:\cwt\p47-w4b-be\node_modules node .codesec-e2e/bootstrap-emulators.cjs

3. Workers run as containers on codesec-e2e-p47_net, whose service aliases
   (codesec-e2e-elasticmq, -minio, -dynamodb, -postgres) match the base-stack hostnames - so
   .codesec-e2e/worker.env and sandbox.env work unchanged and only BACKEND_URL needs remapping to
   http://host.docker.internal:2353 with --add-host host.docker.internal:host-gateway. Copies
   carrying that change: worker-p47.env, sandbox-p47.env (the latter also drops the Gemini key
   that sits in the repo's sandbox.env).

   - static worker: build from a COPY of package.json pnpm-lock.yaml tsconfig.json Dockerfile src/.
     That worktree has no .dockerignore and a node_modules junction, so building in place uploads
     the whole tree. Then:
       docker run -d --name p47-sc-static-worker --network codesec-e2e-p47_net
         --add-host host.docker.internal:host-gateway --cpuset-cpus=0-5 --memory=6g
         --env-file worker-p47.env p47/static-worker:sc-lane
   - sandbox worker, containable: same shape plus --cap-add SYS_PTRACE --security-opt
     seccomp=unconfined. The Sandbox-Worker worktree has its own .dockerignore, so it builds in place.
   - sandbox worker, UNCONTAINABLE: omit both of those, and use
       --entrypoint sh ... -c 'rm -f /usr/bin/strace; exec node dist/index.js'
     Dropping SYS_PTRACE alone is NOT enough - Docker's default seccomp still permits ptrace, so
     the worker lands in strace mode, which W7C deliberately still runs. Only with neither bwrap
     nor strace does it report effectiveMode "direct", the floor the gate refuses.

4. Shim: run-shim-p47.sh <args> applies the same env redirection as .codesec-e2e/run-daemon-p47.sh,
   then execs $ISO/devoid.exe. Run it from a throwaway project directory containing a package.json
   (I used /c/cwt/p47-sc-lane/proj-allow, proj-block, proj-allow2, proj-block2). Prefix the call
   with MSYS_NO_PATHCONV=1.

5. snap.sh <label> prints SQS depths, the DynamoDB item count and five Postgres counts. Elasticmq
   exposes only queue depth, so "SQS traffic" here is evidenced by the depth transitions plus the
   messageIds echoed in the worker logs, not by a sent-message counter.

6. Sandbox probe: enqueue-sandbox-job.cjs <label> [staticRiskScore] publishes one SandboxJob (the
   backend's own schema) to cera-sandbox_jobs-local. It points at a synthetic npm tarball -
   fixture-package.json.txt and fixture-postinstall.js.txt, sha256 in fixture-sha256.txt - whose
   postinstall writes a marker into the CONTAINER's home directory and opens one outbound TCP
   connection. Rebuild with tar -czf ... package and upload to
   s3://ceragon-local-artifacts/artifacts/npm/p47-uncontainable-probe/1.0.0/. That object was
   deleted again at the end of the run so it cannot confuse another lane. Stop the contained
   worker before enqueuing to the uncontained one, or they race for the message.

Cleanup performed: containers p47-sc-static-worker, p47-sc-sandbox-contained and
p47-sc-sandbox-uncontained removed; the fixture S3 object deleted; the stray eu-north-1 DynamoDB
namespace dropped. The codesec-e2e-p47 emulators were left running and their us-east-1 data
(6 cache items, 4 analysis rows, 2 fetch jobs) left in place as evidence. Scratch directories
under /c/cwt/p47-sc-lane/ remain.
