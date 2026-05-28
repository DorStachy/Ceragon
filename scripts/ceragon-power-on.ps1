#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Restores Ceragon runtime AWS resources after an overnight cost pause.

.DESCRIPTION
    Reads the state saved by ceragon-power-off.ps1 and restores desired counts,
    autoscaling bounds, sandbox ASGs, RDS, Lambda SQS event-source mappings,
    EventBridge scheduled rules, and standalone Ceragon-tagged EC2 instances.
    ECS task-definition ARNs are saved for audit, but are not restored by
    default so a deployment made while services were off is not rolled back.
    Use -RestoreTaskDefinitions only when you explicitly want the exact saved
    task definition revisions restored.

    If no state file is available, the script uses conservative production
    defaults: backend, frontend, static worker, scanner worker, sandbox worker,
    RDS, sandbox wake-up Lambda, and Intel Lambda glue are restored; Intel ECS
    workers remain at desiredCount=0 because the source of truth says Hetzner is
    the active Intel worker path.

.EXAMPLE
    ./scripts/ceragon-power-on.ps1

.EXAMPLE
    ./scripts/ceragon-power-on.ps1 -WhatIf

.EXAMPLE
    ./scripts/ceragon-power-on.ps1 -SkipWait
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [string]$Region = 'eu-north-1',
    [string]$ExpectedAccountId = '113627991972',
    [string]$StatePath = '',
    [switch]$UseDefaults,
    [switch]$RestoreTaskDefinitions,
    [switch]$SkipRds,
    [switch]$SkipWait,
    [int]$WaitTimeoutSeconds = 900
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:AwsExecutable = $null
$script:AwsPrefixArgs = @()

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

