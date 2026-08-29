# AWS / ops state — read-only production inspection

**Date:** 2026-08-18 · **Account:** `113627991972` · **Region:** `eu-north-1`
**Caller:** `arn:aws:iam::113627991972:user/DorStachy`
**Mode:** READ-ONLY. Every AWS call in this document is `describe-*` / `list-*` / `get-*`. No write was
performed. Where closing an item needs a write, the exact command for a human is given and **not run**.

**Scope authority:** `OPEN-REGISTER-TO-DONE.md` § C — *Owner-executed AWS/ops — config, not code*:
> `AUDIT_RETENTION_DAYS` · `CERAGON_ENV` · `RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant ·
> CloudWatch alarms · Hetzner. Add **`CF_BUILD_SHA`/`CF_BUILD_TIME` on the ECS task definition** to close #20.

**Credential handling:** no parameter or secret *value* was read. Presence is established from task-definition
`secrets[]` wiring and `ssm describe-parameters` — names and ARNs only.

---

## Verdict summary

| # | Item | Verdict |
|---|---|---|
| C-0 | **Register #20 — running backend cannot say what build it is** | **PASS — resolved in prod (sha)** |
| C-0b | `CF_BUILD_TIME` — the build cannot say *when* it was built | **FAIL (honest: key omitted)** |
| C-0c | **§C's prescribed remediation is wrong and would re-break #20** | **FAIL — register defect** |
| C-1 | `AUDIT_RETENTION_DAYS` explicit | **FAIL — unset; implicit 30-day cut in force** |
| C-2 | `CERAGON_ENV=production` | **PASS** |
| C-2b | `DYNAMODB_ARTIFACT_CACHE_TABLE` name | **PASS — staging-named table is correct by design; `CLAUDE.md:41` is stale** |
| C-3 | `RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant | **FAIL — unset (honest 503)** |
| C-4 | CloudWatch alarms | **FAIL — no alarm on any register-named lane** |
| C-5 | Hetzner / intel ECS at 0/0 | **PASS — expected state** |
| C-6 | `CODEFENCE_SIGNING_MASTER_KEY` present | **PASS** |
| C-6b | AI prompt-evidence Lane B keys | **FAIL — still absent, 26 revisions on** |
| C-7 | Lambda event source mappings | **all 8 Disabled (expected); 1 dangling** |
| C-8 | Queues with no consumer | **FAIL — 2 abandoned lanes + 283-msg unalarmed DLQ** |

---

## 1. Register item #20 — the build stamp

### 1.1 What is actually running

```
$ aws ecs describe-services --cluster backend --services backend-service
{ "status": "ACTIVE", "desired": 1, "running": 1, "pending": 0,
  "taskDefinition": ".../task-definition/backend:315" }

$ aws ecs list-task-definitions --family-prefix backend --status ACTIVE --sort DESC --max-items 5
backend:315, backend:314, backend:313, backend:312, backend:311
```

**The running revision IS the newest registered revision — `backend:315`.** No deploy is stranded.

```
$ aws ecs describe-tasks --cluster backend --tasks <running task>
{ "taskDef": ".../task-definition/backend:315", "lastStatus": "RUNNING",
  "startedAt": "2026-08-14T05:26:36+03:00",
  "image": "...dkr.ecr.eu-north-1.amazonaws.com/backend:d52a1ce07c29413b3ccd33a13aa46eef6b1a732b",
  "imageDigest": "sha256:16f7a29b0fffaae3efd00d764b5642f88df0184422323f5ff6852d0e651a661e" }

$ aws ecr describe-images --repository-name backend --image-ids imageTag=d52a1ce0...
{ "digest": "sha256:16f7a29b0fffaae3efd00d764b5642f88df0184422323f5ff6852d0e651a661e",
  "pushed": "2026-08-14T05:24:31+03:00", "tags": ["d52a1ce07c29413b3ccd33a13aa46eef6b1a732b", "latest"] }
```

The tag still resolves to the digest the running task pulled, so the image inspected below is the running image.

### 1.2 What the task definition sets — correctly, NOTHING

Presence probe over the full `containerDefinitions[0]` of `backend:315`:

```
CF_BUILD_SHA                             ABSENT
CF_BUILD_TIME                            ABSENT
```

This absence is the **desired** state, not a gap — see 1.5.

### 1.3 What the image carries — the stamp is in the image

Read from the image's own config blob (`ecr batch-get-image` → config digest
`sha256:085d02ce68d9917d8971d5dd36694f4911a6cbac9e350656367fc3678a14bb2e` →
`ecr get-download-url-for-layer`):

