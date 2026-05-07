# Phase 7 — Scoped Data Cleanup Runbook

Companion script: [phase7-scoped-cleanup.ps1](phase7-scoped-cleanup.ps1). Pre-requisite: [Phase 6](phase6-runbook.md) must have completed and produced a baseline state file.

## Goal

Delete only the rows scoped to the test tenant/site/window so the next retest starts from a clean tenant view, while preserving shared package intelligence and any rows that fall outside the test window.

Acceptance gate: UI Dependencies / Script Forensics / Alerts / Licenses show no stale scoped rows; queues are `0 visible / 0 in-flight / 0 delayed`.

## Cleanup rules (from the plan)

1. **Never delete whole tables.** All operations are scoped by `org_id` plus optional `site_id` and a test window.
2. **Tenant rows first.** `analysis`, `finding`, `alert`, `license_issue`, `script_record`, `tenant_decision`.
3. **Preserve shared intelligence.** `package_forensics` is shared across orgs — never delete unless explicitly approved per-coordinate.
4. **DynamoDB cache cleanup is opt-in.** Only delete exact coordinates when fresh reprocessing is required.
5. **Backup before delete.** Every targeted table is exported to S3 backup BEFORE any DELETE.
6. **Record before/after counts.** Output to a JSON report file for the run log.

## Pre-flight

- Phase 6 readiness state file present and committed.
- `psql` client installed; `CERA_RDS_HOST` env var set or `-RdsHost` provided.
- `AWS_PROFILE=production` configured.
- Operator has approval to proceed (data deletion).

## Step 1: Dry-run

```powershell
./phase7-scoped-cleanup.ps1 `
  -BaselineFile phase6-readiness-state-<ts>.json `
  -TenantId 'a0000000-...-test-org' `
  -TestWindowStart '2026-05-06T00:00:00Z' `
  -TestWindowEnd '2026-05-07T00:00:00Z'
```

Outputs `phase7-cleanup-report-<ts>.json` with before-counts and a list of DELETE statements that WOULD be executed. Review carefully:
- Confirm the tenant ID matches the intended test org.
- Confirm before-counts are non-zero for tables expected to have test data.
- Confirm before-counts are zero for tables the test should not have populated.

## Step 2: Apply

When the dry-run looks correct:

```powershell
./phase7-scoped-cleanup.ps1 `
  -BaselineFile phase6-readiness-state-<ts>.json `
  -TenantId 'a0000000-...-test-org' `
  -TestWindowStart '2026-05-06T00:00:00Z' `
  -TestWindowEnd '2026-05-07T00:00:00Z' `
  -Apply
```

Order of operations (script-enforced):
1. Backup all 6 tenant-scoped tables to `s3://cera-cleanup-backups-production/phase7-cleanup-<ts>/`
2. Delete in dependency order: `finding` → `alert` → `license_issue` → `script_record` → `tenant_decision` → `analysis` (children before parents).
3. `package_forensics` is **explicitly preserved** (shared intelligence).
4. Snapshot DLQs to S3 before optionally purging.
5. Record after-counts.

## Step 3: Optional — DynamoDB cache cleanup

Only when fresh worker re-execution is required. Build a coordinates file:

```json
[
  { "ecosystem": "npm", "integrity": "sha512-..." },
  { "ecosystem": "pypi", "integrity": "sha256-..." }
]
```

Then run:

```powershell
./phase7-scoped-cleanup.ps1 `
  -BaselineFile phase6-readiness-state-<ts>.json `
  -TenantId 'a0000000-...-test-org' `
  -CoordinatesFile coords.json `
  -PurgeCache `
  -Apply
```

## Step 4: Optional — DLQ purge

After the snapshot is verified in S3, purge the DLQs to start the retest with empty failure queues:

```powershell
./phase7-scoped-cleanup.ps1 ... -PurgeDLQ -Apply
```

## Step 5: Verification

Cleanup gate — confirm BEFORE re-enabling Phase 6 controllers:
- The cleanup report shows `afterCounts == 0` for every tenant-scoped table.
- `package_forensics` counts are unchanged for the test coordinates (shared intelligence preserved).
- DLQs report 0 visible after the optional purge.
- The S3 backup prefix contains all 6 backup JSON files.

## Step 6: Restore Phase 6 controllers

```powershell
./phase6-cleanup-readiness.ps1 -RestoreFrom phase6-readiness-state-<ts>.json
```

## Failure modes

| Symptom | Cause | Recovery |
|---|---|---|
| `psql` connection refused | `CERA_RDS_HOST` wrong or VPN not connected | Reconnect; re-run dry-run. |
| Backup S3 upload fails | Bucket missing or IAM denial | Create bucket `cera-cleanup-backups-production` or fix IAM. |
| `before-count` shows 0 for `analysis` | Wrong tenant ID or wrong test window | STOP. Verify scope before continuing. |
| Foreign-key constraint error during DELETE | Dependency order disagrees with current schema | Add the failing table to `$deleteOrder` array in dependency order. |

## Restore from backup

```powershell
# Each table backed up as a JSON-per-line file. Restore via psql COPY.
aws s3 cp s3://cera-cleanup-backups-production/phase7-cleanup-<ts>/analysis.json .
psql -h $CERA_RDS_HOST -d ceragon -c "\\copy analysis FROM 'analysis.json' WITH (FORMAT json)"
```

In practice, write per-table `\copy` statements ahead of time in a separate `phase7-restore.sql` and review with the on-call DBA.