function Get-DefaultStatePath {
    if ($env:CERAGON_POWER_STATE_PATH) {
        return $env:CERAGON_POWER_STATE_PATH
    }

    $homePath = if ($env:USERPROFILE) {
        $env:USERPROFILE
    } elseif ($HOME) {
        $HOME
    } else {
        $PSScriptRoot
    }

    return Join-Path (Join-Path $homePath '.ceragon') 'aws-power-state.json'
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

function Invoke-AwsText {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $awsArgs = @($script:AwsPrefixArgs) + @($Arguments)
    & $script:AwsExecutable @awsArgs
    $success = $?
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
    $exitCode = if ($exitCodeVariable) { [int]$exitCodeVariable.Value } elseif ($success) { 0 } else { 1 }
    if (-not $success -or $exitCode -ne 0) {
        throw "aws $($Arguments -join ' ') failed with exit code $exitCode"
    }
}

function Assert-AwsAccount {
    $identity = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity', '--output', 'json')
    if (-not $identity -or -not ($identity.PSObject.Properties.Name -contains 'Account')) {
        throw 'AWS CLI returned no caller identity. Check that aws is authenticated in this shell.'
    }
    if ($identity.Account -ne $ExpectedAccountId) {
        throw "Refusing to run in AWS account $($identity.Account). Expected $ExpectedAccountId."
    }

    return $identity.Account
}

function Get-DefaultState {
    return [ordered]@{
        schemaVersion              = 2
        savedAtUtc                = $null
        savedBy                   = 'ceragon-power-on.ps1 defaults'
        accountId                 = $ExpectedAccountId
        region                    = $Region
        ecsServices               = @(
            @{ cluster = 'backend'; service = 'backend-service'; desiredCount = 1; taskDef = $null },
            @{ cluster = 'frontend'; service = 'frontend'; desiredCount = 1; taskDef = $null },
            @{ cluster = 'cera-workers-staging'; service = 'cera-fetch-worker-staging'; desiredCount = 3; taskDef = $null },
            @{ cluster = 'cera-workers-staging'; service = 'codefence-scanner-worker'; desiredCount = 1; taskDef = $null },
            @{ cluster = 'cera-workers-staging'; service = 'cera-sandbox-worker-staging'; desiredCount = 3; taskDef = $null },
            @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intelligence-artifact-fetcher-production'; desiredCount = 0; taskDef = $null },
            @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-multi-follower-production'; desiredCount = 0; taskDef = $null },
            @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-static-worker-production'; desiredCount = 0; taskDef = $null },
            @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-sandbox-worker-production'; desiredCount = 0; taskDef = $null }
        )
        scalableTargets           = @(
            @{
                resourceId = 'service/cera-workers-staging/cera-fetch-worker-staging'
                minCapacity = 1
                maxCapacity = 6
                suspendedState = @{
                    DynamicScalingInSuspended = $false
                    DynamicScalingOutSuspended = $false
                    ScheduledScalingSuspended = $false
                }
            },
            @{
                resourceId = 'service/cera-workers-staging/cera-sandbox-worker-staging'
                minCapacity = 1
                maxCapacity = 3
                suspendedState = @{
                    DynamicScalingInSuspended = $false
                    DynamicScalingOutSuspended = $false
                    ScheduledScalingSuspended = $false
                }
            },
            @{
                resourceId = 'service/ceragon-intelligence-production/ceragon-intelligence-artifact-fetcher-production'
                minCapacity = 0
                maxCapacity = 0
                suspendedState = @{
                    DynamicScalingInSuspended = $true
                    DynamicScalingOutSuspended = $true
                    ScheduledScalingSuspended = $true
                }
            },
            @{
                resourceId = 'service/ceragon-intelligence-production/ceragon-intel-static-worker-production'
                minCapacity = 0
                maxCapacity = 0
                suspendedState = @{
                    DynamicScalingInSuspended = $true
                    DynamicScalingOutSuspended = $true
                    ScheduledScalingSuspended = $true
                }
            },
            @{
                resourceId = 'service/ceragon-intelligence-production/ceragon-intel-sandbox-worker-production'
                minCapacity = 0
                maxCapacity = 0
                suspendedState = @{
                    DynamicScalingInSuspended = $true
                    DynamicScalingOutSuspended = $true
                    ScheduledScalingSuspended = $true
                }
            }
        )
        asgs                      = @(
            @{
                name = 'cera-sandbox-staging-asg-20260408111912007200000004'
                minSize = 0
                desiredCapacity = 3
                maxSize = 3
                suspendedProcesses = @()
            },
            @{
                name = 'cera-sandbox-intel-asg'
                minSize = 0
                desiredCapacity = 0
                maxSize = 0
                suspendedProcesses = @(
                    'Launch',
                    'Terminate',
                    'HealthCheck',
                    'ReplaceUnhealthy',
                    'AZRebalance',
                    'AlarmNotification',
                    'ScheduledActions',
                    'InstanceRefresh',
                    'AddToLoadBalancer'
                )
            }
        )
        sqsQueues                 = @(
            @{
                queueUrl = 'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-sandbox_jobs-staging'
                dlqArn = 'arn:aws:sqs:eu-north-1:113627991972:cera-sandbox_jobs_dlq-staging'
                visibilityTimeoutSeconds = 900
                maxReceiveCount = 10
            },
            @{
                queueUrl = 'https://sqs.eu-north-1.amazonaws.com/113627991972/cera-sandbox_jobs_exec_now-staging'
                dlqArn = 'arn:aws:sqs:eu-north-1:113627991972:cera-sandbox_jobs_dlq-staging'
                visibilityTimeoutSeconds = 900
                maxReceiveCount = 10
            }
        )
        rdsInstances              = @(
            @{ id = 'codefense-postgressdb'; shouldStartOnPowerOn = $true }
        )
        lambdaEventSourceMappings = @()
        eventBridgeRules          = @(
            @{ name = 'ceragon-advisory-sync-production'; wasEnabled = $true }
        )
        standaloneEc2Instances    = @()
    }
}

function Read-PowerState {
    if (-not $UseDefaults -and (Test-Path $StatePath)) {
        $loaded = Get-Content -Path $StatePath -Raw | ConvertFrom-Json
        Write-Host "  Loaded state from $StatePath" -ForegroundColor Green
        if ($loaded.savedAtUtc) {
            Write-Host "  Saved at $($loaded.savedAtUtc) by $($loaded.savedBy)" -ForegroundColor DarkGray
        } elseif ($loaded.savedAt) {
            Write-Host "  Saved at $($loaded.savedAt) by $($loaded.savedBy)" -ForegroundColor DarkGray
        }
        return $loaded
    }

    Write-Host '  No state file loaded; using conservative defaults.' -ForegroundColor Yellow
    return Get-DefaultState
}

function Get-StateArray {
    param(
        [Parameter(Mandatory = $true)][object]$Object,
        [Parameter(Mandatory = $true)][string]$PropertyName
    )

    if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($PropertyName) -and $null -ne $Object[$PropertyName]) {
        return @($Object[$PropertyName])
    }

    if ($Object.PSObject.Properties.Name -contains $PropertyName -and $null -ne $Object.$PropertyName) {
        return @($Object.$PropertyName)
    }

    $legacyAliases = @{
        ecsServices               = @('services')
        scalableTargets           = @('autoScaling')
        lambdaEventSourceMappings = @('esms')
    }
    if ($legacyAliases.ContainsKey($PropertyName)) {
        foreach ($alias in @($legacyAliases[$PropertyName])) {
            if ($Object -is [System.Collections.IDictionary] -and $Object.Contains($alias) -and $null -ne $Object[$alias]) {
                Write-Warning "Loaded legacy power-state property '$alias'; treating it as '$PropertyName'."
                return @($Object[$alias])
            }
            if ($Object.PSObject.Properties.Name -contains $alias -and $null -ne $Object.$alias) {
                Write-Warning "Loaded legacy power-state property '$alias'; treating it as '$PropertyName'."
                return @($Object.$alias)
            }
        }
    }

    return @()
}

