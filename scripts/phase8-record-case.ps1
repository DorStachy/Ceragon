# ─────────────────────────────────────────────────────────────────────────────
# Phase 8 (P8 fix-plan 2026-05-06): record one retest case.
#
# Wraps a CLI scan invocation so the operator captures expected vs observed
# values into the run log. Outputs JSON conforming to the schema in
# phase8-retest-template.md.
#
# Example:
#   ./phase8-record-case.ps1 `
#     -CaseId '1-npm-safe-install' `
#     -ExpectedRuntimeAction 'ALLOW' `
#     -ScanCommand 'npm install is-number@7.0.0' `
#     -FixturePath 'fixtures/npm-safe' `
#     -RunDir scripts/phase8-runs/2026-05-07
# ─────────────────────────────────────────────────────────────────────────────

param(
  [Parameter(Mandatory=$true)] [string]$CaseId,
  [Parameter(Mandatory=$true)] [string]$ScanCommand,
  [Parameter(Mandatory=$true)] [string]$ExpectedRuntimeAction,
  [string]$ExpectedPolicyAction = '',
  [string]$ExpectedEffectiveAction = '',
  [string]$FixturePath = '',
  [string]$RunDir = 'scripts/phase8-runs',
  [string]$PolicyProfile = 'default',
  [string]$Region = 'eu-north-1',
  [string]$Profile = 'production',
  [string]$RdsHost = ''
)

$ErrorActionPreference = 'Stop'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not (Test-Path $RunDir)) {
  New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
}
$caseFile = Join-Path $RunDir "$timestamp-$CaseId.json"

Write-Host "Phase 8 case: $CaseId" -ForegroundColor Cyan
Write-Host "Command: $ScanCommand" -ForegroundColor DarkGray

# Capture CLI exit + stdout/stderr
$startTime = Get-Date
$cliOutput = & cmd /c $ScanCommand 2>&1 | Out-String
$cliExit = $LASTEXITCODE
$totalMs = ((Get-Date) - $startTime).TotalMilliseconds

# Parse the [ceragon] action chain from CLI output
$cliAction = ''
$decisionSource = ''
$policyReason = ''
$correlationId = ''
$actionChain = ''
foreach ($line in $cliOutput -split "`n") {
  if ($line -match '\[ceragon\]\s+(\S+):\s+source:\s+(\S+)') {
    $decisionSource = $matches[2]
  }
  if ($line -match '\[ceragon\]\s+\S+\s+action chain:\s+(.+)$') {
    $actionChain = $matches[1].Trim()
  }
  if ($line -match '\[ceragon\]\s+\S+\s+policy:\s+(.+)$') {
    $policyReason = $matches[1].Trim()
  }
  if ($line -match 'correlationId[=:]\s*(\S+)') {
    $correlationId = $matches[1]
  }
  if ($line -match 'verdict[:=]\s*(ALLOW|BLOCK|PROMPT|HOLD)') {
    $cliAction = $matches[1]
  }
}

# Look up the DB row by correlationId (best-effort; may not be available
# without psql connectivity).
$dbVerdict = ''
$dbReason = ''
$dbFailureReason = ''
if ($correlationId -and $RdsHost) {
  try {
    $sql = @"
SELECT json_build_object(
  'verdict', verdict,
  'reason', reason,
  'failureReason', failure_reason
) FROM analysis WHERE correlation_id = '$correlationId' ORDER BY "createdAt" DESC LIMIT 1;
"@
    $dbRow = & psql -h $RdsHost -d ceragon -U ceragon_admin -A -t -c $sql 2>&1
    if ($LASTEXITCODE -eq 0 -and $dbRow) {
      $parsed = $dbRow | ConvertFrom-Json
      $dbVerdict = $parsed.verdict
      $dbReason = $parsed.reason
      $dbFailureReason = $parsed.failureReason
    }
  } catch {
    # Best-effort — DB lookup failures are recorded but don't fail the case.
  }
}

# Compose mismatch classification
$mismatch = 'none'
if ($cliAction -and $cliAction -ne $ExpectedRuntimeAction) {
  $mismatch = 'runtime≠expected'
} elseif ($dbVerdict -and $cliAction -and $dbVerdict -ne $cliAction) {
  $mismatch = 'cli≠db'
}

$record = [ordered]@{
  caseId        = $CaseId
  capturedAt    = (Get-Date).ToString('o')
  policyProfile = $PolicyProfile
  fixturePath   = $FixturePath
  scanCommand   = $ScanCommand
  expected      = [ordered]@{
    policyAction    = $ExpectedPolicyAction
    effectiveAction = $ExpectedEffectiveAction
    runtimeAction   = $ExpectedRuntimeAction
  }
  observed      = [ordered]@{
    cliAction       = $cliAction
    cliExitCode     = $cliExit
    dbVerdict       = $dbVerdict
    dbReason        = $dbReason
    dbFailureReason = $dbFailureReason
    decisionSource  = $decisionSource
    actionChain     = $actionChain
    policyReason    = $policyReason
    correlationId   = $correlationId
    latencyMs       = [ordered]@{ total = [int]$totalMs }
  }
  mismatch      = $mismatch
  cliOutput     = $cliOutput.Trim()
}

$record | ConvertTo-Json -Depth 6 | Out-File -FilePath $caseFile -Encoding utf8

if ($mismatch -eq 'none') {
  Write-Host "PASS: $CaseId → $cliAction (matches expected)" -ForegroundColor Green
} else {
  Write-Host "FAIL: $CaseId → mismatch=$mismatch (expected $ExpectedRuntimeAction, got $cliAction)" -ForegroundColor Red
}
Write-Host "Recorded to: $caseFile" -ForegroundColor DarkGray
