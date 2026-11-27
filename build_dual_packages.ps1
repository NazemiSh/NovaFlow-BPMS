$ErrorActionPreference = "Stop"

$rootDir = "C:\Users\sh.nazemi\Desktop\BPMS"
$platformDir = Join-Path $rootDir "BPMS_Platform"
$nodeExe = Join-Path $rootDir ".tools\node\node.exe"
$viteJs = Join-Path $platformDir "bpms-client\node_modules\vite\bin\vite.js"
$clientDir = Join-Path $platformDir "bpms-client"
$clientDistDir = Join-Path $clientDir "dist"
$serverProj = Join-Path $platformDir "BPMS.Server\BPMS.Server.csproj"
$serverWwwroot = Join-Path $platformDir "BPMS.Server\wwwroot"
$backendDir = Join-Path $rootDir "publish_backend"

function Sync-ReleaseAppPackage {
    param(
        [string]$TargetAppDir,
        [string]$BackendDir,
        [string]$ClientDistDir
    )

    if (!(Test-Path $TargetAppDir)) {
        New-Item -ItemType Directory -Path $TargetAppDir -Force | Out-Null
    }

    # Copy all backend publish files and subdirectories (DLLs, exe, web.config, appsettings*.json, runtimes), excluding wwwroot
    Get-ChildItem -Path $BackendDir -Force | Where-Object { $_.Name -ne "wwwroot" } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $TargetAppDir -Recurse -Force
    }

    # Sync wwwroot static assets without deleting existing wwwroot\uploads
    $wwwroot = Join-Path $TargetAppDir "wwwroot"
    if (!(Test-Path $wwwroot)) {
        New-Item -ItemType Directory -Path $wwwroot -Force | Out-Null
    }

    $backendWwwroot = Join-Path $BackendDir "wwwroot"
    if (Test-Path $backendWwwroot) {
        Get-ChildItem -Path $backendWwwroot -Force | Where-Object { $_.Name -ne "assets" -and $_.Name -ne "index.html" } | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $wwwroot -Recurse -Force
        }
    }

    $uploadsDir = Join-Path $wwwroot "uploads"
    if (!(Test-Path $uploadsDir)) {
        New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null
    }

    if (Test-Path (Join-Path $wwwroot "assets")) {
        Remove-Item (Join-Path $wwwroot "assets") -Recurse -Force
    }
    Copy-Item (Join-Path $ClientDistDir "assets") -Destination $wwwroot -Recurse -Force
    Copy-Item (Join-Path $ClientDistDir "index.html") -Destination $wwwroot -Force
}

Write-Host "=========================================================="
Write-Host "1. Compiling and Publishing .NET 8 Backend to Release..."
Write-Host "=========================================================="
& dotnet publish -c Release --no-restore -o $backendDir $serverProj
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE."
}

Write-Host "=========================================================="
Write-Host "2. Building Clean Frontend (VITE_HIDE_DEV_CONTACT = true)..."
Write-Host "=========================================================="
$env:VITE_HIDE_DEV_CONTACT = "true"
& $nodeExe $viteJs build $clientDir
if ($LASTEXITCODE -ne 0) {
    throw "Clean frontend Vite build failed with exit code $LASTEXITCODE."
}

Write-Host "Deploying Clean release packages..."
$cleanPackageRoots = @(
    (Join-Path $rootDir "BPMS_Release_Clean"),
    (Join-Path $platformDir "BPMS_Release_Clean")
)

foreach ($pkgRoot in $cleanPackageRoots) {
    $tgt = Join-Path $pkgRoot "App"
    Sync-ReleaseAppPackage -TargetAppDir $tgt -BackendDir $backendDir -ClientDistDir $clientDistDir
}

Write-Host "=========================================================="
Write-Host "3. Building Standard Frontend (VITE_HIDE_DEV_CONTACT = false)..."
Write-Host "=========================================================="
$env:VITE_HIDE_DEV_CONTACT = "false"
& $nodeExe $viteJs build $clientDir
if ($LASTEXITCODE -ne 0) {
    throw "Standard frontend Vite build failed with exit code $LASTEXITCODE."
}

Write-Host "Updating BPMS.Server/wwwroot with Standard frontend build..."
if (Test-Path (Join-Path $serverWwwroot "assets")) {
    Remove-Item (Join-Path $serverWwwroot "assets") -Recurse -Force
}
Copy-Item (Join-Path $clientDistDir "assets") -Destination $serverWwwroot -Recurse -Force
Copy-Item (Join-Path $clientDistDir "index.html") -Destination $serverWwwroot -Force

Write-Host "Deploying Standard release packages..."
$standardPackageRoots = @(
    (Join-Path $rootDir "BPMS_Release"),
    (Join-Path $platformDir "BPMS_Release")
)