function Set-ObjectProperty {
    param(
        [Parameter(Mandatory = $true)][object]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][object]$Value
    )

    if ($Object -is [System.Collections.IDictionary]) {
        $Object[$Name] = $Value
        return
    }

    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.$Name = $Value
    } else {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
    }
}

function Ensure-EcsServiceMinimumDesired {
    param(
        [Parameter(Mandatory = $true)][object[]]$Services,
        [Parameter(Mandatory = $true)][string]$Cluster,
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][int]$MinimumDesiredCount
    )

    $found = $false
    foreach ($service in @($Services)) {
        if ($service.cluster -eq $Cluster -and $service.service -eq $ServiceName) {
            $found = $true
            $currentDesired = if ($service.PSObject.Properties.Name -contains 'desiredCount' -and $null -ne $service.desiredCount) {
                [int]$service.desiredCount
            } else {
                0
            }
            if ($currentDesired -lt $MinimumDesiredCount) {
                Set-ObjectProperty -Object $service -Name 'desiredCount' -Value $MinimumDesiredCount
                Write-Warning "Raised $Cluster/$ServiceName desiredCount from $currentDesired to $MinimumDesiredCount for normal-lane dependency throughput."
            }
            break
        }
    }

    if (-not $found) {
        Write-Warning "Power state did not include $Cluster/$ServiceName; adding desiredCount=$MinimumDesiredCount so full-repo dependency scans have a consumer."
        $Services += [pscustomobject][ordered]@{
            cluster      = $Cluster
            service      = $ServiceName
            desiredCount = $MinimumDesiredCount
            taskDef      = $null
        }
    }

    return @($Services)
}

