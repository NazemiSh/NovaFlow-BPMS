<#
.SYNOPSIS
    Zero-Touch Interactive Deployment Script for BPMS / BRMS Platform on Windows Server (IIS + .NET 8 + SQL Server)
#>

[CmdletBinding()]
param(
    [string]$SiteName = "BPMS",
    [int]$Port = 0,
    [switch]$EnableHttps = $false,
    [string]$HostName = "",
    [string]$CertThumbprint = "",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\BPMS",
    [string]$AppPoolName = "BPMSAppPool",
    [string]$SqlConnectionString = "",
    [switch]$SkipPrereqCheck = $false,
    [switch]$SkipBuild = $false,
    [switch]$SkipDatabase = $false,
    [switch]$SkipIIS = $false,
    [switch]$ResetAdminPassword = $false,
    [string]$NewAdminPassword = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# -----------------------------------------------------------------------------
# Immediate Administrator Check
# -----------------------------------------------------------------------------
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "`n=================================================================" -ForegroundColor Red
    Write-Host "  [ERROR] ADMINISTRATOR PRIVILEGES REQUIRED" -ForegroundColor Red
    Write-Host "=================================================================" -ForegroundColor Red
    Write-Host "  Please run Windows PowerShell as Administrator and retry." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

function Write-Step {
    param([string]$Text)
    Write-Host "`n=================================================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Yellow
    Write-Host "=================================================================" -ForegroundColor Cyan
}

function Write-Success { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Info    { param([string]$Text) Write-Host "  [i]  $Text" -ForegroundColor Gray }
function Write-Warn    { param([string]$Text) Write-Host "  [!]  $Text" -ForegroundColor Yellow }
function Write-Err     { param([string]$Text) Write-Host "  [X]  $Text" -ForegroundColor Red }

function ConvertFrom-SecureStringPlain {
    param([Security.SecureString]$SecureValue)
    if ($null -eq $SecureValue) { return "" }
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

Write-Success "Administrator privileges verified."

# -----------------------------------------------------------------------------
# 1. Interactive Configuration (IIS Port & SQL Server Connection)
# -----------------------------------------------------------------------------
Write-Step "Step 1: Configuring IIS Port & SQL Server Connection"

if ($Port -le 0) {
    Write-Info "In production IIS mode, both Frontend and Backend API run unified on a single port."
    $inputPort = Read-Host "  > Enter IIS HTTP Port for the platform [Default: 80]"
    if ([string]::IsNullOrWhiteSpace($inputPort)) { $Port = 80 } else { $Port = [int]$inputPort }
}
Write-Success "Selected IIS HTTP Port: $Port"

if (-not $EnableHttps) {
    $httpsPrompt = Read-Host "  > Enable HTTPS (Port 443 with SSL / Wildcard Cert) & auto HTTP-to-HTTPS Redirect? (Y/N) [Default: N]"
    if ($httpsPrompt -match '^(?i)y(es)?$') {
        $EnableHttps = $true
    }
}

if ($EnableHttps) {
    Write-Host ""
    Write-Info "Scanning LocalMachine\My certificate store for valid SSL / Wildcard certificates..."
    $now = Get-Date
    $validCerts = @(
        Get-ChildItem -Path "Cert:\LocalMachine\My" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.HasPrivateKey -and
            $_.NotAfter -gt $now -and
            (
                -not $_.EnhancedKeyUsageList -or
                ($_.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq "1.3.6.1.5.5.7.3.1" -or $_.FriendlyName -like "*Server Authentication*" })
            )
        } |
        Sort-Object NotAfter -Descending
    )

    if ([string]::IsNullOrWhiteSpace($CertThumbprint)) {
        if ($validCerts.Count -gt 0) {
            Write-Host "  Available SSL Certificates in Cert:\LocalMachine\My:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $validCerts.Count; $i++) {
                $c = $validCerts[$i]
                $sanList = @()
                try {
                    $sanExt = $c.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.17" } | Select-Object -First 1
                    if ($sanExt) {
                        $sanText = $sanExt.Format($false)
                        if ($sanText) { $sanList = @($sanText -split ',\s*' | ForEach-Object { $_ -replace '^DNS Name=', '' }) }
                    }
                } catch {}
                $sanDisplay = if ($sanList.Count -gt 0) { " | SAN: $($sanList -join ', ')" } else { "" }
                $wildcardTag = if ($c.Subject -like '*`*.*' -or ($sanDisplay -like '*`*.*')) { " [WILDCARD]" } else { "" }
                Write-Host ("    [{0}] {1}{2} (Exp: {3:yyyy-MM-dd}) - Thumbprint: {4}{5}" -f ($i + 1), $c.Subject, $wildcardTag, $c.NotAfter, $c.Thumbprint, $sanDisplay) -ForegroundColor Gray
            }

            $certChoice = Read-Host "  > Select certificate number [1-$($validCerts.Count)] or paste Certificate Thumbprint"
            if ($certChoice -match '^\d+$' -and [int]$certChoice -ge 1 -and [int]$certChoice -le $validCerts.Count) {
                $selectedCert = $validCerts[[int]$certChoice - 1]
                $CertThumbprint = $selectedCert.Thumbprint
            } elseif (-not [string]::IsNullOrWhiteSpace($certChoice)) {
                $CertThumbprint = ($certChoice -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
            } else {
                Write-Warn "No certificate selected. Skipping HTTPS setup and continuing with HTTP only."
                $EnableHttps = $false
            }
        } else {
            Write-Warn "No valid SSL certificates with private keys found in Cert:\LocalMachine\My."
            $manualThumb = Read-Host "  > Paste SSL Certificate Thumbprint manually (or press Enter to disable HTTPS)"
            if ([string]::IsNullOrWhiteSpace($manualThumb)) {
                $EnableHttps = $false
            } else {
                $CertThumbprint = ($manualThumb -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
            }
        }
    } else {
        $CertThumbprint = ($CertThumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    }

    if ($EnableHttps -and -not [string]::IsNullOrWhiteSpace($CertThumbprint)) {
        $matchedCert = Get-Item -Path "Cert:\LocalMachine\My\$CertThumbprint" -ErrorAction SilentlyContinue
        if (-not $matchedCert) {
            throw "SSL certificate with Thumbprint '$CertThumbprint' was not found in Cert:\LocalMachine\My."
        }

        if ([string]::IsNullOrWhiteSpace($HostName)) {
            $suggestedHost = ""
            if ($matchedCert.Subject -match 'CN=([^,]+)') {
                $cn = $Matches[1].Trim()
                if ($cn -like '*.*') {
                    $suggestedHost = if ($cn.StartsWith('*.')) { "bpms." + $cn.Substring(2) } else { $cn }
                }
            }
            $hostPromptMsg = if ($suggestedHost) {
                "  > Enter Host Name for IIS HTTPS SNI Binding (e.g. $suggestedHost) [Default: $suggestedHost]"
            } else {
                "  > Enter Host Name for IIS HTTPS SNI Binding (e.g. bpms.yourdomain.ir)"
            }
            $inputHost = Read-Host $hostPromptMsg
            $HostName = if ([string]::IsNullOrWhiteSpace($inputHost)) { $suggestedHost } else { $inputHost.Trim() }
        }
        Write-Success "HTTPS enabled on Port 443 | Thumbprint: $CertThumbprint$(if ($HostName) { " | Host Name (SNI): $HostName" })"
    }
}

if ([string]::IsNullOrWhiteSpace($SqlConnectionString)) {
    Write-Host ""
    $sqlServer = Read-Host "  > Enter SQL Server Address (e.g. localhost or 192.168.1.10\SQLEXPRESS) [Default: localhost]"
    if ([string]::IsNullOrWhiteSpace($sqlServer)) { $sqlServer = "localhost" }

    $dbName = Read-Host "  > Enter Database Name [Default: BPMS_DB]"
    if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "BPMS_DB" }

    $authChoice = Read-Host "  > SQL Authentication Type: (1) SQL Login (e.g. sa)  |  (2) Windows Integrated Auth [Default: 1]"
    if ($authChoice -eq "2") {
        $SqlConnectionString = "Server=$sqlServer;Database=$dbName;Integrated Security=True;TrustServerCertificate=True;"
    } else {
        $sqlUser = Read-Host "  > Enter SQL Username [Default: sa]"
        if ([string]::IsNullOrWhiteSpace($sqlUser)) { $sqlUser = "sa" }

        $secPass = Read-Host "  > Enter Password for '$sqlUser'" -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass)
        $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

        $SqlConnectionString = "Server=$sqlServer;Database=$dbName;User Id=$sqlUser;Password=$plainPass;TrustServerCertificate=True;"
    }

    Write-Info "Testing connection to SQL Server ($sqlServer)..."
    try {
        $testConnStr = $SqlConnectionString -replace "Database=[^;]+;", "Database=master;"
        $conn = New-Object System.Data.SqlClient.SqlConnection($testConnStr)
        $conn.Open()
        $conn.Close()
        Write-Success "SQL Server connection established successfully."
    } catch {
        Write-Err "SQL Server connection failed: $($_.Exception.Message)"
        exit 1
    }
}

$ResetAdminPass = $false
if (-not $SkipDatabase) {
    if ($ResetAdminPassword -or (-not [string]::IsNullOrWhiteSpace($NewAdminPassword))) {
        $ResetAdminPass = $true
        if ([string]::IsNullOrWhiteSpace($NewAdminPassword)) {
            $NewAdminPassword = "Admin@123456"
            Write-Info "CLI mode (-ResetAdminPassword): default password 'Admin@123456' will be applied to 'local_admin'."
        } else {
            Write-Success "CLI mode: custom reset password provided for 'local_admin'."
        }
    } else {
        $NewAdminPassword = ""
        Write-Host ""
        $adminPassOption = Read-Host "  > Local Admin ('local_admin') Password Option: (1) Keep existing password (or default 'Admin@123456' on fresh install)  |  (2) Set / Reset new password [Default: 1]"
        if ($adminPassOption -eq "2") {
            $ResetAdminPass = $true
            while ($true) {
                $secPass1 = Read-Host "  > Enter new password for 'local_admin' [Leave empty for default 'Admin@123456']" -AsSecureString
                $pass1 = ConvertFrom-SecureStringPlain $secPass1
                if ([string]::IsNullOrWhiteSpace($pass1)) {
                    $NewAdminPassword = "Admin@123456"
                    Write-Info "No password entered; default password 'Admin@123456' will be set for 'local_admin'."
                    break
                }

                $secPass2 = Read-Host "  > Confirm new password for 'local_admin'" -AsSecureString
                $pass2 = ConvertFrom-SecureStringPlain $secPass2
                if ($pass1 -ceq $pass2) {
                    $NewAdminPassword = $pass1
                    Write-Success "New password confirmed for 'local_admin' reset."
                    break
                }

                Write-Err "Passwords do not match! Please enter and confirm the new password again."
            }
        } else {
            Write-Info "Selected option (1): Existing 'local_admin' password will be preserved (or 'Admin@123456' on fresh install)."
        }
    }
}

# -----------------------------------------------------------------------------
# Resolve Package Mode (Offline Pre-Built 'App' vs Source Code)
# -----------------------------------------------------------------------------
$ScriptRoot = $PSScriptRoot
if (-not $ScriptRoot) { $ScriptRoot = Get-Location }

$PrebuiltAppDir = Join-Path $ScriptRoot "App"
if (-not (Test-Path (Join-Path $PrebuiltAppDir "BPMS.Server.dll"))) {
    foreach ($altRel in @("BPMS_Release\App", "BPMS_Release_Clean\App")) {
        $AltPrebuilt = Join-Path $ScriptRoot $altRel
        if (Test-Path (Join-Path $AltPrebuilt "BPMS.Server.dll")) {
            $PrebuiltAppDir = $AltPrebuilt
            break
        }
    }
}

$IsPrebuiltPackage = Test-Path (Join-Path $PrebuiltAppDir "BPMS.Server.dll")

$ServerDir = Join-Path $ScriptRoot "BPMS.Server"
$ClientDir = Join-Path $ScriptRoot "bpms-client"
if (-not (Test-Path $ServerDir)) {
    $AltServerDir = Join-Path $ScriptRoot "BPMS_Platform\BPMS.Server"
    $AltClientDir = Join-Path $ScriptRoot "BPMS_Platform\bpms-client"
    if (Test-Path $AltServerDir) {
        $ServerDir = $AltServerDir
        $ClientDir = $AltClientDir
    }
}

if (-not $IsPrebuiltPackage -and -not (Test-Path $ServerDir)) {
    Write-Err "Neither pre-built 'App' folder nor 'BPMS.Server' source directory was found in: $ScriptRoot"
    exit 1
}

# Locate BPMS_DB_Schema.sql if available
$SchemaSqlPath = @(
    (Join-Path $ScriptRoot "BPMS_DB_Schema.sql"),
    (Join-Path $PrebuiltAppDir "BPMS_DB_Schema.sql"),
    (Join-Path (Split-Path $ServerDir -Parent) "BPMS_DB_Schema.sql")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

# -----------------------------------------------------------------------------
# 2. Validate Server Prerequisites
# -----------------------------------------------------------------------------
if (-not $SkipPrereqCheck) {
    Write-Step "Step 2: Validating Windows Server Prerequisites"

    $dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnetCmd) {
        Write-Err ".NET Runtime was not found. Please install .NET 8 Hosting Bundle."
        exit 1
    }
    Write-Success ".NET CLI found: $($dotnetCmd.Source)"

    $runtimes = & dotnet --list-runtimes 2>&1
    if (-not ($runtimes | Where-Object { $_ -match "Microsoft\.AspNetCore\.App 8\." })) {
        Write-Err "ASP.NET Core 8 Hosting Runtime was not detected. Please install .NET 8 Hosting Bundle."
        exit 1
    }
    Write-Success "ASP.NET Core 8 Hosting Runtime verified."

    if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) {
        Write-Err "IIS URL Rewrite 2.1 module was not found. Please install urlrewrite2.exe first."
        exit 1
    }
    Write-Success "IIS URL Rewrite module verified."

    $iisService = Get-Service -Name W3SVC -ErrorAction SilentlyContinue
    if (-not $iisService -or $iisService.Status -ne "Running") {
        Write-Err "IIS Web Server (W3SVC) is not installed or not running."
        exit 1
    }
    Write-Success "IIS Service (W3SVC) is running."
}