foreach ($pkgRoot in $standardPackageRoots) {
    $tgt = Join-Path $pkgRoot "App"
    Sync-ReleaseAppPackage -TargetAppDir $tgt -BackendDir $backendDir -ClientDistDir $clientDistDir
}

Write-Host "=========================================================="
Write-Host "4. Synchronizing Deploy-BPMS.ps1, Uninstall-BPMS.ps1 & BPMS_DB_Schema.sql..."
Write-Host "=========================================================="
$allPackageRoots = $standardPackageRoots + $cleanPackageRoots

# Pick newest Deploy-BPMS.ps1 between root and BPMS_Platform
$deployRoot = Join-Path $rootDir "Deploy-BPMS.ps1"
$deployPlatform = Join-Path $platformDir "Deploy-BPMS.ps1"
$deploySrc = if ((Test-Path $deployPlatform) -and ((!(Test-Path $deployRoot)) -or ((Get-Item $deployPlatform).LastWriteTimeUtc -ge (Get-Item $deployRoot).LastWriteTimeUtc))) {
    $deployPlatform
} else {
    $deployRoot
}
if ($deploySrc -ne $deployRoot) { Copy-Item $deploySrc -Destination $deployRoot -Force }
if ($deploySrc -ne $deployPlatform) { Copy-Item $deploySrc -Destination $deployPlatform -Force }

# Pick Uninstall-BPMS.ps1
$uninstallSrc = Join-Path $platformDir "Uninstall-BPMS.ps1"

# Pick newest BPMS_DB_Schema.sql between root and BPMS_Platform
$schemaRoot = Join-Path $rootDir "BPMS_DB_Schema.sql"
$schemaPlatform = Join-Path $platformDir "BPMS_DB_Schema.sql"
$schemaSrc = if ((Test-Path $schemaPlatform) -and ((!(Test-Path $schemaRoot)) -or ((Get-Item $schemaPlatform).LastWriteTimeUtc -gt (Get-Item $schemaRoot).LastWriteTimeUtc))) {
    $schemaPlatform
} else {
    $schemaRoot
}
if ($schemaSrc -ne $schemaRoot) { Copy-Item $schemaSrc -Destination $schemaRoot -Force }
if ($schemaSrc -ne $schemaPlatform) { Copy-Item $schemaSrc -Destination $schemaPlatform -Force }

foreach ($pkgRoot in $allPackageRoots) {
    if (!(Test-Path $pkgRoot)) {
        New-Item -ItemType Directory -Path $pkgRoot -Force | Out-Null
    }
    Copy-Item $deploySrc -Destination (Join-Path $pkgRoot "Deploy-BPMS.ps1") -Force
    Copy-Item $uninstallSrc -Destination (Join-Path $pkgRoot "Uninstall-BPMS.ps1") -Force
    Copy-Item $schemaSrc -Destination (Join-Path $pkgRoot "BPMS_DB_Schema.sql") -Force
}

Write-Host "=========================================================="
Write-Host "5. Verifying Release Package Integrity (Test-Path)..."
Write-Host "=========================================================="
$verificationErrors = @()
foreach ($pkgRoot in $allPackageRoots) {
    $requiredPaths = @(
        (Join-Path $pkgRoot "App\BPMS.Server.dll"),
        (Join-Path $pkgRoot "App\BPMS.Server.exe"),
        (Join-Path $pkgRoot "App\web.config"),
        (Join-Path $pkgRoot "App\appsettings.json"),
        (Join-Path $pkgRoot "App\wwwroot\index.html"),
        (Join-Path $pkgRoot "App\wwwroot\uploads"),
        (Join-Path $pkgRoot "Deploy-BPMS.ps1"),
        (Join-Path $pkgRoot "Uninstall-BPMS.ps1"),
        (Join-Path $pkgRoot "BPMS_DB_Schema.sql")
    )

    $pkgErrors = 0
    foreach ($req in $requiredPaths) {
        if (-not (Test-Path $req)) {
            $verificationErrors += "Missing required release artifact: $req"
            $pkgErrors++
        }
    }

    $jsBundles = Get-ChildItem -Path (Join-Path $pkgRoot "App\wwwroot\assets") -Filter "*.js" -ErrorAction SilentlyContinue
    if (-not $jsBundles -or $jsBundles.Count -eq 0) {
        $verificationErrors += "Missing compiled frontend JS bundle in: $(Join-Path $pkgRoot 'App\wwwroot\assets')"
        $pkgErrors++
    }

    if ($pkgErrors -eq 0) {
        Write-Host "[OK] Verified package: $pkgRoot" -ForegroundColor Green
    }
}

if ($verificationErrors.Count -gt 0) {
    $verificationErrors | ForEach-Object { Write-Host "[ERROR] $_" -ForegroundColor Red }
    throw "Release package verification failed with $($verificationErrors.Count) error(s)."
}

Write-Host "Dual release packaging (Standard & Clean) completed and verified successfully!" -ForegroundColor Green
