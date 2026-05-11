#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Powers off Ceragon runtime AWS resources for an overnight cost pause.

.DESCRIPTION
    Saves the current runtime shape, then stops or disables the resources that
    keep compute running:

    - ECS service desired counts across the Ceragon runtime clusters
    - ECS Application Auto Scaling scalable targets
    - sandbox Auto Scaling Groups and their EC2 capacity
    - RDS DB instances
    - Lambda SQS event-source mappings
    - EventBridge scheduled rules that launch runtime work
    - standalone Ceragon-tagged EC2 instances, if any exist

    The script intentionally does not delete always-on infrastructure such as
    ALBs, NAT gateways, VPC endpoints, S3, DynamoDB, SQS, ECR, CloudWatch logs,
    Route 53, or ACM certificates. Those still have baseline/storage costs.

.EXAMPLE
    ./scripts/ceragon-power-off.ps1

.EXAMPLE
    ./scripts/ceragon-power-off.ps1 -WhatIf

.EXAMPLE
    ./scripts/ceragon-power-off.ps1 -SkipRds
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [string]$Region = 'eu-north-1',
    [string]$ExpectedAccountId = '113627991972',
    [string[]]$EcsClusters = @(
        'backend',
        'frontend',
        'cera-workers-staging',
        'ceragon-intelligence-production'
    ),
    [string[]]$RdsInstances = @('codefense-postgressdb'),
    [string[]]$LambdaFunctions = @(
        'ceragon-intel-router-production',
        'ceragon-intel-dispatcher-production',
        'ceragon-intel-result-aggregator-production',
        'ceragon-intel-hotset-production',
        'ceragon-intel-verdict-writer-production',
        'ceragon-intel-metadata-only-production',
        'cera-sandbox-staging-wake-up'
    ),
    [string]$StatePath = '',
    [switch]$SkipRds,
    [switch]$SkipWait,
    [switch]$OverwriteState,
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

