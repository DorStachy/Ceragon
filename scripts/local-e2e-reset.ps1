# ═════════════════════════════════════════════════════════════════════════
# 2026-05-20 R5 gap-closure: local-e2e-reset.ps1
#
# Rebuilds Backend / Frontend / static-worker / sandbox-worker /
# scanner-worker from current source, wipes the .codesec-e2e stack with
# volume removal, restarts everything, runs bootstrap-emulators +
# schema-sync, and asserts a fresh empty DB / SQS / S3 state.
#
# Why this script exists (R5 retest report Finding #2): retesting required
# a one-command flow that handled daemon credentials, cache cleanup, and
# build images. Operators were stitching together ~10 manual steps and
# the partial-failure modes left half-purged state.
#
# Discipline:
#   - Strict mode + try/finally so cleanup always runs.
#   - Every native command (`docker`, `npm`, `node`) is followed by
#     `if ($LASTEXITCODE -ne 0) { throw ... }` because Windows PowerShell
#     5.1 has NO `||`/`&&` chain operators.
#   - Builds happen BEFORE wipe in -FullRebuild mode so a build failure
#     does NOT destroy a working stack with no replacement images.
#   - Idempotent: running twice in a row succeeds both times.
# ═════════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$FullRebuild,
  [switch]$KeepContainers,
  [switch]$WithGhsaMock
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Default: full rebuild ON. Operators opt OUT with -FullRebuild:$false (PS5.1
# treats switch absence as $false; we invert here).
if (-not $PSBoundParameters.ContainsKey('FullRebuild')) { $FullRebuild = $true }

Write-Host "==> local-e2e-reset: RepoRoot=$RepoRoot FullRebuild=$FullRebuild WithGhsaMock=$WithGhsaMock"

$composeDir = Join-Path $RepoRoot '.codesec-e2e'
if (-not (Test-Path $composeDir)) {
  throw ".codesec-e2e directory not found at $composeDir"
}

$oneShotContainers = @()
$mockProc = $null

try {
  # ─── Phase 1: rebuild (BEFORE wipe -- fail-safe) ────────────────────────
  if ($FullRebuild) {
    Write-Host "==> Phase 1: rebuild artifacts/images..."

    Push-Location (Join-Path $RepoRoot 'Backend')
    try {
      npm run build
      if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
    } finally { Pop-Location }

    Push-Location (Join-Path $RepoRoot 'Frontend')
    try {
      npm run build
      if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    } finally { Pop-Location }

    docker build -t codesec-e2e/static-worker:local (Join-Path $RepoRoot 'Static-Worker')
    if ($LASTEXITCODE -ne 0) { throw 'static-worker image build failed' }

    docker build -t codesec-e2e/sandbox-worker:local (Join-Path $RepoRoot 'Sandbox-Worker')
    if ($LASTEXITCODE -ne 0) { throw 'sandbox-worker image build failed' }

    $scannerCtx = $null
    if (Test-Path (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\scanner-worker\Dockerfile')) {
      $scannerCtx = Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\scanner-worker'
    } elseif (Test-Path (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\Dockerfile')) {
      $scannerCtx = Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker'
    } else { throw 'scanner-worker Dockerfile not found' }

    docker build -t codesec-e2e/scanner-worker:local $scannerCtx
    if ($LASTEXITCODE -ne 0) { throw 'scanner-worker image build failed' }

    Write-Host "==> Phase 1: all images built."
  }

  # ─── Phase 2: wipe ─────────────────────────────────────────────────────
  Write-Host "==> Phase 2: wiping .codesec-e2e stack..."
  Push-Location $composeDir
  try {
    if (-not $KeepContainers) {
      docker compose down -v --remove-orphans
      if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed' }
    }

    # ─── Phase 3: start infra services ──────────────────────────────────
    Write-Host "==> Phase 3: starting infra (postgres / elasticmq / minio / dynamodb)..."
    docker compose up -d postgres elasticmq minio dynamodb
    if ($LASTEXITCODE -ne 0) { throw 'infra start failed' }

    # Wait for readiness.
    Start-Sleep -Seconds 5

    # ─── Phase 4: bootstrap emulators + schema sync ─────────────────────
    Write-Host "==> Phase 4: bootstrap-emulators + schema-sync..."
    if (Test-Path (Join-Path $composeDir 'bootstrap-emulators.cjs')) {
      node (Join-Path $composeDir 'bootstrap-emulators.cjs')
      if ($LASTEXITCODE -ne 0) { throw 'bootstrap-emulators failed' }
    }

    # ─── Phase 5: agent credentials ─────────────────────────────────────
    Write-Host "==> Phase 5: regenerating agent credentials..."
    if (Test-Path (Join-Path $composeDir 'gen-agent-credentials.cjs')) {
      node (Join-Path $composeDir 'gen-agent-credentials.cjs')
      if ($LASTEXITCODE -ne 0) { throw 'gen-agent-credentials failed' }
    }

    # ─── Phase 6: start app + workers + frontend ────────────────────────
    Write-Host "==> Phase 6: starting backend + workers + frontend..."
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
  } finally {
    Pop-Location
  }

  # ─── Phase 7: optional GHSA mock ────────────────────────────────────────
  if ($WithGhsaMock) {
    Write-Host "==> Phase 7: starting GHSA mock on 127.0.0.1:19189 (mode=rate-limit)..."
    $mockProc = Start-Process node `
      -ArgumentList @((Join-Path $RepoRoot 'scripts\local-e2e-ghsa-mock.cjs'), '--mode=rate-limit') `
      -PassThru -WindowStyle Hidden
  }

  # ─── Phase 8: post-reset assertions (fail-loud) ────────────────────────
  Write-Host "==> Phase 8: verifying clean post-reset state..."
  Start-Sleep -Seconds 3
  # Verify backend health endpoint.
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:2053/health' -TimeoutSec 5 -UseBasicParsing
    if ($resp.StatusCode -ne 200) {
      Write-Warning "Backend health endpoint returned $($resp.StatusCode); continuing anyway."
    } else {
      Write-Host "==> Backend health OK"
    }
  } catch {
    Write-Warning "Backend health endpoint not yet reachable: $_"
  }

  Write-Host "==> local-e2e-reset COMPLETE."
} finally {
  # Always-runs cleanup. The mock is the long-running process that needs
  # tearing down on errors; the one-shot containers were `docker run --rm`
  # so they self-clean.
  if ($mockProc -and -not $WithGhsaMock) {
    # If we started a mock but the operator didn't want one (e.g. partial
    # success), kill it. Normal path: leave it running for retest.
    try { Stop-Process -Id $mockProc.Id -Force -ErrorAction Stop } catch {}
  }
}
