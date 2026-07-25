[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteId,
    [Parameter(Mandatory = $true)]
    [string]$AgentRoot,
    [string]$BackendUrl = 'http://127.0.0.1:2053',
    [int]$DaemonPort = 49381,
    [int]$ReadyTimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$adminEmail = [string]$env:M47_ADMIN_EMAIL
$adminPassword = [string]$env:M47_ADMIN_PASSWORD
if ([string]::IsNullOrWhiteSpace($adminEmail) -or
    [string]::IsNullOrWhiteSpace($adminPassword)) {
    throw 'M47_ADMIN_EMAIL and M47_ADMIN_PASSWORD must contain local test credentials.'
}

$resolvedAgentRoot = (Resolve-Path -LiteralPath $AgentRoot).Path
$agentHome = Join-Path $resolvedAgentRoot 'user'
$cli = Join-Path $resolvedAgentRoot 'devoid.exe'
$tokenPath = Join-Path $agentHome '.devoid\daemon-token'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
    throw "Agent CLI not found: $cli"
}

$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
if ($token.Length -lt 32) {
    throw 'Daemon capability token is missing or malformed.'
}

$backendPolicyUrl = "$($BackendUrl.TrimEnd('/'))/api/v1/ai/security-policy?siteId=$SiteId"
$daemonUrl = "http://127.0.0.1:$DaemonPort"
$originalHome = $env:HOME
$originalUserProfile = $env:USERPROFILE
$originalDaemonPort = $env:DEVOID_DAEMON_PORT
$originalDlpJson = $null
$restored = $false
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-DaemonJson {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('GET', 'POST')]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [object]$Body
    )

    $parameters = @{
        Method = $Method
        Uri = "$script:daemonUrl$Path"
        Headers = @{ 'X-Devoid-Daemon-Token' = $script:token }
        TimeoutSec = 15
    }
    if ($Method -eq 'POST') {
        $parameters.ContentType = 'application/json'
        $parameters.Body = $Body | ConvertTo-Json -Depth 30 -Compress
    }
    return Invoke-RestMethod @parameters
}

