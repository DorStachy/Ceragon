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
| C-2b | `DYNAMODB_ARTIFACT_CACHE_TABLE` points at production | **FAIL — bound to the STAGING table** |
| C-3 | `RELEASE_MANIFEST_PATH` + its `s3:GetObject` grant | **FAIL — unset (honest 503)** |
| C-4 | CloudWatch alarms | **FAIL — no alarm on any register-named lane** |
| C-5 | Hetzner / intel ECS at 0/0 | **PASS — expected state** |
| C-6 | `CODEFENCE_SIGNING_MASTER_KEY` present | **PASS** |
| C-6b | AI prompt-evidence Lane B keys | **FAIL — still absent, 26 revisions on** |
| C-7 | Lambda event source mappings | *see §6* |
| C-8 | Queues with no consumer | *see §7* |

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

### C-2b `DYNAMODB_ARTIFACT_CACHE_TABLE` — VERDICT: FAIL — **production is bound to the STAGING table**

Not on the register. Found during this inspection.

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

`AWS_INFRASTRUCTURE_SOURCE_OF_TRUTH` / `CLAUDE.md` name `cera-artifact_analysis_cache-production` as the table
Backend reads. The production backend is instead reading **staging's 1360 rows**, while the production table sits
empty. `fix-specs/BACKENDOPS.md:545` predicted exactly this shape: *"dynamodb-cache.service.ts:644 reads
`DYNAMODB_ARTIFACT_CACHE_TABLE` with no environment assertion at all, so it will happily attach to a staging
table name and log 'DynamoDB connectivity VERIFIED' against it."* Live `/api/v1/health` reports
`"dynamodb": true` — the health surface confirms connectivity to *a* table and cannot tell you it is the wrong
one.

Needs an owner call before any write: repointing production at the empty production table moves the cache from
*wrong-environment data* to *no data*, which changes install-time behaviour. **Flagged, not fixed.**

```bash
# NOT RUN. Same register/update-service sequence as C-1, setting
#   DYNAMODB_ARTIFACT_CACHE_TABLE=cera-artifact_analysis_cache-production
# Decide FIRST whether the production table is backfilled before the switch.
```
