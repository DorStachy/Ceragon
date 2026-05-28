# 2026-05-20 R5 gap-closure: install-local-agent.ps1
#
# Builds the current Installers/cmd/cera and Installers/cmd/cera-daemon
# from source. Default mode atomically swaps them into the local install
# dir. Portable mode writes fresh binaries to an E2E directory without
# touching the installed system agent.

[CmdletBinding()]
param(
  [string]$RepoRoot,
  [string]$InstallDir = "$env:ProgramData\ceragon\bin",
  [switch]$NoRestart,
  [string]$PortableOutputDir
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

Write-Host "==> install-local-agent: RepoRoot=$RepoRoot InstallDir=$InstallDir NoRestart=$NoRestart PortableOutputDir=$PortableOutputDir"

$installersDir = Join-Path $RepoRoot 'Installers'
if (-not (Test-Path $installersDir)) {
  throw "Installers directory not found: $installersDir"
}

if (-not $PortableOutputDir -and -not (Test-Path $InstallDir)) {
  Write-Host "Install dir $InstallDir does not exist -- creating."
  New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

function Suspend-CeragonScheduledTasks {
  $suspended = @()
  $taskNames = @(
    'Ceragon Daemon',
    '\Ceragon\Ceragon Daemon',
    '\ceragon\Ceragon Daemon'
  )
  $seen = @{}

  foreach ($name in $taskNames) {
    try {
      $taskName = $name.TrimStart('\').Split('\')[-1]
      $tasks = @(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)
      foreach ($task in $tasks) {
        $key = "$($task.TaskPath)$($task.TaskName)".ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        Write-Host "==> Stopping scheduled task $($task.TaskPath)$($task.TaskName)"
        $suspended += @{
          TaskName = $task.TaskName
          TaskPath = $task.TaskPath
          WasDisabled = ($task.State -eq 'Disabled')
        }
        Stop-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue
        if ($task.State -ne 'Disabled') {
          Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null
        }
      }
    } catch {
      Write-Warning "Could not stop scheduled task ${name}: $_"
    }
  }

  return $suspended
}

function Restore-CeragonScheduledTasks {
  param([array]$SuspendedTasks)

  foreach ($task in $SuspendedTasks) {
    if (-not $task.WasDisabled) {
      try {
        Enable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null
      } catch {
        Write-Warning "Could not re-enable scheduled task $($task.TaskPath)$($task.TaskName): $_"
      }
    }
  }
}

function Get-CeragonPortOwners {
  try {
    Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 19280 -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  } catch {
    @()
  }
}

function Stop-CeragonPortOwners {
  $portOwners = @(Get-CeragonPortOwners)
  foreach ($ownerPid in $portOwners) {
    try {
      $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction Stop
      if ($procInfo.ExecutablePath -and $procInfo.ExecutablePath.ToLowerInvariant().Contains('\ceragon\')) {
        Write-Host "==> Stopping ceragon listener PID $ownerPid ($($procInfo.ExecutablePath))"
        Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        Wait-Process -Id $ownerPid -Timeout 5 -ErrorAction SilentlyContinue
      } else {
        throw "port 19280 owned by non-Ceragon process PID $ownerPid path=$($procInfo.ExecutablePath)"
      }
    } catch {
      throw "Cannot stop process listening on 127.0.0.1:19280. Run the script as Administrator or use the portable E2E binary mode. Details: $_"
    }
  }

  $remainingOwners = @(Get-CeragonPortOwners)
  if ($remainingOwners.Count -gt 0) {
    throw "127.0.0.1:19280 still has listener PID(s): $($remainingOwners -join ', ')"
  }
}

function Install-PairAtomic {
  param([hashtable[]]$Pairs)

  $backups = @()
  $touched = @()

  try {
    foreach ($p in $Pairs) {
      if (-not (Test-Path $p.Source)) { throw "Staged binary missing: $($p.Source)" }
      $bak = $null
      if (Test-Path $p.Dest) {
        $bak = "$($p.Dest).bak-$([System.Guid]::NewGuid().Guid.Substring(0,8))"
        Rename-Item -LiteralPath $p.Dest -NewName (Split-Path $bak -Leaf)
      }
      $backups += @{ Dest = $p.Dest; Bak = $bak }
    }

    foreach ($p in $Pairs) {
      Copy-Item -LiteralPath $p.Source -Destination $p.Dest -Force
      $touched += $p.Dest
      $srcHash = (Get-FileHash -LiteralPath $p.Source).Hash
      $destHash = (Get-FileHash -LiteralPath $p.Dest).Hash
      if ($srcHash -ne $destHash) { throw "Hash mismatch after copy: $($p.Dest)" }
    }
  } catch {
    Write-Warning "Pair install failed mid-transaction -- rolling back $($touched.Count) touched dest(s) + restoring $($backups.Count) backup(s)."
    foreach ($d in $touched) {
      if (Test-Path $d) { try { Remove-Item -LiteralPath $d -Force } catch {} }
    }
    foreach ($b in $backups) {
      if ($b.Bak -and (Test-Path $b.Bak)) {
        if (Test-Path $b.Dest) { try { Remove-Item -LiteralPath $b.Dest -Force } catch {} }
        try { Rename-Item -LiteralPath $b.Bak -NewName (Split-Path $b.Dest -Leaf) } catch {
          Write-Warning "  Could not restore $($b.Dest) from $($b.Bak): $_"
        }
      }
    }
    throw
  }

  foreach ($b in $backups) {
    if ($b.Bak -and (Test-Path $b.Bak)) {
      try { Remove-Item -LiteralPath $b.Bak -Force } catch {
        Write-Warning "  Post-commit: could not remove stale backup $($b.Bak) -- leaving in place."
      }
    }
  }
}

$staging = Join-Path $env:TEMP "ceragon-staging-$([System.Guid]::NewGuid().Guid.Substring(0,8))"
$suspendedTasks = @()
New-Item -ItemType Directory -Path $staging | Out-Null
Write-Host "==> Staging dir: $staging"

try {
  Push-Location $installersDir
  try {
    Write-Host "==> Building cera.exe from .\cmd\cera..."
    go build -o (Join-Path $staging 'cera.exe') .\cmd\cera
    if ($LASTEXITCODE -ne 0) { throw 'go build cera.exe failed' }
    Copy-Item -LiteralPath (Join-Path $staging 'cera.exe') -Destination (Join-Path $staging 'ceragon.exe') -Force

    Write-Host "==> Building cera-daemon.exe from .\cmd\cera-daemon..."
    go build -o (Join-Path $staging 'cera-daemon.exe') .\cmd\cera-daemon
    if ($LASTEXITCODE -ne 0) { throw 'go build cera-daemon.exe failed' }
    Copy-Item -LiteralPath (Join-Path $staging 'cera-daemon.exe') -Destination (Join-Path $staging 'ceragond.exe') -Force
  } finally {
    Pop-Location
  }

  if ($PortableOutputDir) {
    if (-not (Test-Path $PortableOutputDir)) {
      New-Item -ItemType Directory -Path $PortableOutputDir | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $staging 'cera.exe') -Destination (Join-Path $PortableOutputDir 'cera.exe') -Force
    Copy-Item -LiteralPath (Join-Path $staging 'cera-daemon.exe') -Destination (Join-Path $PortableOutputDir 'cera-daemon.exe') -Force
    Copy-Item -LiteralPath (Join-Path $staging 'ceragon.exe') -Destination (Join-Path $PortableOutputDir 'ceragon.exe') -Force
    Copy-Item -LiteralPath (Join-Path $staging 'ceragond.exe') -Destination (Join-Path $PortableOutputDir 'ceragond.exe') -Force
    Write-Host "==> Portable E2E binaries written to $PortableOutputDir"
    return
  }

  $suspendedTasks = @(Suspend-CeragonScheduledTasks)

  $daemonPath = Join-Path $InstallDir 'ceragond.exe'
  $runningDaemon = $null
  if (Test-Path $daemonPath) {
    $resolvedDaemonPath = (Resolve-Path -LiteralPath $daemonPath -ErrorAction Stop).Path
    $runningDaemon = Get-Process -Name ceragond -ErrorAction SilentlyContinue |
      Where-Object {
        try {
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction Stop
          $proc.ExecutablePath -and ((Resolve-Path -LiteralPath $proc.ExecutablePath -ErrorAction Stop).Path -eq $resolvedDaemonPath)
        } catch { $false }
      }
    if ($runningDaemon) {
      Write-Host "==> Stopping running ceragond (PID $($runningDaemon.Id | ForEach-Object { $_ }))"
      $runningDaemon | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {}
      }
      Start-Sleep -Milliseconds 400
    }
  }

  Stop-CeragonPortOwners

  Install-PairAtomic -Pairs @(
    @{ Source = (Join-Path $staging 'cera.exe');     Dest = (Join-Path $InstallDir 'cera.exe')     },
    @{ Source = (Join-Path $staging 'cera-daemon.exe'); Dest = (Join-Path $InstallDir 'cera-daemon.exe') },
    @{ Source = (Join-Path $staging 'ceragon.exe');  Dest = (Join-Path $InstallDir 'ceragon.exe')  },
    @{ Source = (Join-Path $staging 'ceragond.exe'); Dest = (Join-Path $InstallDir 'ceragond.exe') }
  )

  Write-Host "==> Atomic install complete."

  if (-not $NoRestart -and $runningDaemon) {
    Write-Host "==> Restarting ceragond (was running before swap)..."
    Start-Process -FilePath $daemonPath -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
  }

  Write-Host "==> Done. Installed:"
  Write-Host "      $InstallDir\cera.exe"
  Write-Host "      $InstallDir\cera-daemon.exe"
  Write-Host "      $InstallDir\ceragon.exe"
  Write-Host "      $InstallDir\ceragond.exe"
} finally {
  if (-not $NoRestart -and -not $PortableOutputDir) {
    Restore-CeragonScheduledTasks -SuspendedTasks $suspendedTasks
  }
  if (Test-Path $staging) {
    try { Remove-Item -LiteralPath $staging -Recurse -Force } catch {
      Write-Warning "Could not clean staging dir $staging -- leaving in place."
    }
  }
}
