# ─────────────────────────────────────────────────────────────────────────────
# Phase 6 (P6 fix-plan 2026-05-06): Operational Cleanup Readiness
#
# Prepares the production environment for the Phase 7 scoped-data cleanup by
# (a) snapshotting the controllers we will pause and (b) draining the queues
# so cleanup writes don't race with active workers or background reapers.
#
# Output: a JSON state file `phase6-readiness-state-<timestamp>.json` in the
# script directory, capturing every controller's pre-cleanup state. Phase 7
# uses that file as both an audit trail and a restore reference.
#
# This script is IDEMPOTENT and READ-ONLY by default. Pass `-Drain` to
# actually pause workers and pass `-RestoreFrom <state-file>` to undo a prior
# drain.
#
# Plan tasks (file 6 of 8):
#   1. Decide sandbox worker strategy for retest (pinned desired=1 vs wake-up
#      path test). This script captures the pre-cleanup state for both modes
#      so the operator can pick after seeing the snapshot.
#   2. Snapshot ECS and Lambda ESM state.
#   3. Pause/drain workers when -Drain is set.
#   4. Wait for SQS in-flight messages to reach zero.
#   5. Pause stale-analysis reaper Lambda(s).
#   6. Prepare cleanup manifest and backup paths.
# ─────────────────────────────────────────────────────────────────────────────

param(
  [switch]$Drain,
  [string]$RestoreFrom = '',
  [string]$Region = 'eu-north-1',
  [string]$Profile = 'production',
  [int]$DrainTimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$stateFile = Join-Path $scriptDir "phase6-readiness-state-$timestamp.json"

function Get-EcsService {
  param([string]$Cluster, [string]$Service)
  # Output: { cluster, service, desiredCount, runningCount, autoscalingTargets }
  $desc = aws ecs describe-services `
    --cluster $Cluster `
    --services $Service `
    --region $Region `
    --profile $Profile `
    --query 'services[0].{desired:desiredCount,running:runningCount,status:status}' `
    --output json | ConvertFrom-Json
  return [PSCustomObject]@{
    cluster      = $Cluster
    service      = $Service
    desiredCount = $desc.desired
    runningCount = $desc.running
    status       = $desc.status
  }
}

function Get-LambdaEsmState {
  param([string]$FunctionName)
  $mappings = aws lambda list-event-source-mappings `
    --function-name $FunctionName `
    --region $Region `
    --profile $Profile `
    --query 'EventSourceMappings[].{uuid:UUID,arn:EventSourceArn,state:State,enabled:State}' `
    --output json | ConvertFrom-Json
  return $mappings
}

function Get-SqsDepth {
  param([string]$QueueUrl)
  $attrs = aws sqs get-queue-attributes `
    --queue-url $QueueUrl `
    --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible ApproximateNumberOfMessagesDelayed `
    --region $Region `
    --profile $Profile `
    --query 'Attributes' `
    --output json | ConvertFrom-Json
  return [PSCustomObject]@{
    queueUrl   = $QueueUrl
    visible    = [int]$attrs.ApproximateNumberOfMessages
    inFlight   = [int]$attrs.ApproximateNumberOfMessagesNotVisible
    delayed    = [int]$attrs.ApproximateNumberOfMessagesDelayed
  }
}

# ─── Restore-from-state flow (-RestoreFrom <state-file>) ────────────────────
if ($RestoreFrom) {
  if (-not (Test-Path $RestoreFrom)) {
    throw "Restore state file not found: $RestoreFrom"
  }
  Write-Host "Restoring from: $RestoreFrom" -ForegroundColor Cyan
  $state = Get-Content $RestoreFrom -Raw | ConvertFrom-Json

  foreach ($svc in $state.ecsServices) {
    if ($svc.drained -and $svc.preDrainDesiredCount -gt 0) {
      Write-Host "Restoring ECS $($svc.cluster)/$($svc.service) → desired=$($svc.preDrainDesiredCount)" -ForegroundColor Yellow
      aws ecs update-service `
        --cluster $svc.cluster `
        --service $svc.service `
        --desired-count $svc.preDrainDesiredCount `
        --region $Region `
        --profile $Profile | Out-Null
    }
  }
  foreach ($esm in $state.lambdaEsm) {
    if ($esm.disabled -and $esm.preDisableState -eq 'Enabled') {
      Write-Host "Re-enabling Lambda ESM $($esm.uuid)" -ForegroundColor Yellow
      aws lambda update-event-source-mapping `
        --uuid $esm.uuid `
        --enabled `
        --region $Region `
        --profile $Profile | Out-Null
    }
  }
  Write-Host "Restore complete." -ForegroundColor Green
  return
}