```
IMAGE CONFIG Env entries:
   PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   NODE_VERSION=24.19.0
   YARN_VERSION=1.22.22
   CF_BUILD_SHA=d52a1ce07c29413b3ccd33a13aa46eef6b1a732b
   CF_BUILD_TIME=
created: 2026-08-14T02:23:53Z
```

`CF_BUILD_SHA` is **present and real**. `CF_BUILD_TIME` is **present but empty** — the half-stamped image.

### 1.4 PROVEN LIVE — the running backend DOES say what build it is

Two independent surfaces, over the real wire, against production:

```
$ curl -D - https://api.devoid.one/health
HTTP/1.1 200 OK
...
x-devoid-backend-build: d52a1ce07c29413b3ccd33a13aa46eef6b1a732b
```

```
$ curl https://api.devoid.one/api/v1/health
buildSha  present: True  -> d52a1ce07c29413b3ccd33a13aa46eef6b1a732b
buildTime present: False -> None
top-level keys: ['backendLlmProxy', 'buildSha', 'database', 'dynamodb', 'llmConfigured',
                 'llmRequired', 'scannerAi', 'scannerSubsystems', 'sqs', 'status', 'timestamp', 'uptime']
```

Three-way agreement: **ECR image tag == image `CF_BUILD_SHA` == what the live process reports.**

**VERDICT C-0: PASS.** The register's premise — *"no `CF_BUILD_SHA` in the process"* — is **no longer true in
production.** It was closed by `fc85d312 fix(build-identity): read the build sha the image actually carries`,
which is **on `origin/main` and is an ancestor of the deployed build `d52a1ce0`** (verified:
`git merge-base --is-ancestor fc85d312 d52a1ce0` → true). The image always carried the ENV; the old code read
`BUILD_SHA || GITHUB_SHA` and got `undefined`. It was a code defect, and the fixed code is deployed.

**VERDICT C-0b: FAIL, honestly.** `buildTime` is **absent from the payload rather than reported as `"unknown"`**
— exactly the contract the register credits the surface with. The running build genuinely cannot say when it was
built, because `CF_BUILD_TIME` was baked empty.

Root cause is already diagnosed and fixed in an **unpushed** commit (`fb6ff5d1`, in `C:/cwt/int-be`):
`build.yml` sourced `CF_BUILD_TIME` from `github.event.head_commit.timestamp`, but this workflow's only triggers
are `workflow_dispatch` / `repository_dispatch`, **neither of which carries `head_commit`** — so it expanded to
the empty string on every run the workflow has ever had. Now sourced from the build moment
(`date -u +%Y-%m-%dT%H:%M:%SZ`), plus `scripts/assert-image-build-stamp.cjs`, which fails the deploy closed
between `docker build` and `docker push` and refuses absent, empty, and placeholder stamps alike.

### 1.5 The register's own remediation is wrong — DO NOT DO IT

> § C: *"Add `CF_BUILD_SHA`/`CF_BUILD_TIME` on the ECS task definition to close #20."*

**Doing this would reintroduce a worse defect than the one it closes.** Commit `d79b8ac0`
*"fix(deploy): the ECS task definition could outrank the image about the build stamp"* establishes the opposite
rule, and the pipeline now enforces it (`.github/workflows/build.yml:565-591`):

```yaml
# §10 register #20 — CF_BUILD_SHA / CF_BUILD_TIME are STRIPPED AND NOT
# RE-ADDED, unlike the five names above. They are the one thing the
# task definition must never have an opinion about.
...
                  .name != "RATE_LIMIT_TABLE" and
                  .name != "CF_BUILD_SHA" and
                  .name != "CF_BUILD_TIME"
```

The reasoning: the deploy job does not author a task definition — it *describes the current one, swaps the image
and re-registers*, so unknown `environment` entries survive from revision to revision indefinitely. A task-def
env entry **overrides the image's own ENV**. A `CF_BUILD_SHA` set on the task definition once would be inherited
by every future revision and pin the reported identity to a build that stopped running long ago — *"a
confidently wrong sha sends an operator somewhere else entirely, and nothing in the system contradicts it."*

**The correct posture — already true in production today — is that the task definition says nothing and the
IMAGE is the single authority.** The absence measured in 1.2 is the desired state, not a gap to fill.

### 1.6 The exact, minimal, human-runnable change

**No AWS write is required, and none should be made.** The remaining half of #20 (`buildTime`) closes by
shipping code that already exists locally, then deploying normally:

```bash
# 1. Push the three unpushed commits of the #20 chain. Verified NOT on any remote branch today:
#      fb6ff5d1  fix(deploy): the running backend could not say what build it is
#      d79b8ac0  fix(deploy): the task definition could outrank the image about the build stamp
#      2d285d08  fix(observability): the build stamp loader had its own copy of what counts as an identity
cd C:/cwt/int-be && git push origin HEAD:<integration-branch>

# 2. Merge to main, then run the normal deploy. CF_BUILD_TIME is now sourced from the build moment,
#    and assert-image-build-stamp.cjs fails the deploy closed if either stamp is absent/empty/placeholder.
gh workflow run build.yml --repo <backend-repo> --ref main

# 3. Verify (read-only) AFTER the Deploy-to-ECS JOB reports success — the job, not the run conclusion:
curl -s https://api.devoid.one/api/v1/health | jq '{buildSha, buildTime}'
curl -sD - -o /dev/null https://api.devoid.one/health | grep -i x-devoid-backend-build
```

**Do NOT run** `aws ecs register-task-definition` with a `CF_BUILD_SHA` / `CF_BUILD_TIME` environment entry.
That is precisely the failure mode `d79b8ac0` exists to prevent.

---

## 2. Boot-required secrets and SSM parameters — names only

Wired into `backend:315` as `secrets[]` (the wiring proves the reference; **no value was read**):

| Secret name | Source parameter |
|---|---|
| `CODEFENCE_SIGNING_MASTER_KEY` | `arn:aws:ssm:...:parameter/ceragon/production/backend/CODEFENCE_SIGNING_MASTER_KEY` |
| `AI_PROMPT_EVIDENCE_ENCRYPTION_KEY` | `.../backend/AI_PROMPT_EVIDENCE_ENCRYPTION_KEY` |
| `API_KEY_HMAC_PEPPER` | `.../backend/API_KEY_HMAC_PEPPER` |
| `BREVO_API_KEY` | `.../backend/BREVO_API_KEY` |
| `CODEFENCE_RUNNER_SIGNING_SECRET` | `.../backend/CODEFENCE_RUNNER_SIGNING_SECRET` |
| `DATABASE_PASSWORD` | `.../backend/DATABASE_PASSWORD` |
| `DATABASE_URL` | `.../backend/DATABASE_URL` |
| `GITHUB_APP_ID` | `.../backend/GITHUB_APP_ID` |
| `GITHUB_APP_PRIVATE_KEY` | `.../backend/GITHUB_APP_PRIVATE_KEY` |
| `GITHUB_SIGNING_KEY_ENCRYPTION_SECRET` | `.../backend/GITHUB_SIGNING_KEY_ENCRYPTION_SECRET` |
| `GITHUB_WEBHOOK_SECRET` | `.../backend/GITHUB_WEBHOOK_SECRET` |
| `JWT_SECRET` | `.../backend/JWT_SECRET` |
| `MFA_ENCRYPTION_KEY` | `.../backend/MFA_ENCRYPTION_KEY` |
| `TURNSTILE_SECRET_KEY` | `.../backend/TURNSTILE_SECRET_KEY` |
| `WORKER_API_KEY` | `.../backend/WORKER_API_KEY` |
| `CLI_AGENT_SIGNING_KEYS` | `.../backend/CLI_AGENT_SIGNING_KEYS` |
| `INTERNAL_EVENTS_API_KEY` | `.../production/intel/INTERNAL_EVENTS_API_KEY` |

**`CODEFENCE_SIGNING_MASTER_KEY` — VERDICT: PASS.** The documented deploy blocker is wired. Corroborated
end-to-end: the task is `RUNNING`, the ALB target is `healthy`, and `/api/v1/health` answers `200` — a backend
missing this key would not boot.

**`AI_CORRELATION_KEY_MASTER_KEY` — VERDICT: FAIL (still absent).**
**`AI_PROMPT_EVIDENCE_TENANT_MAC_KEY` — VERDICT: FAIL (still absent).**

```
AI_CORRELATION_KEY_MASTER_KEY            ABSENT
AI_PROMPT_EVIDENCE_TENANT_MAC_KEY        ABSENT
```

Neither name appears anywhere in `backend:315` — not in `environment[]`, not in `secrets[]`. These were proven
absent in revision 289; **26 revisions later they are still absent.** Note `AI_PROMPT_EVIDENCE_ENCRYPTION_KEY`
*is* present and is a **different name** — the prompt-evidence Lane B keys specifically are not.

Per standing guidance these must **not** be boot-asserted (that has bricked a deploy before). The visible-prompt
path stays on `redactedPreview`, which requires no new secret. Recorded as a state fact, not an action item.

---

## 3. § C config items on the task definition

### C-1 `AUDIT_RETENTION_DAYS` — VERDICT: FAIL (unset)

```
AUDIT_RETENTION_DAYS                     ABSENT
AUDIT_RETENTION_ENABLED                  ABSENT
```

