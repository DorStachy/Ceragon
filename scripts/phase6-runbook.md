# Phase 6 — Operational Cleanup Readiness Runbook

Source-of-truth for the operational steps in [docs/CERAGON_SCANNER_ISSUE_FIX_PLAN_2026-05-06.md](../docs/CERAGON_SCANNER_ISSUE_FIX_PLAN_2026-05-06.md) Phase 6. The companion script is [phase6-cleanup-readiness.ps1](phase6-cleanup-readiness.ps1).

## Goal

Prepare the production environment for Phase 7 scoped data cleanup so that cleanup writes do not race with active workers or background reapers. The acceptance gate is "cleanup will not race workers or background reapers."

## Pre-flight

- AWS profile `production` configured with read+write access to ECS/Lambda/SQS in `eu-north-1`.
- Maintenance window declared in `#ops` channel.
- The retest plan from Phase 8 ([phase8-retest-template.md](phase8-retest-template.md)) is ready to drive load after restore.

## Step 1: Sandbox worker strategy decision

Two options for sandbox-worker readiness during retest:

| Mode | When to use | Trade-off |
|---|---|---|
| **Pinned desired=1** | Default. Retest needs predictable sandbox throughput. | Constant cost during retest; no wake-up latency. |
| **Wake-up path test** | Validating the production scale-from-zero behavior. | Adds 60-180s wake-up latency to first sandbox-escalated package; surfaces wake-up bugs. |

Decide before draining. Record the choice in the run log.

## Step 2: Snapshot pre-cleanup state

```powershell
./phase6-cleanup-readiness.ps1
```

Read-only. Outputs `phase6-readiness-state-<timestamp>.json` containing:
- ECS service desired/running counts (fetch-worker, sandbox-worker, static-worker)
- Lambda ESM state for stale-analysis reaper, result-fanout, intel-result-writer
- SQS depths (visible, in-flight, delayed) for all 4 production queues

Inspect the state file and confirm baselines match expectations. Commit the file to the run log directory.

## Step 3: Drain workers and pause reaper

```powershell
./phase6-cleanup-readiness.ps1 -Drain -DrainTimeoutSeconds 600
```

Execution order (script-enforced):
1. Disable Lambda event-source mappings for the stale-analysis reaper FIRST (otherwise it would race the ECS drain by re-issuing work).
2. Scale ECS services to `desired=0` (workers stop accepting new SQS messages; in-flight work continues).
3. Poll SQS `ApproximateNumberOfMessagesNotVisible` until it reaches 0 across all 4 queues, or until `-DrainTimeoutSeconds` elapses.

**Drain timeout escalation**: if the timeout fires with non-zero in-flight, the script emits a warning but does NOT proceed. Investigate which queue has stuck messages (likely a hung worker or DLQ candidate) before continuing.

## Step 4: Cleanup gate verification

Before invoking Phase 7 cleanup, verify:
- ECS `runningCount` is 0 for all three workers.
- All 4 SQS queues report `inFlight=0`, `visible=0`.
- Stale-analysis reaper Lambda is `Disabled` per AWS console.
- DLQ depths are recorded as cleanup baseline (Phase 7 needs them to detect cleanup-induced DLQ pressure).

If any of these are not true, abort and investigate.

## Step 5: Restore after Phase 7 completes

```powershell
./phase6-cleanup-readiness.ps1 -RestoreFrom phase6-readiness-state-<timestamp>.json
```

Restores ECS desired counts and re-enables Lambda ESMs to their pre-drain state. Idempotent.

## Cleanup manifest

The state file IS the cleanup manifest. Phase 7 reads it for backup paths and pre-cleanup queue depths. Do not edit by hand; treat as audit evidence.

## Failure modes

| Symptom | Likely cause | Recovery |
|---|---|---|
| Drain timeout with one queue stuck >0 inFlight | Hung worker holding visibility timeout | Force ECS task stop; messages return to queue; re-drain. |
| Restore fails for one ECS service | Service was deleted or renamed mid-window | Manually update via AWS console; record drift in run log. |
| Reaper re-enabled itself | An autoscaling rule or external automation | Identify the controller, gate it, then retry drain. |
