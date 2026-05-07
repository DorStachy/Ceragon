#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Power on Ceragon AWS assets for the work day.

.DESCRIPTION
    Restores ECS services, re-enables ECS auto-scaling, and enables
    Lambda event-source mappings. Uses the state file saved by
    ceragon-power-off.ps1 to restore exact previous desired counts.

    If no state file exists, uses current production defaults.
    Waits for services to reach steady state unless -SkipWait is used.

.EXAMPLE
    .\scripts\ceragon-power-on.ps1
    .\scripts\ceragon-power-on.ps1 -WhatIf
    .\scripts\ceragon-power-on.ps1 -SkipWait
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Region = 'eu-north-1',
    [switch]$SkipWait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$banner = @"
=====================================================
 CERAGON PIPELINE - POWER ON
 Restoring services
=====================================================
"@
Write-Host $banner -ForegroundColor Green

$defaults = @{
    services = @(
        @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intelligence-artifact-fetcher-production'; desiredCount = 2 },
        @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-multi-follower-production'; desiredCount = 1 },
        @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-static-worker-production'; desiredCount = 3 },
        @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-sandbox-worker-production'; desiredCount = 1 },
        @{ cluster = 'backend'; service = 'backend-service'; desiredCount = 1 },
        @{ cluster = 'frontend'; service = 'frontend'; desiredCount = 1 }
    )
    autoScaling = @(
        @{ resourceId = 'service/ceragon-intelligence-production/ceragon-intelligence-artifact-fetcher-production'; minCapacity = 1; maxCapacity = 2 },
        @{ resourceId = 'service/ceragon-intelligence-production/ceragon-intel-static-worker-production'; minCapacity = 1; maxCapacity = 3 },
        @{ resourceId = 'service/ceragon-intelligence-production/ceragon-intel-sandbox-worker-production'; minCapacity = 1; maxCapacity = 3 },
        @{ resourceId = 'service/cera-workers-staging/cera-sandbox-worker-staging'; minCapacity = 0; maxCapacity = 1 }
    )
    asgs = @(
        @{ name = 'cera-sandbox-intel-asg'; minSize = 1; desiredCapacity = 3; maxSize = 3 }
    )
}

Write-Host "`n[1/6] Loading state..." -ForegroundColor Cyan

$stateFile = Join-Path $PSScriptRoot 'ceragon-power-state.json'
$state = $null

if (Test-Path $stateFile) {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    Write-Host "  Loaded state from: $stateFile" -ForegroundColor Green
    Write-Host "  Saved at: $($state.savedAt)" -ForegroundColor DarkGray
} else {
    Write-Host "  No state file found - using defaults" -ForegroundColor Yellow
}

Write-Host "`n[2/7] Resuming auto-scaling..." -ForegroundColor Cyan

$asTargets = if ($state -and $state.autoScaling) { @($state.autoScaling) } else { @($defaults.autoScaling) }

foreach ($target in $asTargets) {
    $rid = if ($target.resourceId) { $target.resourceId } else { $target.id }
    $min = [int]$target.minCapacity
    $max = [int]$target.maxCapacity

    if ($PSCmdlet.ShouldProcess($rid, "Resume auto-scaling (min=$min, max=$max)")) {
        aws application-autoscaling register-scalable-target `
            --service-namespace ecs `
            --resource-id $rid `
            --scalable-dimension "ecs:service:DesiredCount" `
            --min-capacity $min `
            --max-capacity $max `
            --suspended-state "DynamicScalingInSuspended=false,DynamicScalingOutSuspended=false,ScheduledScalingSuspended=false" `
            --region $Region `
            --output text | Out-Null
        Write-Host "  RESUMED  $rid (min=$min, max=$max)" -ForegroundColor Green
    }
}

Write-Host "`n[3/7] Restoring EC2 auto-scaling groups..." -ForegroundColor Cyan

$asgTargets = if ($state -and $state.asgs) { @($state.asgs) } else { @($defaults.asgs) }