Both absent. Per `fix-specs/BACKENDOPS.md:433`, retention is **ENABLED by default** (only the literal strings
`false`/`0`/`no` disable it) and `AUDIT_RETENTION_DAYS` defaults to **30**. So a daily 02:00 UTC sweep is
deleting `audit_events` older than 30 days on a window **nobody set explicitly** — the same silent-default class
as F12/F37. Policy choice, not a correctness risk (the hash chain over the surviving window stays intact).

**Human action — NOT RUN; requires an owner-decided value `<N>` first:**
```bash
# NOT RUN. The deploy clone carries unknown env keys forward, so setting this once on the
# task definition persists across future deploys — intended for config, and exactly why the
# build stamp is excluded from that carry-forward.
aws ecs describe-task-definition --task-definition backend:315 --region eu-north-1 \
  --query taskDefinition > td.json
# edit td.json: add {"name":"AUDIT_RETENTION_DAYS","value":"<N>"} to containerDefinitions[0].environment
aws ecs register-task-definition --region eu-north-1 --cli-input-json file://td.json
aws ecs update-service --cluster backend --service backend-service --region eu-north-1 \
  --task-definition backend:<new-revision>
```

### C-2 `CERAGON_ENV` — VERDICT: PASS

```json
{ "name": "CERAGON_ENV", "value": "production" }
{ "name": "NODE_ENV",    "value": "production" }
{ "name": "AWS_REGION",  "value": "eu-north-1" }
```

The `CERAGON_ENV || 'staging'` silent fallback (F37) is **not** in force — the value is set explicitly, so the
`ceragon-production-artifact-{alias,catalog,verdict}` tables are the ones addressed on that path.

### C-2b `DYNAMODB_ARTIFACT_CACHE_TABLE` — VERDICT: PASS (by design) — **DO NOT "FIX" THIS**

> **Correction.** An earlier revision of this document called this a FAIL. **That verdict was wrong and is
> retracted.** The staging-*named* table is the intended production cache. Recorded here in full because the
> mistake is an easy one to repeat, and acting on it would cause an outage.

```json
{ "name": "DYNAMODB_ARTIFACT_CACHE_TABLE", "value": "cera-artifact_analysis_cache-staging" }
{ "name": "PRECOMPUTED_VERDICT_ENABLED",   "value": "true" }
```

Both tables exist, and the binding is backwards:

```
$ aws dynamodb describe-table --table-name cera-artifact_analysis_cache-staging
{ "name": "cera-artifact_analysis_cache-staging",    "items": 1360, "size": 6294423, "status": "ACTIVE" }

$ aws dynamodb describe-table --table-name cera-artifact_analysis_cache-production
{ "name": "cera-artifact_analysis_cache-production", "items": 0,    "size": 0,       "status": "ACTIVE" }
```

The canonical source of truth rules on this explicitly
(`docs/MostUpdated_SourceOfTruth/CERA_PRODUCT_GUIDE_PLAIN_ENGLISH.md:535`):

> ⚠️ **The live production cache is the table named `cera-artifact_analysis_cache-staging`** (~1,100+ entries).
> The similarly-named `-production` table is **empty** — a historical naming quirk. *Do not "fix" this name*;
> flipping it would point the system at the empty table and trigger a re-analysis storm.

The measured state matches that ruling exactly — 1360 rows in the staging-named table, 0 in the production-named
one. **The configuration is correct. No change is required, and the obvious-looking change is harmful.**

**The real defect here is documentation drift.** `CLAUDE.md:41` states that Backend reads
`cera-artifact_analysis_cache-production`, which contradicts the SOT and would lead a reader (or an agent) to
"correct" the live task definition into an outage. `AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH.md:700` sidesteps it by
writing the generic `cera-artifact_analysis_cache-{env}`.

```bash
# NOT RUN, and MUST NOT BE RUN:
#   DYNAMODB_ARTIFACT_CACHE_TABLE=cera-artifact_analysis_cache-production
# This is the re-analysis-storm change the SOT forbids.
```

**Documentation fix for a human** (a text edit, not an AWS write): amend `CLAUDE.md:41` to name
`cera-artifact_analysis_cache-staging` as the live production cache, with the naming-quirk note, so the next
reader does not repeat the mistake this section retracts.

---

## 4. C-3 `RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant — VERDICT: FAIL (three parts, only one is config)

### 4a. The env var is unset — PROVEN LIVE

