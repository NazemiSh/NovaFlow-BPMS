param(
    [Parameter(Mandatory = $true)][string]$SitePath,
    [Parameter(Mandatory = $true)][string]$ExtractedAppPath,
    [Parameter(Mandatory = $true)][string]$BackupAppPath,
    [Parameter(Mandatory = $true)][string]$StatusFilePath,
    [Parameter(Mandatory = $true)][string]$HealthCheckUrl,
    [Parameter(Mandatory = $true)][string]$TargetVersion
)

$ErrorActionPreference = "Stop"
$UpdatesDir = Split-Path -Parent $StatusFilePath
$LogFilePath = Join-Path $UpdatesDir "agent.log"

function Write-AgentLog {
    param([string]$Message)
    try {
        if (!(Test-Path $UpdatesDir)) {
            New-Item -ItemType Directory -Path $UpdatesDir -Force | Out-Null
        }
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $LogFilePath -Value "[$ts] $Message" -Encoding UTF8
    } catch {}
}

function Write-UpdateStatus {
    param(
        [string]$State,
        [int]$Step,
        [string]$Message,
        [string]$ErrorText = $null
    )
    Write-AgentLog "STATUS [$State | Step $Step]: $Message $(if ($ErrorText) { "| Error: $ErrorText" })"
    $dir = Split-Path -Parent $StatusFilePath
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $obj = @{
        state         = $State
        step          = $Step
        message       = $Message
        targetVersion = $TargetVersion
        error         = $ErrorText
        updatedAt     = (Get-Date).ToUniversalTime().ToString("o")
    }
    $json = $obj | ConvertTo-Json -Depth 3
    [System.IO.File]::WriteAllText($StatusFilePath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Copy-AppFilesSafe {
    param(
        [string]$SourceDir,
        [string]$TargetDir
    )
    $srcNorm = $SourceDir.TrimEnd('\')
    $allFiles = Get-ChildItem -Path $srcNorm -Recurse -File
    $copiedCount = 0
    foreach ($file in $allFiles) {
        $rel = $file.FullName.Substring($srcNorm.Length).TrimStart('\')
        if ($rel -ieq "appsettings.json" -or
            $rel -ilike "wwwroot\uploads\*" -or
            $rel -ieq "wwwroot\uploads" -or
            $rel -ilike "App_Data\*" -or
            $rel -ieq "App_Data") {
            continue
        }
        $destFile = Join-Path $TargetDir $rel
        $destParent = Split-Path -Parent $destFile
        if (!(Test-Path $destParent)) {
            New-Item -ItemType Directory -Path $destParent -Force | Out-Null
        }
        Copy-Item -Path $file.FullName -Destination $destFile -Force
        $copiedCount++
    }
    Write-AgentLog "Copied $copiedCount files from '$SourceDir' to '$TargetDir' (preserved appsettings.json, wwwroot\uploads, App_Data)."
}

$appPoolName = $null
try {
    Write-AgentLog "=== Update-Agent started for target v$TargetVersion ==="
    Write-AgentLog "SitePath=$SitePath | ExtractedAppPath=$ExtractedAppPath | HealthCheckUrl=$HealthCheckUrl"

    Start-Sleep -Seconds 2

    Import-Module WebAdministration -ErrorAction Stop
    $normSitePath = [System.IO.Path]::GetFullPath($SitePath).TrimEnd('\')

    $matchedSite = Get-Website | Where-Object {
        $p = [System.Environment]::ExpandEnvironmentVariables($_.PhysicalPath)
        [System.IO.Path]::GetFullPath($p).TrimEnd('\') -ieq $normSitePath
    } | Select-Object -First 1

    if ($matchedSite) {
        $appPoolName = $matchedSite.ApplicationPool
        Write-AgentLog "Matched IIS Website '$($matchedSite.Name)' with AppPool '$appPoolName'."
    } else {
        $matchedApp = Get-WebApplication | Where-Object {
            $p = [System.Environment]::ExpandEnvironmentVariables($_.PhysicalPath)
            [System.IO.Path]::GetFullPath($p).TrimEnd('\') -ieq $normSitePath
        } | Select-Object -First 1
        if ($matchedApp) {
            $appPoolName = $matchedApp.ApplicationPool
            Write-AgentLog "Matched IIS WebApplication '$($matchedApp.Path)' with AppPool '$appPoolName'."
        }
    }

    if ([string]::IsNullOrWhiteSpace($appPoolName)) {
        throw "Could not resolve IIS Application Pool for physical path: $normSitePath"
    }

    Write-UpdateStatus -State "Deploying" -Step 3 -Message "در حال توقف سرویس IIS ($appPoolName) و جایگزینی فایل‌های نسخه v$TargetVersion..."

    $poolState = (Get-WebAppPoolState -Name $appPoolName).Value
    Write-AgentLog "Current AppPool '$appPoolName' state: $poolState"
    if ($poolState -ne "Stopped") {
        Stop-WebAppPool -Name $appPoolName
        $waitCount = 0
        while ((Get-WebAppPoolState -Name $appPoolName).Value -ne "Stopped" -and $waitCount -lt 20) {
            Start-Sleep -Milliseconds 750
            $waitCount++
        }
        Write-AgentLog "AppPool '$appPoolName' state after stop wait: $((Get-WebAppPoolState -Name $appPoolName).Value)"
    }

    Copy-AppFilesSafe -SourceDir $ExtractedAppPath -TargetDir $normSitePath

    Write-UpdateStatus -State "Verifying" -Step 3 -Message "در حال راه‌اندازی مجدد سرویس و بررسی سلامت سامانه..."
    Start-WebAppPool -Name $appPoolName
    Write-AgentLog "Started AppPool '$appPoolName'. Beginning health checks at $HealthCheckUrl..."

    try {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    } catch {}

    $healthy = $false
    for ($i = 1; $i -le 13; $i++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri $HealthCheckUrl -UseBasicParsing -TimeoutSec 5
            Write-AgentLog "Health check attempt $i returned HTTP $($resp.StatusCode)"
            if ($resp.StatusCode -eq 200) {
                $healthy = $true
                break
            }
        } catch {
            Write-AgentLog "Health check attempt $i failed: $($_.Exception.Message)"
        }
    }

    if ($healthy) {
        Write-UpdateStatus -State "Completed" -Step 4 -Message "به‌روزرسانی به نسخه v$TargetVersion با موفقیت انجام شد. در حال بارگذاری مجدد صفحه..."
    } else {
        Write-UpdateStatus -State "RolledBack" -Step 3 -Message "سامانه پس از به‌روزرسانی پاسخگو نبود؛ در حال بازگشت خودکار به نسخه قبلی..." -ErrorText "Health check timeout after 25s"

        if ((Get-WebAppPoolState -Name $appPoolName).Value -ne "Stopped") {
            Stop-WebAppPool -Name $appPoolName
            Start-Sleep -Seconds 3
        }
        Copy-AppFilesSafe -SourceDir $BackupAppPath -TargetDir $normSitePath
        Start-WebAppPool -Name $appPoolName

        Write-UpdateStatus -State "RolledBack" -Step 0 -Message "به‌روزرسانی ناموفق بود و سامانه به‌صورت خودکار به نسخه قبلی بازگردانده شد." -ErrorText "Health check failed; auto-rollback completed."
    }
}
catch {
    $errMsg = $_.Exception.Message
    Write-AgentLog "EXCEPTION: $errMsg"
    try {
        if ($appPoolName -and (Test-Path $BackupAppPath)) {
            if ((Get-WebAppPoolState -Name $appPoolName).Value -ne "Stopped") {
                Stop-WebAppPool -Name $appPoolName
                Start-Sleep -Seconds 2
            }
            Copy-AppFilesSafe -SourceDir $BackupAppPath -TargetDir $SitePath
            Start-WebAppPool -Name $appPoolName
            Write-UpdateStatus -State "RolledBack" -Step 0 -Message "خطا در به‌روزرسانی ($errMsg)؛ بازگشت خودکار به نسخه قبلی انجام شد." -ErrorText $errMsg
        } else {
            Write-UpdateStatus -State "Failed" -Step 0 -Message "خطا در اجرای به‌روزرسانی: $errMsg" -ErrorText $errMsg
        }
    } catch {
        $rbErr = $_.Exception.Message
        Write-AgentLog "ROLLBACK EXCEPTION: $rbErr"
        Write-UpdateStatus -State "Failed" -Step 0 -Message "خطا در اجرای به‌روزرسانی: $errMsg" -ErrorText "$errMsg | Rollback error: $rbErr"
    }
}
