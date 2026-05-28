[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$FullReset,
  [switch]$WithGhsaMock,
  [string]$ReportPath
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

if (-not $ReportPath) {
  $ReportPath = Join-Path $RepoRoot "docs\E2E_DEPENDENCY_SUPPLY_CHAIN_RETEST_$(Get-Date -Format yyyy-MM-dd-HHmmss).md"
}

if (-not $FullReset) {
  throw 'run-r5-dependency-e2e.ps1 requires -FullReset so validation cannot pass on stale analysis rows'
}

$runRoot = Join-Path $RepoRoot ".codesec-e2e\runs\$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $runRoot | Out-Null

$agentDir = Join-Path $RepoRoot ".codesec-e2e\fresh-agent"
$agentExe = Join-Path $agentDir "cera.exe"
$shimDir = Join-Path $runRoot 'shims'
$coordsPath = Join-Path $runRoot 'coords.json'
$baseIdsPath = Join-Path $runRoot 'base-ids.json'
$localFixturesDir = Join-Path $runRoot 'local-fixtures'
$mockProc = $null
$originalPath = $env:PATH
$originalGithubToken = $env:GITHUB_TOKEN

$env:CERAGON_NONINTERACTIVE = '1'
$env:ceragon_NONINTERACTIVE = '1'
$env:CERAGON_NO_TUI = '1'
$env:CERAGON_SSE_PENDING_SANDBOX_POLL_SECONDS = '10'
$env:CERAGON_SSE_FALLBACK_SECONDS = '20'

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)

  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Join-Output {
  param([object[]]$Lines)

  if (-not $Lines) { return '' }
  return (($Lines | ForEach-Object { "$_" }) -join [Environment]::NewLine)
}