```
$ curl https://api.devoid.one/api/v1/health/release-manifest
[HTTP 503]
{"expected":null,"manifestLoaded":false,
 "manifestLoadError":"RELEASE_MANIFEST_PATH unset and no manifest at any default location
                      (/app/release-manifest.json, /app/dist/release-manifest.json,
                       /etc/devoid/release-manifest.json)",
 "manifestSource":"unset","liveEcsComparison":{"enabled":false},
 "driftReport":{"manifestUnreachable":true,"hasDrift":false,
   "reasons":[{"component":"manifest","reason":"MANIFEST_UNREACHABLE",
               "expected":"manifest path configured",
               "observed":"RELEASE_MANIFEST_PATH unset and no manifest at any default location"}]}}
```

The route is **behaving correctly**: 503 with a named reason and `expected: null`. It refuses to report 200 for a
route that knows nothing. This is the honest-negative posture the spec requires — do not "fix" it by relaxing
the route.

### 4b. The `s3:GetObject` grant ALREADY EXISTS — PASS

The register lists the grant as outstanding. It is not. Inline policy `s3-local-artifacts` on the backend task
role (`arn:aws:iam::113627991972:role/ecsTaskExecutionRole`):

```json
{ "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::cera-artifacts-staging-113627991972-eu-north-1",
               "arn:aws:s3:::cera-artifacts-staging-113627991972-eu-north-1/*",
               "arn:aws:s3:::installers-prod/*",
               "arn:aws:s3:::installer-binaries-prod/*"] }
```

`s3:GetObject` on `installer-binaries-prod/*` is granted. **No IAM change is needed.**

Further, the `s3://` scheme is supported by the **deployed** code, not merely the worktree.
`release-manifest.service.ts` routes `s3://` to `loadManifestFromS3()` and reserves the "not supported" throw for
`https://` only. Verified against the running build:
`git show d52a1ce0:src/health/services/release-manifest.service.ts | grep -c loadManifestFromS3` returns `2`.

### 4c. THE ACTUAL BLOCKER — there is no complete manifest to point at

```
$ aws s3 ls s3://installer-binaries-prod/manifests/ --recursive
(empty)

$ aws s3 ls s3://installer-binaries-prod/ --recursive | grep release-manifest
2026-08-08  1691  releases/7.8.30/release-manifest.v1.partial.json
...
2026-08-17  1691  releases/7.8.41/release-manifest.v1.partial.json
```

Only `.partial.json` objects exist. Per `fix-specs/BACKENDOPS.md:241`, the release pipeline emits that partial
**deliberately and correctly** — it cannot fill `components{8}`, `compatibleWorkerContractVersion` or
`compatibleBackendRange`, and it explicitly warns that **`RELEASE_MANIFEST_PATH` must NEVER point at it.** The
key the spec prescribes (`manifests/backend/release-manifest.v1.json`) does not exist.

**Conclusion:** C-3 is **not** an ops/config item at all — it is blocked on the missing assembler
(`Backend/.github/workflows/` has no producer). Setting the env var today would either 503 with
`MANIFEST_UNREACHABLE` (pointing at a nonexistent key) or load a partial that fails shape validation. Both are
strictly worse than the current honest `unset`.

```bash
# NOT RUN - and must NOT be run until a COMPLETE manifest is published.
# Pointing this at the existing .partial.json is explicitly forbidden by the producer.
#   RELEASE_MANIFEST_PATH=s3://installer-binaries-prod/manifests/backend/release-manifest.v1.json
```

---

## 5. C-4 CloudWatch alarms — VERDICT: FAIL — no alarm covers any production intelligence lane

25 metric alarms exist; **0 composite alarms**. The decisive measurement:

```
$ aws cloudwatch describe-alarms --region eu-north-1 --output json | grep -c "ceragon-production"
0
```

**Not one alarm — in any namespace, on any metric, with any dimension — references a `ceragon-production-*`
queue, table, or service.** Every SQS alarm that exists is dimensioned on a `cera-*-staging` or `codefence-*`
queue.

Full inventory (name and state):

| Alarm | State |
|---|---|
| `backend-memory-utilization-high` | OK |
| `TargetTracking-cera-sandbox-intel-asg-AlarmHigh` / `-AlarmLow` | OK / OK |
| `cera-fetch-worker-staging-received-but-zero-completed` | OK |
| `cera-fetch-worker-staging-scalein-zero` | ALARM |
| `cera-fetch-worker-staging-scaleout-backlog` | OK |
| `cera-fetch_jobs_dlq-staging-nonzero` | **ALARM** |
| `cera-sandbox-exec-now-scale-up-staging` | OK |
| `cera-sandbox-scale-down-staging` | ALARM |
| `cera-sandbox-scale-up-staging` | OK |
| `cera-sandbox-staging-exec-now-scale-out` | OK |
| `cera-sandbox-staging-sqs-scale-in` | ALARM |
| `cera-sandbox-staging-sqs-scale-out` | OK |
| `codefence-scan-processor-dlq-nonzero` | OK |
| `codefence-scanner-jobs-dlq-nonzero` | OK |
| `codefence-scanner-worker-scalein-min1` | ALARM |
| `codefence-scanner-worker-scaleout-backlog` | OK |
| `fetch-dlq-not-empty` | **ALARM** |
| `fetch-worker-high-wait-time-exec` / `-normal` | OK / OK |
| `fetch-worker-idle` | ALARM |
| `fullrepo-queue-has-messages` | OK |
| `fullrepo-queue-idle` | ALARM |
| `p0-7-sandbox-sqs-verify-failures` | OK |
| `sandbox-dlq-not-empty` | INSUFFICIENT_DATA |

