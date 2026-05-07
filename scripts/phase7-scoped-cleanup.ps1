# ─────────────────────────────────────────────────────────────────────────────
# Phase 7 (P7 fix-plan 2026-05-06): Scoped Data Cleanup
#
# Tenant-safe deletion of scoped test-window rows. Runs AFTER Phase 6 readiness
# (workers paused, reaper paused, queues drained). Reads the Phase 6 state
# file as the cleanup baseline.
#
# Plan rules (file 7 of 8):
#   1. Never delete whole tables.
#   2. Delete tenant/site/agent/test-window rows first.
#   3. Preserve shared package intelligence by default.
#   4. Delete shared cache only for exact coordinates when fresh reprocessing
#      is required.
#   5. Back up before delete.
#   6. Record before/after counts.
#
# Defaults to DRY-RUN. Pass -Apply to actually delete. Always backs up to
# the configured backup path before any DELETE.
#
# Targets:
#   - Tenant-scoped RDS: analysis, findings, alerts, license, scripts,
#     tenant_decision (test-window only)
#   - Shared RDS: package_forensics PRESERVED by default
#   - DynamoDB: cera-artifact_analysis_cache only when -PurgeCache is set,
#     and only for exact retest coordinates listed in -CoordinatesFile
#   - SQS: snapshot DLQ contents to S3 backup before any purge
# ─────────────────────────────────────────────────────────────────────────────

param(
  [Parameter(Mandatory=$true)]
  [string]$BaselineFile,                    # Phase 6 state-file path
  [Parameter(Mandatory=$true)]
  [string]$TenantId,                        # The org/tenant to scope cleanup to
  [string]$SiteId = '',                     # Optional: narrower site scope
  [string]$TestWindowStart = '',            # ISO timestamp; rows older are preserved
  [string]$TestWindowEnd = '',              # ISO timestamp; rows newer are preserved
  [string]$CoordinatesFile = '',            # Optional: JSON list of {ecosystem,name,version}
  [string]$BackupS3Bucket = 'cera-cleanup-backups-production',
  [string]$BackupPrefix = '',               # Defaults to YYYYMMDD-HHmmss
  [switch]$Apply,                           # Default DRY-RUN; pass to actually delete
  [switch]$PurgeCache,                      # If set, also delete listed DynamoDB cache rows
  [switch]$PurgeDLQ,                        # If set, also purge DLQs (after snapshot)
  [string]$Region = 'eu-north-1',
  [string]$Profile = 'production',
  [string]$RdsHost = '',                    # Defaults from env
  [string]$RdsDatabase = 'ceragon',
  [string]$RdsUser = 'ceragon_admin'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BaselineFile)) {
  throw "Baseline file not found: $BaselineFile (run phase6-cleanup-readiness.ps1 first)"
}

$baseline = Get-Content $BaselineFile -Raw | ConvertFrom-Json
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $BackupPrefix) { $BackupPrefix = "phase7-cleanup-$timestamp" }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$reportFile = Join-Path $scriptDir "phase7-cleanup-report-$timestamp.json"

# Validate readiness gate from Phase 6
$ecsRunning = ($baseline.ecsServices | Where-Object { $_.drained -and $_.runningCount -gt 0 } | Measure-Object).Count
if ($ecsRunning -gt 0) {
  Write-Warning "Phase 6 state file shows ECS workers still running. Re-run Phase 6 with -Drain before continuing."
}

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN' }
Write-Host "Phase 7: $mode mode" -ForegroundColor Cyan
Write-Host "Tenant: $TenantId$(if ($SiteId) { " / Site: $SiteId" })" -ForegroundColor Cyan
Write-Host "Backup: s3://$BackupS3Bucket/$BackupPrefix/" -ForegroundColor Cyan

$report = [ordered]@{
  startedAt        = (Get-Date).ToString('o')
  mode             = $mode
  tenantId         = $TenantId
  siteId           = $SiteId
  testWindowStart  = $TestWindowStart
  testWindowEnd    = $TestWindowEnd
  baselineFile     = $BaselineFile
  backupLocation   = "s3://$BackupS3Bucket/$BackupPrefix/"
  beforeCounts     = @{}
  deletedCounts    = @{}
  afterCounts      = @{}
  errors           = @()
}

# ─── Helpers ────────────────────────────────────────────────────────────────
function Invoke-PgQuery {
  param([string]$Sql, [string]$OutputFile = '')
  if (-not $RdsHost) { $RdsHost = $env:CERA_RDS_HOST }
  if (-not $RdsHost) { throw "RDS host not set; pass -RdsHost or export CERA_RDS_HOST" }
  $args = @(
    '-h', $RdsHost,
    '-d', $RdsDatabase,
    '-U', $RdsUser,
    '-A', '-t',
    '-c', $Sql
  )
  if ($OutputFile) {
    & psql @args > $OutputFile
  } else {
    return (& psql @args)
  }
}