function Ensure-ParentDirectory {
    param([Parameter(Mandatory = $true)][string]$Path)

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
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

function Test-CeragonText {
    param([AllowNull()][string]$Text)
    return ($Text -match '(?i)cera|ceragon|codefence')
}

function Get-CeragonEcsServices {
    $services = @()

    foreach ($cluster in $EcsClusters) {
        try {
            $serviceArns = @(Invoke-AwsJson -Arguments @(
                    'ecs', 'list-services',
                    '--cluster', $cluster,
                    '--region', $Region,
                    '--query', 'serviceArns[]',
                    '--output', 'json'
                ))
        } catch {
            Write-Warning "Could not list ECS services for cluster ${cluster}: $($_.Exception.Message)"
            continue
        }

        if ($serviceArns.Count -eq 0) {
            continue
        }

        $describeArgs = @(
            'ecs', 'describe-services',
            '--cluster', $cluster,
            '--services'
        ) + $serviceArns + @('--region', $Region, '--output', 'json')

        $description = Invoke-AwsJson -Arguments $describeArgs
        foreach ($service in @($description.services)) {
            if ($service.status -eq 'INACTIVE') {
                continue
            }

            $services += [ordered]@{
                cluster      = $cluster
                service      = $service.serviceName
                desiredCount = [int]$service.desiredCount
                runningCount = [int]$service.runningCount
                pendingCount = [int]$service.pendingCount
                taskDef      = $service.taskDefinition
            }
        }
    }

    return @($services)
}

function Get-CeragonScalableTargets {
    $serviceIds = @{}
    foreach ($service in $State.ecsServices) {
        $serviceIds["service/$($service.cluster)/$($service.service)"] = $true
    }

    $targets = @()
    $response = Invoke-AwsJson -Arguments @(
        'application-autoscaling', 'describe-scalable-targets',
        '--service-namespace', 'ecs',
        '--region', $Region,
        '--output', 'json'
    )

    foreach ($target in @($response.ScalableTargets)) {
        if (-not $serviceIds.ContainsKey($target.ResourceId)) {
            continue
        }

        $targets += [ordered]@{
            resourceId     = $target.ResourceId
            minCapacity    = [int]$target.MinCapacity
            maxCapacity    = [int]$target.MaxCapacity
            suspendedState = $target.SuspendedState
        }
    }

    return @($targets)
}

function Get-CeragonAsgs {
    $asgs = @()
    $response = Invoke-AwsJson -Arguments @(
        'autoscaling', 'describe-auto-scaling-groups',
        '--region', $Region,
        '--output', 'json'
    )

    foreach ($asg in @($response.AutoScalingGroups)) {
        $tagText = (@($asg.Tags) | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' '
        if (-not (Test-CeragonText -Text $asg.AutoScalingGroupName) -and -not (Test-CeragonText -Text $tagText)) {
            continue
        }

        $asgs += [ordered]@{
            name               = $asg.AutoScalingGroupName
            minSize            = [int]$asg.MinSize
            desiredCapacity    = [int]$asg.DesiredCapacity
            maxSize            = [int]$asg.MaxSize
            suspendedProcesses = @($asg.SuspendedProcesses | ForEach-Object { $_.ProcessName })
            instanceIds        = @($asg.Instances | ForEach-Object { $_.InstanceId })
        }
    }

    return @($asgs)
}

function Get-CeragonRdsInstances {
    if ($SkipRds) {
        return @()
    }

    $instances = @()
    foreach ($dbId in $RdsInstances) {
        try {
            $response = Invoke-AwsJson -Arguments @(
                'rds', 'describe-db-instances',
                '--db-instance-identifier', $dbId,
                '--region', $Region,
                '--output', 'json'
            )
        } catch {
            Write-Warning "Could not describe RDS instance ${dbId}: $($_.Exception.Message)"
            continue
        }

        foreach ($db in @($response.DBInstances)) {
            $instances += [ordered]@{
                id                 = $db.DBInstanceIdentifier
                arn                = $db.DBInstanceArn
                status             = $db.DBInstanceStatus
                engine             = $db.Engine
                class              = $db.DBInstanceClass
                shouldStartOnPowerOn = ($db.DBInstanceStatus -in @('available', 'backing-up'))
            }
        }
    }

    return @($instances)
}

function Get-CeragonLambdaMappings {
    $mappings = @()

    foreach ($functionName in $LambdaFunctions) {
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
            $mappings += [ordered]@{
                functionName = $functionName
                uuid         = $mapping.UUID
                state        = $mapping.State
                wasEnabled   = ($mapping.State -eq 'Enabled' -or $mapping.State -eq 'Enabling')
                source       = $mapping.EventSourceArn
            }
        }
    }

    return @($mappings)
}

function Get-CeragonEventRules {
    $rules = @()
    $response = Invoke-AwsJson -Arguments @(
        'events', 'list-rules',
        '--region', $Region,
        '--output', 'json'
    )

    foreach ($rule in @($response.Rules)) {
        if (-not (Test-CeragonText -Text $rule.Name)) {
            continue
        }

        $rules += [ordered]@{
            name       = $rule.Name
            state      = $rule.State
            wasEnabled = ($rule.State -eq 'ENABLED')
            schedule   = $rule.ScheduleExpression
        }
    }

    return @($rules)
}

function Get-CeragonStandaloneEc2Instances {
    $instances = @()
    $response = Invoke-AwsJson -Arguments @(
        'ec2', 'describe-instances',
        '--region', $Region,
        '--filters', 'Name=instance-state-name,Values=pending,running,stopping,stopped',
        '--output', 'json'
    )

    foreach ($reservation in @($response.Reservations)) {
        foreach ($instance in @($reservation.Instances)) {
            $tagText = (@($instance.Tags) | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' '
            $asgTag = @($instance.Tags | Where-Object { $_.Key -eq 'aws:autoscaling:groupName' })
            if ($asgTag.Count -gt 0) {
                continue
            }

            if (-not (Test-CeragonText -Text $tagText)) {
                continue
            }

            $instances += [ordered]@{
                id         = $instance.InstanceId
                state      = $instance.State.Name
                type       = $instance.InstanceType
                wasRunning = ($instance.State.Name -eq 'running' -or $instance.State.Name -eq 'pending')
            }
        }
    }

    return @($instances)
}

function Test-StateHasRunningRuntime {
    return (
        (@($State.ecsServices | Where-Object { [int]$_.desiredCount -gt 0 }).Count -gt 0) -or
        (@($State.asgs | Where-Object { [int]$_.desiredCapacity -gt 0 }).Count -gt 0) -or
        (@($State.rdsInstances | Where-Object { $_.status -in @('available', 'backing-up', 'starting') }).Count -gt 0) -or
        (@($State.lambdaEventSourceMappings | Where-Object { $_.wasEnabled }).Count -gt 0) -or
        (@($State.eventBridgeRules | Where-Object { $_.wasEnabled }).Count -gt 0) -or
        (@($State.standaloneEc2Instances | Where-Object { $_.wasRunning }).Count -gt 0)
    )
}

function Wait-ForEcsZero {
    $targets = @($State.ecsServices)
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

            if ([int]$description.desired -ne 0 -or [int]$description.running -ne 0 -or [int]$description.pending -ne 0) {
                $pending += "$($target.cluster)/$($target.service)=$($description.running)/$($description.desired)"
            }
        }

        if ($pending.Count -eq 0) {
            Write-Host '  ECS services are at 0 desired/running.' -ForegroundColor Green
            return
        }

        Write-Host "  Waiting for ECS to drain: $($pending -join ', ')" -ForegroundColor DarkGray
        Start-Sleep -Seconds 15
    }

    Write-Warning "Timed out waiting for ECS services to drain after $WaitTimeoutSeconds seconds."
}