foreach ($asg in $asgTargets) {
    $name = $asg.name
    $min = [int]$asg.minSize
    $desired = [int]$asg.desiredCapacity
    $max = [int]$asg.maxSize

    if ($PSCmdlet.ShouldProcess($name, "Restore ASG (min=$min, desired=$desired, max=$max)")) {
        aws autoscaling resume-processes `
            --auto-scaling-group-name $name `
            --region $Region `
            --output text | Out-Null

        aws autoscaling update-auto-scaling-group `
            --auto-scaling-group-name $name `
            --min-size $min `
            --desired-capacity $desired `
            --max-size $max `
            --region $Region `
            --output text | Out-Null

        Write-Host "  RESUMED  $name (min=$min, desired=$desired, max=$max)" -ForegroundColor Green
    }
}

Write-Host "`n[4/7] Restoring ECS services..." -ForegroundColor Cyan

$svcTargets = if ($state -and $state.services) { @($state.services) } else { @($defaults.services) }
$mustRunServices = @(
    'ceragon-intelligence-artifact-fetcher-production',
    'ceragon-multi-follower-production',
    'ceragon-intel-static-worker-production',
    'ceragon-intel-sandbox-worker-production',
    'backend-service',
    'frontend'
)

foreach ($target in $svcTargets) {
    $cluster = $target.cluster
    $svc = $target.service
    $desired = [int]$target.desiredCount
    $taskDef = if ($target.PSObject.Properties.Name -contains 'taskDef') { $target.taskDef } else { $null }

    if ($desired -eq 0 -and $svc -in $mustRunServices) {
        $desired = 1
        Write-Host "  NOTE  $svc was recorded at 0, restoring to 1" -ForegroundColor Yellow
    }

    $current = aws ecs describe-services `
        --cluster $cluster --services $svc `
        --region $Region `
        --query "services[0].{desired:desiredCount,taskDef:taskDefinition}" `
        --output json | ConvertFrom-Json

    $currentDesired = [int]$current.desired
    $currentTaskDef = $current.taskDef
    $needsTaskDefUpdate = $taskDef -and $currentTaskDef -ne $taskDef

    if ($currentDesired -eq $desired -and -not $needsTaskDefUpdate) {
        Write-Host "  OK    $svc (desired=$desired, taskDef unchanged)" -ForegroundColor DarkGray
        continue
    }

    $action = if ($needsTaskDefUpdate) {
        "Restore to desired=$desired and taskDef=$taskDef"
    } else {
        "Scale to $desired (was $currentDesired)"
    }

    if ($PSCmdlet.ShouldProcess("$cluster/$svc", $action)) {
        $awsArgs = @(
            'ecs', 'update-service',
            '--cluster', $cluster,
            '--service', $svc,
            '--desired-count', "$desired",
            '--region', $Region,
            '--output', 'text',
            '--query', 'service.serviceName'
        )

        if ($needsTaskDefUpdate) {
            $awsArgs += @('--task-definition', $taskDef)
        }

        aws @awsArgs | Out-Null

        if ($needsTaskDefUpdate) {
            Write-Host "  RESTORED  $svc ($currentDesired -> $desired, taskDef reset)" -ForegroundColor Green
        } else {
            Write-Host "  UP    $svc ($currentDesired -> $desired)" -ForegroundColor Green
        }
    }
}

Write-Host "`n[5/7] Enabling Lambda ESMs..." -ForegroundColor Cyan

if ($state -and $state.esms) {
    foreach ($esm in @($state.esms)) {
        if (-not $esm.wasEnabled) {
            Write-Host "  SKIP  $($esm.functionName)/$($esm.uuid) (was disabled before power-off)" -ForegroundColor DarkGray
            continue
        }

        if ($PSCmdlet.ShouldProcess("$($esm.functionName) ESM $($esm.uuid)", 'Enable')) {
            aws lambda update-event-source-mapping `
                --uuid $esm.uuid `
                --enabled `
                --region $Region `
                --output text --query "State" | Out-Null
            $queueName = ($esm.source -split ':')[-1]
            Write-Host "  ENABLED  $($esm.functionName) <- $queueName" -ForegroundColor Green
        }
    }
} else {
    $lambdas = @(
        'ceragon-intel-router-production',
        'ceragon-intel-dispatcher-production',
        'ceragon-intel-result-aggregator-production',
        'ceragon-intel-hotset-production',
        'ceragon-intel-verdict-writer-production',
        'ceragon-intel-metadata-only-production'
    )

    foreach ($fn in $lambdas) {
        $esms = aws lambda list-event-source-mappings `
            --function-name $fn --region $Region `
            --query "EventSourceMappings[?State!='Enabled'].{uuid:UUID,state:State,source:EventSourceArn}" `
            --output json | ConvertFrom-Json

        foreach ($esm in @($esms)) {
            if ($PSCmdlet.ShouldProcess("$fn ESM $($esm.uuid)", 'Enable')) {
                aws lambda update-event-source-mapping `
                    --uuid $esm.uuid `
                    --enabled `
                    --region $Region `
                    --output text --query "State" | Out-Null
                $queueName = ($esm.source -split ':')[-1]
                Write-Host "  ENABLED  $fn <- $queueName" -ForegroundColor Green
            }
        }
    }
}

Write-Host "`n[6/7] Verifying Lambda CERAGON_ENV..." -ForegroundColor Cyan

$allLambdas = @(
    'ceragon-intel-router-production',
    'ceragon-intel-dispatcher-production',
    'ceragon-intel-result-aggregator-production',
    'ceragon-intel-hotset-production',
    'ceragon-intel-verdict-writer-production',
    'ceragon-intel-metadata-only-production'
)

foreach ($fn in $allLambdas) {
    $val = aws lambda get-function-configuration `
        --function-name $fn `
        --region $Region `
        --query "Environment.Variables.CERAGON_ENV" `
        --output text

    $shortName = $fn -replace 'ceragon-intel-', '' -replace '-production', ''
    if ($val -eq 'production') {
        Write-Host "  OK    $shortName CERAGON_ENV=production" -ForegroundColor DarkGray
        continue
    }

    Write-Host "  WARN  $shortName CERAGON_ENV=$val (expected production)" -ForegroundColor Red
    if ($PSCmdlet.ShouldProcess($fn, 'Set CERAGON_ENV=production')) {
        $currentEnv = aws lambda get-function-configuration `
            --function-name $fn `
            --region $Region `
            --query "Environment.Variables" `
            --output json | ConvertFrom-Json

        $hash = @{}
        $currentEnv.PSObject.Properties | ForEach-Object { $hash[$_.Name] = $_.Value }
        $hash['CERAGON_ENV'] = 'production'

        $payload = @{ Variables = $hash } | ConvertTo-Json -Depth 3 -Compress
        $tmpPath = [System.IO.Path]::GetTempFileName()

        try {
            [System.IO.File]::WriteAllText($tmpPath, $payload)
            $tmpFilePath = $tmpPath -replace '\\', '/'
            aws lambda update-function-configuration `
                --function-name $fn `
                --region $Region `
                --environment "file://$tmpFilePath" `
                --output text --query "Environment.Variables.CERAGON_ENV" | Out-Null
        }
        finally {
            Remove-Item $tmpPath -ErrorAction SilentlyContinue
        }

        Write-Host "  FIXED  $shortName CERAGON_ENV=production" -ForegroundColor Green
    }
}

if (-not $SkipWait) {
    Write-Host "`n[7/7] Waiting for services to stabilize..." -ForegroundColor Cyan

    $waitTargets = @($svcTargets | Where-Object { [int]$_.desiredCount -gt 0 -or $_.service -in @('backend-service', 'frontend') })
    $maxWaitSec = 180
    $pollSec = 15
    $elapsed = 0
    $pending = @($waitTargets)

    while ($pending.Count -gt 0 -and $elapsed -lt $maxWaitSec) {
        Start-Sleep -Seconds $pollSec
        $elapsed += $pollSec

        $stillPending = @()
        foreach ($target in $pending) {
            $info = aws ecs describe-services `
                --cluster $target.cluster --services $target.service `
                --region $Region `
                --query "services[0].{desired:desiredCount,running:runningCount}" `
                --output json | ConvertFrom-Json

            if ([int]$info.desired -gt 0 -and [int]$info.running -ge [int]$info.desired) {
                Write-Host "  READY  $($target.service) ($($info.running)/$($info.desired))" -ForegroundColor Green
            } else {
                $stillPending += $target
            }
        }

        $pending = @($stillPending)
        if ($pending.Count -gt 0) {
            $names = ($pending | ForEach-Object { $_.service }) -join ', '
            Write-Host "  ...waiting (${elapsed}s) - pending: $names" -ForegroundColor DarkGray
        }
    }

    if ($pending.Count -gt 0) {
        Write-Host "`n  TIMEOUT  Some services still starting after ${maxWaitSec}s" -ForegroundColor Yellow
        foreach ($target in $pending) {
            Write-Host "    - $($target.service)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "`n[7/7] Skipping wait" -ForegroundColor DarkGray
}

Write-Host "" -ForegroundColor Green
Write-Host "POWER ON COMPLETE" -ForegroundColor Green
Write-Host "  ECS services restored to saved counts" -ForegroundColor Green
Write-Host "  ECS auto-scaling resumed" -ForegroundColor Green
Write-Host "  EC2 ASGs restored" -ForegroundColor Green
Write-Host "  Lambda ESMs re-enabled" -ForegroundColor Green
Write-Host "  CERAGON_ENV verified on all Lambdas" -ForegroundColor Green
Write-Host "  Pipeline is LIVE and processing." -ForegroundColor Green
