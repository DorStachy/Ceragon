# ═════════════════════════════════════════════════════════════════════════
# 2026-05-20 R5 gap-closure: install-local-agent.ps1
#
# Builds the current `Installers/cmd/ceragon` + `Installers/cmd/ceragond`
# from source and atomically swaps them into the local install dir
# (default `C:\ProgramData\ceragon\bin`).
#
# Why this script exists (R5 retest report Finding #1): operators were
# running R5 fixtures against the locally-installed `ceragon.exe` shim,
# which had been built BEFORE the cargo `@version` fix landed. The
# installed binary therefore still emitted `--vers`, causing a false-
# positive worker-contract failure for `cargo:serde@1.0.197`. The E2E
# setup needs an explicit installer-refresh step before retests.
#
# Transaction shape:
#   1. Build BOTH binaries to a TEMP staging directory.
#   2. Atomically back up + copy + hash-verify each destination.
#   3. On ANY failure mid-transaction, ALL touched destinations roll back.
#   4. Post-commit cleanup of `.bak` files is best-effort, never rollback.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install-local-agent.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-local-agent.ps1 `
#     -RepoRoot C:\Users\Owner\Documents\Ceragon -InstallDir C:\bin -NoRestart
# ═════════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$InstallDir = "$env:ProgramData\ceragon\bin",
  [switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "==> install-local-agent: RepoRoot=$RepoRoot InstallDir=$InstallDir NoRestart=$NoRestart"

# ─── Phase 0: validate inputs ────────────────────────────────────────────
$installersDir = Join-Path $RepoRoot 'Installers'
if (-not (Test-Path $installersDir)) {
  throw "Installers directory not found: $installersDir"
}
if (-not (Test-Path $InstallDir)) {
  Write-Host "Install dir $InstallDir does not exist -- creating."
  New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

# ─── Phase 1: build to a TEMP staging directory ──────────────────────────
$staging = Join-Path $env:TEMP "ceragon-staging-$([System.Guid]::NewGuid().Guid.Substring(0,8))"
New-Item -ItemType Directory -Path $staging | Out-Null
Write-Host "==> Staging dir: $staging"

try {
  Push-Location $installersDir
  try {
    Write-Host "==> Building ceragon.exe from .\cmd\ceragon..."
    go build -o (Join-Path $staging 'ceragon.exe') .\cmd\ceragon
    if ($LASTEXITCODE -ne 0) { throw 'go build ceragon.exe failed' }

    Write-Host "==> Building ceragond.exe from .\cmd\ceragond..."
    go build -o (Join-Path $staging 'ceragond.exe') .\cmd\ceragond
    if ($LASTEXITCODE -ne 0) { throw 'go build ceragond.exe failed' }
  } finally {
    Pop-Location
  }

  # ─── Phase 2: optionally stop running daemon ────────────────────────────
  $daemonPath = Join-Path $InstallDir 'ceragond.exe'
  $runningDaemon = $null
  if (Test-Path $daemonPath) {
    # Find process by RESOLVED path equality (NOT name) so we don't kill
    # an unrelated `ceragond.exe` somewhere else on the system.
    $runningDaemon = Get-Process -Name ceragond -ErrorAction SilentlyContinue |
      Where-Object {
        try {
          $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction Stop
          $proc.ExecutablePath -and ((Resolve-Path -LiteralPath $proc.ExecutablePath -ErrorAction Stop).Path -eq (Resolve-Path -LiteralPath $daemonPath -ErrorAction Stop).Path)
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

  # ─── Phase 3: atomic pair install (back up, copy+hash, on failure roll back) ───
  function Install-PairAtomic {
    param([hashtable[]]$Pairs)

    $backups = @()
    $touched = @()

    try {
      # 3a: back up every existing destination FIRST.
      foreach ($p in $Pairs) {
        if (-not (Test-Path $p.Source)) { throw "Staged binary missing: $($p.Source)" }
        $bak = $null
        if (Test-Path $p.Dest) {
          $bak = "$($p.Dest).bak-$([System.Guid]::NewGuid().Guid.Substring(0,8))"
          Rename-Item -LiteralPath $p.Dest -NewName (Split-Path $bak -Leaf)
        }
        $backups += @{ Dest = $p.Dest; Bak = $bak }
      }

      # 3b: copy + hash-verify each. Mark touched BEFORE hash check so a
      # hash failure on an orphan still triggers rollback.
      foreach ($p in $Pairs) {
        Copy-Item -LiteralPath $p.Source -Destination $p.Dest
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

    # 3c: post-commit cleanup (best-effort, never rolls back).
    foreach ($b in $backups) {
      if ($b.Bak -and (Test-Path $b.Bak)) {
        try { Remove-Item -LiteralPath $b.Bak -Force } catch {
          Write-Warning "  Post-commit: could not remove stale backup $($b.Bak) -- leaving in place."
        }
      }
    }
  }

  Install-PairAtomic -Pairs @(
    @{ Source = (Join-Path $staging 'ceragon.exe');  Dest = (Join-Path $InstallDir 'ceragon.exe')  },
    @{ Source = (Join-Path $staging 'ceragond.exe'); Dest = (Join-Path $InstallDir 'ceragond.exe') }
  )

  Write-Host "==> Atomic install complete."

  # ─── Phase 4: optionally restart the daemon ─────────────────────────────
  if (-not $NoRestart -and $runningDaemon) {
    Write-Host "==> Restarting ceragond (was running before swap)..."
    Start-Process -FilePath $daemonPath -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
  }

  Write-Host "==> Done. Installed:"
  Write-Host "      $InstallDir\ceragon.exe"
  Write-Host "      $InstallDir\ceragond.exe"
} finally {
  if (Test-Path $staging) {
    try { Remove-Item -LiteralPath $staging -Recurse -Force } catch {
      Write-Warning "Could not clean staging dir $staging -- leaving in place."
    }
  }
}