function Wait-ForAsgZero {
    $targets = @($State.asgs)
    if ($targets.Count -eq 0) {
        return
    }

    $deadline = (Get-Date).AddSeconds($WaitTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $pending = @()
        foreach ($target in $targets) {
            $asg = Invoke-AwsJson -Arguments @(
                'autoscaling', 'describe-auto-scaling-groups',
                '--auto-scaling-group-names', $target.name,
                '--region', $Region,
                '--query', 'AutoScalingGroups[0].{desired:DesiredCapacity,instances:Instances[].InstanceId}',
                '--output', 'json'
            )

            if ($asg -and ([int]$asg.desired -ne 0 -or @($asg.instances).Count -ne 0)) {
                $pending += "$($target.name)=desired:$($asg.desired),instances:$(@($asg.instances).Count)"
            }
        }

        if ($pending.Count -eq 0) {
            Write-Host '  ASG capacity is at 0.' -ForegroundColor Green
            return
        }

        Write-Host "  Waiting for ASGs to drain: $($pending -join ', ')" -ForegroundColor DarkGray
        Start-Sleep -Seconds 15
    }

    Write-Warning "Timed out waiting for ASGs to drain after $WaitTimeoutSeconds seconds."
}

if (-not $StatePath) {
    $StatePath = Get-DefaultStatePath
}

Write-Host '=====================================================' -ForegroundColor Yellow
Write-Host ' CERAGON AWS POWER OFF' -ForegroundColor Yellow
Write-Host ' Saving runtime state, then stopping paid compute' -ForegroundColor Yellow
Write-Host '=====================================================' -ForegroundColor Yellow

Initialize-AwsCli
$accountId = Assert-AwsAccount
Write-Host "Account: $accountId  Region: $Region" -ForegroundColor DarkGray
Write-Host "AWS CLI: $script:AwsExecutable $($script:AwsPrefixArgs -join ' ')" -ForegroundColor DarkGray
Write-Host "State:   $StatePath" -ForegroundColor DarkGray

$script:State = [ordered]@{
    schemaVersion             = 2
    savedAtUtc               = (Get-Date).ToUniversalTime().ToString('o')
    savedBy                  = 'ceragon-power-off.ps1'
    accountId                = $accountId
    region                   = $Region
    ecsClusters              = $EcsClusters
    ecsServices              = @()
    scalableTargets          = @()
    asgs                     = @()
    rdsInstances             = @()
    lambdaEventSourceMappings = @()
    eventBridgeRules         = @()
    standaloneEc2Instances   = @()
}

Write-Host "`n[1/8] Discovering current runtime state..." -ForegroundColor Cyan
$State.ecsServices = @(Get-CeragonEcsServices)
$State.scalableTargets = @(Get-CeragonScalableTargets)
$State.asgs = @(Get-CeragonAsgs)
$State.rdsInstances = @(Get-CeragonRdsInstances)
$State.lambdaEventSourceMappings = @(Get-CeragonLambdaMappings)
$State.eventBridgeRules = @(Get-CeragonEventRules)
$State.standaloneEc2Instances = @(Get-CeragonStandaloneEc2Instances)

