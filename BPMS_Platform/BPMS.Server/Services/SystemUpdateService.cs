using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.Models.Dtos;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public interface ISystemUpdateService
{
    Task<UpdateCheckResultDto> CheckForUpdatesAsync(bool force = false, CancellationToken ct = default);
    Task<UpdateStatusDto> StartUpdateAsync(string healthCheckUrl, CancellationToken ct = default);
    Task<UpdateStatusDto> GetUpdateStatusAsync();
}

public class SystemUpdateService : ISystemUpdateService
{
    private const string RepoOwner = "NazemiSh";
    private const string RepoName = "NovaFlow-BPMS";
    private const string GithubReleasesApiUrl = $"https://api.github.com/repos/{RepoOwner}/{RepoName}/releases/latest";
    private const string RepoUrl = $"https://github.com/{RepoOwner}/{RepoName}";
    private const string UserAgentHeader = "NovaFlow-BPMS-Updater";

    private static UpdateCheckResultDto? _cachedResult;
    private static DateTime _lastCheckUtc = DateTime.MinValue;
    private static readonly SemaphoreSlim _checkLock = new(1, 1);
    private static readonly SemaphoreSlim _updateLock = new(1, 1);

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _configuration;
    private readonly ApplicationDbContext _dbContext;
    private readonly IBackupService _backupService;
    private readonly ILogger<SystemUpdateService> _logger;

