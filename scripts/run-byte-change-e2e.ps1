# scripts/run-byte-change-e2e.ps1
#
# End-to-end test for the same-version byte change hardening plan.
# Drives the Ceragon-Intelligence artifact-fetcher against the
# .codesec-e2e dynamo-local stack and verifies the alias row carries
# the new sticky integrity evidence.
#
# Prerequisites:
#   - `.codesec-e2e` stack running (postgres, dynamodb, elasticmq, minio)
#     i.e., `docker compose -f .codesec-e2e\docker-compose.yml up -d`.
#     If unhealthy, run `scripts\local-e2e-reset.ps1` first.
#   - Ceragon-Intelligence built: `cd Ceragon-Intelligence; npm run build`.
#
# Optional verification (operator-driven, not asserted by this script):
#   - To exercise the Backend FastGate side, set on the backend container:
#       PRECOMPUTED_VERDICT_ENABLED=true
#       IMMUTABILITY_VIOLATION_BLOCK_MODE=hard
#       CERAGON_ENV=staging
#     and POST /api/v1/packages/check-packages with a valid agent API key.
#     Expected: action=BLOCK, decisionSource=PRECOMPUTED_VERDICT.

[CmdletBinding()]
param(
  [string]$RepoRoot,
  [string]$AliasKey = 'npm#e2e-byte-change#1.0.0#e2e-byte-change-1.0.0.tgz',
  [string]$IntelEndpoint = 'http://localhost:8000',
  [string]$SqsEndpoint = 'http://localhost:9324',
  [string]$TablePrefix = 'ceragon-staging'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  if (-not $scriptPath) { throw 'Could not resolve script path for RepoRoot default' }
  $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

Write-Host "==> byte-change E2E: RepoRoot=$RepoRoot aliasKey=$AliasKey"

# ── Step 1: dynamo-local reachability ───────────────────────────────────────
Write-Host "==> checking dynamo-local at $IntelEndpoint"
try {
  Invoke-WebRequest -Uri "$IntelEndpoint" -Method GET -TimeoutSec 5 -UseBasicParsing | Out-Null
} catch {
  # DDB-local returns HTTP 400 to a bare GET; that's actually proof of life.
  if (-not ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -ge 400)) {
    Write-Error "dynamo-local not reachable at $IntelEndpoint. Start the .codesec-e2e stack first."
    exit 1
  }
}
Write-Host "==> dynamo-local reachable"

# ── Step 2: confirm the Intel dist is built ─────────────────────────────────
$intelDist = Join-Path $RepoRoot 'Ceragon-Intelligence\dist\workers\artifact-fetcher.js'
if (-not (Test-Path $intelDist)) {
  Write-Host "==> Intel dist missing, building..."
  Push-Location (Join-Path $RepoRoot 'Ceragon-Intelligence')
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Ceragon-Intelligence build failed" }
  } finally {
    Pop-Location
  }
}
Write-Host "==> Intel build present: $intelDist"

# ── Step 3: drive the fetcher + assert alias evidence (Node helper) ────────
$driver = Join-Path $RepoRoot 'scripts\e2e-fixtures\drive-byte-change-fetcher.cjs'
if (-not (Test-Path $driver)) {
  Write-Error "missing driver at $driver"
  exit 1
}

Write-Host "==> running Node driver"
# Invoke from Ceragon-Intelligence so Node resolves @aws-sdk/* from its node_modules.
$intelRoot = Join-Path $RepoRoot 'Ceragon-Intelligence'
Push-Location $intelRoot
try {
  & node $driver `
    --aliasKey $AliasKey `
    --intelEndpoint $IntelEndpoint `
    --sqsEndpoint $SqsEndpoint `
    --tablePrefix $TablePrefix
  $driverExit = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($driverExit -ne 0) {
  Write-Error "byte-change E2E driver failed (exit $driverExit)"
  exit $driverExit
}

Write-Host ""
Write-Host "==> byte-change E2E PASSED"
Write-Host ""
Write-Host "To complete Phase 4 (Backend FastGate BLOCK) manually:"
Write-Host "  1. Ensure backend container has these env vars set:"
Write-Host "       PRECOMPUTED_VERDICT_ENABLED=true"
Write-Host "       IMMUTABILITY_VIOLATION_BLOCK_MODE=hard"
Write-Host "       CERAGON_ENV=$($TablePrefix -replace '^ceragon-', '')"
Write-Host "  2. Provision a test agent API key in the org."
Write-Host "  3. POST /api/v1/packages/check-packages with:"
Write-Host "       ecosystem=npm name=e2e-byte-change version=1.0.0"
Write-Host "     Expected response: action=BLOCK, decisionSource=PRECOMPUTED_VERDICT."