The `*-scalein-*` / `*-idle` alarms sitting in ALARM are **by design** — they are autoscaling triggers on idle
lanes, not faults. The two that matter are `cera-fetch_jobs_dlq-staging-nonzero` and `fetch-dlq-not-empty`, both
firing to `arn:aws:sns:eu-north-1:113627991972:cera-alerts` against a staging DLQ holding 1 message.

**The consequence is section 8:** production DLQs and abandoned production queues are entirely uninstrumented.
`sandbox-dlq-not-empty` at `INSUFFICIENT_DATA` is itself a silent alarm — it has no data to judge.

---

## 6. C-5 Hetzner / intel ECS — VERDICT: PASS (expected state, no action)

```
=== ceragon-intelligence-production ===
0  0  ceragon-intelligence-artifact-fetcher-production   .../ceragon-intelligence-artifact-fetcher-production:37
0  0  ceragon-multi-follower-production                  .../ceragon-multi-follower-production:39
0  0  ceragon-intel-static-worker-production             .../ceragon-intel-static-worker-production:110
0  0  ceragon-intel-sandbox-worker-production            .../ceragon-intel-sandbox-worker-production:56
```

All four intel services 0/0. **This is correct** — the intelligence pipeline runs on Hetzner, not ECS. Confirmed
positively rather than assumed: the intel queues show real consumption that no AWS compute could be performing,
because every AWS consumer for them is either 0/0 or `Disabled` (sections 7 and 8):

```
ceragon-production-intel-static-jobs    sent14d=733       received14d=3635
ceragon-production-intel-dynamic-jobs   sent14d=179       received14d=202
ceragon-production-release-observation  sent14d=1215817   received14d=7410
```

Something off-AWS is draining those queues. That is the Hetzner fleet, and it is alive.

### Full ECS state — running revision vs. newest registered

| Cluster / service | desired/running | Running task def | Newest registered | Match |
|---|---|---|---|---|
| `backend` / `backend-service` | 1 / 1 | `backend:315` | `backend:315` | **YES** |
| `frontend` / `frontend` | 1 / 1 | `frontend:371` | `frontend:371` | **YES** |
| `cera-workers-staging` / `cera-fetch-worker-staging` | 1 / 1 | `cera-fetch-worker-staging:93` | `:93` | **YES** |
| `cera-workers-staging` / `cera-sandbox-worker-staging` | 1 / 1 | `cera-sandbox-worker-staging-ec2:68` | not compared | — |
| `cera-workers-staging` / `codefence-scanner-worker` | **0 / 0** | `codefence-scanner-worker:159` | `:159` | YES (image current, not running) |
| `cera-workers-staging` / `codefence-scanner-worker-fullrepo` | **0 / 0** | `codefence-scanner-worker-fullrepo:34` | not compared | — |
| `ceragon-intelligence-production` / all four | **0 / 0** | see above | `ceragon-multi-follower-production:39` | YES |

**No service is running a stale revision.** Every service that is up is on the newest registered task definition.
The 0/0 services are the known deliberate power-off (scanner workers) and the Hetzner-hosted intel lanes —
images are current, nothing is analysing. Reported, not alarmed about.

---

## 7. C-7 Lambda event source mappings — VERDICT: all 8 `Disabled`; one is dangling

```
$ aws lambda list-event-source-mappings --region eu-north-1
```

| Function | Source queue | State |
|---|---|---|
| `ceragon-intel-result-aggregator-production` | `ceragon-production-intel-result-write` | **Disabled** |
| `ceragon-intel-dispatcher-production` | `ceragon-production-analysis-static-background` | **Disabled** |
| `ceragon-intel-dispatcher-production` | `ceragon-production-analysis-dynamic-background` | **Disabled** |
| `ceragon-intel-dispatcher-production` | `ceragon-production-analysis-dynamic-urgent` | **Disabled** (dangling) |
| `ceragon-intel-router-production` | `ceragon-production-release-observation` | **Disabled** |
| `ceragon-intel-metadata-only-production` | `ceragon-production-metadata-only` | **Disabled** |
| `cera-sandbox-staging-wake-up` | `cera-sandbox_jobs-staging` | **Disabled** |
| `cera-sandbox-staging-wake-up` | `cera-sandbox_jobs_exec_now-staging` | **Disabled** |