function Wait-DaemonReady {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    do {
        try {
            $health = Invoke-DaemonJson -Method GET -Path '/health'
            if ($health.status -eq 'ok' -and
                $health.aiTrust.posture -eq 'V2_ATTESTED' -and
                $health.aiTrust.converged) {
                return $health
            }
        }
        catch {
            # Expected while the replacement process binds and converges.
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Daemon did not reach V2_ATTESTED on port $DaemonPort."
}

function Wait-DaemonStopped {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(15)
    do {
        try {
            $null = Invoke-DaemonJson -Method GET -Path '/health'
        }
        catch {
            return
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Prior daemon did not release port $DaemonPort after shutdown."
}

function Restart-Daemon {
    $env:HOME = $agentHome
    $env:USERPROFILE = $agentHome
    $env:DEVOID_DAEMON_PORT = [string]$DaemonPort

    $stopOutput = & $cli daemon stop 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Daemon stop failed: $($stopOutput -join ' ')"
    }
    Wait-DaemonStopped

    $process = Start-Process `
        -FilePath $cli `
        -ArgumentList @('daemon', 'start') `
        -WorkingDirectory $resolvedAgentRoot `
        -WindowStyle Hidden `
        -PassThru
    $health = Wait-DaemonReady
    return [pscustomobject]@{
        launcherPid = $process.Id
        trustPosture = [string]$health.aiTrust.posture
    }
}

function Invoke-Prompt {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text,
        [Parameter(Mandatory = $true)]
        [string]$SessionId
    )
    return Invoke-DaemonJson -Method POST -Path '/v1/ai/prompt-check' -Body @{
        text = $Text
        agentType = 'codex'
        provider = 'openai'
        sessionId = $SessionId
        surface = 'cli'
        host = 'cli'
        emitSubmitEvent = $false
    }
}

function Put-Dlp {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Dlp,
        [Parameter(Mandatory = $true)]
        [hashtable]$Headers
    )
    $body = @{ dlp = $Dlp } | ConvertTo-Json -Depth 30 -Compress
    return Invoke-RestMethod `
        -Method Put `
        -Uri $backendPolicyUrl `
        -Headers $Headers `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 30
}

try {
    $loginBody = @{
        email = $adminEmail
        password = $adminPassword
    } | ConvertTo-Json -Compress
    $login = Invoke-RestMethod `
        -Method Post `
        -Uri "$($BackendUrl.TrimEnd('/'))/api/v1/auth/login" `
        -ContentType 'application/json' `
        -Body $loginBody `
        -TimeoutSec 30
    if ([string]::IsNullOrWhiteSpace([string]$login.accessToken) -or
        -not [bool]$login.user.isAdmin) {
        throw 'Local test login did not return an administrative access token.'
    }
    $headers = @{ Authorization = "Bearer $($login.accessToken)" }

    $originalPolicy = Invoke-RestMethod `
        -Method Get `
        -Uri $backendPolicyUrl `
        -Headers $headers `
        -TimeoutSec 30
    $originalDlpJson = $originalPolicy.config.dlp | ConvertTo-Json -Depth 30 -Compress

    $cases = @(
        @{ name = 'class-allow'; enabled = $true; action = 'allow'; expected = 'allow' },
        @{ name = 'class-warn'; enabled = $true; action = 'warn'; expected = 'warn' },
        @{ name = 'class-redact'; enabled = $true; action = 'redact'; expected = 'redact' },
        @{ name = 'class-block'; enabled = $true; action = 'block'; expected = 'block' },
        # Disabling the configured DLP map deliberately falls back to the
        # fail-safe built-in WARN floor. Per-class "off" is the explicit
        # class-allow case above; this case proves the failure oracle stays safe.
        @{ name = 'dlp-config-disabled-safe-default'; enabled = $false; action = 'redact'; expected = 'warn' }
    )
    $positive = 'deploy with AKIA7Q2W9E4R8T6Y1U3I now'
    $publicSample = 'Documentation value: AKIAIOSFODNN7EXAMPLE'

    for ($index = 0; $index -lt $cases.Count; $index += 1) {
        $case = $cases[$index]
        $draft = $originalDlpJson | ConvertFrom-Json
        $draft.enabled = [bool]$case.enabled
        $draft.actions.'aws-access-key' = [string]$case.action

        $updated = Put-Dlp -Dlp $draft -Headers $headers
        if ([bool]$updated.config.dlp.enabled -ne [bool]$case.enabled -or
            [string]$updated.config.dlp.actions.'aws-access-key' -ne [string]$case.action) {
            throw "Backend did not persist policy case $($case.name)."
        }

        $restart = Restart-Daemon
        $localPolicy = Invoke-DaemonJson -Method GET -Path '/v1/ai/policy'
        if ([bool]$localPolicy.dlp.enabled -ne [bool]$case.enabled -or
            [string]$localPolicy.dlp.actions.'aws-access-key' -ne [string]$case.action) {
            throw "Agent did not activate signed policy case $($case.name)."
        }

        $positiveResponse = Invoke-Prompt `
            -Text $positive `
            -SessionId ([guid]::NewGuid().ToString())
        if ([string]$positiveResponse.decision -ne [string]$case.expected) {
            throw "Policy case $($case.name) decision=$($positiveResponse.decision) expected=$($case.expected)."
        }
        if ($case.expected -in @('redact', 'block') -and
            [string]$positiveResponse.redactedText -match 'AKIA7Q2W9E4R8T6Y1U3I') {
            throw "Policy case $($case.name) exposed the synthetic key in redactedText."
        }

        # The public AWS documentation sample is intentionally non-enforcement
        # eligible. It must stay allowed even while its class is configured BLOCK.
        $publicResponse = Invoke-Prompt `
            -Text $publicSample `
            -SessionId ([guid]::NewGuid().ToString())
        if ([string]$publicResponse.decision -ne 'allow') {
            throw "Policy case $($case.name) falsely enforced the public AWS sample as $($publicResponse.decision)."
        }

        $results.Add([pscustomobject]@{
            case = [string]$case.name
            dlpEnabled = [bool]$case.enabled
            configuredAction = [string]$case.action
            positiveDecision = [string]$positiveResponse.decision
            publicSampleDecision = [string]$publicResponse.decision
            trustPosture = [string]$restart.trustPosture
            policyUpdatedAt = [string]$localPolicy.updatedAt
        })
    }
}
finally {
    try {
        if ($null -ne $originalDlpJson) {
            $restoreLoginBody = @{
                email = $adminEmail
                password = $adminPassword
            } | ConvertTo-Json -Compress
            $restoreLogin = Invoke-RestMethod `
                -Method Post `
                -Uri "$($BackendUrl.TrimEnd('/'))/api/v1/auth/login" `
                -ContentType 'application/json' `
                -Body $restoreLoginBody `
                -TimeoutSec 30
            $restoreHeaders = @{ Authorization = "Bearer $($restoreLogin.accessToken)" }
            $originalDlp = $originalDlpJson | ConvertFrom-Json
            $restoredPolicy = Put-Dlp -Dlp $originalDlp -Headers $restoreHeaders
            $restoreRestart = Restart-Daemon
            $restoredLocal = Invoke-DaemonJson -Method GET -Path '/v1/ai/policy'
            $restoredBackend = Invoke-RestMethod `
                -Method Get `
                -Uri $backendPolicyUrl `
                -Headers $restoreHeaders `
                -TimeoutSec 30
            $restored = (
                [bool]$restoredLocal.dlp.enabled -eq [bool]$originalDlp.enabled -and
                [string]$restoredLocal.dlp.actions.'aws-access-key' -eq
                    [string]$originalDlp.actions.'aws-access-key' -and
                [string]$restoreRestart.trustPosture -eq 'V2_ATTESTED' -and
                [string]$restoredBackend.config.dlp.actions.'aws-access-key' -eq
                    [string]$originalDlp.actions.'aws-access-key'
            )
            if (-not $restored) {
                throw 'Original DLP policy was not restored and activated.'
            }
        }
    }
    finally {
        $env:HOME = $originalHome
        $env:USERPROFILE = $originalUserProfile
        $env:DEVOID_DAEMON_PORT = $originalDaemonPort
    }
}

[ordered]@{
    status = 'PASS'
    siteId = $SiteId
    cases = @($results)
    originalPolicyRestored = $restored
} | ConvertTo-Json -Depth 8
