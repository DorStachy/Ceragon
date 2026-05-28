# 2026-05-20 R5 gap-closure: local-e2e-reset.ps1
#
# Rebuilds Backend / Frontend / static-worker / sandbox-worker /
# scanner-worker from current source, wipes the .codesec-e2e stack with
# volume removal, restarts everything, runs bootstrap-emulators +
# schema-sync, applies local-only schema reconciliation, and asserts a
# fresh empty DB state.

[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$FullRebuild,
  [switch]$KeepContainers,
  [switch]$WithGhsaMock
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  if (-not $scriptPath) { throw 'Could not resolve script path for RepoRoot default' }
  if (-not [System.IO.Path]::IsPathRooted($scriptPath)) {
    $scriptPath = (Resolve-Path -LiteralPath $scriptPath).Path
  }
  $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

# Default: full rebuild ON. Operators opt OUT with -FullRebuild:$false.
if (-not $PSBoundParameters.ContainsKey('FullRebuild')) { $FullRebuild = $true }

Write-Host "==> local-e2e-reset: RepoRoot=$RepoRoot FullRebuild=$FullRebuild WithGhsaMock=$WithGhsaMock"

$composeDir = Join-Path $RepoRoot '.codesec-e2e'
if (-not (Test-Path $composeDir)) {
  throw ".codesec-e2e directory not found at $composeDir"
}

$mockProc = $null
$resetComplete = $false

function Wait-PostgresHealthy {
  $postgresHealthy = $false
  for ($i = 0; $i -lt 60; $i++) {
    $health = docker inspect -f "{{.State.Health.Status}}" codesec-e2e-postgres 2>$null
    if ($LASTEXITCODE -eq 0 -and $health.Trim() -eq 'healthy') {
      $postgresHealthy = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $postgresHealthy) { throw 'postgres did not become healthy before bootstrap/schema-sync' }
}

function Wait-GhsaMockReady {
  param([int]$TimeoutSeconds = 30)

  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    try {
      Invoke-WebRequest -Uri 'http://127.0.0.1:19189/advisories' -TimeoutSec 2 -UseBasicParsing | Out-Null
      return
    } catch {
      $response = $_.Exception.Response
      if ($response -and $response.StatusCode -and $response.StatusCode.value__ -eq 403) {
        return
      }
      Start-Sleep -Seconds 1
    }
  }
  throw 'GHSA mock did not become reachable on 127.0.0.1:19189'
}

function Start-GhsaMock {
  Write-Host "==> Starting GHSA mock on 127.0.0.1:19189 (mode=rate-limit)..."
  $proc = Start-Process node `
    -ArgumentList @((Join-Path $RepoRoot 'scripts\local-e2e-ghsa-mock.cjs'), '--mode=rate-limit') `
    -PassThru -WindowStyle Hidden
  Wait-GhsaMockReady
  $env:GHSA_BASE_URL = 'http://host.docker.internal:19189'
  return $proc
}

function Invoke-EmulatorBootstrap {
  if (-not (Test-Path (Join-Path $composeDir 'bootstrap-emulators.cjs'))) { return }

  docker run --rm `
    --network codesec-e2e_net `
    -v "${composeDir}:/work" `
    -v "$(Join-Path $RepoRoot 'Backend\node_modules'):/nm" `
    -e NODE_PATH=/nm `
    -w /work `
    node:20-bookworm-slim `
    node bootstrap-emulators.cjs
  if ($LASTEXITCODE -ne 0) { throw 'bootstrap-emulators failed' }
}

function Invoke-SchemaSync {
  $syncName = 'codesec-e2e-schemasync'
  $existingSync = docker ps -a --filter "name=^/$syncName$" --format "{{.Names}}"
  if ($LASTEXITCODE -ne 0) { throw 'schema-sync container existence check failed' }
  if (@($existingSync | Where-Object { $_ -eq $syncName }).Count -gt 0) {
    docker rm -f $syncName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'stale schema-sync container removal failed' }
  }
  docker run -d `
    --name $syncName `
    --network container:codesec-e2e-postgres `
    --env-file (Join-Path $composeDir 'backend.sync.env') `
    -v "$(Join-Path $RepoRoot 'Backend'):/app" `
    -w /app `
    node:20-bookworm-slim `
    sh -lc "node dist/main.js"
  if ($LASTEXITCODE -ne 0) { throw 'schema-sync container failed to start' }

  $schemaReady = $false
  $schemaLogs = ''
  try {
    for ($i = 0; $i -lt 90; $i++) {
      $state = docker inspect -f "{{.State.Status}}" $syncName 2>$null
      if ($LASTEXITCODE -ne 0) { throw 'schema-sync container disappeared during startup' }

      $schemaLogs = (cmd /c "docker logs $syncName 2>&1") -join [Environment]::NewLine
      if ($schemaLogs -match 'Nest application successfully started') {
        $schemaReady = $true
        break
      }
      if ($state.Trim() -ne 'running') {
        throw "schema-sync exited before Nest startup: $schemaLogs"
      }
      Start-Sleep -Seconds 2
    }
  } finally {
    $existingSync = docker ps -a --filter "name=^/$syncName$" --format "{{.Names}}"
    if ($LASTEXITCODE -eq 0 -and @($existingSync | Where-Object { $_ -eq $syncName }).Count -gt 0) {
      docker rm -f $syncName | Out-Null
    }
  }
  if (-not $schemaReady) {
    throw "schema-sync timed out before Nest startup: $schemaLogs"
  }
}

function Invoke-LocalMigrations {
  $migrationDir = Join-Path $composeDir 'migrations'
  if (-not (Test-Path $migrationDir)) { return }

  Get-ChildItem -Path $migrationDir -Filter '*.sql' | Sort-Object Name | ForEach-Object {
    Write-Host "==> Applying local schema reconciliation $($_.Name)..."
    Get-Content -LiteralPath $_.FullName -Raw | docker exec -i codesec-e2e-postgres `
      psql -U codefense -d codefense_db -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "local migration failed: $($_.Name)" }
  }
}

function Assert-CleanPostResetState {
  $analysisCount = docker exec codesec-e2e-postgres psql -U codefense -d codefense_db -tAc "select count(*) from analysis;"
  if ($LASTEXITCODE -ne 0) { throw 'analysis count query failed' }
  if ([int]$analysisCount.Trim() -ne 0) { throw "expected empty analysis table, got $analysisCount" }

  $llmTable = docker exec codesec-e2e-postgres psql -U codefense -d codefense_db -tAc "select to_regclass('public.github_llm_enrichment_tasks');"
  if ($LASTEXITCODE -ne 0) { throw 'github_llm_enrichment_tasks existence query failed' }
  if ($llmTable.Trim() -ne 'github_llm_enrichment_tasks') { throw 'github_llm_enrichment_tasks table missing after reset' }
}

function Invoke-AgentCredentialGeneration {
  $credentialsScript = Join-Path $composeDir 'gen-agent-credentials.cjs'
  if (-not (Test-Path $credentialsScript)) { return }

  for ($attempt = 1; $attempt -le 5; $attempt++) {
    node $credentialsScript
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -eq 5) { throw 'gen-agent-credentials failed' }
    Write-Warning "gen-agent-credentials failed on attempt $attempt; retrying after Postgres settles..."
    Start-Sleep -Seconds 2
  }
}

function Wait-BackendHealthy {
  param([int]$TimeoutSeconds = 180)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:2053/health' -TimeoutSec 3 -UseBasicParsing
      if ($resp.StatusCode -eq 200) {
        Write-Host "==> Backend health OK"
        return
      }
    } catch {
      $state = docker inspect -f "{{.State.Status}}" codesec-e2e-backend 2>$null
      if ($LASTEXITCODE -eq 0 -and $state.Trim() -ne 'running') {
        $logs = (cmd /c "docker logs --tail 200 codesec-e2e-backend 2>&1") -join [Environment]::NewLine
        throw "backend exited before health became ready: $logs"
      }
    }
    Start-Sleep -Seconds 2
  }

  $finalLogs = (cmd /c "docker logs --tail 200 codesec-e2e-backend 2>&1") -join [Environment]::NewLine
  throw "backend health did not become ready within ${TimeoutSeconds}s: $finalLogs"
}

try {
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

    $scannerCandidates = @(
      @{ Dockerfile = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\Dockerfile.scanner-worker'); Context = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker') },
      @{ Dockerfile = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\scanner-worker\Dockerfile'); Context = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\scanner-worker') },
      @{ Dockerfile = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker\Dockerfile'); Context = (Join-Path $RepoRoot 'GithubApp-Bot-Scanner-Worker') }
    )
    $scannerBuild = $scannerCandidates | Where-Object { Test-Path $_.Dockerfile } | Select-Object -First 1
    if (-not $scannerBuild) { throw 'scanner-worker Dockerfile not found' }

    docker build -f $scannerBuild.Dockerfile -t codesec-e2e/scanner-worker:local $scannerBuild.Context
    if ($LASTEXITCODE -ne 0) { throw 'scanner-worker image build failed' }

    Write-Host "==> Phase 1: all images built."
  }

  Write-Host "==> Phase 2: wiping .codesec-e2e stack..."
  Push-Location $composeDir
  try {
    if (-not $KeepContainers) {
      docker compose down -v --remove-orphans
      if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed' }
    }

    Write-Host "==> Phase 3: starting infra (postgres / elasticmq / minio / dynamodb)..."
    docker compose up -d postgres elasticmq minio dynamodb
    if ($LASTEXITCODE -ne 0) { throw 'infra start failed' }
    Wait-PostgresHealthy

    Write-Host "==> Phase 4: bootstrap-emulators + schema-sync..."
    Invoke-EmulatorBootstrap
    Invoke-SchemaSync
    Invoke-LocalMigrations

    Write-Host "==> Phase 5: regenerating agent credentials..."
    Invoke-AgentCredentialGeneration

    if ($WithGhsaMock) {
      $mockProc = Start-GhsaMock
    } else {
      Remove-Item Env:\GHSA_BASE_URL -ErrorAction SilentlyContinue
    }

    Write-Host "==> Phase 6: starting backend + workers + frontend..."
    docker compose up -d
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

    if ($WithGhsaMock) {
      $workerEnv = docker exec codesec-e2e-static-worker printenv GHSA_BASE_URL
      if ($LASTEXITCODE -ne 0) { throw 'static-worker GHSA_BASE_URL inspection failed' }
      if ($workerEnv.Trim() -ne 'http://host.docker.internal:19189') {
        throw "static-worker GHSA_BASE_URL not set to local mock; got '$workerEnv'"
      }
    }
  } finally {
    Pop-Location
  }

  Write-Host "==> Phase 7: verifying clean post-reset state..."
  Assert-CleanPostResetState
  Wait-BackendHealthy

  Write-Host "==> local-e2e-reset COMPLETE."
  $resetComplete = $true
} finally {
  if ($mockProc -and (-not $WithGhsaMock -or -not $resetComplete)) {
    try { Stop-Process -Id $mockProc.Id -Force -ErrorAction Stop } catch {}
  }
}
