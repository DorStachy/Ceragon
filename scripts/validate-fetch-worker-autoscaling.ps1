#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Read-only guard for the fetch-worker normal lane.

.DESCRIPTION
    Verifies that the full-repo dependency scan lane has a live ECS service,
    an Application Auto Scaling target, scaling policies, and CloudWatch alarms
    with actions enabled. This catches the failure mode where repo dependency
    fan-out is enqueued but no normal-lane worker capacity can consume it.

.EXAMPLE
    ./scripts/validate-fetch-worker-autoscaling.ps1

.EXAMPLE
    ./scripts/validate-fetch-worker-autoscaling.ps1 -SkipAws
#>

[CmdletBinding()]
param(
    [string]$Region = 'eu-north-1',
    [string]$ExpectedAccountId = '113627991972',
    [string]$Cluster = 'cera-workers-staging',
    [string]$Service = 'cera-fetch-worker-staging',
    [int]$ExpectedMinCapacity = 1,
    [int]$ExpectedMaxCapacity = 6,
    [string[]]$AlarmNames = @(
        'cera-fetch-worker-staging-scaleout-backlog',
        'cera-fetch-worker-staging-scalein-zero',
        'fetch-dlq-not-empty'
    ),
    [switch]$SkipAws
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:AwsExecutable = $null
$script:AwsPrefixArgs = @()
$script:Failures = @()

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $script:Failures += $Message
    Write-Host "  FAIL  $Message" -ForegroundColor Red
}

function Add-Pass {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "  OK    $Message" -ForegroundColor Green
}

function Initialize-AwsCli {
    if (Get-Command aws -ErrorAction SilentlyContinue) {
        $script:AwsExecutable = 'aws'
        $script:AwsPrefixArgs = @()
        return
    }

    if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
        $script:AwsExecutable = 'wsl.exe'
        $script:AwsPrefixArgs = @('aws')
        return
    }

    throw 'AWS CLI was not found. Install aws.exe for Windows or make aws available inside WSL.'
}

function Invoke-AwsJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $awsArgs = @($script:AwsPrefixArgs) + @($Arguments)
    $output = & $script:AwsExecutable @awsArgs
    $success = $?
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
    $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } elseif ($success) { 0 } else { 1 }
    if (-not $success -or $exitCode -ne 0) {
        throw "aws $($Arguments -join ' ') failed with exit code $exitCode"
    }

    $text = ($output | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text) -or $text -eq 'null') {
        return $null
    }

    return $text | ConvertFrom-Json
}

function Assert-AwsAccount {
    $identity = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity', '--output', 'json')
    if (-not $identity -or -not ($identity.PSObject.Properties.Name -contains 'Account')) {
        throw 'AWS CLI returned no caller identity. Check that aws is authenticated in this shell.'
    }
    if ($identity.Account -ne $ExpectedAccountId) {
        throw "Refusing to run in AWS account $($identity.Account). Expected $ExpectedAccountId."
    }
    Add-Pass "AWS account $($identity.Account)"
}

Write-Host '=====================================================' -ForegroundColor Cyan
Write-Host ' CERAGON FETCH WORKER AUTOSCALING VALIDATION' -ForegroundColor Cyan
Write-Host ' Read-only production guard' -ForegroundColor Cyan
Write-Host '=====================================================' -ForegroundColor Cyan
Write-Host "Target: $Cluster/$Service  Region: $Region" -ForegroundColor DarkGray

if ($SkipAws) {
    Write-Host '  Skipped AWS calls by -SkipAws. Script parsed successfully.' -ForegroundColor Yellow
    exit 0
}

Initialize-AwsCli
Assert-AwsAccount

$resourceId = "service/$Cluster/$Service"