function Ensure-ScalableTargetBounds {
    param(
        [Parameter(Mandatory = $true)][object[]]$Targets,
        [Parameter(Mandatory = $true)][string]$ResourceId,
        [Parameter(Mandatory = $true)][int]$MinimumCapacity,
        [Parameter(Mandatory = $true)][int]$MinimumMaxCapacity
    )

    $found = $false
    foreach ($target in @($Targets)) {
        if ($target.resourceId -ne $ResourceId) {
            continue
        }

        $found = $true
        $currentMin = if ($target.PSObject.Properties.Name -contains 'minCapacity' -and $null -ne $target.minCapacity) { [int]$target.minCapacity } else { 0 }
        $currentMax = if ($target.PSObject.Properties.Name -contains 'maxCapacity' -and $null -ne $target.maxCapacity) { [int]$target.maxCapacity } else { 0 }
        if ($currentMin -lt $MinimumCapacity) {
            Set-ObjectProperty -Object $target -Name 'minCapacity' -Value $MinimumCapacity
            Write-Warning "Raised $ResourceId minCapacity from $currentMin to $MinimumCapacity."
        }
        if ($currentMax -lt $MinimumMaxCapacity) {
            Set-ObjectProperty -Object $target -Name 'maxCapacity' -Value $MinimumMaxCapacity
            Write-Warning "Raised $ResourceId maxCapacity from $currentMax to $MinimumMaxCapacity."
        }
        if (-not ($target.PSObject.Properties.Name -contains 'suspendedState') -or $null -eq $target.suspendedState) {
            Set-ObjectProperty -Object $target -Name 'suspendedState' -Value ([pscustomobject][ordered]@{
                DynamicScalingInSuspended = $false
                DynamicScalingOutSuspended = $false
                ScheduledScalingSuspended = $false
            })
        }
        break
    }

    if (-not $found) {
        Write-Warning "Power state did not include scalable target $ResourceId; adding min=$MinimumCapacity max=$MinimumMaxCapacity."
        $Targets += [pscustomobject][ordered]@{
            resourceId = $ResourceId
            minCapacity = $MinimumCapacity
            maxCapacity = $MinimumMaxCapacity
            suspendedState = [pscustomobject][ordered]@{
                DynamicScalingInSuspended = $false
                DynamicScalingOutSuspended = $false
                ScheduledScalingSuspended = $false
            }
        }
    }

    return @($Targets)
}

function Convert-SuspendedStateToCliValue {
    param([AllowNull()][object]$SuspendedState)

    $inSuspended = $false
    $outSuspended = $false
    $scheduledSuspended = $false

    if ($SuspendedState) {
        if ($SuspendedState -is [System.Collections.IDictionary] -and $SuspendedState.Contains('DynamicScalingInSuspended')) {
            $inSuspended = [bool]$SuspendedState['DynamicScalingInSuspended']
        } elseif ($SuspendedState.PSObject.Properties.Name -contains 'DynamicScalingInSuspended') {
            $inSuspended = [bool]$SuspendedState.DynamicScalingInSuspended
        }
        if ($SuspendedState -is [System.Collections.IDictionary] -and $SuspendedState.Contains('DynamicScalingOutSuspended')) {
            $outSuspended = [bool]$SuspendedState['DynamicScalingOutSuspended']
        } elseif ($SuspendedState.PSObject.Properties.Name -contains 'DynamicScalingOutSuspended') {
            $outSuspended = [bool]$SuspendedState.DynamicScalingOutSuspended
        }
        if ($SuspendedState -is [System.Collections.IDictionary] -and $SuspendedState.Contains('ScheduledScalingSuspended')) {
            $scheduledSuspended = [bool]$SuspendedState['ScheduledScalingSuspended']
        } elseif ($SuspendedState.PSObject.Properties.Name -contains 'ScheduledScalingSuspended') {
            $scheduledSuspended = [bool]$SuspendedState.ScheduledScalingSuspended
        }
    }

    return "DynamicScalingInSuspended=$($inSuspended.ToString().ToLower()),DynamicScalingOutSuspended=$($outSuspended.ToString().ToLower()),ScheduledScalingSuspended=$($scheduledSuspended.ToString().ToLower())"
}

function Get-DefaultLambdaMappingsToEnable {
    $functions = @(
        'ceragon-intel-router-production',
        'ceragon-intel-dispatcher-production',
        'ceragon-intel-result-aggregator-production',
        'ceragon-intel-metadata-only-production',
        'cera-sandbox-staging-wake-up'
    )
    $skipSourcePattern = '(analysis-dynamic-urgent|hotset-events|verdict-write)'
    $mappings = @()

    foreach ($functionName in $functions) {
        try {
            $response = Invoke-AwsJson -Arguments @(
                'lambda', 'list-event-source-mappings',
                '--function-name', $functionName,
                '--region', $Region,
                '--output', 'json'
            )
        } catch {
            Write-Warning "Could not list Lambda event-source mappings for ${functionName}: $($_.Exception.Message)"
            continue
        }

        foreach ($mapping in @($response.EventSourceMappings)) {
            if ($mapping.EventSourceArn -match $skipSourcePattern) {
                continue
            }

            $mappings += [ordered]@{
                functionName = $functionName
                uuid         = $mapping.UUID
                state        = $mapping.State
                wasEnabled   = $true
                source       = $mapping.EventSourceArn
            }
        }
    }

    return @($mappings)
}

