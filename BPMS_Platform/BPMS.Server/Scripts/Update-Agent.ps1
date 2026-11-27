param(
    [Parameter(Mandatory = $true)][string]$SitePath,
    [Parameter(Mandatory = $true)][string]$ExtractedAppPath,
    [Parameter(Mandatory = $true)][string]$BackupAppPath,
    [Parameter(Mandatory = $true)][string]$StatusFilePath,
    [Parameter(Mandatory = $true)][string]$HealthCheckUrl,
    [Parameter(Mandatory = $true)][string]$TargetVersion
)

$ErrorActionPreference = "Stop"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
    if (-not ("TrustAllCertsPolicy" -as [type])) {
        Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) { return true; }
}
"@
    }
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
} catch {}

$UpdatesDir = Split-Path -Parent $StatusFilePath
$LogFilePath = Join-Path $UpdatesDir "agent.log"
$NormSitePath = [System.IO.Path]::GetFullPath($SitePath).TrimEnd('\')
$AppOfflinePath = Join-Path $NormSitePath "app_offline.htm"
$TargetDllPath = Join-Path $NormSitePath "BPMS.Server.dll"

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

function Enable-AppOffline {
    $html = @"
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>در حال به‌روزرسانی | نوافلو</title>
  <style>
    body { font-family: Tahoma, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px 40px; text-align: center; max-width: 460px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
    h2 { margin: 0 0 12px; font-size: 18px; color: #38bdf8; }
    p { margin: 0; font-size: 14px; line-height: 1.8; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="box">
    <h2>به‌روزرسانی سامانه نوافلو</h2>
    <p>سامانه نوافلو در حال به‌روزرسانی به نسخه جدید است؛ لطفاً چند لحظه صبر کنید...</p>
  </div>
</body>
</html>
"@
    [System.IO.File]::WriteAllText($AppOfflinePath, $html, [System.Text.UTF8Encoding]::new($false))
    Write-AgentLog "Created app_offline.htm at '$AppOfflinePath'."
}

function Disable-AppOffline {
    if (Test-Path $AppOfflinePath) {
        Remove-Item -Path $AppOfflinePath -Force -ErrorAction SilentlyContinue
        Write-AgentLog "Removed app_offline.htm from '$AppOfflinePath'."
    }
}

function Wait-DllUnlocked {
    param([int]$TimeoutSeconds = 15)
    if (!(Test-Path $TargetDllPath)) {
        return
    }
    $maxAttempts = $TimeoutSeconds * 2
    for ($i = 1; $i -le $maxAttempts; $i++) {
        try {
            $fs = [System.IO.File]::Open($TargetDllPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $fs.Close()
            $fs.Dispose()
            Write-AgentLog "BPMS.Server.dll lock released after $($i * 0.5)s."
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    Write-AgentLog "Warning: BPMS.Server.dll still locked after ${TimeoutSeconds}s; attempting copy anyway."
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
            $rel -ieq "app_offline.htm" -or
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
    Write-AgentLog "Copied $copiedCount files from '$SourceDir' to '$TargetDir' (preserved appsettings.json, wwwroot\uploads, App_Data, app_offline.htm)."
}

try {
    Write-AgentLog "=== Update-Agent (app_offline.htm mode) started for target v$TargetVersion ==="
    Write-AgentLog "SitePath=$NormSitePath | ExtractedAppPath=$ExtractedAppPath | HealthCheckUrl=$HealthCheckUrl"

    Start-Sleep -Seconds 2

    Write-UpdateStatus -State "Deploying" -Step 3 -Message "در حال توقف ایمن برنامه (app_offline.htm) و جایگزینی فایل‌های نسخه v$TargetVersion..."
    Enable-AppOffline
    Wait-DllUnlocked -TimeoutSeconds 15

    Copy-AppFilesSafe -SourceDir $ExtractedAppPath -TargetDir $NormSitePath

    Write-UpdateStatus -State "Verifying" -Step 3 -Message "در حال راه‌اندازی مجدد سامانه و بررسی سلامت سرویس..."
    Disable-AppOffline

    Start-Sleep -Seconds 3

    $targetHost = $null
    try {
        $uri = [Uri]$HealthCheckUrl
        $targetHost = $uri.Authority
    } catch {}

    $probeTargets = @(
        @{ Url = $HealthCheckUrl; Headers = $null }
    )
    if (-not [string]::IsNullOrWhiteSpace($targetHost)) {
        $probeTargets += @{ Url = "http://127.0.0.1/api/settings/public"; Headers = @{ Host = $targetHost } }
        $probeTargets += @{ Url = "https://127.0.0.1/api/settings/public"; Headers = @{ Host = $targetHost } }
    }
    $probeTargets += @{ Url = "http://localhost/api/settings/public"; Headers = $null }

    $healthy = $false
    for ($i = 1; $i -le 15; $i++) {
        foreach ($probe in $probeTargets) {
            try {
                if ($probe.Headers) {
                    $resp = Invoke-WebRequest -Uri $probe.Url -Headers $probe.Headers -UseBasicParsing -TimeoutSec 8
                } else {
                    $resp = Invoke-WebRequest -Uri $probe.Url -UseBasicParsing -TimeoutSec 8
                }
                Write-AgentLog "Health check attempt $i ($($probe.Url)) returned HTTP $($resp.StatusCode)"
                if ($resp.StatusCode -eq 200) {
                    $healthy = $true
                    break
                }
            } catch {
                Write-AgentLog "Health check attempt $i ($($probe.Url)) failed: $($_.Exception.Message)"
            }
        }
        if ($healthy) { break }
        Start-Sleep -Seconds 2
    }

    if ($healthy) {
        Write-UpdateStatus -State "Completed" -Step 4 -Message "به‌روزرسانی به نسخه v$TargetVersion با موفقیت انجام شد. در حال بارگذاری مجدد صفحه..."
    } else {
        Write-AgentLog "Health check timed out after 25s. Starting Auto-Rollback..."
        Enable-AppOffline
        Wait-DllUnlocked -TimeoutSeconds 15
        Copy-AppFilesSafe -SourceDir $BackupAppPath -TargetDir $NormSitePath
        Disable-AppOffline
        Write-UpdateStatus -State "Failed" -Step 0 -Message "سامانه پس از به‌روزرسانی پاسخگو نبود؛ عملیات Rollback انجام شد و نسخه قبلی بازیابی گردید." -ErrorText "Health check timeout after 25s; Auto-Rollback completed."
    }
}
catch {
    $errMsg = $_.Exception.Message
    Write-AgentLog "EXCEPTION: $errMsg"
    try {
        if (Test-Path $BackupAppPath) {
            Enable-AppOffline
            Wait-DllUnlocked -TimeoutSeconds 15
            Copy-AppFilesSafe -SourceDir $BackupAppPath -TargetDir $NormSitePath
            Disable-AppOffline
            Write-UpdateStatus -State "Failed" -Step 0 -Message "خطا در به‌روزرسانی ($errMsg)؛ عملیات Rollback انجام شد و نسخه قبلی بازیابی گردید." -ErrorText $errMsg
        } else {
            Disable-AppOffline
            Write-UpdateStatus -State "Failed" -Step 0 -Message "خطا در اجرای به‌روزرسانی: $errMsg" -ErrorText $errMsg
        }
    } catch {
        $rbErr = $_.Exception.Message
        Write-AgentLog "ROLLBACK EXCEPTION: $rbErr"
        Disable-AppOffline
        Write-UpdateStatus -State "Failed" -Step 0 -Message "خطا در اجرای به‌روزرسانی: $errMsg" -ErrorText "$errMsg | Rollback error: $rbErr"
    }
}
