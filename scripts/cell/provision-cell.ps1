<#
.SYNOPSIS
Provision the detection programme's measurement cell (unit R0-05, owner commitment C2).

.DESCRIPTION
The measurement cell is a separate local Windows account that holds sealed-set
authoring, red-team material, decryption and certification. Builders (every
account that runs an AI agent on this machine) must not be able to read it.

This script, run ELEVATED by the owner:
  1. creates the local account (default devoid-cell) if it does not exist. The
     owner types its password; the script never stores or prints it. The account
     must not be an administrator;
  2. creates <Root> (default C:\DevoidCell) with:
       <Root>           cell + SYSTEM full control, Administrators this folder
                        only, BUILTIN\Users list this folder only
       <Root>\custody   owned by the cell; cell + SYSTEM full control; an explicit
                        DENY full control for every builder; NO ACE for
                        BUILTIN\Users, Authenticated Users or Everyone, and no
                        inheritance (every local account, the cell included, is
                        in BUILTIN\Users, so the right shape is "not granted",
                        never "denied")
       <Root>\exchange  owned by the cell; cell + SYSTEM full control; builders
                        read. The cell writes reports and the commitment file
                        here; the owner commits them (SC0-05)
  3. grants the cell READ (one way) on each builder's transcript directories
     (~\.claude\projects, ~\.codex\sessions) and on every -ReadGrant path, for
     the contamination scan;
  4. once the cell has logged on once (its profile exists), adds an explicit
     DENY full control for every builder on the cell profile, which is where the
     age identity and the cell's own agent transcripts live. The default profile
     ACL grants Administrators full control, and a builder that is an
     administrator would otherwise read it. Before the first logon the script
     stops at this step with exit code 3: log on once as the cell, re-run.

It never creates, reads or prints key material. The age identity is created by
the cell itself, in the cell's own session (the command is printed at the end).
Re-running is safe: every step is idempotent.

Exit codes: 0 done; 3 done up to the cell profile (first logon needed, re-run);
1 refused or failed.

.PARAMETER CellAccount
The cell's local account name. Default devoid-cell.

.PARAMETER Root
The cell's base directory. Default C:\DevoidCell.

.PARAMETER Builder
Builder account names or SIDs. Default: the account running this script. Pass
EVERY account that runs AI agents here, e.g.
-Builder Owner,CodexSandboxOffline,CodexSandboxOnline

.PARAMETER ReadGrant
Extra directories the cell may read (for example the workspace, for SC0-05's
contamination scan of the repos and .scratch).

.PARAMETER Plan
Print what would be done as JSON and change nothing. Needs no elevation.

.EXAMPLE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\cell\provision-cell.ps1 -Plan -Builder Owner,CodexSandboxOffline,CodexSandboxOnline
#>
[CmdletBinding()]
param(
    [string]$CellAccount = 'devoid-cell',
    [string]$Root = 'C:\DevoidCell',
    [string[]]$Builder = @([Environment]::UserName),
    [string[]]$ReadGrant = @(),
    [switch]$Plan
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# FILE_GENERIC_READ | FILE_GENERIC_EXECUTE (0x1200a9): read, list, traverse.
$script:ReadExecuteMask = '0x1200a9'

function ConvertTo-SidString {
    param([Parameter(Mandatory)][string]$Name)
    if ($Name -match '^S-1-') {
        return ([System.Security.Principal.SecurityIdentifier]::new($Name)).Value
    }
    $account = [System.Security.Principal.NTAccount]::new($Name)
    return $account.Translate([System.Security.Principal.SecurityIdentifier]).Value
}

function Assert-BuilderSet {
    param([string]$CellSid, [string[]]$BuilderSids)
    if (-not $BuilderSids -or @($BuilderSids | Where-Object { $_ }).Count -eq 0) {
        throw 'no builder accounts given: every account that runs AI agents on this machine must be denied; an empty list is not compliance'
    }
    foreach ($b in $BuilderSids) {
        if ($CellSid -and $b -eq $CellSid) {
            throw "builder $b is the cell account itself; the cell cannot be a builder"
        }
    }
}

function New-CellDacl {
    # Returns the SDDL DACL for one directory of the cell layout. Pure: it
    # touches nothing, so the shape is testable without an account or elevation.
    param(
        [Parameter(Mandatory)][ValidateSet('Base', 'Custody', 'Exchange')][string]$Kind,
        [Parameter(Mandatory)][string]$CellSid,
        [string[]]$BuilderSids
    )
    Assert-BuilderSet -CellSid $CellSid -BuilderSids $BuilderSids
    $builders = @($BuilderSids | Where-Object { $_ } | Sort-Object -Unique)
    switch ($Kind) {
        'Base' {
            return "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;$CellSid)(A;;FA;;;BA)(A;;$($script:ReadExecuteMask);;;BU)"
        }
        'Custody' {
            $deny = ($builders | ForEach-Object { "(D;OICI;FA;;;$_)" }) -join ''
            return "D:P$deny(A;OICI;FA;;;SY)(A;OICI;FA;;;$CellSid)"
        }
        'Exchange' {
            $read = ($builders | ForEach-Object { "(A;OICI;$($script:ReadExecuteMask);;;$_)" }) -join ''
            return "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;$CellSid)$read"
        }
    }
}

function New-EmptySecurity {
    param([Parameter(Mandatory)][string]$Path)
    if ((Get-Item -LiteralPath $Path -Force).PSIsContainer) {
        return [System.Security.AccessControl.DirectorySecurity]::new()
    }
    return [System.Security.AccessControl.FileSecurity]::new()
}

function Save-Dacl {
    # Persists ONLY the DACL section of $Security (the owner is never written
    # here: that needs SeRestorePrivilege and is done by icacls /setowner).
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)]$Security)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSObject.Methods.Name -contains 'SetAccessControl') {
        $item.SetAccessControl($Security)          # .NET Framework (Windows PowerShell 5.1)
    } elseif ($item.PSIsContainer) {
        [System.IO.FileSystemAclExtensions]::SetAccessControl([System.IO.DirectoryInfo]$item, $Security)
    } else {
        [System.IO.FileSystemAclExtensions]::SetAccessControl([System.IO.FileInfo]$item, $Security)
    }
}