function Set-SqsRuntimeAttributes {
    param([object[]]$Queues)

    foreach ($queue in @($Queues)) {
        if (-not $queue.queueUrl) {
            continue
        }

        $visibilityTimeout = if ($queue.PSObject.Properties.Name -contains 'visibilityTimeoutSeconds') {
            [int]$queue.visibilityTimeoutSeconds
        } else {
            900
        }
        $maxReceiveCount = if ($queue.PSObject.Properties.Name -contains 'maxReceiveCount') {
            [int]$queue.maxReceiveCount
        } else {
            10
        }
        $dlqArn = if ($queue.PSObject.Properties.Name -contains 'dlqArn') {
            [string]$queue.dlqArn
        } else {
            ''
        }

        $attributes = @{
            VisibilityTimeout = "$visibilityTimeout"
        }

        if (-not [string]::IsNullOrWhiteSpace($dlqArn)) {
            $redrivePolicy = @{
                deadLetterTargetArn = $dlqArn
                maxReceiveCount = "$maxReceiveCount"
            } | ConvertTo-Json -Compress
            $attributes.RedrivePolicy = $redrivePolicy
        }

        $attributesJson = $attributes | ConvertTo-Json -Compress
        $attributesPath = Join-Path ([System.IO.Path]::GetTempPath()) "ceragon-sqs-attrs-$([guid]::NewGuid().ToString('n')).json"
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        if ($PSCmdlet.ShouldProcess($queue.queueUrl, "Set SQS visibility=$visibilityTimeout maxReceiveCount=$maxReceiveCount")) {
            try {
                [System.IO.File]::WriteAllText($attributesPath, $attributesJson, $utf8NoBom)
                Invoke-AwsText -Arguments @(
                    'sqs', 'set-queue-attributes',
                    '--queue-url', $queue.queueUrl,
                    '--attributes', "file://$attributesPath",
                    '--region', $Region,
                    '--output', 'text'
                ) | Out-Null
            } finally {
                Remove-Item -LiteralPath $attributesPath -Force -ErrorAction SilentlyContinue
            }
            Write-Host "  CONFIGURED $($queue.queueUrl) visibility=$visibilityTimeout maxReceiveCount=$maxReceiveCount" -ForegroundColor Green
        }
    }
}

function Wait-ForRdsAvailable {
    param([string[]]$DbIds)

    foreach ($dbId in $DbIds) {
        Write-Host "  Waiting for RDS $dbId to become available..." -ForegroundColor DarkGray
        Invoke-AwsText -Arguments @(
            'rds', 'wait', 'db-instance-available',
            '--db-instance-identifier', $dbId,
            '--region', $Region
        ) | Out-Null
        Write-Host "  READY     RDS $dbId" -ForegroundColor Green
    }
}

function Wait-ForEcsServices {
    param([object[]]$Services)

    $targets = @($Services | Where-Object { [int]$_.desiredCount -gt 0 })
    if ($targets.Count -eq 0) {
        return
    }

    $deadline = (Get-Date).AddSeconds($WaitTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $pending = @()
        foreach ($target in $targets) {
            $description = Invoke-AwsJson -Arguments @(
                'ecs', 'describe-services',
                '--cluster', $target.cluster,
                '--services', $target.service,
                '--region', $Region,
                '--query', 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}',
                '--output', 'json'
            )

            if ([int]$description.running -lt [int]$description.desired -or [int]$description.pending -gt 0) {
                $pending += "$($target.cluster)/$($target.service)=$($description.running)/$($description.desired)"
            }
        }

        if ($pending.Count -eq 0) {
            Write-Host '  ECS services reached desired running counts.' -ForegroundColor Green
            return
        }

        Write-Host "  Waiting for ECS: $($pending -join ', ')" -ForegroundColor DarkGray
        Start-Sleep -Seconds 15
    }

    Write-Warning "Timed out waiting for ECS services after $WaitTimeoutSeconds seconds."
}