# -----------------------------------------------------------------------------
# 3. Prepare Staging Directory
# -----------------------------------------------------------------------------
$PublishDir = Join-Path $env:TEMP "BPMS_Publish_$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $PublishDir -Force | Out-Null

Write-Step "Step 3: Preparing Application Files"

if ($IsPrebuiltPackage) {
    Write-Success "Pre-built offline release package detected at: $PrebuiltAppDir"
    Write-Info "Skipping 'dotnet publish' and NuGet restore (100% Offline Mode)..."
    Copy-Item -Path "$PrebuiltAppDir\*" -Destination $PublishDir -Recurse -Force
    Write-Success "Pre-built application copied to staging directory."
} elseif (-not $SkipBuild) {
    $distDir = Join-Path $ClientDir "dist"
    $hasNode = Get-Command npm -ErrorAction SilentlyContinue

    if ($hasNode -and (Test-Path $ClientDir)) {
        Write-Info "Building React frontend using 'npm run build'..."
        Push-Location $ClientDir
        try {
            if (-not (Test-Path (Join-Path $ClientDir "node_modules"))) { & npm install --no-audit --prefer-offline }
            & npm run build
        } finally { Pop-Location }
    }

    Write-Info "Running 'dotnet publish' for BPMS.Server..."
    & dotnet publish (Join-Path $ServerDir "BPMS.Server.csproj") -c Release -o $PublishDir --nologo
    if ($LASTEXITCODE -ne 0) {
        Write-Err "dotnet publish failed with exit code $LASTEXITCODE."
        exit 1
    }

    if (Test-Path $distDir) {
        $targetWwwroot = Join-Path $PublishDir "wwwroot"
        if (-not (Test-Path $targetWwwroot)) { New-Item -ItemType Directory -Path $targetWwwroot -Force | Out-Null }
        Copy-Item -Path "$distDir\*" -Destination $targetWwwroot -Recurse -Force
    }
    Write-Success "Application compiled and published to staging directory."
}

