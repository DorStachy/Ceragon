#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Power off all Ceragon payable AWS assets overnight to save costs.
    
.DESCRIPTION
    Scales all ECS services to 0, suspends auto-scaling, and disables
    Lambda event-source mappings. Safe to run repeatedly.
    
    Estimated overnight savings: ~$2.50-4.00/night (Fargate tasks).
    NAT Gateway + VPC Endpoints remain active (~$2/day) because they
    are required infrastructure that is expensive to recreate.
    
.EXAMPLE
    .\scripts\ceragon-power-off.ps1
    .\scripts\ceragon-power-off.ps1 -WhatIf   # dry-run, show what would happen
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Region = 'eu-north-1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$banner = @"
╔═══════════════════════════════════════════════════╗
║        CERAGON PIPELINE — POWER OFF               ║
║        Scaling down all payable assets            ║
╚═══════════════════════════════════════════════════╝
"@
Write-Host $banner -ForegroundColor Yellow

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss UTC')

# ─────────────────────────────────────────────────────
# 1. Save current state so power-on knows what to restore
# ─────────────────────────────────────────────────────
Write-Host "`n[1/5] Saving current state..." -ForegroundColor Cyan

$stateFile = Join-Path $PSScriptRoot 'ceragon-power-state.json'

$state = [ordered]@{
    savedAt      = $timestamp
    savedBy      = 'ceragon-power-off.ps1'
    region       = $Region
    services     = @()
    autoScaling  = @()
    asgs         = @()
    esms         = @()
}

$ecsTargets = @(
    @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intelligence-artifact-fetcher-production' },
    @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-multi-follower-production' },
    @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-static-worker-production' },
    @{ cluster = 'ceragon-intelligence-production'; service = 'ceragon-intel-sandbox-worker-production' },
    @{ cluster = 'backend';                         service = 'backend-service' },
    @{ cluster = 'frontend';                        service = 'frontend' }
)

$lambdas = @(
    'ceragon-intel-router-production',
    'ceragon-intel-dispatcher-production',
    'ceragon-intel-result-aggregator-production',
    'ceragon-intel-hotset-production',
    'ceragon-intel-verdict-writer-production',
    'ceragon-intel-metadata-only-production'
)

$asgTargets = @(
    'cera-sandbox-intel-asg'
)

foreach ($target in $ecsTargets) {
    $current = aws ecs describe-services `
        --cluster $target.cluster --services $target.service `
        --region $Region `
        --query "services[0].{desired:desiredCount,running:runningCount,taskDef:taskDefinition}" `
        --output json | ConvertFrom-Json

    if (-not $current) {
        continue
    }

    $state.services += [ordered]@{
        cluster      = $target.cluster
        service      = $target.service
        desiredCount = $current.desired
        taskDef      = $current.taskDef
    }
}

$scalableTargets = aws application-autoscaling describe-scalable-targets `
    --service-namespace ecs --region $Region `
    --query "ScalableTargets[].{id:ResourceId,min:MinCapacity,max:MaxCapacity,suspended:SuspendedState}" `
    --output json | ConvertFrom-Json

foreach ($target in $scalableTargets) {
    $state.autoScaling += [ordered]@{
        resourceId  = $target.id
        minCapacity = $target.min
        maxCapacity = $target.max
    }
}

foreach ($asgName in $asgTargets) {
    $asg = aws autoscaling describe-auto-scaling-groups `
        --auto-scaling-group-names $asgName --region $Region `
        --query "AutoScalingGroups[0].{name:AutoScalingGroupName,min:MinSize,desired:DesiredCapacity,max:MaxSize}" `
        --output json | ConvertFrom-Json

    if (-not $asg -or -not $asg.name) {
        continue
    }

    $state.asgs += [ordered]@{
        name            = $asg.name
        minSize         = $asg.min
        desiredCapacity = $asg.desired
        maxSize         = $asg.max
    }
}