All eight disabled is **consistent with the deliberate power-off** (`ceragon-power-off.ps1` disables Lambda event
source mappings and records them in `scripts/ceragon-power-state.json`).

**Dangling mapping — UUID `602a90f8-bdf0-4fd1-bff6-bac508e4e742`.** It points at
`ceragon-production-analysis-dynamic-urgent`, which **does not exist**:

```
$ aws sqs get-queue-url --queue-name ceragon-production-analysis-dynamic-urgent --region eu-north-1
An error occurred (AWS.SimpleQueueService.NonExistentQueue) when calling the GetQueueUrl operation:
The specified queue does not exist.
```

Harmless while `Disabled`, but a future `ceragon-power-on.ps1` run that re-enables the recorded mappings will
attempt to enable a mapping against a deleted queue. Worth an operator's eye before the next power-on.

```bash
# NOT RUN - deletion is a write, and this may be an intentionally-retained mapping.
# aws lambda delete-event-source-mapping --uuid 602a90f8-bdf0-4fd1-bff6-bac508e4e742 --region eu-north-1
```

---

## 8. C-8 Queues with no consumer — VERDICT: FAIL — two abandoned lanes and a 283-message DLQ, none of it alarmed

This is the register open question B4 / C11d-2 (*an abandoned lane is silent — is that acceptable?*), answered
with measurements rather than reasoning.

### 8a. Two production queues have a backlog and have NEVER been consumed

`ceragon-production-verdict-write` — over a **60-day** window:

```
NumberOfMessagesSent      60d = 115.0
NumberOfMessagesReceived  60d = 0.0
NumberOfMessagesDeleted   60d = 0.0
current depth: vis=115 inflight=0 delayed=0
created: 2026-08-14
```

**115 messages produced, zero ever received, zero ever deleted.** The queue was created on 2026-08-14 and has
never had a consumer. It has no Lambda event source mapping and no ECS consumer.

`ceragon-production-rescan-plan` — 14-day window:

```
NumberOfMessagesSent      14d = 81.0
NumberOfMessagesReceived  14d = 0.0
NumberOfMessagesDeleted   14d = 0.0
current depth: vis=79
```

**Neither queue raises anything** — per section 5, zero alarms reference `ceragon-production`. This is the
"abandoned lane that raises no alarm" the register asks about, now with a name and a number: it is real, it is
happening today, on two lanes.

### 8b. A 283-message production DLQ that nothing watches

```
ceragon-production-intel-static-jobs-dlq                    vis=283 inflight=0 delayed=0
```

For scale: the *staging* DLQ holding **1** message fires `cera-fetch_jobs_dlq-staging-nonzero` to SNS. The
production DLQ holding **283** fires nothing, because no alarm exists for it.

### 8c. Full queue depth census (34 queues)

```
cera-fetch_jobs-staging                                    vis=0   inflight=0
cera-fetch_jobs_dlq-staging                                vis=1   inflight=0
cera-fetch_jobs_exec_now-staging                           vis=0   inflight=0
cera-sandbox_jobs-staging                                  vis=0   inflight=0
cera-sandbox_jobs_dlq-staging                              vis=0   inflight=0
cera-sandbox_jobs_exec_now-staging                         vis=0   inflight=0
ceragon-production-analysis-dynamic-background             vis=0   inflight=0
ceragon-production-analysis-dynamic-background-dlq         vis=0   inflight=0
ceragon-production-analysis-static-background              vis=1   inflight=0
ceragon-production-analysis-static-background-dlq          vis=0   inflight=0
ceragon-production-artifact-fetch-background               vis=0   inflight=0
ceragon-production-artifact-fetch-background-dlq           vis=2   inflight=0
ceragon-production-intel-dynamic-jobs                      vis=2   inflight=0
ceragon-production-intel-dynamic-jobs-dlq                  vis=0   inflight=0
ceragon-production-intel-dynamic-jobs-windows              vis=0   inflight=0
ceragon-production-intel-dynamic-jobs-windows-dlq          vis=0   inflight=0
ceragon-production-intel-result-write                      vis=0   inflight=0
ceragon-production-intel-result-write-dlq                  vis=0   inflight=0
ceragon-production-intel-static-jobs                       vis=0   inflight=0
ceragon-production-intel-static-jobs-dlq                   vis=283 inflight=0   <-- unalarmed
ceragon-production-metadata-only                           vis=0   inflight=0
ceragon-production-metadata-only-dlq                       vis=0   inflight=0
ceragon-production-release-observation                     vis=0   inflight=0
ceragon-production-release-observation-dlq                 vis=0   inflight=0
ceragon-production-rescan-plan                             vis=79  inflight=0   <-- no consumer
ceragon-production-rescan-plan-dlq                         vis=0   inflight=0
ceragon-production-verdict-write                           vis=115 inflight=0   <-- no consumer, ever
ceragon-production-verdict-write-dlq                       vis=0   inflight=0
codefence-scan-processor-dlq.fifo                          vis=0   inflight=0
codefence-scan-processor.fifo                              vis=0   inflight=0
codefence-scanner-fullrepo-jobs-dlq.fifo                   vis=0   inflight=0
codefence-scanner-fullrepo-jobs.fifo                       vis=0   inflight=0
codefence-scanner-jobs-dlq.fifo                            vis=0   inflight=0
codefence-scanner-jobs.fifo                                vis=0   inflight=0
```

