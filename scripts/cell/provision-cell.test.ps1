# Tests for provision-cell.ps1 (R0-05). Run on Windows, NOT elevated:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\cell\provision-cell.test.ps1
#   pwsh -NoProfile -File scripts\cell\provision-cell.test.ps1
# Every case works on temp directories this test creates; nothing touches a real
# account, a system path or C:\DevoidCell. The machine's built-in Guest account
# (RID 501) stands in for a builder: it is never the account running the test.
# Exit code: 0 all passed, 1 any failure.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$script:failures = 0
$script:passes = 0

function Check {
    param([bool]$Condition, [string]$Message)
    if ($Condition) { $script:passes++; Write-Host "ok   $Message" }
    else { $script:failures++; Write-Host "FAIL $Message" }
}

function Check-Throws {
    param([scriptblock]$Block, [string]$Pattern, [string]$Message)
    try {
        & $Block
        Check $false "$Message (did not throw)"
    } catch {
        Check ($_.Exception.Message -match $Pattern) "$Message [$($_.Exception.Message)]"
    }
}

$scriptPath = Join-Path $PSScriptRoot 'provision-cell.ps1'
. $scriptPath

$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$guest = @(Get-CimInstance -ClassName Win32_UserAccount -Filter "LocalAccount=True AND SID LIKE 'S-1-5-21-%-501'" | ForEach-Object { $_.SID })
if ($guest.Count -ne 1) {
    Write-Host "FAIL precondition: exactly one built-in Guest account (RID 501) must exist, found $($guest.Count)"
    exit 1
}
$guest = $guest[0]
Check ($guest -ne $me) 'precondition: the test does not run as the stand-in builder'
if (Test-Elevated) {
    Write-Host 'FAIL precondition: run these tests NOT elevated (an elevated run could reach the real provisioning path)'
    exit 1
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("provision-cell-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpRoot | Out-Null

try {
    # --- the DACL shapes -------------------------------------------------------
    $custody = New-CellDacl -Kind Custody -CellSid $me -BuilderSids @($guest, $guest)
    Check ($custody.StartsWith('D:P')) 'custody DACL is protected (nothing inherited)'
    Check ($custody.Contains("(D;OICI;FA;;;$guest)")) 'custody denies every builder full control, inheritably'
    Check (([regex]::Matches($custody, [regex]::Escape("(D;OICI;FA;;;$guest)"))).Count -eq 1) 'a builder listed twice is denied once'
    Check ($custody.Contains("(A;OICI;FA;;;$me)") -and $custody.Contains('(A;OICI;FA;;;SY)')) 'custody grants the cell and SYSTEM full control'
    Check (-not ($custody -match ';;;(BU|AU|WD|IU|BA|BG|S-1-5-32-545|S-1-5-11|S-1-1-0|S-1-5-32-544)\)')) 'custody names no broad group and not Administrators (not granted, never denied)'
    Check ($custody.LastIndexOf('(D;') -lt $custody.IndexOf('(A;')) 'deny ACEs precede allow ACEs (canonical order)'

    $base = New-CellDacl -Kind Base -CellSid $me -BuilderSids @($guest)
    Check ($base.Contains('(A;;0x1200a9;;;BU)') -and -not ($base -match '\(A;[^;]*CI[^;]*;[^;]*;;;BU\)')) 'base lets local users list this folder only (no inheritable Users ACE)'
    Check ($base.Contains('(A;;FA;;;BA)')) 'base grants Administrators this folder only'

    $exchange = New-CellDacl -Kind Exchange -CellSid $me -BuilderSids @($guest)
    Check ($exchange.Contains("(A;OICI;0x1200a9;;;$guest)") -and -not $exchange.Contains('(D;')) 'exchange lets builders read what the cell writes'

    Check-Throws { New-CellDacl -Kind Custody -CellSid $me -BuilderSids @() } 'no builder' 'an empty builder list is refused'
    Check-Throws { New-CellDacl -Kind Custody -CellSid $me -BuilderSids @($me) } 'cell account' 'a builder that is the cell is refused'

    # --- applied to a real directory ------------------------------------------
    $dir = Join-Path $tmpRoot 'custody'
    New-Item -ItemType Directory -Path $dir | Out-Null
    Set-CellDacl -Path $dir -Sddl $custody
    $acl = Get-Acl -LiteralPath $dir
    Check $acl.AreAccessRulesProtected 'the written custody DACL is protected'
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    Check (@($rules | Where-Object { $_.IsInherited }).Count -eq 0) 'no inherited ACE survives on custody'
    $denyGuest = @($rules | Where-Object { $_.IdentityReference.Value -eq $guest -and $_.AccessControlType -eq 'Deny' -and $_.FileSystemRights -eq 'FullControl' })
    Check ($denyGuest.Count -eq 1) 'the builder deny is on disk'
    Check (@($rules | Where-Object { $_.IdentityReference.Value -in @('S-1-5-32-545', 'S-1-5-11', 'S-1-1-0', 'S-1-5-4') }).Count -eq 0) 'no Users / Authenticated Users / Everyone / INTERACTIVE ACE on disk'
    Check ($rules.Count -eq 3) "exactly three ACEs on disk (got $($rules.Count))"
    # restore a usable DACL for cleanup
    Set-CellDacl -Path $dir -Sddl "D:P(A;OICI;FA;;;$me)"

    # --- the cell-profile deny keeps what is there -----------------------------
    $profileDir = Join-Path $tmpRoot 'profile'
    New-Item -ItemType Directory -Path $profileDir | Out-Null
    $before = @((Get-Acl -LiteralPath $profileDir).GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    Add-BuilderDeny -Path $profileDir -BuilderSids @($guest)
    Add-BuilderDeny -Path $profileDir -BuilderSids @($guest)
    $after = @((Get-Acl -LiteralPath $profileDir).GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    $deny = @($after | Where-Object { $_.IdentityReference.Value -eq $guest -and $_.AccessControlType -eq 'Deny' })
    Check ($deny.Count -eq 1 -and -not $deny[0].IsInherited) 'one explicit builder deny on the profile, even after a second run'
    Check ($deny.Count -eq 1 -and $deny[0].InheritanceFlags -eq [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit') 'the profile deny is inherited by everything below'
    Check ($after.Count -eq $before.Count + 1) "every existing profile ACE is kept ($($before.Count) before, $($after.Count) after)"
    $child = Join-Path $profileDir 'child'
    New-Item -ItemType Directory -Path $child | Out-Null
    $childDeny = @((Get-Acl -LiteralPath $child).GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object { $_.IdentityReference.Value -eq $guest -and $_.AccessControlType -eq 'Deny' })
    Check ($childDeny.Count -eq 1 -and $childDeny[0].IsInherited) 'a new object in the profile inherits the builder deny'

    # --- the one-way read grant ------------------------------------------------
    $transcripts = Join-Path $tmpRoot 'builder-transcripts'
    New-Item -ItemType Directory -Path $transcripts | Out-Null
    Add-CellRead -Path $transcripts -CellSid $guest
    $read = @((Get-Acl -LiteralPath $transcripts).GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]) | Where-Object { $_.IdentityReference.Value -eq $guest })
    Check ($read.Count -eq 1 -and $read[0].AccessControlType -eq 'Allow' -and ($read[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) -eq 0) 'the cell gets read, and no write, on builder transcripts'

    # --- plan mode changes nothing ---------------------------------------------
    $planRoot = Join-Path $tmpRoot 'DevoidCell'
    $exe = (Get-Process -Id $PID).Path
    function Invoke-ChildScript {
        # Windows PowerShell 5.1 turns a child's stderr line into a terminating
        # error under ErrorActionPreference=Stop; capture it as text instead.
        param([string[]]$ArgList)
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $lines = & $exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath @ArgList 2>&1 | ForEach-Object { "$_" }
            return [pscustomobject]@{ Code = $LASTEXITCODE; Out = ($lines -join "`n") }
        } finally {
            $ErrorActionPreference = $previous
        }
    }

    $r = Invoke-ChildScript -ArgList @('-Plan', '-Root', $planRoot, '-CellAccount', 'devoid-cell-plan-test', '-Builder', $me)
    Check ($r.Code -eq 0) "plan exits 0 (got $($r.Code))"
    $planObj = $r.Out | ConvertFrom-Json
    Check ($planObj.plan -eq 'devoid.cell.provision/1' -and -not $planObj.cellExists) 'plan reports a cell account that does not exist yet'
    Check ($planObj.dacls.custody.Contains("(D;OICI;FA;;;$me)")) 'plan shows the builder deny it would write'
    Check (-not (Test-Path -LiteralPath $planRoot)) 'plan created nothing on disk'

    $r = Invoke-ChildScript -ArgList @('-Plan', '-Root', $planRoot, '-CellAccount', 'devoid-cell-plan-test', '-Builder', 'no-such-builder-account-r005')
    Check ($r.Code -eq 1 -and $r.Out -match 'REFUSED') "an unresolvable builder is refused, not dropped (exit $($r.Code))"

    # --- the real path refuses without elevation --------------------------------
    $r = Invoke-ChildScript -ArgList @('-Root', $planRoot, '-CellAccount', 'devoid-cell-plan-test', '-Builder', $me)
    Check ($r.Code -eq 1 -and $r.Out -match 'elevated') "a non-elevated real run is refused (exit $($r.Code))"
    Check (-not (Test-Path -LiteralPath $planRoot)) 'a refused run created nothing on disk'
} finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "$script:passes passed, $script:failures failed"
if ($script:failures -gt 0) { exit 1 }
exit 0