# Ensure wwwroot and uploads exist
$targetWwwroot = Join-Path $PublishDir "wwwroot"
if (-not (Test-Path $targetWwwroot)) { New-Item -ItemType Directory -Path $targetWwwroot -Force | Out-Null }
$uploadsDir = Join-Path $targetWwwroot "uploads"
if (-not (Test-Path $uploadsDir)) { New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null }

# Generate optimized web.config (ASP.NET Core handles static files in wwwroot & SPA fallback)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$urlRewriteInstalled = Test-Path "$env:SystemRoot\System32\inetsrv\rewrite.dll"
$rewriteXmlBlock = ""
if ($EnableHttps -and $urlRewriteInstalled) {
    $rewriteXmlBlock = @"

      <rewrite>
        <rules>
          <rule name="Redirect HTTP to HTTPS" stopProcessing="true">
            <match url="(.*)" />
            <conditions logicalGrouping="MatchAll">
              <add input="{HTTPS}" pattern="^OFF$" ignoreCase="true" />
              <add input="{HTTP_X_FORWARDED_PROTO}" pattern="^https$" ignoreCase="true" negate="true" />
            </conditions>
            <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
          </rule>
        </rules>
      </rewrite>
"@
    Write-Success "IIS URL Rewrite module detected - adding 301 Permanent HTTP-to-HTTPS redirect rule to web.config."
} elseif ($EnableHttps) {
    Write-Warn "IIS URL Rewrite module (rewrite.dll) not detected; HTTP-to-HTTPS redirect will be handled by ASP.NET Core middleware."
}

$webConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet" arguments=".\BPMS.Server.dll" stdoutLogEnabled="false" stdoutLogFile=".\logs\stdout" hostingModel="inprocess">
        <environmentVariables>
          <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Production" />
        </environmentVariables>
      </aspNetCore>$rewriteXmlBlock
    </system.webServer>
  </location>
</configuration>
"@
[System.IO.File]::WriteAllText((Join-Path $PublishDir "web.config"), $webConfigContent, $utf8NoBom)
Write-Success "Generated clean web.config for ASP.NET Core InProcess hosting."

# Configure appsettings.json
$publishAppSettings = Join-Path $PublishDir "appsettings.json"
$exampleAppSettings = Join-Path $PublishDir "appsettings.Example.json"
if (-not (Test-Path $exampleAppSettings) -and (Test-Path (Join-Path $ServerDir "appsettings.Example.json"))) {
    $exampleAppSettings = Join-Path $ServerDir "appsettings.Example.json"
}

if (-not (Test-Path $publishAppSettings) -and (Test-Path $exampleAppSettings)) {
    Copy-Item -Path $exampleAppSettings -Destination $publishAppSettings -Force
    Write-Info "Created appsettings.json from appsettings.Example.json."
}

if (Test-Path $publishAppSettings) {
    $json = Get-Content $publishAppSettings -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($SqlConnectionString) {
        $json.ConnectionStrings.BPMS_DB = $SqlConnectionString
        Write-Success "Updated ConnectionStrings.BPMS_DB in appsettings.json."
    }

    $httpsConfigObj = [PSCustomObject]@{
        EnableHttpsRedirect   = [bool]$EnableHttps
        EnableHsts            = [bool]$EnableHttps
        TrustForwardedHeaders = $true
    }
    if ($null -eq $json.PSObject.Properties["HttpsSettings"]) {
        $json | Add-Member -NotePropertyName "HttpsSettings" -NotePropertyValue $httpsConfigObj
    } else {
        $json.HttpsSettings.EnableHttpsRedirect = [bool]$EnableHttps
        $json.HttpsSettings.EnableHsts = [bool]$EnableHttps
        $json.HttpsSettings.TrustForwardedHeaders = $true
    }

    [System.IO.File]::WriteAllText($publishAppSettings, ($json | ConvertTo-Json -Depth 10), $utf8NoBom)
    Write-Success "Updated HttpsSettings (EnableHttpsRedirect=$EnableHttps, EnableHsts=$EnableHttps) in appsettings.json."
}

