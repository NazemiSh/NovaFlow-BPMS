<#
.SYNOPSIS
    Clean Uninstallation Script for BPMS / BRMS Platform on Windows Server (IIS + Files + Optional SQL DB)

.DESCRIPTION
    Safely removes the BPMS / BRMS Platform from a Windows Server:
    1. Verifies Administrator privileges
    2. Stops and removes the IIS Website and Application Pool
    3. Removes physical application files from C:\inetpub\wwwroot\BPMS (with optional backup of uploads/appsettings)
    4. Optionally drops the SQL Server database (BPMS_DB) upon explicit confirmation

.EXAMPLE
    .\Uninstall-BPMS.ps1
#>

[CmdletBinding()]
param(
    [string]$SiteName = "BPMS",
    [string]$AppPoolName = "BPMSAppPool",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\BPMS"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# -----------------------------------------------------------------------------
# 0. Immediate Administrator Check
# -----------------------------------------------------------------------------
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "`n=================================================================" -ForegroundColor Red
    Write-Host "  [ERROR] ADMINISTRATOR PRIVILEGES REQUIRED" -ForegroundColor Red
    Write-Host "=================================================================" -ForegroundColor Red
    Write-Host "  Please run PowerShell as Administrator to uninstall BPMS." -ForegroundColor Yellow
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

Write-Step "BPMS / BRMS Platform - Uninstallation Wizard"
Write-Warn "This wizard will remove the IIS Website ('$SiteName'), AppPool ('$AppPoolName'), and files in '$PhysicalPath'."
$confirm = Read-Host "  > Are you sure you want to proceed? (YES/NO)"
if ($confirm -ne "YES" -and $confirm -ne "yes" -and $confirm -ne "Y" -and $confirm -ne "y") {
    Write-Info "Uninstallation cancelled by user."
    exit 0
}

Write-Host ""
Write-Warn "MANDATORY BACKUP CHECK: Full process forms, workflow history, submissions, and attachments can only be restored from a '.bpmsbackup' file."
$backupConfirm = Read-Host "  > Have you already taken a full backup (.bpmsbackup) from the 'Backup & Restore' tab in the portal? (YES/NO)"
if ($backupConfirm -ne "YES" -and $backupConfirm -ne "yes" -and $backupConfirm -ne "Y" -and $backupConfirm -ne "y") {
    Write-Warn "Uninstallation aborted! Please sign in to the portal as Admin, open the 'پشتیبان‌گیری و بازیابی (Backup & Restore)' tab, download a full '.bpmsbackup' archive first, and then re-run Uninstall-BPMS.ps1."
    exit 0
}

# Read SQL Connection String before deleting appsettings.json (in case user wants to drop DB)
$savedConnString = ""
$appSettingsFile = Join-Path $PhysicalPath "appsettings.json"
if (Test-Path $appSettingsFile) {
    try {
        $json = Get-Content $appSettingsFile -Raw | ConvertFrom-Json
        $savedConnString = $json.ConnectionStrings.BPMS_DB
    } catch {}
}

# -----------------------------------------------------------------------------
# 1. Remove IIS Website & Application Pool
# -----------------------------------------------------------------------------
Write-Step "Step 1: Removing IIS Website & Application Pool"
Import-Module WebAdministration -ErrorAction SilentlyContinue

if (Test-Path "IIS:\Sites\$SiteName") {
    Stop-WebSite -Name $SiteName -ErrorAction SilentlyContinue
    Remove-WebSite -Name $SiteName
    Write-Success "IIS Website '$SiteName' stopped and removed."
} else {
    Write-Info "IIS Website '$SiteName' was not found."
}

if (Test-Path "IIS:\AppPools\$AppPoolName") {
    $poolState = (Get-WebAppPoolState -Name $AppPoolName).Value
    if ($poolState -ne "Stopped") {
        Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    Remove-WebAppPool -Name $AppPoolName
    Write-Success "IIS Application Pool '$AppPoolName' removed."
} else {
    Write-Info "IIS Application Pool '$AppPoolName' was not found."
}

# -----------------------------------------------------------------------------
# 2. Remove Physical Application Files
# -----------------------------------------------------------------------------
Write-Step "Step 2: Removing Physical Application Files"
if (Test-Path $PhysicalPath) {
    $backupChoice = Read-Host "  > Do you want to backup 'uploads', 'App_Data\Backups' & 'appsettings.json' to Desktop before deletion? (Y/N) [Default: Y]"
    if ($backupChoice -ne "N" -and $backupChoice -ne "n") {
        $desktopPath = [Environment]::GetFolderPath("Desktop")
        $backupDir = Join-Path $desktopPath "BPMS_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

        $uploadsPath = Join-Path $PhysicalPath "wwwroot\uploads"
        if (Test-Path $uploadsPath) {
            Copy-Item -Path $uploadsPath -Destination (Join-Path $backupDir "uploads") -Recurse -Force
        }
        $appDataBackupsPath = Join-Path $PhysicalPath "App_Data\Backups"
        if (Test-Path $appDataBackupsPath) {
            $backupAppDataDir = Join-Path $backupDir "App_Data"
            New-Item -ItemType Directory -Path $backupAppDataDir -Force | Out-Null
            Copy-Item -Path $appDataBackupsPath -Destination (Join-Path $backupAppDataDir "Backups") -Recurse -Force
        }
        if (Test-Path $appSettingsFile) {
            Copy-Item -Path $appSettingsFile -Destination $backupDir -Force
        }
        Write-Success "Backup saved to: $backupDir"
    }

    Remove-Item -Path $PhysicalPath -Recurse -Force
    Write-Success "Directory '$PhysicalPath' removed completely."
} else {
    Write-Info "Physical path '$PhysicalPath' does not exist."
}

# -----------------------------------------------------------------------------
# 3. Optional Database Removal
# -----------------------------------------------------------------------------
Write-Step "Step 3: SQL Server Database Cleanup (Optional)"
Write-Warn "WARNING: Dropping the database will permanently delete all forms, workflows, submissions, and users."
$dropDb = Read-Host "  > Do you want to DROP the SQL Server database? (DROP/NO) [Default: NO]"

if ($dropDb -eq "DROP") {
    if ([string]::IsNullOrWhiteSpace($savedConnString)) {
        $sqlServer = Read-Host "  > Enter SQL Server Address [Default: localhost]"
        if ([string]::IsNullOrWhiteSpace($sqlServer)) { $sqlServer = "localhost" }
        $dbName = Read-Host "  > Enter Database Name to drop [Default: BPMS_DB]"
        if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "BPMS_DB" }
        $sqlUser = Read-Host "  > Enter SQL Username [Default: sa]"
        if ([string]::IsNullOrWhiteSpace($sqlUser)) { $sqlUser = "sa" }
        $secPass = Read-Host "  > Enter Password for '$sqlUser'" -AsSecureString
        $plainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass))
        $savedConnString = "Server=$sqlServer;Database=$dbName;User Id=$sqlUser;Password=$plainPass;TrustServerCertificate=True;"
    }

    try {
        $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder($savedConnString)
        $targetDb = $builder["Initial Catalog"]
        if ([string]::IsNullOrWhiteSpace($targetDb)) { $targetDb = $builder["Database"] }
        $builder["Initial Catalog"] = "master"

        $conn = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "IF DB_ID('$targetDb') IS NOT NULL BEGIN ALTER DATABASE [$targetDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$targetDb]; END"
        $cmd.ExecuteNonQuery() | Out-Null
        $conn.Close()
        Write-Success "Database '$targetDb' has been permanently dropped."
    } catch {
        Write-Warn "Failed to drop database automatically: $($_.Exception.Message)"
        Write-Info "You can drop it manually in SQL Server Management Studio (SSMS)."
    }
} else {
    Write-Info "Database was preserved intact."
}

Write-Step "UNINSTALLATION COMPLETED"
Write-Success "BPMS / BRMS Platform has been removed from this server."