# ─── Snapshot phase (always runs) ────────────────────────────────────────────
Write-Host "Phase 6: Capturing pre-cleanup state..." -ForegroundColor Cyan

$ecsServices = @(
  Get-EcsService -Cluster 'cera-production' -Service 'fetch-worker',
  Get-EcsService -Cluster 'cera-production' -Service 'sandbox-worker',
  Get-EcsService -Cluster 'cera-production' -Service 'static-worker'
)

$lambdaEsm = @()
foreach ($fn in @('cera-stale-analysis-reaper', 'cera-result-fanout', 'cera-intel-result-writer')) {
  $lambdaEsm += Get-LambdaEsmState -FunctionName $fn
}

$queueUrls = @(
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-fetch-jobs-production',
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-sandbox-jobs-production',
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-sandbox-exec-now-production',
  'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-intel-result-write-production'
)
$sqsDepths = @()
foreach ($q in $queueUrls) { $sqsDepths += Get-SqsDepth -QueueUrl $q }

$state = [ordered]@{
  capturedAt   = (Get-Date).ToString('o')
  region       = $Region
  profile      = $Profile
  ecsServices  = $ecsServices | ForEach-Object {
    [ordered]@{
      cluster              = $_.cluster
      service              = $_.service
      preDrainDesiredCount = $_.desiredCount
      runningCount         = $_.runningCount
      status               = $_.status
      drained              = $false
    }
  }
  lambdaEsm    = $lambdaEsm | ForEach-Object {
    [ordered]@{
      uuid             = $_.uuid
      arn              = $_.arn
      preDisableState  = $_.state
      disabled         = $false
    }
  }
  sqsDepths    = $sqsDepths | ForEach-Object {
    [ordered]@{
      queueUrl = $_.queueUrl
      visible  = $_.visible
      inFlight = $_.inFlight
      delayed  = $_.delayed
    }
  }
}

# ─── Drain phase (only when -Drain is set) ──────────────────────────────────
if ($Drain) {
  Write-Host "DRAIN MODE — pausing workers, then waiting for SQS depths to reach 0" -ForegroundColor Yellow

  # Phase 6 task 5: Pause stale-analysis reaper FIRST so it doesn't fight the
  # cleanup. Disabling the ESM stops the lambda from being invoked; the
  # function code remains deployed and can be re-enabled by RestoreFrom.
  foreach ($esm in $state.lambdaEsm) {
    if ($esm.preDisableState -eq 'Enabled') {
      Write-Host "Disabling Lambda ESM $($esm.uuid) ($($esm.arn))" -ForegroundColor Yellow
      aws lambda update-event-source-mapping `
        --uuid $esm.uuid `
        --no-enabled `
        --region $Region `
        --profile $Profile | Out-Null
      $esm.disabled = $true
    }
  }

  # Phase 6 task 3: Drain ECS workers to desiredCount=0.
  foreach ($svc in $state.ecsServices) {
    if ($svc.preDrainDesiredCount -gt 0) {
      Write-Host "Scaling ECS $($svc.cluster)/$($svc.service) → desired=0" -ForegroundColor Yellow
      aws ecs update-service `
        --cluster $svc.cluster `
        --service $svc.service `
        --desired-count 0 `
        --region $Region `
        --profile $Profile | Out-Null
      $svc.drained = $true
    }
  }

  # Phase 6 task 4: Wait for SQS in-flight messages to reach zero (with timeout).
  $deadline = (Get-Date).AddSeconds($DrainTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $totalInFlight = 0
    foreach ($q in $queueUrls) {
      $d = Get-SqsDepth -QueueUrl $q
      $totalInFlight += $d.inFlight
    }
    if ($totalInFlight -eq 0) {
      Write-Host "SQS in-flight reached 0 — drain complete" -ForegroundColor Green
      break
    }
    Write-Host "Waiting for SQS in-flight to drain (current: $totalInFlight)..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 10
  }
  if ((Get-Date) -ge $deadline) {
    Write-Warning "Drain timeout reached. Some messages may still be in-flight. Inspect $stateFile and decide whether to proceed."
  }
}

# ─── Persist state file (cleanup manifest + restore reference) ───────────────
$state | ConvertTo-Json -Depth 6 | Out-File -FilePath $stateFile -Encoding utf8
Write-Host "Phase 6 state captured: $stateFile" -ForegroundColor Green
Write-Host "Phase 7 will reference this file as the pre-cleanup baseline." -ForegroundColor Cyan
if (-not $Drain) {
  Write-Host "READ-ONLY mode (no drain performed). Add -Drain to pause workers." -ForegroundColor Yellow
}