function Set-CellDacl {
    # Replaces the DACL of $Path with $Sddl (protected: nothing inherited).
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Sddl)
    $sec = New-EmptySecurity -Path $Path
    $sec.SetSecurityDescriptorSddlForm($Sddl, [System.Security.AccessControl.AccessControlSections]::Access)
    Save-Dacl -Path $Path -Security $sec
}

function Add-DaclRule {
    # Adds one inheritable rule to the existing DACL of $Path, keeping the rest.
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Sid,
        [Parameter(Mandatory)][System.Security.AccessControl.FileSystemRights]$Rights,
        [Parameter(Mandatory)][System.Security.AccessControl.AccessControlType]$Type
    )
    $sec = New-EmptySecurity -Path $Path
    $sec.SetSecurityDescriptorSddlForm((Get-Acl -LiteralPath $Path).Sddl, [System.Security.AccessControl.AccessControlSections]::Access)
    $isDir = (Get-Item -LiteralPath $Path -Force).PSIsContainer
    $inherit = [System.Security.AccessControl.InheritanceFlags]::None
    if ($isDir) {
        $inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    }
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        [System.Security.Principal.SecurityIdentifier]::new($Sid), $Rights, $inherit,
        [System.Security.AccessControl.PropagationFlags]::None, $Type)
    $sec.AddAccessRule($rule)
    Save-Dacl -Path $Path -Security $sec
}

function Add-BuilderDeny {
    # Explicit, inheritable DENY full control for every builder (cell profile).
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string[]]$BuilderSids)
    foreach ($b in @($BuilderSids | Sort-Object -Unique)) {
        Add-DaclRule -Path $Path -Sid $b -Rights FullControl -Type Deny
    }
}

function Add-CellRead {
    # One-way READ for the cell on a builder directory (transcripts, workspace).
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$CellSid)
    Add-DaclRule -Path $Path -Sid $CellSid -Rights ReadAndExecute -Type Allow
}

function Get-ProfilePath {
    # The profile directory Windows recorded for $Sid, or $null before the
    # account's first logon.
    param([Parameter(Mandatory)][string]$Sid)
    $key = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$Sid"
    $value = Get-ItemProperty -LiteralPath $key -Name ProfileImagePath -ErrorAction SilentlyContinue
    if (-not $value) { return $null }
    $path = [Environment]::ExpandEnvironmentVariables($value.ProfileImagePath)
    if (Test-Path -LiteralPath $path -PathType Container) { return $path }
    return $null
}

function Get-TranscriptDirs {
    param([Parameter(Mandatory)][string]$ProfilePath)
    foreach ($rel in '.claude\projects', '.codex\sessions') {
        Join-Path $ProfilePath $rel
    }
}

function Get-CellLayout {
    param([Parameter(Mandatory)][string]$Root)
    [pscustomobject]@{
        Root     = $Root
        Custody  = Join-Path $Root 'custody'
        Exchange = Join-Path $Root 'exchange'
    }
}