if (-not $StatePath) {
    $StatePath = Get-DefaultStatePath
}

Write-Host '=====================================================' -ForegroundColor Green
Write-Host ' CERAGON AWS POWER ON' -ForegroundColor Green
Write-Host ' Restoring runtime state' -ForegroundColor Green
Write-Host '=====================================================' -ForegroundColor Green

Initialize-AwsCli
$accountId = Assert-AwsAccount
Write-Host "Account: $accountId  Region: $Region" -ForegroundColor DarkGray
Write-Host "AWS CLI: $script:AwsExecutable $($script:AwsPrefixArgs -join ' ')" -ForegroundColor DarkGray
Write-Host "State:   $StatePath" -ForegroundColor DarkGray

Write-Host "`n[1/9] Loading desired runtime state..." -ForegroundColor Cyan
$state = Read-PowerState

$ecsServices = @(Get-StateArray -Object $state -PropertyName 'ecsServices')
$scalableTargets = @(Get-StateArray -Object $state -PropertyName 'scalableTargets')
$asgs = @(Get-StateArray -Object $state -PropertyName 'asgs')
$sqsQueues = @(Get-StateArray -Object $state -PropertyName 'sqsQueues')
$rdsInstances = @(Get-StateArray -Object $state -PropertyName 'rdsInstances')
$lambdaMappings = @(Get-StateArray -Object $state -PropertyName 'lambdaEventSourceMappings')
$eventRules = @(Get-StateArray -Object $state -PropertyName 'eventBridgeRules')
$standaloneEc2Instances = @(Get-StateArray -Object $state -PropertyName 'standaloneEc2Instances')

if ($sqsQueues.Count -eq 0) {
    $sqsQueues = @((Get-DefaultState).sqsQueues)
}

if ($lambdaMappings.Count -eq 0) {
    $lambdaMappings = @(Get-DefaultLambdaMappingsToEnable)
}

$ecsServices = @(Ensure-EcsServiceMinimumDesired `
    -Services $ecsServices `
    -Cluster 'cera-workers-staging' `
    -ServiceName 'cera-fetch-worker-staging' `
    -MinimumDesiredCount 3)

$scalableTargets = @(Ensure-ScalableTargetBounds `
    -Targets $scalableTargets `
    -ResourceId 'service/cera-workers-staging/cera-fetch-worker-staging' `
    -MinimumCapacity 1 `
    -MinimumMaxCapacity 6)

foreach ($service in @($ecsServices | Where-Object { $_.cluster -eq 'cera-workers-staging' -and $_.service -eq 'cera-sandbox-worker-staging' })) {
    if ([int]$service.desiredCount -lt 3) {
        $service.desiredCount = 3
    }
}

foreach ($target in @($scalableTargets | Where-Object { $_.resourceId -eq 'service/cera-workers-staging/cera-sandbox-worker-staging' })) {
    if ([int]$target.minCapacity -lt 1) {
        $target.minCapacity = 1
    }
    if ([int]$target.maxCapacity -lt 3) {
        $target.maxCapacity = 3
    }
}

foreach ($asg in @($asgs | Where-Object { $_.name -eq 'cera-sandbox-staging-asg-20260408111912007200000004' })) {
    if ([int]$asg.desiredCapacity -lt 3) {
        $asg.desiredCapacity = 3
    }
    if ([int]$asg.maxSize -lt 3) {
        $asg.maxSize = 3
    }
}