Write-Host "`n[1/4] ECS service" -ForegroundColor Cyan
$serviceDescription = Invoke-AwsJson -Arguments @(
    'ecs', 'describe-services',
    '--cluster', $Cluster,
    '--services', $Service,
    '--region', $Region,
    '--output', 'json'
)
$serviceRows = @($serviceDescription.services)
$serviceRow = if ($serviceRows.Count -gt 0) { $serviceRows[0] } else { $null }
if (-not $serviceRow -or $serviceRow.status -eq 'INACTIVE') {
    Add-Failure "$Cluster/$Service is missing or inactive"
} else {
    Add-Pass "$Cluster/$Service status=$($serviceRow.status) desired=$($serviceRow.desiredCount) running=$($serviceRow.runningCount)"
    if ([int]$serviceRow.desiredCount -lt 1) {
        Add-Failure "$Cluster/$Service desiredCount is below 1"
    }
}

Write-Host "`n[2/4] Application Auto Scaling target" -ForegroundColor Cyan
$targetResponse = Invoke-AwsJson -Arguments @(
    'application-autoscaling', 'describe-scalable-targets',
    '--service-namespace', 'ecs',
    '--resource-ids', $resourceId,
    '--scalable-dimension', 'ecs:service:DesiredCount',
    '--region', $Region,
    '--output', 'json'
)
$targets = @($targetResponse.ScalableTargets)
$target = if ($targets.Count -gt 0) { $targets[0] } else { $null }
if (-not $target) {
    Add-Failure "No scalable target registered for $resourceId"
} else {
    Add-Pass "$resourceId min=$($target.MinCapacity) max=$($target.MaxCapacity)"
    if ([int]$target.MinCapacity -lt $ExpectedMinCapacity) {
        Add-Failure "$resourceId MinCapacity $($target.MinCapacity) is below expected $ExpectedMinCapacity"
    }
    if ([int]$target.MaxCapacity -lt $ExpectedMaxCapacity) {
        Add-Failure "$resourceId MaxCapacity $($target.MaxCapacity) is below expected $ExpectedMaxCapacity"
    }
}

Write-Host "`n[3/4] Scaling policies" -ForegroundColor Cyan
$policyResponse = Invoke-AwsJson -Arguments @(
    'application-autoscaling', 'describe-scaling-policies',
    '--service-namespace', 'ecs',
    '--resource-id', $resourceId,
    '--scalable-dimension', 'ecs:service:DesiredCount',
    '--region', $Region,
    '--output', 'json'
)
$policies = @($policyResponse.ScalingPolicies)
if ($policies.Count -eq 0) {
    Add-Failure "No scaling policies attached to $resourceId"
} else {
    Add-Pass "$($policies.Count) scaling policies attached to $resourceId"
}

Write-Host "`n[4/4] CloudWatch alarms" -ForegroundColor Cyan
$alarmResponse = Invoke-AwsJson -Arguments (@(
    'cloudwatch', 'describe-alarms',
    '--alarm-names'
) + $AlarmNames + @(
    '--region', $Region,
    '--output', 'json'
))
$alarmsByName = @{}
foreach ($alarm in @($alarmResponse.MetricAlarms)) {
    $alarmsByName[$alarm.AlarmName] = $alarm
}

foreach ($alarmName in $AlarmNames) {
    if (-not $alarmsByName.ContainsKey($alarmName)) {
        Add-Failure "Alarm $alarmName is missing"
        continue
    }

    $alarm = $alarmsByName[$alarmName]
    $actionCount = @($alarm.AlarmActions).Count
    if ($alarm.ActionsEnabled -ne $true) {
        Add-Failure "Alarm $alarmName has ActionsEnabled=$($alarm.ActionsEnabled)"
    } elseif ($actionCount -eq 0) {
        Add-Failure "Alarm $alarmName has no AlarmActions"
    } else {
        Add-Pass "$alarmName actions=$actionCount state=$($alarm.StateValue)"
    }
}

if ($script:Failures.Count -gt 0) {
    Write-Host "`nValidation failed:" -ForegroundColor Red
    foreach ($failure in $script:Failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`nFetch-worker autoscaling guard passed." -ForegroundColor Green