    public SystemUpdateService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment env,
        IConfiguration configuration,
        ApplicationDbContext dbContext,
        IBackupService backupService,
        ILogger<SystemUpdateService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _env = env;
        _configuration = configuration;
        _dbContext = dbContext;
        _backupService = backupService;
        _logger = logger;
    }

    public static string GetCurrentAppVersion()
    {
        var asm = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();
        var infoVer = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(infoVer))
        {
            var clean = infoVer.Split('+')[0].Trim().TrimStart('v', 'V');
            if (!string.IsNullOrWhiteSpace(clean))
                return clean;
        }
        return asm.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    public async Task<UpdateCheckResultDto> CheckForUpdatesAsync(bool force = false, CancellationToken ct = default)
    {
        if (!force && _cachedResult != null && (DateTime.UtcNow - _lastCheckUtc) < TimeSpan.FromHours(6))
        {
            return _cachedResult;
        }

        await _checkLock.WaitAsync(ct);
        try
        {
            if (!force && _cachedResult != null && (DateTime.UtcNow - _lastCheckUtc) < TimeSpan.FromHours(6))
            {
                return _cachedResult;
            }

            var currentVersion = GetCurrentAppVersion();
            var result = new UpdateCheckResultDto
            {
                CurrentVersion = currentVersion,
                CheckedAt = DateTime.UtcNow,
                RepositoryUrl = RepoUrl,
                ReleaseUrl = $"{RepoUrl}/releases",
                Status = "Offline",
                IsOffline = true,
                HasUpdate = false,
                Message = "سرور به اینترنت دسترسی ندارد (شبکه ایزوله اینترانتی)."
            };

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgentHeader);
                client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");

                using var response = await client.GetAsync(GithubReleasesApiUrl, ct);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(ct);
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("tag_name", out var tagProp))
                    {
                        var latestVersion = (tagProp.GetString() ?? string.Empty).Trim().TrimStart('v', 'V');
                        result.LatestVersion = latestVersion;
                        result.Status = "Online";
                        result.IsOffline = false;
                        result.Title = root.TryGetProperty("name", out var nProp) ? nProp.GetString() : $"NovaFlow BPMS v{latestVersion}";
                        result.ReleaseUrl = root.TryGetProperty("html_url", out var hProp) && !string.IsNullOrWhiteSpace(hProp.GetString())
                            ? hProp.GetString()
                            : $"{RepoUrl}/releases/tag/v{latestVersion}";
                        result.PublishedAt = root.TryGetProperty("published_at", out var pProp) ? pProp.GetString() : null;
                        result.ReleaseDate = result.PublishedAt;

                        if (root.TryGetProperty("assets", out var assetsProp) && assetsProp.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var asset in assetsProp.EnumerateArray())
                            {
                                var assetName = asset.TryGetProperty("name", out var anProp) ? anProp.GetString() ?? "" : "";
                                if (assetName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                                {
                                    result.AssetDownloadUrl = asset.TryGetProperty("browser_download_url", out var dlProp) ? dlProp.GetString() : null;
                                    if (asset.TryGetProperty("size", out var szProp) && szProp.TryGetInt64(out var sz))
                                    {
                                        result.AssetSize = sz;
                                    }
                                    break;
                                }
                            }
                        }

                        result.HasUpdate = IsNewerSemVer(latestVersion, currentVersion);
                        result.Message = result.HasUpdate
                            ? $"نسخه جدید v{latestVersion} در مخزن GitHub در دسترس است."
                            : "سامانه در آخرین نسخه منتشرشده قرار دارد.";
                    }
                }
                else
                {
                    _logger.LogWarning("GitHub releases API returned status {StatusCode}", response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug("GitHub update check failed (offline/network): {Message}", ex.Message);
            }

            _cachedResult = result;
            _lastCheckUtc = DateTime.UtcNow;
            return result;
        }
        finally
        {
            _checkLock.Release();
        }
    }

    public async Task<UpdateStatusDto> GetUpdateStatusAsync()
    {
        var statusPath = GetStatusFilePath();
        if (!File.Exists(statusPath))
        {
            return new UpdateStatusDto
            {
                State = "Idle",
                Step = 0,
                CurrentVersion = GetCurrentAppVersion(),
                Message = string.Empty
            };
        }

        try
        {
            var json = await File.ReadAllTextAsync(statusPath);
            var dto = JsonSerializer.Deserialize<UpdateStatusDto>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return dto ?? new UpdateStatusDto { State = "Idle", CurrentVersion = GetCurrentAppVersion() };
        }
        catch
        {
            return new UpdateStatusDto { State = "Idle", CurrentVersion = GetCurrentAppVersion() };
        }
    }

    public async Task<UpdateStatusDto> StartUpdateAsync(string healthCheckUrl, CancellationToken ct = default)
    {
        if (!await _updateLock.WaitAsync(0, ct))
        {
            throw new InvalidOperationException("فرآیند به‌روزرسانی هم‌اکنون در حال اجرا است.");
        }

        var currentVersion = GetCurrentAppVersion();
        var startedAt = DateTime.UtcNow;

        try
        {
            var existing = await GetUpdateStatusAsync();
            if (existing.State is "Downloading" or "BackingUp" or "Deploying" or "Verifying"
                && existing.UpdatedAt.HasValue
                && (DateTime.UtcNow - existing.UpdatedAt.Value) < TimeSpan.FromMinutes(10))
            {
                throw new InvalidOperationException("یک عملیات به‌روزرسانی فعال در حال انجام است.");
            }

            // بررسی آخرین نسخه روی GitHub
            var check = await CheckForUpdatesAsync(force: true, ct);
            if (check.IsOffline)
            {
                throw new InvalidOperationException("ارتباط با GitHub برقرار نشد. سرور در حالت آفلاین است.");
            }
            if (!check.HasUpdate || string.IsNullOrWhiteSpace(check.LatestVersion))
            {
                throw new InvalidOperationException("سامانه هم‌اکنون در آخرین نسخه منتشرشده قرار دارد.");
            }
            if (string.IsNullOrWhiteSpace(check.AssetDownloadUrl))
            {
                throw new InvalidOperationException("فایل بسته انتشار (.zip) در Release یافت نشد.");
            }

            var targetVersion = check.LatestVersion;
            var updatesDir = Path.Combine(GetAppDataDir(), "Updates");
            var backupsDir = Path.Combine(GetAppDataDir(), "Backups");
            Directory.CreateDirectory(updatesDir);
            Directory.CreateDirectory(backupsDir);

            // گام ۱: دانلود و تایید بسته
            await WriteStatusAsync(new UpdateStatusDto
            {
                State = "Downloading",
                Step = 1,
                CurrentVersion = currentVersion,
                TargetVersion = targetVersion,
                Message = $"در حال دانلود و بررسی سلامت بسته نسخه v{targetVersion}...",
                StartedAt = startedAt,
                UpdatedAt = DateTime.UtcNow
            });

            var zipPath = Path.Combine(updatesDir, $"NovaFlow-Update-{targetVersion}.zip");
            var extractRoot = Path.Combine(updatesDir, $"Extracted_{targetVersion}");

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(10);
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgentHeader);

            using (var downloadResp = await client.GetAsync(check.AssetDownloadUrl, HttpCompletionOption.ResponseHeadersRead, ct))
            {
                downloadResp.EnsureSuccessStatusCode();
                await using var fs = new FileStream(zipPath, FileMode.Create, FileAccess.Write, FileShare.None);
                await downloadResp.Content.CopyToAsync(fs, ct);
            }

            // تایید سلامت آرشیو ZIP و وجود پوشه App
            bool hasAppFolder = false;
            using (var archive = ZipFile.OpenRead(zipPath))
            {
                foreach (var entry in archive.Entries)
                {
                    var normalized = entry.FullName.Replace('\\', '/');
                    if (normalized.StartsWith("App/", StringComparison.OrdinalIgnoreCase))
                    {
                        hasAppFolder = true;
                        break;
                    }
                }
            }

            if (!hasAppFolder)
            {
                throw new InvalidOperationException("ساختار فایل فشرده نامعتبر است (پوشه App در آرشیو یافت نشد).");
            }

            if (Directory.Exists(extractRoot))
            {
                Directory.Delete(extractRoot, true);
            }
            ZipFile.ExtractToDirectory(zipPath, extractRoot, overwriteFiles: true);

            var extractedAppPath = Path.Combine(extractRoot, "App");
            if (!Directory.Exists(extractedAppPath) || !File.Exists(Path.Combine(extractedAppPath, "BPMS.Server.dll")))
            {
                throw new InvalidOperationException("فایل‌های اجرایی هسته (BPMS.Server.dll) در بسته استخراج‌شده یافت نشد.");
            }

            // گام ۲: بکاپ‌گیری اجباری از دیتابیس و فایل‌های فعلی سایت
            await WriteStatusAsync(new UpdateStatusDto
            {
                State = "BackingUp",
                Step = 2,
                CurrentVersion = currentVersion,
                TargetVersion = targetVersion,
                Message = "در حال تهیه نسخه پشتیبان کامل از پایگاه‌داده و فایل‌های سامانه...",
                StartedAt = startedAt,
                UpdatedAt = DateTime.UtcNow
            });

            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var logicalBackupPath = Path.Combine(backupsDir, $"PreUpdate_v{currentVersion}_to_v{targetVersion}_{timestamp}.bpmsbackup");
            bool logicalBackupSucceeded = false;
            try
            {
                var backupBytes = await _backupService.CreateBackupZipAsync(
                    new List<string> { "users", "forms", "data", "settings", "uploads" },
                    $"Pre-update backup v{currentVersion} to v{targetVersion}",
                    "PreUpdate");
                await File.WriteAllBytesAsync(logicalBackupPath, backupBytes, ct);
                logicalBackupSucceeded = true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Logical .bpmsbackup creation failed before OTA update");
            }

            try
            {
                await BackupDatabaseNativeAsync(currentVersion, targetVersion, timestamp, ct);
            }
            catch (Exception ex)
            {
                if (logicalBackupSucceeded)
                {
                    _logger.LogWarning(ex, "SQL Server native BACKUP DATABASE failed, continuing with .bpmsbackup fallback at {Path}", logicalBackupPath);
                }
                else
                {
                    throw new InvalidOperationException("تهیه نسخه پشتیبان از پایگاه‌داده ناموفق بود: " + ex.Message, ex);
                }
            }

            var appBackupDir = Path.Combine(backupsDir, $"PreUpdate_App_{timestamp}");
            CopySiteFilesForBackup(_env.ContentRootPath, appBackupDir);

            // گام ۳: اجرای عامل مستقل خارج از درخت فرآیند IIS
            await WriteStatusAsync(new UpdateStatusDto
            {
                State = "Deploying",
                Step = 3,
                CurrentVersion = currentVersion,
                TargetVersion = targetVersion,
                Message = "در حال راه‌اندازی عامل به‌روزرسانی مستقل و جایگزینی فایل‌ها...",
                StartedAt = startedAt,
                UpdatedAt = DateTime.UtcNow
            });

            var agentScriptSource = Path.Combine(_env.ContentRootPath, "Scripts", "Update-Agent.ps1");
            if (!File.Exists(agentScriptSource))
            {
                throw new FileNotFoundException("اسکریپت عامل به‌روزرسانی (Update-Agent.ps1) یافت نشد.", agentScriptSource);
            }

            var agentScriptRun = Path.Combine(updatesDir, "Update-Agent.ps1");
            File.Copy(agentScriptSource, agentScriptRun, overwrite: true);

            LaunchDetachedUpdateAgent(
                agentScriptRun,
                _env.ContentRootPath,
                extractedAppPath,
                appBackupDir,
                GetStatusFilePath(),
                healthCheckUrl,
                targetVersion);

            return await GetUpdateStatusAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OTA update preparation failed");
            var failStatus = new UpdateStatusDto
            {
                State = "Failed",
                Step = 0,
                CurrentVersion = currentVersion,
                Message = "عملیات به‌روزرسانی متوقف شد: " + ex.Message,
                Error = ex.Message,
                StartedAt = startedAt,
                UpdatedAt = DateTime.UtcNow
            };
            await WriteStatusAsync(failStatus);
            throw;
        }
        finally
        {
            _updateLock.Release();
        }
    }

    private async Task BackupDatabaseNativeAsync(string currentVersion, string targetVersion, string timestamp, CancellationToken ct)
    {
        var connStr = _configuration.GetConnectionString("BPMS_DB") ?? _dbContext.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connStr))
        {
            throw new InvalidOperationException("رشته اتصال پایگاه‌داده یافت نشد.");
        }

        var builder = new SqlConnectionStringBuilder(connStr);
        var dbName = builder.InitialCatalog;
        if (string.IsNullOrWhiteSpace(dbName))
        {
            throw new InvalidOperationException("نام پایگاه‌داده در رشته اتصال مشخص نیست.");
        }

        await using var conn = new SqlConnection(connStr);
        await conn.OpenAsync(ct);

        string? defaultBackupDir = null;
        await using (var pathCmd = new SqlCommand("SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(512))", conn))
        {
            var raw = await pathCmd.ExecuteScalarAsync(ct);
            defaultBackupDir = raw?.ToString()?.Trim();
        }

        if (string.IsNullOrWhiteSpace(defaultBackupDir))
        {
            throw new InvalidOperationException("مسیر پیش‌فرض بکاپ SQL Server (InstanceDefaultBackupPath) در دسترس نیست.");
        }

        var backupFileName = $"BPMS_DB_PreUpdate_v{currentVersion}_to_v{targetVersion}_{timestamp}.bak";
        var backupFilePath = Path.Combine(defaultBackupDir, backupFileName);

        var safeDbName = dbName.Replace("]", "]]");
        var sql = $"BACKUP DATABASE [{safeDbName}] TO DISK = @BackupPath WITH FORMAT, INIT, NAME = @BackupName;";
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 300 };
        cmd.Parameters.AddWithValue("@BackupPath", backupFilePath);
        cmd.Parameters.AddWithValue("@BackupName", $"PreUpdate Backup of {dbName}");
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static void CopySiteFilesForBackup(string sourceRoot, string destRoot)
    {
        Directory.CreateDirectory(destRoot);
        foreach (var dirPath in Directory.GetDirectories(sourceRoot, "*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceRoot, dirPath);
            if (IsExcludedFromBackup(rel)) continue;
            Directory.CreateDirectory(Path.Combine(destRoot, rel));
        }

        foreach (var filePath in Directory.GetFiles(sourceRoot, "*.*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(sourceRoot, filePath);
            if (IsExcludedFromBackup(rel)) continue;
            var destFile = Path.Combine(destRoot, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(destFile)!);
            File.Copy(filePath, destFile, overwrite: true);
        }
    }

    private static bool IsExcludedFromBackup(string relativePath)
    {
        var norm = relativePath.Replace('\\', '/').TrimStart('/');
        return norm.Equals("App_Data", StringComparison.OrdinalIgnoreCase)
               || norm.StartsWith("App_Data/", StringComparison.OrdinalIgnoreCase)
               || norm.Equals("wwwroot/uploads", StringComparison.OrdinalIgnoreCase)
               || norm.StartsWith("wwwroot/uploads/", StringComparison.OrdinalIgnoreCase);
    }

    private void LaunchDetachedUpdateAgent(
        string scriptPath,
        string sitePath,
        string extractedAppPath,
        string backupAppPath,
        string statusFilePath,
        string healthCheckUrl,
        string targetVersion)
    {
        string Esc(string v) => v.Replace("'", "''");
        var innerPs = $"& '{Esc(scriptPath)}' -SitePath '{Esc(sitePath)}' -ExtractedAppPath '{Esc(extractedAppPath)}' -BackupAppPath '{Esc(backupAppPath)}' -StatusFilePath '{Esc(statusFilePath)}' -HealthCheckUrl '{Esc(healthCheckUrl)}' -TargetVersion '{Esc(targetVersion)}'";
        var encodedCommand = Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(innerPs));
        var targetCmd = $"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encodedCommand}";

        var cimCommand = $"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{ CommandLine = '{Esc(targetCmd)}' }}";
        var cimEncoded = Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(cimCommand));

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {cimEncoded}",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("اجرای فرآیند مستقل به‌روزرسانی ناموفق بود.");
        proc.WaitForExit(10000);
        if (proc.ExitCode != 0)
        {
            var err = proc.StandardError.ReadToEnd();
            throw new InvalidOperationException($"خطا در راه‌اندازی عامل مستقل به‌روزرسانی: {err}");
        }
    }

    private string GetAppDataDir() => Path.Combine(_env.ContentRootPath, "App_Data");
    private string GetStatusFilePath() => Path.Combine(GetAppDataDir(), "Updates", "update-status.json");

    private async Task WriteStatusAsync(UpdateStatusDto status)
    {
        var path = GetStatusFilePath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(status, _jsonOptions);
        await File.WriteAllTextAsync(path, json);
    }

    private static bool IsNewerSemVer(string latestStr, string currentStr)
    {
        var cleanLatest = latestStr.Trim().TrimStart('v', 'V').Split('-', '+')[0];
        var cleanCurrent = currentStr.Trim().TrimStart('v', 'V').Split('-', '+')[0];

        if (Version.TryParse(cleanLatest, out var vLatest) && Version.TryParse(cleanCurrent, out var vCurrent))
        {
            return vLatest > vCurrent;
        }

        return string.Compare(cleanLatest, cleanCurrent, StringComparison.OrdinalIgnoreCase) > 0;
    }
}