Write-Host "`n[2/9] Starting RDS..." -ForegroundColor Cyan
$rdsStarted = @()
if ($SkipRds) {
    Write-Host '  Skipped by -SkipRds.' -ForegroundColor DarkGray
} else {
    foreach ($db in @($rdsInstances | Where-Object { $_.shouldStartOnPowerOn -ne $false })) {
        $dbId = $db.id
        if (-not $dbId) {
            continue
        }

        $current = Invoke-AwsJson -Arguments @(
            'rds', 'describe-db-instances',
            '--db-instance-identifier', $dbId,
            '--region', $Region,
            '--query', 'DBInstances[0].DBInstanceStatus',
            '--output', 'json'
        )

        if ($current -eq 'available') {
            Write-Host "  OK        RDS $dbId already available" -ForegroundColor DarkGray
            continue
        }

        if ($current -eq 'stopped') {
            if ($PSCmdlet.ShouldProcess($dbId, 'Start RDS DB instance')) {
                Invoke-AwsText -Arguments @(
                    'rds', 'start-db-instance',
                    '--db-instance-identifier', $dbId,
                    '--region', $Region,
                    '--output', 'text',
                    '--query', 'DBInstance.DBInstanceStatus'
                ) | Out-Null
                $rdsStarted += $dbId
                Write-Host "  STARTING  RDS $dbId" -ForegroundColor Green
            }
            continue
        }

        Write-Host "  OK        RDS $dbId status=$current" -ForegroundColor DarkGray
        if ($current -in @('starting', 'stopping', 'backing-up', 'modifying')) {
            $rdsStarted += $dbId
        }
    }
}