Write-Host "  ECS services:          $(@($State.ecsServices).Count)" -ForegroundColor DarkGray
Write-Host "  ECS scalable targets:  $(@($State.scalableTargets).Count)" -ForegroundColor DarkGray
Write-Host "  ASGs:                  $(@($State.asgs).Count)" -ForegroundColor DarkGray
Write-Host "  RDS instances:         $(@($State.rdsInstances).Count)" -ForegroundColor DarkGray
Write-Host "  Lambda mappings:       $(@($State.lambdaEventSourceMappings).Count)" -ForegroundColor DarkGray
Write-Host "  EventBridge rules:     $(@($State.eventBridgeRules).Count)" -ForegroundColor DarkGray
Write-Host "  Standalone EC2:        $(@($State.standaloneEc2Instances).Count)" -ForegroundColor DarkGray

$stateHasRuntime = Test-StateHasRunningRuntime
$stateExists = Test-Path $StatePath
$shouldWriteState = $true
if ($stateExists -and -not $OverwriteState -and -not $stateHasRuntime) {
    $shouldWriteState = $false
    Write-Host "`n[2/8] Existing state preserved because runtime already looks powered off." -ForegroundColor Yellow
    Write-Host '      Use -OverwriteState to replace it anyway.' -ForegroundColor Yellow
} else {
    Write-Host "`n[2/8] Saving power state..." -ForegroundColor Cyan
    if ($PSCmdlet.ShouldProcess($StatePath, 'Write current runtime state')) {
        Ensure-ParentDirectory -Path $StatePath
        $State | ConvertTo-Json -Depth 10 | Set-Content -Path $StatePath -Encoding UTF8
        Write-Host "  Saved $StatePath" -ForegroundColor Green
    }
}