# -----------------------------------------------------------------------------
# 4. Initialize Database & Seed Initial Admin
# -----------------------------------------------------------------------------
if (-not $SkipDatabase) {
    Write-Step "Step 4: Initializing SQL Server Database & Seeding Admin User"

    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($SqlConnectionString)
    $targetDb = $builder["Initial Catalog"]
    if ([string]::IsNullOrWhiteSpace($targetDb)) { $targetDb = $builder["Database"] }
    $builder["Initial Catalog"] = "master"

    Write-Info "Ensuring database '$targetDb' exists on SQL Server..."
    $conn = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "IF DB_ID('$targetDb') IS NULL CREATE DATABASE [$targetDb] COLLATE Persian_100_CI_AI;"
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
    Write-Success "Database '$targetDb' is ready."

    # Execute BPMS_DB_Schema.sql if tables do not exist yet and schema file is present
    if ($SchemaSqlPath) {
        $dbConn = New-Object System.Data.SqlClient.SqlConnection($SqlConnectionString)
        $dbConn.Open()
        $checkCmd = $dbConn.CreateCommand()
        $checkCmd.CommandText = "SELECT OBJECT_ID('dbo.AppUsers', 'U')"
        $tableExists = $checkCmd.ExecuteScalar()
        if ($tableExists -is [DBNull] -or $null -eq $tableExists) {
            Write-Info "Applying database schema from $SchemaSqlPath..."
            $sqlScript = Get-Content $SchemaSqlPath -Raw -Encoding UTF8
            $batches = $sqlScript -split "(?m)^\s*GO\s*$"
            foreach ($batch in $batches) {
                $trimmed = $batch.Trim()
                if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
                if ($trimmed -match "(?i)\bCREATE\s+DATABASE\b") { continue }

                $trimmed = $trimmed -replace "(?im)^\s*USE\s+\[?BPMS_DB\]?\s*;?\s*$", ""
                $trimmed = $trimmed.Trim()

                if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                    $batchCmd = $dbConn.CreateCommand()
                    $batchCmd.CommandText = $trimmed
                    $batchCmd.ExecuteNonQuery() | Out-Null
                }
            }
            Write-Success "Database tables created from BPMS_DB_Schema.sql."
        }
        $dbConn.Close()
    }

    $targetDll = Join-Path $PublishDir "BPMS.Server.dll"
    if (-not (Test-Path $targetDll) -and (Test-Path $ServerDir)) {
        $fallbackDlls = @(
            (Join-Path $ServerDir "bin\Release\net8.0\BPMS.Server.dll"),
            (Join-Path $ServerDir "bin\Debug\net8.0\BPMS.Server.dll")
        )
        $targetDll = $fallbackDlls | Where-Object { Test-Path $_ } | Select-Object -First 1
    }

    if ($targetDll -and (Test-Path $targetDll)) {
        $prevAspNetEnv = $env:ASPNETCORE_ENVIRONMENT
        $env:ASPNETCORE_ENVIRONMENT = "Production"
        Push-Location (Split-Path $targetDll -Parent)
        try {
            if ($ResetAdminPass) {
                Write-Info "Running application schema verification, seeding & resetting 'local_admin' password (--init-db --seed --reset-admin-password)..."
                $env:BPMS_RESET_ADMIN_PASSWORD = $NewAdminPassword
                try {
                    & dotnet $targetDll --init-db --seed --reset-admin-password
                } finally {
                    Remove-Item Env:\BPMS_RESET_ADMIN_PASSWORD -ErrorAction SilentlyContinue
                }
            } else {
                Write-Info "Running application schema verification & seeding (--init-db --seed)..."
                Remove-Item Env:\BPMS_RESET_ADMIN_PASSWORD -ErrorAction SilentlyContinue
                & dotnet $targetDll --init-db --seed
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Err "Database initialization and admin seeding failed with exit code $LASTEXITCODE."
                exit 1
            }
            Write-Success "Database schema verified and initial admin user (local_admin) seeded."
        } finally {
            Remove-Item Env:\BPMS_RESET_ADMIN_PASSWORD -ErrorAction SilentlyContinue
            Pop-Location
            if ($null -eq $prevAspNetEnv) {
                Remove-Item Env:\ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
            } else {
                $env:ASPNETCORE_ENVIRONMENT = $prevAspNetEnv
            }
        }
    } else {
        Write-Warn "BPMS.Server.dll not found for automatic DB initialization (--init-db --seed skipped)."
    }
}