function Wait-GhsaMockReady {
  for ($i = 0; $i -lt 30; $i++) {
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
  throw 'GHSA mock did not become reachable before degraded phase'
}

function New-NpmWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "npm-$Name"
  New-Item -ItemType Directory -Path $dir | Out-Null
  Write-Utf8NoBom -Path (Join-Path $dir 'package.json') -Content "{`"name`":`"ceragon-e2e-$Name`",`"version`":`"1.0.0`",`"private`":true}`n"
  return $dir
}

function New-PipWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "pip-$Name"
  New-Item -ItemType Directory -Path $dir | Out-Null
  py -m venv (Join-Path $dir '.venv')
  if ($LASTEXITCODE -ne 0) { throw "venv creation failed for $Name" }
  return $dir
}

function Get-CargoPackageName {
  param([string]$Name)

  $safe = ($Name -replace '[^A-Za-z0-9_]', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($safe)) { $safe = 'fixture' }
  if ($safe -notmatch '^[A-Za-z_]') { $safe = "pkg_$safe" }
  return "ceragon_e2e_$safe"
}

function New-CargoWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "cargo-$Name"
  $packageName = Get-CargoPackageName $Name
  cargo new --quiet --name $packageName $dir
  if ($LASTEXITCODE -ne 0) { throw "cargo workspace creation failed for $Name" }
  return $dir
}

try {
  Push-Location $RepoRoot
  try {
    if (-not $env:GITHUB_TOKEN) {
      $ghToken = $null
      try {
        $ghToken = (& gh auth token 2>$null)
      } catch {
        $ghToken = $null
      }
      if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($ghToken)) {
        $env:GITHUB_TOKEN = $ghToken.Trim()
        Write-Host "==> Using authenticated GitHub token for local GHSA API requests (token not logged)."
      } else {
        Write-Warning "GITHUB_TOKEN is not set and gh auth token was unavailable; GHSA coverage may be rate-limited."
      }
    } else {
      Write-Host "==> Using existing GITHUB_TOKEN for local GHSA API requests (token not logged)."
    }

    powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-e2e-reset.ps1') -FullRebuild
    if ($LASTEXITCODE -ne 0) { throw 'local-e2e-reset failed' }

    $analysisCount = docker exec codesec-e2e-postgres psql -U codefense -d codefense_db -tAc "select count(*) from analysis;"
    if ($LASTEXITCODE -ne 0) { throw 'analysis count query failed after reset' }
    if ([int]$analysisCount.Trim() -ne 0) { throw "expected clean analysis table after reset, got $analysisCount" }

    powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\install-local-agent.ps1') -PortableOutputDir $agentDir
    if ($LASTEXITCODE -ne 0) { throw 'portable local agent build failed' }
    if (-not (Test-Path $agentExe)) { throw "portable agent missing: $agentExe" }

    New-Item -ItemType Directory -Path $shimDir -Force | Out-Null
    Copy-Item -LiteralPath $agentExe -Destination (Join-Path $shimDir 'npm.exe') -Force
    Copy-Item -LiteralPath $agentExe -Destination (Join-Path $shimDir 'pip.exe') -Force
    Copy-Item -LiteralPath $agentExe -Destination (Join-Path $shimDir 'cargo.exe') -Force

    $env:NPM_CONFIG_CACHE = Join-Path $runRoot 'npm-cache'
    $env:PIP_CACHE_DIR = Join-Path $runRoot 'pip-cache'
    $env:CARGO_HOME = Join-Path $runRoot 'cargo-home'
    $env:CARGO_TARGET_DIR = Join-Path $runRoot 'cargo-target'
    New-Item -ItemType Directory -Path $env:NPM_CONFIG_CACHE, $env:PIP_CACHE_DIR, $env:CARGO_HOME, $env:CARGO_TARGET_DIR -Force | Out-Null

    node .scanner-challenge\make-findings-quality-e2e.cjs
    if ($LASTEXITCODE -ne 0) { throw 'local fixture generation failed' }
    $latestFixturePath = Join-Path $RepoRoot '.scanner-challenge\latest-findings-quality-e2e-dir'
    if (-not (Test-Path $latestFixturePath)) { throw 'local fixture generator did not write latest-findings-quality-e2e-dir' }
    $generatedFixtureRoot = (Get-Content -LiteralPath $latestFixturePath -Raw).Trim()
    if (-not (Test-Path $generatedFixtureRoot)) { throw "generated fixture root missing: $generatedFixtureRoot" }
    $localFixturesDir = Join-Path $generatedFixtureRoot 'npm-evasive-local\packages'
    if (-not (Test-Path $localFixturesDir)) { throw "generated local fixture package directory missing: $localFixturesDir" }

    $cleanJson = node scripts\select-clean-control.cjs
    if ($LASTEXITCODE -ne 0) { throw 'clean control selection failed' }
    $clean = $cleanJson | ConvertFrom-Json
    if ($clean.name -eq 'kind-of' -and $clean.version -eq '6.0.3') {
      throw 'clean control must not equal degraded fixture kind-of@6.0.3'
    }

    $localControlDir = Join-Path $localFixturesDir 'benign-native-build-control'
    $localPkg = Get-Content -LiteralPath (Join-Path $localControlDir 'package.json') -Raw | ConvertFrom-Json
    $coords = @(
      @{ ecosystem = 'npm'; name = 'event-stream'; version = '3.3.6'; sourceType = 'registry' },
      @{ ecosystem = 'npm'; name = 'minimist'; version = '0.0.8'; sourceType = 'registry' },
      @{ ecosystem = 'npm'; name = 'prismjs'; version = '1.29.0'; sourceType = 'registry' },
      @{ ecosystem = 'cargo'; name = 'serde'; version = '1.0.197'; sourceType = 'registry' },
      @{ ecosystem = 'pypi'; name = 'requests'; version = '2.32.3'; sourceType = 'registry' },
      @{ ecosystem = 'pypi'; name = 'certifi'; version = '2024.8.30'; sourceType = 'registry' },
      @{ ecosystem = 'pypi'; name = 'urllib3'; version = '1.26.5'; sourceType = 'registry' },
      @{ ecosystem = $clean.ecosystem; name = $clean.name; version = $clean.version; sourceType = 'registry' },
      @{ ecosystem = 'npm'; name = $localPkg.name; version = $localPkg.version; sourceType = 'local-dir' }
    )
    Write-Utf8NoBom -Path $coordsPath -Content (($coords | ConvertTo-Json -Depth 5) + "`n")

    $registryFixtures = @(
      @{ Ecosystem = 'npm'; Name = 'event-stream'; Version = '3.3.6'; Expected = 'BLOCK' },
      @{ Ecosystem = 'npm'; Name = 'minimist'; Version = '0.0.8'; Expected = 'BLOCK' },
      @{ Ecosystem = 'npm'; Name = 'prismjs'; Version = '1.29.0'; Expected = 'HOLD_OR_PROMPT' },
      @{ Ecosystem = 'pypi'; Name = 'certifi'; Version = '2024.8.30'; Expected = 'ALLOW_OR_PROMPT_LOW_NO_SETUPPY_NOISE' },
      @{ Ecosystem = 'pypi'; Name = 'requests'; Version = '2.32.3'; Expected = 'ALLOW_OR_PROMPT_LOW_NO_SETUPPY_NOISE' },
      @{ Ecosystem = 'pypi'; Name = 'urllib3'; Version = '1.26.5'; Expected = 'PROMPT_OR_BLOCK_CVE' },
      @{ Ecosystem = 'cargo'; Name = 'serde'; Version = '1.0.197'; Expected = 'ALLOW_NO_IP_DEBUG_ASSERT_FP' }
    )
    $registryFixtures += @{ Ecosystem = $clean.ecosystem; Name = $clean.name; Version = $clean.version; Expected = 'CLEAN_CONTROL' }

    foreach ($fixture in $registryFixtures) {
      Write-Host "==> Registry fixture $($fixture.Ecosystem):$($fixture.Name)@$($fixture.Version) expected=$($fixture.Expected)"
      $wd = switch ($fixture.Ecosystem) {
        'npm' { New-NpmWorkspace "$($fixture.Name)-$($fixture.Version)" }
        'pypi' { New-PipWorkspace "$($fixture.Name)-$($fixture.Version)" }
        'cargo' { New-CargoWorkspace "$($fixture.Name)-$($fixture.Version)" }
        default { throw "unsupported fixture ecosystem $($fixture.Ecosystem)" }
      }
      $ecosystemArg = if ($fixture.Ecosystem -eq 'pypi') { 'pip' } else { $fixture.Ecosystem }
      $oldPath = $env:PATH
      if ($fixture.Ecosystem -eq 'pypi') {
        $env:PATH = "$(Join-Path $wd '.venv\Scripts');$oldPath"
      }
      Push-Location $wd
      try {
        & $agentExe install-package --ecosystem $ecosystemArg --package $fixture.Name --version $fixture.Version
        Write-Host "==> Registry fixture exit code: $LASTEXITCODE"
      } finally {
        Pop-Location
        $env:PATH = $oldPath
      }
    }

    $oldPath = $env:PATH
    $env:PATH = "$shimDir;$oldPath"
    try {
      Get-ChildItem -Path $localFixturesDir -Directory | ForEach-Object {
        Write-Host "==> Local fixture $($_.Name)"
        $wd = New-NpmWorkspace "local-$($_.Name)"
        Push-Location $wd
        try {
          npm install $_.FullName
          Write-Host "==> Local fixture exit code: $LASTEXITCODE"
        } finally {
          Pop-Location
        }
      }
    } finally {
      $env:PATH = $oldPath
    }

    $baseOutput = node scripts\r5-retest-validation.cjs --mode=base --coords $coordsPath 2>&1
    $baseExit = $LASTEXITCODE
    node scripts\snapshot-base-row-ids.cjs --coords $coordsPath --out $baseIdsPath
    if ($LASTEXITCODE -ne 0) { throw 'base row snapshot failed' }

    $degradedOutput = @()
    $degradedExit = 0
    if ($WithGhsaMock) {
      $env:R5_DEGRADED_NAME = 'kind-of'
      $env:R5_DEGRADED_VERSION = '6.0.3'

      $mockProc = Start-Process node `
        -ArgumentList @((Join-Path $RepoRoot 'scripts\local-e2e-ghsa-mock.cjs'), '--mode=rate-limit') `
        -PassThru -WindowStyle Hidden
      Wait-GhsaMockReady

      $env:GHSA_BASE_URL = 'http://host.docker.internal:19189'
      Push-Location (Join-Path $RepoRoot '.codesec-e2e')
      try {
        docker compose up -d --force-recreate static-worker
        if ($LASTEXITCODE -ne 0) { throw 'static-worker recreate for GHSA mock failed' }
        $workerEnv = docker exec codesec-e2e-static-worker printenv GHSA_BASE_URL
        if ($LASTEXITCODE -ne 0) { throw 'static-worker GHSA_BASE_URL inspection failed' }
        if ($workerEnv.Trim() -ne 'http://host.docker.internal:19189') {
          throw "static-worker GHSA_BASE_URL not set to local mock; got '$workerEnv'"
        }
      } finally {
        Pop-Location
      }

      $wd = New-NpmWorkspace 'degraded-kind-of-6.0.3'
      Push-Location $wd
      try {
        & $agentExe install-package --ecosystem npm --package kind-of --version 6.0.3
        Write-Host "==> Degraded fixture exit code: $LASTEXITCODE"
      } finally {
        Pop-Location
      }

      $degradedOutput = node scripts\r5-retest-validation.cjs --mode=degraded --coords $coordsPath --base-ids $baseIdsPath 2>&1
      $degradedExit = $LASTEXITCODE
    }

    $baseOutputText = Join-Output -Lines $baseOutput
    $degradedOutputText = Join-Output -Lines $degradedOutput
    $fence = '```'
    $report = @"