function Get-OwnerSid {
    param([Parameter(Mandatory)][string]$Path)
    try {
        return (Get-Acl -LiteralPath $Path).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    } catch {
        return $null
    }
}

function Set-Owner {
    # icacls enables SeRestorePrivilege itself, which assigning another
    # account as owner needs.
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Sid)
    & icacls.exe $Path /setowner "*$Sid" /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls /setowner *$Sid failed on $Path" }
}

function Invoke-AsTemporaryOwner {
    # On a re-run the explicit DENY on the running (builder) account blocks
    # READ_CONTROL and WRITE_DAC. An owner keeps both whatever the DACL says, so
    # take ownership, act, and hand ownership on even if the action fails.
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$FinalOwnerSid,
        [Parameter(Mandatory)][scriptblock]$Action
    )
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    Set-Owner -Path $Path -Sid $me
    try {
        & $Action
    } finally {
        Set-Owner -Path $Path -Sid $FinalOwnerSid
    }
}

function Test-Elevated {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    return ([System.Security.Principal.WindowsPrincipal]::new($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ExistingSid {
    param([Parameter(Mandatory)][string]$Name)
    try { return ConvertTo-SidString -Name $Name } catch { return $null }
}

function Resolve-Builders {
    param([string[]]$Builder)
    $out = @()
    foreach ($b in @($Builder | Where-Object { $_ })) {
        $out += [pscustomobject]@{ Name = $b; Sid = (ConvertTo-SidString -Name $b) }
    }
    return , $out
}

function Get-ReadTargets {
    param($Builders, [string[]]$ReadGrant)
    $targets = @()
    foreach ($b in $Builders) {
        $profilePath = Get-ProfilePath -Sid $b.Sid
        if ($profilePath) {
            foreach ($d in Get-TranscriptDirs -ProfilePath $profilePath) { $targets += $d }
        }
    }
    $targets += @($ReadGrant | Where-Object { $_ })
    return , $targets
}

function Get-ProvisionPlan {
    # What a real run would do, as an object. Changes nothing, needs no
    # elevation; the SDDL shown is exactly what Set-CellDacl would write.
    param([string]$CellAccount, [string]$Root, [string[]]$Builder, [string[]]$ReadGrant)
    $builders = Resolve-Builders -Builder $Builder
    $builderSids = @($builders | ForEach-Object { $_.Sid })
    $cellSid = Get-ExistingSid -Name $CellAccount
    Assert-BuilderSet -CellSid $cellSid -BuilderSids $builderSids
    $sidForPlan = $cellSid
    if (-not $sidForPlan) { $sidForPlan = '<cell SID once created>' }
    $cellProfile = $null
    if ($cellSid) { $cellProfile = Get-ProfilePath -Sid $cellSid }
    $profileDeny = 'after the cell first logs on: log on once, re-run'
    if ($cellProfile) { $profileDeny = 'explicit inheritable DENY full control for every builder' }
    [pscustomobject]@{
        plan        = 'devoid.cell.provision/1'
        cellAccount = $CellAccount
        cellExists  = [bool]$cellSid
        cellSid     = $cellSid
        builders    = $builders
        layout      = Get-CellLayout -Root $Root
        dacls       = [pscustomobject]@{
            base     = New-CellDacl -Kind Base -CellSid $sidForPlan -BuilderSids $builderSids
            custody  = New-CellDacl -Kind Custody -CellSid $sidForPlan -BuilderSids $builderSids
            exchange = New-CellDacl -Kind Exchange -CellSid $sidForPlan -BuilderSids $builderSids
        }
        owner       = 'the cell account, on base, custody and exchange (icacls /setowner)'
        readGrants  = @((Get-ReadTargets -Builders $builders -ReadGrant $ReadGrant) | ForEach-Object {
                [pscustomobject]@{ path = $_; exists = [bool](Test-Path -LiteralPath $_ -PathType Container) } })
        cellProfile = $cellProfile
        profileDeny = $profileDeny
    }
}

function Assert-Windows {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'the measurement cell is a Windows local account; this host is not Windows'
    }
}

function Invoke-ProvisionCell {
    # The real run. Returns the exit code; writes progress with Write-Host.
    param([string]$CellAccount, [string]$Root, [string[]]$Builder, [string[]]$ReadGrant)
    Assert-Windows
    $builders = Resolve-Builders -Builder $Builder
    $builderSids = @($builders | ForEach-Object { $_.Sid })
    $layout = Get-CellLayout -Root $Root
    $cellSid = Get-ExistingSid -Name $CellAccount
    Assert-BuilderSet -CellSid $cellSid -BuilderSids $builderSids
    $readTargets = Get-ReadTargets -Builders $builders -ReadGrant $ReadGrant

    if (-not (Test-Elevated)) {
        throw 'run this elevated (Run as administrator): it creates a local account and sets ownership'
    }
    if ($PSVersionTable.PSEdition -ne 'Desktop') {
        throw 'run this with Windows PowerShell 5.1 (powershell.exe): the LocalAccounts cmdlets are native there'
    }

    # 1. The account.
    if (-not $cellSid) {
        Write-Host "Creating local account $CellAccount. Type a new password (store it in the password manager; it is not saved anywhere)."
        $pw = Read-Host -AsSecureString "Password for $CellAccount"
        New-LocalUser -Name $CellAccount -Password $pw -Description 'DeVoid measurement cell (R0-05, C2)' -PasswordNeverExpires | Out-Null
        $cellSid = ConvertTo-SidString -Name $CellAccount
        Assert-BuilderSet -CellSid $cellSid -BuilderSids $builderSids
    }
    $admins = @(Get-LocalGroupMember -SID 'S-1-5-32-544' | ForEach-Object { $_.SID.Value })
    if ($admins -contains $cellSid) {
        throw "$CellAccount is a member of Administrators; the cell must be a standard account (remove it and re-run)"
    }

    # 2. The layout, ownership and DACLs.
    foreach ($d in $layout.Root, $layout.Custody, $layout.Exchange) {
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
    }
    foreach ($pair in @(@($layout.Root, 'Base'), @($layout.Custody, 'Custody'), @($layout.Exchange, 'Exchange'))) {
        $sddl = New-CellDacl -Kind $pair[1] -CellSid $cellSid -BuilderSids $builderSids
        Invoke-AsTemporaryOwner -Path $pair[0] -FinalOwnerSid $cellSid -Action { Set-CellDacl -Path $pair[0] -Sddl $sddl }
    }
    Write-Host "Custody layout ready under $($layout.Root) (owner $CellAccount)."

    # 3. One-way read grants.
    foreach ($t in $readTargets) {
        if (Test-Path -LiteralPath $t -PathType Container) {
            Add-CellRead -Path $t -CellSid $cellSid
            Write-Host "Cell may read $t"
        } else {
            Write-Warning "$t does not exist; no grant made. Re-run once it exists, or the transcript scan reports it INCOMPLETE."
        }
    }

    # 4. The cell profile.
    $cellProfile = Get-ProfilePath -Sid $cellSid
    if (-not $cellProfile) {
        Write-Host ''
        Write-Host "The $CellAccount profile does not exist yet. Log on once as the cell (for example: runas /user:$CellAccount cmd), close that session, then re-run this script to lock the profile."
        return 3
    }
    $profileOwner = Get-OwnerSid -Path $cellProfile
    if (-not $profileOwner) { $profileOwner = 'S-1-5-18' }  # re-run: unreadable to us; Windows creates profiles owned by SYSTEM
    Invoke-AsTemporaryOwner -Path $cellProfile -FinalOwnerSid $profileOwner -Action { Add-BuilderDeny -Path $cellProfile -BuilderSids $builderSids }
    Write-Host "Builders denied on the cell profile $cellProfile."

    $builderFlags = ($builders | ForEach-Object { "--builder $($_.Sid)" }) -join ' '
    Write-Host ''
    Write-Host 'Owner steps left (each in the CELL session, never in a builder session):'
    Write-Host "  a. age identity, passphrase-encrypted, inside the cell profile (SC0-05):"
    Write-Host "       age-keygen | age -p -o `"$cellProfile\.devoid-cell\identity.age`""
    Write-Host '  b. prove isolation, as the cell:'
    Write-Host "       devoid-scoreboard custody verify --custody-root `"$($layout.Custody)`" --cell-profile `"$cellProfile`" $builderFlags > `"$($layout.Exchange)\custody-verify.json`""
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if ($Plan) {
            Assert-Windows
            Get-ProvisionPlan -CellAccount $CellAccount -Root $Root -Builder $Builder -ReadGrant $ReadGrant | ConvertTo-Json -Depth 5
            exit 0
        }
        exit (Invoke-ProvisionCell -CellAccount $CellAccount -Root $Root -Builder $Builder -ReadGrant $ReadGrant)
    } catch {
        [Console]::Error.WriteLine("provision-cell: REFUSED: $($_.Exception.Message)")
        exit 1
    }
}