# -----------------------------------------------------------------------------
# 5. Configure IIS Website & Application Pool
# -----------------------------------------------------------------------------
if (-not $SkipIIS) {
    Write-Step "Step 5: Configuring IIS Website & Application Pool"

    Import-Module WebAdministration -ErrorAction Stop

    # Stop existing Website and AppPool first to release file locks on DLLs
    if (Test-Path "IIS:\Sites\$SiteName") {
        Write-Info "Stopping existing IIS Website '$SiteName' to release file locks..."
        try { Stop-WebSite -Name $SiteName -ErrorAction SilentlyContinue } catch {}
    }

    if (Test-Path "IIS:\AppPools\$AppPoolName") {
        $poolState = (Get-WebAppPoolState -Name $AppPoolName).Value
        if ($poolState -ne "Stopped") {
            Write-Info "Stopping Application Pool '$AppPoolName'..."
            try { Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue } catch {}
            Start-Sleep -Seconds 3
        }
    }

    if (-not (Test-Path $PhysicalPath)) {
        New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
    }

    Write-Info "Deploying application files to $PhysicalPath..."
    Copy-Item -Path "$PublishDir\*" -Destination $PhysicalPath -Recurse -Force
    Write-Success "Application files deployed to $PhysicalPath."

    Write-Info "Applying NTFS permissions for IIS_IUSRS..."
    $acl = Get-Acl $PhysicalPath
    $permission = "IIS_IUSRS", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $PhysicalPath -AclObject $acl
    Write-Success "NTFS permissions applied successfully."

    if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
        New-WebAppPool -Name $AppPoolName | Out-Null
    }

    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "managedRuntimeVersion" -Value ""
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "startMode" -Value "AlwaysRunning"
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "processModel.idleTimeout" -Value ([TimeSpan]::Zero)
    Write-Success "Application Pool configured (No Managed Code, AlwaysRunning, IdleTimeout=0)."

    if (Test-Path "IIS:\Sites\$SiteName") {
        Set-ItemProperty "IIS:\Sites\$SiteName" -Name "physicalPath" -Value $PhysicalPath
        Set-ItemProperty "IIS:\Sites\$SiteName" -Name "applicationPool" -Value $AppPoolName
        Remove-WebBinding -Name $SiteName -ErrorAction SilentlyContinue
        New-WebBinding -Name $SiteName -Protocol "http" -Port $Port | Out-Null
    } else {
        if ($Port -eq 80 -and (Test-Path "IIS:\Sites\Default Web Site")) {
            try {
                Stop-WebSite -Name "Default Web Site" -ErrorAction SilentlyContinue
            } catch {
                Write-Info "Default Web Site is already stopped or inactive."
            }
        }
        New-WebSite -Name $SiteName -Port $Port -PhysicalPath $PhysicalPath -ApplicationPool $AppPoolName | Out-Null
    }

    if ($EnableHttps -and -not [string]::IsNullOrWhiteSpace($CertThumbprint)) {
        if (-not [string]::IsNullOrWhiteSpace($HostName)) {
            New-WebBinding -Name $SiteName -Protocol "https" -Port 443 -IPAddress "*" -HostHeader $HostName -SslFlags 1 | Out-Null
            $httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" -Port 443 | Where-Object { $_.bindingInformation -like "*:443:$HostName" } | Select-Object -First 1
        } else {
            New-WebBinding -Name $SiteName -Protocol "https" -Port 443 -IPAddress "*" | Out-Null
            $httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" -Port 443 | Select-Object -First 1
        }

        if ($httpsBinding) {
            try {
                $httpsBinding.AddSslCertificate($CertThumbprint, "My")
                Write-Success "Bound SSL certificate ($CertThumbprint) to IIS HTTPS port 443$(if ($HostName) { " (SNI: $HostName)" })."
            } catch {
                Write-Warn "Failed to bind SSL certificate automatically via WebBinding API: $_. Bind port 443 in IIS Manager manually if needed."
            }
        }

        try {
            $fwRuleName = "NovaFlow BPMS HTTPS (TCP 443)"
            $existingFwRule = Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
            if (-not $existingFwRule) {
                New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Any | Out-Null
                Write-Success "Windows Firewall opened for Inbound TCP Port 443."
            } else {
                Enable-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue | Out-Null
                Write-Info "Windows Firewall rule '$fwRuleName' verified enabled."
            }
        } catch {
            Write-Warn "Failed to configure Windows Firewall rule for TCP 443: $_"
        }
    }

    try { Set-ItemProperty "IIS:\Sites\$SiteName" -Name "preloadEnabled" -Value $true -ErrorAction SilentlyContinue } catch {}

    try { Start-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue } catch {}
    try { Start-WebSite -Name $SiteName -ErrorAction SilentlyContinue } catch {}
    Write-Success "Website '$SiteName' started and running (HTTP Port: $Port$(if ($EnableHttps) { ', HTTPS Port: 443' }))."
}

# Cleanup staging directory
Remove-Item -Path $PublishDir -Recurse -Force -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# 6. Deployment Summary
# -----------------------------------------------------------------------------
Write-Step "DEPLOYMENT COMPLETED SUCCESSFULLY - BPMS / BRMS Platform"
$summaryUrl = if ($EnableHttps) {
    $httpsHost = if ($HostName) { $HostName } else { "localhost" }
    "https://$httpsHost  (HTTP Port $Port redirects automatically to HTTPS)"
} else {
    "http://localhost:$Port"
}
$summaryPasswordLine = if ($ResetAdminPass) {
    "Password: $NewAdminPassword (Reset applied)"
} else {
    "Password: Unchanged (or 'Admin@123456' if fresh install)"
}
Write-Host @"
-----------------------------------------------------------------
  Portal URL:
  $summaryUrl

  Initial Administrator Account (Local Admin):
  Username: local_admin
  $summaryPasswordLine
-----------------------------------------------------------------
"@ -ForegroundColor Green