### 8d. An unexplained gap on `ceragon-production-release-observation` — reported, not diagnosed

```
14-day totals:  sent = 1,215,817   received = 7,410   deleted = 7,394
current depth:  0
DLQ depth:      0
MessageRetentionPeriod: 1209600 s (14 days)   LastModified: 2026-08-17

daily:  2026-08-14  sent=162,681  received=0
        2026-08-15  sent= 77,064  received=5,365
        2026-08-16  sent=      0  received=0
        2026-08-17  sent=      0  received=0
```

Roughly 1.2 million messages were sent in the window and about 7,400 were consumed, yet the queue now stands at
zero with an empty DLQ, and 14-day retention has not elapsed for the 240k sent on 14-15 Aug. **I could not
account for the difference from read-only telemetry** and will not invent a mechanism for it — a `PurgeQueue`, a
retention change (the queue attributes were modified on 2026-08-17), or a metrics artefact would each explain
it, and I cannot distinguish them without CloudTrail. **Flagged as an open question, verdict BLOCKED**, with the
exact next step below.

```bash
# NOT RUN - CloudTrail lookup to distinguish purge from attribute change (read-only, but outside this scope):
aws cloudtrail lookup-events --region eu-north-1 \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=ceragon-production-release-observation \
  --start-time 2026-08-13 --end-time 2026-08-18
```

---

## 9. Not exercised — stated plainly

These were **not** verified, with the reason:

- **Hetzner itself.** Out of AWS entirely; no credential for it in this environment. Its liveness is inferred
  from queue consumption (section 6), which is evidence that *something* off-AWS consumes, not proof of which
  host.
- **Secret VALUES.** Deliberately never read. Presence is proven by task-definition wiring plus the fact that
  the backend boots and serves 200 — not by reading any parameter.
- **The `release-observation` 1.2M-message gap** — BLOCKED, see 8d; needs CloudTrail.
- **Whether the 283 DLQ messages are one recurring failure or 283 distinct ones.** Reading them requires
  `sqs receive-message`, which mutates visibility. Not performed.
- **RDS / database posture.** Not in register section C; not inspected.
- **`AUDIT_RETENTION_DAYS` real-world effect.** The 30-day default is read from source
  (`fix-specs/BACKENDOPS.md:433` citing `audit-retention.service.ts:92-101`), not measured against the live
  `audit_events` table — the prod DB is private with no bastion, so no query was possible from here.

---

## 10. Corrections the register itself needs

1. **Section C: "Add `CF_BUILD_SHA`/`CF_BUILD_TIME` on the ECS task definition"** — delete this instruction. It
   is the defect `d79b8ac0` fixed. The task definition must stay silent; the image is the authority. (1.5)
2. **#20 "the running backend cannot say what build it is"** — no longer true for the sha; PROVEN closed live.
   Only `buildTime` remains, and its fix is an unpushed commit, not an ops action. (1.4)
3. **Section C "`RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant"** — the grant already exists. The real
   blocker is that no complete manifest is published, which is a pipeline item, not an ops item. (4)
4. **`CLAUDE.md:41` is stale and dangerous.** It names `cera-artifact_analysis_cache-production` as the table
   Backend reads; the SOT says the staging-*named* table is the live production cache and that "fixing" the name
   would trigger a re-analysis storm. This document's first revision fell for it and recorded a false FAIL —
   retracted in (3). Amend `CLAUDE.md` so the next reader does not.
5. **B4 / C11d-2 is answered:** consumer-less lanes are real and silent today —
   `ceragon-production-verdict-write` (115 msgs, never consumed) and `ceragon-production-rescan-plan` (79), plus
   a 283-message unalarmed production DLQ. (8)