# Dependency Supply-Chain E2E Retest Report

Run root: $runRoot
Generated: $(Get-Date -Format o)

## Validator: base

Exit code: $baseExit

${fence}text
$baseOutputText
$fence

## Validator: degraded

Exit code: $degradedExit

${fence}text
$degradedOutputText
$fence

## Manual UI Check

- Open http://127.0.0.1:3001
- Confirm Dependencies rows show terminal coverage metadata.
- Confirm Alerts action chips show "Requires review" for PROMPT/source-policy rows.
- Confirm local artifact rows include both static-worker findings and source-policy review context.
"@

    Write-Utf8NoBom -Path $ReportPath -Content $report
    if ($baseExit -ne 0) { throw "base validation failed; report written to $ReportPath" }
    if ($WithGhsaMock -and $degradedExit -ne 0) { throw "degraded validation failed; report written to $ReportPath" }
    Write-Host "Report written to $ReportPath"
  } finally {
    Pop-Location
  }
} finally {
  $env:PATH = $originalPath
  if ([string]::IsNullOrWhiteSpace($originalGithubToken)) {
    Remove-Item Env:\GITHUB_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:GITHUB_TOKEN = $originalGithubToken
  }
  if ($mockProc) {
    try { Stop-Process -Id $mockProc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
}