Write-Host "`n[3/9] Restoring sandbox Auto Scaling Groups..." -ForegroundColor Cyan
foreach ($asg in @($asgs)) {
    if (-not $asg.name) {
        continue
    }

    $min = [int]$asg.minSize
    $desired = [int]$asg.desiredCapacity
    $max = [int]$asg.maxSize
    $suspendedProcesses = @(if ($asg.PSObject.Properties.Name -contains 'suspendedProcesses') { $asg.suspendedProcesses } else { @() })

    if ($PSCmdlet.ShouldProcess($asg.name, "Restore ASG min/desired/max=$min/$desired/$max")) {
        Invoke-AwsText -Arguments @(
            'autoscaling', 'resume-processes',
            '--auto-scaling-group-name', $asg.name,
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null

        Invoke-AwsText -Arguments @(
            'autoscaling', 'update-auto-scaling-group',
            '--auto-scaling-group-name', $asg.name,
            '--min-size', "$min",
            '--desired-capacity', "$desired",
            '--max-size', "$max",
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null

        if ($suspendedProcesses.Count -gt 0) {
            Invoke-AwsText -Arguments (@(
                    'autoscaling', 'suspend-processes',
                    '--auto-scaling-group-name', $asg.name,
                    '--scaling-processes'
                ) + $suspendedProcesses + @(
                    '--region', $Region,
                    '--output', 'text'
                )) | Out-Null
        }

        Write-Host "  RESTORED  $($asg.name) ($min/$desired/$max)" -ForegroundColor Green
    }
}

Write-Host "`n[4/9] Restoring ECS Application Auto Scaling..." -ForegroundColor Cyan
foreach ($target in @($scalableTargets)) {
    if (-not $target.resourceId) {
        continue
    }

    $min = [int]$target.minCapacity
    $max = [int]$target.maxCapacity
    $suspendedStateValue = Convert-SuspendedStateToCliValue -SuspendedState $target.suspendedState

    if ($PSCmdlet.ShouldProcess($target.resourceId, "Restore scalable target min=$min max=$max")) {
        Invoke-AwsText -Arguments @(
            'application-autoscaling', 'register-scalable-target',
            '--service-namespace', 'ecs',
            '--resource-id', $target.resourceId,
            '--scalable-dimension', 'ecs:service:DesiredCount',
            '--min-capacity', "$min",
            '--max-capacity', "$max",
            '--suspended-state', $suspendedStateValue,
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null
        Write-Host "  RESTORED  $($target.resourceId) min=$min max=$max" -ForegroundColor Green
    }
}

Write-Host "`n[5/9] Configuring sandbox SQS runtime attributes..." -ForegroundColor Cyan
Set-SqsRuntimeAttributes -Queues $sqsQueues

Write-Host "`n[6/9] Enabling Lambda event-source mappings..." -ForegroundColor Cyan
foreach ($mapping in @($lambdaMappings | Where-Object { $_.wasEnabled -ne $false })) {
    if (-not $mapping.uuid) {
        continue
    }

    if ($PSCmdlet.ShouldProcess("$($mapping.functionName) $($mapping.uuid)", 'Enable Lambda event-source mapping')) {
        Invoke-AwsText -Arguments @(
            'lambda', 'update-event-source-mapping',
            '--uuid', $mapping.uuid,
            '--enabled',
            '--region', $Region,
            '--output', 'text',
            '--query', 'State'
        ) | Out-Null
        $queueName = if ($mapping.source) { ($mapping.source -split ':')[-1] } else { $mapping.uuid }
        Write-Host "  ENABLED   $($mapping.functionName) <- $queueName" -ForegroundColor Green
    }
}

Write-Host "`n[7/9] Enabling EventBridge scheduled rules..." -ForegroundColor Cyan
foreach ($rule in @($eventRules | Where-Object { $_.wasEnabled -ne $false })) {
    if (-not $rule.name) {
        continue
    }

    if ($PSCmdlet.ShouldProcess($rule.name, 'Enable EventBridge rule')) {
        Invoke-AwsText -Arguments @(
            'events', 'enable-rule',
            '--name', $rule.name,
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null
        Write-Host "  ENABLED   $($rule.name)" -ForegroundColor Green
    }
}

Write-Host "`n[8/9] Restoring ECS service desired counts..." -ForegroundColor Cyan
foreach ($service in @($ecsServices)) {
    if (-not $service.cluster -or -not $service.service) {
        continue
    }

    $desired = [int]$service.desiredCount
    $updateArgs = @(
        'ecs', 'update-service',
        '--cluster', $service.cluster,
        '--service', $service.service,
        '--desired-count', "$desired",
        '--region', $Region,
        '--output', 'text',
        '--query', 'service.serviceName'
    )

    $taskDef = if ($RestoreTaskDefinitions -and $service.PSObject.Properties.Name -contains 'taskDef') { $service.taskDef } else { $null }
    if ($taskDef) {
        $currentTaskDef = Invoke-AwsJson -Arguments @(
            'ecs', 'describe-services',
            '--cluster', $service.cluster,
            '--services', $service.service,
            '--region', $Region,
            '--query', 'services[0].taskDefinition',
            '--output', 'json'
        )

        if ($currentTaskDef -ne $taskDef) {
            $updateArgs += @('--task-definition', $taskDef)
        }
    }

    if ($PSCmdlet.ShouldProcess("$($service.cluster)/$($service.service)", "Restore desired count to $desired")) {
        Invoke-AwsText -Arguments $updateArgs | Out-Null
        Write-Host "  RESTORED  $($service.cluster)/$($service.service) desired=$desired" -ForegroundColor Green
    }
}

Write-Host "`n[9/9] Starting standalone EC2 instances..." -ForegroundColor Cyan
$ec2ToStart = @($standaloneEc2Instances | Where-Object { $_.wasRunning } | ForEach-Object { $_.id })
if ($ec2ToStart.Count -eq 0) {
    Write-Host '  None.' -ForegroundColor DarkGray
} elseif ($PSCmdlet.ShouldProcess(($ec2ToStart -join ', '), 'Start standalone EC2 instances')) {
    Invoke-AwsText -Arguments (@(
            'ec2', 'start-instances',
            '--instance-ids'
        ) + $ec2ToStart + @(
            '--region', $Region,
            '--output', 'text'
        )) | Out-Null
    Write-Host "  STARTING  EC2 $($ec2ToStart -join ', ')" -ForegroundColor Green
}

if (-not $SkipWait) {
    Write-Host "`n[wait] Waiting for RDS and ECS readiness..." -ForegroundColor Cyan
    if (-not $SkipRds -and $rdsStarted.Count -gt 0) {
        Wait-ForRdsAvailable -DbIds $rdsStarted
    }
    Wait-ForEcsServices -Services $ecsServices
} else {
    Write-Host "`n[wait] Skipped by -SkipWait." -ForegroundColor DarkGray
}

Write-Host "`nPOWER ON COMPLETE" -ForegroundColor Green
Write-Host '  Restored: RDS, ASGs, ECS autoscaling, Lambda triggers, scheduled rules, ECS desired counts.' -ForegroundColor Green
Write-Host '  Backend/UI may need a minute after ECS reports running while health checks warm up.' -ForegroundColor Green