foreach ($fn in $lambdas) {
    $esms = aws lambda list-event-source-mappings `
        --function-name $fn --region $Region `
        --query "EventSourceMappings[].{uuid:UUID,state:State,source:EventSourceArn}" `
        --output json | ConvertFrom-Json

    foreach ($esm in $esms) {
        $state.esms += [ordered]@{
            functionName = $fn
            uuid         = $esm.uuid
            wasEnabled   = ($esm.state -eq 'Enabled')
            source       = $esm.source
        }
    }
}

$stateJson = $state | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($stateFile, $stateJson)
Write-Host "  State saved to: $stateFile" -ForegroundColor Green

# ─────────────────────────────────────────────────────
# 2. Scale down all ECS services to 0
# ─────────────────────────────────────────────────────
Write-Host "`n[2/5] Scaling down ECS services..." -ForegroundColor Cyan
foreach ($target in $state.services) {
    $cluster = $target.cluster
    $svc     = $target.service
    $desired = $target.desiredCount

    if ($desired -eq 0) {
        Write-Host "  OK    $svc (already at 0)" -ForegroundColor DarkGray
        continue
    }

    if ($PSCmdlet.ShouldProcess("$cluster/$svc", "Scale to 0 (was $desired)")) {
        aws ecs update-service `
            --cluster $cluster --service $svc `
            --desired-count 0 `
            --region $Region `
            --output text --query "service.serviceName" | Out-Null
        Write-Host "  DOWN  $svc  ($desired -> 0)" -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────
# 3. Zero and suspend ECS auto-scaling so it doesn't scale services back up
# ─────────────────────────────────────────────────────
Write-Host "`n[3/6] Suspending ECS auto-scaling..." -ForegroundColor Cyan

foreach ($target in $scalableTargets) {
    if ($PSCmdlet.ShouldProcess($target.id, "Suspend auto-scaling")) {
        aws application-autoscaling register-scalable-target `
            --service-namespace ecs `
            --resource-id $target.id `
            --scalable-dimension "ecs:service:DesiredCount" `
            --min-capacity 0 `
            --max-capacity 0 `
            --suspended-state "DynamicScalingInSuspended=true,DynamicScalingOutSuspended=true,ScheduledScalingSuspended=true" `
            --region $Region --output text | Out-Null
        Write-Host "  SUSPENDED  $($target.id) (min=0, max=0)" -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────
# 4. Scale down EC2-backed cluster capacity
# ─────────────────────────────────────────────────────
Write-Host "`n[4/6] Scaling down EC2 auto-scaling groups..." -ForegroundColor Cyan

foreach ($asg in $state.asgs) {
    if ($PSCmdlet.ShouldProcess($asg.name, "Scale ASG to 0")) {
        aws autoscaling update-auto-scaling-group `
            --auto-scaling-group-name $asg.name `
            --min-size 0 --desired-capacity 0 --max-size 0 `
            --region $Region --output text | Out-Null

        aws autoscaling suspend-processes `
            --auto-scaling-group-name $asg.name `
            --scaling-processes "Launch" "AlarmNotification" "AZRebalance" "HealthCheck" "InstanceRefresh" "ReplaceUnhealthy" "ScheduledActions" "AddToLoadBalancer" `
            --region $Region --output text | Out-Null

        $instances = aws autoscaling describe-auto-scaling-groups `
            --auto-scaling-group-names $asg.name --region $Region `
            --query "AutoScalingGroups[0].Instances[].InstanceId" `
            --output text

        foreach ($instanceId in ($instances -split '\s+' | Where-Object { $_ })) {
            aws autoscaling terminate-instance-in-auto-scaling-group `
                --instance-id $instanceId `
                --no-should-decrement-desired-capacity `
                --region $Region --output text | Out-Null
            Write-Host "  TERMINATING  $instanceId ($($asg.name))" -ForegroundColor Green
        }

        Write-Host "  DOWN  $($asg.name) (min=0, desired=0, max=0)" -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────
# 5. Disable Lambda event-source mappings (prevent invocations)
# ─────────────────────────────────────────────────────
Write-Host "`n[5/6] Disabling Lambda ESMs..." -ForegroundColor Cyan

foreach ($esm in $state.esms) {
    if (-not $esm.wasEnabled) {
        Write-Host "  SKIP  $($esm.functionName)/$($esm.uuid) (already disabled)" -ForegroundColor DarkGray
            continue
    }

    if ($PSCmdlet.ShouldProcess("$($esm.functionName) ESM $($esm.uuid)", "Disable")) {
        aws lambda update-event-source-mapping `
            --uuid $esm.uuid --no-enabled `
            --region $Region --output text --query "State" | Out-Null
        $queueName = ($esm.source -split ':')[-1]
        Write-Host "  DISABLED  $($esm.functionName) <- $queueName" -ForegroundColor Green
    }
}

# ─────────────────────────────────────────────────────
# 6. Save state file
# ─────────────────────────────────────────────────────
Write-Host "`n[6/6] Saving state file..." -ForegroundColor Cyan

$stateJson = $state | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($stateFile, $stateJson)
Write-Host "  State saved to: $stateFile" -ForegroundColor Green

# ─────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────
Write-Host "" -ForegroundColor Yellow
Write-Host "POWER OFF COMPLETE" -ForegroundColor Yellow
Write-Host "  ECS services scaled to 0" -ForegroundColor Yellow
Write-Host "  ECS auto-scaling suspended and zeroed" -ForegroundColor Yellow
Write-Host "  EC2 ASGs scaled to 0" -ForegroundColor Yellow
Write-Host "  Lambda ESMs disabled" -ForegroundColor Yellow
Write-Host "  Still running: NAT Gateway, VPC endpoints, SQS, DynamoDB" -ForegroundColor Yellow
Write-Host "  Run ceragon-power-on.ps1 to restore everything" -ForegroundColor Yellow