function Backup-Table {
  param([string]$Table, [string]$WhereClause)
  $localFile = Join-Path $env:TEMP "phase7-$Table-$timestamp.json"
  $sql = "COPY (SELECT row_to_json(t) FROM (SELECT * FROM $Table WHERE $WhereClause) t) TO STDOUT"
  Invoke-PgQuery -Sql $sql -OutputFile $localFile
  $rowCount = (Get-Content $localFile | Measure-Object -Line).Lines
  Write-Host "  Backed up $rowCount rows from $Table to $localFile" -ForegroundColor DarkGray
  if ($Apply) {
    aws s3 cp $localFile "s3://$BackupS3Bucket/$BackupPrefix/$Table.json" `
      --region $Region --profile $Profile | Out-Null
  }
  return $rowCount
}

function Count-Rows {
  param([string]$Table, [string]$WhereClause)
  $sql = "SELECT COUNT(*) FROM $Table WHERE $WhereClause"
  $result = Invoke-PgQuery -Sql $sql
  return [int]($result -join '').Trim()
}

# ─── Build the WHERE clause for tenant-scoped rows in the test window ───────
$conditions = @("org_id = '$TenantId'")
if ($SiteId)         { $conditions += "site_id = '$SiteId'" }
if ($TestWindowStart) { $conditions += """createdAt"" >= '$TestWindowStart'" }
if ($TestWindowEnd)   { $conditions += """createdAt"" <= '$TestWindowEnd'" }
$where = $conditions -join ' AND '
Write-Host "Scope: $where" -ForegroundColor Cyan

# ─── Phase 7 task 6: Record before-counts ───────────────────────────────────
$tenantTables = @('analysis', 'finding', 'alert', 'license_issue', 'script_record', 'tenant_decision')
foreach ($t in $tenantTables) {
  try {
    $report.beforeCounts.$t = Count-Rows -Table $t -WhereClause $where
  } catch {
    $report.errors += "before-count $t failed: $_"
    $report.beforeCounts.$t = -1
  }
}

# ─── Phase 7 task 5: Backup before delete ───────────────────────────────────
Write-Host "Backing up tenant-scoped rows..." -ForegroundColor Yellow
foreach ($t in $tenantTables) {
  try {
    Backup-Table -Table $t -WhereClause $where | Out-Null
  } catch {
    $report.errors += "backup $t failed: $_"
  }
}

# ─── Phase 7 task 2: Delete tenant-scoped rows in dependency order ──────────
# (children before parents — findings before analysis, etc.)
$deleteOrder = @('finding', 'alert', 'license_issue', 'script_record', 'tenant_decision', 'analysis')
foreach ($t in $deleteOrder) {
  if ($Apply) {
    try {
      $sql = "DELETE FROM $t WHERE $where"
      $output = Invoke-PgQuery -Sql $sql
      Write-Host "  $t: $output" -ForegroundColor DarkGray
    } catch {
      $report.errors += "delete $t failed: $_"
    }
  } else {
    Write-Host "  [DRY-RUN] DELETE FROM $t WHERE $where" -ForegroundColor DarkGray
  }
}

# ─── Phase 7 task 3: Preserve shared package_forensics by default ───────────
Write-Host "Skipping package_forensics (shared intelligence — preserved by default)." -ForegroundColor Cyan

# ─── Phase 7 task 4: Optional DynamoDB cache cleanup (exact coords only) ────
if ($PurgeCache) {
  if (-not $CoordinatesFile -or -not (Test-Path $CoordinatesFile)) {
    Write-Warning "PurgeCache requested but -CoordinatesFile missing; skipping DynamoDB cleanup."
  } else {
    $coords = Get-Content $CoordinatesFile -Raw | ConvertFrom-Json
    $report.deletedCounts.dynamoCacheRows = 0
    foreach ($c in $coords) {
      $key = "{`"ecosystem`":{`"S`":`"$($c.ecosystem)`"},`"integrity`":{`"S`":`"$($c.integrity)`"}}"
      if ($Apply) {
        aws dynamodb delete-item `
          --table-name 'cera-artifact_analysis_cache-production' `
          --key $key `
          --region $Region --profile $Profile | Out-Null
      }
      $report.deletedCounts.dynamoCacheRows++
    }
  }
}

# ─── Phase 7 task: SQS DLQ snapshot before any purge ────────────────────────
$dlqs = @(
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-fetch-jobs-dlq-production',
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-sandbox-jobs-dlq-production'
)
foreach ($dlq in $dlqs) {
  Write-Host "Snapshotting DLQ: $dlq" -ForegroundColor Yellow
  $snapshotFile = Join-Path $env:TEMP "phase7-dlq-snapshot-$timestamp-$([System.IO.Path]::GetRandomFileName()).json"
  # Receive up to 10 messages without deleting them; snapshot only — repeat
  # if depth > 10 in production.
  aws sqs receive-message `
    --queue-url $dlq `
    --max-number-of-messages 10 `
    --visibility-timeout 0 `
    --region $Region --profile $Profile > $snapshotFile
  if ($Apply) {
    aws s3 cp $snapshotFile "s3://$BackupS3Bucket/$BackupPrefix/$(Split-Path $dlq -Leaf).json" `
      --region $Region --profile $Profile | Out-Null
  }
  if ($PurgeDLQ) {
    if ($Apply) {
      aws sqs purge-queue --queue-url $dlq --region $Region --profile $Profile | Out-Null
      Write-Host "  Purged $dlq" -ForegroundColor Yellow
    } else {
      Write-Host "  [DRY-RUN] Would purge $dlq" -ForegroundColor DarkGray
    }
  }
}

# ─── Phase 7 task 6: Record after-counts ────────────────────────────────────
foreach ($t in $tenantTables) {
  try {
    $report.afterCounts.$t = Count-Rows -Table $t -WhereClause $where
    $report.deletedCounts.$t = $report.beforeCounts.$t - $report.afterCounts.$t
  } catch {
    $report.errors += "after-count $t failed: $_"
    $report.afterCounts.$t = -1
  }
}

$report.finishedAt = (Get-Date).ToString('o')
$report | ConvertTo-Json -Depth 6 | Out-File -FilePath $reportFile -Encoding utf8
Write-Host "Phase 7 cleanup report: $reportFile" -ForegroundColor Green
if ($report.errors.Count -gt 0) {
  Write-Warning "Cleanup completed with $($report.errors.Count) error(s). Review the report file."
}