Write-Host "`n[3/8] Suspending ECS Application Auto Scaling..." -ForegroundColor Cyan
foreach ($target in @($State.scalableTargets)) {
    if ($PSCmdlet.ShouldProcess($target.resourceId, 'Set min=0 max=0 and suspend scaling')) {
        Invoke-AwsText -Arguments @(
            'application-autoscaling', 'register-scalable-target',
            '--service-namespace', 'ecs',
            '--resource-id', $target.resourceId,
            '--scalable-dimension', 'ecs:service:DesiredCount',
            '--min-capacity', '0',
            '--max-capacity', '0',
            '--suspended-state', 'DynamicScalingInSuspended=true,DynamicScalingOutSuspended=true,ScheduledScalingSuspended=true',
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null
        Write-Host "  SUSPENDED  $($target.resourceId)" -ForegroundColor Green
    }
}

Write-Host "`n[4/8] Disabling Lambda event-source mappings..." -ForegroundColor Cyan
foreach ($mapping in @($State.lambdaEventSourceMappings | Where-Object { $_.wasEnabled })) {
    if ($PSCmdlet.ShouldProcess("$($mapping.functionName) $($mapping.uuid)", 'Disable Lambda event-source mapping')) {
        Invoke-AwsText -Arguments @(
            'lambda', 'update-event-source-mapping',
            '--uuid', $mapping.uuid,
            '--no-enabled',
            '--region', $Region,
            '--output', 'text',
            '--query', 'State'
        ) | Out-Null
        $queueName = ($mapping.source -split ':')[-1]
        Write-Host "  DISABLED  $($mapping.functionName) <- $queueName" -ForegroundColor Green
    }
}

Write-Host "`n[5/8] Disabling EventBridge scheduled rules..." -ForegroundColor Cyan
foreach ($rule in @($State.eventBridgeRules | Where-Object { $_.wasEnabled })) {
    if ($PSCmdlet.ShouldProcess($rule.name, 'Disable EventBridge rule')) {
        Invoke-AwsText -Arguments @(
            'events', 'disable-rule',
            '--name', $rule.name,
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null
        Write-Host "  DISABLED  $($rule.name)" -ForegroundColor Green
    }
}

Write-Host "`n[6/8] Scaling ECS services to 0..." -ForegroundColor Cyan
foreach ($service in @($State.ecsServices)) {
    if ([int]$service.desiredCount -eq 0) {
        Write-Host "  OK        $($service.cluster)/$($service.service) already desired=0" -ForegroundColor DarkGray
        continue
    }

    if ($PSCmdlet.ShouldProcess("$($service.cluster)/$($service.service)", "Scale desired count $($service.desiredCount) -> 0")) {
        Invoke-AwsText -Arguments @(
            'ecs', 'update-service',
            '--cluster', $service.cluster,
            '--service', $service.service,
            '--desired-count', '0',
            '--region', $Region,
            '--output', 'text',
            '--query', 'service.serviceName'
        ) | Out-Null
        Write-Host "  DOWN      $($service.cluster)/$($service.service) ($($service.desiredCount) -> 0)" -ForegroundColor Green
    }
}

Write-Host "`n[7/8] Scaling sandbox Auto Scaling Groups to 0..." -ForegroundColor Cyan
foreach ($asg in @($State.asgs)) {
    if ([int]$asg.desiredCapacity -eq 0 -and [int]$asg.minSize -eq 0 -and [int]$asg.maxSize -eq 0) {
        Write-Host "  OK        $($asg.name) already min/desired/max=0/0/0" -ForegroundColor DarkGray
    } else {
        if ($PSCmdlet.ShouldProcess($asg.name, "Set ASG min/desired/max $($asg.minSize)/$($asg.desiredCapacity)/$($asg.maxSize) -> 0/0/0")) {
            Invoke-AwsText -Arguments @(
                'autoscaling', 'update-auto-scaling-group',
                '--auto-scaling-group-name', $asg.name,
                '--min-size', '0',
                '--desired-capacity', '0',
                '--max-size', '0',
                '--region', $Region,
                '--output', 'text'
            ) | Out-Null
            Write-Host "  DOWN      $($asg.name)" -ForegroundColor Green
        }
    }

    if ($PSCmdlet.ShouldProcess($asg.name, 'Suspend launch/scaling processes')) {
        Invoke-AwsText -Arguments @(
            'autoscaling', 'suspend-processes',
            '--auto-scaling-group-name', $asg.name,
            '--scaling-processes',
            'Launch',
            'AlarmNotification',
            'AZRebalance',
            'InstanceRefresh',
            'ReplaceUnhealthy',
            'ScheduledActions',
            'AddToLoadBalancer',
            '--region', $Region,
            '--output', 'text'
        ) | Out-Null
        Write-Host "  SUSPENDED $($asg.name) launch/scaling processes" -ForegroundColor Green
    }
}

Write-Host "`n[8/8] Stopping RDS and standalone EC2..." -ForegroundColor Cyan
foreach ($db in @($State.rdsInstances)) {
    if ($db.status -eq 'available' -or $db.status -eq 'backing-up') {
        if ($PSCmdlet.ShouldProcess($db.id, 'Stop RDS DB instance')) {
            Invoke-AwsText -Arguments @(
                'rds', 'stop-db-instance',
                '--db-instance-identifier', $db.id,
                '--region', $Region,
                '--output', 'text',
                '--query', 'DBInstance.DBInstanceStatus'
            ) | Out-Null
            Write-Host "  STOPPING   RDS $($db.id)" -ForegroundColor Green
        }
    } else {
        Write-Host "  OK         RDS $($db.id) status=$($db.status)" -ForegroundColor DarkGray
    }
}

$ec2ToStop = @($State.standaloneEc2Instances | Where-Object { $_.wasRunning } | ForEach-Object { $_.id })
if ($ec2ToStop.Count -gt 0 -and $PSCmdlet.ShouldProcess(($ec2ToStop -join ', '), 'Stop standalone EC2 instances')) {
    Invoke-AwsText -Arguments (@(
            'ec2', 'stop-instances',
            '--instance-ids'
        ) + $ec2ToStop + @(
            '--region', $Region,
            '--output', 'text'
        )) | Out-Null
    Write-Host "  STOPPING   EC2 $($ec2ToStop -join ', ')" -ForegroundColor Green
}

if (-not $SkipWait) {
    Write-Host "`n[wait] Waiting for ECS/ASG compute to drain..." -ForegroundColor Cyan
    Wait-ForEcsZero
    Wait-ForAsgZero
} else {
    Write-Host "`n[wait] Skipped by -SkipWait." -ForegroundColor DarkGray
}

Write-Host "`nPOWER OFF COMPLETE" -ForegroundColor Yellow
if ($shouldWriteState) {
    Write-Host "  Restore file: $StatePath" -ForegroundColor Yellow
}
Write-Host '  Stopped/scaled: ECS services, ECS autoscaling, sandbox ASGs, RDS, runtime Lambda triggers, scheduled rules.' -ForegroundColor Yellow
Write-Host '  Still billable: ALBs, NAT gateway, VPC endpoints, S3, DynamoDB, SQS, ECR, CloudWatch logs, Route 53, ACM.' -ForegroundColor Yellow
Write-Host '  RDS note: AWS can auto-start a stopped RDS instance after 7 days.' -ForegroundColor Yellow
